#!/usr/bin/env node
/**
 * ===========================================================================
 * A folga de verdade: a distância entre os CONTORNOS, e não entre as células
 * ===========================================================================
 *
 * Toda conferência de sobreposição da bancada olha a grade: a máscara de uma
 * peça não pode dividir célula com a de outra. É a pergunta certa para "peça
 * em cima de peça" e a errada para "a folga pedida está lá": em 2026-09-25 o
 * `producao-avulsa` passava limpo em todas elas e, medido pelo contorno de
 * verdade, pedia 4 mm e entregava 1,87 mm num degrau de borda inclinada. Duas
 * coisas somavam (ver "A FOLGA É ENTRE QUADRADOS", em encaixeMascara.js):
 *
 *   o disco     no raio 1 era uma cruz, e duas células em diagonal ficavam a
 *               uma célula uma da outra;
 *   a leitura   a célula era peça pelo centro (ou pela média do alfa), e a
 *               arte passava da célula marcada.
 *
 * Esta prova mede o que o corte mede. As peças da bancada nascem de
 * polígonos, então o contorno exato de cada uma é conhecido: depois da busca,
 * cada peça é posta no rolo pelo canto e pelo giro que o motor escolheu, e a
 * menor distância entre dois contornos tem de ser pelo menos a folga pedida.
 *
 * Por partes, antes do encaixe inteiro:
 *
 *   disco        de raio 1 a 20, `D + D` cobre toda diferença de células
 *                cujos quadrados ficariam a menos da folga;
 *   leitura      `rasterizarPoligono` marca toda célula que o polígono toca
 *                (pontos sorteados dentro dele caem sempre em célula marcada),
 *                e `silhuetaDeDados` com sub-amostras marca a célula que tem
 *                uma sub-amostra só;
 *   encaixe      a busca de produção (os quatro encaixadores) em todos os
 *                trabalhos do catálogo, e o sparrow por cima no pedido de
 *                produção.
 *
 *   node bancada/conferir-folga-real.js
 *   node bancada/conferir-folga-real.js --rapido     sem o encaixe
 */

const { carregarMotor } = require("./motor");
const { CATALOGO } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");
const { prepararTrabalho } = require("./corrida");

const falhas = [];
const falhar = (texto) => { falhas.push(texto); };
/** Folga de sobra para o ponto flutuante das contas de distância. */
const EPS = 1e-6;

// ---------- o disco ----------

function conferirDisco(motor) {
  for (let r = 1; r <= 20; r++) {
    const disco = motor.discoDoRaio(r);
    const largura = (dy) => (Math.abs(dy) > r ? -1 : disco[Math.abs(dy)]);
    const lim = 2 * r + 1;
    for (let dx = 0; dx <= lim; dx++) {
      for (let dy = 0; dy <= lim; dy++) {
        const perto = Math.max(0, dx - 1) ** 2 + Math.max(0, dy - 1) ** 2 < 4 * r * r;
        if (!perto) continue;
        let coberto = false;
        for (let a = -r; a <= r && !coberto; a++) {
          const lb = largura(dy - a);
          if (lb >= 0 && dx <= disco[Math.abs(a)] + lb) coberto = true;
        }
        if (!coberto) {
          falhar(`disco de raio ${r}: células a (${dx}, ${dy}) ficam a menos da folga sem os discos se tocarem`);
          return;
        }
      }
    }
  }
}

// ---------- a leitura ----------

