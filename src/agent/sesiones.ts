/** Sesiones en memoria (PRD §6.1): historial completo, confirmación pendiente y tokens usados. */
import type { Hallazgo } from "../domain/contratos-oc";
import type { Mensaje } from "../llm/adapter";

export const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface Pendiente {
  caso: string;
  confirmaciones: Hallazgo[];
}

export interface Sesion {
  id: string;
  mensajes: Mensaje[];
  pendiente: Pendiente | null;
  tokens: number;
  /** true mientras se ejecuta un turno: evita dos turnos simultáneos sobre el mismo historial. */
  ocupada: boolean;
}

export interface AlmacenSesiones {
  /** undefined si el id no es válido. Crea la sesión si no existe. */
  obtenerOCrear(id: string): Sesion | undefined;
  obtener(id: string): Sesion | undefined;
  agregar(sesion: Sesion, mensaje: Mensaje): void;
  tamano(): number;
}

export interface OpcionesSesiones {
  maxSesiones?: number;
  maxMensajes?: number;
}

/** Recorta por el principio hasta caber, empezando siempre en un mensaje de usuario (sin partir llamada/respuesta). */
function recortar(mensajes: Mensaje[], max: number): void {
  if (mensajes.length <= max) return;
  let corte = mensajes.length - max;
  while (corte < mensajes.length && mensajes[corte]?.rol !== "usuario") corte++;
  mensajes.splice(0, corte);
}

export function crearAlmacenSesiones(opciones: OpcionesSesiones = {}): AlmacenSesiones {
  const maxSesiones = opciones.maxSesiones ?? 200;
  const maxMensajes = opciones.maxMensajes ?? 200;
  const sesiones = new Map<string, Sesion>();

  const crear = (id: string): Sesion => {
    if (sesiones.size >= maxSesiones) {
      const masAntigua = sesiones.keys().next().value;
      if (masAntigua !== undefined) sesiones.delete(masAntigua);
    }
    const sesion: Sesion = { id, mensajes: [], pendiente: null, tokens: 0, ocupada: false };
    sesiones.set(id, sesion);
    return sesion;
  };

  return {
    obtenerOCrear(id) {
      if (!SESSION_ID_RE.test(id)) return undefined;
      return sesiones.get(id) ?? crear(id);
    },
    obtener: (id) => sesiones.get(id),
    agregar(sesion, mensaje) {
      sesion.mensajes.push(mensaje);
      recortar(sesion.mensajes, maxMensajes);
    },
    tamano: () => sesiones.size,
  };
}
