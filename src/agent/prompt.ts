import { readFileSync } from "node:fs";

let cache: string | undefined;

const leer = (ruta: string): string => readFileSync(new URL(ruta, import.meta.url), "utf8").trim();

/**
 * Sistema del agente = comportamiento (agent/prompt.md) + conocimiento (src/knowledge/ordenes-compra.md).
 * Nada embebido en código: cambiar reglas o tono es editar esos archivos.
 */
export function cargarSistema(): string {
  cache ??= `${leer("../../agent/prompt.md")}\n\n# Conocimiento del proceso\n\n${leer("../knowledge/ordenes-compra.md")}\n`;
  return cache;
}
