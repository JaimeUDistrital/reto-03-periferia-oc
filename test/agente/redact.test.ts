import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redact } from "../../src/security/redact";

describe("redact", () => {
  it("elimina claves de Google que empiezan por AIza", () => {
    const clave = "AIza" + "SyD-1234567890abcdefghijklmnopqrstu";

    const salida = redact(`fallo con ${clave} en la llamada`);

    assert.equal(salida.includes(clave), false);
    assert.match(salida, /\[REDACTADO\]/);
  });

  it("elimina claves tipo sk-", () => {
    const salida = redact("clave sk-abcdefghijklmnopqrstuvwx1234");

    assert.equal(salida.includes("sk-abcdefghijkl"), false);
  });

  it("elimina tokens Bearer", () => {
    const salida = redact("Authorization: Bearer eyJhbGciOi.abc-def_123.xyz");

    assert.equal(salida.includes("eyJhbGciOi"), false);
    assert.match(salida, /Bearer \[REDACTADO\]/);
  });

  it("elimina valores de key=, token= y api_key= en URLs y textos", () => {
    const salida = redact("GET https://x.test/v1?key=SECRETO123&alt=json token=abc123 api_key: zzz999");

    assert.equal(salida.includes("SECRETO123"), false);
    assert.equal(salida.includes("abc123"), false);
    assert.equal(salida.includes("zzz999"), false);
    assert.match(salida, /alt=json/);
  });

  it("elimina valores de claves en JSON serializado", () => {
    const salida = redact('{"apiKey":"valor-secreto-1","otro":"visible"}');

    assert.equal(salida.includes("valor-secreto-1"), false);
    assert.match(salida, /visible/);
  });

  it("elimina tokens de confirmación firmados (payload.firma)", () => {
    const token = `${"a".repeat(30)}.${"B".repeat(43)}`;

    assert.equal(redact(`token ${token} recibido`).includes(token), false);
  });

  it("deja intacto un texto sin secretos", () => {
    const texto = "Solicitud sol-001 evaluada: APROBABLE";

    assert.equal(redact(texto), texto);
  });
});
