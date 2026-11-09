#!/usr/bin/env node
/**
 * ===========================================================================
 * A GEOMETRIA QUE O MOTOR ENXERGA — quanto a grade engorda cada peça, e o
 * menor consumo que a geometria permite
 * ===========================================================================
 *
 * O motor não encaixa polígonos: encaixa a PEGADA da peça na grade. Em cada
 * coluna, a peça ocupa da primeira à última célula da silhueta engordada pela
 * folga (`topo`/`base`, ver `prepararMascara` em encaixeMascara.js — "o
 * encaixe em si trabalha só com topo/base"). O sparrow parte do mesmo contorno
 * em escada (ver encaixeEncolher.js). Então três coisas separam a peça de
 * verdade do que o motor reserva no tecido:
 *
 *   1. a rasterização   toda célula que o contorno toca é peça (borda para fora);
 *   2. o disco da folga  a folga é engordada em células inteiras, com o disco
 *                        que garante a distância entre quadrados (`discoDoRaio`);
 *   3. a pegada          o vão vertical dentro de uma coluna (cava, decote que
 *                        abre para o lado) vira área cheia.
 *
 * Esta auditoria mede as três, peça por peça, nas grades que a produção usa, e
 * monta dois limites inferiores de consumo por trabalho:
 *
 *   LB_area  Σ A(P) / W. Vale sempre (as peças não se sobrepõem).
 *   LB_BM    com a folga s: as engordadas por r = s/2 não se sobrepõem e cabem
 *            em (W + 2r) × (L + 2r). Pela desigualdade de Brunn–Minkowski,
 *            A(P ⊕ D_r) ≥ (√A(P) + r√π)², então
 *              L ≥ Σ (√A(P) + r√π)² / (W + 2r) − 2r.
 *            É um limite PROVADO, não uma estimativa — e frouxo de propósito.
 *
 * E o limite do PRÓPRIO MODELO do motor: as pegadas não se sobrepõem em célula
 * nenhuma, então L ≥ Σ min_giro pegada / colunas do tecido. A diferença entre
 * ele e o LB_BM é o que a representação custa no MELHOR caso.
 *
 * Uso: node bancada/auditar-geometria.js [--json saida.json]
 */
const fs = require("fs");
const { carregarMotor } = require("./motor");
const { CATALOGO } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

const areaPoligono = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
};
const perimetro = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
};
const emCm = (molde) => (molde.blocos || [molde.poligono])
  .map((poly) => poly.map(([x, y]) => [x * molde.largura, y * molde.altura]));

/** A silhueta como o `prepararPeca` da bancada faz, devolvendo também os bits. */
function silhueta(motor, molde, passo) {
  const { cols, rows } = motor.gradeDaPeca(molde, passo);
  const bits = new Uint8Array(cols * rows);
  const ex = molde.largura / (cols * passo);
  const ey = molde.altura / (rows * passo);
  (molde.blocos || [molde.poligono]).forEach((poligono) => {
    const parte = motor.rasterizarPoligono(poligono.map(([x, y]) => [x * ex, y * ey]), cols, rows);
    for (let i = 0; i < bits.length; i++) if (parte[i]) bits[i] = 1;
  });
  return { bits, cols, rows };
}

/** A silhueta engordada pelo disco do motor, contada em células. */
function celulasEngordadas(motor, { bits, cols, rows }, raio) {
  if (raio <= 0) return bits.reduce((s, b) => s + b, 0);
  const disco = motor.discoDoRaio(raio);
  const C = cols + 2 * raio;
  const R = rows + 2 * raio;
  const gordo = new Uint8Array(C * R);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!bits[y * cols + x]) continue;
      for (let dy = -raio; dy <= raio; dy++) {
        const w = disco[Math.abs(dy)];
        const linha = (y + raio + dy) * C;
        for (let dx = -w; dx <= w; dx++) gordo[linha + x + raio + dx] = 1;
      }
    }
  }
  return gordo.reduce((s, b) => s + b, 0);
}

