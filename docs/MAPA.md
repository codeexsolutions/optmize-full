# Mapa do Optimize — o que faz o quê

Este é o documento para responder rápido a uma pergunta só: **"onde eu mexo
para mudar X?"**. Cada arquivo tem no topo dele a explicação do próprio
funcionamento; aqui fica a visão de cima, e as regras que atravessam tudo.

O sistema tem duas metades que quase não se falam. A primeira **prepara o que
vai para a máquina** — moldes, projetos, encaixe, vetor. A segunda
**acompanha o que já foi** — a central das impressoras. Elas dividem o
servidor, o `dados.db` e a casca da tela, e mais nada: nenhuma função de uma
é chamada pela outra.

---

## As quatro telas que preparam o trabalho

| Tela | O que faz | Arquivos |
|---|---|---|
| **Moldes** | Guarda o **contorno** da peça em centímetros. A estampa é aplicada nele depois, em qualquer tamanho. | `moldes.js` (leitores de arquivo), `moldes-tela.js` (a tela), `arte-molde.js` (a arte dentro do contorno), `moldes-api.js` (servidor) |
| **Projetos** | Guarda a **arte já aplicada** — a estampa na camisa, na bandeira. Vai direto para o encaixe. | `projetos.js`, `projetos-api.js` |
| **Encaixe** | Põe as peças no tecido gastando o mínimo. | `encaixe.js` (tela), `encaixe-motor.js` (o cálculo), + os módulos de apoio abaixo |
| **Vetor** | Transforma imagem em desenho vetorial (SVG). | `vetor.js` (a conta), `vetor-tela.js` (a tela) |

**Moldes e Projetos não são a mesma coisa.** É a confusão mais fácil de
cometer neste código. Molde guarda geometria (para aplicar arte depois);
projeto guarda arte pronta (não há passo seguinte). Modelar um como o outro
quebra os dois.

---

## As cinco telas da central das impressoras

| Tela | O que faz | Arquivos |
|---|---|---|
| **Impressoras** | O painel: o que está imprimindo agora, o dia e o período. | `src/telas/Impressoras.tsx` |
| **Histórico** | Todos os trabalhos já impressos, em lista ou em cartões com a arte. | `src/telas/Historico.tsx` |
| **Pedidos** | A fila da calandra: a lista de produção e o que já passou por lá. | `src/telas/Pedidos.tsx`, `src/impressoras/LancarPedido.tsx`, `impressoras/routes/pedidos.js` |
| **Máquinas** | Acha as impressoras na rede e cadastra. | `src/telas/Maquinas.tsx`, `impressoras/services/discovery.js` |
| **Reposição** | Quanto tecido foi gasto refazendo trabalho, por semana. | `src/telas/Reposicao.tsx` |
| **WhatsApp** | Avisa num grupo quando uma impressão começa e termina. | `src/telas/Whatsapp.tsx`, `impressoras/whatsapp/` |

O servidor delas está em `impressoras/`, montado por `impressoras-api.js` em
`/api/impressoras`.

**Não existe impressora escrita no código.** Nem em código, nem em arquivo de
configuração. Uma máquina entra porque a varredura da rede a encontrou e
alguém deu um nome a ela; daí em diante ela mora na tabela `imp_machines`. É a
diferença deliberada em relação ao sistema de onde este módulo foi portado, que
nascia com quatro máquinas escritas num `machines.json` — caminho de rede
escrito à mão só está certo na instalação de quem o escreveu, e quando deixa de
estar, a impressora apenas "fica offline" sem dizer por quê.

**A tela nunca lê a impressora.** Ela lê o `dados.db`. Quem conversa com as
máquinas são o `sync` (na subida) e os três leitores ao vivo (`realtime`,
`liveLog`, `printer2Live`). Isso não é otimização prematura: era exatamente o
contrário — uma consulta por acesso indo ao compartilhamento SMB de cada
máquina — que travava o painel quando várias pessoas olhavam ao mesmo tempo.
O efeito colateral bom é que dia antigo continua consultável com a máquina
desligada.

