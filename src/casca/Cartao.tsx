/**
 * O cartão: a caixa em que todo conteúdo de tela mora.
 *
 * A tela antiga tinha `.card` + `.card-head` em CSS à mão, e cada tela foi
 * ajustando o espaçamento do seu jeito ao longo do tempo. Aqui a medida é uma
 * só, e o cabeçalho da seção deixa de ser markup repetido para virar
 * propriedade: título, apoio e o botão da direita.
 *
 * ---------------------------------------------------------------------------
 * `preencher`: O CARTÃO QUE OCUPA O QUE SOBRA DA JANELA
 * ---------------------------------------------------------------------------
 *
 * Sem ele, o cartão tem a altura do que há dentro — e numa tela de lista isso
 * deixava o painel com um vazio preto do fim do cartão até o rodapé da janela,
 * enquanto a lista de verdade rolava a PÁGINA inteira, levando o título junto
 * para fora da vista.
 *
 * Com ele, o cartão cresce até o pé da janela e a rolagem passa a ser DE
 * DENTRO: o título e o filtro ficam parados, e só a lista corre. É como o
 * Encaixe sempre funcionou, e é o que se espera de um painel que fica aberto
 * num monitor da produção o dia inteiro.
 *
 * Vale para UM cartão por tela — o da lista. Dois crescendo dividiriam a
 * sobra, e nenhuma das duas listas ficaria com altura útil.
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
  /**
   * Este cartão ocupa a altura que sobra, e o conteúdo dele rola por dentro.
   * Um por tela. Ver o cabeçalho.
   */
  preencher?: boolean;
  children: ReactNode;
}

export function Cartao({ titulo, apoio, icone, acao, preencher, children }: Props) {
  return (
    <section
      className={[
        "rounded-xl border border-linha bg-painel px-[22px] py-[21px] shadow-[var(--shadow)]",
        /*
         * O piso de 220px não é enfeite. Numa tela em que os cartões de cima
         * já passam da janela, um `min-h-0` deixaria este espremer até quase
         * nada — a lista viraria uma fresta. Com o piso, ele para de encolher,
         * a página passa a rolar (ver o `overflow-y-auto` da casca) e a lista
         * continua com altura de trabalho.
         */
        // `last:mb-0`: o respiro entre cartões não vira sobra no pé da janela.
        preencher ? "flex min-h-[220px] flex-1 flex-col" : "mb-3.5 last:mb-0",
      ].join(" ")}
    >
      {(titulo || acao) && (
        <div className={`flex items-start justify-between gap-4 ${preencher ? "mb-4 shrink-0" : "mb-4"}`}>
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

      {/*
        A margem negativa devolve o respiro lateral do cartão à barra de
        rolagem: sem ela a barra nasce colada no texto, e com `pr` no lugar
        dela o conteúdo ficaria desalinhado do cabeçalho acima.
      */}
      {preencher
        ? <div className="-mr-[10px] min-h-0 flex-1 overflow-y-auto pr-[10px]">{children}</div>
        : children}
    </section>
  );
}
