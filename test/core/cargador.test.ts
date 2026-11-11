import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { cargarExpediente, listarSolicitudIds, raizPorDefecto } from "../../src/data/cargador";

describe("raizPorDefecto", () => {
  it("apunta a fixtures/reto-03 desde el directorio de trabajo", () => {
    assert.equal(raizPorDefecto(), path.join(process.cwd(), "fixtures", "reto-03"));
  });
});

describe("listarSolicitudIds", () => {
  it("lista las carpetas sol-NNN ordenadas", async () => {
    const ids = await listarSolicitudIds();

    assert.ok(ids.includes("sol-001") && ids.includes("sol-002"));
    assert.deepEqual(ids, [...ids].sort());
  });

  it("ignora carpetas que no siguen el formato sol-NNN", async () => {
    const raiz = await mkdtemp(path.join(tmpdir(), "fixtures-"));
    await mkdir(path.join(raiz, "solicitudes", "sol-007"), { recursive: true });
    await mkdir(path.join(raiz, "solicitudes", "otra-cosa"), { recursive: true });

    assert.deepEqual(await listarSolicitudIds(raiz), ["sol-007"]);
  });
});

describe("cargarExpediente", () => {
  it("traduce sol-001 al dominio, con NIT normalizado y sin factura", async () => {
    const e = await cargarExpediente("sol-001");

    assert.equal(e.solicitud.proveedorNit, "900123456-7");
    assert.equal(e.cotizacion.total, 11900000);
    assert.equal(e.factura, null);
    assert.equal(e.maestros.proveedores.length > 0, true);
  });

  it("carga la factura de sol-002 con su fecha", async () => {
    const e = await cargarExpediente("sol-002");

    assert.equal(e.factura?.fecha, "2026-10-10");
  });

  it("rechaza identificadores que intentan salir de la carpeta", async () => {
    await assert.rejects(() => cargarExpediente("../maestros"), /sol-001/);
  });

  it("falla con un mensaje que nombra el archivo si el JSON no cumple el esquema", async () => {
    const raiz = await mkdtemp(path.join(tmpdir(), "fixtures-"));
    const carpeta = path.join(raiz, "solicitudes", "sol-001");
    await mkdir(carpeta, { recursive: true });
    await writeFile(path.join(carpeta, "solicitud.json"), JSON.stringify({ id: "sol-001" }));

    await assert.rejects(() => cargarExpediente("sol-001", raiz), /solicitud\.json/);
  });
});
