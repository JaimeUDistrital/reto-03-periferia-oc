import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { crearRegistro } from "../../src/agent/herramientas";
import { crearAlmacenSesiones } from "../../src/agent/sesiones";
import type { EventoChat } from "../../src/domain/contratos-oc";
import type { LlmAdapter } from "../../src/llm/adapter";
import { crearLlmGemini } from "../../src/llm/gemini";
import { crearApp, listarCasosEnDisco, type DepsApp } from "../../src/server";
import { HALLAZGO_RC5, crearEstado, llamar, llmGuionizado, moduloFalso, texto, type EstadoFalso } from "./doble";

const CLAVE = "AIzaSyD-clave-de-prueba-1234567890abcdef";
let dir: string;
beforeEach(async () => void (dir = await mkdtemp(join(tmpdir(), "server-"))));
afterEach(async () => rm(dir, { recursive: true, force: true }));

function montar(parcial: Partial<DepsApp> & { estado?: EstadoFalso; llm?: LlmAdapter } = {}) {
  const estado = parcial.estado ?? crearEstado();
  const logs: string[] = [];
  const app = crearApp({
    registro: crearRegistro(moduloFalso(estado)),
    info: { proveedor: "falso", modelo: "falso-1" },
    config: { maxIteraciones: 25, maxTokensSesion: 100_000, timeoutLlmMs: 1000 },
    directory: dir,
    listarCasos: async () => ["sol-001", "sol-004"],
    registrar: (m) => void logs.push(m),
    dirEstaticos: join(dir, "no-existe"),
    ...parcial,
  });
  return { app, estado, logs };
}

