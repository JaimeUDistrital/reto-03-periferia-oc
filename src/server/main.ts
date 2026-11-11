import { serve } from "@hono/node-server";
import { crearLlmGemini } from "../agent/gemini";
import { cargarEnv } from "../config/env";
import { crearNucleoOC } from "../tools/oc";
import { crearApp } from "./app";

const env = cargarEnv(process.env);
const nucleo = crearNucleoOC();

const app = crearApp({
  nucleo,
  llm: env.geminiApiKey ? crearLlmGemini({ apiKey: env.geminiApiKey, modelo: env.geminiModel }) : undefined,
  hitlSecret: env.hitlSecret,
});

if (!env.geminiApiKey) {
  console.warn("GEMINI_API_KEY no definida: el chat con IA responderá un error; «Evaluar sin IA» sigue funcionando.");
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Servidor escuchando en el puerto ${info.port}`);
});
