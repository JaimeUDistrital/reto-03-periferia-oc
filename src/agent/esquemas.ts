/** Esquemas Zod de los cuerpos HTTP: todo lo que llega del navegador es no confiable. */
import * as z from "zod";
import { LIMITES } from "../security/limites";
import { SESSION_ID_RE } from "./sesiones";

export const CasoSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const SessionIdSchema = z.string().regex(SESSION_ID_RE);

export const ChatBodySchema = z
  .object({
    sessionId: SessionIdSchema,
    message: z.string().trim().max(LIMITES.maxMensaje).default(""),
    /** Caso que la persona confirma con el botón de la UI. */
    confirmar: CasoSchema.optional(),
  })
  .refine((b) => b.message !== "" || b.confirmar !== undefined, { message: "message: se requiere un mensaje", path: ["message"] });

export const EvaluarBodySchema = z.object({ caso: CasoSchema, sessionId: SessionIdSchema.optional() });
