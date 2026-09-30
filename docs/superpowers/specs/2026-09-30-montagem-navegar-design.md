# Montagem — navegar e ver: enquadrar, arrastar a vista e as teclas do Corel

Data: 2026-09-30 · Estado: design aprovado em conversa, aguardando revisão da spec

Parte 1 de 4 do "melhorar a Montagem". O pedido foi "usar é difícil/lento", e
as quatro áreas doem: **navegar e ver** (esta), **identificar as peças**,
**marcar** (piques, pontos, fio) e **graduar**. Cada uma tem spec, plano e
implementação próprios, nessa ordem. Esta vem primeiro porque é a menor e deixa
as outras três mais rápidas de usar e de testar.

## Por que

Na mesa da Montagem, hoje:

- no zoom 1 a peça ocupa a **largura** da área; peça comprida (calça, manga)
  passa da altura e só se vê rolando;
- o zoom da roda é um só para a tela inteira: aproximou numa peça, a próxima já
  abre aproximada;
- a vista só anda pelas barras de rolagem;
- não há tecla para ferramenta, peça ou tamanho: tudo é clique na barra, na
  lista ou nos chips.

A fábrica trabalha no CorelDRAW, então as teclas seguem o Corel onde ele tem a
mesma coisa (F10 = Forma, F4 = enquadrar, F2/F3 = aproximar/afastar).

## O que fica igual

- O modelo da mesa: um canvas dentro de uma caixa com rolagem, com o zoom como
  largura do canvas em % da caixa (`Mesa.tsx`). O ponteiro → cm (`noCm`), o raio
  de pega e o desenho não mudam. Descartadas: a "câmera" (canvas do tamanho da
  tela e desenho transformado), que reescreveria o mapeamento e o desenho da mesa
  inteira para resolver o que ninguém relatou (o borrado acima de 4096 px); e já
  passar o Digitalizar para o gancho novo, que fica para uma parte própria.
- A roda do mouse: aproxima e afasta ancorada no ponteiro, como hoje.
- A vista congelada durante um arrasto de nó (`vistaCongelada`).
- As teclas do editor de nós (setas, Delete/Backspace, `+`, Esc, Ctrl+A) e o
  Ctrl+Z da Montagem.

## 1. A vista da mesa — `useVistaDaMesa`

Sai de `Mesa.tsx` para `src/telas/montagem/useVistaDaMesa.ts`: o zoom, a medida
da caixa (largura **e** altura — hoje só a largura é medida), a roda, enquadrar,
aproximar/afastar e arrastar a vista. `Mesa.tsx` usa o gancho e continua
responsável pelo desenho e pelas ferramentas.

**Enquadrar**: a peça cabe inteira, na largura e na altura, e fica centralizada
na caixa. Com `W×H` a caixa e `l×a` a vista (em cm, já com a folga de 3 cm):

    zoomQueCabe = min(1, (H · l) / (W · a))

No zoom 1 a largura do canvas é a da caixa, então a altura dele é `W · a / l`; o
`min` com 1 é porque peça larga já cabe na altura. O zoom mínimo passa a ser
`min(zoomQueCabe, 1)` — hoje ele é 1, e peça comprida nunca caberia. O máximo
continua 12. Quando o canvas é menor que a caixa, ele fica no meio dela (nos dois
eixos).

**Quando enquadra sozinho**: ao trocar de peça, ao trocar de tamanho, ao entrar
e ao sair do Ver todas, e ao abrir o molde. Trocar de **ferramenta** não mexe na
vista. Editar a peça (a vista recalculada porque os nós mudaram) também não
enquadra: segue o zoom de agora.

**F4** enquadra. **F2** aproxima e **F3** afasta, pelo centro da caixa, no mesmo
passo da roda (×1,15). A roda continua ancorada no ponteiro.

**Arrastar a vista**: com o **espaço segurado** e o botão esquerdo, ou com o
**botão do meio**, a qualquer momento. Arrastar muda a rolagem da caixa. Nesse
modo:

- o cursor é a mão (`grab`; `grabbing` enquanto arrasta);
- o aperto **não chega na ferramenta**: não põe pique, não marca ponto, não
  seleciona nem arrasta nó, não começa retângulo;
- o espaço não aperta o botão que estiver com foco (o `keydown` do espaço é
  impedido, fora de campo de texto);
- soltar o espaço no meio do arrasto termina o arrasto no próximo soltar do
  botão, não antes.

A percentagem mostrada (ver §3) é relativa à peça enquadrada: **100% = cabendo
inteira**.

## 2. As teclas

Um ouvinte só, em `MesaDeMontagem.tsx`, ligado enquanto a tela está aberta.

| Tecla | Faz |
|---|---|
| F10 | ferramenta Nós |
| P | ferramenta Pique |
| O | ferramenta Ponto |
| I | ferramenta Fio |
| G | ferramenta Graduar |
| T | liga e desliga o Ver todas |
| PgUp / PgDn | peça anterior / próxima, na ordem da lista; para nas pontas |
| [ / ] | tamanho anterior / próximo, na ordem da grade; para nas pontas |
| F4 | enquadra |
| F2 / F3 | aproxima / afasta |
| espaço (segurado) | arrasta a vista (§1) |

- As letras valem maiúsculas ou minúsculas. Escolher uma ferramenta tira do Ver
  todas, como o clique no botão faz hoje.
