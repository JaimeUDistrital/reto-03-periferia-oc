/**
 * Parsers deterministas (regex) de cotizacion.txt y factura.txt.
 * Regla: un campo ausente o ilegible es `null`; nunca se lanza excepción.
 * El texto es un dato no confiable: solo se extraen campos por etiqueta, nada se interpreta.
 */
import type { Cotizacion, Factura } from "../domain/modelo";

/** Fecha ISO (aaaa-mm-dd) o dd/mm/aaaa → ISO; null si no hay fecha o no existe en el calendario. */
export function parsearFecha(texto: string): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(texto);
  const latino = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(texto);
  const [anio, mes, dia] = iso
    ? [iso[1], iso[2], iso[3]]
    : latino
      ? [latino[3], latino[2], latino[1]]
      : [undefined, undefined, undefined];
  if (anio === undefined || mes === undefined || dia === undefined) return null;

  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  const existe =
    fecha.getUTCFullYear() === Number(anio) &&
    fecha.getUTCMonth() === Number(mes) - 1 &&
    fecha.getUTCDate() === Number(dia);
  return existe ? `${anio}-${mes}-${dia}` : null;
}

/**
 * Monto es-CO ("$ 1.234.567,89", "$ 11.900.000") o simple ("1234567.89").
 * Ambigüedad conocida: "1.234" (un punto y 3 dígitos) se lee como miles (1234).
 */
export function parsearMonto(texto: string): number | null {
  const token = /\d[\d.,]*/.exec(texto)?.[0]?.replace(/[.,]+$/, "");
  if (token === undefined) return null;

  let normalizado: string;
  if (token.includes(",")) normalizado = token.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(token)) normalizado = token.replace(/\./g, "");
  else normalizado = token;

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/** "900.123.456-7" → "900123456-7". */
export function normalizarNit(nit: string): string {
  return nit.replace(/[.\s]/g, "");
}

/** Busca "NIT: …" en el texto. */
export function extraerNit(texto: string): string | null {
  const bruto = /\bNIT\b[\s:.]*(\d[\d.]*(?:-\d)?)/i.exec(texto)?.[1];
  return bruto === undefined ? null : normalizarNit(bruto);
}

/** Valor de la primera línea con la etiqueta dada (regex sin anclas; se ancla al inicio de línea). */
function valorDeLinea(texto: string, etiqueta: string): string | null {
  const m = new RegExp(`^[ \\t]*${etiqueta}[ \\t]*:[ \\t]*(.+?)[ \\t]*$`, "im").exec(texto);
  return m?.[1] ?? null;
}

function montoDeLinea(texto: string, etiqueta: string): number | null {
  const valor = valorDeLinea(texto, etiqueta);
  return valor === null ? null : parsearMonto(valor);
}

function fechaDeLinea(texto: string): string | null {
  const valor = valorDeLinea(texto, "fecha(?:[ \\t]+de[ \\t]+[\\wáéíóú]+)?");
  return valor === null ? null : parsearFecha(valor);
}

function codigoDeLinea(texto: string, etiqueta: string): string | null {
  const valor = valorDeLinea(texto, etiqueta);
  return valor?.match(/^[A-Za-z0-9_-]+/)?.[0] ?? null;
}

export function parsearCotizacion(texto: string): Cotizacion {
  return {
    proveedor: valorDeLinea(texto, "(?:proveedor|raz[oó]n social)"),
    nit: extraerNit(texto),
    fecha: fechaDeLinea(texto),
    subtotal: montoDeLinea(texto, "subtotal"),
    impuesto: montoDeLinea(texto, "(?:iva|impuesto)[^:\\n]*"),
    total: montoDeLinea(texto, "total(?:[ \\t]+a[ \\t]+pagar)?"),
    condicionPago: codigoDeLinea(texto, "condici[oó]n(?:es)?[ \\t]+de[ \\t]+pago"),
    indicadorIva: codigoDeLinea(texto, "indicador[ \\t]+(?:de[ \\t]+)?iva"),
  };
}

export function parsearFactura(texto: string): Factura {
  const numero = /^[ \t]*factura[ \t]*(?:electr[oó]nica)?[ \t]*(?:n[oº°]\.?|#|n[uú]mero)?[ \t]*[:\-]?[ \t]*([A-Z0-9][A-Z0-9-]*)/im.exec(texto)?.[1];
  return {
    numero: numero ?? null,
    fecha: fechaDeLinea(texto),
    nit: extraerNit(texto),
    total: montoDeLinea(texto, "total(?:[ \\t]+a[ \\t]+pagar)?"),
  };
}
