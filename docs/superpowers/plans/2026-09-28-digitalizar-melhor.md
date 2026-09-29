# Digitalizar melhor — Plano de Implementação

> **2026-09-29:** as tarefas da parte **B** deste plano (vários nós, Virar reta/curva,
> girar) foram substituídas pelo editor estilo Corel — spec
> `2026-09-29-editor-estilo-corel-design.md`, com plano próprio. Quando chegar a vez
> da parte **A** (o último trabalho da fila), este plano é refeito só com ela.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O traço das peças recortadas sai limpo (retas retas, cantos no lugar, curvas suaves, poucos nós, sem pegar a faixa da mesa) e o editor de nós passa a mexer em vários nós de uma vez (mover, apagar, Virar reta, Virar curva), com girar a peça na Montagem.

**Architecture:** O motor da foto (`src/motores/moldeDaImagem.js`) ganha três etapas novas, cada uma num arquivo puro e testável — máscara pela cor da mesa e faixas (`mesaDaFoto.js`), borda refinada na foto cheia (`bordaRefinada.js`) e retas por votação (`retasDaBorda.js`) —, e o ajuste de curvas (`ajusteDeCurvas.js`) aceita as retas prontas e põe o canto no cruzamento delas. As contas de edição em grupo moram em `edicaoDeNos.js` e `montagem.js`; o Digitalizar e a Mesa da Montagem só ligam eventos. Uma bancada nova mede o motor contra fotos da fábrica com gabarito.

**Tech Stack:** React 19 + TypeScript (tela), JavaScript ESM puro (motores), Node 24 + `node:assert` (bancadas), esbuild (`bancada/carregarModulo.mjs` carrega motor ESM na bancada), Puppeteer (bancada de fotos, que precisa do Chrome para ler BMP).

**Spec:** `docs/superpowers/specs/2026-09-28-digitalizar-melhor-design.md`

## Global Constraints

- Nenhuma dependência nova no `package.json` (só scripts).
- O formato do nó não muda: `{ x, y, entrada, saida, canto, retaDepois }`. Editor, Montagem, PDF, SVG e Encaixe não mudam por causa da parte A.
- Motor é conta pura: recebe e devolve listas NOVAS, nunca altera o que recebeu (o desfazer guarda a lista antiga).
- Tolerâncias do motor em **células da grade** (800 no lado maior da foto); metas da bancada em **mm** via `mmPorCelula` do gabarito (1,6 nas fotos da mesa do laser).
- Peça que encosta na borda da foto continua valendo, com o aviso de hoje; só FAIXA (fina, comprida, correndo ao longo da borda) sai.
- Etapa nova que não se aplica cai no jeito de hoje naquela etapa e avisa — nunca pior que hoje.
- As fotos da fábrica não entram no git. A bancada de fotos lê de `OPTMIZE_FOTOS_DA_BANCADA` (padrão `D:\arte\photo da laser`) e pula com aviso as que não achar.
- Metas da bancada de fotos: toda peça achada e nenhuma a mais; nós ≤ 1,5× o esperado; lado reto do gabarito sem nó no meio; canto do gabarito com nó `canto` a ≤ 3 mm; desvio médio ≤ 1 mm e 95% dos pontos ≤ 2 mm.
- A peça nunca fica com menos de 3 nós. Cada ação de grupo é **um** passo de Desfazer.
- Código, nomes, comentários e mensagens em português, no tom dos arquivos vizinhos (comentário explica o PORQUÊ).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Foto sem mesa reconhecível** (fundo liso claro, sem esteira): a máscara pela mesa devolve `null` e o motor tem de cair no Otsu de hoje, com aviso, e ainda achar a peça — pinado na Task 3 (`corDaMesa` → `null`) e na Task 6 (fundo liso ponta a ponta).
2. **Peça cortada pelo quadro** (encosta embaixo, como na `Nova pasta`): não pode ser confundida com faixa — pinado na Task 3 e na Task 6.
3. **Seleção que passa pelo nó 0** (ex.: nós n-2, n-1, 0, 1): virar reta/curva e mover têm de tratar como UMA sequência — pinado na Task 10.
4. **Apagar em grupo que deixaria menos de 3 nós**: recusa inteira, sem apagar metade — pinado nas Tasks 10 e 11.
5. **Foto de 18 megapixels** (as BMP da fábrica têm 54 MB): o refino não pode ler a foto inteira em resolução original — a foto de refino é limitada a 3200 px no lado maior (Task 6) e o refino só amostra em volta do contorno (Task 4).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/motores/mesaDaFoto.js` (novo) | faixa preta do quadro, cor da mesa, máscara pela cor da mesa, "é faixa da borda?" |
| `src/motores/bordaRefinada.js` (novo) | leva cada ponto do contorno da grade para a borda de verdade na foto cheia |
| `src/motores/retasDaBorda.js` (novo) | acha os lados retos por votação (RANSAC contíguo) |
| `src/motores/ajusteDeCurvas.js` | `umaCubicaPara` (exportado), `retasDadas` e canto no cruzamento, conserto do `canto` |
| `src/motores/moldeDaImagem.js` | encadeia as etapas; opção `foto`; avisos novos |
| `src/motores/edicaoDeNos.js` | seleção e ações em grupo, girar nós |
| `src/motores/montagem.js` | ações em grupo com piques, girar a peça |
| `src/telas/risco/desenhoDeNos.ts` | desenha vários nós selecionados |
| `src/telas/montagem/Mesa.tsx`, `MesaDeMontagem.tsx`, `PainelDaPeca.tsx` | seleção, retângulo, barra de ações, girar |
| `src/telas/Digitalizar.tsx` | foto de refino; seleção e barra de ações |
| `bancada/conferir-digitalizar-sintetico.mjs` (novo) | casos sintéticos das etapas A (roda no CI) |
| `bancada/fotos/medidas.mjs` (novo) | as contas das metas (gabarito → verdade, desvio, retas, cantos) |
| `bancada/conferir-digitalizar.mjs` (novo) | roda o motor nas fotos da fábrica e mede contra o gabarito |
| `bancada/fotos/*.gabarito.json` (novos) | gabaritos conferidos pela fábrica |
| `bancada/conferir-molde-da-imagem.cjs` | conserto: SVG/PDF agora saem da Montagem |
| `.github/workflows/conferir.yml` | passo novo com as bancadas de Digitalizar/Montagem |

---

### Task 1: A bancada antiga do Digitalizar volta a passar, e o CI roda as bancadas da Montagem

A `bancada:molde-imagem` falha desde a Montagem: procura "Baixar em SVG" no Digitalizar, que virou "Continuar para a montagem". E o CI não roda `nos`, `margem` nem `montagem`.

**Files:**
- Modify: `bancada/conferir-molde-da-imagem.cjs:560-660` (seções "O SVG" e "O PDF")
- Modify: `.github/workflows/conferir.yml` (passo novo no fim)

**Interfaces:**
- Consumes: a Montagem existente — botões "SVG" e "PDF" em `BarraDaMontagem.tsx`, que baixam por `URL.createObjectURL` + `<a>.click()`; o SVG da Montagem tem os contornos dentro de `<g id="corte">`.
- Produces: nada novo.

- [ ] **Step 1: Rodar e ver falhar**

Run: `npm run bancada:molde-imagem`
Expected: FAIL com `não achei o botão de baixar em SVG.`

- [ ] **Step 2: Levar o SVG e o PDF para a Montagem**

Ler as linhas 555–660 do arquivo para ver como `window.__href` é capturado (o gancho que intercepta o `<a>` do download). Depois da conferência da medida (linha ~557), trocar a procura por "Baixar em SVG" por: clicar em "Continuar para a montagem", esperar `/montagem`, e clicar no botão da barra cujo texto é exatamente `SVG` (e depois `PDF`):

```js
    // ---- Para a Montagem: é de lá que saem o SVG e o PDF desde 2026-09-26 ----
    await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Continuar para a montagem/.test(x.textContent || ''));
      if (!b) throw new Error('não achei o botão "Continuar para a montagem".');
      b.click();
    });
    await p.waitForFunction(() => location.pathname === '/montagem', { timeout: 20000 })
      .catch(() => { throw new Error('o Digitalizar não abriu a Montagem.'); });
    await p.waitForFunction(() => /salvo/.test(document.body.innerText || ''), { timeout: 20000 });

    // ---- O SVG ----
    const clicou = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'SVG');
      if (!b) return false;
      b.click();
      return true;
    });
    assert.ok(clicou, 'não achei o botão SVG na barra da Montagem.');
```

Manter a leitura do `window.__href` que já existe logo depois. Fazer o mesmo no PDF: procurar o botão de texto exato `PDF`.

- [ ] **Step 3: Ler só o grupo de corte do SVG da Montagem**

O SVG da Montagem tem `<path>` também na costura. Nas funções `pecasDoSvg`, `nosDoSvg`, `posicoesDosNos` e `retasDoSvg` (linhas 228–310), trocar a fonte `svg` por só o miolo do grupo de corte:

```js
/** Só os contornos de corte: o SVG da Montagem tem também costura, piques, fio e textos. */
function soOCorte(svg) {
  const m = /<g id="corte"[^>]*>([\s\S]*?)<\/g>/.exec(svg);
  return m ? m[1] : svg;
}
```

e chamar `soOCorte(svg)` no começo de cada uma das quatro. Conferir que o parser aceita o formato do `caminhoDosNos` da Montagem (`M12.3 4.5 C1 2 3 4 5 6 L7 8 Z`, números separados por espaço); se o regex de números esperar vírgula, trocar por `/-?[\d.]+/g`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:molde-imagem`
Expected: termina com a linha de OK da bancada (a do fim do arquivo, linha ~729).

- [ ] **Step 5: O CI roda as bancadas da Montagem**

No fim de `.github/workflows/conferir.yml`, depois do passo "Conferência pela arte":

```yaml
      - name: Digitalizar e Montagem
        run: npm run bancada:nos && npm run bancada:margem && npm run bancada:montagem
```

(O passo ganha a bancada sintética na Task 2.)

- [ ] **Step 6: Commit**

```bash
git add bancada/conferir-molde-da-imagem.cjs .github/workflows/conferir.yml
git commit -m "A bancada do Digitalizar confere o SVG e o PDF na Montagem, e o CI roda as bancadas da Montagem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: O ajuste de curvas marca os cantos e sabe fazer uma curva só

Dois consertos no `ajusteDeCurvas.js`: (a) a marcação `canto: true` só rodava quando sobravam menos de 3 nós — no caminho normal nenhum nó saía canto; (b) `umaCubicaPara` exportado, para o "Virar curva" da Task 10.

**Files:**
- Create: `bancada/conferir-digitalizar-sintetico.mjs`
- Modify: `src/motores/ajusteDeCurvas.js` (fim de `curvasDoContorno`, ~linha 600–625; e função nova depois de `ajustarTrecho`)
- Modify: `package.json` (script), `.github/workflows/conferir.yml` (passo da Task 1)

**Interfaces:**
- Produces: `umaCubicaPara(pontos: {x,y}[]) → { curva: [p0, p1, p2, p3], erro: number } | null` — `p0`/`p3` são o primeiro/último ponto; `erro` é o maior afastamento, nas unidades dos pontos, entre a cúbica e a poligonal.
- Produces: `bancada/conferir-digitalizar-sintetico.mjs` com os helpers `quadradoDenso(lado, passo)` e `assert`, que as Tasks 3–6 estendem.

- [ ] **Step 1: Escrever a bancada que falha**

```js
/*
 * BANCADA — o motor do Digitalizar em casos que a gente desenha
 *
 *     npm run bancada:digitalizar-sintetico
 *
 * Roda no CI. Cada caso é o menor desenho que prova UMA etapa do motor; as
 * fotos da fábrica ficam na `bancada:digitalizar`, que não roda no CI.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const ajuste = await carregarModulo("src/motores/ajusteDeCurvas.js");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Um quadrado de lado `lado`, com um ponto a cada `passo`, na volta. */
export function quadradoDenso(lado, passo = 1) {
  const pts = [];
  for (let x = 0; x < lado; x += passo) pts.push({ x, y: 0 });
  for (let y = 0; y < lado; y += passo) pts.push({ x: lado, y });
  for (let x = lado; x > 0; x -= passo) pts.push({ x, y: lado });
  for (let y = lado; y > 0; y -= passo) pts.push({ x: 0, y });
  return pts;
}

// 1. Canto de verdade sai marcado como canto (o `canto` só era marcado quando
//    sobravam menos de 3 nós — no caminho normal, nunca).
{
  const nos = ajuste.curvasDoContorno(quadradoDenso(100));
  const quinas = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  for (const q of quinas) {
    const perto = nos.filter((n) => dist(n, q) < 1.5);
    assert.ok(perto.length > 0, `sem nó na quina ${JSON.stringify(q)}`);
    assert.ok(perto.some((n) => n.canto), `o nó da quina ${JSON.stringify(q)} não saiu canto`);
  }
}

// 2. Uma cúbica só: pontos tirados de uma cúbica voltam à mesma cúbica.
{
  const c = [{ x: 0, y: 0 }, { x: 10, y: 30 }, { x: 50, y: 30 }, { x: 60, y: 0 }];
  const na = (t) => {
    const u = 1 - t;
    return {
      x: u * u * u * c[0].x + 3 * u * u * t * c[1].x + 3 * u * t * t * c[2].x + t * t * t * c[3].x,
      y: u * u * u * c[0].y + 3 * u * u * t * c[1].y + 3 * u * t * t * c[2].y + t * t * t * c[3].y,
    };
  };
  const pts = Array.from({ length: 41 }, (_, k) => na(k / 40));
  const r = ajuste.umaCubicaPara(pts);
  assert.ok(r, "umaCubicaPara devolveu null");
  assert.ok(r.erro < 0.5, `erro ${r.erro} numa cúbica de verdade`);
  assert.ok(dist(r.curva[0], pts[0]) < 1e-9 && dist(r.curva[3], pts[40]) < 1e-9, "as pontas têm de ficar");
}

