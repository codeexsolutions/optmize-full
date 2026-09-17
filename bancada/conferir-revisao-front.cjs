const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');

const raiz = path.resolve(__dirname, '..');
const compilado = buildSync({
  stdin: {
    contents: `export { useDados } from './src/api/useDados';
      export { ProvedorDeDialogo, useDialogo } from './src/casca/Dialogo';
      export { Projetos } from './src/telas/Projetos';
      export { Cor } from './src/telas/Cor';
      export { Funcionarios } from './src/telas/Funcionarios';
      export { Moldes } from './src/telas/Moldes';
      export { duracao } from './src/utils/formato';`,
    resolveDir: raiz,
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  define: { 'import.meta.env.BASE_URL': '"/"' },
  external: ['react', 'react-dom'], logLevel: 'silent',
}).outputFiles[0].text;
const mod = new Module(path.join(raiz, 'revisao-front.cjs'), module);
mod.filename = path.join(raiz, 'revisao-front.cjs');
mod.paths = Module._nodeModulePaths(raiz);
const dom = new JSDOM('<!doctype html><div id="raiz"></div>', { url: 'http://localhost/projetos' });
for (const nome of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent']) global[nome] = dom.window[nome];
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
mod._compile(compilado, mod.filename);
const { useDados, ProvedorDeDialogo, useDialogo, Projetos, Cor, Funcionarios, Moldes, duracao } = mod.exports;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const elemento = React.createElement;
const adiada = () => {
  let resolve, reject;
  const promise = new Promise((ok, erro) => { resolve = ok; reject = erro; });
  return { promise, resolve, reject };
};
const montar = async componente => {
  const root = createRoot(document.getElementById('raiz'));
  await act(async () => root.render(componente));
  return root;
};
const clicar = async botao => {
  assert.ok(botao, 'botão encontrado');
  await act(async () => botao.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
};
const botao = texto => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === texto);

async function conferirConsultas() {
  const consultas = [];
  let estado;
  function Consulta({ filtro = 'a' }) {
    estado = useDados(() => {
      const consulta = adiada(); consultas.push(consulta); return consulta.promise;
    }, [filtro]);
    return elemento('output', null, estado.dados ?? estado.erro ?? 'carregando');
  }
  const root = await montar(elemento(Consulta));
  await act(async () => { estado.recarregar(); });
  await act(async () => consultas[1].resolve('mais novo'));
  await act(async () => consultas[0].resolve('antigo'));
  assert.equal(estado.dados, 'mais novo', 'resposta antiga não desfaz recarga');

  await act(async () => { estado.recarregar(); estado.recarregar(); });
  await act(async () => consultas[3].resolve('atual'));
  await act(async () => consultas[2].reject(new Error('erro antigo')));
  assert.equal(estado.dados, 'atual', 'erro antigo não apaga dados atuais');
  assert.equal(estado.erro, null);

  await act(async () => { estado.recarregar(); });
  await act(async () => estado.setDados('evento do servidor'));
  await act(async () => consultas[4].resolve('consulta anterior ao evento'));
  assert.equal(estado.dados, 'evento do servidor', 'socket prevalece sobre consulta pendente');

  await act(async () => { estado.recarregar(); });
  await act(async () => root.render(elemento(Consulta, { filtro: 'b' })));
  await act(async () => consultas[6].resolve('filtro b'));
  await act(async () => consultas[5].resolve('filtro a'));
  assert.equal(estado.dados, 'filtro b', 'recarga manual antiga respeita mudança de filtro');
  await act(async () => root.unmount());
}

async function conferirDialogos() {
  let dialogo;
  function Acesso() { dialogo = useDialogo(); return null; }
  const root = await montar(elemento(ProvedorDeDialogo, null, elemento(Acesso)));
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const pendentes = new Map();
  let proximo = 0;
  global.setTimeout = (fn, atraso, ...args) => {
    if (atraso !== 140) return originalSetTimeout(fn, atraso, ...args);
    const id = ++proximo; pendentes.set(id, fn); return id;
  };
  global.clearTimeout = id => {
    if (!pendentes.delete(id)) originalClearTimeout(id);
  };
  const passarTempo = async () => {
    const timers = [...pendentes.values()]; pendentes.clear();
    await act(async () => { for (const fn of timers) fn(); });
  };
  try {
    let primeira, segunda, respostaSegunda;
    await act(async () => { primeira = dialogo.confirmar('Primeira'); });
    await clicar(botao('Confirmar'));
    await clicar(botao('Confirmar'));
    assert.equal(pendentes.size, 1, 'duplo clique cria um único fechamento');
    await act(async () => {
      segunda = dialogo.confirmar('Segunda');
      segunda.then(valor => { respostaSegunda = valor; });
    });
    assert.equal(await primeira, false, 'diálogo substituído é cancelado');
    await passarTempo();
    assert.equal(respostaSegunda, undefined, 'fechamento anterior não responde ao novo diálogo');
    assert.match(document.querySelector('[role="dialog"]').textContent, /Segunda/);
    await clicar(botao('Confirmar'));
    await passarTempo();
    assert.equal(await segunda, true);
    assert.equal(document.body.classList.contains('dialog-open'), false);

    let desmontado;
    await act(async () => { desmontado = dialogo.confirmar('Antes de sair'); });
    await clicar(botao('Confirmar'));
    await act(async () => root.unmount());
    assert.equal(await desmontado, false, 'desmontar cancela confirmação pendente');
    assert.equal(pendentes.size, 0);
    assert.equal(document.body.classList.contains('dialog-open'), false);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

async function conferirProjetos() {
  const aberturas = [];
  global.fetch = async url => {
    if (url === '/api/projetos/clientes') return Response.json([{ id: 1, nome: 'Cliente', projetos: 2 }]);
    if (url === '/api/projetos/clientes/1/projetos') return Response.json({ projetos: [{ id: 1, nome: 'Projeto A' }, { id: 2, nome: 'Projeto B' }] });
    if (/^\/api\/projetos\/\d+$/.test(url)) {
      const resposta = adiada(); aberturas.push(resposta); return resposta.promise;
    }
    throw new Error('Requisição inesperada: ' + url);
  };
  const root = await montar(elemento(ProvedorDeDialogo, null, elemento(Projetos)));
  await clicar([...document.querySelectorAll('button')].find(x => x.textContent.includes('Cliente')));
  await clicar(botao('Projeto A'));
  await clicar(botao('Projeto B'));
  const projeto = (id, nome) => Response.json({ id, nome, pecas: [], cliente: { id: 1, nome: 'Cliente' } });
  await act(async () => aberturas[1].resolve(projeto(2, 'Projeto B')));
  await act(async () => aberturas[0].resolve(projeto(1, 'Projeto A')));
  assert.equal(document.querySelector('[aria-label="Nome do projeto"]').value, 'Projeto B',
    'o último projeto escolhido prevalece mesmo com respostas fora de ordem');
  await clicar(botao('Projeto A'));
  await clicar(botao('Projeto B'));
  await act(async () => aberturas[3].resolve(projeto(2, 'Projeto B')));
  await act(async () => aberturas[2].reject(new Error('falha obsoleta')));
  assert.doesNotMatch(document.body.textContent, /falha obsoleta/);
  await act(async () => root.unmount());
}

async function conferirFilaDeCor() {
  const conversoes = [];
  global.fetch = async url => {
    assert.equal(url, '/api/cor/converter');
    const resposta = adiada(); conversoes.push(resposta); return resposta.promise;
  };
  const root = await montar(elemento(Cor, { ativa: true }));
  const soltar = async nome => {
    // JPEG com quatro componentes: o diagnóstico real o identifica como CMYK.
    const file = new File([Buffer.from('ffd8ffc00008080001000104ffd9', 'hex')], nome, { type: 'image/jpeg' });
    await act(async () => {
      const evento = new dom.window.Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(evento, 'dataTransfer', { value: { files: [file] } });
      document.querySelector('.vetor-solta').dispatchEvent(evento);
    });
  };
  await soltar('primeira.jpg');
  await soltar('segunda.jpg');
  assert.equal(conversoes.length, 1, 'dois drops simultâneos usam uma só conversão por vez');
  assert.equal(document.querySelectorAll('.cor-item').length, 2, 'o lote seguinte já aparece na fila');
  await act(async () => conversoes[0].resolve(Response.json({ convertido: false, motivo: 'sem perfil' })));
  assert.equal(conversoes.length, 2, 'a conversão seguinte começa ao terminar a anterior');
  await soltar('descartada.jpg');
  await clicar(botao('Limpar a lista'));
  await act(async () => conversoes[1].resolve(Response.json({ convertido: false, motivo: 'sem perfil' })));
  assert.equal(conversoes.length, 2, 'limpar a lista cancela as conversões que ainda estavam na fila');
  assert.equal(document.querySelectorAll('.cor-item').length, 0);
  await soltar('nova.jpg');
  assert.equal(conversoes.length, 3, 'a fila aceita um lote novo depois de limpar');
  await act(async () => conversoes[2].resolve(Response.json({ convertido: false })));
  await act(async () => root.unmount());
}

async function conferirCamera() {
  global.fetch = async url => {
    if (url === '/api/ponto/funcionarios?todos=1') return Response.json([{ id: 1, nome: 'Pessoa', ativo: 1 }]);
    if (url === '/api/ponto/reconhecimento') return Response.json({ modelosNoDisco: false });
    throw new Error('Requisição inesperada: ' + url);
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
  const permissao = adiada();
  Object.defineProperty(global, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => permissao.promise } } });
  const root = await montar(elemento(Funcionarios));
  try {
    await clicar(botao('Tirar foto'));
    await clicar(botao('Cancelar'));
    let encerramentos = 0;
    await act(async () => permissao.resolve({ getTracks: () => [{ stop: () => encerramentos++ }] }));
    assert.equal(encerramentos, 1, 'câmera autorizada após fechar o modal é desligada imediatamente');
    assert.equal(document.querySelector('video'), null);

    Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
    await clicar(botao('Tirar foto'));
    assert.match(document.body.textContent, /não oferece acesso à câmera/,
      'navegador sem câmera mostra erro sem desmontar a tela');
    await clicar(botao('Cancelar'));
  } finally {
    await act(async () => root.unmount());
    if (originalNavigator) Object.defineProperty(global, 'navigator', originalNavigator);
    else delete global.navigator;
  }
}

async function conferirMoldes() {
  const aberturas = [];
  global.fetch = async url => {
    if (url === '/api/moldes') return Response.json([
      { id: 1, nome: 'Molde A', tamanhos: [], totalPecas: 0, pecasPorUnidade: 0 },
      { id: 2, nome: 'Molde B', tamanhos: [], totalPecas: 0, pecasPorUnidade: 0 },
    ]);
    if (/^\/api\/moldes\/\d+$/.test(url)) {
      const resposta = adiada(); aberturas.push(resposta); return resposta.promise;
    }
    throw new Error('Requisição inesperada: ' + url);
  };
  const root = await montar(elemento(ProvedorDeDialogo, null, elemento(Moldes)));
  const encaixar = indice => [...document.querySelectorAll('.molde-linha')][indice]
    .querySelector('button');
  await clicar(encaixar(0));
  await clicar(encaixar(1));
  const molde = (id, nome) => Response.json({ id, nome, pecas: [], artes: [] });
  await act(async () => aberturas[1].resolve(molde(2, 'Molde B')));
  await act(async () => aberturas[0].resolve(molde(1, 'Molde A')));
  assert.match(document.querySelector('.modal-topo').textContent, /Molde B/,
    'resposta de molde anterior não substitui o último escolhido');
  await act(async () => root.unmount());

  const novoRoot = await montar(elemento(ProvedorDeDialogo, null, elemento(Moldes)));
  await clicar(encaixar(0));
  await clicar([...document.querySelectorAll('button')].find(x => x.textContent.includes('Adicionar molde')));
  await act(async () => aberturas[2].resolve(molde(1, 'Molde A')));
  assert.ok(document.querySelector('.modal-passo'), 'adicionar um molde cancela abertura pendente da estante');
  await act(async () => novoRoot.unmount());
}

async function main() {
  await conferirConsultas();
  await conferirDialogos();
  await conferirProjetos();
  await conferirFilaDeCor();
  await conferirCamera();
  await conferirMoldes();
  assert.equal(duracao(3599), '1 h');
  assert.equal(duracao(7199), '2 h');
  assert.equal(duracao(3690), '1 h 2 min');
  assert.equal(duracao(30), 'menos de 1 min');
  assert.equal(duracao(0), '—');
  dom.window.close();
  console.log('Revisão frontend: recargas, eventos, filtros, diálogos, projetos, moldes, fila de cor, câmera e duração passaram.');
}
main().catch(erro => { console.error(erro); process.exitCode = 1; dom.window.close(); });
