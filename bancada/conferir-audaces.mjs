/*
 * BANCADA — o .ads da Audaces, no que já está decifrado
 *
 *     npm run bancada:audaces
 *
 * Os arquivos da fábrica NÃO estão no git. A pasta vem de
 * OPTMIZE_ARQUIVOS_AUDACES (padrão D:\uso de teste); sem ela, rodam só os
 * casos montados aqui. Ver docs/formatos/audaces-ads.md.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { carregarModulo } from "./carregarModulo.mjs";

const ads = await carregarModulo("src/motores/audacesAds.js");

/** Um .ads mínimo: cabeçalho, nome, miniatura falsa, uma ficha e uma tabela P/M/G/GG. */
function adsDeMentira({ versao = "CADZ vs6.0 ", pecas = 1 } = {}) {
  const partes = [];
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const texto = (s) => Buffer.concat([u16(Buffer.byteLength(s, "latin1")), Buffer.from(s, "latin1")]);
  const cab = Buffer.alloc(0x26);
  cab.write(versao, 0, "latin1"); cab[11] = 0x1a; cab.writeUInt32LE(pecas, 0x0c);
  partes.push(cab, texto("MOLDE TESTE"), Buffer.alloc(6));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  partes.push(u32(jpeg.length), jpeg, Buffer.from("LIG\0", "latin1"), Buffer.alloc(16));
  partes.push(u16(6), texto("CÓS 2X"), Buffer.alloc(40), u16(1), texto("MOLDE TESTE "), Buffer.alloc(8));
  // Registro de tamanho: cor R,G,B,0 · u32 ativo · u8 1 · nome em 3 bytes · 8 bytes fixos.
  const registro = (nome, cor, ativo) => {
    const r = Buffer.alloc(20);
    r[0] = cor[0]; r[1] = cor[1]; r[2] = cor[2]; r.writeUInt32LE(ativo, 4);
    r[8] = 1; r.write(nome, 9, "latin1");
    Buffer.from([0xef, 0x1a, 0x77, 0x00, 0x0c, 0x3f, 0x7d, 0x00]).copy(r, 12);
    return r;
  };
  partes.push(registro("P", [0, 255, 0], 1), registro("M", [255, 0, 0], 1), registro("G", [0, 255, 255], 1), registro("GG", [255, 128, 0], 0));
  partes.push(Buffer.from([5, 0, 2, 0]));
  return new Uint8Array(Buffer.concat(partes));
}

// 1. Cabeçalho.
{
  const c = ads.lerCabecalhoAds(adsDeMentira());
  assert.equal(c.versao, "vs6.0");
  assert.equal(c.pecas, 1);
  assert.equal(c.nome, "MOLDE TESTE");
  assert.equal(c.miniatura[0], 0xff);
  assert.ok(ads.lerCabecalhoAds(adsDeMentira({ versao: "CADZ vs7.0 " })).erro.includes("vs7.0"), "outra versão é recusada");
  assert.ok(ads.lerCabecalhoAds(new Uint8Array(10)).erro, "arquivo que não é .ads é recusado");
}

// 2. Fichas: nome sem "2X", quantidade, acento em Windows-1252.
{
  const b = adsDeMentira();
  const f = ads.fichasDasPecas(b, ads.lerCabecalhoAds(b).fimDaMiniatura);
  assert.equal(f.length, 1);
  assert.equal(f[0].nome, "CÓS");
  assert.equal(f[0].quantidade, 2);
}

// 3. Tabela de tamanhos: a cor vem ANTES do nome; o GG deste caso está inativo.
{
  const b = adsDeMentira();
  const t = ads.tabelasDeTamanhos(b, ads.lerCabecalhoAds(b).fimDaMiniatura);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0].tamanhos, [
    { nome: "P", cor: "#00ff00", ativo: true }, { nome: "M", cor: "#ff0000", ativo: true },
    { nome: "G", cor: "#00ffff", ativo: true }, { nome: "GG", cor: "#ff8000", ativo: false },
  ]);
}

// 4. Resumo: a contagem de fichas tem de bater com o cabeçalho; se não bate, avisa.
{
  const r = ads.resumoDoAds(adsDeMentira({ pecas: 2 }));
  assert.ok(r.avisos.some((a) => /2 peças/.test(a)), "a contagem que não bate vira aviso");
  const ok = ads.resumoDoAds(adsDeMentira());
  assert.deepEqual(ok.tamanhos, [{ nome: "P", cor: "#00ff00" }, { nome: "M", cor: "#ff0000" }, { nome: "G", cor: "#00ffff" }], "só os ativos");
}

// 5. Os arquivos da fábrica, se estiverem aqui.
const PASTA = process.env.OPTMIZE_ARQUIVOS_AUDACES || "D:\\uso de teste";
const esperado = {
  "SAIA BABADO CURTO.ads": { pecas: ["FRENTE", "FORRO", "COSTA", "BARRA"], tamanhos: ["P", "M", "G", "GG"], cores: ["#00ff00", "#ff0000", "#00ffff", "#ff8000"] },
  "SHORT TACTEL.ads": { pecas: ["TRAZEIRO", "BOLSO", "DIANTEIRO", "CÓS", "VIEIS", "FAIXA DE CABELO"], tamanhos: ["P", "M", "G", "GG"], cores: ["#00ff00", "#ff0000", "#00ffff", "#ff8000"] },
  "PIJAMA INF. (M).ADS": { pecas: 8, tamanhos: ["M"], cores: ["#ff0000"] },
  "PIJAMA INF. (G).ADS": { pecas: 8, tamanhos: ["G"], cores: ["#ff0000"] },
};
for (const [arquivo, e] of Object.entries(esperado)) {
  const caminho = path.join(PASTA, arquivo);
  if (!fs.existsSync(caminho)) { console.log(`(pulei ${arquivo}: não achei em ${PASTA})`); continue; }
  const r = ads.resumoDoAds(new Uint8Array(fs.readFileSync(caminho)));
  assert.ok(!r.erro, `${arquivo}: ${r.erro}`);
  if (Array.isArray(e.pecas)) assert.deepEqual(r.pecas.map((p) => p.nome), e.pecas, arquivo);
  else assert.equal(r.pecas.length, e.pecas, arquivo);
  assert.deepEqual(r.tamanhos.map((t) => t.nome), e.tamanhos, arquivo);
  assert.deepEqual(r.tamanhos.map((t) => t.cor), e.cores, arquivo);
  assert.deepEqual(r.avisos, [], `${arquivo}: ${r.avisos.join(" / ")}`);
}

console.log("OK — o .ads confere no que já está decifrado.");
