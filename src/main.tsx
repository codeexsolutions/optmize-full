/**
 * A entrada da tela nova. O `entrada.css` traz a paleta e os utilitários;
 * daqui para baixo não existe mais folha de estilo à mão.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../estilo/entrada.css";
import { App } from "./App";

/*
 * O LINK ANTIGO, COM "#", CONTINUA LEVANDO À TELA CERTA
 *
 * O painel morou em `#/moldes` por toda a migração, e a fábrica tem isso
 * salvo: atalho na área de trabalho, aba aberta, link colado num grupo. Sem
 * esta tradução, cada um desses cairia na tela inicial sem explicação —
 * porque para o `BrowserRouter` o "#" é só lixo no fim do endereço.
 *
 * `replaceState` e não `location.replace`: assim não há uma segunda ida ao
 * servidor nem uma entrada a mais no histórico; o endereço simplesmente já
 * nasce limpo, antes de o React montar e ler a rota.
 */
const telaNoHash = window.location.hash.replace(/^#\/?/, "");
if (telaNoHash) {
  window.history.replaceState(null, "", `/${telaNoHash}`);
}

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta a <div id=\"raiz\"> no index.html.");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
