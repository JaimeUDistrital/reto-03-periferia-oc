/** Tipos y esquemas de los fixtures y del paquete normalizado (PRD §7.1, §7.2). */
import * as z from "zod";

export const CorreoSchema = z.object({
  id: z.string(),
  de: z.string(),
  asunto: z.string(),
  fecha: z.string(),
  adjuntos: z.array(z.string()).optional(),
});

export const SolicitudSchema = z.object({
  solicitud_id: z.string(),
  solicitante: z.string(),
  proveedor_nombre: z.string(),
  proveedor_nit: z.string().optional(),
  descripcion: z.string(),
  centro_costo: z.string(),
  subarea: z.string(),
  cantidad: z.number(),
  valor_unitario: z.number(),
  valor_total: z.number(),
  moneda: z.enum(["COP", "USD"]),
  indicador_iva: z.string().optional(),
  condiciones_pago: z.string().optional(),
  fecha_solicitud: z.string(),
});
export type Solicitud = z.infer<typeof SolicitudSchema>;

export const AprobacionCrudaSchema = z.object({
  de: z.string(),
  para: z.string(),
  fecha: z.string(),
  asunto: z.string(),
  cuerpo: z.string(),
});

export interface Cotizacion {
  proveedor: string;
  nit: string | null;
  total: number;
  moneda: string;
  validez_hasta: string | null;
  texto: string;
  /** Código de la línea «COTIZACIÓN XXX»; va a `referencia.cotizacion_ref` de la OC. */
  referencia: string | null;
}

export interface Aprobacion {
  de: string;
  para: string;
  fecha: string;
  asunto: string;
  aprobado: boolean;
  texto: string;
}

export interface Factura {
  numero: string;
  fecha: string;
  total: number;
}

export interface Paquete {
  correo: { id: string; de: string; asunto: string; fecha: string };
  solicitud: Solicitud;
  cotizacion: Cotizacion | null;
  aprobacion: Aprobacion | null;
  factura: Factura | null;
  /** Nombres de los adjuntos que no están (cotizacion.txt, aprobacion.json, factura.txt). */
  faltantes: string[];
}

// ── Maestros ────────────────────────────────────────────────────────────────

export const ProveedorSchema = z.object({
  codigo_sap: z.string(),
  nit: z.string(),
  nombre: z.string(),
  condiciones_pago_default: z.string(),
  indicador_iva_default: z.string(),
  activo: z.boolean(),
});
export type Proveedor = z.infer<typeof ProveedorSchema>;

export const CentroCostoSchema = z.object({
  centro_costo: z.string(),
  nombre: z.string().optional(),
  subareas: z.array(z.string()),
  aprobadores: z.array(z.object({ email: z.string(), nombre: z.string().optional(), tope: z.number() })),
});
export type CentroCosto = z.infer<typeof CentroCostoSchema>;

export const IndicadorIvaSchema = z.object({ codigo: z.string(), descripcion: z.string(), tasa: z.number() });
export const CondicionPagoSchema = z.object({ codigo: z.string(), descripcion: z.string(), dias: z.number() });

export interface Maestros {
  proveedores: Proveedor[];
  centros: CentroCosto[];
  indicadores: z.infer<typeof IndicadorIvaSchema>[];
  condiciones: z.infer<typeof CondicionPagoSchema>[];
}

/** Error de entrada del solicitante (JSON malformado, monto no numérico…): se convierte en ENTRADA_INVALIDA. */
export class ErrorEntrada extends Error {
  readonly sugerencia: string;
  constructor(mensaje: string, sugerencia: string) {
    super(mensaje);
    this.name = "ErrorEntrada";
    this.sugerencia = sugerencia;
  }
}
