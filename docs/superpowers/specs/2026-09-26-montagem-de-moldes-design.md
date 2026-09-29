# Montagem de moldes — a tela que vem depois do Digitalizar

Data: 2026-09-26 · Estado: aprovado (design em conversa), aguardando revisão da spec

Parte 1 de 3. As outras duas têm spec própria, depois desta:

1. **Montagem** (esta) — o molde digitalizado vira molde de verdade: peças
   identificadas, marcações técnicas, gravado na estante, PDF/SVG, Encaixar.
2. **Graduação** — tabelas de regras salvas, grade livre com tamanho base,
   regra por nó (graduação por pontos, no jeito do Audaces), tamanhos gerados.
3. **Digitalizar melhor** — etapas, apagar/desenhar peça, separar peças
   encostadas, corrigir perspectiva.

## Por que

Hoje o Digitalizar termina num download: PDF em tamanho real ou SVG. O risco
sai da tela como arquivo solto, sem nome de peça, sem quantidade, sem pique, e
não chega à estante nem ao Encaixe. Quem digitaliza um molde tem de abrir o
arquivo no Corel, marcar tudo à mão e depois importar de novo pela estante.

A tela nova é o passo do meio que falta: o que foi digitalizado vira um molde
da estante, montado e marcado, pronto para o Encaixe — e, na parte 2, para ser
graduado.

## Decisão

**O Digitalizar grava um molde-rascunho na estante e abre a Montagem em cima
dele** (`/montagem?molde=ID`). Descartados:

- passar as peças em memória para a tela nova: um F5 perde o trabalho, e a
  Montagem ficaria presa ao Digitalizar, sem abrir molde da estante;
- a Montagem como mais etapas dentro do `Digitalizar.tsx`: o arquivo já tem
  mais de mil linhas, e a graduação não teria onde morar para moldes que não
  vieram de foto (DXF, PLT).

Consequência desejada: a Montagem abre **qualquer** molde da estante, inclusive
os de DXF/PLT. É lá que a parte 2 vai graduar.

## Fluxo

1. **Digitalizar.** Os botões "Baixar em PDF" e "Baixar em SVG" saem. No lugar,
   **"Continuar para a montagem →"**, ativo só depois de a medida ser informada
   (a mesma trava de hoje: sem centímetro, nada segue).
2. O clique pede o nome do molde (vem preenchido com o nome da foto) e grava um
   molde com `situacao = 'rascunho'`: cada peça no tamanho `"base"`,
   `papel = "outro"`, `quantidade = 1`, com os nós com curva em cm. Abre
   `/montagem?molde=ID`.
3. **Montagem.** Edita esse molde; grava sozinha, ~1 s depois de cada mexida.
4. **"Concluir molde"** passa para `situacao = 'pronto'`. Só então **Encaixar**
   fica liberado.
5. **Estante (Moldes).** Rascunho aparece com selo "rascunho" e botão
   "Continuar montagem"; não vai ao Encaixe. Molde pronto ganha o botão
   **"Montagem"**, que abre a tela nova.

Rota `montagem` em `src/rotas.ts`, **no menu, no grupo Produção**, logo depois
de Digitalizar (pedido da pessoa em 2026-09-26: a tela é lugar de trabalho,
não só porta). Rótulo "Montagem", apoio "Peças, marcações e tamanhos", ícone
`icones.svg#layers`. É tela de BANCADA (sem cabeçalho, sem folga): entra na
lista `bancada` de `casca/Casca.tsx`.

Aberta pelo menu, sem `?molde`, ela mostra a **escolha do molde**: os
rascunhos primeiro (com a data), depois os prontos, com busca pelo nome.
Escolher troca o endereço para `/montagem?molde=ID`.

## Dados

Migração pelo `ALTER TABLE ... ADD COLUMN` que `servidor/db.js` já usa:

| coluna | tipo | significado |
|---|---|---|
| `moldes.situacao` | `TEXT NOT NULL DEFAULT 'pronto'` | `'rascunho'` ou `'pronto'`. Os moldes que já existem ficam prontos. |
| `molde_pecas.nos` | `TEXT NULL` | JSON: os nós com alça, em cm (o mesmo `NoDoRisco` de `api/risco.ts`). |
| `molde_pecas.marcacoes` | `TEXT NULL` | JSON: `Marcacoes`, abaixo. |

```ts
interface Marcacoes {
  /** Margem de costura em cm. 0 = o risco já é a linha de corte. */
  margem: number;
  /** A peça corta em par espelhado (manga direita/esquerda). */
  espelhar: boolean;
  /** Linha do fio: ponto de centro e ângulo em graus (0 = vertical). */
  fio: { x: number; y: number; angulo: number; comprimento: number };
  /** Presos ao traço: trecho que começa no nó `no`, na posição `t` (0..1). */
  piques: { no: number; t: number; profundidade: number }[];
  /** Furos de marcação (pence, bolso). Não são vazados, não mudam o corte. */
  pontos: { x: number; y: number }[];
}
```

