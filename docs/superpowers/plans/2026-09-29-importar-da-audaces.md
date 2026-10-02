# Importar da Audaces (parte 1: tamanhos com cor, e o formato .ads) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O molde passa a ter uma grade de tamanhos com cor, a Montagem edita peça por peça com os tamanhos em camadas e junta outro molde como um tamanho novo, e o `.ads` da Audaces fica decifrado e documentado, com o cabeçalho, as fichas das peças e a tabela de tamanhos já lidos.

**Architecture:** O banco ganha `molde_tamanhos` e a coluna `molde_pecas.grupo` (uma linha continua sendo uma peça num tamanho). As contas de tamanho — paleta, grupos, dados comuns gravados no grupo inteiro, casamento de peças para juntar — moram num motor puro, `src/motores/tamanhos.js`; a Montagem só liga. O `.ads` tem um leitor parcial (`src/motores/audacesAds.js`) para o que está confirmado e um documento do formato (`docs/formatos/audaces-ads.md`) que cresce com a sondagem.

**Tech Stack:** Express + better-sqlite3 (servidor), React 19 + TypeScript (tela), JavaScript ESM puro (motores), Node 24 + `node:assert` (bancadas), esbuild (`bancada/carregarModulo.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-28-importar-da-audaces-design.md`

**Escopo deste plano:** as entregas 1 (tamanhos com cor e juntar) e o começo da 2 (o que do `.ads` já está confirmado, e a sondagem que documenta o resto). O leitor completo do `.ads` (desenho de cada tamanho, piques, fio) e o leitor DXF-AAMA ganham planos próprios quando o documento do formato estiver fechado e os DXF da fábrica chegarem — a Task 8 termina entregando o material para esse plano.

## Global Constraints

- Nenhuma dependência nova.
- `molde_pecas` continua **uma linha por peça por tamanho**; `grupo` diz quais linhas são a mesma peça. Encaixe, estampas e PDF não mudam de contrato.
- Nome, papel, quantidade, `marcacoes.espelhar` e `marcacoes.margem` são **comuns ao grupo**: toda mudança deles grava o mesmo valor em todas as linhas do grupo. Nós, piques, pontos e fio são **por tamanho**.
- Molde sem linhas em `molde_tamanhos` continua abrindo: tamanhos saem das peças, cores da paleta padrão.
- O servidor só troca `molde_tamanhos` quando o pedido traz `tamanhos` (array); sem o campo, mantém os que estão.
- Cor sempre `#rrggbb` minúsculo.
- Os arquivos `.ads` da fábrica não entram no git. A bancada lê de `OPTMIZE_ARQUIVOS_AUDACES` (padrão `D:\uso de teste`) e pula com aviso o que não achar.
- O leitor do `.ads` só usa campo registrado em `docs/formatos/audaces-ads.md`; versão diferente de `CADZ vs6.0` é recusada com aviso.
- Código, nomes, comentários e mensagens em português, no tom dos arquivos vizinhos.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Molde antigo sem grupo nem tamanhos** (todos os que existem hoje): tem de abrir na Montagem igual a antes, com os grupos deduzidos pela posição dentro do tamanho — pinado na Task 2 (`completarGrupos`) e na Task 1 (servidor sem `molde_tamanhos`).
2. **Editar pelo passo a passo antigo um molde com tamanhos**: não pode apagar a grade nem os grupos — pinado na Task 1 (PUT sem `tamanhos` mantém) e na Task 6 (o editor devolve `grupo`).
3. **Apagar uma peça com três tamanhos**: some o grupo inteiro, não só o tamanho à mostra — pinado na Task 4.
4. **Juntar com peças de nome diferente e fora de ordem** (os pijamas M e G): o casamento sugere pelo nome parecido e a pessoa confirma; peça sem par não entra calada — pinado na Task 2 (`casarPecasParaJuntar` com os nomes reais dos pijamas) e na Task 5.
5. **`.ads` de outra versão ou com contagem de peças que não bate**: recusa ou avisa, nunca lê pela metade calado — pinado na Task 7.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `servidor/db.js` | tabela `molde_tamanhos`, coluna `molde_pecas.grupo` |
| `servidor/moldes-pecas.js` | `arrumarTamanhos`, `grupo` em `arrumarPeca` |
| `servidor/moldes-api.js` | GET/POST/PUT levam e trazem `tamanhos` e `grupo`; resumo da estante com cores |
| `src/motores/tamanhos.js` (novo) | paleta, tamanhos do molde, grupos, dados comuns, casamento e junção |
| `src/api/moldes.ts` | tipos `TamanhoDoMolde`, `grupo`, `tamanhos` |
| `src/telas/montagem/useMoldeEmMontagem.ts` | carrega e grava `tamanhos`; completa grupos |
| `src/telas/montagem/MesaDeMontagem.tsx` | tamanho ativo, chips, "Ver tamanhos", mudanças no grupo |
| `src/telas/montagem/ChipsDeTamanho.tsx` (novo) | os chips coloridos |
| `src/telas/montagem/ListaDePecas.tsx` | uma linha por grupo; apagar o grupo; juntar como tamanho |
| `src/telas/montagem/CasamentoDePecas.tsx` (novo) | a tabela de casamento da junção |
| `src/telas/montagem/Mesa.tsx` | camadas dos outros tamanhos |
| `src/telas/montagem/PainelDaPeca.tsx` | dados comuns vão ao grupo |
| `src/telas/montagem/BarraDaMontagem.tsx` | PDF/SVG do tamanho ou de todos |
| `src/telas/moldes/EditorDeMolde.tsx`, `vocabulario.ts` | o passo a passo antigo carrega `grupo` |
| `src/telas/Moldes.tsx` | chips coloridos na estante |
| `src/motores/audacesAds.js` (novo) | cabeçalho, fichas das peças, tabela de tamanhos |
| `docs/formatos/audaces-ads.md` (novo) | o formato, campo a campo |
| `bancada/conferir-tamanhos.mjs` (novo), `bancada/conferir-audaces.mjs` (novo), `bancada/audaces/sondar.mjs` (novo) | bancadas e a sonda |

---

### Task 1: O servidor guarda a grade de tamanhos e o grupo de cada peça

**Files:**
- Modify: `servidor/db.js` (depois das colunas da Montagem, ~linha 489)
- Modify: `servidor/moldes-pecas.js`
- Modify: `servidor/moldes-api.js` (GET `/`, GET `/:id`, POST `/`, PUT `/:id`)
- Modify: `bancada/conferir-moldes-pecas.cjs`

**Interfaces:**
- Produces: `arrumarTamanhos(brutos) → { nome, cor, ordem, base }[] | null` (`null` quando `brutos` não é array — o PUT então mantém os guardados); `arrumarPeca` passa a devolver `grupo: number | null`.
- Produces (API): `GET /api/moldes/:id` → `{ ..., tamanhos: { nome, cor, ordem, base: boolean }[] }`; `GET /api/moldes` → cada item ganha `cores: Record<string, string>`.

- [ ] **Step 1: Os casos que falham**

Antes do `console.log` final de `bancada/conferir-moldes-pecas.cjs`:

```js
// 6. Tamanhos: nome limpo, cor #rrggbb minúscula, um base só, sem repetir.
{
  const { arrumarTamanhos } = require("../servidor/moldes-pecas");
  const t = arrumarTamanhos([
    { nome: " P ", cor: "#FF0000", base: false },
    { nome: "M", cor: "00ffff", base: true },
    { nome: "M", cor: "#123456" },
    { nome: "G", cor: "laranja", base: true },
    { nome: "", cor: "#000000" },
  ]);
  assert.deepEqual(t.map((x) => x.nome), ["P", "M", "G"]);
  assert.equal(t[0].cor, "#ff0000");
  assert.equal(t[1].cor, "#00ffff");
  assert.equal(t[2].cor, null, "cor que não é #rrggbb vira null (a tela usa a paleta)");
  assert.deepEqual(t.map((x) => x.base), [false, true, false], "só o primeiro base vale");
  assert.deepEqual(t.map((x) => x.ordem), [0, 1, 2]);
  assert.equal(arrumarTamanhos(undefined), null, "sem o campo: o PUT mantém os guardados");
}

// 7. Grupo: inteiro ≥ 0 ou null.
{
  assert.equal(arrumarPeca({ contorno: quadrado, grupo: 3 }, 0).grupo, 3);
  assert.equal(arrumarPeca({ contorno: quadrado, grupo: "x" }, 0).grupo, null);
  assert.equal(arrumarPeca({ contorno: quadrado }, 0).grupo, null);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:moldes-pecas`
Expected: FAIL (`arrumarTamanhos is not a function`).

- [ ] **Step 3: `moldes-pecas.js`**

Em `arrumarPeca`, no objeto devolvido, depois de `ordem,`:

```js
    grupo: Number.isInteger(Number(bruta.grupo)) && Number(bruta.grupo) >= 0 && bruta.grupo !== null && bruta.grupo !== ""
      ? Number(bruta.grupo) : null,
```

E a função nova, antes do `module.exports` (que passa a exportar `arrumarTamanhos`):

```js
/**
 * A grade de tamanhos que chegou da tela. `null` quando não veio nada — é o
 * sinal para o PUT MANTER a grade guardada: o passo a passo antigo regrava as
 * peças sem saber de tamanhos com cor, e não pode apagá-los.
 */
function arrumarTamanhos(brutos) {
  if (!Array.isArray(brutos)) return null;
  const vistos = new Set();
  let temBase = false;
  const saida = [];
  for (const b of brutos) {
    const nome = String((b && b.nome) || "").trim();
    if (!nome || vistos.has(nome)) continue;
    vistos.add(nome);
    const cru = String((b && b.cor) || "").trim().toLowerCase();
    const hex = cru.startsWith("#") ? cru : `#${cru}`;
    const base = !!(b && b.base) && !temBase;
    if (base) temBase = true;
    saida.push({ nome, cor: /^#[0-9a-f]{6}$/.test(hex) ? hex : null, ordem: saida.length, base });
  }
  return saida;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:moldes-pecas`
Expected: OK.

- [ ] **Step 5: Banco e API**

Em `servidor/db.js`, depois de `garantirColuna("molde_pecas", "marcacoes", "TEXT");`:

```js
// Importar da Audaces (docs/superpowers/specs/2026-09-28-importar-da-audaces-design.md):
// a grade de tamanhos do molde, com a cor em que a Audaces desenha cada um, e
// o GRUPO de cada peça — as linhas com o mesmo grupo são a mesma peça em
// tamanhos diferentes. Molde sem linhas aqui continua valendo: os tamanhos
// saem das peças, como sempre.
db.exec(`
  CREATE TABLE IF NOT EXISTS molde_tamanhos (
    molde_id INTEGER NOT NULL REFERENCES moldes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cor TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    base INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (molde_id, nome)
  );
`);
garantirColuna("molde_pecas", "grupo", "INTEGER");
```

Em `servidor/moldes-api.js`:

1. Import: `const { PAPEIS, arrumarPeca, arrumarTamanhos, lerSituacao, pecaDoBanco } = require("./moldes-pecas");`
2. Helpers depois de `pecasDoMolde`:

```js
function tamanhosDoMolde(moldeId) {
  return db.prepare("SELECT nome, cor, ordem, base FROM molde_tamanhos WHERE molde_id = ? ORDER BY ordem")
    .all(moldeId).map((t) => ({ ...t, base: !!t.base }));
}

function gravarTamanhos(moldeId, tamanhos) {
  db.prepare("DELETE FROM molde_tamanhos WHERE molde_id = ?").run(moldeId);
  const inserir = db.prepare("INSERT INTO molde_tamanhos (molde_id, nome, cor, ordem, base) VALUES (?, ?, ?, ?, ?)");
  for (const t of tamanhos) inserir.run(moldeId, t.nome, t.cor, t.ordem, t.base ? 1 : 0);
}
```

3. `GET /:id`: `res.json({ ...molde, pecas: pecasDoMolde(molde.id), tamanhos: tamanhosDoMolde(molde.id), artes: artesDoMolde(molde.id) });`
4. `GET /`: no `map` do resumo, acrescentar `cores: Object.fromEntries(tamanhosDoMolde(m.id).filter((t) => t.cor).map((t) => [t.nome, t.cor])),`.
5. Nos dois `INSERT INTO molde_pecas` (POST e PUT), acrescentar `grupo` à lista de colunas e `@grupo` aos valores.
6. POST: dentro da transação, depois de inserir as peças: `const tamanhos = arrumarTamanhos(req.body.tamanhos); if (tamanhos) gravarTamanhos(info.lastInsertRowid, tamanhos);`
7. PUT: dentro da transação, depois de inserir as peças: `const tamanhos = arrumarTamanhos(req.body.tamanhos); if (tamanhos) gravarTamanhos(molde.id, tamanhos);`

- [ ] **Step 6: Conferir de ponta a ponta no servidor**

Subir com uma cópia do banco e a sessão SEM tokens (ver a nota no fim do plano) e, com `curl`:

```bash
curl -s -X POST localhost:8765/api/moldes -H "Content-Type: application/json" -d '{"nome":"T","pecas":[{"tamanho":"P","papel":"frente","grupo":0,"contorno":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]}],"tamanhos":[{"nome":"P","cor":"#ff0000","base":true}]}'
curl -s localhost:8765/api/moldes/<id>        # tamanhos: [{nome:"P",cor:"#ff0000",ordem:0,base:true}], pecas[0].grupo = 0
curl -s -X PUT localhost:8765/api/moldes/<id> -H "Content-Type: application/json" -d '{"nome":"T","pecas":[{"tamanho":"P","papel":"frente","contorno":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]}]}'
curl -s localhost:8765/api/moldes/<id>        # tamanhos continuam lá (PUT sem o campo)
```

- [ ] **Step 7: Commit**

```bash
git add servidor/db.js servidor/moldes-pecas.js servidor/moldes-api.js bancada/conferir-moldes-pecas.cjs
git commit -m "O molde guarda a grade de tamanhos com cor, e cada peça o seu grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: O motor dos tamanhos

**Files:**
- Create: `src/motores/tamanhos.js`
- Create: `bancada/conferir-tamanhos.mjs`
- Modify: `package.json` (`"bancada:tamanhos": "node bancada/conferir-tamanhos.mjs",`)
- Modify: `.github/workflows/conferir.yml` (passo novo)

**Interfaces:**
- Produces (todas puras, nunca alteram o que recebem):
  - `PALETA: string[]` — cores `#rrggbb` para tamanho sem cor.
  - `tamanhosDoMolde(pecas: {tamanho}[], guardados: {nome,cor,ordem,base}[]) → { nome, cor, ordem, base }[]` — os guardados na ordem deles, mais os tamanhos que só aparecem nas peças; cor faltando sai da `PALETA`; exatamente um `base` (o marcado, ou o primeiro).
  - `completarGrupos(pecas) → pecas` — peça com `grupo` null/undefined ganha a posição dela dentro do seu tamanho (pela `ordem`, depois pela posição na lista).
  - `gruposDasPecas(pecas) → { grupo: number, porTamanho: Record<string, number> }[]` — `porTamanho[t]` é o índice na lista `pecas`; em ordem de grupo.
  - `CAMPOS_COMUNS = ["papel", "nome", "quantidade"]` e `aplicarNoGrupo(pecas, grupo, mudar: (peca) => peca) → pecas` — aplica `mudar` a todas as peças do grupo.
  - `comunsDoGrupo(pecaQueMudou) → (outra) => outra` — copia os campos comuns e `marcacoes.espelhar`/`marcacoes.margem` de uma peça para outra.
  - `normalizarNomeDePeca(nome) → string` — sem acento, maiúsculo, sem o sufixo de quantidade ("2X"), espaços simples.
  - `casarPecasParaJuntar(daqui: {grupo, nome, papel, largura, altura}[], dela: {nome, papel, largura, altura}[]) → { grupo: number, indiceDela: number | null, certeza: number }[]` — um par sugerido por grupo daqui, sem repetir peça de lá.
  - `juntarComoTamanho(pecas, dela, pares: {grupo, indiceDela}[], tamanho: string) → pecas` — acrescenta as peças de lá no tamanho novo, no grupo do par, com os campos comuns do grupo daqui.

- [ ] **Step 1: A bancada que falha**

`bancada/conferir-tamanhos.mjs`:

```js
/*
 * BANCADA — os tamanhos do molde
 *
 *     npm run bancada:tamanhos
 *
 * Roda no CI. O caso que mais importa é o dos pijamas: dois arquivos da
 * Audaces, M e G, com as peças em outra ordem e com nomes diferentes — o
 * casamento tem de sugerir o par certo, e a pessoa confirma.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const t = await carregarModulo("src/motores/tamanhos.js");
const peca = (tamanho, nome, extra = {}) => ({
  tamanho, nome, papel: "outro", quantidade: 1, largura: 10, altura: 10,
  nos: [], marcacoes: { margem: 0, espelhar: false, fio: { x: 0, y: 0, angulo: 0, comprimento: 0 }, piques: [], pontos: [] },
  ...extra,
});

// 1. Tamanhos: guardados na ordem deles, mais os que só existem nas peças, com cor da paleta.
{
  const r = t.tamanhosDoMolde(
    [peca("P", "A"), peca("M", "A"), peca("GG", "A")],
    [{ nome: "M", cor: "#00ffff", ordem: 0, base: false }, { nome: "P", cor: null, ordem: 1, base: false }],
  );
  assert.deepEqual(r.map((x) => x.nome), ["M", "P", "GG"]);
  assert.equal(r[0].cor, "#00ffff");
  assert.ok(/^#[0-9a-f]{6}$/.test(r[1].cor) && /^#[0-9a-f]{6}$/.test(r[2].cor), "sem cor: paleta");
  assert.equal(r.filter((x) => x.base).length, 1, "exatamente um base");
  assert.equal(r[0].base, true, "sem base marcado, o primeiro");
}

// 2. Molde antigo: grupo pela posição dentro do tamanho.
{
  const r = t.completarGrupos([peca("P", "FRENTE"), peca("P", "COSTAS"), peca("G", "FRENTE"), peca("G", "COSTAS")]);
  assert.deepEqual(r.map((p) => p.grupo), [0, 1, 0, 1]);
  const g = t.gruposDasPecas(r);
  assert.deepEqual(g, [{ grupo: 0, porTamanho: { P: 0, G: 2 } }, { grupo: 1, porTamanho: { P: 1, G: 3 } }]);
}

// 3. Dados comuns vão ao grupo inteiro; o desenho não.
{
  const pecas = t.completarGrupos([peca("P", "FRENTE"), peca("G", "FRENTE"), peca("P", "COSTAS")]);
  const mudada = { ...pecas[0], quantidade: 3, marcacoes: { ...pecas[0].marcacoes, margem: 1, espelhar: true, piques: [{ no: 0, t: 0.5, profundidade: 0.5 }] } };
  const r = t.aplicarNoGrupo(pecas, 0, t.comunsDoGrupo(mudada));
  assert.equal(r[1].quantidade, 3);
  assert.equal(r[1].marcacoes.margem, 1);
  assert.equal(r[1].marcacoes.espelhar, true);
  assert.deepEqual(r[1].marcacoes.piques, [], "piques são por tamanho");
  assert.equal(r[2].quantidade, 1, "outro grupo não muda");
  assert.equal(pecas[1].quantidade, 1, "não mexe na lista recebida");
}

// 4. Nomes: sem acento, sem "2X", maiúsculo.
assert.equal(t.normalizarNomeDePeca("  Cós 1x "), "COS");
assert.equal(t.normalizarNomeDePeca("BERMUDA  MASC. 2X"), "BERMUDA MASC.");

// 5. Os pijamas de verdade: M daqui, G de lá, outra ordem e nomes diferentes.
{
  const nomesM = ["FRENTE 2X", "COSTA 1X", "BERMUDA FEM. 2X", "BERMUDA MASC. 2X", "MANGA 2X", "PALA SHORT 2X", "PALA MG 2X", "PALA BLUSA 1X"];
  const nomesG = ["BERMUDA FEM. 2X", "MANGA 2X", "FRENTE 2X", "COSTA 1X", "BEMUDA MASC. 2X", "PALA 2X", "PALA MANGA 2X", "PALA BLUSA 1X"];
  const daqui = nomesM.map((nome, grupo) => ({ grupo, nome, papel: "outro", largura: 20 + grupo, altura: 30 }));
  const dela = nomesG.map((nome) => ({ nome, papel: "outro", largura: 20 + nomesM.findIndex((m) => t.normalizarNomeDePeca(m).slice(0, 4) === t.normalizarNomeDePeca(nome).slice(0, 4)), altura: 31 }));
  const pares = t.casarPecasParaJuntar(daqui, dela);
  const nomeDe = (i) => (i === null ? null : nomesG[i]);
  assert.equal(nomeDe(pares[0].indiceDela), "FRENTE 2X");
  assert.equal(nomeDe(pares[3].indiceDela), "BEMUDA MASC. 2X", "erro de digitação casa");
  assert.equal(nomeDe(pares[7].indiceDela), "PALA BLUSA 1X");
  assert.equal(new Set(pares.map((p) => p.indiceDela).filter((i) => i !== null)).size,
    pares.filter((p) => p.indiceDela !== null).length, "peça de lá não é usada duas vezes");
}

// 6. Juntar como tamanho: peça de lá entra no grupo do par, com os dados comuns daqui.
{
  const pecas = t.completarGrupos([peca("M", "FRENTE", { quantidade: 2, papel: "frente" })]);
  const r = t.juntarComoTamanho(pecas, [peca("X", "FRENTE 2X", { largura: 12 })], [{ grupo: 0, indiceDela: 0 }], "G");
  assert.equal(r.length, 2);
  assert.equal(r[1].tamanho, "G");
  assert.equal(r[1].grupo, 0);
  assert.equal(r[1].papel, "frente");
  assert.equal(r[1].quantidade, 2);
  assert.equal(r[1].largura, 12, "o desenho é o de lá");
  assert.equal(r[1].id, undefined, "peça nova, sem id do outro molde");
}

console.log("OK — os tamanhos do molde conferem.");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run bancada:tamanhos`
Expected: FAIL ao carregar `src/motores/tamanhos.js`.

- [ ] **Step 3: `src/motores/tamanhos.js`**

```js
/**
 * ===========================================================================
 * TAMANHOS DO MOLDE — a grade, as cores, e a mesma peça em vários tamanhos
 * ===========================================================================
 *
 * Uma linha de peça continua sendo UMA peça num tamanho (é o que o Encaixe e
 * as estampas usam). O `grupo` diz quais linhas são a mesma peça: a FRENTE do
 * P, do M e do G. Nome, papel, quantidade, espelhar e margem são do GRUPO — a
 * frente não vira "costas" só no G —, e o desenho (nós, piques, pontos, fio)
 * é de cada tamanho, porque é assim que vem graduado da Audaces.
 */

/** Cores para tamanho sem cor guardada — as da Audaces primeiro. */
export const PALETA = ["#00ff00", "#ff0000", "#00ffff", "#ff8000", "#ff00ff", "#0080ff", "#ffff00", "#8000ff", "#808080"];

export function tamanhosDoMolde(pecas, guardados = []) {
  const saida = [];
  const vistos = new Set();
  for (const g of [...guardados].sort((a, b) => a.ordem - b.ordem)) {
    if (vistos.has(g.nome)) continue;
    vistos.add(g.nome);
    saida.push({ nome: g.nome, cor: g.cor || null, base: !!g.base });
  }
  for (const p of pecas) {
    if (vistos.has(p.tamanho)) continue;
    vistos.add(p.tamanho);
    saida.push({ nome: p.tamanho, cor: null, base: false });
  }
  const usadas = new Set(saida.map((t) => t.cor).filter(Boolean));
  const livres = PALETA.filter((c) => !usadas.has(c));
  let k = 0;
  const baseAchado = saida.findIndex((t) => t.base);
  return saida.map((t, ordem) => ({
    nome: t.nome,
    cor: t.cor || livres[k++ % Math.max(1, livres.length)] || PALETA[ordem % PALETA.length],
    ordem,
    base: baseAchado === -1 ? ordem === 0 : ordem === baseAchado,
  }));
}

export function completarGrupos(pecas) {
  const contagem = new Map();
  const ordenadas = pecas.map((p, i) => ({ p, i })).sort((a, b) => ((a.p.ordem ?? a.i) - (b.p.ordem ?? b.i)) || a.i - b.i);
  const grupoDe = new Map();
  for (const { p, i } of ordenadas) {
    if (Number.isInteger(p.grupo)) { grupoDe.set(i, p.grupo); continue; }
    const n = contagem.get(p.tamanho) ?? 0;
    contagem.set(p.tamanho, n + 1);
    grupoDe.set(i, n);
  }
  return pecas.map((p, i) => (p.grupo === grupoDe.get(i) ? p : { ...p, grupo: grupoDe.get(i) }));
}

export function gruposDasPecas(pecas) {
  const mapa = new Map();
  pecas.forEach((p, i) => {
    if (!mapa.has(p.grupo)) mapa.set(p.grupo, { grupo: p.grupo, porTamanho: {} });
    mapa.get(p.grupo).porTamanho[p.tamanho] = i;
  });
  return [...mapa.values()].sort((a, b) => a.grupo - b.grupo);
}

export const CAMPOS_COMUNS = ["papel", "nome", "quantidade"];

export function aplicarNoGrupo(pecas, grupo, mudar) {
  return pecas.map((p) => (p.grupo === grupo ? mudar(p) : p));
}

export function comunsDoGrupo(modelo) {
  return (outra) => ({
    ...outra,
    ...Object.fromEntries(CAMPOS_COMUNS.map((c) => [c, modelo[c]])),
    marcacoes: { ...outra.marcacoes, espelhar: modelo.marcacoes.espelhar, margem: modelo.marcacoes.margem },
  });
}

export function normalizarNomeDePeca(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s*\d+\s*X\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de edição (Levenshtein): quantas letras trocar para um virar o outro. */
function edicao(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * Quão parecidos dois nomes são, de 0 a 1. Um nome que COMEÇA com o outro
 * ("PALA" e "PALA SHORT") conta como parecido — é o jeito de nomear da
 * fábrica —, mas menos que o mesmo nome com uma letra trocada.
 */
function semelhanca(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const porLetra = 1 - edicao(a, b) / Math.max(a.length, b.length);
  const prefixo = a.startsWith(b) || b.startsWith(a) ? 0.75 : 0;
  return Math.max(porLetra, prefixo);
}

export function casarPecasParaJuntar(daqui, dela) {
  const nomesDela = dela.map((p) => normalizarNomeDePeca(p.nome));
  const candidatos = [];
  daqui.forEach((a) => {
    const na = normalizarNomeDePeca(a.nome);
    dela.forEach((b, j) => {
      const nome = semelhanca(na, nomesDela[j]);
      const caixa = 1 - Math.min(1, Math.abs((a.largura * a.altura) - (b.largura * b.altura)) / Math.max(1, a.largura * a.altura));
      candidatos.push({ grupo: a.grupo, indiceDela: j, certeza: nome * 0.85 + caixa * 0.15 });
    });
  });
  candidatos.sort((x, y) => y.certeza - x.certeza);
  const usadoDaqui = new Set();
  const usadoDela = new Set();
  const escolhido = new Map();
  for (const c of candidatos) {
    if (c.certeza < 0.45 || usadoDaqui.has(c.grupo) || usadoDela.has(c.indiceDela)) continue;
    usadoDaqui.add(c.grupo);
    usadoDela.add(c.indiceDela);
    escolhido.set(c.grupo, c);
  }
  return daqui.map((a) => escolhido.get(a.grupo) ?? { grupo: a.grupo, indiceDela: null, certeza: 0 });
}

export function juntarComoTamanho(pecas, dela, pares, tamanho) {
  const vindas = [];
  for (const { grupo, indiceDela } of pares) {
    if (indiceDela === null || indiceDela === undefined) continue;
    const modelo = pecas.find((p) => p.grupo === grupo);
    const deLa = dela[indiceDela];
    if (!modelo || !deLa) continue;
    const { id: _id, ...semId } = deLa;
    vindas.push(comunsDoGrupo(modelo)({ ...semId, tamanho, grupo }));
  }
  return [...pecas, ...vindas];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:tamanhos`
Expected: OK. Se o caso 5 errar um par, ajustar os pesos de `semelhanca`/`casarPecasParaJuntar` (não o teste): os nomes do teste são os dos arquivos da fábrica.

- [ ] **Step 5: CI**

Em `package.json`: `"bancada:tamanhos": "node bancada/conferir-tamanhos.mjs",`. No fim de `.github/workflows/conferir.yml`:

```yaml
      - name: Moldes e tamanhos
        run: npm run bancada:tamanhos && npm run bancada:moldes-pecas && npm run bancada:montagem
```

(Se a branch `feature/digitalizar-melhor` já tiver entrado na `main` com o passo "Digitalizar e Montagem", juntar as duas linhas num passo só no merge.)

- [ ] **Step 6: Commit**

```bash
git add src/motores/tamanhos.js bancada/conferir-tamanhos.mjs package.json .github/workflows/conferir.yml
git commit -m "O motor dos tamanhos: grade com cor, grupos, dados comuns e o casamento para juntar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A API e o gancho da Montagem conhecem os tamanhos

**Files:**
- Modify: `src/api/moldes.ts`
- Modify: `src/telas/montagem/useMoldeEmMontagem.ts`

**Interfaces:**
- Consumes: `tamanhosDoMolde`, `completarGrupos` (Task 2); API da Task 1.
- Produces: tipo `TamanhoDoMolde = { nome: string; cor: string; ordem: number; base: boolean }`; `PecaDoMolde.grupo?: number | null`; `Molde.tamanhos: TamanhoDoMolde[]`; `MoldeParaGravar.tamanhos?: TamanhoDoMolde[]`; `MoldeNaEstante.cores: Record<string, string>`. `MoldeEmMontagem` ganha `tamanhos: TamanhoDoMolde[]` e `mudarTamanhos(mudar: (antes) => TamanhoDoMolde[]): void`.

- [ ] **Step 1: Os tipos**

Em `src/api/moldes.ts`:

```ts
/** Um tamanho da grade, com a cor em que a Audaces o desenha. */
export interface TamanhoDoMolde {
  nome: string;
  /** `#rrggbb`. */
  cor: string;
  ordem: number;
  /** O tamanho de onde os outros foram graduados. Um só por molde. */
  base: boolean;
}
```

`PecaDoMolde` ganha `grupo?: number | null;` (com o comentário: "linhas com o mesmo grupo são a mesma peça em tamanhos diferentes"). `Molde` ganha `tamanhos: TamanhoDoMolde[];`, `MoldeParaGravar` ganha `tamanhos?: TamanhoDoMolde[];` e `MoldeNaEstante` ganha `cores: Record<string, string>;`.

- [ ] **Step 2: O gancho**

Em `useMoldeEmMontagem.ts`:

1. Import: `import { completarGrupos, tamanhosDoMolde } from "../../motores/tamanhos";` e `type TamanhoDoMolde` de `../../api/moldes`.
2. Estado: `const [tamanhos, setTamanhos] = useState<TamanhoDoMolde[]>([]);` e incluí-lo no snapshot: `atual.current = { nome, observacoes, pecas, tamanhos, versao: versao.current };` (e no `useRef` inicial).
3. Na carga, trocar o `setPecas(...)` por:

```ts
        const montadas = completarGrupos(m.pecas.map((p) => pecaParaMontar(p) as PecaEmMontagem));
        setPecas(montadas);
        setTamanhos(tamanhosDoMolde(montadas, m.tamanhos ?? []));
```

4. `mudarTamanhos`:

```ts
  const mudarTamanhos = useCallback((mudar: (antes: TamanhoDoMolde[]) => TamanhoDoMolde[]) => {
    setTamanhos(mudar);
    marcarMexida();
  }, []);
```

5. Em `gravar`, ler `tamanhos: tamanhosAgora` do snapshot junto com os outros e mandar `tamanhos: tamanhosDoMolde(pecasAgora, tamanhosAgora)` no `regravar` (recalculado para incluir tamanho novo que veio de uma junção e tirar ordem velha).
6. Expor `tamanhos` e `mudarTamanhos` no retorno e na interface `MoldeEmMontagem`.

- [ ] **Step 3: Tipos e build**

Run: `npm run tipos && npm run front`
Expected: sem erro. (O `Digitalizar.tsx` cria moldes sem `tamanhos`: o campo é opcional em `MoldeParaGravar`, e o servidor cria o molde sem grade — a Montagem a deduz na abertura.)

- [ ] **Step 4: Commit**

```bash
git add src/api/moldes.ts src/telas/montagem/useMoldeEmMontagem.ts dist
git commit -m "A Montagem carrega e grava a grade de tamanhos e os grupos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A Montagem mostra e edita por tamanho

**Files:**
- Create: `src/telas/montagem/ChipsDeTamanho.tsx`
- Modify: `src/telas/montagem/MesaDeMontagem.tsx`, `ListaDePecas.tsx`, `Mesa.tsx`, `PainelDaPeca.tsx`, `BarraDaMontagem.tsx`

**Interfaces:**
- Consumes: Tasks 2 e 3.
- Produces: `ChipsDeTamanho({ tamanhos, ativo, aoEscolher, verTamanhos, aoVerTamanhos })`; `ListaDePecas` passa a receber `grupo` (o grupo marcado) e `aoEscolherGrupo(grupo)` no lugar de `indice`/`aoEscolher`; `Mesa` ganha a prop `camadas: { nos: NoDoRisco[]; cor: string }[]`; `PainelDaPeca` ganha `aoMudarGrupo(mudar, lembrarAntes)`; `BarraDaMontagem` ganha `tamanhoAtivo: string`.

- [ ] **Step 1: O estado na MesaDeMontagem**

Trocar o `indice` (índice na lista plana) por **grupo + tamanho**:

```tsx
  const [grupo, setGrupo] = useState(0);
  const [tamanhoAtivo, setTamanhoAtivo] = useState<string>("");
  const [verTamanhos, setVerTamanhos] = useState(false);
  const grupos = useMemo(() => gruposDasPecas(molde.pecas), [molde.pecas]);
  const tamanhoValido = molde.tamanhos.some((t) => t.nome === tamanhoAtivo)
    ? tamanhoAtivo
    : (molde.tamanhos.find((t) => t.base)?.nome ?? molde.tamanhos[0]?.nome ?? "");
  const doGrupo = grupos.find((g) => g.grupo === grupo) ?? grupos[0];
  // O índice na lista plana da peça mostrada: o grupo marcado, no tamanho ativo
  // — ou, se esse grupo não tem o tamanho, o primeiro que ele tem.
  const atual = doGrupo ? (doGrupo.porTamanho[tamanhoValido] ?? Object.values(doGrupo.porTamanho)[0] ?? 0) : 0;
  const peca = molde.pecas[atual];
```

Manter os efeitos de limpeza (seleção, `noAtivo`) trocando `indice` por `atual`. `mudarEsta` continua `molde.mudarPeca(atual, ...)`. Novo:

```tsx
  /** Nome, papel, quantidade, espelhar e margem: o grupo inteiro, todos os tamanhos. */
  const mudarGrupo = (mudar: (p: PecaEmMontagem) => PecaEmMontagem, lembrarAntes: boolean) => {
    if (!peca) return;
    const modelo = mudar(peca);
    molde.mudarPecas((antes) => aplicarNoGrupo(antes, peca.grupo!, (p) => (p === antes[atual] ? modelo : comunsDoGrupo(modelo)(p))), lembrarAntes);
  };
```

Acima da `<Mesa>`, a linha dos chips:

```tsx
          {molde.tamanhos.length > 1 && (
            <ChipsDeTamanho
              tamanhos={molde.tamanhos}
              ativo={tamanhoValido}
              aoEscolher={setTamanhoAtivo}
              verTamanhos={verTamanhos}
              aoVerTamanhos={setVerTamanhos}
            />
          )}
```

Para a `<Mesa>`: `pecas` = só as peças do tamanho ativo (`molde.pecas.filter((p) => p.tamanho === tamanhoValido)`), `indice` = posição de `peca` nessa lista filtrada, `aoEscolherPeca(i)` → `setGrupo(filtradas[i].grupo)`, e `camadas`:

```tsx
            camadas={verTamanhos && doGrupo ? Object.entries(doGrupo.porTamanho)
              .filter(([t]) => t !== peca?.tamanho)
              .map(([t, i]) => ({ nos: molde.pecas[i]!.nos, cor: molde.tamanhos.find((x) => x.nome === t)?.cor ?? "#888888" }))
              : []}
```

O `problema.peca` do gancho é índice plano: onde a MesaDeMontagem leva a pessoa à peça com problema (`aoIrParaPeca` da barra), trocar por `const p = molde.pecas[i]; setGrupo(p.grupo); setTamanhoAtivo(p.tamanho);`.

- [ ] **Step 2: Os chips**

`ChipsDeTamanho.tsx`:

```tsx
/**
 * Os tamanhos da grade, cada um na cor em que a Audaces o desenha. O marcado
 * é o que se edita; "Ver tamanhos" sobrepõe os outros na mesa, só para
 * conferir a graduação.
 */
import type { TamanhoDoMolde } from "../../api/moldes";

interface Props {
  tamanhos: TamanhoDoMolde[];
  ativo: string;
  aoEscolher: (nome: string) => void;
  verTamanhos: boolean;
  aoVerTamanhos: (ver: boolean) => void;
}

export function ChipsDeTamanho({ tamanhos, ativo, aoEscolher, verTamanhos, aoVerTamanhos }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-linha px-3 py-1.5 text-[0.82rem]">
      <span className="text-tinta-fraca">Tamanho</span>
      {tamanhos.map((t) => (
        <button
          key={t.nome}
          type="button"
          onClick={() => aoEscolher(t.nome)}
          aria-pressed={t.nome === ativo}
          title={t.base ? `${t.nome} (base)` : t.nome}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${t.nome === ativo ? "border-ambar bg-[var(--accent-soft)] font-semibold" : "border-linha"}`}
        >
          <span className="size-2.5 rounded-full" style={{ background: t.cor }} />
          {t.nome}{t.base ? " ·" : ""}
        </button>
      ))}
      <label className="ml-auto flex items-center gap-1.5">
        <input type="checkbox" checked={verTamanhos} onChange={(e) => aoVerTamanhos(e.target.checked)} />
        Ver tamanhos
      </label>
    </div>
  );
}
```

- [ ] **Step 3: As camadas na Mesa**

Prop `camadas: { nos: NoDoRisco[]; cor: string }[]` (padrão `[]`). No efeito de desenho, ANTES de pintar a peça ativa (depois da grade):

```ts
    // Os outros tamanhos da peça, por baixo, finos, cada um na sua cor.
    for (const c of props.camadas) {
      tracarCaminho(ctx, c.nos, emTela);
      ctx.strokeStyle = c.cor;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
```

Acrescentar `props.camadas` às dependências do efeito. A vista (`vistaCalculada`) inclui as camadas, senão o G maior sai cortado: `caixaDe([...(corte ?? risco), ...props.camadas.flatMap((c) => achatarCurvas(c.nos))])`.

- [ ] **Step 4: A lista por grupo**

`ListaDePecas`: props `grupo: number` e `aoEscolherGrupo: (grupo: number) => void` no lugar de `indice`/`aoEscolher`. A lista itera `gruposDasPecas(molde.pecas)` e mostra, para cada grupo, a peça do tamanho base (ou a primeira): `const p = molde.pecas[g.porTamanho[base] ?? Object.values(g.porTamanho)[0]]`. O erro marca o grupo que contém `molde.problema?.peca`. `apagar` passa a apagar o GRUPO:

```ts
  const apagar = (g: number) => {
    molde.mudarPecas((antes) => antes.filter((p) => p.grupo !== g));
    aoEscolherGrupo(0);
  };
```

e o botão só aparece com mais de um grupo. `nomeDaPeca(p, i)` recebe a posição do grupo na lista.

- [ ] **Step 5: O painel e a barra**

`PainelDaPeca`: prop nova `aoMudarGrupo`; papel, nome, quantidade, espelhar e margem passam a chamar `aoMudarGrupo` (a margem pelo `trocarMarcacao` só no caso `margem`/`espelhar`; fio continua em `aoMudar`). A MesaDeMontagem passa `aoMudarGrupo={mudarGrupo}`.

`BarraDaMontagem`: prop `tamanhoAtivo: string`; um `<select>` pequeno ao lado de PDF/SVG com "Tamanho {tamanhoAtivo}" e "Todos os tamanhos" (estado local `todos`); `desenhos()` usa `molde.pecas.filter((p) => todos || p.tamanho === tamanhoAtivo)`. O "Concluir" continua olhando as peças "outro" sem nome (qualquer tamanho serve: o nome é do grupo).

- [ ] **Step 6: Tipos, build, bancadas**

Run: `npm run tipos && npm run front && npm run bancada:montagem && npm run bancada:tamanhos`
Expected: tudo OK.

- [ ] **Step 7: No navegador**

Com um molde de três tamanhos criado pela API (o `curl` da Task 1, com três tamanhos, duas peças e `grupo` 0/1): os chips aparecem nas cores; trocar o chip troca o desenho; "Ver tamanhos" mostra os outros por baixo; mudar a quantidade num tamanho muda nos três (conferir no `GET`); mover um nó muda só o tamanho marcado; "Apagar a peça marcada" apaga os três tamanhos da peça; PDF do tamanho e de todos; F5 volta igual. Molde antigo (sem grupo) abre e edita como antes.

- [ ] **Step 8: Commit**

```bash
git add src/telas/montagem dist
git commit -m "A Montagem mostra a peça por tamanho, com os tamanhos em camadas e os dados comuns no grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Juntar outro molde como um tamanho novo

**Files:**
- Create: `src/telas/montagem/CasamentoDePecas.tsx`
- Modify: `src/telas/montagem/ListaDePecas.tsx` (o bloco "Juntar")

**Interfaces:**
- Consumes: `casarPecasParaJuntar`, `juntarComoTamanho`, `normalizarNomeDePeca`, `PALETA` (Task 2); `molde.mudarPecas`, `molde.mudarTamanhos` (Task 3).
- Produces: `CasamentoDePecas({ daqui, dela, pares, aoTrocar(grupo, indiceDela | null), aoConfirmar, aoCancelar })`.

- [ ] **Step 1: A escolha "como um tamanho novo"**

No bloco de juntar, um par de rádios: "como peças novas" (o comportamento de hoje) e "como um tamanho novo". No segundo, dois campos: nome do tamanho (texto, obrigatório, não pode repetir um que já existe — avisar) e cor (`<input type="color">`, valor inicial = primeira cor da `PALETA` que ainda não está na grade). O botão "Juntar" abre o casamento em vez de juntar direto.

- [ ] **Step 2: A tabela de casamento**

`CasamentoDePecas.tsx`, num modal (as classes `modal`, `modal-topo` que o `EnvioParaEncaixe` já usa):

```tsx
/**
 * Qual peça do outro molde é qual peça deste. O casamento vem sugerido pelo
 * nome (sem "2X", sem acento, tolerando erro de digitação) e pela caixa, mas
 * quem confirma é a pessoa: nos pijamas M e G da fábrica as peças vêm em outra
 * ordem e com nomes diferentes ("PALA SHORT"/"PALA").
 */
import type { PecaEmMontagem } from "./useMoldeEmMontagem";
import type { PecaDoMolde } from "../../api/moldes";

interface Props {
  daqui: { grupo: number; peca: PecaEmMontagem }[];
  dela: PecaDoMolde[];
  pares: { grupo: number; indiceDela: number | null }[];
  aoTrocar: (grupo: number, indiceDela: number | null) => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

export function CasamentoDePecas({ daqui, dela, pares, aoTrocar, aoConfirmar, aoCancelar }: Props) {
  const usados = new Set(pares.map((p) => p.indiceDela).filter((i): i is number => i !== null));
  const semPar = pares.filter((p) => p.indiceDela === null).length;
  const sobrando = dela.filter((_, i) => !usados.has(i));
  return (
    <div className="modal-fundo" role="dialog" aria-modal="true" aria-label="Casar as peças">
      <div className="modal">
        <div className="modal-topo"><h3>Qual peça é qual?</h3></div>
        <table className="w-full text-[0.85rem]">
          <thead><tr><th className="text-left">Neste molde</th><th className="text-left">No outro</th></tr></thead>
          <tbody>
            {daqui.map(({ grupo, peca }) => {
              const par = pares.find((p) => p.grupo === grupo);
              return (
                <tr key={grupo}>
                  <td>{peca.nome || peca.papel}</td>
                  <td>
                    <select
                      value={par?.indiceDela ?? ""}
                      onChange={(e) => aoTrocar(grupo, e.target.value === "" ? null : Number(e.target.value))}
                      aria-label={`Par de ${peca.nome || peca.papel}`}
                    >
                      <option value="">— sem par (não entra) —</option>
                      {dela.map((p, i) => (
                        <option key={i} value={i} disabled={usados.has(i) && par?.indiceDela !== i}>{p.nome || p.papel}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {semPar > 0 && <p className="text-[0.82rem] text-[#ff4d4d]">{semPar} peça(s) deste molde ficam sem esse tamanho.</p>}
        {sobrando.length > 0 && (
          <p className="text-[0.82rem] text-tinta-fraca">Do outro molde, não entram: {sobrando.map((p) => p.nome || p.papel).join(", ")}.</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn secondary btn-sm" onClick={aoCancelar}>Cancelar</button>
          <button type="button" className="btn primary btn-sm" onClick={aoConfirmar}>Juntar como tamanho</button>
        </div>
      </div>
    </div>
  );
}
```

Conferir as classes de modal existentes (`grep -n "modal" src/telas/moldes/EnvioParaEncaixe.tsx`) e usar as mesmas.

- [ ] **Step 3: Ligar**

Em `ListaDePecas`, no modo "como um tamanho novo": ao clicar "Juntar", abrir o outro molde (`moldesApi.abrir`), pegar as peças do tamanho base dele (ou do primeiro), montar `daqui` (uma entrada por grupo, com a peça do tamanho base daqui), `dela` (as peças de lá já montadas com `pecaParaMontar`) e `pares = casarPecasParaJuntar(...)`, e mostrar o `CasamentoDePecas`. Em `aoConfirmar`: `molde.mudarPecas((antes) => juntarComoTamanho(antes, dela, pares, nome))` e `molde.mudarTamanhos((t) => [...t, { nome, cor, ordem: t.length, base: false }])` — as duas mexidas antes de um `lembrar()` só (chamar `molde.lembrar()` e passar `lembrarAntes = false` na `mudarPecas`).

- [ ] **Step 4: No navegador, com os pijamas**

Criar dois moldes pela API a partir dos nomes dos pijamas (8 peças cada, nomes do caso 5 da Task 2, tamanhos "M" e "G"), abrir o M na Montagem, juntar o G "como um tamanho novo": a tabela sugere os pares certos (FRENTE↔FRENTE, BERMUDA MASC.↔BEMUDA MASC., PALA SHORT↔PALA…), trocar um par à mão funciona, e o molde fica com M e G nos chips.

- [ ] **Step 5: Tipos, build, commit**

Run: `npm run tipos && npm run front`

```bash
git add src/telas/montagem dist
git commit -m "Juntar outro molde como um tamanho novo, com a tabela de casamento das peças

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: O passo a passo antigo não apaga a graduação, e a estante mostra as cores

**Files:**
- Modify: `src/telas/moldes/vocabulario.ts` (`ParteEmEdicao`), `src/telas/moldes/EditorDeMolde.tsx` (carga ~linha 94, gravação ~linha 365)
- Modify: `src/telas/Moldes.tsx` (etiquetas de tamanho do cartão)

**Interfaces:**
- Consumes: `grupo` e `cores` da API (Tasks 1 e 3).

- [ ] **Step 1: O editor antigo carrega o grupo**

`ParteEmEdicao` ganha `grupo?: number | null;` (comentário: "o grupo da peça no molde guardado; o passo a passo não o edita, só o devolve — trocar o arquivo o descarta, como os nós"). No `useEffect` de carga, `grupo: peca.grupo ?? null,`; em `comDesenho`, `grupo: null,`; na gravação, `grupo: p.grupo ?? null,`. O corpo do `regravar` **não** manda `tamanhos` — é o que faz o servidor manter a grade (Task 1).

- [ ] **Step 2: A estante**

Em `Moldes.tsx`, onde o cartão lista os tamanhos (`etiqueta-tamanho`), pôr uma bolinha com a cor quando `m.cores[t]` existir:

```tsx
<span className="etiqueta-tamanho">
  {m.cores?.[t] && <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: m.cores[t] }} />}
  {t}
