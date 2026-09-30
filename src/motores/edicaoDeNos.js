/**
 * ===========================================================================
 * EDIÇÃO DE NÓS — as contas de mexer num risco de nós com alça
 * ===========================================================================
 *
 * Moravam dentro de `telas/Digitalizar.tsx`. Saíram quando a Montagem passou a
 * editar o mesmo tipo de risco: duas cópias da mesma conta divergiriam na
 * primeira correção feita numa só.
 *
 * Conta pura: recebe a lista de nós e devolve uma lista NOVA, sem tocar na que
 * recebeu — a tela guarda a antiga na pilha do desfazer, e um objeto alterado
 * no lugar desfaria o desfazer.
 *
 * Um nó: `{ x, y, entrada, saida, canto?, retaDepois?, simetrico? }`. Quem
 * guarda se o trecho até o nó seguinte é reta é o nó que COMEÇA o trecho. O
 * tipo do nó (`tipoDoNo`) diz como as duas alças andam juntas.
 */

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

/** Um ponto da cúbica em `t`. */
export function naCurva(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** O ponto em `t` do trecho que começa no nó `i` — reta ou curva. */
export function pontoNoTrecho(nos, i, t) {
  const a = nos[i];
  const b = nos[(i + 1) % nos.length];
  if (a.retaDepois) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return naCurva(a, a.saida, b.entrada, b, t);
}

/**
 * Parte a cúbica em duas, em `t`, sem mudar o desenho (de Casteljau).
 *
 * É o que deixa "pôr um nó no meio da curva" ser inofensivo: o traço fica
 * exatamente onde estava, só passa a ter mais um nó para pegar.
 */
export function dividirCurva(p0, p1, p2, p3, t) {
  const meio = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a1 = meio(p0, p1);
  const a2 = meio(p1, p2);
  const a3 = meio(p2, p3);
  const b1 = meio(a1, a2);
  const b2 = meio(a2, a3);
  const centro = meio(b1, b2);
  return { saidaDoAnterior: a1, entradaDoNovo: b1, no: centro, saidaDoNovo: b2, entradaDoSeguinte: a3 };
}

export function clonarNos(nos) {
  return nos.map((n) => ({
    x: n.x, y: n.y, entrada: { ...n.entrada }, saida: { ...n.saida },
    canto: n.canto, retaDepois: n.retaDepois, ...(n.simetrico ? { simetrico: true } : {}),
  }));
}

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

/** Tira o nó `i`. Com menos de três não existe contorno para fechar: `null`. */
export function apagarNo(nos, i) {
  if (nos.length <= 3) return null;
  return nos.filter((_, k) => k !== i);
}

/**
 * Troca um lado do nó entre reta e curva.
 *
 * "depois" é o trecho até o nó seguinte; "antes", o que vem do anterior — e
 * esse é guardado no nó anterior. Virando curva, as alças nascem a um terço
 * do caminho: a curva começa idêntica à reta e só muda quando alguém arrasta.
 * Virando reta, as alças desabam em cima dos nós.
 */
export function alternarLado(nos, no, lado) {
  if (nos.length < 2) return nos;
  const inicio = lado === "depois" ? no : (no - 1 + nos.length) % nos.length;
  const fim = (inicio + 1) % nos.length;
  const a = nos[inicio];
  const b = nos[fim];
  const saida = nos.slice();
  if (!a.retaDepois) {
    saida[inicio] = { ...a, retaDepois: true, saida: { x: a.x, y: a.y } };
    saida[fim] = { ...b, entrada: { x: b.x, y: b.y } };
  } else {
    const terco = (de, para) => ({ x: de.x + (para.x - de.x) / 3, y: de.y + (para.y - de.y) / 3 });
    saida[inicio] = { ...a, retaDepois: false, saida: terco(a, b) };
    saida[fim] = { ...b, entrada: terco(b, a) };
  }
  return saida;
}

/**
 * Põe um nó no trecho que começa em `i`, na posição `t`, sem mudar o desenho.
 * O nó novo fica no índice `i + 1`. Numa reta, as duas metades continuam
 * retas: partir uma reta não pode inventar curvatura.
 */
export function inserirNoNoTraco(nos, i, t) {
  const a = nos[i];
  const seguinte = (i + 1) % nos.length;
  const b = nos[seguinte];
  const saida = nos.slice();
  if (a.retaDepois) {
    const meio = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    saida.splice(i + 1, 0, {
      x: meio.x, y: meio.y, entrada: { ...meio }, saida: { ...meio }, canto: false, retaDepois: true,
    });
    return saida;
  }
  const corte = dividirCurva(a, a.saida, b.entrada, b, t);
  saida[i] = { ...a, saida: corte.saidaDoAnterior };
  saida[seguinte] = { ...b, entrada: corte.entradaDoSeguinte };
  saida.splice(i + 1, 0, {
    x: corte.no.x, y: corte.no.y,
    entrada: corte.entradaDoNovo, saida: corte.saidaDoNovo,
    canto: false, retaDepois: false,
  });
  return saida;
}

/**
 * O que está debaixo do ponteiro: uma alça do nó ativo, ou um nó.
 *
 * As alças primeiro: ficam por cima e costumam estar perto do nó. Lado reto
 * não tem alça para pegar — ela está em cima do nó, e deixar pegá-la roubaria
 * o clique do próprio nó.
 */
export function pegaSob(nos, alvo, raio, noAtivo) {
  if (noAtivo !== null && noAtivo !== undefined && nos[noAtivo]) {
    const n = nos[noAtivo];
    const anterior = nos[(noAtivo - 1 + nos.length) % nos.length];
    for (const parte of ["entrada", "saida"]) {
      if (parte === "saida" && n.retaDepois) continue;
      if (parte === "entrada" && anterior.retaDepois) continue;
      const d = Math.hypot(n[parte].x - alvo.x, n[parte].y - alvo.y);
      if (d < raio) return { no: noAtivo, parte, distancia: d };
    }
  }
  let achado = null;
  let menor = raio;
  for (let i = 0; i < nos.length; i++) {
    const d = Math.hypot(nos[i].x - alvo.x, nos[i].y - alvo.y);
    if (d < menor) { menor = d; achado = { no: i, parte: "no", distancia: d }; }
  }
  return achado;
}

/** Em que trecho o ponteiro caiu, e em que `t`. Dezesseis passos por trecho. */
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
  return melhor;
}

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
