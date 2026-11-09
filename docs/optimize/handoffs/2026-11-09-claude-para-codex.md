# Handoff — Claude → Codex · 2026-11-09

**Branch:** `claude/encaixe-pesquisa` (worktree `.worktrees/claude-encaixe`),
a partir de `7017c91` (`Pedro`). Nada foi mergeado nem enviado.

## Leia nesta ordem

1. `docs/optimize/README.md` — protocolo, papéis e **a regra do portfólio**
   (meça com `--extra motores=contorno+vaos+faixas`).
2. `research/ARCHITECTURE_AUDIT.md` — o motor como ele é.
3. `research/GEOMETRY_AUDIT.md` — representação, precisão e materiais grandes.
4. `research/PROPOSTAS.md` — o que eu proponho, com o teste que derruba cada item.
5. `benchmarks/PERFORMANCE_BASELINE.md` — a referência medida.

## O que eu fiz

- Auditoria de arquitetura e de geometria, formalização e limites inferiores
  provados (Brunn–Minkowski).
- Ferramentas novas na bancada, **sem tocar no motor**:
  - `bancada/curva-no-tempo.js` — a curva no tempo da corrida de produção
    (embrulha `buscarMelhorEncaixe`/`encolherEncaixe`; não copia a corrida);
  - `bancada/auditar-geometria.js` — grade × folga real, inflação por peça,
    LB_area / LB_BM / LB_modelo;
  - `bancada/conferir-escala.js` — H-ESC-1 (sparrow em rolo longo), H-ESC-2
    (bancada desliga o sparrow), H-ESC-3 (grade do rolo largo);
  - `bancada/conferir-invariancia.js` — teste metamórfico de translação no
    rolo (JS e WASM);
  - `bancada/janela-do-risco.html` — o desenho do risco medido no navegador.
- **Uma correção de código** (P1, fora do motor): o desenho da tela passa a
  ter só o tamanho da parte visível (`desenhoDoEncaixe.js`, "A JANELA DO
  RISCO"; `controlador.js`: `janela: true`, origem no clique, redesenho na
  rolagem).

## Os achados, em uma linha cada (os números estão nos documentos)

1. **Perda de linha em rolo longo** = desenho, não geometria: o canvas do rolo
   inteiro rebaixa a resolução; a 300 m e 8× o traço cai a 5% do contraste.
   **Corrigido (P1)** e aprovado na bancada do navegador.
2. **Precisão presa à largura:** o piso `W/1000` da grade faz 4 mm virarem
   6,4 mm em 320 cm; a grade certa gastou **−1,70%** de tecido (P4, 1 semente).
3. **Bancada desliga o sparrow:** +3,76% de mídia, ~2,1% dele (P5); o caminho
   pelas zonas do jagua-rs está verificado no código dele.
4. **Sparrow não escala no tempo:** 2,5% de ganho com 175–350 peças; com
   1.050 peças, 0% em 102 s e 0,70% em 280 s (P11). O f32 **não** gerou
   rejeição até 130 mil linhas, e o sparrow melhorou acima do limiar dele: a
   causa é tempo (P6 refutada nessa faixa). Proposta: compactar por regiões, em
   paralelo.
5. **Bancada mede outro portfólio:** −1,15% de soma só por medir o que a loja
   roda (ADR-0003).
6. **A busca satura em ~1,5 s** e fica com até 20 s (P12).
7. **WASM `vazio` estoura i32** acima de ~9×10⁷ linhas (P9, sem impacto hoje).

## O que eu peço que você revise ou meça

1. **P2 / ADR-0003** — o padrão da corrida. É engenharia de medição: é seu.
2. **P9** — o estouro da soma do relevo no WASM (`wasm/src/lib.rs:314`).
   Confira a minha conta: o conserto que proponho é aritmética modular i32
   consistente. Depois, `npm run bancada:conferir` e
   `node bancada/conferir-invariancia.js`.
3. **P4 / H-ESC-3** — a grade do rolo largo. Meu teste usa 1 semente; repita
   com 3 a 5, com a máquina livre, antes de qualquer decisão.
4. **P1** — revise a janela do risco no código (o `sticky` dentro da célula da
   grade e a conta da `origem`). O teste no navegador está descrito no
   `GEOMETRY_AUDIT.md`.
5. **A divisão do tempo entre busca e sparrow** (15%, de 3 s a 20 s): a curva
   no tempo mostra onde cada fase rende. Vale medir por tamanho de trabalho.

## O que eu NÃO fiz, e por quê

- Não mexi no motor (busca, encaixadores, sparrow): toda proposta de motor
  espera bancada e a sua revisão.
- Não toquei no trabalho não commitado do Pedro (giro por peça e PDF a 200 dpi).
- Não decidi nada sobre a memória coletiva (P10): é decisão do dono.

## Pegadinhas que custaram tempo

- A corrida da bancada sem `--extra motores` mede `contorno + retangulo`, e a
  loja roda outra coisa. Minha primeira corrida longa saiu com isso e foi
  descartada.
- `buscarComoAProducao` devolve só números. Para conferir o encaixe final, pegue
  os resultados no caminho (veja `conferir-escala.js`).
- No Windows, a bancada mede tentativas por segundo: outro processo pesado
  (navegador, `tsc`, build) contamina a medida.
