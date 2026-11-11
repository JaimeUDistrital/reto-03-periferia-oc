import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventoAgente } from "../../src/domain/contratos";
import { crearApp } from "../../src/server/app";
import { crearNucleoFalso } from "./fakes";

describe("POST /api/evaluar y el historial del chat", () => {
  it("termina con un fin sin historial para no reemplazar la conversación", async () => {
    const app = crearApp({
      nucleo: crearNucleoFalso(),
      hitlSecret: "s".repeat(32),
      ahora: () => 1_700_000_000_000,
      registrar: () => undefined,
      dirEstaticos: "./no-existe",
    });

    const res = await app.request("/api/evaluar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ solicitudId: "sol-001" }),
    });
    const fin = (await res.text())
      .split("\n\n")
      .map((bloque) => bloque.split("\n").find((l) => l.startsWith("data:")))
      .filter((l): l is string => l !== undefined)
      .map((l) => JSON.parse(l.slice(5).trim()) as EventoAgente)
      .at(-1);

    assert.equal(fin?.tipo, "fin");
    assert.equal(fin !== undefined && "historial" in fin, false);
  });
});
