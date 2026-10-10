# As peças da camisa — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um modo novo no Extrator, **"Peças da camisa"**, em que o mockup vira um retângulo cheio para a frente, as costas e cada manga, na medida digitada, sem deformar, com a sombra tirada e o que falta inventado pela LaMa — pronto para baixar (PNG a 300 dpi, ZIP) ou virar a Estampa de um molde; e a **"Analisar com IA"**, em que o Claude acha e descreve as peças e os elementos da foto, com o recorte continuando local.

**Architecture:** a LaMa roda no servidor pelo `onnxruntime-node` (como a ampliação), na mesma fila de um trabalho de cada vez; as contas das peças (corpo sem manga, encaixe, manga juntada, sombra) moram em `src/motores/pecasDaCamisa.js` e rodam no worker do Extrator; a análise com IA é um pedido do servidor ao Claude (`@anthropic-ai/sdk`), atrás de quatro travas; a tela reaproveita a mesa e os cliques do Extrator numa aba nova.

**Tech Stack:** Node + Express + `sharp` + `onnxruntime-node` + `@anthropic-ai/sdk` no servidor; React 19 + TypeScript 7 + Tailwind na tela; `fflate` para o ZIP; bancadas em Node (`node:assert`) e Puppeteer.

**Spec:** `docs/superpowers/specs/2026-10-07-pecas-da-camisa-design.md`

## Antes de começar

- **Branch:** `Guilherme` (a pessoa pediu para ficar na mesma branch do Extrator). Sem push: quem decide é a pessoa.
- **O que já foi provado no scratchpad em 2026-10-07** (o código das tasks é esse, rodado contra os próprios testes):
  - a LaMa (`Carve/LaMa-ONNX`, `lama_fp32.onnx`, 208 MB, Apache 2.0) abre neste i5-8400 em ~13 s e roda um ladrilho de 512 em ~2,2 s; as entradas são `image` (RGB de 0 a 1) e `mask` (1 = buraco), e a saída `output` já vem de 0 a 255. Numa montagem de 1600 × 1200 com uma faixa vazia em cima e um furo no meio: 5 ladrilhos em 22 s, erro médio de **3,3** no furo (o degradê fecha) e salto de **4,2** na borda da faixa (sem costura). **A LaMa fica; o PatchMatch não é preciso.**
  - `bancada/conferir-pecas.mjs` passou inteira (preenchimento com LaMa de mentira, fila, pedido, motores, análise com cliente de mentira e as travas da rota num servidor de verdade), e `bancada/conferir-extrator.mjs` continua passando;
  - `npm run tipos` passou com toda a tela e em cada etapa intermediária (o fim das Tasks 5 e 6), e a `bancada:pecas-tela` passou com as três voltas; a `bancada:extrator-tela` continua passando com os ajudantes divididos e a ampliação pela fila nova.
- **O SDK:** `@anthropic-ai/sdk` 0.131.0 (exporta `Anthropic`, `APIError` com `APIError.generate`, `AuthenticationError`, `PermissionDeniedError`, `RateLimitError`, `InternalServerError`, `APIConnectionError`; aceita `betas: ["server-side-fallback-2026-07-01"]` com `fallbacks: "default"`).
- **Pendentes da pessoa, que NÃO bloqueiam nada:** a chave `ANTHROPIC_API_KEY` no computador do servidor e o mockup de teste em `D:\arte\extrator\mockup-camisa.jpg` com o gabarito `mockup-camisa.json`. Sem eles, a `analise:de-verdade` diz o que falta e sai sem erro; com eles, a Task 4 mede o custo de verdade (passo final).
- **Decisões tomadas no plano, que a spec deixava em aberto:**
  - a saída é **PNG** a 300 dpi; o PDF fica fora (o PNG é o que o molde e o Corel abrem);
  - endireitar continua sendo o botão **Endireitar** de sempre, antes de marcar (o mockup chega reto; a perspectiva por peça não foi pedida);
  - montar e preencher são **dois botões**: a prévia montada mostra o que vai ser inventado (e o aviso de mais de 50%) **antes** de a LaMa rodar;
  - a LaMa trabalha na montagem reduzida a 1024 de lado, em ladrilhos de 512 com 64 de sobra; o PNG final sai da ampliação (Real-ESRGAN) a 300 dpi; a arte da foto volta byte a byte (a LaMa só mexe no buraco).

## Global Constraints

