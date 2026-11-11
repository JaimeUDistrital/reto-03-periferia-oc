import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as z from "zod";
import { crearRegistro, esHerramientaOC } from "../../src/agent/herramientas";
import type { CtxHerramienta, HerramientaOC } from "../../src/domain/contratos-oc";
import { crearEstado, moduloFalso } from "./doble";

const ctx: CtxHerramienta = { directory: "/tmp/x", sessionId: "sesion-prueba" };

function moduloCon(execute: HerramientaOC["execute"]): Record<string, unknown> {
  return { rara: { description: "Rara", args: { caso: z.string() }, execute } satisfies HerramientaOC };
}

describe("esHerramientaOC", () => {
  it("acepta la forma description/args/execute y rechaza lo demás", () => {
    const buena = { description: "d", args: { a: z.string() }, async execute() { return "{}"; } };

    assert.equal(esHerramientaOC(buena), true);
    assert.equal(esHerramientaOC({ ...buena, args: { a: "no es zod" } }), false);
    assert.equal(esHerramientaOC({ ...buena, description: 1 }), false);
    assert.equal(esHerramientaOC({ description: "d", args: {} }), false);
    assert.equal(esHerramientaOC(() => 1), false);
    assert.equal(esHerramientaOC(null), false);
    assert.equal(esHerramientaOC(42), false);
  });
});

describe("crearRegistro", () => {
  it("expone solo las herramientas como oc_<export> con esquema JSON de sus argumentos", () => {
    const registro = crearRegistro(moduloFalso(crearEstado()));

    assert.deepEqual(registro.descriptores.map((d) => d.nombre), ["oc_leer_paquete", "oc_validar", "oc_construir_payload", "oc_crear"]);
    const leer = registro.descriptores[0];
    assert.equal(leer?.descripcion, "Lee el paquete del caso");
    assert.equal(leer?.parametros["type"], "object");
    assert.deepEqual(leer?.parametros["required"], ["caso"]);
    assert.equal("$schema" in (leer?.parametros ?? {}), false);
    assert.equal(registro.tiene("oc_ayuda"), false);
  });

  it("ejecuta con ctx, parsea la salida JSON y mide ms", async () => {
    const registro = crearRegistro(moduloFalso(crearEstado()));

    const r = await registro.ejecutar("oc_leer_paquete", { caso: "sol-001" }, ctx);

    assert.equal(r.ok, true);
    assert.deepEqual((r.salida as { data: { solicitud: unknown } }).data.solicitud, { solicitud_id: "sol-001" });
    assert.ok(r.ms >= 0);
  });

  it("devuelve el error de validación al modelo SIN ejecutar la herramienta", async () => {
    const estado = crearEstado();
    const registro = crearRegistro(moduloFalso(estado));

    const r = await registro.ejecutar("oc_leer_paquete", { caso: 123 }, ctx);

    assert.equal(r.ok, false);
    assert.equal(r.codigo, "ENTRADA_INVALIDA");
    assert.match((r.salida as { error: string }).error, /Argumentos inválidos: caso/);
    assert.equal(estado.ejecuciones["leer_paquete"], undefined);
  });

  it("informa herramienta desconocida sin lanzar", async () => {
    const r = await crearRegistro(moduloFalso(crearEstado())).ejecutar("oc_borrar_todo", {}, ctx);

    assert.equal(r.ok, false);
    assert.match((r.salida as { error: string }).error, /desconocida/);
  });

  it("convierte en error controlado una salida que no es JSON", async () => {
    const registro = crearRegistro(moduloCon(async () => "esto no es json"));

    const r = await registro.ejecutar("oc_rara", { caso: "a" }, ctx);

    assert.equal(r.ok, false);
    assert.equal(r.codigo, "ERROR");
    assert.match((r.salida as { error: string }).error, /no es JSON/);
  });

  it("convierte en error controlado un JSON sin campo ok", async () => {
    const r = await crearRegistro(moduloCon(async () => '{"data":1}')).ejecutar("oc_rara", { caso: "a" }, ctx);

    assert.equal(r.ok, false);
  });

  it("protege una herramienta que lanza y redacta secretos del mensaje", async () => {
    const registro = crearRegistro(
      moduloCon(async () => {
        throw new Error("fallo interno con key=SECRETO123");
      }),
    );

    const r = await registro.ejecutar("oc_rara", { caso: "a" }, ctx);

    assert.equal(r.ok, false);
    assert.equal(JSON.stringify(r.salida).includes("SECRETO123"), false);
  });

  it("propaga el codigo de error de la herramienta", async () => {
    const registro = crearRegistro(moduloCon(async () => JSON.stringify({ ok: false, error: "x", codigo: "BLOQUEADA" })));

    const r = await registro.ejecutar("oc_rara", { caso: "a" }, ctx);

    assert.equal(r.codigo, "BLOQUEADA");
  });
});
