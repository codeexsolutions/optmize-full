# Curvas fáceis da Montagem — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o nó liso automático (a curva segue os pontos, cada lado com a sua abertura), puxadores grandes, a barra numa linha, a mesa com a peça inteira e zoom/pan, e os atalhos.

**Architecture:** contas puras novas em `motores/edicaoDeNos.js` (o nó guarda `auto: { antes, depois, giro }` e as alças continuam gravadas); o gancho `useEditorDeNos` passa a chamá-las em cada mexida; o desenho, a barra, a Mesa e a MesaDeMontagem mudam por cima. O servidor e a graduação aprendem o campo.

**Tech Stack:** React 19 + TypeScript (tela), JavaScript puro (motores), Express + better-sqlite3 (servidor), bancadas em Node (assert, jsdom, Puppeteer).

**Spec:** `docs/superpowers/specs/2026-10-05-curvas-faceis-da-montagem-design.md`

## Global Constraints

- Abertura (`antes`, `depois`) presa entre 0,05 e 4; `giro` entre −π e π.
- `derivarAuto` silencioso só com alças na mesma reta a até 10⁻⁶ rad; junção reta/curva a até 2°.
- Raio de pega 16 px; nó liso 6 px de raio, quina 12 px de lado, selecionado 7,5 px; puxador 6,5 px.
- Setas 1 mm / Shift 1 cm / Alt 0,1 mm (unidades da Montagem: cm, então 0,1 / 1 / 0,01).
- Atalhos não disparam em campo de texto nem com janela aberta (`aria-modal="true"`).
- Moldes que já existem não mudam de forma ao abrir; o nó liso de hoje, refeito, fica a < 0,001 mm.
- Código, comentários e textos em português, no estilo do repositório; um commit por tarefa.

## Review Focus

- Nó automático com vizinho em cima dele (distância zero) — a conta não pode dar NaN; o nó fica como está.
- Nó que volta para trás (os dois vizinhos do mesmo lado, bissetriz nula) — a direção cai na de um vizinho, sem NaN.
- Peça de 3 nós toda automática, e peça com todos os trechos retos — nada quebra, nenhum handle NaN.
- Ctrl+Z logo depois de um arrasto de puxador — volta ao desenho de antes (o `derivarAuto` do começo não é um passo à parte).
- Molde gravado antes desta mudança (sem `auto`) e `auto` estragado vindo do banco — abre igual; o servidor prende os números.

Cada linha tem o seu teste na tarefa dona (1, 1, 1, 5, 2).

---

### Task 1: as contas do nó automático

**Files:**
- Modify: `src/motores/edicaoDeNos.js`
- Test: `bancada/conferir-edicao-de-nos.mjs`

**Interfaces:**
- Produces (todas puras, devolvem lista nova):
  - `alcasDoNoAutomatico(nos, i) → No`
  - `refazerAlcas(nos, indices|null) → No[]`
  - `derivarAuto(nos, indices|null) → No[]` (converte o que pode, sem mudar o desenho além do previsto)
  - `rederivarAuto(nos, indices) → No[]` (só nos que já têm `auto`: refaz os números das alças; não dá → tira o `auto`)
  - `comVizinhos(indices, n) → number[]`
  - `moverNosLisos(nos, indices, dx, dy) → No[]`
  - `alinharNosLisos(nos, indices, eixo, referencia) → No[]`
  - `moverPuxador(nos, i, parte: "entrada"|"saida", alvo, { quebrar }) → No[]`
  - `voltarLado(nos, i, parte) → No[]`
  - `tornarLiso(nos, indices) → No[]`, `tornarQuina(nos, indices) → No[]`, `voltarAoAuto(nos, indices) → No[]`
  - `puxarTrechoLiso(nos, i, t, alvo) → No[] | null`
  - `ehAutomatico(no) → boolean`
  - `clonarNos`, `inserirNoNoTraco`, `apagarNos`, `reduzirNos`, `converterTrechos` passam a cuidar do `auto`.

