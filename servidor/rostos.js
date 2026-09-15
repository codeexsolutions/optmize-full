/**
 * ===========================================================================
 * OS ROSTOS — achar, endireitar e transformar em números
 * ===========================================================================
 *
 * Dada uma foto, responde "de quem é este rosto?". O caminho tem três pernas,
 * e cada uma é um modelo ou uma conta:
 *
 *     foto  →  ACHAR o rosto  →  ENDIREITAR  →  128 números  →  COMPARAR
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO DÁ PARA COMPARAR FOTO COM FOTO
 * ---------------------------------------------------------------------------
 *
 * Duas fotos da mesma pessoa não se parecem em pixel nenhum: muda a luz, a
 * distância, o ângulo, o cabelo. O que não muda é a GEOMETRIA do rosto, e é
 * isso que a rede extrai — 128 números que ficam perto quando é a mesma pessoa
 * e longe quando não é.
 *
 * A comparação final é um cosseno entre dois vetores. Nada de "parecido": é
 * um número entre -1 e 1, e um corte diz de que lado fica.
 *
 * ---------------------------------------------------------------------------
 * ENDIREITAR NÃO É DETALHE
 * ---------------------------------------------------------------------------
 *
 * A rede foi treinada com rostos sempre no mesmo lugar: olhos nesta altura,
 * boca naquela. Jogar nela um rosto torto ou descentrado é mostrar uma coisa
 * que ela nunca viu — os números saem, mas não querem dizer nada.
 *
 * Por isso os cinco pontos que o detector devolve (dois olhos, nariz, dois
 * cantos da boca) viram uma transformação que leva ESSES cinco pontos para as
 * posições canônicas de um quadro 112x112. Quem estava de lado sai de frente;
 * quem estava longe sai do tamanho certo.
 *
 * ---------------------------------------------------------------------------
 * OS DOIS MODELOS, E POR QUE ESTES
 * ---------------------------------------------------------------------------
 *
 * YuNet (232 KB) acha o rosto e os cinco pontos. SFace (38 MB) transforma o
 * rosto endireitado em 128 números. Os dois são do OpenCV Zoo, Apache 2.0, e
 * foram feitos um para o outro: as posições canônicas aqui embaixo são as que
 * o SFace espera, e os cinco pontos do YuNet saem na ordem que elas querem.
 *
 * Emparelhar modelos de origens diferentes é onde este tipo de código costuma
 * falhar em silêncio: tudo roda, os números saem, e o reconhecimento só não
 * funciona.
 *
 * ---------------------------------------------------------------------------
 * ONDE ISTO RODA
 * ---------------------------------------------------------------------------
 *
 * No servidor, e não no terminal. Reconhecer na placa significaria regravar
 * todas as placas para melhorar o reconhecimento e manter o cadastro
 * sincronizado entre elas. Aqui o cadastro é um só, e uma segunda tela na
 * expedição não custa cadastro novo.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PASTA_DOS_MODELOS = path.join(__dirname, "modelos");
const YUNET = path.join(PASTA_DOS_MODELOS, "yunet.onnx");
const SFACE = path.join(PASTA_DOS_MODELOS, "sface.onnx");

/**
 * O nome que vai gravado junto de cada vetor.
 *
 * Existe para responder a uma pergunta que só aparece no dia da troca: "estes
 * números foram feitos por qual rede?". Vetor de uma rede não se compara com
 * vetor de outra — os números querem dizer coisas diferentes —, e sem esta
 * anotação a única saída seria refazer o cadastro inteiro às cegas.
 */
const MODELO = "yunet+sface-2021dec";

/**
 * O CORTE.
 *
 * 0,363 é o valor que o próprio OpenCV publica para o SFace com cosseno. Não é
 * chute nosso, e também não é sagrado: numa gráfica com quinze pessoas dá para
 * subir (menos risco de trocar alguém), e num lugar com duzentas conviria
 * descer um pouco. Fica aqui, num lugar só, para ser mexido com a régua na mão.
 *
 * ERRAR PARA CIMA E ERRAR PARA BAIXO NÃO CUSTAM IGUAL: não reconhecer faz a
 * pessoa bater de novo; reconhecer errado põe o ponto de alguém no nome de
 * outro, e ninguém descobre até o fim do mês.
 */
