# Importar da Audaces — o molde graduado, com os tamanhos e as cores

Data: 2026-09-28 · Estado: design aprovado em conversa, aguardando revisão da spec

## Por que

A fábrica gradua na Audaces e quer trazer o molde **pronto**: todas as peças,
todos os tamanhos já graduados, e a **cor com que a Audaces desenha cada
tamanho**. Hoje o sistema lê DXF e PLT, mas só o desenho — junta linhas em
contornos e joga fora o que o arquivo diz de cada peça (nome, tamanho,
quantidade, piques, fio). Quem tem o molde graduado na Audaces não tem como
trazê-lo sem redesenhar.

Depois disso, a graduação feita **aqui** (parte D do Digitalizar melhor, spec
própria) usa o mesmo jeito de guardar e mostrar tamanhos que esta spec cria.

## O que a fábrica disse

- O arquivo de trabalho é o **`.ads`**, o nativo da Audaces, e **ele já traz a
  graduação inteira** dentro. Também sabem exportar **DXF-AAMA/ASTM** e **PLT**.
- O molde importado cai na **Montagem como rascunho**, com os tamanhos
  sobrepostos nas cores da Audaces; confere, conclui, vai à estante e ao
  Encaixe.
- Na peça, **nome, papel, quantidade, espelhar e margem valem para todos os
  tamanhos**; **o desenho de cada tamanho é o que veio da Audaces**, e mexer
  num tamanho mexe só nele.
- O pijama salvo em dois arquivos (M e G) tem de poder ser **juntado num molde
  só**, como um molde graduado.

## O que já se sabe do `.ads` (teste de 2026-09-28)

Quatro arquivos de `D:\uso de teste` (`SAIA BABADO CURTO.ads`, `SHORT
TACTEL.ads`, `PIJAMA INF. (M).ADS`, `PIJAMA INF. (G).ADS`, 11–15 KB):

| O quê | Como está no arquivo | Situação |
|---|---|---|
| Assinatura e versão | `CADZ vs6.0 \x1a` no byte 0 | confirmado nos 4 |
| Número de peças | `u32` no byte `0x0c` (4, 6, 8, 8) | confere com as fichas |
| Nome do molde | `u16` tamanho no byte `0x26` + texto | confirmado |
| Miniatura | `u32` tamanho + JPEG logo depois do nome | extraída e aberta |
| Dados | não compactados, não cifrados; blocos com etiqueta (o primeiro é `LIG`); números em `double` little-endian, em cm | confirmado |
| Caixa de cada peça | 4 `double` (minX, minY, maxX, maxY) no começo do bloco da peça | confere com o desenho |
| Contorno | trechos `u16 tipo, u16 n` + `n` pares de `double`; há parâmetros de Bézier (1/3, 2/3) | **em parte**: os trechos curvos saem certos (conferido contra a miniatura); faltam tipos (os retos, o retângulo da barra) |
| Ficha da peça | textos `u16 tamanho + texto`: nome com quantidade ("COSTA 2X") e um rótulo livre ("SAIA BABADO CURTO") | confirmado |
| Grade de tamanhos | tabela na peça, registros de 20 bytes: **cor RGB**, `u32` ativo, `01`, nome curto (P, M, G, GG), 8 bytes fixos. Saia e short: P `00ff00` verde, M `ff0000` vermelho, G `00ffff` ciano, GG `ff8000` laranja, os quatro ativos. Pijama M e G: um registro cada (ambos `ff0000`) | **achada e conferida nos 4** |
| Desenho de cada tamanho | ? | **não achado** — regra por ponto ou contorno por tamanho |
| Piques, fio, costura/corte | ? | **não achado** |

Saia e short trazem P, M, G e GG em todas as peças. Os dois pijamas trazem um
tamanho cada (M e G) — foram salvos um tamanho por arquivo.

## Decisões

### 1. Tamanhos com cor, na estante e na Montagem (pré-requisito de tudo)

**No banco** (`servidor/db.js`):

