# PLAN — Reto 3 · Agente de Órdenes de Compra (SAP simulado)

> Fuente de verdad del trabajo. Estado y bitácora: [`RELEVO.md`](RELEVO.md).
> Reglas del reto: instructivo PDF + `PRD.md` (llega a las 23:00; queda fuera de git, se traduce a la §8).

## 1. Entregables y criterio de aceptación

| # | Entregable | Hecho cuando |
|---|---|---|
| 1 | Repo: `agent/prompt.md`, `src/tools/oc.ts` (zod), backend y chat con tool calls + HITL | typecheck y tests en verde; el chat muestra cada tool call y pide confirmación antes de crear la OC |
| 2 | `demo.ts` | `npm run demo` procesa sol-001…006 **sin red ni clave**, exit 0, dictámenes = esperados |
| 3 | URL pública (Railway) | responde y permite probar los 6 casos en el navegador |
| 4 | `SOLUCION.md` | arquitectura, ciclo del agente, matriz de controles (generada por `demo.ts`), adaptador SAP real, análisis de retroactivas |

## 2. Principios

1. **El código decide; el LLM orquesta y explica.** El dictamen sale de `evaluarSolicitud()` (pura). Chat y `demo.ts` usan la misma función.
2. **HITL por código, no por prompt.** `crearOrdenCompra` solo se ejecuta con un token de confirmación humana (un uso, TTL, ligado a solicitud + hash del dictamen).
3. **Capa anticorrupción.** `src/data/` valida con Zod el formato de los fixtures y lo traduce al dominio. A las 23:00 cambia `src/data/`, no el resto.
4. **Documentos = datos no confiables** (posible prompt injection).
5. **Mínimo que resuelve del todo.** Cada archivo tiene un solo dueño (§3).

## 3. Mapa de archivos y dueños

```
agent/prompt.md              AGENTE   system prompt
src/domain/contratos.ts      ORQ      tipos compartidos (§4) — solo los cambia ORQ
src/data/                    CORE     loaders + esquemas Zod de los fixtures
src/domain/controles.ts      CORE     registro de controles puros {id, nombre, severidad, evaluar}
src/domain/evaluar.ts        CORE     evaluarSolicitud(id) → Dictamen
src/tools/oc.ts              CORE     tools zod (entrada/salida) + exports puros para demo.ts
src/sap/simulador.ts         CORE     SapGateway simulado, idempotente por solicitud
demo.ts                      CORE     6 casos sin LLM; exit ≠ 0 si un dictamen ≠ esperado
src/security/                AGENTE   redact (logs), mask (LLM/UI), envolverDocumento, límites
src/agent/loop.ts            AGENTE   bucle LLM ↔ tools, tope de iteraciones, pausa HITL
src/agent/gemini.ts          AGENTE   adaptador LlmPort → @google/genai
src/server/                  AGENTE   Hono: /api/chat (SSE), /api/confirmar, /api/evaluar (sin IA), estáticos
web/                         UI       React + Vite + Tailwind
test/<dueño>/                cada dueño en su subcarpeta
README.md, SOLUCION.md, docs/GLOSSARY.md      DOCS
docs/PLAN.md, docs/RELEVO.md, package.json, tsconfig*.json, .github/, fixtures/   ORQ
```

## 4. Contratos (A0 · `src/domain/contratos.ts`)

- `ResultadoControl` = `{ id, nombre, estado: 'OK' | 'ALERTA' | 'BLOQUEO', detalle, evidencia }`
- `Dictamen` = `{ solicitudId, decision, controles: ResultadoControl[], hash }` — los valores de `decision` se cierran en B1 con el PRD.
- `ToolDef<I, O>` = `{ nombre, descripcion, entrada: ZodType<I>, salida: ZodType<O>, requiereConfirmacion, ejecutar(i): Promise<O> }`
- `LlmPort.generar(historial, tools)` → `{ texto?, llamadas: { id, nombre, args }[] }`
- `SapGateway.crearOrdenCompra(solicitudId, dictamen)` → `{ numero }` (idempotente)
- `EventoAgente` (SSE): `tool_call` · `tool_result` · `confirmacion_requerida` · `mensaje` · `oc_creada` · `error` · `fin`

## 5. Seguridad