</span>
```

- [ ] **Step 3: No navegador**

Num molde com três tamanhos com cor: "Editar" → mudar uma quantidade → salvar → o `GET` do molde ainda tem os três tamanhos com cor e os grupos. A estante mostra as bolinhas.

- [ ] **Step 4: Tipos, build, commit**

Run: `npm run tipos && npm run front && npm run bancada:revisao`

```bash
git add src/telas/moldes src/telas/Moldes.tsx dist
git commit -m "O passo a passo antigo guarda a graduação, e a estante mostra a cor de cada tamanho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: O `.ads` — cabeçalho, fichas das peças e tabela de tamanhos

**Files:**
- Create: `src/motores/audacesAds.js`
- Create: `docs/formatos/audaces-ads.md`
- Create: `bancada/conferir-audaces.mjs`
- Modify: `package.json` (`"bancada:audaces": "node bancada/conferir-audaces.mjs",`)

**Interfaces:**
- Produces:
  - `lerCabecalhoAds(bytes: Uint8Array) → { versao: string, pecas: number, nome: string, miniatura: Uint8Array, fimDaMiniatura: number } | { erro: string }`
  - `fichasDasPecas(bytes, inicio: number) → { nome: string, quantidade: number, rotulo: string | null, posicao: number }[]`
  - `tabelasDeTamanhos(bytes, inicio: number) → { posicao: number, tamanhos: { nome: string, cor: string, ativo: boolean }[] }[]` (a `posicao` é a do primeiro registro, que começa pela cor)
  - `resumoDoAds(bytes) → { nome, pecas: { nome, quantidade }[], tamanhos: { nome, cor }[], miniatura, avisos: string[] } | { erro: string }`

