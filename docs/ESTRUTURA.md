# Estrutura do Optimize

> Para "onde eu mexo para mudar X?", veja **[MAPA.md](MAPA.md)** — a visão de
> cima, as camadas e as armadilhas já pagas.

O sistema fica dividido em código do servidor, painel web e arquivos gerados em execução.

**Um repositório só, e duas pastas que dizem de que lado cada coisa está:**
`servidor/` roda no Node, `src/` roda no navegador. Os dois sobem juntos — o
Express serve o painel que o Vite compila — e vão juntos para o mesmo
instalador.

## Código do servidor — `servidor/`

- `servidor/server.js`: inicialização do Express, arquivos estáticos e rotas da API.
- `servidor/caminhos.js`: decide onde ficam o `dados.db` e a pasta `uploads/`. Rodando pelo código, na pasta do projeto; no programa instalado, na pasta de dados do usuário. Exporta também `PASTA_DO_APP`, a pasta de cima — é por ela que o servidor acha `dist/`, `estatico/` e `corel/` sem saber se está rodando do repositório ou do programa instalado.
- `servidor/db.js`: banco dos moldes e da memória do encaixe.
- `servidor/moldes-api.js`: operações da área de moldes.
- `servidor/uploads-arquivos.js`: o que moldes e projetos têm em comum ao guardar imagem em disco.
- `servidor/projetos-api.js`: projetos de cliente — a pasta, o projeto e as peças já prontas.
- `servidor/encaixe-memoria.js` e `servidor/encaixe-pdf.js`: cálculo, memória e documento do encaixe.
- `servidor/impressoras-api.js`: monta a central das impressoras em `/api/impressoras` e levanta os leitores das máquinas.

**O servidor importa um arquivo do front, e só um:**
`src/motores/encaixeRede.mjs`, o vocabulário da rede que pontua as receitas de
encaixe. O navegador o usa para escolher, o servidor para aprender, e duas
cópias dele já divergiram em silêncio uma vez. Por causa dele o
`empacotar/preparar.js` leva `src/motores/` para dentro da cópia do
instalador, e o `empacotar/compilar.js` a apaga depois de embuti-la no
bytecode.

## A central das impressoras

`servidor/impressoras/` acompanha o que já saiu das máquinas: acha as impressoras na
rede, lê o histórico de cada uma e guarda no mesmo `dados.db`. Foi **portada**
de um sistema que já rodava na produção, e por isso é a única parte do projeto
com nomes em inglês por dentro (`machineId`, `printLength`): portar é
acrescentar o que falta, não reescrever o que funciona.

- `servidor/impressoras/config.js`: de onde saem as máquinas. **De lugar nenhum escrito
  à mão** — só da varredura da rede.
- `servidor/impressoras/services/discovery.js`: a varredura. Procura quem responde em
  SMB, resolve o nome do computador e reconhece o tipo da impressora pelo que
  ela deixa no compartilhamento.
- `servidor/impressoras/sources/`: os três leitores de histórico — `csvHistory`,
  `xmlHistory` e `atBinary`. Um por formato de arquivo de impressora.
- `servidor/impressoras/services/sync.js`: a importação da subida, que enche o banco.
- `servidor/impressoras/services/realtime.js`, `liveLog.js`, `printer2Live.js`: os
  leitores ao vivo. São os únicos que conversam com as máquinas depois da
  subida.
- `servidor/impressoras/services/printer2Cancel.js`: descobre cancelamento nas máquinas
  CSV, cujo software não registra cancelamento em lugar nenhum.
- `servidor/impressoras/db/`: as tabelas `imp_*` do `dados.db`.
- `servidor/impressoras/routes/`: as rotas de máquinas, pedidos e WhatsApp — e as de
  Ordem de Serviço, que continuam de pé sem tela que as chame (ver MAPA.md).
