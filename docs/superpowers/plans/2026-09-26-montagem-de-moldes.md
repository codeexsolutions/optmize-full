# Montagem de Moldes — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela nova, **Montagem**, no grupo Produção: o molde digitalizado vira molde da estante — peças identificadas, piques, pontos, fio, margem de costura —, sai em PDF/SVG e vai ao Encaixe. O Digitalizar para de baixar arquivo e passa a "Continuar para a montagem".

**Architecture:** O Digitalizar grava um molde `situacao='rascunho'` e abre `/montagem?molde=ID`. A Montagem edita o molde do banco e grava sozinha (PUT inteiro, 1 s depois da última mexida). As contas moram em motores puros (`edicaoDeNos`, `margemDeCostura`, `montagem`), testados na bancada; a tela só desenha e repassa o ponteiro. O `contorno` gravado continua sendo a linha de corte — o Encaixe e a estampa não mudam, fora o espelhar.

**Tech Stack:** React 19 + TypeScript + react-router, canvas 2D, Express + better-sqlite3 (CommonJS), pdfkit, esbuild (só na bancada, para carregar motor ESM).

**Spec:** `docs/superpowers/specs/2026-09-26-montagem-de-moldes-design.md`

## Global Constraints

- Nenhuma dependência nova. `esbuild` e `pdfkit` já estão no `package.json`.
- Motor (`src/motores/*.js`) é conta pura: sem DOM, sem React. Canvas é da tela.
- O `package.json` é `"type": "commonjs"`: o servidor é CommonJS e **não** importa motor ESM. Motor ESM na bancada entra por `bancada/carregarModulo.mjs` (Tarefa 1).
- Ícone sempre escrito inteiro: `"icones.svg#nome"`. Nunca montado por concatenação (`empacotar/icones.js` varre a string literal).
- Nomes, textos da tela e comentários em português, no tom do projeto: comentário de bloco explica o PORQUÊ, não o quê.
- `contorno`, `largura`, `altura`, `quantidade` de `molde_pecas` = linha de corte, em cm, relativo ao canto da peça. Formato inalterado.
- `npx tsc --noEmit -p .` tem de passar ao fim de cada tarefa que mexe em `.ts`/`.tsx` (hoje passa limpo).
- Commits: este repositório não tem `user.name`/`user.email` configurados nesta máquina. Antes da primeira tarefa, confirme `git config user.email`; se vazio, pare e peça à pessoa para configurar. Não configure identidade por conta própria.
- Fim de mensagem de commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Reeditar pelo passo a passo antigo (`EditorDeMolde`) um molde montado** — a pessoa espera que nós, piques e margem continuem lá. Coberto na Tarefa 5 (o passo a passo leva `nos`/`marcacoes` de volta; trocar o arquivo da peça os descarta) e no teste de `arrumarPeca`.
2. **Fechar a janela ou dar F5 com mexida não salva** — a pessoa espera ser avisada. Tarefa 7 (`beforeunload` quando a gravação não está "salvo").
3. **Margem digitada com vírgula ("0,5"), vazia ou negativa** — espera 0,5 / 0 / 0, e texto inválido não pode virar `NaN` no banco. Tarefa 4 (`lerCm`, testado).
4. **Peça vinda de DXF com centenas de pontos aberta na Montagem** — espera o mesmo polígono de volta ao gravar sem mexer. Tarefa 4 (teste `nosDoPoligono` → `pecaParaGravar` idêntico).
5. **Espelhar peça com furo (vazado)** — o furo tem de espelhar junto. Tarefa 4 (teste de `pecasParaOEncaixe` com furo).

---

## Mapa de arquivos

| arquivo | papel |
|---|---|
| `bancada/carregarModulo.mjs` (novo) | carrega motor ESM (com imports relativos) na bancada via esbuild |
| `src/motores/edicaoDeNos.js` (novo) | contas de editar risco de nós com alça (saem do Digitalizar) |
| `src/telas/risco/desenhoDeNos.ts` (novo) | desenho do caminho, dos nós e das alças no canvas |
| `src/motores/margemDeCostura.js` (novo) | offset do contorno para fora; `null` quando se cruza |
| `src/motores/montagem.js` (novo) | pique preso ao traço, peça → gravar, espelhar, desenho de saída, SVG |
| `servidor/moldes-pecas.js` (novo) | conferir/ler peça do banco (puro, testável sem banco) |
| `servidor/moldes-api.js` | usa `moldes-pecas`; grava `situacao`, `nos`, `marcacoes` |
| `servidor/db.js` | três colunas novas |
| `servidor/risco-pdf.js` | aceita corte/costura/piques/pontos/fio/texto; funções exportadas |
| `src/api/moldes.ts`, `src/api/risco.ts` | tipos novos |
| `src/telas/moldes/vocabulario.ts`, `EditorDeMolde.tsx` | levam `nos`/`marcacoes` de volta |
| `src/telas/Montagem.tsx` (novo) | escolha do molde ou a mesa |
| `src/telas/montagem/useMoldeEmMontagem.ts` (novo) | carregar, desfazer, gravar sozinho |
| `src/telas/montagem/EscolhaDoMolde.tsx` (novo) | lista de moldes, rascunhos primeiro |
| `src/telas/montagem/MesaDeMontagem.tsx` (novo) | junta barra, lista, mesa, painel |
| `src/telas/montagem/Mesa.tsx` (novo) | canvas: nós, piques, pontos, fio, ver todas |
| `src/telas/montagem/ListaDePecas.tsx` (novo) | coluna das peças, apagar, juntar |
| `src/telas/montagem/PainelDaPeca.tsx` (novo) | papel, nome, quantidade, espelhar, margem |
| `src/telas/montagem/BarraDaMontagem.tsx` (novo) | nome, estado, PDF, SVG, Concluir, Encaixar |
| `src/rotas.ts`, `src/casca/Casca.tsx` | rota no menu, tela de bancada |
| `src/telas/Digitalizar.tsx` | sai download e contas de nó; entra "Continuar" |
| `src/telas/Moldes.tsx` | selo de rascunho, "Continuar montagem", "Montagem" |
| `src/telas/moldes/EnvioParaEncaixe.tsx` | espelhar no envio |

---

### Task 1: Contas de edição de nós saem para um motor

**Files:**
- Create: `bancada/carregarModulo.mjs`
- Create: `src/motores/edicaoDeNos.js`
- Create: `bancada/conferir-edicao-de-nos.mjs`
- Modify: `package.json` (script `bancada:nos`)

**Interfaces:**
- Produces (`src/motores/edicaoDeNos.js`):
  - `naCurva(p0, p1, p2, p3, t) → {x,y}`
  - `pontoNoTrecho(nos, i, t) → {x,y}` (reta ou curva, conforme `nos[i].retaDepois`)
  - `dividirCurva(p0, p1, p2, p3, t) → { saidaDoAnterior, entradaDoNovo, no, saidaDoNovo, entradaDoSeguinte }`
  - `clonarNos(nos) → No[]`
  - `moverPega(nos, { no, parte: "no"|"entrada"|"saida" }, alvo) → No[]`
  - `apagarNo(nos, i) → No[] | null` (`null` se ficaria com menos de 3)
  - `alternarLado(nos, no, lado: "antes"|"depois") → No[]`
  - `inserirNoNoTraco(nos, i, t) → No[]` (nó novo no índice `i + 1`)
  - `pegaSob(nos, alvo, raio, noAtivo) → { no, parte, distancia } | null`
  - `tracoSob(nos, alvo, raio) → { no, t, distancia } | null`
- Produces (`bancada/carregarModulo.mjs`): `carregarModulo(caminhoRelativoARaiz) → Promise<módulo>`

- [ ] **Step 1: Escrever o carregador da bancada**

```js
// bancada/carregarModulo.mjs
/*
 * ===========================================================================
 * CARREGAR UM MOTOR ESM NA BANCADA
 * ===========================================================================
 *
 * O `package.json` é CommonJS, e os motores de `src/motores` são ESM com
 * imports relativos sem extensão (`./ajusteDeCurvas`). O truque do `data:` de
 * `conferir-nome-de-arquivo.mjs` não serve aqui: um módulo carregado por URL
 * de dados não resolve import relativo. O esbuild (já instalado, é quem
 * empacota a tela) junta o motor e o que ele importa num texto só, e esse
 * texto entra por `data:`. O que se testa continua sendo o arquivo de verdade.
 */
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function carregarModulo(relativo) {
  const saida = buildSync({
    entryPoints: [path.join(RAIZ, relativo)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
  });
  const codigo = saida.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(codigo).toString("base64")}`);
}
```

- [ ] **Step 2: Escrever o teste que falha**

```js
// bancada/conferir-edicao-de-nos.mjs
/*
 * BANCADA — as contas de mexer num risco de nós com alça
 *
 *     npm run bancada:nos
 *
 * Saíram do Digitalizar quando a Montagem passou a editar o mesmo risco. O que
 * mais importa aqui é o "pôr nó no traço não muda o desenho": se mudasse, cada
 * nó novo entortaria a peça um pouco, e a pessoa só veria no tecido.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const m = await carregarModulo("src/motores/edicaoDeNos.js");
const perto = (a, b, tol = 1e-9) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
const reto = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });

// Um quadrado de retas.
const quadrado = [reto(0, 0), reto(10, 0), reto(10, 10), reto(0, 10)];

// 1. Pôr nó numa reta: cai em cima dela, e as duas metades continuam retas.
{
  const r = m.inserirNoNoTraco(quadrado, 0, 0.5);
  assert.equal(r.length, 5);
  assert.ok(perto(r[1], { x: 5, y: 0 }));
  assert.ok(r.every((n) => n.retaDepois), "partir reta não inventa curva");
  assert.equal(quadrado.length, 4, "não mexe na lista recebida");
}

// 2. Pôr nó numa curva não muda o desenho.
{
  const a = { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: 8 }, retaDepois: false };
  const b = { x: 10, y: 0, entrada: { x: 7, y: 8 }, saida: { x: 10, y: 0 }, retaDepois: true };
  const c = reto(5, -5);
  const nos = [a, b, c];
  const antes15 = m.pontoNoTrecho(nos, 0, 0.15);
  const antes65 = m.pontoNoTrecho(nos, 0, 0.65);
  const r = m.inserirNoNoTraco(nos, 0, 0.3);
  assert.ok(perto(m.pontoNoTrecho(r, 0, 0.5), antes15, 1e-9), "primeira metade igual");
  assert.ok(perto(m.pontoNoTrecho(r, 1, 0.5), antes65, 1e-9), "segunda metade igual");
}

// 3. Pôr nó no ÚLTIMO trecho (o que fecha a volta).
{
  const r = m.inserirNoNoTraco(quadrado, 3, 0.5);
  assert.equal(r.length, 5);
  assert.ok(perto(r[4], { x: 0, y: 5 }));
}

// 4. Apagar: piso de três nós.
assert.equal(m.apagarNo([reto(0, 0), reto(1, 0), reto(0, 1)], 0), null);
assert.equal(m.apagarNo(quadrado, 1).length, 3);

// 5. Mover o nó leva as alças junto.
{
  const curvo = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  const r = m.moverPega(curvo, { no: 0, parte: "no" }, { x: 2, y: 3 });
  assert.ok(perto(r[0].entrada, { x: 1, y: 3 }));
  assert.ok(perto(r[0].saida, { x: 3, y: 3 }));
}

// 6. Alça de nó de curva espelha a outra; de canto, não.
{
  const liso = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  const r = m.moverPega(liso, { no: 0, parte: "entrada" }, { x: -2, y: 1 });
  assert.ok(perto(r[0].saida, { x: 2, y: -1 }));
  const canto = [{ ...liso[0], canto: true }, liso[1], liso[2]];
  const r2 = m.moverPega(canto, { no: 0, parte: "entrada" }, { x: -2, y: 1 });
  assert.ok(perto(r2[0].saida, { x: 1, y: 0 }));
}

// 7. Reta vira curva com alças a um terço, e volta.
{
  const r = m.alternarLado(quadrado, 0, "depois");
  assert.equal(r[0].retaDepois, false);
  assert.ok(perto(r[0].saida, { x: 10 / 3, y: 0 }));
  assert.ok(perto(r[1].entrada, { x: 20 / 3, y: 0 }));
  const volta = m.alternarLado(r, 1, "antes");
  assert.equal(volta[0].retaDepois, true);
}

// 8. O que está sob o ponteiro: alça do nó ativo antes do nó.
{
  const nos = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  assert.equal(m.pegaSob(nos, { x: 1, y: 0.1 }, 0.5, 0).parte, "saida");
  assert.equal(m.pegaSob(nos, { x: 1, y: 0.1 }, 0.5, null), null, "sem nó ativo, alça não pega");
  assert.equal(m.pegaSob(nos, { x: 10.2, y: 0 }, 0.5, null).no, 1);
  const t = m.tracoSob(quadrado, { x: 4, y: 0.2 }, 0.5);
  assert.equal(t.no, 0);
  assert.ok(Math.abs(t.t - 0.4) < 0.07);
}

console.log("OK — as contas de edição de nós conferem.");
```

- [ ] **Step 3: Registrar o script e rodar para ver falhar**

Em `package.json`, junto dos outros `bancada:*`:
```json
    "bancada:nos": "node bancada/conferir-edicao-de-nos.mjs",
```
Run: `npm run bancada:nos`
Expected: FAIL — o esbuild não acha `src/motores/edicaoDeNos.js`.

- [ ] **Step 4: Escrever o motor**

O corpo das funções é o que hoje está dentro de `src/telas/Digitalizar.tsx` (`naCurva`, `dividirCurva`, `aoMover`, `apagarNo`, `alternarLado`, `aoDobrarClique`, `oQueEstaSob`, `noTracoSob`), só que puro: recebe a lista, devolve outra.

```js
// src/motores/edicaoDeNos.js
/**
 * ===========================================================================
 * EDIÇÃO DE NÓS — as contas de mexer num risco de nós com alça
 * ===========================================================================
 *
 * Moravam dentro de `telas/Digitalizar.tsx`. Saíram quando a Montagem passou a
 * editar o mesmo tipo de risco: duas cópias da mesma conta divergiriam na
 * primeira correção feita numa só.
 *
 * Conta pura: recebe a lista de nós e devolve uma lista NOVA, sem tocar na que
 * recebeu — a tela guarda a antiga na pilha do desfazer, e um objeto alterado
 * no lugar desfaria o desfazer.
 *
 * Um nó: `{ x, y, entrada, saida, canto?, retaDepois? }`. Quem guarda se o
 * trecho até o nó seguinte é reta é o nó que COMEÇA o trecho.
 */

/** Um ponto da cúbica em `t`. */
export function naCurva(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** O ponto em `t` do trecho que começa no nó `i` — reta ou curva. */
export function pontoNoTrecho(nos, i, t) {
  const a = nos[i];
  const b = nos[(i + 1) % nos.length];
  if (a.retaDepois) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return naCurva(a, a.saida, b.entrada, b, t);
}

/**
 * Parte a cúbica em duas, em `t`, sem mudar o desenho (de Casteljau).
 *
 * É o que deixa "pôr um nó no meio da curva" ser inofensivo: o traço fica
 * exatamente onde estava, só passa a ter mais um nó para pegar.
 */
export function dividirCurva(p0, p1, p2, p3, t) {
  const meio = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a1 = meio(p0, p1);
  const a2 = meio(p1, p2);
  const a3 = meio(p2, p3);
  const b1 = meio(a1, a2);
  const b2 = meio(a2, a3);
  const centro = meio(b1, b2);
  return { saidaDoAnterior: a1, entradaDoNovo: b1, no: centro, saidaDoNovo: b2, entradaDoSeguinte: a3 };
}

export function clonarNos(nos) {
  return nos.map((n) => ({
    x: n.x, y: n.y, entrada: { ...n.entrada }, saida: { ...n.saida },
    canto: n.canto, retaDepois: n.retaDepois,
  }));
}

/**
 * Arrasta o nó ou uma alça até `alvo`.
 *
 * O nó leva as alças junto: sem isso, mover um nó deformaria as duas curvas
 * vizinhas em vez de arrastar o trecho inteiro. Nó de curva mantém as duas
 * alças alinhadas (a curva passa lisa por ele); nó de CANTO não, senão o bico
 * se perderia ao mexer num lado.
 */
export function moverPega(nos, pega, alvo) {
  return nos.map((n, i) => {
    if (i !== pega.no) return n;
    if (pega.parte === "no") {
      const dx = alvo.x - n.x;
      const dy = alvo.y - n.y;
      return {
        ...n,
        x: alvo.x,
        y: alvo.y,
        entrada: { x: n.entrada.x + dx, y: n.entrada.y + dy },
        saida: { x: n.saida.x + dx, y: n.saida.y + dy },
      };
    }
    const oposta = { x: 2 * n.x - alvo.x, y: 2 * n.y - alvo.y };
    if (pega.parte === "entrada") {
      return { ...n, entrada: { x: alvo.x, y: alvo.y }, saida: n.canto ? n.saida : oposta };
    }
    return { ...n, saida: { x: alvo.x, y: alvo.y }, entrada: n.canto ? n.entrada : oposta };
  });
}

/** Tira o nó `i`. Com menos de três não existe contorno para fechar: `null`. */
export function apagarNo(nos, i) {
  if (nos.length <= 3) return null;
  return nos.filter((_, k) => k !== i);
}

/**
 * Troca um lado do nó entre reta e curva.
 *
 * "depois" é o trecho até o nó seguinte; "antes", o que vem do anterior — e
 * esse é guardado no nó anterior. Virando curva, as alças nascem a um terço
 * do caminho: a curva começa idêntica à reta e só muda quando alguém arrasta.
 * Virando reta, as alças desabam em cima dos nós.
 */
export function alternarLado(nos, no, lado) {
  if (nos.length < 2) return nos;
  const inicio = lado === "depois" ? no : (no - 1 + nos.length) % nos.length;
  const fim = (inicio + 1) % nos.length;
  const a = nos[inicio];
  const b = nos[fim];
  const saida = nos.slice();
  if (!a.retaDepois) {
    saida[inicio] = { ...a, retaDepois: true, saida: { x: a.x, y: a.y } };
    saida[fim] = { ...b, entrada: { x: b.x, y: b.y } };
  } else {
    const terco = (de, para) => ({ x: de.x + (para.x - de.x) / 3, y: de.y + (para.y - de.y) / 3 });
    saida[inicio] = { ...a, retaDepois: false, saida: terco(a, b) };
    saida[fim] = { ...b, entrada: terco(b, a) };
  }
  return saida;
}

/**
 * Põe um nó no trecho que começa em `i`, na posição `t`, sem mudar o desenho.
 * O nó novo fica no índice `i + 1`. Numa reta, as duas metades continuam
 * retas: partir uma reta não pode inventar curvatura.
 */
export function inserirNoNoTraco(nos, i, t) {
  const a = nos[i];
  const seguinte = (i + 1) % nos.length;
  const b = nos[seguinte];
  const saida = nos.slice();
  if (a.retaDepois) {
    const meio = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    saida.splice(i + 1, 0, {
      x: meio.x, y: meio.y, entrada: { ...meio }, saida: { ...meio }, canto: false, retaDepois: true,
    });
    return saida;
  }
  const corte = dividirCurva(a, a.saida, b.entrada, b, t);
  saida[i] = { ...a, saida: corte.saidaDoAnterior };
  saida[seguinte] = { ...b, entrada: corte.entradaDoSeguinte };
  saida.splice(i + 1, 0, {
    x: corte.no.x, y: corte.no.y,
    entrada: corte.entradaDoNovo, saida: corte.saidaDoNovo,
    canto: false, retaDepois: false,
  });
  return saida;
}

/**
 * O que está debaixo do ponteiro: uma alça do nó ativo, ou um nó.
 *
 * As alças primeiro: ficam por cima e costumam estar perto do nó. Lado reto
 * não tem alça para pegar — ela está em cima do nó, e deixar pegá-la roubaria
 * o clique do próprio nó.
 */
export function pegaSob(nos, alvo, raio, noAtivo) {
  if (noAtivo !== null && noAtivo !== undefined && nos[noAtivo]) {
    const n = nos[noAtivo];
    const anterior = nos[(noAtivo - 1 + nos.length) % nos.length];
    for (const parte of ["entrada", "saida"]) {
      if (parte === "saida" && n.retaDepois) continue;
      if (parte === "entrada" && anterior.retaDepois) continue;
      const d = Math.hypot(n[parte].x - alvo.x, n[parte].y - alvo.y);
      if (d < raio) return { no: noAtivo, parte, distancia: d };
    }
  }
  let achado = null;
  let menor = raio;
  for (let i = 0; i < nos.length; i++) {
    const d = Math.hypot(nos[i].x - alvo.x, nos[i].y - alvo.y);
    if (d < menor) { menor = d; achado = { no: i, parte: "no", distancia: d }; }
  }
  return achado;
}

/** Em que trecho o ponteiro caiu, e em que `t`. Dezesseis passos por trecho. */
export function tracoSob(nos, alvo, raio) {
  let melhor = null;
  let menor = raio;
  for (let i = 0; i < nos.length; i++) {
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const q = pontoNoTrecho(nos, i, t);
      const d = Math.hypot(q.x - alvo.x, q.y - alvo.y);
      if (d < menor) { menor = d; melhor = { no: i, t, distancia: d }; }
    }
  }
  return melhor;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run bancada:nos`
Expected: `OK — as contas de edição de nós conferem.`

- [ ] **Step 6: Commit**

```bash
git add bancada/carregarModulo.mjs bancada/conferir-edicao-de-nos.mjs src/motores/edicaoDeNos.js package.json
git commit -m "As contas de editar nós saem do Digitalizar para um motor, com bancada"
```

---

### Task 2: O Digitalizar passa a usar o motor e o desenho comum

Refatoração sem mudança de comportamento. Prepara o terreno para a Mesa da Montagem usar as mesmas peças.

**Files:**
- Create: `src/telas/risco/desenhoDeNos.ts`
- Modify: `src/telas/Digitalizar.tsx`

**Interfaces:**
- Consumes: tudo de `src/motores/edicaoDeNos.js` (Task 1).
- Produces (`src/telas/risco/desenhoDeNos.ts`):
  - `type Ponto = { x: number; y: number }`
  - `type No = { x: number; y: number; entrada: Ponto; saida: Ponto; canto?: boolean; retaDepois?: boolean }`
  - `tracarCaminho(ctx: CanvasRenderingContext2D, nos: No[], emTela: (p: Ponto) => Ponto): void`: faz `beginPath` … `closePath`, sem traçar.
  - `desenharNos(ctx, nos: No[], noAtivo: number | null, emTela): void`: as alças do nó ativo e depois os nós (quadrado = canto, redondo = curva).

- [ ] **Step 1: Criar o desenho comum**

Recorte literal do que hoje está no efeito de desenho do `Digitalizar.tsx` (o laço do `beginPath` com `bezierCurveTo`, e o bloco "As alças, só do nó ativo" até o fim de `escolhida.forEach`):

```ts
// src/telas/risco/desenhoDeNos.ts
/**
 * ===========================================================================
 * DESENHO DE NÓS — o risco, os nós e as alças no canvas
 * ===========================================================================
 *
 * O Digitalizar e a Montagem desenham o mesmo risco editável: um em cima da
 * foto, o outro em cima da grade. O que muda entre os dois é o fundo e a
 * conversão para a tela (`emTela`); o nó e a alça têm de ter a mesma cara nas
 * duas, senão quem passa de uma para a outra reaprende o que é canto.
 */

export type Ponto = { x: number; y: number };
export type No = { x: number; y: number; entrada: Ponto; saida: Ponto; canto?: boolean; retaDepois?: boolean };

/** O caminho fechado dos nós. Só traça o caminho: a cor e a grossura são de quem chama. */
export function tracarCaminho(ctx: CanvasRenderingContext2D, nos: No[], emTela: (p: Ponto) => Ponto) {
  if (nos.length === 0) return;
  ctx.beginPath();
  const zero = emTela(nos[0]!);
  ctx.moveTo(zero.x, zero.y);
  for (let k = 0; k < nos.length; k++) {
    const a = nos[k]!;
    const b = nos[(k + 1) % nos.length]!;
    const fim = emTela(b);
    if (a.retaDepois) {
      ctx.lineTo(fim.x, fim.y);
      continue;
    }
    const c1 = emTela(a.saida);
    const c2 = emTela(b.entrada);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, fim.x, fim.y);
  }
  ctx.closePath();
}

