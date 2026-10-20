/**
 * Confere o PDF do encaixe contra o que a produção viu sair errado
 * (2026-10-19): cor mudando, arte perdendo qualidade, vetor virando pixel.
 *
 *   1. arte em Display P3 sai convertida para sRGB, e não com os números crus
 *   2. o giro de 90/180/270 é feito no servidor, pixel por pixel, alfa junto
 *   3. o JPEG comum continua indo direto, sem recompressão
 *   4. o PDF de arte entra como VETOR (nenhuma imagem no arquivo), em todos os
 *      giros e com o /Rotate da página respeitado — conferido desenhando o
 *      PDF de saída e olhando onde a tinta caiu
 *
 * Roda com `node bancada/conferir-cor-e-vetor.mjs`.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { PDFDocument, PDFRawStream, PDFName, cmyk, rgb } = require("pdf-lib");
const { montarPdf, PT_POR_CM } = require("../servidor/encaixe-pdf.js");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

async function gerar(posicoes, buffers, giros, larguraTecido = 40, consumo = 30) {
  const destino = new PassThrough();
  const pedacos = [];
  destino.on("data", (c) => pedacos.push(c));
  const fim = new Promise((pronto) => destino.on("end", pronto));
  await montarPdf({ larguraTecido, consumo, posicoes, buffers, giros }, destino);
  await fim;
  return Buffer.concat(pedacos);
}

/** As imagens do PDF de saída: dicionário e bytes do fluxo. */
async function imagensDo(pdf) {
  const doc = await PDFDocument.load(pdf);
  const imagens = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    imagens.push({ dict: obj.dict, bytes: Buffer.from(obj.contents), obj });
  }
  return { doc, imagens };
}

const filtro = (img) => img.dict.get(PDFName.of("Filter"))?.toString();
const cru = (img) => (filtro(img) === "/FlateDecode" ? zlib.inflateSync(img.bytes) : img.bytes);

// ---------------------------------------------------------------- 1. P3 -> sRGB
{
  const p3 = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#8a2be2" } })
    .withIccProfile("p3").png().toBuffer();
  const crus = await sharp(p3).keepIccProfile().raw().toBuffer();
  assert.notDeepEqual([...crus.subarray(0, 3)], [138, 43, 226], "a arte de teste tinha que estar em P3");

  const pdf = await gerar([{ chave: "a", x: 1, y: 1, largura: 5, altura: 5 }], new Map([["a", p3]]));
  const { imagens } = await imagensDo(pdf);
  assert.equal(imagens.length, 1);
  const px = cru(imagens[0]);
  const [r, g, b] = px;
  assert.ok(Math.abs(r - 138) <= 2 && Math.abs(g - 43) <= 2 && Math.abs(b - 226) <= 2,
    `o roxo P3 tinha que chegar como #8a2be2 em sRGB, chegou ${r},${g},${b}`);
  console.log(`  ok  arte P3 sai em sRGB (${r},${g},${b}), e não com os números crus (${[...crus.subarray(0, 3)]})`);
}

// ---------------------------------------------------- 2. giro no servidor, sem perda
{
  const L = 37, A = 23;
  const rgba = Buffer.alloc(L * A * 4);
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
    const i = (y * L + x) * 4;
    rgba[i] = (x * 7) % 256; rgba[i + 1] = (y * 11) % 256; rgba[i + 2] = (x * y) % 256;
    rgba[i + 3] = x < 3 ? 0 : (x * 9 + y) % 256 || 1;
  }
  const png = await sharp(rgba, { raw: { width: L, height: A, channels: 4 } }).png().toBuffer();
  for (const giro of [0, 90, 180, 270]) {
    const pdf = await gerar([{ chave: "g", x: 1, y: 1, largura: 5, altura: 5 }],
      new Map([["g", png]]), new Map([["g", giro]]));
    const { doc, imagens } = await imagensDo(pdf);
    const cor = imagens.find((i) => i.dict.get(PDFName.of("SMask")));
    assert.ok(cor, `giro ${giro}: a arte transparente tinha que levar a máscara`);
    const mascara = doc.context.lookup(cor.dict.get(PDFName.of("SMask")));
    const esperadoCor = await sharp(png).rotate(giro).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const esperadoAlfa = await sharp(png).rotate(giro).extractChannel(3).raw().toBuffer();
    assert.equal(cor.dict.get(PDFName.of("Width")).asNumber(), esperadoCor.info.width, `giro ${giro}: largura`);
    assert.deepEqual(cru(cor), esperadoCor.data, `giro ${giro}: cada pixel de cor`);
    assert.deepEqual(zlib.inflateSync(Buffer.from(mascara.contents)), esperadoAlfa, `giro ${giro}: cada pixel do alfa`);
  }
  console.log("  ok  giros 0/90/180/270 feitos no servidor, cor e alfa idênticos pixel a pixel");
}

