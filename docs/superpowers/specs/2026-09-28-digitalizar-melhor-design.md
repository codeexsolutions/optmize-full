# Digitalizar melhor — o traço limpo, e o editor que mexe em vários nós

Data: 2026-09-28 · Estado: design aprovado em conversa, aguardando revisão da spec

Esta é a parte **A+B** de quatro. As outras têm spec própria, depois desta:

- **A. Peças recortadas mais limpas** (esta) — o traço da foto sai com as
  retas retas, os cantos no lugar, as curvas suaves e poucos nós; a faixa da
  mesa deixa de virar peça.
- **B. Editar vários nós de uma vez** (esta) — selecionar em grupo, mover,
  apagar, **Virar curva**, **Virar reta**; e **girar a peça** na Montagem.
- **C. Desenho a lápis na folha** — seguir as linhas desenhadas dentro de uma
  folha. Começa por um teste de viabilidade nas fotos "plus sized".
- **D. Graduação** — tamanho base, pontos clicados com quanto andam de um
  tamanho para o outro (medida ou porcentagem), tamanhos gerados. O que foi
  dito na conversa está no fim desta spec, para não se perder.

## Por que

A fábrica relatou as quatro falhas nas partes curvas: **nós demais**, **curva
virando reta/canto**, **canto virando curva** e **traço ondulado**. Passadas
as fotos de `D:\arte\photo da laser` pelo Digitalizar (2026-09-28), a raiz
apareceu:

| Foto | O que saiu | Por quê |
|---|---|---|
| `NAILSON/2 BANDA.bmp` | 1 peça, **39 nós**, ondinhas no lado reto | uma peça de ~8 lados; a textura perfurada e a sombra da beira do papel viram dentes no contorno, e o ajuste de curvas gasta nós seguindo o ruído |
| `NAILSON/segundo molde.bmp` | 4 peças (41, 8, 16, 6 nós), serrinha na borda de baixo da peça 1 | o mesmo |
| `NAILSON/PEDAços.bmp` | **as duas peças ignoradas**; contornou a faixa clara da mesa (140 nós) | a faixa virou a "maior peça", e as peças reais ficaram abaixo do mínimo de 8% da maior e foram descartadas como sujeira |
| `photo da laser/0X plus sized.bmp` | contorna a folha inteira | é desenho a lápis numa folha — parte C, fora desta spec |

Duas causas no código (`src/motores/moldeDaImagem.js`):

1. **A máscara é um limiar só para a foto inteira** (Otsu), com a polaridade
   decidida pela borda da imagem. A faixa preta do quadro e a faixa clara da
   beira da mesa puxam esse limiar e essa polaridade.
2. **A borda sai de uma grade de 800 células** alisada. O ajuste de curvas
   (`ajusteDeCurvas.js`) recebe os dentes da grade e da textura como se fossem
   forma, com tolerâncias em células, não em milímetros.

## O que fica igual

- **O fluxo do Digitalizar:** foto → medida → "Continuar para a montagem".
- **O formato dos nós:** `{ x, y, entrada, saida, canto, retaDepois }`. Editor,
  Montagem, PDF, SVG e Encaixe não mudam por causa da parte A.
- **Peça que encosta na borda da foto continua valendo**, com o aviso de hoje
  (as peças de corpo da `Nova pasta` saem cortadas embaixo).
- **O controle "Nós por curva"** continua, com o mesmo sentido (mais ou menos
  fiel), agora sobre a borda refinada.

Fora do escopo: correção de perspectiva (foto tirada de lado), separar peças
encostadas uma na outra, desenho a lápis na folha (parte C).

## Parte A — o motor novo das peças recortadas

O caminho continua **foto → máscara → contorno → nós**. Cada etapa nova é uma
função pura em `src/motores/`, com bancada própria, e o `riscosDosPixels` as
encadeia.

### A1. Máscara pela cor da mesa

- A cor da mesa é estimada pelas células mais comuns da foto (a esteira é a
  maior área). Peça é o que se afasta dessa cor por **distância de cor** (cor
  e brilho), não só por brilho.
- Antes de tudo, a **faixa preta do quadro** (linhas e colunas quase pretas
  coladas na borda) é marcada como "fora da foto" e não conta para nada.
- Sem conseguir estimar a mesa (ex.: fundo liso sem moda clara), a etapa cai
  no limiar de Otsu de hoje e avisa.

### A2. Faixas não são peça

- Mancha **fina e comprida, colada a uma borda e que corre ao longo dela** (a
  faixa do filme, a beira da mesa) sai antes da seleção. Critério: encosta em
  uma borda, a razão comprimento/espessura passa de 12 e o comprimento cobre
  mais de 60% daquela borda.
- É diferente de peça cortada pelo quadro, que encosta mas não corre ao longo
  da borda — essa continua, com o aviso.
- O mínimo "8% da maior peça" passa a contar **depois** de tirar as faixas.
- A mensagem de descarte separa **"faixas da mesa"** de **"sujeira"**.

