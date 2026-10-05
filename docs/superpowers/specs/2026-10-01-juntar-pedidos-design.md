# Juntar pedidos — dois pedidos no mesmo rolo, cada peça marcada com o seu

Data: 2026-10-01 · Estado: design aprovado em conversa, aguardando revisão da spec

## Por que

O pedido: "quero que o sistema deixe toda produção ocupando menos espaço no
tecido". Antes de mexer no motor, os trabalhos guardados na Reposição foram
medidos com as **artes de verdade** (8 trabalhos, 188 artes, rolo de 178 cm,
folga de 0,4 cm), no tempo que a tela sugere, com a busca e o sparrow como a
produção roda.

| trabalho | só busca | busca + sparrow | piso (área ÷ largura) | acima do piso |
|---|---|---|---|---|
| #1 tiras, 200 cópias | 5,27 m | 5,07 m | 4,39 m | 15% |
| #2 323 cópias | 16,10 m | 16,06 m | 12,49 m | 29% |
| #3 240 cópias | 27,89 m | 26,97 m | 20,75 m | 30% |
| #4 305 cópias | 7,72 m | 7,54 m | 5,89 m | 28% |
| #5 324 cópias | 20,60 m | 20,47 m | 15,62 m | 31% |
| #6 camisas, 195 cópias | 67,52 m | 64,74 m | 48,32 m | 34% |
| #7 camisas, 175 cópias | 58,47 m | 55,51 m | 40,11 m | 38% |

O que sobra nos trabalhos grandes é **largura que não fecha**: costas de Polo
com 70 cm cabem duas por fila (140 de 178 cm), e a faixa de ~38 cm do lado
fica vazia o rolo inteiro. Os pedidos chegam separados por tipo de peça — um
só de camisas, outro só de tiras de 12 cm —, e as tiras são justamente o que
encheria essa faixa.

Duas medições decidiram o caminho:

- **Juntar pedidos.** #6 (camisas) + #1 (tiras) num rolo só, 120 s:
  **66,07 m**, contra 64,74 + 5,07 = **69,81 m** separados, no mesmo tempo
  total — **3,73 m a menos (−5,3%)**.
- **Mais tempo para o sparrow.** De 60 s para 180 s: #6 de 64,74 para
  **61,95 m (−4,3%)**; #1 de 5,07 para 5,04 m (−0,5%). O tempo a mais só rende
  em peça grande. A busca própria do motor não ganha com tempo (spec de
  2026-09-21: 32,30 m com 3 s e com 300 s).

Combinado em conversa: juntar pedidos é **decisão do operador, caso a caso**
(às vezes pode, às vezes não), os arquivos continuam chegando **arrastados
direto no Encaixe**, e o sistema tem de **marcar o pedido de cada peça** para a
separação depois do corte — **impresso no tecido**, em sigla, dentro da peça.

## O que fica igual

- O motor, a busca e o sparrow: o pedido é um rótulo que eles não leem. Mesmo
  trabalho com e sem pedido, mesma semente → mesmo encaixe.
- Rolo com **um pedido só** (todos os de hoje): tela, PNG e PDF saem
  exatamente como hoje. Nada de chip, nada de sigla.
- O **grupo** (`peca.grupo`): continua sendo o que é. O pedido **não** é um
  grupo — grupo prende as peças numa região e desliga o sparrow
  (`motivoDoTrabalho`), e é justamente o ganho de misturar que se quer aqui.

## 1. O pedido na peça

- Campo novo `peca.pedido`: texto curto, **até 6 caracteres**, maiúsculo, sem
  espaço (`P1`, `P2`, `JOAO`). É ao mesmo tempo o nome e a sigla do pedido.
- O primeiro lote que entra numa lista vazia é `P1`.
- **Arrastar arquivos** (ou usar o botão de adicionar) numa lista que já tem
  peças abre uma escolha rápida: **Mesmo pedido** (padrão, Enter) ou **Novo
  pedido** — que vira o próximo `Pn` livre. "Mesmo pedido" é o do último lote
  que entrou. Fechar a escolha (Esc) cancela a entrada dos arquivos.
- O Complementar (Galeria ou peças do encaixe) põe a peça nova no pedido da
  peça de origem; da Galeria, no pedido do último lote.
- Peça que entra por "Levar pro Encaixe" (Moldes, Projetos, Arte e encaixe)
  segue a mesma escolha do arrastar.
