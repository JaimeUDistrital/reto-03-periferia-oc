import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { crearBitacora } from "../../src/agent/bitacora";
import { crearRegistro } from "../../src/agent/herramientas";
import { ejecutarTurno, type ConfigTurno } from "../../src/agent/loop";
import { crearAlmacenSesiones, type Pendiente, type Sesion } from "../../src/agent/sesiones";
import type { EventoChat } from "../../src/domain/contratos-oc";
import type { LlmAdapter } from "../../src/llm/adapter";
import { HALLAZGO_RC5, crearEstado, llamar, llmGuionizado, moduloFalso, texto, type EstadoFalso } from "./doble";

const CONFIG: ConfigTurno = { maxIteraciones: 25, maxTokensSesion: 1_000_000, timeoutLlmMs: 1000 };

let dir: string;
beforeEach(async () => void (dir = await mkdtemp(join(tmpdir(), "loop-"))));
afterEach(async () => rm(dir, { recursive: true, force: true }));

function montar(llm: LlmAdapter, estado: EstadoFalso, opciones: { config?: Partial<ConfigTurno>; sesion?: Sesion } = {}) {
  const sesion = opciones.sesion ?? crearAlmacenSesiones().obtenerOCrear("sesion-prueba") as Sesion;
  const eventos: EventoChat[] = [];
  const logs: string[] = [];
  return {
    sesion,
    eventos,
    logs,
    turno: (mensaje: string, confirmar?: string) =>
      ejecutarTurno({
        llm,
        registro: crearRegistro(moduloFalso(estado)),
        sistema: "sistema",
        sesion,
        mensaje,
        confirmar,
        emitir: (e) => void eventos.push(e),
        bitacora: crearBitacora(join(dir, "out")),
        directory: dir,
        config: { ...CONFIG, ...opciones.config },
        registrar: (m) => void logs.push(m),
      }),
  };
}

const tipos = (eventos: EventoChat[]): string[] => eventos.map((e) => e.tipo);
const pendiente = (caso: string): Pendiente => ({ caso, confirmaciones: [HALLAZGO_RC5] });

describe("ejecutarTurno: flujo básico", () => {
  it("emite tool_call, tool_result, mensaje y fin, y guarda el historial", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_leer_paquete", { caso: "sol-001" }), texto("Listo")]);
    const t = montar(llm, crearEstado());

    await t.turno("procesa sol-001");

    assert.deepEqual(tipos(t.eventos), ["tool_call", "tool_result", "mensaje", "fin"]);
    const resultado = t.eventos[1];
    assert.ok(resultado?.tipo === "tool_result" && resultado.ok);
    assert.deepEqual((resultado.salida as { ok: boolean }).ok, true);
    assert.deepEqual(t.sesion.mensajes.map((m) => m.rol), ["usuario", "modelo", "herramienta", "modelo"]);
  });

  it("registra cada llamada en out/log.jsonl con sessionId, ok, ms y codigo", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_leer_paquete", { caso: "sol-001" }), llamar("c2", "oc_leer_paquete", { caso: 5 }), texto("fin")]);
    const t = montar(llm, crearEstado());

    await t.turno("hola");

    const lineas = (await readFile(join(dir, "out", "log.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    assert.equal(lineas.length, 2);
    assert.deepEqual([lineas[0]?.["sessionId"], lineas[0]?.["herramienta"], lineas[0]?.["ok"]], ["sesion-prueba", "oc_leer_paquete", true]);
    assert.deepEqual([lineas[1]?.["ok"], lineas[1]?.["codigo"]], [false, "ENTRADA_INVALIDA"]);
  });

  it("devuelve al modelo el error de argumentos inválidos y sigue", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_leer_paquete", {}), texto("Me faltaba el caso")]);
    const t = montar(llm, crearEstado());

    await t.turno("hola");

    const vistoPorElModelo = llm.recibidos[1]?.at(-1);
    assert.ok(vistoPorElModelo?.rol === "herramienta");
    assert.equal((vistoPorElModelo.resultado as { ok: boolean }).ok, false);
    assert.deepEqual(tipos(t.eventos).at(-1), "fin");
  });
});

