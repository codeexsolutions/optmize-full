/**
 * ===========================================================================
 * GRADUAÇÃO — os tamanhos gerados a partir do base
 * ===========================================================================
 *
 * A regra é da PEÇA e mora na linha do tamanho base (`peca.graduacao`):
 *
 *   { jeito: "pontos" | "porcentagem", regras: [...], porcentagem: número, perdidos?: número }
 *
 * - Por pontos, cada regra é de um nó: `{ no, modo: "igual", passo }` — anda
 *   `k × passo`, com k = saltos do base na ordem da grade — ou `{ no, modo:
 *   "porTamanho", deslocamentos: { P: {dx, dy}, G: … } }` — o ACUMULADO de
 *   cada tamanho em relação ao base. A tela mostra e edita por salto.
 * - Por porcentagem, a peça inteira escala `1 + k × % / 100`.
 *
 * Os dois campos convivem: trocar o jeito não apaga o outro. Coordenadas em
 * cm, as mesmas dos nós: x para a direita, y para baixo. Conta pura: recebe e
 * devolve objetos novos. Ver docs/superpowers/specs/2026-09-29-graduacao-design.md.
 */

import { achatarCurvas } from "./ajusteDeCurvas";
import { pontoNoTrecho } from "./edicaoDeNos";

/** A origem que marca um tamanho feito pela graduação: esse é refeito sem perguntar. */
export const ORIGEM_GERADA = "graduação";
/** Um tamanho gerado que alguém ajustou à mão: gerar de novo pergunta antes. */
export const ORIGEM_AJUSTADA = "graduação ajustada à mão";

const ZERO = Object.freeze({ dx: 0, dy: 0 });
const soma = (a, b) => ({ dx: a.dx + b.dx, dy: a.dy + b.dy });
const vezes = (a, k) => ({ dx: a.dx * k, dy: a.dy * k });
const iguais = (a, b) => Math.abs(a.dx - b.dx) < 1e-9 && Math.abs(a.dy - b.dy) < 1e-9;
const nomesEmOrdem = (grade) => [...grade].sort((a, b) => a.ordem - b.ordem).map((t) => t.nome);

export function graduacaoVazia() {
  return { jeito: "pontos", regras: [], porcentagem: 0 };
}

