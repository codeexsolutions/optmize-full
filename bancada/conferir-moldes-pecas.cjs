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

// 6. Tamanhos: nome limpo, cor #rrggbb minúscula, um base só, sem repetir.
{
  const { arrumarTamanhos } = require("../servidor/moldes-pecas");
  const t = arrumarTamanhos([
    { nome: " P ", cor: "#FF0000", base: false },
    { nome: "M", cor: "00ffff", base: true },
    { nome: "M", cor: "#123456" },
    { nome: "G", cor: "laranja", base: true },
    { nome: "", cor: "#000000" },
  ]);
  assert.deepEqual(t.map((x) => x.nome), ["P", "M", "G"]);
  assert.equal(t[0].cor, "#ff0000");
  assert.equal(t[1].cor, "#00ffff");
  assert.equal(t[2].cor, null, "cor que não é #rrggbb vira null (a tela usa a paleta)");
  assert.deepEqual(t.map((x) => x.base), [false, true, false], "só o primeiro base vale");
  assert.deepEqual(t.map((x) => x.ordem), [0, 1, 2]);
  assert.equal(arrumarTamanhos(undefined), null, "sem o campo: o PUT mantém os guardados");
}

// 7. Grupo: inteiro ≥ 0 ou null.
{
  assert.equal(arrumarPeca({ contorno: quadrado, grupo: 3 }, 0).grupo, 3);
  assert.equal(arrumarPeca({ contorno: quadrado, grupo: "x" }, 0).grupo, null);
  assert.equal(arrumarPeca({ contorno: quadrado }, 0).grupo, null);
}

// 8. Graduação: limpa e conferida; só com nós; nó fora, número absurdo, modo torto e tamanho vazio saem.
{
  const nos = quadrado.map((p) => no(p.x, p.y));
  const l = arrumarPeca({ contorno: quadrado, nos, graduacao: {
    jeito: "pontos", porcentagem: 999, perdidos: 1,
    regras: [
      { no: 1, modo: "igual", passo: { dx: 1, dy: -0.5 } },
      { no: 9, modo: "igual", passo: { dx: 1, dy: 0 } },
      { no: 2, modo: "porTamanho", deslocamentos: { G: { dx: 2, dy: 0 }, "": { dx: 1, dy: 0 }, GG: { dx: 500, dy: 0 } } },
      { no: 1, modo: "igual", passo: { dx: 9, dy: 9 } },
      { no: 3, modo: "torto", passo: { dx: 1, dy: 1 } },
    ],
  } }, 0);
  const gr = pecaDoBanco({ ...l, id: 1 }).graduacao;
  assert.equal(gr.jeito, "pontos");
  assert.equal(gr.porcentagem, 0, "porcentagem fora de −50…50 vira 0");
  assert.equal(gr.perdidos, 1);
  assert.deepEqual(gr.regras, [
    { no: 1, modo: "igual", passo: { dx: 1, dy: -0.5 } },
    { no: 2, modo: "porTamanho", deslocamentos: { G: { dx: 2, dy: 0 } } },
  ]);
  assert.equal(arrumarPeca({ contorno: quadrado, graduacao: { jeito: "pontos", regras: [] } }, 0).graduacao, null, "sem nós, sem graduação");
  assert.equal(arrumarPeca({ contorno: quadrado, nos, graduacao: { jeito: "outro" } }, 0).graduacao, null);
  assert.equal(pecaDoBanco({ ...arrumarPeca({ contorno: quadrado }, 0), id: 2 }).graduacao, null);
}

// 9. O tipo simétrico do nó é guardado; nó de canto não é simétrico; nó sem o campo volta sem ele.
{
  const nos = quadrado.map((p) => no(p.x, p.y));
  nos[1] = { ...nos[1], canto: false, simetrico: true };
  nos[2] = { ...nos[2], canto: true, simetrico: true };
  const volta = pecaDoBanco({ ...arrumarPeca({ contorno: quadrado, nos }, 0), id: 1 }).nos;
  assert.equal(volta[1].simetrico, true);
  assert.equal("simetrico" in volta[2], false, "canto não é simétrico");
  assert.equal("simetrico" in volta[0], false, "sem o campo, volta sem ele");
}

console.log("OK — o servidor guarda nós e marcações sem inventar nem perder.");
