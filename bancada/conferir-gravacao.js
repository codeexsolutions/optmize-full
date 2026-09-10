#!/usr/bin/env node
/**
 * ===========================================================================
 * CONFERIR A GRAVAÇÃO — molde, estampa e projeto sobrevivem ao banco?
 * ===========================================================================
 *
 * O `docs/INTEGRACAO-REACT.md` declarava este buraco com todas as letras:
 * "não foi testado o fluxo completo de gravação de moldes/estampas". Este
 * arquivo o fecha.
 *
 * O que ele confere NÃO é "respondeu 200". É a **geometria voltar igual**.
 * Um molde guarda contorno em centímetros, e é esse contorno que faz a peça
 * sair na medida certa no PDF e no encaixe. Se o caminho de ida e volta pelo
 * banco perder uma casa decimal — um `toFixed(2)` bem-intencionado, um
 * arredondamento para milímetro — nada quebra e nada avisa: a peça só sai
 * um pouco errada, todo dia, e quem descobre é o tecido cortado.
 *
 * Por isso as coordenadas do teste são feias de propósito (12.3456789). Um
 * retângulo de 10 x 20 passaria por qualquer arredondamento sem reclamar.
 *
 * Sobe o servidor em processo, numa pasta de dados descartável e numa porta
 * que o sistema escolhe. Não encosta no `dados.db` de verdade, e não sobe
 * WhatsApp, socket nem Puppeteer: só as três rotas que interessam.
 *
 *   npm run bancada:gravacao
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

// Tem que vir ANTES de qualquer require que abra o banco: é esta variável que
// decide onde o `dados.db` mora, e o `db.js` a lê na primeira carga.
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "optimize-gravacao-"));
process.env.OPTIMIZE_DADOS = PASTA;

const express = require("express");

let passou = 0;
const falhas = [];

function conferir(oque, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log("  ok   " + oque);
  } else {
    falhas.push(oque + (detalhe ? " — " + detalhe : ""));
    console.log("  FALHOU " + oque + (detalhe ? " — " + detalhe : ""));
  }
}

/*
 * Coordenadas escolhidas para não sobreviver a arredondamento nenhum, e um
 * furo triangular para o caminho dos vazados também ser exercitado.
 */
const CONTORNO = [
  { x: 0, y: 0 },
  { x: 12.3456789, y: 0 },
  { x: 12.3456789, y: 20.987654321 },
  { x: 6.17283945, y: 25.5 },
  { x: 0, y: 20.987654321 },
];
const FURO = [[
  { x: 3.1, y: 5.25 }, { x: 8.4, y: 5.25 }, { x: 5.75, y: 11.125 },
]];

