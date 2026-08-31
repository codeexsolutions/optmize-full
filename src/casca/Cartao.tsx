/**
 * O cartão: a caixa em que todo conteúdo de tela mora.
 *
 * A tela antiga tinha `.card` + `.card-head` em CSS à mão, e cada tela foi
 * ajustando o espaçamento do seu jeito ao longo do tempo. Aqui a medida é uma
 * só, e o cabeçalho da seção deixa de ser markup repetido para virar
 * propriedade: título, apoio e o botão da direita.
 */

import type { ReactNode } from "react";
import { Icone } from "./Icone";

interface Props {
  titulo?: string;
  apoio?: string;
  /** Referência do sprite, quando a seção merece um ícone. */
  icone?: string;
  /** O que vai na ponta direita do cabeçalho, normalmente o botão da ação. */
  acao?: ReactNode;
  children: ReactNode;
}

export function Cartao({ titulo, apoio, icone, acao, children }: Props) {
  return (
    <section className="mb-3.5 rounded-xl border border-linha bg-painel px-[22px] py-[21px] shadow-[var(--shadow)]">
      {(titulo || acao) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {icone && (
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-linha bg-painel-suave text-tinta-fraca"
              >
                <Icone referencia={icone} className="size-[17px]" />
              </span>
            )}
            <div className="min-w-0">
              {titulo && <h2 className="m-0 font-titulo text-[1.05rem] font-semibold tracking-[-0.02em] text-tinta">{titulo}</h2>}
              {apoio && <p className="mt-1 mb-0 text-[0.83rem] text-tinta-fraca">{apoio}</p>}
            </div>
          </div>
          {acao && <div className="shrink-0">{acao}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
