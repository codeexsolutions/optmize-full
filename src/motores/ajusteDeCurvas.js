/**
 * ===========================================================================
 * AJUSTE DE CURVAS — a escada de pontos virando poucos nós com curva
 * ===========================================================================
 *
 * Recebe o contorno denso que saiu da grade (centenas de pontos) e devolve
 * poucos NÓS, cada um com alças de curva. É o algoritmo do Philip Schneider
 * (Graphics Gems, 1990), o mesmo que está por trás do "traçar automático" dos
 * editores de vetor.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 *
 * Um molde de calça saía com 377 pontos. Todos eram reta ligando reta, porque
 * é só isso que uma grade sabe produzir. Duas consequências, e a fábrica
 * reclamou das duas:
 *
 *   - Ajustar à mão era inviável. Para corrigir um gancho a pessoa teria que
 *     arrastar trinta pontos, um a um, e ainda deixá-los alinhados entre si.
 *   - A curva não era curva. Com pontos demais ela fica visualmente suave, mas
 *     continua sendo um polígono: o arquivo que sai leva a poligonal, não o
 *     arco, e quem abre no CorelDRAW recebe trinta nós para mexer também.
 *
 * Com curvas, o mesmo gancho vira dois ou três nós com alça. A pessoa pega a
 * alça e a curva inteira acompanha.
 *
 * ---------------------------------------------------------------------------
 * PRIMEIRO OS CANTOS, DEPOIS AS CURVAS
 * ---------------------------------------------------------------------------
 *
 * O Schneider sozinho arredondaria os cantos de verdade — a ponta do gancho, o
 * bico da entreperna —, e num molde isso é estrago: aquele bico é ponto de
 * costura, não enfeite.
 *
 * Então antes de ajustar curva nenhuma, o contorno é quebrado nos CANTOS, e
 * cada trecho entre dois cantos é ajustado por si. O canto é medido numa
 * janela de vários pontos, e não entre vizinhos imediatos: entre vizinhos,
 * cada degrau que sobrou da grade pareceria um canto de 90 graus, e o contorno
 * inteiro viraria canto.
 *
 * ---------------------------------------------------------------------------
 * O QUE O ERRO SIGNIFICA
 * ---------------------------------------------------------------------------
 *
 * `erroMaximo` é a distância, em células da grade, que a curva pode se afastar
 * do contorno original. É a régua da fidelidade: apertado dá mais nós e segue
 * cada ondulação; folgado dá menos nós e corta caminho. O ajuste é recursivo —
 * não coube dentro do erro, parte no ponto que mais errou e tenta de novo.
 */

/** Distância entre dois pontos. */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Vetor normalizado de `a` para `b`, ou `null` se coincidem. */
function direcao(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.hypot(dx, dy);
  return t < 1e-9 ? null : { x: dx / t, y: dy / t };
}

/** Um ponto da cúbica de Bézier em `t`. */
function naCurva(c, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  };
}

/**
 * Onde cada ponto do trecho cai ao longo dele, de 0 a 1.
 *
 * Pelo comprimento acumulado (parametrização por corda). É a aproximação que o
 * Schneider usa de largada; ela erra em curva muito fechada, e é por isso que
 * o ajuste que falha é PARTIDO em dois em vez de insistir.
 */
function aoLongo(pontos) {
  const t = [0];
  for (let i = 1; i < pontos.length; i++) t.push(t[i - 1] + dist(pontos[i], pontos[i - 1]));
  const total = t[t.length - 1];
  if (total <= 0) return pontos.map((_, i) => i / Math.max(1, pontos.length - 1));
  return t.map((v) => v / total);
}

/**
 * A cúbica que melhor passa pelos pontos, dadas as tangentes das duas pontas.
 *
 * Mínimos quadrados sobre as duas alças (o miolo do Schneider). Quando o
 * sistema não tem solução — pontos quase em cima uns dos outros — cai no
 * palpite de Wu/Barsky: alça a um terço da corda.
 */
