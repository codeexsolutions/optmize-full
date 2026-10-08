/**
 * ===========================================================================
 * A AMPLIAÇÃO DO EXTRATOR — o jeito Foto em 4K
 * ===========================================================================
 *
 * O elemento de foto (degradê, rosto, foto) não vira vetor bom: ele é
 * ampliado pela rede da antiga tela Imagem, o Real-ESRGAN compacto
 * (`realesr-general-x4v3`, 4,7 MB, BSD-3-Clause), agora no servidor. No
 * `onnxruntime-node` um ladrilho de 128 px leva ~95 ms neste i5, contra
 * 2222 ms da tela antiga sem GPU.
 *
 * O que veio da tela Imagem, medido lá (2026-09-07), e continua valendo:
 *
 *   - a entrada do modelo é FIXA, 128 × 128: a imagem vai em ladrilhos com
 *     8 px de margem de cada lado (só o miolo de 112 é aproveitado — a borda
 *     da convolução não tem contexto), e fora da imagem a borda é REPETIDA,
 *     porque preto inventaria um contorno escuro;
 *   - a rede estica o contraste e clareia, e o tom é informação grossa que o
 *     original já tinha certa: a parte grossa da rede é trocada pela do
 *     original ampliado limpo, e o detalhe fica;
 *   - a dose ótima é 0,7: depois disso ela inventa demais e a fidelidade cai;
 *   - duas passadas, para passar de 4x, PIORAM: acima de 4x o miolo de cada
 *     ladrilho é esticado pelo sharp até o tamanho final.
 *
 * Cada ladrilho é desenhado já no tamanho FINAL (a memória segue a saída, e
 * não os 4x), e a transparência volta no fim, esticada à parte: a rede só
 * tem três canais.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PASTA_DOS_MODELOS = process.env.OPTIMIZE_EXTRATOR_MODELOS || path.join(__dirname, "modelos");
const ARQUIVO = path.join(PASTA_DOS_MODELOS, "realesr-general-x4v3.onnx");

/** Os mesmos bytes que a tela Imagem usava (estatico/ia/, até 0659ecf). */
const ORIGEM = {
  de: "https://huggingface.co/tamnvcc/Real-ESRGAN-General-x4v3_float/resolve/5d54986bf904e8d88e3b0a26957ff40e3af7463c/onnx/model.onnx",
  tamanho: 4876654,
  sha256: "83adcbbe5f96dc323c839abef6ca540e719bbdbd4c1bc91ffc7526f83073bedf",
};

const LADO = 128;
const MARGEM = 8;
const PASSO = LADO - 2 * MARGEM;
const ESCALA_DA_REDE = 4;
const DOSE = 0.7;
/** O maior PNG que o Extrator faz: o mesmo `TETO_DA_SAIDA` da tela (src/motores/extrator.js). */
const TETO_DA_SAIDA = 80_000_000;

function porqueNaoAmplia(arquivo = ARQUIVO) {
  return fs.existsSync(arquivo)
    ? null
    : "A rede de ampliação não está instalada (falta realesr-general-x4v3.onnx em servidor/modelos). Rode `npm run modelos`.";
}

const ladrilhosDe = (largura, altura) => Math.ceil(largura / PASSO) * Math.ceil(altura / PASSO);

/** Até 5% a mais, a rede só trocaria pixel bom por pixel inventado. */
const precisaDaRede = (largura, altura, W, H) => !(W <= largura * 1.05 && H <= altura * 1.05);

/** O ladrilho em CHW de 0 a 1, repetindo a borda fora da imagem. */
function recortar(rgba, largura, altura, x0, y0, destino) {
  const porCanal = LADO * LADO;
  for (let y = 0; y < LADO; y++) {
    const sy = Math.min(altura - 1, Math.max(0, y0 + y));
    for (let x = 0; x < LADO; x++) {
      const sx = Math.min(largura - 1, Math.max(0, x0 + x));
      const de = (sy * largura + sx) * 4, para = y * LADO + x;
      destino[para] = rgba[de] / 255;
      destino[porCanal + para] = rgba[de + 1] / 255;
      destino[2 * porCanal + para] = rgba[de + 2] / 255;
    }
  }
}

/** O miolo usado do ladrilho ampliado (sem a margem), em RGB de 0 a 255. A saída da rede escapa um pouco de 0..1: corta. */
function miolo(saida, usoX, usoY) {
  const L = LADO * ESCALA_DA_REDE, porCanal = L * L, corte = MARGEM * ESCALA_DA_REDE;
  const w = usoX * ESCALA_DA_REDE, h = usoY * ESCALA_DA_REDE;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const de = (corte + y) * L + corte + x, para = (y * w + x) * 3;
      px[para] = Math.max(0, Math.min(255, Math.round(saida[de] * 255)));
      px[para + 1] = Math.max(0, Math.min(255, Math.round(saida[porCanal + de] * 255)));
      px[para + 2] = Math.max(0, Math.min(255, Math.round(saida[2 * porCanal + de] * 255)));
    }
  }
  return { px, w, h };
}

/** Redimensiona pixels crus. Com um canal, o `b-w` é obrigatório: sem ele o sharp devolve três. */
async function redimensionar(px, w, h, canais, W, H, kernel = "lanczos3") {
  const p = sharp(px, { raw: { width: w, height: h, channels: canais } }).resize(W, H, { fit: "fill", kernel });
  return (canais === 1 ? p.toColourspace("b-w") : p).raw().toBuffer();
}

