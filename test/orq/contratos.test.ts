import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DictamenSchema } from "../../src/domain/contratos";

describe("DictamenSchema", () => {
  it("acepta un dictamen con controles válidos", () => {
    const dictamen = {
      solicitudId: "sol-001",
      decision: "APROBABLE",
      controles: [{ id: "CTRL-PROVEEDOR", nombre: "Proveedor activo", estado: "OK", detalle: "Activo", evidencia: {} }],
      hash: "abc",
    };

    assert.equal(DictamenSchema.safeParse(dictamen).success, true);
  });

  it("rechaza un estado de control desconocido", () => {
    const dictamen = {
      solicitudId: "sol-001",
      decision: "APROBABLE",
      controles: [{ id: "X", nombre: "X", estado: "QUIZAS", detalle: "", evidencia: {} }],
      hash: "abc",
    };

    assert.equal(DictamenSchema.safeParse(dictamen).success, false);
  });
});
