# Referência de desempenho (baseline)

**Autor:** Claude · **Data:** 2026-11-09 · **Revisão:** `7017c91` · **Estado:** referência da etapa 2

## Condições

- **Máquina:** AMD Ryzen 5 5600X (6 núcleos / 12 threads), 17 GB, Windows 11,
  Node v24.18.0, WASM ligado.
- **Concorrência:** as corridas rodaram em fila, uma de cada vez. A máquina não
  ficou exclusiva: em momentos curtos rodaram também tarefas leves minhas (a
  auditoria de geometria, ~1 s; o teste de invariância, ~10 s; `tsc` e esbuild,
  ~30 s ao todo). O efeito esperado é pequeno perto do ruído documentado da
  bancada (0,23% de soma entre corridas iguais), mas a Codex deve repetir com a
  máquina livre antes de usar estes números para decidir alguma coisa.
- **Dados brutos:** `docs/optimize/benchmarks/dados/2026-11-09-*.json`. (O log
  da fila, `2026-11-09-corrida.log`, fica só na máquina: o `.gitignore` ignora
  `*.log`. Tudo o que ele mostra está nos JSON.)
- **Uma corrida descartada:** a primeira fila rodou as curvas sem
  `--extra motores=...`, ou seja, com o portfólio da bancada e não o da
  produção. Ela foi parada e refeita; nenhum número dela está aqui.

## 1. Protocolo histórico da bancada (só a busca, 3 s)

5 fatias × 3 s × 3 sementes, 6 trabalhos padrão. Duas corridas: com o padrão
da bancada e com o portfólio que a produção usa.

```
node bancada/medir.js --tempo 3 --sementes 3 --json padrao.json
node bancada/medir.js --tempo 3 --sementes 3 --extra motores=contorno+vaos+faixas --json producao.json
```

| trabalho | portfólio | média | mediana | melhor–pior | desvio | tent./s | vencedora | gap LB_BM | gap LB_modelo |
|---|---|---|---|---|---|---|---|---|---|
| camiseta+manga+gola | bancada | 3,572 | 3,575 | 3,565–3,575 | 0,47 cm | 17.988 | contorno/solta/area/fundo | 34,9% | 22,4% |
| camiseta+manga+gola | **produção** | **3,445** | 3,445 | 3,445–3,445 | 0,00 cm | 2.487 | vaos/solta/lado/fundo | 30,1% | 18,1% |
| so-camiseta | bancada | 2,790 | 2,790 | 2,790–2,790 | 0,00 cm | 39.253 | contorno/solta/lado/fundo | 43,3% | 27,0% |
| so-camiseta | produção | 2,790 | 2,790 | 2,790–2,790 | 0,00 cm | 13.600 | contorno/solta/lado/fundo | 43,3% | 27,0% |
| calca-bolso | bancada | 2,280 | 2,280 | 2,280–2,280 | 0,00 cm | 15.483 | contorno/dupla/area/fundo | 28,4% | 20,5% |
| calca-bolso | **produção** | **2,255** | 2,255 | 2,255–2,255 | 0,00 cm | 5.651 | vaos/dupla/area/fundo | 27,0% | 19,2% |
| misturado-pequeno | bancada | 2,180 | 2,185 | 2,170–2,185 | 0,71 cm | 21.803 | contorno/solta/altura/fundo | 32,6% | 20,4% |
| misturado-pequeno | **produção** | **2,138** | 2,140 | 2,130–2,145 | 0,62 cm | 4.934 | vaos/solta/area/fundo | 30,1% | 18,1% |
| giro-livre | bancada | 3,477 | 3,485 | 3,445–3,500 | 2,32 cm | 12.647 | contorno/solta/area/fundo | 31,3% | 23,1% |
| giro-livre | produção | 3,482 | 3,480 | 3,470–3,495 | 1,03 cm | 1.598 | vaos/solta/area/fundo | 31,5% | 23,3% |
| tamanhos-extremos | bancada | 2,090 | 2,090 | 2,090–2,090 | 0,00 cm | 9.957 | contorno/dupla/area/fundo | 20,5% | 13,8% |
| tamanhos-extremos | produção | 2,090 | 2,090 | 2,090–2,090 | 0,00 cm | 3.088 | vaos/dupla/area/fundo | 20,5% | 13,8% |
| **SOMA** | bancada | **16,388** | | | | | | | |
| **SOMA** | produção | **16,200** (−1,15%) | | | | | | | |

