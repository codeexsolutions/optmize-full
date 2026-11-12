/*
 * ===========================================================================
 * DO LOGO À IMAGEM DO CLIENTE, E A NOTA DO VETOR
 * ===========================================================================
 *
 * `imagemDoCliente` rasteriza o SVG verdadeiro no tamanho sorteado e o estraga
 * (JPEG, borrado); `nota` compara um vetor com a verdade, do mesmo jeito da
 * bancada do vetorizador (`bancada/conferir-vetorizador.mjs`): os dois
 * rasterizados no mesmo tamanho, sobre branco, e cada pixel comparado em
 * OKLab — "certos" é a fração a menos de 0,08, "erro" a média da distância.
 */
import sharp from "sharp";

const paraLinear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LINEAR = new Float32Array(256).map((_, i) => paraLinear(i));

function oklab(r, g, b) {
  const R = LINEAR[r], G = LINEAR[g], B = LINEAR[b];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** RGBA cru de um SVG no tamanho pedido (`branco`: achatado sobre branco). */
export async function rasterizarSvg(svg, largura, altura, branco = false) {
  const m = /width="([\d.]+)"/.exec(svg);
  const larguraDoSvg = m ? Number(m[1]) : largura;
  let p = sharp(Buffer.from(svg), { density: Math.min(2400, 72 * (largura / larguraDoSvg) * 1.0001) })
    .resize(largura, altura, { fit: "fill" });
  if (branco) p = p.flatten({ background: "#ffffff" });
  const { data, info } = await p.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** A imagem que o cliente mandaria: o logo no tamanho do estrago, estragada. */
export async function imagemDoCliente(logo, estrago) {
  const escala = estrago.lado / Math.max(logo.largura, logo.altura);
  const w = Math.max(16, Math.round(logo.largura * escala));
  const h = Math.max(16, Math.round(logo.altura * escala));
  let img = await rasterizarSvg(logo.svg, w, h);
  const cru = (i) => sharp(Buffer.from(i.data.buffer, i.data.byteOffset, i.data.length), { raw: { width: i.width, height: i.height, channels: 4 } });
  const deVolta = async (p) => {
    const { data, info } = await p.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
  };
  if (estrago.jeito === "borrado") {
    const pw = Math.max(8, Math.round(w / estrago.reducao)), ph = Math.max(8, Math.round(h / estrago.reducao));
    const pequena = await deVolta(cru(img).resize(pw, ph, { fit: "fill" }));
    img = await deVolta(cru(pequena).resize(w, h, { fit: "fill", kernel: "linear" }));
  }
  if (estrago.jeito === "jpeg" || estrago.jeito === "borrado") {
    const jpg = await cru(img).flatten({ background: "#ffffff" }).jpeg({ quality: estrago.qualidade }).toBuffer();
    img = await deVolta(sharp(jpg));
  }
  return img;
}

/** A nota de um vetor (SVG) contra a verdade (RGBA já rasterizado no tamanho da nota). */
export async function nota(svgDoVetor, verdade) {
  const v = await rasterizarSvg(svgDoVetor, verdade.width, verdade.height, true);
  const a = v.data, b = verdade.data;
  let certos = 0, erro = 0;
  const n = verdade.width * verdade.height;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const [L1, a1, b1] = oklab(a[p], a[p + 1], a[p + 2]);
    const [L2, a2, b2] = oklab(b[p], b[p + 1], b[p + 2]);
    const d = Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
    erro += d;
    if (d < 0.08) certos++;
  }
  return { certos: certos / n, erro: erro / n };
}

/** O tamanho da nota: o dobro da imagem, no máximo 640 px no maior lado. */
export function tamanhoDaNota(largura, altura) {
  const k = Math.min(2, 640 / Math.max(largura, altura));
  return [Math.max(16, Math.round(largura * k)), Math.max(16, Math.round(altura * k))];
}