**O tipo da máquina decide o leitor, não o nome dela.** São três formatos de
histórico (`csv`, `xml`, `at-binary`), e a varredura reconhece qual é pelo que
a impressora deixa no compartilhamento. Os arquivos chamados `printer2*` são
os do tipo `csv` — o nome ficou do sistema de origem, onde só havia uma
máquina desse tipo; eles operam sobre **todas** as máquinas CSV cadastradas.

**Quem fecha o ciclo da calandra não é a tela.** O `calandraStatus` de cada
item de pedido (pendente / ok / erro) é marcado pelo aparelho da calandra, que
lê o QR da folha impressa e chama
`POST /pedidos/:id/items/:itemId/result`. A tela de Pedidos **mostra** o que
ele marcou, e de propósito não oferece um botão de "marcar como ok": inventar
um faria a fila divergir do que aconteceu na máquina, que é exatamente o que o
QR existe para evitar.

**Cliente e tecido saem do nome do arquivo.** Não são campos: são lidos de
"CLIENTE - TECIDO.prt" (`impressoras/services/matching.js`). É o que permite
avisar "isso já foi rodado antes" sem ninguém digitar nada — e também o motivo
de o palpite errar às vezes, daí o aviso ser aviso e não impedimento.

**A Ordem de Serviço saiu da tela, e não do servidor.** A OS era o pedido de
produção preenchido à mão, com as imagens de referência que o aparelho da
calandra mostrava ao operador. A tela dela foi retirada; o servidor continua
inteiro (`impressoras/routes/serviceOrders.js`, `db/serviceOrders.js`,
`services/orderPdf.js`) e as tabelas `imp_service_orders` e
`imp_service_order_images` continuam sendo criadas.

Isto é dívida consciente, não esquecimento. Está assim porque a decisão foi
tirar a tela sem fechar a porta: o `imp_pedido_items.osId` continua existindo e
o servidor continua sabendo preenchê-lo, então voltar com a OS é escrever uma
tela — não uma migração de banco com dado já gravado no meio. **Quem decidir
que ela não volta**: são quatro arquivos de servidor, duas tabelas, a coluna
`osId`, o ramo `"O"` de `/api/scan/:code` e o `findMatchingOrder` do matching.

**Número de tinta do AT ainda é experimental.** Os registros vêm marcados com
`inkExperimental`, e a tela mostra um `?` ao lado. Tirar a marca exige conferir
contra a tela da própria máquina, não contra a nossa conta.

---

## As camadas, de baixo para cima

```
geometria.js        conta pura sobre contorno: área, caixa, simplificar
    |
    +-- encaixe-mascara.js  silhueta da arte na grade do encaixe
    +-- encaixe-rede.js     rede neural das receitas (roda no navegador E no servidor)
    +-- vetor.js            imagem -> contorno -> curva
    +-- moldes.js           DXF/PLT/SVG/PDF -> contorno em cm
              |
              +-- encaixe-motor.js    os encaixadores e a busca
                       |
                       +-- encaixe-wasm.js      o laço quente em WebAssembly
                       +-- encaixe-paralelo.js  espalha a busca pelos núcleos
                       +-- encaixe-prepara.js   prepara silhuetas em paralelo
                                |
                                +-- encaixe.js       a tela
                                +-- moldes-tela.js   a tela
                                +-- projetos.js      a tela
                                +-- vetor-tela.js    a tela
```

A **bancada** (`bancada/`) entra por baixo dessa pilha inteira: ela carrega os
mesmos sete arquivos que o `encaixe-worker.js` carrega, com o mesmo
`estatico/encaixe.wasm`, e mede quanto tecido o motor gasta em seis trabalhos de
referência — sem navegador, sem arte de cliente, com as silhuetas nascendo de
polígonos escritos no código. `npm run bancada` mede, `npm run bancada:conferir`
confere que o WASM dá o mesmo resultado que o JavaScript. **Mexida no motor sem
uma corrida de bancada antes e depois é chute**: o resultado depende do sorteio,
do tempo e do formato da peça ao mesmo tempo.

