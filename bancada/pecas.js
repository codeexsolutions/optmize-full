/**
 * As peças da bancada: silhuetas sintéticas com o contorno que molde de
 * verdade tem.
 *
 * **Por que sintéticas.** Medir o encaixe precisa das mesmas peças toda vez, e
 * arte de cliente não entra no repositório (é dado de cliente e pesa). Aqui a
 * silhueta nasce de um polígono escrito no código: sempre igual, sem arquivo
 * nenhum, e o cálculo que a recebe é exatamente o mesmo do navegador — o
 * `mascarasDeSilhueta` do `public/encaixe-mascara.js`.
 *
 * **Por que com concavidade.** Silhueta lisa esconde justamente o que o motor
 * faz. Já aconteceu: com uma manga desenhada como lente simétrica, girada 180°
 * ela era ela mesma, e "manga com manga invertida" rendia 0,0% — a medição
 * inteira do agrupamento saiu subestimada. Toda peça daqui tem o buraco que a
 * peça real tem: decote, cava, cabeça de manga, gancho da calça.
 *
 * As coordenadas são normalizadas (0 a 1) dentro da caixa da peça, com o y
 * crescendo para baixo, igual à grade do encaixe.
 */

// ==================== DESENHO ====================

/** Amostra uma curva quadrática de Bézier, sem o ponto de partida. */
function curva(p0, ctrl, p1, quantos = 12) {
  const pontos = [];
  for (let i = 1; i <= quantos; i++) {
    const t = i / quantos;
    const u = 1 - t;
    pontos.push([
      u * u * p0[0] + 2 * u * t * ctrl[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * ctrl[1] + t * t * p1[1],
    ]);
  }
  return pontos;
}

/**
 * Monta o contorno a partir de uma lista de comandos.
 *   ["r", x, y]  reta até o ponto
 *   ["c", cx, cy, x, y]  curva até o ponto, com esse controle
 */
function contorno(inicio, comandos) {
  const pontos = [inicio];
  let atual = inicio;
  comandos.forEach((cmd) => {
    if (cmd[0] === "r") {
      atual = [cmd[1], cmd[2]];
      pontos.push(atual);
    } else {
      const destino = [cmd[3], cmd[4]];
      curva(atual, [cmd[1], cmd[2]], destino).forEach((p) => pontos.push(p));
      atual = destino;
    }
  });
  return pontos;
}

/** Rasteriza o polígono na grade, pelo centro de cada célula. */
function rasterizar(poligono, cols, rows) {
  const bits = new Uint8Array(cols * rows);
  for (let linha = 0; linha < rows; linha++) {
    const y = (linha + 0.5) / rows;
    // Onde a linha cruza cada aresta: com os cruzamentos ordenados, o dentro
    // e o fora se alternam, e a linha inteira sai numa varrida só.
    const cruzamentos = [];
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [xi, yi] = poligono[i];
      const [xj, yj] = poligono[j];
      if ((yi > y) === (yj > y)) continue;
      cruzamentos.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
    cruzamentos.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cruzamentos.length; k += 2) {
      const de = Math.max(0, Math.ceil(cruzamentos[k] * cols - 0.5));
      const ate = Math.min(cols - 1, Math.floor(cruzamentos[k + 1] * cols - 0.5));
      for (let c = de; c <= ate; c++) bits[linha * cols + c] = 1;
    }
  }
  return bits;
}

// ==================== O CATÁLOGO ====================

/**
 * Cada peça traz a medida em centímetros e o contorno normalizado. As medidas
 * são de tamanho M de malha, que é o trabalho mais comum da loja.
 */
