import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { filaCsv, campoCsv } from "../../src/data/control";
import type { OrdenCompra } from "../../src/domain/contratos-oc";
import { crearSapMock } from "../../src/sap/mock";
import * as herramientas from "../../src/tools/oc";
import { AHORA_FIJO, ctxDe, proyectoTemporal } from "./ayudas";

type Salida = { ok: boolean; data?: Record<string, any>; error?: string; codigo?: string; [k: string]: any };
const llamar = async (h: { execute(a: never, c: never): Promise<string> }, args: object, ctx: object): Promise<Salida> =>
  JSON.parse(await h.execute(args as never, ctx as never)) as Salida;
const crear = (dir: string, args: object, extra = {}) => llamar(herramientas.crear, args, ctxDe(dir, extra));

async function filasControl(dir: string): Promise<string[][]> {
  const lineas = (await readFile(path.join(dir, "out/control.csv"), "utf8")).trimEnd().split("\n");
  return lineas.map((l) => l.split(","));
}
async function ordenesSap(dir: string): Promise<Array<{ numero_oc: string; orden: OrdenCompra }>> {
  const texto = await readFile(path.join(dir, "out/sap/ordenes.jsonl"), "utf8");
  return texto.trim().split("\n").map((l) => JSON.parse(l));
}

describe("oc_crear (HU-5)", () => {
  it("caso limpio: crea la OC 4500000001, escribe evidencia y fila «creada»", async () => {
    const dir = await proyectoTemporal();
    const r = await crear(dir, { caso: "sol-001" });
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, { numero_oc: "4500000001", fecha: AHORA_FIJO.toISOString(), idempotente: false, retroactiva: false, evidencia: "out/sol-001/aprobacion.txt" });
    const filas = await filasControl(dir);
    assert.equal(filas[0]?.join(","), "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts");
    assert.deepEqual(filas[1], ["SOL-2026-001", "creada", "4500000001", "false", "", "", AHORA_FIJO.toISOString()]);
    assert.equal((await ordenesSap(dir))[0]?.orden.aprobador.evidencia_sha256.length, 64);
  });

  it("idempotente: la segunda llamada devuelve el mismo número y fila «existente»", async () => {
    const dir = await proyectoTemporal();
    await crear(dir, { caso: "sol-001" });
    const r = await crear(dir, { caso: "sol-001" });
    assert.equal(r.data?.["numero_oc"], "4500000001");
    assert.equal(r.data?.["idempotente"], true);
    assert.equal((await ordenesSap(dir)).length, 1);
    assert.equal((await filasControl(dir))[2]?.[1], "existente");
  });

  it("caso bloqueado: BLOQUEADA, sin OC y fila «bloqueada» con las reglas", async () => {
    const dir = await proyectoTemporal();
    const r = await crear(dir, { caso: "sol-003", confirmado: true });
    assert.equal(r.codigo, "BLOQUEADA");
    assert.equal(r["bloqueos"][0].regla, "RC2");
    assert.deepEqual((await filasControl(dir))[1]?.slice(0, 6), ["SOL-2026-003", "bloqueada", "", "false", "RC2", ""]);
    await assert.rejects(readFile(path.join(dir, "out/sap/ordenes.jsonl")));
  });

  it("con confirmaciones y sin confirmado: REQUIERE_CONFIRMACION y fila «pendiente»", async () => {
    const dir = await proyectoTemporal();
    const r = await crear(dir, { caso: "sol-004" });
    assert.equal(r.codigo, "REQUIERE_CONFIRMACION");
    assert.equal(r["confirmaciones"][0].regla, "RC5");
    assert.deepEqual((await filasControl(dir))[1]?.slice(0, 6), ["SOL-2026-004", "pendiente", "", "false", "", "RC5"]);
  });

  it("confirmado=true pero la persona no confirmó: CONFIRMACION_NO_HUMANA", async () => {
    const dir = await proyectoTemporal();
    const r = await crear(dir, { caso: "sol-004", confirmado: true }, { confirmacionHumana: () => false });
    assert.equal(r.codigo, "CONFIRMACION_NO_HUMANA");
    assert.equal((await filasControl(dir))[1]?.[1], "pendiente");
    await assert.rejects(readFile(path.join(dir, "out/sap/ordenes.jsonl")));
  });

  it("confirmación humana verificada: crea la OC con confirmado_por del analista y la sesión", async () => {
    const dir = await proyectoTemporal();
    const r = await crear(dir, { caso: "sol-004", confirmado: true }, { confirmacionHumana: (caso: string) => caso === "sol-004" });
    assert.equal(r.ok, true);
    const [oc] = await ordenesSap(dir);
    assert.deepEqual(oc?.orden.excepciones.map((e) => [e.codigo, e.confirmado_por]), [["RC5", "analista (sesión sesion-test)"]]);
  });

  it("sol-005: la OC retroactiva queda marcada en la respuesta y en el control", async () => {
    const dir = await proyectoTemporal();
    const r = await crear(dir, { caso: "sol-005", confirmado: true });
    assert.equal(r.data?.["retroactiva"], true);
    assert.equal((await filasControl(dir))[1]?.[3], "true");
  });

  it("payload alterado (precio cambiado): PAYLOAD_ALTERADO, sin OC y fila «rechazada»", async () => {
    const dir = await proyectoTemporal();
    const { data } = await llamar(herramientas.construir_payload, { caso: "sol-004" }, ctxDe(dir));
    const payload = structuredClone(data?.["orden"]) as OrdenCompra;
    payload.posiciones[0]!.precio_unitario = 265_000; // el modelo «arregla» el monto a la cotización
    const r = await crear(dir, { caso: "sol-004", payload, confirmado: true });
    assert.equal(r.codigo, "PAYLOAD_ALTERADO");
    assert.equal(r["diferencias"][0].campo, "posiciones.0.precio_unitario");
    assert.equal((await filasControl(dir))[1]?.[1], "rechazada");
    await assert.rejects(readFile(path.join(dir, "out/sap/ordenes.jsonl")));
  });

  it("payload sin alterar: se acepta", async () => {
    const dir = await proyectoTemporal();
    const { data } = await llamar(herramientas.construir_payload, { caso: "sol-004" }, ctxDe(dir));
    assert.equal((await crear(dir, { caso: "sol-004", payload: data?.["orden"], confirmado: true })).ok, true);
  });

  it("números secuenciales entre solicitudes distintas", async () => {
    const dir = await proyectoTemporal();
    const a = await crear(dir, { caso: "sol-001" });
    const b = await crear(dir, { caso: "sol-006", confirmado: true });
    assert.deepEqual([a.data?.["numero_oc"], b.data?.["numero_oc"]], ["4500000001", "4500000002"]);
  });

  it("dos peticiones concurrentes del mismo caso no duplican la OC", async () => {
    const dir = await proyectoTemporal();
    const rs = await Promise.all([crear(dir, { caso: "sol-001" }), crear(dir, { caso: "sol-001" }), crear(dir, { caso: "sol-001" })]);
    assert.deepEqual(new Set(rs.map((r) => r.data?.["numero_oc"])), new Set(["4500000001"]));
    assert.equal(rs.filter((r) => r.data?.["idempotente"] === false).length, 1);
    assert.equal((await ordenesSap(dir)).length, 1);
  });

  it("peticiones concurrentes de casos distintos reciben números distintos y el control queda íntegro", async () => {
    const dir = await proyectoTemporal();
    const rs = await Promise.all(["sol-001", "sol-004", "sol-005", "sol-006"].map((caso) => crear(dir, { caso, confirmado: true })));
    const numeros = rs.map((r) => r.data?.["numero_oc"]).sort();
    assert.deepEqual(numeros, ["4500000001", "4500000002", "4500000003", "4500000004"]);
    assert.equal((await filasControl(dir)).length, 5);
  });
});

