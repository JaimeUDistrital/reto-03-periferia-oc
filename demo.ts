/**
 * Demo sin LLM ni claves (PRD §6.6): recorre los 6 casos llamando directamente a las herramientas oc_*.
 * Limpia out/ al inicio. Compara con test/core/casos.esperados.ts y sale con código 1 si algo difiere.
 * Uso: `npm run demo`.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { CASOS_ESPERADOS, type CasoEsperado } from "./test/core/casos.esperados";
import type { CtxHerramienta, Hallazgo, OcCreada, Validacion } from "./src/domain/contratos-oc";
import { crear, validar } from "./src/tools/oc";

const ctx: CtxHerramienta = { directory: import.meta.dirname, sessionId: "demo" };

type Salida<T> = { ok: true; data: T } | { ok: false; error: string; codigo?: string; [k: string]: unknown };
const parsear = <T>(json: string): Salida<T> => JSON.parse(json) as Salida<T>;

const reglas = (hs: Hallazgo[]): string => (hs.length === 0 ? "-" : hs.map((h) => h.regla).join(", "));
const lista = (xs: string[]): string => xs.join(",");
const diferencias: string[] = [];

function comprobar(caso: string, campo: string, obtenido: string, esperado: string): void {
  if (obtenido !== esperado) diferencias.push(`${caso}: ${campo} = ${obtenido}, esperado ${esperado}`);
}

function comprobarValidacion(e: CasoEsperado, v: Validacion): void {
  comprobar(e.caso, "apta", String(v.apta), String(e.apta));
  comprobar(e.caso, "bloqueos", lista(v.bloqueos.map((b) => b.regla)), lista(e.bloqueos));
  comprobar(e.caso, "confirmaciones", lista(v.confirmaciones.map((c) => c.regla)), lista(e.confirmaciones));
  comprobar(e.caso, "derivados", JSON.stringify(v.derivados), JSON.stringify(e.derivados));
  comprobar(e.caso, "retroactiva", String(v.retroactiva), String(e.retroactiva));
}

async function intentarCrear(caso: string, confirmado?: boolean): Promise<Salida<OcCreada>> {
  const r = parsear<OcCreada>(await crear.execute({ caso, ...(confirmado === undefined ? {} : { confirmado }) }, ctx));
  const detalle = r.ok
    ? `OC ${r.data.numero_oc}${r.data.idempotente ? " (idempotente: ya existía)" : " creada"}, evidencia ${r.data.evidencia}`
    : `${r.codigo ?? "ERROR"}: ${r.error}`;
  console.log(`    crear${confirmado ? " (confirmado)" : ""} → ${detalle}`);
  return r;
}

async function procesar(e: CasoEsperado): Promise<string | null> {
  console.log(`\n== ${e.caso} (${e.solicitud_id})`);
  const val = parsear<Validacion>(await validar.execute({ caso: e.caso }, ctx));
  if (!val.ok) {
    diferencias.push(`${e.caso}: validar falló: ${val.error}`);
    return null;
  }
  const v = val.data;
  console.log(`    apta=${v.apta}  bloqueos=${reglas(v.bloqueos)}  confirmaciones=${reglas(v.confirmaciones)}  retroactiva=${v.retroactiva}`);
  for (const h of [...v.bloqueos, ...v.confirmaciones]) console.log(`      ${h.regla}: ${h.detalle}\n        → ${h.accion_sugerida}`);
  if (Object.keys(v.derivados).length > 0) console.log(`    derivados: ${JSON.stringify(v.derivados)}`);
  comprobarValidacion(e, v);

  const primero = await intentarCrear(e.caso);
  if (primero.ok) return primero.data.numero_oc;
  if (primero.codigo === "REQUIERE_CONFIRMACION") {
    const confirmado = await intentarCrear(e.caso, true);
    return confirmado.ok ? confirmado.data.numero_oc : null;
  }
  return null;
}

async function main(): Promise<void> {
  await rm(path.join(ctx.directory, "out"), { recursive: true, force: true });
  console.log("Demo de herramientas oc_* (sin modelo ni claves). out/ limpiado.");

  const [primero, ...resto] = CASOS_ESPERADOS;
  if (primero === undefined) throw new Error("No hay casos esperados.");
  const numero = await procesar(primero);
  comprobar(primero.caso, "numero_oc", String(numero), String(primero.numero_oc_demo));

  console.log("\n== sol-001 otra vez (idempotencia: debe devolver el mismo número, sin crear otra OC)");
  const repetida = await intentarCrear(primero.caso);
  comprobar("sol-001 (repetida)", "numero_oc", repetida.ok ? repetida.data.numero_oc : "error", String(primero.numero_oc_demo));
  comprobar("sol-001 (repetida)", "idempotente", String(repetida.ok && repetida.data.idempotente), "true");

  for (const e of resto) comprobar(e.caso, "numero_oc", String(await procesar(e)), String(e.numero_oc_demo));

  console.log("\nControl en out/control.csv y OC en out/sap/ordenes.jsonl.");
  if (diferencias.length > 0) {
    console.error(`\nFALLA: ${diferencias.length} diferencia(s) con casos.esperados.ts:\n- ${diferencias.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nOK: los ${CASOS_ESPERADOS.length} casos coinciden con casos.esperados.ts.`);
}

main().catch((e: unknown) => {
  console.error(`La demo falló: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
