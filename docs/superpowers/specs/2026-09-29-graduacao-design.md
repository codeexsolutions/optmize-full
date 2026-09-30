# Graduação na Montagem — os tamanhos gerados a partir do base

Data: 2026-09-29 · Estado: design aprovado em conversa, aguardando revisão da spec

É a parte **D** anotada em `2026-09-28-digitalizar-melhor-design.md`. Usa a
grade de tamanhos com cor, os grupos (a mesma peça em vários tamanhos), os
chips e o "Ver tamanhos" de `2026-09-28-importar-da-audaces-design.md` — por
isso vive na branch `feature/graduacao`, em cima da `feature/importar-audaces`.

## Por que

A fábrica gradua na Audaces e quer poder graduar **aqui** também: o molde que
veio do Digitalizar (um tamanho só), ou o que chegou com tamanhos faltando.
Hoje a Montagem guarda e mostra vários tamanhos, mas não sabe fazer um tamanho
a partir de outro.

## O que a fábrica disse

- Na Montagem, **definir a grade**: quais tamanhos existem, a cor de cada um e
  qual é o **base** (o que está desenhado na tela).
- **Graduar cada peça a partir do base**, de um de dois jeitos, à escolha:
  - **Por pontos:** clicar nos pontos que crescem e dizer quanto cada um anda
    na horizontal e na vertical; em cada ponto, **salto igual** (um valor que
    vale para cada salto de tamanho) ou **por tamanho** (um valor para cada
    salto: P→M, M→G, G→GG).
  - **Porcentagem da peça inteira:** a peça cresce X% por tamanho, em largura e
    altura, sem marcar ponto.
- **Ponto sem regra acompanha os vizinhos**, na proporção do comprimento da
  linha.
- Tamanho que **já tem desenho próprio** (veio da Audaces, de um "juntar") só é
  substituído **se a pessoa marcar**.
- O resultado aparece sobreposto nas cores da grade.

## Decisões

### 1. A regra é da peça, guardada na linha do base

`molde_pecas` ganha a coluna **`graduacao`** (JSON), preenchida só na linha do
tamanho que é o base daquela graduação — a linha diz qual é o base pelo próprio
`tamanho`. Uma peça usa um jeito só:

```js
// Por pontos. Coordenadas em cm, as mesmas dos nós: x para a direita, y para baixo.
{ jeito: "pontos", regras: [
  { no: 4, modo: "igual", passo: { dx: 1, dy: -0.5 } },
  { no: 9, modo: "porTamanho", deslocamentos: { P: { dx: -1, dy: 0 }, G: { dx: 1, dy: 0 }, GG: { dx: 2.5, dy: 0 } } },
] }

// Porcentagem da peça inteira, por tamanho.
{ jeito: "porcentagem", porcentagem: 4 }
```

- **Salto igual** guarda **um passo**: o tamanho a *k* saltos do base anda
  `k × passo` (*k* = posição na grade − posição do base; o P, abaixo do M, tem
  *k* = −1). Por isso um tamanho novo na grade já sai coberto.
- **Por tamanho** guarda o deslocamento **acumulado** de cada tamanho em
  relação ao base. A tela mostra e edita por **salto** (P→M, M→G, G→GG — o
  quanto o ponto anda subindo um tamanho) e converte: G = (M→G), GG = (M→G) +
  (G→GG), P = −(P→M). Mudar o salto M→G move o G e tudo acima dele.
- Trocar **por tamanho → salto igual** com saltos diferentes pergunta antes, e
  fica o salto do base para o tamanho de cima (ou, se o base é o maior, o do
  tamanho de baixo para o base). **Salto igual → por tamanho**
  preenche os saltos com o passo.
- **Porcentagem**: o tamanho a *k* saltos fica com escala `1 + k × % / 100` em
  largura e altura, a partir do centro da caixa do risco da peça.
- Não há "tabela de regras salva" para reaproveitar em outro molde, nem regra
  em ângulo (andar ao longo de uma linha).

### 2. A conta que gera um tamanho (`src/motores/graduacao.js`)

Conta pura. Para gerar o tamanho *T* de uma peça:

1. **Porcentagem:** nós, alças, pontos internos e o centro e o comprimento do
   fio escalam juntos a partir do centro da caixa.
