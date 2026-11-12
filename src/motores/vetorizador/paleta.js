/**
 * ===========================================================================
 * A PALETA DO VETORIZADOR — quais cores a arte tem de verdade
 * ===========================================================================
 *
 * Uma arte de logo tem poucas cores chapadas; a imagem dela tem milhares. A
 * diferença é a franja do anti-serrilhado (o pixel da borda é metade de uma
 * cor e metade da outra), o ruído do JPEG e o degradê leve de quem exportou.
 * A paleta precisa achar as CHAPADAS e ignorar o resto:
 *
 *   1. A COR É MEDIDA COMO O OLHO MEDE. A distância é calculada no espaço
 *      OKLab (Björn Ottosson, 2020), em que a mesma distância é a mesma
 *      diferença percebida — no RGB, dois azuis escuros "distantes" parecem
 *      iguais e dois amarelos "próximos" parecem diferentes.
 *
 *   2. A PALETA SAI DO MIOLO. Só entram na conta os pixels cujos quatro
 *      vizinhos têm quase a mesma cor: a franja do anti-serrilhado fica de
 *      fora e não vira uma cor falsa entre o preto e o branco. (Numa foto,
 *      em que quase nada é miolo, entram todos.)
 *
 *   3. A QUANTIDADE DE CORES SAI SOZINHA. Começa com um grupo só e divide,
 *      um de cada vez, o grupo que mais erra (a divisão é pelo eixo em que
 *      ele mais se espalha), até que o maior espalhamento caia abaixo da
 *      tolerância. Arte chapada para nas cores que tem; foto continua até o
 *      teto. Quem quiser um número fixo pede `cores`.
 *
 * Tudo trabalha num histograma de cores (5 bits por canal, 32.768 caixas),
 * e não nos pixels: uma imagem de 4 megapixels tem poucos milhares de caixas
 * ocupadas, e o agrupamento fica instantâneo.
 */

// ==================== 1. A COR NO ESPAÇO DO OLHO ====================

const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB (0–255) → OKLab. */
export function paraOklab(r, g, b) {
  const lr = LINEAR[r], lg = LINEAR[g], lb = LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → sRGB (0–255, já arredondado e preso na faixa). */
export function deOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  });
}

/** O pixel conta como opaco (o resto é fundo apagado). */
export const ALFA_OPACO = 128;

// ==================== 2. O MIOLO ====================

/**
 * Marca os pixels de miolo: opacos e com os quatro vizinhos (opacos) a menos
 * de `limiar` em OKLab. Devolve também o OKLab de cada pixel, que o resto
 * do motor reaproveita.
 */
export function medirMiolo(px, largura, altura, limiar = 0.035, alcance = 1) {
  const total = largura * altura;
  const lab = new Float32Array(total * 3);
  const opaco = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (px[i * 4 + 3] < ALFA_OPACO) continue;
    opaco[i] = 1;
    const [L, a, b] = paraOklab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    lab[i * 3] = L; lab[i * 3 + 1] = a; lab[i * 3 + 2] = b;
  }
  const miolo = new Uint8Array(total);
  const limiar2 = limiar * limiar;
  const perto = (i, j) => {
    const dL = lab[i * 3] - lab[j * 3], da = lab[i * 3 + 1] - lab[j * 3 + 1], db = lab[i * 3 + 2] - lab[j * 3 + 2];
    return dL * dL + da * da + db * db < limiar2;
  };
  let quantos = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (!opaco[i]) continue;
      // `alcance`: na imagem ampliada a borda borrada é larga, e o vizinho
      // imediato difere pouco; o miolo compara com o pixel a `alcance` dele.
      const k = alcance, kL = k * largura;
      if (x >= k && opaco[i - k] && !perto(i, i - k)) continue;
      if (x + k < largura && opaco[i + k] && !perto(i, i + k)) continue;
      if (y >= k && opaco[i - kL] && !perto(i, i - kL)) continue;
      if (y + k < altura && opaco[i + kL] && !perto(i, i + kL)) continue;
      miolo[i] = 1;
      quantos++;
    }
  }
  return { lab, opaco, miolo, quantosMiolo: quantos };
}

// ==================== 3. O AGRUPAMENTO ====================

/** O histograma: uma caixa por cor de 5 bits, com o peso e o OKLab médio. */
function histograma(px, lab, usar, total) {
  const peso = new Float64Array(32768);
  const soma = new Float64Array(32768 * 3);
  for (let i = 0; i < total; i++) {
    if (!usar[i]) continue;
    const k = ((px[i * 4] >> 3) << 10) | ((px[i * 4 + 1] >> 3) << 5) | (px[i * 4 + 2] >> 3);
    peso[k]++;
    soma[k * 3] += lab[i * 3]; soma[k * 3 + 1] += lab[i * 3 + 1]; soma[k * 3 + 2] += lab[i * 3 + 2];
  }
  const pontos = [];
  for (let k = 0; k < 32768; k++) {
    if (!peso[k]) continue;
    pontos.push({ L: soma[k * 3] / peso[k], a: soma[k * 3 + 1] / peso[k], b: soma[k * 3 + 2] / peso[k], w: peso[k] });
  }
  return pontos;
}

