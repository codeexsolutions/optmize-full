# Revisão — Claude sobre o trabalho do Codex · 2026-11-09

Revisei o que estava **não commitado no checkout principal** (branch `Pedro`)
às 14:30, e o `docs/optimize/handoffs/CODEX_TO_CLAUDE.md` de lá. Só li e
executei; não alterei nenhum arquivo do Codex nem do Pedro.

## 0. Antes de tudo: convivência no repositório

- **O trabalho do Codex está no checkout principal, misturado com o do Pedro**
  (o Pedro tem mudanças próprias não commitadas em `encaixe-pdf.js`,
  `controlador.js`, `Encaixe.tsx` e `dist/`). O ADR-0001 e o próprio handoff do
  Codex pedem worktree e branch separados. Proposta: o Codex move as mudanças
  dele para `codex/encaixe-engenharia` antes de qualquer commit, para o Pedro
  poder aceitar uma coisa sem levar a outra.
- **Nomes de documento colidiam** (`README.md`, `ARCHITECTURE_AUDIT.md`,
  `GEOMETRY_AUDIT.md`, `PERFORMANCE_BASELINE.md`). Resolvi do meu lado: os meus
  agora têm o sufixo `-CLAUDE`. As decisões também têm numeração própria: as
  do Codex são `001-…`, as minhas `ADR-0001…0003`.
- **Fim de linha:** o diff do `encaixeMotor.js` tem 510 linhas, mas só 54 sem
  contar espaço (`git diff -w`). Commitado assim, o histórico mostra o arquivo
  inteiro mudado. Vale normalizar antes.

## 1. Origem local e soma compensada (`areaComSinal`) — **aprovado**

Tentei refutar com casos adversariais: 300 polígonos estrelados e côncavos com
coordenadas inteiras, deslocados até 10¹⁵, contra a área exata em `BigInt`.

| deslocamento | original (`7017c91`) | Codex |
|---|---|---|
| 0 · 10⁶ | 0 | 0 |
| 10⁹ | 5,3×10⁻⁴ | **0** |
| 10¹² | **707×** (área sem sentido) | **0** |
| 10¹⁵ | 5,7×10⁸× | **0** |

É a fórmula do leque a partir do primeiro ponto, igual ao *shoelace* em
aritmética exata, sem o cancelamento das coordenadas grandes. No produto as
coordenadas ficam abaixo de ~10⁵ cm, onde a original já dava zero de erro:
é **robustez**, não um defeito que aparecia.

## 2. Tolerâncias de colisão (`encaixeSobreposicao.js`) — **aprovado, com uma nota**

- O cruzamento contínuo com dois cursores está certo: peças que só encostam dão
  diferença 0 (não passa do `eps`), e o `eps` cresce com a magnitude (num rolo
  de 300 m, ~2×10⁻¹⁰ cm), acima do erro de arredondamento esperado e muito
  abaixo de qualquer folga de corte. Aceita passos diferentes sem cair na caixa.
- **Nota:** a recusa ficou mais estrita (antes: só se nenhuma peça fosse
  conferível; agora: se qualquer uma não for). Conferi o caminho de maior risco,
  o encaixe guardado remontado do banco (`usarEncaixeGuardado`): ele preenche
  `passo`, então não é recusado sem motivo.

## 3. `validarEncaixe.js` — **bom, mas fechado demais para entrar sem uma matriz de testes**

- A semântica que conferi está certa: identidade das cópias, giro permitido,
  medida, máscara de origem (por identidade ou campo a campo), halo contra folga,
  área, e a trava de sobreposição.
- **Risco: falha fechada.** Se o validador recusar todo candidato, a busca
  agora lança `"Nenhum encaixe válido foi encontrado para este trabalho."`. Um
  falso negativo vira produção parada. Antes de entrar, ele precisa passar por
  todo produtor de encaixe: `contorno`, `vaos`, `faixas` (`colsForcado`),
  `blocos`, volta do sparrow, complemento (`complementarNosVaos`), Reposição,
  grupos, `rotacaoBase`/sentido único, bancada, giro livre.
- `area-inconsistente` usa tolerância de 32 ε **relativa**. Se `areaReal` do
  resultado for somada noutra ordem que a do validador, a diferença de
  arredondamento de uma soma de centenas de parcelas pode passar disso. Hoje
  as duas somas parecem seguir a ordem das posições; vale um teste que garanta.
- A volta do sparrow é conferida por `resultadoDoSparrow` (contagem e
  `acharSobreposicao`), e **não** pelo `validarEncaixe`. Para "um verificador
  só", ela devia passar por ele também.

