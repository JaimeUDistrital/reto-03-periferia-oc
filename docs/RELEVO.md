# RELEVO — estado y bitácora (archivo único)

> ¿Entras a mitad? 1) Lee «Estado ahora». 2) Corre `npm run typecheck && npm test && npm run demo`.
> 3) Sigue «Siguiente paso». Plan completo en [`PLAN.md`](PLAN.md); qué falta y qué está hecho, en su §0 (tablero).
> Solo escribe el orquestador.

## Estado ahora (21:58)

- **Fase:** A0 cerrada; A1 CORE, A2 AGENTE, A3 UI y A4 DOCS en paralelo (worktrees en `.claude/worktrees/`).
- **Funciona (con evidencia):** `npm run typecheck` OK · `npm test` 2/2 · `npm run build` OK · servidor local `/api/salud` → `{"ok":true}`.
- **Falta:** repo en GitHub, proyecto en Railway, `.env` y commit de `.env.example` (los hace el usuario: el sandbox tapa `.env*` y no tiene credenciales de git).
- **Siguiente paso:** A5 — merge de las 4 ramas, /code-review medium, security-auditor, deploy y humo en la URL.
- **URL:** —
- **Último commit:** `0603d39`

## Registro (más reciente arriba)

### 21:58 · A0 cerrada · ORQ (Opus 5.5)
- **Hecho:** deps exactas (verificadas por `verificador`); `tsconfig` raíz y web; `src/domain/contratos.ts` (+ fachada `NucleoOC`); stub `src/tools/oc.ts`; servidor y web mínimos; CI; PLAN con stack verificado y HITL sin estado (HMAC).
- **Pruebas:** typecheck OK · test 2/2 · build OK · `/api/salud` OK.
- **Decisiones:** scripts con `node --import tsx` (la CLI `tsx` abre un socket que el sandbox bloquea); Node ≥ 22.12 por @google/genai 3.1.0.
- **Lanzados:** A1 CORE (Sonnet/high), A2 AGENTE (Sonnet/high), A3 UI (Sonnet/medium), A4 DOCS (Sonnet/medium).

### 21:55 · A0 · ORQ (Opus 5.5)
- **Hecho:** `git init -b main`; `.gitignore` (secretos, entorno local, documentos personales y del cliente); `.env.example`; `docs/PLAN.md`; este archivo.
- **Pruebas:** — (aún sin código).
- **Pendiente exacto:** `package.json` con versiones verificadas, `tsconfig`, `src/domain/contratos.ts`, 2 mocks en `fixtures/reto-03/`, `.github/workflows/ci.yml`, primer commit.
