# Juntar pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O operador junta pedidos diferentes no mesmo rolo do Encaixe; cada peça leva o pedido, e com 2+ pedidos a sigla `PEDIDO PEÇAcópia` sai impressa no tecido, dentro da peça; e o tempo sugerido sobe nos trabalhos de peça grande.

**Architecture:** O pedido é um rótulo na peça (`peca.pedido`, `peca.sigla`) que o motor não lê. Duas unidades puras novas fazem a conta — `src/motores/siglaDoPedido.js` (texto da sigla, largura pela fonte, lugar dentro da silhueta) e `src/producao/pedidos.js` (pedidos da lista, cores, renomear, marcas do risco) —; o controlador da tela só chama. O servidor do PDF escreve a sigla em texto vetorial com a fonte Liberation Sans Bold embutida. A regra de tempo mora em `src/producao/tempoSugerido.js`.

**Tech Stack:** JavaScript ESM (Vite) na tela, CommonJS no servidor (Express, pdfkit, better-sqlite3), React só no `Alerta.tsx`, bancadas em Node (`node:assert`, esbuild via `bancada/carregarModulo.mjs`, `pdfjs-dist` para ler o PDF).

**Spec:** `docs/superpowers/specs/2026-10-01-juntar-pedidos-design.md`

## Global Constraints

- Pedido: até **6 caracteres**, maiúsculo, sem espaço, só `A-Z0-9` (acento sai); primeiro lote = `P1`; peça sem `pedido` conta como `P1`.
- O motor **não lê** `pedido` nem `sigla` (nenhum módulo do motor acessa `x.pedido`/`x.sigla`), então o encaixe não muda com eles. O pedido **não** é `grupo` e **não** desliga o sparrow.
- Rolo com **1 pedido**: tela, PNG e PDF **exatamente como hoje** (sem chip, sem contorno de pedido, sem sigla, sem legenda).
- Sigla: texto `<pedido> <siglaDaPeça><cópia>` (cópia só com `qtd > 1`); **altura da letra 4 mm** (altura de maiúscula), negrito, **preta com contorno branco de 0,3 mm**, **recuo de 3 mm** da borda, canto de baixo à esquerda **dentro da silhueta**, procurando de baixo até a metade da peça; texto sempre de pé no sentido do rolo; não coube → sem sigla + aviso; **a letra nunca encolhe**.
- Sigla da peça: duas primeiras letras da primeira palavra do nome + tamanho (`Tam G`, `Tamanho GG`, ou P/M/G/GG/XG/3G solto), editável por peça, até 6 caracteres.
- Fonte do PDF: **TTF embutida** (Liberation Sans Bold, licença OFL junto).
- Metragem: só a do rolo; **nada de metragem por pedido**.
- Tempo: só a **sugestão** muda; o tempo digitado manda (`tempoAjustadoPeloUsuario`).
- Nenhuma arte de cliente entra no repositório.
- Mensagens de commit em português, no estilo do repositório (frase que diz o que mudou), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Renomear o pedido depois do encaixe** — os itens do risco são cópias (`{ ...peca }`) e guardam o nome velho; a tela, o PNG e o PDF têm de sair com o nome novo. Por isso `marcasDoRisco` lê o pedido de `pecasEncaixe[indice]`, não do item (teste na Task 2).
2. **Posição sem máscara** (encaixe por caixa / `retangulo`, `p.mascara` ausente) — a sigla tem de usar a caixa inteira da peça em vez de sumir ou quebrar (teste na Task 1).
3. **Peça girada 90°/180°/270°** — o retângulo do texto tem de cair dentro da silhueta da rotação em que a peça foi posta (teste das 4 rotações na Task 1).
4. **PDF repartido por bancada** — a marca tem de descer junto com o `y` da peça (`deslocamento`), senão a sigla sai na página errada (teste no Step de `daPeca`, Task 7).
5. **Texto da sigla com caractere fora da tabela** (nome editado com `Ç`, `-`, minúscula) — a normalização tira antes; a largura nunca vira `NaN` (teste na Task 1).

---

## Mapa de arquivos

| arquivo | o quê |
|---|---|
| `src/motores/siglaDoPedido.js` (novo) | normalizar, sigla da peça, texto da sigla, largura do texto, lugar da sigla |
| `src/producao/pedidos.js` (novo) | pedidos da lista, próximo/último, marcar lote, renomear, cor, marcas do risco |
| `src/producao/tempoSugerido.js` (novo) | a regra do tempo sugerido |
| `src/casca/Alerta.tsx` | terceiro botão (`alternativa`) |
| `src/producao/controlador.js` | escolha ao entrar, chip, renomear, campo Sigla, desenho/PNG/PDF com pedidos, reposição, tempo |
| `src/motores/desenhoDoEncaixe.js` | contorno na cor do pedido, prefixo na tarja, sigla desenhada |
| `servidor/encaixe-pdf.js` | escreve a marca; valida `marca` na rota |
| `servidor/fontes/LiberationSans-Bold.ttf`, `servidor/fontes/LICENSE_LIBERATION` (novos) | a fonte embutida |
| `servidor/reposicao-api.js` | colunas `pedido`, `sigla` |
| `src/telas/Reposicao.tsx` | devolve `pedido`/`sigla` ao Encaixe |
| `bancada/conferir-pedidos.mjs` (novo) | a prova (`npm run bancada:pedidos`) |
| `bancada/medir-guardados.js` (novo) | a medição com as artes reais (`npm run bancada:guardados`) |
| `package.json` | os dois scripts |

---

### Task 1: A sigla — texto, largura e lugar dentro da peça

**Files:**
- Create: `src/motores/siglaDoPedido.js`
- Create: `bancada/conferir-pedidos.mjs`
- Modify: `package.json` (script `bancada:pedidos`)

**Interfaces:**
- Produces:
  - `ALTURA_DA_LETRA_CM = 0.4`, `RECUO_DA_SIGLA_CM = 0.3`, `CONTORNO_DA_LETRA_CM = 0.03`, `ALTURA_DE_MAIUSCULA = 0.688`
  - `normalizarSigla(texto: string, max = 6): string` — `A-Z0-9`, sem acento, maiúsculo, cortado em `max`
  - `siglaDaPeca(nome: string): string`
  - `textoDaSigla({ pedido, sigla, nome, qtd, copia }): string`
  - `tamanhoDaFonteCm(alturaLetraCm = 0.4): number` — o corpo da fonte que dá essa altura de maiúscula
  - `larguraDoTextoCm(texto: string, alturaLetraCm = 0.4): number`
  - `lugarDaSigla(p, texto, { alturaLetraCm, recuoCm } = {}): { x, y, largura, altura } | null` — `p` é uma posição do resultado (`{ x, y, largura, altura, passo, mascara? }`); `x,y` é o canto de cima à esquerda da **caixa das maiúsculas**, em cm no rolo.

- [ ] **Step 1: Escrever a bancada que falha**

`bancada/conferir-pedidos.mjs`:

```js
/*
 * BANCADA — juntar pedidos
 *
 *     npm run bancada:pedidos
 *
 * Dois pedidos no mesmo rolo: o motor não pode enxergar o pedido (o encaixe
 * tem de sair igual), e a sigla impressa tem de cair inteira dentro da peça —
 * sigla cortada pela tesoura é peça que ninguém sabe de quem é.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const sigla = await carregarModulo("src/motores/siglaDoPedido.js");
const {
  normalizarSigla, siglaDaPeca, textoDaSigla, larguraDoTextoCm, lugarDaSigla,
  ALTURA_DA_LETRA_CM, RECUO_DA_SIGLA_CM,
} = sigla;

let casos = 0;
const caso = (nome, fn) => { fn(); casos++; console.log(`  ok  ${nome}`); };

// ---------- 1. A sigla da peça, nos nomes reais da produção ----------
caso("sigla da peça pelos nomes da produção", () => {
  const nomes = {
    "COSTAS_Camisa JOGO (Dry Tech) BRANCA Tam G =": "COG",
    "MANGA C1_Camisa Polo (Dry Tech) VINHO - Tam 3G =": "MA3G",
    "LATERAL 1_Short JOGO (Dry Tech) BRANCA Tam GG =": "LAGG",
    "FRETE 2_Short JOGO (Dry Tech) BRANCA Tam M =": "FRM",
    "FRENTE_Camisa Polo Tamanho P": "FRP",
    "Manga curta G": "MAG",
    "M1": "M1",
    "36   4x": "36",
    "windbanner auto escola": "WI",
    "ção_ÉPICA": "CA",
  };
  for (const [nome, esperado] of Object.entries(nomes)) {
    assert.equal(siglaDaPeca(nome), esperado, nome);
  }
});

caso("normalizar tira acento, espaço e o que não é letra ou número", () => {
  assert.equal(normalizarSigla("joão-2 ç"), "JOAO2C");
  assert.equal(normalizarSigla("abcdefghij"), "ABCDEF");
  assert.equal(normalizarSigla("  "), "");
});

caso("texto da sigla: pedido, peça e cópia só com mais de uma", () => {
  assert.equal(textoDaSigla({ pedido: "P2", nome: "COSTAS Tam G", qtd: 5, copia: 3 }), "P2 COG3");
  assert.equal(textoDaSigla({ pedido: "P2", nome: "COSTAS Tam G", qtd: 1, copia: 1 }), "P2 COG");
  assert.equal(textoDaSigla({ pedido: "joao", sigla: "xy", nome: "COSTAS", qtd: 2, copia: 2 }), "JOAO XY2");
  // Sem pedido gravado, a peça é do P1.
  assert.equal(textoDaSigla({ nome: "COSTAS", qtd: 1, copia: 1 }), "P1 CO");
});

caso("largura do texto pela fonte, sem NaN em caractere estranho", () => {
  // P667 2:556 espaço278 C722 O778 G778 3:556 = 4335 milésimos do corpo;
  // corpo = 0,4 / 0,688.
  const esperado = 4.335 * (0.4 / 0.688);
  assert.ok(Math.abs(larguraDoTextoCm("P2 COG3") - esperado) < 1e-9);
  const estranho = larguraDoTextoCm("Ç-a");
  assert.ok(Number.isFinite(estranho) && estranho > 0);
});

// ---------- 2. O lugar da sigla dentro da silhueta ----------
const PASSO = 0.2;
/** Uma posição de mentira com a máscara `desenho` dada por uma função (c, r) → 0/1. */
function posicao(cols, rows, cheio, extra = {}) {
  const desenho = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) desenho[r * cols + c] = cheio(c, r) ? 1 : 0;
  return {
    x: 10, y: 20, largura: cols * PASSO, altura: rows * PASSO, passo: PASSO,
    mascara: { cols, rows, desenho, offX: 0, offY: 0, recuo: 0 },
    ...extra,
  };
}
/** O retângulo do texto (com o recuo) cai inteiro em células cheias? */
function dentro(p, lugar) {
  const m = p.mascara;
  const x0 = lugar.x - RECUO_DA_SIGLA_CM - (p.x + m.offX - m.recuo);
  const y0 = lugar.y - RECUO_DA_SIGLA_CM - (p.y + m.offY - m.recuo);
  const x1 = x0 + lugar.largura + 2 * RECUO_DA_SIGLA_CM;
  const y1 = y0 + lugar.altura + 2 * RECUO_DA_SIGLA_CM;
  for (let r = Math.floor(y0 / p.passo + 1e-9); r < Math.ceil(y1 / p.passo - 1e-9); r++) {
    for (let c = Math.floor(x0 / p.passo + 1e-9); c < Math.ceil(x1 / p.passo - 1e-9); c++) {
      if (r < 0 || c < 0 || r >= m.rows || c >= m.cols || !m.desenho[r * m.cols + c]) return false;
    }
  }
  return true;
}

caso("retângulo cheio: canto de baixo à esquerda, com o recuo", () => {
  const p = posicao(100, 50, () => true); // 20 x 10 cm
  const lugar = lugarDaSigla(p, "P2 COG3");
  assert.ok(lugar);
  assert.ok(Math.abs(lugar.x - (10 + RECUO_DA_SIGLA_CM)) < 1e-9, `x ${lugar.x}`);
  // Embaixo: a base da caixa fica a recuo + o que sobra da célula do fundo.
  assert.ok(lugar.y + lugar.altura <= 30 - RECUO_DA_SIGLA_CM + 1e-9);
  assert.ok(lugar.y + lugar.altura >= 30 - RECUO_DA_SIGLA_CM - PASSO);
  assert.equal(lugar.altura, ALTURA_DA_LETRA_CM);
  assert.ok(dentro(p, lugar));
});

caso("canto de baixo cortado: a sigla anda para a direita na mesma linha", () => {
  // Abaixo da linha 30 o canto esquerdo some em diagonal.
  const p = posicao(100, 50, (c, r) => r <= 30 || c >= (r - 30) * 2);
  const lugar = lugarDaSigla(p, "P2 COG3");
  assert.ok(lugar && dentro(p, lugar));
  assert.ok(lugar.x > 10 + RECUO_DA_SIGLA_CM, "saiu do canto cortado");
  assert.ok(lugar.y + lugar.altura >= 30 - RECUO_DA_SIGLA_CM - PASSO, "ficou embaixo");
});

caso("pé estreito: a sigla sobe até caber", () => {
  // As 10 linhas de baixo têm só 8 células (1,6 cm): o texto não cabe ali.
  const p = posicao(100, 50, (c, r) => r < 40 || c < 8);
  const lugar = lugarDaSigla(p, "P2 COG3");
  assert.ok(lugar && dentro(p, lugar));
  assert.ok(lugar.y + lugar.altura <= 20 + 40 * PASSO, "subiu acima do pé");
});

caso("tira estreita demais: sem sigla", () => {
  const p = posicao(10, 300, () => true); // 2 cm de largura
  assert.equal(lugarDaSigla(p, "P2 LAGG3"), null);
});

caso("sem máscara (encaixe por caixa): usa a caixa da peça", () => {
  const p = { x: 5, y: 7, largura: 30, altura: 40, passo: PASSO };
  const lugar = lugarDaSigla(p, "P1 CO");
  assert.ok(lugar);
  assert.ok(Math.abs(lugar.x - (5 + RECUO_DA_SIGLA_CM)) < 1e-9);
  assert.ok(Math.abs(lugar.y + lugar.altura - (47 - RECUO_DA_SIGLA_CM)) < 1e-9);
});

caso("as quatro rotações de uma peça de verdade: sempre dentro", async () => {});

console.log(`\nbancada:pedidos — ${casos} casos ok`);
```

