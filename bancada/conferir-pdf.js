#!/usr/bin/env node
/**
 * Confere o PDF do encaixe: um arquivo, uma página por bancada, no tamanho real
 * certo.
 *
 * O que está sendo protegido aqui é uma regra de produção, não uma
 * preferência: **o rolo sai num arquivo só**. Já saiu em vários arquivos, e o
 * corte chegava a passar por cima de uma peça — metade num arquivo, metade no
 * outro. Peça partida é peça perdida. Se um dia alguém reintroduzir a
 * repartição em ARQUIVOS, é este arquivo que grita.
 *
 * Repartir em PÁGINAS é outra história, e agora é o certo: sem bancada continua
 * saindo uma página só, e com bancada sai uma por bancada — onde o encaixe já
 * garantiu que peça nenhuma pode estar (ver `bancada/conferir-bancada.js`, que
 * é quem confere essa parte). Aqui se confere que a repartição do documento
 * respeita o que o encaixe decidiu: página por bancada, toda peça desenhada uma
 * vez, e cada página do tamanho real da sua bancada.
 *
 * A segunda coisa conferida é a mais silenciosa das três. Rolo acima de 508 cm
 * não cabe numa página de PDF, e quem resolve isso é o `/UserUnit` — que é
 * recurso do **PDF 1.6**, enquanto o pdfkit escreve `%PDF-1.3` por padrão.
 * Declarando 1.3, um leitor pode ignorar o `/UserUnit` e imprimir o rolo na
 * escala errada sem dar erro nenhum. Aqui a versão do arquivo é conferida junto
 * com o tamanho.
 *
 * A terceira é o TAMANHO NÃO SE MEXE. O peso do arquivo é escolhido por arte —
 * PNG ou JPEG, o que sair menor, e às vezes a arte original inteira, sem
 * redesenhar (ver "O PASSA-DIRETO", em public/encaixe.js). Nada disso pode
 * encostar na medida: o que sai da impressora tem que medir o que a peça mede,
 * seja a arte um PNG com alfa, um JPEG de metade da resolução ou um arquivo de
 * proporção completamente diferente. É uma garantia fácil de perder sem
 * perceber — quem imprime só descobre com o tecido na mão —, então ela é
 * medida: o mesmo encaixe é montado com sete artes diferentes e a geometria
 * dos sete tem que sair idêntica, do MediaBox às matrizes de posição.
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
async function gerar(encaixe) {
  // Um destino de verdade, e não um objeto de mentira com um `write`: o pdfkit
  // escreve por `pipe`, e o que se quer conferir aqui é o arquivo que sairia
  // pela rota, byte por byte.
  const destino = new stream.PassThrough();
  const pedacos = [];
  destino.on("data", (pedaco) => pedacos.push(pedaco));
  // Os ouvintes entram antes de a montagem começar a empurrar byte.
  const escoou = new Promise((pronto, falhou) => {
    destino.on("end", pronto);
    destino.on("error", falhou);
  });

  // `montarPdf` é assíncrona: ela cede a vez entre as peças para o PDF escoar
  // em vez de encher a fila do cano (ver `escoar`, em encaixe-pdf.js). Quando
  // ela volta, o documento foi fechado; o fim do fluxo ainda vem depois.
  const relatorio = await montarPdf(encaixe, destino);
  await escoou;
  return { bytes: Buffer.concat(pedacos), relatorio };
}

/**
 * Um encaixe de mentira: peças lado a lado descendo o rolo.
 *
 * `bancadas` reparte as peças em bancadas iguais, do jeito que o motor faria —
 * o número da bancada vem carimbado na posição, e é só isso que o PDF olha.
 */