- Peça sem `pedido` (lista restaurada de antes desta mudança) conta como `P1`.

## 2. A lista

Com **2 ou mais pedidos** na lista:

- Cada linha ganha um **chip do pedido**: a sigla, na cor do pedido. Paleta
  própria, distinta da do grupo, e o chip de pedido é preenchido enquanto o de
  grupo é contornado — para não confundir os dois.
- Clicar no chip **renomeia o pedido** (todas as peças dele): campo de até 6
  caracteres, maiúsculo, sem espaço; nome já usado por outro pedido junta os
  dois, com aviso. Renomear não refaz o encaixe (o motor não lê o pedido),
  mas o risco na tela, o PNG e o PDF passam a sair com o nome novo.
- Tirar um pedido inteiro é pela seleção da lista, como qualquer peça hoje.

A cor de cada pedido sai do nome (o mesmo esquema de `corDoGrupo`): o mesmo
pedido tem sempre a mesma cor.

## 3. A sigla impressa no tecido (PDF)

Só com **2 ou mais pedidos no rolo**. Com um pedido só, o PDF sai como hoje.

### O texto

`<pedido> <peça><cópia>` — por exemplo `P2 COG3`.

- **Sigla da peça**: as duas primeiras letras da primeira palavra do nome do
  arquivo, mais o tamanho quando o nome traz um (`Tam G`, `Tam 3G`,
  `Tamanho GG`, ou um `_G`/` G ` solto de P, M, G, GG, XG, 3G, 4G); tudo
  maiúsculo, sem acento. `COSTAS_Camisa JOGO (Dry Tech) BRANCA Tam G =` →
  `COG`. Fica editável por peça na gaveta da linha (campo "Sigla", até 6
  caracteres) para quando o padrão não servir.
- **Cópia**: o número da cópia quando a peça tem mais de uma (`qtd > 1`),
  como a tarja do nome na tela já faz.

### Onde e como

- **Altura da letra: 4 mm.** Fonte sem serifa, em negrito, **preta com
  contorno branco fino** (0,3 mm) — lê em cima de qualquer estampa.
- **No canto de baixo à esquerda, dentro da silhueta**, recuada **3 mm** da
  borda da peça para não ser cortada. Em peça recortada (decote, cava, canto
  cortado), o canto da caixa pode cair fora do tecido: a posição sai da
  **máscara real** da peça (`mascaras.rotacoes[rot]`, sem a folga): a linha
  mais baixa, e nela a coluna mais à esquerda, em que o retângulo do texto
  (com o recuo) cabe inteiro dentro da silhueta. Procura-se de baixo para
  cima até a metade da peça.
- **Gira com a peça**: a posição é achada na máscara da rotação em que a peça
  foi encaixada, e o texto é escrito sempre de pé no sentido de leitura do
  rolo — "embaixo" é embaixo **no rolo**.
- **Não coube** (peça estreita demais para o texto em toda a metade de baixo):
  a peça sai **sem sigla**, e o aviso depois de exportar lista quais ficaram
  sem ("3 peças sem sigla: …"). Não se encolhe a letra — 4 mm é o mínimo
  combinado para ler na mesa.

### Quem faz o quê

- **`src/motores/siglaDoPedido.js`** (novo, funções puras, sem tela):
  `siglaDaPeca(nome)`, `textoDaSigla(item)`, e
  `lugarDaSigla(mascara, passo, larguraTextoCm, alturaTextoCm, recuoCm)` →
  `{ x, y }` em cm no quadro da peça, ou `null`. A largura do texto é medida
  pela tabela de larguras da fonte usada no PDF, para a conta do cliente e o
  desenho do servidor baterem.
- **`src/producao/controlador.js`**: ao montar o pedido do PDF (`daPeca`,
  hoje em ~3711), com 2+ pedidos, cada posição leva
  `marca: { texto, x, y, alturaCm: 0.4 }` (em cm no rolo).
- **`servidor/encaixe-pdf.js`**: depois de `doc.image` da peça, se houver
  `marca`, escreve o texto com o pdfkit — **fonte TTF embutida** no arquivo
  (o RIP da produção já mostrou que não se pode contar com o que ele "deveria"
  ter; ver `/UserUnit` no cabeçalho), contorno branco e preenchimento preto.
  O cabeçalho do arquivo, que hoje diz "nada de nome de peça", passa a contar a
  exceção e por quê.

