import { useState } from "react";
import type { Hallazgo, OrdenCompra, Validacion } from "../../src/domain/contratos-oc";
import type { Confirmacion, OcCreadaCaso } from "./estado";
import type { EstadoValidacion, ItemTool } from "./vista";
import {
  argumentosCompactos,
  estadoValidacion,
  etiquetaTool,
  formatearMonto,
  formatearNumero,
  formatearValor,
  limpiarMarkdown,
  resumenHerramientas,
  resumenResultado,
  totalOrden,
} from "./vista";

// Clases completas (Tailwind no detecta nombres armados dinámicamente).
const foco = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";
const baseBoton = `inline-flex min-h-10 max-sm:min-h-11 touch-manipulation items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${foco}`;
export const botonPrimario = `${baseBoton} bg-acento text-white hover:bg-acento-fuerte`;
export const botonSecundario = `${baseBoton} border border-linea bg-papel text-tinta hover:bg-lienzo`;
export const botonTexto = `rounded-md px-2 py-1 text-sm text-acento underline-offset-2 hover:underline disabled:opacity-50 ${foco}`;

interface Tono {
  texto: string;
  icono: string;
  clase: string;
}
const TONO_OK: Tono = { texto: "En orden", icono: "✓", clase: "bg-ok-suave text-ok" };
const TONO_ALERTA: Tono = { texto: "Alerta", icono: "!", clase: "bg-alerta-suave text-alerta" };
const TONO_BLOQUEO: Tono = { texto: "Bloquea", icono: "✕", clase: "bg-bloqueo-suave text-bloqueo" };
const TONO_VALIDACION: Record<EstadoValidacion, Tono> = {
  apta: { ...TONO_OK, texto: "Apta" },
  confirmacion: { ...TONO_ALERTA, texto: "Requiere confirmación" },
  bloqueada: { ...TONO_BLOQUEO, texto: "Bloqueada" },
};

function Icono({ tono }: { tono: Tono }) {
  return (
    <span aria-hidden="true" className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tono.clase}`}>
      {tono.icono}
    </span>
  );
}

export function Insignia({ estado }: { estado: EstadoValidacion }) {
  const tono = TONO_VALIDACION[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${tono.clase}`}>
      <span aria-hidden="true">{tono.icono}</span>
      {tono.texto}
    </span>
  );
}

const aTexto = (v: unknown): string => {
  try {
    return JSON.stringify(v, null, 2) ?? "undefined";
  } catch {
    return String(v);
  }
};

// ── Herramientas ───────────────────────────────────────────────────────────

function FilaHerramienta({ tool }: { tool: ItemTool }) {
  const r = tool.resultado;
  const tono: Tono = !r ? { texto: "En curso", icono: "…", clase: "bg-lienzo text-tenue" } : r.ok ? TONO_OK : { ...TONO_BLOQUEO, texto: "Error" };
  const args = argumentosCompactos(tool.entrada);
  return (
    <li>
      <details className="group">
        <summary className={`cursor-pointer list-none rounded px-2 py-1.5 hover:bg-lienzo ${foco}`}>
          <span className="flex items-center gap-2">
            <Icono tono={tono} />
            <span className="sr-only">{tono.texto}:</span>
            <span className="text-sm">{etiquetaTool(tool.nombre)}</span>
            <code translate="no" className="truncate text-xs text-tenue">{tool.nombre}</code>
            {r && <span className="ml-auto text-xs tabular-nums text-tenue">{r.ms} ms</span>}
          </span>
          <span className="mt-0.5 ml-7 block text-xs text-tenue">
            {args && <code translate="no" className="mr-2 break-words">{args}</code>}
            {r && <span className="font-medium text-tinta">{resumenResultado(tool.nombre, r.ok, r.salida)}</span>}
          </span>
        </summary>
        <div className="mt-1 mb-2 ml-9 space-y-2 text-xs">
          <p className="text-tenue">Entrada</p>
          <pre className="overflow-x-auto rounded bg-lienzo p-2 font-mono whitespace-pre-wrap break-words">{aTexto(tool.entrada)}</pre>
          {r && (
            <>
              <p className="text-tenue">Salida</p>
              <pre className="max-h-64 overflow-auto rounded bg-lienzo p-2 font-mono whitespace-pre-wrap break-words">{aTexto(r.salida)}</pre>
            </>
          )}
        </div>
      </details>
    </li>
  );
}

