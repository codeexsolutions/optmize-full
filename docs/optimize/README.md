# Optimize — pesquisa e engenharia do motor de encaixe

Esta pasta é o lugar onde Claude e Codex trocam o que descobrem sobre o motor
de encaixe. Nada aqui substitui os comentários do código — eles continuam
sendo a memória de cada decisão. O que mora aqui é o que atravessa arquivos:
auditorias, formalização, medições, decisões e passagens de bastão.

## Papéis

| Agente | Responsável por | Revisa |
|---|---|---|
| **Claude** — pesquisa matemática e arquitetura | auditoria conceitual, formalização, hipóteses, geometria, critérios de escolha de algoritmo | os experimentos e a engenharia do Codex |
| **Codex** — engenharia e otimização computacional | instrumentação, benchmarks reproduzíveis, implementação e comparação das propostas, CPU/memória/paralelismo, testes | as propostas e a matemática do Claude |

Nenhum dos dois aceita uma proposta só porque o outro a fez. A opinião de um
agente não é prova técnica: prova é medição comparável ou demonstração.

## O protocolo de uma mudança

1. **Problema observado**, com onde ele aparece.
2. **Hipótese** matemática ou computacional.
3. **Teste que pode refutá-la**, escrito antes do protótipo.
4. **Protótipo isolado**, atrás de um ajuste com padrão (o `--extra` da
   bancada existe para isso: os dois lados medidos com o MESMO código).
5. **Comparação com a referência** (`node bancada/medir.js --contra ...`).
6. **Revisão** do outro agente.
7. **Decisão** registrada em `decisions/`: aprovar, rejeitar ou continuar.

Experimento que falha também é registrado — evita refazer o que já não deu.

## Regras de convivência no repositório

- Cada agente trabalha em **worktree e branch próprios**. O do Claude é
  `claude/encaixe-pesquisa`, em `.worktrees/claude-encaixe` (pasta excluída
  só localmente, em `.git/info/exclude`). O Codex deve usar outro, por
  exemplo `codex/encaixe-engenharia`.
- Ninguém edita o mesmo arquivo que o outro tem aberto numa branch viva sem
  combinar antes num handoff.
- **O repositório é público** (ver o `.gitignore`). Nada de arte, nome de
  cliente, token ou dado de produção nos documentos e nos JSON de medição.
- Os dois ambientes não se falam sozinhos: tudo que o outro precisa saber vai
  num documento versionado em `handoffs/`.

## Ler uma medição

A bancada não é determinística (o relógio encerra a busca). Pelo cabeçalho do
`bancada/medir.js`: **diferença de soma abaixo de ~0,25% é empate**, e um
trabalho pequeno sozinho não decide nada. Melhor de muitas tentativas não é o
desempenho típico: relate mediana e dispersão por semente.

**Use o portfólio da produção.** A produção roda `contorno + vaos + faixas`
(ver "A CAIXA NÃO DISPUTA", em `src/producao/controlador.js`). A corrida da
bancada, sem `--extra motores=...`, ainda usa `contorno + retangulo`. Até a
decisão ADR-0003 ser tomada, toda medição que queira falar da loja passa
`--extra motores=contorno+vaos+faixas`.

## As ferramentas

| Comando | O que responde |
|---|---|
| `node bancada/medir.js --tempo 3 --sementes 3 --extra motores=contorno+vaos+faixas` | consumo final por trabalho (protocolo histórico da bancada) |
| `node bancada/curva-no-tempo.js --trabalhos producao-avulsa --tempo 120 --extra motores=contorno+vaos+faixas` | a curva no tempo: primeira solução, fim da busca, melhor solução, consumo em cada marco |
| `node bancada/auditar-geometria.js` | o que a grade faz com cada peça, a folga real por largura de tecido e os limites inferiores de consumo |
| `node bancada/conferir-escala.js --teste rolo\|bancada\|largo` | as hipóteses de material grande (ver `research/GEOMETRY_AUDIT.md`) |

## Os documentos

- `research/ARCHITECTURE_AUDIT.md` — o que o motor é, de verdade, hoje.
- `research/GEOMETRY_AUDIT.md` — representação, precisão e o diagnóstico dos materiais grandes.
- `research/FORMALIZACAO.md` — o problema escrito em matemática, e o que o motor resolve de fato.
- `research/PROPOSTAS.md` — a matriz de decisão e as hipóteses priorizadas, cada uma com o teste que a derruba.
- `benchmarks/PERFORMANCE_BASELINE.md` — a referência medida, com comandos para repetir.
- `decisions/` — os registros de decisão (ADR).
- `handoffs/` — as passagens de bastão entre os agentes.