/** O número digitado. Vírgula vale ponto; negativo vale (andar para a esquerda ou para cima); vazio é 0. */
export function lerMedida(texto) {
  const limpo = String(texto ?? "").trim().replace(",", ".");
  if (limpo === "" || limpo === "-") return 0;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Quantos saltos o tamanho está do base, na ordem da grade. `null` se algum dos dois não está na grade. */
export function saltosDoTamanho(grade, base, tamanho) {
  const nomes = nomesEmOrdem(grade);
  const i = nomes.indexOf(tamanho);
  const j = nomes.indexOf(base);
  return i < 0 || j < 0 ? null : i - j;
}

/**
 * Quanto o nó da regra anda no tamanho. Por tamanho, tamanho sem valor conta
 * como o vizinho mais perto do base (o salto que falta vale 0).
 */
export function deslocamentoDaRegra(regra, grade, base, tamanho) {
  if (tamanho === base) return { ...ZERO };
  if (regra.modo === "igual") {
    const k = saltosDoTamanho(grade, base, tamanho);
    return k === null ? { ...ZERO } : vezes(regra.passo, k);
  }
  const nomes = nomesEmOrdem(grade);
  const i = nomes.indexOf(tamanho);
  const j = nomes.indexOf(base);
  if (i < 0 || j < 0) return { ...ZERO };
  const rumo = i > j ? -1 : 1;
  for (let k = i; k !== j; k += rumo) {
    const d = regra.deslocamentos?.[nomes[k]];
    if (d) return { dx: d.dx, dy: d.dy };
  }
  return { ...ZERO };
}

/** Os saltos da regra, um por par vizinho da grade: o quanto o nó anda subindo de `de` para `para`. */
export function passosDaRegra(regra, grade, base) {
  const nomes = nomesEmOrdem(grade);
  const saida = [];
  for (let i = 0; i + 1 < nomes.length; i++) {
    const de = deslocamentoDaRegra(regra, grade, base, nomes[i]);
    const para = deslocamentoDaRegra(regra, grade, base, nomes[i + 1]);
    saida.push({ de: nomes[i], para: nomes[i + 1], dx: para.dx - de.dx, dy: para.dy - de.dy });
  }
  return saida;
}

/** Os tamanhos sem valor numa regra por tamanho (tamanho novo na grade, por exemplo). */
export function faltando(regra, grade, base) {
  if (regra.modo !== "porTamanho") return [];
  return nomesEmOrdem(grade).filter((n) => n !== base && !regra.deslocamentos?.[n]);
}

/**
 * Muda o salto `indice` (entre o tamanho `indice` e o `indice + 1` da grade).
 * Anda o lado longe do base: acima do base, o `para` e os de cima; abaixo, o
 * `de` e os de baixo. A regra sai "por tamanho", com todos os acumulados.
 */
export function mudarPasso(regra, grade, base, indice, valor) {
  const nomes = nomesEmOrdem(grade);
  const j = nomes.indexOf(base);
  const acumulado = Object.fromEntries(nomes.map((n) => [n, deslocamentoDaRegra(regra, grade, base, n)]));
  const de = acumulado[nomes[indice]];
  const para = acumulado[nomes[indice + 1]];
  const diferenca = { dx: valor.dx - (para.dx - de.dx), dy: valor.dy - (para.dy - de.dy) };
  if (indice >= j) {
    for (let k = indice + 1; k < nomes.length; k++) acumulado[nomes[k]] = soma(acumulado[nomes[k]], diferenca);
  } else {
    for (let k = 0; k <= indice; k++) acumulado[nomes[k]] = soma(acumulado[nomes[k]], vezes(diferenca, -1));
  }
  delete acumulado[base];
  return { no: regra.no, modo: "porTamanho", deslocamentos: acumulado };
}

/**
 * Troca o modo da regra. Salto igual → por tamanho preenche todos os
 * tamanhos. Por tamanho → salto igual fica com o salto do base para o tamanho
 * de cima (ou, se o base é o maior, o de baixo para o base); `perdeu` diz que
 * os saltos eram diferentes — a tela pergunta antes.
 */
export function trocarModo(regra, grade, base, modo) {
  if (regra.modo === modo) return { regra, perdeu: false };
  const nomes = nomesEmOrdem(grade);
  if (modo === "porTamanho") {
    const deslocamentos = {};
    for (const n of nomes) if (n !== base) deslocamentos[n] = deslocamentoDaRegra(regra, grade, base, n);
    return { regra: { no: regra.no, modo, deslocamentos }, perdeu: false };
  }
  const passos = passosDaRegra(regra, grade, base);
  const j = nomes.indexOf(base);
  const escolhido = passos[j] ?? passos[j - 1] ?? { ...ZERO };
  return {
    regra: { no: regra.no, modo: "igual", passo: { dx: escolhido.dx, dy: escolhido.dy } },
    perdeu: passos.some((p) => !iguais(p, escolhido)),
  };
}

/** Põe, troca ou (com `regra` null) tira a regra do nó. As regras ficam em ordem de nó. */
export function comRegra(graduacao, no, regra) {
  const atual = graduacao ?? graduacaoVazia();
  const outras = (atual.regras || []).filter((r) => r.no !== no);
  return {
    ...atual,
    jeito: atual.jeito || "pontos",
    regras: regra ? [...outras, { ...regra, no }].sort((a, b) => a.no - b.no) : outras,
  };
}

/** Um nó novo entrou depois do nó `i`: as regras dos nós de depois andam um. */
export function graduacaoAoInserirNo(graduacao, i) {
  if (!graduacao) return graduacao;
  return { ...graduacao, regras: (graduacao.regras || []).map((r) => (r.no > i ? { ...r, no: r.no + 1 } : r)) };
}

/** O nó `i` saiu: a regra dele sai (e conta em `perdidos`), as de depois voltam um. */
export function graduacaoAoApagarNo(graduacao, i) {
  if (!graduacao) return graduacao;
  const regras = graduacao.regras || [];
  const ficam = regras.filter((r) => r.no !== i);
  return {
    ...graduacao,
    perdidos: (graduacao.perdidos || 0) + (regras.length - ficam.length),
    regras: ficam.map((r) => (r.no > i ? { ...r, no: r.no - 1 } : r)),
  };
}

const renomearChaves = (objeto, velho, novo) =>
  Object.fromEntries(Object.entries(objeto).map(([k, v]) => [k === velho ? novo : k, v]));

export function graduacaoRenomearTamanho(graduacao, velho, novo) {
  if (!graduacao) return graduacao;
  return {
    ...graduacao,
    regras: (graduacao.regras || []).map((r) => (r.modo === "porTamanho"
      ? { ...r, deslocamentos: renomearChaves(r.deslocamentos || {}, velho, novo) } : r)),
  };
}

export function graduacaoTirarTamanho(graduacao, nome) {
  if (!graduacao) return graduacao;
  return {
    ...graduacao,
    regras: (graduacao.regras || []).map((r) => {
      if (r.modo !== "porTamanho") return r;
      const { [nome]: _fora, ...resto } = r.deslocamentos || {};
      return { ...r, deslocamentos: resto };
    }),
  };
}

// ---------------------------------------------------------------------------
// GERAR UM TAMANHO
// ---------------------------------------------------------------------------

/** O centro da caixa do risco. */
function centroDoRisco(nos) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of achatarCurvas(nos)) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