const CORTE = 0.363;

/**
 * As posições canônicas de um rosto de 112x112, na ordem em que o YuNet
 * devolve os pontos: olho direito, olho esquerdo, nariz, canto direito da
 * boca, canto esquerdo da boca.
 *
 * "Direito" é da PESSOA, então aparece à esquerda na imagem — por isso o
 * primeiro par tem x menor que o segundo. Trocar os dois é o erro clássico
 * aqui, e ele não dá erro nenhum: só faz todo mundo parecer com todo mundo.
 */
const ONDE_OS_PONTOS_DEVEM_CAIR = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

let ort = null;
let sessaoDoDetector = null;
let sessaoDoVetor = null;
let porqueNao = null;

/* =============================================================== a carga */

function temOsModelos() {
  return fs.existsSync(YUNET) && fs.existsSync(SFACE);
}

/**
 * Sobe os dois modelos, uma vez.
 *
 * TARDE, e não na partida do servidor: são 38 MB e alguns segundos de carga,
 * e a maior parte dos dias do Optmize não tem ninguém batendo ponto. Quem
 * paga o preço é a primeira batida do dia.
 */
async function acordar() {
  if (sessaoDoDetector && sessaoDoVetor) return true;
  if (porqueNao) return false;

  if (!temOsModelos()) {
    porqueNao = "Os modelos não estão em servidor/modelos (yunet.onnx e sface.onnx).";
    return false;
  }

  try {
    ort = ort || require("onnxruntime-node");
    // Nível 3 = só erros. Sem isto o YuNet despeja centenas de avisos sobre
    // inicializadores na saída do servidor toda vez que sobe.
    const opcoes = { logSeverityLevel: 3, graphOptimizationLevel: "all" };
    sessaoDoDetector = await ort.InferenceSession.create(YUNET, opcoes);
    sessaoDoVetor = await ort.InferenceSession.create(SFACE, opcoes);
    return true;
  } catch (erro) {
    porqueNao = `Não consegui abrir os modelos: ${erro.message}`;
    sessaoDoDetector = null;
    sessaoDoVetor = null;
    return false;
  }
}

function estadoDoReconhecimento() {
  return {
    pronto: Boolean(sessaoDoDetector && sessaoDoVetor),
    modelo: MODELO,
    corte: CORTE,
    motivo: porqueNao,
    modelosNoDisco: temOsModelos(),
  };
}

/* ============================================================ achar o rosto */

/**
 * O YuNet trabalha em três escalas ao mesmo tempo — uma para rostos pequenos,
 * uma para médios, uma para grandes — e cada uma devolve quatro listas. Esta
 * função junta tudo numa lista só de candidatos.
 *
 * A pontuação é a RAIZ DO PRODUTO de duas coisas que a rede responde separado:
 * "isto é um rosto?" e "tem algum objeto aqui?". A raiz é o que faz as duas
 * pesarem igual — fosse só o produto, uma delas baixa derrubaria o resultado
 * sozinha.
 */
function juntarOsCandidatos(saidas, larguraDaRede, alturaDaRede, minimo) {
  const achados = [];

  for (const passo of [8, 16, 32]) {
    const cls = saidas[`cls_${passo}`].data;
    const obj = saidas[`obj_${passo}`].data;
    const caixa = saidas[`bbox_${passo}`].data;
    const pontos = saidas[`kps_${passo}`].data;

    const colunas = Math.floor(larguraDaRede / passo);
    const linhas = Math.floor(alturaDaRede / passo);

    for (let i = 0; i < linhas * colunas; i++) {
      const nota = Math.sqrt(
        Math.max(0, Math.min(1, cls[i])) * Math.max(0, Math.min(1, obj[i]))
      );
      if (nota < minimo) continue;

      const coluna = i % colunas;
      const linha = Math.floor(i / colunas);

      // O modelo não dá coordenadas: dá deslocamentos dentro da célula da
      // grade, e tamanhos em logaritmo. Ambos viram pixel multiplicando pelo
      // passo daquela escala.
      const cx = (coluna + caixa[i * 4 + 0]) * passo;
      const cy = (linha + caixa[i * 4 + 1]) * passo;
      const w = Math.exp(caixa[i * 4 + 2]) * passo;
      const h = Math.exp(caixa[i * 4 + 3]) * passo;

      const cinco = [];
      for (let p = 0; p < 5; p++) {
        cinco.push([
          (coluna + pontos[i * 10 + p * 2 + 0]) * passo,
          (linha + pontos[i * 10 + p * 2 + 1]) * passo,
        ]);
      }

      achados.push({ nota, x: cx - w / 2, y: cy - h / 2, w, h, pontos: cinco });
    }
  }
  return achados;
}

