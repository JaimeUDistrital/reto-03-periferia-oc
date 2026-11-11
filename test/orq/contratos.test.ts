import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrdenCompraSchema, ValidacionSchema } from "../../src/domain/contratos-oc";

const ordenValida = {
  referencia: { solicitud_id: "SOL-2026-001", correo_id: "sol-001-correo", cotizacion_ref: "COT-TS-2026-0451" },
  sociedad: "1000",
  organizacion_compras: "1000",
  proveedor: { codigo_sap: "100234", nit: "900555111", nombre: "TecnoSuministros S.A.S." },
  moneda: "COP",
  condiciones_pago: "Z030",
  aprobador: { email: "aprobador@ejemplo.test", fecha_aprobacion: "2026-08-21T10:02:00-05:00", evidencia_sha256: "a".repeat(64) },
  posiciones: [{ numero: 10, descripcion: "Licencias antivirus", cantidad: 120, unidad: "UN", precio_unitario: 95000, centro_costo: "CC-1010", subarea: "Infraestructura", indicador_iva: "C1" }],
  excepciones: [],
};

describe("contratos de la fase B (PRD §7.4)", () => {
  it("acepta una OC completa", () => {
    assert.equal(OrdenCompraSchema.safeParse(ordenValida).success, true);
  });

  it("rechaza un texto breve de más de 40 caracteres (límite SAP)", () => {
    const larga = { ...ordenValida, posiciones: [{ ...ordenValida.posiciones[0], descripcion: "x".repeat(41) }] };
    assert.equal(OrdenCompraSchema.safeParse(larga).success, false);
  });

  it("rechaza una sociedad distinta de 1000 y una evidencia sin sha256 válido", () => {
    assert.equal(OrdenCompraSchema.safeParse({ ...ordenValida, sociedad: "2000" }).success, false);
    const sinHash = { ...ordenValida, aprobador: { ...ordenValida.aprobador, evidencia_sha256: "no-es-hash" } };
    assert.equal(OrdenCompraSchema.safeParse(sinHash).success, false);
  });

  it("una validación solo admite reglas RC1–RC10", () => {
    const base = { caso: "sol-002", solicitud_id: "SOL-2026-002", apta: false, confirmaciones: [], derivados: {}, retroactiva: false };
    const ok = ValidacionSchema.safeParse({ ...base, bloqueos: [{ regla: "RC1", detalle: "d", accion_sugerida: "a" }] });
    const mal = ValidacionSchema.safeParse({ ...base, bloqueos: [{ regla: "RC11", detalle: "d", accion_sugerida: "a" }] });
    assert.equal(ok.success, true);
    assert.equal(mal.success, false);
  });
});
