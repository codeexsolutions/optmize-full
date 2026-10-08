/**
 * ===========================================================================
 * A REDE DE RECORTE DO EXTRATOR — o clique vira máscara
 * ===========================================================================
 *
 * O operador clica no logo e a tela mostra o contorno dele. Quem acha o
 * contorno é uma rede da família do Segment Anything, rodando aqui no
 * servidor pelo mesmo `onnxruntime-node` do reconhecimento facial (ver
 * `rostos.js`).
 *
 * A rede tem duas metades, e é isso que deixa o clique instantâneo:
 *
 *   codificador    lê a foto inteira e a resume em 256 × 64 × 64 números. É
 *                  a parte pesada (1 a 3 s neste i5) e roda UMA vez por foto.
 *   decodificador  recebe o resumo e os cliques e devolve a máscara. Leve
 *                  (100 a 300 ms com a conversão), roda a cada clique.
 *
 * Por isso a leitura fica guardada aqui, com um id, e a tela só manda os
 * cliques. Ela vence em 30 minutos sem uso (e só cabem 8): quem voltar depois
 * recebe `leitura-vencida`, e a tela lê a foto de novo sozinha.
 *
 * ---------------------------------------------------------------------------
 * AS TRÊS CANDIDATAS, E QUEM ESCOLHE
 * ---------------------------------------------------------------------------
 *
 * Cada rede foi exportada de um jeito, e o adaptador de cada uma esconde isso:
 *
 *   mobilesam     a foto entra de 0 a 255, já reduzida; a rede normaliza e
 *                 enche sozinha. Caixa pelos rótulos 2 e 3.
 *   efficientsam  a foto entra de 0 a 1, de qualquer tamanho; a rede estica
 *                 para 1024 × 1024 sozinha. Caixa pelos rótulos 2 e 3.
 *   slimsam       a foto entra normalizada e enchida até 1024 × 1024, como o
 *                 SamProcessor do transformers faz. Sem caixa: a caixa vira
 *                 um clique no meio dela.
 *
 * Na foto de mentira (disco e quadrado, 2026-10-06), as três acham os dois
 * com IoU de 0,98 a 1,00. Quem decide entre elas são as fotos de verdade
 * (`bancada/medir-recorte.mjs`), e a escolhida é `REDE_DO_EXTRATOR`.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const PASTA_DOS_MODELOS = process.env.OPTIMIZE_EXTRATOR_MODELOS || path.join(__dirname, "modelos");

/**
 * A rede que o Extrator usa. Começa na MobileSAM — a mais rápida medida
 * (codificador ~1 s) e com caixa —, e a medição nas fotos reais confirma ou
 * troca. Trocar é mudar esta linha: o `npm run modelos` baixa a nova.
 */
const REDE_DO_EXTRATOR = "mobilesam";

/** Onde baixar cada rede: URL fixada num commit, tamanho e sha256 conferidos. */
const ORIGENS = {
  mobilesam: {
    codificador: {
      de: "https://huggingface.co/Acly/MobileSAM/resolve/0d3b403339b4674a82493d5e97964dd78089ddc8/mobile_sam_image_encoder.onnx",
      tamanho: 28157093, sha256: "580f5fb648ea1062c0aabc26217aed56921985f03f0cbbd852bba81d760cc749",
    },
    decodificador: {
      de: "https://huggingface.co/Acly/MobileSAM/resolve/0d3b403339b4674a82493d5e97964dd78089ddc8/sam_mask_decoder_multi.onnx",
      tamanho: 16496559, sha256: "8976b90a87ba50a6a72217a5ff994f7d25ce16f2229fcc1ed259e1294c622ffe",
    },
  },
  efficientsam: {
    codificador: {
      de: "https://raw.githubusercontent.com/yformer/EfficientSAM/f13035d925a0de803e8f733f3239fa05b1fcf36f/weights/efficient_sam_vitt_encoder.onnx",
      tamanho: 24799761, sha256: "84ed466ffcc5c1f8d08409bc34a23bb364ab2c15e402cb12d4335a42be0e0951",
    },
    decodificador: {
      de: "https://raw.githubusercontent.com/yformer/EfficientSAM/f13035d925a0de803e8f733f3239fa05b1fcf36f/weights/efficient_sam_vitt_decoder.onnx",
      tamanho: 16565728, sha256: "a62f8fa5ea080447c0689418d69e58f1e83e0b7adf9c142e2bd9bcc8045c0b11",
    },
  },
  slimsam: {
    codificador: {
      de: "https://huggingface.co/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/onnx/vision_encoder.onnx",
      tamanho: 23276014, sha256: "9f8433273a6750b587779baa0cf5508111001bf7e7acfcf585d370139fd366d0",
    },
    decodificador: {
      de: "https://huggingface.co/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/onnx/prompt_encoder_mask_decoder.onnx",
      tamanho: 16557892, sha256: "f4514391764fbd56e08e119060d874ecd7d52994bfb1968af159e12d4943b5bb",
    },
  },
};