- [ ] **Step 1: os testes** — no fim de `conferir-edicao-de-nos.mjs`, antes do `console.log`:
  - regra de 1.3 num nó entre duas curvas (direção = bissetriz, tamanhos dist/3 × abertura), com reta antes, com reta depois, com retas dos dois lados (alças no nó);
  - círculo de 8 nós suaves: `refazerAlcas(derivarAuto(c))` a menos de 1e-6 cm de `c` em cada alça; e todos ganharam `auto`;
  - nó canto entre duas curvas e nó com alças fora de linha: `derivarAuto` deixa igual;
  - junção reta→curva com alça a 1°: vira automático, alça curva alinhada com a reta (bico some); a 5°: fica canto;
  - `moverNosLisos` num nó do círculo: ele e os dois vizinhos com alças em linha (ângulo entre `saida−no` e `no−entrada` < 1e-9);
  - `moverPuxador` lado saída: muda `depois`, mantém `antes`; ponto liso; nó preso a reta: direção igual à da reta;
  - `moverPuxador` com `quebrar`: `canto` true, sem `auto`, a entrada no lugar;
  - `voltarLado` e `voltarAoAuto` devolvem abertura 1 e giro 0;
  - `puxarTrechoLiso` no círculo: as duas pontas continuam lisas;
  - vizinho em cima do nó e nó que volta para trás: nenhum número NaN;
  - peça de 3 nós automáticos e quadrado de retas: `refazerAlcas` sem NaN, quadrado igual;
  - `inserirNoNoTraco` numa curva de nós automáticos: desenho igual (amostras a menos de 1e-9) e o nó novo automático.
- [ ] **Step 2:** `npm run bancada:nos` → falha (`alcasDoNoAutomatico` não existe).
- [ ] **Step 3: a implementação** — o código da seção "Código da Task 1", abaixo.
- [ ] **Step 4:** `npm run bancada:nos` → OK; `npm run bancada:montagem` e `npm run bancada:editor` → OK.
- [ ] **Step 5:** commit "O nó liso automático: as contas da curva que segue os pontos, cada lado com a sua abertura".

#### Código da Task 1

