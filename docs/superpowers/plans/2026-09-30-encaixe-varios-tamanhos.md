# Encaixe de vários tamanhos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na janela Arte e encaixe, trocar o tamanho único e as quantidades soltas por uma grade estampa × tamanho de peças prontas, com a quantidade de cada peça editável por célula, e mandar tudo ao Encaixe num clique só.

**Architecture:** As contas moram num módulo puro (`src/telas/moldes/envioPorTamanho.ts`): colunas da grade, peças de uma célula com a conta ou a quantidade mexida, a lista ordenada do que vai, o resumo, e o que muda depois de uma falha. A grade é um componente só de exibição (`GradeDeQuantidades.tsx`). A janela (`EnvioParaEncaixe.tsx`) guarda o estado e manda célula por célula pela `ligacao.mandarMoldeParaOEncaixe` que já existe, com `unidades: 1` e a quantidade final em cada peça. O Encaixe não muda.

**Tech Stack:** React 19 + TypeScript, Tailwind (classes das telas React), bancadas em Node com `node:assert`, esbuild e jsdom (o jeito de `bancada/conferir-editor-de-nos.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-30-encaixe-varios-tamanhos-design.md`

## Global Constraints

- Branch `feature/encaixe-varios-tamanhos`. Não mexer em `src/producao/ligacao.ts` nem em `src/producao/controlador.js`.
- Toda chamada ao Encaixe é `ligacao.mandarMoldeParaOEncaixe({ nome, tamanho, pecas, unidades: 1 })`, com a quantidade final em `peca.quantidade` e **só as peças > 0** (o controlador faz `max(1, quantidade × unidades)`: uma peça em 0 chegaria como 1).
- Quantidade é inteiro ≥ 0; vazio, texto, negativo ou fração viram inteiro ≥ 0 (`Math.max(0, Math.floor(Number(v) || 0))`).
- Linhas da grade, nesta ordem: estampas guardadas; "estampa nova" (só com arte no painel e ainda não salva); "sem estampa".
- Mudanças por peça valem só para este envio; nada novo é gravado no molde.
- Texto da tela e comentários em português, no tom do código em volta (comentário diz o porquê).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- O arquivo novo de bancada entra no `package.json` como `bancada:envio` e no passo "Moldes e tamanhos" de `.github/workflows/conferir.yml`.

## Review Focus

- **Peça num tamanho que a grade não declara** (grade antiga ou incompleta): a coluna aparece mesmo assim, no fim — senão a peça some do envio calada. Teste na Tarefa 1.
- **Número estranho digitado** (−3, 2,7, "abc", vazio): vira inteiro ≥ 0, nunca NaN nem negativo indo ao Encaixe. Teste na Tarefa 1.
- **Célula aberta (▸) que volta a 0**: o painel das peças some, sem quebrar; voltar o número mostra as mexidas guardadas. Teste na Tarefa 2.
- **Trocar de estampa com números na "estampa nova"** (Abrir outra, ou Começar outra): os números da nova não ficam pendurados para reaparecer numa estampa diferente. Teste na Tarefa 1 (`tirarLinha`) e ligação na Tarefa 3.
- **Falha logo na primeira célula** (o Encaixe ocupado com outro trabalho): nada é zerado, o aviso diz "Faltou:" com tudo, a janela fica aberta. Teste na Tarefa 3.

---

## Arquivos

- **Novo** `src/telas/moldes/envioPorTamanho.ts` — as contas puras (Tarefa 1).
- **Novo** `src/telas/moldes/GradeDeQuantidades.tsx` — a grade e o ▸ das peças, só exibição (Tarefa 2).
- **Muda** `src/telas/moldes/EnvioParaEncaixe.tsx` — o estado da grade, o envio por célula, o "Ver no tamanho" (Tarefa 3).
- **Novo** `bancada/conferir-envio-por-tamanho.mjs` — as contas e o harness jsdom (Tarefas 1–3).
- **Novo** `bancada/cenarios-do-envio.tsx` — os cenários com React (Tarefas 2–3).
- **Muda** `package.json`, `.github/workflows/conferir.yml` — `bancada:envio` (Tarefa 1).

---

### Task 1: As contas da grade (`envioPorTamanho.ts`) e a bancada

**Files:**
- Create: `src/telas/moldes/envioPorTamanho.ts`
- Create: `bancada/conferir-envio-por-tamanho.mjs`
- Modify: `package.json` (scripts, depois de `"bancada:editor"`)
- Modify: `.github/workflows/conferir.yml` (passo "Moldes e tamanhos")

**Interfaces:**
- Consumes: `pecasParaOEncaixe(pecas)` de `src/motores/montagem.js` (divide a peça `marcacoes.espelhar` com `quantidade ≥ 2` em duas: `ceil(q/2)` normal e `floor(q/2)` com `nome: "<nome ou papel> (espelhada)"`); tipos `Molde`, `PecaDoMolde` de `src/api/moldes.ts`.
- Produces (usado nas Tarefas 2 e 3):
  - `interface Coluna { nome: string; semDesenho: boolean }`
  - `type Quantidades = Record<string, Record<string, number>>` — linha → tamanho → prontas
  - `type Mexidas = Record<string, Record<number, number>>` — célula → índice da peça → quantidade
  - `interface PecaDaCelula { peca: PecaDoMolde; conta: number; quantidade: number; mexida: boolean }`
  - `interface CelulaParaMandar { linha: string; tamanho: string; prontas: number; pecas: PecaDoMolde[] }`
  - `const LINHA_NOVA = "nova"`, `const LINHA_SEM_ESTAMPA = "sem"`, `linhaDaEstampa(id: number): string` (→ `"e:<id>"`), `chaveDaCelula(linha: string, tamanho: string): string` (→ `"<linha>|<tamanho>"`), `celulaDaChave(chave: string): { linha: string; tamanho: string }`
  - `inteiro(v: unknown): number`
  - `colunasDaGrade(molde: Pick<Molde, "pecas" | "tamanhos">): Coluna[]`
  - `pecasDaCelula(pecas: PecaDoMolde[], tamanho: string, prontas: number, mexidas?: Record<number, number>): PecaDaCelula[]`
  - `celulasParaMandar(linhas: string[], colunas: Coluna[], pecas: PecaDoMolde[], quantidades: Quantidades, mexidas: Mexidas): CelulaParaMandar[]`
  - `resumo(celulas: CelulaParaMandar[]): { prontas: number; pecas: number }`
  - `mudarQuantidade(q: Quantidades, linha: string, tamanho: string, valor: unknown): Quantidades`
  - `mexer(m: Mexidas, celula: string, indice: number, valor: unknown | null): Mexidas`
  - `depoisDaFalha(q: Quantidades, mandadas: { linha: string; tamanho: string }[]): Quantidades`
  - `levarLinha(q: Quantidades, m: Mexidas, de: string, para: string): { quantidades: Quantidades; mexidas: Mexidas }`
  - `tirarLinha(q: Quantidades, m: Mexidas, linha: string): { quantidades: Quantidades; mexidas: Mexidas }`

- [ ] **Step 1: Escrever a bancada com as contas (falhando)**

Criar `bancada/conferir-envio-por-tamanho.mjs`:

```js
/*
 * BANCADA — o envio de vários tamanhos ao Encaixe
 *
 *     npm run bancada:envio
 *
 * Roda no CI. A janela Arte e encaixe manda uma grade estampa × tamanho de
 * peças prontas, célula por célula. As contas moram em
 * `src/telas/moldes/envioPorTamanho.ts`: o que vai, em que ordem, com que
 * quantidade — e o que fica para tentar de novo quando o envio cai no meio.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const e = await carregarModulo("src/telas/moldes/envioPorTamanho.ts");

const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
const peca = (tamanho, papel, quantidade, espelhar = false) => ({
  tamanho, papel, nome: "", quantidade, largura: 10, altura: 20, contorno: quadrado, furos: [], origem: null,
  marcacoes: espelhar ? { espelhar: true } : null,
});
// Um pijama: frente 1 e manga 2 (par espelhado) por peça pronta, em P e M. A grade declara G, sem desenho.
const pecas = [peca("P", "frente", 1), peca("P", "manga", 2, true), peca("M", "frente", 1), peca("M", "manga", 2, true)];
const grade = [
  { nome: "G", cor: "#000000", ordem: 2, base: false },
  { nome: "P", cor: "#000000", ordem: 0, base: false },
  { nome: "M", cor: "#000000", ordem: 1, base: true },
];

// 1. As colunas: pela ordem da grade; a sem desenho vem marcada; sem grade, os tamanhos das peças.
assert.deepEqual(e.colunasDaGrade({ pecas, tamanhos: grade }), [
  { nome: "P", semDesenho: false }, { nome: "M", semDesenho: false }, { nome: "G", semDesenho: true },
]);
assert.deepEqual(e.colunasDaGrade({ pecas, tamanhos: [] }).map((c) => c.nome), ["P", "M"]);
// Peça num tamanho que a grade não declara (grade antiga): a coluna aparece no fim, senão a peça sumia do envio.
assert.deepEqual(
  e.colunasDaGrade({ pecas: [...pecas, peca("GG", "frente", 1)], tamanhos: grade }).map((c) => c.nome),
  ["P", "M", "G", "GG"],
);

// 2. Número estranho vira inteiro ≥ 0.
assert.deepEqual([-3, 2.7, "abc", "", null, undefined, "4"].map(e.inteiro), [0, 2, 0, 0, 0, 0, 4]);
assert.deepEqual(e.mudarQuantidade({}, "sem", "P", "2,5"), { sem: { P: 0 } }, "vírgula não é número: fica 0");
assert.deepEqual(e.mudarQuantidade({ sem: { M: 3 } }, "sem", "P", 2.9), { sem: { M: 3, P: 2 } });

// 3. As peças de uma célula: prontas × cortes, a espelhada separada.
{
  const r = e.pecasDaCelula(pecas, "M", 10);
  assert.deepEqual(r.map((x) => [x.peca.nome || x.peca.papel, x.conta, x.quantidade, x.mexida]), [
    ["frente", 10, 10, false], ["manga", 10, 10, false], ["manga (espelhada)", 10, 10, false],
  ]);
}

// 4. A mexida fica quando as prontas mudam; a não mexida acompanha; "voltar à conta" tira a mexida.
{
  let m = e.mexer({}, e.chaveDaCelula("sem", "M"), 0, 0);
  m = e.mexer(m, e.chaveDaCelula("sem", "M"), 1, 7);
  const r = e.pecasDaCelula(pecas, "M", 3, m[e.chaveDaCelula("sem", "M")]);
  assert.deepEqual(r.map((x) => [x.quantidade, x.mexida]), [[0, true], [7, true], [3, false]]);
  const volta = e.mexer(m, e.chaveDaCelula("sem", "M"), 1, null);
  assert.deepEqual(e.pecasDaCelula(pecas, "M", 3, volta[e.chaveDaCelula("sem", "M")]).map((x) => x.quantidade), [0, 3, 3]);
}

// 5. O que vai, em ordem (linha por linha, tamanho por tamanho): célula 0 não vai, peça 0 não vai,
//    tamanho sem desenho não vai, e a célula com todas as peças em 0 também não.
{
  const colunas = e.colunasDaGrade({ pecas, tamanhos: grade });
  const linhas = [e.linhaDaEstampa(3), e.LINHA_SEM_ESTAMPA];
  let q = e.mudarQuantidade({}, "e:3", "P", 2);
  q = e.mudarQuantidade(q, "e:3", "M", 1);
  q = e.mudarQuantidade(q, "e:3", "G", 5);
  q = e.mudarQuantidade(q, "sem", "M", 4);
  q = e.mudarQuantidade(q, "sem", "P", 1);
  let m = e.mexer({}, "e:3|M", 0, 0);
  for (const i of [0, 1, 2]) m = e.mexer(m, "sem|P", i, 0);
  const c = e.celulasParaMandar(linhas, colunas, pecas, q, m);
  assert.deepEqual(c.map((x) => [x.linha, x.tamanho, x.prontas]), [["e:3", "P", 2], ["e:3", "M", 1], ["sem", "M", 4]]);
  assert.deepEqual(c[0].pecas.map((p) => p.quantidade), [2, 2, 2]);
  assert.deepEqual(c[1].pecas.map((p) => p.nome || p.papel), ["manga", "manga (espelhada)"], "a frente zerada não vai");
  assert.deepEqual(e.resumo(c), { prontas: 7, pecas: 6 + 2 + 12 });
  // Linha que não está na lista (a "nova" que sumiu) não vai, mesmo com número.
  assert.equal(e.celulasParaMandar([e.LINHA_SEM_ESTAMPA], colunas, pecas, e.mudarQuantidade({}, "nova", "P", 9), {}).length, 0);
}

// 6. Depois da falha: as mandadas zeram, as outras ficam.
assert.deepEqual(
  e.depoisDaFalha({ "e:3": { P: 2, M: 1 }, sem: { M: 4 } }, [{ linha: "e:3", tamanho: "P" }]),
  { "e:3": { P: 0, M: 1 }, sem: { M: 4 } },
);

// 7. Salvar a estampa nova leva os números e as mexidas para a linha dela; trocar de estampa tira a nova.
{
  const q = { nova: { P: 2 }, sem: { M: 1 } };
  const m = { "nova|P": { 0: 5 }, "sem|M": { 1: 0 } };
  assert.deepEqual(e.levarLinha(q, m, "nova", "e:9"), {
    quantidades: { sem: { M: 1 }, "e:9": { P: 2 } },
    mexidas: { "sem|M": { 1: 0 }, "e:9|P": { 0: 5 } },
  });
  assert.deepEqual(e.tirarLinha(q, m, "nova"), { quantidades: { sem: { M: 1 } }, mexidas: { "sem|M": { 1: 0 } } });
  assert.deepEqual(e.celulaDaChave("e:9|P"), { linha: "e:9", tamanho: "P" });
}

console.log("OK — as contas do envio de vários tamanhos conferem.");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node bancada/conferir-envio-por-tamanho.mjs`
Expected: FAIL — o esbuild não acha `src/telas/moldes/envioPorTamanho.ts` ("Could not resolve").

- [ ] **Step 3: Escrever o módulo**

Criar `src/telas/moldes/envioPorTamanho.ts`:

```ts
/**
 * O ENVIO DE VÁRIOS TAMANHOS — as contas da grade estampa × tamanho
 *
 * A janela Arte e encaixe pede peças prontas numa grade: uma linha por
 * estampa, uma coluna por tamanho. Cada célula com número vira UMA chamada ao
 * Encaixe (que soma o que chega), com a quantidade final já em cada peça.
 *
 * A quantidade de uma peça é a conta (cortes por peça pronta × prontas) ou a
 * que a pessoa escreveu no ▸ da célula — a "mexida". A mexida é por índice na
 * lista de `pecasParaOEncaixe` daquele tamanho, e fica de pé quando as prontas
 * mudam: é o "repor só as mangas". Nada disto vai para o molde.
 */
import type { Molde, PecaDoMolde } from "../../api/moldes";
import { pecasParaOEncaixe } from "../../motores/montagem";

export interface Coluna { nome: string; semDesenho: boolean }
/** linha → tamanho → peças prontas. */
export type Quantidades = Record<string, Record<string, number>>;
/** célula → índice da peça → quantidade escrita à mão. */
export type Mexidas = Record<string, Record<number, number>>;
export interface PecaDaCelula { peca: PecaDoMolde; conta: number; quantidade: number; mexida: boolean }
export interface CelulaParaMandar { linha: string; tamanho: string; prontas: number; pecas: PecaDoMolde[] }

export const LINHA_NOVA = "nova";
export const LINHA_SEM_ESTAMPA = "sem";
export const linhaDaEstampa = (id: number) => `e:${id}`;
export const chaveDaCelula = (linha: string, tamanho: string) => `${linha}|${tamanho}`;
export function celulaDaChave(chave: string): { linha: string; tamanho: string } {
  const i = chave.indexOf("|");
  return { linha: chave.slice(0, i), tamanho: chave.slice(i + 1) };
}

/** Inteiro ≥ 0. Vazio, texto, negativo ou fração não chegam ao Encaixe. */
export const inteiro = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

/** Os tamanhos da grade, na ordem dela; sem grade guardada, os das peças. */
export function colunasDaGrade(molde: Pick<Molde, "pecas" | "tamanhos">): Coluna[] {
  const comDesenho = [...new Set(molde.pecas.map((p) => p.tamanho))];
  const nomes = [...molde.tamanhos].sort((a, b) => a.ordem - b.ordem).map((t) => t.nome);
  // Peça num tamanho que a grade não declara (grade antiga): entra no fim, senão sumiria do envio calada.
  for (const t of comDesenho) if (!nomes.includes(t)) nomes.push(t);
  return nomes.map((nome) => ({ nome, semDesenho: !comDesenho.includes(nome) }));
}

export function pecasDaCelula(
  pecas: PecaDoMolde[], tamanho: string, prontas: number, mexidas: Record<number, number> = {},
): PecaDaCelula[] {
  const doTamanho = pecasParaOEncaixe(pecas.filter((p) => p.tamanho === tamanho)) as PecaDoMolde[];
  return doTamanho.map((peca, i) => {
    const conta = peca.quantidade * inteiro(prontas);
    const mexida = Object.prototype.hasOwnProperty.call(mexidas, i);
    return { peca, conta, quantidade: mexida ? inteiro(mexidas[i]) : conta, mexida };
  });
}

/** O que vai, na ordem: linha por linha, tamanho por tamanho; só células e peças > 0. */
export function celulasParaMandar(
  linhas: string[], colunas: Coluna[], pecas: PecaDoMolde[], quantidades: Quantidades, mexidas: Mexidas,
): CelulaParaMandar[] {
  const lista: CelulaParaMandar[] = [];
  for (const linha of linhas) {
    for (const coluna of colunas) {
      if (coluna.semDesenho) continue;
      const prontas = inteiro(quantidades[linha]?.[coluna.nome]);
      if (prontas === 0) continue;
      const vao = pecasDaCelula(pecas, coluna.nome, prontas, mexidas[chaveDaCelula(linha, coluna.nome)])
        .filter((x) => x.quantidade > 0)
        .map((x) => ({ ...x.peca, quantidade: x.quantidade }));
      if (vao.length > 0) lista.push({ linha, tamanho: coluna.nome, prontas, pecas: vao });
    }
  }
  return lista;
}

export function resumo(celulas: CelulaParaMandar[]): { prontas: number; pecas: number } {
  return {
    prontas: celulas.reduce((s, c) => s + c.prontas, 0),
    pecas: celulas.reduce((s, c) => s + c.pecas.reduce((t, p) => t + p.quantidade, 0), 0),
  };
}

export function mudarQuantidade(q: Quantidades, linha: string, tamanho: string, valor: unknown): Quantidades {
  return { ...q, [linha]: { ...q[linha], [tamanho]: inteiro(valor) } };
}

/** `valor` null: volta à conta. */
export function mexer(m: Mexidas, celula: string, indice: number, valor: unknown | null): Mexidas {
  const daCelula = { ...m[celula] };
  if (valor === null) delete daCelula[indice];
  else daCelula[indice] = inteiro(valor);
  return { ...m, [celula]: daCelula };
}

/** As células que já chegaram ao Encaixe zeram: o próximo clique manda só o que faltou. */
export function depoisDaFalha(q: Quantidades, mandadas: { linha: string; tamanho: string }[]): Quantidades {
  return mandadas.reduce((acc, c) => mudarQuantidade(acc, c.linha, c.tamanho, 0), q);
}

const semLinha = (q: Quantidades, m: Mexidas, linha: string) => {
  const { [linha]: _fora, ...quantidades } = q;
  const mexidas: Mexidas = {};
  for (const [chave, v] of Object.entries(m)) if (celulaDaChave(chave).linha !== linha) mexidas[chave] = v;
  return { quantidades, mexidas };
};

/** A estampa nova foi salva: os números e as mexidas dela passam para a linha da estampa guardada. */
export function levarLinha(q: Quantidades, m: Mexidas, de: string, para: string) {
  const resto = semLinha(q, m, de);
  if (q[de]) resto.quantidades[para] = q[de];
  for (const [chave, v] of Object.entries(m)) {
    const c = celulaDaChave(chave);
    if (c.linha === de) resto.mexidas[chaveDaCelula(para, c.tamanho)] = v;
  }
  return resto;
}

/** A linha sumiu (outra estampa aberta no painel): os números dela não ficam pendurados. */
export function tirarLinha(q: Quantidades, m: Mexidas, linha: string) {
  return semLinha(q, m, linha);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node bancada/conferir-envio-por-tamanho.mjs`
Expected: `OK — as contas do envio de vários tamanhos conferem.`

Se o `assert.deepEqual` do item 7 falhar só pela ordem das chaves: `deepEqual` não liga para ordem de chave de objeto; olhar o valor. Se `pecasParaOEncaixe` não resolver, conferir que o import é `../../motores/montagem` (sem extensão, como os outros).

- [ ] **Step 5: Ligar no `package.json`, no CI, e rodar os tipos**

Em `package.json`, depois da linha `"bancada:editor": "node bancada/conferir-editor-de-nos.mjs",`:

```json
    "bancada:envio": "node bancada/conferir-envio-por-tamanho.mjs",
```

Em `.github/workflows/conferir.yml`, no passo "Moldes e tamanhos", acrescentar ao fim do `run:` ` && npm run bancada:envio`, ficando:

```yaml
        run: npm run bancada:tamanhos && npm run bancada:moldes-pecas && npm run bancada:montagem && npm run bancada:graduacao && npm run bancada:nos && npm run bancada:editor && npm run bancada:envio
```

Run: `npm run bancada:envio && npm run tipos`
Expected: o OK da bancada, e `tsc --noEmit` sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/telas/moldes/envioPorTamanho.ts bancada/conferir-envio-por-tamanho.mjs package.json .github/workflows/conferir.yml
git commit -F - <<'EOF'
As contas do envio de vários tamanhos: a grade estampa × tamanho e a quantidade de cada peça

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: A grade na tela (`GradeDeQuantidades.tsx`) e o harness com React

**Files:**
- Create: `src/telas/moldes/GradeDeQuantidades.tsx`
- Create: `bancada/cenarios-do-envio.tsx`
- Modify: `bancada/conferir-envio-por-tamanho.mjs` (acrescentar o harness jsdom no fim)

**Interfaces:**
- Consumes (Tarefa 1): `Coluna`, `Quantidades`, `Mexidas`, `chaveDaCelula`, `celulaDaChave`, `pecasDaCelula`, `inteiro`, `mudarQuantidade`, `mexer`.
- Produces (Tarefa 3):
  - `interface LinhaDaGrade { chave: string; nome: string }`
  - `function GradeDeQuantidades(props: { linhas: LinhaDaGrade[]; colunas: Coluna[]; pecas: PecaDoMolde[]; quantidades: Quantidades; mexidas: Mexidas; aberta: string | null; aoMudarQuantidade: (linha: string, tamanho: string, valor: number) => void; aoMexer: (celula: string, indice: number, valor: number | null) => void; aoAbrir: (celula: string | null) => void }): JSX.Element`
  - Rótulos acessíveis que os testes usam: a célula é `input[aria-label="<nome da linha> <tamanho>"]`; o ▸ é `button[aria-label="Peças de <nome da linha> <tamanho>"]`; a quantidade de uma peça é `input[aria-label="Quantidade de <nome ou papel>"]`; o voltar é o botão com texto que começa em `voltar à conta`.
  - `bancada/cenarios-do-envio.tsx` exporta `rodar(): Promise<void>`; a Tarefa 3 acrescenta cenários nele.

- [ ] **Step 1: Escrever os cenários da grade (falhando)**

Criar `bancada/cenarios-do-envio.tsx`:

```tsx
/*
 * Os cenários com React da bancada do envio (`conferir-envio-por-tamanho.mjs`).
 *
 * A grade roda de verdade numa tela de mentira que guarda o estado com as
 * contas de `envioPorTamanho.ts`, do jeito que a janela Arte e encaixe guarda.
 */
import assert from "node:assert/strict";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { GradeDeQuantidades } from "../src/telas/moldes/GradeDeQuantidades";
import {
  colunasDaGrade, mexer, mudarQuantidade, type Mexidas, type Quantidades,
} from "../src/telas/moldes/envioPorTamanho";

type Qualquer = any;
const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
export const peca = (tamanho: string, papel: string, quantidade: number, espelhar = false): Qualquer => ({
  tamanho, papel, nome: "", quantidade, largura: 10, altura: 20, contorno: quadrado, furos: [], origem: null,
  marcacoes: espelhar ? { espelhar: true } : null,
});
export const pecas = [peca("P", "frente", 1), peca("P", "manga", 2, true), peca("M", "frente", 1), peca("M", "manga", 2, true)];
export const grade = [
  { nome: "P", cor: "#000000", ordem: 0, base: false },
  { nome: "M", cor: "#000000", ordem: 1, base: true },
  { nome: "G", cor: "#000000", ordem: 2, base: false },
];

export async function montar(elemento: JSX.Element) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  await act(async () => { raiz.render(elemento); });
  return async () => { await act(async () => { raiz.unmount(); }); caixa.remove(); };
}
export const fazer = async (f: () => void | Promise<void>) => { await act(async () => { await f(); }); };
export const campo = (rotulo: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${rotulo}"]`);
export const botao = (rotulo: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${rotulo}"]`);
export const botaoPeloTexto = (texto: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim().startsWith(texto)) ?? null;
/** Escreve num campo como a pessoa escreveria: o React só vê o valor pelo evento `input`. */
export async function digitar(el: HTMLInputElement | null, valor: string) {
  assert.ok(el, "o campo existe");
  await fazer(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(el, valor);
    el!.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
export const clicar = async (el: HTMLElement | null) => { assert.ok(el, "o botão existe"); await fazer(() => el!.click()); };

function TelaDaGrade() {
  const [quantidades, setQuantidades] = useState<Quantidades>({});
  const [mexidas, setMexidas] = useState<Mexidas>({});
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <GradeDeQuantidades
      linhas={[{ chave: "e:3", nome: "caveira" }, { chave: "sem", nome: "sem estampa" }]}
      colunas={colunasDaGrade({ pecas, tamanhos: grade })}
      pecas={pecas}
      quantidades={quantidades}
      mexidas={mexidas}
      aberta={aberta}
      aoMudarQuantidade={(l, t, v) => setQuantidades((q) => mudarQuantidade(q, l, t, v))}
      aoMexer={(c, i, v) => setMexidas((m) => mexer(m, c, i, v))}
      aoAbrir={setAberta}
    />
  );
}

export const cenariosDaTela: [string, () => Promise<void>][] = [];

export async function rodar() {
  const falhas: string[] = [];
  const cenario = async (nome: string, f: () => Promise<void>) => {
    try { await f(); } catch (e) { falhas.push(`${nome}: ${(e as Error).message}`); }
  };

  // G. 1 — a célula: o ▸ só com número; a coluna sem desenho não aceita número.
  await cenario("grade 1", async () => {
    const desmontar = await montar(<TelaDaGrade />);
    assert.equal(botao("Peças de caveira M"), null, "sem número, sem ▸");
    assert.equal(campo("caveira G")!.disabled, true, "G não tem desenho");
    await digitar(campo("caveira M"), "3");
    assert.ok(botao("Peças de caveira M"), "com número, o ▸ aparece");
    await desmontar();
  });

  // G. 2 — o ▸ abre as peças com a conta; a mexida fica quando as prontas mudam; voltar à conta.
  await cenario("grade 2", async () => {
    const desmontar = await montar(<TelaDaGrade />);
    await digitar(campo("caveira M"), "3");
    await clicar(botao("Peças de caveira M"));
    assert.equal(campo("Quantidade de frente")!.value, "3");
    assert.equal(campo("Quantidade de manga (espelhada)")!.value, "3");
    await digitar(campo("Quantidade de frente"), "0");
    await digitar(campo("caveira M"), "5");
    assert.equal(campo("Quantidade de frente")!.value, "0", "a mexida fica");
    assert.equal(campo("Quantidade de manga")!.value, "5", "a não mexida acompanha");
    await clicar(botaoPeloTexto("voltar à conta"));
    assert.equal(campo("Quantidade de frente")!.value, "5", "voltou à conta");
    await desmontar();
  });

  // G. 3 — célula aberta que volta a 0: o painel some; o número de volta mostra a mexida guardada.
  await cenario("grade 3", async () => {
    const desmontar = await montar(<TelaDaGrade />);
    await digitar(campo("sem estampa P"), "2");
    await clicar(botao("Peças de sem estampa P"));
    await digitar(campo("Quantidade de frente"), "9");
    await digitar(campo("sem estampa P"), "");
    assert.equal(campo("Quantidade de frente"), null, "com 0, as peças somem");
    // A célula continua a aberta: com o número de volta, as peças voltam sozinhas (clicar no ▸ fecharia).
    await digitar(campo("sem estampa P"), "2");
    assert.equal(campo("Quantidade de frente")!.value, "9", "a mexida estava guardada");
    await desmontar();
  });

  for (const [nome, f] of cenariosDaTela) await cenario(nome, f);
  assert.deepEqual(falhas, [], `\n${falhas.join("\n")}`);
}
```

Acrescentar ao fim de `bancada/conferir-envio-por-tamanho.mjs`, **antes** do `console.log` final (troque o `console.log` final por este bloco inteiro):

```js
// ---------------------------------------------------------------- com React
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");
const require = createRequire(path.join(raiz, "package.json"));
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLCanvasElement", "Node", "Element", "Event", "KeyboardEvent", "MutationObserver", "Image"]) {
  if (!(k in globalThis) || k === "window" || k === "document") globalThis[k] = k === "window" ? dom.window : dom.window[k];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// A prévia da arte desenha em canvas, e o jsdom não tem 2D: um contexto de mentira que aceita tudo.
const ctxFalso = new Proxy({}, {
  get: (alvo, k) => (k in alvo ? alvo[k] : () => ctxFalso),
  set: (alvo, k, v) => { alvo[k] = v; return true; },
});
dom.window.HTMLCanvasElement.prototype.getContext = () => ctxFalso;
dom.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
// Sem o provedor de alertas montado, o aviso cai no `window.alert`: os cenários leem daqui.
globalThis.alertas = [];
dom.window.alert = (texto) => { globalThis.alertas.push(String(texto)); };

const saida = path.join(os.tmpdir(), `optimize-cenarios-do-envio-${process.pid}.mjs`);
esbuild.buildSync({
  entryPoints: [path.join(aqui, "cenarios-do-envio.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: saida,
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: {
    "process.env.NODE_ENV": '"development"',
    "import.meta.env.BASE_URL": '"/"',
    __VERSAO__: JSON.stringify(require(path.join(raiz, "package.json")).version),
  },
  resolveExtensions: [".mjs", ".js", ".ts", ".tsx", ".jsx", ".json"],
  logLevel: "error",
});
try {
  const { rodar } = await import(pathToFileURL(saida).href);
  await rodar();
} finally {
  dom.window.close();
  fs.rmSync(saida, { force: true });
}
console.log("OK — as contas do envio de vários tamanhos conferem, e a grade e a janela também.");
// O agendador do React deixa portas de mensagem abertas no jsdom: sem sair à força, o processo não acaba
// (como em `conferir-editor-de-nos.mjs`). Uma falha acima já saiu com erro antes daqui.
process.exit(0);
```

Os `import` no meio do arquivo são içados pelo ESM — funcionam, mas para ficar legível mova-os para o topo do arquivo, junto dos outros.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:envio`
Expected: FAIL — o esbuild não resolve `../src/telas/moldes/GradeDeQuantidades`.

- [ ] **Step 3: Escrever o componente**

Criar `src/telas/moldes/GradeDeQuantidades.tsx`:

```tsx
/**
 * A GRADE DE QUANTIDADES — quantas peças prontas de cada estampa em cada tamanho
 *
 * Só exibição: o estado mora na janela Arte e encaixe, e as contas em
 * `envioPorTamanho.ts`. Uma célula com número ganha o ▸, que abre as peças
 * daquele tamanho e daquela estampa com a quantidade de cada uma — é ali que se
 * zera o que não vai ("repor só as mangas").
 */
import type { PecaDoMolde } from "../../api/moldes";
import {
  celulaDaChave, chaveDaCelula, inteiro, pecasDaCelula, type Coluna, type Mexidas, type Quantidades,
} from "./envioPorTamanho";

export interface LinhaDaGrade { chave: string; nome: string }

interface Props {
  linhas: LinhaDaGrade[];
  colunas: Coluna[];
  pecas: PecaDoMolde[];
  quantidades: Quantidades;
  mexidas: Mexidas;
  /** A célula com as peças abertas (o ▸), ou `null`. */
  aberta: string | null;
  aoMudarQuantidade: (linha: string, tamanho: string, valor: number) => void;
  aoMexer: (celula: string, indice: number, valor: number | null) => void;
  aoAbrir: (celula: string | null) => void;
}

export function GradeDeQuantidades({
  linhas, colunas, pecas, quantidades, mexidas, aberta, aoMudarQuantidade, aoMexer, aoAbrir,
}: Props) {
  const daAberta = aberta ? celulaDaChave(aberta) : null;
  const prontasDaAberta = daAberta ? inteiro(quantidades[daAberta.linha]?.[daAberta.tamanho]) : 0;
  const nomeDaAberta = daAberta ? linhas.find((l) => l.chave === daAberta.linha)?.nome : undefined;

  return (
    <section className="mt-3 flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="border-collapse text-[0.85rem]">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-semibold">Peças prontas</th>
              {colunas.map((c) => (
                <th key={c.nome} className="px-2 py-1 text-center font-semibold">
                  {c.nome}
                  {c.semDesenho && <span className="block text-[0.72rem] font-normal text-tinta-fraca">sem desenho</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-t border-linha">
                <th scope="row" className="px-2 py-1 text-left font-medium capitalize">{l.nome}</th>
                {colunas.map((c) => {
                  const celula = chaveDaCelula(l.chave, c.nome);
                  const valor = inteiro(quantidades[l.chave]?.[c.nome]);
                  return (
                    <td key={c.nome} className="px-2 py-1">
                      <span className="flex items-center gap-1">
                        <input
                          type="number" min="0" step="1" className="w-16!" placeholder="0"
                          aria-label={`${l.nome} ${c.nome}`} disabled={c.semDesenho}
                          value={valor > 0 ? valor : ""}
                          onChange={(e) => aoMudarQuantidade(l.chave, c.nome, inteiro(e.target.value))}
                        />
                        {valor > 0 && (
                          <button
                            type="button" className="btn secondary btn-sm" title="Ver as peças"
                            aria-label={`Peças de ${l.nome} ${c.nome}`} aria-expanded={aberta === celula}
                            onClick={() => aoAbrir(aberta === celula ? null : celula)}
                          >
                            {aberta === celula ? "▾" : "▸"}
                          </button>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Célula que voltou a 0: as peças somem, e as mexidas continuam guardadas para quando o número voltar. */}
      {aberta && daAberta && prontasDaAberta > 0 && (
        <div className="flex flex-col gap-1 rounded-[8px] border border-linha p-2 text-[0.85rem]">
          <strong className="capitalize">{nomeDaAberta} · {daAberta.tamanho}</strong>
          {pecasDaCelula(pecas, daAberta.tamanho, prontasDaAberta, mexidas[aberta]).map((x, i) => {
            const nome = x.peca.nome || x.peca.papel;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className={`w-40 capitalize ${x.mexida ? "font-semibold" : ""}`}>{nome}</span>
                <input
                  type="number" min="0" step="1" className="w-20!" aria-label={`Quantidade de ${nome}`}
                  value={x.quantidade} onChange={(e) => aoMexer(aberta, i, inteiro(e.target.value))}
                />
                <span className="text-tinta-fraca">{x.peca.quantidade} por peça pronta</span>
                {x.mexida && (
                  <button type="button" className="btn secondary btn-sm" onClick={() => aoMexer(aberta, i, null)}>
                    voltar à conta ({x.conta})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:envio`
Expected: `OK — as contas do envio de vários tamanhos conferem, e a grade e a janela também.` e saída 0 em poucos segundos.

Se travar sem terminar: é o `process.exit(0)` faltando no fim. Se um cenário falhar com "o campo existe": conferir o `aria-label` exato (nome da linha + espaço + tamanho).

- [ ] **Step 5: Tipos e commit**

Run: `npm run tipos`
Expected: sem erro.

```bash
git add src/telas/moldes/GradeDeQuantidades.tsx bancada/cenarios-do-envio.tsx bancada/conferir-envio-por-tamanho.mjs
git commit -F - <<'EOF'
A grade de quantidades: peças prontas por estampa e tamanho, e o ▸ com a quantidade de cada peça

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: A janela Arte e encaixe manda a grade inteira

**Files:**
- Modify: `src/telas/moldes/EnvioParaEncaixe.tsx`
- Modify: `bancada/cenarios-do-envio.tsx` (cenários da janela em `cenariosDaTela`)

**Interfaces:**
- Consumes (Tarefas 1 e 2): tudo de `envioPorTamanho.ts`; `GradeDeQuantidades`, `LinhaDaGrade`.
- Consumes (existente): `ligacao.mandarMoldeParaOEncaixe(molde: MoldeParaOEncaixe): Promise<void>` e `ligacao.irPara("encaixe")` de `src/producao/ligacao.ts`; `ProvedorDaLigacao` (o `Provider` do contexto, mesmo arquivo); `ProvedorDeDialogo` de `src/casca/Dialogo.tsx`.
- Produces: a janela, com as mesmas props de hoje (`molde`, `aoFechar`, `aoRecarregar`) — `Moldes.tsx` e `BarraDaMontagem.tsx` não mudam.

- [ ] **Step 1: Escrever os cenários da janela (falhando)**

Em `bancada/cenarios-do-envio.tsx`, acrescentar os imports no topo:

```tsx
import { EnvioParaEncaixe } from "../src/telas/moldes/EnvioParaEncaixe";
import { ProvedorDeDialogo } from "../src/casca/Dialogo";
import { ProvedorDaLigacao } from "../src/producao/ligacao";
```

E, antes de `export async function rodar()`, os cenários:

```tsx
/** Uma ligação de mentira: anota o que o Encaixe recebeu, e pode falhar na N-ésima chamada. */
function ligacaoFalsa(falharNa: number | null = null) {
  const recebidos: Qualquer[] = [];
  const idas: string[] = [];
  let chamadas = 0;
  const ligacao: Qualquer = {
    adicionarArquivos: async () => {},
    mandarProjetoParaOEncaixe: async () => {},
    async mandarMoldeParaOEncaixe(m: Qualquer) {
      chamadas++;
      if (chamadas === falharNa) throw new Error("Aguarde o trabalho atual terminar antes de enviar mais peças.");
      recebidos.push(m);
    },
    irPara: (destino: string) => { idas.push(destino); },
  };
  return { ligacao, recebidos, idas, parar: () => { falharNa = null; } };
}

const moldeDoPijama: Qualquer = {
  id: 7, nome: "pijama", observacoes: null, situacao: "pronto", pecas, tamanhos: grade,
  artes: [{ id: 3, nome: "caveira", pecas: [] }],
};

async function abrirJanela(ligacao: Qualquer) {
  let fechou = false;
  const desmontar = await montar(
    <ProvedorDeDialogo>
      <ProvedorDaLigacao value={ligacao}>
        <EnvioParaEncaixe molde={moldeDoPijama} aoFechar={() => { fechou = true; }} aoRecarregar={() => {}} />
      </ProvedorDaLigacao>
    </ProvedorDeDialogo>,
  );
  return { desmontar, fechou: () => fechou };
}
const mandar = () => clicar(botaoPeloTexto("Mandar para o encaixe"));
const resumoDoEnvio = (m: Qualquer) => [m.tamanho, m.unidades, m.pecas.map((p: Qualquer) => [p.nome || p.papel, p.quantidade, p.estampa ?? ""])];

// J. 1 — três células viram três chamadas, na ordem da grade, com unidades 1 e a quantidade em cada peça.
cenariosDaTela.push(["janela 1", async () => {
  const f = ligacaoFalsa();
  const j = await abrirJanela(f.ligacao);
  await digitar(campo("caveira P"), "2");
  await digitar(campo("caveira M"), "1");
  await digitar(campo("sem estampa M"), "3");
  await mandar();
  assert.deepEqual(f.recebidos.map(resumoDoEnvio), [
    ["P", 1, [["frente", 2, "caveira"], ["manga", 2, "caveira"], ["manga (espelhada)", 2, "caveira"]]],
    ["M", 1, [["frente", 1, "caveira"], ["manga", 1, "caveira"], ["manga (espelhada)", 1, "caveira"]]],
    ["M", 1, [["frente", 3, ""], ["manga", 3, ""], ["manga (espelhada)", 3, ""]]],
  ]);
  assert.equal(j.fechou(), true, "deu tudo certo: fecha");
  assert.deepEqual(f.idas, ["encaixe"]);
  await j.desmontar();
}]);

// J. 2 — a peça zerada no ▸ não vai; as prontas mudando refazem só a não mexida.
cenariosDaTela.push(["janela 2", async () => {
  const f = ligacaoFalsa();
  const j = await abrirJanela(f.ligacao);
  await digitar(campo("caveira M"), "1");
  await clicar(botao("Peças de caveira M"));
  await digitar(campo("Quantidade de frente"), "0");
  await digitar(campo("caveira M"), "2");
  await mandar();
  assert.deepEqual(f.recebidos.map(resumoDoEnvio), [
    ["M", 1, [["manga", 2, "caveira"], ["manga (espelhada)", 2, "caveira"]]],
  ]);
  await j.desmontar();
}]);

// J. 3 — falha no meio: a janela fica, o aviso diz o que foi e o que faltou, as mandadas zeram,
//        e o próximo clique manda só o que faltou.
cenariosDaTela.push(["janela 3", async () => {
  const f = ligacaoFalsa(2);
  const j = await abrirJanela(f.ligacao);
  (globalThis as Qualquer).alertas.length = 0;
  await digitar(campo("caveira P"), "2");
  await digitar(campo("caveira M"), "1");
  await digitar(campo("sem estampa M"), "3");
  await mandar();
  assert.equal(j.fechou(), false, "falhou: não fecha");
  const aviso = (globalThis as Qualquer).alertas.join("\n");
  assert.match(aviso, /Foram: caveira · P\./);
  assert.match(aviso, /Faltou: caveira · M, sem estampa · M — Aguarde o trabalho atual/);
  assert.equal(campo("caveira P")!.value, "", "a mandada zerou");
  assert.equal(campo("caveira M")!.value, "1", "a que faltou ficou");
  f.parar();
  await mandar();
  assert.deepEqual(f.recebidos.map((m: Qualquer) => m.tamanho), ["P", "M", "M"], "a segunda vez manda só o que faltou");
  assert.equal(j.fechou(), true);
  await j.desmontar();
}]);

// J. 4 — falha logo na primeira: nada zera, e o aviso diz "Faltou:" com tudo.
cenariosDaTela.push(["janela 4", async () => {
  const f = ligacaoFalsa(1);
  const j = await abrirJanela(f.ligacao);
  (globalThis as Qualquer).alertas.length = 0;
  await digitar(campo("caveira P"), "2");
  await mandar();
  assert.equal(j.fechou(), false);
  assert.doesNotMatch((globalThis as Qualquer).alertas.join("\n"), /Foram:/);
  assert.match((globalThis as Qualquer).alertas.join("\n"), /Faltou: caveira · P/);
  assert.equal(campo("caveira P")!.value, "2", "nada zerou");
  await j.desmontar();
}]);

// J. 5 — nada pedido: avisa e não manda; o "Ver no tamanho" só oferece os tamanhos com desenho.
cenariosDaTela.push(["janela 5", async () => {
  const f = ligacaoFalsa();
  const j = await abrirJanela(f.ligacao);
  (globalThis as Qualquer).alertas.length = 0;
  await mandar();
  assert.equal(f.recebidos.length, 0);
  assert.match((globalThis as Qualquer).alertas.join("\n"), /pelo menos um tamanho/);
  const ver = document.querySelector<HTMLSelectElement>('select[aria-label="Ver no tamanho"]');
  assert.ok(ver, "o seletor da prévia existe");
  assert.deepEqual([...ver!.options].map((o) => o.value), ["P", "M"]);
  assert.equal(ver!.value, "M", "começa no base da grade");
  await j.desmontar();
}]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:envio`
Expected: FAIL nos cenários "janela 1" a "janela 5" (a janela de hoje não tem `input[aria-label="caveira P"]`: "o campo existe").

- [ ] **Step 3: Trocar o estado da janela**

Em `src/telas/moldes/EnvioParaEncaixe.tsx`:

(a) Imports — acrescentar:

```tsx
import { GradeDeQuantidades, type LinhaDaGrade } from "./GradeDeQuantidades";
import {
  LINHA_NOVA, LINHA_SEM_ESTAMPA, celulasParaMandar, colunasDaGrade, depoisDaFalha, levarLinha,
  linhaDaEstampa, mexer, mudarQuantidade, resumo, tirarLinha,
  type CelulaParaMandar, type Mexidas, type Quantidades,
} from "./envioPorTamanho";
```

(b) Tirar estes estados:

```tsx
  const tamanhos = useMemo(() => [...new Set(molde.pecas.map((p) => p.tamanho))], [molde]);
  const [tamanho, setTamanho] = useState(tamanhos[0] ?? "único");
  const [unidades, setUnidades] = useState("20");
```

e

```tsx
  /** As estampas guardadas, cada uma com a quantidade pedida agora. */
  const [pedidos, setPedidos] = useState<Record<number, number>>({});
```

e pôr no lugar do primeiro bloco:

```tsx
  // A grade: uma coluna por tamanho, uma linha por estampa (ver `envioPorTamanho.ts`).
  const colunas = useMemo(() => colunasDaGrade(molde), [molde]);
  const [quantidades, setQuantidades] = useState<Quantidades>({});
  const [mexidas, setMexidas] = useState<Mexidas>({});
  const [aberta, setAberta] = useState<string | null>(null);
  // A prévia da arte num tamanho só: a arte é por papel e serve a todos. Não tem nada a ver com o que vai.
  const comDesenho = colunas.filter((c) => !c.semDesenho).map((c) => c.nome);
  const baseDaGrade = molde.tamanhos.find((t) => t.base)?.nome;
  const [tamanhoDaPrevia, setTamanhoDaPrevia] = useState(
    baseDaGrade && comDesenho.includes(baseDaGrade) ? baseDaGrade : (comDesenho[0] ?? ""),
  );
```

(c) As peças da prévia — trocar `tamanho` por `tamanhoDaPrevia`:

```tsx
  const pecas = useMemo(
    () => pecasParaOEncaixe(molde.pecas.filter((p) => p.tamanho === tamanhoDaPrevia)) as PecaDoMolde[],
    [molde, tamanhoDaPrevia],
  );
```

(d) Logo depois de `const estampas = molde.artes || [];`, as linhas e o que tem arte:

```tsx
  // A estampa nova só é linha enquanto tem arte no painel e ainda não foi salva no molde.
  const temEstampaNova = emEdicao === null && Object.keys(artes).length > 0;
  const linhas: LinhaDaGrade[] = [
    ...estampas.map((e) => ({ chave: linhaDaEstampa(e.id), nome: e.nome })),
    ...(temEstampaNova ? [{ chave: LINHA_NOVA, nome: nomeDaEstampa.trim() || "estampa nova" }] : []),
    { chave: LINHA_SEM_ESTAMPA, nome: "sem estampa" },
  ];
  const nomeDaLinha = (linha: string) => linhas.find((l) => l.chave === linha)?.nome ?? "";
  /** A linha usa as artes do painel: a estampa nova, e a guardada que está aberta para edição. */
  const usaOPainel = (linha: string) => linha === LINHA_NOVA || (emEdicao !== null && linha === linhaDaEstampa(emEdicao));
  const temArte = (linha: string, papel: string) => {
    if (linha === LINHA_SEM_ESTAMPA) return false;
    if (usaOPainel(linha)) return !!artes[papel];
    return !!estampas.find((e) => linhaDaEstampa(e.id) === linha)?.pecas.some((x) => x.papel === papel);
  };
  const celulas = celulasParaMandar(linhas.map((l) => l.chave), colunas, molde.pecas, quantidades, mexidas);
  const rotulo = (c: { linha: string; tamanho: string }) => `${nomeDaLinha(c.linha)} · ${c.tamanho}`;
  /** Outra estampa no painel: os números da "estampa nova" não ficam pendurados para reaparecer nela. */
  const esquecerANova = () => {
    const r = tirarLinha(quantidades, mexidas, LINHA_NOVA);
    setQuantidades(r.quantidades);
    setMexidas(r.mexidas);
    setAberta(null);
  };
```

(e) Em `abrirEstampa`, logo antes de `setArtes(carregadas);`, chamar `esquecerANova();`.

(f) Em `salvarEstampa`, trocar:

```tsx
      // Recarrega o molde para a lista vir do servidor, já com a estampa nova.
      aoRecarregar(await moldesApi.abrir(molde.id));
      setEmEdicao(id);
```

por:

```tsx
      // A estampa nova virou guardada: os números dela vão junto para a linha nova.
      if (emEdicao === null) {
        const r = levarLinha(quantidades, mexidas, LINHA_NOVA, linhaDaEstampa(id));
        setQuantidades(r.quantidades);
        setMexidas(r.mexidas);
        setAberta(null);
      }
      // Recarrega o molde para a lista vir do servidor, já com a estampa nova.
      aoRecarregar(await moldesApi.abrir(molde.id));
      setEmEdicao(id);
```

(g) Trocar o bloco inteiro que vai de `// ==================== O QUE VAI PARA O ENCAIXE ====================` até o fim de `mandarParaOEncaixe` (o `trabalhos`, `porUnidade`, `total`, `resumo`, `qualidade` e `mandarParaOEncaixe` de hoje) por:

```tsx
  // ==================== O QUE VAI PARA O ENCAIXE ====================

  const total = resumo(celulas);
  const textoDoResumo = comDesenho.length === 0
    ? "Este molde não tem peça nenhuma."
    : celulas.length === 0
      ? "Nenhuma quantidade pedida ainda."
      : `${total.prontas} peça(s) pronta(s) → ${total.pecas} peça(s) para encaixar, em ${celulas.length} envio(s).`;

  /** Quanto a arte vai pesar de verdade, no dpi escolhido, somando todas as células que vão. Conta de soma: sem memo. */
  const qualidade = (() => {
    const alvo = Number(dpi) || 150;
    let pontos = 0;
    let ppcmMenor = Infinity;
    let comArte = 0;
    for (const celula of celulas) {
      for (const peca of celula.pecas) {
        if (!temArte(celula.linha, peca.papel)) continue;
        comArte++;
        const ppcm = ppcmDaArte(peca.largura, peca.altura, alvo);
        ppcmMenor = Math.min(ppcmMenor, ppcm);
        pontos += peca.largura * ppcm * peca.altura * ppcm;
      }
    }
    if (comArte === 0) return "";
    const dpiReal = Math.round(ppcmMenor * 2.54);
    return `${comArte} peça(s) com arte a ${dpiReal} dpi (${formatarNumero(pontos / 1e6, 0)} milhões de pontos)`
      + (dpiReal < alvo - 1 ? " — abaixei o dpi para caber na memória." : "");
  })();

  /** As artes de uma linha. A estampa guardada só carrega as imagens aqui, uma vez para todos os tamanhos. */
  const artesDaLinha = async (linha: string, guardadas: Map<string, ArtesPorPapel>): Promise<ArtesPorPapel> => {
    if (linha === LINHA_SEM_ESTAMPA) return {};
    if (usaOPainel(linha)) return artes;
    const ja = guardadas.get(linha);
    if (ja) return ja;
    const carregadas: ArtesPorPapel = {};
    for (const peca of estampas.find((e) => linhaDaEstampa(e.id) === linha)?.pecas ?? []) {
      carregadas[peca.papel] = {
        nome: peca.nomeOriginal || peca.arquivo,
        img: await carregarImagem(peca.url),
        ajuste: { ...AJUSTE_PADRAO, ...peca.ajuste },
      };
    }
    guardadas.set(linha, carregadas);
    return carregadas;
  };

  const mandarParaOEncaixe = async () => {
    setErro("");
    if (!ligacao) return setErro("O editor de produção não está montado.");
    if (celulas.length === 0) {
      const pediu = Object.values(quantidades).some((q) => Object.values(q).some((n) => n > 0));
      return setErro(pediu
        ? "As peças dos tamanhos pedidos estão todas em zero."
        : "Diga quantas peças prontas você quer, em pelo menos um tamanho.");
    }

    const alvo = Number(dpi) || 150;
    const guardadas = new Map<string, ArtesPorPapel>();
    const mandadas: CelulaParaMandar[] = [];
    try {
      // Célula por célula: o Encaixe soma o que chega, então vários tamanhos são vários envios.
      for (const [k, celula] of celulas.entries()) {
        setOcupado(`Montando ${rotulo(celula)} (${k + 1} de ${celulas.length})…`);
        const artesDaCelula = await artesDaLinha(celula.linha, guardadas);
        const estampa = celula.linha === LINHA_SEM_ESTAMPA ? "" : nomeDaLinha(celula.linha);

        // A arte grande só é desenhada agora, na hora de mandar.
        const comArte = celula.pecas.map((peca) => {
          const arte = artesDaCelula[peca.papel];
          if (!arte) return { ...peca, estampa };
          const ppcm = ppcmDaArte(peca.largura, peca.altura, alvo);
          const desenho = desenharArteNoMolde(
            { contorno: peca.contorno, furos: peca.furos || [], largura: peca.largura, altura: peca.altura },
            arte.img, arte.ajuste, ppcm, { margem: 0 });
          return { ...peca, desenho, arte: arte.nome, estampa };
        });

        // `unidades: 1` com a quantidade final em cada peça, e só as > 0: o Encaixe faz
        // `max(1, quantidade × unidades)`, e uma peça em 0 chegaria como 1.
        await ligacao.mandarMoldeParaOEncaixe({ nome: molde.nome, tamanho: celula.tamanho, pecas: comArte, unidades: 1 });
        mandadas.push(celula);
      }

      aoFechar();
      ligacao.irPara("encaixe");
    } catch (e) {
      // O que já chegou fica no Encaixe; as células dele zeram, e o próximo clique manda só o que faltou.
      const faltou = celulas.filter((c) => !mandadas.includes(c));
      setQuantidades((q) => depoisDaFalha(q, mandadas));
      setAberta(null);
      setErro([
        mandadas.length > 0 ? `Foram: ${mandadas.map(rotulo).join(", ")}.` : "",
        `Faltou: ${faltou.map(rotulo).join(", ")} — ${e instanceof Error ? e.message : String(e)}`,
      ].filter(Boolean).join(" "));
    } finally {
      setOcupado("");
    }
  };
```

- [ ] **Step 4: Trocar a tela da janela**

Ainda em `EnvioParaEncaixe.tsx`, no JSX:

(a) O texto de ajuda do topo (`<p className="hint">Mande a arte de cada parte…`): trocar a frase "trocando o tamanho aqui em cima, ela se ajusta sozinha ao contorno novo" por "o 'Ver no tamanho' mostra a prévia em cada um". O parágrafo fica:

```tsx
          <p className="hint">
            Mande a arte de cada parte — o retângulo que saiu do seu programa de desenho. O sistema
            coloca a arte dentro do contorno do molde e recorta pela linha da peça. A mesma arte serve
            para todos os tamanhos: o "Ver no tamanho" mostra a prévia em cada um. Parte sem arte vai
            para o encaixe só como contorno.
          </p>
```

(b) O `<div className="row">` do topo: tirar os `<label>` de "Tamanho" e de "Quantas peças prontas"; fica só o de "Qualidade da arte".

(c) Em cada estampa guardada, trocar o bloco `{emEdicao === estampa.id ? (<span …>em edição — usa a quantidade lá de cima</span>) : (<label className="estampa-qtd">…</label>)}` por:

```tsx
                  {emEdicao === estampa.id && <span className="etiqueta-tamanho">em edição</span>}
```

(d) O `<p className="hint">` do fim da seção das estampas ("Ponha quantas peças prontas quer de cada estampa guardada…") vira:

```tsx
            <p className="hint">
              Ponha na grade quantas peças prontas quer de cada estampa em cada tamanho. O que ficar em
              zero não vai para o encaixe. O ▸ de uma célula mostra as peças dela, e dá para mudar a
              quantidade de cada uma só neste envio.
            </p>
```

(e) Logo depois do `</section>` das estampas guardadas, a grade:

```tsx
          <GradeDeQuantidades
            linhas={linhas}
            colunas={colunas}
            pecas={molde.pecas}
            quantidades={quantidades}
            mexidas={mexidas}
            aberta={aberta}
            aoMudarQuantidade={(linha, tamanho, valor) => setQuantidades((q) => mudarQuantidade(q, linha, tamanho, valor))}
            aoMexer={(celula, indice, valor) => setMexidas((m) => mexer(m, celula, indice, valor))}
            aoAbrir={setAberta}
          />
```

(f) No botão "Começar outra estampa", o `onClick` passa a ser:

```tsx
                onClick={() => { esquecerANova(); setArtes({}); setEmEdicao(null); setNomeDaEstampa(""); }}
```

(g) Logo antes de `<div className="partes-arte">`, o seletor da prévia:

```tsx
          <label style={{ maxWidth: 200 }}>
            Ver no tamanho
            <select aria-label="Ver no tamanho" value={tamanhoDaPrevia} onChange={(e) => setTamanhoDaPrevia(e.target.value)}>
              {comDesenho.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
```

(h) O `<p className="hint">{resumo}</p>` do fim vira `<p className="hint">{textoDoResumo}</p>`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run bancada:envio && npm run tipos`
Expected: o OK da bancada (os cenários "grade" e "janela" todos passando) e `tsc` sem erro.

Se `tsc` reclamar de `unidades`/`tamanho`/`pedidos` não definidos: sobrou uma referência do jeito antigo — procure com `grep -n "unidades\|pedidos\|\btamanho\b" src/telas/moldes/EnvioParaEncaixe.tsx` e troque pelo equivalente acima. Se o `useMemo` ficar sem uso no arquivo, não tire o import: a prévia (`ParteComArte`) e as `pecas` ainda usam.

- [ ] **Step 6: Commit**

```bash
git add src/telas/moldes/EnvioParaEncaixe.tsx bancada/cenarios-do-envio.tsx
git commit -F - <<'EOF'
A janela Arte e encaixe manda a grade inteira: cada estampa em cada tamanho, num clique só

Falhou no meio, a janela fica: diz o que foi e o que faltou, e o próximo
clique manda só o que faltou.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Conferência completa e na tela do app

**Files:** nenhum novo; só verificação (e correção, se algo aparecer).

- [ ] **Step 1: Rodar tudo o que o CI roda**

Run:

```bash
npm run tipos && for s in revisao conferir encolher complemento folga conferencia tamanhos moldes-pecas montagem graduacao nos editor envio medida; do npm run -s bancada:$s || { echo "FALHOU: $s"; break; }; done
```

Expected: cada bancada imprime o seu "OK — …" e nenhum "FALHOU". A `bancada:revisao` confere o front: se ela reclamar de algo em `EnvioParaEncaixe.tsx` (por exemplo, um texto ou `aria-label` que ela procura), leia a mensagem e ajuste a janela, não a bancada.

- [ ] **Step 2: Conferir na tela do app**

Subir o servidor (`npm run dev`, que roda `servidor/server.js`) e o front (`npm run dev:app`) e abrir no navegador. Na estante (Moldes), num molde com grade P/M/G e duas estampas guardadas (ou criar: Montagem → Grade), abrir **Arte e encaixe** e conferir:

1. A grade tem uma linha por estampa, "sem estampa", e as colunas na ordem da grade; tamanho sem peça aparece "sem desenho".
2. Pôr números em P e M de uma estampa e em M de outra; o resumo embaixo mostra prontas e peças.
3. Abrir o ▸ de uma célula, zerar uma peça, mudar as prontas: a zerada fica 0, as outras acompanham.
4. Mandar: a janela fecha, o Encaixe abre com as peças de cada tamanho e estampa (a origem de cada peça diz `molde … · <tamanho> · <papel> · estampa <nome>`), com as quantidades da grade.
5. Abrir pela barra da Montagem (botão Encaixar num molde concluído): a mesma janela, a mesma grade.

Se algo não bater, corrigir no arquivo da tarefa dona (Tarefa 1 para conta, 2 para a grade, 3 para a janela), com um cenário novo na bancada que pegue o problema antes da correção.

- [ ] **Step 3: Commit (só se a conferência pediu correção)**

```bash
git add -A src bancada
git commit -F - <<'EOF'
<o que a conferência na tela pegou, em uma frase>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