- [ ] **Step 1: O documento do formato (o que está confirmado)**

`docs/formatos/audaces-ads.md` — escrever as seções abaixo, cada campo com posição, tipo, significado e "conferido em":

- **Cabeçalho:** bytes 0–10 `"CADZ vs6.0 "`; byte 11 `0x1a`; `u32` no `0x0c` = número de peças (4 saia, 6 short, 8 pijama M, 8 pijama G); `u16` no `0x26` = tamanho do nome do molde; nome em Windows-1252 a partir do `0x28`; depois do nome, 6 bytes ainda não decifrados, um `u32` com o tamanho da miniatura e a miniatura JPEG (`FF D8 FF`).
- **Textos:** `u16` tamanho + bytes em Windows-1252. Ficha da peça: nome com a quantidade no fim ("COSTA 2X"), seguido de outro texto com um rótulo livre ("SAIA BABADO CURTO", " PIJAMA INF. G") — no short, "VIEIS 1X" vem sem rótulo.
- **Tabela de tamanhos:** registros de 20 bytes seguidos: cor R, G, B, 0; `u32` ativo (1 = em uso); `u8` 1; nome em 3 bytes completados com zero (`P\0\0`, `GG\0`); 8 bytes não decifrados, **iguais nos 4 arquivos** (`ef 1a 77 00 0c 3f 7d 00`) — usados como assinatura do registro. Saia e short: P `00ff00`, M `ff0000`, G `00ffff`, GG `ff8000`, os quatro ativos. Pijama M: M `ff0000`; pijama G: G `ff0000` (a cor é escolhida por arquivo). Depois do último registro vem outro bloco (`05 00 02 00` na saia, `06 00 00 00` no pijama G).
- **Não decifrado ainda** (a Task 8 fecha): o desenho de cada tamanho, os trechos retos, piques, fio, os 6 bytes depois do nome, os 8 bytes de cada registro de tamanho e o bloco que vem depois da tabela.

