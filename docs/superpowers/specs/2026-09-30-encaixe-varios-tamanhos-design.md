# Encaixe de vários tamanhos — a grade estampa × tamanho, num envio só

Data: 2026-09-30 · Estado: design aprovado em conversa, aguardando revisão da spec

Passa na frente do "melhorar a Montagem" (a spec do navegar,
`2026-09-30-montagem-navegar-design.md`, fica esperando na
`feature/montagem-navegar`).

## Por que

A janela **Arte e encaixe** (`src/telas/moldes/EnvioParaEncaixe.tsx`, aberta
pela estante e pela barra da Montagem) manda **um tamanho por vez**: escolhe o
tamanho, põe "Quantas peças prontas" e a quantidade de cada estampa guardada, e
manda. Para um pedido de P, M e G, são três voltas na janela. O pedido:

> "escolho os tamanhos e quantidade aí envia tudo de uma vez, e nas quantidades
> eu colocar quantidade por peça, não uma quantidade total"

Combinado em conversa: quantidade de **peças prontas por tamanho** (e por
estampa), **e** poder mudar a quantidade de uma peça quando precisar (repor só
as mangas, por exemplo).

## O que fica igual

- **O Encaixe.** Ele já **soma** as peças que chegam (`mandarMoldeParaOEncaixe`
  em `src/producao/controlador.js`), então vários tamanhos são vários envios em
  sequência pela mesma `ligacao.mandarMoldeParaOEncaixe`. Nem `ligacao.ts` nem o
  controlador mudam.
- As estampas: guardar, abrir, excluir, a arte por papel, os ajustes, a prévia.
- A peça espelhada vira duas (`pecasParaOEncaixe`), como hoje.
- A qualidade (dpi): uma só para o envio todo.

## 1. A grade de quantidades

Substitui os campos "Tamanho" e "Quantas peças prontas" do topo e o campo
"Peças prontas" de cada estampa guardada.

**Colunas**: os tamanhos da grade do molde (`molde.tamanhos`), pela `ordem`.
Molde sem grade guardada (`tamanhos` vazio): os tamanhos das peças, na ordem em
que aparecem. Tamanho da grade sem nenhuma peça desenhada: a coluna aparece
apagada, com "sem desenho", e não aceita número.

**Linhas**, nesta ordem:

1. cada **estampa guardada**, pelo nome;
2. a **estampa nova** — só quando o painel de arte tem arte e ela ainda não foi
   salva no molde (com o nome digitado, ou "estampa nova");
3. **sem estampa** — só o contorno.

A estampa **aberta no painel** para edição é uma linha como as outras (a dela);
some o "em edição — usa a quantidade lá de cima". Ao salvar a estampa nova no
molde, a linha dela vira a da estampa guardada e **leva os números junto**.

**Célula**: quantas **peças prontas** daquela estampa naquele tamanho. Inteiro
≥ 0; vazio vale 0. Célula em 0 não vai para o encaixe. Tudo começa em 0.

**Total**, embaixo da grade: "69 peças prontas → 312 peças para encaixar" — a
segunda conta já com os cortes por peça pronta, as espelhadas e as mudanças da
§2.

## 2. Mudar a quantidade de uma peça

Toda célula com número > 0 ganha um **▸**. Ele abre, abaixo da grade, as peças
daquele tamanho e daquela estampa, com a quantidade calculada:

    frente         20
    costas         20
    manga          40   (2 por peça pronta)
    manga (espelhada) 40

- A conta é `peca.quantidade × prontas da célula`, peça por peça, depois do
  `pecasParaOEncaixe` (a espelhada separada, como no Encaixe).
- Cada número é editável. O mudado fica marcado e ganha **"voltar à conta"**.
- Mudar as prontas da célula **refaz só as peças não mexidas**; as mexidas ficam
  como a pessoa deixou.
- Peça em **0 não vai**. É assim que se repõe só as mangas: a célula com as
  prontas, e as outras peças zeradas.
- Zerar a célula (prontas = 0) tira a célula do envio, inclusive as mexidas; elas
  continuam guardadas na janela se o número voltar.
- As mudanças são **só deste envio**: não vão para o molde e somem ao fechar a
  janela.

Um ▸ aberto por vez.

## 3. Mandar tudo de uma vez

Um botão só, **Mandar para o encaixe**, que manda **célula por célula**, pela
ordem da grade (linha por linha; dentro da linha, tamanho por tamanho). Cada
célula é uma chamada:

