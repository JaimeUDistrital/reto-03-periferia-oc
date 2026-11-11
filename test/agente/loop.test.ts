import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventoAgente, LlmPort, TurnoHistorial } from "../../src/domain/contratos";
import { ejecutarAgente } from "../../src/agent/loop";
import { crearLlmGuionizado, crearNucleoFalso, llamar, recolector } from "./fakes";

const firmarToken = (p: { solicitudId: string; hash: string }): string => `tok:${p.solicitudId}:${p.hash}`;

function tipos(eventos: EventoAgente[]): string[] {
  return eventos.map((e) => e.tipo);
}

function evento<T extends EventoAgente["tipo"]>(eventos: EventoAgente[], tipo: T): Extract<EventoAgente, { tipo: T }> {
  const e = eventos.find((x) => x.tipo === tipo);
  assert.ok(e, `falta el evento ${tipo}; hubo: ${tipos(eventos).join(", ")}`);
  return e as Extract<EventoAgente, { tipo: T }>;
}

describe("ejecutarAgente: tools sin confirmación", () => {
  it("ejecuta la tool, emite tool_call y tool_result con ms, y termina con mensaje y fin", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "validarProveedor", { solicitudId: "sol-001" }), { llamadas: [], texto: "Proveedor activo." }]);
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "Valida sol-001", llm, nucleo, emitir, firmarToken });

    assert.deepEqual(tipos(eventos), ["tool_call", "tool_result", "mensaje", "fin"]);
    const res = evento(eventos, "tool_result");
    assert.equal(res.ok, true);
    assert.equal(res.nombre, "validarProveedor");
    assert.equal(typeof res.ms, "number");
    assert.equal(nucleo.ejecuciones["validarProveedor"], 1);
  });

  it("enmascara la salida de la tool antes de enviarla a la UI y al modelo", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "validarProveedor", { solicitudId: "sol-001" }), { llamadas: [], texto: "ok" }]);
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "Valida", llm, nucleo, emitir, firmarToken });

    const salidaUi = JSON.stringify(evento(eventos, "tool_result").salida);
    assert.equal(salidaUi.includes("ana.lopez@acme.org"), false);
    assert.equal(salidaUi.includes("3001234567"), false);
    const vistoPorModelo = JSON.stringify(llm.recibidos[1]);
    assert.equal(vistoPorModelo.includes("ana.lopez@acme.org"), false);
    assert.equal(vistoPorModelo.includes("3001234567"), false);
  });

  it("devuelve la historia actualizada: usuario, modelo, resultado y respuesta final", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "validarProveedor", { solicitudId: "sol-001" }), { llamadas: [], texto: "Listo." }]);
    const { eventos, emitir } = recolector();
    const previo: TurnoHistorial[] = [{ tipo: "usuario", texto: "hola" }, { tipo: "modelo", texto: "¡Hola!", llamadas: [] }];

    await ejecutarAgente({ historial: previo, mensaje: "Valida", llm, nucleo, emitir, firmarToken });

    const fin = evento(eventos, "fin");
    assert.deepEqual(fin.historial.map((t) => t.tipo), ["usuario", "modelo", "usuario", "modelo", "resultado_tool", "modelo"]);
    assert.equal(previo.length, 2, "no muta el historial de entrada");
  });

  it("devuelve al modelo un error cuando los argumentos no cumplen el esquema, sin ejecutar la tool", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "validarProveedor", { id: 5 }), { llamadas: [], texto: "Perdón." }]);
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "Valida", llm, nucleo, emitir, firmarToken });

    assert.equal(nucleo.ejecuciones["validarProveedor"], undefined);
    assert.equal(evento(eventos, "tool_result").ok, false);
    const ultimo = llm.recibidos[1]?.at(-1);
    assert.equal(ultimo?.tipo, "resultado_tool");
    assert.match(JSON.stringify(ultimo), /error/i);
  });

  it("informa al modelo de una herramienta inexistente", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "borrarTodo", {}), { llamadas: [], texto: "No existe." }]);
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "x", llm, nucleo, emitir, firmarToken });

    assert.equal(evento(eventos, "tool_result").ok, false);
    assert.match(JSON.stringify(llm.recibidos[1]?.at(-1)), /desconocida/i);
  });

  it("si la tool lanza, emite tool_result con ok=false y el mensaje sin secretos", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "herramientaRota", {}), { llamadas: [], texto: "Falló." }]);
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "x", llm, nucleo, emitir, firmarToken });

    const res = evento(eventos, "tool_result");
    assert.equal(res.ok, false);
    assert.equal(JSON.stringify(res.salida).includes("SECRETO123"), false);
  });
});

