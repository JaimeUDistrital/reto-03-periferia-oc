import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, describe, it } from "node:test";
import * as z from "zod";

const SolicitudesSchema = z.object({ solicitudes: z.array(z.string()) });
const VercelJsonSchema = z.object({
  framework: z.null(),
  buildCommand: z.string(),
  outputDirectory: z.string(),
  rewrites: z.array(z.object({ source: z.string(), destination: z.string() })),
  functions: z.record(z.string(), z.object({ includeFiles: z.string() })),
});

interface EntradaVercel {
  fetch: (peticion: Request) => Response | Promise<Response>;
}

describe("entrada de Vercel (api/index.ts)", () => {
  let entrada: EntradaVercel;

  before(async () => {
    // Sin clave de Gemini y con secreto fijo: la entrada se crea sin avisos ni red.
    delete process.env["GEMINI_API_KEY"];
    process.env["HITL_SECRET"] = "s".repeat(32);
    entrada = ((await import("../../api/index")) as { default: EntradaVercel }).default;
  });

  it("exporta un manejador fetch (formato Web Standard de Vercel Functions)", () => {
    assert.equal(typeof entrada.fetch, "function");
  });

  it("GET /api/salud responde {ok:true}", async () => {
    const respuesta = await entrada.fetch(new Request("http://localhost/api/salud"));
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), { ok: true });
  });

  it("GET /api/solicitudes lista las solicitudes de fixtures/reto-03", async () => {
    const respuesta = await entrada.fetch(new Request("http://localhost/api/solicitudes"));
    assert.equal(respuesta.status, 200);
    const cuerpo = SolicitudesSchema.parse(await respuesta.json());
    assert.ok(cuerpo.solicitudes.length > 0);
    assert.ok(cuerpo.solicitudes.every((id) => /^sol-\d+$/.test(id)));
  });
});

describe("vercel.json", () => {
  it("sirve dist/web, enruta /api/* a la función e incluye fixtures y prompt en su paquete", async () => {
    const config = VercelJsonSchema.parse(JSON.parse(await readFile("vercel.json", "utf8")));
    assert.equal(config.outputDirectory, "dist/web");
    assert.equal(config.buildCommand, "npm run build");
    assert.deepEqual(config.rewrites, [{ source: "/api/(.*)", destination: "/api" }]);
    const incluidos = config.functions["api/index.ts"]?.includeFiles ?? "";
    assert.ok(incluidos.includes("fixtures") && incluidos.includes("agent"));
  });
});
