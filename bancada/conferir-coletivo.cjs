#!/usr/bin/env node
/**
 * ===========================================================================
 * A memória coletiva não pode segurar o encaixe
 * ===========================================================================
 *
 * O placar de todas as lojas (`servidor/encaixe-coletivo.js`) é pedido ao
 * backend no começo de toda busca, e o arquivo promete que isso nunca é
 * caminho crítico: "a espera pela internet tem teto curto". Medido em
 * 2026-09-30, a promessa tinha dois buracos:
 *
 *   - a FALHA não ficava guardada: com a sessão recusada pelo backend (401),
 *     todo encaixe esperava de novo a ida e volta até o Railway para ouvir o
 *     mesmo "não" — 0,5 a 0,9 s por encaixe, para sempre;
 *   - a renovação do token, no meio de um 401, corria FORA do teto.
 *
 * Aqui o backend é de mentira, local (`OPTMIZE_BACKEND`), e cada cenário sobe
 * o módulo do zero:
 *
 *   lento      o backend não responde: o placar volta dentro do teto;
 *   recusa     401 e a renovação demora: ainda dentro do teto, e o pedido
 *              seguinte não vai à rede (a falha ficou guardada);
 *   normal     o placar chega, e o seguinte sai do cache, sem rede.
 *
 *   node bancada/conferir-coletivo.cjs
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { semearSessao } = require('./sessao-de-teste.cjs');

const falhas = [];
const falhar = (texto) => { falhas.push(texto); };

let modo = 'normal';
let pedidos = 0;
const semRede = process.argv.includes('--sem-rede');

// O sandbox pode bloquear até loopback (EACCES). O modo sem rede exercita a
// sessão, a renovação, o cache e o AbortSignal reais com transporte simulado.
if (semRede) globalThis.fetch = async (url, opcoes = {}) => {
  if (!String(url).startsWith('http://127.0.0.1:1/')) throw new Error('destino inesperado no teste');
  pedidos++;
  const recusa = modo === 'recusa';
  const atraso = modo === 'lento' ? 5000 : recusa && String(url).endsWith('/device/token') ? 4000 : 0;
  if (atraso) await new Promise((resolve, reject) => {
    const sinal = opcoes.signal;
    const abortar = () => { clearTimeout(timer); sinal?.removeEventListener('abort', abortar); reject(new Error('abortado')); };
    const timer = setTimeout(() => { sinal?.removeEventListener('abort', abortar); resolve(); }, atraso);
    if (sinal?.aborted) abortar();
    else sinal?.addEventListener('abort', abortar, { once: true });
  });
  return new Response(JSON.stringify(recusa ? { code: 'invalid_token' }
    : { receitas: [{ receita: 'r1', usos: 3, vitorias: 2 }], encaixes: 7 }),
  { status: recusa ? 401 : 200, headers: { 'Content-Type': 'application/json' } });
};

const backend = http.createServer((req, res) => {
  pedidos++;
  const responder = (status, corpo) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(corpo));
  };
  if (modo === 'lento') return setTimeout(() => responder(200, { receitas: [], encaixes: 0 }), 5000);
  if (modo === 'recusa') {
    if (req.url.startsWith('/device/token')) return setTimeout(() => responder(401, { code: 'invalid_token' }), 4000);
    return responder(401, { code: 'invalid_token' });
  }
  return responder(200, { receitas: [{ receita: 'r1', usos: 3, vitorias: 2 }], encaixes: 7 });
});

/** O módulo do zero, para o que ele guarda em memória não passar de um cenário ao outro. */
function coletivoNovo() {
  const caminho = require.resolve('../servidor/encaixe-coletivo.js');
  delete require.cache[caminho];
  return require(caminho);
}

async function cronometrar(fazer) {
  const inicio = Date.now();
  const resultado = await fazer();
  return { resultado, ms: Date.now() - inicio };
}

