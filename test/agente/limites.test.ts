import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITES, conTimeout, crearRateLimiter } from "../../src/security/limites";

describe("crearRateLimiter", () => {
  it("permite hasta el máximo y bloquea el siguiente en la misma ventana", () => {
    const limiter = crearRateLimiter({ max: 2, ventanaMs: 1000, ahora: () => 0 });

    assert.equal(limiter.permitir("ip-1"), true);
    assert.equal(limiter.permitir("ip-1"), true);
    assert.equal(limiter.permitir("ip-1"), false);
  });

  it("cuenta cada IP por separado", () => {
    const limiter = crearRateLimiter({ max: 1, ventanaMs: 1000, ahora: () => 0 });

    limiter.permitir("ip-1");

    assert.equal(limiter.permitir("ip-2"), true);
  });

  it("reinicia el contador al terminar la ventana", () => {
    let t = 0;
    const limiter = crearRateLimiter({ max: 1, ventanaMs: 1000, ahora: () => t });
    limiter.permitir("ip-1");
    assert.equal(limiter.permitir("ip-1"), false);

    t = 1000;

    assert.equal(limiter.permitir("ip-1"), true);
  });

  it("no acumula entradas de ventanas ya vencidas", () => {
    let t = 0;
    const limiter = crearRateLimiter({ max: 1, ventanaMs: 1000, ahora: () => t });
    limiter.permitir("a");
    limiter.permitir("b");

    t = 5000;
    limiter.permitir("c");

    assert.equal(limiter.tamano(), 1);
  });
});

describe("conTimeout", () => {
  it("devuelve el valor si la promesa termina a tiempo", async () => {
    assert.equal(await conTimeout(Promise.resolve(7), 50), 7);
  });

  it("rechaza si la promesa tarda más que el límite", async () => {
    const lenta = new Promise<number>((resolve) => setTimeout(() => resolve(1), 200));

    await assert.rejects(conTimeout(lenta, 10), /tiempo/i);
  });
});

describe("LIMITES", () => {
  it("fija el timeout al LLM en 60 s", () => {
    assert.equal(LIMITES.timeoutLlmMs, 60_000);
  });
});
