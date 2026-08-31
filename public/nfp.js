/**
 * Encaixe por polígono de não-encaixe (NFP, "no-fit polygon").
 *
 * A ideia, em uma frase: dadas duas peças, o NFP é o desenho de todas as
 * posições em que a segunda **encosta** na primeira sem invadir. Quem conhece
 * esse contorno sabe exatamente onde a peça pode parar coladinha — sem chute,
 * sem grade, sem sobra entre uma e outra.
 *
 * É o que o Audaces faz. A diferença para o encaixe por perfil que já existe
 * aqui é que o perfil só deixa a peça **descer** até encostar; o NFP também
 * enxerga posição de lado, encaixada num vão que só dá para alcançar andando
 * na diagonal.
 *
 * O caminho até um NFP utilizável:
 *   1. tirar o contorno da peça (o mesmo desenho que o encaixe já enxerga);
 *   2. simplificar, porque contorno de grade tem centenas de pontinhos;
 *   3. quebrar em pedaços convexos — para peça convexa o NFP é uma soma de
 *      Minkowski, que é curta e exata;
 *   4. o NFP da peça inteira é a união dos NFPs dos pedaços. Só que unir
 *      polígono é caro e cheio de caso degenerado, então **a união nunca é
 *      montada**: para saber se uma posição invade, basta testar se ela cai
 *      dentro de algum dos pedaços. É o mesmo resultado, sem a parte difícil.
 */

const NFP_TOLERANCIA = 1e-7;
// Acima disso a peça é tratada pelo casco convexo (ver pecaEmPoligonos).
const NFP_MAX_PEDACOS = 16;
// Teto de lados que entram no cruzamento par a par, que é conta quadrática.
const NFP_MAX_LADOS_CRUZADOS = 240;

// ==================== POLÍGONO: O BÁSICO ====================

/**
 * Convenção usada em todo este arquivo: polígono "positivo" é o que fecha a
 * volta no sentido em que `cruzado` dá positivo em cada quina. Como aqui o Y
 * cresce para baixo (é coordenada de tela), isso parece horário na tela — o
 * que importa é ser sempre o mesmo, porque o teste de invasão depende disso.
 */
function antiHorario(poligono) {
  return areaComSinal(poligono) < 0 ? poligono.slice().reverse() : poligono.slice();
}

const cruzado = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** O vértice mais embaixo; empatou, o mais à esquerda. */
const cantoDeBaixo = (poligono) =>
  poligono.reduce((m, p) => (p.y < m.y || (p.y === m.y && p.x < m.x) ? p : m));

/**
 * Ponto dentro de um polígono convexo positivo. A borda conta como fora: duas
 * peças encostadas não estão invadindo uma a outra, e é exatamente essa a
 * posição que o encaixe procura.
 */
/**
 * O ponto (px, py) está dentro deste polígono convexo?
 *
 * Recebe as coordenadas soltas, e não um objeto `{x, y}`, porque esta função é
 * chamada aos milhões: no encaixe de 72 peças foram 32 milhões de vezes. Cada
 * objeto criado ali vira lixo para o coletor recolher no meio da conta.
 */
function dentroDoConvexo(px, py, convexo) {
  for (let i = 0; i < convexo.length; i++) {
    const a = convexo[i];
    const b = convexo[(i + 1) % convexo.length];
    // O mesmo que cruzado(a, b, {x: px, y: py}), escrito à mão.
    if ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) <= NFP_TOLERANCIA) return false;
  }
  return true;
}

/**
 * A peça invade este NFP se for parar em (px, py)?
 *
 * A caixa do NFP é conferida antes do polígono, e é isso que muda o custo do
 * motor. Uma peça recortada vira até 16 pedaços convexos, e o NFP entre duas
 * delas é um pedaço para cada par — até 256 polígonos por vizinha. A esmagadora
 * maioria nem chega perto da posição testada, e para essas quatro comparações
 * de caixa resolvem, no lugar de percorrer todos os lados.
 *
 * O corte é exato: ponto fora da caixa está fora do convexo, sempre. Nenhuma
 * posição muda de veredito por causa disto.
 */
function invadeNfp(px, py, nfp) {
  if (px < nfp.minX || px > nfp.maxX || py < nfp.minY || py > nfp.maxY) return false;
  return dentroDoConvexo(px, py, nfp.pts);
}

