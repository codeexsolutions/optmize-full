/*
 * O ANDAMENTO DO PDF: enquanto `/pdf` monta, `/pdf-andamento` responde quantas
 * peças já entraram no arquivo — subindo, sem pular o fim — e o arquivo chega
 * com o tamanho declarado, que é o que o modal do Exportar usa para contar a
 * gravação.
 *
 *   node bancada/conferir-andamento-do-pdf.cjs
 */
const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');

const uso = require.resolve('../servidor/uso');
require.cache[uso] = { id: uso, filename: uso, loaded: true, exports: {
  permitirExportacao: async () => ({ permitido: true }),
} };
const router = require('../servidor/encaixe-pdf');

(async () => {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use(router);
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((pronto) => servidor.once('listening', pronto));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    // Artes de tamanho de verdade, para a montagem levar tempo o bastante para ser vista.
    const chaves = [];
    for (let i = 0; i < 24; i++) {
      const bytes = await sharp({ create: { width: 2400, height: 3000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).jpeg({ quality: 90 }).toBuffer();
      const r = await fetch(`${base}/arte?sessao=s&chave=a${i}`, { method: 'POST', body: bytes });
      assert.equal(r.status, 200);
      chaves.push(`a${i}`);
    }
    const posicoes = Array.from({ length: 72 }, (_, i) => ({
      chave: chaves[i % chaves.length], x: (i % 6) * 26, y: Math.floor(i / 6) * 33, largura: 25, altura: 32 }));

    const pedido = 'teste-andamento';
    const vistos = [];
    let esperando = true;
    const perguntar = (async () => {
      while (esperando) {
        const estado = await (await fetch(`${base}/pdf-andamento?pedido=${pedido}`)).json();
        if (estado.fase) vistos.push(estado);
        await new Promise((r) => setTimeout(r, 20));
      }
    })();
    const resposta = await fetch(`${base}/pdf`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessao: 's', pedido, larguraTecido: 160, consumo: 340,
        imagens: chaves.map((chave) => ({ chave })), posicoes }),
    });
    esperando = false;
    await perguntar;
    assert.equal(resposta.status, 200);
    const declarado = Number(resposta.headers.get('content-length'));
    const corpo = Buffer.from(await resposta.arrayBuffer());
    assert.ok(declarado > 0 && declarado === corpo.length, 'o tamanho declarado é o do arquivo');

    const montando = vistos.filter((v) => v.fase === 'montando');
    console.log('leituras:', vistos.map((v) => v.fase === 'montando' ? v.feitas : v.fase).join(' '));
    assert.ok(montando.length >= 2, `o andamento da montagem apareceu (${montando.length} leituras)`);
    for (let i = 1; i < montando.length; i++) {
      assert.ok(montando[i].feitas >= montando[i - 1].feitas, 'as peças nunca voltam');
    }
    assert.ok(montando.every((v) => v.total === posicoes.length), 'o total é o das peças');
    const depois = await (await fetch(`${base}/pdf-andamento?pedido=${pedido}`)).json();
    assert.deepEqual(depois, {}, 'o andamento some quando o PDF termina');

    console.log(`andamento do pdf: ${montando.length} leituras, `
      + `${montando[0].feitas} → ${montando[montando.length - 1].feitas} de ${posicoes.length} peças, `
      + `${(declarado / 1048576).toFixed(1)} MB declarados: ok`);
  } finally {
    servidor.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