**Engordar em duas passadas desenha um quadrado.** Horizontal e depois vertical,
cada uma de `raio` células, é rápido e não é um contorno: alcança `raio` de lado
e `raio × √2` na diagonal. Foi assim que a folga entre peças virou um mínimo em
vez de uma medida — pedindo 10 mm, saía 15. Borda de peça é disco
(`discoDoRaio`, em encaixe-mascara.js), e quem mede se a promessa está sendo
cumprida é a distância REAL entre silhuetas no `conferir-sobreposicao`, não o
teste de encostar das peças já engordadas.

**O relevo por coluna esquece o que fica acima.** O encaixe por contorno guarda
o tecido como uma altura por coluna, e no instante em que uma peça é assentada
tudo o que ficou acima dela naquela coluna some do mapa — é por isso que a gola
não entra no decote de uma camiseta já posta. Isso não é defeito a consertar: é
o que deixa a peça descer e se aninhar barato. Quem cobre o buraco é a
`repescarNosVaos`, que roda uma vez no fim com a lista de intervalos ocupados no
lugar do relevo. Medir o tamanho do buraco: `npm run bancada:vaos`.

**A máscara que vai para o worker não é a máscara inteira.** A máscara tem o
`desenho` (a silhueta real, uma célula por posição da caixa da peça) e o
`topo`/`base` (uma altura por coluna). A **busca só lê topo/base**; o `desenho`
é da tela, para traçar o contorno no resultado. Só que o `postMessage` para os
workers **clona**, não transfere — são oito cópias —, e o `desenho` é o vetor
grande. Por isso `pecaParaWorker` manda a máscara enxuta, e o resultado volta
sem máscara nenhuma (a página remonta pela rotação). No lote grande da bancada
isso é 281 KB indo e 895 KB voltando contra 13 KB indo e nada voltando.
Acrescentar campo à máscara é acrescentar peso a oito clones: pense antes se a
busca precisa dele mesmo.

**Número tirado de tentativa inválida contamina quem decide.** O encaixe que
deixou peça de fora gasta MENOS tecido, justamente por não ter encaixado tudo.
Todo lugar que compara consumo tem que conferir `naoEncaixadas.length === 0`
antes — e são vários: o placar dos motores, o `melhorConsumo` de cada receita
(que manda na poda e no rótulo de treino da rede) e a ordem guardada
(`guardarOrdem`). Esquecer o cuidado em um deles não dá erro: dá uma receita
ruim que parece ótima e nunca sai da roda.

**Vocabulário da rede é migração.** `REDE_MOTORES`, `REDE_AGRUPAMENTOS`,
`REDE_ORDENS` e `REDE_HEURISTICAS` (em `encaixe-rede.js`) definem o tamanho da
entrada da rede. Acrescentar um nome a qualquer um deles — um encaixador novo,
uma ordem nova como a "familia" — alarga essa entrada, e os pesos que já estão
no banco passam a esperar um vetor mais curto. Alimentar a rede antiga com o
vetor novo não dá erro: dá palpite sem sentido. Por isso rede de tamanho
diferente é tratada como rede que não existe, dos dois lados
(`pontuarReceitas` no motor, `redeServeAinda` no `encaixe-memoria.js`), e o
servidor a treina de novo na primeira oportunidade.

`encaixe-rede.js` é o único arquivo do domínio que também roda **fora** do
navegador: `encaixe-memoria.js` (servidor) importa ele com `require()` para
treinar a rede a partir do histórico. Por isso o arquivo termina com um guard
de `module.exports` — carrega igual nos três lugares (página, worker,
servidor) sem precisar de três cópias.

Quanto mais em baixo, menos o arquivo sabe do mundo. `geometria.js` só conhece
números; `encaixe.js` conhece o DOM. **Dependência só aponta para baixo** — se
um arquivo de baixo precisar de algo de cima, é sinal de que a divisão está
errada.

---

## Regras que valem em todo o projeto

