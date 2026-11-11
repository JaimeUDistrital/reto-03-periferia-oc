// Esqueleto mínimo (A0) para validar el despliegue. AGENTE lo amplía en A2.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const app = new Hono();

app.get("/api/salud", (c) => c.json({ ok: true }));
app.use("/*", serveStatic({ root: "./dist/web" }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Servidor escuchando en el puerto ${info.port}`);
});