describe("ejecutarTurno: topes y errores (CA1, CA5, costo)", () => {
  it("corta a las 25 iteraciones y responde con lo hecho y lo que falta", async () => {
    const llm = llmGuionizado([llamar("c", "oc_leer_paquete", { caso: "sol-001" })]);
    const t = montar(llm, crearEstado());

    await t.turno("itera");

    assert.equal(llm.recibidos.length, 25);
    const mensaje = t.eventos.find((e) => e.tipo === "mensaje");
    assert.ok(mensaje?.tipo === "mensaje");
    assert.match(mensaje.texto, /límite de 25 pasos/);
    assert.match(mensaje.texto, /oc_leer_paquete \(ok\)/);
    assert.match(mensaje.texto, /Falta/);
    assert.equal(tipos(t.eventos).at(-1), "fin");
  });

  it("respeta un tope de iteraciones configurable", async () => {
    const llm = llmGuionizado([llamar("c", "oc_leer_paquete", { caso: "sol-001" })]);
    const t = montar(llm, crearEstado(), { config: { maxIteraciones: 3 } });

    await t.turno("itera");

    assert.equal(llm.recibidos.length, 3);
  });

  it("detiene la sesión al superar el tope de tokens, sin llamar más al modelo", async () => {
    const llm = llmGuionizado([llamar("c", "oc_leer_paquete", { caso: "sol-001" }, 600)]);
    const t = montar(llm, crearEstado(), { config: { maxTokensSesion: 1000 } });

    await t.turno("gasta");
    const llamadasTurno1 = llm.recibidos.length;
    await t.turno("otra vez");

    assert.equal(llamadasTurno1, 2);
    assert.equal(llm.recibidos.length, 2);
    const error = t.eventos.filter((e) => e.tipo === "error").at(-1);
    assert.ok(error?.tipo === "error");
    assert.match(error.mensaje, /límite de 1000 tokens/);
    assert.equal(t.sesion.tokens, 1200);
  });

  it("muestra un timeout claro y la sesión sigue viva para el siguiente turno", async () => {
    const colgado: LlmAdapter = {
      proveedor: "falso",
      modelo: "m",
      enviar: () => new Promise(() => undefined),
    };
    const t = montar(colgado, crearEstado(), { config: { timeoutLlmMs: 20 } });

    await t.turno("hola");

    const error = t.eventos.find((e) => e.tipo === "error");
    assert.ok(error?.tipo === "error");
    assert.match(error.mensaje, /tardó más de \d+ s/);
    assert.equal(tipos(t.eventos).at(-1), "fin");
    assert.equal(t.sesion.ocupada, false);
  });

  it("convierte un fallo del proveedor en error legible sin filtrar la clave", async () => {
    const llm = llmGuionizado([new Error("401 en https://x.test/v1?key=AIzaSyD-1234567890abcdefghijklmnopqrstu")]);
    const t = montar(llm, crearEstado());

    await t.turno("hola");

    const error = t.eventos.find((e) => e.tipo === "error");
    assert.ok(error?.tipo === "error");
    assert.equal(JSON.stringify(t.eventos).includes("AIza"), false);
    assert.equal(t.logs.join("\n").includes("AIza"), false);
    assert.match(error.mensaje, /No pude consultar al modelo/);
  });

  it("tras un error del proveedor, el siguiente turno funciona", async () => {
    const llm = llmGuionizado([new Error("boom"), texto("Ya estoy")]);
    const t = montar(llm, crearEstado());

    await t.turno("uno");
    await t.turno("dos");

    assert.ok(t.eventos.some((e) => e.tipo === "mensaje" && e.texto === "Ya estoy"));
  });
});

