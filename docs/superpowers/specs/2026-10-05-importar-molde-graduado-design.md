# Importar o molde graduado — o PLT da Audaces com todos os tamanhos

Data: 2026-10-05 · Estado: design aprovado em conversa; a pessoa pediu para
seguir até o fim sem parar para revisão.

## Por que

O pedido: "a graduação com contorno, já pra tela de Moldes aceitar arquivos com
contorno". Confirmado em conversa: é **importar um molde que já vem graduado**
— o arquivo traz o contorno de cada tamanho, e o Optmize cria o molde com
todos eles, cada um na cor da grade. Os formatos que chegam: `.ads`, DXF da
Audaces/Gerber e PLT.

## O que os arquivos de verdade mostraram (2026-10-05)

`D:\arte\Moldes e modelagens\molde fitness` tem 12 modelos da Audaces, cada um
com `.ads`, `.adsx` (10 deles), `.plt` e PDFs.

- **O `.plt` traz o desenho graduado**: um contorno fechado por tamanho de cada
  peça (a peça que não muda de tamanho aparece uma vez), em unidade de plotter.
  Os textos do molde vêm desenhados em traços miúdos. Os tamanhos de uma peça
  vêm uns sobre os outros ou lado a lado, conforme o arquivo; peças diferentes
  de forma parecida (frente e costas) vêm sobrepostas. Há PLT em PD com
  números e PLT em PE (comprimido). O PLT pode não trazer todas as peças do
  modelo (o do modelo 19 traz uma de cinco).
- **O `.adsx` é um ZIP** com `index.json`, `file.ads` (o mesmo `.ads`),
  `file.jpg` e **`data.xml`**: o nome do modelo, a grade (`SIZE_M`, com os
  nomes), e cada peça (`PATTERN`) com descrição, quantidade (`QT_MOD`), base
  (`BASE_NAME`) e, **por tamanho**, largura e altura (`WIDTH_SP`,
  `HEIGHT_SP`), área e perímetro — sem os pontos do contorno.
- **O `.ads`**: o leitor (`motores/audacesAds.js`) já lê o nome, as fichas
  (nome e quantidade) e a tabela de tamanhos (nomes e cores); o contorno de
  cada tamanho **não foi decifrado** (`docs/formatos/audaces-ads.md`).
- **DXF da Audaces/Gerber**: nenhum nesta máquina.

Medido com sondas sobre os 12 modelos:

- O leitor de PLT de hoje **lia errado** o PLT da Audaces: o espaço em
  `PD 1200,13951` virava um número a mais e as coordenadas escorregavam
  (consertado no `9bf83ea`, com a `bancada:plt`).
- **Com o gabarito do `data.xml`**, casando cada contorno pela largura × altura
  de cada (peça, tamanho): **55 de 67** peças presentes no PLT saem com todos os
  tamanhos, sem medida ambígua (exceto no modelo 16). As outras têm contornos
  que não fecham na leitura (peças na dobra, linhas abertas).
- **Sem gabarito**, agrupando por forma e sobreposição: **43 de 67**. A forma
  sozinha confunde frente e costas sobrepostas.

## O que fica igual

- O leitor de molde de um tamanho só (DXF, PLT, SVG, PDF) do "Adicionar molde".
- A Montagem, a grade, a graduação e o Encaixe: o molde importado é um molde
  como os outros, com grupos (a mesma peça em vários tamanhos) e a grade com cor.

Fora deste trabalho: DXF da Audaces/Gerber (falta um arquivo de exemplo); o
contorno lido do próprio `.ads`; as linhas internas, piques e o fio do PLT
(entram só os contornos); melhorar o fechamento das peças na dobra.

## 1. Ler

### 1.1 Os laços do PLT (`src/motores/pltGraduado.js`)

`lacosDoPLT(texto)` → `{ lacos: [{ pontos (cm, y para baixo), largura, altura,
area }], unidade, avisos }` ou `{ erro }`:

- os traços vêm de `tracosDoPLT` (posição original), em cm pela unidade dele;
- traço com caixa maior que 2,5 cm e pontas a até **1 cm** vira laço como está
  (a dobra deixa uma abertura de ~0,5 cm); os outros são emendados com
  `montarLacos`;
- fica de fora: laço com área < 1 cm² ou caixa < 2,5 cm (letras e marcas), e o
  retângulo do tamanho da folha.

### 1.2 O gabarito do `.adsx` (`src/motores/audacesAdsx.js`)

`lerAdsx(bytes)` (assíncrono: abre o ZIP com `DecompressionStream`) →
`{ nome, tamanhos: [nome…], base, pecas: [{ nome, quantidade, porTamanho:
{ [tamanho]: { largura, altura } } }] }` ou `{ erro }`. O nome da peça é o
`DESC_P` ou, vazio, "Peça N".