function cubicaPorMinimosQuadrados(pontos, t, tangenteInicial, tangenteFinal) {
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];

  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 0; i < pontos.length; i++) {
    const u = 1 - t[i];
    const b1 = 3 * u * u * t[i];
    const b2 = 3 * u * t[i] * t[i];
    const a1 = { x: tangenteInicial.x * b1, y: tangenteInicial.y * b1 };
    const a2 = { x: tangenteFinal.x * b2, y: tangenteFinal.y * b2 };

    c00 += a1.x * a1.x + a1.y * a1.y;
    c01 += a1.x * a2.x + a1.y * a2.y;
    c11 += a2.x * a2.x + a2.y * a2.y;

    const b0 = u * u * u;
    const b3 = t[i] * t[i] * t[i];
    const tmp = {
      x: pontos[i].x - (b0 * primeiro.x + b1 * primeiro.x + b2 * ultimo.x + b3 * ultimo.x),
      y: pontos[i].y - (b0 * primeiro.y + b1 * primeiro.y + b2 * ultimo.y + b3 * ultimo.y),
    };
    x0 += a1.x * tmp.x + a1.y * tmp.y;
    x1 += a2.x * tmp.x + a2.y * tmp.y;
  }

  const det = c00 * c11 - c01 * c01;
  let alfa1;
  let alfa2;
  if (Math.abs(det) < 1e-12) {
    alfa1 = 0;
    alfa2 = 0;
  } else {
    alfa1 = (x0 * c11 - x1 * c01) / det;
    alfa2 = (c00 * x1 - c01 * x0) / det;
  }

  const corda = dist(primeiro, ultimo);
  if (!(alfa1 > 1e-6) || !(alfa2 > 1e-6) || alfa1 > corda * 3 || alfa2 > corda * 3) {
    const terco = corda / 3;
    alfa1 = terco;
    alfa2 = terco;
  }

  return [
    primeiro,
    { x: primeiro.x + tangenteInicial.x * alfa1, y: primeiro.y + tangenteInicial.y * alfa1 },
    { x: ultimo.x + tangenteFinal.x * alfa2, y: ultimo.y + tangenteFinal.y * alfa2 },
    ultimo,
  ];
}

/** O ponto que mais se afasta da curva, e o quanto. */
function maiorErro(pontos, t, curva) {
  let pior = Math.floor(pontos.length / 2);
  let maior = 0;
  for (let i = 1; i < pontos.length - 1; i++) {
    const d = dist(naCurva(curva, t[i]), pontos[i]);
    if (d > maior) { maior = d; pior = i; }
  }
  return { pior, maior };
}

/** Ajusta um trecho, partindo onde errar demais. */
function ajustarTrecho(pontos, tangenteInicial, tangenteFinal, erroMaximo, profundidade, saida) {
  if (pontos.length < 2) return;
  if (pontos.length === 2) {
    // Dois pontos: reta. Alça a um terço para a curva continuar sendo cúbica.
    const corda = dist(pontos[0], pontos[1]) / 3;
    saida.push([
      pontos[0],
      { x: pontos[0].x + tangenteInicial.x * corda, y: pontos[0].y + tangenteInicial.y * corda },
      { x: pontos[1].x + tangenteFinal.x * corda, y: pontos[1].y + tangenteFinal.y * corda },
      pontos[1],
    ]);
    return;
  }

  const t = aoLongo(pontos);
  const curva = cubicaPorMinimosQuadrados(pontos, t, tangenteInicial, tangenteFinal);
  const { pior, maior } = maiorErro(pontos, t, curva);

  // Fundo de 16 para não descer para sempre num trecho patológico; no pior
  // caso sai uma curva pior, nunca uma tela travada.
  if (maior <= erroMaximo || profundidade >= 16) {
    saida.push(curva);
    return;
  }

  const meio = pontos[pior];
  const antes = pontos[pior - 1];
  const depois = pontos[pior + 1];
  // A tangente do ponto de corte sai da média dos dois vizinhos: usar só um
  // lado deixaria um bico visível na emenda dos dois pedaços.
  const d = direcao(antes, depois) || { x: 1, y: 0 };
  ajustarTrecho(pontos.slice(0, pior + 1), tangenteInicial, { x: -d.x, y: -d.y }, erroMaximo, profundidade + 1, saida);
  ajustarTrecho(pontos.slice(pior), d, tangenteFinal, erroMaximo, profundidade + 1, saida);
  void meio;
}

/**
 * Onde o contorno vira canto de verdade.
 *
 * Mede o ângulo entre a direção que chega e a que sai, olhando `janela` pontos
 * para cada lado. A janela é o que separa canto de degrau: entre vizinhos
 * imediatos, cada degrau que sobrou da grade mediria 90 graus.
 */
function cantosDo(pontos, janela, grausMinimos) {
  const n = pontos.length;
  const limite = Math.cos((180 - grausMinimos) * Math.PI / 180);
  const cantos = [];
  if (n < janela * 2 + 1) return cantos;
  for (let i = 0; i < n; i++) {
    const a = pontos[(i - janela + n) % n];
    const b = pontos[i];
    const c = pontos[(i + janela) % n];
    const d1 = direcao(a, b);
    const d2 = direcao(b, c);
    if (!d1 || !d2) continue;
    const cosseno = d1.x * d2.x + d1.y * d2.y;
    if (cosseno < limite) cantos.push({ i, cosseno });
  }
  // Cantos vizinhos são o mesmo canto visto de várias alturas: fica o mais
  // fechado de cada aglomerado.
  const escolhidos = [];
  let grupo = [];
  for (let k = 0; k < cantos.length; k++) {
    const atual = cantos[k];
    const anterior = cantos[k - 1];
    if (anterior && atual.i - anterior.i <= janela) grupo.push(atual);
    else { if (grupo.length) escolhidos.push(grupo.reduce((m, c) => (c.cosseno < m.cosseno ? c : m))); grupo = [atual]; }
  }
  if (grupo.length) escolhidos.push(grupo.reduce((m, c) => (c.cosseno < m.cosseno ? c : m)));
  return escolhidos.map((c) => c.i);
}