function encaixeDe(larguraTecido, consumoCm, quantas, bancadas = 1) {
  const posicoes = [];
  const porBancada = Math.ceil(quantas / bancadas);
  for (let i = 0; i < quantas; i++) {
    posicoes.push({
      chave: "peca",
      x: (i % 2) * (larguraTecido / 2),
      y: (consumoCm / quantas) * i,
      largura: larguraTecido / 2 - 1,
      altura: consumoCm / quantas - 1,
      bancada: Math.floor(i / porBancada),
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
  // Com bancada. O rolo de 40 m é o que interessa: repartido em bancadas de
  // 2 m, cada página volta a caber no formato sem precisar de `/UserUnit` —
  // que é o ganho de verdade da paginação, além da mesa de corte.
  { nome: "3 bancadas (6 m)", largura: 160, consumo: 600, pecas: 12, bancadas: 3, esperaUserUnit: false },
  { nome: "20 bancadas (40 m)", largura: 180, consumo: 4000, pecas: 80, bancadas: 20, esperaUserUnit: false },
  { nome: "bancada única", largura: 160, consumo: 300, pecas: 6, bancadas: 1, esperaUserUnit: false },
];

// ==================== O TAMANHO NÃO SE MEXE ====================

const zlib = require("zlib");

/** Um JPEG mínimo e válido, de uma cor só, no tamanho pedido. */
function jpegDe(largura, altura) {
  const jpeg = require("jpeg-js");
  const dados = Buffer.alloc(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) {
    dados[i * 4] = 200; dados[i * 4 + 1] = 120; dados[i * 4 + 2] = 60; dados[i * 4 + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data: dados, width: largura, height: altura }, 88).data);
}

/** Um PNG RGBA, com o alfa pedido, no tamanho pedido. */
function pngDe(largura, altura, alfa) {
  const crc = (b) => {
    let c = -1;
    for (let i = 0; i < b.length; i++) {
      c ^= b[i];
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return (c ^ -1) >>> 0;
  };
  const pedaco = (tipo, dados) => {
    const t = Buffer.from(tipo, "ascii");
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const soma = Buffer.alloc(4); soma.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, soma]);
  };
  const linhas = Buffer.alloc(altura * (1 + largura * 4));
  for (let y = 0; y < altura; y++) {
    const base = y * (1 + largura * 4);
    for (let x = 0; x < largura; x++) {
      const i = base + 1 + x * 4;
      linhas[i] = 200; linhas[i + 1] = 120; linhas[i + 2] = 60; linhas[i + 3] = alfa;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0); ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits por canal, RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", zlib.deflateSync(linhas, { level: 6 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Tudo que decide onde a arte vai parar no papel: a caixa de cada página e as
 * matrizes de posição do conteúdo. Se qualquer arte mexer nisso, muda o que sai
 * impresso.
 */
function geometriaDoPdf(bytes) {
  const texto = bytes.toString("latin1");
  const caixas = [...texto.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1].trim());
  const unidades = [...texto.matchAll(/\/UserUnit (\S+?)[\s/>]/g)].map((m) => m[1]);
  const matrizes = [];
  const abre = /stream\r?\n/g;
  let m;
  while ((m = abre.exec(texto)) !== null) {
    const inicio = m.index + m[0].length;
    const fim = texto.indexOf("endstream", inicio);
    if (fim < 0) continue;
    try {
      const cru = zlib.inflateSync(Buffer.from(texto.slice(inicio, fim), "latin1")).toString("latin1");
      [...cru.matchAll(/([-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+) cm/g)]
        .forEach((x) => matrizes.push(x[1]));
    } catch (erro) { /* não era um fluxo de conteúdo comprimido */ }
  }
  return JSON.stringify({ caixas, unidades, matrizes });
}

// Um encaixe fixo de duas bancadas. O que muda entre as rodadas é só a arte.
const ENCAIXE_FIXO = {
  larguraTecido: 159,
  consumo: 144,
  posicoes: [
    { chave: "arte", x: 0, y: 0, largura: 50, altura: 70, bancada: 0 },
    { chave: "arte", x: 52, y: 0, largura: 50, altura: 70, bancada: 0 },
    { chave: "arte", x: 104, y: 3.7, largura: 50, altura: 70, bancada: 0 },
    { chave: "arte", x: 0, y: 72, largura: 50, altura: 70, bancada: 1 },
  ],
};

const ARTES = [
  ["PNG opaco", () => pngDe(120, 168, 255)],
  ["PNG com alfa", () => pngDe(120, 168, 128)],
  ["PNG de 1/4 da resolução", () => pngDe(30, 42, 255)],
  ["PNG de 4x a resolução", () => pngDe(480, 672, 255)],
  ["JPEG", () => jpegDe(120, 168)],
  ["JPEG de metade da resolução", () => jpegDe(60, 84)],
  // O caso que mais assusta: um arquivo cuja proporção não tem nada a ver com a
  // da peça. Quem manda na medida é a peça, não a arte.
  ["JPEG de outra proporção", () => jpegDe(160, 120)],
];

async function conferirQueOTamanhoNaoMexe(erro) {
  let referencia = null;
  let referenciaNome = "";
  for (const [nome, fazer] of ARTES) {
    const { bytes, relatorio } = await gerar({
      ...ENCAIXE_FIXO, buffers: new Map([["arte", fazer()]]),
    });
    if (relatorio.desenhadas !== ENCAIXE_FIXO.posicoes.length) {
      erro(`tamanho/${nome}: desenhou ${relatorio.desenhadas} de ${ENCAIXE_FIXO.posicoes.length} peças`);
    }
    const geometria = geometriaDoPdf(bytes);
    if (referencia === null) {
      referencia = geometria;
      referenciaNome = nome;
    } else if (geometria !== referencia) {
      erro(`tamanho/${nome}: a geometria saiu diferente da de "${referenciaNome}" `
        + `— a arte mexeu na medida impressa`);
    }
  }
  const largura = Number(JSON.parse(referencia).caixas[0].split(" ")[2]);
  process.stdout.write(`  ${"tamanho não se mexe".padEnd(24)} ${ARTES.length} artes diferentes`
    + ` · mesma geometria · ${(largura / PT_POR_CM).toFixed(1)} cm de largura\n`);
}

async function principal() {
  const falhas = [];

  for (const caso of CASOS) {
    const bancadas = caso.bancadas || 1;
    const encaixe = encaixeDe(caso.largura, caso.consumo, caso.pecas, bancadas);
    const { bytes, relatorio } = await gerar(encaixe);
    const texto = bytes.toString("latin1");
    const erro = (queixa) => falhas.push(`${caso.nome}: ${queixa}`);

    // 1) UM arquivo, com uma página por bancada. Sem bancada, uma página só.
    const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (paginas !== bancadas) {
      erro(`saíram ${paginas} páginas para ${bancadas} bancada(s)`);
    }

    // 2) Toda peça desenhada, nenhuma perdida — e nenhuma desenhada duas vezes,
    // que é como uma peça apareceria em duas bancadas.
    if (relatorio.desenhadas !== caso.pecas) {
      erro(`${relatorio.desenhadas} de ${caso.pecas} peças desenhadas`);
    }
    const somaDasPaginas = relatorio.paginas.reduce((soma, p) => soma + p.pecas, 0);
    if (somaDasPaginas !== caso.pecas) {
      erro(`as páginas somam ${somaDasPaginas} peças, e o encaixe tem ${caso.pecas}`);
    }

    // 3) O tamanho REAL do papel: página × UserUnit, de volta em centímetros.
    const larguraCm = (relatorio.paginaPt[0] * relatorio.unidade) / PT_POR_CM;
    if (Math.abs(larguraCm - caso.largura) > 0.01) {
      erro(`largura real ${larguraCm.toFixed(2)} cm, esperada ${caso.largura} cm`);
    }
    // Cada página tem o comprimento da bancada dela; sem bancada, o consumo
    // inteiro do rolo.
    relatorio.paginas.forEach((pagina) => {
      const alturaCm = (pagina.paginaPt[1] * relatorio.unidade) / PT_POR_CM;
      if (Math.abs(alturaCm - pagina.comprimento) > 0.01) {
        erro(`a página ${pagina.numero} tem ${alturaCm.toFixed(2)} cm de papel para`
          + ` ${pagina.comprimento.toFixed(2)} cm de bancada`);
      }
    });
    const somaCm = relatorio.paginas.reduce((soma, p) => soma + p.comprimento, 0);
    if (somaCm > caso.consumo + 0.01) {
      erro(`as páginas somam ${somaCm.toFixed(2)} cm, mais que os ${caso.consumo} cm do rolo`);
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
      + ` · ${relatorio.paginas.length} página(s) de`
      + ` ${relatorio.paginaPt.map((v) => v.toFixed(0)).join("x")} pt\n`);
  }

  await conferirQueOTamanhoNaoMexe((queixa) => falhas.push(queixa));

  console.log("");
  if (falhas.length === 0) {
    console.log(`OK — ${CASOS.length} encaixes, todos num arquivo só, com uma página por`
      + ` bancada, e ${ARTES.length} artes diferentes sem mexer no tamanho impresso.`);
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
