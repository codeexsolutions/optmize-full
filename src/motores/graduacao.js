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