describe("SAP simulado", () => {
  const orden = (solicitud_id: string) => ({ referencia: { solicitud_id } }) as OrdenCompra;

  it("crearOrden es secuencial, idempotente y concurrente-seguro a nivel del adaptador", async () => {
    const dir = await proyectoTemporal();
    const sap = crearSapMock(dir, () => AHORA_FIJO);
    const rs = await Promise.all(["A", "B", "A", "C", "B"].map((id) => sap.crearOrden(orden(id))));
    assert.deepEqual(rs.map((r) => r.numero_oc), ["4500000001", "4500000002", "4500000001", "4500000003", "4500000002"]);
    assert.deepEqual(await sap.buscarOrdenPorReferencia("C"), { numero_oc: "4500000003" });
    assert.equal(await sap.buscarOrdenPorReferencia("Z"), null);
  });

  it("continúa desde el máximo existente aunque haya líneas corruptas", async () => {
    const dir = await proyectoTemporal();
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(dir, "out/sap"), { recursive: true });
    await writeFile(path.join(dir, "out/sap/ordenes.jsonl"), `{"numero_oc":"4500000007","fecha":"x","solicitud_id":"Q"}\nbasura\n`, "utf8");
    const r = await crearSapMock(dir).crearOrden(orden("R"));
    assert.equal(r.numero_oc, "4500000008");
  });

  it("consultarProveedor usa el maestro", async () => {
    const sap = crearSapMock(await proyectoTemporal());
    assert.deepEqual(await sap.consultarProveedor("900.555.111-2"), { codigo_sap: "100234", activo: true });
    assert.deepEqual(await sap.consultarProveedor("901777888"), { codigo_sap: "100402", activo: false });
    assert.equal(await sap.consultarProveedor("1"), null);
  });
});

describe("out/control.csv", () => {
  it("escapa comillas, comas y saltos de línea", () => {
    assert.equal(campoCsv("simple"), "simple");
    assert.equal(campoCsv('a,"b"\nc'), '"a,""b""\nc"');
  });
  it("separa las reglas con |", () => {
    const f = filaCsv({ solicitud_id: "S", resultado: "bloqueada", numero_oc: null, retroactiva: false, bloqueos: ["RC1", "RC4"], confirmaciones: ["RC5"], ts: "t" });
    assert.equal(f, "S,bloqueada,,false,RC1|RC4,RC5,t");
  });
});
