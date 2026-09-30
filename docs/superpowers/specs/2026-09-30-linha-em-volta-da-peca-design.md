# Linha em volta da peça — um traço preto, da grossura escolhida, no molde todo

Data: 2026-09-30 · Estado: design aprovado em conversa, aguardando revisão da spec

Vem **depois** do encaixe de vários tamanhos
(`2026-09-30-encaixe-varios-tamanhos-design.md`), na mesma branch: as duas
mexem no envio da janela Arte e encaixe.

## Por que

O pedido: "na montagem quero colocar contorno na peça, aí a pessoa escolhe o
tamanho do contorno". Combinado em conversa: é uma **linha desenhada** em volta
da peça, que sai **impressa no tecido** (pelo Encaixe) e no **PDF/SVG** do
molde; **preta**, **centrada na borda**, com **uma grossura para o molde todo**.

Não é a margem de costura (que já existe e muda onde se corta), nem sangria da
arte, nem folga do encaixe.

## O que fica igual

- A margem de costura, a arte, os ajustes, a prévia.
- O Encaixe (`src/producao/controlador.js`): ele recebe peças como hoje.
- Molde com linha 0 (todos os de hoje): tudo sai exatamente como hoje.

## 1. Onde se escolhe

Um campo **"Linha em volta (mm)"** na barra da Montagem
(`BarraDaMontagem.tsx`), ao lado do nome do molde. Texto que aceita vírgula (o
jeito do campo da margem), de **0 a 10 mm**; vazio ou 0 = sem linha; fora do
intervalo ou não-número: o campo fica marcado inválido e o valor guardado não
muda. Vale no blur ou no Enter, e é um passo no desfazer da Montagem.

Vale para **todas as peças e todos os tamanhos** do molde.

## 2. Dados

- Coluna nova `moldes.linha_mm` — `REAL NOT NULL DEFAULT 0`, pelo
  `garantirColuna` de `servidor/db.js` (o mesmo da `situacao`).
- `servidor/moldes-api.js` lê e grava o campo; o valor gravado é limitado a
  0–10.
- `Molde` e `MoldeParaGravar` (`src/api/moldes.ts`) ganham `linha: number`
  (mm). Sem o campo ao gravar, o servidor mantém o guardado (o jeito de
  `tamanhos`).
- `useMoldeEmMontagem` carrega, muda e grava junto, na gravação automática.

## 3. Onde a linha fica

Na **borda de fora** da peça — a que é impressa: com margem de costura, a
**linha de corte**; sem margem, o **risco**. **Centrada** nela: metade da
grossura para dentro, metade para fora. Preta, cheia, com as quinas em
`miter` (limite 2) — a quina do molde fica quina.

Os furos da peça (quando houver) levam a linha também, centrada na borda deles.

## 4. No Encaixe

Metade da linha fica **fora** da peça, então a peça impressa é maior.

- O **contorno** mandado ao Encaixe é o da peça **afastado `grossura/2`**
  (`margemDeCostura(contorno, grossura/2)`, já existente), e `largura`/`altura`
  são as dele. É o que faz o Encaixe reservar o espaço da linha.
- O **desenho** (`desenharArteNoMolde`, que já tem as opções `linha` e
  `linhaGrossura`, hoje só usadas na prévia) ganha a linha: a arte continua
  **recortada na borda de verdade** (não no contorno afastado), e a linha é
  desenhada **por cima**, centrada na borda. A tela passa a ter o tamanho do
  contorno afastado.
- **Peça sem arte**: com linha > 0, a janela passa a mandar o `desenho` também
  para ela — a silhueta pintada (a cor que o Encaixe usaria) mais a linha. Sem
  isso, o Encaixe pintaria a silhueta por conta própria, sem linha. A silhueta
  continua cheia, então o `contorno: "auto"` do Encaixe acha o formato como
  hoje.
- A **prévia** da janela mostra a linha na grossura de verdade (na escala da
  prévia), para conferir.

## 5. No PDF e no SVG

`desenhoDaPeca` (`src/motores/montagem.js`) leva a grossura; a borda de fora
sai preta com ela em `svgDaMontagem` e no PDF (`servidor/risco-pdf.js`, pelo
`riscoApi.pdf`). Com linha 0, a borda sai como hoje. A costura tracejada (com
margem) não muda.

## Testes

Nas bancadas que já existem:

- `bancada/conferir-moldes-pecas.cjs`: `linha` gravada e relida; sem o campo, o
  servidor mantém a guardada; valor fora de 0–10 é limitado; molde antigo lê 0.
- `bancada/conferir-montagem.mjs`: com linha, o contorno para o Encaixe cresce
  `grossura/2` em volta (a caixa cresce `grossura` em cada eixo); com 0, é o de
  hoje; com margem de costura, a linha vai na linha de corte; `desenhoDaPeca`
  leva a grossura.
- a bancada do envio (`bancada/conferir-envio-por-tamanho.mjs`, da spec do
  encaixe de vários tamanhos): peça sem arte vai com `desenho` quando há linha, e
  sem, quando não há.

E na tela do app: linha de 2 mm num molde com uma peça com arte e outra sem; as
duas saem com o traço no Encaixe, e o PDF baixado mostra a borda grossa.

## Arquivos

- **Mudam**: `servidor/db.js`, `servidor/moldes-api.js`, `servidor/risco-pdf.js`,
  `src/api/moldes.ts`, `src/motores/montagem.js`, `src/motores/arteMolde.js`,
  `src/telas/montagem/useMoldeEmMontagem.ts`,
  `src/telas/montagem/BarraDaMontagem.tsx`,
  `src/telas/moldes/EnvioParaEncaixe.tsx` (e o `envioPorTamanho.ts` da spec
  anterior).

## Fora do escopo

A linha na mesa da Montagem; cor da linha; grossura por peça; linha tracejada;
linha só para dentro ou só para fora.

## Branch

`feature/encaixe-varios-tamanhos`, depois do encaixe de vários tamanhos.
