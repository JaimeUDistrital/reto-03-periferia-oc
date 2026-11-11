// Secuencia realista de eventos para desarrollar sin backend y para los tests.
// Sin APIs del navegador: se compila también con el tsconfig raíz (sin DOM).
import type { Dictamen, EventoAgente, TurnoHistorial } from "../../../src/domain/contratos";

export const dictamenGrabado: Dictamen = {
  solicitudId: "sol-001",
  decision: "REQUIERE_REVISION",
  hash: "9f2c1e7ab04d58f3c6d1a2b7e8f90c3d4a5b6c7d8e9f001122334455667788aa",
  controles: [
    { id: "CTRL-PROVEEDOR", nombre: "Proveedor activo", estado: "OK", detalle: "Proveedor activo y no bloqueado.", evidencia: { nit: "900.***.***-1" } },
    { id: "CTRL-PRESUPUESTO", nombre: "Presupuesto disponible", estado: "OK", detalle: "Saldo suficiente en el centro de costo.", evidencia: { saldo: 48200000, monto: 12500000 } },
    { id: "CTRL-CONTRATO", nombre: "Vigencia del contrato", estado: "ALERTA", detalle: "El contrato vence en 12 días.", evidencia: { vence: "2026-11-22" } },
  ],
};

const historial: TurnoHistorial[] = [
  { tipo: "usuario", texto: "Valida la solicitud sol-001" },
  { tipo: "modelo", llamadas: [{ id: "c1", nombre: "consultar_solicitud", args: { solicitudId: "sol-001" } }] },
  { tipo: "resultado_tool", llamadaId: "c1", nombre: "consultar_solicitud", resultado: { solicitudId: "sol-001" } },
];

export const eventosGrabados: EventoAgente[] = [
  { tipo: "tool_call", id: "c1", nombre: "consultar_solicitud", entrada: { solicitudId: "sol-001" } },
  { tipo: "tool_result", id: "c1", nombre: "consultar_solicitud", ok: true, ms: 12, salida: { solicitudId: "sol-001", proveedor: "Suministros del Norte S.A.S.", nit: "900.***.***-1", monto: 12500000, moneda: "COP" } },
  { tipo: "tool_call", id: "c2", nombre: "evaluar_solicitud", entrada: { solicitudId: "sol-001" } },
  { tipo: "tool_result", id: "c2", nombre: "evaluar_solicitud", ok: true, ms: 31, salida: dictamenGrabado },
  { tipo: "mensaje", texto: "La solicitud sol-001 requiere revisión: el contrato vence en 12 días. Los demás controles están en regla.\n¿Creo la orden de compra?" },
  { tipo: "tool_call", id: "c3", nombre: "crear_orden_compra", entrada: { solicitudId: "sol-001" } },
  { tipo: "confirmacion_requerida", token: "tok.demo.abc123", solicitudId: "sol-001", dictamen: dictamenGrabado },
  { tipo: "oc_creada", orden: { numero: "4500001234", solicitudId: "sol-001", creadaEn: "2026-11-10T15:04:05.000Z" } },
  { tipo: "fin", historial },
];
