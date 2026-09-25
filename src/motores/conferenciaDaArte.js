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

/** O lado do pixel da conferência, em cm. */
export const CONFERENCIA_PASSO_CM = 0.05;
/** A partir de quanto alfa o pixel é tinta. */
export const ALFA_TINTA = 8;
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
  const R = Math.ceil(folga / passo);
  let menor2 = Infinity;
  let onde = null;
  if (R > 0) {
    const tinta = (alfa, x, y) => x >= 0 && y >= 0 && x < W && y < H && alfa[y * W + x] >= ALFA_TINTA;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (alfaA[y * W + x] < ALFA_TINTA) continue;
        if (tinta(alfaA, x - 1, y) && tinta(alfaA, x + 1, y) && tinta(alfaA, x, y - 1) && tinta(alfaA, x, y + 1)) continue;
        for (let dy = -R; dy <= R; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -R; dx <= R; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 >= menor2) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= W || alfaB[yy * W + xx] < ALFA_TINTA) continue;
            menor2 = d2;
            onde = { px: x, py: y };
          }
        }
      }
    }
  }
  return {
    sobreposto,
    menor: menor2 === Infinity ? Infinity : Math.sqrt(menor2) * passo,
    onde,
  };
}

/** A folga medida (de centro a centro de pixel) é curta mesmo no pior caso? */
export function folgaCurta(menor, passo, folga) {
  return menor + passo * Math.SQRT2 < folga - 1e-9;
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

  for (const par of pares) {
    if (deveParar()) return { ok: false, parado: true, sobrepostos, curtos, pares: pares.length, menorFolga, ms: Date.now() - inicio };
    const passo = passoDaRegiao(par.regiao);
    const W = Math.max(1, Math.ceil((par.regiao.x1 - par.regiao.x0) / passo));
    const H = Math.max(1, Math.ceil((par.regiao.y1 - par.regiao.y0) / passo));
    if (!canvas || canvas.width < W || canvas.height < H) {
      canvas = novoCanvas(Math.max(W, canvas ? canvas.width : 0), Math.max(H, canvas ? canvas.height : 0));
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    const pa = posicoes[par.a];
    const pb = posicoes[par.b];
    const alfaA = alfaDaPeca(ctx, pa, par.regiao, passo, W, H);
    const alfaB = alfaDaPeca(ctx, pb, par.regiao, passo, W, H);
    const res = compararAlfas(alfaA, alfaB, W, H, passo, folga);
    const ponto = (q) => ({ x: par.regiao.x0 + (q.px + 0.5) * passo, y: par.regiao.y0 + (q.py + 0.5) * passo });

    if (res.sobreposto) sobrepostos.push({ a: par.a, b: par.b, ...ponto(res.sobreposto) });
    if (res.menor < menorFolga) menorFolga = res.menor;
    if (!res.sobreposto && res.onde && folgaCurta(res.menor, passo, folga)) {
      curtos.push({ a: par.a, b: par.b, folga: res.menor, ...ponto(res.onde) });
    }

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