/** Casco convexo (varredura de Andrew): a menor casca convexa que envolve tudo. */
function cascoConvexo(pontos) {
  const ordenados = pontos.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (ordenados.length < 3) return ordenados;

  const meia = (lista) => {
    const pilha = [];
    lista.forEach((p) => {
      while (pilha.length >= 2 && cruzado(pilha[pilha.length - 2], pilha[pilha.length - 1], p) <= 0) pilha.pop();
      pilha.push(p);
    });
    pilha.pop();
    return pilha;
  };
  return meia(ordenados).concat(meia(ordenados.slice().reverse()));
}

// ==================== CONTORNO A PARTIR DA MÁSCARA ====================

/**
 * Tira o contorno do desenho andando pelas **quinas** das células, não pelos
 * centros delas (marching squares).
 *
 * A diferença não é detalhe: seguindo pelos centros, o contorno fica meia
 * célula menor que a peça de verdade em cada lado — e aí duas peças que o NFP
 * diz estarem encostadas na verdade se invadem. Andando pelas quinas, o
 * contorno envolve as células inteiras e contém a peça de verdade.
 */
function contornoDaMascara(bits, cols, rows, passo) {
  const cheia = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && bits[y * cols + x] === 1;

  let inicioX = -1;
  let inicioY = -1;
  for (let y = 0; y < rows && inicioY < 0; y++) {
    for (let x = 0; x < cols; x++) {
      if (cheia(x, y)) { inicioX = x; inicioY = y; break; }
    }
  }
  if (inicioY < 0) return [];

  const DIREITA = 0, BAIXO = 1, ESQUERDA = 2, CIMA = 3;
  const anda = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  let i = inicioX;
  let j = inicioY;
  let direcao = DIREITA;
  const pontos = [];
  const limite = (cols + 1) * (rows + 1) * 4;

  for (let passos = 0; passos < limite; passos++) {
    pontos.push({ x: i * passo, y: j * passo });

    // As quatro células em volta desta quina decidem para onde a borda segue.
    const estado = (cheia(i - 1, j - 1) ? 1 : 0) | (cheia(i, j - 1) ? 2 : 0) |
                   (cheia(i - 1, j) ? 4 : 0) | (cheia(i, j) ? 8 : 0);

    let proxima;
    switch (estado) {
      case 1: case 5: case 13: proxima = CIMA; break;
      case 2: case 3: case 7: proxima = DIREITA; break;
      case 4: case 12: case 14: proxima = ESQUERDA; break;
      case 8: case 10: case 11: proxima = BAIXO; break;
      // Sela: duas células opostas cheias. Quem desempata é de onde se veio,
      // senão a volta se fecharia por dentro do desenho.
      case 6: proxima = direcao === CIMA ? ESQUERDA : DIREITA; break;
      case 9: proxima = direcao === DIREITA ? CIMA : BAIXO; break;
      default: proxima = null;
    }
    if (proxima === null) break;

    direcao = proxima;
    i += anda[direcao][0];
    j += anda[direcao][1];
    if (i === inicioX && j === inicioY) break;
  }

  return pontos;
}

/** Tira só os pontos que ficaram no meio de uma reta. */
function tirarPontosNaReta(pontos) {
  const saida = [];
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[(i + pontos.length - 1) % pontos.length];
    const b = pontos[i];
    const c = pontos[(i + 1) % pontos.length];
    if (Math.abs(cruzado(a, b, c)) > NFP_TOLERANCIA) saida.push(b);
  }
  return saida.length >= 3 ? saida : pontos;
}

// ==================== QUEBRA EM PEDAÇOS CONVEXOS ====================

/** Triangulação por corte de orelha, base para a quebra em convexos. */
function triangular(poligono) {
  const indices = poligono.map((_, i) => i);
  const triangulos = [];
  let sobra = indices.slice();
  let travas = 0;

  while (sobra.length > 3 && travas < sobra.length * 3) {
    let cortou = false;
    for (let i = 0; i < sobra.length; i++) {
      const a = poligono[sobra[(i + sobra.length - 1) % sobra.length]];
      const b = poligono[sobra[i]];
      const c = poligono[sobra[(i + 1) % sobra.length]];
      if (cruzado(a, b, c) <= NFP_TOLERANCIA) continue; // reflexo, não é orelha

      let limpo = true;
      for (let k = 0; k < sobra.length; k++) {
        if (k === i || k === (i + sobra.length - 1) % sobra.length || k === (i + 1) % sobra.length) continue;
        const p = poligono[sobra[k]];
        if (cruzado(a, b, p) >= 0 && cruzado(b, c, p) >= 0 && cruzado(c, a, p) >= 0) { limpo = false; break; }
      }
      if (!limpo) continue;

      triangulos.push([sobra[(i + sobra.length - 1) % sobra.length], sobra[i], sobra[(i + 1) % sobra.length]]);
      sobra.splice(i, 1);
      cortou = true;
      break;
    }
    if (!cortou) { travas++; sobra = sobra.slice(1).concat(sobra[0]); }
  }
  if (sobra.length === 3) triangulos.push(sobra.slice());
  return triangulos;
}