- [ ] **Step 2: A bancada que falha**

`bancada/conferir-audaces.mjs` — casos montados byte a byte (rodam em qualquer lugar) e, se a pasta existir, os arquivos da fábrica:

```js
/*
 * BANCADA — o .ads da Audaces, no que já está decifrado
 *
 *     npm run bancada:audaces
 *
 * Os arquivos da fábrica NÃO estão no git. A pasta vem de
 * OPTMIZE_ARQUIVOS_AUDACES (padrão D:\uso de teste); sem ela, rodam só os
 * casos montados aqui. Ver docs/formatos/audaces-ads.md.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { carregarModulo } from "./carregarModulo.mjs";

const ads = await carregarModulo("src/motores/audacesAds.js");

/** Um .ads mínimo: cabeçalho, nome, miniatura falsa, uma ficha e uma tabela P/M/G/GG. */
function adsDeMentira({ versao = "CADZ vs6.0 ", pecas = 1 } = {}) {
  const partes = [];
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const texto = (s) => Buffer.concat([u16(Buffer.byteLength(s, "latin1")), Buffer.from(s, "latin1")]);
  const cab = Buffer.alloc(0x26);
  cab.write(versao, 0, "latin1"); cab[11] = 0x1a; cab.writeUInt32LE(pecas, 0x0c);
  partes.push(cab, texto("MOLDE TESTE"), Buffer.alloc(6));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  partes.push(u32(jpeg.length), jpeg, Buffer.from("LIG\0", "latin1"), Buffer.alloc(16));
  partes.push(u16(6), texto("CÓS 2X"), Buffer.alloc(40), u16(1), texto("MOLDE TESTE "), Buffer.alloc(8));
  // Registro de tamanho: cor R,G,B,0 · u32 ativo · u8 1 · nome em 3 bytes · 8 bytes fixos.
  const registro = (nome, cor, ativo) => {
    const r = Buffer.alloc(20);
    r[0] = cor[0]; r[1] = cor[1]; r[2] = cor[2]; r.writeUInt32LE(ativo, 4);
    r[8] = 1; r.write(nome, 9, "latin1");
    Buffer.from([0xef, 0x1a, 0x77, 0x00, 0x0c, 0x3f, 0x7d, 0x00]).copy(r, 12);
    return r;
  };
  partes.push(registro("P", [0, 255, 0], 1), registro("M", [255, 0, 0], 1), registro("G", [0, 255, 255], 1), registro("GG", [255, 128, 0], 0));
  partes.push(Buffer.from([5, 0, 2, 0]));
  return new Uint8Array(Buffer.concat(partes));
}

// 1. Cabeçalho.
{
  const c = ads.lerCabecalhoAds(adsDeMentira());
  assert.equal(c.versao, "vs6.0");
  assert.equal(c.pecas, 1);
  assert.equal(c.nome, "MOLDE TESTE");
  assert.equal(c.miniatura[0], 0xff);
  assert.ok(ads.lerCabecalhoAds(adsDeMentira({ versao: "CADZ vs7.0 " })).erro.includes("vs7.0"), "outra versão é recusada");
  assert.ok(ads.lerCabecalhoAds(new Uint8Array(10)).erro, "arquivo que não é .ads é recusado");
}

// 2. Fichas: nome sem "2X", quantidade, acento em Windows-1252.
{
  const b = adsDeMentira();
  const f = ads.fichasDasPecas(b, ads.lerCabecalhoAds(b).fimDaMiniatura);
  assert.equal(f.length, 1);
  assert.equal(f[0].nome, "CÓS");
  assert.equal(f[0].quantidade, 2);
}

// 3. Tabela de tamanhos: a cor vem ANTES do nome; o GG deste caso está inativo.
{
  const b = adsDeMentira();
  const t = ads.tabelasDeTamanhos(b, ads.lerCabecalhoAds(b).fimDaMiniatura);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0].tamanhos, [
    { nome: "P", cor: "#00ff00", ativo: true }, { nome: "M", cor: "#ff0000", ativo: true },
    { nome: "G", cor: "#00ffff", ativo: true }, { nome: "GG", cor: "#ff8000", ativo: false },
  ]);
}

// 4. Resumo: a contagem de fichas tem de bater com o cabeçalho; se não bate, avisa.
{
  const r = ads.resumoDoAds(adsDeMentira({ pecas: 2 }));
  assert.ok(r.avisos.some((a) => /2 peças/.test(a)), "a contagem que não bate vira aviso");
  const ok = ads.resumoDoAds(adsDeMentira());
  assert.deepEqual(ok.tamanhos, [{ nome: "P", cor: "#00ff00" }, { nome: "M", cor: "#ff0000" }, { nome: "G", cor: "#00ffff" }], "só os ativos");
}

// 5. Os arquivos da fábrica, se estiverem aqui.
const PASTA = process.env.OPTMIZE_ARQUIVOS_AUDACES || "D:\\uso de teste";
const esperado = {
  "SAIA BABADO CURTO.ads": { pecas: ["FRENTE", "FORRO", "COSTA", "BARRA"], tamanhos: ["P", "M", "G", "GG"], cores: ["#00ff00", "#ff0000", "#00ffff", "#ff8000"] },
  "SHORT TACTEL.ads": { pecas: ["TRAZEIRO", "BOLSO", "DIANTEIRO", "CÓS", "VIEIS", "FAIXA DE CABELO"], tamanhos: ["P", "M", "G", "GG"], cores: ["#00ff00", "#ff0000", "#00ffff", "#ff8000"] },
  "PIJAMA INF. (M).ADS": { pecas: 8, tamanhos: ["M"], cores: ["#ff0000"] },
  "PIJAMA INF. (G).ADS": { pecas: 8, tamanhos: ["G"], cores: ["#ff0000"] },
};
for (const [arquivo, e] of Object.entries(esperado)) {
  const caminho = path.join(PASTA, arquivo);
  if (!fs.existsSync(caminho)) { console.log(`(pulei ${arquivo}: não achei em ${PASTA})`); continue; }
  const r = ads.resumoDoAds(new Uint8Array(fs.readFileSync(caminho)));
  assert.ok(!r.erro, `${arquivo}: ${r.erro}`);
  if (Array.isArray(e.pecas)) assert.deepEqual(r.pecas.map((p) => p.nome), e.pecas, arquivo);
  else assert.equal(r.pecas.length, e.pecas, arquivo);
  assert.deepEqual(r.tamanhos.map((t) => t.nome), e.tamanhos, arquivo);
  assert.deepEqual(r.tamanhos.map((t) => t.cor), e.cores, arquivo);
  assert.deepEqual(r.avisos, [], `${arquivo}: ${r.avisos.join(" / ")}`);
}

console.log("OK — o .ads confere no que já está decifrado.");
```

