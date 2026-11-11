/** Lectura de .xlsx confinada a fixtures/ (P1, `oc_leer_excel`). */
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { readSheet } from "read-excel-file/node";
import { ErrorEntrada } from "../domain/tipos";

export type Celda = string | number | boolean | null;

const SUGERENCIA = "Indica la ruta de un .xlsx dentro de fixtures/, por ejemplo fixtures/reto-03/solicitudes/sol-001/solicitud.xlsx.";

/** Resuelve `ruta` (relativa) y exige que quede dentro de fixtures/ incluso tras seguir enlaces simbólicos. */
async function rutaConfinada(directory: string, ruta: string): Promise<string> {
  if (path.isAbsolute(ruta) || ruta.includes("\0")) throw new ErrorEntrada("La ruta debe ser relativa al proyecto.", SUGERENCIA);
  const base = path.join(directory, "fixtures");
  const candidata = path.resolve(directory, ruta);
  const dentro = (r: string) => r !== "" && !r.startsWith("..") && !path.isAbsolute(r);
  if (!dentro(path.relative(base, candidata))) throw new ErrorEntrada("La ruta queda fuera de fixtures/.", SUGERENCIA);
  let real: string;
  try {
    real = await realpath(candidata);
  } catch {
    throw new ErrorEntrada(`No existe el archivo ${ruta}.`, SUGERENCIA);
  }
  if (!dentro(path.relative(await realpath(base), real)) || !(await stat(real)).isFile()) {
    throw new ErrorEntrada("La ruta queda fuera de fixtures/ o no es un archivo.", SUGERENCIA);
  }
  if (!/\.xlsx$/i.test(real)) throw new ErrorEntrada("Solo se leen archivos .xlsx.", SUGERENCIA);
  return real;
}

function aCelda(valor: unknown): Celda {
  if (valor instanceof Date) return valor.toISOString();
  return typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean" ? valor : null;
}

export async function leerExcel(directory: string, ruta: string): Promise<Celda[][]> {
  const real = await rutaConfinada(directory, ruta);
  try {
    const filas: unknown[][] = await readSheet(real);
    return filas.map((f) => f.map(aCelda));
  } catch {
    throw new ErrorEntrada(`${ruta} no es un .xlsx válido.`, "Pide al solicitante que reenvíe la solicitud en formato .xlsx.");
  }
}
