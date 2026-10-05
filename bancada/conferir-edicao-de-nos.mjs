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

// 17. Puxar a curva: o ponto em t vai EXATAMENTE para o ponteiro; as pontas ficam; a ponta suave continua lisa; o canto não mexe na outra alça.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: -3, y: 1 }, saida: { x: 3, y: -1 } },
    { x: 10, y: 0, entrada: { x: 7, y: -1 }, saida: { x: 13, y: 1 }, canto: true },
    { x: 5, y: 8, entrada: { x: 8, y: 8 }, saida: { x: 2, y: 8 } },
  ];
  for (const t of [0.1, 0.3, 0.5, 0.8]) {
    const alvo = { x: 4, y: -5 };
    const r = m.puxarTrecho(nos, 0, t, alvo);
    assert.ok(perto(m.pontoNoTrecho(r, 0, t), alvo, 1e-9), `t=${t}: o ponto pego foi para ${JSON.stringify(m.pontoNoTrecho(r, 0, t))}`);
    assert.ok(perto(r[0], nos[0]) && perto(r[1], nos[1]), "as pontas ficam");
    const e = r[0].entrada;
    const s = r[0].saida;
    assert.ok(Math.abs(e.x * s.y - e.y * s.x) < 1e-9 && e.x * s.x + e.y * s.y < 0, "a ponta suave continua lisa");
    assert.ok(Math.abs(Math.hypot(e.x, e.y) - Math.hypot(3, 1)) < 1e-9, "a alça do outro lado mantém o tamanho");
    assert.ok(perto(r[1].saida, nos[1].saida), "o canto não mexe na outra alça");
  }
  assert.equal(m.puxarTrecho(quadrado, 0, 0.5, { x: 5, y: 3 }), null, "trecho reto não entorta");
}

// 18. Converter: em linha endireita e as alças desabam, com os nós no lugar; em curva, alças a um terço — o desenho não muda.
{
  const curvo = [
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: 4 }, canto: true },
    { x: 10, y: 0, entrada: { x: 7, y: 4 }, saida: { x: 10, y: 0 }, canto: true, retaDepois: true },
    reto(5, -8),
  ];
  const linha = m.converterTrechos(curvo, [0], "linha");
  assert.equal(linha[0].retaDepois, true);
  assert.ok(perto(linha[0].saida, { x: 0, y: 0 }) && perto(linha[1].entrada, { x: 10, y: 0 }));
  assert.ok(perto(linha[0], curvo[0]) && perto(linha[1], curvo[1]), "os nós ficam");
  const volta = m.converterTrechos(linha, [0], "curva");
  assert.equal(volta[0].retaDepois, false);
  assert.ok(perto(m.pontoNoTrecho(volta, 0, 0.37), { x: 3.7, y: 0 }, 1e-9), "a curva nasce igual à reta");
  assert.deepEqual(m.converterTrechos(curvo, [1], "linha"), curvo, "trecho já reto: nada muda");
}

// 19. Um nó no meio de cada trecho escolhido, sem mudar o desenho; o do trecho que fecha a volta vai para o fim.
{
  const r = m.porNosNoTraco(octogono, [{ no: 0, t: 0.5 }, { no: 7, t: 0.5 }]);
  assert.equal(r.length, 10);
  assert.ok(perto(r[1], { x: (octogono[0].x + octogono[1].x) / 2, y: (octogono[0].y + octogono[1].y) / 2 }));
  assert.ok(perto(r[9], { x: (octogono[7].x + octogono[0].x) / 2, y: (octogono[7].y + octogono[0].y) / 2 }));
}

