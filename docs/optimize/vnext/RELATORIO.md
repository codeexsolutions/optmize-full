# Motor VNext — relatório da missão (2026-11-12)

**Branch:** `claude/motor-vnext` (worktree `.worktrees/motor-vnext`), a partir de
`8ce43b6` (Optmize 1.3.444). Nada foi enviado ao GitHub.

**Máquina:** AMD Ryzen 5 5600X (6 núcleos / 12 threads), 17 GB, Windows 11,
Node v24.18.0. As corridas rodaram com a máquina livre (carga de 4% antes de
começar), 5 corridas em paralelo — o mesmo regime da produção, que roda um
sparrow por worker.

Dados brutos de cada experimento: `docs/optimize/vnext/dados/*.json`.

---

## 0. O que já existia (e não foi refeito)

A missão de 2026-11-09/10 (Claude + Codex, branch `claude/encaixe-pesquisa`)
já tinha auditado o motor, formalizado o problema, provado limites inferiores
e medido as hipóteses de escala. Quase tudo que ela aprovou **já está na
1.3.444**:

| achado | estado na 1.3.444 |
|---|---|
| P4 — grade com piso físico em rolo largo (−1,72%, 3 sementes) | no código (`grade()`) |
| P7 — contorno exato no sparrow e trava trecho a trecho | no código, ligado só com giro livre (−2,1%) |
| P11 — sparrow por regiões acima de 500 peças (−1,57% / −2,28%) | no código (`REGIOES_MINIMO_PECAS`) |
| P12 — a busca para quando empaca e o sparrow fica com o resto | ligado desde 2026-11-10 |
| o melhor encaixe guardado vira a partida do sparrow | no código (`partidaGuardada`) |

O retrato que a missão anterior deixou, e que este trabalho confirma: **o
motor tem duas fases, e a qualidade final é decidida pela segunda.** A busca
construtiva (ILS sobre a ordem, decodificadores em grade) satura em ~1,5 s; o
sparrow (minimização de sobreposição, Gardeyn & Wauters) fica com ~85% do
tempo e entrega 1–5% de tecido depois dela. A curva "3,90 m em 60 s, 3,86 m em
500 s" é a curva côncava do sparrow.

**O caso 3,90 m / 3,86 m não pôde ser reproduzido**: as artes desse trabalho
não estão nesta máquina (os históricos guardam só as medidas de caixa das
peças, não as silhuetas). Nenhum número aqui finge ser ele.

**Audaces:** não há resultado de encaixe do Audaces disponível. Só existem os
leitores de molde (`.ads`/`.adsx`). Nenhuma comparação com o Audaces foi feita.

---

## 1. As ferramentas novas

| ferramenta | o que mede |
|---|---|
| `bancada/laboratorio-sparrow.js` | o sparrow sozinho, braço contra braço: mesma partida, sementes pareadas, corridas em paralelo com os braços intercalados; curva no tempo (25%/50%/fim), avaliações por segundo, **cm ganhos por mil avaliações**, separações resolvidas, vértices de colisão e inflação de área |
| `bancada/laboratorio-cooperar.js` | P workers sozinhos (hoje) contra os mesmos P workers cooperando em rodadas |
| `bancada/medir-repeticao.js` | quanto da busca construtiva reavalia ordens/encaixes já vistos |
| `wasm-encolher`: `ajustes` e `estatisticas()` | ajustes do sparrow por JSON (padrão intacto sem eles) e o trabalho real de cada chamada |
| `src/motores/limitesInferiores.js` | limites inferiores provados (área, Brunn–Minkowski, maior peça) e a distância até eles |
| painel "Diagnóstico do motor" | os números acima na tela, fechado por padrão |

---

## 2. Experimentos

### E1 — trabalhadores do separador do sparrow (1, 2 ou 3) — **REJEITADO**

**Observação.** Em WebAssembly o sparrow roda numa thread só. A cada
iteração, o separador roda `n_workers` passadas completas a partir do mesmo
estado e fica com a melhor (`move_items_multi`, algoritmo 10 do artigo); no
nativo elas correm em paralelo, aqui em fila. Com 3 (o padrão), dois terços
dessas passadas são descartados.

