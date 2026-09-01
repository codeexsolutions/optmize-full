/**
 * ===========================================================================
 * GEOMETRIA — as contas de contorno que todo o resto usa
 * ===========================================================================
 *
 * Três telas trabalham com a mesma coisa: uma lista de pontos {x, y} que fecha
 * um contorno. O Moldes lê esse contorno de um DXF, o Vetor o descobre dentro
 * de uma imagem, e o Encaixe o empurra pelo tecido. As contas básicas sobre
 * esses pontos — área, caixa em volta, simplificação — são as mesmas nos três,
 * e é por isso que moram aqui.
 *
 * Antes deste arquivo elas estavam escritas duas vezes, com nomes diferentes:
 * `areaComSinal` no nfp.js e `areaComSinalDoContorno` no vetor.js eram a MESMA
 * função, letra por letra; `caixaDoLaco` (moldes.js) e `ladoMenorDoContorno`
 * (vetor.js) percorriam o mesmo laço para chegar à mesma caixa. Duas cópias de
 * uma conta querem dizer dois lugares para consertar quando ela estiver errada.
 *
 * ---------------------------------------------------------------------------
 * REGRA DESTE ARQUIVO
 * ---------------------------------------------------------------------------
 * Só entra aqui o que for **conta pura**: recebe números, devolve números.
 * Nada de `document`, `window`, canvas ou fetch — este arquivo é carregado
 * também dentro dos Web Workers (`importScripts`), onde nada disso existe.
 *
 * Carrega ANTES de nfp.js, moldes.js e vetor.js, que dependem dele.
 */

/** Abaixo disso, dois pontos são o mesmo ponto. */
const GEO_EPSILON = 1e-9;

/**
 * Uma casa decimal. É a precisão em que o sistema trabalha medida de peça e de
 * tecido: milímetro. Mora aqui porque a tela e o preparo da grade do encaixe
 * (`grade`, em encaixe-mascara.js) arredondam do mesmo jeito, e duas cópias de
 * uma conta são dois lugares para consertar quando ela estiver errada.
 */
function arredondar(valor) {
  return Math.round(valor * 10) / 10;
}

/**
 * A área do polígono, COM SINAL (fórmula do cadarço).
 *
 * O sinal é o que interessa na maior parte dos usos: positivo e negativo dizem
 * em que sentido o contorno foi desenhado, e é assim que se sabe se ele é o
 * lado de fora de uma peça ou o buraco de dentro dela. Quem só quer o tamanho
 * usa `Math.abs()` em cima.
 */
function areaComSinal(pontos) {
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    soma += a.x * b.y - b.x * a.y;
  }
  return soma / 2;
}

/** A caixa retangular que envolve os pontos, já com largura e altura. */
function caixaDeContorno(pontos) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pontos) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, largura: maxX - minX, altura: maxY - minY };
}

/**
 * O lado menor da caixa que envolve o contorno.
 *
 * É a espessura que não pode ser comida ao simplificar: numa perna de "R" com
 * 6 pontos de largura, afrouxar 1,2 ponto arredonda a letra e o texto vira
 * mancha. Quem simplifica usa esta medida para saber até onde pode ir.
 */
function ladoMenorDoContorno(pontos) {
  const c = caixaDeContorno(pontos);
  return Math.min(c.largura, c.altura);
}

/** A distância entre dois pontos. */
const distanciaEntre = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** A distância de um ponto até o SEGMENTO a-b (não até a reta infinita). */
function distanciaAteSegmento(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tamanho = dx * dx + dy * dy;
  if (tamanho < GEO_EPSILON) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / tamanho;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Joga fora os pontos que não mudam o formato (Douglas-Peucker).
 *
 * Um contorno tirado de uma grade de pixels vem com centenas de degraus de um
 * ponto. Sem passar por aqui, tudo o que vem depois — achar quina, ajustar
 * curva, calcular encaixe — trabalharia em cima desses degraus, devagar e sem
 * ganhar nada.
 *
 * A versão é iterativa (com pilha), e não recursiva, porque um contorno de
 * imagem grande chega com dezenas de milhares de pontos e a recursão estoura.
 */
function simplificar(pontos, tolerancia) {
  if (pontos.length < 3) return pontos.slice();

  const manter = new Uint8Array(pontos.length);
  manter[0] = 1;
  manter[pontos.length - 1] = 1;
  const pilha = [[0, pontos.length - 1]];

  while (pilha.length > 0) {
    const [ini, fim] = pilha.pop();
    let pior = 0;
    let ondePior = -1;
    for (let i = ini + 1; i < fim; i++) {
      const d = distanciaAteSegmento(pontos[i], pontos[ini], pontos[fim]);
      if (d > pior) { pior = d; ondePior = i; }
    }
    if (pior > tolerancia && ondePior > 0) {
      manter[ondePior] = 1;
      pilha.push([ini, ondePior], [ondePior, fim]);
    }
  }

  return pontos.filter((_, i) => manter[i]);
}
