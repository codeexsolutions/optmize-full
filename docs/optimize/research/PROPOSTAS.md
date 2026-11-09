# Propostas priorizadas e matriz de decisão

**Autor:** Claude · **Data:** 2026-11-09 · **Estado:** para revisão do Codex

Cada proposta segue o protocolo do `README-CLAUDE.md`: hipótese, fundamento,
implementação, custo, benchmark, riscos, **o teste que a derruba** e o estado.
A prioridade é ganho esperado × confiança, dividido por custo × risco. Nada
aqui é prometido: o que está "medido" tem o número e o comando; o resto é
hipótese.

## Matriz de decisão

| # | Proposta | Classe | Ganho esperado | Confiança | Custo | Risco | Estado |
|---|---|---|---|---|---|---|---|
| P1 | Janela do risco (desenho só da parte visível) | correção de representação | linha nítida em qualquer rolo e zoom; bitmap de até 98,6 → 0,6 Mpx | alta (defeito e conserto medidos no navegador) | baixo | baixo | **implementado na branch; aprovado na bancada do navegador**; falta conferir na tela real |
| P2 | Bancada mede o portfólio da produção | validade de medição | toda decisão futura passa a valer para a loja | alta (medido: −1,15% de soma) | muito baixo | baixo | proposta (ADR-0003) |
| P3 | Limite inferior e curva no tempo nos relatórios | método | saber o teto da melhoria e se o tempo rende | alta | baixo | nenhum | scripts prontos (`auditar-geometria`, `curva-no-tempo`) |
| P4 | Grade com piso físico, não `W/1000` | precisão / material largo | **−1,70% de tecido medido** (320 cm, 4 mm); folga exata | média-alta (1 semente) | baixo no código, médio na medição | médio (tempo por tentativa) | **confirmada**; repetir com 3–5 sementes |
| P5 | Sparrow com bancada (linhas proibidas) | qualidade / rolo em mesa | **~2,1% medido** (o sparrow que não roda) | média-alta (1 semente; caminho verificado no jagua-rs) | médio | médio | **confirmada**; protótipo a fazer |
| P6 | Sparrow em rolo longo: precisão f32 | precisão / rolo longo | — | **refutada como rejeição** (0 rejeitados até 130 mil linhas) | — | — | resta um teste de escala de unidade |
| P11 | Sparrow em trabalho grande: compactação por regiões, em paralelo | qualidade / escala | de ~0,7% para ~2% em 1.050 peças (estimativa) | média (defeito medido; causa = tempo, medida) | médio | médio | **achado novo**; protótipo a fazer |
| P7 | Fase exata: contorno de verdade no sparrow e na trava | geometria | ~0,8% medido pela equipe; teto de 1–13% pelo LB_modelo | média | alto | médio | proposta |
| P8 | Aproveitamento com área verdadeira | honestidade da métrica | número exibido sem viés de 0,3–12% por peça | alta | baixo | baixo (o número cai) | proposta |
| P9 | Soma do relevo em i64 no WASM | robustez numérica | invariância por translação em qualquer K | alta (achado e localizado) | muito baixo | nenhum | proposta |
| P10 | Consentimento da memória coletiva | governança | conformidade (LGPD), confiança do cliente | — | baixo | — | **decisão do dono do produto** |
| P12 | Divisão do tempo pela curva, não 15% fixo | eficiência (anytime) | pequeno em 300 s; maior em tempos curtos (a busca satura em 1,5 s e fica com até 20 s) | média | baixo | baixo | proposta, a medir |

Fica de fora, de propósito, por enquanto: algoritmo genético, tabu, ALNS e
CP-SAT para o problema inteiro. O motor já tem ILS com portfólio e uma fase de
compactação do estado da arte; trocar a busca não ataca nenhum dos gargalos
achados, que são de **representação** e de **escala**. CP-SAT pode valer num
subproblema (a distribuição das peças entre bancadas, por exemplo), e só depois
de P5.

---

## P1 — A janela do risco

