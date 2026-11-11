/**
 * Contratos de la fase B (PRD v2.0). Compartidos por CORE, AGENTE y UI.
 * Solo los cambia el orquestador. Sustituyen a `contratos.ts` (fase A), que se borra al integrar.
 */
import * as z from "zod";

// ── Reglas y hallazgos (PRD §7.3) ───────────────────────────────────────────

export const ReglaSchema = z.enum(["RC1", "RC2", "RC3", "RC4", "RC5", "RC6", "RC7", "RC8", "RC9", "RC10"]);
export type Regla = z.infer<typeof ReglaSchema>;

export const HallazgoSchema = z.object({
  regla: ReglaSchema,
  /** Legible y con los valores en juego, p. ej. «Cotización 26.500.000 COP vs solicitud 25.000.000 COP (6,0 %)». */
  detalle: z.string(),
  /** Qué hacer o qué pedir al solicitante. */
  accion_sugerida: z.string(),
  /** Valores comparados, p. ej. { solicitud: 25000000, cotizacion: 26500000 }. */
  valores: z.record(z.string(), z.unknown()).optional(),
});
export type Hallazgo = z.infer<typeof HallazgoSchema>;

/** Salida `data` de `oc_validar`. */
export const ValidacionSchema = z.object({
  caso: z.string(),
  solicitud_id: z.string(),
  apta: z.boolean(), // false si hay algún bloqueo
  bloqueos: z.array(HallazgoSchema),
  confirmaciones: z.array(HallazgoSchema),
  /** Valores completados desde maestros, p. ej. { indicador_iva: "C1", condiciones_pago: "Z030" }. */
  derivados: z.record(z.string(), z.string()),
  retroactiva: z.boolean(),
});
export type Validacion = z.infer<typeof ValidacionSchema>;

// ── Orden de compra (PRD §7.4) ──────────────────────────────────────────────

export const PosicionSchema = z.object({
  numero: z.number().int().positive(), // 10, 20, 30…
  descripcion: z.string().max(40), // texto breve SAP
  cantidad: z.number().positive(),
  unidad: z.enum(["UN", "H", "MES"]),
  precio_unitario: z.number().nonnegative(),
  centro_costo: z.string(),
  subarea: z.string(),
  indicador_iva: z.string(),
});

export const OrdenCompraSchema = z.object({
  referencia: z.object({ solicitud_id: z.string(), correo_id: z.string(), cotizacion_ref: z.string().nullable() }),
  sociedad: z.literal("1000"),
  organizacion_compras: z.literal("1000"),
  proveedor: z.object({ codigo_sap: z.string(), nit: z.string(), nombre: z.string() }),
  moneda: z.enum(["COP", "USD"]),
  condiciones_pago: z.string(),
  aprobador: z.object({ email: z.string(), fecha_aprobacion: z.string(), evidencia_sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  posiciones: z.array(PosicionSchema).min(1),
  excepciones: z.array(z.object({ codigo: z.string(), detalle: z.string(), confirmado_por: z.string().nullable() })),
});
export type OrdenCompra = z.infer<typeof OrdenCompraSchema>;

/** Interfaz obligatoria del PRD §7.4 (la reexporta src/sap/adapter.ts). */
export interface SapAdapter {
  consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null>;
  crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }>;
  buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null>;
}

// ── Herramientas (PRD §6.2) ─────────────────────────────────────────────────

export interface CtxHerramienta {
  /** Raíz del proyecto; las rutas se resuelven desde aquí, nunca absolutas. */
  directory: string;
  sessionId: string;
  /**
   * Lo inyecta el servidor: true solo si el usuario confirmó ESTE caso en su último mensaje.
   * Sin él (demo.ts, modulo/) manda el argumento `confirmado`.
   */
  confirmacionHumana?: (caso: string) => boolean;
  /** Reloj inyectable (tests). */
  ahora?: () => Date;
}

/** Cada export de src/tools/oc.ts cumple esto; el modelo la ve como `oc_<export>`. */
export interface HerramientaOC<A extends z.ZodRawShape = z.ZodRawShape> {
  description: string;
  args: A;
  /** Devuelve JSON serializado `{ ok: true, data }` o `{ ok: false, error, ... }`. Nunca lanza. */
  execute(args: z.infer<z.ZodObject<A>>, ctx: CtxHerramienta): Promise<string>;
}

export type RespuestaOk<T> = { ok: true; data: T };
export type RespuestaError = { ok: false; error: string; codigo?: CodigoError } & Record<string, unknown>;

export const CodigoErrorSchema = z.enum([
  "BLOQUEADA", // apta = false
  "REQUIERE_CONFIRMACION", // hay confirmaciones y no se envió confirmado = true
  "CONFIRMACION_NO_HUMANA", // confirmado = true pero el usuario no confirmó este caso en su último mensaje
  "PAYLOAD_ALTERADO", // el payload recibido no coincide con el reconstruido desde la fuente
  "ENTRADA_INVALIDA", // caso inexistente, JSON malformado, monto no numérico, adjunto ausente…
  "ERROR",
]);
export type CodigoError = z.infer<typeof CodigoErrorSchema>;

/** `data` de `oc_crear` cuando ok = true. */
export interface OcCreada {
  numero_oc: string;
  fecha: string;
  idempotente: boolean;
  retroactiva: boolean;
  /** Ruta relativa de la evidencia, p. ej. "out/sol-001/aprobacion.txt". */
  evidencia: string | null;
}

// ── Eventos servidor → UI (SSE) ─────────────────────────────────────────────

export type EventoChat =
  | { tipo: "tool_call"; id: string; nombre: string; entrada: unknown }
  /** `salida` = JSON ya parseado `{ ok, data | error }`. */
  | { tipo: "tool_result"; id: string; nombre: string; ok: boolean; ms: number; salida: unknown }
  | { tipo: "confirmacion_requerida"; caso: string; confirmaciones: Hallazgo[] }
  | ({ tipo: "oc_creada"; caso: string } & OcCreada)
  | { tipo: "mensaje"; texto: string }
  | { tipo: "error"; mensaje: string; correlationId: string }
  | { tipo: "fin" };
