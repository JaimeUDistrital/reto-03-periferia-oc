// Cliente HTTP del backend (usa fetch del navegador).
import type { EventoAgente, TurnoHistorial } from "../../src/domain/contratos";
import { esEventoAgente, extraerEventos } from "./sse";

export const SOLICITUDES_ESTATICAS = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"];

const errorDeRed = (mensaje: string): EventoAgente => ({ tipo: "error", mensaje, correlationId: "cliente" });

async function leerSse(url: string, cuerpo: unknown, alEvento: (e: EventoAgente) => void): Promise<void> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(cuerpo),
    });
    if (!resp.ok || !resp.body) {
      alEvento(errorDeRed(`El servidor respondió ${resp.status}.`));
      return;
    }
    const lector = resp.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      const r = extraerEventos(buffer + value);
      buffer = r.resto;
      r.eventos.forEach(alEvento);
    }
    if (buffer.trim()) extraerEventos(buffer + "\n\n").eventos.forEach(alEvento);
  } catch {
    alEvento(errorDeRed("No se pudo conectar con el servidor."));
  }
}

export const chat = (historial: TurnoHistorial[], mensaje: string, alEvento: (e: EventoAgente) => void) =>
  leerSse("/api/chat", { historial, mensaje }, alEvento);

export const evaluar = (solicitudId: string, alEvento: (e: EventoAgente) => void) =>
  leerSse("/api/evaluar", { solicitudId }, alEvento);

export async function confirmar(token: string, accion: "aprobar" | "rechazar"): Promise<EventoAgente> {
  try {
    const resp = await fetch("/api/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, accion }),
    });
    const json: unknown = await resp.json();
    return esEventoAgente(json) ? json : errorDeRed(`Respuesta inesperada (${resp.status}).`);
  } catch {
    return errorDeRed("No se pudo conectar con el servidor.");
  }
}

/** Lee la respuesta de GET /api/solicitudes: `{ solicitudes: string[] }`. */
export function extraerSolicitudes(json: unknown): string[] | null {
  if (typeof json !== "object" || json === null || !("solicitudes" in json)) return null;
  const lista: unknown = json.solicitudes;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const ids = lista.filter((s): s is string => typeof s === "string");
  return ids.length === lista.length ? ids : null;
}

export async function listarSolicitudes(): Promise<string[]> {
  try {
    const resp = await fetch("/api/solicitudes");
    const ids = resp.ok ? extraerSolicitudes(await resp.json()) : null;
    if (ids) return ids;
  } catch {
    // cae a la lista estática
  }
  return SOLICITUDES_ESTATICAS;
}
