/**
 * SAP simulado sobre out/sap/ordenes.jsonl. Número secuencial desde 4500000001 (máximo existente + 1),
 * idempotente por solicitud_id y con escrituras serializadas por un candado en proceso.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod";
import { conCandado } from "../data/candado";
import { leerMaestros } from "../data/paquete";
import type { OrdenCompra } from "../domain/contratos-oc";
import { normalizarNit } from "../domain/texto";
import type { SapAdapter } from "./adapter";

const PRIMER_NUMERO = 4_500_000_001;

const RegistroSchema = z.object({ numero_oc: z.string(), fecha: z.string(), solicitud_id: z.string() });
type Registro = z.infer<typeof RegistroSchema>;

/** El adaptador más una consulta que además devuelve la fecha (la usa `oc_crear` en la respuesta idempotente). */
export interface SapMock extends SapAdapter {
  buscarOrden(solicitud_id: string): Promise<{ numero_oc: string; fecha: string } | null>;
}

export function crearSapMock(directory: string, ahora: () => Date = () => new Date()): SapMock {
  const archivo = path.join(directory, "out", "sap", "ordenes.jsonl");
  const clave = `archivo:${archivo}`;

  async function leerRegistros(): Promise<Registro[]> {
    let texto: string;
    try {
      texto = await readFile(archivo, "utf8");
    } catch {
      return [];
    }
    const registros: Registro[] = [];
    for (const linea of texto.split("\n")) {
      if (linea.trim() === "") continue;
      try {
        const r = RegistroSchema.safeParse(JSON.parse(linea));
        if (r.success) registros.push(r.data);
      } catch {
        // línea corrupta: se ignora para no bloquear la numeración
      }
    }
    return registros;
  }

  const buscarOrden = async (solicitud_id: string) => {
    const r = (await leerRegistros()).find((x) => x.solicitud_id === solicitud_id);
    return r === undefined ? null : { numero_oc: r.numero_oc, fecha: r.fecha };
  };

  return {
    buscarOrden,
    buscarOrdenPorReferencia: async (solicitud_id) => {
      const r = await buscarOrden(solicitud_id);
      return r === null ? null : { numero_oc: r.numero_oc };
    },
    async consultarProveedor(nit) {
      const { proveedores } = await leerMaestros(directory);
      const p = proveedores.find((x) => normalizarNit(x.nit) === normalizarNit(nit));
      return p === undefined ? null : { codigo_sap: p.codigo_sap, activo: p.activo };
    },
    crearOrden(orden: OrdenCompra) {
      return conCandado(clave, async () => {
        const registros = await leerRegistros();
        const previo = registros.find((r) => r.solicitud_id === orden.referencia.solicitud_id);
        if (previo !== undefined) return { numero_oc: previo.numero_oc, fecha: previo.fecha };

        const maximo = Math.max(PRIMER_NUMERO - 1, ...registros.map((r) => Number(r.numero_oc)).filter(Number.isFinite));
        const registro: Registro = { numero_oc: String(maximo + 1), fecha: ahora().toISOString(), solicitud_id: orden.referencia.solicitud_id };
        await mkdir(path.dirname(archivo), { recursive: true });
        await appendFile(archivo, `${JSON.stringify({ ...registro, orden })}\n`, "utf8");
        return { numero_oc: registro.numero_oc, fecha: registro.fecha };
      });
    },
  };
}
