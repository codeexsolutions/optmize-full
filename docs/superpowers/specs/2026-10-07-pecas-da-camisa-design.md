# As peças da camisa — o mockup vira a arte retangular de cada peça

Data: 2026-10-07 · Estado: design aprovado em conversa, parte por parte; falta
a revisão desta spec escrita. Branch: `Guilherme` (a pessoa pediu para ficar
na mesma branch do Extrator).

## Por que

O primeiro teste do Extrator com um mockup de verdade (frente e costas de uma
camisa de sublimação total, numa foto só) mostrou o que ele faz e o que falta.
Ele **separa** bem cada peça (uma caixa em volta da frente acha a camisa
inteira; a manga sai limpa com uma caixa só nela), mas devolve **a silhueta da
camisa sem fundo**, com o decote, as cavas e a sombra do mockup.

O que a fábrica precisa é a arte **como ela foi desenhada antes de virar
camisa**: um retângulo cheio, de ponta a ponta, para a frente, outro para as
costas e um para cada manga — o mesmo retângulo que sai do Corel e que o
programa já sabe encaixar no molde (`src/motores/arteMolde.js`). Hoje alguém
redesenha isso no Corel olhando o mockup.

## O que foi decidido em conversa

- **A saída vai para os dois lugares:** baixar o PNG/PDF retangular de cada
  peça, e "mandar para o molde" — os retângulos viram a Estampa de um molde e
  seguem o caminho de sempre até o Encaixe.
- **A medida do retângulo é digitada** pelo operador: largura × altura em cm,
  para cada peça (frente e costas começam iguais).
- **Proporção diferente da foto: manter a proporção e inventar o que falta.**
  A arte da foto entra centralizada, cobrindo a largura, **sem deformar**; o que
  sobra (faixas em cima/embaixo, decote, cavas, o que fica fora da silhueta) é
  preenchido pela continuação da arte. Rosto e letra nunca esticam. O operador
  pode ajustar escala e posição antes de baixar.
- **Manga: uma por lado, juntando as duas vistas.** Saem dois retângulos
  (manga esquerda, manga direita); em cada um, a metade da frente vem da vista
  da frente e a de trás vem da vista das costas. No mockup do teste as mangas
  são diferentes (estrela de um lado, bandeira atrás), então espelhar uma só
  perderia a arte.
- **Tirar a sombra do mockup:** o branco da camisa volta a ser branco; as
  dobras e o escurecido das laterais não vão para o tecido.
- **O preenchimento é uma rede local: LaMa.** Escolhida contra o PatchMatch
  (algoritmo clássico: repete padrão e deixa costura em buraco grande) e contra
  a difusão local (minutos por peça na CPU, vários GB). PatchMatch fica como
  reserva só se a medição mostrar que a LaMa não roda bem nesta máquina.
- **Tudo no computador**, como o resto do Extrator: sem nuvem, sem custo por
  imagem.

A verdade dita em voz alta: o decote, as cavas e o que está fora da silhueta
**não existem na foto** — essa parte é inventada. Como o molde corta quase
tudo isso (decote, cava e margem caem fora do contorno da peça), o inventado só
precisa ser convincente, não exato.

## O que o programa já tem

- **O Extrator** (branch `Guilherme`, até 9343b5f): a foto de trabalho de
  2048 px, a rede de recorte por clique e caixa no servidor
  (`servidor/extrator-rede.js`, MobileSAM), `perspectiva.js` (endireitar pelos
  quatro cantos), `recorte.js` (borda limpa), `tamanhoDaSaida` (4K ou cm a
  300 dpi, teto de 80 MP), a ampliação Real-ESRGAN no servidor com fila,
  andamento e cancelar (`servidor/extrator-ampliar.js`), o ZIP com `fflate`.
- **A Estampa dos Moldes:** um jogo de artes guardado com o molde, uma por
  **papel** da peça ("frente", "costas", "manga direita"…). A imagem sobe em
  binário por `POST /api/moldes/:id/artes/imagem?papel=…` e o jogo é criado por
  `POST /api/moldes/:id/artes` (`src/api/moldes.ts`). O `arteMolde.js` ajusta a
  arte à peça em cm em cada tamanho e recorta pelo contorno.
- **O `npm run modelos`** baixa cada rede com URL fixada num commit, tamanho e
  sha256 conferidos, para `servidor/modelos/` (fora do git).

## Como o operador usa

Na tela do Extrator, um modo novo, **"Peças da camisa"**, ao lado do recorte
de elementos.

1. Abre a foto do mockup. Frente e costas podem estar na mesma foto (como a do
   teste) ou em duas fotos.
2. **Marca cada peça com uma caixa**, na ordem que a tela sugere: frente,
   costas, manga esquerda (vista da frente), manga esquerda (vista das costas),
   manga direita (vista da frente), manga direita (vista das costas). Os cliques
   de incluir e excluir corrigem, como no Extrator (no teste, as costas só
   vieram inteiras com um clique de incluir no homem de terno).
3. **Digita a medida** de cada retângulo em cm.
4. O sistema **monta os quatro retângulos**: endireita, separa o corpo das
   mangas, tira a sombra, encaixa a arte sem deformar e inventa o que falta.
5. **Prévia** de cada retângulo, com a área inventada destacada quando o
   operador quiser ver; escala e posição ajustáveis (arrastar e zoom), e o
   preenchimento refeito ao soltar.
6. **Saída:** PNG (ou PDF) de cada peça a 300 dpi na medida digitada; o ZIP com
   os quatro; e **"Mandar para o molde"**: o operador escolhe o molde, e os
   quatro retângulos viram uma Estampa nova, cada um no seu papel.

