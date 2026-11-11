/**
 * Registro de herramientas (PRD §6.2). Recibe un módulo cualquiera (`import * as oc`), se queda con los
 * exports que cumplen `HerramientaOC` y los expone al modelo como `oc_<export>`.
 * El ejecutor valida los argumentos con zod antes de ejecutar, parsea la salida (string JSON) y no lanza.
 */
import * as z from "zod";
import type { CtxHerramienta, HerramientaOC } from "../domain/contratos-oc";
import type { DescriptorHerramienta } from "../llm/adapter";
import { redactarError } from "../security/redact";

const PREFIJO = "oc_";

export interface ResultadoHerramienta {
  ok: boolean;
  /** Salida ya parseada: `{ ok: true, data }` o `{ ok: false, error, codigo?, ... }`. */
  salida: unknown;
  codigo?: string;
  ms: number;
}

export interface RegistroHerramientas {
  descriptores: DescriptorHerramienta[];
  tiene(nombre: string): boolean;
  ejecutar(nombre: string, args: unknown, ctx: CtxHerramienta): Promise<ResultadoHerramienta>;
}

export function esHerramientaOC(valor: unknown): valor is HerramientaOC {
  if (valor === null || typeof valor !== "object") return false;
  const { description, args, execute } = valor as Record<string, unknown>;
  if (typeof description !== "string" || typeof execute !== "function") return false;
  if (args === null || typeof args !== "object") return false;
  return Object.values(args).every((campo) => campo instanceof z.ZodType);
}

function esquemaDeArgumentos(herramienta: HerramientaOC): Record<string, unknown> {
  const { $schema: _omitido, ...parametros } = z.toJSONSchema(z.object(herramienta.args), { io: "input" });
  return parametros;
}

function falla(error: string, codigo: string): { ok: false; error: string; codigo: string } {
  return { ok: false, error, codigo };
}

function leerCodigo(salida: unknown): string | undefined {
  if (salida === null || typeof salida !== "object") return undefined;
  const codigo = (salida as Record<string, unknown>)["codigo"];
  return typeof codigo === "string" ? codigo : undefined;
}

function parsearSalida(texto: unknown): unknown {
  if (typeof texto !== "string") return falla("La herramienta no devolvió texto JSON.", "ERROR");
  try {
    const parseado: unknown = JSON.parse(texto);
    if (parseado !== null && typeof parseado === "object" && typeof (parseado as Record<string, unknown>)["ok"] === "boolean") {
      return parseado;
    }
    return falla("La herramienta devolvió JSON sin el campo ok.", "ERROR");
  } catch {
    return falla("La herramienta devolvió una respuesta que no es JSON válido.", "ERROR");
  }
}

async function ejecutarProtegida(h: HerramientaOC, args: Record<string, unknown>, ctx: CtxHerramienta): Promise<unknown> {
  try {
    return parsearSalida(await h.execute(args, ctx));
  } catch (e) {
    return falla(`La herramienta falló: ${redactarError(e)}`, "ERROR");
  }
}

export function crearRegistro(modulo: Record<string, unknown>): RegistroHerramientas {
  const herramientas = new Map<string, HerramientaOC>();
  for (const [nombre, valor] of Object.entries(modulo)) {
    if (esHerramientaOC(valor)) herramientas.set(`${PREFIJO}${nombre}`, valor);
  }

  const descriptores = [...herramientas].map(([nombre, h]) => ({
    nombre,
    descripcion: h.description,
    parametros: esquemaDeArgumentos(h),
  }));

  return {
    descriptores,
    tiene: (nombre) => herramientas.has(nombre),
    async ejecutar(nombre, args, ctx) {
      const inicio = performance.now();
      const terminar = (salida: unknown): ResultadoHerramienta => ({
        ok: (salida as { ok?: unknown }).ok === true,
        salida,
        codigo: leerCodigo(salida),
        ms: Math.round(performance.now() - inicio),
      });

      const herramienta = herramientas.get(nombre);
      if (!herramienta) return terminar(falla(`Herramienta desconocida: ${nombre}`, "ENTRADA_INVALIDA"));

      const validado = z.object(herramienta.args).safeParse(args);
      if (!validado.success) {
        const detalle = validado.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
        return terminar(falla(`Argumentos inválidos: ${detalle}`, "ENTRADA_INVALIDA"));
      }
      return terminar(await ejecutarProtegida(herramienta, validado.data, ctx));
    },
  };
}
