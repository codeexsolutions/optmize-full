#!/usr/bin/env node
/**
 * A peça girada que volta da Reposição não pode sair achatada no PDF.
 *
 * O caso (2026-10-26, "XG CORRETO BANCADA"): a Reposição guardava a medida da
 * peça já girada e não guardava o giro. Na volta, a manga de 36,5 × 69 cm
 * chegava como 69 × 36,5, com a arte de pé e giro nenhum — e o PDF esticava a
 * arte dentro da caixa deitada.
 *
 * Aqui se confere, com a conta de verdade de cada ponta:
 *   1. a medida deitada com a arte em pé vira giro de 90° (`giroPelaProporcao`),
 *      e o que não é claro (quase quadrado, proporção diferente) fica como está;
 *   2. com esse giro, o giro que vai para o PDF (`giroDaPosicao`) deita a arte,
 *      e a matriz do servidor a põe na caixa sem esticar.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { carregarModulo } from "./carregarModulo.mjs";

const require = createRequire(import.meta.url);
const { giroPelaProporcao, pecaSemGiro } = await carregarModulo("src/motores/encaixeMascara.js");

/*
 * O `exportarEncaixe.js` importa o pdf.js, que não roda fora do navegador e não
 * é usado pelo `giroDaPosicao`. Ele entra num módulo vazio; o resto é o
 * arquivo de verdade.
 */
async function carregarSemPdfjs(relativo) {
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const saida = await build({
    entryPoints: [path.join(raiz, relativo)],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "sem-pdfjs",
      setup(b) {
        b.onResolve({ filter: /^pdfjs-dist/ }, (args) => ({ path: args.path, namespace: "vazio" }));
        b.onLoad({ filter: /.*/, namespace: "vazio" }, () => ({ contents: "export const GlobalWorkerOptions = {}; export function getDocument() {}; export default {};" }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(saida.outputFiles[0].text).toString("base64")}`);
}
const { giroDaPosicao } = await carregarSemPdfjs("src/motores/exportarEncaixe.js");

// 1. A proporção ----------------------------------------------------------------
// A manga do PDF: arte 4313 × 8153 px, medida guardada 69,03 × 36,52 cm.
assert.equal(giroPelaProporcao(69.03, 36.52, 4313, 8153), 90, "manga deitada com arte em pé");
assert.equal(giroPelaProporcao(36.52, 69.03, 4313, 8153), 0, "manga de pé com arte em pé");
// O letreiro "SANGUE": 1893 × 6980 px, medida deitada.
assert.equal(giroPelaProporcao(59.1, 16.03, 1893, 6980), 90, "letreiro deitado");
// Quase quadrada: trocar ou não dá na mesma, e não se mexe.
assert.equal(giroPelaProporcao(30, 29, 2900, 3000), 0, "quase quadrada");
// Proporção que não bate nem de pé nem deitada (arte recortada): não se mexe.
assert.equal(giroPelaProporcao(40, 20, 3000, 3000), 0, "proporção diferente");
assert.equal(giroPelaProporcao(0, 20, 3000, 3000), 0, "medida inválida");
console.log("  ok  medida deitada com a arte em pé vira giro de 90°");

// 2. Do giro à matriz do PDF -----------------------------------------------------
const { montarPdf } = require("../servidor/encaixe-pdf.js");
const { PassThrough } = require("node:stream");
const sharp = require("sharp");

// Uma arte em pé, 40 × 80 px, e a peça que volta da Reposição: medida deitada.
const arte = await sharp({ create: { width: 40, height: 80, channels: 3, background: "#0060ff" } }).png().toBuffer();
const peca = { largura: 80, altura: 40, rotacaoBase: giroPelaProporcao(80, 40, 40, 80) };
assert.equal(pecaSemGiro(peca).largura, 40, "a silhueta é lida com a medida de pé");

const giro = giroDaPosicao({ rot: 0, item: peca });
assert.ok(giro === 90 || giro === 270, `a peça deitada vai com giro de lado, e foi ${giro}`);

const destino = new PassThrough();
const partes = [];
destino.on("data", (c) => partes.push(c));
const fim = new Promise((pronto) => destino.on("end", pronto));
await montarPdf({
  larguraTecido: 100,
  consumo: 50,
  posicoes: [{ chave: "a", x: 0, y: 0, largura: 80, altura: 40, giro }],
  buffers: new Map([["a", arte]]),
}, destino);
await fim;

const { PDFDocument, PDFName } = require("pdf-lib");
const zlib = require("node:zlib");
const doc = await PDFDocument.load(Buffer.concat(partes));
const pagina = doc.getPage(0);
const conteudo = pagina.node.Contents();
const fluxos = conteudo.asArray ? conteudo.asArray().map((r) => doc.context.lookup(r)) : [conteudo];
const texto = fluxos.map((f) => {
  const cru = Buffer.from(f.contents);
  return f.dict.get(PDFName.of("Filter")) ? zlib.inflateSync(cru).toString("latin1") : cru.toString("latin1");
}).join("\n");
const achado = /([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm\s*\/\S+ Do/.exec(texto);
assert.ok(achado, "a arte não foi desenhada");
const [a, b, c, d] = achado.slice(1, 5).map(Number);
// Girada de lado, a matriz não tem nada na diagonal: a e d zerados, b e c com
// as medidas da caixa trocadas — a arte de 40 × 80 deitada numa caixa de 80 × 40.
assert.ok(Math.abs(a) < 1e-6 && Math.abs(d) < 1e-6, `a arte saiu sem girar: ${achado[0]}`);
console.log("  ok  a peça girada que volta da Reposição sai deitada no PDF, sem esticar");
