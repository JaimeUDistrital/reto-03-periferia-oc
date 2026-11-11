/**
 * API HTTP (Hono) y arranque. Testeable con app.request(). Eventos SSE: `event: <tipo>` y `data: <EventoChat en JSON>`.
 *  POST /api/chat          {sessionId, message, confirmar?} → SSE (agente con LLM)
 *  POST /api/evaluar       {caso, sessionId?}               → SSE («Revisar sin IA», sin LLM ni OC)
 *  GET  /api/sessions/:id  historial completo de la sesión
 *  GET  /api/health        {ok, provider, model, llm_configurado}  (nunca claves)
 *  GET  /api/casos         {casos: string[]}
 *  y los estáticos de dist/web.
 */
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import * as z from "zod";
import { crearBitacora } from "./agent/bitacora";
import { ChatBodySchema, EvaluarBodySchema, SessionIdSchema } from "./agent/esquemas";
import { crearRegistro, type RegistroHerramientas } from "./agent/herramientas";
import { ejecutarTurno, type ConfigTurno, type Emitir } from "./agent/loop";
import { cargarSistema } from "./agent/prompt";
import { revisarSinIA } from "./agent/revision";
import { crearAlmacenSesiones, type AlmacenSesiones } from "./agent/sesiones";
import { cargarEnv } from "./config/env";
import type { EventoChat } from "./domain/contratos-oc";
import type { LlmAdapter } from "./llm/adapter";
import { crearLlmGemini } from "./llm/gemini";
import { LIMITES, crearRateLimiter, type RateLimiter } from "./security/limites";
import { redact, redactarError } from "./security/redact";
import * as oc from "./tools/oc";

export interface VentanaLimite {
  max: number;
  ventanaMs: number;
}

export interface DepsApp {
  registro: RegistroHerramientas;
  /** undefined = sin clave del modelo: el chat responde un error claro y /api/evaluar sigue funcionando. */
  llm?: LlmAdapter;
  /** Proveedor y modelo configurados (para /api/health aunque no haya clave). */
  info: { proveedor: string; modelo: string };
  config: ConfigTurno;
  /** Raíz del proyecto: ctx.directory y base de fixtures/ y out/. */
  directory: string;
  /** Carpeta de salida (log.jsonl). Por defecto <directory>/out. */
  dirSalida?: string;
  sistema?: () => string;
  sesiones?: AlmacenSesiones;
  listarCasos?: () => Promise<string[]>;
  /** Destino de logs; todo pasa por redact(). Por defecto console.error. */
  registrar?: (mensaje: string) => void;
  dirEstaticos?: string;
  /** Detrás de un proxy la IP real es la última de X-Forwarded-For. */
  confiarProxy?: boolean;
  rateLimit?: { chat?: VentanaLimite; general?: VentanaLimite };
}

