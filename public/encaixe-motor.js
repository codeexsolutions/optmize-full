/**
 * Motor de encaixe: a parte do cálculo que não encosta na tela.
 *
 * Está separado de encaixe.js por um motivo só — este arquivo roda **também
 * dentro de um Web Worker** (ver encaixe-worker.js). Nada aqui pode usar
 * `document`, `window` ou qualquer elemento da página, senão o worker quebra
 * ao carregar.
 *
 * O que ficou em encaixe.js: ler a imagem, montar a máscara da peça (precisa
 * de canvas), desenhar o resultado, PDF e o resto da interface.
 * O que veio para cá: os encaixadores, as receitas e a busca.
 *
 * Carregado como <script> na página e por importScripts() no worker, então
 * tudo aqui é função de topo mesmo — sem módulo, sem export.
 */

// `rotacoesDe` e `podeDeitar` moram em encaixe-giro.js. Ver o cabeçalho de lá.

// ==================== MOTOR DE ENCAIXE ====================

/**
 * Sorteio com semente fixa: o mesmo lote de peças tem que dar sempre o mesmo
 * encaixe, senão apertar "Fazer encaixe" duas vezes daria metragens
 * diferentes e ninguém confiaria no número.
 */
function geradorDeSorteio(semente) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}


/**
 * MaxRects: mantém a lista dos retângulos livres do tecido e, para cada peça,
 * escolhe o melhor lugar segundo a heurística pedida. É o mesmo algoritmo que
 * os encaixadores de retângulo usam — bem melhor que empilhar em fileiras,
 * porque aproveita o vão que sobra ao lado de uma peça alta.
 *
 * O rolo é tratado como um retângulo de altura "infinita" (alturaMax); o
 * consumo real é o ponto mais baixo que as peças alcançaram.
 */
function criarPacker(largura, alturaMax) {
  return { largura, alturaMax, livres: [{ x: 0, y: 0, w: largura, h: alturaMax }] };
}

function pontuar(livre, w, h, heuristica) {
  const sobraX = livre.w - w;
  const sobraY = livre.h - h;
  const menorSobra = Math.min(sobraX, sobraY);
  const maiorSobra = Math.max(sobraX, sobraY);

  switch (heuristica) {
    // Bottom-Left: o mais alto possível no rolo. Puxa tudo para cima e é o que
    // costuma dar o menor consumo em rolo contínuo.
    case "bl": return [livre.y + h, livre.x];
    // Best Short Side Fit: deixa a menor sobra na direção mais apertada.
    case "bssf": return [menorSobra, maiorSobra];
    // Best Long Side Fit: prioriza não deixar tira comprida sobrando.
    case "blsf": return [maiorSobra, menorSobra];
    // Best Area Fit: usa o buraco de menor área que ainda serve.
    default: return [livre.w * livre.h - w * h, menorSobra];
  }
}

function melhorPosicao(packer, w, h, podeGirar, heuristica) {
  let melhor = null;

  packer.livres.forEach((livre) => {
    const tentativas = podeGirar
      ? [{ w, h, girado: false }, { w: h, h: w, girado: true }]
      : [{ w, h, girado: false }];

    tentativas.forEach((t) => {
      if (t.w > livre.w + 1e-9 || t.h > livre.h + 1e-9) return;
      const [p1, p2] = pontuar(livre, t.w, t.h, heuristica);
      if (melhor && !(p1 < melhor.p1 - 1e-9 || (Math.abs(p1 - melhor.p1) < 1e-9 && p2 < melhor.p2 - 1e-9))) return;
      melhor = { x: livre.x, y: livre.y, w: t.w, h: t.h, girado: t.girado, p1, p2 };
    });
  });

  return melhor;
}

/** Corta de `livre` a área ocupada por `usado`, devolvendo o que sobrou. */
function recortar(livre, usado) {
  const semSobreposicao =
    usado.x >= livre.x + livre.w || usado.x + usado.w <= livre.x ||
    usado.y >= livre.y + livre.h || usado.y + usado.h <= livre.y;
  if (semSobreposicao) return [livre];

  const sobras = [];
  if (usado.y > livre.y) sobras.push({ x: livre.x, y: livre.y, w: livre.w, h: usado.y - livre.y });
  if (usado.y + usado.h < livre.y + livre.h) {
    const y = usado.y + usado.h;
    sobras.push({ x: livre.x, y, w: livre.w, h: livre.y + livre.h - y });
  }
  if (usado.x > livre.x) sobras.push({ x: livre.x, y: livre.y, w: usado.x - livre.x, h: livre.h });
  if (usado.x + usado.w < livre.x + livre.w) {
    const x = usado.x + usado.w;
    sobras.push({ x, y: livre.y, w: livre.x + livre.w - x, h: livre.h });
  }
  return sobras.filter((r) => r.w > 1e-9 && r.h > 1e-9);
}

function contido(a, b) {
  return a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 &&
    a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
}

function ocupar(packer, usado) {
  let livres = [];
  packer.livres.forEach((livre) => { livres = livres.concat(recortar(livre, usado)); });

  // Sem essa limpeza a lista de retângulos livres cresce sem parar, porque o
  // MaxRects gera muitos pedaços que já estão dentro de outros.
  packer.livres = livres.filter((r, i) => !livres.some((outro, j) => j !== i && contido(r, outro)));
}

/**
 * Roda o encaixe. Recebe as peças já expandidas pela quantidade e devolve
 * { posicoes, naoEncaixadas, consumo } com todas as medidas em centímetros.
 *
 * O espaço entre peças entra somando a folga na largura/altura de cada uma
 * (a peça é desenhada no canto de cima à esquerda do retângulo reservado).
 */
function encaixar(itens, config) {
  const { larguraTecido, espaco, margem, alturaMax } = config;
  const larguraUtil = larguraTecido - margem * 2;

  const packer = criarPacker(larguraUtil, alturaMax);
  const posicoes = [];
  const naoEncaixadas = [];
  let consumo = 0;

  itens.forEach((item) => {
    const w = item.largura + espaco;
    const h = item.altura + espaco;
    const cabeDeitada = podeDeitar(item) && item.altura <= larguraUtil;

    if (item.largura > larguraUtil && !cabeDeitada) {
      naoEncaixadas.push(item);
      return;
    }

    const pos = melhorPosicao(packer, w, h, podeDeitar(item), config.heuristica);
    if (!pos) {
      naoEncaixadas.push(item);
      return;
    }

    ocupar(packer, { x: pos.x, y: pos.y, w: pos.w, h: pos.h });
    posicoes.push({
      item,
      x: pos.x + margem,
      y: pos.y + margem,
      largura: pos.girado ? item.altura : item.largura,
      altura: pos.girado ? item.largura : item.altura,
      girado: pos.girado,
    });
    consumo = Math.max(consumo, pos.y + pos.h);
  });

  return { posicoes, naoEncaixadas, consumo: consumo > 0 ? consumo + margem * 2 - espaco : 0 };
}

/**
 * O tecido é guardado como os intervalos já ocupados de cada coluna, e não
 * como uma altura só por coluna.
 *
 * A diferença é o que a peça consegue fazer ao descer. Com uma altura só, ela
 * pousa em cima de tudo e nunca aproveita um vão que ficou aberto mais acima —
 * o buraco entre duas peças, ou a barriga vazia de uma manga já posicionada.
 * Com a lista de intervalos, a peça desce coluna por coluna até o primeiro
 * lugar onde nada bate, exatamente como uma peça de verdade cairia.
 *
 * Cada coluna é uma lista plana [ini0, fim0, ini1, fim1, ...] ordenada e sem
 * sobreposição — lista plana de números em vez de objetos porque isso roda
 * milhões de vezes num encaixe grande.
 */

/**
 * O encaixe trabalha com "formas": um jeito de posicionar uma ou mais peças
 * como um bloco só. Uma peça sozinha é uma forma com uma parte; uma dupla é
 * uma forma com duas.
 *
 * Cada parte guarda a máscara já girada e o deslocamento dela dentro do bloco.
 * A forma resume tudo em topo/base por coluna, que é o que o encaixe usa para
 * descer o bloco no tecido.
 */
function formaDePartes(partes) {
  let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
  partes.forEach((p) => {
    minCol = Math.min(minCol, p.dcol);
    maxCol = Math.max(maxCol, p.dcol + p.mascara.cols - 1);
    minRow = Math.min(minRow, p.drow);
    maxRow = Math.max(maxRow, p.drow + p.mascara.rows - 1);
  });

  const cols = maxCol - minCol + 1;
  const rows = maxRow - minRow + 1;
  const topo = new Int32Array(cols).fill(-1);
  const base = new Int32Array(cols).fill(-1);

  const ajustadas = partes.map((p) => ({ ...p, dcol: p.dcol - minCol, drow: p.drow - minRow }));
  ajustadas.forEach((p) => {
    for (let c = 0; c < p.mascara.cols; c++) {
      if (p.mascara.topo[c] < 0) continue;
      const coluna = p.dcol + c;
      const cima = p.drow + p.mascara.topo[c];
      const baixo = p.drow + p.mascara.base[c];
      if (topo[coluna] < 0 || cima < topo[coluna]) topo[coluna] = cima;
      if (baixo > base[coluna]) base[coluna] = baixo;
    }
  });

  // Resumos que o encaixe usaria a cada posição testada, mas que não dependem
  // de onde a forma vai parar no tecido — então saem daqui prontos. É o que
  // deixa `melhorPosicaoDaUnidade` medir uma posição com um laço só.
  //   nCols    quantas colunas a forma realmente ocupa (a dupla pode ter vão)
  //   somaTopo soma dos topos dessas colunas
  //   maxBase  a coluna que desce mais; começa em -1 para a forma vazia dar
  //            fundo 0, igual ao laço antigo que simplesmente não entrava
  let nCols = 0, somaTopo = 0, maxBase = -1;
  for (let c = 0; c < cols; c++) {
    if (topo[c] < 0) continue;
    nCols++;
    somaTopo += topo[c];
    if (base[c] > maxBase) maxBase = base[c];
  }

  return { cols, rows, topo, base, partes: ajustadas, nCols, somaTopo, maxBase };
}

/**
 * Encosta mais uma peça num bloco: desliza a peça pela largura do bloco e, em
 * cada posição, deixa ela descer até tocar. Fica com o deslocamento que fizer
 * o bloco ocupar o menor retângulo.
 *
 * É o truque clássico do marcador de confecção: uma manga com outra manga
 * invertida fecham quase um retângulo, e aí o bloco ladrilha o tecido sem
 * sobra entre as peças.
 *
 * O bloco entra aqui como uma forma qualquer — e forma de bloco se resume em
 * topo/base por coluna do mesmo jeito que a de uma peça. É isso que deixa a
 * mesma conta servir para a segunda peça, a terceira e a quarta.
 */
function encostarNaForma(bloco, movel) {
  // A área de cada posição candidata é só a extensão da caixa combinada —
  // dá para medir isso sem montar o bloco de verdade, que é o caro (percorre
  // as partes todas e aloca duas grades novas). `formaDePartes` só é chamado
  // no fim, uma vez, para a posição que já se sabe vencedora.
  //
  // Antes disto media a área remontando o bloco a cada `dx` testado — correto,
  // mas custava uma remontagem inteira por posição. Numa dupla ou trio isso
  // nem se notava (poucos deslocamentos). No encaixe entre peças diferentes
  // (`montarUnidadesCruzadas`), que testa isto para cada par de formatos, o
  // mesmo custo por posição virou 3 segundos de um orçamento de busca de 5 —
  // e foi medindo isso que este trecho foi reescrito.
  let melhorDx = null, melhorDy = 0, melhorArea = Infinity, melhorRows = Infinity;

  for (let dx = -(movel.mascara.cols - 1); dx <= bloco.cols - 1; dx++) {
    let dy = 0;
    for (let c = 0; c < movel.mascara.cols; c++) {
      if (movel.mascara.topo[c] < 0) continue;
      const coluna = c + dx;
      if (coluna < 0 || coluna >= bloco.cols || bloco.topo[coluna] < 0) continue;
      const precisa = bloco.base[coluna] + 1 - movel.mascara.topo[c];
      if (precisa > dy) dy = precisa;
    }

    const cols = Math.max(bloco.cols - 1, dx + movel.mascara.cols - 1) - Math.min(0, dx) + 1;
    const rows = Math.max(bloco.rows - 1, dy + movel.mascara.rows - 1) - Math.min(0, dy) + 1;
    const area = cols * rows;
    if (melhorDx === null || area < melhorArea || (area === melhorArea && rows < melhorRows)) {
      melhorDx = dx; melhorDy = dy; melhorArea = area; melhorRows = rows;
    }
  }

  if (melhorDx === null) return null;
  const forma = formaDePartes([...bloco.partes, { ...movel, dcol: melhorDx, drow: melhorDy }]);
  return { area: forma.cols * forma.rows, forma };
}

/** As formas de uma peça sozinha: uma por rotação que ela aceita. */
function formasDaPeca(item) {
  const formas = [];
  rotacoesDe(item).forEach((rot) => {
    const mascara = item.mascaras.rotacoes[rot];
    if (mascara) formas.push(formaDePartes([{ item, mascara, rot, dcol: 0, drow: 0 }]));
  });
  return formas;
}

/**
 * Monta os blocos de uma peça, quando compensa.
 *
 * Um bloco de duas é a dupla de sempre: a peça com a cópia dela invertida. De
 * três em diante o bloco é montado uma peça de cada vez, sempre encostando a
 * próxima onde ela deixar o bloco menor — é a **tira** do marcador, e ela
 * empaca mais apertado que o par. Medido em caixa por peça, com as peças de
 * teste: camiseta 58374 no par contra 57040 no trio, manga 16512 contra 16064,
 * gola 2442 contra 2294.
 *
 * Os dois começos são testados (a peça em pé e a peça invertida como primeira)
 * porque o vão de uma pode receber a próxima melhor num sentido do que no
 * outro, e as duas montagens são devolvidas: elas ladrilham diferente, e quem
 * escolhe é o resultado.
 *
 * O bloco só é aceito se ocupar menos que as peças separadas. Bloco que não
 * aperta nada é uma unidade grande e sem graça, mais difícil de posicionar que
 * as peças soltas.
 */
