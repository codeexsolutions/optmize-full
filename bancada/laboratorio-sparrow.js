#!/usr/bin/env node
/**
 * ===========================================================================
 * LABORATÓRIO DO SPARROW — a segunda fase medida sozinha, braço contra braço
 * ===========================================================================
 *
 * O sparrow (a compactação, `src/motores/encaixeEncolher.js`) fica com ~85%
 * do tempo de cada encaixe e é ele que entrega o tecido do fim — a curva
 * "3,90 m em 60 s, 3,86 m em 500 s" é a curva dele. Para mexer nele sem se
 * enganar, cada braço tem de ser medido:
 *
 *   - a partir da MESMA partida (o encaixe da busca, calculado uma vez por
 *     trabalho e reaproveitado por todos os braços e sementes);
 *   - com as MESMAS sementes, pareadas entre os braços;
 *   - sob a MESMA carga de máquina: as corridas rodam em paralelo (como os
 *     workers da produção) e a fila intercala os braços, então nenhum braço
 *     pega sozinho um momento de máquina mais livre.
 *
 * Cada corrida guarda a curva (cada encaixe mais curto e a hora em que veio),
 * as voltas do sparrow (o contador do `Terminador`, em wasm-encolher) e os
 * relatos rejeitados pela trava. O resumo dá, por trabalho e braço: a média
 * final, a diferença PAREADA contra o primeiro braço com o erro padrão, e o
 * consumo nos marcos de 25%, 50% e 100% do tempo — a qualidade por tempo, e
 * não só o número do fim.
 *
 *   node bancada/laboratorio-sparrow.js --trabalhos producao-avulsa,camiseta+manga+gola \
 *     --tempo 60 --sementes 3 --paralelo 5 \
 *     --bracos '{"t3":{"trabalhadores":3},"t1":{"trabalhadores":1}}' --json saida.json
 *
 * `nome*N` multiplica as quantidades de um trabalho (`producao-avulsa*4` são
 * 700 peças). Um braço é um objeto que entra nas opções do `encolherEncaixe`
 * (`trabalhadores`, `exato`, `ajustes`...).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

// ==================== O TRABALHO ====================

/** `nome` ou `nome*N`: a receita, com as quantidades multiplicadas por N. */
function receitaDe(nomeComVezes) {
  const [nome, vezesTexto] = nomeComVezes.split("*");
  const base = TRABALHOS[nome];
  if (!base) throw new Error(`trabalho desconhecido: ${nome}`);
  const vezes = Math.max(1, Number(vezesTexto) || 1);
  return { ...base, pecas: base.pecas.map((p) => ({ ...p, qtd: p.qtd * vezes })) };
}

/** As peças prontas (máscaras) de um trabalho: o mesmo caminho do `corrida.js`. */
function prepararTrabalho(motor, nomeComVezes) {
  const receita = receitaDe(nomeComVezes);
  const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
    passo, raio, giro: p.giro || "180", qtd: p.qtd,
  }));
  const itens = expandir(pecas);
  const alturaMax = itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + receita.espaco, 0);
  return { nome: nomeComVezes, receita, pecas, itens, passo, raio, alturaMax };
}

/** A partida: a busca da produção, uma fatia, `ms` de relógio. */
async function calcularPartida(motor, trabalho, ms, semente) {
  const { receita, itens, passo, raio, alturaMax } = trabalho;
  const motores = ["contorno", "vaos", "faixas"];
  const r = await motor.buscarMelhorEncaixe(itens, {
    larguraTecido: receita.larguraTecido,
    espaco: receita.espaco,
    comprimentoBancada: 0,
    passo, raio, alturaMax,
    motores: motor.motoresDaFatia(0, 1, motores),
    memoria: null, alvo: null, rede: null, redeMadura: false,
    vetorTrabalho: motor.vetorDoTrabalho(trabalho.pecas, receita.larguraTecido),
    metaAproveitamento: 0,
    tempoMaximoMs: ms,
    msSemGanho: Math.max(800, ms * 0.25),
    tentativasPorLote: itens.length >= 120 ? 1 : 8,
    fatia: motor.fatiaDoPortfolio(0, 1, motores),
    saltoX: 1,
    semente,
    ...motor.papelDaFatia(0, 1).config,
  });
  if (r.naoEncaixadas.length) throw new Error(`${trabalho.nome}: a partida deixou ${r.naoEncaixadas.length} peça(s) de fora`);
  return {
    consumo: r.consumo,
    posicoes: r.posicoes.map((p) => ({
      indice: p.item.indice, copia: p.item.copia, x: p.x, y: p.y, rot: p.rot || 0,
    })),
  };
}

