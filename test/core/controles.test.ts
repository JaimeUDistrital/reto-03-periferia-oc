import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ResultadoControl } from "../../src/domain/contratos";
import { CONTROLES, decidir } from "../../src/domain/controles";
import type { Expediente } from "../../src/domain/modelo";
import { expedienteValido } from "./expediente-valido";

function evaluar(id: string, expediente: Expediente): ResultadoControl {
  const control = CONTROLES.find((c) => c.id === id);
  assert.ok(control, `control ${id} no registrado`);
  return control.evaluar(expediente);
}

describe("registro de controles", () => {
  it("contiene los seis controles del reto, con id único", () => {
    const ids = CONTROLES.map((c) => c.id);

    assert.deepEqual(ids, [
      "CTRL-PROVEEDOR",
      "CTRL-CECO-TOPE",
      "CTRL-IVA",
      "CTRL-COND-PAGO",
      "CTRL-RETROACTIVA",
      "CTRL-COHERENCIA",
    ]);
  });

  it("un expediente válido da OK en todos", () => {
    const estados = CONTROLES.map((c) => c.evaluar(expedienteValido()).estado);

    assert.deepEqual(estados, Array(6).fill("OK"));
  });

  it("cada resultado lleva el id y el nombre de su control", () => {
    for (const control of CONTROLES) {
      const r = control.evaluar(expedienteValido());
      assert.equal(r.id, control.id);
      assert.equal(r.nombre, control.nombre);
    }
  });
});

describe("CTRL-PROVEEDOR", () => {
  it("bloquea si el proveedor no existe en el maestro", () => {
    const e = expedienteValido();
    e.solicitud.proveedorNit = "999999999-9";

    assert.equal(evaluar("CTRL-PROVEEDOR", e).estado, "BLOQUEO");
  });

  it("bloquea si el proveedor está bloqueado y deja el estado como evidencia", () => {
    const e = expedienteValido();
    e.solicitud.proveedorNit = "901555111-3";

    const r = evaluar("CTRL-PROVEEDOR", e);

    assert.equal(r.estado, "BLOQUEO");
    assert.equal(r.evidencia["estadoProveedor"], "bloqueado");
  });
});

describe("CTRL-CECO-TOPE", () => {
  it("bloquea si el centro de costo no existe", () => {
    const e = expedienteValido();
    e.solicitud.centroCosto = "CC-999";

    assert.equal(evaluar("CTRL-CECO-TOPE", e).estado, "BLOQUEO");
  });

  it("bloquea si quien aprobó no es el líder del centro", () => {
    const e = expedienteValido();
    e.aprobacion.aprobador = "L-777";

    assert.equal(evaluar("CTRL-CECO-TOPE", e).estado, "BLOQUEO");
  });

  it("bloquea si la aprobación no está aprobada", () => {
    const e = expedienteValido();
    e.aprobacion.estado = "pendiente";

    assert.equal(evaluar("CTRL-CECO-TOPE", e).estado, "BLOQUEO");
  });

  it("bloquea si el total supera el tope del líder", () => {
    const e = expedienteValido();
    e.solicitud.total = 20000001;

    assert.equal(evaluar("CTRL-CECO-TOPE", e).estado, "BLOQUEO");
  });

  it("acepta un total exactamente igual al tope", () => {
    const e = expedienteValido();
    e.solicitud.total = 20000000;

    assert.equal(evaluar("CTRL-CECO-TOPE", e).estado, "OK");
  });
});

describe("CTRL-IVA", () => {
  it("alerta si el código de IVA no existe", () => {
    const e = expedienteValido();
    e.cotizacion.indicadorIva = "V9";

    assert.equal(evaluar("CTRL-IVA", e).estado, "ALERTA");
  });

  it("usa el indicador del proveedor cuando la cotización no lo trae", () => {
    const e = expedienteValido();
    e.cotizacion.indicadorIva = null;

    assert.equal(evaluar("CTRL-IVA", e).estado, "OK");
  });

  it("alerta si el impuesto no es subtotal × tasa", () => {
    const e = expedienteValido();
    e.cotizacion.impuesto = 1000000;
    e.cotizacion.total = 11000000;

    assert.equal(evaluar("CTRL-IVA", e).estado, "ALERTA");
  });

  it("alerta si el total no es subtotal + impuesto", () => {
    const e = expedienteValido();
    e.cotizacion.total = 12000000;

    assert.equal(evaluar("CTRL-IVA", e).estado, "ALERTA");
  });

  it("tolera una diferencia de 1 unidad monetaria", () => {
    const e = expedienteValido();
    e.cotizacion.impuesto = 1900001;
    e.cotizacion.total = 11900001;

    assert.equal(evaluar("CTRL-IVA", e).estado, "OK");
  });

  it("alerta si la cotización no trae subtotal legible", () => {
    const e = expedienteValido();
    e.cotizacion.subtotal = null;

    assert.equal(evaluar("CTRL-IVA", e).estado, "ALERTA");
  });
});