- Tudo roda no computador, **menos** a análise com IA, e só quando o operador aperta "Analisar com IA"; o texto do botão diz "manda a foto para a IA da Anthropic".
- Modelos fora do git, em `servidor/modelos/` (já ignorado), baixados por `npm run modelos` com URL fixada num commit, tamanho e sha256.
- A LaMa: `https://huggingface.co/Carve/LaMa-ONNX/resolve/c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx`, 208044816 bytes, sha256 `1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6`.
- Montagem: lado maior **2048**; LaMa: escala de **1024**, ladrilho **512**, sobra **64**; aviso acima de **50%** inventado.
- Fila: no máximo **4** trabalhos esperando; o quinto recebe 429 com `{ error: "Já há trabalhos demais na fila; espere um terminar.", codigo: "fila-cheia" }`; o que ninguém buscar em **30 min** é cancelado; o corpo do `/ampliar` cai de 400 MB para **160 MB**.
- Análise: modelo `claude-opus-5-5`, esforço `medium`, `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`, saída estruturada (`output_config.format` com `json_schema`); caixas de 0 a 1000; preço US$ 4 / US$ 20 por milhão de tokens (entrada/saída).
- As travas da análise: só `127.0.0.1` (a não ser `OPTIMIZE_ANALISE_NA_REDE=1`), cabeçalho `X-Optimize-Pedido: extrator`, conta do Optmize entrada, uma de cada vez, teto `OPTIMIZE_ANALISE_LIMITE_DIA` (US$, **5** por padrão). A chave só em `ANTHROPIC_API_KEY`.
- Esquerda e direita são de **quem veste** a camisa; os papéis no molde são `frente`, `costas`, `manga esquerda`, `manga direita` (os de `src/telas/moldes/vocabulario.ts`).
- Mensagens ao operador em português; falha do servidor volta como `{ error, codigo }`.
- Os arquivos do repositório estão com CRLF na cópia de trabalho (`core.autocrlf=true`): ao editar com script, normalize as quebras; o Edit resolve sozinho.
- Um commit por task, mensagem em português no estilo do repositório (frase que diz o que mudou, sem prefixo `feat:`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- O `dist/` só entra no commit de build da Task 8. Depois de rodar uma bancada de tela antes disso: `git checkout -- dist && git clean -fdq dist`.

## Review Focus

- **Manga que não encosta no corpo** (a caixa da manga pegou outra coisa) — a manga não é tirada do corpo e a tela avisa qual. Testes: Task 3 (`corpoSemMangas` com uma caixa longe → `soltas: [3]`) e Task 5 (o aviso vem de `prepararPeca`).
- **Frente e costas em duas fotos** (a spec permite) — abrir a segunda foto não apaga o que foi marcado na primeira, e as mangas só saem do corpo marcado na mesma foto. Teste: Task 5 (a volta "sem a LaMa" abre as costas numa segunda foto: a frente continua marcada e as duas peças montam).
- **Peça sem uma das vistas** (a manga só aparece na frente) — sai com a metade que existe, espelhada, e a tela avisa. Teste: Task 3 (`montarManga(meiaFrente, null, …)` → aviso e a faixa azul espelhada na borda da direita).
- **Camisa sem branco** (azul-marinho inteira) — tirar a sombra não pode estragar a cor. Teste: Task 3 (`tirarSombra` na camisa marinho → `clareou: false` e os bytes iguais).
- **Quem não pode gastar** (sem chave, outro computador, sem conta, outro site, segunda análise ao mesmo tempo, teto do dia) — recusado antes de chamar o Claude, com a mensagem certa. Testes: Task 4 (as travas no `porqueNaoAnalisa`, na rota de verdade, `analise-ocupada` e `teto-do-dia`) e Task 7 (o botão não aparece sem a chave).

## Os arquivos

| Arquivo | Faz | Task |
|---|---|---|
| `servidor/extrator-preencher.js` | a LaMa em ladrilhos | 1 |
| `empacotar/modelos.js` | baixa também a LaMa | 1 |
| `bancada/conferir-pecas.mjs` | a bancada sem rede, no Conferir | 1, 2, 3, 4 |
| `bancada/conferir-pecas-rede.mjs` | a LaMa de verdade, local | 1 |
| `servidor/extrator-fila.js` | a fila dos trabalhos pesados e as rotas de acompanhar | 2 |
| `servidor/extrator-api.js` | `/ampliar` pela fila, `/preencher` (2), `/analisar` e o `analise` do `/estado` (4) | 2, 4 |
| `src/motores/pecasDaCamisa.js` | corpo sem manga, encaixe, manga juntada, sombra | 3 |
| `src/motores/recorte.js` | exporta o `engordar` | 3 |
| `servidor/extrator-analise.js` | o pedido ao Claude, a conferência, o custo e as travas | 4 |
| `bancada/analise-de-verdade.mjs` | a análise de verdade, local, custa centavos | 4 |
| `src/api/extrator.ts` | `acompanhar`, `preencher` (5), `analisar` (7) | 5, 7 |
| `src/motores/extratorTarefas.js`, `src/telas/extrator/{tipos,trabalhador,desenho}.ts` | as tarefas novas do worker | 5, 7 |
| `src/telas/extrator/usePecasDaCamisa.ts` | o estado das peças | 5, 6, 7 |
| `src/telas/extrator/{PreviaDaPeca,PecasDaCamisa}.tsx` | a prévia e o painel | 5, 6 |
| `src/telas/Extrator.tsx` | as abas | 5, 7 |
| `bancada/extrator-tela-comum.cjs`, `bancada/conferir-extrator-tela.cjs` | os ajudantes de navegador, divididos | 5 |
| `bancada/conferir-pecas-tela.cjs` | as peças no navegador | 5, 6, 7 |
| `src/telas/extrator/paraOMolde.ts` | a Estampa no molde | 6 |
| `src/telas/extrator/{useExtrator.ts,MesaDoExtrator.tsx,AnaliseComIa.tsx}` | a análise na tela | 7 |
| `docs/MAPA.md`, `dist/` | o mapa e o build | 8 |

---

### Task 1: a LaMa no servidor — preencher em ladrilhos, e baixar a rede

**Files:**
- Create: `servidor/extrator-preencher.js`, `bancada/conferir-pecas.mjs`, `bancada/conferir-pecas-rede.mjs`
- Modify: `empacotar/modelos.js`, `package.json`, `.github/workflows/conferir.yml`

**Interfaces — Produces** (`servidor/extrator-preencher.js`, CommonJS):
- `ARQUIVO: string` (`<pasta dos modelos>/lama_fp32.onnx`; a pasta é `OPTIMIZE_EXTRATOR_MODELOS` ou `servidor/modelos`), `ORIGEM: { de, tamanho, sha256 }`, `LADO = 512`, `SOBRA = 64`, `LADO_DO_PREENCHIMENTO = 1024`
- `porqueNaoPreenche(arquivo = ARQUIVO) → string | null`
- `posicoes(tamanho: number) → number[]` — onde começa cada ladrilho numa dimensão
- `ladrilhosDe(rgba, largura, altura) → number` — quantos ladrilhos, no máximo (o `total` inicial do andamento)
- `preencherComRede(rgba: Buffer|Uint8Array (RGBA), largura, altura, rodar: (imagem: Float32Array, mascara: Float32Array) => Promise<Float32Array>, { aoAndar?(feitos, total), cancelado?() }?) → Promise<{ rgb: Buffer, largura, altura, inventado: number }>` — estoura com `codigo: "sem-arte"` (tudo buraco) ou `Error("cancelado")`
- `preencher(rgba, largura, altura, { aoAndar?, cancelado?, arquivo? }?)` — a mesma coisa com a rede de verdade; estoura com `codigo: "sem-rede"`

- [ ] **Step 1: a bancada sem rede, com o preenchimento — `bancada/conferir-pecas.mjs`**

O arquivo começa com o cabeçalho e a primeira seção; as Tasks 2, 3 e 4 acrescentam seções antes da linha final `console.log("OK — …")`.

```js
/*
 * BANCADA — as peças da camisa, sem rede neural e sem internet (entra no Conferir)
 *
 *     npm run bancada:pecas
 *
 * O preenchimento com uma LaMa de mentira, a fila dos trabalhos pesados, os
 * motores das peças (corpo sem manga, encaixe, manga juntada, sombra) e a
 * análise com IA com um cliente de mentira no lugar do SDK. A LaMa de verdade
 * é da `bancada:pecas-rede`; o Claude de verdade, da `analise:de-verdade`.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------- o preenchimento, com uma LaMa de mentira ----------
{
  const pre = require("../servidor/extrator-preencher.js");
  const L = pre.LADO;
  // A LaMa de mentira: o buraco vira a média da arte conhecida do ladrilho; a arte volta igual.
  let chamadas = 0;
  const deMentira = async (imagem, mascara) => {
    chamadas++;
    const N = L * L, soma = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (mascara[i]) continue;
      n++;
      for (let k = 0; k < 3; k++) soma[k] += imagem[k * N + i];
    }
    assert.ok(n > 0, "a LaMa nunca recebe ladrilho sem arte nenhuma");
    const saida = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) saida[k * N + i] = (mascara[i] ? soma[k] / n : imagem[k * N + i]) * 255;
    return saida;
  };

  // Sem buraco: volta igual, sem rodar a rede.
  {
    const rgba = Buffer.alloc(10 * 8 * 4, 255);
    const r = await pre.preencherComRede(rgba, 10, 8, deMentira);
    assert.equal(r.inventado, 0);
    assert.equal(r.rgb.length, 10 * 8 * 3);
  }

  // Tudo buraco: não há o que continuar.
  await assert.rejects(pre.preencherComRede(Buffer.alloc(10 * 8 * 4), 10, 8, deMentira), (e) => e.codigo === "sem-arte");

  // Uma peça de 1600 × 1200 cor de vinho, com uma faixa vazia de 300 px em cima e um furo no meio.
  {
    const w = 1600, h = 1200, rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = Math.floor(i / w);
      const vazio = y < 300 || (x >= 700 && x < 900 && y >= 600 && y < 800);
      rgba[i * 4] = 120; rgba[i * 4 + 1] = 20; rgba[i * 4 + 2] = 40; rgba[i * 4 + 3] = vazio ? 0 : 255;
    }
    // Um pixel marcado na arte, para provar que ela volta byte a byte.
    rgba[(1000 * w + 100) * 4] = 7;
    chamadas = 0;
    const andamentos = [];
    const r = await pre.preencherComRede(rgba, w, h, deMentira, { aoAndar: (f, t) => andamentos.push([f, t]) });
    assert.ok(Math.abs(r.inventado - (300 * 1600 + 200 * 200) / (w * h)) < 1e-9, `a parte inventada: ${r.inventado}`);
    assert.equal(r.rgb[(1000 * w + 100) * 3], 7, "a arte da foto volta byte a byte");
    for (const [x, y] of [[10, 10], [1590, 5], [800, 299], [800, 700]]) {
      const i = (y * w + x) * 3;
      const px = [r.rgb[i], r.rgb[i + 1], r.rgb[i + 2]];
      assert.ok(Math.abs(px[0] - 120) <= 3 && Math.abs(px[1] - 20) <= 3 && Math.abs(px[2] - 40) <= 3, `o buraco em ${x},${y} virou ${px}`);
    }
    // 1600 × 1200 vira 1024 × 768 na escala da LaMa: 3 × 2 ladrilhos, todos com buraco.
    assert.deepEqual(pre.posicoes(1024), [0, 448, 512]);
    assert.deepEqual(pre.posicoes(768), [0, 256]);
    // Um ladrilho de cima já preenche o furo do vizinho de baixo: menos de 6 chamadas.
    assert.ok(chamadas >= 3 && chamadas <= 6, `chamadas: ${chamadas}`);
    assert.deepEqual(andamentos.at(-1), [chamadas, chamadas], "o andamento termina em n de n");
    assert.equal(pre.ladrilhosDe(rgba, w, h), 6);
  }

  // Cancelar para no ladrilho seguinte.
  {
    const w = 1200, h = 1200, rgba = Buffer.alloc(w * h * 4, 255);
    for (let i = 0; i < w * 200; i++) rgba[i * 4 + 3] = 0;
    let feitos = 0;
    await assert.rejects(
      pre.preencherComRede(rgba, w, h, deMentira, { aoAndar: (f) => { feitos = f; }, cancelado: () => feitos >= 1 }),
      /cancelado/,
    );
    assert.equal(feitos, 1);
  }

  // A rede ausente diz o que falta.
  assert.match(pre.porqueNaoPreenche("C:/nao/existe/lama.onnx"), /npm run modelos/);
}
console.log("OK — as peças da camisa sem rede: o preenchimento.");
```

No `package.json`, em `scripts`, logo depois de `"bancada:extrator-tela"`:

```json
    "bancada:pecas": "node bancada/conferir-pecas.mjs",
    "bancada:pecas-rede": "node bancada/conferir-pecas-rede.mjs",
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npm run bancada:pecas`
Expected: FAIL com `Cannot find module '../servidor/extrator-preencher.js'`.

- [ ] **Step 3: a LaMa — `servidor/extrator-preencher.js`**

```js
/**
 * ===========================================================================
 * O PREENCHIMENTO DO EXTRATOR — a LaMa inventa o que a foto não tem
 * ===========================================================================
 *
 * As peças da camisa saem do mockup como um retângulo cheio, e o mockup não
 * tem tudo: o decote, as cavas e as faixas em cima e embaixo ficam vazios.
 * Quem preenche é a LaMa (big-lama, Apache 2.0), rodando aqui pelo mesmo
 * `onnxruntime-node` da ampliação.
 *
 * O que foi medido neste i5-8400 (2026-10-07, `lama_fp32.onnx`):
 *
 *   - entrada FIXA de 512 × 512: `image` em RGB de 0 a 1 e `mask` com 1 no
 *     buraco; a saída `output` já vem de 0 a 255;
 *   - ~2,2 s por ladrilho e ~13 s para abrir a rede (só na primeira vez);
 *   - num degradê com um buraco de 128 × 128, erro médio de 3,4 e máximo de
 *     10 (em 255) — a continuação é boa.
 *
 * A montagem chega com até 2048 de lado; a LaMa trabalha nela reduzida a
 * `LADO_DO_PREENCHIMENTO` (1024), em ladrilhos de 512 que se sobrepõem. O
 * ladrilho seguinte é sempre o que tem MAIS arte conhecida, e o que um
 * ladrilho inventou vira arte conhecida para o próximo: é assim que um buraco
 * maior que um ladrilho é preenchido de fora para dentro, sem emenda.
 *
 * No fim, só o buraco é trocado: a arte que veio da foto volta byte a byte.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PASTA_DOS_MODELOS = process.env.OPTIMIZE_EXTRATOR_MODELOS || path.join(__dirname, "modelos");
const ARQUIVO = path.join(PASTA_DOS_MODELOS, "lama_fp32.onnx");

/** O `lama_fp32.onnx` do Carve/LaMa-ONNX (o recomendado lá; o `lama.onnx` é mais lento). */
const ORIGEM = {
  de: "https://huggingface.co/Carve/LaMa-ONNX/resolve/c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx",
  tamanho: 208044816,
  sha256: "1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6",
};

const LADO = 512;
/** Quanto um ladrilho avança sobre o anterior: o que ele vê da arte já preenchida. */
const SOBRA = 64;
const LADO_DO_PREENCHIMENTO = 1024;

function porqueNaoPreenche(arquivo = ARQUIVO) {
  return fs.existsSync(arquivo)
    ? null
    : "A rede de preenchimento não está instalada (falta lama_fp32.onnx em servidor/modelos). Rode `npm run modelos`.";
}

/** O buraco: o pixel com alfa abaixo de 128. */
function buracoDe(rgba, total) {
  const b = new Uint8Array(total);
  let n = 0;
  for (let i = 0; i < total; i++) if (rgba[i * 4 + 3] < 128) { b[i] = 1; n++; }
  return { buraco: b, n };
}

/** As posições dos ladrilhos numa dimensão: de LADO em LADO − SOBRA, o último encostado no fim. */
function posicoes(tamanho) {
  if (tamanho <= LADO) return [0];
  const p = [];
  for (let v = 0; v + LADO < tamanho; v += LADO - SOBRA) p.push(v);
  p.push(tamanho - LADO);
  return p;
}

/** Quantos ladrilhos têm buraco: o `total` do andamento. */
function ladrilhosComBuraco(buraco, largura, altura) {
  let n = 0;
  for (const y0 of posicoes(altura)) {
    for (const x0 of posicoes(largura)) if (contar(buraco, largura, altura, x0, y0).buraco > 0) n++;
  }
  return n;
}

/** O que um ladrilho tem de buraco e de arte (fora da imagem não conta). */
function contar(buraco, largura, altura, x0, y0) {
  let b = 0, a = 0;
  for (let y = y0; y < Math.min(altura, y0 + LADO); y++) {
    for (let x = x0; x < Math.min(largura, x0 + LADO); x++) {
      if (buraco[y * largura + x]) b++; else a++;
    }
  }
  return { buraco: b, arte: a };
}

/**
 * O preenchimento, numa imagem que já está na escala da LaMa. `rgb` é mexido
 * no lugar; `rodar(imagem, mascara)` é a rede (ou a de mentira da bancada).
 */
async function preencherNaEscala(rgb, buraco, largura, altura, rodar, { aoAndar = () => {}, cancelado = () => false } = {}) {
  const ladrilhos = [];
  for (const y0 of posicoes(altura)) for (const x0 of posicoes(largura)) ladrilhos.push({ x0, y0 });
  const imagem = new Float32Array(3 * LADO * LADO), mascara = new Float32Array(LADO * LADO);
  const porCanal = LADO * LADO;
  let feitos = 0;
  for (;;) {
    // O próximo é o que tem mais arte conhecida; sem arte nenhuma, ainda não dá.
    let melhor = null, melhorArte = 0;
    for (const l of ladrilhos) {
      const c = contar(buraco, largura, altura, l.x0, l.y0);
      if (c.buraco > 0 && c.arte > melhorArte) { melhor = l; melhorArte = c.arte; }
    }
    if (!melhor) break;
    if (cancelado()) throw new Error("cancelado");
    // Fora da imagem (só quando ela é menor que o ladrilho), a borda é repetida e vale como arte.
    for (let y = 0; y < LADO; y++) {
      const sy = Math.min(altura - 1, melhor.y0 + y);
      for (let x = 0; x < LADO; x++) {
        const sx = Math.min(largura - 1, melhor.x0 + x);
        const de = sy * largura + sx, para = y * LADO + x;
        const furo = buraco[de];
        mascara[para] = furo;
        imagem[para] = furo ? 0 : rgb[de * 3] / 255;
        imagem[porCanal + para] = furo ? 0 : rgb[de * 3 + 1] / 255;
        imagem[2 * porCanal + para] = furo ? 0 : rgb[de * 3 + 2] / 255;
      }
    }
    const saida = await rodar(imagem, mascara);
    for (let y = melhor.y0; y < Math.min(altura, melhor.y0 + LADO); y++) {
      for (let x = melhor.x0; x < Math.min(largura, melhor.x0 + LADO); x++) {
        const i = y * largura + x;
        if (!buraco[i]) continue;
        const para = (y - melhor.y0) * LADO + (x - melhor.x0);
        for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.max(0, Math.min(255, Math.round(saida[k * porCanal + para])));
        buraco[i] = 0;
      }
    }
    // O ladrilho também preenche o buraco do vizinho que se sobrepõe a ele: o
    // total é recontado a cada passo, e o andamento termina em "n de n".
    feitos++;
    aoAndar(feitos, feitos + ladrilhosComBuraco(buraco, largura, altura));
  }
  return { feitos };
}

/**
 * Preenche a montagem (RGBA cru; alfa abaixo de 128 = inventar) e devolve
 * `{ rgb, largura, altura, inventado }` — RGB cheio, sem transparência.
 */
async function preencherComRede(rgba, largura, altura, rodar, opcoes = {}) {
  const total = largura * altura;
  const { buraco, n } = buracoDe(rgba, total);
  const rgb = Buffer.alloc(total * 3);
  for (let i = 0; i < total; i++) {
    rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }
  if (n === 0) return { rgb, largura, altura, inventado: 0 };
  if (n === total) throw Object.assign(new Error("A peça não tem arte nenhuma para continuar."), { codigo: "sem-arte" });

  const k = Math.min(1, LADO_DO_PREENCHIMENTO / Math.max(largura, altura));
  const L = Math.max(1, Math.round(largura * k)), A = Math.max(1, Math.round(altura * k));
  let pequeno = rgb, buracoPequeno = buraco;
  if (k < 1) {
    pequeno = await sharp(rgb, { raw: { width: largura, height: altura, channels: 3 } })
      .resize(L, A, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
    // O buraco reduzido em linear, e qualquer mistura com o buraco é buraco:
    // a cor do vazio vazou para esses pixels na redução.
    const m = Buffer.from(buraco.map((v) => v * 255));
    const mp = await sharp(m, { raw: { width: largura, height: altura, channels: 1 } })
      .resize(L, A, { fit: "fill", kernel: "linear" }).toColourspace("b-w").raw().toBuffer();
    buracoPequeno = new Uint8Array(L * A);
    for (let i = 0; i < L * A; i++) buracoPequeno[i] = mp[i] > 0 ? 1 : 0;
  } else {
    pequeno = Buffer.from(rgb);
    buracoPequeno = Uint8Array.from(buraco);
  }
  await preencherNaEscala(pequeno, buracoPequeno, L, A, rodar, opcoes);

  const grande = k < 1
    ? await sharp(pequeno, { raw: { width: L, height: A, channels: 3 } }).resize(largura, altura, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer()
    : pequeno;
  for (let i = 0; i < total; i++) {
    if (!buraco[i]) continue;
    rgb[i * 3] = grande[i * 3]; rgb[i * 3 + 1] = grande[i * 3 + 1]; rgb[i * 3 + 2] = grande[i * 3 + 2];
  }
  return { rgb, largura, altura, inventado: n / total };
}

/**
 * Quantos ladrilhos o preenchimento desta montagem roda, no máximo: o `total`
 * do andamento antes de começar (o de verdade pode ser menor, e é recontado).
 */
function ladrilhosDe(rgba, largura, altura) {
  const k = Math.min(1, LADO_DO_PREENCHIMENTO / Math.max(largura, altura));
  const L = Math.max(1, Math.round(largura * k)), A = Math.max(1, Math.round(altura * k));
  return posicoes(L).length * posicoes(A).length;
}

let sessao = null;

/** A rede aberta uma vez, tarde (no primeiro preenchimento), como `rodar(imagem, mascara) → saída`. */
async function abrirSessao(arquivo) {
  if (!sessao || sessao.arquivo !== arquivo) {
    const ort = require("onnxruntime-node");
    const s = await ort.InferenceSession.create(arquivo, { logSeverityLevel: 3, graphOptimizationLevel: "all" });
    sessao = {
      arquivo,
      rodar: async (imagem, mascara) => (await s.run({
        image: new ort.Tensor("float32", imagem, [1, 3, LADO, LADO]),
        mask: new ort.Tensor("float32", mascara, [1, 1, LADO, LADO]),
      })).output.data,
    };
  }
  return sessao.rodar;
}

async function preencher(rgba, largura, altura, { aoAndar = () => {}, cancelado = () => false, arquivo = ARQUIVO } = {}) {
  const motivo = porqueNaoPreenche(arquivo);
  if (motivo) throw Object.assign(new Error(motivo), { codigo: "sem-rede" });
  return preencherComRede(rgba, largura, altura, await abrirSessao(arquivo), { aoAndar, cancelado });
}

module.exports = {
  ARQUIVO, ORIGEM, LADO, SOBRA, LADO_DO_PREENCHIMENTO,
  porqueNaoPreenche, posicoes, ladrilhosDe, preencherComRede, preencher,
};
```

- [ ] **Step 4: rodar e ver passar**

Run: `npm run bancada:pecas`
Expected: `OK — as peças da camisa sem rede: o preenchimento.`

- [ ] **Step 5: o `npm run modelos` baixa também a LaMa — `empacotar/modelos.js`**

Logo depois do `require` da ampliação:

```js
const ampliar = require("../servidor/extrator-ampliar");
const preencher = require("../servidor/extrator-preencher");
```

E logo depois do `MODELOS.push` da ampliação (o que termina em `faz: "amplia o jeito Foto do Extrator (Real-ESRGAN x4v3; BSD-3-Clause)",\n});`):

```js
MODELOS.push({
  nome: path.basename(preencher.ARQUIVO), ...preencher.ORIGEM,
  faz: "inventa o que falta nas peças da camisa (LaMa; Apache 2.0)",
});
```

Run: `npm run modelos`
Expected: as redes que já estão aqui "já está aqui e confere", e `modelos: baixando lama_fp32.onnx (198.4 MB)… ok — inventa o que falta nas peças da camisa (LaMa; Apache 2.0)`.

- [ ] **Step 6: a bancada da LaMa de verdade — `bancada/conferir-pecas-rede.mjs`**

```js
/*
 * BANCADA — a LaMa de verdade (fora da CI: precisa de `npm run modelos`)
 *
 *     npm run bancada:pecas-rede
 *
 * Um degradê conhecido, de 1600 × 1200, com uma faixa vazia em cima (a faixa
 * que sobra quando a arte cobre a largura) e um furo no meio (o decote). A
 * LaMa tem de continuar o degradê sem costura: o erro no buraco e o salto na
 * borda dele ficam abaixo dos limites medidos em 2026-10-07, e o tempo é
 * impresso para comparar com a medição (≈ 2,2 s por ladrilho, 13 s para abrir).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pre = require("../servidor/extrator-preencher.js");

const motivo = pre.porqueNaoPreenche();
if (motivo) {
  console.log(`PULADA — ${motivo}`);
  process.exit(0);
}

const w = 1600, h = 1200;
const esperado = (x, y) => [Math.round((x / (w - 1)) * 255), Math.round((y / (h - 1)) * 255), 128];
const vazio = (x, y) => y < 200 || (x >= 700 && x < 900 && y >= 500 && y < 700);
const rgba = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, [r, g, b] = esperado(x, y);
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = vazio(x, y) ? 0 : 255;
  }
}

const inicio = Date.now();
let ladrilhos = 0;
const r = await pre.preencher(rgba, w, h, { aoAndar: (f) => { ladrilhos = f; } });
const ms = Date.now() - inicio;

/** O erro médio e o pior, contra o degradê esperado, numa região do buraco. */
function erroEm(dentro) {
  let soma = 0, n = 0, pior = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dentro(x, y)) continue;
      const i = (y * w + x) * 3, e = esperado(x, y);
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(r.rgb[i + k] - e[k]);
        soma += d; n++; pior = Math.max(pior, d);
      }
    }
  }
  return { medio: soma / n, pior };
}
// O furo do meio tem arte dos quatro lados: a LaMa interpola, e o degradê tem de fechar.
const furo = erroEm((x, y) => x >= 700 && x < 900 && y >= 500 && y < 700);
// A faixa de cima só tem arte embaixo: a LaMa continua a textura, e não a tendência do
// degradê (o verde, que sobe com o y, fica perto do da borda). O que se cobra ali é a
// costura: o salto entre a última linha inventada (199) e a primeira da foto (200),
// comparado com o salto natural do degradê entre duas linhas (≈ 0,2).
const faixa = erroEm((x, y) => y < 200);
let salto = 0;
for (let x = 0; x < w; x++) {
  for (let k = 0; k < 3; k++) salto += Math.abs(r.rgb[(199 * w + x) * 3 + k] - r.rgb[(200 * w + x) * 3 + k]);
}
salto /= w * 3;

console.log(`LaMa: ${ladrilhos} ladrilhos em ${(ms / 1000).toFixed(1)} s; furo do meio: erro médio ${furo.medio.toFixed(2)} `
  + `(pior ${furo.pior}); faixa: erro médio ${faixa.medio.toFixed(2)}, salto na borda ${salto.toFixed(2)}`);
assert.ok(furo.medio < 8, `o furo do meio não fechou o degradê: erro médio ${furo.medio.toFixed(2)}`);
assert.ok(salto < 6, `há costura na borda da faixa: salto de ${salto.toFixed(2)}`);
console.log("OK — a LaMa continua o degradê sem costura.");
```

Run: `npm run bancada:pecas-rede`
Expected (os números variam pouco): `LaMa: 5 ladrilhos em ~22 s; furo do meio: erro médio ~3,3 (pior ~15); faixa: erro médio ~31, salto na borda ~4,2` e `OK — a LaMa continua o degradê sem costura.` O erro da faixa é alto de propósito e não é cobrado: só com arte embaixo, a LaMa continua a textura e não a tendência do degradê.

- [ ] **Step 7: a bancada nova no Conferir — `.github/workflows/conferir.yml`**

```yaml
      - name: Extrator (sem rede)
        run: npm run bancada:extrator && npm run bancada:pecas
```

- [ ] **Step 8: commit**

```bash
git add servidor/extrator-preencher.js empacotar/modelos.js bancada/conferir-pecas.mjs bancada/conferir-pecas-rede.mjs package.json .github/workflows/conferir.yml
git commit -m "A LaMa entra no servidor do Extrator: preenche o que a peça montada não tem, em ladrilhos de 512, e o npm run modelos a baixa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: a fila dividida — a ampliação e o preenchimento, um de cada vez, com teto

**Files:**
- Create: `servidor/extrator-fila.js`
- Modify: `servidor/extrator-api.js`, `bancada/conferir-pecas.mjs`

**Interfaces — Consumes:** `preencher.porqueNaoPreenche`, `preencher.ladrilhosDe`, `preencher.preencher` (Task 1).

**Interfaces — Produces:**
- `servidor/extrator-fila.js`: `MAXIMO_ESPERANDO = 4`, `VALIDADE_MS = 30 min`, `criarFila({ maximoEsperando?, validadeMs?, agora? }?) → { colocar(total, rodar: (w) => Promise<Buffer>) → { id, total }, ver(id) → w | null, entregue(id), cancelar(id), varrer(), vazia() → Promise, tamanho() }` — `w = { estado: "esperando"|"rodando"|"pronto"|"falhou", feitos, total, png, erro, cancelado, criado }`; `colocar` estoura com `codigo: "fila-cheia", status: 429`; `rotasDeAcompanhar(router, caminho, fila, { sumiu, falhou })` (GET `caminho/:id` e DELETE `caminho/:id`)
- HTTP: `POST /api/extrator/preencher?largura&altura` (RGBA cru, até 4096 de lado) → `{ id, total }`; `GET /api/extrator/preencher/:id` → `{ feitos, total }` ou o PNG (RGB, sem transparência); `DELETE` cancela. `GET /api/extrator/estado` ganha `preencher: string | null`. `POST /ampliar` aceita até 160 MB e responde 429 `fila-cheia`.
- `extrator-api.js` exporta também `lerPedidoDePreencher(query, bytes) → { largura, altura } | { erro }`.

- [ ] **Step 1: os testes da fila e do pedido**

Em `bancada/conferir-pecas.mjs`, antes da linha final `console.log("OK — …")`:

```js
// ---------- a fila dos trabalhos pesados ----------
{
  const { criarFila } = require("../servidor/extrator-fila.js");
  let relogio = 0;
  const fila = criarFila({ maximoEsperando: 2, validadeMs: 1000, agora: () => relogio });
  let soltar;
  const trava = new Promise((pronto) => { soltar = pronto; });
  const rodou = [];
  const a = fila.colocar(3, async (w) => { rodou.push("a"); w.feitos = 1; await trava; return Buffer.from("png-a"); });
  assert.equal(fila.ver(a.id).estado, "esperando", "começa esperando; roda no tique seguinte");
  await new Promise((pronto) => setTimeout(pronto, 0));
  const b = fila.colocar(1, async () => { rodou.push("b"); return Buffer.from("png-b"); });
  const c = fila.colocar(1, async () => { rodou.push("c"); return Buffer.from("png-c"); });
  assert.equal(fila.ver(a.id).estado, "rodando", "o primeiro roda");
  assert.equal(fila.ver(a.id).feitos, 1);
  // Esperando: b e c. O quarto passa do máximo de 2.
  assert.throws(() => fila.colocar(1, async () => Buffer.alloc(0)), (e) => e.codigo === "fila-cheia" && e.status === 429
    && e.message === "Já há trabalhos demais na fila; espere um terminar.");
  fila.cancelar(b.id);
  assert.equal(fila.ver(b.id), null, "o cancelado some");
  soltar();
  await fila.vazia();
  assert.deepEqual(rodou, ["a", "c"], "o cancelado não roda");
  assert.equal(fila.ver(a.id).png.toString(), "png-a");
  fila.entregue(a.id);
  assert.equal(fila.ver(a.id), null);

  // A varredura: o que ninguém buscou em 30 min (aqui, 1 s) é cancelado.
  let soltar2;
  const trava2 = new Promise((pronto) => { soltar2 = pronto; });
  const rodou2 = [];
  const d = fila.colocar(1, async () => { await trava2; return Buffer.from("d"); });
  const e = fila.colocar(1, async () => { rodou2.push("e"); return Buffer.from("e"); });
  relogio += 1500;
  assert.equal(fila.ver(e.id), null, "venceu");
  assert.equal(fila.ver(d.id), null);
  soltar2();
  await fila.vazia();
  assert.deepEqual(rodou2, [], "o vencido não roda");
  assert.equal(fila.ver(c.id), null, "o pronto que ninguém buscou também vence");
  assert.equal(fila.tamanho(), 0);

  // Uma falha vira o erro do trabalho, e a fila segue.
  const f = fila.colocar(1, async () => { throw new Error("pifou"); });
  const g = fila.colocar(1, async () => Buffer.from("g"));
  await fila.vazia();
  assert.equal(fila.ver(f.id).estado, "falhou");
  assert.equal(fila.ver(f.id).erro, "pifou");
  assert.equal(fila.ver(g.id).estado, "pronto");
}

// ---------- o pedido de preencher ----------
{
  const api = require("../servidor/extrator-api.js");
  assert.deepEqual(api.lerPedidoDePreencher({ largura: "4", altura: "3" }, Buffer.alloc(48)), { largura: 4, altura: 3 });
  assert.match(api.lerPedidoDePreencher({ largura: "4", altura: "3" }, Buffer.alloc(47)).erro, /não veio inteira/);
  assert.match(api.lerPedidoDePreencher({ largura: "5000", altura: "3" }, Buffer.alloc(60000)).erro, /4096/);
  assert.match(api.lerPedidoDePreencher({}, Buffer.alloc(4)).erro, /Faltou a medida/);
}
```

E a linha final passa a ser:

```js
console.log("OK — as peças da camisa sem rede: o preenchimento, a fila e o pedido.");
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npm run bancada:pecas`
Expected: FAIL com `Cannot find module '../servidor/extrator-fila.js'`.

- [ ] **Step 3: a fila — `servidor/extrator-fila.js`**

```js
/**
 * ===========================================================================
 * A FILA DO EXTRATOR — um trabalho pesado de cada vez
 * ===========================================================================
 *
 * A ampliação (Real-ESRGAN) e o preenchimento (LaMa) usam os mesmos seis
 * núcleos: dois ao mesmo tempo só dividiriam a máquina. Os dois entram nesta
 * fila, que roda um de cada vez, guarda o andamento para a tela perguntar, e
 * entrega o PNG quando fica pronto.
 *
 * As travas (da revisão final do Extrator):
 *
 *   - no máximo `MAXIMO_ESPERANDO` (4) trabalhos esperando a vez; o quinto
 *     recebe `fila-cheia` (429): a API escuta a rede da gráfica inteira, e uma
 *     fila sem fim deixaria qualquer um encher a memória do servidor;
 *   - o trabalho que ninguém buscar em 30 minutos é cancelado e some, esteja
 *     ele esperando, rodando ou pronto.
 */

const crypto = require("crypto");

const MAXIMO_ESPERANDO = 4;
const VALIDADE_MS = 30 * 60 * 1000;

function criarFila({ maximoEsperando = MAXIMO_ESPERANDO, validadeMs = VALIDADE_MS, agora = Date.now } = {}) {
  /** id → { estado: "esperando"|"rodando"|"pronto"|"falhou", feitos, total, png, erro, cancelado, criado } */
  const trabalhos = new Map();
  let fila = Promise.resolve();

  function varrer() {
    const t = agora();
    for (const [id, w] of trabalhos) {
      if (t - w.criado > validadeMs) {
        w.cancelado = true;
        trabalhos.delete(id);
      }
    }
  }

  const esperando = () => [...trabalhos.values()].filter((w) => w.estado === "esperando").length;

  /**
   * Põe um trabalho na fila. `rodar(w)` recebe o registro (para `w.feitos`,
   * `w.total` e `w.cancelado`) e devolve o PNG. Estoura com `codigo:
   * "fila-cheia"` quando já há trabalhos demais esperando.
   */
  function colocar(total, rodar) {
    varrer();
    if (esperando() >= maximoEsperando) {
      throw Object.assign(new Error("Já há trabalhos demais na fila; espere um terminar."), { codigo: "fila-cheia", status: 429 });
    }
    const id = crypto.randomUUID();
    const w = { estado: "esperando", feitos: 0, total, png: null, erro: null, cancelado: false, criado: agora() };
    trabalhos.set(id, w);
    fila = fila
      .then(async () => {
        if (w.cancelado) return;
        w.estado = "rodando";
        const png = await rodar(w);
        if (!w.cancelado) {
          w.png = png;
          w.estado = "pronto";
        }
      })
      .catch((erro) => {
        w.erro = erro.message;
        w.estado = "falhou";
      });
    return { id, total };
  }

  /** O trabalho, ou `null` se ele não existe mais (venceu, foi cancelado ou já foi entregue). */
  function ver(id) {
    varrer();
    return trabalhos.get(id) || null;
  }

  /** Tira da fila depois de entregar o PNG ou o erro. */
  function entregue(id) {
    trabalhos.delete(id);
  }

  function cancelar(id) {
    const w = trabalhos.get(id);
    if (w) {
      w.cancelado = true;
      trabalhos.delete(id);
    }
  }

  /** Para a bancada: espera a fila esvaziar. */
  const vazia = () => fila;

  return { colocar, ver, entregue, cancelar, varrer, vazia, tamanho: () => trabalhos.size };
}

/**
 * As rotas de acompanhar um trabalho, iguais para a ampliação e o
 * preenchimento: GET devolve o andamento ou o PNG; DELETE cancela. `textos`
 * leva as duas frases de falha, que mudam de gênero ("Essa ampliação",
 * "Esse preenchimento").
 */
function rotasDeAcompanhar(router, caminho, fila, textos) {
  router.get(`${caminho}/:id`, (req, res) => {
    const w = fila.ver(req.params.id);
    if (!w) return res.status(404).json({ error: textos.sumiu, codigo: null });
    if (w.estado === "falhou") {
      fila.entregue(req.params.id);
      return res.status(500).json({ error: `${textos.falhou}: ${w.erro}`, codigo: null });
    }
    if (w.estado !== "pronto") return res.json({ feitos: w.feitos, total: w.total });
    fila.entregue(req.params.id);
    res.setHeader("Content-Type", "image/png");
    res.send(w.png);
  });
  router.delete(`${caminho}/:id`, (req, res) => {
    fila.cancelar(req.params.id);
    res.json({ ok: true });
  });
}

module.exports = { MAXIMO_ESPERANDO, VALIDADE_MS, criarFila, rotasDeAcompanhar };
```

- [ ] **Step 4: a API usa a fila e ganha o `/preencher` — `servidor/extrator-api.js`**

No cabeçalho, a lista de rotas:

```js
 *   POST   /ampliar       o RGBA cru do elemento → { id, total }
 *   GET    /ampliar/:id   o andamento, ou o PNG pronto
 *   DELETE /ampliar/:id   cancela
 *   POST   /preencher     o RGBA cru da peça montada → { id, total }
 *   GET    /preencher/:id o andamento, ou o PNG pronto (sem transparência)
 *   DELETE /preencher/:id cancela
 *   POST   /png           { svg, largura, altura } → PNG transparente
```

Os `require`: sai o `const crypto = require("crypto");` (o id agora é da fila), e depois de `const ampliar = require("./extrator-ampliar");` entram:

```js
const preencher = require("./extrator-preencher");
const { criarFila, rotasDeAcompanhar } = require("./extrator-fila");
```

O `/estado`:

```js
router.get("/estado", (req, res) => res.json({
  ...rede.estadoDaRede(), ampliar: ampliar.porqueNaoAmplia(), preencher: preencher.porqueNaoPreenche(),
}));
```

Tudo o que vai do comentário `/**\n * As ampliações em andamento: …` até a linha antes de `/** O SVG do vetor.js, e só ele: …` (o mapa `ampliacoes`, a `fila`, o `POST /ampliar`, o `GET /ampliar/:id` e o `DELETE /ampliar/:id`) é trocado por:

```js
/**
 * A fila dos trabalhos pesados (a ampliação e o preenchimento), um de cada
 * vez: ver `extrator-fila.js`. A tela pergunta o andamento a cada 400 ms.
 */
const fila = criarFila();

/** O maior elemento que sobe para ampliar: a foto inteira no teto de entrada, 40 MP × 4 bytes. */
const CORPO_DO_RGBA = "160mb";

function responderFila(res, erro) {
  if (erro.codigo === "fila-cheia") return res.status(429).json({ error: erro.message, codigo: erro.codigo });
  throw erro;
}

router.post("/ampliar", express.raw({ limit: CORPO_DO_RGBA, type: () => true }), (req, res) => {
  const pedido = lerPedidoDeAmpliar(req.query, req.body);
  if (pedido.erro) return res.status(400).json({ error: pedido.erro, codigo: null });
  const { largura, altura, saidaLargura, saidaAltura } = pedido;
  const comRede = ampliar.precisaDaRede(largura, altura, saidaLargura, saidaAltura);
  const motivo = comRede ? ampliar.porqueNaoAmplia() : null;
  if (motivo) return res.status(503).json({ error: motivo, codigo: "sem-rede" });
  const rgba = req.body;
  try {
    res.json(fila.colocar(comRede ? ampliar.ladrilhosDe(largura, altura) : 1, async (w) => {
      const r = await ampliar.ampliar(rgba, largura, altura, saidaLargura, saidaAltura, {
        aoAndar: (feitos, total) => { w.feitos = feitos; w.total = total; },
        cancelado: () => w.cancelado,
      });
      return sharp(r.rgba, { raw: { width: r.largura, height: r.altura, channels: 4 } }).png().toBuffer();
    }));
  } catch (erro) {
    responderFila(res, erro);
  }
});

rotasDeAcompanhar(router, "/ampliar", fila, {
  sumiu: "Essa ampliação não existe mais: venceu ou foi cancelada.", falhou: "A ampliação falhou",
});

/** O pedido de preenchimento: a medida da peça montada, e os bytes batendo com ela. */
function lerPedidoDePreencher(query, bytes) {
  const largura = Number(query.largura), altura = Number(query.altura);
  if (![largura, altura].every((v) => Number.isInteger(v) && v > 0 && v <= 4096)) {
    return { erro: "Faltou a medida da peça, ou ela passa de 4096 px de lado." };
  }
  if (!bytes || bytes.length !== largura * altura * 4) return { erro: "A peça não veio inteira: o tamanho não bate com a medida." };
  return { largura, altura };
}

router.post("/preencher", express.raw({ limit: "80mb", type: () => true }), (req, res) => {
  const pedido = lerPedidoDePreencher(req.query, req.body);
  if (pedido.erro) return res.status(400).json({ error: pedido.erro, codigo: null });
  const motivo = preencher.porqueNaoPreenche();
  if (motivo) return res.status(503).json({ error: motivo, codigo: "sem-rede" });
  const { largura, altura } = pedido;
  const rgba = req.body;
  try {
    res.json(fila.colocar(preencher.ladrilhosDe(rgba, largura, altura), async (w) => {
      const r = await preencher.preencher(rgba, largura, altura, {
        aoAndar: (feitos, total) => { w.feitos = feitos; w.total = total; },
        cancelado: () => w.cancelado,
      });
      return sharp(r.rgb, { raw: { width: r.largura, height: r.altura, channels: 3 } }).png().toBuffer();
    }));
  } catch (erro) {
    responderFila(res, erro);
  }
});

rotasDeAcompanhar(router, "/preencher", fila, {
  sumiu: "Esse preenchimento não existe mais: venceu ou foi cancelado.", falhou: "O preenchimento falhou",
});
```

E no fim, junto dos outros `module.exports.…`:

```js
module.exports.lerPedidoDePreencher = lerPedidoDePreencher;
```

- [ ] **Step 5: rodar e ver passar — a nova e a do Extrator**

Run: `npm run bancada:pecas && npm run bancada:extrator && node --check servidor/server.js`
Expected: `OK — as peças da camisa sem rede: o preenchimento, a fila e o pedido.` e `OK — o Extrator sem rede: …`.

- [ ] **Step 6: commit**

```bash
git add servidor/extrator-fila.js servidor/extrator-api.js bancada/conferir-pecas.mjs
git commit -m "A ampliação e o preenchimento dividem uma fila só, com no máximo 4 esperando, e o corpo do /ampliar cai para 160 MB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: os motores das peças — corpo sem manga, encaixe, manga juntada e sombra

**Files:**
- Create: `src/motores/pecasDaCamisa.js`
- Modify: `src/motores/recorte.js` (só o `export` do `engordar`), `bancada/conferir-pecas.mjs`

**Interfaces — Produces** (`src/motores/pecasDaCamisa.js`, ESM, conta pura):
- `MARCACOES: { id, nome }[]` — as seis, na ordem: `frente`, `costas`, `manga-esquerda-frente`, `manga-esquerda-costas`, `manga-direita-frente`, `manga-direita-costas`
- `PECAS: { id, nome, papel }[]` — `frente`/"Frente"/"frente", `costas`, `manga-esquerda`/"Manga esquerda"/"manga esquerda", `manga-direita`
- `LADO_DA_MONTAGEM = 2048`, `LIMITE_INVENTADO = 0.5`, `COSTURA_DA_MANGA = 0.03`, `AJUSTE_INICIAL = { zoom: 1, dx: 0, dy: 0 }`
- `corpoSemMangas(alfa: Uint8Array, mangas: (Uint8Array|null)[], largura, altura) → { alfa: Uint8Array, soltas: number[] }`
- `tamanhoDaMontagem(larguraCm, alturaCm) → { largura, altura }`
- `encaixeNaArea(larguraArte, alturaArte, area: { x, y, largura, altura }, ajuste?) → { escala, x, y }`
- `desenharNaArea(destino, L, A, recorte, area, encaixe, espelhar?)`
- `parteInventada(rgba) → number` (0 a 1)
- `montarPeca(recorte, { largura, altura }, ajuste?) → { rgba: Uint8ClampedArray, largura, altura, inventado }`
- `montarManga(frente: Recorte|null, costas: Recorte|null, { largura, altura }, ajuste?, nome?) → { rgba, largura, altura, inventado, aviso: string|null } | null`
- `tirarSombra(recorte) → { rgba, largura, altura, x0, y0, clareou: boolean }` (um recorte NOVO)
- `src/motores/recorte.js` passa a exportar `engordar(marcado, largura, altura, raio) → Uint8Array`.

(`Recorte` é `{ rgba: Uint8ClampedArray, largura, altura, x0, y0 }`, o de `src/telas/extrator/tipos.ts`.)

- [ ] **Step 1: os testes dos motores**

Em `bancada/conferir-pecas.mjs`, antes da linha final `console.log("OK — …")`:

```js
// ---------- os motores das peças ----------
{
  const { carregarModulo } = await import("./carregarModulo.mjs");
  const m = await carregarModulo("src/motores/pecasDaCamisa.js");

  // Uma camisa de 400 × 300: corpo de 200 × 250 e duas mangas de 60 × 80 encostadas nele.
  const w = 400, h = 300;
  const retangulo = (x0, y0, x1, y1) => {
    const a = new Uint8Array(w * h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * w + x] = 255;
    return a;
  };
  const camisa = retangulo(100, 50, 300, 300);
  for (let y = 50; y < 130; y++) for (let x = 40; x < 100; x++) camisa[y * w + x] = 255;
  for (let y = 50; y < 130; y++) for (let x = 300; x < 360; x++) camisa[y * w + x] = 255;
  const mangaDaFoto = retangulo(40, 50, 100, 130), outraManga = retangulo(300, 50, 360, 130);
  const longe = retangulo(0, 290, 10, 300);
  const corpo = m.corpoSemMangas(camisa, [mangaDaFoto, outraManga, null, longe], w, h);
  assert.equal(corpo.alfa.reduce((n, v) => n + (v >= 128), 0), 200 * 250, "o corpo fica sem as duas mangas");
  assert.deepEqual(corpo.soltas, [3], "a caixa que não encosta no corpo é avisada, e não tirada");

  assert.deepEqual(m.tamanhoDaMontagem(50, 70), { largura: 1463, altura: 2048 });
  assert.deepEqual(m.encaixeNaArea(100, 200, { x: 0, y: 0, largura: 50, altura: 50 }), { escala: 0.5, x: 0, y: -25 });
  assert.deepEqual(m.encaixeNaArea(100, 200, { x: 0, y: 0, largura: 50, altura: 50 }, { zoom: 2, dx: 0.1, dy: 0 }), { escala: 1, x: -20, y: -75 });

  // A frente: 100 × 100 vermelha com um decote de 20 × 20 vazio, num retângulo de 200 × 300.
  const frente = { rgba: new Uint8ClampedArray(100 * 100 * 4), largura: 100, altura: 100, x0: 0, y0: 0 };
  for (let i = 0; i < 100 * 100; i++) {
    const x = i % 100, y = Math.floor(i / 100);
    const decote = x >= 40 && x < 60 && y < 20;
    frente.rgba.set([200, 30, 40, decote ? 0 : 255], i * 4);
    if (x < 5) frente.rgba.set([0, 0, 255, 255], i * 4); // a faixa azul da esquerda
  }
  const peca = m.montarPeca(frente, { largura: 200, altura: 300 });
  const esperado = (200 * 100 + 40 * 40) / (200 * 300);
  assert.ok(Math.abs(peca.inventado - esperado) < 0.02 * esperado, `a parte inventada: ${peca.inventado} (esperava ${esperado})`);
  const px = (r, x, y) => Array.from(r.rgba.subarray((y * r.largura + x) * 4, (y * r.largura + x) * 4 + 4));
  assert.equal(px(peca, 100, 49)[3], 0, "a faixa de cima fica para inventar");
  assert.deepEqual(px(peca, 100, 200), [200, 30, 40, 255]);
  assert.deepEqual(px(peca, 4, 150), [0, 0, 255, 255], "a faixa azul de 5 px virou 10: a arte cresceu sem deformar");
  assert.deepEqual(px(peca, 12, 150), [200, 30, 40, 255]);

  // A manga: a frente com a faixa azul na esquerda; as costas verdes.
  const verde = { rgba: new Uint8ClampedArray(50 * 100 * 4), largura: 50, altura: 100, x0: 0, y0: 0 };
  for (let i = 0; i < 50 * 100; i++) verde.rgba.set([20, 160, 60, 255], i * 4);
  const meiaFrente = { rgba: new Uint8ClampedArray(50 * 100 * 4), largura: 50, altura: 100, x0: 0, y0: 0 };
  for (let i = 0; i < 50 * 100; i++) meiaFrente.rgba.set(i % 50 < 5 ? [0, 0, 255, 255] : [200, 30, 40, 255], i * 4);
  const manga = m.montarManga(meiaFrente, verde, { largura: 200, altura: 200 }, m.AJUSTE_INICIAL, "manga esquerda");
  assert.equal(manga.aviso, null);
  assert.deepEqual(px(manga, 2, 100), [0, 0, 255, 255], "a frente na metade da esquerda");
  assert.deepEqual(px(manga, 150, 100), [20, 160, 60, 255], "as costas na da direita");
  assert.equal(px(manga, 100, 100)[3], 0, "a costura do meio fica para o preenchimento");
  assert.equal(px(manga, 96, 100)[3], 255);
  const soFrente = m.montarManga(meiaFrente, null, { largura: 200, altura: 200 }, m.AJUSTE_INICIAL, "manga esquerda");
  assert.match(soFrente.aviso, /^A manga esquerda só tem a vista da frente/);
  assert.deepEqual(px(soFrente, 197, 100), [0, 0, 255, 255], "sem as costas, a frente espelhada: a faixa azul vai para a borda da direita");
  assert.equal(m.montarManga(null, null, { largura: 10, altura: 10 }), null);

  // A sombra: camisa branca escurecendo da esquerda (255) para a direita (178), com um escudo vermelho.
  const sw = 400, sh = 300;
  const comSombra = { rgba: new Uint8ClampedArray(sw * sh * 4), largura: sw, altura: sh, x0: 0, y0: 0 };
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const f = 1 - (0.3 * x) / (sw - 1);
      const escudo = x >= 150 && x < 250 && y >= 100 && y < 200;
      const cor = escudo ? [200, 30, 40] : [255, 255, 255];
      comSombra.rgba.set([cor[0] * f, cor[1] * f, cor[2] * f, 255], (y * sw + x) * 4);
    }
  }
  const limpa = m.tirarSombra(comSombra);
  assert.equal(limpa.clareou, true);
  for (const [x, y] of [[5, 20], [200, 20], [395, 20], [395, 290], [100, 150]]) {
    const p = px(limpa, x, y);
    assert.ok(p[0] > 245 && p[1] > 245 && p[2] > 245, `o branco em ${x},${y} voltou a ${p}`);
  }
  const escudo = px(limpa, 240, 150);
  assert.ok(Math.abs(escudo[0] - 200) <= 20 && escudo[1] < 60, `o escudo do lado escuro voltou a ${escudo}`);
  assert.equal(comSombra.rgba[(20 * sw + 395) * 4], Math.round(255 * (1 - (0.3 * 395) / 399)), "o recorte de entrada não muda");
  // Camisa azul-marinho inteira: não há branco para medir a luz, e nada muda.
  const marinho = { rgba: new Uint8ClampedArray(64 * 64 * 4), largura: 64, altura: 64, x0: 0, y0: 0 };
  for (let i = 0; i < 64 * 64; i++) marinho.rgba.set([20, 30, 70, 255], i * 4);
  const igual = m.tirarSombra(marinho);
  assert.equal(igual.clareou, false);
  assert.deepEqual(Array.from(igual.rgba), Array.from(marinho.rgba));
}
```

E a linha final passa a ser:

```js
console.log("OK — as peças da camisa sem rede: o preenchimento, a fila, o pedido e os motores.");
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npm run bancada:pecas`
Expected: FAIL — o esbuild não acha `src/motores/pecasDaCamisa.js`.

- [ ] **Step 3: o `engordar` exportado — `src/motores/recorte.js`**

```js
/** Os marcados engordados `raio` pixels numa caixa: um máximo deslizante nas linhas e outro nas colunas. */
export function engordar(marcado, largura, altura, raio) {
```

(Só a palavra `export` entra; o corpo não muda.)

- [ ] **Step 4: os motores — `src/motores/pecasDaCamisa.js`**

```js
/**
 * ===========================================================================
 * AS PEÇAS DA CAMISA — o mockup vira o retângulo cheio de cada peça
 * ===========================================================================
 *
 * O Extrator separa a camisa do mockup; aqui ela vira a arte como foi
 * desenhada antes de virar camisa: um retângulo para a frente, um para as
 * costas e um para cada manga, na medida que o operador digita. É o mesmo
 * retângulo que sai do Corel e que o `arteMolde.js` sabe encaixar no molde.
 *
 * O caminho de uma peça, todo em conta pura (roda no worker do Extrator):
 *
 *   1. o corpo é a máscara da frente (ou das costas) MENOS as das mangas da
 *      mesma vista — a cava é a divisa;
 *   2. a sombra do mockup sai: a luz é estimada pelo que deveria ser branco
 *      e dividida (`tirarSombra`);
 *   3. a arte entra no retângulo SEM DEFORMAR, cobrindo a largura e
 *      centralizada (`encaixeNaArea`); o operador ajusta zoom e posição;
 *   4. o que fica de fora da silhueta (decote, cavas, faixas) sai com alfa 0:
 *      é o buraco que a LaMa preenche no servidor.
 *
 * A manga junta as duas vistas num retângulo só: a metade da esquerda vem da
 * vista da frente e a da direita, espelhada, da vista das costas; a costura do
 * meio vira buraco, para o preenchimento suavizar a emenda.
 *
 * Esquerda e direita são de QUEM VESTE a camisa: na vista da frente, a manga
 * esquerda aparece do lado direito da foto.
 */

import { engordar } from "./recorte";

/** As seis marcações, na ordem em que a tela pede. */
export const MARCACOES = [
  { id: "frente", nome: "Frente" },
  { id: "costas", nome: "Costas" },
  { id: "manga-esquerda-frente", nome: "Manga esquerda, vista da frente" },
  { id: "manga-esquerda-costas", nome: "Manga esquerda, vista das costas" },
  { id: "manga-direita-frente", nome: "Manga direita, vista da frente" },
  { id: "manga-direita-costas", nome: "Manga direita, vista das costas" },
];

/** As quatro peças que saem, com o papel delas no molde (ver `telas/moldes/vocabulario.ts`). */
export const PECAS = [
  { id: "frente", nome: "Frente", papel: "frente" },
  { id: "costas", nome: "Costas", papel: "costas" },
  { id: "manga-esquerda", nome: "Manga esquerda", papel: "manga esquerda" },
  { id: "manga-direita", nome: "Manga direita", papel: "manga direita" },
];

/** O lado maior da montagem que vai à LaMa; o tamanho final sai da ampliação. */
export const LADO_DA_MONTAGEM = 2048;
/** Acima disto da peça inventada, a tela avisa antes de seguir. */
export const LIMITE_INVENTADO = 0.5;
/** A largura da costura do meio da manga, em fração da largura da manga. */
export const COSTURA_DA_MANGA = 0.03;

/**
 * O corpo: a máscara da peça sem as mangas da mesma vista. Devolve a máscara
 * nova e quais mangas NÃO encostam no corpo (a divisa não foi achada: a caixa
 * da manga pegou outra coisa). A manga solta não é tirada do corpo.
 */
export function corpoSemMangas(alfa, mangas, largura, altura) {
  const corpo = Uint8Array.from(alfa);
  const soltas = [];
  mangas.forEach((manga, i) => {
    if (!manga) return;
    const marcada = new Uint8Array(largura * altura);
    for (let p = 0; p < marcada.length; p++) marcada[p] = manga[p] >= 128 ? 1 : 0;
    const perto = engordar(marcada, largura, altura, 3);
    let encosta = false;
    for (let p = 0; p < marcada.length && !encosta; p++) if (perto[p] && !marcada[p] && alfa[p] >= 128) encosta = true;
    if (!encosta) {
      soltas.push(i);
      return;
    }
    for (let p = 0; p < marcada.length; p++) if (marcada[p]) corpo[p] = 0;
  });
  return { alfa: corpo, soltas };
}

/** O tamanho da montagem para a medida em cm: a mesma proporção, lado maior em `LADO_DA_MONTAGEM`. */
export function tamanhoDaMontagem(larguraCm, alturaCm) {
  const k = LADO_DA_MONTAGEM / Math.max(larguraCm, alturaCm);
  return { largura: Math.max(1, Math.round(larguraCm * k)), altura: Math.max(1, Math.round(alturaCm * k)) };
}

export const AJUSTE_INICIAL = { zoom: 1, dx: 0, dy: 0 };

/**
 * Onde a arte entra na área: sem deformar, cobrindo a largura, centralizada.
 * `zoom` aumenta a partir daí; `dx` e `dy` deslocam, em fração da área.
 */
export function encaixeNaArea(larguraArte, alturaArte, area, ajuste = AJUSTE_INICIAL) {
  const escala = (area.largura / larguraArte) * ajuste.zoom;
  return {
    escala,
    x: area.x + (area.largura - larguraArte * escala) / 2 + ajuste.dx * area.largura,
    y: area.y + (area.altura - alturaArte * escala) / 2 + ajuste.dy * area.altura,
  };
}

/**
 * Desenha o recorte no destino (RGBA de `L × A`), só dentro da área, no
 * encaixe dado. A cor é misturada pesando o alfa (o vizinho transparente não
 * escurece a borda). `espelhar` vira o recorte de lado.
 */
export function desenharNaArea(destino, L, A, recorte, area, encaixe, espelhar = false) {
  const { rgba, largura: w, altura: h } = recorte;
  const x0 = Math.max(0, Math.floor(area.x)), y0 = Math.max(0, Math.floor(area.y));
  const x1 = Math.min(L, Math.ceil(area.x + area.largura)), y1 = Math.min(A, Math.ceil(area.y + area.altura));
  for (let y = y0; y < y1; y++) {
    const sy = (y + 0.5 - encaixe.y) / encaixe.escala - 0.5;
    if (sy < -0.5 || sy > h - 0.5) continue;
    const ya = Math.max(0, Math.min(h - 1, Math.floor(sy))), yb = Math.min(h - 1, ya + 1), fy = Math.max(0, Math.min(1, sy - ya));
    for (let x = x0; x < x1; x++) {
      let sx = (x + 0.5 - encaixe.x) / encaixe.escala - 0.5;
      if (sx < -0.5 || sx > w - 0.5) continue;
      if (espelhar) sx = w - 1 - sx;
      const xa = Math.max(0, Math.min(w - 1, Math.floor(sx))), xb = Math.min(w - 1, xa + 1), fx = Math.max(0, Math.min(1, sx - xa));
      const pesos = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const ids = [(ya * w + xa) * 4, (ya * w + xb) * 4, (yb * w + xa) * 4, (yb * w + xb) * 4];
      let a = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const pa = pesos[k] * rgba[ids[k] + 3];
        a += pa; r += pa * rgba[ids[k]]; g += pa * rgba[ids[k] + 1]; b += pa * rgba[ids[k] + 2];
      }
      const para = (y * L + x) * 4;
      if (a > 0) {
        destino[para] = Math.round(r / a); destino[para + 1] = Math.round(g / a); destino[para + 2] = Math.round(b / a);
      }
      destino[para + 3] = Math.round(a);
    }
  }
}

/** A fração do retângulo que vai ser inventada (alfa abaixo de 128). */
export function parteInventada(rgba) {
  let n = 0;
  const total = rgba.length / 4;
  for (let i = 0; i < total; i++) if (rgba[i * 4 + 3] < 128) n++;
  return total ? n / total : 0;
}

/** A frente ou as costas no retângulo: `{ rgba, largura, altura, inventado }`. */
export function montarPeca(recorte, tamanho, ajuste = AJUSTE_INICIAL) {
  const { largura: L, altura: A } = tamanho;
  const rgba = new Uint8ClampedArray(L * A * 4);
  const area = { x: 0, y: 0, largura: L, altura: A };
  desenharNaArea(rgba, L, A, recorte, area, encaixeNaArea(recorte.largura, recorte.altura, area, ajuste));
  return { rgba, largura: L, altura: A, inventado: parteInventada(rgba) };
}

/**
 * A manga: a vista da frente na metade da esquerda e a das costas, espelhada,
 * na da direita; a costura do meio vira buraco. Sem uma das vistas, a outra
 * entra nas duas metades (espelhada na segunda) e `aviso` diz qual faltou.
 * Sem nenhuma, `null`.
 */
export function montarManga(frente, costas, tamanho, ajuste = AJUSTE_INICIAL, nome = "manga") {
  if (!frente && !costas) return null;
  const { largura: L, altura: A } = tamanho;
  const rgba = new Uint8ClampedArray(L * A * 4);
  const meio = Math.round(L / 2);
  const esquerda = { x: 0, y: 0, largura: meio, altura: A };
  const direita = { x: meio, y: 0, largura: L - meio, altura: A };
  const daFrente = frente || costas, deTras = costas || frente;
  // A metade de trás é sempre espelhada: é a manga aberta, vista do mesmo lado.
  desenharNaArea(rgba, L, A, daFrente, esquerda, encaixeNaArea(daFrente.largura, daFrente.altura, esquerda, ajuste));
  desenharNaArea(rgba, L, A, deTras, direita, encaixeNaArea(deTras.largura, deTras.altura, direita, ajuste), true);
  const meia = Math.max(1, Math.round((L * COSTURA_DA_MANGA) / 2));
  for (let y = 0; y < A; y++) for (let x = Math.max(0, meio - meia); x < Math.min(L, meio + meia); x++) rgba[(y * L + x) * 4 + 3] = 0;
  const aviso = !costas ? `A ${nome} só tem a vista da frente: a metade de trás é a da frente, espelhada.`
    : !frente ? `A ${nome} só tem a vista das costas: a metade da frente é a das costas, espelhada.` : null;
  return { rgba, largura: L, altura: A, inventado: parteInventada(rgba), aviso };
}

const CELULA = 32;

/**
 * Tira a sombra do mockup. A luz de cada célula de 32 px é o que o branco
 * dela mostra (o percentil 90 dos pixels claros e pouco saturados); a célula
 * sem branco herda das vizinhas; o campo é suavizado e cada pixel é dividido
 * pela luz dele. Nunca escurece. Numa camisa sem branco (azul-marinho
 * inteira), não há luz a medir e nada muda: `clareou` é falso.
 *
 * Devolve `{ rgba, clareou }` — um recorte NOVO, com o alfa de antes.
 */
export function tirarSombra(recorte) {
  const { rgba, largura: w, altura: h } = recorte;
  const cx = Math.ceil(w / CELULA), cy = Math.ceil(h / CELULA);
  const brancos = Array.from({ length: cx * cy }, () => []);
  let opacos = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 128) continue;
      opacos++;
      const mx = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]), mn = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (mx >= 140 && mx - mn <= 0.12 * mx) brancos[Math.floor(y / CELULA) * cx + Math.floor(x / CELULA)].push(mx);
    }
  }
  const luz = new Float32Array(cx * cy);
  const tem = new Uint8Array(cx * cy);
  let comBranco = 0, brancosTotal = 0;
  for (let c = 0; c < cx * cy; c++) {
    const v = brancos[c];
    brancosTotal += v.length;
    if (v.length < 8) continue;
    v.sort((a, b) => a - b);
    luz[c] = v[Math.floor(v.length * 0.9)];
    tem[c] = 1;
    comBranco++;
  }
  const novo = { rgba: Uint8ClampedArray.from(rgba), largura: w, altura: h, x0: recorte.x0, y0: recorte.y0 };
  if (!opacos || brancosTotal < opacos * 0.05 || comBranco === 0) return { ...novo, clareou: false };

  // A célula sem branco herda a média das vizinhas, de fora para dentro.
  for (let volta = 0; volta < cx + cy; volta++) {
    let faltou = false;
    const herdou = [];
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        if (tem[y * cx + x]) continue;
        let s = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const vx = x + dx, vy = y + dy;
          if (vx < 0 || vy < 0 || vx >= cx || vy >= cy || !tem[vy * cx + vx]) continue;
          s += luz[vy * cx + vx]; n++;
        }
        if (n) herdou.push([y * cx + x, s / n]); else faltou = true;
      }
    }
    for (const [c, v] of herdou) { luz[c] = v; tem[c] = 1; }
    if (!faltou) break;
  }
  // Suaviza o campo (duas caixas 3 × 3): a luz muda devagar; o que muda depressa é a arte.
  for (let passada = 0; passada < 2; passada++) {
    const antes = Float32Array.from(luz);
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        let s = 0, n = 0;
        for (let vy = Math.max(0, y - 1); vy <= Math.min(cy - 1, y + 1); vy++) {
          for (let vx = Math.max(0, x - 1); vx <= Math.min(cx - 1, x + 1); vx++) { s += antes[vy * cx + vx]; n++; }
        }
        luz[y * cx + x] = s / n;
      }
    }
  }
  const saida = novo.rgba;
  for (let y = 0; y < h; y++) {
    const gy = Math.max(0, Math.min(cy - 1, (y + 0.5) / CELULA - 0.5));
    const y0 = Math.floor(gy), y1 = Math.min(cy - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (saida[i + 3] === 0) continue;
      const gx = Math.max(0, Math.min(cx - 1, (x + 0.5) / CELULA - 0.5));
      const x0 = Math.floor(gx), x1 = Math.min(cx - 1, x0 + 1), fx = gx - x0;
      const l = (luz[y0 * cx + x0] * (1 - fx) + luz[y0 * cx + x1] * fx) * (1 - fy)
        + (luz[y1 * cx + x0] * (1 - fx) + luz[y1 * cx + x1] * fx) * fy;
      const ganho = Math.max(1, Math.min(2.5, 255 / Math.max(60, l)));
      saida[i] = saida[i] * ganho; saida[i + 1] = saida[i + 1] * ganho; saida[i + 2] = saida[i + 2] * ganho;
    }
  }
  return { ...novo, clareou: true };
}
```

- [ ] **Step 5: rodar e ver passar**

Run: `npm run bancada:pecas && npm run bancada:extrator`
Expected: `OK — as peças da camisa sem rede: o preenchimento, a fila, o pedido e os motores.` e o do Extrator.

- [ ] **Step 6: commit**

```bash
git add src/motores/pecasDaCamisa.js src/motores/recorte.js bancada/conferir-pecas.mjs
git commit -m "Os motores das peças da camisa: o corpo sem as mangas, a arte no retângulo sem deformar, a manga com as duas vistas e a sombra do mockup tirada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: a análise com IA no servidor — o pedido ao Claude, a conferência, o custo e as travas

**Files:**
- Create: `servidor/extrator-analise.js`, `bancada/analise-de-verdade.mjs`
- Modify: `servidor/extrator-api.js`, `bancada/conferir-pecas.mjs`, `package.json` (a dependência e o script)

**Interfaces — Produces** (`servidor/extrator-analise.js`, CommonJS):
- `MODELO = "claude-opus-5-5"`, `PRECO`, `LIMITE_DIA_PADRAO = 5`, `CABECALHO = "x-optimize-pedido"`, `MARCACOES` (os seis ids), `ESQUEMA`, `INSTRUCOES`
- `porqueNaoAnalisa({ env?, local: boolean, entrou: boolean }) → string | null`
- `ehLocal(req) → boolean`
- `caixaEmPixels({ x0, y0, x1, y1 } de 0 a 1000, largura, altura) → { x0, y0, x1, y1 } | null`
- `converterResposta(bruto, largura, altura) → { peca: { tipo, vistas }, marcacoes: { [id]: caixa }, elementos: { peca, nome, descricao, cores, jeito, caixa }[], ignorados }`
- `custoDe(usage) → number` (US$)
- `textoDoErro(erro, sdk) → string`
- `criarAnalise({ cliente?, sdk?, limiteDia?, hoje? }?) → { analisar(jpeg: Buffer, largura, altura) → Promise<{ ...converterResposta, custo }>, gastoDeHoje(), ocupada() }` — estoura com `codigo` `analise-ocupada` (409), `teto-do-dia` (429), `recusa` (422) ou `analise-falhou` (502)
- HTTP: `POST /api/extrator/analisar` (a foto crua; cabeçalho `X-Optimize-Pedido: extrator`) → o resultado acima; 403 `sem-marca` / `analise-desligada`. `GET /api/extrator/estado` ganha `analise: string | null`.
- Só para a bancada de tela: com `OPTIMIZE_ANALISE_RESPOSTA=<arquivo.json>`, o cliente devolve a resposta gravada no arquivo, sem internet (e o `porqueNaoAnalisa` aceita no lugar da chave).

- [ ] **Step 1: o SDK**

Run: `npm install @anthropic-ai/sdk@^0.131.0`
Expected: `"@anthropic-ai/sdk": "^0.131.0"` em `dependencies` no `package.json` (e o `package-lock.json` atualizado). Ele vai em `dependencies`, e não em `devDependencies`: o servidor o carrega em execução.

No `package.json`, em `scripts`, depois de `"bancada:pecas-rede"`:

```json
    "analise:de-verdade": "node bancada/analise-de-verdade.mjs",
```

- [ ] **Step 2: os testes da análise e das travas da rota**

Em `bancada/conferir-pecas.mjs`, antes da linha final `console.log("OK — …")`:

```js
// ---------- a análise com IA, com um cliente de mentira ----------
{
  const an = require("../servidor/extrator-analise.js");
  const sdk = require("@anthropic-ai/sdk");

  // As travas: sem chave, de outro computador, sem conta.
  assert.match(an.porqueNaoAnalisa({ env: {}, local: true, entrou: true }), /falta a chave ANTHROPIC_API_KEY/);
  assert.match(an.porqueNaoAnalisa({ env: { ANTHROPIC_API_KEY: "x" }, local: false, entrou: true }), /só roda no computador do servidor/);
  assert.equal(an.porqueNaoAnalisa({ env: { ANTHROPIC_API_KEY: "x", OPTIMIZE_ANALISE_NA_REDE: "1" }, local: false, entrou: true }), null);
  assert.match(an.porqueNaoAnalisa({ env: { ANTHROPIC_API_KEY: "x" }, local: true, entrou: false }), /Entre na conta/);
  assert.equal(an.porqueNaoAnalisa({ env: { ANTHROPIC_API_KEY: "x" }, local: true, entrou: true }), null);
  assert.equal(an.ehLocal({ socket: { remoteAddress: "::ffff:127.0.0.1" } }), true);
  assert.equal(an.ehLocal({ socket: { remoteAddress: "192.168.0.20" } }), false);

  // A conversão: 0–1000 vira pixel; caixa fora da foto, papel desconhecido e marcação repetida são ignorados.
  assert.deepEqual(an.caixaEmPixels({ x0: 100, y0: 0, x1: 500, y1: 1000 }, 2048, 1536), { x0: 205, y0: 0, x1: 1024, y1: 1536 });
  assert.equal(an.caixaEmPixels({ x0: 100, y0: 0, x1: 1200, y1: 900 }, 2048, 1536), null);
  const bruto = {
    peca: { tipo: "camiseta raglan manga curta", vistas: ["frente", "costas"] },
    marcacoes: [
      { papel: "frente", caixa: { x0: 20, y0: 50, x1: 480, y1: 950 } },
      { papel: "costas", caixa: { x0: 520, y0: 50, x1: 980, y1: 950 } },
      { papel: "frente", caixa: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { papel: "gola", caixa: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    ],
    elementos: [
      { peca: "frente", nome: "Escudo", descricao: "escudo do time", cores: ["#c8102e", "azul"], jeito: "chapado", caixa: { x0: 300, y0: 200, x1: 400, y1: 330 } },
      { peca: "costas", nome: "Número", descricao: "10", cores: ["#ffffff"], jeito: "chapado", caixa: { x0: 700, y0: 300, x1: 1300, y1: 600 } },
    ],
  };
  const conv = an.converterResposta(bruto, 1000, 500);
  assert.deepEqual(Object.keys(conv.marcacoes), ["frente", "costas"]);
  assert.deepEqual(conv.marcacoes.costas, { x0: 520, y0: 25, x1: 980, y1: 475 });
  assert.equal(conv.elementos.length, 1);
  assert.deepEqual(conv.elementos[0].cores, ["#c8102e"], "só cor em hex");
  assert.equal(conv.ignorados, 3, "a frente repetida, a gola e o número fora da foto");

  // O custo pelos tokens: 3000 de entrada e 2000 de saída no claude-opus-5-5 = US$ 0,052.
  assert.ok(Math.abs(an.custoDe({ input_tokens: 3000, output_tokens: 2000 }) - 0.052) < 1e-12);

  // O pedido que vai ao Claude, e a resposta de volta.
  const pedidos = [];
  const respostaBoa = {
    stop_reason: "end_turn", usage: { input_tokens: 3000, output_tokens: 2000 },
    content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(bruto) }],
  };
  const cliente = (resposta) => ({ beta: { messages: { create: async (p) => { pedidos.push(p); return typeof resposta === "function" ? resposta() : resposta; } } } });
  const a = an.criarAnalise({ cliente: cliente(respostaBoa), sdk, limiteDia: 0.1, hoje: () => "2026-10-07" });
  const r = await a.analisar(Buffer.from("jpeg"), 1000, 500);
  assert.equal(r.peca.tipo, "camiseta raglan manga curta");
  assert.ok(Math.abs(r.custo - 0.052) < 1e-12);
  const p = pedidos[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.fallbacks, "default");
  assert.equal(p.output_config.effort, "medium");
  assert.equal(p.output_config.format.type, "json_schema");
  assert.equal(p.thinking, undefined, "no claude-opus-5-5 o pensamento não se desliga: o parâmetro nem vai");
  assert.deepEqual(p.messages[0].content[0].source, { type: "base64", media_type: "image/jpeg", data: Buffer.from("jpeg").toString("base64") });
  // O teto do dia: US$ 0,052 + 0,052 passa de 0,10; a terceira é recusada antes de gastar.
  await a.analisar(Buffer.from("jpeg"), 1000, 500);
  await assert.rejects(a.analisar(Buffer.from("jpeg"), 1000, 500),
    (e) => e.codigo === "teto-do-dia" && e.status === 429 && /gastou o teto de hoje \(US\$ 0\.10\); volta amanhã/.test(e.message));
  assert.equal(pedidos.length, 2);
  // Outro dia, o teto recomeça.
  const outroDia = an.criarAnalise({ cliente: cliente(respostaBoa), sdk, limiteDia: 0.1, hoje: () => "2026-10-08" });
  assert.equal(outroDia.gastoDeHoje(), 0);

  // Uma de cada vez.
  let soltar;
  const devagar = an.criarAnalise({ cliente: cliente(() => new Promise((ok) => { soltar = () => ok(respostaBoa); })), sdk });
  const primeira = devagar.analisar(Buffer.from("j"), 10, 10);
  await assert.rejects(devagar.analisar(Buffer.from("j"), 10, 10), (e) => e.codigo === "analise-ocupada" && /em andamento/.test(e.message));
  soltar();
  await primeira;
  assert.equal(devagar.ocupada(), false);

  // A recusa do modelo, e a resposta cortada.
  const recusa = an.criarAnalise({ cliente: cliente({ stop_reason: "refusal", usage: { input_tokens: 100, output_tokens: 0 }, content: [] }), sdk });
  await assert.rejects(recusa.analisar(Buffer.from("j"), 10, 10), (e) => e.codigo === "recusa" && e.message === "A IA não quis analisar esta foto; o modo manual continua.");
  assert.ok(recusa.gastoDeHoje() > 0, "a recusa também conta no gasto do dia");
  const cortada = an.criarAnalise({ cliente: cliente({ stop_reason: "max_tokens", usage: {}, content: [] }), sdk });
  await assert.rejects(cortada.analisar(Buffer.from("j"), 10, 10), /veio cortada/);

  // Os erros da API, em português, pelas classes do SDK.
  const erroDe = (status, tipo) => sdk.APIError.generate(status, { type: "error", error: { type: tipo, message: "x" } }, undefined, new Headers());
  for (const [status, tipo, texto] of [
    [401, "authentication_error", /a chave ANTHROPIC_API_KEY não foi aceita/],
    [402, "billing_error", /está sem crédito/],
    [429, "rate_limit_error", /limite de uso/],
    [529, "overloaded_error", /fora do ar ou sobrecarregada/],
  ]) {
    const falhou = an.criarAnalise({ cliente: cliente(() => { throw erroDe(status, tipo); }), sdk });
    await assert.rejects(falhou.analisar(Buffer.from("j"), 10, 10),
      (e) => e.codigo === "analise-falhou" && /^A análise com IA não respondeu: /.test(e.message) && texto.test(e.message));
  }
  const semRede = an.criarAnalise({ cliente: cliente(() => { throw new sdk.APIConnectionError({ message: "x" }); }), sdk });
  await assert.rejects(semRede.analisar(Buffer.from("j"), 10, 10), /está na internet/);
}

// ---------- a rota da análise: as travas, de verdade, num servidor de mentira ----------
{
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  process.env.OPTIMIZE_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "pecas-analise-"));
  delete process.env.OPTIMIZE_ANALISE_RESPOSTA;
  delete process.env.ANTHROPIC_API_KEY;
  const express = require("express");
  const app = express();
  app.use("/api/extrator", require("../servidor/extrator-api.js"));
  const servidor = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}/api/extrator`;
  try {
    const estado = await (await fetch(`${base}/estado`)).json();
    assert.match(estado.analise, /falta a chave/, "sem chave, o /estado diz por quê (e a tela esconde o botão)");
    const semMarca = await fetch(`${base}/analisar`, { method: "POST", body: Buffer.from("x") });
    assert.equal(semMarca.status, 403);
    assert.equal((await semMarca.json()).codigo, "sem-marca");
    const semChave = await fetch(`${base}/analisar`, { method: "POST", headers: { "X-Optimize-Pedido": "extrator" }, body: Buffer.from("x") });
    assert.equal(semChave.status, 403);
    assert.equal((await semChave.json()).codigo, "analise-desligada");
    process.env.ANTHROPIC_API_KEY = "de-mentira";
    const semConta = await (await fetch(`${base}/estado`)).json();
    assert.match(semConta.analise, /Entre na conta/, "com chave e sem a conta entrada nesta máquina, ainda não");
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    servidor.close();
  }
}
```