const post = (app: ReturnType<typeof crearApp>, ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  app.request(ruta, { method: "POST", headers: { "content-type": "application/json", ...cabeceras }, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });

async function eventosSse(res: Response): Promise<EventoChat[]> {
  return (await res.text())
    .split("\n\n")
    .map((b) => b.split("\n").find((l) => l.startsWith("data:")))
    .filter((l): l is string => l !== undefined)
    .map((l) => JSON.parse(l.slice(5).trim()) as EventoChat);
}

const SESION = "sesion-prueba-1";

describe("GET /api/health y /api/casos", () => {
  it("responde proveedor, modelo y llm_configurado sin exponer la clave aunque esté configurada", async () => {
    const llm = crearLlmGemini({ apiKey: CLAVE, modelo: "gemini-x" });
    const { app } = montar({ llm, info: { proveedor: llm.proveedor, modelo: llm.modelo } });

    const res = await app.request("/api/health");
    const cuerpo = await res.text();

    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(cuerpo), { ok: true, provider: "gemini", model: "gemini-x", llm_configurado: true });
    assert.equal(cuerpo.includes("AIza"), false);
  });

  it("indica llm_configurado=false sin modelo", async () => {
    const body = (await (await montar().app.request("/api/health")).json()) as Record<string, unknown>;

    assert.equal(body["llm_configurado"], false);
  });

  it("lista los casos", async () => {
    assert.deepEqual(await (await montar().app.request("/api/casos")).json(), { casos: ["sol-001", "sol-004"] });
  });

  it("listarCasosEnDisco lee las carpetas de fixtures/reto-03/solicitudes", async () => {
    const casos = await listarCasosEnDisco(process.cwd());

    assert.ok(casos.includes("sol-001"));
    assert.ok(casos.every((c) => /^sol-\d+$/.test(c)));
  });

  it("incluye cabeceras de seguridad con CSP restringida a 'self'", async () => {
    const res = await montar().app.request("/api/health");

    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  it("ya no existe /api/confirmar", async () => {
    assert.equal((await post(montar().app, "/api/confirmar", { token: "x", accion: "aprobar" })).status, 404);
  });
});

describe("POST /api/chat", () => {
  it("emite SSE con tool_call, tool_result, mensaje y fin, y la sesión queda consultable", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_leer_paquete", { caso: "sol-001" }), texto("Listo")]);
    const { app } = montar({ llm });

    const res = await post(app, "/api/chat", { sessionId: SESION, message: "procesa sol-001" });
    const eventos = await eventosSse(res);

    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.deepEqual(eventos.map((e) => e.tipo), ["tool_call", "tool_result", "mensaje", "fin"]);

    const sesion = (await (await app.request(`/api/sessions/${SESION}`)).json()) as { mensajes: Array<{ rol: string }>; pendiente: unknown; tokens: number };
    assert.deepEqual(sesion.mensajes.map((m) => m.rol), ["usuario", "modelo", "herramienta", "modelo"]);
    assert.equal(sesion.tokens, 20);
    assert.equal(sesion.pendiente, null);
  });

  it("escribe out/log.jsonl en la carpeta indicada, nunca en el repositorio", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_leer_paquete", { caso: "sol-001" }), texto("Listo")]);
    const { app } = montar({ llm });

    await (await post(app, "/api/chat", { sessionId: SESION, message: "hola" })).text();

    const linea = JSON.parse((await readFile(join(dir, "out", "log.jsonl"), "utf8")).trim()) as Record<string, unknown>;
    assert.deepEqual([linea["sessionId"], linea["herramienta"], linea["ok"]], [SESION, "oc_leer_paquete", true]);
  });

  it("GET /api/sessions/:id no expone el contenido nativo del proveedor", async () => {
    const llm = llmGuionizado([{ texto: "hola", llamadas: [], nativo: { firma: "SECRETA" }, tokens: 1 }]);
    const { app } = montar({ llm });
    await (await post(app, "/api/chat", { sessionId: SESION, message: "hola" })).text();

    const cuerpo = await (await app.request(`/api/sessions/${SESION}`)).text();

    assert.equal(cuerpo.includes("SECRETA"), false);
  });

  it("sin modelo configurado responde un error claro y fin, sin lanzar", async () => {
    const eventos = await eventosSse(await post(montar().app, "/api/chat", { sessionId: SESION, message: "hola" }));

    assert.deepEqual(eventos.map((e) => e.tipo), ["error", "fin"]);
    const error = eventos[0];
    assert.ok(error?.tipo === "error");
    assert.match(error.mensaje, /no está configurado/);
  });

  it("rechaza sessionId inválido, cuerpo no JSON y mensaje vacío con 400", async () => {
    const { app } = montar({ llm: llmGuionizado([texto("x")]) });

    assert.equal((await post(app, "/api/chat", { sessionId: "../x", message: "hola" })).status, 400);
    assert.equal((await post(app, "/api/chat", "no es json")).status, 400);
    assert.equal((await post(app, "/api/chat", { sessionId: SESION, message: "   " })).status, 400);
  });

  it("acepta el botón de confirmar sin texto", async () => {
    const llm = llmGuionizado([texto("ok")]);
    const { app } = montar({ llm });

    const res = await post(app, "/api/chat", { sessionId: SESION, confirmar: "sol-004" });

    assert.equal(res.status, 200);
    await res.text();
  });

  it("responde 409 si la sesión ya está procesando un mensaje", async () => {
    const sesiones = crearAlmacenSesiones();
    const sesion = sesiones.obtenerOCrear(SESION);
    assert.ok(sesion);
    sesion.ocupada = true;
    const { app } = montar({ llm: llmGuionizado([texto("x")]), sesiones });

    assert.equal((await post(app, "/api/chat", { sessionId: SESION, message: "hola" })).status, 409);
  });

  it("limita el tamaño del cuerpo con 413 y la frecuencia con 429", async () => {
    const { app } = montar({ llm: llmGuionizado([texto("x")]), rateLimit: { chat: { max: 1, ventanaMs: 60_000 } } });

    const grande = await post(app, "/api/chat", { sessionId: SESION, message: "a".repeat(300 * 1024) });
    const primera = await post(app, "/api/chat", { sessionId: SESION, message: "hola" }, { "x-forwarded-for": "1.2.3.4" });
    await primera.text();
    const segunda = await post(app, "/api/chat", { sessionId: SESION, message: "hola" }, { "x-forwarded-for": "1.2.3.4" });

    assert.equal(grande.status, 413);
    assert.equal(segunda.status, 429);
  });

  it("flujo de confirmación de punta a punta por HTTP: pide, 'confirmo' crea", async () => {
    const estado = crearEstado({ confirmaciones: [HALLAZGO_RC5] });
    const llm = llmGuionizado([
      llamar("c1", "oc_validar", { caso: "sol-004", paquete: {} }),
      texto("¿Confirmas?"),
      llamar("c2", "oc_crear", { caso: "sol-004", payload: {}, confirmado: true }),
      texto("Creada"),
    ]);
    const { app } = montar({ llm, estado });

    const t1 = await eventosSse(await post(app, "/api/chat", { sessionId: SESION, message: "procesa sol-004, no la crees aún" }));
    assert.ok(t1.some((e) => e.tipo === "confirmacion_requerida"));
    assert.deepEqual(estado.creadas, []);

    const t2 = await eventosSse(await post(app, "/api/chat", { sessionId: SESION, message: "confirmo" }));
    assert.ok(t2.some((e) => e.tipo === "oc_creada"));
    assert.deepEqual(estado.creadas, ["sol-004"]);
  });
});

