/**
 * Confere o PDF do encaixe contra o que a produção viu sair errado
 * (2026-10-19): cor mudando, arte perdendo qualidade, vetor virando pixel.
 *
 *   1. arte em Display P3 sai convertida para sRGB, e não com os números crus
 *   2. o PDF de arte entra como VETOR (nenhuma imagem no arquivo), em todos os
 *      giros e com o /Rotate da página respeitado — conferido desenhando o
 *      PDF de saída e olhando onde a tinta caiu
 *   5. o giro é da página (2026-10-21): uma imagem só para os quatro giros,
 *      com os pixels do arquivo, e cada giro no lugar certo, desenhando
 *   6. a cor e o alfa de uma leitura só saem iguais aos da leitura dupla
 *   7. o Flate em pedaços é um fluxo único que descomprime exato
 *   8. o JPEG comum continua indo direto, sem recompressão, mesmo girado
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

// ----------------------------------------------------------------- 2. vetor
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

// ------------------------------------------ 5. giro na página, pixels intocados
/*
 * Desde 2026-10-21 o giro não toca nos pixels: a arte entra UMA vez, de pé, e
 * cada peça a desenha com o seu giro na matriz (ver "O GIRO É DA PÁGINA, NÃO
 * DOS PIXELS", em servidor/encaixe-pdf.js). Três coisas a conferir: uma
 * imagem só para os quatro giros, os pixels dela iguais aos do arquivo de pé,
 * e cada giro caindo no lugar certo — desenhando o PDF, como o vetor.
 */
{
  const L = 37, A = 23;
  const rgba = Buffer.alloc(L * A * 4);
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
    const i = (y * L + x) * 4;
    rgba[i] = (x * 7) % 256; rgba[i + 1] = (y * 11) % 256; rgba[i + 2] = (x * y) % 256;
    rgba[i + 3] = x < 3 ? 0 : (x * 9 + y) % 256 || 1;
  }
  const png = await sharp(rgba, { raw: { width: L, height: A, channels: 4 } }).png().toBuffer();
  const posicoes = [0, 90, 180, 270].map((giro, k) => ({
    chave: "g", giro, x: 1 + k * 7, y: 1, largura: giro % 180 ? 3 : 5, altura: giro % 180 ? 5 : 3,
  }));
  const { doc, imagens } = await imagensDo(await gerar(posicoes, new Map([["g", png]])));
  assert.equal(imagens.length, 2, "os quatro giros tinham de usar UMA imagem (cor + máscara), e não quatro");
  const cor = imagens.find((i) => i.dict.get(PDFName.of("SMask")));
  const mascara = doc.context.lookup(cor.dict.get(PDFName.of("SMask")));
  const esperadoCor = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const esperadoAlfa = await sharp(png).extractChannel(3).raw().toBuffer();
  assert.equal(cor.dict.get(PDFName.of("Width")).asNumber(), L, "a imagem entra de pé");
  assert.deepEqual(cru(cor), esperadoCor.data, "cada pixel de cor, como no arquivo");
  assert.deepEqual(zlib.inflateSync(Buffer.from(mascara.contents)), esperadoAlfa, "cada pixel do alfa, como no arquivo");
  console.log("  ok  quatro giros, uma imagem só, de pé, com cor e alfa idênticos ao arquivo");
}

/** Uma arte de 200 x 100 px com o quarto de cima à esquerda vermelho, e o resto branco. */
async function arteDeQuadrante(formato) {
  const quarto = Buffer.from('<svg width="100" height="50"><rect width="100" height="50" fill="#ff0000"/></svg>');
  const base = sharp({ create: { width: 200, height: 100, channels: 3, background: "#ffffff" } })
    .composite([{ input: quarto, left: 0, top: 0 }]);
  return formato === "jpeg" ? base.jpeg({ quality: 95 }).toBuffer() : base.png().toBuffer();
}
for (const [rotulo, formato] of [["PNG", "png"], ["JPEG", "jpeg"]]) {
  const arte = await arteDeQuadrante(formato);
  for (const giro of [0, 90, 180, 270]) {
    const [largura, altura] = giro % 180 ? [H, W] : [W, H];
    const tinta = await desenhar(await gerar([{ chave: "q", giro, x: X0, y: Y0, largura, altura }], new Map([["q", arte]])));
    for (const [fx, fy] of quadrante[giro]) {
      assert.ok(tinta(X0 + fx * largura, Y0 + fy * altura), `${rotulo} a ${giro}°: o vermelho tinha que cair em (${fx}, ${fy}) da peça`);
    }
    const [vx, vy] = vazio[giro];
    assert.ok(!tinta(X0 + vx * largura, Y0 + vy * altura), `${rotulo} a ${giro}°: o canto oposto tinha que estar sem tinta`);
  }
}
console.log("  ok  imagem PNG e JPEG nos giros 0/90/180/270, cada um no lugar certo, desenhando o PDF");

