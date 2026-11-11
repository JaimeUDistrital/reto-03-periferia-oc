/**
 * API HTTP (Hono). Testeable con app.request(). Eventos SSE: `event: <tipo>` y `data: <EventoAgente en JSON>`.
 *  POST /api/chat       SSE, agente con LLM
 *  POST /api/evaluar    SSE, «Evaluar sin IA»
 *  POST /api/confirmar  JSON, confirmación humana (HITL)
 *  GET  /api/solicitudes, GET /api/salud, estáticos de dist/web
 */
import { randomUUID } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import * as z from "zod";
import { cargarPrompt } from "../agent/prompt";
import { dictamenSeguro, ejecutarToolConEventos, eventoConfirmacion } from "../agent/ejecutar";
import { ejecutarAgente } from "../agent/loop";
import type { EventoAgente, LlmPort, NucleoOC, ToolDef } from "../domain/contratos";
import { firmarToken, verificarToken, type Reloj } from "../security/hitl";
import { LIMITES, crearRateLimiter, type RateLimiter } from "../security/limites";
import { redact, redactarError } from "../security/redact";
import { ChatBodySchema, ConfirmarBodySchema, EvaluarBodySchema } from "./esquemas";

export interface VentanaLimite {
  max: number;
  ventanaMs: number;
}

export interface DepsApp {
  nucleo: NucleoOC;
  /** undefined = sin GEMINI_API_KEY: el chat responde un error claro y /api/evaluar sigue funcionando. */
  llm?: LlmPort;
  hitlSecret: string;
  ahora?: Reloj;
  /** Destino de logs; todo pasa por redact(). Por defecto console.error. */
  registrar?: (mensaje: string) => void;
  dirEstaticos?: string;
  /** Detrás de un proxy (Railway, Vercel) la IP real es la última de X-Forwarded-For. */
  confiarProxy?: boolean;
  rateLimit?: { chat?: VentanaLimite; general?: VentanaLimite };
}

/** Tools cuyo resultado ya se muestra como dictamen en «Evaluar sin IA». */
const TOOLS_OMITIDAS_EN_EVALUAR = new Set(["evaluarSolicitud", "listarSolicitudes"]);

function aceptaSolicitudId(tool: ToolDef): boolean {
  const esquema = z.toJSONSchema(tool.entrada, { io: "input" }) as { properties?: Record<string, unknown> };
  return esquema.properties !== undefined && "solicitudId" in esquema.properties;
}