O último caso fica vazio por enquanto: ele é preenchido no Step 6, depois de a função existir (precisa do motor de máscaras).

- [ ] **Step 2: Ligar o script e ver falhar**

Em `package.json`, depois de `"bancada:margem"`:

```json
    "bancada:pedidos": "node bancada/conferir-pedidos.mjs",
```

Run: `npm run bancada:pedidos`
Expected: FAIL — o esbuild não acha `src/motores/siglaDoPedido.js`.

- [ ] **Step 3: Escrever `src/motores/siglaDoPedido.js`**

```js
/**
 * ===========================================================================
 * A SIGLA DO PEDIDO — o que sai impresso no tecido para separar os pedidos
 * ===========================================================================
 *
 * Dois pedidos no mesmo rolo economizam tecido (medido em 2026-10-01: camisas
 * + tiras juntas gastaram 5,3% menos que separadas), mas depois do corte
 * alguém precisa saber de quem é cada peça. A resposta vai impressa NA peça:
 * `P2 COG3` — pedido, sigla da peça e a cópia —, no canto de baixo à
 * esquerda, dentro da silhueta, com 4 mm de letra.
 *
 * Tudo aqui é conta, sem tela: a tela, o PNG e o PDF pedem o lugar daqui, e
 * por isso a sigla sai no mesmo lugar nos três.
 *
 * A LARGURA DO TEXTO É A DA FONTE DO PDF
 * --------------------------------------
 * O servidor escreve com Liberation Sans Bold (servidor/fontes). Medir com a
 * fonte da tela daria outra largura, e o lugar achado aqui deixaria de caber
 * no que o PDF imprime. A tabela abaixo é a largura de avanço de cada
 * caractere dessa fonte, em milésimos do corpo (lida com o fontkit, que vem
 * com o pdfkit). A sigla só tem A-Z, 0-9 e espaço — `normalizarSigla` garante.
 */

/** Altura da maiúscula, em cm. É o "4 mm" combinado. */
export const ALTURA_DA_LETRA_CM = 0.4;
/** Distância mínima da caixa do texto à borda da peça, em cm. */
export const RECUO_DA_SIGLA_CM = 0.3;
/** Grossura do contorno branco em volta da letra, em cm. */
export const CONTORNO_DA_LETRA_CM = 0.03;
/** Altura da maiúscula da Liberation Sans Bold, em fração do corpo. */
export const ALTURA_DE_MAIUSCULA = 0.688;

const LARGURAS = {
  " ": 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};
const LARGURA_DESCONHECIDA = 778;

const PEDIDO_PADRAO = "P1";

/** Só A-Z e 0-9, sem acento, maiúsculo, até `max` caracteres. */
export function normalizarSigla(texto, max = 6) {
  return String(texto == null ? "" : texto)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, max);
}

// "Tam G", "TAM 3G", "Tamanho GG", "tam: 10".
const TAMANHO = /(?:^|[^A-Z0-9])(?:TAMANHO|TAM)[\s_.:-]*([0-9]?G{1,2}|XG|P{1,2}|M|[0-9]{1,2})(?![A-Z0-9])/;
// O tamanho solto no fim de uma palavra: "Manga curta G", "COSTAS_GG".
const TAMANHO_SOLTO = /(?:^|[\s_-])(PP|P|M|GG|G|XG|[2-5]G)(?=$|[\s_.=-])/;

/**
 * A sigla da peça a partir do nome do arquivo: as duas primeiras letras da
 * primeira palavra, mais o tamanho quando o nome traz um.
 * `COSTAS_Camisa JOGO (Dry Tech) BRANCA Tam G =` → `COG`.
 */
export function siglaDaPeca(nome) {
  const limpo = String(nome == null ? "" : nome)
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const palavra = (limpo.match(/[A-Z0-9]+/) || [""])[0];
  const resto = limpo.slice(limpo.indexOf(palavra) + palavra.length);
  const tamanho = limpo.match(TAMANHO) || resto.match(TAMANHO_SOLTO);
  return normalizarSigla(palavra.slice(0, 2) + (tamanho ? tamanho[1] : ""));
}

/** `P2 COG3`: pedido, sigla da peça e a cópia (só quando há mais de uma). */
export function textoDaSigla({ pedido, sigla, nome, qtd, copia }) {
  const doPedido = normalizarSigla(pedido) || PEDIDO_PADRAO;
  const daPeca = normalizarSigla(sigla) || siglaDaPeca(nome);
  const daCopia = Number(qtd) > 1 && Number(copia) > 0 ? String(copia) : "";
  return [doPedido, `${daPeca}${daCopia}`].filter(Boolean).join(" ");
}

/** O corpo da fonte, em cm, que dá `alturaLetraCm` de maiúscula. */
export function tamanhoDaFonteCm(alturaLetraCm = ALTURA_DA_LETRA_CM) {
  return alturaLetraCm / ALTURA_DE_MAIUSCULA;
}

/** A largura do texto escrito na fonte do PDF, em cm. */
export function larguraDoTextoCm(texto, alturaLetraCm = ALTURA_DA_LETRA_CM) {
  let milesimos = 0;
  for (const ch of String(texto)) milesimos += LARGURAS[ch] || LARGURA_DESCONHECIDA;
  return (milesimos / 1000) * tamanhoDaFonteCm(alturaLetraCm);
}

/**
 * Onde a sigla cabe dentro da peça, em cm no rolo — ou `null`.
 *
 * O retângulo procurado é o do texto mais o recuo dos quatro lados. A busca
 * vai da linha de baixo da máscara para cima, até a metade da peça, e em cada
 * linha da esquerda para a direita: o primeiro lugar em que TODAS as células
 * do retângulo são peça é o escolhido. "Embaixo" é embaixo NO ROLO: a máscara
 * já é a da rotação em que a peça foi posta, e o texto sai sempre de pé.
 *
 * A máscara usada é a `desenho` (a silhueta real, sem a folga). A célula
 * (c, r) dela começa em `p.x + offX − recuo + c·passo` — a mesma conta do
 * `contornar`, em desenhoDoEncaixe.js.
 *
 * Sem máscara (encaixe por caixa), a peça é a caixa inteira.
 */
export function lugarDaSigla(p, texto, {
  alturaLetraCm = ALTURA_DA_LETRA_CM, recuoCm = RECUO_DA_SIGLA_CM,
} = {}) {
  if (!p) return null;
  const largura = larguraDoTextoCm(texto, alturaLetraCm);
  const altura = alturaLetraCm;
  const m = p.mascara;

  if (!m || !m.desenho || !(p.passo > 0)) {
    if (largura + 2 * recuoCm > p.largura || altura + 2 * recuoCm > p.altura) return null;
    return { x: p.x + recuoCm, y: p.y + p.altura - recuoCm - altura, largura, altura };
  }

  const passo = p.passo;
  const wC = Math.ceil((largura + 2 * recuoCm) / passo - 1e-9);
  const hC = Math.ceil((altura + 2 * recuoCm) / passo - 1e-9);
  const { cols, rows, desenho } = m;
  if (wC > cols || hC > rows) return null;

  // Soma acumulada: "o retângulo é todo peça?" em tempo constante.
  const W = cols + 1;
  const soma = new Int32Array(W * (rows + 1));
  for (let r = 0; r < rows; r++) {
    let naLinha = 0;
    for (let c = 0; c < cols; c++) {
      naLinha += desenho[r * cols + c] ? 1 : 0;
      soma[(r + 1) * W + c + 1] = soma[r * W + c + 1] + naLinha;
    }
  }
  const cheio = (c0, r0) => soma[(r0 + hC) * W + c0 + wC] - soma[r0 * W + c0 + wC]
    - soma[(r0 + hC) * W + c0] + soma[r0 * W + c0] === wC * hC;

  const recuoDaMoldura = m.recuo || 0;
  const origemX = p.x + m.offX - recuoDaMoldura;
  const origemY = p.y + m.offY - recuoDaMoldura;
  const ate = Math.min(Math.floor(rows / 2), rows - hC);
  for (let r0 = rows - hC; r0 >= ate; r0--) {
    for (let c0 = 0; c0 + wC <= cols; c0++) {
      if (!cheio(c0, r0)) continue;
      return {
        x: origemX + c0 * passo + recuoCm,
        y: origemY + (r0 + hC) * passo - recuoCm - altura,
        largura, altura,
      };
    }
  }
  return null;
}
```