## 4. A tela e o PNG da mesa de corte

Com 2 ou mais pedidos:

- No **risco da tela** e no **PNG da mesa de corte** (`desenharEncaixe`,
  `comLegenda: true`), cada peça ganha um **contorno na cor do pedido**, e a
  tarja do nome passa a começar pela sigla do pedido (`P2 · COSTAS…`).
- O PNG ganha uma **legenda no topo**: cor, sigla e quantas peças de cada
  pedido.
- A sigla do tecido também aparece na tela, no mesmo lugar e tamanho em que
  vai sair impressa — para a pessoa conferir antes de exportar.
- O resultado diz "2 pedidos no mesmo rolo". A metragem é a do rolo: não há
  metragem por pedido, porque as peças se misturam e qualquer divisão seria
  inventada.

## 5. Reposição e memória

- `reposicao_pecas` ganha a coluna `pedido` (`TEXT`, pelo `garantirColuna` de
  `servidor/db.js`); a reposição grava e devolve o pedido de cada peça, e a
  sigla editada (coluna `sigla`, `TEXT`).
- A chave do trabalho (`chaveDoTrabalho`) **não** inclui o pedido: o encaixe
  guardado vale para as mesmas peças, seja qual for o rótulo.

## 6. Mais tempo para trabalho de peça grande

- `tempoSugerido` hoje: entre 10 e 60 s, 0,9 s por cópia — só a quantidade.
- Passa a olhar também a **área média por cópia**: acima de um limiar, o teto
  sobe de 60 s para **até 180 s**.
- O **limiar** e o **teto** (120 ou 180 s) saem da curva medida na bancada
  (abaixo), não do chute: #3, #6 e #7 em 60, 120 e 180 s; a regra fica no
  ponto em que o ganho ainda paga a espera, e os números vão para o
  comentário da função.
- Continua sendo só a sugestão: o tempo digitado à mão manda
  (`tempoAjustadoPeloUsuario`).
- Pedidos juntos entram na mesma conta: o rolo de camisas + tiras sobe de teto
  pelas camisas.

## 7. Como se prova

- **`bancada/conferir-pedidos.mjs`** (`npm run bancada:pedidos`), saída ≠ 0
  em qualquer falha:
  1. o mesmo trabalho com e sem `pedido` nos itens, mesma semente → mesmas
     posições;
  2. `motivoDoTrabalho` com pedidos e sem grupo → `null` (o sparrow roda);
  3. `siglaDaPeca` nos nomes reais da produção (lista no teste) e
     `textoDaSigla` com e sem cópia;
  4. `lugarDaSigla`: em retângulo cheio cai no canto de baixo à esquerda com o
     recuo; em peça com canto cortado sobe até caber; em tira estreita demais
     devolve `null`; nas quatro rotações o retângulo do texto fica inteiro
     dentro da silhueta;
  5. o PDF de 2 pedidos traz o texto de cada marca (lido do PDF gerado) e o
     de 1 pedido não traz texto nenhum.
- **`bancada/medir-guardados.js`** (`npm run bancada:guardados`): a medição
  desta spec vira bancada. Lê o `dados.db` e as artes de `uploads/reposicao`
  **locais** — nenhuma arte de cliente entra no repositório; sem os arquivos,
  ela avisa e sai. Aceita trabalhos juntos (`6+1`) e tempo fixo. É ela que
  fixa a regra do tempo (seção 6).
- **Tela**: cenário de juntar dois lotes no navegador — a escolha ao arrastar,
  os chips, renomear, o contorno e a sigla no risco, a legenda no PNG.
- Regressão: `bancada:conferir`, `bancada:sobreposicao`, `bancada:encolher`,
  `bancada:pdf`.

## Fora deste trabalho

- A **fila de pedidos com sugestão automática** de quais juntar: passo
  seguinte, se o juntar à mão provar o ganho na produção.
- O **sparrow nos trabalhos de 300+ cópias** (#2, #5 ganham só ~1% com ele):
  investigação à parte.
- O **encaixe pelo CorelDRAW** (`servidor/encaixe-resolver.js`) continua sem
  o sparrow (ver `empacotar/modulos-do-motor.js`); fica registrado como
  ganho possível.
- Contorno exato no sparrow (~0,8% medido em 2026-09-21).
