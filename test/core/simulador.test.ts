import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Dictamen } from "../../src/domain/contratos";
import { crearSapSimulado } from "../../src/sap/simulador";

const dictamen = (solicitudId: string): Dictamen => ({ solicitudId, decision: "APROBABLE", controles: [], hash: "h" });
const reloj = () => new Date("2026-11-10T12:00:00.000Z");

describe("SAP simulado", () => {
  it("el número de OC empieza por 45 y tiene 10 dígitos", async () => {
    const sap = crearSapSimulado({ reloj });

    const oc = await sap.crearOrdenCompra("sol-001", dictamen("sol-001"));

    assert.match(oc.numero, /^45\d{8}$/);
  });

  it("es idempotente: la misma solicitud siempre produce el mismo número", async () => {
    const sap = crearSapSimulado({ reloj });

    const primera = await sap.crearOrdenCompra("sol-001", dictamen("sol-001"));
    const segunda = await sap.crearOrdenCompra("sol-001", dictamen("sol-001"));

    assert.equal(primera.numero, segunda.numero);
  });

  it("no depende de la instancia: no guarda estado", async () => {
    const a = await crearSapSimulado({ reloj }).crearOrdenCompra("sol-001", dictamen("sol-001"));
    const b = await crearSapSimulado({ reloj }).crearOrdenCompra("sol-001", dictamen("sol-001"));

    assert.equal(a.numero, b.numero);
  });

  it("solicitudes distintas producen números distintos", async () => {
    const sap = crearSapSimulado({ reloj });

    const a = await sap.crearOrdenCompra("sol-001", dictamen("sol-001"));
    const b = await sap.crearOrdenCompra("sol-002", dictamen("sol-002"));

    assert.notEqual(a.numero, b.numero);
  });

  it("usa el reloj inyectado para creadaEn y devuelve la solicitud", async () => {
    const sap = crearSapSimulado({ reloj });

    const oc = await sap.crearOrdenCompra("sol-001", dictamen("sol-001"));

    assert.equal(oc.creadaEn, "2026-11-10T12:00:00.000Z");
    assert.equal(oc.solicitudId, "sol-001");
  });
});