### 1. Cor só sai de `interface.css`
Toda a paleta são tokens declarados lá. Escrever um `#hex` em qualquer outro
arquivo quebra o tema. As exceções estão comentadas onde estão: impressão
(papel é branco), o fundo do QR e o xadrez de transparência.

### 2. Nada de `document` ou `window` no que roda em worker
`geometria.js`, `encaixe-mascara.js`, `encaixe-motor.js`, `encaixe-wasm.js`,
`encaixe-rede.js` e `vetor.js` são carregados **também dentro de Web
Workers** (`importScripts`), onde não existe página. Uma linha com `document`
ali derruba o worker inteiro no carregamento. `encaixe-rede.js` tem uma
terceira plateia: o servidor, via `require()` — nem `document`/`window` nem
nada de Web Worker (`importScripts`, `self`) pode entrar nele.

### 3. Os pixels são lidos na página, não no worker
Só a página tem canvas de verdade. O worker recebe os **bytes já lidos**. A
exceção deliberada é a remoção de fundo, que recebe um `ImageBitmap` e desenha
**1:1** — sem redução, porque o Chrome reduz um `ImageBitmap` com conta
diferente de um `<img>` e a silhueta sai diferente.

### 4. Arte grande decodifica fora da thread da tela
Uma camiseta em 300 dpi passa de 29 megapixels. Abri-la num `<img>` e desenhar
força a decodificação na página — 1,2 a 1,8 s de tela travada por arte.
Use `criarBitmapOuImagem()`, que usa `createImageBitmap` e ainda aceita um teto
de resolução (ver `ladoDeTrabalho`).

### 5. Miniatura nunca é a arte inteira
Um `<img>` de 57 px apontando para o arquivo de impressão faz o navegador
decodificar tudo para pintar o quadradinho. Toda lista guarda a sua miniatura
reduzida (`peca.miniatura`, `projeto_pecas.miniatura`).

### 6. A medida em centímetros vem do arquivo, não do bitmap
O bitmap pode ter sido decodificado reduzido. Medir o reduzido dá uma peça
menor do que ela é — foi exatamente esse erro, por outra causa, que fazia uma
camiseta de 49,3 cm entrar no encaixe como 15,2 cm.

### 7. Falha de rede não derruba o Encaixe
A memória do encaixe é um acelerador, não um requisito. Sem servidor a tela
funciona igual, só começa do zero. Toda conversa com ela passa por
`pedirAoServidorDoEncaixe`, que engole o erro de propósito.

---

### 8. Impressora offline não derruba o painel
O estado online/offline de cada máquina fica em memória
(`impressoras/services/machineStatus.js`), atualizado pelo mesmo laço que lê os
arquivos. Uma impressora desligada não segura a resposta das outras, e o
histórico dela continua saindo do banco.

---

## O servidor

| Arquivo | Responsabilidade |
|---|---|
| `server.js` | Express + socket.io: serve o painel, monta as rotas e escuta em `0.0.0.0` |
| `db.js` | SQLite: cria as tabelas e migra colunas novas |
| `moldes-api.js` | Rotas de `/api/moldes` |
| `projetos-api.js` | Rotas de `/api/projetos` |
| `encaixe-memoria.js` | O que o Encaixe aprendeu: recordes e placar de receitas |
| `encaixe-pdf.js` | O PDF do encaixe em tamanho real |
| `uploads-arquivos.js` | Comum a moldes e projetos: tipo do arquivo, nome sem colisão, faxina do disco |
| `caminhos.js` | Onde ficam o banco, os uploads e a configuração: pasta do projeto, ou a do usuário no app instalado |
| `impressoras-api.js` | Monta a central das impressoras em `/api/impressoras` e levanta os leitores |
| `impressoras/` | A central: varredura da rede, leitores, OS, pedidos, WhatsApp |
| `src-tauri/src/main.rs` | A casca de janela: sobe o servidor, abre a janela nele, mata o servidor na saída |

