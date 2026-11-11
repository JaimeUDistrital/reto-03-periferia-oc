/** Log de control para Contabilidad/Auditoría: out/control.csv, una fila por intento (HU-5). */
import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Regla } from "../domain/contratos-oc";
import { conCandado } from "./candado";

export type ResultadoControl = "creada" | "existente" | "bloqueada" | "pendiente" | "rechazada";

export interface FilaControl {
  solicitud_id: string;
  resultado: ResultadoControl;
  numero_oc: string | null;
  retroactiva: boolean;
  bloqueos: Regla[];
  confirmaciones: Regla[];
  ts: string;
}

const CABECERA = "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts";

/** Escapa un campo CSV (RFC 4180): comillas si trae coma, comilla o salto de línea. */
export function campoCsv(valor: string): string {
  return /[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function filaCsv(f: FilaControl): string {
  return [
    f.solicitud_id,
    f.resultado,
    f.numero_oc ?? "",
    String(f.retroactiva),
    f.bloqueos.join("|"),
    f.confirmaciones.join("|"),
    f.ts,
  ]
    .map(campoCsv)
    .join(",");
}

async function existe(ruta: string): Promise<boolean> {
  try {
    await stat(ruta);
    return true;
  } catch {
    return false;
  }
}

export function registrarControl(directory: string, fila: FilaControl): Promise<void> {
  const ruta = path.join(directory, "out", "control.csv");
  return conCandado(`archivo:${ruta}`, async () => {
    await mkdir(path.dirname(ruta), { recursive: true });
    const prefijo = (await existe(ruta)) ? "" : `${CABECERA}\n`;
    await appendFile(ruta, `${prefijo}${filaCsv(fila)}\n`, "utf8");
  });
}
