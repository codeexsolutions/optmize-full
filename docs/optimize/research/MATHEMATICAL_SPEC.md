# Especificação matemática e contratos

## Geometrias e unidades

Uma modelagem contém contornos externos, furos, identidade imutável, unidade de origem, área, perímetro, caixa, quantidade, orientações permitidas, opção de espelhamento e restrições de fabricação. A conversão para centímetros ocorre uma vez na fronteira. A geometria canônica nunca é substituída pela simplificação visual.

Para a cópia k de P_i, a posição é Q_ik = R_theta S_m P_i + t, onde theta pertence ao conjunto autorizado, S_m é identidade ou reflexão explicitamente permitida e t=(x,y). A matriz de transformação deve ser reconstruída da geometria original, evitando rotações sucessivas acumuladas.

Material j: região útil U_j, defeitos D_j, largura W_j, comprimento L_j, bordas, direção e custo. A condição física é Q_ik contido em U_j menos D_j; interiores de peças não se cruzam. Para folga isotrópica g, exigir distância entre peças pelo menos g, ou testar offsets de raio g/2 com tratamento separado da borda. O halo pode ultrapassar a borda quando não há vizinha fora do material; a peça real não pode.

## Problemas diferentes

| Problema | Variáveis | Objetivo e limite inferior |
|---|---|---|
| Bobina de largura fixa | posições, orientações e comprimento | Minimizar L; L >= soma das áreas exatas / W |
| Uma chapa fixa | posições/orientações e atendimento | Testar viabilidade; maximizar atendimento somente se a produção autorizar pedido parcial |
| Várias chapas | atribuição à chapa, posições e ativação | Minimizar custo total, depois desperdício; número de chapas >= teto(soma áreas / área útil) somente para chapas equivalentes |
| Material irregular/defeituoso | mesmas variáveis e região admissível | Restrições de contenção em U menos D; área disponível sozinha não garante encaixe |

Em bobina sem defeitos, aproveitamento = 100 × soma das áreas / (W × L). Com bancadas, custo de página, perdas e margens, usar o comprimento efetivamente consumido/exportado. Nunca comparar um consumo truncado com área de todas as peças de um pedido parcial.

## Ordem de aceitação

1. Geometria e restrições válidas no modelo declarado.
2. Maior atendimento do pedido; todas as cópias contabilizadas exatamente uma vez entre colocadas e faltantes.
3. Menor custo/comprimento, mantendo o melhor válido conhecido.
4. Desperdício irrecuperável, tempo e preferências secundárias, sem trocar viabilidade por pontuação.

A busca atual usa faltantes, consumo e preferência por representação de contorno no empate. O novo verificador protege a entrada de incumbentes. Para múltiplas chapas a comparação deve receber um vetor explícito de custos, não reaproveitar `consumo` com significado ambíguo.

## Perfil industrial proposto

O perfil é dado, não outro algoritmo: `tipoMaterial`, `unidade`, `larguraUtil`, `comprimentoFixo?`, `bordas`, `folga`, `kerf`, `orientacoes`, `espelhar`, `defeitos`, `direcao`, `limitesMaquina`, `toleranciaFisica` e `politicaSobras`.

O adaptador deve recusar propriedades que o solucionador não implementa. Não ignorar defeitos ou espelhamento desconhecido para continuar encaixando. Começar com o perfil de bobina já existente; chapas/couro precisam de fixtures e confirmação das regras de corte antes de ativação.

## Ensaios metamórficos

- Translação comum preserva área e colisões dentro do intervalo numérico suportado.
- Escala s requer escalar material, peças, folga, bordas, defeitos e passo; área varia por s².
- Inverter orientação de contorno troca sinal da área, não sua magnitude.
- Permutar as cópias não pode mudar atendimento; pode mudar a heurística gulosa, portanto comparar somente invariantes corretos.
- Prefixos de busca preservam o melhor válido; cancelamento não perde o incumbente.
- Salvar/reabrir/exportar preserva transformações e identidade. JSON foi coberto nesta rodada; equivalência vetorial de exportação continua aberta.

Ótimo global só pode ser anunciado com certificado do modelo ou igualdade entre solução viável e limite inferior válido. O caso de 2.000 retângulos preenchendo toda a largura satisfaz essa igualdade; os trabalhos irregulares medidos não têm certificado de ótimo.
