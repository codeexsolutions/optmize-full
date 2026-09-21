# Encolher o rolo — plano de implementação

> **Para quem executa:** SUB-SKILL: superpowers:executing-plans (inline, nesta sessão — o usuário delegou a execução e pediu o servidor aberto no fim). Passos em `- [ ]`.

**Objetivo:** depois da busca de hoje, o sparrow (WASM, nos workers) encolhe o rolo do melhor encaixe; nunca sai pior que hoje.

**Arquitetura:** crate Rust fina (`wasm-encolher/`) → cola do wasm-bindgen versionada em `src/motores/encolher/`; ponte pura em `src/motores/encaixeEncolher.js` (máscara ↔ polígono em escada, encaixe ↔ solução do sparrow, validação pela trava da produção); segunda rodada nos workers (`encaixeWorker.js`, `encaixeParalelo.js`); bancada mede as duas fases.

**Tecnologia:** Rust 1.97 (wasm32-unknown-unknown), sparrow `7f0e10f` (MIT) + jagua-rs 0.8.3 (MPL-2.0), wasm-bindgen 0.2.128, JavaScript ESM (Vite / esbuild na bancada).

**Spec:** `docs/superpowers/specs/2026-09-21-encolher-o-rolo-design.md`

## Restrições globais

- O critério é metro no pedido grande: `producao-avulsa`, `lote-grande`, `lote-enorme` com `--extra motores=contorno+retangulo+vaos+faixas`, máquina livre, corridas seguidas.
- Nunca pior que hoje: todo encaixe do sparrow passa por `acharSobreposicao` (zero pares), todas as peças uma vez, dentro do rolo — senão vale o da busca.
- Fora da v1 (fica o da busca, com motivo): bancada ligada, grupos marcados, peça que não coube.
- Unidade da instância do sparrow = célula da grade (`passo`); `strip_height` = `floor(larguraTecido / passo)`; separação mínima 0,01 célula.
- Giro: nosso 0/90/180/270 ↔ sparrow 0/−90/180/90 (a transposição inverte o sentido).
- Comentários no estilo da casa: português, o PORQUÊ e o que foi medido.
- Commit só quando o usuário pedir (instrução da sessão). Os arquivos desta obra ficam listados no fim para o commit.
- Não mexer nos arquivos do trabalho de conta do usuário (`servidor/conta.js`, `src/conta/`, `servidor/server.js`, `src/App.tsx`).

## Mapa de arquivos

| arquivo | papel |
|---|---|
| `wasm-encolher/Cargo.toml`, `wasm-encolher/src/lib.rs` | a crate (já escrita e compilando) |
| `empacotar/encolher.js` | compila a crate e gera a cola (`npm run build:encolher`) |
| `src/motores/encolher/encolher.js`, `encolher_bg.wasm` | gerados, versionados |
| `src/motores/encaixeEncolher.js` | a ponte (novo) |
| `bancada/conferir-encolher.js` | a prova da ponte (novo; `npm run bancada:encolher`) |
| `bancada/motor.js` | carrega o WASM do encolhedor na bancada |
| `bancada/corrida.js` | a corrida ganha a segunda fase |
| `src/motores/encaixeWorker.js` | mensagem `encolher` |
| `src/motores/encaixeParalelo.js` | a segunda rodada |
| `src/producao/controlador.js` | fase `encolhendo`, o resultado, o tempo sugerido |
| `package.json`, `.gitignore` | script e `wasm-encolher/target/` |

---

### Tarefa 1: o WASM do encolhedor, compilado e versionado

**Arquivos:** criar `empacotar/encolher.js`; modificar `package.json` (script `build:encolher`, `bancada:encolher`), `.gitignore`; gerar `src/motores/encolher/encolher.js` e `encolher_bg.wasm`.

**Produz:** `import iniciar, { initSync, encolher } from "./encolher/encolher.js"` — `encolher(instanciaJson, partidaJson|undefined, tempoMs, fracaoCompressao, semente, separacao, trabalhadores, relatar(json, largura)) → string`.