- **Travas**, as mesmas do editor de nós: com o foco num campo de texto
  (`INPUT`, `TEXTAREA`, `SELECT`, `contentEditable`) ou com uma janela aberta
  (`[aria-modal="true"]` visível), nenhuma dessas teclas é da Montagem. Com
  Ctrl, Alt ou Meta, também não (o Ctrl+Z segue o ouvinte de hoje). O
  `janelaAberta` do `useEditorDeNos.ts` passa a ser exportado e usado pelos dois.
- Tecla tratada tem o `preventDefault` — no WebView2 e no navegador, F3 abre a
  busca e F10 foca o menu.
- **Tamanho no Graduar**: a ferramenta Graduar trabalha no base e já força o
  tamanho para ele; ali `[`/`]` não fazem nada.
- **PgUp/PgDn no Ver todas**: trocam a peça marcada e saem do Ver todas, como o
  clique numa peça dele.
- Com a janela da Grade, a do Substituir ou a do casamento de peças abertas, as
  teclas são delas (trava acima).

Nenhuma cruza com as do editor de nós (§11 da spec do editor).

## 3. O que aparece na tela

- Cada botão de ferramenta mostra a tecla dele, discreta, depois do rótulo:
  "Nós F10", "Pique P", "Ponto O", "Fio I", "Graduar G"; e o Ver todas, "T".
- Na barra das ferramentas, à direita, no lugar do texto de dica (a dica da
  ferramenta vai para o `title` do botão, onde já está):
  - **‹ peça 3 de 12 ›** — os mesmos passos do PgUp/PgDn, apagados nas pontas;
  - **− 100% +** — os mesmos passos do F3/F2, com a percentagem da §1;
  - **Enquadrar** (título "Enquadrar a peça (F4)").
- A lista de peças rola até a peça escolhida quando ela muda
  (`scrollIntoView({ block: "nearest" })`), para não sumir quando se navega pelo
  teclado.

Fora do escopo: busca na lista de peças, miniaturas maiores, atalhos
configuráveis, a mesma navegação no Digitalizar.

## Contas puras

Em `src/telas/montagem/navegacao.ts`, sem React, para a bancada conferir:

- `zoomQueCabe(caixa, vista)` — a fórmula da §1;
- `zoomAncorado(zoom, fator, ancora, rolagem, tamanhoDoCanvas)` → o zoom novo e
  a rolagem que mantém o ponto da âncora parado (a conta que hoje mora dentro do
  `aoRodar`, usada pela roda e pelo F2/F3);
- `vizinho(lista, atual, passo)` — o anterior/próximo, parando nas pontas
  (peças e tamanhos);
- `acaoDaTecla(evento, contexto)` → qual ação a tecla pede (`ferramenta`,
  `verTodas`, `peca`, `tamanho`, `enquadrar`, `zoom`) ou `null`, já com as
  travas de modificador e com o Graduar sem tamanho.

## Testes

Bancada nova `bancada/conferir-navegacao-montagem.mjs` (`npm run
bancada:navegacao`), no passo "Moldes e tamanhos" do CI:

- as contas: peça comprida enquadra abaixo de 1 e peça larga fica em 1; o zoom
  ancorado deixa o ponto da âncora no mesmo lugar da tela; `vizinho` para nas
  pontas; cada tecla da tabela dá a ação certa, e Ctrl/Alt/Meta dão `null`.
- o gancho e o ouvinte de verdade, com React e jsdom (o jeito de
  `conferir-editor-de-nos.mjs`): trocar de peça enquadra e trocar de ferramenta
  não; tecla com o foco num campo não faz nada; com `aria-modal` aberto não faz
  nada; espaço segurado + aperto não chega na ferramenta.

E na tela do app: uma calça comprida abre inteira; espaço + arrastar anda;
PgDn/PgUp e `[`/`]` trocam; F10/P/O/I/G trocam a ferramenta; os botões novos
fazem o mesmo.

## Quando dá errado

- Caixa ainda sem medida (primeiro render): enquadra quando a medida chegar.
- Peça sem desenho no tamanho escolhido: a mesa mostra o aviso de hoje, e as
  teclas de peça e tamanho continuam andando.
- Molde sem peça: `‹ ›` apagados, PgUp/PgDn não fazem nada.

## Arquivos

- **Novos**: `src/telas/montagem/useVistaDaMesa.ts`,
  `src/telas/montagem/navegacao.ts`,
  `bancada/conferir-navegacao-montagem.mjs` (e os cenários com React, se
  precisar de um `.tsx` como o do editor).
- **Mudam**: `src/telas/montagem/Mesa.tsx` (usa o gancho; o arrasto da vista
  antes das ferramentas), `src/telas/montagem/MesaDeMontagem.tsx` (as teclas; a
  barra com as teclas nos botões, a peça N de M, o zoom e o Enquadrar),
  `src/telas/montagem/ListaDePecas.tsx` (rolar até a escolhida),
  `src/telas/risco/useEditorDeNos.ts` (exporta `janelaAberta`), `package.json`
  e `.github/workflows/conferir.yml` (`bancada:navegacao`).

## Branch

`feature/montagem-navegar`, saindo da `feature/editor-corel` (a mesma ponta da
`Guilherme` no GitHub).