const anda = (p, d) => ({ x: p.x + d.dx, y: p.y + d.dy });

/** Os nós andando `d`, com as alças. */
export function transladarNos(nos, d) {
  return nos.map((n) => ({ ...n, ...anda(n, d), entrada: anda(n.entrada, d), saida: anda(n.saida, d) }));
}

/** Onde cada nó começa ao longo da volta, em cm, e o comprimento da volta. */
function posicoesNaVolta(nos) {
  const posicao = [];
  let total = 0;
  for (let i = 0; i < nos.length; i++) {
    posicao.push(total);
    let antes = pontoNoTrecho(nos, i, 0);
    for (let k = 1; k <= 16; k++) {
      const q = pontoNoTrecho(nos, i, k / 16);
      total += Math.hypot(q.x - antes.x, q.y - antes.y);
      antes = q;
    }
  }
  return { posicao, total };
}

/**
 * Quanto cada nó anda no tamanho. O nó com regra anda a regra; o sem regra, a
 * mistura dos dois nós com regra mais perto (antes e depois dele na volta), na
 * proporção do comprimento da linha até cada um — um nó no meio da cava anda a
 * média do ombro e da axila. Com uma regra só, todos andam como ela.
 */
export function deslocamentosDosNos(nos, regras, grade, base, tamanho) {
  const n = nos.length;
  const comRegraNo = new Map();
  for (const r of regras) {
    if (r.no >= 0 && r.no < n) comRegraNo.set(r.no, deslocamentoDaRegra(r, grade, base, tamanho));
  }
  if (comRegraNo.size === 0) return nos.map(() => ({ ...ZERO }));
  if (comRegraNo.size === 1) {
    const [unico] = comRegraNo.values();
    return nos.map(() => ({ ...unico }));
  }
  const { posicao, total } = posicoesNaVolta(nos);
  if (!(total > 0)) return nos.map(() => ({ ...ZERO }));
  const aFrente = (a, b) => (((posicao[b] - posicao[a]) % total) + total) % total;
  return nos.map((_, j) => {
    if (comRegraNo.has(j)) return { ...comRegraNo.get(j) };
    let a = j;
    do { a = (a - 1 + n) % n; } while (!comRegraNo.has(a));
    let b = j;
    do { b = (b + 1) % n; } while (!comRegraNo.has(b));
    const s = aFrente(a, j) / (aFrente(a, b) || 1);
    const da = comRegraNo.get(a);
    const db = comRegraNo.get(b);
    return { dx: da.dx + (db.dx - da.dx) * s, dy: da.dy + (db.dy - da.dy) * s };
  });
}

/** Quanto cada nó do base anda no tamanho, pelo jeito da graduação. `null` para tamanho fora da grade. */
export function deslocamentosDoTamanho(base, grade, tamanho) {
  const g = base.graduacao;
  if (!g || tamanho === base.tamanho) return base.nos.map(() => ({ ...ZERO }));
  const k = saltosDoTamanho(grade, base.tamanho, tamanho);
  if (k === null) return null;
  if (g.jeito === "porcentagem") {
    const s = 1 + (k * (Number(g.porcentagem) || 0)) / 100;
    const c = centroDoRisco(base.nos);
    return base.nos.map((q) => ({ dx: (q.x - c.x) * (s - 1), dy: (q.y - c.y) * (s - 1) }));
  }
  return deslocamentosDosNos(base.nos, g.regras || [], grade, base.tamanho, tamanho);
}

