# Glosario

- **OC (orden de compra)**: documento que formaliza el pedido a un proveedor; es lo que el agente crea en el SAP simulado.
- **Solicitud de compra**: petición interna de un área para comprar algo; es la entrada que se evalúa (sol-001…sol-006).
- **Cotización**: oferta de precio y condiciones de un proveedor que respalda la solicitud.
- **Centro de costo**: unidad contable a la que se imputa el gasto.
- **Tope de aprobación**: monto máximo que un centro de costo o un aprobador puede autorizar sin escalar.
- **NIT**: número de identificación tributaria del proveedor en Colombia.
- **Indicador IVA**: código que dice qué tratamiento de IVA se aplica a la línea de compra.
- **Condición de pago**: plazo y forma en que se pagará al proveedor.
- **Dictamen**: resultado de evaluar una solicitud: decisión (`APROBABLE`, `REQUIERE_REVISION`, `RECHAZADA`), resultado de cada control y un hash.
- **Control**: regla pura que comprueba un aspecto de la solicitud y devuelve `OK`, `ALERTA` o `BLOQUEO`.
- **HITL (human in the loop)**: una persona confirma explícitamente antes de que se cree la OC.
- **Compra retroactiva**: compra cuya factura o ejecución es anterior a la solicitud o a su aprobación.
- **SAP**: sistema ERP donde viven las OC reales; en este proyecto se simula.
- **BAPI**: función remota de SAP con interfaz estable para operar sobre objetos de negocio, p. ej. `BAPI_PO_CREATE1` para pedidos de compra.
- **OData**: protocolo REST con el que SAP expone servicios; para pedidos de compra, `API_PURCHASEORDER_2` (V4).
- **Tool call**: petición del LLM para ejecutar una herramienta del servidor con unos argumentos.
- **Prompt injection**: texto dentro de un documento que intenta dar órdenes al LLM; por eso los documentos se tratan como datos.
- **Enmascaramiento**: ocultar parcial o totalmente datos personales (correos, cuentas, NIT, nombres) antes de enviarlos al LLM o a la UI.
