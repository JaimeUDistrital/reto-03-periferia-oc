import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cargarEnv } from "../../src/config/env";

describe("cargarEnv", () => {
  it("aplica valores por defecto sin variables", () => {
    const env = cargarEnv({}, () => {});

    assert.equal(env.geminiApiKey, undefined);
    assert.equal(env.geminiModel, "gemini-3.6-flash");
    assert.equal(env.port, 3000);
  });

  it("genera un HITL_SECRET aleatorio de al menos 32 caracteres y avisa sin mostrarlo", () => {
    const avisos: string[] = [];

    const env = cargarEnv({}, (m) => avisos.push(m));

    assert.ok(env.hitlSecret.length >= 32);
    assert.equal(env.hitlSecretEfimero, true);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0]?.includes(env.hitlSecret), false);
  });

  it("dos arranques sin HITL_SECRET generan secretos distintos", () => {
    assert.notEqual(cargarEnv({}, () => {}).hitlSecret, cargarEnv({}, () => {}).hitlSecret);
  });

  it("usa el HITL_SECRET dado y no avisa", () => {
    const avisos: string[] = [];

    const env = cargarEnv({ HITL_SECRET: "k".repeat(40) }, (m) => avisos.push(m));

    assert.equal(env.hitlSecret, "k".repeat(40));
    assert.equal(env.hitlSecretEfimero, false);
    assert.deepEqual(avisos, []);
  });

  it("rechaza un HITL_SECRET de menos de 32 caracteres sin revelar su valor", () => {
    assert.throws(
      () => cargarEnv({ HITL_SECRET: "corto-secreto" }, () => {}),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.match(e.message, /HITL_SECRET/);
        assert.equal(e.message.includes("corto-secreto"), false);
        return true;
      },
    );
  });

  it("trata las variables vacías como ausentes", () => {
    const env = cargarEnv({ GEMINI_API_KEY: "", GEMINI_MODEL: "", PORT: "" }, () => {});

    assert.equal(env.geminiApiKey, undefined);
    assert.equal(env.geminiModel, "gemini-3.6-flash");
    assert.equal(env.port, 3000);
  });

  it("lee clave, modelo y puerto", () => {
    const env = cargarEnv({ GEMINI_API_KEY: "k", GEMINI_MODEL: "otro", PORT: "8080", HITL_SECRET: "k".repeat(32) }, () => {});

    assert.deepEqual([env.geminiApiKey, env.geminiModel, env.port], ["k", "otro", 8080]);
  });

  it("rechaza un puerto inválido", () => {
    assert.throws(() => cargarEnv({ PORT: "abc" }, () => {}), /PORT/);
  });
});
