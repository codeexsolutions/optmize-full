/*
 * BANCADA — a LaMa de verdade (fora da CI: precisa de `npm run modelos`)
 *
 *     npm run bancada:pecas-rede
 *
 * Um degradê conhecido, de 1600 × 1200, com uma faixa vazia em cima (a faixa
 * que sobra quando a arte cobre a largura) e um furo no meio (o decote). A
 * LaMa tem de continuar o degradê sem costura: o erro no buraco e o salto na
 * borda dele ficam abaixo dos limites medidos em 2026-10-07, e o tempo é
 * impresso para comparar com a medição (≈ 2,2 s por ladrilho, 13 s para abrir).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pre = require("../servidor/extrator-preencher.js");

const motivo = pre.porqueNaoPreenche();
if (motivo) {
  console.log(`PULADA — ${motivo}`);
  process.exit(0);
}

const w = 1600, h = 1200;
const esperado = (x, y) => [Math.round((x / (w - 1)) * 255), Math.round((y / (h - 1)) * 255), 128];
const vazio = (x, y) => y < 200 || (x >= 700 && x < 900 && y >= 500 && y < 700);
const rgba = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, [r, g, b] = esperado(x, y);
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = vazio(x, y) ? 0 : 255;
  }
}

const inicio = Date.now();
let ladrilhos = 0;
const r = await pre.preencher(rgba, w, h, { aoAndar: (f) => { ladrilhos = f; } });
const ms = Date.now() - inicio;

/** O erro médio e o pior, contra o degradê esperado, numa região do buraco. */
function erroEm(dentro) {
  let soma = 0, n = 0, pior = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dentro(x, y)) continue;
      const i = (y * w + x) * 3, e = esperado(x, y);
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(r.rgb[i + k] - e[k]);
        soma += d; n++; pior = Math.max(pior, d);
      }
    }
  }
  return { medio: soma / n, pior };
}
// O furo do meio tem arte dos quatro lados: a LaMa interpola, e o degradê tem de fechar.
const furo = erroEm((x, y) => x >= 700 && x < 900 && y >= 500 && y < 700);
// A faixa de cima só tem arte embaixo: a LaMa continua a textura, e não a tendência do
// degradê (o verde, que sobe com o y, fica perto do da borda). O que se cobra ali é a
// costura: o salto entre a última linha inventada (199) e a primeira da foto (200),
// comparado com o salto natural do degradê entre duas linhas (≈ 0,2).
const faixa = erroEm((x, y) => y < 200);
let salto = 0;
for (let x = 0; x < w; x++) {
  for (let k = 0; k < 3; k++) salto += Math.abs(r.rgb[(199 * w + x) * 3 + k] - r.rgb[(200 * w + x) * 3 + k]);
}
salto /= w * 3;

console.log(`LaMa: ${ladrilhos} ladrilhos em ${(ms / 1000).toFixed(1)} s; furo do meio: erro médio ${furo.medio.toFixed(2)} `
  + `(pior ${furo.pior}); faixa: erro médio ${faixa.medio.toFixed(2)}, salto na borda ${salto.toFixed(2)}`);
assert.ok(furo.medio < 8, `o furo do meio não fechou o degradê: erro médio ${furo.medio.toFixed(2)}`);
assert.ok(salto < 6, `há costura na borda da faixa: salto de ${salto.toFixed(2)}`);
console.log("OK — a LaMa continua o degradê sem costura.");