/** Quanto duas caixas se sobrepõem, de 0 (nada) a 1 (iguais). */
function sobreposicao(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x || y2 <= y) return 0;
  const juntos = (x2 - x) * (y2 - y);
  return juntos / (a.w * a.h + b.w * b.h - juntos);
}

/**
 * Um rosto é achado por várias células da grade ao mesmo tempo. Aqui fica só o
 * melhor de cada aglomerado — sem isto, uma pessoa vira oito detecções quase
 * iguais e a "melhor" seria escolhida no par ou ímpar.
 */
function sóOsMelhores(achados, limite = 0.3) {
  const ordenados = [...achados].sort((a, b) => b.nota - a.nota);
  const ficam = [];
  for (const candidato of ordenados) {
    if (!ficam.some((bom) => sobreposicao(bom, candidato) > limite)) {
      ficam.push(candidato);
    }
  }
  return ficam;
}

/** O quadro que o YuNet aceita. Não é escolha nossa: está fixo no modelo. */
const LADO_DA_REDE = 640;

/**
 * Acha os rostos de uma foto.
 *
 * A FOTO É ENCAIXADA NUM QUADRADO DE 640, sem distorcer.
 *
 * Este modelo tem a entrada FIXA nesse tamanho — não é um parâmetro, é parte
 * do arquivo, e mandar qualquer outra coisa é recusado na cara. Então a foto
 * entra proporcional, encostada no canto de cima à esquerda, e o que sobra do
 * quadrado fica preto.
 *
 * Encostar no canto em vez de centralizar não é capricho: assim voltar das
 * coordenadas da rede para as da foto é uma divisão e mais nada. Centralizado
 * seria uma divisão e duas subtrações, e cada conta a mais aqui é uma chance de
 * o rosto sair recortado meio pixel fora sem ninguém perceber.
 */
