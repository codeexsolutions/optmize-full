/**
 * ===========================================================================
 * AS REGIÕES DO VETORIZADOR — cada mancha de cor, e o que é cisco
 * ===========================================================================
 *
 * Com a paleta escolhida, cada pixel recebe a cor mais próxima (em OKLab) e
 * os pixels vizinhos da mesma cor viram uma REGIÃO (vizinhança de 4: dois
 * pixels que só se tocam pela quina são regiões diferentes — é a mesma regra
 * que o mapa planar usa para as divisas, e as duas precisam concordar).
 *
 * Depois vem a limpeza, que é o que separa vetor bom de vetor sujo:
 *
 *   CISCO      região menor que `areaMinima` pixels: ruído do JPEG, poeira do
 *              escaneamento, a ponta de um serrilhado.
 *   FRANJA     região comprida e fina (menos de ~1,2 px de espessura média):
 *              a faixa do anti-serrilhado entre duas cores, quando ela caiu
 *              numa terceira cor da paleta.
 *
 * Os dois são absorvidos pela vizinha com quem dividem MAIS borda — e, no
 * empate, pela de cor mais parecida. A região que absorve fica com a sua
 * cor; a forma dela cresce sobre o cisco. No fim, as regiões são refeitas,
 * porque um cisco absorvido pode ter ligado duas manchas da mesma cor.
 *
 * O fundo apagado (alfa abaixo de 128) também é região — com rótulo -1 —, e
 * entra no mapa planar como qualquer outra; só não é desenhado.
 */

import { ALFA_OPACO } from "./paleta";

/** O rótulo do fundo transparente. */
export const TRANSPARENTE = -1;

/**
 * Cada pixel → índice da cor mais próxima na paleta (ou TRANSPARENTE).
 * A busca guarda a resposta por caixa de cor de 6 bits por canal: os pixels
 * da mesma caixa (cores a 4 níveis um do outro) recebem a mesma cor.
 */
export function rotularPixels(px, lab, largura, altura, cores) {
  const total = largura * altura;
  const rotulos = new Int16Array(total);
  const guardado = new Int16Array(262144).fill(-2);
  for (let i = 0; i < total; i++) {
    if (px[i * 4 + 3] < ALFA_OPACO) { rotulos[i] = TRANSPARENTE; continue; }
    const caixa = ((px[i * 4] >> 2) << 12) | ((px[i * 4 + 1] >> 2) << 6) | (px[i * 4 + 2] >> 2);
    let k = guardado[caixa];
    if (k === -2) {
      const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
      let md = Infinity;
      for (let c = 0; c < cores.length; c++) {
        const d = (L - cores[c].L) ** 2 + (a - cores[c].a) ** 2 + (b - cores[c].b) ** 2;
        if (d < md) { md = d; k = c; }
      }
      guardado[caixa] = k;
    }
    rotulos[i] = k;
  }
  return rotulos;
}

/**
 * As regiões (componentes de vizinhança 4 do mesmo rótulo).
 * Devolve `{ regiao: Int32Array (id por pixel), rotuloDa: Int16Array, areaDa: Int32Array, quantas }`.
 */
export function separarRegioes(rotulos, largura, altura) {
  const total = largura * altura;
  const regiao = new Int32Array(total).fill(-1);
  const pilha = new Int32Array(total);
  const rotuloDa = [];
  const areaDa = [];
  let quantas = 0;
  for (let inicio = 0; inicio < total; inicio++) {
    if (regiao[inicio] !== -1) continue;
    const r = rotulos[inicio];
    const id = quantas++;
    let topo = 0;
    pilha[topo++] = inicio;
    regiao[inicio] = id;
    let area = 0;
    while (topo > 0) {
      const i = pilha[--topo];
      area++;
      const x = i % largura;
      if (x > 0 && regiao[i - 1] === -1 && rotulos[i - 1] === r) { regiao[i - 1] = id; pilha[topo++] = i - 1; }
      if (x + 1 < largura && regiao[i + 1] === -1 && rotulos[i + 1] === r) { regiao[i + 1] = id; pilha[topo++] = i + 1; }
      if (i >= largura && regiao[i - largura] === -1 && rotulos[i - largura] === r) { regiao[i - largura] = id; pilha[topo++] = i - largura; }
      if (i + largura < total && regiao[i + largura] === -1 && rotulos[i + largura] === r) { regiao[i + largura] = id; pilha[topo++] = i + largura; }
    }
    rotuloDa.push(r);
    areaDa.push(area);
  }
  return { regiao, rotuloDa: Int16Array.from(rotuloDa), areaDa: Int32Array.from(areaDa), quantas };
}

