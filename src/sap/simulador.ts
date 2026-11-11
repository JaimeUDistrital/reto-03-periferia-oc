/**
 * SAP simulado: idempotente y sin estado. El número de OC se deriva del solicitudId
 * ("45" + 8 dígitos del sha256), así repetir la llamada nunca duplica la orden.
 */
import { createHash } from "node:crypto";
import type { Dictamen, OrdenCompra, SapGateway } from "../domain/contratos";

export function numeroOrdenCompra(solicitudId: string): string {
  const digest = createHash("sha256").update(solicitudId).digest("hex").slice(0, 12);
  const ocho = (BigInt(`0x${digest}`) % 100_000_000n).toString().padStart(8, "0");
  return `45${ocho}`;
}

export function crearSapSimulado(opciones: { reloj?: () => Date } = {}): SapGateway {
  const reloj = opciones.reloj ?? (() => new Date());
  return {
    async crearOrdenCompra(solicitudId: string, _dictamen: Dictamen): Promise<OrdenCompra> {
      return { numero: numeroOrdenCompra(solicitudId), solicitudId, creadaEn: reloj().toISOString() };
    },
  };
}