## As peças do sistema

Seguindo o padrão do Extrator: conta pura nos motores, rede no servidor, tela
em React.

### Servidor

- **`servidor/extrator-preencher.js`** (novo): a LaMa no `onnxruntime-node`.
  Recebe a imagem e a máscara do que inventar e devolve a imagem preenchida.
  Roda em 512 px; buraco que não cabe vai em ladrilhos com sobreposição.
  Usa a mesma fila, o mesmo cancelar e o mesmo andamento da ampliação.
- **Rota `POST /api/extrator/preencher`** em `servidor/extrator-api.js`.
- **O limite da fila** (pendente da revisão final do Extrator) entra junto:
  no máximo 4 trabalhos esperando, o resto recebe 429 com
  `{ error: "Já há trabalhos demais na fila; espere um terminar.", codigo: "fila-cheia" }`,
  a varredura de 30 min marca `cancelado`, e o corpo do `/ampliar` cai de
  400 MB para 160 MB (40 MP × 4 bytes).
- **A LaMa no `npm run modelos`**: URL fixada num commit, tamanho e sha256.

### Motores (conta pura, testável sem rede)

**`src/motores/pecasDaCamisa.js`**:

- **Corpo sem manga:** a máscara da frente (ou das costas) menos as máscaras
  das mangas da mesma vista; a linha da cava é a divisa.
- **A manga juntada:** a metade da vista da frente e a metade da vista das
  costas, espelhada, num retângulo só, com a costura do meio marcada na máscara
  para o preenchimento suavizar.
- **O encaixe no retângulo:** dada a medida em cm e a peça, devolve a escala
  (sem deformar, cobrindo a largura), a posição e a **máscara do que falta**
  (fora da silhueta + faixas).
- **A sombra:** estima a luz pelo que deveria ser branco (pixel claro e pouco
  saturado), suaviza num campo de luz e divide; devolve a imagem clareada.

Reaproveitados sem mudar: `perspectiva.js`, `recorte.js`, `tamanhoDaSaida`, e o
Real-ESRGAN para chegar ao tamanho final.

### Tela

- **`src/telas/extrator/PecasDaCamisa.tsx`:** o modo novo — o passo a passo das
  caixas, as medidas, as prévias, o ajuste de escala e posição.
- **`src/telas/extrator/paraOMolde.ts`:** cria a Estampa no molde escolhido,
  com os papéis "frente", "costas", "manga esquerda" e "manga direita".

## O caminho dos dados (uma peça)

1. A tela já tem a foto de trabalho (2048 px) e a leitura da rede de recorte no
   servidor; a caixa da peça vira a máscara, como no Extrator.
2. Na tela, `pecasDaCamisa.js`: corpo = peça − mangas; endireita; tira a
   sombra; calcula o encaixe na medida digitada e a máscara do que falta.
3. A tela manda ao servidor a imagem montada (a arte já posicionada no
   retângulo, até 2048 px no lado maior) e a máscara; a LaMa preenche.
4. Se o retângulo final a 300 dpi for maior que a imagem preenchida (quase
   sempre), o Real-ESRGAN amplia, com andamento e cancelar.
5. A arte original (o que não foi inventado) é colada de volta por cima, na
   resolução mais alta disponível — a LaMa só mexe no buraco.

## Falhas

Mensagens ao operador em português; falha do servidor volta como
`{ error, codigo }`.

- **LaMa não instalada:** o modo avisa "rode `npm run modelos`" e ainda deixa
  baixar o retângulo com o buraco transparente.
- **Peça faltando** (por exemplo, a manga na vista das costas): a manga sai só
  com a metade da frente, espelhada, e a tela avisa.
- **Manga que não encosta no corpo:** a divisa não é achada; a tela mostra o
  corpo com a manga dentro e pede uma caixa melhor.
- **Buraco grande demais** (mais de 50% do retângulo): avisa "boa parte desta
  arte vai ser inventada" antes de seguir.
- **Retângulo acima de 80 MP:** corta com aviso, como o PNG de hoje.

## Testes

- **Bancada de motor, sem rede:** camisa sintética com corpo, mangas, decote e
  uma sombra em degradê conhecida. Confere a divisa corpo/manga, a máscara do
  que falta (área esperada ±2%), o encaixe sem deformar (proporção ±0,5%), a
  sombra (o branco volta a mais de 245) e a costura da manga juntada.
- **Bancada da rede:** a LaMa baixada preenche um buraco num degradê conhecido
  sem costura (diferença na borda abaixo de um limite fixado na medição), e
  mede o tempo nesta máquina. **A primeira tarefa do plano é essa medição**,
  como foi a da rede de recorte: se a LaMa não couber (tempo ou qualidade), o
  plano troca para o PatchMatch antes de seguir.
- **Bancada de tela:** o mockup do teste (guardado em `D:\arte\extrator`, fora
  do git, como as outras fotos reais) vira caso: quatro caixas, medidas
  digitadas, quatro PNGs sem transparência, na medida certa a 300 dpi, e a
  Estampa criada num molde de teste com os quatro papéis.

## Fora do escopo

- Achar as peças sozinho, sem o operador marcar.
- Desentortar dobra de tecido de verdade (foto de camisa vestida); o modo é
  pensado para mockup e camisa estendida. A dobra continua na arte.
- Refazer letra ou rosto cortados pela borda: o inventado é continuação, não
  redesenho.
- Golas, punhos, bolsos e outras peças além de frente, costas e duas mangas.
