# Auditoria de arquitetura do motor de encaixe

**Autor:** Claude (pesquisa matemática e arquitetura) · **Data:** 2026-11-09 ·
**Revisão auditada:** `7017c91` (branch `Pedro`) · **Estado:** etapa 1, aguardando revisão do Codex

As referências de linha são do commit acima. Tudo o que está aqui foi lido no
código ou medido; o que é inferência está marcado como tal.

---

## 1. Resumo em cinco linhas

1. O motor **não encaixa polígonos: encaixa pegadas em grade**. Cada peça vira
   uma máscara por rotação (0/90/180/270), e o encaixe usa só `topo`/`base`
   por coluna, ou seja, uma pegada coluna-convexa engordada pela folga.
2. Uma **busca local iterada sobre a ordem das peças** decodifica cada ordem com
   encaixadores construtivos (skyline, vãos, faixas, blocos) e sorteia receitas
   de um portfólio (42 receitas, 58 com giro livre), com poda, memória e uma rede.
3. Na produção há **duas fases**: a busca fica com 15% do tempo (3 s a 20 s) e o
   **sparrow** (Gardeyn & Wauters, compactação por minimização de sobreposição,
   via WASM) fica com o resto, partindo do melhor encaixe da busca.
4. Toda saída passa por **duas travas independentes**: a de máscara em
   centímetros (`acharSobreposicao`) e a conferência pela **arte**
   (`conferenciaDaArte`), que não usa máscara nenhuma.
5. Muito do que a missão pede **já existe e foi medido** (veja §12). As lacunas
   reais estão na geometria (pegada coluna-convexa, grade presa à largura), na
   escala (sparrow em f32, sparrow desligado com bancada, desenho de rolo longo)
   e na validade da bancada (portfólio diferente do da produção).

---

## 2. Tecnologias

| Camada | O que é | Onde |
|---|---|---|
| Motor | JavaScript ESM, roda na página **e** em Web Worker | `src/motores/encaixe*.js` |
| Encaixe por contorno rápido | Rust → WebAssembly com SIMD `i32x4`, 6,5 KB | `wasm/src/lib.rs`, `estatico/encaixe.wasm` |
| Compactação | sparrow (Rust, MIT) sobre `jagua-rs 0.8.3`, coordenadas **f32**, via `wasm-bindgen`, 803 KB | `wasm-encolher/`, `src/motores/encolher/` |
| Memória e rede | Node/Express + SQLite; MLP escrita à mão (`encaixeRede.mjs`, 329 linhas com o vocabulário) | `servidor/encaixe-memoria.js`, `src/motores/encaixeRede.mjs` |
| Memória coletiva | sincronização com o backend (só números) | `servidor/encaixe-coletivo.js` |
| PDF | montado no servidor local, arte intocada | `servidor/encaixe-pdf.js` |
| Tela | React + o controlador imperativo do Encaixe; casca Tauri | `src/telas/Encaixe.tsx`, `src/producao/controlador.js` |
| Bancada | medição fora do navegador com o mesmo motor (esbuild) | `bancada/` |

---

## 3. O caminho de um encaixe

```
arquivos → silhueta (alfa ≥ 8, fundo removido) → máscaras por rotação (preparaWorker)
        → buscarMelhorEncaixeEmParalelo (encaixeParalelo.js:319)
            ├─ fase 1: N workers, cada um com uma fatia do portfólio (busca construtiva)
            └─ fase 2: sparrow em todos os workers, sementes diferentes, a partir do campeão
        → travas: acharSobreposicao (encaixeSobreposicao.js:221) + conferenciaDaArte
        → desenho na tela (desenhoDoEncaixe.js) · PDF no servidor (encaixe-pdf.js)
        → memória: placar da receita, histórico, melhor encaixe guardado, rede
```

A fase 2 só roda quando `motivoDoTrabalho` não acha impedimento
(`encaixeEncolher.js:139`): **bancada ligada, grupo marcado ou peça sem
silhueta desligam o sparrow**.

---

## 4. Representação

- **Grade.** `grade(larguraTecido, espaco)` (`encaixeMascara.js:185`) escolhe
  o passo para metade da folga caber num número inteiro de células, com teto
  `clamp(W/300, 0,2, 1)` e **piso `W/1000`**. Abaixo do piso, a folga sai maior
  que a pedida. O efeito disso em tecido largo está no `GEOMETRY_AUDIT-CLAUDE.md`, §4.1.
