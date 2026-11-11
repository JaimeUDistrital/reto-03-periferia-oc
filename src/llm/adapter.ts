/**
 * Interfaz propia del proveedor LLM (PRD §6.1). El ciclo del agente solo conoce esto:
 * cambiar de proveedor es añadir otro archivo en src/llm/ que cumpla `LlmAdapter`.
 */

export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  args: unknown;
}

export type Mensaje =
  | { rol: "usuario"; texto: string }
  | {
      rol: "modelo";
      texto?: string;
      llamadas: LlamadaHerramienta[];
      /** Contenido nativo del proveedor (p. ej. firmas de pensamiento de Gemini). Opaco para el ciclo. */
      nativo?: unknown;
    }
  | { rol: "herramienta"; llamadaId: string; nombre: string; resultado: unknown };

/** Descriptor que ve el modelo: nombre `oc_<export>` y esquema JSON de los argumentos. */
export interface DescriptorHerramienta {
  nombre: string;
  descripcion: string;
  parametros: Record<string, unknown>;
}

export interface OpcionesEnvio {
  /** System prompt completo (comportamiento + conocimiento). */
  sistema: string;
  timeoutMs: number;
  maxTokensSalida?: number;
}

export interface RespuestaLlm {
  texto?: string;
  llamadas: LlamadaHerramienta[];
  nativo?: unknown;
  /** Tokens consumidos por esta llamada (entrada + salida), 0 si el proveedor no los informa. */
  tokens: number;
}

export interface LlmAdapter {
  readonly proveedor: string;
  readonly modelo: string;
  enviar(mensajes: Mensaje[], herramientas: DescriptorHerramienta[], opciones: OpcionesEnvio): Promise<RespuestaLlm>;
}