// Um arco de 5 nós (4 trechos de 45°, raio 100) por cima, fechado por duas retas.
const arco = (() => {
  const h = (4 / 3) * Math.tan(Math.PI / 16) * 100;
  const nos = Array.from({ length: 5 }, (_, k) => {
    const a = Math.PI - (k / 4) * Math.PI;
    const p = { x: 100 * Math.cos(a), y: -100 * Math.sin(a) };
    const tg = { x: Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  nos[4] = { ...nos[4], retaDepois: true, saida: { x: nos[4].x, y: nos[4].y } };
  return [...nos, reto(0, 60)];
})();

// 20. Apagar os três do meio do arco: sobra UMA cúbica que segue o arco, com a tangente de antes nas pontas.
{
  const r = m.apagarNos(arco, [1, 2, 3]);
  assert.ok(!r.erro, r.erro);
  assert.equal(r.nos.length, 3);
  assert.deepEqual(r.mapa, [0, null, null, null, 1, 2]);
  assert.deepEqual(r.trechos, [{ velhos: [0, 1, 2, 3], novos: [0] }]);
  assert.equal(r.nos[0].retaDepois, false);
  assert.ok(perto(r.nos[0], arco[0]) && perto(r.nos[1], arco[4]), "os nós que ficam não andam");
  let maior = 0;
  for (let k = 0; k <= 50; k++) {
    const q = m.pontoNoTrecho(r.nos, 0, k / 50);
    maior = Math.max(maior, Math.abs(Math.hypot(q.x, q.y) - 100));
  }
  // Uma cúbica só não é um meio círculo: com as tangentes presas nas pontas, fica a uns 3% do raio.
  assert.ok(maior < 4, `a cúbica se afastou ${maior.toFixed(2)} do arco`);
  const meio = m.pontoNoTrecho(r.nos, 0, 0.5);
  assert.ok(Math.abs(meio.x) < 1e-6 && meio.y < -95, `o meio foi para ${JSON.stringify(meio)}`);
  const s = r.nos[0].saida;
  assert.ok(Math.abs(s.x - arco[0].x) < 1e-9 && s.y < arco[0].y, "sai do nó 0 para cima, como antes");
}

// 21. Apagar entre retas deixa reta; pela volta do 0; nunca menos de três nós.
{
  const r = m.apagarNos(octogono, [7, 0]);
  assert.equal(r.nos.length, 6);
  assert.deepEqual(r.trechos, [{ velhos: [6, 7, 0], novos: [5] }]);
  assert.equal(r.nos[5].retaDepois, true, "reta com reta continua reta");
  assert.ok(m.apagarNos(octogono, [0, 1, 2, 3, 4, 5]).erro);
}

// Um círculo de raio 100 em 40 nós suaves (cada trecho, um arco de 9°), com um canto no nó 10.
const circulo = (() => {
  const N = 40;
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * 100;
  const nos = Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const p = { x: 100 * Math.cos(a), y: 100 * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  nos[10] = { ...nos[10], canto: true };
  return nos;
})();

// 22. Reduzir a peça inteira: bem menos nós, o traço dentro da folga, o canto fica, e a mesma folga dá o mesmo resultado.
{
  const r = m.reduzirNos(circulo, null, 0.5);
  assert.ok(!r.erro, r.erro);
  assert.equal(r.antes, 40);
  assert.ok(r.depois <= 8, `sobraram ${r.depois} nós`);
  assert.ok(r.nos.some((n) => perto(n, circulo[10]) && n.canto), "o canto ficou");
  let maior = 0;
  for (let i = 0; i < r.nos.length; i++) {
    for (let k = 0; k <= 32; k++) {
      const q = m.pontoNoTrecho(r.nos, i, k / 32);
      maior = Math.max(maior, Math.abs(Math.hypot(q.x, q.y) - 100));
    }
  }
  assert.ok(maior <= 0.52, `o traço se afastou ${maior.toFixed(3)} (a folga é 0,5)`);
  assert.deepEqual(m.reduzirNos(circulo, null, 0.5), r, "não acumula: o mesmo desenho e a mesma folga dão o mesmo");
  assert.ok(m.reduzirNos(circulo, null, 1e-6).erro, "folga pequena demais: nada a tirar");
}

// 23. Reduzir só a seleção: os de fora ficam, e a âncora extra (a regra da graduação) também.
{
  const r = m.reduzirNos(circulo, [20, 21, 22, 23, 24, 25, 26], 0.5, [23]);
  assert.ok(!r.erro, r.erro);
  for (let i = 0; i < 40; i++) if (i < 20 || i > 26) assert.notEqual(r.mapa[i], null, `o nó ${i} estava fora da seleção`);
  assert.notEqual(r.mapa[23], null, "a âncora extra fica");
  assert.ok(r.depois < 40);
}

// 24. Girar 4× 90° volta ao começo; 90° gira no sentido do relógio da tela (y para baixo).
{
  const centro = { x: 10, y: 20 };
  let r = octogono;
  for (let k = 0; k < 4; k++) r = m.girarNos(r, 90, centro);
  r.forEach((n, i) => assert.ok(perto(n, octogono[i], 1e-9)));
  assert.ok(perto(m.girarNos([reto(20, 20)], 90, centro)[0], { x: 10, y: 30 }, 1e-9));
}

// 25. Peça grande com ruído de foto (±0,3 em 400 nós): o controle refaz a conta a cada movimento, então
//     ela tem de ser rápida; e a curva nova passa pelo meio do ruído, sem passar da folga.
{
  const N = 400;
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * 100;
  const ruido = Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const r = 100 + (k % 2 ? 0.3 : -0.3);
    const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  const t0 = performance.now();
  const r = m.reduzirNos(ruido, null, 1);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `levou ${ms.toFixed(0)} ms`);
  assert.ok(!r.erro && r.depois <= 12, `sobraram ${r.depois}`);
  let maior = 0;
  for (let i = 0; i < r.nos.length; i++) {
    for (let k = 0; k <= 16; k++) {
      const q = m.pontoNoTrecho(r.nos, i, k / 16);
      maior = Math.max(maior, Math.abs(Math.hypot(q.x, q.y) - 100));
    }
  }
  assert.ok(maior <= 1.3, `afastou ${maior.toFixed(2)} do círculo (ruído 0,3 + folga 1)`);
}

/*
 * ---------------------------------------------------------------------------
 * O NÓ LISO AUTOMÁTICO (spec de 2026-10-05, curvas fáceis da Montagem)
 * ---------------------------------------------------------------------------
 */
const roda = (N = 8, R = 10) => {
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * R;
  return Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const p = { x: R * Math.cos(a), y: R * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
};
/** O ângulo entre a alça que entra e a que sai (0 = liso). */
const quebra = (no) => {
  const e = { x: no.x - no.entrada.x, y: no.y - no.entrada.y };
  const s = { x: no.saida.x - no.x, y: no.saida.y - no.y };
  if (Math.hypot(e.x, e.y) < 1e-12 || Math.hypot(s.x, s.y) < 1e-12) return 0;
  return Math.abs(Math.atan2(e.x * s.y - e.y * s.x, e.x * s.x + e.y * s.y));
};
const semNaN = (nos) => nos.every((n) => [n.x, n.y, n.entrada.x, n.entrada.y, n.saida.x, n.saida.y].every(Number.isFinite));
const auto1 = { antes: 1, depois: 1, giro: 0 };

// 30. A regra: entre duas curvas, direção = bissetriz, tamanho = distância ÷ 3 × abertura.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 0, y: 0 } },
    { x: 10, y: 0, entrada: { x: 10, y: 0 }, saida: { x: 10, y: 0 }, auto: { antes: 1, depois: 2, giro: 0 } },
    { x: 10, y: 10, entrada: { x: 10, y: 10 }, saida: { x: 10, y: 10 } },
  ];
  const r = m.alcasDoNoAutomatico(nos, 1);
  const d = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  assert.ok(perto(r.entrada, { x: 10 - (d.x * 10) / 3, y: (-d.y * 10) / 3 }, 1e-9), "lado de antes: dist/3");
  assert.ok(perto(r.saida, { x: 10 + (d.x * 20) / 3, y: (d.y * 20) / 3 }, 1e-9), "lado de depois: dist/3 × 2");
}

// 31. Reta antes: a curva sai na direção da reta, sem bico, e o giro não vale.
{
  const nos = [
    reto(0, 0),
    { x: 10, y: 0, entrada: { x: 10, y: 0 }, saida: { x: 12, y: 3 }, auto: { antes: 1, depois: 1, giro: 1 } },
    { x: 15, y: 10, entrada: { x: 15, y: 10 }, saida: { x: 15, y: 10 } },
  ];
  const r = m.alcasDoNoAutomatico(nos, 1);
  assert.ok(perto(r.entrada, { x: 10, y: 0 }), "lado reto não tem alça");
  assert.ok(Math.abs(r.saida.y) < 1e-12 && r.saida.x > 10, "a curva sai na direção da reta");
  // Retas dos dois lados: as alças ficam no nó.
  const q = [reto(0, 0), { ...reto(10, 0), auto: auto1, canto: false }, reto(10, 10)];
  const rq = m.alcasDoNoAutomatico(q, 1);
  assert.ok(perto(rq.entrada, rq) && perto(rq.saida, rq));
}

// 32. O nó liso de hoje vira automático sem mudar o desenho.
{
  const c = roda();
  const r = m.refazerAlcas(m.derivarAuto(c));
  assert.ok(r.every((n) => n.auto), "todos viraram automáticos");
  for (let i = 0; i < c.length; i++) {
    assert.ok(perto(r[i].entrada, c[i].entrada, 1e-6) && perto(r[i].saida, c[i].saida, 1e-6), `nó ${i} mudou`);
  }
}

// 33. O que não pode virar sem mudar o desenho fica como está: canto entre curvas, alças fora de linha.
{
  const c = roda();
  c[2] = { ...c[2], canto: true };
  c[5] = { ...c[5], saida: { x: c[5].saida.x + 1, y: c[5].saida.y } };
  const r = m.derivarAuto(c);
  assert.equal(r[2], c[2]);
  assert.equal(r[5], c[5]);
  assert.ok(!r[2].auto && !r[5].auto);
}

// 34. Junção reta → curva: alça a 1° da reta vira lisa com a reta (o bico some); a 5°, fica quina.
{
  const junta = (graus) => {
    const a = (graus * Math.PI) / 180;
    return [
      reto(0, 0),
      { x: 10, y: 0, entrada: { x: 10, y: 0 }, saida: { x: 10 + 3 * Math.cos(a), y: 3 * Math.sin(a) }, canto: true },
      { x: 20, y: 10, entrada: { x: 17, y: 10 }, saida: { x: 20, y: 10 }, retaDepois: true, canto: true },
      reto(0, 10),
    ];
  };
  const um = m.derivarAuto(junta(1), [1]);
  assert.ok(um[1].auto && !um[1].canto, "a 1°, vira automático");
  assert.ok(Math.abs(um[1].saida.y) < 1e-12, "e a curva sai na direção da reta");
  const cinco = m.derivarAuto(junta(5), [1]);
  assert.ok(!cinco[1].auto && cinco[1].canto, "a 5°, é quina de verdade");
}

// 35. Arrastar um nó liso: ele e os vizinhos continuam sem bico.
{
  const c = m.derivarAuto(roda());
  const r = m.moverNosLisos(c, [2], 3, -2);
  for (const i of [1, 2, 3]) assert.ok(quebra(r[i]) < 1e-9, `nó ${i} ganhou bico`);
  assert.ok(perto(r[2], { x: c[2].x + 3, y: c[2].y - 2 }));
  // Os de longe não mudam.
  assert.equal(r[6], c[6]);
}

// 36. Puxador de um lado: só a abertura daquele lado muda; o ponto continua liso.
{
  const c = m.derivarAuto(roda());
  const no = c[2];
  const s = { x: no.saida.x - no.x, y: no.saida.y - no.y };
  const longe = { x: no.x + s.x * 2, y: no.y + s.y * 2 };
  const r = m.moverPuxador(c, 2, "saida", longe);
  assert.ok(Math.abs(r[2].auto.depois - c[2].auto.depois * 2) < 1e-9, "a saída dobrou de abertura");
  assert.ok(Math.abs(r[2].auto.antes - c[2].auto.antes) < 1e-12, "a entrada não mudou de abertura");
  assert.ok(quebra(r[2]) < 1e-9, "liso");
  // Girar o puxador gira os dois lados juntos.
  const girado = m.moverPuxador(c, 2, "saida", { x: no.saida.x, y: no.saida.y + 1 });
  assert.ok(quebra(girado[2]) < 1e-9, "girou e continuou liso");
  assert.ok(Math.abs(girado[2].auto.giro - c[2].auto.giro) > 1e-3, "o giro mudou");
}

// 37. Puxador num nó preso a uma reta: a direção é a da reta, só a abertura muda.
{
  const nos = m.derivarAuto([
    reto(0, 0),
    { x: 10, y: 0, entrada: { x: 10, y: 0 }, saida: { x: 13, y: 0 }, canto: true },
    { x: 20, y: 10, entrada: { x: 17, y: 10 }, saida: { x: 20, y: 10 }, retaDepois: true, canto: true },
    reto(0, 10),
  ], [1]);
  assert.ok(nos[1].auto, "a junção alinhada virou automática");
  const r = m.moverPuxador(nos, 1, "saida", { x: 16, y: 5 });
  assert.ok(Math.abs(r[1].saida.y) < 1e-12, "continua na direção da reta");
  assert.ok(Math.abs(r[1].saida.x - 16) < 1e-9, "a abertura é a projeção na reta");
}

// 38. Alt no puxador: vira quina, e só aquela alça anda.
{
  const c = m.derivarAuto(roda());
  const r = m.moverPuxador(c, 2, "saida", { x: 0, y: 0 }, { quebrar: true });
  assert.ok(r[2].canto && !r[2].auto);
  assert.ok(perto(r[2].entrada, c[2].entrada), "a entrada ficou");
  assert.ok(perto(r[2].saida, { x: 0, y: 0 }));
}

// 39. Voltar o lado ao natural, e o automático dos dois lados.
{
  const c = m.derivarAuto(roda());
  const puxado = m.moverPuxador(c, 2, "saida", { x: 30, y: 30 });
  const lado = m.voltarLado(puxado, 2, "saida");
  assert.equal(lado[2].auto.depois, 1);
  assert.equal(lado[2].auto.giro, 0);
  const tudo = m.voltarAoAuto(puxado, [2]);
  assert.deepEqual(tudo[2].auto, auto1);
}

// 40. L e Q: quina vira liso (com abertura 1); liso vira quina com as alças no lugar.
{
  const c = roda();
  c[3] = { ...c[3], canto: true, saida: { x: c[3].x, y: c[3].y + 4 } };
  const liso = m.tornarLiso(c, [3]);
  assert.ok(liso[3].auto && !liso[3].canto && quebra(liso[3]) < 1e-9);
  const quina = m.tornarQuina(liso, [3]);
  assert.ok(quina[3].canto && !quina[3].auto);
  assert.ok(perto(quina[3].saida, liso[3].saida));
}

// 41. Puxar a curva no meio do trecho: as pontas lisas continuam lisas.
{
  const c = m.derivarAuto(roda());
  const meio = m.pontoNoTrecho(c, 1, 0.5);
  const r = m.puxarTrechoLiso(c, 1, 0.5, { x: meio.x + 2, y: meio.y + 2 });
  assert.ok(r, "puxou");
  assert.ok(quebra(r[1]) < 1e-9 && quebra(r[2]) < 1e-9, "sem bico nas pontas");
  assert.ok(r[1].auto && r[2].auto);
}

// 42. Vizinho em cima do nó, e nó que volta para trás: nada de NaN.
{
  const em = m.refazerAlcas([
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 0, y: 0 }, auto: auto1 },
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 0, y: 0 }, auto: auto1 },
    { x: 10, y: 0, entrada: { x: 10, y: 0 }, saida: { x: 10, y: 0 }, auto: auto1 },
  ]);
  assert.ok(semNaN(em), "vizinho em cima");
  const volta = m.refazerAlcas([
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 0, y: 0 }, auto: auto1 },
    { x: 10, y: 0, entrada: { x: 10, y: 0 }, saida: { x: 10, y: 0 }, auto: auto1 },
    { x: 0, y: 0.000001, entrada: { x: 0, y: 0 }, saida: { x: 0, y: 0 }, auto: auto1 },
  ]);
  assert.ok(semNaN(volta), "volta para trás");
  // auto estragado: os números são presos, e a conta não vira NaN.
  const estragado = m.refazerAlcas([
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 0, y: 0 } },
    { x: 10, y: 0, entrada: { x: 10, y: 0 }, saida: { x: 10, y: 0 }, auto: { antes: "x", depois: 1e9, giro: NaN } },
    { x: 10, y: 10, entrada: { x: 10, y: 10 }, saida: { x: 10, y: 10 } },
  ]);
  assert.ok(semNaN(estragado), "auto estragado");
}

