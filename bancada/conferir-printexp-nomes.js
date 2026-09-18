#!/usr/bin/env node
/**
 * Confere o conserto do nome de trabalho do PrintExp.
 *
 * O `PrintData.xml` mistura GBK (as strings do software) com a página ANSI do
 * Windows (os nomes que o operador digitou), e não declara nenhuma das duas —
 * ver o cabeçalho de `sources/printExp.js`. Lido tudo como GBK, um acento
 * seguido de letra vira um ideograma só: `FALCÃO` sai `FALC肙`.
 *
 * Esta conferência parte dos BYTES, e não de uma string já decodificada. É o
 * ponto todo: escrever o caso de teste em JavaScript com o caractere errado já
 * embutido provaria que a função troca um caractere por outro, e não que ela
 * conserta o que aquele arquivo tem dentro.
 *
 *   node bancada/conferir-printexp-nomes.js
 */

const iconv = require("iconv-lite");
const { decodificarCampo } = require("../servidor/impressoras/sources/printExp");

/*
 * O caminho exato que o sistema faz: bytes -> latin-1 (sem perda) -> a escolha
 * de codificacao por campo.
 *
 * Os casos abaixo tambem registram o que sairia pela leitura ANTIGA (tudo em
 * GBK), porque e ela que este conserto substitui: sem isso, um caso que passa
 * dos dois jeitos pareceria estar provando alguma coisa.
 */
function comoOSistemaLe(bytes) {
  return decodificarCampo(Buffer.from(bytes).toString("latin1"));
}

function comoEraAntes(bytes) {
  return iconv.decode(Buffer.from(bytes), "gbk");
}

const CASOS = [
  {
    porque: "o caso que apareceu na máquina: Ã seguido de O",
    bytes: [0x4e, 0x49, 0x43, 0x4b, 0x20, 0x46, 0x41, 0x4c, 0x43, 0xc3, 0x4f,
      0x2e, 0x70, 0x72, 0x74],
    espera: "NICK FALCÃO.prt",
  },
  {
    porque: "Ô seguido de N cai na mesma armadilha (0x4e é cauda GBK válida)",
    bytes: [0x41, 0x4e, 0x54, 0xd4, 0x4e, 0x49, 0x4f],
    espera: "ANTÔNIO",
  },
  {
    porque: "Ç seguido de O, idem",
    bytes: [0x4c, 0x41, 0xc7, 0x4f],
    espera: "LAÇO",
  },
  {
    porque: "a string do PRÓPRIO software fica intocada — é GBK de verdade",
    bytes: [0xd0, 0xa3, 0xd7, 0xbc],
    espera: "校准",
  },
  {
    porque: "nome sem acento nenhum passa igual pelos dois",
    bytes: [...Buffer.from("SO PAPEL.prt", "latin1")],
    espera: "SO PAPEL.prt",
  },
  {
    porque: "acento cuja letra seguinte NÃO é cauda GBK já passava, e continua",
    bytes: [0x41, 0xc7, 0x20, 0x42],
    espera: "AÇ B",
  },
];

let falhas = 0;
for (const caso of CASOS) {
  const saiu = comoOSistemaLe(caso.bytes);
  const cru = comoEraAntes(caso.bytes);
  const ok = saiu === caso.espera;
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok    " : "FALHOU"}  ${JSON.stringify(saiu)}`
    + (ok ? "" : `  esperava ${JSON.stringify(caso.espera)}`));
  console.log(`          ${caso.porque}`);
  if (cru !== saiu) console.log(`          (sem o conserto sairia ${JSON.stringify(cru)})`);
}

console.log("");
if (falhas === 0) {
  console.log(`OK — ${CASOS.length} casos, todos os nomes saíram como o operador digitou.`);
} else {
  console.log(`FALHOU — ${falhas} de ${CASOS.length} casos.`);
  process.exit(1);
}
