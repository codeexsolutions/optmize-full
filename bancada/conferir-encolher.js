#!/usr/bin/env node
/**
 * Confere a ponte do encolhedor — `src/motores/encaixeEncolher.js`, a tradução
 * entre o motor e o sparrow.
 *
 * A ponte é o único lugar em que as duas geometrias se encontram: a nossa, de
 * células com topo/base por coluna, e a do sparrow, de polígonos girados e
 * transladados. Um sinal trocado num giro não quebra nada de um jeito
 * barulhento — sai um encaixe com peça em cima de peça, ou a trava da produção
 * recusando todo encaixe do sparrow e o motor voltando calado para o resultado
 * da busca. Os dois defeitos parecem "o encolhedor não rendeu". Por isso a
 * prova olha a tradução por partes, antes de olhar o resultado.
 *
 * As quatro conferências:
 *
 *   ida e volta   posição e giro → transformação do sparrow → posição e giro:
 *                 tem de voltar igual, nos quatro giros.
 *   forma         o contorno em escada da máscara de 0°, girado e transladado
 *                 do jeito do sparrow, cobre EXATAMENTE as células da máscara
 *                 daquele giro — o centro de cada célula cai dentro, e o da
 *                 célula logo acima do topo e logo abaixo da base cai fora.
 *                 É o que prova o mapeamento dos giros (a transposição inverte
 *                 o sentido: nosso 90° é o −90° dele).
 *   contorno      nenhuma aresta do contorno cruza outra — inclusive na arte
 *                 partida, que tem coluna vazia no meio e ganha uma ponte.
 *   ponta a ponta com o WASM: uma busca curta, a partida vai ao formato do
 *                 sparrow e volta sem mudar (mesmo consumo, zero pares), e o
 *                 sparrow roda de verdade e devolve encaixe válido, nunca
 *                 maior que o da busca. `giro-livre` exercita os giros
 *                 deitados; `producao-avulsa`, o pedido que motivou tudo.
 *
 *   node bancada/conferir-encolher.js
 *   node bancada/conferir-encolher.js --rapido     sem a ponta a ponta
 */

const { carregarMotor } = require("./motor");
const { CATALOGO, prepararPeca } = require("./pecas");
const { prepararTrabalho } = require("./corrida");

const LARGURA = 179;
const FOLGA = 0.4;
const GIROS = [0, 90, 180, 270];
const falhas = [];
const falhar = (texto) => { falhas.push(texto); };

// ---------- geometria da prova ----------

/** Gira (graus múltiplos de 90, convenção do sparrow) e translada. */
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

function segmentosCruzam(a, b, c, d) {
  const lado = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const l1 = lado(a, b, c), l2 = lado(a, b, d), l3 = lado(c, d, a), l4 = lado(c, d, b);
  if (l1 * l2 < 0 && l3 * l4 < 0) return true; // cruzamento próprio
  // Encostar em ponta (vértice sobre aresta) também quebra um polígono simples.
  const sobre = (p, q, r) => lado(p, q, r) === 0
    && Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0])
    && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  return (l1 === 0 && sobre(a, b, c)) || (l2 === 0 && sobre(a, b, d))
    || (l3 === 0 && sobre(c, d, a)) || (l4 === 0 && sobre(c, d, b));
}

function contornoSimples(poligono) {
  const n = poligono.length;
  for (let i = 0; i < n; i++) {
    const a = poligono[i], b = poligono[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Arestas vizinhas dividem um vértice por construção.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentosCruzam(a, b, poligono[j], poligono[(j + 1) % n])) return false;
    }
  }
  return true;
}

// ---------- as conferências ----------

function conferirIdaEVolta(motor) {
  let casos = 0;
  [[389, 298], [133, 248], [38, 288], [1, 1]].forEach(([R, C]) => {
    GIROS.forEach((rot) => {
      [[0, 0], [7, 11], [500, 13]].forEach(([col, lin]) => {
        casos++;
        const t = motor.transformacaoDoSparrow(rot, col, lin, R, C);
        const v = motor.colocacaoDoSparrow(t, R, C);
        if (v.rot !== rot || v.col !== col || v.lin !== lin) {
          falhar(`ida e volta: giro ${rot} (${col},${lin}) voltou giro ${v.rot} (${v.col},${v.lin})`);
        }
      });
    });
  });
  return casos;
}

