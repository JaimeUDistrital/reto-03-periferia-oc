# Reto 3 · Agente de Órdenes de Compra (SAP simulado)

Agente conversacional en TypeScript que valida solicitudes de compra contra maestros JSON y crea órdenes de compra (OC) en un SAP simulado.
El dictamen lo calcula código determinista; el LLM (Google Gemini) solo orquesta las herramientas y explica el resultado.
La OC no se crea sin la confirmación explícita de una persona (HITL, *human in the loop*).

## URL pública

<!-- URL -->

## Requisitos

- Node.js ≥ 22.12 (campo `engines` de `package.json`).
- Para el chat con IA: una clave de la API de Gemini. `npm run demo`, `npm test` y el modo «Evaluar sin IA» no necesitan red ni clave.

## Instalación y comandos

```bash
npm ci
```

| Comando | Qué hace |
|---|---|
| `npm run demo` | Evalúa sol-001…sol-006 sin red ni clave; termina con código ≠ 0 si algún dictamen no es el esperado |
| `npm test` | Ejecuta las pruebas (`node:test`) |
| `npm run typecheck` | Comprueba tipos del servidor y de la web |
| `npm run build && npm start` | Compila la web y arranca servidor + web en un solo proceso |
| `npm run dev:server` + `npm run dev:web` | Desarrollo: servidor con recarga y Vite, en dos terminales |

## Variables de entorno

Se leen del entorno del proceso (en local, de un archivo de entorno que no se versiona; el repositorio solo debe llevar una plantilla de ejemplo). Aquí van sin valores.

| Variable | Uso |
|---|---|
| `GEMINI_API_KEY` | Clave de la API de Gemini. Solo vive en el servidor |
| `GEMINI_MODEL` | Modelo a usar (por defecto `gemini-3.6-flash`, según `docs/PLAN.md` §3) |
| `HITL_SECRET` | Secreto para firmar (HMAC) el token de confirmación humana |
| `PORT` | Puerto HTTP del servidor |

## Estructura

```
agent/prompt.md              system prompt del agente
src/domain/                  contratos, controles puros y evaluarSolicitud()
src/data/                    loaders y esquemas Zod de los fixtures (capa anticorrupción)
src/tools/oc.ts              tools con zod y exports puros para demo.ts
src/sap/simulador.ts         SapGateway simulado, idempotente por solicitud
src/security/                redact, mask, envoltura de documentos, límites
src/agent/                   bucle LLM ↔ tools y adaptador a Gemini
src/server/                  Hono: /api/chat (SSE), /api/confirmar, /api/evaluar, estáticos
web/                         React + Vite + Tailwind
fixtures/reto-03/            solicitudes y maestros de ejemplo
demo.ts                      los 6 casos sin LLM
test/                        pruebas por dueño
docs/                        PLAN, GLOSSARY, RELEVO
```

Algunas carpetas se crean a medida que avanzan las tareas; el mapa completo está en `docs/PLAN.md` §3.

## Más documentación

- [SOLUCION.md](SOLUCION.md): arquitectura, ciclo del agente, matriz de controles, seguridad, adaptador SAP real, análisis de compras retroactivas y decisiones.
- [docs/PLAN.md](docs/PLAN.md): plan de trabajo.
- [docs/GLOSSARY.md](docs/GLOSSARY.md): glosario del dominio.
