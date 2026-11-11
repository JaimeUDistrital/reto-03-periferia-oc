# Glosario

Términos del dominio, según el PRD del reto 3 y los fixtures.

- **OC (orden de compra):** documento que formaliza el pedido a un proveedor. Es lo que el agente crea en el SAP simulado; tiene número secuencial desde `4500000001`.
- **Paquete:** el conjunto de piezas de un caso que el agente lee: correo, solicitud, cotización, aprobación y, a veces, factura. Una pieza ausente se reporta como `null`, no como excepción.
- **Solicitud:** el Excel que llena el solicitante (en los fixtures, `solicitud.json`): proveedor, descripción, centro de costo, subárea, cantidad, valores, indicador de IVA y condiciones de pago. Es la fuente de los valores de la OC.
- **Cotización:** oferta del proveedor (en los fixtures, `cotizacion.txt`) con ítems, IVA, total y validez. Se compara con la solicitud (RC5).
- **Aprobación:** correo del líder que dice «Aprobado» y que debe venir de un aprobador del centro de costo (RC2). Se convierte en la evidencia de la OC.
- **Factura:** documento del proveedor, presente solo en algunos casos. Si su fecha es anterior a la solicitud, la compra es retroactiva.
- **Retroactiva:** OC creada después de recibir la factura (`retroactiva = true`). El agente la marca y pide confirmación; la política de si se tolera la decide la dirección.
- **Bloqueo:** hallazgo que impide crear la OC (RC1, RC2, RC3, RC4, RC10). Devuelve la razón y la acción sugerida.
- **Confirmación:** hallazgo que permite crear la OC solo si una persona lo confirma (RC5, RC6, RC8, RC9). El agente la pide mostrando los valores en juego.
- **Derivado:** valor que el agente completó desde un maestro porque faltaba en la solicitud (por ejemplo, indicador de IVA o condiciones de pago del proveedor) y que debe informar.
- **Trazabilidad:** registro de la fuente de cada valor del payload (`solicitud`, `cotizacion`, `maestro.<nombre>` o `derivado`), guardado en `out/<caso>/trazabilidad.json`.
- **Evidencia:** el correo de aprobación como archivo adjunto a la OC (`aprobacion.txt` con `sha256`, y `aprobacion.pdf`).
- **Idempotencia:** crear dos veces la OC del mismo `solicitud_id` devuelve el número ya existente, no una segunda orden.
- **Centro de costo:** unidad contable a la que se imputa el gasto; define quiénes pueden aprobar (`CC-1010`, `CC-2020`, `CC-3030`).
- **Subárea:** división dentro de un centro de costo; debe pertenecer al centro de la solicitud (RC4).
- **Tope:** monto máximo que un aprobador puede autorizar en un centro de costo (RC3). Es por persona y por centro.
- **Indicador de IVA:** código del maestro que define el tratamiento del IVA (`C0` excluido, `C1` 19 %, `C2` 5 %).
- **Condiciones de pago:** código del maestro con el plazo de pago (`Z000`, `Z015`, `Z030`, `Z060`).
- **Código SAP:** identificador del proveedor en SAP (`codigo_sap`), distinto del NIT. Es el que usa el payload de la OC.
- **NIT:** número de identificación tributaria del proveedor; primera clave para buscarlo en el maestro (RC1).
- **Sesión:** conversación de un usuario con el agente, identificada por `sessionId` y guardada en memoria del backend.
- **Herramienta (tool):** función tipada con `zod` (`oc_leer_paquete`, `oc_validar`, `oc_construir_payload`, `oc_generar_evidencia`, `oc_crear`) que es la única fuente de valores que el agente puede afirmar.
- **Guardia de confirmación:** comprobación en el servidor de que el usuario confirmó ese caso en su último mensaje; el modelo no puede saltársela.
- **SAP / BAPI / OData:** SAP es el sistema de registro (aquí simulado). `BAPI_PO_CREATE1` es la función remota (RFC) para crear pedidos; `API_PURCHASEORDER_2` es el servicio OData V4 que sustituye al V2 `API_PURCHASEORDER_PROCESS_SRV`, deprecado desde la versión 2308.