```js
/* --------------------------------------------------------------------------
 * O NÓ LISO AUTOMÁTICO — ver docs/superpowers/specs/2026-10-05-curvas-faceis-da-montagem-design.md
 * -------------------------------------------------------------------------- */
const ABERTURA_MIN = 0.05;
const ABERTURA_MAX = 4;
const EM_LINHA = 1e-6;            // rad: alças "na mesma reta" para virar automático sem mudar o desenho
const JUNTO_DA_RETA = (2 * Math.PI) / 180;

const prender = (v, a, b) => Math.min(b, Math.max(a, v));
const anguloDe = (v) => Math.atan2(v.y, v.x);
const girarVetor = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
function normalizarAngulo(a) {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

export const ehAutomatico = (no) => !!(no && no.auto);

/** Os números do `auto`, presos aos limites (dado velho ou estragado não vira NaN). */
function numerosDoAuto(a) {
  const num = (v, padrao) => (Number.isFinite(v) ? v : padrao);
  return {
    antes: prender(num(a && a.antes, 1), ABERTURA_MIN, ABERTURA_MAX),
    depois: prender(num(a && a.depois, 1), ABERTURA_MIN, ABERTURA_MAX),
    giro: normalizarAngulo(num(a && a.giro, 0)),
  };
}

/** A direção automática do nó `i`, sem o giro, e se ela está presa a uma reta; `null` quando não há. */
function direcaoAutomatica(nos, i) {
  const n = nos.length;
  const no = nos[i];
  const A = nos[(i - 1 + n) % n];
  const B = nos[(i + 1) % n];
  const retaAntes = !!A.retaDepois;
  const retaDepois = !!no.retaDepois;
  if (retaAntes && retaDepois) return null;
  if (retaAntes) { const d = unitario(menos(no, A)); return d ? { d, presa: true } : null; }
  if (retaDepois) { const d = unitario(menos(B, no)); return d ? { d, presa: true } : null; }
  const u0 = unitario(menos(no, A));
  const u1 = unitario(menos(B, no));
  if (!u0 && !u1) return null;
  if (!u0 || !u1) return { d: u0 ?? u1, presa: false };
  return { d: unitario(somar(u0, u1)) ?? u1, presa: false };
}

/** O nó `i` com as alças da conta automática (o nó sem `auto` volta como está). */
export function alcasDoNoAutomatico(nos, i) {
  const no = nos[i];
  if (!no.auto) return no;
  const n = nos.length;
  const A = nos[(i - 1 + n) % n];
  const B = nos[(i + 1) % n];
  const aqui = { x: no.x, y: no.y };
  const dir = direcaoAutomatica(nos, i);
  if (!dir) return { ...no, entrada: { ...aqui }, saida: { ...aqui } };
  const { antes, depois, giro } = numerosDoAuto(no.auto);
  const d = dir.presa ? dir.d : girarVetor(dir.d, giro);
  const ce = (tamanho(menos(no, A)) / 3) * antes;
  const cs = (tamanho(menos(B, no)) / 3) * depois;
  return {
    ...no,
    entrada: A.retaDepois ? { ...aqui } : somar(no, vezes(d, -ce)),
    saida: no.retaDepois ? { ...aqui } : somar(no, vezes(d, cs)),
  };
}

/** Refaz as alças dos nós automáticos de `indices` (todos, com `null`) a partir de onde os nós estão. */
export function refazerAlcas(nos, indices = null) {
  const alvo = indices === null ? null : new Set(indices);
  let mudou = false;
  const saida = nos.map((no, i) => {
    if (!no.auto || (alvo && !alvo.has(i))) return no;
    mudou = true;
    return alcasDoNoAutomatico(nos, i);
  });
  return mudou ? saida : nos;
}

/** Os números que reproduzem as alças de agora do nó `i`, ou `null` se não há como sem mudar o desenho. */
function autoDasAlcas(nos, i) {
  const n = nos.length;
  const no = nos[i];
  const A = nos[(i - 1 + n) % n];
  const B = nos[(i + 1) % n];
  const retaAntes = !!A.retaDepois;
  const retaDepois = !!no.retaDepois;
  if (retaAntes && retaDepois) return null;
  const dir = direcaoAutomatica(nos, i);
  if (!dir) return null;
  const distA = tamanho(menos(no, A));
  const distB = tamanho(menos(B, no));
  const cabe = (v) => v >= ABERTURA_MIN && v <= ABERTURA_MAX;
  if (retaAntes || retaDepois) {
    const v = retaAntes ? menos(no.saida, no) : menos(no, no.entrada);
    const t = tamanho(v);
    const dist = retaAntes ? distB : distA;
    if (t < 1e-9 || dist < 1e-9) return null;
    if (Math.abs(normalizarAngulo(anguloDe(v) - anguloDe(dir.d))) > JUNTO_DA_RETA) return null;
    const abertura = t / (dist / 3);
    if (!cabe(abertura)) return null;
    return { antes: retaAntes ? 1 : abertura, depois: retaAntes ? abertura : 1, giro: 0 };
  }
  if (no.canto) return null;
  const ve = menos(no, no.entrada);
  const vs = menos(no.saida, no);
  const te = tamanho(ve);
  const ts = tamanho(vs);
  if (te < 1e-9 || ts < 1e-9 || distA < 1e-9 || distB < 1e-9) return null;
  if (Math.abs(normalizarAngulo(anguloDe(vs) - anguloDe(ve))) > EM_LINHA) return null;
  const antes = te / (distA / 3);
  const depois = ts / (distB / 3);
  if (!cabe(antes) || !cabe(depois)) return null;
  return { antes, depois, giro: normalizarAngulo(anguloDe(vs) - anguloDe(dir.d)) };
}

/** O nó automático, sem as marcas dos tipos de antes. */
function comAuto(no, auto) {
  const { simetrico: _s, ...resto } = no;
  return { ...resto, canto: false, auto };
}

/**
 * Converte em automático os nós de `indices` (todos, com `null`) que dá para
 * converter sem mudar o desenho (ver 1.4 da spec). O que não dá fica como está.
 */
export function derivarAuto(nos, indices = null) {
  const alvo = indices === null ? null : new Set(indices);
  const convertidos = [];
  const saida = nos.map((no, i) => {
    if (no.auto || (alvo && !alvo.has(i))) return no;
    const auto = autoDasAlcas(nos, i);
    if (!auto) return no;
    convertidos.push(i);
    return comAuto(no, auto);
  });
  return convertidos.length ? refazerAlcas(saida, convertidos) : nos;
}

/**
 * Os nós de `indices` que JÁ são automáticos e tiveram as alças feitas por outra
 * conta (pôr nó, apagar, reduzir): os números passam a ser os dessas alças. Não
 * dá: o nó deixa de ser automático (fica com as alças que tem).
 */
export function rederivarAuto(nos, indices) {
  const alvo = new Set(indices);
  let mudou = false;
  const saida = nos.map((no, i) => {
    if (!no.auto || !alvo.has(i)) return no;
    mudou = true;
    const semAuto = { ...no };
    delete semAuto.auto;
    const lista = nos.slice();
    lista[i] = semAuto;
    const auto = autoDasAlcas(lista, i);
    if (auto) return { ...no, auto };
    const linha = Math.abs(normalizarAngulo(anguloDe(menos(no.saida, no)) - anguloDe(menos(no, no.entrada)))) <= EM_LINHA;
    return { ...semAuto, canto: !linha };
  });
  return mudou ? saida : nos;
}

/** Os índices e os vizinhos deles, na volta fechada. */
export function comVizinhos(indices, n) {
  const s = new Set();
  for (const i of indices) for (const k of [i - 1, i, i + 1]) s.add((k + n) % n);
  return [...s].sort((a, b) => a - b);
}

/** Move os nós e deixa a curva seguir: os lisos em volta refazem as alças. */
export function moverNosLisos(nos, indices, dx, dy) {
  const roda = comVizinhos(indices, nos.length);
  return refazerAlcas(moverNos(derivarAuto(nos, roda), indices, dx, dy), roda);
}

/** `alinharNos`, com a curva seguindo. */
export function alinharNosLisos(nos, indices, eixo, referencia) {
  const roda = comVizinhos(indices, nos.length);
  return refazerAlcas(alinharNos(derivarAuto(nos, roda), indices, eixo, referencia), roda);
}

/**
 * O puxador de um lado do nó liso automático `i` foi arrastado até `alvo`: a
 * distância vira a abertura daquele lado, e a direção vira o giro (os dois
 * lados giram juntos). Preso a uma reta, só a abertura. `quebrar` (Alt): o nó
 * vira quina e só aquela alça anda. Nó que não é automático: a alça anda pelo
 * tipo dele, como sempre.
 */
export function moverPuxador(nos, i, parte, alvo, { quebrar = false } = {}) {
  if (quebrar) return moverPega(tornarQuina(nos, [i]), { no: i, parte }, alvo);
  const no = nos[i];
  if (!no.auto) return moverPega(nos, { no: i, parte }, alvo);
  const n = nos.length;
  const dir = direcaoAutomatica(nos, i);
  if (!dir) return nos;
  const vizinho = parte === "saida" ? nos[(i + 1) % n] : nos[(i - 1 + n) % n];
  const dist = tamanho(menos(vizinho, no));
  if (dist < 1e-9) return nos;
  const v = parte === "saida" ? menos(alvo, no) : menos(no, alvo);
  const atual = numerosDoAuto(no.auto);
  const comprimento = dir.presa ? v.x * dir.d.x + v.y * dir.d.y : tamanho(v);
  const abertura = prender(comprimento / (dist / 3), ABERTURA_MIN, ABERTURA_MAX);
  const giro = dir.presa || tamanho(v) < 1e-9 ? atual.giro : normalizarAngulo(anguloDe(v) - anguloDe(dir.d));
  const auto = { ...atual, [parte === "saida" ? "depois" : "antes"]: abertura, giro };
  const lista = nos.slice();
  lista[i] = { ...no, auto };
  lista[i] = alcasDoNoAutomatico(lista, i);
  return lista;
}

/** Dois cliques num puxador: aquele lado volta ao natural, e o giro a zero. */
export function voltarLado(nos, i, parte) {
  const no = nos[i];
  if (!no || !no.auto) return nos;
  const auto = { ...numerosDoAuto(no.auto), [parte === "saida" ? "depois" : "antes"]: 1, giro: 0 };
  const lista = nos.slice();
  lista[i] = { ...no, auto };
  lista[i] = alcasDoNoAutomatico(lista, i);
  return lista;
}

/** L: liso automático — sem mudar o desenho quando dá; se não (era quina), com abertura 1 e giro 0. */
export function tornarLiso(nos, indices) {
  let lista = derivarAuto(nos, indices);
  const novos = [];
  lista = lista.map((no, i) => {
    if (!indices.includes(i) || no.auto) return no;
    const n = lista.length;
    if (lista[(i - 1 + n) % n].retaDepois && no.retaDepois) return no;
    novos.push(i);
    return comAuto(no, { antes: 1, depois: 1, giro: 0 });
  });
  return novos.length ? refazerAlcas(lista, novos) : lista;
}

/** Q: quina — sem `auto`, marcado canto; as alças ficam onde estão. */
export function tornarQuina(nos, indices) {
  const alvo = new Set(indices);
  return nos.map((no, i) => {
    if (!alvo.has(i)) return no;
    const { auto: _a, simetrico: _s, ...resto } = no;
    return { ...resto, canto: true };
  });
}

/** A: os dois lados ao natural e o giro a zero (o que não é automático vira, como no L). */
export function voltarAoAuto(nos, indices) {
  const lista = tornarLiso(nos, indices).map((no, i) => (indices.includes(i) && no.auto ? { ...no, auto: { antes: 1, depois: 1, giro: 0 } } : no));
  return refazerAlcas(lista, indices);
}

/** Puxar a curva no meio do trecho, sem bico nas pontas lisas: cada ponta automática vira um puxador. */
export function puxarTrechoLiso(nos, i, t, alvo) {
  const n = nos.length;
  const j = (i + 1) % n;
  const base = derivarAuto(nos, [i, j]);
  const puxado = puxarTrecho(base, i, t, alvo);
  if (!puxado) return null;
  let r = puxado;
  if (base[i].auto) r = moverPuxador(r.map((no, k) => (k === i ? { ...no, auto: base[i].auto } : no)), i, "saida", puxado[i].saida);
  if (base[j].auto) r = moverPuxador(r.map((no, k) => (k === j ? { ...no, auto: r[j].auto ?? base[j].auto } : no)), j, "entrada", puxado[j].entrada);
  return r;
}
```

