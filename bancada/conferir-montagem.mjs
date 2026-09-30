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

// 1b. lerLinhaMm: a linha em volta da peça, em mm, de 0 a 10, com vírgula; vazio é sem linha.
assert.equal(m.lerLinhaMm("0,5"), 0.5);
assert.equal(m.lerLinhaMm("2"), 2);
assert.equal(m.lerLinhaMm(" 10 "), 10);
assert.equal(m.lerLinhaMm(""), 0);
assert.equal(m.lerLinhaMm("1,25"), 1.3);
for (const ruim of ["abc", "12", "-1", "1,5,2"]) assert.equal(m.lerLinhaMm(ruim), null, ruim);

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

// --- Vários nós na peça (o editor estilo Corel) ---
{
  const retoC = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });
  const base = {
    nos: [retoC(0, 0), retoC(10, 0), retoC(20, 0), retoC(20, 10), retoC(0, 10)],
    papel: "frente", tamanho: "M", quantidade: 1, nome: "",
    marcacoes: {
      margem: 0, espelhar: false, fio: { x: 10, y: 5, angulo: 0, comprimento: 6 },
      piques: [{ no: 1, t: 0.5, profundidade: 0.5 }, { no: 3, t: 0.5, profundidade: 0.5 }], pontos: [{ x: 5, y: 5 }],
    },
    graduacao: { jeito: "pontos", porcentagem: 0, regras: [
      { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }, { no: 3, modo: "igual", passo: { dx: 0, dy: 1 } }] },
  };
  const perto = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

  // Apagar: o trecho 0 (de 0 a 10) e o 1 (de 10 a 20) viram o trecho 0 (de 0 a 20) — o pique do meio do 1 fica a 3/4.
  const r = m.apagarNosDaPeca(base, [1]);
  assert.ok(!r.erro, r.erro);
  assert.equal(r.peca.nos.length, 4);
  assert.equal(r.peca.marcacoes.piques[0].no, 0);
  assert.ok(perto(r.peca.marcacoes.piques[0].t, 0.75, 1e-6), `t = ${r.peca.marcacoes.piques[0].t}`);
  assert.deepEqual(r.peca.marcacoes.piques[1], { no: 2, t: 0.5, profundidade: 0.5 }, "trecho que não mudou: o mesmo t, no número novo");
  assert.deepEqual(r.peca.graduacao.regras, [{ no: 2, modo: "igual", passo: { dx: 0, dy: 1 } }]);
  assert.equal(r.peca.graduacao.perdidos, 1, "a regra do nó apagado conta em perdidos");
  assert.ok(m.apagarNosDaPeca(base, [0, 1, 2]).erro, "nunca menos de três nós");

  // Pôr nó no meio dos trechos 0 e 3: piques e regras andam junto.
  const p = m.porNosDaPeca(base, [{ no: 0, t: 0.5 }, { no: 3, t: 0.5 }]);
  assert.equal(p.nos.length, 7);
  assert.deepEqual(p.marcacoes.piques.map((q) => q.no), [2, 5], "os piques dos trechos 1 e 3 andaram");
  assert.deepEqual(p.graduacao.regras.map((q) => q.no), [2, 4]);

  // Girar 4× 90° devolve a peça: nós, pontos, fio e regras; 90° troca largura e altura, sem a peça sair do lugar.
  let g = base;
  for (let k = 0; k < 4; k++) g = m.girarPeca(g, 90);
  g.nos.forEach((n, i) => assert.ok(perto(n.x, base.nos[i].x) && perto(n.y, base.nos[i].y), `nó ${i} não voltou`));
  assert.ok(perto(g.marcacoes.pontos[0].x, 5) && perto(g.marcacoes.pontos[0].y, 5));
  assert.ok(perto(g.marcacoes.fio.x, 10) && perto(g.marcacoes.fio.y, 5) && perto(g.marcacoes.fio.angulo, 0));
  assert.deepEqual(g.graduacao.regras, base.graduacao.regras);
  const noventa = m.girarPeca(base, 90);
  const cx = m.caixaDe(noventa.nos);
  assert.ok(perto(cx.largura, 10) && perto(cx.altura, 20), `caixa ${JSON.stringify(cx)}`);
  assert.ok(perto(cx.minX, 0) && perto(cx.minY, 0), "o canto de cima à esquerda fica onde estava");
  assert.ok(perto(Math.abs(noventa.marcacoes.fio.angulo), 90), "o fio girou junto");
  assert.deepEqual(noventa.graduacao.regras[0].passo, { dx: 0, dy: 1 }, "o salto (1, 0) gira para (0, 1): 90° no sentido do relógio da tela");
}

// Reduzir na peça: o nó com regra é âncora, a regra vai para o número novo, e o pique fica no mesmo lugar da costura.
{
  const N = 40;
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * 100;
  const nos = Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const p = { x: 100 * Math.cos(a), y: 100 * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  const peca = {
    nos, papel: "frente", tamanho: "M", quantidade: 1, nome: "",
    marcacoes: { margem: 0, espelhar: false, fio: { x: 0, y: 0, angulo: 0, comprimento: 6 }, piques: [{ no: 5, t: 0.5, profundidade: 0.5 }], pontos: [] },
    graduacao: { jeito: "pontos", porcentagem: 0, regras: [{ no: 15, modo: "igual", passo: { dx: 1, dy: 0 } }] },
  };
  const antesDoPique = m.posicaoDoPique(peca.nos, peca.marcacoes.piques[0]).ponto;
  const r = m.reduzirNosDaPeca(peca, null, 0.5);
  assert.ok(!r.erro, r.erro);
  assert.ok(r.depois < r.antes);
  const regra = r.peca.graduacao.regras[0];
  assert.ok(Math.abs(r.peca.nos[regra.no].x - nos[15].x) < 1e-9 && Math.abs(r.peca.nos[regra.no].y - nos[15].y) < 1e-9, "a regra seguiu o seu nó");
  assert.equal(r.peca.graduacao.perdidos ?? 0, 0, "nenhuma regra perdida");
  const depoisDoPique = m.posicaoDoPique(r.peca.nos, r.peca.marcacoes.piques[0]).ponto;
  assert.ok(Math.hypot(depoisDoPique.x - antesDoPique.x, depoisDoPique.y - antesDoPique.y) < 1, "o pique ficou no mesmo lugar da costura");
}

console.log("OK — as contas da Montagem conferem.");