/** Um PNG 2x2 de verdade: o upload confere a assinatura, não aceita qualquer coisa. */
function pngMinimo() {
  const tabela = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ tabela[(c ^ buf[i]) & 0xff];
    return (c ^ -1) >>> 0;
  };
  const pedaco = (tipo, dados) => {
    const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const linhas = Buffer.alloc(2 * (1 + 2 * 3));
  let i = 0;
  for (let y = 0; y < 2; y++) {
    linhas[i++] = 0;
    for (let x = 0; x < 2; x++) { linhas[i++] = 200; linhas[i++] = 30; linhas[i++] = 30; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", zlib.deflateSync(linhas)),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

function subir() {
  const app = express();
  app.use("/api/cor", require("../servidor/cor-api"));
  app.use(express.json({ limit: "15mb" }));
  app.use("/api/moldes", require("../servidor/moldes-api"));
  app.use("/api/projetos", require("../servidor/projetos-api"));
  return new Promise((pronto) => {
    const servidor = app.listen(0, "127.0.0.1", () =>
      pronto({ servidor, base: "http://127.0.0.1:" + servidor.address().port }));
  });
}

async function principal() {
  const { servidor, base } = await subir();

  async function api(metodo, rota, corpo, cru) {
    const opcoes = { method: metodo, headers: {} };
    if (cru) {
      opcoes.body = corpo;
      opcoes.headers["content-type"] = "image/png";
    } else if (corpo !== undefined) {
      opcoes.body = JSON.stringify(corpo);
      opcoes.headers["content-type"] = "application/json";
    }
    const r = await fetch(base + rota, opcoes);
    const texto = await r.text();
    let dados;
    try { dados = JSON.parse(texto); } catch { dados = texto; }
    return { status: r.status, dados };
  }

  console.log("MOLDE");
  const criado = await api("POST", "/api/moldes", {
    nome: "Camiseta da bancada",
    observacoes: "gravada pela conferência",
    pecas: [
      {
        tamanho: "M", papel: "frente", nome: "frente M", quantidade: 1,
        largura: 12.3456789, altura: 25.5,
        contorno: CONTORNO, furos: FURO, origem: "bancada.svg",
      },
      {
        tamanho: "M", papel: "manga", nome: "manga M", quantidade: 2,
        largura: 12.3456789, altura: 25.5, contorno: CONTORNO,
      },
    ],
  });
  conferir("o molde grava", criado.status === 200, JSON.stringify(criado.dados).slice(0, 120));
  conferir("as duas peças entraram", criado.dados && criado.dados.pecas === 2);
  const id = criado.dados && criado.dados.id;

  const lido = await api("GET", "/api/moldes/" + id);
  const peca = lido.dados && lido.dados.pecas && lido.dados.pecas[0];
  conferir("o molde volta", lido.status === 200);
  conferir("O CONTORNO VOLTA IDÊNTICO, casa decimal por casa decimal",
    peca && JSON.stringify(peca.contorno) === JSON.stringify(CONTORNO),
    peca ? JSON.stringify(peca.contorno).slice(0, 140) : "sem peça");
  conferir("o furo sobrevive",
    peca && JSON.stringify(peca.furos) === JSON.stringify(FURO));
  conferir("largura e altura voltam exatas",
    peca && peca.largura === 12.3456789 && peca.altura === 25.5,
    peca ? peca.largura + " x " + peca.altura : "");

  const lista = await api("GET", "/api/moldes");
  const naEstante = lista.dados.find((m) => m.id === id);
  conferir("a estante soma as quantidades (1 + 2 = 3)",
    naEstante && naEstante.pecasPorUnidade === 3,
    naEstante ? String(naEstante.pecasPorUnidade) : "");

  console.log("\nREGRAVAR — o PUT troca as peças inteiras");
  await api("PUT", "/api/moldes/" + id, {
    nome: "Camiseta da bancada II",
    pecas: [{
      tamanho: "G", papel: "costas", quantidade: 1,
      largura: 1, altura: 1, contorno: CONTORNO,
    }],
  });
  const depois = await api("GET", "/api/moldes/" + id);
  conferir("sobrou uma peça só, sem resto da gravação anterior",
    depois.dados.pecas.length === 1, "peças: " + depois.dados.pecas.length);
  conferir("o nome novo pegou", depois.dados.nome === "Camiseta da bancada II");

  console.log("\nESTAMPA");
  const png = pngMinimo();
  const enviada = await api("POST", "/api/moldes/" + id + "/artes/imagem?papel=costas", png, true);
  conferir("a imagem sobe e é reconhecida como PNG", enviada.status === 200,
    JSON.stringify(enviada.dados).slice(0, 140));
  conferir("os bytes gravados batem com os enviados",
    enviada.dados && enviada.dados.bytes === png.length);

  await api("POST", "/api/moldes/" + id + "/artes", {
    nome: "Estampa da bancada",
    pecas: [{
      papel: "costas", arquivo: enviada.dados && enviada.dados.arquivo,
      nomeOriginal: "arte.png",
      ajuste: { modo: "caber", escala: 137.5, x: 2.25, y: -3.5, giro: 90 },
    }],
  });
  const comArte = await api("GET", "/api/moldes/" + id + "/artes");
  const arte = Array.isArray(comArte.dados) ? comArte.dados[0] : (comArte.dados.artes || [])[0];
  const ajuste = arte && arte.pecas && arte.pecas[0] && arte.pecas[0].ajuste;
  conferir("o ajuste da arte volta igual (escala, deslocamento e giro)",
    ajuste && ajuste.modo === "caber" && ajuste.escala === 137.5
      && ajuste.x === 2.25 && ajuste.y === -3.5 && ajuste.giro === 90,
    JSON.stringify(ajuste));

  console.log("\nCLIENTE E PROJETO");
  const cliente = await api("POST", "/api/projetos/clientes", { nome: "Cliente da bancada" });
  conferir("o cliente grava", cliente.status === 200);
  const projeto = await api("POST", "/api/projetos", {
    clienteId: cliente.dados.id, nome: "Projeto da bancada",
  });
  conferir("o projeto grava", projeto.status === 200);

  const gravado = await api("PUT", "/api/projetos/" + projeto.dados.id, {
    nome: "Projeto da bancada",
    larguraTecido: 160,
    // Folga ZERO de propósito. O `projetos-api.js` desvia do `numero()` só por
    // causa deste caso, porque `numero()` recusa zero — e o comentário de lá
    // explica. Se alguém tirar o desvio, a folga vira `null` e o encaixe volta
    // a abrir espaço que ninguém pediu, sem nenhum aviso.
    espaco: 0,
    comprimentoBancada: 0,
    giro: "livre",
    pecas: [
      { nome: "frente", arquivo: "frente.png", largura: 12.3456789, altura: 25.5, quantidade: 3 },
      { nome: "sem arquivo", largura: 10, altura: 10 },
    ],
  });
  conferir("a peça sem arquivo é descartada, e só a boa entra",
    gravado.dados && gravado.dados.pecas === 1, JSON.stringify(gravado.dados));

  const lidoP = await api("GET", "/api/projetos/" + projeto.dados.id);
  const pecaP = lidoP.dados && lidoP.dados.pecas && lidoP.dados.pecas[0];
  conferir("a medida da peça do projeto volta exata",
    pecaP && pecaP.largura === 12.3456789 && pecaP.altura === 25.5,
    pecaP ? pecaP.largura + " x " + pecaP.altura : "");
  conferir("a largura do tecido volta", lidoP.dados.largura_tecido === 160);
  conferir("FOLGA ZERO sobrevive (não virou null)", lidoP.dados.espaco === 0,
    JSON.stringify(lidoP.dados.espaco));
  conferir("o giro volta", lidoP.dados.giro === "livre");

  console.log("\nAPAGAR");
  conferir("o molde apaga", (await api("DELETE", "/api/moldes/" + id)).status === 200);
  conferir("e some de verdade", (await api("GET", "/api/moldes/" + id)).status === 404);

  servidor.close();

  console.log("");
  if (falhas.length) {
    console.error("FALHOU — " + falhas.length + " de " + (passou + falhas.length) + ":");
    falhas.forEach((f) => console.error("  - " + f));
    process.exit(1);
  }
  console.log("OK — " + passou + " conferências, a gravação preserva tudo.");
}

/**
 * A pasta descartável só sai depois que o banco solta o arquivo: o
 * better-sqlite3 mantém o handle aberto, e no Windows apagar por baixo dele dá
 * EPERM. Se ainda assim não sair, não é motivo para a conferência falhar — é
 * uma pasta temporária, e o sistema a recolhe.
 */
function limpar() {
  try { require("../servidor/db").close(); } catch { /* já fechado, ou sem close */ }
  try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* o SO recolhe */ }
}

principal()
  .catch((erro) => { console.error(erro); process.exitCode = 1; })
  .finally(limpar);
