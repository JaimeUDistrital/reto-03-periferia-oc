import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { EventoChat } from "../../src/domain/contratos-oc";
import { chat, evaluar, extraerCasos } from "../../web/src/api";
import { aplicarEvento, estadoInicial } from "../../web/src/estado";
import { ID_ERROR_RED } from "../../web/src/vista";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

const sseDe = (eventos: EventoChat[]): Response =>
  new Response(eventos.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });

describe("integración UI ↔ servidor", () => {
  it("lee la lista de casos con la forma que devuelve el servidor", () => {
    assert.deepEqual(extraerCasos({ casos: ["sol-001", "sol-002"] }), ["sol-001", "sol-002"]);
  });

  it("rechaza una respuesta de casos con otra forma", () => {
    assert.equal(extraerCasos({ solicitudes: ["sol-001"] }), null);
    assert.equal(extraerCasos({ casos: [] }), null);
  });

  it("chat envía sessionId y mensaje, y añade confirmar solo si se pide", async () => {
    const cuerpos: unknown[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      cuerpos.push(JSON.parse(String(init?.body)));
      return sseDe([{ tipo: "fin" }]);
    }) as typeof fetch;
    const recibidos: EventoChat[] = [];
    await chat("s-1", "hola", undefined, (e) => recibidos.push(e));
    await chat("s-1", "Confirmo la creación de la OC de sol-004.", "sol-004", () => {});
    assert.deepEqual(cuerpos, [
      { sessionId: "s-1", message: "hola" },
      { sessionId: "s-1", message: "Confirmo la creación de la OC de sol-004.", confirmar: "sol-004" },
    ]);
    assert.deepEqual(recibidos, [{ tipo: "fin" }]);
  });

  it("evaluar envía el caso y la sesión (para que «Confirmar» funcione al primer clic)", async () => {
    let cuerpo: unknown;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      cuerpo = JSON.parse(String(init?.body));
      return sseDe([{ tipo: "fin" }]);
    }) as typeof fetch;
    await evaluar("s-1", "sol-004", () => {});
    assert.deepEqual(cuerpo, { caso: "sol-004", sessionId: "s-1" });
  });

  it("si la red falla, emite un error de cliente reintentable y el estado lo muestra", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    let estado = estadoInicial;
    await chat("s-1", "hola", undefined, (e) => (estado = aplicarEvento(estado, e)));
    const ultimo = estado.items.at(-1);
    assert.ok(ultimo && ultimo.tipo === "error");
    assert.equal(ultimo.correlationId, ID_ERROR_RED);
    assert.match(ultimo.mensaje, /reintenta/i);
  });

  it("un HTTP de error también se avisa", async () => {
    globalThis.fetch = (async () => new Response("x", { status: 500 })) as typeof fetch;
    const recibidos: EventoChat[] = [];
    await chat("s-1", "hola", undefined, (e) => recibidos.push(e));
    assert.equal(recibidos[0]?.tipo, "error");
  });
});
