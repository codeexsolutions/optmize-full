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
 * Um nó: `{ x, y, entrada, saida, canto?, retaDepois? }`. Quem guarda se o
 * trecho até o nó seguinte é reta é o nó que COMEÇA o trecho.
 */

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
    canto: n.canto, retaDepois: n.retaDepois,
  }));
}

/**
 * Arrasta o nó ou uma alça até `alvo`.
 *
 * O nó leva as alças junto: sem isso, mover um nó deformaria as duas curvas
 * vizinhas em vez de arrastar o trecho inteiro. Nó de curva mantém as duas
 * alças alinhadas (a curva passa lisa por ele); nó de CANTO não, senão o bico
 * se perderia ao mexer num lado.
 */
export function moverPega(nos, pega, alvo) {
  return nos.map((n, i) => {
    if (i !== pega.no) return n;
    if (pega.parte === "no") {
      const dx = alvo.x - n.x;
      const dy = alvo.y - n.y;
      return {
        ...n,
        x: alvo.x,
        y: alvo.y,
        entrada: { x: n.entrada.x + dx, y: n.entrada.y + dy },
        saida: { x: n.saida.x + dx, y: n.saida.y + dy },
      };
    }
    const oposta = { x: 2 * n.x - alvo.x, y: 2 * n.y - alvo.y };
    if (pega.parte === "entrada") {
      return { ...n, entrada: { x: alvo.x, y: alvo.y }, saida: n.canto ? n.saida : oposta };
    }
    return { ...n, saida: { x: alvo.x, y: alvo.y }, entrada: n.canto ? n.entrada : oposta };
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