- Tabela nova `molde_tamanhos (molde_id, nome, cor, ordem, base)`, chave
  `(molde_id, nome)`, `cor` em `#rrggbb`, `base` 0/1. Molde sem linhas nela
  continua valendo: os tamanhos saem das peças (como hoje) e as cores de uma
  paleta padrão.
- `molde_pecas` continua **uma linha por peça por tamanho** (Encaixe, estampas
  e PDF seguem funcionando) e ganha a coluna `grupo INTEGER`: linhas com o
  mesmo `grupo` são a mesma peça em tamanhos diferentes. Nos moldes antigos, o
  `grupo` é preenchido pela posição da peça dentro do seu tamanho.
- Nome, papel, quantidade, espelhar e margem ficam gravados em cada linha, e a
  Montagem grava os mesmos valores em todas as linhas do grupo a cada mudança.
  Piques, pontos e fio ficam por tamanho.
- A API de moldes (`servidor/moldes-api.js`, `src/api/moldes.ts`) passa a
  levar e trazer `tamanhos: { nome, cor, ordem, base }[]` e `grupo` em cada
  peça.

**Na Montagem:**

- A **lista** mostra uma linha por grupo ("FRENTE ×2").
- Acima da mesa, **chips dos tamanhos** com a cor de cada um; o chip marcado é
  o tamanho que se edita. **"Ver tamanhos"** sobrepõe todos os tamanhos da peça
  nas suas cores, só para conferir (sem editar).
- O **painel da peça** (nome, papel, quantidade, espelhar, margem) muda o grupo
  inteiro. Nós, piques, pontos, fio e girar mexem só no tamanho marcado.
- **PDF e SVG** saem do tamanho marcado, com a opção "todos os tamanhos". O
  envio ao Encaixe já escolhe o tamanho e não muda.

**Juntar como outro tamanho** (o caso do pijama):

- Em "Juntar as peças de outro molde" entra **"como um tamanho novo"**, com
  nome e cor do tamanho.
