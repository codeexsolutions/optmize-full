/*
 * ===========================================================================
 * O ORÁCULO — a nota de cada ajuste do vetorizador, em milhares de logos
 * ===========================================================================
 *
 *     node bancada/vetora/oraculo.mjs --de 0 --ate 6000 [--saida arquivo.jsonl] [--trabalhadores 10]
 *
 * Para cada semente: o logo sintético (`logos.mjs`), a imagem estragada
 * (`imagem.mjs`), as características que a rede vê
 * (`src/motores/vetorizador/rede/caracteristicas.js`) e o vetor de CADA
 * ajuste da grade (detalhe × suavidade, e mais alguns com a IA de ampliação
 * quando a imagem é pequena), cada um com a nota contra a verdade. É desse
 * mapa de notas que a rede aprende (`treinar.mjs`).
 *
 * Retoma de onde parou: a semente que já está no arquivo não é medida de novo.
 * O motor é empacotado uma vez pelo esbuild e os trabalhadores (processos
 * filhos, um núcleo cada) o importam do arquivo empacotado.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..", "..");
const args = process.argv.slice(2);
const opcao = (nome, padrao) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args[i + 1] : padrao; };
const DE = Number(opcao("de", 0)), ATE = Number(opcao("ate", 100));
const SAIDA = path.resolve(opcao("saida", path.join(AQUI, "dados", "oraculo.jsonl")));
const TRABALHADORES = Number(opcao("trabalhadores", Math.max(1, os.cpus().length - 2)));

/** A grade: 7 detalhes × 4 suavidades; com a IA, um pedaço dela (custa 16× mais pixels). */
export const AJUSTES = [];
for (const d of [0, 17, 33, 50, 67, 83, 100]) for (const s of [0, 33, 67, 100]) AJUSTES.push({ d, s });
export const AJUSTES_COM_IA = [];
for (const d of [17, 50, 83]) for (const s of [33, 67]) AJUSTES_COM_IA.push({ d, s });
export const LADO_COM_IA = 512;

const motorEmpacotado = path.join(os.tmpdir(), `vetora-motor-${process.pid}.mjs`);
const codigo = buildSync({
  stdin: {
    contents: `export * from "./src/motores/vetorizador/index.js"; export * from "./src/motores/vetorizador/rede/caracteristicas.js";`,
    resolveDir: RAIZ, sourcefile: "motor.js",
  },
  bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent",
}).outputFiles[0].text;
fs.writeFileSync(motorEmpacotado, codigo);

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
const feitas = new Set();
if (fs.existsSync(SAIDA)) {
  for (const l of fs.readFileSync(SAIDA, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try { feitas.add(JSON.parse(l).semente); } catch { /* linha cortada: refaz */ }
  }
}
const fila = [];
for (let s = DE; s < ATE; s++) if (!feitas.has(s)) fila.push(s);
console.log(`oráculo: ${fila.length} sementes a medir (${feitas.size} já no arquivo), ${TRABALHADORES} trabalhadores, ${AJUSTES.length} ajustes + ${AJUSTES_COM_IA.length} com IA`);
if (!fila.length) process.exit(0);

const saida = fs.openSync(SAIDA, "a");
const t0 = Date.now();
let prontas = 0, falhas = 0, ativos = 0;
const env = { ...process.env, VETORA_MOTOR: motorEmpacotado, VETORA_AJUSTES: JSON.stringify({ AJUSTES, AJUSTES_COM_IA, LADO_COM_IA }) };

await new Promise((terminou) => {
  for (let k = 0; k < Math.min(TRABALHADORES, fila.length); k++) {
    const filho = fork(path.join(AQUI, "oraculo-filho.mjs"), [], { env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
    ativos++;
    const proxima = () => {
      const s = fila.shift();
      if (s === undefined) { filho.send({ fim: true }); return; }
      filho.send({ semente: s });
    };
    filho.on("message", (msg) => {
      if (msg.pronto) { proxima(); return; }
      if (msg.erro) { falhas++; console.log(`  semente ${msg.semente} falhou: ${msg.erro.split("\n")[0]}`); }
      else fs.writeSync(saida, `${JSON.stringify(msg.linha)}\n`);
      prontas++;
      if (prontas % 25 === 0 || fila.length === 0) {
        const s = (Date.now() - t0) / 1000;
        console.log(`  ${prontas} prontas em ${s.toFixed(0)} s (${(prontas / s).toFixed(2)}/s), faltam ${fila.length}${falhas ? `, ${falhas} falhas` : ""}`);
      }
      proxima();
    });
    filho.on("exit", () => { if (--ativos === 0) terminou(); });
  }
});
fs.closeSync(saida);
fs.rmSync(motorEmpacotado, { force: true });
console.log(`oráculo: ${prontas} sementes em ${((Date.now() - t0) / 1000).toFixed(0)} s → ${SAIDA}`);