/** A partida guardada de volta, com as peças deste processo. */
function remontarPartida(trabalho, partida) {
  const porChave = new Map(trabalho.itens.map((it) => [`${it.indice}#${it.copia}`, it]));
  const posicoes = partida.posicoes.map((p) => {
    const item = porChave.get(`${p.indice}#${p.copia}`);
    if (!item) throw new Error(`peça ${p.indice}#${p.copia} sumiu da partida`);
    const deitada = p.rot === 90 || p.rot === 270;
    return {
      item, x: p.x, y: p.y, rot: p.rot, girado: deitada,
      largura: deitada ? item.altura : item.largura,
      altura: deitada ? item.largura : item.altura,
      mascara: item.mascaras.rotacoes[p.rot], passo: trabalho.passo, bancada: 0,
    };
  });
  return { consumo: partida.consumo, posicoes, naoEncaixadas: [] };
}

// ==================== O FILHO: roda corridas ====================

async function filho() {
  const motor = await carregarMotor({ comWasm: true });
  if (!motor.comEncolhedor) throw new Error("o WASM do sparrow não carregou");
  const trabalhos = new Map();
  parentPort.postMessage({ tipo: "pronto" });
  parentPort.on("message", (tarefa) => {
    if (tarefa.tipo === "fim") { process.exit(0); }
    if (!trabalhos.has(tarefa.trabalho)) trabalhos.set(tarefa.trabalho, prepararTrabalho(motor, tarefa.trabalho));
    const trabalho = trabalhos.get(tarefa.trabalho);
    const partida = remontarPartida(trabalho, tarefa.partida);
    const config = {
      larguraTecido: trabalho.receita.larguraTecido, passo: trabalho.passo, raio: trabalho.raio,
      comprimentoBancada: 0,
    };
    const curva = [];
    let voltas = 0;
    const inicio = Date.now();
    // As `etapas` do braço (o "do grosso para o fino") vão direto para o
    // motor: é o MESMO encadeamento que a produção usa (ver "AS ETAPAS", em
    // src/motores/encaixeEncolher.js).
    const r = motor.encolherEncaixe(trabalho.itens, partida, config, {
      ...tarefa.braco,
      tempoMs: tarefa.tempoMs,
      semente: tarefa.semente,
      aoMelhorar: (novo) => curva.push([Date.now() - inicio, novo.consumo]),
      aoAndar: (v) => { voltas = v; },
    });
    const ms = Date.now() - inicio;
    // A trava independente, mais uma vez, no encaixe final.
    let pares = 0;
    if (r.resultado) pares = motor.acharSobreposicao(r.resultado.posicoes).pares;
    parentPort.postMessage({
      tipo: "feito",
      corrida: {
        trabalho: tarefa.trabalho, braco: tarefa.nomeBraco, semente: tarefa.semente,
        inicial: partida.consumo, final: r.resultado ? r.resultado.consumo : partida.consumo,
        curva, voltas, ms, relatos: r.relatos, rejeitados: r.rejeitados, motivo: r.motivo, pares,
        estatisticas: r.estatisticas || null,
        // Com etapas, a estatística de forma (vértices, área) é a da primeira.
      },
    });
  });
}

// ==================== O PAI: prepara, reparte e resume ====================

function argumentos() {
  const o = {
    trabalhos: ["producao-avulsa", "camiseta+manga+gola"], tempo: 60, sementes: 3,
    paralelo: Math.max(1, Math.min(5, os.cpus().length - 1)), partidaMs: 3000,
    bracos: { t3: { trabalhadores: 3 }, t1: { trabalhadores: 1 } }, json: null, partidas: null,
  };
  for (let i = 2; i < process.argv.length; i += 2) {
    const [k, v] = [process.argv[i], process.argv[i + 1]];
    if (k === "--trabalhos") o.trabalhos = v.split(",");
    else if (k === "--tempo") o.tempo = Number(v);
    else if (k === "--sementes") o.sementes = Number(v);
    else if (k === "--paralelo") o.paralelo = Number(v);
    else if (k === "--partida-ms") o.partidaMs = Number(v);
    else if (k === "--bracos") o.bracos = JSON.parse(v);
    else if (k === "--json") o.json = v;
    else if (k === "--partidas") o.partidas = v; // arquivo para guardar/reaproveitar as partidas
    else throw new Error(`argumento desconhecido: ${k}`);
  }
  return o;
}

const metros = (cm) => (cm / 100).toFixed(3);
const pct = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;

