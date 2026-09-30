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

import { curvasDoTrecho } from "./ajusteDeCurvas";

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
 * O que está debaixo do ponteiro: uma alça de um nó selecionado, ou um nó.
 *
 * As alças primeiro: ficam por cima e costumam estar perto do nó. Só as dos
 * nós em `comAlcas` (um índice, uma lista ou um Set; `null` = nenhum) — são
 * as que estão desenhadas. Lado reto não tem alça para pegar, e alça zerada
 * também não: as duas estão em cima do nó, e pegá-las roubaria o clique dele.
 */
export function pegaSob(nos, alvo, raio, comAlcas) {
  const n = nos.length;
  const lista = comAlcas === null || comAlcas === undefined ? [] : typeof comAlcas === "number" ? [comAlcas] : [...comAlcas];
  let alca = null;
  let menorAlca = raio;
  for (const i of lista) {
    const no = nos[i];
    if (!no) continue;
    const anterior = nos[(i - 1 + n) % n];
    for (const parte of ["entrada", "saida"]) {
      if (parte === "saida" && no.retaDepois) continue;
      if (parte === "entrada" && anterior.retaDepois) continue;
      if (tamanho(menos(no[parte], no)) < 1e-9) continue;
      const d = Math.hypot(no[parte].x - alvo.x, no[parte].y - alvo.y);
      if (d < menorAlca) { menorAlca = d; alca = { no: i, parte, distancia: d }; }
    }
  }
  if (alca) return alca;
  let achado = null;
  let menor = raio;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(nos[i].x - alvo.x, nos[i].y - alvo.y);
    if (d < menor) { menor = d; achado = { no: i, parte: "no", distancia: d }; }
  }
  return achado;
}