describe("GET /api/sessions/:id", () => {
  it("400 con id inválido y 404 si no existe", async () => {
    const { app } = montar();

    assert.equal((await app.request("/api/sessions/corto")).status, 400);
    assert.equal((await app.request("/api/sessions/sesion-inexistente")).status, 404);
  });
});

describe("POST /api/evaluar (Revisar sin IA)", () => {
  it("ejecuta leer_paquete, validar y construir_payload sin LLM y sin crear OC", async () => {
    const { app, estado } = montar();

    const eventos = await eventosSse(await post(app, "/api/evaluar", { caso: "sol-001" }));

    const llamadas = eventos.filter((e) => e.tipo === "tool_call").map((e) => (e as { nombre: string }).nombre);
    assert.deepEqual(llamadas, ["oc_leer_paquete", "oc_validar", "oc_construir_payload"]);
    assert.equal(eventos.filter((e) => e.tipo === "tool_result").length, 3);
    assert.equal(eventos.at(-1)?.tipo, "fin");
    assert.deepEqual(estado.creadas, []);
    assert.equal(estado.ejecuciones["crear"], undefined);
  });

  it("con confirmaciones emite confirmacion_requerida y deja el caso pendiente en la sesión", async () => {
    const { app } = montar({ estado: crearEstado({ confirmaciones: [HALLAZGO_RC5] }) });

    const eventos = await eventosSse(await post(app, "/api/evaluar", { caso: "sol-004", sessionId: SESION }));

    const c = eventos.find((e) => e.tipo === "confirmacion_requerida");
    assert.ok(c?.tipo === "confirmacion_requerida");
    assert.equal(c.caso, "sol-004");
    const sesion = (await (await app.request(`/api/sessions/${SESION}`)).json()) as { pendiente: { caso: string } | null; mensajes: unknown[] };
    assert.equal(sesion.pendiente?.caso, "sol-004");
    assert.deepEqual(sesion.mensajes, []);
  });

  it("404 si el caso no existe y 400 si el cuerpo es inválido", async () => {
    const { app } = montar();

    assert.equal((await post(app, "/api/evaluar", { caso: "sol-999" })).status, 404);
    assert.equal((await post(app, "/api/evaluar", { caso: "../x" })).status, 400);
  });

  it("se detiene en el primer paso fallido pero cierra con fin", async () => {
    const estado = crearEstado();
    const modulo = moduloFalso(estado);
    modulo["leer_paquete"] = { description: "d", args: {}, execute: async () => JSON.stringify({ ok: false, error: "no existe", codigo: "ENTRADA_INVALIDA" }) };
    const { app } = montar({ registro: crearRegistro(modulo) });

    const eventos = await eventosSse(await post(app, "/api/evaluar", { caso: "sol-001" }));

    assert.deepEqual(eventos.map((e) => e.tipo), ["tool_call", "tool_result", "fin"]);
  });
});