/** O consumo da curva no instante `ms` (o melhor encaixe até ali). */
function consumoNoInstante(c, ms) {
  let v = c.inicial;
  for (const [t, consumo] of c.curva) if (t <= ms) v = Math.min(v, consumo);
  return v;
}

function resumir(o, corridas) {
  const nomesBracos = Object.keys(o.bracos);
  const ref = nomesBracos[0];
  const linhas = [];
  for (const trabalho of o.trabalhos) {
    const doTrabalho = corridas.filter((c) => c.trabalho === trabalho);
    if (!doTrabalho.length) continue;
    const inicial = doTrabalho[0].inicial;
    const lb = o.limites && o.limites[trabalho];
    const lbTexto = lb ? ` · limite inferior ${metros(lb.limite)} m (área ${metros(lb.area)}, BM ${metros(lb.bm)})` : "";
    console.log(`\n${trabalho} · partida ${metros(inicial)} m · ${o.tempo}s · ${o.sementes} semente(s)${lbTexto}`);
    console.log(`${"braço".padEnd(12)} ${"25%".padStart(8)} ${"50%".padStart(8)} ${"final".padStart(8)}  ${"ganho".padStart(7)}  ${`×${ref}`.padStart(16)}  aval/s  cm/1k aval  sep ok  vért.  infl.  1º ganho  rej`);
    for (const nome of nomesBracos) {
      const cs = doTrabalho.filter((c) => c.braco === nome);
      if (!cs.length) continue;
      const media = (f) => cs.reduce((s, c) => s + f(c), 0) / cs.length;
      const T = o.tempo * 1000;
      const m25 = media((c) => consumoNoInstante(c, T * 0.25));
      const m50 = media((c) => consumoNoInstante(c, T * 0.5));
      const fim = media((c) => c.final);
      const ganho = ((fim - inicial) / inicial) * 100;
      // Diferença pareada (mesma semente) contra o braço de referência.
      const difs = cs.map((c) => {
        const r = doTrabalho.find((x) => x.braco === ref && x.semente === c.semente);
        return r ? ((c.final - r.final) / r.final) * 100 : null;
      }).filter((d) => d !== null);
      const md = difs.reduce((s, d) => s + d, 0) / Math.max(1, difs.length);
      const dp = difs.length > 1
        ? Math.sqrt(difs.reduce((s, d) => s + (d - md) ** 2, 0) / (difs.length - 1)) : 0;
      const ep = difs.length > 1 ? dp / Math.sqrt(difs.length) : 0;
      const voltasPorS = media((c) => c.voltas / Math.max(1, c.ms / 1000));
      const primeiro = media((c) => (c.curva.length ? c.curva[0][0] : c.ms)) / 1000;
      const rej = cs.reduce((s, c) => s + c.rejeitados, 0);
      const pares = cs.reduce((s, c) => s + c.pares, 0);
      const comparado = nome === ref ? "—" : `${pct(md)} ±${ep.toFixed(2)}`;
      // A qualidade por avaliação: centímetros de rolo ganhos por mil
      // avaliações geométricas do sparrow (posições testadas).
      const comEst = cs.filter((c) => c.estatisticas);
      const avalPorS = comEst.length ? comEst.reduce((s, c) => s + c.estatisticas.avaliacoes / Math.max(1, c.ms / 1000), 0) / comEst.length : NaN;
      const cmPorMil = comEst.length ? comEst.reduce((s, c) => s + (c.inicial - c.final) / Math.max(1, c.estatisticas.avaliacoes / 1000), 0) / comEst.length : NaN;
      const sepOk = comEst.length ? comEst.reduce((s, c) => s + c.estatisticas.separacoesResolvidas / Math.max(1, c.estatisticas.separacoes), 0) / comEst.length : NaN;
      const fmt = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : "—");
      const vert = comEst.length ? comEst[0].estatisticas.verticesColisao : NaN;
      const infl = comEst.length && comEst[0].estatisticas.areaOriginal > 0
        ? (comEst[0].estatisticas.areaColisao / comEst[0].estatisticas.areaOriginal - 1) * 100 : NaN;
      console.log(`${nome.padEnd(12)} ${metros(m25).padStart(8)} ${metros(m50).padStart(8)} ${metros(fim).padStart(8)}  ${pct(ganho).padStart(7)}  ${comparado.padStart(16)}  ${fmt(avalPorS, 0).padStart(6)}  ${fmt(cmPorMil, 3).padStart(10)}  ${fmt(sepOk * 100, 0).padStart(5)}%  ${fmt(vert, 0).padStart(5)}  ${fmt(infl, 2).padStart(5)}%  ${primeiro.toFixed(1).padStart(7)}s  ${rej}${pares ? ` PARES:${pares}` : ""}`);
      linhas.push({ trabalho, braco: nome, inicial, m25, m50, final: fim, ganho, difMedia: md, erroPadrao: ep, n: difs.length, voltasPorS, verticesColisao: vert, inflacaoArea: infl, avaliacoesPorS: avalPorS, cmPorMilAvaliacoes: cmPorMil, separacoesResolvidas: sepOk, primeiroGanhoS: primeiro, rejeitados: rej, pares });
    }
  }
  return linhas;
}

