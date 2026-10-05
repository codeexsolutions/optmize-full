/*
 * BANCADA — o leitor de PLT (`src/motores/moldes.js`)
 *
 *     npm run bancada:plt
 *
 * Roda na CI: só arquivos montados aqui. Os PLT reais da Audaces (com os
 * tamanhos do molde graduado) estão na `bancada:plt-graduado`, que é local.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

// `moldes.js` traz o pintor de máscara, que monta um canvas ao carregar.
globalThis.document ??= { createElement: () => ({ getContext: () => ({}) }) };
const m = await carregarModulo("src/motores/moldes.js");

let casos = 0;
const caso = (nome, fn) => { fn(); casos++; console.log(`  ok  ${nome}`); };

caso("o espaço depois do comando não vira um número a mais", () => {
  // A Audaces escreve "PD 1200,13951 1377,13965": o espaço depois do PD virava
  // um 0 na frente, e cada par de coordenadas escorregava uma casa — o x de um
  // ponto virava o y do outro, e o contorno não fechava.
  const c = m.comandosPLT("IN;PU1210,9496PD 1200,13951 1377,13965;");
  const pd = c.find((x) => x.nome === "PD");
  assert.deepEqual(pd.numeros, [1200, 13951, 1377, 13965]);
});

caso("vírgula e espaço separam números, e o sinal fica", () => {
  const c = m.comandosPLT("PA 10, -20 ,30 40;");
  assert.deepEqual(c.find((x) => x.nome === "PA").numeros, [10, -20, 30, 40]);
});

caso("um quadrado com espaço depois do PD fecha a volta", () => {
  const t = m.tracosDoPLT("IN;PU0,0PD 4000,0 4000,4000 0,4000 0,0;");
  assert.ok(!t.erro, t.erro);
  const [linha] = t.linhas;
  const ultimo = linha.pontos[linha.pontos.length - 1];
  assert.deepEqual([linha.pontos[0].x, linha.pontos[0].y], [ultimo.x, ultimo.y], "o traço volta ao começo");
  assert.equal(linha.pontos.length, 5);
});

/*
 * ---------------------------------------------------------------------------
 * O PLT GRADUADO (spec de 2026-10-05, importar o molde graduado)
 * ---------------------------------------------------------------------------
 *
 * O desenho do teste imita o da Audaces: duas peças de forma parecida (um
 * retângulo com um entalhe à esquerda, outro com o entalhe à direita), uma
 * sobre a outra, em 4 tamanhos (+1 cm por tamanho) — e uma peça que não muda de
 * tamanho, e "letras" em traços miúdos.
 */
const g = await carregarModulo("src/motores/pltGraduado.js");
const PLU = 400; // unidades de plotter por cm

/** A peça com o entalhe de um lado, no tamanho k (0 = o menor). */
function entalhada(k, lado) {
  const W = 20 + k, H = 30 + k;
  return lado === "esquerda"
    ? [[0, 0], [W, 0], [W, H], [0, H], [0, H * 0.6], [3, H * 0.5], [0, H * 0.4]]
    : [[0, 0], [W, 0], [W, H * 0.4], [W - 3, H * 0.5], [W, H * 0.6], [W, H], [0, H]];
}
function desenhoGraduado() {
  const pecas = [];
  for (let k = 0; k < 4; k++) pecas.push(entalhada(k, "esquerda"), entalhada(k, "direita"));
  pecas.push([[50, 0], [60, 0], [60, 10], [50, 10]]);
  return pecas;
}
/** Em PD, com o espaço depois do comando que a Audaces escreve. */
function emPD(pecas) {
  let t = "IN;SP1;";
  for (const p of pecas) {
    const pts = [...p, p[0]].map(([x, y]) => `${Math.round(x * PLU)},${Math.round(y * PLU)}`);
    t += `PU${pts[0]};PD ${pts.slice(1).join(" ")};`;
  }
  // As letras: traços de meio centímetro, abertos.
  t += "PU28000,16000;PD 28200,16000 28200,16200;PU28400,16000;PD 28400,16200;";
  return t;
}
/** O mesmo em PE (o HP-GL/2 comprimido): base 64, o sinal no bit de baixo. */
function emPE(pecas) {
  const num = (n) => {
    let v = n >= 0 ? 2 * n : 2 * -n + 1;
    let s = "";
    while (v >= 64) { s += String.fromCharCode(63 + (v % 64)); v = Math.floor(v / 64); }
    return s + String.fromCharCode(191 + v);
  };
  let t = "IN;SP1;PE";
  for (const p of pecas) {
    const pts = [...p, p[0]].map(([x, y]) => [Math.round(x * PLU), Math.round(y * PLU)]);
    t += "<=" + num(pts[0][0]) + num(pts[0][1]);
    for (let i = 1; i < pts.length; i++) t += num(pts[i][0] - pts[i - 1][0]) + num(pts[i][1] - pts[i - 1][1]);
  }
  return t + ";";
}

