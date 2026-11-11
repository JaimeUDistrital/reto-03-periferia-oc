// Funciones puras de presentación (sin DOM ni React; se prueban con node:test).
import type { Dictamen } from "../../src/domain/contratos";
import type { Item } from "./estado";

export type ItemTool = Extract<Item, { tipo: "tool" }>;
export type Bloque =
  | { tipo: "herramientas"; clave: string; tools: ItemTool[] }
  | { tipo: "item"; clave: string; item: Exclude<Item, { tipo: "tool" }> };

/** Junta las llamadas a tools consecutivas para mostrarlas como un solo bloque. */
export function agruparItems(items: Item[]): Bloque[] {
  const bloques: Bloque[] = [];
  items.forEach((item, i) => {
    if (item.tipo !== "tool") {
      bloques.push({ tipo: "item", clave: `i${i}`, item });
      return;
    }
    const ultimo = bloques.at(-1);
    if (ultimo?.tipo === "herramientas") ultimo.tools.push(item);
    else bloques.push({ tipo: "herramientas", clave: `t${i}`, tools: [item] });
  });
  return bloques;
}

const ETIQUETAS: Record<string, string> = {
  listarSolicitudes: "Lista de solicitudes",
  validarProveedor: "Proveedor",
  validarCentroCostoYTope: "Centro de costo y tope",
  validarIVA: "IVA",
  validarCondicionPago: "Condición de pago",
  detectarCompraRetroactiva: "Compra retroactiva",
  validarCoherencia: "Coherencia con la cotización",
  evaluarSolicitud: "Dictamen completo",
  crearOrdenCompra: "Crear orden de compra",
};

export const etiquetaTool = (nombre: string): string => ETIQUETAS[nombre] ?? nombre;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function resumenHerramientas(tools: ItemTool[]): string {
  const listas = tools.filter((t) => t.resultado);
  if (listas.length < tools.length) return `Consultando… ${listas.length} de ${tools.length} listas`;
  const ms = listas.reduce((suma, t) => suma + (t.resultado?.ms ?? 0), 0);
  const errores = listas.filter((t) => !t.resultado?.ok).length;
  const base = `${plural(tools.length, "herramienta", "herramientas")} en ${ms} ms`;
  return errores ? `${base}, ${errores} con error` : base;
}

export function resumenControles(dictamen: Dictamen): string {
  const contar = (estado: string) => dictamen.controles.filter((c) => c.estado === estado).length;
  const alertas = contar("ALERTA");
  const bloqueos = contar("BLOQUEO");
  const partes = [`${contar("OK")} de ${dictamen.controles.length} controles en orden`];
  if (alertas) partes.push(`${alertas} con alerta`);
  if (bloqueos) partes.push(plural(bloqueos, "bloqueante", "bloqueantes"));
  return partes.join(", ");
}

/** El modelo responde con algo de markdown; lo dejamos como texto limpio (sin HTML). */
export function limpiarMarkdown(texto: string): string {
  return texto
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^(\s*)[-*]\s+/gm, "$1• ");
}
