import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cargarEnv } from "../../src/config/env";

describe("cargarEnv", () => {
  it("aplica valores por defecto sin variables", () => {
    const env = cargarEnv({});

    assert.equal(env.geminiApiKey, undefined);
    assert.equal(env.geminiModel, "gemini-3.6-flash");
    assert.equal(env.port, 3000);
    assert.equal(env.maxIteraciones, 25);
    assert.equal(env.maxTokensSesion, 200_000);
  });

  it("lee los topes configurables y trata el vacío como ausente", () => {
    const env = cargarEnv({ MAX_ITERACIONES: "10", MAX_TOKENS_SESION: "5000", PORT: " ", GEMINI_API_KEY: "" });

    assert.equal(env.maxIteraciones, 10);
    assert.equal(env.maxTokensSesion, 5000);
    assert.equal(env.port, 3000);
    assert.equal(env.geminiApiKey, undefined);
  });

  it("rechaza valores inválidos sin revelarlos", () => {
    assert.throws(() => cargarEnv({ MAX_ITERACIONES: "0" }), /MAX_ITERACIONES/);
    assert.throws(
      () => cargarEnv({ PORT: "abc-secreto" }),
      (e: unknown) => e instanceof Error && /PORT/.test(e.message) && !e.message.includes("abc-secreto"),
    );
  });

  it("ya no conoce HITL_SECRET", () => {
    assert.equal("hitlSecret" in cargarEnv({ HITL_SECRET: "x".repeat(40) }), false);
  });
});
