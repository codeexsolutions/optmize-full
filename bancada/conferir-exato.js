#!/usr/bin/env node
/**
 * P7 — o sparrow no contorno exato contra o casco em escada, com a mesma
 * busca de partida, a mesma semente e o mesmo relógio, no portfólio da
 * produção. Cada encaixe que sai passa pela trava (trechos exatos).
 *
 *   node bancada/conferir-exato.js --tempo 60 --sementes 3 [--trabalhos a,b] [--json saida.json]
 */
const fs = require("fs");
const { carregarMotor } = require("./motor");
const { prepararTrabalho, buscarComoAProducao } = require("./corrida");

const o = { tempo: 60, sementes: 3, trabalhos: ["producao-avulsa", "camiseta+manga+gola", "giro-livre", "calca-bolso"], json: null };
for (let i = 2; i < process.argv.length; i += 2) {
  const [k, v] = [process.argv[i], process.argv[i + 1]];
  if (k === "--tempo") o.tempo = Number(v);
  else if (k === "--sementes") o.sementes = Number(v);
  else if (k === "--trabalhos") o.trabalhos = v.split(",");
  else if (k === "--json") o.json = v;
  else throw new Error(`argumento desconhecido: ${k}`);
}

(async () => {
  const motor = await carregarMotor({ comWasm: true });
  if (!motor.comEncolhedor) throw new Error("o WASM do sparrow não carregou");
  const saida = { quando: new Date().toISOString(), opcoes: o, corridas: [] };
  console.log(`P7 · ${o.tempo}s · ${o.sementes} semente(s) · contorno+vaos+faixas\n`);
  for (const nome of o.trabalhos) {
    const trabalho = prepararTrabalho(motor, nome);
    for (let s = 0; s < o.sementes; s++) {
      const semente = 1 + s * 7919;
      const linha = { trabalho: nome, semente };
      for (const [braco, exato] of [["escada", false], ["exato", true]]) {
        const r = await buscarComoAProducao(motor, trabalho, {
          tempoMs: o.tempo * 1000, semente, meta: 0, fatias: 1, espalharSemente: true,
          extra: { motores: "contorno+vaos+faixas", encolher: true, sparrowExato: exato },
        });
        const e = r.encolhimento || {};
        linha[braco] = { consumo: r.consumo, busca: e.antes, relatos: e.relatos, rejeitados: e.rejeitados };
      }
      const d = ((linha.exato.consumo - linha.escada.consumo) / linha.escada.consumo) * 100;
      linha.diferenca = d;
      saida.corridas.push(linha);
      console.log(`${nome.padEnd(22)} semente ${String(semente).padStart(5)}  escada ${(linha.escada.consumo / 100).toFixed(3)} m`
        + ` (rej ${linha.escada.rejeitados}/${linha.escada.relatos})  exato ${(linha.exato.consumo / 100).toFixed(3)} m`
        + ` (rej ${linha.exato.rejeitados}/${linha.exato.relatos})  exato×escada ${d >= 0 ? "+" : ""}${d.toFixed(2)}%`);
    }
  }
  const media = saida.corridas.reduce((t, l) => t + l.diferenca, 0) / saida.corridas.length;
  console.log(`\nmédia exato×escada: ${media >= 0 ? "+" : ""}${media.toFixed(2)}% em ${saida.corridas.length} pares`);
  if (o.json) { fs.writeFileSync(o.json, JSON.stringify(saida, null, 2)); console.log(`guardado em ${o.json}`); }
})().catch((e) => { console.error(e); process.exit(1); });
