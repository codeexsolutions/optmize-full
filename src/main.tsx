/**
 * A entrada da tela nova. O `entrada.css` traz a paleta e os utilitários;
 * daqui para baixo não existe mais folha de estilo à mão.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../estilo/entrada.css";
import { App } from "./App";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta a <div id=\"raiz\"> no index.html.");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
