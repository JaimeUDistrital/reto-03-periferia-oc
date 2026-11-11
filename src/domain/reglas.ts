/** Reglas de control RC1–RC10 (PRD §7.3). Funciones puras: paquete + maestros → Validacion. */
import type { Hallazgo, Regla, Validacion } from "./contratos-oc";
import { formatoMonto, formatoPorcentaje, normalizarNit, normalizarNombre, soloFecha } from "./texto";
import type { CentroCosto, Maestros, Paquete, Proveedor } from "./tipos";

const TOLERANCIA_COTIZACION = 0.02; // RC5
const TOLERANCIA_ARITMETICA = 1; // RC10, en unidades monetarias

type Evaluacion = { bloqueos: Hallazgo[]; confirmaciones: Hallazgo[] };

const hallazgo = (regla: Regla, detalle: string, accion_sugerida: string, valores?: Record<string, unknown>): Hallazgo =>
  valores === undefined ? { regla, detalle, accion_sugerida } : { regla, detalle, accion_sugerida, valores };

function buscarProveedor(p: Paquete, m: Maestros): Proveedor | null {
  const nit = p.solicitud.proveedor_nit;
  if (nit !== undefined && nit.trim() !== "") {
    return m.proveedores.find((x) => normalizarNit(x.nit) === normalizarNit(nit)) ?? null;
  }
  const nombre = normalizarNombre(p.solicitud.proveedor_nombre);
  return m.proveedores.find((x) => normalizarNombre(x.nombre) === nombre) ?? null;
}

/** RC1 */
function rc1(p: Paquete, proveedor: Proveedor | null): Hallazgo[] {
  const { proveedor_nombre, proveedor_nit } = p.solicitud;
  const cual = proveedor_nit ? `NIT ${proveedor_nit}` : `nombre «${proveedor_nombre}» (la solicitud no trae NIT)`;
  if (proveedor === null) {
    return [
      hallazgo(
        "RC1",
        `El proveedor ${proveedor_nombre} (${cual}) no existe en el maestro de proveedores.`,
        "Pide al solicitante que confirme el NIT o que el proveedor se dé de alta en el maestro antes de crear la OC.",
        { nit: proveedor_nit ?? null, nombre: proveedor_nombre },
      ),
    ];
  }
  if (!proveedor.activo) {
    return [
      hallazgo(
        "RC1",
        `El proveedor ${proveedor.nombre} (código SAP ${proveedor.codigo_sap}) está inactivo en el maestro.`,
        "Pide a compras que reactive al proveedor o que el solicitante elija otro proveedor activo.",
        { codigo_sap: proveedor.codigo_sap, activo: false },
      ),
    ];
  }
  return [];
}

function centrosDelAprobador(email: string, m: Maestros): CentroCosto[] {
  return m.centros.filter((c) => c.aprobadores.some((a) => a.email.toLowerCase() === email.toLowerCase()));
}

function sugerenciaAprobadorAjeno(p: Paquete, m: Maestros, centro: CentroCosto | null, de: string): string {
  const { valor_total, moneda } = p.solicitud;
  const otros = centrosDelAprobador(de, m).map((c) => c.centro_costo + (c.nombre ? ` (${c.nombre})` : ""));
  const pedir = centro === null ? "pide al solicitante un centro de costo válido" : pedirAprobacion(centro, valor_total, moneda);
  return otros.length > 0 ? `Verifica si el centro correcto es ${otros.join(" o ")}, o ${pedir}.` : `${pedir[0]?.toUpperCase()}${pedir.slice(1)}.`;
}

function pedirAprobacion(centro: CentroCosto, total: number, moneda: string): string {
  const conTope = centro.aprobadores.filter((a) => a.tope >= total);
  if (conTope.length > 0) return `pide la aprobación de ${conTope.map((a) => a.email).join(" o ")}`;
  const lista = centro.aprobadores.map((a) => `${a.email} con tope ${formatoMonto(a.tope, moneda)}`).join(", ");
  const quien = centro.aprobadores.length === 1 ? "el único aprobador" : "ningún aprobador";
  return `pide una aprobación con tope suficiente: ${quien} de ${centro.centro_costo} (${lista}) no cubre ${formatoMonto(total, moneda)}`;
}

