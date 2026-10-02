# Editor estilo Corel — mexer nos pontos como na ferramenta Forma

Data: 2026-09-29 · Estado: design aprovado em conversa, aguardando revisão da spec

Substitui a **parte B** da spec `2026-09-28-digitalizar-melhor-design.md`
("editar vários nós de uma vez, e girar"). A parte A daquela spec — o motor que
tira o traço limpo da foto — continua lá, e é o último trabalho da fila
combinada: medida por peça (feita) → **este editor** → graduação mais fácil →
motor limpo.

## Por que

A fábrica desenha e conserta molde no CorelDRAW. Depois de digitalizar, o traço
ainda sai com imperfeições — nós demais, lado reto ondulado, curva torta —, e
arrumar hoje é um nó de cada vez, com um jeito de mexer que não é o do Corel. O
pedido foi "deixa no estilo corel pra ficar fácil manipulação de pontos". Das
coisas da ferramenta Forma, as quatro escolhidas:

- **selecionar e mover vários** (clique, Shift, retângulo, setas);
- **puxar a curva direto**, sem mexer em alça;
- **a barra com os botões do nó** (a barra de propriedades do Corel);
- **reduzir nós**, com o controle de quanto o desenho pode mudar.

## O que fica igual

- As duas telas que editam risco — **Digitalizar** e **Montagem** — usam o mesmo
  motor (`src/motores/edicaoDeNos.js`) e o mesmo desenho
  (`src/telas/risco/desenhoDeNos.ts`). O editor novo vale igual nas duas.
- As ferramentas da Montagem (Nós, Pique, Ponto, Fio, Graduar): o editor novo é
  a ferramenta **Nós**. A Graduar continua abrindo a regra do nó clicado.
- O formato do nó, com um campo a mais (ver **Dados**).
- O fluxo Digitalizar → Montagem, o PDF, o SVG, a margem de costura e o Encaixe.

Fora do escopo: juntar e quebrar curva (o risco é sempre uma volta fechada),
inverter o sentido, copiar e colar nós, girar só a seleção, distribuir nós,
grade magnética.

## 1. Selecionar (ferramenta Nós)

- **Clique** num nó: seleciona só ele.
- **Shift+clique** num nó: põe ou tira da seleção.
- **Arrastar numa área vazia**: retângulo; os nós dentro dele ficam
  selecionados. Com Shift, somam à seleção. Clique sem arrastar numa área
  vazia (sem Shift) limpa a seleção.
- **Ctrl+A**: todos os nós da peça. **Esc**: limpa.
- A seleção é um **conjunto de índices** da peça que está sendo editada (hoje é
  um nó só, `noAtivo`). No Digitalizar, clicar num nó ou traço de outra peça
  troca a peça e começa uma seleção nova nela. Um desfazer que muda os nós tira
  da seleção o que não existe mais.
- As **alças aparecem em todos os nós selecionados**, como no Corel.
- A barra dos nós mostra o contador: "3 de 41 nós selecionados".

## 2. Mover

- **Arrastar** um nó selecionado leva todos os selecionados juntos, com as
  alças. Arrastar um nó que não está selecionado seleciona só ele e o arrasta
  (como hoje). Shift+clique num nó que não está selecionado o põe na seleção,
  e arrastar em seguida leva todos; Shift+clique num nó selecionado só o tira
  da seleção, sem arrastar.
- **Setas**: 1 mm; **Shift+seta**: 1 cm.
  - Na Montagem, direto em centímetros.
  - No Digitalizar, o risco está em células da grade da foto. Com a peça
    medida (ou pela média — ver a medida por peça), 1 mm vira células pela
    escala da peça. Sem medida nenhuma ainda, a seta anda **1 célula** e a
    Shift+seta, **10**.
- Uma **sequência de setas** — sem outra mexida no meio e com menos de 1
  segundo entre uma tecla e a seguinte — é **um passo só** no Ctrl+Z.
- Enquanto há nó selecionado, as setas não rolam a tela. Dentro de um campo de
  texto, as teclas continuam sendo do campo.

## 3. Os tipos de nó

| Tipo | As duas alças |
|---|---|
| **canto** | soltas: cada uma vai para onde for puxada |
| **suave** | na mesma reta, cada uma com o seu tamanho |
| **simétrico** | na mesma reta e do mesmo tamanho |

