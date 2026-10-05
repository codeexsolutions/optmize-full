/**
 * ===========================================================================
 * O PLT GRADUADO — o molde da Audaces com o contorno de cada tamanho
 * ===========================================================================
 *
 * Ver docs/superpowers/specs/2026-10-05-importar-molde-graduado-design.md.
 *
 * O PLT que a Audaces exporta traz, de cada peça, um contorno fechado por
 * tamanho — uns sobre os outros ou lado a lado, conforme o arquivo — e os textos
 * do molde desenhados em traços miúdos. A peça que não muda de tamanho vem uma
 * vez só. Daqui sai:
 *
 *   lacosDoPLT          os contornos fechados, em cm, na posição do arquivo;
 *   casarComOGabarito   cada (peça, tamanho) do `.adsx` com o laço de mesma
 *                       largura × altura — o caminho exato;
 *   agruparTamanhos     sem gabarito: as cadeias de tamanhos, pela forma;
 *   moldeGraduado       as peças prontas para gravar, uma linha por tamanho.
 *
 * Medido nos 12 modelos reais (`bancada:plt-graduado`): com gabarito, 55 de 67
 * peças saem com todos os tamanhos; sem, 43 de 67 — por isso a tela confere
 * antes de criar.
 */
import { montarLacos, tracosDoPLT } from "./moldes";
import { nosDoPoligono, marcacoesPadrao } from "./montagem";
import { PALETA } from "./tamanhos";

/** Abaixo disto (cm), é letra ou marca, e não peça. */
const MENOR_LADO_DE_PECA = 2.5;
const MENOR_AREA_DE_PECA = 1; // cm²
/** Pontas a até isto (cm) fecham: a peça na dobra deixa uma abertura de ~0,5 cm. */
const FECHA_ATE = 1;
/** Casar com o gabarito: largura × altura a até isto (cm). */
const TOLERANCIA_DA_MEDIDA = 0.1;

function caixaDe(pontos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pontos) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}
function areaDe(pontos) {
  let a = 0;
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i], q = pontos[(i + 1) % pontos.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}
function laco(pontos) {
  // O último ponto repetindo o primeiro não é vértice.
  const limpos = pontos.length > 1 && Math.hypot(pontos[0].x - pontos.at(-1).x, pontos[0].y - pontos.at(-1).y) < 1e-9
    ? pontos.slice(0, -1) : pontos;
  const caixa = caixaDe(limpos);
  return { pontos: limpos, caixa, largura: caixa.x1 - caixa.x0, altura: caixa.y1 - caixa.y0, area: areaDe(limpos) };
}

/**
 * Os contornos fechados do PLT, em cm (y para baixo, como a tela), na posição
 * em que o arquivo os desenhou. Fica de fora o que é miúdo (letras, marcas) e o
 * retângulo do tamanho da folha.
 */
export function lacosDoPLT(texto) {
  const t = tracosDoPLT(texto);
  if (t.erro) return t;
  const f = t.unidade.fator;
  const linhas = t.linhas.map((l) => ({ ...l, pontos: l.pontos.map((p) => ({ x: p.x * f, y: -p.y * f })) }));
  const grande = (pontos) => { const c = caixaDe(pontos); return Math.max(c.x1 - c.x0, c.y1 - c.y0) > MENOR_LADO_DE_PECA; };
  const fechaSozinho = (l) => l.pontos.length > 3 && grande(l.pontos)
    && Math.hypot(l.pontos[0].x - l.pontos.at(-1).x, l.pontos[0].y - l.pontos.at(-1).y) <= FECHA_ATE;
  // O traço que já fecha é um laço como está: emendar pela ponta mais próxima juntaria
  // os tamanhos, que costumam começar no mesmo ponto.
  const prontos = linhas.filter(fechaSozinho).map((l) => l.pontos);
  const emendados = montarLacos(linhas.filter((l) => !fechaSozinho(l)), 0.05);
  const todos = [...prontos, ...emendados].map(laco)
    .filter((l) => l.area >= MENOR_AREA_DE_PECA && Math.max(l.largura, l.altura) > MENOR_LADO_DE_PECA);
  if (todos.length === 0) return { erro: "Não achei nenhum contorno fechado nesse PLT." };
  // A folha: um retângulo de 4 ou 5 pontos que cobre o desenho inteiro.
  const geral = caixaDe(todos.flatMap((l) => l.pontos));
  const lacos = todos.filter((l) => !(l.pontos.length <= 5 && l.largura >= (geral.x1 - geral.x0) * 0.95
    && l.altura >= (geral.y1 - geral.y0) * 0.95 && todos.length > 1));
  return { lacos, unidade: t.unidade.nome, avisos: t.avisos };
}

/* ---------------------------------------------------------------- sem gabarito */