O `y` encosta o texto no **fundo** do retângulo achado (`(r0 + hC)·passo − recuo − altura`): o arredondamento das células para cima sobra em cima, e a sigla fica o mais baixo possível.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run bancada:pedidos`
Expected: todos os casos `ok`, e no fim `bancada:pedidos — 10 casos ok`.

- [ ] **Step 5: Ver o caso das rotações falhar**

Troque o último caso por:

```js
const mascaraMod = await carregarModulo("src/motores/encaixeMascara.js");
{
  // Uma camiseta (ombro cortado, decote): 56 x 70 cm, como em bancada/pecas.js.
  const { gradeDaPeca, rasterizarPoligono, mascarasDeSilhueta } = mascaraMod;
  const medida = { largura: 56, altura: 70 };
  const { cols, rows } = gradeDaPeca(medida, PASSO);
  const ex = medida.largura / (cols * PASSO);
  const ey = medida.altura / (rows * PASSO);
  const poligono = [[0.02, 0.06], [0.33, 0.02], [0.5, 0.2], [0.67, 0.02], [0.98, 0.06],
    [0.86, 0.34], [0.92, 1], [0.08, 1], [0.14, 0.34]];
  const bits = rasterizarPoligono(poligono.map(([x, y]) => [x * ex, y * ey]), cols, rows);
  const mascaras = mascarasDeSilhueta({ bits, modo: "alfa" }, cols, rows, PASSO, 1, medida);
  caso("as quatro rotações de uma camiseta: sempre dentro", () => {
    for (const rot of [0, 90, 180, 270]) {
      const m = mascaras.rotacoes[rot];
      const deitada = rot === 90 || rot === 270;
      const p = {
        x: 3, y: 11, passo: PASSO, mascara: m,
        largura: deitada ? 70 : 56, altura: deitada ? 56 : 70,
      };
      const lugar = lugarDaSigla(p, "P2 COG3");
      assert.ok(lugar, `rot ${rot}: achou lugar`);
      assert.ok(dentro(p, lugar), `rot ${rot}: dentro da silhueta`);
    }
  });
}
```

(o `caso` deixa de ser `async`; apague a linha `caso("as quatro rotações de uma peça de verdade…", async () => {});`.)

Run: `npm run bancada:pedidos`
Expected: PASS em todos. Se a rotação falhar com "dentro da silhueta", o erro está na origem da célula (`offX − recuo`); confira contra `contornar` em `src/motores/desenhoDoEncaixe.js:223`.

- [ ] **Step 6: Commit**

```bash
git add src/motores/siglaDoPedido.js bancada/conferir-pedidos.mjs package.json
git commit -m "A sigla do pedido: o texto, a largura pela fonte do PDF e o lugar dentro da silhueta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Os pedidos da lista e as marcas do risco

**Files:**
- Create: `src/producao/pedidos.js`
- Modify: `bancada/conferir-pedidos.mjs`

**Interfaces:**
- Consumes: `normalizarSigla`, `textoDaSigla`, `lugarDaSigla` (Task 1).
- Produces:
  - `PEDIDO_PADRAO = "P1"`
  - `pedidoDe(peca): string`
  - `normalizarPedido(texto): string` (= `normalizarSigla(texto, 6)`)
  - `pedidosDaLista(pecas): string[]` (na ordem em que aparecem)
  - `temVariosPedidos(pecas): boolean`
  - `ultimoPedido(pecas): string`, `proximoPedido(pecas): string`
  - `marcarLote(pecas, desde: number, pedido: string): void` — só preenche quem não tem pedido
  - `renomearPedido(pecas, de, para): { ok: false } | { ok: true, pedido, juntou: boolean }`
  - `corDoPedido(pedido): string` (hex), `PALETA_DE_PEDIDOS: string[]`
  - `marcasDoRisco(r, pecas): null | { pedidos: string[], marcas: (null | { texto, x, y, largura, altura })[], semSigla: string[], legenda: { pedido, cor, quantas }[] }` — `null` com menos de 2 pedidos; os arrays são por posição de `r.posicoes`; pedido e sigla lidos de `pecas[p.item.indice]` (a lista de agora), não do item.

- [ ] **Step 1: Os casos que falham**

No fim de `bancada/conferir-pedidos.mjs`, antes do `console.log` final:

```js
// ---------- 3. Os pedidos da lista ----------
const pedidos = await carregarModulo("src/producao/pedidos.js");
const {
  pedidoDe, pedidosDaLista, temVariosPedidos, ultimoPedido, proximoPedido,
  marcarLote, renomearPedido, corDoPedido, marcasDoRisco,
} = pedidos;

caso("pedidos da lista: P1 por padrão, próximo livre, último lote", () => {
  const lista = [{ nome: "a" }, { nome: "b", pedido: "P1" }];
  assert.equal(pedidoDe(lista[0]), "P1");
  assert.deepEqual(pedidosDaLista(lista), ["P1"]);
  assert.equal(temVariosPedidos(lista), false);
  assert.equal(proximoPedido(lista), "P2");
  lista.push({ nome: "c", pedido: "P3" });
  assert.equal(proximoPedido(lista), "P2");
  assert.equal(ultimoPedido(lista), "P3");
  assert.equal(ultimoPedido([]), "P1");
  assert.equal(temVariosPedidos(lista), true);
});

caso("marcar lote só preenche quem não tem pedido", () => {
  const lista = [{ pedido: "P1" }, {}, { pedido: "JOAO" }, {}];
  marcarLote(lista, 1, "P2");
  assert.deepEqual(lista.map(pedidoDe), ["P1", "P2", "JOAO", "P2"]);
});

caso("renomear: normaliza, junta com aviso, recusa vazio", () => {
  const lista = [{ pedido: "P1" }, { pedido: "P2" }, { pedido: "P2" }];
  assert.deepEqual(renomearPedido(lista, "P2", "joão silva"), { ok: true, pedido: "JOAOSI", juntou: false });
  assert.deepEqual(lista.map(pedidoDe), ["P1", "JOAOSI", "JOAOSI"]);
  assert.deepEqual(renomearPedido(lista, "JOAOSI", "p1"), { ok: true, pedido: "P1", juntou: true });
  assert.deepEqual(pedidosDaLista(lista), ["P1"]);
  assert.deepEqual(renomearPedido(lista, "P1", " - "), { ok: false });
});

caso("a cor do pedido sai do nome", () => {
  assert.equal(corDoPedido("P2"), corDoPedido("P2"));
  assert.match(corDoPedido("P2"), /^#[0-9a-f]{6}$/i);
  assert.notEqual(corDoPedido("P1"), corDoPedido("P2"));
});

caso("marcas do risco: nada com um pedido; pedido de AGORA, não o do item", () => {
  const pecas = [
    { nome: "COSTAS Tam G", qtd: 2, pedido: "P1" },
    { nome: "LATERAL Tam M", qtd: 1, pedido: "P1" },
  ];
  const pos = (indice, copia, x) => ({
    item: { ...pecas[indice], indice, copia }, x, y: 0, largura: 30, altura: 40, passo: 0.2,
  });
  const r = { posicoes: [pos(0, 1, 0), pos(0, 2, 40), pos(1, 1, 80)] };
  assert.equal(marcasDoRisco(r, pecas), null);

  // Renomeado depois do encaixe: o item ainda diz P1, a lista diz P2.
  pecas[1].pedido = "P2";
  const visao = marcasDoRisco(r, pecas);
  assert.deepEqual(visao.pedidos, ["P1", "P1", "P2"]);
  assert.deepEqual(visao.marcas.map((m) => m.texto), ["P1 COG1", "P1 COG2", "P2 LAM"]);
  assert.deepEqual(visao.legenda.map((l) => [l.pedido, l.quantas]), [["P1", 2], ["P2", 1]]);
  assert.deepEqual(visao.semSigla, []);

  // Peça estreita demais: entra em semSigla com nome e cópia.
  pecas.push({ nome: "VIVO", qtd: 3, pedido: "P2" });
  r.posicoes.push({ item: { ...pecas[2], indice: 2, copia: 2 }, x: 0, y: 50, largura: 1, altura: 60, passo: 0.2 });
  const outra = marcasDoRisco(r, pecas);
  assert.equal(outra.marcas[3], null);
  assert.deepEqual(outra.semSigla, ["VIVO 2"]);
});
```

Run: `npm run bancada:pedidos`
Expected: FAIL — o esbuild não acha `src/producao/pedidos.js`.

- [ ] **Step 2: Escrever `src/producao/pedidos.js`**

```js
/**
 * ===========================================================================
 * OS PEDIDOS DO ROLO — de quem é cada peça quando dois pedidos saem juntos
 * ===========================================================================
 *
 * Juntar pedidos no mesmo rolo economiza tecido (spec de 2026-10-01), e o
 * operador decide quando pode. O pedido é um RÓTULO da peça (`peca.pedido`):
 * o motor não lê, o encaixe sai o mesmo com ou sem ele. Não é o grupo — grupo
 * prende peças numa região e desliga o sparrow, que é o contrário do que se
 * quer aqui.
 *
 * Com um pedido só nada aparece: nem chip, nem contorno, nem sigla.
 */
import { lugarDaSigla, normalizarSigla, textoDaSigla } from "../motores/siglaDoPedido";

export const PEDIDO_PADRAO = "P1";

export const normalizarPedido = (texto) => normalizarSigla(texto, 6);

/** O pedido da peça; a que veio de antes desta mudança é do P1. */
export const pedidoDe = (peca) => normalizarPedido(peca && peca.pedido) || PEDIDO_PADRAO;

/** Os pedidos da lista, na ordem em que aparecem. */
export function pedidosDaLista(pecas) {
  const vistos = [];
  (pecas || []).forEach((p) => {
    const pedido = pedidoDe(p);
    if (!vistos.includes(pedido)) vistos.push(pedido);
  });
  return vistos;
}

export const temVariosPedidos = (pecas) => pedidosDaLista(pecas).length > 1;

/** O pedido do último lote que entrou — o "Mesmo pedido" da escolha. */
export function ultimoPedido(pecas) {
  return pecas && pecas.length ? pedidoDe(pecas[pecas.length - 1]) : PEDIDO_PADRAO;
}

/** O primeiro `Pn` que ninguém usa — o "Novo pedido" da escolha. */
export function proximoPedido(pecas) {
  const usados = new Set(pedidosDaLista(pecas));
  for (let n = 1; ; n++) if (!usados.has(`P${n}`)) return `P${n}`;
}

/**
 * As peças que entraram a partir de `desde` ficam no `pedido`. Peça que já
 * chegou com pedido (a Reposição devolve o de antes) fica com o dela.
 */
export function marcarLote(pecas, desde, pedido) {
  for (let i = desde; i < pecas.length; i++) if (!pecas[i].pedido) pecas[i].pedido = pedido;
}

/**
 * Troca o nome de um pedido em todas as peças dele. Nome já usado por outro
 * pedido junta os dois (`juntou`), e quem chamou avisa.
 */
export function renomearPedido(pecas, de, para) {
  const novo = normalizarPedido(para);
  if (!novo) return { ok: false };
  const antigo = normalizarPedido(de) || PEDIDO_PADRAO;
  const juntou = novo !== antigo && pedidosDaLista(pecas).includes(novo);
  pecas.forEach((p) => { if (pedidoDe(p) === antigo) p.pedido = novo; });
  return { ok: true, pedido: novo, juntou };
}

/*
 * Paleta própria, e não a das peças: o contorno do pedido aparece POR CIMA da
 * cor de cada peça, e o chip do pedido mora ao lado do chip do grupo — com a
 * mesma paleta, os dois se confundiriam.
 */
export const PALETA_DE_PEDIDOS = [
  "#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#65a30d",
];

/** A cor sai do nome: o mesmo pedido tem sempre a mesma cor (como `corDoGrupo`). */
export function corDoPedido(pedido) {
  const nome = String(pedido || PEDIDO_PADRAO);
  let n = 0;
  for (let i = 0; i < nome.length; i++) n = (n * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA_DE_PEDIDOS[n % PALETA_DE_PEDIDOS.length];
}

/**
 * O que a tela, o PNG e o PDF precisam saber dos pedidos de um risco — ou
 * `null` com menos de dois pedidos (aí tudo sai como sempre saiu).
 *
 * O pedido e a sigla vêm de `pecas[indice]`, a lista DE AGORA: os itens do
 * risco são cópias feitas na hora do encaixe, e renomear um pedido não refaz
 * o encaixe (o motor não lê o pedido) — o nome novo tem de sair assim mesmo.
 */
export function marcasDoRisco(r, pecas) {
  if (!r || !Array.isArray(r.posicoes) || r.posicoes.length === 0) return null;
  const daLista = (p) => (pecas && pecas[p.item.indice]) || p.item;
  const doRisco = r.posicoes.map((p) => pedidoDe(daLista(p)));
  if (new Set(doRisco).size < 2) return null;

  const marcas = [];
  const semSigla = [];
  const contagem = new Map();
  r.posicoes.forEach((p, i) => {
    const fonte = daLista(p);
    const texto = textoDaSigla({
      pedido: doRisco[i], sigla: fonte.sigla, nome: p.item.nome, qtd: p.item.qtd, copia: p.item.copia,
    });
    const lugar = lugarDaSigla(p, texto);
    marcas.push(lugar ? { texto, ...lugar } : null);
    if (!lugar) semSigla.push(`${p.item.nome}${p.item.qtd > 1 ? ` ${p.item.copia}` : ""}`);
    contagem.set(doRisco[i], (contagem.get(doRisco[i]) || 0) + 1);
  });
  const legenda = [...contagem].map(([pedido, quantas]) => ({ pedido, cor: corDoPedido(pedido), quantas }));
  return { pedidos: doRisco, marcas, semSigla, legenda };
}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npm run bancada:pedidos`
Expected: todos `ok`.

