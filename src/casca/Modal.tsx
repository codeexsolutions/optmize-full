/**
 * ===========================================================================
 * MODAL — a caixa com conteúdo
 * ===========================================================================
 *
 * Desde 2026-10-21 é o mesmo desenho dos modais da produção (`.modal-ajustes`,
 * em `producao/producao.css`): o topo com o selo do ícone (anel e brilho na
 * cor do destaque), o título e uma linha de apoio sobre um brilho suave que
 * desce do alto; o miolo; e o RODAPÉ numa faixa própria, separada por um
 * traço, com os botões ocupando a largura toda — a ação fica embaixo, onde a
 * leitura termina.
 *
 * ---------------------------------------------------------------------------
 * ELE NÃO É A CAIXA DE DIÁLOGO
 * ---------------------------------------------------------------------------
 *
 * `casca/Dialogo.tsx` responde PERGUNTAS — sim/não, um nome, um aviso — e
 * devolve promessa: quem chama escreve `await` e segue na linha de baixo.
 *
 * Este aqui é uma CAIXA COM CONTEÚDO: campos, contas, o que a tela quiser
 * desenhar dentro. Quem manda nele é o estado da tela, e não uma promessa.
 *
 * Fecha no Esc e no clique no véu — as duas saídas que se espera de qualquer
 * caixa. O `aoFechar` é sempre o mesmo caminho do ×: desistir não pode
 * depender de onde a pessoa clicou.
 */

import { useEffect, type ReactNode } from "react";
import { Icone } from "./Icone";
import { useCliqueNoVeu } from "./cliqueNoVeu";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  /** Uma linha embaixo do título, dizendo o que se faz ali. */
  subtitulo?: string;
  /** Referência do sprite para o selo do topo. */
  icone?: string;
  /** Os botões do pé — cada um ocupa uma parte igual da largura. */
  rodape?: ReactNode;
  /** A largura máxima da caixa, em px (padrão 440). */
  largura?: number;
  children: ReactNode;
}

export function Modal({ aberto, aoFechar, titulo, subtitulo, icone, rodape, largura = 440, children }: Props) {
  const veu = useCliqueNoVeu(aoFechar);
  useEffect(() => {
    if (!aberto) return;
    const noEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      {...veu}
      className="fixed inset-0 z-90 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animar-entrada"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(evento) => evento.stopPropagation()}
        style={{ maxWidth: largura }}
        className="modal-caixa relative flex max-h-[calc(100vh-32px)] w-full flex-col overflow-hidden rounded-[20px] border border-[var(--border-hairline)]"
      >
        <div className="flex items-center gap-3.5 px-[22px] pt-[22px] pb-[18px]">
          {icone && (
            <span className="modal-caixa-selo grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-[var(--accent-soft)] text-ambar">
              <Icone referencia={icone} className="size-[21px]" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="m-0 font-titulo text-[1.12rem] leading-tight text-tinta">{titulo}</h2>
            {subtitulo && <p className="mt-[3px] mb-0 text-[12px] text-tinta-apagada">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-8 shrink-0 self-start place-items-center rounded-[10px] text-tinta-apagada transition-colors hover:bg-[var(--surface-hover)] hover:text-tinta"
          >
            <Icone referencia="icones.svg#x" className="size-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-[22px] pb-[22px] text-sm text-tinta-fraca">{children}</div>

        {rodape && <div className="modal-caixa-rodape flex gap-2.5 px-[22px] pt-4 pb-[18px]">{rodape}</div>}
      </div>
    </div>
  );
}