- **Problema.** Num rolo longo, aproximar o desenho apaga as linhas. Medido com
  a função real `resolucaoQueCabe`: uma linha de 1 px vira 0,45 px (60 m, 8×),
  0,21 px (127 m, 8×) e 0,09 px (300 m, 8×). O canvas chega a 256 Mpx (~1 GB).
- **Hipótese.** O defeito é do desenho (um canvas do tamanho do rolo), não da
  geometria: as posições estão certas, o que se perde é a resolução.
- **Implementação.** `desenharEncaixe(..., { janela: true })`: a caixa vira uma
  grade de uma célula do tamanho do risco, o canvas gruda (`sticky`) com o
  tamanho da parte visível, o desenho é o mesmo com `translate`, e peças fora da
  janela não são desenhadas. A vista ganha `origem` para o clique. A rolagem
  redesenha um quadro por vez.
- **Teste que derruba.** `bancada/janela-do-risco.html`: com a janela, a
  resolução efetiva tem de ser a da tela e o contraste da linha tem de ficar
  igual em 10 m e em 300 m, a 1× e a 8×. O clique no meio de uma peça visível,
  depois de rolar, tem de voltar para aquela peça.
- **Resultado** (`GEOMETRY_AUDIT-CLAUDE.md`, §6): passou. Contraste de 14,7–14,9 em
  todos os casos com a janela, contra 3,7 (127 m, 8×) e 0,8 (300 m, 8×) sem ela;
  o clique acertou nos 12 casos; o desenho caiu de até 591 ms para até 24 ms.
- **Riscos.** A impressão da página pelo navegador (`@media print`) passaria a
  sair só com a janela. Rolagem muito rápida pode mostrar um quadro atrasado.

## P2 — A bancada mede o que a loja roda

- **Problema.** `bancada/corrida.js` usa `contorno + retangulo` quando
  `motores` não vem; a produção usa `contorno + vaos + faixas`.
- **Medido** (`benchmarks/dados/2026-11-09-padrao-*.json`, 3 s × 3 sementes):
  soma 16,388 m no padrão da bancada contra 16,200 m no portfólio da produção.
  O `vaos` vence 5 dos 6 trabalhos.
- **Proposta.** O padrão da corrida passa a ser o da produção, e a bancada
  escreve no JSON quais motores mediu. As medições antigas continuam
  comparáveis com `--extra motores=contorno+retangulo`.
- **Teste que derruba.** Se a produção mudar de portfólio e a bancada não
  acompanhar, o teste de paridade (proposto) falha: ele compara a lista de
  motores do controlador com a da corrida.

## P3 — Limite inferior e curva no tempo

- **Fundamento.** `FORMALIZACAO.md`, §5 (Brunn–Minkowski) e a regra da missão
  ("não confundir o melhor de muitas tentativas com o típico").
- **Implementação.** Feita em scripts à parte; proposta: o `medir.js` passa a
  imprimir LB_BM e o gap, e o JSON passa a guardar a curva.

## P4 — Grade com piso físico

- **Problema.** `grade()` tem piso `W/1000`: a grade nunca passa de 1000
  colunas. A folga real cresce com a largura do tecido: 4 mm pedidos saem 4 mm
  até 200 cm e **6,4 mm em 320 cm**; 2 mm saem 3,6 mm em 179 cm e 6,4 mm em 320 cm.
  A silhueta também engorda mais (camiseta: +2,8% de área a 179 cm, +4,5% a 320 cm).
- **Hipótese H-ESC-3.** Uma grade que dá a folga pedida gasta menos tecido,
  mesmo com o encaixe mais lento por tentativa.
- **Medido** (`conferir-escala.js --teste largo`, 350 peças, 320 cm, 4 mm,
  3 fatias × 60 s, 1 semente): grade atual (0,32 cm, folga real 6,4 mm)
  35,406 m; grade da folga pedida (0,20 cm, 4 mm) **34,804 m, −1,70%**, com 57%
  mais linhas. Mesmo sinal na busca (−1,74%). **Confirmada, falta repetir com
  3 a 5 sementes.**
- **Implementação proposta.** O piso deixa de ser `W/1000` e passa a ser
  físico, limitado só pelo teto do WASM: por exemplo
  `max(PASSO_MINIMO_CM, W/4000)`, com `PASSO_MINIMO_CM` escolhido por medição
  entre 0,1 e 0,2 cm. Assim a folga sai exata sempre que `folga/2 ≥ piso`.