/**
 * A FRANJA GRUDADA — o pixel da divisa que pegou a cor de uma terceira
 * região.
 *
 * Na divisa entre o roxo e o branco, o pixel do meio é lilás; se a paleta
 * tem um rosa mais perto do lilás do que o roxo e o branco, ele vira rosa, e
 * a fileira desses pixels vira uma lasca rosa ao longo da letra. Sozinha, a
 * lasca é franja fina e a limpeza (`limparRegioes`) a absorve; mas quando ela
 * encosta numa região rosa de verdade, vira parte dela, e a limpeza, que olha
 * a região inteira, não a pega.
 *
 * Por isso o teste é pela COR, pixel a pixel. O pixel de rótulo C com A de um
 * lado e B do outro (A ≠ B, até `alcance` pixels, nas quatro direções:
 * horizontal, vertical e as duas diagonais), cuja cor de verdade fica muito
 * mais perto da MISTURA de A e B (o segmento A–B em OKLab) do que de C, é
 * franja: vai para A ou para B, o que estiver mais perto na mistura. O traço
 * fino de verdade, da cor dele, fica — perto de C e longe da mistura —, e o
 * que encosta na mesma cor dos dois lados (A = B) não é divisa.
 */
export function desmisturar(rotulos, lab, largura, altura, cores, alcance = 1) {
  const saida = rotulos.slice();
  const DIRECOES = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const rotuloEm = (x, y) => (x >= 0 && y >= 0 && x < largura && y < altura ? rotulos[y * largura + x] : -2);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      const c = rotulos[i];
      if (c < 0) continue;
      const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
      const C = cores[c];
      const dC2 = (L - C.L) ** 2 + (a - C.a) ** 2 + (b - C.b) ** 2;
      // O pixel bem perto da cor dele não é franja (e é quase todo pixel).
      if (dC2 < 0.03 * 0.03) continue;
      let melhor = -1, melhorD2 = Infinity;
      for (const [dx, dy] of DIRECOES) {
        let antes = -2, depois = -2;
        for (let s = 1; s <= alcance; s++) {
          const r = rotuloEm(x - dx * s, y - dy * s);
          if (r !== c) { antes = r; break; }
        }
        if (antes < 0) continue;
        for (let s = 1; s <= alcance; s++) {
          const r = rotuloEm(x + dx * s, y + dy * s);
          if (r !== c) { depois = r; break; }
        }
        if (depois < 0 || depois === antes) continue;
        const P = cores[antes], Q = cores[depois];
        const dL = Q.L - P.L, da = Q.a - P.a, db = Q.b - P.b;
        const n2 = dL * dL + da * da + db * db;
        if (n2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((L - P.L) * dL + (a - P.a) * da + (b - P.b) * db) / n2));
        const d2 = (L - P.L - t * dL) ** 2 + (a - P.a - t * da) ** 2 + (b - P.b - t * db) ** 2;
        if (d2 < melhorD2) { melhorD2 = d2; melhor = t < 0.5 ? antes : depois; }
      }
      // "Muito mais perto": a menos da metade da distância até C.
      if (melhor >= 0 && melhorD2 < 0.25 * dC2) saida[i] = melhor;
    }
  }
  return saida;
}

/**
 * Absorve ciscos e franjas (ver o cabeçalho) e devolve os rótulos limpos.
 *
 * `areaMinima`: abaixo disso é cisco. `espessuraMinima`: região com área
 * menor que `areaDaFranja` e espessura média (área ÷ meia borda) abaixo disso
 * é franja. `cores`: a paleta, para o desempate pela cor parecida.
 */
