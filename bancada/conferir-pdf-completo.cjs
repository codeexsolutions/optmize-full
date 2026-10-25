const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');
const zlib = require('node:zlib');

const uso = require.resolve('../servidor/uso');
let cobrancas = 0;
require.cache[uso] = { id: uso, filename: uso, loaded: true, exports: {
  permitirExportacao: async () => { cobrancas++; return { permitido: true }; },
} };
const router = require('../servidor/encaixe-pdf');

function pecasNoPdf(bytes) {
  const texto = bytes.toString('latin1');
  const streams = [...texto.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  let total = 0;
  for (const stream of streams) {
    try {
      const conteudo = zlib.inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
      total += (conteudo.match(/\/I\d+ Do\b/g) || []).length;
    } catch {}
  }
  return total;
}

async function principal() {
  const app = express();
  app.use(express.json());
  app.use(router);
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise(pronto => servidor.once('listening', pronto));
  const endereco = `http://127.0.0.1:${servidor.address().port}`;
  const agoraOriginal = Date.now;
  let agora = agoraOriginal();
  Date.now = () => agora;
  try {
    const imagem = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#224488' } }).png().toBuffer();
    const enviar = async (sessao, chave, bytes = imagem) => {
      const resposta = await fetch(`${endereco}/arte?sessao=${sessao}&chave=${chave}`, { method: 'POST', body: bytes });
      assert.equal(resposta.status, 200);
    };
    const pdf = async (sessao, chaves, extra = {}) => {
      const resposta = await fetch(`${endereco}/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao, larguraTecido: 100, consumo: 20,
          imagens: [...new Set(chaves)].map(chave => ({ chave })),
          posicoes: chaves.map((chave, indice) => ({ chave, x: indice * 10, y: 0, largura: 8, altura: 8 })), ...extra }),
      });
      return { status: resposta.status, bytes: Buffer.from(await resposta.arrayBuffer()) };
    };
    await enviar('ausente', 'frente');
    const cobrancasAntes = cobrancas;
    const incompleto = await pdf('ausente', ['frente', 'costas']);
    assert.equal(incompleto.status, 400, 'Não pode entregar PDF com uma arte ausente');
    assert.match(incompleto.bytes.toString(), /costas/);
    assert.equal(cobrancas, cobrancasAntes, 'Arte ausente deve ser recusada antes da cota');

    await enviar('longo', 'frente');
    agora += 6 * 60 * 1000;
    await enviar('longo', 'costas');
    agora += 6 * 60 * 1000;
    await enviar('longo', 'manga');
    const completo = await pdf('longo', ['frente', 'frente', 'costas', 'manga', 'manga'], { manterSessao: true });
    assert.equal(completo.status, 200);
    assert.equal(pecasNoPdf(completo.bytes), 5, 'Exportação longa precisa manter todas as artes e cópias');
    agora += 6 * 60 * 1000;
    const bancada = await pdf('longo', ['frente', 'costas']);
    assert.equal(bancada.status, 200);
    assert.equal(pecasNoPdf(bancada.bytes), 2);
    assert.equal((await pdf('longo', ['frente'])).status, 400);

    await enviar('invalida', 'frente');
    // O servidor não guarda a arte que não abre (a tela manda a desenhada no
    // lugar): o PDF acusa a falta em vez de sair parcial.
    const quebrada = await fetch(`${endereco}/arte?sessao=invalida&chave=costas`, { method: 'POST', body: Buffer.from('imagem quebrada') });
    assert.equal(quebrada.status, 200);
    assert.equal((await quebrada.json()).legivel, false);
    const invalido = await pdf('invalida', ['frente', 'costas']);
    assert.equal(invalido.status, 400, 'Arte ilegível não pode virar PDF parcial com status 200');
    assert.match(invalido.bytes.toString(), /costas/);
    assert.ok(!invalido.bytes.subarray(0, 4).equals(Buffer.from('%PDF')));

    await enviar('abandonada', 'frente');
    agora += 11 * 60 * 1000;
    assert.equal((await pdf('abandonada', ['frente'])).status, 400);
    console.log('OK — todas as cópias, exportação longa, várias bancadas, ausência/erro de arte e limpeza de sessão.');
  } finally {
    Date.now = agoraOriginal;
    await new Promise(pronto => servidor.close(pronto));
  }
}

principal().catch(erro => { console.error(erro); process.exitCode = 1; });