- **Teste que derruba.** Repetir em larguras de 150, 179, 250 e 320 cm, folgas
  de 2 a 5 mm, 3 a 5 sementes, com os pisos candidatos. Se em alguma faixa a
  grade fina gastar mais tecido no mesmo relógio, o piso fica maior ali.
- **Riscos.** Mais colunas, então menos tentativas por segundo e mais vértices
  no sparrow. É exatamente o que o teste mede.

## P5 — Sparrow com bancada

- **Problema.** `motivoDoTrabalho` desliga o sparrow com bancada ligada. Quem
  corta em mesa fica só com a busca, que o código diz que satura em ~3 s.
- **Hipótese H-ESC-2.** Com bancada, a mídia fica pior do que a sem bancada por
  mais que a diferença de geometria explica.
- **Medido** (`conferir-escala.js --teste bancada`, 1 semente): com bancada de
  3 m a mídia sai 3,76% maior; ~1,6% é a regra e **~2,1% é o sparrow desligado**.
- **Caminho recomendado: a linha de corte como zona proibida do sparrow.**
  Verificado no código do `jagua-rs 0.8.3`: o `Container` aceita
  `quality_zones` (`entities/container.rs`), a peça aceita `min_quality`
  (`entities/item.rs`) e zona abaixo da qualidade exigida vira obstáculo
  (`collision_detection/hazards/filter.rs`). Só que a faixa do strip packing é
  convertida em contêiner **sem zonas** (`probs/spp/entities/strip.rs`,
  `impl From<Strip> for Container`, que passa `vec![]`). O remendo é pequeno:
  a faixa leva as zonas fixas (uma faixa fina em cada `y = kB`, recortada na
  largura atual), e toda peça exige qualidade acima delas. A largura da zona
  tem de cobrir a sobra da ARTE além da silhueta (`sobraDaArte`), porque é o
  retângulo da arte que não pode cruzar; a volta passa pela conferência de
  corte da bancada (`bancada/conferir-bancada.js`) antes de valer.
- **Alternativas, piores:** (a) sparrow só na última bancada — o ganho fica
  limitado a ela; (b) sparrow por bancada, como chapas fixas, com troca de peças
  entre elas — mais código, e o sparrow é de strip packing.
- **Teste que derruba.** O protótipo contra o motor de hoje com bancada ligada,
  3 a 5 sementes: se a mídia não cair além do ruído, ou se a conferência de
  corte acusar peça cruzando a linha, a proposta cai.

## P6 — Sparrow em rolo longo: precisão (H-ESC-1)

- **Problema suposto.** O sparrow trabalha em f32, em células. A separação de
  0,01 célula deixa de caber no f32 a partir de $0{,}01 \times 2^{23} \approx
  83.900$ células (168 m com célula de 2 mm). A volta é conferida, então o erro
  viraria **encaixe rejeitado**, nunca peça sobreposta.
- **Teste** (`conferir-escala.js --teste rolo`, 1 fatia, 120 s por tamanho,
  `producao-avulsa` multiplicado): **zero rejeitados em todos os tamanhos**, até
  130 mil linhas (260 m), e a trava independente limpa em todos.
- **Veredito: refutada na forma "rejeição"** até 130 mil linhas. E o teste com
  mais tempo (P11, abaixo) mostrou o sparrow **melhorando 0,70% a 97 mil
  linhas, acima do limiar, sem rejeição**: o f32 não é o que trava o trabalho
  grande nessa faixa. Se um dia for preciso fechar a questão de vez: o mesmo
  trabalho com as coordenadas do sparrow multiplicadas por uma escala (problema
  idêntico, números maiores).

## P11 — Sparrow em trabalho grande: o tempo não escala (achado do mesmo teste)

- **Medido** (mesmo teste, 102 s de sparrow por semente):

  | lote | peças | ganho do sparrow | relatos |
  |---|---|---|---|
  | ×1 | 175 | 2,45% | 34 |
  | ×2 | 350 | 2,60% | 38 |
  | ×4 | 700 | 0,72% | 20 |
  | ×6 | 1.050 | **0%** | 8 |
  | ×8 | 1.400 | **0%** | 3 |

