# RELEVO — estado y bitácora (archivo único)

> ¿Entras a mitad? 1) Lee «Estado ahora». 2) Corre `npm run typecheck && npm test && npm run demo`.
> 3) Sigue «Siguiente paso». Plan completo en [`PLAN.md`](PLAN.md). Solo escribe el orquestador.

## Estado ahora (21:55)

- **Fase:** A0 en curso.
- **Funciona (con evidencia):** —
- **Falta:** deps, contratos, mocks, CI, primer commit; repo en GitHub y proyecto en Railway (usuario).
- **Siguiente paso:** cerrar A0 y lanzar A1–A4 en paralelo.
- **URL:** —
- **Último commit:** —

## Registro (más reciente arriba)

### 21:55 · A0 · ORQ (Opus 5.5)
- **Hecho:** `git init -b main`; `.gitignore` (secretos, entorno local, documentos personales y del cliente); `.env.example`; `docs/PLAN.md`; este archivo.
- **Pruebas:** — (aún sin código).
- **Pendiente exacto:** `package.json` con versiones verificadas, `tsconfig`, `src/domain/contratos.ts`, 2 mocks en `fixtures/reto-03/`, `.github/workflows/ci.yml`, primer commit.
