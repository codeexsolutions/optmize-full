# As telas do terminal

O que cada tela do aparelho da calandra faz, o que aparece nela, e por que ela é
assim. Dezesseis telas, quatro caminhos.

Este documento é sobre **o que se vê**. O `LEIA-ME.md` ao lado é sobre **como foi
construído** — a placa, os pinos, os defeitos que custaram dias.

> Uma versão ilustrada, com maquete de cada tela em escala:
> https://claude.ai/artifact/Bg6PFH6yduSCfCowfGfRrC

---

## A casca

### A barra do topo — *em todas as telas*

Voltar à esquerda, o nome do app ao lado, e à direita o estado da rede e a hora.
O botão de voltar só aparece fora da tela inicial.

O símbolo de rede fica **verde** quando conectada e **âmbar** quando não — e aí o
texto ao lado troca o endereço IP pelo *motivo*: "senha errada", "rede não
encontrada".

**Por quê:** o símbolo diz o estado de longe, o texto diz o detalhe de perto. Quem
passa pela tela quer saber se está conectada, não qual é o endereço — e uma cor se
lê a três metros, o que um IP não se lê.

A hora vem da rede (SNTP). Sem ela o relógio mostra `--:--` em vez de inventar: um
relógio marcando hora errada com ar de certeza é pior que um que assume não saber.

### A tela inicial

Três cartões grandes, um por app, e um círculo pequeno no canto para o **Sobre**.
O ícone de cada app mora num disco da cor dele.

**Por quê:** a cor identifica a área sem pintar a superfície inteira — um cartão
laranja inteiro gritaria mais que o conteúdo dele. O círculo do Sobre é pequeno de
propósito: os três cartões são o trabalho, aquilo é manutenção aberta uma vez por
mês.

---

## Produção — um fluxo de sete telas

### 1. A procura

A câmera ao vivo à esquerda, a instrução à direita. O terminal lê sozinho: não há
botão de disparar.

O QR da folha é um código curto — `Pc4b5348578` — e só o servidor sabe traduzi-lo.
Códigos de OS (`O…`) e de trabalho avulso (`R…`) são válidos e **não servem aqui**;
a tela diz isso em vez de "código inválido", que mandaria a pessoa procurar defeito
no papel.

**Por quê:** o código é opaco para caber na versão 1 do QR — a menor, de módulos
maiores, a mais fácil de uma câmera ler de longe.

### 2. A visão geral

Quantas peças, quantos metros, e o que já foi marcado. O ✓ e o ✗ aparecem por item,
para quem está retomando. A placa **fala o tamanho do trabalho** — "5 itens, 62
vírgula 4 metros" — e não a lista inteira: ler vinte nomes por voz levaria dois
minutos e ninguém esperaria até o fim.

**Por quê:** ler o QR não é o mesmo que começar a conferir. Quem aponta a câmera
está perguntando "o que vem nisto aqui?"; começar depende do rolo estar na máquina.

**Esta lista não marca nada**, e é isso que a torna possível. A primeira versão
tinha sim e não em cada linha, e virou conferência item a item porque marcar de uma
lista convida a procurar a linha certa com o rolo andando — e é aí que se marca o
item errado.

### 3. A conferência — *um item por vez*

A arte à esquerda, já carregada. A **metragem sozinha em corpo grande** — ela não
é mais um dado entre outros, é o número que decide se aquele rolo é aquele item —
e abaixo dela, em pares alinhados, cliente, tecido e máquina. *"Dry Fit" muda a
temperatura da máquina*, e isso o nome do arquivo não diz. Dois alvos embaixo, cada um com quase meia tela. Ao entrar em cada item a
placa **diz o nome e a metragem em voz alta** — inclusive nos já marcados, porque
quem volta a um pedido conferido está conferindo de novo.

**Por quê:** a arte *é* a decisão. Se ela precisa de um toque para aparecer,
ninguém toca, e a conferência vira marcar linha por nome de arquivo — que é o que
esta tela existe para não ser.

