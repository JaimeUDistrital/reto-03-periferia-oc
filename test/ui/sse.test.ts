import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extraerEventos } from "../../web/src/sse";

describe("parser SSE", () => {
  it("extrae un evento completo de una línea data", () => {
    const r = extraerEventos('data: {"tipo":"mensaje","texto":"hola"}\n\n');
    assert.deepEqual(r.eventos, [{ tipo: "mensaje", texto: "hola" }]);
    assert.equal(r.resto, "");
  });

  it("conserva el resto cuando el bloque llega cortado", () => {
    const r = extraerEventos('data: {"tipo":"mensaje","te');
    assert.deepEqual(r.eventos, []);
    assert.equal(r.resto, 'data: {"tipo":"mensaje","te');
  });

  it("completa un evento cortado al llegar el siguiente fragmento", () => {
    const a = extraerEventos('data: {"tipo":"mensaje","te');
    const b = extraerEventos(a.resto + 'xto":"x"}\n\n');
    assert.deepEqual(b.eventos, [{ tipo: "mensaje", texto: "x" }]);
  });

  it("separa varios eventos y tolera CRLF", () => {
    const r = extraerEventos('data: {"tipo":"mensaje","texto":"a"}\r\n\r\ndata: {"tipo":"fin","historial":[]}\r\n\r\n');
    assert.deepEqual(r.eventos.map((e) => e.tipo), ["mensaje", "fin"]);
  });

  it("ignora comentarios, otros campos y datos que no son JSON de evento", () => {
    const r = extraerEventos(': ping\n\nevent: x\ndata: no-es-json\n\ndata: {"sin":"tipo"}\n\n');
    assert.deepEqual(r.eventos, []);
  });
});
