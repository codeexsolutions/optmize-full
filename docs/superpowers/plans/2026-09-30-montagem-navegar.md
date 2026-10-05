# Montagem — navegar e ver: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na mesa da Montagem, a peça abre inteira (largura e altura), a vista se arrasta com espaço ou botão do meio, e as teclas do jeito do Corel trocam ferramenta, peça, tamanho e zoom — com os mesmos comandos em botões na barra.

**Architecture:** As contas (enquadrar, zoom ancorado, vizinho numa lista, qual tecla faz o quê, "o foco é de escrever?") ficam puras em `src/telas/montagem/navegacao.ts`. A vista sai de `Mesa.tsx` para o gancho `useVistaDaMesa.ts` (medida da caixa, zoom, enquadrar, roda, F2/F3, arrastar a vista); a Mesa entrega os comandos dele à tela de cima por uma referência. As teclas ficam num gancho `useTeclasDaMontagem.ts`, ligado em `MesaDeMontagem.tsx`, que também ganha a barra com a tecla de cada ferramenta, "‹ peça N de M ›", "− N% +" e "Enquadrar".

**Tech Stack:** React 19 + TypeScript; bancadas em Node com `node:assert`, esbuild e jsdom (o jeito de `bancada/conferir-editor-de-nos.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-30-montagem-navegar-design.md`

## Global Constraints

- Branch `feature/montagem-navegar`.
- O modelo da mesa fica: canvas dentro de uma caixa com rolagem, zoom = largura do canvas em % da caixa. O ponteiro → cm (`noCm`), o raio de pega e o desenho não mudam.
- Enquadrar: `zoomQueCabe = min(1, (H · l) / (W · a))` (caixa `W×H`, vista `l×a` em cm). Zoom mínimo `min(zoomQueCabe, 1)`; máximo 12. Canvas menor que a caixa fica no meio (nos dois eixos).
- Enquadra sozinho ao trocar de peça, de tamanho, ao entrar/sair do Ver todas e ao abrir; trocar de ferramenta e editar a peça **não** enquadram.
- Passo do zoom (roda, F2/F3, − +): ×1,15. A roda ancora no ponteiro; F2/F3 e − + no centro da caixa.
- Percentagem mostrada: **100% = a peça cabendo inteira**.
- Arrastar a vista: espaço segurado + botão esquerdo, ou botão do meio. O aperto não chega na ferramenta. Cursor `grab` (`grabbing` arrastando). O espaço (keydown e keyup) é impedido fora de campo de texto e de janela aberta. Soltar o espaço no meio do arrasto termina no próximo soltar do botão.
- Teclas: F10 Nós · P Pique · O Ponto · I Fio · G Graduar · T Ver todas · PgUp/PgDn peça (para nas pontas) · `[`/`]` tamanho (para nas pontas; nada no Graduar) · F4 enquadra · F2/F3 aproxima/afasta. Letras maiúsculas ou minúsculas. Com Ctrl, Alt ou Meta: nada. Com foco em `INPUT`, `TEXTAREA`, `SELECT` ou `contentEditable`, ou com `[aria-modal="true"]` visível: nada. Tecla tratada tem `preventDefault`. Escolher ferramenta sai do Ver todas; PgUp/PgDn no Ver todas trocam a peça e saem dele.
- `janelaAberta` de `src/telas/risco/useEditorDeNos.ts` passa a ser exportado e usado também pela Montagem.
- Nada cruza com as teclas do editor de nós (setas, Delete/Backspace, `+`, Esc, Ctrl+A) nem com o Ctrl+Z da Montagem.
- Ícones: só os que já existem em `estatico/icones.svg` (`chevron-left`, `chevron-right`, `zoom-in`, `zoom-out`).
- Texto da tela e comentários em português, no tom do código em volta (comentário diz o porquê).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Letra digitada num campo** (o nome do molde, a "Linha em volta (mm)", o nome da peça): não troca de ferramenta nem de peça. Teste na Tarefa 3.
- **Espaço com o foco num campo de texto**: o espaço é do campo (digita), e o aperto seguinte é da ferramenta, não da vista. Teste na Tarefa 2.
- **Peça comprida × peça larga**: a comprida abre abaixo de 100% da largura e cabe na altura; a larga fica em 1 (não encolhe à toa). Teste na Tarefa 2.
- **PgDn na última peça, `]` no último tamanho**: não dá a volta nem quebra — fica. Teste na Tarefa 1.
- **`[`/`]` no Graduar**: não fazem nada (o Graduar força o base). Testes nas Tarefas 1 e 3.

---

## Arquivos

- **Novo** `src/telas/montagem/navegacao.ts` — as contas puras (Tarefa 1).
- **Novo** `src/telas/montagem/useVistaDaMesa.ts` — a vista (Tarefa 2).
- **Novo** `src/telas/montagem/useTeclasDaMontagem.ts` — as teclas (Tarefa 3).
- **Muda** `src/telas/risco/useEditorDeNos.ts` — `export` em `janelaAberta` (Tarefa 2).
- **Muda** `src/telas/montagem/Mesa.tsx` — usa o gancho da vista; o arrasto da vista antes das ferramentas; props novas (Tarefa 2).
- **Muda** `src/telas/montagem/MesaDeMontagem.tsx` — a chave do enquadre (Tarefa 2); teclas e barra (Tarefa 3).
- **Muda** `src/telas/montagem/ListaDePecas.tsx` — rolar até a peça escolhida (Tarefa 3).
- **Novo** `bancada/conferir-navegacao-montagem.mjs` (Tarefas 1–3) e `bancada/cenarios-da-navegacao.tsx` (Tarefas 2–3).
- **Muda** `package.json`, `.github/workflows/conferir.yml` — `bancada:navegacao` (Tarefa 1).

---

### Task 1: As contas da navegação (`navegacao.ts`)

**Files:**
- Create: `src/telas/montagem/navegacao.ts`
- Create: `bancada/conferir-navegacao-montagem.mjs`
- Modify: `package.json` (scripts), `.github/workflows/conferir.yml` (passo "Moldes e tamanhos")

**Interfaces:**
- Consumes: `type Ferramenta` de `src/telas/montagem/Mesa.tsx` (`"nos" | "pique" | "ponto" | "fio" | "graduar"`), só como tipo.
- Produces (Tarefas 2 e 3):
  - `ZOOM_MAX = 12`, `PASSO_DO_ZOOM = 1.15`
  - `interface Tamanho { largura: number; altura: number }`
  - `zoomQueCabe(caixa: Tamanho, vista: Tamanho): number`
  - `zoomMinimo(cabe: number): number`
  - `porcentagem(zoom: number, cabe: number): number`
  - `zoomAncorado(zoom: number, fator: number, noCanvas: {x,y}, naCaixa: {x,y}, cabe: number): { zoom: number; rolagem: { x: number; y: number } }`
  - `vizinho<T>(lista: readonly T[], atual: T, passo: -1 | 1): T | null`
  - `type AcaoDaTecla = { tipo: "ferramenta"; qual: Ferramenta } | { tipo: "verTodas" } | { tipo: "peca"; passo: -1 | 1 } | { tipo: "tamanho"; passo: -1 | 1 } | { tipo: "enquadrar" } | { tipo: "zoom"; fator: number }`
  - `acaoDaTecla(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }, contexto: { ferramenta: Ferramenta }): AcaoDaTecla | null`
  - `emCampoDeTexto(el: { tagName?: string; isContentEditable?: boolean } | null): boolean`

- [ ] **Step 1: Escrever a bancada (falhando)**

Criar `bancada/conferir-navegacao-montagem.mjs`:

```js
/*
 * BANCADA — navegar e ver na Montagem
 *
 *     npm run bancada:navegacao
 *
 * Roda no CI. As contas de `src/telas/montagem/navegacao.ts`: a peça cabendo
 * inteira, o zoom que deixa o ponto do ponteiro parado, a peça e o tamanho
 * vizinhos (parando nas pontas) e qual tecla faz o quê. Ver
 * docs/superpowers/specs/2026-09-30-montagem-navegar-design.md.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const n = await carregarModulo("src/telas/montagem/navegacao.ts");
const perto = (a, b) => Math.abs(a - b) < 1e-9;

// 1. Enquadrar: a peça comprida cabe abaixo de 1; a larga fica em 1 (já cabe na altura).
assert.ok(perto(n.zoomQueCabe({ largura: 800, altura: 600 }, { largura: 100, altura: 300 }), 0.25));
assert.equal(n.zoomQueCabe({ largura: 800, altura: 600 }, { largura: 300, altura: 100 }), 1);
assert.equal(n.zoomQueCabe({ largura: 0, altura: 600 }, { largura: 100, altura: 300 }), 1, "caixa sem medida: 1");
assert.equal(n.zoomMinimo(0.25), 0.25);
assert.equal(n.zoomMinimo(1), 1);
assert.equal(n.porcentagem(0.25, 0.25), 100, "100% = cabendo inteira");
assert.equal(n.porcentagem(0.2875, 0.25), 115);

// 2. Zoom ancorado: o ponto debaixo da âncora fica no mesmo lugar da caixa; respeita o mínimo e o máximo.
{
  const r = n.zoomAncorado(1, 2, { x: 300, y: 100 }, { x: 100, y: 50 }, 0.5);
  assert.equal(r.zoom, 2);
  assert.deepEqual(r.rolagem, { x: 500, y: 150 }, "o ponto 300 do canvas vira 600, e a caixa o mostra em 100");
  const minimo = n.zoomAncorado(0.25, 1 / 1.15, { x: 10, y: 10 }, { x: 10, y: 10 }, 0.25);
  assert.equal(minimo.zoom, 0.25, "não afasta abaixo de a peça inteira");
  assert.deepEqual(minimo.rolagem, { x: 0, y: 0 });
  assert.equal(n.zoomAncorado(11, 2, { x: 0, y: 0 }, { x: 0, y: 0 }, 1).zoom, n.ZOOM_MAX);
}

// 3. Vizinho: anda um, e PARA nas pontas (null = não mexe); fora da lista, o primeiro.
assert.equal(n.vizinho([3, 5, 9], 5, 1), 9);
assert.equal(n.vizinho([3, 5, 9], 5, -1), 3);
assert.equal(n.vizinho([3, 5, 9], 9, 1), null, "PgDn na última peça: fica");
assert.equal(n.vizinho(["P", "M", "G"], "P", -1), null, "[ no primeiro tamanho: fica");
assert.equal(n.vizinho([3, 5, 9], 7, 1), 3);
assert.equal(n.vizinho([], 1, 1), null);

// 4. As teclas.
const tecla = (key, extra = {}) => n.acaoDaTecla({ key, ...extra }, { ferramenta: "nos" });
assert.deepEqual(tecla("F10"), { tipo: "ferramenta", qual: "nos" });
assert.deepEqual(tecla("p"), { tipo: "ferramenta", qual: "pique" });
assert.deepEqual(tecla("O"), { tipo: "ferramenta", qual: "ponto" }, "maiúscula vale");
assert.deepEqual(tecla("i"), { tipo: "ferramenta", qual: "fio" });
assert.deepEqual(tecla("g"), { tipo: "ferramenta", qual: "graduar" });
assert.deepEqual(tecla("t"), { tipo: "verTodas" });
assert.deepEqual(tecla("PageUp"), { tipo: "peca", passo: -1 });
assert.deepEqual(tecla("PageDown"), { tipo: "peca", passo: 1 });
assert.deepEqual(tecla("["), { tipo: "tamanho", passo: -1 });
assert.deepEqual(tecla("]"), { tipo: "tamanho", passo: 1 });
assert.deepEqual(tecla("F4"), { tipo: "enquadrar" });
assert.deepEqual(tecla("F2"), { tipo: "zoom", fator: n.PASSO_DO_ZOOM });
assert.deepEqual(tecla("F3"), { tipo: "zoom", fator: 1 / n.PASSO_DO_ZOOM });
for (const mod of ["ctrlKey", "altKey", "metaKey"]) assert.equal(tecla("p", { [mod]: true }), null, mod);
for (const outra of ["a", "Tab", "Enter", "ArrowLeft", "Delete", "+", "Escape", " "]) assert.equal(tecla(outra), null, outra);
// O Graduar trabalha no base: [ e ] não fazem nada; o resto vale.
assert.equal(n.acaoDaTecla({ key: "[" }, { ferramenta: "graduar" }), null);
assert.equal(n.acaoDaTecla({ key: "]" }, { ferramenta: "graduar" }), null);
assert.deepEqual(n.acaoDaTecla({ key: "PageDown" }, { ferramenta: "graduar" }), { tipo: "peca", passo: 1 });

// 5. O foco é de escrever? Campo, área de texto, lista e contentEditable; botão e nada, não.
assert.equal(n.emCampoDeTexto({ tagName: "INPUT" }), true);
assert.equal(n.emCampoDeTexto({ tagName: "TEXTAREA" }), true);
assert.equal(n.emCampoDeTexto({ tagName: "SELECT" }), true);
assert.equal(n.emCampoDeTexto({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(n.emCampoDeTexto({ tagName: "BUTTON" }), false);
assert.equal(n.emCampoDeTexto(null), false);

console.log("OK — as contas da navegação da Montagem conferem.");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node bancada/conferir-navegacao-montagem.mjs`
Expected: FAIL — o esbuild não resolve `src/telas/montagem/navegacao.ts`.

- [ ] **Step 3: Escrever o módulo**

Criar `src/telas/montagem/navegacao.ts`:

```ts
/**
 * A NAVEGAÇÃO DA MONTAGEM — enquadrar, aproximar e as teclas
 *
 * Sem React e sem DOM, para a bancada conferir. A vista (`useVistaDaMesa.ts`)
 * e as teclas (`useTeclasDaMontagem.ts`) só ligam isto nos eventos. Ver
 * docs/superpowers/specs/2026-09-30-montagem-navegar-design.md.
 *
 * O zoom é a largura do canvas em relação à caixa: 1 = a largura da caixa.
 */
import type { Ferramenta } from "./Mesa";

export const ZOOM_MAX = 12;
/** O passo da roda, do F2/F3 e do − + da barra. */
export const PASSO_DO_ZOOM = 1.15;

export interface Tamanho { largura: number; altura: number }

/**
 * O zoom em que a peça cabe inteira na caixa. No zoom 1 o canvas tem a largura
 * da caixa, então a altura dele é `W · a / l`; o `min` com 1 é porque peça larga
 * já cabe na altura. Caixa ou vista sem medida: 1.
 */
export function zoomQueCabe(caixa: Tamanho, vista: Tamanho): number {
  if (caixa.largura <= 0 || caixa.altura <= 0 || vista.largura <= 0 || vista.altura <= 0) return 1;
  return Math.min(1, (caixa.altura * vista.largura) / (caixa.largura * vista.altura));
}

/** O menor zoom: a peça cabendo inteira — nunca menor que isso. */
export const zoomMinimo = (cabe: number) => Math.min(1, cabe);

/** A percentagem da barra: 100% = a peça cabendo inteira. */
export const porcentagem = (zoom: number, cabe: number) => Math.round((zoom / cabe) * 100);

/**
 * Aproximar ou afastar deixando um ponto parado na tela: o ponteiro na roda, o
 * centro da caixa no F2/F3. `noCanvas` é onde a âncora cai no canvas, em px do
 * canto dele (do tamanho de agora); `naCaixa`, onde ela está na parte visível
 * da caixa. O canvas cresce na mesma razão do zoom, então o ponto vai para
 * `noCanvas · razão`, e a rolagem que o põe de volta em `naCaixa` é a diferença.
 */
export function zoomAncorado(
  zoom: number, fator: number, noCanvas: { x: number; y: number }, naCaixa: { x: number; y: number }, cabe: number,
): { zoom: number; rolagem: { x: number; y: number } } {
  const novo = Math.min(ZOOM_MAX, Math.max(zoomMinimo(cabe), zoom * fator));
  const razao = novo / zoom;
  return {
    zoom: novo,
    rolagem: { x: Math.max(0, noCanvas.x * razao - naCaixa.x), y: Math.max(0, noCanvas.y * razao - naCaixa.y) },
  };
}

/** O vizinho na lista, parando nas pontas (`null` = não mexe). Fora da lista: o primeiro. */
export function vizinho<T>(lista: readonly T[], atual: T, passo: -1 | 1): T | null {
  const i = lista.indexOf(atual);
  if (i < 0) return lista[0] ?? null;
  const j = i + passo;
  return j >= 0 && j < lista.length ? lista[j]! : null;
}

export type AcaoDaTecla =
  | { tipo: "ferramenta"; qual: Ferramenta }
  | { tipo: "verTodas" }
  | { tipo: "peca"; passo: -1 | 1 }
  | { tipo: "tamanho"; passo: -1 | 1 }
  | { tipo: "enquadrar" }
  | { tipo: "zoom"; fator: number };

/** As letras das ferramentas que o Corel não tem (a Forma, F10, é a Nós). */
const FERRAMENTA_DA_LETRA: Record<string, Ferramenta> = { p: "pique", o: "ponto", i: "fio", g: "graduar" };

/**
 * Qual ação a tecla pede, no jeito do Corel onde ele tem a mesma coisa. Com
 * Ctrl, Alt ou Meta, nada: o Ctrl+Z da Montagem e os atalhos do editor são deles.
 */
export function acaoDaTecla(
  e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean },
  contexto: { ferramenta: Ferramenta },
): AcaoDaTecla | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  switch (e.key) {
    case "F10": return { tipo: "ferramenta", qual: "nos" };
    case "F4": return { tipo: "enquadrar" };
    case "F2": return { tipo: "zoom", fator: PASSO_DO_ZOOM };
    case "F3": return { tipo: "zoom", fator: 1 / PASSO_DO_ZOOM };
    case "PageUp": return { tipo: "peca", passo: -1 };
    case "PageDown": return { tipo: "peca", passo: 1 };
    case "[":
    case "]":
      // O Graduar trabalha no base e já força o tamanho para ele.
      return contexto.ferramenta === "graduar" ? null : { tipo: "tamanho", passo: e.key === "[" ? -1 : 1 };
    default:
      break;
  }
  const letra = e.key.length === 1 ? e.key.toLowerCase() : "";
  if (letra === "t") return { tipo: "verTodas" };
  const qual = FERRAMENTA_DA_LETRA[letra];
  return qual ? { tipo: "ferramenta", qual } : null;
}

/** O foco está num lugar de escrever? Então as teclas são dele — a mesma trava do editor de nós. */
export function emCampoDeTexto(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  return !!el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName ?? "");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node bancada/conferir-navegacao-montagem.mjs`
Expected: `OK — as contas da navegação da Montagem conferem.`

- [ ] **Step 5: Ligar no `package.json` e no CI**

Em `package.json`, depois da linha `"bancada:envio": "node bancada/conferir-envio-por-tamanho.mjs",`:

```json
    "bancada:navegacao": "node bancada/conferir-navegacao-montagem.mjs",
```

Em `.github/workflows/conferir.yml`, no passo "Moldes e tamanhos", acrescentar ` && npm run bancada:navegacao` ao fim do `run:`.

Run: `npm run bancada:navegacao && npm run tipos`
Expected: o OK e `tsc` sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/telas/montagem/navegacao.ts bancada/conferir-navegacao-montagem.mjs package.json .github/workflows/conferir.yml
git commit -F - <<'EOF'
As contas da navegação da Montagem: a peça inteira, o zoom ancorado, o vizinho e as teclas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: A vista da mesa (`useVistaDaMesa`)

**Files:**
- Create: `src/telas/montagem/useVistaDaMesa.ts`
- Modify: `src/telas/risco/useEditorDeNos.ts` (a linha `function janelaAberta(): boolean {`)
- Modify: `src/telas/montagem/Mesa.tsx`
- Modify: `src/telas/montagem/MesaDeMontagem.tsx` (só passar `chaveDoEnquadre` à `<Mesa>`)
- Create: `bancada/cenarios-da-navegacao.tsx`
- Modify: `bancada/conferir-navegacao-montagem.mjs` (o harness com React no fim)

**Interfaces:**
- Consumes (Tarefa 1): `ZOOM_MAX`, `PASSO_DO_ZOOM`, `Tamanho`, `zoomQueCabe`, `porcentagem`, `zoomAncorado`, `emCampoDeTexto`.
- Produces (Tarefa 3):
  - `export function janelaAberta(): boolean` em `useEditorDeNos.ts`.
  - `interface ComandosDaVista { enquadrar(): void; aproximar(): void; afastar(): void }` em `useVistaDaMesa.ts`.
  - `useVistaDaMesa(vista: Tamanho, chaveDoEnquadre: string)` → `{ moldura: RefObject<HTMLDivElement>; tela: RefObject<HTMLCanvasElement>; zoom: number; larguraDaMoldura: number; porcento: number; enquadrar(); aproximar(); afastar(); cursor: "grab" | "grabbing" | null; aoApertar(e): boolean; aoMover(e): boolean; aoSoltar(e): boolean }` (os três de ponteiro devolvem `true` quando o evento era da vista).
  - `Mesa` ganha as props `chaveDoEnquadre: string` (obrigatória), `comandos?: MutableRefObject<ComandosDaVista | null>` e `aoMudarPorcento?: (porcento: number) => void`.
  - `bancada/cenarios-da-navegacao.tsx` exporta `rodar()`, `montar`, `fazer`, `tecla(key, extra?)` e `cenariosDaTela` (lista de `[nome, fn]` que `rodar` roda no fim); a Tarefa 3 acrescenta nela.

- [ ] **Step 1: Escrever os cenários da vista (falhando)**

Criar `bancada/cenarios-da-navegacao.tsx`:

```tsx
/*
 * Os cenários com React da bancada da navegação (`conferir-navegacao-montagem.mjs`).
 *
 * O jsdom não mede layout: a largura e a altura de cada elemento vêm do
 * `data-w`/`data-h` dele (o harness troca `clientWidth`, `clientHeight` e
 * `getBoundingClientRect`). A caixa aqui tem 800×600.
 */
import assert from "node:assert/strict";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { useVistaDaMesa } from "../src/telas/montagem/useVistaDaMesa";

type Qualquer = any;
let vista: Qualquer = null;
let naFerramenta: string[] = [];

export async function montar(elemento: JSX.Element) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  await act(async () => { raiz.render(elemento); });
  return async () => { await act(async () => { raiz.unmount(); }); caixa.remove(); };
}
export const fazer = async (f: () => void | Promise<void>) => { await act(async () => { await f(); }); };
/** Uma tecla na janela, como o teclado manda. */
export const tecla = (key: string, extra: Qualquer = {}, tipo = "keydown") =>
  fazer(() => { window.dispatchEvent(new window.KeyboardEvent(tipo, { key, bubbles: true, cancelable: true, ...extra })); });
const apertar = (botao: number) => fazer(() => {
  document.querySelector("canvas")!.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: botao, clientX: 10, clientY: 10 }));
});
const soltar = () => fazer(() => {
  document.querySelector("canvas")!.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 30, clientY: 30 }));
});

/** Uma mesa de mentira: a caixa 800×600, o canvas do tamanho que o zoom dá, e uma "ferramenta" que anota os apertos. */
function TelaDaVista({ peca, chave }: { peca: { largura: number; altura: number }; chave: string }) {
  const v = useVistaDaMesa(peca, chave);
  vista = v;
  const w = 800 * v.zoom;
  return (
    <div ref={v.moldura} data-w="800" data-h="600">
      <canvas
        ref={v.tela} data-w={String(w)} data-h={String((w * peca.altura) / peca.largura)}
        onPointerDown={(e) => { if (!v.aoApertar(e)) naFerramenta.push("aperto"); }}
        onPointerMove={(e) => { v.aoMover(e); }}
        onPointerUp={(e) => { v.aoSoltar(e); }}
      />
      <input aria-label="campo" />
    </div>
  );
}

/** Troca a peça e a chave de fora, como a tela de cima faz. */
let trocar: (p: { largura: number; altura: number }, chave: string) => void = () => {};
function Tela({ inicial }: { inicial: { largura: number; altura: number } }) {
  const [estado, setEstado] = useState({ peca: inicial, chave: "a" });
  trocar = (peca, chave) => setEstado({ peca, chave });
  return <TelaDaVista peca={estado.peca} chave={estado.chave} />;
}

const comprida = { largura: 100, altura: 300 };
const larga = { largura: 300, altura: 100 };
const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export const cenariosDaTela: [string, () => Promise<void>][] = [];

export async function rodar() {
  const falhas: string[] = [];
  const cenario = async (nome: string, f: () => Promise<void>) => {
    try { await f(); } catch (e) { falhas.push(`${nome}: ${(e as Error).message}`); }
  };

  // V. 1 — ao abrir, a peça comprida cabe inteira (0,25 da largura), e a barra diz 100%.
  await cenario("vista 1", async () => {
    const desmontar = await montar(<Tela inicial={comprida} />);
    try {
      assert.ok(perto(vista.zoom, 0.25), `zoom ${vista.zoom}`);
      assert.equal(vista.porcento, 100);
    } finally { await desmontar(); }
  });

  // V. 2 — aproximar muda o zoom; a mesma chave (trocar de ferramenta, editar) não enquadra;
  //        chave nova (outra peça) enquadra de novo.
  await cenario("vista 2", async () => {
    const desmontar = await montar(<Tela inicial={comprida} />);
    try {
      await fazer(() => vista.aproximar());
      assert.ok(perto(vista.zoom, 0.25 * 1.15), `zoom ${vista.zoom}`);
      assert.equal(vista.porcento, 115);
      await fazer(() => trocar({ largura: 100, altura: 290 }, "a"));
      assert.ok(perto(vista.zoom, 0.25 * 1.15), "mesma chave: o zoom fica");
      await fazer(() => trocar(comprida, "b"));
      assert.ok(perto(vista.zoom, 0.25), "outra peça: enquadra");
      await fazer(() => vista.afastar());
      assert.ok(perto(vista.zoom, 0.25), "não afasta abaixo da peça inteira");
    } finally { await desmontar(); }
  });

  // V. 3 — a peça larga já cabe na altura: fica em 1.
  await cenario("vista 3", async () => {
    const desmontar = await montar(<Tela inicial={larga} />);
    try { assert.equal(vista.zoom, 1); } finally { await desmontar(); }
  });

  // V. 4 — espaço segurado: o aperto é da vista (mão), não da ferramenta; soltar o espaço volta.
  //        Botão do meio: da vista, sem espaço. Sem nada: da ferramenta.
  await cenario("vista 4", async () => {
    naFerramenta = [];
    const desmontar = await montar(<Tela inicial={comprida} />);
    try {
      await tecla(" ");
      assert.equal(vista.cursor, "grab");
      await apertar(0);
      assert.equal(vista.cursor, "grabbing");
      await soltar();
      await tecla(" ", {}, "keyup");
      assert.equal(vista.cursor, null);
      await apertar(1);
      await soltar();
      assert.deepEqual(naFerramenta, [], "espaço e botão do meio não chegam na ferramenta");
      await apertar(0);
      assert.deepEqual(naFerramenta, ["aperto"], "sem espaço, o aperto é da ferramenta");
    } finally { await desmontar(); }
  });

  // V. 5 — com o foco num campo de texto, o espaço é do campo: não vira a mão, e o aperto é da ferramenta.
  await cenario("vista 5", async () => {
    naFerramenta = [];
    const desmontar = await montar(<Tela inicial={comprida} />);
    try {
      document.querySelector<HTMLInputElement>('input[aria-label="campo"]')!.focus();
      await tecla(" ");
      assert.equal(vista.cursor, null);
      await apertar(0);
      assert.deepEqual(naFerramenta, ["aperto"]);
      (document.activeElement as HTMLElement | null)?.blur();
    } finally { await desmontar(); }
  });

  for (const [nome, f] of cenariosDaTela) await cenario(nome, f);
  assert.deepEqual(falhas, [], `\n${falhas.join("\n")}`);
}
```

Em `bancada/conferir-navegacao-montagem.mjs`, trocar o `console.log(…)` do fim por este bloco (e subir os `import` novos para o topo do arquivo, junto dos que já estão lá):

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
for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLCanvasElement", "Node", "Element", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame"]) {
  if (!(k in globalThis) || k === "window" || k === "document") globalThis[k] = k === "window" ? dom.window : dom.window[k];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// O jsdom não mede layout: o tamanho vem do `data-w`/`data-h` de cada elemento (os cenários põem).
for (const [prop, chave] of [["clientWidth", "w"], ["clientHeight", "h"]]) {
  Object.defineProperty(dom.window.HTMLElement.prototype, prop, {
    configurable: true, get() { return Number(this.dataset?.[chave] ?? 0); },
  });
}
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  const w = Number(this.dataset?.w ?? 0);
  const h = Number(this.dataset?.h ?? 0);
  return { left: 0, top: 0, x: 0, y: 0, right: w, bottom: h, width: w, height: h };
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const saida = path.join(os.tmpdir(), `optimize-cenarios-da-navegacao-${process.pid}.mjs`);
esbuild.buildSync({
  entryPoints: [path.join(aqui, "cenarios-da-navegacao.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: saida,
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "error",
});
try {
  const { rodar } = await import(pathToFileURL(saida).href);
  await rodar();
} finally {
  dom.window.close();
  fs.rmSync(saida, { force: true });
}
console.log("OK — as contas da navegação da Montagem conferem, e a vista e as teclas também.");
// O agendador do React deixa portas de mensagem abertas no jsdom: sem sair à força, o processo não acaba
// (como em `conferir-editor-de-nos.mjs`). Uma falha acima já saiu com erro antes daqui.
process.exit(0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:navegacao`
Expected: FAIL — o esbuild não resolve `../src/telas/montagem/useVistaDaMesa`.

- [ ] **Step 3: Exportar `janelaAberta`**

Em `src/telas/risco/useEditorDeNos.ts`, trocar `function janelaAberta(): boolean {` por `export function janelaAberta(): boolean {` (o comentário acima fica).

- [ ] **Step 4: O gancho da vista**

Criar `src/telas/montagem/useVistaDaMesa.ts`:

```ts
/**
 * A VISTA DA MESA — enquadrar, aproximar e arrastar
 *
 * Saiu de `Mesa.tsx`, que continua com o desenho e as ferramentas. O modelo é
 * o de sempre: um canvas numa caixa com rolagem, o zoom sendo a largura do
 * canvas em relação à caixa. As contas moram em `navegacao.ts`. Ver
 * docs/superpowers/specs/2026-09-30-montagem-navegar-design.md §1.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoDePonteiro } from "react";
import { janelaAberta } from "../risco/useEditorDeNos";
import { PASSO_DO_ZOOM, emCampoDeTexto, porcentagem, zoomAncorado, zoomQueCabe, type Tamanho } from "./navegacao";

/** O que a barra e as teclas da tela de cima pedem à vista. */
export interface ComandosDaVista { enquadrar(): void; aproximar(): void; afastar(): void }

export function useVistaDaMesa(vista: Tamanho, chaveDoEnquadre: string) {
  const moldura = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [caixa, setCaixa] = useState<Tamanho>({ largura: 0, altura: 0 });
  const [comEspaco, setComEspaco] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const arrasto = useRef<{ x: number; y: number; esquerda: number; topo: number } | null>(null);
  const cabe = zoomQueCabe(caixa, vista);
  // Os ouvintes (roda, teclas) são postos uma vez só: leem o zoom e o "cabe" de agora por aqui.
  const agora = useRef({ zoom, cabe });
  agora.current = { zoom, cabe };

  // A caixa em largura E altura: a altura é o que faz a peça comprida caber.
  useEffect(() => {
    const el = moldura.current;
    if (!el) return;
    const medir = () => setCaixa((c) => (c.largura === el.clientWidth && c.altura === el.clientHeight
      ? c : { largura: el.clientWidth, altura: el.clientHeight }));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const enquadrar = useCallback(() => {
    setZoom(agora.current.cabe);
    const el = moldura.current;
    if (el) { el.scrollLeft = 0; el.scrollTop = 0; }
  }, []);

  // Outra peça, outro tamanho, entrar ou sair do Ver todas, abrir: enquadra. Sem medida da caixa, espera.
  // Trocar de ferramenta ou editar a peça não mudam a chave — o zoom fica.
  const temCaixa = caixa.largura > 0 && caixa.altura > 0;
  useEffect(() => { if (temCaixa) enquadrar(); }, [chaveDoEnquadre, temCaixa, enquadrar]);

  /** Zoom com o ponto `clientX/Y` da tela parado; sem ponto, o centro da caixa. */
  const zoomEm = useCallback((fator: number, ponto?: { x: number; y: number }) => {
    const el = moldura.current;
    const canvas = tela.current;
    if (!el || !canvas) return;
    const r = el.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const p = ponto ?? { x: r.left + el.clientWidth / 2, y: r.top + el.clientHeight / 2 };
    const novo = zoomAncorado(
      agora.current.zoom, fator, { x: p.x - c.left, y: p.y - c.top }, { x: p.x - r.left, y: p.y - r.top }, agora.current.cabe,
    );
    setZoom(novo.zoom);
    // A rolagem só vale depois que o canvas cresceu.
    requestAnimationFrame(() => { el.scrollLeft = novo.rolagem.x; el.scrollTop = novo.rolagem.y; });
  }, []);
  const aproximar = useCallback(() => zoomEm(PASSO_DO_ZOOM), [zoomEm]);
  const afastar = useCallback(() => zoomEm(1 / PASSO_DO_ZOOM), [zoomEm]);

  // A roda, ancorada no ponteiro — o mesmo do Digitalizar.
  useEffect(() => {
    const el = moldura.current;
    if (!el) return;
    const aoRodar = (e: WheelEvent) => {
      e.preventDefault();
      zoomEm(e.deltaY < 0 ? PASSO_DO_ZOOM : 1 / PASSO_DO_ZOOM, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", aoRodar, { passive: false });
    return () => el.removeEventListener("wheel", aoRodar);
  }, [zoomEm]);

  // O espaço segurado vira a mão. Fora de campo de texto e de janela aberta, o espaço é da mesa: sem
  // isso ele "apertaria" o botão com foco (o navegador aperta no keyup) e rolaria a página.
  useEffect(() => {
    const livre = () => !emCampoDeTexto(document.activeElement as HTMLElement | null) && !janelaAberta();
    const desce = (e: KeyboardEvent) => {
      if (e.key !== " " || !livre()) return;
      e.preventDefault();
      setComEspaco(true);
    };
    const sobe = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      if (livre()) e.preventDefault();
      setComEspaco(false);
    };
    const esquecer = () => setComEspaco(false);
    window.addEventListener("keydown", desce);
    window.addEventListener("keyup", sobe);
    window.addEventListener("blur", esquecer);
    return () => {
      window.removeEventListener("keydown", desce);
      window.removeEventListener("keyup", sobe);
      window.removeEventListener("blur", esquecer);
    };
  }, []);

  /** O aperto é da vista (espaço segurado, ou o botão do meio)? Então a ferramenta não recebe nada. */
  const aoApertar = (e: EventoDePonteiro<HTMLElement>): boolean => {
    const el = moldura.current;
    if (!el || !(e.button === 1 || (e.button === 0 && comEspaco))) return false;
    e.preventDefault();
    arrasto.current = { x: e.clientX, y: e.clientY, esquerda: el.scrollLeft, topo: el.scrollTop };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setArrastando(true);
    return true;
  };
  const aoMover = (e: EventoDePonteiro<HTMLElement>): boolean => {
    const a = arrasto.current;
    const el = moldura.current;
    if (!a || !el) return false;
    el.scrollLeft = a.esquerda - (e.clientX - a.x);
    el.scrollTop = a.topo - (e.clientY - a.y);
    return true;
  };
  /** Solta o arrasto da vista — mesmo que o espaço já tenha sido solto antes (termina aqui, não antes). */
  const aoSoltar = (e: EventoDePonteiro<HTMLElement>): boolean => {
    if (!arrasto.current) return false;
    arrasto.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setArrastando(false);
    return true;
  };

  return {
    moldura, tela, zoom, larguraDaMoldura: caixa.largura, porcento: porcentagem(zoom, cabe),
    enquadrar, aproximar, afastar,
    cursor: arrastando ? "grabbing" as const : comEspaco ? "grab" as const : null,
    aoApertar, aoMover, aoSoltar,
  };
}
```

- [ ] **Step 5: A Mesa usa o gancho**

Em `src/telas/montagem/Mesa.tsx`:

(a) Imports: `MutableRefObject` do React, e o gancho:

```tsx
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
```

e, junto dos outros imports locais:

```tsx
import { useVistaDaMesa, type ComandosDaVista } from "./useVistaDaMesa";
```

(b) Tirar as constantes `ZOOM_MIN` e `ZOOM_MAX` (o zoom agora é do gancho).

(c) Na `interface Props`, no fim:

```tsx
  /** Muda quando a mesa deve enquadrar sozinha: outra peça, outro tamanho, Ver todas. */
  chaveDoEnquadre: string;
  /** Onde a Mesa deixa os comandos da vista, para a barra e as teclas da tela de cima. */
  comandos?: MutableRefObject<ComandosDaVista | null>;
  /** A percentagem do zoom (100% = a peça inteira), para a barra. */
  aoMudarPorcento?: (porcento: number) => void;
```

(d) No corpo de `Mesa`, tirar as linhas:

```tsx
  const tela = useRef<HTMLCanvasElement>(null);
  const moldura = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [larguraDaMoldura, setLarguraDaMoldura] = useState(0);
```

e, logo depois do `useMemo` de `vistaCalculada` (antes de `const vista = vistaCongelada.current ?? vistaCalculada;`):

```tsx
  // A vista da mesa: enquadrar, aproximar, arrastar (ver `useVistaDaMesa.ts`). Enquadra pela vista
  // calculada, e não pela congelada: o arrasto de um nó não muda a chave.
  const vistaDaMesa = useVistaDaMesa(
    { largura: vistaCalculada.largura, altura: vistaCalculada.altura }, props.chaveDoEnquadre,
  );
  const { tela, moldura, zoom, larguraDaMoldura } = vistaDaMesa;
  if (props.comandos) {
    props.comandos.current = {
      enquadrar: vistaDaMesa.enquadrar, aproximar: vistaDaMesa.aproximar, afastar: vistaDaMesa.afastar,
    };
  }
  const aoMudarPorcento = props.aoMudarPorcento;
  useEffect(() => { aoMudarPorcento?.(vistaDaMesa.porcento); }, [vistaDaMesa.porcento, aoMudarPorcento]);
```

(e) Os três do ponteiro passam primeiro pela vista. Primeira linha de `aoApertar`:

```tsx
    if (vistaDaMesa.aoApertar(e)) return;
```

primeira linha de `aoMover`:

```tsx
    if (vistaDaMesa.aoMover(e)) return;
```

primeira linha de `aoSoltar`:

```tsx
    if (vistaDaMesa.aoSoltar(e)) return;
```

(f) Tirar os dois `useEffect` que o gancho agora faz: o da largura da mesa (`// A largura da mesa, para o canvas nascer do tamanho em que aparece.` com o `ResizeObserver`) e o da roda (`// Zoom pela roda, ancorado no ponteiro — o mesmo do Digitalizar.`).

(g) O `return` do componente:

```tsx
  return (
    // Flex com margem automática no canvas: menor que a caixa, ele fica no meio nos dois eixos; maior,
    // a rolagem começa na borda dele (centrar com `justify-center` cortaria a borda de cima e da esquerda).
    <div ref={moldura} className="flex h-full overflow-auto bg-painel-suave">
      <canvas
        ref={tela}
        className="m-auto block h-auto max-w-none shrink-0 touch-none select-none"
        style={{ width: `${zoom * 100}%`, cursor: vistaDaMesa.cursor ?? (verTodas ? "pointer" : "crosshair") }}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onDoubleClick={aoDobrarClique}
      />
    </div>
  );
```

Se o `tsc` reclamar de `useState` sem uso em `Mesa.tsx`, confira: `repintar` ainda usa `useState` — ele fica.

- [ ] **Step 6: A tela de cima passa a chave**

Em `src/telas/montagem/MesaDeMontagem.tsx`, na `<Mesa … />`, acrescentar (depois de `editor={editor}`):

```tsx
            // Enquadra ao trocar de peça ou de tamanho (muda `atual`) e ao entrar ou sair do Ver todas.
            chaveDoEnquadre={verTodas ? "todas" : String(atual)}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm run bancada:navegacao && npm run tipos && npm run bancada:editor && node bancada/conferir-revisao-front.cjs`
Expected: `OK — … e a vista e as teclas também.`, `tsc` sem erro, o editor de nós e a revisão do front passando.

- [ ] **Step 8: Commit**

```bash
git add src/telas/montagem/useVistaDaMesa.ts src/telas/risco/useEditorDeNos.ts src/telas/montagem/Mesa.tsx src/telas/montagem/MesaDeMontagem.tsx bancada/cenarios-da-navegacao.tsx bancada/conferir-navegacao-montagem.mjs
git commit -F - <<'EOF'
A mesa da Montagem abre a peça inteira, e a vista se arrasta com espaço ou botão do meio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: As teclas e a barra

**Files:**
- Create: `src/telas/montagem/useTeclasDaMontagem.ts`
- Modify: `src/telas/montagem/MesaDeMontagem.tsx`
- Modify: `src/telas/montagem/ListaDePecas.tsx`
- Modify: `bancada/cenarios-da-navegacao.tsx`

**Interfaces:**
- Consumes (Tarefa 1): `acaoDaTecla`, `emCampoDeTexto`, `vizinho`, `type AcaoDaTecla`. (Tarefa 2): `janelaAberta`, `type ComandosDaVista`, as props `comandos` e `aoMudarPorcento` da `Mesa`.
- Produces: `useTeclasDaMontagem(ferramenta: Ferramenta, aoAcao: (acao: AcaoDaTecla) => void): void`.

- [ ] **Step 1: Escrever os cenários das teclas (falhando)**

Em `bancada/cenarios-da-navegacao.tsx`, o import:

```tsx
import { useTeclasDaMontagem } from "../src/telas/montagem/useTeclasDaMontagem";
```

e, antes de `export async function rodar()`:

```tsx
/** Uma tela de mentira com as teclas da Montagem: anota as ações; a ferramenta de agora vem de fora. */
let acoes: Qualquer[] = [];
function TelaDasTeclas({ ferramenta }: { ferramenta: Qualquer }) {
  useTeclasDaMontagem(ferramenta, (acao) => { acoes.push(acao); });
  return (
    <div>
      <input aria-label="nome do molde" />
      <div role="dialog" aria-modal="true" data-janela="" hidden />
    </div>
  );
}

// T. 1 — as teclas viram ações; com modificador, nada.
cenariosDaTela.push(["teclas 1", async () => {
  acoes = [];
  const desmontar = await montar(<TelaDasTeclas ferramenta="nos" />);
  try {
    await tecla("F10");
    await tecla("G");
    await tecla("PageDown");
    await tecla("]");
    await tecla("p", { ctrlKey: true });
    assert.deepEqual(acoes, [
      { tipo: "ferramenta", qual: "nos" }, { tipo: "ferramenta", qual: "graduar" },
      { tipo: "peca", passo: 1 }, { tipo: "tamanho", passo: 1 },
    ]);
  } finally { await desmontar(); }
}]);

// T. 2 — letra digitada num campo é do campo: nenhuma ação.
cenariosDaTela.push(["teclas 2", async () => {
  acoes = [];
  const desmontar = await montar(<TelaDasTeclas ferramenta="nos" />);
  try {
    document.querySelector<HTMLInputElement>('input[aria-label="nome do molde"]')!.focus();
    await tecla("p");
    await tecla("PageDown");
    assert.deepEqual(acoes, []);
    (document.activeElement as HTMLElement | null)?.blur();
  } finally { await desmontar(); }
}]);

// T. 3 — com uma janela aberta na frente, as teclas são dela.
cenariosDaTela.push(["teclas 3", async () => {
  acoes = [];
  const desmontar = await montar(<TelaDasTeclas ferramenta="nos" />);
  try {
    const janela = document.querySelector<HTMLElement>("[data-janela]")!;
    // O jsdom não tem layout: "visível" é o `getClientRects` ter algo, como `janelaAberta` pergunta.
    janela.getClientRects = () => [{}] as Qualquer;
    await tecla("F4");
    assert.deepEqual(acoes, []);
  } finally { await desmontar(); }
}]);

// T. 4 — no Graduar, [ e ] não fazem nada.
cenariosDaTela.push(["teclas 4", async () => {
  acoes = [];
  const desmontar = await montar(<TelaDasTeclas ferramenta="graduar" />);
  try {
    await tecla("[");
    await tecla("]");
    await tecla("PageUp");
    assert.deepEqual(acoes, [{ tipo: "peca", passo: -1 }]);
  } finally { await desmontar(); }
}]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:navegacao`
Expected: FAIL — o esbuild não resolve `../src/telas/montagem/useTeclasDaMontagem`.

- [ ] **Step 3: O gancho das teclas**

Criar `src/telas/montagem/useTeclasDaMontagem.ts`:

```ts
/**
 * AS TECLAS DA MONTAGEM — um ouvinte só, enquanto a tela está aberta
 *
 * Qual tecla faz o quê mora em `navegacao.ts`; aqui, só as travas: com o foco
 * num campo de escrever ou com uma janela aberta na frente, as teclas são
 * deles (a mesma trava do editor de nós). Ver
 * docs/superpowers/specs/2026-09-30-montagem-navegar-design.md §2.
 */
import { useEffect, useRef } from "react";
import { janelaAberta } from "../risco/useEditorDeNos";
import type { Ferramenta } from "./Mesa";
import { acaoDaTecla, emCampoDeTexto, type AcaoDaTecla } from "./navegacao";

export function useTeclasDaMontagem(ferramenta: Ferramenta, aoAcao: (acao: AcaoDaTecla) => void) {
  // O ouvinte é posto uma vez só: lê a ferramenta e a ação de agora por aqui.
  const atual = useRef({ ferramenta, aoAcao });
  atual.current = { ferramenta, aoAcao };
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if (emCampoDeTexto(document.activeElement as HTMLElement | null) || janelaAberta()) return;
      const acao = acaoDaTecla(e, { ferramenta: atual.current.ferramenta });
      if (!acao) return;
      // F3 abre a busca e F10 foca o menu, no navegador e no WebView2.
      e.preventDefault();
      atual.current.aoAcao(acao);
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);
}
```

Run: `npm run bancada:navegacao`
Expected: o OK (cenários "vista" e "teclas" passando).

- [ ] **Step 4: A tela da Montagem liga as teclas e a barra**

Em `src/telas/montagem/MesaDeMontagem.tsx`:

(a) Imports:

```tsx
import { useTeclasDaMontagem } from "./useTeclasDaMontagem";
import { vizinho } from "./navegacao";
import type { ComandosDaVista } from "./useVistaDaMesa";
```

(b) `FERRAMENTAS` ganha a tecla de cada uma — o tipo e as cinco linhas:

```tsx
const FERRAMENTAS: { qual: Ferramenta; rotulo: string; icone: string; dica: string; tecla: string }[] = [
  { qual: "nos", rotulo: "Nós", icone: "icones.svg#spline", tecla: "F10", dica: "Clique, Shift e retângulo selecionam; arraste nós, alças ou a curva; setas movem; dois cliques põem ou tiram nó" },
  { qual: "pique", rotulo: "Pique", icone: "icones.svg#scissors", tecla: "P", dica: "Clique no traço para pôr um pique; num pique, para tirar" },
  { qual: "ponto", rotulo: "Ponto", icone: "icones.svg#crosshair", tecla: "O", dica: "Clique dentro da peça para marcar pence ou bolso" },
  { qual: "fio", rotulo: "Fio", icone: "icones.svg#move-vertical", tecla: "I", dica: "Arraste o meio para mover, uma ponta para girar" },
  { qual: "graduar", rotulo: "Graduar", icone: "icones.svg#ruler", tecla: "G", dica: "Clique num nó para ver ou pôr a regra de graduação; os outros tamanhos aparecem tracejados" },
];
```

(c) No componente, logo depois de `const [noAtivo, setNoAtivo] = useState<number | null>(null);`:

```tsx
  // A vista da Mesa: a barra e as teclas pedem enquadrar/aproximar/afastar por aqui (ver `useVistaDaMesa.ts`).
  const comandos = useRef<ComandosDaVista | null>(null);
  const [porcento, setPorcento] = useState(100);
```

(d) Logo depois do `useMemo` de `camadas` (antes de `const mudarEsta = …`), e **antes** de qualquer `return` antecipado do componente:

```tsx
  // A peça e o tamanho vizinhos, na ordem da lista e da grade, parando nas pontas.
  const idsDosGrupos = grupos.map((g) => g.grupo);
  const posicaoDaPeca = doGrupo ? idsDosGrupos.indexOf(doGrupo.grupo) + 1 : 0;
  const irParaPeca = (passo: -1 | 1) => {
    const g = doGrupo ? vizinho(idsDosGrupos, doGrupo.grupo, passo) : null;
    if (g === null) return;
    setGrupo(g);
    setVerTodas(false);
  };
  const tamanhoNoChip = escolhido || peca?.tamanho || baseDaGrade;
  useTeclasDaMontagem(ferramenta, (acao) => {
    if (acao.tipo === "ferramenta") { setFerramenta(acao.qual); setVerTodas(false); }
    else if (acao.tipo === "verTodas") setVerTodas((v) => !v);
    else if (acao.tipo === "peca") irParaPeca(acao.passo);
    else if (acao.tipo === "tamanho") {
      const t = vizinho(molde.tamanhos.map((x) => x.nome), tamanhoNoChip, acao.passo);
      if (t !== null) setTamanhoAtivo(t);
    } else if (acao.tipo === "enquadrar") comandos.current?.enquadrar();
    else if (acao.fator > 1) comandos.current?.aproximar();
    else comandos.current?.afastar();
  });
```

(e) Na barra das ferramentas, o botão de cada ferramenta mostra a tecla e o título a leva:

```tsx
        {FERRAMENTAS.map((f) => (
          <button
            key={f.qual} type="button" title={`${f.dica} (${f.tecla})`}
            className={`btn btn-sm ${ferramenta === f.qual && !verTodas ? "primary" : "secondary"}`}
            onClick={() => { setFerramenta(f.qual); setVerTodas(false); }}
          >
            <Icone referencia={f.icone} className="size-4" />
            {f.rotulo}
            <span className="text-[0.7rem] opacity-60">{f.tecla}</span>
          </button>
        ))}
```

e o "Ver todas":

```tsx
        <button
          type="button" title="Ver todas as peças do tamanho (T)"
          className={`btn btn-sm ${verTodas ? "primary" : "secondary"}`} onClick={() => setVerTodas((v) => !v)}
        >
          <Icone referencia="icones.svg#layers" className="size-4" />
          Ver todas
          <span className="text-[0.7rem] opacity-60">T</span>
        </button>
```

(f) Trocar o `<span className="ml-auto text-[0.78rem] text-tinta-fraca">…Roda do mouse aproxima.</span>` por:

```tsx
        <div className="ml-auto flex items-center gap-1 text-[0.78rem]">
          <button
            type="button" className="btn secondary btn-sm" title="Peça anterior (PgUp)" aria-label="Peça anterior"
            disabled={posicaoDaPeca <= 1} onClick={() => irParaPeca(-1)}
          >
            <Icone referencia="icones.svg#chevron-left" className="size-4" />
          </button>
          <span className="tabular-nums text-tinta-fraca">peça {posicaoDaPeca} de {grupos.length}</span>
          <button
            type="button" className="btn secondary btn-sm" title="Próxima peça (PgDn)" aria-label="Próxima peça"
            disabled={posicaoDaPeca === 0 || posicaoDaPeca >= grupos.length} onClick={() => irParaPeca(1)}
          >
            <Icone referencia="icones.svg#chevron-right" className="size-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-linha" />
          <button
            type="button" className="btn secondary btn-sm" title="Afastar (F3)" aria-label="Afastar"
            disabled={semDesenho} onClick={() => comandos.current?.afastar()}
          >
            <Icone referencia="icones.svg#zoom-out" className="size-4" />
          </button>
          <span className="w-12 text-center tabular-nums text-tinta-fraca">{porcento}%</span>
          <button
            type="button" className="btn secondary btn-sm" title="Aproximar (F2)" aria-label="Aproximar"
            disabled={semDesenho} onClick={() => comandos.current?.aproximar()}
          >
            <Icone referencia="icones.svg#zoom-in" className="size-4" />
          </button>
          <button
            type="button" className="btn secondary btn-sm" title="Enquadrar a peça (F4)"
            disabled={semDesenho} onClick={() => comandos.current?.enquadrar()}
          >
            Enquadrar
          </button>
        </div>
```

(g) Na `<Mesa … />`, depois de `chaveDoEnquadre=…` (da Tarefa 2):

```tsx
            comandos={comandos}
            aoMudarPorcento={setPorcento}
```

(h) No `aoEscolherPeca` da `<Mesa>` (o clique numa peça no Ver todas) nada muda.

- [ ] **Step 5: A lista rola até a peça escolhida**

Em `src/telas/montagem/ListaDePecas.tsx`:

(a) `import { useEffect, useRef, useState } from "react";`

(b) Dentro de `ListaDePecas`, logo depois dos `useState` do começo:

```tsx
  // A peça escolhida pelo teclado (PgUp/PgDn) não pode sumir da coluna: ela rola até a peça.
  const escolhida = useRef<HTMLButtonElement>(null);
  useEffect(() => { escolhida.current?.scrollIntoView?.({ block: "nearest" }); }, [grupo]);
```

(c) No `<button>` de cada peça da lista (o que tem `onClick={() => aoEscolherGrupo(g.grupo)}`), acrescentar:

```tsx
                ref={g.grupo === grupo ? escolhida : undefined}
```

- [ ] **Step 6: Rodar tudo e commit**

Run: `npm run bancada:navegacao && npm run tipos && npm run bancada:editor && node bancada/conferir-revisao-front.cjs`
Expected: os OKs, `tsc` sem erro, a revisão do front passando.

```bash
git add src/telas/montagem/useTeclasDaMontagem.ts src/telas/montagem/MesaDeMontagem.tsx src/telas/montagem/ListaDePecas.tsx bancada/cenarios-da-navegacao.tsx
git commit -F - <<'EOF'
As teclas do jeito do Corel na Montagem, e a barra com a peça N de M, o zoom e o Enquadrar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Conferência completa

**Files:** nenhum novo; só verificação (e correção, se algo aparecer).

- [ ] **Step 1: Rodar tudo o que o CI roda**

```bash
npm run tipos && for s in revisao conferir encolher complemento folga conferencia tamanhos moldes-pecas montagem graduacao nos editor envio navegacao risco-pdf medida; do npm run -s bancada:$s || { echo "FALHOU: $s"; break; }; done
```

Expected: cada bancada imprime o seu "OK — …" e nenhum "FALHOU".

- [ ] **Step 2: Na tela do app (para a pessoa conferir)**

Uma calça comprida abre inteira; a roda aproxima no ponteiro; F2/F3/F4 e o − % + / Enquadrar da barra fazem o mesmo; espaço + arrastar e o botão do meio andam a vista sem pôr pique nem mexer nó; PgDn/PgUp e `[`/`]` trocam peça e tamanho (parando nas pontas); F10/P/O/I/G trocam a ferramenta; T liga e desliga o Ver todas; digitar no nome do molde ou na "Linha em volta" não troca nada; a lista de peças rola até a escolhida.
