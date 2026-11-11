import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIEZ_MINUTOS_MS, firmarToken, verificarToken } from "../../src/security/hitl";

const SECRETO = "s".repeat(32);
const T0 = 1_700_000_000_000;

describe("token HITL", () => {
  it("un token recién firmado se verifica y devuelve solicitud y hash", () => {
    const token = firmarToken({ solicitudId: "sol-001", hash: "h1" }, SECRETO, () => T0);

    const r = verificarToken(token, SECRETO, () => T0 + 1000);

    assert.deepEqual(r, { ok: true, payload: { solicitudId: "sol-001", hash: "h1", exp: T0 + DIEZ_MINUTOS_MS } });
  });

  it("sigue siendo válido justo antes de los 10 minutos", () => {
    const token = firmarToken({ solicitudId: "sol-001", hash: "h1" }, SECRETO, () => T0);

    assert.equal(verificarToken(token, SECRETO, () => T0 + DIEZ_MINUTOS_MS - 1).ok, true);
  });

  it("caduca a los 10 minutos", () => {
    const token = firmarToken({ solicitudId: "sol-001", hash: "h1" }, SECRETO, () => T0);

    const r = verificarToken(token, SECRETO, () => T0 + DIEZ_MINUTOS_MS);

    assert.deepEqual(r, { ok: false, motivo: "caducado" });
  });

  it("rechaza un payload alterado conservando la firma", () => {
    const token = firmarToken({ solicitudId: "sol-001", hash: "h1" }, SECRETO, () => T0);
    const [, firma] = token.split(".");
    const falso = Buffer.from(JSON.stringify({ solicitudId: "sol-002", hash: "h1", exp: T0 + DIEZ_MINUTOS_MS })).toString("base64url");

    const r = verificarToken(`${falso}.${firma}`, SECRETO, () => T0);

    assert.deepEqual(r, { ok: false, motivo: "firma" });
  });

  it("rechaza un token firmado con otro secreto", () => {
    const token = firmarToken({ solicitudId: "sol-001", hash: "h1" }, "x".repeat(32), () => T0);

    assert.deepEqual(verificarToken(token, SECRETO, () => T0), { ok: false, motivo: "firma" });
  });

  it("rechaza basura sin lanzar excepciones", () => {
    for (const basura of ["", "abc", "a.b.c", ".", "%%%.%%%", "a".repeat(5000)]) {
      assert.equal(verificarToken(basura, SECRETO, () => T0).ok, false);
    }
  });

  it("rechaza una firma de longitud distinta sin lanzar", () => {
    const token = firmarToken({ solicitudId: "sol-001", hash: "h1" }, SECRETO, () => T0);
    const [payload] = token.split(".");

    assert.deepEqual(verificarToken(`${payload}.corta`, SECRETO, () => T0), { ok: false, motivo: "firma" });
  });
});
