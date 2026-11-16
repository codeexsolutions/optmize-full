# ADR-0002 — Evoluir o motor de grade, não reescrevê-lo

**Estado:** proposto por Claude · aguardando o Codex · **Data:** 2026-11-09

## Contexto

A missão pede um motor "de nível industrial" e lista dezenas de técnicas (NFP,
GA, tabu, ALNS, CP-SAT…). A auditoria (`research/ARCHITECTURE_AUDIT-CLAUDE.md`)
mostrou que o motor já tem o esqueleto de um sistema moderno — portfólio com
memória, ILS com detecção de estagnação, paralelismo por fatias, compactação
pelo sparrow, travas independentes — e que boa parte das escolhas tem medição
registrada no código. Os gargalos achados são de **representação** (pegada
coluna-convexa, grade presa à largura) e de **escala** (sparrow em f32,
sparrow desligado com bancada, desenho de rolo longo), não da meta-heurística.

Já houve um encaixe por NFP no projeto, e ele saiu (ver `prepararMascara`).

## Decisão

1. O motor de grade continua sendo o motor da busca construtiva e a
   referência de correção. Nada de reescrita.
2. A geometria exata entra como **camada a mais**, onde ela paga: na fase de
   compactação (sparrow no contorno exato) e numa trava de polígono com
   tolerância física (P7). A grade continua decidindo a busca.
3. Cada técnica nova da lista da missão só entra se atacar um gargalo medido,
   com um teste que possa refutá-la, contra a referência da bancada.

## Consequências

- Preserva o que já funciona e o histórico de medições.
- A precisão final passa a ser decidida pela camada exata, e a grade pode
  ficar no tamanho que dá velocidade à busca.
- O ganho máximo da camada exata tem teto conhecido: o LB_modelo contra o
  LB_BM (1,1% a 13,5% nos trabalhos da bancada, ver `FORMALIZACAO.md` §5).