let ort = null;
const carregarOrt = () => (ort = ort || require("onnxruntime-node"));
const tensor = (tipo, dados, forma) => new (carregarOrt().Tensor)(tipo, dados, forma);

const LADO_DA_REDE = 1024;

/** A foto reduzida ao lado da rede (o maior lado vira 1024), em RGB. */
async function reduzirParaARede(rgb, largura, altura) {
  const escala = LADO_DA_REDE / Math.max(largura, altura);
  const rl = Math.max(1, Math.round(largura * escala));
  const ra = Math.max(1, Math.round(altura * escala));
  const px = await sharp(rgb, { raw: { width: largura, height: altura, channels: 3 } })
    .resize(rl, ra, { fit: "fill", kernel: "linear" }).raw().toBuffer();
  return { px, rl, ra, escala };
}

const sigmoide = (v) => 1 / (1 + Math.exp(-v));

/** Os logits de UMA máscara (a partir de `deslocamento`) viram alfa de 0 a 255. */
function alfaDosLogits(logits, deslocamento, total) {
  const alfa = new Uint8Array(total);
  for (let i = 0; i < total; i++) alfa[i] = Math.round(255 * sigmoide(logits[deslocamento + i]));
  return alfa;
}

/** O índice da maior nota entre `de` e `ate`, inclusive. */
function melhor(notas, de, ate) {
  let k = de;
  for (let i = de + 1; i <= ate; i++) if (notas[i] > notas[k]) k = i;
  return k;
}

const mobilesam = {
  nome: "mobilesam",
  licenca: "MIT (exportação ONNX de Acly) sobre os pesos Apache 2.0 do MobileSAM",
  arquivos: { codificador: "mobilesam-codificador.onnx", decodificador: "mobilesam-decodificador.onnx" },
  aceitaCaixa: true,
  async codificar(sessoes, rgb, largura, altura) {
    const { px, rl, ra, escala } = await reduzirParaARede(rgb, largura, altura);
    // HWC de 0 a 255: a normalização e o enchimento até 1024 são da própria rede.
    const r = await sessoes.codificador.run({ input_image: tensor("float32", Float32Array.from(px), [ra, rl, 3]) });
    return { embeddings: r.image_embeddings, escala, largura, altura };
  },
  async decodificar(sessoes, leitura, { pontos, caixa }) {
    const { escala, largura, altura } = leitura;
    const coords = [], rotulos = [];
    for (const p of pontos) { coords.push(p.x * escala, p.y * escala); rotulos.push(p.inclui ? 1 : 0); }
    if (caixa) {
      coords.push(caixa.x0 * escala, caixa.y0 * escala, caixa.x1 * escala, caixa.y1 * escala);
      rotulos.push(2, 3);
    } else {
      // Sem caixa, o decodificador do SAM pede um ponto de enchimento (rótulo -1).
      coords.push(0, 0);
      rotulos.push(-1);
    }
    const n = rotulos.length;
    const r = await sessoes.decodificador.run({
      image_embeddings: leitura.embeddings,
      point_coords: tensor("float32", Float32Array.from(coords), [1, n, 2]),
      point_labels: tensor("float32", Float32Array.from(rotulos), [1, n]),
      mask_input: tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
      has_mask_input: tensor("float32", Float32Array.from([0]), [1]),
      orig_im_size: tensor("float32", Float32Array.from([altura, largura]), [2]),
    });
    const notas = r.iou_predictions.data;
    // Um ponto só é ambíguo (a letra, a palavra ou a camisa?): o SAM manda olhar
    // as três saídas múltiplas e ficar com a de maior nota. Com mais pontos, ou
    // com caixa, a primeira saída é a certa.
    const k = pontos.length === 1 && !caixa ? melhor(notas, 1, 3) : 0;
    const total = largura * altura;
    return { alfa: alfaDosLogits(r.masks.data, k * total, total), nota: notas[k] };
  },
};