E a linha final passa a ser:

```js
console.log("OK — as peças da camisa sem rede: o preenchimento, a fila, o pedido, os motores e a análise com IA.");
```

- [ ] **Step 3: rodar e ver falhar**

Run: `npm run bancada:pecas`
Expected: FAIL com `Cannot find module '../servidor/extrator-analise.js'`.

- [ ] **Step 4: a análise — `servidor/extrator-analise.js`**

```js
/**
 * ===========================================================================
 * A ANÁLISE COM IA DO EXTRATOR — o Claude acha e descreve as peças
 * ===========================================================================
 *
 * A única parte do Extrator que sai do computador, e só quando o operador
 * aperta "Analisar com IA": a foto de trabalho vai ao Claude, que diz que
 * peça é, onde estão a frente, as costas e as mangas, e quais elementos há em
 * cada uma (o que é, as cores, o jeito sugerido). O Claude lê imagem mas não
 * gera imagem: o recorte (MobileSAM), o preenchimento (LaMa) e a ampliação
 * (Real-ESRGAN) continuam aqui. As caixas do Claude são aproximadas; quem
 * transforma cada uma em máscara exata é a rede de recorte local.
 *
 * As caixas vêm de 0 a 1000 nos dois eixos: a API pode reduzir a foto no
 * caminho, e a fração não muda. Aqui elas viram pixels da foto de trabalho.
 *
 * ---------------------------------------------------------------------------
 * AS TRAVAS — é a única rota que gasta dinheiro
 * ---------------------------------------------------------------------------
 *
 * O servidor escuta a rede inteira da gráfica (ver `server.js`), e a sessão
 * do Optmize é da MÁQUINA, sem login por pessoa. Então:
 *
 *   - só o próprio computador do servidor analisa, a não ser que
 *     `OPTIMIZE_ANALISE_NA_REDE=1` libere a rede de propósito;
 *   - o pedido traz `X-Optimize-Pedido: extrator`, que só a tela põe: uma
 *     página de outro site aberta no navegador não manda cabeçalho próprio
 *     sem o servidor permitir;
 *   - a conta do Optmize precisa estar entrada nesta máquina;
 *   - uma análise de cada vez, e um teto de gasto por dia
 *     (`OPTIMIZE_ANALISE_LIMITE_DIA`, em US$, 5 por padrão; a conta do dia
 *     fica na memória e recomeça se o servidor reiniciar).
 *
 * A chave é a `ANTHROPIC_API_KEY` do computador do servidor: nunca no código,
 * no banco ou no git.
 */

const fs = require("fs");

const MODELO = "claude-opus-5-5";
/** US$ por milhão de tokens do `claude-opus-5-5` (2026-10). */
const PRECO = { entrada: 4, saida: 20, escritaDeCache: 5, leituraDeCache: 0.4 };
const LIMITE_DIA_PADRAO = 5;
const CABECALHO = "x-optimize-pedido";

/** As marcações que o Claude pode devolver: as mesmas seis do modo "Peças da camisa". */
const MARCACOES = ["frente", "costas", "manga-esquerda-frente", "manga-esquerda-costas", "manga-direita-frente", "manga-direita-costas"];
const PECAS_DOS_ELEMENTOS = ["frente", "costas", "manga-esquerda", "manga-direita"];

const CAIXA = {
  type: "object",
  properties: { x0: { type: "integer" }, y0: { type: "integer" }, x1: { type: "integer" }, y1: { type: "integer" } },
  required: ["x0", "y0", "x1", "y1"],
  additionalProperties: false,
};

const ESQUEMA = {
  type: "object",
  properties: {
    peca: {
      type: "object",
      properties: { tipo: { type: "string" }, vistas: { type: "array", items: { type: "string" } } },
      required: ["tipo", "vistas"],
      additionalProperties: false,
    },
    marcacoes: {
      type: "array",
      items: {
        type: "object",
        properties: { papel: { type: "string", enum: MARCACOES }, caixa: CAIXA },
        required: ["papel", "caixa"],
        additionalProperties: false,
      },
    },
    elementos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          peca: { type: "string", enum: PECAS_DOS_ELEMENTOS },
          nome: { type: "string" },
          descricao: { type: "string" },
          cores: { type: "array", items: { type: "string" } },
          jeito: { type: "string", enum: ["chapado", "foto"] },
          caixa: CAIXA,
        },
        required: ["peca", "nome", "descricao", "cores", "jeito", "caixa"],
        additionalProperties: false,
      },
    },
  },
  required: ["peca", "marcacoes", "elementos"],
  additionalProperties: false,
};

const INSTRUCOES = `Você ajuda uma fábrica de camisas de sublimação a separar a arte de uma foto.
A foto mostra uma camisa (fotografada ou num mockup), às vezes com a frente e as costas lado a lado.