function conferirFormas(motor, passo, raio) {
  let celulas = 0;
  const deitadosFora = [];
  Object.keys(CATALOGO).forEach((nome) => {
    const peca = prepararPeca(motor, nome, { passo, raio, giro: "livre", qtd: 1 });
    const m0 = peca.mascaras.rotacoes[0];
    const forma = motor.contornoEmEscada(m0);
    if (!contornoSimples(forma)) falhar(`contorno: ${nome} tem aresta cruzando aresta`);

    // Coluna vazia ganha ponte: ali o contorno é MAIOR que a máscara de
    // propósito, e o "logo fora" não vale. O "dentro" vale sempre.
    let temColunaVazia = false;
    for (let c = 0; c < m0.cols; c++) if (m0.topo[c] < 0) temColunaVazia = true;

    // Os giros que vão para o sparrow são só os coerentes (ver
    // `giroConsistente`): o 0° e o 180° sempre; o deitado, quando o casco
    // girado é o casco da peça girada. O incoerente não pode escapar para o
    // tipo, e o coerente tem de cobrir as células exatas.
    const noTipo = motor.tiposDoEncaixe([{ indice: 0, copia: 1, giro: "livre", mascaras: peca.mascaras }])[0].rotacoes;
    GIROS.forEach((rot) => {
      const m = peca.mascaras.rotacoes[rot];
      if (!m) { falhar(`forma: ${nome} sem máscara de ${rot}°`); return; }
      const coerente = motor.giroConsistente(m0, m, rot);
      if (coerente !== noTipo.includes(rot)) {
        falhar(`forma: ${nome} ${rot}° ${coerente ? "coerente e fora" : "incoerente e dentro"} do tipo`);
      }
      if (!coerente) { deitadosFora.push(`${nome} ${rot}°`); return; }
      const col = 7, lin = 11;
      const t = motor.transformacaoDoSparrow(rot, col, lin, m0.rows, m0.cols);
      const poligono = transformar(forma, t.rotation, t.translation);
      // Nosso (coluna x, linha y) é o (y, x) do sparrow.
      const centro = (c, r) => [lin + r + 0.5, col + c + 0.5];
      let erradas = 0;
      for (let c = 0; c < m.cols; c++) {
        if (m.topo[c] < 0) continue;
        for (let r = m.topo[c]; r <= m.base[c]; r++) {
          celulas++;
          if (!dentro(centro(c, r), poligono)) erradas++;
        }
        if (!temColunaVazia) {
          if (dentro(centro(c, m.topo[c] - 1), poligono)) erradas++;
          if (dentro(centro(c, m.base[c] + 1), poligono)) erradas++;
        }
      }
      if (erradas > 0) falhar(`forma: ${nome} girada ${rot}° erra ${erradas} célula(s)`);
    });
  });
  if (deitadosFora.length > 0) {
    console.log(`  giros deitados que ficam com a busca (casco não gira junto): ${deitadosFora.join(", ")}`);
  }
  return celulas;
}

async function buscaCurta(motor, trabalho, ms) {
  const { receita, itens, passo, alturaMax } = trabalho;
  return motor.buscarMelhorEncaixe(itens, {
    larguraTecido: receita.larguraTecido, espaco: receita.espaco, comprimentoBancada: 0,
    passo, alturaMax, motores: ["contorno", "retangulo", "vaos", "faixas"],
    memoria: null, alvo: null, rede: null, redeMadura: false,
    vetorTrabalho: motor.vetorDoTrabalho(trabalho.pecas, receita.larguraTecido),
    metaAproveitamento: 0, tempoMaximoMs: ms, msSemGanho: Math.max(800, ms * 0.25),
    tentativasPorLote: itens.length >= 120 ? 1 : 8, semente: 1,
  });
}

