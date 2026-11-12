/**
 * ===========================================================================
 * AS CURVAS DO VETORIZADOR — da escada de pixels à curva de verdade
 * ===========================================================================
 *
 * Uma cadeia do mapa planar é uma escada: passos de um pixel, para o lado ou
 * para baixo. A curva que a arte tinha passa POR DENTRO dessa escada, e a
 * própria imagem diz por onde: o pixel da borda é uma MISTURA das duas cores
 * (o anti-serrilhado), e a proporção da mistura é a fração dele que cada
 * cor cobre. Seis passos reencontram a curva:
 *
 *   1. A BORDA NO SUBPIXEL. Cada passo da escada separa dois pixels; a
 *      cobertura dos dois pela cor da esquerda (`afinar`, vindo de quem
 *      conhece a imagem) diz a que distância da rachadura a borda passa, e
 *      o ponto médio do passo vai para lá. É o que tira o serrilhado pela
 *      raiz — sem ele, a escada é ruído de meio pixel que o ajuste copia.
 *      As pontas da cadeia (as junções) ficam exatas, para a vizinha
 *      encontrar a mesma ponta.
 *
 *   2. AS QUINAS. Onde a direção vira mais que o ângulo da quina (medido
 *      entre os pontos k passos antes e k depois, só no máximo local), é
 *      canto vivo. O canto vai para a INTERSEÇÃO das retas ajustadas aos
 *      pontos de cada lado — a ponta de uma estrela sai pontuda, e não
 *      cortada — ou, sem retas firmes, para o vértice da grade onde a escada
 *      vira.
 *
 *   3. O ALISAMENTO. Entre duas quinas, uma média gaussiana leve (quinas e
 *      pontas paradas) tira o que sobrou de ruído.
 *
 *   4. AS RETAS. Dentro de um trecho liso, os pedaços retos compridos (um
 *      retângulo de cantos redondos, o fuste de uma letra) são achados e
 *      saem como RETA; a curva que vem depois começa com a direção da reta
 *      — a emenda é lisa, sem quina e sem onda.
 *
 *   5. O AJUSTE. O resto vira Bézier cúbica pelo método de Philip J.
 *      Schneider ("An Algorithm for Automatically Fitting Digitized Curves",
 *      Graphics Gems, 1990): mínimos quadrados com a tangente das pontas
 *      fixa, reparametrização de Newton, e o trecho partido no ponto de maior
 *      erro enquanto o erro passar de `tolCurva`.
 *
 *   6. A FUSÃO E O CÍRCULO. Peças vizinhas que cabem numa cúbica só viram
 *      uma; e o laço liso que é círculo sai em quatro arcos exatos.
 *
 * O resultado de uma cadeia é `{ x0, y0, segs }`, com `segs` em ordem:
 * `{ t: "L", x, y }` ou `{ t: "C", x1, y1, x2, y2, x, y }`.
 */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const soma = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const ponto = (a, b) => a[0] * b[0] + a[1] * b[1];
const norma = (a) => Math.hypot(a[0], a[1]);
const unitario = (a) => { const l = norma(a); return l > 1e-12 ? [a[0] / l, a[1] / l] : [1, 0]; };

// ==================== 1. A BORDA NO SUBPIXEL ====================

/**
 * A escada → os pontos da borda: o meio de cada passo, deslocado para onde a
 * borda passa (`afinar(x0, y0, dx, dy)` devolve o deslocamento, em pixels,
 * na direção do lado DIREITO do passo). Na cadeia aberta, as pontas exatas.
 */
function pontosDaBorda(pts, fechada, afinar) {
  const n = pts.length / 2;
  const meio = (i) => {
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * i + 2], y1 = pts[2 * i + 3];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (!afinar) return [mx, my];
    const dx = x1 - x0, dy = y1 - y0;
    const d = afinar(x0, y0, dx, dy);
    // A normal para a direita de quem anda (y para baixo): (−dy, dx).
    return [mx - dy * d, my + dx * d];
  };
  const Q = [];
  if (fechada) {
    for (let i = 0; i + 1 < n; i++) Q.push(meio(i));
  } else {
    Q.push([pts[0], pts[1]]);
    for (let i = 0; i + 1 < n; i++) Q.push(meio(i));
    Q.push([pts[2 * (n - 1)], pts[2 * (n - 1) + 1]]);
  }
  return Q;
}

