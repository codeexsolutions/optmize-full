# Auditoria da arquitetura

Inspeção de 2026-11-09. Commit-base desktop: `7017c91c50f1b7c2caf5f7055b1933a39c989d77`. Havia alterações locais anteriores, portanto o estado da pasta inteira não deve ser descrito como um checkout limpo desse commit. Os arquivos de núcleo corrigidos inicialmente estavam limpos.

## Caminho real

| Componente | Implementação observada | Responsabilidade |
|---|---|---|
| Aplicativo | React 19, TypeScript/JavaScript, Vite 8, Tauri 2 | Interface, processo local e distribuição |
| Servidor local | Node 24, Express, SQLite | Modelagens, histórico, arquivos e exportação |
| Preparo | `encaixePrepara.js`, `pecaNaGrade.js`, `encaixeMascara.js` | Máscaras conservadoras, halo, rotações e caches |
| Núcleo | `encaixeMotor.js` | MaxRects, contorno, vãos, faixas, blocos, receitas e refinamento |
| Paralelismo | `encaixeParalelo.js`, `encaixeWorker.js` | Workers, divisão do portfólio, cancelamento e melhor global |
| Kernel | `encaixeWasm.js`, `wasm/src/lib.rs` | Perfil inteiro, SIMD e memória compartilhada pela ABI |
| Compactador | `encaixeEncolher.js`, `wasm-encolher/` | Ponte para Sparrow/jagua-rs, com rejeição de resultados inválidos |
| Aprendizado | `encaixeRede.mjs`, `servidor/encaixe-memoria.js` | Vetor de características, placar e histórico local |
| Coletivo | `servidor/encaixe-coletivo.js` | Troca de estatísticas; agora condicionada à autorização explícita |
| Desenho | `desenhoDoEncaixe.js` | Canvas, zoom, prévias e rascunho ao vivo |
| API irmã | `optmize-api/src/domain/nesting/` | Busca TypeScript e adaptador para o motor empacotado |

O README da pasta superior descrevia Electron e encaixe predominantemente no servidor. Isso não corresponde ao desktop inspecionado: a casca atual é Tauri e o motor local roda em workers. Comentários históricos dentro dos módulos também citam arquivos já removidos; não são prova de arquitetura atual.

## O que já existia

Busca multi-start com seed, ordenações por área/altura/lado/família, agrupamentos solta/dupla/trio/cruzada, poda de receitas, diversificação após estagnação, reinserção e reparo dirigido, repescagem de vãos, alternativas por faixa/bloco, melhor incumbente e Sparrow como segunda fase. Não há motivo medido para reconstruir tudo em outra linguagem.

Há preparação por fila de workers, caches por máscara/unidade e planos WASM com geração. O kernel usa perfil de largura O(W/passo), não uma matriz proporcional ao comprimento inteiro do rolo. Por outro lado, a renderização ainda cria um canvas proporcional ao comprimento e limita DPR quando ele cresce.

## Mudanças desta execução

`validarEncaixe.js` não depende do posicionador: confere o resultado contra as cópias solicitadas. `limitesDaGrade.js` protege as conversões i32. A busca valida novos recordes e o polimento; registra rejeições e tempos; verifica cancelamento entre tentativas e fecha o MessageChannel em `finally`. Os workers carregam esses diagnósticos e o agregador distingue soma de tempo de validação de tempo de parede.

A API usava um snapshot mais antigo que reservava folga na borda. O desktop atual já compensa a borda internamente. Ao atualizar o pacote, foi necessário remover a segunda compensação no adaptador. Há regressão específica de duas peças de 50 cm, folga 1 cm e mídia de 100 cm: precisam de duas linhas.

## Riscos e fronteiras

- A maior parte do núcleo continua num módulo grande. Extrair componentes sem alterar a trajetória será mais seguro após estabilizar as assinaturas de benchmark.
- A API ainda tem outro portfólio TypeScript. A validação do motor Full não equivale a auditar cada saída desse outro portfólio ou a rota inteira.
- O orçamento temporal da busca não inclui todo o preparo anterior; uma tentativa síncrona em andamento não é interrompida no meio. A parada agora ocorre na próxima fronteira de tentativa, não só ao fim do lote.
- Limites globais de RSS, quantidade de vértices e custo do preparo ainda não formam uma política completa de admissão.
- Não foram alterados bancos existentes, dados de clientes nem os arquivos que já estavam modificados pelo usuário.