### A3. Borda refinada na foto cheia

- O contorno da grade vira só um guia. Para cada ponto, a busca anda ao longo
  da normal, **na foto em resolução original**, até ±(2 células da grade), e
  fica no ponto de maior contraste de cor entre dentro e fora.
- Sem contraste suficiente num ponto, fica o ponto da grade.
- O Digitalizar passa ao motor os pixels da foto original junto com os da
  grade. Para não pesar, a leitura é só numa faixa em volta do contorno.

### A4. Retas por votação

- Sobre a borda refinada, as retas saem por **RANSAC**: a reta que mais pontos
  apoiam, dentro de uma tolerância e com um comprimento mínimo (valores na
  escala da foto — ver **A6** —, calibrados na bancada).
- Onde duas retas vizinhas se encontram num ângulo, o **canto é o cruzamento
  delas** — a quina sai exata, não arredondada.
- Duas retas quase colineares (diferença < 4°) viram uma só.

### A5. Curvas no que sobra

- Só os trechos entre retas vão para `curvasDoContorno`, que já existe, agora
  em cima da borda refinada.
- A tolerância do ajuste (`erroMaximo`) e as mínimas de quebra são
  recalibradas na bancada para a borda refinada.

### A6. Em que escala ficam as tolerâncias

O Digitalizar só conhece a escala real **depois** da medida, e a forma é
decidida **antes**. Por isso as tolerâncias das etapas A3–A5 ficam na escala
da própria foto — **células da grade**, que tem sempre 800 células no lado
maior —, como hoje, com os valores calibrados na bancada. A medida só muda o
tamanho, nunca a forma. As **metas da bancada** (abaixo) são em milímetros,
porque o gabarito traz a medida da peça.

## Parte B — editar vários nós de uma vez, e girar

A lógica mora em `src/motores/edicaoDeNos.js` (e, para os piques e o fio, em
`src/motores/montagem.js`). O Digitalizar (`src/telas/Digitalizar.tsx`) e a
Mesa da Montagem (`src/telas/montagem/Mesa.tsx`) só ligam os eventos. A
seleção passa de `noAtivo: number | null` para **um conjunto de índices**.

### B1. Selecionar (ferramenta Nós)

- **Clique** num nó: seleciona só ele (como hoje).
- **Shift+clique**: põe ou tira o nó da seleção.
- **Arrastar numa área vazia**: retângulo; o que estiver dentro é selecionado.
  Com Shift, soma à seleção.
- **Ctrl+A**: todos os nós da peça. **Esc**: limpa.
- Alças (entrada/saída) continuam sendo de um nó só: aparecem quando há
  exatamente um nó selecionado.

### B2. Agir em grupo

- **Arrastar** um nó selecionado move todos os selecionados juntos, com as
  alças.
- **Delete/Backspace** apaga todos os selecionados; a peça nunca fica com menos
  de 3 nós (se o pedido deixar menos, não apaga e avisa). Na Montagem, os
  piques dos trechos apagados vão para o trecho que sobra, na mesma regra de
  `apagarNoDaPeca` aplicada nó a nó, do maior índice para o menor.
- Com **2 ou mais** nós selecionados, uma barrinha mostra:
  - **Virar reta** — os nós do meio saem; o trecho do primeiro ao último
    selecionado vira uma reta (`retaDepois: true` no primeiro).
  - **Virar curva** — o trecho do primeiro ao último selecionado vira **uma**
    cúbica ajustada ao desenho atual daquele trecho (achatado e passado ao
    ajuste de Schneider com as tangentes das pontas); os nós das pontas ficam
    onde estão, os do meio saem. Se a cúbica errar mais que 2 mm do desenho
    atual (ex.: há um canto no meio), avisa e não mexe.
  - "Do primeiro ao último" segue o sentido da volta. Seleção com pedaços
    separados: cada sequência contígua é tratada por si. Uma seleção que é a
    volta inteira não vira reta nem curva (avisa).
  - Na Montagem, piques que caíam nos trechos juntados passam para o trecho
    novo, na posição proporcional ao comprimento.
- **Um passo só no Desfazer** para cada ação de grupo (mover, apagar, virar).

### B3. Girar a peça (Montagem)

- No painel da peça: **↺ 90°**, **↻ 90°** e um campo de **ângulo livre** em
  graus (ex.: 3,5) com botão "Girar".
- Gira em volta do centro da caixa da peça: nós e alças, **pontos** (pence,
  bolso) e o **fio** (posição e ângulo) vão juntos; piques acompanham sozinhos
  porque são presos a trecho (`no`, `t`). Depois do giro a peça é
  deslocada para o canto de cima à esquerda da caixa ficar onde estava — a
  peça não pula na tela, e girar 4× 90° devolve a original exata.
- Corte e margem são recalculados como em qualquer mexida; um passo no
  Desfazer.
- Fora do escopo: girar só a seleção, alinhar e distribuir nós, copiar e colar
  nós.

## Testes

