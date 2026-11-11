/** Esquemas Zod de los cuerpos HTTP: todo lo que llega del navegador es no confiable. */
import * as z from "zod";
import { LIMITES } from "../security/limites";

const TurnoUsuarioSchema = z.object({ tipo: z.literal("usuario"), texto: z.string().max(LIMITES.maxMensaje) });

const TurnoModeloSchema = z.object({
  tipo: z.literal("modelo"),
  texto: z.string().max(20_000).optional(),
  llamadas: z.array(z.object({ id: z.string().max(200), nombre: z.string().max(100), args: z.unknown() })).max(20),
  // Se valida a fondo en el adaptador Gemini (solo rol model, texto/functionCall).
  nativo: z.unknown().optional(),
});

const TurnoResultadoSchema = z.object({
  tipo: z.literal("resultado_tool"),
  llamadaId: z.string().max(200),
  nombre: z.string().max(100),
  resultado: z.unknown(),
});

export const TurnoHistorialSchema = z.discriminatedUnion("tipo", [TurnoUsuarioSchema, TurnoModeloSchema, TurnoResultadoSchema]);

export const ChatBodySchema = z.object({
  historial: z.array(TurnoHistorialSchema).max(LIMITES.maxTurnosHistorial).default([]),
  mensaje: z.string().trim().min(1).max(LIMITES.maxMensaje),
});

export const SolicitudIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const EvaluarBodySchema = z.object({ solicitudId: SolicitudIdSchema });

export const ConfirmarBodySchema = z.object({
  token: z.string().min(1).max(2048),
  accion: z.enum(["aprobar", "rechazar"]),
});