/**
 * Junta os triângulos em pedaços convexos maiores (Hertel-Mehlhorn): sempre
 * que apagar uma divisa entre dois vizinhos deixa o resultado convexo, apaga.
 * Menos pedaços significa menos NFPs para calcular e testar.
 */
function decomporConvexo(poligono) {
  const limpo = antiHorario(poligono);
  if (limpo.length < 3) return [];
  if (limpo.length === 3) return [limpo];

  const triangulos = triangular(limpo);
  if (triangulos.length === 0) return [limpo];

  let pedacos = triangulos.map((t) => t.map((i) => limpo[i]));
  let juntou = true;

  while (juntou) {
    juntou = false;
    for (let i = 0; i < pedacos.length && !juntou; i++) {
      for (let j = i + 1; j < pedacos.length && !juntou; j++) {
        const unido = juntarSeConvexo(pedacos[i], pedacos[j]);
        if (unido) {
          pedacos.splice(j, 1);
          pedacos[i] = unido;
          juntou = true;
        }
      }
    }
  }
  return pedacos;
}

/** Une dois polígonos que compartilham um lado, se o resultado for convexo. */
function juntarSeConvexo(a, b) {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      const mesmaDivisa = Math.hypot(a1.x - b2.x, a1.y - b2.y) < 1e-6 &&
                          Math.hypot(a2.x - b1.x, a2.y - b1.y) < 1e-6;
      if (!mesmaDivisa) continue;

      const unido = [];
      for (let k = 0; k < a.length; k++) unido.push(a[(i + 1 + k) % a.length]);
      for (let k = 1; k < b.length - 1; k++) unido.push(b[(j + 1 + k) % b.length]);

      return ehConvexo(unido) ? unido : null;
    }
  }
  return null;
}

function ehConvexo(poligono) {
  for (let i = 0; i < poligono.length; i++) {
    const a = poligono[i];
    const b = poligono[(i + 1) % poligono.length];
    const c = poligono[(i + 2) % poligono.length];
    if (cruzado(a, b, c) < -NFP_TOLERANCIA) return false;
  }
  return true;
}

// ==================== O NFP DE DUAS PEÇAS CONVEXAS ====================

/**
 * Soma de Minkowski de dois convexos: junta os lados dos dois numa volta só,
 * em ordem de ângulo. Sai exata numa passada.
 *
 * Duas coisas precisam estar certas, e errar qualquer uma delas dá um polígono
 * do tamanho certo no lugar errado — que foi como este código nasceu:
 *  - a volta começa no vértice mais embaixo de cada um, somados. É esse ponto
 *    que ancora o resultado;
 *  - os ângulos são medidos de 0 a 360°, e não de -180 a 180. Ordenar na faixa
 *    errada embaralha os lados e torce o contorno.
 */
function somaDeMinkowski(a, b) {
  const lados = [];
  const juntarLados = (poligono) => {
    for (let i = 0; i < poligono.length; i++) {
      const p = poligono[i];
      const q = poligono[(i + 1) % poligono.length];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (Math.abs(dx) < NFP_TOLERANCIA && Math.abs(dy) < NFP_TOLERANCIA) continue;
      let angulo = Math.atan2(dy, dx);
      if (angulo < 0) angulo += Math.PI * 2;
      lados.push({ dx, dy, angulo });
    }
  };
  juntarLados(a);
  juntarLados(b);
  lados.sort((u, v) => u.angulo - v.angulo);

  const inicioA = cantoDeBaixo(a);
  const inicioB = cantoDeBaixo(b);
  const pontos = [{ x: inicioA.x + inicioB.x, y: inicioA.y + inicioB.y }];
  for (let i = 0; i < lados.length - 1; i++) {
    const ultimo = pontos[pontos.length - 1];
    pontos.push({ x: ultimo.x + lados[i].dx, y: ultimo.y + lados[i].dy });
  }
  return pontos;
}

