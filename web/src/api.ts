// Cliente HTTP del backend (usa fetch del navegador).
import type { EventoChat } from "../../src/domain/contratos-oc";
import { extraerEventos } from "./sse";
import { ID_ERROR_RED } from "./vista";

export const CASOS_ESTATICOS = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"];

const errorDeRed = (mensaje: string): EventoChat => ({ tipo: "error", mensaje, correlationId: ID_ERROR_RED });

async function leerSse(url: string, cuerpo: unknown, alEvento: (e: EventoChat) => void): Promise<void> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(cuerpo),
    });
    if (!resp.ok || !resp.body) {
      alEvento(errorDeRed(`El servidor respondió ${resp.status}. Puedes reintentar.`));
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
    alEvento(errorDeRed("No se pudo conectar con el servidor. Revisa tu conexión y reintenta."));
  }
}

/** POST /api/chat. `confirmar` = caso que el usuario confirma con el botón de la tarjeta; el texto libre lo evalúa el servidor. */
export const chat = (sessionId: string, message: string, confirmar: string | undefined, alEvento: (e: EventoChat) => void) =>
  leerSse("/api/chat", confirmar ? { sessionId, message, confirmar } : { sessionId, message }, alEvento);

/** POST /api/evaluar: leer, validar y construir la OC sin LLM. Con la sesión, el servidor deja el caso pendiente para «Confirmar». */
export const evaluar = (sessionId: string, caso: string, alEvento: (e: EventoChat) => void) => leerSse("/api/evaluar", { caso, sessionId }, alEvento);

/** Lee la respuesta de GET /api/casos: `{ casos: string[] }`. */
export function extraerCasos(json: unknown): string[] | null {
  if (typeof json !== "object" || json === null || !("casos" in json)) return null;
  const lista: unknown = json.casos;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const ids = lista.filter((s): s is string => typeof s === "string");
  return ids.length === lista.length ? ids : null;
}

export async function listarCasos(): Promise<string[]> {
  try {
    const resp = await fetch("/api/casos");
    const ids = resp.ok ? extraerCasos(await resp.json()) : null;
    if (ids) return ids;
  } catch {
    // cae a la lista estática
  }
  return CASOS_ESTATICOS;
}
