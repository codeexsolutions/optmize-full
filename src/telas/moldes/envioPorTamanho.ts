/**
 * O ENVIO DE VÁRIOS TAMANHOS — as contas da grade estampa × tamanho
 *
 * A janela Arte e encaixe pede peças prontas numa grade: uma linha por
 * estampa, uma coluna por tamanho. Cada célula com número vira UMA chamada ao
 * Encaixe (que soma o que chega), com a quantidade final já em cada peça.
 *
 * A quantidade de uma peça é a conta (cortes por peça pronta × prontas) ou a
 * que a pessoa escreveu no ▸ da célula — a "mexida". A mexida é por índice na
 * lista de `pecasParaOEncaixe` daquele tamanho, e fica de pé quando as prontas
 * mudam: é o "repor só as mangas". Nada disto vai para o molde.
 */
import type { Molde, PecaDoMolde } from "../../api/moldes";
import { pecasParaOEncaixe } from "../../motores/montagem";

export interface Coluna { nome: string; semDesenho: boolean }
/** linha → tamanho → peças prontas. */
export type Quantidades = Record<string, Record<string, number>>;
/** célula → índice da peça → quantidade escrita à mão. */
export type Mexidas = Record<string, Record<number, number>>;
export interface PecaDaCelula { peca: PecaDoMolde; conta: number; quantidade: number; mexida: boolean }
export interface CelulaParaMandar { linha: string; tamanho: string; prontas: number; pecas: PecaDoMolde[] }

export const LINHA_NOVA = "nova";
export const LINHA_SEM_ESTAMPA = "sem";
export const linhaDaEstampa = (id: number) => `e:${id}`;
export const chaveDaCelula = (linha: string, tamanho: string) => `${linha}|${tamanho}`;
export function celulaDaChave(chave: string): { linha: string; tamanho: string } {
  const i = chave.indexOf("|");
  return { linha: chave.slice(0, i), tamanho: chave.slice(i + 1) };
}

/** Inteiro ≥ 0. Vazio, texto, negativo ou fração não chegam ao Encaixe. */
export const inteiro = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

/** Os tamanhos da grade, na ordem dela; sem grade guardada, os das peças. */
export function colunasDaGrade(molde: Pick<Molde, "pecas" | "tamanhos">): Coluna[] {
  const comDesenho = [...new Set(molde.pecas.map((p) => p.tamanho))];
  const nomes = [...(molde.tamanhos ?? [])].sort((a, b) => a.ordem - b.ordem).map((t) => t.nome);
  // Peça num tamanho que a grade não declara (grade antiga): entra no fim, senão sumiria do envio calada.
  for (const t of comDesenho) if (!nomes.includes(t)) nomes.push(t);
  return nomes.map((nome) => ({ nome, semDesenho: !comDesenho.includes(nome) }));
}

export function pecasDaCelula(
  pecas: PecaDoMolde[], tamanho: string, prontas: number, mexidas: Record<number, number> = {},
): PecaDaCelula[] {
  const doTamanho = pecasParaOEncaixe(pecas.filter((p) => p.tamanho === tamanho)) as PecaDoMolde[];
  return doTamanho.map((peca, i) => {
    const conta = peca.quantidade * inteiro(prontas);
    const mexida = Object.prototype.hasOwnProperty.call(mexidas, i);
    return { peca, conta, quantidade: mexida ? inteiro(mexidas[i]) : conta, mexida };
  });
}

/** O que vai, na ordem: linha por linha, tamanho por tamanho; só células e peças > 0. */
export function celulasParaMandar(
  linhas: string[], colunas: Coluna[], pecas: PecaDoMolde[], quantidades: Quantidades, mexidas: Mexidas,
): CelulaParaMandar[] {
  const lista: CelulaParaMandar[] = [];
  for (const linha of linhas) {
    for (const coluna of colunas) {
      if (coluna.semDesenho) continue;
      const prontas = inteiro(quantidades[linha]?.[coluna.nome]);
      if (prontas === 0) continue;
      const vao = pecasDaCelula(pecas, coluna.nome, prontas, mexidas[chaveDaCelula(linha, coluna.nome)])
        .filter((x) => x.quantidade > 0)
        .map((x) => ({ ...x.peca, quantidade: x.quantidade }));
      if (vao.length > 0) lista.push({ linha, tamanho: coluna.nome, prontas, pecas: vao });
    }
  }
  return lista;
}

export function resumo(celulas: CelulaParaMandar[]): { prontas: number; pecas: number } {
  return {
    prontas: celulas.reduce((s, c) => s + c.prontas, 0),
    pecas: celulas.reduce((s, c) => s + c.pecas.reduce((t, p) => t + p.quantidade, 0), 0),
  };
}

export function mudarQuantidade(q: Quantidades, linha: string, tamanho: string, valor: unknown): Quantidades {
  return { ...q, [linha]: { ...q[linha], [tamanho]: inteiro(valor) } };
}

/** `valor` null: volta à conta. */
export function mexer(m: Mexidas, celula: string, indice: number, valor: unknown | null): Mexidas {
  const daCelula = { ...m[celula] };
  if (valor === null) delete daCelula[indice];
  else daCelula[indice] = inteiro(valor);
  return { ...m, [celula]: daCelula };
}

/** As células que já chegaram ao Encaixe zeram: o próximo clique manda só o que faltou. */
export function depoisDaFalha(q: Quantidades, mandadas: { linha: string; tamanho: string }[]): Quantidades {
  return mandadas.reduce((acc, c) => mudarQuantidade(acc, c.linha, c.tamanho, 0), q);
}

const semLinha = (q: Quantidades, m: Mexidas, linha: string) => {
  const { [linha]: _fora, ...quantidades } = q;
  const mexidas: Mexidas = {};
  for (const [chave, v] of Object.entries(m)) if (celulaDaChave(chave).linha !== linha) mexidas[chave] = v;
  return { quantidades, mexidas };
};

/** A estampa nova foi salva: os números e as mexidas dela passam para a linha da estampa guardada. */
export function levarLinha(q: Quantidades, m: Mexidas, de: string, para: string) {
  const resto = semLinha(q, m, de);
  if (q[de]) resto.quantidades[para] = q[de];
  for (const [chave, v] of Object.entries(m)) {
    const c = celulaDaChave(chave);
    if (c.linha === de) resto.mexidas[chaveDaCelula(para, c.tamanho)] = v;
  }
  return resto;
}

/** A linha sumiu (outra estampa aberta no painel): os números dela não ficam pendurados. */
export function tirarLinha(q: Quantidades, m: Mexidas, linha: string) {
  return semLinha(q, m, linha);
}