describe("ejecutarAgente: tool que exige confirmación (HITL)", () => {
  it("con dictamen APROBABLE emite confirmacion_requerida con token firmado y NO ejecuta la tool", async () => {
    const nucleo = crearNucleoFalso({ decision: "APROBABLE", hash: "hash-9" });
    const llm = crearLlmGuionizado([llamar("c1", "crearOrdenCompra", { solicitudId: "sol-001" }), { llamadas: [], texto: "Falta tu confirmación." }]);
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "Crea la OC", llm, nucleo, emitir, firmarToken });

    const conf = evento(eventos, "confirmacion_requerida");
    assert.equal(conf.token, "tok:sol-001:hash-9");
    assert.equal(conf.solicitudId, "sol-001");
    assert.equal(conf.dictamen.hash, "hash-9");
    assert.equal(nucleo.ejecuciones["crearOrdenCompra"], undefined, "crearOrdenCompra nunca se ejecuta en el loop");
    assert.deepEqual(nucleo.ordenesCreadas, []);
  });

  it("al modelo le dice que la OC está pendiente de confirmación y que aún no existe", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "crearOrdenCompra", { solicitudId: "sol-001" }), { llamadas: [], texto: "ok" }]);
    const { emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "Crea", llm, nucleo, emitir, firmarToken });

    const visto = JSON.stringify(llm.recibidos[1]?.at(-1));
    assert.match(visto, /PENDIENTE_CONFIRMACION_HUMANA/);
    assert.equal(visto.includes("tok:"), false, "el token no llega al modelo");
  });

  for (const decision of ["REQUIERE_REVISION", "RECHAZADA"] as const) {
    it(`con decisión ${decision} no emite token y explica al modelo por qué no procede`, async () => {
      const nucleo = crearNucleoFalso({
        decision,
        controles: [{ id: "CTRL-PRESUPUESTO", nombre: "Presupuesto", estado: "BLOQUEO", detalle: "Excede el presupuesto", evidencia: {} }],
      });
      const llm = crearLlmGuionizado([llamar("c1", "crearOrdenCompra", { solicitudId: "sol-001" }), { llamadas: [], texto: "No procede." }]);
      const { eventos, emitir } = recolector();

      await ejecutarAgente({ historial: [], mensaje: "Crea", llm, nucleo, emitir, firmarToken });

      assert.equal(tipos(eventos).includes("confirmacion_requerida"), false);
      assert.equal(nucleo.ejecuciones["crearOrdenCompra"], undefined);
      const visto = JSON.stringify(llm.recibidos[1]?.at(-1));
      assert.match(visto, new RegExp(decision));
      assert.match(visto, /CTRL-PRESUPUESTO/);
      assert.match(visto, /Excede el presupuesto/);
    });
  }

  it("rechaza una solicitud inexistente sin emitir token", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "crearOrdenCompra", { solicitudId: "sol-999" }), { llamadas: [], texto: "No existe." }]);
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "Crea", llm, nucleo, emitir, firmarToken });

    assert.equal(tipos(eventos).includes("confirmacion_requerida"), false);
  });
});

describe("ejecutarAgente: límites y fallos", () => {
  it("se detiene tras 8 iteraciones aunque el modelo siga pidiendo tools", async () => {
    const nucleo = crearNucleoFalso();
    const llm = crearLlmGuionizado([llamar("c1", "validarProveedor", { solicitudId: "sol-001" })]);
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "bucle", llm, nucleo, emitir, firmarToken });

    assert.equal(llm.recibidos.length, 8);
    assert.equal(tipos(eventos).at(-1), "fin");
    assert.match(evento(eventos, "mensaje").texto, /límite/i);
  });

  it("si el LLM falla emite error con correlationId sin filtrar secretos, y termina con fin", async () => {
    const llm: LlmPort = {
      async generar() {
        throw new Error("403 en https://api.test/v1?key=SECRETO123");
      },
    };
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "x", llm, nucleo: crearNucleoFalso(), emitir, firmarToken, registrar: () => {} });

    const err = evento(eventos, "error");
    assert.ok(err.correlationId.length > 0);
    assert.equal(JSON.stringify(err).includes("SECRETO123"), false);
    assert.equal(tipos(eventos).at(-1), "fin");
  });

  it("si el LLM no responde a tiempo emite error y termina", async () => {
    const llm: LlmPort = { generar: () => new Promise(() => {}) };
    const { eventos, emitir } = recolector();

    await ejecutarAgente({ historial: [], mensaje: "x", llm, nucleo: crearNucleoFalso(), emitir, firmarToken, timeoutLlmMs: 20, registrar: () => {} });

    assert.deepEqual(tipos(eventos), ["error", "fin"]);
  });
});
