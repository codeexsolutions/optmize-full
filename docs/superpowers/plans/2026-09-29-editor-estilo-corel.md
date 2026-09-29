# Editor estilo Corel — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O editor de nós do Digitalizar e da Montagem passa a funcionar como a ferramenta Forma do Corel — selecionar e mover vários nós (clique, Shift, retângulo, setas), os tipos canto/suave/simétrico, puxar a curva direto, converter em linha ou em curva, pôr e apagar nós com o trecho refeito, alinhar, reduzir nós com controle e girar a peça —, com a mesma barra de botões nas duas telas.

**Architecture:** As contas são puras, em `src/motores/edicaoDeNos.js`; `src/motores/montagem.js` embrulha as que mudam quantos nós há para levar junto os piques (presos a trecho) e as regras da graduação (presas a nó). A interação — seleção, retângulo, arrastos, setas, Reduzir ao vivo — mora num gancho só, `src/telas/risco/useEditorDeNos.ts`, e a barra em `src/telas/risco/BarraDosNos.tsx`. Cada tela entrega ao gancho um adaptador (`AlvoDoEditor`) e liga os eventos do canvas.

**Tech Stack:** React 19 + TypeScript (telas), JavaScript ESM puro (motores), Node 24 + `node:assert` (bancadas; motor ESM carregado por `bancada/carregarModulo.mjs`), Puppeteer (conferência no navegador, contra o servidor de teste com a cópia do banco sem tokens).

**Spec:** `docs/superpowers/specs/2026-09-29-editor-estilo-corel-design.md`

## Global Constraints

- O mesmo editor, com o mesmo comportamento, no Digitalizar e na Montagem (spec, "O que fica igual").
- O nó ganha só o campo `simetrico?` (e só vale com `canto` falso); PDF, SVG, Encaixe e margem de costura não leem o tipo (spec §13).
- Setas: 1 mm; Shift+seta: 1 cm; no Digitalizar sem medida nenhuma, 1 e 10 células; uma sequência de setas com menos de 1 s entre elas é um passo só no Ctrl+Z (spec §2).
- Reduzir: controle de 0,2 a 3 mm, começando em 0,5; ao vivo e sempre a partir do desenho de antes (não acumula); soltar é um passo; âncoras: canto, ponta de trecho reto, nó com regra de graduação, nó fora da seleção (spec §8).
- Apagar: nunca menos de 3 nós; cada pedaço juntado é refeito numa cúbica com as tangentes das pontas (reta, se tudo era reta) (spec §6).
- Trecho reto não entorta ao ser puxado: aviso "trecho reto: converta em curva para dobrar" (spec §4).
- Converter em linha/curva e o botão +: nos trechos entre selecionados vizinhos; com um nó só, no trecho que chega nele (spec §5, §6).
- Alinhar: pela referência do último nó clicado; seleção pelo retângulo ou Ctrl+A, pela média (spec §7).
- As teclas do editor não agem com o foco num campo de texto (spec §11) nem com uma janela aberta na frente.
- Textos da tela em português do Brasil; arquivos CRLF continuam CRLF.
- Git: commit por tarefa; push só no fim, na `Guilherme` (pedido da fábrica), nunca na main.

## Review Focus

1. **Peça grande com ruído de foto no Reduzir ao vivo** (300+ nós): cada movimento do controle refaz a conta, e a tela não pode travar — pinado na Task 5 (caso 25: 400 nós em menos de 1 s; na prática, ~40 ms).
2. **Ctrl+Z com seleção, com o controle do Reduzir no meio, ou trocar de peça**: a seleção não pode apontar para nó que não existe, e o Reduzir não pode pôr o retrato de uma peça em outra — o gancho zera a seleção e a redução quando a peça muda; pinado no navegador na Task 9 (trocar de peça começa a seleção de novo).
3. **Seleção que atravessa o nó 0** (a volta fechada): sequências, converter, pôr e apagar pela volta — pinado nos casos 10, 13, 19 e 21.
4. **Teclas com uma janela aberta** (a Grade, Substituir, a pergunta do sistema) ou com o foco num campo (a medida, o ângulo): Delete e setas não podem mexer nos nós por baixo — pinado no navegador na Task 8 (Delete com a janela da Grade aberta não apaga nada).
5. **Arrasto que solta fora do canvas**: a captura do ponteiro entrega o soltar, e o próximo clique começa do zero — pinado no navegador na Task 8.

---

### Task 1: Os tipos de nó — canto, suave, simétrico — guardados pelo servidor

**Files:**
- Modify: `src/motores/edicaoDeNos.js` (cabeçalho, ajudantes, `tipoDoNo`, `clonarNos`, `moverPega`, `mudarTipoDosNos`)
- Modify: `servidor/moldes-pecas.js` (`lerNos`), `src/api/risco.ts` (`NoDoRisco`), `src/telas/risco/desenhoDeNos.ts` (tipo `No`)
- Modify: `.github/workflows/conferir.yml` (`bancada:nos` no passo "Moldes e tamanhos")
- Test: `bancada/conferir-edicao-de-nos.mjs` (caso 6 trocado, caso 9), `bancada/conferir-moldes-pecas.cjs` (caso 9)

**Interfaces:**
- Produces: `tipoDoNo(no) → "canto" | "suave" | "simetrico"`; `mudarTipoDosNos(nos, indices: number[], tipo) → nos`; `moverPega` passa a respeitar o tipo; `clonarNos` leva `simetrico`; ajudantes internos `somar`, `menos`, `vezes`, `tamanho`, `unitario` (usados pelas Tasks 2–5).

- [ ] **Step 1: Os casos que falham**

Em `bancada/conferir-edicao-de-nos.mjs`, trocar o caso 6 inteiro (de `// 6. Alça de nó de curva espelha a outra; de canto, não.` até antes de `// 7.`) por:

```js
// 6. A alça segue o tipo do nó: suave gira a outra e mantém o tamanho; simétrico espelha; canto não mexe na outra.
{
  const liso = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  assert.equal(m.tipoDoNo(liso[0]), "suave", "nó sem o campo é suave");
  const r = m.moverPega(liso, { no: 0, parte: "entrada" }, { x: -2, y: 1 });
  assert.ok(perto(r[0].saida, { x: 2 / Math.sqrt(5), y: -1 / Math.sqrt(5) }), "suave: gira e fica com o tamanho 1");
  const simetrico = [{ ...liso[0], simetrico: true }, liso[1], liso[2]];
  assert.ok(perto(m.moverPega(simetrico, { no: 0, parte: "entrada" }, { x: -2, y: 1 })[0].saida, { x: 2, y: -1 }), "simétrico: espelho");
  const canto = [{ ...liso[0], canto: true }, liso[1], liso[2]];
  assert.ok(perto(m.moverPega(canto, { no: 0, parte: "entrada" }, { x: -2, y: 1 })[0].saida, { x: 1, y: 0 }), "canto: a outra fica");
}
```

e, antes do `console.log` final:

```js
// 9. Mudar o tipo: suave alinha e mantém os tamanhos; simétrico iguala; entre reta e curva, a direção da reta; canto só marca.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: 0 }, canto: true },
    { x: 10, y: 0, entrada: { x: 8, y: 0 }, saida: { x: 10, y: 4 }, canto: true },
    { x: 10, y: 10, entrada: { x: 10, y: 7 }, saida: { x: 10, y: 10 }, canto: true, retaDepois: true },
  ];
  const s = m.mudarTipoDosNos(nos, [1], "suave")[1];
  const e = { x: s.entrada.x - 10, y: s.entrada.y };
  const d = { x: s.saida.x - 10, y: s.saida.y };
  assert.ok(Math.abs(e.x * d.y - e.y * d.x) < 1e-9 && e.x * d.x + e.y * d.y < 0, "suave: as duas na mesma reta, em lados opostos");
  assert.ok(Math.abs(Math.hypot(e.x, e.y) - 2) < 1e-9 && Math.abs(Math.hypot(d.x, d.y) - 4) < 1e-9, "suave: cada uma com o seu tamanho");
  assert.equal(m.tipoDoNo(s), "suave");
  const q = m.mudarTipoDosNos(nos, [1], "simetrico")[1];
  assert.ok(Math.abs(Math.hypot(q.entrada.x - 10, q.entrada.y) - 3) < 1e-9 && Math.abs(Math.hypot(q.saida.x - 10, q.saida.y) - 3) < 1e-9, "simétrico: as duas com a média, 3");
  assert.equal(m.tipoDoNo(q), "simetrico");
  // O nó 2 recebe curva (do 1) e sai reta (para o 0): a alça da curva vai para a direção da reta.
  const r = m.mudarTipoDosNos(nos, [2], "suave")[2];
  assert.ok(perto(r.entrada, { x: 10 + 3 / Math.SQRT2, y: 10 + 3 / Math.SQRT2 }), JSON.stringify(r.entrada));
  assert.ok(perto(r.saida, { x: 10, y: 10 }), "o lado reto fica sem alça");
  const c = m.mudarTipoDosNos(nos, [1], "canto")[1];
  assert.ok(c.canto && perto(c.entrada, nos[1].entrada) && perto(c.saida, nos[1].saida), "canto só marca");
  assert.equal("simetrico" in m.mudarTipoDosNos([q, nos[0], nos[2]], [0], "suave")[0], false, "voltar a suave tira o campo");
  assert.equal(m.clonarNos([q])[0].simetrico, true, "clonar leva o tipo");
}
```

Em `bancada/conferir-moldes-pecas.cjs`, antes do `console.log` final:

```js
// 9. O tipo simétrico do nó é guardado; nó de canto não é simétrico; nó sem o campo volta sem ele.
{
  const nos = quadrado.map((p) => no(p.x, p.y));
  nos[1] = { ...nos[1], canto: false, simetrico: true };
  nos[2] = { ...nos[2], canto: true, simetrico: true };
  const volta = pecaDoBanco({ ...arrumarPeca({ contorno: quadrado, nos }, 0), id: 1 }).nos;
  assert.equal(volta[1].simetrico, true);
  assert.equal("simetrico" in volta[2], false, "canto não é simétrico");
  assert.equal("simetrico" in volta[0], false, "sem o campo, volta sem ele");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:nos` e `npm run bancada:moldes-pecas`
Expected: FAIL — `m.tipoDoNo is not a function`; e `AssertionError` no caso 9 do servidor (`volta[1].simetrico` vem `undefined`).

- [ ] **Step 3: O motor**

Em `src/motores/edicaoDeNos.js`:

1. No cabeçalho, trocar as duas linhas que começam em ` * Um nó:` (até «é o nó que COMEÇA o trecho.») por:

```js
 * Um nó: `{ x, y, entrada, saida, canto?, retaDepois?, simetrico? }`. Quem
 * guarda se o trecho até o nó seguinte é reta é o nó que COMEÇA o trecho. O
 * tipo do nó (`tipoDoNo`) diz como as duas alças andam juntas.
```

2. Logo depois do comentário de cabeçalho (antes do comentário «Um ponto da cúbica em t»):

```js
const somar = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const menos = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const vezes = (a, k) => ({ x: a.x * k, y: a.y * k });
const tamanho = (v) => Math.hypot(v.x, v.y);
/** O vetor com tamanho 1, ou `null` se ele é zero. */
const unitario = (v) => {
  const t = tamanho(v);
  return t > 1e-9 ? { x: v.x / t, y: v.y / t } : null;
};

/** O tipo do nó, como no Corel: canto, suave ou simétrico. Nó sem o campo `simetrico` é suave. */
export function tipoDoNo(no) {
  if (no.canto) return "canto";
  return no.simetrico ? "simetrico" : "suave";
}
```

3. Trocar `clonarNos` inteira por:

```js
export function clonarNos(nos) {
  return nos.map((n) => ({
    x: n.x, y: n.y, entrada: { ...n.entrada }, saida: { ...n.saida },
    canto: n.canto, retaDepois: n.retaDepois, ...(n.simetrico ? { simetrico: true } : {}),
  }));
}
```

4. Trocar `moverPega` inteira (com o comentário) por:

```js
/**
 * Arrasta o nó ou uma alça até `alvo`.
 *
 * O nó leva as alças junto: sem isso, mover um nó deformaria as duas curvas
 * vizinhas em vez de arrastar o trecho inteiro. A alça segue o TIPO do nó, como
 * no Corel: no canto, só ela anda; no suave, a do outro lado gira para ficar na
 * mesma reta e mantém o tamanho; no simétrico, a do outro lado é o espelho. Do
 * lado que é reta não há alça: ela fica em cima do nó.
 */
export function moverPega(nos, pega, alvo) {
  const n = nos.length;
  return nos.map((no, i) => {
    if (i !== pega.no) return no;
    if (pega.parte === "no") {
      const d = { x: alvo.x - no.x, y: alvo.y - no.y };
      return { ...no, x: alvo.x, y: alvo.y, entrada: somar(no.entrada, d), saida: somar(no.saida, d) };
    }
    const outraParte = pega.parte === "entrada" ? "saida" : "entrada";
    const outroLadoReto = outraParte === "saida" ? no.retaDepois : nos[(i - 1 + n) % n].retaDepois;
    const puxada = { x: alvo.x, y: alvo.y };
    let outra = no[outraParte];
    const tipo = tipoDoNo(no);
    if (!outroLadoReto && tipo === "simetrico") {
      outra = { x: 2 * no.x - alvo.x, y: 2 * no.y - alvo.y };
    } else if (!outroLadoReto && tipo === "suave") {
      const direcao = unitario(menos(no, puxada));
      const comprimento = tamanho(menos(no[outraParte], no));
      if (direcao && comprimento > 1e-9) outra = somar(no, vezes(direcao, comprimento));
    }
    return { ...no, [pega.parte]: puxada, [outraParte]: outra };
  });
}
```

5. No fim do arquivo:

```js
/*
 * ---------------------------------------------------------------------------
 * O EDITOR ESTILO COREL — vários nós de uma vez, tipos, puxar a curva
 * ---------------------------------------------------------------------------
 *
 * Ver docs/superpowers/specs/2026-09-29-editor-estilo-corel-design.md. A
 * seleção é uma lista de índices da peça. As ações que mudam QUANTOS nós há
 * (apagar, reduzir) devolvem, além dos nós, o `mapa` (o número novo de cada nó
 * antigo, ou `null` se ele saiu) e os `trechos` que viraram outros (`velhos` →
 * `novos`, pelo nó que começa cada trecho) — é com eles que a Montagem leva
 * junto os piques e as regras da graduação.
 */

/**
 * Muda o tipo dos nós escolhidos.
 *
 * Suave: a direção comum é a média das duas (a da saída e a da entrada
 * invertida), e cada alça mantém o seu tamanho. Simétrico: a mesma direção, e
 * o tamanho vira a média dos dois. Nó entre uma reta e uma curva: a direção é
 * a da reta, e só a alça do lado curvo gira (o lado reto não tem alça). Canto
 * só marca: as alças ficam onde estão.
 */
export function mudarTipoDosNos(nos, indices, tipo) {
  const n = nos.length;
  const escolhidos = new Set(indices);
  return nos.map((no, i) => {
    if (!escolhidos.has(i)) return no;
    const { simetrico: _antes, ...semTipo } = no;
    const base = { ...semTipo, canto: tipo === "canto", ...(tipo === "simetrico" ? { simetrico: true } : {}) };
    if (tipo === "canto") return base;
    const anterior = nos[(i - 1 + n) % n];
    const seguinte = nos[(i + 1) % n];
    const retaAntes = !!anterior.retaDepois;
    const retaDepois = !!no.retaDepois;
    if (retaAntes && retaDepois) return base;
    const e = menos(no.entrada, no);
    const s = menos(no.saida, no);
    let direcao;
    if (retaAntes) direcao = unitario(menos(no, anterior));
    else if (retaDepois) direcao = unitario(menos(seguinte, no));
    else {
      const ue = unitario(e) ?? { x: 0, y: 0 };
      const us = unitario(s) ?? { x: 0, y: 0 };
      direcao = unitario({ x: us.x - ue.x, y: us.y - ue.y });
    }
    if (!direcao) return base;
    let ce = tamanho(e);
    let cs = tamanho(s);
    if (tipo === "simetrico" && !retaAntes && !retaDepois) {
      ce = (ce + cs) / 2;
      cs = ce;
    }
    return {
      ...base,
      entrada: retaAntes ? { x: no.x, y: no.y } : somar(no, vezes(direcao, -ce)),
      saida: retaDepois ? { x: no.x, y: no.y } : somar(no, vezes(direcao, cs)),
    };
  });
}
```

- [ ] **Step 4: Servidor, API e o tipo do desenho**

Em `servidor/moldes-pecas.js`, em `lerNos`, depois de `retaDepois: !!n.retaDepois,`:

```js
      // O tipo simétrico do Corel: só vale em nó que não é canto. Sem ele, o nó é suave.
      ...(n.simetrico && !n.canto ? { simetrico: true } : {}),
```

Em `src/api/risco.ts`, em `NoDoRisco`, depois de `retaDepois?: boolean;`:

```ts
  /** Nó simétrico (as duas alças do mesmo tamanho). Sem o campo, e sem `canto`, o nó é suave. */
  simetrico?: boolean;
```

Em `src/telas/risco/desenhoDeNos.ts`, o tipo `No` ganha `simetrico?: boolean`:

