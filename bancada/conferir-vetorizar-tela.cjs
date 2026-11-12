#!/usr/bin/env node
/**
 * BANCADA — a tela Vetorizar de verdade, num Chromium sem janela
 *
 *   node bancada/conferir-vetorizar-tela.cjs [--imagem arte.png] [--foto saida.png] [--ia]
 *
 * Sobe o Vite, abre `bancada/vetorizar-no-navegador.html` (a tela sozinha,
 * sem a casca que pede login), escolhe a imagem pelo campo de arquivo, como a
 * pessoa faria, espera o vetor (o worker de verdade) e fotografa a tela.
 *
 * Sem `--imagem`, gera um selo de teste em JPEG. Com `--ia`, o selo sai
 * MINÚSCULO (120 px) e a bancada sobe a rota do Extrator de verdade
 * (`servidor/extrator-api.js`, com a rede de ampliar de servidor/modelos)
 * num servidor de teste próprio, para onde o proxy do Vite aponta — o
 * servidor do programa exige a conta logada, e esta bancada não mexe em
 * sessão. Aí ela confere o caminho inteiro: o vetor direto chega, a IA liga
 * sozinha (imagem pequena e nítida), a ampliação roda e o vetor novo vem por
 * cima, no tamanho original.
 *
 * Sempre, no fim: clica em "PDF", pega o arquivo baixado e o desenha com o
 * pdf.js contra o SVG da prévia (`compararPdfComSvg`, na página da bancada).
 * O PDF tem de ser o mesmo desenho — furo como furo, cor por cor — e ter a
 * largura em centímetros que a tela mostra.
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
  try {
    const p = await nav.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    p.on("pageerror", (e) => { falhou = true; console.log("erro na página:", e.message); });
    await p.goto(`http://127.0.0.1:${porta}/bancada/vetorizar-no-navegador.html`, { waitUntil: "networkidle2" });
    await p.waitForFunction("window.bancadaPronta === true", { timeout: 60000 });
    const campo = await p.waitForSelector('input[type="file"]');
    const t0 = Date.now();
    await campo.uploadFile(imagem);
    const pronto = () => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Baixar SVG"))
      && !!document.querySelector('img[alt="O vetor"]');
    await p.waitForFunction(pronto, { timeout: 120000 });
    const msDireto = Date.now() - t0;
    const ler = () => p.evaluate(() => {
      const texto = document.body.innerText;
      const ia = [...document.querySelectorAll('input[type="checkbox"]')].find((c) => c.parentElement?.textContent?.includes("Limpar e ampliar com IA"));
      return {
        nos: texto.match(/Nós\s+([\d.]+)/)?.[1],
        cores: texto.match(/Cores\s+(\d+)\s/)?.[1],
        ia: ia ? ia.checked : null,
        andando: /Limpando e ampliando com IA|Achando as cores|Ajustando as curvas|Montando o vetor/.test(texto),
        svg: document.querySelector('img[alt="O vetor"]')?.getAttribute("src") || null,
      };
    });
    const direto = await ler();
    console.log(`vetor direto em ${msDireto} ms: ${direto.cores} cores, ${direto.nos} nós; IA ligada: ${direto.ia}`);
    if (COM_IA) {
      // A IA liga sozinha, a ampliação começa (o andamento dela aparece)…
      await p.waitForFunction(() => /Limpando e ampliando com IA/.test(document.body.innerText), { timeout: 20000, polling: 50 });
      console.log(`a IA ligou sozinha e começou a ampliar em ${Date.now() - t0} ms`);
      // …e o vetor dela vem por cima (o endereço do SVG muda).
      await p.waitForFunction((antes) => {
        const texto = document.body.innerText;
        const andando = /Limpando e ampliando com IA|Achando as cores|Separando as regiões|Traçando as divisas|Ajustando as curvas|Montando o vetor/.test(texto);
        const src = document.querySelector('img[alt="O vetor"]')?.getAttribute("src");
        return !andando && src && src !== antes;
      }, { timeout: 240000, polling: 250 }, direto.svg);
      const comIa = await ler();
      // O vetor da IA sai no tamanho ORIGINAL (a `escala` desfaz a ampliação).
      const tamanho = await p.evaluate(async () => {
        const src = document.querySelector('img[alt="O vetor"]').getAttribute("src");
        const texto = await (await fetch(src)).text();
        return texto.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/)?.slice(1, 3).join(" × ");
      });
      console.log(`vetor com IA em ${Date.now() - t0} ms: ${comIa.cores} cores, ${comIa.nos} nós; IA ligada: ${comIa.ia}; SVG de ${tamanho}`);
      if (tamanho !== "160 × 120") { falhou = true; console.log(`FALHOU: o vetor da IA devia sair em 160 × 120, saiu em ${tamanho}`); }
    }
    // O PDF do botão, contra o SVG.
    const pastaDoPdf = fs.mkdtempSync(path.join(os.tmpdir(), "vetorizar-pdf-"));
    const cdp = await p.target().createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: pastaDoPdf });
    // A tela não mostra mais a largura: o PDF sai com a da imagem a 300 ppp,
    // no mínimo 10 cm (ver `abrir`, em Vetorizar.tsx).
    const larguraPx = await p.evaluate(() => Number((document.body.innerText.match(/(\d+) × \d+ px/) || [])[1]));
    const larguraCm = Math.max(10, Math.round(((larguraPx / 300) * 2.54) * 10) / 10);
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "PDF").click());
    let arquivoPdf = null;
    for (let t = 0; t < 100 && !arquivoPdf; t++) {
      await new Promise((ok) => setTimeout(ok, 100));
      arquivoPdf = fs.readdirSync(pastaDoPdf).find((n) => n.endsWith(".pdf")) || null;
    }
    if (!arquivoPdf) { falhou = true; console.log("FALHOU: o botão PDF não baixou nada"); }
    else {
      const bytes = fs.readFileSync(path.join(pastaDoPdf, arquivoPdf));
      const r = await p.evaluate((b64) => window.compararPdfComSvg(b64), bytes.toString("base64"));
      const cm = (r.pontos[0] / 72) * 2.54;
      console.log(`PDF ${arquivoPdf}: ${(bytes.length / 1024).toFixed(1)} KB, ${cm.toFixed(2)} cm de largura (a tela pede ${larguraCm}); igual ao SVG em ${(r.iguais * 100).toFixed(2)}% dos pixels (tinta: PDF ${(r.tintaPdf * 100).toFixed(1)}%, SVG ${(r.tintaSvg * 100).toFixed(1)}%)`);
      if (r.iguais < 0.99) { falhou = true; console.log("FALHOU: o PDF não é o mesmo desenho do SVG"); }
      if (r.tintaPdf < 0.05 || r.tintaSvg < 0.05) { falhou = true; console.log("FALHOU: o PDF ou o SVG saiu em branco"); }
      if (Math.abs(cm - larguraCm) > 0.01) { falhou = true; console.log("FALHOU: a largura do PDF não é a da tela"); }
    }
    fs.rmSync(pastaDoPdf, { recursive: true, force: true });

    await new Promise((ok) => setTimeout(ok, 600));
    await p.screenshot({ path: foto });
    console.log(`foto: ${foto}`);
  } finally {
    await nav.close();
    await vite.close();
    if (servidorDeTeste) servidorDeTeste.close();
  }
  if (falhou) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
