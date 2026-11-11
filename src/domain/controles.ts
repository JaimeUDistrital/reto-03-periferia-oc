/**
 * Controles puros del dominio: sin I/O, sin reloj, sin azar. Mismo expediente → mismo resultado.
 * `severidad` es el estado con el que el control reporta cuando NO se cumple.
 * Dato faltante o ilegible = incumplimiento (nunca se da por bueno lo que no se pudo verificar).
 */
import type { Decision, EstadoControl, ResultadoControl } from "./contratos";
import type { Expediente } from "./modelo";

export interface Control {
  id: string;
  nombre: string;
  severidad: Exclude<EstadoControl, "OK">;
  evaluar(expediente: Expediente): ResultadoControl;
}

interface Verificacion {
  cumple: boolean;
  detalle: string;
  evidencia: Record<string, unknown>;
}

function definirControl(def: {
  id: string;
  nombre: string;
  severidad: Control["severidad"];
  verificar(expediente: Expediente): Verificacion;
}): Control {
  return {
    id: def.id,
    nombre: def.nombre,
    severidad: def.severidad,
    evaluar(expediente) {
      const v = def.verificar(expediente);
      return {
        id: def.id,
        nombre: def.nombre,
        estado: v.cumple ? "OK" : def.severidad,
        detalle: v.detalle,
        evidencia: v.evidencia,
      };
    },
  };
}

/** Tolerancia de redondeo: ±1 unidad monetaria. */
const TOLERANCIA = 1;
const cercano = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCIA;

const proveedor = definirControl({
  id: "CTRL-PROVEEDOR",
  nombre: "Proveedor existe y está activo",
  severidad: "BLOQUEO",
  verificar({ solicitud, maestros }) {
    const p = maestros.proveedores.find((x) => x.nit === solicitud.proveedorNit);
    if (!p) {
      return { cumple: false, detalle: "El proveedor no existe en el maestro.", evidencia: { nit: solicitud.proveedorNit } };
    }
    const cumple = p.estado === "activo";
    return {
      cumple,
      detalle: cumple ? "Proveedor activo." : `El proveedor está ${p.estado}.`,
      evidencia: { nit: p.nit, estadoProveedor: p.estado },
    };
  },
});

const cecoTope = definirControl({
  id: "CTRL-CECO-TOPE",
  nombre: "Centro de costo, aprobador y tope",
  severidad: "BLOQUEO",
  verificar({ solicitud, aprobacion, maestros }) {
    const centro = maestros.centrosCosto.find((c) => c.codigo === solicitud.centroCosto);
    if (!centro) {
      return { cumple: false, detalle: "El centro de costo no existe.", evidencia: { centroCosto: solicitud.centroCosto } };
    }
    const evidencia = {
      centroCosto: centro.codigo,
      lider: centro.lider.id,
      aprobador: aprobacion.aprobador,
      estadoAprobacion: aprobacion.estado,
      total: solicitud.total,
      tope: centro.lider.tope,
    };
    if (aprobacion.aprobador !== centro.lider.id) {
      return { cumple: false, detalle: "Quien aprobó no es el líder del centro de costo.", evidencia };
    }
    if (aprobacion.estado !== "aprobada") {
      return { cumple: false, detalle: `La aprobación está ${aprobacion.estado}.`, evidencia };
    }
    if (solicitud.total > centro.lider.tope) {
      return { cumple: false, detalle: "El total supera el tope del líder aprobador.", evidencia };
    }
    return { cumple: true, detalle: "Aprobada por el líder del centro y dentro de su tope.", evidencia };
  },
});