const efficientsam = {
  nome: "efficientsam",
  licenca: "Apache 2.0 (yformer/EfficientSAM)",
  arquivos: { codificador: "efficientsam-codificador.onnx", decodificador: "efficientsam-decodificador.onnx" },
  aceitaCaixa: true,
  async codificar(sessoes, rgb, largura, altura) {
    const { px, rl, ra } = await reduzirParaARede(rgb, largura, altura);
    // CHW de 0 a 1; a rede estica para 1024 × 1024 e normaliza por dentro.
    const plano = rl * ra;
    const entrada = new Float32Array(3 * plano);
    for (let i = 0; i < plano; i++) {
      entrada[i] = px[i * 3] / 255;
      entrada[plano + i] = px[i * 3 + 1] / 255;
      entrada[2 * plano + i] = px[i * 3 + 2] / 255;
    }
    const r = await sessoes.codificador.run({ batched_images: tensor("float32", entrada, [1, 3, ra, rl]) });
    return { embeddings: r.image_embeddings, largura, altura };
  },
  async decodificar(sessoes, leitura, { pontos, caixa }) {
    const { largura, altura } = leitura;
    // Os pontos vão na medida da foto de trabalho: a rede reescala pelo `orig_im_size`.
    const coords = [], rotulos = [];
    for (const p of pontos) { coords.push(p.x, p.y); rotulos.push(p.inclui ? 1 : 0); }
    if (caixa) { coords.push(caixa.x0, caixa.y0, caixa.x1, caixa.y1); rotulos.push(2, 3); }
    const n = rotulos.length;
    const r = await sessoes.decodificador.run({
      image_embeddings: leitura.embeddings,
      batched_point_coords: tensor("float32", Float32Array.from(coords), [1, 1, n, 2]),
      batched_point_labels: tensor("float32", Float32Array.from(rotulos), [1, 1, n]),
      orig_im_size: tensor("int64", BigInt64Array.from([BigInt(altura), BigInt(largura)]), [2]),
    });
    const notas = r.iou_predictions.data;
    const k = melhor(notas, 0, notas.length - 1);
    const total = largura * altura;
    return { alfa: alfaDosLogits(r.output_masks.data, k * total, total), nota: notas[k] };
  },
};