// 3. Um V (canto no meio) não cabe numa cúbica: o erro tem de aparecer.
{
  const pts = [];
  for (let k = 0; k <= 20; k++) pts.push({ x: k, y: k });
  for (let k = 1; k <= 20; k++) pts.push({ x: 20 + k, y: 20 - k });
  const r = ajuste.umaCubicaPara(pts);
  assert.ok(r.erro > 2, `um V coube numa cúbica com erro ${r.erro}`);
}

console.log("OK — o motor do Digitalizar confere nos casos desenhados.");
```

Em `package.json`, junto dos outros `bancada:*`:

```json
    "bancada:digitalizar-sintetico": "node bancada/conferir-digitalizar-sintetico.mjs",
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:digitalizar-sintetico`
Expected: FAIL em `o nó da quina ... não saiu canto`.

- [ ] **Step 3: Marcar os cantos sempre**

No fim de `curvasDoContorno` (hoje: `if (limpos.length >= 3) return limpos;` seguido do laço que marca cantos em `nos` e `return nos;`), trocar por:

```js
  /*
   * Os nós que caíram em cima de um canto detectado viram canto.
   *
   * Isto rodava só no plano B (menos de 3 nós limpos), então no caminho normal
   * NENHUM nó saía canto: o editor tratava toda quina como curva lisa, e
   * arrastar uma alça entortava o outro lado do bico.
   */
  const marcarCantos = (lista) => {
    for (const no of lista) {
      for (const ci of cantos) {
        if (dist(no, pontos[ci]) < 1.5) { no.canto = true; break; }
      }
    }
    return lista;
  };
  if (limpos.length >= 3) return marcarCantos(limpos);
  return marcarCantos(nos);
```

- [ ] **Step 4: `umaCubicaPara`**

Depois de `ajustarTrecho`:

```js
/**
 * Uma cúbica só para os pontos, com as pontas no primeiro e no último.
 *
 * É o "Virar curva" do editor: a pessoa escolhe um trecho e pede que ele seja
 * UMA curva. As tangentes das pontas saem de uns poucos pontos para dentro —
 * do vizinho imediato, um degrau de grade viraria a direção da curva inteira.
 * Devolve o erro para a tela recusar quando não cabe (um canto no meio).
 */
export function umaCubicaPara(pontos) {
  const n = pontos.length;
  if (n < 2) return null;
  const primeiro = pontos[0];
  const ultimo = pontos[n - 1];
  if (n === 2) {
    const terco = { x: (ultimo.x - primeiro.x) / 3, y: (ultimo.y - primeiro.y) / 3 };
    return {
      curva: [primeiro, { x: primeiro.x + terco.x, y: primeiro.y + terco.y },
        { x: ultimo.x - terco.x, y: ultimo.y - terco.y }, ultimo],
      erro: 0,
    };
  }
  const k = Math.min(3, n - 1);
  const t0 = direcao(primeiro, pontos[k]) || { x: 1, y: 0 };
  const t1 = direcao(ultimo, pontos[n - 1 - k]) || { x: -1, y: 0 };
  const t = aoLongo(pontos);
  const curva = cubicaPorMinimosQuadrados(pontos, t, t0, t1);
  return { curva, erro: maiorErro(pontos, t, curva).maior };
}
```

- [ ] **Step 5: Rodar e ver passar; as bancadas antigas continuam**

Run: `npm run bancada:digitalizar-sintetico && npm run bancada:molde-imagem`
Expected: as duas com OK. (A `molde-imagem` confere nós e retas no traço do Digitalizar — marcar canto não pode ter mudado contagem.)

- [ ] **Step 6: CI**

Em `.github/workflows/conferir.yml`, no passo "Digitalizar e Montagem":

```yaml
        run: npm run bancada:nos && npm run bancada:margem && npm run bancada:montagem && npm run bancada:digitalizar-sintetico
```

- [ ] **Step 7: Commit**

```bash
git add bancada/conferir-digitalizar-sintetico.mjs src/motores/ajusteDeCurvas.js package.json .github/workflows/conferir.yml
git commit -m "O ajuste de curvas marca os cantos de verdade e sabe fazer uma curva só

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A mesa pela cor, e as faixas que não são peça (A1, A2)

**Files:**
- Create: `src/motores/mesaDaFoto.js`
- Modify: `bancada/conferir-digitalizar-sintetico.mjs` (casos 4–8, antes do `console.log` final)

**Interfaces:**
- Produces:
  - `foraDoQuadro(dados: Uint8ClampedArray, cols, rows, { escuro = 20, fracao = 0.9 }?) → Uint8Array` (1 = faixa preta do quadro, colada à borda)
  - `corDaMesa(dados, cols, rows, fora, { anel = 0.06, fatiaMinima = 0.4 }?) → { r, g, b, fatia } | null`
  - `mascaraPelaMesa(dados, cols, rows, fora, mesa) → { bits: Uint8Array, limiar: number }`
  - `ehFaixaDaBorda({ caixa: {minX,minY,maxX,maxY,largura,altura}, area }, cols, rows, { razao = 12, cobertura = 0.6 }?) → boolean`

- [ ] **Step 1: Os casos que falham**

Acrescentar ao topo da bancada (depois do `ajuste`):

```js
const mesa = await carregarModulo("src/motores/mesaDaFoto.js");

/**
 * Pinta uma "foto" RGBA: fundo, depois cada forma (polígono) com a sua cor.
 * `textura` alterna o fundo em xadrez de 2x2, imitando a esteira perfurada.
 * `ruido` (uma semente) troca o fundo por cor aleatória pixel a pixel: um
 * fundo sem cor dominante, onde não existe "a cor da mesa".
 */
export function pintar(cols, rows, { fundo, textura = 0, formas = [], faixaPreta = 0, ruido = 0 }) {
  const dados = new Uint8ClampedArray(cols * rows * 4);
  let semente = ruido >>> 0;
  const sorteio = () => { semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0; return semente >>> 24; };
  const dentro = (x, y, poli) => {
    let d = false;
    for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
      const a = poli[i]; const b = poli[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) d = !d;
    }
    return d;
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let cor = ruido ? [sorteio(), sorteio(), sorteio()] : fundo;
      if (!ruido && textura && ((x >> 1) + (y >> 1)) % 2) cor = fundo.map((v) => v + textura);
      for (const f of formas) if (dentro(x + 0.5, y + 0.5, f.poli)) cor = f.cor;
      if (y < faixaPreta) cor = [0, 0, 0];
      const p = (y * cols + x) * 4;
      dados[p] = cor[0]; dados[p + 1] = cor[1]; dados[p + 2] = cor[2]; dados[p + 3] = 255;
    }
  }
  return dados;
}
const ret = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
```

E os casos:

```js
// 4. A faixa preta do quadro fica "fora da foto"; a mesa, não.
{
  const d = pintar(100, 80, { fundo: [60, 60, 66], textura: 12, faixaPreta: 8 });
  const fora = mesa.foraDoQuadro(d, 100, 80);
  assert.equal(fora[5 * 100 + 50], 1, "a linha 5 é faixa preta");
  assert.equal(fora[20 * 100 + 50], 0, "a linha 20 é mesa");
}

// 5. A cor da mesa sai da borda, mesmo com a esteira texturizada e uma peça clara grande.
{
  const d = pintar(100, 80, {
    fundo: [60, 60, 66], textura: 12, faixaPreta: 8,
    formas: [{ poli: ret(20, 20, 80, 70), cor: [205, 195, 175] }],
  });
  const fora = mesa.foraDoQuadro(d, 100, 80);
  const m = mesa.corDaMesa(d, 100, 80, fora);
  assert.ok(m, "a mesa tinha de ser achada");
  assert.ok(Math.abs(m.r - 66) < 12 && Math.abs(m.b - 72) < 12, `mesa estimada ${JSON.stringify(m)}`);
  const { bits } = mesa.mascaraPelaMesa(d, 100, 80, fora, m);
  assert.equal(bits[40 * 100 + 50], 1, "o meio da peça é peça");
  assert.equal(bits[12 * 100 + 5], 0, "a mesa não é peça");
  assert.equal(bits[3 * 100 + 50], 0, "a faixa preta não é peça");
}

// 6. Fundo sem cor dominante (ruído): não há mesa reconhecível — null, e o motor cai no Otsu.
{
  const d = pintar(60, 60, { ruido: 12345 });
  assert.equal(mesa.corDaMesa(d, 60, 60, new Uint8Array(3600)), null, "sem cor dominante no anel, null");
}

// 7. Faixa comprida colada na borda é faixa; peça cortada pelo quadro, não.
{
  const faixa = { caixa: { minX: 0, minY: 0, maxX: 800, maxY: 30, largura: 800, altura: 30 }, area: 800 * 30 };
  assert.equal(mesa.ehFaixaDaBorda(faixa, 800, 600), true);
  const cortada = { caixa: { minX: 300, minY: 400, maxX: 520, maxY: 599, largura: 220, altura: 199 }, area: 220 * 199 };
  assert.equal(mesa.ehFaixaDaBorda(cortada, 800, 600), false, "peça cortada embaixo continua peça");
  const solta = { caixa: { minX: 100, minY: 100, maxX: 700, maxY: 120, largura: 600, altura: 20 }, area: 600 * 20 };
  assert.equal(mesa.ehFaixaDaBorda(solta, 800, 600), false, "comprida mas no meio da mesa não é faixa da borda");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:digitalizar-sintetico`
Expected: FAIL ao carregar `src/motores/mesaDaFoto.js` (não existe).

- [ ] **Step 3: Escrever `src/motores/mesaDaFoto.js`**

```js
/**
 * ===========================================================================
 * A MESA DA FOTO — o que é mesa, o que é peça, e o que não é nada
 * ===========================================================================
 *
 * A máscara de antes era UM limiar de brilho para a foto inteira (Otsu), com a
 * polaridade decidida pela borda da imagem. As fotos da mesa do laser têm uma
 * faixa PRETA em cima (o quadro da câmera) e uma faixa CLARA na beira (o filme
 * da mesa), e as duas puxavam esse limiar: na `NAILSON/PEDAços.bmp` a faixa
 * virou "a maior peça" e as duas peças de verdade foram descartadas como
 * sujeira (menores que 8% da maior).
 *
 * Aqui a pergunta muda: não "é claro?", mas "é da cor da MESA?". A mesa é o
 * que mais aparece no ANEL da foto (a peça fica no meio; a mesa, em volta), e
 * peça é o que se afasta dessa cor — em cor e brilho juntos.
 */

const luz = (d, p) => (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;

/** As linhas e colunas quase pretas coladas à borda: o quadro, não a mesa. */
export function foraDoQuadro(dados, cols, rows, { escuro = 20, fracao = 0.9 } = {}) {
  const fora = new Uint8Array(cols * rows);
  const linhaEscura = (y) => {
    let n = 0;
    for (let x = 0; x < cols; x++) if (luz(dados, (y * cols + x) * 4) < escuro) n++;
    return n >= cols * fracao;
  };
  const colunaEscura = (x) => {
    let n = 0;
    for (let y = 0; y < rows; y++) if (luz(dados, (y * cols + x) * 4) < escuro) n++;
    return n >= rows * fracao;
  };
  for (let y = 0; y < rows && linhaEscura(y); y++) fora.fill(1, y * cols, (y + 1) * cols);
  for (let y = rows - 1; y >= 0 && linhaEscura(y); y--) fora.fill(1, y * cols, (y + 1) * cols);
  for (let x = 0; x < cols && colunaEscura(x); x++) for (let y = 0; y < rows; y++) fora[y * cols + x] = 1;
  for (let x = cols - 1; x >= 0 && colunaEscura(x); x--) for (let y = 0; y < rows; y++) fora[y * cols + x] = 1;
  return fora;
}

/**
 * A cor da mesa: a mais comum no ANEL da foto (os `anel` de fora de cada lado).
 *
 * Cor quantizada em 16 níveis por canal; a caixa da moda e as vizinhas (±1)
 * contam como mesa, e a cor é a média delas. Se a mesa não domina o anel
 * (`fatiaMinima`), não há mesa reconhecível: `null`, e quem chama volta ao
 * Otsu de sempre.
 */
export function corDaMesa(dados, cols, rows, fora, { anel = 0.06, fatiaMinima = 0.4 } = {}) {
  const ax = Math.max(1, Math.round(cols * anel));
  const ay = Math.max(1, Math.round(rows * anel));
  const noAnel = (x, y) => x < ax || y < ay || x >= cols - ax || y >= rows - ay;
  const caixas = new Uint32Array(4096);
  let validos = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (fora[i] || !noAnel(x, y)) continue;
      const p = i * 4;
      caixas[((dados[p] >> 4) << 8) | ((dados[p + 1] >> 4) << 4) | (dados[p + 2] >> 4)]++;
      validos++;
    }
  }
  if (validos === 0) return null;
  let moda = 0;
  for (let k = 1; k < 4096; k++) if (caixas[k] > caixas[moda]) moda = k;
  const mr = moda >> 8; const mg = (moda >> 4) & 15; const mb = moda & 15;
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (fora[i] || !noAnel(x, y)) continue;
      const p = i * 4;
      if (Math.abs((dados[p] >> 4) - mr) <= 1 && Math.abs((dados[p + 1] >> 4) - mg) <= 1
        && Math.abs((dados[p + 2] >> 4) - mb) <= 1) {
        r += dados[p]; g += dados[p + 1]; b += dados[p + 2]; n++;
      }
    }
  }
  if (n < validos * fatiaMinima) return null;
  return { r: r / n, g: g / n, b: b / n, fatia: n / validos };
}

/** O limiar que melhor parte o histograma em dois (Otsu). */
function limiarDeOtsu(hist, total) {
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * hist[i];
  let somaAbaixo = 0; let pesoAbaixo = 0; let melhor = -1; let limiar = 127;
  for (let t = 0; t < 256; t++) {
    pesoAbaixo += hist[t];
    if (pesoAbaixo === 0) continue;
    const pesoAcima = total - pesoAbaixo;
    if (pesoAcima === 0) break;
    somaAbaixo += t * hist[t];
    const entre = pesoAbaixo * pesoAcima * (somaAbaixo / pesoAbaixo - (soma - somaAbaixo) / pesoAcima) ** 2;
    if (entre > melhor) { melhor = entre; limiar = t; }
  }
  return limiar;
}

/**
 * Peça = longe da cor da mesa. A distância (RGB) vai para um histograma e o
 * Otsu escolhe onde partir — é a mesma régua de antes, só que medindo "quão
 * diferente da mesa" em vez de "quão claro".
 */
export function mascaraPelaMesa(dados, cols, rows, fora, mesa) {
  const total = cols * rows;
  const distancia = new Uint8Array(total);
  const hist = new Uint32Array(256);
  let contados = 0;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    if (fora[i]) continue;
    const d = Math.min(255, Math.hypot(dados[p] - mesa.r, dados[p + 1] - mesa.g, dados[p + 2] - mesa.b) | 0);
    distancia[i] = d;
    hist[d]++;
    contados++;
  }
  const limiar = limiarDeOtsu(hist, contados);
  const bits = new Uint8Array(total);
  for (let i = 0; i < total; i++) bits[i] = !fora[i] && distancia[i] > limiar ? 1 : 0;
  return { bits, limiar };
}

/**
 * Faixa da borda: fina e comprida, correndo AO LONGO de uma borda que ela
 * toca. A peça cortada pelo quadro também toca a borda, mas não corre ao longo
 * dela — e essa continua sendo peça (as de corpo da `Nova pasta`).
 */
export function ehFaixaDaBorda({ caixa, area }, cols, rows, { razao = 12, cobertura = 0.6 } = {}) {
  const deitada = caixa.largura >= caixa.altura;
  const comprimento = deitada ? caixa.largura : caixa.altura;
  const espessura = area / Math.max(comprimento, 1);
  if (comprimento / Math.max(espessura, 1) < razao) return false;
  if (deitada) return comprimento >= cols * cobertura && (caixa.minY <= 1 || caixa.maxY >= rows - 2);
  return comprimento >= rows * cobertura && (caixa.minX <= 1 || caixa.maxX >= cols - 2);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:digitalizar-sintetico`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/motores/mesaDaFoto.js bancada/conferir-digitalizar-sintetico.mjs