```ts
export type No = { x: number; y: number; entrada: Ponto; saida: Ponto; canto?: boolean; retaDepois?: boolean; simetrico?: boolean };
```

Em `.github/workflows/conferir.yml`, no passo "Moldes e tamanhos", acrescentar ` && npm run bancada:nos` no fim do `run:`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run bancada:nos && npm run bancada:moldes-pecas && npm run tipos`
Expected: tudo OK.

- [ ] **Step 6: Commit**

```bash
git add src/motores/edicaoDeNos.js servidor/moldes-pecas.js src/api/risco.ts src/telas/risco/desenhoDeNos.ts .github/workflows/conferir.yml bancada/conferir-edicao-de-nos.mjs bancada/conferir-moldes-pecas.cjs
git commit -m "Os tipos de nó do Corel: canto, suave e simétrico, e o servidor guarda o simétrico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Selecionar, mover e alinhar vários nós

**Files:**
- Modify: `src/motores/edicaoDeNos.js` (`pegaSob`, `tracoSob` e funções novas no fim)
- Test: `bancada/conferir-edicao-de-nos.mjs` (casos 10 a 16)

**Interfaces:**
- Consumes: os ajudantes da Task 1.
- Produces: `sequenciasDe(indices, n) → number[][]`; `nosNoRetangulo(nos, a, b) → number[]`; `moverNos(nos, indices, dx, dy) → nos`; `trechosDaSelecao(nos, indices) → number[]` (pelo nó que começa cada trecho); `alinharNos(nos, indices, "horizontal" | "vertical", referencia) → nos`; `pegaSob(nos, alvo, raio, comAlcas: number | Iterable<number> | null)`; `tracoSob` com `t` refinado.

- [ ] **Step 1: Os casos que falham**

Antes do `console.log` final de `bancada/conferir-edicao-de-nos.mjs`:

```js
const octogono = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * 2 * Math.PI;
  return reto(Math.round(100 * Math.cos(a)), Math.round(100 * Math.sin(a)));
});

// 10. Sequências: a que passa pelo nó 0 é UMA só.
{
  const s = m.sequenciasDe([7, 0, 1, 4], 8);
  assert.equal(s.length, 2);
  assert.ok(s.some((q) => q.join() === "7,0,1"), `sequências ${JSON.stringify(s)}`);
  assert.ok(s.some((q) => q.join() === "4"));
  assert.deepEqual(m.sequenciasDe([0, 1, 2, 3], 4), [[0, 1, 2, 3]]);
}

// 11. Mover em grupo leva nó e alças, só dos escolhidos, sem mexer na lista recebida.
{
  const r = m.moverNos(octogono, [1, 2], 5, -3);
  assert.ok(perto(r[1], { x: octogono[1].x + 5, y: octogono[1].y - 3 }));
  assert.ok(perto(r[1].saida, { x: octogono[1].saida.x + 5, y: octogono[1].saida.y - 3 }));
  assert.ok(perto(r[3], octogono[3]));
  assert.ok(perto(octogono[1], reto(71, 71)), "a lista recebida não muda");
}

// 12. O retângulo de seleção, com os cantos em qualquer ordem.
assert.deepEqual(m.nosNoRetangulo(octogono, { x: 110, y: 80 }, { x: 50, y: -10 }).sort(), [0, 1]);

// 13. Os trechos da seleção: entre selecionados vizinhos; com um nó só, o que chega nele.
assert.deepEqual(m.trechosDaSelecao(octogono, [1, 2, 3, 6]), [1, 2]);
assert.deepEqual(m.trechosDaSelecao(octogono, [7, 0]), [7], "o trecho do 7 ao 0, pela volta");
assert.deepEqual(m.trechosDaSelecao(octogono, [0]), [7], "um nó só: o trecho que chega nele");

// 14. Alinhar pela referência, com as alças junto; os de fora não mexem.
{
  const r = m.alinharNos(octogono, [1, 2, 3], "horizontal", { x: 0, y: 71 });
  assert.ok([1, 2, 3].every((i) => r[i].y === 71 && r[i].x === octogono[i].x && r[i].saida.y === 71));
  assert.equal(r[0].y, octogono[0].y);
  const v = m.alinharNos(octogono, [0, 1], "vertical", { x: 50, y: 0 });
  assert.ok(v[0].x === 50 && v[1].x === 50 && v[1].entrada.x === 50);
}

// 15. As alças que pegam são as dos selecionados, a mais perto ganha, e alça zerada não rouba o clique do nó.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } },
    { x: 10, y: 0, entrada: { x: 9, y: 0 }, saida: { x: 11, y: 0 } },
    { x: 5, y: 5, entrada: { x: 6, y: 5 }, saida: { x: 4, y: 5 } },
  ];
  assert.equal(m.pegaSob(nos, { x: 9.1, y: 0 }, 0.5, new Set([0, 1])).parte, "entrada");
  assert.equal(m.pegaSob(nos, { x: 9.1, y: 0 }, 0.5, [0]), null, "a alça do 1 não está à mostra");
  const zerada = [{ ...nos[0], entrada: { x: 0, y: 0 } }, nos[1], nos[2]];
  assert.equal(m.pegaSob(zerada, { x: 0, y: 0.05 }, 0.5, [0]).parte, "no", "alça em cima do nó não rouba o clique");
}

// 16. O t do traço sai refinado, sem o degrau de 1/16.
{
  const t = m.tracoSob(quadrado, { x: 4.3, y: 0.2 }, 0.5);
  assert.ok(Math.abs(t.t - 0.43) < 0.005, `t = ${t.t}`);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:nos`
Expected: FAIL — `m.sequenciasDe is not a function`.

- [ ] **Step 3: O motor**

Trocar `pegaSob` inteira (com o comentário) por:

```js
/**
 * O que está debaixo do ponteiro: uma alça de um nó selecionado, ou um nó.
 *
 * As alças primeiro: ficam por cima e costumam estar perto do nó. Só as dos
 * nós em `comAlcas` (um índice, uma lista ou um Set; `null` = nenhum) — são
 * as que estão desenhadas. Lado reto não tem alça para pegar, e alça zerada
 * também não: as duas estão em cima do nó, e pegá-las roubaria o clique dele.
 */
export function pegaSob(nos, alvo, raio, comAlcas) {
  const n = nos.length;
  const lista = comAlcas === null || comAlcas === undefined ? [] : typeof comAlcas === "number" ? [comAlcas] : [...comAlcas];
  let alca = null;
  let menorAlca = raio;
  for (const i of lista) {
    const no = nos[i];
    if (!no) continue;
    const anterior = nos[(i - 1 + n) % n];
    for (const parte of ["entrada", "saida"]) {
      if (parte === "saida" && no.retaDepois) continue;
      if (parte === "entrada" && anterior.retaDepois) continue;
      if (tamanho(menos(no[parte], no)) < 1e-9) continue;
      const d = Math.hypot(no[parte].x - alvo.x, no[parte].y - alvo.y);
      if (d < menorAlca) { menorAlca = d; alca = { no: i, parte, distancia: d }; }
    }
  }
  if (alca) return alca;
  let achado = null;
  let menor = raio;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(nos[i].x - alvo.x, nos[i].y - alvo.y);
    if (d < menor) { menor = d; achado = { no: i, parte: "no", distancia: d }; }
  }
  return achado;
}
```

Trocar `tracoSob` inteira (com o comentário) por:

```js
/**
 * Em que trecho o ponteiro caiu, e em que `t`: dezesseis passos por trecho, e
 * mais dezesseis em volta do melhor — puxar a curva pega o ponto em `t`, e um
 * dezesseis avos de erro já se vê.
 */
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
  if (!melhor) return null;
  const { no } = melhor;
  const de = Math.max(0, melhor.t - 1 / 16);
  const ate = Math.min(1, melhor.t + 1 / 16);
  for (let k = 0; k <= 16; k++) {
    const t = de + ((ate - de) * k) / 16;
    const q = pontoNoTrecho(nos, no, t);
    const d = Math.hypot(q.x - alvo.x, q.y - alvo.y);
    if (d < melhor.distancia) melhor = { no, t, distancia: d };
  }
  return melhor;
}
```

No fim do arquivo:

```js
/** Os nós dentro do retângulo de cantos `a` e `b` (em qualquer ordem). */
export function nosNoRetangulo(nos, a, b) {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const saida = [];
  nos.forEach((no, i) => { if (no.x >= x0 && no.x <= x1 && no.y >= y0 && no.y <= y1) saida.push(i); });
  return saida;
}

/** Move os nós escolhidos, com as alças. */
export function moverNos(nos, indices, dx, dy) {
  const escolhidos = new Set(indices);
  const d = { x: dx, y: dy };
  return nos.map((no, i) => (escolhidos.has(i)
    ? { ...no, x: no.x + dx, y: no.y + dy, entrada: somar(no.entrada, d), saida: somar(no.saida, d) }
    : no));
}

/**
 * As sequências de índices vizinhos na volta. A volta é fechada, então uma
 * sequência pode passar pelo nó 0 — por isso a contagem começa depois de um
 * nó que NÃO está na lista. Todos na lista: uma sequência só, de 0 a n−1.
 */
export function sequenciasDe(indices, n) {
  const marcado = new Uint8Array(n);
  for (const i of indices) if (i >= 0 && i < n) marcado[i] = 1;
  let total = 0;
  for (let i = 0; i < n; i++) total += marcado[i];
  if (total === 0) return [];
  if (total === n) return [Array.from({ length: n }, (_, i) => i)];
  let inicio = 0;
  while (marcado[inicio]) inicio++;
  const saida = [];
  let atual = [];
  for (let k = 1; k <= n; k++) {
    const i = (inicio + k) % n;
    if (marcado[i]) atual.push(i);
    else if (atual.length) { saida.push(atual); atual = []; }
  }
  if (atual.length) saida.push(atual);
  return saida;
}

/**
 * Os trechos em que as ações da barra agem, pelo nó que começa cada um: os que
 * têm as duas pontas selecionadas; com um nó só selecionado, o trecho que
 * CHEGA nele, como no Corel.
 */
export function trechosDaSelecao(nos, indices) {
  const n = nos.length;
  const sel = new Set(indices.filter((i) => i >= 0 && i < n));
  if (sel.size === 1) {
    const [i] = sel;
    return [(i - 1 + n) % n];
  }
  return [...sel].sort((a, b) => a - b).filter((i) => sel.has((i + 1) % n));
}

/** Alinha os escolhidos pela `referencia`: "horizontal" = a mesma altura (y); "vertical" = a mesma coluna (x). */
export function alinharNos(nos, indices, eixo, referencia) {
  const escolhidos = new Set(indices);
  return nos.map((no, i) => {
    if (!escolhidos.has(i)) return no;
    const d = eixo === "horizontal" ? { x: 0, y: referencia.y - no.y } : { x: referencia.x - no.x, y: 0 };
    return { ...no, x: no.x + d.x, y: no.y + d.y, entrada: somar(no.entrada, d), saida: somar(no.saida, d) };
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:nos && npm run bancada:montagem`
Expected: OK (a Montagem usa `pegaSob` e `tracoSob`; nada muda para ela).

- [ ] **Step 5: Commit**

```bash
git add src/motores/edicaoDeNos.js bancada/conferir-edicao-de-nos.mjs
git commit -m "Selecionar, mover e alinhar vários nós: retângulo, trechos da seleção e as alças dos selecionados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Puxar a curva, converter em linha ou curva, e pôr nó

**Files:**
- Modify: `src/motores/edicaoDeNos.js` (funções novas no fim)
- Test: `bancada/conferir-edicao-de-nos.mjs` (casos 17 a 19)

**Interfaces:**
- Consumes: `moverPega` (Task 1), `naCurva`, `inserirNoNoTraco`.
- Produces: `puxarTrecho(nos, i, t, alvo) → nos | null` (`null` num trecho reto); `converterTrechos(nos, trechos, "linha" | "curva") → nos`; `porNosNoTraco(nos, pontos: { no, t }[]) → nos`.

- [ ] **Step 1: Os casos que falham**

Antes do `console.log` final:

```js
// 17. Puxar a curva: o ponto em t vai EXATAMENTE para o ponteiro; as pontas ficam; a ponta suave continua lisa; o canto não mexe na outra alça.
{
  const nos = [
    { x: 0, y: 0, entrada: { x: -3, y: 1 }, saida: { x: 3, y: -1 } },
    { x: 10, y: 0, entrada: { x: 7, y: -1 }, saida: { x: 13, y: 1 }, canto: true },
    { x: 5, y: 8, entrada: { x: 8, y: 8 }, saida: { x: 2, y: 8 } },
  ];
  for (const t of [0.1, 0.3, 0.5, 0.8]) {
    const alvo = { x: 4, y: -5 };
    const r = m.puxarTrecho(nos, 0, t, alvo);
    assert.ok(perto(m.pontoNoTrecho(r, 0, t), alvo, 1e-9), `t=${t}: o ponto pego foi para ${JSON.stringify(m.pontoNoTrecho(r, 0, t))}`);
    assert.ok(perto(r[0], nos[0]) && perto(r[1], nos[1]), "as pontas ficam");
    const e = r[0].entrada;
    const s = r[0].saida;
    assert.ok(Math.abs(e.x * s.y - e.y * s.x) < 1e-9 && e.x * s.x + e.y * s.y < 0, "a ponta suave continua lisa");
    assert.ok(Math.abs(Math.hypot(e.x, e.y) - Math.hypot(3, 1)) < 1e-9, "a alça do outro lado mantém o tamanho");
    assert.ok(perto(r[1].saida, nos[1].saida), "o canto não mexe na outra alça");
  }
  assert.equal(m.puxarTrecho(quadrado, 0, 0.5, { x: 5, y: 3 }), null, "trecho reto não entorta");
}

// 18. Converter: em linha endireita e as alças desabam, com os nós no lugar; em curva, alças a um terço — o desenho não muda.
{
  const curvo = [
    { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: 4 }, canto: true },
    { x: 10, y: 0, entrada: { x: 7, y: 4 }, saida: { x: 10, y: 0 }, canto: true, retaDepois: true },
    reto(5, -8),
  ];
  const linha = m.converterTrechos(curvo, [0], "linha");
  assert.equal(linha[0].retaDepois, true);
  assert.ok(perto(linha[0].saida, { x: 0, y: 0 }) && perto(linha[1].entrada, { x: 10, y: 0 }));
  assert.ok(perto(linha[0], curvo[0]) && perto(linha[1], curvo[1]), "os nós ficam");
  const volta = m.converterTrechos(linha, [0], "curva");
  assert.equal(volta[0].retaDepois, false);
  assert.ok(perto(m.pontoNoTrecho(volta, 0, 0.37), { x: 3.7, y: 0 }, 1e-9), "a curva nasce igual à reta");
  assert.deepEqual(m.converterTrechos(curvo, [1], "linha"), curvo, "trecho já reto: nada muda");
}

