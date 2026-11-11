// Secuencia realista de eventos (caso sol-004) para desarrollar sin backend y para los tests.
// Sin APIs del navegador: se compila también con el tsconfig raíz (sin DOM).
import type { EventoChat, Hallazgo, OrdenCompra, Validacion } from "../../../src/domain/contratos-oc";

export const confirmacionGrabada: Hallazgo = {
  regla: "RC5",
  detalle: "Cotización 26.500.000 COP vs solicitud 25.000.000 COP (6,0 %)",
  accion_sugerida: "Confirma que aceptas el sobrecosto o pide una cotización corregida.",
  valores: { solicitud: 25000000, cotizacion: 26500000 },
};

export const validacionGrabada: Validacion = {
  caso: "sol-004",
  solicitud_id: "SOL-2026-004",
  apta: true,
  bloqueos: [],
  confirmaciones: [confirmacionGrabada],
  derivados: { indicador_iva: "C1", condiciones_pago: "Z030" },
  retroactiva: false,
};

export const ordenGrabada: OrdenCompra = {
  referencia: { solicitud_id: "SOL-2026-004", correo_id: "mail-004", cotizacion_ref: "COT-77" },
  sociedad: "1000",
  organizacion_compras: "1000",
  proveedor: { codigo_sap: "100045", nit: "900123456-1", nombre: "Servicios Andinos S.A.S." },
  moneda: "COP",
  condiciones_pago: "Z030",
  aprobador: { email: "jefe@empresa.co", fecha_aprobacion: "2026-11-02", evidencia_sha256: "a".repeat(64) },
  posiciones: [
    { numero: 10, descripcion: "Licencias de analítica", cantidad: 5, unidad: "UN", precio_unitario: 5000000, centro_costo: "CC-100", subarea: "TI-01", indicador_iva: "C1" },
  ],
  excepciones: [{ codigo: "RC5", detalle: confirmacionGrabada.detalle, confirmado_por: null }],
};

export const eventosGrabados: EventoChat[] = [
  { tipo: "tool_call", id: "c1", nombre: "oc_leer_paquete", entrada: { caso: "sol-004" } },
  { tipo: "tool_result", id: "c1", nombre: "oc_leer_paquete", ok: true, ms: 8, salida: { ok: true, data: { caso: "sol-004" } } },
  { tipo: "tool_call", id: "c2", nombre: "oc_validar", entrada: { caso: "sol-004" } },
  { tipo: "tool_result", id: "c2", nombre: "oc_validar", ok: true, ms: 21, salida: { ok: true, data: validacionGrabada } },
  { tipo: "tool_call", id: "c3", nombre: "oc_construir_payload", entrada: { caso: "sol-004" } },
  { tipo: "tool_result", id: "c3", nombre: "oc_construir_payload", ok: true, ms: 15, salida: { ok: true, data: { orden: ordenGrabada, trazabilidad: "out/sol-004/trazabilidad.json" } } },
  { tipo: "mensaje", texto: "La sol-004 tiene una confirmación pendiente (RC5). ¿Confirmas la creación de la OC?" },
  { tipo: "confirmacion_requerida", caso: "sol-004", confirmaciones: [confirmacionGrabada] },
  { tipo: "oc_creada", caso: "sol-004", numero_oc: "4500000002", fecha: "2026-11-10", idempotente: false, retroactiva: false, evidencia: "out/sol-004/aprobacion.txt" },
  { tipo: "fin" },
];