export function crearApp(deps: DepsApp): Hono {
  const { nucleo } = deps;
  const ahora = deps.ahora ?? Date.now;
  const confiarProxy = deps.confiarProxy ?? true;
  const registrar = (mensaje: string): void => (deps.registrar ?? ((m: string) => console.error(m)))(redact(mensaje));

  const limiterGeneral = crearRateLimiter({ max: 120, ventanaMs: 60_000, ...deps.rateLimit?.general });
  const limiterChat = crearRateLimiter({ max: 15, ventanaMs: 60_000, ...deps.rateLimit?.chat });

  const ipDe = (c: Context): string => {
    if (confiarProxy) {
      const reenviada = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
      if (reenviada) return reenviada;
    }
    try {
      return getConnInfo(c).remote.address ?? "desconocida";
    } catch {
      return "desconocida";
    }
  };

  const limitar = (limiter: RateLimiter): MiddlewareHandler => async (c, next) => {
    if (!limiter.permitir(ipDe(c))) {
      return c.json({ error: "Demasiadas peticiones. Espera un momento.", correlationId: randomUUID() }, 429, { "Retry-After": "60" });
    }
    await next();
    return undefined;
  };

  const app = new Hono();

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: LIMITES.maxBodyBytes,
      onError: (c) => c.json({ error: "Cuerpo demasiado grande", correlationId: randomUUID() }, 413),
    }),
  );
  app.use("/api/*", limitar(limiterGeneral));
  app.use("/api/chat", limitar(limiterChat));

  app.onError((error, c) => {
    const correlationId = randomUUID();
    registrar(`[${correlationId}] ${c.req.method} ${c.req.path}: ${redactarError(error)}`);
    return c.json({ error: "Error interno", correlationId }, 500);
  });

  async function leerBody<S extends z.ZodType>(c: Context, esquema: S): Promise<z.output<S> | Response> {
    let crudo: unknown;
    try {
      crudo = await c.req.json();
    } catch {
      return c.json({ error: "Cuerpo inválido: se esperaba JSON", correlationId: randomUUID() }, 400);
    }
    const r = esquema.safeParse(crudo);
    if (!r.success) {
      return c.json({ error: "Datos inválidos", detalle: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), correlationId: randomUUID() }, 400);
    }
    return r.data;
  }

  const firmar = (datos: { solicitudId: string; hash: string }): string => firmarToken(datos, deps.hitlSecret, ahora);

  // ── Lectura ──────────────────────────────────────────────────────────────
  app.get("/api/salud", (c) => c.json({ ok: true }));
  app.get("/api/solicitudes", async (c) => c.json({ solicitudes: await nucleo.listarSolicitudes() }));

  // ── Chat con IA (SSE) ────────────────────────────────────────────────────
  app.post("/api/chat", async (c) => {
    const body = await leerBody(c, ChatBodySchema);
    if (body instanceof Response) return body;
    return streamSSE(
      c,
      async (stream) => {
        const emitir = async (e: EventoAgente): Promise<void> => {
          await stream.writeSSE({ event: e.tipo, data: JSON.stringify(e) });
        };
        if (!deps.llm) {
          await emitir({
            tipo: "error",
            mensaje: "El asistente con IA no está configurado: falta GEMINI_API_KEY en el servidor. Puedes usar «Evaluar sin IA».",
            correlationId: randomUUID(),
          });
          await emitir({ tipo: "fin", historial: body.historial });
          return;
        }
        await ejecutarAgente({
          historial: body.historial,
          mensaje: body.mensaje,
          llm: deps.llm,
          nucleo,
          emitir,
          firmarToken: firmar,
          sistema: cargarPrompt(),
          registrar,
        });
      },
      async (error, stream) => {
        const correlationId = randomUUID();
        registrar(`[${correlationId}] /api/chat: ${redactarError(error)}`);
        await stream.writeSSE({ event: "error", data: JSON.stringify({ tipo: "error", mensaje: "Error interno", correlationId }) });
      },
    );
  });

  // ── Evaluar sin IA (SSE) ─────────────────────────────────────────────────
  app.post("/api/evaluar", async (c) => {
    const body = await leerBody(c, EvaluarBodySchema);
    if (body instanceof Response) return body;
    const { solicitudId } = body;
    if (!(await nucleo.listarSolicitudes()).includes(solicitudId)) {
      return c.json({ error: "Solicitud no encontrada", correlationId: randomUUID() }, 404);
    }
    return streamSSE(
      c,
      async (stream) => {
        const emitir = async (e: EventoAgente): Promise<void> => {
          await stream.writeSSE({ event: e.tipo, data: JSON.stringify(e) });
        };
        const validaciones = nucleo.herramientas.filter(
          (t) => !t.requiereConfirmacion && !TOOLS_OMITIDAS_EN_EVALUAR.has(t.nombre) && aceptaSolicitudId(t),
        );
        for (const [i, tool] of validaciones.entries()) {
          await ejecutarToolConEventos(tool, `eval-${i + 1}`, { solicitudId }, emitir);
        }

        const id = "eval-dictamen";
        await emitir({ tipo: "tool_call", id, nombre: "evaluarSolicitud", entrada: { solicitudId } });
        const inicio = performance.now();
        const dictamen = await nucleo.evaluarSolicitud(solicitudId);
        await emitir({
          tipo: "tool_result",
          id,
          nombre: "evaluarSolicitud",
          salida: dictamenSeguro(dictamen),
          ok: true,
          ms: Math.round(performance.now() - inicio),
        });
        const confirmacion = eventoConfirmacion(dictamen, firmar);
        if (confirmacion) await emitir(confirmacion);
        await emitir({ tipo: "fin", historial: [] });
      },
      async (error, stream) => {
        const correlationId = randomUUID();
        registrar(`[${correlationId}] /api/evaluar: ${redactarError(error)}`);
        await stream.writeSSE({ event: "error", data: JSON.stringify({ tipo: "error", mensaje: "Error interno", correlationId }) });
      },
    );
  });

  // ── Confirmación humana (HITL) ───────────────────────────────────────────
  app.post("/api/confirmar", async (c) => {
    const body = await leerBody(c, ConfirmarBodySchema);
    if (body instanceof Response) return body;

    const verificado = verificarToken(body.token, deps.hitlSecret, ahora);
    if (!verificado.ok) {
      const caducado = verificado.motivo === "caducado";
      return c.json(
        {
          error: caducado ? "La confirmación caducó. Vuelve a evaluar la solicitud." : "Token de confirmación inválido.",
          motivo: caducado ? "caducado" : "invalido",
          correlationId: randomUUID(),
        },
        401,
      );
    }
    const { solicitudId, hash } = verificado.payload;

    if (body.accion === "rechazar") {
      registrar(`HITL: ${solicitudId} rechazada por el usuario`);
      const evento: EventoAgente = { tipo: "mensaje", texto: "Confirmación rechazada. No se creó ninguna orden de compra." };
      return c.json(evento);
    }

    const dictamen = await nucleo.evaluarSolicitud(solicitudId);
    if (dictamen.hash !== hash || dictamen.decision !== "APROBABLE") {
      registrar(`HITL: ${solicitudId} el dictamen cambió desde la confirmación (decisión actual ${dictamen.decision})`);
      return c.json({ error: "El dictamen cambió desde que se pidió la confirmación. Vuelve a evaluar la solicitud.", correlationId: randomUUID() }, 409);
    }

    const orden = await nucleo.sap.crearOrdenCompra(solicitudId, dictamen);
    registrar(`HITL: ${solicitudId} aprobada, OC ${orden.numero}`);
    const evento: EventoAgente = { tipo: "oc_creada", orden };
    return c.json(evento);
  });

  app.all("/api/*", (c) => c.json({ error: "No encontrado" }, 404));
  app.use("/*", serveStatic({ root: deps.dirEstaticos ?? "./dist/web" }));

  return app;
}