async function pai() {
  const o = argumentos();
  const motor = await carregarMotor({ comWasm: true });
  if (!motor.comEncolhedor) throw new Error("o WASM do sparrow não carregou (npm run build:encolher)");

  // 1. As partidas, uma por trabalho (guardadas, se pedido, para a próxima rodada).
  let partidas = {};
  if (o.partidas && fs.existsSync(o.partidas)) partidas = JSON.parse(fs.readFileSync(o.partidas, "utf8"));
  for (const nome of o.trabalhos) {
    if (partidas[nome]) continue;
    const t0 = Date.now();
    const trabalho = prepararTrabalho(motor, nome);
    partidas[nome] = await calcularPartida(motor, trabalho, o.partidaMs, 20260824);
    console.log(`partida ${nome}: ${trabalho.itens.length} peças, ${metros(partidas[nome].consumo)} m (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  if (o.partidas) fs.writeFileSync(o.partidas, JSON.stringify(partidas));
  // Os limites inferiores de cada trabalho (ver src/motores/limitesInferiores.js).
  o.limites = {};
  for (const nome of o.trabalhos) {
    const t = prepararTrabalho(motor, nome);
    o.limites[nome] = motor.limitesInferiores(t.itens, t.receita.larguraTecido, t.receita.espaco);
  }

  // 2. A fila: semente → trabalho → braço, para os braços se intercalarem.
  const fila = [];
  for (let s = 0; s < o.sementes; s++) {
    for (const trabalho of o.trabalhos) {
      for (const [nomeBraco, braco] of Object.entries(o.bracos)) {
        fila.push({ tipo: "tarefa", trabalho, nomeBraco, braco, semente: 1 + s * 7919, tempoMs: o.tempo * 1000, partida: partidas[trabalho] });
      }
    }
  }
  const total = fila.length;
  const estimativa = Math.ceil(total / o.paralelo) * o.tempo;
  console.log(`\n${total} corridas, ${o.paralelo} em paralelo, ~${Math.ceil(estimativa / 60)} min\n`);

  // 3. Os filhos.
  const corridas = [];
  await new Promise((pronto, falhou) => {
    let ativos = 0;
    for (let k = 0; k < Math.min(o.paralelo, total); k++) {
      const w = new Worker(__filename, { workerData: { filho: true } });
      ativos++;
      const proxima = () => {
        const t = fila.shift();
        if (t) w.postMessage(t);
        else { w.postMessage({ tipo: "fim" }); }
      };
      w.on("message", (msg) => {
        if (msg.tipo === "pronto") { proxima(); return; }
        if (msg.tipo === "feito") {
          const c = msg.corrida;
          corridas.push(c);
          console.log(`[${String(corridas.length).padStart(3)}/${total}] ${c.trabalho.padEnd(22)} ${c.braco.padEnd(10)} s${String(c.semente).padStart(5)}  ${metros(c.inicial)} → ${metros(c.final)} m  (${pct(((c.final - c.inicial) / c.inicial) * 100)}, ${c.voltas} voltas, rej ${c.rejeitados}/${c.relatos}${c.pares ? `, PARES ${c.pares}` : ""})`);
          proxima();
        }
      });
      w.on("error", falhou);
      w.on("exit", () => { ativos--; if (ativos === 0) pronto(); });
    }
  });

  const resumo = resumir(o, corridas);
  if (o.json) {
    fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true });
    fs.writeFileSync(o.json, JSON.stringify({
      quando: new Date().toISOString(), opcoes: { ...o, partidas: undefined },
      maquina: { cpu: os.cpus()[0].model, nucleos: os.cpus().length }, resumo, corridas,
    }, null, 1));
    console.log(`\nguardado em ${o.json}`);
  }
}

if (isMainThread) pai().catch((e) => { console.error(e); process.exit(1); });
else if (workerData && workerData.filho) filho().catch((e) => { console.error(e); process.exit(1); });