**Hipótese.** Com 1 trabalhador o sparrow dá ~3× mais iterações no mesmo
relógio e chega mais longe.

**Medido** (45 s, 3 sementes, 6 trabalhos, partida igual; `e1-trabalhadores-45s.json`):

| trabalho | t2 × t3 | t1 × t3 |
|---|---|---|
| producao-avulsa (175) | −0,43% ±0,22 | −0,12% ±0,24 |
| camiseta+manga+gola (32) | +0,01% ±1,11 | +0,89% ±1,19 |
| giro-livre (32) | −0,54% ±0,39 | **−0,79% ±0,10** |
| pedido-confeccao (64) | −0,11% ±0,45 | −0,48% ±0,30 |
| calca-bolso (24) | 0,00% | −0,37% ±0,37 |
| producao-misturada (276) | +0,03% ±0,31 | **+1,11% ±0,19** |

**Decisão: fica 3.** O "trabalho descartado" não é desperdício: escolher a
melhor de 3 passadas é uma intensificação que compra qualidade por iteração,
e no trabalho grande e misturado ela vale mais que as iterações a mais. Um
trabalhador só ganha no giro livre e perde feio no misturado; dois ficam no
ruído. Registrado para ninguém refazer.

### E2/E3 — simplificação dos polígonos e profundidade da quadtree — **DEPENDE DO TAMANHO**

**Observação.** As peças chegam ao sparrow como o contorno em escada da grade:
100 a 350 vértices por peça na grade de 2 mm (o jagua-rs ainda simplifica,
mas só até 0,1% de área). Os benchmarks em que o sparrow foi afinado têm
dezenas. E a quadtree do detector de colisão tem 4 níveis sobre a faixa
inteira — num rolo de 32 m por 1,79 m, cada folha tem 17:1 de proporção e
junta muitas peças.

**Hipóteses.** (E2) Simplificar mais (a forma só cresce: o polígono continua
contendo as células, e a trava confere a peça de verdade) troca um pouco de
área por muitas avaliações a mais. (E3) Mais níveis na quadtree barateiam a
consulta num rolo comprido.

**Medido** (45 s, 3 sementes; `e2e3-simplificacao-quadtree-45s.json`;
diferença pareada contra o padrão, ± erro padrão):

| trabalho | vért. colisão | s003 (0,3%) | s01 (1%) | q6 | q8 |
|---|---|---|---|---|---|
| producao-avulsa (175, 32 m) | 732 | −0,53 ±0,13 | **−1,08 ±0,13** | −0,32 ±0,06 | −0,35 ±0,14 |
| producao-misturada (276, 32 m) | 1.538 | −0,01 ±0,21 | **−0,41 ±0,12** | −0,28 ±0,02 | −0,31 ±0,03 |
| pedido-confeccao (64, 6 m) | 495 | +0,63 ±0,47 | +0,42 ±0,25 | 0,00 ±0,04 | +0,23 ±0,16 |
| camiseta+manga+gola (32, 3,6 m) | 235 | +0,74 ±1,23 | +0,83 ±0,35 | +0,05 ±0,05 | +0,05 ±0,05 |
| giro-livre (32, 3,5 m) | 309 | **−0,84 ±0,27** | +0,69 ±0,30 | +0,30 ±0,45 | +0,84 ±0,63 |
| calca-bolso (24, 2,2 m) | 103 | +0,22 ±0,13 | +0,45 ±0,00 | 0,00 | +0,07 ±0,07 |

Avaliações por segundo no avulsa: 38,6 mil (padrão) → 154 mil (s01). A
simplificação a 1% engorda as peças em ~1% de área.

**Leitura.** No trabalho grande o sparrow está longe de convergir em 45 s:
avaliação mais barata vira tecido, e a forma 1% maior custa menos do que a
velocidade compra (o s01 chega aos 11 s no consumo que o padrão só alcança
aos 45 s). No pequeno ele já convergiu, e sobra só o custo da forma inflada.
A quadtree mais funda ganha pouco e de forma muito consistente no rolo
comprido, e é neutra (6 níveis) no curto.