Leitura:

- O portfólio da produção ganha 1,15% na soma, bem acima do ruído de 0,25%.
  O `vaos` vence 5 de 6 trabalhos. A bancada padrão não o roda (ADR-0003).
- O `vaos` faz de 3 a 8 vezes **menos** tentativas por segundo, e mesmo assim
  ganha: o que compra tecido aqui é o encaixador, não o volume de tentativas.
- `giro-livre` empata (diferença dentro do desvio).
- O gap até o LB_modelo (o piso do próprio modelo do motor) fica entre 14% e
  27%. Como o limite só olha área, isso é **teto** do que uma busca melhor
  poderia ganhar, não uma estimativa.

## 2. A curva no tempo (produção: busca + sparrow)

`node bancada/curva-no-tempo.js --trabalhos producao-avulsa --tempo 300 --extra motores=contorno+vaos+faixas`
— 5 workers simulados (o melhor de cada instante entre eles), 300 s por
worker, como o campo da tela no máximo; a busca fica com 20 s e o sparrow com o
resto. 175 peças, 179 cm, 4 mm, 1 semente.

| marco | consumo | acima do final | parte do ganho total já obtida |
|---|---|---|---|
| 0,06 s (primeira completa) | 36,598 m | 16,1% | 0% |
| 1 s | 32,580 m | 3,40% | 79,0% |
| 1,5 s (fim real da busca) | 32,426 m | 2,91% | 82,0% |
| 3 s · 5 s · 10 s · 20 s | 32,426 m | 2,91% | 82,0% |
| 30 s | 32,210 m | 2,22% | 86,2% |
| 60 s | 31,826 m | 1,00% | 93,8% |
| 120 s | 31,722 m | 0,67% | 95,8% |
| 300 s | **31,510 m** | 0,00% | 100% |

49 melhorias; o sparrow relatou 176 encaixes e **nenhum** foi rejeitado.

Leitura:

1. **A busca satura em 1,5 s** e fica parada até os 20 s que tem. Neste
   trabalho, 18,5 s de cinco workers não compram nada.
2. **O sparrow leva ~5 s para o primeiro ganho** (começa aos 20 s, rende aos
   25,1 s): é o tempo de afastar as peças que se encostam no encaixe de partida.
3. **A curva do sparrow é côncava:** −1,85% até os 60 s, −0,33% de 60 a 120 s,
   −0,67% de 120 a 300 s (−0,22% por minuto no fim). Ir de 60 s para 300 s
   compra 1,0% de tecido. É o "3,90 m em 60 s × 3,86 m em 500 s" da missão,
   agora medido: o ganho existe, e o preço dele é conhecido.
4. Proposta para o Codex medir: a divisão do tempo pela curva, e não por
   15% fixo (a busca para quando empaca, por exemplo 2 × o tempo do último
   ganho, com piso de 1 s); e um aviso na tela de quanto o minuto a mais
   costuma render para aquele tamanho de trabalho.

**Trabalhos pequenos** (`--trabalhos camiseta+manga+gola,calca-bolso --tempo 120`;
busca de 18 s, sparrow com o resto; 160 cm, 10 mm; 1 semente):

| trabalho | primeira | fim da busca | 20 s | 30 s | 60 s | 120 s | ganho do sparrow |
|---|---|---|---|---|---|---|---|
| camiseta+manga+gola (32) | 5,230 m em 0,01 s | 3,445 m (já em 1 s) | 3,425 | **3,380** | 3,380 | 3,375 | −2,0% (0/143 rejeitados) |
| calca-bolso (24) | 2,280 m em 0,00 s | 2,255 m (já em 1 s) | **2,240** | 2,240 | 2,240 | 2,240 | −0,67% (0/83) |

Nos dois, a busca para em menos de 1 s e o sparrow entrega quase tudo nos
primeiros ~12 s dele; de 30 s para 120 s sai só mais 0,15%. **Para trabalho
pequeno, 30 s bastam**, e 17 dos 18 s da busca ficam parados (P12).

## 3. Escala: o mesmo pedido multiplicado

