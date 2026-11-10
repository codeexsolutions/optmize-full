# Baseline de desempenho

Data: 2026-11-09. Windows, Node v24.18.0, AMD Ryzen 5 5600X, 12 processadores lógicos. Metadados e hashes em `ambiente.json`. Todos os dados usados são sintéticos do catálogo do repositório.

## Comparação temporal antes/depois

Comando: `node bancada/medir.js --tempo 1 --sementes 3 --fatias 2 --trabalhos camiseta+manga+gola,misturado-pequeno,lote-grande --json <arquivo>`.

Duas fatias sequenciais, um segundo por fatia, três seeds por trabalho. Baseline materializado dos arquivos originais do núcleo no commit-base; a instrumentação não executou artefatos da pasta `dist`. Resultados integrais em `busca-antes.json`, `busca-depois.json` e respectivos logs.

| Trabalho | Média antes (cm) | Média depois (cm) | Mediana antes/depois (cm) | Tentativas/s antes/depois |
|---|---:|---:|---:|---:|
| camiseta+manga+gola | 360,000 | 360,000 | 360 / 360 | 10.378 / 10.310 |
| misturado-pequeno | 221,167 | 221,500 | 222,5 / 222,5 | 15.898 / 15.827 |
| lote-grande | 1.380,000 | 1.384,667 | 1.391 / 1.391 | 3.961 / 4.006 |

A soma média aumentou 5 cm (+0,25%). Isso não é melhoria. As medianas coincidiram e a ferramenta classificou a diferença como inconclusiva com três seeds. A amostra curta não estabelece equivalência nem não inferioridade estatística; não autoriza alegar ganho de qualidade ou velocidade. A integração se justifica pelas falhas de correção reproduzidas.

As alterações finais posteriores à comparação foram proteções de outros caminhos, fechamento de canal e verificações de entradas; a comparação temporal não deve ser anunciada como medição exata de qualquer edição futura. Reexecutar o par ao promover um novo algoritmo.

## Esforço controlado e telemetria

`medir-reprodutivel-optimize.cjs` usa 256 avaliações, seeds 11/29/71, memória e rede ausentes, polimento desligado e limite temporal de segurança de 30 s. O período de estagnação é alto para não introduzir decisões dependentes do relógio. Se atingir o limite temporal antes de 256 avaliações, a rodada falha em vez de fingir comparabilidade.

As nove corridas em `reprodutivel.json` completaram 256 avaliações e produziram resultados completos, sem rejeições. Na última conferência foram aproximadamente 60-120 ms por busca, dos quais 2,0-8,9 ms em validação dos candidatos a recorde nesta máquina. Essa conferência de esforço controlado ocorreu com testes da API em outro processo; não é uma medição isolada de velocidade. Esses tempos não incluem leitura de arte nem rasterização da interface e não são uma promessa para trabalhos reais. Os tempos de primeira/melhor solução do motor começam após o preparo interno; `totalMs` inclui esse preparo da busca. O pico de RSS informado é do processo inteiro, não uma soma ou um pico independente por trabalho.

O teste de replay exige as mesmas posições para mesma seed e mesmo esforço sob essas condições. Mudança no algoritmo, parâmetros, modelo aprendido, versão da grade ou no disparo do limite temporal pode alterar a trajetória.

## Correção e corpus

- `integridade-antes.json`: 1/9 grupos aprovados; `integridade-depois.json`: 9/9.
- `contratos.json`: 16 grupos aprovados, incluindo limite i32, cancelamento, conservação de cópias, identidade/escala de máscaras e rolo de 20 km.
- `corpus.json`: 19 trabalhos × retângulo/contorno/vãos, 57 resultados válidos; posições assinadas por SHA-256.
- `paridade-wasm.log`: 912 combinações conferidas.
- `folga-real.log`: conferência independente por contorno e folga real.
- `encolher.log`: ponte existente para Sparrow, inclusive resultados rejeitados/aceitos.
- `api-nesting.log`: testes do domínio de nesting e seu adaptador, sem usar serviço de produção.
- `build.log`, `typecheck.log` e `api-typecheck.log`: compilação Vite em diretório temporário isolado e checagem de tipos dos dois projetos.
- `coletivo.log`: isolamento, cache e timeout com transporte simulado. Conexões até loopback retornaram EACCES neste ambiente, portanto não foi uma certificação de rede real.

## Limitações de interpretação

Não houve um perfil completo de CPU/alocações da interface, processo nativo ou exportador. Comentários antigos que atribuem percentuais de tempo ao kernel não foram tratados como medições novas. Não houve teste de carga multiusuário, memória adversarial por milhares de vértices, nem medição do exemplo 3,90/3,86 m. A solução de 20 km prova o caso de retângulos descrito, não a qualidade de todos os materiais extensos.

Antes de aprovar nova heurística: reservar trabalhos não usados no ajuste, comparar ambas as versões na mesma máquina livre, alternar a ordem A/B e B/A, usar mais seeds e executar todos os validadores. Um resultado inválido é rejeição da experiência, mesmo que use menos material.