function formasDoBloco(copias, tamanho) {
  const mascaras = copias[0].mascaras;
  const m0 = mascaras.rotacoes[0];
  const m180 = mascaras.rotacoes[180];
  if (!m0 || !m180) return null;

  const montar = (rotInicial) => {
    const primeira = rotInicial === 0 ? m0 : m180;
    let bloco = formaDePartes([{ item: copias[0], mascara: primeira, rot: rotInicial, dcol: 0, drow: 0 }]);
    for (let k = 1; k < tamanho; k++) {
      let passo = null;
      [0, 180].forEach((rot) => {
        const m = rot === 0 ? m0 : m180;
        const r = encostarNaForma(bloco, { item: copias[k], mascara: m, rot });
        if (r && (!passo || r.area < passo.area)) passo = r;
      });
      if (!passo) return null;
      bloco = passo.forma;
    }
    return { area: bloco.cols * bloco.rows, forma: bloco };
  };

  const arranjos = [montar(0), montar(180)].filter(Boolean);
  if (arranjos.length === 0) return null;

  const solta = m0.cols * m0.rows * tamanho;
  const uteis = arranjos.filter((a) => a.area < solta * 0.98).map((a) => a.forma);
  return uteis.length > 0 ? uteis : null;
}

/** A área da peça na sua rotação de referência — a mesma conta que decide se um bloco compensa. */
function areaDaPeca(item) {
  for (const rot of rotacoesDe(item)) {
    const m = item.mascaras.rotacoes[rot];
    if (m) return m.cols * m.rows;
  }
  return 0;
}

/**
 * Tenta juntar UMA peça `a` com UMA peça `b` de formato diferente, cada uma
 * na rotação que aceita — a mesma técnica de `formasDoBloco`, só que ali as
 * duas metades são cópias da mesma peça e aqui não.
 *
 * Testa nos dois sentidos (a parada e b deslizando; depois o contrário),
 * porque o vão de uma pode receber a outra bem de um lado e mal do outro — a
 * manga desliza fácil no vão da gola, mas a gola pode não deslizar tão bem no
 * vão da manga. As duas contagens são baratas perto do resto da busca, e as
 * arrumações que passarem do corte de 2% ficam todas disponíveis: quem
 * escolhe qual delas rende mais, encostada no resto do tecido, é a busca de
 * posição de sempre — igual já acontece com os dois começos da dupla.
 */
function formasDoBlocoMisto(a, b) {
  const arranjos = [];

  const tentar = (base, movel) => {
    rotacoesDe(base).forEach((rotBase) => {
      const mascaraBase = base.mascaras.rotacoes[rotBase];
      if (!mascaraBase) return;
      const bloco = formaDePartes([{ item: base, mascara: mascaraBase, rot: rotBase, dcol: 0, drow: 0 }]);
      let melhor = null;
      rotacoesDe(movel).forEach((rotMovel) => {
        const mascaraMovel = movel.mascaras.rotacoes[rotMovel];
        if (!mascaraMovel) return;
        const r = encostarNaForma(bloco, { item: movel, mascara: mascaraMovel, rot: rotMovel });
        if (r && (!melhor || r.area < melhor.area)) melhor = r;
      });
      if (melhor) arranjos.push(melhor);
    });
  };
  tentar(a, b);
  tentar(b, a);
  if (arranjos.length === 0) return null;

  const areaSolta = areaDaPeca(a) + areaDaPeca(b);
  const uteis = arranjos.filter((ar) => ar.area < areaSolta * 0.98).map((ar) => ar.forma);
  if (uteis.length === 0) return null;

  return {
    melhorArea: Math.min(...uteis.map((f) => f.cols * f.rows)),
    areaSolta,
    formas: uteis,
  };
}

// Acima disto o custo de conferir todo par de formatos deixa de valer a pena
// — um trabalho assim já tem tanta variedade que uma dupla/trio de peça igual
// dá conta do recado sozinha. Não é limite medido, é bom senso: 60 formatos
// já são 1770 pares conferidos antes da primeira tentativa de posição.
const CRUZADA_MAX_FORMATOS = 60;

/**
 * Monta unidades juntando peças de formatos DIFERENTES quando compensa — o
 * mesmo espírito da dupla/trio, mas para a peça pequena entrar no vão da
 * peça grande em vez de entrar no vão da cópia dela mesma.
 *
 * Guloso, não é o casamento perfeito entre todos os formatos (isso é um
 * problema de emparelhamento que cresce rápido demais para valer a pena
 * aqui): mede quanto cada PAR de formatos economiza, ordena do que mais
 * economiza para o que menos, e vai casando cópia com cópia enquanto sobrar
 * das duas pontas. O que sobrar sem parceiro — inclusive quando um formato
 * não combina bem com nenhum outro — sai como peça solta, exatamente como
 * hoje; esta receita nunca deixa uma peça pior do que ela já ficaria na
 * receita "solta" que compete ao lado dela.
 */
function montarUnidadesCruzadas(itens) {
  const porPeca = new Map();
  itens.forEach((item) => {
    if (!porPeca.has(item.indice)) porPeca.set(item.indice, []);
    porPeca.get(item.indice).push(item);
  });
  const indices = [...porPeca.keys()];
  // Formato demais para valer o custo de conferir todo par, ou nenhum par
  // encontrado: `null` avisa quem chamou que esta receita não tem nada de
  // diferente da "solta" para oferecer — e não vale gastar seis receitas de
  // busca repetindo o que a "solta" já cobre.
  if (indices.length > CRUZADA_MAX_FORMATOS) return null;

  const candidatos = [];
  for (let i = 0; i < indices.length; i++) {
    for (let j = i + 1; j < indices.length; j++) {
      const a = porPeca.get(indices[i])[0];
      const b = porPeca.get(indices[j])[0];
      const resultado = formasDoBlocoMisto(a, b);
      if (resultado) {
        candidatos.push({
          ia: indices[i], ib: indices[j], formas: resultado.formas,
          economia: 1 - resultado.melhorArea / resultado.areaSolta,
        });
      }
    }
  }
  if (candidatos.length === 0) return null;
  // As duplas que mais apertam primeiro: são elas que valem gastar a cópia.
  candidatos.sort((x, y) => y.economia - x.economia);

  const restante = new Map();
  porPeca.forEach((copias, indice) => restante.set(indice, copias.slice()));

  const unidades = [];
  candidatos.forEach((c) => {
    const copiasA = restante.get(c.ia);
    const copiasB = restante.get(c.ib);
    while (copiasA.length > 0 && copiasB.length > 0) {
      const itemA = copiasA.shift();
      const itemB = copiasB.shift();
      unidades.push({
        itens: [itemA, itemB],
        // As formas foram medidas com a primeira cópia de cada formato; aqui
        // cada bloco recebe as cópias de verdade, casadas pelo índice do
        // formato — não pela posição, porque `tentar` monta o bloco nos dois
        // sentidos e a peça que fica em primeiro lugar muda de arranjo para
        // arranjo.
        formas: c.formas.map((f) => ({
          ...f,
          partes: f.partes.map((p) => ({ ...p, item: p.item.indice === c.ia ? itemA : itemB })),
        })),
      });
    }
  });

  restante.forEach((copias) => {
    copias.forEach((item) => unidades.push({ itens: [item], formas: formasDaPeca(item) }));
  });

  return unidades;
}

// De que tamanho é o bloco de cada agrupamento. "solta" é a peça sozinha.
const TAMANHO_DO_AGRUPAMENTO = { solta: 1, dupla: 2, trio: 3, quarteto: 4 };

/**
 * Quebra a lista de peças em unidades de encaixe.
 *
 * Com `tamanho` maior que 1, cada grupo de cópias da mesma peça vira um bloco
 * só, e o que não completa um bloco entra solto. Peça que não pode virar 180°
 * não forma bloco invertido e sai sempre solta.
 */
function montarUnidades(itens, tamanho) {
  const unidades = [];
  if (!(tamanho > 1)) {
    itens.forEach((item) => unidades.push({ itens: [item], formas: formasDaPeca(item) }));
    return unidades;
  }

  const porPeca = new Map();
  itens.forEach((item) => {
    if (!porPeca.has(item.indice)) porPeca.set(item.indice, []);
    porPeca.get(item.indice).push(item);
  });

  porPeca.forEach((copias) => {
    const formasBloco = copias.length >= tamanho && rotacoesDe(copias[0]).includes(180)
      ? formasDoBloco(copias, tamanho)
      : null;

    let i = 0;
    if (formasBloco) {
      for (; i + tamanho <= copias.length; i += tamanho) {
        const grupo = copias.slice(i, i + tamanho);
        unidades.push({
          itens: grupo,
          // as formas foram medidas com as primeiras cópias; as partes
          // apontam para elas, então aqui cada bloco recebe as suas
          formas: formasBloco.map((f) => ({
            ...f,
            partes: f.partes.map((p, k) => ({ ...p, item: grupo[k] })),
          })),
        });
      }
    }
    for (; i < copias.length; i++) {
      unidades.push({ itens: [copias[i]], formas: formasDaPeca(copias[i]) });
    }
  });

  return unidades;
}

/**
 * Encaixa deslizando cada unidade por cima do relevo do que já está
 * posicionado. `perfil[coluna]` guarda até onde o tecido já foi usado naquela
 * coluna; a unidade desce até a primeira coluna encostar, e é isso que faz uma
 * peça se aninhar na curva da outra. Como o perfil guarda a parte mais baixa
 * de cada coluna, duas peças nunca se sobrepõem.
 */
/**
 * Umas poucas colunas da forma, escolhidas para adivinhar barato onde ela vai
 * parar antes de medir de verdade.
 *
 * O `y` de uma posição é o maior encosto entre todas as colunas. Olhando só
 * algumas, o que sai é um piso: o `y` de verdade é pelo menos aquilo. E piso
 * já basta para descartar posição ruim — se nem o piso alcança a melhor
 * posição conhecida, a posição inteira pode ser pulada sem tocar nas outras
 * duzentas colunas.
 *
 * Quais colunas: as de topo mais raso, que são as que mais descem na peça e
 * por isso as que mais mandam no `y`, mais algumas espalhadas pela largura,
 * porque um piso feito só de colunas vizinhas erra junto quando o relevo do
 * tecido é irregular.
 *
 * Fica guardada na forma na primeira vez que ela é usada, e não na fábrica:
 * `encostarNaForma` cria uma forma para cada deslocamento que testa e joga quase
 * todas fora, então montar isso lá seria trabalho perdido.
 */
function sondasDaForma(forma) {
  const { cols, topo } = forma;
  const validas = [];
  for (let c = 0; c < cols; c++) if (topo[c] >= 0) validas.push(c);
  if (validas.length === 0) return new Int32Array(0);

  const escolhidas = new Set();
  const porTopo = validas.slice().sort((a, b) => topo[a] - topo[b]);
  for (let i = 0; i < porTopo.length && escolhidas.size < 4; i++) escolhidas.add(porTopo[i]);
  for (let i = 0; i < 4; i++) {
    escolhidas.add(validas[Math.floor((validas.length - 1) * (i / 3))]);
  }
  return Int32Array.from(escolhidas);
}

/**
 * Acha o melhor lugar para uma unidade no relevo atual. Devolve também quanto
 * de buraco morto a escolha cria (`vazio`) e onde fica o ponto mais baixo dela
 * (`fundo`), que são as duas medidas usadas para comparar posições.
 */
