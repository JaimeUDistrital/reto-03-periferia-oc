import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearAlmacenSesiones } from "../../src/agent/sesiones";

describe("almacén de sesiones", () => {
  it("rechaza ids inválidos y crea/reutiliza los válidos", () => {
    const almacen = crearAlmacenSesiones();

    assert.equal(almacen.obtenerOCrear("corto"), undefined);
    assert.equal(almacen.obtenerOCrear("../../etc/passwd"), undefined);
    assert.equal(almacen.obtenerOCrear("a".repeat(65)), undefined);
    const a = almacen.obtenerOCrear("sesion-001");
    assert.ok(a);
    assert.equal(almacen.obtenerOCrear("sesion-001"), a);
    assert.deepEqual([a.mensajes, a.pendiente, a.tokens, a.ocupada], [[], null, 0, false]);
  });

  it("expulsa la sesión más antigua al superar el tope", () => {
    const almacen = crearAlmacenSesiones({ maxSesiones: 2 });

    almacen.obtenerOCrear("sesion-001");
    almacen.obtenerOCrear("sesion-002");
    almacen.obtenerOCrear("sesion-003");

    assert.equal(almacen.tamano(), 2);
    assert.equal(almacen.obtener("sesion-001"), undefined);
    assert.ok(almacen.obtener("sesion-003"));
  });

  it("recorta los mensajes por el principio sin dejar una respuesta de herramienta huérfana", () => {
    const almacen = crearAlmacenSesiones({ maxMensajes: 4 });
    const s = almacen.obtenerOCrear("sesion-001");
    assert.ok(s);

    almacen.agregar(s, { rol: "usuario", texto: "uno" });
    almacen.agregar(s, { rol: "modelo", llamadas: [{ id: "c1", nombre: "oc_x", args: {} }] });
    almacen.agregar(s, { rol: "herramienta", llamadaId: "c1", nombre: "oc_x", resultado: {} });
    almacen.agregar(s, { rol: "modelo", texto: "listo", llamadas: [] });
    almacen.agregar(s, { rol: "usuario", texto: "dos" });

    assert.equal(s.mensajes[0]?.rol, "usuario");
    assert.deepEqual(s.mensajes.map((m) => m.rol), ["usuario"]);
    assert.equal(s.mensajes[0]?.rol === "usuario" && s.mensajes[0].texto, "dos");
  });
});
