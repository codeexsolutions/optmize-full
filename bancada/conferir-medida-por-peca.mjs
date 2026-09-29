/*
 * BANCADA — a medida de cada peça no Digitalizar
 *
 *     npm run bancada:medida
 *
 * Roda no CI. A foto não tem escala: é a medida digitada que dá centímetro ao
 * risco. Cada peça medida usa a PRÓPRIA escala — mudar a medida de uma nunca
 * mexe na outra. A que ficou sem medida usa a média das escalas medidas, e
 * medir uma só continua bastando para todas.
 *
 * Medidas que não batem entre si (mais de 10% longe da mediana) são apontadas:
 * numa foto só, isso é número digitado errado ou altura trocada com largura —
 * e, com uma medida por peça, o erro ficaria calado naquela peça até o tecido
 * cortado.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const m = await carregarModulo("src/motores/moldeDaImagem.js");

/** Um risco como a tela passa: nós em células da grade, e a caixa deles. */
const risco = (x, y, w, h) => {
  const nos = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    .map(([px, py]) => ({ x: px, y: py, entrada: { x: px, y: py }, saida: { x: px, y: py }, canto: true, retaDepois: true }));
  return { nos, caixa: { minX: x, minY: y, largura: w, altura: h } };
};
const perto = (a, b) => Math.abs(a - b) < 1e-9;
const riscos = [risco(10, 10, 100, 200), risco(150, 10, 50, 100), risco(10, 250, 80, 40)];

// 1. Nada medido, ou medida zero/inválida: sem centímetro nenhum.
assert.equal(m.riscosEmCm(riscos, []), null);
assert.equal(m.riscosEmCm(riscos, [null, { lado: "altura", cm: 0 }, { lado: "largura", cm: Number.NaN }]), null);

// 2. Uma medida: as outras seguem a escala dela (como sempre foi).
{
  const r = m.riscosEmCm(riscos, [{ lado: "altura", cm: 70 }]);
  assert.ok(perto(r.pecas[0].altura, 70));
  assert.ok(perto(r.pecas[1].altura, 35), "a peça 2, com metade da altura em células, sai com 35");
  assert.deepEqual(r.pecas.map((p) => p.medida), [true, false, false]);
  assert.deepEqual(r.discordantes, []);
}

// 3. Cada peça medida fica com a sua medida; mudar uma não mexe na outra; a sem medida segue a média.
{
  const r = m.riscosEmCm(riscos, [{ lado: "altura", cm: 70 }, { lado: "largura", cm: 18 }]);
  assert.ok(perto(r.pecas[0].altura, 70), "a 1 com os seus 70 de altura");
  assert.ok(perto(r.pecas[1].largura, 18), "a 2 com os seus 18 de largura");
  assert.ok(perto(r.pecas[2].largura, (80 * (0.35 + 0.36)) / 2), "a 3, sem medida, pela média das escalas (0,35 e 0,36)");
  const outra = m.riscosEmCm(riscos, [{ lado: "altura", cm: 70 }, { lado: "largura", cm: 19 }]);
  assert.ok(perto(outra.pecas[0].altura, 70), "mudar a medida da 2 não mexe na 1");
}

// 4. Os nós saem em centímetros, encostados no canto da própria peça, com as alças junto.
{
  const r = m.riscosEmCm(riscos, [null, { lado: "altura", cm: 50 }]);
  assert.deepEqual(r.pecas[1].nos.map((q) => [q.x, q.y]), [[0, 0], [25, 0], [25, 50], [0, 50]]);
  assert.deepEqual(r.pecas[1].nos[1].entrada, { x: 25, y: 0 });
}

// 5. Medidas que não batem: a que fica mais de 10% longe da mediana é apontada; a folga da fita, não.
{
  // A 1 e a 2 dão 0,35 cm por célula; a 3 dá 0,5 (número errado, ou altura no lugar da largura).
  const r = m.riscosEmCm(riscos, [{ lado: "altura", cm: 70 }, { lado: "altura", cm: 35 }, { lado: "largura", cm: 40 }]);
  assert.deepEqual(r.discordantes, [2]);
  // 0,35 e 0,37: menos de 3% da mediana cada uma — é a fita, não é erro.
  assert.deepEqual(m.riscosEmCm(riscos, [{ lado: "altura", cm: 70 }, { lado: "altura", cm: 37 }]).discordantes, []);
}

console.log("OK — cada peça com a sua medida.");
