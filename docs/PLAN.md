# PLAN — Reto 3 · Agente de Órdenes de Compra (SAP simulado)

> Fuente de verdad del trabajo. Estado y bitácora: [`RELEVO.md`](RELEVO.md).
> Reglas del reto: instructivo PDF + `PRD.md` (llega a las 23:00; queda fuera de git, se traduce a la §8).

## 0. Tablero de avance

Leyenda: ✅ hecho (con evidencia) · 🔄 en curso · ⬜ pendiente · 👤 lo haces tú.
Solo lo actualiza el orquestador; nada pasa a ✅ sin el comando que lo prueba.

### Fase B (PRD real, 23:00 → 01:00) — lista de aceptación

Base: `6850373` (contratos `src/domain/contratos-oc.ts`, fixtures reales, casos esperados, pdf-lib + read-excel-file). Vercel descartado (sesiones y `out/` no encajan en serverless).

| Bloque | Criterio (PRD) | Quién | Estado |
|---|---|---|---|
| Entregables | Repo limpio sin `node_modules`, `out/`, `.env` | ORQ | ✅ `git ls-files` sin coincidencias (23:45) |
| | URL pública viva (Railway) | ORQ + 👤 push | ✅ `83bedb9` desplegado; humo con Gemini 6/6 |
| | `demo.ts` 6 casos sin LLM, idempotencia sol-001, confirmación sol-004 | CORE | ✅ exit 0, «OK: los 6 casos coinciden», OC 4500000001–4 |
| | `SOLUCION.md` 12 secciones · `README.md` (un comando, variables, demo, link) | DOCS + ORQ | ✅ 0 marcas VERIFICAR (`4a3565a`) |
| | Bonus `modulo/` (agent.md, tools/oc.ts, SKILL.md sin copias divergentes) | ORQ | ✅ `npm run modulo` + `test/orq/modulo.test.ts` |
| Arquitectura | `agent/prompt.md` · `src/knowledge/ordenes-compra.md` · `src/tools/oc.ts` | AGENTE · CORE | ✅ |
| | `src/llm/adapter.ts` · `src/sap/adapter.ts` + `mock.ts` · `src/server.ts` (chat, sesiones, health) | AGENTE · CORE | ✅ humo local: health, casos, evaluar sol-004 → RC5 |
| | `web/`: indicador de carga, tool calls con argumentos, confirmación resaltada | UI | ✅ tests; ⬜ no visto en navegador |
| Herramientas | 5 tools zod (+ P1 `leer_excel`), devuelven JSON y nunca lanzan | CORE | ✅ (`leer_excel`: solo rutas de error probadas) |
| | `out/<caso>/trazabilidad.json`, `aprobacion.txt` + sha256 (+ P1 PDF) | CORE | ✅ `out/sol-004/` con los 3 archivos + PDF |
| | `out/sap/ordenes.jsonl` desde 4500000001, idempotente · `out/control.csv` · `out/log.jsonl` | CORE · AGENTE | ✅ |
| Reglas | 25 iteraciones, CA2 en el prompt, RC1–RC10, resultados de los 6 casos | CORE · AGENTE | ✅ (con el modelo real: ⬜ sin probar) |
| No funcionales | Sin `any`, un comando < 120 s, clave solo en el backend, tope de tokens | todos | ✅ grep sin `any` · build 1 s · `/api/health` sin claves · tope 200 000 |

**Entregables del reto (fase A)**

| # | Entregable | Estado | Evidencia |
|---|---|---|---|
| 1 | Repo: `agent/prompt.md`, `src/tools/oc.ts` (zod), backend, chat con tool calls + HITL | 🔄 | todo integrado en `main`; chat con Gemini OK en Railway (ver A5). Falta: probar la UI en el navegador |
| 2 | `demo.ts` 6/6 sin LLM | 🔄 | 2/2 con datos simulados, 39 ms, exit 0. Falta: 6 casos reales (B2) |
| 3 | URL pública con los 6 casos | 🔄 | https://reto-03-periferia-oc-production.up.railway.app — versión `f7a3dfb`; chat con Gemini, HITL y OC OK (curl, 22:50). Falta: 6 casos reales, respaldo en Vercel |
| 4 | `SOLUCION.md` completo | 🔄 | borrador con 8 secciones; falta matriz y datos reales (B3) |

**Tareas**

