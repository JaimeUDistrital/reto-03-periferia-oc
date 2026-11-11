/** Variables de entorno validadas con Zod al arrancar (falla rápido, sin revelar valores). */
import { randomBytes } from "node:crypto";
import * as z from "zod";

const vacioComoAusente = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? undefined : v);

const EnvSchema = z.object({
  GEMINI_API_KEY: z.preprocess(vacioComoAusente, z.string().optional()),
  GEMINI_MODEL: z.preprocess(vacioComoAusente, z.string().default("gemini-3.6-flash")),
  PORT: z.preprocess(vacioComoAusente, z.coerce.number().int().min(1).max(65535).default(3000)),
  HITL_SECRET: z.preprocess(vacioComoAusente, z.string().min(32, "debe tener al menos 32 caracteres").optional()),
});

export interface Env {
  /** Sin clave: el chat responde un error claro y /api/evaluar sigue funcionando. */
  geminiApiKey: string | undefined;
  geminiModel: string;
  port: number;
  hitlSecret: string;
  /** true = generado al azar para este proceso (los tokens no sobreviven a un reinicio). */
  hitlSecretEfimero: boolean;
}

export function cargarEnv(
  fuente: Record<string, string | undefined>,
  avisar: (mensaje: string) => void = (m) => console.warn(m),
): Env {
  const parseado = EnvSchema.safeParse(fuente);
  if (!parseado.success) {
    const detalle = parseado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  const { GEMINI_API_KEY, GEMINI_MODEL, PORT, HITL_SECRET } = parseado.data;
  const efimero = HITL_SECRET === undefined;
  if (efimero) {
    avisar("HITL_SECRET no definido: se generó un secreto aleatorio para este proceso (los tokens de confirmación caducan al reiniciar).");
  }
  return {
    geminiApiKey: GEMINI_API_KEY,
    geminiModel: GEMINI_MODEL,
    port: PORT,
    hitlSecret: HITL_SECRET ?? randomBytes(32).toString("base64url"),
    hitlSecretEfimero: efimero,
  };
}
