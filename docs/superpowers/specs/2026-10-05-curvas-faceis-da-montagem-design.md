# Curvas fáceis na Montagem — o nó liso automático, os puxadores, a barra e a mesa

Data: 2026-10-05 · Estado: design aprovado em conversa (partes 1 a 4); a pessoa
pediu para seguir até o fim sem parar para revisão.

## Por que

O editor estilo Corel (spec de 2026-09-29) entrou, e mesmo assim mexer nas
curvas e nos pontos da Montagem continua difícil. A pessoa marcou os quatro
problemas: **acertar o ponto**, **fazer a curva certa**, **barra confusa** e
**pouco espaço / zoom**. Sobre a curva, especificamente:

- **fica um bico no ponto** — puxo a curva e no nó aparece uma quina onde
  deveria ser liso (cava, gola, gancho);
- queria **arrastar o ponto e a curva seguir**, lisa, sem mexer em alça;
- **as alças são difíceis** de achar e de controlar;
- e, dito depois: "uma forma muito mais simplificada e fácil de usar as curvas,
  podendo fazer curvas **diferentes dos lados** — a curva de agora só serve pra
  fazer uma curva única". Confirmado com desenho: é **cada lado do ponto com a
  sua curva** (uma fechada, outra aberta), com o ponto continuando liso.

O que o código mostrou:

- o nó tem 3,6 px de raio e a pega é de 10 px; a peça é ajustada só pela
  largura da mesa, e a mesa começa abaixo de três faixas de barra;
- o nó entre uma reta e uma curva nasce **canto** no Digitalizar; puxar a curva
  ali gira só a alça do lado curvo, e aparece o bico;
- "puxar a curva" empurra as duas alças do trecho para o mesmo lado, e para ter
  cada lado do ponto do seu jeito é preciso mexer na alça à mão.

Combinado em conversa, o caminho **A**: o nó de curva vira **automático** — a
curva passa por ele sempre lisa e o sistema faz as alças —, e cada lado ganha
um puxador grande. As alças do Corel ficam para o ajuste fino.

## O que fica igual

- As alças continuam gravadas em cada nó (`entrada`, `saida`): o PDF, o SVG, o
  Encaixe, a margem de costura e o "Juntar" leem o que sempre leram.
- O Digitalizar e a Montagem continuam usando o mesmo motor
  (`motores/edicaoDeNos.js`), o mesmo gancho (`telas/risco/useEditorDeNos.ts`)
  e o mesmo desenho (`telas/risco/desenhoDeNos.ts`).
- Seleção (clique, Shift, retângulo, Ctrl+A, Esc), setas, pôr e apagar nó,
  reta/curva, alinhar, reduzir e girar continuam existindo.
- Molde que já existe **não muda de forma** ao abrir (ver 1.4).

Fora deste trabalho: a graduação por contorno e os arquivos com contorno na tela
de Moldes (as próximas frentes); juntar e quebrar curva; o zoom e a vista do
Digitalizar (ele já tem os seus).

## 1. O nó liso automático

### 1.1 Os dois tipos que a pessoa vê

- **Liso** — a curva passa pelo ponto sem quebra.
- **Quina** — o ponto é um bico de propósito (ombro, barra, canto de bolso);
  cada lado faz o que quiser. É o `canto` de hoje.

O suave e o simétrico do Corel continuam existindo nos dados (moldes antigos,
ajuste fino), mas a barra só oferece Liso e Quina.

### 1.2 O dado

Campo novo e opcional no nó: `auto: { antes, depois, giro }`.

- `antes`, `depois` — a **abertura** de cada lado: 1 é o natural; menos fecha a
  curva daquele lado, mais abre. Limites 0,05 a 4.
- `giro` — quanto a direção da curva no ponto está girada em relação à direção
  automática, em radianos (−π a π).

Nó com `auto` não tem `canto` nem `simetrico`. Sem `auto`, o nó é o que era.

### 1.3 A conta (`alcasDoNoAutomatico`)

Para o nó `i` com `auto`, `A` o anterior e `B` o seguinte:

- **Direção** `d`:
  - reta dos dois lados: sem alças (as duas em cima do nó);
  - reta só antes (o trecho `A→i` é reto): `d` = a direção da reta, `A→i`. A
    curva sai da reta sem quebra; o `giro` não vale;
  - reta só depois: `d` = a direção `i→B`; o `giro` não vale;
  - curva dos dois lados: `d` = a bissetriz de `unit(B−i)` e `unit(i−A)`,
    girada de `giro`.