**Invariante: `contorno`, `largura`, `altura` e `quantidade` continuam
significando a linha de corte, no mesmo formato de hoje.** Quando a peça tem
`nos`, quem calcula o `contorno` é a tela (curva achatada por `achatarCurvas`
+ margem por `margemDeCostura`, numa função só de `motores/montagem.js`), e
manda `nos`, `marcacoes` e `contorno` juntos. O servidor só confere a forma
(como já faz com o `contorno`) — não recalcula: ele é CommonJS e os motores
são ESM, e trazer a conta para lá não compra nada enquanto a tela for a única
que grava `nos`. O Encaixe, a estampa e o
`EnvioParaEncaixe` não mudam nesta parte, exceto pelo espelhar (abaixo).

Peça sem `nos` (veio de DXF/PLT): aberta na Montagem, o polígono vira nós de
canto (`canto: true`, `retaDepois: true`); ao gravar, passa a ter `nos`.

`furos` (vazados de verdade) continua como está, e não é editado nesta parte.

## A tela

Arquivo: `src/telas/Montagem.tsx`, janela inteira, no padrão da estante de
Moldes (barra parada no topo, miolo rola por dentro).

- **Barra do topo:** nome do molde (editável) · selo da situação · estado da
  gravação ("salvo", "salvando…", "não salvo") · Desfazer · **PDF** · **SVG** ·
  **Concluir molde** · **Encaixar**.
- **Esquerda — as peças:** miniatura na cor da peça (`utils/coresDePeca.ts`),
  papel, "×2", ícone de espelho, peça com erro em vermelho. Ações: apagar peça
  e **juntar peças de outro molde** (escolhe um molde da estante; as peças do
  tamanho base dele entram neste). Juntar não apaga o molde de origem.
- **Centro — a mesa:** a peça escolhida grande, zoom e arrasto, grade de 1 cm.
  Alternância **"ver todas"**: as peças lado a lado, só para conferir.
- **Direita — a peça:** papel (`PAPEIS_DE_PECA` de `telas/moldes/vocabulario.ts`,
  com o "outro" + texto de sempre), nome, quantidade, espelhar, margem de
  costura, largura × altura do corte (só leitura).

### Ferramentas da mesa

- **Nós** — a edição que o Digitalizar já tem: arrastar nó e alça, canto ↔
  curva, reta ↔ curva, inserir nó no traço, apagar nó, desfazer.
  **Essa lógica sai de `telas/Digitalizar.tsx`** para dois lugares comuns às
  duas telas: as contas puras (`naCurva`, `dividirCurva`, mover nó/alça,
  apagar nó, trocar reta↔curva, inserir nó no traço, o que está sob o
  ponteiro) em `src/motores/edicaoDeNos.js`, testáveis na bancada; e o
  desenho dos nós e alças no canvas em `src/telas/risco/desenhoDeNos.ts`. O
  Digitalizar continua desenhando a foto por baixo; a Montagem, a grade.
- **Pique** — clique no traço cria o pique preso a (nó, `t`). Profundidade
  padrão 0,5 cm. Mover nós mantém o pique em cima do traço. Inserir um nó
  antes dele remapeia (nó, `t`) para o trecho novo; apagar o nó de um trecho
  remapeia para o trecho que o substitui.
- **Ponto** — clique dentro da peça cria o furo de marcação.
- **Fio** — linha com seta, arrastável e girável; padrão vertical, no centro
  da caixa, com 60% da altura.

### Margem de costura

Foto de molde de papel quase sempre já é o corte, então o **padrão é 0**, com a
frase "o risco já é o corte". Com margem > 0, o risco vira a costura e a mesa
desenha o corte tracejado em volta.

Motor novo, `src/motores/margemDeCostura.js`, conta pura: offset para fora do
contorno achatado, junta em ponta, ponta aparada quando passa de 3× a margem.
Devolve o contorno de corte, ou `null` quando o resultado se cruza ou um trecho vira
do avesso (fenda mais estreita que duas margens). Quina côncava leva sempre o
encontro das duas retas; só a convexa é aparada. Nesse caso
a peça fica em vermelho e não é gravada com o contorno quebrado (fica o último
contorno bom).

### Espelhar + quantidade

Guardado uma vez só, aplicado no envio: `espelhar` com quantidade `q` manda
`ceil(q/2)` normais e `floor(q/2)` espelhadas. O espelho é horizontal e é
aplicado no CONTORNO (x → largura − x, ordem invertida para manter o sentido),
por `pecasParaOEncaixe` de `motores/montagem.js`, chamado em
`EnvioParaEncaixe` antes de desenhar a arte. A arte entra no contorno
espelhado como entra em qualquer outro. Nenhuma peça duplicada é gravada.