- **Silhueta.** Arte: pixel com alfa ≥ 8 (`ALFA_PECA`). Vetor (Corel e bancada):
  `rasterizarPoligono` marca **toda célula que o contorno toca**, ou seja, uma
  aproximação por fora (`encaixeMascara.js:593`).
- **Folga.** Engorde pelo `discoDoRaio` (`:355`), o menor disco que garante a
  distância entre **quadrados** (não entre centros). No raio 1 ele é o
  quadrado 3×3. A folga é entre peças: a borda do tecido não leva folga
  (`raioDaBorda`, `encaixeMotor.js:220`).
- **Máscara usada pelo encaixe.** `prepararMascara` (`encaixeMascara.js:527`)
  guarda `topo[c]`/`base[c]` da silhueta engordada e o `desenho` real (só para a
  tela). **O encaixe trabalha só com topo/base**, então a peça ocupa, em cada
  coluna, da primeira à última célula: a pegada é coluna-convexa.
- **Rotações.** Discretas: `fixa` → [0], `180` → [0, 180], `livre` → [0, 90,
  180, 270] (`encaixeGiro.js:24`). `rotacaoBase` gira a arte antes do encaixe, e o
  PDF aplica o giro na matriz da página com a arte de pé.
- **Unidades.** Posições em **cm** (float64); motor em **células** (Int32);
  sparrow em **células f32, transposto** (linha ↔ coluna); PDF em **pontos**.

---

## 5. Os encaixadores (decodificadores de uma ordem)

| Motor | Ideia | Onde | Na produção |
|---|---|---|---|
| `contorno` | skyline: a peça desce até o relevo; heurísticas `fundo`/`vazio`; varredura com `saltoX` e colunas-sonda; WASM | `encaixarContorno` `:2548`, `melhorPosicaoDaUnidade` `:1728` | sim |
| `vaos` | tecido como intervalos livres por coluna: a peça pode entrar num vão abaixo do relevo (BLF por intervalos) | `encaixarPorVaos` `:2877` | sim |
| `faixas` | divide o rolo em duas faixas de larguras escolhidas e encaixa cada uma | `encaixarPorFaixas` `:3349` | sim |
| `blocos` | janelas de 8 unidades, 12 arrumações testadas por bloco | `encaixarPorBlocos` `:3132` | não (opcional) |
| `retangulo` | MaxRects (`bl`, `bssf`, `blsf`, `baf`) | `encaixar` `:795` | **só para medir "pela caixa"** |

**Agrupamentos** (pré-encaixe de cópias): `solta`, `dupla`, `trio`, `quarteto`
e `cruzada` (pares de silhuetas diferentes), em `montarUnidades` `:1632` e
`montarUnidadesCruzadas` `:1425`. **Ordens:** `area`, `altura`, `lado`,
`familia` (`ORDENS_CONTORNO` `:3552`).

O **polimento** final repesca peças nos vãos (`repescarNosVaos` `:2274`, 3
voltas). O **complemento** encaixa peças novas nos vãos de um risco pronto
(`complementarNosVaos` `:2518`).

---

## 6. A busca (`buscarMelhorEncaixe`, `encaixeMotor.js:3892`)

- **Codificação:** permutação das unidades (a "ordem"), mais a receita (motor ×
  agrupamento × ordem × heurística). Contada na bancada: 42 receitas sem giro
  livre, 58 com.
- **Passada base:** cada receita roda uma vez sem sacudir, na ordem da sua
  receita, com o peso que a memória e a rede dão.
- **Sorteio:** depois disso todas valem igual. A **poda** larga a receita mais de
  6% atrás do melhor (`PODA_TOLERANCIA`) e o motor inteiro mais de 4% atrás
  (`PODA_MOTOR`); 15% do sorteio ignora a poda (`PODA_FRESTA`).
- **Vizinhança:** `baguncar` com força adaptativa (de 0,05 a 0,4, cresce com o tempo
  parado); `repararPior` (30% ao refinar) mexe na unidade que mais atrapalhou;
  `reinserir` existe, mas está desligado porque foi medido e não compensou.
