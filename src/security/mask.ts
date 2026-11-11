/**
 * Minimización de datos personales hacia el LLM y la UI (docs/PLAN.md §5.2).
 * Se aplica a TODA salida de tool. Dos vías complementarias:
 *  - por nombre de campo (cuenta, documento, nit, email, teléfono, nombres de persona);
 *  - por patrón en texto libre (correo, NIT con dígito de verificación, IBAN, teléfono con
 *    prefijo/separadores y números precedidos de «cuenta» o «cédula/documento»).
 * Un número suelto sin contexto (p. ej. una OC de 10 dígitos) no se toca a propósito.
 */

const MAX_PROFUNDIDAD = 25;

function asteriscos(n: number): string {
  return "*".repeat(Math.max(n, 0));
}

function dejarUltimos(valor: string, n: number): string {
  return asteriscos(valor.length - n) + valor.slice(-n);
}

function enmascararCorreoSolo(s: string): string {
  return s.replace(
    /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)\.([A-Za-z]{2,})/g,
    (_m, local: string, dominio: string, tld: string) => `${local.charAt(0)}***@${dominio.charAt(0)}***.${tld}`,
  );
}

function enmascararNit(s: string): string {
  return s.replace(/\b(\d{1,3}(?:\.\d{3}){2}|\d{8,10})-(\d)\b/g, (_m, cuerpo: string, dv: string) => {
    const digitos = cuerpo.replace(/\./g, "");
    return `${asteriscos(digitos.length - 3)}${digitos.slice(-3)}-${dv}`;
  });
}

function enmascararTelefonoValor(s: string): string {
  const digitos = s.replace(/\D/g, "").length;
  let vistos = 0;
  return s.replace(/\d/g, (d) => (++vistos > digitos - 2 ? d : "*"));
}

function enmascararTexto(s: string): string {
  return enmascararCorreoSolo(s)
    .replace(/\b(?:\d{1,3}(?:\.\d{3}){2}|\d{8,10})-\d\b/g, (nit) => enmascararNit(nit))
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, (iban) => dejarUltimos(iban, 4))
    .replace(
      /\b(cuenta(?: bancaria)?|cta\.?|account|iban)(\s*(?:n[úu]mero|no\.?|#|:)?\s*)(\d{8,20})\b/gi,
      (_m, palabra: string, sep: string, num: string) => `${palabra}${sep}${dejarUltimos(num, 4)}`,
    )
    .replace(
      /\b(c[eé]dula|dni|documento(?: de identidad)?|identificaci[oó]n|pasaporte|c\.c\.)(\s*(?:n[úu]mero|no\.?|#|:)?\s*)(\d{5,15})\b/gi,
      (_m, palabra: string, sep: string, num: string) => `${palabra}${sep}${dejarUltimos(num, 3)}`,
    )
    .replace(/\+\d{1,3}(?:[\s-]?\d{2,4}){2,4}\b/g, enmascararTelefonoValor)
    .replace(/\(\d{2,4}\)\s?\d{3,4}[\s-]?\d{3,4}\b/g, enmascararTelefonoValor)
    .replace(/(?<![\d.])\d{3}[\s-]\d{3}[\s-]\d{4}(?![\d])/g, enmascararTelefonoValor);
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(" ");
}

type Regla = (valor: string) => string;

function normalizarClave(clave: string): string {
  return clave
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const CLAVES_CUENTA = new Set(["cuenta", "cuentabancaria", "numerocuenta", "nrocuenta", "numerodecuenta", "cuentabanco", "iban", "accountnumber", "bankaccount"]);
const CLAVES_DOCUMENTO = new Set(["documento", "documentoidentidad", "numerodocumento", "nrodocumento", "cedula", "dni", "identificacion", "numeroidentificacion", "nrodeidentificacion"]);
const CLAVES_NIT = new Set(["nit", "nitproveedor", "nitcliente", "nitempresa", "numeronit"]);
const CLAVES_PERSONA = new Set([
  "solicitante", "contacto", "nombrecontacto", "aprobador", "responsable", "representante", "representantelegal",
  "comprador", "creadopor", "usuario", "titular", "nombresolicitante", "nombreresponsable", "firmante",
]);

function reglaPorClave(clave: string): Regla | undefined {
  const k = normalizarClave(clave);
  if (k.includes("email") || k.includes("correo")) {
    return (v) => (v.includes("@") ? enmascararCorreoSolo(v) : `${v.charAt(0)}***`);
  }
  if (k.includes("telefono") || k.includes("celular") || k.includes("movil") || k.includes("phone")) return enmascararTelefonoValor;
  if (CLAVES_CUENTA.has(k)) return (v) => dejarUltimos(v, 4);
  if (CLAVES_DOCUMENTO.has(k)) return (v) => dejarUltimos(v, 3);
  if (CLAVES_NIT.has(k)) return (v) => (/-\d$/.test(v) ? enmascararNit(v) : dejarUltimos(v, 3));
  if (CLAVES_PERSONA.has(k)) return iniciales;
  return undefined;
}

function recorrer(valor: unknown, profundidad: number): unknown {
  if (typeof valor === "string") return enmascararTexto(valor);
  if (valor === null || typeof valor !== "object") return valor;
  if (profundidad > MAX_PROFUNDIDAD) return "[profundidad excedida]";
  if (valor instanceof Date) return valor;
  if (Array.isArray(valor)) return valor.map((v) => recorrer(v, profundidad + 1));

  const salida: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor)) {
    const regla = reglaPorClave(clave);
    if (regla && (typeof v === "string" || typeof v === "number")) {
      salida[clave] = regla(String(v));
    } else {
      salida[clave] = recorrer(v, profundidad + 1);
    }
  }
  return salida;
}

/** Devuelve una copia enmascarada (no muta la entrada). Idempotente. */
export function mask(valor: unknown): unknown {
  return recorrer(valor, 0);
}
