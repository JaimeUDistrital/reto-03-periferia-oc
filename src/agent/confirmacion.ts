/**
 * Confirmación humana (CA3). Solo el servidor decide si el usuario confirmó: el modelo no puede
 * autoconfirmar con `confirmado: true`. Se confirma un caso únicamente si la sesión tenía ese caso
 * pendiente y el mensaje actual del usuario lo confirma (botón de la UI o texto sin negación).
 */
import type { Pendiente } from "./sesiones";

const MAX_LARGO_CONFIRMACION = 200;

const NEGACION = /\b(no|nunca|jamas|ni|sin|cancel\w*|rechaz\w*|deten\w*|espera\w*|todavia|aun)\b/;
const CONFIRMA = [
  /\bconfirm(o|ado|amos|a)\b/,
  /^si\b[\s,.!]*(crea\w*|procede\w*|adelante|confirm\w*|ok|dale|hazlo|por favor)?[\s.!]*$/,
  /\b(procede\w*|adelante|creala|crearla|apruebo|autorizo|acepto|hazlo|dale|de acuerdo)\b/,
];
const ID_CASO = /\bsol-\d+\b/g;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

/** true si el texto es una confirmación afirmativa, breve, sin negación ni pregunta. */
export function esConfirmacion(texto: string): boolean {
  const t = normalizar(texto);
  if (t === "" || t.length > MAX_LARGO_CONFIRMACION || t.includes("?")) return false;
  if (NEGACION.test(t)) return false;
  return CONFIRMA.some((patron) => patron.test(t));
}

function mencionaOtroCaso(texto: string, caso: string): boolean {
  const ids = normalizar(texto).match(ID_CASO) ?? [];
  return ids.some((id) => id !== normalizar(caso));
}

export interface EntradaConfirmacion {
  pendiente: Pendiente | null;
  mensaje: string;
  /** Caso que la UI confirma con su botón (campo `confirmar` del cuerpo). */
  confirmar?: string;
}

/** Caso que el usuario confirma en este turno, o null. */
export function casoConfirmado({ pendiente, mensaje, confirmar }: EntradaConfirmacion): string | null {
  if (!pendiente) return null;
  if (confirmar !== undefined) return confirmar === pendiente.caso ? pendiente.caso : null;
  if (mencionaOtroCaso(mensaje, pendiente.caso)) return null;
  return esConfirmacion(mensaje) ? pendiente.caso : null;
}

/** Valor de `ctx.confirmacionHumana`: true solo para el caso confirmado por el usuario. */
export function crearGuardia(confirmado: string | null): (caso: string) => boolean {
  return (caso) => confirmado !== null && caso === confirmado;
}