**Decisão: continuar.** Um ajuste fixo prejudica uma das pontas. Próximo
passo: o **grosso para o fino** (E7) — formas simplificadas no começo, a forma
de verdade no fim, recomeçando do melhor encaixe pela partida exata (o que a
etapa grossa acha continua válido na fina, porque a forma simplificada contém
a exata) — e validar no tempo que a produção dá de verdade.

### A repetição na busca construtiva (pergunta 1 do §15)

`medir-repeticao.js` (uma fatia do portfólio da produção, 20 s;
`repeticao-busca.json`):

| trabalho | tentativas | ordens novas | encaixes novos | metragens distintas | melhor em |
|---|---|---|---|---|---|
| camiseta+manga+gola | 18.151 | 60,8% | 51,3% | 513 | 7,3 s |
| giro-livre | 14.857 | 62,9% | 46,7% | 632 | 4,3 s |
| pedido-confeccao | 2.322 | 81,7% | 67,1% | 575 | 0,3 s |
| producao-avulsa | 229 | 94,3% | 90,4% | 200 | 4,1 s |
| producao-misturada | 180 | 98,3% | 94,4% | 156 | 0,4 s |

Nos trabalhos pequenos, **39% das tentativas decodificam uma ordem
equivalente a uma já avaliada** (mesma receita e mesma sequência de
silhuetas — trocar duas cópias da mesma peça de lugar não muda nada) e
metade dá um encaixe idêntico a um já visto. Nos grandes quase não há
repetição, mas cada tentativa é cara. Em todos, a busca acha o melhor dela
cedo, e é o sparrow quem decide o tecido final: o desperdício existe, mas não
é o gargalo — por isso não foi atacado primeiro.

### E5 — workers que cooperam — **GANHO PEQUENO, SEM PERDA**

**Observação.** Na produção, cada worker roda o sparrow sozinho, a partir do
mesmo encaixe, e fica o melhor dos N no fim. Se um worker acha cedo um
encaixe muito melhor, os outros continuam lapidando os piores.

**Hipótese.** Repartir o tempo em rodadas e, a cada rodada, todos recomeçarem
do melhor encaixe até ali (pela partida exata, sem a grade) concentra o
esforço onde já se provou bom.

**Medido** (5 workers, 45 s, 3 rodadas, 3 sementes, mesma partida e mesmas
sementes nos dois braços; `e5-cooperar-45s.json`):

| trabalho | cooperam × sozinhos | por semente |
|---|---|---|
| producao-avulsa (175) | **−0,30% ±0,04** | −0,32 · −0,21 · −0,35 |
| producao-misturada (276) | −0,07% ±0,14 | +0,02 · −0,34 · +0,12 |
| pedido-confeccao (64) | −0,13% ±0,24 | +0,29 · −0,55 · −0,13 |
| camiseta+manga+gola (32) | +0,05% ±0,13 | 0,00 · +0,29 · −0,15 |

**A diversidade do paralelismo de hoje (pergunta 9 do §15).** Os 5 workers
sozinhos terminam em metragens diferentes — dispersão de 0,2% a 2,4% entre o
melhor e o pior — e o melhor dos 5 sai 0,1% a 1,0% melhor que o worker
médio. O paralelismo por sementes produz diversidade real e vale o que custa;
cooperar troca parte dessa diversidade por profundidade, o que compensa no
trabalho de trajetória longa e empata nos outros.

**Decisão: aprovado com ressalva** — ganho consistente só no pedido de
produção. Entra junto com o "grosso para o fino" se o E7 confirmar que os
dois se somam; sozinho, o ganho médio (−0,11%) é pequeno.

### E6 — o corte guiado pelo desperdício (§7 do prompt) — **GANHA NO ROLO LONGO**

