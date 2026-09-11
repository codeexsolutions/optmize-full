/**
 * ===========================================================================
 * MODAL — a caixa do Optmize Lite
 * ===========================================================================
 *
 * Véu escuro com desfoque, caixa de cantos bem redondos, um selo de ícone no
 * canto, título, o miolo e os botões à direita. É o `Modal` de
 * `components/ui/index.tsx` da Lite, reproduzido com os tokens daqui.
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
 * Confundir os dois daria um diálogo que precisa de estado ou um modal que
 * finge ser função.
 *
 * Fecha no Esc e no clique no véu — as duas saídas que se espera de qualquer
 * caixa. O `onClose` é sempre o mesmo caminho do botão "Cancelar": desistir
 * não pode depender de onde a pessoa clicou.
 */

import { useEffect, type ReactNode } from "react";
import { Icone } from "./Icone";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  /** Referência do sprite para o selo do canto. */
  icone?: string;
  /** Os botões, à direita do pé. */
  rodape?: ReactNode;
  children: ReactNode;
}

export function Modal({ aberto, aoFechar, titulo, icone, rodape, children }: Props) {
  useEffect(() => {
    if (!aberto) return;
    const noEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      onClick={aoFechar}
      className="fixed inset-0 z-90 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animar-entrada"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(evento) => evento.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-linha bg-painel-suave p-6 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start gap-3">
          {icone && (
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-ambar">
              <Icone referencia={icone} className="size-5" />
            </span>
          )}
          <h2 className="m-0 flex-1 font-titulo text-base font-semibold text-tinta">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-tinta-apagada transition-colors hover:bg-[var(--surface-hover)] hover:text-tinta"
          >
            <Icone referencia="icones.svg#x" className="size-4" />
          </button>
        </div>

        <div className="mt-4 text-sm text-tinta-fraca">{children}</div>

        {rodape && <div className="mt-6 flex justify-end gap-2">{rodape}</div>}
      </div>
    </div>
  );
}