git commit -m "O Digitalizar aprende a cor da mesa e a separar a faixa da borda da peça

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A borda refinada na foto cheia (A3)

**Files:**
- Create: `src/motores/bordaRefinada.js`
- Modify: `bancada/conferir-digitalizar-sintetico.mjs` (caso 8)

**Interfaces:**
- Consumes: `pintar`, `ret` da bancada (Task 3).
- Produces: `refinarBorda(contorno: {x,y}[], foto: { dados, largura, altura } | null, escala: number, { alcance = 2, minimoDeContraste = 24, janela = 5 }?) → {x,y}[]` — mesmo comprimento e ordem do contorno, em unidades da GRADE; `escala` = pixels da foto por célula (`foto.largura / cols`).

- [ ] **Step 1: O caso que falha**

```js
const borda = await carregarModulo("src/motores/bordaRefinada.js");

// 8. O contorno da grade (degrau de uma célula) vai para a borda de verdade da foto cheia.
{
  const escala = 4;
  // Na foto cheia (400x400) a borda esquerda da peça fica em x = 161 px = 40,25 células.
  const foto = {
    dados: pintar(400, 400, { fundo: [60, 60, 66], textura: 10, formas: [{ poli: ret(161, 80, 320, 320), cor: [205, 195, 175] }] }),
    largura: 400, altura: 400,
  };
  // O contorno da grade veio 0,75 célula para fora (x = 41) — o degrau da grade.
  const contorno = [];
  for (let y = 25; y <= 75; y += 1) contorno.push({ x: 41, y });
  for (let x = 41; x <= 80; x += 1) contorno.push({ x, y: 75 });
  for (let y = 75; y >= 25; y -= 1) contorno.push({ x: 80, y });
  for (let x = 80; x >= 41; x -= 1) contorno.push({ x, y: 25 });
  const r = borda.refinarBorda(contorno, foto, escala);
  assert.equal(r.length, contorno.length, "o refino não muda o número de pontos");
  const lado = r.slice(5, 45);
  const media = lado.reduce((s, p) => s + Math.abs(p.x - 40.25), 0) / lado.length;
  assert.ok(media < 0.3, `a borda esquerda ficou, em média, a ${media.toFixed(2)} célula da de verdade`);
  assert.equal(borda.refinarBorda(contorno, null, escala)[0].x, 41, "sem foto, fica o ponto da grade");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:digitalizar-sintetico`
Expected: FAIL ao carregar `bordaRefinada.js`.

- [ ] **Step 3: Escrever `src/motores/bordaRefinada.js`**

```js
/**
 * ===========================================================================
 * BORDA REFINADA — da escada da grade para a beira de verdade do papel
 * ===========================================================================
 *
 * O contorno sai de uma grade de 800 células, e cada célula da mesa do laser
 * vale ~1,6 mm: a borda vem em degraus, e a textura da esteira e a sombra do
 * papel entram como dentes. O ajuste de curvas trata dente como forma — daí os
 * 39 nós numa peça de 8 lados (`NAILSON/2 BANDA.bmp`).
 *
 * Aqui cada ponto anda pela NORMAL do contorno, na foto em resolução maior
 * (até 4× a grade), e para onde a cor muda mais: é ali que o papel vira mesa.
 * A mediana na janela é o que segura a textura — um furo da esteira puxa um
 * ponto, não cinco seguidos; a borda do papel é contínua.
 */

export function refinarBorda(contorno, foto, escala, { alcance = 2, minimoDeContraste = 24, janela = 5 } = {}) {
  const n = contorno.length;
  if (!foto || n < 5 || !(escala > 0)) return contorno.map((p) => ({ x: p.x, y: p.y }));

  /** Média 3x3 em volta do pixel (da foto) mais perto. */
  const cor = (x, y) => {
    const cx = Math.round(x); const cy = Math.round(y);
    let r = 0; let g = 0; let b = 0; let k = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = cx + dx; const py = cy + dy;
        if (px < 0 || py < 0 || px >= foto.largura || py >= foto.altura) continue;
        const p = (py * foto.largura + px) * 4;
        r += foto.dados[p]; g += foto.dados[p + 1]; b += foto.dados[p + 2]; k++;
      }
    }
    return k ? [r / k, g / k, b / k] : null;
  };

  const normais = new Array(n);
  const deslocamento = new Float64Array(n);
  const achou = new Uint8Array(n);
  const passos = Math.max(2, Math.round(alcance * escala));

  for (let i = 0; i < n; i++) {
    const a = contorno[(i - 2 + n) % n];
    const b = contorno[(i + 2) % n];
    const tx = b.x - a.x; const ty = b.y - a.y;
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-9) { normais[i] = null; continue; }
    const nx = -ty / tl; const ny = tx / tl;
    normais[i] = { x: nx, y: ny };
    const p = contorno[i];
    const amostras = [];
    for (let s = -passos; s <= passos; s++) {
      const d = s / escala;
      amostras.push({ d, c: cor((p.x + nx * d) * escala, (p.y + ny * d) * escala) });
    }
    let melhor = -1; let onde = 0;
    for (let k = 1; k < amostras.length - 1; k++) {
      const c0 = amostras[k - 1].c; const c1 = amostras[k + 1].c;
      if (!c0 || !c1) continue;
      const g = Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
      if (g > melhor) { melhor = g; onde = amostras[k].d; }
    }
    if (melhor >= minimoDeContraste) { deslocamento[i] = onde; achou[i] = 1; }
  }

  const meia = Math.floor(janela / 2);
  return contorno.map((p, i) => {
    const normal = normais[i];
    if (!normal) return { x: p.x, y: p.y };
    const vizinhos = [];
    for (let k = -meia; k <= meia; k++) {
      const j = (i + k + n) % n;
      if (achou[j]) vizinhos.push(deslocamento[j]);
    }
    if (vizinhos.length === 0) return { x: p.x, y: p.y };
    vizinhos.sort((u, v) => u - v);
    const d = vizinhos[Math.floor(vizinhos.length / 2)];
    return { x: p.x + normal.x * d, y: p.y + normal.y * d };
  });
}
```

