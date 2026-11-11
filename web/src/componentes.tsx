import { useState } from "react";
import type { Decision, Dictamen, EstadoControl, OrdenCompra } from "../../src/domain/contratos";
import type { Confirmacion } from "./estado";
import type { ItemTool } from "./vista";
import { etiquetaTool, limpiarMarkdown, resumenControles, resumenHerramientas } from "./vista";

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
const TONO_CONTROL: Record<EstadoControl, Tono> = {
  OK: { texto: "En orden", icono: "✓", clase: "bg-ok-suave text-ok" },
  ALERTA: { texto: "Alerta", icono: "!", clase: "bg-alerta-suave text-alerta" },
  BLOQUEO: { texto: "Bloquea", icono: "✕", clase: "bg-bloqueo-suave text-bloqueo" },
};
const TONO_DECISION: Record<Decision, Tono> = {
  APROBABLE: { ...TONO_CONTROL.OK, texto: "Aprobable" },
  REQUIERE_REVISION: { ...TONO_CONTROL.ALERTA, texto: "Requiere revisión" },
  RECHAZADA: { ...TONO_CONTROL.BLOQUEO, texto: "Rechazada" },
};

function Icono({ tono }: { tono: Tono }) {
  return (
    <span aria-hidden="true" className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tono.clase}`}>
      {tono.icono}
    </span>
  );
}

export function Insignia({ decision }: { decision: Decision }) {
  const tono = TONO_DECISION[decision];
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

function FilaHerramienta({ tool }: { tool: ItemTool }) {
  const r = tool.resultado;
  const tono: Tono = !r ? { texto: "En curso", icono: "…", clase: "bg-lienzo text-tenue" } : r.ok ? TONO_CONTROL.OK : { ...TONO_CONTROL.BLOQUEO, texto: "Error" };
  return (
    <li>
      <details className="group">
        <summary className={`flex cursor-pointer list-none items-center gap-2 rounded px-2 py-1.5 hover:bg-lienzo ${foco}`}>
          <Icono tono={tono} />
          <span className="sr-only">{tono.texto}:</span>
          <span className="text-sm">{etiquetaTool(tool.nombre)}</span>
          <code translate="no" className="hidden truncate text-xs text-tenue sm:inline">{tool.nombre}</code>
          {r && <span className="ml-auto text-xs tabular-nums text-tenue">{r.ms} ms</span>}
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

export function ListaControles({ dictamen }: { dictamen: Dictamen }) {
  return (
    <ul className="space-y-3">
      {dictamen.controles.map((c) => (
        <li key={c.id} className="flex gap-2.5">
          <Icono tono={TONO_CONTROL[c.estado]} />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {c.nombre}
              <span className="sr-only">: {TONO_CONTROL[c.estado].texto}</span>
            </p>
            <p className="text-sm text-tenue">{c.detalle}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PanelResultado({ dictamen, orden }: { dictamen: Dictamen | null; orden: OrdenCompra | null }) {
  const ordenDeEsta = orden && dictamen && orden.solicitudId === dictamen.solicitudId ? orden : null;
  return (
    <aside aria-labelledby="titulo-resultado" className="rounded-lg border border-linea bg-papel p-4 lg:overflow-y-auto">
      <h2 id="titulo-resultado" className="text-sm font-semibold text-tenue">
        Resultado de la revisión
      </h2>
      {!dictamen ? (
        <p className="mt-3 text-sm text-tenue">Cuando revises una solicitud, aquí verás cada control y si está en orden.</p>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-lg font-semibold" translate="no">{dictamen.solicitudId}</p>
            <Insignia decision={dictamen.decision} />
            <p className="text-sm text-tenue tabular-nums">{resumenControles(dictamen)}</p>
          </div>
          {ordenDeEsta && (
            <p className="rounded-md bg-ok-suave px-3 py-2 text-sm text-ok">
              Orden de compra <span className="font-semibold tabular-nums">{ordenDeEsta.numero}</span>
            </p>
          )}
          <ListaControles dictamen={dictamen} />
          <details className="text-xs text-tenue">
            <summary className={`cursor-pointer ${foco}`}>Detalles técnicos</summary>
            <p className="mt-1 break-all font-mono" translate="no">Huella del dictamen: {dictamen.hash}</p>
          </details>
        </div>
      )}
    </aside>
  );
}

type Accion = "aprobar" | "rechazar";

export function TarjetaDecision({ confirmacion, onDecidir }: { confirmacion: Confirmacion; onDecidir: (accion: Accion) => void }) {
  const [elegida, setElegida] = useState<Accion | null>(null);
  const decidir = (accion: Accion) => {
    if (elegida) return;
    setElegida(accion);
    onDecidir(accion);
  };
  const d = confirmacion.dictamen;
  return (
    <section aria-labelledby="titulo-decision" className="space-y-3 rounded-lg border-2 border-acento bg-acento-suave p-4">
      <h3 id="titulo-decision" className="font-semibold">
        Tu decisión sobre <span translate="no">{confirmacion.solicitudId}</span>
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <Insignia decision={d.decision} />
        <span className="text-sm tabular-nums">{resumenControles(d)}</span>
      </div>
      <p className="text-sm text-tenue">Si confirmas, se crea la orden de compra en SAP (simulado). Nada se crea sin tu confirmación.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botonPrimario} disabled={elegida !== null} onClick={() => decidir("aprobar")}>
          {elegida === "aprobar" ? "Creando orden…" : "Crear orden de compra"}
        </button>
        <button type="button" className={botonSecundario} disabled={elegida !== null} onClick={() => decidir("rechazar")}>
          No crear
        </button>
      </div>
    </section>
  );
}

export function AvisoOc({ orden }: { orden: OrdenCompra }) {
  return (
    <div role="status" className="rounded-lg border border-ok/30 bg-ok-suave p-4 text-ok">
      <p className="text-sm font-medium">Orden de compra creada</p>
      <p className="text-2xl font-semibold tabular-nums">{orden.numero}</p>
      <p className="text-sm">
        Solicitud <span translate="no">{orden.solicitudId}</span> en SAP (simulado)
      </p>
    </div>
  );
}

export function BannerError({ mensaje, correlationId }: { mensaje: string; correlationId: string }) {
  return (
    <div role="alert" className="rounded-lg border border-bloqueo/30 bg-bloqueo-suave p-3 text-sm text-bloqueo">
      <p className="font-medium">No se pudo completar</p>
      <p>{mensaje}</p>
      <p className="mt-1 text-xs">
        Código de seguimiento: <span className="font-mono" translate="no">{correlationId}</span>
      </p>
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
