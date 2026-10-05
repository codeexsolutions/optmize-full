# Importar o molde graduado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a tela de Moldes importa o PLT graduado da Audaces (com o `.adsx` ou o `.ads` do mesmo modelo, se vier) e cria o molde com todos os tamanhos.

**Architecture:** contas puras novas (`motores/pltGraduado.js`, `motores/audacesAdsx.js`) sobre o `tracosDoPLT` do leitor de PLT; uma janela nova na tela de Moldes faz a grade, a conferência e a gravação pela API de sempre.

**Tech Stack:** React 19 + TypeScript, JavaScript puro nos motores, `DecompressionStream` para o ZIP, bancadas em Node.

**Spec:** `docs/superpowers/specs/2026-10-05-importar-molde-graduado-design.md`

## Global Constraints

- Unidade interna: cm, y para baixo.
- Laço: caixa > 2,5 cm e área ≥ 1 cm²; pontas a até 1 cm fecham.
- Casamento com o gabarito: largura × altura a 0,1 cm (girado vale).
- Metas na pasta real: com gabarito ≥ 55/67 peças completas; sem, ≥ 43/67.
- Nenhum arquivo de cliente entra no repositório: a bancada real lê `D:\arte` e pula sem ela.
- Um commit por tarefa; textos em português, no estilo do repositório.

## Review Focus

- PLT em PE (comprimido) e em PD com espaço — os dois chegam aos mesmos laços.
- A peça que não muda de tamanho (um laço só) vale para todos os tamanhos da grade.
- Duas peças de forma parecida sobrepostas (frente e costas) não viram uma peça só.
- `.adsx` sem `data.xml`, ou que não é ZIP — erro dito, sem quebrar a importação.
- Peça do gabarito sem tamanho nenhum no PLT — fora, com aviso; laço sem dono — peça avulsa.

---

### Task 1: os laços do PLT e o agrupamento sem gabarito

**Files:** Create `src/motores/pltGraduado.js`; Modify `bancada/conferir-plt.mjs`

**Interfaces — Produces:**
- `lacosDoPLT(texto) → { lacos: Laco[], unidade, avisos } | { erro }`, `Laco = { pontos, largura, altura, area }`
- `agruparTamanhos(lacos) → { pecas: { lacos: Laco[] }[], tamanhos: number }` (laços do menor para o maior)

- [ ] Teste: um PLT montado no teste com duas peças de forma parecida sobrepostas (um retângulo com um entalhe à esquerda e outro com o entalhe à direita), 4 tamanhos cada (+1 cm por tamanho), uma peça avulsa e "letras" (traços de 0,5 cm). `lacosDoPLT` → 9 laços (sem as letras); `agruparTamanhos` → 2 peças de 4 e 1 avulsa, `tamanhos` = 4, cada peça com laços de área crescente.
- [ ] Teste: o mesmo desenho em PE (traços com `PE<=…`) — os mesmos laços.
- [ ] Rodar `npm run bancada:plt` → falha (módulo não existe).
- [ ] Implementar (a conta da sonda 3, com Chamfer na caixa normalizada, custo de forma + proporção + 0,5·|log área| − 0,02 se sobreposto, limiar 0,15, área 60–100%, N = comprimento mais comum).
- [ ] `npm run bancada:plt` → OK. Commit.

### Task 2: o gabarito do `.adsx`

**Files:** Create `src/motores/audacesAdsx.js`, `bancada/conferir-adsx.mjs`; Modify `package.json`

**Interfaces — Produces:** `lerAdsx(bytes: Uint8Array) → Promise<{ nome, tamanhos: string[], base, pecas: { nome, quantidade, porTamanho: Record<string,{largura,altura}> }[] } | { erro }>`

- [ ] Teste: um ZIP montado no teste (deflate de `data.xml` com 2 peças e P/M/G) → nome, grade, base "M", medidas; peça com `DESC_P` vazio vira "Peça 2"; ZIP sem `data.xml` → `erro`; bytes que não são ZIP → `erro`.
- [ ] `npm run bancada:adsx` → falha. Implementar (diretório central do ZIP, `DecompressionStream("deflate-raw")`, `latin1`, regex nas tags). → OK. Commit.

### Task 3: casar com o gabarito e montar o molde

**Files:** Modify `src/motores/pltGraduado.js`, `bancada/conferir-plt.mjs`

**Interfaces — Produces:**
- `casarComOGabarito(lacos, gabarito) → { pecas: { nome, quantidade, porTamanho: Record<string, Laco>, faltam: string[] }[], semDono: Laco[], avisos }`
- `moldeGraduado({ nome, tamanhos: {nome, base}[], pecas: { nome, quantidade, porTamanho } [] }) → { nome, situacao: "rascunho", pecas: PecaParaGravar[], tamanhos }` (uma linha por tamanho, `grupo` = índice da peça, contorno relativo à caixa, nós retos)

- [ ] Teste: os laços da Task 1 + um gabarito com as medidas → as 2 peças com os 4 tamanhos nos laços certos (as sobrepostas não se trocam), a avulsa casada em todos os tamanhos com o mesmo laço; uma peça do gabarito sem laço → aviso; `moldeGraduado` → 3 grupos, 9 linhas, grade com o base.
- [ ] Falha → implementar → OK. Commit.

### Task 4: a bancada da pasta real

**Files:** Create `bancada/conferir-plt-graduado.mjs`; Modify `package.json`

- [ ] Para cada modelo de `D:\arte\Moldes e modelagens\molde fitness` com `.plt`: `lacosDoPLT`; com `.adsx`: `lerAdsx` + `casarComOGabarito`, contando as peças completas e conferindo cada laço casado contra as medidas a 0,1 cm; sem gabarito: `agruparTamanhos` comparado com o `data.xml`. Asserções: com gabarito ≥ 55/67, sem ≥ 43/67. Sem a pasta: avisa e sai 0.
- [ ] Rodar → OK. Commit.

### Task 5: a tela

**Files:** Create `src/telas/moldes/ImportarGraduado.tsx`; Modify `src/telas/Moldes.tsx`

- [ ] `ImportarGraduado`: seletor (`.plt,.adsx,.ads`, múltiplo) → lê; com `.adsx` casa, senão agrupa e mostra a grade (nomes pré-preenchidos `P M G GG XG EXG` ou os do `.ads`, editáveis, base no meio); a conferência (miniatura SVG dos tamanhos sobrepostos nas cores da `PALETA`, nome, "n de N tamanhos", âmbar se incompleta); Criar → `moldesApi.criar(moldeGraduado(...))` → `/montagem?molde=ID`.
- [ ] `Moldes.tsx`: botão "Importar graduado" ao lado de "Adicionar molde".
- [ ] `npm run tipos` → OK. Commit.

### Task 6: a tela de ponta a ponta, a regressão e o build

**Files:** Modify `bancada/conferir-tela.cjs`

- [ ] Passo novo: gera o PLT graduado e o `.adsx` do teste, abre `/moldes`, importa os dois, confere a conferência (2 peças + 1 avulsa) e cria → a Montagem abre com os chips P/M/G/GG.
- [ ] `npm run front && npm run bancada:tela` → OK; regressão (`tamanhos`, `montagem`, `moldes-pecas`, `audaces`, `plt`, `adsx`, `plt-graduado`, `tsc`). Commits: a bancada, depois o build.