```ts
ligacao.mandarMoldeParaOEncaixe({
  nome: molde.nome, tamanho, unidades: 1,
  pecas: /* as peças da célula com arte desenhada, `quantidade` = a final da §2,
            só as > 0 */,
});
```

`unidades: 1` com a quantidade final em cada peça: o controlador faz
`max(1, quantidade × unidades)`, e é por isso que as peças em 0 **saem antes** —
senão chegariam como 1.

- A arte grande é desenhada por célula, na hora de mandar aquela célula (como
  hoje por trabalho). A imagem de uma estampa guardada é carregada uma vez só e
  serve para todos os tamanhos dela.
- O botão mostra o andamento: "Montando caveira · M (2 de 5)…".
- **Deu tudo certo**: fecha a janela e vai para o Encaixe (como hoje).
- **Falhou no meio**: a janela **não fecha**. O aviso diz o que foi e o que
  não foi — "Foram: caveira P, caveira M. Faltou: flor M, flor G — <motivo>" — e
  as células que **já foram ficam zeradas**, para o próximo clique mandar só o
  que faltou. O que já chegou no Encaixe fica lá.

**Não deixa mandar** (aviso, nada sai): nenhuma célula > 0; toda célula > 0 com
todas as peças zeradas; o Encaixe ocupado com outro trabalho (o erro que o
controlador já dá, "Aguarde o trabalho atual terminar…", vira o aviso de falha
acima, na primeira célula).

**Qualidade**: o aviso de pontos e dpi (`qualidade`) soma todas as células que
vão, e não só um tamanho.

## 4. O painel de arte

Continua igual, com um seletor **"ver no tamanho"** acima das peças: a arte é
por papel e serve para todos os tamanhos, e o seletor só escolhe em qual
tamanho a prévia é desenhada. Começa no tamanho base da grade (ou no primeiro).
Não tem nada a ver com o que vai para o encaixe.

## Contas puras

Em `src/telas/moldes/envioPorTamanho.ts`, sem React:

- `colunasDaGrade(molde)` — os tamanhos, na ordem, com `semDesenho`;
- `pecasDaCelula(pecas, tamanho, prontas, mexidas)` — as peças da célula com a
  quantidade final (conta ou mexida), a espelhada separada;
- `celulasParaMandar(grade, mexidas, …)` — a lista, na ordem, das células > 0 e
  das peças > 0 de cada uma;
- `resumo(...)` — o total de prontas e de peças para encaixar;
- `depoisDaFalha(grade, mandadas)` — a grade com as células que já foram
  zeradas.

## Testes

Bancada nova `bancada/conferir-envio-por-tamanho.mjs` (`npm run
bancada:envio`), no CI:

- as contas: prontas × cortes; a espelhada vira duas com a mesma quantidade;
  peça mexida não é refeita quando as prontas mudam, e a não mexida é; "voltar à
  conta"; célula 0 e peça 0 não vão; tamanho sem desenho não entra; molde sem
  grade usa os tamanhos das peças; a ordem das células; depois da falha, as
  mandadas zeram e as outras ficam.
- a janela de verdade, com React e jsdom (o jeito de
  `conferir-editor-de-nos.mjs`), com uma `ligacao` de mentira que anota o que
  recebeu: P e M da caveira e M da flor viram três chamadas com as quantidades
  certas e `unidades: 1`; uma chamada que falha deixa a janela aberta com as
  anteriores zeradas; salvar a estampa nova leva os números para a linha dela.

E na tela do app: um molde com grade P/M/G e duas estampas vai inteiro num
clique, e o Encaixe mostra as peças de cada tamanho e estampa com as quantidades
da grade.

## Arquivos

- **Novos**: `src/telas/moldes/envioPorTamanho.ts`,
  `src/telas/moldes/GradeDeQuantidades.tsx` (a grade e o ▸ das peças),
  `bancada/conferir-envio-por-tamanho.mjs` (e os cenários `.tsx`, se precisar).
- **Mudam**: `src/telas/moldes/EnvioParaEncaixe.tsx` (sai o tamanho único e as
  quantidades de cima e das estampas; entra a grade; o envio por célula; o "ver
  no tamanho" da prévia), `package.json` e `.github/workflows/conferir.yml`
  (`bancada:envio`).
- **Não mudam**: `src/producao/ligacao.ts`, `src/producao/controlador.js`.

## Fora do escopo

Guardar as quantidades no molde ou lembrar do último pedido; quantidade por
peça gravada no molde; mandar vários moldes de uma vez; mudar o Encaixe.

## Branch

`feature/encaixe-varios-tamanhos`, saindo da `feature/editor-corel` (a mesma
ponta da `Guilherme` no GitHub).
