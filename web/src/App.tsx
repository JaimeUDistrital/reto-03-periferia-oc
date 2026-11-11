import { useEffect, useState } from "react";
import type { EventoAgente } from "../../src/domain/contratos";
import { chat, confirmar, evaluar, listarSolicitudes, SOLICITUDES_ESTATICAS } from "./api";
import { AvisoOc, BannerError, boton, Burbuja, Expediente, TarjetaHitl, TarjetaTool } from "./componentes";
import { aplicarEvento, agregarMensajeUsuario, estadoInicial, resolverConfirmacion } from "./estado";
import type { Estado } from "./estado";

export function App() {
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [solicitudes, setSolicitudes] = useState<string[]>(SOLICITUDES_ESTATICAS);
  const [seleccion, setSeleccion] = useState("");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void listarSolicitudes().then(setSolicitudes);
  }, []);

  const alEvento = (e: EventoAgente) => setEstado((s) => aplicarEvento(s, e));

  async function enviar(mensaje: string) {
    const limpio = mensaje.trim();
    if (!limpio || ocupado) return;
    const base = agregarMensajeUsuario(estado, limpio);
    setEstado(base);
    setTexto("");
    setOcupado(true);
    await chat(estado.historial, limpio, alEvento);
    setOcupado(false);
  }

  async function evaluarSinIa() {
    if (!seleccion || ocupado) return;
    setEstado((s) => agregarMensajeUsuario(s, `Evaluar sin IA ${seleccion}`));
    setOcupado(true);
    await evaluar(seleccion, alEvento);
    setOcupado(false);
  }

  async function decidir(token: string, accion: "aprobar" | "rechazar") {
    const evento = await confirmar(token, accion);
    setEstado((s) => aplicarEvento(resolverConfirmacion(s), evento));
  }

  function elegir(id: string) {
    setSeleccion(id);
    setTexto(id ? `Valida la solicitud ${id}` : "");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="space-y-3">
          <h1 className="text-lg font-semibold">Agente de órdenes de compra</h1>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Solicitud
              <select
                value={seleccion}
                onChange={(e) => elegir(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-300"
              >
                <option value="">Elige una…</option>
                {solicitudes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={boton} disabled={!seleccion || ocupado} onClick={() => void evaluarSinIa()}>
              Evaluar sin IA
            </button>
          </div>
        </header>

        <div
          role="log"
          aria-live="polite"
          aria-label="Conversación"
          className="flex min-h-64 flex-1 flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3"
        >
          {estado.items.length === 0 && (
            <p className="text-sm text-zinc-500">Elige una solicitud o escribe un mensaje para empezar.</p>
          )}
          {estado.items.map((item, i) => {
            switch (item.tipo) {
              case "usuario":
              case "modelo":
                return <Burbuja key={i} rol={item.tipo} texto={item.texto} />;
              case "tool":
                return <TarjetaTool key={`${item.id}-${i}`} item={item} />;
              case "oc":
                return <AvisoOc key={i} orden={item.orden} />;
              case "error":
                return <BannerError key={i} mensaje={item.mensaje} correlationId={item.correlationId} />;
            }
          })}
          {estado.confirmacion && (
            <TarjetaHitl
              key={estado.confirmacion.token}
              confirmacion={estado.confirmacion}
              onDecidir={(a) => void decidir(estado.confirmacion?.token ?? "", a)}
            />
          )}
          {ocupado && <p className="font-mono text-xs text-zinc-500">Trabajando…</p>}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
        >
          <label className="sr-only" htmlFor="mensaje">
            Mensaje
          </label>
          <input
            id="mensaje"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un mensaje…"
            maxLength={2000}
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-zinc-300"
          />
          <button type="submit" className={boton} disabled={ocupado || !texto.trim()}>
            Enviar
          </button>
        </form>
      </main>
      <div className="lg:w-80 lg:shrink-0">
        <Expediente dictamen={estado.dictamen} />
      </div>
    </div>
  );
}
