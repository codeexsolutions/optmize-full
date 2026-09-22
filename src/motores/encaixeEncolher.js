/**
 * ===========================================================================
 * ENCOLHER O ROLO — a ponte entre o motor e o sparrow
 * ===========================================================================
 *
 * O motor monta o encaixe peça por peça e sacode a ordem da fila. Esse jeito
 * de encaixar chegou num platô: em 2026-09-21 o pedido de produção
 * (`producao-avulsa`, 175 peças, 179 cm, 4 mm) deu 32,300 m com 3 s por fatia
 * e os MESMOS 32,300 m com 300 s. A varredura de 17/09 já dizia que ajuste de
 * busca não rendia mais; faltava saber se havia tecido para ganhar de OUTRO
 * jeito.
 *
 * Havia. O sparrow (github.com/JeroenGar/sparrow, licença MIT) parte de um
 * encaixe pronto, encurta o rolo, deixa as peças que ficaram de fora entrarem
 * por cima das outras e vai empurrando e virando peça até a sobreposição
 * sumir; conseguindo, encurta de novo. Medido no mesmo pedido, 5 minutos de
 * cada lado:
 *
 *   nosso motor                                   32,300 m
 *   sparrow nas NOSSAS máscaras (esta ponte)      31,394 m   -2,8%
 *   sparrow nos contornos exatos                  31,154 m   -3,6%
 *
 * A linha do meio é a que interessa: as peças exatamente como o motor as
 * enxerga, e o resultado passou pela trava da produção sem um par sobreposto.
 * (Os 0,8% da última linha pedem que a trava confira contorno em vez de
 * célula — fica para depois.)
 *
 * O sparrow roda em WebAssembly (`wasm-encolher/`, compilado por
 * `npm run build:encolher`). Aqui mora só a tradução, em funções puras:
 *
 *   máscara → polígono     o contorno em escada do topo/base por coluna
 *   peças → tipos          um tipo do sparrow por silhueta (e giro)
 *   encaixe → partida      o nosso encaixe no formato dele
 *   solução → encaixe      a volta, VALIDADA antes de valer
 *
 * ---------------------------------------------------------------------------
 * OS DOIS QUADROS
 * ---------------------------------------------------------------------------
 *
 * No motor, a coluna atravessa o rolo e a linha corre ao longo dele. No
 * sparrow, a altura da faixa é fixa e a largura é o que ele encolhe. Então o
 * quadro dele é o nosso TRANSPOSTO: (xs, ys) = (linha, coluna), e a altura da
 * faixa é a largura do rolo em células. A unidade é a célula da grade
 * (`passo`), e a folga já está dentro da máscara — a peça já chega engordada.
 *
 * A transposição espelha, e espelho inverte o sentido do giro: o nosso 90° é
 * o -90° dele, e o nosso 270° é o 90° dele. O 180° não tem sentido e passa
 * igual. `bancada/conferir-encolher.js` prova isto célula por célula.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A VOLTA É CONFERIDA, E NÃO CONFIADA
 * ---------------------------------------------------------------------------
 *
 * O sparrow trabalha em ponto flutuante e a peça do motor mora em célula
 * inteira. Arredondar a origem de cada peça para a célula mais próxima não
 * cria sobreposição quando há folga positiva entre as peças (num eixo em que
 * elas estão separadas, a folga continua >= 0 depois do arredondamento) — e é
 * para isso que o sparrow roda com uma separação mínima de 0,01 célula. Mesmo
 * assim, TODO encaixe que volta passa pelo `acharSobreposicao`, a trava que
 * segura a produção, e por uma contagem de peças. O que falhar é ignorado e
 * vale o último que passou; se nenhum passar, vale o da busca. Nunca sai pior
 * que hoje.
 */

import { agruparPorSilhueta, colunasDoTecido, consumoDoFundo } from "./encaixeMotor";
import { rotacoesDe } from "./encaixeGiro";
import { acharSobreposicao } from "./encaixeSobreposicao";
import iniciarCola, { initSync, encolher as encolherNoWasm } from "./encolher/encolher.js";

// ==================== OS AJUSTES ====================

