/**
 * A conferência do painel React, fora do navegador.
 *
 * Monta o `App` inteiro num jsdom -- com o router, a casca e as telas -- e
 * anda por ele como uma pessoa andaria: clica, navega, salva. E verifica o que
 * so aparece quando as pecas estao juntas: que o StrictMode nao duplica uma
 * gravacao, que sair de uma tela fecha o que estava aberto nela, e que o
 * editor de producao so fica na pagina enquanto ha o que guardar nele.
 *
 * ANTES ELE MONTAVA SO O `Producao`, e navegava chamando `irPara` na mao. Isso
 * deixou de ser o sistema: quem navega e o `react-router`, e as telas que ja
 * sairam do controlador sao desenhadas pela ROTA, nao por aquele componente.
 * Montar o `App` e mexer no `#` do endereco e o caminho de verdade.
 *
 * Os seletores das telas migradas sao por classe e por TEXTO, nunca por `id`:
 * uma tela React nao tem `id` nenhum, e o que uma pessoa enxerga e o rotulo do
 * botao. A que ainda e imperativa (o Encaixe) continua sendo achada por `id`,
 * que e o que o controlador usa.
 *
 * UMA ARMADILHA, para quem acrescentar conferencia: a AUSENCIA de um elemento
 * se afirma com `assert.ok(!elemento, ...)`, e nao com
 * `assert.equal(elemento, null, ...)`. Ao falhar, o Node monta o diff do
 * `assert.equal` mesmo com mensagem, e com um no do DOM do React como `actual`
 * esse diff nao termina: a bancada trava em vez de acusar.
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
    external: ['react','react-dom'],
    // Os mesmos `define` do vite.config.mts. `__VERSAO__` vira texto fixo na
    // compilacao de verdade; aqui, sem ele, a barra e a porta quebram com
    // "__VERSAO__ is not defined" -- e o erro seria do banco de prova, nao do
    // programa.
    define: {
      'import.meta.env.BASE_URL': '"/"',
      __VERSAO__: JSON.stringify(require(path.join(root, 'package.json')).version),
    },
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
  /*
   * O PROJETO ABERTO, no formato que a API devolve (ver `Projeto`, em
   * api/projetos.ts). Desde a Galeria nova ele SEMPRE traz a `estrutura` —
   * subprojeto, categoria, peça e a arte de cada uma (ver `estruturaDoProjeto`,
   * em servidor/projetos-api.js) —, e é por ela que o editor se desenha. As
   * `pecas` são as linhas do banco: uma por peça com arte, já multiplicada
   * (M × 2, uma por item). A miniatura vai pronta, como o servidor a guarda:
   * sem ela o editor iria buscar a arte no disco para fazê-la, e aqui não há.
   */
  const miniatura='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4n8bwHwAGMgJlMwnCZQAAAABJRU5ErkJggg==';
  const projeto={
    id:2,nome:'Uniforme',observacoes:null,largura_tecido:160,espaco:5,comprimento_bancada:null,giro:'180',
    cliente:{id:1,nome:'Cliente de teste'},
    pecas:[{id:7,nome:'Frente M',arquivo:'frente.png',url:'/uploads/projetos/frente.png',miniatura,largura:30,altura:40,quantidade:2}],
    estrutura:{subprojetos:[{id:'sp-1',nome:'Camisa',categorias:[{id:'ct-1',rotulo:'M',quantidade:2,
      pecas:[{id:'pc-1',nome:'Frente',porItem:1,cor:0,arte:{arquivo:'frente.png',nome:'frente.png',miniatura,largura:30,altura:40}}]}]}]},
  };
  global.fetch=async (url,options={}) => {
    requests.push([String(url),options.method || 'GET',options.body]);
    /*
     * A CONTA. Desde 2026-09-21 a casca so desenha o programa depois de saber
     * quem esta usando (ver o portao em casca/Casca.tsx); sem esta resposta a
     * bancada inteira cairia na tela de entrar, e toda conferencia abaixo
     * procuraria telas que nao foram desenhadas.
     */
    if(String(url)==='/api/sessao/eu') return Response.json({
      entrou:true, perfil:{nome:'Bancada de Teste',empresa:'CodeEx',papel:'dono',telas:null},
    });
    if(String(url)==='/api/moldes') return Response.json([]);
    if(String(url)==='/api/projetos/clientes') return Response.json([{id:1,nome:'Cliente de teste',observacoes:null,projetos:1}]);
    if(String(url)==='/api/projetos/clientes/1/projetos') return Response.json({cliente:{id:1,nome:'Cliente de teste'},projetos:[{id:2,nome:'Uniforme',observacoes:null,largura_tecido:160,pecas:1,pecasPorUnidade:2,capa:miniatura}]});
    if(String(url)==='/api/projetos/2') return Response.json(projeto);
    // O editor grava sozinho, pela estrutura (ver `gravarEstrutura`, em api/projetos.ts).
    if(String(url)==='/api/projetos/2/estrutura') return Response.json({ok:true,pecas:1});
    // A lateral da Galeria mostra quanto há guardado (ver `useResumoDaGaleria`).
    if(String(url)==='/api/galeria/resumo') return Response.json({arquivos:0,bytes:0,pastas:0,clientes:1,projetos:1,recentes:[],disco:null});
    if(String(url)==='/api/extrator/estado') return Response.json({
      rede:'mobilesam', pronta:false, motivo:'A rede do Extrator não está instalada (bancada).', aceitaCaixa:true, ampliar:null,
    });
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
  const error=document.querySelector('[role="alert"]'); assert.ok(!error,error?.textContent);

  // ---------- Moldes: React, desenhada pela rota ----------
  /*
   * Sem molde guardado, a estante não desenha `.molde-lista` nenhuma: ela
   * mostra o passo a passo de como um molde chega aqui (ver `Vazia`, em
   * `telas/Moldes.tsx`). O que se confere é que a tela DIZ que está vazia —
   * que era o ponto desta linha desde sempre.
   */
  assert.match(document.body.textContent,/estante está vazia/i);
  assert.equal(document.querySelectorAll('.molde-linha').length,0,'nenhum molde na estante');
  await click(botao('Adicionar molde'));
  assert.ok(document.querySelector('.modal-passo'),'o passo a passo do molde abriu');
  assert.match(document.querySelector('.escolhas').textContent,/Camisa/);
  assert.equal(document.body.classList.contains('modal-aberto'),true);

  // ---------- Projetos: React, desenhada pela rota ----------
  await irPara('projetos');
  assert.ok(!document.querySelector('.modal-passo'),'sair de Moldes fecha o modal dela');
  // O `modal-aberto` no body é o que segura a rolagem da pagina. Ficando para
  // tras, a tela seguinte simplesmente nao rolava -- ja aconteceu.
  assert.equal(document.body.classList.contains('modal-aberto'),false,
    'e devolve a rolagem da pagina');
  // A tela de Projetos ganhou o desenho do painel web: a arvore de clientes
  // fica numa <aside>, e o projeto aberto ocupa a area principal.
  const arvore = () => [...document.querySelectorAll('aside')].find(a=>/CLIENTES|Clientes/.test(a.textContent));
  // A arvore chega depois do pedido ao servidor: sem esta volta ao laco, ela
  // ainda estaria em "Carregando...".
  await act(async()=>{ await new Promise(r=>setTimeout(r,30)); });
  assert.ok(arvore(),'a arvore de clientes apareceu');
  assert.match(arvore().textContent,/Cliente de teste/);

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
  assert.ok(!document.querySelector('.ui-dialog-backdrop:not([id])'),'e fecha no Cancelar');

  // Clicar no cliente abre a pasta dele na arvore; o projeto aparece dentro.
  await click(botao('Cliente de teste',arvore()));
  await act(async()=>{ await new Promise(r=>setTimeout(r,50)); });
  assert.match(arvore().textContent,/Uniforme/);
  await click(botao('Uniforme',arvore()));
  await act(async()=>{ await new Promise(r=>setTimeout(r,50)); });

  // O editor é a área principal, e não mais um modal por cima da lista. Quem o
  // acha é a barra do alto — a seta de voltar, o cliente e o nome do projeto —,
  // que só existe com o projeto aberto: o nome é um texto que vira campo ao
  // clicar (`TextoEditavel`), e o `input` dele só aparece enquanto alguém o
  // edita, então procurar por ele daria "fechado" com o editor aberto. E o
  // editor é a seção que tem essa barra — procurar por `main section` acharia a
  // bancada do Encaixe, que fica montada escondida.
  const barra = () => document.querySelector('button[title="Voltar para os projetos do cliente"]')?.parentElement ?? null;
  const editor = () => barra()?.closest('section') ?? null;
  // Não há `<label>` no editor: o campo se acha pelo `aria-label`, que é o
  // rótulo que a pessoa lê.
  const campo = rotulo => editor().querySelector(`input[aria-label="${rotulo}"]`);
  assert.ok(editor(),'o editor do projeto abriu');
  assert.equal(barra().querySelector('button[title="Clique para renomear"]').textContent,'Uniforme',
    'com o nome do projeto no topo');
  // O que o servidor guardou aparece desenhado — o lugar do que era o campo da
  // largura do tecido: a categoria com a quantidade pedida, e a peça com a arte.
  assert.equal(campo('Quantidade da categoria M').value,'2',
    'a categoria do projeto aparece, com a quantidade guardada');
  assert.ok(editor().querySelector('img[alt="frente.png"]'),'e a peça dela, com a arte');
  // Os ajustes do Encaixe saíram da tela: quem decide tecido, bancada, giro e
  // folga é o confere do Optmizar. A folga foi a primeira a sair, e as outras
  // acompanharam quando o editor virou o da Galeria.
  const oQueOEditorDiz = [editor().textContent,
    ...[...editor().querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label'))].join('\n');
  assert.doesNotMatch(oQueOEditorDiz,
    /Ajustes do encaixe|Largura do tecido|Comprimento da bancada|Giro das peças|Folga entre peças/i,
    'os ajustes do Encaixe não são mais perguntados aqui');

  /*
   * Não há mais "Salvar": o editor grava sozinho, meio segundo depois da última
   * mudança (ver `gravar`, em galeria/EditorDoProjeto.tsx). Então a conferência
   * muda uma coisa — mais uma unidade na categoria M — e espera a gravação.
   * Uma mudança, UMA gravação: o StrictMode roda os efeitos duas vezes, e uma
   * gravação agendada por efeito sairia em dobro.
   *
   * A espera é em DOIS `act`, e não num só de 1,4 s: é na saída de cada `act`
   * que o React desenha o que a gravação acabou de mudar, e uma gravação que
   * agendasse outra (o laço que o `ref` do `aoMudarOProjeto` evita, no editor)
   * só agendaria a segunda depois disso.
   *
   * Conta-se a partir do clique. Ao montar o editor o próprio StrictMode já
   * deixa uma gravação agendada, sem mudança nenhuma (o efeito roda duas vezes,
   * e a guarda `primeiraVez` só segura a primeira); a mudança que vem logo em
   * seguida a desfaz.
   */
  const antes = requests.length;
  const maisUma = campo('Quantidade da categoria M').parentElement.querySelector('button[aria-label="Aumentar"]');
  assert.ok(maisUma,'a categoria M tem o botão de mais uma unidade');
  await click(maisUma);
  await act(async()=>{ await new Promise(r=>setTimeout(r,700)); });
  await act(async()=>{ await new Promise(r=>setTimeout(r,700)); });
  const gravacoes = () => requests.slice(antes)
    .filter(r=>r[0]==='/api/projetos/2/estrutura' && r[1]==='PUT');
  assert.equal(gravacoes().length,1,'StrictMode não duplica a gravação');
  const corpo = JSON.parse(gravacoes()[0][2]);
  assert.equal(corpo.nome,'Uniforme','a gravação leva o nome do projeto');
  // A estrutura vai inteira — a arte da peça com ela —, e só a categoria M mudou.
  const esperada = structuredClone(projeto.estrutura);
  esperada.subprojetos[0].categorias[0].quantidade = 3;
  assert.deepEqual(corpo.estrutura,esperada,
    'e a estrutura inteira, mudando só o que mudou: a categoria M passou de 2 para 3');
  /*
   * Os ajustes do Encaixe saíram da TELA e da GRAVAÇÃO, mas não do BANCO: o
   * projeto guarda a folga de 5 mm (`espaco`) que alguém escolheu, e a gravação
   * da estrutura leva só o nome e a estrutura — o servidor deixa o resto como
   * estava (ver `PUT /:id/estrutura`, em servidor/projetos-api.js). Esta linha
   * é a trava disso: se o editor voltasse a mandar o espaçamento (ou gravasse o
   * projeto inteiro sem ele), a primeira gravação de um projeto antigo
   * perderia um valor que ninguém mandou apagar.
   */
  for (const ajuste of ['espaco','larguraTecido','comprimentoBancada','giro']) {
    assert.equal(ajuste in corpo,false,
      `a gravação do editor não leva o ajuste "${ajuste}": o espaçamento guardado (5 mm) e os outros ficam como estão`);
  }

  // ---------- Encaixe: o editor de produção nasce quando precisa ----------
  await irPara('encaixe');
  assert.ok(!editor(),'sair de Projetos larga o editor');
  // O editor grava ao sair só o que ficou pendente; com tudo gravado, não há o
  // que gravar outra vez.
  assert.equal(gravacoes().length,1,'e sair com tudo gravado não grava de novo');
  assert.equal(document.body.classList.contains('dialog-open'),false);
  document.getElementById('encaixe-largura').value='179';

  /*
   * O editor de produção já ficou montado, escondido, em toda tela do programa,
   * e esta conferência guardava isso: o ajuste do Encaixe sobrevivendo à ida a
   * outra tela (a tela de Cor, que também morava nele, saiu do programa em
   * 2026-09-21). Desde 2026-09-24 ele só fica quando há trabalho guardado —
   * peça na lista ou risco pronto — e, sem trabalho, sai da página inteira,
   * levando o que se digitou nos campos: é a troca aceita (ver `Producao.tsx`).
   *
   * Aqui não há trabalho: o jsdom não decodifica arte nenhuma para pôr peça na
   * lista. Então vale o que o editor promete sem ele — sai da página junto com
   * o Encaixe e volta, novo, quando o Encaixe abre de novo. O outro lado (com
   * peça na lista ele fica escondido, e o ajuste sobrevive) não é conferido
   * aqui.
   */
  await irPara('impressoras');
  assert.ok(!document.getElementById('encaixe-largura'),
    'sem trabalho guardado, o editor de produção sai da página junto com o Encaixe');
  await irPara('encaixe');
  assert.ok(document.getElementById('encaixe-largura'),'e volta quando o Encaixe abre de novo');
  assert.notEqual(document.getElementById('encaixe-largura').value,'179',
    'sem peça na lista o ajuste digitado não volta: o editor nasce limpo');

  // ---------- O que saiu do menu ----------
  // Desde 2026-09-21 o menu do dia a dia mostra so onde se trabalha: saiu o
  // grupo Relatorios inteiro, mais Macros e WhatsApp (ver `foraDoMenu`, em
  // rotas.ts). As telas continuam de pe — o que sai e a linha do menu, e e
  // exatamente essa diferenca que as duas asercoes abaixo guardam.
  // `reposicao` deixou a lista: desde 2026-09-29 o nome é da tela que guarda
  // cada encaixe exportado para refazer peças, e ela ESTÁ no menu. A que saiu,
  // o relatório de quanto foi refeito, é a de antes, que agora se chama
  // `retrabalho` (ver rotas.ts).
  for (const nome of ['macros','whatsapp','historico','ponto','funcionarios','retrabalho']) {
    assert.ok(!document.querySelector(`a[href="/${nome}"]`),
      `a ${nome} saiu do menu`);
  }
  assert.ok(document.querySelector('a[href="/encaixe"]'),
    'o menu nao ficou vazio: o Encaixe continua la');

  // ---------- O Extrator: no menu, e abre esperando a foto ----------
  assert.ok(document.querySelector('a[href="/extrator"]'), 'o Extrator está no menu');
  await irPara('extrator');
  await act(async()=>{ await new Promise(r=>setTimeout(r,0)); });
  assert.match(document.body.textContent,/Arraste a foto para cá/,'o Extrator abre esperando a foto');
  assert.match(document.body.textContent,/não está instalada \(bancada\)/,'o Extrator diz que a rede falta');

  // A Macros segue trancada por cima disso: fora do menu E com o endereco
  // abrindo o aviso, em vez das macros (ver `trancada`, em rotas.ts).
  await irPara('macros');
  assert.match(document.body.textContent,/Esta tela está trancada/,
    'o endereco da Macros abre o aviso, e nao as macros');
  // Uma das que saiu sem tranca: o endereco tem de abrir a tela inteira, e nao
  // cair na inicial. Sumir do menu nao pode virar sumir do programa.
  await irPara('historico');
  assert.equal(dom.window.location.pathname,'/historico',
    'o endereco de uma tela fora do menu continua abrindo ela');
  await irPara('cor');
  assert.equal(dom.window.location.pathname,'/moldes',
    'endereco de tela que saiu cai na tela inicial');

  await act(async()=>app.unmount());
  assert.equal(dom.window.uiConfirm,undefined);
  assert.equal(dom.window.carregarProjetos,undefined);
  fs.unlinkSync(bundle); dom.window.close();
  console.log('React: rotas, StrictMode, modais, moldes, clientes, editor de projeto, preservação de ajustes e a Macros trancada passaram.');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
