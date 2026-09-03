/**
 * Confere o validador de marcador do JPEG — o portão do passa-direto.
 *
 * O PDF do encaixe pode mandar a arte original para a máquina sem redesenhar
 * nada (ver "O PASSA-DIRETO", em public/encaixe.js). É o único caminho sem
 * perda que existe ali, e é também o único em que um arquivo malformado chega
 * até a RIP do jeito que veio. O que separa um do outro é `jpegSeguroParaPdf`.
 *
 * Reprovar de menos aqui não dá erro em lugar nenhum: dá rolo impresso errado.
 * O caso que mais assusta é a ORIENTAÇÃO EXIF — o navegador aplica, o PDF não,
 * e a arte sairia deitada com a peça encaixada em pé. Por isso ele tem teste.
 *
 * As funções são lidas do próprio encaixe.js e avaliadas aqui. Ele é código de
 * navegador (usa `document`, `fetch`, `canvas`) e não dá para carregar inteiro
 * no Node; extrair as duas funções puras mantém o teste medindo o texto que
 * roda de verdade, em vez de uma cópia que envelhece sozinha.
 */

const fs = require("fs");
const path = require("path");
const jpeg = require("jpeg-js");

const RAIZ = path.join(__dirname, "..");
const fonte = fs.readFileSync(path.join(RAIZ, "public/encaixe.js"), "utf8");

/** O texto de uma função de topo, do `function` até a chave que fecha. */
function extrair(nome) {
  const inicio = fonte.indexOf(`function ${nome}(`);
  if (inicio < 0) throw new Error(`não achei a função ${nome} em public/encaixe.js`);
  let nivel = 0;
  for (let i = fonte.indexOf("{", inicio); i < fonte.length; i++) {
    if (fonte[i] === "{") nivel++;
    else if (fonte[i] === "}" && --nivel === 0) return fonte.slice(inicio, i + 1);
  }
  throw new Error(`a função ${nome} não fecha`);
}

// eslint-disable-next-line no-new-func
const jpegSeguroParaPdf = new Function(
  `${extrair("orientacaoExif")}\n${extrair("jpegSeguroParaPdf")}\nreturn jpegSeguroParaPdf;`)();

// ==================== AS ARTES DE TESTE ====================

const L = 64;
const A = 48;

/** Um JPEG de verdade: sequencial de Huffman, 8 bits, 3 componentes. */
function jpegBaseline() {
  const pixels = Buffer.alloc(L * A * 4);
  for (let i = 0; i < L * A; i++) {
    pixels[i * 4] = (i * 7) & 255;
    pixels[i * 4 + 1] = (i * 3) & 255;
    pixels[i * 4 + 2] = (i * 11) & 255;
    pixels[i * 4 + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data: pixels, width: L, height: A }, 90).data);
}

const base = jpegBaseline();

/** Onde começa o marcador SOF0 (FFC0). É dele que saem as variantes. */
function acharSof(d) {
  for (let i = 2; i + 1 < d.length; i++) if (d[i] === 0xff && d[i + 1] === 0xc0) return i;
  throw new Error("o JPEG de teste saiu sem SOF0");
}

const sof = acharSof(base);
const trocarByte = (d, i, v) => { const c = Buffer.from(d); c[i] = v; return c; };

/**
 * O mesmo JPEG com um APP1/Exif na frente, declarando uma orientação.
 *
 * `ordem` é a do TIFF de dentro do EXIF: "II" byte menos significativo
 * primeiro, "MM" o contrário. Os dois existem no mundo real, e o leitor tem
 * que dar a mesma resposta nos dois.
 */
function comExif(orientacao, ordem = "II") {
  const tiff = Buffer.alloc(26);
  const invertido = ordem === "II";
  const w16 = (v, o) => (invertido ? tiff.writeUInt16LE(v, o) : tiff.writeUInt16BE(v, o));
  const w32 = (v, o) => (invertido ? tiff.writeUInt32LE(v, o) : tiff.writeUInt32BE(v, o));
  tiff.write(ordem, 0, "ascii");
  w16(42, 2);
  w32(8, 4);            // o IFD0 começa logo depois do cabeçalho
  w16(1, 8);            // uma entrada só
  w16(0x0112, 10);      // Orientation
  w16(3, 12);           // do tipo SHORT
  w32(1, 14);           // uma cópia
  w16(orientacao, 18);  // o valor, que cabe no próprio campo
  w32(0, 22);           // não há IFD seguinte

  const carga = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const cabecalho = Buffer.alloc(4);
  cabecalho[0] = 0xff;
  cabecalho[1] = 0xe1;
  cabecalho.writeUInt16BE(carga.length + 2, 2);
  return Buffer.concat([base.subarray(0, 2), cabecalho, carga, base.subarray(2)]);
}

// ==================== OS CASOS ====================

const CASOS = [
  // O que tem que passar — reprovar aqui não quebra nada, só desliga o ganho.
  ["baseline, 3 componentes (o normal)", base, true],
  ["baseline em escala de cinza", trocarByte(base, sof + 9, 1), true],
  ["EXIF orientação 1 (normal)", comExif(1), true],
  ["EXIF orientação 1, big-endian (MM)", comExif(1, "MM"), true],

  // O que NÃO pode passar. Cada um destes é um rolo impresso errado.
  ["EXIF orientação 6 (gira 90°)", comExif(6), false],
  ["EXIF orientação 3 (gira 180°)", comExif(3), false],
  ["EXIF orientação 2 (espelha)", comExif(2), false],
  ["progressivo (SOF2)", trocarByte(base, sof + 1, 0xc2), false],
  ["sem perda (SOF3)", trocarByte(base, sof + 1, 0xc3), false],
  ["aritmético (SOF9)", trocarByte(base, sof + 1, 0xc9), false],
  ["4 componentes (CMYK)", trocarByte(base, sof + 9, 4), false],
  ["precisão de 12 bits", trocarByte(base, sof + 4, 12), false],

  // Lixo e arquivo pela metade: na dúvida, redesenha.
  ["truncado no meio do cabeçalho", base.subarray(0, sof + 6), false],
  ["cortado antes do SOF", base.subarray(0, 20), false],
  ["PNG", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]), false],
  ["lixo", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), false],
  ["vazio", Buffer.alloc(0), false],
];

let erros = 0;
CASOS.forEach(([nome, dados, esperado]) => {
  const deu = jpegSeguroParaPdf(new Uint8Array(dados));
  if (deu !== esperado) {
    erros++;
    console.log(`  ERRO  ${nome.padEnd(36)} ${deu ? "passou" : "reprovou"}, `
      + `e devia ${esperado ? "passar" : "reprovar"}`);
  } else {
    console.log(`  ok    ${nome.padEnd(36)} ${deu ? "passa" : "reprova"}`);
  }
});

if (erros > 0) {
  console.error(`\nFALHOU — ${erros} de ${CASOS.length} casos.`);
  process.exit(1);
}
console.log(`\nOK — ${CASOS.length} casos, o validador de marcador acertou todos.`);
