/**
 * A GRADE DE QUANTIDADES — quantas peças prontas de cada estampa em cada tamanho
 *
 * Só exibição: o estado mora na janela Arte e encaixe, e as contas em
 * `envioPorTamanho.ts`. Uma célula com número ganha o ▸, que abre as peças
 * daquele tamanho e daquela estampa com a quantidade de cada uma — é ali que se
 * zera o que não vai ("repor só as mangas").
 */
import type { PecaDoMolde } from "../../api/moldes";
import {
  celulaDaChave, chaveDaCelula, inteiro, pecasDaCelula, type Coluna, type Mexidas, type Quantidades,
} from "./envioPorTamanho";

export interface LinhaDaGrade { chave: string; nome: string }

interface Props {
  linhas: LinhaDaGrade[];
  colunas: Coluna[];
  pecas: PecaDoMolde[];
  quantidades: Quantidades;
  mexidas: Mexidas;
  /** A célula com as peças abertas (o ▸), ou `null`. */
  aberta: string | null;
  aoMudarQuantidade: (linha: string, tamanho: string, valor: number) => void;
  aoMexer: (celula: string, indice: number, valor: number | null) => void;
  aoAbrir: (celula: string | null) => void;
}

export function GradeDeQuantidades({
  linhas, colunas, pecas, quantidades, mexidas, aberta, aoMudarQuantidade, aoMexer, aoAbrir,
}: Props) {
  const daAberta = aberta ? celulaDaChave(aberta) : null;
  const prontasDaAberta = daAberta ? inteiro(quantidades[daAberta.linha]?.[daAberta.tamanho]) : 0;
  const nomeDaAberta = daAberta ? linhas.find((l) => l.chave === daAberta.linha)?.nome : undefined;

  return (
    <section className="mt-3 flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="border-collapse text-[0.85rem]">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-semibold">Peças prontas</th>
              {colunas.map((c) => (
                <th key={c.nome} className="px-2 py-1 text-center font-semibold">
                  {c.nome}
                  {c.semDesenho && <span className="block text-[0.72rem] font-normal text-tinta-fraca">sem desenho</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-t border-linha">
                <th scope="row" className="px-2 py-1 text-left font-medium capitalize">{l.nome}</th>
                {colunas.map((c) => {
                  const celula = chaveDaCelula(l.chave, c.nome);
                  const valor = inteiro(quantidades[l.chave]?.[c.nome]);
                  return (
                    <td key={c.nome} className="px-2 py-1">
                      <span className="flex items-center gap-1">
                        <input
                          type="number" min="0" step="1" className="w-16!" placeholder="0"
                          aria-label={`${l.nome} ${c.nome}`} disabled={c.semDesenho}
                          value={valor > 0 ? valor : ""}
                          onChange={(e) => aoMudarQuantidade(l.chave, c.nome, inteiro(e.target.value))}
                        />
                        {valor > 0 && (
                          <button
                            type="button" className="btn secondary btn-sm" title="Ver as peças"
                            aria-label={`Peças de ${l.nome} ${c.nome}`} aria-expanded={aberta === celula}
                            onClick={() => aoAbrir(aberta === celula ? null : celula)}
                          >
                            {aberta === celula ? "▾" : "▸"}
                          </button>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Célula que voltou a 0: as peças somem, e as mexidas continuam guardadas para quando o número voltar. */}
      {aberta && daAberta && prontasDaAberta > 0 && (
        <div className="flex flex-col gap-1 rounded-[8px] border border-linha p-2 text-[0.85rem]">
          <strong className="capitalize">{nomeDaAberta} · {daAberta.tamanho}</strong>
          {pecasDaCelula(pecas, daAberta.tamanho, prontasDaAberta, mexidas[aberta]).map((x, i) => {
            const nome = x.peca.nome || x.peca.papel;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className={`w-40 capitalize ${x.mexida ? "font-semibold" : ""}`}>{nome}</span>
                <input
                  type="number" min="0" step="1" className="w-20!" aria-label={`Quantidade de ${nome}`}
                  value={x.quantidade} onChange={(e) => aoMexer(aberta, i, inteiro(e.target.value))}
                />
                <span className="text-tinta-fraca">{x.peca.quantidade} por peça pronta</span>
                {x.mexida && (
                  <button type="button" className="btn secondary btn-sm" onClick={() => aoMexer(aberta, i, null)}>
                    voltar à conta ({x.conta})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