function centroDe(pontos) {
  let w = 0, L = 0, a = 0, b = 0;
  for (const p of pontos) { w += p.w; L += p.w * p.L; a += p.w * p.a; b += p.w * p.b; }
  return w > 0 ? { L: L / w, a: a / w, b: b / w, w } : { L: 0, a: 0, b: 0, w: 0 };
}

const dist2 = (p, c) => (p.L - c.L) ** 2 + (p.a - c.a) ** 2 + (p.b - c.b) ** 2;

function erroDe(pontos, c) {
  let e = 0;
  for (const p of pontos) e += p.w * dist2(p, c);
  return e;
}

/**
 * O ESPALHAMENTO de um grupo — o que decide se ele vira duas cores.
 *
 * A raiz do erro médio sozinha não serve: ela é dominada pelo PESO. Um anel
 * amarelo de 2.500 pixels dentro do grupo de 130 mil pixels brancos mexe
 * pouco na média (o amarelo é 2% do grupo) e passaria despercebido — foi o
 * que aconteceu no teste com JPEG. Então o espalhamento é o maior entre a
 * raiz do erro médio e a distância "dos `pesoMinimo` mais longe": a
 * distância a partir da qual ainda há pelo menos esse tanto de pixels. Uma
 * cor de verdade, pequena mas distinta, puxa essa distância para longe; o
 * ruído espalhado não chega ao peso mínimo e não conta.
 */
function espalhamento(grupo, c, pesoMinimo) {
  const rms = Math.sqrt(grupo.erro / Math.max(1e-12, c.w));
  const porDistancia = grupo.pontos.map((p) => [dist2(p, c), p.w]).sort((x, y) => y[0] - x[0]);
  let acumulado = 0;
  let longe = 0;
  for (const [d2, w] of porDistancia) {
    acumulado += w;
    if (acumulado >= pesoMinimo) { longe = Math.sqrt(d2); break; }
  }
  return { valor: Math.max(rms, longe), rms };
}

/**
 * A distância mínima entre as duas metades para uma divisão pedida só pela
 * cauda (`longe`) valer. Cor de verdade é COMPACTA e DISTANTE (o anel
 * amarelo fica a 0,25 do branco); o ruído do JPEG é um rastro difuso colado
 * na cor principal, e a divisão dele dá duas metades quase iguais — que são
 * rejeitadas, e o grupo fica como está. A distância exigida acompanha a
 * tolerância (1,6×; 0,078 no detalhe padrão), com piso de 0,03: no detalhe
 * máximo, até dois cinzas quase iguais se separam.
 */
const SEPARACAO_DA_CAUDA = 0.03;

/** O eixo em que os pontos mais se espalham (iteração de potência na covariância). */
function eixoPrincipal(pontos, c) {
  const S = [0, 0, 0, 0, 0, 0]; // LL La Lb aa ab bb
  for (const p of pontos) {
    const dL = p.L - c.L, da = p.a - c.a, db = p.b - c.b;
    S[0] += p.w * dL * dL; S[1] += p.w * dL * da; S[2] += p.w * dL * db;
    S[3] += p.w * da * da; S[4] += p.w * da * db; S[5] += p.w * db * db;
  }
  let v = [1, 0.5, 0.25];
  for (let it = 0; it < 24; it++) {
    const n = [
      S[0] * v[0] + S[1] * v[1] + S[2] * v[2],
      S[1] * v[0] + S[3] * v[1] + S[4] * v[2],
      S[2] * v[0] + S[4] * v[1] + S[5] * v[2],
    ];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    v = [n[0] / len, n[1] / len, n[2] / len];
  }
  return v;
}

/** Divide um grupo em dois pelo eixo principal e refina com algumas voltas de 2-médias. */
function dividir(grupo) {
  const c = centroDe(grupo.pontos);
  const eixo = eixoPrincipal(grupo.pontos, c);
  let A = [], B = [];
  for (const p of grupo.pontos) {
    ((p.L - c.L) * eixo[0] + (p.a - c.a) * eixo[1] + (p.b - c.b) * eixo[2] < 0 ? A : B).push(p);
  }
  if (!A.length || !B.length) return null;
  for (let volta = 0; volta < 6; volta++) {
    const ca = centroDe(A), cb = centroDe(B);
    const nA = [], nB = [];
    for (const p of grupo.pontos) (dist2(p, ca) <= dist2(p, cb) ? nA : nB).push(p);
    if (!nA.length || !nB.length) break;
    A = nA; B = nB;
  }
  return [A, B];
}