**Observação.** Para encurtar a faixa, o sparrow corta numa posição e empurra
para a esquerda tudo o que está à direita dela: na exploração, SEMPRE no meio
da faixa; na compressão, num ponto sorteado por igual. As peças dos dois lados
do corte passam a se sobrepor, e a separação tem de desfazer isso.

**Hipótese.** A sobreposição criada depende de quanto tecido está ocupado
perto do corte. Cortar onde a faixa está vazia (o perfil de ocupação ao longo
do rolo, em 256 fatias) cria menos sobreposição, e a separação resolve mais e
mais barato.

**Implementação.** `wasm-encolher/sparrow/src/util/corte_guiado.rs` (cópia
local do sparrow, mudança marcada `[Optmize]`, desligada por padrão): com
probabilidade `p`, sorteia a fatia com peso `(1 − ocupação)²`; senão, a regra
original.

**Medido** (45 s, 3 sementes; `e6-corte-guiado-45s.json`):

| trabalho | g05 (p=0,5) | g09 (p=0,9) | gC (só compressão, p=0,7) |
|---|---|---|---|
| producao-avulsa (32 m) | −0,49 ±0,17 | **−0,69 ±0,19** | −0,05 ±0,09 |
| producao-misturada (32 m) | −0,11 ±0,32 | −0,14 ±0,46 | −0,17 ±0,07 |
| pedido-confeccao (6 m) | +0,18 ±0,05 | +0,32 ±0,49 | −0,12 ±0,06 |
| camiseta+manga+gola (3,6 m) | −0,24 ±0,60 | −0,34 ±0,26 | +0,05 ±0,05 |
| giro-livre (3,5 m) | 0,00 ±0,60 | −0,05 ±0,57 | 0,00 |
| calca-bolso (2,2 m) | 0,00 | +0,15 ±0,07 | 0,00 |

No avulsa, as avaliações por segundo subiram de 55 mil para 65 mil com o
g09: as separações depois de um corte bem escolhido custam menos.

**Decisão: aprovado para o rolo longo.** Cortar no meio de um rolo de 3,6 m
não atrapalha; no de 32 m, sim. Entra no perfil de rolo longo junto com a
quadtree funda e o grosso para o fino (ver E7/E8).

### E7 — do grosso para o fino, no tempo que a produção dá

**Hipótese.** As etapas — polígono simplificado (1%) e quadtree de 6 níveis
primeiro, só explorando; depois a forma de verdade e a compressão fina,
recomeçando do melhor encaixe pela partida exata — juntam a velocidade do
s01 com a precisão do padrão.

**Tempos.** O que a tela sugere (`tempoSugerido`: 0,9 s por cópia, de 10 a
60 s, até 180 s para peça grande), menos a busca: ~25 s de sparrow para os
trabalhos pequenos, ~50 s para os médios, ~140 s para os de 175 peças.

**E7A — trabalhos pequenos, 25 s** (`e7a-grosso-fino-25s.json`):

| trabalho | q6 | grosso-fino (50/50) | grosso-médio-fino (40/30/30) |
|---|---|---|---|
| camiseta+manga+gola | −0,15 ±0,08 | −0,44 ±0,22 | −0,05 ±0,47 |
| giro-livre | +0,15 ±0,15 | −0,63 ±0,59 | −0,24 ±0,58 |
| calca-bolso | −0,07 ±0,07 | 0,00 ±0,26 | −0,15 ±0,15 |
| misturado-pequeno | 0,00 | +0,32 ±0,52 | 0,00 ±0,60 |

A simplificação PURA piorava os pequenos em +0,4% a +0,8% (E2); em etapas,
o prejuízo some — a etapa fina recupera o que a forma inflada custaria — e
fica no ruído, com leve tendência a favor. Sem prova de ganho nos pequenos,
o plano continua ligado só no rolo longo.

**E7B — trabalhos médios, 50 s** (`e7b-grosso-fino-50s.json`):

