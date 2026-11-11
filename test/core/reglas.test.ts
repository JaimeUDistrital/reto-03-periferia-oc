import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leerMaestros, leerPaquete } from "../../src/data/paquete";
import type { Regla, Validacion } from "../../src/domain/contratos-oc";
import { validarPaquete } from "../../src/domain/reglas";
import type { Maestros, Paquete } from "../../src/domain/tipos";
import { CASOS_ESPERADOS } from "./casos.esperados";
import { RAIZ } from "./ayudas";

const maestros = await leerMaestros(RAIZ);
const paqueteDe = (caso: string) => leerPaquete(RAIZ, caso);

/** Valida una variante de sol-001 (caso feliz) modificada por `cambiar`. */
async function variante(cambiar: (p: Paquete) => void, m: Maestros = maestros): Promise<Validacion> {
  const p = structuredClone(await paqueteDe("sol-001"));
  cambiar(p);
  return validarPaquete("sol-001", p, m);
}
const reglas = (hs: { regla: Regla }[]) => hs.map((h) => h.regla);

describe("casos reales (casos.esperados.ts)", () => {
  for (const esperado of CASOS_ESPERADOS) {
    it(`${esperado.caso}: apta=${esperado.apta} bloqueos=[${esperado.bloqueos}] confirmaciones=[${esperado.confirmaciones}]`, async () => {
      const v = validarPaquete(esperado.caso, await paqueteDe(esperado.caso), maestros);
      assert.equal(v.solicitud_id, esperado.solicitud_id);
      assert.equal(v.apta, esperado.apta);
      assert.deepEqual(reglas(v.bloqueos), esperado.bloqueos);
      assert.deepEqual(reglas(v.confirmaciones), esperado.confirmaciones);
      assert.deepEqual(v.derivados, esperado.derivados);
      assert.equal(v.retroactiva, esperado.retroactiva);
    });
  }

  it("cada hallazgo trae detalle con valores y una acción sugerida concreta", async () => {
    for (const caso of ["sol-002", "sol-003", "sol-004", "sol-005", "sol-006"]) {
      const v = validarPaquete(caso, await paqueteDe(caso), maestros);
      for (const h of [...v.bloqueos, ...v.confirmaciones]) {
        assert.ok(h.detalle.length > 20 && h.accion_sugerida.length > 20, `${caso} ${h.regla}`);
      }
    }
  });

  it("sol-003: el detalle nombra a fvargas, CC-3030 y el tope insuficiente de rtorres", async () => {
    const [h] = validarPaquete("sol-003", await paqueteDe("sol-003"), maestros).bloqueos;
    assert.match(h?.detalle ?? "", /fvargas@periferia-ficticia\.com/);
    assert.match(h?.detalle ?? "", /CC-3030/);
    assert.match(h?.accion_sugerida ?? "", /rtorres@periferia-ficticia\.com/);
    assert.match(h?.accion_sugerida ?? "", /30\.000\.000 COP/);
    assert.match(h?.accion_sugerida ?? "", /74\.000\.000 COP/);
  });

  it("sol-004: el detalle muestra ambos valores en formato es-CO y el porcentaje", async () => {
    const [h] = validarPaquete("sol-004", await paqueteDe("sol-004"), maestros).confirmaciones;
    assert.equal(h?.detalle, "Cotización 26.500.000 COP vs solicitud 25.000.000 COP (6,0 %).");
  });
});