(Os pontos da grade vêm em coordenadas em que a célula `x` cobre a foto de `x·escala` a `(x+1)·escala`, a mesma conta que o Digitalizar usa para desenhar — `emTela = p.x * px`. Por isso `* escala` sem meio pixel.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:digitalizar-sintetico`
Expected: OK. Se a média ficar entre 0,3 e 0,6 por meio pixel sistemático, o problema é o centro da célula: somar `0.5` na conversão `cor((p.x + nx * d) * escala - 0.5, ...)` e rodar de novo — não relaxar o teste.

- [ ] **Step 5: Commit**

```bash
git add src/motores/bordaRefinada.js bancada/conferir-digitalizar-sintetico.mjs
git commit -m "O contorno da grade vai para a borda de verdade na foto cheia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Retas por votação, e o canto no cruzamento delas (A4, A5)

**Files:**
- Create: `src/motores/retasDaBorda.js`
- Modify: `src/motores/ajusteDeCurvas.js` (`curvasDoContorno`: opção `retasDadas`; montagem das `partes`; posição dos nós)
- Modify: `bancada/conferir-digitalizar-sintetico.mjs` (casos 9–10)

**Interfaces:**
- Produces: `retasPorVotacao(pontos: {x,y}[], { tolerancia = 1.5, comprimentoMinimo = 25, minimoDePontos = 6, tentativas = 300, grausColinear = 4, semente = 7 }?) → { inicio: number, fim: number, linha: { o: {x,y}, d: {x,y} } }[]` — `inicio`/`fim` são índices do contorno fechado (a corrida vai de `inicio` até `fim` andando para a frente, podendo dar a volta); `d` é unitário.
- Produces: `curvasDoContorno(pontos, { ...opções de hoje, retasDadas?: saída de retasPorVotacao })`.

- [ ] **Step 1: Os casos que falham**

```js
const retas = await carregarModulo("src/motores/retasDaBorda.js");

/** Retângulo 200x100 com serrinha de ±0,6 nos lados (a sombra e a textura). */
function retanguloComSerrinha() {
  const pts = [];
  const serra = (k) => (k % 4 < 2 ? 0.6 : -0.6);
  for (let x = 0; x < 200; x++) pts.push({ x, y: serra(x) });
  for (let y = 0; y < 100; y++) pts.push({ x: 200 + serra(y), y });
  for (let x = 200; x > 0; x--) pts.push({ x, y: 100 + serra(x) });
  for (let y = 100; y > 0; y--) pts.push({ x: serra(y), y });
  return pts;
}

// 9. Quatro lados com serrinha saem como quatro retas.
{
  const r = retas.retasPorVotacao(retanguloComSerrinha());
  assert.equal(r.length, 4, `achou ${r.length} retas num retângulo`);
  for (const q of r) assert.ok(Math.abs(Math.hypot(q.linha.d.x, q.linha.d.y) - 1) < 1e-9, "direção unitária");
}

// 10. Com as retas dadas, o retângulo sai com 4 nós, todos canto, no cruzamento das retas.
{
  const pts = retanguloComSerrinha();
  const nos = ajuste.curvasDoContorno(pts, { retasDadas: retas.retasPorVotacao(pts) });
  assert.equal(nos.length, 4, `saíram ${nos.length} nós num retângulo`);
  const quinas = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];
  for (const q of quinas) {
    const no = nos.find((n) => dist(n, q) < 0.8);
    assert.ok(no, `nenhum nó a menos de 0,8 da quina ${JSON.stringify(q)}`);
    assert.ok(no.canto, "o nó da quina é canto");
  }
  assert.ok(nos.every((n) => n.retaDepois), "os quatro lados são retos");
}

// 11. Um lado curvo continua curva: retângulo com o topo em arco.
{
  const pts = [];
  for (let k = 0; k <= 60; k++) { const a = Math.PI - (k / 60) * Math.PI; pts.push({ x: 100 + 100 * Math.cos(a), y: -40 * Math.sin(a) }); }
  for (let y = 1; y < 100; y++) pts.push({ x: 200, y });
  for (let x = 200; x > 0; x--) pts.push({ x, y: 100 });
  for (let y = 100; y > 0; y--) pts.push({ x: 0, y });
  const nos = ajuste.curvasDoContorno(pts, { retasDadas: retas.retasPorVotacao(pts) });
  assert.ok(nos.length <= 6, `${nos.length} nós num retângulo com um arco`);
  assert.ok(nos.some((n) => !n.retaDepois), "o arco continua curva");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:digitalizar-sintetico`
Expected: FAIL ao carregar `retasDaBorda.js`.

- [ ] **Step 3: Escrever `src/motores/retasDaBorda.js`**

```js
/**
 * ===========================================================================
 * RETAS DA BORDA — os lados retos, por votação
 * ===========================================================================
 *
 * A varredura de antes (`trechosRetos`, no ajuste de curvas) estica a reta
 * enquanto TODO ponto couber na corda: um dente de sombra no meio do lado
 * parte a reta em duas, e cada pedaço curto demais volta a ser curva — os nós
 * a mais nos lados retos das fotos da fábrica.
 *
 * Aqui é RANSAC com uma regra de molde: a reta candidata passa por dois pontos
 * sorteados, e vale o TRECHO CONTÍGUO de pontos que cabem nela (um lado de
 * molde é contínuo; dois lados paralelos não são a mesma reta). Vence o trecho
 * mais comprido; ele sai da urna e sorteia-se de novo. No fim, a reta de cada
 * trecho é refeita por mínimos quadrados totais — dois pontos sorteados
 * carregam o ruído deles; o trecho inteiro, não.
 *
 * Sorteio com semente fixa: a mesma foto dá sempre o mesmo traço.
 */

function sorteador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const aReta = (p, o, d) => Math.abs((p.x - o.x) * d.y - (p.y - o.y) * d.x);

/** Reta de mínimos quadrados totais: pelo centróide, na direção de maior espalhamento. */
function ajustarReta(pts) {
  let mx = 0; let my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= pts.length; my /= pts.length;
  let sxx = 0; let syy = 0; let sxy = 0;
  for (const p of pts) { const dx = p.x - mx; const dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const angulo = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { o: { x: mx, y: my }, d: { x: Math.cos(angulo), y: Math.sin(angulo) } };
}

/** Os pontos de `inicio` até `fim`, andando para a frente e dando a volta se preciso. */
function trecho(pontos, inicio, fim) {
  const n = pontos.length;
  const saida = [];
  for (let q = inicio; ; q = (q + 1) % n) { saida.push(pontos[q]); if (q === fim || saida.length > n) break; }
  return saida;
}

export function retasPorVotacao(pontos, {
  tolerancia = 1.5, comprimentoMinimo = 25, minimoDePontos = 6, tentativas = 300, grausColinear = 4, semente = 7,
} = {}) {
  const n = pontos.length;
  if (n < minimoDePontos * 2) return [];
  const livre = new Uint8Array(n).fill(1);
  const sorte = sorteador(semente);
  const achadas = [];

  for (;;) {
    let melhor = null;
    for (let k = 0; k < tentativas; k++) {
      const i = Math.floor(sorte() * n);
      if (!livre[i]) continue;
      const salto = minimoDePontos + Math.floor(sorte() * Math.max(1, Math.min(n / 3, 60)));
      const j = (i + salto) % n;
      if (!livre[j]) continue;
      const dx = pontos[j].x - pontos[i].x; const dy = pontos[j].y - pontos[i].y;
      const l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      const d = { x: dx / l, y: dy / l }; const o = pontos[i];
      let ini = i; let fim = i; let passos = 0;
      while (passos < n - 1) {
        const q = (fim + 1) % n;
        if (!livre[q] || aReta(pontos[q], o, d) > tolerancia) break;
        fim = q; passos++;
      }
      while (passos < n - 1) {
        const q = (ini - 1 + n) % n;
        if (!livre[q] || aReta(pontos[q], o, d) > tolerancia) break;
        ini = q; passos++;
      }
      if (passos + 1 < minimoDePontos) continue;
      const comprimento = Math.hypot(pontos[fim].x - pontos[ini].x, pontos[fim].y - pontos[ini].y);
      if (comprimento < comprimentoMinimo) continue;
      if (!melhor || comprimento > melhor.comprimento) melhor = { ini, fim, quantos: passos + 1, comprimento };
    }
    if (!melhor) break;
    const dentro = [];
    for (let k = 0, q = melhor.ini; k < melhor.quantos; k++, q = (q + 1) % n) { dentro.push(pontos[q]); livre[q] = 0; }
    achadas.push({ inicio: melhor.ini, fim: melhor.fim, linha: ajustarReta(dentro) });
  }

  achadas.sort((a, b) => a.inicio - b.inicio);

  // Vizinhas quase colineares (um dente partiu o lado em dois) viram uma.
  const limite = Math.cos((grausColinear * Math.PI) / 180);
  const colada = (a, b) => b.inicio === a.fim || b.inicio === (a.fim + 1) % n;
  const paralela = (a, b) => Math.abs(a.linha.d.x * b.linha.d.x + a.linha.d.y * b.linha.d.y) >= limite;
  for (let k = 0; achadas.length > 1 && k < achadas.length; ) {
    const a = achadas[k];
    const kb = (k + 1) % achadas.length;
    const b = achadas[kb];
    if (a !== b && colada(a, b) && paralela(a, b)) {
      const unida = { inicio: a.inicio, fim: b.fim, linha: ajustarReta(trecho(pontos, a.inicio, b.fim)) };
      achadas.splice(k, 1, unida);
      achadas.splice(kb > k ? kb : 0, 1);
      if (kb === 0) k = Math.max(0, k - 1);
    } else {
      k++;
    }
  }
  return achadas;
}
```

- [ ] **Step 4: `retasDadas` no `curvasDoContorno`**

Em `src/motores/ajusteDeCurvas.js`:

1. Na assinatura, acrescentar `retasDadas = null,` depois de `minimoEntreNos = 4,`.
2. Trocar `const retas = trechosRetos(...)` por:

```js
  // Com as retas prontas (votação sobre a borda refinada), elas mandam; sem
  // elas, a varredura gulosa de sempre.
  const retas = retasDadas
    ? retasDadas.map((r) => [r.inicio, r.fim])
    : trechosRetos(pontos, toleranciaDeReta, minimoDePontosNaReta, minimoDeComprimentoDaReta);
```

3. Logo depois de `const passosEntre = ...` (é preciso dele), o achador da reta de um trecho:

```js
  /*
   * A reta dada que cobre o trecho — pelo MEIO dele, e não pelas pontas: as
   * pontas das corridas passam pela fusão de quebras vizinhas (`minimoEntreQuebras`)
   * e mudam de índice, e uma busca exata `inicio:fim` perderia a reta do lado
   * justo no canto, onde ela mais importa. A sobra de 4 passos impede que o
   * trecho que engoliu o joelho do lado vizinho herde a reta.
   */
  const dentroDaCorrida = (i, r) => (i - r.inicio + n) % n <= (r.fim - r.inicio + n) % n;
  const linhaDoTrecho = (a, b) => {
    if (!retasDadas) return null;
    const meio = (a + Math.floor(passosEntre(a, b) / 2)) % n;
    const r = retasDadas.find((q) => dentroDaCorrida(meio, q));
    if (!r) return null;
    return passosEntre(a, b) - passosEntre(r.inicio, r.fim) <= 4 ? r.linha : null;
  };
```

4. No laço das `partes`, trocar `if (ehReta(ini, fim)) { partes.push({ reta: true, de: ..., ate: ... }); continue; }` por:

```js
    const linhaDada = linhaDoTrecho(ini, fim);
    if (linhaDada || ehReta(ini, fim)) {
      partes.push({ reta: true, de: trecho[0], ate: trecho[trecho.length - 1], linha: linhaDada });
      continue;
    }
```

5. No laço que monta os `nos` (o `for (let k = 0; k < partes.length; k++)`), antes do `nos.push`, levar o nó para a reta — e para o cruzamento quando as duas partes vizinhas são retas dadas:

```js
    let pos = { x: p.x, y: p.y };
    let canto = false;
    const la = anterior.reta ? anterior.linha : null;
    const lb = atual.reta ? atual.linha : null;
    if (la && lb) {
      const c = cruzamento(la, lb);
      if (c && dist(c, p) < 3 * toleranciaDeReta) { pos = c; canto = true; }
      else pos = naReta(p, lb);
    } else if (lb) pos = naReta(p, lb);
    else if (la) pos = naReta(p, la);
    nos.push({
      x: pos.x,
      y: pos.y,
      entrada: anterior.reta ? { ...pos } : { x: chega.x, y: chega.y },
      saida: atual.reta ? { ...pos } : { x: sai.x, y: sai.y },
      canto,
      retaDepois: !!atual.reta,
    });
```

(no lugar do `nos.push` de hoje), com os dois helpers antes do laço:

```js
  const naReta = (q, l) => {
    const t = (q.x - l.o.x) * l.d.x + (q.y - l.o.y) * l.d.y;
    return { x: l.o.x + l.d.x * t, y: l.o.y + l.d.y * t };
  };
  /** Onde duas retas se cruzam; `null` se forem quase paralelas (menos de 4°). */
  const cruzamento = (l1, l2) => {
    const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
    if (Math.abs(den) < Math.sin((4 * Math.PI) / 180)) return null;
    const t = ((l2.o.x - l1.o.x) * l2.d.y - (l2.o.y - l1.o.y) * l2.d.x) / den;
    return { x: l1.o.x + l1.d.x * t, y: l1.o.y + l1.d.y * t };
  };
```

Atenção: a curva que chega a um nó movido tem a alça de chegada (`chega`) calculada para o ponto antigo; o deslocamento é menor que a tolerância da reta, e o nó continua sendo o fim da cúbica — nada mais a fazer.

- [ ] **Step 5: Rodar tudo**

Run: `npm run bancada:digitalizar-sintetico && npm run bancada:molde-imagem`
Expected: as duas OK (sem `retasDadas`, nada mudou para a `molde-imagem`).

- [ ] **Step 6: Commit**

```bash
git add src/motores/retasDaBorda.js src/motores/ajusteDeCurvas.js bancada/conferir-digitalizar-sintetico.mjs
git commit -m "Os lados retos saem por votação, e o canto fica no cruzamento das retas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: O motor encadeia as etapas, e o Digitalizar manda a foto cheia

**Files:**
- Modify: `src/motores/moldeDaImagem.js` (`riscosDosPixels`, ~linhas 309–445)
- Modify: `src/telas/Digitalizar.tsx` (`procurar`, ~linhas 171–215)
- Modify: `bancada/conferir-digitalizar-sintetico.mjs` (casos 12–13)

**Interfaces:**
- Consumes: `foraDoQuadro`, `corDaMesa`, `mascaraPelaMesa`, `ehFaixaDaBorda` (Task 3); `refinarBorda` (Task 4); `retasPorVotacao` (Task 5).
- Produces: `riscosDosPixels(dados, cols, rows, { ...as de hoje, foto?: { dados, largura, altura } })` — a saída ganha `faixas: number` (quantas faixas saíram), e `limiar`/`fundoEhClaro` continuam (ninguém fora do motor os lê).

- [ ] **Step 1: Os casos que falham**

```js
const imagem = await carregarModulo("src/motores/moldeDaImagem.js");
const moldes = await carregarModulo("src/motores/moldes.js");
const opcoesDoMotor = { contornar: moldes.contornosDasManchas, aliviar: moldes.aliviarContorno };

/** A mesa da PEDAços: faixa preta em cima, faixa clara na direita, duas peças pequenas. */
function mesaComFaixas(escala) {
  const e = (poli) => poli.map((p) => ({ x: p.x * escala, y: p.y * escala }));
  return pintar(200 * escala, 150 * escala, {
    fundo: [58, 60, 66], textura: 14, faixaPreta: 10 * escala,
    formas: [
      { poli: e(ret(193, 10, 200, 150)), cor: [225, 228, 232] },
      { poli: e(ret(60, 70, 90, 110)), cor: [210, 200, 182] },
      { poli: e([{ x: 110, y: 60 }, { x: 150, y: 60 }, { x: 160, y: 90 }, { x: 130, y: 120 }, { x: 110, y: 110 }]), cor: [210, 200, 182] },
    ],
  });
}

// 12. As duas peças pequenas são achadas; a faixa clara sai como faixa, e o retângulo tem 4 nós.
{
  const r = imagem.riscosDosPixels(mesaComFaixas(1), 200, 150, {
    ...opcoesDoMotor, foto: { dados: mesaComFaixas(4), largura: 800, altura: 600 },
  });
  assert.ok(!r.erro, r.erro);
  assert.equal(r.riscos.length, 2, `achou ${r.riscos.length} peças`);
  assert.ok(r.faixas >= 1, "a faixa clara da direita tinha de sair como faixa");
  assert.ok(r.avisos.some((a) => /faixa/.test(a)), "o aviso fala da faixa");
  const retangulo = r.riscos.find((q) => q.caixa.maxX < 100);
  assert.ok(retangulo.nos.length <= 5, `o retângulo saiu com ${retangulo.nos.length} nós`);
}

// 13. Fundo sem mesa reconhecível (ruído): cai no Otsu de sempre, avisa, e acha a peça escura.
{
  const semMesa = (escala) => pintar(120 * escala, 90 * escala, {
    ruido: 777,
    formas: [{ poli: ret(30 * escala, 20 * escala, 90 * escala, 70 * escala), cor: [12, 10, 8] }],
  });
  const r = imagem.riscosDosPixels(semMesa(1), 120, 90, { ...opcoesDoMotor, foto: { dados: semMesa(4), largura: 480, altura: 360 } });
  assert.ok(!r.erro, r.erro);
  assert.equal(r.riscos.length, 1, `achou ${r.riscos.length} peças no fundo de ruído`);
  assert.ok(r.avisos.some((a) => /mesa/.test(a)), "avisa que não reconheceu a mesa");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:digitalizar-sintetico`
Expected: FAIL no caso 12 (hoje a faixa entra como peça, ou `r.faixas` é `undefined`).

- [ ] **Step 3: Encadear no `riscosDosPixels`**

Em `src/motores/moldeDaImagem.js`:

```js
import { corDaMesa, ehFaixaDaBorda, foraDoQuadro, mascaraPelaMesa } from "./mesaDaFoto";
import { refinarBorda } from "./bordaRefinada";
import { retasPorVotacao } from "./retasDaBorda";
```

Na assinatura de `riscosDosPixels`, acrescentar `foto = null,`. Trocar a linha `const { bits, limiar, fundoEhClaro } = mascaraDasPecas(dados, cols, rows);` por:

```js
  const avisos = [];
  const fora = foraDoQuadro(dados, cols, rows);
  const mesa = corDaMesa(dados, cols, rows, fora);
  let bits; let limiar; let fundoEhClaro;
  if (mesa) {
    ({ bits, limiar } = mascaraPelaMesa(dados, cols, rows, fora, mesa));
    fundoEhClaro = (mesa.r * 299 + mesa.g * 587 + mesa.b * 114) / 1000 > 127;
  } else {
    ({ bits, limiar, fundoEhClaro } = mascaraDasPecas(dados, cols, rows));
    for (let i = 0; i < bits.length; i++) if (fora[i]) bits[i] = 0;
    avisos.push("Não reconheci a cor da mesa nessa foto; separei as peças só pelo brilho, como antes.");
  }
```

e apagar a declaração `const avisos = [];` que existe mais abaixo (ela passa a vir daqui).

Logo depois de `const medidos = ...sort(...)`, tirar as faixas antes da maior:

```js
  const faixas = medidos.filter((m) => ehFaixaDaBorda(m, cols, rows));
  const semFaixas = medidos.filter((m) => !ehFaixaDaBorda(m, cols, rows));
  if (semFaixas.length === 0) return { erro: "Só achei as faixas da beira da mesa, nenhuma peça." };
```

e usar `semFaixas` no lugar de `medidos` em `const maior = ...`, no `valem = ...filter` e no cálculo de `descartadas` (`semFaixas.length - valem.length`). Depois do aviso de descartadas:

```js
  if (faixas.length > 0) {
    avisos.push(`Deixei de fora ${faixas.length} faixa(s) da beira da mesa (o filme ou a borda da esteira).`);
  }
```

e trocar o texto do aviso de descartadas para `... mancha(s) pequena(s) ou fina(s) — sujeira na mesa ou sombra.` (a parte do "brilho do filme" agora é da faixa).

No `map` das peças, entre o suavizar e o aliviar, e com as retas:

```js
      const escala = foto ? foto.largura / cols : 0;
      const suave = suavizarContorno(m.contorno, passadasDeSuavizacao);
      const refinado = foto ? refinarBorda(suave, foto, escala) : suave;
      const contorno = aliviar(refinado, alivio);
      if (contorno.length < 3) return null;
      const retasDadas = foto ? retasPorVotacao(contorno, {
        ...(toleranciaDeReta === undefined ? {} : { tolerancia: toleranciaDeReta }),
        ...(minimoDeComprimentoDaReta === undefined ? {} : { comprimentoMinimo: minimoDeComprimentoDaReta }),
        ...(minimoDePontosNaReta === undefined ? {} : { minimoDePontos: minimoDePontosNaReta }),
      }) : null;
```

(no lugar do `const contorno = aliviar(suavizarContorno(...), alivio);`) e passar `retasDadas` para `curvasDoContorno(contorno, { ..., retasDadas })`. Sem `foto`, o caminho é o de hoje.

No `return` final: `return { riscos, fundoEhClaro, limiar, descartadas, faixas: faixas.length, avisos };`.

- [ ] **Step 4: Rodar**

Run: `npm run bancada:digitalizar-sintetico && npm run bancada:molde-imagem`
Expected: as duas OK. A `molde-imagem` passa pela tela do Digitalizar — depois do Step 5 ela exercita o caminho com `foto`; rodar de novo lá.

- [ ] **Step 5: O Digitalizar manda a foto de refino**

Em `src/telas/Digitalizar.tsx`, junto das constantes do topo:

```ts
/**
 * O lado maior da foto usada para refinar a borda. As BMP da fábrica têm
 * ~18 megapixels (54 MB): ler a original inteira seria 72 MB de RGBA por foto.
 * 3200 px é 4× a grade — sobra resolução para a borda, e o refino só amostra
 * em volta do contorno.
 */
const LADO_DA_FOTO_DE_REFINO = 3200;
```

Em `procurar`, depois de montar a grade (`gtx.drawImage(...)`):

```ts
        const reducao = Math.min(1, LADO_DA_FOTO_DE_REFINO / Math.max(larguraOriginal, alturaOriginal));
        const larguraDaFoto = Math.max(cols, Math.round(larguraOriginal * reducao));
        const alturaDaFoto = Math.max(rows, Math.round(alturaOriginal * reducao));
        const cheia = document.createElement("canvas");
        cheia.width = larguraDaFoto;
        cheia.height = alturaDaFoto;
        const ctxCheia = cheia.getContext("2d", { willReadFrequently: true });
        if (!ctxCheia) throw new Error("o navegador não deu um canvas para trabalhar.");
        ctxCheia.imageSmoothingQuality = "high";
        ctxCheia.drawImage(img, 0, 0, larguraDaFoto, alturaDaFoto);
```

e passar `foto: { dados: ctxCheia.getImageData(0, 0, larguraDaFoto, alturaDaFoto).data, largura: larguraDaFoto, altura: alturaDaFoto },` nas opções do `riscosDosPixels`.

- [ ] **Step 6: Tipos, build e as bancadas**

Run: `npm run tipos && npm run front && npm run bancada:digitalizar-sintetico && npm run bancada:molde-imagem`
Expected: tudo OK.

- [ ] **Step 7: Commit**

```bash
git add src/motores/moldeDaImagem.js src/telas/Digitalizar.tsx bancada/conferir-digitalizar-sintetico.mjs dist
git commit -m "O Digitalizar separa a mesa pela cor, refina a borda na foto cheia e acha as retas por votação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: A bancada das fotos da fábrica (infraestrutura e contas)

**Files:**
- Create: `bancada/fotos/medidas.mjs`
- Create: `bancada/conferir-digitalizar.mjs`
- Modify: `package.json` (script `bancada:digitalizar`)
- Modify: `.gitignore` (nada de foto: `bancada/fotos/*.bmp`, `*.png` gerados em `bancada/fotos/ver/`)

**Interfaces:**
- Gabarito (`bancada/fotos/<nome>.gabarito.json`):

```json
{
  "foto": "NAILSON/2 BANDA.bmp",
  "mmPorCelula": 1.6,
  "pecas": [
    {
      "cantos": [[120.5, 210.0], [640.2, 200.1], [612.0, 380.4]],
      "lados": ["reta", "curva", "reta"],
      "curvas": { "1": [[660.0, 260.3], [645.1, 330.8]] }
    }
  ]
}
```

Coordenadas em células da grade de 800 (flutuantes). `lados[i]` vai de `cantos[i]` até `cantos[i+1]` (o último fecha no primeiro); `curvas[i]` são pontos por onde a curva do lado `i` passa, na ordem.
- Produces (`medidas.mjs`): `verdadeDaPeca(peca) → {x,y}[]` (poligonal densa), `nosEsperados(peca) → number`, `medirPeca(nos, peca, mmPorCelula, achatar) → { nos, esperados, retasQuebradas, cantosFaltando, desvioMedioMm, desvio95Mm }`, `casarPecas(riscos, gabarito) → [{ risco, peca } | { risco: null, peca } | { risco, peca: null }]`.

- [ ] **Step 1: As contas, com um teste delas mesmas**

`bancada/fotos/medidas.mjs`:

```js
/**
 * As contas das metas da bancada de fotos, separadas para poderem ser
 * testadas sozinhas (um erro aqui aprovaria um motor ruim).
 */

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const P = ([x, y]) => ({ x, y });

/** Catmull-Rom pelos pontos, `passos` por intervalo, sem repetir as pontas do meio. */
function catmullRom(pts, passos = 16) {
  const saida = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < passos; k++) {
      const t = k / passos; const t2 = t * t; const t3 = t2 * t;
      saida.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return saida;
}

/** A borda de verdade da peça do gabarito, como poligonal densa fechada. */
export function verdadeDaPeca(peca) {
  const cantos = peca.cantos.map(P);
  const saida = [];
  for (let i = 0; i < cantos.length; i++) {
    const a = cantos[i]; const b = cantos[(i + 1) % cantos.length];
    if (peca.lados[i] === "curva") {
      saida.push(...catmullRom([a, ...(peca.curvas?.[String(i)] || []).map(P), b]));
    } else {
      for (let k = 0; k < 16; k++) saida.push({ x: a.x + ((b.x - a.x) * k) / 16, y: a.y + ((b.y - a.y) * k) / 16 });
    }
  }
  return saida;
}

/** Quantos nós a peça pede: um por canto e um a mais por lado curvo. */
export function nosEsperados(peca) {
  return peca.cantos.length + peca.lados.filter((l) => l === "curva").length;
}

function aoSegmento(p, u, v) {
  const dx = v.x - u.x; const dy = v.y - u.y; const t2 = dx * dx + dy * dy;
  const t = t2 > 0 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / t2)) : 0;
  return Math.hypot(u.x + t * dx - p.x, u.y + t * dy - p.y);
}
function aoPoligono(p, poli) {
  let menor = Infinity;
  for (let i = 0; i < poli.length; i++) menor = Math.min(menor, aoSegmento(p, poli[i], poli[(i + 1) % poli.length]));
  return menor;
}

export function medirPeca(nos, peca, mmPorCelula, achatar) {
  const verdade = verdadeDaPeca(peca);
  const traco = achatar(nos);
  const tolCanto = 3 / mmPorCelula;

  // Desvio nos dois sentidos: o traço à verdade e a verdade ao traço.
  const desvios = [...traco.map((p) => aoPoligono(p, verdade)), ...verdade.map((p) => aoPoligono(p, traco))]
    .map((d) => d * mmPorCelula).sort((a, b) => a - b);
  const desvioMedioMm = desvios.reduce((s, d) => s + d, 0) / desvios.length;
  const desvio95Mm = desvios[Math.floor(desvios.length * 0.95)];

  // Lado reto sem nó no meio (do 10% ao 90% do lado, a menos de 3 mm dele).
  const cantos = peca.cantos.map(P);
  let retasQuebradas = 0;
  peca.lados.forEach((lado, i) => {
    if (lado !== "reta") return;
    const a = cantos[i]; const b = cantos[(i + 1) % cantos.length];
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const noMeio = nos.some((n) => {
      const t = ((n.x - a.x) * (b.x - a.x) + (n.y - a.y) * (b.y - a.y)) / l2;
      return t > 0.1 && t < 0.9 && aoSegmento(n, a, b) < tolCanto;
    });
    if (noMeio) retasQuebradas++;
  });

  // Canto de verdade (ângulo entre os lados < 150°) com nó canto a ≤ 3 mm.
  let cantosFaltando = 0;
  cantos.forEach((c, i) => {
    const antes = cantos[(i - 1 + cantos.length) % cantos.length]; const depois = cantos[(i + 1) % cantos.length];
    const u = { x: antes.x - c.x, y: antes.y - c.y }; const v = { x: depois.x - c.x, y: depois.y - c.y };
    const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
    const graus = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (graus >= 150) return;
    if (!nos.some((n) => n.canto && dist(n, c) <= tolCanto)) cantosFaltando++;
  });

  return { nos: nos.length, esperados: nosEsperados(peca), retasQuebradas, cantosFaltando, desvioMedioMm, desvio95Mm };
}

/** Casa cada peça do gabarito com o risco de centro mais perto (a menos de 40 células). */
export function casarPecas(riscos, gabarito) {
  const centro = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
  const livres = new Set(riscos.map((_, i) => i));
  const pares = gabarito.pecas.map((peca) => {
    const c = centro(peca.cantos.map(P));
    let melhor = null; let menor = 40;
    for (const i of livres) {
      const d = dist(centro(riscos[i].nos), c);
      if (d < menor) { menor = d; melhor = i; }
    }
    if (melhor !== null) livres.delete(melhor);
    return { risco: melhor === null ? null : riscos[melhor], peca };
  });
  for (const i of livres) pares.push({ risco: riscos[i], peca: null });
  return pares;
}
```

E no fim de `bancada/conferir-digitalizar-sintetico.mjs` (antes do `console.log`), um caso que prova as contas:

```js
// 14. As contas da bancada de fotos: um quadrado perfeito contra o seu gabarito dá zero.
{
  const medidas = await import("./fotos/medidas.mjs");
  const peca = { cantos: [[0, 0], [100, 0], [100, 100], [0, 100]], lados: ["reta", "reta", "reta", "reta"] };
  const reto = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });
  const nos = [reto(0, 0), reto(100, 0), reto(100, 100), reto(0, 100)];
  const m = medidas.medirPeca(nos, peca, 1.6, ajuste.achatarCurvas);
  assert.equal(m.retasQuebradas, 0); assert.equal(m.cantosFaltando, 0);
  assert.ok(m.desvioMedioMm < 1e-6, `desvio ${m.desvioMedioMm}`);
  const comNoNoMeio = [reto(0, 0), reto(50, 0), reto(100, 0), reto(100, 100), reto(0, 100)];
  assert.equal(medidas.medirPeca(comNoNoMeio, peca, 1.6, ajuste.achatarCurvas).retasQuebradas, 1);
}
```

- [ ] **Step 2: Rodar**

Run: `npm run bancada:digitalizar-sintetico`
Expected: OK (caso 14 incluso).

- [ ] **Step 3: O corredor das fotos**

`bancada/conferir-digitalizar.mjs` — roda o motor DENTRO do Chrome do Puppeteer (é ele que lê BMP), com a mesma redução que o Digitalizar faz:

```js
/*
 * BANCADA — o Digitalizar contra as fotos da fábrica
 *
 *     npm run bancada:digitalizar            mede e reprova se alguma meta falhar
 *     npm run bancada:digitalizar -- --ver   também grava PNGs com traço e gabarito em bancada/fotos/ver/
 *
 * As fotos NÃO estão no git (54 MB cada, e são da fábrica). A pasta vem de
 * OPTMIZE_FOTOS_DA_BANCADA (padrão D:\arte\photo da laser); foto que não
 * existir é pulada com aviso. Os gabaritos ficam em bancada/fotos/.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import puppeteer from "puppeteer";
import { casarPecas, medirPeca } from "./fotos/medidas.mjs";
import { carregarModulo } from "./carregarModulo.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = process.env.OPTMIZE_FOTOS_DA_BANCADA || "D:\\arte\\photo da laser";
const VER = process.argv.includes("--ver");
const { achatarCurvas } = await carregarModulo("src/motores/ajusteDeCurvas.js");

// O motor inteiro num script só, para rodar na página.
const motor = buildSync({
  stdin: {
    contents: `export { riscosDosPixels, CELULAS_NO_LADO_MAIOR } from './src/motores/moldeDaImagem';
      export { contornosDasManchas, aliviarContorno } from './src/motores/moldes';`,
    resolveDir: RAIZ,
  },
  bundle: true, write: false, format: "iife", globalName: "Motor", platform: "browser", logLevel: "silent",
}).outputFiles[0].text;

const gabaritos = fs.readdirSync(path.join(RAIZ, "bancada/fotos")).filter((f) => f.endsWith(".gabarito.json"));
if (gabaritos.length === 0) { console.log("Nenhum gabarito em bancada/fotos/ — nada a medir."); process.exit(0); }

const pagina = path.join(os.tmpdir(), "optmize-bancada-digitalizar.html");
fs.writeFileSync(pagina, `<!doctype html><meta charset="utf-8"><script>${motor}</script>`);

const navegador = await puppeteer.launch({ headless: true, args: ["--allow-file-access-from-files"] });
const p = await navegador.newPage();
await p.goto(pathToFileURL(pagina).href);

let falhas = 0;
const linhas = [];
for (const nomeDoGabarito of gabaritos) {
  const gabarito = JSON.parse(fs.readFileSync(path.join(RAIZ, "bancada/fotos", nomeDoGabarito), "utf8"));
  const arquivo = path.join(PASTA, gabarito.foto);
  if (!fs.existsSync(arquivo)) { console.log(`(pulei ${gabarito.foto}: não achei em ${PASTA})`); continue; }

  const r = await p.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const L = img.naturalWidth; const A = img.naturalHeight;
    const escala = Motor.CELULAS_NO_LADO_MAIOR / Math.max(L, A);
    const cols = Math.max(2, Math.round(L * escala)); const rows = Math.max(2, Math.round(A * escala));
    const desenhar = (w, h) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    };
    const reducao = Math.min(1, 3200 / Math.max(L, A));
    const fl = Math.max(cols, Math.round(L * reducao)); const fa = Math.max(rows, Math.round(A * reducao));
    const saida = Motor.riscosDosPixels(desenhar(cols, rows), cols, rows, {
      contornar: Motor.contornosDasManchas, aliviar: Motor.aliviarContorno,
      foto: { dados: desenhar(fl, fa), largura: fl, altura: fa },
    });
    return saida.erro ? { erro: saida.erro } : { riscos: saida.riscos.map((q) => ({ nos: q.nos })), avisos: saida.avisos };
  }, pathToFileURL(arquivo).href);

  if (r.erro) { falhas++; linhas.push(`${gabarito.foto}: ERRO — ${r.erro}`); continue; }
  for (const { risco, peca } of casarPecas(r.riscos, gabarito)) {
    if (!risco) { falhas++; linhas.push(`${gabarito.foto}: peça do gabarito NÃO achada`); continue; }
    if (!peca) { falhas++; linhas.push(`${gabarito.foto}: peça A MAIS (${risco.nos.length} nós)`); continue; }
    const m = medirPeca(risco.nos, peca, gabarito.mmPorCelula, achatarCurvas);
    const ok = m.nos <= 1.5 * m.esperados && m.retasQuebradas === 0 && m.cantosFaltando === 0
      && m.desvioMedioMm <= 1 && m.desvio95Mm <= 2;
    if (!ok) falhas++;
    linhas.push(`${ok ? "ok   " : "FALHA"} ${gabarito.foto.padEnd(28)} nós ${String(m.nos).padStart(3)}/${m.esperados}`
      + ` · retas quebradas ${m.retasQuebradas} · cantos faltando ${m.cantosFaltando}`
      + ` · desvio médio ${m.desvioMedioMm.toFixed(2)} mm · 95% ${m.desvio95Mm.toFixed(2)} mm`);
  }
  if (VER) await gravarVista(p, arquivo, r.riscos, gabarito, nomeDoGabarito);
}
await navegador.close();

console.log(linhas.join("\n"));
assert.equal(falhas, 0, `${falhas} meta(s) não cumprida(s) — ver a tabela acima.`);
console.log("OK — o Digitalizar cumpre as metas nas fotos da fábrica.");
```

`gravarVista` (no mesmo arquivo, antes do laço): desenha a foto reduzida para 1600 px no lado maior, o gabarito em VERDE (`verdadeDaPeca`) e o traço em LARANJA (os `nos` achatados), escala `1600 / 800 = 2` sobre as coordenadas de grade, e grava `bancada/fotos/ver/<nome>.png` com `page.evaluate` devolvendo `canvas.toDataURL()`:

```js
import { verdadeDaPeca } from "./fotos/medidas.mjs";
async function gravarVista(p, arquivo, riscos, gabarito, nome) {
  const traco = riscos.map((q) => achatarCurvas(q.nos));
  const verdade = gabarito.pecas.map(verdadeDaPeca);
  const png = await p.evaluate(async (url, traco, verdade) => {
    const img = new Image(); img.src = url; await img.decode();
    const k = 1600 / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, c.width, c.height);
    const porCelula = c.width / Math.round(img.naturalWidth * (800 / Math.max(img.naturalWidth, img.naturalHeight)));
    const linha = (pts, cor, largura) => {
      ctx.strokeStyle = cor; ctx.lineWidth = largura; ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x * porCelula, q.y * porCelula) : ctx.moveTo(q.x * porCelula, q.y * porCelula)));
      ctx.closePath(); ctx.stroke();
    };
    verdade.forEach((v) => linha(v, "#20e060", 3));
    traco.forEach((t) => linha(t, "#ff7a1a", 1.5));
    return c.toDataURL("image/png");
  }, pathToFileURL(arquivo).href, traco, verdade);
  fs.mkdirSync(path.join(RAIZ, "bancada/fotos/ver"), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, "bancada/fotos/ver", nome.replace(".gabarito.json", ".png")), Buffer.from(png.split(",")[1], "base64"));
}
```

`package.json`: `"bancada:digitalizar": "node bancada/conferir-digitalizar.mjs",`. `.gitignore`: acrescentar `bancada/fotos/ver/`.

- [ ] **Step 4: Rodar sem gabaritos**

Run: `npm run bancada:digitalizar`
Expected: `Nenhum gabarito em bancada/fotos/ — nada a medir.` e saída 0.

- [ ] **Step 5: Commit**

```bash
git add bancada/fotos/medidas.mjs bancada/conferir-digitalizar.mjs bancada/conferir-digitalizar-sintetico.mjs package.json .gitignore
git commit -m "A bancada mede o Digitalizar contra fotos da fábrica com gabarito

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Os gabaritos (com conferência da fábrica)

**Files:**
- Create: `bancada/fotos/2-banda.gabarito.json`, `segundo-molde.gabarito.json`, `pedacos.gabarito.json`, `nova-pasta-01.gabarito.json`, `nova-pasta-04.gabarito.json` e mais três fotos com curva (cava, gancho, gola) escolhidas nas pastas `D:\arte\photo da laser` e `lazer/` — olhar as fotos e escolher as que têm curva côncava de verdade.

**Interfaces:**
- Consumes: o formato de gabarito da Task 7; `npm run bancada:digitalizar -- --ver` para as vistas.

- [ ] **Step 1: Um rascunho por foto**

Para cada foto: rodar `npm run bancada:digitalizar -- --ver` com um gabarito de rascunho que tem só `{"foto": "...", "mmPorCelula": 1.6, "pecas": []}` — a bancada reprova ("peça A MAIS"), mas grava `bancada/fotos/ver/<nome>.png` com o traço atual em laranja. Abrir o PNG (ferramenta Read) e, olhando a FOTO (não o traço), anotar para cada peça: os cantos de verdade (em coordenadas de grade = pixel do PNG ÷ 2), o tipo de cada lado e 2–4 pontos por lado curvo.

- [ ] **Step 2: Gravar e ver o gabarito por cima da foto**

Escrever o JSON, rodar `npm run bancada:digitalizar -- --ver` de novo e conferir no PNG que a linha VERDE assenta na beira do papel em todas as peças (dar zoom com um recorte do PNG onde houver dúvida). Corrigir até assentar.

- [ ] **Step 3: CHECKPOINT — a fábrica confere**

PARAR. Mostrar à pessoa os 8 PNGs (`bancada/fotos/ver/*.png`) com a pergunta: "A linha verde é a borda certa de cada peça, com os cantos e as curvas no lugar?". Só seguir com o "sim"; o que ela apontar, corrigir e mostrar de novo.

- [ ] **Step 4: Commit**

```bash
git add bancada/fotos/*.gabarito.json
git commit -m "Os gabaritos das fotos da fábrica, conferidos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Calibrar até cumprir as metas

**Files:**
- Modify: `src/motores/moldeDaImagem.js` (padrões `ERRO_DE_CURVA_PADRAO` e os repassados ao `retasPorVotacao`), `src/motores/bordaRefinada.js` (padrões), `src/motores/mesaDaFoto.js` (padrões), `src/motores/ajusteDeCurvas.js` (a tabela de calibração no comentário, ~linha 360)

- [ ] **Step 1: A linha de base**

Run: `npm run bancada:digitalizar`
Guardar a tabela (é o "depois" das Tasks 3–6). Para o "antes", rodar a mesma bancada num worktree do commit anterior à Task 3 (`git worktree add ../antes <sha-da-task-2>`, copiar para lá `bancada/conferir-digitalizar.mjs`, `bancada/fotos/`, e rodar com o mesmo `OPTMIZE_FOTOS_DA_BANCADA`): o motor antigo ignora a opção `foto`. Copiar as duas tabelas para a mensagem do commit do Step 4.

- [ ] **Step 2: Varredura**

Para cada falha, mudar UM padrão por vez, na ordem: `minimoDeContraste` (refino: 16/24/36), `tolerancia` do `retasPorVotacao` (1,0/1,5/2,0), `comprimentoMinimo` (15/25/40), `ERRO_DE_CURVA_PADRAO` (1,5/2,0/2,5), `razao` da faixa (8/12/16). Rodar a bancada a cada mudança e anotar as colunas. Nunca mexer num gabarito para passar.

- [ ] **Step 3: Se não fechar**

Se depois da varredura alguma meta continuar falhando: PARAR e levar à pessoa a tabela antes/depois e os PNGs das peças que falham, com o que foi tentado. Não afrouxar meta sem ela decidir.

- [ ] **Step 4: Registrar e commit**

Atualizar o comentário da calibração em `ajusteDeCurvas.js` (a tabela "Os padrões saíram de medir") com a tabela nova, antes/depois, e as fotos usadas.

Run: `npm run bancada:digitalizar && npm run bancada:digitalizar-sintetico && npm run bancada:molde-imagem`
Expected: as três OK.

```bash
git add src/motores
git commit -m "Os padrões do Digitalizar calibrados contra as fotos da fábrica

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: As contas de mexer em vários nós

**Files:**
- Modify: `src/motores/edicaoDeNos.js` (funções novas no fim)
- Modify: `bancada/conferir-edicao-de-nos.mjs` (casos novos antes do `console.log` final)

**Interfaces:**
- Consumes: `umaCubicaPara` (Task 2), `pontoNoTrecho`, `clonarNos`.
- Produces:
  - `sequenciasDe(indices: number[], n: number) → number[][]` — cada sequência em ordem de volta; uma seleção de todos os nós dá `[[0..n-1]]`.
  - `moverNos(nos, indices, dx, dy) → nos`
  - `apagarNos(nos, indices) → nos | null` (`null` se sobrarem < 3)
  - `nosNoRetangulo(nos, a: {x,y}, b: {x,y}) → number[]`
  - `virarReta(nos, indices) → { nos, removidos: number[], sequencias: number[][] } | { erro: string }`
  - `virarCurva(nos, indices, erroMaximo) → { nos, removidos, sequencias } | { erro: string }`
  - `girarNos(nos, graus, centro: {x,y}) → nos`

- [ ] **Step 1: Os casos que falham**

```js
// --- Vários nós de uma vez ---
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

// 12. Apagar em grupo: nunca menos de 3, e recusa inteira (não apaga metade).
{
  assert.equal(m.apagarNos(octogono, [0, 1, 2]).length, 5);
  assert.equal(m.apagarNos(octogono, [0, 1, 2, 3, 4, 5]), null);
}

// 13. Retângulo de seleção.
assert.deepEqual(m.nosNoRetangulo(octogono, { x: 50, y: -10 }, { x: 110, y: 80 }).sort(), [0, 1]);

// 14. Virar reta pela volta do 0: os do meio saem e o trecho do primeiro ao último é reta.
{
  const curvos = octogono.map((n) => ({ ...n, retaDepois: false }));
  const r = m.virarReta(curvos, [7, 0, 1]);
  assert.equal(r.nos.length, 7, "o nó 0 (do meio) saiu");
  assert.deepEqual(r.removidos, [0]);
  const primeiro = r.nos.find((n) => perto(n, octogono[7]));
  assert.ok(primeiro.retaDepois, "o trecho do 7 ao 1 é reta");
  assert.ok(m.virarReta(curvos, [0, 1, 2, 3, 4, 5, 6, 7]).erro, "a volta inteira não vira reta");
}

// 15. Virar curva: um arco amostrado vira uma curva que passa perto dos nós tirados.
{
  const arco = Array.from({ length: 9 }, (_, k) => {
    const a = Math.PI - (k / 8) * Math.PI;
    return { x: 100 * Math.cos(a), y: -100 * Math.sin(a), entrada: null, saida: null, canto: false, retaDepois: true };
  }).map((n) => ({ ...n, entrada: { x: n.x, y: n.y }, saida: { x: n.x, y: n.y } }));
  const fechado = [...arco, reto(0, 60)];
  const r = m.virarCurva(fechado, [0, 1, 2, 3, 4, 5, 6, 7, 8], 5);
  assert.ok(!r.erro, r.erro);
  assert.equal(r.nos.length, 3, "sobram as duas pontas do arco e o nó de baixo");
  assert.equal(r.nos[0].retaDepois, false, "o trecho virou curva");
  const meio = m.pontoNoTrecho(r.nos, 0, 0.5);
  assert.ok(Math.hypot(meio.x, meio.y + 100) < 6, `o meio da curva ficou em ${JSON.stringify(meio)}`);
}

// 16. Virar curva com canto no meio recusa.
{
  const v = [reto(0, 0), reto(50, 50), reto(100, 0), reto(50, -80)];
  assert.ok(m.virarCurva(v, [0, 1, 2], 2).erro, "um V não vira uma curva");
}

// 17. Girar 4× 90° volta ao começo; 90° troca x e y em volta do centro.
{
  const centro = { x: 10, y: 20 };
  let r = octogono;
  for (let k = 0; k < 4; k++) r = m.girarNos(r, 90, centro);
  r.forEach((n, i) => assert.ok(perto(n, octogono[i], 1e-9)));
  const um = m.girarNos([reto(20, 20)], 90, centro)[0];
  assert.ok(perto(um, { x: 10, y: 30 }, 1e-9), `girou para ${JSON.stringify(um)}`);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:nos`
Expected: FAIL com `m.sequenciasDe is not a function`.

- [ ] **Step 3: As funções**

No fim de `src/motores/edicaoDeNos.js`:

```js
import { umaCubicaPara } from "./ajusteDeCurvas";

/*
 * ---------------------------------------------------------------------------
 * VÁRIOS NÓS DE UMA VEZ
 * ---------------------------------------------------------------------------
 *
 * A seleção é uma lista de índices. As ações que dependem de ORDEM (virar
 * reta, virar curva) trabalham por SEQUÊNCIA: nós escolhidos e vizinhos na
 * volta. A volta é fechada, então a sequência pode passar pelo nó 0 — por isso
 * a contagem começa depois de um nó NÃO escolhido, e nunca no 0.
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

export function moverNos(nos, indices, dx, dy) {
  const escolhido = new Set(indices);
  return nos.map((n, i) => (escolhido.has(i)
    ? { ...n, x: n.x + dx, y: n.y + dy, entrada: { x: n.entrada.x + dx, y: n.entrada.y + dy }, saida: { x: n.saida.x + dx, y: n.saida.y + dy } }
    : n));
}

/** Apaga os escolhidos. Se sobrarem menos de 3, não apaga NENHUM: `null`. */
export function apagarNos(nos, indices) {
  const fora = new Set(indices.filter((i) => i >= 0 && i < nos.length));
  if (nos.length - fora.size < 3) return null;
  return nos.filter((_, i) => !fora.has(i));
}

export function nosNoRetangulo(nos, a, b) {
  const x0 = Math.min(a.x, b.x); const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y); const y1 = Math.max(a.y, b.y);
  const saida = [];
  nos.forEach((n, i) => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) saida.push(i); });
  return saida;
}

