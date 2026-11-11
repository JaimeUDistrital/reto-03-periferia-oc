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

export async function listarSolicitudes(): Promise<string[]> {
  try {
    const resp = await fetch("/api/solicitudes");
    const json: unknown = await resp.json();
    if (resp.ok && Array.isArray(json) && json.length > 0 && json.every((s) => typeof s === "string")) {
      return json as string[];
    }
  } catch {
    // cae a la lista estática
  }
  return SOLICITUDES_ESTATICAS;
}
