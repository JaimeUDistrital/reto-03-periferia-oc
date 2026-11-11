/** Contenido y huella de la evidencia de aprobación (HU-4). Funciones puras compartidas por payload y archivo. */
import { createHash } from "node:crypto";
import type { Aprobacion } from "./tipos";

/** Encabezados + cuerpo; es el texto sobre el que se calcula el sha256 (termina en salto de línea). */
export function contenidoEvidencia(a: Aprobacion): string {
  return `De: ${a.de}\nPara: ${a.para}\nFecha: ${a.fecha}\nAsunto: ${a.asunto}\n\n${a.texto}\n`;
}

export function sha256Hex(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export function shaEvidencia(a: Aprobacion): string {
  return sha256Hex(contenidoEvidencia(a));
}

/** Archivo completo: contenido + línea final `sha256: <hex>` del contenido anterior. */
export function textoEvidencia(a: Aprobacion): string {
  return `${contenidoEvidencia(a)}\nsha256: ${shaEvidencia(a)}\n`;
}
