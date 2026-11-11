/** Piezas compartidas por el bucle del agente y por «Evaluar sin IA» (/api/evaluar). */
import { DictamenSchema, type Dictamen, type EventoAgente, type ToolDef } from "../domain/contratos";
import { mask } from "../security/mask";
import { redactarError } from "../security/redact";

export type Emitir = (evento: EventoAgente) => void | Promise<void>;
export type FirmarToken = (datos: { solicitudId: string; hash: string }) => string;

/** Dictamen apto para el LLM y la UI: detalles y evidencias enmascarados; id y hash intactos. */
export function dictamenSeguro(dictamen: Dictamen): Dictamen {
  const enmascarado = DictamenSchema.parse(mask(dictamen));
  return { ...enmascarado, solicitudId: dictamen.solicitudId, hash: dictamen.hash };
}

/** Evento de confirmación humana; solo existe para dictámenes APROBABLE. */
export function eventoConfirmacion(dictamen: Dictamen, firmarToken: FirmarToken): EventoAgente | undefined {
  if (dictamen.decision !== "APROBABLE") return undefined;
  return {
    tipo: "confirmacion_requerida",
    token: firmarToken({ solicitudId: dictamen.solicitudId, hash: dictamen.hash }),
    solicitudId: dictamen.solicitudId,
    dictamen: dictamenSeguro(dictamen),
  };
}

export interface ResultadoTool {
  ok: boolean;
  /** Ya enmascarado: es lo que ven la UI y el modelo. */
  resultado: unknown;
}

/** Valida args, ejecuta una tool que NO requiere confirmación y emite tool_call / tool_result. */
export async function ejecutarToolConEventos(tool: ToolDef, id: string, args: unknown, emitir: Emitir): Promise<ResultadoTool> {
  await emitir({ tipo: "tool_call", id, nombre: tool.nombre, entrada: mask(args) });
  const inicio = performance.now();
  const ms = (): number => Math.round(performance.now() - inicio);

  const entrada = tool.entrada.safeParse(args);
  if (!entrada.success) {
    const resultado = { error: `Argumentos inválidos: ${entrada.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ")}` };
    await emitir({ tipo: "tool_result", id, nombre: tool.nombre, salida: resultado, ok: false, ms: ms() });
    return { ok: false, resultado };
  }

  try {
    const resultado = mask(await tool.ejecutar(entrada.data));
    await emitir({ tipo: "tool_result", id, nombre: tool.nombre, salida: resultado, ok: true, ms: ms() });
    return { ok: true, resultado };
  } catch (e) {
    const resultado = { error: `La herramienta falló: ${redactarError(e)}` };
    await emitir({ tipo: "tool_result", id, nombre: tool.nombre, salida: resultado, ok: false, ms: ms() });
    return { ok: false, resultado };
  }
}