1. **Secretos:** la clave solo vive en el servidor; `env` validado con Zod al arrancar (falla rápido); `redact()` borra claves y tokens de logs y errores; al cliente, error genérico + `correlationId`.
2. **Minimización hacia el LLM:** las tools reciben IDs (`solicitudId`), no documentos crudos; sus salidas pasan por `mask()` (correos, teléfonos, cuentas, documentos de identidad, NIT parcial, nombres → iniciales).
3. **UI pública sin login:** muestra los mismos datos enmascarados que ve el LLM.
4. **Prompt injection:** documentos envueltos en `<documento_externo>` con el cierre escapado; el prompt los declara datos; el dictamen no depende del LLM.
5. **XSS:** el texto del LLM se pinta como texto, nunca como HTML; `secureHeaders` con CSP.
6. **Abuso y coste:** `bodyLimit`, longitud máxima de mensaje, rate limit por IP, tope de iteraciones y de tokens de salida, timeout por llamada.
7. **HITL:** token aleatorio de un uso, TTL 10 min; doble clic no crea 2 OC (SAP idempotente).
8. **Repo:** `.env` ignorado, solo `.env.example`; versiones exactas + lockfile; `npm audit` en CI.

## 6. Pruebas (método agent-skills `test-driven-development`)

- Ciclo **RED → GREEN → REFACTOR**. Un test que pasa a la primera es sospechoso.
- Pirámide ~80/15/5:
  - **Pequeñas** (`node:test`, sin I/O): cada control, parsers, `mask`/`redact`, reductor de eventos de la UI.
  - **Medianas:** `app.request()` de Hono con un `LlmPort` **falso** (fake, no mock): tool_call → confirmacion_requerida → /confirmar → oc_creada; token reusado → rechazo; sin token → nunca hay OC.
  - **Grandes (1–2):** humo en la URL pública con Claude in Chrome.
- **Casos dorados:** `test/core/casos.esperados.ts` con el dictamen esperado de cada sol-00X (lo fija ORQ en B1). `demo.ts` y los tests lo comparan.
- Real > fake > stub > mock · Arrange-Act-Assert · un concepto por test · nombres que se leen como especificación.
- Bugs: patrón **Prove-It** (test que reproduce → arreglo → suite completa).
- Comandos: `npm run typecheck` · `npm test` · `npm run demo` · `npm run build`.

## 7. Tareas

### Fase A — antes de las 23:00

| ID | Dueño · modelo/esfuerzo | Qué | Hecho cuando |
|---|---|---|---|
| A0 | ORQ · Opus | git, .gitignore, deps, tsconfig, contratos, 2 mocks mínimos, CI, primer commit | typecheck verde; repo en GitHub |
| A1 | CORE · Sonnet/high | data, controles, evaluar, tools/oc.ts, sap, demo.ts + tests | tests verdes; demo 2/2 con mocks |
| A2 | AGENTE · Sonnet/high | security, loop, Gemini, server, prompt.md + tests medianos | tests verdes; `/api/evaluar` responde |
| A3 | UI · Sonnet/medium | chat, selector sol-00X, tarjetas de tool call, HITL, botón «Evaluar sin IA» | build verde; reductor probado; funciona con eventos grabados |
| A4 | DOCS · Sonnet/medium | README, SOLUCION (arquitectura, ciclo, adaptador SAP, retroactivas genérico, ADR), GLOSSARY | nombres SAP verificados |
| A5 | ORQ | merge, /code-review medium, security-auditor, deploy, humo en URL | URL viva con flujo completo |

### Fase B — 23:00 → 01:00

| ID | Dueño · modelo/esfuerzo | Qué | Hecho cuando |
|---|---|---|---|
| B1 | ORQ · Opus (esfuerzo máximo) | PRD + fixtures reales → matriz §8 y casos esperados | matriz y commit |
| B2 | CORE · Sonnet/high | adaptar data y controles | tests + demo 6/6 |
| B3 | DOCS · Haiku/low · UI · Sonnet/low (paralelo) | matriz en SOLUCION desde demo; retroactivas con datos reales; etiquetas UI | — |
| B4 | ORQ | /code-review medium, push, humo de los 6 casos en URL, RELEVO final | 6/6 en URL |

## 8. Matriz de controles (se llena en B1)

| Regla PRD | Control | sol-001 | sol-002 | sol-003 | sol-004 | sol-005 | sol-006 |
|---|---|---|---|---|---|---|---|

## 9. Reglas para subagentes

1. Lee §2–§6, tu tarea y `src/domain/contratos.ts`. Nada más salvo lo necesario.
2. Solo tocas tus rutas (§3). ¿Hace falta cambiar un contrato o `package.json`? Para y pídelo en tu informe.
3. TDD (§6). Antes de terminar: typecheck + test (+ demo/build si aplica) en verde, con su salida.
4. Commits pequeños en tu rama (`feat:`, `fix:`, `test:`), `git add` con rutas. Ni push ni merge.
5. APIs de librerías: compruébalas en la doc oficial de la versión instalada (source-driven-development), no de memoria.
6. No escribes en `RELEVO.md`. Devuelves un informe: hecho · pendiente exacto · comandos y salida · dudas.
7. Dos fallos seguidos en la misma prueba → paras y lo reportas (ORQ sube esfuerzo o modelo).
