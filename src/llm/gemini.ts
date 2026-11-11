/**
 * Implementación de LlmAdapter para @google/genai 3.1.0.
 * Gemini 3 puede exigir que se reenvíen las firmas de pensamiento: el Content original del modelo
 * viaja en `nativo` y se devuelve tal cual. Por defensa, `nativo` se valida (solo rol model, solo
 * texto/functionCall) y, si no cuadra con las llamadas, se descarta.
 */
import { randomUUID } from "node:crypto";
import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentResponse, type Part } from "@google/genai";
import * as z from "zod";
import { redactarError } from "../security/redact";
import type { DescriptorHerramienta, LlamadaHerramienta, LlmAdapter, Mensaje, RespuestaLlm } from "./adapter";

const PREFIJO_ID_LOCAL = "gen-";
const MAX_TOKENS_SALIDA = 8192;

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

function nativoCoherente(nativo: unknown, llamadas: LlamadaHerramienta[]): Content | undefined {
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

function contentDeModelo(m: Extract<Mensaje, { rol: "modelo" }>): Content | undefined {
  const nativo = nativoCoherente(m.nativo, m.llamadas);
  if (nativo) return nativo;
  const parts: Part[] = [];
  if (m.texto) parts.push({ text: m.texto });
  for (const l of m.llamadas) {
    parts.push({ functionCall: { ...idRemoto(l.id), name: l.nombre, args: comoObjeto(l.args) } });
  }
  return parts.length > 0 ? { role: "model", parts } : undefined;
}

/** Mensajes neutrales → Content[] de Gemini (función pura). */
export function aContents(mensajes: Mensaje[]): Content[] {
  const contents: Content[] = [];
  let respuestas: Part[] = [];
  const vaciarRespuestas = (): void => {
    if (respuestas.length > 0) contents.push({ role: "user", parts: respuestas });
    respuestas = [];
  };

  for (const m of mensajes) {
    if (m.rol === "herramienta") {
      respuestas.push({ functionResponse: { ...idRemoto(m.llamadaId), name: m.nombre, response: comoObjeto(m.resultado) } });
      continue;
    }
    vaciarRespuestas();
    if (m.rol === "usuario") {
      contents.push({ role: "user", parts: [{ text: m.texto }] });
      continue;
    }
    const content = contentDeModelo(m);
    if (content) contents.push(content);
  }
  vaciarRespuestas();
  return contents;
}

export function aDeclaraciones(herramientas: DescriptorHerramienta[]): FunctionDeclaration[] {
  return herramientas.map((h) => ({ name: h.nombre, description: h.descripcion, parametersJsonSchema: h.parametros }));
}

/** Respuesta de Gemini → RespuestaLlm (función pura). */
export function desdeRespuesta(
  respuesta: Partial<Pick<GenerateContentResponse, "candidates" | "functionCalls" | "usageMetadata">>,
): RespuestaLlm {
  const content = respuesta.candidates?.[0]?.content;
  const texto = content?.parts?.filter((p) => typeof p.text === "string" && p.thought !== true).map((p) => p.text).join("");
  const llamadas: LlamadaHerramienta[] = (respuesta.functionCalls ?? []).map((fc) => ({
    id: fc.id ?? `${PREFIJO_ID_LOCAL}${randomUUID()}`,
    nombre: fc.name ?? "",
    args: fc.args ?? {},
  }));
  return { texto: texto || undefined, llamadas, nativo: content, tokens: respuesta.usageMetadata?.totalTokenCount ?? 0 };
}

export interface OpcionesGemini {
  apiKey: string;
  modelo: string;
}

export function crearLlmGemini(opciones: OpcionesGemini): LlmAdapter {
  const ai = new GoogleGenAI({ apiKey: opciones.apiKey });
  return {
    proveedor: "gemini",
    modelo: opciones.modelo,
    async enviar(mensajes, herramientas, { sistema, timeoutMs, maxTokensSalida }) {
      try {
        const respuesta = await ai.models.generateContent({
          model: opciones.modelo,
          contents: aContents(mensajes),
          config: {
            systemInstruction: sistema,
            tools: herramientas.length > 0 ? [{ functionDeclarations: aDeclaraciones(herramientas) }] : undefined,
            temperature: 0,
            maxOutputTokens: maxTokensSalida ?? MAX_TOKENS_SALIDA,
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