/**
 * O vértice da grade que fica do lado do ponto `i` da borda — o de antes ou
 * o de depois, o que a escada vira. `null` quando nenhum dos dois vira.
 */
function verticeDaVirada(pts, fechada, i) {
  const n = pts.length / 2;
  const ia = fechada ? i : i - 1;
  const ib = ia + 1;
  if (ia < 0 || ib >= n) return null;
  const passo = (a) => {
    const j = fechada ? ((a % (n - 1)) + (n - 1)) % (n - 1) : a;
    if (j < 0 || j + 1 >= n) return null;
    return [pts[2 * (j + 1)] - pts[2 * j], pts[2 * (j + 1) + 1] - pts[2 * j + 1]];
  };
  const igual = (u, v) => u && v && u[0] === v[0] && u[1] === v[1];
  const aqui = passo(ia);
  if (passo(ia + 1) && !igual(aqui, passo(ia + 1))) {
    const j = fechada ? ib % (n - 1) : ib;
    return [pts[2 * j], pts[2 * j + 1]];
  }
  if (passo(ia - 1) && !igual(aqui, passo(ia - 1))) {
    const j = fechada ? ia % (n - 1) : ia;
    return [pts[2 * j], pts[2 * j + 1]];
  }
  return null;
}

// ==================== 2. AS QUINAS ====================

function virada(Q, i, k, fechada) {
  const n = Q.length;
  const a = fechada ? Q[(i - k + n) % n] : Q[Math.max(0, i - k)];
  const b = fechada ? Q[(i + k) % n] : Q[Math.min(n - 1, i + k)];
  const p = Q[i];
  const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
  if ((ux === 0 && uy === 0) || (vx === 0 && vy === 0)) return 0;
  return Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy);
}

/**
 * As quinas: a virada medida entre o ponto `k` atrás e o `k` à frente. A
 * janela é de 3 pixels na arte nítida e cresce com a largura da borda
 * (`janela`): na imagem borrada ou ampliada, o ruído da posição da borda é
 * de vários pixels — com a janela curta, cada ondinha dele vira uma quina
 * e o círculo sai facetado — e a quina de verdade está arredondada na
 * mesma escala.
 */
function acharQuinas(Q, fechada, anguloQuina, janela = 3) {
  const n = Q.length;
  if (n < 5) return [];
  const k = n < 12 ? 2 : Math.max(2, Math.min(janela, Math.floor(n / 4)));
  const ang = new Float64Array(n);
  const ini = fechada ? 0 : 1, fim = fechada ? n : n - 1;
  for (let i = ini; i < fim; i++) ang[i] = virada(Q, i, k, fechada);
  const quinas = [];
  for (let i = ini; i < fim; i++) {
    if (ang[i] < anguloQuina) continue;
    let maximo = true;
    for (let j = -k; j <= k && maximo; j++) {
      if (!j) continue;
      const q = fechada ? (i + j + n) % n : i + j;
      if (q < ini || q >= fim) continue;
      if (ang[q] > ang[i] || (ang[q] === ang[i] && q < i)) maximo = false;
    }
    if (maximo) quinas.push(i);
  }
  return quinas;
}

/** A reta que melhor passa pelos pontos (mínimos quadrados totais): `{ c, d }` ou null. */
function retaDosPontos(pontos, folga = 0.6) {
  if (pontos.length < 3) return null;
  let mx = 0, my = 0;
  for (const p of pontos) { mx += p[0]; my += p[1]; }
  mx /= pontos.length; my /= pontos.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pontos) { const x = p[0] - mx, y = p[1] - my; sxx += x * x; syy += y * y; sxy += x * y; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const d = [Math.cos(ang), Math.sin(ang)];
  // Os pontos têm de estar de fato numa reta (desvio pequeno).
  let pior = 0;
  for (const p of pontos) pior = Math.max(pior, Math.abs((p[0] - mx) * d[1] - (p[1] - my) * d[0]));
  if (pior > folga) return null;
  return { c: [mx, my], d };
}

