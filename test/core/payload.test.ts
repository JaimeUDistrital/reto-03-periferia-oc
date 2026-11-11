import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leerMaestros, leerPaquete } from "../../src/data/paquete";
import { construirOrden } from "../../src/domain/payload";
import { validarPaquete } from "../../src/domain/reglas";
import { RAIZ } from "./ayudas";

describe("construirOrden", () => {
  it("un IVA o unas condiciones vacías («») se tratan como ausentes y se usa el valor derivado", async () => {
    const maestros = await leerMaestros(RAIZ);
    const p = structuredClone(await leerPaquete(RAIZ, "sol-006"));
    p.solicitud.indicador_iva = "";
    p.solicitud.condiciones_pago = "";
    const v = validarPaquete("sol-006", p, maestros);
    const { orden, trazabilidad } = construirOrden(p, v, maestros);
    assert.equal(orden.posiciones[0]?.indicador_iva, "C1");
    assert.equal(orden.condiciones_pago, "Z030");
    assert.equal(trazabilidad["posiciones.0.indicador_iva"], "derivado");
  });
});