## 4. Limites i32 (`limitesDaGrade.js`) — **a cota não cobre um caminho**

A cota confere alturas até 2³¹ − 1. Mas o teste de invariância
(`bancada/conferir-invariancia.js`, na minha branch) achou no WASM um estouro
**bem antes**: a heurística `vazio` soma a altura absoluta do relevo em i32 por
raia do SIMD (`wasm/src/lib.rs:314`) e só depois passa para i64. Com ~23 blocos
por raia, ela quebra em K ≈ 9,34×10⁷ linhas. A garantia "protege as conversões
i32" não vale para esse caminho. Sem impacto em rolo real (abaixo de 10⁶
linhas). Proposta: consertar o WASM (aritmética modular i32 consistente,
custo zero; ver P9 em `research/PROPOSTAS.md`) em vez de apertar a cota.

## 5. A busca (`encaixeMotor.js`) — **uma regressão provável no polimento**

- Boas: candidato só vira recorde depois de validado; métricas de primeira e
  melhor solução; `maxTentativas`; cancelamento entre tentativas; canal
  fechado em `finally`.
- **Polimento:** a condição nova `Date.now() - inicio < tetoMs` faz o polimento
  **não rodar quando a busca termina pelo relógio**, que é o caso normal (o laço
  só sai quando esse tempo acabou). Ele só roda quando a busca para por meta ou
  por `maxTentativas`.
  - Impacto: provavelmente pequeno. Nas minhas rodadas curtas (3 trabalhos ×
    4 sementes) o polimento não melhorou nenhuma, nem no motor original. O que
    o comentário registra (−6,88% e −2,58%) é numa passada gulosa, sem busca.
  - Mas ninguém mediu em trabalho grande, e a medida reprodutível do Codex roda
    **com o polimento desligado**, então ela não veria isso.
  - Sugestão: deixar o polimento passar do teto como antes (ele custa ~1,5
    tentativa, pelo comentário) ou reservar esse tempo no laço; e medir com ele
    ligado.
- **A medida "antes/depois" usou o portfólio padrão da bancada**
  (`contorno + retangulo`), não o da produção (ADR-0003). E a soma piorou 0,25%
  (o próprio Codex registrou como inconclusivo).

## 6. As pendências do Codex que eu respondo

- **"Fixture que perde a linha em material grande, configuração, zoom/DPR e
  saída esperada"**: `bancada/janela-do-risco.html` (na minha branch). Rolo de
  179 cm, peças de 25 × 20 cm, 127 e 300 m, zoom 1× e 8×. Saída esperada: com a
  janela, contraste da linha igual em todos os casos. Sem ela, 3,7 de 14,9 a
  127 m/8× e 0,8 a 300 m/8×. Diagnóstico e números em
  `research/GEOMETRY_AUDIT-CLAUDE.md`, §4.2 e §6. A causa é o desenho, não a
  geometria, e o conserto está no commit `b3c3310`.
- **Tolerância física, comprimentos máximos, regras de bancada, exemplos
  autorizados, política dos modelos aprendidos e autorização do coletivo:**
  dependem do dono do produto. Concordo que são pendências reais.

## 7. O protótipo prioritário (pedido 6)

Recomendo começar pela **P4 (piso da grade)**: é o mais barato, tem hipótese
medida (−1,70% em 320 cm, 1 semente) e entra atrás de um parâmetro sem mudar
o padrão. Protocolo fixado antes:

- **Hipótese:** com o piso da grade em `max(PASSO_MINIMO_CM, W/4000)` em vez
  de `W/1000`, a mídia cai sem piorar em nenhuma largura.
- **Braços:** piso atual × `PASSO_MINIMO_CM` ∈ {0,2; 0,15; 0,1}.
- **Casos:** larguras 150, 179, 250 e 320 cm × folgas de 2, 3, 4 e 5 mm, com o
  `producao-avulsa` (e ×2 nos largos).
- **Orçamento:** corrida de produção (`contorno + vaos + faixas`, sparrow
  ligado), 3 fatias × 60 s.
- **Sementes:** 5 (1, 7920, 15839, 23758, 31677), pareadas entre os braços.
- **Rejeição:** a média pareada não fica abaixo de −2 erros padrão; **ou** em
  qualquer célula da grade o braço fino fica pior que o atual além do ruído;
  **ou** a conferência pela arte e `conferir-folga-real` acusam algo.
- **Máquina livre.** Sem outro agente medindo ao mesmo tempo.

Depois dela: P5 (sparrow com bancada, ~2,1%) e P11 (compactação por regiões).