- **Problema.** Em trabalho grande, a fase que fica com 85% do tempo rende
  pouco ou nada no relógio da produção.
- **Teste 1, feito** (`--vezes 4,6 --tempo 300`, 280 s de sparrow por semente,
  o teto da produção): ×4 **1,05%** (era 0,72% com 102 s), ×6 **0,70%** (era 0%),
  0 rejeitados. **É tempo**: o custo do sparrow cresce com o número de peças, e
  quanto maior o trabalho, mais longe ele fica dos ~2,5–2,8% que rende em 175 peças.
- **Proposta: compactar por regiões, em paralelo.** Hoje todos os workers rodam
  o sparrow no rolo INTEIRO com sementes diferentes (paralelismo de busca). Em
  trabalho grande, cada worker deveria compactar um PEDAÇO do rolo, de ~175–350
  peças (paralelismo de dados), e os pedaços se emendam. Conta de ordem de
  grandeza: cada pedaço rende o que rende um trabalho pequeno (~2,5% em ~100 s);
  a emenda reta entre pedaços perde algo como meia peça de comprimento por
  emenda (~15–20 cm a cada ~30 m, ~0,5–0,7%). Saldo esperado: perto de 2% contra
  os 0,7% de hoje com 1.050 peças. **É estimativa, não medida.**
- **Detalhe que decide:** a emenda. Pedaço com parede reta perde o
  intertravamento; uma passada final do sparrow só nas janelas de emenda (as
  peças longe dela fixas) recupera parte disso.
- **Teste que derruba.** A corrida por regiões contra a inteira, com o mesmo
  relógio total e o mesmo número de workers, em ×4, ×6 e ×8, com 3 sementes.
  Se o saldo não passar do ruído, a proposta cai.

## P7 — Fase exata

- **Problema.** As duas fases encaixam a pegada coluna-convexa. A cava vira
  área cheia (+8,6% na camiseta, +7,9% na regata, sobre a silhueta já com folga).
- **Medido pela equipe:** sparrow no contorno exato rende 0,8% a mais que nas
  máscaras, e falta uma trava que confira contorno.
- **Implementação.** Contorno da silhueta (marching squares na arte, ou o
  polígono do vetor), simplificado **por fora** com erro limitado, engordado
  por $s/2$ (Clipper2, offset com arco por fora), e uma trava de polígono com
  tolerância física definida.
- **Teste que derruba.** A mesma corrida com a fase exata contra a de hoje, e
  a conferência pela arte (independente) tem de continuar limpa.

## P8 — Aproveitamento com área verdadeira

- **Problema.** `areaReal` é a área da máscara. Em vetor, ela passa a
  verdadeira em 0,3% a 12% por peça (gola a 10 mm: +11,9%). O número exibido
  fica otimista, e a meta de 95% (`metaAproveitamento`) é medida contra ele.
- **Implementação.** A área do polígono no vetor; a cobertura de alfa em
  resolução cheia na arte.
- **Risco.** O aproveitamento mostrado cai. É o número certo, mas precisa de
  aviso, porque o cliente compara com o que via.

## P9 — A soma do relevo no WASM

- **Achado** (`bancada/conferir-invariancia.js`): no WASM, a heurística
  `vazio` perde a invariância por translação a partir de K ≈ 9,34×10⁷ linhas
  (giro livre, 10 mm). Causa: `vs = i32x4_add(vs, v128_and(p, m))`
  (`wasm/src/lib.rs:314`) soma a **altura absoluta** do relevo em i32 por raia,
  e só depois as raias passam para i64. O JavaScript fica invariante até
  2×10⁹.
