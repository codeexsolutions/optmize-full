#!/usr/bin/env node
/**
 * Confere o contorno exato do sparrow (P7) — `contornoExato`, em
 * src/motores/encaixeEncolher.js — e a trava que lê os trechos de cada coluna.
 *
 * Para cada peça da bancada, com giro livre:
 *
 *   simples    o polígono não cruza nem encosta em si mesmo;
 *   cobre      girado e transladado do jeito do sparrow, ele cobre TODA célula
 *              da peça exata (os trechos de cada coluna) nos quatro giros —
 *              é o que garante que o sparrow nunca ponha uma peça em cima de
 *              um pedaço de outra;
 *   ganho      quanto de área o contorno exato tira do casco em escada;
 *   trava      duas peças com cava, uma morando no vazio da coluna da outra:
 *              a trava de antes acusaria, a de agora não; e a mesma peça um
 *              pouco mais para dentro, encostando de verdade, ela acusa.
 *
 *   node bancada/conferir-contorno-exato.js
 */

const { carregarMotor } = require("./motor");
const { CATALOGO, prepararPeca } = require("./pecas");

const PASSO = 0.2;
const RAIO = 1;
const GIROS = [0, 90, 180, 270];
const falhas = [];

function transformar(pontos, graus, [tx, ty]) {
  const k = ((Math.round(graus / 90) % 4) + 4) % 4;
  const cos = [1, 0, -1, 0][k];
  const sen = [0, 1, 0, -1][k];
  return pontos.map(([x, y]) => [cos * x - sen * y + tx, sen * x + cos * y + ty]);
}

