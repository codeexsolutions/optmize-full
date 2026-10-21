/**
 * O cabeçalho da página, no desenho do Flow (`shared/ui/HeaderPage.tsx`, no
 * outro repositório): o ícone numa caixa com brilho, o título com a linha de
 * apoio EMBAIXO dele, e à direita o lugar das abas e das ações da tela.
 *
 * Ele não sabe qual tela está aberta — recebe a linha da tabela de rotas e
 * desenha. O que vai à direita é a TELA quem põe, com `<NoCabecalho>`: um
 * portal para dentro do espaço que este cabeçalho abre. Assim Configurações
 * põe as abas no topo, como no Flow, sem o cabeçalho saber que existem abas.
 */

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icone } from "./Icone";
import type { Tela } from "../rotas";

/** O espaço à direita do cabeçalho, para o portal das telas. */
const EspacoDoCabecalho = createContext<HTMLElement | null>(null);
export const ProvedorDoEspacoDoCabecalho = EspacoDoCabecalho.Provider;

/** Põe o conteúdo à direita do cabeçalho (abas, botões). Sem cabeçalho, não aparece. */
export function NoCabecalho({ children }: { children: ReactNode }) {
  const espaco = useContext(EspacoDoCabecalho);
  return espaco ? createPortal(children, espaco) : null;
}

export function Cabecalho({
  tela,
  aoAbrirMenu,
  refDoEspaco,
}: {
  tela: Tela;
  aoAbrirMenu: () => void;
  /** Recebe o elemento do espaço à direita — quem guarda é a casca. */
  refDoEspaco: (elemento: HTMLElement | null) => void;
}) {
  return (
    <header className="relative z-10 shrink-0 border-b border-[var(--border-hairline)] bg-topo backdrop-blur-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={aoAbrirMenu}
            aria-label="Abrir menu"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-linha bg-painel text-tinta tela:hidden"
          >
            <Icone referencia="icones.svg#menu" className="size-5" />
          </button>

          {/* O ícone da tela, numa caixa laranja com brilho. */}
          <span aria-hidden="true" className="relative hidden size-10 shrink-0 tela:block">
            <span className="absolute -inset-1 rounded-2xl bg-[var(--accent-line)] opacity-50 blur-md" />
            <span className="relative grid size-full place-items-center rounded-xl bg-[var(--accent-soft)] text-ambar ring-1 ring-inset ring-[var(--accent-line)]">
              <Icone referencia={tela.icone} className="size-5" />
            </span>
          </span>

          <div className="min-w-0">
            <h1 className="m-0 truncate font-titulo text-[17px] leading-tight text-tinta">{tela.rotulo}</h1>
            <p className="m-0 truncate text-[11.5px] text-tinta-apagada">{tela.apoioTopo}</p>
          </div>
        </div>

        {/* O espaço das abas e das ações, que a tela preenche com `<NoCabecalho>`. */}
        <div ref={refDoEspaco} className="flex min-w-0 flex-wrap items-center gap-2 empty:hidden" />
      </div>
    </header>
  );
}
