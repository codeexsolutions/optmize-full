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

console.log("OK — a graduação confere.");