async function acharOsRostos(fotoBruta, minimo = 0.6) {
  const imagem = sharp(fotoBruta).rotate(); // respeita o EXIF do celular
  const info = await imagem.metadata();

  const escala = Math.min(LADO_DA_REDE / info.width, LADO_DA_REDE / info.height);
  const usada = { largura: Math.round(info.width * escala), altura: Math.round(info.height * escala) };

  const { data } = await imagem
    .resize(usada.largura, usada.altura, { fit: "fill" })
    .extend({
      top: 0,
      left: 0,
      bottom: LADO_DA_REDE - usada.altura,
      right: LADO_DA_REDE - usada.largura,
      background: { r: 0, g: 0, b: 0 },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // NCHW, e em BGR: é assim que o modelo foi treinado. Em RGB ele ainda acha
  // rostos, só que pior -- o tipo de erro que se confunde com "a câmera é ruim".
  const pixels = LADO_DA_REDE * LADO_DA_REDE;
  const entrada = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    entrada[0 * pixels + i] = data[i * 3 + 2];
    entrada[1 * pixels + i] = data[i * 3 + 1];
    entrada[2 * pixels + i] = data[i * 3 + 0];
  }

  const saidas = await sessaoDoDetector.run({
    input: new ort.Tensor("float32", entrada, [1, 3, LADO_DA_REDE, LADO_DA_REDE]),
  });

  const achados = sóOsMelhores(
    juntarOsCandidatos(saidas, LADO_DA_REDE, LADO_DA_REDE, minimo)
  ).filter((r) => {
    // Rosto cujo centro caiu na tarja preta é alucinação da rede sobre o
    // preenchimento, não alguém que apareceu na foto.
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return cx < usada.largura && cy < usada.altura;
  });

  // De volta ao tamanho da foto que chegou.
  return achados.map((r) => ({
    nota: r.nota,
    caixa: { x: r.x / escala, y: r.y / escala, largura: r.w / escala, altura: r.h / escala },
    pontos: r.pontos.map(([x, y]) => [x / escala, y / escala]),
  }));
}

/* ========================================================== endireitar */

/**
 * A transformação que leva os cinco pontos achados para as cinco posições
 * canônicas.
 *
 * É uma SEMELHANÇA: gira, aumenta e desloca, mas não entorta. Quatro números
 * apenas, e há uma fórmula fechada de mínimos quadrados para achá-los a partir
 * de cinco pares de pontos — não precisa de biblioteca de matriz nem de SVD.
 *
 * Não entortar é a parte importante: uma transformação livre poderia esticar um
 * rosto estreito até as posições canônicas e apagar justamente o que distingue
 * uma pessoa da outra.
 */
function acharATransformacao(de, para) {
  const n = de.length;
  const meioDe = [0, 0];
  const meioPara = [0, 0];
  for (let i = 0; i < n; i++) {
    meioDe[0] += de[i][0] / n;
    meioDe[1] += de[i][1] / n;
    meioPara[0] += para[i][0] / n;
    meioPara[1] += para[i][1] / n;
  }

  let numeroA = 0;
  let numeroB = 0;
  let baixo = 0;
  for (let i = 0; i < n; i++) {
    const x = de[i][0] - meioDe[0];
    const y = de[i][1] - meioDe[1];
    const u = para[i][0] - meioPara[0];
    const v = para[i][1] - meioPara[1];
    numeroA += x * u + y * v;
    numeroB += x * v - y * u;
    baixo += x * x + y * y;
  }
  if (baixo === 0) return null;

  const a = numeroA / baixo; // escala * cosseno do giro
  const b = numeroB / baixo; // escala * seno do giro
  return {
    a,
    b,
    tx: meioPara[0] - (a * meioDe[0] - b * meioDe[1]),
    ty: meioPara[1] - (b * meioDe[0] + a * meioDe[1]),
  };
}

/**
 * Recorta e endireita o rosto num quadro de 112x112.
 *
 * A conta corre AO CONTRÁRIO: para cada pixel de saída, pergunta de onde ele
 * veio na foto. É o único jeito de não deixar buraco — indo para a frente,
 * pixels de saída ficariam sem ninguém que caísse neles, e o rosto sairia
 * furado.
 *
 * A cor de cada ponto sai da média dos quatro vizinhos. Pegar o mais próximo
 * seria mais rápido e deixaria a borda serrilhada, e serrilhado é ruído que a
 * rede nunca viu no treino.
 */
async function endireitar(fotoBruta, pontos) {
  const transformacao = acharATransformacao(pontos, ONDE_OS_PONTOS_DEVEM_CAIR);
  if (!transformacao) return null;

  const { a, b, tx, ty } = transformacao;
  const det = a * a + b * b;
  if (det === 0) return null;

  const { data, info } = await sharp(fotoBruta)
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const LADO = 112;
  const saida = Buffer.alloc(LADO * LADO * 3);

  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      const dx = x - tx;
      const dy = y - ty;
      const ox = (a * dx + b * dy) / det;
      const oy = (-b * dx + a * dy) / det;

      const destino = (y * LADO + x) * 3;
      if (ox < 0 || oy < 0 || ox >= info.width - 1 || oy >= info.height - 1) {
        continue; // fora da foto: fica preto
      }

      const x0 = Math.floor(ox);
      const y0 = Math.floor(oy);
      const fx = ox - x0;
      const fy = oy - y0;

      for (let c = 0; c < 3; c++) {
        const p00 = data[(y0 * info.width + x0) * 3 + c];
        const p10 = data[(y0 * info.width + x0 + 1) * 3 + c];
        const p01 = data[((y0 + 1) * info.width + x0) * 3 + c];
        const p11 = data[((y0 + 1) * info.width + x0 + 1) * 3 + c];
        saida[destino + c] =
          p00 * (1 - fx) * (1 - fy) +
          p10 * fx * (1 - fy) +
          p01 * (1 - fx) * fy +
          p11 * fx * fy;
      }
    }
  }
  return saida; // RGB cru, 112x112
}

/* ============================================================== o vetor */

