import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { crearBitacora } from "../../src/agent/bitacora";

describe("bitácora out/log.jsonl", () => {
  it("agrega una línea JSON por llamada con los correos enmascarados", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bitacora-"));
    try {
      const bitacora = crearBitacora(join(dir, "out"));

      await bitacora.registrar({ ts: "2026-11-10T10:00:00Z", sessionId: "s1", herramienta: "oc_validar", args: { caso: "sol-001", de: "ana.lopez@acme.org" }, ok: true, ms: 5 });
      await bitacora.registrar({ ts: "2026-11-10T10:00:01Z", sessionId: "s1", herramienta: "oc_crear", args: { caso: "sol-001" }, ok: false, ms: 2, codigo: "BLOQUEADA" });

      const lineas = (await readFile(join(dir, "out", "log.jsonl"), "utf8")).trim().split("\n");
      assert.equal(lineas.length, 2);
      const primera = JSON.parse(lineas[0] ?? "") as Record<string, unknown>;
      assert.equal(primera["herramienta"], "oc_validar");
      assert.equal(primera["ok"], true);
      assert.equal(JSON.stringify(primera).includes("ana.lopez@acme.org"), false);
      assert.deepEqual(Object.keys(JSON.parse(lineas[1] ?? "") as object), ["ts", "sessionId", "herramienta", "args", "ok", "ms", "codigo"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("trunca argumentos enormes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bitacora-"));
    try {
      await crearBitacora(dir).registrar({ ts: "t", sessionId: "s", herramienta: "h", args: { x: "a".repeat(10_000) }, ok: true, ms: 1 });

      const linea = JSON.parse((await readFile(join(dir, "log.jsonl"), "utf8")).trim()) as { args: string };
      assert.ok(linea.args.length < 2100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