| ID | Qué | Quién | Estado | Evidencia |
|---|---|---|---|---|
| A0 | Git, deps verificadas, tsconfig, contratos, servidor y web mínimos, CI | ORQ | ✅ | typecheck OK · test 2/2 · build OK · `/api/salud` OK · `d10fd3b` |
| U1 | `.env` con `GEMINI_API_KEY` y `HITL_SECRET` (la clave va en `.env`, **nunca** en `.env.example`) | 👤 | ⬜ | ORQ no puede leer `.env`: confírmalo tú con el `grep` del paso 1 |
| U2 | Commit de `.env.example` | 👤 | ✅ | `7ab1d09`; en el repo público la clave está vacía (comprobado con `git grep`) |
| U3 | Repo en GitHub + push | 👤 | ✅ | `JaimeUDistrital/reto-03-periferia-oc`; `origin/main` = `f7a3dfb` = local; sin archivos sensibles |
| U4 | Railway: proyecto, variables y dominio | 👤 + ORQ | ✅ | Node 22.23.4; 3 variables aplicadas con «Deploy» (estaban sin aplicar); `/api/chat` responde con Gemini. Trial: 5 días o 3,49 USD |
| U6 | `git push` de los commits locales (tablero + arreglos) | 👤 | ✅ | `7085878..f7a3dfb` |
| A6 | Respaldo en Vercel (código) | VERCEL | ✅ | `api/index.ts` + `vercel.json`; en main: test 206/206 · build OK · merge `ff19149`. Riesgo no verificado: compilación de imports en Vercel → probar `/api/salud` en el primer deploy |
| U7 | Importar el repo en Vercel + variables | 👤 + ORQ (Chrome) | ⬜ | Framework Preset «Other»; variables `GEMINI_API_KEY`, `GEMINI_MODEL`, `HITL_SECRET` |
| U5 | Dato: ¿clave Gemini gratuita o de pago? ¿fecha de la defensa? | 👤 | ⬜ | — |
| A1 | Núcleo determinista, tools, SAP simulado, `demo.ts` | CORE | ✅ | en main: test 198/198 · demo 2/2 exit 0 · merge `7085878` |
| A2 | Bucle del agente, Gemini, seguridad, servidor, `prompt.md` | AGENTE | ✅ | en main: typecheck OK · test 115/115 · build OK · merge `5550764` |
| A3 | UI de chat, tool calls, HITL, «Evaluar sin IA» | UI | ✅ | en main: typecheck OK · test 19/19 · build OK · sin innerHTML · merge `f699b44` |
| A4 | README, SOLUCION (borrador), GLOSSARY | DOCS | ✅ | 3 archivos, 8 secciones, 6 ADR, 16 marcas «no verificado» · merge `a352934` |
| A5 | Merge, /code-review medium, security-auditor, deploy, humo en URL | ORQ | 🔄 | ✅ 4 merges · ✅ humo local: sol-001 → confirmación → OC `4533205732`; token alterado → 401; sol-002 sin confirmación; CSP estricta. ✅ ajustes 1 y 2 con TDD (`c3927f1`, test 202/202). ✅ humo en Railway (22:50): chat sol-001 → `evaluarSolicitud` + `crearOrdenCompra` → confirmación → OC `4533205732`; token alterado → 401; reenvío → misma OC. Falta: ajuste 3 (carga de `.env` en local), /code-review medium, security-auditor |
| B1 | PRD + fixtures reales → contratos, casos esperados y matriz §8 | ORQ | ✅ | `6850373` · test 188/188 · matriz §8 |
| B2 | Núcleo: 5 herramientas + P1, RC1–RC10, SAP en archivos, control, evidencia, `demo.ts` | CORE | ✅ | merge `b2fc36c` · demo 6/6 |
| B3 | Agente: adaptador LLM, ciclo (25 it.), tope de tokens, sesiones, guardia de confirmación, `src/server.ts`, `out/log.jsonl`, prompt + conocimiento | AGENTE | ✅ | merge `19ef4c7` · sin probar con Gemini real |
| B4 | UI: eventos nuevos, confirmación con ambos valores, tabla de la OC, resultado de la validación | UI | ✅ | merge `0930270` |
| B5 | Docs: `SOLUCION.md` (12 secciones), `README.md`, `GLOSSARY.md` | DOCS | ✅ | merge `31bf1da` · marcas resueltas `4a3565a` |
| B6 | Integrar ramas, `package.json` / `.env.example` / tsconfig, bonus `modulo/`, /code-review medium, demo 6/6 | ORQ | ✅ | test 258/258 · demo 6/6 (Node y Bun 1.4.4) · review: 3 corregidos, 7 documentados · `83bedb9` |
| B7 | Push → Railway → humo de los 6 casos en la URL | 👤 push + ORQ | ✅ | 6/6 con Gemini en la URL (ver RELEVO 00:07) |
| B8 | Cifras reales en SOLUCION, RELEVO final, push final | ORQ + 👤 push | ⬜ | — |

