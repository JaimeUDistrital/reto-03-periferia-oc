// Funciones puras de presentación (sin DOM ni React; se prueban con node:test).
import type { OrdenCompra, Validacion } from "../../src/domain/contratos-oc";
import { comoOrden, comoValidacion, datosOk } from "./estado";
import type { Item } from "./estado";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

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
  oc_leer_paquete: "Leer el paquete",
  oc_validar: "Validar la solicitud",
  oc_construir_payload: "Construir la OC",
  oc_generar_evidencia: "Generar la evidencia",
  oc_crear: "Crear la OC en SAP",
  oc_leer_excel: "Leer el Excel",
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

// ── Formato ────────────────────────────────────────────────────────────────

/** 25000000 → "25.000.000"; decimales con coma (máx. 2). */
export function formatearNumero(n: number): string {
  const redondeado = Math.round(Math.abs(n) * 100) / 100;
  const [entero = "0", decimales] = String(redondeado).split(".");
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${miles}${decimales ? `,${decimales}` : ""}`;
}

export const formatearMonto = (n: number, moneda: string): string => `${formatearNumero(n)} ${moneda}`;

export function formatearValor(v: unknown): string {
  if (typeof v === "number") return formatearNumero(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (v === null || v === undefined) return "—";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ── Herramientas: argumentos y resumen del resultado ───────────────────────

const MAX_VALOR = 40;

function valorCompacto(v: unknown): string {
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object" && v !== null) return "{…}";
  const t = String(v);
  return t.length > MAX_VALOR ? `${t.slice(0, MAX_VALOR)}…` : t;
}

/** `{ caso: "sol-004" }` → "caso: sol-004" (una línea). */
export function argumentosCompactos(entrada: unknown): string {
  if (!esObjeto(entrada)) return "";
  return Object.entries(entrada).map(([k, v]) => `${k}: ${valorCompacto(v)}`).join(", ");
}

const CODIGOS_ERROR: Record<string, string> = {
  BLOQUEADA: "Bloqueada",
  CONFIRMACION_NO_HUMANA: "Falta tu confirmación",
  PAYLOAD_ALTERADO: "Payload alterado",
  ENTRADA_INVALIDA: "Entrada inválida",
};

function resumenError(salida: unknown): string {
  if (!esObjeto(salida)) return "Error";
  const error = typeof salida["error"] === "string" ? salida["error"] : "";
  const codigo = typeof salida["codigo"] === "string" ? salida["codigo"] : "";
  if (codigo === "REQUIERE_CONFIRMACION") return "Requiere confirmación";
  const etiqueta = CODIGOS_ERROR[codigo];
  if (etiqueta) return error ? `${etiqueta}: ${error}` : etiqueta;
  return error ? `Error: ${error}` : "Error";
}

const reglas = (hs: Array<{ regla: string }>) => hs.map((h) => h.regla).join(", ");

/** Resumen de una línea del resultado de una herramienta `oc_*`. */
export function resumenResultado(nombre: string, ok: boolean, salida: unknown): string {
  if (!ok || (esObjeto(salida) && salida["ok"] === false)) return resumenError(salida);
  const data = datosOk(salida);
  switch (nombre) {
    case "oc_validar": {
      const v = comoValidacion(data);
      if (!v) break;
      if (!v.apta || v.bloqueos.length > 0) return `Bloqueada: ${reglas(v.bloqueos)}`;
      if (v.confirmaciones.length === 0) return "Apta, sin confirmaciones";
      return `Apta, ${plural(v.confirmaciones.length, "confirmación", "confirmaciones")} (${reglas(v.confirmaciones)})`;
    }
    case "oc_construir_payload": {
      const orden = esObjeto(data) ? comoOrden(data["orden"]) : null;
      if (!orden) break;
      return `OC lista: ${plural(orden.posiciones.length, "posición", "posiciones")}, ${formatearMonto(totalOrden(orden), orden.moneda)}`;
    }
    case "oc_crear": {
      if (esObjeto(data) && typeof data["numero_oc"] === "string") return `OC ${data["numero_oc"]}${data["idempotente"] === true ? " (ya existía)" : ""}`;
      break;
    }
    case "oc_generar_evidencia": {
      if (esObjeto(data) && typeof data["ruta"] === "string") return `Evidencia en ${data["ruta"]}`;
      break;
    }
  }
  return "Listo";
}

// ── Validación y orden ─────────────────────────────────────────────────────

export const totalOrden = (orden: OrdenCompra): number =>
  orden.posiciones.reduce((suma, p) => suma + p.cantidad * p.precio_unitario, 0);

export type EstadoValidacion = "bloqueada" | "confirmacion" | "apta";

export function estadoValidacion(v: Validacion): EstadoValidacion {
  if (!v.apta || v.bloqueos.length > 0) return "bloqueada";
  return v.confirmaciones.length > 0 ? "confirmacion" : "apta";
}

// ── Mensajes que envía la UI ───────────────────────────────────────────────

export const PROMPT_DEMO =
  'Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.';
export const mensajeProcesar = (caso: string): string => `Procesa la solicitud "${caso}".`;
export const mensajeConfirmar = (caso: string): string => `Confirmo la creación de la OC de ${caso}.`;
export const mensajeNoConfirmar = (caso: string): string => `No confirmo, no crees la OC de ${caso}.`;

/** Código de seguimiento de los errores que genera el propio cliente (red caída). */
export const ID_ERROR_RED = "cliente";

/**
 * ¿El texto libre es una confirmación inequívoca? Conservador: ante un "no", una pregunta
 * o cualquier duda devuelve false (así nunca se envía `confirmar` por accidente).
 */
export function esConfirmacion(texto: string): boolean {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[¿?¡!.,;:]/g, (c) => (c === "?" || c === "¿" ? "?" : " ")).trim();
  if (t.includes("?")) return false;
  if (/\b(no|nunca|sin|tampoco|todavia|aun|cancela|rechazo)\b/.test(t)) return false;
  return /^(si|ok|vale|dale|adelante|procede|confirmo|confirmar|confirmado|de acuerdo|claro)\b/.test(t);
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
