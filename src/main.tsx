/**
 * A entrada da tela nova. O `entrada.css` traz a paleta e os utilitários;
 * daqui para baixo não existe mais folha de estilo à mão.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// A Inter vem DENTRO do programa: sem ela, a máquina que não a tem instalada
// mostraria outra letra. Ver o tokens.css.
import "@fontsource-variable/inter";
import "../estilo/entrada.css";
import { App } from "./App";
import { ProvedorDeAlerta } from "./casca/Alerta";
import { CamadaDeEntrada } from "./telas/Entrada";
import { aplicarModoLeve } from "./estado/leve";
import { aplicarTema } from "./estado/tema";
import { BarraDaJanela, naJanela } from "./casca/BarraDaJanela";

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

// Antes de montar: o primeiro quadro já sai sem o que a máquina não aguenta,
// e já no tema escolhido — sem piscar escuro antes de ficar claro.
aplicarModoLeve();
aplicarTema();

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta a <div id=\"raiz\"> no index.html.");

/*
 * A BARRA DA JANELA, só no programa instalado (ver `casca/BarraDaJanela.tsx`).
 * Ela mora FORA da raiz, numa faixa própria no topo; a classe `na-janela` no
 * <html> desce o programa inteiro para baixo dela (ver `estilo/entrada.css`).
 */
if (naJanela()) {
  document.documentElement.classList.add("na-janela");
  const faixa = document.createElement("div");
  faixa.id = "barra-da-janela";
  document.body.prepend(faixa);
  createRoot(faixa).render(<BarraDaJanela />);
}

createRoot(raiz).render(
  <StrictMode>
    {/*
      O ALERTA E A ENTRADA FICAM ACIMA DE TUDO. O login usa o alerta antes de
      a casca existir, e a entrada precisa continuar na tela enquanto o login
      é desmontado e o programa monta atrás dela (ver `telas/Entrada.tsx`).
    */}
    <ProvedorDeAlerta>
      <App />
      <CamadaDeEntrada />
    </ProvedorDeAlerta>
  </StrictMode>,
);
