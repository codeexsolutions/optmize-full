# Auditoria de geometria, precisão e materiais grandes

**Autor:** Claude · **Data:** 2026-11-09 · **Revisão:** `7017c91` · **Estado:** etapa 1 + diagnóstico da etapa 3

Todo número aqui sai de um comando que está no repositório. Os dados brutos
ficam em `docs/optimize/benchmarks/dados/`.

---

## 1. Sistema de coordenadas e unidades

| Onde | Unidade | Tipo | Eixos |
|---|---|---|---|
| tela, posições, PDF (entrada) | cm | float64 | x = largura do tecido, y = comprimento |
| motor (grade) | célula de passo $h$ | Int32 (JS e WASM; somas em i64 no WASM) | coluna = largura, linha = comprimento |
| sparrow | célula | **f32** | **transposto**: x = linha, y = coluna |
| PDF (saída) | ponto (1/72") | float | página no tamanho real, sem `/UserUnit` |

Os giros são discretos (0/90/180/270). O giro de antes do encaixe
(`rotacaoBase`) e o do encaixe se somam na hora de desenhar. O PDF gira na
matriz da página, com a arte original de pé.

## 2. A cadeia de aproximações

A peça de verdade passa por três engordes antes de virar o que o motor
reserva no tecido:

```
silhueta  →  raster (toda célula tocada)  →  + folga (disco que garante distância entre quadrados)
          →  pegada coluna-convexa (topo..base em cada coluna)  ←  é isto que o encaixe e o sparrow usam
```

Medido peça por peça com `node bancada/auditar-geometria.js` (polígonos da
bancada; área em relação à área verdadeira do polígono):

**Grade da produção (179 cm, 4 mm → passo 0,2 cm, raio 1):**

| peça | raster | + folga | ideal com folga (BM ≤ … ≤ Steiner) | pegada 0° | pegada 90° | pegada / engordada |
|---|---|---|---|---|---|---|
| camiseta | +0,8% | +2,8% | +1,3% … +1,7% | **+11,6%** | +5,9% | **+8,6%** |
| regata | +0,9% | +3,2% | +1,5% … +2,1% | **+11,3%** | +8,0% | **+7,9%** |
| calça | +0,8% | +2,7% | +1,3% … +1,8% | +5,7% | +2,7% | +3,0% |
| manga | +1,2% | +4,2% | +2,2% … +2,4% | +4,2% | +4,2% | 0,0% |
| gola | +4,6% | +15,1% | +4,6% … +9,7% | +15,1% | +45,5% | 0,0% |
| uni-costa | +0,3% | +1,6% | +1,1% … +1,2% | +1,6% | +2,8% | 0,0% |

**Grade do laboratório (160 cm, 10 mm → passo 0,5 cm, raio 1):** a mesma
camiseta vai a +6,9% engordada e +16,6% de pegada; a gola a +38,2%; o bolso a +22,2%.

Leitura:

- **A pegada coluna-convexa é o maior custo nas peças de confecção.** A cava da
  camiseta e da regata é um vão dentro da coluna, e o motor o reserva inteiro.
  Nas peças sem vão vertical (manga, uniforme), a pegada é a própria silhueta
  engordada.
- **O disco é conservador.** No raio 1 ele é o quadrado 3×3, que garante a
  folga também na diagonal (a equipe mediu 1,87 mm saindo de 4 mm pedidos
  antes desse disco) e por isso engorda mais que o círculo ideal.
- **Peça pequena sofre mais** (gola, bolso, punho): a célula é grande perto dela.

## 3. Precisão numérica

### 3.1 O motor (busca construtiva) — verificado

Índices em Int32 em toda parte; o WASM soma o relevo em i64 onde a soma é
cumulativa. **Teste metamórfico** (`node bancada/conferir-invariancia.js`):
o mesmo encaixe começando $K$ linhas adiante no rolo tem de sair igual, só
deslocado. Resultado, para 3 trabalhos × 2 heurísticas × (JS, WASM), com $K$
até 2×10⁹ linhas:

- **11 de 12 combinações invariantes até K = 2.000.000.000.**
- **1 quebra:** WASM + heurística `vazio` + giro livre, a partir de
  K ≈ 9,34×10⁷ linhas (bisseção). Causa localizada em `wasm/src/lib.rs:314`:
  a soma do relevo é acumulada em i32 por raia do SIMD e só depois passa para
  i64; com ~23 blocos por raia, a raia dá a volta em K ≈ 2³¹/23. Impacto
  prático **nenhum** (rolo real < 10⁶ linhas), mas é defeito real: P9 em `PROPOSTAS.md`.

**Conclusão:** o comprimento do rolo **não** quebra a aritmética do motor em
escala de produção. A margem é de pelo menos ~90× sobre o maior rolo plausível.

### 3.2 O sparrow — f32

`jagua-rs 0.8.3` trabalha em f32 (`min_item_separation` é f32), em unidades de
célula, com o comprimento do rolo no eixo x. O passo do f32 perto de $L$
células é $L \cdot 2^{-23}$. A separação de 0,01 célula, que a volta para a
grade usa como margem de arredondamento, deixa de ser representável quando
$L \cdot 2^{-23} > 0{,}01$, ou seja, $L \gtrsim 83.900$ células:

| célula | limiar do f32 |
|---|---|
| 0,16 cm (160 cm, 3 mm) | ~134 m |
| 0,2 cm (179 cm, 4 mm) | ~168 m |
| 0,25 cm | ~210 m |

Como toda volta do sparrow é conferida (`resultadoDoSparrow`), o erro nunca
vira peça sobreposta: vira **encaixe rejeitado**, e o sparrow para de render.
Teste: §4.3.

### 3.3 O desenho — teto do canvas

Ver §4.2. Não é precisão numérica: é resolução de raster.

## 4. Materiais grandes — o diagnóstico

A missão pede para identificar **qual** destes acontece: perda de linha, de
continuidade ou de qualidade. São quatro mecanismos diferentes, um por eixo de
tamanho:

### 4.1 Tecido largo: a precisão cai com a largura (medido)

`grade()` (`encaixeMascara.js:185`) tem piso de passo `W/1000`: a grade nunca
passa de 1000 colunas. Abaixo do piso, a folga real sai maior que a pedida:

| largura | 2 mm pedidos | 3 mm | 4 mm | 5 mm |
|---|---|---|---|---|
| 100–150 cm | 2,0–3,0 mm | 3,0 mm | 4,0 mm | 5,0 mm |
| 179 cm | **3,6 mm (+79%)** | 3,6 mm (+19%) | 4,0 mm | 5,0 mm |
| 250 cm | **5,0 mm (+150%)** | 5,0 mm (+67%) | 5,0 mm (+25%) | 5,0 mm |
| 320 cm | **6,4 mm (+220%)** | 6,4 mm (+113%) | **6,4 mm (+60%)** | 6,4 mm (+28%) |

A silhueta engorda junto (camiseta, área com folga: +2,8% a 179 cm/4 mm,
+4,5% a 320 cm/4 mm). **É a precisão sendo reduzida conforme o material
cresce**, que a missão proíbe como solução. O efeito em consumo: §4.5.

### 4.2 Rolo longo: o desenho perde a linha (medido; causa da "perda de linha")

O resultado é desenhado num canvas do comprimento do rolo. Passando do teto do
Chrome, `resolucaoQueCabe` baixa a resolução **do desenho inteiro**. Com a
função real e a caixa de uma tela 1080p (179 cm de tecido):

| rolo | zoom 1× | 2× | 4× | 8× |
|---|---|---|---|---|
| 30 m | 1,50 | 1,50 | 1,50 | 0,91 |
| 60 m | 1,50 | 1,50 | 0,91 | **0,45** |
| 127 m | 1,50 | 0,86 | 0,43 | **0,21** |
| 300 m | 0,73 | 0,36 | 0,18 | **0,09** |

(pixels físicos por pixel de tela, com 1,5 pedido). O traço de 1 px vira uma
fração de pixel: fica apagado, e o contorno se quebra em pontilhado. **Aproximar
piora**, porque o teto é do canvas inteiro. O bitmap chega a 256 Mpx (~1 GB) a
cada redesenho.

As posições e a geometria estão certas; quem perde a linha é só o desenho.
**Correção implementada na branch (P1, "A JANELA DO RISCO")**: o canvas passa a
ter só o tamanho da parte visível, na resolução cheia, e a rolagem redesenha
essa parte. Verificação no navegador: §6.

### 4.3 Rolo longo: o sparrow (H-ESC-1 e o achado P11)

`node bancada/conferir-escala.js --teste rolo --tempo 120 --fatias 1` — o
mesmo pedido (`producao-avulsa`) multiplicado, 18 s de busca e 102 s de
sparrow por tamanho:

| lote | peças | linhas | ganho do sparrow | rejeitados/relatos |
|---|---|---|---|---|
| ×1 | 175 | 15.814 | 2,45% | 0/34 |
| ×2 | 350 | 31.841 | 2,60% | 0/38 |
| ×4 | 700 | 64.854 | 0,72% | 0/20 |
| ×6 | 1.050 | 97.710 | 0% | 0/8 |
| ×8 | 1.400 | 130.041 | 0% | 0/3 |

- **H-ESC-1 refutada na forma "rejeição":** zero rejeitados em todo tamanho,
  inclusive acima do limiar do f32 (84 mil linhas), e a trava limpa em todos.
- **Achado:** o ganho do sparrow cai a zero a partir de ~1.000 peças com o mesmo
  relógio por semente. A perda de qualidade em material grande vem daqui: a
  fase que fica com 85% do tempo deixa de render. A busca, por bloco de 175
  peças, entrega quase o mesmo em todos os tamanhos (variação de 0,8%).
- **Com o teto de tempo da produção** (280 s de sparrow): ×4 rende 1,05% e ×6
  rende 0,70%, sem rejeição, a 97 mil linhas (acima do limiar do f32). **A
  causa é tempo, não precisão**: o custo do sparrow cresce com o número de peças.
  A proposta é compactar por regiões, em paralelo (P11).

### 4.4 Rolo longo cortado em mesa: o sparrow desligado (H-ESC-2)

`motivoDoTrabalho` (`encaixeEncolher.js:139`) desliga a segunda fase quando a
bancada está ligada. `conferir-escala.js --teste bancada --tempo 60 --fatias 3`:

| | depois da busca | mídia | sparrow |
|---|---|---|---|
| sem bancada | 32,424 m | 31,748 m | −2,08% |
| bancada de 300 cm | 33,290 m | 32,942 m (+3,76%) | desligado |

**Confirmada (1 semente):** quem corta em mesa gasta ~3,8% a mais; ~1,6% é o
custo da regra (peça não cruza a linha) e ~2,1% é o sparrow que não roda (P5).

### 4.5 Rolo largo: a grade da folga pedida (H-ESC-3)

`conferir-escala.js --teste largo --tempo 60 --fatias 3` — 350 peças
(`producao-avulsa` ×2) num rolo de 320 cm, 4 mm pedidos, 1 semente:

| grade | folga real | linhas | depois da busca | final | trava |
|---|---|---|---|---|---|
| atual (0,32 cm, piso `W/1000`) | 6,4 mm | 11.065 | 35,816 m | 35,406 m | 0 pares |
| da folga pedida (0,20 cm) | 4,0 mm | 17.402 | 35,194 m | **34,804 m (−1,70%)** | 0 pares |

**Confirmada (1 semente):** a grade que dá a folga pedida gasta 1,7% menos
tecido com o mesmo relógio, apesar de ter 57% mais linhas. O mesmo sinal nas
duas fases (busca −1,74%, final −1,70%). Com 1.602 colunas, o WASM continua
valendo (teto de 4.096 em `encaixeWasm.js`).

### 4.6 Leitura dos testes de escala

| eixo do tamanho | o que se perde | mecanismo | evidência | proposta |
|---|---|---|---|---|
| comprimento (desenho) | **a linha** | canvas do rolo inteiro, resolução rebaixada pelo teto | tabela §4.2 (função real) | P1, implementada |
| comprimento (sparrow) | **qualidade** | o custo do sparrow cresce com o número de peças | 2,5% → 0% em 102 s, 0,7% em 280 s (§4.3) | P11 |
| comprimento em mesa | **qualidade** | sparrow desligado com bancada | +3,8% de mídia, ~2,1% do sparrow (§4.4) | P5 |
| largura | **precisão e tecido** | piso da grade `W/1000` | folga 6,4 mm em vez de 4; −1,7% com a grade certa (§4.5) | P4 |
| qualquer (números) | — | nenhum em escala de produção | invariância até 2×10⁹ linhas; 1 caso latente no WASM acima de 9×10⁷ | P9 |

Nenhum dos quatro mecanismos produz peça sobreposta: a trava independente
ficou limpa em todas as corridas. **O que os materiais grandes perdem é linha
na tela, folga fiel e qualidade de encaixe**, nunca a validade do corte.

### 4.7 O que foi descartado como causa

- **Estouro de inteiro no motor:** descartado pelo teste de invariância (§3.1).
- **PDF de rolo longo:** a página sai no tamanho real, acima das 200
  polegadas, sem `/UserUnit`. É decisão consciente, porque o RIP da produção
  (SAi Flexi) ignora o campo e imprimia a arte esticada
  (`encaixe-pdf.js:36`). Com bancada, sai uma página por bancada. Fica como
  risco de compatibilidade com outros RIPs, não como defeito.
- **Float32 do canvas:** irrelevante perto do teto de resolução.

## 5. Limites inferiores e o custo da representação

`node bancada/auditar-geometria.js`, parte 3 (metros; LB_modelo é o piso do
próprio modelo do motor, com a pegada):

| trabalho | peças | LB_area | LB_BM | LB_modelo | modelo/BM |
|---|---|---|---|---|---|
| camiseta+manga+gola | 32 | 2,556 | 2,649 | 2,918 | +10,2% |
| calca-bolso | 24 | 1,721 | 1,776 | 1,892 | +6,6% |
| giro-livre | 32 | 2,556 | 2,649 | 2,824 | +6,6% |
| tamanhos-extremos | 48 | 1,651 | 1,734 | 1,836 | +5,9% |
| producao-avulsa | 175 | 26,053 | 26,326 | 26,633 | **+1,2%** |
| pedido-confeccao | 64 | 4,570 | 4,640 | 4,958 | **+6,9%** |
| producao-misturada | 276 | 26,447 | 26,784 | 27,506 | +2,7% |

Os limites são frouxos (só área). O que eles provam: **nenhuma busca, por melhor
que seja, faz o motor de hoje passar do LB_modelo**, e a diferença entre ele e
o LB_BM só uma representação mais fiel (P7, P4) recupera. Em produção de
uniforme (peças grandes, sem cava, 4 mm) o teto é ~1%. Em confecção com cava
(`pedido-confeccao`) é ~7%.

## 6. A janela do risco no navegador

`bancada/janela-do-risco.html`, servido pelo Vite (`npx vite --port 5191`) e
aberto no Chromium do Playwright (DPR 1), com o `desenharEncaixe` de verdade e o
CSS da caixa do Encaixe. Risco sintético de 179 cm com peças de 25 × 20 cm,
rolado até o meio. "Contraste" é a mediana, em ~35 bordas visíveis, da maior
diferença de luminância entre o traço e a mesa (no desenho nítido, ~14,9):

| rolo | peças | zoom | sem janela: resolução · contraste · bitmap · tempo | **com janela** | clique → peça certa |
|---|---|---|---|---|---|
| 10 m | 270 | 1× | 1,00 · 14,9 · 1,6 Mpx · 8 ms | 1,00 · 14,9 · 0,6 Mpx · 2 ms | sim · sim |
| 10 m | 270 | 8× | 1,00 · 12,5 · 98,6 Mpx · 111 ms | 1,00 · 13,5 · 0,6 Mpx · 24 ms | sim · sim |
| 127 m | 3.462 | 1× | 1,00 · 14,6 · 20,7 Mpx · 267 ms | 1,00 · 14,9 · 0,6 Mpx · 9 ms | sim · sim |
| 127 m | 3.462 | 8× | **0,216 · 3,7** · 58 Mpx · 591 ms | **1,00 · 14,9** · 0,6 Mpx · 16 ms | sim · sim |
| 300 m | 8.178 | 1× | 0,73 · 11,6 · 26 Mpx · 531 ms | 1,00 · 14,9 · 0,6 Mpx · 9 ms | sim · sim |
| 300 m | 8.178 | 8× | **0,091 · 0,8** · 25 Mpx · 512 ms | **1,00 · 14,7** · 0,6 Mpx · 7 ms | sim · sim |

- **Sem a janela**, a linha cai a 25% do contraste (127 m, 8×) e a 5% (300 m,
  8×): é o "perde a linha". **Com a janela**, o contraste é o mesmo em
  qualquer rolo e zoom.
- O bitmap cai de até 98,6 Mpx para 0,6 Mpx, e o desenho de até 591 ms para
  2–24 ms. É isso que deixa redesenhar a cada quadro da rolagem.
- O clique no meio de uma peça visível, convertido para centímetro pela mesma
  conta do controlador (`emCm` + `origem`), caiu na peça certa nos 12 casos, e o
  ponto estava sobre o canvas (o `sticky` está onde a conta diz).
- Capturas: `benchmarks/dados/2026-11-09-risco-127m-8x-sem-janela.png` e
  `...-com-janela.png`.

**O que este teste não cobre:** o controlador de verdade (a tela pede login; a
bancada de tela está parada nisso desde antes). O redesenho na rolagem e o
arrasto de seleção foram conferidos no código, não na tela. Falta o Pedro
abrir um rolo longo, aproximar e rolar.
