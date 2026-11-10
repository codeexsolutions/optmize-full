# Transferência Codex → Claude

2026-11-09. Documento de sincronização; não é mensagem enviada a outra sessão.

## Estado

O motor real está em `optmize-desktop/src/motores`; a API irmã carrega `src/domain/nesting/engine/motor.mjs`. A casca atual é Tauri. Houve correções de precisão/validação e sincronização do pacote; não foi feita uma reescrita nem uma alegação de ganho de aproveitamento.

Leia `../README.md`, os três documentos de auditoria/especificação, a matriz de algoritmos e `../benchmarks/PERFORMANCE_BASELINE.md`. Logs e JSONs estão ao lado do baseline. O histórico anterior de comentários de performance não foi aceito como resultado novo.

## Revisão solicitada

1. Refutar a matemática de origem local/soma compensada e as tolerâncias de colisão com casos adversariais.
2. Revisar `validarEncaixe.js`: semântica de halo, transparência, cópias, rotações, área e cobertura. O módulo não afirma certificar topologia vetorial nem todos os perfis industriais.
3. Revisar limites i32 e a cota conservadora; estudar coordenadas locais por região com verificação global antes de ampliar o intervalo.
4. Conferir as três camadas: solução matemática, estado salvo e exportação. Os arquivos da tela e do PDF já tinham alterações do usuário e foram preservados.
5. Comparar seleção simples por retorno/custo com rede e placar atuais, sem compartilhar geometrias proprietárias e sem promover modelo por uma vitória isolada.
6. Escolher somente um protótipo prioritário da matriz e fixar hipótese, orçamento, seeds e critérios de rejeição antes da implementação.

## Pendências que precisam de informação real

- Fixture que perde a linha em material grande, configuração, zoom/DPR e saída esperada.
- Tolerância física por processo, largura/comprimento máximos e regras de bancada/corte.
- Exemplos autorizados de furos, defeitos e múltiplas chapas, separados entre ajuste e avaliação reservada.
- Política de liberação e rollback dos modelos aprendidos e autorização de cada instalação para coletivo.

## Trabalho simultâneo

Não sobrescrever mudanças existentes nem editar os mesmos arquivos em paralelo. Antes de iniciar outra sessão, conferir `git status` em desktop/API e separar branches ou worktrees quando disponíveis. Esta execução não criou uma sessão Claude nem presume que ela esteja conectada.

Para atualizar o pacote da API após mudanças aceitas:

```powershell
cd ../optmize-api
$env:OPTMIZE_FULL = (Resolve-Path ../optmize-desktop).Path
npm run motor
node --experimental-strip-types --test test/nesting-full.test.ts test/nesting.test.ts
npm run typecheck
```

O pacote deve acompanhar o adaptador: a largura passada ao novo motor é a largura física, sem somar folga de novo.