function melhorPosicaoDaUnidade(perfil, colsTecido, unidade, heuristica, salto = 1) {
  let melhor = null;
  const usaVazio = heuristica === "vazio";
  const pulo = Math.max(1, Math.round(salto));

  // Soma acumulada do relevo: com ela, o total debaixo de qualquer trecho sai
  // numa subtração. Serve só à poda da heurística "vazio" (ver adiante), então
  // só é montada quando é ela que está valendo.
  let acumulado = null;
  if (usaVazio) {
    acumulado = new Float64Array(colsTecido + 1);
    for (let c = 0; c < colsTecido; c++) acumulado[c + 1] = acumulado[c] + perfil[c];
  }

  unidade.formas.forEach((forma) => {
    if (forma.cols > colsTecido) return;

    // Cópias locais: este laço roda milhões de vezes num encaixe grande, e ler
    // a propriedade do objeto a cada volta custa mais que o cálculo em si.
    const { cols, topo, nCols, somaTopo, maxBase } = forma;
    const sondas = forma.sondas || (forma.sondas = sondasDaForma(forma));
    const nSondas = sondas.length;

    // A poda precisa saber, antes de a conta acabar, quanto vale o relevo
    // debaixo da forma inteira — e no caso do "vazio" isso só sai da soma
    // acumulada quando a forma ocupa todas as colunas do retângulo dela. Forma
    // com vão no meio (dupla que deixa folga entre as duas peças) não tem esse
    // atalho e roda sem poda. É a minoria, e o resultado é o mesmo dos dois
    // jeitos — o que muda é só o tempo.
    const podeCortar = !usaVazio || nCols === cols;

    const ultimoX = colsTecido - cols;

    // A melhor posição **desta forma**, para a passada fina saber onde olhar.
    // É separada da melhor geral porque a forma pode estar atrás e ainda assim
    // ter uma vizinhança que vale conferir.
    let localP1 = Infinity, localP2 = Infinity, localX = -1;

    const avaliar = (x) => {
      const janela = podeCortar && usaVazio ? acumulado[x + cols] - acumulado[x] : 0;

      // Repare nas duas fórmulas usadas mais abaixo:
      //
      //   fundo = y + maxBase + 1
      //   vazio = y·nCols + somaTopo − janela        (janela não depende do y)
      //
      // As duas só **pioram** quando o `y` sobe. Então qualquer piso do `y`
      // vira um piso da nota — e posição cujo piso já perdeu para a melhor
      // conhecida não tem como alcançar, seja qual for o resto.
      //
      // O corte é sempre por "maior que", nunca por "igual": posição empatada
      // ainda precisa ser calculada até o fim, porque quem desempata é a
      // segunda nota, e ela depende da soma inteira.
      const notaCom = (yQualquer) => (usaVazio
        ? yQualquer * nCols + somaTopo - janela
        : yQualquer + maxBase + 1);

      // 1) O palpite barato: só as colunas-sonda. Custa oito contas em vez de
      // duzentas, e é o que faz a maior parte das posições nem ser medida.
      if (melhor !== null && podeCortar) {
        let piso = 0;
        for (let i = 0; i < nSondas; i++) {
          const c = sondas[i];
          const encosta = perfil[x + c] - topo[c];
          if (encosta > piso) piso = encosta;
        }
        if (notaCom(piso) > melhor.p1) return;
      }

      // 2) A medida de verdade. As colunas são lidas em ordem, do começo ao
      // fim: é assim que `perfil[x + c]` cai sempre na próxima posição da
      // memória. Já tentei visitar as colunas na ordem do topo mais raso, para
      // a poda daqui de dentro disparar antes — **e ficou 28% mais lento**. O
      // salto na memória custa mais do que a coluna economizada. Não repetir.
      let y = 0;
      let somaPerfil = 0;
      let cortada = false;

      for (let c = 0; c < cols; c++) {
        const t = topo[c];
        if (t < 0) continue;
        const altura = perfil[x + c];
        somaPerfil += altura;
        const encosta = altura - t;
        if (encosta <= y) continue;
        y = encosta;
        // Mesmo argumento do palpite, agora com o `y` parcial: ele só cresce
        // daqui para a frente, porque é o máximo do que já passou.
        if (melhor !== null && podeCortar && notaCom(y) > melhor.p1) { cortada = true; break; }
      }

      if (cortada) return;

      const vazio = y * nCols + somaTopo - somaPerfil; // buraco morto que fica acima
      const fundo = y + maxBase + 1;

      // "fundo" empurra tudo para o começo do rolo; "vazio" prefere o lugar
      // que deixa menos buraco morto. Cada um vence em casos diferentes, por
      // isso os dois são testados e o melhor resultado é que vale.
      //
      // Já tentei penalizar aqui o rodapé irregular que a peça deixa, achando
      // que atrapalhava a fileira seguinte. Piora tudo: o relevo irregular não
      // é desperdício, é o encaixe da próxima peça. Não vale tentar de novo.
      const p1 = usaVazio ? vazio : fundo;
      const p2 = usaVazio ? fundo : vazio;
      if (p1 < localP1 || (p1 === localP1 && p2 < localP2)) {
        localP1 = p1; localP2 = p2; localX = x;
      }
      if (!melhor || p1 < melhor.p1 || (p1 === melhor.p1 && p2 < melhor.p2)) {
        melhor = { x, y, forma, p1, p2, fundo, vazio };
      }
    };

    // ---------- A VARREDURA ----------
    //
    // Com `pulo` 1 é a varredura de sempre: toda posição, uma por uma.
    //
    // Acima disso vira duas passadas. A primeira anda de `pulo` em `pulo` pelo
    // rolo inteiro, procurando a **região** boa; a segunda volta e confere
    // posição por posição só em volta do que a primeira achou.
    //
    // A ideia é que posições vizinhas dão quase o mesmo resultado — mover a
    // peça uma célula para o lado raramente muda onde ela encosta. Então a
    // passada grossa acha a região certa, e a fina acerta o detalhe.
    //
    // Não é exato: a melhor posição pode estar numa região que a passada
    // grossa julgou ruim e nem chegou a refinar. O que se ganha é tempo, que
    // vira mais tentativas — e mais tentativas é o que compra tecido.
    //
    // Medido em quatro trabalhos, orçamento fixo, cinco fatias do portfólio:
    //
    //   pulo 1 (exato)  referência
    //   pulo 2          1,8x a 2,2x mais tentativas   −0,14% de tecido
    //   pulo 3          2,2x a 2,8x mais tentativas   −1,23% de tecido
    //   pulo 4          2,5x a 3,8x mais tentativas   −0,97% de tecido
    //
    // O 3 é o melhor: pular mais começa a perder posição boa demais para o que
    // as tentativas extras recuperam. Confirmado com três sementes diferentes
    // (12 comparações): média −1,08%, mas pior caso +0,69% — sozinho ele às
    // vezes perde. Quem escolhe o pulo é o encaixe-paralelo.js, e lá está a
    // configuração que não perde nunca.
    if (pulo <= 1) {
      for (let x = 0; x <= ultimoX; x++) avaliar(x);
    } else {
      for (let x = 0; x <= ultimoX; x += pulo) avaliar(x);
      // O fim do rolo é candidato como qualquer outro, e o pulo pode passar
      // por cima dele.
      if (ultimoX % pulo !== 0) avaliar(ultimoX);
      if (localX >= 0) {
        const de = Math.max(0, localX - pulo + 1);
        const ate = Math.min(ultimoX, localX + pulo - 1);
        for (let x = de; x <= ate; x++) if (x !== localX) avaliar(x);
      }
    }
  });

  return melhor;
}

/** Marca o tecido usado e registra onde cada peça da unidade ficou. */
function assentarUnidade(perfil, escolha) {
  const forma = escolha.forma;
  for (let c = 0; c < forma.cols; c++) {
    if (forma.topo[c] < 0) continue;
    perfil[escolha.x + c] = escolha.y + forma.base[c] + 1;
  }
}

/**
 * As colocações viram as posições que a tela desenha.
 *
 * Uma COLOCAÇÃO é `{ forma, x, y }` em células da grade — o que o encaixe
 * decide. Uma POSIÇÃO é a peça em centímetros no rolo, com a máscara junto — o
 * que a tela e o PDF usam. Separar as duas é o que deixa a repescagem
 * (`repescarNosVaos`) mexer numa peça já assentada sem refazer conta de
 * centímetro: ela mexe na colocação, e as posições saem no fim, uma vez só.
 */
function posicoesDasColocacoes(colocacoes, passo, margem) {
  const posicoes = [];
  colocacoes.forEach((col) => {
    col.forma.partes.forEach((parte) => {
      const m = parte.mascara;
      const deitada = parte.rot === 90 || parte.rot === 270;
      posicoes.push({
        item: parte.item,
        // canto da arte: desfaz o recorte da máscara para achar a imagem inteira
        x: (col.x + parte.dcol) * passo + margem - m.offX,
        y: (col.y + parte.drow) * passo + margem - m.offY,
        largura: deitada ? parte.item.altura : parte.item.largura,
        altura: deitada ? parte.item.largura : parte.item.altura,
        rot: parte.rot,
        girado: deitada,
        mascara: m,
        passo,
      });
    });
  });
  return posicoes;
}

/** Onde a colocação termina, em células. É ele que manda no consumo. */
const fundoDaColocacao = (col) => col.y + col.forma.maxBase + 1;

// ==================== A REPESCAGEM NOS VÃOS ====================

/**
 * Devolve ao encaixe o tecido que o relevo por coluna deixou para trás.
 *
 * O encaixe por contorno guarda o tecido como UMA altura por coluna. É isso que
 * o faz render — a peça desce e se aninha na curva da anterior — e é também o
 * seu buraco: assim que uma peça é assentada, tudo o que ficou **acima** dela
 * naquela coluna some do mapa. O vão do decote de uma camiseta, com a camiseta
 * já posta, deixa de existir; a gola que caberia exatamente ali vai para o fim
 * do rolo.
 *
 * Medido com `npm run bancada:vaos`, numa passada gulosa: **32% do rolo** é vão
 * preso em camiseta+manga+gola, e o maior deles mede 46x70 cm — cabe uma manga
 * inteira parada ali dentro. Em lote grande são 25,6%.
 *
 * A busca já contornava isso pela ordem: entrando a gola ANTES, a camiseta desce
 * por cima dela e fecha. Só que achar essa ordem é sorte de embaralhamento, e
 * quanto mais peças menos provável — foi exatamente a queixa que veio da
 * produção ("encaixa tudo do mesmo modelo e esquece o espaço que sobrou").
 *
 * Aqui o mapa é outro: em vez de uma altura por coluna, a lista dos INTERVALOS
 * ocupados de cada coluna. Com ela a peça desce até o primeiro lugar em que
 * nada bate — inclusive um vão fechado por cima. É caro (uma descida custa uma
 * varredura de intervalos por coluna, contra uma leitura só no relevo), e por
 * isso não substitui o encaixe: roda **uma vez, no fim**, e só nas peças do
 * rabo do rolo, que são as que encurtam a metragem se subirem.
 *
 * Só aceita o que melhora: a peça só sai do lugar se achar posição que termine
 * mais acima. Nunca piora um encaixe.
 */
function intervalosDoRolo(colocacoes, colsTecido) {
  const colunas = [];
  for (let c = 0; c < colsTecido; c++) colunas.push([]);
  colocacoes.forEach((col) => ocuparIntervalos(colunas, col, 1));
  colunas.forEach((lista) => lista.sort((a, b) => a.ini - b.ini));
  return colunas;
}

/** Marca (`sinal` 1) ou desmarca (`sinal` -1) a colocação nos intervalos. */
function ocuparIntervalos(colunas, col, sinal) {
  const { forma, x, y } = col;
  for (let c = 0; c < forma.cols; c++) {
    if (forma.topo[c] < 0) continue;
    const coluna = colunas[x + c];
    if (!coluna) continue;
    if (sinal > 0) {
      coluna.push({ ini: y + forma.topo[c], fim: y + forma.base[c], dono: col });
      coluna.sort((a, b) => a.ini - b.ini);
    } else {
      const onde = coluna.findIndex((iv) => iv.dono === col);
      if (onde >= 0) coluna.splice(onde, 1);
    }
  }
}

/**
 * Desce a forma na posição `x` até o primeiro lugar em que nada bate.
 *
 * A cada esbarrão o `y` pula para logo abaixo do intervalo que bateu e a
 * conferência recomeça — o `y` só cresce, então isso termina. Diferente do
 * relevo, aqui ela pode PARAR NO MEIO: se couber num vão fechado por cima, é
 * ali que ela fica.
 *
 * Devolve `null` quando a descida já passou do `tetoFundo` — não há o que
 * ganhar dali para baixo, e parar cedo é o que deixa esta varredura caber no
 * orçamento.
 */
function descerNosVaos(colunas, x, forma, tetoFundo) {
  let y = 0;
  for (let voltas = 0; voltas < 4096; voltas++) {
    // Uma passada por TODAS as colunas, ficando com o maior empurrão de todos.
    //
    // A primeira versão parava na primeira coluna que batia e recomeçava a
    // volta inteira dali. Correto, e lento: numa peça de trezentas colunas com
    // meia dúzia de intervalos em cada, eram dezenas de voltas completas. Aqui
    // cada volta já colhe o pior caso de uma vez, e duas ou três bastam —
    // é a mesma conta do relevo, só que perguntando à lista de intervalos em
    // vez de a uma altura só.
    let proximo = y;
    for (let c = 0; c < forma.cols; c++) {
      const t = forma.topo[c];
      if (t < 0) continue;
      const lista = colunas[x + c];
      if (lista.length === 0) continue;
      const base = forma.base[c];
      // Empurra até ESTA coluna caber. Cada empurrão move a janela, então ela
      // é recalculada a cada volta — e `proximo` só cresce, o que faz isto
      // terminar sempre.
      let mudou = true;
      while (mudou) {
        mudou = false;
        const ini = proximo + t;
        const fim = proximo + base;
        for (let i = 0; i < lista.length; i++) {
          const iv = lista[i];
          if (iv.fim < ini) continue;
          if (iv.ini > fim) break;
          if (iv.fim + 1 - t > proximo) { proximo = iv.fim + 1 - t; mudou = true; }
          break;
        }
      }
    }
    if (proximo === y) return y;
    y = proximo;
    if (y + forma.maxBase + 1 >= tetoFundo) return null;
  }
  return null;
}

/** A melhor colocação nova para esta unidade, se houver alguma acima da atual. */
function melhorVagaNosVaos(colunas, colsTecido, unidade, tetoFundo) {
  let melhor = null;
  unidade.formas.forEach((forma) => {
    if (forma.cols > colsTecido) return;
    const ultimoX = colsTecido - forma.cols;
    for (let x = 0; x <= ultimoX; x++) {
      const teto = melhor ? melhor.fundo : tetoFundo;
      const y = descerNosVaos(colunas, x, forma, teto);
      if (y === null) continue;
      const fundo = y + forma.maxBase + 1;
      if (fundo < teto) melhor = { forma, x, y, fundo };
    }
  });
  return melhor;
}

// Quantas peças do rabo do rolo entram na repescagem. Mexer em peça do meio não
// encurta metragem nenhuma: o consumo é o ponto mais baixo alcançado.
const REPESCA_MAX_PECAS = 16;
// Só entra na roda a peça que termina no último terço do rolo.
const REPESCA_FATIA_DO_RABO = 0.66;

function repescarNosVaos(colocacoes, colsTecido) {
  const fundoDeTodas = () => colocacoes.reduce((m, c) => Math.max(m, fundoDaColocacao(c)), 0);
  if (colocacoes.length < 2) return fundoDeTodas();

  const colunas = intervalosDoRolo(colocacoes, colsTecido);
  const fundoMax = fundoDeTodas();

  const doRabo = colocacoes
    .filter((c) => fundoDaColocacao(c) >= fundoMax * REPESCA_FATIA_DO_RABO)
    .sort((a, b) => fundoDaColocacao(b) - fundoDaColocacao(a))
    .slice(0, REPESCA_MAX_PECAS);

  doRabo.forEach((col) => {
    const antes = fundoDaColocacao(col);
    ocuparIntervalos(colunas, col, -1);
    const vaga = melhorVagaNosVaos(colunas, colsTecido, col.unidade, antes);
    if (vaga) { col.forma = vaga.forma; col.x = vaga.x; col.y = vaga.y; }
    ocuparIntervalos(colunas, col, 1);
  });

  return fundoDeTodas();
}

function resultadoDoEncaixe(posicoes, naoEncaixadas, fundoMax, passo, margem) {
  return {
    posicoes, naoEncaixadas,
    consumo: fundoMax > 0 ? fundoMax * passo + margem * 2 : 0,
    areaReal: posicoes.reduce((soma, p) => soma + p.item.mascaras.areaReal, 0),
  };
}