/**
 * As alças do nó ativo (por baixo) e os nós (por cima).
 *
 * Canto é quadrado, curva é redondo: canto é ponto de costura, e tem que dar
 * para reconhecer sem clicar. O nó marcado cresce, muda de cor e ganha halo —
 * é ele que o Delete apaga, então dá para ver o que vai embora antes.
 */
export function desenharNos(
  ctx: CanvasRenderingContext2D, nos: No[], noAtivo: number | null, emTela: (p: Ponto) => Ponto,
) {
  if (noAtivo !== null && nos[noAtivo]) {
    const n = nos[noAtivo]!;
    const anterior = nos[(noAtivo - 1 + nos.length) % nos.length]!;
    const centro = emTela(n);
    for (const parte of ["entrada", "saida"] as const) {
      if (parte === "saida" && n.retaDepois) continue;
      if (parte === "entrada" && anterior.retaDepois) continue;
      const a = emTela(n[parte]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centro.x, centro.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#4d9dff";
      ctx.fill();
      ctx.strokeStyle = "rgba(10, 14, 16, 0.9)";
      ctx.stroke();
    }
  }

  nos.forEach((n, i) => {
    const c = emTela(n);
    const marcado = i === noAtivo;
    if (marcado) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 122, 26, 0.25)";
      ctx.fill();
    }
    const raio = marcado ? 5.2 : 3.6;
    ctx.fillStyle = marcado ? "#ff7a1a" : "#ffffff";
    ctx.strokeStyle = marcado ? "#ffffff" : "rgba(10, 14, 16, 0.95)";
    ctx.lineWidth = marcado ? 2 : 1.5;
    ctx.beginPath();
    if (n.canto) ctx.rect(c.x - raio, c.y - raio, raio * 2, raio * 2);
    else ctx.arc(c.x, c.y, raio, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}
```

- [ ] **Step 2: Trocar as contas locais do Digitalizar pelas do motor**

Em `src/telas/Digitalizar.tsx`:

1. Apagar as funções locais `naCurva` e `dividirCurva`, e o tipo `NoTraco`.
2. Trocar os imports:
```ts
import {
  alternarLado as alternarLadoDosNos, apagarNo as apagarNoDosNos, clonarNos, inserirNoNoTraco,
  moverPega, pegaSob, tracoSob,
} from "../motores/edicaoDeNos";
import { desenharNos, tracarCaminho } from "./risco/desenhoDeNos";
```
3. `const clonar = ...` passa a ser `const clonar = (fonte: No[][]): No[][] => fonte.map(clonarNos);`
4. `oQueEstaSob` passa a ser:
```ts
  /** O que está debaixo do ponteiro: alça do nó ativo, nó de qualquer peça, ou nada. */
  const oQueEstaSob = (alvo: Ponto): Pega | null => {
    const raio = PEGA * gradePorPixel();
    let melhor: (Pega & { distancia: number }) | null = null;
    edicao.forEach((nos, p) => {
      const sob = pegaSob(nos, alvo, raio, p === qual ? noAtivo : null);
      if (!sob) return;
      // Alça ganha sempre (ver o motor); entre nós, o mais perto.
      if (sob.parte !== "no") { melhor = { peca: p, no: sob.no, parte: sob.parte, distancia: -1 }; return; }
      if (!melhor || sob.distancia < melhor.distancia) melhor = { peca: p, no: sob.no, parte: "no", distancia: sob.distancia };
    });
    return melhor;
  };
```
5. `noTracoSob` passa a ser:
```ts
  const noTracoSob = (alvo: Ponto): { peca: number; no: number; t: number } | null => {
    const raio = PEGA * gradePorPixel();
    let melhor: { peca: number; no: number; t: number; distancia: number } | null = null;
    edicao.forEach((nos, p) => {
      const sob = tracoSob(nos, alvo, raio);
      if (sob && (!melhor || sob.distancia < melhor.distancia)) melhor = { peca: p, ...sob };
    });
    return melhor;
  };
```
6. Em `aoMover`, o miolo do `setEdicao` vira:
```ts
    setEdicao((antes) => antes.map((nos, p) => (p === pega.peca ? moverPega(nos, pega, alvo) : nos)));
```
7. `apagarNo` (o `useCallback`) usa `apagarNoDosNos(contorno, no)`: se devolver `null`, mostra o mesmo erro de hoje; senão `setEdicao(antes => antes.map((c, p) => p === peca ? novo : c))`.
8. `alternarLado` (o `useCallback`) vira `lembrar(); setEdicao(antes => antes.map((c, pp) => pp === peca ? alternarLadoDosNos(c, no, lado) : c));`.
9. Em `aoDobrarClique`, o bloco depois de `lembrar()` vira:
```ts
    setEdicao((antes) => antes.map((nos, p) => (p === noTraco.peca ? inserirNoNoTraco(nos, noTraco.no, noTraco.t) : nos)));
    setNoAtivo(noTraco.no + 1);
```
10. No efeito de desenho, o laço `edicao.forEach((nos, i) => { ctx.beginPath(); ... ctx.closePath();` troca o trecho do caminho por `tracarCaminho(ctx, nos, emTela);`. O bloco das alças e dos nós, de `// As alças, só do nó ativo` até o fim de `escolhida.forEach`, vira `desenharNos(ctx, escolhida, noAtivo, emTela);`.

- [ ] **Step 3: Conferir tipos e build**

Run: `npx tsc --noEmit -p .`
Expected: sem saída, código 0.
Run: `npx vite build`
Expected: termina sem erro.

- [ ] **Step 4: Conferir à mão que nada mudou**

Run: `npm run dev` num terminal e `npx vite` noutro (ou a skill `run`). Abrir `/digitalizar`, mandar uma foto de `D:\arte\photo da laser`, e verificar: arrastar nó, arrastar alça, dois cliques no traço (nó novo, desenho igual), dois cliques no nó (apaga), Delete, Ctrl+Z, trocar reta/curva. Tudo como antes.

- [ ] **Step 5: Commit**

```bash
git add src/telas/risco/desenhoDeNos.ts src/telas/Digitalizar.tsx
git commit -m "O Digitalizar passa a usar o motor de nós e o desenho comum, sem mudar nada na tela"
```

---

### Task 3: Margem de costura

**Files:**
- Create: `src/motores/margemDeCostura.js`
- Create: `bancada/conferir-margem.mjs`
- Modify: `package.json` (script `bancada:margem`)

**Interfaces:**
- Produces:
  - `areaComSinalDe(pontos) → number` (fórmula do laço: `Σ a.x*b.y − b.x*a.y`, sobre 2)
  - `seCruza(pontos) → boolean`
  - `margemDeCostura(pontos, margem) → Ponto[] | null`: com `margem <= 0`, devolve os pontos limpos (sem repetidos). `null` quando sobram menos de 3 pontos, quando o resultado se cruza ou quando um trecho vira do avesso.

- [ ] **Step 1: Escrever o teste que falha**

```js
// bancada/conferir-margem.mjs
/*
 * BANCADA — a margem de costura
 *
 *     npm run bancada:margem
 *
 * A margem vira o CONTORNO que vai para o Encaixe: um erro aqui é tecido
 * cortado errado em todas as peças daquele molde. Os casos de baixo são os
 * que uma conta de offset ingênua erra: sentido da volta, quina aguda (a
 * ponta iria a metros de distância), fenda mais estreita que duas margens (as
 * paredes trocam de lado sem se cruzar) e vinco côncavo fundo.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const { margemDeCostura } = await carregarModulo("src/motores/margemDeCostura.js");
const caixa = (p) => {
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};
const perto = (a, b) => Math.abs(a - b) < 1e-6;

const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

// 1. Quadrado de 10 com margem 1 vira 12, nos dois sentidos da volta.
for (const volta of [quadrado, [...quadrado].reverse()]) {
  const c = caixa(margemDeCostura(volta, 1));
  assert.ok(perto(c.minX, -1) && perto(c.minY, -1) && perto(c.maxX, 11) && perto(c.maxY, 11), JSON.stringify(c));
}

// 2. Margem zero devolve o mesmo contorno.
assert.deepEqual(margemDeCostura(quadrado, 0), quadrado);

// 3. Quina aguda é aparada: a ponta não passa de 3 margens.
{
  const agudo = [{ x: 0, y: 0 }, { x: 1, y: 20 }, { x: 2, y: 0 }];
  const r = margemDeCostura(agudo, 1);
  assert.equal(r.length, 4, "a ponta vira dois pontos");
  assert.ok(caixa(r).maxY < 20 + 3);
}

// 4. Fenda mais estreita que duas margens: não há contorno certo — null.
{
  const u = [
    { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 3, y: 10 },
    { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 10 }, { x: 0, y: 10 },
  ];
  assert.equal(margemDeCostura(u, 1), null);
  assert.equal(margemDeCostura(u, 1.5), null);
  assert.equal(margemDeCostura(u, 0.3).length, 8, "com folga, a fenda continua");
}

// 5. Vinco côncavo largo: o fundo sobe pela bissetriz, e o contorno é válido.
{
  const v = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 7, y: 10 },
    { x: 5, y: 7 }, { x: 3, y: 10 }, { x: 0, y: 10 },
  ];
  const r = margemDeCostura(v, 1);
  assert.ok(r, "não pode dar null");
  const fundo = r.find((p) => perto(p.x, 5));
  assert.ok(fundo && fundo.y > 8.5 && fundo.y < 9, `fundo em ${JSON.stringify(fundo)}`);
}

// 6. Vinco côncavo estreito e fundo: null (o bevel alargaria o vinco).
{
  const v = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5.2, y: 10 },
    { x: 5, y: 3 }, { x: 4.8, y: 10 }, { x: 0, y: 10 },
  ];
  assert.equal(margemDeCostura(v, 1), null);
}

// 7. Círculo de raio 5 com margem 1 vira raio 6.
{
  const circ = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    circ.push({ x: 10 + 5 * Math.cos(a), y: 10 + 5 * Math.sin(a) });
  }
  const c = caixa(margemDeCostura(circ, 1));
  assert.ok(Math.abs(c.maxX - 16) < 0.01 && Math.abs(c.minX - 4) < 0.01, JSON.stringify(c));
}

// 8. Ponto repetido (acontece no achatar das curvas) não quebra a conta.
{
  const repetido = [quadrado[0], quadrado[1], quadrado[1], quadrado[2], quadrado[3], quadrado[0]];
  const c = caixa(margemDeCostura(repetido, 1));
  assert.ok(perto(c.maxX, 11));
}

console.log("OK — a margem de costura confere.");
```

- [ ] **Step 2: Registrar o script e rodar para ver falhar**

`package.json`: `"bancada:margem": "node bancada/conferir-margem.mjs",`
Run: `npm run bancada:margem`
Expected: FAIL (o arquivo do motor não existe).

- [ ] **Step 3: Escrever o motor**

```js
// src/motores/margemDeCostura.js
/**
 * ===========================================================================
 * MARGEM DE COSTURA — o contorno de corte em volta do risco
 * ===========================================================================
 *
 * Com margem, o risco que a pessoa desenhou é a linha de COSTURA, e o que vai
 * para o tecido é esta linha afastada para fora. O resultado vira o
 * `contorno` do molde — o que o Encaixe corta —, então a conta é conservadora:
 * quando não há resposta certa, devolve `null` e a tela avisa, em vez de
 * gravar um contorno torto.
 *
 * ---------------------------------------------------------------------------
 * A CONTA
 * ---------------------------------------------------------------------------
 *
 * Cada lado anda `margem` para fora, pela normal. Onde dois lados se
 * encontram, o ponto novo é o cruzamento das duas retas afastadas (junta em
 * ponta): `(n1 + n2) · margem / (1 + n1·n2)`. O "para fora" sai do sentido da
 * volta (o sinal da área), e é por isso que a conta não liga se o contorno
 * veio horário ou anti-horário.
 *
 * Quina CONVEXA muito aguda seria uma ponta a metros de distância; passou de
 * três margens, é aparada em dois pontos. Quina CÔNCAVA nunca é aparada:
 * aparar ali abriria o vinco em vez de fechá-lo, e o erro não se cruza (a
 * conferência não pegaria).
 *
 * ---------------------------------------------------------------------------
 * QUANDO NÃO HÁ RESPOSTA
 * ---------------------------------------------------------------------------
 *
 * Numa fenda mais estreita que duas margens, as paredes afastadas trocam de
 * lado. Às vezes isso cruza traço (pego pelo `seCruza`); às vezes elas só
 * passam uma pela outra, paralelas, e nada se cruza — mas o trecho fica do
 * AVESSO, andando ao contrário do lado original. As duas conferências juntas
 * pegam os dois casos. Resolver de verdade (fechar a fenda) pede recorte de
 * polígono, e não compensa para molde de roupa: quem tem uma fenda dessas
 * reduz a margem.
 */

/** Passou disso, a ponta de uma quina convexa é aparada. Em margens. */
const LIMITE_DA_PONTA = 3;
const EPS = 1e-9;

/** Metade do laço de Gauss. O sinal diz o sentido da volta. */
export function areaComSinalDe(pontos) {
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    soma += a.x * b.y - b.x * a.y;
  }
  return soma / 2;
}

/** Tira ponto repetido em sequência (o achatar das curvas deixa alguns). */
function semRepetidos(pontos) {
  const saida = [];
  for (const p of pontos) {
    const ultimo = saida[saida.length - 1];
    if (!ultimo || Math.hypot(p.x - ultimo.x, p.y - ultimo.y) > 1e-6) saida.push({ x: p.x, y: p.y });
  }
  while (saida.length > 1) {
    const a = saida[0];
    const b = saida[saida.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) break;
    saida.pop();
  }
  return saida;
}

const orientacao = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Algum par de lados não vizinhos se cruza? Quadrático, e basta: peça tem centenas de pontos. */
export function seCruza(pontos) {
  const n = pontos.length;
  for (let i = 0; i < n; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pontos[j];
      const d = pontos[(j + 1) % n];
      if (orientacao(a, b, c) * orientacao(a, b, d) < 0 && orientacao(c, d, a) * orientacao(c, d, b) < 0) {
        return true;
      }
    }
  }
  return false;
}

export function margemDeCostura(pontos, margem) {
  const p = semRepetidos(pontos);
  if (p.length < 3) return null;
  if (!(margem > 0)) return p;

  const sinal = areaComSinalDe(p) >= 0 ? 1 : -1;
  const n = p.length;
  const normal = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const comprimento = Math.hypot(dx, dy);
    return { x: (sinal * dy) / comprimento, y: (-sinal * dx) / comprimento };
  };

  // Os pontos novos de cada nó: um (junta em ponta) ou dois (ponta aparada).
  const porNo = [];
  for (let i = 0; i < n; i++) {
    const anterior = p[(i - 1 + n) % n];
    const atual = p[i];
    const proximo = p[(i + 1) % n];
    const n1 = normal(anterior, atual);
    const n2 = normal(atual, proximo);
    const denominador = 1 + n1.x * n2.x + n1.y * n2.y;
    const bx = n1.x + n2.x;
    const by = n1.y + n2.y;
    const cruz = (atual.x - anterior.x) * (proximo.y - atual.y) - (atual.y - anterior.y) * (proximo.x - atual.x);
    const concavo = cruz * sinal < 0;
    if (concavo && denominador <= EPS) return null;
    const ponta = denominador > EPS ? (margem * Math.hypot(bx, by)) / denominador : Infinity;

    if (concavo || ponta <= LIMITE_DA_PONTA * margem) {
      porNo.push([{ x: atual.x + (bx * margem) / denominador, y: atual.y + (by * margem) / denominador }]);
    } else {
      porNo.push([
        { x: atual.x + n1.x * margem, y: atual.y + n1.y * margem },
        { x: atual.x + n2.x * margem, y: atual.y + n2.y * margem },
      ]);
    }
  }

  // Cada lado afastado tem de andar para o mesmo lado que o original.
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const de = porNo[i][porNo[i].length - 1];
    const ate = porNo[(i + 1) % n][0];
    if ((b.x - a.x) * (ate.x - de.x) + (b.y - a.y) * (ate.y - de.y) <= 0) return null;
  }

  const saida = porNo.flat();
  return seCruza(saida) ? null : saida;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:margem`
Expected: `OK — a margem de costura confere.`

- [ ] **Step 5: Commit**

```bash
git add src/motores/margemDeCostura.js bancada/conferir-margem.mjs package.json
git commit -m "A margem de costura vira motor, e recusa o contorno que não tem resposta certa"
```

---

### Task 4: O motor da montagem

**Files:**
- Create: `src/motores/montagem.js`
- Create: `bancada/conferir-montagem.mjs`
- Modify: `package.json` (script `bancada:montagem`)

**Interfaces:**
- Consumes: `achatarCurvas(nos, porCurva=12)` de `./ajusteDeCurvas`; `margemDeCostura`, `areaComSinalDe` de `./margemDeCostura` (Task 3); `pontoNoTrecho`, `inserirNoNoTraco`, `apagarNo` de `./edicaoDeNos` (Task 1).
- Produces:
  - `PROFUNDIDADE_DO_PIQUE = 0.5`
  - `lerCm(texto) → number | null`: `"0,5"`→0.5, `""`→0, `"-1"`→0, `"abc"`→null
  - `caixaDe(pontos) → { minX, minY, maxX, maxY, largura, altura }`
  - `nosDoPoligono(pontos) → No[]` (todos `canto: true, retaDepois: true`)
  - `marcacoesPadrao(nos) → Marcacoes`
  - `pecaParaMontar(peca) → peca com nos e marcacoes` (peça sem `nos` vira nós de canto)
  - `posicaoDoPique(nos, pique) → { ponto, fora }` (`fora` = normal unitária para fora)
  - `inserirNoNaPeca(peca, i, t) → peca` (remapeia piques exatamente)
  - `apagarNoDaPeca(peca, i) → peca | null` (remapeia piques)
  - `pecaParaGravar(peca) → { peca } | { erro }`: calcula `contorno`/`largura`/`altura` e encosta tudo no canto (0,0) do corte
  - `pecasParaOEncaixe(pecas) → pecas` (desdobra o espelhar)
  - `desenhoDaPeca(peca) → Desenho`, com `Desenho = { largura, altura, corte: No[], costura: No[] | null, piques: {de,ate}[], pontos: Ponto[], fio: { linha: [Ponto,Ponto], setas: Ponto[][] } | null, texto: { x, y, tamanho, linhas: string[] } }`
  - `arranjar(desenhos, larguraMaxima=150, folga=2) → (Desenho & { emX, emY })[]`
  - `svgDaMontagem(arranjados, nome) → string`

- [ ] **Step 1: Escrever o teste que falha**

```js
// bancada/conferir-montagem.mjs
/*
 * BANCADA — as contas da Montagem
 *
 *     npm run bancada:montagem
 *
 * O pique preso ao traço, o molde de DXF que volta igual, o espelhar e a
 * margem que vira contorno. Ver o Review Focus do plano
 * docs/superpowers/plans/2026-09-26-montagem-de-moldes.md.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const m = await carregarModulo("src/motores/montagem.js");
const e = await carregarModulo("src/motores/edicaoDeNos.js");
const perto = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;

const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const pecaQuadrada = () => m.pecaParaMontar({
  tamanho: "base", papel: "frente", nome: null, quantidade: 1,
  largura: 10, altura: 10, contorno: quadrado, furos: [], origem: "DXF",
});

// 1. lerCm aceita vírgula, vazio e negativo; recusa texto.
assert.equal(m.lerCm("0,5"), 0.5);
assert.equal(m.lerCm(""), 0);
assert.equal(m.lerCm("-1"), 0);
assert.equal(m.lerCm("abc"), null);

// 2. Peça de DXF (só polígono) volta com o mesmo contorno, se ninguém mexer.
{
  const p = pecaQuadrada();
  assert.equal(p.nos.length, 4);
  assert.ok(p.nos.every((n) => n.canto && n.retaDepois));
  const g = m.pecaParaGravar(p);
  assert.ok(g.peca, g.erro);
  assert.deepEqual(g.peca.contorno, quadrado);
  assert.equal(g.peca.largura, 10);
  assert.equal(g.peca.altura, 10);
}

// 3. Marcações padrão: fio vertical no meio, 60% da altura, margem 0.
{
  const mc = pecaQuadrada().marcacoes;
  assert.deepEqual(mc.fio, { x: 5, y: 5, angulo: 0, comprimento: 6 });
  assert.equal(mc.margem, 0);
  assert.equal(mc.espelhar, false);
}

// 4. Margem 1: o contorno cresce, e o risco, o fio e os pontos andam junto.
{
  const p = pecaQuadrada();
  p.marcacoes = { ...p.marcacoes, margem: 1, pontos: [{ x: 2, y: 2 }] };
  const g = m.pecaParaGravar(p).peca;
  assert.equal(g.largura, 12);
  assert.ok(perto(g.nos[0], { x: 1, y: 1 }), "o risco anda para dentro do corte");
  assert.ok(perto(g.marcacoes.pontos[0], { x: 3, y: 3 }));
  assert.ok(perto(g.marcacoes.fio, { x: 6, y: 6 }));
  assert.ok(g.contorno.every((q) => q.x >= 0 && q.y >= 0), "encostado no canto");
}

// 5. Margem que se cruza: erro, e nada de contorno.
{
  const u = m.pecaParaMontar({
    tamanho: "base", papel: "outro", quantidade: 1, largura: 5, altura: 10, furos: [],
    contorno: [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 3, y: 10 },
      { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 10 }, { x: 0, y: 10 },
    ],
  });
  u.marcacoes = { ...u.marcacoes, margem: 1 };
  const g = m.pecaParaGravar(u);
  assert.ok(g.erro && !g.peca);
}

// 6. Pique: pôr nó ANTES dele não o tira do lugar.
{
  let p = pecaQuadrada();
  p.marcacoes = { ...p.marcacoes, piques: [{ no: 0, t: 0.7, profundidade: 0.5 }, { no: 2, t: 0.5, profundidade: 0.5 }] };
  const antes = p.marcacoes.piques.map((q) => m.posicaoDoPique(p.nos, q).ponto);
  p = m.inserirNoNaPeca(p, 0, 0.4);
  const depois = p.marcacoes.piques.map((q) => m.posicaoDoPique(p.nos, q).ponto);
  assert.ok(perto(antes[0], depois[0]), `${JSON.stringify(antes[0])} → ${JSON.stringify(depois[0])}`);
  assert.ok(perto(antes[1], depois[1]));
  assert.deepEqual(p.marcacoes.piques.map((q) => q.no), [1, 3]);
}

// 7. Pique numa curva: continua em cima do mesmo ponto depois do nó novo.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: -6 }, retaDepois: false },
    { x: 10, y: 0, entrada: { x: 7, y: -6 }, saida: { x: 10, y: 0 }, retaDepois: true },
    { x: 10, y: 10, entrada: { x: 10, y: 10 }, saida: { x: 10, y: 10 }, retaDepois: true },
    { x: 0, y: 10, entrada: { x: 0, y: 10 }, saida: { x: 0, y: 10 }, retaDepois: true },
  ];
  let p = { tamanho: "base", papel: "costas", quantidade: 1, nos, marcacoes: m.marcacoesPadrao(nos), contorno: [], furos: [] };
  p.marcacoes.piques = [{ no: 0, t: 0.2, profundidade: 0.5 }];
  const antes = m.posicaoDoPique(p.nos, p.marcacoes.piques[0]).ponto;
  p = m.inserirNoNaPeca(p, 0, 0.6);
  assert.ok(perto(antes, m.posicaoDoPique(p.nos, p.marcacoes.piques[0]).ponto, 1e-9));
}

// 8. A normal do pique aponta para fora, nos dois sentidos da volta.
for (const volta of [quadrado, [...quadrado].reverse()]) {
  const nos = m.nosDoPoligono(volta);
  // O lado y = 0: trecho 0 na volta original; na invertida, (10,0) → (0,0) é o trecho 2.
  const baixo = volta === quadrado ? 0 : 2;
  const { fora } = m.posicaoDoPique(nos, { no: baixo, t: 0.5, profundidade: 0.5 });
  assert.ok(perto(fora, { x: 0, y: -1 }), JSON.stringify(fora));
}

// 9. Apagar o nó de um trecho com pique: o pique vai para o trecho que sobra.
{
  let p = pecaQuadrada();
  p = m.inserirNoNaPeca(p, 0, 0.5); // 5 nós; o nó 1 é o (5,0)
  p.marcacoes = { ...p.marcacoes, piques: [{ no: 1, t: 0.5, profundidade: 0.5 }, { no: 3, t: 0.5, profundidade: 0.5 }] };
  const r = m.apagarNoDaPeca(p, 1);
  assert.equal(r.nos.length, 4);
  assert.deepEqual(r.marcacoes.piques.map((q) => q.no), [0, 2]);
  assert.ok(Math.abs(r.marcacoes.piques[0].t - 0.75) < 1e-9);
  assert.equal(m.apagarNoDaPeca(m.pecaParaMontar({ contorno: quadrado.slice(0, 3), quantidade: 1 }), 0), null);
}

// 10. Espelhar ×3: 2 normais e 1 espelhada, com o furo espelhado junto.
{
  const furo = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  const peca = {
    papel: "manga", nome: null, quantidade: 3, largura: 10, altura: 10,
    contorno: quadrado, furos: [furo], marcacoes: { espelhar: true },
  };
  const r = m.pecasParaOEncaixe([peca]);
  assert.equal(r.length, 2);
  assert.equal(r[0].quantidade, 2);
  assert.equal(r[1].quantidade, 1);
  assert.ok(r[1].furos[0].some((q) => perto(q, { x: 9, y: 1 })));
  assert.ok(r[1].nome.includes("espelhada"));
  assert.equal(m.pecasParaOEncaixe([{ ...peca, quantidade: 1 }]).length, 1);
  assert.equal(m.pecasParaOEncaixe([{ ...peca, marcacoes: null }]).length, 1);
}

// 11. Desenho com margem: corte em volta, costura dentro, pique atravessa as duas.
{
  const p = pecaQuadrada();
  p.marcacoes = { ...p.marcacoes, margem: 1, piques: [{ no: 0, t: 0.5, profundidade: 0.5 }] };
  const d = m.desenhoDaPeca(m.pecaParaGravar(p).peca);
  assert.ok(d.costura && d.costura.length === 4);
  assert.ok(perto(d.piques[0].de, { x: 6, y: 0 }), JSON.stringify(d.piques[0]));
  assert.ok(perto(d.piques[0].ate, { x: 6, y: 1.5 }));
  assert.equal(d.texto.linhas[0], "frente");
}

// 12. SVG: cm no tamanho, uma camada por tipo.
{
  const d = m.desenhoDaPeca(m.pecaParaGravar(pecaQuadrada()).peca);
  const svg = m.svgDaMontagem(m.arranjar([d, d]), "camisa <teste>");
  assert.match(svg, /width="22cm"/);
  for (const id of ["corte", "costura", "piques", "pontos", "fio", "textos"]) assert.match(svg, new RegExp(`<g id="${id}"`));
  assert.ok(!svg.includes("<teste>"), "nome escapado");
}

console.log("OK — as contas da Montagem conferem.");
```

- [ ] **Step 2: Registrar o script e rodar para ver falhar**

`package.json`: `"bancada:montagem": "node bancada/conferir-montagem.mjs",`
Run: `npm run bancada:montagem`
Expected: FAIL (o arquivo do motor não existe).

- [ ] **Step 3: Escrever o motor**

```js
// src/motores/montagem.js
/**
 * ===========================================================================
 * MONTAGEM — as contas do molde montado
 * ===========================================================================
 *
 * A tela de Montagem (`telas/Montagem.tsx`) edita um molde da estante: o risco
 * em nós com alça, e as marcações — piques, pontos, fio, margem, espelhar. Aqui
 * mora tudo o que é conta, para a tela só desenhar e para a bancada conferir.
 * Ver docs/superpowers/specs/2026-09-26-montagem-de-moldes-design.md.
 *
 * ---------------------------------------------------------------------------
 * O PIQUE MORA NO TRAÇO, NÃO NO PAPEL
 * ---------------------------------------------------------------------------
 *
 * Um pique não é um (x, y): é "no trecho que começa no nó tal, na posição t".
 * Assim, quando a pessoa arrasta um nó, o pique vai junto com o traço em vez
 * de ficar flutuando onde a curva estava — e, na graduação (parte 2), cada
 * tamanho leva o pique no lugar certo sem ninguém remarcar.
 *
 * O preço é remapear quando a lista de nós muda: pôr nó no meio de um trecho
 * parte o trecho em dois (e o `t` do pique precisa saber em qual metade caiu),
 * e apagar um nó junta dois trechos.
 *
 * ---------------------------------------------------------------------------
 * O QUE VAI PARA O BANCO É O CORTE
 * ---------------------------------------------------------------------------
 *
 * `pecaParaGravar` calcula o `contorno` — risco achatado + margem — e encosta
 * TUDO no canto do corte, porque é assim que o resto do programa lê um molde:
 * contorno relativo ao canto da peça, de 0 até a largura. O Encaixe e a
 * estampa não sabem que existe risco, margem ou pique, e não precisam saber.
 */

import { achatarCurvas } from "./ajusteDeCurvas";
import { areaComSinalDe, margemDeCostura } from "./margemDeCostura";
import { apagarNo, inserirNoNoTraco, pontoNoTrecho } from "./edicaoDeNos";

/** Meio centímetro: o pique que a tesoura faz sem pensar. */
export const PROFUNDIDADE_DO_PIQUE = 0.5;

const arredondar = (v, casas = 4) => Number(v.toFixed(casas));

/** O que a pessoa digitou num campo de cm. Vírgula vale ponto; vazio é zero. */
export function lerCm(texto) {
  const limpo = String(texto ?? "").trim().replace(",", ".");
  if (limpo === "") return 0;
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

export function caixaDe(pontos) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of pontos) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, largura: maxX - minX, altura: maxY - minY };
}

/** Um polígono (molde de DXF, contorno de corte) como nós de canto e reta. */
export function nosDoPoligono(pontos) {
  return pontos.map((p) => ({
    x: p.x, y: p.y, entrada: { x: p.x, y: p.y }, saida: { x: p.x, y: p.y }, canto: true, retaDepois: true,
  }));
}

export function marcacoesPadrao(nos) {
  const c = caixaDe(achatarCurvas(nos));
  return {
    margem: 0,
    espelhar: false,
    fio: {
      x: arredondar(c.minX + c.largura / 2),
      y: arredondar(c.minY + c.altura / 2),
      angulo: 0,
      comprimento: arredondar(c.altura * 0.6, 2),
    },
    piques: [],
    pontos: [],
  };
}

/** Uma peça do banco pronta para a mesa: sempre com nós e marcações. */
export function pecaParaMontar(peca) {
  const nos = Array.isArray(peca.nos) && peca.nos.length >= 3 ? peca.nos : nosDoPoligono(peca.contorno);
  const marcacoes = peca.marcacoes ?? marcacoesPadrao(nos);
  return { ...peca, nos, marcacoes };
}

/** A derivada da cúbica em `t` — a direção do traço naquele ponto. */
function derivada(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/** Onde o pique está, e para que lado é "fora" da peça ali. */
export function posicaoDoPique(nos, pique) {
  const a = nos[pique.no];
  const b = nos[(pique.no + 1) % nos.length];
  const ponto = pontoNoTrecho(nos, pique.no, pique.t);
  let d = a.retaDepois ? { x: b.x - a.x, y: b.y - a.y } : derivada(a, a.saida, b.entrada, b, pique.t);
  // Alça em cima do nó zera a derivada na ponta; a corda dá a direção certa.
  if (Math.hypot(d.x, d.y) < 1e-9) d = { x: b.x - a.x, y: b.y - a.y };
  const comprimento = Math.hypot(d.x, d.y) || 1;
  const sinal = areaComSinalDe(achatarCurvas(nos)) >= 0 ? 1 : -1;
  return { ponto, fora: { x: (sinal * d.y) / comprimento, y: (-sinal * d.x) / comprimento } };
}

/**
 * Põe um nó no trecho `i`, em `t`, e leva os piques junto.
 *
 * A divisão de Casteljau preserva o parâmetro: o ponto em `tp` da curva
 * original é o ponto em `tp / t` da primeira metade, e em `(tp − t) / (1 − t)`
 * da segunda. Por isso aqui o remapeamento é EXATO, e a bancada confere.
 */
export function inserirNoNaPeca(peca, i, t) {
  const nos = inserirNoNoTraco(peca.nos, i, t);
  const piques = peca.marcacoes.piques.map((p) => {
    if (p.no < i) return p;
    if (p.no > i) return { ...p, no: p.no + 1 };
    return p.t < t ? { ...p, t: p.t / t } : { ...p, no: i + 1, t: (p.t - t) / (1 - t) };
  });
  return { ...peca, nos, marcacoes: { ...peca.marcacoes, piques } };
}

/**
 * Apaga o nó `i` e leva os piques para o trecho que sobra.
 *
 * Os dois trechos que encostavam no nó viram um só. O pique do primeiro fica
 * na primeira metade do trecho novo, o do segundo na segunda. Aqui é
 * aproximado — o trecho novo tem outra forma —, mas o pique continua no
 * traço e na mesma ordem, que é o que importa para costurar.
 */
export function apagarNoDaPeca(peca, i) {
  const nos = apagarNo(peca.nos, i);
  if (!nos) return null;
  const n = peca.nos.length;
  const anterior = (i - 1 + n) % n;
  const piques = peca.marcacoes.piques.map((p) => {
    let no = p.no;
    let t = p.t;
    if (no === anterior) t = t / 2;
    else if (no === i) { no = anterior; t = 0.5 + t / 2; }
    if (no > i) no -= 1;
    return { ...p, no, t };
  });
  return { ...peca, nos, marcacoes: { ...peca.marcacoes, piques } };
}

/**
 * A peça como vai para o banco: `contorno` = corte, tudo encostado no canto.
 * `{ erro }` quando a margem não tem resposta (ver `margemDeCostura`).
 */
export function pecaParaGravar(peca) {
  const margem = peca.marcacoes.margem;
  const corte = margemDeCostura(achatarCurvas(peca.nos), margem);
  if (!corte) {
    return {
      erro: margem > 0
        ? `a margem de ${String(margem).replace(".", ",")} cm fecha a peça sobre ela mesma — diminua a margem`
        : "o risco da peça tem menos de três pontos",
    };
  }
  const c = caixaDe(corte);
  const mover = (p) => ({ x: arredondar(p.x - c.minX), y: arredondar(p.y - c.minY) });
  const nos = peca.nos.map((n) => ({ ...n, ...mover(n), entrada: mover(n.entrada), saida: mover(n.saida) }));
  return {
    peca: {
      ...peca,
      nos,
      marcacoes: {
        ...peca.marcacoes,
        fio: { ...peca.marcacoes.fio, ...mover(peca.marcacoes.fio) },
        pontos: peca.marcacoes.pontos.map(mover),
      },
      contorno: corte.map(mover),
      largura: arredondar(c.largura, 2),
      altura: arredondar(c.altura, 2),
    },
  };
}

/**
 * As peças como o Encaixe as recebe: a espelhada vira uma peça a mais.
 *
 * O espelho é no CONTORNO (x → largura − x), e a ordem é invertida para a
 * volta continuar no mesmo sentido. A arte entra no contorno espelhado como
 * entra em qualquer outro. Com quantidade ímpar, a espelhada é a de baixo.
 */
export function pecasParaOEncaixe(pecas) {
  return pecas.flatMap((p) => {
    const q = p.quantidade;
    if (!p.marcacoes?.espelhar || q < 2) return [p];
    const espelhar = (pt) => ({ x: p.largura - pt.x, y: pt.y });
    return [
      { ...p, quantidade: Math.ceil(q / 2) },
      {
        ...p,
        nome: `${p.nome || p.papel} (espelhada)`,
        quantidade: Math.floor(q / 2),
        contorno: p.contorno.map(espelhar).reverse(),
        furos: (p.furos || []).map((f) => f.map(espelhar).reverse()),
      },
    ];
  });
}

/**
 * O que se desenha de uma peça no PDF, no SVG e na mesa.
 *
 * Tudo sai daqui, e os três só pintam: se o PDF e o SVG calculassem cada um o
 * seu pique, um dia um deles o poria do lado de dentro.
 *
 * Aceita peça gravada (encostada no canto) ou peça em edição — é por isso que
 * o texto se centra pela caixa do contorno, e não por `largura / 2`.
 */
export function desenhoDaPeca(peca) {
  const margem = peca.marcacoes.margem;
  const corte = margem > 0 ? nosDoPoligono(peca.contorno) : peca.nos;
  const piques = peca.marcacoes.piques
    .filter((p) => p.no < peca.nos.length)
    .map((p) => {
      const { ponto, fora } = posicaoDoPique(peca.nos, p);
      return {
        de: { x: ponto.x + fora.x * margem, y: ponto.y + fora.y * margem },
        ate: { x: ponto.x - fora.x * p.profundidade, y: ponto.y - fora.y * p.profundidade },
      };
    });

  const f = peca.marcacoes.fio;
  let fio = null;
  if (f.comprimento > 0) {
    const rad = (f.angulo * Math.PI) / 180;
    const dir = { x: Math.sin(rad), y: Math.cos(rad) };
    const lado = { x: -dir.y, y: dir.x };
    const meio = f.comprimento / 2;
    const de = { x: f.x - dir.x * meio, y: f.y - dir.y * meio };
    const ate = { x: f.x + dir.x * meio, y: f.y + dir.y * meio };
    const s = Math.min(1, f.comprimento / 6);
    const ponta = (p, sentido) => [
      { x: p.x - sentido * dir.x * s + lado.x * s * 0.5, y: p.y - sentido * dir.y * s + lado.y * s * 0.5 },
      p,
      { x: p.x - sentido * dir.x * s - lado.x * s * 0.5, y: p.y - sentido * dir.y * s - lado.y * s * 0.5 },
    ];
    fio = { linha: [de, ate], setas: [ponta(ate, 1), ponta(de, -1)] };
  }

  const c = caixaDe(peca.contorno);
  const tamanho = Math.max(0.4, Math.min(1.5, Math.min(c.largura, c.altura) / 12));
  const nome = peca.papel === "outro" || !peca.papel ? (peca.nome || "outro") : peca.papel;
  return {
    largura: peca.largura,
    altura: peca.altura,
    corte,
    costura: margem > 0 ? peca.nos : null,
    piques,
    pontos: peca.marcacoes.pontos,
    fio,
    texto: {
      x: c.minX + c.largura / 2,
      y: c.minY + c.altura * 0.35,
      tamanho,
      linhas: [nome, `${peca.tamanho} · ×${peca.quantidade}${peca.marcacoes.espelhar ? " espelhar" : ""}`],
    },
  };
}

/** Lado a lado, quebrando a linha em `larguraMaxima` cm. Para o PDF, o SVG e o "ver todas". */
export function arranjar(desenhos, larguraMaxima = 150, folga = 2) {
  let x = 0;
  let y = 0;
  let alturaDaLinha = 0;
  return desenhos.map((d) => {
    if (x > 0 && x + d.largura > larguraMaxima) {
      x = 0;
      y += alturaDaLinha + folga;
      alturaDaLinha = 0;
    }
    const posto = { ...d, emX: x, emY: y };
    x += d.largura + folga;
    alturaDaLinha = Math.max(alturaDaLinha, d.altura);
    return posto;
  });
}

const casas = (n) => Number(n.toFixed(3));
const escapar = (t) => String(t).replace(/[<&>"]/g, " ").trim();

/** `C` onde é curva e `L` onde é reta — ver o mesmo cuidado em `svgDosRiscos`. */
function caminhoDosNos(nos, dx, dy) {
  const em = (q) => `${casas(q.x + dx)} ${casas(q.y + dy)}`;
  const partes = [`M${em(nos[0])}`];
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i];
    const b = nos[(i + 1) % nos.length];
    partes.push(a.retaDepois ? `L${em(b)}` : `C${em(a.saida)} ${em(b.entrada)} ${em(b)}`);
  }
  return `${partes.join(" ")} Z`;
}

/**
 * O molde montado em SVG, medido em cm, uma camada (`<g id>`) por tipo de
 * traço: no Corel, esconder os textos ou os piques é um clique na camada.
 */
export function svgDaMontagem(arranjados, nome = "molde") {
  let largura = 0;
  let altura = 0;
  for (const d of arranjados) {
    largura = Math.max(largura, d.emX + d.largura);
    altura = Math.max(altura, d.emY + d.altura);
  }
  const linha = (a, b, dx, dy) => `<line x1="${casas(a.x + dx)}" y1="${casas(a.y + dy)}" x2="${casas(b.x + dx)}" y2="${casas(b.y + dy)}"/>`;
  const corte = []; const costura = []; const piques = []; const pontos = []; const fio = []; const textos = [];
  for (const d of arranjados) {
    const { emX: dx, emY: dy } = d;
    corte.push(`<path d="${caminhoDosNos(d.corte, dx, dy)}"/>`);
    if (d.costura) costura.push(`<path d="${caminhoDosNos(d.costura, dx, dy)}"/>`);
    for (const p of d.piques) piques.push(linha(p.de, p.ate, dx, dy));
    for (const p of d.pontos) {
      pontos.push(`<circle cx="${casas(p.x + dx)}" cy="${casas(p.y + dy)}" r="0.3"/>`);
      pontos.push(linha({ x: p.x - 0.4, y: p.y }, { x: p.x + 0.4, y: p.y }, dx, dy));
      pontos.push(linha({ x: p.x, y: p.y - 0.4 }, { x: p.x, y: p.y + 0.4 }, dx, dy));
    }
    if (d.fio) {
      fio.push(linha(d.fio.linha[0], d.fio.linha[1], dx, dy));
      for (const s of d.fio.setas) fio.push(`<polyline points="${s.map((q) => `${casas(q.x + dx)},${casas(q.y + dy)}`).join(" ")}"/>`);
    }
    d.texto.linhas.forEach((l, i) => {
      textos.push(`<text x="${casas(d.texto.x + dx)}" y="${casas(d.texto.y + dy + i * d.texto.tamanho * 1.3)}" font-size="${casas(d.texto.tamanho)}">${escapar(l)}</text>`);
    });
  }
  const grupo = (id, estilo, itens) => `  <g id="${id}" ${estilo}>\n    ${itens.join("\n    ")}\n  </g>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${casas(largura)}cm" height="${casas(altura)}cm"
     viewBox="0 0 ${casas(largura)} ${casas(altura)}">
  <title>${escapar(nome) || "molde"}</title>
${grupo("corte", 'fill="none" stroke="#000" stroke-width="0.05"', corte)}
${grupo("costura", 'fill="none" stroke="#000" stroke-width="0.03" stroke-dasharray="0.4 0.25"', costura)}
${grupo("piques", 'stroke="#000" stroke-width="0.05"', piques)}
${grupo("pontos", 'fill="none" stroke="#000" stroke-width="0.03"', pontos)}
${grupo("fio", 'fill="none" stroke="#000" stroke-width="0.04"', fio)}
${grupo("textos", 'fill="#000" font-family="Arial, sans-serif" text-anchor="middle"', textos)}
</svg>
`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:montagem`
Expected: `OK — as contas da Montagem conferem.`

- [ ] **Step 5: Commit**

```bash
git add src/motores/montagem.js bancada/conferir-montagem.mjs package.json
git commit -m "O motor da Montagem: pique preso ao traço, corte com margem, espelhar e SVG em camadas"
```

---

### Task 5: O banco guarda situação, nós e marcações

**Files:**
- Create: `servidor/moldes-pecas.js`
- Create: `bancada/conferir-moldes-pecas.cjs`
- Modify: `servidor/moldes-api.js`
- Modify: `servidor/db.js` (depois da linha `garantirColuna("encaixe_historico", "features_versao", "INTEGER");`)
- Modify: `src/api/moldes.ts`
- Modify: `src/telas/moldes/vocabulario.ts`, `src/telas/moldes/EditorDeMolde.tsx`
- Modify: `package.json` (script `bancada:moldes-pecas`)

**Interfaces:**
- Produces (`servidor/moldes-pecas.js`, CommonJS): `PAPEIS`, `arrumarPeca(bruta, ordem) → linha | null`, `lerSituacao(v) → "rascunho" | "pronto" | null`, `pecaDoBanco(linha) → peça`
- Produces (`src/api/moldes.ts`): `type SituacaoDoMolde = "rascunho" | "pronto"`, `interface Marcacoes`; `PecaDoMolde.nos?: NoDoRisco[] | null`, `PecaDoMolde.marcacoes?: Marcacoes | null`, `Molde.situacao`, `MoldeNaEstante.situacao`, `MoldeParaGravar.situacao?`

- [ ] **Step 1: Escrever o teste que falha**

```js
// bancada/conferir-moldes-pecas.cjs
/*
 * BANCADA — a peça que o servidor aceita guardar
 *
 *     npm run bancada:moldes-pecas
 *
 * O ponto que mais importa: uma peça que veio SEM `nos` (do passo a passo
 * antigo, de DXF) continua sem, e uma que veio COM continua com — o servidor
 * não inventa nem perde o risco.
 */
const assert = require("node:assert/strict");
const { arrumarPeca, lerSituacao, pecaDoBanco } = require("../servidor/moldes-pecas");

const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const no = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });

// 1. Sem nós: igual a antes.
{
  const l = arrumarPeca({ papel: "Frente", contorno: quadrado, largura: 10, altura: 10 }, 0);
  assert.equal(l.papel, "frente");
  assert.equal(l.nos, null);
  assert.equal(l.marcacoes, null);
}

// 2. Com nós e marcações: guardados, e voltam iguais.
{
  const marcacoes = {
    margem: 1, espelhar: true, fio: { x: 5, y: 5, angulo: 0, comprimento: 6 },
    piques: [{ no: 0, t: 0.5, profundidade: 0.5 }], pontos: [{ x: 2, y: 2 }],
  };
  const l = arrumarPeca({ contorno: quadrado, nos: quadrado.map((p) => no(p.x, p.y)), marcacoes }, 3);
  const volta = pecaDoBanco({ ...l, id: 1 });
  assert.equal(volta.nos.length, 4);
  assert.deepEqual(volta.marcacoes, marcacoes);
  assert.deepEqual(volta.contorno, quadrado);
}

// 3. Marcação estranha é limpa: pique fora dos nós, margem absurda, NaN.
{
  const l = arrumarPeca({
    contorno: quadrado, nos: quadrado.map((p) => no(p.x, p.y)),
    marcacoes: { margem: "abc", fio: {}, piques: [{ no: 9, t: 0.5, profundidade: 0.5 }, { no: 1, t: 2, profundidade: 1 }], pontos: [{ x: "a" }] },
  }, 0);
  const mc = JSON.parse(l.marcacoes);
  assert.equal(mc.margem, 0);
  assert.deepEqual(mc.piques, []);
  assert.deepEqual(mc.pontos, []);
}

// 4. Nós quebrados: a peça continua (pelo contorno), sem nós.
assert.equal(arrumarPeca({ contorno: quadrado, nos: [{ x: 1 }] }, 0).nos, null);

// 5. Situação.
assert.equal(lerSituacao("rascunho"), "rascunho");
assert.equal(lerSituacao("pronto"), "pronto");
assert.equal(lerSituacao("x"), null);

console.log("OK — o servidor guarda nós e marcações sem inventar nem perder.");
```

- [ ] **Step 2: Registrar o script e rodar para ver falhar**

`package.json`: `"bancada:moldes-pecas": "node bancada/conferir-moldes-pecas.cjs",`
Run: `npm run bancada:moldes-pecas`
Expected: FAIL — `Cannot find module '../servidor/moldes-pecas'`.

- [ ] **Step 3: Escrever `servidor/moldes-pecas.js`**

Os `PAPEIS` e o `arrumarPeca` **saem** de `moldes-api.js` para cá, com o acréscimo de `nos`/`marcacoes`:

```js
/**
 * A peça de molde como o servidor aceita guardar — conferida e limpa.
 *
 * Saiu de `moldes-api.js` para poder ser testada sem abrir o banco
 * (`bancada/conferir-moldes-pecas.cjs`): lá, o `require("./db")` abre o
 * dados.db de verdade no primeiro `require`.
 *
 * `nos` e `marcacoes` são da tela de Montagem. A peça que chega sem eles (o
 * passo a passo antigo, um DXF) continua sem, e é só polígono como sempre foi.
 */

/** Papéis conhecidos. "outro" aceita qualquer nome escrito à mão. */
const PAPEIS = [
  "frente", "costas", "manga direita", "manga esquerda", "manga",
  "gola", "punho", "cós", "bolso", "vista", "forro", "outro",
];

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function lerPonto(p) {
  const x = numero(p && p.x);
  const y = numero(p && p.y);
  return x === null || y === null ? null : { x, y };
}

function lerNos(brutos) {
  if (!Array.isArray(brutos) || brutos.length < 3) return null;
  const nos = [];
  for (const n of brutos) {
    const centro = lerPonto(n);
    if (!centro) return null;
    nos.push({
      ...centro,
      entrada: lerPonto(n.entrada) || centro,
      saida: lerPonto(n.saida) || centro,
      canto: !!n.canto,
      retaDepois: !!n.retaDepois,
    });
  }
  return nos;
}

function lerMarcacoes(bruta, totalDeNos) {
  if (!bruta || typeof bruta !== "object") return null;
  const fio = bruta.fio || {};
  return {
    margem: Math.max(0, Math.min(10, numero(bruta.margem) || 0)),
    espelhar: !!bruta.espelhar,
    fio: {
      x: numero(fio.x) || 0,
      y: numero(fio.y) || 0,
      angulo: numero(fio.angulo) || 0,
      comprimento: Math.max(0, numero(fio.comprimento) || 0),
    },
    piques: (Array.isArray(bruta.piques) ? bruta.piques : [])
      .map((p) => ({ no: Math.floor(numero(p && p.no) ?? -1), t: numero(p && p.t), profundidade: numero(p && p.profundidade) }))
      .filter((p) => p.no >= 0 && p.no < totalDeNos && p.t !== null && p.t >= 0 && p.t <= 1
        && p.profundidade > 0 && p.profundidade <= 5),
    pontos: (Array.isArray(bruta.pontos) ? bruta.pontos : []).map(lerPonto).filter(Boolean),
  };
}

/** Confere e limpa uma peça que chegou da tela. `null` quando não tem contorno. */
function arrumarPeca(bruta, ordem) {
  const contorno = Array.isArray(bruta && bruta.contorno) ? bruta.contorno : null;
  if (!contorno || contorno.length < 3) return null;

  const pontos = contorno.map(lerPonto).filter(Boolean);
  if (pontos.length < 3) return null;

  const furos = (Array.isArray(bruta.furos) ? bruta.furos : [])
    .map((f) => (Array.isArray(f) ? f.map((p) => ({ x: Number(p.x), y: Number(p.y) })) : []))
    .filter((f) => f.length >= 3);

  const nos = lerNos(bruta.nos);
  const marcacoes = nos ? lerMarcacoes(bruta.marcacoes, nos.length) : null;

  const papel = String(bruta.papel || "outro").trim().toLowerCase();
  return {
    tamanho: String(bruta.tamanho || "único").trim() || "único",
    papel: papel || "outro",
    nome: String(bruta.nome || "").trim() || null,
    quantidade: Math.max(1, Math.floor(Number(bruta.quantidade) || 1)),
    largura: Number(bruta.largura) || 0,
    altura: Number(bruta.altura) || 0,
    contorno: JSON.stringify(pontos),
    furos: furos.length > 0 ? JSON.stringify(furos) : null,
    origem: String(bruta.origem || "").trim() || null,
    nos: nos ? JSON.stringify(nos) : null,
    marcacoes: marcacoes ? JSON.stringify(marcacoes) : null,
    ordem,
  };
}

function lerSituacao(valor) {
  return valor === "rascunho" || valor === "pronto" ? valor : null;
}

/** A linha de `molde_pecas` como a tela a recebe. */
function pecaDoBanco(linha) {
  return {
    ...linha,
    contorno: JSON.parse(linha.contorno),
    furos: linha.furos ? JSON.parse(linha.furos) : [],
    nos: linha.nos ? JSON.parse(linha.nos) : null,
    marcacoes: linha.marcacoes ? JSON.parse(linha.marcacoes) : null,
  };
}

module.exports = { PAPEIS, arrumarPeca, lerSituacao, pecaDoBanco };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:moldes-pecas`
Expected: `OK — o servidor guarda nós e marcações sem inventar nem perder.`

- [ ] **Step 5: Ligar no banco e na API**

`servidor/db.js`, depois do último `garantirColuna(...)` do bloco:
```js
// A Montagem (docs/superpowers/specs/2026-09-26-montagem-de-moldes-design.md):
// o molde que o Digitalizar acabou de criar é RASCUNHO até alguém concluir,
// e a peça guarda o risco em nós com alça e as marcações, além do contorno
// de corte de sempre. Os moldes que já existiam nascem prontos.
garantirColuna("moldes", "situacao", "TEXT NOT NULL DEFAULT 'pronto'");
garantirColuna("molde_pecas", "nos", "TEXT");
garantirColuna("molde_pecas", "marcacoes", "TEXT");
```

`servidor/moldes-api.js`:
1. Apagar a constante `PAPEIS` e a função `arrumarPeca` locais. No topo:
```js
const { PAPEIS, arrumarPeca, lerSituacao, pecaDoBanco } = require("./moldes-pecas");
```
2. `pecasDoMolde` vira:
```js
function pecasDoMolde(moldeId) {
  return db.prepare("SELECT * FROM molde_pecas WHERE molde_id = ? ORDER BY ordem, id").all(moldeId).map(pecaDoBanco);
}
```
3. Os dois `INSERT INTO molde_pecas` (no POST e no PUT) passam a ser:
```js
    const inserir = db.prepare(`
      INSERT INTO molde_pecas
        (molde_id, tamanho, papel, nome, quantidade, largura, altura, contorno, furos, origem, nos, marcacoes, ordem)
      VALUES (@molde_id, @tamanho, @papel, @nome, @quantidade, @largura, @altura, @contorno, @furos, @origem, @nos, @marcacoes, @ordem)
    `);
```
4. No POST, ler `situacao` do corpo e gravá-la:
```js
  const { nome, observacoes, pecas, situacao } = req.body || {};
  // ...
    const info = db.prepare(
      "INSERT INTO moldes (nome, observacoes, situacao, criado_em) VALUES (?, ?, ?, ?)")
      .run(String(nome).trim(), String(observacoes || "").trim() || null, lerSituacao(situacao) || "pronto", agora());
```
5. No PUT, `situacao` é opcional. Sem ela, fica como estava:
```js
  const { nome, observacoes, pecas, situacao } = req.body || {};
  // ...
    db.prepare("UPDATE moldes SET nome = ?, observacoes = ?, situacao = ?, atualizado_em = ? WHERE id = ?")
      .run(String(nome || molde.nome).trim(), String(observacoes || "").trim() || null,
        lerSituacao(situacao) || molde.situacao, agora(), molde.id);
```
6. O `GET /` já devolve `situacao` pelo `...m`. Nada a mudar.

Run: `npm run check`
Expected: sem erro.

- [ ] **Step 6: Os tipos da tela**

`src/api/moldes.ts`, depois de `export type Ponto`:
```ts
import type { NoDoRisco } from "./risco";

/** Rascunho: acabou de sair do Digitalizar e ainda não vai ao Encaixe. */
export type SituacaoDoMolde = "rascunho" | "pronto";

/** As marcações da Montagem. Ver `motores/montagem.js`. */
export interface Marcacoes {
  /** Margem de costura em cm. 0 = o risco já é o corte. */
  margem: number;
  espelhar: boolean;
  /** Centro, ângulo em graus (0 = vertical) e comprimento, em cm. */
  fio: { x: number; y: number; angulo: number; comprimento: number };
  /** Presos ao traço: trecho que começa no nó `no`, em `t` (0..1). */
  piques: { no: number; t: number; profundidade: number }[];
  pontos: Ponto[];
}
```
(o `import` sobe para junto do `import { api }` do topo). Acréscimos nas interfaces:
- `PecaDoMolde`: `nos?: NoDoRisco[] | null;` e `marcacoes?: Marcacoes | null;`
- `MoldeNaEstante`: `situacao: SituacaoDoMolde;`
- `Molde`: `situacao: SituacaoDoMolde;`
- `MoldeParaGravar`: `situacao?: SituacaoDoMolde;`

- [ ] **Step 7: O passo a passo antigo leva os nós de volta**

`src/telas/moldes/vocabulario.ts`, em `ParteEmEdicao`:
```ts
  /**
   * O risco e as marcações da Montagem, quando a peça passou por lá. O passo
   * a passo não mexe neles: só os devolve intactos ao regravar. Trocar o
   * arquivo da peça os descarta, porque o risco antigo não é mais aquela peça.
   */
  nos: import("../../api/risco").NoDoRisco[] | null;
  marcacoes: import("../../api/moldes").Marcacoes | null;
```
`parteVazia` ganha `nos: null, marcacoes: null`.

`src/telas/moldes/EditorDeMolde.tsx`:
- onde a peça guardada vira parte (perto da linha 102, `origem: peca.origem || "guardado"`), acrescentar `nos: peca.nos ?? null, marcacoes: peca.marcacoes ?? null,`
- onde um arquivo novo entra na parte (perto da linha 207, `origem: \`${formato} · ${unidadeLida}\``), acrescentar `nos: null, marcacoes: null,`
- onde as partes viram peças para gravar (perto da linha 370, `origem: p.origem,`), acrescentar `nos: p.nos, marcacoes: p.marcacoes,`

Run: `npx tsc --noEmit -p .`
Expected: sem saída. Se aparecer "Property 'nos' is missing" em outro lugar que monta `ParteEmEdicao` à mão, acrescentar `nos: null, marcacoes: null` ali.

- [ ] **Step 8: Commit**

```bash
git add servidor/moldes-pecas.js servidor/moldes-api.js servidor/db.js bancada/conferir-moldes-pecas.cjs package.json src/api/moldes.ts src/telas/moldes/vocabulario.ts src/telas/moldes/EditorDeMolde.tsx
git commit -m "O molde guarda situação, e a peça guarda o risco em nós e as marcações"
```

---

### Task 6: O PDF do risco aprende as marcações

**Files:**
- Modify: `servidor/risco-pdf.js`
- Modify: `src/api/risco.ts`
- Create: `bancada/conferir-risco-pdf.js`
- Modify: `package.json` (script `bancada:risco-pdf`)

**Interfaces:**
- Consumes: o `Desenho` arranjado de `montagem.js` (Task 4): `{ emX, emY, corte, costura, piques, pontos, fio, texto }`.
- Produces: `POST /api/risco/pdf` aceita, por peça, `corte` (nós) **ou** o antigo `nos`, mais os opcionais `costura`, `piques`, `pontos`, `fio`, `texto`. Exporta `lerPecas(corpo)`, `medir(pecas)` e `desenharPdf(doc, pecas)`.
- Produces (`src/api/risco.ts`): `riscoApi.pdf(nome: string, pecas: unknown[])`.

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
// bancada/conferir-risco-pdf.js
/**
 * Confere o PDF do RISCO (Digitalizar/Montagem), não o do encaixe — esse é o
 * `conferir-pdf.js`.
 *
 * Duas coisas: o corpo antigo (só `nos`) continua valendo, e o corpo da
 * Montagem sai com a página do tamanho do CORTE. O tamanho da página é o que
 * faz o PDF servir de gabarito (ver o cabeçalho de `servidor/risco-pdf.js`).
 */
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const PDFDocument = require("pdfkit");
const { lerPecas, medir, desenharPdf } = require("../servidor/risco-pdf");

const PT_POR_CM = 72 / 2.54;
const no = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, retaDepois: true });
const quadrado = (lado) => [no(0, 0), no(lado, 0), no(lado, lado), no(0, lado)];

async function gerar(corpo) {
  const lido = lerPecas(corpo);
  assert.ok(!lido.erro, lido.erro);
  const { largura, altura } = medir(lido.pecas);
  const doc = new PDFDocument({ size: [largura * PT_POR_CM, altura * PT_POR_CM], margin: 0, compress: false });
  const saida = new PassThrough();
  const pedacos = [];
  saida.on("data", (c) => pedacos.push(c));
  const fim = new Promise((r) => saida.on("end", r));
  doc.pipe(saida);
  desenharPdf(doc, lido.pecas);
  doc.end();
  await fim;
  return { largura, altura, texto: Buffer.concat(pedacos).toString("latin1") };
}

(async () => {
  // 1. Corpo antigo.
  const antigo = await gerar({ pecas: [{ nos: quadrado(10), emX: 0, emY: 0 }] });
  assert.equal(antigo.largura, 10);

  // 2. Corpo da Montagem: corte 12, costura 10 dentro, pique, ponto, fio, texto.
  const novo = await gerar({
    pecas: [{
      emX: 0, emY: 0,
      corte: quadrado(12),
      costura: quadrado(10).map((n) => ({ ...n, x: n.x + 1, y: n.y + 1, entrada: { x: n.x + 1, y: n.y + 1 }, saida: { x: n.x + 1, y: n.y + 1 } })),
      piques: [{ de: { x: 6, y: 0 }, ate: { x: 6, y: 1.5 } }],
      pontos: [{ x: 4, y: 4 }],
      fio: { linha: [{ x: 6, y: 3 }, { x: 6, y: 9 }], setas: [[{ x: 5.5, y: 8 }, { x: 6, y: 9 }, { x: 6.5, y: 8 }]] },
      texto: { x: 6, y: 4, tamanho: 1, linhas: ["frente", "base · ×1"] },
    }],
  });
  assert.equal(novo.largura, 12);
  assert.equal(novo.altura, 12);
  const [, w, h] = novo.texto.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  assert.ok(Math.abs(Number(w) - 12 * PT_POR_CM) < 0.01, `MediaBox ${w}`);
  assert.ok(Math.abs(Number(h) - 12 * PT_POR_CM) < 0.01);

  // 3. Peça sem corte nem nós: recusada com mensagem.
  assert.ok(lerPecas({ pecas: [{ emX: 0 }] }).erro);

  console.log("OK — o PDF do risco sai no tamanho do corte, no corpo antigo e no da Montagem.");
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Registrar e ver falhar**

`package.json`: `"bancada:risco-pdf": "node bancada/conferir-risco-pdf.js",`
Run: `npm run bancada:risco-pdf`
Expected: FAIL — `lerPecas is not a function` (ainda não exportado).

- [ ] **Step 3: Reescrever o miolo de `servidor/risco-pdf.js`**

O cabeçalho, as constantes e a função `numero` ficam. Acrescentar ao cabeçalho um parágrafo:
```
 * ---------------------------------------------------------------------------
 * AS MARCAÇÕES DA MONTAGEM
 * ---------------------------------------------------------------------------
 *
 * A tela de Montagem manda, por peça, o `corte` (nós), e opcionalmente a
 * `costura` (tracejada), os `piques` (traço), os `pontos` (cruz com círculo),
 * o `fio` (linha com setas) e o `texto` (papel, tamanho, quantidade). Quem
 * CALCULA tudo isso é `motores/montagem.js` (`desenhoDaPeca`); aqui só se
 * pinta. O corpo antigo, com `nos` no lugar de `corte`, continua valendo.
```
Trocar `lerPecas` e a rota por:

```js
/** Lista de nós em cm, deslocada para a posição da peça. `null` se quebrada. */
function lerNos(nos, emX, emY) {
  if (!Array.isArray(nos) || nos.length < 2) return null;
  const limpos = [];
  for (const n of nos) {
    const x = numero(n && n.x);
    const y = numero(n && n.y);
    if (x === null || y === null) return null;
    // Alça que não veio cai em cima do próprio nó: a curva vira reta.
    const alca = (a) => {
      const ax = numero(a && a.x);
      const ay = numero(a && a.y);
      return { x: (ax === null ? x : ax) + emX, y: (ay === null ? y : ay) + emY };
    };
    limpos.push({ x: x + emX, y: y + emY, entrada: alca(n.entrada), saida: alca(n.saida), retaDepois: !!n.retaDepois });
  }
  return limpos;
}

function lerPontoEm(p, emX, emY) {
  const x = numero(p && p.x);
  const y = numero(p && p.y);
  return x === null || y === null ? null : { x: x + emX, y: y + emY };
}

/**
 * Confere o corpo e devolve as peças prontas para desenhar, ou uma mensagem.
 *
 * A conferência é chata de propósito: este PDF vira gabarito de corte, e é
 * melhor recusar um pedido estranho do que gravar um arquivo torto.
 */
function lerPecas(corpo) {
  if (!corpo || typeof corpo !== "object") return { erro: "Não veio nada no pedido." };
  const cruas = Array.isArray(corpo.pecas) ? corpo.pecas : null;
  if (!cruas || cruas.length === 0) return { erro: "O pedido não trouxe peça nenhuma." };

  let totalDeNos = 0;
  const pecas = [];
  for (let i = 0; i < cruas.length; i++) {
    const crua = cruas[i] || {};
    const emX = numero(crua.emX) || 0;
    const emY = numero(crua.emY) || 0;
    const corte = lerNos(crua.corte || crua.nos, emX, emY);
    if (!corte) return { erro: `A peça ${i + 1} não tem contorno (precisa de pelo menos 2 nós).` };
    const costura = crua.costura ? lerNos(crua.costura, emX, emY) : null;
    totalDeNos += corte.length + (costura ? costura.length : 0);
    if (totalDeNos > NOS_MAXIMOS) {
      return { erro: `O pedido passou de ${NOS_MAXIMOS} nós no total; isso não é um risco de molde.` };
    }
    const piques = (Array.isArray(crua.piques) ? crua.piques : [])
      .map((p) => ({ de: lerPontoEm(p && p.de, emX, emY), ate: lerPontoEm(p && p.ate, emX, emY) }))
      .filter((p) => p.de && p.ate);
    const pontos = (Array.isArray(crua.pontos) ? crua.pontos : []).map((p) => lerPontoEm(p, emX, emY)).filter(Boolean);
    let fio = null;
    if (crua.fio && Array.isArray(crua.fio.linha)) {
      const linha = crua.fio.linha.map((p) => lerPontoEm(p, emX, emY));
      const setas = (Array.isArray(crua.fio.setas) ? crua.fio.setas : [])
        .map((s) => (Array.isArray(s) ? s.map((p) => lerPontoEm(p, emX, emY)) : []))
        .filter((s) => s.length >= 2 && s.every(Boolean));
      if (linha.length === 2 && linha.every(Boolean)) fio = { linha, setas };
    }
    let texto = null;
    if (crua.texto && Array.isArray(crua.texto.linhas)) {
      const onde = lerPontoEm(crua.texto, emX, emY);
      const tamanho = numero(crua.texto.tamanho);
      if (onde && tamanho > 0) {
        texto = { ...onde, tamanho: Math.min(tamanho, 5), linhas: crua.texto.linhas.slice(0, 4).map((l) => String(l).slice(0, 80)) };
      }
    }
    pecas.push({ corte, costura, piques, pontos, fio, texto });
  }
  return { pecas };
}

function naCurva(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/**
 * O tamanho da página: a caixa do CORTE, percorrendo as curvas.
 *
 * Pelos nós, a barriga da curva ficaria fora do papel. Pelas alças, o
 * contrário: alça é ponto de CONTROLE, não fica sobre a curva — com alças
 * compridas a página chegou a sair 10 cm maior que o desenho, e a bancada
 * pegou (78,8 cm num risco de 68). Os piques entram também: com margem, o
 * pique começa na linha de corte e não pode sair do papel.
 */
function medir(pecas) {
  let largura = 0;
  let altura = 0;
  const olhar = (q) => {
    if (q.x > largura) largura = q.x;
    if (q.y > altura) altura = q.y;
  };
  for (const { corte, piques } of pecas) {
    for (let i = 0; i < corte.length; i++) {
      const a = corte[i];
      const b = corte[(i + 1) % corte.length];
      olhar(a);
      if (a.retaDepois) continue;
      for (let k = 1; k < 16; k++) olhar(naCurva(a, a.saida, b.entrada, b, k / 16));
    }
    for (const p of piques) { olhar(p.de); olhar(p.ate); }
  }
  return { largura, altura };
}

const pt = (v) => v * PT_POR_CM;

function caminho(doc, nos) {
  doc.moveTo(pt(nos[0].x), pt(nos[0].y));
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i];
    const b = nos[(i + 1) % nos.length];
    // Reta é reta também no PDF: uma cúbica com as alças em cima dos nós
    // desenha igual, mas engorda o arquivo e mente sobre o que o trecho é.
    if (a.retaDepois) doc.lineTo(pt(b.x), pt(b.y));
    else doc.bezierCurveTo(pt(a.saida.x), pt(a.saida.y), pt(b.entrada.x), pt(b.entrada.y), pt(b.x), pt(b.y));
  }
  doc.closePath();
}

/** Pinta as peças lidas no documento. Traço fino e constante: é linha de corte, não desenho. */
function desenharPdf(doc, pecas) {
  doc.strokeColor("#000000").fillColor("#000000");
  for (const p of pecas) {
    doc.lineWidth(0.05 * PT_POR_CM).undash();
    caminho(doc, p.corte);
    doc.stroke();
    if (p.costura) {
      doc.lineWidth(0.03 * PT_POR_CM).dash(0.4 * PT_POR_CM, { space: 0.25 * PT_POR_CM });
      caminho(doc, p.costura);
      doc.stroke();
      doc.undash();
    }
    doc.lineWidth(0.05 * PT_POR_CM);
    for (const q of p.piques) doc.moveTo(pt(q.de.x), pt(q.de.y)).lineTo(pt(q.ate.x), pt(q.ate.y)).stroke();
    doc.lineWidth(0.03 * PT_POR_CM);
    for (const q of p.pontos) {
      doc.circle(pt(q.x), pt(q.y), pt(0.3)).stroke();
      doc.moveTo(pt(q.x - 0.4), pt(q.y)).lineTo(pt(q.x + 0.4), pt(q.y)).stroke();
      doc.moveTo(pt(q.x), pt(q.y - 0.4)).lineTo(pt(q.x), pt(q.y + 0.4)).stroke();
    }
    if (p.fio) {
      doc.lineWidth(0.04 * PT_POR_CM);
      doc.moveTo(pt(p.fio.linha[0].x), pt(p.fio.linha[0].y)).lineTo(pt(p.fio.linha[1].x), pt(p.fio.linha[1].y)).stroke();
      for (const s of p.fio.setas) {
        doc.moveTo(pt(s[0].x), pt(s[0].y));
        for (const q of s.slice(1)) doc.lineTo(pt(q.x), pt(q.y));
        doc.stroke();
      }
    }
    if (p.texto) {
      const largura = pt(30);
      doc.fontSize(pt(p.texto.tamanho));
      p.texto.linhas.forEach((linha, i) => {
        doc.text(linha, pt(p.texto.x) - largura / 2, pt(p.texto.y + i * p.texto.tamanho * 1.3) - pt(p.texto.tamanho),
          { width: largura, align: "center", lineBreak: false });
      });
    }
  }
}

/**
 * POST /api/risco/pdf
 *
 * Corpo: `{ nome?, pecas: [{ corte | nos, emX?, emY?, costura?, piques?,
 * pontos?, fio?, texto? }] }`, tudo em centímetros. Ver `lerPecas`.
 */
router.post("/pdf", express.json({ limit: "20mb" }), (req, res) => {
  const lido = lerPecas(req.body);
  if (lido.erro) {
    res.status(400).json({ error: lido.erro });
    return;
  }
  const { pecas } = lido;
  const { largura, altura } = medir(pecas);
  if (!(largura > 0) || !(altura > 0)) {
    res.status(400).json({ error: "O risco tem largura ou altura zero." });
    return;
  }
  if (largura > LADO_MAXIMO_CM || altura > LADO_MAXIMO_CM) {
    res.status(400).json({
      error: `O risco mediu ${largura.toFixed(0)} × ${altura.toFixed(0)} cm, acima do limite de`
        + ` ${LADO_MAXIMO_CM} cm. Confira a medida que foi informada.`,
    });
    return;
  }

  const PDFDocument = require("pdfkit");
  const nome = String((req.body && req.body.nome) || "molde").replace(/[^\w\-. ]+/g, "_").slice(0, 60) || "molde";
  const doc = new PDFDocument({
    size: [largura * PT_POR_CM, altura * PT_POR_CM],
    margin: 0,
    info: { Title: `Risco de ${nome} — ${largura.toFixed(1)} x ${altura.toFixed(1)} cm`, Creator: "CodeEx Optmize" },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}-risco.pdf"`);
  doc.pipe(res);
  desenharPdf(doc, pecas);
  doc.end();
});

module.exports = router;
module.exports.lerPecas = lerPecas;
module.exports.medir = medir;
module.exports.desenharPdf = desenharPdf;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:risco-pdf`
Expected: `OK — o PDF do risco sai no tamanho do corte, no corpo antigo e no da Montagem.`
Run: `npm run check`
Expected: sem erro.

- [ ] **Step 5: O tipo da API**

`src/api/risco.ts`: a assinatura vira `async pdf(nome: string, pecas: unknown[]): Promise<Blob>`. Acrescentar ao comentário do cabeçalho: "A Montagem manda o desenho de `motores/montagem.js` (`desenhoDaPeca` + `arranjar`); o Digitalizar mandava `PecaDoRisco`. O servidor aceita os dois."

Run: `npx tsc --noEmit -p .`
Expected: sem saída.

- [ ] **Step 6: Commit**

```bash
git add servidor/risco-pdf.js src/api/risco.ts bancada/conferir-risco-pdf.js package.json
git commit -m "O PDF do risco passa a desenhar costura, piques, pontos, fio e o nome da peça"
```

---

### Task 7: A rota, a escolha do molde e o gancho que grava sozinho

**Files:**
- Modify: `src/rotas.ts`, `src/casca/Casca.tsx`
- Create: `src/telas/Montagem.tsx`
- Create: `src/telas/montagem/EscolhaDoMolde.tsx`
- Create: `src/telas/montagem/useMoldeEmMontagem.ts`
- Create: `src/telas/montagem/MesaDeMontagem.tsx` (esqueleto nesta tarefa; completo na Task 8)

**Interfaces:**
- Consumes: `moldesApi` (Task 5), `pecaParaMontar`, `pecaParaGravar` (Task 4), `ErroDaApi` de `src/api/cliente.ts`.
- Produces (`useMoldeEmMontagem.ts`):
```ts
export type PecaEmMontagem = PecaDoMolde & { nos: NoDoRisco[]; marcacoes: Marcacoes };
export type EstadoDaGravacao = "salvo" | "pendente" | "salvando" | "erro";
export interface MoldeEmMontagem {
  carregando: boolean;
  naoAchado: boolean;
  nome: string;
  situacao: SituacaoDoMolde;
  pecas: PecaEmMontagem[];
  gravacao: EstadoDaGravacao;
  /** Por que a última gravação não foi: margem que se cruza, servidor fora. */
  problema: { peca: number | null; texto: string } | null;
  podeDesfazer: boolean;
  lembrar(): void;
  desfazer(): void;
  mudarPecas(mudar: (antes: PecaEmMontagem[]) => PecaEmMontagem[], lembrarAntes?: boolean): void;
  mudarPeca(indice: number, mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes?: boolean): void;
  renomear(nome: string): void;
  /** Grava agora (e muda a situação, se pedido). `true` se ficou tudo salvo. */
  gravar(situacao?: SituacaoDoMolde): Promise<boolean>;
}
export function useMoldeEmMontagem(id: number): MoldeEmMontagem;
```

- [ ] **Step 1: A rota no menu**

`src/rotas.ts`:
- Junto dos outros `lazy`: `const Montagem = lazy(() => import("./telas/Montagem").then((m) => ({ default: m.Montagem })));`
- `NomeDeTela` ganha `| "montagem"` na primeira linha: `| "moldes" | "projetos" | "encaixe" | "digitalizar" | "montagem" | "macros"`.
- Em `TELAS`, logo depois da linha de `digitalizar`:
```ts
  {
    /*
     * Logo depois de Digitalizar, porque é para onde ele leva: a foto vira
     * risco lá, e o risco vira MOLDE aqui — peça com nome, pique, fio e
     * margem, pronto para a estante e para o Encaixe. Fica no menu (e não
     * como porta, feito Máquinas) porque é lugar de trabalho: qualquer molde
     * da estante, inclusive de DXF, é montado aqui, e a graduação (parte 2)
     * vai morar aqui também.
     */
    nome: "montagem",
    grupo: "producao",
    rotulo: "Montagem",
    apoioMenu: "Peças, marcações e tamanhos",
    apoioTopo: "Dê nome às peças, marque piques, fio e margem, e mande o molde ao Encaixe.",
    icone: "icones.svg#layers",
    Componente: Montagem,
  },
```

`src/casca/Casca.tsx`: a linha `const bancada = ...` passa a incluir a Montagem:
```ts
  const bancada = tela.nome === "encaixe" || tela.nome === "projetos"
    || tela.nome === "moldes" || tela.nome === "montagem";
```
e o comentário "AS TELAS DE BANCADA" ganha a linha `MONTAGEM  a lista das peças, a mesa e o painel da peça.`

- [ ] **Step 2: O gancho**

```ts
// src/telas/montagem/useMoldeEmMontagem.ts
/**
 * ===========================================================================
 * O MOLDE EM MONTAGEM — carregar, desfazer e gravar sozinho
 * ===========================================================================
 *
 * A Montagem não tem botão de salvar: grava um segundo depois da última
 * mexida. O molde já está no banco desde que o Digitalizar o criou, e a pessoa
 * não pode perder meia hora de pique porque a luz piscou.
 *
 * A gravação é o PUT inteiro (`moldesApi.regravar`), que troca as peças de
 * uma vez — o mesmo que o passo a passo antigo usa. As estampas (artes) ficam
 * noutra tabela e não são tocadas.
 *
 * ---------------------------------------------------------------------------
 * NUNCA DUAS AO MESMO TEMPO, NUNCA A VERSÃO VELHA POR ÚLTIMO
 * ---------------------------------------------------------------------------
 *
 * Cada mexida sobe a `versao`. A gravação guarda qual versão mandou; se,
 * quando voltar, a versão já andou, o estado fica "pendente" e a próxima
 * rodada manda a nova. Uma gravação só por vez (`emVoo`): duas PUT
 * concorrentes poderiam chegar fora de ordem e a velha ganhar.
 *
 * Margem que se cruza (ver `motores/margemDeCostura.js`) NÃO é gravada: o
 * banco fica com o último contorno bom, a peça aparece em vermelho, e o
 * `problema` diz qual.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { moldesApi, type Marcacoes, type PecaDoMolde, type SituacaoDoMolde } from "../../api/moldes";
import type { NoDoRisco } from "../../api/risco";
import { ErroDaApi } from "../../api/cliente";
import { pecaParaGravar, pecaParaMontar } from "../../motores/montagem";

export type PecaEmMontagem = PecaDoMolde & { nos: NoDoRisco[]; marcacoes: Marcacoes };
export type EstadoDaGravacao = "salvo" | "pendente" | "salvando" | "erro";

export interface MoldeEmMontagem {
  carregando: boolean;
  naoAchado: boolean;
  nome: string;
  situacao: SituacaoDoMolde;
  pecas: PecaEmMontagem[];
  gravacao: EstadoDaGravacao;
  problema: { peca: number | null; texto: string } | null;
  podeDesfazer: boolean;
  lembrar(): void;
  desfazer(): void;
  mudarPecas(mudar: (antes: PecaEmMontagem[]) => PecaEmMontagem[], lembrarAntes?: boolean): void;
  mudarPeca(indice: number, mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes?: boolean): void;
  renomear(nome: string): void;
  gravar(situacao?: SituacaoDoMolde): Promise<boolean>;
}

const ESPERA_PARA_GRAVAR = 1000;
const PASSOS_DE_DESFAZER = 40;

export function useMoldeEmMontagem(id: number): MoldeEmMontagem {
  const [carregando, setCarregando] = useState(true);
  const [naoAchado, setNaoAchado] = useState(false);
  const [nome, setNome] = useState("");
  const [observacoes, setObservacoes] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<SituacaoDoMolde>("pronto");
  const [pecas, setPecas] = useState<PecaEmMontagem[]>([]);
  const [gravacao, setGravacao] = useState<EstadoDaGravacao>("salvo");
  const [problema, setProblema] = useState<MoldeEmMontagem["problema"]>(null);
  const [pilha, setPilha] = useState<PecaEmMontagem[][]>([]);

  // O que a gravação lê: sempre o último, sem depender de quando o efeito montou.
  const atual = useRef({ nome, observacoes, pecas });
  atual.current = { nome, observacoes, pecas };
  const versao = useRef(0);
  const gravada = useRef(0);
  const emVoo = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    let vivo = true;
    moldesApi.abrir(id)
      .then((m) => {
        if (!vivo) return;
        setNome(m.nome);
        setObservacoes(m.observacoes);
        setSituacao(m.situacao);
        setPecas(m.pecas.map((p) => pecaParaMontar(p) as PecaEmMontagem));
      })
      .catch((e) => { if (vivo && e instanceof ErroDaApi && e.status === 404) setNaoAchado(true); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id]);

  const marcarMexida = () => {
    versao.current++;
    setGravacao("pendente");
  };

  const lembrar = useCallback(() => {
    setPilha((p) => [...p.slice(-(PASSOS_DE_DESFAZER - 1)), atual.current.pecas]);
  }, []);

  const desfazer = useCallback(() => {
    setPilha((p) => {
      if (p.length === 0) return p;
      setPecas(p[p.length - 1]!);
      marcarMexida();
      return p.slice(0, -1);
    });
  }, []);

  const mudarPecas = useCallback((mudar: (antes: PecaEmMontagem[]) => PecaEmMontagem[], lembrarAntes = true) => {
    if (lembrarAntes) lembrar();
    setPecas(mudar);
    marcarMexida();
  }, [lembrar]);

  const mudarPeca = useCallback((indice: number, mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes = true) => {
    mudarPecas((antes) => antes.map((p, i) => (i === indice ? mudar(p) : p)), lembrarAntes);
  }, [mudarPecas]);

  const renomear = useCallback((novo: string) => {
    setNome(novo);
    marcarMexida();
  }, []);

  const gravar = useCallback(async (novaSituacao?: SituacaoDoMolde): Promise<boolean> => {
    if (emVoo.current) await emVoo.current;
    const mandada = versao.current;
    if (!novaSituacao && mandada === gravada.current) return true;

    const { nome: nomeAgora, observacoes: obsAgora, pecas: pecasAgora } = atual.current;
    const prontas = [];
    for (let i = 0; i < pecasAgora.length; i++) {
      const g = pecaParaGravar(pecasAgora[i]);
      if (!g.peca) {
        setProblema({ peca: i, texto: `Peça ${i + 1}: ${g.erro}.` });
        setGravacao("erro");
        return false;
      }
      prontas.push(g.peca);
    }

    setGravacao("salvando");
    const voo = moldesApi.regravar(id, {
      nome: nomeAgora.trim() || "Molde sem nome",
      observacoes: obsAgora ?? "",
      pecas: prontas,
      ...(novaSituacao ? { situacao: novaSituacao } : {}),
    })
      .then(() => {
        gravada.current = mandada;
        if (novaSituacao) setSituacao(novaSituacao);
        setProblema(null);
        setGravacao(versao.current === mandada ? "salvo" : "pendente");
        return true;
      })
      .catch((e) => {
        setProblema({ peca: null, texto: `Não consegui salvar: ${e instanceof Error ? e.message : String(e)}` });
        setGravacao("erro");
        return false;
      })
      .finally(() => { emVoo.current = null; });
    emVoo.current = voo;
    return voo;
  }, [id]);

  // Grava sozinho um segundo depois da última mexida.
  useEffect(() => {
    if (gravacao !== "pendente") return;
    const espera = window.setTimeout(() => { void gravar(); }, ESPERA_PARA_GRAVAR);
    return () => window.clearTimeout(espera);
  }, [gravacao, pecas, nome, gravar]);

  // Fechar a janela com mexida não salva pergunta antes.
  useEffect(() => {
    if (gravacao === "salvo") return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [gravacao]);

  return {
    carregando, naoAchado, nome, situacao, pecas, gravacao, problema,
    podeDesfazer: pilha.length > 0,
    lembrar, desfazer, mudarPecas, mudarPeca, renomear, gravar,
  };
}
```

Nota: `moldesApi.regravar` recebe `MoldeParaGravar`, cujo `pecas` é `Omit<PecaDoMolde, "id">[]`. As peças prontas trazem `id`; o servidor ignora. Se o `tsc` reclamar do `id`, mapear `prontas.map(({ id: _id, ...resto }) => resto)`.

- [ ] **Step 3: A escolha do molde**

```tsx
// src/telas/montagem/EscolhaDoMolde.tsx
/**
 * A ESCOLHA DO MOLDE — o que a Montagem mostra quando é aberta pelo menu.
 *
 * Rascunhos primeiro: são o trabalho que ficou pela metade, e quem abre a
 * Montagem pelo menu quase sempre está voltando a um deles. Depois os
 * prontos, pelo nome.
 */
import { useEffect, useMemo, useState } from "react";
import { moldesApi, type MoldeNaEstante } from "../../api/moldes";
import { Icone } from "../../casca/Icone";

interface Props {
  aoEscolher: (id: number) => void;
  /** Aberta porque o molde do endereço não existe mais. */
  sumiu?: boolean;
}

export function EscolhaDoMolde({ aoEscolher, sumiu }: Props) {
  const [moldes, setMoldes] = useState<MoldeNaEstante[] | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    moldesApi.estante().then(setMoldes).catch(() => setMoldes([]));
  }, []);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (moldes ?? [])
      .filter((m) => !termo || m.nome.toLowerCase().includes(termo))
      .sort((a, b) => (a.situacao === b.situacao ? a.nome.localeCompare(b.nome) : a.situacao === "rascunho" ? -1 : 1));
  }, [moldes, busca]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[720px] flex-col gap-3 overflow-auto p-6">
      <h2 className="m-0 text-[1.1rem] font-semibold">Qual molde você vai montar?</h2>
      {sumiu && (
        <p className="m-0 flex items-center gap-2 text-[0.85rem] text-ambar">
          <Icone referencia="icones.svg#triangle-alert" className="size-4" />
          Esse molde não existe mais. Escolha outro.
        </p>
      )}
      <p className="m-0 text-[0.85rem] text-tinta-fraca">
        O molde chega aqui pelo <strong>Digitalizar</strong> ou pela estante de <strong>Moldes</strong>.
        Os rascunhos — digitalizados e ainda não concluídos — vêm primeiro.
      </p>
      <input
        type="search" value={busca} placeholder="Procurar pelo nome"
        onChange={(e) => setBusca(e.target.value)} aria-label="Procurar molde"
      />
      {moldes === null && <p className="text-[0.85rem] text-tinta-apagada">Abrindo a estante…</p>}
      {moldes !== null && lista.length === 0 && (
        <p className="text-[0.85rem] text-tinta-apagada">Nenhum molde na estante ainda.</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lista.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-linha bg-painel-suave p-3 text-left hover:border-ambar"
              onClick={() => aoEscolher(m.id)}
            >
              <span className="flex flex-col">
                <strong>{m.nome}</strong>
                <span className="text-[0.8rem] text-tinta-fraca">
                  {m.totalPecas} peça(s) · {m.tamanhos.join(", ") || "sem tamanho"}
                </span>
              </span>
              {m.situacao === "rascunho" && <span className="etiqueta-tamanho">rascunho</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: A tela e o esqueleto da mesa**

```tsx
// src/telas/Montagem.tsx
/**
 * ===========================================================================
 * MONTAGEM — o risco vira molde
 * ===========================================================================
 *
 * O Digitalizar entrega um molde-RASCUNHO na estante e abre esta tela em cima
 * dele (`/montagem?molde=ID`). Aqui cada peça ganha papel, nome, quantidade,
 * pique, ponto, fio e margem de costura; o molde grava sozinho e, concluído,
 * vai ao Encaixe. Qualquer molde da estante abre aqui, inclusive os de DXF.
 * Ver docs/superpowers/specs/2026-09-26-montagem-de-moldes-design.md.
 *
 * Esta casca só decide entre a ESCOLHA do molde (sem `?molde`, ou molde que
 * sumiu) e a MESA. O `key` na mesa faz trocar de molde montar tudo do zero,
 * sem desfazer, zoom ou nó marcado herdados do molde anterior.
 */
import { useSearchParams } from "react-router-dom";
import { EscolhaDoMolde } from "./montagem/EscolhaDoMolde";
import { MesaDeMontagem } from "./montagem/MesaDeMontagem";

export function Montagem() {
  const [parametros, setParametros] = useSearchParams();
  const id = Number(parametros.get("molde"));
  const escolher = (novo: number) => setParametros({ molde: String(novo) });

  if (!Number.isInteger(id) || id <= 0) return <EscolhaDoMolde aoEscolher={escolher} />;
  return <MesaDeMontagem key={id} id={id} aoEscolherOutro={escolher} aoTrocar={() => setParametros({})} />;
}
```

```tsx
// src/telas/montagem/MesaDeMontagem.tsx  (esqueleto desta tarefa; a Task 8 o completa)
import { useMoldeEmMontagem } from "./useMoldeEmMontagem";
import { EscolhaDoMolde } from "./EscolhaDoMolde";

interface Props { id: number; aoTrocar: () => void; aoEscolherOutro: (id: number) => void }

export function MesaDeMontagem({ id, aoEscolherOutro }: Props) {
  const molde = useMoldeEmMontagem(id);
  if (molde.carregando) return <p className="p-6 text-sm text-tinta-apagada">Abrindo o molde…</p>;
  if (molde.naoAchado) return <EscolhaDoMolde sumiu aoEscolher={aoEscolherOutro} />;
  return <p className="p-6">{molde.nome}: {molde.pecas.length} peça(s) · {molde.gravacao}</p>;
}
```

- [ ] **Step 5: Conferir**

Run: `npx tsc --noEmit -p .` → sem saída.
Run: `npm run icones` → gera o sprite com `layers`, sem erro.
À mão (servidor + vite de pé): "Montagem" aparece no menu, em Produção, depois de Digitalizar. Abrir `/montagem` mostra a escolha; escolher um molde mostra "nome: N peça(s) · salvo". Abrir `/montagem?molde=999999` mostra o aviso "Esse molde não existe mais".

- [ ] **Step 6: Commit**

```bash
git add src/rotas.ts src/casca/Casca.tsx src/telas/Montagem.tsx src/telas/montagem/
git commit -m "A Montagem entra no menu da Produção, com a escolha do molde e a gravação sozinha"
```

---

### Task 8: A mesa, a lista das peças e o painel da peça

**Files:**
- Create: `src/telas/montagem/Mesa.tsx`
- Create: `src/telas/montagem/ListaDePecas.tsx`
- Create: `src/telas/montagem/PainelDaPeca.tsx`
- Modify: `src/telas/montagem/MesaDeMontagem.tsx` (completo)

**Interfaces:**
- Consumes: `MoldeEmMontagem`, `PecaEmMontagem` (Task 7); `pegaSob`, `tracoSob`, `moverPega` (Task 1); `desenharNos`, `tracarCaminho` (Task 2); `margemDeCostura` (Task 3); `inserirNoNaPeca`, `apagarNoDaPeca`, `posicaoDoPique`, `desenhoDaPeca`, `pecaParaGravar`, `arranjar`, `caixaDe`, `lerCm`, `PROFUNDIDADE_DO_PIQUE`, `pecaParaMontar` (Task 4); `PAPEIS_DE_PECA` de `telas/moldes/vocabulario.ts`; `corDaPeca(i)` de `utils/coresDePeca.ts`.
- Produces: `export type Ferramenta = "nos" | "pique" | "ponto" | "fio"` (de `Mesa.tsx`).

- [ ] **Step 1: A mesa**

```tsx
// src/telas/montagem/Mesa.tsx
/**
 * ===========================================================================
 * A MESA — onde a peça é marcada
 * ===========================================================================
 *
 * Um canvas em cima de uma grade de 1 cm. Quatro ferramentas, uma de cada vez:
 *
 *   NÓS    a edição do Digitalizar, as mesmas contas (`motores/edicaoDeNos.js`);
 *   PIQUE  clique no traço põe, clique num pique tira;
 *   PONTO  clique dentro da peça põe, clique num ponto tira;
 *   FIO    arrasta pelo meio, gira pelas pontas.
 *
 * Uma ferramenta por vez, e não um clique que adivinha, porque os alvos se
 * sobrepõem: pique mora em cima do traço, e o traço é onde o nó também mora.
 *
 * A VISTA NÃO SE MEXE DURANTE O ARRASTO. Ela se ajusta à caixa da peça, e a
 * caixa muda enquanto se arrasta um nó para fora dela; se a vista seguisse,
 * o nó fugiria de baixo do ponteiro. A vista é congelada no aperto e refeita
 * na soltura.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { achatarCurvas } from "../../motores/ajusteDeCurvas";
import { margemDeCostura } from "../../motores/margemDeCostura";
import { moverPega, pegaSob, tracoSob } from "../../motores/edicaoDeNos";
import {
  PROFUNDIDADE_DO_PIQUE, apagarNoDaPeca, arranjar, caixaDe, desenhoDaPeca, inserirNoNaPeca,
  pecaParaGravar, posicaoDoPique,
} from "../../motores/montagem";
import { desenharNos, tracarCaminho, type Ponto } from "../risco/desenhoDeNos";
import { corDaPeca } from "../../utils/coresDePeca";
import type { PecaEmMontagem } from "./useMoldeEmMontagem";

export type Ferramenta = "nos" | "pique" | "ponto" | "fio";

/** Pixels de canvas por centímetro, antes do zoom. */
const PX_POR_CM = 24;
const LADO_MAXIMO_PX = 4096;
/** Raio de pega, em pixels da tela. */
const PEGA = 10;
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

interface Vista { minX: number; minY: number; largura: number; altura: number }

type Arrasto =
  | { tipo: "no"; no: number; parte: "no" | "entrada" | "saida" }
  | { tipo: "fio"; modo: "mover" | "girar" };

interface Props {
  pecas: PecaEmMontagem[];
  indice: number;
  ferramenta: Ferramenta;
  verTodas: boolean;
  noAtivo: number | null;
  /** Peças que não gravam (margem que se cruza), para pintar de vermelho. */
  comErro: number | null;
  aoMarcarNo: (no: number | null) => void;
  aoEscolherPeca: (indice: number) => void;
  aoLembrar: () => void;
  aoMudar: (mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes: boolean) => void;
}

/** O desenho de uma peça para o "ver todas": se a margem não fecha, sem margem (e em vermelho). */
function desenhoParaVer(p: PecaEmMontagem) {
  const g = pecaParaGravar(p);
  if (g.peca) return { desenho: desenhoDaPeca(g.peca), erro: false };
  const semMargem = pecaParaGravar({ ...p, marcacoes: { ...p.marcacoes, margem: 0 } });
  return { desenho: desenhoDaPeca(semMargem.peca), erro: true };
}

export function Mesa(props: Props) {
  const { pecas, indice, ferramenta, verTodas, noAtivo, comErro } = props;
  const peca = pecas[indice];
  const tela = useRef<HTMLCanvasElement>(null);
  const moldura = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const arrasto = useRef<Arrasto | null>(null);
  const vistaCongelada = useRef<Vista | null>(null);
  const [, repintar] = useState(0);

  const risco = useMemo(() => (peca ? achatarCurvas(peca.nos) : []), [peca]);
  const corte = useMemo(
    () => (peca && peca.marcacoes.margem > 0 ? margemDeCostura(risco, peca.marcacoes.margem) : null),
    [peca, risco],
  );
  const todas = useMemo(() => {
    if (!verTodas) return [];
    const vistos = pecas.map(desenhoParaVer);
    const postos = arranjar(vistos.map((v) => v.desenho));
    return postos.map((d: any, i: number) => ({ ...d, erro: vistos[i]!.erro }));
  }, [verTodas, pecas]);

  const vistaCalculada = useMemo<Vista>(() => {
    if (verTodas) {
      let maxX = 0; let maxY = 0;
      for (const d of todas) { maxX = Math.max(maxX, d.emX + d.largura); maxY = Math.max(maxY, d.emY + d.altura); }
      return { minX: -3, minY: -3, largura: maxX + 6, altura: maxY + 6 };
    }
    const c = caixaDe(corte ?? risco);
    const folga = 3;
    return { minX: c.minX - folga, minY: c.minY - folga, largura: c.largura + 2 * folga, altura: c.altura + 2 * folga };
  }, [verTodas, todas, corte, risco]);
  const vista = vistaCongelada.current ?? vistaCalculada;
  const escala = Math.min(PX_POR_CM, LADO_MAXIMO_PX / Math.max(vista.largura, vista.altura, 1));

  /** Onde o ponteiro caiu, em cm. */
  const noCm = (e: { clientX: number; clientY: number }): Ponto | null => {
    const r = tela.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return {
      x: vista.minX + ((e.clientX - r.left) / r.width) * vista.largura,
      y: vista.minY + ((e.clientY - r.top) / r.height) * vista.altura,
    };
  };
  const raioCm = () => {
    const r = tela.current?.getBoundingClientRect();
    return r && r.width > 0 ? (PEGA * vista.largura) / r.width : 0.5;
  };

  // ------------------------------------------------------------ o desenho
  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;
    canvas.width = Math.round(vista.largura * escala);
    canvas.height = Math.round(vista.altura * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const emTela = (p: Ponto): Ponto => ({ x: (p.x - vista.minX) * escala, y: (p.y - vista.minY) * escala });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // A grade: 1 cm fraca, 10 cm mais forte. É a régua da mesa.
    for (let cm = Math.ceil(vista.minX); cm <= vista.minX + vista.largura; cm++) {
      ctx.strokeStyle = cm % 10 === 0 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
      ctx.beginPath(); ctx.moveTo(emTela({ x: cm, y: 0 }).x, 0); ctx.lineTo(emTela({ x: cm, y: 0 }).x, canvas.height); ctx.stroke();
    }
    for (let cm = Math.ceil(vista.minY); cm <= vista.minY + vista.altura; cm++) {
      ctx.strokeStyle = cm % 10 === 0 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
      ctx.beginPath(); ctx.moveTo(0, emTela({ x: 0, y: cm }).y); ctx.lineTo(canvas.width, emTela({ x: 0, y: cm }).y); ctx.stroke();
    }

    const pintarDesenho = (d: any, dx: number, dy: number, cor: string, grosso: boolean) => {
      const em = (p: Ponto) => emTela({ x: p.x + dx, y: p.y + dy });
      ctx.setLineDash([]);
      tracarCaminho(ctx, d.corte, em);
      ctx.strokeStyle = cor; ctx.lineWidth = grosso ? 3 : 2; ctx.stroke();
      if (d.costura) {
        ctx.setLineDash([6, 4]);
        tracarCaminho(ctx, d.costura, em);
        ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
      for (const q of d.piques) { const a = em(q.de); const b = em(q.ate); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (const q of d.pontos) { const c = em(q); ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2); ctx.stroke(); }
      if (d.fio) {
        ctx.strokeStyle = "#4d9dff"; ctx.lineWidth = 2;
        const a = em(d.fio.linha[0]); const b = em(d.fio.linha[1]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        for (const s of d.fio.setas) {
          ctx.beginPath();
          s.forEach((q: Ponto, i: number) => { const c = em(q); if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); });
          ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = `${Math.max(11, d.texto.tamanho * escala * 0.8)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      d.texto.linhas.forEach((l: string, i: number) => {
        const c = em({ x: d.texto.x, y: d.texto.y + i * d.texto.tamanho * 1.3 });
        ctx.fillText(l, c.x, c.y);
      });
    };

    if (verTodas) {
      todas.forEach((d: any, i: number) => pintarDesenho(d, d.emX, d.emY, d.erro ? "#ff4d4d" : corDaPeca(i), i === indice));
      return;
    }
    if (!peca) return;
    // A peça escolhida, na posição em que está sendo editada (sem encostar no canto).
    const desenho = desenhoDaPeca({
      ...peca,
      contorno: corte ?? risco,
      marcacoes: corte ? peca.marcacoes : { ...peca.marcacoes, margem: 0 },
    });
    // Como no PDF: corte contínuo, costura (o risco, quando há margem) tracejada.
    pintarDesenho(desenho, 0, 0, corDaPeca(indice), true);
    if ((peca.marcacoes.margem > 0 && !corte) || comErro === indice) {
      ctx.fillStyle = "#ff4d4d";
      ctx.font = "bold 14px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("A margem fecha a peça sobre ela mesma: diminua a margem.", 12, 22);
    }
    if (ferramenta === "nos") desenharNos(ctx, peca.nos, noAtivo, emTela);
  }, [vista, escala, verTodas, todas, peca, indice, corte, risco, ferramenta, noAtivo, comErro]);

  // ------------------------------------------------------------ o ponteiro
  const aoApertar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const alvo = noCm(e);
    if (!alvo) return;
    if (verTodas) {
      const i = todas.findIndex((d: any) => alvo.x >= d.emX && alvo.x <= d.emX + d.largura && alvo.y >= d.emY && alvo.y <= d.emY + d.altura);
      if (i >= 0) props.aoEscolherPeca(i);
      return;
    }
    if (!peca) return;
    const raio = raioCm();

    if (ferramenta === "nos") {
      const sob = pegaSob(peca.nos, alvo, raio, noAtivo);
      if (!sob) { props.aoMarcarNo(null); return; }
      if (sob.parte === "no") props.aoMarcarNo(sob.no);
      props.aoLembrar();
      arrasto.current = { tipo: "no", no: sob.no, parte: sob.parte };
    } else if (ferramenta === "pique") {
      const perto = peca.marcacoes.piques.findIndex((q) => {
        const p = posicaoDoPique(peca.nos, q).ponto;
        return Math.hypot(p.x - alvo.x, p.y - alvo.y) < raio;
      });
      if (perto >= 0) {
        props.aoMudar((p) => ({ ...p, marcacoes: { ...p.marcacoes, piques: p.marcacoes.piques.filter((_, k) => k !== perto) } }), true);
        return;
      }
      const traco = tracoSob(peca.nos, alvo, raio);
      if (!traco) return;
      props.aoMudar((p) => ({
        ...p,
        marcacoes: { ...p.marcacoes, piques: [...p.marcacoes.piques, { no: traco.no, t: traco.t, profundidade: PROFUNDIDADE_DO_PIQUE }] },
      }), true);
      return;
    } else if (ferramenta === "ponto") {
      const perto = peca.marcacoes.pontos.findIndex((q) => Math.hypot(q.x - alvo.x, q.y - alvo.y) < raio);
      props.aoMudar((p) => ({
        ...p,
        marcacoes: {
          ...p.marcacoes,
          pontos: perto >= 0 ? p.marcacoes.pontos.filter((_, k) => k !== perto) : [...p.marcacoes.pontos, alvo],
        },
      }), true);
      return;
    } else {
      const f = peca.marcacoes.fio;
      const rad = (f.angulo * Math.PI) / 180;
      const ponta = { x: f.x + Math.sin(rad) * (f.comprimento / 2), y: f.y + Math.cos(rad) * (f.comprimento / 2) };
      const outra = { x: 2 * f.x - ponta.x, y: 2 * f.y - ponta.y };
      const naPonta = [ponta, outra].some((q) => Math.hypot(q.x - alvo.x, q.y - alvo.y) < raio * 1.5);
      if (!naPonta && Math.hypot(f.x - alvo.x, f.y - alvo.y) > raio * 1.5) return;
      props.aoLembrar();
      arrasto.current = { tipo: "fio", modo: naPonta ? "girar" : "mover" };
    }
    vistaCongelada.current = vista;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = arrasto.current;
    if (!a) return;
    const alvo = noCm(e);
    if (!alvo) return;
    if (a.tipo === "no") {
      props.aoMudar((p) => ({ ...p, nos: moverPega(p.nos, { no: a.no, parte: a.parte }, alvo) }), false);
    } else if (a.modo === "mover") {
      props.aoMudar((p) => ({ ...p, marcacoes: { ...p.marcacoes, fio: { ...p.marcacoes.fio, x: alvo.x, y: alvo.y } } }), false);
    } else {
      props.aoMudar((p) => {
        const f = p.marcacoes.fio;
        const angulo = Math.round((Math.atan2(alvo.x - f.x, alvo.y - f.y) * 180) / Math.PI);
        return { ...p, marcacoes: { ...p.marcacoes, fio: { ...f, angulo } } };
      }, false);
    }
  };

  const aoSoltar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!arrasto.current) return;
    arrasto.current = null;
    vistaCongelada.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    repintar((n) => n + 1);
  };

  /** Dois cliques (ferramenta Nós): no nó apaga, no traço põe nó sem mudar o desenho. */
  const aoDobrarClique = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (verTodas || ferramenta !== "nos" || !peca) return;
    const alvo = noCm(e);
    if (!alvo) return;
    const raio = raioCm();
    const sob = pegaSob(peca.nos, alvo, raio, null);
    if (sob) {
      if (peca.nos.length <= 3) return;
      props.aoMudar((p) => apagarNoDaPeca(p, sob.no) ?? p, true);
      props.aoMarcarNo(null);
      return;
    }
    const traco = tracoSob(peca.nos, alvo, raio);
    if (!traco) return;
    props.aoMudar((p) => inserirNoNaPeca(p, traco.no, traco.t), true);
    props.aoMarcarNo(traco.no + 1);
  };

  // Zoom pela roda, ancorado no ponteiro — o mesmo do Digitalizar.
  useEffect(() => {
    const caixa = moldura.current;
    if (!caixa) return;
    const aoRodar = (e: WheelEvent) => {
      if (!tela.current) return;
      e.preventDefault();
      const antes = caixa.getBoundingClientRect();
      const px = (caixa.scrollLeft + (e.clientX - antes.left)) / Math.max(1, tela.current.clientWidth);
      const py = (caixa.scrollTop + (e.clientY - antes.top)) / Math.max(1, tela.current.clientHeight);
      setZoom((z) => {
        const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        requestAnimationFrame(() => {
          if (!tela.current) return;
          caixa.scrollLeft = px * tela.current.clientWidth - (e.clientX - antes.left);
          caixa.scrollTop = py * tela.current.clientHeight - (e.clientY - antes.top);
        });
        return novo;
      });
    };
    caixa.addEventListener("wheel", aoRodar, { passive: false });
    return () => caixa.removeEventListener("wheel", aoRodar);
  }, []);

  // Delete/Backspace apaga o nó marcado — menos quando se está digitando num campo.
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const foco = document.activeElement as HTMLElement | null;
      if (foco && (["INPUT", "TEXTAREA", "SELECT"].includes(foco.tagName) || foco.isContentEditable)) return;
      if (ferramenta !== "nos" || noAtivo === null || !peca || peca.nos.length <= 3) return;
      e.preventDefault();
      props.aoMudar((p) => apagarNoDaPeca(p, noAtivo) ?? p, true);
      props.aoMarcarNo(null);
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [ferramenta, noAtivo, peca, props]);

  return (
    <div ref={moldura} className="h-full overflow-auto bg-painel-suave">
      <canvas
        ref={tela}
        className="block h-auto max-w-none touch-none select-none"
        style={{ width: `${zoom * 100}%`, cursor: verTodas ? "pointer" : "crosshair" }}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onDoubleClick={aoDobrarClique}
      />
    </div>
  );
}
```

- [ ] **Step 2: A lista das peças**

```tsx
// src/telas/montagem/ListaDePecas.tsx
/**
 * A COLUNA DAS PEÇAS — escolher, apagar e juntar.
 *
 * JUNTAR traz as peças de OUTRO molde da estante para este: é o caso da
 * camisa que não coube numa foto só e foi digitalizada em duas. Vêm as peças
 * do primeiro tamanho do outro molde, e entram no tamanho deste. O outro
 * molde fica como estava — apagar é decisão da estante.
 */