function separar(rgba, largura, altura) {
  const rgb = Buffer.alloc(largura * altura * 3), alfa = Buffer.alloc(largura * altura);
  for (let i = 0; i < largura * altura; i++) {
    rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2];
    alfa[i] = rgba[i * 4 + 3];
  }
  return { rgb, alfa };
}

async function ampliarComRede(rgba, largura, altura, W, H, rodar, { aoAndar = () => {}, cancelado = () => false } = {}) {
  const { rgb, alfa } = separar(rgba, largura, altura);
  const kx = W / largura, ky = H / altura;
  const rede = Buffer.alloc(W * H * 3);
  const entrada = new Float32Array(3 * LADO * LADO);
  const colunas = Math.ceil(largura / PASSO), linhas = Math.ceil(altura / PASSO), total = colunas * linhas;
  let feitos = 0;
  for (let ly = 0; ly < linhas; ly++) {
    for (let lx = 0; lx < colunas; lx++) {
      if (cancelado()) throw new Error("cancelado");
      recortar(rgba, largura, altura, lx * PASSO - MARGEM, ly * PASSO - MARGEM, entrada);
      const saida = await rodar(entrada);
      const usoX = Math.min(largura, (lx + 1) * PASSO) - lx * PASSO;
      const usoY = Math.min(altura, (ly + 1) * PASSO) - ly * PASSO;
      // O destino sai de coordenadas ABSOLUTAS arredondadas: arredondar a
      // largura de cada ladrilho sozinha deixaria fresta de um pixel.
      const ex = Math.round(lx * PASSO * kx), ey = Math.round(ly * PASSO * ky);
      const lw = Math.round((lx * PASSO + usoX) * kx) - ex, lh = Math.round((ly * PASSO + usoY) * ky) - ey;
      if (lw > 0 && lh > 0) {
        const m = miolo(saida, usoX, usoY);
        const pedaco = await redimensionar(m.px, m.w, m.h, 3, lw, lh);
        for (let y = 0; y < lh; y++) pedaco.copy(rede, ((ey + y) * W + ex) * 3, y * lw * 3, (y + 1) * lw * 3);
      }
      aoAndar(++feitos, total);
    }
  }
  // O tom da rede trocado pelo do original: limpo + DOSE × (rede − parte grossa da rede).
  const limpo = await redimensionar(rgb, largura, altura, 3, W, H);
  const grosso = await redimensionar(await redimensionar(rede, W, H, 3, largura, altura), largura, altura, 3, W, H);
  const alfaGrande = await redimensionar(alfa, largura, altura, 1, W, H, "linear");
  const pronto = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    for (let k = 0; k < 3; k++) {
      pronto[i * 4 + k] = Math.max(0, Math.min(255, Math.round(limpo[i * 3 + k] + DOSE * (rede[i * 3 + k] - grosso[i * 3 + k]))));
    }
    pronto[i * 4 + 3] = alfaGrande[i];
  }
  return { rgba: pronto, largura: W, altura: H, total };
}

/** Sem a rede: só esticar (cor em lanczos, transparência em linear). */
async function esticar(rgba, largura, altura, W, H) {
  const { rgb, alfa } = separar(rgba, largura, altura);
  const cor = await redimensionar(rgb, largura, altura, 3, W, H);
  const a = await redimensionar(alfa, largura, altura, 1, W, H, "linear");
  const pronto = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    pronto[i * 4] = cor[i * 3]; pronto[i * 4 + 1] = cor[i * 3 + 1]; pronto[i * 4 + 2] = cor[i * 3 + 2]; pronto[i * 4 + 3] = a[i];
  }
  return { rgba: pronto, largura: W, altura: H, total: 1 };
}

let sessao = null;

/** A rede aberta uma vez, tarde (na primeira ampliação), como `rodar(entrada) → saída`. */
async function abrirSessao(arquivo) {
  if (!sessao || sessao.arquivo !== arquivo) {
    const ort = require("onnxruntime-node");
    const s = await ort.InferenceSession.create(arquivo, { logSeverityLevel: 3, graphOptimizationLevel: "all" });
    const entrada = s.inputNames[0], saida = s.outputNames[0];
    sessao = { arquivo, rodar: async (dados) => (await s.run({ [entrada]: new ort.Tensor("float32", dados, [1, 3, LADO, LADO]) }))[saida].data };
  }
  return sessao.rodar;
}

/** Amplia o elemento (RGBA cru) até W × H. */
async function ampliar(rgba, largura, altura, W, H, { aoAndar = () => {}, cancelado = () => false, arquivo = ARQUIVO } = {}) {
  if (!precisaDaRede(largura, altura, W, H)) {
    const r = await esticar(rgba, largura, altura, W, H);
    aoAndar(1, 1);
    return r;
  }
  const motivo = porqueNaoAmplia(arquivo);
  if (motivo) throw Object.assign(new Error(motivo), { codigo: "sem-rede" });
  return ampliarComRede(rgba, largura, altura, W, H, await abrirSessao(arquivo), { aoAndar, cancelado });
}

module.exports = {
  ARQUIVO, ORIGEM, LADO, MARGEM, PASSO, DOSE, TETO_DA_SAIDA,
  porqueNaoAmplia, ladrilhosDe, precisaDaRede, ampliarComRede, ampliar,
};
