import { useEffect, useMemo, useRef, useState } from "react";
import type { EventoChat } from "../../src/domain/contratos-oc";
import { CASOS_ESTATICOS, chat, evaluar, listarCasos } from "./api";
import { AvisoOc, BannerError, BloqueHerramientas, botonPrimario, botonSecundario, botonTexto, Mensaje, PanelResultado, TarjetaDecision } from "./componentes";
import { aplicarEvento, agregarMensajeUsuario, estadoInicial } from "./estado";
import type { Estado } from "./estado";
import { crearSesion } from "./sesion";
import type { Almacen } from "./sesion";
import { agruparItems, esConfirmacion, ID_ERROR_RED, mensajeConfirmar, mensajeNoConfirmar, mensajeProcesar, PROMPT_DEMO } from "./vista";

const PREGUNTA_EJEMPLO = "¿Qué controles revisas antes de crear una orden de compra?";
const PASOS = [
  ["Elige un caso", "Abajo, con los botones sol-001 a sol-006."],
  ["Revísalo", "Con IA, el asistente lee el paquete, valida y prepara la OC. Sin IA, se aplican solo las reglas."],
  ["Decide", "Si el caso está limpio, la OC se crea sola. Si hay confirmaciones, decides tú; si hay bloqueos, no se crea."],
] as const;

function almacenDePestana(): Almacen | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function Bienvenida({ onEnviar }: { onEnviar: (texto: string, caso?: string) => void }) {
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
      <div className="space-y-2 text-sm text-tenue">
        <p>Prueba, por ejemplo:</p>
        <ul className="space-y-1">
          <li>
            <button type="button" className={`${botonTexto} text-left`} onClick={() => onEnviar(PROMPT_DEMO, "sol-004")}>
              {PROMPT_DEMO}
            </button>
          </li>
          <li>
            <button type="button" className={`${botonTexto} text-left`} onClick={() => onEnviar(PREGUNTA_EJEMPLO)}>
              {PREGUNTA_EJEMPLO}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function App() {
  const sesion = useMemo(() => crearSesion(almacenDePestana()), []);
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [casos, setCasos] = useState<string[]>(CASOS_ESTATICOS);
  const [seleccion, setSeleccion] = useState(CASOS_ESTATICOS[0] ?? "");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const reintentoRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    void listarCasos().then((ids) => {
      setCasos(ids);
      setSeleccion((s) => (ids.includes(s) ? s : (ids[0] ?? "")));
    });
  }, []);

  useEffect(() => {
    if (estado.items.length > 0) finRef.current?.scrollIntoView({ block: "end" });
  }, [estado.items.length, estado.confirmacion, ocupado]);

  const alEvento = (e: EventoChat) => setEstado((s) => aplicarEvento(s, e));

  async function ejecutar(visible: string, turno: () => Promise<void>, repetir = false) {
    if (ocupado) return;
    reintentoRef.current = () => ejecutar(visible, turno, true);
    if (!repetir) setEstado((s) => agregarMensajeUsuario(s, visible));
    setOcupado(true);
    await turno();
    setOcupado(false);
  }

  /** `confirmar`: caso que el usuario confirma (tarjeta o «sí» claro). Sin él, nada se confirma. */
  async function enviar(mensaje: string, confirmar?: string) {
    const limpio = mensaje.trim();
    if (!limpio || ocupado) return;
    setTexto("");
    await ejecutar(limpio, () => chat(sesion.actual(), limpio, confirmar, alEvento));
  }

  async function enviarTexto(mensaje: string) {
    const pendiente = estado.confirmacion;
    await enviar(mensaje, pendiente && esConfirmacion(mensaje) ? pendiente.caso : undefined);
  }

  async function revisarSinIa() {
    if (!seleccion || ocupado) return;
    await ejecutar(`Revisar ${seleccion} sin IA`, () => evaluar(seleccion, alEvento));
  }

  function nuevaConversacion() {
    sesion.nueva();
    reintentoRef.current = null;
    setEstado(estadoInicial);
  }

  async function desdeBienvenida(mensaje: string, caso?: string) {
    if (caso) setSeleccion(caso);
    await enviar(mensaje);
  }

  const vacio = estado.items.length === 0 && !estado.confirmacion;
  const bloques = agruparItems(estado.items);

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <a href="#mensaje" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-papel focus:p-2">
        Ir al cuadro de mensaje
      </a>
      <header className="border-b border-linea bg-papel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="font-semibold">Asistente de órdenes de compra</h1>
            <p className="text-sm text-tenue">Revisa cada solicitud contra los controles de compra y crea la orden en SAP cuando el caso está limpio o tú lo confirmas.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-linea px-2.5 py-1 text-xs text-tenue">SAP simulado</span>
            {!vacio && (
              <button type="button" className={botonTexto} disabled={ocupado} onClick={nuevaConversacion}>
                Nueva conversación
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <main className="flex min-h-[28rem] flex-col rounded-lg border border-linea bg-papel lg:min-h-0">
          <div role="log" aria-live="polite" aria-label="Conversación" className="flex-1 space-y-4 overflow-y-auto p-4">
            {vacio && <Bienvenida onEnviar={(t, c) => void desdeBienvenida(t, c)} />}
            {bloques.map((b) => {
              if (b.tipo === "herramientas") return <BloqueHerramientas key={b.clave} tools={b.tools} />;
              const item = b.item;
              switch (item.tipo) {
                case "usuario":
                case "modelo":
                  return <Mensaje key={b.clave} rol={item.tipo} texto={item.texto} />;
                case "oc":
                  return <AvisoOc key={b.clave} oc={item.oc} />;
                case "error": {
                  const reintentable = b === bloques.at(-1) && item.correlationId === ID_ERROR_RED && !ocupado && reintentoRef.current !== null;
                  return (
                    <BannerError
                      key={b.clave}
                      mensaje={item.mensaje}
                      correlationId={item.correlationId}
                      {...(reintentable ? { onReintentar: () => void reintentoRef.current?.() } : {})}
                    />
                  );
                }
              }
            })}
            {estado.confirmacion && (
              <TarjetaDecision
                key={estado.confirmacion.caso}
                confirmacion={estado.confirmacion}
                onConfirmar={() => void enviar(mensajeConfirmar(estado.confirmacion?.caso ?? ""), estado.confirmacion?.caso)}
                onRechazar={() => void enviar(mensajeNoConfirmar(estado.confirmacion?.caso ?? ""))}
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
                Caso
              </span>
              <div role="group" aria-labelledby="etiqueta-solicitud" className="flex flex-wrap gap-1.5">
                {casos.map((s) => (
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
                  onClick={() => void enviar(mensajeProcesar(seleccion))}
                >
                  Procesar con IA
                </button>
              </div>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void enviarTexto(texto);
              }}
            >
              <label className="sr-only" htmlFor="mensaje">
                Mensaje para el asistente
              </label>
              <input
                id="mensaje"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe un mensaje… (también puedes confirmar con «Confirmo»)"
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

        <PanelResultado validacion={estado.validacion} orden={estado.orden} ocCreada={estado.ocCreada} />
      </div>
    </div>
  );
}
