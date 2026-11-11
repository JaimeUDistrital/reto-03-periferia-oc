/**
 * Evaluación de una solicitud: ejecuta todos los controles y decide.
 * `evaluarExpediente` es pura; `evaluarSolicitud` solo añade la carga del expediente.
 */
import { createHash } from "node:crypto";
import { cargarExpediente } from "../data/cargador";
import type { Dictamen } from "./contratos";
import { CONTROLES, decidir } from "./controles";
import type { Expediente } from "./modelo";

/** JSON con claves ordenadas y sin undefined: misma información → mismos bytes. */
export function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  if (valor !== null && typeof valor === "object") {
    const campos = Object.entries(valor)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${jsonCanonico(v)}`);
    return `{${campos.join(",")}}`;
  }
  return JSON.stringify(valor) ?? "null";
}

export function evaluarExpediente(expediente: Expediente): Dictamen {
  const controles = CONTROLES.map((c) => c.evaluar(expediente));
  const decision = decidir(controles);
  const solicitudId = expediente.solicitud.id;
  const hash = createHash("sha256").update(jsonCanonico({ solicitudId, decision, controles })).digest("hex");
  return { solicitudId, decision, controles, hash };
}

export async function evaluarSolicitud(solicitudId: string, raizFixtures?: string): Promise<Dictamen> {
  return evaluarExpediente(await cargarExpediente(solicitudId, raizFixtures));
}