- **Memória de elite:** a melhor ordem por tipo de lista (`melhoresOrdens`); o
  modo `refinar` parte dela.
- **Estagnação:** passados `msSemGanho` sem ganho, é a **parede** (`:4499`): o
  modo alterna entre explorar e refinar, a poda fica suspensa por meio intervalo
  e o relógio zera. A parede não encerra a busca.
- **Parada:** tempo pedido; botão de parar (`deveParar`); meta de
  aproveitamento (0,95 na produção); o recorde guardado é perseguido durante
  até 60% do tempo.
- **Sorteio com semente:** LCG (`geradorDeSorteio` `:68`). O resultado mesmo
  assim **não é determinístico**, porque o relógio encerra a busca. Pelo
  `medir.js`, há 0,23% de diferença na soma entre duas corridas iguais.

**Configuração da produção** (`controlador.js`, na chamada da busca):
`motores = contorno + vaos + faixas` no modo automático,
`metaAproveitamento: 0.95`, `tempoMaximoMs` = campo da tela (1 s a 300 s),
`msSemGanho = max(800, 25% do tempo)`, `alvo` = consumo do encaixe guardado.

---

## 7. Paralelismo

- `quantosWorkers() = min(8, núcleos − 1)` (`encaixeParalelo.js:45`).
- Cada worker roda a busca inteira numa **fatia disjunta** do portfólio
  (receitas `k, k+n, k+2n…`). Não há troca de solução entre fatias durante a
  busca; o orquestrador fica com a melhor.
- A **fatia 0 é controle**: `redeMadura: false`, então a rede não corta
  receitas nela. Isso impede a rede de se autoconfirmar.
- A fase 2 roda o sparrow em todos os workers com sementes diferentes, cada um
  com o tempo que sobra.

---

## 8. O sparrow (`encaixeEncolher.js`)

- Parte do encaixe da busca, transposto para o quadro dele. A forma é o
  **contorno em escada do topo/base**, ou seja, a mesma pegada coluna-convexa.
- `min_item_separation = 0,01` célula, que é a margem para arredondar a volta
  para a grade.
- Toda solução que volta é **conferida** (`resultadoDoSparrow`): contagem de
  peças, limites e `acharSobreposicao`. O que falha vira `rejeitados` e vale a
  última que passou. **Nunca sai pior que a busca.**
- Medido pela equipe (cabeçalho do arquivo): `producao-avulsa` 32,300 m → 31,394
  m (−2,8%) nas máscaras; 31,154 m (−3,6%) nos contornos exatos. Os 0,8% de
  diferença ficaram para quando a trava conferir contorno em vez de célula.

---

## 9. Memória e aprendizado

- **Placar por assinatura** (`assinaturaDoTrabalho` `:3743`, em baldes): usos
  e vitórias de cada receita, no SQLite local.
- **Rede das receitas** (`encaixeRede.mjs`): prevê a chance de cada receita
  ganhar a partir do vetor do trabalho. É retreinada a cada 20 exemplos novos e
  só corta receitas depois de madura (`REDE_LIMIAR_MADUREZA = 200` exemplos e
  diversidade mínima).
- **Encaixe guardado:** o melhor encaixe de cada trabalho exato volta com um
  clique (`/guardado`). Ele é remontado a partir de números, por isso passa
  pela trava (foi de lá que veio um defeito real de peça dentro de peça).
- **Memória coletiva** (`encaixe-coletivo.js`): envia ao backend assinatura,
  largura, quantidade, consumo, aproveitamento, receita e vetor, com um código
  de instalação sorteado. Nenhuma arte, nenhum nome. Baixa a rede e o placar
  globais. **Não há controle na tela para ligar ou desligar** — ver §13.

---

## 10. Verificação

| Trava | O que confere | Independente de quê |
|---|---|---|
| `acharSobreposicao` | pares de peças, grossa por caixa, fina por coluna de máscara, em cm | do encaixador (pega encaixe remontado do banco) |
| `conferenciaDaArte` | sobreposição e folga desenhando a **arte** das duas peças numa grade comum | da máscara (pega leitura errada da arte) |
| sparrow → `resultadoDoSparrow` | contagem, limites, `acharSobreposicao` | do sparrow |
| bancada: `conferir-sobreposicao`, `conferir-bancada` (corte), `conferir-folga-real`, `conferir` (WASM ≡ JS) | propriedades do motor em lotes de referência | da tela |