async function conferirPontaAPonta(motor) {
  for (const nome of ["giro-livre", "producao-avulsa"]) {
    const trabalho = prepararTrabalho(motor, nome);
    const { receita, itens, passo } = trabalho;
    const colsTecido = Math.max(1, Math.floor(receita.larguraTecido / passo));
    const busca = await buscaCurta(motor, trabalho, 2000);
    const cm = (v) => `${(v / 100).toFixed(3)} m`;

    const config = { larguraTecido: receita.larguraTecido, passo, comprimentoBancada: 0 };
    const motivo = motor.motivoParaNaoEncolher(itens, busca, config);
    if (motivo) { falhar(`${nome}: a ponte recusou encolher (${motivo})`); continue; }

    // A partida vai e volta sem o sparrow no meio. Só vale para encaixe de
    // máscara: o por caixa reserva a folga só à direita e embaixo, e ali a
    // máscara não encaixa célula por célula — o sparrow desfaz isso na
    // primeira separação, e é a conferência de baixo que cobre.
    const tipos = motor.tiposDoEncaixe(itens);
    const partida = motor.partidaDoSparrow(busca, tipos, passo, colsTecido);
    if (!partida) {
      // Só é legítimo quando a busca usou um giro que não vai para o sparrow
      // (peça "livre" com cava ou decote deitada — ver `giroConsistente`):
      // aí ele monta o encaixe dele. Qualquer outro motivo é defeito da ponte.
      const tipoDe = new Map();
      tipos.forEach((t) => t.itens.forEach((item) => tipoDe.set(item, t)));
      const giroDeFora = busca.posicoes.some((p) => !tipoDe.get(p.item).rotacoes.includes(p.rot || 0));
      if (!giroDeFora) falhar(`${nome}: a partida não saiu`);
      else console.log(`  ${nome}: a busca deitou peça que o sparrow não deita — ele monta o encaixe dele`);
    }
    const deMascara = busca.posicoes.every((p) => p.mascara);
    if (partida && deMascara) {
      const voltou = motor.resultadoDoSparrow(partida, tipos, passo, colsTecido);
      if (!voltou) falhar(`${nome}: a partida não voltou válida`);
      else if (Math.abs(voltou.consumo - busca.consumo) > 1e-6) {
        falhar(`${nome}: a partida voltou com ${cm(voltou.consumo)}, a busca tinha ${cm(busca.consumo)}`);
      }
    }

    const saida = motor.encolherEncaixe(itens, busca, config, {
      tempoMs: 10000, semente: 7, trabalhadores: 3, partir: true,
    });
    if (saida.motivo && saida.motivo.startsWith("sparrow falhou")) falhar(`${nome}: ${saida.motivo}`);
    if (!(saida.relatos > 0)) falhar(`${nome}: o sparrow não relatou encaixe nenhum`);
    const depois = saida.resultado ? saida.resultado.consumo : busca.consumo;
    if (depois > busca.consumo + 1e-6) falhar(`${nome}: o encolhedor devolveu encaixe MAIOR`);
    if (saida.resultado) {
      const guarda = motor.acharSobreposicao(saida.resultado.posicoes);
      if (guarda.pares > 0 || guarda.conferidas !== itens.length) {
        falhar(`${nome}: o encaixe do sparrow tem ${guarda.pares} par(es) sobreposto(s)`);
      }
    }
    const dif = ((depois - busca.consumo) / busca.consumo) * 100;
    console.log(`  ${nome.padEnd(16)} busca ${cm(busca.consumo)} (${busca.receita})`
      + ` -> sparrow 10 s ${cm(depois)} (${dif.toFixed(2)}%)`
      + ` · ${saida.relatos} relatos, ${saida.rejeitados} recusados`);
  }
}

async function main() {
  const rapido = process.argv.includes("--rapido");
  const motor = await carregarMotor();
  if (!rapido && !motor.comEncolhedor) {
    console.log("FALHOU — o WASM do encolhedor não carregou (rode `npm run build:encolher`).");
    process.exit(1);
  }
  const { passo, raio } = motor.grade(LARGURA, FOLGA);

  const casos = conferirIdaEVolta(motor);
  console.log(`ida e volta: ${casos} casos`);
  const celulas = conferirFormas(motor, passo, raio);
  console.log(`forma e contorno: ${Object.keys(CATALOGO).length} peças x 4 giros, ${celulas} células`);
  if (!rapido) {
    console.log("ponta a ponta (busca de 2 s, sparrow de 10 s):");
    await conferirPontaAPonta(motor);
  }

  if (falhas.length === 0) {
    console.log("OK — a ponte traduz sem perder nem sobrepor.");
    return;
  }
  console.log(`FALHOU — ${falhas.length} problema(s):`);
  falhas.slice(0, 20).forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

main().catch((erro) => { console.error(erro); process.exit(1); });