### 1.3 Casar e agrupar (`pltGraduado.js`)

- `casarComOGabarito(lacos, gabarito)`: para cada peça e cada tamanho, o laço
  de mesma largura × altura (tolerância 0,1 cm, girado também vale) que ninguém
  pegou; tamanhos com a mesma medida (a peça que não muda) usam o mesmo laço.
  Devolve as peças com `porTamanho: { [tamanho]: pontos }` e, para cada uma,
  os tamanhos que faltaram.
- `agruparTamanhos(lacos)`: sem gabarito. Cadeias de tamanhos: cada laço liga
  ao "próximo tamanho" — maior (área 60–100%), de forma parecida (Chamfer na
  caixa normalizada), proporção e salto de área pequenos, e sobreposto de
  preferência —, por custo crescente, um próximo e um anterior por laço. O
  número de tamanhos é o comprimento de cadeia mais comum; cadeia de outro
  comprimento se desfaz em peças avulsas. Devolve as peças com os laços do
  menor para o maior e esse número.

## 2. A tela (Moldes)

- A barra de Moldes ganha **"Importar graduado"**: um seletor que aceita
  `.plt` (obrigatório) com `.adsx` ou `.ads` do mesmo modelo, juntos.
- **Com `.adsx`**: casa pelo gabarito; os nomes dos tamanhos, o base, os nomes
  e as quantidades das peças vêm de lá.
- **Só com `.plt`** (ou com `.ads`): agrupa sem gabarito e abre a **grade**: o
  número de tamanhos achado, os nomes pré-preenchidos do menor para o maior
  (P, M, G, GG, XG, EXG… — ou os do `.ads`, quando vier), editáveis, e o base
  (o do meio).
- Antes de criar, a **conferência**: a lista das peças, cada uma com a
  miniatura dos tamanhos sobrepostos nas cores da grade, o nome e quantos
  tamanhos; peça incompleta em âmbar ("achei 2 de 4 tamanhos"). Botões Criar
  molde e Cancelar.
- **Criar**: um molde `rascunho` com o nome do modelo; cada peça vira um grupo,
  uma linha por tamanho (contorno e nós retos do polígono, `tamanho`, `grupo`,
  `quantidade`, papel chutado pelo nome), e a grade com as cores da paleta e o
  base. Abre a Montagem nele (`/montagem?molde=ID`).

## 3. Como se prova

1. **`bancada:plt`** (CI): o conserto do espaço; e um PLT graduado montado
   aqui (duas peças sobrepostas, quatro tamanhos cada, e letras) — `lacosDoPLT`
   acha os 8 laços e larga as letras; `agruparTamanhos` monta 2 peças de 4.
2. **`bancada:adsx`** (CI): um `.adsx` montado aqui (ZIP com `data.xml`) →
   `lerAdsx` devolve a grade, o base e as medidas; ZIP sem `data.xml` → erro.
3. **`bancada:plt-graduado`** (local, como a `bancada:curvas-reais`): os 12
   modelos de `D:\arte\...\molde fitness`; sem a pasta, avisa e sai. Com
   gabarito: **≥ 55 de 67** peças completas, e toda peça casada com as medidas
   do `data.xml` a 0,1 cm. Sem gabarito: **≥ 43 de 67**. Os números entram no
   log; subir é melhora, cair é reprovação.
4. **`bancada:tela`** ganha um passo: importar um PLT graduado montado no teste
   com o `.adsx` dele → o molde abre na Montagem com os 4 tamanhos.
5. Regressão: `tamanhos`, `montagem`, `moldes-pecas`, `audaces`, `tela`, `tsc`.

## Quando dá errado

- PLT sem laço nenhum: o aviso da leitura, e nada é criado.
- `.adsx` que não abre ou sem `data.xml`: avisa e segue sem gabarito.
- Peça do gabarito sem nenhum tamanho no PLT: não entra; o aviso diz quais.
- Laço que sobra sem dono no casamento: vira peça avulsa, em âmbar na
  conferência.

## Arquivos

- `src/motores/moldes.js` — `tracosDoPLT` (feito no `9bf83ea`).
- `src/motores/pltGraduado.js` (novo) — `lacosDoPLT`, `casarComOGabarito`,
  `agruparTamanhos`, `moldeGraduado` (monta as peças para gravar).
- `src/motores/audacesAdsx.js` (novo) — `lerAdsx`.
- `src/telas/moldes/ImportarGraduado.tsx` (novo) — o seletor, a grade e a
  conferência.
- `src/telas/Moldes.tsx` — o botão.
- Bancadas: `conferir-plt.mjs`, `conferir-adsx.mjs` (nova),
  `conferir-plt-graduado.mjs` (nova, local), `conferir-tela.cjs`.

## Branch

`feature/importar-graduado`, a partir de `feature/curvas-faceis`.
