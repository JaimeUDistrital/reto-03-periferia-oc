/**
 * Resultado esperado de los 6 casos reales (PRD §3.1 y §7.3). Lo fija el orquestador (B1).
 * Supuestos (van a SOLUCION.md §9):
 * - Fechas: se compara la fecha de calendario tal como viene escrita (primeros 10 caracteres).
 * - RC3 solo se evalúa si el aprobador está en la lista del centro; si no, RC2 ya bloquea.
 * - Numeración en demo.ts: out/ limpio y orden sol-001, sol-001 (idempotente), 002, 003, 004, 005, 006,
 *   confirmando 004, 005 y 006 tras un primer intento sin confirmar.
 */
import type { Regla } from "../../src/domain/contratos-oc";

export interface CasoEsperado {
  caso: string;
  solicitud_id: string;
  apta: boolean;
  bloqueos: Regla[];
  confirmaciones: Regla[];
  derivados: Record<string, string>;
  retroactiva: boolean;
  /** Número de OC que asigna demo.ts; null si no se crea. */
  numero_oc_demo: string | null;
}

export const CASOS_ESPERADOS: CasoEsperado[] = [
  { caso: "sol-001", solicitud_id: "SOL-2026-001", apta: true, bloqueos: [], confirmaciones: [], derivados: {}, retroactiva: false, numero_oc_demo: "4500000001" },
  // Proveedor NIT 901999000 no existe en el maestro.
  { caso: "sol-002", solicitud_id: "SOL-2026-002", apta: false, bloqueos: ["RC1"], confirmaciones: [], derivados: {}, retroactiva: false, numero_oc_demo: null },
  // fvargas aprueba CC-3030, no CC-2020 (cuyo único aprobador, rtorres, tiene tope 30M < 74M).
  { caso: "sol-003", solicitud_id: "SOL-2026-003", apta: false, bloqueos: ["RC2"], confirmaciones: [], derivados: {}, retroactiva: false, numero_oc_demo: null },
  // Cotización 26.500.000 vs solicitud 25.000.000 = 6 % > 2 %.
  { caso: "sol-004", solicitud_id: "SOL-2026-004", apta: true, bloqueos: [], confirmaciones: ["RC5"], derivados: {}, retroactiva: false, numero_oc_demo: "4500000002" },
  // Factura 2026-08-10 anterior a la solicitud 2026-08-27.
  { caso: "sol-005", solicitud_id: "SOL-2026-005", apta: true, bloqueos: [], confirmaciones: ["RC8"], derivados: {}, retroactiva: true, numero_oc_demo: "4500000003" },
  // Sin indicador_iva ni condiciones_pago: se derivan del proveedor TecnoSuministros (por nombre, sin NIT).
  { caso: "sol-006", solicitud_id: "SOL-2026-006", apta: true, bloqueos: [], confirmaciones: ["RC6"], derivados: { indicador_iva: "C1", condiciones_pago: "Z030" }, retroactiva: false, numero_oc_demo: "4500000004" },
];