- **Tamanho** de cada lado: `|i−A| / 3 × antes` e `|B−i| / 3 × depois`.
- `entrada = i − d × tamanhoAntes` (lado reto: o próprio nó), `saida = i + d ×
  tamanhoDepois` (lado reto: o próprio nó).

`refazerAlcas(nos, indices)` aplica a conta aos nós automáticos da lista (todos,
com `null`) e devolve uma lista nova.

### 1.4 De onde vêm os números (`derivarAuto`) — o molde antigo não muda

`derivarAuto(nos, indices)` faz o caminho inverso: dos números que as alças de
agora dão. Vira automático, **sem mudar o desenho**:

- o nó **não canto** com curva dos dois lados, alças com tamanho e na mesma
  reta — a alça que gira para o alinhamento anda no máximo 0,002 mm, e nunca
  mais de 1° (o banco guarda os nós com 4 casas, e o liso de hoje chega
  desalinhado de até ~0,001 mm; medido nos moldes reais): `giro` = o ângulo
  entre a direção atual e a automática; `antes`/`depois` = o tamanho de cada
  alça ÷ (distância ao vizinho ÷ 3), dentro dos limites de 1.2. O desenho
  refeito fica a até 0,002 mm do de antes;
- o nó entre **uma reta e uma curva** (canto ou não) cuja alça do lado curvo
  está a até 2° da direção da reta: `antes` ou `depois` do lado curvo, `giro`
  0, e deixa de ser canto. Aqui o começo da curva gira até 2° para sair da reta
  sem quebra — é a correção do bico, e só acontece quando a pessoa mexe ali
  (ver 1.5);
- os outros ficam como estão: canto entre duas curvas (é quina de propósito),
  alças fora de linha, alça zerada, abertura fora dos limites, reta dos dois
  lados.

### 1.5 Quando a conta roda

- **Começo de cada mexida do editor** (arrasto, seta, puxador, puxar a curva,
  tecla): `derivarAuto` nos nós que a mexida alcança e nos vizinhos deles. O
  desenho não muda nesse passo.
- **Mexidas que mudam lugar de nó** (arrastar, setas, alinhar): depois de mover,
  `refazerAlcas` nos movidos e nos vizinhos deles. É isto que faz "arrastar o
  ponto e a curva seguir".
- **Mexidas que fazem as alças** (pôr nó no traço, apagar, reduzir, converter
  reta/curva, ajuste fino de alça): depois, `derivarAuto` de novo nos nós em
  volta, para os números acompanharem as alças novas. Ajuste fino de alça num nó
  automático tira o `auto` dele (vira suave manual, como hoje).
- **Girar a peça**: os números não mudam com o giro; as alças giram junto.

### 1.6 Os puxadores — cada lado do seu jeito

O nó liso automático selecionado mostra **um puxador de cada lado** (o lado
reto não tem): uma bolinha grande na ponta da alça, ligada ao nó por uma linha.

- **Arrastar** o puxador de um lado: o tamanho até o ponteiro vira a abertura
  daquele lado, e a direção até o ponteiro vira o `giro` (os dois lados giram
  juntos — o ponto continua liso). Nó ao lado de uma reta: só a abertura muda
  (a direção é a da reta).
- **Alt+arrastar**: o nó vira **quina** e só aquele lado anda.
- **Dois cliques** num puxador: aquele lado volta ao natural (abertura 1), e o
  `giro` volta a 0.

### 1.7 Puxar a curva no meio do trecho

Continua: o ponto pego segue o ponteiro, pela conta de hoje (`puxarTrecho`).
Depois dela, as pontas automáticas viram números de novo, como um puxador: a
alça nova de cada ponta dá a abertura daquele lado e o `giro`. Em nó liso nunca
aparece bico.

### 1.8 Os comandos

- **Liso (L)**: o nó vira automático. Se `derivarAuto` consegue, sem mudar o
  desenho; se não (era quina), com abertura 1 e `giro` 0 — o desenho muda, que é
  o que se pediu.
- **Quina (Q)**: tira o `auto` e marca `canto`; as alças ficam onde estão.
- **Automático (A)**: abertura 1 dos dois lados e `giro` 0 nos selecionados.
- **Alças** (botão): mostra as alças finas do Corel em vez dos puxadores, para o
  ajuste fino. Fora disso, o nó automático não mostra alça nenhuma além dos
  puxadores.

### 1.9 Graduação

`gerarTamanho` move cada nó com as alças (`anda`, `escala`). Depois disso,
`refazerAlcas` nos nós automáticos: no tamanho graduado a curva é refeita lisa a
partir dos nós no lugar novo, em vez de levar as alças duras do base. Sem
deslocamento nenhum (graduação zero), o tamanho sai igual ao base.