/** Distância mínima entre peças no sparrow, em células: a margem do arredondamento. */
export const ENCOLHER_SEPARACAO = 0.01;
/** A fração do relógio do sparrow que vai para a compressão final (o padrão dele). */
export const ENCOLHER_FRACAO_COMPRESSAO = 0.2;
/** Os "workers" do separador do sparrow. Em wasm32 eles se revezam numa thread. */
export const ENCOLHER_TRABALHADORES = 3;
/** Abaixo disto a segunda fase nem começa: o sparrow não chega a andar. */
export const ENCOLHER_MINIMO_MS = 3000;
/**
 * O que o worker gasta FORA do relógio do sparrow: importar a instância,
 * montar as formas dele e conferir a volta. Sai do tempo dado a ele, senão a
 * segunda fase passaria do tempo que a pessoa pediu.
 */
export const ENCOLHER_RESERVA_MS = 1500;

/**
 * Quanto do tempo de procura fica com a busca de hoje. O resto é do sparrow.
 *
 * A busca satura cedo: 3 s por fatia já davam os mesmos 32,300 m que 300 s
 * davam no pedido de produção. Então ela fica com pouco — 15% do tempo, entre
 * 3 e 20 segundos —, e o sparrow com o que sobra, que é onde está o tecido.
 */
export function tempoDaBusca(tempoTotalMs) {
  return Math.min(tempoTotalMs, Math.max(3000, Math.min(20000, tempoTotalMs * 0.15)));
}

// ==================== O GIRO ====================

/** Nosso giro → o do sparrow. A transposição inverte o sentido (ver o cabeçalho). */
export const GIRO_PARA_O_SPARROW = { 0: 0, 90: -90, 180: 180, 270: 90 };

/** O giro do sparrow (qualquer volta, qualquer sinal) → o nosso. */
export function giroDoSparrow(graus) {
  const g = ((Math.round(graus) % 360) + 360) % 360;
  if (g === 0) return 0;
  if (g === 180) return 180;
  return g === 270 ? 90 : 270;
}

// ==================== QUEM PODE ENCOLHER ====================

/**
 * Por que este encaixe NÃO vai para o sparrow — ou `null`, se vai.
 *
 * O que fica de fora nesta primeira versão, e por quê:
 *
 *   bancada   a peça não pode cruzar a linha entre duas mesas, e o sparrow não
 *             conhece linha proibida.
 *   grupos    a pessoa marcou peças para saírem perto umas das outras; o
 *             sparrow põe cada peça onde couber e espalharia o grupo.
 *   sobrou    peça que não coube nem na busca não cabe no sparrow.
 */
export function motivoParaNaoEncolher(itens, resultado, config) {
  const doTrabalho = motivoDoTrabalho(itens, config);
  if (doTrabalho) return doTrabalho;
  if (!resultado || !Array.isArray(resultado.posicoes) || resultado.posicoes.length === 0) {
    return "sem encaixe para encolher";
  }
  if (resultado.naoEncaixadas && resultado.naoEncaixadas.length > 0) return "peça que não coube";
  return null;
}

/**
 * A parte do motivo que não depende do encaixe — só do trabalho. É o que a
 * busca em paralelo pergunta ANTES de começar: sem segunda fase, a busca fica
 * com o tempo inteiro, em vez de parar em 15% dele para nada.
 */
export function motivoDoTrabalho(itens, config) {
  if ((Number(config && config.comprimentoBancada) || 0) > 0) return "bancada ligada";
  if (itens.some((item) => item.grupo)) return "grupos marcados";
  if (itens.some((item) => !item.mascaras || !item.mascaras.rotacoes || !item.mascaras.rotacoes[0])) {
    return "peça sem silhueta";
  }
  return null;
}

// ==================== A FORMA ====================

/**
 * O contorno em escada de uma máscara, no quadro do sparrow.
 *
 * No motor, a coluna `c` da peça ocupa as células de `topo[c]` a `base[c]`:
 * como polígono, é o retângulo [c, c+1] x [topo, base+1]. O contorno é a borda
 * de cima, da esquerda para a direita, e a de baixo, de volta.
 *
 * Esse polígono só é simples se toda coluna ENCOSTAR na vizinha. Silhueta de
 * uma peça só já é assim (a folga engorda em cruz, e cruz liga até o que se
 * tocava na diagonal). A arte partida não: ela tem coluna vazia no meio. A
 * coluna vazia ganha uma ponte de uma célula, e a coluna que não encosta na
 * vizinha é esticada até encostar. As duas coisas só ENGORDAM a peça — e peça
 * mais gorda no sparrow nunca vira sobreposição no motor, que confere com a
 * máscara de verdade.
 */
