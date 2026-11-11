/**
 * Demo sin LLM ni red: evalúa todas las solicitudes sol-* con el núcleo determinista.
 * Uso: `npm run demo` (tabla) · `npm run demo -- --md` (matriz Markdown para SOLUCION.md).
 * Sale con código 1 si algún dictamen difiere de test/core/casos.esperados.ts (si existe).
 */
import type { Decision, Dictamen } from "./src/domain/contratos";
import { evaluarSolicitud, listarSolicitudes } from "./src/tools/oc";

async function cargarEsperados(): Promise<Record<string, Decision> | null> {
  try {
    const modulo = (await import("./test/core/casos.esperados")) as unknown as { CASOS_ESPERADOS?: Record<string, Decision> };
    return modulo.CASOS_ESPERADOS ?? null;
  } catch {
    return null; // sin archivo de casos esperados: solo se muestra
  }
}

function tablaTexto(dictamenes: Dictamen[], esperados: Record<string, Decision> | null): string {
  const idsControl = dictamenes[0]?.controles.map((c) => c.id) ?? [];
  const filas = [
    ["solicitud", "decisión", ...(esperados ? ["esperada"] : []), ...idsControl.map((id) => id.replace("CTRL-", ""))],
    ...dictamenes.map((d) => [
      d.solicitudId,
      d.decision,
      ...(esperados ? [esperados[d.solicitudId] ?? "-"] : []),
      ...d.controles.map((c) => c.estado),
    ]),
  ];
  const anchos = filas[0]!.map((_, i) => Math.max(...filas.map((f) => (f[i] ?? "").length)));
  return filas.map((f) => f.map((celda, i) => celda.padEnd(anchos[i] ?? 0)).join("  ").trimEnd()).join("\n");
}

function matrizMarkdown(dictamenes: Dictamen[]): string {
  const ids = dictamenes.map((d) => d.solicitudId);
  const cabecera = `| Control | ${ids.join(" | ")} |`;
  const separador = `|---|${ids.map(() => "---").join("|")}|`;
  const controles = dictamenes[0]?.controles ?? [];
  const filas = controles.map(
    (c, i) => `| ${c.id} | ${dictamenes.map((d) => d.controles[i]?.estado ?? "-").join(" | ")} |`,
  );
  const decision = `| **Decisión** | ${dictamenes.map((d) => `**${d.decision}**`).join(" | ")} |`;
  return [cabecera, separador, ...filas, decision].join("\n");
}

const inicio = performance.now();
const ids = await listarSolicitudes();
const dictamenes = await Promise.all(ids.map((id) => evaluarSolicitud(id)));
const ms = Math.round(performance.now() - inicio);

const esperados = await cargarEsperados();
const markdown = process.argv.includes("--md");
console.log(markdown ? matrizMarkdown(dictamenes) : tablaTexto(dictamenes, esperados));

const resumen = `${dictamenes.length} solicitudes evaluadas en ${ms} ms`;
if (markdown) console.error(resumen);
else console.log(`\n${resumen}`);

if (esperados) {
  const fallos = dictamenes.filter((d) => esperados[d.solicitudId] !== d.decision);
  const coinciden = dictamenes.length - fallos.length;
  const linea = `${coinciden}/${dictamenes.length} coinciden con lo esperado`;
  if (markdown) console.error(linea);
  else console.log(linea);
  if (fallos.length > 0) {
    for (const d of fallos) console.error(`DIFIERE ${d.solicitudId}: obtenido ${d.decision}, esperado ${esperados[d.solicitudId] ?? "(sin caso esperado)"}`);
    process.exit(1);
  }
}
