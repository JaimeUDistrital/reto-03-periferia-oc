// sessionId por pestaña: sessionStorage si se puede, memoria si no. Sin DOM (el almacén se inyecta).
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

const CLAVE = "reto3.sessionId";

export function crearSesion(almacen: Almacen | null, generar: () => string = () => crypto.randomUUID()) {
  let enMemoria: string | null = null;

  const leer = (): string | null => {
    try {
      return almacen?.getItem(CLAVE) ?? null;
    } catch {
      return null;
    }
  };
  const guardar = (id: string): void => {
    enMemoria = id;
    try {
      almacen?.setItem(CLAVE, id);
    } catch {
      // sin almacenamiento: queda en memoria
    }
  };

  return {
    actual(): string {
      const id = leer() ?? enMemoria;
      if (id) return id;
      const nuevo = generar();
      guardar(nuevo);
      return nuevo;
    },
    nueva(): string {
      const nuevo = generar();
      guardar(nuevo);
      return nuevo;
    },
  };
}