- As peças dos dois moldes são casadas numa **tabela de casamento** que a
  pessoa confirma antes de juntar: para cada grupo daqui, a peça de lá com o
  nome mais parecido (sem o "2X", sem acento, tolerando erro de digitação —
  "BEMUDA MASC." ↔ "BERMUDA MASC.") e, no empate, a de caixa mais parecida.
  Cada linha tem um seletor para trocar o par. Peça sem par é avisada e não
  entra sem a pessoa decidir. Os pijamas M e G mostram por que: as peças vêm em
  outra ordem e com nomes diferentes ("PALA SHORT"/"PALA", "PALA MG"/"PALA
  MANGA").

### 2. Ler o `.ads`

- **Primeiro o documento do formato**, `docs/formatos/audaces-ads.md`: cada
  campo decifrado, onde fica, o que quer dizer e em quais arquivos foi
  conferido. O leitor só usa campo que está no documento.
- O leitor é conta pura, `src/motores/audacesAds.js`, rodando no navegador
  como os leitores de DXF e PLT: recebe os bytes e devolve `{ nome, tamanhos:
  [{ nome, cor, base }], pecas: [{ nome, quantidade, porTamanho: { [tamanho]:
  { nos, piques, fio } } }], avisos }`.
- A quantidade sai do sufixo do nome ("COSTA 2X" → nome "COSTA", quantidade
  2). O papel é chutado pelo nome com o vocabulário da estante
  (`telas/moldes/vocabulario.ts`); o que não for reconhecido vira "outro" com o
  nome original.
- As regras de graduação em si **não** são importadas — só os tamanhos já
  desenhados.

### 3. Ler o DXF-AAMA/ASTM

- Conta pura, `src/motores/dxfAama.js`, em cima do leitor de DXF que já existe
  (`src/motores/moldes.js`): um bloco por peça; camadas do padrão (1 contorno,
  4 piques, 7 fio, 8 linhas internas, 14 costura); textos "Piece Name",
  "Size", "Quantity", "Material".
- Tamanhos: se o arquivo traz **cada tamanho desenhado**, lê direto; se traz o
  base com a **tabela de regras (`.rul`)**, aplica as regras. Implementa-se só
  o que a Audaces de fato exporta, conferido no arquivo da fábrica.
- Serve também a moldes de outros programas (Gerber, Lectra), que exportam no
  mesmo padrão.

### 4. Onde entra na tela

Na estante de Moldes, **"Adicionar molde"** passa a aceitar `.ads` e
DXF-AAMA/ASTM. O sistema reconhece o formato pelo conteúdo (assinatura `CADZ`;
DXF com os textos do AAMA), cria o molde como **rascunho** e abre a Montagem
nele (`/montagem?molde=ID`) — o mesmo caminho do Digitalizar. DXF sem os
textos do AAMA segue pelo leitor de hoje.

## Como se sabe que leu certo

- **A caixa do próprio `.ads`:** o contorno lido de cada peça tem de caber na
  caixa gravada no arquivo com erro de até **0,5 mm**; peça que não passa **não
  entra**, e o aviso diz qual.
- **A miniatura do próprio `.ads`:** a bancada desenha o que leu e compara com
  o JPEG que a Audaces gravou: silhuetas reduzidas ao tamanho da miniatura,
  sobreposição (interseção sobre união) de pelo menos 0,9.
- **O DXF do mesmo molde:** com a exportação DXF-AAMA dos mesmos moldes, a
  bancada confere mesmas peças, mesmos tamanhos, contornos a menos de 0,5 mm.
- **Bancada `bancada:audaces`** (fora do CI): lê de `OPTMIZE_ARQUIVOS_AUDACES`
  (padrão `D:\uso de teste`) e pula com aviso o que não achar. **Os arquivos da
  fábrica não entram no git** (são moldes da empresa).
- **No CI:** casos montados byte a byte que provam cada parte do leitor
  (cabeçalho, textos, tabela de tamanhos, trechos de contorno) e o casamento de
  nomes da junção.
- A Montagem com tamanhos entra nas bancadas `bancada:montagem` e
  `bancada:moldes-pecas` (grupo, dados comuns gravados no grupo inteiro,
  molde antigo sem `molde_tamanhos` continuando a abrir).

## Quando dá errado

- **Versão diferente de `CADZ vs6.0`:** recusa com aviso claro ("esta versão
  da Audaces ainda não é lida; exporte em DXF-AAMA") — nunca adivinha.
- **Peça reprovada na conferência da caixa:** as outras entram; o aviso lista
  as que ficaram de fora.
- **Tamanho sem cor:** paleta padrão.
- **Junção com peça sem par:** não junta até a pessoa decidir.

## Ordem de entrega

1. Tamanhos com cor no banco, na API e na Montagem, e juntar como outro
   tamanho (vale para moldes que já existem).
2. Documento do formato `.ads` e o leitor, conferidos pela caixa e pela
   miniatura; depois pelo DXF, quando a fábrica mandar.
3. Leitor DXF-AAMA/ASTM, quando houver o arquivo exportado pela Audaces.

## Dependências e em aberto

- **Arquivos pedidos à fábrica:** a Saia Babado Curto e o Short Tactel
  exportados em **DXF-AAMA** (com todos os tamanhos), e um print da Audaces com
  um deles aberto mostrando os tamanhos e as cores. Sem eles a parte 3 não
  começa, e a parte 2 só fecha a conferência pela caixa e pela miniatura.
- **Risco do formato fechado:** se uma versão nova da Audaces mudar o `.ads`, o
  leitor recusa (ver acima) até ser atualizado; o DXF-AAMA fica como caminho de
  reserva. Conferir se a licença da Audaces diz algo sobre ler os arquivos fora
  do programa.

Fora do escopo: importar as regras de graduação como regras editáveis (é a
parte D), exportar de volta para a Audaces, PLT da Audaces (só desenho — o
leitor de PLT de hoje já cobre).