export async function listarCasosEnDisco(directory: string): Promise<string[]> {
  const entradas = await readdir(join(directory, "fixtures", "reto-03", "solicitudes"), { withFileTypes: true });
  return entradas.filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

function emisorSse(stream: SSEStreamingApi): Emitir {
  return async (e: EventoChat) => {
    await stream.writeSSE({ event: e.tipo, data: JSON.stringify(e) });
  };
}

export function crearApp(deps: DepsApp): Hono {
  const sesiones = deps.sesiones ?? crearAlmacenSesiones();
  const confiarProxy = deps.confiarProxy ?? true;
  const registrar = (mensaje: string): void => (deps.registrar ?? ((m: string) => console.error(m)))(redact(mensaje));
  const bitacora = crearBitacora(deps.dirSalida ?? join(deps.directory, "out"));
  const listarCasos = deps.listarCasos ?? (() => listarCasosEnDisco(deps.directory));

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

  const alFallarStream = (ruta: string) => async (error: unknown, stream: SSEStreamingApi): Promise<void> => {
    const correlationId = randomUUID();
    registrar(`[${correlationId}] ${ruta}: ${redactarError(error)}`);
    await stream.writeSSE({ event: "error", data: JSON.stringify({ tipo: "error", mensaje: "Error interno", correlationId }) });
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

  // ── Lectura ──────────────────────────────────────────────────────────────
  app.get("/api/health", (c) =>
    c.json({ ok: true, provider: deps.info.proveedor, model: deps.info.modelo, llm_configurado: deps.llm !== undefined }),
  );
  app.get("/api/casos", async (c) => c.json({ casos: await listarCasos() }));
  app.get("/api/sessions/:id", (c) => {
    const id = c.req.param("id");
    if (!SessionIdSchema.safeParse(id).success) return c.json({ error: "Identificador de sesión inválido", correlationId: randomUUID() }, 400);
    const sesion = sesiones.obtener(id);
    if (!sesion) return c.json({ error: "Sesión no encontrada", correlationId: randomUUID() }, 404);
    // `nativo` (firmas de pensamiento del proveedor) es interno: no sale del servidor.
    const mensajes = sesion.mensajes.map((m) => (m.rol === "modelo" ? { rol: m.rol, texto: m.texto, llamadas: m.llamadas } : m));
    return c.json({ sessionId: sesion.id, mensajes, pendiente: sesion.pendiente, tokens: sesion.tokens });
  });

  // ── Chat con IA (SSE) ────────────────────────────────────────────────────
  app.post("/api/chat", async (c) => {
    const body = await leerBody(c, ChatBodySchema);
    if (body instanceof Response) return body;
    const sesion = sesiones.obtenerOCrear(body.sessionId);
    if (!sesion) return c.json({ error: "Identificador de sesión inválido", correlationId: randomUUID() }, 400);
    if (sesion.ocupada) return c.json({ error: "La sesión está procesando otro mensaje. Espera a que termine.", correlationId: randomUUID() }, 409);

    return streamSSE(
      c,
      async (stream) => {
        const emitir = emisorSse(stream);
        if (!deps.llm) {
          await emitir({
            tipo: "error",
            mensaje: "El asistente con IA no está configurado: falta la clave del modelo en el servidor. Puedes usar «Revisar sin IA».",
            correlationId: randomUUID(),
          });
          await emitir({ tipo: "fin" });
          return;
        }
        sesion.ocupada = true;
        try {
          await ejecutarTurno({
            llm: deps.llm,
            registro: deps.registro,
            sistema: (deps.sistema ?? cargarSistema)(),
            sesion,
            mensaje: body.message !== "" ? body.message : `Confirmo la creación de la OC de ${body.confirmar ?? ""}.`,
            confirmar: body.confirmar,
            emitir,
            bitacora,
            directory: deps.directory,
            config: deps.config,
            registrar,
          });
        } finally {
          sesion.ocupada = false;
        }
      },
      alFallarStream("/api/chat"),
    );
  });

  // ── Revisar sin IA (SSE) ─────────────────────────────────────────────────
  app.post("/api/evaluar", async (c) => {
    const body = await leerBody(c, EvaluarBodySchema);
    if (body instanceof Response) return body;
    if (!(await listarCasos()).includes(body.caso)) return c.json({ error: "Caso no encontrado", correlationId: randomUUID() }, 404);
    const sesion = body.sessionId ? sesiones.obtenerOCrear(body.sessionId) : undefined;

    return streamSSE(
      c,
      async (stream) => {
        const emitir = emisorSse(stream);
        await revisarSinIA({ caso: body.caso, directory: deps.directory, registro: deps.registro, emitir, bitacora, sesion, registrar });
        await emitir({ tipo: "fin" });
      },
      alFallarStream("/api/evaluar"),
    );
  });

  app.all("/api/*", (c) => c.json({ error: "No encontrado" }, 404));
  app.use("/*", serveStatic({ root: deps.dirEstaticos ?? "./dist/web" }));

  return app;
}

function arrancar(): void {
  const env = cargarEnv(process.env);
  const llm = env.geminiApiKey ? crearLlmGemini({ apiKey: env.geminiApiKey, modelo: env.geminiModel }) : undefined;
  const app = crearApp({
    registro: crearRegistro(oc),
    llm,
    info: { proveedor: "gemini", modelo: env.geminiModel },
    config: { maxIteraciones: env.maxIteraciones, maxTokensSesion: env.maxTokensSesion, timeoutLlmMs: LIMITES.timeoutLlmMs },
    directory: process.cwd(),
  });
  if (!llm) console.warn("GEMINI_API_KEY no definida: el chat con IA responderá un error; «Revisar sin IA» sigue funcionando.");
  serve({ fetch: app.fetch, port: env.port }, (info) => console.log(`Servidor escuchando en el puerto ${info.port}`));
}

const esPrincipal = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (esPrincipal) arrancar();
