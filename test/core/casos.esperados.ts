import type { Decision } from "../../src/domain/contratos";

/** Dictamen esperado de cada solicitud. ORQ lo completa en B1 con los 6 casos reales. */
export const CASOS_ESPERADOS: Record<string, Decision> = {
  "sol-001": "APROBABLE",
  "sol-002": "RECHAZADA",
};