| trabalho | proporção | vért. colisão | aval/s (padrão) | q6 | grosso-fino | grosso-médio-fino |
|---|---|---|---|---|---|---|
| producao-misturada (276) | 18,2 | 1.538 | 66 mil | −0,21 ±0,16 | **−0,38 ±0,20** | −0,26 ±0,27 |
| pedido-uniforme (130) | 12,9 | 732 | 59 mil | −0,17 ±0,06 | **−0,33 ±0,12** | −0,14 ±0,07 |
| lote-grande (130) | 8,0 | 293 | 206 mil | −0,01 ±0,01 | +0,36 ±0,70 | +0,81 ±0,46 |
| pedido-confeccao (64) | 3,6 | 495 | 88 mil | −0,06 ±0,13 | +0,27 ±0,24 | +0,18 ±0,31 |

**O que decide não é só o comprimento.** O lote-grande tem rolo longo, mas
grade de 5 mm (folga de 1 cm) e poucos vértices: a avaliação já é barata
(206 mil/s), simplificar não acelera nada (205 mil/s) e só infla a forma. O
ganho aparece quando a avaliação é CARA — rolo longo E contorno com muitos
vértices (grade fina, folga pequena). A regra do plano passa a olhar as duas
coisas. E as **duas etapas (50/50)** ganham das três em todos os trabalhos
em que há sinal.

**E7C — os pedidos de 175 peças, 140 s** (o tempo que a tela dá a eles;
`e7c-grosso-fino-140s.json`):

| trabalho | q6 | grosso-fino | grosso-médio-fino |
|---|---|---|---|
| producao-avulsa | −0,05 ±0,03 | **−0,58 ±0,23** | −0,60 ±0,30 |
| producao-uniforme (a mesma geometria, declarada em 5 peças) | −0,13 ±0,10 | **−0,60 ±0,23** | −0,58 ±0,29 |

O ganho **não some com tempo longo**: com 140 s o grosso para o fino ainda
tira 0,6% do pedido de produção. Os dois trabalhos são a mesma geometria (o
sparrow agrupa por silhueta, então a instância é a mesma) e saíram quase
iguais — uma réplica de graça da medição.

**Decisão (E7): aprovado** para rolo longo com avaliação cara, em duas etapas
(50/50). Falta o E8: o plano inteiro (com o corte guiado do E6) por worker ×
cooperando, contra o de hoje, com 5 workers.

### E8 — o plano inteiro, como a produção roda — **APROVADO, EM RODADAS**

**O que se mediu.** O plano do rolo longo completo — duas etapas (50%
grossa: polígono a 1%, quadtree de 6 níveis, corte guiado; 50% fina: forma
de sempre, quadtree de 6, corte guiado na exploração e na compressão) —
com **5 workers**, no tempo que a tela dá a cada trabalho, em três braços:
o de hoje; o plano dentro de cada worker; e o plano em rodadas cooperativas
(na troca de etapa, todos recomeçam do melhor de todos). Partida, sementes e
relógio iguais nos três; a ordem dos braços gira entre as sementes.

| pedido (rolo longo) | tempo | plano por worker | plano cooperando |
|---|---|---|---|
| producao-misturada (276) | 50 s | −0,84% ±0,15 | **−0,92% ±0,18** |
| pedido-uniforme (130) | 100 s | −0,69% ±0,25 | **−0,84% ±0,20** |
| producao-avulsa (175) | 140 s | −0,55% ±0,20 | **−0,67% ±0,27** |

**Ganhou do motor de hoje nas 7 sementes**, nos dois braços; cooperando foi
melhor que por worker em 6 dos 7 pares (o outro empatou). Arquivos:
`e8-plano-misturada-50s.json`, `e8-plano-uniforme-100s.json`,
`e8-plano-avulsa-140s.json`.

**O mesmo resultado com menos esforço (pergunta 10 do §15).** No pedido de
produção, com um worker (E7C), o grosso para o fino chega aos 35 s
(31,720 m) ao consumo que o motor de hoje só alcança aos 140 s (31,736 m):
**~4× menos tempo para a mesma qualidade**. Com 5 workers e 140 s, o plano
cooperando chegou a 31,34–31,48 m; a referência da missão anterior, com o
motor de antes, 5 workers e **300 s**, foi 31,51 m (1 semente, outra sessão
— comparação indicativa, não pareada).