/** A pegada de uma rotação: Σ (base − topo + 1) nas colunas com peça. */
function pegada(m) {
  if (!m) return 0;
  let s = 0;
  for (let c = 0; c < m.cols; c++) if (m.topo[c] >= 0) s += m.base[c] - m.topo[c] + 1;
  return s;
}

const ROTACOES = { fixa: [0], 180: [0, 180], livre: [0, 90, 180, 270] };

function medirPeca(motor, nome, passo, raio, folgaPedida) {
  const molde = CATALOGO[nome];
  const polys = emCm(molde);
  const A = polys.reduce((s, p) => s + areaPoligono(p), 0);
  const per = polys.reduce((s, p) => s + perimetro(p), 0);
  const sil = silhueta(motor, molde, passo);
  const mascaras = motor.mascarasDeSilhueta({ bits: sil.bits, modo: "alfa" }, sil.cols, sil.rows,
    passo, raio, { largura: molde.largura, altura: molde.altura });
  const c2 = passo * passo;
  const r = folgaPedida / 2;
  const pegadas = {};
  [0, 90, 180, 270].forEach((rot) => { pegadas[rot] = pegada(mascaras.rotacoes[rot]) * c2; });
  return {
    nome, largura: molde.largura, altura: molde.altura,
    areaVerdadeira: A,
    perimetro: per,
    areaDaTela: mascaras.areaReal,          // o que entra no aproveitamento mostrado
    areaRaster: sil.bits.reduce((s, b) => s + b, 0) * c2,
    areaEngordada: celulasEngordadas(motor, sil, raio) * c2,
    engordadaIdealBM: (Math.sqrt(A) + r * Math.sqrt(Math.PI)) ** 2,  // limite inferior provado
    engordadaIdealSteiner: A + per * r + Math.PI * r * r,            // estimativa (exata em convexo)
    pegadas,
  };
}

const pct = (a, b) => (b > 0 ? `${((a / b - 1) * 100).toFixed(1)}%` : "—");
const f1 = (v) => v.toFixed(1);

