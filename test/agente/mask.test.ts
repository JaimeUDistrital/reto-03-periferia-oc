import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mask } from "../../src/security/mask";

describe("mask: texto libre", () => {
  it("enmascara correos conservando inicial y dominio parcial", () => {
    assert.equal(mask("escribir a juan.perez@dominio.com ya"), "escribir a j***@d***.com ya");
  });

  it("enmascara un NIT dejando los 3 últimos dígitos y el dígito de verificación", () => {
    assert.equal(mask("NIT 900.123.456-7 activo"), "NIT ******456-7 activo");
    assert.equal(mask("NIT 900123456-7"), "NIT ******456-7");
  });

  it("enmascara teléfonos con prefijo internacional o separadores", () => {
    const salida = String(mask("llamar al +57 300 123 4567 o al 300-123-4567"));

    assert.equal(salida.includes("123 4567"), false);
    assert.equal(salida.includes("300-123-4567"), false);
    assert.match(salida, /67/);
  });

  it("enmascara IBAN dejando los 4 últimos caracteres", () => {
    assert.equal(mask("cuenta ES9121000418450200051332"), "cuenta ********************1332");
  });

  it("enmascara números tras la palabra cuenta o cédula", () => {
    assert.equal(mask("cuenta 123456789012 del proveedor"), "cuenta ********9012 del proveedor");
    assert.equal(mask("cédula 1032456789"), "cédula *******789");
  });

  it("no toca identificadores de dominio ni importes", () => {
    const texto = "sol-001 prov-0001 OC 4500001234 total 1.250.000,50 fecha 2026-11-10";

    assert.equal(mask(texto), texto);
  });
});

describe("mask: objetos", () => {
  it("recorre objetos y listas anidados sin mutar la entrada", () => {
    const entrada = { proveedor: { email: "ana@acme.org", lista: [{ telefono: "3001234567" }] } };

    const salida = mask(entrada);

    assert.deepEqual(salida, { proveedor: { email: "a***@a***.org", lista: [{ telefono: "********67" }] } });
    assert.equal(entrada.proveedor.email, "ana@acme.org");
  });

  it("enmascara por nombre de campo: cuenta, documento y NIT", () => {
    const salida = mask({ cuentaBancaria: "00112233445566", documento: "1032456789", nit: "900123456-7" });

    assert.deepEqual(salida, { cuentaBancaria: "**********5566", documento: "*******789", nit: "******456-7" });
  });

  it("reduce a iniciales los nombres de persona en campos conocidos", () => {
    const salida = mask({ solicitante: "Juan Pérez Gómez", contacto: "maría del Carmen López" });

    assert.deepEqual(salida, { solicitante: "J. P. G.", contacto: "M. D. C. L." });
  });

  it("conserva números, booleanos y nulos", () => {
    assert.deepEqual(mask({ total: 1500, ok: true, nada: null }), { total: 1500, ok: true, nada: null });
  });

  it("es idempotente", () => {
    const una = mask({ email: "ana@acme.org", solicitante: "Juan Pérez", nit: "900123456-7" });

    assert.deepEqual(mask(una), una);
  });
});