export function contornoEmEscada(m) {
  const topo = new Array(m.cols);
  const base = new Array(m.cols);
  for (let c = 0; c < m.cols; c++) {
    if (m.topo[c] >= 0) {
      topo[c] = m.topo[c];
      base[c] = m.base[c];
    } else if (c > 0) {
      // Ponte: uma célula na altura do topo da coluna anterior.
      topo[c] = topo[c - 1];
      base[c] = topo[c - 1];
    } else {
      // A máscara é recortada no que tem tecido, então a primeira coluna nunca
      // é vazia; se um dia for, a ponte nasce no topo.
      topo[c] = 0;
      base[c] = 0;
    }
    if (c > 0) {
      // Encostar na vizinha: os dois intervalos têm de dividir uma linha.
      if (topo[c] > base[c - 1]) topo[c] = base[c - 1];
      if (base[c] < topo[c - 1]) base[c] = topo[c - 1];
    }
  }

  const pontos = [];
  for (let c = 0; c < m.cols; c++) pontos.push([c, topo[c]], [c + 1, topo[c]]);
  for (let c = m.cols - 1; c >= 0; c--) pontos.push([c + 1, base[c] + 1], [c, base[c] + 1]);

  // Sem ponto repetido e sem ponto no meio de reta: o sparrow simplifica de
  // qualquer jeito, mas polígono enxuto custa menos para importar.
  const unicos = [];
  pontos.forEach((p) => {
    const u = unicos[unicos.length - 1];
    if (!u || u[0] !== p[0] || u[1] !== p[1]) unicos.push(p);
  });
  if (unicos.length > 1) {
    const a = unicos[0];
    const z = unicos[unicos.length - 1];
    if (a[0] === z[0] && a[1] === z[1]) unicos.pop();
  }
  const enxutos = unicos.filter((b, i) => {
    const a = unicos[(i - 1 + unicos.length) % unicos.length];
    const c = unicos[(i + 1) % unicos.length];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0;
  });

  // Transposto para o quadro do sparrow, no sentido anti-horário.
  let t = enxutos.map(([x, y]) => [y, x]);
  let area = 0;
  for (let i = 0; i < t.length; i++) {
    const [x1, y1] = t[i];
    const [x2, y2] = t[(i + 1) % t.length];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) t = t.reverse();
  return t;
}

// ==================== O GIRO QUE O SPARROW PODE USAR ====================

/**
 * O giro `rot` da peça é o giro RÍGIDO da máscara de 0°?
 *
 * O motor não guarda a silhueta: guarda o topo e a base de cada coluna — o
 * casco da peça coluna por coluna —, e guarda um casco POR GIRO, cada um
 * calculado na silhueta já girada. O sparrow, não: ele tem uma forma só e a
 * gira inteira.
 *
 * No 180° dá no mesmo, porque coluna continua coluna. No 90° e no 270°, a
 * coluna vira LINHA, e o casco de uma não é o casco da outra: a coluna que
 * atravessa a cava de uma regata enche a cava; a linha, não. Medido na prova
 * (`bancada/conferir-encolher.js`): a regata deitada errava 2.710 de 57.080
 * células — o sparrow poria uma peça onde a máscara do motor acusa outra.
 *
 * Então o giro deitado só vai para o sparrow quando os dois cascos coincidem,
 * e isso acontece exatamente quando a peça de 0° é convexa também por linha:
 * manga, gola, punho, retângulo. A peça "livre" com cava ou decote fica com 0°
 * e 180° na segunda fase, e segue com os quatro giros na busca. Nas peças de
 * malha (giro 180°), que são o pedido da produção, nada muda.
 */