- [ ] Escrever `empacotar/encolher.js`: roda `cargo build --release --target wasm32-unknown-unknown` em `wasm-encolher/`, confere que `wasm-bindgen --version` é `0.2.128` (a mesma do `Cargo.lock`; se não for, para com a instrução `cargo install wasm-bindgen-cli --version 0.2.128 --locked`), roda `wasm-bindgen --target web --no-typescript --out-dir src/motores/encolher --out-name encolher <wasm>` e escreve um cabeçalho "GERADO — não editar" no topo do `encolher.js`.
- [ ] `package.json`: `"build:encolher": "node empacotar/encolher.js"`, `"bancada:encolher": "node bancada/conferir-encolher.js"`.
- [ ] `.gitignore`: `wasm-encolher/target/` junto do `wasm/target/`.
- [ ] Rodar `npm run build:encolher`. Esperado: `src/motores/encolher/encolher.js` e `encolher_bg.wasm` (~800 KB).

### Tarefa 2: a ponte e a prova dela

**Arquivos:** criar `bancada/conferir-encolher.js` (primeiro) e `src/motores/encaixeEncolher.js`; modificar `bancada/motor.js` (entra `motores/encaixeEncolher.js` na lista e o WASM é carregado).

**Consome:** `agruparPorSilhueta`, `rotacoesDe` (motor), `acharSobreposicao` (trava), a cola da Tarefa 1.

**Produz (exports de `encaixeEncolher.js`):**
- `ENCOLHER_SEPARACAO = 0.01`, `ENCOLHER_FRACAO_COMPRESSAO = 0.2`, `ENCOLHER_TRABALHADORES = 3`, `ENCOLHER_MINIMO_MS = 3000`, `ENCOLHER_RESERVA_MS = 1500`
- `tempoDaBusca(tempoTotalMs) → ms` = `min(T, max(3000, min(20000, 0.15·T)))`
- `GIRO_PARA_O_SPARROW`, `giroDoSparrow(graus) → 0|90|180|270`
- `motivoParaNaoEncolher(itens, resultado, config) → string|null`
- `contornoEmEscada(mascara) → [[xs, ys], ...]` (quadro do sparrow, anti-horário)
- `tiposDoEncaixe(itens) → [{ id, itens, rotacoes, R, C, forma }]`
- `instanciaDoSparrow(tipos, colsTecido) → objeto ExtSPInstance`
- `transformacaoDoSparrow(rot, col, lin, R, C)`, `colocacaoDoSparrow(transf, R, C) → { rot, col, lin }`
- `partidaDoSparrow(resultado, tipos, passo, colsTecido) → objeto ExtSPSolution | null`
- `resultadoDoSparrow(solucao, tipos, passo, colsTecido) → { posicoes, naoEncaixadas, consumo, areaReal } | null`
- `carregarEncolhedor(fonte?) → Promise<boolean>` (bytes na bancada, URL padrão do Vite no worker), `temEncolhedor()`
- `encolherEncaixe(itens, resultado, config, opcoes) → { resultado|null, motivo|null, relatos, rejeitados }`, com `opcoes = { tempoMs, semente, trabalhadores, fracaoCompressao, separacao, partir, aoMelhorar(novo) }`

- [ ] **Prova primeiro** — `bancada/conferir-encolher.js`, com quatro conferências e saída ≠ 0 em qualquer falha:
  1. ida e volta `transformacaoDoSparrow` → `colocacaoDoSparrow` = identidade, para 0/90/180/270;
  2. a forma: para cada peça do catálogo e cada giro, o centro de toda célula de `rotacoes[rot]` (e de nenhuma célula logo acima do topo / abaixo da base) cai dentro do contorno em escada de `rotacoes[0]` transformado pelo sparrow — prova o mapeamento dos giros;
  3. contorno simples: nenhuma aresta cruza outra, inclusive `arte-partida`;
  4. ponta a ponta (com WASM): em `giro-livre` e `producao-avulsa`, busca de 2 s em uma fatia, a partida vai e volta sem o sparrow (`resultadoDoSparrow(partidaDoSparrow(...))` reproduz o consumo, zero pares), e `encolherEncaixe` por 10 s devolve encaixe válido ≤ consumo da busca.
- [ ] Rodar: `node bancada/conferir-encolher.js` → falha (o módulo não existe).
- [ ] Escrever `src/motores/encaixeEncolher.js` com os exports acima (código no arquivo; o contorno ganha ponte de uma célula em coluna vazia e cada coluna é esticada até cruzar a vizinha — engordar nunca cria sobreposição).
- [ ] `bancada/motor.js`: `motores/encaixeEncolher.js` na lista; `carregarMotor` lê `src/motores/encolher/encolher_bg.wasm` e chama `motor.carregarEncolhedor(bytes)`; `motor.comEncolhedor` diz se subiu.
- [ ] Rodar a prova → passa. Rodar `npm run bancada:conferir` e `npm run bancada:sobreposicao` → continuam passando (a lista de módulos mudou).