**Dado de usuário nunca fica ao lado do programa.** Todo caminho de gravação
passa por `caminhos.js`. Escrever `path.join(__dirname, ...)` para gravar
alguma coisa funciona rodando pelo código e quebra no programa instalado, onde
a pasta é somente-leitura.

**A faxina do disco tem uma regra que não pode ser afrouxada:** a conferência
do que ainda está em uso é contra a tabela **inteira**, nunca contra a lista
que acabou de mudar. A mesma imagem pode estar em outro registro.

---

## Armadilhas já pagas

Coisas que já quebraram e por que o código está do jeito que está.

**Nome repetido entre arquivos.** Todos os `<script>` dividem um escopo só —
são 551 nomes no mesmo balde. `vetor-tela.js` definia `pixelsDaImagem`, o mesmo
nome que `encaixe.js`, e como carregava depois **apagava** a do encaixe. O
Encaixe passou a medir a arte reduzida a 1800 px: uma peça de 49,3 cm virava
15,2 cm, silenciosamente. Antes de criar uma função de topo, confira se o nome
já existe em outro arquivo.

**Função chamada que nunca existiu.** `lerComoDataURL` era chamada em
`vetor-tela.js` e em `moldes-tela.js` e não estava definida em lugar nenhum. A
tela de Vetor não abria imagem nenhuma e o envio de arte do molde também não —
e ninguém percebia, porque as duas chamadas estavam dentro de um `try` cujo
`catch` trocava o `ReferenceError` por "não consegui abrir essa imagem". **Todo
`catch` que mostra recado amigável tem de mandar o erro real para o console**,
senão bug de código passa por arquivo ruim.

**Recurso que só funciona no caminho lento.** O encaixe por contorno tem dois
caminhos com o mesmo resultado: o JavaScript (`encaixarContorno`, a referência
de correção) e o WebAssembly, que é o que roda de verdade. O reparo guiado da
busca depende de uma informação que a rodada devolve — qual unidade deixou mais
buraco morto —, e por um tempo só o caminho em JavaScript devolvia. O recurso
existia, estava escrito e nunca tinha valido nada na máquina de ninguém.
**Tudo que a rodada devolve tem que sair igual dos dois caminhos**, não só as
posições; quem confere isso é `npm run bancada:conferir`.

**Ferramenta que compila e não presta.** `npm run build:wasm` chamava o cargo
com `--manifest-path` a partir da raiz. O cargo procura o `.cargo/config.toml` a
partir da **pasta em que foi chamado**, não a partir do manifesto: o rustflag que
exporta o `__heap_base` era ignorado, o módulo saía sem o símbolo, a ponte não
carregava e o encaixe voltava para o JavaScript 3,9x mais devagar — em silêncio,
porque `carregarMotorWasm` engole o erro de propósito. Toda queda para o caminho
lento é silenciosa por desenho; por isso ela precisa de alguém que confira, e
esse alguém é a bancada.

**`requestAnimationFrame` para esperar a tela.** Ele só dispara quando a página
está sendo pintada. Numa aba em segundo plano a espera nunca termina e o
trabalho fica pendurado sem erro nenhum. Use `setTimeout`.

**Tabela do banco com nome reaproveitado.** Um `dados.db` antigo ainda tem as
tabelas do módulo comercial que saiu. `CREATE TABLE IF NOT EXISTS clientes` não
criaria nada — o código passaria a ler a tabela velha, com as colunas erradas.
Por isso as tabelas novas se chamam `projeto_clientes`, `projetos`,
`projeto_pecas`.

**Listagem e registro aberto não devolvem a mesma coisa.** `GET
/service-orders` manda `imageCount` e `coverImageId`; só `GET
/service-orders/:id` traz o array `images`. A tela tinha um tipo só para os
dois e lia `images[0]` na listagem — o que dava tela branca em qualquer
instalação que tivesse uma OS, e passou despercebido justamente porque o banco
de teste estava vazio. Hoje são dois tipos com nomes diferentes
(`OrdemNaLista` e `OrdemAberta`, em `src/impressoras/tipos.ts`), o que torna a
confusão um erro de compilação. **Tela nova com dado real antes de dar por
pronta**: lista vazia não exercita o caminho que quebra.

