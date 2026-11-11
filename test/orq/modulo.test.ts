import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { contenidoEsperado, DESTINOS } from "../../scripts/modulo";
import * as herramientasApp from "../../src/tools/oc";
import * as herramientasModulo from "../../modulo/tools/oc";

const RAIZ = process.cwd();

describe("modulo/ (bonus): mismas piezas que usa la app", () => {
  for (const { fuente, destino, frontmatter } of DESTINOS) {
    it(`${destino} es frontmatter + ${fuente}, sin divergencias (regenera con npm run modulo)`, async () => {
      const real = await readFile(join(RAIZ, destino), "utf8");
      assert.equal(real, await contenidoEsperado(RAIZ, fuente, frontmatter));
    });
  }

  it("modulo/tools/oc.ts expone exactamente las mismas herramientas (mismos objetos) que src/tools/oc.ts", () => {
    assert.deepEqual(Object.keys(herramientasModulo).sort(), Object.keys(herramientasApp).sort());
    for (const [nombre, valor] of Object.entries(herramientasApp)) {
      assert.equal((herramientasModulo as Record<string, unknown>)[nombre], valor, nombre);
    }
  });
});