// 43. Peça de 3 nós automáticos e o quadrado de retas.
{
  const tres = m.refazerAlcas(roda(3).map((n) => ({ ...n, auto: auto1 })));
  assert.ok(semNaN(tres) && tres.every((n) => quebra(n) < 1e-9));
  assert.deepEqual(m.refazerAlcas(quadrado), quadrado, "o quadrado sem automático não muda");
  assert.deepEqual(m.derivarAuto(quadrado), quadrado, "retas dos dois lados não viram automático");
}

// 44. Pôr nó numa curva de automáticos: o desenho não muda, e o nó novo é automático.
{
  const c = m.derivarAuto(roda());
  const antes = [0.1, 0.3, 0.6, 0.9].map((t) => m.pontoNoTrecho(c, 3, t));
  const r = m.inserirNoNoTraco(c, 3, 0.5);
  assert.ok(r[4].auto, "o nó novo é automático");
  assert.ok(perto(m.pontoNoTrecho(r, 3, 0.2), antes[0], 1e-9));
  assert.ok(perto(m.pontoNoTrecho(r, 4, 0.2), antes[2], 1e-9));
  assert.ok(r.every((n) => !n.auto || quebra(n) < 1e-9));
  // E as alças de quem é automático batem com os números.
  const refeito = m.refazerAlcas(r);
  for (let i = 0; i < r.length; i++) {
    assert.ok(perto(refeito[i].saida, r[i].saida, 1e-9) && perto(refeito[i].entrada, r[i].entrada, 1e-9), `nó ${i}`);
  }
}

// 45. Apagar e clonar levam o automático junto, coerente com as alças.
{
  const c = m.derivarAuto(roda());
  const ap = m.apagarNos(c, [3]);
  const refeito = m.refazerAlcas(ap.nos);
  for (let i = 0; i < ap.nos.length; i++) {
    assert.ok(perto(refeito[i].saida, ap.nos[i].saida, 1e-9) && perto(refeito[i].entrada, ap.nos[i].entrada, 1e-9), `apagar: nó ${i}`);
  }
  assert.deepEqual(m.clonarNos(c)[1].auto, c[1].auto);
}

console.log("OK — as contas de edição de nós conferem.");
