/**
 * ===========================================================================
 * COMPACTAR POR REGIÕES — o sparrow num pedaço do rolo de cada vez
 * ===========================================================================
 *
 * O sparrow é quem compra tecido depois da busca, mas ele não escala com o
 * número de peças: com o mesmo relógio, rende ~2,5% num pedido de 175 peças e
 * 0,7% num de 1.050 (docs/optimize/benchmarks, P11 em research/PROPOSTAS.md).
 * Na produção, todos os workers rodam o sparrow no rolo INTEIRO, cada um com
 * uma semente — paralelismo de busca, e cada um deles anda devagar.
 *
 * Aqui o rolo é partido em REGIÕES ao longo do comprimento, cada uma com um
 * pedaço das peças, e cada região é compactada sozinha (um worker por região
 * na produção: paralelismo de dados). Depois as regiões são emendadas uma em
 * seguida da outra.
 *
 * POR QUE A EMENDA NÃO SOBREPÕE. Tudo aqui é em células da grade. Cada região
 * ocupa as linhas [0, fundo) da tira dela, contando o engorde das peças (a
 * meia folga). Emendar é deslocar a região k por Σ fundo das anteriores: as
 * máscaras engordadas de regiões diferentes ficam em faixas de linhas
 * disjuntas, então a folga entre elas é a inteira. O preço é a emenda reta:
 * as peças de uma região não entram nos vãos da vizinha. Mesmo assim, o
 * resultado passa pela trava inteira antes de valer (quem chama confere).
 *
 * Funções puras: quem roda o sparrow em cada região é quem chama.
 */

/** A linha da grade onde a máscara da posição começa (sempre inteira no encaixe da grade). */
function linhaDe(pos) {
  return Math.round((pos.y + pos.mascara.offY) / pos.passo);
}

/** O fundo, em células, de um conjunto de posições da grade. */
export function fundoEmCelulas(posicoes) {
  let fundo = 0;
  for (const p of posicoes) fundo = Math.max(fundo, linhaDe(p) + p.mascara.rows);
  return fundo;
}

/**
 * Quantas regiões para um trabalho: o suficiente para cada uma ter perto de
 * `alvo` peças, e no máximo `maximo` (o número de workers).
 */
export function quantasRegioes(nPecas, { alvo = 200, maximo = 8 } = {}) {
  return Math.max(1, Math.min(maximo, Math.round(nPecas / alvo)));
}

/**
 * Parte o encaixe em `k` regiões ao longo do rolo, pela ordem do começo de
 * cada peça, com o mesmo número de peças em cada uma. Cada região sai como um
 * encaixe próprio, começando na linha zero: `{ posicoes, itens, deslocamento }`,
 * com `deslocamento` em linhas (o quanto ela foi puxada para cima).
 */
export function partirEmRegioes(resultado, k) {
  const ordenadas = resultado.posicoes.slice().sort((a, b) => linhaDe(a) - linhaDe(b));
  const regioes = [];
  for (let r = 0; r < k; r++) {
    const de = Math.floor((r * ordenadas.length) / k);
    const ate = Math.floor(((r + 1) * ordenadas.length) / k);
    const pedaco = ordenadas.slice(de, ate);
    if (pedaco.length === 0) continue;
    let primeira = Infinity;
    for (const p of pedaco) primeira = Math.min(primeira, linhaDe(p));
    const posicoes = pedaco.map((p) => ({ ...p, y: p.y - primeira * p.passo }));
    regioes.push({ posicoes, itens: pedaco.map((p) => p.item), deslocamento: primeira });
  }
  return regioes;
}

/** Uma região como encaixe que o sparrow aceita de partida. */
export function encaixeDaRegiao(regiao, passo, config, consumoDoFundo) {
  const fundo = fundoEmCelulas(regiao.posicoes);
  return {
    posicoes: regiao.posicoes,
    naoEncaixadas: [],
    consumo: consumoDoFundo(fundo, passo, config, regiao.posicoes),
    areaReal: regiao.posicoes.reduce((s, p) => s + (p.item.mascaras.areaReal || 0), 0),
  };
}

/**
 * Emenda as regiões (cada uma já compactada, começando na linha zero) uma
 * depois da outra. Devolve o encaixe inteiro, sem conferir: quem chama passa
 * pela trava.
 */
export function emendarRegioes(regioes, passo, config, consumoDoFundo) {
  const posicoes = [];
  let linha = 0;
  for (const regiao of regioes) {
    let primeira = Infinity;
    for (const p of regiao.posicoes) primeira = Math.min(primeira, linhaDe(p));
    const desloca = linha - primeira;
    for (const p of regiao.posicoes) posicoes.push({ ...p, y: p.y + desloca * passo });
    linha += fundoEmCelulas(regiao.posicoes) - primeira;
  }
  return {
    posicoes,
    naoEncaixadas: [],
    consumo: consumoDoFundo(linha, passo, config, posicoes),
    areaReal: posicoes.reduce((s, p) => s + (p.item.mascaras.areaReal || 0), 0),
  };
}