## 1. Entregables y criterio de aceptación (PRD §9)

| # | Entregable | Hecho cuando |
|---|---|---|
| 1 | Repo limpio con historial | `git ls-files` sin `node_modules/`, `out/` ni `.env` |
| 2 | App: chat + backend + herramientas + LLM | typecheck y tests en verde; el chat muestra cada herramienta (nombre, argumentos, resultado resumido) y resalta las confirmaciones |
| 3 | `demo.ts` | `npm run demo` sin clave ni red: 6 casos = `test/core/casos.esperados.ts`, idempotencia de sol-001, confirmación explícita de sol-004, exit 0, determinista salvo timestamps |
| 4 | URL pública (Railway) | `/api/health` OK y los 6 casos se prueban por chat |
| 5 | `SOLUCION.md` | las 12 secciones del PRD §9.1, con adaptador SAP real y declaración de IA |
| 6 | `README.md` | un comando de arranque, variables de `.env.example`, demo y link |
| 7 | Bonus `modulo/` | `test/orq/modulo.test.ts` verde: mismas piezas que la app, sin copias divergentes |

## 2. Principios

1. **El código decide; el LLM orquesta y explica.** Las herramientas son la única fuente de valores (CA2). Chat y `demo.ts` usan las mismas herramientas.
2. **Confirmación humana por código, no por prompt.** `oc_crear` no crea si hay confirmaciones sin `confirmado = true`; y en el servidor ese `confirmado` solo vale si el usuario confirmó ESE caso en su último mensaje (`ctx.confirmacionHumana`). El modelo no puede autoconfirmarse.
3. **No se confía en lo que devuelve el modelo.** Las herramientas releen la fuente por `caso`; si el modelo envía paquete, derivados o payload, se verifican (`PAYLOAD_ALTERADO`).
4. **Separación que evalúan:** comportamiento en `agent/prompt.md` · conocimiento en `src/knowledge/ordenes-compra.md` · ejecución en `src/tools/oc.ts`. Un cambio de reglas no toca el servidor.
5. **Documentos = datos no confiables** (prompt injection).
6. **Mínimo que resuelve del todo.** Un dueño por archivo (§3).

## 3. Mapa de archivos y dueños (fase B)

```
agent/prompt.md                     AGENTE  comportamiento (system prompt)
src/knowledge/ordenes-compra.md     AGENTE  conocimiento del proceso
src/domain/contratos-oc.ts          ORQ     contratos compartidos (§4)
src/domain/*, src/data/*            CORE    paquete, reglas RC1–RC10, payload, evidencia, listado de casos
src/tools/oc.ts                     CORE    SOLO herramientas: leer_paquete, validar, construir_payload, generar_evidencia, crear, leer_excel
src/sap/adapter.ts, src/sap/mock.ts CORE    SapAdapter + simulación en out/sap/ordenes.jsonl
demo.ts                             CORE    6 casos sin LLM
src/llm/adapter.ts, gemini.ts       AGENTE  interfaz enviar() + implementación Gemini
src/agent/                          AGENTE  registro de herramientas, ciclo, sesiones, log
src/server.ts                       AGENTE  Hono: /api/chat, /api/sessions/:id, /api/health, /api/casos, /api/evaluar
src/security/, src/config/          AGENTE  redact, mask, documentos, límites, env
web/                                UI      React + Vite + Tailwind
modulo/, scripts/modulo.ts          ORQ     bonus (generado + test de sincronía)
README.md, SOLUCION.md, docs/GLOSSARY.md            DOCS
docs/PLAN.md, docs/RELEVO.md, package.json, tsconfig*.json, .env.example, .github/   ORQ
fixtures/reto-03/                   Periferia (solo lectura)
out/                                generado en ejecución (ignorado)
test/<dueño>/                       cada dueño en su subcarpeta
```

**Stack verificado (2026-11-10):** Node ≥ 22.12 · zod 4.6.7 (`z.toJSONSchema`, `z.ZodRawShape`) · @google/genai 3.1.0 · modelo por defecto `gemini-3.6-flash` · hono 4.13.17 · Vite 8 + React 19 + Tailwind 4 · TypeScript 7.0.2 · pdf-lib 1.17.1 · read-excel-file 9.3.14 (`npm audit`: 0). Ejecutar TS con `node --import tsx …`.

## 4. Contratos (`src/domain/contratos-oc.ts`, fase B)

