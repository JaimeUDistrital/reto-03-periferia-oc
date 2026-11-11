/** Lectura y normalización del paquete de un caso (HU-1) y de los maestros. Solo lectura de fixtures/. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod";
import type { ZodType } from "zod";
import { dirSolicitudes } from "../domain/casos";
import {
  AprobacionCrudaSchema,
  CentroCostoSchema,
  CondicionPagoSchema,
  CorreoSchema,
  ErrorEntrada,
  IndicadorIvaSchema,
  ProveedorSchema,
  SolicitudSchema,
  type Aprobacion,
  type Maestros,
  type Paquete,
} from "../domain/tipos";
import { parsearCotizacion, parsearFactura } from "./parsers";

async function leerTextoOpcional(ruta: string): Promise<string | null> {
  try {
    return await readFile(ruta, "utf8");
  } catch {
    return null;
  }
}

function resumenZod(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`).join("; ");
}

/** Lee un JSON y lo valida con zod; ErrorEntrada si falta, está malformado o no cumple el esquema. */
async function leerJson<T>(ruta: string, archivo: string, esquema: ZodType<T>, obligatorio: boolean): Promise<T | null> {
  const texto = await leerTextoOpcional(ruta);
  if (texto === null) {
    if (!obligatorio) return null;
    throw new ErrorEntrada(`Falta ${archivo}.`, `Pide al solicitante que reenvíe ${archivo}; sin él no se puede procesar el caso.`);
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new ErrorEntrada(`${archivo} no es JSON válido.`, `Pide al solicitante que reenvíe ${archivo} bien formado.`);
  }
  const r = esquema.safeParse(crudo);
  if (!r.success) {
    throw new ErrorEntrada(`${archivo} no cumple el formato esperado (${resumenZod(r.error)}).`, `Pide al solicitante que corrija ${archivo}.`);
  }
  return r.data;
}

/** Palabra «Aprobado» presente y sin negación inmediata («no aprobado»). */
export function esAprobacion(cuerpo: string): boolean {
  return /\baprobado\b/i.test(cuerpo) && !/\bno\s+(?:est[aá]\s+|queda\s+|fue\s+)?aprobado\b/i.test(cuerpo);
}

export async function leerPaquete(directory: string, caso: string): Promise<Paquete> {
  const dir = path.join(dirSolicitudes(directory), caso);
  const correo = await leerJson(path.join(dir, "correo.json"), "correo.json", CorreoSchema, true);
  const solicitud = await leerJson(path.join(dir, "solicitud.json"), "solicitud.json", SolicitudSchema, true);
  const aprobacionCruda = await leerJson(path.join(dir, "aprobacion.json"), "aprobacion.json", AprobacionCrudaSchema, false);
  const textoCot = await leerTextoOpcional(path.join(dir, "cotizacion.txt"));
  const textoFac = await leerTextoOpcional(path.join(dir, "factura.txt"));
  if (correo === null || solicitud === null) throw new ErrorEntrada("Paquete incompleto.", "Reenvía el paquete completo.");

  const aprobacion: Aprobacion | null =
    aprobacionCruda === null
      ? null
      : {
          de: aprobacionCruda.de,
          para: aprobacionCruda.para,
          fecha: aprobacionCruda.fecha,
          asunto: aprobacionCruda.asunto,
          aprobado: esAprobacion(aprobacionCruda.cuerpo),
          texto: aprobacionCruda.cuerpo,
        };

  const faltantes: string[] = [];
  if (textoCot === null) faltantes.push("cotizacion.txt");
  if (aprobacion === null) faltantes.push("aprobacion.json");
  // La factura solo «falta» si el correo dice que venía adjunta; en los demás casos es opcional.
  if (textoFac === null && (correo.adjuntos ?? []).some((a) => /^factura\./i.test(a))) faltantes.push("factura.txt");

  return {
    correo: { id: correo.id, de: correo.de, asunto: correo.asunto, fecha: correo.fecha },
    solicitud,
    cotizacion: textoCot === null ? null : parsearCotizacion(textoCot),
    aprobacion,
    factura: textoFac === null ? null : parsearFactura(textoFac),
    faltantes,
  };
}

export async function leerMaestros(directory: string): Promise<Maestros> {
  const dir = path.join(directory, "fixtures", "reto-03", "maestros");
  const lista = async <T>(archivo: string, esquema: ZodType<T>): Promise<T[]> =>
    (await leerJson(path.join(dir, archivo), `maestros/${archivo}`, z.array(esquema), true)) ?? [];
  return {
    proveedores: await lista("proveedores.json", ProveedorSchema),
    centros: await lista("centros-costo.json", CentroCostoSchema),
    indicadores: await lista("indicadores-iva.json", IndicadorIvaSchema),
    condiciones: await lista("condiciones-pago.json", CondicionPagoSchema),
  };
}