- `servidor/impressoras/services/matching.js`: lê "CLIENTE - TECIDO" do nome do arquivo.
  É o que sustenta o aviso de "já rodado antes" ao lançar um pedido.
- `servidor/impressoras/services/qrcode.js`: o QR da folha de produção, desenhado em SVG
  no próprio servidor — sem serviço de fora e sem imagem carregada da internet.
- `servidor/impressoras/whatsapp/`: o bot de avisos. `navegador.js` decide qual Chrome
  usar — ver abaixo.

**As tabelas levam prefixo `imp_`.** `machines`, `records` e `pedidos` são
nomes genéricos demais para um banco que também guarda moldes e projetos, e um
`CREATE TABLE IF NOT EXISTS` sobre um nome que já existe não cria nada e não
reclama: o código passa a ler a tabela errada, calado. É a mesma armadilha que
já custou caro aqui uma vez.

**O bot não embute Chrome.** O sistema de origem levava o Chrome do Puppeteer
no instalador: 409 MB, mais do que o resto do programa inteiro. Aqui
`servidor/impressoras/whatsapp/navegador.js` procura, nesta ordem, a variável
`OPTIMIZE_CHROME`, o Chrome do Puppeteer (que existe na máquina de quem
desenvolve), o Google Chrome instalado e o Microsoft Edge — que vem com o
Windows. Não achando nenhum, a tela diz o que instalar, em vez de estourar um
erro do Puppeteer que não significa nada para quem está olhando.

## Painel web

É um só, servido na raiz: o `dist/`, que o Vite compila de `src/`. (Houve uma
pasta `public/`, com a tela antiga em `<script>` soltos; ela foi apagada, e
`/app` — o endereço do painel durante a migração — responde hoje com um
redirecionamento que carrega o `#` adiante.)

- `src/main.tsx`: a montagem do React e o CSS.
- `src/App.tsx`: as rotas. A tabela de telas vira `react-router` aqui, em
  `BrowserRouter`: o endereço é `/moldes`, sem "#". Quem sustenta isso do outro
  lado é a **rota-curinga** do `servidor/server.js`, que devolve o `index.html`
  para todo endereço que não seja `/api`, `/uploads` ou arquivo existente —
  sem ela, abrir `/encaixe` direto ou recarregar a página numa tela daria 404.
  Vale igual no app instalado, porque a janela do Tauri navega para esse mesmo
  servidor. Link antigo com "#" continua funcionando: `main.tsx` o traduz na
  entrada, e `/app` também.
- `src/rotas.ts`: a tabela das telas. **Uma linha por aba, e mais nada** — quem
  acrescenta uma tela mexe aqui e no arquivo dela. Cada tela chega ao navegador
  quando é aberta (`lazy`), e não toda vez que alguém abre o painel.
- `src/casca/`: a moldura — `Casca` (o layout das rotas), `Menu`, `Cabecalho`,
  `Cartao`, `Icone`.

  **A tela ocupa a janela.** A casca é uma coluna de altura fixa: menu à
  esquerda, cabeçalho parado no alto, e o que sobra é do miolo. Dentro dele, o
  cartão marcado com `preencher` cresce até o pé da janela e rola POR DENTRO —
  o título, o filtro e o botão de ação ficam parados, e só a lista corre. É um
  cartão por tela (dois dividiriam a sobra e nenhuma lista ficaria com altura
  útil), e as telas que ainda usam a folha antiga fazem o mesmo pela classe
  `tela-cheia` (ver o fim de `producao.css`).

  **O Encaixe não tem cabeçalho nem folga.** É a única tela cujo conteúdo é uma
  bancada — lista de peças de um lado, mesa do outro, as duas medindo-se pela
  janela —, e ali o cabeçalho cobraria 57px de altura para repetir o que o
  menu já mostra aceso. Sem ele e sem a folga, o que sobra para a bancada é a
  janela inteira, sem `calc()` nenhum, e sem rolagem de página: o que não
  couber é problema de quem está dentro. Era assim na casca antiga e voltou a
  ser (ver `bancada` em `casca/Casca.tsx`).

  **A barra lateral também não rola inteira.** Marca no alto e relógio no pé
  ficam presos; só a lista de telas corre. E a densidade dela segue a ALTURA da
  janela, pelas variantes `curta:` (≤900px) e `baixinha:` (≤760px) declaradas
  em `estilo/entrada.css`: a linha de apoio sai, o item aperta e o ícone
  encolhe, o que faz as treze telas caberem num monitor de 1366x768 e de
  1280x720 sem cortar nem rolar.