/** RC2: devuelve el hallazgo y si el aprobador pertenece al centro (para decidir RC3). */
function rc2(p: Paquete, m: Maestros, centro: CentroCosto | null): { hallazgos: Hallazgo[]; aprobadorTope: number | null } {
  const ap = p.aprobacion;
  if (ap === null) {
    return {
      aprobadorTope: null,
      hallazgos: [hallazgo("RC2", "No hay correo de aprobación en el paquete.", "Pide al solicitante el correo de aprobación de su líder.")],
    };
  }
  if (!ap.aprobado) {
    return {
      aprobadorTope: null,
      hallazgos: [
        hallazgo("RC2", `El correo de ${ap.de} no contiene la palabra «Aprobado».`, "Pide al líder que responda el correo con «Aprobado» explícito.", { de: ap.de }),
      ],
    };
  }
  const aprobador = centro?.aprobadores.find((a) => a.email.toLowerCase() === ap.de.toLowerCase()) ?? null;
  if (aprobador !== null) return { hallazgos: [], aprobadorTope: aprobador.tope };
  const donde = centrosDelAprobador(ap.de, m);
  const cual = centro === null ? `el centro ${p.solicitud.centro_costo} no existe en el maestro` : `no es aprobador del centro ${centro.centro_costo}`;
  const detalle = `${ap.de} ${cual}${donde.length > 0 ? `; aprueba ${donde.map((c) => c.centro_costo).join(", ")}` : ""}.`;
  return {
    aprobadorTope: null,
    hallazgos: [hallazgo("RC2", detalle, sugerenciaAprobadorAjeno(p, m, centro, ap.de), { de: ap.de, centro_costo: p.solicitud.centro_costo })],
  };
}

/** RC3 (solo si el aprobador está en el centro). */
function rc3(p: Paquete, tope: number | null): Hallazgo[] {
  if (tope === null || p.solicitud.valor_total <= tope) return [];
  const { valor_total, moneda } = p.solicitud;
  return [
    hallazgo(
      "RC3",
      `El valor total ${formatoMonto(valor_total, moneda)} supera el tope ${formatoMonto(tope, moneda)} de ${p.aprobacion?.de ?? "el aprobador"} en ${p.solicitud.centro_costo}.`,
      "Pide la aprobación de un aprobador del centro con tope suficiente.",
      { valor_total, tope },
    ),
  ];
}

/** RC4 */
function rc4(p: Paquete, centro: CentroCosto | null): Hallazgo[] {
  const { subarea, centro_costo } = p.solicitud;
  if (centro === null) {
    return [hallazgo("RC4", `El centro de costo ${centro_costo} no existe en el maestro.`, "Pide al solicitante un centro de costo válido.", { centro_costo })];
  }
  if (centro.subareas.some((s) => normalizarNombre(s) === normalizarNombre(subarea))) return [];
  return [
    hallazgo(
      "RC4",
      `La subárea «${subarea}» no pertenece a ${centro_costo}; sus subáreas son: ${centro.subareas.join(", ")}.`,
      `Pide al solicitante corregir la subárea (${centro.subareas.join(" / ")}) o el centro de costo.`,
      { subarea, subareas: centro.subareas },
    ),
  ];
}

/** RC5 */
function rc5(p: Paquete): Hallazgo[] {
  const { valor_total, moneda } = p.solicitud;
  if (p.cotizacion === null) {
    return [hallazgo("RC5", "No hay cotización en el paquete para contrastar el valor.", "Pide la cotización al solicitante o confirma que se crea sin ella.")];
  }
  const cot = p.cotizacion.total;
  const diff = Math.abs(cot - valor_total);
  const fraccion = valor_total === 0 ? (diff === 0 ? 0 : Number.POSITIVE_INFINITY) : diff / valor_total;
  if (fraccion <= TOLERANCIA_COTIZACION) return [];
  return [
    hallazgo(
      "RC5",
      `Cotización ${formatoMonto(cot, p.cotizacion.moneda)} vs solicitud ${formatoMonto(valor_total, moneda)} (${formatoPorcentaje(fraccion)}).`,
      "Confirma con el solicitante cuál valor es el correcto; la OC se crea con el valor de la solicitud.",
      { solicitud: valor_total, cotizacion: cot, diferencia: fraccion },
    ),
  ];
}

