# Reto 3 · Agente de Órdenes de Compra (SAP simulado)

Agente conversacional en TypeScript que lee el paquete de una compra (solicitud, cotización, aprobación, factura), lo valida contra los maestros con las reglas RC1–RC10, genera la evidencia y crea la orden de compra (OC) en un SAP simulado. Lo dudoso se devuelve a una persona con los dos valores a la vista; el modelo (Gemini) orquesta y explica, y no puede crear una OC sin confirmación humana.

- **Link público:** https://reto-03-periferia-oc-production.up.railway.app
- **Repositorio:** https://github.com/JaimeUDistrital/reto-03-periferia-oc
- **Planteamiento completo:** [SOLUCION.md](SOLUCION.md)

## Requisitos

- Node.js ≥ 22.12. Probado con Node; **no lo probé con Bun**.
- Para el chat con IA: una clave de la API de Gemini. Sin clave, el chat avisa y el botón «Revisar sin IA», `npm run demo` y `npm test` funcionan igual.

## Arranque local

```bash
npm install
npm run dev
```

`npm run dev` compila el front y levanta el backend (API y web en el mismo proceso) en `http://localhost:3000`. Para usar el chat con IA, copia `.env.example` a un archivo de entorno local, pon tu clave y vuelve a arrancar.

## Variables de entorno

La plantilla es `.env.example`. La clave real nunca se versiona.

| Variable | Para qué | Valor por defecto |
|---|---|---|
| `GEMINI_API_KEY` | Clave de la API de Gemini. Solo la lee el backend | vacía: el chat avisa |
| `GEMINI_MODEL` | Modelo de Gemini | `gemini-3.6-flash` |
| `PORT` | Puerto HTTP | `3000` |
| `MAX_ITERACIONES` | Tope de vueltas herramienta → modelo por turno | 25 <!-- VERIFICAR --> |
| `MAX_TOKENS_SESION` | Tope de tokens acumulados por sesión | <!-- VERIFICAR: valor --> |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Compila el front y levanta el backend |
| `npm run demo` | Procesa los 6 casos llamando a las herramientas, sin modelo ni clave |
| `npm test` | Ejecuta los tests (`node:test`) |
| `npm run typecheck` | Comprueba tipos del servidor y del front |

### Qué imprime `npm run demo`

Por cada caso de `fixtures/reto-03/solicitudes/`: `apta`, bloqueos, confirmaciones, `retroactiva`, y el número de OC o el motivo de que no se cree. También muestra la idempotencia (sol-001 dos veces devuelve la misma OC) y la confirmación explícita de sol-004. Con `out/` limpio la numeración sale `4500000001` a `4500000004`. <!-- VERIFICAR: salida real de `npm run demo` una vez integrado el núcleo -->

## API

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId, message, confirmar? }` → stream SSE de eventos (`tool_call`, `tool_result`, `confirmacion_requerida`, `oc_creada`, `mensaje`, `error`, `fin`) |
| `GET` | `/api/sessions/:id` | Historial completo de la sesión |
| `GET` | `/api/health` | `{ ok: true, provider, model }`, sin exponer claves |
| `GET` | `/api/casos` | Lista de casos disponibles |
| `POST` | `/api/evaluar` | Revisa un caso sin IA (mismas herramientas que el chat) |

<!-- VERIFICAR: formatos exactos de petición y respuesta de /api/casos y /api/evaluar -->

## Estructura

```
agent/prompt.md              comportamiento: system prompt del agente
src/server.ts                API HTTP y ciclo del agente
src/llm/                     adapter.ts (interfaz) y gemini.ts (implementación)
src/tools/oc.ts              ejecución: herramientas con zod (cada export → oc_<export>)
src/sap/                     adapter.ts (interfaz SapAdapter) y mock.ts (sobre out/sap/)
src/knowledge/               conocimiento: ordenes-compra.md
web/                         front de chat (React)
modulo/                      bonus: agente empaquetado como módulo reutilizable
fixtures/                    entradas del reto, solo lectura
out/                         generado en ejecución (OC simuladas, control.csv, evidencia, log)
demo.ts                      las herramientas sin modelo
docs/                        PLAN, RELEVO, GLOSSARY
```

<!-- VERIFICAR: la estructura real tras el merge (hay carpetas de la fase A como src/domain/ y src/data/ que pueden seguir) -->

## Prompt de demo

En una sesión nueva del chat:

```
Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué
validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.
```

Resultado esperado: la OC resumida en una tabla, la confirmación RC5 con los dos valores (solicitud 25.000.000 vs cotización 26.500.000), las llamadas a herramientas visibles y una pregunta que cierra el turno. Tras escribir «confirmo», el número de OC y la ruta de la evidencia.

## Seguridad

La clave de Gemini vive solo en el backend, en variable de entorno. No aparece en el front, el repositorio, los logs ni las respuestas de la API. Las herramientas no ejecutan comandos de shell. El link público no tiene autenticación; los datos son ficticios.
