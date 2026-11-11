/** Ayudas de los tests de core: raíz del repo y copias temporales de fixtures (nunca se escribe en el repo). */
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after } from "node:test";
import type { CtxHerramienta } from "../../src/domain/contratos-oc";

export const RAIZ = path.resolve(import.meta.dirname, "..", "..");

export const AHORA_FIJO = new Date("2026-11-10T12:00:00.000Z");

/** Directorio de proyecto temporal con una copia de fixtures/; se borra al terminar el archivo de test. */
export async function proyectoTemporal(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "oc-core-"));
  await cp(path.join(RAIZ, "fixtures"), path.join(dir, "fixtures"), { recursive: true });
  after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export function ctxDe(directory: string, extra: Partial<CtxHerramienta> = {}): CtxHerramienta {
  return { directory, sessionId: "sesion-test", ahora: () => AHORA_FIJO, ...extra };
}
