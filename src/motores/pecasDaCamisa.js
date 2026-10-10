/**
 * ===========================================================================
 * AS PEÇAS DA CAMISA — o mockup vira o retângulo cheio de cada peça
 * ===========================================================================
 *
 * O Extrator separa a camisa do mockup; aqui ela vira a arte como foi
 * desenhada antes de virar camisa: um retângulo para a frente, um para as
 * costas e um para cada manga, na medida que o operador digita. É o mesmo
 * retângulo que sai do Corel e que o `arteMolde.js` sabe encaixar no molde.
 *
 * O caminho de uma peça, todo em conta pura (roda no worker do Extrator):
 *
 *   1. o corpo é a máscara da frente (ou das costas) MENOS as das mangas da
 *      mesma vista — a cava é a divisa;
 *   2. a sombra do mockup sai: a luz é estimada pelo que deveria ser branco
 *      e dividida (`tirarSombra`);
 *   3. a arte entra no retângulo SEM DEFORMAR, cobrindo a largura e
 *      centralizada (`encaixeNaArea`); o operador ajusta zoom e posição;
 *   4. o que fica de fora da silhueta (decote, cavas, faixas) sai com alfa 0:
 *      é o buraco que a LaMa preenche no servidor.
 *
 * A manga junta as duas vistas num retângulo só: a metade da esquerda vem da
 * vista da frente e a da direita, espelhada, da vista das costas; a costura do
 * meio vira buraco, para o preenchimento suavizar a emenda.
 *
 * Esquerda e direita são de QUEM VESTE a camisa: na vista da frente, a manga
 * esquerda aparece do lado direito da foto.
 */

import { engordar } from "./recorte";

/** As seis marcações, na ordem em que a tela pede. */
export const MARCACOES = [
  { id: "frente", nome: "Frente" },
  { id: "costas", nome: "Costas" },
  { id: "manga-esquerda-frente", nome: "Manga esquerda, vista da frente" },
  { id: "manga-esquerda-costas", nome: "Manga esquerda, vista das costas" },
  { id: "manga-direita-frente", nome: "Manga direita, vista da frente" },
  { id: "manga-direita-costas", nome: "Manga direita, vista das costas" },
];

/** As quatro peças que saem, com o papel delas no molde (ver `telas/moldes/vocabulario.ts`). */
export const PECAS = [
  { id: "frente", nome: "Frente", papel: "frente" },
  { id: "costas", nome: "Costas", papel: "costas" },
  { id: "manga-esquerda", nome: "Manga esquerda", papel: "manga esquerda" },
  { id: "manga-direita", nome: "Manga direita", papel: "manga direita" },
];

/** O lado maior da montagem que vai à LaMa; o tamanho final sai da ampliação. */
export const LADO_DA_MONTAGEM = 2048;
/** Acima disto da peça inventada, a tela avisa antes de seguir. */
export const LIMITE_INVENTADO = 0.5;
/** A largura da costura do meio da manga, em fração da largura da manga. */
export const COSTURA_DA_MANGA = 0.03;

/**
 * O corpo: a máscara da peça sem as mangas da mesma vista. Devolve a máscara
 * nova e quais mangas NÃO encostam no corpo (a divisa não foi achada: a caixa
 * da manga pegou outra coisa). A manga solta não é tirada do corpo.
 */
export function corpoSemMangas(alfa, mangas, largura, altura) {
  const corpo = Uint8Array.from(alfa);
  const soltas = [];
  mangas.forEach((manga, i) => {
    if (!manga) return;
    const marcada = new Uint8Array(largura * altura);
    for (let p = 0; p < marcada.length; p++) marcada[p] = manga[p] >= 128 ? 1 : 0;
    const perto = engordar(marcada, largura, altura, 3);
    let encosta = false;
    for (let p = 0; p < marcada.length && !encosta; p++) if (perto[p] && !marcada[p] && alfa[p] >= 128) encosta = true;
    if (!encosta) {
      soltas.push(i);
      return;
    }
    for (let p = 0; p < marcada.length; p++) if (marcada[p]) corpo[p] = 0;
  });
  return { alfa: corpo, soltas };
}

/** O tamanho da montagem para a medida em cm: a mesma proporção, lado maior em `LADO_DA_MONTAGEM`. */
export function tamanhoDaMontagem(larguraCm, alturaCm) {
  const k = LADO_DA_MONTAGEM / Math.max(larguraCm, alturaCm);
  return { largura: Math.max(1, Math.round(larguraCm * k)), altura: Math.max(1, Math.round(alturaCm * k)) };
}

export const AJUSTE_INICIAL = { zoom: 1, dx: 0, dy: 0 };

/**
 * Onde a arte entra na área: sem deformar, cobrindo a largura, centralizada.
 * `zoom` aumenta a partir daí; `dx` e `dy` deslocam, em fração da área.
 */
