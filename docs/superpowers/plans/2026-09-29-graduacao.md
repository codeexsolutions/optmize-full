# Graduação na Montagem — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na Montagem, a pessoa define a grade de tamanhos, gradua cada peça a partir do base (por pontos — salto igual ou por tamanho — ou por porcentagem da peça inteira) e gera os outros tamanhos, conferindo tudo sobreposto nas cores.

**Architecture:** As contas moram num motor puro novo, `src/motores/graduacao.js` (regras, deslocamentos, geração, alinhamento das camadas), com a regra guardada na coluna nova `molde_pecas.graduacao` da linha do base. As operações da grade (acrescentar, renomear, tirar, ordem, base, cor) vão para `src/motores/tamanhos.js`. A tela ganha a janela "Grade", a ferramenta "Graduar" com o bloco da graduação no lugar do painel da peça, e o "Gerar tamanhos" com a pergunta de substituir.

**Tech Stack:** React 19 + TypeScript (tela), JavaScript ESM puro (motores), Express + better-sqlite3 (servidor), Node 24 + `node:assert` (bancadas), esbuild (`bancada/carregarModulo.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-29-graduacao-design.md`

## Global Constraints

- Branch `feature/graduacao`, em cima da `feature/importar-audaces` (usa a grade, os grupos e os chips de lá).
- Nenhuma dependência nova.
- Coordenadas em cm, as mesmas dos nós: x para a direita, y para baixo. Medida digitada aceita vírgula e **negativo** (o `lerCm` da Montagem zera negativo — a graduação usa o seu próprio `lerMedida`).
- A graduação mora só na linha do base de cada grupo; a linha diz o base pelo próprio `tamanho`. Tamanho gerado leva `origem: "graduação"` e `graduacao: null`.
- "Salto igual" guarda um `passo`; "por tamanho" guarda o deslocamento **acumulado** de cada tamanho em relação ao base, e a tela mostra/edita por salto (P→M, M→G, G→GG).
- Os saltos (*k*) saem da ordem da grade: *k* = posição do tamanho − posição do base.
- Tamanho gerado que não passa no `pecaParaGravar` (margem que fecha) **não é gerado**; a mensagem diz qual e por quê.
- A grade guarda os tamanhos **declarados**, mesmo sem desenho; o desfazer guarda peças **e** grade juntas.
- Código, nomes, comentários e mensagens em português, no tom dos arquivos vizinhos. Arquivos com CRLF continuam CRLF.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Servidor de teste: cópia do banco e sessão **sem tokens** (ver a nota no fim do plano).

## Nota sobre o alinhamento das camadas (achado ao ler o código)

`pecaParaGravar` encosta cada peça no canto do próprio corte ao gravar. Depois de um F5, cada tamanho está encostado no seu canto, e um G que cresceu para os dois lados apareceria, sobreposto, crescendo só para um. Por isso a sobreposição ("Ver tamanhos") **alinha na hora de desenhar**: pelas regras, quando o grupo tem graduação e os nós batem (exato); senão pelos centros das caixas. Nada muda no que é gravado (`alinhamentoDaCamada`, Task 2).

## Review Focus

1. **Molde do Digitalizar (tamanho "base") que vira grade P/M/G/GG:** renomear "base" para "M" tem de levar o tamanho das peças e as chaves das regras junto, e acrescentar tamanhos não pode apagar nada — pinado na Task 5 (`renomearTamanho` com peça graduada).
2. **Mexer nos nós do base depois de gerar:** os tamanhos gerados ficam com outro número de nós; a sobreposição não pode quebrar (cai no alinhamento pelos centros) — pinado na Task 2 (`alinhamentoDaCamada` com contagens diferentes).
3. **Tamanho gerado que não fecha** (P pequeno com margem): fica de fora, com o motivo, e o resto entra — pinado na Task 2 (`aplicarGeracao` com `conferir` que recusa).
4. **Desfazer depois de gerar, renomear ou juntar:** peças e grade voltam juntas, sem chip sobrando — pinado no navegador nas Tasks 5 e 8.
5. **Porcentagem que some o tamanho** (50% por tamanho no PP, *k* = −2, escala 0) ou nó de regra fora da peça: erro claro, nunca peça vazia — pinado na Task 2.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/motores/graduacao.js` (novo) | regras, saltos, deslocamentos, gerar um tamanho, planejar/aplicar a geração, alinhar camadas, remapear regras |
| `src/motores/tamanhos.js` | a grade guarda tamanhos declarados; operações da grade |
| `src/motores/montagem.js` | inserir/apagar nó remapeiam as regras |
| `servidor/moldes-pecas.js`, `servidor/db.js`, `servidor/moldes-api.js` | coluna `graduacao`, conferida e limpa |
| `src/api/moldes.ts` | tipos `Graduacao`, `RegraDeGraduacao`, `Deslocamento` |
| `src/telas/moldes/EditorDeMolde.tsx`, `vocabulario.ts` | o passo a passo antigo carrega a graduação |
| `src/telas/montagem/useMoldeEmMontagem.ts` | desfazer com peças e grade |
| `src/telas/montagem/ChipsDeTamanho.tsx` | sempre à mostra; "sem desenho"; botão Grade |
| `src/telas/montagem/JanelaDaGrade.tsx` (novo) | a janela da grade |
| `src/telas/montagem/BlocoDaGraduacao.tsx` (novo) | o bloco da ferramenta Graduar |
| `src/telas/montagem/JanelaDeSubstituir.tsx` (novo) | a pergunta antes de refazer desenho próprio |
| `src/telas/montagem/MesaDeMontagem.tsx`, `Mesa.tsx`, `ListaDePecas.tsx` | ligar tudo |
| `src/telas/risco/desenhoDeNos.ts` | o losango do ponto de graduação |
| `bancada/conferir-graduacao.mjs` (novo), `conferir-tamanhos.mjs`, `conferir-moldes-pecas.cjs`, `conferir-montagem.mjs` | bancadas |

---

### Task 1: As regras da graduação

**Files:**
- Create: `src/motores/graduacao.js`
- Create: `bancada/conferir-graduacao.mjs`
- Modify: `package.json` (script), `.github/workflows/conferir.yml` (passo "Moldes e tamanhos")

**Interfaces:**
- Produces:
  - `ORIGEM_GERADA = "graduação"`, `ORIGEM_AJUSTADA = "graduação ajustada à mão"`
  - `graduacaoVazia() → { jeito: "pontos", regras: [], porcentagem: 0 }`
  - `lerMedida(texto) → number | null` (vírgula, negativo; vazio = 0)
  - `saltosDoTamanho(grade, base, tamanho) → number | null`
  - `deslocamentoDaRegra(regra, grade, base, tamanho) → { dx, dy }`
  - `passosDaRegra(regra, grade, base) → { de, para, dx, dy }[]` (um por par vizinho da grade)
  - `faltando(regra, grade, base) → string[]` (tamanhos sem valor numa regra por tamanho)
  - `mudarPasso(regra, grade, base, indice, { dx, dy }) → regra "porTamanho"`
  - `trocarModo(regra, grade, base, modo) → { regra, perdeu: boolean }`
  - `comRegra(graduacao | null, no, regra | null) → graduacao` (põe, troca ou tira)
  - `graduacaoAoInserirNo(g, i)`, `graduacaoAoApagarNo(g, i)` (conta `perdidos`), `graduacaoRenomearTamanho(g, velho, novo)`, `graduacaoTirarTamanho(g, nome)`
  - `grade` é `{ nome, cor, ordem, base }[]`.

- [ ] **Step 1: A bancada que falha**

`bancada/conferir-graduacao.mjs`:

```js
/*
 * BANCADA — a graduação
 *
 *     npm run bancada:graduacao
 *
 * Roda no CI. Ver docs/superpowers/specs/2026-09-29-graduacao-design.md.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const g = await carregarModulo("src/motores/graduacao.js");
const grade = ["PP", "P", "M", "G", "GG"].map((nome, ordem) => ({ nome, cor: "#000000", ordem, base: nome === "M" }));
const perto = (a, b, tol = 1e-9) => Math.abs(a.dx - b.dx) < tol && Math.abs(a.dy - b.dy) < tol;

// 1. Número digitado: vírgula, negativo, vazio; texto recusa.
assert.equal(g.lerMedida("-0,5"), -0.5);
assert.equal(g.lerMedida(""), 0);
assert.equal(g.lerMedida("abc"), null);

// 2. Saltos pela ordem da grade.
assert.equal(g.saltosDoTamanho(grade, "M", "GG"), 2);
assert.equal(g.saltosDoTamanho(grade, "M", "PP"), -2);
assert.equal(g.saltosDoTamanho(grade, "M", "XG"), null);

// 3. Salto igual: k × passo, para cima e para baixo do base.
{
  const r = { no: 0, modo: "igual", passo: { dx: 1, dy: -0.5 } };
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "G"), { dx: 1, dy: -0.5 }));
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "GG"), { dx: 2, dy: -1 }));
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "P"), { dx: -1, dy: 0.5 }));
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "M"), { dx: 0, dy: 0 }));
}

// 4. Por tamanho: acumulado; tamanho sem valor conta como o vizinho mais perto do base (salto 0).
{
  const r = { no: 0, modo: "porTamanho", deslocamentos: { P: { dx: -1, dy: 0 }, G: { dx: 1, dy: 0 } } };
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "GG"), { dx: 1, dy: 0 }), "GG sem valor = G");
  assert.ok(perto(g.deslocamentoDaRegra(r, grade, "M", "PP"), { dx: -1, dy: 0 }), "PP sem valor = P");
  const passos = g.passosDaRegra(r, grade, "M");
  assert.deepEqual(passos.map((p) => `${p.de}→${p.para}`), ["PP→P", "P→M", "M→G", "G→GG"]);
  assert.ok(perto(passos[1], { dx: 1, dy: 0 }), "P→M anda 1");
  assert.ok(perto(passos[3], { dx: 0, dy: 0 }), "G→GG sem valor anda 0");
  assert.deepEqual(g.faltando(r, grade, "M"), ["PP", "GG"]);
}

// 5. Mudar o salto M→G move o G e tudo acima; mudar P→M move o P e tudo abaixo.
{
  const r = { no: 3, modo: "igual", passo: { dx: 1, dy: 0 } };
  const cima = g.mudarPasso(r, grade, "M", 2, { dx: 1.5, dy: 0 });
  assert.equal(cima.modo, "porTamanho");
  assert.equal(cima.no, 3);
  assert.ok(perto(g.deslocamentoDaRegra(cima, grade, "M", "G"), { dx: 1.5, dy: 0 }));
  assert.ok(perto(g.deslocamentoDaRegra(cima, grade, "M", "GG"), { dx: 2.5, dy: 0 }));
  assert.ok(perto(g.deslocamentoDaRegra(cima, grade, "M", "P"), { dx: -1, dy: 0 }), "o P não muda");
  const baixo = g.mudarPasso(r, grade, "M", 1, { dx: 2, dy: 0 });
  assert.ok(perto(g.deslocamentoDaRegra(baixo, grade, "M", "P"), { dx: -2, dy: 0 }));
  assert.ok(perto(g.deslocamentoDaRegra(baixo, grade, "M", "PP"), { dx: -3, dy: 0 }));
  assert.ok(perto(g.deslocamentoDaRegra(baixo, grade, "M", "G"), { dx: 1, dy: 0 }), "o G não muda");
}

// 6. Trocar de modo: igual → por tamanho preenche; por tamanho → igual avisa quando perde.
{
  const igual = { no: 0, modo: "igual", passo: { dx: 1, dy: 0 } };
  const pt = g.trocarModo(igual, grade, "M", "porTamanho");
  assert.equal(pt.perdeu, false);
  assert.ok(perto(pt.regra.deslocamentos.GG, { dx: 2, dy: 0 }));
  assert.equal(g.trocarModo(pt.regra, grade, "M", "igual").perdeu, false, "saltos iguais não perdem nada");
  const diferente = g.mudarPasso(igual, grade, "M", 3, { dx: 3, dy: 0 });
  const volta = g.trocarModo(diferente, grade, "M", "igual");
  assert.equal(volta.perdeu, true);
  assert.ok(perto(volta.regra.passo, { dx: 1, dy: 0 }), "fica o salto do base para o de cima");
}

// 7. Pôr, trocar e tirar a regra de um nó.
{
  let gr = g.comRegra(null, 4, { modo: "igual", passo: { dx: 1, dy: 0 } });
  assert.equal(gr.jeito, "pontos");
  gr = g.comRegra(gr, 1, { modo: "igual", passo: { dx: 0, dy: 1 } });
  assert.deepEqual(gr.regras.map((r) => r.no), [1, 4], "em ordem de nó");
  gr = g.comRegra(gr, 4, null);
  assert.deepEqual(gr.regras.map((r) => r.no), [1]);
}

// 8. Nós do base mudaram: inserir desloca os de depois; apagar tira a regra e conta a perda.
{
  const gr = { jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }, { no: 3, modo: "igual", passo: { dx: 2, dy: 0 } },
  ] };
  assert.deepEqual(g.graduacaoAoInserirNo(gr, 1).regras.map((r) => r.no), [1, 4]);
  const ap = g.graduacaoAoApagarNo(gr, 1);
  assert.deepEqual(ap.regras.map((r) => r.no), [2]);
  assert.equal(ap.perdidos, 1);
  assert.deepEqual(g.graduacaoAoApagarNo(gr, 2).regras.map((r) => r.no), [1, 2], "apagar nó sem regra só desloca");
}

// 9. Renomear e tirar tamanho nas regras por tamanho.
{
  const gr = { jeito: "pontos", porcentagem: 0, regras: [
    { no: 0, modo: "porTamanho", deslocamentos: { P: { dx: -1, dy: 0 }, G: { dx: 1, dy: 0 } } },
  ] };
  assert.deepEqual(Object.keys(g.graduacaoRenomearTamanho(gr, "G", "GRANDE").regras[0].deslocamentos).sort(), ["GRANDE", "P"]);
  assert.deepEqual(Object.keys(g.graduacaoTirarTamanho(gr, "P").regras[0].deslocamentos), ["G"]);
}

console.log("OK — a graduação confere.");
```

`package.json`, junto dos outros: `"bancada:graduacao": "node bancada/conferir-graduacao.mjs",`

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:graduacao`
Expected: FAIL com `Could not resolve ".../src/motores/graduacao.js"`.

- [ ] **Step 3: O motor**

`src/motores/graduacao.js`:

```js
/**
 * ===========================================================================
 * GRADUAÇÃO — os tamanhos gerados a partir do base
 * ===========================================================================
 *
 * A regra é da PEÇA e mora na linha do tamanho base (`peca.graduacao`):
 *
 *   { jeito: "pontos" | "porcentagem", regras: [...], porcentagem: número, perdidos?: número }
 *
 * - Por pontos, cada regra é de um nó: `{ no, modo: "igual", passo }` — anda
 *   `k × passo`, com k = saltos do base na ordem da grade — ou `{ no, modo:
 *   "porTamanho", deslocamentos: { P: {dx, dy}, G: … } }` — o ACUMULADO de
 *   cada tamanho em relação ao base. A tela mostra e edita por salto.
 * - Por porcentagem, a peça inteira escala `1 + k × % / 100`.
 *
 * Os dois campos convivem: trocar o jeito não apaga o outro. Coordenadas em
 * cm, as mesmas dos nós: x para a direita, y para baixo. Conta pura: recebe e
 * devolve objetos novos. Ver docs/superpowers/specs/2026-09-29-graduacao-design.md.
 */

/** A origem que marca um tamanho feito pela graduação: esse é refeito sem perguntar. */
export const ORIGEM_GERADA = "graduação";
/** Um tamanho gerado que alguém ajustou à mão: gerar de novo pergunta antes. */
export const ORIGEM_AJUSTADA = "graduação ajustada à mão";

const ZERO = Object.freeze({ dx: 0, dy: 0 });
const soma = (a, b) => ({ dx: a.dx + b.dx, dy: a.dy + b.dy });
const vezes = (a, k) => ({ dx: a.dx * k, dy: a.dy * k });
const iguais = (a, b) => Math.abs(a.dx - b.dx) < 1e-9 && Math.abs(a.dy - b.dy) < 1e-9;
const nomesEmOrdem = (grade) => [...grade].sort((a, b) => a.ordem - b.ordem).map((t) => t.nome);

export function graduacaoVazia() {
  return { jeito: "pontos", regras: [], porcentagem: 0 };
}

/** O número digitado. Vírgula vale ponto; negativo vale (andar para a esquerda ou para cima); vazio é 0. */
export function lerMedida(texto) {
  const limpo = String(texto ?? "").trim().replace(",", ".");
  if (limpo === "" || limpo === "-") return 0;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Quantos saltos o tamanho está do base, na ordem da grade. `null` se algum dos dois não está na grade. */
export function saltosDoTamanho(grade, base, tamanho) {
  const nomes = nomesEmOrdem(grade);
  const i = nomes.indexOf(tamanho);
  const j = nomes.indexOf(base);
  return i < 0 || j < 0 ? null : i - j;
}

/**
 * Quanto o nó da regra anda no tamanho. Por tamanho, tamanho sem valor conta
 * como o vizinho mais perto do base (o salto que falta vale 0).
 */
export function deslocamentoDaRegra(regra, grade, base, tamanho) {
  if (tamanho === base) return { ...ZERO };
  if (regra.modo === "igual") {
    const k = saltosDoTamanho(grade, base, tamanho);
    return k === null ? { ...ZERO } : vezes(regra.passo, k);
  }
  const nomes = nomesEmOrdem(grade);
  const i = nomes.indexOf(tamanho);
  const j = nomes.indexOf(base);
  if (i < 0 || j < 0) return { ...ZERO };
  const rumo = i > j ? -1 : 1;
  for (let k = i; k !== j; k += rumo) {
    const d = regra.deslocamentos?.[nomes[k]];
    if (d) return { dx: d.dx, dy: d.dy };
  }
  return { ...ZERO };
}

/** Os saltos da regra, um por par vizinho da grade: o quanto o nó anda subindo de `de` para `para`. */
export function passosDaRegra(regra, grade, base) {
  const nomes = nomesEmOrdem(grade);
  const saida = [];
  for (let i = 0; i + 1 < nomes.length; i++) {
    const de = deslocamentoDaRegra(regra, grade, base, nomes[i]);
    const para = deslocamentoDaRegra(regra, grade, base, nomes[i + 1]);
    saida.push({ de: nomes[i], para: nomes[i + 1], dx: para.dx - de.dx, dy: para.dy - de.dy });
  }
  return saida;
}

/** Os tamanhos sem valor numa regra por tamanho (tamanho novo na grade, por exemplo). */
export function faltando(regra, grade, base) {
  if (regra.modo !== "porTamanho") return [];
  return nomesEmOrdem(grade).filter((n) => n !== base && !regra.deslocamentos?.[n]);
}

/**
 * Muda o salto `indice` (entre o tamanho `indice` e o `indice + 1` da grade).
 * Anda o lado longe do base: acima do base, o `para` e os de cima; abaixo, o
 * `de` e os de baixo. A regra sai "por tamanho", com todos os acumulados.
 */
export function mudarPasso(regra, grade, base, indice, valor) {
  const nomes = nomesEmOrdem(grade);
  const j = nomes.indexOf(base);
  const acumulado = Object.fromEntries(nomes.map((n) => [n, deslocamentoDaRegra(regra, grade, base, n)]));
  const de = acumulado[nomes[indice]];
  const para = acumulado[nomes[indice + 1]];
  const diferenca = { dx: valor.dx - (para.dx - de.dx), dy: valor.dy - (para.dy - de.dy) };
  if (indice >= j) {
    for (let k = indice + 1; k < nomes.length; k++) acumulado[nomes[k]] = soma(acumulado[nomes[k]], diferenca);
  } else {
    for (let k = 0; k <= indice; k++) acumulado[nomes[k]] = soma(acumulado[nomes[k]], vezes(diferenca, -1));
  }
  delete acumulado[base];
  return { no: regra.no, modo: "porTamanho", deslocamentos: acumulado };
}

/**
 * Troca o modo da regra. Salto igual → por tamanho preenche todos os
 * tamanhos. Por tamanho → salto igual fica com o salto do base para o tamanho
 * de cima (ou, se o base é o maior, o de baixo para o base); `perdeu` diz que
 * os saltos eram diferentes — a tela pergunta antes.
 */
export function trocarModo(regra, grade, base, modo) {
  if (regra.modo === modo) return { regra, perdeu: false };
  const nomes = nomesEmOrdem(grade);
  if (modo === "porTamanho") {
    const deslocamentos = {};
    for (const n of nomes) if (n !== base) deslocamentos[n] = deslocamentoDaRegra(regra, grade, base, n);
    return { regra: { no: regra.no, modo, deslocamentos }, perdeu: false };
  }
  const passos = passosDaRegra(regra, grade, base);
  const j = nomes.indexOf(base);
  const escolhido = passos[j] ?? passos[j - 1] ?? { ...ZERO };
  return {
    regra: { no: regra.no, modo: "igual", passo: { dx: escolhido.dx, dy: escolhido.dy } },
    perdeu: passos.some((p) => !iguais(p, escolhido)),
  };
}

/** Põe, troca ou (com `regra` null) tira a regra do nó. As regras ficam em ordem de nó. */
export function comRegra(graduacao, no, regra) {
  const atual = graduacao ?? graduacaoVazia();
  const outras = (atual.regras || []).filter((r) => r.no !== no);
  return {
    ...atual,
    jeito: atual.jeito || "pontos",
    regras: regra ? [...outras, { ...regra, no }].sort((a, b) => a.no - b.no) : outras,
  };
}

/** Um nó novo entrou depois do nó `i`: as regras dos nós de depois andam um. */
export function graduacaoAoInserirNo(graduacao, i) {
  if (!graduacao) return graduacao;
  return { ...graduacao, regras: (graduacao.regras || []).map((r) => (r.no > i ? { ...r, no: r.no + 1 } : r)) };
}

/** O nó `i` saiu: a regra dele sai (e conta em `perdidos`), as de depois voltam um. */
export function graduacaoAoApagarNo(graduacao, i) {
  if (!graduacao) return graduacao;
  const regras = graduacao.regras || [];
  const ficam = regras.filter((r) => r.no !== i);
  return {
    ...graduacao,
    perdidos: (graduacao.perdidos || 0) + (regras.length - ficam.length),
    regras: ficam.map((r) => (r.no > i ? { ...r, no: r.no - 1 } : r)),
  };
}

const renomearChaves = (objeto, velho, novo) =>
  Object.fromEntries(Object.entries(objeto).map(([k, v]) => [k === velho ? novo : k, v]));

export function graduacaoRenomearTamanho(graduacao, velho, novo) {
  if (!graduacao) return graduacao;
  return {
    ...graduacao,
    regras: (graduacao.regras || []).map((r) => (r.modo === "porTamanho"
      ? { ...r, deslocamentos: renomearChaves(r.deslocamentos || {}, velho, novo) } : r)),
  };
}

export function graduacaoTirarTamanho(graduacao, nome) {
  if (!graduacao) return graduacao;
  return {
    ...graduacao,
    regras: (graduacao.regras || []).map((r) => {
      if (r.modo !== "porTamanho") return r;
      const { [nome]: _fora, ...resto } = r.deslocamentos || {};
      return { ...r, deslocamentos: resto };
    }),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:graduacao`
Expected: `OK — a graduação confere.`

- [ ] **Step 5: CI**

Em `.github/workflows/conferir.yml`, no passo "Moldes e tamanhos", acrescentar `&& npm run bancada:graduacao` ao fim do `run`.

- [ ] **Step 6: Commit**

```bash
git add src/motores/graduacao.js bancada/conferir-graduacao.mjs package.json .github/workflows/conferir.yml
git commit -m "As regras da graduação: salto igual, por tamanho, e os saltos pela ordem da grade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Gerar um tamanho, planejar a geração e alinhar as camadas

**Files:**
- Modify: `src/motores/graduacao.js` (imports no topo; funções novas no fim)
- Modify: `bancada/conferir-graduacao.mjs` (casos 10–18, antes do `console.log` final)

**Interfaces:**
- Consumes: Task 1 inteira.
- Produces:
  - `transladarNos(nos, { dx, dy }) → nos`
  - `deslocamentosDosNos(nos, regras, grade, base, tamanho) → { dx, dy }[]` (um por nó; sem regra, a mistura dos vizinhos com regra pelo comprimento da linha)
  - `deslocamentosDoTamanho(pecaBase, grade, tamanho) → { dx, dy }[] | null`
  - `gerarTamanho(pecaBase, grade, tamanho) → { peca, avisos: string[] } | { erro: string }`
  - `avisosDaGraduacao(pecaBase, grade) → string[]`
  - `planejarGeracao(pecas, grade, grupo | null) → Alvo[]`, com `Alvo = { grupo, tamanho, iBase, iExistente, acao: "criar" | "refazer" | "perguntar", origem, nome }` (`iBase`/`iExistente` são índices em `pecas`; `iExistente` −1 quando não há)
  - `aplicarGeracao(pecas, grade, alvos, conferir) → { pecas, gerados: Alvo[], naoGerados: (Alvo & { motivo })[], avisos: string[] }` — `conferir` é o `pecaParaGravar` da Montagem (`{ peca } | { erro }`)
  - `alinhamentoDaCamada(atual, camada, pecaBase | null, grade) → { dx, dy }`

- [ ] **Step 1: Os casos que falham**

Antes do `console.log` final de `bancada/conferir-graduacao.mjs`:

```js
// --- Gerar um tamanho ---
const reto = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });
const nosBase = [reto(0, 0), reto(10, 0), reto(10, 5), reto(10, 10), reto(0, 10)];
const pecaBase = (graduacao) => ({
  id: 7, tamanho: "M", grupo: 0, papel: "frente", nome: "", quantidade: 2, origem: "Digitalizar",
  nos: nosBase, graduacao,
  marcacoes: { margem: 0, espelhar: false, fio: { x: 5, y: 5, angulo: 0, comprimento: 6 },
    piques: [{ no: 0, t: 0.5, profundidade: 0.5 }], pontos: [{ x: 10, y: 5 }] },
});
const regrasDoOmbro = [
  { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } },
  { no: 3, modo: "porTamanho", deslocamentos: { G: { dx: 3, dy: 0 }, GG: { dx: 6, dy: 0 } } },
];
const base = pecaBase({ jeito: "pontos", porcentagem: 0, regras: regrasDoOmbro });

// 10. No próprio base nada anda.
assert.ok(g.deslocamentosDoTamanho(base, grade, "M").every((d) => d.dx === 0 && d.dy === 0));

// 11. O G: os nós com regra andam o pedido; os sem regra, a mistura dos vizinhos pelo comprimento da linha.
{
  const r = g.gerarTamanho(base, grade, "G");
  assert.ok(r.peca, r.erro);
  const n = r.peca.nos;
  assert.equal(n[1].x, 11, "nó 1: salto igual de 1");
  assert.equal(n[3].x, 13, "nó 3: 3 no G");
  assert.ok(Math.abs(n[2].x - 12) < 1e-9, `nó 2, no meio, anda a média: ${n[2].x}`);
  assert.ok(Math.abs(n[4].x - (3 - 2 / 3)) < 1e-6, `nó 4 anda pela volta: ${n[4].x}`);
  assert.equal(r.peca.tamanho, "G");
  assert.equal(r.peca.grupo, 0);
  assert.equal(r.peca.origem, g.ORIGEM_GERADA);
  assert.equal(r.peca.graduacao, null);
  assert.equal(r.peca.id, undefined, "peça nova, sem id");
  assert.equal(r.peca.quantidade, 2, "os campos comuns vêm do base");
  assert.deepEqual(r.peca.marcacoes.piques, base.marcacoes.piques, "o pique fica no mesmo trecho");
  assert.ok(Math.abs(r.peca.marcacoes.pontos[0].x - n[2].x) < 1e-9, "o ponto em cima do nó 2 anda como ele");
  assert.equal(r.peca.marcacoes.fio.angulo, 0);
  assert.equal(r.peca.marcacoes.fio.comprimento, 6);
  assert.ok(r.peca.marcacoes.fio.x > 5, "o fio anda com a peça");
  assert.equal(base.nos[1].x, 10, "não mexe no base");
}

// 12. O P fica abaixo do base: o salto igual volta, e o "por tamanho" sem P conta 0.
{
  const r = g.gerarTamanho(base, grade, "P");
  assert.equal(r.peca.nos[1].x, 9);
  assert.equal(r.peca.nos[3].x, 10, "o nó 3 não tem valor para o P: fica");
}

// 13. Salto igual e por tamanho com os mesmos valores dão o mesmo desenho.
{
  const igual = pecaBase({ jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }, { no: 3, modo: "igual", passo: { dx: 2, dy: 1 } }] });
  const porTamanho = pecaBase({ jeito: "pontos", porcentagem: 0, regras: [
    g.trocarModo(igual.graduacao.regras[0], grade, "M", "porTamanho").regra,
    g.trocarModo(igual.graduacao.regras[1], grade, "M", "porTamanho").regra] });
  for (const t of ["PP", "P", "G", "GG"]) {
    assert.deepEqual(g.gerarTamanho(porTamanho, grade, t).peca.nos, g.gerarTamanho(igual, grade, t).peca.nos, t);
  }
}

// 14. Porcentagem: 0 não gera; 4% no P (k = −1) escala 0,96 a partir do centro; a que some dá erro.
{
  assert.ok(g.gerarTamanho(pecaBase({ jeito: "porcentagem", porcentagem: 0, regras: [] }), grade, "G").erro);
  const p4 = g.gerarTamanho(pecaBase({ jeito: "porcentagem", porcentagem: 4, regras: [] }), grade, "P").peca;
  const xs = p4.nos.map((q) => q.x);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 9.6) < 1e-9, "largura 10 vira 9,6");
  assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 5) < 1e-9, "o centro fica");
  assert.ok(Math.abs(p4.marcacoes.fio.comprimento - 5.76) < 1e-9, "o fio escala junto");
  assert.ok(g.gerarTamanho(pecaBase({ jeito: "porcentagem", porcentagem: 50, regras: [] }), grade, "PP").erro,
    "50% por tamanho no PP (k = −2) some");
}

// 15. Um ponto só: gera e avisa; nenhum (ou só nó fora da peça): não gera.
{
  const um = g.gerarTamanho(pecaBase({ jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }] }), grade, "G");
  assert.ok(um.peca && um.avisos.length === 1);
  assert.ok(um.peca.nos.every((q, i) => q.x === nosBase[i].x + 1), "a peça inteira só se desloca");
  assert.ok(g.gerarTamanho(pecaBase({ jeito: "pontos", porcentagem: 0, regras: [] }), grade, "G").erro);
  assert.ok(g.gerarTamanho(pecaBase({ jeito: "pontos", porcentagem: 0, regras: [
    { no: 99, modo: "igual", passo: { dx: 1, dy: 0 } }] }), grade, "G").erro, "regra de nó que não existe não conta");
}

// 16. Os avisos da graduação.
{
  const av = g.avisosDaGraduacao(pecaBase({ jeito: "pontos", porcentagem: 0, perdidos: 2, regras: regrasDoOmbro }), grade);
  assert.ok(av.some((a) => /perdeu 2/.test(a)), av.join(" | "));
  assert.ok(av.some((a) => /ponto 4 não tem valor para PP, P/.test(a)), av.join(" | "));
}

// 17. A camada no lugar certo: com graduação, pela regra (exato); sem, pelos centros.
{
  const gerado = g.gerarTamanho(base, grade, "G").peca;
  const encostado = { ...gerado, nos: g.transladarNos(gerado.nos, { dx: 2, dy: 3 }) };
  const d = g.alinhamentoDaCamada(base, encostado, base, grade);
  assert.ok(Math.abs(d.dx + 2) < 1e-9 && Math.abs(d.dy + 3) < 1e-9, JSON.stringify(d));
  const volta = g.alinhamentoDaCamada(encostado, base, base, grade);
  assert.ok(Math.abs(volta.dx - 2) < 1e-9 && Math.abs(volta.dy - 3) < 1e-9, "vendo o G, o M vem para o lugar");
  const outra = { tamanho: "G", nos: [reto(0, 0), reto(4, 0), reto(4, 4), reto(0, 4)] };
  const c = g.alinhamentoDaCamada(base, outra, base, grade);
  assert.ok(Math.abs(c.dx - 3) < 1e-9 && Math.abs(c.dy - 3) < 1e-9, "número de nós diferente: pelos centros");
}

// 18. Planejar e aplicar: cria o que falta, refaz o gerado, pergunta pelo desenho próprio; o que não fecha fica de fora.
{
  const pecas = [
    base,
    { ...base, id: 8, tamanho: "G", graduacao: null, origem: "Audaces" },
    { ...base, id: 9, tamanho: "P", graduacao: null, origem: g.ORIGEM_GERADA },
    { ...base, id: 10, grupo: 1, graduacao: null, nome: "COSTAS" },
  ];
  const alvos = g.planejarGeracao(pecas, grade, null);
  assert.deepEqual(alvos.map((a) => `${a.tamanho}:${a.acao}`), ["PP:criar", "P:refazer", "G:perguntar", "GG:criar"]);
  assert.equal(alvos[2].origem, "Audaces");
  const conferir = (p) => (p.tamanho === "PP" ? { erro: "a margem fecha a peça" } : { peca: p });
  const r = g.aplicarGeracao(pecas, grade, alvos.filter((a) => a.acao !== "perguntar"), conferir);
  assert.deepEqual(r.gerados.map((a) => a.tamanho), ["P", "GG"]);
  assert.deepEqual(r.naoGerados.map((a) => `${a.tamanho}: ${a.motivo}`), ["PP: a margem fecha a peça"]);
  assert.equal(r.pecas.length, 5, "o GG entrou; o PP não");
  assert.equal(r.pecas[2].origem, g.ORIGEM_GERADA);
  assert.equal(r.pecas[2].nos[1].x, 9, "o P foi refeito no mesmo lugar da lista");
  assert.equal(r.pecas[1].origem, "Audaces", "o G da Audaces ficou");
  assert.equal(g.planejarGeracao(pecas, grade, 1).length, 0, "o grupo 1 não tem graduação");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:graduacao`
Expected: FAIL com `g.deslocamentosDoTamanho is not a function`.

- [ ] **Step 3: As funções**

No topo de `src/motores/graduacao.js`, logo depois do comentário de cabeçalho:

```js
import { achatarCurvas } from "./ajusteDeCurvas";
import { pontoNoTrecho } from "./edicaoDeNos";
```

E no fim do arquivo:

```js
// ---------------------------------------------------------------------------
// GERAR UM TAMANHO
// ---------------------------------------------------------------------------

/** O centro da caixa do risco. */
function centroDoRisco(nos) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of achatarCurvas(nos)) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

const anda = (p, d) => ({ x: p.x + d.dx, y: p.y + d.dy });

/** Os nós andando `d`, com as alças. */
export function transladarNos(nos, d) {
  return nos.map((n) => ({ ...n, ...anda(n, d), entrada: anda(n.entrada, d), saida: anda(n.saida, d) }));
}

/** Onde cada nó começa ao longo da volta, em cm, e o comprimento da volta. */
function posicoesNaVolta(nos) {
  const posicao = [];
  let total = 0;
  for (let i = 0; i < nos.length; i++) {
    posicao.push(total);
    let antes = pontoNoTrecho(nos, i, 0);
    for (let k = 1; k <= 16; k++) {
      const q = pontoNoTrecho(nos, i, k / 16);
      total += Math.hypot(q.x - antes.x, q.y - antes.y);
      antes = q;
    }
  }
  return { posicao, total };
}

/**
 * Quanto cada nó anda no tamanho. O nó com regra anda a regra; o sem regra, a
 * mistura dos dois nós com regra mais perto (antes e depois dele na volta), na
 * proporção do comprimento da linha até cada um — um nó no meio da cava anda a
 * média do ombro e da axila. Com uma regra só, todos andam como ela.
 */
export function deslocamentosDosNos(nos, regras, grade, base, tamanho) {
  const n = nos.length;
  const comRegraNo = new Map();
  for (const r of regras) {
    if (r.no >= 0 && r.no < n) comRegraNo.set(r.no, deslocamentoDaRegra(r, grade, base, tamanho));
  }
  if (comRegraNo.size === 0) return nos.map(() => ({ ...ZERO }));
  if (comRegraNo.size === 1) {
    const [unico] = comRegraNo.values();
    return nos.map(() => ({ ...unico }));
  }
  const { posicao, total } = posicoesNaVolta(nos);
  if (!(total > 0)) return nos.map(() => ({ ...ZERO }));
  const aFrente = (a, b) => (((posicao[b] - posicao[a]) % total) + total) % total;
  return nos.map((_, j) => {
    if (comRegraNo.has(j)) return { ...comRegraNo.get(j) };
    let a = j;
    do { a = (a - 1 + n) % n; } while (!comRegraNo.has(a));
    let b = j;
    do { b = (b + 1) % n; } while (!comRegraNo.has(b));
    const s = aFrente(a, j) / (aFrente(a, b) || 1);
    const da = comRegraNo.get(a);
    const db = comRegraNo.get(b);
    return { dx: da.dx + (db.dx - da.dx) * s, dy: da.dy + (db.dy - da.dy) * s };
  });
}

/** Quanto cada nó do base anda no tamanho, pelo jeito da graduação. `null` para tamanho fora da grade. */
export function deslocamentosDoTamanho(base, grade, tamanho) {
  const g = base.graduacao;
  if (!g || tamanho === base.tamanho) return base.nos.map(() => ({ ...ZERO }));
  const k = saltosDoTamanho(grade, base.tamanho, tamanho);
  if (k === null) return null;
  if (g.jeito === "porcentagem") {
    const s = 1 + (k * (Number(g.porcentagem) || 0)) / 100;
    const c = centroDoRisco(base.nos);
    return base.nos.map((q) => ({ dx: (q.x - c.x) * (s - 1), dy: (q.y - c.y) * (s - 1) }));
  }
  return deslocamentosDosNos(base.nos, g.regras || [], grade, base.tamanho, tamanho);
}

/** O quanto um ponto de dentro (pence, bolso, o fio) anda: a média dos nós, pesada pela proximidade. */
function mediaPelaDistancia(p, nos, deslocamentos) {
  let sx = 0; let sy = 0; let sw = 0;
  for (let i = 0; i < nos.length; i++) {
    const d2 = (nos[i].x - p.x) ** 2 + (nos[i].y - p.y) ** 2;
    if (d2 < 1e-12) return { ...deslocamentos[i] };
    const w = 1 / d2;
    sx += w * deslocamentos[i].dx;
    sy += w * deslocamentos[i].dy;
    sw += w;
  }
  return sw > 0 ? { dx: sx / sw, dy: sy / sw } : { ...ZERO };
}

/**
 * O tamanho `tamanho` da peça, a partir do base. A peça gerada é a do base
 * com o tamanho novo, a origem da graduação, sem `graduacao` e sem `id`; os
 * piques ficam (os nós são os mesmos), os pontos e o fio andam junto.
 */
export function gerarTamanho(base, grade, tamanho) {
  const g = base.graduacao;
  if (!g) return { erro: "a peça não tem graduação" };
  const k = saltosDoTamanho(grade, base.tamanho, tamanho);
  if (k === null) return { erro: `o tamanho ${tamanho} não está na grade` };
  if (k === 0) return { erro: `${tamanho} é o próprio base` };
  const mc = base.marcacoes;
  const avisos = [];
  let nos; let pontos; let fio;
  if (g.jeito === "porcentagem") {
    const p = Number(g.porcentagem) || 0;
    if (p === 0) return { erro: "porcentagem 0 não muda nada" };
    const s = 1 + (k * p) / 100;
    if (s < 0.05) return { erro: `com ${String(p).replace(".", ",")}% por tamanho, o ${tamanho} some` };
    const c = centroDoRisco(base.nos);
    const escala = (q) => ({ x: c.x + (q.x - c.x) * s, y: c.y + (q.y - c.y) * s });
    nos = base.nos.map((n) => ({ ...n, ...escala(n), entrada: escala(n.entrada), saida: escala(n.saida) }));
    pontos = mc.pontos.map((q) => ({ ...q, ...escala(q) }));
    fio = { ...mc.fio, ...escala(mc.fio), comprimento: mc.fio.comprimento * s };
  } else {
    const regras = (g.regras || []).filter((r) => r.no >= 0 && r.no < base.nos.length);
    if (regras.length === 0) return { erro: "marque pelo menos um ponto com regra" };
    if (regras.length === 1) avisos.push("com um ponto só, a peça inteira só se desloca: marque pelo menos dois pontos");
    const d = deslocamentosDosNos(base.nos, regras, grade, base.tamanho, tamanho);
    nos = base.nos.map((n, i) => ({ ...n, ...anda(n, d[i]), entrada: anda(n.entrada, d[i]), saida: anda(n.saida, d[i]) }));
    pontos = mc.pontos.map((q) => ({ ...q, ...anda(q, mediaPelaDistancia(q, base.nos, d)) }));
    fio = { ...mc.fio, ...anda(mc.fio, mediaPelaDistancia(mc.fio, base.nos, d)) };
  }
  const { id: _id, ...resto } = base;
  return {
    peca: { ...resto, tamanho, origem: ORIGEM_GERADA, graduacao: null, nos, marcacoes: { ...mc, pontos, fio } },
    avisos,
  };
}

/** O que o bloco da graduação avisa sobre a peça (base). */
export function avisosDaGraduacao(base, grade) {
  const g = base?.graduacao;
  if (!g) return [];
  const avisos = [];
  if (g.perdidos > 0) avisos.push(`A graduação perdeu ${g.perdidos} ponto(s) quando nós foram apagados.`);
  if (g.jeito === "porcentagem") {
    if (!Number(g.porcentagem)) avisos.push("Porcentagem 0 não muda nada.");
    return avisos;
  }
  const regras = (g.regras || []).filter((r) => r.no >= 0 && r.no < base.nos.length);
  if (regras.length === 0) avisos.push("Marque pelo menos um ponto com regra (clique num nó).");
  else if (regras.length === 1) avisos.push("Com um ponto só, a peça inteira só se desloca: marque pelo menos dois pontos.");
  for (const r of regras) {
    const sem = faltando(r, grade, base.tamanho);
    if (sem.length > 0) avisos.push(`O ponto ${r.no + 1} não tem valor para ${sem.join(", ")}: conta como o tamanho vizinho.`);
  }
  return avisos;
}

// ---------------------------------------------------------------------------
// GERAR OS TAMANHOS DO MOLDE
// ---------------------------------------------------------------------------

/**
 * O que gerar: cada grupo com graduação (ou só o `grupo` pedido), cada
 * tamanho da grade menos o base. Sem desenho: criar. Gerado pela graduação:
 * refazer. Com desenho próprio (Audaces, "juntar", ajustado à mão): perguntar.
 */
export function planejarGeracao(pecas, grade, grupo = null) {
  const alvos = [];
  const nomes = nomesEmOrdem(grade);
  pecas.forEach((base, iBase) => {
    if (!base.graduacao || (grupo !== null && base.grupo !== grupo)) return;
    for (const tamanho of nomes) {
      if (tamanho === base.tamanho) continue;
      const iExistente = pecas.findIndex((q) => q.grupo === base.grupo && q.tamanho === tamanho);
      const existente = iExistente >= 0 ? pecas[iExistente] : null;
      const acao = !existente ? "criar" : existente.origem === ORIGEM_GERADA ? "refazer" : "perguntar";
      alvos.push({ grupo: base.grupo, tamanho, iBase, iExistente, acao, origem: existente?.origem ?? null, nome: base.nome || base.papel });
    }
  });
  return alvos;
}

/**
 * Gera os alvos. O que o `conferir` recusa (a margem fecha a peça no P
 * pequeno) fica de fora, com o motivo: gerá-lo seguraria a gravação do molde
 * inteiro. O refeito fica no mesmo lugar da lista; o criado vai para o fim.
 */
export function aplicarGeracao(pecas, grade, alvos, conferir) {
  const novas = [...pecas];
  const gerados = [];
  const naoGerados = [];
  const avisos = new Set();
  for (const alvo of alvos) {
    const r = gerarTamanho(pecas[alvo.iBase], grade, alvo.tamanho);
    if (r.erro) { naoGerados.push({ ...alvo, motivo: r.erro }); continue; }
    for (const a of r.avisos) avisos.add(`${alvo.nome}: ${a}`);
    const conferida = conferir(r.peca);
    if (!conferida.peca) { naoGerados.push({ ...alvo, motivo: conferida.erro }); continue; }
    if (alvo.iExistente >= 0) novas[alvo.iExistente] = r.peca;
    else novas.push(r.peca);
    gerados.push(alvo);
  }
  return { pecas: novas, gerados, naoGerados, avisos: [...avisos] };
}

// ---------------------------------------------------------------------------
// SOBREPOR OS TAMANHOS
// ---------------------------------------------------------------------------

/**
 * Quanto a `camada` (outro tamanho da mesma peça) anda para ficar no lugar
 * certo em relação à `atual`. O `pecaParaGravar` encosta cada tamanho no
 * canto do próprio corte ao gravar, então depois de um F5 cada um está no seu
 * canto. Com graduação e os mesmos nós: pela regra, exato. Sem: pelos centros.
 */
export function alinhamentoDaCamada(atual, camada, base, grade) {
  if (base?.graduacao && camada.nos.length === base.nos.length && atual.nos.length === base.nos.length) {
    const dAtual = deslocamentosDoTamanho(base, grade, atual.tamanho);
    const dCamada = deslocamentosDoTamanho(base, grade, camada.tamanho);
    if (dAtual && dCamada) {
      let sx = 0; let sy = 0;
      for (let i = 0; i < camada.nos.length; i++) {
        sx += atual.nos[i].x + (dCamada[i].dx - dAtual[i].dx) - camada.nos[i].x;
        sy += atual.nos[i].y + (dCamada[i].dy - dAtual[i].dy) - camada.nos[i].y;
      }
      return { dx: sx / camada.nos.length, dy: sy / camada.nos.length };
    }
  }
  const ca = centroDoRisco(atual.nos);
  const cc = centroDoRisco(camada.nos);
  return { dx: ca.x - cc.x, dy: ca.y - cc.y };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:graduacao`
Expected: `OK — a graduação confere.`

- [ ] **Step 5: Commit**

```bash
git add src/motores/graduacao.js bancada/conferir-graduacao.mjs
git commit -m "Gerar um tamanho pela graduação, planejar a geração e alinhar as camadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: O servidor guarda a graduação, e o passo a passo antigo a carrega

**Files:**
- Modify: `servidor/moldes-pecas.js` (`lerGraduacao`, `arrumarPeca`, `pecaDoBanco`)
- Modify: `servidor/db.js` (coluna nova), `servidor/moldes-api.js` (os dois `INSERT`)
- Modify: `src/api/moldes.ts` (tipos), `src/telas/moldes/vocabulario.ts`, `src/telas/moldes/EditorDeMolde.tsx`
- Modify: `bancada/conferir-moldes-pecas.cjs` (caso 8)

**Interfaces:**
- Produces (API): cada peça de `GET /api/moldes/:id` traz `graduacao: Graduacao | null`; `POST`/`PUT` aceitam `graduacao` em cada peça.
- Produces (tipos em `src/api/moldes.ts`): `Deslocamento = { dx: number; dy: number }`, `RegraDeGraduacao`, `Graduacao = { jeito: "pontos" | "porcentagem"; regras: RegraDeGraduacao[]; porcentagem: number; perdidos?: number }`, `PecaDoMolde.graduacao?: Graduacao | null`.

- [ ] **Step 1: O caso que falha**

Antes do `console.log` final de `bancada/conferir-moldes-pecas.cjs`:

```js
// 8. Graduação: limpa e conferida; só com nós; nó fora, número absurdo, modo torto e tamanho vazio saem.
{
  const nos = quadrado.map((p) => no(p.x, p.y));
  const l = arrumarPeca({ contorno: quadrado, nos, graduacao: {
    jeito: "pontos", porcentagem: 999, perdidos: 1,
    regras: [
      { no: 1, modo: "igual", passo: { dx: 1, dy: -0.5 } },
      { no: 9, modo: "igual", passo: { dx: 1, dy: 0 } },
      { no: 2, modo: "porTamanho", deslocamentos: { G: { dx: 2, dy: 0 }, "": { dx: 1, dy: 0 }, GG: { dx: 500, dy: 0 } } },
      { no: 1, modo: "igual", passo: { dx: 9, dy: 9 } },
      { no: 3, modo: "torto", passo: { dx: 1, dy: 1 } },
    ],
  } }, 0);
  const gr = pecaDoBanco({ ...l, id: 1 }).graduacao;
  assert.equal(gr.jeito, "pontos");
  assert.equal(gr.porcentagem, 0, "porcentagem fora de −50…50 vira 0");
  assert.equal(gr.perdidos, 1);
  assert.deepEqual(gr.regras, [
    { no: 1, modo: "igual", passo: { dx: 1, dy: -0.5 } },
    { no: 2, modo: "porTamanho", deslocamentos: { G: { dx: 2, dy: 0 } } },
  ]);
  assert.equal(arrumarPeca({ contorno: quadrado, graduacao: { jeito: "pontos", regras: [] } }, 0).graduacao, null, "sem nós, sem graduação");
  assert.equal(arrumarPeca({ contorno: quadrado, nos, graduacao: { jeito: "outro" } }, 0).graduacao, null);
  assert.equal(pecaDoBanco({ ...arrumarPeca({ contorno: quadrado }, 0), id: 2 }).graduacao, null);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:moldes-pecas`
Expected: FAIL (`Cannot read properties of undefined (reading 'jeito')` ou a comparação de `gr`).

- [ ] **Step 3: `moldes-pecas.js`**

Antes de `arrumarPeca`:

```js
function lerDeslocamento(d) {
  const dx = numero(d && d.dx);
  const dy = numero(d && d.dy);
  if (dx === null || dy === null || Math.abs(dx) > 100 || Math.abs(dy) > 100) return null;
  return { dx, dy };
}

/**
 * A graduação da peça (ver `motores/graduacao.js`), conferida e limpa. Regra
 * de nó que não existe, número absurdo, modo desconhecido e tamanho sem nome
 * saem; o que não confere é descartado, não gravado torto.
 */
function lerGraduacao(bruta, totalDeNos) {
  if (!bruta || typeof bruta !== "object") return null;
  const jeito = bruta.jeito === "pontos" || bruta.jeito === "porcentagem" ? bruta.jeito : null;
  if (!jeito) return null;
  const p = numero(bruta.porcentagem);
  const regras = [];
  const vistos = new Set();
  for (const r of Array.isArray(bruta.regras) ? bruta.regras : []) {
    const no = Math.floor(numero(r && r.no) ?? -1);
    if (no < 0 || no >= totalDeNos || vistos.has(no)) continue;
    if (r.modo === "igual") {
      const passo = lerDeslocamento(r.passo);
      if (!passo) continue;
      regras.push({ no, modo: "igual", passo });
    } else if (r.modo === "porTamanho") {
      const deslocamentos = {};
      for (const [tamanho, d] of Object.entries(r.deslocamentos || {})) {
        const nome = String(tamanho).trim();
        const valor = lerDeslocamento(d);
        if (nome && nome.length <= 20 && valor) deslocamentos[nome] = valor;
      }
      regras.push({ no, modo: "porTamanho", deslocamentos });
    } else {
      continue;
    }
    vistos.add(no);
  }
  return {
    jeito,
    regras,
    porcentagem: p !== null && p >= -50 && p <= 50 ? p : 0,
    perdidos: Math.max(0, Math.floor(numero(bruta.perdidos) || 0)),
  };
}
```

Em `arrumarPeca`, depois de `const marcacoes = …`: `const graduacao = nos ? lerGraduacao(bruta.graduacao, nos.length) : null;` e, no objeto devolvido, depois de `marcacoes: …`: `graduacao: graduacao ? JSON.stringify(graduacao) : null,`. Em `pecaDoBanco`, depois de `marcacoes: …`: `graduacao: linha.graduacao ? JSON.parse(linha.graduacao) : null,`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:moldes-pecas`
Expected: `OK — o servidor guarda nós e marcações sem inventar nem perder.`

- [ ] **Step 5: Banco, API e tipos**

- `servidor/db.js`, depois de `garantirColuna("molde_pecas", "grupo", "INTEGER");`: `garantirColuna("molde_pecas", "graduacao", "TEXT");` com o comentário "A graduação da peça (docs/superpowers/specs/2026-09-29-graduacao-design.md), só na linha do tamanho base."
- `servidor/moldes-api.js` (arquivo com CRLF — editar normalizando e devolvendo CRLF, ou pela ferramenta de edição): nos DOIS `INSERT INTO molde_pecas`, acrescentar `, graduacao` ao fim da lista de colunas e `, @graduacao` ao fim dos `VALUES`.
- `src/api/moldes.ts`, antes de `PecaDoMolde`:

```ts
/** Quanto um ponto anda, em cm (x para a direita, y para baixo). */
export interface Deslocamento { dx: number; dy: number }

/** A regra de um nó. Ver `motores/graduacao.js`. */
export type RegraDeGraduacao =
  | { no: number; modo: "igual"; passo: Deslocamento }
  | { no: number; modo: "porTamanho"; deslocamentos: Record<string, Deslocamento> };

/** A graduação de uma peça, guardada na linha do tamanho base. */
export interface Graduacao {
  jeito: "pontos" | "porcentagem";
  regras: RegraDeGraduacao[];
  /** % por tamanho, no jeito "porcentagem". */
  porcentagem: number;
  /** Regras perdidas quando nós do base foram apagados (a tela avisa). */
  perdidos?: number;
}
```

e, em `PecaDoMolde`, depois de `grupo?: number | null;`: `/** Só na linha do base: a regra que gera os outros tamanhos. */ graduacao?: Graduacao | null;`.

- [ ] **Step 6: O passo a passo antigo carrega a graduação**

- `src/telas/moldes/vocabulario.ts`, em `ParteEmEdicao`, depois de `grupo?: number | null;`:

```ts
  /**
   * A graduação da peça no molde guardado. O passo a passo não a edita, só a
   * devolve — e trocar o arquivo a descarta: ela é presa aos nós.
   */
  graduacao?: import("../../api/moldes").Graduacao | null;
```

- `src/telas/moldes/EditorDeMolde.tsx`: na carga, depois de `grupo: peca.grupo ?? null,` → `graduacao: peca.graduacao ?? null,`; em `comDesenho`, depois de `grupo: parte.grupo ?? null,` → `// Os nós mudaram: a graduação, presa a eles, não vale mais.` e `graduacao: null,`; na gravação, depois de `grupo: p.grupo ?? null,` → `graduacao: p.graduacao ?? null,`.

- [ ] **Step 7: Conferir**

Run: `npm run tipos && npm run bancada:moldes-pecas`
Expected: sem erro; OK.

Com o servidor de teste: `POST` de um molde com uma peça com `nos` e `graduacao`, `GET` devolve a graduação limpa; `PUT` pelo passo a passo antigo (no navegador: "Editar" → mudar uma quantidade → salvar) e o `GET` ainda traz a graduação.

- [ ] **Step 8: Commit**

```bash
git add servidor src/api/moldes.ts src/telas/moldes bancada/conferir-moldes-pecas.cjs dist
git commit -m "O servidor guarda a graduação da peça, e o passo a passo antigo a carrega

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Rodar `npm run front` antes do commit, e `git checkout -- estatico/icones.svg` se ele sair só com diferença de quebra de linha.)

---

### Task 4: Inserir e apagar nó levam as regras junto

**Files:**
- Modify: `src/motores/montagem.js` (`inserirNoNaPeca`, `apagarNoDaPeca`, import)
- Modify: `bancada/conferir-montagem.mjs`

**Interfaces:**
- Consumes: `graduacaoAoInserirNo`, `graduacaoAoApagarNo` (Task 1).

- [ ] **Step 1: O caso que falha**

Antes do `console.log` final de `bancada/conferir-montagem.mjs`:

```js
// Graduação presa aos nós: inserir e apagar nó levam as regras junto.
{
  const p = { ...pecaQuadrada(), graduacao: { jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }, { no: 2, modo: "igual", passo: { dx: 1, dy: 1 } }] } };
  const inserida = m.inserirNoNaPeca(p, 0, 0.5);
  assert.deepEqual(inserida.graduacao.regras.map((r) => r.no), [2, 3], "o nó novo entrou antes das regras");
  const apagada = m.apagarNoDaPeca(p, 1);
  assert.deepEqual(apagada.graduacao.regras.map((r) => r.no), [1]);
  assert.equal(apagada.graduacao.perdidos, 1);
  assert.equal(m.inserirNoNaPeca(pecaQuadrada(), 0, 0.5).graduacao, undefined, "peça sem graduação continua sem");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:montagem`
Expected: FAIL (`Cannot read properties of undefined (reading 'regras')`).

- [ ] **Step 3: Remapear**

Em `src/motores/montagem.js`: `import { graduacaoAoApagarNo, graduacaoAoInserirNo } from "./graduacao";` junto dos imports. No `return` de `inserirNoNaPeca`:

```js
  return {
    ...peca,
    nos,
    marcacoes: { ...peca.marcacoes, piques },
    // A regra da graduação é presa ao nó, como o pique ao trecho.
    ...(peca.graduacao ? { graduacao: graduacaoAoInserirNo(peca.graduacao, i) } : {}),
  };
```

e no de `apagarNoDaPeca`, o mesmo com `graduacaoAoApagarNo(peca.graduacao, i)`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:montagem && npm run bancada:graduacao`
Expected: as duas OK.

- [ ] **Step 5: Commit**

```bash
git add src/motores/montagem.js bancada/conferir-montagem.mjs
git commit -m "Pôr e apagar nó no base levam as regras da graduação junto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: A grade guarda os tamanhos declarados, e o desfazer leva peças e grade juntas

Muda uma decisão da revisão da importação (o filtro "a grade não guarda tamanho que nenhuma peça tem"): é preciso declarar P, G e GG antes de graduar. O problema que o filtro resolvia (chip sobrando depois de desfazer uma junção) passa a ser resolvido pelo desfazer, que guarda a grade junto.

**Files:**
- Modify: `src/motores/tamanhos.js` (`tamanhosDoMolde` e operações novas)
- Modify: `bancada/conferir-tamanhos.mjs` (caso 10 muda; casos 11–14)
- Modify: `src/telas/montagem/useMoldeEmMontagem.ts` (pilha do desfazer)
- Modify: `src/telas/montagem/ListaDePecas.tsx` (o "juntar como tamanho")

**Interfaces:**
- Consumes: `graduacaoRenomearTamanho`, `graduacaoTirarTamanho` (Task 1).
- Produces (em `src/motores/tamanhos.js`, todas puras):
  - `acrescentarTamanho(grade, nome, cor?) → { grade } | { erro }`
  - `renomearTamanho(pecas, grade, velho, novo) → { pecas, grade } | { erro }`
  - `tirarTamanho(pecas, grade, nome) → { pecas, grade } | { erro }`
  - `moverTamanho(grade, nome, rumo: -1 | 1) → grade`
  - `marcarBase(grade, nome) → grade`, `trocarCor(grade, nome, cor) → grade`
  - Nome repetido é comparado sem ligar para maiúscula.

- [ ] **Step 1: Os casos que falham**

Em `bancada/conferir-tamanhos.mjs`, trocar o caso 10 inteiro por:

```js
// 10. A grade guarda o tamanho declarado, mesmo sem peça: é preciso declarar P, G e GG antes de graduar.
{
  const r = t.tamanhosDoMolde([peca("M", "A")], [{ nome: "M", cor: "#ff0000", ordem: 0, base: true }, { nome: "G", cor: "#00ff00", ordem: 1, base: false }]);
  assert.deepEqual(r.map((x) => x.nome), ["M", "G"]);
  assert.equal(r[1].cor, "#00ff00");
}
```

e acrescentar, antes do `console.log` final:

```js
// 11. Acrescentar: no fim, com cor livre; nome repetido (sem ligar para maiúscula) recusa.
{
  const grade = t.tamanhosDoMolde([peca("M", "A")], [{ nome: "M", cor: "#ff0000", ordem: 0, base: true }]);
  const r = t.acrescentarTamanho(grade, "GG");
  assert.deepEqual(r.grade.map((x) => x.nome), ["M", "GG"]);
  assert.ok(r.grade[1].cor !== "#ff0000", "cor livre");
  assert.ok(t.acrescentarTamanho(grade, "m").erro);
}

// 12. O "base" do Digitalizar vira M, e o G vira XG: grade, peças e chaves das regras juntas.
{
  const graduada = peca("base", "A", { graduacao: { jeito: "pontos", porcentagem: 0, regras: [
    { no: 0, modo: "porTamanho", deslocamentos: { G: { dx: 1, dy: 0 } } }] } });
  const pecas = [graduada, peca("G", "A")];
  let r = t.renomearTamanho(pecas, t.tamanhosDoMolde(pecas, []), "base", "M");
  assert.deepEqual(r.grade.map((x) => x.nome), ["M", "G"]);
  assert.equal(r.pecas[0].tamanho, "M");
  r = t.renomearTamanho(r.pecas, r.grade, "G", "XG");
  assert.equal(r.pecas[1].tamanho, "XG");
  assert.deepEqual(Object.keys(r.pecas[0].graduacao.regras[0].deslocamentos), ["XG"]);
  assert.ok(t.renomearTamanho(r.pecas, r.grade, "M", "xg").erro, "nome repetido, sem ligar para maiúscula");
}

// 13. Tirar: some da grade, das peças e das regras; o base não sai.
{
  const pecas = [peca("M", "A", { graduacao: { jeito: "pontos", porcentagem: 0, regras: [
    { no: 0, modo: "porTamanho", deslocamentos: { P: { dx: -1, dy: 0 }, G: { dx: 1, dy: 0 } } }] } }), peca("P", "A"), peca("G", "A")];
  const grade = t.marcarBase(t.tamanhosDoMolde(pecas, [
    { nome: "P", cor: "#00ff00", ordem: 0 }, { nome: "M", cor: "#ff0000", ordem: 1 }, { nome: "G", cor: "#00ffff", ordem: 2 }]), "M");
  const r = t.tirarTamanho(pecas, grade, "P");
  assert.deepEqual(r.grade.map((x) => `${x.nome}${x.ordem}`), ["M0", "G1"]);
  assert.deepEqual(r.pecas.map((p) => p.tamanho), ["M", "G"]);
  assert.deepEqual(Object.keys(r.pecas[0].graduacao.regras[0].deslocamentos), ["G"]);
  assert.ok(t.tirarTamanho(pecas, grade, "M").erro, "o base não sai");
}

// 14. Ordem, base e cor.
{
  const grade = t.tamanhosDoMolde([], [{ nome: "P", cor: "#00ff00", ordem: 0, base: false }, { nome: "M", cor: "#ff0000", ordem: 1, base: true }]);
  assert.deepEqual(t.moverTamanho(grade, "M", -1).map((x) => x.nome), ["M", "P"]);
  assert.deepEqual(t.moverTamanho(grade, "P", -1).map((x) => x.nome), ["P", "M"], "o primeiro não sobe");
  assert.deepEqual(t.marcarBase(grade, "P").map((x) => x.base), [true, false]);
  assert.equal(t.trocarCor(grade, "P", "#ABCDEF")[0].cor, "#abcdef");
  assert.equal(t.trocarCor(grade, "P", "azul")[0].cor, "#00ff00");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:tamanhos`
Expected: FAIL no caso 10 (`["M"]` em vez de `["M", "G"]`).

- [ ] **Step 3: O motor**

Em `src/motores/tamanhos.js`:

1. No topo, depois do comentário de cabeçalho: `import { graduacaoRenomearTamanho, graduacaoTirarTamanho } from "./graduacao";`
2. Em `tamanhosDoMolde`, tirar o filtro: apagar a linha `const nasPecas = …` e o comentário acima dela, e trocar `if (vistos.has(g.nome) || !nasPecas.has(g.nome)) continue;` por `if (vistos.has(g.nome)) continue;`. Comentário novo acima do laço: `// A grade guarda os tamanhos DECLARADOS, mesmo sem desenho: é preciso declarar P, G e GG antes de graduar. O chip de tamanho que sobraria de uma junção desfeita não sobra porque o desfazer guarda a grade junto (ver useMoldeEmMontagem).`
3. No fim do arquivo:

```js
// ---------------------------------------------------------------------------
// A GRADE (a janela "Grade" da Montagem)
// ---------------------------------------------------------------------------

const mesmoNome = (a, b) => String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
const emOrdem = (grade) => [...grade].sort((a, b) => a.ordem - b.ordem);
const refazerOrdem = (lista) => lista.map((t, ordem) => ({ ...t, ordem }));

/** Um tamanho novo no fim da grade — sem desenho ainda: é para graduar ou juntar. */
export function acrescentarTamanho(grade, nome, cor) {
  const limpo = String(nome || "").trim();
  if (!limpo) return { erro: "Dê o nome do tamanho." };
  if (grade.some((t) => mesmoNome(t.nome, limpo))) return { erro: `A grade já tem o tamanho ${limpo}.` };
  const usadas = new Set(grade.map((t) => t.cor));
  const corNova = cor || PALETA.find((c) => !usadas.has(c)) || PALETA[0];
  return { grade: refazerOrdem([...emOrdem(grade), { nome: limpo, cor: corNova, ordem: 0, base: grade.length === 0 }]) };
}

/** Renomeia na grade, nas peças e nas chaves das regras de graduação. */
export function renomearTamanho(pecas, grade, velho, novo) {
  const limpo = String(novo || "").trim();
  if (!limpo) return { erro: "O tamanho precisa de um nome." };
  if (limpo === velho) return { pecas, grade };
  if (grade.some((t) => t.nome !== velho && mesmoNome(t.nome, limpo))) return { erro: `A grade já tem o tamanho ${limpo}.` };
  return {
    grade: grade.map((t) => (t.nome === velho ? { ...t, nome: limpo } : t)),
    pecas: pecas.map((p) => {
      const q = p.tamanho === velho ? { ...p, tamanho: limpo } : p;
      return q.graduacao ? { ...q, graduacao: graduacaoRenomearTamanho(q.graduacao, velho, limpo) } : q;
    }),
  };
}

/**
 * Tira o tamanho da grade, as peças dele e os valores dele nas regras. O base
 * não sai (marque outro antes), nem o último tamanho.
 */
export function tirarTamanho(pecas, grade, nome) {
  const t = grade.find((x) => x.nome === nome);
  if (!t) return { pecas, grade };
  if (t.base) return { erro: "O base não pode sair: marque outro tamanho como base antes." };
  if (grade.length <= 1) return { erro: "A grade precisa de pelo menos um tamanho." };
  return {
    grade: refazerOrdem(emOrdem(grade).filter((x) => x.nome !== nome)),
    pecas: pecas
      .filter((p) => p.tamanho !== nome)
      .map((p) => (p.graduacao ? { ...p, graduacao: graduacaoTirarTamanho(p.graduacao, nome) } : p)),
  };
}

/** Sobe (−1) ou desce (+1) o tamanho na ordem da grade. */
export function moverTamanho(grade, nome, rumo) {
  const lista = emOrdem(grade);
  const i = lista.findIndex((t) => t.nome === nome);
  const j = i + rumo;
  if (i < 0 || j < 0 || j >= lista.length) return grade;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return refazerOrdem(lista);
}

export function marcarBase(grade, nome) {
  return grade.map((t) => ({ ...t, base: t.nome === nome }));
}

export function trocarCor(grade, nome, cor) {
  if (!/^#[0-9a-f]{6}$/i.test(String(cor))) return grade;
  return grade.map((t) => (t.nome === nome ? { ...t, cor: cor.toLowerCase() } : t));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:tamanhos && npm run bancada:graduacao`
Expected: as duas OK.

- [ ] **Step 5: O desfazer leva peças e grade**

Em `src/telas/montagem/useMoldeEmMontagem.ts`:

```ts
  const [pilha, setPilha] = useState<{ pecas: PecaEmMontagem[]; tamanhos: TamanhoDoMolde[] }[]>([]);
```

```ts
  // Peças E grade: desfazer uma junção tira também o tamanho que ela criou.
  const lembrar = useCallback(() => {
    setPilha((p) => [...p.slice(-(PASSOS_DE_DESFAZER - 1)), { pecas: atual.current.pecas, tamanhos: atual.current.tamanhos }]);
  }, []);

  const desfazer = useCallback(() => {
    setPilha((p) => {
      if (p.length === 0) return p;
      const topo = p[p.length - 1]!;
      setPecas(topo.pecas);
      setTamanhos(topo.tamanhos);
      marcarMexida();
      return p.slice(0, -1);
    });
  }, []);
```

E o comentário acima de `tamanhosDasPecas` passa a dizer: "A grade que a tela vê: a guardada (tamanhos declarados, mesmo sem desenho) mais os tamanhos que só existem nas peças, com as cores guardadas."

- [ ] **Step 6: O "juntar como tamanho" olha as peças**

Em `src/telas/montagem/ListaDePecas.tsx`:

1. Trocar a checagem do tamanho repetido por:

```ts
      // Um tamanho declarado na grade e ainda vazio pode ser preenchido pela
      // junção; o que já tem desenho, não.
      if (molde.pecas.some((p) => p.tamanho.toUpperCase() === tamanhoNovo)) {
        setErroDeJuntar(`Este molde já tem desenho no tamanho ${tamanhoNovo}.`);
        return;
      }
```

2. Logo depois, usar o nome como a grade o escreve: `const tamanhoDaGrade = molde.tamanhos.find((t) => t.nome.toUpperCase() === tamanhoNovo)?.nome ?? tamanhoNovo;` e passar `tamanhoDaGrade` (em vez de `tamanhoNovo`) ao `setCasamento`.
3. Em `confirmarCasamento`, não duplicar o tamanho declarado:

```ts
    molde.mudarTamanhos((t) => (t.some((x) => x.nome === tamanho) ? t : [...t, { nome: tamanho, cor, ordem: t.length, base: false }]));
```

- [ ] **Step 7: Tipos, build e navegador**

Run: `npm run tipos && npm run front`
Expected: sem erro.

No navegador (servidor de teste): num molde de um tamanho, juntar outro molde "como um tamanho novo" (GG) → o chip GG aparece; Ctrl+Z → o chip GG **some** e as peças do GG também; F5 → continua sem GG.

- [ ] **Step 8: Commit**

```bash
git add src/motores/tamanhos.js bancada/conferir-tamanhos.mjs src/telas/montagem dist
git commit -m "A grade guarda os tamanhos declarados, e o desfazer leva peças e grade juntas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: A janela da Grade, os chips "sem desenho" e as camadas alinhadas

**Files:**
- Modify: `src/telas/montagem/ChipsDeTamanho.tsx` (reescrito)
- Create: `src/telas/montagem/JanelaDaGrade.tsx`
- Modify: `src/telas/montagem/MesaDeMontagem.tsx`

**Interfaces:**
- Consumes: operações da grade (Task 5); `alinhamentoDaCamada`, `transladarNos` (Task 2); `molde.lembrar`, `molde.mudarPecas`, `molde.mudarTamanhos`.
- Produces: `ChipsDeTamanho({ tamanhos, ativo, comDesenho: ReadonlySet<string>, aoEscolher, verTamanhos, aoVerTamanhos, aoAbrirGrade })`; `JanelaDaGrade({ molde, aoFechar })`; na `MesaDeMontagem`, as variáveis `escolhido`, `baseDaGrade`, `semDesenho`, `tamanhoMostrado`, `baseDoGrupo` (usadas pelas Tasks 7 e 8).

- [ ] **Step 1: Os chips**

`src/telas/montagem/ChipsDeTamanho.tsx` inteiro:

```tsx
/**
 * Os tamanhos da grade, cada um na cor em que a Audaces o desenha. O marcado
 * é o que se edita; tracejado é tamanho que a peça ainda não tem (graduar ou
 * juntar). "Ver tamanhos" sobrepõe os outros na mesa; "Grade" abre a janela
 * dos tamanhos. A barra aparece sempre — é daqui que um molde de um tamanho
 * só (o "base" do Digitalizar) ganha P, M, G.
 */
import { Icone } from "../../casca/Icone";
import type { TamanhoDoMolde } from "../../api/moldes";

interface Props {
  tamanhos: TamanhoDoMolde[];
  ativo: string;
  /** Os tamanhos que a peça mostrada tem desenhados; os outros saem tracejados. */
  comDesenho: ReadonlySet<string>;
  aoEscolher: (nome: string) => void;
  verTamanhos: boolean;
  aoVerTamanhos: (ver: boolean) => void;
  aoAbrirGrade: () => void;
}

export function ChipsDeTamanho({ tamanhos, ativo, comDesenho, aoEscolher, verTamanhos, aoVerTamanhos, aoAbrirGrade }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-linha px-3 py-1.5 text-[0.82rem]">
      <span className="text-tinta-fraca">Tamanho</span>
      {tamanhos.map((t) => {
        const tem = comDesenho.has(t.nome);
        return (
          <button
            key={t.nome}
            type="button"
            onClick={() => aoEscolher(t.nome)}
            aria-pressed={t.nome === ativo}
            title={`${t.nome}${t.base ? " (base)" : ""}${tem ? "" : " — sem desenho nesta peça"}`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
              t.nome === ativo ? "border-ambar bg-[var(--accent-soft)] font-semibold" : "border-linha"
            } ${tem ? "" : "border-dashed text-tinta-fraca"}`}
          >
            <span className="size-2.5 rounded-full" style={{ background: t.cor }} />
            {t.nome}{t.base ? " ·" : ""}
          </button>
        );
      })}
      <button type="button" className="btn secondary btn-sm" onClick={aoAbrirGrade} title="Tamanhos, cores, ordem e base">
        <Icone referencia="icones.svg#layout-grid" className="size-4" />
        Grade
      </button>
      <label className="ml-auto flex items-center gap-1.5">
        <input type="checkbox" checked={verTamanhos} onChange={(e) => aoVerTamanhos(e.target.checked)} />
        Ver tamanhos
      </label>
    </div>
  );
}
```

- [ ] **Step 2: A janela da Grade**

`src/telas/montagem/JanelaDaGrade.tsx`:

```tsx
/**
 * A GRADE DE TAMANHOS — nome, cor, ordem e qual é o base.
 *
 * Renomear, tirar, acrescentar, a ordem e o base são um passo do desfazer
 * cada (peças e grade juntas: renomear e tirar mexem nas peças também). A cor
 * não entra no desfazer: arrastar o seletor de cor faria dezenas de passos.
 * Tirar um tamanho com desenho pergunta antes.
 */
import { useState } from "react";
import { useDialogo } from "../../casca/Dialogo";
import {
  acrescentarTamanho, marcarBase, moverTamanho, renomearTamanho, tirarTamanho, trocarCor,
} from "../../motores/tamanhos";
import type { TamanhoDoMolde } from "../../api/moldes";
import type { MoldeEmMontagem, PecaEmMontagem } from "./useMoldeEmMontagem";

interface Props { molde: MoldeEmMontagem; aoFechar: () => void }

type Mudanca = { grade: TamanhoDoMolde[]; pecas?: PecaEmMontagem[] } | { erro: string };

export function JanelaDaGrade({ molde, aoFechar }: Props) {
  const dialogo = useDialogo();
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState("");
  // O nome sendo digitado, por tamanho; vale no blur ou no Enter.
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const grade = [...molde.tamanhos].sort((a, b) => a.ordem - b.ordem);

  const aplicar = (r: Mudanca) => {
    if ("erro" in r) { setErro(r.erro); return; }
    setErro("");
    molde.lembrar();
    if (r.pecas) {
      const pecas = r.pecas;
      molde.mudarPecas(() => pecas, false);
    }
    molde.mudarTamanhos(() => r.grade);
  };

  const renomear = (velho: string) => {
    const digitado = (nomes[velho] ?? velho).trim();
    setNomes((n) => {
      const { [velho]: _fora, ...resto } = n;
      return resto;
    });
    if (digitado !== velho) aplicar(renomearTamanho(molde.pecas, molde.tamanhos, velho, digitado));
  };

  const acrescentar = () => {
    const r = acrescentarTamanho(molde.tamanhos, novo.trim().toUpperCase());
    if (!r.erro) setNovo("");
    aplicar(r);
  };

  const tirar = async (nome: string) => {
    const dele = molde.pecas.filter((p) => p.tamanho === nome);
    if (dele.length > 0) {
      const graduacoes = dele.filter((p) => p.graduacao).length;
      const seguir = await dialogo.confirmar(
        `As ${dele.length} peça(s) do tamanho ${nome} somem`
        + (graduacoes > 0 ? `, e com elas a graduação de ${graduacoes} peça(s) que partia desse tamanho` : "")
        + ". Tirar mesmo assim?",
      );
      if (!seguir) return;
    }
    aplicar(tirarTamanho(molde.pecas, molde.tamanhos, nome));
  };

  return (
    <div className="modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Grade de tamanhos">
        <header className="modal-topo">
          <h3>Grade de tamanhos</h3>
          <button type="button" className="btn-x" title="Fechar" onClick={aoFechar}>×</button>
        </header>
        <div className="modal-corpo">
          <p className="hint">
            O base é o tamanho desenhado na mesa; a graduação gera os outros a partir dele. A ordem é a
            dos saltos (P → M → G).
          </p>
          <table className="w-full text-[0.85rem]">
            <thead>
              <tr><th className="text-left">Tamanho</th><th>Cor</th><th>Base</th><th>Ordem</th><th /></tr>
            </thead>
            <tbody>
              {grade.map((t, i) => {
                const quantas = molde.pecas.filter((p) => p.tamanho === t.nome).length;
                return (
                  <tr key={t.nome}>
                    <td className="py-1 pr-2">
                      <input
                        type="text" value={nomes[t.nome] ?? t.nome} className="w-24!"
                        aria-label={`Nome do tamanho ${t.nome}`}
                        onChange={(e) => setNomes((n) => ({ ...n, [t.nome]: e.target.value }))}
                        onBlur={() => renomear(t.nome)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                      <span className="ml-2 text-tinta-fraca">{quantas > 0 ? `${quantas} peça(s)` : "sem desenho"}</span>
                    </td>
                    <td className="text-center">
                      <input
                        type="color" value={t.cor} className="h-7 w-9 p-0" aria-label={`Cor do tamanho ${t.nome}`}
                        onChange={(e) => molde.mudarTamanhos(() => trocarCor(molde.tamanhos, t.nome, e.target.value))}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="radio" name="base-da-grade" checked={t.base} aria-label={`${t.nome} é o base`}
                        onChange={() => aplicar({ grade: marcarBase(molde.tamanhos, t.nome) })}
                      />
                    </td>
                    <td className="whitespace-nowrap text-center">
                      <button type="button" className="btn secondary btn-sm" disabled={i === 0} title="Subir"
                        onClick={() => aplicar({ grade: moverTamanho(molde.tamanhos, t.nome, -1) })}>↑</button>
                      <button type="button" className="btn secondary btn-sm" disabled={i === grade.length - 1} title="Descer"
                        onClick={() => aplicar({ grade: moverTamanho(molde.tamanhos, t.nome, 1) })}>↓</button>
                    </td>
                    <td className="text-right">
                      <button
                        type="button" className="btn ghost-danger btn-sm" disabled={t.base}
                        title={t.base ? "O base não sai: marque outro tamanho como base antes" : "Tirar o tamanho"}
                        onClick={() => void tirar(t.nome)}
                      >
                        Tirar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text" value={novo} placeholder="GG" className="w-24!" aria-label="Nome do tamanho novo"
              onChange={(e) => { setNovo(e.target.value); setErro(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") acrescentar(); }}
            />
            <button type="button" className="btn secondary btn-sm" onClick={acrescentar}>+ tamanho</button>
          </div>
          {erro && <p className="text-[0.82rem] text-[#ff4d4d]">{erro}</p>}
        </div>
        <footer className="modal-rodape">
          <button type="button" className="btn primary" onClick={aoFechar}>Pronto</button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: A MesaDeMontagem escolhe, avisa e alinha**

Em `src/telas/montagem/MesaDeMontagem.tsx`:

1. Imports: `import { JanelaDaGrade } from "./JanelaDaGrade";` e `import { alinhamentoDaCamada, transladarNos } from "../../motores/graduacao";`.
2. Estado: `const [gradeAberta, setGradeAberta] = useState(false);`.
3. Trocar o cálculo de `tamanhoValido`/`atual` por:

```ts
  // O tamanho que a pessoa escolheu no chip ("" = ainda não escolheu).
  const escolhido = molde.tamanhos.some((t) => t.nome === tamanhoAtivo) ? tamanhoAtivo : "";
  const baseDaGrade = molde.tamanhos.find((t) => t.base)?.nome ?? molde.tamanhos[0]?.nome ?? "";
  const doGrupo = grupos.find((g) => g.grupo === grupo) ?? grupos[0];
  // Escolheu um tamanho que a peça não tem: a mesa AVISA, em vez de mostrar
  // outro tamanho no lugar — editar ali mexeria no tamanho errado.
  const semDesenho = !!escolhido && !!doGrupo && doGrupo.porTamanho[escolhido] === undefined;
  const tamanhoMostrado = escolhido && !semDesenho ? escolhido : baseDaGrade;

  // Um só índice (na lista plana de peças), usado em TUDO (peça mostrada,
  // `mudarEsta`, a Mesa). Sem escolha, o base; se o grupo não tem o base, o
  // primeiro tamanho que ele tem.
  const atual = doGrupo ? (doGrupo.porTamanho[tamanhoMostrado] ?? Object.values(doGrupo.porTamanho)[0] ?? 0) : 0;
  const peca = molde.pecas[atual];
  // A linha graduada do grupo (a que guarda a regra): é por ela que as camadas se alinham.
  const baseDoGrupo = doGrupo
    ? Object.values(doGrupo.porTamanho).map((i) => molde.pecas[i]).find((p) => p?.graduacao) ?? null
    : null;
```

(apagar a linha antiga `const doGrupo = …`, que ficava junto de `tamanhoValido`). Onde `tamanhoValido` era usado, usar `tamanhoMostrado`.

4. As camadas do "Ver tamanhos" alinhadas:

```ts
  const camadas = useMemo(() => (verTamanhos && doGrupo && peca
    ? Object.entries(doGrupo.porTamanho)
      .filter(([t]) => t !== peca.tamanho)
      .map(([t, i]) => {
        const outra = molde.pecas[i]!;
        const d = alinhamentoDaCamada(peca, outra, baseDoGrupo, molde.tamanhos);
        return { nos: transladarNos(outra.nos, d), cor: molde.tamanhos.find((x) => x.nome === t)?.cor ?? "#888888" };
      })
    : []), [verTamanhos, doGrupo, peca, baseDoGrupo, molde.pecas, molde.tamanhos]);
```

5. Os chips sempre, com o que a peça tem e o botão da Grade (sem o `molde.tamanhos.length > 1 &&`):

```tsx
      <ChipsDeTamanho
        tamanhos={molde.tamanhos}
        ativo={escolhido || peca?.tamanho || baseDaGrade}
        comDesenho={new Set(Object.keys(doGrupo?.porTamanho ?? {}))}
        aoEscolher={setTamanhoAtivo}
        verTamanhos={verTamanhos}
        aoVerTamanhos={setVerTamanhos}
        aoAbrirGrade={() => setGradeAberta(true)}
      />
      {gradeAberta && <JanelaDaGrade molde={molde} aoFechar={() => setGradeAberta(false)} />}
```

6. No lugar da `<Mesa …/>`, com `semDesenho`:

```tsx
          {semDesenho ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-tinta-fraca">
              <p className="m-0">Esta peça ainda não tem o tamanho {escolhido}.</p>
              <p className="m-0">Gradue a partir do base (ferramenta Graduar) ou junte um molde como {escolhido}.</p>
              <button type="button" className="btn secondary btn-sm" onClick={() => setTamanhoAtivo("")}>Ver o base</button>
            </div>
          ) : (
            <Mesa … (como está) … />
          )}
```

e o painel só quando há desenho: `{peca && !semDesenho && <PainelDaPeca … />}`. A `BarraDaMontagem` recebe `tamanhoAtivo={tamanhoMostrado}`.

- [ ] **Step 4: Tipos e build**

Run: `npm run tipos && npm run front`
Expected: sem erro.

- [ ] **Step 5: No navegador**

Com o servidor de teste, um molde saído do Digitalizar (um tamanho, "base"):
- a barra dos chips aparece com "base" e o botão **Grade**;
- Grade → renomear "base" para **M** → chip "M", e o `GET` do molde traz as peças em "M";
- "+ tamanho" P, G, GG; ↑ no P até ficar antes do M → chips P, M, G, GG, com P/G/GG **tracejados**;
- clicar G → a mesa mostra "Esta peça ainda não tem o tamanho G"; "Ver o base" volta;
- trocar a cor do G; tirar o GG; Ctrl+Z → o GG volta; F5 → P, M, G continuam na grade, mesmo sem desenho;
- num molde com dois tamanhos juntados (o pijama M + G), "Ver tamanhos" mostra o G centrado sobre o M (sem graduação, o alinhamento é pelos centros), e não encostado no canto.

- [ ] **Step 6: Commit**

```bash
git add src/telas/montagem dist
git commit -m "A Montagem ganha a janela da Grade, os chips sem desenho e as camadas alinhadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: A ferramenta Graduar

**Files:**
- Modify: `src/telas/risco/desenhoDeNos.ts` (`desenharPontosDeGraduacao`)
- Modify: `src/telas/montagem/Mesa.tsx`
- Create: `src/telas/montagem/BlocoDaGraduacao.tsx`
- Modify: `src/telas/montagem/MesaDeMontagem.tsx`

**Interfaces:**
- Consumes: Tasks 1–2 (`graduacaoVazia`, `lerMedida`, `passosDaRegra`, `mudarPasso`, `trocarModo`, `comRegra`, `avisosDaGraduacao`, `gerarTamanho`); da Task 6, `escolhido`, `baseDaGrade`, `semDesenho`, `doGrupo`.
- Produces: `Ferramenta` ganha `"graduar"`; `Mesa` ganha as props `regras?: readonly number[]` e `camadas[].tracejada?: boolean`; `BlocoDaGraduacao({ base, baseDaGrade, grade, noDaRegra, aoMudarGraduacao })`; na `MesaDeMontagem`, `iDaBase`, `pecaDaBase` e `mudarGraduacao` (a Task 8 usa).

- [ ] **Step 1: O losango do ponto de graduação**

No fim de `src/telas/risco/desenhoDeNos.ts`:

```ts
/**
 * Os pontos de graduação (nós com regra) ganham um losango amarelo; o nó cuja
 * regra está aberta no bloco ganha um anel. Desenhado por cima dos nós.
 */
export function desenharPontosDeGraduacao(
  ctx: CanvasRenderingContext2D, nos: No[], comRegra: readonly number[], marcado: number | null, emTela: (p: Ponto) => Ponto,
) {
  for (const i of comRegra) {
    const n = nos[i];
    if (!n) continue;
    const c = emTela(n);
    const r = 7;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - r);
    ctx.lineTo(c.x + r, c.y);
    ctx.lineTo(c.x, c.y + r);
    ctx.lineTo(c.x - r, c.y);
    ctx.closePath();
    ctx.fillStyle = "#f5c518";
    ctx.fill();
    ctx.strokeStyle = "rgba(10, 14, 16, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (marcado !== null && nos[marcado]) {
    const c = emTela(nos[marcado]!);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
    ctx.strokeStyle = "#ff7a1a";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}
```

- [ ] **Step 2: A Mesa**

Em `src/telas/montagem/Mesa.tsx`:

1. `export type Ferramenta = "nos" | "pique" | "ponto" | "fio" | "graduar";`
2. Import: `import { desenharNos, desenharPontosDeGraduacao, tracarCaminho, type Ponto } from "../risco/desenhoDeNos";`
3. Props:

```ts
  /** Os outros tamanhos da peça, desenhados por baixo, cada um na sua cor; `tracejada` na prévia da graduação. */
  camadas?: { nos: PecaEmMontagem["nos"]; cor: string; tracejada?: boolean }[];
  /** Na ferramenta Graduar: os nós que têm regra (ganham o losango). */
  regras?: readonly number[];
```

(no lugar da prop `camadas` de hoje) e, junto de `const camadas = useMemo(…)`: `const regras = useMemo(() => props.regras ?? [], [props.regras]);`.
4. No laço que desenha as camadas: `ctx.setLineDash(k.tracejada ? [6, 4] : []);` antes do `ctx.stroke()` e `ctx.setLineDash([]);` depois dele.
5. Depois de `if (ferramenta === "nos") desenharNos(ctx, peca.nos, noAtivoValido, emTela);`:

```ts
    if (ferramenta === "graduar") {
      desenharNos(ctx, peca.nos, null, emTela);
      desenharPontosDeGraduacao(ctx, peca.nos, regras, noAtivoValido, emTela);
    }
```

e acrescentar `regras` às dependências do efeito de desenho.
6. Em `aoApertar`, antes do ramo final do fio (`} else {` seguido de `const f = peca.marcacoes.fio;`):

```ts
    } else if (ferramenta === "graduar") {
      // Clicar num nó abre a regra dele no bloco da graduação. Nada se arrasta.
      const sob = pegaSob(peca.nos, alvo, raio, null);
      props.aoMarcarNo(sob ? sob.no : null);
      return;
```

- [ ] **Step 3: O bloco da graduação**

`src/telas/montagem/BlocoDaGraduacao.tsx`:

```tsx
/**
 * O BLOCO DA GRADUAÇÃO — no lugar do painel da peça, com a ferramenta Graduar.
 *
 * Trabalha no base da peça. Por pontos: clicar num nó abre a regra dele —
 * salto igual (um valor por salto) ou por tamanho (um valor para cada salto:
 * P→M, M→G…). Por porcentagem: a peça inteira cresce X% por tamanho. Ver
 * `motores/graduacao.js`.
 *
 * Os campos são texto, e não `<input type=number>`: é preciso aceitar vírgula
 * e sinal de menos (andar para a esquerda ou para cima), e o campo numérico
 * do navegador em português engole os dois. Valem no blur ou no Enter.
 */
import { useState } from "react";
import { useDialogo } from "../../casca/Dialogo";
import type { Deslocamento, Graduacao, RegraDeGraduacao, TamanhoDoMolde } from "../../api/moldes";
import {
  avisosDaGraduacao, comRegra, graduacaoVazia, lerMedida, mudarPasso, passosDaRegra, trocarModo,
} from "../../motores/graduacao";
import type { PecaEmMontagem } from "./useMoldeEmMontagem";

interface Props {
  /** A peça no tamanho base (a linha que guarda a graduação); `null` quando ela não tem desenho no base. */
  base: PecaEmMontagem | null;
  baseDaGrade: string;
  grade: TamanhoDoMolde[];
  /** O nó clicado na mesa (a regra aberta). */
  noDaRegra: number | null;
  aoMudarGraduacao: (mudar: (g: Graduacao) => Graduacao, lembrarAntes: boolean) => void;
}

function CampoDeMedida({ valor, rotulo, aoMudar }: { valor: number; rotulo: string; aoMudar: (v: number) => void }) {
  // `null` = mostrando o valor guardado; texto = a pessoa está digitando.
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? String(Number(valor.toFixed(3))).replace(".", ",");
  const confirmar = () => {
    if (texto === null) return;
    const v = lerMedida(texto);
    if (v !== null && v !== valor) aoMudar(v);
    setTexto(null);
  };
  return (
    <input
      type="text" inputMode="decimal" value={mostrado} aria-label={rotulo} aria-invalid={lerMedida(mostrado) === null}
      className="w-20!" onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function BlocoDaGraduacao({ base, baseDaGrade, grade, noDaRegra, aoMudarGraduacao }: Props) {
  const dialogo = useDialogo();

  if (!base) {
    return (
      <aside className="flex h-full w-[260px] shrink-0 flex-col gap-2 overflow-auto border-l border-linha p-3 text-[0.85rem]">
        <p className="m-0 font-semibold">Graduação</p>
        <p className="m-0 text-tinta-fraca">
          Esta peça não tem desenho no {baseDaGrade}. Escolha outro base na Grade ou junte o {baseDaGrade}.
        </p>
      </aside>
    );
  }

  const g: Graduacao = base.graduacao ?? graduacaoVazia();
  const noBase = base.tamanho;
  const regra: RegraDeGraduacao | null = noDaRegra === null ? null : g.regras.find((r) => r.no === noDaRegra) ?? null;
  const avisos: string[] = avisosDaGraduacao({ ...base, graduacao: g }, grade);

  const porRegra = (nova: RegraDeGraduacao | null) => {
    if (noDaRegra === null) return;
    aoMudarGraduacao((gg) => comRegra(gg, noDaRegra, nova), true);
  };

  const trocarModoDaRegra = async (modo: "igual" | "porTamanho") => {
    if (noDaRegra === null) return;
    if (!regra) {
      porRegra(modo === "igual"
        ? { no: noDaRegra, modo, passo: { dx: 0, dy: 0 } }
        : { no: noDaRegra, modo, deslocamentos: {} });
      return;
    }
    const r = trocarModo(regra, grade, noBase, modo);
    if (r.perdeu && !(await dialogo.confirmar(
      `Os saltos deste ponto são diferentes. No salto igual fica um só: o do ${noBase} para o tamanho seguinte. Trocar?`,
    ))) return;
    porRegra(r.regra);
  };

  const passoIgual: Deslocamento = regra?.modo === "igual" ? regra.passo : { dx: 0, dy: 0 };
  const regraPorTamanho: RegraDeGraduacao = regra?.modo === "porTamanho"
    ? regra
    : { no: noDaRegra ?? 0, modo: "porTamanho", deslocamentos: {} };
  const modoAberto = regra?.modo ?? "igual";

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col gap-3 overflow-auto border-l border-linha p-3 text-[0.85rem]">
      <div>
        <p className="m-0 font-semibold">Graduação</p>
        <p className="m-0 text-tinta-fraca">Trabalha no {noBase} (o base); os outros tamanhos aparecem tracejados.</p>
      </div>

      <fieldset className="flex gap-3 border-0 p-0">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="jeito" checked={g.jeito === "pontos"}
            onChange={() => aoMudarGraduacao((gg) => ({ ...gg, jeito: "pontos" }), true)} />
          Por pontos
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="jeito" checked={g.jeito === "porcentagem"}
            onChange={() => aoMudarGraduacao((gg) => ({ ...gg, jeito: "porcentagem" }), true)} />
          Porcentagem
        </label>
      </fieldset>

      {g.jeito === "porcentagem" ? (
        <label className="flex items-center gap-2">
          <CampoDeMedida valor={g.porcentagem} rotulo="Porcentagem por tamanho"
            aoMudar={(v) => aoMudarGraduacao((gg) => ({ ...gg, porcentagem: Math.max(-50, Math.min(50, v)) }), true)} />
          % por tamanho (a peça inteira)
        </label>
      ) : noDaRegra === null ? (
        <p className="m-0 text-tinta-fraca">
          Clique num nó da peça para ver ou pôr a regra dele. {g.regras.length} ponto(s) com regra.
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-[8px] border border-linha p-2">
          <p className="m-0 font-semibold">Ponto {noDaRegra + 1}{regra ? "" : " (sem regra)"}</p>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="modo" checked={modoAberto === "igual"} onChange={() => void trocarModoDaRegra("igual")} />
              Salto igual
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="modo" checked={modoAberto === "porTamanho"} onChange={() => void trocarModoDaRegra("porTamanho")} />
              Por tamanho
            </label>
          </div>
          {modoAberto === "igual" ? (
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
              <span>→ horizontal</span>
              <CampoDeMedida valor={passoIgual.dx} rotulo="Anda na horizontal, em cm"
                aoMudar={(v) => porRegra({ no: noDaRegra, modo: "igual", passo: { ...passoIgual, dx: v } })} />
              <span>↓ vertical</span>
              <CampoDeMedida valor={passoIgual.dy} rotulo="Anda na vertical, em cm"
                aoMudar={(v) => porRegra({ no: noDaRegra, modo: "igual", passo: { ...passoIgual, dy: v } })} />
            </div>
          ) : (
            <table className="w-full">
              <thead><tr><th className="text-left">Salto</th><th>→ cm</th><th>↓ cm</th></tr></thead>
              <tbody>
                {passosDaRegra(regraPorTamanho, grade, noBase).map((p: Deslocamento & { de: string; para: string }, i: number) => (
                  <tr key={`${p.de}-${p.para}`}>
                    <td className="whitespace-nowrap pr-1">{p.de} → {p.para}</td>
                    <td><CampoDeMedida valor={p.dx} rotulo={`${p.de} para ${p.para}, horizontal`}
                      aoMudar={(v) => porRegra(mudarPasso(regraPorTamanho, grade, noBase, i, { dx: v, dy: p.dy }))} /></td>
                    <td><CampoDeMedida valor={p.dy} rotulo={`${p.de} para ${p.para}, vertical`}
                      aoMudar={(v) => porRegra(mudarPasso(regraPorTamanho, grade, noBase, i, { dx: p.dx, dy: v }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {regra && <button type="button" className="btn ghost-danger btn-sm" onClick={() => porRegra(null)}>Tirar regra</button>}
          <p className="m-0 text-[0.78rem] text-tinta-fraca">
            Ponto que não pode sair do lugar (o meio da frente, a dobra): marque 0 e 0 — ponto sem regra acompanha os vizinhos.
          </p>
        </div>
      )}

      {avisos.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.8rem] text-ambar">
          {avisos.map((a) => <li key={a}>{a}</li>)}
          {(g.perdidos ?? 0) > 0 && (
            <li><button type="button" className="btn secondary btn-sm"
              onClick={() => aoMudarGraduacao((gg) => ({ ...gg, perdidos: 0 }), false)}>Entendi</button></li>
          )}
        </ul>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Ligar na MesaDeMontagem**

Em `src/telas/montagem/MesaDeMontagem.tsx`:

1. `FERRAMENTAS` ganha, no fim: `{ qual: "graduar", rotulo: "Graduar", icone: "icones.svg#ruler", dica: "Clique num nó para ver ou pôr a regra de graduação; os outros tamanhos aparecem tracejados" },`
2. Imports: `import { BlocoDaGraduacao } from "./BlocoDaGraduacao";`, `import { gerarTamanho, graduacaoVazia } from "../../motores/graduacao";` (junto do import da Task 6) e `import type { Graduacao } from "../../api/moldes";`.
3. Depois de `baseDoGrupo`:

```ts
  // O base da graduação desta peça: a linha que guarda a regra, ou a do base da grade.
  const iDaBase: number | undefined = doGrupo
    ? (Object.values(doGrupo.porTamanho).find((i) => molde.pecas[i]?.graduacao) ?? doGrupo.porTamanho[baseDaGrade])
    : undefined;
  const pecaDaBase = iDaBase === undefined ? null : molde.pecas[iDaBase] ?? null;

  // A prévia: com a ferramenta Graduar, os outros tamanhos da grade, calculados das regras, tracejados.
  const previa = useMemo(() => {
    if (ferramenta !== "graduar" || !pecaDaBase?.graduacao) return [];
    return molde.tamanhos
      .filter((t) => t.nome !== pecaDaBase.tamanho)
      .map((t) => {
        const r = gerarTamanho(pecaDaBase, molde.tamanhos, t.nome);
        return r.peca ? { nos: r.peca.nos, cor: t.cor, tracejada: true } : null;
      })
      .filter((c): c is { nos: PecaEmMontagem["nos"]; cor: string; tracejada: boolean } => c !== null);
  }, [ferramenta, pecaDaBase, molde.tamanhos]);
  const regrasNaMesa = useMemo(
    () => (ferramenta === "graduar" && pecaDaBase?.graduacao?.jeito === "pontos" ? pecaDaBase.graduacao.regras.map((r) => r.no) : []),
    [ferramenta, pecaDaBase],
  );

  // A ferramenta Graduar trabalha no base: troca para ele se outro chip estiver marcado.
  useEffect(() => {
    if (ferramenta !== "graduar" || !pecaDaBase || peca?.tamanho === pecaDaBase.tamanho) return;
    setTamanhoAtivo(pecaDaBase.tamanho);
  }, [ferramenta, pecaDaBase, peca]);
```

(todos antes dos `return` antecipados do carregando/erro — são hooks). E, junto de `mudarEsta`:

```ts
  /** Mexe na graduação da peça (na linha do base). */
  const mudarGraduacao = (mudar: (g: Graduacao) => Graduacao, lembrarAntes: boolean) => {
    if (iDaBase === undefined) return;
    molde.mudarPeca(iDaBase, (p) => ({ ...p, graduacao: mudar(p.graduacao ?? graduacaoVazia()) }), lembrarAntes);
  };
```

4. Na `<Mesa>`: `camadas={ferramenta === "graduar" ? previa : camadas}` e `regras={regrasNaMesa}`.
5. A coluna da direita:

```tsx
        {ferramenta === "graduar" ? (
          <BlocoDaGraduacao base={pecaDaBase} baseDaGrade={baseDaGrade} grade={molde.tamanhos}
            noDaRegra={noAtivo} aoMudarGraduacao={mudarGraduacao} />
        ) : (
          peca && !semDesenho && <PainelDaPeca peca={peca} aoMudar={mudarEsta} aoMudarGrupo={mudarGrupo} />
        )}
```

- [ ] **Step 5: Tipos, build e bancadas**

Run: `npm run tipos && npm run front && npm run bancada:graduacao && npm run bancada:montagem`
Expected: tudo OK.

- [ ] **Step 6: No navegador**

Num molde com grade P, M, G, GG (M base, os outros sem desenho), ferramenta **Graduar**:
- com o chip G marcado, a ferramenta troca para o M;
- clicar num nó → "Ponto N (sem regra)"; digitar 1 na horizontal → losango amarelo no nó e os tamanhos P, G, GG aparecem **tracejados**, cada um na sua cor, com o P para o outro lado;
- marcar outro nó com 0 e 0 → a peça passa a crescer entre os dois;
- "Por tamanho" → a tabela P→M, M→G, G→GG com 1 em cada; mudar o G→GG para 2 → só o GG anda mais; voltar para "Salto igual" pergunta antes;
- "Porcentagem" 4 → a prévia vira a peça inteira escalada; voltar para "Por pontos" → as regras continuam;
- "Tirar regra"; Ctrl+Z desfaz cada mexida; F5 → a graduação volta igual (o `GET` traz `graduacao` na linha do M).

- [ ] **Step 7: Commit**

```bash
git add src/telas/risco/desenhoDeNos.ts src/telas/montagem dist
git commit -m "A ferramenta Graduar: regra por ponto ou porcentagem, com a prévia dos tamanhos tracejada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Gerar os tamanhos

**Files:**
- Create: `src/telas/montagem/JanelaDeSubstituir.tsx`
- Modify: `src/telas/montagem/BlocoDaGraduacao.tsx` (prop `aoGerar` e a seção do fim)
- Modify: `src/telas/montagem/MesaDeMontagem.tsx`

**Interfaces:**
- Consumes: `planejarGeracao`, `aplicarGeracao`, `ORIGEM_GERADA`, `ORIGEM_AJUSTADA` (Tasks 1–2); `pecaParaGravar` (`src/motores/montagem.js`); `pecaDaBase` (Task 7).
- Produces: `JanelaDeSubstituir({ alvos: { chave, nome, tamanho, origem }[], aoConfirmar(escolhidos: Set<string>), aoCancelar })`; `BlocoDaGraduacao` ganha `aoGerar: (todas: boolean) => void`.

- [ ] **Step 1: A pergunta antes de substituir**

`src/telas/montagem/JanelaDeSubstituir.tsx`:

```tsx
/**
 * Antes de refazer um tamanho que tem desenho próprio — veio da Audaces, de
 * um "juntar", ou foi ajustado à mão depois de gerado —, a pessoa marca quais
 * a graduação pode substituir. Os não marcados ficam como estão.
 */
import { useState } from "react";

export interface AlvoParaPerguntar { chave: string; nome: string; tamanho: string; origem: string | null }

interface Props {
  alvos: AlvoParaPerguntar[];
  aoConfirmar: (escolhidos: Set<string>) => void;
  aoCancelar: () => void;
}

export function JanelaDeSubstituir({ alvos, aoConfirmar, aoCancelar }: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const alternar = (chave: string) => setMarcados((m) => {
    const n = new Set(m);
    if (n.has(chave)) n.delete(chave);
    else n.add(chave);
    return n;
  });
  return (
    <div className="modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) aoCancelar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Substituir tamanhos">
        <header className="modal-topo">
          <h3>Estes tamanhos já têm desenho</h3>
          <button type="button" className="btn-x" title="Fechar" onClick={aoCancelar}>×</button>
        </header>
        <div className="modal-corpo">
          <p className="hint">Marque os que a graduação pode substituir. Os não marcados ficam como estão.</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {alvos.map((a) => (
              <li key={a.chave}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={marcados.has(a.chave)} onChange={() => alternar(a.chave)} />
                  {a.nome}, {a.tamanho} — {a.origem || "desenho próprio"}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <footer className="modal-rodape">
          <button type="button" className="btn secondary" onClick={aoCancelar}>Cancelar</button>
          <button type="button" className="btn primary" onClick={() => aoConfirmar(marcados)}>Gerar</button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: O botão no bloco da graduação**

Em `src/telas/montagem/BlocoDaGraduacao.tsx`:

1. `Props` ganha `/** Gerar os tamanhos desta peça, ou de todas as peças com graduação. */ aoGerar: (todas: boolean) => void;` e a função recebe `aoGerar`.
2. Logo depois de `const dialogo = useDialogo();` (antes do `if (!base)` — é hook): `const [todas, setTodas] = useState(false);`.
3. No fim do `<aside>` principal (depois da lista de avisos):

```tsx
      <div className="mt-auto flex flex-col gap-1.5 border-t border-linha pt-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
          todas as peças com graduação
        </label>
        <button type="button" className="btn primary btn-sm" onClick={() => aoGerar(todas)}>Gerar tamanhos</button>
      </div>
```

- [ ] **Step 3: O fluxo na MesaDeMontagem**

Em `src/telas/montagem/MesaDeMontagem.tsx`:

1. Imports: `import { useDialogo } from "../../casca/Dialogo";`, `import { pecaParaGravar } from "../../motores/montagem";`, `import { JanelaDeSubstituir } from "./JanelaDeSubstituir";` e, no import de `../../motores/graduacao`, `ORIGEM_AJUSTADA, ORIGEM_GERADA, aplicarGeracao, planejarGeracao`.
2. Tipo local e estado (hooks antes dos `return` antecipados):

```ts
type AlvoDeGeracao = {
  grupo: number; tamanho: string; iBase: number; iExistente: number;
  acao: "criar" | "refazer" | "perguntar"; origem: string | null; nome: string;
};
```

(fora do componente) e, dentro: `const dialogo = useDialogo();` e `const [perguntando, setPerguntando] = useState<AlvoDeGeracao[] | null>(null);`.
3. `mudarEsta` marca o ajuste à mão:

```ts
  // Mexer à mão num tamanho gerado tira dele a marca da graduação: gerar de
  // novo passa a perguntar antes de perder o ajuste.
  const mudarEsta = (mudar: Parameters<typeof molde.mudarPeca>[1], lembrarAntes: boolean) =>
    molde.mudarPeca(atual, (p) => {
      const q = mudar(p);
      return p.origem === ORIGEM_GERADA ? { ...q, origem: ORIGEM_AJUSTADA } : q;
    }, lembrarAntes);
```

4. Gerar:

```ts
  const chaveDoAlvo = (a: { grupo: number; tamanho: string }) => `${a.grupo}/${a.tamanho}`;

  /** Aplica a geração: um passo só no desfazer, e a mensagem diz o que entrou e o que ficou de fora. */
  const aplicarAlvos = (alvos: AlvoDeGeracao[]) => {
    const r = aplicarGeracao(molde.pecas, molde.tamanhos, alvos, pecaParaGravar);
    if (r.gerados.length > 0) molde.mudarPecas(() => r.pecas, true);
    const linhas: string[] = [];
    if (r.gerados.length > 0) linhas.push(`Gerados: ${r.gerados.map((a: AlvoDeGeracao) => `${a.nome} ${a.tamanho}`).join(", ")}.`);
    for (const n of r.naoGerados as (AlvoDeGeracao & { motivo: string })[]) {
      linhas.push(`Não gerei o ${n.tamanho} de ${n.nome}: ${n.motivo}.`);
    }
    linhas.push(...(r.avisos as string[]));
    void dialogo.avisar(linhas.join(" ") || "Nada foi gerado.");
  };

  const gerar = (todas: boolean) => {
    if (!todas && !pecaDaBase?.graduacao) {
      void dialogo.avisar("Esta peça ainda não tem graduação: marque pontos ou uma porcentagem.");
      return;
    }
    const alvos: AlvoDeGeracao[] = planejarGeracao(molde.pecas, molde.tamanhos, todas ? null : (pecaDaBase!.grupo ?? -1));
    if (alvos.length === 0) {
      void dialogo.avisar(molde.tamanhos.length < 2
        ? "A grade só tem um tamanho: acrescente tamanhos na Grade antes de gerar."
        : "Nenhuma peça com graduação para gerar.");
      return;
    }
    if (alvos.some((a) => a.acao === "perguntar")) { setPerguntando(alvos); return; }
    aplicarAlvos(alvos);
  };
```

5. Render: o `BlocoDaGraduacao` recebe `aoGerar={gerar}`, e, junto da janela da Grade:

```tsx
      {perguntando && (
        <JanelaDeSubstituir
          alvos={perguntando.filter((a) => a.acao === "perguntar")
            .map((a) => ({ chave: chaveDoAlvo(a), nome: a.nome, tamanho: a.tamanho, origem: a.origem }))}
          aoCancelar={() => setPerguntando(null)}
          aoConfirmar={(escolhidos) => {
            const alvos = perguntando;
            setPerguntando(null);
            aplicarAlvos(alvos.filter((a) => a.acao !== "perguntar" || escolhidos.has(chaveDoAlvo(a))));
          }}
        />
      )}
```

- [ ] **Step 4: Tipos, build e bancadas**

Run: `npm run tipos && npm run front && npm run bancada:graduacao && npm run bancada:tamanhos && npm run bancada:montagem`
Expected: tudo OK.

- [ ] **Step 5: No navegador**

Num molde com grade P, M, G, GG e a FRENTE graduada no M:
- "Gerar tamanhos" → mensagem "Gerados: …"; os chips P, G, GG deixam de ser tracejados; "Ver tamanhos" mostra os quatro alinhados;
- mudar a regra e gerar de novo → refaz **sem perguntar**;
- no G, arrastar um nó (Nós) → gerar de novo → a janela pergunta pelo G ("graduação ajustada à mão"); desmarcado, o ajuste fica;
- juntar um molde como GG antes de gerar → gerar pergunta pelo GG (origem do outro molde);
- margem 3 cm numa peça pequena com P bem menor → "Não gerei o P de …: a margem de 3 cm fecha a peça…", e o resto entra;
- Ctrl+Z desfaz a geração inteira de uma vez; F5 → os tamanhos gerados continuam (origem "graduação" no `GET`).

- [ ] **Step 6: Commit**

```bash
git add src/telas/montagem dist
git commit -m "Gerar os tamanhos pela graduação, perguntando antes de substituir desenho próprio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: O caminho inteiro, e o mapa

**Files:**
- Modify: `docs/MAPA.md` (a linha da Montagem)

- [ ] **Step 1: Todas as conferências**

Run: `npm run tipos && npm run front && npm run bancada:revisao && npm run bancada:graduacao && npm run bancada:tamanhos && npm run bancada:moldes-pecas && npm run bancada:montagem && npm run bancada:audaces`
Expected: tudo OK.

- [ ] **Step 2: O fluxo da spec no navegador**

Com o servidor de teste (cópia do banco, sessão sem tokens), do começo:
1. Digitalizar uma foto → "Continuar para a montagem" → molde de um tamanho, "base".
2. Grade: "base" → M; acrescentar P, G, GG; P antes do M.
3. FRENTE: Graduar com dois pontos em salto igual; COSTAS: por tamanho com o G→GG maior; MANGA: porcentagem 4.
4. Gerar com "todas as peças com graduação" → a mensagem lista os gerados; "Ver tamanhos" em cada peça.
5. Juntar outro molde como um tamanho declarado e vazio (preenche com a cor da grade).
6. Ajustar à mão um gerado e gerar de novo (pergunta).
7. Tamanho que não fecha (margem grande numa peça pequena): fica de fora com o motivo.
8. Ctrl+Z (peças e grade voltam juntas); F5 (tudo volta igual); PDF de "todos os tamanhos"; Encaixar escolhendo o G.

Anotar o que falhar e corrigir na tarefa dona do código, com o teste que prova o conserto.

- [ ] **Step 3: O mapa**

Em `docs/MAPA.md`, na linha da **Montagem**, acrescentar à descrição "; a grade de tamanhos com cor e a graduação (por pontos ou porcentagem) que gera os outros tamanhos" e aos arquivos `src/motores/tamanhos.js`, `src/motores/graduacao.js`.

- [ ] **Step 4: Commit**

```bash
git add docs/MAPA.md
git commit -m "O mapa ganha a graduação da Montagem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Quando as duas branches se juntarem

A `feature/digitalizar-melhor` mexe nos mesmos arquivos da Montagem (seleção de vários nós, girar a peça). No merge, além dos conflitos de texto em `Mesa.tsx`, `MesaDeMontagem.tsx`, `PainelDaPeca.tsx`, `desenhoDeNos.ts` e `montagem.js`: `apagarNosDaPeca` e `virarTrechosNaPeca` têm de remapear as regras (`graduacaoAoApagarNo` para cada nó que sai, do maior para o menor; o trecho que vira um só perde as regras dos nós do meio) e `girarPeca` tem de girar os vetores das regras (`passo` e cada `deslocamentos[t]`) pelo mesmo ângulo — com uma bancada que prove os dois.

## Nota para quem for testar no navegador

O servidor de teste precisa de uma cópia do banco e da sessão (`OPTIMIZE_DADOS=<pasta de teste> PORT=8765 node servidor/server.js`). **A cópia da sessão tem de ir SEM tokens** (`accessToken` e `refreshToken` trocados por um texto qualquer): com os tokens de verdade, o servidor de teste os renova no backend da CodeEx e a sessão real do programa fica com um token velho — aconteceu em 2026-09-28. Sem token, o servidor usa o acesso guardado na cópia e não fala com o backend.
