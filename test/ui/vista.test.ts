import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Dictamen } from "../../src/domain/contratos";
import type { Item } from "../../web/src/estado";
import { agruparItems, etiquetaTool, limpiarMarkdown, resumenControles, resumenHerramientas } from "../../web/src/vista";

type ItemTool = Extract<Item, { tipo: "tool" }>;
const tool = (id: string, ms?: number, ok = true): ItemTool => ({
  tipo: "tool",
  id,
  nombre: "validarProveedor",
  entrada: {},
  ...(ms === undefined ? {} : { resultado: { ok, ms, salida: {} } }),
});

describe("agruparItems", () => {
  it("junta las tools consecutivas en un solo bloque y deja el resto como está", () => {
    const items: Item[] = [{ tipo: "usuario", texto: "hola" }, tool("a", 1), tool("b", 2), { tipo: "modelo", texto: "listo" }, tool("c", 3)];
    const bloques = agruparItems(items);
    assert.deepEqual(bloques.map((b) => b.tipo), ["item", "herramientas", "item", "herramientas"]);
    const primero = bloques[1];
    assert.ok(primero?.tipo === "herramientas");
    assert.deepEqual(primero.tools.map((t) => t.id), ["a", "b"]);
  });

  it("da una clave distinta a cada bloque", () => {
    const bloques = agruparItems([tool("a", 1), { tipo: "modelo", texto: "x" }, tool("b", 1), { tipo: "modelo", texto: "x" }]);
    assert.equal(new Set(bloques.map((b) => b.clave)).size, bloques.length);
  });

  it("con una lista vacía devuelve una lista vacía", () => {
    assert.deepEqual(agruparItems([]), []);
  });
});

describe("etiquetaTool", () => {
  it("traduce el nombre de código a un nombre que entiende el usuario", () => {
    assert.equal(etiquetaTool("validarCentroCostoYTope"), "Centro de costo y tope");
    assert.equal(etiquetaTool("crearOrdenCompra"), "Crear orden de compra");
  });

  it("si no conoce la tool, devuelve el nombre tal cual", () => {
    assert.equal(etiquetaTool("consultar_solicitud"), "consultar_solicitud");
  });
});

describe("resumenHerramientas", () => {
  it("cuenta las tools y suma los milisegundos", () => {
    assert.equal(resumenHerramientas([tool("a", 2), tool("b", 7)]), "2 herramientas en 9 ms");
  });

  it("usa el singular con una sola tool", () => {
    assert.equal(resumenHerramientas([tool("a", 2)]), "1 herramienta en 2 ms");
  });

  it("mientras alguna no responde, dice cuántas van listas", () => {
    assert.equal(resumenHerramientas([tool("a", 2), tool("b")]), "Consultando… 1 de 2 listas");
  });

  it("avisa de las que fallaron", () => {
    assert.equal(resumenHerramientas([tool("a", 2), tool("b", 3, false)]), "2 herramientas en 5 ms, 1 con error");
  });
});

describe("resumenControles", () => {
  const dictamen = (estados: Array<"OK" | "ALERTA" | "BLOQUEO">): Dictamen => ({
    solicitudId: "sol-001",
    decision: "APROBABLE",
    hash: "h",
    controles: estados.map((estado, i) => ({ id: `C${i}`, nombre: `c${i}`, estado, detalle: "", evidencia: {} })),
  });

  it("todo en orden", () => {
    assert.equal(resumenControles(dictamen(["OK", "OK", "OK"])), "3 de 3 controles en orden");
  });

  it("cuenta alertas y bloqueos", () => {
    assert.equal(resumenControles(dictamen(["OK", "ALERTA", "BLOQUEO", "BLOQUEO"])), "1 de 4 controles en orden, 1 con alerta, 2 bloqueantes");
  });

  it("usa el singular de bloqueante", () => {
    assert.equal(resumenControles(dictamen(["OK", "BLOQUEO"])), "1 de 2 controles en orden, 1 bloqueante");
  });
});

describe("limpiarMarkdown", () => {
  it("quita negritas, código y encabezados", () => {
    assert.equal(limpiarMarkdown("### Resultado\nLa **sol-001** usa `CC-100`."), "Resultado\nLa sol-001 usa CC-100.");
  });

  it("convierte viñetas de guion o asterisco en puntos", () => {
    assert.equal(limpiarMarkdown("- uno\n* dos\n  - tres"), "• uno\n• dos\n  • tres");
  });

  it("no toca un texto sin marcas ni multiplicaciones sueltas", () => {
    assert.equal(limpiarMarkdown("Total 2 * 3 = 6 y fin."), "Total 2 * 3 = 6 y fin.");
  });
});
