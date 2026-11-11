import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluarSolicitud } from "../../src/domain/evaluar";
import { CASOS_ESPERADOS } from "./casos.esperados";

describe("casos dorados", () => {
  for (const [solicitudId, esperada] of Object.entries(CASOS_ESPERADOS)) {
    it(`${solicitudId} se dictamina ${esperada}`, async () => {
      const dictamen = await evaluarSolicitud(solicitudId);

      assert.equal(dictamen.decision, esperada);
    });
  }
});