- `src/telas/`: uma por aba. A de **Projetos** usa o desenho do Optmize Lite —
  árvore de clientes à esquerda, projeto aberto à direita —, e só o desenho: a
  estrutura continua Cliente → Projeto → peças, no `dados.db` desta máquina,
  com o "levar pro Encaixe" de sempre. Ver o cabeçalho de `telas/Projetos.tsx`.
- `src/motores/`: o domínio — sem React e sem a tela. Ver a regra em
  `ARQUITETURA.md`.
- `src/utils/`: a ajuda sem dono — `geometria.ts`, `numero.ts`, `formato.ts`,
  `respirar.js`, `arquivoDeImagem.ts`, `avisos.ts`. O que três telas e dois
  motores usam e não cabe dentro de nenhum deles.
- `estilo/tokens.css`: a paleta. **O único arquivo com hex no projeto**;
  escrever cor em qualquer outro lugar quebra o tema.
- `src/producao/`: a integração de compatibilidade do **Encaixe**, que ainda é
  dirigido por um controlador imperativo. Ver `INTEGRACAO-REACT.md`. Cor,
  Projetos e Moldes já saíram de lá — a pasta some quando o Encaixe sair.

## A bancada do encaixe

`bancada/` mede o motor de encaixe fora do navegador. Não é tela nem servidor: é
a ferramenta que responde "essa mexida no encaixe gastou menos tecido ou não?".

- `bancada/motor.js`: carrega os mesmos sete arquivos que o `encaixe-worker.js`
  carrega, com o mesmo `estatico/encaixe.wasm`. **A ordem é a mesma de lá** — se
  um arquivo entrar no worker, entra aqui, senão a bancada mede um motor que
  ninguém roda.
- `bancada/pecas.js`: as silhuetas, nascidas de polígonos escritos no código.
  Todas têm a concavidade que molde de verdade tem (decote, cava, cabeça de
  manga, gancho): silhueta lisa esconde justamente o que o motor faz.
- `bancada/trabalhos.js`: os seis lotes de referência, cada um cobrindo um
  comportamento diferente do encaixe.
- `bancada/medir.js`: `npm run bancada`. Guarda a corrida com `--json` e compara
  com `--contra`.
- `bancada/conferir.js`: `npm run bancada:conferir`. O motor em WebAssembly tem
  que dar exatamente o mesmo resultado do motor em JavaScript, e é este arquivo
  que prova.
- `bancada/motores.js`: sobe módulos de `src/` (os motores e os `utils/` que
  eles usam) fora do navegador. O
  esbuild — o MESMO que o Vite usa — junta a árvore num arquivo só, então o que
  a bancada mede é o que o navegador roda, e não uma aproximação. Usam-no o
  `motor.js` e o `conferir-arte.js`.
- `bancada/conferir-gravacao.js`: `npm run bancada:gravacao`. Sobe as rotas de
  molde, estampa e projeto em processo, numa pasta de dados descartável, e
  confere que a **geometria volta igual** — contorno, furo, medida, folga zero.
  Não é um teste de "respondeu 200": um contorno que perde casa decimal não
  quebra nada e não avisa, só sai um pouco errado no tecido.
