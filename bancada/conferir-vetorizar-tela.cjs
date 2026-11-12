#!/usr/bin/env node
/**
 * BANCADA — a tela da Vetora de verdade, num Chromium sem janela
 *
 *   node bancada/conferir-vetorizar-tela.cjs [--imagem arte.png] [--foto saida.png] [--ia]
 *
 * Sobe o Vite, abre `bancada/vetorizar-no-navegador.html` (a tela sozinha,
 * sem a casca que pede login), escolhe a imagem pelo campo de arquivo, como a
 * pessoa faria, e confere o caminho inteiro:
 *
 *   - a rede olha a imagem e os TRÊS modelos ficam prontos (os workers de
 *     verdade), com números diferentes;
 *   - o visor aproxima (o botão +) e mostra os nós (o botão Nós) — e uma foto
 *     de perto vai junto (`-perto.png`);
 *   - trocar de modelo troca o cartão do vetor;
 *   - o PDF baixado pelo botão, desenhado pelo pdf.js, é o mesmo desenho do
 *     SVG do modelo escolhido, na largura em centímetros da imagem.
 *
 * Sem `--imagem`, gera um selo de teste em JPEG. Com `--ia`, o selo sai
 * MINÚSCULO (120 px) e a bancada sobe a rota do Extrator de verdade
 * (`servidor/extrator-api.js`, com a rede de ampliar de servidor/modelos)
 * num servidor de teste próprio, para onde o proxy do Vite aponta — o
 * servidor do programa exige a conta logada, e esta bancada não mexe em
 * sessão. Aí os modelos que a rede manda pela IA passam pela ampliação.
 */
const net = require("net");
const path = require("path");
const os = require("os");
const fs = require("fs");

const args = process.argv.slice(2);
const opcao = (nome) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args[i + 1] : null; };
const COM_IA = args.includes("--ia");

const portaLivre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); });
});

