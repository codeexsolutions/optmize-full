/**
 * ===========================================================================
 * A CONFERÊNCIA PELA ARTE — o encaixe olhado como ele vai ser impresso
 * ===========================================================================
 *
 * A trava de sempre (`encaixeSobreposicao.js`) confere as MÁSCARAS: a grade de
 * células que o próprio encaixe usou. Ela pega defeito de encaixe — índice
 * trocado, peça fora do lugar —, mas não pega defeito da MÁSCARA, porque
 * confere com ela: se a leitura da arte errou, o encaixe e a trava erram
 * juntos, e a trava responde "limpo".
 *
 * Aconteceu. Em 2026-09-25 a produção viu peça dentro de peça na tela do
 * Optmize, com a trava apagada. O caminho mais provável: arte opaca de fundo
 * branco cujo fundo NÃO saiu na carga (a remoção recusou, ou ainda não tinha
 * terminado) — a máscara enxergava o fundo claro e o ignorava, e o desenho e o
 * PDF o imprimiam por cima da peça vizinha. No mesmo dia, pelo contorno de
 * verdade, 4 mm pedidos davam 1,87 mm (ver "A FOLGA É ENTRE QUADRADOS", em
 * encaixeMascara.js).
 *
 * Então esta conferência não usa máscara nenhuma. Para cada par de peças
 * vizinhas, ela desenha a ARTE das duas com o mesmo `desenharArte` da tela e do
 * PDF — o mesmo giro, a mesma caixa, o mesmo recorte — numa grade fina e comum
 * às duas, e pergunta duas coisas:
 *
 *   sobreposição   algum ponto tem tinta das duas? (a soma dos alfas passa de
 *                  uma arte inteira e mais um quarto: borda antisserrilhada
 *                  encostando não conta, arte em cima de arte conta)
 *   folga          a menor distância entre as duas tintas é a pedida?
 *
 * Qualquer das duas trava a produção (ver `guardarResultado`, no controlador).
 *
 * ---------------------------------------------------------------------------
 * AS CONTAS
 * ---------------------------------------------------------------------------
 *
 * A grade é de `CONFERENCIA_PASSO_CM` (0,5 mm) e alinhada ao par, não à peça:
 * as duas artes são pintadas no MESMO canvas, uma de cada vez, então pixel de
 * uma e pixel da outra são o mesmo pedaço de tecido.
 *
 * Tinta é alfa de pelo menos `ALFA_TINTA`: pouco, de propósito. É o que a
 * impressora imprime — inclusive o fundo branco opaco de uma arte que não foi
 * recortada, que é branco mas COBRE o que estiver embaixo.
 *
 * A distância é de centro a centro de pixel com tinta. A tinta de verdade pode
 * estar em qualquer ponto do pixel, então a folga só é dada como curta quando
 * nem no pior caso ela chegaria à pedida: `distância + passo × √2 < folga`.
 * Errar aqui para o lado de travar à toa ensinaria a pessoa a ignorar a trava.
 *
 * A região de cada par é a interseção das duas caixas alargadas pela folga:
 * tinta de uma que fique a menos da folga da outra está, por construção, ali
 * dentro.
 */

import { desenharArte } from "./desenhoDoEncaixe";
import { ALFA_PECA } from "./encaixeMascara";

/** O lado do pixel da conferência, em cm. */
export const CONFERENCIA_PASSO_CM = 0.05;
/** A partir de quanto alfa o pixel é tinta: o mesmo da silhueta do encaixe. */
export const ALFA_TINTA = ALFA_PECA;
/** Soma de alfas acima da qual as duas artes estão no mesmo ponto. */
export const SOMA_SOBREPOSTA = 255 + 64;
/** Teto de pixels de uma região; acima dele o passo do par engrossa. */
const TETO_DE_PIXELS = 4000000;

// ==================== A PARTE PURA ====================

/**
 * Os pares de peças que precisam ser olhados: as caixas alargadas pela folga
 * se cruzam. Devolve `{ a, b, regiao }`, com a região em cm.
 */
