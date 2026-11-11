/** Dobles de prueba: módulo de herramientas con la forma `HerramientaOC` y LLM guionizado. */
import * as z from "zod";
import type { CtxHerramienta, Hallazgo, HerramientaOC } from "../../src/domain/contratos-oc";
import type { LlmAdapter, Mensaje, RespuestaLlm } from "../../src/llm/adapter";

export const HALLAZGO_RC5: Hallazgo = {
  regla: "RC5",
  detalle: "Cotización 26.500.000 COP vs solicitud 25.000.000 COP (6,0 %)",
  accion_sugerida: "Confirmar la diferencia",
  valores: { solicitud: 25000000, cotizacion: 26500000 },
};

export interface EstadoFalso {
  apta: boolean;
  confirmaciones: Hallazgo[];
  /** Casos para los que `crear` llegó a crear la OC. */
  creadas: string[];
  /** Contextos recibidos por `crear` (para comprobar la guardia). */
  ctxCrear: CtxHerramienta[];
  ejecuciones: Record<string, number>;
}

export function crearEstado(parcial: Partial<EstadoFalso> = {}): EstadoFalso {
  return { apta: true, confirmaciones: [], creadas: [], ctxCrear: [], ejecuciones: {}, ...parcial };
}

const ok = (data: unknown): string => JSON.stringify({ ok: true, data });
const error = (mensaje: string, extra: Record<string, unknown> = {}): string => JSON.stringify({ ok: false, error: mensaje, ...extra });

/** Módulo falso con la misma forma que exportará src/tools/oc.ts de CORE. */
export function moduloFalso(estado: EstadoFalso): Record<string, unknown> {
  const contar = (n: string): void => void (estado.ejecuciones[n] = (estado.ejecuciones[n] ?? 0) + 1);

  const leer_paquete: HerramientaOC = {
    description: "Lee el paquete del caso",
    args: { caso: z.string().describe("Carpeta del caso") },
    async execute({ caso }) {
      contar("leer_paquete");
      return ok({ correo: { id: "c1" }, solicitud: { solicitud_id: String(caso) } });
    },
  };
  const validar: HerramientaOC = {
    description: "Valida el paquete",
    args: { caso: z.string(), paquete: z.unknown() },
    async execute({ caso }) {
      contar("validar");
      return ok({
        caso,
        solicitud_id: caso,
        apta: estado.apta,
        bloqueos: [],
        confirmaciones: estado.confirmaciones,
        derivados: {},
        retroactiva: false,
      });
    },
  };
  const construir_payload: HerramientaOC = {
    description: "Construye la OC",
    args: { caso: z.string(), paquete: z.unknown(), derivados: z.record(z.string(), z.string()).optional() },
    async execute({ caso }) {
      contar("construir_payload");
      return ok({ payload: { referencia: { solicitud_id: caso } }, trazabilidad: `out/${String(caso)}/trazabilidad.json` });
    },
  };
  const crear: HerramientaOC = {
    description: "Crea la OC en SAP",
    args: { caso: z.string(), payload: z.unknown(), confirmado: z.boolean().optional() },
    async execute(args, ctx) {
      contar("crear");
      estado.ctxCrear.push(ctx);
      const caso = String(args["caso"]);
      if (estado.confirmaciones.length > 0) {
        const base = { caso, confirmaciones: estado.confirmaciones };
        if (args["confirmado"] !== true) return error("Hay confirmaciones pendientes", { codigo: "REQUIERE_CONFIRMACION", ...base });
        if (!ctx.confirmacionHumana?.(caso)) return error("El usuario no confirmó", { codigo: "CONFIRMACION_NO_HUMANA", ...base });
      }
      estado.creadas.push(caso);
      return ok({ numero_oc: "4500000001", fecha: "2026-11-10", idempotente: false, retroactiva: false, evidencia: `out/${caso}/aprobacion.txt` });
    },
  };
  return { leer_paquete, validar, construir_payload, crear, ayuda: () => "no es una herramienta", constante: 42 };
}

export interface LlmGuionizado extends LlmAdapter {
  /** Mensajes recibidos en cada llamada (copia). */
  recibidos: Mensaje[][];
}

/** Devuelve las respuestas en orden; si se agotan, repite la última. */
export function llmGuionizado(respuestas: Array<RespuestaLlm | Error>): LlmGuionizado {
  const recibidos: Mensaje[][] = [];
  return {
    proveedor: "falso",
    modelo: "falso-1",
    recibidos,
    async enviar(mensajes) {
      recibidos.push(structuredClone(mensajes));
      const r = respuestas[Math.min(recibidos.length - 1, respuestas.length - 1)];
      if (r === undefined) throw new Error("Guion vacío");
      if (r instanceof Error) throw r;
      return structuredClone(r);
    },
  };
}

export function llamar(id: string, nombre: string, args: unknown, tokens = 10): RespuestaLlm {
  return { llamadas: [{ id, nombre, args }], tokens };
}

export function texto(t: string, tokens = 10): RespuestaLlm {
  return { texto: t, llamadas: [], tokens };
}