- `bancada/conferir-tela.cjs`: `npm run bancada:tela`. Sobe o servidor numa
  pasta descartável e abre o painel num Chrome de verdade: larga três artes no
  Encaixe, manda otimizar e pede o PDF. É a única conferência que atravessa o
  `<input type="file">`, o canvas e os workers — o `conferir-react` roda em
  jsdom, que não tem nenhum dos três. Ela nasceu de um defeito real: uma
  extração levou junto duas funções da leitura de arquivo, e tudo o mais
  passou enquanto largar um PNG na tela dava `lerImagemCrua is not defined`.
- `bancada/conferir-whatsapp.js`: `npm run bancada:whatsapp`. O bot mantém um
  Chrome invisível aberto, e isso custa de 300 a 500 MB — preço aceito
  **enquanto ele está conectado**. Esta conferência tranca o que não pode
  acontecer: pagar esse preço sem estar conectado. Roda com um cliente de
  mentira, sem rede e sem navegador, porque subir o WhatsApp Web de verdade
  depende de um site que muda sem avisar, e conferência que falha por motivo
  alheio é conferência que as pessoas aprendem a ignorar.
- `bancada/conferir-cor.js`: `npm run bancada:cor`. Ida e volta
  sRGB → CMYK → sRGB pelo perfil SWOP do Windows. O `cor-icc.js` caminha na LUT
  do perfil à mão, e um erro ali não parece erro: o arquivo abre, as cores só
  ficam diferentes.
- `bancada/conferir-sobreposicao.js`: `npm run bancada:sobreposicao`. Repinta
  cada peça posicionada na grade do rolo e acusa célula ocupada duas vezes.
  Nasceu para achar a causa de "peça saindo sobreposta" no encaixe por NFP —
  achou, o NFP foi consertado e depois saiu do projeto, e a conferência ficou:
  "não sobrepõe por construção" é argumento, e argumento não pega erro de
  arredondamento no caminho da posição até a tela.
- `bancada/trabalhos.js` traz `producao-uniforme`, copiado de um trabalho real
  (175 peças, 179 cm, 34,63 m na produção). É o único com um número de fora para
  comparar, e o único cujas peças têm a ocupação que esta loja imprime (76% a
  100%) em vez da de molde de confecção (48% a 74%). Mexida medida só nas peças
  de molde responde à pergunta errada para metade dos trabalhos.
- `bancada/vaos.js`: `npm run bancada:vaos`. Mede quanto do rolo virou vão
  **preso** — vazio com peça por baixo, que o relevo por coluna não alcança mais
  — e o que caberia no maior deles. É a medida que justificou a repescagem.
- `bancada/conferir-pdf.js`: `npm run bancada:pdf`. O PDF do encaixe tem que
  sair num arquivo só, com uma página por bancada, no tamanho real certo — e,
  quando usa o `/UserUnit`, declarando PDF 1.6. **Peça partida é peça perdida**:
  se alguém reintroduzir a repartição em ARQUIVOS, é este arquivo que grita.
- `bancada/conferir-bancada.js`: `npm run bancada:corte`. A trava da bancada:
  nenhuma peça cruza a linha entre duas, cada bancada cabe no comprimento
  pedido, e a arte impressa também. É a regra em que a paginação do PDF se
  apoia, e ela também mede quanto a trava custou de tecido.

**Como medir uma mexida:** ela entra atrás de um ajuste do `config` com padrão,
e as duas corridas saem do mesmo código — `--extra reparoChance=0` de um lado,
nada do outro. Voltar o repositório no tempo mede junto tudo o mais que tiver
mudado.

## O programa instalado

O sistema também é empacotado como app de janela (Tauri). A casca não sabe nada
do negócio: sobe o `server.js` com o `node.exe` que veio junto, numa porta
livre, e aponta a janela para ela.

- `src-tauri/src/main.rs`: arranca o servidor, abre a janela na tela de
  "abrindo", navega para o sistema quando a porta atende e mata o `node.exe` na
  saída.