export function paresVizinhos(posicoes, folga) {
  const caixas = posicoes.map((p) => ({
    x0: p.x, y0: p.y, x1: p.x + p.largura, y1: p.y + p.altura,
  }));
  // Varredura pelo topo: só cruza quem começa antes de o outro acabar.
  const ordem = caixas.map((_, i) => i).sort((i, j) => caixas[i].y0 - caixas[j].y0);
  const pares = [];
  for (let k = 0; k < ordem.length; k++) {
    const a = caixas[ordem[k]];
    for (let m = k + 1; m < ordem.length; m++) {
      const b = caixas[ordem[m]];
      if (b.y0 >= a.y1 + folga) break;
      if (b.x0 >= a.x1 + folga || a.x0 >= b.x1 + folga) continue;
      const regiao = {
        x0: Math.max(a.x0 - folga, b.x0 - folga),
        y0: Math.max(a.y0 - folga, b.y0 - folga),
        x1: Math.min(a.x1 + folga, b.x1 + folga),
        y1: Math.min(a.y1 + folga, b.y1 + folga),
      };
      if (regiao.x1 <= regiao.x0 || regiao.y1 <= regiao.y0) continue;
      pares.push({ a: ordem[k], b: ordem[m], regiao });
    }
  }
  return pares;
}

/** O passo do par: o da conferência, ou mais grosso se a região for enorme. */
export function passoDaRegiao(regiao) {
  const area = (regiao.x1 - regiao.x0) * (regiao.y1 - regiao.y0);
  const pelaArea = Math.sqrt(area / TETO_DE_PIXELS);
  return Math.max(CONFERENCIA_PASSO_CM, pelaArea);
}

/**
 * Compara os alfas de duas artes pintadas na mesma grade (`W` x `H`, `passo`
 * cm por pixel). Devolve o primeiro ponto sobreposto (em pixels) e a menor
 * distância entre as tintas, em cm — `Infinity` se não há tinta das duas a
 * menos da folga.
 */
export function compararAlfas(alfaA, alfaB, W, H, passo, folga) {
  let sobreposto = null;
  for (let i = 0; i < W * H; i++) {
    if (alfaA[i] + alfaB[i] > SOMA_SOBREPOSTA) {
      sobreposto = { px: i % W, py: (i / W) | 0 };
      break;
    }
  }

  // A menor distância: da borda da tinta de A até qualquer tinta de B no disco
  // da folga. Só a BORDA de A interessa — o miolo está mais longe que ela.
  //
  // Antes cada pixel de borda varria o quadrado inteiro da folga atrás de
  // tinta de B: com arte cheia de furinhos (quase todo pixel é borda) e 1 cm
  // de folga, perto de 1 s por par, sem a tela respirar. Agora a conta só
  // acontece onde ela pode dar alguma coisa (ver `menorDistancia`).
  const R = Math.ceil(folga / passo);
  const perto = R > 0 ? menorDistancia(alfaA, alfaB, W, H, R) : { menor2: Infinity, onde: null };
  return {
    sobreposto,
    menor: perto.menor2 === Infinity ? Infinity : Math.sqrt(perto.menor2) * passo,
    onde: perto.onde,
  };
}

/**
 * A menor distância ao quadrado, em pixels, de um pixel de BORDA da tinta de A
 * até a tinta de B — só as que cabem no disco de raio `R`; fora dele,
 * `Infinity`. `onde` é o primeiro pixel de A (na ordem das linhas) que a dá.
 *
 * Exata, e sem olhar a região inteira de perto:
 *
 *   1. `g` é a distância na VERTICAL até a tinta de B, coluna por coluna — duas
 *      varreduras em inteiro, de cima para baixo e de baixo para cima, andando
 *      na memória em ordem. Passou de R, vale R + 1: dali não sai nada.
 *   2. Na linha, a distância de verdade até a tinta de B na coluna `x + dx` é
 *      `dx² + g²`; a menor delas, com `|dx| ≤ R`, é a menor até B no disco.
 *   3. Essa janela só é aberta onde há algum `g ≤ R` a menos de R colunas —
 *      uma soma acumulada por linha responde isso de uma vez. Peças que se
 *      encaixam têm caixas quase inteiras em comum, mas a tinta de uma só
 *      chega perto da outra numa faixa estreita: é só ali que se faz conta.
 */