/**
 * O NFP de B em relação a A: todas as posições do canto de referência de B em
 * que as duas se tocam sem invadir. Para convexos, é a soma de A com B
 * invertida.
 *
 * Lendo o resultado: posição **dentro** do NFP significa invasão; **na borda**,
 * peças encostadas; **fora**, separadas. Encaixar é procurar a borda.
 */
function nfpConvexo(paradaA, movelB) {
  const a = antiHorario(paradaA);
  const bInvertido = antiHorario(antiHorario(movelB).map((p) => ({ x: -p.x, y: -p.y })));
  return somaDeMinkowski(a, bInvertido);
}

// ==================== A PEÇA PRONTA PARA O NFP ====================

/**
 * Prepara uma peça para o encaixe por NFP: contorno, simplificação e quebra em
 * convexos, tudo guardado para não repetir a conta a cada posição testada.
 *
 * O contorno é engordado pela própria tolerância antes de ser simplificado.
 * Sem isso o resultado seria menor que a peça de verdade — a simplificação
 * corta cantos para dentro —, e peças que o NFP jura estarem encostadas
 * sairiam sobrepostas na hora de cortar. Custa alguns milímetros de folga por
 * peça, que é o preço de estar certo.
 */
function pecaEmPoligonos(mascara, passo, tolerancia) {
  const folga = Math.max(1, Math.ceil(tolerancia / passo));
  const cols = mascara.cols + folga * 2;
  const rows = mascara.rows + folga * 2;

  const comBorda = new Uint8Array(cols * rows);
  for (let y = 0; y < mascara.rows; y++) {
    for (let x = 0; x < mascara.cols; x++) {
      if (mascara.cheio[y * mascara.cols + x]) comBorda[(y + folga) * cols + (x + folga)] = 1;
    }
  }
  const engordado = engordar(comBorda, cols, rows, folga);

  const bruto = contornoDaMascara(engordado, cols, rows, passo);
  if (bruto.length < 3) return null;

  // Volta para as coordenadas da máscara, descontando a borda que foi somada.
  const recuo = folga * passo;
  const naOrigem = bruto.map((p) => ({ x: p.x - recuo, y: p.y - recuo }));

  const contorno = antiHorario(tirarPontosNaReta(simplificar(naOrigem, tolerancia)));
  if (contorno.length < 3) return null;

  // Peça muito recortada vira dezenas de pedaços convexos, e o NFP entre duas
  // delas passa de mil lados — a busca trava. Nesses casos vale o casco
  // convexo: envolve a peça inteira, então nunca deixa duas se sobreporem;
  // só encaixa mais folgado. Como o resultado do NFP compete com os outros
  // motores, encaixe folgado simplesmente perde e não atrapalha ninguém.
  let convexos = decomporConvexo(contorno);
  let aproximada = false;
  if (convexos.length === 0) return null;
  if (convexos.length > NFP_MAX_PEDACOS) {
    convexos = [antiHorario(cascoConvexo(contorno))];
    aproximada = true;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  contorno.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  return {
    contorno, convexos, aproximada,
    largura: maxX - minX, altura: maxY - minY,
    minX, minY, maxX, maxY,
  };
}

// ==================== O ENCAIXE POR NFP ====================

/**
 * Guarda os NFPs já calculados. Um encaixe repete poucas peças em poucas
 * rotações, então o mesmo par volta centenas de vezes — calcular de novo seria
 * jogar tempo fora.
 */
function criarArquivoDeNfp() {
  const guardados = new Map();
  return (chave, montar) => {
    let achado = guardados.get(chave);
    if (!achado) { achado = montar(); guardados.set(chave, achado); }
    return achado;
  };
}

/** Todos os NFPs entre os pedaços convexos de duas peças. */
// Lado da grade que indexa os NFPs de um par de peças. 48x48 dá células
// pequenas o bastante para sobrar pouco NFP em cada uma, sem a tabela ficar
// grande: são poucas dezenas de conjuntos por encaixe.
const NFP_GRADE = 48;

/**
 * Uma grade por cima dos NFPs de um par, para não ter que olhar todos.
 *
 * O problema que isto resolve: uma peça recortada vira até 16 pedaços
 * convexos, e o NFP entre duas peças é um pedaço para cada par — até 256
 * polígonos. Testar uma posição contra todos, para toda posição candidata,
 * deu 61,8 milhões de testes num encaixe de 72 peças.
 *
 * Com a grade, a posição cai numa célula e só os NFPs que passam por aquela
 * célula são testados — quase sempre nenhum ou um punhado.
 *
 * O corte é exato: um NFP entra em todas as células que a caixa dele toca,
 * então nenhum que pudesse conter a posição fica de fora.
 */
function indiceDosNfps(lista) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  lista.forEach((n) => {
    if (n.minX < minX) minX = n.minX;
    if (n.maxX > maxX) maxX = n.maxX;
    if (n.minY < minY) minY = n.minY;
    if (n.maxY > maxY) maxY = n.maxY;
  });
  if (!(maxX > minX) || !(maxY > minY)) return null; // conjunto degenerado

  const larguraCelula = (maxX - minX) / NFP_GRADE;
  const alturaCelula = (maxY - minY) / NFP_GRADE;
  const celulas = new Array(NFP_GRADE * NFP_GRADE).fill(null);
  const limite = (v) => Math.min(NFP_GRADE - 1, Math.max(0, v));

  lista.forEach((n, k) => {
    const c0 = limite(Math.floor((n.minX - minX) / larguraCelula));
    const c1 = limite(Math.floor((n.maxX - minX) / larguraCelula));
    const r0 = limite(Math.floor((n.minY - minY) / alturaCelula));
    const r1 = limite(Math.floor((n.maxY - minY) / alturaCelula));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * NFP_GRADE + c;
        if (celulas[i] === null) celulas[i] = [];
        celulas[i].push(k);
      }
    }
  });

  return { minX, minY, maxX, maxY, larguraCelula, alturaCelula, celulas };
}