Falta, frente à lista da missão (§15 dela): conferir giro permitido por peça,
conferir que a quantidade bate em todo caminho, conferir valores não finitos e
conferir que o salvo é igual ao exportado. Há pedaços espalhados (o PDF não sai
com peça faltando, o sparrow conta as peças), mas não um verificador único.

---

## 11. Desenho e saída

- **Tela:** `desenharEncaixe` (`desenhoDoEncaixe.js:360`) desenha o risco
  **inteiro** num canvas só, deitado. Quando o canvas passa do teto do Chrome
  (64.000 px de lado, 16.000² de área), `resolucaoQueCabe` (`:304`) **baixa a
  resolução do desenho inteiro**. O rascunho ao vivo da busca já desenha só a
  janela visível. O efeito em rolo longo está no `GEOMETRY_AUDIT-CLAUDE.md`, §4.2.
- **PDF:** página no tamanho real, sem `/UserUnit`, mesmo acima de 200
  polegadas. É uma decisão consciente, porque o RIP da produção ignora o
  campo (`encaixe-pdf.js:36`). Com bancada, sai uma página por bancada.
- **Aproveitamento:** `aproveitamentoDaMidia(areaReal, W, mídia)` (`:372`), com
  `areaReal` da máscara (bits ou cobertura de alfa), e não do contorno exato.

---

## 12. O que a missão pede e já existe

| Pedido da missão | No código |
|---|---|
| broad-phase/narrow-phase de colisão | `acharSobreposicao` (caixa → coluna) |
| BL / BLF / skyline / best-fit | `contorno`, `vaos`, MaxRects |
| multi-start, ILS, perturbação adaptativa | passada base + explorar/refinar + `baguncar` com força variável |
| preservação de elite e reaproveitamento | `melhoresOrdens`, encaixe guardado |
| detecção de estagnação e troca de estratégia | as paredes |
| portfólio e seleção adaptativa (bandit) | placar por assinatura + rede + poda + fatia de controle |
| busca em paralelo | fatias disjuntas por worker |
| compactação global / "encolher o rolo" | sparrow com conferência e reversão |
| sistema anytime, cancelamento seguro | desenho ao vivo, `deveParar`, melhor encaixe sempre guardado |
| verificador independente | duas travas, uma delas pela arte |
| benchmarks reproduzíveis com sementes | `bancada/medir.js`, `--contra`, `--extra` |

## 13. Lacunas e riscos encontrados

1. **A bancada não mede o portfólio da produção.** `corrida.js` usa
   `contorno + retangulo` quando `motores` não vem, e a produção roda `contorno
   + vaos + faixas`. Medição antiga que não passou `--extra motores=...` mediu
   outra coisa. Proposta: ADR-0003.
2. **Pegada coluna-convexa.** A cava e qualquer vão vertical dentro de uma
   coluna viram área cheia, nas duas fases. Medido: +8,6% na camiseta, +7,9% na
   regata (`GEOMETRY_AUDIT-CLAUDE.md`, §2).
3. **Precisão presa à largura do tecido.** O piso `W/1000` faz a folga real
   crescer com a largura: 4 mm viram 6,4 mm em 320 cm.
4. **Escala no comprimento:** o sparrow em f32, o sparrow desligado com
   bancada e o desenho da tela (ver o diagnóstico no `GEOMETRY_AUDIT-CLAUDE.md`).
5. **Aproveitamento exibido com área de grade.** Em vetor, a área da máscara
   passa a área verdadeira em 0,3% a 12% por peça. O número mostrado sai otimista.
6. **Memória coletiva sem consentimento visível.** Só números saem, mas não há
   aviso nem opção. Não é defeito técnico: é decisão de produto e de LGPD, e
   fica com o dono do produto.
7. **Não há limite inferior nem curva no tempo nos relatórios.** Sem eles não
   se sabe o quanto ainda dá para melhorar nem se o tempo pedido rende. Os
   scripts `auditar-geometria.js` e `curva-no-tempo.js` começam isso.
