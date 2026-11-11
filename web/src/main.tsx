import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Falta #root en index.html");

createRoot(raiz).render(
  <StrictMode>
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <App />
    </div>
  </StrictMode>,
);
