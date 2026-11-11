import { readFileSync } from "node:fs";

let cache: string | undefined;

/** System prompt del agente (agent/prompt.md), leído una sola vez. */
export function cargarPrompt(): string {
  cache ??= readFileSync(new URL("../../agent/prompt.md", import.meta.url), "utf8");
  return cache;
}
