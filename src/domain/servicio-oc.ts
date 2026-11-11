/**
 * Casos de uso de las herramientas OC (HU-1..HU-5). Cada función relee la fuente por `caso`:
 * lo que el modelo envíe solo se usa para detectar alteraciones, nunca como dato.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { conCandado } from "../data/candado";
import { registrarControl, type ResultadoControl } from "../data/control";
import { escribirEvidencia, type EvidenciaGenerada } from "../data/evidencia";
import { leerMaestros, leerPaquete } from "../data/paquete";
import { crearSapMock } from "../sap/mock";
import { diferenciasDerivados, diferenciasPaquete, diferenciasPayload, resumenDiferencias, type Diferencia } from "./alteracion";
import { casoValido, listarCasos } from "./casos";
import type { CtxHerramienta, OcCreada, OrdenCompra, Validacion } from "./contratos-oc";
import { construirOrden, type Trazabilidad } from "./payload";
import { validarPaquete } from "./reglas";
import { fallo, ok, type Respuesta } from "./respuesta";
import { ErrorEntrada, type Maestros, type Paquete } from "./tipos";

type Suelto = Record<string, unknown> | undefined;

const ahoraDe = (ctx: CtxHerramienta): Date => (ctx.ahora ?? (() => new Date()))();

/** Valida el nombre del caso y que exista; nunca usa el texto como ruta antes de comprobarlo. */
async function resolverCaso(ctx: CtxHerramienta, caso: string): Promise<string> {
  const valido = await casoValido(ctx.directory, caso);
  if (valido !== null) return valido;
  const disponibles = await listarCasos(ctx.directory);
  throw new ErrorEntrada(
    `El caso «${caso.slice(0, 60)}» no es válido o no existe en fixtures/reto-03/solicitudes/.`,
    `Usa el nombre exacto de una carpeta de caso. Disponibles: ${disponibles.join(", ") || "(ninguno)"}.`,
  );
}

interface Contexto {
  caso: string;
  paquete: Paquete;
  maestros: Maestros;
  validacion: Validacion;
}

async function cargar(ctx: CtxHerramienta, caso: string): Promise<Contexto> {
  const nombre = await resolverCaso(ctx, caso);
  const paquete = await leerPaquete(ctx.directory, nombre);
  const maestros = await leerMaestros(ctx.directory);
  return { caso: nombre, paquete, maestros, validacion: validarPaquete(nombre, paquete, maestros) };
}

const alterado = (d: Diferencia[]) =>
  fallo("PAYLOAD_ALTERADO", `Los datos recibidos no coinciden con la fuente: ${resumenDiferencias(d)}. Se ignoran; usa los valores devueltos por las herramientas.`, {
    diferencias: d,
  });

export async function leerPaqueteCaso(ctx: CtxHerramienta, caso: string): Promise<Respuesta<Paquete>> {
  const nombre = await resolverCaso(ctx, caso);
  return ok(await leerPaquete(ctx.directory, nombre));
}

export async function validarCaso(ctx: CtxHerramienta, caso: string, recibido: Suelto): Promise<Respuesta<Validacion>> {
  const c = await cargar(ctx, caso);
  const d = recibido === undefined ? [] : diferenciasPaquete(c.paquete, recibido);
  return d.length > 0 ? alterado(d) : ok(c.validacion);
}

async function escribirTrazabilidad(ctx: CtxHerramienta, caso: string, solicitud_id: string, campos: Trazabilidad): Promise<string> {
  const ruta = path.posix.join("out", caso, "trazabilidad.json");
  await mkdir(path.join(ctx.directory, "out", caso), { recursive: true });
  await writeFile(path.join(ctx.directory, ruta), `${JSON.stringify({ caso, solicitud_id, campos }, null, 2)}\n`, "utf8");
  return ruta;
}

export async function construirPayloadCaso(
  ctx: CtxHerramienta,
  caso: string,
  paqueteRecibido: Suelto,
  derivadosRecibidos: Suelto,
): Promise<Respuesta<{ orden: OrdenCompra; trazabilidad: string }>> {
  const c = await cargar(ctx, caso);
  const d = [
    ...(paqueteRecibido === undefined ? [] : diferenciasPaquete(c.paquete, paqueteRecibido)),
    ...(derivadosRecibidos === undefined ? [] : diferenciasDerivados(c.validacion.derivados, derivadosRecibidos)),
  ];
  if (d.length > 0) return alterado(d);
  if (!c.validacion.apta) return bloqueada(c.validacion);
  const { orden, trazabilidad } = construirOrden(c.paquete, c.validacion, c.maestros);
  const ruta = await escribirTrazabilidad(ctx, c.caso, c.validacion.solicitud_id, trazabilidad);
  return ok({ orden, trazabilidad: ruta });
}