async function principal() {
  const argv = process.argv.slice(2);
  const json = argv[0] === "--json" ? argv[1] : null;
  const motor = await carregarMotor({ comWasm: false });
  const saida = { grade: [], pecas: {}, trabalhos: {} };

  // ---------------------------------------------------------------- 1. a grade
  console.log("\n1. A GRADE: o passo e a folga real para cada largura de tecido e folga pedida\n");
  console.log("largura  folga pedida   passo    raio  folga real   excesso    colunas");
  const larguras = [100, 150, 160, 179, 200, 250, 320];
  const folgas = [0.2, 0.3, 0.4, 0.5, 1.0];
  for (const W of larguras) {
    for (const s of folgas) {
      const g = motor.grade(W, s);
      const linha = { larguraTecido: W, folgaPedida: s, passo: g.passo, raio: g.raio,
        folgaReal: g.folgaReal, colunas: Math.ceil(W / g.passo - 1e-9) };
      saida.grade.push(linha);
      console.log(`${String(W).padStart(5)} cm   ${s.toFixed(1)} cm     ${g.passo.toFixed(4)}  ${String(g.raio).padStart(4)}   `
        + `${g.folgaReal.toFixed(3)} cm   ${pct(g.folgaReal, s).padStart(7)}   ${String(linha.colunas).padStart(6)}`);
    }
  }

  // --------------------------------------------------------------- 2. as peças
  const grades = [
    { rotulo: "179 cm · 4 mm (producao-*)", W: 179, s: 0.4 },
    { rotulo: "160 cm · 10 mm (camiseta+manga+gola...)", W: 160, s: 1.0 },
    { rotulo: "320 cm · 4 mm (rolo largo)", W: 320, s: 0.4 },
  ];
  for (const g of grades) {
    const { passo, raio, folgaReal } = motor.grade(g.W, g.s);
    console.log(`\n2. AS PEÇAS na grade de ${g.rotulo}: passo ${passo.toFixed(4)} cm, raio ${raio}, folga real ${folgaReal.toFixed(3)} cm\n`);
    console.log("peça          A verdade   raster   na tela   engordada  ideal(BM)  ideal(Stn)  pegada 0°  pegada 90°  pegada0/engord.");
    saida.pecas[g.rotulo] = {};
    for (const nome of Object.keys(CATALOGO)) {
      const m = medirPeca(motor, nome, passo, raio, g.s);
      saida.pecas[g.rotulo][nome] = m;
      console.log(`${nome.padEnd(12)} ${f1(m.areaVerdadeira).padStart(9)}  ${pct(m.areaRaster, m.areaVerdadeira).padStart(7)}  `
        + `${pct(m.areaDaTela, m.areaVerdadeira).padStart(7)}  ${pct(m.areaEngordada, m.areaVerdadeira).padStart(9)}  `
        + `${pct(m.engordadaIdealBM, m.areaVerdadeira).padStart(8)}  ${pct(m.engordadaIdealSteiner, m.areaVerdadeira).padStart(9)}  `
        + `${pct(m.pegadas[0], m.areaVerdadeira).padStart(9)}  ${pct(m.pegadas[90], m.areaVerdadeira).padStart(9)}  `
        + `${pct(m.pegadas[0], m.areaEngordada).padStart(9)}`);
    }
  }

  // ------------------------------------------------------ 3. limites inferiores
  console.log("\n3. LIMITES INFERIORES de consumo por trabalho (metros)\n");
  console.log("trabalho               peças   largura folga   LB_area   LB_BM    LB_modelo  (modelo/BM)");
  for (const [nome, t] of Object.entries(TRABALHOS)) {
    const { passo, raio } = motor.grade(t.larguraTecido, t.espaco);
    const r = t.espaco / 2;
    let somaA = 0;
    let somaBM = 0;
    let somaPegada = 0;
    let n = 0;
    const cache = new Map();
    for (const p of t.pecas) {
      if (!cache.has(p.nome)) cache.set(p.nome, medirPeca(motor, p.nome, passo, raio, t.espaco));
      const m = cache.get(p.nome);
      const giros = ROTACOES[p.giro || "180"] || ROTACOES[180];
      const menorPegada = Math.min(...giros.map((rot) => m.pegadas[rot]));
      somaA += p.qtd * m.areaVerdadeira;
      somaBM += p.qtd * m.engordadaIdealBM;
      somaPegada += p.qtd * menorPegada;
      n += p.qtd;
    }
    const W = t.larguraTecido;
    // O rolo do motor tem `raio` células de borda de cada lado, que o engorde
    // pode ocupar, e o consumo desconta o engorde de cima e de baixo (ver
    // `colunasDoTecido` e `consumoDoFundo`, em encaixeMotor.js).
    const colunas = motor.colunasDoTecido({ larguraTecido: W, passo, raio });
    const lbArea = somaA / W;
    const lbBM = Math.max(lbArea, somaBM / (W + 2 * r) - 2 * r);
    const lbModelo = Math.max(0, somaPegada / (colunas * passo) - 2 * raio * passo);
    saida.trabalhos[nome] = { pecas: n, larguraTecido: W, espaco: t.espaco, passo, raio,
      somaArea: somaA, lbArea, lbBM, lbModelo };
    console.log(`${nome.padEnd(22)} ${String(n).padStart(5)}   ${String(W).padStart(4)}   ${t.espaco.toFixed(1)}   `
      + `${(lbArea / 100).toFixed(3)}   ${(lbBM / 100).toFixed(3)}   ${(lbModelo / 100).toFixed(3)}     ${pct(lbModelo, lbBM)}`);
  }

  if (json) {
    fs.writeFileSync(json, JSON.stringify(saida, (k, v) => (v instanceof Int32Array ? undefined : v), 2));
    console.log(`\nguardado em ${json}`);
  }
}

principal().catch((erro) => { console.error(erro); process.exit(1); });