/**
 * Troca cada sequência por UM trecho do primeiro ao último nó. `fazer(copia,
 * primeiro, ultimo, seq)` escreve o trecho novo em `copia` e pode devolver um
 * erro. Os nós do meio saem no fim, todos de uma vez.
 */
function trocarSequencias(nos, indices, fazer) {
  const sequencias = sequenciasDe(indices, nos.length).filter((s) => s.length >= 2);
  if (sequencias.length === 0) return { erro: "Escolha pelo menos dois nós vizinhos." };
  if (sequencias.some((s) => s.length === nos.length)) return { erro: "A volta inteira não vira um trecho só; deixe pelo menos um nó de fora." };
  const copia = clonarNos(nos);
  const removidos = [];
  for (const seq of sequencias) {
    const erro = fazer(copia, seq[0], seq[seq.length - 1], seq);
    if (erro) return { erro };
    removidos.push(...seq.slice(1, -1));
  }
  const fora = new Set(removidos);
  if (nos.length - fora.size < 3) return { erro: "A peça ficaria com menos de três nós." };
  return { nos: copia.filter((_, i) => !fora.has(i)), removidos: removidos.sort((a, b) => a - b), sequencias };
}

export function virarReta(nos, indices) {
  return trocarSequencias(nos, indices, (copia, primeiro, ultimo) => {
    const a = copia[primeiro]; const b = copia[ultimo];
    copia[primeiro] = { ...a, retaDepois: true, saida: { x: a.x, y: a.y } };
    copia[ultimo] = { ...b, entrada: { x: b.x, y: b.y } };
    return null;
  });
}

