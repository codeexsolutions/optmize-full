/*
 * BANCADA — a graduação
 *
 *     npm run bancada:graduacao
 *
 * Roda no CI. Ver docs/superpowers/specs/2026-09-29-graduacao-design.md.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const g = await carregarModulo("src/motores/graduacao.js");
const grade = ["PP", "P", "M", "G", "GG"].map((nome, ordem) => ({ nome, cor: "#000000", ordem, base: nome === "M" }));
const perto = (a, b, tol = 1e-9) => Math.abs(a.dx - b.dx) < tol && Math.abs(a.dy - b.dy) < tol;

// 1. Número digitado: vírgula, negativo, vazio; texto recusa.
assert.equal(g.lerMedida("-0,5"), -0.5);
assert.equal(g.lerMedida(""), 0);
assert.equal(g.lerMedida("abc"), null);

// 2. Saltos pela ordem da grade.
assert.equal(g.saltosDoTamanho(grade, "M", "GG"), 2);
assert.equal(g.saltosDoTamanho(grade, "M", "PP"), -2);
assert.equal(g.saltosDoTamanho(grade, "M", "XG"), null);

// 3. Salto igual: k × passo, para cima e para baixo do base.
{
  const r = { no: 0, modo: "igual", passo: { dx: 1, dy: -0.5 } };
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "G"), { dx: 1, dy: -0.5 }));
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "GG"), { dx: 2, dy: -1 }));
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "P"), { dx: -1, dy: 0.5 }));
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "M"), { dx: 0, dy: 0 }));
}

// 4. Por tamanho: acumulado; tamanho sem valor conta como o vizinho mais perto do base (salto 0).
{
  const r = { no: 0, modo: "porTamanho", deslocamentos: { P: { dx: -1, dy: 0 }, G: { dx: 1, dy: 0 } } };
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "GG"), { dx: 1, dy: 0 }), "GG sem valor = G");
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "PP"), { dx: -1, dy: 0 }), "PP sem valor = P");
  const passos = g.passosDaRegra(r, grade, "M");
  assert.deepEqual(passos.map((p) => `${p.de}→${p.para}`), ["PP→P", "P→M", "M→G", "G→GG"]);
  assert.ok(perto(passos[1], { dx: 1, dy: 0 }), "P→M anda 1");
  assert.ok(perto(passos[3], { dx: 0, dy: 0 }), "G→GG sem valor anda 0");
  assert.deepEqual(g.faltando(r, grade, "M"), ["PP", "GG"]);
}

// 5. Mudar o salto M→G move o G e tudo acima; mudar P→M move o P e tudo abaixo.
{
  const r = { no: 3, modo: "igual", passo: { dx: 1, dy: 0 } };
  const cima = g.mudarPasso(r, grade, "M", 2, { dx: 1.5, dy: 0 });
  assert.equal(cima.modo, "porTamanho");
  assert.equal(cima.no, 3);
  assert.ok(perto(g.deslocamentoDaRegra(cima, grade, "M", "G"), { dx: 1.5, dy: 0 }));
  assert.ok(perto(g.deslocamentoDaRegra(cima, grade, "M", "GG"), { dx: 2.5, dy: 0 }));
  assert.ok(perto(g.deslocamentoDaRegra(cima, grade, "M", "P"), { dx: -1, dy: 0 }), "o P não muda");
  const baixo = g.mudarPasso(r, grade, "M", 1, { dx: 2, dy: 0 });
  assert.ok(perto(g.deslocamentoDaRegra(baixo, grade, "M", "P"), { dx: -2, dy: 0 }));
  assert.ok(perto(g.deslocamentoDaRegra(baixo, grade, "M", "PP"), { dx: -3, dy: 0 }));
  assert.ok(perto(g.deslocamentoDaRegra(baixo, grade, "M", "G"), { dx: 1, dy: 0 }), "o G não muda");
}

// 6. Trocar de modo: igual → por tamanho preenche; por tamanho → igual avisa quando perde.
{
  const igual = { no: 0, modo: "igual", passo: { dx: 1, dy: 0 } };
  const pt = g.trocarModo(igual, grade, "M", "porTamanho");
  assert.equal(pt.perdeu, false);
  assert.ok(perto(pt.regra.deslocamentos.GG, { dx: 2, dy: 0 }));
  assert.equal(g.trocarModo(pt.regra, grade, "M", "igual").perdeu, false, "saltos iguais não perdem nada");
  const diferente = g.mudarPasso(igual, grade, "M", 3, { dx: 3, dy: 0 });
  const volta = g.trocarModo(diferente, grade, "M", "igual");
  assert.equal(volta.perdeu, true);
  assert.ok(perto(volta.regra.passo, { dx: 1, dy: 0 }), "fica o salto do base para o de cima");
}

// 7. Pôr, trocar e tirar a regra de um nó.
{
  let gr = g.comRegra(null, 4, { modo: "igual", passo: { dx: 1, dy: 0 } });
  assert.equal(gr.jeito, "pontos");
  gr = g.comRegra(gr, 1, { modo: "igual", passo: { dx: 0, dy: 1 } });
  assert.deepEqual(gr.regras.map((r) => r.no), [1, 4], "em ordem de nó");
  gr = g.comRegra(gr, 4, null);
  assert.deepEqual(gr.regras.map((r) => r.no), [1]);
}

// 8. Nós do base mudaram: inserir desloca os de depois; apagar tira a regra e conta a perda.
{
  const gr = { jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }, { no: 3, modo: "igual", passo: { dx: 2, dy: 0 } },
  ] };
  assert.deepEqual(g.graduacaoAoInserirNo(gr, 1).regras.map((r) => r.no), [1, 4]);
  const ap = g.graduacaoAoApagarNo(gr, 1);
  assert.deepEqual(ap.regras.map((r) => r.no), [2]);
  assert.equal(ap.perdidos, 1);
  assert.deepEqual(g.graduacaoAoApagarNo(gr, 2).regras.map((r) => r.no), [1, 2], "apagar nó sem regra só desloca");
}

// 9. Renomear e tirar tamanho nas regras por tamanho.
{
  const gr = { jeito: "pontos", porcentagem: 0, regras: [
    { no: 0, modo: "porTamanho", deslocamentos: { P: { dx: -1, dy: 0 }, G: { dx: 1, dy: 0 } } },
  ] };
  assert.deepEqual(Object.keys(g.graduacaoRenomearTamanho(gr, "G", "GRANDE").regras[0].deslocamentos).sort(), ["GRANDE", "P"]);
  assert.deepEqual(Object.keys(g.graduacaoTirarTamanho(gr, "P").regras[0].deslocamentos), ["G"]);
}

// --- Gerar um tamanho ---
const reto = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });
const nosBase = [reto(0, 0), reto(10, 0), reto(10, 5), reto(10, 10), reto(0, 10)];
const pecaBase = (graduacao) => ({
  id: 7, tamanho: "M", grupo: 0, papel: "frente", nome: "", quantidade: 2, origem: "Digitalizar",
  nos: nosBase, graduacao,
  marcacoes: { margem: 0, espelhar: false, fio: { x: 5, y: 5, angulo: 0, comprimento: 6 },
    piques: [{ no: 0, t: 0.5, profundidade: 0.5 }], pontos: [{ x: 10, y: 5 }] },
});
const regrasDoOmbro = [
  { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } },
  { no: 3, modo: "porTamanho", deslocamentos: { G: { dx: 3, dy: 0 }, GG: { dx: 6, dy: 0 } } },
];
const base = pecaBase({ jeito: "pontos", porcentagem: 0, regras: regrasDoOmbro });

// 10. No próprio base nada anda.
assert.ok(g.deslocamentosDoTamanho(base, grade, "M").every((d) => d.dx === 0 && d.dy === 0));

// 11. O G: os nós com regra andam o pedido; os sem regra, a mistura dos vizinhos pelo comprimento da linha.
{
  const r = g.gerarTamanho(base, grade, "G");
  assert.ok(r.peca, r.erro);
  const n = r.peca.nos;
  assert.equal(n[1].x, 11, "nó 1: salto igual de 1");
  assert.equal(n[3].x, 13, "nó 3: 3 no G");
  assert.ok(Math.abs(n[2].x - 12) < 1e-9, `nó 2, no meio, anda a média: ${n[2].x}`);
  assert.ok(Math.abs(n[4].x - (3 - 2 / 3)) < 1e-6, `nó 4 anda pela volta: ${n[4].x}`);
  assert.equal(r.peca.tamanho, "G");
  assert.equal(r.peca.grupo, 0);
  assert.equal(r.peca.origem, g.ORIGEM_GERADA);
  assert.equal(r.peca.graduacao, null);
  assert.equal(r.peca.id, undefined, "peça nova, sem id");
  assert.equal(r.peca.quantidade, 2, "os campos comuns vêm do base");
  assert.deepEqual(r.peca.marcacoes.piques, base.marcacoes.piques, "o pique fica no mesmo trecho");
  assert.ok(Math.abs(r.peca.marcacoes.pontos[0].x - n[2].x) < 1e-9, "o ponto em cima do nó 2 anda como ele");
  assert.equal(r.peca.marcacoes.fio.angulo, 0);
  assert.equal(r.peca.marcacoes.fio.comprimento, 6);
  assert.ok(r.peca.marcacoes.fio.x > 5, "o fio anda com a peça");
  assert.equal(base.nos[1].x, 10, "não mexe no base");
}

// 12. O P fica abaixo do base: o salto igual volta, e o "por tamanho" sem P conta 0.
{
  const r = g.gerarTamanho(base, grade, "P");
  assert.equal(r.peca.nos[1].x, 9);
  assert.equal(r.peca.nos[3].x, 10, "o nó 3 não tem valor para o P: fica");
}

// 13. Salto igual e por tamanho com os mesmos valores dão o mesmo desenho.
{
  const igual = pecaBase({ jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }, { no: 3, modo: "igual", passo: { dx: 2, dy: 1 } }] });
  const porTamanho = pecaBase({ jeito: "pontos", porcentagem: 0, regras: [
    g.trocarModo(igual.graduacao.regras[0], grade, "M", "porTamanho").regra,
    g.trocarModo(igual.graduacao.regras[1], grade, "M", "porTamanho").regra] });
  for (const t of ["PP", "P", "G", "GG"]) {
    assert.deepEqual(g.gerarTamanho(porTamanho, grade, t).peca.nos, g.gerarTamanho(igual, grade, t).peca.nos, t);
  }
}

// 14. Porcentagem: 0 não gera; 4% no P (k = −1) escala 0,96 a partir do centro; a que some dá erro.
{
  assert.ok(g.gerarTamanho(pecaBase({ jeito: "porcentagem", porcentagem: 0, regras: [] }), grade, "G").erro);
  const p4 = g.gerarTamanho(pecaBase({ jeito: "porcentagem", porcentagem: 4, regras: [] }), grade, "P").peca;
  const xs = p4.nos.map((q) => q.x);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 9.6) < 1e-9, "largura 10 vira 9,6");
  assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 5) < 1e-9, "o centro fica");
  assert.ok(Math.abs(p4.marcacoes.fio.comprimento - 5.76) < 1e-9, "o fio escala junto");
  assert.ok(g.gerarTamanho(pecaBase({ jeito: "porcentagem", porcentagem: 50, regras: [] }), grade, "PP").erro,
    "50% por tamanho no PP (k = −2) some");
}

// 15. Um ponto só: gera e avisa; nenhum (ou só nó fora da peça): não gera.
{
  const um = g.gerarTamanho(pecaBase({ jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }] }), grade, "G");
  assert.ok(um.peca && um.avisos.length === 1);
  assert.ok(um.peca.nos.every((q, i) => q.x === nosBase[i].x + 1), "a peça inteira só se desloca");
  assert.ok(g.gerarTamanho(pecaBase({ jeito: "pontos", porcentagem: 0, regras: [] }), grade, "G").erro);
  assert.ok(g.gerarTamanho(pecaBase({ jeito: "pontos", porcentagem: 0, regras: [
    { no: 99, modo: "igual", passo: { dx: 1, dy: 0 } }] }), grade, "G").erro, "regra de nó que não existe não conta");
}

// 16. Os avisos da graduação.
{
  const av = g.avisosDaGraduacao(pecaBase({ jeito: "pontos", porcentagem: 0, perdidos: 2, regras: regrasDoOmbro }), grade);
  assert.ok(av.some((a) => /perdeu 2/.test(a)), av.join(" | "));
  assert.ok(av.some((a) => /ponto 4 não tem valor para PP, P/.test(a)), av.join(" | "));
}

// 17. A camada no lugar certo: com graduação, pela regra (exato); sem, pelos centros.
{
  const gerado = g.gerarTamanho(base, grade, "G").peca;
  const encostado = { ...gerado, nos: g.transladarNos(gerado.nos, { dx: 2, dy: 3 }) };
  const d = g.alinhamentoDaCamada(base, encostado, base, grade);
  assert.ok(Math.abs(d.dx + 2) < 1e-9 && Math.abs(d.dy + 3) < 1e-9, JSON.stringify(d));
  const volta = g.alinhamentoDaCamada(encostado, base, base, grade);
  assert.ok(Math.abs(volta.dx - 2) < 1e-9 && Math.abs(volta.dy - 3) < 1e-9, "vendo o G, o M vem para o lugar");
  const outra = { tamanho: "G", nos: [reto(0, 0), reto(4, 0), reto(4, 4), reto(0, 4)] };
  const c = g.alinhamentoDaCamada(base, outra, base, grade);
  assert.ok(Math.abs(c.dx - 3) < 1e-9 && Math.abs(c.dy - 3) < 1e-9, "número de nós diferente: pelos centros");
}

// 18. Planejar e aplicar: cria o que falta, refaz o gerado, pergunta pelo desenho próprio; o que não fecha fica de fora.
{
  const pecas = [
    base,
    { ...base, id: 8, tamanho: "G", graduacao: null, origem: "Audaces" },
    { ...base, id: 9, tamanho: "P", graduacao: null, origem: g.ORIGEM_GERADA },
    { ...base, id: 10, grupo: 1, graduacao: null, nome: "COSTAS" },
  ];
  const alvos = g.planejarGeracao(pecas, grade, null);
  assert.deepEqual(alvos.map((a) => `${a.tamanho}:${a.acao}`), ["PP:criar", "P:refazer", "G:perguntar", "GG:criar"]);
  assert.equal(alvos[2].origem, "Audaces");
  const conferir = (p) => (p.tamanho === "PP" ? { erro: "a margem fecha a peça" } : { peca: p });
  const r = g.aplicarGeracao(pecas, grade, alvos.filter((a) => a.acao !== "perguntar"), conferir);
  assert.deepEqual(r.gerados.map((a) => a.tamanho), ["P", "GG"]);
  assert.deepEqual(r.naoGerados.map((a) => `${a.tamanho}: ${a.motivo}`), ["PP: a margem fecha a peça"]);
  assert.equal(r.pecas.length, 5, "o GG entrou; o PP não");
  assert.equal(r.pecas[2].origem, g.ORIGEM_GERADA);
  assert.equal(r.pecas[2].nos[1].x, 9, "o P foi refeito no mesmo lugar da lista");
  assert.equal(r.pecas[1].origem, "Audaces", "o G da Audaces ficou");
  assert.equal(g.planejarGeracao(pecas, grade, 1).length, 0, "o grupo 1 não tem graduação");
}

// 19. Um base por grupo. Duas linhas graduadas no mesmo grupo (um G graduado noutro molde
//     e juntado aqui antes de o "juntar" limpar a graduação): o plano parte só da primeira,
//     nunca repete (grupo, tamanho) — repetido ia duas vezes para o corte — e o base não vira alvo.
{
  const pecas = [base, { ...base, id: 8, tamanho: "G", origem: "Digitalizar" }];
  const alvos = g.planejarGeracao(pecas, grade, null);
  const chaves = alvos.map((a) => `${a.grupo}/${a.tamanho}`);
  assert.equal(new Set(chaves).size, chaves.length, `(grupo, tamanho) repetido: ${chaves.join(" ")}`);
  assert.ok(alvos.every((a) => a.iBase === 0), "parte só do primeiro base do grupo");
  assert.ok(!alvos.some((a) => a.tamanho === "M"), "o base de verdade nunca vira alvo");
}

// 20. Vários nós de uma vez: as regras seguem o mapa (a do nó que saiu conta em perdidos), e giram com a peça.
{
  const g0 = { jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } },
    { no: 3, modo: "porTamanho", deslocamentos: { G: { dx: 0, dy: 2 } } },
  ] };
  const r = g.graduacaoPorMapa(g0, [0, null, 1, 2]);
  assert.deepEqual(r.regras, [{ no: 2, modo: "porTamanho", deslocamentos: { G: { dx: 0, dy: 2 } } }]);
  assert.equal(r.perdidos, 1);
  const girada = g.graduacaoGirada(g0, 90);
  assert.deepEqual(girada.regras[0].passo, { dx: 0, dy: 1 });
  assert.deepEqual(girada.regras[1].deslocamentos.G, { dx: -2, dy: 0 });
  let volta = g0;
  for (let k = 0; k < 4; k++) volta = g.graduacaoGirada(volta, 90);
  assert.deepEqual(volta.regras, g0.regras, "4× 90° devolve as regras exatas");
  assert.equal(g.graduacaoPorMapa(null, [0]), null);
}

// O nó liso automático na graduação: no tamanho gerado, a curva é refeita lisa
// a partir dos nós no lugar novo; sem deslocamento nenhum, sai igual ao base.
{
  const e = await carregarModulo("src/motores/edicaoDeNos.js");
  const N = 8;
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * 10;
  const circulo = Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const p = { x: 20 + 10 * Math.cos(a), y: 20 + 10 * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  const nosAuto = e.derivarAuto(circulo);
  const quebra = (n) => {
    const a = { x: n.x - n.entrada.x, y: n.y - n.entrada.y };
    const b = { x: n.saida.x - n.x, y: n.saida.y - n.y };
    return Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y));
  };
  const comRegras = (regras) => ({ ...pecaBase({ jeito: "pontos", porcentagem: 0, regras }), nos: nosAuto });
  const esticado = g.gerarTamanho(comRegras([
    { no: 0, modo: "igual", passo: { dx: 2, dy: 0 } },
    { no: 4, modo: "igual", passo: { dx: -2, dy: 0 } },
  ]), grade, "G");
  assert.ok(esticado.peca, esticado.erro);
  assert.ok(esticado.peca.nos.every((n) => n.auto && quebra(n) < 1e-9), "no G, todos lisos");
  // E a curva foi REFEITA nos nós do lugar novo — não são as alças duras do base.
  const refeita = e.refazerAlcas(esticado.peca.nos);
  esticado.peca.nos.forEach((n, i) => {
    assert.ok(Math.hypot(n.saida.x - refeita[i].saida.x, n.saida.y - refeita[i].saida.y) < 1e-9, `nó ${i}: alças refeitas`);
  });
  const parado = g.gerarTamanho(comRegras([
    { no: 0, modo: "igual", passo: { dx: 0, dy: 0 } },
    { no: 4, modo: "igual", passo: { dx: 0, dy: 0 } },
  ]), grade, "G");
  parado.peca.nos.forEach((n, i) => {
    const b = nosAuto[i];
    assert.ok(Math.hypot(n.saida.x - b.saida.x, n.saida.y - b.saida.y) < 1e-9, `nó ${i}: graduação zero igual ao base`);
  });
}

// A PEÇA INTEIRA EM CENTÍMETROS (2026-10-05): a Audaces gradua centímetros fixos por
// tamanho, diferentes em largura e altura (a gola: 0 e +2) — a porcentagem única errava
// mais de 0,5 cm em 39 de 74 peças reais. Aqui a largura e a altura do tamanho são as do
// base mais k × o salto, exatas.
{
  const ret = (w, h) => [reto(0, 0), reto(w, 0), reto(w, h), reto(0, h)];
  const caixa = (nos) => {
    const xs = nos.map((n) => n.x), ys = nos.map((n) => n.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const comMedida = (nos, largura, altura) => ({
    ...pecaBase({ jeito: "medida", porcentagem: 0, regras: [], medida: { largura, altura } }), nos,
    marcacoes: { margem: 0, espelhar: false, fio: { x: 2, y: 20, angulo: 0, comprimento: 6 }, piques: [], pontos: [{ x: 2, y: 10 }] },
  });
  const gola = comMedida(ret(5, 43), 0, 2);
  for (const [t, h] of [["PP", 39], ["P", 41], ["G", 45], ["GG", 47]]) {
    const r = g.gerarTamanho(gola, grade, t);
    assert.ok(r.peca, r.erro);
    const c = caixa(r.peca.nos);
    assert.ok(Math.abs(c.w - 5) < 1e-9 && Math.abs(c.h - h) < 1e-9, `gola ${t}: ${c.w} × ${c.h}, devia ser 5 × ${h}`);
  }
  // A frente cresce +2 e +2: exata nos dois sentidos, e o fio cresce junto (é vertical).
  const frente = comMedida(ret(40, 60), 2, 2);
  const gg = g.gerarTamanho(frente, grade, "GG").peca;
  const cg = caixa(gg.nos);
  assert.ok(Math.abs(cg.w - 44) < 1e-9 && Math.abs(cg.h - 64) < 1e-9, `frente GG: ${cg.w} × ${cg.h}`);
  assert.ok(Math.abs(gg.marcacoes.fio.comprimento - 6 * 64 / 60) < 1e-9, "o fio vertical cresce com a altura");
  // Cresce do centro: o centro da peça fica no lugar.
  const centro = (nos) => { const xs = nos.map((n) => n.x), ys = nos.map((n) => n.y); return [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2]; };
  assert.deepEqual(centro(gg.nos).map((v) => +v.toFixed(9)), [20, 30]);
  // Tamanho que sumiria: erro dito, e nada é gerado.
  const some = g.gerarTamanho(comMedida(ret(5, 43), 0, 30), grade, "PP");
  assert.ok(some.erro && /some|zero|negativ/i.test(some.erro), `veio: ${JSON.stringify(some)}`);
  // Os dois zerados: nada muda — avisa, como a porcentagem 0.
  assert.ok(g.gerarTamanho(comMedida(ret(5, 43), 0, 0), grade, "G").erro);
  assert.ok(g.avisosDaGraduacao(comMedida(ret(5, 43), 0, 0), grade).some((a) => /0/.test(a)));
  // A prévia (deslocamentos) bate com o tamanho gerado.
  const d = g.deslocamentosDoTamanho(gola, grade, "GG");
  const nosGG = g.gerarTamanho(gola, grade, "GG").peca.nos;
  gola.nos.forEach((n, i) => assert.ok(Math.abs(n.x + d[i].dx - nosGG[i].x) < 1e-9 && Math.abs(n.y + d[i].dy - nosGG[i].y) < 1e-9, `nó ${i}`));
  // Girar a peça 90° troca largura e altura do salto.
  const girada = g.graduacaoGirada({ jeito: "medida", porcentagem: 0, regras: [], medida: { largura: 0, altura: 2 } }, 90);
  assert.deepEqual(girada.medida, { largura: 2, altura: 0 });
  assert.deepEqual(g.graduacaoGirada(girada, 180).medida, { largura: 2, altura: 0 });
  // A porcentagem de antes continua gerando igual.
  const pct = g.gerarTamanho({ ...pecaBase({ jeito: "porcentagem", porcentagem: 10, regras: [] }), nos: ret(10, 10) }, grade, "G");
  assert.ok(Math.abs(caixa(pct.peca.nos).w - 11) < 1e-9, "10% por tamanho no G");
}

console.log("OK — a graduação confere.");
