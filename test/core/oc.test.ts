import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolDef } from "../../src/domain/contratos";
import { crearNucleoOC } from "../../src/tools/oc";

function herramienta(nombre: string): ToolDef {
  const t = crearNucleoOC().herramientas.find((h) => h.nombre === nombre);
  assert.ok(t, `tool ${nombre} no registrada`);
  return t;
}

/** Valida la entrada con el esquema de la tool (como hará el servidor) y la ejecuta; valida la salida. */
async function invocar(nombre: string, entrada: unknown): Promise<unknown> {
  const t = herramienta(nombre);
  const salida = await t.ejecutar(t.entrada.parse(entrada));
  return t.salida.parse(salida);
}

describe("herramientas del núcleo", () => {
  it("expone las nueve tools del reto", () => {
    const nombres = crearNucleoOC().herramientas.map((h) => h.nombre);

    assert.deepEqual(nombres, [
      "listarSolicitudes",
      "validarProveedor",
      "validarCentroCostoYTope",
      "validarIVA",
      "validarCondicionPago",
      "detectarCompraRetroactiva",
      "validarCoherencia",
      "evaluarSolicitud",
      "crearOrdenCompra",
    ]);
  });

  it("solo crearOrdenCompra exige confirmación humana", () => {
    const conConfirmacion = crearNucleoOC().herramientas.filter((h) => h.requiereConfirmacion);

    assert.deepEqual(conConfirmacion.map((h) => h.nombre), ["crearOrdenCompra"]);
  });

  it("cada tool tiene una descripción útil para el LLM", () => {
    for (const h of crearNucleoOC().herramientas) {
      assert.ok(h.descripcion.length >= 40, `${h.nombre}: descripción demasiado corta`);
    }
  });

  it("las tools de solicitud rechazan ids que no son sol-NNN (el LLM no pasa rutas ni documentos)", () => {
    const t = herramienta("validarProveedor");

    for (const malo of ["../maestros", "sol-1", "sol-001/../x", "texto de la cotización"]) {
      assert.equal(t.entrada.safeParse({ solicitudId: malo }).success, false, malo);
    }
  });

  it("las tools de solicitud rechazan campos extra con documentos crudos", () => {
    const t = herramienta("validarProveedor");

    assert.equal(t.entrada.safeParse({ solicitudId: "sol-001", cotizacion: "texto" }).success, false);
  });
});

describe("tools de consulta", () => {
  it("listarSolicitudes devuelve los ids disponibles", async () => {
    const salida = (await invocar("listarSolicitudes", {})) as { solicitudes: string[] };

    assert.ok(salida.solicitudes.includes("sol-001") && salida.solicitudes.includes("sol-002"));
  });

  it("validarProveedor devuelve el resultado de CTRL-PROVEEDOR", async () => {
    const r = (await invocar("validarProveedor", { solicitudId: "sol-001" })) as { id: string; estado: string };

    assert.deepEqual([r.id, r.estado], ["CTRL-PROVEEDOR", "OK"]);
  });

  it("detectarCompraRetroactiva bloquea sol-002 con las fechas como evidencia", async () => {
    const r = (await invocar("detectarCompraRetroactiva", { solicitudId: "sol-002" })) as {
      estado: string;
      evidencia: Record<string, unknown>;
    };

    assert.equal(r.estado, "BLOQUEO");
    assert.equal(r.evidencia["fechaFactura"], "2026-10-10");
  });

  it("evaluarSolicitud devuelve el mismo dictamen que la fachada del núcleo", async () => {
    const nucleo = crearNucleoOC();

    const porTool = await invocar("evaluarSolicitud", { solicitudId: "sol-002" });

    assert.deepEqual(porTool, await nucleo.evaluarSolicitud("sol-002"));
  });
});

describe("crearOrdenCompra", () => {
  it("crea la OC de una solicitud aprobable con número 45 + 8 dígitos", async () => {
    const oc = (await invocar("crearOrdenCompra", { solicitudId: "sol-001" })) as { numero: string };

    assert.match(oc.numero, /^45\d{8}$/);
  });

  it("es idempotente: repetirla devuelve el mismo número", async () => {
    const a = (await invocar("crearOrdenCompra", { solicitudId: "sol-001" })) as { numero: string };
    const b = (await invocar("crearOrdenCompra", { solicitudId: "sol-001" })) as { numero: string };

    assert.equal(a.numero, b.numero);
  });

  it("se niega a crear la OC de una solicitud rechazada, sin importar quién la pida", async () => {
    await assert.rejects(() => invocar("crearOrdenCompra", { solicitudId: "sol-002" }), /RECHAZADA/);
  });
});