function dentro([px, py], poligono) {
  let d = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

function area(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function simples(p) {
  // Polígono ortogonal: basta que nenhum vértice se repita e nenhuma aresta
  // cruze outra que não seja vizinha.
  const vistos = new Set();
  for (const [x, y] of p) {
    const k = `${x},${y}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
  }
  const n = p.length;
  const lado = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if ((j + 1) % n === i) continue;
      const c = p[j], d = p[(j + 1) % n];
      const l1 = lado(a, b, c), l2 = lado(a, b, d), l3 = lado(c, d, a), l4 = lado(c, d, b);
      if (l1 * l2 < 0 && l3 * l4 < 0) return false;
    }
  }
  return true;
}

function trechos(m, c) {
  if (!m.faixas) return m.topo[c] < 0 ? [] : [[m.topo[c], m.base[c]]];
  const lista = [];
  for (let k = m.faixas.ini[c]; k < m.faixas.ini[c + 1]; k++) lista.push([m.faixas.de[k], m.faixas.ate[k]]);
  return lista;
}

function celulasDoCasco(m) {
  let n = 0;
  for (let c = 0; c < m.cols; c++) if (m.topo[c] >= 0) n += m.base[c] - m.topo[c] + 1;
  return n;
}

async function main() {
  const motor = await carregarMotor({ comWasm: false });
  let celulas = 0;
  console.log("peça                     vértices  casco(cél)  exato(cél)  polígono  ganho×casco  giros no sparrow");
  for (const nome of Object.keys(CATALOGO)) {
    const peca = prepararPeca(motor, nome, { passo: PASSO, raio: RAIO, giro: "livre", qtd: 1 });
    const m0 = peca.mascaras.rotacoes[0];
    const forma = motor.contornoExato(m0);
    const tipo = motor.tiposDoEncaixe([{ indice: 0, copia: 1, giro: "livre", mascaras: peca.mascaras }])[0];
    if (!forma) {
      console.log(`${nome.padEnd(24)} (partes soltas: fica o casco em escada) giros ${tipo.rotacoes.join(",")}`);
      continue;
    }
    if (!simples(forma)) falhas.push(`${nome}: o contorno não é simples`);

    let exatas = 0;
    for (let c = 0; c < m0.cols; c++) for (const [de, ate] of trechos(m0, c)) exatas += ate - de + 1;

    for (const rot of GIROS) {
      const m = peca.mascaras.rotacoes[rot];
      if (!m) continue;
      const col = 7, lin = 11;
      const t = motor.transformacaoDoSparrow(rot, col, lin, m0.rows, m0.cols);
      const poligono = transformar(forma, t.rotation, t.translation);
      let erradas = 0;
      for (let c = 0; c < m.cols; c++) {
        for (const [de, ate] of trechos(m, c)) {
          for (let r = de; r <= ate; r++) {
            celulas++;
            if (!dentro([lin + r + 0.5, col + c + 0.5], poligono)) erradas++;
          }
        }
      }
      if (erradas > 0) falhas.push(`${nome}: girada ${rot}°, ${erradas} célula(s) da peça fora do contorno`);
    }

    const casco = celulasDoCasco(m0);
    const poli = area(forma);
    console.log(`${nome.padEnd(24)} ${String(forma.length).padStart(8)}  ${String(casco).padStart(10)}  ${String(exatas).padStart(10)}`
      + `  ${String(Math.round(poli)).padStart(8)}  ${(((casco - poli) / casco) * 100).toFixed(1).padStart(10)}%  ${tipo.rotacoes.join(",")}`);
  }

  // A trava com trechos: monta duas máscaras em "U" de mão, uma dentro da
  // outra, sem e com encosto.
  const u = () => {
    // 5 colunas, 5 linhas: colunas 0 e 4 cheias, 1..3 só a linha 4 (o fundo do U).
    const cols = 5, rows = 5;
    const topo = Int32Array.from([0, 4, 4, 4, 0]);
    const base = Int32Array.from([4, 4, 4, 4, 4]);
    return { cols, rows, topo, base, faixas: null, offX: 0, offY: 0 };
  };
  const barra = { cols: 1, rows: 3, topo: Int32Array.from([0]), base: Int32Array.from([2]), faixas: null, offX: 0, offY: 0 };
  const pos = (m, x, y) => ({ item: { nome: "p" }, x, y, rot: 0, mascara: m, passo: 1, largura: m.cols, altura: m.rows });
  // A barra mora no vão do U (coluna 2, linhas 0..2): limpo.
  const limpo = motor.acharSobreposicao([pos(u(), 0, 0), pos(barra, 2, 0)]);
  if (limpo.pares !== 0) falhas.push(`trava: a barra no vão do U foi acusada (${limpo.pares})`);
  // Uma linha mais para baixo, ela encosta no fundo do U (linha 4... a barra vai a 1..3; a 2..4 cruza).
  const cruza = motor.acharSobreposicao([pos(u(), 0, 0), pos(barra, 2, 2)]);
  if (cruza.pares !== 1) falhas.push(`trava: a barra em cima do fundo do U não foi acusada`);
  // Com trechos de verdade: uma peça com coluna de dois trechos.
  const comVazio = {
    cols: 1, rows: 5, topo: Int32Array.from([0]), base: Int32Array.from([4]), offX: 0, offY: 0,
    faixas: { ini: Int32Array.from([0, 2]), de: Int32Array.from([0, 4]), ate: Int32Array.from([0, 4]) },
  };
  const ponto = { cols: 1, rows: 1, topo: Int32Array.from([0]), base: Int32Array.from([0]), faixas: null, offX: 0, offY: 0 };
  const noVao = motor.acharSobreposicao([pos(comVazio, 0, 0), pos(ponto, 0, 2)]);
  if (noVao.pares !== 0) falhas.push(`trava: peça no vazio da coluna foi acusada`);
  const noCheio = motor.acharSobreposicao([pos(comVazio, 0, 0), pos(ponto, 0, 4)]);
  if (noCheio.pares !== 1) falhas.push(`trava: peça no trecho cheio da coluna não foi acusada`);

  console.log(`\n${celulas} células conferidas nos quatro giros.`);
  if (falhas.length) {
    console.log(`\nFALHOU (${falhas.length}):\n  ${falhas.join("\n  ")}`);
    process.exit(1);
  }
  console.log("OK — o contorno exato cobre a peça nos quatro giros, e a trava confere trecho a trecho.");
}

main().catch((e) => { console.error(e); process.exit(1); });
