#!/usr/bin/env node
/**
 * ===========================================================================
 * A COR NÃO MUDA ENTRE A PEÇA COM FUNDO E A PEÇA SEM FUNDO (2026-10-28)
 * ===========================================================================
 *
 * A produção viu a mesma ribana sair em dois cianos: a peça sem remoção de
 * fundo ia inteira ao PDF e o servidor a convertia pelo perfil (ICC); a peça
 * COM fundo removido era desenhada no navegador, que decodifica CMYK ingênuo e
 * joga fora o perfil. Dois caminhos de cor, duas cores.
 *
 * A correção: a tela manda o RECORTE (o alfa) à parte, e a cor de TODA peça —
 * com ou sem fundo — sai do servidor, pelo mesmo caminho. Esta conferência
 * prova que, montando a MESMA arte das duas formas, a cor do miolo sai IGUAL, e
 * que a peça com recorte leva um /SMask com o alfa certo.
 *
 * Com `OPTMIZE_PDF_CMYK=1`, confere o Nível 2: a arte sai em DeviceCMYK (o JPEG
 * sem recorte passa direto; o com recorte vai CMYK cru + SMask), e a cor CMYK
 * das duas bate.
 *
 *   node bancada/conferir-recorte-cor.cjs
 *   OPTMIZE_PDF_CMYK=1 node bancada/conferir-recorte-cor.cjs
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const stream = require("node:stream");
const zlib = require("node:zlib");
const sharp = require("sharp");
const { PDFDocument, PDFRawStream, PDFName } = require("pdf-lib");

const { montarPdf } = require("../servidor/encaixe-pdf");

const CMYK_LIGADO = process.env.OPTMIZE_PDF_CMYK === "1";
const PERFIL = ["C:/Windows/System32/spool/drivers/color/RSWOP.icm"]
  .find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || null;

const L = 16;
const A = 16;

/** Um JPEG CMYK (com perfil SWOP quando houver) de uma cor chapada. */
async function arteCmyk(rgb) {
  const cru = Buffer.alloc(L * A * 3);
  for (let i = 0; i < L * A; i++) { cru[i * 3] = rgb[0]; cru[i * 3 + 1] = rgb[1]; cru[i * 3 + 2] = rgb[2]; }
  let cano = sharp(cru, { raw: { width: L, height: A, channels: 3 } });
  cano = PERFIL ? cano.withMetadata({ icc: PERFIL, density: 150 }) : cano.withMetadata({ density: 150 });
  return cano.toColourspace("cmyk").jpeg({ quality: 100 }).toBuffer();
}

/** Um recorte: metade de cima opaca (255), metade de baixo furada (0). */
async function recorteMeioAMeio() {
  const px = Buffer.alloc(L * A);
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) px[y * L + x] = y < A / 2 ? 255 : 0;
  return sharp(px, { raw: { width: L, height: A, channels: 1 } }).png().toBuffer();
}

async function gerar(buffers, recortes) {
  const posicoes = [
    { chave: "cheia", x: 0, y: 0, largura: 4, altura: 4, giro: 0 },
    { chave: "recortada", x: 4, y: 0, largura: 4, altura: 4, giro: 0 },
  ];
  const destino = new stream.PassThrough();
  const pedacos = [];
  destino.on("data", (c) => pedacos.push(c));
  const fim = new Promise((ok, falhou) => { destino.on("end", ok); destino.on("error", falhou); });
  await montarPdf({
    larguraTecido: 8, consumo: 4, posicoes, buffers, recortes,
    podeTerTransparencia: recortes && recortes.size > 0,
  }, destino);
  await fim;
  return Buffer.concat(pedacos);
}

/** As imagens do PDF: dicionário, bytes do fluxo e os campos que importam. */
async function imagensDo(pdf) {
  const doc = await PDFDocument.load(pdf);
  const imagens = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    imagens.push({
      bytes: Buffer.from(obj.contents),
      cs: obj.dict.get(PDFName.of("ColorSpace"))?.toString(),
      filtro: obj.dict.get(PDFName.of("Filter"))?.toString(),
      temSMask: !!obj.dict.get(PDFName.of("SMask")),
      w: Number(obj.dict.get(PDFName.of("Width"))),
      h: Number(obj.dict.get(PDFName.of("Height"))),
    });
  }
  return imagens;
}

const canaisDe = (cs) => (cs === "/DeviceCMYK" ? 4 : cs === "/DeviceGray" ? 1 : 3);