const slimsam = {
  nome: "slimsam",
  licenca: "Apache 2.0 (nielsr/slimsam-77-uniform, ONNX de Xenova)",
  arquivos: { codificador: "slimsam-codificador.onnx", decodificador: "slimsam-decodificador.onnx" },
  aceitaCaixa: false,
  async codificar(sessoes, rgb, largura, altura) {
    const { px, rl, ra, escala } = await reduzirParaARede(rgb, largura, altura);
    // Normaliza e enche até 1024 × 1024 com zero DEPOIS de normalizar, como o SamProcessor.
    const L = LADO_DA_REDE, plano = L * L;
    const entrada = new Float32Array(3 * plano);
    const media = [0.485, 0.456, 0.406], desvio = [0.229, 0.224, 0.225];
    for (let y = 0; y < ra; y++) {
      for (let x = 0; x < rl; x++) {
        const de = (y * rl + x) * 3, para = y * L + x;
        for (let c = 0; c < 3; c++) entrada[c * plano + para] = (px[de + c] / 255 - media[c]) / desvio[c];
      }
    }
    const r = await sessoes.codificador.run({ pixel_values: tensor("float32", entrada, [1, 3, L, L]) });
    return { embeddings: r.image_embeddings, posicional: r.image_positional_embeddings, escala, rl, ra, largura, altura };
  },
  async decodificar(sessoes, leitura, { pontos, caixa }) {
    const { escala, rl, ra, largura, altura } = leitura;
    // Esta exportação não recebe caixa: sem pontos, a caixa vira um clique no meio dela.
    const pts = pontos.length ? pontos : [{ x: (caixa.x0 + caixa.x1) / 2, y: (caixa.y0 + caixa.y1) / 2, inclui: true }];
    const r = await sessoes.decodificador.run({
      input_points: tensor("float32", Float32Array.from(pts.flatMap((p) => [p.x * escala, p.y * escala])), [1, 1, pts.length, 2]),
      input_labels: tensor("int64", BigInt64Array.from(pts.map((p) => (p.inclui ? 1n : 0n))), [1, 1, pts.length]),
      image_embeddings: leitura.embeddings,
      image_positional_embeddings: leitura.posicional,
    });
    const notas = r.iou_scores.data;
    const k = melhor(notas, 0, 2);
    // A máscara sai em 256 × 256 do quadro de 1024: amplia, corta o enchimento, amplia até a foto.
    const baixa = Buffer.alloc(256 * 256);
    const d = r.pred_masks.data;
    for (let i = 0; i < 256 * 256; i++) baixa[i] = Math.round(255 * sigmoide(d[k * 65536 + i]));
    const quadro = await sharp(baixa, { raw: { width: 256, height: 256, channels: 1 } })
      .resize(LADO_DA_REDE, LADO_DA_REDE, { fit: "fill", kernel: "linear" })
      .extract({ left: 0, top: 0, width: rl, height: ra })
      .toColourspace("b-w").raw().toBuffer();
    const final = await sharp(quadro, { raw: { width: rl, height: ra, channels: 1 } })
      .resize(largura, altura, { fit: "fill", kernel: "linear" })
      .toColourspace("b-w").raw().toBuffer();
    return { alfa: new Uint8Array(final.buffer, final.byteOffset, final.length), nota: notas[k] };
  },
};

const ADAPTADORES = { mobilesam, efficientsam, slimsam };

// ==================== AS SESSÕES E AS LEITURAS ====================

function caminhosDaRede(nome, pasta = PASTA_DOS_MODELOS) {
  const a = ADAPTADORES[nome];
  return { codificador: path.join(pasta, a.arquivos.codificador), decodificador: path.join(pasta, a.arquivos.decodificador) };
}

/** Por que a rede não roda (falta arquivo), ou `null`. */
function porqueNaoRoda(nome = REDE_DO_EXTRATOR, pasta = PASTA_DOS_MODELOS) {
  const faltam = Object.values(caminhosDaRede(nome, pasta)).filter((f) => !fs.existsSync(f)).map((f) => path.basename(f));
  return faltam.length
    ? `A rede do Extrator não está instalada (faltam ${faltam.join(" e ")} em servidor/modelos). Rode \`npm run modelos\`.`
    : null;
}

const sessoesAbertas = new Map();