/** `erroMaximo` nas unidades dos nós (células no Digitalizar, cm na Montagem). */
export function virarCurva(nos, indices, erroMaximo) {
  return trocarSequencias(nos, indices, (copia, primeiro, ultimo, seq) => {
    const pontos = [];
    for (const i of seq.slice(0, -1)) for (let k = 0; k < 16; k++) pontos.push(pontoNoTrecho(nos, i, k / 16));
    pontos.push({ x: nos[ultimo].x, y: nos[ultimo].y });
    const ajuste = umaCubicaPara(pontos);
    if (!ajuste || ajuste.erro > erroMaximo) {
      return "Esse trecho não cabe numa curva só (tem um canto no meio?). Escolha um trecho menor.";
    }
    const [, p1, p2] = ajuste.curva;
    copia[primeiro] = { ...copia[primeiro], retaDepois: false, saida: { x: p1.x, y: p1.y } };
    copia[ultimo] = { ...copia[ultimo], entrada: { x: p2.x, y: p2.y } };
    return null;
  });
}

export function girarNos(nos, graus, centro) {
  const rad = (graus * Math.PI) / 180;
  const c = Math.cos(rad); const s = Math.sin(rad);
  const gira = (p) => ({
    x: centro.x + (p.x - centro.x) * c - (p.y - centro.y) * s,
    y: centro.y + (p.x - centro.x) * s + (p.y - centro.y) * c,
  });
  return nos.map((n) => ({ ...n, ...gira(n), entrada: gira(n.entrada), saida: gira(n.saida) }));
}
```

O `import` vai para o topo do arquivo (junto dos outros; hoje o arquivo não importa nada).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:nos`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/motores/edicaoDeNos.js bancada/conferir-edicao-de-nos.mjs
git commit -m "As contas de mexer em vários nós: mover, apagar, virar reta, virar curva e girar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Vários nós na peça da Montagem — piques, pontos, fio e girar

