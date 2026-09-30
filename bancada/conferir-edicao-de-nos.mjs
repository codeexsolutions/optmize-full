/*
 * BANCADA — as contas de mexer num risco de nós com alça
 *
 *     npm run bancada:nos
 *
 * Saíram do Digitalizar quando a Montagem passou a editar o mesmo risco. O que
 * mais importa aqui é o "pôr nó no traço não muda o desenho": se mudasse, cada
 * nó novo entortaria a peça um pouco, e a pessoa só veria no tecido.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const m = await carregarModulo("src/motores/edicaoDeNos.js");
const perto = (a, b, tol = 1e-9) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
const reto = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });

// Um quadrado de retas.
const quadrado = [reto(0, 0), reto(10, 0), reto(10, 10), reto(0, 10)];

// 1. Pôr nó numa reta: cai em cima dela, e as duas metades continuam retas.
{
  const r = m.inserirNoNoTraco(quadrado, 0, 0.5);
  assert.equal(r.length, 5);
  assert.ok(perto(r[1], { x: 5, y: 0 }));
  assert.ok(r.every((n) => n.retaDepois), "partir reta não inventa curva");
  assert.equal(quadrado.length, 4, "não mexe na lista recebida");
}

// 2. Pôr nó numa curva não muda o desenho.
{
  const a = { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: 8 }, retaDepois: false };
  const b = { x: 10, y: 0, entrada: { x: 7, y: 8 }, saida: { x: 10, y: 0 }, retaDepois: true };
  const c = reto(5, -5);
  const nos = [a, b, c];
  const antes15 = m.pontoNoTrecho(nos, 0, 0.15);
  const antes65 = m.pontoNoTrecho(nos, 0, 0.65);
  const r = m.inserirNoNoTraco(nos, 0, 0.3);
  assert.ok(perto(m.pontoNoTrecho(r, 0, 0.5), antes15, 1e-9), "primeira metade igual");
  assert.ok(perto(m.pontoNoTrecho(r, 1, 0.5), antes65, 1e-9), "segunda metade igual");
}

// 3. Pôr nó no ÚLTIMO trecho (o que fecha a volta).
{
  const r = m.inserirNoNoTraco(quadrado, 3, 0.5);
  assert.equal(r.length, 5);
  assert.ok(perto(r[4], { x: 0, y: 5 }));
}

// 4. Apagar: piso de três nós.
assert.equal(m.apagarNo([reto(0, 0), reto(1, 0), reto(0, 1)], 0), null);
assert.equal(m.apagarNo(quadrado, 1).length, 3);

// 5. Mover o nó leva as alças junto.
{
  const curvo = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  const r = m.moverPega(curvo, { no: 0, parte: "no" }, { x: 2, y: 3 });
  assert.ok(perto(r[0].entrada, { x: 1, y: 3 }));
  assert.ok(perto(r[0].saida, { x: 3, y: 3 }));
}

// 6. A alça segue o tipo do nó: suave gira a outra e mantém o tamanho; simétrico espelha; canto não mexe na outra.
{
  const liso = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  assert.equal(m.tipoDoNo(liso[0]), "suave", "nó sem o campo é suave");
  const r = m.moverPega(liso, { no: 0, parte: "entrada" }, { x: -2, y: 1 });
  assert.ok(perto(r[0].saida, { x: 2 / Math.sqrt(5), y: -1 / Math.sqrt(5) }), "suave: gira e fica com o tamanho 1");
  const simetrico = [{ ...liso[0], simetrico: true }, liso[1], liso[2]];
  assert.ok(perto(m.moverPega(simetrico, { no: 0, parte: "entrada" }, { x: -2, y: 1 })[0].saida, { x: 2, y: -1 }), "simétrico: espelho");
  const canto = [{ ...liso[0], canto: true }, liso[1], liso[2]];
  assert.ok(perto(m.moverPega(canto, { no: 0, parte: "entrada" }, { x: -2, y: 1 })[0].saida, { x: 1, y: 0 }), "canto: a outra fica");
}

// 7. Reta vira curva com alças a um terço, e volta.
{
  const r = m.alternarLado(quadrado, 0, "depois");
  assert.equal(r[0].retaDepois, false);
  assert.ok(perto(r[0].saida, { x: 10 / 3, y: 0 }));
  assert.ok(perto(r[1].entrada, { x: 20 / 3, y: 0 }));
  const volta = m.alternarLado(r, 1, "antes");
  assert.equal(volta[0].retaDepois, true);
}

// 8. O que está sob o ponteiro: alça do nó ativo antes do nó.
{
  const nos = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  assert.equal(m.pegaSob(nos, { x: 1, y: 0.1 }, 0.5, 0).parte, "saida");
  assert.equal(m.pegaSob(nos, { x: 1, y: 0.1 }, 0.5, null), null, "sem nó ativo, alça não pega");
  assert.equal(m.pegaSob(nos, { x: 10.2, y: 0 }, 0.5, null).no, 1);
  const t = m.tracoSob(quadrado, { x: 4, y: 0.2 }, 0.5);
  assert.equal(t.no, 0);
  assert.ok(Math.abs(t.t - 0.4) < 0.07);
}

// 9. Mudar o tipo: suave alinha e mantém os tamanhos; simétrico iguala; entre reta e curva, a direção da reta; canto só marca.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: 0 }, canto: true },
    { x: 10, y: 0, entrada: { x: 8, y: 0 }, saida: { x: 10, y: 4 }, canto: true },
    { x: 10, y: 10, entrada: { x: 10, y: 7 }, saida: { x: 10, y: 10 }, canto: true, retaDepois: true },
  ];
  const s = m.mudarTipoDosNos(nos, [1], "suave")[1];
  const e = { x: s.entrada.x - 10, y: s.entrada.y };
  const d = { x: s.saida.x - 10, y: s.saida.y };
  assert.ok(Math.abs(e.x * d.y - e.y * d.x) < 1e-9 && e.x * d.x + e.y * d.y < 0, "suave: as duas na mesma reta, em lados opostos");
  assert.ok(Math.abs(Math.hypot(e.x, e.y) - 2) < 1e-9 && Math.abs(Math.hypot(d.x, d.y) - 4) < 1e-9, "suave: cada uma com o seu tamanho");
  assert.equal(m.tipoDoNo(s), "suave");
  const q = m.mudarTipoDosNos(nos, [1], "simetrico")[1];
  assert.ok(Math.abs(Math.hypot(q.entrada.x - 10, q.entrada.y) - 3) < 1e-9 && Math.abs(Math.hypot(q.saida.x - 10, q.saida.y) - 3) < 1e-9, "simétrico: as duas com a média, 3");
  assert.equal(m.tipoDoNo(q), "simetrico");
  // O nó 2 recebe curva (do 1) e sai reta (para o 0): a alça da curva vai para a direção da reta.
  const r = m.mudarTipoDosNos(nos, [2], "suave")[2];
  assert.ok(perto(r.entrada, { x: 10 + 3 / Math.SQRT2, y: 10 + 3 / Math.SQRT2 }), JSON.stringify(r.entrada));
  assert.ok(perto(r.saida, { x: 10, y: 10 }), "o lado reto fica sem alça");
  const c = m.mudarTipoDosNos(nos, [1], "canto")[1];
  assert.ok(c.canto && perto(c.entrada, nos[1].entrada) && perto(c.saida, nos[1].saida), "canto só marca");
  assert.equal("simetrico" in m.mudarTipoDosNos([q, nos[0], nos[2]], [0], "suave")[0], false, "voltar a suave tira o campo");
  assert.equal(m.clonarNos([q])[0].simetrico, true, "clonar leva o tipo");
}

const octogono = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * 2 * Math.PI;
  return reto(Math.round(100 * Math.cos(a)), Math.round(100 * Math.sin(a)));
});

// 10. Sequências: a que passa pelo nó 0 é UMA só.
{
  const s = m.sequenciasDe([7, 0, 1, 4], 8);
  assert.equal(s.length, 2);
  assert.ok(s.some((q) => q.join() === "7,0,1"), `sequências ${JSON.stringify(s)}`);
  assert.ok(s.some((q) => q.join() === "4"));
  assert.deepEqual(m.sequenciasDe([0, 1, 2, 3], 4), [[0, 1, 2, 3]]);
}

// 11. Mover em grupo leva nó e alças, só dos escolhidos, sem mexer na lista recebida.
{
  const r = m.moverNos(octogono, [1, 2], 5, -3);
  assert.ok(perto(r[1], { x: octogono[1].x + 5, y: octogono[1].y - 3 }));
  assert.ok(perto(r[1].saida, { x: octogono[1].saida.x + 5, y: octogono[1].saida.y - 3 }));
  assert.ok(perto(r[3], octogono[3]));
  assert.ok(perto(octogono[1], reto(71, 71)), "a lista recebida não muda");
}

// 12. O retângulo de seleção, com os cantos em qualquer ordem.
assert.deepEqual(m.nosNoRetangulo(octogono, { x: 110, y: 80 }, { x: 50, y: -10 }).sort(), [0, 1]);

// 13. Os trechos da seleção: entre selecionados vizinhos; com um nó só, o que chega nele.
assert.deepEqual(m.trechosDaSelecao(octogono, [1, 2, 3, 6]), [1, 2]);
assert.deepEqual(m.trechosDaSelecao(octogono, [7, 0]), [7], "o trecho do 7 ao 0, pela volta");
assert.deepEqual(m.trechosDaSelecao(octogono, [0]), [7], "um nó só: o trecho que chega nele");

// 14. Alinhar pela referência, com as alças junto; os de fora não mexem.
{
  const r = m.alinharNos(octogono, [1, 2, 3], "horizontal", { x: 0, y: 71 });
  assert.ok([1, 2, 3].every((i) => r[i].y === 71 && r[i].x === octogono[i].x && r[i].saida.y === 71));
  assert.equal(r[0].y, octogono[0].y);
  const v = m.alinharNos(octogono, [0, 1], "vertical", { x: 50, y: 0 });
  assert.ok(v[0].x === 50 && v[1].x === 50 && v[1].entrada.x === 50);
}

// 15. As alças que pegam são as dos selecionados, a mais perto ganha, e alça zerada não rouba o clique do nó.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } },
    { x: 10, y: 0, entrada: { x: 9, y: 0 }, saida: { x: 11, y: 0 } },
    { x: 5, y: 5, entrada: { x: 6, y: 5 }, saida: { x: 4, y: 5 } },
  ];
  assert.equal(m.pegaSob(nos, { x: 9.1, y: 0 }, 0.5, new Set([0, 1])).parte, "entrada");
  assert.equal(m.pegaSob(nos, { x: 9.1, y: 0 }, 0.5, [0]), null, "a alça do 1 não está à mostra");
  const zerada = [{ ...nos[0], entrada: { x: 0, y: 0 } }, nos[1], nos[2]];
  assert.equal(m.pegaSob(zerada, { x: 0, y: 0.05 }, 0.5, [0]).parte, "no", "alça em cima do nó não rouba o clique");
}

// 16. O t do traço sai refinado, sem o degrau de 1/16.
{
  const t = m.tracoSob(quadrado, { x: 4.3, y: 0.2 }, 0.5);
  assert.ok(Math.abs(t.t - 0.43) < 0.005, `t = ${t.t}`);
}

console.log("OK — as contas de edição de nós conferem.");