- **Arrastar uma alça** respeita o tipo: no canto, só ela anda; no suave, a do
  outro lado gira para ficar na mesma reta e **mantém o tamanho**; no
  simétrico, a do outro lado é o espelho (é o que todo nó de curva faz hoje).
- **Botões Canto / Suave / Simétrico** mudam os nós selecionados:
  - **Suave**: a direção comum é a média das duas (a de saída e a de entrada
    invertida); cada alça mantém o seu tamanho.
  - **Simétrico**: a mesma direção, e o tamanho passa a ser a média dos dois.
  - **Canto**: só marca; as alças ficam onde estão.
- **Nó entre uma reta e uma curva**: a direção é a da reta. Suave e simétrico
  giram a alça do lado curvo para ela, sem mudar o tamanho (o lado reto não tem
  alça). Nó com os **dois lados retos**: o tipo não muda o desenho.
- **Nó antigo, sem o campo novo**: é suave (ou canto, se já era canto). Isso
  muda um detalhe de hoje, de propósito: puxar a alça de um nó de curva deixa de
  mudar o tamanho da alça do outro lado — é o nó suave do Corel.

## 4. Puxar a curva direto

- Com a ferramenta Nós, pegar no traço de um trecho **curvo** — longe dos nós e
  das alças, dentro do raio de pega — e arrastar.
- O ponto pego (no parâmetro `t` do trecho) **acompanha o ponteiro
  exatamente**; os dois nós das pontas ficam parados; só as duas alças daquele
  trecho mudam. O deslocamento se divide entre as duas alças pelo peso de `t`:
  perto de uma ponta, anda mais a alça daquela ponta.
- Ponta **suave** ou **simétrica**: a alça do outro lado daquela ponta gira
  junto (e, no simétrico, acompanha o tamanho), para a curva continuar lisa no
  nó. Ponta de **canto**: a outra alça não se mexe.
- Trecho **reto** não entorta: aparece o aviso "trecho reto: converta em curva
  para dobrar".
- Pegar e soltar sem arrastar não muda nada e não conta no Ctrl+Z (é o que
  deixa os dois cliques no traço continuarem pondo nó). Uma puxada é um passo.

## 5. Converter em linha / em curva

- Valem para os **trechos entre nós selecionados vizinhos** (o trecho cujas duas
  pontas estão selecionadas). Com **um nó só** selecionado, valem para o trecho
  que **chega** nele, como no Corel.
- **Converter em linha**: o trecho fica reto (`retaDepois` no nó que o começa) e
  as alças daquele trecho desabam em cima dos nós. **Os nós ficam no lugar.**
- **Converter em curva**: o trecho reto ganha alças a um terço e a dois terços
  do caminho — a curva nasce igual à reta e só muda quando alguém puxa.
- O botão só acende se há trecho que mude (Linha: algum trecho curvo na
  seleção; Curva: algum reto).

## 6. Pôr e apagar nó

- **Dois cliques no traço**: nó novo ali, sem mudar o desenho (como hoje).
  **Dois cliques num nó**: apaga (como hoje).
- **Botão + (e tecla +)**: um nó no meio (`t = 0,5`) de cada trecho entre
  selecionados vizinhos; com um nó só selecionado, no trecho que chega nele. O
  desenho não muda (de Casteljau, `inserirNoNoTraco`).
- **Apagar** (Delete, Backspace, botão −): tira todos os selecionados.
  - Cada sequência de nós apagados vizinhos vira **um trecho** entre os nós que
    sobram nas pontas, **refeito para ficar o mais perto possível do desenho de
    antes**: o traço antigo daquele pedaço é achatado e ajustado por uma cúbica
    com as tangentes das pontas (o ajuste de Schneider de
    `src/motores/ajusteDeCurvas.js`). Com canto no meio do pedaço apagado, a
    curva o arredonda — é o que apagar aquele nó quer dizer.
  - Se todos os trechos juntados eram retos, o trecho novo é reto.
  - A peça nunca fica com **menos de 3 nós**: o pedido que deixaria menos não
    apaga nada e avisa.
- Com isso, o jeito do Corel de endireitar um lado cheio de nós funciona:
  seleciona os do meio → Delete → Converter em linha.

## 7. Alinhar

- **Alinhar ↔**: os selecionados vão para a mesma altura (`y`). **Alinhar ↕**: a
  mesma coluna (`x`). As alças andam junto com cada nó.
- A referência é o **último nó clicado** (clique ou Shift+clique). Seleção feita
  pelo retângulo ou pelo Ctrl+A: a **média** dos selecionados.
