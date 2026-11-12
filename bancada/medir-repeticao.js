#!/usr/bin/env node
/**
 * Quanto da BUSCA (a primeira fase) reavalia o que já avaliou.
 *
 * Roda a busca da produção (uma fatia do portfólio contorno+vaos+faixas) com o
 * medidor de repetição ligado (`criarMedidorDeRepeticao`, em encaixeMotor.js)
 * e diz, por trabalho: quantas tentativas, quantas ordens equivalentes eram
 * novas, quantos encaixes e quantas metragens diferentes saíram, e quando veio
 * a última melhora.
 *
 *   node bancada/medir-repeticao.js --trabalhos producao-avulsa,camiseta+manga+gola --tempo 3,20
 */
const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

const o = { trabalhos: ["producao-avulsa", "camiseta+manga+gola", "pedido-confeccao", "giro-livre"], tempos: [3, 20], json: null };
for (let i = 2; i < process.argv.length; i += 2) {
  const [k, v] = [process.argv[i], process.argv[i + 1]];
  if (k === "--trabalhos") o.trabalhos = v.split(",");
  else if (k === "--tempo") o.tempos = v.split(",").map(Number);
  else if (k === "--json") o.json = v;
  else throw new Error(`argumento desconhecido: ${k}`);
}

(async () => {
  const motor = await carregarMotor({ comWasm: true });
  const saida = [];
  console.log(`${"trabalho".padEnd(22)} ${"tempo".padStart(5)} ${"tent.".padStart(7)} ${"ordens novas".padStart(13)} ${"encaixes novos".padStart(15)} ${"metragens".padStart(9)}  melhor em  consumo`);
  for (const nome of o.trabalhos) {
    const receita = TRABALHOS[nome];
    const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
    const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, { passo, raio, giro: p.giro || "180", qtd: p.qtd }));
    const itens = expandir(pecas);
    const alturaMax = itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + receita.espaco, 0);
    const motores = ["contorno", "vaos", "faixas"];
    for (const tempo of o.tempos) {
      const r = await motor.buscarMelhorEncaixe(itens, {
        larguraTecido: receita.larguraTecido, espaco: receita.espaco, comprimentoBancada: 0,
        passo, raio, alturaMax, motores: motor.motoresDaFatia(0, 1, motores),
        memoria: null, alvo: null, rede: null, redeMadura: false,
        vetorTrabalho: motor.vetorDoTrabalho(pecas, receita.larguraTecido),
        metaAproveitamento: 0, tempoMaximoMs: tempo * 1000, msSemGanho: Math.max(800, tempo * 250),
        tentativasPorLote: itens.length >= 120 ? 1 : 8,
        fatia: motor.fatiaDoPortfolio(0, 1, motores), saltoX: 1, semente: 20260824,
        ...motor.papelDaFatia(0, 1).config,
        medirRepeticao: true,
      });
      const q = r.repeticao;
      const pct = (a) => `${((a / q.tentativas) * 100).toFixed(1)}%`;
      console.log(`${nome.padEnd(22)} ${String(tempo).padStart(4)}s ${String(q.tentativas).padStart(7)} ${`${q.ordensUnicas} (${pct(q.ordensUnicas)})`.padStart(13)} ${`${q.encaixesUnicos} (${pct(q.encaixesUnicos)})`.padStart(15)} ${String(q.consumosUnicos).padStart(9)}  ${((r.melhorSolucaoMs || 0) / 1000).toFixed(2).padStart(7)}s  ${(r.consumo / 100).toFixed(3)} m`);
      saida.push({ trabalho: nome, tempo, ...q, melhorSolucaoMs: r.melhorSolucaoMs, consumo: r.consumo, receita: r.receita });
    }
  }
  if (o.json) require("fs").writeFileSync(o.json, JSON.stringify({ quando: new Date().toISOString(), saida }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