// --------------------------------------- 6. leitura única = leitura dupla
/*
 * A cor e o alfa saem de UMA leitura do arquivo onde isso dá os mesmos
 * números que as duas leituras de antes, e das duas onde não dá (ver a tabela
 * em `pixelsDaArte`). Aqui a conta de antes é refeita à mão, para cada tipo de
 * arquivo, e o PDF tem de bater com ela byte a byte.
 */
{
  const L = 41, A = 29;
  const ruido = (canais, bits = 8) => {
    const max = bits === 16 ? 65535 : 255;
    const arr = bits === 16 ? new Uint16Array(L * A * canais) : Buffer.alloc(L * A * canais);
    let s = 7;
    for (let i = 0; i < arr.length; i++) { s = (s * 1103515245 + 12345) >>> 0; arr[i] = s % (max + 1); }
    for (let p = 0; p < L * A; p++) if (p % 6 === 0) arr[p * canais + canais - 1] = 0;
    return bits === 16 ? Buffer.from(arr.buffer) : arr;
  };
  const cru8 = (canais) => ({ raw: { width: L, height: A, channels: canais } });
  const cru16 = (canais) => ({ raw: { width: L, height: A, channels: canais, depth: "ushort" } });
  const tipos = {
    "RGBA 8 bits": await sharp(ruido(4), cru8(4)).png().toBuffer(),
    "RGBA em P3": await sharp(ruido(4), cru8(4)).withIccProfile("p3").png().toBuffer(),
    "RGBA 16 bits": await sharp(ruido(4, 16), cru16(4)).toColourspace("rgb16").png({ bitdepth: 16 }).toBuffer(),
    "cinza com alfa": await sharp(ruido(2), cru8(2)).toColourspace("b-w").png().toBuffer(),
    "paleta com alfa": await sharp(ruido(4), cru8(4)).png({ palette: true, colours: 32 }).toBuffer(),
    "WebP com alfa": await sharp(ruido(4), cru8(4)).webp({ lossless: true }).toBuffer(),
    "PNG com EXIF 3": await sharp(ruido(4), cru8(4)).png().withMetadata({ orientation: 3 }).toBuffer(),
    "RGB sem alfa": await sharp(ruido(3), cru8(3)).png().toBuffer(),
  };
  for (const [nome, bytes] of Object.entries(tipos)) {
    const meta = await sharp(bytes).metadata();
    const cinza = meta.space === "b-w" || meta.space === "grey16";
    const abrir = () => sharp(bytes).autoOrient();
    const esperadoCor = await abrir().removeAlpha().toColourspace(cinza ? "b-w" : "srgb").raw({ depth: "uchar" }).toBuffer();
    const esperadoAlfa = meta.hasAlpha
      ? await abrir().extractChannel(meta.channels - 1).toColourspace("b-w").raw({ depth: "uchar" }).toBuffer() : null;
    const { doc, imagens } = await imagensDo(await gerar([{ chave: "t", x: 1, y: 1, largura: 4, altura: 3 }], new Map([["t", bytes]])));
    const mascaras = new Set(imagens.map((i) => i.dict.get(PDFName.of("SMask"))).filter(Boolean)
      .map((ref) => doc.context.lookup(ref)));
    const cor = imagens.find((i) => !mascaras.has(i.obj));
    assert.deepEqual(cru(cor), esperadoCor, `${nome}: a cor tinha que ser a da leitura de antes`);
    const sm = cor.dict.get(PDFName.of("SMask"));
    if (esperadoAlfa && esperadoAlfa.some((a) => a !== 255)) {
      assert.ok(sm, `${nome}: a transparência não pode sumir`);
      assert.deepEqual(zlib.inflateSync(Buffer.from(doc.context.lookup(sm).contents)), esperadoAlfa,
        `${nome}: o alfa tinha que ser o da leitura de antes`);
    } else {
      assert.ok(!sm, `${nome}: sem transparência, sem máscara`);
    }
  }
  console.log(`  ok  ${Object.keys(tipos).length} tipos de arquivo saem byte a byte como na leitura de antes`);
}

// ------------------------------------------- 7. Flate em pedaços, fluxo único
{
  const { comprimir } = require("../servidor/encaixe-pdf.js");
  const PEDACO = 4 * 1024 * 1024;
  for (const tamanho of [PEDACO - 1, PEDACO, PEDACO + 1, 3 * PEDACO + 777]) {
    const dados = Buffer.alloc(tamanho);
    let s = tamanho;
    for (let i = 0; i < tamanho; i++) { s = (s * 1103515245 + 12345) >>> 0; dados[i] = (i >> 12) % 3 ? s >>> 24 : 0; }
    // `inflateSync` confere a adler32 do fim: soma errada estoura aqui.
    assert.deepEqual(zlib.inflateSync(await comprimir(dados)), dados, `${tamanho} bytes: descomprime igual`);
  }
  // E uma arte de verdade acima de um pedaço, de ponta a ponta no PDF.
  const grande = await sharp({ create: { width: 1600, height: 1100, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 50 } } })
    .png().toBuffer();
  const pdf = await gerar([{ chave: "f", x: 1, y: 1, largura: 16, altura: 11 }], new Map([["f", grande]]));
  const { imagens } = await imagensDo(pdf);
  assert.deepEqual(cru(imagens[0]), await sharp(grande).raw().toBuffer(), "a arte grande descomprime pixel a pixel");
  await desenhar(pdf, 1);
  console.log("  ok  Flate em pedaços: um fluxo zlib só, que descomprime exato e o pdf.js lê");
}

// ----------------------------------------------- 8. JPEG direto, girado ou não
{
  const jpg = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#336699" } })
    .jpeg({ quality: 90 }).toBuffer();
  const posicoes = [0, 90].map((giro, k) => ({ chave: "j", giro, x: 1 + k * 6, y: 1, largura: giro ? 3 : 5, altura: giro ? 5 : 3 }));
  const { imagens } = await imagensDo(await gerar(posicoes, new Map([["j", jpg]])));
  assert.equal(imagens.length, 1, "o JPEG em dois giros entra uma vez");
  assert.equal(filtro(imagens[0]), "/DCTDecode");
  assert.deepEqual(imagens[0].bytes, jpg, "o JPEG tinha que ir byte a byte, girado ou não");
  console.log("  ok  JPEG comum vai direto, sem recompressão, mesmo girado");
}

console.log("\nOK — cor em sRGB, vetor como vetor, giro na página com os pixels do arquivo, JPEG direto e Flate em pedaços.");