E nas funções que já existem:

- `clonarNos`: `...(n.auto ? { auto: { ...n.auto } } : {})`.
- `inserirNoNoTraco` (curva): o nó novo nasce `canto: false`; no fim, se `a` ou `b` tinham `auto`, `derivarAuto(saida, [i + 1])` e `rederivarAuto(.., [i, i + 2 (mod n+1)])`.
- `apagarNos` e `reduzirNos`: no fim, `rederivarAuto(nosNovos, pontasDosPedacos)` (os nós `mapa[a]` e `mapa[b]` de cada pedaço).
- `converterTrechos`: no fim, `refazerAlcas(copia, comVizinhos(trechos e trechos+1))` — o automático ao lado de uma reta nova passa a sair dela sem quebra.

---

### Task 2: o campo `auto` no servidor, no tipo e na graduação

**Files:**
- Modify: `servidor/moldes-pecas.js` (`lerNos`), `src/api/risco.ts` (`NoDoRisco`), `src/telas/risco/desenhoDeNos.ts` (`No`), `src/motores/graduacao.js` (`gerarTamanho`)
- Test: `bancada/conferir-moldes-pecas.cjs`, `bancada/conferir-graduacao.mjs`

**Interfaces:**
- Consumes: `refazerAlcas` (Task 1).
- Produces: `NoDoRisco.auto?: { antes: number; depois: number; giro: number }`; `No.auto?` igual.