/**
 * O contorno denso virando nós com alça.
 *
 * Devolve uma lista de nós `{ x, y, entrada, saida, canto }`, onde `entrada` e
 * `saida` são as alças (em coordenadas absolutas, as mesmas do nó) e `canto`
 * diz que ali é bico de verdade — a tela usa isso para desenhar o nó diferente
 * e para não alinhar as alças ao mover.
 *
 * O caminho é FECHADO: o último nó liga no primeiro.
 */
export function curvasDoContorno(pontos, { erroMaximo = 1.2, janelaDeCanto = 6, grausDeCanto = 55 } = {}) {
  const n = pontos.length;
  if (n < 4) {
    return pontos.map((p) => ({ x: p.x, y: p.y, entrada: { ...p }, saida: { ...p }, canto: true }));
  }

  const cantos = cantosDo(pontos, Math.min(janelaDeCanto, Math.floor(n / 6) || 1), grausDeCanto);

  /*
   * As quebras precisam ser DUAS, no mínimo, e o motivo é a volta fechada: com
   * uma quebra só, o trecho começa e termina no mesmo ponto, o laço fecha na
   * primeira iteração e não sobra curva nenhuma para ajustar.
   *
   * Isso não é hipótese — foi assim que a tela quebrou. Um contorno com
   * exatamente um canto (a camisa de teste, que só tem o bico do decote) caía
   * no plano B lá de baixo e devolvia os 395 pontos do contorno como nós de
   * canto, um por ponto. Na tela aparecia o traço todo de quadradinhos, que é
   * exatamente o que o ajuste de curvas existe para não fazer.
   *
   * Zero canto (uma forma redonda) tem o mesmo problema, e a mesma saída: parte
   * no meio, e as duas metades se encontram nas pontas.
   */
  const quebras = cantos.slice();
  if (quebras.length === 0) quebras.push(0);
  if (quebras.length === 1) quebras.push((quebras[0] + Math.floor(n / 2)) % n);
  quebras.sort((a, b) => a - b);

  const curvas = [];
  for (let k = 0; k < quebras.length; k++) {
    const ini = quebras[k];
    const fim = quebras[(k + 1) % quebras.length];
    const trecho = [];
    let i = ini;
    for (;;) {
      trecho.push(pontos[i]);
      if (i === fim) break;
      i = (i + 1) % n;
      if (trecho.length > n) break; // guarda contra volta infinita
    }
    if (trecho.length < 2) continue;
    const d1 = direcao(trecho[0], trecho[1]) || { x: 1, y: 0 };
    const ultimo = trecho.length - 1;
    const d2 = direcao(trecho[ultimo], trecho[ultimo - 1]) || { x: -1, y: 0 };
    ajustarTrecho(trecho, d1, d2, erroMaximo, 0, curvas);
  }

  if (curvas.length === 0) {
    return pontos.map((p) => ({ x: p.x, y: p.y, entrada: { ...p }, saida: { ...p }, canto: true }));
  }

  // As cúbicas viram nós: o fim de uma é o começo da seguinte, então cada nó
  // guarda a alça que chega (da cúbica anterior) e a que sai (da próxima).
  const noEhCanto = new Set();
  let acumulado = 0;
  for (const c of curvas) { noEhCanto.add(acumulado); acumulado++; }

  const nos = [];
  for (let k = 0; k < curvas.length; k++) {
    const atual = curvas[k];
    const anterior = curvas[(k - 1 + curvas.length) % curvas.length];
    nos.push({
      x: atual[0].x,
      y: atual[0].y,
      entrada: { x: anterior[2].x, y: anterior[2].y },
      saida: { x: atual[1].x, y: atual[1].y },
      canto: false,
    });
  }

  // Marca como canto os nós que caíram em cima de um canto detectado.
  if (cantos.length > 0) {
    for (const no of nos) {
      for (const ci of cantos) {
        if (dist(no, pontos[ci]) < 1.5) { no.canto = true; break; }
      }
    }
  }

  return nos;
}

/** Achata o caminho de nós numa poligonal, para medir caixa e área. */
export function achatarCurvas(nos, porCurva = 12) {
  if (nos.length < 2) return nos.map((n) => ({ x: n.x, y: n.y }));
  const saida = [];
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i];
    const b = nos[(i + 1) % nos.length];
    const curva = [{ x: a.x, y: a.y }, a.saida, b.entrada, { x: b.x, y: b.y }];
    for (let k = 0; k < porCurva; k++) saida.push(naCurva(curva, k / porCurva));
  }
  return saida;
}
