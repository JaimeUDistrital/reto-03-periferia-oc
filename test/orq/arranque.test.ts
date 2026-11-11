import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };

describe("arranque en la máquina del evaluador", () => {
  it("start y dev:server cargan el archivo de entorno local si existe (si no, siguen sin error)", () => {
    for (const script of ["start", "dev:server"]) {
      assert.match(pkg.scripts[script] ?? "", /--env-file-if-exists=\.env(\s|$)/, script);
    }
  });
});
