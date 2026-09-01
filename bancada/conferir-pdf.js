#!/usr/bin/env node
/**
 * Confere o PDF do encaixe: um arquivo, uma página, no tamanho real certo.
 *
 * O que está sendo protegido aqui é uma regra de produção, não uma
 * preferência: **o rolo sai num arquivo só**. Já saiu repartido, e o corte
 * chegava a passar por cima de uma peça — metade num arquivo, metade no outro.
 * Peça partida é peça perdida. Se um dia alguém reintroduzir a repartição, é
 * este arquivo que grita.
 *
 * A segunda coisa conferida é a mais silenciosa das duas. Rolo acima de 508 cm
 * não cabe numa página de PDF, e quem resolve isso é o `/UserUnit` — que é
 * recurso do **PDF 1.6**, enquanto o pdfkit escreve `%PDF-1.3` por padrão.
 * Declarando 1.3, um leitor pode ignorar o `/UserUnit` e imprimir o rolo na
 * escala errada sem dar erro nenhum. Aqui a versão do arquivo é conferida junto
 * com o tamanho.
 *
 *   node bancada/conferir-pdf.js
 */

const stream = require("stream");

const { montarPdf, PT_POR_CM, LIMITE_PT } = require("../encaixe-pdf");

// Um PNG de 1x1 opaco. O que se confere aqui é a página, não a arte: qualquer
// imagem válida serve, e a menor possível deixa o teste instantâneo.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Junta o que o documento escreveu, para dar para olhar dentro dele. */
function gerar(encaixe) {
  return new Promise((pronto, falhou) => {
    // Um destino de verdade, e não um objeto de mentira com um `write`: o
    // pdfkit escreve por `pipe`, e o que se quer conferir aqui é o arquivo que
    // sairia pela rota, byte por byte.
    const destino = new stream.PassThrough();
    const pedacos = [];
    destino.on("data", (pedaco) => pedacos.push(pedaco));
    destino.on("error", falhou);

    let relatorio;
    try {
      relatorio = montarPdf(encaixe, destino);
    } catch (erro) {
      falhou(erro);
      return;
    }
    destino.on("end", () => pronto({ bytes: Buffer.concat(pedacos), relatorio }));
  });
}

/** Um encaixe de mentira: peças lado a lado descendo o rolo. */
function encaixeDe(larguraTecido, consumoCm, quantas) {
  const posicoes = [];
  for (let i = 0; i < quantas; i++) {
    posicoes.push({
      chave: "peca",
      x: (i % 2) * (larguraTecido / 2),
      y: (consumoCm / quantas) * i,
      largura: larguraTecido / 2 - 1,
      altura: consumoCm / quantas - 1,
    });
  }
  return {
    larguraTecido, consumo: consumoCm, posicoes,
    buffers: new Map([["peca", PNG_1X1]]),
  };
}

const CASOS = [
  { nome: "rolo curto (3 m)", largura: 160, consumo: 300, pecas: 6, esperaUserUnit: false },
  { nome: "rolo no limite (5 m)", largura: 160, consumo: 500, pecas: 10, esperaUserUnit: false },
  { nome: "rolo longo (12 m)", largura: 160, consumo: 1200, pecas: 24, esperaUserUnit: true },
  { nome: "rolo enorme (40 m)", largura: 180, consumo: 4000, pecas: 80, esperaUserUnit: true },
  { nome: "tecido largo (5,2 m)", largura: 520, consumo: 300, pecas: 6, esperaUserUnit: true },
];

async function principal() {
  const falhas = [];

  for (const caso of CASOS) {
    const encaixe = encaixeDe(caso.largura, caso.consumo, caso.pecas);
    const { bytes, relatorio } = await gerar(encaixe);
    const texto = bytes.toString("latin1");
    const erro = (queixa) => falhas.push(`${caso.nome}: ${queixa}`);

    // 1) UMA página. É a regra que este arquivo existe para proteger.
    const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (paginas !== 1) erro(`saíram ${paginas} páginas — o rolo tem que caber numa só`);

    // 2) Toda peça desenhada, nenhuma perdida.
    if (relatorio.desenhadas !== caso.pecas) {
      erro(`${relatorio.desenhadas} de ${caso.pecas} peças desenhadas`);
    }

    // 3) O tamanho REAL do papel: página × UserUnit, de volta em centímetros.
    const larguraCm = (relatorio.paginaPt[0] * relatorio.unidade) / PT_POR_CM;
    const alturaCm = (relatorio.paginaPt[1] * relatorio.unidade) / PT_POR_CM;
    if (Math.abs(larguraCm - caso.largura) > 0.01) {
      erro(`largura real ${larguraCm.toFixed(2)} cm, esperada ${caso.largura} cm`);
    }
    if (Math.abs(alturaCm - caso.consumo) > 0.01) {
      erro(`comprimento real ${alturaCm.toFixed(2)} cm, esperado ${caso.consumo} cm`);
    }

    // 4) A página em si tem que caber no teto do formato.
    const maiorLado = Math.max(relatorio.paginaPt[0], relatorio.paginaPt[1]);
    if (maiorLado > LIMITE_PT + 1e-6) {
      erro(`a página tem ${maiorLado.toFixed(0)} pt de lado — o PDF só aceita ${LIMITE_PT}`);
    }

    // 5) O UserUnit e a versão do formato andam juntos.
    const temUserUnit = texto.includes("/UserUnit");
    const versao = (texto.match(/^%PDF-(\d\.\d)/) || [])[1];
    if (temUserUnit !== caso.esperaUserUnit) {
      erro(temUserUnit ? "veio com /UserUnit sem precisar" : "faltou o /UserUnit");
    }
    if (temUserUnit && Number(versao) < 1.6) {
      erro(`usa /UserUnit mas se declara PDF ${versao} — leitor pode ignorar e imprimir fora de escala`);
    }

    const como = temUserUnit ? `UserUnit ${relatorio.unidade}` : "UserUnit 1";
    process.stdout.write(`  ${caso.nome.padEnd(24)} PDF ${versao} · ${como}`
      + ` · página ${relatorio.paginaPt.map((v) => v.toFixed(0)).join("x")} pt\n`);
  }

  console.log("");
  if (falhas.length === 0) {
    console.log(`OK — ${CASOS.length} encaixes, todos num arquivo e numa página só.`);
    return;
  }
  console.log(`FALHOU — ${falhas.length} problema(s):`);
  falhas.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