/**
 * Os NFPs entre duas peças: um para cada par de pedaços convexos.
 *
 * Cada um sai com a própria caixa junto, e o conjunto sai com a grade que os
 * indexa. Tudo calculado uma vez só — este resultado fica em cache e é
 * consultado milhões de vezes depois.
 */
function nfpsEntre(paradaA, movelB) {
  const lista = [];
  paradaA.convexos.forEach((a) => {
    movelB.convexos.forEach((b) => {
      const pts = antiHorario(nfpConvexo(a, b));
      if (pts.length < 3) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      lista.push({ pts, minX, minY, maxX, maxY });
    });
  });
  return { lista, indice: indiceDosNfps(lista) };
}

/**
 * A peça, indo parar em (px, py), invade alguma coisa deste conjunto?
 *
 * Passa pela grade quando ela existe; sem grade (conjunto degenerado, uma
 * peça só), cai no laço direto, que dá o mesmo resultado.
 */
function invadeConjunto(px, py, conjunto) {
  const indice = conjunto.indice;
  const lista = conjunto.lista;

  if (!indice) {
    for (let k = 0; k < lista.length; k++) if (invadeNfp(px, py, lista[k])) return true;
    return false;
  }

  if (px < indice.minX || px > indice.maxX || py < indice.minY || py > indice.maxY) return false;
  const c = Math.min(NFP_GRADE - 1, ((px - indice.minX) / indice.larguraCelula) | 0);
  const r = Math.min(NFP_GRADE - 1, ((py - indice.minY) / indice.alturaCelula) | 0);
  const aqui = indice.celulas[r * NFP_GRADE + c];
  if (aqui === null) return false;
  for (let i = 0; i < aqui.length; i++) if (invadeNfp(px, py, lista[aqui[i]])) return true;
  return false;
}

/** Onde dois segmentos se cruzam, se é que se cruzam. */
/**
 * As caixas destes dois segmentos se tocam?
 *
 * Vem antes do cruzamento de propósito: `cruzarSegmentos` faz duas divisões, e
 * divisão é das contas mais caras que existem. Quatro comparações resolvem a
 * esmagadora maioria dos pares, que nem chegam perto um do outro. Dois
 * segmentos que se cruzam têm as caixas se tocando, sempre — então nenhum
 * cruzamento se perde.
 */
function caixasSeTocam(u, v) {
  if ((u.ax < u.bx ? u.bx : u.ax) < (v.ax < v.bx ? v.ax : v.bx)) return false;
  if ((v.ax < v.bx ? v.bx : v.ax) < (u.ax < u.bx ? u.ax : u.bx)) return false;
  if ((u.ay < u.by ? u.by : u.ay) < (v.ay < v.by ? v.ay : v.by)) return false;
  if ((v.ay < v.by ? v.by : v.ay) < (u.ay < u.by ? u.ay : u.by)) return false;
  return true;
}