/** O quanto um ponto de dentro (pence, bolso, o fio) anda: a média dos nós, pesada pela proximidade. */
function mediaPelaDistancia(p, nos, deslocamentos) {
  let sx = 0; let sy = 0; let sw = 0;
  for (let i = 0; i < nos.length; i++) {
    const d2 = (nos[i].x - p.x) ** 2 + (nos[i].y - p.y) ** 2;
    if (d2 < 1e-12) return { ...deslocamentos[i] };
    const w = 1 / d2;
    sx += w * deslocamentos[i].dx;
    sy += w * deslocamentos[i].dy;
    sw += w;
  }
  return sw > 0 ? { dx: sx / sw, dy: sy / sw } : { ...ZERO };
}

/**
 * O tamanho `tamanho` da peça, a partir do base. A peça gerada é a do base
 * com o tamanho novo, a origem da graduação, sem `graduacao` e sem `id`; os
 * piques ficam (os nós são os mesmos), os pontos e o fio andam junto.
 */
export function gerarTamanho(base, grade, tamanho) {
  const g = base.graduacao;
  if (!g) return { erro: "a peça não tem graduação" };
  const k = saltosDoTamanho(grade, base.tamanho, tamanho);
  if (k === null) return { erro: `o tamanho ${tamanho} não está na grade` };
  if (k === 0) return { erro: `${tamanho} é o próprio base` };
  const mc = base.marcacoes;
  const avisos = [];
  let nos; let pontos; let fio;
  if (g.jeito === "porcentagem") {
    const p = Number(g.porcentagem) || 0;
    if (p === 0) return { erro: "porcentagem 0 não muda nada" };
    const s = 1 + (k * p) / 100;
    if (s < 0.05) return { erro: `com ${String(p).replace(".", ",")}% por tamanho, o ${tamanho} some` };
    const c = centroDoRisco(base.nos);
    const escala = (q) => ({ x: c.x + (q.x - c.x) * s, y: c.y + (q.y - c.y) * s });
    nos = base.nos.map((n) => ({ ...n, ...escala(n), entrada: escala(n.entrada), saida: escala(n.saida) }));
    pontos = mc.pontos.map((q) => ({ ...q, ...escala(q) }));
    fio = { ...mc.fio, ...escala(mc.fio), comprimento: mc.fio.comprimento * s };
  } else {
    const regras = (g.regras || []).filter((r) => r.no >= 0 && r.no < base.nos.length);
    if (regras.length === 0) return { erro: "marque pelo menos um ponto com regra" };
    if (regras.length === 1) avisos.push("com um ponto só, a peça inteira só se desloca: marque pelo menos dois pontos");
    const d = deslocamentosDosNos(base.nos, regras, grade, base.tamanho, tamanho);
    nos = base.nos.map((n, i) => ({ ...n, ...anda(n, d[i]), entrada: anda(n.entrada, d[i]), saida: anda(n.saida, d[i]) }));
    pontos = mc.pontos.map((q) => ({ ...q, ...anda(q, mediaPelaDistancia(q, base.nos, d)) }));
    fio = { ...mc.fio, ...anda(mc.fio, mediaPelaDistancia(mc.fio, base.nos, d)) };
  }
  const { id: _id, ...resto } = base;
  return {
    peca: { ...resto, tamanho, origem: ORIGEM_GERADA, graduacao: null, nos, marcacoes: { ...mc, pontos, fio } },
    avisos,
  };
}

/** O que o bloco da graduação avisa sobre a peça (base). */
export function avisosDaGraduacao(base, grade) {
  const g = base?.graduacao;
  if (!g) return [];
  const avisos = [];
  if (g.perdidos > 0) avisos.push(`A graduação perdeu ${g.perdidos} ponto(s) quando nós foram apagados.`);
  if (g.jeito === "porcentagem") {
    if (!Number(g.porcentagem)) avisos.push("Porcentagem 0 não muda nada.");
    return avisos;
  }
  const regras = (g.regras || []).filter((r) => r.no >= 0 && r.no < base.nos.length);
  if (regras.length === 0) avisos.push("Marque pelo menos um ponto com regra (clique num nó).");
  else if (regras.length === 1) avisos.push("Com um ponto só, a peça inteira só se desloca: marque pelo menos dois pontos.");
  for (const r of regras) {
    const sem = faltando(r, grade, base.tamanho);
    if (sem.length > 0) avisos.push(`O ponto ${r.no + 1} não tem valor para ${sem.join(", ")}: conta como o tamanho vizinho.`);
  }
  return avisos;
}