/** Encaixa na ordem em que as unidades vierem. */
function encaixarContorno(unidades, config) {
  // O mesmo trabalho em WebAssembly, quando ele estiver disponível (ver
  // encaixe-wasm.js e wasm/src/lib.rs). Devolve `null` quando não dá — sem
  // módulo carregado, tecido largo demais para o plano de memória — e aí segue
  // o caminho de sempre, logo abaixo, que continua sendo a referência de
  // correção. Existe um teste que compara os dois posição por posição.
  if (typeof encaixarContornoWasm === "function") {
    const pelaViaRapida = encaixarContornoWasm(unidades, config);
    if (pelaViaRapida) {
      // A repescagem trabalha nas colocações, que o WASM também devolve.
      if (config.repescar && pelaViaRapida.colocacoes) {
        const { passo, margem } = config;
        const colsDoTecido = config.colsForcado
          || Math.max(1, Math.floor((config.larguraTecido - margem * 2) / passo));
        const fundo = repescarNosVaos(pelaViaRapida.colocacoes, colsDoTecido);
        const refeito = resultadoDoEncaixe(
          posicoesDasColocacoes(pelaViaRapida.colocacoes, passo, margem),
          pelaViaRapida.naoEncaixadas, fundo, passo, margem);
        refeito.piorUnidade = pelaViaRapida.piorUnidade;
        refeito.piorVazio = pelaViaRapida.piorVazio;
        return refeito;
      }
      return pelaViaRapida;
    }
  }

  const { larguraTecido, margem, passo, heuristica } = config;
  // `colsForcado` é usado pelo encaixe por faixas: ali a largura não é a do
  // rolo, é a da faixa — e a margem da borda já foi descontada uma vez só.
  const colsTecido = config.colsForcado
    || Math.max(1, Math.floor((larguraTecido - margem * 2) / passo));

  const perfil = new Int32Array(colsTecido);
  const colocacoes = [];
  const naoEncaixadas = [];
  let fundoMax = 0;
  // A unidade cuja posição escolhida deixou mais buraco morto acima dela —
  // "vazio" já é medido para toda posição (ver `melhorPosicaoDaUnidade`),
  // então guardar o pior daqui não custa nada a mais. É o que a busca usa
  // para tentar reparar a tentativa em vez de só sacudir tudo (ver
  // `repararPior` em `buscarMelhorEncaixe`).
  let piorUnidade = null, piorVazio = -Infinity;

  unidades.forEach((unidade) => {
    const escolha = melhorPosicaoDaUnidade(perfil, colsTecido, unidade, heuristica, config.saltoX);
    if (!escolha) {
      unidade.itens.forEach((item) => naoEncaixadas.push(item));
      return;
    }
    assentarUnidade(perfil, escolha);
    colocacoes.push({ unidade, forma: escolha.forma, x: escolha.x, y: escolha.y });
    if (escolha.fundo > fundoMax) fundoMax = escolha.fundo;
    if (escolha.vazio > piorVazio) { piorVazio = escolha.vazio; piorUnidade = unidade; }
  });

  if (config.repescar) fundoMax = repescarNosVaos(colocacoes, colsTecido);

  const resultado = resultadoDoEncaixe(
    posicoesDasColocacoes(colocacoes, passo, margem), naoEncaixadas, fundoMax, passo, margem);
  resultado.piorUnidade = piorUnidade;
  resultado.piorVazio = piorVazio;
  return resultado;
}

// ==================== O ENCAIXE POR VÃOS (O HÍBRIDO) ====================

/**
 * O encaixe que junta os dois motores: a silhueta do contorno com a
 * contabilidade de espaço livre da caixa.
 *
 * Por que ele existe
 * ------------------
 * O encaixe por contorno guarda o tecido como uma altura por coluna. A peça
 * desce e se aninha na curva da anterior — é o que o faz render — mas o vão que
 * fica **acima** de uma peça já assentada some do mapa para sempre. O encaixe
 * por caixa não tem esse problema (ele mantém a lista de retângulos livres, e
 * enxerga buraco em qualquer lugar), só que joga fora a silhueta e trata toda
 * peça como o retângulo em volta dela.
 *
 * Cada um tem metade da resposta. Medindo o trabalho de produção
 * (`producao-uniforme`, 175 peças, 179 cm), o que sobra depois do contorno é
 * **20,3% do rolo em vão preso** contra 1,9% de vão aberto: quase todo o
 * desperdício restante é exatamente do tipo que a contabilidade da caixa
 * saberia achar.
 *
 * Este encaixador usa a silhueta do contorno E a contabilidade da caixa: o
 * tecido é a lista dos **intervalos ocupados de cada coluna**, e a peça desce
 * até o primeiro lugar em que nada bate — inclusive um vão fechado por cima.
 * É a mesma máquina da repescagem (`repescarNosVaos`), aplicada a toda peça
 * desde a primeira em vez de só ao rabo do rolo.
 *
 * O preço
 * -------
 * Uma descida por intervalos custa uma varredura por coluna, contra uma leitura
 * só no relevo. Ele faz menos tentativas no mesmo tempo, e é por isso que entra
 * como **mais uma receita na disputa** e não no lugar do contorno: em trabalho
 * onde o vão preso é pequeno, o contorno faz dez vezes mais tentativas e ganha;
 * onde o vão preso é grande, aqui é que está o tecido.
 */
function melhorVagaPorVaos(tecido, colsTecido, unidade, salto) {
  const { colunas, perfil, temVao, topoLivre, maiorVao } = tecido;
  let melhor = null;
  const pulo = Math.max(1, Math.round(salto || 1));

  unidade.formas.forEach((forma) => {
    if (forma.cols > colsTecido) return;
    const ultimoX = colsTecido - forma.cols;
    const { cols, topo, maxBase } = forma;
    const sondas = forma.sondas || (forma.sondas = sondasDaForma(forma));
    const nSondas = sondas.length;
    // Quanto de vão seguido a peça precisa em cada coluna. Fica guardado na
    // forma: ele não muda, e é consultado uma vez por coluna por posição.
    const altura = forma.alturaPorColuna || (forma.alturaPorColuna = (() => {
      const a = new Int32Array(forma.cols);
      for (let c = 0; c < forma.cols; c++) {
        a[c] = forma.topo[c] < 0 ? 0 : forma.base[c] - forma.topo[c] + 1;
      }
      return a;
    })());

    const olhar = (x) => {
      /*
       * A PODA — é ela que faz este motor caber no tempo.
       *
       * `topoLivre[c]` é a primeira linha livre da coluna: nem a descida pelos
       * vãos consegue pôr a peça acima dela. Então
       *
       *     y >= topoLivre[x + c] - topo[c]   em toda coluna
       *
       * e o maior desses é um PISO do `y` — logo, um piso do fundo. Posição
       * cujo piso já perdeu para a melhor conhecida não tem como alcançar, e
       * pode ser pulada sem tocar em intervalo nenhum.
       *
       * É a mesma jogada do encaixe por relevo (ver `melhorPosicaoDaUnidade`),
       * e pelo mesmo motivo: as colunas-sonda primeiro, que custam oito contas
       * em vez de trezentas, e só quem passa delas é medido de verdade. Sem
       * isto o motor fazia 14 tentativas por busca.
       */
      if (melhor !== null) {
        let piso = 0;
        for (let i = 0; i < nSondas; i++) {
          const c = sondas[i];
          const coluna = x + c;
          // Nesta coluna a peça precisa de `altura[c]` de vão seguido. Se o
          // maior buraco da coluna não comporta isso, ela não tem como parar no
          // meio: só abaixo do relevo. Esse é o piso forte.
          const v = altura[c] > maiorVao[coluna]
            ? perfil[coluna] - topo[c]
            : topoLivre[coluna] - topo[c];
          if (v > piso) piso = v;
        }
        if (piso + maxBase + 1 >= melhor.fundo) return;
      }

      /*
       * O ATALHO QUE FAZ ESTE MOTOR CABER NO ORÇAMENTO.
       *
       * Descer pelos intervalos é caro; descer pelo relevo é uma leitura por
       * coluna. E os dois dão exatamente o mesmo `y` quando não há vão nenhum
       * nas colunas que a peça cobre — que é a esmagadora maioria das posições,
       * porque vão preso é buraco, e buraco é exceção.
       *
       * Então: o relevo primeiro, sempre. A descida cara só roda onde existe
       * vão de verdade, e é só ali que este motor difere do contorno. Sem isto
       * ele fazia 5 tentativas por busca; com isto, faz milhares.
       */
      let temVaoAqui = false;
      let ySky = 0;
      let piso = 0;
      let cortada = false;
      for (let c = 0; c < cols; c++) {
        const t = topo[c];
        if (t < 0) continue;
        const coluna = x + c;
        if (temVao[coluna]) temVaoAqui = true;
        const encosta = perfil[coluna] - t;
        if (encosta > ySky) ySky = encosta;
        // O piso de verdade, agora com todas as colunas — e o corte no meio do
        // laço, assim que ele passa do melhor conhecido.
        const livre = (altura[c] > maiorVao[coluna] ? perfil[coluna] : topoLivre[coluna]) - t;
        if (livre > piso) {
          piso = livre;
          if (melhor !== null && piso + maxBase + 1 >= melhor.fundo) { cortada = true; break; }
        }
      }
      if (cortada) return;

      let y = ySky;
      if (temVaoAqui) {
        // Aqui pode haver buraco fechado por cima: vale a descida de verdade.
        // Ela nunca devolve `y` maior que o do relevo, então o relevo já serve
        // de teto e a busca desiste cedo.
        const teto = Math.min(melhor ? melhor.fundo : Infinity, ySky + maxBase + 1);
        const yVao = descerNosVaos(colunas, x, forma, teto + 1);
        if (yVao !== null && yVao < y) y = yVao;
      }

      const fundo = y + maxBase + 1;
      // Empate no fundo fica com o mais à esquerda, que é o que deixa o rolo
      // fechar por fileiras em vez de espalhar.
      if (!melhor || fundo < melhor.fundo) melhor = { forma, x, y, fundo };
    };

    for (let x = 0; x <= ultimoX; x += pulo) olhar(x);
    if (pulo > 1 && ultimoX % pulo !== 0) olhar(ultimoX);
    // A passada fina em volta da melhor região, igual à do encaixe por relevo.
    if (pulo > 1 && melhor) {
      const de = Math.max(0, melhor.x - pulo + 1);
      const ate = Math.min(ultimoX, melhor.x + pulo - 1);
      for (let x = de; x <= ate; x++) if (x !== melhor.x) olhar(x);
    }
  });

  return melhor;
}

function encaixarPorVaos(unidades, config) {
  const { larguraTecido, margem, passo } = config;
  const colsTecido = config.colsForcado
    || Math.max(1, Math.floor((larguraTecido - margem * 2) / passo));

  /*
   * O tecido, guardado de dois jeitos ao mesmo tempo:
   *
   *   colunas  os intervalos ocupados — o mapa exato, que enxerga buraco
   *   perfil   uma altura por coluna — o mapa barato, do encaixe por contorno
   *   temVao   a coluna tem algum buraco fechado por cima?
   *
   * Os dois primeiros dizem a mesma coisa onde `temVao` é falso, e é o terceiro
   * que decide qual consultar. Ver `melhorVagaPorVaos`.
   */
  const tecido = {
    colunas: [],
    perfil: new Int32Array(colsTecido),
    temVao: new Uint8Array(colsTecido),
    // A primeira linha livre de cada coluna. Nenhuma peça consegue subir acima
    // dela, e é disso que sai a poda (ver `melhorVagaPorVaos`).
    topoLivre: new Int32Array(colsTecido),
    // O maior buraco FECHADO da coluna — o maior vão entre dois pedaços de
    // peça. Peça que precisa de mais que isso não tem como parar no meio desta
    // coluna, e é essa pergunta que transforma a poda fraca em poda forte.
    maiorVao: new Int32Array(colsTecido),
  };
  for (let c = 0; c < colsTecido; c++) tecido.colunas.push([]);

  const colocacoes = [];
  const naoEncaixadas = [];
  let fundoMax = 0;
  let piorUnidade = null, piorVazio = -Infinity;

  unidades.forEach((unidade) => {
    const escolha = melhorVagaPorVaos(tecido, colsTecido, unidade, config.saltoX);
    if (!escolha) {
      unidade.itens.forEach((item) => naoEncaixadas.push(item));
      return;
    }
    const colocacao = { unidade, forma: escolha.forma, x: escolha.x, y: escolha.y };
    ocuparIntervalos(tecido.colunas, colocacao, 1);
    // O relevo e a marca de buraco acompanham. A peça abriu um vão nesta coluna
    // se o topo dela ficou ABAIXO de onde o relevo estava — o que sobrou entre
    // os dois é buraco fechado por cima.
    const forma = escolha.forma;
    for (let c = 0; c < forma.cols; c++) {
      if (forma.topo[c] < 0) continue;
      const coluna = escolha.x + c;
      if (escolha.y + forma.topo[c] > tecido.perfil[coluna]) tecido.temVao[coluna] = 1;
      const ate = escolha.y + forma.base[c] + 1;
      if (ate > tecido.perfil[coluna]) tecido.perfil[coluna] = ate;
      // A primeira linha livre anda para baixo enquanto os intervalos se
      // emendarem a partir dela.
      const lista = tecido.colunas[coluna];
      // A primeira linha livre: anda enquanto os intervalos se emendarem a
      // partir do zero.
      let livre = 0;
      for (let i = 0; i < lista.length; i++) {
        if (lista[i].ini > livre) break;
        if (lista[i].fim + 1 > livre) livre = lista[i].fim + 1;
      }
      tecido.topoLivre[coluna] = livre;

      // O maior vão da coluna acima do relevo: os buracos entre um pedaço de
      // peça e o seguinte, mais o que sobrou entre o começo do rolo e a
      // primeira peça. Todos servem de vaga, e por isso todos contam — contar
      // a menos aqui deixaria a poda forte demais e esconderia posição boa.
      let maior = 0;
      let fimAtual = -1;
      for (let i = 0; i < lista.length; i++) {
        const iv = lista[i];
        const vao = iv.ini - (fimAtual + 1);
        if (vao > maior) maior = vao;
        if (iv.fim > fimAtual) fimAtual = iv.fim;
      }
      tecido.maiorVao[coluna] = maior;
    }
    colocacoes.push(colocacao);
    if (escolha.fundo > fundoMax) fundoMax = escolha.fundo;
    // O buraco morto que esta escolha deixou acima dela, para o reparo guiado
    // da busca ter em quem mirar — a mesma medida do encaixe por relevo.
    const vazio = escolha.y * escolha.forma.nCols + escolha.forma.somaTopo;
    if (vazio > piorVazio) { piorVazio = vazio; piorUnidade = unidade; }
  });

  const resultado = resultadoDoEncaixe(
    posicoesDasColocacoes(colocacoes, passo, margem), naoEncaixadas, fundoMax, passo, margem);
  resultado.colocacoes = colocacoes;
  resultado.piorUnidade = piorUnidade;
  resultado.piorVazio = piorVazio;
  return resultado;
}