2. **Por pontos:**
   - o ponto com regra anda o deslocamento de *T*;
   - o ponto sem regra anda a mistura dos dois pontos com regra mais próximos
     antes e depois dele na volta, na proporção do **comprimento da linha** até
     cada um (um nó no meio da cava anda a média do ombro e da axila);
   - as alças andam junto com o seu nó — a curva guarda o formato;
   - pontos internos (pence, bolso) e o centro do fio andam a média dos
     deslocamentos dos nós, pesada pelo inverso do quadrado da distância; o
     ângulo e o comprimento do fio ficam.
3. **Piques** ficam como estão (`no`, `t`): a peça gerada tem os mesmos nós,
   então eles acompanham o traço sozinhos.
4. A peça gerada é a do base com: `tamanho: T`, o mesmo `grupo`, os campos
   comuns do grupo (nome, papel, quantidade, espelhar, margem), `origem:
   "graduação"`, sem `graduacao` e sem `id`.

Casos que não geram e avisam: jeito pontos sem nenhuma regra; porcentagem 0.
Com **um ponto só** de regra, a peça inteira só se desloca (as duas pontas da
mistura são o mesmo ponto) — gera e avisa "marque pelo menos dois pontos".

### 3. A grade de tamanhos (muda uma decisão anterior)

- A grade passa a guardar os **tamanhos declarados**, mesmo sem desenho: é
  preciso declarar P, G e GG antes de graduar. Isto **desfaz** o filtro "a
  grade não guarda tamanho que nenhuma peça tem" (conserto da revisão da
  importação), e o problema que ele resolvia é resolvido de outro jeito:
  - o **desfazer** passa a guardar peças **e** grade juntas — desfazer uma
    junção tira também o tamanho que ela criou;
  - o tamanho declarado que uma peça ainda não tem aparece no chip como **"sem
    desenho"** (borda tracejada); escolhido, a mesa mostra o base com o aviso
    "esta peça ainda não tem o tamanho G — gradue ou junte";
  - "este molde já tem o tamanho X", no juntar, passa a olhar as **peças**:
    juntar num tamanho declarado e ainda vazio o preenche, com a cor da grade.
- Tamanho que só existe nas peças (o passo a passo antigo renomeou um tamanho,
  por exemplo) entra na grade com cor da paleta, como hoje.

**A janela "Grade"** (botão ao lado dos chips; a barra dos chips passa a
aparecer sempre, mesmo com um tamanho só):

- lista com **nome, cor, base**, e **↑↓** para a ordem; "**+ tamanho**";
- **renomear** muda o nome na grade, nas peças e nas regras (nome repetido é
  recusado); é assim que o "base" do Digitalizar vira "M";
- **tirar** um tamanho com desenho pergunta ("as N peças do tamanho P somem"),
  e tira também os valores dele das regras; o base não pode ser tirado
  (marque outro base antes);
- **trocar o base** da grade não mexe em graduação feita: cada graduação
  guarda o próprio base (a linha em que está). O base da grade é o de partida
  das graduações novas e o chip que abre marcado.
- Reordenar ou tirar um tamanho do meio muda o *k* do "salto igual" dos
  tamanhos depois dele (é o que "um salto por tamanho" quer dizer); o "por
  tamanho" guarda acumulado e não muda.

### 4. A ferramenta "Graduar"

Quinta ferramenta, ao lado de Nós, Pique, Ponto e Fio.

- Trabalha no **base da peça** (o da graduação dela ou, sem graduação, o da
  grade). Com outro chip marcado, troca para o base e avisa. Peça sem desenho
  no base: "esta peça não tem desenho no M; escolha outro base na Grade ou
  junte o M".
- O painel da peça ganha o bloco **"Graduação"**:
  - **Jeito:** `Por pontos` | `Porcentagem`.
  - **Porcentagem:** campo "% por tamanho".
  - **Por pontos:** clicar num nó mostra a regra dele (o nó com regra ganha um
    losango na mesa). Sem regra, os campos vêm vazios em "Salto igual";
    digitar cria a regra. **Salto igual:** "anda na horizontal" e "anda na
    vertical", em cm (→ e ↓ positivos). **Por tamanho:** uma linha por salto
    (P→M, M→G, G→GG), cada uma com os dois campos. "**Tirar regra**".
  - A dica: "Ponto que não pode sair do lugar (o meio da frente, a dobra):
    marque 0 e 0 — ponto sem regra acompanha os vizinhos."
- **Prévia ao vivo:** com a ferramenta aberta, os outros tamanhos da grade
  aparecem tracejados nas suas cores, calculados das regras enquanto se
  digita.

