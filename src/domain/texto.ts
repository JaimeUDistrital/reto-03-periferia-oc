/** Utilidades puras de texto, fechas y formato es-CO. Sin E/S. */

/** Minúsculas, sin tildes ni puntuación, espacios colapsados: "Papelería Central Ltda." → "papeleria central ltda". */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "900.555.111-2" → "900555111" (sin puntos ni dígito de verificación). */
export function normalizarNit(nit: string): string {
  return nit.trim().replace(/-\d$/, "").replace(/[.\s]/g, "");
}

/** Fecha de calendario tal como viene: primeros 10 caracteres ("2026-08-21T10:02:00-05:00" → "2026-08-21"). */
export function soloFecha(fecha: string): string {
  return fecha.slice(0, 10);
}

/** Suma días a una fecha ISO aaaa-mm-dd; null si la fecha no existe en el calendario. */
export function sumarDias(fechaIso: string, dias: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const base = new Date(Date.UTC(anio, mes - 1, dia));
  if (base.getUTCFullYear() !== anio || base.getUTCMonth() !== mes - 1 || base.getUTCDate() !== dia) return null;
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/**
 * Monto es-CO ("11.400.000", "1.234,56") o simple ("1234.56"); null si no es numérico.
 * Un punto seguido de exactamente 3 dígitos se lee como separador de miles.
 */
export function parsearMonto(texto: string): number | null {
  const token = /^\d[\d.,]*$/.exec(texto.trim())?.[0];
  if (token === undefined) return null;
  let normalizado = token;
  if (token.includes(",")) normalizado = token.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(token)) normalizado = token.replace(/\./g, "");
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/** 26500000 → "26.500.000" (es-CO, sin depender de la configuración regional del equipo). */
export function formatoNumero(n: number): string {
  const [entera = "", decimal] = n.toFixed(2).replace(/\.00$/, "").split(".");
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal === undefined ? miles : `${miles},${decimal}`;
}

/** 26500000, "COP" → "26.500.000 COP". */
export function formatoMonto(n: number, moneda: string): string {
  return `${formatoNumero(n)} ${moneda}`;
}

/** 0.06 → "6,0 %". */
export function formatoPorcentaje(fraccion: number): string {
  return `${(fraccion * 100).toFixed(1).replace(".", ",")} %`;
}