Devolva:
- "peca": o tipo da peça, em português (por exemplo "camiseta raglan manga curta"), e as vistas que aparecem ("frente", "costas").
- "marcacoes": uma caixa em volta de cada parte visível, com o papel dela:
  "frente" e "costas" (a peça inteira daquela vista, com as mangas),
  "manga-esquerda-frente", "manga-esquerda-costas", "manga-direita-frente", "manga-direita-costas" (cada manga em cada vista).
  Esquerda e direita são de QUEM VESTE a camisa: na vista da frente, a manga esquerda aparece do lado direito da foto; na vista das costas, do lado esquerdo.
  Não invente parte que não aparece.
- "elementos": cada arte de cima da camisa (escudo, texto, nome, número, logo, patrocinador, desenho), com a peça onde está, um nome curto,
  o que é, as cores principais em hex (#rrggbb) e o jeito: "chapado" para logo, texto e desenho de cor chapada; "foto" para foto, rosto e degradê.
  Não liste o fundo da camisa como elemento.

Toda caixa vai em coordenadas de 0 a 1000 nos dois eixos da foto (0,0 no canto de cima à esquerda; 1000,1000 no de baixo à direita), justa em volta da parte.`;

/** Por que esta análise não pode rodar agora, ou `null`. */
function porqueNaoAnalisa({ env = process.env, local, entrou }) {
  if (!env.ANTHROPIC_API_KEY && !env.OPTIMIZE_ANALISE_RESPOSTA) {
    return "A análise com IA está desligada: falta a chave ANTHROPIC_API_KEY no computador do servidor.";
  }
  if (!local && env.OPTIMIZE_ANALISE_NA_REDE !== "1") {
    return "A análise com IA só roda no computador do servidor.";
  }
  if (!entrou) return "Entre na conta do Optmize para usar a análise com IA.";
  return null;
}

/** O pedido veio do próprio computador do servidor? */
function ehLocal(req) {
  const de = (req.socket && req.socket.remoteAddress) || "";
  return de === "127.0.0.1" || de === "::1" || de === "::ffff:127.0.0.1";
}

/** A caixa de 0 a 1000 em pixels da foto de trabalho, ou `null` se ela não serve. */
function caixaEmPixels(c, largura, altura) {
  if (!c || ![c.x0, c.y0, c.x1, c.y1].every(Number.isFinite)) return null;
  if (c.x0 < 0 || c.y0 < 0 || c.x1 > 1000 || c.y1 > 1000 || c.x1 - c.x0 < 2 || c.y1 - c.y0 < 2) return null;
  return {
    x0: Math.round((c.x0 / 1000) * largura), y0: Math.round((c.y0 / 1000) * altura),
    x1: Math.round((c.x1 / 1000) * largura), y1: Math.round((c.y1 / 1000) * altura),
  };
}

const ehHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

/**
 * A resposta do Claude conferida: caixa fora da foto, papel desconhecido ou
 * marcação repetida são descartados e contados em `ignorados`.
 */
function converterResposta(bruto, largura, altura) {
  let ignorados = 0;
  const marcacoes = {};
  for (const m of Array.isArray(bruto && bruto.marcacoes) ? bruto.marcacoes : []) {
    const caixa = caixaEmPixels(m && m.caixa, largura, altura);
    if (!caixa || !MARCACOES.includes(m.papel) || marcacoes[m.papel]) { ignorados++; continue; }
    marcacoes[m.papel] = caixa;
  }
  const elementos = [];
  for (const e of Array.isArray(bruto && bruto.elementos) ? bruto.elementos : []) {
    const caixa = caixaEmPixels(e && e.caixa, largura, altura);
    if (!caixa || !PECAS_DOS_ELEMENTOS.includes(e.peca)) { ignorados++; continue; }
    elementos.push({
      peca: e.peca,
      nome: String(e.nome || "").trim().slice(0, 60) || "Elemento",
      descricao: String(e.descricao || "").trim().slice(0, 300),
      cores: (Array.isArray(e.cores) ? e.cores : []).filter(ehHex).slice(0, 8),
      jeito: e.jeito === "foto" ? "foto" : "chapado",
      caixa,
    });
  }
  const p = (bruto && bruto.peca) || {};
  return {
    peca: { tipo: String(p.tipo || "").trim().slice(0, 80), vistas: (Array.isArray(p.vistas) ? p.vistas : []).map(String).slice(0, 4) },
    marcacoes, elementos, ignorados,
  };
}

/** Quanto a resposta custou, em US$, pelos tokens que a API devolve. */
function custoDe(usage) {
  const u = usage || {};
  return ((u.input_tokens || 0) * PRECO.entrada + (u.output_tokens || 0) * PRECO.saida
    + (u.cache_creation_input_tokens || 0) * PRECO.escritaDeCache + (u.cache_read_input_tokens || 0) * PRECO.leituraDeCache) / 1e6;
}

const falha = (mensagem, codigo, status) => Object.assign(new Error(mensagem), { codigo, status });

/** O erro da API em português, pelas classes do SDK (e não pelo texto da mensagem). */
function textoDoErro(erro, sdk) {
  const motivo = erro instanceof sdk.AuthenticationError ? "a chave ANTHROPIC_API_KEY não foi aceita."
    : erro instanceof sdk.PermissionDeniedError ? "a chave não tem permissão para este modelo."
      : erro instanceof sdk.RateLimitError ? "o limite de uso da conta foi atingido; tente daqui a pouco."
        : erro instanceof sdk.InternalServerError ? "a Anthropic está fora do ar ou sobrecarregada; tente daqui a pouco."
          : erro instanceof sdk.APIConnectionError ? "não consegui falar com a Anthropic. O computador do servidor está na internet?"
            : erro instanceof sdk.APIError && erro.status === 402 ? "a conta da Anthropic está sem crédito."
              : erro instanceof sdk.APIError ? `a Anthropic recusou o pedido (${erro.status}).`
                : erro.message;
  return `A análise com IA não respondeu: ${motivo}`;
}

/** O SDK, carregado só na primeira análise: sem chave, o servidor nem o abre. */
const oSdk = () => require("@anthropic-ai/sdk");

/**
 * Um cliente de mentira, só para a bancada da tela: devolve a resposta
 * gravada no arquivo de `OPTIMIZE_ANALISE_RESPOSTA`, sem internet.
 */
function clienteDeMentira(arquivo) {
  return { beta: { messages: { create: async () => JSON.parse(fs.readFileSync(arquivo, "utf8")) } } };
}

function clientePadrao(env = process.env) {
  if (env.OPTIMIZE_ANALISE_RESPOSTA) return clienteDeMentira(env.OPTIMIZE_ANALISE_RESPOSTA);
  const sdk = oSdk();
  return new sdk.Anthropic();
}

/**
 * A análise, com a trava de uma por vez e o teto do dia. `cliente` e `sdk`
 * entram de fora para a bancada pôr os de mentira.
 */
function criarAnalise({ cliente = null, sdk = null, limiteDia = Number(process.env.OPTIMIZE_ANALISE_LIMITE_DIA) || LIMITE_DIA_PADRAO, hoje = () => new Date().toISOString().slice(0, 10) } = {}) {
  let ocupada = false;
  let dia = null, gasto = 0;
  const gastoDeHoje = () => (dia === hoje() ? gasto : 0);

  async function analisar(jpeg, largura, altura) {
    if (ocupada) throw falha("Já há uma análise em andamento; espere ela terminar.", "analise-ocupada", 409);
    if (gastoDeHoje() >= limiteDia) {
      throw falha(`A análise com IA já gastou o teto de hoje (US$ ${limiteDia.toFixed(2)}); volta amanhã.`, "teto-do-dia", 429);
    }
    ocupada = true;
    try {
      const c = cliente || clientePadrao();
      let resposta;
      try {
        resposta = await c.beta.messages.create({
          model: MODELO,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
          system: INSTRUCOES,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
              { type: "text", text: "Analise esta camisa." },
            ],
          }],
        });
      } catch (erro) {
        throw falha(textoDoErro(erro, sdk || oSdk()), "analise-falhou", 502);
      }
      const custo = custoDe(resposta.usage);
      if (dia !== hoje()) { dia = hoje(); gasto = 0; }
      gasto += custo;
      if (resposta.stop_reason === "refusal") throw falha("A IA não quis analisar esta foto; o modo manual continua.", "recusa", 422);
      if (resposta.stop_reason === "max_tokens") throw falha("A análise com IA não respondeu: a resposta veio cortada.", "analise-falhou", 502);
      const texto = (resposta.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      let bruto;
      try {
        bruto = JSON.parse(texto);
      } catch {
        throw falha("A análise com IA não respondeu: a resposta não veio no formato combinado.", "analise-falhou", 502);
      }
      return { ...converterResposta(bruto, largura, altura), custo };
    } finally {
      ocupada = false;
    }
  }

  return { analisar, gastoDeHoje, ocupada: () => ocupada };
}

module.exports = {
  MODELO, PRECO, LIMITE_DIA_PADRAO, CABECALHO, MARCACOES, ESQUEMA, INSTRUCOES,
  porqueNaoAnalisa, ehLocal, caixaEmPixels, converterResposta, custoDe, textoDoErro, criarAnalise,
};
```

- [ ] **Step 5: a rota e o `/estado` — `servidor/extrator-api.js`**

No cabeçalho, depois da linha do `/png`:

```js
 *   POST   /analisar      a foto de trabalho, crua → { peca, marcacoes, elementos, ignorados, custo }
 *                         (a análise com IA: ver as travas em `extrator-analise.js`)
```

Depois de `const { criarFila, rotasDeAcompanhar } = require("./extrator-fila");`:

```js
const analise = require("./extrator-analise");
```

O `/estado` (o da Task 2) é trocado por:

```js
/**
 * Por que a análise com IA não roda para QUEM pediu, ou `null`. A sessão é
 * lida aqui dentro, e não no topo: carregar `sessao.js` cria a pasta de dados,
 * e as bancadas que só leem os pedidos não precisam dela.
 */
function motivoDaAnalise(req) {
  return analise.porqueNaoAnalisa({ local: analise.ehLocal(req), entrou: require("./sessao").perfilDaTela().entrou });
}

router.get("/estado", (req, res) => res.json({
  ...rede.estadoDaRede(), ampliar: ampliar.porqueNaoAmplia(), preencher: preencher.porqueNaoPreenche(),
  analise: motivoDaAnalise(req),
}));
```

E a rota, logo antes de `module.exports = router;`:

```js
const analiseDoServidor = analise.criarAnalise();

router.post("/analisar", express.raw({ limit: "20mb", type: () => true }), async (req, res) => {
  if (req.get(analise.CABECALHO) !== "extrator") {
    return res.status(403).json({ error: "O pedido de análise não veio da tela do Extrator.", codigo: "sem-marca" });
  }
  const motivo = motivoDaAnalise(req);
  if (motivo) return res.status(403).json({ error: motivo, codigo: "analise-desligada" });
  if (!req.body || !req.body.length) return res.status(400).json({ error: "Não veio foto nenhuma.", codigo: null });
  let foto;
  try {
    // A foto de trabalho da tela (lado maior em até 2048) vai como veio; só é normalizada em JPEG.
    foto = await sharp(req.body, { limitInputPixels: TETO_DE_PIXELS }).rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return res.status(415).json({ error: ILEGIVEL, codigo: "foto-ilegivel" });
  }
  try {
    res.json(await analiseDoServidor.analisar(foto.data, foto.info.width, foto.info.height));
  } catch (erro) {
    res.status(erro.status || 500).json({ error: erro.message || "A análise com IA não terminou.", codigo: erro.codigo || null });
  }
});
```

- [ ] **Step 6: rodar e ver passar**

Run: `npm run bancada:pecas && npm run bancada:extrator && node --check servidor/server.js`
Expected: `OK — as peças da camisa sem rede: o preenchimento, a fila, o pedido, os motores e a análise com IA.` e o do Extrator.

- [ ] **Step 7: a bancada da análise de verdade — `bancada/analise-de-verdade.mjs`**

```js
/*
 * BANCADA — a análise com IA DE VERDADE (fora da CI: custa centavos e precisa de internet)
 *
 *     npm run analise:de-verdade
 *
 * Manda o mockup de teste ao Claude e confere que voltam a frente e as
 * costas, e que a caixa de cada uma cobre a marcada à mão (IoU ≥ 0,7). Imprime
 * o custo, para gravar no plano. Precisa:
 *
 *   - da chave em `ANTHROPIC_API_KEY`;
 *   - de `mockup-camisa.jpg` e `mockup-camisa.json` na pasta das fotos
 *     (`D:\arte\extrator`, ou `EXTRATOR_FOTOS`). O JSON é o gabarito, nas
 *     coordenadas da FOTO DE TRABALHO (lado maior em 2048, como a tela manda):
 *
 *       { "marcacoes": { "frente": [x0, y0, x1, y1], "costas": [x0, y0, x1, y1] } }
 *
 * Sem um dos dois, ela diz o que falta e sai sem erro.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { PASTA_DAS_FOTOS, fotoDeTrabalho } from "./extrator-comum.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const an = require("../servidor/extrator-analise.js");

const foto = path.join(PASTA_DAS_FOTOS, "mockup-camisa.jpg");
const gabarito = path.join(PASTA_DAS_FOTOS, "mockup-camisa.json");
if (!process.env.ANTHROPIC_API_KEY) {
  console.log("PULADA — falta a chave em ANTHROPIC_API_KEY.");
  process.exit(0);
}
if (!fs.existsSync(foto) || !fs.existsSync(gabarito)) {
  console.log(`PULADA — falta ${path.basename(fs.existsSync(foto) ? gabarito : foto)} em ${PASTA_DAS_FOTOS}.`);
  process.exit(0);
}

const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.x1, b[2]) - Math.max(a.x0, b[0]));
  const iy = Math.max(0, Math.min(a.y1, b[3]) - Math.max(a.y0, b[1]));
  const inter = ix * iy;
  return inter / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
};

const t = await fotoDeTrabalho(foto);
const jpeg = await sharp(t.rgb, { raw: { width: t.largura, height: t.altura, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
const inicio = Date.now();
const r = await an.criarAnalise().analisar(jpeg, t.largura, t.altura);
console.log(`análise: ${((Date.now() - inicio) / 1000).toFixed(1)} s, US$ ${r.custo.toFixed(4)}; peça "${r.peca.tipo}" `
  + `(${r.peca.vistas.join(", ")}); marcações: ${Object.keys(r.marcacoes).join(", ")}; ${r.elementos.length} elementos; ${r.ignorados} ignorados`);
for (const e of r.elementos) console.log(`  · ${e.peca}: ${e.nome} — ${e.descricao} [${e.jeito}; ${e.cores.join(" ")}]`);

const esperado = JSON.parse(fs.readFileSync(gabarito, "utf8")).marcacoes;
for (const papel of ["frente", "costas"]) {
  assert.ok(r.marcacoes[papel], `a análise não devolveu a ${papel}`);
  const nota = iou(r.marcacoes[papel], esperado[papel]);
  console.log(`  ${papel}: IoU ${nota.toFixed(2)}`);
  assert.ok(nota >= 0.7, `a caixa da ${papel} não cobre a marcada à mão (IoU ${nota.toFixed(2)})`);
}
console.log("OK — a análise com IA achou a frente e as costas.");
```

Run: `npm run analise:de-verdade`
Expected, sem a chave: `PULADA — falta a chave em ANTHROPIC_API_KEY.` (é o caso em 2026-10-07). Com a chave e sem o mockup: `PULADA — falta mockup-camisa.jpg em D:/arte/extrator.`

- [ ] **Step 8: commit**

```bash
git add servidor/extrator-analise.js servidor/extrator-api.js bancada/conferir-pecas.mjs bancada/analise-de-verdade.mjs package.json package-lock.json
git commit -m "A análise com IA no servidor: o Claude acha as peças e os elementos da foto, atrás das travas da rota que gasta (o computador do servidor, a marca da tela, a conta entrada, uma de cada vez e o teto do dia)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9 (quando a pessoa tiver a chave e o mockup): medir o custo de verdade**

Com `ANTHROPIC_API_KEY` no ambiente e `D:\arte\extrator\mockup-camisa.jpg` + `mockup-camisa.json` (o gabarito: as caixas da frente e das costas nas coordenadas da foto de trabalho, lado maior em 2048):

Run: `npm run analise:de-verdade`
Expected: `análise: … s, US$ 0,0x; peça "…" (frente, costas); marcações: frente, costas, …`, a IoU da frente e das costas ≥ 0,7, e `OK — a análise com IA achou a frente e as costas.` Grave o custo medido na seção "Antes de começar" deste plano (a spec espera entre US$ 0,05 e 0,10) e faça um commit só do plano. Se a IoU ficar abaixo de 0,7, não mexa no limite: o que muda são as `INSTRUCOES`.

---

### Task 5: a tela — o modo "Peças da camisa": marcar, medir, montar, preencher e baixar

**Files:**
- Create: `src/telas/extrator/usePecasDaCamisa.ts`, `src/telas/extrator/PreviaDaPeca.tsx`, `src/telas/extrator/PecasDaCamisa.tsx`, `bancada/extrator-tela-comum.cjs`, `bancada/conferir-pecas-tela.cjs`
- Modify: `src/api/extrator.ts`, `src/motores/extratorTarefas.js`, `src/telas/extrator/tipos.ts`, `src/telas/extrator/trabalhador.ts`, `src/telas/extrator/desenho.ts`, `src/telas/Extrator.tsx`, `bancada/conferir-extrator-tela.cjs`, `package.json`

**Interfaces — Consumes:** `MARCACOES`, `PECAS`, `AJUSTE_INICIAL`, `LIMITE_INVENTADO`, `tamanhoDaMontagem`, `corpoSemMangas`, `montarPeca`, `montarManga`, `tirarSombra` (Task 3); `POST/GET/DELETE /api/extrator/preencher` e o `preencher` do `/estado` (Task 2); `tamanhoDaSaida`, `nomesUnicos`, `avisoDaMascara` (`src/motores/extrator.js`); `baixar` (`extrator/arquivos.ts`).

**Interfaces — Produces:**
- `src/api/extrator.ts`: `EstadoDoExtrator.preencher: string | null`; `type IdDaMarcacao`; `extratorApi.preencher(montada: { rgba, largura, altura }, aoAndar, sinal?) → Promise<Blob>` (PNG cheio); o `ampliar` passa a usar o `acompanhar(rota, resposta, padrao, aoAndar, sinal)` dividido.
- `src/telas/extrator/tipos.ts`: `IdDaPeca`, `Ajuste`, `Montada`, `PecaPreparada`; reexporta `IdDaMarcacao`.
- `trabalhador.prepararPeca(foto, alfa, mangas: Uint8Array[], la, aa) → Promise<PecaPreparada>`, `trabalhador.montarPeca(recorte, tamanho, ajuste) → Promise<Montada>`, `trabalhador.montarManga(frente, costas, tamanho, ajuste, nome) → Promise<Montada | null>`.
- `desenho.imagemDoBlob(blob) → Promise<Imagem>`.
- `usePecasDaCamisa(x: Extrator)` → `{ marcacoes: Partial<Record<IdDaMarcacao, Marcacao>>, vez, setVez, medidas, pecas, avisos, ocupado, andamento, usarMascara, apagarMarcacao, mudarMedida, montar, preencher, ajustar, cancelar, arquivoDa, prontas, baixarUma, baixarZip }` e os tipos `Marcacao = { mascara: Mascara; foto: Imagem }` (cada marcação guarda a foto de onde saiu), `Medida`, `EstadoDaPeca`, `EstadoDasPecas`; a Task 6 acrescenta `mandarParaOMolde`, e a Task 7 `marcarDaAnalise`. Por dentro, `pngDa(id, sinal)` e `comCancelar(fazer)`.
- Ids na tela (as bancadas dependem deles): `#extrator-aba-elementos`, `#extrator-aba-pecas`, `#pecas-usar`, `#pecas-painel`, `#pecas-marcacao-<id>` (com `[data-marcada]` na mesma linha), `#pecas-apagar-<id>`, `#pecas-largura-<peça>`, `#pecas-altura-<peça>`, `#pecas-montar`, `#pecas-preencher`, `#pecas-ocupado`, `#pecas-andamento`, `#pecas-cancelar`, `#pecas-avisos`, `#pecas-previa-<peça>` (com `data-inventado` e `data-preenchida`), `#pecas-zoom-<peça>`, `#pecas-inventado-<peça>`, `#pecas-baixar-<peça>`, `#pecas-zip`.
- `bancada/extrator-tela-comum.cjs`: `RAIZ, esperar, portaLivre, esperarServidor, subir(env), abrirPagina(navegador, porta, problemas, esperados?), clicarNaFoto(p, x, y, botao?), arrastarNaFoto(p, x0, y0, x1, y1), esperarMascara(p, n, ms?), esperarBaixado(p, n, ms?), medidaDoPng(bytes)`.

- [ ] **Step 1: os ajudantes de navegador num lugar só — `bancada/extrator-tela-comum.cjs`**

```js
/*
 * O que as bancadas de navegador do Extrator dividem (`conferir-extrator-tela`
 * e `conferir-pecas-tela`): subir um servidor numa pasta de dados descartável,
 * abrir a tela vigiando erro de console e resposta >= 400 da API, clicar e
 * arrastar em pixels da FOTO DE TRABALHO, e pegar o arquivo baixado.
 */
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { semearSessao } = require('./sessao-de-teste.cjs');

const RAIZ = path.join(__dirname, '..');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function portaLivre() {
  return new Promise((pronto, falhou) => {
    const s = net.createServer();
    s.on('error', falhou);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => pronto(port)); });
  });
}

async function esperarServidor(porta) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${porta}/`)).ok) return; } catch { /* subindo */ }
    await esperar(500);
  }
  throw new Error('o servidor não subiu.');
}

