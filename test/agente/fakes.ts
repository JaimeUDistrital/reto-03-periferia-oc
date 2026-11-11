/** Dobles de prueba en memoria (fakes): núcleo de OC y LLM guionizado. */
import * as z from "zod";
import type {
  Decision,
  Dictamen,
  EventoAgente,
  LlmPort,
  NucleoOC,
  OrdenCompra,
  RespuestaLlm,
  ResultadoControl,
  ToolDef,
  TurnoHistorial,
} from "../../src/domain/contratos";

export interface NucleoFalso extends NucleoOC {
  /** Cuántas veces se ejecutó realmente cada tool (por nombre). */
  ejecuciones: Record<string, number>;
  /** Solicitudes para las que se llamó a sap.crearOrdenCompra. */
  ordenesCreadas: string[];
  /** Permite cambiar la decisión/hash entre evaluaciones. */
  config: { decision: Decision; hash: string; controles: ResultadoControl[] };
}

const SOLICITUDES = ["sol-001", "sol-002"];

export function crearNucleoFalso(inicial?: Partial<NucleoFalso["config"]>): NucleoFalso {
  const ejecuciones: Record<string, number> = {};
  const ordenesCreadas: string[] = [];
  const config: NucleoFalso["config"] = {
    decision: "APROBABLE",
    hash: "hash-1",
    controles: [{ id: "CTRL-PROVEEDOR", nombre: "Proveedor activo", estado: "OK", detalle: "Proveedor activo", evidencia: {} }],
    ...inicial,
  };
  const contar = (nombre: string): void => {
    ejecuciones[nombre] = (ejecuciones[nombre] ?? 0) + 1;
  };

  const entradaSolicitud = z.object({ solicitudId: z.string() });

  const validarProveedor: ToolDef = {
    nombre: "validarProveedor",
    descripcion: "Valida el proveedor de la solicitud",
    entrada: entradaSolicitud,
    salida: z.unknown(),
    requiereConfirmacion: false,
    async ejecutar() {
      contar("validarProveedor");
      return { proveedor: "ACME", email: "ana.lopez@acme.org", telefono: "3001234567", estado: "ACTIVO" };
    },
  };
  const explota: ToolDef = {
    nombre: "herramientaRota",
    descripcion: "Falla siempre",
    entrada: z.object({}),
    salida: z.unknown(),
    requiereConfirmacion: false,
    async ejecutar() {
      contar("herramientaRota");
      throw new Error("fallo interno con key=SECRETO123");
    },
  };
  const crearOrdenCompra: ToolDef = {
    nombre: "crearOrdenCompra",
    descripcion: "Crea la OC en SAP (exige confirmación humana)",
    entrada: entradaSolicitud,
    salida: z.unknown(),
    requiereConfirmacion: true,
    async ejecutar() {
      contar("crearOrdenCompra");
      throw new Error("el loop nunca debe ejecutar esta tool");
    },
  };

  const nucleo: NucleoFalso = {
    ejecuciones,
    ordenesCreadas,
    config,
    async listarSolicitudes() {
      return SOLICITUDES;
    },
    async evaluarSolicitud(solicitudId) {
      if (!SOLICITUDES.includes(solicitudId)) throw new Error(`Solicitud desconocida: ${solicitudId}`);
      contar("evaluarSolicitud");
      const dictamen: Dictamen = { solicitudId, decision: config.decision, controles: config.controles, hash: config.hash };
      return dictamen;
    },
    herramientas: [validarProveedor, explota, crearOrdenCompra],
    sap: {
      async crearOrdenCompra(solicitudId): Promise<OrdenCompra> {
        ordenesCreadas.push(solicitudId);
        return { numero: "4500000001", solicitudId, creadaEn: "2026-11-10T12:00:00.000Z" };
      },
    },
  };
  return nucleo;
}

export interface LlmGuionizado extends LlmPort {
  /** Historial recibido en cada llamada (copia). */
  recibidos: TurnoHistorial[][];
}

/** Devuelve las respuestas en orden; si se agotan, repite la última. */
export function crearLlmGuionizado(respuestas: RespuestaLlm[]): LlmGuionizado {
  const recibidos: TurnoHistorial[][] = [];
  return {
    recibidos,
    async generar(entrada) {
      recibidos.push(structuredClone(entrada.historial));
      const i = Math.min(recibidos.length - 1, respuestas.length - 1);
      const r = respuestas[i];
      if (!r) throw new Error("Guion vacío");
      return structuredClone(r);
    },
  };
}

export function llamar(id: string, nombre: string, args: unknown): RespuestaLlm {
  return { llamadas: [{ id, nombre, args }] };
}

export function recolector(): { eventos: EventoAgente[]; emitir: (e: EventoAgente) => void } {
  const eventos: EventoAgente[] = [];
  return { eventos, emitir: (e) => void eventos.push(e) };
}