caso("o PLT graduado: os laços dos tamanhos, sem as letras", () => {
  const r = g.lacosDoPLT(emPD(desenhoGraduado()));
  assert.ok(!r.erro, r.erro);
  assert.equal(r.lacos.length, 9, `achei ${r.lacos.length} laços`);
  const medidas = r.lacos.map((l) => `${l.largura.toFixed(1)}x${l.altura.toFixed(1)}`).sort();
  assert.deepEqual(medidas, ["10.0x10.0", "20.0x30.0", "20.0x30.0", "21.0x31.0", "21.0x31.0", "22.0x32.0", "22.0x32.0", "23.0x33.0", "23.0x33.0"]);
});

caso("o mesmo PLT em PE dá os mesmos laços", () => {
  const pd = g.lacosDoPLT(emPD(desenhoGraduado())).lacos.map((l) => Math.round(l.area)).sort((a, b) => a - b);
  const pe = g.lacosDoPLT(emPE(desenhoGraduado())).lacos.map((l) => Math.round(l.area)).sort((a, b) => a - b);
  assert.deepEqual(pe, pd);
});

caso("sem gabarito: os tamanhos de cada peça, sem trocar as duas sobrepostas", () => {
  const { lacos } = g.lacosDoPLT(emPD(desenhoGraduado()));
  const r = g.agruparTamanhos(lacos);
  assert.equal(r.tamanhos, 4);
  const porTamanho = r.pecas.map((p) => p.lacos.length).sort();
  assert.deepEqual(porTamanho, [1, 4, 4], `as peças saíram com ${porTamanho.join(", ")} tamanhos`);
  for (const p of r.pecas.filter((x) => x.lacos.length === 4)) {
    const areas = p.lacos.map((l) => l.area);
    assert.ok(areas.every((a, i) => i === 0 || a > areas[i - 1]), "do menor para o maior");
    // O entalhe fica do mesmo lado em todos os tamanhos: o ponto mais à direita do entalhe
    // (x = 3 na esquerda; x = W − 3 na direita) diz de que peça é cada laço.
    const lado = (l) => {
      const x0 = Math.min(...l.pontos.map((q) => q.x));
      const meioY = (Math.min(...l.pontos.map((q) => q.y)) + Math.max(...l.pontos.map((q) => q.y))) / 2;
      const noMeio = l.pontos.filter((q) => Math.abs(q.y - meioY) < 0.01);
      return noMeio.some((q) => Math.abs(q.x - x0 - 3) < 0.01) ? "esquerda" : "direita";
    };
    assert.equal(new Set(p.lacos.map(lado)).size, 1, "as duas peças sobrepostas não se misturaram");
  }
});

/*
 * Com o gabarito do `.adsx`: cada (peça, tamanho) pega o laço de mesma largura ×
 * altura. Aqui as costas são 2 cm mais altas que a frente — como nos arquivos
 * reais, em que a medida separa as peças sobrepostas.
 */
function desenhoComCostasMaisAltas() {
  const pecas = [];
  for (let k = 0; k < 4; k++) {
    pecas.push(entalhada(k, "esquerda"));
    pecas.push(entalhada(k, "direita").map(([px, py]) => [px, py * (32 + k) / (30 + k)]));
  }
  pecas.push([[50, 0], [60, 0], [60, 10], [50, 10]]);
  return pecas;
}
const GRADE = ["P", "M", "G", "GG"];
const gabarito = {
  nome: "ARD.TESTE", tamanhos: GRADE, base: "M",
  pecas: [
    { nome: "FRENTE", quantidade: 1, porTamanho: Object.fromEntries(GRADE.map((t, k) => [t, { largura: 20 + k, altura: 30 + k }])) },
    { nome: "COSTAS", quantidade: 1, porTamanho: Object.fromEntries(GRADE.map((t, k) => [t, { largura: 20 + k, altura: 32 + k }])) },
    { nome: "BOLSO", quantidade: 2, porTamanho: Object.fromEntries(GRADE.map((t) => [t, { largura: 10, altura: 10 }])) },
    { nome: "GOLA", quantidade: 1, porTamanho: { M: { largura: 40, altura: 4 } } },
  ],
};

