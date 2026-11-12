/**
 * OS TRÊS MODELOS — a escolha da pessoa
 *
 * Embaixo do visor, os três vetores que a rede da Vetora fez para a imagem,
 * cada um com a miniatura, o nome, o que ele busca, os nós e as cores. Clicar
 * troca o visor e os ajustes para aquele modelo. O que a pessoa leva embora
 * ensina a rede (`gosto.ts`).
 */

import type { Chave, Resultado } from "./trabalho";

export interface ItemDoModelo {
  chave: Chave;
  nome: string;
  ia: boolean;
  ajustado: boolean;
  resultado: Resultado | null;
  svgUrl: string | null;
  fracao: number | null;
}

const O_QUE_BUSCA: Record<Chave, string> = {
  fiel: "O mais parecido com a imagem",
  equilibrado: "Fiel e leve, no seu gosto",
  limpo: "Menos nós, curvas mais lisas",
};

export function Modelos({ itens, selecionada, aoEscolher }: { itens: ItemDoModelo[]; selecionada: Chave; aoEscolher: (c: Chave) => void }) {
  return (
    <div className="mt-3 grid shrink-0 grid-cols-3 gap-2" role="radiogroup" aria-label="Os três modelos de vetor">
      {itens.map((m) => {
        const ativo = m.chave === selecionada;
        const r = m.resultado;
        return (
          <button
            key={m.chave}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => aoEscolher(m.chave)}
            className={`group relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border p-2 text-left transition-colors ${ativo ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-linha hover:border-[var(--accent-line)]"}`}
          >
            <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-black/20"
              style={{ background: "repeating-conic-gradient(#dcdcdc 0% 25%, #ffffff 0% 50%) 50% / 10px 10px" }}>
              {m.svgUrl
                ? <img src={m.svgUrl} alt="" className="vetora-entra h-full w-full object-contain" draggable={false} />
                : <span className="vetora-pulso size-5 rounded-full bg-[var(--accent)]" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[0.92rem] leading-tight text-tinta">
                {m.nome}
                {m.ia && <span title="Feito sobre a imagem limpa e ampliada pela IA" className="rounded bg-[var(--accent)] px-1 py-px text-[9.5px] leading-none text-white">IA</span>}
                {m.ajustado && <span title="Você mexeu nos ajustes deste modelo" className="text-[10.5px] text-tinta-apagada">· seu</span>}
              </span>
              <span className="block truncate text-[11.5px] text-tinta-apagada">{O_QUE_BUSCA[m.chave]}</span>
              <span className="block font-mono text-[11px] text-tinta-fraca">
                {r ? `${r.estatisticas.nos.toLocaleString("pt-BR")} nós · ${r.estatisticas.cores} cores` : "fazendo…"}
              </span>
            </span>
            {m.fracao != null && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black/20">
                <span className="block h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(m.fracao * 100)}%` }} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