describe("ejecutarTurno: confirmación humana (CA3)", () => {
  const conConfirmaciones = (): EstadoFalso => crearEstado({ confirmaciones: [HALLAZGO_RC5] });

  it("oc_crear sin confirmado emite confirmacion_requerida con ambos valores y deja el caso pendiente", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_crear", { caso: "sol-004", payload: {} }), texto("¿Confirmas?")]);
    const estado = conConfirmaciones();
    const t = montar(llm, estado);

    await t.turno("procesa sol-004");

    const c = t.eventos.find((e) => e.tipo === "confirmacion_requerida");
    assert.ok(c?.tipo === "confirmacion_requerida");
    assert.equal(c.caso, "sol-004");
    assert.deepEqual(c.confirmaciones[0]?.valores, { solicitud: 25000000, cotizacion: 26500000 });
    assert.deepEqual(t.sesion.pendiente?.caso, "sol-004");
    assert.deepEqual(estado.creadas, []);
  });

  it("el modelo NO puede autoconfirmar con confirmado:true sin confirmación humana", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_crear", { caso: "sol-004", payload: {}, confirmado: true }), texto("No pude")]);
    const estado = conConfirmaciones();
    const t = montar(llm, estado);

    await t.turno("procesa sol-004");

    assert.deepEqual(estado.creadas, []);
    assert.ok(t.eventos.some((e) => e.tipo === "confirmacion_requerida"));
    assert.ok(!t.eventos.some((e) => e.tipo === "oc_creada"));
  });

  it("con pendiente y un mensaje 'confirmo', oc_crear confirmado:true crea la OC y emite oc_creada", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_crear", { caso: "sol-004", payload: {}, confirmado: true }), texto("Creada")]);
    const estado = conConfirmaciones();
    const t = montar(llm, estado, { sesion: { ...crearAlmacenSesiones().obtenerOCrear("sesion-prueba") as Sesion, pendiente: pendiente("sol-004") } });

    await t.turno("Confirmo");

    const creada = t.eventos.find((e) => e.tipo === "oc_creada");
    assert.ok(creada?.tipo === "oc_creada");
    assert.deepEqual([creada.caso, creada.numero_oc, creada.evidencia], ["sol-004", "4500000001", "out/sol-004/aprobacion.txt"]);
    assert.deepEqual(estado.creadas, ["sol-004"]);
    assert.equal(t.sesion.pendiente, null);
  });

  it("el botón (confirmar) del caso pendiente también habilita la creación", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_crear", { caso: "sol-004", payload: {}, confirmado: true }), texto("ok")]);
    const estado = conConfirmaciones();
    const t = montar(llm, estado, { sesion: { ...crearAlmacenSesiones().obtenerOCrear("sesion-prueba") as Sesion, pendiente: pendiente("sol-004") } });

    await t.turno("Adelante", "sol-004");

    assert.deepEqual(estado.creadas, ["sol-004"]);
  });

  it("confirmación de OTRO caso no habilita el pendiente", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_crear", { caso: "sol-004", payload: {}, confirmado: true }), texto("no")]);
    const estado = conConfirmaciones();
    const t = montar(llm, estado, { sesion: { ...crearAlmacenSesiones().obtenerOCrear("sesion-prueba") as Sesion, pendiente: pendiente("sol-004") } });

    await t.turno("confirmo", "sol-005");

    assert.deepEqual(estado.creadas, []);
  });

  it("'no confirmo' no habilita y limpia el pendiente", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_crear", { caso: "sol-004", payload: {}, confirmado: true }), texto("no")]);
    const estado = conConfirmaciones();
    const t = montar(llm, estado, { sesion: { ...crearAlmacenSesiones().obtenerOCrear("sesion-prueba") as Sesion, pendiente: pendiente("sol-004") } });

    await t.turno("no confirmo");

    assert.deepEqual(estado.creadas, []);
    assert.equal(estado.ctxCrear[0]?.confirmacionHumana?.("sol-004"), false);
  });

  it("confirmación humana sin pendiente previo no sirve (el modelo no pudo haber mostrado nada)", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_crear", { caso: "sol-004", payload: {}, confirmado: true }), texto("no")]);
    const estado = conConfirmaciones();
    const t = montar(llm, estado);

    await t.turno("confirmo");

    assert.deepEqual(estado.creadas, []);
  });

  it("oc_validar con confirmaciones deja el caso pendiente y avisa al terminar el turno (no crear todavía)", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_validar", { caso: "sol-004", paquete: {} }), texto("Tabla… ¿confirmas?")]);
    const t = montar(llm, conConfirmaciones());

    await t.turno("procesa sol-004 y no la crees hasta que confirme");

    assert.equal(t.sesion.pendiente?.caso, "sol-004");
    assert.deepEqual(tipos(t.eventos), ["tool_call", "tool_result", "mensaje", "confirmacion_requerida", "fin"]);
  });

  it("flujo completo en dos turnos: validar → 'confirmo' → crear", async () => {
    const estado = conConfirmaciones();
    const llm = llmGuionizado([
      llamar("c1", "oc_validar", { caso: "sol-004", paquete: {} }),
      texto("¿Confirmas?"),
      llamar("c2", "oc_crear", { caso: "sol-004", payload: {}, confirmado: true }),
      texto("Creada"),
    ]);
    const t = montar(llm, estado);

    await t.turno("procesa sol-004, no la crees aún");
    await t.turno("sí, créala");

    assert.deepEqual(estado.creadas, ["sol-004"]);
    assert.ok(t.eventos.some((e) => e.tipo === "oc_creada"));
  });

  it("el caso limpio se crea sin confirmación humana (O1)", async () => {
    const llm = llmGuionizado([llamar("c1", "oc_crear", { caso: "sol-001", payload: {} }), texto("Creada")]);
    const estado = crearEstado();
    const t = montar(llm, estado);

    await t.turno("procesa sol-001");

    assert.deepEqual(estado.creadas, ["sol-001"]);
    assert.ok(t.eventos.some((e) => e.tipo === "oc_creada"));
  });
});
