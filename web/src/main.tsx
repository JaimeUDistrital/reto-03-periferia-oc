// Esqueleto mínimo (A0). UI lo reemplaza en A3.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Falta #root en index.html");

createRoot(raiz).render(
  <StrictMode>
    <main className="min-h-screen bg-zinc-950 p-8 font-mono text-zinc-100">Agente OC · en construcción</main>
  </StrictMode>,
);