export function giroConsistente(m0, m, rot) {
  if (!m0 || !m) return false;
  if (rot === 0 || rot === 180) return true;
  if (m.cols !== m0.rows || m.rows !== m0.cols) return false;
  for (let y = 0; y < m0.rows; y++) {
    // As colunas da máscara de 0° que cobrem a linha `y` têm de ser um
    // intervalo só — senão o casco girado não é casco de nada.
    let de = -1;
    let ate = -1;
    for (let x = 0; x < m0.cols; x++) {
      if (!(m0.topo[x] >= 0 && m0.topo[x] <= y && y <= m0.base[x])) continue;
      if (de < 0) de = x;
      else if (ate !== x - 1) return false;
      ate = x;
    }
    // Girada 90°, a linha `y` vira a coluna `rows-1-y` e as colunas viram as
    // linhas; girada 270°, vira a coluna `y`, com as linhas de trás para a frente.
    const coluna = rot === 90 ? m0.rows - 1 - y : y;
    if (de < 0) {
      if (m.topo[coluna] >= 0) return false;
      continue;
    }
    const topo = rot === 90 ? de : m0.cols - 1 - ate;
    const base = rot === 90 ? ate : m0.cols - 1 - de;
    if (m.topo[coluna] !== topo || m.base[coluna] !== base) return false;
  }
  return true;
}

// ==================== OS TIPOS DE PEÇA ====================

/**
 * Um tipo do sparrow por silhueta — e não por arquivo.
 *
 * É a mesma regra do agrupamento do motor (`agruparPorSilhueta`): mesmas
 * medidas, mesmo contorno coluna por coluna e mesmo giro. No pedido de
 * produção, 155 arquivos viram cinco tipos; o sparrow prepara cinco formas em
 * vez de 155, e as cópias de um tipo trocam de lugar entre si à vontade.
 *
 * `R` e `C` são as linhas e colunas da máscara de 0°: é em volta dela que o
 * sparrow gira a peça, e a tradução da posição precisa delas.
 *
 * Os giros são os permitidos (e não só os "úteis": a busca pode ter assentado
 * a peça num giro que tem a mesma pegada de outro, e a partida precisa dele),
 * menos os deitados que o sparrow não tem como representar — ver
 * `giroConsistente`.
 */
export function tiposDoEncaixe(itens) {
  const tipos = [];
  agruparPorSilhueta(itens).forEach((balde) => {
    const primeira = balde.itens[0];
    const rotacoes = primeira.mascaras.rotacoes;
    const m0 = rotacoes[0];
    tipos.push({
      id: tipos.length,
      itens: balde.itens,
      rotacoes: rotacoesDe(primeira).filter((rot) => giroConsistente(m0, rotacoes[rot], rot)),
      R: m0.rows,
      C: m0.cols,
      forma: contornoEmEscada(m0),
    });
  });
  return tipos;
}

/** A instância do sparrow (o `ExtSPInstance` do jagua-rs). */
export function instanciaDoSparrow(tipos, colsTecido) {
  return {
    name: "encaixe",
    items: tipos.map((tipo) => ({
      id: tipo.id,
      demand: tipo.itens.length,
      allowed_orientations: tipo.rotacoes.map((rot) => GIRO_PARA_O_SPARROW[rot]),
      shape: { type: "simple_polygon", data: tipo.forma },
    })),
    strip_height: colsTecido,
  };
}

// ==================== A POSIÇÃO ====================

/**
 * Nossa peça — giro e canto da máscara em células — no jeito do sparrow.
 *
 * O sparrow gira o contorno de 0° em volta da origem e depois translada. A
 * máscara girada do motor ocupa colunas [col, col+largura) e linhas
 * [lin, lin+altura); a translação é a que põe o contorno girado exatamente
 * ali. As quatro contas saem de girar a caixa [0, R] x [0, C] do quadro dele.
 */
export function transformacaoDoSparrow(rot, col, lin, R, C) {
  let translation;
  if (rot === 0) translation = [lin, col];
  else if (rot === 180) translation = [lin + R, col + C];
  else if (rot === 90) translation = [lin, col + R];
  else translation = [lin + C, col];
  return { rotation: GIRO_PARA_O_SPARROW[rot], translation };
}

/** A volta: a transformação do sparrow → nosso giro e canto, em células inteiras. */
export function colocacaoDoSparrow(transformacao, R, C) {
  const rot = giroDoSparrow(transformacao.rotation);
  const [tx, ty] = transformacao.translation;
  let lin;
  let col;
  if (rot === 0) { lin = tx; col = ty; }
  else if (rot === 180) { lin = tx - R; col = ty - C; }
  else if (rot === 90) { lin = tx; col = ty - R; }
  else { lin = tx - C; col = ty; }
  return { rot, col: Math.round(col), lin: Math.round(lin) };
}

// ==================== O ENCAIXE DE PARTIDA ====================