/** Um servidor numa pasta de dados descartável (com a conta entrada), com o ambiente pedido. */
async function subir(env) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-extrator-'));
  semearSessao(pasta);
  const porta = await portaLivre();
  const processo = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'server.js')], {
    env: { ...process.env, PORT: String(porta), OPTIMIZE_DADOS: pasta, ...env }, stdio: 'ignore',
  });
  await esperarServidor(porta);
  return { porta, pasta, parar: () => processo.kill() };
}

/**
 * A tela do Extrator aberta. Erro de console e resposta >= 400 da API vão
 * para `problemas`, menos os que casam com `esperados`. O download (o clique
 * no <a download>) vira um registro em `window.__baixados`.
 */
async function abrirPagina(navegador, porta, problemas, esperados = []) {
  const p = await navegador.newPage();
  await p.setViewport({ width: 1600, height: 1000 });
  p.on('pageerror', (e) => problemas.push(`erro de página: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const onde = (m.location() && m.location().url) || '';
    if (/favicon/.test(onde) || esperados.some((r) => r.test(m.text()))) return;
    problemas.push(`console: ${m.text()}${onde ? ` (${onde})` : ''}`);
  });
  p.on('response', (r) => {
    const linha = `${r.status()} ${r.url()}`;
    if (r.url().includes('/api/') && r.status() >= 400 && !esperados.some((re) => re.test(linha))) problemas.push(linha);
  });
  await p.evaluateOnNewDocument(() => {
    window.__baixados = [];
    const clicar = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        const nome = this.download;
        fetch(this.href).then((r) => r.arrayBuffer()).then((b) => window.__baixados.push({ nome, bytes: Array.from(new Uint8Array(b)) }));
        return;
      }
      clicar.call(this);
    };
  });
  await p.goto(`http://127.0.0.1:${porta}/extrator`, { waitUntil: 'networkidle2' });
  // A tela é carregada sob demanda: o networkidle2 pode vir antes de ela montar.
  await p.waitForSelector('#extrator-foto', { timeout: 15000 });
  return p;
}

/** A medida da mesa na tela e na foto de trabalho. */
async function mesa(p) {
  await p.$eval('#extrator-mesa', (c) => c.scrollIntoView({ block: 'center' }));
  return p.$eval('#extrator-mesa', (c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, L: c.width, A: c.height };
  });
}

/** Clica num ponto da FOTO DE TRABALHO (os pixels do canvas), com o botão pedido. */
async function clicarNaFoto(p, x, y, botao = 'left') {
  const m = await mesa(p);
  await p.mouse.click(m.x + (x / m.L) * m.w, m.y + (y / m.A) * m.h, { button: botao });
}

/** Arrasta uma caixa na FOTO DE TRABALHO, de (x0, y0) a (x1, y1). */
async function arrastarNaFoto(p, x0, y0, x1, y1) {
  const m = await mesa(p);
  const tela = (x, y) => [m.x + (x / m.L) * m.w, m.y + (y / m.A) * m.h];
  await p.mouse.move(...tela(x0, y0));
  await p.mouse.down();
  await p.mouse.move(...tela((x0 + x1) / 2, (y0 + y1) / 2), { steps: 4 });
  await p.mouse.move(...tela(x1, y1), { steps: 4 });
  await p.mouse.up();
}

/** Espera a máscara de `n` cliques aparecer na mesa, e devolve a cobertura dela. */
async function esperarMascara(p, n, ms = 30000) {
  await p.waitForFunction((k) => document.querySelector('#extrator-mesa')?.dataset.pontosDaMascara === String(k), { timeout: ms }, n);
  return Number(await p.$eval('#extrator-mesa', (c) => c.dataset.cobertura));
}

/** O n-ésimo arquivo baixado (contando de 1), quando chegar. */
async function esperarBaixado(p, n, ms = 120000) {
  await p.waitForFunction((k) => window.__baixados.length >= k, { timeout: ms }, n);
  const b = await p.evaluate((k) => window.__baixados[k - 1], n);
  return { nome: b.nome, bytes: Buffer.from(b.bytes) };
}

const medidaDoPng = (bytes) => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];

module.exports = {
  RAIZ, esperar, portaLivre, esperarServidor, subir, abrirPagina, clicarNaFoto, arrastarNaFoto, esperarMascara, esperarBaixado, medidaDoPng,
};
```

E `bancada/conferir-extrator-tela.cjs` passa a usá-los: tudo o que vai de `const assert = require('node:assert/strict');` até a linha antes de `/** A cena: disco vermelho e quadrado azul sobre bege, 1200 × 900. */` vira:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { carimboDoFonte } = require('../empacotar/carimbo.cjs');
const rede = require('../servidor/extrator-rede.js');
const { RAIZ, esperar, subir, abrirPagina: abrir, clicarNaFoto, esperarMascara } = require('./extrator-tela-comum.cjs');

const ESPERADOS = [/^410 .*\/api\/extrator\/mascara/, /status of 410/];
const abrirPagina = (navegador, porta, problemas) => abrir(navegador, porta, problemas, ESPERADOS);
```

e saem as funções `abrirPagina`, `clicarNaFoto` e `esperarMascara` que ficavam entre a `cena()` e o `const esperarElementos` (o resto do arquivo não muda).

- [ ] **Step 2: a bancada de tela das peças — `bancada/conferir-pecas-tela.cjs`**

```js
/*
 * ===========================================================================
 * BANCADA — as peças da camisa no navegador
 * ===========================================================================
 *
 *     npm run modelos && npm run front && npm run bancada:pecas-tela
 *
 * Fora da CI, como a `bancada:extrator-tela`: precisa do Puppeteer, do painel
 * compilado DESTE fonte e das redes em servidor/modelos (a de recorte, a de
 * ampliar e a LaMa).
 *
 * A cena é um mockup de mentira, 1600 × 900: a frente e as costas lado a lado,
 * corpo branco com um decote, mangas azul-marinho, um logo azul na frente e o
 * "10" verde nas costas. Duas voltas, cada uma com o seu servidor:
 *
 *   1. COM as redes: as seis marcações por caixa, as medidas digitadas, a
 *      montagem (com o decote para inventar), o preenchimento pela LaMa, o PNG
 *      de cada peça na medida a 300 dpi e sem transparência, e o ZIP com as
 *      quatro.
 *   2. SEM a LaMa: a frente alta demais avisa que boa parte vai ser
 *      inventada; o Preencher diz o que falta, e o PNG sai com o buraco
 *      transparente. E as costas numa segunda foto: o que foi marcado na
 *      primeira continua, e as duas peças montam.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { carimboDoFonte } = require('../empacotar/carimbo.cjs');
const rede = require('../servidor/extrator-rede.js');
const ampliar = require('../servidor/extrator-ampliar.js');
const preencher = require('../servidor/extrator-preencher.js');
const { RAIZ, subir, abrirPagina, arrastarNaFoto, esperarMascara, esperarBaixado, medidaDoPng } = require('./extrator-tela-comum.cjs');

/** O mockup de mentira, 1600 × 900. */
function cena() {
  const camisa = (x, logo) => `
    <rect x="${x}" y="220" width="360" height="580" fill="#ffffff"/>
    <circle cx="${x + 180}" cy="220" r="50" fill="#d9d9d9"/>
    <rect x="${x - 100}" y="220" width="100" height="160" fill="#1f2a5a"/>
    <rect x="${x + 360}" y="220" width="100" height="160" fill="#1f2a5a"/>
    ${logo}`;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#d9d9d9"/>'
    + camisa(200, '<circle cx="300" cy="330" r="34" fill="#1f4fa3"/>')
    + camisa(1040, '<rect x="1170" y="350" width="100" height="200" fill="#1a8f3a"/>')
    + '</svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * As seis caixas, em pixels da foto. Esquerda e direita de quem veste: na
 * frente, a manga esquerda é a da direita da foto; nas costas, a da esquerda.
 */
const CAIXAS = {
  frente: [95, 214, 665, 806],
  costas: [935, 214, 1505, 806],
  'manga-esquerda-frente': [556, 216, 664, 384],
  'manga-esquerda-costas': [936, 216, 1044, 384],
  'manga-direita-frente': [96, 216, 204, 384],
  'manga-direita-costas': [1396, 216, 1504, 384],
};

async function abrirACena(p, pasta) {
  const arquivo = path.join(pasta, 'mockup.png');
  fs.writeFileSync(arquivo, await cena());
  await (await p.$('#extrator-foto')).uploadFile(arquivo);
  await p.waitForSelector('#extrator-mesa', { timeout: 15000 });
  await p.click('#extrator-aba-pecas');
  await p.waitForSelector('#pecas-painel');
}

async function marcarTudo(p) {
  for (const [id, c] of Object.entries(CAIXAS)) {
    await p.click(`#pecas-marcacao-${id}`);
    await p.click('#extrator-limpar').catch(() => {});
    await arrastarNaFoto(p, ...c);
    await esperarMascara(p, 1);
    await p.waitForSelector('#pecas-usar:not([disabled])');
    await p.click('#pecas-usar');
    await p.waitForFunction((i) => document.querySelector(`#pecas-marcacao-${i}`)?.parentElement?.querySelector('[data-marcada]')?.dataset.marcada === 'sim', { timeout: 10000 }, id);
  }
}

async function digitar(p, seletor, valor) {
  await p.$eval(seletor, (i) => { i.focus(); i.select(); });
  await p.type(seletor, String(valor));
}

/** Medidas pequenas: o PNG final sai MENOR que a montagem, e a bancada não espera a ampliação. */
async function medidasPequenas(p) {
  for (const id of ['frente', 'costas']) { await digitar(p, `#pecas-largura-${id}`, 10); await digitar(p, `#pecas-altura-${id}`, 14); }
  for (const id of ['manga-esquerda', 'manga-direita']) { await digitar(p, `#pecas-largura-${id}`, 8); await digitar(p, `#pecas-altura-${id}`, 5); }
}

const PECAS = ['frente', 'costas', 'manga-esquerda', 'manga-direita'];

async function comTudo(navegador, pasta) {
  const s = await subir({});
  const problemas = [];
  try {
    const p = await abrirPagina(navegador, s.porta, problemas);
    await abrirACena(p, pasta);

    await marcarTudo(p);
    await medidasPequenas(p);
    await p.click('#pecas-montar');
    for (const id of PECAS) await p.waitForSelector(`#pecas-previa-${id}`, { timeout: 60000 });
    const inventado = Number(await p.$eval('#pecas-previa-frente', (c) => c.dataset.inventado));
    assert.ok(inventado > 0.003 && inventado < 0.2, `o decote da frente fica para inventar (${inventado})`);
    assert.deepEqual(await p.$eval('#pecas-previa-frente', (c) => [c.width, c.height]), [1463, 2048], '10 × 14 cm montado com 2048 de lado maior');

    await p.click('#pecas-preencher');
    await p.waitForFunction((ids) => ids.every((i) => document.querySelector(`#pecas-previa-${i}`)?.dataset.preenchida === 'sim'),
      { timeout: 600000 }, PECAS);
    console.log('  marcar, medir, montar e preencher as quatro peças');

    // O PNG da frente: 10 cm a 300 dpi, na proporção da medida, sem transparência.
    await p.click('#pecas-baixar-frente');
    const frente = await esperarBaixado(p, 1);
    assert.equal(frente.nome, 'mockup - Frente.png');
    assert.deepEqual(medidaDoPng(frente.bytes), [1181, 1653]);
    const decote = await sharp(frente.bytes).ensureAlpha().extract({ left: 590, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.equal(decote[3], 255, 'o decote foi preenchido: nada transparente');

    // O ZIP com as quatro.
    await p.click('#pecas-zip');
    const zip = await esperarBaixado(p, 2, 300000);
    assert.equal(zip.nome, 'mockup - peças.zip');
    const texto = zip.bytes.toString('latin1');
    for (const n of ['mockup - Frente.png', 'mockup - Costas.png', 'mockup - Manga esquerda.png', 'mockup - Manga direita.png']) {
      assert.ok(texto.includes(n), `o ZIP tem ${n}`);
    }

    console.log('  o PNG na medida e o ZIP');

    assert.deepEqual(problemas, [], problemas.join('\n'));
    await p.close();
  } finally {
    s.parar();
  }
}

async function semLama(navegador, pasta) {
  // As redes de recorte e de ampliar, sem a LaMa.
  const so = fs.mkdtempSync(path.join(os.tmpdir(), 'pecas-sem-lama-'));
  const { arquivos } = rede.ADAPTADORES[rede.REDE_DO_EXTRATOR];
  for (const a of [arquivos.codificador, arquivos.decodificador]) fs.copyFileSync(path.join(rede.PASTA_DOS_MODELOS, a), path.join(so, a));
  fs.copyFileSync(ampliar.ARQUIVO, path.join(so, path.basename(ampliar.ARQUIVO)));
  const s = await subir({ OPTIMIZE_EXTRATOR_MODELOS: so });
  const problemas = [];
  try {
    const p = await abrirPagina(navegador, s.porta, problemas);
    await abrirACena(p, pasta);
    await marcarTudo(p);
    await medidasPequenas(p);
    await digitar(p, '#pecas-altura-frente', 40);
    await p.click('#pecas-montar');
    await p.waitForSelector('#pecas-previa-frente', { timeout: 60000 });
    assert.match(await p.$eval('#pecas-avisos', (n) => n.textContent), /Boa parte da frente vai ser inventada/);
    await p.click('#pecas-preencher');
    await p.waitForSelector('#extrator-erro', { timeout: 10000 });
    assert.match(await p.$eval('#extrator-erro', (n) => n.textContent), /npm run modelos.*buraco transparente/);
    await p.click('#pecas-baixar-frente');
    const frente = await esperarBaixado(p, 1);
    const decote = await sharp(frente.bytes).ensureAlpha().extract({ left: 590, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.equal(decote[3], 0, 'sem a LaMa, o decote sai transparente');

    // As costas numa segunda foto (a metade da direita da cena).
    const soCostas = path.join(pasta, 'costas.png');
    await sharp(await cena()).extract({ left: 800, top: 0, width: 800, height: 900 }).toFile(soCostas);
    await (await p.$('#extrator-foto')).uploadFile(soCostas);
    await p.waitForFunction(() => document.querySelector('#extrator-mesa')?.width === 800, { timeout: 15000 });
    const situacaoDa = (i) => p.evaluate((k) => document.querySelector(`#pecas-marcacao-${k}`)?.parentElement?.querySelector('[data-marcada]')?.dataset.marcada, i);
    assert.equal(await situacaoDa('frente'), 'sim', 'a frente marcada na primeira foto continua');
    await p.click('#pecas-marcacao-costas');
    const [x0, y0, x1, y1] = CAIXAS.costas;
    await arrastarNaFoto(p, x0 - 800, y0, x1 - 800, y1);
    await esperarMascara(p, 1);
    await p.click('#pecas-usar');
    await p.click('#pecas-montar');
    await p.waitForSelector('#pecas-previa-costas', { timeout: 60000 });
    assert.ok(await p.$('#pecas-previa-frente'), 'a frente da primeira foto monta junto');
    assert.deepEqual(problemas, [], problemas.join('\n'));
    console.log('  sem a LaMa: os avisos, o PNG com o buraco transparente e as costas noutra foto');
    await p.close();
  } finally {
    s.parar();
  }
}

async function principal() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.log('conferir-pecas-tela: sem Puppeteer nesta máquina — pulando (não é reprovação).');
    return;
  }
  let carimbado = null;
  try { carimbado = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dist', 'carimbo.json'), 'utf8')).fonte; } catch { /* sem carimbo */ }
  if (carimbado !== carimboDoFonte(RAIZ)) {
    console.error('conferir-pecas-tela: o painel compilado (dist/) não é deste src/. Rode `npm run front` antes.');
    process.exit(1);
  }
  const motivo = rede.porqueNaoRoda() || ampliar.porqueNaoAmplia() || preencher.porqueNaoPreenche();
  if (motivo) {
    console.error(`conferir-pecas-tela: ${motivo}`);
    process.exit(1);
  }
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-pecas-'));
  const navegador = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    await comTudo(navegador, pasta);
    await semLama(navegador, pasta);
  } finally {
    await navegador.close();
  }
  console.log('OK — as peças da camisa no navegador.');
}

principal().catch((e) => { console.error(e); process.exit(1); });
```

No `package.json`, em `scripts`, depois de `"bancada:pecas-rede"`:

```json
    "bancada:pecas-tela": "node bancada/conferir-pecas-tela.cjs",
```

- [ ] **Step 3: o cliente da API — `src/api/extrator.ts`**

O arquivo inteiro passa a ser (o `ampliar` usa o `acompanhar` novo, e entram o `preencher`, o `preencher` do estado e o `IdDaMarcacao`):

```ts
/**
 * ===========================================================================
 * API DO EXTRATOR — a foto, os cliques e os arquivos do elemento
 * ===========================================================================
 *
 * A conversa com `servidor/extrator-api.js`. Estoura com a mensagem do
 * servidor em vez de devolver `null`: a pessoa PEDIU a máscara ou o arquivo,
 * e não receber é uma resposta que ela precisa ver (a regra do `risco.ts`).
 *
 * A única falha que não chega à pessoa é a leitura vencida: ela vira
 * `LeituraVencida`, e a tela lê a foto de novo sozinha.
 */

export interface EstadoDoExtrator {
  rede: string;
  pronta: boolean;
  /** Por que a rede de recorte não roda, ou `null`. */
  motivo: string | null;
  aceitaCaixa: boolean;
  /** Por que a rede de ampliar não roda, ou `null`. */
  ampliar: string | null;
  /** Por que a rede de preencher (a LaMa das peças da camisa) não roda, ou `null`. */
  preencher: string | null;
}

export interface Leitura { id: string; largura: number; altura: number; ms: number; aceitaCaixa: boolean }
export interface PontoDoClique { x: number; y: number; inclui: boolean }
export interface CaixaDoClique { x0: number; y0: number; x1: number; y1: number }
export interface MascaraLida { alfa: Uint8Array; largura: number; altura: number; nota: number }

export class LeituraVencida extends Error {}

/** As seis marcações das peças da camisa (ver `motores/pecasDaCamisa.js`). */
export type IdDaMarcacao =
  | "frente" | "costas"
  | "manga-esquerda-frente" | "manga-esquerda-costas" | "manga-direita-frente" | "manga-direita-costas";
/**
 * O `fetch`, com o "servidor fora do ar" em português. O cancelamento
 * (`AbortError`) passa intacto: a tela depende dele para não mostrar erro.
 */
async function chamar(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Não consegui falar com o servidor do Extrator. Ele está ligado?");
  }
}

async function falhou(resposta: Response, padrao: string): Promise<Error> {
  const corpo = (await resposta.json().catch(() => ({}))) as { error?: string; codigo?: string | null };
  const texto = corpo.error || padrao;
  return corpo.codigo === "leitura-vencida" ? new LeituraVencida(texto) : new Error(texto);
}

/** O PNG cinza da máscara, de volta a um byte por pixel. */
async function alfaDoPng(png: Blob): Promise<{ alfa: Uint8Array; largura: number; altura: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(png, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  } catch {
    throw new Error("O servidor mandou uma máscara que o navegador não conseguiu abrir.");
  }
  try {
    const tela = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("O navegador não deu um canvas para ler a máscara.");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const alfa = new Uint8Array(bitmap.width * bitmap.height);
    for (let i = 0; i < alfa.length; i++) alfa[i] = data[i * 4]!;
    return { alfa, largura: bitmap.width, altura: bitmap.height };
  } finally {
    bitmap.close();
  }
}

const espera = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));

/**
 * Acompanha um trabalho da fila do servidor (a ampliação ou o preenchimento):
 * pergunta o andamento a cada 400 ms até o PNG chegar; o `sinal` cancela lá também.
 */
async function acompanhar(
  rota: string, resposta: Response, padrao: string,
  aoAndar: (feitos: number, total: number) => void, sinal?: AbortSignal,
): Promise<Blob> {
  if (!resposta.ok) throw await falhou(resposta, padrao);
  const { id, total } = (await resposta.json()) as { id: string; total: number };
  aoAndar(0, total);
  const cancelar = () => { void fetch(`${rota}/${id}`, { method: "DELETE" }).catch(() => {}); };
  sinal?.addEventListener("abort", cancelar, { once: true });
  try {
    for (;;) {
      await espera(400);
      if (sinal?.aborted) throw new DOMException("cancelado", "AbortError");
      const g = await chamar(`${rota}/${id}`, { signal: sinal });
      if (!g.ok) throw await falhou(g, "O trabalho parou no meio.");
      if ((g.headers.get("Content-Type") || "").startsWith("image/png")) return await g.blob();
      const andamento = (await g.json()) as { feitos: number; total: number };
      aoAndar(andamento.feitos, andamento.total);
    }
  } finally {
    sinal?.removeEventListener("abort", cancelar);
  }
}

export const extratorApi = {
  async estado(): Promise<EstadoDoExtrator> {
    const r = await chamar("/api/extrator/estado");
    if (!r.ok) throw await falhou(r, "O servidor não respondeu sobre o Extrator.");
    return (await r.json()) as EstadoDoExtrator;
  },

  async ler(foto: Blob, sinal?: AbortSignal): Promise<Leitura> {
    const r = await chamar("/api/extrator/ler", {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: foto, signal: sinal,
    });
    if (!r.ok) throw await falhou(r, "O servidor não conseguiu ler a foto.");
    return (await r.json()) as Leitura;
  },

  async mascara(id: string, pontos: PontoDoClique[], caixa: CaixaDoClique | null, sinal?: AbortSignal): Promise<MascaraLida> {
    const r = await chamar("/api/extrator/mascara", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, pontos, caixa }), signal: sinal,
    });
    if (!r.ok) throw await falhou(r, "O servidor não conseguiu achar o elemento.");
    const nota = Number(r.headers.get("X-Mascara-Nota")) || 0;
    return { ...(await alfaDoPng(await r.blob())), nota };
  },

  async png(svg: string, largura: number, altura: number): Promise<Blob> {
    const r = await chamar("/api/extrator/png", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ svg, largura, altura }),
    });
    if (!r.ok) throw await falhou(r, "O servidor não conseguiu desenhar o PNG.");
    return r.blob();
  },

  /** Amplia o elemento no servidor, avisando o andamento; o `sinal` cancela lá também. */
  async ampliar(
    recorte: { rgba: Uint8ClampedArray<ArrayBuffer>; largura: number; altura: number },
    saida: { largura: number; altura: number },
    aoAndar: (feitos: number, total: number) => void,
    sinal?: AbortSignal,
  ): Promise<Blob> {
    const q = new URLSearchParams({
      largura: String(recorte.largura), altura: String(recorte.altura),
      saidaLargura: String(saida.largura), saidaAltura: String(saida.altura),
    });
    const r = await chamar(`/api/extrator/ampliar?${q}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: recorte.rgba, signal: sinal,
    });
    return acompanhar("/api/extrator/ampliar", r, "O servidor não conseguiu começar a ampliação.", aoAndar, sinal);
  },

  /** A LaMa preenche o que a peça montada não tem (alfa abaixo de 128); volta o PNG cheio, sem transparência. */
  async preencher(
    montada: { rgba: Uint8ClampedArray<ArrayBuffer>; largura: number; altura: number },
    aoAndar: (feitos: number, total: number) => void,
    sinal?: AbortSignal,
  ): Promise<Blob> {
    const q = new URLSearchParams({ largura: String(montada.largura), altura: String(montada.altura) });
    const r = await chamar(`/api/extrator/preencher?${q}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: montada.rgba, signal: sinal,
    });
    return acompanhar("/api/extrator/preencher", r, "O servidor não conseguiu começar o preenchimento.", aoAndar, sinal);
  },
};
```

- [ ] **Step 4: as tarefas do worker — `src/motores/extratorTarefas.js`**

```js
/**
 * O trabalho pesado da tela do Extrator, num lugar só: quem chama é o worker
 * (`extratorWorker.js`) e, se o navegador não deixar criar worker, a própria
 * tela (`telas/extrator/trabalhador.ts`). As duas portas rodam a MESMA conta.
 */

import { desentortar } from "./perspectiva";
import { corpoSemMangas, montarManga, montarPeca, tirarSombra } from "./pecasDaCamisa";
import { ampliarMascara, aplicarMascara, corDeFora, limparBorda, recorteInteiro } from "./recorte";
import { vetorizarImagem } from "./vetor";

/** A máscara vem do tamanho da foto de trabalho; o elemento sai da foto inteira. */
function recortar(pixels, largura, altura, alfaDoTrabalho, la, aa) {
  const alfa = ampliarMascara(alfaDoTrabalho, la, aa, largura, altura);
  const cor = corDeFora(pixels, largura, altura, alfa);
  const recorte = aplicarMascara(pixels, largura, altura, alfa);
  if (recorte && cor) limparBorda(recorte, cor);
  return recorte;
}

