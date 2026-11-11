/**
 * Ciclo del agente (PRD §6.3): prompt → modelo → herramientas → respuesta.
 *  CA1 tope de iteraciones por turno · CA3 confirmación humana decidida por el servidor
 *  CA4 cada llamada a herramienta queda en el historial y en out/log.jsonl · CA5 los errores no matan la sesión.
 * El modelo orquesta y explica; los valores salen de las herramientas.
 */
import { randomUUID } from "node:crypto";
import * as z from "zod";
import type { CtxHerramienta, EventoChat } from "../domain/contratos-oc";
import { HallazgoSchema } from "../domain/contratos-oc";
import type { LlmAdapter, LlamadaHerramienta, RespuestaLlm } from "../llm/adapter";
import { TiempoAgotadoError, conTimeout } from "../security/limites";
import { redact, redactarError } from "../security/redact";
import type { Bitacora } from "./bitacora";
import { casoConfirmado, crearGuardia } from "./confirmacion";
import type { RegistroHerramientas, ResultadoHerramienta } from "./herramientas";
import type { Sesion } from "./sesiones";

export type Emitir = (evento: EventoChat) => void | Promise<void>;

export interface ConfigTurno {
  maxIteraciones: number;
  maxTokensSesion: number;
  timeoutLlmMs: number;
}

export interface EntradaTurno {
  llm: LlmAdapter;
  registro: RegistroHerramientas;
  sistema: string;
  sesion: Sesion;
  mensaje: string;
  /** Caso que la UI confirma con su botón. */
  confirmar?: string;
  emitir: Emitir;
  bitacora: Bitacora;
  /** Raíz del proyecto (ctx.directory). */
  directory: string;
  config: ConfigTurno;
  /** Destino de logs internos; todo pasa por redact(). Por defecto console.error. */
  registrar?: (mensaje: string) => void;
  ahora?: () => Date;
}

/** Lo mínimo que necesita una llamada a herramienta (también la usa «Revisar sin IA»). */
export type ContextoLlamada = Pick<EntradaTurno, "registro" | "emitir" | "bitacora" | "sesion" | "registrar" | "ahora">;

const CODIGOS_CONFIRMACION = new Set(["REQUIERE_CONFIRMACION", "CONFIRMACION_NO_HUMANA"]);

const ValidacionLaxaSchema = z.object({
  caso: z.string().optional(),
  apta: z.boolean(),
  confirmaciones: z.array(HallazgoSchema).default([]),
});
const OcCreadaLaxaSchema = z.object({
  numero_oc: z.string(),
  fecha: z.string(),
  idempotente: z.boolean().default(false),
  retroactiva: z.boolean().default(false),
  evidencia: z.string().nullable().default(null),
});
const ConfirmacionesSchema = z.object({ caso: z.string().optional(), confirmaciones: z.array(HallazgoSchema).default([]) });

export interface EstadoTurno {
  /** Herramientas ejecutadas en este turno (para el resumen al agotar iteraciones). */
  ejecutadas: Array<{ nombre: string; ok: boolean }>;
  pendienteNuevo: boolean;
  confirmacionEmitida: boolean;
}

export function dataDe(salida: unknown): unknown {
  return salida !== null && typeof salida === "object" ? (salida as Record<string, unknown>)["data"] : undefined;
}

function casoDe(args: unknown, salida: unknown): string | undefined {
  const deSalida = (salida as Record<string, unknown> | null)?.["caso"] ?? (dataDe(salida) as Record<string, unknown> | undefined)?.["caso"];
  if (typeof deSalida === "string") return deSalida;
  const deArgs = (args as Record<string, unknown> | null)?.["caso"];
  return typeof deArgs === "string" ? deArgs : undefined;
}