function menorDistancia(alfaA, alfaB, W, H, R) {
  const teto = R + 1;
  const g = new Int32Array(W * H);
  for (let x = 0; x < W; x++) g[x] = alfaB[x] >= ALFA_TINTA ? 0 : teto;
  for (let i = W; i < W * H; i++) {
    if (alfaB[i] >= ALFA_TINTA) g[i] = 0;
    else { const acima = g[i - W] + 1; g[i] = acima < teto ? acima : teto; }
  }
  for (let i = W * (H - 1) - 1; i >= 0; i--) {
    const abaixo = g[i + W] + 1;
    if (abaixo < g[i]) g[i] = abaixo;
  }

  const limite = R * R;
  const acumulado = new Int32Array(W + 1);
  let menor2 = Infinity;
  let onde = null;
  const tintaA = (x, y) => x >= 0 && y >= 0 && x < W && y < H && alfaA[y * W + x] >= ALFA_TINTA;
  for (let y = 0; y < H; y++) {
    const i0 = y * W;
    for (let x = 0; x < W; x++) acumulado[x + 1] = acumulado[x] + (g[i0 + x] <= R ? 1 : 0);
    if (acumulado[W] === 0) continue;
    for (let x = 0; x < W; x++) {
      if (alfaA[i0 + x] < ALFA_TINTA) continue;
      const x0 = x - R < 0 ? 0 : x - R;
      const x1 = x + R >= W ? W - 1 : x + R;
      if (acumulado[x1 + 1] === acumulado[x0]) continue;
      if (tintaA(x - 1, y) && tintaA(x + 1, y) && tintaA(x, y - 1) && tintaA(x, y + 1)) continue;
      let melhor = Infinity;
      for (let xx = x0; xx <= x1; xx++) {
        const gy = g[i0 + xx];
        if (gy > R) continue;
        const d2 = (xx - x) * (xx - x) + gy * gy;
        if (d2 < melhor) melhor = d2;
      }
      if (melhor <= limite && melhor < menor2) {
        menor2 = melhor;
        onde = { px: x, py: y };
      }
    }
  }
  return { menor2, onde };
}

/** A folga medida (de centro a centro de pixel) é curta mesmo no pior caso? */
export function folgaCurta(menor, passo, folga) {
  return menor + passo * Math.SQRT2 < folga - 1e-9;
}

/**
 * A janela de um par, recortada da imagem de UMA peça.
 *
 * `imagem` é `{ ix0, iy0, W, H, alfa }`: o alfa da peça numa grade fixa do
 * rolo, com o pixel (0, 0) na célula `(ix0, iy0)`. A janela começa na célula
 * `(jx0, jy0)` e tem `Wj` x `Hj`; o que dela cai fora da peça fica sem tinta —
 * e é isso mesmo, porque a arte é recortada pela caixa da peça ao ser pintada.
 */
export function janelaDaImagem(imagem, jx0, jy0, Wj, Hj) {
  const saida = new Uint8Array(Wj * Hj);
  const x0 = Math.max(jx0, imagem.ix0);
  const x1 = Math.min(jx0 + Wj, imagem.ix0 + imagem.W);
  if (x1 <= x0) return saida;
  const y0 = Math.max(jy0, imagem.iy0);
  const y1 = Math.min(jy0 + Hj, imagem.iy0 + imagem.H);
  for (let y = y0; y < y1; y++) {
    const de = (y - imagem.iy0) * imagem.W + (x0 - imagem.ix0);
    saida.set(imagem.alfa.subarray(de, de + (x1 - x0)), (y - jy0) * Wj + (x0 - jx0));
  }
  return saida;
}

// ==================== O DESENHO ====================

function novoCanvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** O alfa de UMA peça na grade da região: o mesmo desenho da tela e do PDF. */
function alfaDaPeca(ctx, p, regiao, passo, W, H) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(1 / passo, 0, 0, 1 / passo, -regiao.x0 / passo, -regiao.y0 / passo);
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y, p.largura, p.altura);
  ctx.clip();
  if (p.item && p.item.img) {
    desenharArte(ctx, p, p.x, p.y, p.largura, p.altura);
  } else {
    // Sem arte para olhar, a peça vale a caixa inteira: é o que garante que a
    // conferência nunca responde "limpo" sobre o que não viu.
    ctx.fillStyle = "#000";
    ctx.fillRect(p.x, p.y, p.largura, p.altura);
  }
  ctx.restore();
  const dados = ctx.getImageData(0, 0, W, H).data;
  const alfa = new Uint8Array(W * H);
  for (let i = 0, a = 3; i < alfa.length; i++, a += 4) alfa[i] = dados[a];
  return alfa;
}

