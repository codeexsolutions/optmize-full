/*
 * BANCADA — o leitor de PLT (`src/motores/moldes.js`)
 *
 *     npm run bancada:plt
 *
 * Roda na CI: só arquivos montados aqui. Os PLT reais da Audaces (com os
 * tamanhos do molde graduado) estão na `bancada:plt-graduado`, que é local.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

// `moldes.js` traz o pintor de máscara, que monta um canvas ao carregar.
globalThis.document ??= { createElement: () => ({ getContext: () => ({}) }) };
const m = await carregarModulo("src/motores/moldes.js");

let casos = 0;
const caso = (nome, fn) => { fn(); casos++; console.log(`  ok  ${nome}`); };

caso("o espaço depois do comando não vira um número a mais", () => {
  // A Audaces escreve "PD 1200,13951 1377,13965": o espaço depois do PD virava
  // um 0 na frente, e cada par de coordenadas escorregava uma casa — o x de um
  // ponto virava o y do outro, e o contorno não fechava.
  const c = m.comandosPLT("IN;PU1210,9496PD 1200,13951 1377,13965;");
  const pd = c.find((x) => x.nome === "PD");
  assert.deepEqual(pd.numeros, [1200, 13951, 1377, 13965]);
});

caso("vírgula e espaço separam números, e o sinal fica", () => {
  const c = m.comandosPLT("PA 10, -20 ,30 40;");
  assert.deepEqual(c.find((x) => x.nome === "PA").numeros, [10, -20, 30, 40]);
});

caso("um quadrado com espaço depois do PD fecha a volta", () => {
  const t = m.tracosDoPLT("IN;PU0,0PD 4000,0 4000,4000 0,4000 0,0;");
  assert.ok(!t.erro, t.erro);
  const [linha] = t.linhas;
  const ultimo = linha.pontos[linha.pontos.length - 1];
  assert.deepEqual([linha.pontos[0].x, linha.pontos[0].y], [ultimo.x, ultimo.y], "o traço volta ao começo");
  assert.equal(linha.pontos.length, 5);
});

console.log(`\nbancada:plt — ${casos} casos ok`);