/** As duas sessões de uma rede, abertas uma vez (tarde: só quando alguém lê uma foto). */
function abrirSessoes(nome, pasta) {
  const chave = `${nome}@${pasta}`;
  if (!sessoesAbertas.has(chave)) {
    const c = caminhosDaRede(nome, pasta);
    const opcoes = { logSeverityLevel: 3, graphOptimizationLevel: "all" };
    const { InferenceSession } = carregarOrt();
    const prometida = Promise.all([InferenceSession.create(c.codificador, opcoes), InferenceSession.create(c.decodificador, opcoes)])
      .then(([codificador, decodificador]) => ({ codificador, decodificador }));
    prometida.catch(() => sessoesAbertas.delete(chave));
    sessoesAbertas.set(chave, prometida);
  }
  return sessoesAbertas.get(chave);
}

const VALIDADE_MS = Number(process.env.OPTIMIZE_EXTRATOR_VALIDADE_MS) || 30 * 60 * 1000;
const MAXIMO_DE_LEITURAS = 8;
/** id → { nome, pasta, leitura, ultimoUso }, na ordem do uso: o primeiro é o mais esquecido. */
const leituras = new Map();

function varrer(agora = Date.now()) {
  for (const [id, l] of leituras) if (agora - l.ultimoUso > VALIDADE_MS) leituras.delete(id);
  while (leituras.size > MAXIMO_DE_LEITURAS) leituras.delete(leituras.keys().next().value);
}

const falha = (mensagem, codigo) => Object.assign(new Error(mensagem), { codigo });

/** Lê a foto de trabalho (RGB) e guarda a leitura. */
async function lerFoto(rgb, largura, altura, { nome = REDE_DO_EXTRATOR, pasta = PASTA_DOS_MODELOS } = {}) {
  const motivo = porqueNaoRoda(nome, pasta);
  if (motivo) throw falha(motivo, "sem-rede");
  const sessoes = await abrirSessoes(nome, pasta);
  const t0 = Date.now();
  const leitura = await ADAPTADORES[nome].codificar(sessoes, rgb, largura, altura);
  const ms = Date.now() - t0;
  const id = crypto.randomUUID();
  leituras.set(id, { nome, pasta, leitura, ultimoUso: Date.now() });
  varrer();
  return { id, largura, altura, ms, aceitaCaixa: ADAPTADORES[nome].aceitaCaixa };
}

/** A máscara dos cliques sobre uma leitura guardada. Os pontos ficam dentro da foto. */
async function mascaraDe(id, { pontos, caixa }) {
  varrer();
  const guardada = leituras.get(id);
  if (!guardada) throw falha("A leitura desta foto venceu; lendo de novo.", "leitura-vencida");
  leituras.delete(id);
  guardada.ultimoUso = Date.now();
  leituras.set(id, guardada);

  const { largura, altura } = guardada.leitura;
  const dentro = (v, max) => Math.min(max - 1, Math.max(0, v));
  const pedido = {
    pontos: pontos.map((p) => ({ x: dentro(p.x, largura), y: dentro(p.y, altura), inclui: p.inclui })),
    caixa: caixa ? { x0: dentro(caixa.x0, largura), y0: dentro(caixa.y0, altura), x1: dentro(caixa.x1, largura), y1: dentro(caixa.y1, altura) } : null,
  };
  const sessoes = await abrirSessoes(guardada.nome, guardada.pasta);
  const t0 = Date.now();
  const r = await ADAPTADORES[guardada.nome].decodificar(sessoes, guardada.leitura, pedido);
  return { ...r, largura, altura, ms: Date.now() - t0 };
}

function estadoDaRede() {
  const motivo = porqueNaoRoda();
  return { rede: REDE_DO_EXTRATOR, pronta: !motivo, motivo, aceitaCaixa: ADAPTADORES[REDE_DO_EXTRATOR].aceitaCaixa, leituras: leituras.size };
}

module.exports = {
  ADAPTADORES, ORIGENS, REDE_DO_EXTRATOR, PASTA_DOS_MODELOS,
  caminhosDaRede, porqueNaoRoda, estadoDaRede, lerFoto, mascaraDe,
};