Run: `npm run bancada:audaces`
Expected: FAIL ao carregar `audacesAds.js`.

- [ ] **Step 3: `src/motores/audacesAds.js`**

```js
/**
 * ===========================================================================
 * O .ADS DA AUDACES — o que já está decifrado
 * ===========================================================================
 *
 * Formato fechado, sem documentação pública. Cada campo lido aqui está em
 * `docs/formatos/audaces-ads.md`, com a posição, o tipo e em que arquivos foi
 * conferido; campo fora do documento não é lido. Versão diferente da
 * conferida é RECUSADA — adivinhar num formato que mudou é cortar tecido
 * errado.
 */

const VERSOES_CONHECIDAS = ["vs6.0"];
const win1252 = new TextDecoder("windows-1252");
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function lerCabecalhoAds(bytes) {
  if (bytes.length < 0x30 || win1252.decode(bytes.subarray(0, 5)) !== "CADZ ") {
    return { erro: "Esse arquivo não é um .ads da Audaces." };
  }
  const versao = win1252.decode(bytes.subarray(5, 10)).trim();
  if (!VERSOES_CONHECIDAS.includes(versao)) {
    return { erro: `Esta versão da Audaces (${versao}) ainda não é lida. Exporte o molde em DXF-AAMA.` };
  }
  const pecas = u32(bytes, 0x0c);
  const tamanhoDoNome = u16(bytes, 0x26);
  const nome = win1252.decode(bytes.subarray(0x28, 0x28 + tamanhoDoNome)).trim();
  const posicaoDoTamanho = 0x28 + tamanhoDoNome + 6;
  const tamanhoDaMiniatura = u32(bytes, posicaoDoTamanho);
  const inicio = posicaoDoTamanho + 4;
  if (bytes[inicio] !== 0xff || bytes[inicio + 1] !== 0xd8 || inicio + tamanhoDaMiniatura > bytes.length) {
    return { erro: "O .ads não tem a miniatura onde o formato diz; o arquivo pode estar corrompido." };
  }
  return { versao, pecas, nome, miniatura: bytes.subarray(inicio, inicio + tamanhoDaMiniatura), fimDaMiniatura: inicio + tamanhoDaMiniatura };
}

/** Todos os textos `u16 tamanho + Windows-1252` legíveis a partir de `inicio`. */
function textos(bytes, inicio) {
  const saida = [];
  for (let o = inicio; o + 2 < bytes.length; o++) {
    const n = u16(bytes, o);
    if (n < 1 || n > 60 || o + 2 + n > bytes.length) continue;
    const pedaco = bytes.subarray(o + 2, o + 2 + n);
    if (!pedaco.every((c) => c >= 0x20 && c !== 0x7f)) continue;
    const s = win1252.decode(pedaco);
    if (!/[A-Za-zÀ-ÿ]/.test(s)) continue;
    saida.push({ texto: s, posicao: o, fim: o + 2 + n });
    o += 1 + n;
  }
  return saida;
}

/** As fichas: o texto que termina com a quantidade ("COSTA 2X"), e o rótulo logo depois. */
export function fichasDasPecas(bytes, inicio) {
  const lista = textos(bytes, inicio);
  const fichas = [];
  lista.forEach((t, i) => {
    const m = /^(.*?)\s*(\d+)\s*X\s*$/i.exec(t.texto);
    if (!m || !m[1].trim()) return;
    const seguinte = lista[i + 1];
    const rotulo = seguinte && seguinte.posicao - t.fim < 80 && !/\d+\s*X\s*$/i.test(seguinte.texto) ? seguinte.texto.trim() : null;
    fichas.push({ nome: m[1].trim(), quantidade: Number(m[2]), rotulo, posicao: t.posicao });
  });
  return fichas;
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** Os 8 bytes do fim de todo registro de tamanho — iguais nos 4 arquivos conferidos. */
const ASSINATURA_DO_TAMANHO = [0xef, 0x1a, 0x77, 0x00, 0x0c, 0x3f, 0x7d, 0x00];

/**
 * Um registro de tamanho que começa em `o`, ou `null`:
 * cor R,G,B,0 · u32 ativo · u8 1 · nome em 3 bytes · a assinatura.
 */
function registroDeTamanho(bytes, o) {
  if (o + 20 > bytes.length || bytes[o + 3] !== 0 || bytes[o + 8] !== 1) return null;
  if (!ASSINATURA_DO_TAMANHO.every((v, k) => bytes[o + 12 + k] === v)) return null;
  const ativo = u32(bytes, o + 4);
  if (ativo > 1) return null;
  const nomeCru = bytes.subarray(o + 9, o + 12);
  const fim = nomeCru.indexOf(0);
  const nome = win1252.decode(nomeCru.subarray(0, fim === -1 ? 3 : fim));
  if (!/^[A-Z0-9]{1,3}$/.test(nome)) return null;
  if (fim !== -1 && nomeCru.subarray(fim).some((c) => c !== 0)) return null;
  return { nome, cor: hex(bytes[o], bytes[o + 1], bytes[o + 2]), ativo: ativo === 1 };
}

/** As tabelas: registros seguidos, de 20 em 20 bytes (um só também vale: os pijamas). */
export function tabelasDeTamanhos(bytes, inicio) {
  const tabelas = [];
  for (let o = inicio; o + 20 <= bytes.length; o++) {
    if (!registroDeTamanho(bytes, o)) continue;
    const tamanhos = [];
    let q = o;
    for (let r = registroDeTamanho(bytes, q); r; r = registroDeTamanho(bytes, q)) { tamanhos.push(r); q += 20; }
    tabelas.push({ posicao: o, tamanhos });
    o = q - 1;
  }
  return tabelas;
}

export function resumoDoAds(bytes) {
  const cab = lerCabecalhoAds(bytes);
  if (cab.erro) return cab;
  const avisos = [];
  const fichas = fichasDasPecas(bytes, cab.fimDaMiniatura);
  if (fichas.length !== cab.pecas) {
    avisos.push(`O cabeçalho diz ${cab.pecas} peças e achei ${fichas.length} fichas.`);
  }
  // A grade do molde: a da primeira tabela, só os tamanhos em uso.
  const tabelas = tabelasDeTamanhos(bytes, cab.fimDaMiniatura);
  const tamanhos = (tabelas[0]?.tamanhos ?? []).filter((t) => t.ativo).map(({ nome, cor }) => ({ nome, cor }));
  return { nome: cab.nome, pecas: fichas.map(({ nome, quantidade }) => ({ nome, quantidade })), tamanhos, miniatura: cab.miniatura, avisos };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:audaces`
