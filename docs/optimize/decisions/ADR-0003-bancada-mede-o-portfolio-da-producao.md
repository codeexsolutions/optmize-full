# ADR-0003 — A bancada mede o portfólio da produção

**Estado:** proposto por Claude · cabe ao Codex (engenharia de medição) aceitar e implementar · **Data:** 2026-11-09

## Contexto

`bancada/corrida.js`, que diz rodar "como a produção", usa
`["contorno", "retangulo"]` quando ninguém passa `--extra motores=...`. A
produção usa `["contorno", "vaos", "faixas"]` no modo automático desde que "A
CAIXA NÃO DISPUTA" (`src/producao/controlador.js`, na escolha dos motores).

Medido nesta máquina (Ryzen 5 5600X), 6 trabalhos padrão, 5 fatias × 3 s × 3
sementes, só a busca:

| portfólio | soma | vence |
|---|---|---|
| padrão da bancada (`contorno + retangulo`) | 16,388 m | contorno em 6 de 6 |
| produção (`contorno + vaos + faixas`) | 16,200 m | `vaos` em 5 de 6 |

Ou seja: −1,15%, e um encaixador que a medição padrão nem roda ganha quase tudo.

## Decisão proposta

1. O padrão da corrida passa a ser o portfólio da produção, lido de um lugar
   só (uma constante exportada que o controlador e a bancada usem).
2. O JSON da bancada passa a registrar os motores medidos.
3. Um teste de paridade falha se o controlador e a bancada divergirem.

## Consequências

- Medições antigas sem `--extra motores` deixam de ser comparáveis com as
  novas. Quem precisar compará-las passa `--extra motores=contorno+retangulo`.
- As conclusões gravadas nos comentários do motor que foram medidas com o
  portfólio antigo continuam válidas para ele, e podem precisar de remedição
  para o novo. Vale revisar primeiro as que decidem a poda por motor
  (`PODA_MOTOR`), porque o portfólio passou de `contorno + retangulo` para
  `contorno + vaos + faixas`.
