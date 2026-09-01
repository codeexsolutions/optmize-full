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
};

/**
 * A peça pronta para o encaixe: medida, silhueta e as quatro máscaras giradas,
 * pelo mesmo caminho que o navegador usa.
 */
function prepararPeca(motor, nome, { passo, raio, giro = "180", qtd = 1 }) {
  const molde = CATALOGO[nome];
  if (!molde) throw new Error(`peça desconhecida na bancada: ${nome}`);

  const { cols, rows } = motor.gradeDaPeca(molde, passo);
  const bits = rasterizar(molde.poligono, cols, rows);
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
      });
    }
  });
  return itens;
}

module.exports = { CATALOGO, prepararPeca, expandir, rasterizar };