`node bancada/conferir-escala.js --teste rolo --tempo 120 --fatias 1`
(1 fatia: busca de 18 s + sparrow de 102 s por tamanho, portfólio da produção):

| lote | peças | linhas da grade | depois da busca | final | ganho do sparrow | rejeitados/relatos | trava |
|---|---|---|---|---|---|---|---|
| ×1 | 175 | 15.814 | 32,424 m | 31,628 m | 2,45% | 0/34 | 0 pares |
| ×2 | 350 | 31.841 | 65,382 m | 63,682 m | 2,60% | 0/38 | 0 pares |
| ×4 | 700 | 64.854 | 130,644 m | 129,708 m | 0,72% | 0/20 | 0 pares |
| ×6 | 1.050 | 97.710 | 195,420 m | 195,420 m | **0%** | 0/8 | 0 pares |
| ×8 | 1.400 | 130.041 | 260,082 m | 260,082 m | **0%** | 0/3 | 0 pares |

Com o teto de tempo da produção (`--vezes 4,6 --tempo 300`: 20 s de busca e
280 s de sparrow):

| lote | peças | linhas | depois da busca | final | ganho do sparrow | rejeitados/relatos |
|---|---|---|---|---|---|---|
| ×4 | 700 | 64.637 | 130,644 m | 129,274 m | 1,05% (era 0,72%) | 0/25 |
| ×6 | 1.050 | 97.030 | 195,420 m | 194,060 m | 0,70% (era 0%) | 0/29 |

Por bloco de 175 peças, a busca entrega quase o mesmo consumo em todos os
tamanhos (32,42 · 32,69 · 32,66 · 32,57 · 32,51 m, de ×1 a ×8; variação de
0,8%), ou seja, ela escala bem. **O sparrow não**:
com o mesmo relógio por semente, o ganho dele cai a zero a partir de ~1.000
peças. Nenhum encaixe foi rejeitado e a trava ficou limpa em todos, então o f32
não está gerando encaixe inválido nessa faixa (ver P6 e P11 em `research/PROPOSTAS.md`).

## 4. Bancada ligada e rolo largo

### 4.1 Bancada (H-ESC-2)

`node bancada/conferir-escala.js --teste bancada --tempo 60 --fatias 3`
(`producao-avulsa`, 175 peças, 179 cm, 4 mm; 1 semente):

| | depois da busca | mídia final | sparrow | rejeitados/relatos | trava |
|---|---|---|---|---|---|
| sem bancada | 32,424 m | **31,748 m** | −2,08% | 0/84 | 0 pares |
| bancada de 300 cm | 33,290 m | **32,942 m** (+3,76%) | desligado ("bancada ligada") | — | 0 pares |

Decomposição (aproximada, 1 semente): a regra da bancada sozinha custa
~1,6% (32,942 contra os 32,424 m da busca sem bancada); o sparrow desligado
custa os outros ~2,1%. **É isso que a P5 pode recuperar** para quem corta em mesa.

### 4.2 Rolo largo (H-ESC-3)

`node bancada/conferir-escala.js --teste largo --tempo 60 --fatias 3`
(`producao-avulsa` ×2 = 350 peças, 320 cm, 4 mm pedidos; 1 semente):

| grade | folga real | linhas | depois da busca | final | ganho do sparrow | trava |
|---|---|---|---|---|---|---|
| atual (0,32 cm) | 6,4 mm | 11.065 | 35,816 m | 35,406 m | 1,14% | 0 pares |
| da folga pedida (0,20 cm) | 4,0 mm | 17.402 | 35,194 m | **34,804 m (−1,70%)** | 1,11% | 0 pares |

## 5. Para repetir

```
node bancada/medir.js --tempo 3 --sementes 3 --extra motores=contorno+vaos+faixas
node bancada/curva-no-tempo.js --trabalhos producao-avulsa --tempo 300 --extra motores=contorno+vaos+faixas
node bancada/curva-no-tempo.js --trabalhos camiseta+manga+gola,calca-bolso --tempo 120 --extra motores=contorno+vaos+faixas
node bancada/conferir-escala.js --teste rolo --tempo 120 --fatias 1
node bancada/conferir-escala.js --teste bancada --tempo 60 --fatias 3
node bancada/conferir-escala.js --teste largo --tempo 60 --fatias 3
node bancada/auditar-geometria.js
node bancada/conferir-invariancia.js
```