### 1.10 O servidor

`servidor/moldes-pecas.js` (`lerNos`) guarda o `auto` quando os três números são
finitos, presos aos limites de 1.2; sem eles, o nó vai sem `auto`. `clonarNos`
(motor) e o tipo `NoDoRisco` (`api/risco.ts`) ganham o campo.

## 2. Acertar o ponto, a barra e o espaço

### 2.1 Os nós na tela (`desenhoDeNos.ts`)

- Liso: bolinha de 6 px de raio; quina: quadrado de 12 px de lado; o
  selecionado, 7,5 px, laranja, com o halo de hoje.
- O nó **sob o ponteiro** ganha um anel (antes do clique).
- Os puxadores do nó automático selecionado: bolinha azul de 6,5 px na ponta, e
  a linha até o nó.
- O ponto **fantasma**: com o ponteiro perto do traço e longe dos nós, uma
  bolinha vazada no ponto do traço em que dois cliques poriam um nó.

### 2.2 Pegar

- Raio de pega 16 px (era 10).
- Ordem: puxador (ou alça, no ajuste fino) dos selecionados → nó mais perto →
  traço. É a ordem de `pegaSob` hoje, com o raio maior.
- Cursor: `move` sobre nó e puxador, `copy` sobre o traço com o fantasma,
  `crosshair` no vazio, `grab`/`grabbing` com Espaço.

### 2.3 A barra dos nós (`BarraDosNos.tsx`) — uma linha

`Liso | Quina | Auto` · `+ Nó | − Nó` · `Reta | Curva` · `Alinhar ▾` ·
`Reduzir ▾` · `Girar ▾` · `Alças` · `?` — e o contador ("3 de 41 nós").

- Alinhar, Reduzir (com o controle) e Girar (90°, −90°, graus) abrem um menu
  pequeno abaixo do botão; o menu fecha com Esc ou clique fora.
- Cada botão diz na dica o que faz e o atalho: "Quina (Q)".
- `?` abre a lista de atalhos (seção 3), numa janela.

### 2.4 A Montagem (`MesaDeMontagem.tsx`, `Mesa.tsx`)

- As ferramentas (Nós, Pique, Ponto, Fio, Graduar, Ver todas) saem da faixa de
  cima e viram uma **coluna vertical** encostada à esquerda da mesa: ícone e
  rótulo pequeno, com o atalho na dica. A faixa da dica longa sai.
- O aviso "O PDF sai em tamanho real…" (`BarraDaMontagem`) vira a dica do botão
  PDF.
- **A peça abre inteira**: a escala do zoom 1 é a menor entre largura e altura
  da mesa (era só a largura).
- No canto da mesa: `−`, `+` e `Ajustar`, com o zoom em porcentagem.
- **0** ajusta; **Z** aproxima nos nós selecionados (a caixa deles, com folga,
  ocupando a mesa); a roda continua aproximando em volta do ponteiro.
- **Espaço + arrastar** ou o **botão do meio** anda pela peça (rola a moldura).

## 3. Os atalhos

Valem com o foco fora de campo de texto e sem janela aberta. Os que não existem
na ferramenta da vez não fazem nada.

| Tecla | Faz | Onde |
|---|---|---|
| N P M F G V | ferramentas Nós, Pique, Ponto (marcação), Fio, Graduar, Ver todas | Montagem |
| Tab / Shift+Tab | o nó seguinte / o anterior vira a seleção | as duas |
| Ctrl+A / Esc | todos / limpa | as duas |
| setas / Shift / **Alt** | 1 mm / 1 cm / **0,1 mm** | as duas |
| L / Q / A | liso / quina / automático | as duas |
| R / C | o trecho vira reta / curva | as duas |
| + / Delete, Backspace | põe nó / apaga | as duas |
| H / Shift+H | alinha na mesma altura / na mesma coluna | as duas |
| E | reduz os nós (da seleção, ou da peça) | as duas |
| [ / ] | gira a peça 90° para a esquerda / direita | Montagem |
| 0 / Z | ajusta à tela / aproxima na seleção | Montagem |
| Espaço+arrastar, botão do meio | anda pela peça | Montagem |
| Ctrl+Z / Ctrl+Y, Ctrl+Shift+Z | desfaz / **refaz** | Montagem (o Digitalizar tem o desfazer dele) |
| ? | a lista de atalhos | as duas |

Gestos: dois cliques no traço põem nó; dois cliques no nó apagam; nos
puxadores, ver 1.6.

**Refazer** (novo): `useMoldeEmMontagem` ganha a pilha do refazer — o que o
desfazer tira vai para ela, e qualquer mexida nova a esvazia.