import { useEffect, useState } from "react";
import { moldesApi, type MoldeNaEstante } from "../../api/moldes";
import { achatarCurvas } from "../../motores/ajusteDeCurvas";
import { caixaDe, pecaParaMontar } from "../../motores/montagem";
import { corDaPeca } from "../../utils/coresDePeca";
import { Icone } from "../../casca/Icone";
import type { MoldeEmMontagem, PecaEmMontagem } from "./useMoldeEmMontagem";

function Miniatura({ peca, cor }: { peca: PecaEmMontagem; cor: string }) {
  const pontos = achatarCurvas(peca.nos);
  const c = caixaDe(pontos);
  const lado = Math.max(c.largura, c.altura) || 1;
  return (
    <svg viewBox={`${c.minX} ${c.minY} ${lado} ${lado}`} className="size-12 shrink-0">
      <polygon points={pontos.map((p: { x: number; y: number }) => `${p.x},${p.y}`).join(" ")}
        fill="none" stroke={cor} strokeWidth={lado / 30} />
    </svg>
  );
}

export const nomeDaPeca = (p: PecaEmMontagem, i: number) =>
  p.papel && p.papel !== "outro" ? p.papel : p.nome || `peça ${i + 1}`;

interface Props {
  molde: MoldeEmMontagem;
  moldeId: number;
  indice: number;
  aoEscolher: (indice: number) => void;
}