// ==================== ENCAIXE POR FAIXAS ====================

/**
 * O rolo dividido em duas faixas ao comprido, cada uma com as suas peças.
 *
 * É o que o riscador faz na mão quando o tecido é largo: separa uma faixa para
 * as peças grandes e outra para as pequenas, e encaixa cada uma no seu ritmo.
 * Encaixando tudo junto, a peça pequena entra no meio das grandes e estraga a
 * fileira; separadas, cada faixa fecha bem.
 *
 * **Medido, não compensa — e por isso está fora do padrão.** Em quatro
 * formatos de trabalho, com duas maneiras diferentes de escolher onde cortar,
 * a faixa perdeu do encaixe comum em todos:
 *
 *   regata 45 + manga 22 (rolo 160):  contorno 4,98 m | faixas 5,24 m
 *   regata 50 + gola 55x8:            retângulo 4,96 m | faixas 5,31 m
 *   camiseta 56 + manga 46:           contorno 12,01 m | faixas 12,35 m
 *   só peça grande:                   retângulo 5,82 m | faixas 6,59 m
 *
 * O motivo é geométrico: a divisão fixa proíbe a peça de atravessar a linha
 * das faixas. O encaixe por perfil já forma colunas sozinho quando isso ajuda
 * — e, ao contrário da faixa, pode mudar a coluna de lugar quando não ajuda.
 * Fica aqui documentado para não ser reinventado sem medir: para colocar na
 * disputa, basta acrescentar "faixas" à lista de motores lá no botão.
 */

/** A menor largura em que a unidade cabe, em centímetros. */
function larguraDaUnidade(unidade, passo) {
  return Math.min(...unidade.formas.map((f) => f.cols)) * passo;
}

/**
 * Onde cortar o rolo. Cada largura de peça sugere um corte: uma peça, duas
 * peças, três... O corte só entra na lista se o que sobra ainda comporta a
 * peça mais estreita — senão a segunda faixa nasceria morta.
 */
function cortesDeFaixa(unidades, config) {
  const { passo, margem, larguraTecido } = config;
  const colsUtil = Math.max(1, Math.floor((larguraTecido - margem * 2) / passo));
  const larguras = [...new Set(unidades.map((u) => larguraDaUnidade(u, passo)))].sort((a, b) => b - a);
  if (larguras.length < 2) return [];

  const maisEstreita = larguras[larguras.length - 1];
  const maisLarga = larguras[0];
  const cortes = new Set();
  larguras.forEach((largura) => {
    for (let quantas = 1; quantas * largura <= larguraTecido; quantas++) {
      const cols = Math.ceil((quantas * largura) / passo);
      if (cols >= colsUtil) break;
      const faixaEsquerda = cols * passo;
      const faixaDireita = (colsUtil - cols) * passo;
      // A faixa da direita precisa servir para alguma coisa...
      if (faixaDireita < maisEstreita) continue;
      // ...e a peça mais larga precisa caber em alguma das duas, senão essa
      // divisão nasce condenada a deixar peça de fora.
      if (Math.max(faixaEsquerda, faixaDireita) < maisLarga) continue;
      cortes.add(cols);
    }
  });

  // Divisões equilibradas primeiro. A outra ideia — cortar onde couber o maior
  // número de peças grandes por fileira — foi medida e saiu bem pior (26%
  // contra 5% de perda no mesmo trabalho).
  return [...cortes]
    .sort((a, b) => Math.abs(colsUtil / 2 - a) - Math.abs(colsUtil / 2 - b))
    .slice(0, 3);
}

/**
 * Reparte as unidades entre as duas faixas.
 *
 * Quem só cabe de um lado vai para lá sem conversa. Quem cabe nos dois vai
 * para a faixa que estiver mais vazia — assim as duas terminam mais ou menos
 * na mesma altura, que é o que faz o rolo render.
 */
function repartirEntreFaixas(unidades, colsEsquerda, colsDireita, passo) {
  const esquerda = [];
  const direita = [];
  let areaEsquerda = 0;
  let areaDireita = 0;
  const larguraEsq = colsEsquerda * passo;
  const larguraDir = colsDireita * passo;

  unidades.forEach((unidade) => {
    const largura = larguraDaUnidade(unidade, passo);
    const cabeEsq = largura <= larguraEsq;
    const cabeDir = largura <= larguraDir;
    if (!cabeEsq && !cabeDir) { esquerda.push(unidade); return; } // não cabe: sobra no relatório
    const area = unidade.formas[0].cols * unidade.formas[0].rows * passo * passo;

    let vaiParaEsquerda;
    if (cabeEsq !== cabeDir) vaiParaEsquerda = cabeEsq;
    else vaiParaEsquerda = (areaEsquerda / larguraEsq) <= (areaDireita / larguraDir);

    if (vaiParaEsquerda) { esquerda.push(unidade); areaEsquerda += area; }
    else { direita.push(unidade); areaDireita += area; }
  });

  return { esquerda, direita };
}

function encaixarPorFaixas(unidades, config) {
  const { passo, margem, larguraTecido, corteCols } = config;
  const colsUtil = Math.max(1, Math.floor((larguraTecido - margem * 2) / passo));
  const colsDireita = colsUtil - corteCols;
  if (corteCols <= 0 || colsDireita <= 0) {
    return { posicoes: [], naoEncaixadas: unidades.flatMap((u) => u.itens), consumo: 0, areaReal: 0 };
  }

  const { esquerda, direita } = repartirEntreFaixas(unidades, corteCols, colsDireita, passo);

  // As faixas dividem a mesma folga de borda do rolo: a margem entra uma vez
  // só, na conta do tecido, e não uma vez por faixa.
  const naEsquerda = encaixarContorno(esquerda, { ...config, colsForcado: corteCols });
  const naDireita = encaixarContorno(direita, { ...config, colsForcado: colsDireita });

  const deslocamento = corteCols * passo;
  naDireita.posicoes.forEach((p) => { p.x += deslocamento; });

  // O pior das duas faixas, para o mesmo reparo guiado que o contorno simples
  // já expõe (ver `encaixarContorno`).
  const piorEsquerda = naEsquerda.piorVazio ?? -Infinity;
  const piorDireita = naDireita.piorVazio ?? -Infinity;

  return {
    posicoes: [...naEsquerda.posicoes, ...naDireita.posicoes],
    naoEncaixadas: [...naEsquerda.naoEncaixadas, ...naDireita.naoEncaixadas],
    consumo: Math.max(naEsquerda.consumo, naDireita.consumo),
    areaReal: naEsquerda.areaReal + naDireita.areaReal,
    piorUnidade: piorEsquerda >= piorDireita ? naEsquerda.piorUnidade : naDireita.piorUnidade,
    piorVazio: Math.max(piorEsquerda, piorDireita),
  };
}

// ==================== BUSCA QUE APRENDE ====================

/**
 * A busca é uma só para os dois encaixadores.
 *
 * Cada tentativa segue uma "receita": qual encaixador usar, se as peças
 * repetidas entram em dupla, em que ordem elas entram e qual critério de
 * posição vale. Existem poucas receitas base; o que muda de uma tentativa para
 * outra é a ordem embaralhada, porque o encaixe é guloso e uma peça mal
 * posicionada no começo estraga tudo que vem depois.
 *
 * A busca não para num tempo fixo: ela continua enquanto estiver achando
 * encaixe melhor, e só entrega quando empaca (nenhum ganho em muitas
 * tentativas seguidas), quando bate o teto de tempo, ou quando a pessoa manda
 * parar.
 *
 * O que ela aprende, e que mais pesa, é o **recorde de cada tipo de
 * trabalho**: sabendo que um encaixe parecido já saiu com 5,32 m, ela não se
 * contenta com 5,40 m — segue procurando até alcançar aquilo (ou bater o teto
 * de tempo). Na prática é isso que faz o resultado melhorar a cada encaixe
 * feito, em vez de depender da sorte da vez.
 *
 * O placar das receitas também é anotado, mas serve para uma coisa só:
 * ordenar a passada base, para quem manda parar cedo já levar o melhor. Ele
 * **não** enviesa o sorteio das tentativas seguintes — medindo, isso não
 * rendia nada e ainda chegava a piorar o resultado, porque insistir nas
 * receitas que ganharam antes sufoca a variação que acharia algo melhor
 * desta vez. O sorteio é parelho de propósito.
 */

const HEURISTICAS_CONTORNO = ["fundo", "vazio"];
// Os blocos que disputam por padrão. `config.agrupamentos` troca a lista.
//
// O trio entrou por medição: somando quatro trabalhos, com 5 fatias de 5 s e
// duas sementes, deu 47,330 m sem ele contra 46,500 m com ele — 1,75% menos
// tecido, e a receita `contorno/trio/…` venceu em 4 das 8 medições. Onde ele
// ganha, ganha muito: só camiseta 5,763 → 5,540 m, calça+bolso 5,230 → 4,945 m.
//
// O quarteto também foi medido e ficou de fora: 46,483 m contra os 46,500 m do
// trio, ou seja, nada — e ele custa seis receitas a mais na passada base, que
// em lote grande é o orçamento inteiro. Continua disponível por
// `config.agrupamentos` para quem quiser estudar.
//
// "cruzada" é a dupla/trio entre formatos diferentes (ver
// `montarUnidadesCruzadas`): a manga entrando no vão da gola, não só no vão
// de outra manga. Ainda sem medição própria de bancada — entra na disputa
// como mais uma receita, e só vence quando o resultado dela for realmente
// menor; nunca deixa nada pior do que a receita "solta" já deixaria.
const AGRUPAMENTOS_PADRAO = ["dupla", "solta", "trio", "cruzada"];
const HEURISTICAS_RETANGULO = ["bl", "bssf", "blsf", "baf"];

/**
 * A que FAMÍLIA a unidade pertence: quais formatos de peça estão dentro dela.
 *
 * Duas cópias da mesma camiseta são a mesma família; uma dupla de camisetas
 * também; a unidade cruzada de manga com gola é uma família própria, porque
 * ela ladrilha o tecido de um jeito só dela.
 *
 * Fica guardada na unidade na primeira vez que é pedida: a ordenação e a
 * sacudida chamam isto a cada tentativa, e montar o texto toda vez apareceria
 * no perfil.
 */
function familiaDaUnidade(unidade) {
  if (unidade._familia == null) {
    unidade._familia = unidade.itens.map((i) => i.indice).sort((a, b) => a - b).join("-");
  }
  return unidade._familia;
}

const ORDENS_CONTORNO = [
  { nome: "area", comparar: (a, b) => tamanhoDaUnidade(b) - tamanhoDaUnidade(a) },
  { nome: "altura", comparar: (a, b) => alturaDaUnidade(b) - alturaDaUnidade(a) },
  { nome: "lado", comparar: (a, b) => ladoDaUnidade(b) - ladoDaUnidade(a) },
  /*
   * Família: todas as peças de um formato entram GRUDADAS, e só depois começa
   * o formato seguinte.
   *
   * Veio de uma observação de produção: separando o pedido por silhueta
   * parecida e encaixando um arquivo de cada vez, o total deu menos do que
   * encaixar tudo junto. Só que separar de verdade custa uma margem de borda
   * por arquivo e joga fora a chance de a peça pequena cair no vão da grande.
   * Esta ordem é o meio-termo: **um encaixe só**, com as famílias entrando em
   * bloco em vez de misturadas.
   *
   * O tamanho manda na ordem das famílias (a que ocupa mais tecido primeiro,
   * como em "area"); o desempate por nome da família é o que garante que duas
   * famílias de tamanho igual não fiquem intercaladas — sem ele, a ordenação
   * do JavaScript pode alternar as duas e a ordem deixa de ser por família.
   *
   * Quem mantém isso de pé ao longo da busca é `baguncarFamilias`: sacudir
   * unidade por unidade desmancharia o bloco na primeira tentativa.
   *
   * **Medido na bancada: empate.** Somando os seis trabalhos, 25,892 m com ela
   * contra 25,845 m sem — 0,18%, dentro dos 0,23% que duas corridas iguais já
   * variam sozinhas. E ela não venceu nenhum dos seis: quem ganha ali continua
   * sendo `area`, `altura` ou `lado`.
   *
   * Isso NÃO quer dizer que a ideia esteja errada, e é importante não ler
   * assim. As peças da bancada são sintéticas e de tamanho parecido; forçadas
   * a rodar só com esta ordem, elas gastam ~10% mais tecido (2,505 m contra
   * 2,265 m em "misturado pequeno"), o mesmo que dá encaixar cada formato em
   * arquivo separado. Ou seja: **a bancada não reproduz o caso em que a
   * observação de produção nasceu** — um pedido com mistura de tamanhos bem
   * mais desigual, em que agrupar rendeu menos metragem do que misturar.
   *
   * Ela fica na disputa porque é assim que este motor trata ideia de
   * agrupamento desde a dupla: entra como candidata, custa duas receitas
   * (só com a peça solta) e só leva o trabalho quando o resultado dela for
   * mesmo menor. Para tirá-la de vez, `config.ordens` sem "familia".
   */
  {
    nome: "familia",
    porFamilia: true,
    comparar: (a, b) => {
      const porTamanho = tamanhoDaUnidade(b) - tamanhoDaUnidade(a);
      if (porTamanho !== 0) return porTamanho;
      const fa = familiaDaUnidade(a);
      const fb = familiaDaUnidade(b);
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    },
  },
];

const ORDENS_RETANGULO = [
  { nome: "area", comparar: (a, b) => b.largura * b.altura - a.largura * a.altura },
  { nome: "altura", comparar: (a, b) => b.altura - a.altura || b.largura - a.largura },
  { nome: "largura", comparar: (a, b) => b.largura - a.largura || b.altura - a.altura },
  { nome: "lado", comparar: (a, b) => Math.max(b.largura, b.altura) - Math.max(a.largura, a.altura) },
];