export function encaixeNaArea(larguraArte, alturaArte, area, ajuste = AJUSTE_INICIAL) {
  const escala = (area.largura / larguraArte) * ajuste.zoom;
  return {
    escala,
    x: area.x + (area.largura - larguraArte * escala) / 2 + ajuste.dx * area.largura,
    y: area.y + (area.altura - alturaArte * escala) / 2 + ajuste.dy * area.altura,
  };
}

/**
 * Desenha o recorte no destino (RGBA de `L × A`), só dentro da área, no
 * encaixe dado. A cor é misturada pesando o alfa (o vizinho transparente não
 * escurece a borda). `espelhar` vira o recorte de lado.
 */
export function desenharNaArea(destino, L, A, recorte, area, encaixe, espelhar = false) {
  const { rgba, largura: w, altura: h } = recorte;
  const x0 = Math.max(0, Math.floor(area.x)), y0 = Math.max(0, Math.floor(area.y));
  const x1 = Math.min(L, Math.ceil(area.x + area.largura)), y1 = Math.min(A, Math.ceil(area.y + area.altura));
  for (let y = y0; y < y1; y++) {
    const sy = (y + 0.5 - encaixe.y) / encaixe.escala - 0.5;
    if (sy < -0.5 || sy > h - 0.5) continue;
    const ya = Math.max(0, Math.min(h - 1, Math.floor(sy))), yb = Math.min(h - 1, ya + 1), fy = Math.max(0, Math.min(1, sy - ya));
    for (let x = x0; x < x1; x++) {
      let sx = (x + 0.5 - encaixe.x) / encaixe.escala - 0.5;
      if (sx < -0.5 || sx > w - 0.5) continue;
      if (espelhar) sx = w - 1 - sx;
      const xa = Math.max(0, Math.min(w - 1, Math.floor(sx))), xb = Math.min(w - 1, xa + 1), fx = Math.max(0, Math.min(1, sx - xa));
      const pesos = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const ids = [(ya * w + xa) * 4, (ya * w + xb) * 4, (yb * w + xa) * 4, (yb * w + xb) * 4];
      let a = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const pa = pesos[k] * rgba[ids[k] + 3];
        a += pa; r += pa * rgba[ids[k]]; g += pa * rgba[ids[k] + 1]; b += pa * rgba[ids[k] + 2];
      }
      const para = (y * L + x) * 4;
      if (a > 0) {
        destino[para] = Math.round(r / a); destino[para + 1] = Math.round(g / a); destino[para + 2] = Math.round(b / a);
      }
      destino[para + 3] = Math.round(a);
    }
  }
}

/** A fração do retângulo que vai ser inventada (alfa abaixo de 128). */
export function parteInventada(rgba) {
  let n = 0;
  const total = rgba.length / 4;
  for (let i = 0; i < total; i++) if (rgba[i * 4 + 3] < 128) n++;
  return total ? n / total : 0;
}

/** A frente ou as costas no retângulo: `{ rgba, largura, altura, inventado }`. */
export function montarPeca(recorte, tamanho, ajuste = AJUSTE_INICIAL) {
  const { largura: L, altura: A } = tamanho;
  const rgba = new Uint8ClampedArray(L * A * 4);
  const area = { x: 0, y: 0, largura: L, altura: A };
  desenharNaArea(rgba, L, A, recorte, area, encaixeNaArea(recorte.largura, recorte.altura, area, ajuste));
  return { rgba, largura: L, altura: A, inventado: parteInventada(rgba) };
}

/**
 * A manga: a vista da frente na metade da esquerda e a das costas, espelhada,
 * na da direita; a costura do meio vira buraco. Sem uma das vistas, a outra
 * entra nas duas metades (espelhada na segunda) e `aviso` diz qual faltou.
 * Sem nenhuma, `null`.
 */
export function montarManga(frente, costas, tamanho, ajuste = AJUSTE_INICIAL, nome = "manga") {
  if (!frente && !costas) return null;
  const { largura: L, altura: A } = tamanho;
  const rgba = new Uint8ClampedArray(L * A * 4);
  const meio = Math.round(L / 2);
  const esquerda = { x: 0, y: 0, largura: meio, altura: A };
  const direita = { x: meio, y: 0, largura: L - meio, altura: A };
  const daFrente = frente || costas, deTras = costas || frente;
  // A metade de trás é sempre espelhada: é a manga aberta, vista do mesmo lado.
  desenharNaArea(rgba, L, A, daFrente, esquerda, encaixeNaArea(daFrente.largura, daFrente.altura, esquerda, ajuste));
  desenharNaArea(rgba, L, A, deTras, direita, encaixeNaArea(deTras.largura, deTras.altura, direita, ajuste), true);
  const meia = Math.max(1, Math.round((L * COSTURA_DA_MANGA) / 2));
  for (let y = 0; y < A; y++) for (let x = Math.max(0, meio - meia); x < Math.min(L, meio + meia); x++) rgba[(y * L + x) * 4 + 3] = 0;
  const aviso = !costas ? `A ${nome} só tem a vista da frente: a metade de trás é a da frente, espelhada.`
    : !frente ? `A ${nome} só tem a vista das costas: a metade da frente é a das costas, espelhada.` : null;
  return { rgba, largura: L, altura: A, inventado: parteInventada(rgba), aviso };
}