(async () => {
  const raiz = path.join(__dirname, "..");
  const sharp = require("sharp");
  let imagem = opcao("imagem");
  const foto = opcao("foto") || path.join(os.tmpdir(), "vetorizar-tela.png");
  if (!imagem) {
    imagem = path.join(os.tmpdir(), COM_IA ? "vetorizar-teste-minusculo.jpg" : "vetorizar-teste.jpg");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#ffffff"/><circle cx="130" cy="180" r="110" fill="#1d3557"/><circle cx="130" cy="180" r="88" fill="none" stroke="#f1c40f" stroke-width="10"/><path d="M80 225 L130 115 L180 225 Z" fill="#e63946"/><text x="250" y="160" font-family="Arial" font-weight="bold" font-size="54" fill="#1d3557">VETOR</text><text x="252" y="215" font-family="Arial" font-size="30" fill="#e63946">próprio</text></svg>`;
    let s = sharp(Buffer.from(svg));
    if (COM_IA) s = s.resize(160, 120);
    await s.jpeg({ quality: COM_IA ? 60 : 70 }).toFile(imagem);
  }

  // A rota do Extrator num servidor de teste (só com --ia).
  let servidorDeTeste = null;
  let proxy;
  if (COM_IA) {
    const ampliar = require("../servidor/extrator-ampliar");
    const motivo = ampliar.porqueNaoAmplia();
    if (motivo) throw new Error(`a rede de ampliar não está aqui (${motivo}) — rode \`npm run modelos\``);
    const express = require("express");
    const app = express();
    app.use("/api/extrator", require("../servidor/extrator-api"));
    const porta = await portaLivre();
    servidorDeTeste = await new Promise((ok) => { const s = app.listen(porta, "127.0.0.1", () => ok(s)); });
    proxy = { "/api": { target: `http://127.0.0.1:${porta}`, changeOrigin: true } };
  }

  const { createServer } = await import("vite");
  const puppeteer = require("puppeteer");
  const porta = await portaLivre();
  const vite = await createServer({
    root: raiz,
    configFile: path.join(raiz, "vite.config.mts"),
    server: { port: porta, host: "127.0.0.1", strictPort: true, ...(proxy ? { proxy } : {}) },
    logLevel: "error",
  });
  await vite.listen();
  const nav = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  let falhou = false;
  const falha = (texto) => { falhou = true; console.log(`FALHOU: ${texto}`); };
  try {
    const p = await nav.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    p.on("pageerror", (e) => falha(`erro na página: ${e.message}`));
    await p.goto(`http://127.0.0.1:${porta}/bancada/vetorizar-no-navegador.html`, { waitUntil: "networkidle2" });
    await p.waitForFunction("window.bancadaPronta === true", { timeout: 60000 });
    const campo = await p.waitForSelector('input[type="file"]');
    const t0 = Date.now();
    await campo.uploadFile(imagem);

    // Os três modelos prontos.
    const lerModelos = () => p.evaluate(() => [...document.querySelectorAll('[role="radio"]')].map((b) => ({
      texto: b.textContent.replace(/\s+/g, " ").trim(),
      ia: !!b.querySelector('[title^="Feito sobre a imagem"]'),
      escolhido: b.getAttribute("aria-checked") === "true",
    })));
    await p.waitForFunction(() => [...document.querySelectorAll('[role="radio"]')].filter((b) => /nós ·/.test(b.textContent)).length === 3, { timeout: 300000, polling: 200 });
    const modelos = await lerModelos();
    console.log(`os três modelos em ${Date.now() - t0} ms:`);
    for (const m of modelos) console.log(`  ${m.escolhido ? "▸" : " "} ${m.texto}${m.ia ? "  (com a IA)" : ""}`);
    const nos = modelos.map((m) => Number(((m.texto.match(/([\d.]+) nós/) || [])[1] || "0").replace(/\./g, "")));
    if (new Set(nos).size < 2) falha("os três modelos saíram com o mesmo número de nós");
    if (!modelos.find((m) => m.escolhido && /Equilibrado/.test(m.texto))) falha("o modelo escolhido de início não é o Equilibrado");

    await new Promise((ok) => setTimeout(ok, 500));
    await p.screenshot({ path: foto });

    // O zoom e os nós.
    const zoom = () => p.evaluate(() => Number((document.body.innerText.match(/(\d+)%/) || [])[1]));
    const antes = await zoom();
    for (let k = 0; k < 3; k++) await p.click('button[title="Aproximar (+)"]');
    await p.click('button[title="Mostrar os nós do vetor (N)"]');
    await new Promise((ok) => setTimeout(ok, 400));
    const depois = await zoom();
    console.log(`zoom: ${antes}% → ${depois}%`);
    if (!(depois > antes * 3)) falha("o botão de aproximar não aproximou");
    await p.screenshot({ path: foto.replace(/\.png$/, "-perto.png") });
    await p.click('button[title="Caber na tela (0)"]');
    await p.click('button[title="Mostrar os nós do vetor (N)"]');

    // Trocar de modelo troca o cartão do vetor.
    await p.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => /Fiel/.test(b.textContent)).click());
    await p.waitForFunction(() => /O vetor · Fiel/.test(document.body.innerText), { timeout: 5000 }).catch(() => falha("trocar para o Fiel não trocou o cartão"));

    // O PDF do botão, contra o SVG do modelo escolhido.
    const pastaDoPdf = fs.mkdtempSync(path.join(os.tmpdir(), "vetorizar-pdf-"));
    const cdp = await p.target().createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: pastaDoPdf });
    const larguraPx = await p.evaluate(() => Number((document.body.innerText.match(/(\d+) × \d+ px/) || [])[1]));
    const larguraCm = Math.max(10, Math.round(((larguraPx / 300) * 2.54) * 10) / 10);
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "PDF").click());
    let arquivoPdf = null;
    for (let t = 0; t < 100 && !arquivoPdf; t++) {
      await new Promise((ok) => setTimeout(ok, 100));
      arquivoPdf = fs.readdirSync(pastaDoPdf).find((n) => n.endsWith(".pdf")) || null;
    }
    if (!arquivoPdf) falha("o botão PDF não baixou nada");
    else {
      const bytes = fs.readFileSync(path.join(pastaDoPdf, arquivoPdf));
      const r = await p.evaluate((b64) => window.compararPdfComSvg(b64), bytes.toString("base64"));
      const cm = (r.pontos[0] / 72) * 2.54;
      console.log(`PDF ${arquivoPdf}: ${(bytes.length / 1024).toFixed(1)} KB, ${cm.toFixed(2)} cm (a imagem pede ${larguraCm}); igual ao SVG do modelo em ${(r.iguais * 100).toFixed(2)}% dos pixels (tinta: PDF ${(r.tintaPdf * 100).toFixed(1)}%, SVG ${(r.tintaSvg * 100).toFixed(1)}%)`);
      if (r.iguais < 0.99) falha("o PDF não é o mesmo desenho do SVG");
      if (r.tintaPdf < 0.05 || r.tintaSvg < 0.05) falha("o PDF ou o SVG saiu em branco");
      if (Math.abs(cm - larguraCm) > 0.01) falha("a largura do PDF não é a da imagem");
    }
    fs.rmSync(pastaDoPdf, { recursive: true, force: true });
    console.log(`fotos: ${foto} e ${foto.replace(/\.png$/, "-perto.png")}`);
  } finally {
    await nav.close();
    await vite.close();
    if (servidorDeTeste) servidorDeTeste.close();
  }
  if (falhou) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