function sorteio(semente) {
  let s = semente >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function dentro([px, py], pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i];
    const [xj, yj] = pol[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

function conferirLeitura(motor) {
  // Polígono: as peças do catálogo em grades de vários tamanhos, e pontos
  // sorteados dentro de cada uma.
  const rnd = sorteio(7);
  let pontos = 0;
  for (const [nome, molde] of Object.entries(CATALOGO)) {
    for (const cols of [7, 23, 61]) {
      const rows = Math.max(3, Math.round(cols * (molde.altura / molde.largura)));
      for (const pol of molde.blocos || [molde.poligono]) {
        const bits = motor.rasterizarPoligono(pol, cols, rows);
        for (let k = 0; k < 400; k++) {
          const p = [rnd(), rnd()];
          if (!dentro(p, pol)) continue;
          pontos++;
          const c = Math.min(cols - 1, Math.floor(p[0] * cols));
          const l = Math.min(rows - 1, Math.floor(p[1] * rows));
          if (!bits[l * cols + c]) {
            falhar(`rasterizarPoligono: ${nome} em ${cols}x${rows} deixou vazia a célula (${c}, ${l}), que tem peça`);
            return;
          }
        }
      }
    }
  }

  // Arte: uma célula de fundo transparente com UMA sub-amostra opaca é peça.
  const cols = 10;
  const rows = 10;
  const sub = 4;
  const dados = new Uint8ClampedArray(cols * sub * rows * sub * 4);
  const marcar = (x, y) => { dados[(y * cols * sub + x) * 4 + 3] = 255; };
  for (let y = 8; y < 32; y++) for (let x = 8; x < 32; x++) marcar(x, y); // o miolo
  marcar(3, 20); // uma sub-amostra na célula (0, 5)
  const s = motor.silhuetaDeDados(dados, cols, rows, sub);
  if (!s.bits[5 * cols + 0]) falhar("silhuetaDeDados: a célula com uma sub-amostra de arte ficou vazia");
  if (s.bits[0]) falhar("silhuetaDeDados: marcou célula sem arte nenhuma");
  const cobertura = s.cobertura ? s.cobertura[5 * cols + 0] : -1;
  if (Math.abs(cobertura - 1 / 16) > 1e-6) {
    falhar(`silhuetaDeDados: a área da célula com uma sub-amostra deu ${cobertura}, e não 1/16`);
  }
  return pontos;
}

// ---------- o contorno no rolo ----------

/** Os polígonos da peça em cm, postos no rolo pelo canto da arte e pelo giro. */
function contornoNoRolo(nome, x, y, rot) {
  const m = CATALOGO[nome];
  const L = m.largura;
  const A = m.altura;
  // O mesmo giro do desenho e do `girarBits`: 90° leva (u, v) a (A − v, u).
  const girar = ([u, v]) => {
    if (rot === 90) return [A - v, u];
    if (rot === 180) return [L - u, A - v];
    if (rot === 270) return [v, L - u];
    return [u, v];
  };
  return (m.blocos || [m.poligono]).map((pol) => pol.map(([nx, ny]) => {
    const [u, v] = girar([nx * L, ny * A]);
    return [x + u, y + v];
  }));
}

function caixaDe(partes) {
  const c = [Infinity, Infinity, -Infinity, -Infinity];
  partes.forEach((pol) => pol.forEach(([x, y]) => {
    if (x < c[0]) c[0] = x;
    if (y < c[1]) c[1] = y;
    if (x > c[2]) c[2] = x;
    if (y > c[3]) c[3] = y;
  }));
  return c;
}

function distanciaPontoSegmento(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d2 = dx * dx + dy * dy;
  const t = d2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function segmentosCruzam(a, b, c, d) {
  const lado = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return lado(a, b, c) * lado(a, b, d) < 0 && lado(c, d, a) * lado(c, d, b) < 0;
}

/** A menor distância entre dois polígonos (zero se se cruzam ou um contém o outro). */
function distanciaPoligonos(P, Q) {
  let menor = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    for (let j = 0; j < Q.length; j++) {
      const c = Q[j];
      const d = Q[(j + 1) % Q.length];
      if (segmentosCruzam(a, b, c, d)) return 0;
      menor = Math.min(menor,
        distanciaPontoSegmento(a, c, d), distanciaPontoSegmento(b, c, d),
        distanciaPontoSegmento(c, a, b), distanciaPontoSegmento(d, a, b));
    }
  }
  if (dentro(P[0], Q) || dentro(Q[0], P)) return 0;
  return menor;
}

/** A menor folga do encaixe, e entre quem. */
function menorFolga(posicoes, folga) {
  const pecas = posicoes.map((p) => {
    const partes = contornoNoRolo(p.item.nome, p.x, p.y, p.rot || (p.girado ? 90 : 0));
    return { partes, caixa: caixaDe(partes), p };
  });
  let menor = { d: Infinity, a: null, b: null };
  for (let i = 0; i < pecas.length; i++) {
    for (let j = i + 1; j < pecas.length; j++) {
      const a = pecas[i].caixa;
      const b = pecas[j].caixa;
      if (a[0] >= b[2] + folga || b[0] >= a[2] + folga || a[1] >= b[3] + folga || b[1] >= a[3] + folga) continue;
      for (const P of pecas[i].partes) {
        for (const Q of pecas[j].partes) {
          const d = distanciaPoligonos(P, Q);
          if (d < menor.d) menor = { d, a: pecas[i].p, b: pecas[j].p };
        }
      }
    }
  }
  return menor;
}

const descrever = (p) => `${p.item.nome} #${p.item.copia} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.rot || 0}°)`;

async function buscar(motor, trabalho, ms) {
  const { receita, itens, passo, raio, alturaMax } = trabalho;
  return motor.buscarMelhorEncaixe(itens, {
    larguraTecido: receita.larguraTecido, espaco: receita.espaco,
    comprimentoBancada: receita.comprimentoBancada || 0,
    passo, raio, alturaMax, motores: ["contorno", "retangulo", "vaos", "faixas"],
    memoria: null, alvo: null, rede: null, redeMadura: false,
    vetorTrabalho: motor.vetorDoTrabalho(trabalho.pecas, receita.larguraTecido),
    metaAproveitamento: 0, tempoMaximoMs: ms, msSemGanho: Math.max(500, ms * 0.25),
    tentativasPorLote: itens.length >= 120 ? 1 : 8, semente: 1,
  });
}

function conferirEncaixe(nome, rotulo, trabalho, resultado) {
  const folga = trabalho.receita.espaco;
  const menor = menorFolga(resultado.posicoes, folga);
  const texto = menor.d === Infinity ? "sem vizinho" : `${(menor.d * 10).toFixed(2)} mm`;
  console.log(`  ${`${nome} ${rotulo}`.padEnd(30)} folga ${(folga * 10).toFixed(1)} mm · menor ${texto}`);
  if (menor.d < folga - EPS) {
    falhar(`${nome} ${rotulo}: ${descrever(menor.a)} e ${descrever(menor.b)} a ${(menor.d * 10).toFixed(2)} mm`
      + ` (pedido ${(folga * 10).toFixed(1)} mm)`);
  }
}

async function main() {
  const rapido = process.argv.includes("--rapido");
  const motor = await carregarMotor();

  conferirDisco(motor);
  console.log("disco: raios 1 a 20");
  const pontos = conferirLeitura(motor);
  console.log(`leitura: ${pontos} pontos dentro das peças, todos em célula marcada`);

  if (!rapido) {
    console.log("encaixe (busca de 1,5 s):");
    for (const nome of Object.keys(TRABALHOS)) {
      const trabalho = prepararTrabalho(motor, nome);
      if (!(trabalho.receita.espaco > 0)) continue;
      const busca = await buscar(motor, trabalho, 1500);
      conferirEncaixe(nome, "busca", trabalho, busca);

      if (nome === "producao-avulsa" && motor.comEncolhedor) {
        const { receita, itens, passo, raio } = trabalho;
        const config = { larguraTecido: receita.larguraTecido, passo, raio, comprimentoBancada: 0 };
        const saida = motor.encolherEncaixe(itens, busca, config, { tempoMs: 8000, semente: 3, trabalhadores: 3 });
        if (saida.resultado) conferirEncaixe(nome, "sparrow", trabalho, saida.resultado);
        else console.log(`  ${`${nome} sparrow`.padEnd(30)} não encurtou (${saida.motivo})`);
      }
    }
  }

  if (falhas.length === 0) {
    console.log("OK — a folga pedida está entre os contornos, e não só entre as células.");
    return;
  }
  console.log(`FALHOU — ${falhas.length} problema(s):`);
  falhas.slice(0, 20).forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

main().catch((erro) => { console.error(erro); process.exit(1); });
