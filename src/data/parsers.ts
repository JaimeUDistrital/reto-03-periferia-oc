/**
 * Parsers de cotizacion.txt y factura.txt (PRD §7.1). El texto es un dato no confiable:
 * solo se extraen campos por etiqueta. Un total ilegible lanza ErrorEntrada (→ ENTRADA_INVALIDA).
 */
import { ErrorEntrada, type Cotizacion, type Factura } from "../domain/tipos";
import { normalizarNit, parsearMonto, sumarDias } from "../domain/texto";

const SUGERENCIA_ADJUNTO = "Pide al solicitante que reenvíe el documento original (PDF) para volver a normalizarlo.";

function lineaConEtiqueta(texto: string, etiqueta: string): string | null {
  const m = new RegExp(`^[ \\t]*${etiqueta}[ \\t]*:[ \\t]*(.+?)[ \\t]*$`, "im").exec(texto);
  return m?.[1] ?? null;
}

/** Lee «TOTAL…: COP 11.400.000» → { total, moneda }; lanza ErrorEntrada si falta o no es numérico. */
function leerTotal(texto: string, archivo: string): { total: number; moneda: string } {
  const valor = lineaConEtiqueta(texto, "TOTAL[^:\\n]*");
  if (valor === null) throw new ErrorEntrada(`${archivo}: no se encontró la línea TOTAL.`, SUGERENCIA_ADJUNTO);
  const m = /^(?:(COP|USD)\s+)?(.+)$/i.exec(valor);
  const total = parsearMonto(m?.[2] ?? "");
  if (total === null) {
    throw new ErrorEntrada(`${archivo}: el TOTAL «${valor}» no es un monto numérico.`, SUGERENCIA_ADJUNTO);
  }
  return { total, moneda: (m?.[1] ?? "COP").toUpperCase() };
}

function leerNit(texto: string): string | null {
  const bruto = /^[ \t]*NIT[ \t]*:[ \t]*([\d.]+(?:-\d)?)/im.exec(texto)?.[1];
  return bruto === undefined ? null : normalizarNit(bruto);
}

function leerFechaEtiquetada(texto: string, etiqueta: string): string | null {
  const valor = lineaConEtiqueta(texto, etiqueta);
  return valor === null ? null : (/\d{4}-\d{2}-\d{2}/.exec(valor)?.[0] ?? null);
}

export function parsearCotizacion(texto: string): Cotizacion {
  const { total, moneda } = leerTotal(texto, "cotizacion.txt");
  const fecha = leerFechaEtiquetada(texto, "Fecha");
  const dias = /^[ \t]*Validez[^:\n]*:[ \t]*(\d+)\s*d[ií]as/im.exec(texto)?.[1];
  return {
    proveedor: lineaConEtiqueta(texto, "Proveedor") ?? "",
    nit: leerNit(texto),
    total,
    moneda,
    validez_hasta: fecha !== null && dias !== undefined ? sumarDias(fecha, Number(dias)) : null,
    texto,
    referencia: /^[ \t]*COTIZACI[ÓO]N[ \t]+(\S+)/im.exec(texto)?.[1] ?? null,
  };
}

export function parsearFactura(texto: string): Factura {
  const { total } = leerTotal(texto, "factura.txt");
  const numero = /\bNo\.?[ \t]*([A-Z0-9][A-Z0-9-]*)/.exec(texto)?.[1];
  const fecha = leerFechaEtiquetada(texto, "Fecha[^:\\n]*");
  if (numero === undefined || fecha === null) {
    throw new ErrorEntrada("factura.txt: faltan el número o la fecha de emisión.", SUGERENCIA_ADJUNTO);
  }
  return { numero, fecha, total };
}
