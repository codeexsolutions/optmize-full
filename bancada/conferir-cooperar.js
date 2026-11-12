#!/usr/bin/env node
/**
 * Workers que COOPERAM contra workers independentes, com o mesmo tempo de
 * máquina. Independentes: N sparrows de T s, cada um da busca, fica o melhor
 * (o de hoje). Cooperando: R rodadas de T/R s; ao fim de cada rodada, os N
 * continuam do melhor de todos, com sementes novas. Os N rodam um depois do
 * outro aqui (o que vale é o tempo de cada um).
 *
 *   node bancada/conferir-cooperar.js --workers 4 --tempo 30 --rodadas 3 --sementes 2
 */
const { carregarMotor } = require("./motor");
const { trabalhoDaPasta } = require("./pasta-de-artes");
const { buscarComoAProducao } = require("./corrida");

const o = { pasta: "C:/Users/pedro/OneDrive/Área de Trabalho/DTF", workers: 4, tempo: 30, rodadas: 3, sementes: 2, busca: 4 };
for (let i = 2; i < process.argv.length; i += 2) o[process.argv[i].replace(/^--/, "")] = process.argv[i] === "--pasta" ? process.argv[i + 1] : Number(process.argv[i + 1]);

(async () => {
  const motor = await carregarMotor({ comWasm: true });
  const t = await trabalhoDaPasta(motor, o.pasta, { larguraTecido: 58.5, espaco: 0.2, giro: "livre" });
  const config = { larguraTecido: 58.5, passo: t.passo, raio: t.raio, comprimentoBancada: 0 };
  console.log(`${t.itens.length} peças · ${o.workers} workers × ${o.tempo}s · ${o.rodadas} rodadas`);
  for (let s = 0; s < o.sementes; s++) {
    const semente = 1 + s * 7919;
    // A partida: a busca curta, igual para os dois braços.
    let base = null;
    const orig = motor.buscarMelhorEncaixe;
    motor.buscarMelhorEncaixe = async (...a) => { const r = await orig(...a); if (r && r.naoEncaixadas.length === 0 && (!base || r.consumo < base.consumo)) base = r; return r; };
    await buscarComoAProducao(motor, t, { tempoMs: o.busca * 1000, semente, meta: 0, fatias: 1, espalharSemente: true, extra: { motores: "contorno+vaos+faixas" } });
    motor.buscarMelhorEncaixe = orig;

    let indep = base;
    for (let k = 0; k < o.workers; k++) {
      const r = motor.encolherEncaixe(t.itens, base, config, { tempoMs: o.tempo * 1000, semente: semente * 100 + k });
      if (r.resultado && r.resultado.consumo < indep.consumo) indep = r.resultado;
    }
    let coop = base;
    for (let rodada = 0; rodada < o.rodadas; rodada++) {
      let melhor = coop;
      for (let k = 0; k < o.workers; k++) {
        const r = motor.encolherEncaixe(t.itens, coop, config, { tempoMs: (o.tempo / o.rodadas) * 1000, semente: semente * 1000 + rodada * 10 + k });
        if (r.resultado && r.resultado.consumo < melhor.consumo) melhor = r.resultado;
      }
      coop = melhor;
    }
    console.log(`semente ${semente}: busca ${(base.consumo / 100).toFixed(3)} m · independentes ${(indep.consumo / 100).toFixed(3)} m · cooperando ${(coop.consumo / 100).toFixed(3)} m`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