**Files:**
- Modify: `src/motores/montagem.js` (funções novas depois de `apagarNoDaPeca`)
- Modify: `bancada/conferir-montagem.mjs` (casos novos antes do `console.log` final)

**Interfaces:**
- Consumes: Task 10 inteira; `apagarNoDaPeca`, `pontoNoTrecho`, `achatarCurvas`, `caixaDe`.
- Produces:
  - `apagarNosDaPeca(peca, indices) → peca | null`
  - `virarTrechosNaPeca(peca, indices, jeito: "reta" | "curva", erroMaximo: number) → { peca } | { erro: string }`
  - `girarPeca(peca, graus) → peca`

- [ ] **Step 1: Os casos que falham**

Ler o topo de `bancada/conferir-montagem.mjs` para usar o mesmo carregador e a mesma peça de exemplo; acrescentar:

```js
// --- Vários nós na peça ---
{
  const reto = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });
  const nos = [reto(0, 0), reto(10, 0), reto(20, 0), reto(20, 10), reto(0, 10)];
  const base = {
    nos, papel: "frente", tamanho: "base", quantidade: 1, nome: "",
    marcacoes: { margem: 0, espelhar: false, fio: { x: 10, y: 5, angulo: 0, comprimento: 6 },
      piques: [{ no: 1, t: 0.5, profundidade: 0.5 }], pontos: [{ x: 5, y: 5 }] },
  };

  // Apagar em grupo leva o pique para o trecho que sobra; recusa se sobrarem < 3.
  const semDois = m.apagarNosDaPeca(base, [1, 2]);
  assert.equal(semDois.nos.length, 3);
  assert.equal(semDois.marcacoes.piques.length, 1);
  assert.equal(semDois.marcacoes.piques[0].no, 0, "o pique do trecho 1 foi para o trecho 0");
  assert.equal(m.apagarNosDaPeca(base, [0, 1, 2]), null);

  // Virar reta de 0 a 2: o pique que estava no meio do trecho 1 fica a 3/4 do trecho novo.
  const r = m.virarTrechosNaPeca(base, [0, 1, 2], "reta", 0.2);
  assert.ok(!r.erro, r.erro);
  assert.equal(r.peca.nos.length, 4);
  const q = r.peca.marcacoes.piques[0];
  assert.equal(q.no, 0);
  assert.ok(Math.abs(q.t - 0.75) < 1e-9, `t = ${q.t}`);

  // Girar 4× 90° devolve a peça (nós, pontos e fio); girar 90° troca largura e altura.
  let g = base;
  for (let k = 0; k < 4; k++) g = m.girarPeca(g, 90);
  const perto = (a, b) => Math.abs(a - b) < 1e-9;
  g.nos.forEach((n, i) => assert.ok(perto(n.x, base.nos[i].x) && perto(n.y, base.nos[i].y), `nó ${i} não voltou`));
  assert.ok(perto(g.marcacoes.pontos[0].x, 5) && perto(g.marcacoes.pontos[0].y, 5));
  assert.ok(perto(g.marcacoes.fio.x, 10) && perto(g.marcacoes.fio.y, 5) && perto(g.marcacoes.fio.angulo, 0));
  const noventa = m.girarPeca(base, 90);
  // Os nós desta peça são todos retos: a caixa dos nós é a caixa da peça.
  const cx = m.caixaDe(noventa.nos);
  assert.ok(perto(cx.largura, 10) && perto(cx.altura, 20), `caixa ${JSON.stringify(cx)}`);
  assert.ok(perto(cx.minX, 0) && perto(cx.minY, 0), "o canto de cima à esquerda fica onde estava");
  assert.ok(perto(Math.abs(noventa.marcacoes.fio.angulo), 90), "o fio girou junto");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:montagem`
Expected: FAIL com `m.apagarNosDaPeca is not a function`.

- [ ] **Step 3: As funções**

Em `src/motores/montagem.js`, acrescentar ao import de `./edicaoDeNos`: `girarNos, moverNos, virarCurva, virarReta`. Depois de `apagarNoDaPeca`:

```js
/** Apaga vários nós, do maior índice para o menor: os de trás não mudam de índice. */
export function apagarNosDaPeca(peca, indices) {
  const ordem = [...new Set(indices)].sort((a, b) => b - a);
  if (peca.nos.length - ordem.length < 3) return null;
  let atual = peca;
  for (const i of ordem) {
    atual = apagarNoDaPeca(atual, i);
    if (!atual) return null;
  }
  return atual;
}

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

/**
 * Virar reta / virar curva numa peça, levando os piques.
 *
 * O pique que estava num trecho que sumiu vai para o trecho novo, na mesma
 * FRAÇÃO DO COMPRIMENTO em que estava — é o que mantém o pique no mesmo lugar
 * da costura quando o trecho não muda muito de forma.
 */
export function virarTrechosNaPeca(peca, indices, jeito, erroMaximo) {
  const r = jeito === "reta" ? virarReta(peca.nos, indices) : virarCurva(peca.nos, indices, erroMaximo);
  if (r.erro) return { erro: r.erro };
  const destino = new Map(); // trecho antigo → { primeiro, antes, total, comprimento }
  for (const seq of r.sequencias) {
    const trechos = seq.slice(0, -1);
    const comprimentos = trechos.map((i) => comprimentoDoTrecho(peca.nos, i));
    const total = comprimentos.reduce((s, c) => s + c, 0) || 1;
    let acumulado = 0;
    trechos.forEach((i, k) => {
      destino.set(i, { primeiro: seq[0], antes: acumulado, total, comprimento: comprimentos[k] });
      acumulado += comprimentos[k];
    });
  }
  const novoIndice = (i) => i - r.removidos.filter((x) => x < i).length;
  const piques = peca.marcacoes.piques.map((p) => {
    const d = destino.get(p.no);
    if (!d) return { ...p, no: novoIndice(p.no) };
    return { ...p, no: novoIndice(d.primeiro), t: (d.antes + p.t * d.comprimento) / d.total };
  });
  return { peca: { ...peca, nos: r.nos, marcacoes: { ...peca.marcacoes, piques } } };
}

/**
 * Gira a peça em volta do centro da caixa. Nós, pontos e fio vão juntos; os
 * piques acompanham sozinhos, porque são presos ao trecho (`no`, `t`). O
 * canto de cima à esquerda da caixa volta para onde estava: a peça não pula
 * na mesa, e 4× 90° devolve a original.
 *
 * O fio guarda a direção como `(sen a, cos a)`; girar o desenho de θ leva essa
 * direção para `(sen(a−θ), cos(a−θ))`, daí o `a − θ`.
 */
export function girarPeca(peca, graus) {
  const antes = caixaDe(achatarCurvas(peca.nos));
  const centro = { x: antes.minX + antes.largura / 2, y: antes.minY + antes.altura / 2 };
  const girados = girarNos(peca.nos, graus, centro);
  const depois = caixaDe(achatarCurvas(girados));
  const dx = antes.minX - depois.minX; const dy = antes.minY - depois.minY;
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
  };
}
```