- `HerramientaOC` = `{ description, args: ZodRawShape, execute(args, ctx) → Promise<string> }`; el modelo la ve como `oc_<export>`; devuelve `{ok:true,data}` o `{ok:false,error,codigo}` y nunca lanza.
- `CtxHerramienta` = `{ directory, sessionId, confirmacionHumana?(caso), ahora?() }`.
- `Hallazgo` = `{ regla: RC1…RC10, detalle, accion_sugerida, valores? }` · `Validacion` = `{ caso, solicitud_id, apta, bloqueos, confirmaciones, derivados, retroactiva }`.
- `OrdenCompraSchema` (PRD §7.4) · `SapAdapter` (PRD §7.4) · `OcCreada` = `{ numero_oc, fecha, idempotente, retroactiva, evidencia }`.
- `CodigoError`: `BLOQUEADA` · `REQUIERE_CONFIRMACION` · `CONFIRMACION_NO_HUMANA` · `PAYLOAD_ALTERADO` · `ENTRADA_INVALIDA` · `ERROR`.
- `EventoChat` (SSE): `tool_call` · `tool_result` · `confirmacion_requerida {caso, confirmaciones}` · `oc_creada` · `mensaje` · `error` · `fin`.
- `src/domain/contratos.ts` (fase A) se borra al integrar.

## 5. Seguridad