// ---------------------------------------------------------------------------
// GERAR OS TAMANHOS DO MOLDE
// ---------------------------------------------------------------------------

/**
 * O que gerar: cada grupo com graduação (ou só o `grupo` pedido), cada
 * tamanho da grade menos o base. Sem desenho: criar. Gerado pela graduação:
 * refazer. Com desenho próprio (Audaces, "juntar", ajustado à mão): perguntar.
 */
export function planejarGeracao(pecas, grade, grupo = null) {
  const alvos = [];
  const nomes = nomesEmOrdem(grade);
  pecas.forEach((base, iBase) => {
    if (!base.graduacao || (grupo !== null && base.grupo !== grupo)) return;
    for (const tamanho of nomes) {
      if (tamanho === base.tamanho) continue;
      const iExistente = pecas.findIndex((q) => q.grupo === base.grupo && q.tamanho === tamanho);
      const existente = iExistente >= 0 ? pecas[iExistente] : null;
      const acao = !existente ? "criar" : existente.origem === ORIGEM_GERADA ? "refazer" : "perguntar";
      alvos.push({ grupo: base.grupo, tamanho, iBase, iExistente, acao, origem: existente?.origem ?? null, nome: base.nome || base.papel });
    }
  });
  return alvos;
}

/**
 * Gera os alvos. O que o `conferir` recusa (a margem fecha a peça no P
 * pequeno) fica de fora, com o motivo: gerá-lo seguraria a gravação do molde
 * inteiro. O refeito fica no mesmo lugar da lista; o criado vai para o fim.
 */
export function aplicarGeracao(pecas, grade, alvos, conferir) {
  const novas = [...pecas];
  const gerados = [];
  const naoGerados = [];
  const avisos = new Set();
  for (const alvo of alvos) {
    const r = gerarTamanho(pecas[alvo.iBase], grade, alvo.tamanho);
    if (r.erro) { naoGerados.push({ ...alvo, motivo: r.erro }); continue; }
    for (const a of r.avisos) avisos.add(`${alvo.nome}: ${a}`);
    const conferida = conferir(r.peca);
    if (!conferida.peca) { naoGerados.push({ ...alvo, motivo: conferida.erro }); continue; }
    if (alvo.iExistente >= 0) novas[alvo.iExistente] = r.peca;
    else novas.push(r.peca);
    gerados.push(alvo);
  }
  return { pecas: novas, gerados, naoGerados, avisos: [...avisos] };
}

// ---------------------------------------------------------------------------
// SOBREPOR OS TAMANHOS
// ---------------------------------------------------------------------------

/**
 * Quanto a `camada` (outro tamanho da mesma peça) anda para ficar no lugar
 * certo em relação à `atual`. O `pecaParaGravar` encosta cada tamanho no
 * canto do próprio corte ao gravar, então depois de um F5 cada um está no seu
 * canto. Com graduação e os mesmos nós: pela regra, exato. Sem: pelos centros.
 */
export function alinhamentoDaCamada(atual, camada, base, grade) {
  if (base?.graduacao && camada.nos.length === base.nos.length && atual.nos.length === base.nos.length) {
    const dAtual = deslocamentosDoTamanho(base, grade, atual.tamanho);
    const dCamada = deslocamentosDoTamanho(base, grade, camada.tamanho);
    if (dAtual && dCamada) {
      let sx = 0; let sy = 0;
      for (let i = 0; i < camada.nos.length; i++) {
        sx += atual.nos[i].x + (dCamada[i].dx - dAtual[i].dx) - camada.nos[i].x;
        sy += atual.nos[i].y + (dCamada[i].dy - dAtual[i].dy) - camada.nos[i].y;
      }
      return { dx: sx / camada.nos.length, dy: sy / camada.nos.length };
    }
  }
  const ca = centroDoRisco(atual.nos);
  const cc = centroDoRisco(camada.nos);
  return { dx: ca.x - cc.x, dy: ca.y - cc.y };
}
