# RELEVO — estado y bitácora (archivo único)

> ¿Entras a mitad? 1) Lee «Estado ahora». 2) Corre `npm run typecheck && npm test && npm run demo`.
> 3) Sigue «Siguiente paso». Plan completo en [`PLAN.md`](PLAN.md); qué falta y qué está hecho, en su §0 (tablero).
> Solo escribe el orquestador.

## Estado ahora (22:50)

- **Fase:** A1–A4 y A6 cerradas e integradas en `main`; A5 casi cerrada; a las 23:00 llegan PRD y fixtures (fase B).
- **Funciona (con evidencia):** test 206/206 · demo 2/2 · build OK · humo completo en Railway con Gemini (ver registro 22:50).
- **Falta:** importar en Vercel (U7), ajuste 3 (carga de `.env` en local), /code-review medium, security-auditor, confirmar `.env` (U1).
- **Siguiente paso:** fase B en cuanto el usuario diga dónde están PRD y fixtures; Vercel cuando haya hueco.
- **URL:** repo `github.com/JaimeUDistrital/reto-03-periferia-oc`; app https://reto-03-periferia-oc-production.up.railway.app
- **Último commit en GitHub:** `f7a3dfb`

## Registro (más reciente arriba)

### 23:20 · B1 cerrada, B2 lanzada · ORQ
- **Hecho:** PRD real leído (cambia el diseño: 5 herramientas `oc_*` con `execute → string`, RC1–RC10, confirmación conversacional con sesiones, SAP en archivos, 12 secciones de SOLUCION, bonus `modulo/`). Contratos en `src/domain/contratos-oc.ts`; fixtures reales en `fixtures/reto-03`; `test/core/casos.esperados.ts`; pdf-lib 1.17.1 y read-excel-file 9.3.14 con OK del usuario (`npm audit`: 0). Vercel retirado. Commit `6850373`, test 188/188.
- **Lanzados (Sonnet, worktrees):** CORE (alto), AGENTE (alto), UI (medio), DOCS (medio). ORQ: generador `scripts/modulo.ts` + `test/orq/modulo.test.ts`.
- **Pendiente exacto:** integrar ramas, `package.json` (`start` → `src/server.ts`, script `modulo`), `.env.example` (quitar `HITL_SECRET`, añadir `MAX_ITERACIONES`, `MAX_TOKENS_SESION`), tsconfig (`scripts`, `modulo`), demo 6/6, humo en Railway, push del usuario antes de la 01:00.

### 22:50 · A5 (humo en Railway) · ORQ
- **Hecho:** el usuario hizo push (`7085878..f7a3dfb`). Las 3 variables de Railway estaban guardadas pero sin aplicar: ORQ pulsó «Deploy» en Chrome.
- **Pruebas (curl contra la URL):** `/api/evaluar` ya sin `historial` en `fin` (versión nueva). Chat «Evalúa sol-001 y crea la OC» → `evaluarSolicitud` + `crearOrdenCompra` → `confirmacion_requerida` APROBABLE → `/api/confirmar` → `oc_creada` 4533205732 (HTTP 200); token alterado → 401; reenvío del mismo token → misma OC (el `creadaEn` cambia: el simulador no guarda estado).
- **Aviso:** `git status` muestra 14 archivos vacíos sin seguimiento (`.bashrc`, `.zshrc`, `!.env.example`…): puntos de montaje del sandbox; no están en ningún commit.
- **Pendiente exacto:** U7 Vercel; ajuste 3; /code-review medium; security-auditor; probar la UI en el navegador.

### 22:35 · A5 (parcial) · ORQ
- **Hecho:** merge A2 (`5550764`) y A1 (`7085878`, con plumbing de git porque `git merge` intenta guardar el estado y el sandbox tapa `.env.example`). Repo público creado por el usuario; `origin/main` = `7085878`.
- **Pruebas:** typecheck OK · test 198/198 · demo 2/2 exit 0 · humo con servidor real: `/api/salud` OK; `/api/evaluar` sol-001 → 7 tool_call/7 tool_result + `confirmacion_requerida`; `/api/confirmar` → `oc_creada` 4533205732; token alterado → 401; sol-002 → sin confirmación; CSP `default-src 'self'`.
- **Incidente:** el usuario pegó la clave real en `.env.example` (sin commitear). Comprobado con `git grep` que en GitHub la variable está vacía; plantilla local restaurada. Recomendado rotar la clave.
- **Pendiente exacto:** 1) `fin` de `/api/evaluar` (`src/server/app.ts:209`) borra el historial de la UI → `historial` opcional en `fin`; 2) `/api/solicitudes` devuelve `{solicitudes:[…]}` y la UI espera `string[]` (cae a la lista estática); 3) `dev:server` sin `--env-file-if-exists`; 4) reintento de confirmación si falla la red; 5) /code-review medium + security-auditor.

### A3 cerrada · UI (Sonnet/medium) → merge ORQ
- **Hecho:** reductor puro `web/src/estado.ts`, parser SSE `web/src/sse.ts`, cliente `web/src/api.ts`, componentes (tool card, HITL, expediente, OC, errores), `App.tsx`. Merge `f699b44`.
- **Pruebas (en main tras merge):** typecheck OK · test 19/19 · build OK (JS 72 kB gzip) · grep sin innerHTML.
- **Pendiente exacto (A5, al integrar con AGENTE):** 1) si `/api/confirmar` falla, conservar la confirmación pendiente para reintentar (seguro: SAP idempotente); 2) que `fin` de `/api/evaluar` no borre el historial del chat (backend sin `fin` ahí o UI que lo ignore); 3) no probada aún en navegador ni contra el backend real.

### A4 cerrada · DOCS (Sonnet/medium) → merge ORQ
- **Hecho:** README.md, SOLUCION.md (8 secciones, 6 ADR, 2 diagramas Mermaid), docs/GLOSSARY.md. Merge `a352934`.
- **Pendiente exacto (B3):** rellenar `<!-- MATRIZ … -->` y `<!-- DATOS REALES B3 -->` en SOLUCION; `<!-- URL -->` en README; revisar las 16 marcas «(no verificado)» (nombres técnicos de campos SAP, cliente RFC para Node, auth OData, BAPIRET2); citar bien la fuente de Railpack (`https://railpack.com/languages/node`).

### 21:58 · A0 cerrada · ORQ (Opus 5.5)
- **Hecho:** deps exactas (verificadas por `verificador`); `tsconfig` raíz y web; `src/domain/contratos.ts` (+ fachada `NucleoOC`); stub `src/tools/oc.ts`; servidor y web mínimos; CI; PLAN con stack verificado y HITL sin estado (HMAC).
- **Pruebas:** typecheck OK · test 2/2 · build OK · `/api/salud` OK.
- **Decisiones:** scripts con `node --import tsx` (la CLI `tsx` abre un socket que el sandbox bloquea); Node ≥ 22.12 por @google/genai 3.1.0.
- **Lanzados:** A1 CORE (Sonnet/high), A2 AGENTE (Sonnet/high), A3 UI (Sonnet/medium), A4 DOCS (Sonnet/medium).

### 21:55 · A0 · ORQ (Opus 5.5)
- **Hecho:** `git init -b main`; `.gitignore` (secretos, entorno local, documentos personales y del cliente); `.env.example`; `docs/PLAN.md`; este archivo.
- **Pruebas:** — (aún sin código).
- **Pendiente exacto:** `package.json` con versiones verificadas, `tsconfig`, `src/domain/contratos.ts`, 2 mocks en `fixtures/reto-03/`, `.github/workflows/ci.yml`, primer commit.
