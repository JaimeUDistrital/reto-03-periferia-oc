/**
 * Detección de datos alterados por el modelo (PRD §10: «el modelo arregla un monto»).
 * La fuente manda: si lo recibido difiere en un campo crítico de lo reconstruido, se rechaza.
 */
export interface Diferencia {
  campo: string;
  esperado: unknown;
  recibido: unknown;
}

function obtener(valor: unknown, ruta: string): unknown {
  let actual = valor;
  for (const parte of ruta.split(".")) {
    if (actual === null || typeof actual !== "object") return undefined;
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual;
}

/** Compara solo los campos presentes en `recibido`; un campo ausente no se considera alterado. */
function comparar(esperado: unknown, recibido: unknown, rutas: string[]): Diferencia[] {
  const diferencias: Diferencia[] = [];
  for (const campo of rutas) {
    const r = obtener(recibido, campo);
    const e = obtener(esperado, campo);
    if (r !== undefined && r !== e) diferencias.push({ campo, esperado: e ?? null, recibido: r });
  }
  return diferencias;
}

const CAMPOS_PAQUETE = [
  "solicitud.proveedor_nit",
  "solicitud.centro_costo",
  "solicitud.subarea",
  "solicitud.cantidad",
  "solicitud.valor_unitario",
  "solicitud.valor_total",
  "solicitud.moneda",
  "solicitud.indicador_iva",
  "solicitud.condiciones_pago",
  "cotizacion.total",
  "cotizacion.nit",
  "aprobacion.de",
];

export function diferenciasPaquete(esperado: unknown, recibido: Record<string, unknown>): Diferencia[] {
  return comparar(esperado, recibido, CAMPOS_PAQUETE);
}

export function diferenciasDerivados(esperado: Record<string, string>, recibido: Record<string, unknown>): Diferencia[] {
  return Object.entries(recibido)
    .filter(([clave, valor]) => esperado[clave] !== valor)
    .map(([clave, valor]) => ({ campo: `derivados.${clave}`, esperado: esperado[clave] ?? null, recibido: valor }));
}

const CAMPOS_ORDEN = ["proveedor.nit", "proveedor.codigo_sap", "proveedor.nombre", "moneda", "condiciones_pago", "aprobador.email", "aprobador.evidencia_sha256"];
const CAMPOS_POSICION = ["cantidad", "precio_unitario", "centro_costo", "subarea", "indicador_iva"];

export function diferenciasPayload(esperado: { posiciones: unknown[] }, recibido: Record<string, unknown>): Diferencia[] {
  const posiciones = Array.isArray(recibido["posiciones"]) ? recibido["posiciones"] : null;
  const rutas = [...CAMPOS_ORDEN];
  const diferencias: Diferencia[] = [];
  if (posiciones !== null && posiciones.length !== esperado.posiciones.length) {
    diferencias.push({ campo: "posiciones", esperado: esperado.posiciones.length, recibido: posiciones.length });
  }
  esperado.posiciones.forEach((_, i) => rutas.push(...CAMPOS_POSICION.map((c) => `posiciones.${i}.${c}`)));
  return [...diferencias, ...comparar(esperado, recibido, rutas)];
}

export function resumenDiferencias(d: Diferencia[]): string {
  return d.map((x) => `${x.campo}: fuente ${JSON.stringify(x.esperado)}, recibido ${JSON.stringify(x.recibido)}`).join("; ");
}
