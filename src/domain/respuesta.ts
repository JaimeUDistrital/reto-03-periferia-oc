/** Respuestas de las herramientas: `{ ok: true, data }` o `{ ok: false, error, codigo, ... }`. Nunca se lanza al modelo. */
import type { CodigoError, RespuestaError, RespuestaOk } from "./contratos-oc";
import { ErrorEntrada } from "./tipos";

export type Respuesta<T> = RespuestaOk<T> | RespuestaError;

export const ok = <T>(data: T): RespuestaOk<T> => ({ ok: true, data });

export const fallo = (codigo: CodigoError, error: string, extra: Record<string, unknown> = {}): RespuestaError => ({
  ...extra,
  ok: false,
  error,
  codigo,
});

/** Ejecuta la herramienta y serializa; convierte cualquier excepción en una respuesta de error legible. */
export async function protegido<T>(ejecutar: () => Promise<Respuesta<T>>): Promise<string> {
  try {
    return JSON.stringify(await ejecutar());
  } catch (e) {
    if (e instanceof ErrorEntrada) return JSON.stringify(fallo("ENTRADA_INVALIDA", e.message, { sugerencia: e.sugerencia }));
    const motivo = e instanceof Error ? e.message : "error desconocido";
    return JSON.stringify(fallo("ERROR", `No se pudo completar la operación: ${motivo}`));
  }
}
