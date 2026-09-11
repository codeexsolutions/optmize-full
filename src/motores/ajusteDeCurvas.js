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
 * PRIMEIRO AS RETAS, DEPOIS OS CANTOS, E SÓ ENTÃO AS CURVAS
 * ---------------------------------------------------------------------------
 *
 * Molde tem lado reto — a lateral de uma calça, a barra, a dobra do meio. Se o
 * ajuste de curva passar por cima deles, dois estragos saem juntos:
 *
 *   - **Nós à toa.** O Schneider ajusta a reta como se fosse curva e vai
 *     partindo até caber no erro, sobrando quatro ou cinco nós num lado que
 *     precisava de dois.
 *   - **Reta que não é reta.** A cúbica ajustada a uma reta fica quase reta, e
 *     "quase" num gabarito de corte é uma barriga de milímetros que ninguém
 *     pediu.
 *
 * Então o contorno é varrido antes atrás dos TRECHOS RETOS, e eles saem como
 * segmento de reta de verdade. O que sobra entre um reto e outro é que vai para
 * o ajuste de curva.
 *
 * Disso cai de brinde a coisa que a fábrica pediu pelo nome: o NÓ MISTO. No
 * ponto em que a lateral reta encontra a curva do gancho, o lado de cima é reta
 * e o de baixo é curva — e agora isso é representável, porque reta e curva são
 * propriedade do TRECHO (`retaDepois`), não do nó.
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

/** Distância de um ponto ao segmento `u`-`v`. */
function aoSegmento(p, u, v) {
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const t2 = dx * dx + dy * dy;
  const t = t2 > 0 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / t2)) : 0;
  return Math.hypot(u.x + t * dx - p.x, u.y + t * dy - p.y);
}

/**
 * O quanto a curva se afasta do trecho, e onde partir se for demais.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A CONTA ÓBVIA NÃO SERVE
 * ---------------------------------------------------------------------------
 *
 * O jeito clássico — e o que estava aqui — é medir, para cada ponto do trecho,
 * a distância dele até o ponto da curva no seu `t`. É barato e está ERRADO de
 * um jeito que não aparece: aquele `t` é um palpite (comprimento de corda), e
 * quando ele erra, a curva passa perto de cada ponto NO PONTO MEDIDO e estufa
 * ENTRE eles. A conta diz que caberia em 2 células enquanto o traço se afasta
 * 8 — uns 18 mm numa manga, que foi o erro que apareceu nas fotos de
 * `lazer/Nova pasta`.
 *
 * O Schneider original conserta isso reparametrizando por Newton. Aqui a saída
 * é mais direta e não depende de o `t` estar certo: a curva é PERCORRIDA e
 * comparada com a poligonal, nos dois sentidos. É o mesmo que se mede depois,
 * por fora, para dizer se o risco ficou bom — então é o que vale como critério.
 */
