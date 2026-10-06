/**
 * ===========================================================================
 * PERSPECTIVA — a foto tirada de lado volta a ficar de frente
 * ===========================================================================
 *
 * O operador marca os quatro cantos de uma área que, na peça, é um retângulo
 * (a frente da camisa, a placa do escudo), e a foto é refeita como se a
 * câmera estivesse bem de frente. É a conta de um PLANO: dobra de tecido não
 * se desfaz assim — o que a dobra fez com a cor, a limpeza do jeito Chapado
 * apaga depois.
 *
 * Conta pura, sem DOM (a regra da pasta): entram e saem pixels RGBA.
 */

/** Resolve o sistema 8 × 8 por eliminação com pivô parcial; `null` se os cantos estão alinhados. */
function resolver(A, b) {
  const n = b.length;
  const M = A.map((linha, i) => [...linha, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const f = M[i][c] / M[c][c];
      for (let k = c; k <= n; k++) M[i][k] -= f * M[c][k];
    }
  }
  return M.map((linha, i) => linha[n] / linha[i]);
}

/** A homografia que leva os 4 pontos `de` aos 4 `para`, em 9 números por linha (o último é 1). */
export function homografia(de, para) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = de[i];
    const { x: u, y: v } = para[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = resolver(A, b);
  return h ? [...h, 1] : null;
}

export function aplicarHomografia(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/**
 * Os cantos formam um quadrilátero que não se cruza, na ordem cima-esq,
 * cima-dir, baixo-dir, baixo-esq? Na tela (y para baixo) essa volta é no
 * sentido do relógio, e o produto vetorial de cada virada sai positivo.
 */
export function cantosValidos(cantos) {
  if (!Array.isArray(cantos) || cantos.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = cantos[i], b = cantos[(i + 1) % 4], c = cantos[(i + 2) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 1e-9) return false;
  }
  return true;
}

/** O tamanho do retângulo endireitado: em cada sentido, o mais comprido dos dois lados opostos. */
export function tamanhoEndireitado(cantos) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const [a, b, c, e] = cantos;
  return {
    largura: Math.max(1, Math.round(Math.max(d(a, b), d(e, c)))),
    altura: Math.max(1, Math.round(Math.max(d(a, e), d(b, c)))),
  };
}

/** Lê a foto num ponto quebrado, misturando os quatro vizinhos (bilinear), com a borda repetida. */
function amostrar(rgba, largura, altura, x, y, saida, o) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = Math.min(largura - 1, Math.max(0, x0)), xb = Math.min(largura - 1, Math.max(0, x0 + 1));
  const ya = Math.min(altura - 1, Math.max(0, y0)), yb = Math.min(altura - 1, Math.max(0, y0 + 1));
  const i00 = (ya * largura + xa) * 4, i10 = (ya * largura + xb) * 4;
  const i01 = (yb * largura + xa) * 4, i11 = (yb * largura + xb) * 4;
  for (let k = 0; k < 4; k++) {
    const cima = rgba[i00 + k] * (1 - fx) + rgba[i10 + k] * fx;
    const baixo = rgba[i01 + k] * (1 - fx) + rgba[i11 + k] * fx;
    saida[o + k] = Math.round(cima * (1 - fy) + baixo * fy);
  }
}

/**
 * Endireita a área dos 4 cantos (cima-esq, cima-dir, baixo-dir, baixo-esq, em
 * pixels da foto). `null` se os cantos se cruzam. Acima de `tetoDePixels` o
 * retângulo é reduzido na proporção.
 */
export function desentortar(rgba, largura, altura, cantos, tetoDePixels = 40e6) {
  if (!cantosValidos(cantos)) return null;
  let { largura: L, altura: A } = tamanhoEndireitado(cantos);
  if (L * A > tetoDePixels) {
    const k = Math.sqrt(tetoDePixels / (L * A));
    L = Math.max(1, Math.floor(L * k));
    A = Math.max(1, Math.floor(A * k));
  }
  const H = homografia([{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: A }, { x: 0, y: A }], cantos);
  if (!H) return null;
  const saida = new Uint8ClampedArray(L * A * 4);
  for (let v = 0; v < A; v++) {
    for (let u = 0; u < L; u++) {
      // O centro do pixel de saída vai para o ponto da foto; menos meio pixel volta ao canto do pixel de lá.
      const p = aplicarHomografia(H, u + 0.5, v + 0.5);
      amostrar(rgba, largura, altura, p.x - 0.5, p.y - 0.5, saida, (v * L + u) * 4);
    }
  }
  return { rgba: saida, largura: L, altura: A };
}
