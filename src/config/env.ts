/** Variables de entorno validadas con Zod al arrancar (falla rápido, sin revelar valores). */
import * as z from "zod";

const vacioComoAusente = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? undefined : v);
const entero = (def: number, min: number): z.ZodType<number> => z.preprocess(vacioComoAusente, z.coerce.number().int().min(min).default(def));

const EnvSchema = z.object({
  GEMINI_API_KEY: z.preprocess(vacioComoAusente, z.string().optional()),
  GEMINI_MODEL: z.preprocess(vacioComoAusente, z.string().default("gemini-3.6-flash")),
  PORT: z.preprocess(vacioComoAusente, z.coerce.number().int().min(1).max(65535).default(3000)),
  /** Tope de iteraciones herramienta → modelo por turno (CA1). */
  MAX_ITERACIONES: entero(25, 1),
  /** Tope de tokens por sesión (costo, PRD §8). */
  MAX_TOKENS_SESION: entero(200_000, 1),
});

export interface Env {
  /** Sin clave: el chat responde un error claro y /api/evaluar sigue funcionando. */
  geminiApiKey: string | undefined;
  geminiModel: string;
  port: number;
  maxIteraciones: number;
  maxTokensSesion: number;
}

export function cargarEnv(fuente: Record<string, string | undefined>): Env {
  const parseado = EnvSchema.safeParse(fuente);
  if (!parseado.success) {
    const detalle = parseado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  const d = parseado.data;
  return {
    geminiApiKey: d.GEMINI_API_KEY,
    geminiModel: d.GEMINI_MODEL,
    port: d.PORT,
    maxIteraciones: d.MAX_ITERACIONES,
    maxTokensSesion: d.MAX_TOKENS_SESION,
  };
}