// 19. Um nó no meio de cada trecho escolhido, sem mudar o desenho; o do trecho que fecha a volta vai para o fim.
{
  const r = m.porNosNoTraco(octogono, [{ no: 0, t: 0.5 }, { no: 7, t: 0.5 }]);
  assert.equal(r.length, 10);
  assert.ok(perto(r[1], { x: (octogono[0].x + octogono[1].x) / 2, y: (octogono[0].y + octogono[1].y) / 2 }));
  assert.ok(perto(r[9], { x: (octogono[7].x + octogono[0].x) / 2, y: (octogono[7].y + octogono[0].y) / 2 }));
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:nos`
Expected: FAIL — `m.puxarTrecho is not a function`.

- [ ] **Step 3: O motor**

No fim de `src/motores/edicaoDeNos.js`:

```js
/**
 * Puxa o trecho que começa no nó `i` pelo ponto em `t`, até `alvo`.
 *
 * O ponto pego acompanha o ponteiro EXATAMENTE, e as pontas ficam paradas: só
 * as duas alças do trecho mudam. O deslocamento se divide entre elas pelo peso
 * de `t` (o do Inkscape) — perto de uma ponta, anda mais a alça daquela ponta.
 * As pontas respeitam o tipo (via `moverPega`): na suave e na simétrica, a
 * alça do outro lado gira junto, e a curva continua lisa no nó. Trecho reto não
 * entorta: `null`.
 */
export function puxarTrecho(nos, i, t, alvo) {
  const n = nos.length;
  const a = nos[i];
  const j = (i + 1) % n;
  const b = nos[j];
  if (!a || !b || a.retaDepois) return null;
  const tt = Math.min(0.98, Math.max(0.02, t));
  const u = 1 - tt;
  const agora = naCurva(a, a.saida, b.entrada, b, tt);
  const delta = menos(alvo, agora);
  let peso;
  if (tt <= 1 / 6) peso = 0;
  else if (tt <= 0.5) peso = Math.pow((6 * tt - 1) / 2, 3) / 2;
  else if (tt <= 5 / 6) peso = (1 - Math.pow((6 * u - 1) / 2, 3)) / 2 + 0.5;
  else peso = 1;
  const saida = somar(a.saida, vezes(delta, (1 - peso) / (3 * tt * u * u)));
  const entrada = somar(b.entrada, vezes(delta, peso / (3 * tt * tt * u)));
  return moverPega(moverPega(nos, { no: i, parte: "saida" }, saida), { no: j, parte: "entrada" }, entrada);
}

/**
 * Converte os `trechos` (pelo nó que começa cada um) em linha ou em curva, com
 * os nós no lugar. Em linha, as alças daquele trecho desabam em cima dos nós.
 * Em curva, o trecho reto ganha alças a um terço e a dois terços do caminho: a
 * curva nasce igual à reta, e só muda quando alguém puxa.
 */
export function converterTrechos(nos, trechos, jeito) {
  const n = nos.length;
  const copia = nos.slice();
  for (const i of trechos) {
    const j = (i + 1) % n;
    const a = copia[i];
    const b = copia[j];
    if (jeito === "linha") {
      if (a.retaDepois) continue;
      copia[i] = { ...a, retaDepois: true, saida: { x: a.x, y: a.y } };
      copia[j] = { ...copia[j], entrada: { x: b.x, y: b.y } };
    } else {
      if (!a.retaDepois) continue;
      const terco = (de, para) => ({ x: de.x + (para.x - de.x) / 3, y: de.y + (para.y - de.y) / 3 });
      copia[i] = { ...a, retaDepois: false, saida: terco(a, b) };
      copia[j] = { ...copia[j], entrada: terco(b, a) };
    }
  }
  return copia;
}

/**
 * Um nó em cada ponto `{ no, t }` — no máximo um por trecho —, sem mudar o
 * desenho. Do trecho de número maior para o menor: assim os de antes não
 * mudam de número.
 */
export function porNosNoTraco(nos, pontos) {
  const porTrecho = new Map();
  for (const p of pontos) if (p.no >= 0 && p.no < nos.length && !porTrecho.has(p.no)) porTrecho.set(p.no, p.t);
  let r = nos;
  for (const [no, t] of [...porTrecho].sort((x, y) => y[0] - x[0])) r = inserirNoNoTraco(r, no, t);
  return r;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:nos`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/motores/edicaoDeNos.js bancada/conferir-edicao-de-nos.mjs
git commit -m "Puxar a curva pelo traço, converter em linha ou curva, e pôr nó em vários trechos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Apagar refazendo o pedaço

**Files:**
- Modify: `src/motores/ajusteDeCurvas.js` (exporta `curvasDoTrecho`, antes do comentário "Os trechos que são reta.")
- Modify: `src/motores/edicaoDeNos.js` (`import` e funções novas no fim)
- Test: `bancada/conferir-edicao-de-nos.mjs` (casos 20 e 21)

**Interfaces:**
- Consumes: `sequenciasDe` (Task 2), `pontoNoTrecho`.
- Produces: `curvasDoTrecho(pontos, tangenteInicial, tangenteFinal, erroMaximo) → [p0, p1, p2, p3][]`; `apagarNos(nos, indices) → { nos, mapa, trechos } | { erro }` — `mapa[i]` é o número novo do nó `i` (ou `null`), `trechos` é `{ velhos: number[], novos: number[] }[]`; internos `amostrasDoTrecho`, `saidaDoTrecho`, `chegadaDoTrecho`, `pontosDoPedaco(nos, velhos, passos)` (a Task 5 usa).

- [ ] **Step 1: Os casos que falham**

Antes do `console.log` final:

```js
// Um arco de 5 nós (4 trechos de 45°, raio 100) por cima, fechado por duas retas.
const arco = (() => {
  const h = (4 / 3) * Math.tan(Math.PI / 16) * 100;
  const nos = Array.from({ length: 5 }, (_, k) => {
    const a = Math.PI - (k / 4) * Math.PI;
    const p = { x: 100 * Math.cos(a), y: -100 * Math.sin(a) };
    const tg = { x: Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  nos[4] = { ...nos[4], retaDepois: true, saida: { x: nos[4].x, y: nos[4].y } };
  return [...nos, reto(0, 60)];
})();

// 20. Apagar os três do meio do arco: sobra UMA cúbica que segue o arco, com a tangente de antes nas pontas.
{
  const r = m.apagarNos(arco, [1, 2, 3]);
  assert.ok(!r.erro, r.erro);
  assert.equal(r.nos.length, 3);
  assert.deepEqual(r.mapa, [0, null, null, null, 1, 2]);
  assert.deepEqual(r.trechos, [{ velhos: [0, 1, 2, 3], novos: [0] }]);
  assert.equal(r.nos[0].retaDepois, false);
  assert.ok(perto(r.nos[0], arco[0]) && perto(r.nos[1], arco[4]), "os nós que ficam não andam");
  let maior = 0;
  for (let k = 0; k <= 50; k++) {
    const q = m.pontoNoTrecho(r.nos, 0, k / 50);
    maior = Math.max(maior, Math.abs(Math.hypot(q.x, q.y) - 100));
  }
  // Uma cúbica só não é um meio círculo: com as tangentes presas nas pontas, fica a uns 3% do raio.
  assert.ok(maior < 4, `a cúbica se afastou ${maior.toFixed(2)} do arco`);
  const meio = m.pontoNoTrecho(r.nos, 0, 0.5);
  assert.ok(Math.abs(meio.x) < 1e-6 && meio.y < -95, `o meio foi para ${JSON.stringify(meio)}`);
  const s = r.nos[0].saida;
  assert.ok(Math.abs(s.x - arco[0].x) < 1e-9 && s.y < arco[0].y, "sai do nó 0 para cima, como antes");
}

// 21. Apagar entre retas deixa reta; pela volta do 0; nunca menos de três nós.
{
  const r = m.apagarNos(octogono, [7, 0]);
  assert.equal(r.nos.length, 6);
  assert.deepEqual(r.trechos, [{ velhos: [6, 7, 0], novos: [5] }]);
  assert.equal(r.nos[5].retaDepois, true, "reta com reta continua reta");
  assert.ok(m.apagarNos(octogono, [0, 1, 2, 3, 4, 5]).erro);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:nos`
Expected: FAIL — `m.apagarNos is not a function`.

- [ ] **Step 3: O ajuste de trecho aberto**

Em `src/motores/ajusteDeCurvas.js`, antes do comentário `/**\n * Os trechos que são reta.`:

```js
/**
 * O ajuste de um trecho ABERTO, que o editor de nós usa para refazer um pedaço
 * do risco: apagar nós (uma cúbica só) e reduzir nós (o mínimo de cúbicas
 * dentro da folga).
 *
 * `tangenteInicial` sai do primeiro ponto para dentro do trecho, e
 * `tangenteFinal` sai do último ponto de volta para dentro — as direções das
 * duas alças das pontas. Devolve as cúbicas `[p0, p1, p2, p3]` em ordem; com
 * `erroMaximo = Infinity`, uma só.
 */
export function curvasDoTrecho(pontos, tangenteInicial, tangenteFinal, erroMaximo) {
  const saida = [];
  ajustarTrecho(pontos, tangenteInicial, tangenteFinal, erroMaximo, 0, saida);
  return saida;
}
```

- [ ] **Step 4: O motor**

Em `src/motores/edicaoDeNos.js`, logo antes de `const somar =`:

```js
import { curvasDoTrecho } from "./ajusteDeCurvas";

```

No fim do arquivo:

```js
/** Os pontos do trecho `i` em `passos` pedaços, sem o último (que é o nó seguinte). */
function amostrasDoTrecho(nos, i, passos) {
  const saida = [];
  for (let k = 0; k < passos; k++) saida.push(pontoNoTrecho(nos, i, k / passos));
  return saida;
}

/** A direção com que o trecho `i` sai do nó que o começa (a alça; na reta, ou com a alça zerada, a corda). */
function saidaDoTrecho(nos, i) {
  const a = nos[i];
  const b = nos[(i + 1) % nos.length];
  return (a.retaDepois ? null : unitario(menos(a.saida, a))) ?? unitario(menos(b, a));
}

/** A direção, a partir do nó seguinte, de volta para dentro do trecho `i`. */
function chegadaDoTrecho(nos, i) {
  const a = nos[i];
  const b = nos[(i + 1) % nos.length];
  return (a.retaDepois ? null : unitario(menos(b.entrada, b))) ?? unitario(menos(a, b));
}

/** Os pontos do pedaço feito dos trechos `velhos` (`passos` por trecho), mais o nó em que ele termina. */
function pontosDoPedaco(nos, velhos, passos) {
  const pontos = [];
  for (const s of velhos) pontos.push(...amostrasDoTrecho(nos, s, passos));
  const fim = nos[(velhos[velhos.length - 1] + 1) % nos.length];
  pontos.push({ x: fim.x, y: fim.y });
  return pontos;
}

/**
 * Apaga os nós, refazendo cada pedaço juntado para ficar o mais perto possível
 * do desenho de antes, como o Corel: o traço antigo do pedaço é achatado e
 * ajustado por UMA cúbica com as tangentes das duas pontas (`curvasDoTrecho`).
 * Se todos os trechos juntados eram retos, o pedaço novo é reto. A peça nunca
 * fica com menos de três nós: `{ erro }`, e nada é apagado.
 */
export function apagarNos(nos, indices) {
  const n = nos.length;
  const fora = new Set(indices.filter((i) => i >= 0 && i < n));
  if (n - fora.size < 3) return { erro: "A peça ficaria com menos de três nós." };
  const copia = nos.slice();
  const pedacos = sequenciasDe([...fora], n).map((seq) => {
    const a = (seq[0] - 1 + n) % n;
    const b = (seq[seq.length - 1] + 1) % n;
    const velhos = [a, ...seq];
    if (velhos.every((s) => nos[s].retaDepois)) {
      copia[a] = { ...copia[a], retaDepois: true, saida: { x: nos[a].x, y: nos[a].y } };
      copia[b] = { ...copia[b], entrada: { x: nos[b].x, y: nos[b].y } };
    } else {
      const inicial = saidaDoTrecho(nos, a) ?? { x: 1, y: 0 };
      const final = chegadaDoTrecho(nos, velhos[velhos.length - 1]) ?? { x: -1, y: 0 };
      const [curva] = curvasDoTrecho(pontosDoPedaco(nos, velhos, 24), inicial, final, Infinity);
      copia[a] = { ...copia[a], retaDepois: false, saida: { ...curva[1] } };
      copia[b] = { ...copia[b], entrada: { ...curva[2] } };
    }
    return { a, velhos };
  });
  const mapa = [];
  let k = 0;
  for (let i = 0; i < n; i++) mapa.push(fora.has(i) ? null : k++);
  return {
    nos: copia.filter((_, i) => !fora.has(i)),
    mapa,
    trechos: pedacos.map((p) => ({ velhos: p.velhos, novos: [mapa[p.a]] })),
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run bancada:nos`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add src/motores/ajusteDeCurvas.js src/motores/edicaoDeNos.js bancada/conferir-edicao-de-nos.mjs
git commit -m "Apagar vários nós refazendo o pedaço perto do desenho de antes, como o Corel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reduzir nós e girar

**Files:**
- Modify: `src/motores/edicaoDeNos.js` (funções novas no fim)
- Test: `bancada/conferir-edicao-de-nos.mjs` (casos 22 a 25)

**Interfaces:**
- Consumes: `curvasDoTrecho`, `pontosDoPedaco`, `saidaDoTrecho`, `chegadaDoTrecho` (Task 4).
- Produces: `reduzirNos(nos, indices: number[] | null, folga, ancorasExtras = []) → { nos, mapa, trechos, antes, depois } | { erro }`; `girarNos(nos, graus, centro) → nos` (positivo = sentido do relógio na tela; múltiplos de 90° exatos).

- [ ] **Step 1: Os casos que falham**

Antes do `console.log` final:

```js
// Um círculo de raio 100 em 40 nós suaves (cada trecho, um arco de 9°), com um canto no nó 10.
const circulo = (() => {
  const N = 40;
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * 100;
  const nos = Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const p = { x: 100 * Math.cos(a), y: 100 * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  nos[10] = { ...nos[10], canto: true };
  return nos;
})();

// 22. Reduzir a peça inteira: bem menos nós, o traço dentro da folga, o canto fica, e a mesma folga dá o mesmo resultado.
{
  const r = m.reduzirNos(circulo, null, 0.5);
  assert.ok(!r.erro, r.erro);
  assert.equal(r.antes, 40);
  assert.ok(r.depois <= 8, `sobraram ${r.depois} nós`);
  assert.ok(r.nos.some((n) => perto(n, circulo[10]) && n.canto), "o canto ficou");
  let maior = 0;
  for (let i = 0; i < r.nos.length; i++) {
    for (let k = 0; k <= 32; k++) {
      const q = m.pontoNoTrecho(r.nos, i, k / 32);
      maior = Math.max(maior, Math.abs(Math.hypot(q.x, q.y) - 100));
    }
  }
  assert.ok(maior <= 0.52, `o traço se afastou ${maior.toFixed(3)} (a folga é 0,5)`);
  assert.deepEqual(m.reduzirNos(circulo, null, 0.5), r, "não acumula: o mesmo desenho e a mesma folga dão o mesmo");
  assert.ok(m.reduzirNos(circulo, null, 1e-6).erro, "folga pequena demais: nada a tirar");
}

// 23. Reduzir só a seleção: os de fora ficam, e a âncora extra (a regra da graduação) também.
{
  const r = m.reduzirNos(circulo, [20, 21, 22, 23, 24, 25, 26], 0.5, [23]);
  assert.ok(!r.erro, r.erro);
  for (let i = 0; i < 40; i++) if (i < 20 || i > 26) assert.notEqual(r.mapa[i], null, `o nó ${i} estava fora da seleção`);
  assert.notEqual(r.mapa[23], null, "a âncora extra fica");
  assert.ok(r.depois < 40);
}

// 24. Girar 4× 90° volta ao começo; 90° gira no sentido do relógio da tela (y para baixo).
{
  const centro = { x: 10, y: 20 };
  let r = octogono;
  for (let k = 0; k < 4; k++) r = m.girarNos(r, 90, centro);
  r.forEach((n, i) => assert.ok(perto(n, octogono[i], 1e-9)));
  assert.ok(perto(m.girarNos([reto(20, 20)], 90, centro)[0], { x: 10, y: 30 }, 1e-9));
}

// 25. Peça grande com ruído de foto (±0,3 em 400 nós): o controle refaz a conta a cada movimento, então
//     ela tem de ser rápida; e a curva nova passa pelo meio do ruído, sem passar da folga.
{
  const N = 400;
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * 100;
  const ruido = Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const r = 100 + (k % 2 ? 0.3 : -0.3);
    const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  const t0 = performance.now();
  const r = m.reduzirNos(ruido, null, 1);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `levou ${ms.toFixed(0)} ms`);
  assert.ok(!r.erro && r.depois <= 12, `sobraram ${r.depois}`);
  let maior = 0;
  for (let i = 0; i < r.nos.length; i++) {
    for (let k = 0; k <= 16; k++) {
      const q = m.pontoNoTrecho(r.nos, i, k / 16);
      maior = Math.max(maior, Math.abs(Math.hypot(q.x, q.y) - 100));
    }
  }
  assert.ok(maior <= 1.3, `afastou ${maior.toFixed(2)} do círculo (ruído 0,3 + folga 1)`);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:nos`
Expected: FAIL — `m.reduzirNos is not a function`.

- [ ] **Step 3: O motor**

No fim de `src/motores/edicaoDeNos.js`:

```js
/** Distância de `p` ao segmento `u`–`v`. */
function aoSegmento(p, u, v) {
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const t2 = dx * dx + dy * dy;
  const t = t2 > 0 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / t2)) : 0;
  return Math.hypot(u.x + t * dx - p.x, u.y + t * dy - p.y);
}

/** O quanto as cúbicas se afastam da poligonal `pontos`, nos dois sentidos. */
function afastamento(curvas, pontos) {
  const naLinha = [];
  for (const c of curvas) for (let k = 0; k <= 24; k++) naLinha.push(naCurva(c[0], c[1], c[2], c[3], k / 24));
  const aoPoligono = (p, linha) => {
    let menor = Infinity;
    for (let i = 0; i + 1 < linha.length; i++) menor = Math.min(menor, aoSegmento(p, linha[i], linha[i + 1]));
    return menor;
  };
  let maior = 0;
  for (const q of naLinha) maior = Math.max(maior, aoPoligono(q, pontos));
  for (const p of pontos) maior = Math.max(maior, aoPoligono(p, naLinha));
  return maior;
}

/**
 * Tira os nós que sobram, sem o traço se afastar mais que `folga` do de antes.
 *
 * Âncoras nunca saem: nó de canto, nó na ponta de um trecho reto, os de
 * `ancorasExtras` (os que têm regra de graduação, na Montagem) e, com
 * `indices`, os que não estão na seleção (`indices = null`: a peça inteira).
 * Uma volta toda lisa ganha três âncoras espalhadas: o risco nunca fica com
 * menos de três nós.
 *
 * Entre duas âncoras vizinhas, tenta UMA cúbica no lugar do pedaço todo, com
 * as tangentes das pontas (`curvasDoTrecho`). Se ela se afasta mais que a
 * folga, o nó do meio do pedaço fica — com as tangentes dele — e cada metade
 * tenta de novo; um trecho só que não cabe fica como estava. Os nós que ficam
 * são sempre nós que já estavam lá: o resultado nunca tem mais nós que antes,
 * nunca se afasta mais que a folga, e a conta é rápida o bastante para o
 * controle refazê-la a cada movimento.
 *
 * Devolve `{ nos, mapa, trechos, antes, depois }`, ou `{ erro }` quando não há
 * nada a tirar dentro da folga.
 */
export function reduzirNos(nos, indices, folga, ancorasExtras = []) {
  const n = nos.length;
  const alvo = indices === null ? null : new Set(indices);
  const extra = new Set(ancorasExtras);
  const fica = nos.map((no, i) => (alvo !== null && !alvo.has(i)) || !!no.canto || extra.has(i)
    || !!no.retaDepois || !!nos[(i - 1 + n) % n].retaDepois);
  if (fica.filter(Boolean).length < 3) for (const i of [0, Math.floor(n / 3), Math.floor((2 * n) / 3)]) fica[i] = true;
  const ancoras = [];
  for (let i = 0; i < n; i++) if (fica[i]) ancoras.push(i);

  const saidaNova = new Map();
  const entradaNova = new Map();
  const trocados = [];
  const resolver = (a, b) => {
    const velhos = [];
    for (let s = a; s !== b; s = (s + 1) % n) velhos.push(s);
    if (velhos.length < 2) return;
    const pontos = pontosDoPedaco(nos, velhos, 12);
    const inicial = saidaDoTrecho(nos, a) ?? { x: 1, y: 0 };
    const final = chegadaDoTrecho(nos, velhos[velhos.length - 1]) ?? { x: -1, y: 0 };
    const [curva] = curvasDoTrecho(pontos, inicial, final, Infinity);
    if (afastamento([curva], pontos) <= folga) {
      saidaNova.set(a, curva[1]);
      entradaNova.set(b, curva[2]);
      trocados.push({ a, velhos });
      return;
    }
    const meio = velhos[Math.floor(velhos.length / 2)];
    fica[meio] = true;
    resolver(a, meio);
    resolver(meio, b);
  };
  for (let k = 0; k < ancoras.length; k++) resolver(ancoras[k], ancoras[(k + 1) % ancoras.length]);
  if (trocados.length === 0) return { erro: "Nada a reduzir com essa folga — aumente o controle." };

  const novos = [];
  const mapa = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (!fica[i]) continue;
    let no = nos[i];
    if (saidaNova.has(i)) no = { ...no, retaDepois: false, saida: { ...saidaNova.get(i) } };
    if (entradaNova.has(i)) no = { ...no, entrada: { ...entradaNova.get(i) } };
    mapa[i] = novos.length;
    novos.push(no);
  }
  return {
    nos: novos,
    mapa,
    trechos: trocados.map((t) => ({ velhos: t.velhos, novos: [mapa[t.a]] })),
    antes: n,
    depois: novos.length,
  };
}

/** Cosseno e seno de múltiplos de 90° saem exatos: girar 4× 90° devolve a peça sem sobra de conta. */
const exato = (v) => (Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v);

/** Gira os nós `graus` em volta de `centro`. Com y para baixo (a tela), positivo gira no sentido do relógio. */
export function girarNos(nos, graus, centro) {
  const rad = (graus * Math.PI) / 180;
  const c = exato(Math.cos(rad));
  const s = exato(Math.sin(rad));
  const gira = (p) => ({
    x: centro.x + (p.x - centro.x) * c - (p.y - centro.y) * s,
    y: centro.y + (p.x - centro.x) * s + (p.y - centro.y) * c,
  });
  return nos.map((n) => ({ ...n, ...gira(n), entrada: gira(n.entrada), saida: gira(n.saida) }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:nos`
Expected: OK (o caso 25 leva poucas dezenas de milissegundos).

- [ ] **Step 5: Commit**

```bash
git add src/motores/edicaoDeNos.js bancada/conferir-edicao-de-nos.mjs
git commit -m "Reduzir nós dentro da folga, partindo no nó do meio, e girar os nós

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Na peça da Montagem — piques e regras da graduação vão junto, e girar

**Files:**
- Modify: `src/motores/graduacao.js` (`graduacaoPorMapa`, `graduacaoGirada`, antes de `const renomearChaves`)
- Modify: `src/motores/montagem.js` (import e funções novas antes de `pecaParaGravar`)
- Test: `bancada/conferir-montagem.mjs`, `bancada/conferir-graduacao.mjs` (caso 20)

**Interfaces:**
- Consumes: `apagarNos`, `reduzirNos`, `girarNos`, `moverNos` (Tasks 2–5); `inserirNoNaPeca`.
- Produces: `graduacaoPorMapa(graduacao, mapa)`, `graduacaoGirada(graduacao, graus)`; `apagarNosDaPeca(peca, indices) → { peca } | { erro }`; `reduzirNosDaPeca(peca, indices, folga) → { peca, antes, depois } | { erro }`; `porNosDaPeca(peca, pontos) → peca`; `girarPeca(peca, graus) → peca`.

- [ ] **Step 1: Os casos que falham**

Antes do `console.log` final de `bancada/conferir-montagem.mjs`:

```js
// --- Vários nós na peça (o editor estilo Corel) ---
{
  const retoC = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });
  const base = {
    nos: [retoC(0, 0), retoC(10, 0), retoC(20, 0), retoC(20, 10), retoC(0, 10)],
    papel: "frente", tamanho: "M", quantidade: 1, nome: "",
    marcacoes: {
      margem: 0, espelhar: false, fio: { x: 10, y: 5, angulo: 0, comprimento: 6 },
      piques: [{ no: 1, t: 0.5, profundidade: 0.5 }, { no: 3, t: 0.5, profundidade: 0.5 }], pontos: [{ x: 5, y: 5 }],
    },
    graduacao: { jeito: "pontos", porcentagem: 0, regras: [
      { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } }, { no: 3, modo: "igual", passo: { dx: 0, dy: 1 } }] },
  };
  const perto = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

  // Apagar: o trecho 0 (de 0 a 10) e o 1 (de 10 a 20) viram o trecho 0 (de 0 a 20) — o pique do meio do 1 fica a 3/4.
  const r = m.apagarNosDaPeca(base, [1]);
  assert.ok(!r.erro, r.erro);
  assert.equal(r.peca.nos.length, 4);
  assert.equal(r.peca.marcacoes.piques[0].no, 0);
  assert.ok(perto(r.peca.marcacoes.piques[0].t, 0.75, 1e-6), `t = ${r.peca.marcacoes.piques[0].t}`);
  assert.deepEqual(r.peca.marcacoes.piques[1], { no: 2, t: 0.5, profundidade: 0.5 }, "trecho que não mudou: o mesmo t, no número novo");
  assert.deepEqual(r.peca.graduacao.regras, [{ no: 2, modo: "igual", passo: { dx: 0, dy: 1 } }]);
  assert.equal(r.peca.graduacao.perdidos, 1, "a regra do nó apagado conta em perdidos");
  assert.ok(m.apagarNosDaPeca(base, [0, 1, 2]).erro, "nunca menos de três nós");

  // Pôr nó no meio dos trechos 0 e 3: piques e regras andam junto.
  const p = m.porNosDaPeca(base, [{ no: 0, t: 0.5 }, { no: 3, t: 0.5 }]);
  assert.equal(p.nos.length, 7);
  assert.deepEqual(p.marcacoes.piques.map((q) => q.no), [2, 5], "os piques dos trechos 1 e 3 andaram");
  assert.deepEqual(p.graduacao.regras.map((q) => q.no), [2, 4]);

  // Girar 4× 90° devolve a peça: nós, pontos, fio e regras; 90° troca largura e altura, sem a peça sair do lugar.
  let g = base;
  for (let k = 0; k < 4; k++) g = m.girarPeca(g, 90);
  g.nos.forEach((n, i) => assert.ok(perto(n.x, base.nos[i].x) && perto(n.y, base.nos[i].y), `nó ${i} não voltou`));
  assert.ok(perto(g.marcacoes.pontos[0].x, 5) && perto(g.marcacoes.pontos[0].y, 5));
  assert.ok(perto(g.marcacoes.fio.x, 10) && perto(g.marcacoes.fio.y, 5) && perto(g.marcacoes.fio.angulo, 0));
  assert.deepEqual(g.graduacao.regras, base.graduacao.regras);
  const noventa = m.girarPeca(base, 90);
  const cx = m.caixaDe(noventa.nos);
  assert.ok(perto(cx.largura, 10) && perto(cx.altura, 20), `caixa ${JSON.stringify(cx)}`);
  assert.ok(perto(cx.minX, 0) && perto(cx.minY, 0), "o canto de cima à esquerda fica onde estava");
  assert.ok(perto(Math.abs(noventa.marcacoes.fio.angulo), 90), "o fio girou junto");
  assert.deepEqual(noventa.graduacao.regras[0].passo, { dx: 0, dy: 1 }, "o salto (1, 0) gira para (0, 1): 90° no sentido do relógio da tela");
}

// Reduzir na peça: o nó com regra é âncora, a regra vai para o número novo, e o pique fica no mesmo lugar da costura.
{
  const N = 40;
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * 100;
  const nos = Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const p = { x: 100 * Math.cos(a), y: 100 * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
  const peca = {
    nos, papel: "frente", tamanho: "M", quantidade: 1, nome: "",
    marcacoes: { margem: 0, espelhar: false, fio: { x: 0, y: 0, angulo: 0, comprimento: 6 }, piques: [{ no: 5, t: 0.5, profundidade: 0.5 }], pontos: [] },
    graduacao: { jeito: "pontos", porcentagem: 0, regras: [{ no: 15, modo: "igual", passo: { dx: 1, dy: 0 } }] },
  };
  const antesDoPique = m.posicaoDoPique(peca.nos, peca.marcacoes.piques[0]).ponto;
  const r = m.reduzirNosDaPeca(peca, null, 0.5);
  assert.ok(!r.erro, r.erro);
  assert.ok(r.depois < r.antes);
  const regra = r.peca.graduacao.regras[0];
  assert.ok(Math.abs(r.peca.nos[regra.no].x - nos[15].x) < 1e-9 && Math.abs(r.peca.nos[regra.no].y - nos[15].y) < 1e-9, "a regra seguiu o seu nó");
  assert.equal(r.peca.graduacao.perdidos ?? 0, 0, "nenhuma regra perdida");
  const depoisDoPique = m.posicaoDoPique(r.peca.nos, r.peca.marcacoes.piques[0]).ponto;
  assert.ok(Math.hypot(depoisDoPique.x - antesDoPique.x, depoisDoPique.y - antesDoPique.y) < 1, "o pique ficou no mesmo lugar da costura");
}
```

Antes do `console.log` final de `bancada/conferir-graduacao.mjs`:

```js
// 20. Vários nós de uma vez: as regras seguem o mapa (a do nó que saiu conta em perdidos), e giram com a peça.
{
  const g0 = { jeito: "pontos", porcentagem: 0, regras: [
    { no: 1, modo: "igual", passo: { dx: 1, dy: 0 } },
    { no: 3, modo: "porTamanho", deslocamentos: { G: { dx: 0, dy: 2 } } },
  ] };
  const r = g.graduacaoPorMapa(g0, [0, null, 1, 2]);
  assert.deepEqual(r.regras, [{ no: 2, modo: "porTamanho", deslocamentos: { G: { dx: 0, dy: 2 } } }]);
  assert.equal(r.perdidos, 1);
  const girada = g.graduacaoGirada(g0, 90);
  assert.deepEqual(girada.regras[0].passo, { dx: 0, dy: 1 });
  assert.deepEqual(girada.regras[1].deslocamentos.G, { dx: -2, dy: 0 });
  let volta = g0;
  for (let k = 0; k < 4; k++) volta = g.graduacaoGirada(volta, 90);
  assert.deepEqual(volta.regras, g0.regras, "4× 90° devolve as regras exatas");
  assert.equal(g.graduacaoPorMapa(null, [0]), null);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:montagem` e `npm run bancada:graduacao`
Expected: FAIL — `m.apagarNosDaPeca is not a function` e `g.graduacaoPorMapa is not a function`.

- [ ] **Step 3: A graduação**

Em `src/motores/graduacao.js`, antes de `const renomearChaves`:

```js
/**
 * Vários nós mudaram de número de uma vez (apagar, reduzir): `mapa[i]` é o
 * número novo do nó `i`, ou `null` se ele saiu. A regra de nó que saiu sai
 * e conta em `perdidos`.
 */
export function graduacaoPorMapa(graduacao, mapa) {
  if (!graduacao) return graduacao;
  const regras = graduacao.regras || [];
  const ficam = regras.filter((r) => mapa[r.no] !== null && mapa[r.no] !== undefined);
  return {
    ...graduacao,
    perdidos: (graduacao.perdidos || 0) + (regras.length - ficam.length),
    regras: ficam.map((r) => ({ ...r, no: mapa[r.no] })),
  };
}

/**
 * A peça girou `graus`: os saltos giram junto — o `passo` do salto igual e
 * cada deslocamento do por tamanho. A mesma conta de `girarNos`, com os
 * múltiplos de 90° exatos.
 */
export function graduacaoGirada(graduacao, graus) {
  if (!graduacao) return graduacao;
  const exato = (v) => (Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v);
  const rad = (graus * Math.PI) / 180;
  const c = exato(Math.cos(rad));
  const s = exato(Math.sin(rad));
  const gira = (d) => ({ dx: d.dx * c - d.dy * s + 0, dy: d.dx * s + d.dy * c + 0 });
  return {
    ...graduacao,
    regras: (graduacao.regras || []).map((r) => (r.modo === "igual"
      ? { ...r, passo: gira(r.passo) }
      : { ...r, deslocamentos: Object.fromEntries(Object.entries(r.deslocamentos || {}).map(([k, d]) => [k, gira(d)])) })),
  };
}
```

- [ ] **Step 4: A peça**

Em `src/motores/montagem.js`, trocar os dois imports de `./edicaoDeNos` e `./graduacao` por:

```js
import {
  apagarNo, apagarNos, girarNos, inserirNoNoTraco, moverNos, pontoNoTrecho, reduzirNos,
} from "./edicaoDeNos";
import { graduacaoAoApagarNo, graduacaoAoInserirNo, graduacaoGirada, graduacaoPorMapa } from "./graduacao";
```

e, antes do comentário de `pecaParaGravar` (`/**\n * A peça como vai para o banco`):

```js
/*
 * ---------------------------------------------------------------------------
 * VÁRIOS NÓS DE UMA VEZ (o editor estilo Corel)
 * ---------------------------------------------------------------------------
 *
 * O motor (`edicaoDeNos.js`) diz, junto com os nós novos, o `mapa` de cada nó
 * antigo e quais `trechos` viraram outros. Aqui isso leva junto o que depende
 * do número do nó: os piques (presos a trecho) e as regras da graduação
 * (presas a nó).
 */

/** O comprimento aproximado do trecho `i` (dezesseis passos). */
function comprimentoDoTrecho(nos, i) {
  let total = 0;
  let antes = pontoNoTrecho(nos, i, 0);
  for (let k = 1; k <= 16; k++) {
    const q = pontoNoTrecho(nos, i, k / 16);
    total += Math.hypot(q.x - antes.x, q.y - antes.y);
    antes = q;
  }
  return total;
}

/** O `t` do trecho `i` em que cai a fração `f` (0 a 1) do comprimento dele. */
function tNaFracao(nos, i, f) {
  const PASSOS = 32;
  const acumulado = [0];
  let antes = pontoNoTrecho(nos, i, 0);
  for (let k = 1; k <= PASSOS; k++) {
    const q = pontoNoTrecho(nos, i, k / PASSOS);
    acumulado.push(acumulado[k - 1] + Math.hypot(q.x - antes.x, q.y - antes.y));
    antes = q;
  }
  const alvo = f * acumulado[PASSOS];
  for (let k = 1; k <= PASSOS; k++) {
    if (acumulado[k] >= alvo) {
      const pedaco = acumulado[k] - acumulado[k - 1];
      return (k - 1 + (pedaco > 0 ? (alvo - acumulado[k - 1]) / pedaco : 0)) / PASSOS;
    }
  }
  return 1;
}

/**
 * Leva os piques para os trechos novos. Trecho que não mudou: o mesmo `t`, no
 * número novo. Trecho que virou outro(s): a mesma FRAÇÃO DO COMPRIMENTO do
 * pedaço — o pique fica no mesmo lugar da costura enquanto o pedaço não muda
 * muito de forma.
 */
function piquesNosTrechosNovos(piques, velhos, novos, mapa, trechos) {
  const pedacoDe = new Map();
  for (const p of trechos) for (const s of p.velhos) pedacoDe.set(s, p);
  const soma = (lista) => lista.reduce((a, b) => a + b, 0);
  return piques.filter((p) => p.no < velhos.length).map((p) => {
    const pedaco = pedacoDe.get(p.no);
    if (!pedaco) return { ...p, no: mapa[p.no] };
    const antes = pedaco.velhos.map((s) => comprimentoDoTrecho(velhos, s));
    const k = pedaco.velhos.indexOf(p.no);
    const fracao = (soma(antes.slice(0, k)) + p.t * antes[k]) / (soma(antes) || 1);
    const depois = pedaco.novos.map((s) => comprimentoDoTrecho(novos, s));
    let resto = fracao * soma(depois);
    for (let q = 0; q < pedaco.novos.length; q++) {
      if (resto <= depois[q] || q === pedaco.novos.length - 1) {
        return { ...p, no: pedaco.novos[q], t: tNaFracao(novos, pedaco.novos[q], depois[q] > 0 ? Math.min(1, resto / depois[q]) : 0) };
      }
      resto -= depois[q];
    }
    return p;
  });
}

/** A peça com o que saiu de `apagarNos`/`reduzirNos`: piques e regras da graduação vão junto. */
function comNosNovos(peca, r) {
  return {
    ...peca,
    nos: r.nos,
    marcacoes: { ...peca.marcacoes, piques: piquesNosTrechosNovos(peca.marcacoes.piques, peca.nos, r.nos, r.mapa, r.trechos) },
    ...(peca.graduacao ? { graduacao: graduacaoPorMapa(peca.graduacao, r.mapa) } : {}),
  };
}

/** Apaga vários nós, refazendo o pedaço (ver `apagarNos`). `{ peca }` ou `{ erro }`. */
export function apagarNosDaPeca(peca, indices) {
  const r = apagarNos(peca.nos, indices);
  return r.erro ? { erro: r.erro } : { peca: comNosNovos(peca, r) };
}

/**
 * Reduz os nós da peça (ver `reduzirNos`). Nó com regra de graduação é
 * âncora: é um ponto que a pessoa escolheu, e tirá-lo perderia a regra.
 * `{ peca, antes, depois }` ou `{ erro }`.
 */
export function reduzirNosDaPeca(peca, indices, folga) {
  const comRegra = (peca.graduacao?.regras ?? []).map((r) => r.no);
  const r = reduzirNos(peca.nos, indices, folga, comRegra);
  return r.erro ? { erro: r.erro } : { peca: comNosNovos(peca, r), antes: r.antes, depois: r.depois };
}

/**
 * Um nó em cada ponto `{ no, t }` — um por trecho —, com piques e regras
 * junto: um `inserirNoNaPeca` por vez, do trecho de número maior para o menor.
 */
export function porNosDaPeca(peca, pontos) {
  const porTrecho = new Map();
  for (const p of pontos) if (p.no >= 0 && p.no < peca.nos.length && !porTrecho.has(p.no)) porTrecho.set(p.no, p.t);
  let atual = peca;
  for (const [no, t] of [...porTrecho].sort((x, y) => y[0] - x[0])) atual = inserirNoNaPeca(atual, no, t);
  return atual;
}

/**
 * Gira a peça em volta do centro da caixa. Nós, pontos, fio e as regras da
 * graduação vão juntos; os piques acompanham sozinhos, porque são presos ao
 * trecho (`no`, `t`). O canto de cima à esquerda da caixa volta para onde
 * estava: a peça não pula na mesa, e 4× 90° devolve a original.
 *
 * O fio guarda a direção como `(sen a, cos a)`; girar o desenho de θ leva essa
 * direção para `(sen(a−θ), cos(a−θ))`, daí o `a − θ`.
 */
export function girarPeca(peca, graus) {
  const antes = caixaDe(achatarCurvas(peca.nos));
  const centro = { x: antes.minX + antes.largura / 2, y: antes.minY + antes.altura / 2 };
  const girados = girarNos(peca.nos, graus, centro);
  const depois = caixaDe(achatarCurvas(girados));
  const dx = antes.minX - depois.minX;
  const dy = antes.minY - depois.minY;
  const nos = moverNos(girados, girados.map((_, i) => i), dx, dy);
  const leva = (p) => {
    const [q] = girarNos([{ x: p.x, y: p.y, entrada: p, saida: p }], graus, centro);
    return { x: q.x + dx, y: q.y + dy };
  };
  let angulo = peca.marcacoes.fio.angulo - graus;
  angulo = ((angulo + 540) % 360) - 180;
  if (Math.abs(angulo + 180) < 1e-9) angulo = 180;
  return {
    ...peca,
    nos,
    marcacoes: {
      ...peca.marcacoes,
      pontos: peca.marcacoes.pontos.map((p) => ({ ...p, ...leva(p) })),
      fio: { ...peca.marcacoes.fio, ...leva(peca.marcacoes.fio), angulo },
    },
    ...(peca.graduacao ? { graduacao: graduacaoGirada(peca.graduacao, graus) } : {}),
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run bancada:montagem && npm run bancada:graduacao && npm run bancada:nos`
Expected: tudo OK.

- [ ] **Step 6: Commit**

```bash
git add src/motores/graduacao.js src/motores/montagem.js bancada/conferir-montagem.mjs bancada/conferir-graduacao.mjs
git commit -m "Na peça da Montagem, vários nós levam piques e regras da graduação junto, e a peça gira

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: O desenho da seleção, o gancho da interação e a barra dos nós

**Files:**
- Modify: `src/telas/risco/desenhoDeNos.ts` (`desenharNos` com conjunto; `desenharRetangulo`)
- Create: `src/telas/risco/useEditorDeNos.ts`, `src/telas/risco/BarraDosNos.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 (motor).
- Produces: `desenharNos(ctx, nos, selecionados: ReadonlySet<number> | number | null, emTela)`; `desenharRetangulo(ctx, de, ate, emTela)`; `useEditorDeNos(alvo: AlvoDoEditor, chave) → EditorDeNos` (a seleção, `retangulo`, `aviso`, `folga`, `contagem`, `tipoComum`, os `pode…`, `apertar`, `mover`, `soltar`, `dobrarClique`, `teclar`, e as ações da barra); `BarraDosNos({ editor, aoGirar? })`.

- [ ] **Step 1: O desenho**

Em `src/telas/risco/desenhoDeNos.ts`, trocar `desenharNos` inteira (com o comentário) por:

```ts
/**
 * As alças dos nós selecionados (por baixo) e os nós (por cima).
 *
 * Canto é quadrado, curva é redondo: canto é ponto de costura, e tem que dar
 * para reconhecer sem clicar. O nó selecionado cresce, muda de cor e ganha
 * halo — é ele que o Delete apaga, então dá para ver o que vai embora antes.
 * `selecionados`: um índice, um conjunto (o editor estilo Corel) ou `null`.
 */
export function desenharNos(
  ctx: CanvasRenderingContext2D, nos: No[], selecionados: ReadonlySet<number> | number | null, emTela: (p: Ponto) => Ponto,
) {
  const sel: ReadonlySet<number> = selecionados === null ? new Set() : typeof selecionados === "number" ? new Set([selecionados]) : selecionados;
  for (const i of sel) {
    const n = nos[i];
    if (!n) continue;
    const anterior = nos[(i - 1 + nos.length) % nos.length]!;
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
    const marcado = sel.has(i);
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

/** O retângulo de seleção, tracejado, com um véu azul por dentro. */
export function desenharRetangulo(ctx: CanvasRenderingContext2D, de: Ponto, ate: Ponto, emTela: (p: Ponto) => Ponto) {
  const a = emTela(de);
  const b = emTela(ate);
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = "#4d9dff";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "rgba(77, 157, 255, 0.08)";
  ctx.beginPath();
  ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 2: O gancho**

`src/telas/risco/useEditorDeNos.ts`:

```ts
/**
 * ===========================================================================
 * O EDITOR DE NÓS ESTILO COREL — a interação, igual no Digitalizar e na Montagem
 * ===========================================================================
 *
 * As contas moram em `motores/edicaoDeNos.js`; aqui mora o que o ponteiro e o
 * teclado fazem: a seleção, o retângulo, arrastar nós, alças ou o próprio
 * traço, as setas e o Reduzir ao vivo. Cada tela entrega um `AlvoDoEditor` —
 * os nós da peça em edição e como mudá-los (a Montagem leva junto piques e
 * regras da graduação; o Digitalizar, não) — e liga os eventos do canvas nas
 * funções que este gancho devolve. Ver
 * docs/superpowers/specs/2026-09-29-editor-estilo-corel-design.md.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  alinharNos, converterTrechos, moverNos, moverPega, mudarTipoDosNos, nosNoRetangulo, pegaSob, puxarTrecho,
  tipoDoNo, tracoSob, trechosDaSelecao,
} from "../../motores/edicaoDeNos";
import type { No, Ponto } from "./desenhoDeNos";

export type TipoDeNo = "canto" | "suave" | "simetrico";

/** Uma redução já calculada: `aplicar` a põe na peça. */
export interface ReducaoPronta { antes: number; depois: number; aplicar: () => void }

export interface AlvoDoEditor {
  /** Os nós da peça em edição, como estão agora. */
  nos: No[];
  /** Mexida que muda só a forma (mover, puxar, tipo, converter, alinhar), sem mudar quantos nós há. */
  mudarNos: (mudar: (nos: No[]) => No[], lembrarAntes: boolean) => void;
  /** Apaga os nós (o pedaço é refeito). Devolve o aviso quando não dá, ou `null`. */
  apagarNos: (indices: number[]) => string | null;
  /** Um nó em cada ponto `{ no, t }`, um por trecho. */
  porNos: (pontos: { no: number; t: number }[]) => void;
  /** O que o Reduzir guarda antes de começar (os nós; na Montagem, a peça inteira). */
  retrato: () => unknown;
  /** Calcula a redução a partir do retrato (não acumula). Nada muda até `aplicar`. */
  reduzir: (retrato: unknown, indices: number[] | null, folga: number) => ReducaoPronta | { erro: string };
  /** Põe o retrato de volta (o controle do Reduzir voltou para onde não há o que tirar). */
  voltar: (retrato: unknown) => void;
  /** Guarda o estado de agora no desfazer. */
  lembrar: () => void;
  /** Quanto as setas andam, nas unidades dos nós: 1 mm e 1 cm (sem medida, 1 e 10 células). */
  passos: { curto: number; longo: number };
  /** A folga do Reduzir, do valor do controle (mm; sem medida, "pouco ↔ muito") para as unidades dos nós. */
  folgaEmUnidades: (valor: number) => number;
  /** Com medida, o controle do Reduzir mostra milímetros; sem, "pouco ↔ muito". */
  comMedida: boolean;
}

type Arrasto =
  | { tipo: "nos"; base: No[]; indices: number[]; de: Ponto; mexeu: boolean; soEle: number | null }
  | { tipo: "alca"; no: number; parte: "entrada" | "saida"; mexeu: boolean }
  | { tipo: "trecho"; base: No[]; no: number; t: number; de: Ponto; mexeu: boolean }
  | { tipo: "retangulo"; de: Ponto; ate: Ponto; somar: boolean; antes: Set<number> };

/** Abaixo disto (em fração do raio de pega), o aperto é clique, não arrasto. */
const MEXEU = 0.3;
/** Setas com menos que isto entre uma e outra são um passo só no desfazer. */
const SETAS_SEGUIDAS_MS = 1000;

/** Há uma janela aberta na frente? Então as teclas são dela, não do editor. */
function janelaAberta(): boolean {
  return [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el.getClientRects().length > 0);
}

export function useEditorDeNos(alvo: AlvoDoEditor, chave: unknown) {
  const nos = alvo.nos;
  const [selecionados, setSelecionados] = useState<Set<number>>(() => new Set());
  /** O último nó clicado: a referência do Alinhar. Seleção pelo retângulo ou Ctrl+A: `null` (a média). */
  const [referencia, setReferencia] = useState<number | null>(null);
  const [retangulo, setRetangulo] = useState<{ de: Ponto; ate: Ponto } | null>(null);
  const [aviso, setAviso] = useState("");
  const [folga, setFolga] = useState(0.5);
  const [contagem, setContagem] = useState<{ antes: number; depois: number } | null>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const raioDoArrasto = useRef(0);
  const ultimaSeta = useRef(0);
  const reducao = useRef<{ retrato: unknown; indices: number[] | null; lembrou: boolean } | null>(null);

  // Outra peça: seleção nova.
  useEffect(() => {
    setSelecionados(new Set());
    setReferencia(null);
    setAviso("");
    setContagem(null);
    reducao.current = null;
  }, [chave]);

  // Um desfazer pode tirar nós: a seleção perde o que não existe mais.
  useEffect(() => {
    setSelecionados((s) => ([...s].every((i) => i < nos.length) ? s : new Set([...s].filter((i) => i < nos.length))));
  }, [nos.length]);

  const lista = useMemo(() => [...selecionados].sort((a, b) => a - b), [selecionados]);
  const trechos: number[] = useMemo(() => (lista.length > 0 ? trechosDaSelecao(nos, lista) : []), [nos, lista]);
  const tipoComum: TipoDeNo | null = lista.length > 0 && nos[lista[0]!]
    && lista.every((i) => nos[i] && tipoDoNo(nos[i]) === tipoDoNo(nos[lista[0]!]!))
    ? (tipoDoNo(nos[lista[0]!]!) as TipoDeNo)
    : null;

  /** Qualquer mexida que não é seta quebra a sequência de setas. */
  const outraMexida = () => { ultimaSeta.current = 0; };

  // ------------------------------------------------------------ o ponteiro

  /** Aperto do ponteiro, nas unidades dos nós. `true` quando começou um arrasto (a tela captura o ponteiro). */
  const apertar = (ponto: Ponto, raio: number, shift: boolean): boolean => {
    setAviso("");
    outraMexida();
    raioDoArrasto.current = raio;
    const sob = pegaSob(nos, ponto, raio, selecionados);
    if (sob && sob.parte !== "no") {
      arrasto.current = { tipo: "alca", no: sob.no, parte: sob.parte as "entrada" | "saida", mexeu: false };
      return true;
    }
    if (sob) {
      const i: number = sob.no;
      if (shift && selecionados.has(i)) {
        const s = new Set(selecionados);
        s.delete(i);
        setSelecionados(s);
        return false;
      }
      const s = shift ? new Set([...selecionados, i]) : selecionados.has(i) ? selecionados : new Set([i]);
      if (s !== selecionados) setSelecionados(s);
      setReferencia(i);
      // Clique (sem arrastar) num nó de uma seleção de vários: ao soltar, fica só ele.
      const soEle = !shift && selecionados.has(i) && selecionados.size > 1 ? i : null;
      arrasto.current = { tipo: "nos", base: nos, indices: [...s], de: ponto, mexeu: false, soEle };
      return true;
    }
    const traco = tracoSob(nos, ponto, raio);
    if (traco) {
      if (nos[traco.no]?.retaDepois) {
        setAviso("Trecho reto: converta em curva para dobrar.");
        return false;
      }
      arrasto.current = { tipo: "trecho", base: nos, no: traco.no, t: traco.t, de: ponto, mexeu: false };
      return true;
    }
    arrasto.current = { tipo: "retangulo", de: ponto, ate: ponto, somar: shift, antes: shift ? new Set(selecionados) : new Set() };
    setRetangulo({ de: ponto, ate: ponto });
    return true;
  };

  const mover = (ponto: Ponto) => {
    const a = arrasto.current;
    if (!a) return;
    const limiar = raioDoArrasto.current * MEXEU;
    if (a.tipo === "retangulo") {
      a.ate = ponto;
      setRetangulo({ de: a.de, ate: ponto });
      setSelecionados(new Set([...a.antes, ...nosNoRetangulo(nos, a.de, ponto)]));
      return;
    }
    if (a.tipo === "alca") {
      const primeiro = !a.mexeu;
      a.mexeu = true;
      alvo.mudarNos((atuais) => moverPega(atuais, { no: a.no, parte: a.parte }, ponto), primeiro);
      return;
    }
    const dx = ponto.x - a.de.x;
    const dy = ponto.y - a.de.y;
    if (!a.mexeu && Math.hypot(dx, dy) < limiar) return;
    const primeiro = !a.mexeu;
    a.mexeu = true;
    if (a.tipo === "nos") {
      alvo.mudarNos(() => moverNos(a.base, a.indices, dx, dy), primeiro);
      return;
    }
    const puxado = puxarTrecho(a.base, a.no, a.t, ponto);
    if (puxado) alvo.mudarNos(() => puxado, primeiro);
  };

  const soltar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    if (!a) return;
    if (a.tipo === "retangulo") {
      setRetangulo(null);
      const mexeu = Math.hypot(a.ate.x - a.de.x, a.ate.y - a.de.y) >= raioDoArrasto.current * MEXEU;
      if (mexeu) setReferencia(null);
      else if (!a.somar) setSelecionados(new Set());
    } else if (a.tipo === "nos" && !a.mexeu && a.soEle !== null) {
      setSelecionados(new Set([a.soEle]));
    }
  };

  /** Dois cliques: num nó, apaga; no traço, põe um nó ali sem mudar o desenho. */
  const dobrarClique = (ponto: Ponto, raio: number) => {
    outraMexida();
    const sob = pegaSob(nos, ponto, raio, null);
    if (sob) {
      const erro = alvo.apagarNos([sob.no]);
      if (erro) setAviso(erro);
      else setSelecionados(new Set());
      return;
    }
    const traco = tracoSob(nos, ponto, raio);
    if (!traco) return;
    alvo.porNos([{ no: traco.no, t: traco.t }]);
    setSelecionados(new Set([traco.no + 1]));
    setReferencia(traco.no + 1);
  };

  // ------------------------------------------------------------ a barra

  const apagar = () => {
    outraMexida();
    if (lista.length === 0) return;
    const erro = alvo.apagarNos(lista);
    if (erro) { setAviso(erro); return; }
    setSelecionados(new Set());
    setReferencia(null);
  };

  const porNo = () => {
    outraMexida();
    if (trechos.length === 0) return;
    alvo.porNos(trechos.map((no) => ({ no, t: 0.5 })));
    setSelecionados(new Set());
  };

  const converter = (jeito: "linha" | "curva") => {
    outraMexida();
    if (trechos.length === 0) return;
    alvo.mudarNos((atuais) => converterTrechos(atuais, trechos, jeito), true);
  };

  const mudarTipo = (tipo: TipoDeNo) => {
    outraMexida();
    if (lista.length === 0) return;
    alvo.mudarNos((atuais) => mudarTipoDosNos(atuais, lista, tipo), true);
  };

  const alinhar = (eixo: "horizontal" | "vertical") => {
    outraMexida();
    if (lista.length < 2) return;
    const clicado = referencia !== null && selecionados.has(referencia) ? nos[referencia] : undefined;
    const ref = clicado ?? {
      x: lista.reduce((s, i) => s + nos[i]!.x, 0) / lista.length,
      y: lista.reduce((s, i) => s + nos[i]!.y, 0) / lista.length,
    };
    alvo.mudarNos((atuais) => alinharNos(atuais, lista, eixo, ref), true);
  };

  const selecionarTodos = () => {
    setSelecionados(new Set(nos.map((_, i) => i)));
    setReferencia(null);
  };

  /** Mexer no controle do Reduzir: refaz a redução a partir do retrato guardado no primeiro movimento. */
  const reduzirAoVivo = (valor: number) => {
    outraMexida();
    setFolga(valor);
    if (!reducao.current) reducao.current = { retrato: alvo.retrato(), indices: lista.length > 0 ? lista : null, lembrou: false };
    const r = reducao.current;
    const feito = alvo.reduzir(r.retrato, r.indices, alvo.folgaEmUnidades(valor));
    if ("erro" in feito) {
      setAviso(feito.erro);
      setContagem(null);
      if (r.lembrou) alvo.voltar(r.retrato);
      return;
    }
    if (!r.lembrou) { alvo.lembrar(); r.lembrou = true; }
    feito.aplicar();
    setAviso("");
    setContagem({ antes: feito.antes, depois: feito.depois });
  };

  /** Soltar o controle: a redução fica (um passo no desfazer). */
  const terminarReducao = () => {
    if (!reducao.current) return;
    reducao.current = null;
    setSelecionados(new Set());
    setReferencia(null);
  };

  /** O botão "Reduzir nós": uma vez, com o valor do controle, a partir do desenho de agora. */
  const reduzirUmaVez = () => {
    outraMexida();
    const feito = alvo.reduzir(alvo.retrato(), lista.length > 0 ? lista : null, alvo.folgaEmUnidades(folga));
    if ("erro" in feito) { setAviso(feito.erro); setContagem(null); return; }
    alvo.lembrar();
    feito.aplicar();
    setAviso("");
    setContagem({ antes: feito.antes, depois: feito.depois });
    setSelecionados(new Set());
    setReferencia(null);
  };

  // ------------------------------------------------------------ o teclado

  /** Uma tecla. `true` quando ela era do editor (e já foi tratada). */
  const teclar = (e: KeyboardEvent): boolean => {
    const foco = document.activeElement as HTMLElement | null;
    if (foco && (["INPUT", "TEXTAREA", "SELECT"].includes(foco.tagName) || foco.isContentEditable)) return false;
    if (janelaAberta()) return false;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selecionarTodos();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === "Escape") {
      if (selecionados.size === 0) return false;
      setSelecionados(new Set());
      return true;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selecionados.size === 0) return false;
      e.preventDefault();
      apagar();
      return true;
    }
    if (e.key === "+") {
      if (trechos.length === 0) return false;
      e.preventDefault();
      porNo();
      return true;
    }
    const setas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = setas[e.key];
    if (!d || selecionados.size === 0) return false;
    e.preventDefault();
    const passo = e.shiftKey ? alvo.passos.longo : alvo.passos.curto;
    const agora = Date.now();
    const seguida = agora - ultimaSeta.current < SETAS_SEGUIDAS_MS;
    ultimaSeta.current = agora;
    alvo.mudarNos((atuais) => moverNos(atuais, lista, d[0] * passo, d[1] * passo), !seguida);
    return true;
  };

  return {
    selecionados, retangulo, aviso, folga, contagem, tipoComum, total: nos.length,
    comMedida: alvo.comMedida,
    podeApagar: lista.length > 0,
    podePor: trechos.length > 0,
    podeLinha: trechos.some((i) => !nos[i]?.retaDepois),
    podeCurva: trechos.some((i) => !!nos[i]?.retaDepois),
    podeAlinhar: lista.length >= 2,
    podeReduzir: nos.length > 3,
    apertar, mover, soltar, dobrarClique, teclar,
    apagar, porNo, converter, mudarTipo, alinhar, selecionarTodos,
    reduzirAoVivo, terminarReducao, reduzirUmaVez,
  };
}

export type EditorDeNos = ReturnType<typeof useEditorDeNos>;
```

- [ ] **Step 3: A barra**

`src/telas/risco/BarraDosNos.tsx`:

```tsx
/**
 * A BARRA DOS NÓS — a barra de propriedades do Corel, igual no Digitalizar e na
 * Montagem. Só mostra e chama: o que cada botão faz mora no `useEditorDeNos` e
 * nas contas de `motores/edicaoDeNos.js`. Cada botão só acende quando serve
 * para a seleção, e a dica diz o que faz e o atalho.
 */
import { useState } from "react";
import type { EditorDeNos, TipoDeNo } from "./useEditorDeNos";

interface Props {
  editor: EditorDeNos;
  /** Só na Montagem: girar a peça (graus positivos giram no sentido do relógio). */
  aoGirar?: (graus: number) => void;
}

const TIPOS: { tipo: TipoDeNo; rotulo: string; dica: string }[] = [
  { tipo: "canto", rotulo: "Canto", dica: "Canto: as duas alças soltas (ponto de costura)" },
  { tipo: "suave", rotulo: "Suave", dica: "Suave: as duas alças na mesma reta, cada uma do seu tamanho" },
  { tipo: "simetrico", rotulo: "Simétrico", dica: "Simétrico: as duas alças na mesma reta e do mesmo tamanho" },
];

const Separador = () => <span className="mx-1 h-5 w-px shrink-0 bg-linha" />;

export function BarraDosNos({ editor, aoGirar }: Props) {
  const [anguloEscrito, setAnguloEscrito] = useState("");
  const angulo = Number(anguloEscrito.trim().replace(",", "."));
  const anguloValido = anguloEscrito.trim() !== "" && Number.isFinite(angulo) && angulo !== 0;
  const n = editor.selecionados.size;
  const botao = "btn secondary btn-sm";

  return (
    <div className="flex flex-col gap-1 border-b border-linha px-3 py-1.5 text-[0.8rem]">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Barra dos nós">
        <button type="button" className={botao} disabled={!editor.podePor} onClick={editor.porNo}
          title="Pôr um nó no meio de cada trecho entre os selecionados (tecla +)">+ Nó</button>
        <button type="button" className={botao} disabled={!editor.podeApagar} onClick={editor.apagar}
          title="Apagar os nós selecionados; o trecho é refeito perto do desenho de antes (Delete)">− Nó</button>
        <Separador />
        <button type="button" className={botao} disabled={!editor.podeLinha} onClick={() => editor.converter("linha")}
          title="Converter em linha: o trecho fica reto, os nós no lugar">Linha</button>
        <button type="button" className={botao} disabled={!editor.podeCurva} onClick={() => editor.converter("curva")}
          title="Converter em curva: o trecho reto ganha alças, e dá para puxar">Curva</button>
        <Separador />
        {TIPOS.map((t) => (
          <button key={t.tipo} type="button" title={t.dica} disabled={n === 0} aria-pressed={editor.tipoComum === t.tipo}
            className={`btn btn-sm ${editor.tipoComum === t.tipo ? "primary" : "secondary"}`} onClick={() => editor.mudarTipo(t.tipo)}>
            {t.rotulo}
          </button>
        ))}
        <Separador />
        <button type="button" className={botao} disabled={!editor.podeAlinhar} onClick={() => editor.alinhar("horizontal")}
          title="Alinhar na horizontal: a mesma altura do último nó clicado (ou a média)">Alinhar ↔</button>
        <button type="button" className={botao} disabled={!editor.podeAlinhar} onClick={() => editor.alinhar("vertical")}
          title="Alinhar na vertical: a mesma coluna do último nó clicado (ou a média)">Alinhar ↕</button>
        <Separador />
        <button type="button" className={botao} disabled={!editor.podeReduzir} onClick={editor.reduzirUmaVez}
          title="Reduzir nós: tira os que sobram, sem o desenho mudar mais que o controle (sem seleção, a peça inteira)">
          Reduzir nós
        </button>
        <input
          type="range" min={0.2} max={3} step={0.1} value={editor.folga}
          onChange={(e) => editor.reduzirAoVivo(Number(e.target.value))}
          onPointerUp={editor.terminarReducao} onBlur={editor.terminarReducao}
          disabled={!editor.podeReduzir} className="w-28! shrink-0" aria-label="Quanto o desenho pode mudar ao reduzir"
        />
        <span className="w-16 shrink-0 font-mono text-tinta-fraca">
          {editor.comMedida ? `${editor.folga.toFixed(1).replace(".", ",")} mm` : "pouco ↔ muito"}
        </span>
        {aoGirar && (
          <>
            <Separador />
            <button type="button" className={botao} title="Girar a peça 90° para a esquerda" onClick={() => aoGirar(-90)}>↺ 90°</button>
            <button type="button" className={botao} title="Girar a peça 90° para a direita" onClick={() => aoGirar(90)}>↻ 90°</button>
            <input type="text" inputMode="decimal" value={anguloEscrito} placeholder="graus" aria-label="Ângulo para girar, em graus"
              onChange={(e) => setAnguloEscrito(e.target.value)} className="w-16!" />
            <button type="button" className={botao} disabled={!anguloValido}
              onClick={() => { if (anguloValido) aoGirar(angulo); }}>Girar</button>
          </>
        )}
      </div>
      <p className="m-0 text-tinta-fraca" role="status">
        {n > 0 ? `${n} de ${editor.total} nós selecionados` : `${editor.total} nós`}
        {editor.contagem ? ` · ${editor.contagem.antes} → ${editor.contagem.depois} nós` : ""}
        {editor.aviso ? <span className="text-ambar"> · {editor.aviso}</span> : null}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Tipos**

Run: `npm run tipos`
Expected: OK (a Montagem e o Digitalizar ainda passam o nó ativo como número para `desenharNos`, que continua aceitando).

- [ ] **Step 5: Commit**

```bash
git add src/telas/risco/desenhoDeNos.ts src/telas/risco/useEditorDeNos.ts src/telas/risco/BarraDosNos.tsx
git commit -m "O editor estilo Corel: o desenho da seleção, o gancho da interação e a barra dos nós

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A Montagem liga o editor

**Files:**
- Modify: `src/telas/montagem/Mesa.tsx`, `src/telas/montagem/MesaDeMontagem.tsx`

**Interfaces:**
- Consumes: `useEditorDeNos`, `BarraDosNos` (Task 7); `apagarNosDaPeca`, `porNosDaPeca`, `reduzirNosDaPeca`, `girarPeca` (Task 6).
- Produces: a `Mesa` ganha a prop `editor?: EditorDeNos` (a ferramenta Nós delega ponteiro, dois cliques e desenho a ele; o Delete sai da Mesa e vira tecla do editor).

- [ ] **Step 1: A Mesa**

Aplicar em `src/telas/montagem/Mesa.tsx`:

```diff
diff --git a/src/telas/montagem/Mesa.tsx b/src/telas/montagem/Mesa.tsx
index 91df43f..39ad703 100644
--- a/src/telas/montagem/Mesa.tsx
+++ b/src/telas/montagem/Mesa.tsx
@@ -6,7 +6,7 @@
  *
  * Um canvas em cima de uma grade de 1 cm. Cinco ferramentas, uma de cada vez:
  *
- *   NÓS      a edição do Digitalizar, as mesmas contas (`motores/edicaoDeNos.js`);
+ *   NÓS      o editor estilo Corel, o mesmo do Digitalizar (`risco/useEditorDeNos.ts`);
  *   PIQUE    clique no traço põe, clique num pique tira;
  *   PONTO    clique dentro da peça põe, clique num ponto tira;
  *   FIO      arrasta pelo meio, gira pelas pontas;
@@ -23,12 +23,12 @@
 import { useEffect, useMemo, useRef, useState } from "react";
 import { achatarCurvas } from "../../motores/ajusteDeCurvas";
 import { margemDeCostura } from "../../motores/margemDeCostura";
-import { moverPega, pegaSob, tracoSob } from "../../motores/edicaoDeNos";
+import { pegaSob, tracoSob } from "../../motores/edicaoDeNos";
 import {
-  PROFUNDIDADE_DO_PIQUE, apagarNoDaPeca, arranjar, caixaDe, desenhoDaPeca, inserirNoNaPeca,
-  pecaParaGravar, posicaoDoPique,
+  PROFUNDIDADE_DO_PIQUE, arranjar, caixaDe, desenhoDaPeca, pecaParaGravar, posicaoDoPique,
 } from "../../motores/montagem";
-import { desenharNos, desenharPontosDeGraduacao, tracarCaminho, type Ponto } from "../risco/desenhoDeNos";
+import { desenharNos, desenharPontosDeGraduacao, desenharRetangulo, tracarCaminho, type Ponto } from "../risco/desenhoDeNos";
+import type { EditorDeNos } from "../risco/useEditorDeNos";
 import { corDaPeca } from "../../utils/coresDePeca";
 import type { PecaEmMontagem } from "./useMoldeEmMontagem";
 
@@ -45,7 +45,7 @@ const ZOOM_MAX = 12;
 interface Vista { minX: number; minY: number; largura: number; altura: number }
 
 type Arrasto =
-  | { tipo: "no"; no: number; parte: "no" | "entrada" | "saida" }
+  | { tipo: "editor" }
   | { tipo: "fio"; modo: "mover" | "girar" };
 
 interface Props {
@@ -64,6 +64,8 @@ interface Props {
   camadas?: { nos: PecaEmMontagem["nos"]; cor: string; tracejada?: boolean }[];
   /** Na ferramenta Graduar: os nós que têm regra (ganham o losango). */
   regras?: readonly number[];
+  /** Na ferramenta Nós: o editor estilo Corel (a seleção e o que o ponteiro faz). */
+  editor?: EditorDeNos;
 }
 
 /**
@@ -248,12 +250,15 @@ export function Mesa(props: Props) {
       ctx.textAlign = "left";
       ctx.fillText("A margem fecha a peça sobre ela mesma: diminua a margem.", 12 * fator, 22 * fator);
     }
-    if (ferramenta === "nos") desenharNos(ctx, peca.nos, noAtivoValido, emTela);
+    if (ferramenta === "nos") {
+      desenharNos(ctx, peca.nos, props.editor?.selecionados ?? null, emTela);
+      if (props.editor?.retangulo) desenharRetangulo(ctx, props.editor.retangulo.de, props.editor.retangulo.ate, emTela);
+    }
     if (ferramenta === "graduar") {
       desenharNos(ctx, peca.nos, null, emTela);
       desenharPontosDeGraduacao(ctx, peca.nos, regras, noAtivoValido, emTela);
     }
-  }, [vista, escala, verTodas, todas, peca, indice, corte, risco, ferramenta, noAtivoValido, comErro, camadas, regras]);
+  }, [vista, escala, verTodas, todas, peca, indice, corte, risco, ferramenta, noAtivoValido, comErro, camadas, regras, props.editor?.selecionados, props.editor?.retangulo]);
 
   // ------------------------------------------------------------ o ponteiro
   const aoApertar = (e: React.PointerEvent<HTMLCanvasElement>) => {
@@ -268,11 +273,8 @@ export function Mesa(props: Props) {
     const raio = raioCm();
 
     if (ferramenta === "nos") {
-      const sob = pegaSob(peca.nos, alvo, raio, noAtivoValido);
-      if (!sob) { props.aoMarcarNo(null); return; }
-      if (sob.parte === "no") props.aoMarcarNo(sob.no);
-      props.aoLembrar();
-      arrasto.current = { tipo: "no", no: sob.no, parte: sob.parte as "no" | "entrada" | "saida" };
+      if (!props.editor?.apertar(alvo, raio, e.shiftKey)) return;
+      arrasto.current = { tipo: "editor" };
     } else if (ferramenta === "pique") {
       // Mesmo filtro que `desenhoDaPeca` aplica antes de desenhar: um pique
       // cujo `no` não existe mais (dado velho, ou um `apagarNoDaPeca` que não
@@ -340,8 +342,8 @@ export function Mesa(props: Props) {
     if (!a) return;
     const alvo = noCm(e);
     if (!alvo) return;
-    if (a.tipo === "no") {
-      props.aoMudar((p) => ({ ...p, nos: moverPega(p.nos, { no: a.no, parte: a.parte }, alvo) }), false);
+    if (a.tipo === "editor") {
+      props.editor?.mover(alvo);
     } else if (a.modo === "mover") {
       props.aoMudar((p) => ({ ...p, marcacoes: { ...p.marcacoes, fio: { ...p.marcacoes.fio, x: alvo.x, y: alvo.y } } }), false);
     } else {
@@ -355,6 +357,7 @@ export function Mesa(props: Props) {
 
   const aoSoltar = (e: React.PointerEvent<HTMLCanvasElement>) => {
     if (!arrasto.current) return;
+    if (arrasto.current.tipo === "editor") props.editor?.soltar();
     arrasto.current = null;
     vistaCongelada.current = null;
     e.currentTarget.releasePointerCapture?.(e.pointerId);
@@ -365,19 +368,7 @@ export function Mesa(props: Props) {
   const aoDobrarClique = (e: React.MouseEvent<HTMLCanvasElement>) => {
     if (verTodas || ferramenta !== "nos" || !peca) return;
     const alvo = noCm(e);
-    if (!alvo) return;
-    const raio = raioCm();
-    const sob = pegaSob(peca.nos, alvo, raio, null);
-    if (sob) {
-      if (peca.nos.length <= 3) return;
-      props.aoMudar((p) => apagarNoDaPeca(p, sob.no) ?? p, true);
-      props.aoMarcarNo(null);
-      return;
-    }
-    const traco = tracoSob(peca.nos, alvo, raio);
-    if (!traco) return;
-    props.aoMudar((p) => inserirNoNaPeca(p, traco.no, traco.t), true);
-    props.aoMarcarNo(traco.no + 1);
+    if (alvo) props.editor?.dobrarClique(alvo, raioCm());
   };
 
   // A largura da mesa, para o canvas nascer do tamanho em que aparece.
@@ -415,24 +406,6 @@ export function Mesa(props: Props) {
     return () => caixa.removeEventListener("wheel", aoRodar);
   }, []);
 
-  // Delete/Backspace apaga o nó marcado — menos quando se está digitando num campo.
-  useEffect(() => {
-    const ouvir = (e: KeyboardEvent) => {
-      if (e.key !== "Delete" && e.key !== "Backspace") return;
-      const foco = document.activeElement as HTMLElement | null;
-      if (foco && (["INPUT", "TEXTAREA", "SELECT"].includes(foco.tagName) || foco.isContentEditable)) return;
-      // `noAtivoValido`, não `noAtivo`: um nó marcado antes de um desfazer
-      // pode não existir mais na lista de agora (ver o comentário em cima de
-      // `noAtivoValido`) — apagar por um índice velho mexeria no nó ERRADO.
-      if (ferramenta !== "nos" || noAtivoValido === null || !peca || peca.nos.length <= 3) return;
-      e.preventDefault();
-      props.aoMudar((p) => apagarNoDaPeca(p, noAtivoValido) ?? p, true);
-      props.aoMarcarNo(null);
-    };
-    window.addEventListener("keydown", ouvir);
-    return () => window.removeEventListener("keydown", ouvir);
-  }, [ferramenta, noAtivoValido, peca, props]);
-
   return (
     <div ref={moldura} className="h-full overflow-auto bg-painel-suave">
       <canvas
```

- [ ] **Step 2: A MesaDeMontagem**

Aplicar em `src/telas/montagem/MesaDeMontagem.tsx` (o `mudarEsta` sobe para antes dos `return` antecipados, porque o adaptador do editor — um gancho — usa):

```diff
diff --git a/src/telas/montagem/MesaDeMontagem.tsx b/src/telas/montagem/MesaDeMontagem.tsx
index 964ed11..993b957 100644
--- a/src/telas/montagem/MesaDeMontagem.tsx
+++ b/src/telas/montagem/MesaDeMontagem.tsx
@@ -4,7 +4,7 @@
  * `useMoldeEmMontagem`; quem mexe na peça são as contas de
  * `motores/montagem.js`. Aqui só se liga uma coisa na outra.
  */
-import { useEffect, useMemo, useState } from "react";
+import { useEffect, useMemo, useRef, useState } from "react";
 import { Icone } from "../../casca/Icone";
 import { useMoldeEmMontagem, type PecaEmMontagem } from "./useMoldeEmMontagem";
 import { ChipsDeTamanho } from "./ChipsDeTamanho";
@@ -12,7 +12,9 @@ import { JanelaDaGrade } from "./JanelaDaGrade";
 import {
   ORIGEM_AJUSTADA, ORIGEM_GERADA, alinhamentoDaCamada, aplicarGeracao, gerarTamanho, graduacaoVazia, planejarGeracao, transladarNos,
 } from "../../motores/graduacao";
-import { pecaParaGravar } from "../../motores/montagem";
+import { apagarNosDaPeca, girarPeca, pecaParaGravar, porNosDaPeca, reduzirNosDaPeca } from "../../motores/montagem";
+import { BarraDosNos } from "../risco/BarraDosNos";
+import { useEditorDeNos, type AlvoDoEditor } from "../risco/useEditorDeNos";
 import { useDialogo } from "../../casca/Dialogo";
 import { JanelaDeSubstituir } from "./JanelaDeSubstituir";
 import type { Graduacao } from "../../api/moldes";
@@ -28,7 +30,7 @@ import { BarraDaMontagem } from "./BarraDaMontagem";
 interface Props { id: number; aoTrocar: () => void; aoEscolherOutro: (id: number) => void }
 
 const FERRAMENTAS: { qual: Ferramenta; rotulo: string; icone: string; dica: string }[] = [
-  { qual: "nos", rotulo: "Nós", icone: "icones.svg#spline", dica: "Arrastar nós e alças; dois cliques põem ou tiram nó" },
+  { qual: "nos", rotulo: "Nós", icone: "icones.svg#spline", dica: "Clique, Shift e retângulo selecionam; arraste nós, alças ou a curva; setas movem; dois cliques põem ou tiram nó" },
   { qual: "pique", rotulo: "Pique", icone: "icones.svg#scissors", dica: "Clique no traço para pôr um pique; num pique, para tirar" },
   { qual: "ponto", rotulo: "Ponto", icone: "icones.svg#crosshair", dica: "Clique dentro da peça para marcar pence ou bolso" },
   { qual: "fio", rotulo: "Fio", icone: "icones.svg#move-vertical", dica: "Arraste o meio para mover, uma ponta para girar" },
@@ -120,6 +122,51 @@ export function MesaDeMontagem({ id, aoTrocar, aoEscolherOutro }: Props) {
       })
     : []), [verTamanhos, doGrupo, peca, baseDoGrupo, molde.pecas, molde.tamanhos]);
 
+  // Mexer à mão num tamanho gerado tira dele a marca da graduação: gerar de
+  // novo passa a perguntar antes de perder o ajuste.
+  const mudarEsta = (mudar: Parameters<typeof molde.mudarPeca>[1], lembrarAntes: boolean) =>
+    molde.mudarPeca(atual, (p) => {
+      const q = mudar(p);
+      return p.origem === ORIGEM_GERADA ? { ...q, origem: ORIGEM_AJUSTADA } : q;
+    }, lembrarAntes);
+
+  // O editor estilo Corel da ferramenta Nós: piques e regras da graduação vão junto
+  // nas mexidas que mudam quantos nós há (ver `motores/montagem.js`).
+  const alvoDoEditor: AlvoDoEditor = {
+    nos: peca?.nos ?? [],
+    mudarNos: (mudar, lembrarAntes) => mudarEsta((p) => ({ ...p, nos: mudar(p.nos) }), lembrarAntes),
+    apagarNos: (indices) => {
+      if (!peca) return null;
+      const r = apagarNosDaPeca(peca, indices);
+      if (r.erro) return r.erro;
+      mudarEsta(() => r.peca, true);
+      return null;
+    },
+    porNos: (pontos) => mudarEsta((p) => porNosDaPeca(p, pontos), true),
+    retrato: () => peca,
+    reduzir: (retrato, indices, folga) => {
+      const r = reduzirNosDaPeca(retrato as PecaEmMontagem, indices, folga) as
+        { erro: string } | { peca: PecaEmMontagem; antes: number; depois: number };
+      if ("erro" in r) return { erro: r.erro };
+      return { antes: r.antes, depois: r.depois, aplicar: () => mudarEsta(() => r.peca, false) };
+    },
+    voltar: (retrato) => mudarEsta(() => retrato as PecaEmMontagem, false),
+    lembrar: molde.lembrar,
+    passos: { curto: 0.1, longo: 1 },
+    folgaEmUnidades: (mm) => mm / 10,
+    comMedida: true,
+  };
+  const editor = useEditorDeNos(alvoDoEditor, atual);
+  // O teclado do editor, pela referência mais nova: o ouvinte é posto uma vez só.
+  const editorAtual = useRef(editor);
+  editorAtual.current = editor;
+  useEffect(() => {
+    if (ferramenta !== "nos" || verTodas) return;
+    const ouvir = (e: KeyboardEvent) => { editorAtual.current.teclar(e); };
+    window.addEventListener("keydown", ouvir);
+    return () => window.removeEventListener("keydown", ouvir);
+  }, [ferramenta, verTodas]);
+
   useEffect(() => { setNoAtivo(null); }, [atual, ferramenta]);
 
   // O `indice` pode ficar velho depois de um desfazer ou de apagar peça: a
@@ -175,14 +222,6 @@ export function MesaDeMontagem({ id, aoTrocar, aoEscolherOutro }: Props) {
     );
   }
 
-  // Mexer à mão num tamanho gerado tira dele a marca da graduação: gerar de
-  // novo passa a perguntar antes de perder o ajuste.
-  const mudarEsta = (mudar: Parameters<typeof molde.mudarPeca>[1], lembrarAntes: boolean) =>
-    molde.mudarPeca(atual, (p) => {
-      const q = mudar(p);
-      return p.origem === ORIGEM_GERADA ? { ...q, origem: ORIGEM_AJUSTADA } : q;
-    }, lembrarAntes);
-
   /** Mexe na graduação da peça (na linha do base). */
   const mudarGraduacao = (mudar: (g: Graduacao) => Graduacao, lembrarAntes: boolean) => {
     if (iDaBase === undefined) return;
@@ -260,6 +299,9 @@ export function MesaDeMontagem({ id, aoTrocar, aoEscolherOutro }: Props) {
           {FERRAMENTAS.find((f) => f.qual === ferramenta)?.dica}. Roda do mouse aproxima.
         </span>
       </div>
+      {ferramenta === "nos" && !verTodas && !semDesenho && peca && (
+        <BarraDosNos editor={editor} aoGirar={(graus) => mudarEsta((p) => girarPeca(p, graus), true)} />
+      )}
       <ChipsDeTamanho
         tamanhos={molde.tamanhos}
         ativo={escolhido || peca?.tamanho || baseDaGrade}
@@ -314,6 +356,7 @@ export function MesaDeMontagem({ id, aoTrocar, aoEscolherOutro }: Props) {
             aoEscolherPeca={(i) => { setGrupo(doTamanho[i]?.p.grupo ?? 0); setVerTodas(false); }}
             aoLembrar={molde.lembrar}
             aoMudar={mudarEsta}
+            editor={editor}
           />
           )}
         </div>
```

- [ ] **Step 3: Tipos e build**

Run: `npm run tipos && npm run front`
Expected: OK.

- [ ] **Step 4: No navegador**

Com o servidor de teste (cópia do banco, sessão sem tokens), um molde com uma peça de arco (9 nós curvos por cima, três retas embaixo), ferramenta Nós:
- a barra mostra "11 nós"; o retângulo sobre o arco seleciona os 7 do meio; Shift+clique soma e tira; Esc limpa;
- três setas andam 3 mm e um Ctrl+Z desfaz as três;
- Simétrico num nó grava `simetrico` e, depois do F5, a barra mostra Simétrico apertado;
- puxar o meio de um trecho do arco leva o ponto até o ponteiro, com os nós parados; puxar a reta de baixo avisa "Trecho reto: converta em curva para dobrar.";
- Curva e Linha no trecho de baixo; Delete em três nós do arco e Ctrl+Z; Alinhar ↔ pelo último clicado; o controle do Reduzir leva o arco de 11 para 5 nós, e um Ctrl+Z desfaz; ↻ 90° gira;
- **Review Focus 4**: com três nós selecionados, abrir a janela da Grade e apertar Delete — nada é apagado;
- **Review Focus 5**: arrastar um nó e soltar fora do canvas — o próximo clique num nó seleciona só ele e não arrasta nada grudado.

- [ ] **Step 5: Commit**

```bash
git add src/telas/montagem/Mesa.tsx src/telas/montagem/MesaDeMontagem.tsx dist
git commit -m "A Montagem ganha o editor estilo Corel na ferramenta Nós, com a barra dos nós e o girar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: O Digitalizar liga o editor

**Files:**
- Modify: `src/telas/Digitalizar.tsx`

**Interfaces:**
- Consumes: `useEditorDeNos`, `BarraDosNos`, `desenharRetangulo` (Task 7); `apagarNos`, `porNosNoTraco`, `reduzirNos` (motor).
- Produces: o Digitalizar sem `noAtivo` nem `pegando`: a peça escolhida tem a vez; nó ou traço de outra peça troca de peça (a seleção começa de novo nela); a barra dos nós entra no lugar dos botões "lado que chega/sai".

- [ ] **Step 1: A tela**

Aplicar em `src/telas/Digitalizar.tsx`:

```diff
diff --git a/src/telas/Digitalizar.tsx b/src/telas/Digitalizar.tsx
index 286ec65..bd12037 100644
--- a/src/telas/Digitalizar.tsx
+++ b/src/telas/Digitalizar.tsx
@@ -5,7 +5,7 @@
  *
  * Larga-se a foto dos moldes na mesa (PNG, BMP, JPG), o sistema acha a volta
  * por fora de CADA peça e desenha os riscos em cima da foto. A pessoa corrige
- * o que quiser — arrastando nós e alças de curva —, mede as peças com a fita e
+ * o que quiser — com o editor estilo Corel, o mesmo da Montagem —, mede as peças com a fita e
  * diz quanto deu cada uma. Cada peça medida fica com a sua medida; a que ficar
  * sem medida segue a média das medidas, então medir uma só ainda basta.
  *
@@ -81,10 +81,11 @@ import {
 } from "../motores/moldeDaImagem";
 import { useErroEmAlerta } from "../casca/Alerta";
 import {
-  alternarLado as alternarLadoDosNos, apagarNo as apagarNoDosNos, clonarNos, inserirNoNoTraco,
-  moverPega, pegaSob, tracoSob,
+  apagarNos as apagarNosDoRisco, clonarNos, pegaSob, porNosNoTraco, reduzirNos, tracoSob,
 } from "../motores/edicaoDeNos";
-import { desenharNos, tracarCaminho } from "./risco/desenhoDeNos";
+import { desenharNos, desenharRetangulo, tracarCaminho } from "./risco/desenhoDeNos";
+import { BarraDosNos } from "./risco/BarraDosNos";
+import { useEditorDeNos, type AlvoDoEditor } from "./risco/useEditorDeNos";
 
 type Lado = "largura" | "altura";
 /** A medida de uma peça como a pessoa digitou: o lado e o texto do campo. */
@@ -98,8 +99,6 @@ function lerCm(texto: string): number | null {
 }
 type Ponto = { x: number; y: number };
 type No = { x: number; y: number; entrada: Ponto; saida: Ponto; canto?: boolean; retaDepois?: boolean };
-/** O que o ponteiro pegou: um nó, ou uma das alças dele. */
-type Pega = { peca: number; no: number; parte: "no" | "entrada" | "saida" };
 
 /** As cores dos riscos na prévia, para dar para falar "a peça verde". */
 const CORES = ["#ff7a1a", "#25c2a0", "#4d9dff", "#f45d9c", "#f5c518", "#9d7bff"];
@@ -131,8 +130,6 @@ export function Digitalizar() {
   const [medidas, setMedidas] = useState<MedidaDaPeca[]>([]);
   /** A peça escolhida: destacada na foto, com os nós à mostra. */
   const [qual, setQual] = useState(0);
-  /** O nó cujas alças estão à mostra. */
-  const [noAtivo, setNoAtivo] = useState<number | null>(null);
   const [zoom, setZoom] = useState(1);
   const [criando, setCriando] = useState(false);
   /** Um arquivo sendo arrastado por cima do cartão. */
@@ -141,8 +138,6 @@ export function Digitalizar() {
   const entrada = useRef<HTMLInputElement>(null);
   const tela = useRef<HTMLCanvasElement>(null);
   const moldura = useRef<HTMLDivElement>(null);
-  /** O que está sendo arrastado agora. `null` quando nada. */
-  const pegando = useRef<{ peca: number; no: number; parte: "no" | "entrada" | "saida" } | null>(null);
 
   // A caixa e a área saem da curva ACHATADA: mover uma alça muda a barriga da
   // curva sem mexer em nó nenhum, e a medida da peça tem que acompanhar isso.
@@ -180,6 +175,47 @@ export function Digitalizar() {
     });
   }, []);
 
+  /*
+   * O editor estilo Corel na peça escolhida (`risco/useEditorDeNos.ts`). As
+   * setas e o Reduzir andam em milímetros pela escala da peça — a medida dela,
+   * ou a média (ver a medida por peça); sem medida nenhuma ainda, em células.
+   */
+  const escalaDaPeca: number | null = emCm?.pecas[qual]?.porCelula ?? null;
+  const naEscolhida = (mudar: (nos: No[]) => No[]) =>
+    setEdicao((antes) => antes.map((c, p) => (p === qual ? mudar(c) : c)));
+  const alvoDoEditor: AlvoDoEditor = {
+    nos: edicao[qual] ?? [],
+    mudarNos: (mudar, lembrarAntes) => {
+      if (lembrarAntes) lembrar();
+      naEscolhida(mudar);
+    },
+    apagarNos: (indices) => {
+      const r = apagarNosDoRisco(edicao[qual] ?? [], indices) as { erro: string } | { nos: No[] };
+      if ("erro" in r) return r.erro;
+      lembrar();
+      naEscolhida(() => r.nos);
+      return null;
+    },
+    porNos: (pontos) => {
+      lembrar();
+      naEscolhida((nos) => porNosNoTraco(nos, pontos));
+    },
+    retrato: () => edicao[qual] ?? [],
+    reduzir: (retrato, indices, folga) => {
+      const r = reduzirNos(retrato as No[], indices, folga, []) as { erro: string } | { nos: No[]; antes: number; depois: number };
+      if ("erro" in r) return { erro: r.erro };
+      return { antes: r.antes, depois: r.depois, aplicar: () => naEscolhida(() => r.nos) };
+    },
+    voltar: (retrato) => naEscolhida(() => retrato as No[]),
+    lembrar,
+    passos: escalaDaPeca ? { curto: 0.1 / escalaDaPeca, longo: 1 / escalaDaPeca } : { curto: 1, longo: 10 },
+    folgaEmUnidades: (valor) => (escalaDaPeca ? valor / 10 / escalaDaPeca : valor),
+    comMedida: escalaDaPeca !== null,
+  };
+  const editor = useEditorDeNos(alvoDoEditor, qual);
+  const editorAtual = useRef(editor);
+  editorAtual.current = editor;
+
   /**
    * Reduz a foto à grade e procura os riscos.
    *
@@ -225,7 +261,6 @@ export function Digitalizar() {
           // o número de peças mudou, elas não valem mais para peça nenhuma.
           setMedidas((antes) => (antes.length === saida.riscos.length ? antes : []));
           setQual(0);
-          setNoAtivo(null);
         }
       } catch (e: any) {
         setAchado(null);
@@ -308,122 +343,50 @@ export function Digitalizar() {
     return caixa.width > 0 ? achado.cols / caixa.width : 1;
   };
 
-  /** O que está debaixo do ponteiro: alça do nó ativo, nó de qualquer peça, ou nada. */
-  const oQueEstaSob = (alvo: Ponto): Pega | null => {
-    const raio = PEGA * gradePorPixel();
-    let melhor: (Pega & { distancia: number }) | null = null;
-    edicao.forEach((nos, p) => {
-      const sob = pegaSob(nos, alvo, raio, p === qual ? noAtivo : null);
-      if (!sob) return;
-      // Alça ganha sempre (ver o motor); entre nós, o mais perto.
-      if (sob.parte !== "no") {
-        melhor = { peca: p, no: sob.no, parte: sob.parte as Pega["parte"], distancia: -1 };
-        return;
-      }
-      if (!melhor || sob.distancia < melhor.distancia) melhor = { peca: p, no: sob.no, parte: "no", distancia: sob.distancia };
-    });
-    return melhor;
-  };
-
-  /** Em que trecho de curva o ponteiro caiu, e em que `t`. */
-  const noTracoSob = (alvo: Ponto): { peca: number; no: number; t: number } | null => {
-    const raio = PEGA * gradePorPixel();
-    let melhor: { peca: number; no: number; t: number; distancia: number } | null = null;
-    edicao.forEach((nos, p) => {
-      const sob = tracoSob(nos, alvo, raio);
-      if (sob && (!melhor || sob.distancia < melhor.distancia)) melhor = { peca: p, ...sob };
-    });
+  /** A peça (outra que não a escolhida) com nó ou traço debaixo do ponteiro. */
+  const outraPecaSob = (alvo: Ponto, raio: number): number | null => {
+    let melhor: number | null = null;
+    let menor = Infinity;
+    for (let p = 0; p < edicao.length; p++) {
+      if (p === qual) continue;
+      const nos = edicao[p]!;
+      const sob = pegaSob(nos, alvo, raio, null) ?? tracoSob(nos, alvo, raio);
+      if (sob && sob.distancia < menor) { menor = sob.distancia; melhor = p; }
+    }
     return melhor;
   };
 
+  /**
+   * O aperto. A peça escolhida tem a vez (o editor decide: alça, nó, traço ou
+   * retângulo); fora dela, um nó ou traço de outra peça troca de peça, e a
+   * seleção começa de novo nela.
+   */
   const aoApertar = (e: React.PointerEvent<HTMLCanvasElement>) => {
     const alvo = naGrade(e);
     if (!alvo) return;
-    const sob = oQueEstaSob(alvo);
-    if (sob) {
-      setQual(sob.peca);
-      if (sob.parte === "no") setNoAtivo(sob.no);
-      lembrar();
-      pegando.current = sob;
-      e.currentTarget.setPointerCapture(e.pointerId);
-      return;
-    }
-    // Fora de nó e de alça: só escolhe a peça, se clicou perto do traço de uma.
-    const noTraco = noTracoSob(alvo);
-    if (noTraco) {
-      setQual(noTraco.peca);
-      setNoAtivo(null);
+    const raio = PEGA * gradePorPixel();
+    const escolhida = edicao[qual] ?? [];
+    if (!pegaSob(escolhida, alvo, raio, editor.selecionados) && !tracoSob(escolhida, alvo, raio)) {
+      const outra = outraPecaSob(alvo, raio);
+      if (outra !== null) { setQual(outra); return; }
     }
+    if (editor.apertar(alvo, raio, e.shiftKey)) e.currentTarget.setPointerCapture(e.pointerId);
   };
 
   const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
-    const pega = pegando.current;
-    if (!pega) return;
     const alvo = naGrade(e);
-    if (!alvo) return;
-    setEdicao((antes) => antes.map((nos, p) => (p === pega.peca ? moverPega(nos, pega, alvo) : nos)));
+    if (alvo) editor.mover(alvo);
   };
 
   const aoSoltar = (e: React.PointerEvent<HTMLCanvasElement>) => {
-    if (pegando.current) {
-      pegando.current = null;
-      e.currentTarget.releasePointerCapture?.(e.pointerId);
-    }
+    editor.soltar();
+    e.currentTarget.releasePointerCapture?.(e.pointerId);
   };
 
-  /**
-   * Apaga um nó.
-   *
-   * Num lugar só porque há dois caminhos até aqui — a tecla Delete e os dois
-   * cliques —, e os dois precisam do mesmo piso de três nós: com dois, não
-   * existe contorno para fechar.
-   */
-  const apagarNo = useCallback((peca: number, no: number) => {
-    const contorno = edicao[peca];
-    const novo = contorno ? apagarNoDosNos(contorno, no) : null;
-    if (!novo) {
-      setErro("A peça ficaria com menos de três nós; não dá para apagar mais.");
-      return;
-    }
-    lembrar();
-    setNoAtivo(null);
-    setEdicao((antes) => antes.map((c, p) => (p === peca ? novo : c)));
-  }, [edicao, lembrar]);
-
-  /**
-   * Troca um lado do nó entre reta e curva.
-   *
-   * `lado` é visto do nó: "depois" é o trecho até o nó seguinte, "antes" é o
-   * que vem do anterior. Quem guarda a informação é sempre o nó que COMEÇA o
-   * trecho, então mexer no lado "antes" mexe no nó anterior — é por isso que
-   * esta função existe em vez de a tela alterar o campo direto.
-   *
-   * Virando curva, as alças nascem a um terço do caminho, que é o palpite que o
-   * próprio ajuste usa: a curva começa idêntica à reta e só muda quando alguém
-   * arrasta. Virando reta, as alças desabam em cima dos nós.
-   */
-  const alternarLado = useCallback((peca: number, no: number, lado: "antes" | "depois") => {
-    lembrar();
-    setEdicao((antes) => antes.map((c, pp) => (pp === peca ? alternarLadoDosNos(c, no, lado) : c)));
-  }, [lembrar]);
-
-  /**
-   * Dois cliques: em cima de um nó, apaga; em cima do traço, põe um nó novo
-   * ali, sem mudar o desenho (ver `inserirNoNoTraco`, no motor).
-   */
+  /** Dois cliques: num nó, apaga; no traço, põe um nó ali sem mudar o desenho. */
   const aoDobrarClique = (e: React.MouseEvent<HTMLCanvasElement>) => {
     const alvo = naGrade(e);
-    if (!alvo) return;
-    const sob = oQueEstaSob(alvo);
-    if (sob && sob.parte === "no") {
-      apagarNo(sob.peca, sob.no);
-      return;
-    }
-    const noTraco = noTracoSob(alvo);
-    if (!noTraco) return;
-    lembrar();
-    setEdicao((antes) => antes.map((nos, p) => (p === noTraco.peca ? inserirNoNoTraco(nos, noTraco.no, noTraco.t) : nos)));
-    setNoAtivo(noTraco.no + 1);
+    if (alvo) editor.dobrarClique(alvo, PEGA * gradePorPixel());
   };
 
   /**
@@ -463,36 +426,23 @@ export function Digitalizar() {
   }, []);
 
   /*
-   * O teclado: Ctrl+Z desfaz, Delete e Backspace apagam o nó marcado.
-   *
-   * A conferência do campo em foco não é frescura: o Backspace é a tecla que a
-   * pessoa usa para corrigir a MEDIDA, e sem isto apagar um dígito errado
-   * apagaria também um nó do molde — um estrago silencioso, porque o traço
-   * muda longe de onde ela está olhando.
+   * O teclado: Ctrl+Z desfaz; Delete, setas, +, Ctrl+A e Esc são do editor
+   * (`teclar`), que não mexe em nada enquanto se digita num campo — o
+   * Backspace é a tecla que a pessoa usa para corrigir a MEDIDA, e sem isso
+   * apagar um dígito errado apagaria também um nó do molde.
    */
   useEffect(() => {
-    const digitando = () => {
-      const foco = document.activeElement;
-      if (!foco) return false;
-      const etiqueta = foco.tagName;
-      return etiqueta === "INPUT" || etiqueta === "TEXTAREA" || etiqueta === "SELECT"
-        || (foco as HTMLElement).isContentEditable;
-    };
     const ouvir = (e: KeyboardEvent) => {
       if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
         e.preventDefault();
         voltarUmPasso();
         return;
       }
-      if (e.key !== "Delete" && e.key !== "Backspace") return;
-      if (digitando()) return;
-      if (noAtivo === null) return;
-      e.preventDefault();
-      apagarNo(qual, noAtivo);
+      editorAtual.current.teclar(e);
     };
     window.addEventListener("keydown", ouvir);
     return () => window.removeEventListener("keydown", ouvir);
-  }, [voltarUmPasso, apagarNo, qual, noAtivo]);
+  }, [voltarUmPasso]);
 
   // A prévia: a foto por baixo, os riscos por cima, os nós da peça escolhida
   // por cima de tudo. É a conferência que a pessoa faz antes de confiar em
@@ -547,8 +497,9 @@ export function Digitalizar() {
     const escolhida = edicao[qual];
     if (!escolhida) return;
 
-    desenharNos(ctx, escolhida, noAtivo, emTela);
-  }, [imagem, achado, edicao, qual, noAtivo]);
+    desenharNos(ctx, escolhida, editor.selecionados, emTela);
+    if (editor.retangulo) desenharRetangulo(ctx, editor.retangulo.de, editor.retangulo.ate, emTela);
+  }, [imagem, achado, edicao, qual, editor.selecionados, editor.retangulo]);
 
   /*
    * O risco vira um molde-RASCUNHO na estante, e a tela passa para a
@@ -595,19 +546,6 @@ export function Digitalizar() {
 
   const nosDaEscolhida = edicao[qual]?.length ?? 0;
 
-  /*
-   * Como estão os dois lados do nó marcado.
-   *
-   * O lado que SAI é o `retaDepois` do próprio nó; o que CHEGA é o do nó
-   * anterior — quem guarda a informação é sempre quem começa o trecho.
-   */
-  const ladosDoNo = (() => {
-    const contorno = edicao[qual];
-    if (!contorno || noAtivo === null || !contorno[noAtivo]) return null;
-    const anterior = contorno[(noAtivo - 1 + contorno.length) % contorno.length]!;
-    return { antes: !!anterior.retaDepois, depois: !!contorno[noAtivo]!.retaDepois };
-  })();
-
   return (
     <>
       <div
@@ -695,37 +633,18 @@ export function Digitalizar() {
                 <div className="rounded-[10px] border border-linha bg-painel-suave p-3">
                   <p className="mt-0 mb-1 text-[0.85rem] font-semibold">Ajustar o traço à mão</p>
                   <p className="mt-0 mb-2 text-[0.8rem] text-tinta-fraca">
-                    A <strong>peça {qual + 1}</strong> tem {nosDaEscolhida} nós.{" "}
-                    <strong>Arraste</strong> um nó para mover; clique nele e arraste as{" "}
-                    <span className="text-[#4d9dff]">alças azuis</span> para mexer na curva.{" "}
-                    <strong>Clique</strong> num nó para marcá-lo e aperte{" "}
-                    <strong>Delete</strong> ou <strong>Backspace</strong> para apagar — ou{" "}
-                    <strong>dois cliques</strong> em cima dele. Dois cliques no traço põem um nó
-                    novo sem mudar o desenho. Cada lado do nó pode ser <strong>reta</strong> ou{" "}
-                    <strong>curva</strong>, e os botões acima trocam um sem mexer no outro — é o
-                    nó em que a lateral reta encontra a curva do gancho. Nó{" "}
-                    <strong>redondo</strong> é curva, <strong>quadrado</strong> é canto.{" "}
+                    A <strong>peça {qual + 1}</strong> tem {nosDaEscolhida} nós. É o editor do Corel:{" "}
+                    <strong>clique</strong> num nó para selecionar, <strong>Shift</strong> para somar,{" "}
+                    <strong>arraste numa área vazia</strong> para selecionar pelo retângulo; arraste os
+                    nós, as <span className="text-[#4d9dff]">alças azuis</span> ou o próprio{" "}
+                    <strong>traço</strong> para dobrar a curva; <strong>setas</strong> empurram (Shift, dez vezes
+                    mais); <strong>Delete</strong> apaga; <strong>dois cliques</strong> no traço põem um nó.
+                    Nó <strong>redondo</strong> é curva, <strong>quadrado</strong> é canto.{" "}
                     <strong>Roda do mouse</strong> aproxima onde o ponteiro está.
                   </p>
-                  {ladosDoNo && (
-                    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[8px] border border-linha bg-painel p-2">
-                      <span className="text-[0.8rem] font-semibold">Nó marcado:</span>
-                      {([
-                        ["antes", "lado que chega", ladosDoNo.antes],
-                        ["depois", "lado que sai", ladosDoNo.depois],
-                      ] as const).map(([lado, rotulo, ehReta]) => (
-                        <button
-                          key={lado}
-                          type="button"
-                          className="btn secondary"
-                          onClick={() => noAtivo !== null && alternarLado(qual, noAtivo, lado)}
-                          title={`Trocar o ${rotulo} entre reta e curva`}
-                        >
-                          {rotulo}: <strong className="ml-1">{ehReta ? "reta" : "curva"}</strong>
-                        </button>
-                      ))}
-                    </div>
-                  )}
+                  <div className="mb-2 overflow-hidden rounded-[8px] border border-linha bg-painel">
+                    <BarraDosNos editor={editor} />
+                  </div>
 
                   <div className="flex flex-wrap items-center gap-3">
                     <button
@@ -774,7 +693,7 @@ export function Digitalizar() {
                     {edicao.map((_, i) => {
                       const m = medidas[i] ?? MEDIDA_VAZIA;
                       const p = emCm?.pecas[i];
-                      const escolher = () => { setQual(i); setNoAtivo(null); };
+                      const escolher = () => setQual(i);
                       return (
                         <li
                           key={i}
```

- [ ] **Step 2: Tipos e build**

Run: `npm run tipos && npm run front`
Expected: OK.

- [ ] **Step 3: No navegador**

Com a `brenda.bmp` (7 peças): a barra aparece com "N nós" e, sem medida, o Reduzir diz "pouco ↔ muito"; Ctrl+A seleciona todos e Delete avisa "menos de três nós" sem apagar; Esc limpa; o retângulo seleciona nós da peça 1, Delete apaga e Ctrl+Z devolve; "Reduzir nós" reduz — ou, numa peça só de cantos e retas, avisa "Nada a reduzir"; com a medida da peça 1, o controle mostra "0,5 mm"; **Review Focus 2**: com Ctrl+A na peça 1, escolher a Peça 2 — a seleção começa de novo e a barra mostra os nós dela.

- [ ] **Step 4: Commit**

```bash
git add src/telas/Digitalizar.tsx dist
git commit -m "O Digitalizar ganha o editor estilo Corel e a barra dos nós

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: O mapa e o caminho inteiro

**Files:**
- Modify: `docs/MAPA.md` (a linha da Montagem)

- [ ] **Step 1: Todas as conferências**

Run: `npm run tipos && npm run front && npm run bancada:revisao && npm run bancada:nos && npm run bancada:montagem && npm run bancada:graduacao && npm run bancada:tamanhos && npm run bancada:moldes-pecas && npm run bancada:medida && npm run bancada:margem && npm run bancada:audaces`
Expected: tudo OK.

- [ ] **Step 2: O mapa**

Em `docs/MAPA.md`, na linha da **Montagem**, acrescentar à descrição "; o editor de nós estilo Corel, o mesmo do Digitalizar (selecionar vários, puxar a curva, converter, reduzir, girar)" e aos arquivos `src/telas/risco/useEditorDeNos.ts`, `src/telas/risco/BarraDosNos.tsx`.

- [ ] **Step 3: Commit**

```bash
git add docs/MAPA.md
git commit -m "O mapa ganha o editor estilo Corel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
