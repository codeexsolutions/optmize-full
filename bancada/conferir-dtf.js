#!/usr/bin/env node
/**
 * O trabalho de DTF do dono (58,5 cm, folga 0,2, giro livre) no motor da
 * produção, variando o que se quer medir. Um worker só por corrida (as
 * alavancas valem por worker); várias sementes.
 *
 *   node bancada/conferir-dtf.js --pasta "C:/.../DTF" --tempo 30 --sementes 3 --variantes trab3,trab1,trab2
 */
const { carregarMotor } = require("./motor");
const { trabalhoDaPasta } = require("./pasta-de-artes");
const { buscarComoAProducao } = require("./corrida");

const o = { pasta: "C:/Users/pedro/OneDrive/Área de Trabalho/DTF", tempo: 30, sementes: 3, variantes: ["trab3", "trab1"], largura: 58.5, folga: 0.2 };
for (let i = 2; i < process.argv.length; i += 2) {
  const [k, v] = [process.argv[i].replace(/^--/, ""), process.argv[i + 1]];
  o[k] = k === "variantes" ? v.split(",") : (k === "pasta" ? v : Number(v));
}
const VARIANTES = {
  trab3: { encolherTrabalhadores: 3 },
  trab2: { encolherTrabalhadores: 2 },
  trab1: { encolherTrabalhadores: 1 },
  escada: { encolherTrabalhadores: 3, sparrowExato: false },
  hoje: { encolherTrabalhadores: 3, sparrowExato: false },
  giros: { encolherTrabalhadores: 3 },
  giros2: { encolherTrabalhadores: 3, sparrowBlocoCols: 2 },
  giros3: { encolherTrabalhadores: 3, sparrowBlocoCols: 3 },
};

(async () => {
  const motor = await carregarMotor({ comWasm: true });
  const trabalho = await trabalhoDaPasta(motor, o.pasta, { larguraTecido: o.largura, espaco: o.folga, giro: "livre" });
  console.log(`${trabalho.itens.length} peças · ${o.largura} cm · folga ${o.folga} · ${o.tempo}s · ${o.sementes} semente(s)`);
  const somas = {};
  for (let s = 0; s < o.sementes; s++) {
    const semente = 1 + s * 7919;
    const linha = [];
    for (const v of o.variantes) {
      const r = await buscarComoAProducao(motor, trabalho, {
        tempoMs: o.tempo * 1000, semente, meta: 0, fatias: 1, espalharSemente: true,
        extra: { motores: "contorno+vaos+faixas", encolher: true, ...VARIANTES[v] },
      });
      somas[v] = (somas[v] || 0) + r.consumo;
      const e = r.encolhimento || {};
      linha.push(`${v} ${(r.consumo / 100).toFixed(3)} m (busca ${e.antes ? (e.antes / 100).toFixed(3) : "—"}, ${e.relatos ?? "—"} relatos)`);
    }
    console.log(`semente ${String(semente).padStart(5)}  ${linha.join("  ·  ")}`);
  }
  console.log("\nmédia: " + o.variantes.map((v) => `${v} ${(somas[v] / o.sementes / 100).toFixed(3)} m`).join("  ·  "));
})().catch((e) => { console.error(e); process.exit(1); });
