/** Descubrimiento y validación del nombre de caso. El nombre nunca se usa como ruta sin pasar por aquí. */
import { readdir } from "node:fs/promises";
import path from "node:path";

export const NOMBRE_CASO = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function dirSolicitudes(directory: string): string {
  return path.join(directory, "fixtures", "reto-03", "solicitudes");
}

/** Carpetas de caso disponibles (ordenadas); [] si no existe fixtures/reto-03/solicitudes. */
export async function listarCasos(directory: string): Promise<string[]> {
  try {
    const entradas = await readdir(dirSolicitudes(directory), { withFileTypes: true });
    return entradas
      .filter((e) => e.isDirectory() && NOMBRE_CASO.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Devuelve el nombre si es válido y existe como carpeta; si no, null (nada de rutas). */
export async function casoValido(directory: string, caso: string): Promise<string | null> {
  if (!NOMBRE_CASO.test(caso)) return null;
  return (await listarCasos(directory)).includes(caso) ? caso : null;
}
