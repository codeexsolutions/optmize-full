# Linha em volta da peça — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um traço preto, da grossura escolhida para o molde todo (0–10 mm), centrado na borda de fora de cada peça, que sai impresso pelo Encaixe e no PDF/SVG do molde.

**Architecture:** A grossura mora no molde (`moldes.linha_mm`, lida e gravada pela API como `linha`, em mm). A Montagem a edita num campo da barra. Os desenhos recebem em **cm**: `desenhoDaPeca(peca, linhaCm)` leva a grossura ao SVG (feito na tela) e ao PDF (feito no servidor), que crescem a folha meia linha em cada borda; o envio ao Encaixe afasta o contorno meia linha (`pecaComLinha`) e desenha a arte recortada na borda de verdade com a linha por cima (`desenharArteNoMolde`), inclusive para peça sem arte.

**Tech Stack:** Node/Express + better-sqlite3 (servidor), React 19 + TypeScript (tela), pdfkit (PDF), bancadas em Node com `node:assert` (esbuild/jsdom onde já usam).

**Spec:** `docs/superpowers/specs/2026-09-30-linha-em-volta-da-peca-design.md`

## Global Constraints

- Branch `feature/encaixe-varios-tamanhos` (a spec pede a mesma branch do encaixe de vários tamanhos, depois dele).
- Faixa: **0 a 10 mm**; vazio ou 0 = sem linha; molde sem o campo (todos os de hoje) = 0, e com 0 **tudo sai exatamente como hoje**.
- Unidade: **mm** no banco (`moldes.linha_mm REAL NOT NULL DEFAULT 0`), na API (`linha`) e no campo da tela; **cm** em todo desenho (`linhaCm = linha / 10`).
- A linha é **preta**, **cheia**, **centrada** na borda de fora (com margem de costura, a linha de corte; sem margem, o risco), quinas em **miter com limite 2**. Os furos levam a linha também.
- Sem o campo `linha` num PUT, o servidor **mantém** a guardada (o jeito de `tamanhos`).
- Não mexer em `src/producao/controlador.js` nem em `src/producao/ligacao.ts`. A mesa da Montagem **não** mostra a linha.
- Cor: a linha usa a constante `COR_DA_LINHA = "#000000"` (tinta de impressão, não cor de tema); nenhuma outra cor escrita em hex fora de `estilo/tokens.css`.
- Texto da tela e comentários em português, no tom do código em volta (comentário diz o porquê).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Molde antigo, sem `linha`** (banco de antes, servidor antigo, payload de teste): lê 0 e sai tudo como hoje — no servidor (Tarefa 1), no carregar da Montagem e no envio ao Encaixe (Tarefas 2 e 4).
- **Texto estranho no campo** ("abc", "12", "-1", "0,5", vazio): só vale de 0 a 10, com vírgula; o resto deixa o campo marcado e não muda o molde (Tarefa 2).
- **Linha com margem de costura**: a linha vai na linha de corte, não no risco (Tarefa 3).
- **Peça encostada no canto do PDF/SVG com linha grossa**: a metade de fora não é cortada pela borda da folha (Tarefa 3).
- **Várias peças no SVG/PDF**: a folha cresce meia linha em cada borda uma vez só, não uma vez por peça (Tarefa 3).

---

## Arquivos

- **Muda** `servidor/db.js` — a coluna (Tarefa 1).
- **Muda** `servidor/moldes-pecas.js` — `lerLinha` (Tarefa 1).
- **Muda** `servidor/moldes-api.js` — POST/PUT/GET com `linha` (Tarefa 1).
- **Muda** `src/api/moldes.ts` — `Molde.linha`, `MoldeParaGravar.linha` (Tarefa 1).
- **Muda** `src/motores/montagem.js` — `lerLinhaMm` (Tarefa 2), `desenhoDaPeca`/`svgDaMontagem` (Tarefa 3), `COR_DA_LINHA` e `pecaComLinha` (Tarefa 4).
- **Muda** `src/telas/montagem/useMoldeEmMontagem.ts` — estado, desfazer e gravação da linha (Tarefa 2).
- **Muda** `src/telas/montagem/BarraDaMontagem.tsx` — o campo (Tarefa 2) e a linha no PDF/SVG (Tarefa 3).
- **Muda** `servidor/risco-pdf.js` — a linha no PDF (Tarefa 3).
- **Muda** `src/motores/arteMolde.js` — quinas da linha (Tarefa 4).
- **Muda** `src/telas/moldes/EnvioParaEncaixe.tsx` — o envio e a prévia com linha (Tarefa 4).
- **Bancadas**: `bancada/conferir-moldes-pecas.cjs`, `bancada/conferir-revisao-backend.cjs` (Tarefa 1); `bancada/conferir-montagem.mjs` (Tarefas 2–4); `bancada/conferir-risco-pdf.js` e `.github/workflows/conferir.yml` (Tarefa 3); `bancada/cenarios-do-envio.tsx` (Tarefa 4).

---

### Task 1: O servidor guarda a linha

**Files:**
- Modify: `servidor/db.js` (depois do bloco da Montagem, perto de `garantirColuna("moldes", "situacao", …)`)
- Modify: `servidor/moldes-pecas.js` (nova função, e o `module.exports` do fim)
- Modify: `servidor/moldes-api.js` (`router.get("/:id")`, `router.post("/")`, `router.put("/:id")`)
- Modify: `src/api/moldes.ts` (`interface Molde`, `interface MoldeParaGravar`)
- Test: `bancada/conferir-moldes-pecas.cjs`, `bancada/conferir-revisao-backend.cjs`