- **Impacto hoje:** nenhum (um rolo real fica abaixo de 10⁶ linhas).
- **Conserto, custo zero.** O `vazio` verdadeiro é pequeno (área morta debaixo
  de uma peça, muito abaixo de 2³¹), mas as parcelas não são. Feita toda em
  aritmética modular i32 — soma das raias com `wrapping_add` e
  `vazio = y·n + Σtopo − Σperfil` com `wrapping_mul`/`wrapping_add`/`wrapping_sub` —,
  a conta sai exata, porque o resultado módulo 2³² é o próprio valor. O defeito
  é misturar raias que já deram a volta com uma soma em i64. (Somar `p − t` não
  resolve: continua sendo altura absoluta, da ordem de K.) Alternativa: somar
  `p − ref`, com `ref` o relevo da primeira coluna, e devolver `n·ref` em i64.
  Depois, rodar `npm run bancada:conferir` (WASM ≡ JS) e o teste de invariância.

## P12 — Divisão do tempo pela curva

- **Medido** (`curva-no-tempo.js`, `producao-avulsa`, 300 s): a busca chega ao
  melhor dela em 1,5 s e fica parada até os 20 s que `tempoDaBusca` lhe dá; o
  sparrow leva ~5 s para o primeiro ganho e depois desce de forma côncava
  (−1,85% até 60 s, mais −1,0% de 60 a 300 s).
- **Hipótese.** Encerrar a busca quando ela empaca (por exemplo, sem ganho por
  2× o tempo do último ganho, com piso de 1 s) e passar o resto ao sparrow
  rende mais nos tempos curtos (30 s a 60 s), em que 9 s parados pesam.
- **Teste que derruba.** A mesma curva com a regra nova contra a de hoje, nos
  tempos de 30, 60 e 120 s, 3 a 5 sementes, em trabalhos pequenos e grandes.
  Cuidado com o trabalho grande (P11): lá é o contrário, a busca rende e o
  sparrow não.

## Referências e onde cada uma encosta no projeto

| Referência | O que é | Onde serve aqui |
|---|---|---|
| sparrow — github.com/JeroenGar/sparrow (MIT) | strip packing por minimização de sobreposição, estado da arte | já é a fase 2; P5 (zonas), P11 (escala), P7 (contorno exato) |
| jagua-rs — github.com/JeroenGar/jagua-rs | motor de colisão do sparrow (quadtree, f32, zonas de qualidade) | P5 (`quality_zones` + `min_quality`), P6 (f32) |
| Egeblad, Nielsen, Odgaard (EJOR, 2007), *Fast neighborhood search for two- and three-dimensional nesting problems* | busca local por minimização de sobreposição com movimentos eixo a eixo | fundamento da fase 2 |
| Umetani et al. (ITOR, 2009), *Solving the irregular strip packing problem via guided local search for overlap minimization* | GLS para sobreposição em strip packing | fundamento da fase 2 |
| Jakobs (EJOR, 1996), *On genetic algorithms for the packing of polygons* | codificação por ordem + decodificador bottom-left | é a codificação da busca construtiva |
| Burke et al. (Operations Research, 2006), *A new bottom-left-fill heuristic algorithm for the two-dimensional irregular packing problem* | BLF com geometria exata | o `vaos` é um BLF por intervalos na grade |
| Bennell & Oliveira (EJOR, 2008), *The geometry of nesting problems: a tutorial* | NFP, phi-functions, raster, e quando usar cada um | P7: por que a camada exata, e por que a busca pode ficar na grade |
| Clipper2 — angusj.com/clipper2 | offset e operações booleanas robustas em inteiros | P7: engordar o contorno por s/2 (arco por fora) e conferir interseção com tolerância física |
| libnest2d / SVGnest | nesting por NFP com GA | referência histórica; o projeto já teve NFP e tirou (custo sem ganho medido) |
| Google OR-Tools (CP-SAT) | programação por restrições | só para subproblema discreto, por exemplo distribuir peças entre bancadas (depois de P5) |

Antes de trazer código ou dependência de qualquer uma: licença, manutenção, e
um teste que mostre ganho contra a referência da bancada.

## P10 — Consentimento da memória coletiva

O `encaixe-coletivo.js` envia, sem aviso e sem opção na tela, números de cada
encaixe (assinatura, largura, consumo, receita, vetor), com um código de
instalação sorteado. Não sai arte nem nome. É uma escolha de produto e de
conformidade (LGPD), não de engenharia. Fica registrada para o dono do produto.
