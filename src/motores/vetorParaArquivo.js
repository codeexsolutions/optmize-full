/**
 * ===========================================================================
 * O VETOR VIRA ARQUIVO — o EPS a partir das camadas do vetor.js
 * ===========================================================================
 *
 * O SVG o `vetor.js` já escreve. O EPS é o que o Corel e o Illustrator mais
 * antigos abrem sem perguntar, e é PostScript: moveto, lineto, curveto e
 * closepath — e nada de ARCO elíptico, que o SVG tem e o vetor usa para
 * desenhar círculo e elipse (ver `acharFormaRedonda`). Então o arco é trocado
 * por curvas de Bézier, pelas contas do apêndice F.6 da norma do SVG, em
 * pedaços de até um quarto de volta. Conferido no `bancada:extrator`
 * desenhando os dois caminhos pelo sharp: dão o mesmo pixel.
 *
 * Cada camada é uma cor, preenchida em `eofill` — o `fill-rule="evenodd"` do
 * SVG, que é o que deixa o miolo da letra vazado.
 *
 * Sem medida, o EPS sai a 96 pontos por polegada (0,75 pt por pixel), o mesmo
 * tamanho com que o SVG em pixels abre; com `larguraCm`, na medida.
 */

const NUMERO = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const TAMANHO = { M: 2, L: 2, C: 6, A: 7, Z: 0 };

/** Os comandos do caminho `d` do vetor.js: M, L, C, A e Z, absolutos. Um M com pares a mais vira L, como no SVG. */
export function comandosDoCaminho(d) {
  const comandos = [];
  for (const parte of d.match(/[MLCAZ][^MLCAZ]*/g) || []) {
    const letra = parte[0];
    const tamanho = TAMANHO[letra];
    if (tamanho === 0) {
      comandos.push({ letra, nums: [] });
      continue;
    }
    const nums = (parte.slice(1).match(NUMERO) || []).map(Number);
    for (let i = 0; i + tamanho <= nums.length; i += tamanho) {
      comandos.push({ letra: letra === "M" && i > 0 ? "L" : letra, nums: nums.slice(i, i + tamanho) });
    }
  }
  return comandos;
}

/** O arco do SVG (de x1,y1 a x2,y2) como curvas cúbicas: `[c1x, c1y, c2x, c2y, x, y]` cada. */
export function arcoParaCurvas(x1, y1, rx, ry, graus, grande, sentido, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const fi = (graus * Math.PI) / 180;
  const cos = Math.cos(fi), sen = Math.sin(fi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xl = cos * dx + sen * dy, yl = -sen * dx + cos * dy;
  // Raio pequeno demais para ligar os dois pontos: a norma manda crescer na proporção.
  const lambda = (xl * xl) / (rx * rx) + (yl * yl) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }
  const num = rx * rx * ry * ry - rx * rx * yl * yl - ry * ry * xl * xl;
  const den = rx * rx * yl * yl + ry * ry * xl * xl;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (grande === sentido) coef = -coef;
  const cxl = (coef * rx * yl) / ry, cyl = (-coef * ry * xl) / rx;
  const cx = cos * cxl - sen * cyl + (x1 + x2) / 2;
  const cy = sen * cxl + cos * cyl + (y1 + y2) / 2;
  const angulo = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angulo(1, 0, (xl - cxl) / rx, (yl - cyl) / ry);
  let dt = angulo((xl - cxl) / rx, (yl - cyl) / ry, (-xl - cxl) / rx, (-yl - cyl) / ry);
  if (!sentido && dt > 0) dt -= 2 * Math.PI;
  else if (sentido && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const passo = dt / n;
  const k = (4 / 3) * Math.tan(passo / 4);
  const ponto = (t) => ({
    x: cx + rx * cos * Math.cos(t) - ry * sen * Math.sin(t),
    y: cy + rx * sen * Math.cos(t) + ry * cos * Math.sin(t),
  });
  const derivada = (t) => ({
    x: -rx * cos * Math.sin(t) - ry * sen * Math.cos(t),
    y: -rx * sen * Math.sin(t) + ry * cos * Math.cos(t),
  });
  const curvas = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * passo, b = a + passo;
    const pa = ponto(a), pb = ponto(b), da = derivada(a), db = derivada(b);
    const ultimo = i === n - 1;
    curvas.push([pa.x + k * da.x, pa.y + k * da.y, pb.x - k * db.x, pb.y - k * db.y, ultimo ? x2 : pb.x, ultimo ? y2 : pb.y]);
  }
  return curvas;
}

const fmt = (v) => String(Math.round(v * 1000) / 1000);

/** Percorre o caminho trocando cada arco por curvas, e entrega os comandos já sem arco. */
function percorrer(d, aoComando) {
  let atual = { x: 0, y: 0 }, inicio = { x: 0, y: 0 };
  for (const { letra, nums } of comandosDoCaminho(d)) {
    if (letra === "M") {
      atual = inicio = { x: nums[0], y: nums[1] };
      aoComando("M", nums);
    } else if (letra === "L") {
      atual = { x: nums[0], y: nums[1] };
      aoComando("L", nums);
    } else if (letra === "C") {
      atual = { x: nums[4], y: nums[5] };
      aoComando("C", nums);
    } else if (letra === "A") {
      for (const c of arcoParaCurvas(atual.x, atual.y, nums[0], nums[1], nums[2], nums[3] !== 0, nums[4] !== 0, nums[5], nums[6])) aoComando("C", c);
      atual = { x: nums[5], y: nums[6] };
    } else {
      aoComando("Z", []);
      atual = inicio;
    }
  }
}

/** O mesmo caminho, com os arcos trocados por curvas: o que o EPS desenha, em SVG (a bancada confere por ele). */
export function caminhoSemArcos(d) {
  const partes = [];
  percorrer(d, (letra, nums) => partes.push(letra === "Z" ? "Z" : `${letra}${nums.map(fmt).join(" ")}`));
  return partes.join("");
}

const rgbDe = (cor) => {
  const n = parseInt(cor.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * O EPS das camadas do vetor.js.
 *
 * @param {{ cor: string, d: string }[]} camadas
 * @param {number} largura
 * @param {number} altura
 * @param {{ larguraCm?: number | null }} [opcoes]
 */
export function epsDasCamadas(camadas, largura, altura, { larguraCm = null } = {}) {
  const pt = larguraCm ? (larguraCm * 72) / 2.54 / largura : 0.75;
  const W = largura * pt, H = altura * pt;
  const linhas = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    "%%Creator: Optmize Extrator",
    `%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}`,
    `%%HiResBoundingBox: 0 0 ${fmt(W)} ${fmt(H)}`,
    "%%LanguageLevel: 2",
    "%%EndComments",
    "gsave",
    // O SVG tem y para baixo e o PostScript para cima: a página vira de ponta-cabeça uma vez, aqui.
    `0 ${fmt(H)} translate ${fmt(pt)} ${fmt(-pt)} scale`,
  ];
  const OPERADOR = { M: "moveto", L: "lineto", C: "curveto" };
  for (const camada of camadas) {
    const [r, g, b] = rgbDe(camada.cor);
    linhas.push(`${fmt(r / 255)} ${fmt(g / 255)} ${fmt(b / 255)} setrgbcolor newpath`);
    percorrer(camada.d, (letra, nums) => linhas.push(letra === "Z" ? "closepath" : `${nums.map(fmt).join(" ")} ${OPERADOR[letra]}`));
    linhas.push("eofill");
  }
  linhas.push("grestore", "showpage", "%%EOF", "");
  return linhas.join("\n");
}