Quem está na calandra tem as duas mãos no tecido e o olho na arte: ler a tela exige
parar e virar a cabeça, ouvir não.

### 4. A arte de perto — *tocando na imagem*

Tela cheia, com `−` `+` para o zoom, `⟳` para voltar ao tamanho que cabe, e o ✗
para fechar. Ampliada, a imagem se arrasta com o dedo.

**Por quê:** defeito de impressão é coisa de centímetro, e uma arte de 8 metros
reduzida para caber num painel de 480 pixels não mostra mancha nenhuma.

O zoom para em 200%: aos 100% cada pixel do arquivo já ocupa um pixel da tela, e
dali para cima o que cresce é o borrão.

### 5. O motivo — *depois de "não passou"*

Lista curta e fechada, em botões grandes, dois por linha. Cancelar **não marca
nada** — quem abriu por engano sai sem ter reprovado uma peça boa.

**Por quê:** teclado na calandra é o caminho certo para ninguém escrever nada. Quem
está de luva, com pressa e com a fila andando digita "erro" e segue — e "erro" não
ajuda ninguém a entender o que aconteceu semanas depois.

**A lista ainda é um chute.** Ela tem de vir da gráfica: o que acontece toda semana
entra, o que nunca é tocado sai.

### 6. Segue ou para

Continuar leva ao próximo item. Parar leva ao resumo e **não fecha o pedido**: os
itens restantes continuam pendentes, e o mesmo QR retoma daqui.

**Por quê:** um defeito raramente vem sozinho. Cor fora do padrão ou desalinhamento
costumam ser da máquina, não da peça — e se for da máquina, conferir o resto do
rolo é perder tempo com peças que vão todas dar errado.

No último item a pergunta não aparece: continuar e parar levam ao mesmo lugar, e
uma pergunta sem consequência só atrasa quem já terminou.

### 7. O fim

Quantos passaram, quantos não, e a metragem boa. Se sobrou item pendente, o botão
de fechar não aparece — e a tela diz quantos faltam.

**Por quê:** fechar o pedido é o único ato desta tela que muda a vida de outra
gente — é ele que tira a produção da lista de quem está esperando. Um ato desses se
aperta, não acontece.

Ele já foi automático, e estava errado porque *não aparecia nada*: quem terminava
via o resumo e mais nada, sem saber se aquilo tinha virado alguma coisa do outro
lado.

Pedido com item pendente não fecha. Fechado, ele sumiria da tela de Pedidos como se
estivesse resolvido — escondendo trabalho que ninguém fez.

---

## Pontos — duas portas

### As duas áreas

Bater ponto ocupa dois terços da tela, em verde. Cadastrar rosto é um cartão ao
lado.

**Por quê:** bater ponto acontece quatro vezes por dia para cada pessoa; cadastrar
rosto, uma vez na vida. Dar o mesmo peso visual às duas faria a fila da manhã parar
para escolher entre coisas igualmente importantes — quando só uma delas importa
naquele momento.

### Bater ponto

A pessoa para na frente, aperta, e a foto sobe. Em três segundos a tela mostra o
nome. **Quem decide que batida é** — entrada, saída para o almoço, volta, saída — é
o servidor, pelo que já foi batido no dia. Ninguém deveria escolher "estou voltando
do almoço" numa tela com oito pessoas esperando atrás.

**Por quê:** o botão existe de propósito. A tentação é bater sozinho — achou rosto,
gravou —, e não serve: este aparelho fica em pé na calandra e passa gente na frente
dele o dia inteiro, levando rolo, indo ao banheiro, conversando. Sem o botão, o
ponto de todo mundo seria batido várias vezes por dia por acidente.

### A confirmação

O nome em corpo enorme, a batida e a hora abaixo. Volta sozinha à entrada do app em
quatro segundos.