export function ListaDePecas({ molde, moldeId, indice, aoEscolher }: Props) {
  const [outros, setOutros] = useState<MoldeNaEstante[]>([]);
  const [deQual, setDeQual] = useState("");
  const [juntando, setJuntando] = useState(false);

  useEffect(() => {
    moldesApi.estante().then((l) => setOutros(l.filter((m) => m.id !== moldeId))).catch(() => setOutros([]));
  }, [moldeId]);

  const apagar = (i: number) => {
    molde.mudarPecas((antes) => antes.filter((_, k) => k !== i));
    aoEscolher(Math.max(0, Math.min(i, molde.pecas.length - 2)));
  };

  const juntar = async () => {
    const id = Number(deQual);
    if (!id) return;
    setJuntando(true);
    try {
      const outro = await moldesApi.abrir(id);
      const tamanhoDeLa = outro.pecas[0]?.tamanho;
      const tamanhoDaqui = molde.pecas[0]?.tamanho ?? "base";
      const vindas = outro.pecas
        .filter((p) => p.tamanho === tamanhoDeLa)
        .map((p) => ({ ...(pecaParaMontar(p) as PecaEmMontagem), id: undefined, tamanho: tamanhoDaqui }));
      molde.mudarPecas((antes) => [...antes, ...vindas]);
      setDeQual("");
    } finally {
      setJuntando(false);
    }
  };

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col gap-2 overflow-auto border-r border-linha p-3">
      <p className="m-0 text-[0.8rem] font-semibold text-tinta-fraca">Peças</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {molde.pecas.map((p, i) => {
          const comErro = molde.problema?.peca === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => aoEscolher(i)}
                className={`flex w-full items-center gap-2 rounded-[8px] border p-1.5 text-left ${
                  i === indice ? "border-ambar bg-[var(--accent-soft)]" : "border-linha"
                } ${comErro ? "outline outline-2 outline-[#ff4d4d]" : ""}`}
              >
                <Miniatura peca={p} cor={comErro ? "#ff4d4d" : corDaPeca(i)} />
                <span className="flex min-w-0 flex-col text-[0.8rem]">
                  <strong className="truncate">{nomeDaPeca(p, i)}</strong>
                  <span className="text-tinta-fraca">
                    ×{p.quantidade}{p.marcacoes.espelhar ? " · espelhar" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {molde.pecas.length > 1 && (
        <button type="button" className="btn ghost-danger btn-sm" onClick={() => apagar(indice)}>
          <Icone referencia="icones.svg#trash-2" className="size-4" />
          Apagar a peça marcada
        </button>
      )}
      <div className="mt-auto flex flex-col gap-1.5 border-t border-linha pt-2">
        <p className="m-0 text-[0.78rem] text-tinta-fraca">Juntar as peças de outro molde</p>
        <select value={deQual} onChange={(e) => setDeQual(e.target.value)} aria-label="Molde para juntar">
          <option value="">Escolha um molde…</option>
          {outros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <button type="button" className="btn secondary btn-sm" disabled={!deQual || juntando} onClick={() => void juntar()}>
          {juntando ? "Juntando…" : "Juntar"}
        </button>
      </div>
    </aside>
  );
}
```

Conferir se `icones.svg#trash-2` já é usado no projeto (`grep -r "icones.svg#trash" src`). Se outro nome de lixeira já estiver em uso, usar o mesmo.

- [ ] **Step 3: O painel da peça**

```tsx
// src/telas/montagem/PainelDaPeca.tsx
/**
 * O PAINEL DA PEÇA — o que a peça é, e quanto corta.
 *
 * O PAPEL vem da mesma lista da estante (`PAPEIS_DE_PECA`), e não de texto
 * livre: é por ele que a estampa acha a peça (ver `telas/moldes/vocabulario.ts`).
 *
 * A MARGEM é texto, e não `<input type=number>`: quem digita "0,5" com
 * vírgula num campo numérico do navegador em português ora vê o valor sumir,
 * ora vira 5. `lerCm` aceita os dois e recusa o que não for número.
 */
import { useEffect, useState } from "react";
import { PAPEIS_DE_PECA } from "../moldes/vocabulario";
import { lerCm, pecaParaGravar } from "../../motores/montagem";
import { formatarCm } from "../../utils/numero";
import type { PecaEmMontagem } from "./useMoldeEmMontagem";

interface Props {
  peca: PecaEmMontagem;
  aoMudar: (mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes: boolean) => void;
}

export function PainelDaPeca({ peca, aoMudar }: Props) {
  const [margemEscrita, setMargemEscrita] = useState(String(peca.marcacoes.margem).replace(".", ","));
  useEffect(() => { setMargemEscrita(String(peca.marcacoes.margem).replace(".", ",")); }, [peca.marcacoes.margem]);
  const margemLida = lerCm(margemEscrita);
  const medida = pecaParaGravar(peca);

  const trocarMarcacao = (parte: Partial<PecaEmMontagem["marcacoes"]>) =>
    aoMudar((p) => ({ ...p, marcacoes: { ...p.marcacoes, ...parte } }), true);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col gap-3 overflow-auto border-l border-linha p-3 text-[0.85rem]">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">O que é</span>
        <select value={peca.papel} onChange={(e) => aoMudar((p) => ({ ...p, papel: e.target.value }), true)}>
          {PAPEIS_DE_PECA.map((papel) => <option key={papel} value={papel}>{papel}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Nome {peca.papel === "outro" ? "(é por ele que a peça é chamada)" : "(opcional)"}</span>
        {/* Sem lembrar a cada tecla: um nome de doze letras encheria doze passos do desfazer. */}
        <input type="text" value={peca.nome ?? ""} onChange={(e) => aoMudar((p) => ({ ...p, nome: e.target.value || null }), false)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Quantas cortam por peça pronta</span>
        <input
          type="number" min={1} step={1} value={peca.quantidade}
          onChange={(e) => aoMudar((p) => ({ ...p, quantidade: Math.max(1, Math.floor(Number(e.target.value) || 1)) }), true)}
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={peca.marcacoes.espelhar} onChange={(e) => trocarMarcacao({ espelhar: e.target.checked })} />
        <span>Cortar em par espelhado <span className="text-tinta-fraca">(metade vira do avesso)</span></span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Margem de costura (cm)</span>
        <input
          type="text" inputMode="decimal" value={margemEscrita}
          onChange={(e) => setMargemEscrita(e.target.value)}
          onBlur={() => { if (margemLida !== null && margemLida !== peca.marcacoes.margem) trocarMarcacao({ margem: margemLida }); }}
          aria-invalid={margemLida === null}
        />
        <span className="text-[0.78rem] text-tinta-fraca">
          {margemLida === null
            ? "Isso não é um número."
            : margemLida === 0
              ? "0 = o risco já é o corte (o normal em molde de papel fotografado)."
              : "O risco vira a costura; o corte é a linha tracejada em volta."}
        </span>
      </label>
      <div className="rounded-[8px] border border-linha p-2">
        <p className="m-0 font-semibold">Corte</p>
        <p className="m-0 text-tinta-fraca">
          {medida.peca ? `${formatarCm(medida.peca.largura)} × ${formatarCm(medida.peca.altura)}` : medida.erro}
        </p>
      </div>
      <div className="rounded-[8px] border border-linha p-2 text-tinta-fraca">
        <p className="m-0">{peca.marcacoes.piques.length} pique(s) · {peca.marcacoes.pontos.length} ponto(s)</p>
        <p className="m-0">Fio a {peca.marcacoes.fio.angulo}°</p>
        <div className="mt-1 flex gap-1">
          <button type="button" className="btn secondary btn-sm" onClick={() => trocarMarcacao({ fio: { ...peca.marcacoes.fio, angulo: 0 } })}>Fio vertical</button>
          <button type="button" className="btn secondary btn-sm" onClick={() => trocarMarcacao({ fio: { ...peca.marcacoes.fio, angulo: 90 } })}>Horizontal</button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Juntar tudo na mesa de montagem**

Substituir o esqueleto de `src/telas/montagem/MesaDeMontagem.tsx` por:

```tsx
// src/telas/montagem/MesaDeMontagem.tsx
/**
 * A MESA DE MONTAGEM — a bancada inteira: lista à esquerda, mesa no meio,
 * painel da peça à direita, barra em cima. Quem guarda o molde é o
 * `useMoldeEmMontagem`; quem mexe na peça são as contas de
 * `motores/montagem.js`. Aqui só se liga uma coisa na outra.
 */
import { useEffect, useState } from "react";
import { Icone } from "../../casca/Icone";
import { useMoldeEmMontagem } from "./useMoldeEmMontagem";
import { EscolhaDoMolde } from "./EscolhaDoMolde";
import { ListaDePecas } from "./ListaDePecas";
import { Mesa, type Ferramenta } from "./Mesa";
import { PainelDaPeca } from "./PainelDaPeca";
import { BarraDaMontagem } from "./BarraDaMontagem";

interface Props { id: number; aoTrocar: () => void; aoEscolherOutro: (id: number) => void }

const FERRAMENTAS: { qual: Ferramenta; rotulo: string; icone: string; dica: string }[] = [
  { qual: "nos", rotulo: "Nós", icone: "icones.svg#spline", dica: "Arrastar nós e alças; dois cliques põem ou tiram nó" },
  { qual: "pique", rotulo: "Pique", icone: "icones.svg#scissors", dica: "Clique no traço para pôr um pique; num pique, para tirar" },
  { qual: "ponto", rotulo: "Ponto", icone: "icones.svg#crosshair", dica: "Clique dentro da peça para marcar pence ou bolso" },
  { qual: "fio", rotulo: "Fio", icone: "icones.svg#move-vertical", dica: "Arraste o meio para mover, uma ponta para girar" },
];

export function MesaDeMontagem({ id, aoTrocar, aoEscolherOutro }: Props) {
  const molde = useMoldeEmMontagem(id);
  const [indice, setIndice] = useState(0);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("nos");
  const [verTodas, setVerTodas] = useState(false);
  const [noAtivo, setNoAtivo] = useState<number | null>(null);

  useEffect(() => { setNoAtivo(null); }, [indice, ferramenta]);

  // Ctrl+Z desfaz, fora de campo de texto (lá ele desfaz o texto).
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const foco = document.activeElement as HTMLElement | null;
      if (foco && ["INPUT", "TEXTAREA"].includes(foco.tagName)) return;
      e.preventDefault();
      molde.desfazer();
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [molde]);

  if (molde.carregando) return <p className="p-6 text-sm text-tinta-apagada">Abrindo o molde…</p>;
  if (molde.naoAchado) return <EscolhaDoMolde sumiu aoEscolher={aoEscolherOutro} />;

  const peca = molde.pecas[Math.min(indice, molde.pecas.length - 1)];
  const mudarEsta = (mudar: Parameters<typeof molde.mudarPeca>[1], lembrarAntes: boolean) =>
    molde.mudarPeca(indice, mudar, lembrarAntes);

  return (
    <div className="flex h-full flex-col">
      <BarraDaMontagem molde={molde} moldeId={id} aoTrocar={aoTrocar} aoIrParaPeca={setIndice} />
      <div className="flex items-center gap-1 border-b border-linha px-3 py-1.5">
        {FERRAMENTAS.map((f) => (
          <button
            key={f.qual} type="button" title={f.dica}
            className={`btn btn-sm ${ferramenta === f.qual && !verTodas ? "primary" : "secondary"}`}
            onClick={() => { setFerramenta(f.qual); setVerTodas(false); }}
          >
            <Icone referencia={f.icone} className="size-4" />
            {f.rotulo}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-linha" />
        <button type="button" className={`btn btn-sm ${verTodas ? "primary" : "secondary"}`} onClick={() => setVerTodas((v) => !v)}>
          <Icone referencia="icones.svg#layers" className="size-4" />
          Ver todas
        </button>
        <span className="ml-auto text-[0.78rem] text-tinta-fraca">
          {FERRAMENTAS.find((f) => f.qual === ferramenta)?.dica}. Roda do mouse aproxima.
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <ListaDePecas molde={molde} moldeId={id} indice={indice} aoEscolher={setIndice} />
        <div className="min-w-0 flex-1">
          <Mesa
            pecas={molde.pecas}
            indice={Math.min(indice, molde.pecas.length - 1)}
            ferramenta={ferramenta}
            verTodas={verTodas}
            noAtivo={noAtivo}
            comErro={molde.problema?.peca ?? null}
            aoMarcarNo={setNoAtivo}
            aoEscolherPeca={(i) => { setIndice(i); setVerTodas(false); }}
            aoLembrar={molde.lembrar}
            aoMudar={mudarEsta}
          />
        </div>
        {peca && <PainelDaPeca peca={peca} aoMudar={mudarEsta} />}
      </div>
    </div>
  );
}
```

Para esta tarefa compilar antes da Task 9, criar `src/telas/montagem/BarraDaMontagem.tsx` provisório:
```tsx
import type { MoldeEmMontagem } from "./useMoldeEmMontagem";
interface Props { molde: MoldeEmMontagem; moldeId: number; aoTrocar: () => void; aoIrParaPeca: (i: number) => void }
export function BarraDaMontagem({ molde }: Props) {
  return <div className="border-b border-linha px-3 py-2 text-[0.85rem]">{molde.nome} · {molde.gravacao}</div>;
}
```

- [ ] **Step 5: Conferir**

Run: `npm run icones && npx tsc --noEmit -p .` → sem erro.
À mão, com um molde de DXF e um rascunho: trocar de peça; arrastar nó; dois cliques no traço e no nó; pique (pôr e tirar); ponto (pôr e tirar); fio (mover e girar); margem "0,5" (sai do campo: aparece o corte tracejado); margem "3" numa peça com cava funda (fica vermelho, e a barra mostra "não salvo"); Ctrl+Z; "Ver todas" e clicar numa peça; juntar outro molde; apagar peça. Recarregar a página (F5): tudo o que foi salvo volta.

- [ ] **Step 6: Commit**

```bash
git add src/telas/montagem/
git commit -m "A mesa da Montagem: nós, piques, pontos, fio, margem, lista das peças e juntar moldes"
```

---

### Task 9: A barra: PDF, SVG, Concluir e Encaixar

**Files:**
- Modify: `src/telas/montagem/BarraDaMontagem.tsx` (substitui o provisório)
- Modify: `src/telas/moldes/EnvioParaEncaixe.tsx`

**Interfaces:**
- Consumes: `MoldeEmMontagem.gravar(situacao?)`; `riscoApi.pdf(nome, pecas: unknown[])` (Task 6); `desenhoDaPeca`, `pecaParaGravar`, `arranjar`, `svgDaMontagem`, `pecasParaOEncaixe` (Task 4); `EnvioParaEncaixe` (props `molde`, `aoFechar`, `aoRecarregar`); `useDialogo()` → `confirmar(texto): Promise<boolean>`, `avisar(texto): Promise<void>`.

- [ ] **Step 1: O espelhar no envio ao Encaixe**

`src/telas/moldes/EnvioParaEncaixe.tsx`:
```ts
import { pecasParaOEncaixe } from "../../motores/montagem";
```
e a linha `const pecas = molde.pecas.filter((p) => p.tamanho === tamanho);` vira:
```ts
  // A peça marcada "espelhar" na Montagem vira duas — uma do avesso. Ver
  // `pecasParaOEncaixe`: o espelho é no contorno, então a arte entra nele
  // como em qualquer outro.
  const pecas = useMemo(
    () => pecasParaOEncaixe(molde.pecas.filter((p) => p.tamanho === tamanho)) as PecaDoMolde[],
    [molde, tamanho],
  );
```
Conferir que nenhum `useMemo`/`useEffect` abaixo dependia de `pecas` ser recriado a cada render (com o memo, só fica mais estável).

- [ ] **Step 2: A barra**

```tsx
// src/telas/montagem/BarraDaMontagem.tsx
/**
 * A BARRA DA MONTAGEM — o nome, o estado da gravação e as saídas.
 *
 * PDF, SVG e Encaixar esperam a gravação terminar e saem do que está NO
 * BANCO: o arquivo baixado tem de ser o mesmo molde que o Encaixe vai
 * receber. Com algo sem salvar, os botões mandam gravar antes; se a gravação
 * falhar, não saem.
 *
 * ENCAIXAR só existe para molde concluído. O rascunho é o molde ainda sendo
 * identificado — peças sem papel no Encaixe viram "outro, outro, outro", e a
 * estampa não acha nenhuma.
 */
import { useState } from "react";
import { Icone } from "../../casca/Icone";
import { useDialogo } from "../../casca/Dialogo";
import { useErroEmAlerta } from "../../casca/Alerta";
import { moldesApi, type Molde } from "../../api/moldes";
import { riscoApi } from "../../api/risco";
import { arranjar, desenhoDaPeca, pecaParaGravar, svgDaMontagem } from "../../motores/montagem";
import { EnvioParaEncaixe } from "../moldes/EnvioParaEncaixe";
import type { MoldeEmMontagem } from "./useMoldeEmMontagem";

interface Props { molde: MoldeEmMontagem; moldeId: number; aoTrocar: () => void; aoIrParaPeca: (i: number) => void }

const ROTULO_DA_GRAVACAO = { salvo: "salvo", pendente: "salvando em instantes…", salvando: "salvando…", erro: "não salvo" } as const;

function baixar(blob: Blob, arquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function BarraDaMontagem({ molde, moldeId, aoTrocar, aoIrParaPeca }: Props) {
  const dialogo = useDialogo();
  const setErro = useErroEmAlerta("Não deu certo na Montagem");
  const [ocupado, setOcupado] = useState("");
  const [envio, setEnvio] = useState<Molde | null>(null);

  const desenhos = () => arranjar(molde.pecas.map((p) => desenhoDaPeca(pecaParaGravar(p).peca)));
  const arquivo = (ext: string) => `${(molde.nome || "molde").replace(/[\\/:*?"<>|]+/g, "_")}-molde.${ext}`;

  /** Grava o que faltar; se não der, mostra por quê e devolve `false`. */
  const garantirSalvo = async () => {
    const ok = await molde.gravar();
    if (!ok && molde.problema?.peca != null) aoIrParaPeca(molde.problema.peca);
    return ok;
  };

  const pdf = async () => {
    setOcupado("Gerando o PDF…");
    try {
      if (!(await garantirSalvo())) return;
      baixar(await riscoApi.pdf(molde.nome, desenhos()), arquivo("pdf"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado("");
    }
  };

  const svg = async () => {
    if (!(await garantirSalvo())) return;
    baixar(new Blob([svgDaMontagem(desenhos(), molde.nome)], { type: "image/svg+xml" }), arquivo("svg"));
  };

  const concluir = async () => {
    const semNome = molde.pecas.findIndex((p) => p.papel === "outro" && !p.nome);
    if (semNome >= 0) {
      aoIrParaPeca(semNome);
      const seguir = await dialogo.confirmar(
        `A peça ${semNome + 1} está como "outro" e sem nome: a estampa não vai achá-la pelo papel. Concluir assim mesmo?`,
      );
      if (!seguir) return;
    }
    setOcupado("Concluindo…");
    try {
      if (await molde.gravar("pronto")) await dialogo.avisar("Molde concluído. Ele já está na estante e pode ir ao Encaixe.");
      else if (molde.problema?.peca != null) aoIrParaPeca(molde.problema.peca);
    } finally {
      setOcupado("");
    }
  };

  const encaixar = async () => {
    if (!(await garantirSalvo())) return;
    try {
      setEnvio(await moldesApi.abrir(moldeId));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const podeSair = molde.gravacao !== "salvando" && !ocupado;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2">
        <button type="button" className="btn ghost btn-sm" onClick={aoTrocar} title="Montar outro molde">
          <Icone referencia="icones.svg#arrow-left" className="size-4" />
        </button>
        <input
          type="text" value={molde.nome} onChange={(e) => molde.renomear(e.target.value)}
          className="w-[260px]! font-semibold" aria-label="Nome do molde"
        />
        {molde.situacao === "rascunho" && <span className="etiqueta-tamanho">rascunho</span>}
        <span className={`text-[0.8rem] ${molde.gravacao === "erro" ? "text-[#ff4d4d]" : "text-tinta-fraca"}`}>
          {ROTULO_DA_GRAVACAO[molde.gravacao]}
          {molde.gravacao === "erro" && molde.problema ? ` — ${molde.problema.texto}` : ""}
        </span>
        {molde.gravacao === "erro" && (
          <button type="button" className="btn secondary btn-sm" onClick={() => void molde.gravar()}>Tentar de novo</button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn secondary btn-sm" disabled={!molde.podeDesfazer} onClick={molde.desfazer}>
            <Icone referencia="icones.svg#rotate-ccw" className="size-4" />
            Desfazer
          </button>
          <button type="button" className="btn secondary btn-sm" disabled={!podeSair} onClick={() => void pdf()}>
            <Icone referencia="icones.svg#download" className="size-4" />
            {ocupado === "Gerando o PDF…" ? ocupado : "PDF"}
          </button>
          <button type="button" className="btn secondary btn-sm" disabled={!podeSair} onClick={() => void svg()}>
            <Icone referencia="icones.svg#download" className="size-4" />
            SVG
          </button>
          {molde.situacao === "rascunho" ? (
            <button type="button" className="btn primary btn-sm" disabled={!podeSair} onClick={() => void concluir()}>
              Concluir molde
            </button>
          ) : (
            <button type="button" className="btn primary btn-sm" disabled={!podeSair} onClick={() => void encaixar()}>
              Encaixar
            </button>
          )}
        </div>
      </div>
      <p className="m-0 border-b border-linha px-3 py-1 text-[0.75rem] text-tinta-apagada">
        O PDF sai em tamanho real: imprima em 100% / "tamanho real", senão o visualizador reduz para caber na folha.
      </p>
      {envio && (
        <EnvioParaEncaixe molde={envio} aoFechar={() => setEnvio(null)} aoRecarregar={setEnvio} />
      )}
    </>
  );
}
```

Conferir que `icones.svg#arrow-left` existe em `node_modules/lucide-static/icons/` (existe no Lucide) e que as classes `btn ghost` existem em `estilo/` (`grep -rn "\.btn.ghost\b\|\.ghost {" estilo src`); se não houver `ghost`, usar `secondary`.

Nota sobre o `molde.problema` lido logo depois do `await molde.gravar()`: ele vem do render anterior (o estado novo só chega no próximo render). Para ir até a peça certa, `gravar` já guarda a peça em `problema`, e o vermelho aparece na lista. O `aoIrParaPeca` depois do await é conveniência; se ele pular para a peça errada nos testes à mão, trocar por um `useEffect` em `MesaDeMontagem` que faz `setIndice(molde.problema.peca)` sempre que `molde.problema?.peca` mudar para um número.

- [ ] **Step 3: Conferir**

Run: `npm run icones && npx tsc --noEmit -p .` → sem erro.
À mão: PDF baixa (abrir: corte, costura tracejada, piques, nome da peça, página do tamanho do corte); SVG baixa e abre no navegador com as camadas; Concluir num rascunho com peça "outro" sem nome pergunta; concluído, o selo some e aparece Encaixar; Encaixar abre o painel de arte; mandar ao Encaixe com uma peça ×2 espelhada → no Encaixe aparecem a normal e a "(espelhada)", virada.

- [ ] **Step 4: Commit**

```bash
git add src/telas/montagem/BarraDaMontagem.tsx src/telas/moldes/EnvioParaEncaixe.tsx
git commit -m "A Montagem ganha PDF, SVG, Concluir e Encaixar, e o Encaixe recebe a peça espelhada"
```

---

### Task 10: O Digitalizar continua para a Montagem, e a estante mostra o rascunho

**Files:**
- Modify: `src/telas/Digitalizar.tsx`
- Modify: `src/telas/Moldes.tsx`

**Interfaces:**
- Consumes: `moldesApi.criar({ nome, observacoes, situacao, pecas })` (Task 5); `marcacoesPadrao`, `pecaParaGravar` (Task 4).

- [ ] **Step 1: Trocar o download pelo "Continuar"**

Em `src/telas/Digitalizar.tsx`:
1. Tirar os imports de `riscoApi` e de `svgDosRiscos`. Acrescentar:
```ts
import { useNavigate } from "react-router-dom";
import { moldesApi } from "../api/moldes";
import { marcacoesPadrao, pecaParaGravar } from "../motores/montagem";
```
2. Apagar `gerandoPdf`/`setGerandoPdf`, `gravar`, `baixarSvg` e `baixarPdf`. No lugar:
```ts
  const navegar = useNavigate();
  const [criando, setCriando] = useState(false);

  /*
   * O risco vira um molde-RASCUNHO na estante, e a tela passa para a
   * Montagem em cima dele. Rascunho porque as peças ainda não sabem o que são
   * — "outro", sem nome — e é lá que ganham papel, pique e margem. Ver
   * docs/superpowers/specs/2026-09-26-montagem-de-moldes-design.md.
   */
  const continuar = async () => {
    if (!emCm) return;
    setCriando(true);
    setErro("");
    try {
      const pecasProntas = emCm.pecas.map((p: any, i: number) => {
        const g = pecaParaGravar({
          tamanho: "base", papel: "outro", nome: null, quantidade: 1, furos: [], origem: "Digitalizar",
          largura: 0, altura: 0, contorno: [], nos: p.nos, marcacoes: marcacoesPadrao(p.nos),
        });
        if (!g.peca) throw new Error(`A peça ${i + 1}: ${g.erro}.`);
        return g.peca;
      });
      const { id } = await moldesApi.criar({
        nome: nome.trim() || "Molde digitalizado",
        observacoes: "Digitalizado de uma foto.",
        situacao: "rascunho",
        pecas: pecasProntas,
      });
      navegar(`/montagem?molde=${id}`);
    } catch (e: any) {
      setErro(e?.message || "Não consegui criar o molde.");
    } finally {
      setCriando(false);
    }
  };
```
3. No JSX, o bloco dos dois botões "Baixar em PDF"/"Baixar em SVG" e o parágrafo depois dele ("Os dois saem medidos em centímetros…") viram:
```tsx
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-[0.85rem]">
                    <span className="shrink-0">Nome do molde</span>
                    <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="w-[240px]!" />
                  </label>
                  <button type="button" className="btn primary" onClick={() => void continuar()} disabled={!emCm || criando}>
                    <Icone referencia="icones.svg#arrow-right" className="size-4" />
                    {criando ? "Criando o molde…" : "Continuar para a montagem"}
                  </button>
                </div>

                <p className="m-0 text-[0.8rem] text-tinta-fraca">
                  O molde vai para a estante como <strong>rascunho</strong>, e a Montagem abre em cima
                  dele: lá cada peça ganha nome, pique, fio e margem, e de lá saem o PDF, o SVG e o
                  Encaixe.
                </p>
```
4. No cabeçalho do arquivo, a seção "A SAÍDA" vira:
```
 * ---------------------------------------------------------------------------
 * A SAÍDA
 * ---------------------------------------------------------------------------
 *
 * Esta tela não baixa arquivo. O risco medido vira um molde-RASCUNHO na
 * estante e a Montagem abre em cima dele (`telas/Montagem.tsx`): é lá que a
 * peça ganha papel, pique e margem, e é de lá que saem o PDF, o SVG e o
 * Encaixe. Baixar daqui entregava um risco sem nome nem pique, que alguém
 * tinha de marcar à mão no Corel e mandar de volta pela estante.
```

- [ ] **Step 2: A estante mostra o rascunho**

Em `src/telas/Moldes.tsx`:
1. `import { useNavigate } from "react-router-dom";` e, no componente, `const navegar = useNavigate();`.
2. Dentro de `.molde-identidade`, depois do `<h3 className="molde-nome">`:
```tsx
                  {molde.situacao === "rascunho" && (
                    <span className="etiqueta-tamanho" title="Saiu do Digitalizar e ainda não foi concluído na Montagem">rascunho</span>
                  )}
```
3. Em `.molde-acoes`, o botão "Encaixar" passa a depender da situação, e entra "Montagem":
```tsx
                  {molde.situacao === "rascunho" ? (
                    <button
                      type="button" className="btn primary btn-sm"
                      title="Terminar de identificar as peças e concluir o molde"
                      onClick={() => navegar(`/montagem?molde=${molde.id}`)}
                    >
                      Continuar montagem
                    </button>
                  ) : (
                    <>
                      <button
                        type="button" className="btn primary btn-sm"
                        title="Escolher a arte e mandar as peças deste molde para o tecido"
                        onClick={() => void abrirMolde(molde.id, "envio")}
                      >
                        Encaixar
                      </button>
                      <button
                        type="button" className="btn secondary btn-sm"
                        title="Marcar piques, fio e margem, e baixar o molde em PDF ou SVG"
                        onClick={() => navegar(`/montagem?molde=${molde.id}`)}
                      >
                        Montagem
                      </button>
                    </>
                  )}
```
("Editar" e "Excluir" continuam como estão.)

- [ ] **Step 3: Conferir**

Run: `npm run icones && npx tsc --noEmit -p .` → sem erro.
Run: `npm run bancada:nos && npm run bancada:margem && npm run bancada:montagem && npm run bancada:moldes-pecas && npm run bancada:risco-pdf` → todos OK.
Run: `npx vite build` → sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/telas/Digitalizar.tsx src/telas/Moldes.tsx
git commit -m "O Digitalizar para de baixar e continua para a Montagem, e a estante mostra o rascunho"
```

---

### Task 11: O caminho inteiro, no navegador

**Files:**
- Modify: `docs/MAPA.md` (se ele listar as telas; conferir com `grep -n "Digitalizar" docs/MAPA.md`)

- [ ] **Step 1: Subir o programa**

Usar a skill `run` (ou `npm run dev` + `npx vite`). Entrar com uma conta de teste.

- [ ] **Step 2: Percorrer o fluxo da spec, anotando o que falhar**

1. `/digitalizar` → foto de `D:\arte\photo da laser` → medir uma peça → "Continuar para a montagem".
2. Cai em `/montagem?molde=N`, com o selo "rascunho" e N peças como "outro".
3. Peça 1 → papel "frente", pique no ombro, margem "1". Peça 2 → "manga", ×2, espelhar.
4. F5 → tudo volta.
5. Margem "5" numa peça estreita → vermelho, "não salvo — Peça X: …"; voltar a "1" → "salvo".
6. PDF e SVG baixam e abrem.
7. Concluir (pergunta pelas peças "outro" sem nome) → "Encaixar" aparece.
8. Encaixar → escolher arte → mandar → no Encaixe aparece a manga normal e a "(espelhada)".
9. `/moldes` → o molde aparece sem selo, com "Montagem"; um rascunho novo aparece com "Continuar montagem".
10. Menu → "Montagem" (em Produção) → a escolha, com os rascunhos primeiro.
11. "Editar" (passo a passo antigo) no molde montado → mudar só a quantidade → salvar → abrir na Montagem: piques e margem continuam lá.

- [ ] **Step 3: Corrigir o que falhou**

Cada falha: voltar à tarefa dona do código, escrever na bancada o caso que falhou (quando for conta), corrigir e rodar de novo.

- [ ] **Step 4: Documentação**

Se `docs/MAPA.md` lista as telas ou os motores, acrescentar `telas/Montagem.tsx` + `telas/montagem/`, `motores/montagem.js`, `motores/margemDeCostura.js`, `motores/edicaoDeNos.js` e `servidor/moldes-pecas.js`, cada um com uma linha no tom das vizinhas.

- [ ] **Step 5: Commit**

```bash
git add docs/MAPA.md
git commit -m "O mapa ganha a Montagem e os motores dela"
```