**PUT não é PATCH.** A tela de Máquinas mandava `PUT` numa rota declarada só
como `router.patch`, e o Express respondia 404 — o botão "Reativar" não fazia
nada além de um recado de "máquina não encontrada", que parecia problema de
dado. O `api` de `src/api/cliente.ts` tem os dois verbos; rota que aceita
alteração parcial pede PATCH.

**O PREFLIGHT DESLIGADO COBRA CARO, E SEMPRE DO MESMO JEITO.** O reset do
Tailwind está fora de propósito — ligá-lo apagaria a tela antiga inteira, que é
estilizada à mão (ver `estilo/entrada.css`). O preço é que a tela nova nasce
com os padrões CRUS do navegador, e cada um deles já apareceu aqui como um
defeito diferente, relatado sempre como "está feio" e nunca como erro:

| O que faltava | Como apareceu |
|---|---|
| `box-sizing: border-box` | `size-[30px]` com recuo e borda desenhava **44px**. Os ícones do menu 1/3 maiores, a barra 21px mais larga que a antiga, e todo `w-full` com recuo estourando o pai. |
| `margin: 0` no `body` | Uma **moldura branca de 8px** em volta do app — branca porque nem `html` nem `body` tinham fundo, e quem pinta o preto é a `<div>` do app, que não alcança a margem. Os 8px somados aos `100vh` ainda faziam nascer uma barra de rolagem sem nada para rolar. |
| Estilo da rolagem | A barra do navegador, larga e clara, encostada no painel preto. O `interface.css` estiliza a dele desde sempre; a tela nova não herdava nada. |
| `color-scheme: dark` | O que o navegador desenha sozinho saía claro: o calendário do campo de data, a seta do `<select>`. |
| `border: 0 solid` | `<button>` mantinha o estilo do SISTEMA — fundo cinza-claro e borda `outset`. O menu inteiro ficou branco sobre o painel preto, e só o item ativo parecia certo, porque era o único com fundo declarado. |

O conserto de todos está no mesmo `@layer base` do `estilo/entrada.css`,
preso a `#raiz` (e a `body:has(#raiz)`, para o `body`) — a tela antiga não tem
esse id, então nada disso a alcança. Em camada porque o CSS à mão das folhas
antigas está FORA de camada, e fora de camada ganha de camada.

**A regra que sai disto: medida ou padrão de navegador que a tela nova supõe
tem que estar escrito ali.** Não confie em ver quebrar — nenhum destes
quebrou. Todos só ficaram um pouco errados, calados, por semanas.

**Duas cascas, dois pontos de quebra.** A tela antiga encolhe a barra lateral
para 78px entre 801 e 1100px de largura; a nova não encolhia. Na mesma janela
de 1080px — a largura de um notebook comum —, um clique que trocava de casca
trocava também a largura do menu, e parecia outro programa. Enquanto as duas
convivem, **regra de aparência é escrita duas vezes**: no `@media` do
`interface.css` e nas variantes `tela:max-[1100px]:` do `Menu.tsx`.

**Dois arquivos declaram `.sidebar`.** O `style.css` diz 252px e o
`interface.css` diz 244px; carrega depois, ganha o segundo. Copiei do primeiro
ao igualar as cascas e deixei a nova 8px mais larga do que devia. Antes de
copiar medida da tela antiga, confira qual das duas folhas está valendo — ou
meça na página, que não mente.

**Confiar numa varredura de dependência que casa nomes soltos.** Depois da
lição do `rotacoesDe` a varredura passou a enxergar `const` e `window.X =` — e
mesmo assim mentiu nos dois sentidos. Ela **acusou** dependências que não
existem (o `encaixe.js` "usando" `itens` e `miniatura` do `cor.js`, quando os
dois só declaram o mesmo nome; o `projetos.js` "usando" o `LADO_DA_MINIATURA`
do `encaixe.js`, quando ele tem o seu, com outro valor) e **escondeu** as que
existem (as seis funções que o `encaixe-prepara.js` puxava do `encaixe.js`, e o
`PPCM_PADRAO` do `arte-molde.js`, porque o `encaixe.js` não estava na lista de
origens daquela rodada).

