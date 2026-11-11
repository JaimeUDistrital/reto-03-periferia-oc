import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { casoConfirmado, crearGuardia, esConfirmacion } from "../../src/agent/confirmacion";
import type { Pendiente } from "../../src/agent/sesiones";

const pendiente: Pendiente = { caso: "sol-004", confirmaciones: [] };

describe("esConfirmacion", () => {
  it("acepta confirmaciones claras", () => {
    for (const t of ["confirmo", "Confirmo.", "sí, créala", "Si", "procede", "adelante", "Sí, procede por favor", "dale", "de acuerdo"]) {
      assert.equal(esConfirmacion(t), true, t);
    }
  });

  it("rechaza negaciones, preguntas, textos vacíos o largos y mensajes ajenos", () => {
    for (const t of ["no confirmo", "no la crees", "cancela", "espera, todavía no", "¿puedo confirmar?", "", "muéstrame la tabla", "x".repeat(300) + " confirmo", "confirmo? no"]) {
      assert.equal(esConfirmacion(t), false, t);
    }
  });
});

describe("casoConfirmado", () => {
  it("sin pendiente nunca confirma, ni con el botón ni con texto", () => {
    assert.equal(casoConfirmado({ pendiente: null, mensaje: "confirmo", confirmar: "sol-004" }), null);
    assert.equal(casoConfirmado({ pendiente: null, mensaje: "confirmo" }), null);
  });

  it("confirma el caso pendiente con texto o con el botón", () => {
    assert.equal(casoConfirmado({ pendiente, mensaje: "Confirmo" }), "sol-004");
    assert.equal(casoConfirmado({ pendiente, mensaje: "x", confirmar: "sol-004" }), "sol-004");
  });

  it("no confirma el botón de otro caso ni un texto que nombra otro caso", () => {
    assert.equal(casoConfirmado({ pendiente, mensaje: "x", confirmar: "sol-005" }), null);
    assert.equal(casoConfirmado({ pendiente, mensaje: "confirmo sol-005" }), null);
    assert.equal(casoConfirmado({ pendiente, mensaje: "confirmo sol-004" }), "sol-004");
  });

  it("no confirma con negación", () => {
    assert.equal(casoConfirmado({ pendiente, mensaje: "no confirmo" }), null);
  });
});

describe("crearGuardia", () => {
  it("es true solo para el caso confirmado", () => {
    const guardia = crearGuardia("sol-004");

    assert.equal(guardia("sol-004"), true);
    assert.equal(guardia("sol-005"), false);
    assert.equal(crearGuardia(null)("sol-004"), false);
  });
});
