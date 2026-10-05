/*
 * BANCADA — o tamanho da arte é o do arquivo, ao centésimo de milímetro
 *
 *     npm run bancada:medida-do-arquivo
 *
 * Duas coisas mudavam a medida da arte no caminho até o tecido, e as duas
 * foram medidas antes de virar conserto (2026-10-05):
 *
 * - o dpi de um JPEG que só o grava no EXIF era ignorado, e a arte entrava
 *   com os 300 dpi supostos — uma arte de 150 dpi saía com metade do tamanho;
 * - a medida da peça era arredondada para 0,1 cm na entrada, e o PDF imprimia
 *   a arte nessa medida: até 0,5 mm a mais ou a menos, cada lado para um lado.
 *
 * Esta bancada confere a leitura do dpi (conta pura, sem tela). A medida que
 * chega ao PDF está na `bancada:tela`.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { carregarModulo } from "./carregarModulo.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

// `medidaDoArquivo` reexporta o padrão de `pecaNaGrade`, que monta um canvas
// ao carregar. Para a conta do dpi basta um canvas que não desenha nada.
globalThis.document ??= { createElement: () => ({ getContext: () => ({}) }) };
const { pixelsPorCmDoArquivo, PPCM_PADRAO } = await carregarModulo("src/motores/medidaDoArquivo.js");

let casos = 0;
const caso = async (nome, fn) => { await fn(); casos++; console.log(`  ok  ${nome}`); };
// Uma casa: o PNG guarda pixels por METRO, inteiro, e 150 dpi volta 150,012.
const dpiDe = (ppcm) => (ppcm == null ? null : Math.round(ppcm * 2.54 * 10) / 10);
const pixel = () => sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 80, b: 40 } } });

/*
 * O sharp não grava JFIF: o dpi dele vai SÓ no EXIF (`withMetadata`). Por
 * isso os blocos aqui são montados à mão — e por isso também o conserto
 * importa: arte que passou por um programa assim chegava sem dpi nenhum.
 */

/** Um JPEG sem nenhum dpi: o sharp, sem metadado, não grava JFIF nem EXIF. */
async function jpegSemDpi() {
  const b = Buffer.from(await pixel().jpeg().toBuffer());
  assert.ok(b.indexOf("JFIF") < 0 && b.indexOf("Exif") < 0, "o JPEG de base tinha que vir sem dpi");
  return b;
}

/** O bloco APP0 do JFIF. `unidade` 1 é dpi, 2 é pontos por cm, 0 é só proporção. */
function app0Jfif(densidade, unidade = 1) {
  const b = Buffer.alloc(18);
  b.writeUInt16BE(0xffe0, 0);
  b.writeUInt16BE(16, 2);
  b.write("JFIF", 4, "latin1");
  b[8] = 0;
  b[9] = 1;
  b[10] = 2;
  b[11] = unidade;
  b.writeUInt16BE(densidade, 12);
  b.writeUInt16BE(densidade, 14);
  return b;
}

/**
 * O bloco APP1 do EXIF, montado à mão: IFD0 com XResolution (RATIONAL) e
 * ResolutionUnit (SHORT). `ordem` "II" é little-endian (Windows, câmeras),
 * "MM" é big-endian (Mac, Photoshop antigo).
 */
function app1Exif({ dpi, unidade = 2, ordem = "II" }) {
  const le = ordem === "II";
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4 + 8);
  const u16 = (v, o) => (le ? tiff.writeUInt16LE(v, o) : tiff.writeUInt16BE(v, o));
  const u32 = (v, o) => (le ? tiff.writeUInt32LE(v, o) : tiff.writeUInt32BE(v, o));
  tiff.write(ordem, 0, "latin1");
  u16(42, 2);
  u32(8, 4);                                   // o IFD0 começa logo depois do cabeçalho
  u16(2, 8);                                   // duas entradas
  const racional = 8 + 2 + 2 * 12 + 4;         // onde mora o valor da XResolution
  u16(0x011a, 10); u16(5, 12); u32(1, 14); u32(racional, 18);     // XResolution
  u16(0x0128, 22); u16(3, 24); u32(1, 26); u16(unidade, 30);      // ResolutionUnit, valor no lugar
  u32(0, 34);                                  // sem próximo IFD
  u32(Math.round(dpi * 1000), racional); u32(1000, racional + 4);
  const assinatura = Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0]); // "Exif" e dois zeros
  const corpo = Buffer.concat([assinatura, tiff]);
  const cabeca = Buffer.from([0xff, 0xe1, 0, 0]);
  cabeca.writeUInt16BE(corpo.length + 2, 2);
  return Buffer.concat([cabeca, corpo]);
}

