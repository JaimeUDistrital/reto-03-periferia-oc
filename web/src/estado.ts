// Reductor puro de la conversación. Sin DOM ni React (se prueba con node:test).
import type { EventoChat, Hallazgo, OcCreada, OrdenCompra, Validacion } from "../../src/domain/contratos-oc";

export interface ResultadoTool {
  ok: boolean;
  ms: number;
  salida: unknown;
}

export type OcCreadaCaso = OcCreada & { caso: string };

export type Item =
  | { tipo: "usuario"; texto: string }
  | { tipo: "modelo"; texto: string }
  | { tipo: "tool"; id: string; nombre: string; entrada: unknown; resultado?: ResultadoTool }
  | { tipo: "oc"; oc: OcCreadaCaso }
  | { tipo: "error"; mensaje: string; correlationId: string };

export interface Confirmacion {
  caso: string;
  confirmaciones: Hallazgo[];
}

export interface Estado {
  items: Item[];
  confirmacion: Confirmacion | null;
  /** Último `Validacion` de un `oc_validar` correcto (panel de resultado). */
  validacion: Validacion | null;
  /** Última `OrdenCompra` de un `oc_construir_payload` correcto. */
  orden: OrdenCompra | null;
  ocCreada: OcCreadaCaso | null;
}

export const estadoInicial: Estado = {
  items: [],
  confirmacion: null,
  validacion: null,
  orden: null,
  ocCreada: null,
};

/** Un mensaje nuevo del usuario deja sin efecto la confirmación pendiente. */
export function agregarMensajeUsuario(estado: Estado, texto: string): Estado {
  return { ...estado, confirmacion: null, items: [...estado.items, { tipo: "usuario", texto }] };
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `data` de una salida `{ ok: true, data }`; null si no tiene esa forma. */
export function datosOk(salida: unknown): unknown {
  return esObjeto(salida) && salida["ok"] === true ? (salida["data"] ?? null) : null;
}

export function comoValidacion(valor: unknown): Validacion | null {
  if (!esObjeto(valor)) return null;
  const { caso, solicitud_id, apta, bloqueos, confirmaciones, derivados, retroactiva } = valor;
  const ok =
    typeof caso === "string" && typeof solicitud_id === "string" && typeof apta === "boolean" &&
    Array.isArray(bloqueos) && Array.isArray(confirmaciones) && esObjeto(derivados) && typeof retroactiva === "boolean";
  return ok ? (valor as unknown as Validacion) : null;
}

export function comoOrden(valor: unknown): OrdenCompra | null {
  if (!esObjeto(valor)) return null;
  const { proveedor, posiciones, excepciones, referencia } = valor;
  const ok = esObjeto(proveedor) && esObjeto(referencia) && Array.isArray(posiciones) && Array.isArray(excepciones);
  return ok ? (valor as unknown as OrdenCompra) : null;
}

/** `data.orden` de la salida de `oc_construir_payload`. */
const ordenDeSalida = (salida: unknown): OrdenCompra | null => {
  const data = datosOk(salida);
  return esObjeto(data) ? comoOrden(data["orden"]) : null;
};

function conResultado(estado: Estado, nombre: string, ok: boolean, salida: unknown): Estado {
  if (!ok) return estado;
  if (nombre === "oc_validar") {
    const v = comoValidacion(datosOk(salida));
    if (!v) return estado;
    const otroCaso = estado.validacion !== null && estado.validacion.caso !== v.caso;
    return otroCaso ? { ...estado, validacion: v, orden: null, ocCreada: null } : { ...estado, validacion: v };
  }
  if (nombre === "oc_construir_payload") {
    const orden = ordenDeSalida(salida);
    return orden ? { ...estado, orden } : estado;
  }
  return estado;
}

export function aplicarEvento(estado: Estado, evento: EventoChat): Estado {
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
      return conResultado({ ...estado, items }, evento.nombre, evento.ok, evento.salida);
    }
    case "mensaje":
      return { ...estado, items: [...estado.items, { tipo: "modelo", texto: evento.texto }] };
    case "confirmacion_requerida":
      return { ...estado, confirmacion: { caso: evento.caso, confirmaciones: evento.confirmaciones } };
    case "oc_creada": {
      const { tipo: _tipo, ...oc } = evento;
      return { ...estado, confirmacion: null, ocCreada: oc, items: [...estado.items, { tipo: "oc", oc }] };
    }
    case "error":
      return {
        ...estado,
        items: [...estado.items, { tipo: "error", mensaje: evento.mensaje, correlationId: evento.correlationId }],
      };
    case "fin":
      return estado;
  }
}
