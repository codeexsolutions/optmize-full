const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');

async function main() {
  const root = path.resolve(__dirname, '..');
  const bundle = path.join(os.tmpdir(), 'optimize-react-' + process.pid + '.cjs');
  buildSync({ entryPoints: [path.join(root, 'src/producao/Producao.tsx')], bundle: true,
    outfile: bundle, platform: 'node', format: 'cjs', loader: { '.css': 'empty' },
    external: ['react','react-dom'], define: { 'import.meta.env.BASE_URL': '"/"' },
    // O esbuild cru nao procura `.mjs` sozinho; o Vite procura. O `encaixeRede`
    // e `.mjs` para o servidor conseguir `require()` nele, entao a extensao
    // entra na lista a mao -- senao `./encaixeRede` nao resolve aqui.
    resolveExtensions: ['.mjs', '.js', '.ts', '.tsx', '.jsx', '.json'],
    logLevel: 'silent' });
  // O bundle temporário encontra os mesmos pacotes React da aplicação.
  const Module = require('node:module');
  process.env.NODE_PATH = path.join(root,'node_modules'); Module._initPaths();
  const dom = new JSDOM('<!doctype html><div id="raiz"></div>', { url:'http://localhost/app/', pretendToBeVisual:true });
  for(const k of ['window','document','CustomEvent','Event','EventTarget','HTMLElement','Node','getComputedStyle']) global[k]=dom.window[k];
  global.CSS = { escape: s=>s.replace(/[^\w-]/g,'\\$&') };
  global.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
  global.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
  global.IS_REACT_ACT_ENVIRONMENT=true;
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  const requests=[];
  global.fetch=async (url,options={}) => {
    requests.push([String(url),options.method || 'GET',options.body]);
    if(String(url)==='/api/moldes') return Response.json([]);
    if(String(url)==='/api/projetos/clientes') return Response.json([{id:1,nome:'Cliente de teste',projetos:1}]);
    if(String(url)==='/api/projetos/clientes/1/projetos') return Response.json({cliente:{id:1,nome:'Cliente de teste'},projetos:[{id:2,nome:'Uniforme',pecas:1,pecasPorUnidade:2}]});
    if(String(url)==='/api/projetos/2') return Response.json({id:2,nome:'Uniforme',cliente:{id:1,nome:'Cliente de teste'},pecas:[],espaco:5,largura_tecido:160,giro:'180'});
    throw new Error('Requisição inesperada: '+url);
  };
  const React=require('react'); const {act}=React; const {createRoot}=require('react-dom/client');
  const {Producao}=require(bundle);
  const app=createRoot(document.getElementById('raiz'));
  let pagina='moldes';
  const irPara = p=>{pagina=p;render();};
  const render=()=>app.render(React.createElement(React.StrictMode,null,React.createElement(Producao,{pagina,irPara})));
  const click = async selector=>{
    const node=document.querySelector(selector); assert.ok(node,selector);
    await act(async()=>node.click());
  };
  await act(async()=>{render();});
  const error=document.querySelector('[role="alert"]'); assert.equal(error,null,error?.textContent);
  assert.match(document.getElementById('moldes-body').textContent,/Nenhum|nenhum/);
  await click('#btn-molde-novo');
  assert.equal(document.getElementById('molde-modal').classList.contains('hidden'),false);
  await act(async()=>irPara('projetos'));
  assert.equal(document.getElementById('molde-modal').classList.contains('hidden'),true);
  assert.match(document.getElementById('projetos-lista').textContent,/Cliente de teste/);
  await click('[data-cliente="1"]');
  assert.match(document.getElementById('projetos-lista').textContent,/Uniforme/);
  await click('[data-projeto-abrir="2"]');
  assert.equal(document.getElementById('projeto-espaco').value,'5');
  assert.equal(document.getElementById('projeto-editor').classList.contains('hidden'),false);
  await click('#btn-projeto-salvar');
  const gravacoes=requests.filter(r=>r[0]==='/api/projetos/2' && r[1]==='PUT');
  assert.equal(gravacoes.length,1,'StrictMode não duplica a gravação');
  assert.equal(JSON.parse(gravacoes[0][2]).espaco,5,'Espaçamento salvo continua em milímetros');
  await act(async()=>irPara('encaixe'));
  assert.equal(document.getElementById('projeto-editor').classList.contains('hidden'),true);
  document.getElementById('encaixe-largura').value='179';
  // A tela de Cor virou React: nao tem mais `id` nenhum, entao os seletores sao
  // por classe, e o botao de limpar e achado pelo texto. E o que uma pessoa
  // enxerga, e nao um gancho que so existe para o teste.
  await act(async()=>irPara('cor'));
  const cor = () => document.querySelector('.page:not([data-page])');
  const listaDeCor = () => cor().querySelector('.cor-lista');
  const png = new File([Buffer.from('89504e470d0a1a0a','hex')],'arte.png',{type:'image/png'});
  await act(async()=>{
    const drop=new dom.window.Event('drop',{bubbles:true,cancelable:true});
    Object.defineProperty(drop,'dataTransfer',{value:{files:[png]}});
    cor().querySelector('.vetor-solta').dispatchEvent(drop);
    await new Promise(r=>setTimeout(r,10));
  });
  assert.equal(cor().hidden,false,'a tela de Cor aparece quando e a vez dela');
  assert.match(listaDeCor().textContent,/arte.png/);
  assert.match(listaDeCor().textContent,/já estava certa/);
  await act(async()=>irPara('impressoras'));
  assert.equal(document.querySelector('.producao').hidden,true);
  await act(async()=>irPara('encaixe'));
  assert.equal(document.getElementById('encaixe-largura').value,'179');
  // A Cor esconde-se sozinha pelo `hidden`, e nao pela classe `active` que o
  // controlador liga nas outras: se alguem devolver o `data-page` a ela, o
  // controlador volta a mexer na classe e o proximo render desfaz.
  assert.equal(cor().hidden,true,'a tela de Cor some quando nao e a vez dela');
  assert.match(listaDeCor().textContent,/arte.png/,'e a lista sobrevive escondida');
  await act(async()=>irPara('cor'));
  assert.match(listaDeCor().textContent,/arte.png/);
  const limpar=[...cor().querySelectorAll('button')].find(b=>/Limpar a lista/.test(b.textContent));
  await act(async()=>{limpar.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
  assert.equal(listaDeCor(),null,'lista vazia nao desenha o painel');
  await act(async()=>app.unmount());
  assert.equal(window.uiConfirm,undefined);
  assert.equal(window.carregarProjetos,undefined);
  fs.unlinkSync(bundle); dom.window.close();
  console.log('React: montagem em StrictMode, navegação, modais, clientes, editor de projeto, Cor e preservação de ajustes passaram.');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