function cruzarSegmentos(u, v) {
  const ux = u.bx - u.ax, uy = u.by - u.ay;
  const vx = v.bx - v.ax, vy = v.by - v.ay;
  const denominador = ux * vy - uy * vx;
  if (Math.abs(denominador) < NFP_TOLERANCIA) return null; // paralelos

  const t = ((v.ax - u.ax) * vy - (v.ay - u.ay) * vx) / denominador;
  const r = ((v.ax - u.ax) * uy - (v.ay - u.ay) * ux) / denominador;
  if (t < 0 || t > 1 || r < 0 || r > 1) return null;
  return { x: u.ax + ux * t, y: u.ay + uy * t };
}

/**
 * Encaixa procurando, para cada peça, a posição mais alta no rolo em que ela
 * encosta em quem já está lá sem invadir.
 *
 * As posições candidatas saem dos vértices dos NFPs — é neles que a peça fica
 * encaixada em algum canto. Elas são ordenadas de cima para baixo e a primeira
 * que passa no teste de invasão vence.
 *
 * Duas coisas diferentes acontecem aqui, e misturá-las é um erro que já
 * cometi: **de onde saem as candidatas** é uma escolha de qualidade (olhar só
 * as vizinhas recentes é rápido e quase sempre suficiente), mas **contra quem
 * a invasão é testada** é uma questão de correção — tem que ser contra toda
 * peça que possa estar no caminho, senão o NFP coloca uma peça em cima da
 * outra lá no meio do rolo.
 */
