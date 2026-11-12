/**
 * ===========================================================================
 * O MAPA PLANAR — cada divisa entre duas regiões, uma vez só
 * ===========================================================================
 *
 * É aqui que este vetorizador se separa do jeito comum. O jeito comum traça
 * cada COR sozinha: a borda do vermelho é uma curva, a borda do azul vizinho
 * é outra, e as duas, ajustadas cada uma por si, nunca coincidem — sobra uma
 * fresta (o fundo aparece entre as duas) ou uma sobreposição. Quem vende
 * vetorização remenda isso com traços por baixo ("gap fillers").
 *
 * Aqui a divisa é um objeto próprio. A imagem é vista como a malha das
 * ARESTAS entre pixels (a "rachadura" entre dois pixels vizinhos): toda
 * aresta com pixels de regiões diferentes dos dois lados é divisa. Os vértices
 * da malha onde se encontram três regiões ou mais são JUNÇÕES. Uma CADEIA é o
 * caminho de divisa entre duas junções — ou um laço fechado, quando uma
 * região é uma ilha dentro de outra —, e ela sabe quem fica à esquerda e quem
 * fica à direita.
 *
 * Cada cadeia é ajustada a curvas UMA vez (`curvas.js`) e usada pelas DUAS
 * regiões, uma em cada sentido (`montar.js`). Por construção, duas regiões
 * vizinhas dividem exatamente a mesma curva: não existe fresta nem
 * sobreposição para remendar.
 *
 * A moldura da imagem conta como uma região de fora (`FORA`): a divisa entre
 * uma região e a moldura também é cadeia, e fecha o contorno de quem encosta
 * na borda.
 *
 * O SENTIDO. Com o y crescendo para baixo (a imagem), andar para a direita
 * deixa à esquerda o pixel de cima; andar para baixo deixa à esquerda o pixel
 * da direita. Toda cadeia guarda a região da esquerda (`esq`) e a da direita
 * (`dir`), e percorrer a cadeia com a região à esquerda dá o contorno dela.
 */

/** A região "de fora" da imagem. */
export const FORA = -1;

// As direções, em ordem horária na tela: leste, sul, oeste, norte.
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * As cadeias do mapa.
 *
 * `regiao`: id da região de cada pixel (Int32Array, largura × altura).
 * Devolve uma lista de `{ pontos: Int32Array [x0, y0, x1, y1, ...], esq, dir,
 * fechada, a, b }` — `a` e `b` são as chaves dos vértices das pontas (o da
 * saída e o da chegada), para a montagem ligar as cadeias.
 */
export function cadeiasDoMapa(regiao, largura, altura) {
  const W = largura, H = altura;
  const em = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? FORA : regiao[y * W + x]);

  // As arestas que são divisa: as horizontais (entre o pixel de cima e o de
  // baixo) e as verticais (entre o da esquerda e o da direita).
  const horiz = new Uint8Array(W * (H + 1));
  const vert = new Uint8Array((W + 1) * H);
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x < W; x++) horiz[y * W + x] = em(x, y - 1) !== em(x, y) ? 1 : 0;
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x <= W; x++) vert[y * (W + 1) + x] = em(x - 1, y) !== em(x, y) ? 1 : 0;
  }
  const usadaH = new Uint8Array(horiz.length);
  const usadaV = new Uint8Array(vert.length);

  // A aresta que sai do vértice (x, y) na direção d: [vetor, índice] ou null.
  const aresta = (x, y, d) => {
    switch (d) {
      case 0: return x < W ? [0, y * W + x] : null;
      case 1: return y < H ? [1, y * (W + 1) + x] : null;
      case 2: return x > 0 ? [0, y * W + x - 1] : null;
      default: return y > 0 ? [1, (y - 1) * (W + 1) + x] : null;
    }
  };
  const ehDivisa = (e) => (e[0] === 0 ? horiz[e[1]] : vert[e[1]]) === 1;
  const usada = (e) => (e[0] === 0 ? usadaH[e[1]] : usadaV[e[1]]) === 1;
  const marcar = (e) => { if (e[0] === 0) usadaH[e[1]] = 1; else usadaV[e[1]] = 1; };
  const grau = (x, y) => {
    let g = 0;
    for (let d = 0; d < 4; d++) { const e = aresta(x, y, d); if (e && ehDivisa(e)) g++; }
    return g;
  };
  // Quem fica à esquerda e à direita de quem sai de (x, y) na direção d.
  const lados = (x, y, d) => {
    switch (d) {
      case 0: return [em(x, y - 1), em(x, y)];
      case 1: return [em(x, y), em(x - 1, y)];
      case 2: return [em(x - 1, y), em(x - 1, y - 1)];
      default: return [em(x - 1, y - 1), em(x, y - 1)];
    }
  };
  const chave = (x, y) => y * (W + 1) + x;

  const cadeias = [];
  /** Anda de (x0, y0) na direção d0 até a próxima junção (ou de volta ao começo). */
  const andar = (x0, y0, d0, ehJuncao, laco) => {
    const pts = [x0, y0];
    const [esq, dir] = lados(x0, y0, d0);
    let x = x0, y = y0, d = d0;
    for (;;) {
      const e = aresta(x, y, d);
      marcar(e);
      x += DX[d]; y += DY[d];
      pts.push(x, y);
      if (x === x0 && y === y0) break;
      if (ehJuncao(x, y)) break;
      // Vértice comum (grau 2): sai pela outra divisa, que não é a de chegada.
      const volta = (d + 2) % 4;
      let prox = -1;
      for (let k = 0; k < 4; k++) {
        if (k === volta) continue;
        const ek = aresta(x, y, k);
        if (ek && ehDivisa(ek)) { prox = k; break; }
      }
      if (prox < 0) break;
      d = prox;
    }
    // Fechada é só o laço SEM junção (a ilha). A cadeia que sai de uma junção
    // e volta a ela continua presa ali: a ponta não pode ser alisada.
    const fechada = laco === true;
    cadeias.push({ pontos: Int32Array.from(pts), esq, dir, fechada, a: chave(x0, y0), b: chave(x, y) });
  };

  // 1. Das junções (três regiões ou mais em volta do vértice).
  const juncao = new Uint8Array((W + 1) * (H + 1));
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x <= W; x++) if (grau(x, y) >= 3) juncao[chave(x, y)] = 1;
  }
  const ehJuncao = (x, y) => juncao[chave(x, y)] === 1;
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x <= W; x++) {
      if (!juncao[chave(x, y)]) continue;
      for (let d = 0; d < 4; d++) {
        const e = aresta(x, y, d);
        if (e && ehDivisa(e) && !usada(e)) andar(x, y, d, ehJuncao, false);
      }
    }
  }

  // 2. Os laços sem junção: o que sobrou de divisa é ilha dentro de região.
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (horiz[i] && !usadaH[i]) andar(x, y, 0, () => false, true);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x <= W; x++) {
      const i = y * (W + 1) + x;
      if (vert[i] && !usadaV[i]) andar(x, y, 1, () => false, true);
    }
  }
  return cadeias;
}