// ----------------------------------------------------------- 3. JPEG direto
{
  const jpg = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#336699" } })
    .jpeg({ quality: 90 }).toBuffer();
  const pdf = await gerar([{ chave: "j", x: 1, y: 1, largura: 5, altura: 3 }], new Map([["j", jpg]]));
  const { imagens } = await imagensDo(pdf);
  assert.equal(filtro(imagens[0]), "/DCTDecode");
  assert.deepEqual(imagens[0].bytes, jpg, "o JPEG tinha que ir byte a byte");
  console.log("  ok  JPEG comum vai direto, sem recompressão");
}

// ----------------------------------------------------------------- 4. vetor
/** Página 200 x 100 pt com o quarto de cima à esquerda em vermelho CMYK. */
async function pdfDeArte(rotacao = 0) {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([200, 100]);
  pagina.drawRectangle({ x: 0, y: 50, width: 100, height: 50, color: cmyk(0, 1, 1, 0) });
  pagina.drawRectangle({ x: 100, y: 0, width: 100, height: 50, color: rgb(1, 1, 1), opacity: 0 });
  if (rotacao) pagina.setRotation({ type: "degrees", angle: rotacao });
  return Buffer.from(await doc.save());
}

/** Desenha a página 1 do PDF e devolve uma função que diz se (x, y) em cm tem tinta. */
async function desenhar(pdf, escala = 4) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise;
  const pagina = await doc.getPage(1);
  const vista = pagina.getViewport({ scale: escala });
  const { createCanvas } = require("@napi-rs/canvas");
  const canvas = createCanvas(Math.ceil(vista.width), Math.ceil(vista.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport: vista, canvas }).promise;
  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return (xCm, yCm) => {
    const x = Math.round(xCm * PT_POR_CM * escala);
    const y = Math.round(yCm * PT_POR_CM * escala);
    const i = (y * canvas.width + x) * 4;
    return dados[i] > 150 && dados[i + 1] < 100 && dados[i + 2] < 100; // vermelho
  };
}

const W = 200 / PT_POR_CM; // 7,06 cm
const H = 100 / PT_POR_CM; // 3,53 cm
const X0 = 5, Y0 = 4;
// Onde o vermelho (o quarto de cima à esquerda) tem de cair, no rolo, por giro total.
const quadrante = {
  0: [[0.25, 0.25]], // em frações da caixa da peça: [fx, fy]
  90: [[0.75, 0.25]],
  180: [[0.75, 0.75]],
  270: [[0.25, 0.75]],
};
const vazio = { 0: [0.75, 0.75], 90: [0.25, 0.75], 180: [0.25, 0.25], 270: [0.75, 0.25] };

for (const rotacaoDaPagina of [0, 90]) {
  const arte = await pdfDeArte(rotacaoDaPagina);
  for (const giro of [0, 90, 180, 270]) {
    const total = (rotacaoDaPagina + giro) % 360;
    // A medida da peça é a da página como ela é VISTA (com /Rotate), girada pelo encaixe.
    const vistaDeitada = rotacaoDaPagina === 90;
    const [pl, pa] = vistaDeitada ? [H, W] : [W, H];
    const [largura, altura] = giro === 90 || giro === 270 ? [pa, pl] : [pl, pa];
    const pdf = await gerar([{ chave: "v", x: X0, y: Y0, largura, altura }],
      new Map([["v", arte]]), new Map([["v", giro]]));

    const { imagens } = await imagensDo(pdf);
    assert.equal(imagens.length, 0, `vetor (página ${rotacaoDaPagina}°, giro ${giro}°): não pode virar imagem`);
    assert.match(pdf.toString("latin1"), /\/Subtype \/Form/, "a arte tinha que entrar como Form XObject");

    const tinta = await desenhar(pdf);
    for (const [fx, fy] of quadrante[total]) {
      assert.ok(tinta(X0 + fx * largura, Y0 + fy * altura),
        `página ${rotacaoDaPagina}°, giro ${giro}°: o vermelho tinha que cair em (${fx}, ${fy}) da peça`);
    }
    const [vx, vy] = vazio[total];
    assert.ok(!tinta(X0 + vx * largura, Y0 + vy * altura),
      `página ${rotacaoDaPagina}°, giro ${giro}°: o canto oposto tinha que estar sem tinta`);
    assert.ok(!tinta(X0 - 0.2, Y0 + 0.2) && !tinta(X0 + largura + 0.2, Y0 + altura - 0.2),
      `página ${rotacaoDaPagina}°, giro ${giro}°: nada pode vazar da caixa da peça`);
  }
}
const versao = (await gerar([{ chave: "v", x: 1, y: 1, largura: W, altura: H }],
  new Map([["v", await pdfDeArte()]]))).subarray(0, 8).toString();
assert.ok(versao >= "%PDF-1.4", `com vetor o PDF tinha que ser 1.4 ou mais (saiu ${versao})`);
console.log("  ok  PDF de arte entra como vetor, no lugar e no giro certos, com o /Rotate da página");

console.log("\nOK — cor em sRGB, giro sem perda, JPEG direto e vetor como vetor.");