const iva = definirControl({
  id: "CTRL-IVA",
  nombre: "IVA coherente con el indicador",
  severidad: "ALERTA",
  verificar({ solicitud, cotizacion, maestros }) {
    const prov = maestros.proveedores.find((p) => p.nit === solicitud.proveedorNit);
    const codigo = cotizacion.indicadorIva ?? prov?.indicadorIva ?? null;
    const indicador = maestros.indicadoresIva.find((i) => i.codigo === codigo);
    const { subtotal, impuesto, total } = cotizacion;
    const evidencia = { indicador: codigo, subtotal, impuesto, total, tasa: indicador?.tasa ?? null };

    if (!indicador) {
      return { cumple: false, detalle: "El indicador de IVA no existe en el maestro.", evidencia };
    }
    if (subtotal === null || impuesto === null || total === null) {
      return { cumple: false, detalle: "La cotización no trae subtotal, impuesto y total legibles.", evidencia };
    }
    if (!cercano(impuesto, subtotal * indicador.tasa)) {
      return { cumple: false, detalle: "El impuesto no es subtotal × tasa.", evidencia };
    }
    if (!cercano(total, subtotal + impuesto)) {
      return { cumple: false, detalle: "El total no es subtotal + impuesto.", evidencia };
    }
    return { cumple: true, detalle: "Impuesto y total coherentes con la tasa del indicador.", evidencia };
  },
});

const condPago = definirControl({
  id: "CTRL-COND-PAGO",
  nombre: "Condición de pago válida",
  severidad: "ALERTA",
  verificar({ solicitud, cotizacion, maestros }) {
    const prov = maestros.proveedores.find((p) => p.nit === solicitud.proveedorNit);
    const codigo = solicitud.condicionPago;
    const evidencia = { solicitud: codigo, proveedor: prov?.condicionPago ?? null, cotizacion: cotizacion.condicionPago };

    if (!maestros.condicionesPago.some((c) => c.codigo === codigo)) {
      return { cumple: false, detalle: "La condición de pago no existe en el maestro.", evidencia };
    }
    const coincide = codigo === prov?.condicionPago || codigo === cotizacion.condicionPago;
    return {
      cumple: coincide,
      detalle: coincide ? "Coincide con la del proveedor o la cotización." : "No coincide con la del proveedor ni con la cotización.",
      evidencia,
    };
  },
});

const retroactiva = definirControl({
  id: "CTRL-RETROACTIVA",
  nombre: "Compra no retroactiva",
  severidad: "BLOQUEO",
  verificar({ solicitud, aprobacion, factura }) {
    if (!factura) {
      return { cumple: true, detalle: "No hay factura previa a la orden.", evidencia: {} };
    }
    const evidencia = {
      fechaFactura: factura.fecha,
      fechaSolicitud: solicitud.fecha,
      fechaAprobacion: aprobacion.fecha,
    };
    if (factura.fecha === null) {
      return { cumple: false, detalle: "La factura no tiene fecha legible: no se puede descartar una compra retroactiva.", evidencia };
    }
    // Fechas ISO: la comparación de texto equivale a la cronológica.
    const retroactiva = factura.fecha < solicitud.fecha || factura.fecha < aprobacion.fecha;
    return {
      cumple: !retroactiva,
      detalle: retroactiva
        ? "La factura es anterior a la solicitud o a la aprobación: compra retroactiva."
        : "La factura es posterior a la solicitud y a la aprobación.",
      evidencia,
    };
  },
});

const coherencia = definirControl({
  id: "CTRL-COHERENCIA",
  nombre: "Solicitud coherente con la cotización",
  severidad: "ALERTA",
  verificar({ solicitud, cotizacion }) {
    const evidencia = {
      nitSolicitud: solicitud.proveedorNit,
      nitCotizacion: cotizacion.nit,
      totalSolicitud: solicitud.total,
      totalCotizacion: cotizacion.total,
    };
    if (cotizacion.nit !== solicitud.proveedorNit) {
      return { cumple: false, detalle: "El proveedor de la cotización no coincide con el de la solicitud.", evidencia };
    }
    if (cotizacion.total === null || !cercano(cotizacion.total, solicitud.total)) {
      return { cumple: false, detalle: "El total de la cotización no coincide con el de la solicitud.", evidencia };
    }
    return { cumple: true, detalle: "Proveedor y total coinciden con la cotización.", evidencia };
  },
});

export const CONTROLES: readonly Control[] = [proveedor, cecoTope, iva, condPago, retroactiva, coherencia];

/** Única regla de decisión (se ajusta en B1 con el PRD). */
export function decidir(controles: readonly ResultadoControl[]): Decision {
  if (controles.some((c) => c.estado === "BLOQUEO")) return "RECHAZADA";
  if (controles.some((c) => c.estado === "ALERTA")) return "REQUIERE_REVISION";
  return "APROBABLE";
}