/**
 * O encaixe da busca no formato do sparrow (o `ExtSPSolution` do jagua-rs).
 *
 * A posição sai do canto da arte: o motor escreve `x = col * passo - offX`,
 * então `col = (x + offX) / passo`. O encaixe por caixa não é de máscara — ele
 * reserva a folga só à direita e embaixo —, e ali a conta pode dar uma coluna
 * fora do rolo; a peça é trazida para dentro, e a sobreposição que isso criar
 * o sparrow desfaz na primeira separação.
 *
 * O rolo da partida é o do encaixe mais um pouco (meio por cento, pelo menos
 * uma célula). As peças da busca se encostam, e para o sparrow, que exige
 * 0,01 célula entre elas, encostar é sobrepor: ele precisa de onde afastá-las
 * antes de começar a encolher.
 */
export function partidaDoSparrow(resultado, tipos, passo, colsTecido) {
  const tipoDaPeca = new Map();
  tipos.forEach((tipo) => tipo.itens.forEach((item) => tipoDaPeca.set(item, tipo)));

  let fundo = 0;
  const colocadas = [];
  for (const pos of resultado.posicoes) {
    const tipo = tipoDaPeca.get(pos.item);
    const rot = pos.rot || 0;
    const m = pos.item && pos.item.mascaras && pos.item.mascaras.rotacoes[rot];
    if (!tipo || !m || !tipo.rotacoes.includes(rot)) return null;
    const col = Math.min(Math.max(0, Math.round((pos.x + m.offX) / passo)), colsTecido - m.cols);
    const lin = Math.max(0, Math.round((pos.y + m.offY) / passo));
    if (col < 0) return null; // peça mais larga que o rolo
    fundo = Math.max(fundo, lin + m.rows);
    colocadas.push({ item_id: tipo.id, transformation: transformacaoDoSparrow(rot, col, lin, tipo.R, tipo.C) });
  }
  const folga = Math.max(1, Math.ceil(fundo * 0.005));
  return {
    strip_width: fundo + folga,
    layout: { container_id: 0, placed_items: colocadas, density: 0 },
    density: 0,
    run_time_sec: 0,
  };
}

// ==================== A VOLTA ====================

/**
 * A solução do sparrow como encaixe do motor — ou `null`, se ela não vale.
 *
 * As colocações de um tipo são distribuídas pelas peças dele, na ordem: todas
 * têm a mesma silhueta, então qualquer uma cabe em qualquer lugar do tipo. Cada
 * peça usa a PRÓPRIA máscara (a arte dela pode ter outro recorte), e a posição
 * sai no mesmo formato do `posicoesDasColocacoes`.
 *
 * Não vale, e volta `null`: peça faltando ou sobrando, peça fora do rolo, e
 * qualquer par que a trava da produção acuse.
 */
export function resultadoDoSparrow(solucao, tipos, passo, colsTecido, config = {}) {
  if (!solucao || !solucao.layout || !Array.isArray(solucao.layout.placed_items)) return null;
  const usadas = tipos.map(() => 0);
  const posicoes = [];
  let fundo = 0;
  for (const colocada of solucao.layout.placed_items) {
    const tipo = tipos[colocada.item_id];
    if (!tipo || usadas[tipo.id] >= tipo.itens.length) return null;
    const item = tipo.itens[usadas[tipo.id]++];
    const { rot, col, lin } = colocacaoDoSparrow(colocada.transformation, tipo.R, tipo.C);
    const m = item.mascaras.rotacoes[rot];
    if (!m || col < 0 || lin < 0 || col + m.cols > colsTecido) return null;
    fundo = Math.max(fundo, lin + m.rows);
    const deitada = rot === 90 || rot === 270;
    posicoes.push({
      item,
      x: col * passo - m.offX,
      y: lin * passo - m.offY,
      largura: deitada ? item.altura : item.largura,
      altura: deitada ? item.largura : item.altura,
      rot,
      girado: deitada,
      mascara: m,
      passo,
      bancada: 0,
    });
  }
  if (usadas.some((n, i) => n !== tipos[i].itens.length)) return null;

  const guarda = acharSobreposicao(posicoes);
  if (guarda.pares > 0 || guarda.conferidas !== posicoes.length) return null;

  return {
    posicoes,
    naoEncaixadas: [],
    // Sem o engorde de cima e de baixo, como no motor (ver `consumoDoFundo`).
    consumo: consumoDoFundo(fundo, passo, config, posicoes),
    areaReal: posicoes.reduce((soma, p) => soma + (p.item.mascaras.areaReal || 0), 0),
  };
}