const descrever = (p) => {
  const item = p.item || {};
  const nome = item.nome || `peça ${(item.indice ?? 0) + 1}`;
  return item.copia == null ? String(nome) : `${nome} #${item.copia}`;
};

const cm = (v) => `${v.toFixed(1).replace(".", ",")} cm`;

/**
 * Confere o encaixe `r` pela arte. Assíncrona: devolve o controle à tela a
 * cada punhado de pares, e para no meio se `deveParar()` responder `true`
 * (o risco foi trocado — conferir o velho não serve para nada).
 *
 * Devolve `{ ok, parado, sobrepostos, curtos, pares, menorFolga, ms }`.
 * `sobrepostos` e `curtos` trazem `{ a, b, x, y }` (índices das posições e o
 * ponto em cm), e `curtos` também `folga`, a medida.
 */
export async function conferirEncaixePelaArte(r, { folga = 0, deveParar = () => false } = {}) {
  const inicio = Date.now();
  const posicoes = r.posicoes || [];
  const pares = paresVizinhos(posicoes, folga);
  const sobrepostos = [];
  const curtos = [];
  let menorFolga = Infinity;
  let canvas = null;
  let ctx = null;
  let ultimaPausa = Date.now();

  const pincel = (W, H) => {
    if (!canvas || canvas.width < W || canvas.height < H) {
      canvas = novoCanvas(Math.max(W, canvas ? canvas.width : 0), Math.max(H, canvas ? canvas.height : 0));
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    return ctx;
  };

  /*
   * CADA PEÇA É PINTADA UMA VEZ SÓ.
   *
   * Pintar por par repetia a mesma peça em cada vizinha que ela tem — doze
   * posições viravam 76 pinturas e 71 milhões de pixels lidos de volta do
   * canvas, que era o grosso da conferência. Agora a peça é pintada uma vez,
   * numa grade fixa do rolo (célula (0, 0) no canto do rolo, lado
   * `CONFERENCIA_PASSO_CM`), e a janela de cada par é recortada dali: duas
   * peças na mesma grade continuam tendo pixel com pixel no mesmo pedaço de
   * tecido. A imagem sai da memória depois do último par da peça.
   *
   * Peça grande demais para a grade fina, e par cuja região passa do teto,
   * continuam pintados por par, no passo mais grosso de `passoDaRegiao`.
   */
  const base = CONFERENCIA_PASSO_CM;
  const imagens = new Map();
  const ultimoPar = new Map();
  pares.forEach((par, k) => { ultimoPar.set(par.a, k); ultimoPar.set(par.b, k); });
  const celulas = (p) => ({
    ix0: Math.floor(p.x / base + 1e-9),
    iy0: Math.floor(p.y / base + 1e-9),
    ix1: Math.ceil((p.x + p.largura) / base - 1e-9),
    iy1: Math.ceil((p.y + p.altura) / base - 1e-9),
  });
  const cabeNaGradeFina = (i) => {
    const c = celulas(posicoes[i]);
    return (c.ix1 - c.ix0) * (c.iy1 - c.iy0) <= TETO_DE_PIXELS;
  };
  const imagemDaPeca = (i) => {
    let imagem = imagens.get(i);
    if (imagem) return imagem;
    const c = celulas(posicoes[i]);
    const W = Math.max(1, c.ix1 - c.ix0);
    const H = Math.max(1, c.iy1 - c.iy0);
    const alfa = alfaDaPeca(pincel(W, H), posicoes[i], { x0: c.ix0 * base, y0: c.iy0 * base }, base, W, H);
    imagem = { ix0: c.ix0, iy0: c.iy0, W, H, alfa };
    imagens.set(i, imagem);
    return imagem;
  };

  for (let k = 0; k < pares.length; k++) {
    const par = pares[k];
    if (deveParar()) return { ok: false, parado: true, sobrepostos, curtos, pares: pares.length, menorFolga, ms: Date.now() - inicio };
    const pa = posicoes[par.a];
    const pb = posicoes[par.b];
    const passo = passoDaRegiao(par.regiao);
    let x0;
    let y0;
    let W;
    let H;
    let alfaA;
    let alfaB;
    if (passo === base && cabeNaGradeFina(par.a) && cabeNaGradeFina(par.b)) {
      const jx0 = Math.floor(par.regiao.x0 / base + 1e-9);
      const jy0 = Math.floor(par.regiao.y0 / base + 1e-9);
      W = Math.max(1, Math.ceil(par.regiao.x1 / base - 1e-9) - jx0);
      H = Math.max(1, Math.ceil(par.regiao.y1 / base - 1e-9) - jy0);
      x0 = jx0 * base;
      y0 = jy0 * base;
      alfaA = janelaDaImagem(imagemDaPeca(par.a), jx0, jy0, W, H);
      alfaB = janelaDaImagem(imagemDaPeca(par.b), jx0, jy0, W, H);
    } else {
      x0 = par.regiao.x0;
      y0 = par.regiao.y0;
      W = Math.max(1, Math.ceil((par.regiao.x1 - par.regiao.x0) / passo));
      H = Math.max(1, Math.ceil((par.regiao.y1 - par.regiao.y0) / passo));
      alfaA = alfaDaPeca(pincel(W, H), pa, par.regiao, passo, W, H);
      alfaB = alfaDaPeca(pincel(W, H), pb, par.regiao, passo, W, H);
    }
    const res = compararAlfas(alfaA, alfaB, W, H, passo, folga);
    const ponto = (q) => ({ x: x0 + (q.px + 0.5) * passo, y: y0 + (q.py + 0.5) * passo });

    if (res.sobreposto) sobrepostos.push({ a: par.a, b: par.b, ...ponto(res.sobreposto) });
    if (res.menor < menorFolga) menorFolga = res.menor;
    if (!res.sobreposto && res.onde && folgaCurta(res.menor, passo, folga)) {
      curtos.push({ a: par.a, b: par.b, folga: res.menor, ...ponto(res.onde) });
    }
    if (ultimoPar.get(par.a) === k) imagens.delete(par.a);
    if (ultimoPar.get(par.b) === k) imagens.delete(par.b);

    // A tela não pode congelar durante a conferência de um lote grande.
    if (Date.now() - ultimaPausa > 40) {
      await new Promise((pronto) => setTimeout(pronto, 0));
      ultimaPausa = Date.now();
    }
  }

  return {
    ok: sobrepostos.length === 0 && curtos.length === 0,
    parado: false,
    sobrepostos,
    curtos,
    pares: pares.length,
    menorFolga,
    ms: Date.now() - inicio,
  };
}

/** O recado da tela para uma conferência que falhou — ou `null`, se passou. */
export function recadoDaConferencia(r, conferencia, folga) {
  if (!conferencia || conferencia.ok || conferencia.parado) return null;
  const posicoes = r.posicoes || [];
  const par = (c) => `${descrever(posicoes[c.a])} e ${descrever(posicoes[c.b])}`;
  if (conferencia.sobrepostos.length > 0) {
    const c = conferencia.sobrepostos[0];
    const mais = conferencia.sobrepostos.length - 1;
    return `A conferência pela arte achou peça em cima de peça: ${par(c)}, `
      + `a ${cm(c.x)} da borda e ${cm(c.y)} do começo`
      + (mais > 0 ? ` (e mais ${mais} par${mais > 1 ? "es" : ""})` : "")
      + ". O Exportar ficou travado.";
  }
  const c = conferencia.curtos[0];
  const mais = conferencia.curtos.length - 1;
  return `A conferência pela arte achou folga menor que a pedida: ${par(c)} ficaram a `
    + `${(c.folga * 10).toFixed(1).replace(".", ",")} mm (pedido ${(folga * 10).toFixed(1).replace(".", ",")} mm), `
    + `a ${cm(c.x)} da borda e ${cm(c.y)} do começo`
    + (mais > 0 ? ` (e mais ${mais} par${mais > 1 ? "es" : ""})` : "")
    + ". O Exportar ficou travado.";
}

/** Os índices das peças (linha da tabela) envolvidas numa conferência que falhou. */
export function pecasDaConferencia(r, conferencia) {
  const indices = new Set();
  if (!conferencia) return indices;
  const posicoes = r.posicoes || [];
  [...conferencia.sobrepostos, ...conferencia.curtos].forEach((c) => {
    [posicoes[c.a], posicoes[c.b]].forEach((p) => {
      if (p && p.item && p.item.indice != null) indices.add(p.item.indice);
    });
  });
  return indices;
}
