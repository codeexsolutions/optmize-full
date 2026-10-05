/*
 * BANCADA — o `.adsx` da Audaces (o gabarito do molde graduado)
 *
 *     npm run bancada:adsx
 *
 * Roda na CI: os `.adsx` são montados aqui. O `.adsx` é um ZIP; dentro, o
 * `data.xml` tem a grade e, de cada peça, a largura e a altura em cada tamanho
 * — é com elas que o contorno do PLT é casado (`motores/pltGraduado.js`). Ver
 * docs/superpowers/specs/2026-10-05-importar-molde-graduado-design.md.
 */
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { carregarModulo } from "./carregarModulo.mjs";

const x = await carregarModulo("src/motores/audacesAdsx.js");

/** Um ZIP mínimo (deflate), do jeito do `.adsx`: cabeçalhos locais e o diretório central. */
function zip(arquivos) {
  const locais = [];
  const central = [];
  let posicao = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const dados = Buffer.from(conteudo, "latin1");
    const comprimido = zlib.deflateRawSync(dados);
    const n = Buffer.from(nome);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comprimido.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(comprimido.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(posicao, 42);
    locais.push(local, n, comprimido);
    central.push(c, n);
    posicao += 30 + n.length + comprimido.length;
  }
  const dir = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10); fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(posicao, 16);
  return new Uint8Array(Buffer.concat([...locais, dir, fim]));
}

const tamanho = (nome, w, h) => `<SIZE_P NAME_SP="${nome}"><PER_SP>1</PER_SP><WIDTH_SP>${w}</WIDTH_SP>  <!-- cm -->
  <HEIGHT_SP>${h}</HEIGHT_SP></SIZE_P>`;
const DATA_XML = `<?xml version="1.0" encoding="iso-8859-1"?>
<DATA_FILE_AUDACES ID="1" VER="3"><MODEL NAME_M="ARD.TESTE">
<SIZES_M><SIZE_M NAME_SP="P"></SIZE_M><SIZE_M NAME_SP="M"></SIZE_M><SIZE_M NAME_SP="G"></SIZE_M></SIZES_M>
<PATTERNS>
<PATTERN NAME_P="FRENTE2X"><DESC_P> </DESC_P><QT_MOD>1</QT_MOD>
<SIZES_P NAME_GRAD="P | (M) | G"><BASE_NAME>"M"</BASE_NAME>${tamanho("P", "20.000", "30.000")}${tamanho("M", "21.000", "31.000")}${tamanho("G", "22.000", "32.000")}</SIZES_P></PATTERN>
<PATTERN NAME_P=""><DESC_P>Bolso</DESC_P><QT_MOD>3</QT_MOD>
<SIZES_P NAME_GRAD="P | (M) | G"><BASE_NAME>"M"</BASE_NAME>${tamanho("P", "10", "10")}${tamanho("M", "10", "10")}${tamanho("G", "10", "10")}</SIZES_P></PATTERN>
<PATTERN NAME_P=""><DESC_P> </DESC_P><QT_MOD>1</QT_MOD>
<SIZES_P><BASE_NAME>"M"</BASE_NAME>${tamanho("M", "5", "5")}</SIZES_P></PATTERN>
</PATTERNS></MODEL></DATA_FILE_AUDACES>`;

let casos = 0;
const caso = async (nome, fn) => { await fn(); casos++; console.log(`  ok  ${nome}`); };

await caso("o gabarito: o nome, a grade, o base e as medidas de cada peça", async () => {
  const r = await x.lerAdsx(zip({ "index.json": "{}", "data.xml": DATA_XML }));
  assert.ok(!r.erro, r.erro);
  assert.equal(r.nome, "ARD.TESTE");
  assert.deepEqual(r.tamanhos, ["P", "M", "G"]);
  assert.equal(r.base, "M");
  assert.equal(r.pecas.length, 3);
  assert.deepEqual(r.pecas[0], {
    nome: "FRENTE", quantidade: 2,
    porTamanho: { P: { largura: 20, altura: 30 }, M: { largura: 21, altura: 31 }, G: { largura: 22, altura: 32 } },
  });
});

await caso("sem NAME_P, vale o DESC_P; sem os dois, Peça N; sem sufixo, a quantidade é o QT_MOD", async () => {
  const r = await x.lerAdsx(zip({ "data.xml": DATA_XML }));
  assert.equal(r.pecas[1].nome, "Bolso");
  assert.equal(r.pecas[1].quantidade, 3);
  assert.equal(r.pecas[2].nome, "Peça 3");
});

await caso("ZIP sem data.xml, e bytes que não são ZIP: erro dito", async () => {
  assert.ok((await x.lerAdsx(zip({ "index.json": "{}" }))).erro);
  assert.ok((await x.lerAdsx(new Uint8Array([1, 2, 3, 4, 5]))).erro);
});

console.log(`\nbancada:adsx — ${casos} casos ok`);
