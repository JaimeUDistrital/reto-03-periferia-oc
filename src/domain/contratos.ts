/**
 * Contratos compartidos entre módulos (CORE, AGENTE, UI).
 * Solo los cambia el orquestador: un cambio aquí afecta a todos (docs/PLAN.md §4).
 */
import * as z from "zod";

// ── Dictamen ────────────────────────────────────────────────────────────────

export const EstadoControlSchema = z.enum(["OK", "ALERTA", "BLOQUEO"]);
export type EstadoControl = z.infer<typeof EstadoControlSchema>;

export const ResultadoControlSchema = z.object({
  id: z.string(), // p. ej. "CTRL-PROVEEDOR"
  nombre: z.string(),
  estado: EstadoControlSchema,
  detalle: z.string(), // explicación legible, ya enmascarada si sale al LLM o a la UI
  evidencia: z.record(z.string(), z.unknown()),
});
export type ResultadoControl = z.infer<typeof ResultadoControlSchema>;

/** Provisional: los valores se cierran en B1 con el PRD real. */
export const DecisionSchema = z.enum(["APROBABLE", "REQUIERE_REVISION", "RECHAZADA"]);
export type Decision = z.infer<typeof DecisionSchema>;

export const DictamenSchema = z.object({
  solicitudId: z.string(),
  decision: DecisionSchema,
  controles: z.array(ResultadoControlSchema),
  hash: z.string(), // sha256 del dictamen canónico: liga la confirmación humana a este resultado
});
export type Dictamen = z.infer<typeof DictamenSchema>;

// ── Herramientas ────────────────────────────────────────────────────────────

export interface ToolDef<I = unknown, O = unknown> {
  nombre: string;
  descripcion: string;
  entrada: z.ZodType<I>;
  salida: z.ZodType<O>;
  /** true = el servidor NO la ejecuta sin un token de confirmación humana. */
  requiereConfirmacion: boolean;
  ejecutar(entrada: I): Promise<O>;
}

// ── LLM (puerto independiente del proveedor) ────────────────────────────────

export interface LlamadaTool {
  id: string;
  nombre: string;
  args: unknown;
}

export type TurnoHistorial =
  | { tipo: "usuario"; texto: string }
  | {
      tipo: "modelo";
      texto?: string;
      llamadas: LlamadaTool[];
      /** Contenido original del proveedor (p. ej. firmas de pensamiento de Gemini) para reenviarlo tal cual. */
      nativo?: unknown;
    }
  | { tipo: "resultado_tool"; llamadaId: string; nombre: string; resultado: unknown };

export interface RespuestaLlm {
  texto?: string;
  llamadas: LlamadaTool[];
  nativo?: unknown;
}

export interface LlmPort {
  generar(entrada: {
    sistema: string;
    historial: TurnoHistorial[];
    tools: ToolDef[];
  }): Promise<RespuestaLlm>;
}

// ── SAP ─────────────────────────────────────────────────────────────────────

export interface OrdenCompra {
  numero: string; // p. ej. "4500001234"
  solicitudId: string;
  creadaEn: string; // ISO 8601
}

export interface SapGateway {
  /** Idempotente: la misma solicitud devuelve siempre la misma OC. */
  crearOrdenCompra(solicitudId: string, dictamen: Dictamen): Promise<OrdenCompra>;
}

// ── Fachada del núcleo (la implementa CORE en src/tools/oc.ts) ──────────────

export interface NucleoOC {
  listarSolicitudes(): Promise<string[]>;
  /** Pura y determinista: mismo expediente → mismo dictamen y mismo hash. */
  evaluarSolicitud(solicitudId: string): Promise<Dictamen>;
  /** Incluye crearOrdenCompra con requiereConfirmacion = true. */
  herramientas: ToolDef[];
  sap: SapGateway;
}

// ── Eventos servidor → UI (SSE) ─────────────────────────────────────────────

export type EventoAgente =
  | { tipo: "tool_call"; id: string; nombre: string; entrada: unknown }
  | { tipo: "tool_result"; id: string; nombre: string; salida: unknown; ok: boolean; ms: number }
  | { tipo: "confirmacion_requerida"; token: string; solicitudId: string; dictamen: Dictamen }
  | { tipo: "mensaje"; texto: string }
  | { tipo: "oc_creada"; orden: OrdenCompra }
  | { tipo: "error"; mensaje: string; correlationId: string }
  /** `historial` solo viene si la conversación cambió (chat); «Evaluar sin IA» no lo envía. */
  | { tipo: "fin"; historial?: TurnoHistorial[] };
