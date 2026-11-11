import type { Expediente } from "../../src/domain/modelo";

/** Expediente válido en todos los controles; cada test rompe solo lo que quiere probar. */
export function expedienteValido(): Expediente {
  return {
    solicitud: {
      id: "sol-900",
      fecha: "2026-10-05",
      solicitante: "Ana Pérez",
      centroCosto: "CC-100",
      subarea: "Infraestructura",
      proveedorNit: "900123456-7",
      descripcion: "Servidores",
      total: 11900000,
      moneda: "COP",
      condicionPago: "CP30",
    },
    correo: { de: "ana@example.com", asunto: "Compra", fecha: "2026-10-05", cuerpo: "Por favor" },
    cotizacion: {
      proveedor: "Suministros Andinos S.A.S.",
      nit: "900123456-7",
      fecha: "2026-10-01",
      subtotal: 10000000,
      impuesto: 1900000,
      total: 11900000,
      condicionPago: "CP30",
      indicadorIva: "V1",
    },
    aprobacion: { aprobador: "L-100", estado: "aprobada", fecha: "2026-10-06" },
    factura: null,
    maestros: {
      proveedores: [
        { nit: "900123456-7", razonSocial: "Suministros Andinos S.A.S.", estado: "activo", condicionPago: "CP30", indicadorIva: "V1" },
        { nit: "901555111-3", razonSocial: "Insumos del Norte S.A.", estado: "bloqueado", condicionPago: "CP30", indicadorIva: "V1" },
      ],
      centrosCosto: [
        { codigo: "CC-100", nombre: "Tecnología", subareas: ["Infraestructura"], lider: { id: "L-100", nombre: "Marta Gómez", tope: 20000000 } },
      ],
      indicadoresIva: [
        { codigo: "V0", tasa: 0 },
        { codigo: "V1", tasa: 0.19 },
      ],
      condicionesPago: [
        { codigo: "CP30", dias: 30, descripcion: "30 días" },
        { codigo: "CP45", dias: 45, descripcion: "45 días" },
      ],
    },
  };
}