(Conferir que `caixaDe` e `achatarCurvas` já estão importados em `montagem.js` — estão: `caixaDe` é exportado dali mesmo, `achatarCurvas` vem de `./ajusteDeCurvas`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:montagem && npm run bancada:nos`
Expected: as duas OK.

- [ ] **Step 5: Commit**

```bash
git add src/motores/montagem.js bancada/conferir-montagem.mjs
git commit -m "A peça da Montagem apaga e vira vários nós levando os piques, e gira com pontos e fio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: A Montagem seleciona, age em grupo e gira

**Files:**
- Modify: `src/telas/risco/desenhoDeNos.ts` (`desenharNos`)
- Modify: `src/telas/montagem/Mesa.tsx`
- Modify: `src/telas/montagem/MesaDeMontagem.tsx`
- Modify: `src/telas/montagem/PainelDaPeca.tsx`
- Modify: `src/telas/Digitalizar.tsx` (só a chamada de `desenharNos`, para compilar — a seleção do Digitalizar é a Task 13)

**Interfaces:**
- Consumes: Tasks 10 e 11.
- Produces: `desenharNos(ctx, nos, selecionados: readonly number[], emTela)` — as alças aparecem só com exatamente um selecionado. Mesa: props `selecionados: readonly number[]` e `aoSelecionar: (indices: number[]) => void` no lugar de `noAtivo`/`aoMarcarNo`.

- [ ] **Step 1: `desenharNos` com vários**

Trocar a assinatura e o começo:

```ts
export function desenharNos(
  ctx: CanvasRenderingContext2D, nos: No[], selecionados: readonly number[], emTela: (p: Ponto) => Ponto,
) {
  // As alças só com UM nó escolhido: com vários, o que se arrasta é o grupo.
  const noAtivo = selecionados.length === 1 ? selecionados[0]! : null;
  const marcados = new Set(selecionados);
```

e dentro do `forEach`, `const marcado = marcados.has(i);`. No Digitalizar, a chamada vira `desenharNos(ctx, escolhida, noAtivo === null ? [] : [noAtivo], emTela);` (provisório até a Task 13).

- [ ] **Step 2: A Mesa**

Em `Mesa.tsx`:

1. Props: trocar `noAtivo: number | null;` por `selecionados: readonly number[];` e `aoMarcarNo: (no: number | null) => void;` por `aoSelecionar: (indices: number[]) => void;`.
2. `const noAtivoValido = peca && selecionados.length === 1 && selecionados[0]! < peca.nos.length ? selecionados[0]! : null;` e um `const validos = peca ? selecionados.filter((i) => i < peca.nos.length) : [];`.
3. O tipo `Arrasto` ganha dois casos:

```ts
  | { tipo: "grupo"; de: Ponto; original: PecaEmMontagem["nos"]; indices: number[] }
  | { tipo: "caixa"; de: Ponto; ate: Ponto; somar: boolean };
```

4. Em `aoApertar`, no ramo `ferramenta === "nos"`:

```ts
      const sob = pegaSob(peca.nos, alvo, raio, noAtivoValido);
      if (sob && sob.parte !== "no") {
        props.aoLembrar();
        arrasto.current = { tipo: "no", no: sob.no, parte: sob.parte as "entrada" | "saida" };
      } else if (sob) {
        if (e.shiftKey) {
          props.aoSelecionar(validos.includes(sob.no) ? validos.filter((i) => i !== sob.no) : [...validos, sob.no]);
          return;
        }
        const grupo = validos.includes(sob.no) ? validos : [sob.no];
        props.aoSelecionar(grupo);
        props.aoLembrar();
        arrasto.current = { tipo: "grupo", de: alvo, original: peca.nos, indices: grupo };
      } else {
        arrasto.current = { tipo: "caixa", de: alvo, ate: alvo, somar: e.shiftKey };
      }
```

(no lugar do bloco de hoje que chama `pegaSob`/`aoMarcarNo`/`aoLembrar`).

5. Em `aoMover`:

```ts
    if (a.tipo === "grupo") {
      props.aoMudar((p) => ({ ...p, nos: moverNos(a.original, a.indices, alvo.x - a.de.x, alvo.y - a.de.y) }), false);
    } else if (a.tipo === "caixa") {
      a.ate = alvo;
      repintar((n) => n + 1);
    } else if (a.tipo === "no") {
```

(o ramo `"no"` passa a mover só alça ou o nó único: continua com `moverPega`).

6. Em `aoSoltar`, antes de zerar o arrasto:

```ts
    const a = arrasto.current;
    if (a.tipo === "caixa" && peca) {
      const pequeno = Math.hypot(a.ate.x - a.de.x, a.ate.y - a.de.y) < raioCm();
      const dentro = pequeno ? [] : nosNoRetangulo(peca.nos, a.de, a.ate);
      props.aoSelecionar(a.somar ? [...new Set([...validos, ...dentro])] : dentro);
    }
```

7. No desenho, depois de `desenharNos(...)` (que passa a receber `validos`), o retângulo tracejado quando `arrasto.current?.tipo === "caixa"`:

```ts
    const a = arrasto.current;
    if (a && a.tipo === "caixa") {
      const p0 = emTela(a.de); const p1 = emTela(a.ate);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(77, 157, 255, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
      ctx.setLineDash([]);
    }
```

Acrescentar `validos` às dependências do efeito de desenho e o `repintar` já força o redesenho.

8. Teclado (o `useEffect` do Delete): Delete/Backspace apagam `validos` com `apagarNosDaPeca` (se `null`, não faz nada); `Ctrl+A` seleciona `peca.nos.map((_, i) => i)`; `Esc` seleciona `[]`. Manter a guarda de campo em foco. Duplo-clique continua apagando/inserindo UM nó (`props.aoSelecionar([])` no lugar de `aoMarcarNo(null)`, e `[traco.no + 1]` no lugar de `traco.no + 1`).

Imports novos: `moverNos, nosNoRetangulo` de `../../motores/edicaoDeNos`; `apagarNosDaPeca` de `../../motores/montagem`.

- [ ] **Step 3: A barra de ações na MesaDeMontagem**

Em `MesaDeMontagem.tsx`: `const [selecionados, setSelecionados] = useState<number[]>([]);` no lugar de `noAtivo`; os dois efeitos passam a limpar/filtrar (`setSelecionados([])` ao trocar peça/ferramenta; `setSelecionados((s) => s.filter((i) => peca && i < peca.nos.length))` quando a peça muda). Na Mesa: `selecionados={selecionados}` e `aoSelecionar={setSelecionados}`.

Acima da `<Mesa>`, quando `ferramenta === "nos" && selecionados.length >= 2`:

```tsx
          <div className="flex items-center gap-2 border-b border-linha px-3 py-1.5 text-[0.82rem]">
            <span className="text-tinta-fraca">{selecionados.length} nós escolhidos</span>
            <button type="button" className="btn secondary btn-sm" onClick={() => virar("reta")}>Virar reta</button>
            <button type="button" className="btn secondary btn-sm" onClick={() => virar("curva")}>Virar curva</button>
          </div>
```

com:

```tsx
  const dialogo = useDialogo();
  /** 2 mm: a curva pode se afastar isto do desenho atual antes de recusar. */
  const ERRO_DA_CURVA_CM = 0.2;
  const virar = (jeito: "reta" | "curva") => {
    if (!peca) return;
    const r = virarTrechosNaPeca(peca, selecionados, jeito, ERRO_DA_CURVA_CM);
    if ("erro" in r) { void dialogo.avisar(r.erro); return; }
    mudarEsta(() => r.peca, true);
    setSelecionados([]);
  };
```

(`ERRO_DA_CURVA_CM` como constante de módulo, fora do componente.)

- [ ] **Step 4: Girar no painel**

Em `PainelDaPeca.tsx`, depois do bloco do fio:

```tsx
      <div className="rounded-[8px] border border-linha p-2">
        <p className="m-0 mb-1 font-semibold">Girar a peça</p>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="btn secondary btn-sm" title="90° para a esquerda" onClick={() => aoMudar((p) => girarPeca(p, -90), true)}>↺ 90°</button>
          <button type="button" className="btn secondary btn-sm" title="90° para a direita" onClick={() => aoMudar((p) => girarPeca(p, 90), true)}>↻ 90°</button>
          <input type="text" inputMode="decimal" value={anguloEscrito} onChange={(e) => setAnguloEscrito(e.target.value)} className="w-16!" aria-label="Ângulo em graus" placeholder="0,0" />
          <button type="button" className="btn secondary btn-sm" disabled={anguloLido === null || anguloLido === 0} onClick={() => { if (anguloLido) aoMudar((p) => girarPeca(p, anguloLido), true); }}>Girar</button>
        </div>
      </div>
```

com `const [anguloEscrito, setAnguloEscrito] = useState("");` e `const anguloLido = anguloEscrito.trim() === "" ? null : lerCm(anguloEscrito);` (`lerCm` aceita vírgula e recusa o que não é número — serve para graus também; importar `girarPeca` de `../../motores/montagem`).

- [ ] **Step 5: Tipos e build**

Run: `npm run tipos && npm run front`
Expected: sem erro.

- [ ] **Step 6: No navegador**

Subir o servidor com uma cópia do banco e uma sessão SEM tokens (ver a nota no fim do plano) e, num molde com piques, conferir com o Puppeteer:
- arrastar numa área vazia seleciona pelo retângulo; Shift+clique soma/tira;
- arrastar um nó selecionado move todos; um Ctrl+Z desfaz o arrasto inteiro;
- Delete apaga todos os selecionados; com a peça no mínimo, não apaga nenhum;
- "Virar reta"/"Virar curva" com 3 nós vizinhos; o pique continua na costura;
- ↻ 90° quatro vezes volta ao desenho do começo;
- F5 depois de cada ação: volta igual (gravou).

- [ ] **Step 7: Commit**

```bash
git add src/telas/risco/desenhoDeNos.ts src/telas/montagem src/telas/Digitalizar.tsx dist
git commit -m "A Montagem escolhe vários nós, move, apaga e vira em grupo, e gira a peça

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: O Digitalizar seleciona e age em grupo

**Files:**
- Modify: `src/telas/Digitalizar.tsx`

**Interfaces:**
- Consumes: Task 10; `desenharNos` com `selecionados` (Task 12).

- [ ] **Step 1: O estado**

Trocar `const [noAtivo, setNoAtivo] = useState<number | null>(null);` por `const [selecionados, setSelecionados] = useState<number[]>([]);` e `const noAtivo = selecionados.length === 1 ? selecionados[0]! : null;` logo abaixo (o resto da tela — alças, "lados do nó", Delete — continua lendo `noAtivo`). Todo `setNoAtivo(x)` vira `setSelecionados(x === null ? [] : [x])`.

- [ ] **Step 2: Apertar, mover, soltar**

`pegando` passa a aceitar grupo e caixa:

```ts
type Arrasto =
  | { tipo: "pega"; peca: number; no: number; parte: "no" | "entrada" | "saida" }
  | { tipo: "grupo"; peca: number; de: Ponto; original: No[]; indices: number[] }
  | { tipo: "caixa"; de: Ponto; ate: Ponto; somar: boolean };
```

Em `aoApertar`: alça → `{ tipo: "pega", ... }` como hoje; nó com Shift → alterna na seleção (se o nó é de outra peça, `setQual` e seleção `[no]`); nó sem Shift → se já está na seleção da mesma peça, arrasta o grupo, senão seleciona só ele e arrasta; nada embaixo → `{ tipo: "caixa" }`. Em `aoMover`: grupo → `setEdicao(antes => antes.map((nos, p) => p === a.peca ? moverNos(a.original, a.indices, alvo.x - a.de.x, alvo.y - a.de.y) : nos))`; caixa → atualiza `ate` e força redesenho (`setCaixa` num estado `caixa: {de, ate} | null` usado pelo efeito de desenho). Em `aoSoltar`: caixa → `nosNoRetangulo(edicao[qual], de, ate)` (clique curto sem Shift escolhe a peça sob o traço, como hoje, e limpa a seleção). Um `lembrar()` antes de começar um arrasto de grupo.

- [ ] **Step 3: Teclado e barra**

- Delete/Backspace: `apagarNos(edicao[qual], selecionados)`; `null` → `setErro("A peça ficaria com menos de três nós; não dá para apagar tantos.")`.
- Ctrl+A: todos os nós da peça `qual`. Esc: `[]`. Guardas de campo em foco iguais às de hoje.
- Ao lado do botão "Desfazer" (bloco das linhas ~695–715), quando `selecionados.length >= 2`, os dois botões "Virar reta" e "Virar curva", chamando `virarReta`/`virarCurva(edicao[qual], selecionados, ERRO_DA_CURVA_CELULAS)` com `const ERRO_DA_CURVA_CELULAS = 1.25; // ~2 mm na mesa do laser` no topo; erro → `setErro(r.erro)`; certo → `lembrar()`, troca a peça, `setSelecionados([])`.
- O texto de ajuda (linhas ~675–690) ganha: "**Arraste** numa área vazia para escolher vários; **Shift+clique** soma ou tira; com vários escolhidos, **Virar reta** e **Virar curva**."

- [ ] **Step 4: Tipos, build e as bancadas da tela**

Run: `npm run tipos && npm run front && npm run bancada:molde-imagem`
Expected: tudo OK (a `molde-imagem` clica em nó, apaga com Delete e com Backspace, e confere o campo da medida — o atalho novo não pode ter quebrado nenhuma dessas).

- [ ] **Step 5: No navegador**

Com uma foto da fábrica: escolher 3 nós de uma ondinha com o retângulo, "Virar reta", conferir; escolher um trecho curvo com nós a mais, "Virar curva"; Ctrl+Z volta cada ação inteira; digitar na medida com nós escolhidos não apaga nada.

- [ ] **Step 6: Commit**

```bash
git add src/telas/Digitalizar.tsx dist
git commit -m "O Digitalizar escolhe vários nós, move, apaga e vira em grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: O caminho inteiro, e a documentação

**Files:**
- Modify: `docs/MAPA.md` (linha do Digitalizar e da Montagem: os motores novos)

- [ ] **Step 1: Todas as conferências**

Run: `npm run tipos && npm run front && npm run bancada:revisao && npm run bancada:nos && npm run bancada:margem && npm run bancada:montagem && npm run bancada:digitalizar-sintetico && npm run bancada:molde-imagem && npm run bancada:digitalizar`
Expected: tudo OK.

- [ ] **Step 2: O fluxo da fábrica no navegador**

`NAILSON/2 BANDA.bmp` e `NAILSON/PEDAços.bmp` → medida → "Continuar para a montagem" → na Montagem, selecionar e virar um trecho, girar uma peça, PDF e SVG → F5 → tudo lá. Anotar nós por peça antes (da tabela da Task 9) e depois.

- [ ] **Step 3: Mapa**

Em `docs/MAPA.md`, na linha do Digitalizar/Montagem, acrescentar `src/motores/mesaDaFoto.js`, `src/motores/bordaRefinada.js`, `src/motores/retasDaBorda.js` no tom das vizinhas.

- [ ] **Step 4: Commit**

```bash
git add docs/MAPA.md
git commit -m "O mapa ganha os motores novos do Digitalizar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Nota para quem for testar no navegador

O servidor de teste precisa de uma cópia do banco e da sessão (`OPTIMIZE_DADOS=<pasta de teste> PORT=8765 node servidor/server.js`). **A cópia da sessão tem de ir SEM tokens** (`accessToken` e `refreshToken` trocados por um texto qualquer): com os tokens de verdade, o servidor de teste os renova no backend da CodeEx e a sessão real do programa fica com um token velho — aconteceu em 2026-09-28. Sem token, o servidor usa o acesso guardado na cópia e não fala com o backend.
