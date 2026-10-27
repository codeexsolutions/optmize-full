/*
 * EXPORTAR DE NOVO NÃO REFAZ O QUE JÁ FOI FEITO: com `manterSessao`, as artes
 * ficam no servidor (`/artes-da-sessao` as lista), a segunda exportação do
 * mesmo trabalho usa as artes já preparadas — sai IGUAL, byte a byte, e mais
 * rápida — e reenviar uma chave com outra arte invalida o preparado dela.
 *
 *   node bancada/conferir-reexportar.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const crypto = require('node:crypto');

const uso = require.resolve('../servidor/uso');
require.cache[uso] = { id: uso, filename: uso, loaded: true, exports: {
  permitirExportacao: async () => ({ permitido: true }),
} };
const router = require('../servidor/encaixe-pdf');

// O PDF leva a data de criação: fora dela, dois PDFs iguais têm de bater, byte a byte.
const semData = (b) => crypto.createHash('sha1').update(b.toString('latin1')
  // A data sai como objeto à parte (`27 0 obj (D:20261027235232Z)`) e de novo
  // nos metadados XMP (`2026-10-27T23:53:07Z`), e o /ID é tirado dela: duas
  // exportações seguidas podem cair em segundos diferentes.
  .replace(/\(D:\d{14}Z?\)/g, '')
  .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-][\d:]+)?/g, '')
  .replace(/\/ID \[[^\]]*\]/g, '')).digest('hex');

(async () => {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use(router);
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((pronto) => servidor.once('listening', pronto));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    // PNG com transparência: é o caminho caro (abrir, converter, comprimir).
    const arte = (cor) => sharp({ create: { width: 2400, height: 3000, channels: 4,
      background: { ...cor, alpha: 0.6 } } }).png().toBuffer();
    const artes = [];
    for (let i = 0; i < 8; i++) artes.push(await arte({ r: 20 * i, g: 120, b: 200 - 20 * i }));
    const enviar = async (chave, bytes) => {
      const r = await fetch(`${base}/arte?sessao=s&chave=${chave}`, { method: 'POST', body: bytes });
      assert.equal(r.status, 200);
    };
    for (let i = 0; i < artes.length; i++) await enviar(`a${i}`, artes[i]);

    const pdf = async () => {
      const t = Date.now();
      const r = await fetch(`${base}/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao: 's', larguraTecido: 160, consumo: 70, manterSessao: true,
          imagens: artes.map((_, i) => ({ chave: `a${i}` })),
          posicoes: artes.map((_, i) => ({ chave: `a${i}`, x: (i % 4) * 40, y: Math.floor(i / 4) * 34, largura: 26, altura: 32 })) }),
      });
      assert.equal(r.status, 200);
      return { bytes: Buffer.from(await r.arrayBuffer()), ms: Date.now() - t };
    };

    const primeira = await pdf();
    const lista = await (await fetch(`${base}/artes-da-sessao?sessao=s`)).json();
    assert.equal(lista.chaves.length, artes.length, 'a sessão continua com as artes depois do PDF');
    const segunda = await pdf();
    assert.equal(semData(segunda.bytes), semData(primeira.bytes), 'a segunda exportação sai igual à primeira');
    assert.ok(segunda.ms < primeira.ms, `a segunda é mais rápida (${primeira.ms} ms → ${segunda.ms} ms)`);

    // Troca a arte de uma chave: o PDF tem de mudar.
    await enviar('a0', await arte({ r: 250, g: 10, b: 10 }));
    const terceira = await pdf();
    assert.notEqual(semData(terceira.bytes), semData(primeira.bytes), 'arte trocada não usa o preparado antigo');

    const vazia = await (await fetch(`${base}/artes-da-sessao?sessao=nao-existe`)).json();
    assert.deepEqual(vazia.chaves, []);
    console.log(`reexportar: ${primeira.ms} ms → ${segunda.ms} ms, PDF igual; arte trocada refeita: ok`);
  } finally {
    servidor.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