describe("cada regla RC1–RC10 se dispara con su caso", () => {
  it("RC1: proveedor inexistente por NIT", async () => {
    const v = await variante((p) => void (p.solicitud.proveedor_nit = "999999999"));
    assert.deepEqual(reglas(v.bloqueos), ["RC1"]);
  });
  it("RC1: proveedor inactivo (Consultores Ágiles)", async () => {
    const v = await variante((p) => void (p.solicitud.proveedor_nit = "901.777.888-4"));
    assert.deepEqual(reglas(v.bloqueos), ["RC1"]);
    assert.match(v.bloqueos[0]?.detalle ?? "", /inactivo/);
  });
  it("RC1: sin NIT busca por nombre normalizado (tildes, mayúsculas y puntuación)", async () => {
    const v = await variante((p) => {
      delete p.solicitud.proveedor_nit;
      p.solicitud.proveedor_nombre = "TECNOSUMINISTROS S.A.S";
    });
    assert.equal(v.bloqueos.length, 0);
  });
  it("RC2: sin aprobación", async () => {
    assert.deepEqual(reglas((await variante((p) => void (p.aprobacion = null))).bloqueos), ["RC2"]);
  });
  it("RC2: la aprobación no dice «Aprobado»", async () => {
    const v = await variante((p) => p.aprobacion && Object.assign(p.aprobacion, { aprobado: false }));
    assert.deepEqual(reglas(v.bloqueos), ["RC2"]);
  });
  it("RC2: aprobador de otro centro", async () => {
    const v = await variante((p) => p.aprobacion && (p.aprobacion.de = "rtorres@periferia-ficticia.com"));
    assert.deepEqual(reglas(v.bloqueos), ["RC2"]);
  });
  it("RC3: valor total por encima del tope (con aprobador del centro)", async () => {
    const v = await variante((p) => {
      p.solicitud.cantidad = 1;
      p.solicitud.valor_unitario = p.solicitud.valor_total = 60_000_000;
    });
    assert.deepEqual(reglas(v.bloqueos), ["RC3"]);
    assert.match(v.bloqueos[0]?.detalle ?? "", /60\.000\.000 COP supera el tope 50\.000\.000 COP/);
  });
  it("RC4: subárea que no pertenece al centro", async () => {
    assert.deepEqual(reglas((await variante((p) => void (p.solicitud.subarea = "Marketing"))).bloqueos), ["RC4"]);
  });
  it("RC5: sin cotización pide confirmación", async () => {
    assert.deepEqual(reglas((await variante((p) => void (p.cotizacion = null))).confirmaciones), ["RC5"]);
  });
  it("RC5: justo en la tolerancia del 2 % no pide confirmación", async () => {
    const v = await variante((p) => p.cotizacion && (p.cotizacion.total = p.solicitud.valor_total * 1.02));
    assert.deepEqual(v.confirmaciones, []);
  });
  it("RC6 y RC7: sin IVA ni condiciones se derivan del proveedor (RC7 solo informa)", async () => {
    const v = await variante((p) => {
      delete p.solicitud.indicador_iva;
      delete p.solicitud.condiciones_pago;
    });
    assert.deepEqual(v.derivados, { indicador_iva: "C1", condiciones_pago: "Z030" });
    assert.deepEqual(reglas(v.confirmaciones), ["RC6"]);
  });
  it("RC7: solo condiciones ausentes → derivado sin confirmación", async () => {
    const v = await variante((p) => void delete p.solicitud.condiciones_pago);
    assert.deepEqual(v.derivados, { condiciones_pago: "Z030" });
    assert.deepEqual(v.confirmaciones, []);
  });
  it("RC8: factura anterior a la solicitud → retroactiva", async () => {
    const v = await variante((p) => void (p.factura = { numero: "F-1", fecha: "2026-08-01", total: 1 }));
    assert.equal(v.retroactiva, true);
    assert.deepEqual(reglas(v.confirmaciones), ["RC8"]);
  });
  it("RC8: factura de la misma fecha no es retroactiva", async () => {
    const v = await variante((p) => void (p.factura = { numero: "F-1", fecha: "2026-08-20", total: 1 }));
    assert.equal(v.retroactiva, false);
  });
  it("RC9: aprobación anterior a la solicitud", async () => {
    const v = await variante((p) => p.aprobacion && (p.aprobacion.fecha = "2026-08-19T23:59:00-05:00"));
    assert.deepEqual(reglas(v.confirmaciones), ["RC9"]);
  });
  it("RC9: el mismo día (aunque la hora sea anterior) no dispara", async () => {
    const v = await variante((p) => p.aprobacion && (p.aprobacion.fecha = "2026-08-20T00:01:00-05:00"));
    assert.deepEqual(v.confirmaciones, []);
  });
  it("RC10: cantidad × valor unitario ≠ valor total", async () => {
    const v = await variante((p) => void (p.solicitud.valor_total = 11_400_005));
    assert.deepEqual(reglas(v.bloqueos), ["RC10"]);
  });
  it("RC10: diferencia de 1 unidad monetaria se tolera", async () => {
    assert.deepEqual((await variante((p) => void (p.solicitud.valor_total = 11_400_001))).bloqueos, []);
  });
});