async function principal() {
  if (!semRede) await new Promise((pronto) => backend.listen(0, '127.0.0.1', pronto));
  else console.log('transporte simulado: nenhuma conexão de rede');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-coletivo-'));
  semearSessao(pasta);
  // O contrato de sessão migrou de accessToken para token. A bancada antiga
  // nem chegava à rede e dava uma falsa impressão de timeout rápido.
  fs.writeFileSync(path.join(pasta, 'sessao', 'sessao.json'), JSON.stringify({
    token: 'bancada-sem-valor', expira: new Date(Date.now() + 86400000).toISOString(),
    perfil: { nome: 'Bancada de Teste' },
  }));
  process.env.OPTIMIZE_DADOS = pasta;
  process.env.OPTMIZE_BACKEND = `http://127.0.0.1:${semRede ? 1 : backend.address().port}`;

  // Sem consentimento, nem uma consulta com a assinatura do trabalho sai.
  delete process.env.OPTIMIZE_COLETIVO_AUTORIZADO;
  {
    const coletivo = coletivoNovo();
    const antes = pedidos;
    coletivo.iniciar(); coletivo.agendar(1);
    const r = await coletivo.sincronizar();
    if (r.enviados !== 0 || r.baixou) falhar('sem autorização: sincronizou');
    if (await coletivo.placarDe('privado') !== null) falhar('sem autorização: usou placar coletivo');
    if (coletivo.redeGlobal() !== null || coletivo.placarGeral().length) falhar('sem autorização: usou rede global');
    await new Promise(pronto => setTimeout(pronto, 30));
    if (pedidos !== antes) falhar('sem autorização: enviou pedido à rede');
    console.log(`sem autorização: ${pedidos - antes} pedidos à rede`);
  }
  process.env.OPTIMIZE_COLETIVO_AUTORIZADO = '1';

  // ---- lento ----
  modo = 'lento';
  {
    const coletivo = coletivoNovo();
    const primeiro = await cronometrar(() => coletivo.placarDe('lento-1'));
    console.log(`lento: primeiro placar em ${primeiro.ms} ms`);
    if (primeiro.ms > 1800) falhar(`lento: o placar esperou ${primeiro.ms} ms (teto 1,5 s)`);
    const antes = pedidos;
    const segundo = await cronometrar(() => coletivo.placarDe('lento-2'));
    console.log(`lento: o seguinte em ${segundo.ms} ms, ${pedidos - antes} pedido(s) à rede`);
    if (pedidos !== antes) falhar('lento: depois de uma falha, o placar seguinte voltou a ir à rede');
  }

  // ---- recusa ----
  modo = 'recusa';
  {
    const coletivo = coletivoNovo();
    const primeiro = await cronometrar(() => coletivo.placarDe('recusa-1'));
    console.log(`recusa: primeiro placar em ${primeiro.ms} ms`);
    if (primeiro.ms > 1800) falhar(`recusa: com a renovação do token, o placar esperou ${primeiro.ms} ms (teto 1,5 s)`);
    const antes = pedidos;
    const segundo = await cronometrar(() => coletivo.placarDe('recusa-2'));
    console.log(`recusa: o seguinte em ${segundo.ms} ms, ${pedidos - antes} pedido(s) à rede`);
    if (pedidos !== antes) falhar('recusa: depois de um 401, o placar seguinte voltou a ir à rede');
    if (segundo.ms > 100) falhar(`recusa: o placar seguinte levou ${segundo.ms} ms`);
  }

  // ---- normal ----
  modo = 'normal';
  {
    const coletivo = coletivoNovo();
    const primeiro = await cronometrar(() => coletivo.placarDe('normal-1'));
    const receitas = primeiro.resultado && primeiro.resultado.receitas;
    console.log(`normal: placar em ${primeiro.ms} ms, ${receitas ? receitas.length : 0} receita(s)`);
    if (!receitas || receitas.length !== 1) falhar('normal: o placar do backend não chegou');
    const antes = pedidos;
    const segundo = await cronometrar(() => coletivo.placarDe('normal-1'));
    if (pedidos !== antes) falhar('normal: o mesmo placar, ainda fresco, foi pedido de novo à rede');
    if (!segundo.resultado || segundo.resultado.encaixes !== 7) falhar('normal: o cache não devolveu o placar guardado');
  }

  backend.close();
  if (falhas.length === 0) {
    console.log('OK — a memória coletiva respeita o teto e não repete a espera depois de falhar.');
    process.exit(0);
  }
  console.log(`FALHOU — ${falhas.length} problema(s):`);
  falhas.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

principal().catch((erro) => { console.error(erro); process.exit(1); });
