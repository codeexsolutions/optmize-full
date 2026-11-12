#!/usr/bin/env node
/**
 * BANCADA — a cooperação dos workers no CAMINHO DE PRODUÇÃO, no navegador
 *
 *   node bancada/conferir-cooperar-navegador.cjs --tempo 45 --sementes 2 --cooperar 1,3
 *
 * Sobe o Vite deste repositório, abre `bancada/cooperar-no-navegador.html` num
 * Chromium sem janela e roda `buscarMelhorEncaixeEmParalelo` de verdade (Web
 * Workers, o WASM do sparrow servido pelo Vite), uma vez por braço e semente.
 * Confere que todo encaixe final passa na trava e relata o consumo.
 */
const net = require("net");
const path = require("path");

const o = { tempo: 45, sementes: 2, cooperar: [1, 3], copias: 1, rodadas: null, etapas: null };
for (let i = 2; i < process.argv.length; i += 2) {
  const [k, v] = [process.argv[i], process.argv[i + 1]];
  if (k === "--tempo") o.tempo = Number(v);
  else if (k === "--sementes") o.sementes = Number(v);
  else if (k === "--cooperar") o.cooperar = v.split(",").map(Number);
  else if (k === "--copias") o.copias = Number(v);
  else if (k === "--rodadas") o.rodadas = JSON.parse(v);
  else if (k === "--etapas") o.etapas = JSON.parse(v);
  else throw new Error(`argumento desconhecido: ${k}`);
}

const portaLivre = () => new Promise((pronto) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => pronto(port)); });
});

(async () => {
  const { createServer } = await import("vite");
  const puppeteer = require("puppeteer");
  const raiz = path.join(__dirname, "..");
  const porta = await portaLivre();
  const vite = await createServer({ root: raiz, configFile: path.join(raiz, "vite.config.mts"), server: { port: porta, host: "127.0.0.1", strictPort: true }, logLevel: "error" });
  await vite.listen();
  const navegador = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  let falhou = false;
  try {
    const p = await navegador.newPage();
    p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`  [navegador] ${m.text()}`); });
    await p.goto(`http://127.0.0.1:${porta}/bancada/cooperar-no-navegador.html`, { waitUntil: "networkidle2" });
    await p.waitForFunction("window.bancadaPronta === true", { timeout: 60000 });
    const linhas = [];
    for (let s = 0; s < o.sementes; s++) {
      const semente = 1 + s * 7919;
      // Ordem alternada entre sementes: a deriva da máquina não pesa num braço só.
      const ordem = s % 2 === 0 ? o.cooperar : [...o.cooperar].reverse();
      for (const cooperar of ordem) {
        const r = await p.evaluate((a) => window.bancada.rodar(a), { copias: o.copias, tempo: o.tempo, cooperar, semente, rodadas: cooperar > 1 ? o.rodadas : null, etapas: o.etapas });
        linhas.push({ semente, ...r });
        const e = r.encolhimento || {};
        console.log(`semente ${String(semente).padStart(5)}  cooperar ${cooperar}  ${r.pecas} peças  ${(r.consumo / 100).toFixed(3)} m`
          + `  (busca ${(e.antes / 100).toFixed(3)} m, ${r.segundos}s, ${e.workers || "?"} workers, aval ${e.avaliacoes || 0}, sep ${e.separacoesResolvidas || 0}/${e.separacoes || 0}, rej ${e.rejeitados || 0}/${e.relatos || 0})`
          + `  ${r.valido ? "trava OK" : "TRAVA FALHOU"}${e.motivo ? `  motivo: ${e.motivo}` : ""}`);
        if (!r.valido) falhou = true;
      }
    }
    for (const c of o.cooperar) {
      const cs = linhas.filter((l) => l.cooperar === c);
      const m = cs.reduce((t, l) => t + l.consumo, 0) / cs.length;
      console.log(`cooperar ${c}: média ${(m / 100).toFixed(3)} m em ${cs.length} corrida(s)`);
    }
  } finally {
    await navegador.close();
    await vite.close();
  }
  if (falhou) { console.error("ALGUM ENCAIXE NÃO PASSOU NA TRAVA"); process.exit(1); }
  console.log("OK");
})().catch((e) => { console.error(e); process.exit(1); });