- [ ] **Step 4: O motor não enxerga o pedido (caracterização)**

Estes dois casos já devem passar sem código novo: eles prendem a regra "pedido não é grupo". No fim de `bancada/conferir-pedidos.mjs`, antes do `console.log`:

A busca para pelo relógio (não há limite de tentativas no `config`), então "mesma semente → mesmo encaixe" não é determinístico e não serve de prova. A prova é mais forte e não depende de sorteio: **nenhum módulo do motor lê `x.pedido` ou `x.sigla`** — se não lê, o encaixe não tem como mudar. Hoje a palavra "pedido" só aparece no motor em comentário e numa variável local do complemento (`pedido.indice`), que a expressão abaixo não pega.

```js
// ---------- 4. O motor não enxerga o pedido ----------
const { PARA_A_BANCADA } = require("../empacotar/modulos-do-motor");
caso("nenhum módulo do motor lê o pedido ou a sigla da peça", () => {
  for (const modulo of PARA_A_BANCADA) {
    const codigo = fs.readFileSync(path.join(RAIZ, "src", modulo), "utf8");
    const achado = codigo.match(/\b\w+\.(?:pedido|sigla)\b/);
    assert.equal(achado, null, `${modulo} lê "${achado && achado[0]}"`);
  }
});

const { carregarMotor } = require("./motor");
const motor = await carregarMotor({ comWasm: false });
caso("pedido não desliga o sparrow (não é grupo)", () => {
  const itens = [{ pedido: "P1", mascaras: { rotacoes: { 0: {} } } }, { pedido: "P2", mascaras: { rotacoes: { 0: {} } } }];
  assert.equal(motor.motivoDoTrabalho(itens, { comprimentoBancada: 0 }), null);
  assert.equal(motor.motivoDoTrabalho([{ ...itens[0], grupo: "A" }], { comprimentoBancada: 0 }), "grupos marcados");
});
```

E, no topo do arquivo, junto dos outros `import`:

```js
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
```

Run: `npm run bancada:pedidos`
Expected: todos `ok`.

- [ ] **Step 5: Commit**

```bash
git add src/producao/pedidos.js bancada/conferir-pedidos.mjs
git commit -m "Os pedidos da lista: próximo e último, renomear, a cor e as marcas de cada peça no risco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: O alerta com um terceiro botão

**Files:**
- Modify: `src/casca/Alerta.tsx` (tipos ~44-68, botões ~208-221, `concluir` ~294-307, `aoConfirmar`/`aoCancelar` ~131-139 e ~355-356, reserva sem provedor ~375-382)

**Interfaces:**
- Produces: `OpcoesDoAlerta.alternativa?: string` (texto do botão do meio); `RespostaDoAlerta.alternativa: boolean` (`true` só quando ele foi clicado). Chega ao controlador por `window.__alertaOptmize.mostrar(...)`.

- [ ] **Step 1: Tipos**

Em `OpcoesDoAlerta`, depois de `cancelavel`:

```ts
  /** Um segundo caminho, ao lado do confirmar. A resposta vem em `alternativa`. */
  alternativa?: string;
```

Em `RespostaDoAlerta`, depois de `confirmado`:

```ts
  /** O botão da `alternativa` foi o clicado. */
  alternativa: boolean;
