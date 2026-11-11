import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { OrdenCompraSchema, type OrdenCompra } from "../../src/domain/contratos-oc";
import { listarCasos } from "../../src/domain/casos";
import { shaEvidencia, sha256Hex } from "../../src/domain/evidencia";
import { leerPaquete } from "../../src/data/paquete";
import * as herramientas from "../../src/tools/oc";
import { CASOS_ESPERADOS } from "./casos.esperados";
import { RAIZ, ctxDe, proyectoTemporal } from "./ayudas";

type Salida = { ok: boolean; data?: Record<string, any>; error?: string; codigo?: string; [k: string]: any };
const llamar = async (h: { execute(a: never, c: never): Promise<string> }, args: object, ctx: object): Promise<Salida> =>
  JSON.parse(await h.execute(args as never, ctx as never)) as Salida;

describe("contrato de src/tools/oc.ts", () => {
  it("solo exporta herramientas con description, args y execute", () => {
    assert.deepEqual(Object.keys(herramientas).sort(), ["construir_payload", "crear", "generar_evidencia", "leer_excel", "leer_paquete", "validar"]);
    for (const h of Object.values(herramientas)) {
      assert.equal(typeof h.description, "string");
      assert.equal(typeof h.execute, "function");
      for (const campo of Object.values(h.args)) assert.ok((campo as { description?: string }).description, "cada arg lleva .describe()");
    }
  });
  it("listarCasos lista las 6 carpetas de fixtures", async () => {
    assert.deepEqual(await listarCasos(RAIZ), ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"]);
  });
});

describe("oc_leer_paquete (HU-1, HU-6)", () => {
  it("normaliza sol-001: NIT sin puntos ni dígito de verificación, validez y referencia", async () => {
    const r = await llamar(herramientas.leer_paquete, { caso: "sol-001" }, ctxDe(RAIZ));
    assert.equal(r.ok, true);
    assert.equal(r.data?.["cotizacion"].nit, "900555111");
    assert.equal(r.data?.["cotizacion"].total, 11_400_000);
    assert.equal(r.data?.["cotizacion"].validez_hasta, "2026-09-17");
    assert.equal(r.data?.["cotizacion"].referencia, "COT-TS-2026-0451");
    assert.equal(r.data?.["aprobacion"].aprobado, true);
    assert.equal(r.data?.["factura"], null);
    assert.deepEqual(r.data?.["faltantes"], []);
  });
  it("sol-005 trae la factura normalizada", async () => {
    const r = await llamar(herramientas.leer_paquete, { caso: "sol-005" }, ctxDe(RAIZ));
    assert.deepEqual(r.data?.["factura"], { numero: "FC-88231", fecha: "2026-08-10", total: 3_200_000 });
  });
  it("adjunto ausente → null y nombre en faltantes, sin excepción", async () => {
    const dir = await proyectoTemporal();
    await rm(path.join(dir, "fixtures/reto-03/solicitudes/sol-001/cotizacion.txt"));
    await rm(path.join(dir, "fixtures/reto-03/solicitudes/sol-001/aprobacion.json"));
    const r = await llamar(herramientas.leer_paquete, { caso: "sol-001" }, ctxDe(dir));
    assert.equal(r.ok, true);
    assert.equal(r.data?.["cotizacion"], null);
    assert.equal(r.data?.["aprobacion"], null);
    assert.deepEqual(r.data?.["faltantes"], ["cotizacion.txt", "aprobacion.json"]);
  });
  it("factura anunciada en el correo pero ausente → faltantes", async () => {
    const dir = await proyectoTemporal();
    await rm(path.join(dir, "fixtures/reto-03/solicitudes/sol-005/factura.txt"));
    const r = await llamar(herramientas.leer_paquete, { caso: "sol-005" }, ctxDe(dir));
    assert.deepEqual(r.data?.["faltantes"], ["factura.txt"]);
  });
  it("JSON malformado → ENTRADA_INVALIDA con sugerencia", async () => {
    const dir = await proyectoTemporal();
    await writeFile(path.join(dir, "fixtures/reto-03/solicitudes/sol-001/solicitud.json"), "{ no es json", "utf8");
    const r = await llamar(herramientas.leer_paquete, { caso: "sol-001" }, ctxDe(dir));
    assert.equal(r.ok, false);
    assert.equal(r.codigo, "ENTRADA_INVALIDA");
    assert.match(r.error ?? "", /solicitud\.json no es JSON válido/);
    assert.ok(r["sugerencia"]);
  });
  it("monto no numérico en la solicitud → ENTRADA_INVALIDA", async () => {
    const dir = await proyectoTemporal();
    const ruta = path.join(dir, "fixtures/reto-03/solicitudes/sol-001/solicitud.json");
    const sol = JSON.parse(await readFile(ruta, "utf8")) as Record<string, unknown>;
    await writeFile(ruta, JSON.stringify({ ...sol, valor_total: "once millones" }), "utf8");
    const r = await llamar(herramientas.leer_paquete, { caso: "sol-001" }, ctxDe(dir));
    assert.equal(r.codigo, "ENTRADA_INVALIDA");
    assert.match(r.error ?? "", /valor_total/);
  });
  it("monto no numérico en la cotización → ENTRADA_INVALIDA", async () => {
    const dir = await proyectoTemporal();
    const ruta = path.join(dir, "fixtures/reto-03/solicitudes/sol-001/cotizacion.txt");
    const texto = await readFile(ruta, "utf8");
    await writeFile(ruta, texto.replace(/TOTAL \(IVA incluido\): COP [\d.]+/, "TOTAL (IVA incluido): COP muchos"), "utf8");
    const r = await llamar(herramientas.leer_paquete, { caso: "sol-001" }, ctxDe(dir));
    assert.equal(r.codigo, "ENTRADA_INVALIDA");
    assert.match(r.error ?? "", /cotizacion\.txt/);
  });
  it("las herramientas nunca lanzan ante JSON malformado", async () => {
    const dir = await proyectoTemporal();
    await writeFile(path.join(dir, "fixtures/reto-03/solicitudes/sol-004/aprobacion.json"), "}{", "utf8");
    for (const h of [herramientas.leer_paquete, herramientas.validar, herramientas.construir_payload, herramientas.generar_evidencia, herramientas.crear]) {
      const r = await llamar(h, { caso: "sol-004", confirmado: true }, ctxDe(dir));
      assert.equal(r.ok, false);
      assert.equal(r.codigo, "ENTRADA_INVALIDA");
    }
  });
  it("rechaza casos con rutas o inexistentes", async () => {
    for (const malo of ["../sol-001", "../../etc", "sol-001/../sol-002", "/etc/passwd", "SOL-001", "sol-999", ""]) {
      const r = await llamar(herramientas.leer_paquete, { caso: malo }, ctxDe(RAIZ));
      assert.equal(r.ok, false, malo);
      assert.equal(r.codigo, "ENTRADA_INVALIDA", malo);
      assert.match(String(r["sugerencia"]), /sol-001/);
    }
  });
});

describe("oc_validar (HU-2)", () => {
  for (const esperado of CASOS_ESPERADOS) {
    it(`${esperado.caso} coincide con CASOS_ESPERADOS`, async () => {
      const r = await llamar(herramientas.validar, { caso: esperado.caso }, ctxDe(RAIZ));
      assert.equal(r.ok, true);
      assert.equal(r.data?.["apta"], esperado.apta);
      assert.deepEqual(r.data?.["bloqueos"].map((h: { regla: string }) => h.regla), esperado.bloqueos);
      assert.deepEqual(r.data?.["confirmaciones"].map((h: { regla: string }) => h.regla), esperado.confirmaciones);
      assert.deepEqual(r.data?.["derivados"], esperado.derivados);
      assert.equal(r.data?.["retroactiva"], esperado.retroactiva);
    });
  }
  it("un paquete con un monto cambiado → PAYLOAD_ALTERADO", async () => {
    const leido = await llamar(herramientas.leer_paquete, { caso: "sol-004" }, ctxDe(RAIZ));
    const paquete = structuredClone(leido.data) as Record<string, any>;
    paquete["cotizacion"].total = 25_000_000; // «arreglar» la cotización para que cuadre
    const r = await llamar(herramientas.validar, { caso: "sol-004", paquete }, ctxDe(RAIZ));
    assert.equal(r.codigo, "PAYLOAD_ALTERADO");
    assert.equal(r["diferencias"][0].campo, "cotizacion.total");
  });
  it("un paquete idéntico a la fuente se acepta", async () => {
    const leido = await llamar(herramientas.leer_paquete, { caso: "sol-004" }, ctxDe(RAIZ));
    assert.equal((await llamar(herramientas.validar, { caso: "sol-004", paquete: leido.data }, ctxDe(RAIZ))).ok, true);
  });
});

describe("oc_construir_payload (HU-3)", () => {
  it("genera una OrdenCompra válida para cada caso apto y escribe la trazabilidad", async () => {
    const dir = await proyectoTemporal();
    for (const esperado of CASOS_ESPERADOS.filter((c) => c.apta)) {
      const r = await llamar(herramientas.construir_payload, { caso: esperado.caso }, ctxDe(dir));
      assert.equal(r.ok, true, esperado.caso);
      assert.equal(OrdenCompraSchema.safeParse(r.data?.["orden"]).success, true);
      assert.equal(r.data?.["trazabilidad"], `out/${esperado.caso}/trazabilidad.json`);
      const traza = JSON.parse(await readFile(path.join(dir, r.data?.["trazabilidad"]), "utf8")) as { campos: Record<string, string> };
      assert.equal(traza.campos["posiciones.0.precio_unitario"], "solicitud");
      assert.equal(traza.campos["proveedor.codigo_sap"], "maestro.proveedores");
    }
  });
  it("sol-004: posición 10, unidad H por «horas», precio de la solicitud y excepción sin confirmar", async () => {
    const r = await llamar(herramientas.construir_payload, { caso: "sol-004" }, ctxDe(await proyectoTemporal()));
    const orden = r.data?.["orden"] as OrdenCompra;
    assert.equal(orden.posiciones[0]?.numero, 10);
    assert.equal(orden.posiciones[0]?.unidad, "H");
    assert.equal(orden.posiciones[0]?.precio_unitario, 250_000);
    assert.ok((orden.posiciones[0]?.descripcion.length ?? 99) <= 40);
    assert.equal(orden.referencia.cotizacion_ref, "CA-2026-0310");
    assert.deepEqual(orden.excepciones.map((e) => [e.codigo, e.confirmado_por]), [["RC5", null]]);
  });
  it("sol-006: deriva IVA y condiciones y lo marca en la trazabilidad", async () => {
    const dir = await proyectoTemporal();
    const r = await llamar(herramientas.construir_payload, { caso: "sol-006" }, ctxDe(dir));
    const orden = r.data?.["orden"] as OrdenCompra;
    assert.equal(orden.condiciones_pago, "Z030");
    assert.equal(orden.posiciones[0]?.indicador_iva, "C1");
    assert.equal(orden.posiciones[0]?.unidad, "UN");
    const traza = JSON.parse(await readFile(path.join(dir, "out/sol-006/trazabilidad.json"), "utf8")) as { campos: Record<string, string> };
    assert.equal(traza.campos["condiciones_pago"], "derivado");
    assert.equal(traza.campos["posiciones.0.indicador_iva"], "derivado");
  });
  it("un caso bloqueado devuelve BLOQUEADA con acciones sugeridas", async () => {
    const r = await llamar(herramientas.construir_payload, { caso: "sol-003" }, ctxDe(await proyectoTemporal()));
    assert.equal(r.codigo, "BLOQUEADA");
    assert.match(r["acciones_sugeridas"][0], /CC-3030/);
  });
  it("derivados alterados → PAYLOAD_ALTERADO", async () => {
    const r = await llamar(herramientas.construir_payload, { caso: "sol-006", derivados: { indicador_iva: "C0" } }, ctxDe(await proyectoTemporal()));
    assert.equal(r.codigo, "PAYLOAD_ALTERADO");
  });
});

describe("oc_generar_evidencia (HU-4)", () => {
  it("escribe el txt con encabezados, cuerpo y sha256 del contenido anterior, y el pdf", async () => {
    const dir = await proyectoTemporal();
    const r = await llamar(herramientas.generar_evidencia, { caso: "sol-001" }, ctxDe(dir));
    assert.equal(r.ok, true);
    assert.equal(r.data?.["ruta"], "out/sol-001/aprobacion.txt");
    assert.equal(r.data?.["pdf"], "out/sol-001/aprobacion.pdf");
    const texto = await readFile(path.join(dir, "out/sol-001/aprobacion.txt"), "utf8");
    assert.match(texto, /^De: mlopez@periferia-ficticia\.com\nPara: juan\.camargo@.*\nFecha: 2026-08-21T10:02:00-05:00\nAsunto: RE: /);
    assert.match(texto, /Aprobado, proceder con la orden de compra\./);
    const [contenido, linea] = texto.split("\nsha256: ");
    assert.equal(linea?.trim(), r.data?.["sha256"]);
    assert.equal(sha256Hex(contenido ?? ""), r.data?.["sha256"]);
    const pdf = await readFile(path.join(dir, "out/sol-001/aprobacion.pdf"));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });
  it("el sha256 es determinista y coincide con el del payload", async () => {
    const dir = await proyectoTemporal();
    const a = await llamar(herramientas.generar_evidencia, { caso: "sol-005" }, ctxDe(dir));
    const b = await llamar(herramientas.generar_evidencia, { caso: "sol-005" }, ctxDe(dir));
    assert.equal(a.data?.["sha256"], b.data?.["sha256"]);
    const p = await leerPaquete(RAIZ, "sol-005");
    assert.equal(shaEvidencia(p.aprobacion!), a.data?.["sha256"]);
    const orden = (await llamar(herramientas.construir_payload, { caso: "sol-005" }, ctxDe(dir))).data?.["orden"] as OrdenCompra;
    assert.equal(orden.aprobador.evidencia_sha256, a.data?.["sha256"]);
  });
  it("tolera caracteres fuera de WinAnsi en el PDF", async () => {
    const dir = await proyectoTemporal();
    const ruta = path.join(dir, "fixtures/reto-03/solicitudes/sol-001/aprobacion.json");
    const ap = JSON.parse(await readFile(ruta, "utf8")) as Record<string, string>;
    await writeFile(ruta, JSON.stringify({ ...ap, cuerpo: `Aprobado ✓ 承认 😀 ${"palabra ".repeat(200)}` }), "utf8");
    assert.equal((await llamar(herramientas.generar_evidencia, { caso: "sol-001" }, ctxDe(dir))).ok, true);
  });
  it("sin aprobacion.json → ENTRADA_INVALIDA", async () => {
    const dir = await proyectoTemporal();
    await rm(path.join(dir, "fixtures/reto-03/solicitudes/sol-001/aprobacion.json"));
    assert.equal((await llamar(herramientas.generar_evidencia, { caso: "sol-001" }, ctxDe(dir))).codigo, "ENTRADA_INVALIDA");
  });
});

describe("oc_leer_excel (P1)", () => {
  it("rechaza rutas fuera de fixtures/", async () => {
    for (const ruta of ["package.json", "../x.xlsx", "/etc/hosts", "fixtures/../package.json", "fixtures/../../x.xlsx"]) {
      const r = await llamar(herramientas.leer_excel, { ruta }, ctxDe(RAIZ));
      assert.equal(r.codigo, "ENTRADA_INVALIDA", ruta);
    }
  });
  it("archivo inexistente → ENTRADA_INVALIDA", async () => {
    const r = await llamar(herramientas.leer_excel, { ruta: "fixtures/reto-03/no-existe.xlsx" }, ctxDe(RAIZ));
    assert.equal(r.codigo, "ENTRADA_INVALIDA");
    assert.match(r.error ?? "", /No existe/);
  });
  it("un .xlsx corrupto → ENTRADA_INVALIDA", async () => {
    const dir = await proyectoTemporal();
    await writeFile(path.join(dir, "fixtures/reto-03/roto.xlsx"), "no soy un zip", "utf8");
    const r = await llamar(herramientas.leer_excel, { ruta: "fixtures/reto-03/roto.xlsx" }, ctxDe(dir));
    assert.equal(r.codigo, "ENTRADA_INVALIDA");
    assert.match(r.error ?? "", /no es un \.xlsx válido/);
  });
  it("un archivo que no es .xlsx → ENTRADA_INVALIDA", async () => {
    const r = await llamar(herramientas.leer_excel, { ruta: "fixtures/reto-03/solicitudes/sol-001/solicitud.json" }, ctxDe(RAIZ));
    assert.equal(r.codigo, "ENTRADA_INVALIDA");
  });
});
