/*
 * ===========================================================================
 * BANCADA — o vetorizador próprio contra o desenho verdadeiro
 * ===========================================================================
 *
 *     node bancada/conferir-vetorizador.mjs [--lado 400] [--so selo,formas] [--saida pasta]
 *     npm run bancada:vetorizador
 *
 * Cada caso é um DESENHO original em SVG (formas geométricas feitas aqui).
 * Ele é rasterizado com anti-serrilhado (o que um cliente mandaria em PNG),
 * às vezes com ruído de JPEG por cima, e o raster vai para os dois
 * vetorizadores: o novo (`src/motores/vetorizador`) e o de antes
 * (`src/motores/vetor.js`, com o número certo de cores, para ser justo).
 *
 * A NOTA: os dois vetores e o desenho verdadeiro são rasterizados no DOBRO do
 * tamanho, e cada pixel é comparado em OKLab. "Certos" é a fração de pixels
 * a menos de 0,08 do verdadeiro (diferença que mal se vê); o erro médio é a
 * média da distância. Junto vão os nós (comandos de reta e curva), o tamanho
 * do SVG e o tempo. Como o verdadeiro é o desenho e não o raster, a nota mede
 * se o vetor reencontrou a forma, e não se copiou os pixels.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { carregarModulo } from "./carregarModulo.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcao = (nome, padrao) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args[i + 1] : padrao; };
const LADO = Number(opcao("lado", 400));
const SO = opcao("so", null);
const SAIDA = opcao("saida", null);

const PISO = 0.97;
const novo = await carregarModulo("src/motores/vetorizador/index.js");
const antigo = await carregarModulo("src/motores/vetor.js");

// A IA da tela: a rede de ampliar do programa (Real-ESRGAN, servidor/modelos;
// `npm run modelos` a traz). Sem ela, o caminho "ampliar e traçar" é medido
// com um ampliador clássico (Lanczos) — a conta da escala é a mesma.
const ampliador = createRequire(import.meta.url)("../servidor/extrator-ampliar.js");
const SEM_IA = ampliador.porqueNaoAmplia();
if (SEM_IA) console.log(`(sem a rede de ampliar: ${SEM_IA} — o caminho da IA usa Lanczos)
`);

// ==================== OS DESENHOS (originais) ====================

const svg = (corpo, fundo = "#ffffff") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="${fundo}"/>${corpo}</svg>`;

const estrela = (cx, cy, r1, r2, pontas) => {
  const p = [];
  for (let i = 0; i < pontas * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / pontas - Math.PI / 2;
    p.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return p.join(" ");
};

const CASOS = {
  selo: { cores: 4, desenho: svg(`
    <circle cx="200" cy="200" r="170" fill="#1d3557"/>
    <circle cx="200" cy="200" r="140" fill="none" stroke="#f1c40f" stroke-width="14"/>
    <polygon points="${estrela(200, 200, 110, 46, 5)}" fill="#e63946"/>`) },
  formas: { cores: 6, desenho: svg(`
    <rect x="30" y="40" width="150" height="110" fill="#2a9d8f"/>
    <polygon points="230,40 370,40 300,170" fill="#e9c46a"/>
    <ellipse cx="110" cy="290" rx="85" ry="60" fill="#f4a261"/>
    <rect x="220" y="220" width="150" height="140" rx="30" fill="#264653"/>
    <circle cx="295" cy="290" r="40" fill="#e76f51"/>`) },
  linhas: { cores: 2, desenho: svg(`
    <g fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round">
      <path d="M30 360 L370 40"/>
      <path d="M40 80 C140 10 260 150 360 90"/>
      <path d="M40 200 Q200 330 360 200"/>
      <circle cx="200" cy="300" r="60"/>
    </g>`) },
  letras: { cores: 3, desenho: svg(`
    <g fill="#5b21b6">
      <path d="M60 80 h40 v200 h90 v40 h-130 z"/>
      <path fill-rule="evenodd" d="M300 80 a90 120 0 1 0 0.1 0 z M300 130 a40 70 0 1 1 -0.1 0 z"/>
    </g>
    <path d="M150 360 a60 60 0 1 1 100 0" fill="none" stroke="#db2777" stroke-width="18"/>`) },
  // Dois cinzas quase brancos (#f2f2f2 e #fefefe): no detalhe padrão o motor os
  // junta de propósito (ΔE 0,035, abaixo da tolerância); `coresMinimas` diz isso.
  "cor-com-degrade": { cores: 3, coresMinimas: 2, desenho: svg(`
    <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0b7a3e"/><stop offset="1" stop-color="#108a48"/></linearGradient></defs>
    <rect x="40" y="40" width="320" height="320" rx="60" fill="url(#g)"/>
    <polygon points="${estrela(200, 200, 120, 55, 6)}" fill="#fefefe"/>`, "#f2f2f2") },
};

async function rasterizar(texto, lado) {
  const { data, info } = await sharp(Buffer.from(texto), { density: 72 * (lado / 400) * 1.0001 })
    .resize(lado, lado, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

async function comJpeg(img, qualidade) {
  const jpg = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } })
    .flatten({ background: "#ffffff" }).jpeg({ quality: qualidade }).toBuffer();
  const { data, info } = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Rasteriza um SVG de vetor (com width/height próprios) no lado pedido. */
