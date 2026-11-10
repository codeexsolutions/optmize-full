# Optimize — execução da missão

Data: 2026-11-09. Responsável por esta execução: Codex. Instrução de origem: `Texto colado.txt`, 813 linhas, lido integralmente. Não houve comunicação automática nem revisão de uma sessão Claude.

## Entrega executada

- Auditoria do código real, especificação matemática e matriz de alternativas.
- Regressões reproduzidas antes da correção: oito falhas em nove grupos de testes.
- Área calculada em origem local com soma compensada, preservando coordenadas originais.
- Verificador de sobreposição rejeita dados incompletos/corrompidos e compara máscaras fora da grade e com passos distintos sem arredondar deslocamentos.
- Verificador independente do posicionador para o modelo atual: identidade, quantidade, rotação, medidas, limites globais, área e colisão. Confere a folga dos resultados inteiramente retangulares; nas máscaras, confere origem, escala e compatibilidade do halo com a folga solicitada.
- Candidatos só se tornam recordes depois de verificados; polimento também passa pela verificação. Canal de execução é fechado mesmo em exceções.
- Cancelamento e prazo conferidos entre tentativas do lote; `maxTentativas` permite experimentos com esforço controlado. Telemetria de primeira solução, melhor solução, validação e rejeições.
- Proteção contra overflow do perfil i32 e paridade da bancada forçada entre JS/WASM.
- Pacote do motor atualizado na API, com ajuste do adaptador para não acrescentar largura física inexistente.
- Aprendizado coletivo exige `OPTIMIZE_COLETIVO_AUTORIZADO=1`. O padrão usa somente aprendizado local. A variável deve refletir autorização do responsável pela instalação; não foi habilitada nesta execução.

## Evidências

| Verificação | Resultado registrado |
|---|---|
| Regressões de precisão e sobreposição | 9/9; antes, 1/9 |
| Contratos, cancelamento, identidade e limites | 16/16 |
| Oráculo independente de colisão | 500 pares × duas translações, dentro dos testes acima |
| Catálogo: 19 trabalhos × três posicionadores | 57/57 válidos |
| Paridade JS/WASM | 912 rodadas iguais |
| API de encaixe | 42 testes aprovados |
| Compilação e tipos | Build Vite isolado e TypeScript do desktop/API aprovados |
| Folga real e ponte Sparrow | Conferências existentes aprovadas |
| Coletivo | Sem autorização: zero requisições; transporte simulado também testa timeout, renovação e cache |
| Rolo extremo sintético | 2.000 retângulos em 20 km, sem perda de cópias; ótimo certificado somente para esse caso retangular simples |

Os arquivos brutos estão em `benchmarks/`. `PERFORMANCE_BASELINE.md` explica os orçamentos e limitações. A comparação inicial **não demonstra ganho de aproveitamento ou velocidade**. O ganho demonstrado é de correção e capacidade de reproduzir/verificar experimentos.

## Como repetir

No diretório `optmize-desktop`:

```powershell
npm run bancada:integridade
npm run bancada:corpus
npm run bancada:conferir
npm run bancada:folga
npm run bancada:encolher
npm run bancada:coletivo -- --sem-rede
npm run bancada:reprodutivel -- --json docs/optimize/benchmarks/reprodutivel-novo.json
npm run tipos
```

Para comparar qualidade sob tempo fixo, usar `bancada/medir.js` com os mesmos trabalhos, sementes, fatias e duração. Não comparar a corrida por 256 avaliações com uma corrida de dois segundos como se fossem o mesmo experimento.

## Estado das etapas do documento

| Etapa | Estado e próxima evidência necessária |
|---|---|
| 1. Reconhecimento | Auditoria Codex concluída para os componentes de encaixe; parecer Claude pendente |
| 2. Referência verificável | Testes e baseline sintético estabelecidos; conjunto real reservado ainda não fornecido |
| 3. Materiais grandes | Falhas numéricas e validações corrigidas; o sintoma visual específico do usuário ainda não foi reproduzido |
| 4. Pesquisa | Especificação, fontes primárias e matriz de candidatos registradas |
| 5. Experimentos | Regressões, corpus, comparação temporal e modo de avaliações implementados; novas heurísticas não promovidas sem evidência |
| 6. Motor híbrido | Já existia; validado e reforçado. Não foi substituído por uma reescrita |
| 7. Aprendizado | Memória/rede já existentes; isolamento configurável acrescentado. Não há certificação de generalização em conjunto reservado |
| 8. Polimento industrial | API sincronizada e verificações fortalecidas; exportação vetorial completa, viewport de rolos extensos e novos perfis permanecem abertos |

## O que impede chamar a missão inteira de concluída

Falta o trabalho real que apresenta a perda de linha, com largura, comprimento, unidade, folga, rotações, tempo escolhido e indicação de onde o defeito aparece (tela, arquivo exportado ou posições salvas). Também faltam tolerâncias de fabricação e casos representativos dos novos materiais.

O modelo atual não certifica topologia vetorial arbitrária, aproveitamento de furos, defeitos no material, kerf específico de máquina, múltiplas chapas de custos distintos ou todas as regras de bancada. JSON de posições foi testado; equivalência completa com PDF/DXF/PLT não foi certificada nesta rodada. O exemplo 3,90 m/60 s → 3,86 m/500 s não foi usado como medição do código.

As alterações pré-existentes em `src/telas/Encaixe.tsx`, `src/producao/controlador.js`, `servidor/encaixe-pdf.js`, `bancada/conferir-cor-e-vetor.mjs` e `dist/` foram preservadas. Não foi feito deploy nem release.

## Leitura técnica

- [Arquitetura](research/ARCHITECTURE_AUDIT.md)
- [Geometria e limites](research/GEOMETRY_AUDIT.md)
- [Especificação matemática](research/MATHEMATICAL_SPEC.md)
- [Pesquisa e decisões de algoritmos](research/ALGORITHM_MATRIX.md)
- [Baseline medido](benchmarks/PERFORMANCE_BASELINE.md)
- [Decisões e riscos](decisions/001-integridade-e-reproducibilidade.md)
- [Transferência para o Claude](handoffs/CODEX_TO_CLAUDE.md)