/** A cor do meio de uma imagem embutida crua (Flate). */
function corCrua(img) {
  const px = zlib.inflateSync(img.bytes);
  const n = canaisDe(img.cs);
  const meio = (Math.floor(img.h / 4) * img.w + Math.floor(img.w / 2)) * n;
  return Array.from({ length: n }, (_, k) => px[meio + k]);
}

/** A cor do meio de um JPEG passado direto (DCTDecode), no espaço pedido. */
async function corDoJpeg(img, espaco) {
  const { data, info } = await sharp(img.bytes).toColourspace(espaco).removeAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const n = info.channels;
  const meio = (Math.floor(info.height / 4) * info.width + Math.floor(info.width / 2)) * n;
  return Array.from({ length: n }, (_, k) => data[meio + k]);
}

async function principal() {
  const falhas = [];
  const conferir = async (oque, corpo) => {
    try { await corpo(); console.log(`  ok   ${oque}`); }
    catch (e) { falhas.push(`${oque}: ${e.message}`); console.log(`  FALHOU  ${oque}\n        ${e.message}`); }
  };

  const CIANO = [40, 180, 170];
  const arte = await arteCmyk(CIANO);
  const recorte = await recorteMeioAMeio();
  const buffers = new Map([["cheia", arte], ["recortada", arte]]);
  const recortes = new Map([["recortada", recorte]]);

  console.log(CMYK_LIGADO ? "NÍVEL 2 (OPTMIZE_PDF_CMYK=1)\n" : "PADRÃO (DeviceRGB)\n");

  const imagens = await imagensDo(await gerar(buffers, recortes));
  const comSMask = imagens.find((i) => i.temSMask && i.cs !== "/DeviceGray");
  const semSMask = imagens.find((i) => !i.temSMask && i.cs !== "/DeviceGray");
  const smask = imagens.find((i) => i.cs === "/DeviceGray" && i.w === L);

  await conferir("a peça recortada tem /SMask e a cheia não", async () => {
    assert.ok(comSMask, "a peça recortada tinha que ter /SMask");
    assert.ok(semSMask, "a peça cheia tinha que estar sem /SMask");
  });

  await conferir("o /SMask carrega o recorte: topo opaco, base furada", async () => {
    assert.ok(smask, "não achei o /SMask cinza");
    const px = zlib.inflateSync(smask.bytes);
    const topo = px[Math.floor(A / 4) * L + Math.floor(L / 2)];
    const base = px[Math.floor((3 * A) / 4) * L + Math.floor(L / 2)];
    assert.ok(topo > 250, `o topo do recorte tinha que ser opaco (veio ${topo})`);
    assert.ok(base < 5, `a base do recorte tinha que ser furada (veio ${base})`);
  });

  await conferir("a arte sai no espaço de cor certo", async () => {
    const arteImgs = imagens.filter((i) => i.cs !== "/DeviceGray");
    assert.ok(arteImgs.length > 0, "nenhuma imagem de arte no PDF");
    for (const i of arteImgs) {
      assert.equal(i.cs, CMYK_LIGADO ? "/DeviceCMYK" : "/DeviceRGB",
        `a arte tinha que sair ${CMYK_LIGADO ? "CMYK" : "RGB"} e veio ${i.cs}`);
    }
  });

  await conferir("a cor do miolo é a MESMA com e sem recorte", async () => {
    // A peça cheia pode vir crua (Flate) ou direta (DCTDecode, no Nível 2).
    const espaco = CMYK_LIGADO ? "cmyk" : "srgb";
    const corCheia = semSMask.filtro === "/DCTDecode" ? await corDoJpeg(semSMask, espaco) : corCrua(semSMask);
    const corRecorte = comSMask.filtro === "/DCTDecode" ? await corDoJpeg(comSMask, espaco) : corCrua(comSMask);
    assert.equal(corCheia.length, corRecorte.length, "espaços de cor diferentes entre as peças");
    corCheia.forEach((c, k) => {
      const d = Math.abs(c - corRecorte[k]);
      assert.ok(d <= 2, `canal ${k}: cheia ${c} vs recorte ${corRecorte[k]} (${d} de distância, o teto é 2)`);
    });
  });

  console.log("");
  if (falhas.length) {
    console.error(`FALHOU — ${falhas.length}:`);
    falhas.forEach((f) => console.error(`  ${f}`));
    process.exitCode = 1;
    return;
  }
  console.log("OK — a cor é a mesma com e sem fundo, e o recorte vira /SMask.");
}

principal().catch((e) => { console.error(e); process.exitCode = 1; });