1. **Secretos:** la clave solo vive en el backend (variable de entorno validada con Zod); `redact()` limpia logs y errores; al cliente, error legible + `correlationId`; `/api/health` nunca devuelve la clave.
2. **Datos:** las herramientas reciben `caso` y leen la fuente ellas mismas; los fixtures son ficticios; los correos se enmascaran en `out/log.jsonl` y en los logs del servidor.
3. **Link público sin login** (lo permite el PRD §6.1): tope de sesiones en memoria, de mensajes y de tokens por sesión para que nadie gaste la clave sin límite.
4. **Prompt injection:** textos de correos, cotizaciones y aprobaciones son datos; el prompt lo declara y las decisiones no dependen del LLM.
5. **XSS:** el texto del LLM se pinta como texto, nunca como HTML; `secureHeaders` con CSP.
6. **Abuso y coste:** `bodyLimit`, longitud máxima de mensaje, rate limit por IP, `MAX_ITERACIONES` (25), `MAX_TOKENS_SESION`, timeout al LLM.
7. **Confirmación humana con guardia en servidor:** la sesión guarda `pendiente {caso, confirmaciones}`; `ctx.confirmacionHumana(caso)` solo es true si el último mensaje del usuario confirma ese caso (botón con `confirmar: caso` o texto afirmativo sin negación). Sustituye al token HMAC de la fase A.
8. **Herramientas sin shell;** `caso` validado con regex y existencia (sin rutas); `leer_excel` confinado a `fixtures/`.
9. **Repo:** `.env` y `out/` ignorados, solo `.env.example`; versiones exactas + lockfile; `npm audit` en CI.
10. **Gemini:** en el nivel gratuito Google puede usar entradas y salidas para mejorar sus productos; en el de pago, no (https://aistudio.google.com/docs/terms).

## 6. Pruebas (método agent-skills `test-driven-development`)

- Ciclo **RED → GREEN → REFACTOR**; Prove-It para bugs.
- **Pequeñas** (`node:test`): cada regla RC1–RC10, parsers de cotización y factura, payload contra su esquema, sha256, `mask`/`redact`, reductor de la UI.
- **Medianas:** herramientas sobre copias de fixtures en carpetas temporales (SAP secuencial, idempotente y concurrente; `control.csv`; nunca lanzan); `app.request()` de Hono con LLM falso: caso limpio crea sin confirmación; caso con confirmación → `confirmacion_requerida`; `confirmado:true` sin humano → `CONFIRMACION_NO_HUMANA`; «confirmo» → `oc_creada`.
- **Grandes:** `npm run demo` 6/6 y humo en la URL pública.
- **Casos dorados:** `test/core/casos.esperados.ts` (fijado en B1). `demo.ts` y los tests lo comparan.
- Comandos: `npm run typecheck` · `npm test` · `npm run demo` · `npm run build` · `npm run modulo`.

## 7. Tareas

### Fase A — antes de las 23:00 (cerrada)

A0–A6 en el tablero (§0). El diseño HITL por token HMAC y el respaldo en Vercel se retiran en la fase B.

### Fase B — 23:00 → 01:00

| ID | Dueño · modelo/esfuerzo | Qué | Hecho cuando | Hora objetivo |
|---|---|---|---|---|
| B1 | ORQ · Opus | PRD + fixtures → contratos, casos esperados, matriz §8, deps | commit + test verde | ✅ 23:17 |
| B2 | CORE · Sonnet/high | herramientas, reglas, SAP, control, evidencia (txt + PDF), `leer_excel`, `demo.ts` | typecheck + tests de core; demo 6/6 exit 0 | 00:00 |
| B3 | AGENTE · Sonnet/high | adaptador LLM, ciclo, sesiones, guardia, `src/server.ts`, log, prompt + conocimiento | tests verdes; guardia probada | 00:00 |
| B4 | UI · Sonnet/medium | chat con eventos nuevos, confirmación, tabla de la OC | build verde; reductor probado | 23:55 |
| B5 | DOCS · Sonnet/medium | SOLUCION (12), README, GLOSSARY | secciones completas; marcas `VERIFICAR` listadas | 23:55 |
| B6 | ORQ · Opus | integración, config, bonus, /code-review medium, demo 6/6 | todo verde en `main` | 00:25 |
| B7 | 👤 push + ORQ | Railway + humo de los 6 casos por chat en la URL | 6/6 en la URL | 00:45 |
| B8 | ORQ | cifras reales en SOLUCION, RELEVO final, push final | entrega lista | 01:00 |

**Contingencia:** si a las 00:15 un subagente no terminó, ORQ integra lo que esté en verde y completa a mano el P0 que falte. Se recorta en este orden: `leer_excel` → PDF → bonus `modulo/`. Nunca se recorta: demo 6/6, guardia de confirmación, URL viva, SOLUCION 12 secciones.

## 8. Matriz de controles (B1, resultado esperado)

✓ cumple · ✕ bloqueo · ! confirmación · ℹ derivado (solo informa) · — no aplica

| Regla | Tipo | sol-001 | sol-002 | sol-003 | sol-004 | sol-005 | sol-006 |
|---|---|---|---|---|---|---|---|
| RC1 proveedor existe y activo | Bloqueo | ✓ | ✕ NIT 901999000 no existe | ✓ | ✓ | ✓ | ✓ (por nombre, sin NIT) |
| RC2 aprobación válida del centro | Bloqueo | ✓ | ✓ | ✕ fvargas no aprueba CC-2020 | ✓ | ✓ | ✓ |
| RC3 monto ≤ tope del aprobador | Bloqueo | ✓ 11,4 M ≤ 50 M | ✓ | — (depende de RC2) | ✓ 25 M ≤ 200 M | ✓ 3,2 M ≤ 30 M | ✓ 5,4 M ≤ 50 M |
| RC4 subárea del centro | Bloqueo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| RC5 cotización ±2 % | Confirmación | ✓ | ✓ | ✓ | ! 26,5 M vs 25 M (6 %) | ✓ | ✓ |
| RC6 IVA ausente → derivado | Confirmación + derivado | ✓ | ✓ | ✓ | ✓ | ✓ | ! C1 del proveedor |
| RC7 condiciones ausentes → derivado | Derivado | ✓ | ✓ | ✓ | ✓ | ✓ | ℹ Z030 del proveedor |
| RC8 factura anterior → retroactiva | Confirmación | ✓ | ✓ | ✓ | ✓ | ! factura 10/08 < solicitud 27/08 | ✓ |
| RC9 aprobación ≥ solicitud | Confirmación | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| RC10 cantidad × unitario = total (±1) | Bloqueo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Resultado** | | OC directa 4500000001 | bloqueada | bloqueada | confirma → 4500000002 | confirma → 4500000003, retroactiva | confirma → 4500000004 |

Numeración según `demo.ts` (out/ limpio; sol-001 dos veces; 004, 005 y 006 se confirman tras un primer intento pendiente).

## 9. Reglas para subagentes

1. Lee §2–§6, tu tarea y `src/domain/contratos-oc.ts`. Nada más salvo lo necesario.
2. Solo tocas tus rutas (§3). ¿Hace falta cambiar un contrato, `package.json` o `.env.example`? Para y pídelo en tu informe.
3. TDD (§6). Antes de terminar: typecheck + test (+ demo/build si aplica) en verde, con su salida.
4. Commits pequeños en tu rama (`feat:`, `fix:`, `test:`), `git add` con rutas. Ni push ni merge.
5. APIs de librerías: compruébalas en la versión instalada (`node_modules`) o en su doc oficial, no de memoria.
6. No escribes en `RELEVO.md`. Devuelves un informe: hecho · pendiente exacto · comandos y salida · dudas.
7. Dos fallos seguidos en la misma prueba → paras y lo reportas (ORQ sube esfuerzo o modelo).