O que funciona é virar a pergunta do avesso: em vez de "quem usa o quê", **quais
nomes este arquivo usa e não declara?** Aí não existe lista de origens para
esquecer. É preciso descontar comentário, string, literal de regex (uma classe
de escapes vira um "nome" colado — os cinco escapes de espaço em branco viram
`nrtbf` — e o `/\/Type/` de um PDF vira `Type`), declaração múltipla
(`const a = 1, b = 2` declara os dois) e parâmetro. O que sobra é curto o
bastante para ler à mão: no domínio inteiro da Etapa C foram sete nomes, e os
sete eram defeito de verdade.

**Levantar dependência procurando só `function`.** Ao portar o motor de
encaixe, o mapa de "quem usa o quê" foi montado com uma varredura que procurava
`function nome`. Ela perdeu `rotacoesDe` e `podeDeitar`, que são
`const nome = (x) => …` no `encaixe-giro.js` — e o motor portado ficou sem o
`import` deles. Em `<script>` global aquilo funcionava (tudo dividia o mesmo
escopo); em ESM é `ReferenceError` na primeira chamada. Quem pegou foi o
`npm run bancada:porte`, na primeira execução. Varredura de dependência tem que
enxergar `const`, `let` e `class` também — e, de qualquer forma, **a prova de um
porte é rodar os dois lados juntos, não comparar o texto**.

**Lista de máquinas escrita à mão.** O sistema de origem trazia quatro
impressoras num `config/machines.json`, com os caminhos UNC digitados. Aquilo
funcionava numa instalação: a de quem escreveu o arquivo. Renomear um
computador, trocar o PC de uma máquina ou instalar em outra loja quebrava tudo
— e quebrava **calado**, porque uma rota morta só faz a impressora aparecer
offline, que é o mesmo que ela aparece quando está de fato desligada. Por isso
aqui a única entrada é a varredura (`impressoras/services/discovery.js`), e a
lista mora no banco. Se alguém sentir falta de "só configurar o caminho", o
caminho certo é acrescentar uma assinatura nova ao reconhecedor, não um
arquivo.

**Estado global indexado sem o dono.** O controle da varredura de cancelamento
das máquinas CSV era indexado só pelo nome da pasta de sessão do log. No
sistema de origem havia uma máquina CSV e nunca deu problema; aqui a varredura
pode cadastrar várias, e duas com uma sessão de mesmo nome dividiriam o mesmo
controle — uma marcaria como já lida a sessão que a outra ainda não leu. A
chave passou a levar o `machine.id` junto. Vale a pergunta geral: todo estado
que nasceu numa instalação de uma máquina só precisa ser revisto quando passam
a ser várias.

**Duas cascas, dois pontos de quebra.** A tela antiga encolhe a barra lateral
para 78px entre 801 e 1100px de largura; a nova não encolhia. Na mesma janela
de 1080px — a largura de um notebook comum —, um clique que trocava de casca
trocava também a largura do menu, e parecia outro programa. Enquanto as duas
convivem, **regra de aparência é escrita duas vezes**: no `@media` do
`interface.css` e nas variantes `tela:max-[1100px]:` do `Menu.tsx`.

**Um `preserveAspectRatio="none"` num gráfico.** Ele estica X e Y por fatores
diferentes, e o que se vê é o texto do eixo espremido, como fonte condensada.
Gráfico responsivo se faz medindo a largura de verdade (`ResizeObserver`) e
desenhando em pixel, não deformando um `viewBox`.

**Contas duplicadas.** `areaComSinal` existia duas vezes com nomes diferentes,
em arquivos diferentes, letra por letra igual. Duas cópias de uma conta são
dois lugares para consertar quando ela estiver errada. Antes de escrever
geometria, olhe se já não está em `geometria.js`.