async function rasterizarVetor(texto, lado) {
  const m = /width="([\d.]+)"/.exec(texto);
  const largura = m ? Number(m[1]) : lado;
  const { data } = await sharp(Buffer.from(texto), { density: 72 * (lado / largura) * 1.0001 })
    .resize(lado, lado, { fit: "fill" }).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

function nota(a, b) {
  let certos = 0, soma = 0;
  const n = a.length / 4;
  for (let i = 0; i < n; i++) {
    const A = OK(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]);
    const B = OK(b[i * 4], b[i * 4 + 1], b[i * 4 + 2]);
    const d = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    soma += d;
    if (d < 0.08) certos++;
  }
  return { certos: certos / n, erro: soma / n };
}
const { paraOklab: OK } = await carregarModulo("src/motores/vetorizador/paleta.js");

// Os nós das FORMAS (a costura é um traço auxiliar por baixo, que pode ser
// desligado; ela não conta como desenho).
const nos = (texto) => texto.split(/\r?\n/).filter((l) => /<path[^>]*fill="#/.test(l))
  .reduce((t, l) => t + (l.match(/[LCQAHVlcqahv]/g) || []).length, 0);

// ==================== A CORRIDA ====================

const linhas = [];
const casos = Object.entries(CASOS).filter(([nome]) => !SO || SO.split(",").includes(nome));
console.log(`vetorizador · raster de ${LADO} px · nota no dobro do tamanho\n`);
console.log(`${"caso".padEnd(30)} ${"motor".padEnd(7)} ${"certos".padStart(8)} ${"erro".padStart(7)} ${"nós".padStart(6)} ${"KB".padStart(6)} ${"ms".padStart(6)}  cores`);
for (const [nome, caso] of casos) {
  const verdade = await rasterizarVetor(caso.desenho, LADO * 2);
  const limpo = await rasterizar(caso.desenho, LADO);
  const variantes = [[nome, limpo]];
  if (nome === "selo" || nome === "formas") variantes.push([`${nome} (jpeg 55)`, await comJpeg(limpo, 55)]);
  // AS IMAGENS RUINS — o que de fato chega do cliente. Cada uma com o que
  // ela ensinou:
  //   pequeno    metade do lado, JPEG 70 (o logo do WhatsApp). O JPEG guarda
  //              a cor na metade da resolução, e a cor de uma faixa estreita
  //              fica borrada e pouca: foi aqui que a paleta engoliu o anel
  //              amarelo dentro do branco (ver `espalhamento`, em paleta.js).
  //   minúsculo  um quarto do lado, JPEG 60. Sem a IA, o JPEG apaga a cor
  //              fina (o selo perde o anel, as letras perdem uma cor): é o
  //              caso que justifica a IA, e por isso ele não confere as cores
  //              — a linha "+ IA 4x" logo abaixo confere.
  //   borrado    um quarto do lado esticado de volta com bilinear, JPEG 75 (o
  //              logo borrado da internet): a borda leva uns 4 pixels para
  //              mudar de cor (ver `larguraDaBorda`, no index.js).
  // A IA é a da tela: a rede de ampliar (Real-ESRGAN) em 4×, e o vetor volta
  // ao tamanho com `escala` 0,25. Sem a rede, um Lanczos no lugar dela.
  if (nome === "selo" || nome === "letras" || nome === "formas") {
    const esticar = async (img, lado, kernel) => {
      const { data, info } = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } })
        .resize(lado, lado, { kernel }).raw().toBuffer({ resolveWithObject: true });
      return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
    };
    const comIa = async (img) => {
      if (SEM_IA) return { ...(await esticar(img, img.width * 4, "lanczos3")), escala: 0.25 };
      const r = await ampliador.ampliar(Buffer.from(img.data), img.width, img.height, img.width * 4, img.height * 4);
      return { data: new Uint8ClampedArray(r.rgba.buffer, r.rgba.byteOffset, r.rgba.length), width: r.largura, height: r.altura, escala: 0.25 };
    };
    const ia = SEM_IA ? "lanczos 4x" : "IA 4x";
    const pequeno = await comJpeg(await rasterizar(caso.desenho, Math.round(LADO / 2)), 70);
    const minusculo = await comJpeg(await rasterizar(caso.desenho, Math.round(LADO / 4)), 60);
    const borrado = await comJpeg(await esticar(await rasterizar(caso.desenho, Math.round(LADO / 4)), LADO, "linear"), 75);
    variantes.push(
      [`${nome} pequeno (jpeg 70)`, pequeno],
      [`${nome} pequeno + ${ia}`, await comIa(pequeno)],
      [`${nome} minúsculo (jpeg 60)`, { ...minusculo, semConferirCores: true }],
      [`${nome} minúsculo + ${ia}`, { ...(await comIa(minusculo)), semConferirCores: SEM_IA }],
      [`${nome} borrado (jpeg 75)`, borrado],
    );
  }
  for (const [rotulo, img] of variantes) {
    const t0 = Date.now();
    const r = novo.vetorizar(img.data, img.width, img.height, img.escala ? { escala: img.escala } : {});
    const msNovo = Date.now() - t0;
    if (r.erro) throw new Error(`${rotulo}: ${r.erro}`);
    if (!img.semConferirCores && r.estatisticas.cores < (caso.coresMinimas || caso.cores)) {
      console.log(`  FALTOU COR em ${rotulo}: o desenho tem ${caso.cores}, o motor achou ${r.estatisticas.cores}`);
      process.exitCode = 1;
    }
    const t1 = Date.now();
    const v = antigo.vetorizarImagem({ width: img.width, height: img.height, data: img.data }, { cores: caso.cores });
    const msAntigo = Date.now() - t1;
    for (const [motor, texto, ms, cores] of [["novo", r.svg, msNovo, r.estatisticas.cores], ["antes", v.svg, msAntigo, caso.cores]]) {
      const n = nota(await rasterizarVetor(texto, LADO * 2), verdade);
      // O PISO: o motor novo acerta pelo menos 97% dos pixels em todo caso —
      // menos no minúsculo sem a IA, o caso que justifica a IA.
      if (motor === "novo" && !img.semConferirCores && n.certos < PISO) {
        console.log(`  ABAIXO DO PISO em ${rotulo}: ${(n.certos * 100).toFixed(2)}% certos (o piso é ${PISO * 100}%)`);
        process.exitCode = 1;
      }
      linhas.push({ caso: rotulo, motor, ...n, nos: nos(texto), kb: texto.length / 1024, ms, cores });
      const borda = motor === "novo" ? `  borda ${r.estatisticas.borda.toFixed(2)}` : "";
      console.log(`${rotulo.padEnd(30)} ${motor.padEnd(7)} ${(n.certos * 100).toFixed(2).padStart(7)}% ${n.erro.toFixed(4).padStart(7)} ${String(nos(texto)).padStart(6)} ${(texto.length / 1024).toFixed(1).padStart(6)} ${String(ms).padStart(6)}  ${cores}${borda}`);
      if (SAIDA) {
        fs.mkdirSync(SAIDA, { recursive: true });
        fs.writeFileSync(path.join(SAIDA, `${rotulo.replace(/[^a-z0-9-]+/gi, "_")}-${motor}.svg`), texto);
      }
    }
  }
}

const media = (motor, campo) => {
  const ls = linhas.filter((l) => l.motor === motor);
  return ls.reduce((s, l) => s + l[campo], 0) / ls.length;
};
console.log(`\nmédia  novo: ${(media("novo", "certos") * 100).toFixed(2)}% certos, erro ${media("novo", "erro").toFixed(4)}, ${media("novo", "nos").toFixed(0)} nós`);
console.log(`média antes: ${(media("antes", "certos") * 100).toFixed(2)}% certos, erro ${media("antes", "erro").toFixed(4)}, ${media("antes", "nos").toFixed(0)} nós`);
