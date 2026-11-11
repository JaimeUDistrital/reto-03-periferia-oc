import { useState } from "react";
import type { Decision, Dictamen, EstadoControl, OrdenCompra } from "../../src/domain/contratos";
import type { Confirmacion, Item } from "./estado";

// Clases completas (Tailwind no detecta nombres armados dinámicamente).
const COLOR_CONTROL: Record<EstadoControl, string> = {
  OK: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  ALERTA: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  BLOQUEO: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};
const COLOR_DECISION: Record<Decision, string> = {
  APROBABLE: COLOR_CONTROL.OK,
  REQUIERE_REVISION: COLOR_CONTROL.ALERTA,
  RECHAZADA: COLOR_CONTROL.BLOQUEO,
};
const TEXTO_DECISION: Record<Decision, string> = {
  APROBABLE: "Aprobable",
  REQUIERE_REVISION: "Requiere revisión",
  RECHAZADA: "Rechazada",
};

const foco = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300";
export const boton = `rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 ${foco}`;

function Etiqueta({ clase, children }: { clase: string; children: string }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-xs ${clase}`}>{children}</span>;
}

const aTexto = (v: unknown): string => {
  try {
    return JSON.stringify(v, null, 2) ?? "undefined";
  } catch {
    return String(v);
  }
};

export function TarjetaTool({ item }: { item: Extract<Item, { tipo: "tool" }> }) {
  const r = item.resultado;
  const estado = !r ? "en curso" : r.ok ? "ok" : "error";
  const color = !r ? "text-zinc-400" : r.ok ? "text-emerald-400" : "text-rose-400";
  return (
    <details className="rounded-md border border-zinc-800 bg-zinc-900/50 font-mono text-xs">
      <summary className={`cursor-pointer select-none px-3 py-2 ${foco}`}>
        <span className="text-zinc-200">{item.nombre}</span>{" "}
        <span className={color}>{estado}</span>
        {r && <span className="text-zinc-500"> · {r.ms} ms</span>}
      </summary>
      <div className="space-y-2 border-t border-zinc-800 p-3">
        <p className="text-zinc-500">entrada</p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-zinc-300">{aTexto(item.entrada)}</pre>
        {r && (
          <>
            <p className="text-zinc-500">salida</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-zinc-300">{aTexto(r.salida)}</pre>
          </>
        )}
      </div>
    </details>
  );
}

export function MatrizControles({ dictamen }: { dictamen: Dictamen }) {
  return (
    <ul className="space-y-2">
      {dictamen.controles.map((c) => (
        <li key={c.id} className={`rounded-md border p-2 ${COLOR_CONTROL[c.estado]}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{c.nombre}</span>
            <span className="font-mono text-xs">{c.estado}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-300">{c.detalle}</p>
        </li>
      ))}
    </ul>
  );
}

export function Expediente({ dictamen }: { dictamen: Dictamen | null }) {
  return (
    <aside aria-label="Expediente" className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-sm font-semibold text-zinc-200">Expediente</h2>
      {dictamen ? (
        <>
          <p className="font-mono text-xs text-zinc-400">{dictamen.solicitudId}</p>
          <Etiqueta clase={COLOR_DECISION[dictamen.decision]}>{TEXTO_DECISION[dictamen.decision]}</Etiqueta>
          <MatrizControles dictamen={dictamen} />
          <p className="break-all font-mono text-[10px] text-zinc-600">hash {dictamen.hash}</p>
        </>
      ) : (
        <p className="text-sm text-zinc-500">Aún no hay un dictamen. Valida una solicitud para verlo aquí.</p>
      )}
    </aside>
  );
}

export function TarjetaHitl({ confirmacion, onDecidir }: { confirmacion: Confirmacion; onDecidir: (accion: "aprobar" | "rechazar") => void }) {
  const [decidida, setDecidida] = useState(false);
  const decidir = (accion: "aprobar" | "rechazar") => {
    if (decidida) return;
    setDecidida(true);
    onDecidir(accion);
  };
  const d = confirmacion.dictamen;
  return (
    <section aria-label="Confirmación requerida" className="space-y-3 rounded-lg border border-amber-500/40 bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">
        Confirmación requerida · <span className="font-mono">{confirmacion.solicitudId}</span>
      </h3>
      <Etiqueta clase={COLOR_DECISION[d.decision]}>{TEXTO_DECISION[d.decision]}</Etiqueta>
      <MatrizControles dictamen={d} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${boton} border-emerald-600 text-emerald-300`} disabled={decidida} onClick={() => decidir("aprobar")}>
          Aprobar y crear OC
        </button>
        <button type="button" className={`${boton} border-rose-700 text-rose-300`} disabled={decidida} onClick={() => decidir("rechazar")}>
          Rechazar
        </button>
      </div>
    </section>
  );
}

export function AvisoOc({ orden }: { orden: OrdenCompra }) {
  return (
    <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
      Orden de compra creada: <span className="font-mono font-semibold">{orden.numero}</span> · solicitud{" "}
      <span className="font-mono">{orden.solicitudId}</span>
    </div>
  );
}

export function BannerError({ mensaje, correlationId }: { mensaje: string; correlationId: string }) {
  return (
    <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
      <p>{mensaje}</p>
      <p className="mt-1 font-mono text-xs text-rose-400/80">correlationId: {correlationId}</p>
    </div>
  );
}

export function Burbuja({ rol, texto }: { rol: "usuario" | "modelo"; texto: string }) {
  const esUsuario = rol === "usuario";
  return (
    <div className={esUsuario ? "flex justify-end" : "flex justify-start"}>
      <p
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm ${
          esUsuario ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "border-zinc-800 bg-zinc-900 text-zinc-200"
        }`}
      >
        {texto}
      </p>
    </div>
  );
}
