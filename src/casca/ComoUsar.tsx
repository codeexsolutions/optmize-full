/**
 * ===========================================================================
 * COMO USAR — o vídeo de cada tela, aberto de onde a pessoa estiver
 * ===========================================================================
 *
 * Pedido do dono (2026-10-27): um botão "Como usar" em cada item do menu e na
 * própria tela, abrindo o vídeo daquela tela na horizontal. O do Encaixe é a
 * aula narrada (a produção entrando com a quantidade no nome, a cor que não
 * muda, o encaixe sendo feito); os outros são as gravações curtas do site.
 *
 * Qual tela tem vídeo é a tabela de rotas que diz (`comoUsar`, em rotas.ts):
 * tela sem vídeo não ganha botão — um botão que abre "em breve" ensina a
 * pessoa a não clicar nele.
 *
 * A janela mora num estado fora do React, como a entrada (`Entrada.tsx`): o
 * botão do menu e o da tela abrem a MESMA janela, e ela fica acima de tudo,
 * montada uma vez na casca (`<JanelaComoUsar/>`).
 */

import { useEffect, useSyncExternalStore } from "react";

import { Icone } from "./Icone";
import { PlayerDeVideo } from "./PlayerDeVideo";
import { TELAS, type Tela } from "../rotas";

let aberta: Tela | null = null;
const ouvintes = new Set<() => void>();

function mudar(tela: Tela | null) {
  aberta = tela;
  ouvintes.forEach((ouvir) => ouvir());
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

/** Abre o vídeo de uma tela. Tela sem vídeo não faz nada. */
export function abrirComoUsar(tela: Tela) {
  if (tela.comoUsar) mudar(tela);
}

/** O botão da tela: "Como usar", com o ícone de ajuda. */
export function BotaoComoUsar({ tela, className = "" }: { tela: Tela; className?: string }) {
  if (!tela.comoUsar) return null;
  return (
    <button
      type="button"
      onClick={() => abrirComoUsar(tela)}
      title={`Ver o vídeo de como usar ${artigoDe(tela)}${tela.rotulo}`}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 text-[12px] text-ambar transition-colors hover:bg-ambar hover:text-ambar-tinta ${className}`}
    >
      <Icone referencia="icones.svg#circle-help" className="size-3.5" />
      Como usar
    </button>
  );
}

/**
 * O mesmo botão, achado pelo nome da tela. É o que as telas usam por dentro
 * (o Encaixe, na barra do zoom): a tela é importada pela tabela de rotas, e
 * importar a tabela de volta no corpo do módulo daria a volta antes de ela
 * existir. Aqui ela só é lida no desenho, quando já existe.
 */
export function BotaoComoUsarDa({ nome, className }: { nome: Tela["nome"]; className?: string }) {
  const tela = TELAS.find((t) => t.nome === nome);
  return tela ? <BotaoComoUsar tela={tela} className={className} /> : null;
}

/** "o Encaixe", "a Montagem": a frase do balão. */
function artigoDe(tela: Tela): string {
  return tela.comoUsar?.feminino ? "a " : "o ";
}

/** A janela do vídeo. Uma só, montada pela casca. */
export function JanelaComoUsar() {
  const tela = useSyncExternalStore(assinar, () => aberta);

  useEffect(() => {
    if (!tela) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") mudar(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [tela]);

  if (!tela || !tela.comoUsar) return null;
  const { video, capitulos } = tela.comoUsar;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Como usar ${artigoDe(tela)}${tela.rotulo}`}
      className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-6 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) mudar(null); }}
    >
      <div className="flex w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-linha bg-painel shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-3 border-b border-linha px-4 py-2.5">
          <p className="m-0 flex min-w-0 items-center gap-2 text-[14px] text-tinta">
            <Icone referencia={tela.icone} className="size-4 shrink-0 text-ambar" />
            <span className="truncate">Como usar {artigoDe(tela)}{tela.rotulo}</span>
          </p>
          <button
            type="button"
            onClick={() => mudar(null)}
            aria-label="Fechar o vídeo"
            className="grid size-8 place-items-center rounded-md text-tinta-fraca transition-colors hover:bg-[var(--surface-hover)] hover:text-tinta"
          >
            <Icone referencia="icones.svg#x" className="size-4" />
          </button>
        </div>
        {/*
          16:9 de verdade, e o vídeo inteiro à vista: é aula, e o que se corta
          na borda é justamente o botão que ela aponta. O player é o da casa
          (`PlayerDeVideo`), com os capítulos na linha do tempo e o som.
        */}
        <PlayerDeVideo
          key={video}
          src={video}
          poster={video.replace(/\.mp4$/, ".webp")}
          capitulos={capitulos}
          rotulo={`Como usar ${artigoDe(tela)}${tela.rotulo}`}
          className="max-h-[calc(100vh-140px)] w-full"
        />
      </div>
    </div>
  );
}