## Saída

Os dois arquivos saem do **molde gravado**, e não do estado da tela: o que se
baixa é o que o Encaixe vai receber. Enquanto houver algo sem salvar, os
botões esperam a gravação.

- **PDF** (`servidor/risco-pdf.js`, tamanho real, sem escala): corte contínuo;
  costura tracejada quando há margem; pique como traço para dentro na
  profundidade informada; ponto como cruz com círculo; fio como seta; dentro de
  cada peça o texto `papel · tamanho · ×q [espelhar]`. O corpo antigo
  (`pecas[].nos` sem marcações) continua aceito.
- **SVG** (`svgDaMontagem`, novo, em `motores/montagem.js`; o `svgDosRiscos`
  do Digitalizar fica como está, coberto pela bancada dele): as mesmas
  marcações, um `<g id>` por tipo — `corte`, `costura`, `piques`, `pontos`,
  `fio`, `textos` — para dar para esconder a camada inteira no Corel.
- **Encaixar**: abre o fluxo de `telas/moldes/EnvioParaEncaixe.tsx` com este
  molde (o mesmo que a estante abre hoje).

**Fora desta parte:** o Encaixe obedecer o fio ao girar peça. O fio fica
gravado e sai no PDF/SVG; o motor do Encaixe continua girando como hoje.

## Erros

- **Gravação falhou** (servidor fora): selo "não salvo"; a mudança fica na tela
  e é mandada de novo na próxima mexida ou no botão do selo. Concluir,
  Encaixar, PDF e SVG ficam bloqueados enquanto houver algo não salvo.
- **`/montagem` com id que não existe:** aviso "esse molde não existe mais" e
  a escolha do molde logo abaixo. (Sem `?molde` não é erro: é a escolha.)
- **Margem que se cruza:** peça em vermelho; Concluir diz qual peça.
- **Peça com `papel = "outro"` e sem nome ao concluir:** aviso que não trava
  ("a estampa não vai achar esta peça pelo papel").
- **Apagar a última peça:** não deixa; molde vazio se apaga pela estante.
- **Rascunho na estante:** não vai ao Encaixe (o botão aparece como
  "Continuar montagem").

## Testes

No padrão do projeto, scripts em `bancada/` com entrada em `package.json`:

- `bancada/conferir-margem.js` (`bancada:margem`): quadrado de 10 cm com
  margem 1 → caixa de 12 cm; quina aguda sai aparada; contorno que se cruza →
  `null`.
- `bancada/conferir-montagem.js` (`bancada:montagem`): pique continua no traço
  depois de mover nó, de inserir nó antes dele e de apagar o nó do trecho;
  espelhar com quantidade 3 → 2 normais + 1 espelhada; `nos` + margem →
  `contorno`, `largura`, `altura` coerentes; peça de DXF (só polígono) vira
  nós de canto e volta ao mesmo polígono.
- `bancada/conferir-risco-pdf.js` (`bancada:risco-pdf`): o corpo antigo
  continua gerando o PDF; o corpo com marcações também, e a página tem o
  tamanho do corte. (O `bancada:pdf` é o do encaixe e não muda.)
- No navegador (skill `run`): foto → Digitalizar → Continuar → Montagem →
  papel, pique, margem → recarregar a página (nada se perde) → Concluir →
  Encaixar → peças no Encaixe, com a espelhada virada.

## Arquivos

Novos: `src/telas/Montagem.tsx`, `src/telas/montagem/*` (painéis da tela),
`src/motores/edicaoDeNos.js`, `src/telas/risco/desenhoDeNos.ts`,
`src/motores/margemDeCostura.js`,
`src/motores/montagem.js` (pique preso ao traço, espelhar, nós ↔ contorno),
`bancada/conferir-margem.js`, `bancada/conferir-montagem.js`.

Mexidos: `src/telas/Digitalizar.tsx` (sai download e edição de nós; entra
"Continuar"), `src/rotas.ts`, `src/api/moldes.ts` (`situacao`, `nos`,
`marcacoes`), `servidor/db.js` (colunas), `servidor/moldes-api.js` (conferir,
gravar e devolver as colunas novas; o `PUT` aceita `situacao` opcional —
sem ela, a situação fica como está), `servidor/risco-pdf.js`,
`src/telas/Moldes.tsx`
(selo, botões), `src/telas/moldes/EnvioParaEncaixe.tsx` (espelhar),
`src/telas/moldes/EditorDeMolde.tsx` e `vocabulario.ts` (levar `nos` e
`marcacoes` de volta intactos ao regravar; trocar o arquivo da peça os
descarta), `src/casca/Casca.tsx` (bancada).
