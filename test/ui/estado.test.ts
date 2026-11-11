import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aplicarEvento, estadoInicial, agregarMensajeUsuario } from "../../web/src/estado";
import type { Estado } from "../../web/src/estado";
import { confirmacionGrabada, eventosGrabados, ordenGrabada, validacionGrabada } from "../../web/src/dev/eventos-grabados";
import type { EventoChat } from "../../src/domain/contratos-oc";

const aplicar = (eventos: EventoChat[], base: Estado = estadoInicial): Estado => eventos.reduce(aplicarEvento, base);

const hasta = (tipo: EventoChat["tipo"]): EventoChat[] => {
  const i = eventosGrabados.findIndex((e) => e.tipo === tipo);
  return eventosGrabados.slice(0, i + 1);
};

describe("reductor de eventos de la UI", () => {
  it("empareja tool_call con su tool_result por id", () => {
    const e = aplicar(eventosGrabados.slice(0, 2));
    const tools = e.items.filter((i) => i.tipo === "tool");
    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.id, "c1");
    assert.deepEqual(tools[0]?.entrada, { caso: "sol-004" });
    assert.equal(tools[0]?.resultado?.ok, true);
    assert.equal(tools[0]?.resultado?.ms, 8);
  });

  it("deja la tool sin resultado mientras no llega su tool_result", () => {
    const t = aplicar(eventosGrabados.slice(0, 1)).items[0];
    assert.ok(t && t.tipo === "tool");
    assert.equal(t.resultado, undefined);
  });

  it("no mezcla resultados de tools con ids distintos", () => {
    const tools = aplicar(eventosGrabados.slice(0, 6)).items.filter((i) => i.tipo === "tool");
    assert.deepEqual(tools.map((t) => t.id), ["c1", "c2", "c3"]);
    assert.ok(tools.every((t) => t.resultado?.ok === true));
  });

  it("agrega el mensaje del modelo como texto", () => {
    const m = aplicar(hasta("mensaje")).items.find((i) => i.tipo === "modelo");
    assert.ok(m && m.tipo === "modelo");
    assert.match(m.texto, /RC5/);
  });

  it("toma la validación del data de un oc_validar correcto", () => {
    assert.deepEqual(aplicar(eventosGrabados.slice(0, 4)).validacion, validacionGrabada);
  });

  it("no toma validación de un oc_validar con error", () => {
    const e = aplicar([
      { tipo: "tool_call", id: "x", nombre: "oc_validar", entrada: { caso: "sol-009" } },
      { tipo: "tool_result", id: "x", nombre: "oc_validar", ok: false, ms: 1, salida: { ok: false, error: "Caso inexistente", codigo: "ENTRADA_INVALIDA" } },
    ]);
    assert.equal(e.validacion, null);
  });

  it("toma la orden del data.orden de oc_construir_payload", () => {
    assert.deepEqual(aplicar(eventosGrabados.slice(0, 6)).orden, ordenGrabada);
  });

  it("guarda la confirmación pendiente con su caso", () => {
    const e = aplicar(hasta("confirmacion_requerida"));
    assert.deepEqual(e.confirmacion, { caso: "sol-004", confirmaciones: [confirmacionGrabada] });
  });

  it("oc_creada limpia la confirmación y guarda la OC creada", () => {
    const e = aplicar(hasta("oc_creada"));
    assert.equal(e.confirmacion, null);
    assert.equal(e.ocCreada?.numero_oc, "4500000002");
    assert.equal(e.ocCreada?.caso, "sol-004");
    assert.ok(e.items.some((i) => i.tipo === "oc"));
  });

  it("enviar otro mensaje limpia la confirmación pendiente", () => {
    const e = agregarMensajeUsuario(aplicar(hasta("confirmacion_requerida")), "No confirmo");
    assert.equal(e.confirmacion, null);
    assert.deepEqual(e.items.at(-1), { tipo: "usuario", texto: "No confirmo" });
  });

  it("una validación de otro caso descarta la orden y la OC del caso anterior", () => {
    const base = aplicar(hasta("oc_creada"));
    const e = aplicarEvento(base, { tipo: "tool_result", id: "z", nombre: "oc_validar", ok: true, ms: 1, salida: { ok: true, data: { ...validacionGrabada, caso: "sol-001" } } });
    assert.equal(e.validacion?.caso, "sol-001");
    assert.equal(e.orden, null);
    assert.equal(e.ocCreada, null);
  });

  it("una validación del mismo caso conserva la orden", () => {
    const base = aplicar(eventosGrabados.slice(0, 6));
    const e = aplicarEvento(base, { tipo: "tool_result", id: "z", nombre: "oc_validar", ok: true, ms: 1, salida: { ok: true, data: validacionGrabada } });
    assert.deepEqual(e.orden, ordenGrabada);
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

  it("agrega el mensaje del usuario antes de los eventos del turno", () => {
    const e = aplicar(eventosGrabados.slice(0, 1), agregarMensajeUsuario(estadoInicial, 'Procesa la solicitud "sol-004".'));
    assert.equal(e.items[0]?.tipo, "usuario");
    assert.equal(e.items[1]?.tipo, "tool");
  });
});
