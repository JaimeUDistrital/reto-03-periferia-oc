/**
 * Genera modulo/ (bonus PRD §9.4) desde las fuentes que usa la app, sin copias divergentes:
 * - modulo/agent.md                       ← frontmatter + agent/prompt.md
 * - modulo/skill/ordenes-compra/SKILL.md  ← frontmatter + src/knowledge/ordenes-compra.md
 * - modulo/tools/oc.ts                    ← reexporta src/tools/oc.ts (no se genera: es una línea fija)
 * test/orq/modulo.test.ts falla si los archivos generados no coinciden con las fuentes.
 * Uso: npm run modulo
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = process.cwd();

const FRONT_AGENTE = [
  "---",
  "description: Prepara y crea órdenes de compra en SAP a partir del paquete de la solicitud (correo, solicitud, cotización, aprobación y factura), validándolo contra los maestros y pidiendo confirmación humana en las excepciones.",
  "mode: primary",
  "permission:",
  "  edit: deny",
  "  bash: deny",
  "---",
  "",
].join("\n");

const FRONT_SKILL = [
  "---",
  "name: ordenes-compra",
  "description: Conocimiento del proceso de órdenes de compra de Periferia (paquete, maestros, reglas de control RC1–RC10, OC retroactivas y cómo leer los resultados). Úsala al procesar una solicitud de compra.",
  "---",
  "",
].join("\n");

export const DESTINOS = [
  { fuente: "agent/prompt.md", destino: "modulo/agent.md", frontmatter: FRONT_AGENTE },
  { fuente: "src/knowledge/ordenes-compra.md", destino: "modulo/skill/ordenes-compra/SKILL.md", frontmatter: FRONT_SKILL },
] as const;

/** Contenido esperado de un archivo del módulo a partir de su fuente. */
export async function contenidoEsperado(raiz: string, fuente: string, frontmatter: string): Promise<string> {
  return frontmatter + (await readFile(join(raiz, fuente), "utf8"));
}

async function generar(): Promise<void> {
  for (const { fuente, destino, frontmatter } of DESTINOS) {
    const ruta = join(RAIZ, destino);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, await contenidoEsperado(RAIZ, fuente, frontmatter));
    console.log(`${destino} ← ${fuente}`);
  }
}

// pathToFileURL codifica espacios (%20) igual que import.meta.url: la ruta del proyecto los tiene.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await generar();
