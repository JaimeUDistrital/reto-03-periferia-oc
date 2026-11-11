import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventoAgente } from "../../src/domain/contratos";
import { firmarToken, DIEZ_MINUTOS_MS } from "../../src/security/hitl";
import { crearApp, type DepsApp } from "../../src/server/app";
import { crearLlmGuionizado, crearNucleoFalso, llamar, type NucleoFalso } from "./fakes";

const SECRETO = "s".repeat(32);
const T0 = 1_700_000_000_000;

function crearAppDePrueba(parcial: Partial<DepsApp> & { nucleo?: NucleoFalso } = {}) {
  const nucleo = parcial.nucleo ?? crearNucleoFalso();
  const logs: string[] = [];
  const app = crearApp({
    nucleo,
    hitlSecret: SECRETO,
    ahora: () => T0,
    registrar: (m) => void logs.push(m),
    dirEstaticos: "./no-existe",
    ...parcial,
  });
  return { app, nucleo, logs };
}

function post(app: ReturnType<typeof crearApp>, ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return app.request(ruta, {
    method: "POST",
    headers: { "content-type": "application/json", ...cabeceras },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
}

async function eventosSse(res: Response): Promise<EventoAgente[]> {
  const texto = await res.text();
  return texto
    .split("\n\n")
    .map((bloque) => bloque.split("\n").find((l) => l.startsWith("data:")))
    .filter((l): l is string => l !== undefined)
    .map((l) => JSON.parse(l.slice(5).trim()) as EventoAgente);
}

describe("GET /api/salud y /api/solicitudes", () => {
  it("responde ok en /api/salud", async () => {
    const { app } = crearAppDePrueba();

    const res = await app.request("/api/salud");

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("lista las solicitudes del núcleo", async () => {
    const { app } = crearAppDePrueba();

    const res = await app.request("/api/solicitudes");

    assert.deepEqual(await res.json(), { solicitudes: ["sol-001", "sol-002"] });
  });

  it("incluye cabeceras de seguridad con CSP restringida a 'self'", async () => {
    const { app } = crearAppDePrueba();

    const res = await app.request("/api/salud");

    const csp = res.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  it("responde 404 JSON ante una ruta /api desconocida", async () => {
    const { app } = crearAppDePrueba();

    const res = await app.request("/api/nada");

    assert.equal(res.status, 404);
  });
});

describe("POST /api/evaluar (sin IA)", () => {
  it("emite tool_call/tool_result de las tools de validación y del dictamen, y pide confirmación si es APROBABLE", async () => {
    const { app, nucleo } = crearAppDePrueba();

    const res = await post(app, "/api/evaluar", { solicitudId: "sol-001" });

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const eventos = await eventosSse(res);
    const nombres = eventos.filter((e) => e.tipo === "tool_call").map((e) => (e.tipo === "tool_call" ? e.nombre : ""));
    assert.deepEqual(nombres, ["validarProveedor", "evaluarSolicitud"]);
    const conf = eventos.find((e) => e.tipo === "confirmacion_requerida");
    assert.ok(conf && conf.tipo === "confirmacion_requerida");
    assert.equal(conf.solicitudId, "sol-001");
    assert.equal(eventos.at(-1)?.tipo, "fin");
    assert.equal(nucleo.ejecuciones["crearOrdenCompra"], undefined);
  });

  it("enmascara datos personales en los resultados de las tools", async () => {
    const { app } = crearAppDePrueba();

    const texto = await (await post(app, "/api/evaluar", { solicitudId: "sol-001" })).text();

    assert.equal(texto.includes("ana.lopez@acme.org"), false);
    assert.equal(texto.includes("3001234567"), false);
  });

  it("no emite confirmación cuando el dictamen no es APROBABLE", async () => {
    const { app } = crearAppDePrueba({ nucleo: crearNucleoFalso({ decision: "RECHAZADA" }) });

    const eventos = await eventosSse(await post(app, "/api/evaluar", { solicitudId: "sol-001" }));

    assert.equal(eventos.some((e) => e.tipo === "confirmacion_requerida"), false);
  });

  it("responde 404 si la solicitud no existe", async () => {
    const { app } = crearAppDePrueba();

    assert.equal((await post(app, "/api/evaluar", { solicitudId: "sol-999" })).status, 404);
  });

  it("responde 400 si el cuerpo no cumple el esquema", async () => {
    const { app } = crearAppDePrueba();

    assert.equal((await post(app, "/api/evaluar", { solicitudId: "../../etc/passwd" })).status, 400);
    assert.equal((await post(app, "/api/evaluar", "no es json")).status, 400);
  });
});

describe("POST /api/chat", () => {
  it("sin GEMINI_API_KEY responde un error claro por SSE y termina con fin", async () => {
    const { app } = crearAppDePrueba({ llm: undefined });

    const res = await post(app, "/api/chat", { historial: [], mensaje: "hola" });

    assert.equal(res.status, 200);
    const eventos = await eventosSse(res);
    const err = eventos.find((e) => e.tipo === "error");
    assert.ok(err && err.tipo === "error");
    assert.match(err.mensaje, /GEMINI_API_KEY/);
    assert.ok(err.correlationId.length > 0);
    assert.equal(eventos.at(-1)?.tipo, "fin");
  });

  it("con LLM falso: tool_call → confirmacion_requerida, sin crear la OC", async () => {
    const llm = crearLlmGuionizado([llamar("c1", "crearOrdenCompra", { solicitudId: "sol-001" }), { llamadas: [], texto: "Esperando tu confirmación." }]);
    const { app, nucleo } = crearAppDePrueba({ llm });

    const eventos = await eventosSse(await post(app, "/api/chat", { historial: [], mensaje: "Crea la OC de sol-001" }));

    assert.deepEqual(eventos.map((e) => e.tipo), ["tool_call", "confirmacion_requerida", "tool_result", "mensaje", "fin"]);
    assert.deepEqual(nucleo.ordenesCreadas, []);
  });

  it("rechaza mensajes vacíos o demasiado largos con 400", async () => {
    const { app } = crearAppDePrueba({ llm: crearLlmGuionizado([{ llamadas: [], texto: "x" }]) });

    assert.equal((await post(app, "/api/chat", { historial: [], mensaje: "   " })).status, 400);
    assert.equal((await post(app, "/api/chat", { historial: [], mensaje: "a".repeat(2001) })).status, 400);
  });

  it("rechaza cuerpos que superan el límite con 413", async () => {
    const { app } = crearAppDePrueba({ llm: crearLlmGuionizado([{ llamadas: [], texto: "x" }]) });

    const res = await post(app, "/api/chat", { historial: [], mensaje: "hola", relleno: "x".repeat(300 * 1024) });

    assert.equal(res.status, 413);
  });

  it("aplica rate limit por IP con 429", async () => {
    const llm = crearLlmGuionizado([{ llamadas: [], texto: "ok" }]);
    const { app } = crearAppDePrueba({ llm, rateLimit: { chat: { max: 2, ventanaMs: 60_000 } } });
    const ip = { "x-forwarded-for": "203.0.113.7" };

    const estados: number[] = [];
    for (let i = 0; i < 3; i++) estados.push((await post(app, "/api/chat", { historial: [], mensaje: "hola" }, ip)).status);

    assert.deepEqual(estados, [200, 200, 429]);
  });

  it("un error inesperado devuelve un mensaje genérico con correlationId y sin secretos", async () => {
    const llm = { generar: async () => { throw new Error("fallo con key=SECRETO123"); } };
    const { app, logs } = crearAppDePrueba({ llm });

    const texto = await (await post(app, "/api/chat", { historial: [], mensaje: "hola" })).text();

    assert.equal(texto.includes("SECRETO123"), false);
    assert.equal(logs.join("\n").includes("SECRETO123"), false);
    assert.match(texto, /correlationId/);
  });
});

describe("POST /api/confirmar", () => {
  const tokenValido = (hash = "hash-1") => firmarToken({ solicitudId: "sol-001", hash }, SECRETO, () => T0);

  it("aprobar con token válido crea la OC una vez y devuelve oc_creada", async () => {
    const { app, nucleo } = crearAppDePrueba();

    const res = await post(app, "/api/confirmar", { token: tokenValido(), accion: "aprobar" });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { tipo: "oc_creada", orden: { numero: "4500000001", solicitudId: "sol-001", creadaEn: "2026-11-10T12:00:00.000Z" } });
    assert.deepEqual(nucleo.ordenesCreadas, ["sol-001"]);
  });

  it("rechazar no crea la OC y responde un mensaje", async () => {
    const { app, nucleo } = crearAppDePrueba();

    const res = await post(app, "/api/confirmar", { token: tokenValido(), accion: "rechazar" });

    assert.equal(res.status, 200);
    const cuerpo = (await res.json()) as EventoAgente;
    assert.equal(cuerpo.tipo, "mensaje");
    assert.deepEqual(nucleo.ordenesCreadas, []);
  });

  it("token alterado → 401 y no crea la OC", async () => {
    const { app, nucleo } = crearAppDePrueba();
    const [payload, firma] = tokenValido().split(".");
    const alterado = `${payload?.slice(0, -2)}AA.${firma}`;

    const res = await post(app, "/api/confirmar", { token: alterado, accion: "aprobar" });

    assert.equal(res.status, 401);
    assert.deepEqual(nucleo.ordenesCreadas, []);
  });

  it("token firmado con otro secreto → 401", async () => {
    const { app } = crearAppDePrueba();
    const ajeno = firmarToken({ solicitudId: "sol-001", hash: "hash-1" }, "z".repeat(32), () => T0);

    assert.equal((await post(app, "/api/confirmar", { token: ajeno, accion: "aprobar" })).status, 401);
  });

  it("token caducado → 401", async () => {
    const { app, nucleo } = crearAppDePrueba({ ahora: () => T0 + DIEZ_MINUTOS_MS + 1 });

    const res = await post(app, "/api/confirmar", { token: tokenValido(), accion: "aprobar" });

    assert.equal(res.status, 401);
    assert.deepEqual(nucleo.ordenesCreadas, []);
  });

  it("si el hash del dictamen cambió desde la confirmación → 409 y no crea la OC", async () => {
    const { app, nucleo } = crearAppDePrueba({ nucleo: crearNucleoFalso({ hash: "hash-NUEVO" }) });

    const res = await post(app, "/api/confirmar", { token: tokenValido("hash-1"), accion: "aprobar" });

    assert.equal(res.status, 409);
    assert.deepEqual(nucleo.ordenesCreadas, []);
  });

  it("si el dictamen dejó de ser APROBABLE → 409 y no crea la OC", async () => {
    const { app, nucleo } = crearAppDePrueba({ nucleo: crearNucleoFalso({ decision: "REQUIERE_REVISION" }) });

    const res = await post(app, "/api/confirmar", { token: tokenValido(), accion: "aprobar" });

    assert.equal(res.status, 409);
    assert.deepEqual(nucleo.ordenesCreadas, []);
  });

  it("repetir el mismo token no rompe: delega en la idempotencia de SAP", async () => {
    const { app, nucleo } = crearAppDePrueba();
    const token = tokenValido();

    const a = await post(app, "/api/confirmar", { token, accion: "aprobar" });
    const b = await post(app, "/api/confirmar", { token, accion: "aprobar" });

    assert.deepEqual(await a.json(), await b.json());
    assert.equal(nucleo.ordenesCreadas.every((s) => s === "sol-001"), true);
  });

  it("responde 400 con acción desconocida", async () => {
    const { app } = crearAppDePrueba();

    assert.equal((await post(app, "/api/confirmar", { token: tokenValido(), accion: "borrar" })).status, 400);
  });
});