/**
 * O canto: a interseção das retas de cada lado, se ela fizer sentido. `F` é
 * a largura da borda (1 na arte nítida): na imagem borrada a quina está
 * arredondada em uns F pixels, e as retas são ajustadas depois disso, em
 * 6·F pontos, com a folga do desvio e da distância na mesma escala.
 */
function cantoPelasRetas(P, i, de, ate, F = 1) {
  const m = Math.round(6 * F);
  const pula = F > 1.5 ? Math.round(F / 2) : 0;
  const esq = retaDosPontos(P.slice(Math.max(de, i - m), Math.max(de, i - pula)), 0.6 * F);
  const dir = retaDosPontos(P.slice(Math.min(ate, i + 1 + pula), Math.min(ate, i + m) + 1), 0.6 * F);
  if (!esq || !dir) return null;
  const cruz = esq.d[0] * dir.d[1] - esq.d[1] * dir.d[0];
  if (Math.abs(cruz) < 0.25) return null; // quase paralelas: canto mal definido
  const w = sub(dir.c, esq.c);
  const t = (w[0] * dir.d[1] - w[1] * dir.d[0]) / cruz;
  const c = soma(esq.c, mul(esq.d, t));
  return norma(sub(c, P[i])) < 2.5 * F ? c : null;
}

// ==================== 3. O ALISAMENTO ====================

/** Média gaussiana dos pontos de `s` a `e` (as pontas paradas); `ciclo` para o laço sem quina. */
function alisar(Q, s, e, sigma, ciclo) {
  if (!(sigma > 0.05)) return;
  const w = Math.max(1, Math.ceil(3 * sigma));
  const pesos = [];
  for (let j = -w; j <= w; j++) pesos.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
  const n = Q.length;
  const novo = [];
  if (ciclo) {
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sw = 0;
      for (let j = -w; j <= w; j++) {
        const p = Q[(i + j + n) % n];
        const g = pesos[j + w];
        sx += g * p[0]; sy += g * p[1]; sw += g;
      }
      novo.push([sx / sw, sy / sw]);
    }
    for (let i = 0; i < n; i++) Q[i] = novo[i];
    return;
  }
  for (let i = s + 1; i < e; i++) {
    let sx = 0, sy = 0, sw = 0;
    // A janela simétrica que cabe no trecho: perto das pontas ela encolhe dos
    // DOIS lados, senão a média puxaria o ponto para dentro do trecho.
    const r = Math.min(w, i - s, e - i);
    for (let j = -r; j <= r; j++) {
      const p = Q[i + j];
      const g = pesos[j + w];
      sx += g * p[0]; sy += g * p[1]; sw += g;
    }
    novo.push([sx / sw, sy / sw]);
  }
  for (let i = s + 1; i < e; i++) Q[i] = novo[i - s - 1];
}

// ==================== 4 e 5. O AJUSTE (Schneider) ====================

function bezierEm(b, t) {
  const s = 1 - t;
  const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
  return [b0 * b[0][0] + b1 * b[1][0] + b2 * b[2][0] + b3 * b[3][0], b0 * b[0][1] + b1 * b[1][1] + b2 * b[2][1] + b3 * b[3][1]];
}