- [ ] **Step 1:** testes — moldes-pecas: um nó com `auto: { antes: 2, depois: 9, giro: 7 }` volta com `depois: 4` e `giro` normalizado; `auto: { antes: "x" }` volta sem `auto`; nó sem `auto` volta sem o campo. Graduação: base com círculo automático e regra de pontos que estica um nó → no tamanho gerado, os automáticos com alças em linha; graduação zero → nós iguais ao base.
- [ ] **Step 2:** rodar `npm run bancada:moldes-pecas` e `npm run bancada:graduacao` → falham.
- [ ] **Step 3:** `lerNos` ganha `...autoLido(n.auto)`, com `autoLido` = os três números finitos (senão nada), `antes`/`depois` presos a [0,05; 4], `giro` normalizado; nó `canto` não leva `auto`. Em `gerarTamanho`, depois de montar `nos` (os dois ramos, escala e pontos): `nos = refazerAlcas(nos)`. Os tipos ganham o campo.
- [ ] **Step 4:** as duas bancadas → OK; `npm run tipos` → OK.
- [ ] **Step 5:** commit "O servidor guarda o nó automático, e a graduação refaz a curva lisa em cada tamanho".

---

### Task 3: a bancada local dos moldes reais

**Files:**
- Create: `bancada/conferir-curvas-reais.mjs`; Modify: `package.json` (`bancada:curvas-reais`)