### Tarefa 3: a bancada mede as duas fases, e a medição decide

**Arquivos:** `bancada/corrida.js` (e `medir.js` só se o ritmo precisar da conta da fase 1).

**Consome:** `tempoDaBusca`, `encolherEncaixe`, `temEncolhedor` (via `motor`).

- [ ] `buscarComoAProducao`: com `extra.encolher === true`, as fatias rodam `tempoDaBusca(tempoMs)` (e `msSemGanho` proporcional); depois `fatias` corridas do sparrow, uma por semente (`sementeDaFatia`), cada uma com `tempoMs − tempoDaBusca(tempoMs)`, partindo do campeão; fica o melhor válido. Sem o WASM, `throw` (fase pedida que não roda é defeito, não queda silenciosa). O resultado leva `encolhimento: { antes, depois, relatos, rejeitados }` e `receita = "encolher/" + receita`. O ritmo (tent./s) é contado sobre o tempo da fase 1.
- [ ] Medir `producao-avulsa`, `--tempo 60` e `--tempo 300`, `--sementes 1`, sem e com `encolher=true` (4 encaixadores). Depois `lote-grande` e `lote-enorme` com `--tempo 60`. Registrar a tabela.
- [ ] Medir `encolherTrabalhadores=1` contra `3` e `encolherPartir=false` contra `true` em `producao-avulsa --tempo 60`; fixar os padrões pelo número.
- [ ] Contraprova: os 6 padrão, `--tempo 5 --sementes 3`, sem e com `encolher=true`: nenhuma piora acima de ~0,25% na soma.

### Tarefa 4: a segunda rodada nos workers

**Arquivos:** `src/motores/encaixeWorker.js`, `src/motores/encaixeParalelo.js`.

**Consome:** tudo da Tarefa 2.

- [ ] Worker: carrega o encolhedor junto do motor (`const encolhedorPronto = carregarEncolhedor()`), responde `pronto` com `encolher: temEncolhedor()`. Mensagem nova `encolher` `{ partida, config, k, semente }`: remonta a partida com as peças do worker (endereço → peça; máscara de `rot`), chama `encolherEncaixe` e manda `encolhido` (`resultadoParaEnviar`) a cada encaixe melhor, e `encolheu` no fim `{ motivo, relatos, rejeitados }`.
- [ ] Paralelo: o corpo atual vira `buscarPorFatias(itens, config)`; o novo `buscarMelhorEncaixeEmParalelo` divide o tempo (`tempoDaBusca`), roda a busca, e — sem motivo contra, com `ENCOLHER_MINIMO_MS` sobrando e sem parar pedido — roda `encolherEmParalelo`: manda `preparar` + `encolher` a todos (sementes `sementeDaFatia`), guarda o último `encolhido` de cada um, relata `fase: "encolhendo"`; parar ou prazo (resto + `MARGEM_DURA_MS`) ENCERRA os workers e derruba o pool. Fica o melhor por `melhorQue`; `encolhimento` vai no resultado.
- [ ] Conferir no navegador (Tarefa 6).

### Tarefa 5: a tela

**Arquivos:** `src/producao/controlador.js`.

- [ ] `mostrarAndamento`: fase `encolhendo` → título "Encolhendo o rolo", detalhe com a metragem de partida e a atual.
- [ ] Onde o resultado é resumido: "o rolo encolheu X cm" ou o motivo de não ter encolhido.
- [ ] `tempoSugerido`: ajustar pela curva medida na Tarefa 3 (pedido grande pode chegar a 5 min, confirmado pelo usuário).

### Tarefa 6: verificação e servidor

- [ ] `npm run bancada:encolher`, `bancada:conferir`, `bancada:sobreposicao`, `bancada:corte`, `tipos`.
- [ ] `npx vite build` passa (a cola e o `.wasm` entram no pacote).
- [ ] Servidores de pé (Vite 5173 e Express 8000); um encaixe de verdade na tela mostra a fase "Encolhendo o rolo" e termina com a metragem menor; o botão de parar devolve o melhor encontrado.
- [ ] Relatório ao usuário: números, arquivos da obra (para o commit), o que ficou fora.
