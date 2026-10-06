/*
 * BANCADA — qual rede de recorte o Extrator usa (medição, não conferência)
 *
 *     npm run medir:recorte [-- pasta]            mede as três nas fotos com gabarito
 *     npm run medir:recorte -- [pasta] --grade    grava cópias com a grade de 100 px, para escrever o gabarito
 *
 * As três candidatas são baixadas em bancada/.redes (fora do git), com o
 * sha256 conferido. Antes das fotos, cada uma passa pela foto de mentira: se
 * ela não acha nem o disco vermelho, o erro é do ADAPTADOR, e nenhum número
 * de foto real vale. As folhas (a máscara em vermelho sobre a foto) ficam em
 * <pasta>/medicao, para olhar.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { avaliarMascara, fotoDeTrabalho, fotoSintetica, lerGabaritos, PASTA_DAS_FOTOS } from "./extrator-comum.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const rede = require("../servidor/extrator-rede.js");

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REDES = path.join(RAIZ, "bancada", ".redes");
const args = process.argv.slice(2);
const pasta = args.find((a) => !a.startsWith("--")) || PASTA_DAS_FOTOS;
const soma = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

async function baixarAsCandidatas() {
  fs.mkdirSync(REDES, { recursive: true });
  for (const [nome, origens] of Object.entries(rede.ORIGENS)) {
    for (const parte of ["codificador", "decodificador"]) {
      const o = origens[parte];
      const destino = path.join(REDES, rede.ADAPTADORES[nome].arquivos[parte]);
      if (fs.existsSync(destino) && soma(destino) === o.sha256) continue;
      process.stdout.write(`baixando ${path.basename(destino)} (${(o.tamanho / 1048576).toFixed(1)} MB)… `);
      const r = await fetch(o.de);
      if (!r.ok) throw new Error(`${o.de} respondeu ${r.status}`);
      fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
      if (soma(destino) !== o.sha256) throw new Error(`${path.basename(destino)} veio diferente do esperado`);
      console.log("ok");
    }
  }
}

async function grade() {
  const saida = path.join(pasta, "grade");
  fs.mkdirSync(saida, { recursive: true });
  for (const n of fs.readdirSync(pasta).filter((n) => /\.(jpe?g|png|webp)$/i.test(n))) {
    const f = await fotoDeTrabalho(path.join(pasta, n));
    const linhas = [];
    for (let x = 0; x < f.largura; x += 100) {
      linhas.push(`<line x1="${x}" y1="0" x2="${x}" y2="${f.altura}" stroke="#ff00ff"/><text x="${x + 2}" y="14" font-size="14" fill="#ff00ff">${x}</text>`);
    }
    for (let y = 0; y < f.altura; y += 100) {
      linhas.push(`<line x1="0" y1="${y}" x2="${f.largura}" y2="${y}" stroke="#ff00ff"/><text x="2" y="${y + 14}" font-size="14" fill="#ff00ff">${y}</text>`);
    }
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${f.largura}" height="${f.altura}">${linhas.join("")}</svg>`);
    await sharp(f.rgb, { raw: { width: f.largura, height: f.altura, channels: 3 } })
      .composite([{ input: svg }]).png().toFile(path.join(saida, n.replace(/\.[^.]+$/, ".png")));
    console.log(`grade: ${n} → ${f.largura} × ${f.altura}`);
  }
}

/** A máscara em vermelho sobre a foto. */
async function folha(f, alfa, arquivo) {
  const px = Buffer.alloc(f.largura * f.altura * 3);
  for (let i = 0; i < f.largura * f.altura; i++) {
    const a = (alfa[i] / 255) * 0.6;
    px[i * 3] = Math.round(f.rgb[i * 3] * (1 - a) + 255 * a);
    px[i * 3 + 1] = Math.round(f.rgb[i * 3 + 1] * (1 - a));
    px[i * 3 + 2] = Math.round(f.rgb[i * 3 + 2] * (1 - a));
  }
  await sharp(px, { raw: { width: f.largura, height: f.altura, channels: 3 } }).jpeg({ quality: 80 }).toFile(arquivo);
}

