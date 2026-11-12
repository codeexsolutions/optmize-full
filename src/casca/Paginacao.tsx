/**
 * ===========================================================================
 * PAGINAÇÃO — o pé de uma lista longa
 * ===========================================================================
 *
 * Pedido do dono (2026-11-12): o relatório do encaixe crescia sem fim. A lista
 * já está toda na memória (o servidor manda o período inteiro); aqui só se
 * escolhe que pedaço mostrar. À esquerda, "1–15 de 57"; à direita, as setas e
 * os números das páginas — a primeira, a última e as vizinhas da atual, com
 * "…" no meio quando são muitas.
 *
 * O mesmo componente vive no painel (`optmize-painel/src/components/optmize/
 * Paginacao.tsx`), com os ícones do lucide no lugar do sprite.
 */

import { Icone } from "./Icone";

interface Props {
  /** A página atual, começando em 1. */
  pagina: number;
  /** Quantos itens a lista tem ao todo. */
  total: number;
  porPagina: number;
  aoMudar: (pagina: number) => void;
}

/** As páginas a mostrar: 1 … 4 5 6 … 12. */
function numeros(atual: number, ultima: number): (number | "…")[] {
  if (ultima <= 7) return Array.from({ length: ultima }, (_, i) => i + 1);
  const meio = [atual - 1, atual, atual + 1].filter((n) => n > 1 && n < ultima);
  const lista: (number | "…")[] = [1];
  if (meio[0]! > 2) lista.push("…");
  lista.push(...meio);
  if (meio[meio.length - 1]! < ultima - 1) lista.push("…");
  lista.push(ultima);
  return lista;
}

export function Paginacao({ pagina, total, porPagina, aoMudar }: Props) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return null;
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);

  const botao =
    "grid h-8 min-w-8 place-items-center rounded-[8px] px-2 text-[12.5px] tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-tinta-apagada">
      <span className="tabular-nums">
        {de}–{ate} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => aoMudar(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
          className={`${botao} text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta`}
        >
          <Icone referencia="icones.svg#chevron-left" className="size-4" />
        </button>
        {numeros(pagina, ultima).map((n, i) =>
          n === "…" ? (
            <span key={`r${i}`} className="px-1">…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => aoMudar(n)}
              aria-current={n === pagina ? "page" : undefined}
              className={`${botao} ${
                n === pagina
                  ? "bg-[var(--accent-soft)] text-ambar"
                  : "text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta"
              }`}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => aoMudar(pagina + 1)}
          disabled={pagina >= ultima}
          aria-label="Próxima página"
          className={`${botao} text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta`}
        >
          <Icone referencia="icones.svg#chevron-right" className="size-4" />
        </button>
      </div>
    </div>
  );
}