- [ ] **Step 1:** a bancada abre `dados.db` só para leitura (`better-sqlite3`, `readonly`), lê `molde_pecas.nos` (JSON) de todas as peças; sem o banco, `console.log("sem dados.db — pulando")` e sai 0. Para cada peça: `r = refazerAlcas(derivarAuto(nos))`; para os nós que viraram automáticos e NÃO são junção reta/curva, a maior distância de alça entre `r` e `nos` < 1e-5 cm (0,0001 mm); conta quantos nós viraram, quantos ficaram, e quantas junções; imprime a tabela por molde.
- [ ] **Step 2:** `npm run bancada:curvas-reais` → OK com os moldes desta máquina.
- [ ] **Step 3:** commit "Bancada local: os moldes reais viram automáticos sem mudar o desenho".

---

### Task 4: o desenho dos nós

**Files:** Modify: `src/telas/risco/desenhoDeNos.ts`

**Interfaces:**
- Produces: `desenharNos(ctx, nos, selecionados, emTela, opcoes?: { sob?: SobOPonteiro | null; alcas?: boolean })`, com
  `type SobOPonteiro = { tipo: "no"; no: number } | { tipo: "alca"; no: number; parte: "entrada" | "saida" } | { tipo: "traco"; ponto: Ponto } | null`.

- [ ] **Step 1:** nó liso raio 6, quina lado 12, selecionado 7,5 (laranja, halo 11); anel branco de raio 11 no `sob` do tipo nó; alças dos selecionados: nos automáticos (sem `opcoes.alcas`), linha 2 px e bolinha azul de 6,5 com anel no `sob` alça; nos outros, como hoje; `sob` traço: bolinha vazada de 5,5 no ponto. `No` ganha `auto?`.
- [ ] **Step 2:** `npm run tipos` → OK (os chamadores antigos passam sem `opcoes`).
- [ ] **Step 3:** commit junto com a Task 5.

---

### Task 5: o editor — pega, puxadores, ponto sob o ponteiro e atalhos

**Files:** Modify: `src/telas/risco/useEditorDeNos.ts`; Test: `bancada/cenarios-do-editor.tsx`, `bancada/conferir-editor-de-nos.mjs`

**Interfaces:**
- Consumes: Task 1 (todas), Task 4 (`SobOPonteiro`).
- Produces (no retorno do gancho): `apertar(ponto, raio, shift, alt = false)`, `passar(ponto, raio) → "move" | "copy" | "crosshair"`, `sair()`, `sob: SobOPonteiro`, `alcas: boolean`, `alternarAlcas()`, `atalhosAbertos: boolean`, `abrirAtalhos(aberto)`, `tornarLiso()`, `tornarQuina()`, `voltarAoAuto()`, `podeLiso`, `podeQuina`; `teclar` com as teclas novas.

- [ ] **Step 1:** cenários novos em `cenarios-do-editor.tsx` (`rodar`): no círculo (TelaDeNos):
  - arrastar um nó (apertar/mover/soltar): os vizinhos com alças em linha;
  - selecionar o nó 2, apertar no fim da saída dele (o puxador) e mover: só o `depois` muda; com `alt`, vira canto;
  - dobrarClique num puxador: lado volta a 1;
  - teclas: `l` (liso), `q` (quina), `a` (auto), `Tab`/Shift+Tab (seleção anda), Alt+ArrowRight (anda 0,01), `h`/`H` (alinha), `r`/`c` (reta/curva), `e` (reduz), `?` (abre atalhos) — e com um `<input>` focado, `q` não faz nada;
  - Ctrl+Z (desfazer da tela) depois de arrastar um puxador: os nós voltam iguais aos de antes (deep equal).
