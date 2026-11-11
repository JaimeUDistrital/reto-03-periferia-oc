/**
 * Loaders: leen los fixtures, validan con Zod y devuelven tipos de dominio.
 * Raíz inyectable; por defecto `fixtures/reto-03` desde process.cwd().
 * Única parte del sistema que conoce nombres de archivo y su formato.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod";
import type { Expediente, Maestros } from "../domain/modelo";
import { SolicitudIdSchema } from "../domain/modelo";
import {
  AprobacionCrudaSchema,
  CentroCostoCrudoSchema,
  CondicionPagoCrudaSchema,
  CorreoCrudoSchema,
  IndicadorIvaCrudoSchema,
  ProveedorCrudoSchema,
  SolicitudCrudaSchema,
} from "./esquemas";
import { normalizarNit, parsearCotizacion, parsearFactura } from "./parsers";

export function raizPorDefecto(): string {
  return path.join(process.cwd(), "fixtures", "reto-03");
}

async function leerTexto(ruta: string): Promise<string> {
  return readFile(ruta, "utf8");
}

async function leerJson<S extends z.ZodType>(ruta: string, esquema: S): Promise<z.output<S>> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(await leerTexto(ruta));
  } catch (error) {
    throw new Error(`${path.basename(ruta)}: no se pudo leer como JSON (${error instanceof Error ? error.message : "error"})`);
  }
  const resultado = esquema.safeParse(crudo);
  if (!resultado.success) {
    throw new Error(`${path.basename(ruta)}: formato inválido\n${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}

export async function cargarMaestros(raiz: string = raizPorDefecto()): Promise<Maestros> {
  const dir = path.join(raiz, "maestros");
  const [proveedores, centros, indicadores, condiciones] = await Promise.all([
    leerJson(path.join(dir, "proveedores.json"), z.array(ProveedorCrudoSchema)),
    leerJson(path.join(dir, "centros-costo.json"), z.array(CentroCostoCrudoSchema)),
    leerJson(path.join(dir, "indicadores-iva.json"), z.array(IndicadorIvaCrudoSchema)),
    leerJson(path.join(dir, "condiciones-pago.json"), z.array(CondicionPagoCrudaSchema)),
  ]);
  return {
    proveedores: proveedores.map((p) => ({ ...p, nit: normalizarNit(p.nit) })),
    centrosCosto: centros.map(({ centro, ...resto }) => ({ codigo: centro, ...resto })),
    indicadoresIva: indicadores,
    condicionesPago: condiciones,
  };
}

export async function listarSolicitudIds(raiz: string = raizPorDefecto()): Promise<string[]> {
  const entradas = await readdir(path.join(raiz, "solicitudes"), { withFileTypes: true });
  return entradas
    .filter((e) => e.isDirectory() && SolicitudIdSchema.safeParse(e.name).success)
    .map((e) => e.name)
    .sort();
}

export async function cargarExpediente(solicitudId: string, raiz: string = raizPorDefecto()): Promise<Expediente> {
  const id = SolicitudIdSchema.parse(solicitudId);
  const dir = path.join(raiz, "solicitudes", id);

  const [solicitud, correo, aprobacion, textoCotizacion, textoFactura, maestros] = await Promise.all([
    leerJson(path.join(dir, "solicitud.json"), SolicitudCrudaSchema),
    leerJson(path.join(dir, "correo.json"), CorreoCrudoSchema),
    leerJson(path.join(dir, "aprobacion.json"), AprobacionCrudaSchema),
    leerTexto(path.join(dir, "cotizacion.txt")),
    leerTexto(path.join(dir, "factura.txt")).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    }),
    cargarMaestros(raiz),
  ]);

  if (solicitud.id !== id) {
    throw new Error(`solicitud.json: el id "${solicitud.id}" no coincide con la carpeta ${id}`);
  }

  return {
    solicitud: { ...solicitud, proveedorNit: normalizarNit(solicitud.proveedorNit) },
    correo,
    cotizacion: parsearCotizacion(textoCotizacion),
    aprobacion,
    factura: textoFactura === null ? null : parsearFactura(textoFactura),
    maestros,
  };
}
