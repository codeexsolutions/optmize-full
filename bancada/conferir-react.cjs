/**
 * A conferência do painel React, fora do navegador.
 *
 * Monta o `App` inteiro num jsdom -- com o router, a casca e as telas -- e
 * anda por ele como uma pessoa andaria: clica, navega, salva. E verifica o que
 * so aparece quando as pecas estao juntas: que o StrictMode nao duplica uma
 * gravacao, que sair de uma tela fecha o que estava aberto nela, e que o
 * trabalho em memoria sobrevive a troca de aba.
 *
 * ANTES ELE MONTAVA SO O `Producao`, e navegava chamando `irPara` na mao. Isso
 * deixou de ser o sistema: quem navega e o `react-router`, e as telas que ja
 * sairam do controlador sao desenhadas pela ROTA, nao por aquele componente.
 * Montar o `App` e mexer no `#` do endereco e o caminho de verdade.
 *
 * Os seletores das telas migradas sao por classe e por TEXTO, nunca por `id`:
 * uma tela React nao tem `id` nenhum, e o que uma pessoa enxerga e o rotulo do
 * botao. As duas que ainda sao imperativas (Moldes e Encaixe) continuam sendo
 * achadas por `id`, que e o que o controlador usa.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');

async function main() {
  const root = path.resolve(__dirname, '..');
  const bundle = path.join(os.tmpdir(), 'optimize-react-' + process.pid + '.cjs');
  buildSync({ entryPoints: [path.join(root, 'src/App.tsx')], bundle: true,
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
  const dom = new JSDOM('<!doctype html><div id="raiz"></div>', { url:'http://localhost/moldes', pretendToBeVisual:true });
  for(const k of ['window','document','CustomEvent','Event','EventTarget','HTMLElement','Node','getComputedStyle','MouseEvent','File','Blob','location','history','navigator']) global[k]=dom.window[k];
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
  const {App}=require(bundle);
  const app=createRoot(document.getElementById('raiz'));

  /*
   * Navega como o menu navega: mexendo no HISTORICO. O endereco nao tem mais
   * "#" (ver o cabecalho de src/App.tsx), e o `BrowserRouter` escuta o
   * `popstate` -- `pushState` sozinho nao avisa ninguem, entao o evento vai
   * junto, que e o que o clique num <a> faria por dentro.
   */
  const irPara = async pagina => {
    await act(async()=>{
      dom.window.history.pushState({}, '', '/' + pagina);
      dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
      // As telas de rota chegam por `import()` (o `lazy` de rotas.ts): sem esta
      // volta ao laco de eventos o `<Suspense>` ainda estaria na espera.
      await new Promise(r=>setTimeout(r,0));
    });
  };
  const click = async alvo=>{
    const node = typeof alvo === 'string' ? document.querySelector(alvo) : alvo;
    assert.ok(node, String(alvo));
    await act(async()=>node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  };
  /** O botao que uma pessoa acharia: pelo texto escrito nele. */
  const botao = (texto,dentro=document) =>
    [...dentro.querySelectorAll('button,label')].find(b=>b.textContent.includes(texto));

  await act(async()=>{
    app.render(React.createElement(React.StrictMode,null,React.createElement(App)));
    await new Promise(r=>setTimeout(r,0));
  });
  const error=document.querySelector('[role="alert"]'); assert.equal(error,null,error?.textContent);

  // ---------- Moldes: React, desenhada pela rota ----------
  assert.match(document.querySelector('.molde-lista').textContent,/Nenhum|nenhum/);
  await click(botao('Adicionar molde'));
  assert.ok(document.querySelector('.modal-passo'),'o passo a passo do molde abriu');
  assert.match(document.querySelector('.escolhas').textContent,/Camisa/);
  assert.equal(document.body.classList.contains('modal-aberto'),true);

  // ---------- Projetos: React, desenhada pela rota ----------
  await irPara('projetos');
  assert.equal(document.querySelector('.modal-passo'),null,'sair de Moldes fecha o modal dela');
  // O `modal-aberto` no body é o que segura a rolagem da pagina. Ficando para
  // tras, a tela seguinte simplesmente nao rolava -- ja aconteceu.
  assert.equal(document.body.classList.contains('modal-aberto'),false,
    'e devolve a rolagem da pagina');
  const estante = () => document.querySelector('.projeto-lista');
  assert.match(estante().textContent,/Cliente de teste/);

  // ---------- A caixa de dialogo React ----------
  //
  // Ela mora na CASCA, e a folha que a desenha e escopada em `:where(.producao)`.
  // Sem uma marca de escopo em volta ela sai sem estilo nenhum -- e nao e so
  // feio: sem `position: fixed` ela cai no fim da pagina, e o clique no botao
  // vai parar em outro elemento. Foi assim que "Excluir" deixou de excluir.
  await click(botao('Novo cliente'));
  const caixa = document.querySelector('.ui-dialog-backdrop:not([id])');
  assert.ok(caixa,'a caixa de dialogo React abriu');
  assert.ok(caixa.closest('.producao'),'e ela esta dentro do escopo que a desenha');
  assert.match(caixa.textContent,/Novo cliente/);
  await click(botao('Cancelar',caixa));
  await act(async()=>{ await new Promise(r=>setTimeout(r,200)); });
  assert.equal(document.querySelector('.ui-dialog-backdrop:not([id])'),null,'e fecha no Cancelar');

  await click('.projeto-pasta');
  assert.match(estante().textContent,/Uniforme/);
  await click(botao('Abrir',estante()));

  const editor = () => document.querySelector('.modal-projeto');
  assert.ok(editor(),'o editor do projeto abriu');
  const campoDoRotulo = texto =>
    [...editor().querySelectorAll('label')].find(l=>l.textContent.includes(texto)).querySelector('input,select');
  assert.equal(campoDoRotulo('Folga entre peças').value,'5');
  assert.equal(campoDoRotulo('Largura do tecido').value,'160');

  await click(botao('Salvar',editor()));
  const gravacoes=requests.filter(r=>r[0]==='/api/projetos/2' && r[1]==='PUT');
  assert.equal(gravacoes.length,1,'StrictMode não duplica a gravação');
  assert.equal(JSON.parse(gravacoes[0][2]).espaco,5,'Espaçamento salvo continua em milímetros');

  // ---------- Encaixe: o trabalho sobrevive a troca de aba ----------
  await irPara('encaixe');
  assert.equal(document.querySelector('.modal-projeto'),null,'sair de Projetos fecha o editor');
  assert.equal(document.body.classList.contains('dialog-open'),false);
  document.getElementById('encaixe-largura').value='179';

  // ---------- Cor: React, dentro do editor de producao ----------
  await irPara('cor');
  const cor = () => document.querySelector('.page:not([data-page])');
  const listaDeCor = () => cor().querySelector('.cor-lista');
  const png = new dom.window.File([Buffer.from('89504e470d0a1a0a','hex')],'arte.png',{type:'image/png'});
  await act(async()=>{
    const drop=new dom.window.Event('drop',{bubbles:true,cancelable:true});
    Object.defineProperty(drop,'dataTransfer',{value:{files:[png]}});
    cor().querySelector('.vetor-solta').dispatchEvent(drop);
    await new Promise(r=>setTimeout(r,10));
  });
  assert.equal(cor().hidden,false,'a tela de Cor aparece quando e a vez dela');
  assert.match(listaDeCor().textContent,/arte.png/);
  assert.match(listaDeCor().textContent,/já estava certa/);

  await irPara('impressoras');
  assert.equal(document.querySelector('.producao').hidden,true);
  await irPara('encaixe');
  assert.equal(document.getElementById('encaixe-largura').value,'179',
    'o ajuste do Encaixe sobrevive a ida e volta');
  // A Cor esconde-se sozinha pelo `hidden`, e nao pela classe `active` que o
  // controlador liga nas outras: se alguem devolver o `data-page` a ela, o
  // controlador volta a mexer na classe e o proximo render desfaz.
  assert.equal(cor().hidden,true,'a tela de Cor some quando nao e a vez dela');
  assert.match(listaDeCor().textContent,/arte.png/,'e a lista sobrevive escondida');
  await irPara('cor');
  assert.match(listaDeCor().textContent,/arte.png/);
  await click(botao('Limpar a lista',cor()));
  assert.equal(listaDeCor(),null,'lista vazia nao desenha o painel');

  await act(async()=>app.unmount());
  assert.equal(dom.window.uiConfirm,undefined);
  assert.equal(dom.window.carregarProjetos,undefined);
  fs.unlinkSync(bundle); dom.window.close();
  console.log('React: rotas, StrictMode, modais, moldes, clientes, editor de projeto, Cor e preservação de ajustes passaram.');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