export async function generarEvidenciaCaso(ctx: CtxHerramienta, caso: string): Promise<Respuesta<EvidenciaGenerada>> {
  const nombre = await resolverCaso(ctx, caso);
  const { aprobacion } = await leerPaquete(ctx.directory, nombre);
  if (aprobacion === null) {
    throw new ErrorEntrada("No hay aprobacion.json: no se puede generar la evidencia.", "Pide al solicitante el correo de aprobación de su líder.");
  }
  return ok(await escribirEvidencia(ctx.directory, nombre, aprobacion));
}

const bloqueada = (v: Validacion) =>
  fallo("BLOQUEADA", `La solicitud ${v.solicitud_id} no es apta: ${v.bloqueos.map((b) => `${b.regla} ${b.detalle}`).join(" ")}`, {
    bloqueos: v.bloqueos,
    acciones_sugeridas: v.bloqueos.map((b) => b.accion_sugerida),
  });

async function fila(ctx: CtxHerramienta, v: Validacion, resultado: ResultadoControl, numero_oc: string | null): Promise<void> {
  await registrarControl(ctx.directory, {
    solicitud_id: v.solicitud_id,
    resultado,
    numero_oc,
    retroactiva: v.retroactiva,
    bloqueos: v.bloqueos.map((b) => b.regla),
    confirmaciones: v.confirmaciones.map((h) => h.regla),
    ts: ahoraDe(ctx).toISOString(),
  });
}

/** Camino de `oc_crear`: bloqueo → existente → confirmaciones → alteración → evidencia → SAP. Serializado por proyecto. */
export function crearCaso(
  ctx: CtxHerramienta,
  caso: string,
  payloadRecibido: Suelto,
  confirmado: boolean | undefined,
): Promise<Respuesta<OcCreada>> {
  return conCandado(`crear:${path.resolve(ctx.directory)}`, async () => {
    const c = await cargar(ctx, caso);
    const v = c.validacion;
    const sap = crearSapMock(ctx.directory, () => ahoraDe(ctx));
    const rutaEvidencia = path.posix.join("out", c.caso, "aprobacion.txt");

    if (!v.apta) {
      await fila(ctx, v, "bloqueada", null);
      return bloqueada(v);
    }
    const existente = await sap.buscarOrden(v.solicitud_id);
    if (existente !== null) {
      await fila(ctx, v, "existente", existente.numero_oc);
      const evidencia = existsSync(path.join(ctx.directory, rutaEvidencia)) ? rutaEvidencia : null;
      return ok({ numero_oc: existente.numero_oc, fecha: existente.fecha, idempotente: true, retroactiva: v.retroactiva, evidencia });
    }
    if (v.confirmaciones.length > 0 && confirmado !== true) {
      await fila(ctx, v, "pendiente", null);
      return fallo("REQUIERE_CONFIRMACION", `La solicitud ${v.solicitud_id} requiere confirmación del analista antes de crear la OC.`, {
        confirmaciones: v.confirmaciones,
      });
    }
    if (v.confirmaciones.length > 0 && ctx.confirmacionHumana !== undefined && !ctx.confirmacionHumana(c.caso)) {
      await fila(ctx, v, "pendiente", null);
      return fallo("CONFIRMACION_NO_HUMANA", "El analista no confirmó este caso en su último mensaje; pregúntale de forma explícita y espera su respuesta.", {
        confirmaciones: v.confirmaciones,
      });
    }

    const { orden, trazabilidad } = construirOrden(c.paquete, v, c.maestros);
    const d = payloadRecibido === undefined ? [] : diferenciasPayload(orden, payloadRecibido);
    if (d.length > 0) {
      await fila(ctx, v, "rechazada", null);
      return alterado(d);
    }
    if (c.paquete.aprobacion === null) throw new ErrorEntrada("Falta la aprobación.", "Pide el correo de aprobación.");
    const evidencia = await escribirEvidencia(ctx.directory, c.caso, c.paquete.aprobacion);
    await escribirTrazabilidad(ctx, c.caso, v.solicitud_id, trazabilidad);

    const firmante = `analista (sesión ${ctx.sessionId})`;
    const final: OrdenCompra = { ...orden, excepciones: orden.excepciones.map((e) => ({ ...e, confirmado_por: firmante })) };
    const creada = await sap.crearOrden(final);
    await fila(ctx, v, "creada", creada.numero_oc);
    return ok({ numero_oc: creada.numero_oc, fecha: creada.fecha, idempotente: false, retroactiva: v.retroactiva, evidencia: evidencia.ruta });
  });
}