**Por quê:** a pergunta que a pessoa faz aqui é "foi o *meu* ponto?", e ela pergunta
isso de longe, já andando. Quatro segundos é o tempo de ler um nome e uma hora e ter
certeza; menos, quem estava guardando o crachá perde a confirmação; mais, a fila
espera por nada.

### A lista de nomes — *quando o rosto falha*

A batida sai igual pela lista, e o servidor grava a origem — quem confere depois vê
o que foi rosto e o que foi na unha.

**Por quê:** **"não te reconheci" não é erro: é a porta para esta tela.** Nenhum
reconhecimento acerta sempre — boné, barba nova, luz de frente, alguém que ainda não
cadastrou. Se a única saída fosse o rosto, a primeira falha deixaria uma pessoa sem
bater o ponto, e um relógio de ponto que às vezes não deixa bater é um relógio de
ponto quebrado.

"O servidor caiu" leva a outro lugar. Confundir os dois faria a pessoa insistir na
foto quando o caminho era escolher o nome.

### Cadastrar rosto

Escolhe-se a pessoa na mesma lista de nomes, e aí a câmera abre com o nome dela no
topo. Deu certo, a tela conta quantos rostos já foram e **sugere outro ângulo**
enquanto forem menos de três. Foto recusada mostra **a frase do servidor** — "não
achei nenhum rosto" e "achei 2 rostos" pedem coisas diferentes de quem está na
frente da câmera.

**Por quê:** um rosto de frente não é o mesmo de lado nem com boné, e basta parecer
com *um* deles. Quem cadastra uma foto só descobre isso meses depois, como "o
sistema nunca me reconhece".

**O terminal não cria pessoa.** Isso exige nome completo, matrícula e teclado — e
nome de gente digitado com o dedo, de pé, vira um "Jsoe" que ninguém conserta
depois. Criar fica no computador; aqui se tira a foto, que é o que só o terminal
pode fazer, no lugar onde as pessoas estão.

---

## Ajustes, descanso e sobre

### Ajustes

A rede aparece numa **lista do que está no ar** — toca-se no nome em vez de
digitá-lo. Senha em código obrigaria recompilar para trocar de roteador, e numa
gráfica quem troca o roteador não tem compilador.

O volume da voz **fala uma frase de prova ao soltar o controle**: arrastar um volume
sem ouvir nada é adivinhar.

O ganho do microfone mostra o número e *não chega ao codec*. O microfone existe e
funciona, mas nada no sistema o escuta ainda — ligar o controle a um microfone que
ninguém lê seria um botão que mexe em nada.

### O descanso — *três minutos sem um toque*

A tela vira um relógio digital de parede. Um toque em qualquer lugar volta à tela
inicial — a tela inteira é o botão.

**Por quê:** não é protetor de tela, LCD não queima imagem parada. É o que o
aparelho *é* quando ninguém precisa dele: ele fica em pé na calandra o dia inteiro,
e na maior parte desse dia ninguém está mexendo nele. Três cartões parados
desperdiçam a única tela grande do galpão.

Os dígitos são **desenhados**, não escritos: sete segmentos, como no relógio de
cabeceira. Fonte tem teto de tamanho e custa flash por tamanho; barra desenhada não
tem teto e sai nítida em qualquer escala. Os dois pontos piscam, e isso faz
trabalho: de longe, um mostrador parado e um aparelho travado são a mesma imagem.

### O sobre

Versão, data da compilação, placa e chip, rede e servidor, memória livre e tempo de
pé.

**Por quê:** não é vitrine, é o que alguém lê **por telefone** quando o terminal
está estranho. Cada linha responde a uma pergunta que já foi feita.

**O maior bloco livre aparece ao lado do total**, e os dois juntos contam o que
nenhum conta sozinho: a câmera falhou um dia inteiro com 94 KB de RAM interna livre,
porque o maior pedaço contínuo era de 31 KB e a pilha da tarefa precisava de 32.

---

### A ajuda — *o círculo `?` na tela inicial*