- Precisa de 2 ou mais nós selecionados.

## 8. Reduzir nós

- Vale para os nós **selecionados**; sem seleção, para a **peça inteira**.
- Um controle, "quanto o desenho pode mudar", de **0,2 a 3 mm**, começando em
  **0,5 mm**. Mexer no controle refaz a redução **na hora**, sempre a partir do
  desenho de antes de mexer no controle (não acumula). **Soltar o controle** é um
  passo no Ctrl+Z. O contador mostra "41 → 12 nós".
- **Nunca saem** (são âncoras): nó de canto; nó na ponta de um trecho reto; nó
  com regra de graduação (Montagem); nó fora da seleção.
- Entre duas âncoras vizinhas, o pedaço curvo é achatado e ajustado de novo com
  o mínimo de nós que fica dentro da folga (o mesmo ajuste de Schneider). O
  traço novo nunca se afasta do de antes mais que a folga.
- No Digitalizar, a folga vira células pela escala da peça; **sem medida
  nenhuma**, o controle vai de 0,2 a 3 células e mostra "pouco ↔ muito" em vez de
  milímetros.
- Nada a tirar dentro da folga: "nada a reduzir com essa folga — aumente o
  controle".

## 9. A barra dos nós

- Um componente só (`src/telas/risco/BarraDosNos.tsx`), usado pelas duas telas.
- **Montagem**: embaixo da barra de ferramentas, com a ferramenta Nós ligada.
  **Digitalizar**: no alto da caixa "Ajustar o traço à mão", no lugar dos botões
  "lado que chega / lado que sai: reta ou curva" de hoje.
- Grupos, como no Corel:
  **[+] [−] · [Linha] [Curva] · [Canto] [Suave] [Simétrico] · [Alinhar ↔]
  [Alinhar ↕] · [Reduzir nós + controle]** e, na Montagem,
  **[↺ 90°] [↻ 90°] [ângulo] [Girar]**.
- Cada botão só acende quando serve para a seleção; a dica diz o que faz e o
  atalho. Os botões de tipo aparecem apertados quando todos os selecionados são
  daquele tipo. O contador de nós selecionados fica na barra.

## 10. Girar a peça (Montagem)

Como a parte B3 da spec antiga, com as regras da graduação:

- **↺ 90°**, **↻ 90°** e um campo de **ângulo livre** em graus (ex.: 3,5) com o
  botão "Girar".
- Gira em volta do centro da caixa da peça: nós e alças, **pontos** (pence,
  bolso) e o **fio** (posição e ângulo) vão juntos; os piques acompanham sozinhos
  (são presos a trecho). As **regras da graduação** giram pelo mesmo ângulo: o
  `passo` do salto igual e cada `deslocamentos[t]` do por tamanho.
- Depois do giro, a peça é deslocada para o canto de cima à esquerda da caixa
  ficar onde estava — a peça não pula na tela, e girar 4× 90° devolve a
  original exata.
- Corte e margem são recalculados como em qualquer mexida; um passo no Ctrl+Z.

## 11. Atalhos

| Tecla | Faz |
|---|---|
| Delete / Backspace | apaga os nós selecionados |
| + | põe nó (ver 6) |
| Ctrl+A | seleciona todos os nós da peça |
| Esc | limpa a seleção |
| setas / Shift+setas | move 1 mm / 1 cm (ver 2) |
| Ctrl+Z | desfaz |

Dentro de um campo de texto, as teclas são do campo.

## 12. Na Montagem: o que acompanha os nós

- **Piques** (presos a `no` + `t`):
  - mover, puxar, converter, tipo, alinhar: mesmo `no` e `t` — o pique anda com
    a curva;
  - pôr nó: o pique do trecho partido vai para a metade em que caía, com o `t`
    reescalado (como `inserirNoNaPeca`);
  - apagar e reduzir: o pique vai para o trecho novo, na mesma posição
    proporcional ao comprimento do pedaço juntado.