/** Algumas voltas de k-médias com todos os grupos, para os de cima não ficarem tortos. */
function refinar(centros, pontos, voltas = 8) {
  let cs = centros.map((c) => ({ ...c }));
  for (let v = 0; v < voltas; v++) {
    const acc = cs.map(() => ({ w: 0, L: 0, a: 0, b: 0 }));
    for (const p of pontos) {
      let melhor = 0, md = Infinity;
      for (let k = 0; k < cs.length; k++) {
        const d = dist2(p, cs[k]);
        if (d < md) { md = d; melhor = k; }
      }
      const s = acc[melhor];
      s.w += p.w; s.L += p.w * p.L; s.a += p.w * p.a; s.b += p.w * p.b;
    }
    cs = cs.map((c, k) => (acc[k].w > 0
      ? { L: acc[k].L / acc[k].w, a: acc[k].a / acc[k].w, b: acc[k].b / acc[k].w, w: acc[k].w }
      : c)).filter((c) => c.w > 0);
  }
  return cs;
}

/**
 * A paleta da imagem.
 *
 * `opcoes.cores`: número fixo de cores (2 a 64), ou nada para automático.
 * `opcoes.tolerancia`: no automático, o espalhamento (raiz do erro médio, em
 * OKLab) a partir do qual um grupo é dividido. 0,04 separa bem cores de logo
 * e ignora o ruído do JPEG.
 * `opcoes.maximo`: o teto de cores no automático.
 *
 * Devolve `{ cores: [{ L, a, b, rgb: [r,g,b], hex, peso }], doMiolo }`.
 */
export function acharPaleta(px, largura, altura, medida, opcoes = {}) {
  const total = largura * altura;
  const { lab, opaco, miolo, quantosMiolo } = medida;
  let quantosOpacos = 0;
  for (let i = 0; i < total; i++) quantosOpacos += opaco[i];
  if (!quantosOpacos) return { cores: [], doMiolo: false };
  // Arte chapada tem quase tudo como miolo; numa foto, quase nada é.
  const doMiolo = quantosMiolo >= quantosOpacos * 0.25;
  const pontos = histograma(px, lab, doMiolo ? miolo : opaco, total);

  const fixo = opcoes.cores > 0 ? Math.max(1, Math.min(64, Math.round(opcoes.cores))) : null;
  const tol = opcoes.tolerancia > 0 ? opcoes.tolerancia : 0.04;
  const teto = fixo || Math.max(2, Math.min(64, Math.round(opcoes.maximo || 24)));

  // O menor tanto de pixels que uma cor precisa ter para valer cor própria:
  // 0,1% dos opacos, e pelo menos 20 pixels.
  const pesoMinimo = Math.max(20, quantosOpacos * 0.001);
  let grupos = [{ pontos, erro: erroDe(pontos, centroDe(pontos)) }];
  while (grupos.length < teto) {
    // O grupo que mais se espalha (ver `espalhamento`), e não o de maior
    // erro total: um grupo enorme e liso não precisa de divisão.
    let pior = -1, piorEsp = -1, piorRms = 0;
    grupos.forEach((g, k) => {
      if (g.final) return;
      const c = centroDe(g.pontos);
      // Grupo menor que o peso mínimo não vale uma cor própria.
      if (c.w < pesoMinimo && !fixo) return;
      const esp = espalhamento(g, c, pesoMinimo);
      if (g.pontos.length > 1 && esp.valor > piorEsp) { piorEsp = esp.valor; piorRms = esp.rms; pior = k; }
    });
    if (pior < 0) break;
    if (!fixo && piorEsp < tol) break;
    const partes = dividir(grupos[pior]);
    if (!partes) { grupos[pior].final = true; continue; }
    // Divisão pedida só pela cauda: as metades têm de ficar longe uma da
    // outra (ver SEPARACAO_DA_CAUDA), senão era ruído.
    if (!fixo && piorRms < tol) {
      const separacao = Math.sqrt(dist2(centroDe(partes[0]), centroDe(partes[1])));
      if (separacao < Math.max(SEPARACAO_DA_CAUDA, 1.6 * tol)) { grupos[pior].final = true; continue; }
    }
    grupos.splice(pior, 1,
      { pontos: partes[0], erro: erroDe(partes[0], centroDe(partes[0])) },
      { pontos: partes[1], erro: erroDe(partes[1], centroDe(partes[1])) });
  }

  const centros = refinar(grupos.map((g) => centroDe(g.pontos)), pontos);
  const cores = centros
    .sort((x, y) => y.w - x.w)
    .map((c) => {
      const rgb = deOklab(c.L, c.a, c.b);
      return { L: c.L, a: c.a, b: c.b, rgb, hex: `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`, peso: c.w };
    });
  return { cores, doMiolo };
}
