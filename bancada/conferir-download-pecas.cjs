const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fonte = fs.readFileSync(path.join(__dirname, '../src/producao/controlador.js'), 'utf8');
const inicio = fonte.indexOf('async function baixarEncaixeEmPdf() {');
const fim = fonte.indexOf('\nescopo.ouvir(btnEncaixePdf', inicio);
assert.ok(inicio >= 0 && fim > inicio);

async function conferir(quantidadeBancadas) {
  const posicoes = Array.from({ length: 12 }, (_, indice) => ({
    item: { indice: indice % 3 }, rot: indice % 2 ? 90 : 0,
    x: indice % 4 * 10, y: Math.floor(indice / 4) * 20,
    largura: 8, altura: 10, bancada: indice % quantidadeBancadas,
  }));
  const pedidos = [];
  const gravados = [];
  const enviadas = new Set();
  const contexto = {
    ultimoResultado: { posicoes, consumo: 60, larguraTecido: 100 },
    recusouPorTrava: () => false,
    bancadasDoResultado: () => Array.from({ length: quantidadeBancadas }, (_, numero) => ({ numero, topo: 0, fundo: 60 })),
    midiaConsumida: () => 60, midiaPelaCaixa: () => 60,
    escolherOndeSalvar: async () => ({ nome: 'teste.pdf', gravar: async (corpo) => gravados.push(corpo) }),
    escolherPastaDeSaida: async () => ({ base: 'teste', onde: 'teste', criar: async () => ({ gravar: async (corpo) => gravados.push(corpo) }) }),
    btnExportar: {}, btnExportarRotulo: {},
    setTimeout, console,
    prepararArtes: async (pecas, enviar) => {
      const artes = new Map();
      for (const peca of pecas) {
        const chave = `${peca.item.indice}-${peca.rot}`;
        if (!artes.has(chave)) { await enviar(chave, chave); artes.set(chave, null); }
      }
      return artes;
    },
    encaixeApi: {
      mandarArte: async (sessao, chave) => enviadas.add(chave),
      pdf: async (pedido) => { pedidos.push(pedido); return pedido; },
    },
    visaoDosPedidos: () => null, avisarQueSalvou: () => {}, avisarSemSigla: () => {},
    guardarParaReposicao: async () => {}, producaoTravada: () => false,
    mostrarErroEncaixe: (erro) => { throw new Error(erro); },
  };
  vm.createContext(contexto);
  await vm.runInContext(`${fonte.slice(inicio, fim)}\nbaixarEncaixeEmPdf()`, contexto);
  assert.equal(pedidos.length, quantidadeBancadas);
  assert.equal(gravados.length, quantidadeBancadas);
  assert.equal(pedidos.reduce((total, pedido) => total + pedido.posicoes.length, 0), posicoes.length);
  for (const pedido of pedidos) {
    for (const posicao of pedido.posicoes) assert.ok(enviadas.has(posicao.chave));
  }
  if (quantidadeBancadas > 1) {
    assert.ok(pedidos.slice(0, -1).every((pedido) => pedido.manterSessao));
    assert.equal(pedidos.at(-1).manterSessao, false);
  }
}

(async () => {
  await conferir(1);
  await conferir(3);
  console.log('OK — botão baixar envia e grava todas as 12 posições, em um PDF e em três bancadas.');
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
