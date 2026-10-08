/*
 * O que as bancadas do Extrator dividem: a foto de trabalho (como a tela a
 * manda), o gabarito feito à mão e a conta que compara a máscara com ele.
 *
 * O gabarito de `foto.jpg` é `foto.json`, nas coordenadas da FOTO DE TRABALHO
 * (virada pelo EXIF, lado maior em 2048 — é o que `medir:recorte --grade`
 * desenha):
 *
 *   { "elementos": [ { "nome": "escudo", "clique": [x, y], "caixa": [x0, y0, x1, y1], "jeito": "chapado" } ] }
 *
 * `jeito` ("chapado" ou "foto") é opcional; quando vem, a bancada da rede
 * confere a sugestão do jeito contra ele.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

export const LADO_DE_TRABALHO = 2048;
export const PASTA_DAS_FOTOS = process.env.EXTRATOR_FOTOS || "D:/arte/extrator";

/** A foto como a tela a manda ao servidor: virada pelo EXIF, lado maior em até 2048, RGB. */
export async function fotoDeTrabalho(caminho) {
  const { data, info } = await sharp(caminho).rotate()
    .resize(LADO_DE_TRABALHO, LADO_DE_TRABALHO, { fit: "inside", withoutEnlargement: true })
    .removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, largura: info.width, altura: info.height };
}

/** As fotos da pasta que têm gabarito ao lado. Sem a pasta, nenhuma. */
export function lerGabaritos(pasta = PASTA_DAS_FOTOS) {
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta)
    .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
    .map((n) => ({ foto: path.join(pasta, n), gabarito: path.join(pasta, n.replace(/\.[^.]+$/, ".json")), nome: n }))
    .filter((f) => fs.existsSync(f.gabarito))
    .map((f) => ({ ...f, ...JSON.parse(fs.readFileSync(f.gabarito, "utf8")) }));
}

/**
 * A máscara contra a caixa do gabarito. `iou` é o quanto a caixa da máscara
 * bate com a do gabarito; `dentro` é a parte da máscara que caiu dentro da
 * caixa (o que vazou para fora é fundo pego junto).
 */
export function avaliarMascara(alfa, largura, altura, [gx0, gy0, gx1, gy1]) {
  let n = 0, dentro = 0, x0 = largura, y0 = altura, x1 = -1, y1 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (alfa[y * largura + x] < 128) continue;
      n++;
      if (x >= gx0 && x <= gx1 && y >= gy0 && y <= gy1) dentro++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (n === 0) return { iou: 0, dentro: 0, cobertura: 0 };
  const iw = Math.max(0, Math.min(x1, gx1) - Math.max(x0, gx0) + 1);
  const ih = Math.max(0, Math.min(y1, gy1) - Math.max(y0, gy0) + 1);
  const inter = iw * ih;
  const a = (x1 - x0 + 1) * (y1 - y0 + 1);
  const b = (gx1 - gx0 + 1) * (gy1 - gy0 + 1);
  return { iou: inter / (a + b - inter), dentro: dentro / n, cobertura: n / (largura * altura) };
}

/** A foto de mentira: um disco vermelho e um quadrado azul sobre bege, 1200 × 900. */
export async function fotoSintetica() {
  const largura = 1200, altura = 900;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">`
    + `<rect width="100%" height="100%" fill="#f4f1ea"/>`
    + `<circle cx="420" cy="450" r="170" fill="#c8102e"/>`
    + `<rect x="780" y="300" width="260" height="260" fill="#1f4fa3"/></svg>`;
  const { data } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    rgb: data, largura, altura,
    disco: { clique: [420, 450], caixa: [250, 280, 590, 620] },
    quadrado: { clique: [910, 430], caixa: [780, 300, 1039, 559] },
  };
}