/** Põe os blocos logo depois do SOI, na ordem dada. */
const comBlocos = (jpeg, ...blocos) => Buffer.concat([jpeg.subarray(0, 2), ...blocos, jpeg.subarray(2)]);

await caso("PNG: o dpi do pHYs", async () => {
  const b = await pixel().withMetadata({ density: 150 }).png().toBuffer();
  assert.equal(dpiDe(pixelsPorCmDoArquivo(new Uint8Array(b))), 150);
});

await caso("JPEG: o dpi do JFIF", async () => {
  const b = comBlocos(await jpegSemDpi(), app0Jfif(300));
  assert.equal(dpiDe(pixelsPorCmDoArquivo(new Uint8Array(b))), 300);
});

await caso("JPEG sem dpi nenhum: null, e o Encaixe supõe o padrão", async () => {
  assert.equal(pixelsPorCmDoArquivo(new Uint8Array(await jpegSemDpi())), null);
  assert.equal(dpiDe(PPCM_PADRAO), 300);
});

await caso("JPEG do sharp (dpi só no EXIF, como ele grava): 150", async () => {
  const b = await pixel().withMetadata({ density: 150 }).jpeg().toBuffer();
  assert.equal(dpiDe(pixelsPorCmDoArquivo(new Uint8Array(b))), 150);
});

await caso("JPEG com o dpi só no EXIF (little-endian): 150, e não os 300 supostos", async () => {
  // O JFIF "só proporção" na frente é o caso comum: ele não pode encerrar a procura.
  const b = comBlocos(await jpegSemDpi(), app0Jfif(1, 0), app1Exif({ dpi: 150, ordem: "II" }));
  assert.equal(dpiDe(pixelsPorCmDoArquivo(new Uint8Array(b))), 150);
});

await caso("JPEG com o dpi só no EXIF (big-endian)", async () => {
  const b = comBlocos(await jpegSemDpi(), app1Exif({ dpi: 200, ordem: "MM" }));
  assert.equal(dpiDe(pixelsPorCmDoArquivo(new Uint8Array(b))), 200);
});

await caso("EXIF em pontos por centímetro", async () => {
  const b = comBlocos(await jpegSemDpi(), app1Exif({ dpi: 59.055, unidade: 3 }));
  assert.equal(Math.round(pixelsPorCmDoArquivo(new Uint8Array(b)) * 1000) / 1000, 59.055);
});

await caso("EXIF \"sem unidade\" não é medida", async () => {
  const b = comBlocos(await jpegSemDpi(), app1Exif({ dpi: 72, unidade: 1 }));
  assert.equal(pixelsPorCmDoArquivo(new Uint8Array(b)), null);
});

await caso("JFIF e EXIF juntos: vale o JFIF, como sempre valeu", async () => {
  const b = comBlocos(await jpegSemDpi(), app0Jfif(300), app1Exif({ dpi: 72 }));
  assert.equal(dpiDe(pixelsPorCmDoArquivo(new Uint8Array(b))), 300);
});

await caso("EXIF cortado no meio não quebra a leitura", async () => {
  const inteiro = comBlocos(await jpegSemDpi(), app1Exif({ dpi: 150 }));
  assert.equal(pixelsPorCmDoArquivo(new Uint8Array(inteiro.subarray(0, 30))), null);
});

/*
 * A MEDIDA NÃO É ARREDONDADA NA ENTRADA.
 *
 * O PDF imprime a arte na medida da peça. Arredondar para 0,1 cm na entrada
 * mudava o tamanho da arte no tecido; o que chega ao PDF é conferido de ponta
 * a ponta na `bancada:tela`. Aqui, cada porta por onde a medida entra.
 */
const fs = require("node:fs");
const path = require("node:path");
const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const ler = (relativo) => fs.readFileSync(path.join(RAIZ, relativo), "utf8");

await caso("o Encaixe guarda a medida exata da imagem, do PDF, do molde e da edição", async () => {
  const controlador = ler("src/producao/controlador.js");
  assert.ok(!/arredondar\(/.test(controlador), "o controlador voltou a arredondar uma medida");
  assert.match(controlador, /largura: cru\.pxOriginal\.largura \/ ppcm,/);
  assert.match(controlador, /largura: arte\.larguraCm,/);
  assert.match(controlador, /largura: molde\.largura,/);
  assert.match(controlador, /const proporcao = peca\.altura \/ peca\.largura;/);
});

await caso("a Galeria guarda a medida exata da arte do projeto", async () => {
  const editor = ler("src/telas/galeria/EditorDoProjeto.tsx");
  assert.match(editor, /largura: img\.naturalWidth \/ ppcm,/);
  assert.ok(!/naturalWidth \/ ppcm\) \* 10\) \/ 10/.test(editor), "a Galeria voltou a arredondar a medida");
});

console.log(`\nbancada:medida-do-arquivo — ${casos} casos ok`);