### Bancada de fotos (`bancada:digitalizar`, nova)

- 8 fotos das pastas da fábrica: `2 BANDA`, `segundo molde`, `PEDAços`, duas
  da `Nova pasta` (peças cortadas pela borda) e três com curva (cava, gancho,
  gola).
- Um **gabarito** por foto em `bancada/fotos/<nome>.gabarito.json`: quantas
  peças, o contorno certo (ajustado à mão no editor, em pixels da foto
  original) e quais nós são canto. **Os gabaritos são conferidos pela fábrica
  uma vez** antes de valer.
- As **fotos não entram no git** (são grandes e são da fábrica). A bancada lê
  de uma pasta configurável (`OPTMIZE_FOTOS_DA_BANCADA`, padrão
  `D:\arte\photo da laser`) e **pula com aviso** as que não achar — o CI não
  quebra.
- Imprime antes/depois e **falha** se não cumprir:
  - toda peça do gabarito achada, e nenhuma a mais;
  - nós por peça ≤ **1,5×** o gabarito;
  - cada lado reto do gabarito sai como **uma reta só**;
  - cada canto do gabarito sai como canto a menos de **3 mm**;
  - desvio do traço à borda do gabarito: **médio ≤ 1 mm** e **95% dos pontos
    ≤ 2 mm** (um máximo absoluto de 1 mm não é mensurável: a célula da grade
    vale ~1,6 mm e o próprio gabarito tem essa incerteza; hoje o motor fica em
    0,4–0,8 mm de média com pior caso de 3,5–4,7 mm). A conversão usa
    `mmPorCelula` do gabarito (1,6 nas fotos da mesa do laser).

### Casos sintéticos (rodam no CI)

Hoje o CI (`.github/workflows/conferir.yml`) não roda nenhuma bancada da
Montagem (`nos`, `margem`, `montagem`). Esta parte acrescenta um passo que
roda essas três e a sintética nova.


- A1: imagem gerada com mesa texturizada + peça clara + faixa preta no topo.
- A2: faixa clara colada à borda direita some; peça cortada pela borda de
  baixo fica.
- A3: degrau de grade vira borda reta quando a foto cheia tem a borda reta.
- A4: retângulo com dente de sombra sai com 4 retas e 4 cantos no cruzamento.

### Edição (`bancada:nos`, que já existe, ganha)

- mover em grupo desloca exatamente os selecionados, com alças;
- apagar em grupo mantém ≥ 3 nós e remapeia piques como `apagarNoDaPeca`;
- virar reta e virar curva nas pontas certas, em seleção contígua, separada e
  que cruza o nó 0;
- virar curva com canto no meio recusa;
- girar 4× 90° devolve a peça original (nós, pontos, fio), e girar 90° troca
  largura e altura;
- cada ação de grupo é um passo de Desfazer.

## Quando dá errado

- Etapa nova que não se aplica cai no jeito de hoje **naquela etapa** e avisa
  na tela — nunca fica pior que hoje.
- Refino de borda sem contraste num ponto mantém o ponto da grade.
- Virar curva que não cabe em 2 mm, ou seleção que é a volta inteira: avisa e
  não mexe.

## Arquivos

- Novos: `src/motores/mesaDaFoto.js` (A1, A2), `src/motores/bordaRefinada.js`
  (A3), `src/motores/retasDaBorda.js` (A4), `bancada/conferir-digitalizar.mjs`,
  `bancada/fotos/*.gabarito.json`.
- Mudam: `src/motores/moldeDaImagem.js` (encadeia as etapas; tolerâncias em
  mm), `src/motores/ajusteDeCurvas.js` (só os padrões recalibrados — sem mudança
  de algoritmo), `src/motores/edicaoDeNos.js`
  (seleção, mover/apagar/virar em grupo), `src/motores/montagem.js` (piques e
  fio em grupo, girar), `src/telas/Digitalizar.tsx`,
  `src/telas/montagem/Mesa.tsx`, `src/telas/montagem/MesaDeMontagem.tsx`,
  `src/telas/montagem/PainelDaPeca.tsx`, `src/telas/risco/desenhoDeNos.ts`
  (desenho da seleção e do retângulo), `package.json` (script da bancada).

## Parte D — anotado para a spec dela

Como a fábrica descreveu (2026-09-28):

1. Diz **quantos tamanhos** são (ex.: P, M, G, GG) e qual é o **base** (o molde
   montado).
2. **Clica nos pontos** da peça que crescem (ombro, cava, barra…).
3. Em cada ponto informa **quanto ele anda de um tamanho para o outro**, em
   **medida** (ex.: 1 cm para fora, 0,5 cm para baixo) ou em **porcentagem**.
4. O sistema **gera os outros tamanhos** e mostra todos sobrepostos para
   conferir.

Em aberto para a conversa da parte D: regra igual entre todos os saltos ou por
salto; tabela de regras salva para outro molde; o que acontece com piques,
fio e margem nos tamanhos gerados.
