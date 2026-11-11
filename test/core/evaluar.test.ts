import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DictamenSchema } from "../../src/domain/contratos";
import { evaluarExpediente, evaluarSolicitud, jsonCanonico } from "../../src/domain/evaluar";
import { expedienteValido } from "./expediente-valido";

describe("jsonCanonico", () => {
  it("no depende del orden de las claves, ni en objetos anidados", () => {
    assert.equal(jsonCanonico({ b: 1, a: { d: 2, c: 3 } }), jsonCanonico({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("conserva el orden de los arreglos", () => {
    assert.notEqual(jsonCanonico([1, 2]), jsonCanonico([2, 1]));
  });

  it("ignora las claves con valor undefined", () => {
    assert.equal(jsonCanonico({ a: 1, b: undefined }), jsonCanonico({ a: 1 }));
  });
});

describe("evaluarExpediente", () => {
  it("aprueba un expediente válido y produce un dictamen conforme al contrato", () => {
    const d = evaluarExpediente(expedienteValido());

    assert.equal(d.decision, "APROBABLE");
    assert.equal(d.solicitudId, "sol-900");
    assert.equal(DictamenSchema.safeParse(d).success, true);
  });

  it("el hash es sha256 hexadecimal y estable entre evaluaciones", () => {
    const a = evaluarExpediente(expedienteValido());
    const b = evaluarExpediente(expedienteValido());

    assert.match(a.hash, /^[0-9a-f]{64}$/);
    assert.equal(a.hash, b.hash);
  });

  it("el hash cambia si cambia el resultado de algún control", () => {
    const roto = expedienteValido();
    roto.aprobacion.estado = "pendiente";

    assert.notEqual(evaluarExpediente(roto).hash, evaluarExpediente(expedienteValido()).hash);
  });
});

describe("evaluarSolicitud (integración con fixtures)", () => {
  it("sol-001 es APROBABLE con todos los controles en OK", async () => {
    const d = await evaluarSolicitud("sol-001");

    assert.equal(d.decision, "APROBABLE");
    assert.deepEqual(new Set(d.controles.map((c) => c.estado)), new Set(["OK"]));
  });

  it("sol-002 es RECHAZADA solo por CTRL-RETROACTIVA, pese a la línea de inyección en la cotización", async () => {
    const d = await evaluarSolicitud("sol-002");

    assert.equal(d.decision, "RECHAZADA");
    const bloqueos = d.controles.filter((c) => c.estado !== "OK").map((c) => c.id);
    assert.deepEqual(bloqueos, ["CTRL-RETROACTIVA"]);
  });
});