**Interfaces:**
- Produces:
  - `lerLinha(valor: unknown): number | null` em `servidor/moldes-pecas.js` — mm, arredondado a 0,1, limitado a 0–10; `null` quando não veio ou não é número.
  - API: `GET /api/moldes/:id` devolve `linha: number` (mm) e **não** devolve `linha_mm`; `POST` e `PUT` aceitam `linha` (mm); PUT sem `linha` mantém a guardada.
  - TS: `Molde.linha: number` (mm); `MoldeParaGravar.linha?: number`.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `bancada/conferir-moldes-pecas.cjs`, logo antes do `console.log("OK — …")` do fim:

```js
// 7. A linha em volta da peça, em mm: de 0 a 10, com um décimo. Não veio, ou não é número: `null` —
//    e o PUT mantém a guardada (ver `moldes-api.js`).
{
  const { lerLinha } = require("../servidor/moldes-pecas");
  assert.equal(lerLinha(2), 2);
  assert.equal(lerLinha("1.25"), 1.3);
  assert.equal(lerLinha(0), 0);
  assert.equal(lerLinha(99), 10);
  assert.equal(lerLinha(-3), 0);
  for (const nada of [undefined, null, "", "abc", Number.NaN]) assert.equal(lerLinha(nada), null, String(nada));
}
```

Em `bancada/conferir-revisao-backend.cjs`, logo depois da linha
`const molde = (await api("POST", "/api/moldes", { nome: "Molde", pecas: [peca] })).dados.id;`:

```js
  // A linha em volta da peça (docs/superpowers/specs/2026-09-30-linha-em-volta-da-peca-design.md):
  // molde sem o campo lê 0; gravada volta igual; PUT sem o campo mantém; fora de 0–10 é limitada.
  const semLinha = (await api("GET", `/api/moldes/${molde}`)).dados;
  const comLinha = (await api("POST", "/api/moldes", { nome: "Com linha", pecas: [peca], linha: 2.5 })).dados.id;
  const lidoComLinha = (await api("GET", `/api/moldes/${comLinha}`)).dados;
  await api("PUT", `/api/moldes/${comLinha}`, { nome: "Com linha", pecas: [peca] });
  const mantida = (await api("GET", `/api/moldes/${comLinha}`)).dados;
  await api("PUT", `/api/moldes/${comLinha}`, { nome: "Com linha", pecas: [peca], linha: 99 });
  const limitada = (await api("GET", `/api/moldes/${comLinha}`)).dados;
  await api("DELETE", `/api/moldes/${comLinha}`);
  conferir("a linha em volta da peça: 0 sem o campo, grava, PUT sem o campo mantém, limita a 10 mm", () => {
    assert.equal(semLinha.linha, 0);
    assert.equal(lidoComLinha.linha, 2.5);
    assert.equal(mantida.linha, 2.5);
    assert.equal(limitada.linha, 10);
    assert.equal("linha_mm" in lidoComLinha, false, "a tela recebe `linha`, não o nome da coluna");
  });
```