- [ ] **Step 2:** `npm run bancada:editor` → falha.
- [ ] **Step 3:** o gancho:
  - `apertar`: alça de nó automático (sem `alcas`) → arrasto `{ tipo: "puxador", base: derivarAuto(nos, [no]), no, parte, quebrar: alt }`; com `alcas`, alça de nó automático tira o `auto` (vira suave) antes de `moverPega`. Nó → arrasto de nós com `base = derivarAuto(nos, comVizinhos(indices))`. Traço → `{ tipo: "trecho", base: nos, ... }`.
  - `mover`: puxador → `moverPuxador(a.base, …, { quebrar })`; nós → `refazerAlcas(moverNos(a.base, …), roda)`; trecho → `puxarTrechoLiso`.
  - `dobrarClique`: alça → `voltarLado`; nó → apaga; traço → põe.
  - `passar`: `pegaSob(nos, ponto, raio, selecionados)` → `sob` alça/nó; senão `tracoSob` → `sob` traço com o ponto; guarda em estado só quando muda.
  - setas: `moverNosLisos`; com Alt, `passo = curto / 10`.
  - `alinhar`: `alinharNosLisos`.
  - teclas novas (sem Ctrl/Meta): `l q a r c h H e ? Tab`.
- [ ] **Step 4:** `npm run bancada:editor` → OK; `npm run tipos`.
- [ ] **Step 5:** commit (Tasks 4 e 5) "O editor de nós com puxadores, o nó sob o ponteiro, a pega maior e os atalhos novos".

---

### Task 6: a barra numa linha e a janela de atalhos

**Files:** Modify: `src/telas/risco/BarraDosNos.tsx`; Create: `src/telas/risco/JanelaDeAtalhos.tsx`

- [ ] **Step 1:** a barra: `Liso(L) | Quina(Q) | Auto(A)` · `+ Nó | − Nó` · `Reta(R) | Curva(C)` · `Alinhar ▾` (↔ H, ↕ Shift+H) · `Reduzir ▾` (botão + controle + mm) · `Girar ▾` (↺, ↻, graus) · `Alças` (alterna, pressionado quando ligado) · `?` · o contador "3 de 41 nós" e o aviso. Os menus são um `MenuDaBarra` local (botão + painel absoluto; fecha em Esc, clique fora e ao escolher).
- [ ] **Step 2:** `JanelaDeAtalhos`: janela com `aria-modal="true"`, a tabela da seção 3 da spec, fecha em Esc, no véu e no botão.
- [ ] **Step 3:** `npm run tipos` → OK; `npm run bancada:editor` → OK.
- [ ] **Step 4:** commit "A barra dos nós numa linha, com menus, e a janela dos atalhos".

---

### Task 7: a mesa — a peça inteira, zoom, Espaço e o ponteiro

**Files:** Modify: `src/telas/montagem/Mesa.tsx`

- [ ] **Step 1:** medir largura **e altura** da moldura; `escalaTela = min(largura/vista.largura, altura/vista.altura) × zoom` (px CSS por cm); canvas com `style.width = vista.largura × escalaTela` px, centralizado quando menor que a moldura; `escala` do canvas = `min(escalaTela × devicePixelRatio, LADO_MAXIMO_PX / maior lado)`.
- [ ] **Step 2:** `PEGA = 16`; `aoMover` sem arrasto → `editor.passar` (ferramenta Nós) e o cursor do canvas; `onPointerLeave` → `editor.sair()`; `desenharNos(..., { sob: editor.sob, alcas: editor.alcas })`; `apertar(alvo, raio, shift, alt)`.
- [ ] **Step 3:** botões no canto (`−`, porcentagem, `+`, `Ajustar`); teclas (fora de campo, sem janela): `0` ajusta; `z` aproxima nos selecionados (caixa com 15% de folga) e rola para centralizar; Espaço (keydown/keyup, com `preventDefault`) liga o modo mão; aperto com Espaço ou botão do meio rola a moldura pelo arrasto; cursor `grab`/`grabbing`.
- [ ] **Step 4:** `npm run tipos` → OK.
- [ ] **Step 5:** commit "A mesa da Montagem abre a peça inteira, com zoom por botão e tecla, Espaço para andar e o nó sob o ponteiro".