Expected: OK, com os quatro arquivos da fábrica conferidos (sem pulos, se `D:\uso de teste` estiver aí).

- [ ] **Step 5: Commit**

```bash
git add src/motores/audacesAds.js docs/formatos/audaces-ads.md bancada/conferir-audaces.mjs package.json
git commit -m "O .ads da Audaces: cabeçalho, fichas das peças e tabela de tamanhos, com o formato documentado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Decifrar o desenho de cada tamanho (sondagem) — CHECKPOINT

Esta tarefa não entrega código de produção: entrega o **documento do formato completo** e a sonda que o prova. O leitor do desenho vira o próximo plano.

**Files:**
- Create: `bancada/audaces/sondar.mjs`
- Modify: `docs/formatos/audaces-ads.md`

- [ ] **Step 1: A sonda**

`bancada/audaces/sondar.mjs` — a mesma varredura da sondagem de 2026-09-28, que desenhou os trechos curvos da saia batendo com a miniatura: acha trechos `u16 tipo, u16 n, n pares de double` com coordenadas plausíveis, imprime cada um (posição, tipo, pontas) e grava o desenho (um tipo por cor) e a miniatura em `bancada/audaces/ver/`. Acrescentar, conforme a investigação pedir, as buscas de caixa (4 `double` seguidos com `minX < maxX`, `minY < maxY`) e de etiquetas de 3 letras (como `LIG`).

```js
// node bancada/audaces/sondar.mjs "<pasta com .ads>"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const pasta = process.argv[2] || process.env.OPTMIZE_ARQUIVOS_AUDACES || "D:\\uso de teste";
const saida = path.join(AQUI, "ver");
fs.mkdirSync(saida, { recursive: true });

