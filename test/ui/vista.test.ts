import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Item } from "../../web/src/estado";
import { ordenGrabada, validacionGrabada } from "../../web/src/dev/eventos-grabados";
import {
  agruparItems,
  argumentosCompactos,
  esConfirmacion,
  estadoValidacion,
  etiquetaTool,
  formatearMonto,
  formatearNumero,
  formatearValor,
  limpiarMarkdown,
  mensajeConfirmar,
  mensajeNoConfirmar,
  mensajeProcesar,
  resumenHerramientas,
  resumenResultado,
} from "../../web/src/vista";

type ItemTool = Extract<Item, { tipo: "tool" }>;
const tool = (id: string, ms?: number, ok = true): ItemTool => ({
  tipo: "tool",
  id,
  nombre: "oc_validar",
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
  it("traduce los nombres oc_* a un nombre que entiende el usuario", () => {
    assert.equal(etiquetaTool("oc_leer_paquete"), "Leer el paquete");
    assert.equal(etiquetaTool("oc_validar"), "Validar la solicitud");
    assert.equal(etiquetaTool("oc_construir_payload"), "Construir la OC");
    assert.equal(etiquetaTool("oc_generar_evidencia"), "Generar la evidencia");
    assert.equal(etiquetaTool("oc_crear"), "Crear la OC en SAP");
    assert.equal(etiquetaTool("oc_leer_excel"), "Leer el Excel");
  });

  it("si no conoce la tool, devuelve el nombre tal cual", () => {
    assert.equal(etiquetaTool("otra_cosa"), "otra_cosa");
  });
});

describe("argumentosCompactos", () => {
  it("muestra clave: valor en una línea", () => {
    assert.equal(argumentosCompactos({ caso: "sol-004" }), "caso: sol-004");
    assert.equal(argumentosCompactos({ caso: "sol-004", confirmado: true }), "caso: sol-004, confirmado: true");
  });

  it("resume objetos y listas sin volcar su contenido", () => {
    assert.equal(argumentosCompactos({ orden: { a: 1 }, filas: [1, 2, 3] }), "orden: {…}, filas: [3]");
  });

  it("recorta valores largos", () => {
    const largo = argumentosCompactos({ ruta: "x".repeat(100) });
    assert.ok(largo.length < 60 && largo.endsWith("…"));
  });

  it("sin argumentos devuelve cadena vacía", () => {
    assert.equal(argumentosCompactos(undefined), "");
    assert.equal(argumentosCompactos({}), "");
    assert.equal(argumentosCompactos("texto"), "");
  });
});

describe("formato de números", () => {
  it("agrupa miles con punto y decimales con coma", () => {
    assert.equal(formatearNumero(25000000), "25.000.000");
    assert.equal(formatearNumero(1234), "1.234");
    assert.equal(formatearNumero(999), "999");
    assert.equal(formatearNumero(1234.5), "1.234,5");
    assert.equal(formatearNumero(-1500000), "-1.500.000");
  });

  it("formatearMonto añade la moneda", () => {
    assert.equal(formatearMonto(25000000, "COP"), "25.000.000 COP");
  });

  it("formatearValor trata números, textos, booleanos y objetos", () => {
    assert.equal(formatearValor(26500000), "26.500.000");
    assert.equal(formatearValor("Z030"), "Z030");
    assert.equal(formatearValor(true), "sí");
    assert.equal(formatearValor(null), "—");
    assert.equal(formatearValor({ a: 1 }), '{"a":1}');
  });
});