export function executar(pedido) {
  if (pedido.tipo === "desentortar") return desentortar(pedido.pixels, pedido.largura, pedido.altura, pedido.cantos);
  if (pedido.tipo === "recortar") return recortar(pedido.pixels, pedido.largura, pedido.altura, pedido.alfa, pedido.la, pedido.aa);
  if (pedido.tipo === "inteira") return recorteInteiro(pedido.pixels, pedido.largura, pedido.altura);
  if (pedido.tipo === "vetorizar") {
    return vetorizarImagem({ data: pedido.pixels, width: pedido.largura, height: pedido.altura }, pedido.opcoes);
  }
  if (pedido.tipo === "prepararPeca") {
    // A peça das peças da camisa: o corpo sem as mangas da mesma vista, recortado da foto inteira, sem a sombra.
    const { alfa, soltas } = corpoSemMangas(pedido.alfa, pedido.mangas, pedido.la, pedido.aa);
    const recorte = recortar(pedido.pixels, pedido.largura, pedido.altura, alfa, pedido.la, pedido.aa);
    if (!recorte) return { recorte: null, soltas, clareou: false };
    const { clareou, ...limpo } = tirarSombra(recorte);
    return { recorte: limpo, soltas, clareou };
  }
  if (pedido.tipo === "montarPeca") return montarPeca(pedido.recorte, pedido.tamanho, pedido.ajuste);
  if (pedido.tipo === "montarManga") return montarManga(pedido.frente, pedido.costas, pedido.tamanho, pedido.ajuste, pedido.nome);
  throw new Error(`tarefa desconhecida: ${pedido.tipo}`);
}
```

- [ ] **Step 5: os tipos e a ponte do worker**

`src/telas/extrator/tipos.ts`:

```ts
/** Os tipos da tela do Extrator. Os da conversa com o servidor moram em `api/extrator.ts`. */
import type { CaixaDoClique, IdDaMarcacao, PontoDoClique } from "../../api/extrator";

export type { CaixaDoClique, IdDaMarcacao, PontoDoClique };

/** Pixels RGBA, como o canvas os entrega e o `ImageData` os aceita. */
export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface Ponto { x: number; y: number }

/** A foto inteira, na resolução em que chegou (já em pé pelo EXIF). */
export interface Imagem { pixels: Pixels; largura: number; altura: number }

/** Um elemento recortado: a foto com a máscara no alfa, e onde ele estava nela. */
export interface Recorte { rgba: Pixels; largura: number; altura: number; x0: number; y0: number }

/** A foto de trabalho: o que a mesa mostra e o que vai ao servidor (lado maior em 2048). */
export interface Trabalho { bitmap: ImageBitmap; jpeg: Blob; largura: number; altura: number; escala: number }

/** A máscara mostrada na mesa, com quantos cliques (e caixa) a fizeram. */
export interface Mascara { alfa: Uint8Array; largura: number; altura: number; nota: number; cobertura: number; pontos: number }

export type Jeito = "chapado" | "foto";
export type PedidoDeTamanho = { tipo: "4k" } | { tipo: "cm"; larguraCm: number };

export interface Elemento {
  id: number;
  nome: string;
  recorte: Recorte;
  /** O PNG pequeno da lista (data URL). */
  miniatura: string;
  jeito: Jeito;
  cores: number;
  juntarSombras: number;
  tamanho: PedidoDeTamanho;
}

export interface OpcoesDoVetor { cores: number; juntarSombras: number; larguraCm?: number }
export interface CamadaDoVetor { cor: string; pontos: number; caminhos: number; d: string }
/** As quatro peças que saem das peças da camisa. */
export type IdDaPeca = "frente" | "costas" | "manga-esquerda" | "manga-direita";

/** O zoom e o deslocamento (em fração da área) da arte dentro do retângulo. */
export interface Ajuste { zoom: number; dx: number; dy: number }

/** A peça no retângulo, antes de preencher: o alfa abaixo de 128 é o que vai ser inventado. */
export interface Montada { rgba: Pixels; largura: number; altura: number; inventado: number; aviso?: string | null }

/** Uma peça recortada e limpa, pronta para montar: o resultado da tarefa `prepararPeca`. */
export interface PecaPreparada { recorte: Recorte | null; soltas: number[]; clareou: boolean }

export interface ResultadoDoVetor { svg: string | null; camadas: CamadaDoVetor[]; largura: number; altura: number; erro?: string }
```

`src/telas/extrator/trabalhador.ts`:

```ts
/**
 * O worker do Extrator, com promessa: cada pedido leva um número, e a
 * resposta volta para quem pediu.
 *
 * O que vai para lá é o que travaria a tela: endireitar e recortar a foto
 * inteira (12 megapixels de celular) e vetorizar o elemento. Os pixels vão
 * COPIADOS, e não transferidos: a tela continua precisando da foto depois.
 *
 * Se o navegador não deixar criar o worker, a conta roda aqui mesmo — a tela
 * engasga enquanto ela roda, mas funciona (a regra do antigo `vetorWorker`).
 */
import type { Ajuste, Imagem, Montada, OpcoesDoVetor, PecaPreparada, Pixels, Ponto, Recorte, ResultadoDoVetor } from "./tipos";

type Pedido =
  | { tipo: "desentortar"; pixels: Pixels; largura: number; altura: number; cantos: Ponto[] }
  | { tipo: "recortar"; pixels: Pixels; largura: number; altura: number; alfa: Uint8Array; la: number; aa: number }
  | { tipo: "inteira"; pixels: Pixels; largura: number; altura: number }
  | { tipo: "vetorizar"; pixels: Pixels; largura: number; altura: number; opcoes: OpcoesDoVetor }
  | { tipo: "prepararPeca"; pixels: Pixels; largura: number; altura: number; alfa: Uint8Array; mangas: Uint8Array[]; la: number; aa: number }
  | { tipo: "montarPeca"; recorte: Recorte; tamanho: { largura: number; altura: number }; ajuste: Ajuste }
  | { tipo: "montarManga"; frente: Recorte | null; costas: Recorte | null; tamanho: { largura: number; altura: number }; ajuste: Ajuste; nome: string };

let worker: Worker | null | undefined;
let proximo = 1;
const esperando = new Map<number, { pronto: (v: unknown) => void; falhou: (e: Error) => void }>();

function oWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL("../../motores/extratorWorker.js", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ id: number; resultado?: unknown; erro?: string }>) => {
      const p = esperando.get(e.data.id);
      if (!p) return;
      esperando.delete(e.data.id);
      if (e.data.erro) p.falhou(new Error(e.data.erro));
      else p.pronto(e.data.resultado);
    };
    w.onerror = () => {
      for (const p of esperando.values()) p.falhou(new Error("O trabalhador do Extrator parou no meio."));
      esperando.clear();
      worker = null;
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

async function aquiMesmo<T>(pedido: Pedido): Promise<T> {
  const { executar } = await import("../../motores/extratorTarefas");
  return executar(pedido) as T;
}

function pedir<T>(pedido: Pedido): Promise<T> {
  const w = oWorker();
  if (!w) return aquiMesmo<T>(pedido);
  const id = proximo++;
  return new Promise<T>((pronto, falhou) => {
    esperando.set(id, { pronto: pronto as (v: unknown) => void, falhou });
    w.postMessage({ id, ...pedido });
  });
}

export const trabalhador = {
  desentortar: (foto: Imagem, cantos: Ponto[]) =>
    pedir<{ rgba: Pixels; largura: number; altura: number } | null>({ tipo: "desentortar", pixels: foto.pixels, largura: foto.largura, altura: foto.altura, cantos }),
  recortar: (foto: Imagem, alfa: Uint8Array, la: number, aa: number) =>
    pedir<Recorte | null>({ tipo: "recortar", pixels: foto.pixels, largura: foto.largura, altura: foto.altura, alfa, la, aa }),
  inteira: (foto: Imagem) =>
    pedir<Recorte | null>({ tipo: "inteira", pixels: foto.pixels, largura: foto.largura, altura: foto.altura }),
  vetorizar: (r: Recorte, opcoes: OpcoesDoVetor) =>
    pedir<ResultadoDoVetor>({ tipo: "vetorizar", pixels: r.rgba, largura: r.largura, altura: r.altura, opcoes }),
  /** A peça (o corpo sem as `mangas` da mesma vista), recortada da foto inteira e sem a sombra do mockup. */
  prepararPeca: (foto: Imagem, alfa: Uint8Array, mangas: Uint8Array[], la: number, aa: number) =>
    pedir<PecaPreparada>({ tipo: "prepararPeca", pixels: foto.pixels, largura: foto.largura, altura: foto.altura, alfa, mangas, la, aa }),
  montarPeca: (recorte: Recorte, tamanho: { largura: number; altura: number }, ajuste: Ajuste) =>
    pedir<Montada>({ tipo: "montarPeca", recorte, tamanho, ajuste }),
  montarManga: (frente: Recorte | null, costas: Recorte | null, tamanho: { largura: number; altura: number }, ajuste: Ajuste, nome: string) =>
    pedir<Montada | null>({ tipo: "montarManga", frente, costas, tamanho, ajuste, nome }),
};
```

Em `src/telas/extrator/desenho.ts`, logo antes de `/** O elemento em PNG (data URL), com o lado maior em até \`lado\` px: …`:

```ts
/** Um PNG (o que volta do preenchimento) de volta a pixels. */
export async function imagemDoBlob(blob: Blob): Promise<Imagem> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  } catch {
    throw new Error("O servidor mandou uma imagem que o navegador não conseguiu abrir.");
  }
  try {
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = contexto(c, true);
    ctx.drawImage(bitmap, 0, 0);
    return { pixels: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, largura: bitmap.width, altura: bitmap.height };
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 6: o estado das peças — `src/telas/extrator/usePecasDaCamisa.ts`**

```ts
/**
 * ===========================================================================
 * O ESTADO DAS PEÇAS DA CAMISA — as marcações, as medidas e os retângulos
 * ===========================================================================
 *
 * O modo "Peças da camisa" usa a mesa e os cliques do Extrator
 * (`useExtrator`): a máscara da vez vira uma das seis marcações. Daqui saem
 * os quatro retângulos:
 *
 *   marcar → montar (worker: corpo sem manga, sem sombra, no retângulo)
 *          → preencher (servidor: a LaMa inventa o que falta)
 *          → baixar ou mandar ao molde (servidor: ampliado a 300 dpi)
 *
 * Montar e preencher são passos separados de propósito: a prévia montada
 * mostra quanto vai ser inventado ANTES de a LaMa rodar, e o aviso de "boa
 * parte desta arte vai ser inventada" chega a tempo.
 *
 * Cada marcação guarda a foto de onde saiu: a frente e as costas podem vir de
 * fotos diferentes, e abrir a segunda não apaga o que foi marcado na primeira.
 */
import { zipSync, type Zippable } from "fflate";
import { useCallback, useEffect, useRef, useState } from "react";
import { extratorApi, type IdDaMarcacao } from "../../api/extrator";
import { avisoDaMascara, nomesUnicos, tamanhoDaSaida } from "../../motores/extrator";
import { AJUSTE_INICIAL, LIMITE_INVENTADO, MARCACOES, PECAS, tamanhoDaMontagem } from "../../motores/pecasDaCamisa";
import { baixar } from "./arquivos";
import { imagemDoBlob } from "./desenho";
import { trabalhador } from "./trabalhador";
import type { Ajuste, IdDaPeca, Imagem, Mascara, Montada, Recorte } from "./tipos";
import type { Extrator } from "./useExtrator";

export interface Medida { larguraCm: number; alturaCm: number }

/** Uma marcação: a máscara (no tamanho da foto de trabalho) e a foto de onde ela saiu. */
export interface Marcacao { mascara: Mascara; foto: Imagem }

export interface EstadoDaPeca {
  montada: Montada;
  /** O retângulo preenchido pela LaMa (sem transparência), ou `null` antes de preencher. */
  preenchida: Imagem | null;
  ajuste: Ajuste;
}

/** Frente e costas começam iguais; a manga aberta é mais larga que alta. */
export const MEDIDAS_INICIAIS: Record<IdDaPeca, Medida> = {
  frente: { larguraCm: 50, alturaCm: 70 },
  costas: { larguraCm: 50, alturaCm: 70 },
  "manga-esquerda": { larguraCm: 40, alturaCm: 25 },
  "manga-direita": { larguraCm: 40, alturaCm: 25 },
};

const nomeDaPeca = (id: IdDaPeca) => PECAS.find((p) => p.id === id)!.nome;
const nomeDaMarcacao = (id: IdDaMarcacao) => MARCACOES.find((m) => m.id === id)!.nome;
const MANGAS_DA_VISTA: Record<"frente" | "costas", IdDaMarcacao[]> = {
  frente: ["manga-esquerda-frente", "manga-direita-frente"],
  costas: ["manga-esquerda-costas", "manga-direita-costas"],
};

export function usePecasDaCamisa(x: Extrator) {
  const [marcacoes, setMarcacoes] = useState<Partial<Record<IdDaMarcacao, Marcacao>>>({});
  const [vez, setVez] = useState<IdDaMarcacao>("frente");
  const [medidas, setMedidas] = useState<Record<IdDaPeca, Medida>>(MEDIDAS_INICIAIS);
  const [pecas, setPecas] = useState<Partial<Record<IdDaPeca, EstadoDaPeca>>>({});
  const [avisos, setAvisos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState("");
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null);

  // O recorte limpo de cada marcação, guardado enquanto ela e a foto não mudam.
  const preparadas = useRef<Partial<Record<IdDaMarcacao, Promise<Recorte | null>>>>({});
  const controle = useRef<AbortController | null>(null);
  // As marcações e as peças também numa ref: o ajuste solto logo depois de montar lê o valor novo.
  const marcacoesAgora = useRef(marcacoes);
  marcacoesAgora.current = marcacoes;
  const pecasAgora = useRef(pecas);
  pecasAgora.current = pecas;

  // Sair da tela para o que estiver rodando.
  useEffect(() => () => controle.current?.abort(), []);

  const proximaVazia = (m: Partial<Record<IdDaMarcacao, Marcacao>>, depoisDe: IdDaMarcacao): IdDaMarcacao => {
    const i = MARCACOES.findIndex((c) => c.id === depoisDe);
    const ordem = [...MARCACOES.slice(i + 1), ...MARCACOES.slice(0, i + 1)];
    return (ordem.find((c) => !m[c.id as IdDaMarcacao])?.id ?? depoisDe) as IdDaMarcacao;
  };

  const guardarMarcacao = useCallback((id: IdDaMarcacao, marcacao: Marcacao | null) => {
    // Trocar a manga muda o corpo da mesma vista: o recorte guardado dele também cai.
    preparadas.current = {};
    setPecas({});
    // A ref primeiro: as marcações da análise chegam em seguida, no mesmo laço.
    const novas = { ...marcacoesAgora.current };
    if (marcacao) novas[id] = marcacao; else delete novas[id];
    marcacoesAgora.current = novas;
    setMarcacoes(novas);
    if (marcacao) setVez(proximaVazia(novas, id));
  }, []);

  /** A máscara da mesa vira a marcação da vez. */
  const usarMascara = useCallback(() => {
    if (!x.mascara || !x.foto) return;
    const aviso = avisoDaMascara(x.mascara.cobertura);
    if (aviso) {
      x.setErro(aviso);
      return;
    }
    x.setErro(null);
    guardarMarcacao(vez, { mascara: x.mascara, foto: x.foto });
    x.limparCliques();
  }, [x, vez, guardarMarcacao]);

  /** O recorte limpo de uma marcação: a peça sem a sombra (e, no corpo, sem as mangas da mesma vista). */
  const preparar = useCallback((id: IdDaMarcacao): Promise<Recorte | null> => {
    const guardada = preparadas.current[id];
    if (guardada) return guardada;
    const m = marcacoesAgora.current[id];
    if (!m) return Promise.resolve(null);
    const vista = id === "frente" || id === "costas" ? id : null;
    // As mangas só saem do corpo quando foram marcadas na mesma foto que ele.
    const ids = vista ? MANGAS_DA_VISTA[vista].filter((i) => marcacoesAgora.current[i]?.foto === m.foto) : [];
    const p = trabalhador.prepararPeca(m.foto, m.mascara.alfa, ids.map((i) => marcacoesAgora.current[i]!.mascara.alfa), m.mascara.largura, m.mascara.altura)
      .then((r) => {
        const novos = r.soltas.map((k) => `A ${nomeDaMarcacao(ids[k]!).toLowerCase()} não encosta no corpo: marque uma caixa melhor nela.`);
        if (novos.length) setAvisos((a) => [...a, ...novos]);
        return r.recorte;
      });
    p.catch(() => { delete preparadas.current[id]; });
    preparadas.current[id] = p;
    return p;
  }, []);

  const montarUma = useCallback(async (id: IdDaPeca, medida: Medida, ajuste: Ajuste): Promise<Montada | null> => {
    const tamanho = tamanhoDaMontagem(medida.larguraCm, medida.alturaCm);
    if (id === "frente" || id === "costas") {
      const r = await preparar(id);
      return r ? trabalhador.montarPeca(r, tamanho, ajuste) : null;
    }
    const [frente, costas] = await Promise.all([preparar(`${id}-frente` as IdDaMarcacao), preparar(`${id}-costas` as IdDaMarcacao)]);
    return trabalhador.montarManga(frente, costas, tamanho, ajuste, nomeDaPeca(id).toLowerCase());
  }, [preparar]);

  const avisosDa = (id: IdDaPeca, m: Montada): string[] => [
    ...(m.aviso ? [m.aviso] : []),
    ...(m.inventado > LIMITE_INVENTADO
      ? [`Boa parte da ${nomeDaPeca(id).toLowerCase()} vai ser inventada (${Math.round(m.inventado * 100)}%): confira a medida ou marque uma caixa maior.`]
      : []),
  ];

  /** Monta as peças que têm marcação, com o ajuste de começo. */
  const montar = useCallback(async () => {
    x.setErro(null);
    setAvisos([]);
    setOcupado("Montando as peças…");
    try {
      const novas: Partial<Record<IdDaPeca, EstadoDaPeca>> = {};
      const todos: string[] = [];
      for (const p of PECAS) {
        const id = p.id as IdDaPeca;
        const m = await montarUma(id, medidas[id], AJUSTE_INICIAL);
        if (!m) continue;
        novas[id] = { montada: m, preenchida: null, ajuste: AJUSTE_INICIAL };
        todos.push(...avisosDa(id, m));
      }
      if (Object.keys(novas).length === 0) throw new Error("Marque pelo menos uma peça: a frente, as costas ou uma manga.");
      setPecas(novas);
      setAvisos((a) => [...a, ...todos]);
    } catch (e) {
      x.setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }, [x, medidas, montarUma]);

  /** Preenche uma peça montada na LaMa. Estoura com AbortError se cancelado. */
  const preencherUma = useCallback(async (id: IdDaPeca, m: Montada, sinal: AbortSignal): Promise<Imagem> => {
    setOcupado(`Preenchendo a ${nomeDaPeca(id).toLowerCase()}…`);
    const png = await extratorApi.preencher(m, (feitos, total) => setAndamento({ feitos, total }), sinal);
    return imagemDoBlob(png);
  }, []);

  /** Preenche todas as peças montadas, uma de cada vez. */
  const preencher = useCallback(async () => {
    const motivo = x.estado?.preencher;
    if (motivo) {
      x.setErro(`${motivo} Sem ela, dá para baixar o retângulo com o buraco transparente.`);
      return;
    }
    const c = new AbortController();
    controle.current = c;
    x.setErro(null);
    try {
      for (const p of PECAS) {
        const id = p.id as IdDaPeca;
        const atual = pecasAgora.current[id];
        if (!atual || atual.preenchida) continue;
        const preenchida = await preencherUma(id, atual.montada, c.signal);
        setPecas((antes) => (antes[id]?.montada === atual.montada ? { ...antes, [id]: { ...antes[id]!, preenchida } } : antes));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") x.setErro((e as Error).message);
    } finally {
      setOcupado("");
      setAndamento(null);
      controle.current = null;
    }
  }, [x, preencherUma]);

  /** O operador soltou o ajuste: monta de novo e, se a peça já estava preenchida, preenche de novo. */
  const ajustar = useCallback(async (id: IdDaPeca, ajuste: Ajuste) => {
    const antes = pecasAgora.current[id];
    if (!antes) return;
    x.setErro(null);
    try {
      const montada = await montarUma(id, medidas[id], ajuste);
      if (!montada) return;
      setPecas((p) => ({ ...p, [id]: { montada, preenchida: null, ajuste } }));
      if (!antes.preenchida || x.estado?.preencher) return;
      const c = new AbortController();
      controle.current = c;
      const preenchida = await preencherUma(id, montada, c.signal);
      setPecas((p) => (p[id]?.montada === montada ? { ...p, [id]: { ...p[id]!, preenchida } } : p));
    } catch (e) {
      if ((e as Error).name !== "AbortError") x.setErro((e as Error).message);
    } finally {
      setOcupado("");
      setAndamento(null);
    }
  }, [x, medidas, montarUma, preencherUma]);

  const mudarMedida = useCallback((id: IdDaPeca, medida: Medida) => {
    setMedidas((m) => ({ ...m, [id]: medida }));
    // A medida nova pede um retângulo novo: a peça montada sai, e o Montar volta.
    setPecas((p) => {
      const sem = { ...p };
      delete sem[id];
      return sem;
    });
  }, []);

  const cancelar = useCallback(() => controle.current?.abort(), []);

  const nomes = nomesUnicos(PECAS.map((p) => `${x.nomeDaFoto || "camisa"} - ${p.nome}`));
  const arquivoDa = (id: IdDaPeca) => `${nomes[PECAS.findIndex((p) => p.id === id)]}.png`;

  /** O PNG final da peça: o retângulo preenchido (ou o montado, com o buraco) ampliado a 300 dpi na largura digitada. */
  const pngDa = useCallback(async (id: IdDaPeca, sinal: AbortSignal): Promise<Blob> => {
    const p = pecasAgora.current[id];
    if (!p) throw new Error("Monte as peças primeiro.");
    const img = p.preenchida ?? { pixels: p.montada.rgba, largura: p.montada.largura, altura: p.montada.altura };
    const saida = tamanhoDaSaida(img.largura, img.altura, { tipo: "cm", larguraCm: medidas[id].larguraCm });
    if (saida.cortada) {
      const aviso = `A ${nomeDaPeca(id).toLowerCase()} passa de 80 megapixels a 300 dpi: saiu cortada em ${saida.largura} × ${saida.altura} px.`;
      setAvisos((a) => (a.includes(aviso) ? a : [...a, aviso]));
    }
    setOcupado(`Ampliando a ${nomeDaPeca(id).toLowerCase()} a 300 dpi…`);
    return extratorApi.ampliar({ rgba: img.pixels, largura: img.largura, altura: img.altura }, saida,
      (feitos, total) => setAndamento({ feitos, total }), sinal);
  }, [medidas]);

  /** Roda `fazer` com o cancelar ligado, o ocupado e o erro em português. */
  const comCancelar = useCallback(async (fazer: (sinal: AbortSignal) => Promise<void>) => {
    const c = new AbortController();
    controle.current = c;
    x.setErro(null);
    try {
      await fazer(c.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") x.setErro((e as Error).message);
    } finally {
      setOcupado("");
      setAndamento(null);
      controle.current = null;
    }
  }, [x]);

  const prontas = () => PECAS.map((p) => p.id as IdDaPeca).filter((id) => pecasAgora.current[id]);

  return {
    marcacoes, vez, setVez, medidas, pecas, avisos, ocupado, andamento,
    usarMascara, apagarMarcacao: (id: IdDaMarcacao) => guardarMarcacao(id, null),
    mudarMedida, montar, preencher, ajustar, cancelar, arquivoDa, prontas,
    baixarUma: (id: IdDaPeca) => comCancelar(async (sinal) => baixar(await pngDa(id, sinal), arquivoDa(id))),
    baixarZip: () => comCancelar(async (sinal) => {
      const arquivos: Zippable = {};
      for (const id of prontas()) arquivos[arquivoDa(id)] = [new Uint8Array(await (await pngDa(id, sinal)).arrayBuffer()), { level: 0 }];
      baixar(new Blob([zipSync(arquivos) as Uint8Array<ArrayBuffer>], { type: "application/zip" }), `${x.nomeDaFoto || "camisa"} - peças.zip`);
    }),
  };
}

export type EstadoDasPecas = ReturnType<typeof usePecasDaCamisa>;
```

- [ ] **Step 7: a prévia — `src/telas/extrator/PreviaDaPeca.tsx`**

```tsx
/**
 * A PRÉVIA DE UMA PEÇA — o retângulo, o que vai ser inventado e o ajuste.
 *
 * Mostra o retângulo preenchido (ou o montado, com o buraco em xadrez). O
 * "Mostrar o que foi inventado" pinta por cima, no destaque, o que não veio
 * da foto. Arrastar desloca a arte e o controle de zoom a aumenta; enquanto
 * arrasta, só a imagem anda na tela, e ao soltar a peça é montada (e
 * preenchida) de novo — o trabalho pesado acontece uma vez por mexida.
 *
 * `data-inventado` fica no canvas para a bancada ler a parte inventada sem
 * contar pixel.
 */
import { useEffect, useRef, useState, type PointerEvent as EventoDoPonteiro } from "react";
import { canvasCom } from "./desenho";
import type { Ajuste, Imagem, Montada } from "./tipos";

interface Props {
  id: string;
  montada: Montada;
  preenchida: Imagem | null;
  ajuste: Ajuste;
  /** Quantas áreas de ajuste cabem na largura: 1 no corpo, 2 na manga (cada metade é uma área). */
  areasNaLargura: number;
  desligada: boolean;
  aoSoltar: (ajuste: Ajuste) => void;
}

export function PreviaDaPeca({ id, montada, preenchida, ajuste, areasNaLargura, desligada, aoSoltar }: Props) {
  const tela = useRef<HTMLCanvasElement>(null);
  const [mostrarInventado, setMostrarInventado] = useState(false);
  const [zoom, setZoom] = useState(ajuste.zoom);
  const [arrasto, setArrasto] = useState<{ de: { x: number; y: number }; dx: number; dy: number } | null>(null);

  useEffect(() => setZoom(ajuste.zoom), [ajuste.zoom]);

  // A imagem da peça e o véu do inventado, uma vez por peça.
  const [imagem, setImagem] = useState<HTMLCanvasElement | null>(null);
  const [veu, setVeu] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const img = preenchida ?? { pixels: montada.rgba, largura: montada.largura, altura: montada.altura };
    setImagem(canvasCom(img.pixels, img.largura, img.altura));
    const v = new Uint8ClampedArray(montada.largura * montada.altura * 4);
    const cor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const m = /^#([0-9a-f]{6})$/i.exec(cor);
    const n = m ? parseInt(m[1]!, 16) : 0xff531f;
    for (let i = 0; i < montada.largura * montada.altura; i++) {
      if (montada.rgba[i * 4 + 3]! >= 128) continue;
      v[i * 4] = (n >> 16) & 255; v[i * 4 + 1] = (n >> 8) & 255; v[i * 4 + 2] = n & 255; v[i * 4 + 3] = 140;
    }
    setVeu(canvasCom(v, montada.largura, montada.altura));
  }, [montada, preenchida]);

  useEffect(() => {
    const c = tela.current;
    if (!c || !imagem) return;
    c.width = montada.largura;
    c.height = montada.altura;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const r = c.getBoundingClientRect();
    const k = r.width > 0 ? c.width / r.width : 1;
    const ox = arrasto ? arrasto.dx * k : 0, oy = arrasto ? arrasto.dy * k : 0;
    ctx.drawImage(imagem, ox, oy);
    if (mostrarInventado && veu && !arrasto) ctx.drawImage(veu, 0, 0);
  });

  const apertar = (e: EventoDoPonteiro<HTMLCanvasElement>) => {
    if (desligada) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrasto({ de: { x: e.clientX, y: e.clientY }, dx: 0, dy: 0 });
  };
  const mover = (e: EventoDoPonteiro<HTMLCanvasElement>) => {
    if (arrasto) setArrasto({ ...arrasto, dx: e.clientX - arrasto.de.x, dy: e.clientY - arrasto.de.y });
  };
  const soltar = (e: EventoDoPonteiro<HTMLCanvasElement>) => {
    if (!arrasto) return;
    const r = e.currentTarget.getBoundingClientRect();
    setArrasto(null);
    if (r.width === 0 || (Math.abs(arrasto.dx) < 3 && Math.abs(arrasto.dy) < 3)) return;
    aoSoltar({ ...ajuste, dx: ajuste.dx + (arrasto.dx / r.width) * areasNaLargura, dy: ajuste.dy + arrasto.dy / r.height });
  };
  const soltarZoom = () => { if (zoom !== ajuste.zoom) aoSoltar({ ...ajuste, zoom }); };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid place-items-center overflow-hidden rounded-[10px] border border-linha bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
        <canvas
          ref={tela}
          id={`pecas-previa-${id}`}
          data-inventado={montada.inventado.toFixed(4)}
          data-preenchida={preenchida ? "sim" : "nao"}
          className={`block h-auto max-h-64 w-auto max-w-full touch-none select-none ${desligada ? "opacity-60" : "cursor-move"}`}
          onPointerDown={apertar}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={() => setArrasto(null)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[0.82rem] text-tinta-fraca">
        <label className="flex min-w-40 flex-1 items-center gap-2">
          <span className="shrink-0">Zoom</span>
          <input id={`pecas-zoom-${id}`} type="range" min={1} max={3} step={0.05} value={zoom} disabled={desligada}
            onChange={(e) => setZoom(Number(e.target.value))} onPointerUp={soltarZoom} onKeyUp={soltarZoom} className="min-w-0 flex-1" />
          <span className="w-10 text-right font-mono">{Math.round(zoom * 100)}%</span>
        </label>
        <label className="flex items-center gap-1.5">
          <input id={`pecas-inventado-${id}`} type="checkbox" checked={mostrarInventado} onChange={(e) => setMostrarInventado(e.target.checked)} />
          Mostrar o que foi inventado ({Math.round(montada.inventado * 100)}%)
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: o painel — `src/telas/extrator/PecasDaCamisa.tsx`**

```tsx
/**
 * O PAINEL DAS PEÇAS DA CAMISA — marcações, medidas, prévias e saída.
 *
 * O desenho é da spec `docs/superpowers/specs/2026-10-07-pecas-da-camisa-design.md`;
 * o estado mora em `usePecasDaCamisa.ts`. A marcação em si acontece na mesa
 * do Extrator, com os mesmos cliques e caixas: o botão "Usar como…" de lá
 * guarda a máscara na marcação da vez.
 */
import { Botao } from "../../casca/Botao";
import type { IdDaMarcacao } from "../../api/extrator";
import { MARCACOES, PECAS } from "../../motores/pecasDaCamisa";
import { PreviaDaPeca } from "./PreviaDaPeca";
import type { IdDaPeca } from "./tipos";
import type { EstadoDasPecas } from "./usePecasDaCamisa";

interface Props { p: EstadoDasPecas }

export function PecasDaCamisa({ p }: Props) {
  const ocupado = Boolean(p.ocupado);
  const montadas = PECAS.filter((c) => p.pecas[c.id as IdDaPeca]);
  const algumaMarcada = Object.keys(p.marcacoes).length > 0;
  const faltaPreencher = montadas.some((c) => !p.pecas[c.id as IdDaPeca]!.preenchida);

  return (
    <div id="pecas-painel" className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[0.85rem] font-semibold">Marcações</h3>
        <p className="m-0 text-[0.8rem] text-tinta-fraca">
          Passe uma caixa em volta de cada parte na foto e aperte "Usar como…". Esquerda e direita são de quem veste a camisa.
        </p>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {MARCACOES.map((m) => {
            const id = m.id as IdDaMarcacao;
            const marcada = Boolean(p.marcacoes[id]);
            const daVez = p.vez === id;
            return (
              <li key={id} className={`flex items-center gap-2 rounded-md px-2 py-1 text-[0.82rem] ${daVez ? "bg-[var(--accent-soft)]" : ""}`}>
                <button id={`pecas-marcacao-${id}`} type="button" onClick={() => p.setVez(id)}
                  className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-inherit">
                  {m.nome}
                </button>
                <span data-marcada={marcada ? "sim" : "nao"} className={marcada ? "text-[var(--ok,#16a34a)]" : "text-tinta-apagada"}>
                  {marcada ? "marcada" : daVez ? "a vez" : "falta"}
                </span>
                {marcada && (
                  <Botao id={`pecas-apagar-${id}`} tamanho="pequeno" jeito="fantasma" aria-label={`Apagar ${m.nome}`} onClick={() => p.apagarMarcacao(id)}>×</Botao>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[0.85rem] font-semibold">Medida de cada retângulo</h3>
        {PECAS.map((c) => {
          const id = c.id as IdDaPeca;
          const m = p.medidas[id];
          const mudar = (campo: "larguraCm" | "alturaCm", v: number) => { if (v > 0 && v <= 300) p.mudarMedida(id, { ...m, [campo]: v }); };
          return (
            <label key={id} className="flex items-center gap-2 text-[0.82rem]">
              <span className="w-32 shrink-0 text-tinta-fraca">{c.nome}</span>
              <input id={`pecas-largura-${id}`} type="number" min={1} max={300} step={0.5} value={m.larguraCm}
                onChange={(e) => mudar("larguraCm", Number(e.target.value))} className="w-16 rounded-md border border-linha bg-painel-suave px-2 py-1" />
              ×
              <input id={`pecas-altura-${id}`} type="number" min={1} max={300} step={0.5} value={m.alturaCm}
                onChange={(e) => mudar("alturaCm", Number(e.target.value))} className="w-16 rounded-md border border-linha bg-painel-suave px-2 py-1" />
              cm
            </label>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Botao id="pecas-montar" jeito={montadas.length ? "secundario" : "primario"} disabled={!algumaMarcada || ocupado} onClick={() => void p.montar()}>
          Montar as peças
        </Botao>
        <Botao id="pecas-preencher" jeito="primario" disabled={!faltaPreencher || ocupado} onClick={() => void p.preencher()}>
          Preencher o que falta
        </Botao>
      </div>

      {(p.ocupado || p.andamento) && (
        <div className="flex items-center gap-2">
          <p id="pecas-ocupado" className="m-0 min-w-0 flex-1 text-[0.82rem] text-tinta-fraca">{p.ocupado}</p>
          {p.andamento && (
            <>
              <progress id="pecas-andamento" max={Math.max(1, p.andamento.total)} value={p.andamento.feitos} className="h-2 w-24" />
              <span className="font-mono text-[11px] text-tinta-apagada">{p.andamento.feitos}/{p.andamento.total}</span>
            </>
          )}
          <Botao id="pecas-cancelar" tamanho="pequeno" jeito="fantasma" onClick={p.cancelar}>Cancelar</Botao>
        </div>
      )}

      {p.avisos.length > 0 && (
        <ul id="pecas-avisos" className="m-0 flex flex-col gap-1 pl-4 text-[0.82rem] text-ambar">
          {p.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}

      {montadas.map((c) => {
        const id = c.id as IdDaPeca;
        const e = p.pecas[id]!;
        return (
          <section key={id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="m-0 flex-1 text-[0.85rem] font-semibold">{c.nome}</h3>
              <Botao id={`pecas-baixar-${id}`} tamanho="pequeno" jeito="secundario" disabled={ocupado} onClick={() => void p.baixarUma(id)}>
                Baixar PNG
              </Botao>
            </div>
            <PreviaDaPeca id={id} montada={e.montada} preenchida={e.preenchida} ajuste={e.ajuste}
              areasNaLargura={id.startsWith("manga") ? 2 : 1} desligada={ocupado} aoSoltar={(a) => void p.ajustar(id, a)} />
          </section>
        );
      })}

      {montadas.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-linha pt-3">
          <Botao id="pecas-zip" jeito="secundario" disabled={ocupado} onClick={() => void p.baixarZip()}>
            Baixar as peças (ZIP, 300 dpi)
          </Botao>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 9: as abas — `src/telas/Extrator.tsx`**

O arquivo inteiro passa a ser:

```tsx
/**
 * ===========================================================================
 * O EXTRATOR — a foto vira cada logo, texto e estampa separados
 * ===========================================================================
 *
 * O operador manda a foto da camisa (ou o mockup), endireita se ela estiver de
 * lado, clica em cada elemento e guarda; cada elemento sai em vetor e PNG
 * grande (jeito Chapado) ou ampliado (jeito Foto). Tudo no computador: a rede
 * que acha o elemento e a que amplia rodam no servidor (`servidor/extrator-*.js`).
 *
 * O desenho é da spec `docs/superpowers/specs/2026-10-06-extrator-design.md`;
 * o estado mora em `extrator/useExtrator.ts`, a mesa em `extrator/MesaDoExtrator.tsx`.
 *
 * A aba "Peças da camisa" (spec `2026-10-07-pecas-da-camisa-design.md`) usa a
 * mesma mesa: a máscara vira uma das seis marcações, e o painel da direita
 * monta o retângulo de cada peça (`extrator/usePecasDaCamisa.ts`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Botao } from "../casca/Botao";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { MARCACOES } from "../motores/pecasDaCamisa";
import { baixar, cacheDeVetores, zipDosElementos } from "./extrator/arquivos";
import { ListaDeElementos } from "./extrator/ListaDeElementos";
import { MesaDoExtrator } from "./extrator/MesaDoExtrator";
import { PainelDoElemento } from "./extrator/PainelDoElemento";
import { PecasDaCamisa } from "./extrator/PecasDaCamisa";
import type { Ponto } from "./extrator/tipos";
import { useExtrator } from "./extrator/useExtrator";
import { usePecasDaCamisa } from "./extrator/usePecasDaCamisa";

/** Os quatro cantos de começo: um retângulo a 10% da borda da foto. */
function cantosIniciais(largura: number, altura: number): Ponto[] {
  const mx = largura * 0.1, my = altura * 0.1;
  return [{ x: mx, y: my }, { x: largura - mx, y: my }, { x: largura - mx, y: altura - my }, { x: mx, y: altura - my }];
}

export function Extrator() {
  const x = useExtrator();
  const pc = usePecasDaCamisa(x);
  const [aba, setAba] = useState<"elementos" | "pecas">("elementos");
  const entrada = useRef<HTMLInputElement>(null);
  const [modo, setModo] = useState<"separar" | "cantos">("separar");
  const [cantos, setCantos] = useState<Ponto[]>([]);
  const [arquivoEmCima, setArquivoEmCima] = useState(false);
  const [zipando, setZipando] = useState("");
  // O vetor de cada elemento, guardado pelas opções enquanto a tela estiver aberta.
  const vetorDe = useMemo(() => cacheDeVetores(), []);

  const controleDoZip = useRef<AbortController | null>(null);
  // Sair da tela para o ZIP junto, sem baixar nada.
  useEffect(() => () => controleDoZip.current?.abort(), []);

  const baixarZip = async () => {
    const c = new AbortController();
    controleDoZip.current = c;
    setZipando("Preparando o ZIP…");
    try {
      baixar(await zipDosElementos(x.elementos, vetorDe, setZipando, c.signal), `${x.nomeDaFoto || "extrator"}.zip`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") x.setErro((e as Error).message);
    } finally {
      setZipando("");
      controleDoZip.current = null;
    }
  };

  const comecarCantos = () => {
    if (!x.trabalho) return;
    setCantos(cantosIniciais(x.trabalho.largura, x.trabalho.altura));
    setModo("cantos");
  };
  const aplicarCantos = async () => {
    await x.endireitar(cantos);
    setModo("separar");
  };

  const semRede = x.estado && !x.estado.pronta ? x.estado.motivo : null;
  const elemento = x.elementos.find((e) => e.id === x.escolhido) ?? null;
  const temCliques = x.pontos.length > 0 || Boolean(x.caixa);
  const nomeDaVez = MARCACOES.find((m) => m.id === pc.vez)!.nome;
  const achei = x.mascara ? `Achei ${(x.mascara.cobertura * 100).toFixed(1).replace(".", ",")}% da foto. Mais cliques corrigem; ` : "";
  const situacao = x.ocupado || pc.ocupado
    || (modo === "cantos" ? "Arraste os quatro cantos até os cantos da estampa e aperte Aplicar."
      : x.lendo ? "Lendo a foto…"
        : x.procurando ? "Procurando o elemento…"
          : aba === "pecas" ? (x.mascara ? `${achei}"Usar como" guarda em ${nomeDaVez}.` : `Passe uma caixa em volta de: ${nomeDaVez}.`)
            : x.mascara ? `${achei}Guardar leva para a lista.`
              : "");

  return (
    <div
      className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_380px]"
      onDragOver={(e) => { e.preventDefault(); setArquivoEmCima(true); }}
      onDragLeave={() => setArquivoEmCima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArquivoEmCima(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) void x.abrir(f);
      }}
    >
      <div className="min-w-0">
        <Cartao
          titulo="A foto"
          icone="icones.svg#wand-sparkles"
          apoio="Mande a foto da camisa ou do mockup e clique no que quer separar: esquerdo inclui, direito exclui, arrastar faz caixa."
          acao={(
            <Botao jeito="secundario" icone={<Icone referencia="icones.svg#image-plus" className="size-4" />} onClick={() => entrada.current?.click()}>
              Escolher foto
            </Botao>
          )}
        >
          <input
            ref={entrada}
            id="extrator-foto"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void x.abrir(f);
              e.target.value = "";
            }}
          />

          {semRede && (
            <p id="extrator-sem-rede" className="mt-0 mb-3 flex items-start gap-2 text-[0.85rem] text-[var(--danger)]">
              <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
              <span>{semRede} Sem ela, dá para endireitar a foto e guardar a imagem inteira.</span>
            </p>
          )}
          {x.erro && (
            <p id="extrator-erro" role="alert" className="mt-0 mb-3 flex items-start gap-2 text-[0.85rem] text-[var(--danger)]">
              <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
              <span>{x.erro}</span>
            </p>
          )}

          {!x.trabalho ? (
            <div
              onClick={() => entrada.current?.click()}
              className={`cursor-pointer rounded-[10px] border border-dashed p-8 text-center transition-colors ${
                arquivoEmCima ? "border-ambar bg-[var(--accent-soft)]" : "border-linha"
              }`}
            >
              <Icone referencia="icones.svg#wand-sparkles" className="mx-auto size-8 text-tinta-apagada" />
              <p className="mt-2 mb-1 text-[0.9rem] font-semibold">
                {arquivoEmCima ? "Solte a foto aqui" : "Arraste a foto para cá, ou clique para escolher"}
              </p>
              <p className="m-0 text-[0.82rem] text-tinta-fraca">
                JPG, PNG ou WebP, até 40 megapixels. Foto de camisa pronta ou mockup; um PNG já recortado também entra.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex gap-1.5" role="group" aria-label="O que tirar da foto">
                <Botao id="extrator-aba-elementos" tamanho="pequeno" jeito={aba === "elementos" ? "primario" : "secundario"} onClick={() => setAba("elementos")}>
                  Elementos
                </Botao>
                <Botao id="extrator-aba-pecas" tamanho="pequeno" jeito={aba === "pecas" ? "primario" : "secundario"} onClick={() => setAba("pecas")}>
                  Peças da camisa
                </Botao>
              </div>
              <MesaDoExtrator
                trabalho={x.trabalho}
                mascara={x.mascara}
                pontos={x.pontos}
                caixa={x.caixa}
                modo={modo}
                cantos={cantos}
                aoMudarCantos={setCantos}
                aoClicar={x.clicar}
                aoPassarCaixa={x.passarCaixa}
                desligada={Boolean(x.ocupado) || (modo === "separar" && !x.estado?.pronta)}
              />
              <p id="extrator-situacao" className="m-0 min-h-5 text-[0.85rem] text-tinta-fraca">{situacao}</p>
              <div className="flex flex-wrap items-center gap-2">
                {modo === "separar" ? (
                  <>
                    {aba === "pecas" ? (
                      <Botao id="pecas-usar" jeito="primario" disabled={!x.mascara || Boolean(x.ocupado) || Boolean(pc.ocupado)} onClick={pc.usarMascara}
                        icone={<Icone referencia="icones.svg#plus" className="size-4" />}>
                        Usar como {nomeDaVez.toLowerCase()}
                      </Botao>
                    ) : (
                      <Botao id="extrator-guardar" jeito="primario" disabled={!x.mascara || Boolean(x.ocupado)} onClick={() => void x.guardar()}
                        icone={<Icone referencia="icones.svg#plus" className="size-4" />}>
                        Guardar elemento
                      </Botao>
                    )}
                    <Botao jeito="secundario" disabled={!temCliques} onClick={x.desfazerClique}
                      icone={<Icone referencia="icones.svg#undo-2" className="size-4" />}>
                      Desfazer clique
                    </Botao>
                    <Botao id="extrator-limpar" jeito="fantasma" disabled={!temCliques} onClick={x.limparCliques}>Limpar</Botao>
                    <span className="flex-1" />
                    <Botao id="extrator-endireitar" jeito="secundario" disabled={Boolean(x.ocupado)} onClick={comecarCantos}
                      icone={<Icone referencia="icones.svg#scan" className="size-4" />}>
                      Endireitar
                    </Botao>
                    {aba === "elementos" && (
                      <Botao id="extrator-inteira" jeito="secundario" disabled={Boolean(x.ocupado)} onClick={() => void x.guardarInteira()}>
                        Guardar a imagem inteira
                      </Botao>
                    )}
                  </>
                ) : (
                  <>
                    <Botao id="extrator-aplicar-cantos" jeito="primario" onClick={() => void aplicarCantos()}>Aplicar</Botao>
                    <Botao jeito="secundario" onClick={() => setModo("separar")}>Cancelar</Botao>
                  </>
                )}
              </div>
            </div>
          )}
        </Cartao>
      </div>

      <div className="min-w-0">
        {aba === "pecas" ? (
          <Cartao titulo="Peças da camisa" icone="icones.svg#layers"
            apoio="A frente, as costas e cada manga viram um retângulo cheio, na medida que você digitar, prontos para o molde.">
            <PecasDaCamisa p={pc} />
          </Cartao>
        ) : (<>
        <Cartao
          titulo="Elementos"
          icone="icones.svg#layers"
          apoio="O que você guardou desta foto. Escolha um para limpar e baixar."
          acao={x.elementos.length > 0 ? (
            <Botao id="extrator-zip" jeito="secundario" tamanho="pequeno" disabled={Boolean(zipando)} onClick={() => void baixarZip()}
              icone={<Icone referencia="icones.svg#file-archive" className="size-4" />}>
              Baixar todos (ZIP)
            </Botao>
          ) : undefined}
        >
          {zipando && (
            <div className="mb-2 flex items-center gap-2">
              <p id="extrator-zipando" className="m-0 min-w-0 flex-1 text-[0.82rem] text-tinta-fraca">{zipando}</p>
              <Botao id="extrator-zip-cancelar" tamanho="pequeno" jeito="fantasma" onClick={() => controleDoZip.current?.abort()}>Cancelar</Botao>
            </div>
          )}
          <ListaDeElementos
            elementos={x.elementos}
            escolhido={x.escolhido}
            aoEscolher={x.setEscolhido}
            aoRenomear={(id, nome) => x.mudarElemento(id, { nome })}
            aoRemover={x.removerElemento}
          />
        </Cartao>
        {elemento && (
          <Cartao titulo={elemento.nome} icone="icones.svg#wand-sparkles" apoio="Limpe e baixe este elemento.">
            <PainelDoElemento
              key={elemento.id}
              elemento={elemento}
              aoMudar={(mudanca) => x.mudarElemento(elemento.id, mudanca)}
              aoErro={x.setErro}
              vetorDe={vetorDe}
            />
          </Cartao>
        )}
        </>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: os tipos**

Run: `npm run tipos`
Expected: sem erro.

- [ ] **Step 11: as bancadas — a do motor, a de tela antiga e a nova**

Run: `npm run bancada:pecas && npm run bancada:extrator && npm run front && npm run bancada:extrator-tela && npm run bancada:pecas-tela`
Expected: os dois `OK` sem rede; `OK — o Extrator no navegador.` (a bancada antiga, agora com os ajudantes divididos e a ampliação pela fila nova); e

```
  marcar, medir, montar e preencher as quatro peças
  o PNG na medida e o ZIP
  sem a LaMa: os avisos, o PNG com o buraco transparente e as costas noutra foto
OK — as peças da camisa no navegador.
```

A primeira volta leva uns minutos: a LaMa abre (~13 s) e preenche as quatro peças.

Depois: `git checkout -- dist && git clean -fdq dist` (o `dist/` só entra na Task 8).

- [ ] **Step 12: commit**

```bash
git add src/api/extrator.ts src/motores/extratorTarefas.js src/telas/extrator/tipos.ts src/telas/extrator/trabalhador.ts src/telas/extrator/desenho.ts src/telas/extrator/usePecasDaCamisa.ts src/telas/extrator/PreviaDaPeca.tsx src/telas/extrator/PecasDaCamisa.tsx src/telas/Extrator.tsx bancada/extrator-tela-comum.cjs bancada/conferir-extrator-tela.cjs bancada/conferir-pecas-tela.cjs package.json
git commit -m "O Extrator ganha a aba Peças da camisa: as seis marcações na mesa, a medida de cada retângulo, a prévia com o que vai ser inventado, a LaMa preenchendo, e o PNG a 300 dpi e o ZIP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: mandar para o molde — os retângulos viram uma Estampa

**Files:**
- Create: `src/telas/extrator/paraOMolde.ts`
- Modify: `src/telas/extrator/usePecasDaCamisa.ts`, `src/telas/extrator/PecasDaCamisa.tsx`, `src/telas/Extrator.tsx`, `bancada/conferir-pecas-tela.cjs`

**Interfaces — Consumes:** `moldesApi.abrir`, `moldesApi.mandarArte(moldeId, papel, File)`, `moldesApi.guardarEstampa(moldeId, { id: null, nome, pecas })`, `moldesApi.estante` (`src/api/moldes.ts`); `ajusteNovo` (`src/motores/arteMolde.js`); `pngDa`, `arquivoDa`, `prontas`, `comCancelar` (Task 5).

**Interfaces — Produces:**
- `paraOMolde.mandarParaOMolde(moldeId, nome, artes: { papel, arquivo, png: Blob }[], aoAndar(texto)) → Promise<{ id, semPeca: string[] }>`
- `usePecasDaCamisa(...).mandarParaOMolde(moldeId, nome, aoFeito(semPeca))`
- `PecasDaCamisa` passa a receber `nomeDaFoto` (o nome de começo da Estampa).
- Ids: `#pecas-molde` (o `<select>`), `#pecas-estampa`, `#pecas-mandar`, `#pecas-mandado`.

- [ ] **Step 1: o teste na bancada de tela**

Em `bancada/conferir-pecas-tela.cjs`, no comentário do topo, a volta 1 passa a terminar em:

```js
 *      de cada peça na medida a 300 dpi e sem transparência, o ZIP com as
 *      quatro, e a Estampa criada num molde de teste (o molde não tem manga
 *      esquerda, e a tela avisa).
```

E em `comTudo`, a linha `    console.log('  o PNG na medida e o ZIP');` é trocada por:

```js
    // Mandar para o molde: um molde de teste sem manga esquerda.
    const peca = (papel) => ({ papel, tamanho: 'M', largura: 50, altura: 70, contorno: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 70 }, { x: 0, y: 70 }] });
    const criado = await (await fetch(`http://127.0.0.1:${s.porta}/api/moldes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Camisa de teste', pecas: [peca('frente'), peca('costas'), peca('manga direita')] }),
    })).json();
    await p.reload({ waitUntil: 'networkidle2' });
    await p.waitForSelector('#extrator-foto');
    await abrirACena(p, pasta);
    await marcarTudo(p);
    await medidasPequenas(p);
    await p.click('#pecas-montar');
    await p.waitForSelector('#pecas-molde', { timeout: 60000 });
    await p.select('#pecas-molde', String(criado.id));
    await digitar(p, '#pecas-estampa', 'Interclasse');
    await p.click('#pecas-mandar');
    await p.waitForSelector('#pecas-mandado', { timeout: 300000 });
    assert.match(await p.$eval('#pecas-mandado', (n) => n.textContent), /"Interclasse" foi para o molde\. O molde não tem peça "manga esquerda"/);
    const artes = await (await fetch(`http://127.0.0.1:${s.porta}/api/moldes/${criado.id}/artes`)).json();
    assert.equal(artes.length, 1);
    assert.deepEqual(artes[0].pecas.map((x) => x.papel).sort(), ['costas', 'frente', 'manga direita', 'manga esquerda']);
    console.log('  o PNG na medida, o ZIP e a Estampa no molde');
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npm run front && npm run bancada:pecas-tela`
Expected: FAIL na primeira volta, esperando `#pecas-molde` (o seletor não existe).

- [ ] **Step 3: a Estampa no molde — `src/telas/extrator/paraOMolde.ts`**

```ts
/**
 * "Mandar para o molde": os retângulos das peças da camisa viram uma Estampa
 * nova do molde escolhido, cada um no seu papel ("frente", "costas", "manga
 * esquerda", "manga direita"). Daí em diante é o caminho de sempre: a
 * Estampa encaixa a arte no contorno de cada tamanho e vai para o Encaixe.
 *
 * O PNG sobe em binário (`moldesApi.mandarArte`) e a Estampa é gravada com o
 * ajuste de começo (cobrir a peça), como a tela de Moldes faz com a arte nova.
 */
import { moldesApi } from "../../api/moldes";
import { ajusteNovo } from "../../motores/arteMolde";

export interface ArteDaPeca { papel: string; arquivo: string; png: Blob }

/**
 * Grava a Estampa e devolve o id dela e os papéis que o molde não tem: a arte
 * desses fica guardada na Estampa, mas não aparece em peça nenhuma.
 */
export async function mandarParaOMolde(
  moldeId: number, nome: string, artes: ArteDaPeca[], aoAndar: (texto: string) => void,
): Promise<{ id: number; semPeca: string[] }> {
  if (!nome.trim()) throw new Error("Dê um nome à estampa antes de mandar.");
  if (artes.length === 0) throw new Error("Não há peça pronta para mandar.");
  const molde = await moldesApi.abrir(moldeId);
  const papeisDoMolde = new Set(molde.pecas.map((p) => p.papel));
  const pecas = [];
  for (let i = 0; i < artes.length; i++) {
    const a = artes[i]!;
    aoAndar(`Subindo ${a.papel} (${i + 1} de ${artes.length})…`);
    const { arquivo } = await moldesApi.mandarArte(moldeId, a.papel, new File([a.png], a.arquivo, { type: "image/png" }));
    pecas.push({ papel: a.papel, arquivo, nomeOriginal: a.arquivo, ajuste: ajusteNovo() });
  }
  aoAndar("Gravando a estampa…");
  const { id } = await moldesApi.guardarEstampa(moldeId, { id: null, nome: nome.trim(), pecas });
  return { id, semPeca: artes.map((a) => a.papel).filter((p) => !papeisDoMolde.has(p)) };
}
```

- [ ] **Step 4: o gancho — `src/telas/extrator/usePecasDaCamisa.ts`**

Depois de `import { imagemDoBlob } from "./desenho";`:

```ts
import { mandarParaOMolde as gravarNoMolde } from "./paraOMolde";
```

E no `return`, depois do `baixarZip: … }),`:

```ts
    mandarParaOMolde: (moldeId: number, nome: string, aoFeito: (semPeca: string[]) => void) => comCancelar(async (sinal) => {
      const artes = [];
      for (const id of prontas()) {
        artes.push({ papel: PECAS.find((p) => p.id === id)!.papel, arquivo: arquivoDa(id), png: await pngDa(id, sinal) });
      }
      const { semPeca } = await gravarNoMolde(moldeId, nome, artes, setOcupado);
      aoFeito(semPeca);
    }),
```

- [ ] **Step 5: o painel — `src/telas/extrator/PecasDaCamisa.tsx`**

Os imports de cima ganham:

```tsx
import { useEffect, useState } from "react";
import { Botao } from "../../casca/Botao";
import { moldesApi, type MoldeNaEstante } from "../../api/moldes";
```

O começo do componente passa a ser:

```tsx
interface Props { p: EstadoDasPecas; nomeDaFoto: string }

export function PecasDaCamisa({ p, nomeDaFoto }: Props) {
  const [moldes, setMoldes] = useState<MoldeNaEstante[]>([]);
  const [moldeId, setMoldeId] = useState<number | null>(null);
  const [estampa, setEstampa] = useState("");
  const [mandado, setMandado] = useState("");

  useEffect(() => {
    moldesApi.estante().then(setMoldes).catch(() => setMoldes([]));
  }, []);
  useEffect(() => setEstampa(nomeDaFoto), [nomeDaFoto]);
```

E na última `<section>`, logo depois do botão `#pecas-zip`:

```tsx
          <h3 className="m-0 text-[0.85rem] font-semibold">Mandar para o molde</h3>
          <div className="flex flex-wrap items-center gap-2 text-[0.82rem]">
            <select id="pecas-molde" value={moldeId ?? ""} onChange={(e) => setMoldeId(Number(e.target.value) || null)}
              className="min-w-0 flex-1 rounded-md border border-linha bg-painel-suave px-2 py-1">
              <option value="">Escolha o molde…</option>
              {moldes.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <input id="pecas-estampa" value={estampa} onChange={(e) => setEstampa(e.target.value)} placeholder="Nome da estampa"
              className="min-w-0 flex-1 rounded-md border border-linha bg-painel-suave px-2 py-1" />
            <Botao id="pecas-mandar" jeito="primario" disabled={!moldeId || !estampa.trim() || ocupado}
              onClick={() => {
                setMandado("");
                void p.mandarParaOMolde(moldeId!, estampa, (semPeca) => setMandado(
                  `A estampa "${estampa.trim()}" foi para o molde.`
                  + (semPeca.length ? ` O molde não tem peça ${semPeca.map((s) => `"${s}"`).join(", ")}: essa arte fica guardada, mas não aparece.` : ""),
                ));
              }}>
              Mandar
            </Botao>
          </div>
          {mandado && <p id="pecas-mandado" className="m-0 text-[0.82rem] text-tinta-fraca">{mandado}</p>}
```

Em `src/telas/Extrator.tsx`:

```tsx
            <PecasDaCamisa p={pc} nomeDaFoto={x.nomeDaFoto} />
```

- [ ] **Step 6: rodar e ver passar**

Run: `npm run tipos && npm run front && npm run bancada:pecas-tela`
Expected:

```
  marcar, medir, montar e preencher as quatro peças
  o PNG na medida, o ZIP e a Estampa no molde
  sem a LaMa: os avisos, o PNG com o buraco transparente e as costas noutra foto
OK — as peças da camisa no navegador.
```

Depois: `git checkout -- dist && git clean -fdq dist`.

- [ ] **Step 7: commit**

```bash
git add src/telas/extrator/paraOMolde.ts src/telas/extrator/usePecasDaCamisa.ts src/telas/extrator/PecasDaCamisa.tsx src/telas/Extrator.tsx bancada/conferir-pecas-tela.cjs
git commit -m "As peças da camisa vão para o molde: os quatro retângulos viram uma Estampa nova, cada um no seu papel, e a tela avisa a peça que o molde não tem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: a análise com IA na tela — o botão, a lista por peça, as marcações e os elementos

**Files:**
- Create: `src/telas/extrator/AnaliseComIa.tsx`
- Modify: `src/api/extrator.ts`, `src/telas/extrator/useExtrator.ts`, `src/telas/extrator/desenho.ts`, `src/telas/extrator/MesaDoExtrator.tsx`, `src/telas/extrator/usePecasDaCamisa.ts`, `src/telas/Extrator.tsx`, `bancada/conferir-pecas-tela.cjs`

**Interfaces — Consumes:** `POST /api/extrator/analisar` e o `analise` do `/estado` (Task 4; com `OPTIMIZE_ANALISE_RESPOSTA` para a bancada); `trabalhador.recortar`; `usePecasDaCamisa` (Task 5).

**Interfaces — Produces:**
- `src/api/extrator.ts`: `EstadoDoExtrator.analise: string | null`; `type PecaDoElemento`, `interface ElementoDaAnalise`, `interface Analise`; `extratorApi.analisar(foto: Blob, sinal?) → Promise<Analise>` (manda `X-Optimize-Pedido: extrator`).
- `useExtrator()` ganha `mascaraDaCaixa(caixa) → Promise<Mascara>` (sem mexer nos cliques) e `acrescentar(recorte, nome?, jeito?)`.
- `desenho.miniaturaDaCaixa(trabalho, caixa, lado = 64) → string` (data URL).
- `MesaDoExtrator` ganha `caixasDaAnalise?: { caixa, rotulo }[]`.
- `usePecasDaCamisa(...).marcarDaAnalise(caixas: Partial<Record<IdDaMarcacao, CaixaDoClique>>) → Promise<void>`.
- Ids: `#analise`, `#analise-analisar`, `#analise-ocupado`, `#analise-resumo`, `#analise-item-<i>`, `#analise-marcar`, `#analise-extrair`.

- [ ] **Step 1: o teste na bancada de tela**

Em `bancada/conferir-pecas-tela.cjs`, o comentário do topo diz "Três voltas", e a volta 1 termina em "… esquerda, e a tela avisa). Sem chave, o botão da análise não aparece."; depois da volta 2 entra:

```js
 *   3. A análise com IA, com a resposta gravada (OPTIMIZE_ANALISE_RESPOSTA,
 *      sem internet): o botão aparece, a lista vem agrupada com o custo, as
 *      seis marcações são preenchidas, e os elementos marcados viram elementos.
```

Em `comTudo`, logo depois de `await abrirACena(p, pasta);`:

```js
    assert.equal(await p.$('#analise-analisar'), null, 'sem a chave, o botão da análise não aparece');
```

Antes de `async function principal() {`:

```js
async function comAnalise(navegador, pasta) {
  const fracao = (c) => ({ x0: Math.round((c[0] / 1600) * 1000), y0: Math.round((c[1] / 900) * 1000), x1: Math.round((c[2] / 1600) * 1000), y1: Math.round((c[3] / 900) * 1000) });
  const bruto = {
    peca: { tipo: 'camiseta manga curta', vistas: ['frente', 'costas'] },
    marcacoes: Object.entries(CAIXAS).map(([papel, c]) => ({ papel, caixa: fracao(c) })),
    elementos: [
      { peca: 'frente', nome: 'Logo', descricao: 'círculo azul', cores: ['#1f4fa3'], jeito: 'chapado', caixa: fracao([262, 292, 338, 368]) },
      { peca: 'costas', nome: 'Número', descricao: 'o 10 verde', cores: ['#1a8f3a'], jeito: 'chapado', caixa: fracao([1166, 346, 1274, 554]) },
    ],
  };
  const resposta = path.join(pasta, 'resposta.json');
  fs.writeFileSync(resposta, JSON.stringify({
    stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 2000 }, content: [{ type: 'text', text: JSON.stringify(bruto) }],
  }));
  const s = await subir({ OPTIMIZE_ANALISE_RESPOSTA: resposta });
  const problemas = [];
  try {
    const p = await abrirPagina(navegador, s.porta, problemas);
    await abrirACena(p, pasta);
    await p.click('#extrator-aba-elementos');
    await p.waitForSelector('#analise-analisar', { timeout: 10000 });
    await p.click('#analise-analisar');
    await p.waitForSelector('#analise-resumo', { timeout: 30000 });
    assert.match(await p.$eval('#analise-resumo', (n) => n.textContent), /camiseta manga curta.*Análise: US\$ 0\.05/);
    await p.click('#analise-extrair');
    await p.waitForFunction(() => document.querySelectorAll('#extrator-elementos li').length === 2, { timeout: 60000 });
    const nomes = await p.$$eval('#extrator-elementos li input', (is) => is.map((i) => i.value));
    assert.deepEqual(nomes, ['Logo', 'Número']);
    await p.click('#analise-marcar');
    await p.waitForSelector('#pecas-painel');
    await p.waitForFunction((ids) => ids.every((i) => document.querySelector(`#pecas-marcacao-${i}`)?.parentElement?.querySelector('[data-marcada]')?.dataset.marcada === 'sim'),
      { timeout: 60000 }, Object.keys(CAIXAS));
    assert.deepEqual(problemas, [], problemas.join('\n'));
    console.log('  a análise com IA (resposta gravada): a lista, o custo, os elementos e as seis marcações');
    await p.close();
  } finally {
    s.parar();
  }
}
```

E no `principal`, depois de `await semLama(navegador, pasta);`:

```js
    await comAnalise(navegador, pasta);
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npm run front && npm run bancada:pecas-tela`
Expected: as duas primeiras voltas passam, e a terceira FALHA esperando `#analise-analisar`.

- [ ] **Step 3: o cliente da API — `src/api/extrator.ts`**

No `EstadoDoExtrator`, depois do `preencher`:

```ts
  /** Por que a análise com IA não roda PARA ESTE COMPUTADOR, ou `null` (aí o botão aparece). */
  analise: string | null;
```

Depois do `type IdDaMarcacao`:

```ts
export type PecaDoElemento = "frente" | "costas" | "manga-esquerda" | "manga-direita";

export interface ElementoDaAnalise {
  peca: PecaDoElemento;
  nome: string;
  descricao: string;
  cores: string[];
  jeito: "chapado" | "foto";
  /** Em pixels da foto de trabalho. */
  caixa: CaixaDoClique;
}

export interface Analise {
  peca: { tipo: string; vistas: string[] };
  marcacoes: Partial<Record<IdDaMarcacao, CaixaDoClique>>;
  elementos: ElementoDaAnalise[];
  ignorados: number;
  /** Em US$. */
  custo: number;
}
```

E no `extratorApi`, depois do `preencher`:

```ts
  /**
   * A análise com IA: a foto de trabalho vai ao servidor, que a manda ao
   * Claude. O cabeçalho é a marca da tela (o servidor recusa sem ele).
   */
  async analisar(foto: Blob, sinal?: AbortSignal): Promise<Analise> {
    const r = await chamar("/api/extrator/analisar", {
      method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Optimize-Pedido": "extrator" }, body: foto, signal: sinal,
    });
    if (!r.ok) throw await falhou(r, "A análise com IA não respondeu.");
    return (await r.json()) as Analise;
  },
```

- [ ] **Step 4: a máscara de uma caixa e o jeito sugerido — `src/telas/extrator/useExtrator.ts`**

Antes de `/** Troca os cliques e pede a máscara deles. */`:

```ts
  /**
   * A máscara de uma caixa, sem mexer nos cliques da mesa: a análise com IA
   * pede uma por marcação e por elemento. A leitura vencida é refeita sozinha.
   */
  const mascaraDaCaixa = useCallback(async (c: CaixaDoClique): Promise<Mascara> => {
    const t = trabalhoAtual.current;
    if (!t) throw new Error("Abra uma foto primeiro.");
    let l = await lerNoServidor(t);
    let m: MascaraLida;
    try {
      m = await extratorApi.mascara(l.id, [], c);
    } catch (e) {
      if (!(e instanceof LeituraVencida)) throw e;
      l = await lerNoServidor(t, true);
      m = await extratorApi.mascara(l.id, [], c);
    }
    return { ...m, cobertura: coberturaDaMascara(m.alfa), pontos: 1 };
  }, [lerNoServidor]);
```

O começo do `acrescentar` (o comentário, a assinatura e o `const el`, até antes do `setElementos`) passa a ser:

```ts
  /** Um elemento novo na lista. O `jeito` vem da análise com IA quando ela sugeriu; senão, da conta da tinta. */
  const acrescentar = useCallback((r: Recorte, nome?: string, jeito?: Jeito) => {
    const id = proximoId.current++;
    const el: Elemento = {
      id, nome: nome || `Elemento ${id}`, recorte: r, miniatura: dataUrlDoRecorte(r, 96),
      jeito: jeito ?? (jeitoSugerido(r.rgba) as Jeito), cores: coresSugeridas(r.rgba), juntarSombras: 50, tamanho: { tipo: "4k" },
    };
```

E o `return` ganha `mascaraDaCaixa, acrescentar` no fim da segunda linha:

```ts
    setErro, setEscolhido, abrir, endireitar, clicar, passarCaixa, desfazerClique, limparCliques,
    guardar, guardarInteira, mudarElemento, removerElemento, mascaraDaCaixa, acrescentar,
```

- [ ] **Step 5: a miniatura da caixa — `src/telas/extrator/desenho.ts`**

O import dos tipos passa a ser `import type { CaixaDoClique, Imagem, Pixels, Recorte, Trabalho } from "./tipos";`, e antes de `/** O elemento em PNG (data URL), …`:

```ts
/** O pedaço da foto de trabalho dentro da caixa, em PNG (data URL): a miniatura da lista da análise. */
export function miniaturaDaCaixa(t: Trabalho, c: CaixaDoClique, lado = 64): string {
  const w = Math.max(1, c.x1 - c.x0), h = Math.max(1, c.y1 - c.y0);
  const k = Math.min(1, lado / Math.max(w, h));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(w * k));
  tela.height = Math.max(1, Math.round(h * k));
  const ctx = contexto(tela);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(t.bitmap, c.x0, c.y0, w, h, 0, 0, tela.width, tela.height);
  return tela.toDataURL("image/png");
}
```

- [ ] **Step 6: as caixas na mesa — `src/telas/extrator/MesaDoExtrator.tsx`**

No comentário do topo, a frase dos cliques termina em "… são arrastados no lugar. As caixas da análise com IA, quando há, aparecem numeradas por cima."

Na `interface Props`, depois de `desligada: boolean;`:

```tsx
  /** As caixas da análise com IA, com o número de cada uma na lista. */
  caixasDaAnalise?: { caixa: CaixaDoClique; rotulo: string }[];
```

A assinatura:

```tsx
export function MesaDoExtrator({
  trabalho, mascara, pontos, caixa, modo, cantos, aoMudarCantos, aoClicar, aoPassarCaixa, desligada, caixasDaAnalise = [],
}: Props) {
```

E no desenho, logo depois de `if (veu) ctx.drawImage(veu, 0, 0, trabalho.largura, trabalho.altura);`:

```tsx
      const [r, g, b] = corDoDestaque();
      for (const { caixa: c, rotulo } of caixasDaAnalise) {
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.strokeRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
        ctx.font = `bold ${13 * k}px sans-serif`;
        const w = ctx.measureText(rotulo).width + 8 * k;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(c.x0, c.y0, w, 18 * k);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(rotulo, c.x0 + 4 * k, c.y0 + 14 * k);
      }
```

- [ ] **Step 7: a análise — `src/telas/extrator/AnaliseComIa.tsx`**

```tsx
/**
 * A ANÁLISE COM IA — o Claude acha e descreve as peças e os elementos.
 *
 * Só aparece quando o servidor diz que pode (`estado.analise` nulo: há chave,
 * o pedido vem do computador do servidor e a conta está entrada). O botão diz
 * que a foto vai para a Anthropic: é a única coisa do Extrator que sai do
 * computador, e só quando o operador aperta.
 *
 * O que volta é conferido pelo operador, como no concorrente: a lista
 * agrupada por peça, cada item com a miniatura e desmarcável. Daqui saem duas
 * ações — preencher as seis marcações do modo "Peças da camisa", e extrair os
 * elementos marcados para a lista do Extrator (cada caixa vira máscara pela
 * rede de recorte local).
 */
import { useEffect, useState } from "react";
import { Botao } from "../../casca/Botao";
import { Icone } from "../../casca/Icone";
import { extratorApi, type Analise, type IdDaMarcacao, type PecaDoElemento } from "../../api/extrator";
import { miniaturaDaCaixa } from "./desenho";
import { trabalhador } from "./trabalhador";
import type { CaixaDoClique } from "./tipos";
import type { Extrator } from "./useExtrator";

const GRUPOS: { peca: PecaDoElemento; nome: string }[] = [
  { peca: "frente", nome: "Corpo frente" },
  { peca: "costas", nome: "Corpo costas" },
  { peca: "manga-esquerda", nome: "Manga esquerda" },
  { peca: "manga-direita", nome: "Manga direita" },
];

interface Props {
  x: Extrator;
  aoMarcar: (caixas: Partial<Record<IdDaMarcacao, CaixaDoClique>>) => void;
  /** As caixas dos elementos marcados, numeradas como na lista, para a mesa desenhar. */
  aoMostrar: (caixas: { caixa: CaixaDoClique; rotulo: string }[]) => void;
}

export function AnaliseComIa({ x, aoMarcar, aoMostrar }: Props) {
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [ocupado, setOcupado] = useState("");

  // Foto nova: a análise da anterior não vale mais.
  useEffect(() => { setAnalise(null); }, [x.trabalho]);
  useEffect(() => {
    aoMostrar(analise ? analise.elementos.flatMap((e, i) => (marcados.has(i) ? [{ caixa: e.caixa, rotulo: String(i + 1) }] : [])) : []);
  }, [analise, marcados, aoMostrar]);

  if (!x.trabalho || !x.estado || x.estado.analise !== null) return null;
  const t = x.trabalho;

  const analisar = async () => {
    x.setErro(null);
    setOcupado("Analisando com IA…");
    try {
      const a = await extratorApi.analisar(t.jpeg);
      setAnalise(a);
      setMarcados(new Set(a.elementos.map((_, i) => i)));
    } catch (e) {
      x.setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  };

  const extrair = async () => {
    if (!analise || !x.foto) return;
    x.setErro(null);
    try {
      let feitos = 0;
      for (const [i, e] of analise.elementos.entries()) {
        if (!marcados.has(i)) continue;
        setOcupado(`Extraindo ${e.nome} (${++feitos} de ${marcados.size})…`);
        const m = await x.mascaraDaCaixa(e.caixa);
        const r = await trabalhador.recortar(x.foto, m.alfa, m.largura, m.altura);
        if (r) x.acrescentar(r, e.nome, e.jeito);
      }
    } catch (e) {
      x.setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  };

  const alternar = (i: number) => setMarcados((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });

  return (
    <div id="analise" className="flex flex-col gap-2 rounded-[10px] border border-linha p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Botao id="analise-analisar" jeito="secundario" disabled={Boolean(ocupado) || Boolean(x.ocupado)} onClick={() => void analisar()}
          icone={<Icone referencia="icones.svg#wand-sparkles" className="size-4" />}>
          Analisar com IA
        </Botao>
        <span className="text-[0.78rem] text-tinta-fraca">manda a foto para a IA da Anthropic</span>
        {ocupado && <span id="analise-ocupado" className="text-[0.82rem] text-tinta-fraca">{ocupado}</span>}
      </div>

      {analise && (
        <>
          <p id="analise-resumo" className="m-0 text-[0.82rem]">
            <strong>{analise.peca.tipo || "Peça"}</strong>
            {analise.peca.vistas.length > 0 && ` · ${analise.peca.vistas.join(", ")}`}
            <span className="text-tinta-fraca"> · Análise: US$ {analise.custo.toFixed(2)}</span>
            {analise.ignorados > 0 && (
              <span className="text-tinta-fraca"> · {analise.ignorados} {analise.ignorados === 1 ? "item da análise foi ignorado" : "itens da análise foram ignorados"}</span>
            )}
          </p>
          {GRUPOS.map((g) => {
            const itens = analise.elementos.map((e, i) => ({ e, i })).filter(({ e }) => e.peca === g.peca);
            if (itens.length === 0) return null;
            return (
              <div key={g.peca} className="flex flex-col gap-1">
                <h4 className="m-0 text-[0.8rem] font-semibold text-tinta-fraca">{g.nome}</h4>
                {itens.map(({ e, i }) => (
                  <label key={i} className="flex items-center gap-2 text-[0.82rem]">
                    <input id={`analise-item-${i}`} type="checkbox" checked={marcados.has(i)} onChange={() => alternar(i)} />
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] text-tinta-apagada">{i + 1}</span>
                    <img src={miniaturaDaCaixa(t, e.caixa)} alt="" className="size-10 shrink-0 rounded border border-linha object-contain" />
                    <span className="min-w-0 flex-1">
                      <strong>{e.nome}</strong> <span className="text-tinta-fraca">— {e.descricao}</span>
                    </span>
                    <span className="flex gap-0.5">
                      {e.cores.map((c) => <span key={c} title={c} className="size-3 rounded-full border border-linha" style={{ background: c }} />)}
                    </span>
                    <span className="font-mono text-[11px] text-tinta-apagada">{e.jeito}</span>
                  </label>
                ))}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Botao id="analise-marcar" tamanho="pequeno" jeito="secundario" disabled={Object.keys(analise.marcacoes).length === 0 || Boolean(ocupado)}
              onClick={() => aoMarcar(analise.marcacoes)}>
              Preencher as marcações das peças
            </Botao>
            <Botao id="analise-extrair" tamanho="pequeno" jeito="primario" disabled={marcados.size === 0 || Boolean(ocupado)} onClick={() => void extrair()}>
              Extrair os marcados
            </Botao>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: as marcações que a IA achou — `src/telas/extrator/usePecasDaCamisa.ts`**

O import dos tipos passa a ter `CaixaDoClique`:

```ts
import type { Ajuste, CaixaDoClique, IdDaPeca, Imagem, Mascara, Montada, Recorte } from "./tipos";
```

Antes de `/** O recorte limpo de uma marcação: …`:

```ts
  /** As caixas da análise com IA viram marcações (cada uma, máscara pela rede de recorte local). */
  const marcarDaAnalise = useCallback(async (caixas: Partial<Record<IdDaMarcacao, CaixaDoClique>>) => {
    const foto = x.foto;
    if (!foto) return;
    setOcupado("Marcando as peças que a IA achou…");
    try {
      for (const c of MARCACOES) {
        const caixa = caixas[c.id as IdDaMarcacao];
        if (caixa) guardarMarcacao(c.id as IdDaMarcacao, { mascara: await x.mascaraDaCaixa(caixa), foto });
      }
    } catch (e) {
      x.setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }, [x, guardarMarcacao]);
```

E no `return`: `usarMascara, marcarDaAnalise, apagarMarcacao: (id: IdDaMarcacao) => guardarMarcacao(id, null),`.

- [ ] **Step 9: a tela — `src/telas/Extrator.tsx`**

Os imports: `useCallback` entra no do React; `import { AnaliseComIa } from "./extrator/AnaliseComIa";` entra antes do `arquivos`; o dos tipos passa a ser `import type { CaixaDoClique, Ponto } from "./extrator/tipos";`.

Logo depois de `const [aba, setAba] = …`:

```tsx
  const [caixasDaAnalise, setCaixasDaAnalise] = useState<{ caixa: CaixaDoClique; rotulo: string }[]>([]);
  const mostrarCaixas = useCallback((c: { caixa: CaixaDoClique; rotulo: string }[]) => setCaixasDaAnalise(c), []);
```

Na `<MesaDoExtrator …>`, depois de `desligada={…}`:

```tsx
                caixasDaAnalise={aba === "elementos" ? caixasDaAnalise : []}
```

E logo depois do `</div>` que fecha a fileira de botões da mesa (o que vem depois do `Cancelar` dos cantos):

```tsx
              <AnaliseComIa x={x} aoMostrar={mostrarCaixas} aoMarcar={(caixas) => { setAba("pecas"); void pc.marcarDaAnalise(caixas); }} />
```

- [ ] **Step 10: rodar e ver passar**

Run: `npm run tipos && npm run bancada:pecas && npm run front && npm run bancada:pecas-tela && npm run bancada:extrator-tela`
Expected:

```
  marcar, medir, montar e preencher as quatro peças
  o PNG na medida, o ZIP e a Estampa no molde
  sem a LaMa: os avisos, o PNG com o buraco transparente e as costas noutra foto
  a análise com IA (resposta gravada): a lista, o custo, os elementos e as seis marcações
OK — as peças da camisa no navegador.
```

e `OK — o Extrator no navegador.`

Depois: `git checkout -- dist && git clean -fdq dist`.

- [ ] **Step 11: commit**

```bash
git add src/api/extrator.ts src/telas/extrator/useExtrator.ts src/telas/extrator/desenho.ts src/telas/extrator/MesaDoExtrator.tsx src/telas/extrator/AnaliseComIa.tsx src/telas/extrator/usePecasDaCamisa.ts src/telas/Extrator.tsx bancada/conferir-pecas-tela.cjs
git commit -m "A tela do Extrator ganha o Analisar com IA: a lista por peça com as caixas na mesa e o custo, as marcações das peças preenchidas e os elementos marcados extraídos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: o mapa e o build

**Files:**
- Modify: `docs/MAPA.md`, `dist/`

- [ ] **Step 1: a linha do Extrator no mapa — `docs/MAPA.md`**

A linha que começa com `| **Extrator** |` passa a ser:

```markdown
| **Extrator** | A foto da camisa (ou o mockup) vira cada logo, texto e estampa separados: o clique acha o elemento com a rede de recorte (família Segment Anything, no servidor), o jeito Chapado sai em SVG, EPS e PNG de 4K pelo `vetor.js` da antiga tela Vetor, e o jeito Foto amplia com o Real-ESRGAN da antiga tela Imagem. A aba **Peças da camisa** transforma o mockup no retângulo cheio da frente, das costas e de cada manga, na medida digitada: sem deformar, sem a sombra, com a LaMa (no servidor) inventando o que a foto não tem, e daí para o PNG a 300 dpi ou a Estampa de um molde. Tudo no computador, menos o **Analisar com IA** (opcional, só no computador do servidor e com a chave da Anthropic): o Claude acha e descreve as peças e os elementos, e o recorte continua local. | `src/telas/Extrator.tsx` + `src/telas/extrator/`, `src/api/extrator.ts`, `src/motores/{extrator,perspectiva,recorte,vetor,vetorParaArquivo,pecasDaCamisa,extratorTarefas,extratorWorker}.js`, `servidor/extrator-{api,rede,ampliar,preencher,fila,analise}.js` |
```

- [ ] **Step 2: o build**

Run: `npm run front`
Expected: `✓ built in …`, e `dist/carimbo.json` com o carimbo deste `src/`.

- [ ] **Step 3: a conferência final**

Run: `npm run tipos && npm run bancada:pecas && npm run bancada:extrator && npm run bancada:pecas-rede && npm run bancada:pecas-tela && npm run bancada:extrator-tela`
Expected: todos os `OK`, com o `dist/` que acabou de ser compilado.

- [ ] **Step 4: commits — o mapa, e o build separado (como em 45f9c3c e 9343b5f)**

```bash
git add docs/MAPA.md
git commit -m "O mapa ganha as peças da camisa e a análise com IA na linha do Extrator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add -A dist
git commit -m "Build da tela com as peças da camisa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Sem push: a `Guilherme` fica local até a pessoa decidir.
