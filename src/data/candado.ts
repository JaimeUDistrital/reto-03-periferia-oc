/**
 * Candado en proceso: serializa las secciones críticas con la misma clave (p. ej. la ruta de un archivo).
 * Solo protege dentro de un proceso Node; entre procesos haría falta un candado de archivo o una base de datos.
 */
const colas = new Map<string, Promise<unknown>>();

export function conCandado<T>(clave: string, seccion: () => Promise<T>): Promise<T> {
  const previa = colas.get(clave) ?? Promise.resolve();
  const actual = previa.then(seccion);
  const cola = actual.then(
    () => undefined,
    () => undefined,
  );
  colas.set(clave, cola);
  void cola.then(() => {
    if (colas.get(clave) === cola) colas.delete(clave);
  });
  return actual;
}
