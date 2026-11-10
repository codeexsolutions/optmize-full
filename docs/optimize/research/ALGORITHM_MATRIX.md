# Pesquisa e matriz de decisão

Fontes primárias consultadas em 2026-11-09. Esta tabela é uma decisão de engenharia para este repositório, não um ranking universal de algoritmos. Nenhuma nova dependência foi incorporada nesta rodada.

## Referências verificadas

- [Clipper2 — Overview](https://www.angusj.com/clipper2/Docs/Overview.htm) e [Robustness](https://www.angusj.com/clipper2/Docs/Robustness.htm): clipping/offsets inteiros, escala explícita e limites de coordenadas. Pode servir à geometria canônica e a offsets; sozinho não é um otimizador de nesting. Conferir a licença do artefato exato antes de incorporar uma ponte Rust/WASM de terceiros.
- [libnest2d](https://github.com/tamasmeszaros/libnest2d): C++ e LGPL-3.0; o README descreve limites para furos e concavidades. Não é substituição automática do motor existente. Sua integração exigiria avaliação de geometria, distribuição e manutenção.
- [SVGnest](https://github.com/Jack000/SVGnest): MIT, NFP orbital e busca genética, com suporte descrito a peças dentro de furos. É referência de arquitetura e fixtures; a documentação também lista casos de NFP ainda a corrigir. Não tomar a alegação de desempenho do próprio projeto como benchmark do Optimize.
- [OR-Tools — CP-SAT](https://developers.google.com/optimization/cp/cp_solver) e [modelo NoOverlap2D](https://github.com/google/or-tools/blob/stable/ortools/sat/cp_model.proto): restrições inteiras e não sobreposição de retângulos. Adequado a certificados e subproblemas discretos pequenos; não resolve automaticamente polígonos arbitrários.
- [Sparrow](https://github.com/JeroenGar/sparrow): MIT, heurística para strip packing sobre jagua-rs, com experimentos publicados pelo projeto. O Optimize já fixa uma revisão e jagua-rs 0.8.3. O README atual descreve mudanças de formato em Sparrow 0.3.0/jagua-rs 1.0.0; atualizar sem adaptar a ponte seria incorreto. Esta execução preservou as versões existentes.

## Matriz

| Família | Uso adequado / custo esperado | Situação no Optimize | Decisão |
|---|---|---|---|
| BL/BLF, top-left e cantos | Construção rápida; qualidade depende da ordem | Perfil e MaxRects cobrem parte desse espaço | Preservar como referências |
| First/Best-Fit, MaxRects | Retângulos; lista de espaços pode crescer | Quatro heurísticas e ordens já existentes | Manter e validar bordas/folga |
| NFP/IFP, Minkowski, contato | Polígonos irregulares, custo de pares/orientações e topologia | NFP anterior foi removido; fixture de arte partida registra o motivo | Protótipo isolado somente após verificador vetorial e furos |
| Matrizes de ocupação / distance fields | Paralelismo simples; memória aumenta com resolução e extensão | Máscaras locais e perfil por coluna | Evitar matriz do rolo inteiro; não engrossar precisão para caber |
| Decomposição, BVH/índice espacial | Reduz candidatos a colisão; custo de construção/manutenção | Varredura pelo topo e AABB no verificador | Medir densidade antes de escolher estrutura mais complexa |
| Multi-start, ILS, VNS, GRASP | Diversificação/ordenação com busca local; custo controlável por avaliação | Mutações, reparo, reinícios e receitas já existem | Ablar componentes existentes antes de somar outro portfólio |
| LNS/ALNS | Retirar/reinserir subconjuntos; precisa rollback e avaliação de reparo | Repescagem e reparo dirigidos dão base reutilizável | Próximo protótipo: reconstrução do trecho final, com controle intacto |
| Beam search/lookahead | Explora consequências futuras; custo multiplica por largura do feixe | Motor por blocos já explora janelas | Comparar janela/blocos com beam pequeno antes de novo módulo |
| GA/memético | Populações e diversidade, maior memória/tempo | Não é necessário para corrigir falhas atuais | Adiar até prova de ganho sobre multi-start existente |
| SA/Tabu | Escape de mínimos, temperatura/memória tabu exigem calibração | Estagnação já alterna exploração/refino | Experimentos isolados; nenhuma troca automática |
| CP-SAT, B&B, DP | Casos pequenos/discretos; crescimento combinatório | Sem integração nova | Usar primeiro como oráculo de subproblemas retangulares |
| Bandits/hiper-heurísticas | Seleção de receita baseada em retorno/custo, exploração controlada | Placar e rede leve já existem | Comparar política simples com memória desligada e conjunto reservado |
| GPU/vetorização | Só compensa lote paralelo e transferência amortizada | Kernel WASM já usa SIMD | Não acrescentar GPU sem perfil que a justifique |

## Experimentos seguintes, refutáveis

1. **Reconstrução de cauda:** retirar somente unidades próximas ao maior comprimento e reinserir com o motor de vãos. Refutação: zero melhora típica ou regressão de tempo/validade no conjunto reservado. Risco: eliminar uma peça pode liberar espaço longe da cauda; medir também variedade de formatos removidos.
2. **Lookahead curto:** comparar o motor por blocos existente com feixe 2/4, preservando a receita de controle. Refutação: ganho desaparece em orçamento temporal igual. Medir tempo de preparo e duplicação de estados.
3. **Seleção adaptativa simples:** retornos por redução válida de comprimento por milissegundo, com exploração mínima e receita de controle. Comparar com pesos atuais, rede desligada e rede atual. Dividir treino/validação por família geométrica e instalação; cópias da mesma peça não podem vazar para o conjunto reservado.
4. **Viewport:** manter escala de tela e dados físicos; desenhar só a região visível e deslocar origem. Refutação: seleções, réguas ou exportação divergirem, ou custo não reduzir no trabalho real que falha.

Cada experimento deve registrar versão, seed, hardware, perfil, limites, primeira solução, melhor solução, trajetória, RSS e violações. Repetir múltiplas seeds e publicar mediana, dispersão e diferenças pareadas. Um único vencedor não autoriza promoção. Não há pesos novos adotados nesta execução.
