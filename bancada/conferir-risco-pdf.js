#!/usr/bin/env node
// bancada/conferir-risco-pdf.js
/**
 * Confere o PDF do RISCO (Digitalizar/Montagem), não o do encaixe — esse é o
 * `conferir-pdf.js`.
 *
 * Duas coisas: o corpo antigo (só `nos`) continua valendo, e o corpo da
 * Montagem sai com a página do tamanho do CORTE. O tamanho da página é o que
 * faz o PDF servir de gabarito (ver o cabeçalho de `servidor/risco-pdf.js`).
 */
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const PDFDocument = require("pdfkit");
const { lerPecas, medir, desenharPdf } = require("../servidor/risco-pdf");

const PT_POR_CM = 72 / 2.54;
const no = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, retaDepois: true });
const quadrado = (lado) => [no(0, 0), no(lado, 0), no(lado, lado), no(0, lado)];

async function gerar(corpo) {
  const lido = lerPecas(corpo);
  assert.ok(!lido.erro, lido.erro);
  const { largura, altura } = medir(lido.pecas);
  const doc = new PDFDocument({ size: [largura * PT_POR_CM, altura * PT_POR_CM], margin: 0, compress: false });
  const saida = new PassThrough();
  const pedacos = [];
  saida.on("data", (c) => pedacos.push(c));
  const fim = new Promise((r) => saida.on("end", r));
  doc.pipe(saida);
  desenharPdf(doc, lido.pecas);
  doc.end();
  await fim;
  return { largura, altura, texto: Buffer.concat(pedacos).toString("latin1") };
}

/** Quantas páginas o PDF (sem compressão) realmente tem. */
function numeroDePaginas(texto) {
  return (texto.match(/\/MediaBox/g) || []).length;
}

(async () => {
  // 1. Corpo antigo.
  const antigo = await gerar({ pecas: [{ nos: quadrado(10), emX: 0, emY: 0 }] });
  assert.equal(antigo.largura, 10);

  // 2. Corpo da Montagem: corte 12, costura 10 dentro, pique, ponto, fio, texto.
  const novo = await gerar({
    pecas: [{
      emX: 0, emY: 0,
      corte: quadrado(12),
      costura: quadrado(10).map((n) => ({ ...n, x: n.x + 1, y: n.y + 1, entrada: { x: n.x + 1, y: n.y + 1 }, saida: { x: n.x + 1, y: n.y + 1 } })),
      piques: [{ de: { x: 6, y: 0 }, ate: { x: 6, y: 1.5 } }],
      pontos: [{ x: 4, y: 4 }],
      fio: { linha: [{ x: 6, y: 3 }, { x: 6, y: 9 }], setas: [[{ x: 5.5, y: 8 }, { x: 6, y: 9 }, { x: 6.5, y: 8 }]] },
      texto: { x: 6, y: 4, tamanho: 1, linhas: ["frente", "base · ×1"] },
    }],
  });
  assert.equal(novo.largura, 12);
  assert.equal(novo.altura, 12);
  const [, w, h] = novo.texto.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  assert.ok(Math.abs(Number(w) - 12 * PT_POR_CM) < 0.01, `MediaBox ${w}`);
  assert.ok(Math.abs(Number(h) - 12 * PT_POR_CM) < 0.01);

  assert.equal(numeroDePaginas(novo.texto), 1, "o corpo normal já deveria sair em 1 página");

  // 3. Peça sem corte nem nós: recusada com mensagem.
  assert.ok(lerPecas({ pecas: [{ emX: 0 }] }).erro);

  // 4. Etiqueta rente à borda de baixo: o pdfkit não pode "resolver sozinho"
  // abrindo uma segunda página — este PDF é gabarito, só pode ter uma.
  const naBorda = await gerar({
    pecas: [{
      emX: 0, emY: 0,
      corte: quadrado(10),
      texto: { x: 5, y: 9.7, tamanho: 1, linhas: ["frente", "base · ×1"] },
    }],
  });
  assert.equal(numeroDePaginas(naBorda.texto), 1, "etiqueta na borda não pode virar 2 páginas");

  // 5. Ponto e pique nulos são lixo, não a origem — têm que cair fora.
  const semLixo = lerPecas({
    pecas: [{ emX: 0, emY: 0, corte: quadrado(10), pontos: [null], piques: [null] }],
  });
  assert.ok(!semLixo.erro, semLixo.erro);
  assert.deepEqual(semLixo.pecas[0].pontos, []);
  assert.deepEqual(semLixo.pecas[0].piques, []);

  // 6. A linha em volta da peça (cm): a página cresce meia linha em cada borda, o desenho se
  //    desloca, e o corte sai com a grossura. Fora de 0–1 cm: o teto; texto ou negativo: sem linha.
  const comLinha = await gerar({ pecas: [{ emX: 0, emY: 0, corte: quadrado(10), linha: 0.4 }] });
  assert.ok(Math.abs(comLinha.largura - 10.4) < 1e-9, `largura ${comLinha.largura}`);
  assert.ok(Math.abs(comLinha.altura - 10.4) < 1e-9);
  const grossuras = [...comLinha.texto.matchAll(/([\d.]+) w\b/g)].map((x) => Number(x[1]));
  assert.ok(grossuras.some((w) => Math.abs(w - 0.4 * PT_POR_CM) < 0.01), `grossuras ${grossuras}`);
  const lida = lerPecas({ pecas: [{ emX: 0, emY: 0, corte: quadrado(10), linha: 0.4 }] });
  assert.deepEqual({ x: lida.pecas[0].corte[0].x, y: lida.pecas[0].corte[0].y }, { x: 0.2, y: 0.2 });
  assert.equal(lerPecas({ pecas: [{ corte: quadrado(10), linha: 5 }] }).pecas[0].linha, 1);
  for (const ruim of ["abc", -2, null]) assert.equal(lerPecas({ pecas: [{ corte: quadrado(10), linha: ruim }] }).pecas[0].linha, 0);
  const semLinha = await gerar({ pecas: [{ emX: 0, emY: 0, corte: quadrado(10) }] });
  assert.equal(semLinha.largura, 10, "sem linha, a página é a de sempre");
  console.log("OK — o PDF do risco sai no tamanho do corte, no corpo antigo e no da Montagem.");
})().catch((e) => { console.error(e); process.exit(1); });