### 5. Gerar

- **"Gerar tamanhos"** no bloco da graduação, com a opção "todas as peças com
  graduação".
- Gera todos os tamanhos declarados, menos o base, e **refaz sem perguntar** os
  de `origem: "graduação"`. Os que têm desenho próprio (outra origem) aparecem
  numa lista com caixa de marcar — "FRENTE, G: veio da Audaces — substituir?"
  —, e só os marcados são refeitos.
- **Mexer à mão num tamanho gerado** (nós, piques, pontos, fio nesse tamanho)
  troca a origem dele para `"graduação ajustada à mão"`: gerar de novo passa a
  perguntar antes de perder o ajuste.
- **Tamanho que não fecha não é gerado.** Se a margem de costura de um tamanho
  gerado se cruza (o P pequeno demais, por exemplo), ele fica de fora e a
  mensagem do fim diz qual e por quê ("Gerados: G, GG. Não gerei o P da MANGA:
  a margem de 1 cm fecha a peça — diminua a margem ou a regra."). Corrige o que
  foi dito na conversa ("entra em vermelho e o resto grava"): na Montagem uma
  peça que não fecha segura a gravação do molde inteiro, então gerá-la
  travaria tudo.
- Tudo é **um passo** no desfazer (peças e grade juntas).

### 6. Guardar e conferir

- `servidor/moldes-pecas.js` confere a `graduacao` como confere as marcações:
  jeito conhecido; porcentagem entre −50 e 50; regras com `no` dentro dos nós
  da peça, `modo` conhecido, números finitos de até 100 cm em módulo; nome de tamanho até 20
  caracteres. O que não confere é descartado, não gravado torto. Peça sem nós
  não guarda graduação.
- **Os nós do base mudaram depois de graduar:** inserir um nó (`inserirNoNaPeca`)
  e apagar um nó (`apagarNoDaPeca`) remapeiam os `no` das regras como já
  remapeiam os piques; regra de nó apagado sai, e a peça avisa "a graduação
  perdeu um ponto".
- **Tamanho novo na grade:** "salto igual" e porcentagem o cobrem sozinhos; o
  "por tamanho" fica sem aquele salto (conta como 0) e a peça avisa.

## Quando as duas branches se juntarem

A `feature/digitalizar-melhor` mexe nos mesmos arquivos da Montagem (seleção de
vários nós, girar a peça). No merge, além dos conflitos de texto:
`apagarNosDaPeca` e `virarTrechosNaPeca` têm de remapear as regras como
remapeiam os piques, e `girarPeca` tem de girar os vetores das regras (`passo`
e `deslocamentos`) junto com a peça.

## Testes

- **`bancada:graduacao`** (nova, no CI, no passo "Moldes e tamanhos"):
  - gerar e voltar ao base dá a peça idêntica;
  - ponto com regra anda exatamente o pedido, nos dois modos e para baixo do
    base (*k* negativo);
  - ponto do meio anda a média, pelo comprimento da linha;
  - "salto igual" e "por tamanho" com os mesmos valores dão o mesmo desenho;
  - editar o salto M→G move o G e o GG; trocar de modo converte certo;
  - porcentagem 0 não gera; porcentagem 4 com *k* = −1 escala 0,96;
  - um ponto só desloca a peça e avisa; nenhuma regra não gera;
  - piques continuam válidos na peça gerada; pontos e fio andam a média;
  - inserir/apagar nó no base remapeia as regras;
  - renomear e tirar tamanho nas regras;
  - tamanho que não fecha com a margem sai da lista de gerados, com o motivo.
- **`bancada:moldes-pecas`**: a `graduacao` limpa e conferida.
- **`bancada:tamanhos`**: o caso "a grade não guarda tamanho sem peça" vira "a
  grade guarda o tamanho declarado".
- **No navegador:** grade nova a partir do "base" do Digitalizar (renomear para
  M, acrescentar P, G, GG); uma regra de salto igual e uma por tamanho; a
  porcentagem; gerar; substituir o G que veio de um "juntar" pela pergunta;
  mexer à mão num gerado e gerar de novo (pergunta); tamanho que não fecha;
  desfazer (peças e grade voltam juntas); F5.

## Fora do escopo

Tabela de regras salva para outros moldes, regra em ângulo, graduar vários
moldes de uma vez, exportar regras para a Audaces, importar as regras da
Audaces como regras editáveis (a importação traz os tamanhos já desenhados).