/** `n` pontos igualmente espaçados no perímetro, na caixa do laço levada a 1 × 1. */
function amostra(l, n = 48) {
  const { pontos, caixa } = l;
  const w = caixa.x1 - caixa.x0 || 1, h = caixa.y1 - caixa.y0 || 1;
  const seg = [];
  let total = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i], b = pontos[(i + 1) % pontos.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    seg.push(d);
    total += d;
  }
  const saida = [];
  let i = 0, andado = 0;
  for (let k = 0; k < n; k++) {
    const alvo = (k / n) * total;
    while (i < pontos.length - 1 && andado + seg[i] < alvo) { andado += seg[i]; i++; }
    const a = pontos[i], b = pontos[(i + 1) % pontos.length];
    const t = seg[i] ? (alvo - andado) / seg[i] : 0;
    saida.push({ x: (a.x + (b.x - a.x) * t - caixa.x0) / w, y: (a.y + (b.y - a.y) * t - caixa.y0) / h });
  }
  return saida;
}
/** A distância média de cada ponto de A ao mais perto de B. */
function chamfer(A, B) {
  let soma = 0;
  for (const a of A) {
    let menor = Infinity;
    for (const b of B) menor = Math.min(menor, (a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    soma += Math.sqrt(menor);
  }
  return soma / A.length;
}

/**
 * Sem gabarito: as cadeias de tamanhos. Cada laço liga ao "próximo tamanho" —
 * maior (área de 60% a 99%), de forma parecida na caixa normalizada, de
 * proporção e salto de área pequenos, e de preferência sobreposto —, pelo
 * custo menor primeiro, um próximo e um anterior por laço. O número de tamanhos
 * é o comprimento de cadeia mais comum; cadeia de outro comprimento é engano
 * (duas peças avulsas parecidas, uma sobre a outra) e se desfaz.
 */
export function agruparTamanhos(lacos) {
  const info = lacos.map((l) => ({ l, s: amostra(l), proporcao: l.largura / (l.altura || 1) }));
  const pares = [];
  for (let i = 0; i < info.length; i++) {
    for (let j = 0; j < info.length; j++) {
      const A = info[i], B = info[j];
      // O próximo tamanho é maior de verdade (≥ 1% de área): duas peças diferentes do mesmo
      // tamanho, uma sobre a outra, têm a mesma área a menos do arredondamento.
      const razao = A.l.area / B.l.area;
      if (razao > 0.99 || razao < 0.6) continue;
      const ix = Math.max(0, Math.min(A.l.caixa.x1, B.l.caixa.x1) - Math.max(A.l.caixa.x0, B.l.caixa.x0));
      const iy = Math.max(0, Math.min(A.l.caixa.y1, B.l.caixa.y1) - Math.max(A.l.caixa.y0, B.l.caixa.y0));
      const cobre = (ix * iy) / Math.max(A.l.largura * A.l.altura, 1e-9);
      const custo = (chamfer(A.s, B.s) + chamfer(B.s, A.s)) / 2 + Math.abs(Math.log(A.proporcao / B.proporcao))
        + 0.5 * Math.abs(Math.log(razao)) - (cobre > 0.5 ? 0.02 : 0);
      if (custo <= 0.15) pares.push({ i, j, custo });
    }
  }
  pares.sort((a, b) => a.custo - b.custo);
  const proximo = new Map();
  const anterior = new Map();
  for (const p of pares) {
    if (proximo.has(p.i) || anterior.has(p.j)) continue;
    proximo.set(p.i, p.j);
    anterior.set(p.j, p.i);
  }
  let cadeias = [];
  info.forEach((_, i) => {
    if (anterior.has(i)) return;
    const cadeia = [];
    for (let x = i; x !== undefined; x = proximo.get(x)) cadeia.push(info[x].l);
    cadeias.push(cadeia);
  });
  const conta = new Map();
  for (const c of cadeias) if (c.length > 1) conta.set(c.length, (conta.get(c.length) || 0) + 1);
  const tamanhos = [...conta].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 1;
  cadeias = cadeias.flatMap((c) => (c.length === 1 || c.length === tamanhos ? [c] : c.map((l) => [l])));
  return { pecas: cadeias.map((c) => ({ lacos: c })), tamanhos };
}

/* ---------------------------------------------------------------- com gabarito */

const mesmaMedida = (l, m) =>
  (Math.abs(l.largura - m.largura) <= TOLERANCIA_DA_MEDIDA && Math.abs(l.altura - m.altura) <= TOLERANCIA_DA_MEDIDA)
  || (Math.abs(l.largura - m.altura) <= TOLERANCIA_DA_MEDIDA && Math.abs(l.altura - m.largura) <= TOLERANCIA_DA_MEDIDA);
const centro = (l) => ({ x: (l.caixa.x0 + l.caixa.x1) / 2, y: (l.caixa.y0 + l.caixa.y1) / 2 });

/**
 * Com o gabarito do `.adsx` (ver `motores/audacesAdsx.js`): cada (peça, tamanho)
 * pega o laço de mesma largura × altura (girado também vale) que ninguém pegou.
 * Tamanhos da mesma peça com a mesma medida — a peça que não muda — usam o mesmo
 * laço. Entre dois candidatos, o mais perto dos tamanhos que a peça já tem.
 *
 * Devolve `{ pecas: [{ nome, quantidade, porTamanho: { [tamanho]: laço }, faltam }],
 * semDono: laços que nenhuma peça pegou, avisos }`. Peça sem nenhum tamanho no
 * PLT fica de fora, com aviso.
 */
export function casarComOGabarito(lacos, gabarito) {
  const usados = new Set();
  const avisos = [];
  const pecas = [];
  for (const g of gabarito.pecas) {
    const porTamanho = {};
    const faltam = [];
    for (const tamanho of gabarito.tamanhos) {
      const medida = g.porTamanho[tamanho];
      if (!medida) continue;
      // A mesma medida de um tamanho anterior desta peça: o mesmo laço.
      const repetido = Object.entries(porTamanho).find(([t]) => {
        const m = g.porTamanho[t];
        return Math.abs(m.largura - medida.largura) <= TOLERANCIA_DA_MEDIDA && Math.abs(m.altura - medida.altura) <= TOLERANCIA_DA_MEDIDA;
      });
      if (repetido) { porTamanho[tamanho] = repetido[1]; continue; }
      const candidatos = lacos.filter((l) => !usados.has(l) && mesmaMedida(l, medida));
      if (candidatos.length === 0) { faltam.push(tamanho); continue; }
      const ja = Object.values(porTamanho);
      const escolhido = ja.length === 0 ? candidatos[0] : candidatos.reduce((melhor, l) => {
        const d = (x) => Math.min(...ja.map((o) => Math.hypot(centro(x).x - centro(o).x, centro(x).y - centro(o).y)));
        return d(l) < d(melhor) ? l : melhor;
      });
      usados.add(escolhido);
      porTamanho[tamanho] = escolhido;
    }
    if (Object.keys(porTamanho).length === 0) {
      avisos.push(`${g.nome}: nenhum tamanho no PLT.`);
      continue;
    }
    if (faltam.length) avisos.push(`${g.nome}: não achei ${faltam.join(", ")} no PLT.`);
    pecas.push({ nome: g.nome, quantidade: g.quantidade, porTamanho, faltam });
  }
  const semDono = lacos.filter((l) => !usados.has(l));
  if (semDono.length) avisos.push(`${semDono.length} contorno(s) do PLT sem peça no .adsx — entram como peças avulsas.`);
  return { pecas, semDono, avisos };
}

/**
 * Sem gabarito: as peças do agrupamento, com os nomes da grade do menor para o
 * maior. A peça de um laço só (a que não muda) vale para todos os tamanhos; a
 * que tem menos laços que a grade fica com os primeiros tamanhos e o resto em
 * `faltam`.
 */
export function pecasDoAgrupamento(agrupado, nomesDosTamanhos) {
  return agrupado.pecas.map((p, i) => {
    const porTamanho = {};
    const faltam = [];
    if (p.lacos.length === 1) nomesDosTamanhos.forEach((t) => { porTamanho[t] = p.lacos[0]; });
    else nomesDosTamanhos.forEach((t, k) => { if (p.lacos[k]) porTamanho[t] = p.lacos[k]; else faltam.push(t); });
    return { nome: `Peça ${i + 1}`, quantidade: 1, porTamanho, faltam };
  });
}

/* ---------------------------------------------------------------- para gravar */

const arredondar4 = (v) => Math.round(v * 10000) / 10000;

/**
 * O molde pronto para `moldesApi.criar`: um rascunho, cada peça um grupo, uma
 * linha por tamanho (contorno no canto da caixa, nós retos do polígono — o
 * desenho exato do PLT; o Reduzir da Montagem tira o que sobra), e a grade com
 * as cores da paleta e o base. `papelDe` chuta o papel pelo nome (a tela passa
 * o do vocabulário de Moldes).
 */
export function moldeGraduado({ nome, tamanhos, pecas, papelDe = () => "outro" }) {
  const linhas = [];
  pecas.forEach((p, grupo) => {
    for (const t of tamanhos) {
      const l = p.porTamanho[t.nome];
      if (!l) continue;
      const contorno = l.pontos.map((q) => ({ x: arredondar4(q.x - l.caixa.x0), y: arredondar4(q.y - l.caixa.y0) }));
      const nos = nosDoPoligono(contorno);
      linhas.push({
        tamanho: t.nome, papel: papelDe(p.nome), nome: p.nome, quantidade: p.quantidade,
        largura: arredondar4(l.largura), altura: arredondar4(l.altura),
        contorno, furos: [], origem: "Audaces (PLT)", nos, marcacoes: marcacoesPadrao(nos),
        ordem: linhas.length, grupo,
      });
    }
  });
  return {
    nome: nome || "Molde graduado",
    situacao: "rascunho",
    observacoes: "Importado do PLT graduado da Audaces.",
    pecas: linhas,
    tamanhos: tamanhos.map((t, ordem) => ({ nome: t.nome, cor: PALETA[ordem % PALETA.length], ordem, base: !!t.base })),
  };
}