function parametrizarPelaCorda(P, i0, i1) {
  const u = [0];
  for (let i = i0 + 1; i <= i1; i++) u.push(u[u.length - 1] + norma(sub(P[i], P[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function gerarBezier(P, i0, i1, u, t1, t2) {
  const p0 = P[i0], p3 = P[i1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i], s = 1 - t;
    const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
    const a1 = mul(t1, b1), a2 = mul(t2, b2);
    c00 += ponto(a1, a1); c01 += ponto(a1, a2); c11 += ponto(a2, a2);
    const tmp = sub(P[i0 + i], soma(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += ponto(a1, tmp); x1 += ponto(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let al = det !== 0 ? (x0 * c11 - x1 * c01) / det : 0;
  let ar = det !== 0 ? (c00 * x1 - c01 * x0) / det : 0;
  const lado = norma(sub(p3, p0));
  if (al < 1e-6 * lado || ar < 1e-6 * lado) { al = lado / 3; ar = lado / 3; }
  return [p0, soma(p0, mul(t1, al)), soma(p3, mul(t2, ar)), p3];
}

function erroMaximo(P, i0, i1, b, u) {
  let max = 0, onde = Math.floor((i0 + i1) / 2);
  for (let i = 1; i < u.length - 1; i++) {
    const d = sub(bezierEm(b, u[i]), P[i0 + i]);
    const e = d[0] * d[0] + d[1] * d[1];
    if (e >= max) { max = e; onde = i0 + i; }
  }
  return [max, onde];
}

function reparametrizar(P, i0, b, u) {
  const d1 = [mul(sub(b[1], b[0]), 3), mul(sub(b[2], b[1]), 3), mul(sub(b[3], b[2]), 3)];
  const d2 = [mul(sub(d1[1], d1[0]), 2), mul(sub(d1[2], d1[1]), 2)];
  return u.map((t, i) => {
    const s = 1 - t;
    const q = bezierEm(b, t);
    const q1 = [s * s * d1[0][0] + 2 * s * t * d1[1][0] + t * t * d1[2][0], s * s * d1[0][1] + 2 * s * t * d1[1][1] + t * t * d1[2][1]];
    const q2 = [s * d2[0][0] + t * d2[1][0], s * d2[0][1] + t * d2[1][1]];
    const dif = sub(q, P[i0 + i]);
    const num = ponto(dif, q1);
    const den = ponto(q1, q1) + ponto(dif, q2);
    if (Math.abs(den) < 1e-12) return t;
    return Math.max(0, Math.min(1, t - num / den));
  });
}

/** Uma cúbica só para P[i0..i1], com reparametrização: `{ cabe, b, onde }`. */
function tentarCubica(P, i0, i1, t1, t2, erro2) {
  let u = parametrizarPelaCorda(P, i0, i1);
  let b = gerarBezier(P, i0, i1, u, t1, t2);
  let [erro, onde] = erroMaximo(P, i0, i1, b, u);
  if (erro < erro2) return { cabe: true, b, onde };
  if (erro < erro2 * 9) {
    for (let it = 0; it < 8; it++) {
      u = reparametrizar(P, i0, b, u);
      b = gerarBezier(P, i0, i1, u, t1, t2);
      [erro, onde] = erroMaximo(P, i0, i1, b, u);
      if (erro < erro2) return { cabe: true, b, onde };
    }
  }
  return { cabe: false, b, onde };
}

function ajustarCubica(P, i0, i1, t1, t2, erro2, saida, profundidade = 0) {
  const n = i1 - i0 + 1;
  if (n <= 2 || profundidade > 40) {
    const lado = norma(sub(P[i1], P[i0])) / 3;
    saida.push({ b: [P[i0], soma(P[i0], mul(t1, lado)), soma(P[i1], mul(t2, lado)), P[i1]], i0, i1 });
    return;
  }
  const r = tentarCubica(P, i0, i1, t1, t2, erro2);
  if (r.cabe) { saida.push({ b: r.b, i0, i1 }); return; }
  let onde = r.onde;
  if (onde <= i0) onde = i0 + 1;
  if (onde >= i1) onde = i1 - 1;
  const tc = unitario(sub(P[onde - 1], P[onde + 1]));
  ajustarCubica(P, i0, onde, t1, tc, erro2, saida, profundidade + 1);
  ajustarCubica(P, onde, i1, mul(tc, -1), t2, erro2, saida, profundidade + 1);
}

/**
 * A FUSÃO. O corte no ponto de maior erro raramente cai no lugar ideal, e o
 * trecho sai com peças demais. Depois de cortar, cada par de peças vizinhas
 * tenta virar uma cúbica só (com as tangentes das pontas de fora e o mesmo
 * erro máximo), até nenhum par caber.
 */
function fundir(P, pecas, erro2, tangente) {
  let mudou = true;
  while (mudou && pecas.length > 1) {
    mudou = false;
    for (let k = 0; k + 1 < pecas.length; k++) {
      const a = pecas[k], b = pecas[k + 1];
      const r = tentarCubica(P, a.i0, b.i1, tangente(a.i0, true), tangente(b.i1, false), erro2);
      if (r.cabe) {
        pecas.splice(k, 2, { b: r.b, i0: a.i0, i1: b.i1 });
        mudou = true;
      }
    }
  }
  return pecas;
}

/** A curva lisa P[i0..i1] (com as tangentes das pontas dadas, ou estimadas). */
function curvaLisa(P, i0, i1, tolCurva, segs, t1dado, t2dado) {
  const t1 = t1dado || unitario(sub(P[Math.min(i0 + 2, i1)], P[i0]));
  const t2 = t2dado || unitario(sub(P[Math.max(i1 - 2, i0)], P[i1]));
  const erro2 = tolCurva * tolCurva;
  const pecas = [];
  ajustarCubica(P, i0, i1, t1, t2, erro2, pecas);
  const tangente = (i, saindo) => {
    if (i === i0) return t1;
    if (i === i1) return t2;
    const t = unitario(sub(P[i + 1], P[i - 1]));
    return saindo ? t : mul(t, -1);
  };
  fundir(P, pecas, erro2, tangente);
  pecas.forEach(({ b: c }) => segs.push({ t: "C", x1: c[1][0], y1: c[1][1], x2: c[2][0], y2: c[2][1], x: c[3][0], y: c[3][1] }));
}

/** P[i..j] cabe numa reta (a menos de `tol` da corda)? */
function cabeNaReta(P, i, j, tol) {
  const a = P[i], corda = sub(P[j], a);
  const lado = norma(corda);
  if (lado < 1e-9) return j - i <= 2;
  for (let k = i + 1; k < j; k++) {
    if (Math.abs(corda[0] * (P[k][1] - a[1]) - corda[1] * (P[k][0] - a[0])) / lado > tol) return false;
  }
  return true;
}

/**
 * P[i..j] faz ARCO? O arco de raio grande cabe na tolerância da reta — e
 * vira faceta: o círculo grande sai polígono, cordas emendadas com quina.
 * A diferença está no LADO do desvio: na reta de verdade ele não tem lado
 * preferido; no arco, o meio fica todo de um lado e as pontas do outro.
 * A conta é o desvio médio do meio (de 1/4 a 3/4 da corda) menos o das
 * pontas: a inclinação e o deslocamento da corda (o ruído dos pontos das
 * pontas) somem nessa diferença, e o arco de flecha f dá f/2. Uma reta que
 * entra uns pixels numa curva (o lado do retângulo arredondado) passa: a
 * cauda é curta perto do lado inteiro.
 *
 * O limiar (0,18 da tolerância) é medido: nas retas de verdade dos casos da
 * bancada a diferença fica abaixo de 0,15·tol; nas cordas de arco, acima de
 * 0,20·tol — inclusive as que o RUÍDO encurtou (na imagem borrada, um
 * pico de ruído chega à tolerância antes da flecha, e a corda curta passava
 * por reta com o limiar antigo de 0,3·tol: era a faceta do "O").
 */
const LIMIAR_DO_ARCO = 0.18;

function fazArco(P, i, j, tol) {
  const a = P[i], corda = sub(P[j], a);
  const lado = norma(corda);
  if (lado < 1e-9) return false;
  const d = [corda[0] / lado, corda[1] / lado];
  let meio = 0, nMeio = 0, pontas = 0, nPontas = 0;
  for (let k = i; k <= j; k++) {
    const v = sub(P[k], a);
    const u = ponto(v, d) / lado;
    const desvio = v[0] * d[1] - v[1] * d[0];
    if (u > 0.25 && u < 0.75) { meio += desvio; nMeio++; } else { pontas += desvio; nPontas++; }
  }
  if (nMeio < 3 || nPontas < 3) return false;
  return Math.abs(meio / nMeio - pontas / nPontas) > LIMIAR_DO_ARCO * tol;
}

/**
 * As RETAS compridas dentro de um trecho liso: `[[i, j], ...]`, cada uma com
 * pelo menos `comprimento` pixels e sem cara de arco (`fazArco`). A busca
 * estende cada reta dobrando o alcance e depois afinando por bissecção.
 */
function acharRetas(P, s, e, tol, comprimento) {
  const retas = [];
  let i = s;
  while (i < e) {
    let j = i + 1;
    let passo = 4;
    // Dobra enquanto couber…
    while (j + passo <= e && cabeNaReta(P, i, j + passo, tol)) { j += passo; passo *= 2; }
    // …e afina.
    while (passo > 1) {
      passo = Math.floor(passo / 2);
      if (j + passo <= e && cabeNaReta(P, i, j + passo, tol)) j += passo;
    }
    if (norma(sub(P[j], P[i])) >= comprimento && !fazArco(P, i, j, tol)) {
      retas.push([i, j]);
      i = j;
    } else {
      i++;
    }
  }
  return retas;
}

/** Um trecho entre quinas: as retas compridas e as curvas entre elas, emendadas lisas. */
function ajustarTrecho(P, i0, i1, op, segs, tangentesDasPontas = null) {
  if (i1 - i0 <= 1 || (cabeNaReta(P, i0, i1, op.tolReta) && !fazArco(P, i0, i1, op.tolReta))) {
    segs.push({ t: "L", x: P[i1][0], y: P[i1][1] });
    return;
  }
  const retas = i1 - i0 >= 2 * op.retaMinima ? acharRetas(P, i0, i1, op.tolReta, op.retaMinima) : [];
  if (!retas.length) {
    curvaLisa(P, i0, i1, op.tolCurva, segs, tangentesDasPontas && tangentesDasPontas[0], tangentesDasPontas && tangentesDasPontas[1]);
    return;
  }
  // Entre as retas, curvas que começam e terminam na direção delas.
  let atual = i0;
  let tAtual = tangentesDasPontas ? tangentesDasPontas[0] : null;
  for (const [ri, rj] of retas) {
    const dirReta = unitario(sub(P[rj], P[ri]));
    if (ri > atual) curvaLisa(P, atual, ri, op.tolCurva, segs, tAtual, mul(dirReta, -1));
    segs.push({ t: "L", x: P[rj][0], y: P[rj][1] });
    atual = rj;
    tAtual = dirReta;
  }
  if (i1 > atual) curvaLisa(P, atual, i1, op.tolCurva, segs, tAtual, tangentesDasPontas ? tangentesDasPontas[1] : null);
}

// ==================== 6. A ELIPSE (e o círculo) ====================

/**
 * Laço liso que é ELIPSE (o círculo é o caso particular) sai em quatro arcos
 * exatos. A elipse sai dos MOMENTOS de área do laço (fórmula do laço de
 * Green): o centro é o centroide, e os eixos e a rotação saem da matriz de
 * covariância da área — numa elipse de semieixos a e b, os autovalores dela
 * são a²/4 e b²/4. Depois, cada ponto do laço tem de cair a menos de `tol`
 * da elipse; se algum não cair, não é elipse. `null` se não for.
 */
function acharElipse(Q, tol) {
  const n = Q.length;
  if (n < 16) return null;
  let A = 0, Cx = 0, Cy = 0, Ixx = 0, Iyy = 0, Ixy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = Q[i], [x1, y1] = Q[(i + 1) % n];
    const c = x0 * y1 - x1 * y0;
    A += c;
    Cx += (x0 + x1) * c; Cy += (y0 + y1) * c;
    Ixx += (x0 * x0 + x0 * x1 + x1 * x1) * c;
    Iyy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    Ixy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  A /= 2;
  if (Math.abs(A) < 16) return null;
  const cx = Cx / (6 * A), cy = Cy / (6 * A);
  // Momentos centrais, já divididos pela área (a covariância).
  const sxx = Ixx / (12 * A) - cx * cx;
  const syy = Iyy / (12 * A) - cy * cy;
  const sxy = Ixy / (24 * A) - cx * cy;
  const meio = (sxx + syy) / 2, raiz = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  const l1 = meio + raiz, l2 = meio - raiz;
  if (!(l2 > 0)) return null;
  const a = 2 * Math.sqrt(l1), b = 2 * Math.sqrt(l2);
  if (b < 2) return null;
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const co = Math.cos(ang), se = Math.sin(ang);
  // Cada ponto a menos de `tol` da elipse — com folga para o ruído: até 5%
  // dos pontos podem passar de `tol`, nenhum de 2,5 × `tol`. Uma forma que
  // não é elipse (o ovo, o quadrado arredondado) erra num trecho inteiro, e
  // não em pontos soltos; o círculo de uma imagem borrada erra em pontos
  // soltos.
  let fora = 0;
  for (const [x, y] of Q) {
    const dx = x - cx, dy = y - cy;
    const u = dx * co + dy * se, v = -dx * se + dy * co;
    // Distância aproximada à elipse: o desvio radial na escala do eixo menor.
    const r = Math.sqrt((u / a) ** 2 + (v / b) ** 2);
    const desvio = Math.abs(r - 1) * Math.min(a, b);
    if (desvio > 2.5 * tol) return null;
    if (desvio > tol && ++fora > n * 0.05) return null;
  }
  return { cx, cy, a, b, co, se, horario: A > 0 };
}

/** Os quatro arcos da elipse (o círculo unitário levado pelos eixos dela). */
function arcosDaElipse({ cx, cy, a, b, co, se, horario }) {
  const k = 0.5522847498;
  const s = horario ? 1 : -1;
  // No quadro da elipse: os quatro pontos e as tangentes, no sentido do laço.
  const pontos = [[1, 0], [0, s], [-1, 0], [0, -s]];
  const tangentes = [[0, s], [-1, 0], [0, -s], [1, 0]];
  const levar = (u, v) => [cx + a * u * co - b * v * se, cy + a * u * se + b * v * co];
  const segs = [];
  for (let q = 0; q < 4; q++) {
    const p = pontos[q], r = pontos[(q + 1) % 4];
    const tp = tangentes[q], tr = tangentes[(q + 1) % 4];
    const c1 = levar(p[0] + tp[0] * k, p[1] + tp[1] * k);
    const c2 = levar(r[0] - tr[0] * k, r[1] - tr[1] * k);
    const fim = levar(r[0], r[1]);
    segs.push({ t: "C", x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1], x: fim[0], y: fim[1] });
  }
  const ini = levar(1, 0);
  return { x0: ini[0], y0: ini[1], segs };
}

// ==================== A CADEIA INTEIRA ====================

/**
 * Ajusta uma cadeia do mapa planar.
 *
 * `opcoes.tolReta` / `tolCurva`: o quanto (em pixels) a reta e a curva podem
 * se afastar dos pontos. `opcoes.sigma`: o alisamento (em passos).
 * `opcoes.quina`: o ângulo de virada (em graus) a partir do qual é canto vivo.
 * `opcoes.retaMinima`: o comprimento (em pixels) a partir do qual um pedaço
 * reto dentro de um trecho liso sai como reta.
 * `afinar`: a borda no subpixel (ver o cabeçalho); sem ela, o meio do passo.
 */
export function ajustarCadeia(pts, fechada, opcoes = {}, afinar = null) {
  const op = {
    tolReta: opcoes.tolReta == null ? 0.45 : opcoes.tolReta,
    tolCurva: opcoes.tolCurva == null ? 0.7 : opcoes.tolCurva,
    retaMinima: opcoes.retaMinima == null ? 10 : opcoes.retaMinima,
  };
  const sigma = opcoes.sigma == null ? 1.2 : opcoes.sigma;
  const anguloQuina = ((opcoes.quina == null ? 55 : opcoes.quina) * Math.PI) / 180;
  // A largura da borda (ver `larguraDaBorda`, no index.js): 1 na arte nítida.
  const F = opcoes.fator > 1 ? opcoes.fator : 1;

  const Q = pontosDaBorda(pts, fechada, afinar);
  const n = Q.length;
  if (!fechada && n <= 3) {
    return { x0: Q[0][0], y0: Q[0][1], segs: [{ t: "L", x: Q[n - 1][0], y: Q[n - 1][1] }] };
  }
  const quinas = acharQuinas(Q, fechada, anguloQuina, Math.round(3 * F));

  if (fechada && quinas.length === 0) {
    // O laço liso (um círculo, uma gota): alisado em volta e ajustado inteiro.
    alisar(Q, 0, n - 1, sigma, true);
    const elipse = acharElipse(Q, Math.max(0.35, op.tolCurva * 0.8));
    if (elipse) return arcosDaElipse(elipse);
    // Começa num ponto de uma reta comprida, se houver: a emenda do laço cai
    // no meio dela e some.
    const P = [...Q, Q[0]];
    const t = unitario(sub(P[1], P[P.length - 2]));
    const segs = [];
    ajustarTrecho(P, 0, P.length - 1, op, segs, [t, mul(t, -1)]);
    return { x0: P[0][0], y0: P[0][1], segs };
  }

  // Os pontos de quebra, em ordem (o laço gira para começar na 1ª quina).
  let P = Q;
  let quebras;
  let original = (k) => k;
  if (fechada) {
    const q0 = quinas[0];
    P = [...Q.slice(q0), ...Q.slice(0, q0), Q[q0]];
    quebras = [...quinas.map((q) => (q - q0 + n) % n), n];
    original = (k) => (k + q0) % n;
  } else {
    quebras = [0, ...quinas, n - 1];
  }
  // O canto de cada quina: interseção das retas, ou o vértice da grade.
  const cantos = [];
  for (let k = 0; k < quebras.length; k++) {
    const i = quebras[k];
    const ehPonta = !fechada && (k === 0 || k === quebras.length - 1);
    if (ehPonta || (fechada && k === quebras.length - 1)) { cantos.push(null); continue; }
    const de = k > 0 ? quebras[k - 1] : (fechada ? 0 : 0);
    const ate = k + 1 < quebras.length ? quebras[k + 1] : P.length - 1;
    cantos.push(cantoPelasRetas(P, i, de, ate, F) || verticeDaVirada(pts, fechada, original(i)));
  }
  cantos.forEach((c, k) => { if (c) P[quebras[k]] = c; });
  if (fechada) P[P.length - 1] = P[0];

  for (let k = 0; k + 1 < quebras.length; k++) alisar(P, quebras[k], quebras[k + 1], sigma, false);
  const segs = [];
  for (let k = 0; k + 1 < quebras.length; k++) {
    if (quebras[k + 1] > quebras[k]) ajustarTrecho(P, quebras[k], quebras[k + 1], op, segs);
  }
  return { x0: P[0][0], y0: P[0][1], segs };
}

/** A mesma curva percorrida ao contrário (para a região do outro lado). */
export function inverterAjuste(aj) {
  const pontos = [[aj.x0, aj.y0], ...aj.segs.map((s) => [s.x, s.y])];
  const segs = [];
  for (let k = aj.segs.length - 1; k >= 0; k--) {
    const s = aj.segs[k];
    const destino = pontos[k];
    segs.push(s.t === "L"
      ? { t: "L", x: destino[0], y: destino[1] }
      : { t: "C", x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, x: destino[0], y: destino[1] });
  }
  const fim = pontos[pontos.length - 1];
  return { x0: fim[0], y0: fim[1], segs };
}
