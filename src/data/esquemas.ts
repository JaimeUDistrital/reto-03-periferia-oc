/**
 * Esquemas Zod del formato CRUDO de cada archivo (lo único que cambia cuando lleguen los datos reales).
 * Los nombres y formas de aquí son un supuesto; `cargador.ts` los traduce al dominio.
 */
import * as z from "zod";

export const ProveedorCrudoSchema = z.object({
  nit: z.string(),
  razonSocial: z.string(),
  estado: z.enum(["activo", "inactivo", "bloqueado"]),
  condicionPago: z.string(),
  indicadorIva: z.string(),
});

export const CentroCostoCrudoSchema = z.object({
  centro: z.string(),
  nombre: z.string(),
  subareas: z.array(z.string()),
  lider: z.object({ id: z.string(), nombre: z.string(), tope: z.number() }),
});

export const IndicadorIvaCrudoSchema = z.object({ codigo: z.string(), tasa: z.number() });

export const CondicionPagoCrudaSchema = z.object({
  codigo: z.string(),
  dias: z.number(),
  descripcion: z.string(),
});

export const SolicitudCrudaSchema = z.object({
  id: z.string(),
  fecha: z.iso.date(),
  solicitante: z.string(),
  centroCosto: z.string(),
  subarea: z.string(),
  proveedorNit: z.string(),
  descripcion: z.string(),
  total: z.number(),
  moneda: z.string(),
  condicionPago: z.string(),
});

export const AprobacionCrudaSchema = z.object({
  aprobador: z.string(),
  estado: z.enum(["aprobada", "rechazada", "pendiente"]),
  fecha: z.iso.date(),
});

export const CorreoCrudoSchema = z.object({
  de: z.string(),
  asunto: z.string(),
  fecha: z.iso.date(),
  cuerpo: z.string(),
});