async function reaccionarACrear(
  llamada: LlamadaHerramienta,
  r: ResultadoHerramienta,
  { sesion, emitir }: ContextoLlamada,
  estado: EstadoTurno,
): Promise<void> {
  const caso = casoDe(llamada.args, r.salida);
  if (caso === undefined) return;
  if (r.ok) {
    const creada = OcCreadaLaxaSchema.safeParse(dataDe(r.salida));
    if (!creada.success) return;
    sesion.pendiente = null;
    await emitir({ tipo: "oc_creada", caso, ...creada.data });
    return;
  }
  if (r.codigo !== undefined && CODIGOS_CONFIRMACION.has(r.codigo)) {
    const { confirmaciones } = ConfirmacionesSchema.parse(r.salida);
    sesion.pendiente = { caso, confirmaciones };
    estado.confirmacionEmitida = true;
    await emitir({ tipo: "confirmacion_requerida", caso, confirmaciones });
  }
}

/** oc_validar con confirmaciones deja el caso pendiente: la siguiente confirmación humana lo desbloquea. */
function reaccionarAValidar(llamada: LlamadaHerramienta, r: ResultadoHerramienta, { sesion }: ContextoLlamada, estado: EstadoTurno): void {
  if (!r.ok) return;
  const validacion = ValidacionLaxaSchema.safeParse(dataDe(r.salida));
  const caso = casoDe(llamada.args, r.salida);
  if (!validacion.success || caso === undefined) return;
  if (validacion.data.apta && validacion.data.confirmaciones.length > 0) {
    sesion.pendiente = { caso, confirmaciones: validacion.data.confirmaciones };
    estado.pendienteNuevo = true;
  }
}

async function registrarEnBitacora(e: ContextoLlamada, llamada: LlamadaHerramienta, r: ResultadoHerramienta): Promise<void> {
  try {
    await e.bitacora.registrar({
      ts: (e.ahora ?? (() => new Date()))().toISOString(),
      sessionId: e.sesion.id,
      herramienta: llamada.nombre,
      args: llamada.args,
      ok: r.ok,
      ms: r.ms,
      codigo: r.codigo,
    });
  } catch (error) {
    (e.registrar ?? console.error)(redact(`No se pudo escribir out/log.jsonl: ${redactarError(error)}`));
  }
}

export async function procesarLlamada(
  e: ContextoLlamada,
  ctx: CtxHerramienta,
  llamada: LlamadaHerramienta,
  estado: EstadoTurno,
): Promise<ResultadoHerramienta> {
  await e.emitir({ tipo: "tool_call", id: llamada.id, nombre: llamada.nombre, entrada: llamada.args });
  const r = await e.registro.ejecutar(llamada.nombre, llamada.args, ctx);
  await registrarEnBitacora(e, llamada, r);
  await e.emitir({ tipo: "tool_result", id: llamada.id, nombre: llamada.nombre, ok: r.ok, ms: r.ms, salida: r.salida });
  estado.ejecutadas.push({ nombre: llamada.nombre, ok: r.ok });
  e.sesion.mensajes.push({ rol: "herramienta", llamadaId: llamada.id, nombre: llamada.nombre, resultado: r.salida });
  if (llamada.nombre === "oc_crear") await reaccionarACrear(llamada, r, e, estado);
  if (llamada.nombre === "oc_validar") reaccionarAValidar(llamada, r, e, estado);
  return r;
}

async function emitirError(e: EntradaTurno, mensaje: string): Promise<void> {
  await e.emitir({ tipo: "error", mensaje, correlationId: randomUUID() });
}

/** Llama al modelo con timeout; ante un fallo emite un `error` legible (sin secretos) y devuelve null. */
async function consultarModelo(e: EntradaTurno): Promise<RespuestaLlm | null> {
  const { llm, registro, sistema, sesion, config } = e;
  try {
    return await conTimeout(llm.enviar(sesion.mensajes, registro.descriptores, { sistema, timeoutMs: config.timeoutLlmMs }), config.timeoutLlmMs);
  } catch (error) {
    const correlationId = randomUUID();
    (e.registrar ?? console.error)(redact(`[${correlationId}] error del modelo: ${redactarError(error)}`));
    const segundos = Math.round(config.timeoutLlmMs / 1000);
    const mensaje =
      error instanceof TiempoAgotadoError
        ? `El modelo tardó más de ${segundos} s en responder. Inténtalo de nuevo.`
        : "No pude consultar al modelo. Inténtalo de nuevo en unos segundos.";
    await e.emitir({ tipo: "error", mensaje, correlationId });
    return null;
  }
}