caso("com o gabarito: cada tamanho no seu laço, e a peça que não muda num laço só", () => {
  const { lacos } = g.lacosDoPLT(emPD(desenhoComCostasMaisAltas()));
  const r = g.casarComOGabarito(lacos, gabarito);
  const frente = r.pecas.find((p) => p.nome === "FRENTE");
  const costas = r.pecas.find((p) => p.nome === "COSTAS");
  const bolso = r.pecas.find((p) => p.nome === "BOLSO");
  GRADE.forEach((t, k) => {
    assert.ok(Math.abs(frente.porTamanho[t].altura - (30 + k)) < 0.01, `frente ${t}`);
    assert.ok(Math.abs(costas.porTamanho[t].altura - (32 + k)) < 0.01, `costas ${t}`);
  });
  assert.deepEqual(frente.faltam, []);
  assert.equal(new Set(GRADE.map((t) => bolso.porTamanho[t])).size, 1, "o bolso usa o mesmo laço em todos os tamanhos");
  // A gola não está no PLT: fica de fora, com aviso.
  assert.ok(!r.pecas.some((p) => p.nome === "GOLA"));
  assert.ok(r.avisos.some((a) => a.includes("GOLA")), r.avisos.join(" | "));
  assert.equal(r.semDono.length, 0);
});

caso("o molde para gravar: um grupo por peça, uma linha por tamanho, a grade com o base", () => {
  const { lacos } = g.lacosDoPLT(emPD(desenhoComCostasMaisAltas()));
  const casado = g.casarComOGabarito(lacos, gabarito);
  const molde = g.moldeGraduado({
    nome: "ARD.TESTE",
    tamanhos: GRADE.map((nome) => ({ nome, base: nome === "M" })),
    pecas: casado.pecas,
  });
  assert.equal(molde.situacao, "rascunho");
  assert.deepEqual(molde.tamanhos.map((t) => [t.nome, t.base, t.ordem]), [["P", false, 0], ["M", true, 1], ["G", false, 2], ["GG", false, 3]]);
  assert.equal(molde.pecas.length, 12, "3 peças × 4 tamanhos");
  assert.deepEqual([...new Set(molde.pecas.map((p) => p.grupo))], [0, 1, 2]);
  const frenteGG = molde.pecas.find((p) => p.nome === "FRENTE" && p.tamanho === "GG");
  assert.ok(Math.abs(frenteGG.largura - 23) < 0.01 && Math.abs(frenteGG.altura - 33) < 0.01);
  assert.equal(Math.min(...frenteGG.contorno.map((q) => q.x)), 0, "o contorno começa no canto da caixa");
  assert.equal(frenteGG.nos.length, frenteGG.contorno.length);
  assert.equal(molde.pecas.find((p) => p.nome === "BOLSO").quantidade, 2);
});

caso("sem gabarito: as peças do agrupamento com os nomes da grade", () => {
  const { lacos } = g.lacosDoPLT(emPD(desenhoComCostasMaisAltas()));
  const agrupado = g.agruparTamanhos(lacos);
  const pecas = g.pecasDoAgrupamento(agrupado, GRADE);
  assert.equal(pecas.length, 3);
  const grandes = pecas.filter((p) => new Set(Object.values(p.porTamanho)).size === 4);
  assert.equal(grandes.length, 2, "frente e costas com os 4 tamanhos");
  for (const p of grandes) {
    const areas = GRADE.map((t) => p.porTamanho[t].area);
    assert.ok(areas.every((a, i) => i === 0 || a > areas[i - 1]), "P é o menor, GG o maior");
  }
  const avulsa = pecas.find((p) => new Set(Object.values(p.porTamanho)).size === 1);
  assert.deepEqual(Object.keys(avulsa.porTamanho), GRADE, "a peça que não muda vale para todos");
});

console.log(`\nbancada:plt — ${casos} casos ok`);
