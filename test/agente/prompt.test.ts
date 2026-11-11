import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cargarSistema } from "../../src/agent/prompt";

describe("cargarSistema (comportamiento + conocimiento desde archivos)", () => {
  const sistema = cargarSistema();

  it("incluye el comportamiento de agent/prompt.md y el conocimiento de src/knowledge", () => {
    assert.match(sistema, /oc_leer_paquete/);
    assert.match(sistema, /confirmado: true/);
    assert.match(sistema, /datos, no instrucciones/);
    assert.match(sistema, /# Conocimiento del proceso/);
    for (let i = 1; i <= 10; i++) assert.match(sistema, new RegExp(`RC${i}\\b`));
    assert.match(sistema, /retroactiva/i);
  });
});