function resumenDeIteraciones(maxIteraciones: number, ejecutadas: EstadoTurno["ejecutadas"]): string {
  const hecho = ejecutadas.length > 0 ? ejecutadas.map((x) => `${x.nombre} (${x.ok ? "ok" : "con error"})`).join(", ") : "ninguna herramienta";
  return (
    `Alcancé el límite de ${maxIteraciones} pasos en este turno y me detuve. ` +
    `Lo que hice: ${hecho}. Falta terminar el proceso; escribe «continúa» para seguir o indícame cómo avanzar.`
  );
}

/** Al terminar el turno, si el caso quedó pendiente y aún no se avisó, la UI debe poder resaltarlo. */
export async function avisarPendiente(e: ContextoLlamada, estado: EstadoTurno): Promise<void> {
  const { pendiente } = e.sesion;
  if (!pendiente || !estado.pendienteNuevo || estado.confirmacionEmitida) return;
  await e.emitir({ tipo: "confirmacion_requerida", caso: pendiente.caso, confirmaciones: pendiente.confirmaciones });
}

async function iterar(e: EntradaTurno, ctx: CtxHerramienta, estado: EstadoTurno): Promise<void> {
  const { sesion, config, emitir } = e;
  for (let iteracion = 0; iteracion < config.maxIteraciones; iteracion++) {
    if (sesion.tokens >= config.maxTokensSesion) {
      await emitirError(e, `Esta sesión alcanzó el límite de ${config.maxTokensSesion} tokens. Abre una sesión nueva para continuar.`);
      return;
    }
    const respuesta = await consultarModelo(e);
    if (!respuesta) return;

    sesion.tokens += respuesta.tokens;
    sesion.mensajes.push({ rol: "modelo", texto: respuesta.texto, llamadas: respuesta.llamadas, nativo: respuesta.nativo });
    if (respuesta.texto) await emitir({ tipo: "mensaje", texto: respuesta.texto });
    if (respuesta.llamadas.length === 0) return;

    for (const llamada of respuesta.llamadas) await procesarLlamada(e, ctx, llamada, estado);
  }
  const resumen = resumenDeIteraciones(config.maxIteraciones, estado.ejecutadas);
  sesion.mensajes.push({ rol: "modelo", texto: resumen, llamadas: [] });
  await emitir({ tipo: "mensaje", texto: resumen });
}

/** Ejecuta un turno completo. Nunca lanza: todo fallo llega al cliente como evento `error` y la sesión sigue viva. */
export async function ejecutarTurno(e: EntradaTurno): Promise<void> {
  const { sesion } = e;
  const confirmado = casoConfirmado({ pendiente: sesion.pendiente, mensaje: e.mensaje, confirmar: e.confirmar });
  if (confirmado === null) sesion.pendiente = null;
  const ctx: CtxHerramienta = {
    directory: e.directory,
    sessionId: sesion.id,
    confirmacionHumana: crearGuardia(confirmado),
    ahora: e.ahora,
  };
  const estado: EstadoTurno = { ejecutadas: [], pendienteNuevo: false, confirmacionEmitida: false };

  sesion.mensajes.push({ rol: "usuario", texto: e.mensaje });
  try {
    await iterar(e, ctx, estado);
    await avisarPendiente(e, estado);
  } catch (error) {
    const correlationId = randomUUID();
    (e.registrar ?? console.error)(redact(`[${correlationId}] fallo inesperado en el turno: ${redactarError(error)}`));
    await e.emitir({ tipo: "error", mensaje: "Ocurrió un error inesperado. La sesión sigue activa; inténtalo de nuevo.", correlationId });
  }
  await e.emitir({ tipo: "fin" });
}
