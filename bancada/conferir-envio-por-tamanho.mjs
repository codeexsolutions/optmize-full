/*
 * BANCADA — o envio de vários tamanhos ao Encaixe
 *
 *     npm run bancada:envio
 *
 * Roda no CI. A janela Arte e encaixe manda uma grade estampa × tamanho de
 * peças prontas, célula por célula. As contas moram em
 * `src/telas/moldes/envioPorTamanho.ts`: o que vai, em que ordem, com que
 * quantidade — e o que fica para tentar de novo quando o envio cai no meio.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const e = await carregarModulo("src/telas/moldes/envioPorTamanho.ts");

const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
const peca = (tamanho, papel, quantidade, espelhar = false) => ({
  tamanho, papel, nome: "", quantidade, largura: 10, altura: 20, contorno: quadrado, furos: [], origem: null,
  marcacoes: espelhar ? { espelhar: true } : null,
});
// Um pijama: frente 1 e manga 2 (par espelhado) por peça pronta, em P e M. A grade declara G, sem desenho.
const pecas = [peca("P", "frente", 1), peca("P", "manga", 2, true), peca("M", "frente", 1), peca("M", "manga", 2, true)];
const grade = [
  { nome: "G", cor: "#000000", ordem: 2, base: false },
  { nome: "P", cor: "#000000", ordem: 0, base: false },
  { nome: "M", cor: "#000000", ordem: 1, base: true },
];

// 1. As colunas: pela ordem da grade; a sem desenho vem marcada; sem grade, os tamanhos das peças.
assert.deepEqual(e.colunasDaGrade({ pecas, tamanhos: grade }), [
  { nome: "P", semDesenho: false }, { nome: "M", semDesenho: false }, { nome: "G", semDesenho: true },
]);
assert.deepEqual(e.colunasDaGrade({ pecas, tamanhos: [] }).map((c) => c.nome), ["P", "M"]);
// Molde vindo de servidor antigo, sem grade: `tamanhos` nem existe.
assert.deepEqual(e.colunasDaGrade({ pecas, tamanhos: undefined }).map((c) => c.nome), ["P", "M"]);
// Peça num tamanho que a grade não declara (grade antiga): a coluna aparece no fim, senão a peça sumia do envio.
assert.deepEqual(
  e.colunasDaGrade({ pecas: [...pecas, peca("GG", "frente", 1)], tamanhos: grade }).map((c) => c.nome),
  ["P", "M", "G", "GG"],
);

// 2. Número estranho vira inteiro ≥ 0.
assert.deepEqual([-3, 2.7, "abc", "", null, undefined, "4"].map(e.inteiro), [0, 2, 0, 0, 0, 0, 4]);
assert.deepEqual(e.mudarQuantidade({}, "sem", "P", "2,5"), { sem: { P: 0 } }, "vírgula não é número: fica 0");
assert.deepEqual(e.mudarQuantidade({ sem: { M: 3 } }, "sem", "P", 2.9), { sem: { M: 3, P: 2 } });

// 3. As peças de uma célula: prontas × cortes, a espelhada separada.
{
  const r = e.pecasDaCelula(pecas, "M", 10);
  assert.deepEqual(r.map((x) => [x.peca.nome || x.peca.papel, x.conta, x.quantidade, x.mexida]), [
    ["frente", 10, 10, false], ["manga", 10, 10, false], ["manga (espelhada)", 10, 10, false],
  ]);
}

// 4. A mexida fica quando as prontas mudam; a não mexida acompanha; "voltar à conta" tira a mexida.
{
  let m = e.mexer({}, e.chaveDaCelula("sem", "M"), 0, 0);
  m = e.mexer(m, e.chaveDaCelula("sem", "M"), 1, 7);
  const r = e.pecasDaCelula(pecas, "M", 3, m[e.chaveDaCelula("sem", "M")]);
  assert.deepEqual(r.map((x) => [x.quantidade, x.mexida]), [[0, true], [7, true], [3, false]]);
  const volta = e.mexer(m, e.chaveDaCelula("sem", "M"), 1, null);
  assert.deepEqual(e.pecasDaCelula(pecas, "M", 3, volta[e.chaveDaCelula("sem", "M")]).map((x) => x.quantidade), [0, 3, 3]);
}

// 5. O que vai, em ordem (linha por linha, tamanho por tamanho): célula 0 não vai, peça 0 não vai,
//    tamanho sem desenho não vai, e a célula com todas as peças em 0 também não.
{
  const colunas = e.colunasDaGrade({ pecas, tamanhos: grade });
  const linhas = [e.linhaDaEstampa(3), e.LINHA_SEM_ESTAMPA];
  let q = e.mudarQuantidade({}, "e:3", "P", 2);
  q = e.mudarQuantidade(q, "e:3", "M", 1);
  q = e.mudarQuantidade(q, "e:3", "G", 5);
  q = e.mudarQuantidade(q, "sem", "M", 4);
  q = e.mudarQuantidade(q, "sem", "P", 1);
  let m = e.mexer({}, "e:3|M", 0, 0);
  for (const i of [0, 1, 2]) m = e.mexer(m, "sem|P", i, 0);
  const c = e.celulasParaMandar(linhas, colunas, pecas, q, m);
  assert.deepEqual(c.map((x) => [x.linha, x.tamanho, x.prontas]), [["e:3", "P", 2], ["e:3", "M", 1], ["sem", "M", 4]]);
  assert.deepEqual(c[0].pecas.map((p) => p.quantidade), [2, 2, 2]);
  assert.deepEqual(c[1].pecas.map((p) => p.nome || p.papel), ["manga", "manga (espelhada)"], "a frente zerada não vai");
  assert.deepEqual(e.resumo(c), { prontas: 7, pecas: 6 + 2 + 12 });
  // Linha que não está na lista (a "nova" que sumiu) não vai, mesmo com número.
  assert.equal(e.celulasParaMandar([e.LINHA_SEM_ESTAMPA], colunas, pecas, e.mudarQuantidade({}, "nova", "P", 9), {}).length, 0);
}

// 6. Depois da falha: as mandadas zeram, as outras ficam.
assert.deepEqual(
  e.depoisDaFalha({ "e:3": { P: 2, M: 1 }, sem: { M: 4 } }, [{ linha: "e:3", tamanho: "P" }]),
  { "e:3": { P: 0, M: 1 }, sem: { M: 4 } },
);

// 7. Salvar a estampa nova leva os números e as mexidas para a linha dela; trocar de estampa tira a nova.
{
  const q = { nova: { P: 2 }, sem: { M: 1 } };
  const m = { "nova|P": { 0: 5 }, "sem|M": { 1: 0 } };
  assert.deepEqual(e.levarLinha(q, m, "nova", "e:9"), {
    quantidades: { sem: { M: 1 }, "e:9": { P: 2 } },
    mexidas: { "sem|M": { 1: 0 }, "e:9|P": { 0: 5 } },
  });
  assert.deepEqual(e.tirarLinha(q, m, "nova"), { quantidades: { sem: { M: 1 } }, mexidas: { "sem|M": { 1: 0 } } });
  assert.deepEqual(e.celulaDaChave("e:9|P"), { linha: "e:9", tamanho: "P" });
}

// ---------------------------------------------------------------- com React
const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");
const require = createRequire(path.join(raiz, "package.json"));
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLCanvasElement", "Node", "Element", "Event", "KeyboardEvent", "MutationObserver", "Image"]) {
  if (!(k in globalThis) || k === "window" || k === "document") globalThis[k] = k === "window" ? dom.window : dom.window[k];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// A prévia da arte desenha em canvas, e o jsdom não tem 2D: um contexto de mentira que aceita tudo.
const ctxFalso = new Proxy({}, {
  get: (alvo, k) => (k in alvo ? alvo[k] : () => ctxFalso),
  set: (alvo, k, v) => { alvo[k] = v; return true; },
});
dom.window.HTMLCanvasElement.prototype.getContext = () => ctxFalso;
dom.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
// Sem o provedor de alertas montado, o aviso cai no `window.alert`: os cenários leem daqui.
globalThis.alertas = [];
dom.window.alert = (texto) => { globalThis.alertas.push(String(texto)); };

const saida = path.join(os.tmpdir(), `optimize-cenarios-do-envio-${process.pid}.mjs`);
esbuild.buildSync({
  entryPoints: [path.join(aqui, "cenarios-do-envio.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: saida,
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: {
    "process.env.NODE_ENV": '"development"',
    "import.meta.env.BASE_URL": '"/"',
    __VERSAO__: JSON.stringify(require(path.join(raiz, "package.json")).version),
  },
  resolveExtensions: [".mjs", ".js", ".ts", ".tsx", ".jsx", ".json"],
  logLevel: "error",
});
try {
  const { rodar } = await import(pathToFileURL(saida).href);
  await rodar();
} finally {
  dom.window.close();
  fs.rmSync(saida, { force: true });
}
console.log("OK — as contas do envio de vários tamanhos conferem, e a grade e a janela também.");
// O agendador do React deixa portas de mensagem abertas no jsdom: sem sair à força, o processo não acaba
// (como em `conferir-editor-de-nos.mjs`). Uma falha acima já saiu com erro antes daqui.
process.exit(0);
