/**
 * Núcleo de órdenes de compra: herramientas (ToolDef con Zod) sobre el dominio determinista.
 * El LLM solo pasa `{ solicitudId }`; los documentos los lee el servidor, nunca el modelo.
 */
import * as z from "zod";
import { cargarExpediente, listarSolicitudIds } from "../data/cargador";
import {
  DictamenSchema,
  ResultadoControlSchema,
  type NucleoOC,
  type OrdenCompra,
  type ResultadoControl,
  type ToolDef,
} from "../domain/contratos";
import { CONTROLES } from "../domain/controles";
import { evaluarExpediente, evaluarSolicitud } from "../domain/evaluar";
import { SolicitudIdSchema } from "../domain/modelo";
import { crearSapSimulado } from "../sap/simulador";

// Funciones puras reutilizables (demo.ts, tests).
export { evaluarExpediente, evaluarSolicitud, listarSolicitudIds as listarSolicitudes };

const EntradaSolicitudSchema = z.strictObject({
  solicitudId: SolicitudIdSchema.describe("Identificador de la solicitud, por ejemplo sol-001"),
});
type EntradaSolicitud = z.infer<typeof EntradaSolicitudSchema>;

const OrdenCompraSchema = z.object({
  numero: z.string(),
  solicitudId: z.string(),
  creadaEn: z.string(),
});

/** Evalúa un solo control sobre una solicitud. */
export async function evaluarControl(controlId: string, solicitudId: string, raizFixtures?: string): Promise<ResultadoControl> {
  const control = CONTROLES.find((c) => c.id === controlId);
  if (!control) throw new Error(`Control desconocido: ${controlId}`);
  return control.evaluar(await cargarExpediente(solicitudId, raizFixtures));
}

export function crearNucleoOC(opciones: { raizFixtures?: string } = {}): NucleoOC {
  const raiz = opciones.raizFixtures;
  const sap = crearSapSimulado();

  const toolControl = (nombre: string, controlId: string, descripcion: string): ToolDef<EntradaSolicitud, ResultadoControl> => ({
    nombre,
    descripcion,
    entrada: EntradaSolicitudSchema,
    salida: ResultadoControlSchema,
    requiereConfirmacion: false,
    ejecutar: ({ solicitudId }) => evaluarControl(controlId, solicitudId, raiz),
  });

  const listar: ToolDef<Record<string, never>, { solicitudes: string[] }> = {
    nombre: "listarSolicitudes",
    descripcion:
      "Lista los identificadores de las solicitudes de compra disponibles (formato sol-001). Úsala cuando el usuario no indique qué solicitud revisar.",
    entrada: z.strictObject({}),
    salida: z.object({ solicitudes: z.array(z.string()) }),
    requiereConfirmacion: false,
    ejecutar: async () => ({ solicitudes: await listarSolicitudIds(raiz) }),
  };

  const evaluar: ToolDef<EntradaSolicitud, z.infer<typeof DictamenSchema>> = {
    nombre: "evaluarSolicitud",
    descripcion:
      "Ejecuta todos los controles de una solicitud y devuelve el dictamen oficial (decisión APROBABLE, REQUIERE_REVISION o RECHAZADA, resultado de cada control y hash). La decisión la calcula el sistema, no el modelo: explícala, no la cambies.",
    entrada: EntradaSolicitudSchema,
    salida: DictamenSchema,
    requiereConfirmacion: false,
    ejecutar: ({ solicitudId }) => evaluarSolicitud(solicitudId, raiz),
  };

  const crear: ToolDef<EntradaSolicitud, OrdenCompra> = {
    nombre: "crearOrdenCompra",
    descripcion:
      "Crea la orden de compra en SAP para una solicitud. Requiere confirmación humana explícita: solo se ejecuta con un token de confirmación válido. Reevalúa la solicitud y se niega si está RECHAZADA. Es idempotente: repetirla devuelve la misma orden.",
    entrada: EntradaSolicitudSchema,
    salida: OrdenCompraSchema,
    requiereConfirmacion: true,
    async ejecutar({ solicitudId }) {
      const dictamen = await evaluarSolicitud(solicitudId, raiz);
      if (dictamen.decision === "RECHAZADA") {
        throw new Error(`No se puede crear la orden: la solicitud ${solicitudId} está RECHAZADA.`);
      }
      return sap.crearOrdenCompra(solicitudId, dictamen);
    },
  };

  const herramientas: ToolDef[] = [
    listar,
    toolControl(
      "validarProveedor",
      "CTRL-PROVEEDOR",
      "Verifica que el proveedor de la solicitud exista en el maestro de proveedores y esté activo (no inactivo ni bloqueado). Devuelve estado OK o BLOQUEO con el motivo.",
    ),
    toolControl(
      "validarCentroCostoYTope",
      "CTRL-CECO-TOPE",
      "Verifica que el centro de costo exista, que la aprobación la haya dado el líder de ese centro, que esté aprobada y que el total no supere el tope del líder. Devuelve OK o BLOQUEO.",
    ),
    toolControl(
      "validarIVA",
      "CTRL-IVA",
      "Verifica el indicador de IVA y la aritmética de la cotización: impuesto = subtotal × tasa y total = subtotal + impuesto (tolerancia de 1 unidad monetaria). Devuelve OK o ALERTA.",
    ),
    toolControl(
      "validarCondicionPago",
      "CTRL-COND-PAGO",
      "Verifica que la condición de pago exista en el maestro y coincida con la del proveedor o la de la cotización. Devuelve OK o ALERTA.",
    ),
    toolControl(
      "detectarCompraRetroactiva",
      "CTRL-RETROACTIVA",
      "Detecta compras retroactivas: si existe una factura con fecha anterior a la solicitud o a su aprobación, devuelve BLOQUEO con las fechas como evidencia. Sin factura, devuelve OK.",
    ),
    toolControl(
      "validarCoherencia",
      "CTRL-COHERENCIA",
      "Verifica que el proveedor (NIT) y el total de la solicitud coincidan con los de la cotización. Devuelve OK o ALERTA.",
    ),
    evaluar,
    crear,
  ];

  return {
    listarSolicitudes: () => listarSolicitudIds(raiz),
    evaluarSolicitud: (solicitudId) => evaluarSolicitud(solicitudId, raiz),
    herramientas,
    sap,
  };
}