const CATALOGO = {
  // Frente de camiseta: decote em U, cava funda dos dois lados, corpo levemente
  // afunilado. O decote é o vão que a gola procura.
  camiseta: {
    largura: 56, altura: 70,
    poligono: contorno([0.02, 0.06], [
      ["r", 0.33, 0.02],
      ["c", 0.50, 0.24, 0.67, 0.02],
      ["r", 0.98, 0.06],
      ["c", 0.80, 0.16, 0.86, 0.34],
      ["r", 0.92, 1.0],
      ["r", 0.08, 1.0],
      ["r", 0.14, 0.34],
      ["c", 0.20, 0.17, 0.02, 0.09],
    ]),
  },
  // Manga: cabeça convexa no alto e funda nos cantos, corpo afunilando até o
  // punho. Girada 180° ela encaixa na barriga da outra.
  manga: {
    largura: 46, altura: 30,
    poligono: contorno([0.02, 0.34], [
      ["c", 0.16, 0.06, 0.50, 0.02],
      ["c", 0.84, 0.06, 0.98, 0.34],
      ["r", 0.80, 1.0],
      ["r", 0.20, 1.0],
    ]),
  },
  // Gola: a tira em meia-lua. Duas delas viradas uma para a outra fecham quase
  // um retângulo — é a peça que mais ganha com o agrupamento.
  gola: {
    largura: 55, altura: 9,
    poligono: contorno([0.0, 0.50], [
      ["c", 0.50, 0.0, 1.0, 0.50],
      ["r", 1.0, 1.0],
      ["c", 0.50, 0.50, 0.0, 1.0],
    ]),
  },
  // Frente de calça: gancho fundo de um lado, perna afunilando. O gancho é a
  // concavidade mais funda do catálogo.
  calca: {
    largura: 52, altura: 104,
    poligono: contorno([0.15, 0.0], [
      ["r", 0.85, 0.0],
      ["c", 0.90, 0.55, 0.72, 1.0],
      ["r", 0.30, 1.0],
      ["r", 0.36, 0.42],
      ["c", 0.08, 0.28, 0.15, 0.0],
    ]),
  },
  // Regata: alça fina e cava muito funda — a peça em que o contorno mais ganha
  // do encaixe por caixa.
  regata: {
    largura: 48, altura: 66,
    poligono: contorno([0.14, 0.0], [
      ["r", 0.30, 0.0],
      ["c", 0.50, 0.26, 0.70, 0.0],
      ["r", 0.86, 0.0],
      ["c", 0.66, 0.30, 0.88, 0.46],
      ["r", 0.92, 1.0],
      ["r", 0.08, 1.0],
      ["r", 0.12, 0.46],
      ["c", 0.34, 0.30, 0.14, 0.0],
    ]),
  },
  // Bolso: pentágono pequeno, quase cheio. Serve de contraprova — peça assim
  // não ganha nada com o contorno, e o encaixe por caixa tem que empatar.
  bolso: {
    largura: 16, altura: 18,
    poligono: contorno([0.05, 0.0], [
      ["r", 0.95, 0.0],
      ["r", 0.95, 0.68],
      ["r", 0.50, 1.0],
      ["r", 0.05, 0.68],
    ]),
  },
  // Punho: retângulo de verdade. É a peça que prova que o motor não perde nada
  // no caso fácil.
  punho: {
    largura: 24, altura: 8,
    poligono: contorno([0.0, 0.0], [["r", 1.0, 0.0], ["r", 1.0, 1.0], ["r", 0.0, 1.0]]),
  },
  /*
   * ==========================================================================
   * AS PEÇAS DA PRODUÇÃO — copiadas de um trabalho real, medida por medida
   * ==========================================================================
   *
   * As peças de confecção logo acima são de molde: gola de 48% de ocupação,
   * calça de 55%. Só que a produção desta loja não corta molde, ela imprime
   * uniforme — e ali as peças são **quase retângulos**: de 76% a 100% de
   * ocupação, com o vazio só nos ombros, no decote e nos cantos.
   *
   * A diferença não é detalhe. Medir o motor com silhueta de confecção
   * respondia à pergunta errada: no histórico de produção o encaixe por CAIXA
   * chegou a vencer, coisa que nunca acontece com as peças de molde.
   *
   * Estas quatro saíram de um trabalho real (155 arquivos, 179 cm, 34,63 m):
   * as medidas em centímetros e a ocupação de cada uma foram lidas da arte de
   * verdade, e o contorno foi redesenhado até bater com ela na casa decimal —
   * ombro cortado e decote na costa e na frente, cúpula na manga, cantos de
   * cima cortados no short. A arte do cliente não entra no repositório; o que
   * está aqui é o formato, reconstruído.
   *
   *   peça      medida        ocupação real   aqui
   *   costa     59,2 x 79,6       90,4%       90,4%
   *   frente    59,2 x 75,6       89,3%       89,3%
   *   short     79,2 x 60,2       83,3%       83,3%
   *   manga     49,2 x 27,2       76,1%       76,1%
   *   gola      57,2 x  7,2      100,0%      100,0%  (a arte sangra na borda)
   */
  "uni-costa": {
    largura: 59.2, altura: 79.6,
    poligono: contorno([0.0, 0.40], [
      ["r", 0.115, 0.0944],
      ["r", 0.175, 0.0360],
      ["r", 0.300, 0.0288],
      ["c", 0.500, 0.1169, 0.700, 0.0288],
      ["r", 0.825, 0.0360],
      ["r", 0.885, 0.0944],
      ["r", 1.0, 0.40],
      ["r", 1.0, 1.0],
      ["r", 0.0, 1.0],
    ]),
  },
  "uni-frente": {
    largura: 59.2, altura: 75.6,
    poligono: contorno([0.0, 0.40], [
      ["r", 0.115, 0.0904],
      ["r", 0.175, 0.0301],
      ["r", 0.345, 0.0241],
      ["c", 0.500, 0.2841, 0.655, 0.0241],
      ["r", 0.825, 0.0301],
      ["r", 0.885, 0.0904],
      ["r", 1.0, 0.40],
      ["r", 1.0, 1.0],
      ["r", 0.0, 1.0],
    ]),
  },
  "uni-short": {
    largura: 79.2, altura: 60.2,
    poligono: contorno([0.0, 0.62], [
      ["r", 0.2038, 0.055],
      ["r", 0.80, 0.055],
      ["r", 0.80, 0.0],
      ["r", 0.87, 0.0],
      ["r", 0.87, 0.055],
      ["r", 0.7962, 0.055],
      ["r", 1.0, 0.62],
      ["r", 1.0, 1.0],
      ["r", 0.0, 1.0],
    ]),
  },
  "uni-manga": {
    largura: 49.2, altura: 27.2,
    poligono: contorno([0.0, 0.50], [
      ["c", 0.16, 0.1843, 0.50, 0.0369],
      ["c", 0.84, 0.1843, 1.0, 0.50],
      ["r", 1.0, 0.62],
      ["r", 0.93, 1.0],
      ["r", 0.07, 1.0],
      ["r", 0.0, 0.62],
    ]),
  },
  // A gola da produção sangra até a borda da arte: o programa lê como caixa.
  "uni-gola": {
    largura: 57.2, altura: 7.2,
    poligono: contorno([0.0, 0.0], [["r", 1.0, 0.0], ["r", 1.0, 1.0], ["r", 0.0, 1.0]]),
  },
  /*
   * Arte partida: UMA peça cuja silhueta são dois blocos separados.
   *
   * Não é invenção de teste. Acontece com arte que tem um elemento solto, com
   * silhueta tirada do alfa que deixou uma ilha destacada, e com remoção de
   * fundo que separou o desenho em dois pedaços.
   *
   * Ela entrou no catálogo porque foi este formato que quebrou o encaixe por
   * NFP: o traçador de contorno dele seguia UMA borda e parava, então o segundo
   * bloco não existia para o motor e outra peça era posta em cima dele — seis
   * cópias saíam com 2.720 células ocupadas duas vezes, e o encaixe parecia 43%
   * melhor por causa disso (motor que sobrepõe sempre ganha de motor que não
   * sobrepõe).
   *
   * O NFP saiu do projeto depois, e ela FICOU. Silhueta partida não é assunto de
   * um encaixador só: ela põe à prova o topo/base por coluna (uma coluna que
   * atravessa o vão não tem tecido nenhum no meio), o recorte da máscara e o
   * desenho do contorno na tela. Enquanto ela estiver aqui e o
   * `conferir-sobreposicao` rodar, essa classe de defeito não volta sem alguém
   * ver.
   */
  "arte-partida": {
    largura: 30, altura: 20,
    blocos: [
      contorno([0.00, 0.00], [["r", 0.34, 0.0], ["r", 0.34, 1.0], ["r", 0.0, 1.0]]),
      contorno([0.66, 0.10], [["r", 1.0, 0.10], ["r", 1.0, 0.9], ["r", 0.66, 0.9]]),
    ],
  },
};