export function BloqueHerramientas({ tools }: { tools: ItemTool[] }) {
  return (
    <details open className="rounded-lg border border-linea">
      <summary className={`cursor-pointer px-3 py-2 text-sm text-tenue ${foco}`}>
        Herramientas usadas: <span className="tabular-nums">{resumenHerramientas(tools)}</span>
      </summary>
      <ul className="border-t border-linea p-1">
        {tools.map((t) => (
          <FilaHerramienta key={t.id} tool={t} />
        ))}
      </ul>
    </details>
  );
}

// ── Hallazgos (bloqueos y confirmaciones) ──────────────────────────────────

function ListaHallazgos({ hallazgos, tono }: { hallazgos: Hallazgo[]; tono: Tono }) {
  return (
    <ul className="space-y-3">
      {hallazgos.map((h, i) => (
        <li key={`${h.regla}-${i}`} className="flex gap-2.5">
          <Icono tono={tono} />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              <span translate="no" className="mr-1.5 rounded border border-linea px-1.5 py-0.5 font-mono text-xs">{h.regla}</span>
              <span className="sr-only">{tono.texto}: </span>
              {h.detalle}
            </p>
            {h.valores && Object.keys(h.valores).length > 0 && (
              <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm tabular-nums">
                {Object.entries(h.valores).map(([k, v]) => (
                  <div key={k} className="flex gap-1.5">
                    <dt className="text-tenue">{k}:</dt>
                    <dd className="font-medium">{formatearValor(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-sm text-tenue">{h.accion_sugerida}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Orden de compra «como quedaría en SAP» ─────────────────────────────────

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-tenue">{etiqueta}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export function TablaOrden({ orden }: { orden: OrdenCompra }) {
  return (
    <section aria-labelledby="titulo-orden" className="space-y-3">
      <h3 id="titulo-orden" className="text-sm font-semibold text-tenue">
        OC como quedaría en SAP
      </h3>
      <dl className="space-y-1">
        <Dato etiqueta="Proveedor">
          <span translate="no">{orden.proveedor.nombre}</span>
        </Dato>
        <Dato etiqueta="NIT">
          <span translate="no" className="tabular-nums">{orden.proveedor.nit}</span>
        </Dato>
        <Dato etiqueta="Código SAP">
          <span translate="no" className="tabular-nums">{orden.proveedor.codigo_sap}</span>
        </Dato>
        <Dato etiqueta="Moneda">{orden.moneda}</Dato>
        <Dato etiqueta="Condiciones de pago">
          <span translate="no">{orden.condiciones_pago}</span>
        </Dato>
        <Dato etiqueta="Aprobador">
          <span translate="no">{orden.aprobador.email}</span>
          <span className="block text-xs text-tenue">{orden.aprobador.fecha_aprobacion}</span>
        </Dato>
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Posiciones de la orden de compra</caption>
          <thead>
            <tr className="border-b border-linea text-xs text-tenue">
              <th scope="col" className="py-1 pr-2 font-medium">Posición</th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">Cant.</th>
              <th scope="col" className="py-1 text-right font-medium">Precio unit.</th>
            </tr>
          </thead>
          <tbody>
            {orden.posiciones.map((p) => (
              <tr key={p.numero} className="border-b border-linea align-top last:border-0">
                <td className="py-1.5 pr-2">
                  <span className="font-medium">
                    <span className="tabular-nums text-tenue">{p.numero}</span> {p.descripcion}
                  </span>
                  <span translate="no" className="block text-xs text-tenue">
                    {p.centro_costo} · {p.subarea} · IVA {p.indicador_iva}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatearNumero(p.cantidad)} {p.unidad}
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatearNumero(p.precio_unitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex justify-between text-sm font-semibold tabular-nums">
        <span>Total</span>
        <span>{formatearMonto(totalOrden(orden), orden.moneda)}</span>
      </p>
      {orden.excepciones.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-tenue">Excepciones</p>
          <ul className="space-y-1 text-sm">
            {orden.excepciones.map((x, i) => (
              <li key={`${x.codigo}-${i}`}>
                <span translate="no" className="mr-1.5 rounded border border-linea px-1.5 py-0.5 font-mono text-xs">{x.codigo}</span>
                {x.detalle}
                <span className="block text-xs text-tenue">{x.confirmado_por ? `Confirmada por ${x.confirmado_por}` : "Pendiente de confirmación"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── Panel lateral ──────────────────────────────────────────────────────────

function CartelOc({ oc }: { oc: OcCreadaCaso }) {
  return (
    <section aria-labelledby="titulo-oc" className="space-y-1 rounded-md bg-ok-suave px-3 py-3 text-ok">
      <h3 id="titulo-oc" className="text-xs font-medium">
        Orden de compra creada{oc.idempotente ? " · ya existía" : ""}
      </h3>
      <p className="text-3xl font-semibold tabular-nums">{oc.numero_oc}</p>
      <p className="text-sm tabular-nums">{oc.fecha}</p>
      {oc.evidencia && (
        <p className="text-xs break-all">
          Evidencia: <span translate="no" className="font-mono">{oc.evidencia}</span>
        </p>
      )}
      {oc.retroactiva && <p className="text-xs font-medium">Compra retroactiva</p>}
    </section>
  );
}

export function PanelResultado({ validacion, orden, ocCreada }: { validacion: Validacion | null; orden: OrdenCompra | null; ocCreada: OcCreadaCaso | null }) {
  return (
    <aside aria-labelledby="titulo-resultado" className="rounded-lg border border-linea bg-papel p-4 lg:overflow-y-auto">
      <h2 id="titulo-resultado" className="text-sm font-semibold text-tenue">
        Resultado de la revisión
      </h2>
      {!validacion ? (
        <p className="mt-3 text-sm text-tenue">Cuando revises un caso, aquí verás si está apta, qué bloquea o qué debes confirmar, y la OC tal como quedaría en SAP.</p>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-lg font-semibold" translate="no">{validacion.caso}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Insignia estado={estadoValidacion(validacion)} />
              {validacion.retroactiva && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${TONO_ALERTA.clase}`}>
                  <span aria-hidden="true">!</span>Compra retroactiva
                </span>
              )}
            </div>
          </div>
          {ocCreada && ocCreada.caso === validacion.caso && <CartelOc oc={ocCreada} />}
          {validacion.bloqueos.length > 0 && (
            <section aria-labelledby="titulo-bloqueos" className="space-y-2">
              <h3 id="titulo-bloqueos" className="text-sm font-semibold text-tenue">Bloqueos</h3>
              <ListaHallazgos hallazgos={validacion.bloqueos} tono={TONO_BLOQUEO} />
            </section>
          )}
          {validacion.confirmaciones.length > 0 && (
            <section aria-labelledby="titulo-confirmaciones" className="space-y-2">
              <h3 id="titulo-confirmaciones" className="text-sm font-semibold text-tenue">Confirmaciones</h3>
              <ListaHallazgos hallazgos={validacion.confirmaciones} tono={TONO_ALERTA} />
            </section>
          )}
          {validacion.bloqueos.length === 0 && validacion.confirmaciones.length === 0 && (
            <p className="text-sm text-tenue">Sin bloqueos ni confirmaciones pendientes.</p>
          )}
          {Object.keys(validacion.derivados).length > 0 && (
            <section aria-labelledby="titulo-derivados" className="space-y-1">
              <h3 id="titulo-derivados" className="text-sm font-semibold text-tenue">Completado desde maestros</h3>
              <dl className="space-y-1">
                {Object.entries(validacion.derivados).map(([k, v]) => (
                  <Dato key={k} etiqueta={k}>
                    <span translate="no">{v}</span>
                  </Dato>
                ))}
              </dl>
            </section>
          )}
          {orden && orden.referencia.solicitud_id === validacion.solicitud_id && <TablaOrden orden={orden} />}
        </div>
      )}
    </aside>
  );
}

// ── Decisión humana (CA3) ──────────────────────────────────────────────────

export function TarjetaDecision({ confirmacion, onConfirmar, onRechazar }: { confirmacion: Confirmacion; onConfirmar: () => void; onRechazar: () => void }) {
  const [elegida, setElegida] = useState<"si" | "no" | null>(null);
  const decidir = (cual: "si" | "no") => {
    if (elegida) return;
    setElegida(cual);
    (cual === "si" ? onConfirmar : onRechazar)();
  };
  return (
    <section aria-labelledby="titulo-decision" className="space-y-3 rounded-lg border-2 border-acento bg-acento-suave p-4">
      <h3 id="titulo-decision" className="font-semibold">
        Tu decisión sobre <span translate="no">{confirmacion.caso}</span>
      </h3>
      <p className="text-sm">Hay algo que solo tú puedes aceptar antes de crear la orden:</p>
      <ListaHallazgos hallazgos={confirmacion.confirmaciones} tono={TONO_ALERTA} />
      <p className="text-sm text-tenue">Si confirmas, se crea la OC en SAP (simulado). Nada se crea sin tu confirmación.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botonPrimario} disabled={elegida !== null} onClick={() => decidir("si")}>
          {elegida === "si" ? "Creando OC…" : "Confirmar y crear OC"}
        </button>
        <button type="button" className={botonSecundario} disabled={elegida !== null} onClick={() => decidir("no")}>
          No crear
        </button>
      </div>
    </section>
  );
}

// ── Chat ───────────────────────────────────────────────────────────────────

export function AvisoOc({ oc }: { oc: OcCreadaCaso }) {
  return (
    <div role="status" className="rounded-lg border border-ok/30 bg-ok-suave p-4 text-ok">
      <p className="text-sm font-medium">{oc.idempotente ? "La orden de compra ya existía" : "Orden de compra creada"}</p>
      <p className="text-2xl font-semibold tabular-nums">{oc.numero_oc}</p>
      <p className="text-sm">
        Caso <span translate="no">{oc.caso}</span> en SAP (simulado) · {oc.fecha}
      </p>
      {oc.evidencia && (
        <p className="text-xs break-all">
          Evidencia: <span translate="no" className="font-mono">{oc.evidencia}</span>
        </p>
      )}
      {oc.retroactiva && <p className="text-xs font-medium">Compra retroactiva</p>}
    </div>
  );
}

export function BannerError({ mensaje, correlationId, onReintentar }: { mensaje: string; correlationId: string; onReintentar?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-bloqueo/30 bg-bloqueo-suave p-3 text-sm text-bloqueo">
      <p className="font-medium">No se pudo completar</p>
      <p>{mensaje}</p>
      <p className="mt-1 text-xs">
        Código de seguimiento: <span className="font-mono" translate="no">{correlationId}</span>
      </p>
      {onReintentar && (
        <button type="button" className={`${botonSecundario} mt-2`} onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Mensaje({ rol, texto }: { rol: "usuario" | "modelo"; texto: string }) {
  if (rol === "usuario") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-lg bg-acento-suave px-3 py-2 text-sm whitespace-pre-wrap break-words">{texto}</p>
      </div>
    );
  }
  return <p className="max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap break-words">{limpiarMarkdown(texto)}</p>;
}
