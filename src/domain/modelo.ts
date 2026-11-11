/**
 * Modelo de dominio del núcleo (CORE). Independiente del formato de los archivos:
 * `src/data/` traduce los fixtures a estos tipos (capa anticorrupción).
 * Fechas: ISO `aaaa-mm-dd`. Montos: número en la moneda de la solicitud.
 */
import * as z from "zod";

/** Identificador de solicitud admitido por tools y loaders (evita rutas arbitrarias). */
export const SolicitudIdSchema = z.string().regex(/^sol-\d{3}$/, "Formato esperado: sol-001");

export type EstadoProveedor = "activo" | "inactivo" | "bloqueado";

export interface Proveedor {
  nit: string; // normalizado: "900123456-7"
  razonSocial: string;
  estado: EstadoProveedor;
  condicionPago: string;
  indicadorIva: string;
}

export interface LiderAprobador {
  id: string;
  nombre: string;
  tope: number;
}

export interface CentroCosto {
  codigo: string;
  nombre: string;
  subareas: string[];
  lider: LiderAprobador;
}

export interface IndicadorIva {
  codigo: string;
  tasa: number; // 0.19 = 19 %
}

export interface CondicionPago {
  codigo: string;
  dias: number;
  descripcion: string;
}

export interface Maestros {
  proveedores: Proveedor[];
  centrosCosto: CentroCosto[];
  indicadoresIva: IndicadorIva[];
  condicionesPago: CondicionPago[];
}

export interface Solicitud {
  id: string;
  fecha: string;
  solicitante: string;
  centroCosto: string;
  subarea: string;
  proveedorNit: string;
  descripcion: string;
  total: number;
  moneda: string;
  condicionPago: string;
}

export type EstadoAprobacion = "aprobada" | "rechazada" | "pendiente";

export interface Aprobacion {
  aprobador: string; // id del líder
  estado: EstadoAprobacion;
  fecha: string;
}

export interface Correo {
  de: string;
  asunto: string;
  fecha: string;
  cuerpo: string;
}

/** Lo que el parser logra leer de cotizacion.txt; lo ausente es `null`. */
export interface Cotizacion {
  proveedor: string | null;
  nit: string | null;
  fecha: string | null;
  subtotal: number | null;
  impuesto: number | null;
  total: number | null;
  condicionPago: string | null;
  indicadorIva: string | null;
}

/** Lo que el parser logra leer de factura.txt; lo ausente es `null`. */
export interface Factura {
  numero: string | null;
  fecha: string | null;
  nit: string | null;
  total: number | null;
}

/** Todo lo que los controles necesitan: datos ya traducidos al dominio, sin I/O. */
export interface Expediente {
  solicitud: Solicitud;
  correo: Correo;
  cotizacion: Cotizacion;
  aprobacion: Aprobacion;
  factura: Factura | null;
  maestros: Maestros;
}
