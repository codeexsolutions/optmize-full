/*
 * BANCADA — a peça que o servidor aceita guardar
 *
 *     npm run bancada:moldes-pecas
 *
 * O ponto que mais importa: uma peça que veio SEM `nos` (do passo a passo
 * antigo, de DXF) continua sem, e uma que veio COM continua com — o servidor
 * não inventa nem perde o risco.
 */
const assert = require("node:assert/strict");
const { arrumarPeca, lerSituacao, pecaDoBanco } = require("../servidor/moldes-pecas");

const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const no = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });

// 1. Sem nós: igual a antes.
{
  const l = arrumarPeca({ papel: "Frente", contorno: quadrado, largura: 10, altura: 10 }, 0);
  assert.equal(l.papel, "frente");
  assert.equal(l.nos, null);
  assert.equal(l.marcacoes, null);
}

// 2. Com nós e marcações: guardados, e voltam iguais.
{
  const marcacoes = {
    margem: 1, espelhar: true, fio: { x: 5, y: 5, angulo: 0, comprimento: 6 },
    piques: [{ no: 0, t: 0.5, profundidade: 0.5 }], pontos: [{ x: 2, y: 2 }],
  };
  const l = arrumarPeca({ contorno: quadrado, nos: quadrado.map((p) => no(p.x, p.y)), marcacoes }, 3);
  const volta = pecaDoBanco({ ...l, id: 1 });
  assert.equal(volta.nos.length, 4);
  assert.deepEqual(volta.marcacoes, marcacoes);
  assert.deepEqual(volta.contorno, quadrado);
}

// 3. Marcação estranha é limpa: pique fora dos nós, margem absurda, NaN.
{
  const l = arrumarPeca({
    contorno: quadrado, nos: quadrado.map((p) => no(p.x, p.y)),
    marcacoes: { margem: "abc", fio: {}, piques: [{ no: 9, t: 0.5, profundidade: 0.5 }, { no: 1, t: 2, profundidade: 1 }], pontos: [{ x: "a" }] },
  }, 0);
  const mc = JSON.parse(l.marcacoes);
  assert.equal(mc.margem, 0);
  assert.deepEqual(mc.piques, []);
  assert.deepEqual(mc.pontos, []);
}

// 4. Nós quebrados: a peça continua (pelo contorno), sem nós.
assert.equal(arrumarPeca({ contorno: quadrado, nos: [{ x: 1 }] }, 0).nos, null);

// 5. Situação.
assert.equal(lerSituacao("rascunho"), "rascunho");
assert.equal(lerSituacao("pronto"), "pronto");
assert.equal(lerSituacao("x"), null);

console.log("OK — o servidor guarda nós e marcações sem inventar nem perder.");
