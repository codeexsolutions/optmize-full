# Estrutura do Optimize

> Para "onde eu mexo para mudar X?", veja **[MAPA.md](MAPA.md)** — a visão de
> cima, as camadas e as armadilhas já pagas.

O sistema fica dividido em código do servidor, painel web e arquivos gerados em execução.

## Código do servidor

- `server.js`: inicialização do Express, arquivos estáticos e rotas da API.
- `caminhos.js`: decide onde ficam o `dados.db` e a pasta `uploads/`. Rodando pelo código, na pasta do projeto; no programa instalado, na pasta de dados do usuário.
- `db.js`: banco dos moldes e da memória do encaixe.
- `moldes-api.js`: operações da área de moldes.
- `uploads-arquivos.js`: o que moldes e projetos têm em comum ao guardar imagem em disco.
- `projetos-api.js`: projetos de cliente — a pasta, o projeto e as peças já prontas.
- `encaixe-memoria.js` e `encaixe-pdf.js`: cálculo, memória e documento do encaixe.
- `impressoras-api.js`: monta a central das impressoras em `/api/impressoras` e levanta os leitores das máquinas.

## A central das impressoras

`impressoras/` acompanha o que já saiu das máquinas: acha as impressoras na
rede, lê o histórico de cada uma e guarda no mesmo `dados.db`. Foi **portada**
de um sistema que já rodava na produção, e por isso é a única parte do projeto
com nomes em inglês por dentro (`machineId`, `printLength`): portar é
acrescentar o que falta, não reescrever o que funciona.

- `impressoras/config.js`: de onde saem as máquinas. **De lugar nenhum escrito
  à mão** — só da varredura da rede.
- `impressoras/services/discovery.js`: a varredura. Procura quem responde em
  SMB, resolve o nome do computador e reconhece o tipo da impressora pelo que
  ela deixa no compartilhamento.
- `impressoras/sources/`: os três leitores de histórico — `csvHistory`,
  `xmlHistory` e `atBinary`. Um por formato de arquivo de impressora.
- `impressoras/services/sync.js`: a importação da subida, que enche o banco.
- `impressoras/services/realtime.js`, `liveLog.js`, `printer2Live.js`: os
  leitores ao vivo. São os únicos que conversam com as máquinas depois da
  subida.
- `impressoras/services/printer2Cancel.js`: descobre cancelamento nas máquinas
  CSV, cujo software não registra cancelamento em lugar nenhum.
- `impressoras/db/`: as tabelas `imp_*` do `dados.db`.
- `impressoras/routes/`: as rotas de máquinas, pedidos e WhatsApp — e as de
  Ordem de Serviço, que continuam de pé sem tela que as chame (ver MAPA.md).
- `impressoras/services/matching.js`: lê "CLIENTE - TECIDO" do nome do arquivo.
  É o que sustenta o aviso de "já rodado antes" ao lançar um pedido.
- `impressoras/services/qrcode.js`: o QR da folha de produção, desenhado em SVG
  no próprio servidor — sem serviço de fora e sem imagem carregada da internet.
- `impressoras/whatsapp/`: o bot de avisos. `navegador.js` decide qual Chrome
  usar — ver abaixo.

**As tabelas levam prefixo `imp_`.** `machines`, `records` e `pedidos` são
nomes genéricos demais para um banco que também guarda moldes e projetos, e um
`CREATE TABLE IF NOT EXISTS` sobre um nome que já existe não cria nada e não
reclama: o código passa a ler a tabela errada, calado. É a mesma armadilha que
já custou caro aqui uma vez.

**O bot não embute Chrome.** O sistema de origem levava o Chrome do Puppeteer
no instalador: 409 MB, mais do que o resto do programa inteiro. Aqui
`impressoras/whatsapp/navegador.js` procura, nesta ordem, a variável
`OPTIMIZE_CHROME`, o Chrome do Puppeteer (que existe na máquina de quem
desenvolve), o Google Chrome instalado e o Microsoft Edge — que vem com o
Windows. Não achando nenhum, a tela diz o que instalar, em vez de estourar um
erro do Puppeteer que não significa nada para quem está olhando.

## Painel web

- `public/index.html`: estrutura das telas e modais.
- `public/style.css`: estrutura funcional de cada recurso — grade, tabelas, formulários.
- `public/interface.css`: a identidade Optimize. **Toda cor da interface sai dos tokens declarados aqui**; escrever um hex em qualquer outro arquivo quebra o tema.
- `public/geometria.js`: as contas de contorno (área, caixa, simplificação) que Moldes, Vetor e Encaixe dividem.
- `public/interface.js`: menu lateral, troca de tela e relógio.
- `public/ui.js`: a caixa de diálogo do sistema (`uiAlert`, `uiConfirm`, `uiPergunta`) e o `escapeHtml` que todas as telas usam.
- `public/projetos.js`: tela de Projetos — a estante por cliente e o editor.
- demais arquivos de `public/`: telas especializadas de moldes, encaixe e vetor.

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
- `bancada/conferir-porte.js`: `npm run bancada:porte`. **Temporário.** Enquanto
  o motor existe em dois lugares — `public/encaixe-motor.js`, que a tela antiga
  carrega, e `src/nucleo/encaixeMotor.js`, que a tela nova carrega —, este
  arquivo prova que os dois são o MESMO: sobe as duas instâncias, roda a mesma
  ordem embaralhada com a mesma semente em cada combinação, e exige resultado
  idêntico peça por peça. Some junto com `public/`.
- `bancada/motor-nucleo.js`: sobe o motor portado fora do navegador. O
  `motor.js` concatena o texto dos `<script>` de `public/`; aqui não dá, porque
  os de `src/nucleo/` são módulos ESM e um deles é TypeScript. O esbuild — o
  mesmo que o Vite usa — junta a árvore num arquivo só, então o que se mede é o
  que o navegador roda.
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
- `empacotar/preparar.js`: copia servidor, `public/`, `node_modules` e o
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

O HTML permanece em `public/index.html`. A regra da tela deve entrar no arquivo JavaScript do recurso correspondente. Mudanças puramente visuais devem ficar em `public/interface.css`, evitando misturar aparência com banco ou integrações.