- `src-tauri/tauri.conf.json`: o que entra no instalador, o ícone e o nome.
- `empacotar/preparar.js`: copia servidor, `dist/`, `node_modules` e o
  `node.exe` para `src-tauri/servidor` antes de cada build.
- `empacotar/janela/`: as duas únicas telas que não vêm do servidor — a de
  "abrindo" e a de erro. São as únicas com cor escrita à mão no projeto, porque
  o `interface.css` vem justamente do servidor que ainda não subiu.

**A regra que não pode ser afrouxada:** nada de dado do usuário ao lado do
programa. `dados.db` e `uploads/` moram onde o `caminhos.js` mandar, e no app
instalado isso é `%APPDATA%r.com.optimize.desktop` — o diretório de
instalação é somente-leitura para quem usa.

## Padrões de interface

- **Cabeçalho de cartão** (`.card-head`): título, uma linha de apoio e a ação principal do cartão na mesma altura. Substitui o `style=` na marra que cada tela usava antes.
- **Ajuda sob demanda** (`.ajuda`, um `<details>`): o texto que explica o porquê fica fechado atrás de um "?". É longo e quase sempre já é sabido — aberto, empurrava o formulário para baixo da dobra.
- **Número do passo** (`.passo-selo`): o Encaixe é uma sequência; ver "1, 2, 3" descendo a página evita a dúvida de por onde começar.

## Moldes e Projetos não são a mesma coisa

As duas telas guardam trabalho para reaproveitar, mas o que elas guardam é diferente, e confundir uma com a outra leva a modelar errado:

- **Moldes** guarda a **geometria** da peça (o contorno em centímetros). A estampa é aplicada nele depois, e o mesmo molde serve para P, M e G.
- **Projetos** guarda a **arte já aplicada** — a estampa na camisa, na bandeira. Não há passo seguinte: a peça vai direto para o encaixe.

Por isso o projeto guarda também os ajustes do encaixe (largura do tecido, folga, comprimento da bancada, giro): repetir um pedido é abrir, dizer quantas unidades e mandar calcular.

## Arquivos que não são código-fonte

`node_modules/`, `dados.db*`, `uploads/`, `config/`, `exportado/`,
`whatsapp-sessao/` e as pastas de backup são dados locais ou arquivos gerados.
Eles continuam preservados, mas ficam fora do controle de versão pelo
`.gitignore`.

**`whatsapp-sessao/` é uma credencial**: quem copiar a pasta entra no WhatsApp
do bot. Não versione nem compartilhe.

As tabelas de Projetos se chamam `projeto_clientes`, `projetos` e `projeto_pecas`. O nome não é `clientes` de propósito: um `dados.db` antigo ainda tem a tabela `clientes` do módulo comercial que saiu, e um `CREATE TABLE IF NOT EXISTS clientes` não criaria nada — o código passaria a ler a tabela velha, com as colunas erradas.

O `dados.db` de instalações antigas ainda guarda as tabelas do módulo comercial e financeiro (clientes, produtos, produções, lojas, notas, pagamentos, orçamentos e configurações). Elas não são mais criadas nem lidas por nenhum código; ficam ali só como registro, caso um dia seja preciso recuperar aqueles dados. O mesmo vale para as imagens em `uploads/artes/`.

## Regra para novas telas

Uma tela nova é um arquivo em `src/telas/` e **uma linha em `src/rotas.ts`** —
mais nada. O `App.tsx` não muda.

Dentro dela: o que é conta vai para `src/motores/`, o que é chamada de servidor
vai para `src/api/`, e o que sobra — o estado e o desenho — fica na tela. Cor
não se escreve à mão em lugar nenhum: sai dos tokens de `estilo/tokens.css`,
que é o único arquivo com hex no projeto.

`src/telas/Cor.tsx` é o exemplo a seguir; `src/producao/` é o que ainda não
seguiu.