```

- [ ] **Step 2: O provedor responde a alternativa**

`concluir` ganha o terceiro parâmetro e repassa:

```ts
  const concluir = useCallback((id: number, confirmado: boolean, alternativa = false) => {
    if (atual.current !== id) return;
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = null;
    const resolve = responder.current;
    responder.current = null;
    resolve?.({ confirmado, alternativa, valor: valorAtual.current.trim() });
```

Todo outro `resolve`/`responder.current?.(...)` do arquivo (o "dispensado" em `abrir`, e as respostas da reserva sem provedor em `mostrar`, ~378-381) ganha `alternativa: false` no objeto. Rode `npx tsc --noEmit -p .` depois: o TypeScript aponta qualquer um que faltou.

Na caixa, as props ganham `aoAlternativa: () => void`, ligadas como `aoAlternativa={() => concluir(id, false, true)}` ao lado de `aoConfirmar`/`aoCancelar`.

- [ ] **Step 3: O botão**

Em `alerta-botoes`, entre o cancelar e o confirmar:

```tsx
            {opcoes.alternativa && (
              <button type="button" onClick={aoAlternativa} className="alerta-botao secundario">
                {opcoes.alternativa}
              </button>
            )}
```

O confirmar continua sendo o que recebe o foco (Enter = confirmar), e Esc continua sendo cancelar.

- [ ] **Step 4: Conferir**

Run: `npx tsc --noEmit -p .` — Expected: sem erro.
Run: `npm run bancada:react` — Expected: passa como antes.

- [ ] **Step 5: Commit**

```bash
git add src/casca/Alerta.tsx
git commit -m "O alerta ganha um segundo caminho ao lado do confirmar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: O pedido entra com as peças, e a lista mostra

**Files:**
- Modify: `src/producao/controlador.js` — imports no topo; `adicionarArquivos` (~1058); `mandarMoldeParaOEncaixe` (~731); `mandarProjetoParaOEncaixe` (~902, push ~975); complemento (push ~4585); `renderPecasEncaixe` (~1529, chip ~1582, gaveta ~1629); ouvinte `change` (~1863); despachante de clique (~2030)

**Interfaces:**
- Consumes: `PEDIDO_PADRAO`, `pedidoDe`, `ultimoPedido`, `proximoPedido`, `marcarLote`, `renomearPedido`, `corDoPedido`, `temVariosPedidos`, `normalizarPedido` (Task 2); `siglaDaPeca`, `normalizarSigla` (Task 1); `alternativa` (Task 3).
- Produces: `pecasEncaixe[i].pedido: string`, `pecasEncaixe[i].sigla?: string`; `async function pedidoDoLote(quantos: number): Promise<string | null>` (null = cancelou).

- [ ] **Step 1: Imports**

No topo de `src/producao/controlador.js`, junto dos outros imports:

```js
import {
  PEDIDO_PADRAO, corDoPedido, marcarLote, normalizarPedido, pedidoDe, proximoPedido,
  renomearPedido, temVariosPedidos, ultimoPedido,
} from "./pedidos";
import { normalizarSigla, siglaDaPeca } from "../motores/siglaDoPedido";
```

- [ ] **Step 2: A escolha do pedido**

Logo antes de `async function adicionarArquivos(files) {`:

```js
/**
 * De qual pedido é o lote que está entrando.
 *
 * Lista vazia: é o primeiro pedido, sem pergunta. Lista com peças: "Mesmo
 * pedido" (Enter) ou "Novo pedido"; Esc desiste da entrada. Sem a caixa nova
 * (o editor fora da casca), fica no mesmo pedido — o jeito de antes.
 * Devolve o pedido, ou `null` se a pessoa desistiu.
 */
async function pedidoDoLote(quantos) {
  if (pecasEncaixe.length === 0) return PEDIDO_PADRAO;
  const mesmo = ultimoPedido(pecasEncaixe);
  const novo = proximoPedido(pecasEncaixe);
  const ponte = window.__alertaOptmize;
  if (!ponte) return mesmo;
  const r = await ponte.mostrar({
    tipo: "pergunta",
    titulo: "De qual pedido são estas peças?",
    texto: `${quantos === 1 ? "1 arquivo está" : `${quantos} arquivos estão`} entrando numa lista que já tem peças. `
      + "Pedidos diferentes saem no mesmo rolo, e cada peça leva impressa a sigla do seu pedido.",
    confirmar: `Mesmo pedido (${mesmo})`,
    alternativa: `Novo pedido (${novo})`,
    cancelavel: true,
  });
  if (r.alternativa) return novo;
  return r.confirmado ? mesmo : null;
}
```

- [ ] **Step 3: Os quatro caminhos de entrada**

`adicionarArquivos`: depois do bloco `if (carregamentoAtivo) { … return; }` e antes de `limparErroEncaixe();`:

```js
  const pedido = await pedidoDoLote(files.length);
  if (!pedido) return;
```

e na "Passada 2", logo depois do `prontas.forEach(...)`:

```js
    marcarLote(pecasEncaixe, totalAntes, pedido);
```

`mandarMoldeParaOEncaixe`: logo depois de `if (carregamentoAtivo) throw …;`:

```js
  const pedido = await pedidoDoLote(pecas.length);
  if (!pedido) return;
```

e depois do `for` que faz os `pecasEncaixe.push` (antes do `renderPecasEncaixe();` do fim do `try`):

```js
    marcarLote(pecasEncaixe, totalAntes, pedido);
```

`mandarProjetoParaOEncaixe` (é por aqui que a Reposição devolve peças): a pergunta só aparece se alguma peça veio **sem** pedido:

```js
  const precisaPerguntar = pecas.some((p) => !p.pedido);
  const pedido = precisaPerguntar ? await pedidoDoLote(pecas.length) : null;
  if (precisaPerguntar && !pedido) return;
```

no `pecasEncaixe.push({ … })` desse caminho (~975), depois de `origem: …`:

```js
        pedido: p.pedido ? normalizarPedido(p.pedido) : undefined,
        sigla: p.sigla ? normalizarSigla(p.sigla) : undefined,
```

e depois do laço, antes de `renderPecasEncaixe();`:

```js
    if (pedido) marcarLote(pecasEncaixe, totalAntes, pedido);
```

Complemento (~4585): troque

```js
      pecasEncaixe.push({ ...p.c.peca, id: proximoIdPeca++, qtd: p.quantidade });
```

por

```js
      // Peça do próprio encaixe já tem pedido (o spread leva); da Galeria,
      // entra no pedido do último lote.
      pecasEncaixe.push({
        ...p.c.peca, id: proximoIdPeca++, qtd: p.quantidade,
        pedido: p.c.peca.pedido || ultimoPedido(pecasEncaixe),
      });
```

Quem chama `mandarMoldeParaOEncaixe` / `mandarProjetoParaOEncaixe` espera a volta da promessa; o `return` sem valor no cancelamento é tratado como "nada entrou" — confira os chamadores (`grep -n "mandarMoldeParaOEncaixe\|mandarProjetoParaOEncaixe" src -r`) e, se algum deles mostra "Peças enviadas" depois do `await`, faça a função devolver `false` no cancelamento e o chamador não mostrar nada nesse caso.

- [ ] **Step 4: O chip na linha**

No começo de `renderPecasEncaixe`, depois do bloco da lista vazia:

```js
  const variosPedidos = temVariosPedidos(pecasEncaixe);
```

Na linha da peça, logo depois do chip do grupo (`${peca.grupo ? … : ""}`):

```js
            ${variosPedidos ? `<span data-pedido="${escapeHtml(pedidoDe(peca))}"
                   class="shrink-0 cursor-pointer rounded px-1 font-mono text-[8px] font-semibold uppercase leading-[1.4] text-white"
                   style="background: ${corDoPedido(pedidoDe(peca))};"
                   title="Pedido ${escapeHtml(pedidoDe(peca))} — clique para renomear">${escapeHtml(pedidoDe(peca))}</span>` : ""}
```

O chip do pedido é **cheio**; o do grupo é contornado (fundo 22, borda 66) — é isso que separa os dois à vista.

- [ ] **Step 5: Renomear pelo chip**

Antes do ouvinte de clique de `encaixePecasBody` (~2030 é o fim dele; procure `escopo.ouvir(encaixePecasBody, "click"`), uma função:

```js
/** Renomeia o pedido em todas as peças dele. Não refaz o encaixe: o motor não lê o pedido. */
async function renomearPedidoNaTela(atual) {
  const escrito = await uiPergunta({
    titulo: `Renomear o pedido ${atual}`,
    texto: "Até 6 letras ou números. É a sigla que sai impressa em cada peça deste pedido.",
    valor: atual,
    exemplo: "JOAO",
    confirmar: "Renomear",
  });
  if (escrito == null) return;
  const r = renomearPedido(pecasEncaixe, atual, escrito);
  if (!r.ok) {
    mostrarErroEncaixe("O nome do pedido precisa de pelo menos uma letra ou número.", "aviso");
    return;
  }
  renderPecasEncaixe();
  if (ultimoResultado) redesenharRisco();
  if (r.juntou) mostrarErroEncaixe(`O pedido ${atual} entrou no ${r.pedido}, que já existia.`, "aviso");
}
```

E, no ouvinte de clique, **antes** de `const linha = e.target.closest("[data-sel-peca]");`:

```js
  const chipDoPedido = e.target.closest("[data-pedido]");
  if (chipDoPedido) {
    void renomearPedidoNaTela(chipDoPedido.dataset.pedido);
    return;
  }
```

(Confira o nome `redesenharRisco` em `src/producao/controlador.js:3989`; é ele que repinta o risco que está na tela.)

- [ ] **Step 6: O campo Sigla na gaveta**

Na gaveta (`data-detalhes`), depois do `<div class="mt-1.5 grid grid-cols-2 gap-1.5">` do Girar/Contorno, um terceiro bloco que só aparece com 2+ pedidos:

```js
        ${variosPedidos ? `
        <div class="mt-1.5 grid grid-cols-2 gap-1.5">
          <label class="${CAMPO_MINI}">Sigla no tecido
            <input type="text" maxlength="6" value="${escapeHtml(normalizarSigla(peca.sigla) || siglaDaPeca(peca.nome))}"
                   data-campo="sigla" data-id="${peca.id}" />
          </label>
        </div>` : ""}
```

No ouvinte `change` (~1863), troque a primeira linha de filtro por:

```js
  if (campo !== "girar" && campo !== "contorno" && campo !== "sigla") return;
```

e, depois de `if (campo === "girar") peca.giro = e.target.value;`:

```js
  if (campo === "sigla") {
    const escrita = normalizarSigla(e.target.value);
    // Igual à automática, ou vazia: volta a valer a automática.
    peca.sigla = escrita && escrita !== siglaDaPeca(peca.nome) ? escrita : undefined;
    e.target.value = normalizarSigla(peca.sigla) || siglaDaPeca(peca.nome);
    if (ultimoResultado) redesenharRisco();
  }
```

O ouvinte `input` (~1728) não precisa mudar: ele só age em `largura`, `altura` e `qtd`.

- [ ] **Step 7: Conferir na tela**

Run: `npm run dev:app` (e o servidor já de pé em `npm run dev`). No Encaixe:
1. Arrastar 2 arquivos na lista vazia → entram sem pergunta, sem chip.
2. Arrastar mais 1 → a caixa pergunta; "Novo pedido (P2)" → as linhas ganham chips `P1`/`P2` em cores diferentes.
3. Arrastar mais 1 e apertar Esc → nada entra.
4. Clicar no chip `P2`, escrever `joão` → todas as peças do P2 viram `JOAO`.
5. Abrir a gaveta de uma peça → campo "Sigla no tecido" com a sigla automática; escrever `xy`, sair do campo → vira `XY`.

Run: `npm run bancada:tela` — Expected: passa como antes (lista com um pedido não mudou).

- [ ] **Step 8: Commit**

```bash
git add src/producao/controlador.js
git commit -m "O Encaixe pergunta de qual pedido é o lote, mostra o chip e deixa renomear e trocar a sigla

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: O risco na tela e o PNG da mesa com os pedidos

**Files:**
- Modify: `src/motores/desenhoDoEncaixe.js` (`desenharEncaixe` ~326, laço das peças ~413-451, `escreverNome` ~539, ramo deitado ~518-525)
- Modify: `src/producao/controlador.js` (as 5 chamadas de `desenharEncaixe` com `comLegenda: true`: ~3349, ~3359, ~3381, ~3904, ~3992; o PNG ~3370-3395; o resumo do resultado)

**Interfaces:**
- Consumes: `marcasDoRisco` → `{ pedidos, marcas, legenda }` (Task 2); `corDoPedido` (Task 2); `tamanhoDaFonteCm`, `CONTORNO_DA_LETRA_CM` (Task 1).
- Produces: opção `pedidos` de `desenharEncaixe` (o retorno de `marcasDoRisco`, ou `null`); `function visaoDosPedidos(r)` no controlador (com cache).

- [ ] **Step 1: `desenharEncaixe` aceita os pedidos**

Na assinatura, depois de `selecao = SEM_SELECAO,`:

```js
  /** O retorno de `marcasDoRisco` (src/producao/pedidos.js), ou null com um pedido só. */
  pedidos = null,
```

Import no topo:

```js
import { corDoPedido } from "../producao/pedidos";
import { CONTORNO_DA_LETRA_CM, tamanhoDaFonteCm } from "./siglaDoPedido";
```

No laço das peças, troque `r.posicoes.forEach((p) => {` por `r.posicoes.forEach((p, i) => {` e a linha da cor por:

```js
    const pedido = pedidos ? pedidos.pedidos[i] : null;
    const cor = pedido ? corDoPedido(pedido) : corDaPeca(p.item.indice);
```

Depois do contorno da peça (o `if (p.mascara) { contornar(...) } else { ... strokeRect ... }`), com pedidos, um segundo traço da caixa, grosso, na cor do pedido:

```js
    if (pedido) {
      ctx.strokeStyle = cor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
```

Depois do bloco da seleção e antes do `escreverNome`, a sigla — no lugar do rolo em que ela vai ser impressa, girando junto com o rolo quando a tela está deitada:

```js
    const marca = pedidos && pedidos.marcas[i];
    if (marca) desenharSigla(ctx, marca, REGUA, px);
```

e a tarja do nome com o pedido na frente:

```js
    if (comLegenda && !deitar && w > 46 && h > 18) {
      escreverNome(ctx, p, x, y, w, h, pedido);
    }
```

No ramo deitado (~518-525), a mesma troca no `forEach` e no `escreverNome`:

```js
      r.posicoes.forEach((p, i) => {
        …
        if (w > 46 && h > 18) escreverNome(ctx, p, x, y, w, h, pedidos ? pedidos.pedidos[i] : null);
      });
```

- [ ] **Step 2: `escreverNome` com o pedido e `desenharSigla`**

```js
/** O nome da peça, numa tarja escura para não sumir dentro da arte. */
export function escreverNome(ctx, p, x, y, w, h, pedido = null) {
  const nome = `${p.item.nome}${p.item.qtd > 1 ? ` ${p.item.copia}` : ""}`;
  const texto = pedido ? `${pedido} · ${nome}` : nome;
  …o resto como está…
}

/**
 * A sigla do pedido, onde e do tamanho que ela sai impressa: preta, com
 * contorno branco, de pé no sentido do rolo. Na tela deitada ela gira junto
 * com o rolo — é o mesmo desenho, visto de lado.
 */
export function desenharSigla(ctx, marca, REGUA, px) {
  const corpo = tamanhoDaFonteCm(marca.altura) * px;
  if (corpo < 4) return; // no zoom de tela viraria borrão
  const x = REGUA + marca.x * px;
  const base = (marca.y + marca.altura) * px;
  ctx.save();
  ctx.font = `bold ${corpo}px "Liberation Sans", Arial, Helvetica, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, 2 * CONTORNO_DA_LETRA_CM * px);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(marca.texto, x, base);
  ctx.fillStyle = "#000000";
  ctx.fillText(marca.texto, x, base);
  ctx.restore();
}
```

O laço das peças roda dentro do giro da tela deitada (o `ctx.restore()` com o comentário "fim do giro" vem depois dele), então desenhar no quadro do rolo já faz a sigla girar junto — não há conta a mais para o deitado.

- [ ] **Step 3: O controlador passa os pedidos**

Import no topo (junto do da Task 4): acrescente `marcasDoRisco` ao `import … from "./pedidos";`.

Uma função perto de `redesenharRisco`:

```js
/**
 * Os pedidos do risco que está na tela, guardados no próprio resultado: a
 * conta do lugar da sigla passa por todas as células de cada peça, e o risco é
 * redesenhado a cada zoom. A chave muda quando um pedido ou uma sigla muda.
 */
function visaoDosPedidos(r) {
  if (!r) return null;
  const chave = pecasEncaixe.map((p) => `${pedidoDe(p)}/${p.sigla || ""}`).join("|");
  if (!r._pedidos || r._pedidos.chave !== chave) {
    r._pedidos = { chave, valor: marcasDoRisco(r, pecasEncaixe) };
  }
  return r._pedidos.valor;
}
```

Nas cinco chamadas com `comLegenda: true`, acrescente `pedidos: visaoDosPedidos(r)` (ou `visaoDosPedidos(ultimoResultado)`, conforme a variável de cada uma). Exemplo:

```js
  vistaDoRisco = desenharEncaixe(encaixeCanvas, r,
    { escala: null, comLegenda: true, zoom: zoomDoRisco, selecao: selecaoNoRisco, pedidos: visaoDosPedidos(r) });
```

A miniatura da reposição (`comLegenda: false`, ~3505) fica sem.

- [ ] **Step 4: A legenda no PNG**

No exportar PNG (~3381), troque

```js
    const temp = document.createElement("canvas");
    desenharEncaixe(temp, ultimoResultado, { escala: 4, comLegenda: true });
    const imagem = await new Promise((pronto) => temp.toBlob(pronto, "image/png"));
```

por

```js
    const visao = visaoDosPedidos(ultimoResultado);
    const temp = document.createElement("canvas");
    desenharEncaixe(temp, ultimoResultado, { escala: 4, comLegenda: true, pedidos: visao });
    const final = visao ? comLegendaDosPedidos(temp, visao.legenda) : temp;
    const imagem = await new Promise((pronto) => final.toBlob(pronto, "image/png"));
```

e a função, perto de `visaoDosPedidos`:

```js
/** O PNG da mesa de corte com uma faixa no topo: cor, sigla e quantas peças de cada pedido. */
function comLegendaDosPedidos(desenho, legenda) {
  const FAIXA = 30;
  const saida = document.createElement("canvas");
  saida.width = desenho.width;
  saida.height = desenho.height + FAIXA;
  const ctx = saida.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, saida.width, FAIXA);
  ctx.drawImage(desenho, 0, FAIXA);
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  let x = 10;
  legenda.forEach(({ pedido, cor, quantas }) => {
    ctx.fillStyle = cor;
    ctx.fillRect(x, 8, 14, 14);
    x += 20;
    const texto = `${pedido} · ${quantas} peça${quantas === 1 ? "" : "s"}`;
    ctx.fillStyle = "#111111";
    ctx.fillText(texto, x, FAIXA / 2);
    x += ctx.measureText(texto).width + 24;
  });
  return saida;
}
```

- [ ] **Step 5: O resultado diz quantos pedidos**

Onde o resumo do resultado é montado (o array `partes` com "o rolo encolheu…", ~3082), acrescente:

```js
  const visao = visaoDosPedidos(resultado);
  if (visao) partes.push(`${visao.legenda.length} pedidos no mesmo rolo`);
```

- [ ] **Step 6: Conferir na tela**

Com os dois pedidos da Task 4 encaixados:
1. Cada peça tem a caixa na cor do pedido, a tarja começa com `P1 ·`/`JOAO ·`, e a sigla preta com contorno branco aparece no canto de baixo à esquerda de cada peça, de pé no sentido do rolo.
2. Exportar PNG → faixa branca no topo com `■ P1 · N peças ■ JOAO · M peças`.
3. Tirar todas as peças de um pedido e refazer → sem contorno, sem sigla, PNG sem faixa — como antes.

Run: `npm run bancada:tela && npm run bancada:pedidos` — Expected: passam.

- [ ] **Step 7: Commit**

```bash
git add src/motores/desenhoDoEncaixe.js src/producao/controlador.js
git commit -m "O risco e o PNG da mesa mostram o pedido de cada peça: a cor, a sigla e a legenda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: O PDF escreve a sigla no tecido

**Files:**
- Create: `servidor/fontes/LiberationSans-Bold.ttf`, `servidor/fontes/LICENSE_LIBERATION` (cópias de `node_modules/pdfjs-dist/standard_fonts/`)
- Modify: `servidor/encaixe-pdf.js` (cabeçalho ~1-10; `montarPdf` ~421-545; rota ~563)
- Modify: `bancada/conferir-pedidos.mjs`

**Interfaces:**
- Consumes: cada posição do corpo do PDF pode trazer `marca: { texto, x, y, alturaCm }` — `x,y` em cm na página **já com o deslocamento da bancada aplicado**, canto de cima à esquerda da caixa das maiúsculas.
- Produces: `montarPdf` escreve as marcas; o relatório ganha `marcas: number` (quantas foram escritas).

- [ ] **Step 1: O caso que falha**

Em `bancada/conferir-pedidos.mjs` (os `import` vão para o topo):

```js
import stream from "node:stream";
import sharp from "sharp";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
```

e no fim:

```js
// ---------- 5. O PDF escreve a sigla, e só quando ela veio ----------
const { montarPdf } = require("../servidor/encaixe-pdf");
async function pdfDe(posicoes) {
  const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: "#3366cc" } }).png().toBuffer();
  const destino = new stream.PassThrough();
  const pedacos = [];
  destino.on("data", (b) => pedacos.push(b));
  const fim = new Promise((ok, erro) => { destino.on("end", ok); destino.on("error", erro); });
  const relatorio = await montarPdf({
    larguraTecido: 100, consumo: 60, posicoes, buffers: new Map([["0-0", png]]),
  }, destino);
  await fim;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(pedacos)) }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const conteudo = await (await doc.getPage(i)).getTextContent();
    texto += conteudo.items.map((it) => it.str).join(" ");
  }
  return { texto, relatorio };
}
const peca = (x, marca) => ({ chave: "0-0", x, y: 5, largura: 40, altura: 50, bancada: 0, marca });
{
  const com = await pdfDe([
    peca(2, { texto: "P1 CO1", x: 2.3, y: 54.3, alturaCm: 0.4 }),
    peca(50, { texto: "P2 LAM", x: 50.3, y: 54.3, alturaCm: 0.4 }),
  ]);
  const sem = await pdfDe([peca(2), peca(50)]);
  caso("o PDF com marcas traz o texto de cada uma", () => {
    assert.match(com.texto, /P1 CO1/);
    assert.match(com.texto, /P2 LAM/);
    assert.equal(com.relatorio.marcas, 2);
  });
  caso("o PDF sem marca não traz texto nenhum", () => {
    assert.equal(sem.texto.trim(), "");
    assert.equal(sem.relatorio.marcas, 0);
  });
}
```

Run: `npm run bancada:pedidos`
Expected: FAIL em "o PDF com marcas traz o texto de cada uma".

- [ ] **Step 2: A fonte**

```bash
mkdir -p servidor/fontes
cp node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf servidor/fontes/
cp node_modules/pdfjs-dist/standard_fonts/LICENSE_LIBERATION servidor/fontes/
```

(`empacotar/preparar.js` copia o `servidor/` inteiro para o aplicativo: a fonte vai junto sem mudar nada lá.)

- [ ] **Step 3: Escrever a marca em `montarPdf`**

Perto dos `require` do topo:

```js
// A sigla do pedido sai com esta fonte EMBUTIDA no arquivo, e não com a
// Helvetica "padrão" do PDF: o RIP da produção já mostrou que não se pode
// contar com o que ele deveria ter (ver `/UserUnit`, acima). A conta da
// largura do texto, em src/motores/siglaDoPedido.js, usa as medidas desta
// mesma fonte — trocar uma sem a outra tira a sigla de dentro da peça.
const FONTE_DA_SIGLA = path.join(__dirname, "fontes", "LiberationSans-Bold.ttf");
const ALTURA_DE_MAIUSCULA = 0.688; // a mesma de src/motores/siglaDoPedido.js
const CONTORNO_DA_LETRA_CM = 0.03;
```

Em `montarPdf`, depois de criar o `doc` e antes do laço das páginas:

```js
  const comMarca = posicoes.some((pos) => pos.marca);
  if (comMarca) doc.registerFont("sigla", FONTE_DA_SIGLA);
  let marcas = 0;
```

No laço, logo depois do `try { doc.image(...) ; desenhadas++; } catch …`:

```js
      if (pos.marca) {
        try {
          escreverMarca(doc, pos.marca, pagina.topo);
          marcas++;
        } catch (err) {
          console.warn(`[encaixe-pdf] não deu para escrever a sigla ${pos.marca.texto}:`, err && err.message);
        }
      }
```

e `marcas` entra no objeto de relatório que `montarPdf` devolve, ao lado de `desenhadas`.

A função, perto de `montarPdf`:

```js
/**
 * A sigla do pedido, impressa: texto vetorial preto com contorno branco, de
 * pé. Primeiro o contorno (o dobro da grossura, porque metade dele cai para
 * dentro da letra), depois o preenchimento por cima — assim o contorno não
 * come a letra.
 */
function escreverMarca(doc, marca, topoDaPagina) {
  const corpo = (marca.alturaCm / ALTURA_DE_MAIUSCULA) * PT_POR_CM;
  const x = marca.x * PT_POR_CM;
  const base = (marca.y + marca.alturaCm - topoDaPagina) * PT_POR_CM;
  doc.save();
  doc.font("sigla").fontSize(corpo);
  doc.lineJoin("round").lineWidth(2 * CONTORNO_DA_LETRA_CM * PT_POR_CM).strokeColor("#ffffff");
  doc.text(marca.texto, x, base, { lineBreak: false, baseline: "alphabetic", stroke: true, fill: false });
  doc.fillColor("#000000");
  doc.text(marca.texto, x, base, { lineBreak: false, baseline: "alphabetic", stroke: false, fill: true });
  doc.restore();
}
```

- [ ] **Step 4: A rota aceita só marca bem formada**

Na rota (~563), depois de validar `posicoes`, limpe as marcas:

```js
  posicoes.forEach((pos) => {
    const m = pos && pos.marca;
    if (!m) return;
    const texto = String(m.texto || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 16);
    const ok = texto && [m.x, m.y, m.alturaCm].every((n) => Number.isFinite(Number(n)))
      && Number(m.alturaCm) > 0 && Number(m.alturaCm) <= 2;
    pos.marca = ok ? { texto, x: Number(m.x), y: Number(m.y), alturaCm: Number(m.alturaCm) } : undefined;
  });
```

- [ ] **Step 5: O cabeçalho conta a exceção**

No comentário do topo, depois de "E vai só o desenho: nada de régua, nome de peça ou rodapé, porque isso seria impresso junto no tecido.":

```
 * A exceção é a SIGLA DO PEDIDO (2026-10-01): com dois pedidos ou mais no
 * mesmo rolo, cada peça leva `P2 COG3` impresso no canto de baixo, dentro da
 * silhueta, para a separação depois do corte. Quem decide o texto e o lugar
 * é a tela (src/producao/pedidos.js); aqui ele só é escrito (`escreverMarca`).
```

- [ ] **Step 6: Rodar**

Run: `npm run bancada:pedidos && npm run bancada:pdf`
Expected: todos `ok`; a bancada do PDF passa como antes.

- [ ] **Step 7: Commit**

```bash
git add servidor/fontes servidor/encaixe-pdf.js bancada/conferir-pedidos.mjs
git commit -m "O PDF escreve a sigla do pedido no tecido, com a fonte embutida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: O controlador manda as marcas e avisa quem ficou sem

**Files:**
- Modify: `src/producao/controlador.js` (`daPeca` ~3689; os dois `encaixeApi.pdf(...)`; o aviso depois de salvar)
- Modify: `bancada/conferir-pedidos.mjs`

**Interfaces:**
- Consumes: `visaoDosPedidos(r)` (Task 5) → `marcas[i]`, `semSigla`; contrato de `marca` (Task 6).
- Produces: `marcaParaOPdf(marca, deslocamento)` exportada de `src/producao/pedidos.js` (pura, testável).

- [ ] **Step 1: O caso que falha**

Em `bancada/conferir-pedidos.mjs`, junto dos imports de `pedidos`, acrescente `marcaParaOPdf` e:

```js
caso("a marca desce com a bancada, e sem marca não vai nada", () => {
  const marca = { texto: "P2 COG3", x: 12.3, y: 1054.3, largura: 2.5, altura: 0.4 };
  assert.deepEqual(marcaParaOPdf(marca, 1000), { texto: "P2 COG3", x: 12.3, y: 54.3, alturaCm: 0.4 });
  assert.equal(marcaParaOPdf(null, 0), undefined);
});
```

Run: `npm run bancada:pedidos` — Expected: FAIL (`marcaParaOPdf` não existe).

- [ ] **Step 2: A função, em `src/producao/pedidos.js`**

```js
/** A marca no formato do corpo do PDF, com o `y` contado do começo da página. */
export function marcaParaOPdf(marca, deslocamento) {
  if (!marca) return undefined;
  return { texto: marca.texto, x: marca.x, y: marca.y - deslocamento, alturaCm: marca.altura };
}
```

Run: `npm run bancada:pedidos` — Expected: PASS.

- [ ] **Step 3: `daPeca` leva a marca**

Acrescente `marcaParaOPdf` ao import de `./pedidos`. No exportar PDF, antes de `const daPeca = …`:

```js
    const visao = visaoDosPedidos(r);
    const indiceDa = new Map(r.posicoes.map((p, i) => [p, i]));
```

e em `daPeca`, depois de `bancada: p.bancada || 0,`:

```js
      marca: visao ? marcaParaOPdf(visao.marcas[indiceDa.get(p)], deslocamento) : undefined,
```

As duas chamadas (`emPedacos` e não) já passam por `daPeca`, com o deslocamento da bancada: nada mais muda nelas.

- [ ] **Step 4: O aviso de quem ficou sem sigla**

Depois de **cada** `avisarQueSalvou(...)` do PDF (os dois caminhos):

```js
      avisarSemSigla(visao);
```

e a função, perto de `visaoDosPedidos`:

```js
/** Peça estreita demais para a sigla sai sem ela; a pessoa precisa saber quais. */
function avisarSemSigla(visao) {
  if (!visao || visao.semSigla.length === 0) return;
  const lista = visao.semSigla.slice(0, 8).join(", ") + (visao.semSigla.length > 8 ? "…" : "");
  mostrarErroEncaixe(`${visao.semSigla.length} peça(s) saíram sem a sigla do pedido — não cabia `
    + `dentro delas: ${lista}. Separe essas pela tela ou pelo PNG da mesa.`, "aviso");
}
```

- [ ] **Step 5: Conferir de ponta a ponta**

Com dois pedidos encaixados, Exportar PDF e abrir o arquivo: cada peça tem a sigla preta com contorno branco no canto de baixo, dentro da arte, 4 mm de letra (meça no leitor de PDF com zoom real). Com um pedido só: o PDF sai sem texto nenhum (abra e procure com Ctrl+F por "P1": não acha). Repetir com bancada ligada (comprimento de mesa) para ver a sigla na página certa.

Run: `npm run bancada:pedidos && npm run bancada:pdf` — Expected: passam.

- [ ] **Step 6: Commit**

```bash
git add src/producao/pedidos.js src/producao/controlador.js bancada/conferir-pedidos.mjs
git commit -m "O PDF do Encaixe leva a sigla de cada peça quando há mais de um pedido, e avisa quem ficou sem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A Reposição guarda o pedido e a sigla

**Files:**
- Modify: `servidor/reposicao-api.js` (criação das tabelas ~36-62, `pecaParaTela` ~84, `INSERT` ~144-156)
- Modify: `src/producao/controlador.js` (`guardarParaReposicao` ~3520)
- Modify: `src/telas/Reposicao.tsx` (tipo da peça ~49, envio ao Encaixe ~158 e ~174)
- Modify: `bancada/conferir-revisao-backend.cjs`

**Interfaces:**
- Consumes: `pedidoDe`, `normalizarSigla`.
- Produces: `POST /api/reposicao/trabalhos` aceita `pecas[].pedido`, `pecas[].sigla`; `GET` devolve os dois em cada peça; `mandarProjetoParaOEncaixe` (Task 4) já os usa.

- [ ] **Step 1: O caso que falha**

A bancada sobe um Express com banco descartável (`OPTIMIZE_DADOS` numa pasta temporária) e tem o ajudante `api(method, rota, body)`. Em `bancada/conferir-revisao-backend.cjs`, junto dos outros `app.use(...)`:

```js
  app.use("/api/reposicao", require("../servidor/reposicao-api"));
```

e, antes do `console.log(\`OK — ${passou} regressões do backend.\`)`:

```js
  const criado = await api("POST", "/api/reposicao/trabalhos", {
    nome: "teste-pedidos", larguraTecido: 178, consumoCm: 100,
    pecas: [
      { nome: "COSTAS G", largura: 50, altura: 70, qtd: 2, giro: "180", pedido: "joão", sigla: "xy" },
      { nome: "TIRA", largura: 12, altura: 60, qtd: 1, giro: "180" },
    ],
  });
  const lido = await api("GET", `/api/reposicao/trabalhos/${criado.dados.id}`);
  conferir("a reposição guarda o pedido e a sigla de cada peça, e devolve igual", () => {
    assert.equal(criado.status, 200);
    assert.equal(lido.dados.pecas[0].pedido, "JOAO");
    assert.equal(lido.dados.pecas[0].sigla, "XY");
    assert.equal(lido.dados.pecas[1].pedido, null);
    assert.equal(lido.dados.pecas[1].sigla, null);
  });
```

Run: `node bancada/conferir-revisao-backend.cjs` — Expected: FAIL em `pedido`.

- [ ] **Step 2: As colunas**

Em `servidor/reposicao-api.js`, logo depois do `db.exec(...)` que cria as tabelas:

```js
// O pedido e a sigla de cada peça (2026-10-01): com dois pedidos no mesmo
// rolo, reimprimir uma peça precisa saber de qual pedido ela era. A tabela é
// criada aqui, e não em db.js, então a coluna nova também nasce aqui.
for (const coluna of ["pedido", "sigla"]) {
  const existe = db.prepare("PRAGMA table_info(reposicao_pecas)").all().some((c) => c.name === coluna);
  if (!existe) db.exec(`ALTER TABLE reposicao_pecas ADD COLUMN ${coluna} TEXT`);
}
const siglaLimpa = (v) => {
  const s = String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return s || null;
};
```

`pecaParaTela` ganha:

```js
    pedido: p.pedido || null,
    sigla: p.sigla || null,
```

O `INSERT` ganha as duas colunas:

```js
    const inserir = db.prepare(`
      INSERT INTO reposicao_pecas (trabalho_id, ordem, nome, largura, altura, qtd, giro, miniatura, pedido, sigla)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
```

e o `inserir.run(...)` termina com `miniaturaValida(p.miniatura), siglaLimpa(p.pedido), siglaLimpa(p.sigla),`.

- [ ] **Step 3: O Encaixe manda**

Em `guardarParaReposicao`, no `pecas.map(({ peca }) => ({ … }))`, depois de `giro: peca.giro,`:

```js
          pedido: temVariosPedidos(pecasEncaixe) ? pedidoDe(peca) : null,
          sigla: peca.sigla || null,
```

(com um pedido só, nada é gravado: a reposição volta como sempre voltou, e entra no pedido escolhido na hora.)

- [ ] **Step 4: A Reposição devolve**

Em `src/telas/Reposicao.tsx`, no tipo da peça (~49) acrescente `pedido: string | null; sigla: string | null;`, e nos dois lugares que montam a peça para o Encaixe (~158 e ~174) passe `pedido: p.pedido ?? undefined, sigla: p.sigla ?? undefined` (no ~174, que é uma peça vazia de exemplo, `pedido: undefined, sigla: undefined`).

- [ ] **Step 5: Rodar**

Run: `node bancada/conferir-revisao-backend.cjs && npx tsc --noEmit -p .` — Expected: passam.

- [ ] **Step 6: Commit**

```bash
git add servidor/reposicao-api.js src/producao/controlador.js src/telas/Reposicao.tsx bancada/conferir-revisao-backend.cjs
git commit -m "A Reposição guarda o pedido e a sigla de cada peça, e devolve ao Encaixe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: A medição com as artes reais e o tempo da peça grande

**Files:**
- Create: `bancada/medir-guardados.js`
- Create: `src/producao/tempoSugerido.js`
- Modify: `src/producao/controlador.js` (`tempoSugerido` ~1687 sai; chamador ~1707; `optmizar` ~2749)
- Modify: `bancada/conferir-pedidos.mjs`, `package.json` (script `bancada:guardados`)

**Interfaces:**
- Produces: `tempoSugerido(pecas): number` (segundos), `AREA_DE_PECA_GRANDE_CM2`, `TEMPO_MAX_S`, `TEMPO_MAX_PECA_GRANDE_S`, `TEMPO_MIN_S`. A área de cada peça é `p._cacheMascaras.areaReal` quando existe, senão `largura × altura`.

- [ ] **Step 1: A bancada de medição**

`bancada/medir-guardados.js` — a mesma medição desta spec, para qualquer um repetir:

```js
#!/usr/bin/env node
/**
 * A medição com as ARTES REAIS: os trabalhos que a Reposição guardou, com a
 * silhueta tirada da arte como a tela tira, encaixados como a produção encaixa
 * (busca + sparrow). Foi daqui que saiu a spec de juntar pedidos (2026-10-01).
 *
 * Nenhuma arte entra no repositório: isto lê o `dados.db` e o
 * `uploads/reposicao/` DESTA máquina. Sem eles, avisa e sai.
 *
 *   node bancada/medir-guardados.js                 todos os trabalhos
 *   node bancada/medir-guardados.js 6,1             só esses
 *   node bancada/medir-guardados.js 6+1             os dois num rolo só
 *   node bancada/medir-guardados.js 6 --tempo 180   tempo fixo, em segundos
 *   node bancada/medir-guardados.js 6 --mult 1,3    1x e 3x o tempo sugerido
 *   node bancada/medir-guardados.js 6 --busca       também só a busca, sem o sparrow
 *
 * O tempo "da produção" é o `tempoSugerido` de src/producao/tempoSugerido.js.
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const BANCO = path.join(RAIZ, "dados.db");
if (!fs.existsSync(BANCO)) {
  console.log("Sem dados.db nesta máquina: não há trabalho guardado para medir.");
  process.exit(0);
}
const Database = require("better-sqlite3");
const sharp = require("sharp");
const { carregarMotor } = require("./motor");
const { expandir } = require("./pecas");
const { buscarComoAProducao, FATIAS } = require("./corrida");

const args = process.argv.slice(2);
const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : null; };
const ids = (args.find((a) => /^[\d,+]+$/.test(a)) || "").split(",").filter(Boolean);
const mults = (opcao("--mult") || "1").split(",").map(Number);
const tempoFixo = Number(opcao("--tempo")) || 0;
const comSoBusca = args.includes("--busca");

async function pecaReal(motor, p, passo, raio) {
  const arquivo = path.join(RAIZ, "uploads", "reposicao", p.arquivo);
  const meta = await sharp(arquivo).metadata();
  // A medida é a gravada: é a que a tela usou (a do arquivo pode ser a de uma
  // prancheta inteira).
  const L = p.largura, A = p.altura;
  const { cols, rows } = motor.gradeDaPeca({ largura: L, altura: A }, passo);
  const sub = motor.subamostrasDaArte(meta.width, L, cols, rows, passo);
  const W = cols * sub, H = rows * sub;
  const w = Math.max(1, Math.min(W, Math.round((L / passo) * sub)));
  const h = Math.max(1, Math.min(H, Math.round((A / passo) * sub)));
  const dados = await sharp(arquivo, { limitInputPixels: false }).ensureAlpha()
    .resize(w, h, { fit: "fill", kernel: "linear" })
    .extend({ right: W - w, bottom: H - h, extendWith: "copy" })
    .raw().toBuffer();
  const silhueta = motor.silhuetaDeDados(new Uint8ClampedArray(dados), cols, rows, sub,
    { fundoSaiNoPdf: !meta.hasAlpha });
  const mascaras = motor.mascarasDeSilhueta(silhueta, cols, rows, passo, raio, { largura: L, altura: A });
  return { nome: p.nome, giro: p.giro || "180", qtd: p.qtd, largura: L, altura: A, mascaras,
    ocupacao: mascaras.ocupacao, _cacheMascaras: mascaras };
}

(async () => {
  const { tempoSugerido } = await import("./carregarModulo.mjs")
    .then(({ carregarModulo }) => carregarModulo("src/producao/tempoSugerido.js"));
  const motor = await carregarMotor({ comWasm: true });
  if (!motor.comEncolhedor) throw new Error("o encolhedor não carregou (npm run build:encolher)");
  const db = new Database(BANCO, { readonly: true });
  const todos = db.prepare("SELECT id FROM reposicao_trabalhos ORDER BY id").all().map((t) => String(t.id));
  for (const id of ids.length ? ids : todos) {
    const grupo = id.split("+").map(Number);
    const ts = grupo.map((g) => db.prepare("SELECT * FROM reposicao_trabalhos WHERE id = ?").get(g));
    if (ts.some((t) => !t)) { console.log(`#${id}: não existe`); continue; }
    const linhas = grupo.flatMap((g) =>
      db.prepare("SELECT * FROM reposicao_pecas WHERE trabalho_id = ? ORDER BY ordem").all(g));
    if (linhas.some((p) => !p.arquivo || !fs.existsSync(path.join(RAIZ, "uploads", "reposicao", p.arquivo)))) {
      console.log(`#${id}: falta arte no disco — pulado`);
      continue;
    }
    const largura = ts[0].largura_tecido, espaco = ts[0].folga;
    const { passo, raio } = motor.grade(largura, espaco);
    const pecas = [];
    for (const p of linhas) pecas.push(await pecaReal(motor, p, passo, raio));
    const itens = expandir(pecas);
    const areaReal = itens.reduce((s, it) => s + it.mascaras.areaReal, 0);
    const piso = areaReal / largura;
    const trabalho = {
      nome: id, pecas, itens, passo, raio,
      alturaMax: itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + espaco, 0),
      receita: { larguraTecido: largura, espaco, comprimentoBancada: 0 },
    };
    const base = tempoFixo || tempoSugerido(pecas);
    const guardado = ts.reduce((s, t) => s + t.consumo_cm, 0);
    console.log(`\n#${id}: ${itens.length} cópias, rolo ${largura}, folga ${espaco} | guardado `
      + `${(guardado / 100).toFixed(2)} m | piso ${(piso / 100).toFixed(2)} m | tempo ${base} s`);
    for (const mult of mults) {
      for (const encolher of comSoBusca ? [false, true] : [true]) {
        const relogio = Date.now();
        const r = await buscarComoAProducao(motor, trabalho, {
          tempoMs: base * mult * 1000, semente: 20261001, meta: 0, fatias: FATIAS,
          extra: { motores: "contorno+retangulo+vaos+faixas", encolher }, espalharSemente: true,
        });
        console.log(`  ${mult}x ${encolher ? "busca+sparrow" : "só busca     "}: ${(r.consumo / 100).toFixed(3)} m`
          + ` | aprov ${(r.aproveitamento * 100).toFixed(1)}% | acima do piso `
          + `${(100 * (r.consumo - piso) / piso).toFixed(1)}% [${((Date.now() - relogio) / 1000).toFixed(0)} s]`);
      }
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
```

Em `package.json`: `"bancada:guardados": "node bancada/medir-guardados.js",`.

- [ ] **Step 2: Os casos da regra, que falham**

Em `bancada/conferir-pedidos.mjs`:

```js
// ---------- 6. O tempo sugerido ----------
const tempo = await carregarModulo("src/producao/tempoSugerido.js");
caso("tempo: peça pequena fica no teto de sempre; peça grande sobe", () => {
  const { tempoSugerido, TEMPO_MIN_S, TEMPO_MAX_S, TEMPO_MAX_PECA_GRANDE_S } = tempo;
  assert.equal(tempoSugerido([]), TEMPO_MIN_S);
  assert.equal(tempoSugerido([{ qtd: 5, largura: 12, altura: 20 }]), TEMPO_MIN_S);
  assert.equal(tempoSugerido([{ qtd: 300, largura: 12, altura: 60 }]), TEMPO_MAX_S);
  assert.equal(tempoSugerido([{ qtd: 300, largura: 60, altura: 90 }]), TEMPO_MAX_PECA_GRANDE_S);
  // A área real da silhueta vale mais que a caixa: arte em prancheta 100 x 100
  // com uma tira dentro é tira.
  assert.equal(tempoSugerido([{ qtd: 300, largura: 100, altura: 100, _cacheMascaras: { areaReal: 700 } }]), TEMPO_MAX_S);
  // Camisas misturadas com tiras ainda é rolo de peça grande (spec, seção 6):
  // média (195·5400 + 200·240) / 395 ≈ 2787 cm².
  assert.equal(tempoSugerido([
    { qtd: 195, largura: 60, altura: 90 }, { qtd: 200, largura: 12, altura: 20 },
  ]), TEMPO_MAX_PECA_GRANDE_S);
});
```

Run: `npm run bancada:pedidos` — Expected: FAIL (módulo não existe).

- [ ] **Step 3: A regra**

`src/producao/tempoSugerido.js`:

```js
/**
 * O tempo de procura que o Encaixe sugere.
 *
 * A busca própria do motor satura cedo (spec de 2026-09-21: 32,30 m com 3 s e
 * com 300 s); quem converte tempo em tecido é o sparrow, e só em PEÇA
 * GRANDE. Medido com as artes reais em 2026-10-01 (bancada:guardados):
 *
 *   camisas, 195 cópias   60 s → 180 s   64,74 → 61,95 m   −4,3%
 *   tiras,   200 cópias   60 s → 180 s    5,07 →  5,04 m   −0,5%
 *
 * Então o teto sobe só quando a peça média é grande. A área é a da silhueta
 * (`_cacheMascaras.areaReal`) quando ela já foi lida — arte em prancheta de
 * 100 x 100 cm com uma tira dentro é tira, não prancheta —, e a da caixa antes
 * disso.
 */
export const TEMPO_MIN_S = 10;
export const TEMPO_MAX_S = 60;
export const AREA_DE_PECA_GRANDE_CM2 = 2500;
export const TEMPO_MAX_PECA_GRANDE_S = 180;
const SEGUNDOS_POR_COPIA = 0.9;

export function tempoSugerido(pecas) {
  let copias = 0;
  let area = 0;
  (pecas || []).forEach((p) => {
    const q = Math.max(0, Number(p.qtd) || 0);
    const daSilhueta = p._cacheMascaras && Number(p._cacheMascaras.areaReal);
    const daPeca = daSilhueta > 0 ? daSilhueta : (Number(p.largura) || 0) * (Number(p.altura) || 0);
    copias += q;
    area += q * daPeca;
  });
  const media = copias > 0 ? area / copias : 0;
  const teto = media >= AREA_DE_PECA_GRANDE_CM2 ? TEMPO_MAX_PECA_GRANDE_S : TEMPO_MAX_S;
  return Math.max(TEMPO_MIN_S, Math.min(teto, Math.round(copias * SEGUNDOS_POR_COPIA)));
}
```

Run: `npm run bancada:pedidos` — Expected: PASS.

- [ ] **Step 4: Medir antes de fixar os números**

Com a máquina livre (nada mais rodando), a curva nos três trabalhos de peça grande:

Run: `node bancada/medir-guardados.js 3,6,7 --tempo 60` e depois `--tempo 120` e `--tempo 180` (cada uma leva ~10-20 min).

Regra de decisão, escrita no comentário de `tempoSugerido.js` com os números medidos:
- `TEMPO_MAX_PECA_GRANDE_S`: 180 se o ganho médio de 120 → 180 s nos três passar de 1%; senão 120.
- `AREA_DE_PECA_GRANDE_CM2`: imprima a área média por cópia de cada trabalho (acrescente na linha do `#id` da bancada: `area média ${(areaReal / itens.length).toFixed(0)} cm²`); o limiar fica entre a maior média dos trabalhos de tira (#1, #2, #4, #5) e a menor dos de camisa (#3, #6, #7). Se 2500 já separa os dois grupos, fica 2500.

Atualize as constantes e o comentário, rode de novo `npm run bancada:pedidos` (ajustando os números do caso se o teto mudou).

- [ ] **Step 5: O controlador usa a regra**

Em `src/producao/controlador.js`: apague a função `tempoSugerido(copias)` (~1687), importe

```js
import { tempoSugerido } from "./tempoSugerido";
```

troque o chamador (~1707) por

```js
  if (!tempoAjustadoPeloUsuario && copias > 0) {
    encaixeTempoInput.value = tempoSugerido(pecasEncaixe);
  }
```

e em `optmizar`, logo depois de `itens.forEach((item) => { item.mascaras = pecasEncaixe[item.indice]._cacheMascaras; });` (~2749) — quando a silhueta já foi lida e a área real existe:

```js
    // Agora a área é a da silhueta: a sugestão pode mudar (arte em prancheta
    // grande que era tira). Ver src/producao/tempoSugerido.js.
    if (!tempoAjustadoPeloUsuario) encaixeTempoInput.value = tempoSugerido(pecasEncaixe);
```

- [ ] **Step 6: Conferir**

Run: `npm run bancada:pedidos && npm run bancada:tela` — Expected: passam.
Na tela: arrastar 20 cópias de uma camiseta de 60 × 90 → tempo sugerido 18 s → 10…; com 200 cópias → 180 (ou o teto medido); com 200 tiras → 60. Digitar um tempo à mão e refazer → o digitado fica.

- [ ] **Step 7: Commit**

```bash
git add bancada/medir-guardados.js src/producao/tempoSugerido.js src/producao/controlador.js bancada/conferir-pedidos.mjs package.json
git commit -m "A medição com as artes reais vira bancada, e o tempo sugerido sobe em trabalho de peça grande

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Regressão e a prova do ganho

**Files:** nenhum novo (só correções que aparecerem).

- [ ] **Step 1: As bancadas do motor e do PDF**

Run: `npm run bancada:conferir && npm run bancada:sobreposicao && npm run bancada:encolher && npm run bancada:pdf && npm run bancada:pedidos && npm run bancada:tela && npm run bancada:react && npx tsc --noEmit -p .`
Expected: tudo passa.

- [ ] **Step 2: O ganho de juntar, de novo, pela bancada nova**

Run: `node bancada/medir-guardados.js 6,1 --tempo 60` e `node bancada/medir-guardados.js 6+1 --tempo 120`
Expected: o junto (`6+1`) gasta menos que a soma dos dois separados — na medição da spec, 66,07 contra 69,81 m. Registre os números no commit de fechamento.

- [ ] **Step 3: O build**

Run: `npm run front`
Expected: build sem erro.

- [ ] **Step 4: Commit (se houve correção)**

```bash
git add -A
git commit -m "Juntar pedidos: as bancadas de sempre passam, e juntar #6 com #1 gasta X m contra Y m separados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(troque X e Y pelos números do Step 2.)
