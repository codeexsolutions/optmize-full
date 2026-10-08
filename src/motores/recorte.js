/**
 * ===========================================================================
 * O RECORTE — a máscara da rede vira o elemento, na resolução da foto
 * ===========================================================================
 *
 * A rede trabalha na foto de trabalho (lado maior em 2048); o elemento sai da
 * foto ORIGINAL, que pode ter o dobro disso. Aqui a máscara é esticada até a
 * original, vira a transparência do elemento, e a borda é limpa da cor da
 * camisa que sobrou em volta — a separação pela cor, só como acabamento.
 *
 * A COR FICA DEBAIXO DO TRANSPARENTE, de propósito: a ampliação lê os
 * vizinhos de cada pixel, e preto debaixo da borda viraria um contorno escuro
 * (o mesmo cuidado do ladrilho da ampliação, que repete a borda).
 *
 * Conta pura, sem DOM.
 */

/** Estica a máscara (um byte por pixel) de `lm × am` para `largura × altura`, misturando os vizinhos. */
export function ampliarMascara(alfa, lm, am, largura, altura) {
  if (lm === largura && am === altura) return Uint8Array.from(alfa);
  const saida = new Uint8Array(largura * altura);
  const kx = lm / largura, ky = am / altura;
  for (let y = 0; y < altura; y++) {
    const sy = Math.min(am - 1, Math.max(0, (y + 0.5) * ky - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(am - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < largura; x++) {
      const sx = Math.min(lm - 1, Math.max(0, (x + 0.5) * kx - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(lm - 1, x0 + 1), fx = sx - x0;
      const cima = alfa[y0 * lm + x0] * (1 - fx) + alfa[y0 * lm + x1] * fx;
      const baixo = alfa[y1 * lm + x0] * (1 - fx) + alfa[y1 * lm + x1] * fx;
      saida[y * largura + x] = Math.round(cima * (1 - fy) + baixo * fy);
    }
  }
  return saida;
}

export function caixaDaMascara(alfa, largura, altura, corte = 128) {
  let x0 = largura, y0 = altura, x1 = -1, y1 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (alfa[y * largura + x] < corte) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** O elemento: a foto com a máscara no alfa, cortada na caixa dela mais `margem`. `null` se a máscara é vazia. */
export function aplicarMascara(rgba, largura, altura, alfa, margem = 2) {
  const c = caixaDaMascara(alfa, largura, altura);
  if (!c) return null;
  const x0 = Math.max(0, c.x0 - margem), y0 = Math.max(0, c.y0 - margem);
  const x1 = Math.min(largura - 1, c.x1 + margem), y1 = Math.min(altura - 1, c.y1 + margem);
  const L = x1 - x0 + 1, A = y1 - y0 + 1;
  const saida = new Uint8ClampedArray(L * A * 4);
  for (let y = 0; y < A; y++) {
    for (let x = 0; x < L; x++) {
      const de = (y0 + y) * largura + x0 + x, para = (y * L + x) * 4;
      saida[para] = rgba[de * 4];
      saida[para + 1] = rgba[de * 4 + 1];
      saida[para + 2] = rgba[de * 4 + 2];
      saida[para + 3] = Math.min(rgba[de * 4 + 3], alfa[de]);
    }
  }
  return { rgba: saida, largura: L, altura: A, x0, y0 };
}

/** Os marcados engordados `raio` pixels numa caixa: um máximo deslizante nas linhas e outro nas colunas. */
function engordar(marcado, largura, altura, raio) {
  const meio = new Uint8Array(largura * altura), saida = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    let ultimo = -Infinity;
    for (let x = 0; x < largura; x++) {
      if (marcado[y * largura + x]) ultimo = x;
      if (x - ultimo <= raio) meio[y * largura + x] = 1;
    }
    ultimo = Infinity;
    for (let x = largura - 1; x >= 0; x--) {
      if (marcado[y * largura + x]) ultimo = x;
      if (ultimo - x <= raio) meio[y * largura + x] = 1;
    }
  }
  for (let x = 0; x < largura; x++) {
    let ultimo = -Infinity;
    for (let y = 0; y < altura; y++) {
      if (meio[y * largura + x]) ultimo = y;
      if (y - ultimo <= raio) saida[y * largura + x] = 1;
    }
    ultimo = Infinity;
    for (let y = altura - 1; y >= 0; y--) {
      if (meio[y * largura + x]) ultimo = y;
      if (ultimo - y <= raio) saida[y * largura + x] = 1;
    }
  }
  return saida;
}

const mediana = (v) => v.sort((a, b) => a - b)[v.length >> 1];

/** A cor de baixo (a camisa): a mediana do anel logo fora da máscara. `null` sem anel (máscara do tamanho da foto). */
export function corDeFora(rgba, largura, altura, alfa, anel = 6) {
  const total = largura * altura;
  const dentro = new Uint8Array(total);
  for (let i = 0; i < total; i++) dentro[i] = alfa[i] >= 128 ? 1 : 0;
  const perto = engordar(dentro, largura, altura, anel);
  const ehAnel = (i) => perto[i] && alfa[i] < 32 && rgba[i * 4 + 3] >= 128;
  let n = 0;
  for (let i = 0; i < total; i++) if (ehAnel(i)) n++;
  if (n === 0) return null;
  // Uns 20 mil pixels bastam: a mediana não muda com mais.
  const passo = Math.max(1, Math.ceil(n / 20000));
  const r = [], g = [], b = [];
  for (let i = 0, k = 0; i < total; i++) {
    if (!ehAnel(i) || k++ % passo) continue;
    r.push(rgba[i * 4]); g.push(rgba[i * 4 + 1]); b.push(rgba[i * 4 + 2]);
  }
  return [mediana(r), mediana(g), mediana(b)];
}

/**
 * Apaga da borda do recorte o que tem a cor de baixo: o pixel a até `raio` de
 * um transparente cuja cor fica a menos de `tolerancia` (a soma das
 * diferenças nos três canais) da camisa. Mexe no recorte; devolve quantos apagou.
 */
export function limparBorda(recorte, cor, { tolerancia = 48, raio = 3 } = {}) {
  const { rgba, largura, altura } = recorte;
  const total = largura * altura;
  const vazio = new Uint8Array(total);
  for (let i = 0; i < total; i++) vazio[i] = rgba[i * 4 + 3] < 32 ? 1 : 0;
  const pertoDoVazio = engordar(vazio, largura, altura, raio);
  let apagados = 0;
  for (let i = 0; i < total; i++) {
    if (vazio[i] || !pertoDoVazio[i]) continue;
    const d = Math.abs(rgba[i * 4] - cor[0]) + Math.abs(rgba[i * 4 + 1] - cor[1]) + Math.abs(rgba[i * 4 + 2] - cor[2]);
    if (d < tolerancia) {
      rgba[i * 4 + 3] = 0;
      apagados++;
    }
  }
  return apagados;
}

/** A imagem inteira como elemento: cortada no que não é transparente, quando há transparência. */
export function recorteInteiro(rgba, largura, altura) {
  const total = largura * altura;
  const alfa = new Uint8Array(total);
  let temFuro = false;
  for (let i = 0; i < total; i++) {
    alfa[i] = rgba[i * 4 + 3];
    if (alfa[i] < 250) temFuro = true;
  }
  if (!temFuro) return { rgba: Uint8ClampedArray.from(rgba), largura, altura, x0: 0, y0: 0 };
  return aplicarMascara(rgba, largura, altura, alfa, 0);
}
