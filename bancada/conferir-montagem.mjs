/*
 * BANCADA — as contas da Montagem
 *
 *     npm run bancada:montagem
 *
 * O pique preso ao traço, o molde de DXF que volta igual, o espelhar e a
 * margem que vira contorno. Ver o Review Focus do plano
 * docs/superpowers/plans/2026-09-26-montagem-de-moldes.md.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const m = await carregarModulo("src/motores/montagem.js");
const e = await carregarModulo("src/motores/edicaoDeNos.js");
const perto = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;

const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const pecaQuadrada = () => m.pecaParaMontar({
  tamanho: "base", papel: "frente", nome: null, quantidade: 1,
  largura: 10, altura: 10, contorno: quadrado, furos: [], origem: "DXF",
});

// 1. lerCm aceita vírgula, vazio e negativo; recusa texto.
assert.equal(m.lerCm("0,5"), 0.5);
assert.equal(m.lerCm(""), 0);
assert.equal(m.lerCm("-1"), 0);
assert.equal(m.lerCm("abc"), null);

// 2. Peça de DXF (só polígono) volta com o mesmo contorno, se ninguém mexer.
{
  const p = pecaQuadrada();
  assert.equal(p.nos.length, 4);
  assert.ok(p.nos.every((n) => n.canto && n.retaDepois));
  const g = m.pecaParaGravar(p);
  assert.ok(g.peca, g.erro);
  assert.deepEqual(g.peca.contorno, quadrado);
  assert.equal(g.peca.largura, 10);
  assert.equal(g.peca.altura, 10);
}

// 3. Marcações padrão: fio vertical no meio, 60% da altura, margem 0.
{
  const mc = pecaQuadrada().marcacoes;
  assert.deepEqual(mc.fio, { x: 5, y: 5, angulo: 0, comprimento: 6 });
  assert.equal(mc.margem, 0);
  assert.equal(mc.espelhar, false);
}

// 4. Margem 1: o contorno cresce, e o risco, o fio e os pontos andam junto.
{
  const p = pecaQuadrada();
  p.marcacoes = { ...p.marcacoes, margem: 1, pontos: [{ x: 2, y: 2 }] };
  const g = m.pecaParaGravar(p).peca;
  assert.equal(g.largura, 12);
  assert.ok(perto(g.nos[0], { x: 1, y: 1 }), "o risco anda para dentro do corte");
  assert.ok(perto(g.marcacoes.pontos[0], { x: 3, y: 3 }));
  assert.ok(perto(g.marcacoes.fio, { x: 6, y: 6 }));
  assert.ok(g.contorno.every((q) => q.x >= 0 && q.y >= 0), "encostado no canto");
}

// 5. Margem que se cruza: erro, e nada de contorno.
{
  const u = m.pecaParaMontar({
    tamanho: "base", papel: "outro", quantidade: 1, largura: 5, altura: 10, furos: [],
    contorno: [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 3, y: 10 },
      { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 10 }, { x: 0, y: 10 },
    ],
  });
  u.marcacoes = { ...u.marcacoes, margem: 1 };
  const g = m.pecaParaGravar(u);
  assert.ok(g.erro && !g.peca);
}

// 6. Pique: pôr nó ANTES dele não o tira do lugar.
{
  let p = pecaQuadrada();
  p.marcacoes = { ...p.marcacoes, piques: [{ no: 0, t: 0.7, profundidade: 0.5 }, { no: 2, t: 0.5, profundidade: 0.5 }] };
  const antes = p.marcacoes.piques.map((q) => m.posicaoDoPique(p.nos, q).ponto);
  p = m.inserirNoNaPeca(p, 0, 0.4);
  const depois = p.marcacoes.piques.map((q) => m.posicaoDoPique(p.nos, q).ponto);
  assert.ok(perto(antes[0], depois[0]), `${JSON.stringify(antes[0])} → ${JSON.stringify(depois[0])}`);
  assert.ok(perto(antes[1], depois[1]));
  assert.deepEqual(p.marcacoes.piques.map((q) => q.no), [1, 3]);
}

// 7. Pique numa curva: continua em cima do mesmo ponto depois do nó novo.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: -6 }, retaDepois: false },
    { x: 10, y: 0, entrada: { x: 7, y: -6 }, saida: { x: 10, y: 0 }, retaDepois: true },
    { x: 10, y: 10, entrada: { x: 10, y: 10 }, saida: { x: 10, y: 10 }, retaDepois: true },
    { x: 0, y: 10, entrada: { x: 0, y: 10 }, saida: { x: 0, y: 10 }, retaDepois: true },
  ];
  let p = { tamanho: "base", papel: "costas", quantidade: 1, nos, marcacoes: m.marcacoesPadrao(nos), contorno: [], furos: [] };
  p.marcacoes.piques = [{ no: 0, t: 0.2, profundidade: 0.5 }];
  const antes = m.posicaoDoPique(p.nos, p.marcacoes.piques[0]).ponto;
  p = m.inserirNoNaPeca(p, 0, 0.6);
  assert.ok(perto(antes, m.posicaoDoPique(p.nos, p.marcacoes.piques[0]).ponto, 1e-9));
}

// 8. A normal do pique aponta para fora, nos dois sentidos da volta.
for (const volta of [quadrado, [...quadrado].reverse()]) {
  const nos = m.nosDoPoligono(volta);
  // O lado y = 0: trecho 0 na volta original; na invertida, (10,0) → (0,0) é o trecho 2.
  const baixo = volta === quadrado ? 0 : 2;
  const { fora } = m.posicaoDoPique(nos, { no: baixo, t: 0.5, profundidade: 0.5 });
  assert.ok(perto(fora, { x: 0, y: -1 }), JSON.stringify(fora));
}

// 9. Apagar o nó de um trecho com pique: o pique vai para o trecho que sobra.
{
  let p = pecaQuadrada();
  p = m.inserirNoNaPeca(p, 0, 0.5); // 5 nós; o nó 1 é o (5,0)
  p.marcacoes = { ...p.marcacoes, piques: [{ no: 1, t: 0.5, profundidade: 0.5 }, { no: 3, t: 0.5, profundidade: 0.5 }] };
  const r = m.apagarNoDaPeca(p, 1);
  assert.equal(r.nos.length, 4);
  assert.deepEqual(r.marcacoes.piques.map((q) => q.no), [0, 2]);
  assert.ok(Math.abs(r.marcacoes.piques[0].t - 0.75) < 1e-9);
  assert.equal(m.apagarNoDaPeca(m.pecaParaMontar({ contorno: quadrado.slice(0, 3), quantidade: 1 }), 0), null);
}

// 10. Espelhar ×3: 2 normais e 1 espelhada, com o furo espelhado junto.
{
  const furo = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  const peca = {
    papel: "manga", nome: null, quantidade: 3, largura: 10, altura: 10,
    contorno: quadrado, furos: [furo], marcacoes: { espelhar: true },
  };
  const r = m.pecasParaOEncaixe([peca]);
  assert.equal(r.length, 2);
  assert.equal(r[0].quantidade, 2);
  assert.equal(r[1].quantidade, 1);
  assert.ok(r[1].furos[0].some((q) => perto(q, { x: 9, y: 1 })));
  assert.ok(r[1].nome.includes("espelhada"));
  assert.equal(m.pecasParaOEncaixe([{ ...peca, quantidade: 1 }]).length, 1);
  assert.equal(m.pecasParaOEncaixe([{ ...peca, marcacoes: null }]).length, 1);
}

// 11. Desenho com margem: corte em volta, costura dentro, pique atravessa as duas.
{
  const p = pecaQuadrada();
  p.marcacoes = { ...p.marcacoes, margem: 1, piques: [{ no: 0, t: 0.5, profundidade: 0.5 }] };
  const d = m.desenhoDaPeca(m.pecaParaGravar(p).peca);
  assert.ok(d.costura && d.costura.length === 4);
  assert.ok(perto(d.piques[0].de, { x: 6, y: 0 }), JSON.stringify(d.piques[0]));
  assert.ok(perto(d.piques[0].ate, { x: 6, y: 1.5 }));
  assert.equal(d.texto.linhas[0], "frente");
}

// 12. SVG: cm no tamanho, uma camada por tipo.
{
  const d = m.desenhoDaPeca(m.pecaParaGravar(pecaQuadrada()).peca);
  const svg = m.svgDaMontagem(m.arranjar([d, d]), "camisa <teste>");
  assert.match(svg, /width="22cm"/);
  for (const id of ["corte", "costura", "piques", "pontos", "fio", "textos"]) assert.match(svg, new RegExp(`<g id="${id}"`));
  assert.ok(!svg.includes("<teste>"), "nome escapado");
}

// Graduação presa aos nós: inserir e apagar nó levam as regras junto.
{
  const p = { ...pecaQuadrada(), graduacao: { jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }, { no: 2, modo: "igual", passo: { dx: 1, dy: 1 } }] } };
  const inserida = m.inserirNoNaPeca(p, 0, 0.5);
  assert.deepEqual(inserida.graduacao.regras.map((r) => r.no), [2, 3], "o nó novo entrou antes das regras");
  const apagada = m.apagarNoDaPeca(p, 1);
  assert.deepEqual(apagada.graduacao.regras.map((r) => r.no), [1]);
  assert.equal(apagada.graduacao.perdidos, 1);
  assert.equal(m.inserirNoNaPeca(pecaQuadrada(), 0, 0.5).graduacao, undefined, "peça sem graduação continua sem");
}

console.log("OK — as contas da Montagem conferem.");