/** RC8 */
function rc8(p: Paquete): Hallazgo[] {
  const f = p.factura;
  if (f === null || soloFecha(f.fecha) >= soloFecha(p.solicitud.fecha_solicitud)) return [];
  return [
    hallazgo(
      "RC8",
      `La factura ${f.numero} (${soloFecha(f.fecha)}) es anterior a la solicitud (${soloFecha(p.solicitud.fecha_solicitud)}): la OC es retroactiva.`,
      "Confirma que se crea la OC retroactiva; quedará marcada en el control para medición.",
      { factura: soloFecha(f.fecha), solicitud: soloFecha(p.solicitud.fecha_solicitud) },
    ),
  ];
}

/** RC9 */
function rc9(p: Paquete): Hallazgo[] {
  const a = p.aprobacion;
  if (a === null || soloFecha(a.fecha) >= soloFecha(p.solicitud.fecha_solicitud)) return [];
  return [
    hallazgo(
      "RC9",
      `La aprobación (${soloFecha(a.fecha)}) es anterior a la solicitud (${soloFecha(p.solicitud.fecha_solicitud)}).`,
      "Confirma que la aprobación aplica a esta solicitud o pide una aprobación nueva.",
      { aprobacion: soloFecha(a.fecha), solicitud: soloFecha(p.solicitud.fecha_solicitud) },
    ),
  ];
}

/** RC10 */
function rc10(p: Paquete): Hallazgo[] {
  const { cantidad, valor_unitario, valor_total, moneda } = p.solicitud;
  const calculado = cantidad * valor_unitario;
  if (Math.abs(calculado - valor_total) <= TOLERANCIA_ARITMETICA) return [];
  return [
    hallazgo(
      "RC10",
      `${cantidad} × ${formatoMonto(valor_unitario, moneda)} = ${formatoMonto(calculado, moneda)}, pero el valor total es ${formatoMonto(valor_total, moneda)}.`,
      "Pide al solicitante corregir cantidad, valor unitario o valor total en la solicitud.",
      { calculado, valor_total },
    ),
  ];
}

/** RC6 y RC7: completan desde el proveedor lo que la solicitud no trae. */
function derivar(p: Paquete, proveedor: Proveedor | null): { derivados: Record<string, string>; confirmaciones: Hallazgo[] } {
  const derivados: Record<string, string> = {};
  const confirmaciones: Hallazgo[] = [];
  if (proveedor === null) return { derivados, confirmaciones };
  if (!p.solicitud.indicador_iva) {
    derivados["indicador_iva"] = proveedor.indicador_iva_default;
    confirmaciones.push(
      hallazgo(
        "RC6",
        `La solicitud no informa indicador de IVA; se propone ${proveedor.indicador_iva_default} (default de ${proveedor.nombre}).`,
        `Confirma el indicador de IVA ${proveedor.indicador_iva_default} con el solicitante o indica el correcto.`,
        { indicador_iva: proveedor.indicador_iva_default },
      ),
    );
  }
  if (!p.solicitud.condiciones_pago) derivados["condiciones_pago"] = proveedor.condiciones_pago_default; // RC7: solo informa
  return { derivados, confirmaciones };
}

export function validarPaquete(caso: string, p: Paquete, m: Maestros): Validacion {
  const proveedor = buscarProveedor(p, m);
  const centro = m.centros.find((c) => c.centro_costo === p.solicitud.centro_costo) ?? null;
  const aprobacion = rc2(p, m, centro);
  const derivado = derivar(p, proveedor);

  const ev: Evaluacion = {
    bloqueos: [...rc1(p, proveedor), ...aprobacion.hallazgos, ...rc3(p, aprobacion.aprobadorTope), ...rc4(p, centro), ...rc10(p)],
    confirmaciones: [...rc5(p), ...derivado.confirmaciones, ...rc8(p), ...rc9(p)],
  };
  const orden = (a: Hallazgo, b: Hallazgo) => Number(a.regla.slice(2)) - Number(b.regla.slice(2));
  const retroactiva = ev.confirmaciones.some((h) => h.regla === "RC8");
  return {
    caso,
    solicitud_id: p.solicitud.solicitud_id,
    apta: ev.bloqueos.length === 0,
    bloqueos: ev.bloqueos.sort(orden),
    confirmaciones: ev.confirmaciones.sort(orden),
    derivados: derivado.derivados,
    retroactiva,
  };
}

/** Proveedor del maestro para el paquete (lo reutiliza la construcción del payload). */
export function proveedorDe(p: Paquete, m: Maestros): Proveedor | null {
  return buscarProveedor(p, m);
}