const plausivel = (v) => Number.isFinite(v) && v > -50 && v < 600 && (v === 0 || Math.abs(v) > 1e-3);

for (const f of fs.readdirSync(pasta).filter((x) => /\.ads$/i.test(x))) {
  const b = fs.readFileSync(path.join(pasta, f));
  const jpg = b.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  const tam = b.readUInt32LE(jpg - 4);
  fs.writeFileSync(path.join(saida, `${f}.miniatura.jpg`), b.subarray(jpg, jpg + tam));

  const trechos = [];
  for (let o = jpg + tam; o + 4 < b.length; o++) {
    const tipo = b.readUInt16LE(o);
    const n = b.readUInt16LE(o + 2);
    if (tipo > 40 || n < 2 || n > 400 || o + 4 + n * 16 > b.length) continue;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const x = b.readDoubleLE(o + 4 + k * 16);
      const y = b.readDoubleLE(o + 12 + k * 16);
      if (!plausivel(x) || !plausivel(y)) break;
      pts.push([x, y]);
    }
    if (pts.length !== n) continue;
    trechos.push({ posicao: o, tipo, n, pts });
    o += 3 + n * 16;
  }

  const porTipo = {};
  for (const t of trechos) porTipo[t.tipo] = (porTipo[t.tipo] || 0) + 1;
  console.log(`${f}: ${trechos.length} trechos, por tipo ${JSON.stringify(porTipo)}`);
  for (const t of trechos) {
    const de = t.pts[0].map((v) => v.toFixed(2)).join(", ");
    const ate = t.pts[t.pts.length - 1].map((v) => v.toFixed(2)).join(", ");
    console.log(`  @${t.posicao} tipo ${t.tipo} n ${t.n} de (${de}) a (${ate})`);
  }

  let minX = 1e9; let minY = 1e9; let maxX = -1e9; let maxY = -1e9;
  for (const t of trechos) {
    for (const [x, y] of t.pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const k = 900 / Math.max(maxX - minX, maxY - minY, 1);
  const cores = ["#e33", "#23c", "#2a2", "#c80", "#a3c", "#0aa", "#888"];
  const ponto = ([x, y]) => `${((x - minX) * k + 20).toFixed(1)},${((maxY - y) * k + 20).toFixed(1)}`;
  const linhas = trechos
    .map((t) => `<polyline fill="none" stroke="${cores[t.tipo % cores.length]}" stroke-width="1.5" points="${t.pts.map(ponto).join(" ")}"/>`)
    .join("");
  const largura = Math.ceil((maxX - minX) * k + 40);
  const altura = Math.ceil((maxY - minY) * k + 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}"><rect width="100%" height="100%" fill="#fff"/>${linhas}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(saida, `${f}.sonda.png`));
}
```

(O Y é invertido no desenho: na miniatura da Audaces o Y cresce para cima.) `bancada/audaces/ver/` vai para o `.gitignore`.

- [ ] **Step 2: O que falta decifrar, na ordem**

Para cada item: hipótese → conferir nos 4 arquivos com a sonda → registrar no documento (posição, tipo, significado, "conferido em") ou registrar "refutado" com o porquê.

1. Os trechos que faltam no contorno (os retos que ligam as curvas; a BARRA retangular da saia): procurar tipos com `n = 1` e registros de 2 pontos.
2. A ordem dos trechos numa peça, e onde o contorno fecha.
3. **O desenho de cada tamanho:** comparar o bloco de uma peça da saia (P, M, G) com o da mesma peça no pijama M (um tamanho só): o que a saia tem a mais é a graduação. Hipóteses: (a) um contorno por tamanho, (b) um deslocamento `(dx, dy)` por tamanho em cada ponto de graduação (como a tabela `.rul` do AAMA), (c) uma escala. A prova de cada hipótese é desenhar o P e o G na sonda e ver o encaixe na miniatura (que mostra dois tamanhos: verde e vermelho).
4. Piques e fio: tipos de trecho curtos perto do contorno (pique) e um segmento com setas ou dois pontos longe do contorno (fio).
5. Os bytes ainda sem nome (depois do nome do molde, no fim do registro de tamanho, e o bloco depois da tabela) e qual tamanho é o base (a Audaces marca um; procurar um índice perto da tabela).

- [ ] **Step 3: CHECKPOINT — os arquivos da fábrica**

PARAR e pedir à pessoa, se ainda não estiverem em `D:\uso de teste`: a **Saia Babado Curto** e o **Short Tactel** exportados em **DXF-AAMA com todos os tamanhos**, e um **print** da Audaces com um deles aberto mostrando os tamanhos e as cores. Com eles, conferir cada hipótese do Step 2 contra o DXF (o DXF diz em texto qual contorno é qual tamanho e onde estão os piques).

- [ ] **Step 4: Critério de pronto**

O documento está pronto quando, para os 4 arquivos: todas as peças fecham o contorno; cada contorno cabe na caixa da peça a menos de 0,5 mm; o desenho de cada tamanho está explicado; e o PNG da sonda bate com a miniatura. Se algum item não fechar depois do DXF, registrar como não decifrado e levar à pessoa a decisão (importar sem aquele item, ou ficar no DXF-AAMA).

- [ ] **Step 5: Commit e próximo plano**

```bash
git add bancada/audaces/sondar.mjs docs/formatos/audaces-ads.md .gitignore
git commit -m "O formato .ads decifrado: contorno, tamanhos, piques e fio, conferidos nos arquivos da fábrica

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Com o documento fechado, escrever o plano do leitor completo (`resumoDoAds` → molde com peças por tamanho, a entrada por "Adicionar molde", a conferência pela caixa e pela miniatura) e o do leitor DXF-AAMA.

---

## Nota para quem for testar no navegador

O servidor de teste precisa de uma cópia do banco e da sessão (`OPTIMIZE_DADOS=<pasta de teste> PORT=8765 node servidor/server.js`). **A cópia da sessão tem de ir SEM tokens** (`accessToken` e `refreshToken` trocados por um texto qualquer): com os tokens de verdade, o servidor de teste os renova no backend da CodeEx e a sessão real do programa fica com um token velho — aconteceu em 2026-09-28. Sem token, o servidor usa o acesso guardado na cópia e não fala com o backend.
