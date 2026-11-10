# Auditoria geométrica

## Modelo observado

Unidade física: centímetro. JavaScript usa Number (float64); perfis de encaixe e ABI WASM usam Int32Array/i32 em células. A função `grade` depende da largura e folga. O contorno é rasterizado conservadoramente, dilatado e representado por topo/base em cada coluna. A silhueta original para desenho permanece em `desenho`. O par topo/base preenche lacunas verticais: não representa todos os furos de um polígono de forma exata.

Rotações: fixa = 0°, 180 = 0°/180°, livre = 0°/90°/180°/270°. A rotação prévia da arte é uma transformação adicional, distinta da rotação escolhida pelo encaixador. `offX`, `offY` e `recuo` são necessários para desfazer o recorte da máscara e tratar o halo nas bordas.

## Falhas reproduzidas e correções

| Falha | Evidência antes | Correção |
|---|---|---|
| Cancelamento na fórmula de área | Retângulo pequeno transladado devolvia zero | Origem local e soma de Neumaier |
| Conferência parcial liberada | Uma peça válida fazia uma peça NaN passar despercebida | Exigir cobertura de todas as posições |
| Largura infinita aceita | Infinity era contado como peça conferida | Finitude e extensão representável |
| Máscara corrompida aceita | Base -1 com topo 0 não era recusada | Validar dimensões, vetores e intervalos |
| Arredondamento ocultava colisão | Deslocamento 0,75 em célula 1 eliminava sobreposição de 0,25 | Comparação contínua em origem local |
| Passos diferentes acusavam colisão inexistente | Caixa envolvente tomada como silhueta | Varredura de dois cursores nas colunas |
| NaN podia ser primeiro campeão | `melhorQue(candidato, null)` aceitava consumo NaN | Rejeição antes da comparação |
| Perfil i32 podia ultrapassar intervalo | Continuação perto de 2^31 células sem guarda | Cota conservadora verificada antes de converter |
| Bancada forçada ignorada no WASM | JS respeitava `linhasBancadaForcado`, WASM recalculava | Mesmo contrato nos dois caminhos |

O oráculo dos testes transforma cada coluna ocupada em um retângulo independente e compara todos os pares. Ele não reutiliza a lógica de dois cursores do verificador. Foram testados 500 pares, transladados também para 10^8 cm, além de passos diferentes, contatos e corrupções.

## Tolerâncias e limites

A correção não engrossa a grade nem arredonda as peças. As comparações de sobreposição toleram somente um erro numérico proporcional a 32 × epsilon de máquina × magnitude. Isso evita rejeitar contatos que diferem por poucos erros de representação; não é uma tolerância industrial e não constitui uma autorização para invadir a folga. No catálogo foi observado contato com diferença de 2,73 × 10^-12 cm após acumulação de posições.

O perfil deve permanecer entre 0 e 2^31-1 células; a guarda soma uma cota conservadora das alturas e dos avanços de bancada, e pode recusar um caso que caberia com uma ordem melhor. É preferível uma recusa explícita a overflow silencioso. Essa guarda não transforma o kernel em um solucionador de dimensões ilimitadas.

Área de máscara é uma aproximação do modelo rasterizado. `limiteAreaCm` só é um certificado físico quando as áreas de entrada são exatas e compatíveis com o material — como no teste de retângulos. Não interpretar esse valor como prova de ótimo de polígonos originais.

## Materiais grandes: diagnóstico ainda aberto

O teste de 20 km demonstra funcionamento de coordenadas/comprimento e contagem para um lote retangular sintético; não demonstra velocidade ou qualidade para qualquer modelagem. O canvas atual limita lado e área reduzindo a resolução visual, e o rascunho usa Float32Array. São hipóteses verificáveis para perda visual de detalhe, não causas comprovadas do relato do usuário.

Para reproduzir o relato é necessário um trabalho real, zoom/DPR, medidas e exportação correspondentes. Comparar primeiro as posições salvas com o desenho/exportação. Se as posições estiverem corretas, prototipar renderização apenas da região visível com origem local e medir fidelidade. Se as posições já estiverem erradas, investigar importação, unidade e transformações antes de mexer no canvas.

## Cobertura do verificador

Certifica o contrato discreto/retangular atual, quantidade, rotações, medidas, limites globais, integridade de máscaras, colisão e métricas. Resultados parciais têm `completo=false`. Mistura de caixas e máscaras com folga positiva não é certificada silenciosamente.

Ainda não certifica autointerseções do vetor original, topologia completa de furos, defeitos, orientação contínua, limites de máquina ou todas as regras de divisão em bancadas. Não substitui a conferência dos contornos físicos nem a comparação de exportação.
