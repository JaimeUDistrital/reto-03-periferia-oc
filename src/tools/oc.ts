/**
 * Herramientas de órdenes de compra (PRD §6.2). El servidor registra cada export como `oc_<export>`.
 * Solo se exportan herramientas; la lógica vive en src/domain y src/data. Las herramientas nunca lanzan
 * ni ejecutan comandos de shell, y siempre releen la fuente por `caso`.
 */
import * as z from "zod";
import { leerExcel } from "../data/excel";
import type { HerramientaOC } from "../domain/contratos-oc";
import { protegido, ok } from "../domain/respuesta";
import {
  construirPayloadCaso,
  crearCaso,
  generarEvidenciaCaso,
  leerPaqueteCaso,
  validarCaso,
} from "../domain/servicio-oc";

const caso = z.string().describe("Nombre de la carpeta del caso en fixtures/reto-03/solicitudes/, por ejemplo sol-004");
const suelto = (texto: string) => z.record(z.string(), z.unknown()).optional().describe(texto);

const argsLeerPaquete = { caso };
export const leer_paquete: HerramientaOC<typeof argsLeerPaquete> = {
  description: "Lee y normaliza el paquete de un caso (correo, solicitud, cotización, aprobación, factura) e informa los adjuntos que faltan.",
  args: argsLeerPaquete,
  execute: (args, ctx) => protegido(() => leerPaqueteCaso(ctx, args.caso)),
};

const argsValidar = {
  caso,
  paquete: suelto("Opcional: el paquete tal como lo devolvió oc_leer_paquete; se contrasta con la fuente, no se usa como dato"),
};
export const validar: HerramientaOC<typeof argsValidar> = {
  description: "Aplica las reglas de control RC1 a RC10 a un caso y devuelve si es apta, los bloqueos, las confirmaciones y los valores derivados de maestros.",
  args: argsValidar,
  execute: (args, ctx) => protegido(() => validarCaso(ctx, args.caso, args.paquete)),
};

const argsConstruir = {
  caso,
  paquete: suelto("Opcional: el paquete de oc_leer_paquete; se contrasta con la fuente"),
  derivados: suelto("Opcional: los derivados de oc_validar; se contrastan con la fuente"),
};
export const construir_payload: HerramientaOC<typeof argsConstruir> = {
  description: "Construye la orden de compra tal como quedaría en SAP, valida su esquema y guarda la trazabilidad de cada campo en out/<caso>/trazabilidad.json.",
  args: argsConstruir,
  execute: (args, ctx) => protegido(() => construirPayloadCaso(ctx, args.caso, args.paquete, args.derivados)),
};

const argsEvidencia = { caso };
export const generar_evidencia: HerramientaOC<typeof argsEvidencia> = {
  description: "Genera la evidencia de aprobación del caso (aprobacion.txt con su sha256 y aprobacion.pdf) en out/<caso>/.",
  args: argsEvidencia,
  execute: (args, ctx) => protegido(() => generarEvidenciaCaso(ctx, args.caso)),
};

const argsCrear = {
  caso,
  payload: suelto("Opcional: la orden de oc_construir_payload; se contrasta con la fuente y la herramienta reconstruye la orden"),
  confirmado: z.boolean().optional().describe("true solo si el analista confirmó explícitamente este caso en su último mensaje"),
};
export const crear: HerramientaOC<typeof argsCrear> = {
  description:
    "Crea la orden de compra en el SAP simulado si el caso es apto y, cuando hay confirmaciones, el analista las confirmó; es idempotente por solicitud y registra cada intento en out/control.csv.",
  args: argsCrear,
  execute: (args, ctx) => protegido(() => crearCaso(ctx, args.caso, args.payload, args.confirmado)),
};

const argsExcel = { ruta: z.string().describe("Ruta relativa a un .xlsx dentro de fixtures/, por ejemplo fixtures/reto-03/solicitudes/sol-001/solicitud.xlsx") };
export const leer_excel: HerramientaOC<typeof argsExcel> = {
  description: "Lee la primera hoja de un archivo .xlsx de fixtures/ y devuelve sus filas.",
  args: argsExcel,
  execute: (args, ctx) => protegido(async () => ok({ filas: await leerExcel(ctx.directory, args.ruta) })),
};