const CELULA = 32;

/**
 * Tira a sombra do mockup. A luz de cada célula de 32 px é o que o branco
 * dela mostra (o percentil 90 dos pixels claros e pouco saturados); a célula
 * sem branco herda das vizinhas; o campo é suavizado e cada pixel é dividido
 * pela luz dele. Nunca escurece. Numa camisa sem branco (azul-marinho
 * inteira), não há luz a medir e nada muda: `clareou` é falso.
 *
 * Devolve `{ rgba, clareou }` — um recorte NOVO, com o alfa de antes.
 */
export function tirarSombra(recorte) {
  const { rgba, largura: w, altura: h } = recorte;
  const cx = Math.ceil(w / CELULA), cy = Math.ceil(h / CELULA);
  const brancos = Array.from({ length: cx * cy }, () => []);
  let opacos = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 128) continue;
      opacos++;
      const mx = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]), mn = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (mx >= 140 && mx - mn <= 0.12 * mx) brancos[Math.floor(y / CELULA) * cx + Math.floor(x / CELULA)].push(mx);
    }
  }
  const luz = new Float32Array(cx * cy);
  const tem = new Uint8Array(cx * cy);
  let comBranco = 0, brancosTotal = 0;
  for (let c = 0; c < cx * cy; c++) {
    const v = brancos[c];
    brancosTotal += v.length;
    if (v.length < 8) continue;
    v.sort((a, b) => a - b);
    luz[c] = v[Math.floor(v.length * 0.9)];
    tem[c] = 1;
    comBranco++;
  }
  const novo = { rgba: Uint8ClampedArray.from(rgba), largura: w, altura: h, x0: recorte.x0, y0: recorte.y0 };
  if (!opacos || brancosTotal < opacos * 0.05 || comBranco === 0) return { ...novo, clareou: false };

  // A célula sem branco herda a média das vizinhas, de fora para dentro.
  for (let volta = 0; volta < cx + cy; volta++) {
    let faltou = false;
    const herdou = [];
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        if (tem[y * cx + x]) continue;
        let s = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const vx = x + dx, vy = y + dy;
          if (vx < 0 || vy < 0 || vx >= cx || vy >= cy || !tem[vy * cx + vx]) continue;
          s += luz[vy * cx + vx]; n++;
        }
        if (n) herdou.push([y * cx + x, s / n]); else faltou = true;
      }
    }
    for (const [c, v] of herdou) { luz[c] = v; tem[c] = 1; }
    if (!faltou) break;
  }
  // Suaviza o campo (duas caixas 3 × 3): a luz muda devagar; o que muda depressa é a arte.
  for (let passada = 0; passada < 2; passada++) {
    const antes = Float32Array.from(luz);
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        let s = 0, n = 0;
        for (let vy = Math.max(0, y - 1); vy <= Math.min(cy - 1, y + 1); vy++) {
          for (let vx = Math.max(0, x - 1); vx <= Math.min(cx - 1, x + 1); vx++) { s += antes[vy * cx + vx]; n++; }
        }
        luz[y * cx + x] = s / n;
      }
    }
  }
  const saida = novo.rgba;
  for (let y = 0; y < h; y++) {
    const gy = Math.max(0, Math.min(cy - 1, (y + 0.5) / CELULA - 0.5));
    const y0 = Math.floor(gy), y1 = Math.min(cy - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (saida[i + 3] === 0) continue;
      const gx = Math.max(0, Math.min(cx - 1, (x + 0.5) / CELULA - 0.5));
      const x0 = Math.floor(gx), x1 = Math.min(cx - 1, x0 + 1), fx = gx - x0;
      const l = (luz[y0 * cx + x0] * (1 - fx) + luz[y0 * cx + x1] * fx) * (1 - fy)
        + (luz[y1 * cx + x0] * (1 - fx) + luz[y1 * cx + x1] * fx) * fy;
      const ganho = Math.max(1, Math.min(2.5, 255 / Math.max(60, l)));
      saida[i] = saida[i] * ganho; saida[i + 1] = saida[i + 1] * ganho; saida[i + 2] = saida[i + 2] * ganho;
    }
  }
  return { ...novo, clareou: true };
}