describe("resumenResultado", () => {
  const val = (extra: Partial<typeof validacionGrabada>) => ({ ok: true, data: { ...validacionGrabada, ...extra } });
  const hallazgo = (regla: "RC1" | "RC2" | "RC5") => ({ regla, detalle: "d", accion_sugerida: "a" });

  it("validar con una confirmación", () => {
    assert.equal(resumenResultado("oc_validar", true, val({})), "Apta, 1 confirmación (RC5)");
  });

  it("validar con varias confirmaciones", () => {
    assert.equal(resumenResultado("oc_validar", true, val({ confirmaciones: [hallazgo("RC5"), hallazgo("RC2")] })), "Apta, 2 confirmaciones (RC5, RC2)");
  });

  it("validar bloqueada", () => {
    assert.equal(resumenResultado("oc_validar", true, val({ apta: false, bloqueos: [hallazgo("RC1")], confirmaciones: [] })), "Bloqueada: RC1");
  });

  it("validar limpia", () => {
    assert.equal(resumenResultado("oc_validar", true, val({ confirmaciones: [] })), "Apta, sin confirmaciones");
  });

  it("construir: posiciones y total", () => {
    assert.equal(resumenResultado("oc_construir_payload", true, { ok: true, data: { orden: ordenGrabada, trazabilidad: "t" } }), "OC lista: 1 posición, 25.000.000 COP");
  });

  it("crear: número de OC, idempotente y confirmación pendiente", () => {
    assert.equal(resumenResultado("oc_crear", true, { ok: true, data: { numero_oc: "4500000002", fecha: "2026-11-10", idempotente: false, retroactiva: false, evidencia: null } }), "OC 4500000002");
    assert.equal(resumenResultado("oc_crear", true, { ok: true, data: { numero_oc: "4500000002", fecha: "2026-11-10", idempotente: true, retroactiva: false, evidencia: null } }), "OC 4500000002 (ya existía)");
    assert.equal(resumenResultado("oc_crear", false, { ok: false, error: "x", codigo: "REQUIERE_CONFIRMACION", confirmaciones: [] }), "Requiere confirmación");
  });

  it("evidencia con ruta", () => {
    assert.equal(resumenResultado("oc_generar_evidencia", true, { ok: true, data: { ruta: "out/sol-004/aprobacion.txt", sha256: "a", pdf: false } }), "Evidencia en out/sol-004/aprobacion.txt");
  });

  it("errores con código o mensaje", () => {
    assert.equal(resumenResultado("oc_crear", false, { ok: false, error: "Hay bloqueos", codigo: "BLOQUEADA" }), "Bloqueada: Hay bloqueos");
    assert.equal(resumenResultado("oc_validar", false, { ok: false, error: "Caso inexistente" }), "Error: Caso inexistente");
  });

  it("salida inesperada no rompe", () => {
    assert.equal(resumenResultado("oc_validar", true, "raro"), "Listo");
    assert.equal(resumenResultado("oc_validar", false, undefined), "Error");
  });
});

describe("estadoValidacion", () => {
  it("bloqueada si hay bloqueos o no es apta", () => {
    assert.equal(estadoValidacion({ ...validacionGrabada, apta: false }), "bloqueada");
  });
  it("confirmación si es apta con confirmaciones", () => {
    assert.equal(estadoValidacion(validacionGrabada), "confirmacion");
  });
  it("apta si no hay nada", () => {
    assert.equal(estadoValidacion({ ...validacionGrabada, confirmaciones: [] }), "apta");
  });
});

describe("mensajes y confirmación por texto", () => {
  it("construye los mensajes del PRD", () => {
    assert.equal(mensajeProcesar("sol-004"), 'Procesa la solicitud "sol-004".');
    assert.equal(mensajeConfirmar("sol-004"), "Confirmo la creación de la OC de sol-004.");
    assert.equal(mensajeNoConfirmar("sol-004"), "No confirmo, no crees la OC de sol-004.");
  });

  it("reconoce confirmaciones claras", () => {
    for (const t of ["Confirmo", "sí, confirmo", "Si", "ok", "Adelante", "Confirmo la creación de la OC de sol-004."]) assert.equal(esConfirmacion(t), true, t);
  });

  it("no toma como confirmación negaciones ni preguntas", () => {
    for (const t of ["No confirmo", "no", "No la crees todavía", "¿Qué pasa si confirmo?", "Muéstrame el detalle", "sin confirmar"]) assert.equal(esConfirmacion(t), false, t);
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