/**
 * Em que trecho o ponteiro caiu, e em que `t`: dezesseis passos por trecho, e
 * mais dezesseis em volta do melhor — puxar a curva pega o ponto em `t`, e um
 * dezesseis avos de erro já se vê.
 */
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
  if (!melhor) return null;
  const { no } = melhor;
  const de = Math.max(0, melhor.t - 1 / 16);
  const ate = Math.min(1, melhor.t + 1 / 16);
  for (let k = 0; k <= 16; k++) {
    const t = de + ((ate - de) * k) / 16;
    const q = pontoNoTrecho(nos, no, t);
    const d = Math.hypot(q.x - alvo.x, q.y - alvo.y);
    if (d < melhor.distancia) melhor = { no, t, distancia: d };
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

/** Os nós dentro do retângulo de cantos `a` e `b` (em qualquer ordem). */
export function nosNoRetangulo(nos, a, b) {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const saida = [];
  nos.forEach((no, i) => { if (no.x >= x0 && no.x <= x1 && no.y >= y0 && no.y <= y1) saida.push(i); });
  return saida;
}

/** Move os nós escolhidos, com as alças. */
export function moverNos(nos, indices, dx, dy) {
  const escolhidos = new Set(indices);
  const d = { x: dx, y: dy };
  return nos.map((no, i) => (escolhidos.has(i)
    ? { ...no, x: no.x + dx, y: no.y + dy, entrada: somar(no.entrada, d), saida: somar(no.saida, d) }
    : no));
}

/**
 * As sequências de índices vizinhos na volta. A volta é fechada, então uma
 * sequência pode passar pelo nó 0 — por isso a contagem começa depois de um
 * nó que NÃO está na lista. Todos na lista: uma sequência só, de 0 a n−1.
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

/**
 * Os trechos em que as ações da barra agem, pelo nó que começa cada um: os que
 * têm as duas pontas selecionadas; com um nó só selecionado, o trecho que
 * CHEGA nele, como no Corel.
 */
export function trechosDaSelecao(nos, indices) {
  const n = nos.length;
  const sel = new Set(indices.filter((i) => i >= 0 && i < n));
  if (sel.size === 1) {
    const [i] = sel;
    return [(i - 1 + n) % n];
  }
  return [...sel].sort((a, b) => a - b).filter((i) => sel.has((i + 1) % n));
}

/** Alinha os escolhidos pela `referencia`: "horizontal" = a mesma altura (y); "vertical" = a mesma coluna (x). */
export function alinharNos(nos, indices, eixo, referencia) {
  const escolhidos = new Set(indices);
  return nos.map((no, i) => {
    if (!escolhidos.has(i)) return no;
    const d = eixo === "horizontal" ? { x: 0, y: referencia.y - no.y } : { x: referencia.x - no.x, y: 0 };
    return { ...no, x: no.x + d.x, y: no.y + d.y, entrada: somar(no.entrada, d), saida: somar(no.saida, d) };
  });
}

/**
 * Puxa o trecho que começa no nó `i` pelo ponto em `t`, até `alvo`.
 *
 * O ponto pego acompanha o ponteiro EXATAMENTE, e as pontas ficam paradas: só
 * as duas alças do trecho mudam. O deslocamento se divide entre elas pelo peso
 * de `t` (o do Inkscape) — perto de uma ponta, anda mais a alça daquela ponta.
 * As pontas respeitam o tipo (via `moverPega`): na suave e na simétrica, a
 * alça do outro lado gira junto, e a curva continua lisa no nó. Trecho reto não
 * entorta: `null`.
 */
export function puxarTrecho(nos, i, t, alvo) {
  const n = nos.length;
  const a = nos[i];
  const j = (i + 1) % n;
  const b = nos[j];
  if (!a || !b || a.retaDepois) return null;
  const tt = Math.min(0.98, Math.max(0.02, t));
  const u = 1 - tt;
  const agora = naCurva(a, a.saida, b.entrada, b, tt);
  const delta = menos(alvo, agora);
  let peso;
  if (tt <= 1 / 6) peso = 0;
  else if (tt <= 0.5) peso = Math.pow((6 * tt - 1) / 2, 3) / 2;
  else if (tt <= 5 / 6) peso = (1 - Math.pow((6 * u - 1) / 2, 3)) / 2 + 0.5;
  else peso = 1;
  const saida = somar(a.saida, vezes(delta, (1 - peso) / (3 * tt * u * u)));
  const entrada = somar(b.entrada, vezes(delta, peso / (3 * tt * tt * u)));
  return moverPega(moverPega(nos, { no: i, parte: "saida" }, saida), { no: j, parte: "entrada" }, entrada);
}

/**
 * Converte os `trechos` (pelo nó que começa cada um) em linha ou em curva, com
 * os nós no lugar. Em linha, as alças daquele trecho desabam em cima dos nós.
 * Em curva, o trecho reto ganha alças a um terço e a dois terços do caminho: a
 * curva nasce igual à reta, e só muda quando alguém puxa.
 */
export function converterTrechos(nos, trechos, jeito) {
  const n = nos.length;
  const copia = nos.slice();
  for (const i of trechos) {
    const j = (i + 1) % n;
    const a = copia[i];
    const b = copia[j];
    if (jeito === "linha") {
      if (a.retaDepois) continue;
      copia[i] = { ...a, retaDepois: true, saida: { x: a.x, y: a.y } };
      copia[j] = { ...copia[j], entrada: { x: b.x, y: b.y } };
    } else {
      if (!a.retaDepois) continue;
      const terco = (de, para) => ({ x: de.x + (para.x - de.x) / 3, y: de.y + (para.y - de.y) / 3 });
      copia[i] = { ...a, retaDepois: false, saida: terco(a, b) };
      copia[j] = { ...copia[j], entrada: terco(b, a) };
    }
  }
  return copia;
}

/**
 * Um nó em cada ponto `{ no, t }` — no máximo um por trecho —, sem mudar o
 * desenho. Do trecho de número maior para o menor: assim os de antes não
 * mudam de número.
 */
export function porNosNoTraco(nos, pontos) {
  const porTrecho = new Map();
  for (const p of pontos) if (p.no >= 0 && p.no < nos.length && !porTrecho.has(p.no)) porTrecho.set(p.no, p.t);
  let r = nos;
  for (const [no, t] of [...porTrecho].sort((x, y) => y[0] - x[0])) r = inserirNoNoTraco(r, no, t);
  return r;
}

/** Os pontos do trecho `i` em `passos` pedaços, sem o último (que é o nó seguinte). */
function amostrasDoTrecho(nos, i, passos) {
  const saida = [];
  for (let k = 0; k < passos; k++) saida.push(pontoNoTrecho(nos, i, k / passos));
  return saida;
}

/** A direção com que o trecho `i` sai do nó que o começa (a alça; na reta, ou com a alça zerada, a corda). */
function saidaDoTrecho(nos, i) {
  const a = nos[i];
  const b = nos[(i + 1) % nos.length];
  return (a.retaDepois ? null : unitario(menos(a.saida, a))) ?? unitario(menos(b, a));
}

/** A direção, a partir do nó seguinte, de volta para dentro do trecho `i`. */
function chegadaDoTrecho(nos, i) {
  const a = nos[i];
  const b = nos[(i + 1) % nos.length];
  return (a.retaDepois ? null : unitario(menos(b.entrada, b))) ?? unitario(menos(a, b));
}

/** Os pontos do pedaço feito dos trechos `velhos` (`passos` por trecho), mais o nó em que ele termina. */
function pontosDoPedaco(nos, velhos, passos) {
  const pontos = [];
  for (const s of velhos) pontos.push(...amostrasDoTrecho(nos, s, passos));
  const fim = nos[(velhos[velhos.length - 1] + 1) % nos.length];
  pontos.push({ x: fim.x, y: fim.y });
  return pontos;
}

/**
 * Apaga os nós, refazendo cada pedaço juntado para ficar o mais perto possível
 * do desenho de antes, como o Corel: o traço antigo do pedaço é achatado e
 * ajustado por UMA cúbica com as tangentes das duas pontas (`curvasDoTrecho`).
 * Se todos os trechos juntados eram retos, o pedaço novo é reto. A peça nunca
 * fica com menos de três nós: `{ erro }`, e nada é apagado.
 */
export function apagarNos(nos, indices) {
  const n = nos.length;
  const fora = new Set(indices.filter((i) => i >= 0 && i < n));
  if (n - fora.size < 3) return { erro: "A peça ficaria com menos de três nós." };
  const copia = nos.slice();
  const pedacos = sequenciasDe([...fora], n).map((seq) => {
    const a = (seq[0] - 1 + n) % n;
    const b = (seq[seq.length - 1] + 1) % n;
    const velhos = [a, ...seq];
    if (velhos.every((s) => nos[s].retaDepois)) {
      copia[a] = { ...copia[a], retaDepois: true, saida: { x: nos[a].x, y: nos[a].y } };
      copia[b] = { ...copia[b], entrada: { x: nos[b].x, y: nos[b].y } };
    } else {
      const inicial = saidaDoTrecho(nos, a) ?? { x: 1, y: 0 };
      const final = chegadaDoTrecho(nos, velhos[velhos.length - 1]) ?? { x: -1, y: 0 };
      const [curva] = curvasDoTrecho(pontosDoPedaco(nos, velhos, 24), inicial, final, Infinity);
      copia[a] = { ...copia[a], retaDepois: false, saida: { ...curva[1] } };
      copia[b] = { ...copia[b], entrada: { ...curva[2] } };
    }
    return { a, velhos };
  });
  const mapa = [];
  let k = 0;
  for (let i = 0; i < n; i++) mapa.push(fora.has(i) ? null : k++);
  return {
    nos: copia.filter((_, i) => !fora.has(i)),
    mapa,
    trechos: pedacos.map((p) => ({ velhos: p.velhos, novos: [mapa[p.a]] })),
  };
}