const media = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
const fmt = (v, casas = 3) => (Number.isNaN(v) ? "  —  " : v.toFixed(casas));

async function medir() {
  await baixarAsCandidatas();
  const sintetica = await fotoSintetica();
  const fotos = lerGabaritos(pasta);
  if (fotos.length === 0) console.log(`(nenhuma foto com gabarito em ${pasta}: só a foto de mentira)`);
  const saida = path.join(pasta, "medicao");
  if (fotos.length) fs.mkdirSync(saida, { recursive: true });

  const linhas = [];
  for (const nome of Object.keys(rede.ADAPTADORES)) {
    const aceitaCaixa = rede.ADAPTADORES[nome].aceitaCaixa;
    // 1. a foto de mentira
    const lida = await rede.lerFoto(sintetica.rgb, sintetica.largura, sintetica.altura, { nome, pasta: REDES });
    for (const alvo of [sintetica.disco, sintetica.quadrado]) {
      const m = await rede.mascaraDe(lida.id, { pontos: [{ x: alvo.clique[0], y: alvo.clique[1], inclui: true }], caixa: null });
      const n = avaliarMascara(m.alfa, m.largura, m.altura, alvo.caixa);
      if (n.iou < 0.8 || n.dentro < 0.9) {
        throw new Error(`${nome}: na foto de mentira, IoU ${n.iou.toFixed(2)} e dentro ${n.dentro.toFixed(2)} — o adaptador está errado`);
      }
    }
    // 2. as fotos reais
    const cod = [], dec = [], iouClique = [], dentroClique = [], iouCaixa = [];
    for (const f of fotos) {
      const foto = await fotoDeTrabalho(f.foto);
      const l = await rede.lerFoto(foto.rgb, foto.largura, foto.altura, { nome, pasta: REDES });
      cod.push(l.ms);
      for (const e of f.elementos) {
        const m = await rede.mascaraDe(l.id, { pontos: [{ x: e.clique[0], y: e.clique[1], inclui: true }], caixa: null });
        dec.push(m.ms);
        const n = avaliarMascara(m.alfa, m.largura, m.altura, e.caixa);
        iouClique.push(n.iou);
        dentroClique.push(n.dentro);
        await folha(foto, m.alfa, path.join(saida, `${nome}-${f.nome.replace(/\.[^.]+$/, "")}-${e.nome}.jpg`));
        if (aceitaCaixa) {
          const [x0, y0, x1, y1] = e.caixa;
          const mc = await rede.mascaraDe(l.id, { pontos: [], caixa: { x0, y0, x1, y1 } });
          iouCaixa.push(avaliarMascara(mc.alfa, mc.largura, mc.altura, e.caixa).iou);
        }
      }
    }
    linhas.push({
      nome, codMedio: media(cod), codMaximo: cod.length ? Math.max(...cod) : NaN, decMedio: media(dec),
      iouClique: media(iouClique), dentro: media(dentroClique), iouCaixa: media(iouCaixa),
    });
    console.log(`${nome}: a foto de mentira passou`);
  }

  console.log("\nrede           codificador (média / máx)   decodificador   IoU clique   dentro   IoU caixa");
  for (const l of linhas) {
    console.log(`${l.nome.padEnd(14)} ${fmt(l.codMedio, 0).padStart(6)} / ${fmt(l.codMaximo, 0).padStart(6)} ms    `
      + `${fmt(l.decMedio, 0).padStart(6)} ms     ${fmt(l.iouClique)}     ${fmt(l.dentro)}    ${fmt(l.iouCaixa)}`);
  }
  if (fotos.length) console.log(`\nas folhas (máscara em vermelho) estão em ${saida}`);
}

(args.includes("--grade") ? grade() : medir()).catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