---

### Task 8: a Montagem — coluna de ferramentas, atalhos de ferramenta e o refazer

**Files:** Modify: `src/telas/montagem/MesaDeMontagem.tsx`, `src/telas/montagem/useMoldeEmMontagem.ts`, `src/telas/montagem/BarraDaMontagem.tsx`

- [ ] **Step 1:** `useMoldeEmMontagem`: pilha `refazer` (o `desfazer` empurra o estado de agora nela; toda mexida que lembra a esvazia); `refazer()` e `podeRefazer`.
- [ ] **Step 2:** `MesaDeMontagem`: a faixa de ferramentas some; uma coluna vertical (`w-16`) entre a lista e a mesa, com as ferramentas e "Ver todas" (ícone em cima, rótulo embaixo, dica com a tecla); ouvinte de teclado (fora de campo e de janela, sem Ctrl/Alt/Meta): `n p m f g v` trocam a ferramenta; `[` `]` giram a peça (`girarPeca`, −90/90); Ctrl+Z desfaz, Ctrl+Y e Ctrl+Shift+Z refazem; a `JanelaDeAtalhos` abre por `editor.atalhosAbertos`.
- [ ] **Step 3:** `BarraDaMontagem`: o aviso do PDF vira `title` do botão PDF; a linha some; botão Refazer ao lado do Desfazer.
- [ ] **Step 4:** `npm run tipos`; `npm run bancada:montagem` → OK.
- [ ] **Step 5:** commit "A Montagem com a caixa de ferramentas ao lado da mesa, as teclas das ferramentas e o refazer".

---

### Task 9: o Digitalizar com a pega e o ponto sob o ponteiro

**Files:** Modify: `src/telas/Digitalizar.tsx`

- [ ] **Step 1:** `PEGA = 16`; `apertar(alvo, raio, e.shiftKey, e.altKey)`; mover sem arrasto → `editor.passar` e cursor; `desenharNos(..., { sob: editor.sob, alcas: editor.alcas })`; a `JanelaDeAtalhos` abre com `editor.atalhosAbertos`.
- [ ] **Step 2:** `npm run tipos` → OK.
- [ ] **Step 3:** commit "O Digitalizar usa a pega maior, o nó sob o ponteiro e os puxadores".

---

### Task 10: a bancada da tela da Montagem, a regressão e o build

**Files:** Create: `bancada/conferir-montagem-tela.cjs`; Modify: `package.json` (`bancada:montagem-tela`)

- [ ] **Step 1:** a bancada (mesma montagem da `bancada:tela`: carimbo do dist, servidor numa pasta de dados descartável, sessão de teste): cria um molde pela API com uma peça de nós automáticos (um retângulo arredondado de 30 × 50 cm), abre `/montagem` nele; confere:
  - a peça inteira na mesa (a caixa do canvas cabe na moldura);
  - `0` ajusta depois de um zoom; Espaço+arrasto muda o `scrollLeft/Top`;
  - arrastar um nó com o mouse (Puppeteer `mouse.down/move/up` nas coordenadas do nó) e um puxador; ler a peça gravada pela API (espera o salvamento) e conferir que nenhum nó automático tem bico;
  - `p` troca para Pique e `n` volta; Ctrl+Z e Ctrl+Y;
  - prints `montagem-antes.png`/`montagem-depois.png` na pasta temporária, com o caminho no log.
- [ ] **Step 2:** `npm run front && npm run bancada:montagem-tela` → OK.
- [ ] **Step 3:** regressão: `tipos`, `bancada:nos`, `editor`, `graduacao`, `montagem`, `moldes-pecas`, `risco-pdf`, `pdf`, `tela`, `curvas-reais`.
- [ ] **Step 4:** commit da bancada; commit do build (`dist/`, carimbo batendo).
