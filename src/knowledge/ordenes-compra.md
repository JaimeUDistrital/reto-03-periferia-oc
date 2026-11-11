# Órdenes de compra (OC) en SAP: conocimiento del proceso

## Actores

- **Solicitante**: necesita comprar algo y envía el paquete por correo. No usa el agente.
- **Líder aprobador**: aprueba el gasto respondiendo el correo con «Aprobado». No usa el agente.
- **Analista administrativa**: crea la OC en SAP; conversa con el agente y confirma las excepciones. Es la usuaria principal.
- **Contabilidad / Auditoría**: controla el gasto con el registro de control (`out/control.csv`) y la evidencia de cada aprobación.
- **SAP**: sistema de registro (aquí, un simulador local).

## El paquete de un caso

Cada caso es una carpeta con: el **correo** del solicitante, la **solicitud** (Excel normalizado: proveedor, descripción, centro de costo, subárea, cantidad, valor unitario, valor total, moneda, y opcionalmente NIT, indicador de IVA y condiciones de pago), la **cotización** del proveedor, la **aprobación** del líder y, solo en casos retroactivos, la **factura**. Un adjunto ausente se informa como faltante; no es un error del sistema.

## Controles RC1–RC10

Los **bloqueos** impiden crear la OC. Las **confirmaciones** permiten crearla solo si la analista las confirma en el chat. Los **derivados** son valores que se completan desde los maestros y solo se informan.

| Regla | Qué comprueba | Resultado si falla |
|---|---|---|
| RC1 | El proveedor existe en el maestro (por NIT; sin NIT, por nombre normalizado) y está activo. | Bloqueo |
| RC2 | Existe aprobación, dice «Aprobado» y viene de un correo listado como aprobador del centro de costo. | Bloqueo |
| RC3 | El valor total no supera el tope del aprobador para ese centro. | Bloqueo |
| RC4 | La subárea pertenece al centro de costo. | Bloqueo |
| RC5 | La cotización difiere de la solicitud en un 2 % o menos. Si excede, o no hay cotización. | Confirmación, con ambos valores |
| RC6 | Falta el indicador de IVA: se toma el del proveedor. | Confirmación + derivado |
| RC7 | Faltan las condiciones de pago: se toman las del proveedor. | Derivado (solo se informa) |
| RC8 | Hay factura con fecha anterior a la solicitud: la OC es retroactiva. | Confirmación y marca en el control |
| RC9 | La fecha de aprobación es anterior a la fecha de la solicitud. | Confirmación |
| RC10 | Cantidad × valor unitario no iguala al valor total (±1 unidad monetaria). | Bloqueo |

## OC retroactiva

Una OC es **retroactiva** cuando el bien o servicio ya se compró y facturó antes de que existiera la solicitud: la factura es anterior a la fecha de solicitud (RC8). Es una mala práctica porque el gasto se comprometió sin control previo del presupuesto ni aprobación a tiempo. Por eso no se bloquea (la compra ya ocurrió) pero se **mide**: queda marcada en el registro de control para que la dirección vea cuántas hay, de qué áreas y proveedores, y decida la política. Qué hacer con ellas (tolerarlas con marca o rechazarlas) es una decisión de negocio, no del agente.

## Cómo leer los resultados

- `oc_validar` devuelve `apta` (falso si hay algún bloqueo), `bloqueos`, `confirmaciones`, `derivados` y `retroactiva`. Cada hallazgo trae la regla, el detalle con los valores en juego y la acción sugerida.
- `oc_construir_payload` devuelve la OC tal como quedará en SAP (sociedad y organización de compras 1000, proveedor, moneda, condiciones de pago, aprobador con el hash de su evidencia, posiciones y excepciones) y la ruta de trazabilidad de cada valor.
- `oc_generar_evidencia` deja la aprobación como archivo con su `sha256` en `out/<caso>/`; ese hash viaja en la OC.
- `oc_crear` devuelve el número de OC (secuencial desde 4500000001). Crear dos veces el mismo caso devuelve el mismo número (`idempotente`). Si faltan confirmaciones responde `REQUIERE_CONFIRMACION`; si se pretendió confirmar sin que la analista lo hiciera, `CONFIRMACION_NO_HUMANA`.
- Cada intento (creado, bloqueado o pendiente) queda en `out/control.csv`; cada llamada a una herramienta, en `out/log.jsonl`.
