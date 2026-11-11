import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aplicarEvento, estadoInicial, agregarMensajeUsuario, resolverConfirmacion } from "../../web/src/estado";
import type { Estado } from "../../web/src/estado";
import { dictamenGrabado, eventosGrabados } from "../../web/src/dev/eventos-grabados";
import type { EventoAgente } from "../../src/domain/contratos";

const aplicar = (eventos: EventoAgente[], base: Estado = estadoInicial): Estado =>
  eventos.reduce(aplicarEvento, base);

const hasta = (tipo: EventoAgente["tipo"]): EventoAgente[] => {
  const i = eventosGrabados.findIndex((e) => e.tipo === tipo);
  return eventosGrabados.slice(0, i + 1);
};

describe("reductor de eventos de la UI", () => {
  it("empareja tool_call con su tool_result por id", () => {
    const e = aplicar(eventosGrabados.slice(0, 2));
    const tools = e.items.filter((i) => i.tipo === "tool");
    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.id, "c1");
    assert.deepEqual(tools[0]?.entrada, { solicitudId: "sol-001" });
    assert.equal(tools[0]?.resultado?.ok, true);
    assert.equal(tools[0]?.resultado?.ms, 12);
  });

  it("deja la tool sin resultado mientras no llega su tool_result", () => {
    const e = aplicar(eventosGrabados.slice(0, 1));
    const t = e.items[0];
    assert.ok(t && t.tipo === "tool");
    assert.equal(t.resultado, undefined);
  });

  it("no mezcla resultados de tools con ids distintos", () => {
    const e = aplicar(eventosGrabados.slice(0, 4));
    const tools = e.items.filter((i) => i.tipo === "tool");
    assert.deepEqual(tools.map((t) => t.id), ["c1", "c2"]);
    assert.ok(tools.every((t) => t.resultado?.ok === true));
  });

  it("agrega el mensaje del modelo como texto", () => {
    const e = aplicar(hasta("mensaje"));
    const m = e.items.find((i) => i.tipo === "modelo");
    assert.ok(m && m.tipo === "modelo");
    assert.match(m.texto, /requiere revisión/);
  });

  it("guarda la confirmación pendiente y el dictamen del expediente", () => {
    const e = aplicar(hasta("confirmacion_requerida"));
    assert.equal(e.confirmacion?.token, "tok.demo.abc123");
    assert.deepEqual(e.dictamen, dictamenGrabado);
  });

  it("limpia la confirmación y registra la OC con oc_creada", () => {
    const e = aplicar(hasta("oc_creada"));
    assert.equal(e.confirmacion, null);
    assert.equal(e.orden?.numero, "4500001234");
    assert.ok(e.items.some((i) => i.tipo === "oc"));
  });

  it("toma el dictamen de un tool_result con forma de dictamen", () => {
    const e = aplicar(eventosGrabados.slice(0, 4));
    assert.equal(e.dictamen?.solicitudId, "sol-001");
  });

  it("guarda el historial del evento fin para el siguiente turno", () => {
    const e = aplicar(eventosGrabados);
    assert.equal(e.historial.length, 3);
  });

  it("registra errores con su correlationId", () => {
    const e = aplicar([{ tipo: "error", mensaje: "Fallo interno", correlationId: "abc-123" }]);
    assert.deepEqual(e.items, [{ tipo: "error", mensaje: "Fallo interno", correlationId: "abc-123" }]);
  });

  it("no muta el estado de entrada", () => {
    const antes = JSON.stringify(estadoInicial);
    aplicar(eventosGrabados);
    assert.equal(JSON.stringify(estadoInicial), antes);
  });

  it("resolverConfirmacion limpia la confirmación sin tocar el resto", () => {
    const e = resolverConfirmacion(aplicar(hasta("confirmacion_requerida")));
    assert.equal(e.confirmacion, null);
    assert.deepEqual(e.dictamen, dictamenGrabado);
  });

  it("agrega el mensaje del usuario antes de los eventos del turno", () => {
    const e = aplicar(eventosGrabados.slice(0, 1), agregarMensajeUsuario(estadoInicial, "Valida la solicitud sol-001"));
    assert.deepEqual(e.items[0], { tipo: "usuario", texto: "Valida la solicitud sol-001" });
    assert.equal(e.items[1]?.tipo, "tool");
  });
});