function encaixarPorNFP(itens, config) {
  const { larguraTecido, margem, passo } = config;
  const larguraUtil = larguraTecido - margem * 2;
  const VIZINHAS_PARA_CANDIDATAS = 25;
  // Cruzar lado com lado é conta quadrática: com as 25 vizinhas dá milhões de
  // pares e a busca trava. As peças mais recentes são as que de fato podem
  // calçar a próxima, e só elas entram nessa parte.
  const VIZINHAS_PARA_CRUZAMENTO = 4;

  // O prazo da busca, em relógio absoluto. Sem ele, uma passada começada vai
  // até o fim doa a quem doer: era isto que fazia o motor estourar o dobro do
  // tempo que a pessoa tinha pedido na tela. Estourando, as peças que faltam
  // saem como não encaixadas — e encaixe com peça de fora perde de qualquer
  // outro na hora de comparar, que é exatamente o que se quer de um resultado
  // interrompido.
  const prazo = config.prazoMs || 0;

  const arquivo = criarArquivoDeNfp();
  const colocadas = [];
  const posicoes = [];
  const naoEncaixadas = [];
  let fundoMax = 0;

  const poligonosDe = (item, rot) => {
    const cache = item.mascaras.poligonos || (item.mascaras.poligonos = {});
    if (cache[rot] === undefined) {
      const m = item.mascaras.rotacoes[rot];
      cache[rot] = m ? pecaEmPoligonos(m, passo, passo) : null;
    }
    return cache[rot];
  };
  const nfpsPara = (colocada, item, rot, forma) =>
    arquivo(`${colocada.tipo}|${colocada.rot}|${item.indice}|${rot}`,
      () => nfpsEntre(colocada.forma, forma));

  let estourou = false;
  itens.forEach((item) => {
    if (estourou || (prazo && Date.now() > prazo)) {
      estourou = true;
      naoEncaixadas.push(item);
      return;
    }
    let melhor = null;

    rotacoesDe(item).forEach((rot) => {
      const forma = poligonosDe(item, rot);
      if (!forma || forma.largura > larguraUtil) return;

      const xMin = -forma.minX;
      const xMax = larguraUtil - forma.maxX;
      if (xMax < xMin) return;

      const yMin = -forma.minY;
      // Quanto mais recortada a peça, mais caro cada par — então olha menos
      // vizinhas para compensar e o custo por peça fica parecido.
      const quantasVizinhas = Math.max(4,
        Math.round(VIZINHAS_PARA_CANDIDATAS / Math.max(1, forma.convexos.length / 2)));
      const recentes = colocadas.slice(-quantasVizinhas);
      const candidatas = [];
      // Duas posições a menos de 1/8 de centímetro uma da outra são a mesma
      // coisa: o contorno de onde elas saem vem de uma grade de 1/4 de
      // centímetro, então essa diferença está abaixo da resolução do desenho.
      //
      // Medindo um encaixe de 72 peças: 616.786 posições geradas, **133.945
      // distintas**. Quatro de cada cinco eram repetição, e cada uma delas era
      // conferida contra as peças em volta como se fosse nova.
      //
      // Repare que a posição guardada é a original, sem arredondamento: o
      // arredondamento serve só para reconhecer a repetição. Assim nenhuma
      // coordenada muda, e nenhuma peça escapa da borda do tecido por causa
      // de um arredondamento para fora.
      const jaVistas = new Set();
      const aceitar = (x, y) => {
        if (x < xMin - NFP_TOLERANCIA || x > xMax + NFP_TOLERANCIA) return;
        if (y < yMin - NFP_TOLERANCIA) return;
        const px = Math.min(Math.max(x, xMin), xMax);
        const py = Math.max(y, yMin);
        // Posição que já não alcança a melhor conhecida nem precisa entrar na
        // lista: é o mesmo corte que o laço lá embaixo faria, feito antes de
        // gastar memória e ordenação com ela.
        if (melhor && py + forma.maxY > melhor.fundo + NFP_TOLERANCIA) return;
        const chave = Math.round(px * 8) * 100000 + Math.round(py * 8);
        if (jaVistas.has(chave)) return;
        jaVistas.add(chave);
        candidatas.push({ x: px, y: py });
      };
      aceitar(xMin, yMin);
      aceitar(xMax, yMin);

      // Os lados dos NFPs, já na posição de cada peça colocada.
      const lados = [];
      let ladosPorVizinha = 0;
      recentes.forEach((colocada) => {
        const antesDesta = lados.length;
        nfpsPara(colocada, item, rot, forma).lista.forEach((nfp) => {
          const pts = nfp.pts;
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            aceitar(a.x + colocada.tx, a.y + colocada.ty); // o vértice em si
            lados.push({
              ax: a.x + colocada.tx, ay: a.y + colocada.ty,
              bx: b.x + colocada.tx, by: b.y + colocada.ty,
            });
          }
        });
        ladosPorVizinha = Math.max(ladosPorVizinha, lados.length - antesDesta);
      });

      // Vértice não basta. Quando duas peças deslizam encostadas — dois
      // triângulos pela hipotenusa, por exemplo —, a posição encaixada fica no
      // meio de um lado do NFP, e é a borda do tecido (ou outra peça) que
      // define onde ela para. Sem estes cruzamentos o encaixe enfileira tudo
      // lado a lado e desperdiça metade do rolo.
      lados.forEach((l) => {
        const dx = l.bx - l.ax;
        const dy = l.by - l.ay;
        if (Math.abs(dy) > NFP_TOLERANCIA) {
          const t = (yMin - l.ay) / dy;
          if (t >= 0 && t <= 1) aceitar(l.ax + dx * t, yMin);
        }
        if (Math.abs(dx) > NFP_TOLERANCIA) {
          [xMin, xMax].forEach((xLim) => {
            const t = (xLim - l.ax) / dx;
            if (t >= 0 && t <= 1) aceitar(xLim, l.ay + dy * t);
          });
        }
      });

      // E onde dois NFPs se cruzam: é a posição em que a peça fica calçada
      // entre duas outras ao mesmo tempo.
      const paraCruzar = lados.slice(
        -Math.min(ladosPorVizinha * VIZINHAS_PARA_CRUZAMENTO, NFP_MAX_LADOS_CRUZADOS));
      for (let i = 0; i < paraCruzar.length; i++) {
        for (let j = i + 1; j < paraCruzar.length; j++) {
          if (!caixasSeTocam(paraCruzar[i], paraCruzar[j])) continue;
          const cruzamento = cruzarSegmentos(paraCruzar[i], paraCruzar[j]);
          if (cruzamento) aceitar(cruzamento.x, cruzamento.y);
        }
      }

      candidatas.sort((p, q) => (p.y - q.y) || (p.x - q.x));

      // Os NFPs de cada peça já colocada, achados **antes** do laço das
      // candidatas. Antes isto era refeito candidata por candidata, e cada
      // busca montava a chave de texto e consultava o cache de novo — milhões
      // de vezes por encaixe, para um resultado que não muda.
      const vizinhanca = colocadas.map((colocada) => ({
        colocada, conjunto: nfpsPara(colocada, item, rot, forma),
      }));

      // As peças colocadas, arrumadas por faixa de altura do rolo.
      //
      // Sem isto, cada posição candidata era conferida contra **todas** as
      // peças já postas — no fim de um encaixe de 72 peças são 72 comparações
      // de caixa por candidata, meio milhão de candidatas. Só que uma peça a
      // quatro metros de distância não tem como estourar em cima da outra.
      //
      // Cada peça entra em todas as faixas que ela ocupa, e a candidata só
      // pergunta pelas faixas que ela mesma ocupa. Peça que aparece em duas
      // faixas pedidas é conferida uma vez só, pelo carimbo.
      const ALTURA_DA_FAIXA = 25; // cm
      const faixas = new Map();
      const faixaDe = (y) => Math.floor(y / ALTURA_DA_FAIXA);
      vizinhanca.forEach((viz, i) => {
        const de = faixaDe(viz.colocada.minY), ate = faixaDe(viz.colocada.maxY);
        for (let f = de; f <= ate; f++) {
          let lista = faixas.get(f);
          if (!lista) { lista = []; faixas.set(f, lista); }
          lista.push(i);
        }
      });
      const carimbo = new Int32Array(vizinhanca.length).fill(-1);
      let rodada = 0;

      for (const c of candidatas) {
        // Só corta quem é estritamente pior. Empate no fundo é decidido pelo x,
        // e é exatamente aí que mora o encaixe: a peça girada que cabe colada
        // na anterior empata no fundo e ganha muito no x. Cortando o empate,
        // o motor degenera em fileiras lado a lado.
        if (melhor && c.y + forma.maxY > melhor.fundo + NFP_TOLERANCIA) break;

        // Correção: contra TODA peça cuja caixa cruza a desta posição.
        const cMinX = c.x + forma.minX, cMaxX = c.x + forma.maxX;
        const cMinY = c.y + forma.minY, cMaxY = c.y + forma.maxY;
        let invade = false;

        rodada++;
        const faixaInicial = faixaDe(cMinY), faixaFinal = faixaDe(cMaxY);
        for (let f = faixaInicial; f <= faixaFinal && !invade; f++) {
          const naFaixa = faixas.get(f);
          if (!naFaixa) continue;
          for (let k = 0; k < naFaixa.length; k++) {
            const v = naFaixa[k];
            if (carimbo[v] === rodada) continue; // já conferida nesta candidata
            carimbo[v] = rodada;

            const colocada = vizinhanca[v].colocada;
            if (colocada.maxX <= cMinX + NFP_TOLERANCIA || colocada.minX >= cMaxX - NFP_TOLERANCIA) continue;
            if (colocada.maxY <= cMinY + NFP_TOLERANCIA || colocada.minY >= cMaxY - NFP_TOLERANCIA) continue;

            const dx = c.x - colocada.tx;
            const dy = c.y - colocada.ty;
            if (invadeConjunto(dx, dy, vizinhanca[v].conjunto)) { invade = true; break; }
          }
        }
        if (invade) continue;

        const fundo = cMaxY;
        if (!melhor || fundo < melhor.fundo - NFP_TOLERANCIA ||
            (Math.abs(fundo - melhor.fundo) < NFP_TOLERANCIA && c.x < melhor.x)) {
          melhor = { x: c.x, y: c.y, rot, forma, fundo };
        }
        break; // ordenadas de cima para baixo: a primeira que passa é a melhor
      }
    });

    if (!melhor) {
      naoEncaixadas.push(item);
      return;
    }

    const m = item.mascaras.rotacoes[melhor.rot];
    const f = melhor.forma;
    colocadas.push({
      tipo: item.indice, rot: melhor.rot, forma: f,
      tx: melhor.x, ty: melhor.y,
      minX: melhor.x + f.minX, maxX: melhor.x + f.maxX,
      minY: melhor.y + f.minY, maxY: melhor.y + f.maxY,
    });
    if (melhor.fundo > fundoMax) fundoMax = melhor.fundo;

    const deitada = melhor.rot === 90 || melhor.rot === 270;
    posicoes.push({
      item,
      x: melhor.x + margem - m.offX,
      y: melhor.y + margem - m.offY,
      largura: deitada ? item.altura : item.largura,
      altura: deitada ? item.largura : item.altura,
      rot: melhor.rot,
      girado: deitada,
      mascara: m,
      passo,
    });
  });

  return {
    posicoes, naoEncaixadas,
    consumo: fundoMax > 0 ? fundoMax + margem * 2 : 0,
    areaReal: posicoes.reduce((soma, p) => soma + p.item.mascaras.areaReal, 0),
  };
}
