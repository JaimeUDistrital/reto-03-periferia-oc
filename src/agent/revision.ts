/**
 * «Revisar sin IA» (POST /api/evaluar): ejecuta por el mismo registro leer_paquete → validar → construir_payload,
 * sin LLM y sin crear la OC. Emite los mismos eventos que el chat y deja el caso pendiente si hay confirmaciones.
 */
import type { CtxHerramienta } from "../domain/contratos-oc";
import { avisarPendiente, dataDe, procesarLlamada, type ContextoLlamada, type EstadoTurno } from "./loop";
import type { Sesion } from "./sesiones";

export interface EntradaRevision extends Omit<ContextoLlamada, "sesion"> {
  caso: string;
  directory: string;
  /** Sesión opcional: si la revisión deja confirmaciones, el caso queda pendiente en ella. */
  sesion?: Sesion;
}

function campo(data: unknown, nombre: string): unknown {
  return data !== null && typeof data === "object" ? (data as Record<string, unknown>)[nombre] : undefined;
}

export async function revisarSinIA(e: EntradaRevision): Promise<void> {
  // Sesión temporal: los mensajes de herramienta sueltos no deben mezclarse con el historial del chat.
  const temporal: Sesion = { id: e.sesion?.id ?? "revision", mensajes: [], pendiente: null, tokens: 0, ocupada: false };
  const ctx: CtxHerramienta = { directory: e.directory, sessionId: temporal.id, confirmacionHumana: () => false, ahora: e.ahora };
  const contexto: ContextoLlamada = { ...e, sesion: temporal };
  const estado: EstadoTurno = { ejecutadas: [], pendienteNuevo: false, confirmacionEmitida: false };
  const llamar = (id: string, nombre: string, args: Record<string, unknown>) => procesarLlamada(contexto, ctx, { id, nombre, args }, estado);

  const leido = await llamar("rev-1", "oc_leer_paquete", { caso: e.caso });
  if (!leido.ok) return;
  const paquete = dataDe(leido.salida);

  const validado = await llamar("rev-2", "oc_validar", { caso: e.caso, paquete });
  if (!validado.ok) return;
  const derivados = campo(dataDe(validado.salida), "derivados") ?? {};

  await llamar("rev-3", "oc_construir_payload", { caso: e.caso, paquete, derivados });
  await avisarPendiente(contexto, estado);
  if (e.sesion) e.sesion.pendiente = temporal.pendiente;
}
