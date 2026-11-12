/*
 * BANCADA — os limites inferiores do consumo (src/motores/limitesInferiores.js)
 *
 *     node bancada/conferir-limites.mjs
 *
 * Contas feitas à mão em casos pequenos, e a propriedade que importa: nenhum
 * encaixe VÁLIDO da bancada gasta menos rolo que o limite.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const { limitesInferiores, distanciaAoLimite } = await carregarModulo("src/motores/limitesInferiores.js");

const quadrado = (lado, giro = "180") => ({ largura: lado, altura: lado, giro, mascaras: { areaReal: lado * lado } });

// 1. Quatro quadrados de 10 num rolo de 20, sem folga: área 400 / 20 = 20.
{
  const l = limitesInferiores([1, 2, 3, 4].map(() => quadrado(10)), 20, 0);
  assert.ok(Math.abs(l.area - 20) < 1e-9);
  assert.ok(Math.abs(l.bm - 20) < 1e-9, "sem folga o Brunn–Minkowski é a própria área");
  assert.equal(l.peca, 10);
  assert.ok(Math.abs(l.limite - 20) < 1e-9);
}

// 2. Com folga de 1 cm: 4·(10 + 0,5·√π)² / 21 − 1.
{
  const l = limitesInferiores([1, 2, 3, 4].map(() => quadrado(10)), 20, 1);
  const esperado = (4 * (10 + 0.5 * Math.sqrt(Math.PI)) ** 2) / 21 - 1;
  assert.ok(Math.abs(l.bm - esperado) < 1e-9, `${l.bm} ≠ ${esperado}`);
  assert.ok(l.limite >= l.area, "o limite é o maior dos três");
}

// 3. A maior peça: uma tira de 5 × 80 sem giro num rolo de 100 ocupa 80 de rolo.
{
  const tira = { largura: 5, altura: 80, giro: "fixa", mascaras: { areaReal: 400 } };
  assert.equal(limitesInferiores([tira], 100, 0).peca, 80);
  // Com giro livre ela pode deitar (80 cabe em 100) e ocupa só 5.
  assert.equal(limitesInferiores([{ ...tira, giro: "livre" }], 100, 0).peca, 5);
}

// 4. Sem área lida, não há limite provado.
assert.equal(limitesInferiores([{ largura: 1, altura: 1, giro: "180", mascaras: {} }], 10, 0), null);

// 5. A distância.
assert.ok(Math.abs(distanciaAoLimite(24, { limite: 20 }) - 0.2) < 1e-12);
assert.equal(distanciaAoLimite(24, null), null);

console.log("OK — limites inferiores conferidos");
