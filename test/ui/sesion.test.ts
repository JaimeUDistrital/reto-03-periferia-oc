import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearSesion } from "../../web/src/sesion";

const almacenEnMemoria = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) };
};
const contador = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe("sesión por pestaña", () => {
  it("genera un id y lo reutiliza mientras exista en el almacén", () => {
    const almacen = almacenEnMemoria();
    const a = crearSesion(almacen, contador());
    const primero = a.actual();
    assert.equal(a.actual(), primero);
    // una "recarga": otra instancia con el mismo almacén ve el mismo id
    assert.equal(crearSesion(almacen, contador()).actual(), primero);
  });

  it("nueva() genera otro id y lo guarda", () => {
    const almacen = almacenEnMemoria();
    const s = crearSesion(almacen, contador());
    const viejo = s.actual();
    const nuevo = s.nueva();
    assert.notEqual(nuevo, viejo);
    assert.equal(s.actual(), nuevo);
    assert.equal(crearSesion(almacen, contador()).actual(), nuevo);
  });

  it("si el almacén lanza, funciona en memoria", () => {
    const roto = {
      getItem: (): string | null => {
        throw new Error("bloqueado");
      },
      setItem: (): void => {
        throw new Error("bloqueado");
      },
    };
    const s = crearSesion(roto, contador());
    const id = s.actual();
    assert.equal(s.actual(), id);
    assert.notEqual(s.nueva(), id);
  });

  it("sin almacén (null) también funciona en memoria", () => {
    const s = crearSesion(null, contador());
    assert.equal(s.actual(), s.actual());
  });
});