- **Fio e pontos**: não mudam (só no Girar).
- **Regras da graduação** (por nó):
  - pôr nó: `graduacaoAoInserirNo`;
  - apagar: `graduacaoAoApagarNo` para cada nó apagado, do maior índice para o
    menor — regra de nó apagado sai e conta em `perdidos` (o aviso "a graduação
    perdeu N pontos");
  - reduzir: não tira nó com regra; os índices dos que ficam andam;
  - girar: os vetores giram (ver 10).
- Tamanho gerado mexido à mão: continua marcando "graduação ajustada à mão".

## 13. Dados

- O nó: `{ x, y, entrada, saida, canto?, retaDepois?, simetrico? }`. O campo
  **`simetrico`** é novo e só vale com `canto` falso.
- O servidor (`lerNos`, em `servidor/moldes-pecas.js`) guarda `simetrico`; o nó
  que chega sem ele volta sem ele (é suave).
- PDF, SVG, Encaixe e a margem de costura não leem o tipo do nó.

## 14. Desfazer

Um passo por ação: um arrasto de nós, uma puxada de curva, uma sequência de
setas, cada botão da barra, soltar o controle do Reduzir, cada giro. Mudar a
seleção não é passo.

## Testes

### `bancada:nos` (`bancada/conferir-edicao-de-nos.mjs`, já existe; entra no CI)

- seleção pelo retângulo: quais índices entram, e o Shift somando;
- mover em grupo e setas: só os selecionados andam, com as alças;
- tipos: suave alinha e mantém os tamanhos; simétrico iguala; arrastar alça
  respeita o tipo; nó entre reta e curva; nó antigo sem o campo é suave;
- puxar trecho: o ponto em `t` acompanha o ponteiro (erro < 1e-9); as pontas
  ficam paradas; a ponta suave continua alinhada; trecho reto recusado;
- converter em linha e em curva: os nós no lugar; a curva nasce igual à reta;
  um nó só vale para o trecho que chega;
- pôr nó no meio: o desenho não muda (amostras ao longo do trecho);
- apagar com o trecho refeito: o afastamento do desenho de antes é medido; reta
  continua reta; nunca menos de 3 nós;
- alinhar: pelo último clicado e pela média;
- reduzir: menos nós; afastamento máximo ≤ folga; âncoras ficam; a mesma folga
  a partir do mesmo desenho dá o mesmo resultado (não acumula).

### `bancada:montagem`

- piques acompanham apagar, reduzir, pôr e girar;
- regras da graduação acompanham apagar (com `perdidos`), reduzir (nó com regra
  fica), pôr e girar (vetores girados);
- girar 4× 90° devolve a peça: nós, pontos, fio e regras.

### `bancada:moldes-pecas`

- `simetrico` é guardado; o nó sem o campo volta sem ele.

### No navegador, nas duas telas

Retângulo e Shift, setas (e o passo único no Ctrl+Z), puxar a curva, converter
em linha e em curva, os três tipos, apagar com o trecho refeito, alinhar,
reduzir com o controle, Ctrl+Z e F5 (o tipo do nó volta igual).

## Quando dá errado

- Botão que não serve para a seleção fica apagado.
- Apagar que deixaria menos de 3 nós: não apaga, avisa.
- Reduzir sem o que tirar dentro da folga: avisa.
- Puxar trecho reto: avisa.

## Arquivos

- **Mudam**: `src/motores/edicaoDeNos.js` (seleção, mover em grupo, tipos,
  puxar trecho, converter, pôr e apagar em grupo, alinhar, reduzir),
  `src/motores/ajusteDeCurvas.js` (exporta o ajuste de um trecho aberto entre
  duas tangentes, que hoje é interno), `src/motores/montagem.js` (piques e regras
  nas ações de grupo; girar), `src/telas/risco/desenhoDeNos.ts` (seleção, alças
  dos selecionados, retângulo), `src/telas/Digitalizar.tsx`,
  `src/telas/montagem/Mesa.tsx`, `src/telas/montagem/MesaDeMontagem.tsx` (o girar vai na barra dos nós,
  ver §9), `servidor/moldes-pecas.js`
  (`simetrico`), `src/api/moldes.ts` (o tipo do nó),
  `.github/workflows/conferir.yml` (`bancada:nos` no CI).
- **Novo**: `src/telas/risco/BarraDosNos.tsx`.
- **Bancadas**: `bancada/conferir-edicao-de-nos.mjs`,
  `bancada/conferir-montagem.mjs`, `bancada/conferir-moldes-pecas.cjs`.

## Branch

`feature/editor-corel`, saindo da `feature/importar-audaces` (que já tem a
graduação: ela mexeu nos mesmos arquivos da Mesa e do desenho dos nós). A spec e
o plano antigos do Digitalizar melhor vieram junto, com a nota de que a parte B
foi substituída por esta.