/** Os 128 números de um rosto já endireitado. */
async function vetorDoRecorte(recorteRgb) {
  const pixels = 112 * 112;
  const entrada = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    entrada[0 * pixels + i] = recorteRgb[i * 3 + 2]; // BGR, como no treino
    entrada[1 * pixels + i] = recorteRgb[i * 3 + 1];
    entrada[2 * pixels + i] = recorteRgb[i * 3 + 0];
  }
  const saida = await sessaoDoVetor.run({
    data: new ort.Tensor("float32", entrada, [1, 3, 112, 112]),
  });
  return Array.from(saida.fc1.data);
}

/**
 * O caminho inteiro: foto → vetor do rosto mais nítido que houver nela.
 *
 * Devolve `{ vetor, nota, caixa }`, ou `{ erro }` dizendo o que faltou. Nunca
 * lança: quem chama é uma rota HTTP, e quem está do outro lado precisa de uma
 * frase, não de uma pilha de exceção.
 */
async function vetorDaFoto(fotoBruta) {
  if (!(await acordar())) return { erro: porqueNao };

  const rostos = await acharOsRostos(fotoBruta);
  if (rostos.length === 0) {
    return { erro: "Não achei nenhum rosto nesta foto." };
  }

  // O de maior nota. Numa foto de cadastro é o único; numa de terminal é o de
  // quem está na frente da câmera, que é justamente quem está batendo.
  const rosto = rostos.reduce((a, b) => (b.nota > a.nota ? b : a));

  const recorte = await endireitar(fotoBruta, rosto.pontos);
  if (!recorte) return { erro: "Não consegui endireitar o rosto." };

  return {
    vetor: await vetorDoRecorte(recorte),
    nota: rosto.nota,
    caixa: rosto.caixa,
    quantosRostos: rostos.length,
  };
}

/* ============================================================ comparar */

/**
 * O cosseno entre dois vetores: 1 é a mesma direção, 0 é sem relação nenhuma.
 *
 * O TAMANHO DOS VETORES NÃO IMPORTA, só a direção — e é por isso que o cosseno
 * serve aqui. Foto clara e foto escura da mesma pessoa dão vetores de tamanhos
 * diferentes apontando para o mesmo lado.
 */
function parecidos(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let cima = 0;
  let ladoA = 0;
  let ladoB = 0;
  for (let i = 0; i < a.length; i++) {
    cima += a[i] * b[i];
    ladoA += a[i] * a[i];
    ladoB += b[i] * b[i];
  }
  if (ladoA === 0 || ladoB === 0) return -1;
  return cima / (Math.sqrt(ladoA) * Math.sqrt(ladoB));
}

/**
 * De quem é este vetor, entre os cadastrados.
 *
 * `cadastro` é uma lista de `{ funcionarioId, nome, vetor }` — uma entrada por
 * FOTO, não por pessoa. Quem cadastrou três ângulos tem três entradas, e vale
 * a melhor delas: basta parecer com um dos ângulos para ser reconhecido.
 *
 * Devolve também o segundo colocado. Não é curiosidade: quando o primeiro e o
 * segundo estão colados, o reconhecimento acertou por sorte, e a tela de
 * conferência precisa poder mostrar isso.
 */
function deQuemE(vetor, cadastro, corte = CORTE) {
  const notas = cadastro
    .map((c) => ({ ...c, nota: parecidos(vetor, c.vetor) }))
    .sort((a, b) => b.nota - a.nota);

  if (notas.length === 0) return { encontrado: false, motivo: "Ninguém tem rosto cadastrado." };

  const melhorPorPessoa = new Map();
  for (const n of notas) {
    if (!melhorPorPessoa.has(n.funcionarioId)) melhorPorPessoa.set(n.funcionarioId, n);
  }
  const porPessoa = [...melhorPorPessoa.values()];

  const primeiro = porPessoa[0];
  const segundo = porPessoa[1] || null;

  return {
    encontrado: primeiro.nota >= corte,
    funcionarioId: primeiro.funcionarioId,
    nome: primeiro.nome,
    nota: primeiro.nota,
    corte,
    segundo: segundo ? { nome: segundo.nome, nota: segundo.nota } : null,
  };
}

module.exports = {
  MODELO,
  CORTE,
  acordar,
  estadoDoReconhecimento,
  acharOsRostos,
  endireitar,
  vetorDaFoto,
  parecidos,
  deQuemE,
};
