/**
 * Adaptador LlmPort → @google/genai 3.1.0.
 * Gemini 3 puede exigir que se reenvíen las firmas de pensamiento: el Content original del modelo
 * viaja en `nativo` y se devuelve tal cual. Como el historial pasa por el navegador, `nativo` se
 * valida (solo rol model, solo texto/functionCall) y, si no cuadra con las llamadas, se descarta.
 */
import { randomUUID } from "node:crypto";
import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentResponse, type Part } from "@google/genai";
import * as z from "zod";
import type { LlmPort, LlamadaTool, RespuestaLlm, ToolDef, TurnoHistorial } from "../domain/contratos";
import { LIMITES } from "../security/limites";
import { redactarError } from "../security/redact";

const PREFIJO_ID_LOCAL = "gen-";

const ParteNativaSchema = z
  .object({
    text: z.string().optional(),
    thought: z.boolean().optional(),
    thoughtSignature: z.string().optional(),
    functionCall: z
      .object({ id: z.string().optional(), name: z.string(), args: z.record(z.string(), z.unknown()).optional() })
      .optional(),
  })
  .refine((p) => p.text !== undefined || p.functionCall !== undefined);
const ContentNativoSchema = z.object({ role: z.literal("model"), parts: z.array(ParteNativaSchema) });

function nativoCoherente(nativo: unknown, llamadas: LlamadaTool[]): Content | undefined {
  const r = ContentNativoSchema.safeParse(nativo);
  if (!r.success) return undefined;
  const nombres = r.data.parts.flatMap((p) => (p.functionCall ? [p.functionCall.name] : []));
  if (nombres.length !== llamadas.length || nombres.some((n, i) => n !== llamadas[i]?.nombre)) return undefined;
  return r.data;
}

function idRemoto(id: string): { id?: string } {
  return id.startsWith(PREFIJO_ID_LOCAL) ? {} : { id };
}

function comoObjeto(resultado: unknown): Record<string, unknown> {
  if (resultado !== null && typeof resultado === "object" && !Array.isArray(resultado)) {
    return resultado as Record<string, unknown>;
  }
  return { resultado };
}

/** Historial neutral → Content[] de Gemini (función pura). */
export function aContents(historial: TurnoHistorial[]): Content[] {
  const contents: Content[] = [];
  let respuestas: Part[] = [];
  const vaciarRespuestas = (): void => {
    if (respuestas.length > 0) contents.push({ role: "user", parts: respuestas });
    respuestas = [];
  };

  for (const turno of historial) {
    if (turno.tipo === "resultado_tool") {
      respuestas.push({ functionResponse: { ...idRemoto(turno.llamadaId), name: turno.nombre, response: comoObjeto(turno.resultado) } });
      continue;
    }
    vaciarRespuestas();
    if (turno.tipo === "usuario") {
      contents.push({ role: "user", parts: [{ text: turno.texto }] });
      continue;
    }
    const nativo = nativoCoherente(turno.nativo, turno.llamadas);
    if (nativo) {
      contents.push(nativo);
      continue;
    }
    const parts: Part[] = [];
    if (turno.texto) parts.push({ text: turno.texto });
    for (const l of turno.llamadas) {
      parts.push({ functionCall: { ...idRemoto(l.id), name: l.nombre, args: comoObjeto(l.args) } });
    }
    if (parts.length > 0) contents.push({ role: "model", parts });
  }
  vaciarRespuestas();
  return contents;
}

export function aDeclaraciones(tools: ToolDef[]): FunctionDeclaration[] {
  return tools.map((tool) => {
    const { $schema: _omitido, ...parametros } = z.toJSONSchema(tool.entrada, { io: "input" });
    return { name: tool.nombre, description: tool.descripcion, parametersJsonSchema: parametros };
  });
}

/** Respuesta de Gemini → RespuestaLlm (función pura). */
export function desdeRespuesta(respuesta: Partial<Pick<GenerateContentResponse, "candidates" | "functionCalls">>): RespuestaLlm {
  const content = respuesta.candidates?.[0]?.content;
  const texto = content?.parts?.filter((p) => typeof p.text === "string" && p.thought !== true).map((p) => p.text).join("");
  const llamadas: LlamadaTool[] = (respuesta.functionCalls ?? []).map((fc) => ({
    id: fc.id ?? `${PREFIJO_ID_LOCAL}${randomUUID()}`,
    nombre: fc.name ?? "",
    args: fc.args ?? {},
  }));
  return { texto: texto || undefined, llamadas, nativo: content };
}

export interface OpcionesGemini {
  apiKey: string;
  modelo: string;
  timeoutMs?: number;
  maxTokensSalida?: number;
}

export function crearLlmGemini(opciones: OpcionesGemini): LlmPort {
  const ai = new GoogleGenAI({ apiKey: opciones.apiKey });
  const timeoutMs = opciones.timeoutMs ?? LIMITES.timeoutLlmMs;
  return {
    async generar({ sistema, historial, tools }) {
      try {
        const respuesta = await ai.models.generateContent({
          model: opciones.modelo,
          contents: aContents(historial),
          config: {
            systemInstruction: sistema,
            tools: tools.length > 0 ? [{ functionDeclarations: aDeclaraciones(tools) }] : undefined,
            temperature: 0,
            maxOutputTokens: opciones.maxTokensSalida ?? LIMITES.maxTokensSalida,
            abortSignal: AbortSignal.timeout(timeoutMs),
          },
        });
        return desdeRespuesta(respuesta);
      } catch (e) {
        // El mensaje del SDK puede incluir la URL con la clave: siempre redactado.
        throw new Error(`Fallo al llamar a Gemini: ${redactarError(e)}`);
      }
    },
  };
}