export function limparRegioes(rotulos, largura, altura, cores, opcoes = {}) {
  const areaMinima = Math.max(1, opcoes.areaMinima || 4);
  const espessuraMinima = opcoes.espessuraMinima == null ? 1.2 : opcoes.espessuraMinima;
  const areaDaFranja = Math.max(areaMinima, opcoes.areaDaFranja || areaMinima * 40);
  const { regiao, rotuloDa, areaDa, quantas } = separarRegioes(rotulos, largura, altura);
  if (quantas <= 1) return rotulos;

  // A borda que cada par de regiões divide, e o perímetro de cada uma.
  const vizinhas = new Array(quantas);
  for (let r = 0; r < quantas; r++) vizinhas[r] = new Map();
  const perimetro = new Float64Array(quantas);
  const contar = (a, b) => {
    vizinhas[a].set(b, (vizinhas[a].get(b) || 0) + 1);
    vizinhas[b].set(a, (vizinhas[b].get(a) || 0) + 1);
  };
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      const a = regiao[i];
      if (x + 1 < largura) { const b = regiao[i + 1]; if (a !== b) contar(a, b); }
      if (y + 1 < altura) { const b = regiao[i + largura]; if (a !== b) contar(a, b); }
      // A moldura da imagem também é borda (entra no perímetro).
      if (x === 0 || x === largura - 1) perimetro[a]++;
      if (y === 0 || y === altura - 1) perimetro[a]++;
    }
  }
  for (let r = 0; r < quantas; r++) for (const n of vizinhas[r].values()) perimetro[r] += n;

  const pai = new Int32Array(quantas);
  for (let r = 0; r < quantas; r++) pai[r] = r;
  const achar = (r) => { while (pai[r] !== r) { pai[r] = pai[pai[r]]; r = pai[r]; } return r; };
  const area = Float64Array.from(areaDa);
  const parecida = (r, n) => {
    const a = rotuloDa[r], b = rotuloDa[n];
    if (a < 0 || b < 0) return a === b ? 0 : 1;
    return (cores[a].L - cores[b].L) ** 2 + (cores[a].a - cores[b].a) ** 2 + (cores[a].b - cores[b].b) ** 2;
  };

  /**
   * O DETALHE QUE NÃO É CISCO: o acento do "ó", o pingo do "i", o ponto
   * final. Pequenos — num logo de 1000 px com texto de 40 px, o acento tem
   * uns 30 px², menos que o cisco do detalhe padrão (63 px²) — mas com cara
   * própria: uma ILHA (cercada por uma região só), compacta (não é franja),
   * de cor bem diferente da que a cerca (ΔE ≥ 0,2), e de pelo menos 6 px e
   * um quinto do cisco. O ruído do JPEG falha num desses: é de cor parecida
   * com a vizinha, ou de 1 a 5 px, ou encosta numa divisa.
   */
  const ehDetalhe = (r) => {
    if (area[r] < Math.max(6, areaMinima / 5)) return false;
    if (area[r] / Math.max(1, perimetro[r] / 2) < espessuraMinima) return false;
    let unica = -1;
    for (const n0 of vizinhas[r].keys()) {
      const n = achar(n0);
      if (n === r) continue;
      if (unica >= 0 && n !== unica) return false;
      unica = n;
    }
    return unica >= 0 && parecida(r, unica) >= 0.2 * 0.2;
  };

  const ordem = Array.from({ length: quantas }, (_, r) => r).sort((p, q) => area[p] - area[q]);
  for (const r0 of ordem) {
    const r = achar(r0);
    if (r !== r0) continue;
    const cisco = area[r] < areaMinima && !ehDetalhe(r);
    const franja = area[r] >= areaMinima && area[r] < areaDaFranja && area[r] / Math.max(1, perimetro[r] / 2) < espessuraMinima;
    if (!cisco && !franja) continue;
    let melhor = -1, melhorBorda = -1, melhorCor = Infinity;
    for (const [n0, borda] of vizinhas[r]) {
      const n = achar(n0);
      if (n === r) continue;
      const cor = parecida(r, n);
      if (borda > melhorBorda || (borda === melhorBorda && cor < melhorCor)) {
        melhor = n; melhorBorda = borda; melhorCor = cor;
      }
    }
    if (melhor < 0) continue;
    // Absorve: a região some dentro da vizinha, e as vizinhas dela passam a
    // ser vizinhas da que absorveu.
    const dividida = vizinhas[melhor].get(r) || 0;
    pai[r] = melhor;
    area[melhor] += area[r];
    // A borda que as duas dividiam deixa de ser borda.
    perimetro[melhor] += perimetro[r] - 2 * dividida;
    for (const [n0, borda] of vizinhas[r]) {
      const n = achar(n0);
      if (n === melhor) continue;
      vizinhas[melhor].set(n, (vizinhas[melhor].get(n) || 0) + borda);
      vizinhas[n].set(melhor, (vizinhas[n].get(melhor) || 0) + borda);
      vizinhas[n].delete(r);
    }
    vizinhas[melhor].delete(r);
    vizinhas[r] = new Map();
  }

  const limpos = new Int16Array(rotulos.length);
  for (let i = 0; i < limpos.length; i++) limpos[i] = rotuloDa[achar(regiao[i])];
  return limpos;
}
