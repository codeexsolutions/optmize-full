# ADR 001 — validar o incumbente antes de ampliar o portfólio

Status: implementado localmente; revisão independente pendente.

## Problema e hipótese

Havia casos verificáveis de erro numérico, conferência incompleta e arredondamento de colisões. Adicionar heurísticas antes de eliminar isso premiaria soluções inválidas. Hipótese: validar os candidatos a recorde e corrigir o contrato numérico aumenta a confiabilidade com custo limitado, preservando o portfólio já existente.

## Implementação

Verificador separado do posicionador; área em origem local; comparação contínua de máscaras; entradas finitas e completas; limites i32; validação antes de publicar recordes e após polimento. Diagnósticos por busca/worker, parada entre tentativas e teto opcional por avaliações. Fechamento do canal em `finally` para não reter worker em falhas.

A guarda geométrica completa roda quando o candidato pode substituir o incumbente. Candidatos descartados pelo objetivo não recebem certificado de produção. Placar/ordens de exploração não equivalem a soluções industriais certificadas. Estender certificação a todo rótulo de aprendizado é um item aberto da evolução da memória.

## Teste que poderia refutar

Rejeitar um encaixe legítimo do catálogo, não detectar uma corrupção injetada, divergir entre JS/WASM, perder cópias, mudar a trajetória de uma corrida controlada sem razão ou impor custo desproporcional. Há testes cobrindo esses contratos e comparação temporal curta. O caso misto com folga positiva é recusado explicitamente por não haver certificação completa desse contrato.

## Custo

Varredura AABB ordenada: O(n log n) mais os pares candidatos, pior caso O(n²). Duas máscaras candidatas: O(c_A+c_B). Validação de identidade: O(n). Verificação de máscaras pode visitar suas colunas por cópia. A guarda de intervalo percorre formas; ela não muda o kernel Rust nem exige novo build WASM.

## Resultados e riscos

9/9 regressões, 16/16 contratos, 57/57 corpus, 912 paridades e 42 testes API. Comparação temporal sem ganho demonstrado. A verificação é do modelo discreto, não de contornos vetoriais arbitrários. A cota i32 é conservadora. O preparo e uma tentativa em andamento ainda podem ultrapassar o prazo antes da próxima parada.

Sincronizar o pacote API exigiu remover a antiga compensação de folga na largura. O pacote e o adaptador devem ser promovidos juntos; atualizar somente um deles quebra o contrato.

## Privacidade e aprendizagem

O código coletivo enviava estatísticas sem opção de consentimento. Agora exige `OPTIMIZE_COLETIVO_AUTORIZADO=1`. Não foi ligada essa variável. O teste usa banco temporário e transporte simulado; não consultou dados nem serviço de clientes. Ainda falta uma política completa de aprovação/rollback de modelos globais em conjunto reservado. Até sua implantação, a instalação padrão usa aprendizado local.

## Reversão e revisão

Manter mudanças funcionais de núcleo, adaptador e testes no mesmo lote de revisão. Não executar restauração global da pasta: havia arquivos modificados pelo usuário antes desta missão. Se uma validação recusar trabalho legítimo, preservar fixture e diagnóstico, corrigir o contrato e repetir o corpus; não silenciar a recusa ou reduzir a precisão.

Claude deve revisar especialmente halo/bordas, tolerância numérica, escopo da certificação e política de aprendizagem. Nenhum parecer Claude foi presumido ou fabricado.