**Decisão: ligado na produção** (`planoDoSparrow` + `PLANO_EM_RODADAS =
true`), só no rolo longo com contorno de muitos vértices. Fora disso o
sparrow roda exatamente como antes (`conferir-plano.js` confere a porta nos
10 trabalhos do corpus).

---

## 3. Regressões e conferências

| conferência | resultado |
|---|---|
| `npm run tipos` | OK |
| as 8 conferências do CI (`bancada:revisao`, `conferir`, `encolher`, `complemento`, `giro-reposicao`, `largas`, `folga`) | todas OK |
| `bancada/conferir-limites.mjs` (limites inferiores, contas à mão) | OK |
| `bancada/conferir-plano.js` (a porta do plano nos 10 trabalhos) | OK |
| `bancada/conferir-cooperar-navegador.cjs` (o orquestrador de PRODUÇÃO, 8 Web Workers de verdade no Chromium, rodadas do plano cooperando) | OK — trava limpa, 0 recusados em 350 relatos, sem travar |
| `npm run front` (o programa inteiro empacota com o WASM novo) | OK |
| todas as corridas do laboratório (≈ 400 corridas do sparrow) | **0 pares sobrepostos** na trava independente; 0 encaixes recusados pela conferência |

Nenhuma validação geométrica foi relaxada: toda volta do sparrow continua
passando pela trava da produção (`acharSobreposicao`, trecho a trecho), e a
simplificação só ENGORDA a peça (o polígono contém as células), então o
arredondamento para a grade continua seguro pelo mesmo argumento de antes.

## 4. O que NÃO foi feito, e por quê

- **Lookahead, beam search, branch and bound na busca construtiva**: a busca
  não é o gargalo medido (ela acha o melhor dela em segundos; o sparrow decide
  o tecido final). Fica para os casos em que o sparrow não roda — bancada.
- **Redes neurais / aprendizado novo**: o motor já tem placar por assinatura,
  rede das receitas e o encaixe guardado como partida. A "inteligência" desta
  rodada é decidir COMO gastar o tempo por perfil de trabalho, com cada regra
  medida — não um modelo novo sem ganho demonstrado.
- **P5 (sparrow com bancada)**: caminho verificado no código e documentado em
  `PROXIMOS-PASSOS.md`; exige mexer no jagua-rs e no rastreador do sparrow.
- **Audaces e o caso 3,90/3,86 m**: sem os dados, não há comparação — e
  nenhuma foi inventada.

## 5. Arquivos

| arquivo | o quê |
|---|---|
| `wasm-encolher/src/lib.rs` | `ajustes` (JSON) e `estatisticas()`; a origem de cada melhoria |
| `wasm-encolher/sparrow/` | cópia local do sparrow (MIT), do mesmo commit, com o corte guiado (`[Optmize]`) |
| `src/motores/encaixeEncolher.js` | partida exata, etapas, estatísticas, `planoDoSparrow`, `cargaDeVertices` |
| `src/motores/encaixeParalelo.js` | rodadas cooperativas, o plano ligado, avaliações e origem no andamento |
| `src/motores/encaixeWorker.js` | ajustes, etapas, partida exata e estatísticas atravessando o worker |
| `src/motores/limitesInferiores.js` | limites inferiores provados e distância até eles |
| `src/motores/encaixeMotor.js` | medidor de repetição da busca (só com `medirRepeticao`) |
| `src/telas/DiagnosticoDoEncaixe.tsx`, `Encaixe.tsx`, `controlador.js` | o painel "Diagnóstico do motor" |
| `bancada/laboratorio-sparrow.js`, `laboratorio-cooperar.js`, `medir-repeticao.js`, `conferir-plano.js`, `conferir-limites.mjs`, `conferir-cooperar-navegador.cjs` + páginas `*-no-navegador.html` | o laboratório e as conferências |
| `bancada/corrida.js` | a bancada antiga também aplica o plano (mede o que a loja roda) |