(O molde "Com linha" é apagado no fim do bloco para não mudar nenhuma contagem que a bancada faça depois.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:moldes-pecas`
Expected: FAIL — `lerLinha is not a function`.

Run: `node bancada/conferir-revisao-backend.cjs`
Expected: FAIL no "a linha em volta da peça" (`undefined !== 0`).

- [ ] **Step 3: A coluna**

Em `servidor/db.js`, logo depois de `garantirColuna("molde_pecas", "marcacoes", "TEXT");`:

```js

// A linha em volta da peça (docs/superpowers/specs/2026-09-30-linha-em-volta-da-peca-design.md):
// um traço preto, em mm, no molde todo. Os moldes que já existiam ficam sem linha.
garantirColuna("moldes", "linha_mm", "REAL NOT NULL DEFAULT 0");
```

- [ ] **Step 4: `lerLinha`**

Em `servidor/moldes-pecas.js`, logo depois de `function lerSituacao(…) { … }`:

```js
/**
 * A grossura da linha em volta da peça, em mm: de 0 a 10, com um décimo. `null` quando não veio
 * ou não é número — quem chama decide (o POST usa 0; o PUT mantém a guardada).
 */
function lerLinha(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
}
```

e no `module.exports` do fim, acrescentar `lerLinha`:

```js
module.exports = { PAPEIS, arrumarPeca, arrumarTamanhos, lerLinha, lerSituacao, pecaDoBanco };
```

- [ ] **Step 5: As rotas**

Em `servidor/moldes-api.js`:

(a) O `require` de `./moldes-pecas` passa a trazer `lerLinha`:

```js
const { PAPEIS, arrumarPeca, arrumarTamanhos, lerLinha, lerSituacao, pecaDoBanco } = require("./moldes-pecas");
```

(b) `router.get("/:id", …)` — trocar a linha do `res.json` por:

```js
  // A tela recebe `linha` (mm), e não o nome da coluna.
  const { linha_mm: linhaMm, ...resto } = molde;
  res.json({
    ...resto, linha: linhaMm ?? 0,
    pecas: pecasDoMolde(molde.id), tamanhos: tamanhosDoMolde(molde.id), artes: artesDoMolde(molde.id),
  });
```

(c) `router.post("/", …)` — o INSERT de `moldes` passa a ser:

```js
    const info = db.prepare(
      "INSERT INTO moldes (nome, observacoes, situacao, linha_mm, criado_em) VALUES (?, ?, ?, ?, ?)")
      .run(String(nome).trim(), String(observacoes || "").trim() || null, lerSituacao(situacao) || "pronto",
        lerLinha(req.body.linha) ?? 0, agora());
```

(d) `router.put("/:id", …)` — o UPDATE de `moldes` passa a ser:

```js
    // Sem `linha` no pedido (o passo a passo antigo, o Digitalizar), a guardada fica.
    db.prepare("UPDATE moldes SET nome = ?, observacoes = ?, situacao = ?, linha_mm = ?, atualizado_em = ? WHERE id = ?")
      .run(String(nome || molde.nome).trim(), String(observacoes || "").trim() || null,
        lerSituacao(situacao) || molde.situacao, lerLinha(req.body.linha) ?? molde.linha_mm ?? 0, agora(), molde.id);
```

- [ ] **Step 6: Os tipos da tela**

Em `src/api/moldes.ts`, na `interface Molde`, depois de `tamanhos: TamanhoDoMolde[];`:

```ts
  /** A linha preta em volta de cada peça, em mm (0 = sem). Ver a spec da linha em volta da peça. */
  linha: number;
```

e na `interface MoldeParaGravar`, depois de `tamanhos?: TamanhoDoMolde[];`:

```ts
  /** A linha em volta da peça, em mm. Sem o campo, o servidor mantém a guardada. */
  linha?: number;
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm run bancada:moldes-pecas && node bancada/conferir-revisao-backend.cjs && npm run tipos`
Expected: o OK da `moldes-pecas`; a `revisao-backend` com `ok   a linha em volta da peça: …` e sem falha; `tsc` sem erro. Se o `tsc` apontar um objeto `Molde` montado à mão sem `linha` (em teste ou tela), acrescente `linha: 0` nele e diga no relatório onde.

- [ ] **Step 8: Commit**

```bash
git add servidor/db.js servidor/moldes-pecas.js servidor/moldes-api.js src/api/moldes.ts bancada/conferir-moldes-pecas.cjs bancada/conferir-revisao-backend.cjs
git commit -F - <<'EOF'
O molde guarda a linha em volta da peça, em mm, de 0 a 10

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: A Montagem escolhe a linha

**Files:**
- Modify: `src/motores/montagem.js` (nova função `lerLinhaMm`, perto de `lerCm`)
- Modify: `src/telas/montagem/useMoldeEmMontagem.ts`
- Modify: `src/telas/montagem/BarraDaMontagem.tsx`
- Test: `bancada/conferir-montagem.mjs`

**Interfaces:**
- Consumes (Tarefa 1): `Molde.linha: number` (mm) no `moldesApi.abrir`; `MoldeParaGravar.linha?: number` no `moldesApi.regravar`.
- Produces:
  - `lerLinhaMm(texto: string): number | null` em `src/motores/montagem.js` — aceita vírgula; vazio = 0; fora de 0–10 ou não-número = `null`; arredonda a 0,1.
  - `MoldeEmMontagem.linha: number` (mm) e `MoldeEmMontagem.mudarLinha(mm: number): void` (um passo no desfazer, marca para gravar).

- [ ] **Step 1: Escrever o teste (falhando)**

Em `bancada/conferir-montagem.mjs`, logo depois do bloco `// 1. lerCm …` (as quatro linhas `assert.equal(m.lerCm(…))`):

```js
// 1b. lerLinhaMm: a linha em volta da peça, em mm, de 0 a 10, com vírgula; vazio é sem linha.
assert.equal(m.lerLinhaMm("0,5"), 0.5);
assert.equal(m.lerLinhaMm("2"), 2);
assert.equal(m.lerLinhaMm(" 10 "), 10);
assert.equal(m.lerLinhaMm(""), 0);
assert.equal(m.lerLinhaMm("1,25"), 1.3);
for (const ruim of ["abc", "12", "-1", "1,5,2"]) assert.equal(m.lerLinhaMm(ruim), null, ruim);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:montagem`
Expected: FAIL — `m.lerLinhaMm is not a function`.

- [ ] **Step 3: `lerLinhaMm`**

Em `src/motores/montagem.js`, logo depois de `export function lerCm(texto) { … }`:

```js
/**
 * A grossura da linha em volta da peça, como a pessoa escreve no campo: mm, com vírgula. Vazio é
 * "sem linha" (0). Fora de 0–10, ou o que não for número, é `null`: o campo fica marcado e o molde
 * não muda.
 */
export function lerLinhaMm(texto) {
  const t = String(texto ?? "").trim().replace(",", ".");
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n * 10) / 10;
}
```

Run: `npm run bancada:montagem`
Expected: `OK — as contas da Montagem conferem.`

- [ ] **Step 4: O estado da Montagem**

Em `src/telas/montagem/useMoldeEmMontagem.ts`:

(a) Na `interface MoldeEmMontagem`, depois de `tamanhos: TamanhoDoMolde[];`:

```ts
  /** A linha preta em volta de cada peça, em mm (0 = sem). Vale para o molde todo. */
  linha: number;
```

e depois de `renomear(nome: string): void;`:

```ts
  /** Muda a linha em volta da peça (mm): um passo no desfazer, e grava como as outras mexidas. */
  mudarLinha(mm: number): void;
```

(b) Os estados — depois de `const [tamanhos, setTamanhos] = useState<TamanhoDoMolde[]>([]);`:

```ts
  const [linha, setLinha] = useState(0);
```

e o tipo da pilha passa a guardar a linha junto (o desfazer de uma mudança de linha volta a linha):

```ts
  const [pilha, setPilha] = useState<{ pecas: PecaEmMontagem[]; tamanhos: TamanhoDoMolde[]; linha: number }[]>([]);
```

(c) O snapshot — as duas linhas de `atual` passam a ser:

```ts
  const atual = useRef({ nome, observacoes, pecas, tamanhos, linha, versao: 0 });
  atual.current = { nome, observacoes, pecas, tamanhos, linha, versao: versao.current };
```

(d) Na carga, depois de `setSituacao(m.situacao);`:

```ts
        // Molde de antes da linha (ou servidor antigo): sem o campo, é sem linha.
        setLinha(m.linha ?? 0);
```

(e) `lembrar` e `desfazer` levam a linha:

```ts
  // Peças, grade e linha: desfazer uma junção tira também o tamanho que ela criou.
  const lembrar = useCallback(() => {
    setPilha((p) => [...p.slice(-(PASSOS_DE_DESFAZER - 1)),
      { pecas: atual.current.pecas, tamanhos: atual.current.tamanhos, linha: atual.current.linha }]);
  }, []);

  const desfazer = useCallback(() => {
    setPilha((p) => {
      if (p.length === 0) return p;
      const topo = p[p.length - 1]!;
      setPecas(topo.pecas);
      setTamanhos(topo.tamanhos);
      setLinha(topo.linha);
      marcarMexida();
      return p.slice(0, -1);
    });
  }, []);
```

(f) Depois de `const renomear = useCallback(…)`:

```ts
  const mudarLinha = useCallback((mm: number) => {
    lembrar();
    setLinha(mm);
    marcarMexida();
  }, [lembrar]);
```

(g) Em `gravar`, a desestruturação do snapshot passa a trazer a linha:

```ts
    const { nome: nomeAgora, observacoes: obsAgora, pecas: pecasAgora, tamanhos: tamanhosAgora, linha: linhaAgora, versao: mandada } = atual.current;
```

e o corpo do `moldesApi.regravar(id, { … })` ganha, depois da linha de `tamanhos`:

```ts
      linha: linhaAgora,
```

(h) No `return { … }` do fim, acrescentar `linha` (junto de `tamanhos: tamanhosDasPecas`) e `mudarLinha` (junto de `renomear`).

- [ ] **Step 5: O campo na barra**

Em `src/telas/montagem/BarraDaMontagem.tsx`:

(a) Imports: `useEffect` junto de `useState` (`import { useEffect, useState } from "react";`) e `lerLinhaMm` no import de `../../motores/montagem`:

```tsx
import { arranjar, desenhoDaPeca, lerLinhaMm, pecaParaGravar, svgDaMontagem } from "../../motores/montagem";
```

(b) Dentro do componente, depois de `const [todos, setTodos] = useState(false);`:

```tsx
  // A linha em volta da peça, como texto: aceita vírgula, e só muda o molde no blur ou no Enter
  // (um número de três teclas não enche três passos do desfazer).
  const [linhaEscrita, setLinhaEscrita] = useState(String(molde.linha).replace(".", ","));
  useEffect(() => { setLinhaEscrita(String(molde.linha).replace(".", ",")); }, [molde.linha]);
  const linhaLida = lerLinhaMm(linhaEscrita);
  const confirmarLinha = () => {
    if (linhaLida !== null && linhaLida !== molde.linha) molde.mudarLinha(linhaLida);
  };
```

(c) No JSX, logo depois de `{molde.situacao === "rascunho" && <span className="etiqueta-tamanho">rascunho</span>}`:

```tsx
        <label
          className="flex items-center gap-1 text-[0.8rem] text-tinta-fraca"
          title="Traço preto em volta de cada peça, no Encaixe e no PDF/SVG. De 0 a 10 mm; 0 = sem linha."
        >
          Linha em volta (mm)
          <input
            type="text" inputMode="decimal" className="w-14!" aria-label="Linha em volta (mm)"
            value={linhaEscrita} aria-invalid={linhaLida === null}
            onChange={(e) => setLinhaEscrita(e.target.value)}
            onBlur={confirmarLinha}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </label>
```

- [ ] **Step 6: Rodar tudo e commit**

Run: `npm run bancada:montagem && npm run tipos && node bancada/conferir-revisao-front.cjs`
Expected: os OKs; `tsc` sem erro; a revisão do front passa (ela monta a Montagem com um molde de teste sem `linha` — tem que continuar abrindo).

```bash
git add src/motores/montagem.js src/telas/montagem/useMoldeEmMontagem.ts src/telas/montagem/BarraDaMontagem.tsx bancada/conferir-montagem.mjs
git commit -F - <<'EOF'
A Montagem escolhe a linha em volta da peça, em mm, na barra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: A linha no PDF e no SVG

**Files:**
- Modify: `src/motores/montagem.js` (`desenhoDaPeca`, `svgDaMontagem`)
- Modify: `servidor/risco-pdf.js` (`lerPecas`, `medir`, `desenharPdf`)
- Modify: `src/telas/montagem/BarraDaMontagem.tsx` (`desenhos`)
- Modify: `.github/workflows/conferir.yml` (passo "Moldes e tamanhos")
- Test: `bancada/conferir-montagem.mjs`, `bancada/conferir-risco-pdf.js`

**Interfaces:**
- Consumes (Tarefa 2): `molde.linha` (mm) em `BarraDaMontagem`.
- Produces:
  - `desenhoDaPeca(peca, linhaCm = 0)` — o desenho ganha o campo `linha: number` (cm; 0 = sem). A mesa (`Mesa.tsx`) continua chamando sem o segundo argumento.
  - `svgDaMontagem(arranjados, nome)` — com alguma peça de `linha > 0`: a folha cresce `max(linha)/2` em cada borda, todo o desenho é deslocado por esse valor, e o `<path>` do corte daquela peça leva `stroke-width` = linha, `stroke-linejoin="miter"`, `stroke-miterlimit="2"`.
  - PDF (`POST /api/risco/pdf`): cada peça aceita `linha` (cm, 0 a 1); a página cresce e o desenho se desloca do mesmo jeito; o corte sai com `lineWidth = linha`.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `bancada/conferir-montagem.mjs`, logo depois do bloco `// 12. SVG: …`:

```js
// 12b. A linha em volta da peça: o desenho leva a grossura (cm); o SVG cresce meia linha em cada
//      borda UMA vez (não por peça), e o corte sai com a grossura, quinas vivas.
{
  const d = m.desenhoDaPeca(m.pecaParaGravar(pecaQuadrada()).peca, 0.4);
  assert.equal(d.linha, 0.4);
  assert.equal(m.desenhoDaPeca(m.pecaParaGravar(pecaQuadrada()).peca).linha, 0, "sem o argumento, sem linha");
  const svg = m.svgDaMontagem(m.arranjar([d, d]), "camisa");
  assert.match(svg, /width="22\.4cm"/, "22 cm das duas peças com a folga, mais meia linha de cada lado");
  assert.match(svg, /height="10\.4cm"/);
  assert.match(svg, /<path d="M0\.2 0\.2 [^"]*" stroke-width="0\.4" stroke-linejoin="miter" stroke-miterlimit="2"\/>/);
  // Com margem de costura, a linha vai no CORTE (o contorno de fora), e a costura continua tracejada.
  const p = pecaQuadrada();
  p.marcacoes = { ...p.marcacoes, margem: 1 };
  const comMargem = m.desenhoDaPeca(m.pecaParaGravar(p).peca, 0.4);
  assert.equal(comMargem.linha, 0.4);
  assert.equal(comMargem.corte.length, 4);
  assert.ok(comMargem.corte.some((q) => perto(q, { x: 12, y: 12 })), "o corte é o contorno de 12 cm");
  // Sem linha, o SVG é o de sempre.
  const semLinha = m.desenhoDaPeca(m.pecaParaGravar(pecaQuadrada()).peca);
  const svgSem = m.svgDaMontagem(m.arranjar([semLinha, semLinha]), "camisa");
  assert.match(svgSem, /width="22cm"/);
  assert.ok(!svgSem.includes("stroke-linejoin"), "sem linha, nada muda no corte");
}
```

Em `bancada/conferir-risco-pdf.js`, logo antes do `console.log("OK — …")`:

```js
  // 6. A linha em volta da peça (cm): a página cresce meia linha em cada borda, o desenho se
  //    desloca, e o corte sai com a grossura. Fora de 0–1 cm: o teto; texto ou negativo: sem linha.
  const comLinha = await gerar({ pecas: [{ emX: 0, emY: 0, corte: quadrado(10), linha: 0.4 }] });
  assert.ok(Math.abs(comLinha.largura - 10.4) < 1e-9, `largura ${comLinha.largura}`);
  assert.ok(Math.abs(comLinha.altura - 10.4) < 1e-9);
  const grossuras = [...comLinha.texto.matchAll(/([\d.]+) w\b/g)].map((x) => Number(x[1]));
  assert.ok(grossuras.some((w) => Math.abs(w - 0.4 * PT_POR_CM) < 0.01), `grossuras ${grossuras}`);
  const lida = lerPecas({ pecas: [{ emX: 0, emY: 0, corte: quadrado(10), linha: 0.4 }] });
  assert.deepEqual({ x: lida.pecas[0].corte[0].x, y: lida.pecas[0].corte[0].y }, { x: 0.2, y: 0.2 });
  assert.equal(lerPecas({ pecas: [{ corte: quadrado(10), linha: 5 }] }).pecas[0].linha, 1);
  for (const ruim of ["abc", -2, null]) assert.equal(lerPecas({ pecas: [{ corte: quadrado(10), linha: ruim }] }).pecas[0].linha, 0);
  const semLinha = await gerar({ pecas: [{ emX: 0, emY: 0, corte: quadrado(10) }] });
  assert.equal(semLinha.largura, 10, "sem linha, a página é a de sempre");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:montagem`
Expected: FAIL em `d.linha` (`undefined !== 0.4`).

Run: `npm run bancada:risco-pdf`
Expected: FAIL em `largura 10` (a página não cresceu).

- [ ] **Step 3: `desenhoDaPeca` e `svgDaMontagem`**

Em `src/motores/montagem.js`:

(a) A assinatura e o comentário de `desenhoDaPeca`:

```js
/**
 * O que se desenha de uma peça no PDF, no SVG e na mesa.
 *
 * Tudo sai daqui, e os três só pintam: se o PDF e o SVG calculassem cada um o
 * seu pique, um dia um deles o poria do lado de dentro.
 *
 * Aceita peça gravada (encostada no canto) ou peça em edição — é por isso que
 * o texto se centra pela caixa do contorno, e não por `largura / 2`.
 *
 * `linhaCm`: a linha preta em volta da peça, centrada no corte (o PDF e o SVG a
 * pintam; a mesa não passa nada, e fica sem).
 */
export function desenhoDaPeca(peca, linhaCm = 0) {
```

e no objeto devolvido, depois de `altura: peca.altura,`:

```js
    linha: linhaCm > 0 ? linhaCm : 0,
```

(b) Em `svgDaMontagem`, trocar o começo até o `for` das peças por:

```js
export function svgDaMontagem(arranjados, nome = "molde") {
  // A linha em volta é centrada no corte: meia linha fica FORA da peça. A folha cresce isso em cada
  // borda (uma vez, pela maior linha) e tudo se desloca para dentro, senão a borda cortaria o traço.
  const borda = Math.max(0, ...arranjados.map((d) => (d.linha > 0 ? d.linha / 2 : 0)));
  let largura = 0;
  let altura = 0;
  for (const d of arranjados) {
    largura = Math.max(largura, d.emX + d.largura);
    altura = Math.max(altura, d.emY + d.altura);
  }
  largura += 2 * borda;
  altura += 2 * borda;
  const linha = (a, b, dx, dy) => `<line x1="${casas(a.x + dx)}" y1="${casas(a.y + dy)}" x2="${casas(b.x + dx)}" y2="${casas(b.y + dy)}"/>`;
  const corte = []; const costura = []; const piques = []; const pontos = []; const fio = []; const textos = [];
  for (const d of arranjados) {
    const dx = d.emX + borda;
    const dy = d.emY + borda;
    corte.push(d.linha > 0
      ? `<path d="${caminhoDosNos(d.corte, dx, dy)}" stroke-width="${casas(d.linha)}" stroke-linejoin="miter" stroke-miterlimit="2"/>`
      : `<path d="${caminhoDosNos(d.corte, dx, dy)}"/>`);
```

(o resto do laço continua igual, usando `dx`/`dy`; a linha antiga `const { emX: dx, emY: dy } = d;` sai, e a antiga `corte.push(\`<path d="${caminhoDosNos(d.corte, dx, dy)}"/>\`);` também — substituídas acima.)

Run: `npm run bancada:montagem`
Expected: `OK — as contas da Montagem conferem.`

- [ ] **Step 4: O PDF**

Em `servidor/risco-pdf.js`:

(a) Logo antes de `function lerPecas(corpo) {`:

```js
/** A linha em volta da peça, em cm (a Montagem manda o mm ÷ 10): de 0 a 1. Texto ou negativo: sem linha. */
function lerLinha(valor) {
  const n = numero(valor);
  if (!(n > 0)) return 0;
  return Math.min(1, n);
}
```

(Se `numero` devolver `null`/`NaN` para texto, `!(n > 0)` já cobre.)

(b) Em `lerPecas`, antes do `for` das peças:

```js
  // Meia linha fica FORA da peça: todas se deslocam isso para dentro da página (ver `medir`).
  const borda = Math.max(0, ...cruas.map((c) => lerLinha(c && c.linha) / 2));
```

e, dentro do `for`, trocar as duas linhas de `emX`/`emY` por:

```js
    const emX = (numero(crua.emX) || 0) + borda;
    const emY = (numero(crua.emY) || 0) + borda;
```

e o `pecas.push(…)` por:

```js
    pecas.push({ corte, costura, piques, pontos, fio, texto, linha: lerLinha(crua.linha) });
```

(c) Em `medir`, trocar o `return { largura, altura };` por:

```js
  // A página cresce a meia linha da borda de baixo e da direita (a de cima e a da esquerda já
  // entraram no deslocamento de `lerPecas`).
  const borda = Math.max(0, ...pecas.map((p) => (p.linha > 0 ? p.linha / 2 : 0)));
  return { largura: largura + borda, altura: altura + borda };
```

(d) Em `desenharPdf`, trocar a linha `doc.lineWidth(0.05 * PT_POR_CM).undash();` (a do corte) por:

```js
      // Com a linha em volta, o corte sai na grossura dela, quinas vivas; sem, o traço fino de gabarito.
      if (p.linha > 0) doc.lineWidth(p.linha * PT_POR_CM).lineJoin("miter").miterLimit(2).undash();
      else doc.lineWidth(0.05 * PT_POR_CM).undash();
```

Run: `npm run bancada:risco-pdf`
Expected: `OK — o PDF do risco sai no tamanho do corte, no corpo antigo e no da Montagem.`

- [ ] **Step 5: A barra manda a linha, e o PDF do risco entra no CI**

Em `src/telas/montagem/BarraDaMontagem.tsx`, na função `desenhos`, trocar `.map((p) => desenhoDaPeca(pecaParaGravar(p).peca)));` por:

```tsx
    .map((p) => desenhoDaPeca(pecaParaGravar(p).peca, molde.linha / 10)));
```

Em `.github/workflows/conferir.yml`, no passo "Moldes e tamanhos", acrescentar ` && npm run bancada:risco-pdf` ao fim do `run:`.

Run: `npm run tipos && npm run bancada:montagem && npm run bancada:risco-pdf`
Expected: sem erro, e os dois OKs.

- [ ] **Step 6: Commit**

```bash
git add src/motores/montagem.js servidor/risco-pdf.js src/telas/montagem/BarraDaMontagem.tsx .github/workflows/conferir.yml bancada/conferir-montagem.mjs bancada/conferir-risco-pdf.js
git commit -F - <<'EOF'
A linha em volta da peça sai no PDF e no SVG do molde, com a folha crescendo meia linha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: A linha no Encaixe

**Files:**
- Modify: `src/motores/montagem.js` (`COR_DA_LINHA`, `pecaComLinha`)
- Modify: `src/motores/arteMolde.js` (`desenharArteNoMolde`, o bloco `if (opcoes.linha)`)
- Modify: `src/telas/moldes/EnvioParaEncaixe.tsx` (o envio em `mandarParaOEncaixe`, e a prévia em `ParteComArte`)
- Test: `bancada/conferir-montagem.mjs`, `bancada/cenarios-do-envio.tsx`

**Interfaces:**
- Consumes (Tarefa 1): `Molde.linha: number` (mm) — pode faltar num molde de servidor antigo: ler como `molde.linha ?? 0`.
- Produces:
  - `COR_DA_LINHA = "#000000"` (tinta de impressão, não cor de tema).
  - `pecaComLinha(peca, linhaCm)` — com `linhaCm > 0`: contorno afastado `linhaCm/2` (`margemDeCostura`) e deslocado `+linhaCm/2` (fica de 0 a largura+linha), furos deslocados `+linhaCm/2`, `largura`/`altura` + `linhaCm`; com 0 ou menos, a própria peça.
  - `desenharArteNoMolde(…, opcoes)` — quando desenha a linha, quinas em miter com limite 2.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `bancada/conferir-montagem.mjs`, logo depois do bloco `// 12b. …` da Tarefa 3:

```js
// 12c. pecaComLinha: a peça como vai ao Encaixe com linha em volta — o contorno afastado meia linha,
//      tudo de novo encostado no canto, a caixa uma linha inteira maior. Sem linha, a mesma peça.
{
  const furo = [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }];
  const peca = { papel: "frente", largura: 10, altura: 10, contorno: quadrado, furos: [furo], quantidade: 1 };
  const r = m.pecaComLinha(peca, 0.4);
  assert.equal(r.largura, 10.4);
  assert.equal(r.altura, 10.4);
  const xs = r.contorno.map((q) => q.x);
  const ys = r.contorno.map((q) => q.y);
  assert.ok(Math.abs(Math.min(...xs)) < 1e-6 && Math.abs(Math.max(...xs) - 10.4) < 1e-6, `x ${xs}`);
  assert.ok(Math.abs(Math.min(...ys)) < 1e-6 && Math.abs(Math.max(...ys) - 10.4) < 1e-6, `y ${ys}`);
  assert.ok(perto(r.furos[0][0], { x: 4.2, y: 4.2 }), "o furo anda junto");
  assert.equal(m.pecaComLinha(peca, 0), peca);
  assert.equal(m.COR_DA_LINHA, "#000000");
}
```

Em `bancada/cenarios-do-envio.tsx`, logo depois do cenário `"janela 6"` (o último `cenariosDaTela.push`):

```tsx
// J. 7 — com linha em volta (2 mm), a peça sem arte vai DESENHADA (silhueta + linha), com a caixa
//        1 linha maior e o contorno afastado; sem linha (o molde de sempre), nada muda.
cenariosDaTela.push(["janela 7", async () => {
  const f = ligacaoFalsa();
  const desmontar = await montar(
    <ProvedorDeDialogo>
      <ProvedorDaLigacao value={f.ligacao}>
        <EnvioParaEncaixe molde={{ ...moldeDoPijama, linha: 2 }} aoFechar={() => {}} aoRecarregar={() => {}} />
      </ProvedorDaLigacao>
    </ProvedorDeDialogo>,
  );
  try {
    await digitar(campo("sem estampa P"), "1");
    await mandar();
    const frente = f.recebidos[0].pecas[0];
    assert.ok(frente.desenho, "com linha, a peça sem arte vai desenhada");
    assert.ok(Math.abs(frente.largura - 10.2) < 1e-9, `largura ${frente.largura}`);
    assert.ok(Math.abs(frente.altura - 20.2) < 1e-9, `altura ${frente.altura}`);
    const xs = frente.contorno.map((q: Qualquer) => q.x);
    assert.ok(Math.min(...xs) > -1e-6 && Math.abs(Math.max(...xs) - 10.2) < 1e-6, `x ${xs}`);
    assert.ok(Math.abs(frente.desenho.pxW / frente.desenho.ppcm - 10.2) < 0.05, "a imagem tem a caixa da peça com a linha");
  } finally {
    await desmontar();
  }

  // O molde de sempre (sem `linha`): a peça sem arte continua indo só como contorno, como hoje.
  const g = ligacaoFalsa();
  const j = await abrirJanela(g.ligacao);
  try {
    await digitar(campo("sem estampa P"), "1");
    await mandar();
    assert.equal(g.recebidos[0].pecas[0].desenho, undefined);
    assert.equal(g.recebidos[0].pecas[0].largura, 10);
  } finally {
    await j.desmontar();
  }
}]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:montagem`
Expected: FAIL — `m.pecaComLinha is not a function`.

Run: `npm run bancada:envio`
Expected: FAIL em "janela 7" ("com linha, a peça sem arte vai desenhada").

- [ ] **Step 3: `COR_DA_LINHA` e `pecaComLinha`**

Em `src/motores/montagem.js`, logo depois de `export function pecasParaOEncaixe(pecas) { … }`:

```js
/** A linha em volta da peça é tinta de impressão, não cor de tema: preta sempre. */
export const COR_DA_LINHA = "#000000";

/**
 * A peça como o Encaixe a recebe quando o molde tem linha em volta.
 *
 * Metade da linha fica FORA da peça, então a peça impressa é maior: o contorno é
 * afastado meia linha (a mesma conta da margem de costura) e tudo volta a ficar
 * encostado no canto — no mesmo lugar em que `desenharArteNoMolde`, com
 * `margem` de meia linha, põe a peça na imagem. A caixa cresce uma linha
 * inteira. É isso que faz o Encaixe reservar o espaço do traço.
 */
export function pecaComLinha(peca, linhaCm) {
  if (!(linhaCm > 0)) return peca;
  const meia = linhaCm / 2;
  const mover = (p) => ({ x: arredondar(p.x + meia), y: arredondar(p.y + meia) });
  const afastado = margemDeCostura(peca.contorno, meia) ?? peca.contorno;
  return {
    ...peca,
    contorno: afastado.map(mover),
    furos: (peca.furos || []).map((f) => f.map(mover)),
    largura: arredondar(peca.largura + linhaCm, 2),
    altura: arredondar(peca.altura + linhaCm, 2),
  };
}
```

Se o teste `12c` falhar só no limite do contorno (ex.: `Math.min(...xs)` um pouco negativo), é o afastamento da `margemDeCostura` saindo além da meia linha numa quina; confira com `console.log(r.contorno)` e diga no relatório o que achou antes de mudar a conta.

Run: `npm run bancada:montagem`
Expected: `OK — as contas da Montagem conferem.`

- [ ] **Step 4: Quinas da linha**

Em `src/motores/arteMolde.js`, no fim de `desenharArteNoMolde`, o bloco da linha passa a ser:

```js
  if (opcoes.linha) {
    caminho();
    ctx.strokeStyle = opcoes.linha;
    ctx.lineWidth = opcoes.linhaGrossura || 1.5;
    // Quina de molde fica quina, mas sem espeto comprido nos ângulos fechados.
    ctx.lineJoin = "miter";
    ctx.miterLimit = 2;
    ctx.stroke();
  }
```

- [ ] **Step 5: O envio e a prévia**

Em `src/telas/moldes/EnvioParaEncaixe.tsx`:

(a) Imports: `COR_DA_LINHA` e `pecaComLinha` no import de `../../motores/montagem`, e `corDaPeca`:

```tsx
import { COR_DA_LINHA, pecaComLinha, pecasParaOEncaixe } from "../../motores/montagem";
import { corDaPeca } from "../../utils/coresDePeca";
```

(b) Perto do começo do componente (junto de `const colunas = …`):

```tsx
  // A linha em volta da peça, em cm. Molde de servidor antigo não traz o campo: sem linha.
  const linhaCm = (molde.linha ?? 0) / 10;
```

(c) Em `mandarParaOEncaixe`, trocar o bloco `const comArte = celula.pecas.map((peca) => { … });` por:

```tsx
        // A arte grande só é desenhada agora, na hora de mandar. Com linha em volta, TODA peça vai
        // desenhada — a sem arte também (a silhueta pintada e a linha): se ela fosse só contorno, o
        // Encaixe a pintaria sozinho, sem o traço.
        const comArte = celula.pecas.map((peca, k) => {
          const arte = artesDaCelula[peca.papel];
          if (!arte && !(linhaCm > 0)) return { ...peca, estampa };
          const ppcm = ppcmDaArte(peca.largura + linhaCm, peca.altura + linhaCm, alvo);
          const desenho = desenharArteNoMolde(
            { contorno: peca.contorno, furos: peca.furos || [], largura: peca.largura, altura: peca.altura },
            arte ? arte.img : null, arte ? arte.ajuste : null, ppcm,
            {
              // A peça fica meia linha para dentro da imagem: é onde `pecaComLinha` põe o contorno.
              margem: (linhaCm / 2) * ppcm,
              ...(linhaCm > 0 ? { linha: COR_DA_LINHA, linhaGrossura: linhaCm * ppcm } : {}),
              ...(arte ? {} : { fundo: corDaPeca(k) }),
            });
          return { ...pecaComLinha(peca, linhaCm), desenho, ...(arte ? { arte: arte.nome } : {}), estampa };
        });
```

(Com `linhaCm = 0` e arte, é exatamente a chamada de antes: `margem: 0`, sem `linha`, sem `fundo`.)

(d) A prévia — `ParteComArte` ganha a prop `linhaCm`. Na assinatura:

```tsx
function ParteComArte({ peca, arte, linhaCm, aoMandarArte, aoMexer, aoTirar }: {
  peca: PecaDoMolde;
  arte: ArteNaMao | undefined;
  /** A linha em volta da peça, em cm (0 = sem): a prévia a mostra na grossura de verdade. */
  linhaCm: number;
  aoMandarArte: (arquivo: File) => void;
  aoMexer: (mudanca: Partial<AjusteDaArte>) => void;
  aoTirar: () => void;
}) {
```

e o `useMemo` da prévia passa a ser:

```tsx
  const previa = useMemo(() => {
    const ppcm = LADO_DA_PREVIA / Math.max(peca.largura + linhaCm, peca.altura + linhaCm, 1);
    return desenharArteNoMolde(
      { contorno: peca.contorno, furos: peca.furos || [], largura: peca.largura, altura: peca.altura },
      arte ? arte.img : null,
      arte ? arte.ajuste : null,
      ppcm,
      linhaCm > 0
        ? {
          fundo: arte ? null : "rgba(140, 152, 158, 0.22)",
          margem: (linhaCm / 2) * ppcm,
          linha: COR_DA_LINHA,
          linhaGrossura: Math.max(1, linhaCm * ppcm),
        }
        : {
          fundo: arte ? null : "rgba(140, 152, 158, 0.22)",
          linha: "rgba(226, 236, 240, 0.9)",
          linhaGrossura: 1,
        },
    ).src;
  }, [peca, arte, linhaCm, ajuste.tipo, ajuste.modo, ajuste.escala, ajuste.giro, ajuste.x, ajuste.y]);
```

e no `<ParteComArte … />` do JSX, depois de `arte={artes[peca.papel]}`:

```tsx
                  linhaCm={linhaCm}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm run bancada:montagem && npm run bancada:envio && npm run tipos && node bancada/conferir-revisao-front.cjs`
Expected: os OKs (os cenários "janela 1" a "janela 7" passando), `tsc` sem erro, revisão do front passando.

- [ ] **Step 7: Commit**

```bash
git add src/motores/montagem.js src/motores/arteMolde.js src/telas/moldes/EnvioParaEncaixe.tsx bancada/conferir-montagem.mjs bancada/cenarios-do-envio.tsx
git commit -F - <<'EOF'
A linha em volta da peça vai ao Encaixe: a peça cresce meia linha e sai desenhada, com arte ou sem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Conferência completa

**Files:** nenhum novo; só verificação (e correção, se algo aparecer).

- [ ] **Step 1: Rodar tudo o que o CI roda**

```bash
npm run tipos && for s in revisao conferir encolher complemento folga conferencia tamanhos moldes-pecas montagem graduacao nos editor envio risco-pdf medida; do npm run -s bancada:$s || { echo "FALHOU: $s"; break; }; done
```

Expected: cada bancada imprime o seu "OK — …" e nenhum "FALHOU".

- [ ] **Step 2: Na tela do app (para a pessoa conferir)**

Num molde com uma peça com arte e outra sem: na Montagem, "Linha em volta (mm)" = 2; Ctrl+Z volta para o valor anterior; baixar o PDF e o SVG (a borda sai grossa, sem ser cortada na beira da folha); Encaixar → Arte e encaixe (a prévia mostra a linha) → mandar; no Encaixe, as duas peças com o traço, e a sem arte com a silhueta pintada. Com a linha em 0, tudo como antes.