## 4. Como se prova

1. **`bancada:nos`** (CI) — contas puras:
   - a regra de 1.3 (direção, tamanho, lado reto, os dois lados retos);
   - `derivarAuto` + `refazerAlcas` devolve o desenho de antes a menos de
     0,001 mm, nos casos de 1.4, e deixa como está o que não pode virar;
   - arrastar um nó automático: ele e os vizinhos automáticos sem bico (alças em
     linha);
   - puxador de um lado: muda só a abertura daquele lado; o outro mantém a sua;
     o ponto continua liso; com reta ao lado, a direção não muda;
   - Alt no puxador: vira quina e só aquele lado anda;
   - puxar a curva no meio: nenhum nó automático com bico;
   - Liso/Quina/Automático;
   - graduação: tamanho gerado com os automáticos lisos, e graduação zero igual
     ao base.
2. **Bancada local `bancada:curvas-reais`** (fora da CI, como a
   `bancada:guardados`): os moldes do `dados.db` desta máquina — `derivarAuto`
   em todos os nós e `refazerAlcas` devolvem o desenho a menos de 0,001 mm; sem
   o banco, avisa e sai.
3. **`bancada:editor`** (CI, jsdom) — os atalhos de 3 (inclusive dentro de
   campo de texto, que não disparam), o Tab, o Alt+seta, os puxadores (arrastar,
   Alt, dois cliques).
4. **`bancada:moldes-pecas`** (CI) — o servidor guarda e devolve o `auto`, com
   os limites.
5. **`bancada:montagem-tela`** (Puppeteer, fora da CI, como a `bancada:tela`):
   um molde de teste pela API; a peça abre inteira na mesa; 0 ajusta; Espaço+
   arrastar rola; arrastar um nó e um puxador com o mouse e conferir, pelos nós
   gravados, que não há bico; N/P/G trocam a ferramenta; Ctrl+Z e Ctrl+Y; prints
   da tela.
6. Regressão: `graduacao`, `montagem`, `risco-pdf`, `pdf`, `tela`, `tsc`.

## Quando dá errado

- Nó que não pode virar automático sem mudar o desenho fica como está (quina ou
  suave manual) até a pessoa apertar L.
- Vizinho quase em cima do nó (distância perto de zero): a direção cai na do
  outro vizinho; os dois perto de zero, o nó fica como está.
- `auto` com número fora do limite, vindo de dado velho ou estragado: o servidor
  prende no limite; o motor também, na conta.

## Arquivos

- `src/motores/edicaoDeNos.js` — `alcasDoNoAutomatico`, `refazerAlcas`,
  `derivarAuto`, `moverPuxador`, `tornarLiso`, `tornarQuina`, `voltarAoAuto`;
  `moverNos`, `puxarTrecho`, `mudarTipoDosNos`, `inserirNoNoTraco`,
  `apagarNos`, `reduzirNos`, `clonarNos` passam a cuidar do `auto`.
- `src/motores/graduacao.js` — `refazerAlcas` depois de gerar.
- `src/telas/risco/desenhoDeNos.ts` — tamanhos, anel, puxadores, fantasma.
- `src/telas/risco/useEditorDeNos.ts` — pega maior, puxadores, ponto sob o
  ponteiro, atalhos novos.
- `src/telas/risco/BarraDosNos.tsx` — a barra numa linha, menus, `?`.
- `src/telas/risco/JanelaDeAtalhos.tsx` (novo) — a lista de atalhos.
- `src/telas/montagem/Mesa.tsx` — ajuste por largura e altura, botões de zoom,
  0/Z, Espaço e botão do meio, cursor.
- `src/telas/montagem/MesaDeMontagem.tsx` — coluna de ferramentas, atalhos de
  ferramenta, [ ], refazer.
- `src/telas/montagem/useMoldeEmMontagem.ts` — a pilha do refazer.
- `src/telas/montagem/BarraDaMontagem.tsx` — o aviso do PDF vira dica.
- `src/telas/Digitalizar.tsx` — a pega maior e o ponto sob o ponteiro.
- `src/api/risco.ts`, `servidor/moldes-pecas.js` — o campo `auto`.
- Bancadas: `conferir-edicao-de-nos.mjs`, `conferir-editor-de-nos.mjs`,
  `cenarios-do-editor.tsx`, `conferir-moldes-pecas.cjs`,
  `conferir-curvas-reais.mjs` (nova), `conferir-montagem-tela.cjs` (nova).

## Branch

`feature/curvas-faceis`, a partir de `feature/juntar-pedidos` (que já tem a main
de 2026-10-05).