describe("CTRL-COND-PAGO", () => {
  it("alerta si el código no existe en el maestro", () => {
    const e = expedienteValido();
    e.solicitud.condicionPago = "CP99";

    assert.equal(evaluar("CTRL-COND-PAGO", e).estado, "ALERTA");
  });

  it("alerta si no coincide ni con el proveedor ni con la cotización", () => {
    const e = expedienteValido();
    e.solicitud.condicionPago = "CP45";

    assert.equal(evaluar("CTRL-COND-PAGO", e).estado, "ALERTA");
  });

  it("acepta si coincide solo con la cotización", () => {
    const e = expedienteValido();
    e.solicitud.condicionPago = "CP45";
    e.cotizacion.condicionPago = "CP45";

    assert.equal(evaluar("CTRL-COND-PAGO", e).estado, "OK");
  });
});

describe("CTRL-RETROACTIVA", () => {
  it("es OK si no hay factura", () => {
    assert.equal(evaluar("CTRL-RETROACTIVA", expedienteValido()).estado, "OK");
  });

  it("es OK si la factura es posterior a la solicitud y a la aprobación", () => {
    const e = expedienteValido();
    e.factura = { numero: "FE-1", fecha: "2026-10-20", nit: "900123456-7", total: 11900000 };

    assert.equal(evaluar("CTRL-RETROACTIVA", e).estado, "OK");
  });

  it("bloquea si la factura es anterior a la solicitud y a la aprobación, con las fechas como evidencia", () => {
    const e = expedienteValido();
    e.factura = { numero: "FE-1", fecha: "2026-10-01", nit: "900123456-7", total: 11900000 };

    const r = evaluar("CTRL-RETROACTIVA", e);

    assert.equal(r.estado, "BLOQUEO");
    assert.deepEqual(r.evidencia, {
      fechaFactura: "2026-10-01",
      fechaSolicitud: "2026-10-05",
      fechaAprobacion: "2026-10-06",
    });
  });

  it("bloquea si la factura es posterior a la solicitud pero anterior a la aprobación", () => {
    const e = expedienteValido();
    e.factura = { numero: "FE-1", fecha: "2026-10-05", nit: "900123456-7", total: 11900000 };

    assert.equal(evaluar("CTRL-RETROACTIVA", e).estado, "BLOQUEO");
  });

  it("bloquea si la factura no tiene fecha legible (no se puede descartar la retroactividad)", () => {
    const e = expedienteValido();
    e.factura = { numero: "FE-1", fecha: null, nit: null, total: null };

    assert.equal(evaluar("CTRL-RETROACTIVA", e).estado, "BLOQUEO");
  });
});

describe("CTRL-COHERENCIA", () => {
  it("alerta si el NIT de la solicitud no es el de la cotización", () => {
    const e = expedienteValido();
    e.cotizacion.nit = "800765432-1";

    assert.equal(evaluar("CTRL-COHERENCIA", e).estado, "ALERTA");
  });

  it("alerta si el total de la solicitud difiere del de la cotización", () => {
    const e = expedienteValido();
    e.solicitud.total = 15000000;

    assert.equal(evaluar("CTRL-COHERENCIA", e).estado, "ALERTA");
  });

  it("alerta si la cotización no trae total legible", () => {
    const e = expedienteValido();
    e.cotizacion.total = null;

    assert.equal(evaluar("CTRL-COHERENCIA", e).estado, "ALERTA");
  });
});

describe("decidir", () => {
  const control = (estado: ResultadoControl["estado"]): ResultadoControl => ({
    id: "X",
    nombre: "X",
    estado,
    detalle: "",
    evidencia: {},
  });

  it("es APROBABLE si todo está OK", () => {
    assert.equal(decidir([control("OK"), control("OK")]), "APROBABLE");
  });

  it("es REQUIERE_REVISION si hay una ALERTA y ningún BLOQUEO", () => {
    assert.equal(decidir([control("OK"), control("ALERTA")]), "REQUIERE_REVISION");
  });

  it("es RECHAZADA si hay un BLOQUEO, aunque haya alertas", () => {
    assert.equal(decidir([control("ALERTA"), control("BLOQUEO"), control("OK")]), "RECHAZADA");
  });
});
