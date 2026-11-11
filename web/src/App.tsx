import { useEffect, useRef, useState } from "react";
import type { EventoAgente } from "../../src/domain/contratos";
import { chat, confirmar, evaluar, listarSolicitudes, SOLICITUDES_ESTATICAS } from "./api";
import { AvisoOc, BannerError, BloqueHerramientas, botonPrimario, botonSecundario, botonTexto, Mensaje, PanelResultado, TarjetaDecision } from "./componentes";
import { aplicarEvento, agregarMensajeUsuario, estadoInicial, resolverConfirmacion } from "./estado";
import type { Estado } from "./estado";
import { agruparItems } from "./vista";

const PREGUNTA_EJEMPLO = "¿Qué controles revisas antes de crear una orden de compra?";
const PASOS = [
  ["Elige una solicitud", "Abajo, junto al cuadro de mensaje."],
  ["Revísala", "Con IA, el asistente ejecuta los controles y te explica el resultado. Sin IA, se aplican solo las reglas."],
  ["Decide", "Si la solicitud es aprobable, tú eliges si se crea la orden de compra en SAP."],
] as const;

function Bienvenida({ onPreguntar }: { onPreguntar: (texto: string) => void }) {
  return (
    <div className="mx-auto max-w-md space-y-5 py-6">
      <h2 className="text-lg font-semibold">Revisa una solicitud de compra en 3 pasos</h2>
      <ol className="space-y-4">
        {PASOS.map(([titulo, texto], i) => (
          <li key={titulo} className="flex gap-3">
            <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-linea text-sm font-semibold tabular-nums text-acento">
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{titulo}</p>
              <p className="text-sm text-tenue">{texto}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-sm text-tenue">
        También puedes preguntar, por ejemplo:{" "}
        <button type="button" className={`${botonTexto} text-left`} onClick={() => onPreguntar(PREGUNTA_EJEMPLO)}>
          {PREGUNTA_EJEMPLO}
        </button>
      </p>
    </div>
  );
}

export function App() {
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [solicitudes, setSolicitudes] = useState<string[]>(SOLICITUDES_ESTATICAS);
  const [seleccion, setSeleccion] = useState(SOLICITUDES_ESTATICAS[0] ?? "");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listarSolicitudes().then((ids) => {
      setSolicitudes(ids);
      setSeleccion((s) => (ids.includes(s) ? s : (ids[0] ?? "")));
    });
  }, []);

  useEffect(() => {
    if (estado.items.length > 0) finRef.current?.scrollIntoView({ block: "end" });
  }, [estado.items.length, estado.confirmacion, ocupado]);

  const alEvento = (e: EventoAgente) => setEstado((s) => aplicarEvento(s, e));

  async function enviar(mensaje: string) {
    const limpio = mensaje.trim();
    if (!limpio || ocupado) return;
    setEstado((s) => agregarMensajeUsuario(s, limpio));
    setTexto("");
    setOcupado(true);
    await chat(estado.historial, limpio, alEvento);
    setOcupado(false);
  }

  async function revisarSinIa() {
    if (!seleccion || ocupado) return;
    setEstado((s) => agregarMensajeUsuario(s, `Revisar ${seleccion} sin IA`));
    setOcupado(true);
    await evaluar(seleccion, alEvento);
    setOcupado(false);
  }

  async function decidir(token: string, accion: "aprobar" | "rechazar") {
    const evento = await confirmar(token, accion);
    setEstado((s) => aplicarEvento(resolverConfirmacion(s), evento));
  }

  const vacio = estado.items.length === 0 && !estado.confirmacion;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <a href="#mensaje" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-papel focus:p-2">
        Ir al cuadro de mensaje
      </a>
      <header className="border-b border-linea bg-papel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="font-semibold">Asistente de órdenes de compra</h1>
            <p className="text-sm text-tenue">Revisa cada solicitud contra los controles de compra y crea la orden en SAP solo cuando tú lo confirmas.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-linea px-2.5 py-1 text-xs text-tenue">SAP simulado</span>
            {!vacio && (
              <button type="button" className={botonTexto} disabled={ocupado} onClick={() => setEstado(estadoInicial)}>
                Nueva conversación
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="flex min-h-[28rem] flex-col rounded-lg border border-linea bg-papel lg:min-h-0">
          <div role="log" aria-live="polite" aria-label="Conversación" className="flex-1 space-y-4 overflow-y-auto p-4">
            {vacio && <Bienvenida onPreguntar={(t) => void enviar(t)} />}
            {agruparItems(estado.items).map((b) => {
              if (b.tipo === "herramientas") return <BloqueHerramientas key={b.clave} tools={b.tools} />;
              const item = b.item;
              switch (item.tipo) {
                case "usuario":
                case "modelo":
                  return <Mensaje key={b.clave} rol={item.tipo} texto={item.texto} />;
                case "oc":
                  return <AvisoOc key={b.clave} orden={item.orden} />;
                case "error":
                  return <BannerError key={b.clave} mensaje={item.mensaje} correlationId={item.correlationId} />;
              }
            })}
            {estado.confirmacion && (
              <TarjetaDecision
                key={estado.confirmacion.token}
                confirmacion={estado.confirmacion}
                onDecidir={(a) => void decidir(estado.confirmacion?.token ?? "", a)}
              />
            )}
            {ocupado && (
              <p role="status" className="text-sm text-tenue motion-safe:animate-pulse">
                El asistente está trabajando…
              </p>
            )}
            <div ref={finRef} />
          </div>

          <div className="space-y-3 border-t border-linea p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span id="etiqueta-solicitud" className="text-sm text-tenue">
                Solicitud
              </span>
              <div role="group" aria-labelledby="etiqueta-solicitud" className="flex flex-wrap gap-1.5">
                {solicitudes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    translate="no"
                    aria-pressed={s === seleccion}
                    onClick={() => setSeleccion(s)}
                    className={`min-h-9 touch-manipulation rounded-full border px-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ${
                      s === seleccion ? "border-acento bg-acento-suave font-medium text-acento" : "border-linea text-tinta hover:bg-lienzo"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
                <button type="button" className={`${botonSecundario} flex-1 sm:flex-none`} disabled={!seleccion || ocupado} onClick={() => void revisarSinIa()}>
                  Revisar sin IA
                </button>
                <button
                  type="button"
                  className={`${botonPrimario} flex-1 sm:flex-none`}
                  disabled={!seleccion || ocupado}
                  onClick={() => void enviar(`Revisa la solicitud ${seleccion} y, si procede, crea la orden de compra.`)}
                >
                  Revisar con IA
                </button>
              </div>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void enviar(texto);
              }}
            >
              <label className="sr-only" htmlFor="mensaje">
                Mensaje para el asistente
              </label>
              <input
                id="mensaje"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe una pregunta sobre la solicitud…"
                autoComplete="off"
                maxLength={2000}
                className="min-h-10 min-w-0 flex-1 rounded-md border border-linea bg-papel px-3 text-sm placeholder:text-tenue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
              />
              <button type="submit" className={botonSecundario} disabled={ocupado}>
                Enviar
              </button>
            </form>
          </div>
        </main>

        <PanelResultado dictamen={estado.dictamen} orden={estado.orden} />
      </div>
    </div>
  );
}
