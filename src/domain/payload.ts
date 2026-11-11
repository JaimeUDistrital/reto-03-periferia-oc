/** Construcción de la OrdenCompra (HU-3, PRD §7.4) con trazabilidad campo → fuente. Pura: sin E/S. */
import { OrdenCompraSchema, type OrdenCompra, type Validacion } from "./contratos-oc";
import { shaEvidencia } from "./evidencia";
import { proveedorDe } from "./reglas";
import { ErrorEntrada, type Maestros, type Paquete } from "./tipos";

export type Trazabilidad = Record<string, string>;

const LIMITE_TEXTO_BREVE = 40;

/** «H» si la descripción habla de horas; si no, «UN». «MES» no se infiere: el PRD no da criterio fiable. */
export function unidadDe(descripcion: string): "UN" | "H" {
  return /\bhoras?\b/i.test(descripcion) ? "H" : "UN";
}

export function construirOrden(p: Paquete, v: Validacion, m: Maestros): { orden: OrdenCompra; trazabilidad: Trazabilidad } {
  const proveedor = proveedorDe(p, m);
  const s = p.solicitud;
  const condiciones = s.condiciones_pago ?? v.derivados["condiciones_pago"];
  const iva = s.indicador_iva ?? v.derivados["indicador_iva"];
  if (proveedor === null || p.aprobacion === null || condiciones === undefined || iva === undefined) {
    throw new ErrorEntrada("No se puede construir la OC: faltan proveedor, aprobación, condiciones de pago o indicador de IVA.", "Resuelve primero los bloqueos de oc_validar.");
  }

  const orden = OrdenCompraSchema.parse({
    referencia: { solicitud_id: s.solicitud_id, correo_id: p.correo.id, cotizacion_ref: p.cotizacion?.referencia ?? null },
    sociedad: "1000",
    organizacion_compras: "1000",
    proveedor: { codigo_sap: proveedor.codigo_sap, nit: proveedor.nit, nombre: proveedor.nombre },
    moneda: s.moneda,
    condiciones_pago: condiciones,
    aprobador: { email: p.aprobacion.de, fecha_aprobacion: p.aprobacion.fecha, evidencia_sha256: shaEvidencia(p.aprobacion) },
    posiciones: [
      {
        numero: 10,
        descripcion: s.descripcion.slice(0, LIMITE_TEXTO_BREVE),
        cantidad: s.cantidad,
        unidad: unidadDe(s.descripcion),
        precio_unitario: s.valor_unitario,
        centro_costo: s.centro_costo,
        subarea: s.subarea,
        indicador_iva: iva,
      },
    ],
    excepciones: v.confirmaciones.map((h) => ({ codigo: h.regla, detalle: h.detalle, confirmado_por: null })),
  });

  const trazabilidad: Trazabilidad = {
    "referencia.solicitud_id": "solicitud",
    "referencia.correo_id": "correo",
    "referencia.cotizacion_ref": "cotizacion",
    sociedad: "constante",
    organizacion_compras: "constante",
    "proveedor.codigo_sap": "maestro.proveedores",
    "proveedor.nit": "maestro.proveedores",
    "proveedor.nombre": "maestro.proveedores",
    moneda: "solicitud",
    condiciones_pago: s.condiciones_pago ? "solicitud" : "derivado",
    "aprobador.email": "aprobacion",
    "aprobador.fecha_aprobacion": "aprobacion",
    "aprobador.evidencia_sha256": "derivado",
    "posiciones.0.numero": "constante",
    "posiciones.0.descripcion": "solicitud",
    "posiciones.0.cantidad": "solicitud",
    "posiciones.0.unidad": "derivado",
    "posiciones.0.precio_unitario": "solicitud",
    "posiciones.0.centro_costo": "solicitud",
    "posiciones.0.subarea": "solicitud",
    "posiciones.0.indicador_iva": s.indicador_iva ? "solicitud" : "derivado",
    excepciones: "derivado",
  };
  return { orden, trazabilidad };
}
