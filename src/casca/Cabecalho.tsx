/**
 * O cabeçalho da página: selo da aba, título e linha de apoio.
 *
 * Ele não sabe qual tela está aberta — recebe a linha da tabela de rotas e
 * desenha. Trocar de aba troca o ícone, o rótulo e o texto porque trocou o
 * `tela`, e não porque alguém saiu escrevendo no DOM.
 *
 * O relógio esteve aqui e foi para o pé do menu, onde ele já estava na casca
 * antiga. O motivo é de lá: este cabeçalho some na tela de encaixe — que é
 * onde a pessoa passa a tarde — e levava o relógio junto.
 */

import { Icone } from "./Icone";
import type { Tela } from "../rotas";

export function Cabecalho({ tela, aoAbrirMenu }: { tela: Tela; aoAbrirMenu: () => void }) {
  return (
    <header className="relative flex shrink-0 items-center gap-3 border-b border-linha bg-topo px-3 py-2 backdrop-blur-[18px] tela:gap-3.5 tela:px-[30px] tela:py-2.5">
      {/* Brilho âmbar vindo do canto superior direito: o único ornamento. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_150%_at_92%_-60%,var(--accent-soft),transparent_62%)]"
      />

      <button
        type="button"
        onClick={aoAbrirMenu}
        aria-label="Abrir menu"
        className="relative grid size-10 shrink-0 place-items-center rounded-[9px] border border-linha bg-painel text-tinta tela:hidden"
      >
        <Icone referencia="icones.svg#menu" className="size-5" />
      </button>

      {/* Selo da aba: a identidade fica aqui, e por isso o título dispensa o rótulo em cima. */}
      <span
        aria-hidden="true"
        className="relative hidden size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-ambar shadow-[0_10px_22px_-16px_var(--accent)] tela:flex"
      >
        <Icone referencia={tela.icone} className="size-[18px]" />
      </span>

      {/* Título e apoio na mesma linha: é o que enxuga a altura sem perder informação. */}
      <div className="relative flex min-w-0 flex-1 items-baseline gap-2.5">
        <h1 className="m-0 shrink-0 font-titulo text-[17px] font-semibold tracking-[-0.03em] text-tinta tela:text-[19px]">
          {tela.rotulo}
        </h1>
        <span aria-hidden="true" className="hidden size-[3px] shrink-0 rounded-full bg-[var(--accent-line)] tela:block" />
        <p className="m-0 hidden min-w-0 truncate text-[12.5px] text-tinta-fraca tela:block">{tela.apoioTopo}</p>
      </div>

      {/* Fio âmbar que fecha o topo, apagando nas duas pontas. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent-line),transparent)]"
      />
    </header>
  );
}
