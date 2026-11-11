/**
 * Bucle LLM ↔ tools (docs/PLAN.md §2). El código decide; el modelo orquesta y explica:
 *  - las tools con requiereConfirmacion NUNCA se ejecutan aquí: se evalúa la solicitud y, solo si el
 *    dictamen es APROBABLE, se emite un token firmado para que lo confirme una persona (/api/confirmar);
 *  - toda salida de tool pasa por mask() antes de llegar al modelo o a la UI.
 */
import { randomUUID } from "node:crypto";
import * as z from "zod";
import type { LlamadaTool, LlmPort, NucleoOC, TurnoHistorial } from "../domain/contratos";
import { LIMITES, conTimeout } from "../security/limites";
import { mask } from "../security/mask";
import { redactarError } from "../security/redact";
import { dictamenSeguro, ejecutarToolConEventos, eventoConfirmacion, type Emitir, type FirmarToken } from "./ejecutar";
import { cargarPrompt } from "./prompt";

export interface EntradaAgente {
  historial: TurnoHistorial[];
  mensaje: string;
  llm: LlmPort;
  nucleo: NucleoOC;
  emitir: Emitir;
  firmarToken: FirmarToken;
  /** Por defecto agent/prompt.md. */
  sistema?: string;
  timeoutLlmMs?: number;
  maxIteraciones?: number;
  /** Destino de logs internos (ya redactados). Por defecto console.error. */
  registrar?: (mensaje: string) => void;
}

const ArgsSolicitudSchema = z.object({ solicitudId: z.string().min(1) });

export async function ejecutarAgente(entrada: EntradaAgente): Promise<void> {
  const { llm, nucleo, emitir, firmarToken } = entrada;
  const sistema = entrada.sistema ?? cargarPrompt();
  const timeoutLlmMs = entrada.timeoutLlmMs ?? LIMITES.timeoutLlmMs;
  const maxIteraciones = entrada.maxIteraciones ?? LIMITES.maxIteraciones;
  const registrar = entrada.registrar ?? ((m: string) => console.error(m));

  const historial: TurnoHistorial[] = [...entrada.historial, { tipo: "usuario", texto: entrada.mensaje }];
  const fin = async (): Promise<void> => emitir({ tipo: "fin", historial });

  for (let iteracion = 0; iteracion < maxIteraciones; iteracion++) {
    let respuesta;
    try {
      respuesta = await conTimeout(llm.generar({ sistema, historial, tools: nucleo.herramientas }), timeoutLlmMs);
    } catch (e) {
      const correlationId = randomUUID();
      registrar(`[${correlationId}] error del LLM: ${redactarError(e)}`);
      await emitir({ tipo: "error", mensaje: "No pude consultar al asistente. Inténtalo de nuevo.", correlationId });
      await fin();
      return;
    }

    historial.push({ tipo: "modelo", texto: respuesta.texto, llamadas: respuesta.llamadas, nativo: respuesta.nativo });
    if (respuesta.texto) await emitir({ tipo: "mensaje", texto: respuesta.texto });
    if (respuesta.llamadas.length === 0) {
      await fin();
      return;
    }

    for (const llamada of respuesta.llamadas) {
      const resultado = await resolverLlamada(llamada, nucleo, emitir, firmarToken);
      historial.push({ tipo: "resultado_tool", llamadaId: llamada.id, nombre: llamada.nombre, resultado });
    }
  }

  await emitir({ tipo: "mensaje", texto: "Alcancé el límite de pasos de esta consulta. Reformula o divide la petición." });
  await fin();
}

/** Devuelve lo que ve el modelo como resultado de la llamada (ya enmascarado). */
async function resolverLlamada(llamada: LlamadaTool, nucleo: NucleoOC, emitir: Emitir, firmarToken: FirmarToken): Promise<unknown> {
  const tool = nucleo.herramientas.find((t) => t.nombre === llamada.nombre);
  if (!tool) {
    const resultado = { error: `Herramienta desconocida: ${llamada.nombre}` };
    await emitir({ tipo: "tool_call", id: llamada.id, nombre: llamada.nombre, entrada: mask(llamada.args) });
    await emitir({ tipo: "tool_result", id: llamada.id, nombre: llamada.nombre, salida: resultado, ok: false, ms: 0 });
    return resultado;
  }
  if (!tool.requiereConfirmacion) {
    return (await ejecutarToolConEventos(tool, llamada.id, llamada.args, emitir)).resultado;
  }
  return pedirConfirmacion(llamada, nucleo, emitir, firmarToken);
}

async function pedirConfirmacion(llamada: LlamadaTool, nucleo: NucleoOC, emitir: Emitir, firmarToken: FirmarToken): Promise<unknown> {
  const { id, nombre } = llamada;
  const inicio = performance.now();
  const terminar = async (ok: boolean, salida: unknown): Promise<unknown> => {
    await emitir({ tipo: "tool_result", id, nombre, salida, ok, ms: Math.round(performance.now() - inicio) });
    return salida;
  };
  await emitir({ tipo: "tool_call", id, nombre, entrada: mask(llamada.args) });

  const args = ArgsSolicitudSchema.safeParse(llamada.args);
  if (!args.success) return terminar(false, { error: "Argumentos inválidos: se requiere solicitudId (texto)." });

  let dictamen;
  try {
    dictamen = await nucleo.evaluarSolicitud(args.data.solicitudId);
  } catch (e) {
    return terminar(false, { error: `No se pudo evaluar la solicitud: ${redactarError(e)}` });
  }

  const confirmacion = eventoConfirmacion(dictamen, firmarToken);
  if (!confirmacion) {
    const seguro = dictamenSeguro(dictamen);
    return terminar(false, {
      procede: false,
      decision: seguro.decision,
      motivo: "La orden de compra no procede con este dictamen. No intentes crearla.",
      controles: seguro.controles.filter((c) => c.estado !== "OK").map((c) => ({ id: c.id, estado: c.estado, detalle: c.detalle })),
    });
  }

  await emitir(confirmacion);
  return terminar(true, {
    estado: "PENDIENTE_CONFIRMACION_HUMANA",
    mensaje: "La orden NO se ha creado todavía: se pidió confirmación al usuario. No afirmes que existe hasta recibir el evento de OC creada.",
  });
}
