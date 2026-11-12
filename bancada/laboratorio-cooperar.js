#!/usr/bin/env node
/**
 * ===========================================================================
 * LABORATÓRIO DA COOPERAÇÃO — workers sozinhos contra workers que se ajudam
 * ===========================================================================
 *
 * Na produção, a segunda fase roda o sparrow em todos os workers ao mesmo
 * tempo, cada um com a sua semente, todos a partir do encaixe da busca, e fica
 * o melhor no fim (`encolherEmParalelo`). Ninguém conversa com ninguém: se o
 * worker 3 achou aos 10 s um encaixe muito melhor que os outros, os outros
 * passam os 35 s seguintes lapidando encaixes piores.
 *
 * Aqui os dois jeitos rodam com o MESMO número de workers, o MESMO relógio
 * total, a MESMA partida e as MESMAS sementes:
 *
 *   sozinhos    P workers × T segundos, fica o melhor dos P (o de hoje);
 *   cooperam    o relógio vira R rodadas de T/R; a cada rodada todos
 *               recomeçam do MELHOR encaixe até ali (o JSON exato do
 *               sparrow, sem passar pela grade), cada um com outra semente.
 *
 *   node bancada/laboratorio-cooperar.js --trabalhos producao-avulsa --tempo 45 \
 *     --sementes 3 --paralelo 5 --rodadas 3 --json saida.json
 *
 * `--ajustes '{...}'` e `--trabalhadores N` valem para os dois braços (o que
 * se mede aqui é só a cooperação).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

function receitaDe(nomeComVezes) {
  const [nome, vezesTexto] = nomeComVezes.split("*");
  const base = TRABALHOS[nome];
  if (!base) throw new Error(`trabalho desconhecido: ${nome}`);
  const vezes = Math.max(1, Number(vezesTexto) || 1);
  return { ...base, pecas: base.pecas.map((p) => ({ ...p, qtd: p.qtd * vezes })) };
}

function prepararTrabalho(motor, nomeComVezes) {
  const receita = receitaDe(nomeComVezes);
  const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, { passo, raio, giro: p.giro || "180", qtd: p.qtd }));
  const itens = expandir(pecas);
  const alturaMax = itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + receita.espaco, 0);
  return { nome: nomeComVezes, receita, pecas, itens, passo, raio, alturaMax };
}

function remontar(trabalho, partida) {
  const porChave = new Map(trabalho.itens.map((it) => [`${it.indice}#${it.copia}`, it]));
  const posicoes = partida.posicoes.map((p) => {
    const item = porChave.get(`${p.indice}#${p.copia}`);
    const deitada = p.rot === 90 || p.rot === 270;
    return {
      item, x: p.x, y: p.y, rot: p.rot, girado: deitada,
      largura: deitada ? item.altura : item.largura, altura: deitada ? item.largura : item.altura,
      mascara: item.mascaras.rotacoes[p.rot], passo: trabalho.passo, bancada: 0,
    };
  });
  return { consumo: partida.consumo, posicoes, naoEncaixadas: [] };
}

const enxuta = (r) => ({
  consumo: r.consumo,
  posicoes: r.posicoes.map((p) => ({ indice: p.item.indice, copia: p.item.copia, x: p.x, y: p.y, rot: p.rot || 0 })),
});

// ==================== O FILHO ====================

async function filho() {
  const motor = await carregarMotor({ comWasm: true });
  const trabalhos = new Map();
  parentPort.postMessage({ tipo: "pronto" });
  parentPort.on("message", (t) => {
    if (t.tipo === "fim") process.exit(0);
    if (!trabalhos.has(t.trabalho)) trabalhos.set(t.trabalho, prepararTrabalho(motor, t.trabalho));
    const trabalho = trabalhos.get(t.trabalho);
    const base = remontar(trabalho, t.partida);
    const config = { larguraTecido: trabalho.receita.larguraTecido, passo: trabalho.passo, raio: trabalho.raio, comprimentoBancada: 0 };
    const inicio = Date.now();
    const curva = [];
    const r = motor.encolherEncaixe(trabalho.itens, base, config, {
      tempoMs: t.tempoMs, semente: t.semente, trabalhadores: t.trabalhadores, ajustes: t.ajustes,
      fracaoCompressao: t.fracaoCompressao, etapas: t.etapas,
      partidaDoSparrow: t.partidaJson || undefined,
      aoMelhorar: (novo) => curva.push([t.relogio + Date.now() - inicio, novo.consumo]),
    });
    parentPort.postMessage({
      tipo: "feito",
      resultado: r.resultado ? enxuta(r.resultado) : null,
      json: r.melhorJson || null,
      curva,
      estatisticas: r.estatisticas,
      rejeitados: r.rejeitados,
      pares: r.resultado ? motor.acharSobreposicao(r.resultado.posicoes).pares : 0,
    });
  });
}

// ==================== O PAI ====================

class Piscina {
  constructor(n) {
    this.workers = [];
    this.n = n;
  }
  async subir() {
    await Promise.all(Array.from({ length: this.n }, () => new Promise((pronto, falhou) => {
      const w = new Worker(__filename, { workerData: { filho: true } });
      w.once("message", (m) => { if (m.tipo === "pronto") { this.workers.push(w); pronto(); } });
      w.on("error", falhou);
    })));
  }
  rodar(tarefas) {
    return Promise.all(tarefas.map((t, k) => new Promise((pronto) => {
      const w = this.workers[k];
      w.once("message", pronto);
      w.postMessage(t);
    })));
  }
  descer() { this.workers.forEach((w) => w.postMessage({ tipo: "fim" })); }
}

function argumentos() {
  const o = { trabalhos: ["producao-avulsa"], tempo: 45, sementes: 3, paralelo: 5, rodadas: 3, trabalhadores: 3, ajustes: null, json: null, partidas: null, bracos: null };
  for (let i = 2; i < process.argv.length; i += 2) {
    const [k, v] = [process.argv[i], process.argv[i + 1]];
    if (k === "--trabalhos") o.trabalhos = v.split(",");
    else if (k === "--tempo") o.tempo = Number(v);
    else if (k === "--sementes") o.sementes = Number(v);
    else if (k === "--paralelo") o.paralelo = Number(v);
    else if (k === "--rodadas") o.rodadas = Number(v);
    else if (k === "--trabalhadores") o.trabalhadores = Number(v);
    else if (k === "--ajustes") o.ajustes = JSON.parse(v);
    else if (k === "--json") o.json = v;
    else if (k === "--partidas") o.partidas = v;
    else if (k === "--bracos") o.bracos = JSON.parse(v);
    else throw new Error(`argumento desconhecido: ${k}`);
  }
  // Sem `--bracos`, os dois de sempre: sozinhos (hoje) e cooperando em rodadas iguais.
  if (!o.bracos) o.bracos = { sozinhos: { modo: "sozinhos" }, cooperam: { modo: "cooperam", quantas: o.rodadas } };
  return o;
}

const metros = (cm) => (cm / 100).toFixed(3);

async function pai() {
  const o = argumentos();
  const motor = await carregarMotor({ comWasm: true });
  const partidas = o.partidas && fs.existsSync(o.partidas) ? JSON.parse(fs.readFileSync(o.partidas, "utf8")) : {};
  for (const nome of o.trabalhos) {
    if (!partidas[nome]) throw new Error(`sem partida para ${nome}: rode o laboratorio-sparrow.js com --partidas ${o.partidas} antes`);
  }
  const piscina = new Piscina(o.paralelo);
  await piscina.subir();
  const T = o.tempo * 1000;
  const corridas = [];

  for (let s = 0; s < o.sementes; s++) {
    for (const trabalho of o.trabalhos) {
      const partida = partidas[trabalho];
      const semente = 1 + s * 7919;
      const comum = { tipo: "tarefa", trabalho, trabalhadores: o.trabalhadores, ajustes: o.ajustes };
      // A ordem dos braços gira entre sementes: a deriva da máquina não pesa num só.
      const nomes = Object.keys(o.bracos);
      const ordem = nomes.map((_, i) => nomes[(i + s) % nomes.length]);
      const linha = { trabalho, semente, inicial: partida.consumo, bracos: {} };
      for (const nome of ordem) {
        const braco = o.bracos[nome];
        if (braco.modo !== "cooperam") {
          // Cada worker sozinho o tempo todo (com etapas próprias, se houver).
          const rs = await piscina.rodar(Array.from({ length: o.paralelo }, (_, k) => ({
            ...comum, ...(braco.ajustes ? { ajustes: braco.ajustes } : {}), etapas: braco.etapas,
            partida, tempoMs: T, semente: semente + k * 104729, relogio: 0,
          })));
          const finais = rs.map((r) => (r.resultado ? r.resultado.consumo : partida.consumo));
          linha.bracos[nome] = {
            final: Math.min(...finais), finais,
            avaliacoes: rs.reduce((t, r) => t + ((r.estatisticas && r.estatisticas.avaliacoes) || 0), 0),
            pares: rs.reduce((t, r) => t + r.pares, 0),
          };
        } else {
          // Rodadas: iguais (`quantas`) ou cada uma com os seus ajustes (`rodadas`).
          const rodadas = Array.isArray(braco.rodadas) ? braco.rodadas
            : Array.from({ length: braco.quantas || o.rodadas }, () => ({}));
          let atual = partida;
          let atualJson = null;
          let avaliacoes = 0;
          let pares = 0;
          let gasto = 0;
          const porRodada = [];
          for (let r = 0; r < rodadas.length; r++) {
            const ultima = r === rodadas.length - 1;
            const spec = rodadas[r];
            const fracao = Array.isArray(braco.rodadas) ? (spec.fracao || 0) : 1 / rodadas.length;
            const tempoMs = ultima ? T - gasto : Math.round(T * fracao);
            const rs = await piscina.rodar(Array.from({ length: o.paralelo }, (_, k) => ({
              ...comum, ...(spec.ajustes ? { ajustes: spec.ajustes } : (braco.ajustes ? { ajustes: braco.ajustes } : {})),
              partida: atual, partidaJson: atualJson, tempoMs,
              semente: semente + k * 104729 + r * 7, relogio: gasto,
              // A compressão fina só na última rodada (a parte dela que dá 20% do total).
              fracaoCompressao: spec.fracaoCompressao != null ? spec.fracaoCompressao
                : (ultima ? Math.min(1, 0.2 / Math.max(0.05, tempoMs / T)) : 0),
            })));
            gasto += tempoMs;
            rs.forEach((x) => { avaliacoes += (x.estatisticas && x.estatisticas.avaliacoes) || 0; pares += x.pares; });
            const melhorDaRodada = rs.filter((x) => x.resultado).sort((a, b) => a.resultado.consumo - b.resultado.consumo)[0];
            if (melhorDaRodada && melhorDaRodada.resultado.consumo < atual.consumo) {
              atual = melhorDaRodada.resultado;
              atualJson = melhorDaRodada.json;
            }
            porRodada.push(atual.consumo);
          }
          linha.bracos[nome] = { final: atual.consumo, porRodada, avaliacoes, pares };
        }
      }
      const ref = linha.bracos[nomes[0]].final;
      corridas.push(linha);
      const partes = nomes.map((n) => {
        const b = linha.bracos[n];
        const d = ((b.final - ref) / ref) * 100;
        return `${n} ${metros(b.final)}${n === nomes[0] ? "" : ` (${d >= 0 ? "+" : ""}${d.toFixed(2)}%)`}${b.pares ? " PARES!" : ""}`;
      });
      console.log(`${trabalho.padEnd(22)} s${String(semente).padStart(5)}  partida ${metros(linha.inicial)}  ${partes.join("  ")}`);
    }
  }
  piscina.descer();

  console.log("");
  const nomes = Object.keys(o.bracos);
  for (const trabalho of o.trabalhos) {
    const cs = corridas.filter((c) => c.trabalho === trabalho);
    const partes = nomes.slice(1).map((n) => {
      const ds = cs.map((c) => ((c.bracos[n].final - c.bracos[nomes[0]].final) / c.bracos[nomes[0]].final) * 100);
      const m = ds.reduce((a, b) => a + b, 0) / ds.length;
      const dp = ds.length > 1 ? Math.sqrt(ds.reduce((a, d) => a + (d - m) ** 2, 0) / (ds.length - 1)) : 0;
      return `${n} × ${nomes[0]}: ${m >= 0 ? "+" : ""}${m.toFixed(2)}% ±${(dp / Math.sqrt(ds.length)).toFixed(2)} (${ds.map((d) => d.toFixed(2)).join(", ")})`;
    });
    console.log(`${trabalho.padEnd(22)} ${partes.join("   ")}`);
  }
  if (o.json) {
    fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true });
    fs.writeFileSync(o.json, JSON.stringify({ quando: new Date().toISOString(), opcoes: o, maquina: os.cpus()[0].model, corridas }, null, 1));
    console.log(`guardado em ${o.json}`);
  }
}

if (isMainThread) pai().catch((e) => { console.error(e); process.exit(1); });
else if (workerData && workerData.filho) filho().catch((e) => { console.error(e); process.exit(1); });
