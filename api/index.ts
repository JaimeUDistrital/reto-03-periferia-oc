/**
 * Entrada de Vercel Functions (runtime Node.js). Reutiliza crearApp igual que src/server/main.ts (Railway).
 * Formato: export default { fetch } (Web Standard).
 * Fuente: https://vercel.com/docs/functions/functions-api-reference#fetch-web-standard
 * vercel.json enruta /api/* a esta función; la web estática sale de dist/web (CDN de Vercel).
 */
import { crearLlmGemini } from "../src/agent/gemini";
import { cargarEnv } from "../src/config/env";
import { crearApp } from "../src/server/app";
import { crearNucleoOC } from "../src/tools/oc";

const env = cargarEnv(process.env);

const app = crearApp({
  nucleo: crearNucleoOC(),
  llm: env.geminiApiKey ? crearLlmGemini({ apiKey: env.geminiApiKey, modelo: env.geminiModel }) : undefined,
  hitlSecret: env.hitlSecret,
});

export default { fetch: app.fetch };
