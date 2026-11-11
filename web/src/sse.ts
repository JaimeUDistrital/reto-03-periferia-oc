// Parser SSE puro (sin DOM): trocea un buffer en eventos completos.
import type { EventoChat } from "../../src/domain/contratos-oc";

export function esEventoChat(valor: unknown): valor is EventoChat {
  return typeof valor === "object" && valor !== null && typeof (valor as Record<string, unknown>)["tipo"] === "string";
}

export function extraerEventos(buffer: string): { eventos: EventoChat[]; resto: string } {
  const bloques = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const resto = bloques.pop() ?? "";
  const eventos: EventoChat[] = [];
  for (const bloque of bloques) {
    const datos = bloque
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!datos) continue;
    try {
      const json: unknown = JSON.parse(datos);
      if (esEventoChat(json)) eventos.push(json);
    } catch {
      // línea que no es JSON: se ignora
    }
  }
  return { eventos, resto };
}