Nove sintomas, e a resposta abre embaixo do que se tocar. As entradas são **o
que a pessoa vê** — "a câmera não abriu", "não te reconheci" — e repetem, palavra
por palavra, as frases que as outras telas mostram.

**Por quê:** tudo isto também está aqui neste documento, e não adianta. Quem está
na calandra às sete da manhã, com a câmera não abrindo e a fila esperando, não vai
abrir um arquivo num computador de outra sala. A ajuda tem de estar onde o
problema está.

Ela fica *ao lado* do Sobre, e não dentro dele: são duas perguntas de duas pessoas
diferentes — "que aparelho é este" é quem liga do escritório, "o que está
acontecendo" é quem está com o problema na frente. E essa é a urgente.

### A lista de pessoas

Quem está cadastrado, pela terceira porta do app de Pontos. **Os nomes não
respondem ao toque** nesta tela: botão que não faz nada é pior que rótulo — a
pessoa aperta, espera, aperta de novo e conclui que o aparelho travou.

O terminal **não apaga cadastro**. Fazer isso no chão de fábrica, sem senha e sem
confirmação de quem é, é risco desproporcional; no computador existe, com uma
caixa dizendo quantas batidas vão junto.

---

## Quando alguma coisa não vai

| O que aparece | O que é, e o que fazer |
|---|---|
| "a câmera não abriu" com um código | O código é o motivo real. `ESP_ERR_NO_MEM` é falta de memória, não cabo solto. A tela costumava dizer "câmera não encontrada" para tudo, o que mandava conferir o cabo de uma câmera ligada e funcionando. |
| "procurando a câmera…" por cima do vídeo | Ela leva uns 4 s para se apresentar no USB depois que a placa liga. O terminal insiste sozinho; não precisa sair e voltar. |
| "a câmera caiu — reconectando" | Três segundos sem quadro nenhum. O terminal reergue a transmissão sozinho. Se insistir, é alimentação: teste baixando o brilho em Ajustes. |
| "este QR não é de uma lista de produção" | O código é válido, mas é de OS (`O…`) ou de um trabalho avulso (`R…`). Use o QR grande do rodapé da folha de produção. |
| "não te reconheci" | Não é erro. Escolha o nome na lista que aparece — a batida sai igual. Se acontecer sempre com a mesma pessoa, cadastre mais dois ângulos do rosto dela. |
| "achei 2 rostos nesta foto" | Alguém passou atrás. Tire outra com uma pessoa só: guardar o vetor errado no nome de alguém é o defeito mais caro daqui. |
| Relógio em `--:--`, rede em âmbar | Sem rede. O texto ao lado do símbolo diz o motivo. Produção e Pontos param: os dois dependem do servidor. |
| "sem servidor configurado" | O endereço do Optmize não está gravado na placa. Ele fica na NVS e se ajusta em Ajustes. |

---

## O que o terminal não faz

De propósito, e vale saber antes de procurar.

- **Não guarda nada.** Tudo vem do Optmize e volta para ele — batidas, marcas de
  conferência, rostos. Desligar o terminal não perde nada; trocar de terminal não
  exige cadastro novo.
- **Não reconhece rosto.** A comparação é *no servidor*. Reconhecer na placa
  significaria regravar todas as placas para melhorar o reconhecimento e manter
  cadastro sincronizado entre elas.
- **Não sintetiza voz.** O servidor fala com a voz do Windows, a placa só toca.
  Mudar o que se fala é uma linha lá, não uma regravação de cada terminal.
- **Não cria pessoa.** Cadastro de funcionário é na tela de Funcionários do
  computador, onde há teclado de verdade. Aqui se tira a foto.
- **Não ouve.** O microfone existe e funciona, e nada o escuta ainda. É o caminho de
  um assistente de voz, e ele precisa de reconhecimento de fala no servidor antes de
  existir aqui.
- **Pendente:** a lista de motivos de reprovação ainda está compilada dentro do
  firmware. A rota que a serve já existe no servidor; enquanto a placa não a ler,
  mudar um motivo exige regravar cada terminal.
