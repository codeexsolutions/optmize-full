# Decisões da missão VNext (2026-11-12)

Cada linha é uma hipótese medida no laboratório, com a decisão e o motivo.
Os números e os comandos estão no `RELATORIO.md`; os dados brutos em `dados/`.

| # | Hipótese | Resultado | Decisão |
|---|---|---|---|
| E1 | 1 trabalhador no separador do sparrow (em vez de 3) dá mais iterações e encaixa melhor | ganha no giro livre (−0,79%), **perde no misturado (+1,11%)**; 2 fica no ruído | **rejeitada** — fica 3: escolher a melhor de 3 passadas é intensificação, não desperdício |
| E2 | simplificar mais os polígonos (a forma só cresce) compra avaliações | rolo longo: **−1,08%** (avulsa), −0,41% (misturado); curto: **+0,4% a +0,8%** | **não como ajuste fixo** — virou a etapa grossa do E7 |
| E3 | quadtree mais funda barateia a consulta em rolo comprido | −0,3% no rolo longo (muito consistente); neutra no curto | **aprovada no rolo longo**, dentro do plano |
| — | repetição na busca construtiva | 39% das tentativas dos pequenos repetem uma ordem equivalente | **registrada, não atacada** — a busca não é o gargalo do tecido final (ver PROXIMOS-PASSOS) |
| E5 | workers que cooperam em rodadas (todos recomeçam do melhor) | −0,30% ±0,04 no pedido de produção; ruído nos outros; nunca pior | **aprovada com ressalva** — decide-se no E8 se entra junto com o plano |
| E6 | cortar a faixa onde ela está mais vazia (§7: o desperdício guia a vizinhança) | **−0,69%** no rolo longo; neutro ou levemente pior no curto | **aprovada no rolo longo**, dentro do plano |
| E7 | do grosso para o fino (etapa simplificada, depois a forma exata) | rolo longo caro: **−0,33% a −0,60%**, inclusive com 140 s; curto: ruído (o prejuízo do E2 some); lote-grande (grade grossa): contra | **aprovada** em 2 etapas (50/50), só com rolo longo **e** contorno de muitos vértices |
| E8 | o plano inteiro (E3 + E6 + E7), por worker ou cooperando, contra o de hoje, com 5 workers e o tempo da tela | **−0,67% a −0,92% cooperando** (−0,55% a −0,84% por worker); ganhou nas 7 sementes | **ligado na produção, em rodadas cooperativas**, só no rolo longo com contorno de muitos vértices |

## Princípios que saíram das medições

1. **O motor tem duas fases e quem decide o tecido final é a segunda.** A
   busca construtiva acha o melhor dela em segundos; o sparrow fica com ~85%
   do tempo e entrega 1–5% depois dela. Melhorias na busca construtiva só
   valem onde o sparrow não roda (bancada) ou não tem tempo.
2. **A mesma mudança ganha ou perde conforme o trabalho converge ou não no
   tempo que tem.** Rolo longo com contorno de muitos vértices está longe de
   convergir: velocidade vira tecido. Trabalho curto já convergiu: só sobra o
   custo de qualquer aproximação. Por isso o motor ganhou um PLANO por perfil
   (`planoDoSparrow`), e não um ajuste global.
3. **"Trabalho descartado" não é sinônimo de desperdício.** O E1 mostrou que
   as passadas jogadas fora pelo separador compram a qualidade da escolha.
4. **Toda decisão foi tomada com a partida igual, sementes pareadas e os
   braços intercalados na mesma carga de máquina** — a diferença entre duas
   rodadas inteiras do mesmo braço chegou a 0,4%, então só comparação pareada
   dentro do mesmo experimento decide alguma coisa.
