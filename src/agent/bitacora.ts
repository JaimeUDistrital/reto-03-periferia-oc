/** Registro de auditoría `out/log.jsonl` (CA4): una línea JSON por llamada a herramienta, con datos personales enmascarados. */
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { mask } from "../security/mask";
import { redact } from "../security/redact";

const MAX_ARGS_LOG = 2000;

export interface EntradaBitacora {
  ts: string;
  sessionId: string;
  herramienta: string;
  args: unknown;
  ok: boolean;
  ms: number;
  codigo?: string;
}

export interface Bitacora {
  registrar(entrada: EntradaBitacora): Promise<void>;
}

/** Args enmascarados (correos, NIT…) y acotados: un paquete entero no debe inflar el log. */
function argsParaLog(args: unknown): unknown {
  const texto = redact(JSON.stringify(mask(args)) ?? "null");
  if (texto.length > MAX_ARGS_LOG) return `${texto.slice(0, MAX_ARGS_LOG)}…[truncado]`;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

export function crearBitacora(dirSalida: string): Bitacora {
  const ruta = join(dirSalida, "log.jsonl");
  return {
    async registrar(entrada) {
      await mkdir(dirSalida, { recursive: true });
      await appendFile(ruta, `${JSON.stringify({ ...entrada, args: argsParaLog(entrada.args) })}\n`, "utf8");
    },
  };
}