const tamanhoDaUnidade = (u) => u.formas.reduce((maior, f) => Math.max(maior, f.cols * f.rows), 0);
const alturaDaUnidade = (u) => u.formas.reduce((maior, f) => Math.max(maior, f.rows), 0);
const ladoDaUnidade = (u) => u.formas.reduce((maior, f) => Math.max(maior, f.cols, f.rows), 0);

const chaveDaReceita = (r) =>
  [r.motor, r.agrupamento, r.ordem, r.heuristica, r.corte == null ? "" : r.corte].join("/");

// Abaixo desta pontuação (a chance de ganhar, segundo a rede — ver
// encaixe-rede.js) uma receita para de entrar na disputa, quando a rede já
// tiver visto trabalho suficiente para a opinião dela valer algo (ver
// `config.redeMadura`, decidido no servidor por `encaixe-memoria.js`).
const REDE_CORTE_LIMIAR = 0.05;

/**
 * Tira da disputa as receitas que a rede julga sem chance nenhuma — mas nunca
 * um motor inteiro: se NENHUMA receita de um motor passou do corte, é sinal
 * de que a rede não tem opinião boa nenhuma para aquele motor neste trabalho,
 * e cortar todas deixaria o motor de fora sem ter tido chance.
 */
function filtrarPorRede(base, pontos, limiar) {
  const porMotor = new Map();
  base.forEach((r) => {
    if (!porMotor.has(r.motor)) porMotor.set(r.motor, []);
    porMotor.get(r.motor).push(r);
  });
  const saida = [];
  porMotor.forEach((receitasDoMotor) => {
    const acimaDoCorte = receitasDoMotor.filter((r) => pontos.get(chaveDaReceita(r)) >= limiar);
    (acimaDoCorte.length > 0 ? acimaDoCorte : receitasDoMotor).forEach((r) => saida.push(r));
  });
  return saida;
}

/** Todas as receitas base, sem embaralhar nada ainda. */
function receitasBase(motores, temGiroLivre, cortes = [], agrupamentos = AGRUPAMENTOS_PADRAO,
  ordens = ORDENS_CONTORNO) {
  const receitas = [];
  if (motores.includes("contorno")) {
    agrupamentos.forEach((agrupamento) => {
      ordens.forEach((ordem) => {
        // A ordem por família só entra com a peça SOLTA, e não em todo
        // agrupamento.
        //
        // Não é economia à toa: dupla, trio e cruzada já são blocos de peça
        // igual, e ordenar blocos iguais por família dá quase a mesma fila que
        // ordenar por área. O que sobraria de diferente não paga o preço —
        // medido na bancada, com a família em todos os agrupamentos o
        // portfólio ganhou 8 receitas e a busca perdeu 12% das tentativas
        // (93 mil contra 107 mil em camiseta+manga+gola), sem que a família
        // vencesse nenhum dos seis trabalhos. Presa à solta, ela custa duas
        // receitas e continua disponível para o trabalho em que ganhar.
        if (ordem.porFamilia && agrupamento !== "solta") return;
        HEURISTICAS_CONTORNO.forEach((heuristica) => {
          receitas.push({ motor: "contorno", agrupamento, ordem: ordem.nome, heuristica });
        });
      });
    });
  }
  if (motores.includes("retangulo")) {
    // "deitada" só faz sentido quando alguma peça aceita virar 90°.
    (temGiroLivre ? ["deitada", "empe"] : ["empe"]).forEach((agrupamento) => {
      ORDENS_RETANGULO.forEach((ordem) => {
        HEURISTICAS_RETANGULO.forEach((heuristica) => {
          receitas.push({ motor: "retangulo", agrupamento, ordem: ordem.nome, heuristica });
        });
      });
    });
  }
  if (motores.includes("vaos")) {
    // Mesmas ordens do contorno, e uma heurística só: o "vazio" precisaria da
    // conta de espaço livre por posição, que aqui sairia caro demais.
    agrupamentos.forEach((agrupamento) => {
      ordens.forEach((ordem) => {
        if (ordem.porFamilia && agrupamento !== "solta") return;
        receitas.push({ motor: "vaos", agrupamento, ordem: ordem.nome, heuristica: "fundo" });
      });
    });
  }
  if (motores.includes("faixas")) {
    // Uma receita por divisão candidata. O agrupamento em dupla é o que faz a
    // faixa render, então só ele entra aqui.
    cortes.forEach((corte) => {
      ordens.forEach((ordem) => {
        if (ordem.porFamilia) return; // a faixa parte sempre da dupla; ver acima
        HEURISTICAS_CONTORNO.forEach((heuristica) => {
          receitas.push({ motor: "faixas", agrupamento: "dupla", ordem: ordem.nome, heuristica, corte });
        });
      });
    });
  }
  return receitas;
}

/**
 * Identifica o tipo de trabalho, para a memória saber com o que comparar.
 *
 * Não entra nome nem quantidade de peça: o que decide qual receita funciona é
 * o formato — quanto a peça preenche a caixa dela e se é comprida ou quadrada.
 * Por isso dois pedidos diferentes com peças parecidas compartilham o que foi
 * aprendido.
 */
function assinaturaDoTrabalho(pecas, larguraTecido) {
  const formatos = pecas.map((p) => {
    const ocupacao = p.ocupacao == null ? 1 : p.ocupacao;
    const proporcao = p.altura > 0 ? p.largura / p.altura : 1;
    return `${Math.round(ocupacao * 10)}:${Math.round(Math.log2(proporcao) * 2)}`;
  }).sort();
  return `l${Math.round(larguraTecido / 10)}|${formatos.join(",")}`;
}

/** Embaralha um pouco a ordem: troca alguns pares de lugar. */
function baguncar(lista, sortear, forca) {
  const saida = lista.slice();
  const trocas = Math.max(1, Math.round(saida.length * forca));
  for (let t = 0; t < trocas; t++) {
    const i = Math.floor(sortear() * saida.length);
    const j = Math.floor(sortear() * saida.length);
    const guarda = saida[i];
    saida[i] = saida[j];
    saida[j] = guarda;
  }
  return saida;
}

/**
 * Sacode a fila trocando FAMÍLIAS de lugar, e não peças.
 *
 * É o par da ordem "familia": o que se procura ali é a melhor **sequência de
 * formatos** — primeiro as camisetas, depois as mangas, depois as golas, ou
 * qualquer outra ordem —, mantendo cada formato inteiro no seu bloco.
 *
 * O espaço de busca fica pequeno de propósito: com cinco formatos são 120
 * sequências, e a busca acaba visitando todas. Isso é a força desta receita,
 * não a fraqueza — ela entrega o melhor encaixe POR FAMÍLIA que existe, e
 * quem procura o encaixe misturado são as outras cinco receitas que correm ao
 * lado. Sacudir dentro do bloco não teria sentido: as unidades de uma família
 * são iguais entre si, e trocá-las de lugar dá exatamente o mesmo encaixe.
 */
function baguncarFamilias(lista, sortear, forca) {
  const blocos = [];
  lista.forEach((unidade) => {
    const chave = familiaDaUnidade(unidade);
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.unidades.push(unidade);
    else blocos.push({ chave, unidades: [unidade] });
  });
  if (blocos.length < 2) return lista.slice();
  // A força é a mesma do resto da busca, mas com um piso: com poucos blocos,
  // `forca` pequena arredondaria para zero troca e a tentativa sairia idêntica
  // à anterior.
  const trocados = baguncar(blocos, sortear, Math.max(forca, 1 / blocos.length));
  const saida = [];
  trocados.forEach((bloco) => bloco.unidades.forEach((u) => saida.push(u)));
  return saida;
}

/**
 * Tira algumas unidades de onde estão e devolve cada uma num lugar sorteado.
 *
 * É o outro jeito de mexer na fila, e ele conserva o que a troca de pares
 * estraga: a ORDEM RELATIVA de todo o resto. Numa fila que alimenta um encaixe
 * guloso, a posição de uma peça vale menos do que quem vem antes dela — trocar
 * duas peças distantes de lugar mexe na vizinhança das duas de uma vez, e uma
 * fila que estava quase boa vira outra fila. Tirar uma peça e recolocá-la mexe
 * numa vizinhança só.
 *
 * **Medido, e deu empate — por isso vem desligada.** Na bancada
 * (`bancada/medir.js`, 6 trabalhos, 5 fatias × 3 s × 3 sementes), com a
 * reinserção valendo em metade das sacudidas, a soma dos seis trabalhos ficou
 * em **+0,10%** — e a bancada repete a mesma configuração dentro de 0,23%, ou
 * seja, isso é ruído, não resultado. Os trabalhos separados não ajudam a
 * decidir: −0,90% em camiseta+manga+gola e −1,71% em quase-retângulo contra
 * +0,50% em lote grande e +0,22% em misturado pequeno, tudo na mesma ordem de
 * grandeza do que duas corridas idênticas já variam sozinhas.
 *
 * Foi tentado também o caminho de sempre para esse tipo de empate: metade das
 * fatias de um jeito, metade do outro, como já se faz com a varredura exata
 * contra a que pula. Também deu em nada (+0,05%), e pelo motivo que a varredura
 * não tem — o portfólio de receitas já está repartido entre as fatias, então
 * dividir de novo por operador só tira tentativa de cada lado sem cobrir nada
 * de novo.
 *
 * Fica no motor, atrás de `config.reinsercaoChance` (0 por padrão), para não
 * ser reinventada sem medir: `node bancada/medir.js --extra reinsercaoChance=0.5`.
 *
 * Não substitui `baguncar` quando ligada: os dois são sorteados, porque a
 * troca de pares alcança arranjos que a reinserção não alcança (ela nunca
 * inverte duas peças vizinhas mantendo o resto parado).
 */
function reinserir(lista, sortear, forca) {
  const saida = lista.slice();
  const quantas = Math.max(1, Math.round(saida.length * forca));
  for (let t = 0; t < quantas; t++) {
    const de = Math.floor(sortear() * saida.length);
    const peca = saida.splice(de, 1)[0];
    const para = Math.floor(sortear() * (saida.length + 1));
    saida.splice(para, 0, peca);
  }
  return saida;
}

/**
 * Tira `alvo` de onde está e devolve ela mais cedo na fila, num lugar
 * sorteado entre o começo e a posição em que ela estava.
 *
 * É o reparo guiado: em vez de sacudir a ordem inteira sem direção, mexe só
 * na peça que se sabe que ficou mal na última tentativa — a que sobrou mais
 * buraco morto (ver `piorUnidade` em `encaixarContorno`). Entrar mais cedo dá
 * a ela a chance de escolher uma posição melhor, antes que o relevo do
 * tecido já esteja mais ocupado. Se `alvo` não estiver na lista (receita
 * diferente da que gerou o `piorUnidade`), devolve a lista como está.
 */
function repararPior(lista, alvo, sortear) {
  const de = lista.indexOf(alvo);
  if (de <= 0) return lista.slice();
  const saida = lista.slice();
  saida.splice(de, 1);
  const para = Math.floor(sortear() * de);
  saida.splice(para, 0, alvo);
  return saida;
}

const melhorQue = (candidato, atual) => {
  if (!atual) return true;
  if (candidato.naoEncaixadas.length !== atual.naoEncaixadas.length) {
    return candidato.naoEncaixadas.length < atual.naoEncaixadas.length;
  }
  return candidato.consumo < atual.consumo;
};

/**
 * Procura o melhor encaixe possível dentro do que for permitido parar.
 *
 * `config.aoProgredir` é chamado a cada rodada com o andamento, e
 * `config.deveParar()` deixa a pessoa encerrar e ficar com o melhor até ali.
 * `config.memoria` traz o que foi aprendido antes: `{ receita: {usos, vitorias} }`.
 */