function maiorErro(pontos, t, curva) {
  const PASSOS = 24;
  const naLinha = [];
  for (let k = 0; k <= PASSOS; k++) naLinha.push(naCurva(curva, k / PASSOS));

  // A curva se afasta da poligonal?
  let maior = 0;
  for (const q of naLinha) {
    let menor = Infinity;
    for (let i = 0; i < pontos.length - 1; i++) {
      const d = aoSegmento(q, pontos[i], pontos[i + 1]);
      if (d < menor) menor = d;
    }
    if (menor > maior) maior = menor;
  }

  // E a poligonal se afasta da curva? O ponto que mais se afasta é por onde
  // vale a pena partir, porque é ali que a curva não deu conta da forma.
  let pior = Math.floor(pontos.length / 2);
  for (let i = 1; i < pontos.length - 1; i++) {
    let menor = Infinity;
    for (let k = 0; k < naLinha.length - 1; k++) {
      const d = aoSegmento(pontos[i], naLinha[k], naLinha[k + 1]);
      if (d < menor) menor = d;
    }
    if (menor > maior) { maior = menor; pior = i; }
  }
  void t;
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
 * Os trechos que são reta.
 *
 * Varredura gulosa: de cada começo, estica enquanto todo ponto do caminho
 * ficar a menos de `tolerancia` da corda que liga as duas pontas. O trecho que
 * estica pouco não vale — dois ou três pontos quase sempre passam no teste da
 * corda, e aceitá-los picaria a curva inteira em retinhas.
 *
 * Devolve pares `[inicio, fim]` em índices do contorno.
 */
function trechosRetos(pontos, tolerancia, minimoDePontos, minimoDeComprimento) {
  const n = pontos.length;
  const daReta = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.hypot(dx, dy);
    if (t < 1e-9) return dist(p, a);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / t;
  };

  const achados = [];
  let i = 0;
  while (i < n) {
    let melhorFim = -1;
    // Estica enquanto couber. Pára no primeiro que não couber: a reta é um
    // trecho contínuo, e furar o teste no meio já quer dizer que ali dobrou.
    for (let fim = i + minimoDePontos; fim < n; fim++) {
      const a = pontos[i];
      const b = pontos[fim];
      let cabe = true;
      for (let k = i + 1; k < fim; k++) {
        if (daReta(pontos[k], a, b) > tolerancia) { cabe = false; break; }
      }
      if (!cabe) break;
      melhorFim = fim;
    }
    if (melhorFim > 0 && dist(pontos[i], pontos[melhorFim]) >= minimoDeComprimento) {
      achados.push([i, melhorFim]);
      i = melhorFim;
    } else {
      i++;
    }
  }
  return achados;
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
/*
 * Os padrões saíram de medir, não de escolher.
 *
 * A varredura rodou contra `D:rte\photo da laser` comparando cada ajuste com
 * uma referência bem apertada (erro 0,2 e sem trecho reto), e olhando as duas
 * coisas juntas — quantos nós saem e o quanto o traço se afasta:
 *
 *   sem reta, erro 1,2   38,8 nós/peça    0%  retas   médio 0,31   pior 8,21
 *   tol 1,0  erro 2,0    27,6 nós/peça   29%  retas   médio 0,43   pior 8,23
 *   tol 1,5  erro 2,0    20,9 nós/peça   44%  retas   médio 0,37   pior 5,92  <-
 *   tol 2,5  erro 2,5    15,4 nós/peça   56%  retas   médio 0,27   pior 8,75
 *
 * A linha escolhida corta os nós quase pela metade e tem o PIOR afastamento
 * menor que o do ajuste antigo — ou seja, não é troca de fidelidade por
 * contagem; é ganho nas duas. As de baixo dão menos nós ainda, e pagam no pior
 * caso.
 *
 * Em medida de verdade, numa foto de mesa a célula vale uns 1,6 mm: a
 * tolerância de 1,5 deixa uma reta desviar 2,5 mm, e o afastamento médio de
 * 0,37 dá 0,6 mm. Quem for mexer nestes números: remeça contra a pasta inteira,
 * e olhe as duas colunas.
 *
 * Aferido depois contra `lazer/Nova pasta` (a mesma blusa nos quatro tamanhos,
 * 12 peças), medindo nos dois sentidos contra a borda do papel: erro médio de
 * 0,4 a 0,8 mm, pior caso de 3,5 a 4,7 mm, com 14 a 35 nós por peça. É esse o
 * padrão de qualidade a manter — e foi essa aferição que achou o erro de 18 mm
 * que o `maiorErro` escondia.
 */
export function curvasDoContorno(pontos, {
  erroMaximo = 2.0,
  janelaDeCanto = 6,
  grausDeCanto = 55,
  toleranciaDeReta = 1.5,
  minimoDePontosNaReta = 6,
  minimoDeComprimentoDaReta = 25,
  minimoEntreQuebras = 4,
  minimoEntreNos = 4,
} = {}) {
  const n = pontos.length;
  if (n < 4) {
    return pontos.map((p) => ({
      x: p.x, y: p.y, entrada: { ...p }, saida: { ...p }, canto: true, retaDepois: true,
    }));
  }

  const cantos = cantosDo(pontos, Math.min(janelaDeCanto, Math.floor(n / 6) || 1), grausDeCanto);
  const retas = trechosRetos(pontos, toleranciaDeReta, minimoDePontosNaReta, minimoDeComprimentoDaReta);

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
  // As quebras são os cantos MAIS as pontas de cada reta: é ali que um jeito de
  // desenhar acaba e o outro começa.
  const quebras = new Set(cantos);
  for (const [a, b] of retas) { quebras.add(a); quebras.add(b); }
  if (quebras.size === 0) quebras.add(0);
  if (quebras.size === 1) {
    const unico = [...quebras][0];
    quebras.add((unico + Math.floor(n / 2)) % n);
  }
  /*
   * Quebras quase no mesmo lugar viram uma só.
   *
   * Um canto que cai a um passo da ponta de uma reta gera duas quebras
   * vizinhas, e entre elas sai um trecho de fração de célula — dois nós
   * praticamente empilhados. Eles não desenham nada (a mediana dos trechos é
   * 25 células; esses davam 0,2) e atrapalham de verdade na edição: a pessoa
   * pega um nó e o outro fica embaixo, invisível.
   *
   * O mínimo é em DISTÂNCIA, não em índice: o contorno já vem aliviado, e a
   * distância entre dois índices vizinhos varia bastante ao longo da volta.
   */
  const ordenadas = [...quebras].sort((a, b) => a - b);
  const ordem = [];
  for (const q of ordenadas) {
    const anterior = ordem.length > 0 ? ordem[ordem.length - 1] : null;
    if (anterior !== null && dist(pontos[q], pontos[anterior]) < minimoEntreQuebras) continue;
    ordem.push(q);
  }
  // A última pode ter encostado na primeira dando a volta.
  if (ordem.length > 2 && dist(pontos[ordem[ordem.length - 1]], pontos[ordem[0]]) < minimoEntreQuebras) {
    ordem.pop();
  }
  if (ordem.length < 2) {
    ordem.length = 0;
    ordem.push(ordenadas[0] ?? 0, ((ordenadas[0] ?? 0) + Math.floor(n / 2)) % n);
    ordem.sort((a, b) => a - b);
  }

  /*
   * O teste da reta é feito na hora, contra a CORDA do trecho.
   *
   * Duas versões anteriores erraram aqui, cada uma para um lado:
   *
   *   1. Comparando as PONTAS do trecho com as pontas da reta achada. Errava
   *      quando um canto caía dentro de uma reta: a reta era partida, nenhuma
   *      metade batia com o par guardado, e as duas voltavam a ser curva.
   *   2. Marcando índice por índice e perguntando "todos os pontos deste trecho
   *      pertencem a alguma reta?". Parecia consertar a (1) e abriu um buraco
   *      pior: DUAS retas seguidas, de ângulos diferentes, deixam todos os seus
   *      índices marcados — então o trecho que abrange as duas passava no
   *      teste, e a corda entre as pontas cortava o joelho entre elas. Numa
   *      manga isso deu 8 células de erro, uns 18 mm, num traço cuja tolerância
   *      era 1,5.
   *
   * Medir a corda na hora não tem como ser enganado: a pergunta passa a ser a
   * única que importa — "a reta que EU VOU DESENHAR passa perto de todos os
   * pontos que ela substitui?".
   */
  const daReta = (q, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.hypot(dx, dy);
    if (t < 1e-9) return dist(q, a);
    return Math.abs(dy * q.x - dx * q.y + b.x * a.y - b.y * a.x) / t;
  };

  /** Conta os passos de `a` até `b` dando a volta. */
  const passosEntre = (a, b) => (b - a + n) % n;

  const ehReta = (a, b) => {
    const quantos = passosEntre(a, b);
    if (quantos < minimoDePontosNaReta) return false;
    const de = pontos[a];
    const ate = pontos[b];
    if (dist(de, ate) < minimoDeComprimentoDaReta) return false;
    for (let k = 1; k < quantos; k++) {
      if (daReta(pontos[(a + k) % n], de, ate) > toleranciaDeReta) return false;
    }
    return true;
  };

  const partes = [];
  for (let k = 0; k < ordem.length; k++) {
    const ini = ordem[k];
    const fim = ordem[(k + 1) % ordem.length];
    const trecho = [];
    let i = ini;
    for (;;) {
      trecho.push(pontos[i]);
      if (i === fim) break;
      i = (i + 1) % n;
      if (trecho.length > n) break; // guarda contra volta infinita
    }
    if (trecho.length < 2) continue;

    if (ehReta(ini, fim)) {
      partes.push({ reta: true, de: trecho[0], ate: trecho[trecho.length - 1] });
      continue;
    }
    const curvas = [];
    const d1 = direcao(trecho[0], trecho[1]) || { x: 1, y: 0 };
    const ultimo = trecho.length - 1;
    const d2 = direcao(trecho[ultimo], trecho[ultimo - 1]) || { x: -1, y: 0 };
    ajustarTrecho(trecho, d1, d2, erroMaximo, 0, curvas);
    for (const c of curvas) partes.push({ reta: false, curva: c });
  }

  if (partes.length === 0) {
    return pontos.map((p) => ({
      x: p.x, y: p.y, entrada: { ...p }, saida: { ...p }, canto: true, retaDepois: true,
    }));
  }

  /*
   * As partes viram nós: o fim de uma é o começo da seguinte, então cada nó
   * guarda a alça que CHEGA (da parte anterior) e a que SAI (da próxima).
   *
   * Numa reta a alça fica em cima do próprio nó — é o que diz "deste lado não
   * há curvatura". O `retaDepois` guarda a mesma informação de forma explícita,
   * porque comparar dois flutuantes para saber se a alça "está em cima" do nó é
   * o tipo de teste que um arrasto de meio pixel quebra.
   *
   * E é exatamente aqui que nasce o nó misto: a parte que chega pode ser curva
   * e a que sai, reta.
   */
  const comeco = (parte) => (parte.reta ? parte.de : parte.curva[0]);
  const fimDe = (parte) => (parte.reta ? parte.ate : parte.curva[3]);
  const alcaQueSai = (parte) => (parte.reta ? parte.de : parte.curva[1]);
  const alcaQueChega = (parte) => (parte.reta ? parte.ate : parte.curva[2]);

  const nos = [];
  for (let k = 0; k < partes.length; k++) {
    const atual = partes[k];
    const anterior = partes[(k - 1 + partes.length) % partes.length];
    const p = comeco(atual);
    const chega = alcaQueChega(anterior);
    const sai = alcaQueSai(atual);
    nos.push({
      x: p.x,
      y: p.y,
      entrada: { x: chega.x, y: chega.y },
      saida: { x: sai.x, y: sai.y },
      canto: false,
      retaDepois: !!atual.reta,
    });
  }
  void fimDe;

  /*
   * Passada final: nó empilhado em nó vira um nó.
   *
   * Fundir as quebras vizinhas resolveu metade do problema. A outra metade vem
   * da recursão do ajuste: quando ela parte num ponto colado na ponta do
   * trecho, sai uma cúbica de fração de célula — e dois nós separados por 0,2
   * célula, quando a mediana dos trechos é 25.
   *
   * Não é perfeccionismo. Nó invisível é nó que a pessoa não consegue pegar: ela
   * arrasta um, o de baixo fica onde estava, e o traço abre um bico que ela não
   * entende de onde veio.
   *
   * Quem sai é o nó da FRENTE, e quem fica herda a alça de saída e o
   * `retaDepois` dele — assim o trecho seguinte continua indo para o mesmo
   * lugar, do mesmo jeito.
   */
  const limpos = [];
  for (const no of nos) {
    const ultimo = limpos.length > 0 ? limpos[limpos.length - 1] : null;
    if (ultimo && dist(ultimo, no) < minimoEntreNos) {
      ultimo.saida = no.saida;
      ultimo.retaDepois = no.retaDepois;
      ultimo.canto = ultimo.canto || no.canto;
      continue;
    }
    limpos.push(no);
  }
  // O primeiro e o último são vizinhos na volta fechada.
  if (limpos.length > 3 && dist(limpos[0], limpos[limpos.length - 1]) < minimoEntreNos) {
    const fora = limpos.pop();
    const anterior = limpos[limpos.length - 1];
    anterior.saida = fora.saida;
    anterior.retaDepois = fora.retaDepois;
    anterior.canto = anterior.canto || fora.canto;
  }
  if (limpos.length >= 3) return limpos;

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

/**
 * Achata o caminho de nós numa poligonal, para medir caixa e área.
 *
 * Trecho reto entra com os dois pontos e nada mais: amostrar uma reta em doze
 * pedaços é gastar doze pontos para dizer o que dois já diziam, e a caixa e a
 * área saem idênticas.
 */
export function achatarCurvas(nos, porCurva = 12) {
  if (nos.length < 2) return nos.map((n) => ({ x: n.x, y: n.y }));
  const saida = [];
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i];
    const b = nos[(i + 1) % nos.length];
    if (a.retaDepois) {
      saida.push({ x: a.x, y: a.y });
      continue;
    }
    const curva = [{ x: a.x, y: a.y }, a.saida, b.entrada, { x: b.x, y: b.y }];
    for (let k = 0; k < porCurva; k++) saida.push(naCurva(curva, k / porCurva));
  }
  return saida;
}