/**
 * A peça pronta para o encaixe: medida, silhueta e as quatro máscaras giradas,
 * pelo mesmo caminho que o navegador usa.
 */
function prepararPeca(motor, nome, { passo, raio, giro = "180", qtd = 1 }) {
  const molde = CATALOGO[nome];
  if (!molde) throw new Error(`peça desconhecida na bancada: ${nome}`);

  const { cols, rows } = motor.gradeDaPeca(molde, passo);
  // `blocos` é para a peça cuja silhueta são vários pedaços soltos; o normal é
  // um polígono só. Os dois viram a mesma grade de bits.
  const bits = new Uint8Array(cols * rows);
  (molde.blocos || [molde.poligono]).forEach((poligono) => {
    const parte = rasterizar(poligono, cols, rows);
    for (let i = 0; i < bits.length; i++) if (parte[i]) bits[i] = 1;
  });
  const mascaras = motor.mascarasDeSilhueta({ bits, modo: "alfa" }, cols, rows, passo, raio);

  return {
    nome, giro, qtd,
    largura: molde.largura, altura: molde.altura,
    mascaras, ocupacao: mascaras.ocupacao,
  };
}

/** Expande as peças em itens — uma cópia por unidade pedida —, como a tela faz. */
function expandir(pecas) {
  const itens = [];
  pecas.forEach((peca, indice) => {
    for (let copia = 1; copia <= peca.qtd; copia++) {
      itens.push({
        indice, copia,
        nome: peca.nome, qtd: peca.qtd, giro: peca.giro,
        largura: peca.largura, altura: peca.altura,
        mascaras: peca.mascaras,
        // O grupo da tabela (ver "OS GRUPOS DA PESSOA", em encaixe-motor.js).
        // Sem ele aqui, a bancada mede um encaixe sem grupo nenhum achando que
        // está medindo o com — foi exatamente o que aconteceu na primeira
        // tentativa de medir o custo do agrupamento.
        grupo: peca.grupo || null,
        // Rótulo livre, só para a bancada medir: ele atravessa a expansão sem
        // o motor olhar para ele, e é o que deixa comparar o espalhamento do
        // mesmo punhado de peças com e sem agrupamento.
        conjunto: peca.conjunto || null,
      });
    }
  });
  return itens;
}

module.exports = { CATALOGO, prepararPeca, expandir, rasterizar };
