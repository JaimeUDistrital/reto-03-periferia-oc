/** Elimina claves y tokens de textos que van a logs o a mensajes de error. */

const MARCA = "[REDACTADO]";

const REGLAS: { patron: RegExp; reemplazo: string }[] = [
  { patron: /Bearer\s+[\w.~+/=-]+/gi, reemplazo: `Bearer ${MARCA}` },
  { patron: /Basic\s+[A-Za-z0-9+/=]{8,}/g, reemplazo: `Basic ${MARCA}` },
  { patron: /AIza[\w-]{20,}/g, reemplazo: MARCA },
  { patron: /\bsk-[A-Za-z0-9_-]{16,}/g, reemplazo: MARCA },
  // clave=valor, clave: valor y "clave":"valor" (URLs, cabeceras, JSON serializado).
  {
    patron:
      /\b((?:gemini_api_key|hitl_secret|x-goog-api-key|api[_-]?key|key|token|secret|password|passwd)["']?\s*[=:]\s*["']?)([^\s&"',;]+)/gi,
    reemplazo: `$1${MARCA}`,
  },
  // Token HITL firmado: base64url(payload).base64url(HMAC-SHA256 = 43 caracteres).
  { patron: /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, reemplazo: MARCA },
];

export function redact(texto: string): string {
  return REGLAS.reduce((acc, { patron, reemplazo }) => acc.replace(patron, reemplazo), texto);
}

/** Texto seguro de cualquier error capturado (para logs). */
export function redactarError(error: unknown): string {
  return redact(error instanceof Error ? error.message : String(error));
}
