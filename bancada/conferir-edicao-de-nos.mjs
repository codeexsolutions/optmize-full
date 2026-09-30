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

console.log("OK — as contas de edição de nós conferem.");
