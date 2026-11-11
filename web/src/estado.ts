// Reductor puro de la conversación. Sin DOM ni React (se prueba con node:test).
import type { Dictamen, EventoAgente, OrdenCompra, TurnoHistorial } from "../../src/domain/contratos";

export interface ResultadoTool {
  ok: boolean;
  ms: number;
  salida: unknown;
}

export type Item =
  | { tipo: "usuario"; texto: string }
  | { tipo: "modelo"; texto: string }
  | { tipo: "tool"; id: string; nombre: string; entrada: unknown; resultado?: ResultadoTool }
  | { tipo: "oc"; orden: OrdenCompra }
  | { tipo: "error"; mensaje: string; correlationId: string };

export interface Confirmacion {
  token: string;
  solicitudId: string;
  dictamen: Dictamen;
}

export interface Estado {
  items: Item[];
  confirmacion: Confirmacion | null;
  /** Último dictamen visto (panel Expediente). */
  dictamen: Dictamen | null;
  orden: OrdenCompra | null;
  /** Historial para el siguiente turno (viene del evento `fin`). */
  historial: TurnoHistorial[];
}

export const estadoInicial: Estado = {
  items: [],
  confirmacion: null,
  dictamen: null,
  orden: null,
  historial: [],
};

export function agregarMensajeUsuario(estado: Estado, texto: string): Estado {
  return { ...estado, items: [...estado.items, { tipo: "usuario", texto }] };
}

const ESTADOS_CONTROL = ["OK", "ALERTA", "BLOQUEO"];

/** Reconoce la forma de un Dictamen en una salida de tool (`unknown`). */
export function comoDictamen(valor: unknown): Dictamen | null {
  if (typeof valor !== "object" || valor === null) return null;
  const v = valor as Record<string, unknown>;
  if (typeof v["solicitudId"] !== "string" || typeof v["decision"] !== "string" || typeof v["hash"] !== "string") return null;
  const controles = v["controles"];
  if (!Array.isArray(controles)) return null;
  const validos = controles.every((c: unknown) => {
    if (typeof c !== "object" || c === null) return false;
    const r = c as Record<string, unknown>;
    return typeof r["id"] === "string" && typeof r["nombre"] === "string" && typeof r["detalle"] === "string" &&
      typeof r["estado"] === "string" && ESTADOS_CONTROL.includes(r["estado"]);
  });
  return validos ? (valor as Dictamen) : null;
}

export function aplicarEvento(estado: Estado, evento: EventoAgente): Estado {
  switch (evento.tipo) {
    case "tool_call":
      return {
        ...estado,
        items: [...estado.items, { tipo: "tool", id: evento.id, nombre: evento.nombre, entrada: evento.entrada }],
      };
    case "tool_result": {
      const resultado: ResultadoTool = { ok: evento.ok, ms: evento.ms, salida: evento.salida };
      const existe = estado.items.some((i) => i.tipo === "tool" && i.id === evento.id);
      const items: Item[] = existe
        ? estado.items.map((i) => (i.tipo === "tool" && i.id === evento.id ? { ...i, resultado } : i))
        : [...estado.items, { tipo: "tool", id: evento.id, nombre: evento.nombre, entrada: undefined, resultado }];
      return { ...estado, items, dictamen: (evento.ok ? comoDictamen(evento.salida) : null) ?? estado.dictamen };
    }
    case "mensaje":
      return { ...estado, items: [...estado.items, { tipo: "modelo", texto: evento.texto }] };
    case "confirmacion_requerida":
      return {
        ...estado,
        confirmacion: { token: evento.token, solicitudId: evento.solicitudId, dictamen: evento.dictamen },
        dictamen: evento.dictamen,
      };
    case "oc_creada":
      return {
        ...estado,
        confirmacion: null,
        orden: evento.orden,
        items: [...estado.items, { tipo: "oc", orden: evento.orden }],
      };
    case "error":
      return {
        ...estado,
        items: [...estado.items, { tipo: "error", mensaje: evento.mensaje, correlationId: evento.correlationId }],
      };
    case "fin":
      return { ...estado, historial: evento.historial };
  }
}