// ==================== O WASM ====================

let encolhedor = null;

/**
 * Sobe o sparrow. `fonte` são os bytes do `.wasm` (a bancada lê do disco) ou
 * nada — aí a cola acha o arquivo pelo endereço que o Vite empacotou.
 *
 * Falhar aqui NÃO é silencioso: o motivo vai para o console e, depois, para o
 * resultado (`encolhimento.motivo`). Queda calada para o caminho de sempre já
 * escondeu defeito neste motor (ver o cabeçalho de encaixeWasm.js).
 */
export async function carregarEncolhedor(fonte) {
  try {
    if (fonte) initSync({ module: fonte });
    else await iniciarCola();
    encolhedor = encolherNoWasm;
    return true;
  } catch (erro) {
    console.warn("[encaixe] o encolhedor (sparrow) não carregou:", erro);
    encolhedor = null;
    return false;
  }
}

export const temEncolhedor = () => encolhedor !== null;

/**
 * Encolhe o rolo de um encaixe pronto. É SÍNCRONO e dura `tempoMs` inteiro —
 * quem chama é um worker (ou a bancada), nunca a thread da tela.
 *
 * Todo encaixe que o sparrow relata no caminho é convertido e conferido na
 * hora, e o que for válido e mais curto que o melhor até ali vai para
 * `aoMelhorar`: é por ali que a tela vê a metragem cair e que o trabalho se
 * salva se o worker for encerrado de fora.
 *
 * Devolve `{ resultado, motivo, relatos, rejeitados, partiu }`: `resultado` é
 * o melhor encaixe válido mais curto que o de partida, ou `null` com o
 * `motivo`. `partiu` diz se o sparrow começou do encaixe da busca ou montou o
 * dele — ele monta quando a busca usou um giro que não vai para o sparrow
 * (ver `giroConsistente`), ou quando pedem (`partir: false`).
 */
export function encolherEncaixe(itens, resultado, config, opcoes = {}) {
  const motivo = motivoParaNaoEncolher(itens, resultado, config);
  if (motivo) return { resultado: null, motivo, relatos: 0, rejeitados: 0, partiu: false };
  if (!encolhedor) {
    return { resultado: null, motivo: "encolhedor indisponível", relatos: 0, rejeitados: 0, partiu: false };
  }

  const passo = config.passo;
  const colsTecido = colunasDoTecido(config);
  const tipos = tiposDoEncaixe(itens);
  const instancia = JSON.stringify(instanciaDoSparrow(tipos, colsTecido));
  const partir = opcoes.partir !== false;
  const partida = partir ? partidaDoSparrow(resultado, tipos, passo, colsTecido) : null;

  let melhor = null;
  let relatos = 0;
  let rejeitados = 0;
  const avaliar = (json) => {
    relatos++;
    let solucao;
    try { solucao = JSON.parse(json); } catch { rejeitados++; return; }
    const novo = resultadoDoSparrow(solucao, tipos, passo, colsTecido, config);
    if (!novo) { rejeitados++; return; }
    const alvo = melhor ? melhor.consumo : resultado.consumo;
    if (novo.consumo < alvo - 1e-9) {
      melhor = novo;
      if (opcoes.aoMelhorar) opcoes.aoMelhorar(novo);
    }
  };

  try {
    const final = encolhedor(
      instancia,
      partida ? JSON.stringify(partida) : undefined,
      Math.max(0, opcoes.tempoMs || 0),
      opcoes.fracaoCompressao != null ? opcoes.fracaoCompressao : ENCOLHER_FRACAO_COMPRESSAO,
      opcoes.semente != null ? opcoes.semente : 1,
      opcoes.separacao != null ? opcoes.separacao : ENCOLHER_SEPARACAO,
      opcoes.trabalhadores || ENCOLHER_TRABALHADORES,
      (json) => avaliar(json),
    );
    avaliar(final);
  } catch (erro) {
    return {
      resultado: melhor, motivo: `sparrow falhou: ${erro && erro.message ? erro.message : erro}`,
      relatos, rejeitados, partiu: partida !== null,
    };
  }
  return { resultado: melhor, motivo: melhor ? null : "não encurtou", relatos, rejeitados, partiu: partida !== null };
}
