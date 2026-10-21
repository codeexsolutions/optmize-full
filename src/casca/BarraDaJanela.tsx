/**
 * ===========================================================================
 * A BARRA DA JANELA — minimizar, maximizar e fechar, no lugar da do Windows
 * ===========================================================================
 *
 * Desde 2026-10-21 a janela do programa nasce sem a barra do Windows
 * (`decorations(!cheia)`, em src-tauri/src/main.rs). O nome do programa não
 * aparece em lugar nenhum aqui: ele já está na barra lateral. O que sobra é
 * uma faixa fina no topo, na cor da tela, que:
 *
 *   - ARRASTA a janela (segurar e mover em qualquer ponto vazio dela);
 *   - MAXIMIZA e restaura com dois cliques, como a barra do Windows fazia;
 *   - tem os três botões à direita, no desenho do Optmize — o de fechar fica
 *     vermelho quando o mouse passa, como no Windows, para ninguém fechar o
 *     programa achando que estava minimizando.
 *
 * Só existe DENTRO DO PROGRAMA INSTALADO: no navegador (o desenvolvimento, a
 * bancada) não há janela para mexer, e a barra nem nasce — ver `naJanela`.
 *
 * Fala com a janela pelo IPC do Tauri (`__TAURI_INTERNALS__`, que o Tauri
 * injeta em toda janela dele, inclusive na que abre o servidor local). As
 * permissões estão em src-tauri/capabilities/principal.json.
 */

import { useCallback, useEffect, useState, type MouseEvent } from "react";

/** A altura da barra, em px. O CSS repete o número em `--barra-da-janela`. */
export const ALTURA_DA_BARRA = 34;

type Tauri = { invoke: (comando: string, argumentos?: Record<string, unknown>) => Promise<unknown> };
const tauri = (): Tauri | null => (window as unknown as { __TAURI_INTERNALS__?: Tauri }).__TAURI_INTERNALS__ ?? null;

/** O programa está aberto na janela do Tauri, e não num navegador? */
export const naJanela = (): boolean => tauri() !== null;

const JANELA = { label: "principal" };
const pedir = (comando: string) => tauri()?.invoke(`plugin:window|${comando}`, JANELA);

export function BarraDaJanela() {
  const [maximizada, setMaximizada] = useState(false);

  // O ícone do meio troca entre "maximizar" e "restaurar": a janela muda de
  // tamanho por aqui, pelo Windows (Win+seta) ou arrastando — a conferência
  // vai no `resize`, que dispara nos três casos.
  const conferir = useCallback(() => {
    void pedir("is_maximized")?.then((sim) => setMaximizada(Boolean(sim))).catch(() => {});
  }, []);
  useEffect(() => {
    conferir();
    let espera: number | undefined;
    const aoMudar = () => { window.clearTimeout(espera); espera = window.setTimeout(conferir, 120); };
    window.addEventListener("resize", aoMudar);
    return () => { window.removeEventListener("resize", aoMudar); window.clearTimeout(espera); };
  }, [conferir]);

  // Segurar no vazio arrasta; os botões não. Só o botão esquerdo do mouse.
  const arrastar = (evento: MouseEvent<HTMLDivElement>) => {
    if (evento.button !== 0 || (evento.target as HTMLElement).closest("button")) return;
    if (evento.detail === 2) { void pedir("toggle_maximize"); return; }
    void pedir("start_dragging");
  };

  return (
    <div className="barra-da-janela" onMouseDown={arrastar} role="presentation">
      <div className="barra-da-janela-botoes">
        <button type="button" className="barra-da-janela-botao" aria-label="Minimizar" title="Minimizar" onClick={() => void pedir("minimize")}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5h8" /></svg>
        </button>
        <button
          type="button"
          className="barra-da-janela-botao"
          aria-label={maximizada ? "Restaurar" : "Maximizar"}
          title={maximizada ? "Restaurar" : "Maximizar"}
          onClick={() => { void pedir("toggle_maximize")?.then(conferir); }}
        >
          {maximizada ? (
            <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="3.5" width="6.5" height="6.5" rx="1.2" /><path d="M4 3.5V2.8A0.8 0.8 0 0 1 4.8 2h4.4a0.8 0.8 0 0 1 0.8 0.8v4.4a0.8 0.8 0 0 1-0.8 0.8h-0.7" /></svg>
          ) : (
            <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.4" /></svg>
          )}
        </button>
        <button type="button" className="barra-da-janela-botao fechar" aria-label="Fechar" title="Fechar" onClick={() => void pedir("close")}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}