async function buscarMelhorEncaixe(itens, config) {
  const motores = config.motores || ["contorno", "retangulo"];
  const temGiroLivre = itens.some(podeDeitar);
  const memoria = config.memoria || {};

  // Meta de aproveitamento (opcional): em vez de só perseguir o recorde da
  // memória, a busca pode mirar um número fixo — "não desiste enquanto não
  // bater 95%, mas se não bater fica com o melhor que achou". Convertida para
  // consumo (a mesma conta que a tela usa para mostrar o aproveitamento:
  // areaReal / (larguraTecido * consumo)) para poder ser comparada direto com
  // `melhor.consumo`, sem esperar nenhuma tentativa terminar.
  //
  // Fica de fora por padrão — só entra quando `config.metaAproveitamento` é
  // passado — porque muda *quando a busca para*, e isso não se troca sem medir.
  const metaFracao = config.metaAproveitamento > 0 && config.metaAproveitamento <= 1
    ? config.metaAproveitamento : null;
  const areaTotalItens = metaFracao
    ? itens.reduce((soma, it) => soma + (it.mascaras ? it.mascaras.areaReal : 0), 0)
    : 0;
  const metaConsumo = metaFracao && config.larguraTecido > 0
    ? areaTotalItens / (config.larguraTecido * metaFracao)
    : null;
  // Só conta como "bateu a meta" um encaixe que coube inteiro — do contrário a
  // busca comemoraria uma tentativa que sobrou peça de fora só porque, com
  // menos peça, o consumo caiu.
  //
  // O corte é contra `alvoDaPersistencia` (definido mais abaixo), não contra
  // `metaConsumo` sozinho: comparar só com a meta fixa foi um bug real — um
  // trabalho com recorde de 37 m parava em 40 m assim que cruzasse 95%,
  // porque a meta fixa nem olhava para o recorde já conhecido. `bateuAMeta`
  // só é chamada depois que `alvoDaPersistencia` já foi calculada (a
  // primeira chamada é lá na passada base), então a referência aqui em cima,
  // apesar de vir antes no arquivo, resolve certa quando é usada de verdade.
  const bateuAMeta = () => metaConsumo != null && melhor && melhor.naoEncaixadas.length === 0 &&
    melhor.consumo <= alvoDaPersistencia * 1.0001;

  // Preparo pesado feito uma vez só e reaproveitado em toda tentativa.
  //
  // Quais blocos entram na disputa. O trio empaca mais apertado que a dupla
  // (ver `formasDoBloco`), mas bloco maior é mais difícil de posicionar: quem
  // decide é o resultado, e por isso os dois correm.
  let agrupamentos = config.agrupamentos || AGRUPAMENTOS_PADRAO;
  const unidades = {};
  if (motores.includes("contorno") || motores.includes("faixas") || motores.includes("vaos")) {
    agrupamentos.forEach((nome) => {
      unidades[nome] = nome === "cruzada"
        ? montarUnidadesCruzadas(itens)
        : montarUnidades(itens, TAMANHO_DO_AGRUPAMENTO[nome] || 1);
    });
    // Sem par que valha a pena, a "cruzada" fica idêntica à "solta" — e
    // rodar as duas cobraria seis receitas de busca inteiras por nada. Nesse
    // caso ela nem entra na disputa (ver `montarUnidadesCruzadas`).
    if (unidades.cruzada === null) {
      agrupamentos = agrupamentos.filter((nome) => nome !== "cruzada");
      delete unidades.cruzada;
    }
    // O encaixe por faixas parte sempre da dupla, esteja ela na disputa ou não.
    if (!unidades.dupla) unidades.dupla = montarUnidades(itens, 2);
  }
  const cortes = motores.includes("faixas") ? cortesDeFaixa(unidades.dupla, config) : [];
  const listasRetangulo = {};
  if (motores.includes("retangulo")) {
    listasRetangulo.deitada = itens;
    listasRetangulo.empe = itens.map((i) => ({ ...i, giro: "fixa" }));
  }

  /**
   * De qual lista de peças a receita parte, e como ela ordena essa lista.
   *
   * A chave junta as receitas que trabalham com o mesmo tipo de lista, porque
   * é entre elas que dá para aproveitar uma ordem descoberta por outra: o
   * encaixe por contorno e o por faixas mexem nas mesmas unidades, então uma
   * ordem boa achada por um serve para o outro.
   */
  const listaDaReceita = (receita) => {
    if (receita.motor === "retangulo") {
      return { chave: "retangulo/" + receita.agrupamento, crua: listasRetangulo[receita.agrupamento],
        ordem: ORDENS_RETANGULO.find((o) => o.nome === receita.ordem) };
    }
    const ordem = ORDENS_CONTORNO.find((o) => o.nome === receita.ordem);
    // A ordem por família tem balde próprio de "melhor ordem já vista". Sem
    // isso ela retomaria de uma ordem misturada descoberta por outra receita, e
    // a primeira sacudida a picaria em blocos de uma unidade — a receita
    // deixaria de ser por família sem ninguém perceber.
    const chave = "unidades/" + receita.agrupamento + (ordem && ordem.porFamilia ? "/familia" : "");
    return { chave, crua: unidades[receita.agrupamento], ordem };
  };

  /**
   * A melhor ordem de peças já encontrada para cada tipo de lista.
   *
   * Antes isto não existia, e era o buraco da busca: **toda** tentativa partia
   * da lista ordenada e sacudia a partir dela. A busca lembrava qual receita
   * ia bem, mas não lembrava *onde* estava o bom encaixe — achava uma ordem
   * ótima, guardava só o desenho pronto, e no lance seguinte voltava para a
   * estaca zero. Não havia para onde voltar.
   *
   * Guardando a ordem, a busca passa a poder retomar de um lugar que já se
   * provou bom e mexer pouquinho ali. É o que o modo "refinar" faz.
   */
  const melhoresOrdens = new Map(); // chave -> { lista, consumo }

  /** O encaixador da receita, na lista que vier. */
  const rodarNaLista = (receita, lista) => {
    if (receita.motor === "faixas") {
      return encaixarPorFaixas(lista, {
        ...config, heuristica: receita.heuristica, corteCols: receita.corte,
      });
    }
    if (receita.motor === "vaos") {
      return encaixarPorVaos(lista, { ...config, heuristica: receita.heuristica });
    }
    if (receita.motor === "contorno") {
      return encaixarContorno(lista, { ...config, heuristica: receita.heuristica });
    }
    return encaixar(lista, { ...config, heuristica: receita.heuristica });
  };

  const rodar = (receita, embaralhar, partirDoMelhor) => {
    const base = listaDaReceita(receita);
    const guardada = partirDoMelhor ? melhoresOrdens.get(base.chave) : null;
    let lista = guardada ? guardada.lista.slice() : base.crua.slice().sort(base.ordem.comparar);
    if (embaralhar) lista = embaralhar(lista, guardada, base.ordem);

    const resultado = rodarNaLista(receita, lista);
    // Fica anotado de onde este resultado saiu, para a ordem ser guardada se
    // ele for bom.
    resultado.ordemUsada = lista;
    resultado.chaveDaLista = base.chave;
    return resultado;
  };

  // Peso de cada receita: começa no que a memória já sabe e vai sendo corrigido
  // pelo que estiver acontecendo nesta execução.
  // `config.ordens` deixa a bancada medir o motor com e sem uma ordem — hoje é
  // como a "familia" foi posta à prova. Nome desconhecido é ignorado em vez de
  // derrubar a busca.
  // Aceita lista ou texto separado por "+" — a bancada passa pela linha de
  // comando, onde lista não existe (`--extra ordens=area+familia`).
  const ordensPedidas = typeof config.ordens === "string"
    ? config.ordens.split("+") : config.ordens;
  const ordens = Array.isArray(ordensPedidas) && ordensPedidas.length > 0
    ? ORDENS_CONTORNO.filter((o) => ordensPedidas.includes(o.nome))
    : ORDENS_CONTORNO;
  let base = receitasBase(motores, temGiroLivre, cortes, agrupamentos,
    ordens.length > 0 ? ordens : ORDENS_CONTORNO);
  // Um motor pode não ter receita nenhuma para este trabalho — o de faixas,
  // por exemplo, quando todas as peças têm a mesma largura e não há onde
  // dividir o rolo. Sem isto, a busca sorteava de uma lista vazia e quebrava.
  // Cai no contorno, que é o motor cujas unidades já foram preparadas aqui em
  // cima junto com as do de faixas.
  if (base.length === 0) base = receitasBase(["contorno"], temGiroLivre, [], agrupamentos, ordens);

  // A rede das receitas (opcional — ver encaixe-rede.js): pontua cada
  // candidata pela chance dela ganhar ESTE trabalho, generalizando a partir
  // do formato das peças em vez de só do balde exato da assinatura. Precisa
  // vir antes da fatia do portfólio: cortar cedo é o que evita gastar um
  // worker inteiro numa receita que a rede já sabe que não tem chance.
  const pontosDaRede = config.rede && config.vetorTrabalho
    ? pontuarReceitas(config.rede, config.vetorTrabalho, base.map(chaveDaReceita))
    : null;
  if (pontosDaRede && config.redeMadura) base = filtrarPorRede(base, pontosDaRede, REDE_CORTE_LIMIAR);

  // Fatia do portfólio que cabe a esta busca. Rodando em paralelo (ver
  // encaixe-paralelo.js), cada worker recebe `{ k, n }` e fica com as receitas
  // de índice k, k+n, k+2n… — assim as N buscas cobrem o portfólio inteiro uma
  // vez só, em vez de N cópias repetindo o mesmo trabalho.
  //
  // A partir daqui esta busca não sabe que existem outras: o placar, a poda e
  // o sorteio da melhoria trabalham só com a fatia dela. Quem junta o melhor
  // de cada uma é o orquestrador.
  //
  // Fatia que sairia vazia (portfólio menor que o número de workers) fica com
  // o portfólio inteiro: melhor repetir trabalho que ficar sem resultado.
  const fatia = config.fatia;
  if (fatia && fatia.n > 1) {
    const minha = base.filter((_, i) => i % fatia.n === fatia.k);
    if (minha.length > 0) base = minha;
  }

  const placar = new Map();
  base.forEach((receita) => {
    const chave = chaveDaReceita(receita);
    const antes = memoria[chave] || { usos: 0, vitorias: 0 };
    const historicoDoBalde = antes.usos > 0 ? antes.vitorias / antes.usos : 0;
    // O maior entre o placar do balde exato e o palpite da rede: o balde só
    // enxerga trabalho idêntico a um já visto, a rede enxerga parecido — cada
    // um cobre o buraco do outro, e nenhum dos dois piora o que o outro já
    // sabia.
    const pontoRede = pontosDaRede ? pontosDaRede.get(chave) : null;
    const historico = pontoRede != null ? Math.max(historicoDoBalde, pontoRede) : historicoDoBalde;
    placar.set(chave, { receita, historico, tentativas: 0, vitorias: 0, melhorConsumo: Infinity });
  });

  // Peso só para ordenar a passada base. No sorteio das tentativas seguintes
  // todas as receitas valem igual: ver acima por que insistir nas vencedoras
  // atrapalha.
  const pesoDe = (linha) => 1 + linha.historico * 4;

  /**
   * Quais receitas continuam na roda depois da passada base.
   *
   * Insistir na receita que ganhou *antes* atrapalha (está explicado acima),
   * mas largar a que está perdendo *agora* é outra coisa: se uma receita já
   * mostrou o que sabe fazer e ficou 6% atrás, o tempo dela rende mais na mão
   * das outras. É isso que deixa acrescentar mais um encaixador — faixas, ou o
   * que vier — sem que o orçamento de tempo se dilua entre receitas que este
   * trabalho já mostrou que não servem.
   *
   * Receita que ainda não rodou nenhuma vez nunca é largada: ela não teve a
   * chance dela. E uma fresta do sorteio continua indo para a lista inteira,
   * porque a passada base roda cada receita **sem embaralhar** — uma receita
   * pode ir mal na ordem crua e ser a melhor com as peças sacudidas. Sem essa
   * fresta, um dos trabalhos de teste piorou 4,5%.
   */
  const PODA_TOLERANCIA = 1.06;  // até 6% acima do melhor continua na roda
  const PODA_MINIMO = 4;         // nunca deixa a roda com menos que isso
  const PODA_FRESTA = 0.15;      // parte do sorteio que ignora a poda
  // Chance de, ao refinar, reparar a peça que mais atrapalhou em vez de
  // sacudir a ordem toda sem direção (ver `repararPior`). Só refinando: em
  // "explorar" ainda não existe uma ordem-base cujo pior valha a pena mirar.
  //
  // `config.reparoChance` existe para a bancada poder desligar o reparo e
  // medir o motor com e sem ele na MESMA versão do código — sem isso, comparar
  // exigiria voltar o repositório no tempo, e aí a medição pegaria junto tudo
  // o mais que tivesse mudado.
  const REPARO_CHANCE = config.reparoChance != null ? config.reparoChance : 0.3;
  // Chance de sacudir a fila por reinserção em vez de troca de pares. Zero por
  // padrão: foi medido e não compensou — o porquê está no cabeçalho de
  // `reinserir`, junto com o comando para remedir.
  const REINSERCAO_CHANCE = config.reinsercaoChance != null ? config.reinsercaoChance : 0;

  const receitasNaRoda = () => {
    const linhas = [...placar.values()];
    if (config.podar === false || !melhor || linhas.length <= PODA_MINIMO) return linhas;
    const limite = melhor.consumo * PODA_TOLERANCIA;
    const vivas = linhas.filter((l) => l.tentativas === 0 || l.melhorConsumo <= limite);
    if (vivas.length >= PODA_MINIMO) return vivas;
    return linhas.slice().sort((a, b) => a.melhorConsumo - b.melhorConsumo).slice(0, PODA_MINIMO);
  };

  let melhor = null;
  let melhorChave = null;
  let receitaVencedora = null;
  let tentativas = 0;
  let semGanho = 0;
  let perseguindo = false;
  // Quantas vezes a busca empacou e teve de mudar de caminho, e em que modo
  // ela está agora. Ver o laço de melhoria adiante.
  let paredes = 0;
  // Começa explorando, que é exatamente o que a busca fazia antes de existir a
  // parede. Isso importa: até a primeira parede, nada muda — mesma sequência
  // de sorteios, mesmas tentativas, mesmo resultado. O modo "refinar" só entra
  // depois, no tempo que antes era devolvido sem uso. Assim o acréscimo só
  // pode somar, nunca tirar.
  //
  // Já tentei começar refinando, achando que colar no melhor desde o início
  // renderia mais. Sai **0,34% pior** de tecido: sem uma boa volta de
  // exploração antes, a busca cola cedo demais num encaixe mediano e gasta o
  // resto do tempo lapidando ele. Medido nos quatro trabalhos de teste. Não
  // vale tentar de novo.
  let modo = "explorar";
  const inicio = Date.now();
  let ultimoGanhoEm = inicio;
  // Recorde de encaixes parecidos: enquanto não alcançar, não desiste por
  // falta de ganho. É o que impede entregar pior do que já se sabe fazer.
  const alvo = config.alvo > 0 ? config.alvo : null;
  // O que a busca persegue de fato: o mais exigente entre o recorde da
  // memória e a meta de aproveitamento — consumo menor é mais difícil de
  // alcançar, então o menor dos dois manda. Perseguir o mais apertado dos
  // dois já cobre o outro: quem bate o mais exigente bate os dois.
  const alvoDaPersistencia = alvo != null && metaConsumo != null ? Math.min(alvo, metaConsumo)
    : alvo != null ? alvo : metaConsumo;
  const historicoDeGanhos = [];

  // O melhor de cada motor, para a tela poder dizer quanto o outro teria
  // gasto. Sem isso, "usei o retângulo" fica sendo só uma afirmação.
  const melhorDeCadaMotor = new Map();

  /**
   * Guarda a ordem de peças deste resultado, se ela for a melhor já vista para
   * o tipo de lista dela.
   *
   * Só entra encaixe que coube inteiro: uma ordem que deixou peça de fora
   * gasta menos tecido por não ter encaixado tudo, e virar ponto de partida
   * seria ancorar a busca num lugar ruim disfarçado de bom.
   */
  const guardarOrdem = (resultado) => {
    if (!resultado.chaveDaLista || resultado.naoEncaixadas.length > 0) return;
    const antes = melhoresOrdens.get(resultado.chaveDaLista);
    if (!antes || resultado.consumo < antes.consumo) {
      melhoresOrdens.set(resultado.chaveDaLista,
        { lista: resultado.ordemUsada, consumo: resultado.consumo, piorUnidade: resultado.piorUnidade });
    }
  };

  const considerar = (resultado, chave) => {
    tentativas++;
    guardarOrdem(resultado);
    const linha = placar.get(chave);
    if (linha) {
      linha.tentativas++;
      if (resultado.consumo < linha.melhorConsumo) linha.melhorConsumo = resultado.consumo;
    }
    // Só conta para o placar dos motores o encaixe que coube inteiro: uma
    // tentativa que deixou peça de fora gasta menos tecido por não ter
    // encaixado tudo, e apareceria na tela como se fosse a melhor.
    if (resultado.naoEncaixadas.length === 0) {
      const motor = String(chave).split("/")[0];
      const antes = melhorDeCadaMotor.get(motor);
      if (antes == null || resultado.consumo < antes) melhorDeCadaMotor.set(motor, resultado.consumo);
    }
    if (melhorQue(resultado, melhor)) {
      const anterior = melhor ? melhor.consumo : null;
      melhor = resultado;
      melhorChave = chave;
      receitaVencedora = linha ? linha.receita : null;
      if (linha) linha.vitorias++;
      semGanho = 0;
      ultimoGanhoEm = Date.now();
      if (anterior != null) historicoDeGanhos.push({ tentativa: tentativas, consumo: resultado.consumo });
      return true;
    }
    semGanho++;
    return false;
  };

  const tetoMs = config.tempoMaximoMs || 20000;

  const avisar = (fase) => {
    if (config.aoProgredir) {
      config.aoProgredir({
        fase: perseguindo ? "perseguindo" : fase,
        tentativas, semGanho, alvo, paredes, modo,
        consumo: melhor ? melhor.consumo : null,
        receita: melhorChave,
        // Vai junto no andamento, não só no resultado final, porque é o que
        // deixa a busca paralela (encaixe-paralelo.js) mandar as outras fatias
        // pararem assim que uma bater a meta — sem isso cada fatia só sabia da
        // própria conta, e a fatia mais lenta segurava as outras até o fim.
        alcancouMeta: bateuAMeta(),
        decorridoMs: Date.now() - inicio,
      });
    }
  };
  // Ceder a vez para a tela respirar entre as rodadas. Não dá para usar
  // setTimeout aqui: com a aba em segundo plano o navegador segura o timer em
  // um segundo, e a busca passaria o orçamento inteiro dormindo. O canal de
  // mensagens não sofre esse limite.
  const canal = new MessageChannel();
  const respirar = () => new Promise((pronto) => {
    canal.port1.onmessage = () => pronto();
    canal.port2.postMessage(0);
  });
  // Um canal aberto segura a thread viva. Na página o navegador acaba
  // recolhendo, mas o worker do pool é reaproveitado a cada encaixe, e sem
  // fechar aqui cada busca deixaria mais um canal pendurado. Apareceu na
  // bancada: os scripts de teste terminavam de imprimir o resultado e não
  // saíam — ficavam presos exatamente nisto.
  const fecharCanal = () => { canal.port1.close(); canal.port2.close(); };

  // 1) Passada base: toda receita uma vez, começando pelas que a memória
  // aponta como boas — assim, parar cedo já entrega algo decente.
  let ordenadasPorMemoria = base.slice().sort(
    (a, b) => pesoDe(placar.get(chaveDaReceita(b))) - pesoDe(placar.get(chaveDaReceita(a))));
  if (config.maxReceitasBase > 0) {
    ordenadasPorMemoria = ordenadasPorMemoria.slice(0, config.maxReceitasBase);
  }

  for (let i = 0; i < ordenadasPorMemoria.length; i++) {
    const receita = ordenadasPorMemoria[i];
    considerar(rodar(receita, null), chaveDaReceita(receita));
    // Bateu a meta já na passada base: não tem por que rodar as receitas que
    // faltam. Ver `bateuAMeta` para o que conta como bater.
    if (bateuAMeta()) break;

    // O tempo pedido também vale aqui. Em lote grande cada receita custa caro,
    // e sem esta parada a passada base sozinha estouraria o tempo — o campo da
    // tela estaria mentindo. Sempre sobra pelo menos uma receita rodada, então
    // nunca fica sem resultado.
    if (Date.now() - inicio >= tetoMs) break;

    if (i % 6 === 5) {
      avisar("base");
      await respirar();
      if (config.deveParar && config.deveParar()) break;
    }
  }
  avisar("base");

  // 2) Melhoria: sorteia receitas com peso e embaralha a ordem das peças.
  // Continua enquanto estiver rendendo.
  const sortear = geradorDeSorteio(config.semente || 20260824);
  // Desistir por número de tentativas trata mal encaixe grande: quando cada
  // tentativa custa 80 ms, 80 tentativas viram quase sete segundos de espera.
  // Contar o tempo desde a última melhora se ajusta sozinho ao tamanho do
  // trabalho — encaixe pequeno ganha centenas de tentativas, encaixe grande
  // para assim que empaca.
  const msSemGanho = config.msSemGanho || 1200;

  // Enquanto a poda estiver suspensa por causa de uma parede, todas as
  // receitas voltam para a roda. Ver "bater na parede" logo abaixo.
  let podaSuspensaAte = 0;

  while (Date.now() - inicio < tetoMs) {
    if (config.deveParar && config.deveParar()) break;
    if (bateuAMeta()) break;

    // O recorde é do *tipo* de trabalho, não deste trabalho exato: pode ter
    // vindo de um pedido parecido que simplesmente encaixa melhor, e aí ele é
    // inalcançável. Perseguindo até o fim do tempo, a busca sacode forte a
    // rodada inteira em vez de refinar o que já achou — medido, isso custou
    // 1,55% de tecido. Depois de gastar boa parte do tempo sem alcançar, ela
    // desiste do recorde e volta a refinar.
    const PRAZO_DE_PERSEGUIR = 0.6;   // parte do tempo dedicada à perseguição
    const faltaAlcancar = alvoDaPersistencia != null && melhor && melhor.consumo > alvoDaPersistencia * 1.0001;
    const aindaVale = Date.now() - inicio < tetoMs * PRAZO_DE_PERSEGUIR;
    perseguindo = faltaAlcancar && aindaVale;

    // ---------- BATER NA PAREDE ----------
    //
    // Passar `msSemGanho` sem melhorar nada quer dizer que este caminho deu no
    // que tinha de dar. Antes isso **encerrava a busca**, e o tempo que
    // sobrava do que a pessoa pediu era devolvido sem uso: pedir 30 segundos
    // rendia igual a pedir 5.
    //
    // Agora a parede não encerra, ela desvia. Três coisas mudam de uma vez:
    //
    //   1. o modo alterna entre refinar e explorar (explicado abaixo);
    //   2. a poda é suspensa por meio tempo de parede, devolvendo à roda as
    //      receitas que tinham sido cortadas — a que escapa do beco costuma
    //      ser justamente uma que ia mal antes de o beco aparecer;
    //   3. o relógio do ganho zera, dando ao caminho novo a mesma chance que o
    //      anterior teve.
    //
    // Quem encerra a busca passa a ser só o tempo pedido ou o botão de parar.
    // Para voltar ao antigo, `config.pararAoEmpacar` faz a parede encerrar de
    // novo, como antes.
    const paradoHa = Date.now() - ultimoGanhoEm;
    if (paradoHa > msSemGanho && !perseguindo) {
      if (config.pararAoEmpacar) break;
      paredes++;
      modo = modo === "refinar" ? "explorar" : "refinar";
      podaSuspensaAte = Date.now() + msSemGanho * 0.5;
      ultimoGanhoEm = Date.now();
    }

    const todas = [...placar.values()];
    // A poda vale também enquanto persegue um recorde. Deixá-la de lado ali
    // parecia certo — a receita capaz de alcançar podia ser uma das que foram
    // mal na passada base —, mas medindo saiu pior: perseguindo um recorde
    // inalcançável, a busca gastava o tempo todo em receita que este trabalho
    // já tinha reprovado. Quem cuida da variedade é a fresta do sorteio.
    const naRoda = Date.now() < podaSuspensaAte ? todas : receitasNaRoda();
    const tentativasNesteLote = Math.max(1, Number(config.tentativasPorLote) || 8);

    // ---------- OS DOIS MODOS ----------
    //
    // "refinar" volta para a melhor ordem de peças já encontrada e mexe pouco
    // nela: é procurar em volta de um lugar que já se provou bom.
    //
    // "explorar" larga isso e recomeça da lista ordenada, sacudindo forte: é
    // procurar em outro canto do mapa, porque em volta do melhor já se olhou.
    //
    // Um sozinho não serve. Só refinando, a busca fica girando dentro do
    // mesmo beco; só explorando, ela nunca chega a lapidar o que achou. Por
    // isso eles se revezam a cada parede.
    // A bagunça cresce sozinha com o tempo parado: mexer pouco refina, mexer
    // muito escapa de um beco sem saída. Perseguindo um recorde a conta é a
    // mesma — sacudir forte o tempo todo foi medido e sai pior, porque a busca
    // nunca chega a lapidar o que achou.
    //
    // Explorando, a escala é a de sempre. Refinando ela é bem menor: partindo
    // de uma ordem que já se provou boa, o que se quer é cutucar, não sacudir
    // — sacudir forte a partir do melhor dá no mesmo que recomeçar do zero, e
    // aí o modo não serviria para nada.
    const refinando = modo === "refinar";
    const teimosia = (Date.now() - ultimoGanhoEm) / msSemGanho;
    const forca = refinando
      ? (teimosia < 0.5 ? 0.05 : 0.15)
      : (teimosia < 0.34 ? 0.08 : teimosia < 0.67 ? 0.2 : 0.4);

    const mutar = (l, guardada, ordem) => {
      // Receita por família sacode blocos inteiros, e mais nada: o reparo
      // guiado e a reinserção mexem em UMA unidade, que é justamente o que
      // desmancharia o bloco.
      if (ordem && ordem.porFamilia) return baguncarFamilias(l, sortear, forca);
      if (refinando && guardada && guardada.piorUnidade && sortear() < REPARO_CHANCE) {
        return repararPior(l, guardada.piorUnidade, sortear);
      }
      if (sortear() < REINSERCAO_CHANCE) return reinserir(l, sortear, forca);
      return baguncar(l, sortear, forca);
    };

    for (let lote = 0; lote < tentativasNesteLote; lote++) {
      const lista = sortear() < PODA_FRESTA ? todas : naRoda;
      const escolhida = lista[Math.floor(sortear() * lista.length)] || todas[0];
      considerar(rodar(escolhida.receita, mutar, refinando), chaveDaReceita(escolhida.receita));
      // Não espera o lote inteiro para parar: a meta pode bater na primeira
      // tentativa dele, e as outras sete não comprariam nada.
      if (bateuAMeta()) break;
    }

    avisar("melhorando");
    await respirar();
  }

  /*
   * O POLIMENTO: uma última passada do vencedor, agora com a repescagem nos
   * vãos ligada (ver `repescarNosVaos`).
   *
   * Por que só no fim, e não em toda tentativa: a repescagem troca o relevo por
   * coluna pela lista de intervalos ocupados, e isso custa de 2 a 40 ms por
   * passada, contra o menos de um milissegundo de uma tentativa normal. Ligada
   * sempre, ela trocaria mil tentativas por vinte — e o que compra tecido neste
   * motor é caber mais tentativas no tempo. Rodando uma vez, no encaixe que já
   * venceu, ela custa o que custa uma tentativa e meia.
   *
   * Só entra se melhorar: `melhorQue` é o mesmo critério da busca inteira.
   * Medida numa passada gulosa, sem busca, ela tirou 6,88% do misturado pequeno
   * e 2,58% do lote grande — os dois trabalhos com mais formatos diferentes,
   * que é onde o vão preso se acumula.
   */
  if (melhor && receitaVencedora && melhor.ordemUsada
      && (receitaVencedora.motor === "contorno" || receitaVencedora.motor === "faixas"
        || receitaVencedora.motor === "vaos")) {
    const comRepesca = { ...config, heuristica: receitaVencedora.heuristica, repescar: true };
    const polido = receitaVencedora.motor === "faixas"
      ? encaixarPorFaixas(melhor.ordemUsada, { ...comRepesca, corteCols: receitaVencedora.corte })
      : receitaVencedora.motor === "vaos"
        ? encaixarPorVaos(melhor.ordemUsada, comRepesca)
        : encaixarContorno(melhor.ordemUsada, comRepesca);
    if (melhorQue(polido, melhor)) {
      polido.ordemUsada = melhor.ordemUsada;
      polido.chaveDaLista = melhor.chaveDaLista;
      polido.repescou = true;
      melhor = polido;
    }
  }

  avisar("pronto");
  fecharCanal();

  melhor.receita = melhorChave;
  melhor.alvo = alvo;
  melhor.alcancouRecorde = alvo == null ? null : melhor.consumo <= alvo * 1.0001;
  melhor.metaAproveitamento = metaFracao;
  melhor.metaConsumo = metaConsumo;
  melhor.alcancouMeta = metaConsumo == null ? null : bateuAMeta();
  melhor.usouRede = pontosDaRede != null;
  melhor.tentativas = tentativas;
  melhor.paredes = paredes;
  melhor.decorridoMs = Date.now() - inicio;
  // Qual motor venceu. O nome importa: antes isso se chamava `porContorno` e
  // era sobrescrito lá na tela pelo que a pessoa tinha *pedido*, então o
  // resultado dizia "usei o retângulo" mesmo quando o contorno tinha vencido.
  melhor.venceuContorno = melhorChave
    ? (melhorChave.startsWith("contorno") || melhorChave.startsWith("faixas")
      || melhorChave.startsWith("vaos")) : false;
  melhor.venceuFaixas = melhorChave ? melhorChave.startsWith("faixas") : false;
  melhor.melhorPorMotor = Object.fromEntries(melhorDeCadaMotor);
  melhor.ganhos = historicoDeGanhos;
  melhor.placar = [...placar.entries()]
    .filter(([, l]) => l.tentativas > 0)
    .map(([chave, l]) => ({ receita: chave, tentativas: l.tentativas, vitorias: l.vitorias }));
  return melhor;
}
