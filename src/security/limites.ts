/** Límites anti-abuso y de coste. Todo en memoria: una sola instancia. Iteraciones y tokens por sesión: src/config/env.ts. */

export const LIMITES = {
  maxMensaje: 2000,
  timeoutLlmMs: 60_000,
  maxBodyBytes: 256 * 1024,
} as const;

export interface RateLimiter {
  /** true = la petición cabe en la ventana actual de esa clave (normalmente la IP). */
  permitir(clave: string): boolean;
  tamano(): number;
}

export function crearRateLimiter(opciones: { max: number; ventanaMs: number; ahora?: () => number }): RateLimiter {
  const { max, ventanaMs } = opciones;
  const ahora = opciones.ahora ?? Date.now;
  const ventanas = new Map<string, { inicio: number; usos: number }>();
  let ultimaPoda = ahora();

  function podar(t: number): void {
    if (t - ultimaPoda < ventanaMs) return;
    ultimaPoda = t;
    for (const [clave, v] of ventanas) {
      if (t - v.inicio >= ventanaMs) ventanas.delete(clave);
    }
  }

  return {
    permitir(clave) {
      const t = ahora();
      podar(t);
      const actual = ventanas.get(clave);
      if (!actual || t - actual.inicio >= ventanaMs) {
        ventanas.set(clave, { inicio: t, usos: 1 });
        return max >= 1;
      }
      if (actual.usos >= max) return false;
      actual.usos += 1;
      return true;
    },
    tamano: () => ventanas.size,
  };
}

export class TiempoAgotadoError extends Error {
  constructor() {
    super("Tiempo de espera agotado");
  }
}

export function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const vencido = new Promise<never>((_resolve, reject) => {
    temporizador = setTimeout(() => reject(new TiempoAgotadoError()), ms);
  });
  return Promise.race([promesa, vencido]).finally(() => clearTimeout(temporizador));
}
