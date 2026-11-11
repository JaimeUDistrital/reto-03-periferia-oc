/**
 * Token de confirmación humana (HITL), sin estado en servidor (docs/PLAN.md §5.7):
 *   token = base64url(payload) + "." + base64url(HMAC-SHA256(secreto, base64url(payload)))
 *   payload = { solicitudId, hash, exp }  (exp en ms desde epoch; TTL 10 min)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import * as z from "zod";

export const DIEZ_MINUTOS_MS = 10 * 60 * 1000;
const MAX_LONGITUD_TOKEN = 2048;

export type Reloj = () => number;

const PayloadSchema = z.object({
  solicitudId: z.string().min(1),
  hash: z.string().min(1),
  exp: z.number().int(),
});
export type PayloadToken = z.infer<typeof PayloadSchema>;

export type ResultadoVerificacion =
  | { ok: true; payload: PayloadToken }
  | { ok: false; motivo: "formato" | "firma" | "caducado" };

function firmar(payloadB64: string, secreto: string): Buffer {
  return createHmac("sha256", secreto).update(payloadB64).digest();
}

export function firmarToken(
  datos: { solicitudId: string; hash: string },
  secreto: string,
  ahora: Reloj = Date.now,
): string {
  const payload: PayloadToken = { solicitudId: datos.solicitudId, hash: datos.hash, exp: ahora() + DIEZ_MINUTOS_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${firmar(payloadB64, secreto).toString("base64url")}`;
}

export function verificarToken(token: string, secreto: string, ahora: Reloj = Date.now): ResultadoVerificacion {
  if (token.length === 0 || token.length > MAX_LONGITUD_TOKEN) return { ok: false, motivo: "formato" };
  const partes = token.split(".");
  if (partes.length !== 2) return { ok: false, motivo: "formato" };
  const [payloadB64, firmaB64] = partes as [string, string];

  const esperada = firmar(payloadB64, secreto);
  const recibida = Buffer.from(firmaB64, "base64url");
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    return { ok: false, motivo: "firma" };
  }

  let crudo: unknown;
  try {
    crudo = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, motivo: "formato" };
  }
  const parseado = PayloadSchema.safeParse(crudo);
  if (!parseado.success) return { ok: false, motivo: "formato" };
  if (ahora() >= parseado.data.exp) return { ok: false, motivo: "caducado" };
  return { ok: true, payload: parseado.data };
}
