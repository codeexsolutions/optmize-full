const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');

const raiz = path.resolve(__dirname, '..');
const compilado = buildSync({
  stdin: {
    contents: `export { ProvedorDeDialogo, useDialogo } from './src/casca/Dialogo';
      export { Projetos } from './src/telas/Projetos';
      export { Moldes } from './src/telas/Moldes';
      export { MemoryRouter } from 'react-router-dom';`,
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
const { ProvedorDeDialogo, useDialogo, Projetos, Moldes, MemoryRouter } = mod.exports;
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
  // O servidor sempre manda a `estrutura` (ver `estruturaDoProjeto` em
  // servidor/projetos-api.js) desde que os Projetos se refizeram na Galeria.
  const projeto = (id, nome) => Response.json({ id, nome, pecas: [], estrutura: { subprojetos: [] }, cliente: { id: 1, nome: 'Cliente' } });
  await act(async () => aberturas[1].resolve(projeto(2, 'Projeto B')));
  await act(async () => aberturas[0].resolve(projeto(1, 'Projeto A')));
  // O nome é um texto que vira campo ao clicar (`TextoEditavel`).
  assert.equal(document.querySelector('button[title="Clique para renomear"]').textContent, 'Projeto B',
    'o último projeto escolhido prevalece mesmo com respostas fora de ordem');
  await clicar(botao('Projeto A'));
  await clicar(botao('Projeto B'));
  await act(async () => aberturas[3].resolve(projeto(2, 'Projeto B')));
  await act(async () => aberturas[2].reject(new Error('falha obsoleta')));
  assert.doesNotMatch(document.body.textContent, /falha obsoleta/);
  await act(async () => root.unmount());
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
  const root = await montar(elemento(MemoryRouter, null, elemento(ProvedorDeDialogo, null, elemento(Moldes))));
  const encaixar = indice => [...document.querySelectorAll('[data-molde]')][indice]
    .querySelector('button');
  await clicar(encaixar(0));
  await clicar(encaixar(1));
  const molde = (id, nome) => Response.json({ id, nome, pecas: [], artes: [] });
  await act(async () => aberturas[1].resolve(molde(2, 'Molde B')));
  await act(async () => aberturas[0].resolve(molde(1, 'Molde A')));
  assert.match(document.querySelector('.modal-topo').textContent, /Molde B/,
    'resposta de molde anterior não substitui o último escolhido');
  await act(async () => root.unmount());

  const novoRoot = await montar(elemento(MemoryRouter, null, elemento(ProvedorDeDialogo, null, elemento(Moldes))));
  await clicar(encaixar(0));
  await clicar([...document.querySelectorAll('button')].find(x => x.textContent.includes('Adicionar molde')));
  await act(async () => aberturas[2].resolve(molde(1, 'Molde A')));
  assert.ok(document.querySelector('.modal-passo'), 'adicionar um molde cancela abertura pendente da estante');
  await act(async () => novoRoot.unmount());
}

async function main() {
  await conferirDialogos();
  await conferirProjetos();
  await conferirMoldes();
  dom.window.close();
  console.log('Revisão frontend: diálogos, projetos e moldes passaram.');
}
main().catch(erro => { console.error(erro); process.exitCode = 1; dom.window.close(); });
