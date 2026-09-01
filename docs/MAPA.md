# Mapa do Optimize — o que faz o quê

Este é o documento para responder rápido a uma pergunta só: **"onde eu mexo
para mudar X?"**. Cada arquivo tem no topo dele a explicação do próprio
funcionamento; aqui fica a visão de cima, e as regras que atravessam tudo.

---

## As quatro telas

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

## As camadas, de baixo para cima

```
geometria.js        conta pura sobre contorno: área, caixa, simplificar
    |
    +-- nfp.js              encaixe por polígono de não-encaixe
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
`nfp.js`, `encaixe-rede.js` e `vetor.js` são carregados **também dentro de Web
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

## O servidor

| Arquivo | Responsabilidade |
|---|---|
| `server.js` | Express: serve o painel e monta as rotas da API |
| `db.js` | SQLite: cria as tabelas e migra colunas novas |
| `moldes-api.js` | Rotas de `/api/moldes` |
| `projetos-api.js` | Rotas de `/api/projetos` |
| `encaixe-memoria.js` | O que o Encaixe aprendeu: recordes e placar de receitas |
| `encaixe-pdf.js` | O PDF do encaixe em tamanho real |
| `uploads-arquivos.js` | Comum a moldes e projetos: tipo do arquivo, nome sem colisão, faxina do disco |
| `caminhos.js` | Onde ficam o banco e os uploads: pasta do projeto, ou a do usuário no app instalado |
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

**Contas duplicadas.** `areaComSinal` existia duas vezes com nomes diferentes,
em arquivos diferentes, letra por letra igual. Duas cópias de uma conta são
dois lugares para consertar quando ela estiver errada. Antes de escrever
geometria, olhe se já não está em `geometria.js`.
