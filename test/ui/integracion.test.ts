import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TurnoHistorial } from "../../src/domain/contratos";
import { extraerSolicitudes } from "../../web/src/api";
import { aplicarEvento, estadoInicial } from "../../web/src/estado";

describe("integración UI ↔ servidor", () => {
  it("un fin sin historial («Evaluar sin IA») conserva el historial del chat", () => {
    const historial: TurnoHistorial[] = [{ tipo: "usuario", texto: "Valida la solicitud sol-001" }];
    const conChat = aplicarEvento(estadoInicial, { tipo: "fin", historial });

    const trasEvaluar = aplicarEvento(conChat, { tipo: "fin" });

    assert.deepEqual(trasEvaluar.historial, historial);
  });

  it("lee la lista de solicitudes con la forma que devuelve el servidor", () => {
    assert.deepEqual(extraerSolicitudes({ solicitudes: ["sol-001", "sol-002"] }), ["sol-001", "sol-002"]);
  });

  it("rechaza una respuesta de solicitudes con otra forma", () => {
    assert.equal(extraerSolicitudes({ otra: 1 }), null);
  });
});
