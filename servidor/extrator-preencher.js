/**
 * ===========================================================================
 * O PREENCHIMENTO DO EXTRATOR — a LaMa inventa o que a foto não tem
 * ===========================================================================
 *
 * As peças da camisa saem do mockup como um retângulo cheio, e o mockup não
 * tem tudo: o decote, as cavas e as faixas em cima e embaixo ficam vazios.
 * Quem preenche é a LaMa (big-lama, Apache 2.0), rodando aqui pelo mesmo
 * `onnxruntime-node` da ampliação.
 *
 * O que foi medido neste i5-8400 (2026-10-07, `lama_fp32.onnx`):
 *
 *   - entrada FIXA de 512 × 512: `image` em RGB de 0 a 1 e `mask` com 1 no
 *     buraco; a saída `output` já vem de 0 a 255;
 *   - ~2,2 s por ladrilho e ~13 s para abrir a rede (só na primeira vez);
 *   - num degradê com um buraco de 128 × 128, erro médio de 3,4 e máximo de
 *     10 (em 255) — a continuação é boa.
 *
 * A montagem chega com até 2048 de lado; a LaMa trabalha nela reduzida a
 * `LADO_DO_PREENCHIMENTO` (1024), em ladrilhos de 512 que se sobrepõem. O
 * ladrilho seguinte é sempre o que tem MAIS arte conhecida, e o que um
 * ladrilho inventou vira arte conhecida para o próximo: é assim que um buraco
 * maior que um ladrilho é preenchido de fora para dentro, sem emenda.
 *
 * No fim, só o buraco é trocado: a arte que veio da foto volta byte a byte.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PASTA_DOS_MODELOS = process.env.OPTIMIZE_EXTRATOR_MODELOS || path.join(__dirname, "modelos");
const ARQUIVO = path.join(PASTA_DOS_MODELOS, "lama_fp32.onnx");

/** O `lama_fp32.onnx` do Carve/LaMa-ONNX (o recomendado lá; o `lama.onnx` é mais lento). */
const ORIGEM = {
  de: "https://huggingface.co/Carve/LaMa-ONNX/resolve/c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx",
  tamanho: 208044816,
  sha256: "1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6",
};

const LADO = 512;
/** Quanto um ladrilho avança sobre o anterior: o que ele vê da arte já preenchida. */
const SOBRA = 64;
const LADO_DO_PREENCHIMENTO = 1024;

function porqueNaoPreenche(arquivo = ARQUIVO) {
  return fs.existsSync(arquivo)
    ? null
    : "A rede de preenchimento não está instalada (falta lama_fp32.onnx em servidor/modelos). Rode `npm run modelos`.";
}

/** O buraco: o pixel com alfa abaixo de 128. */
function buracoDe(rgba, total) {
  const b = new Uint8Array(total);
  let n = 0;
  for (let i = 0; i < total; i++) if (rgba[i * 4 + 3] < 128) { b[i] = 1; n++; }
  return { buraco: b, n };
}

/** As posições dos ladrilhos numa dimensão: de LADO em LADO − SOBRA, o último encostado no fim. */
function posicoes(tamanho) {
  if (tamanho <= LADO) return [0];
  const p = [];
  for (let v = 0; v + LADO < tamanho; v += LADO - SOBRA) p.push(v);
  p.push(tamanho - LADO);
  return p;
}

/** Quantos ladrilhos têm buraco: o `total` do andamento. */
function ladrilhosComBuraco(buraco, largura, altura) {
  let n = 0;
  for (const y0 of posicoes(altura)) {
    for (const x0 of posicoes(largura)) if (contar(buraco, largura, altura, x0, y0).buraco > 0) n++;
  }
  return n;
}

/** O que um ladrilho tem de buraco e de arte (fora da imagem não conta). */
function contar(buraco, largura, altura, x0, y0) {
  let b = 0, a = 0;
  for (let y = y0; y < Math.min(altura, y0 + LADO); y++) {
    for (let x = x0; x < Math.min(largura, x0 + LADO); x++) {
      if (buraco[y * largura + x]) b++; else a++;
    }
  }
  return { buraco: b, arte: a };
}

/**
 * O preenchimento, numa imagem que já está na escala da LaMa. `rgb` é mexido
 * no lugar; `rodar(imagem, mascara)` é a rede (ou a de mentira da bancada).
 */
async function preencherNaEscala(rgb, buraco, largura, altura, rodar, { aoAndar = () => {}, cancelado = () => false } = {}) {
  const ladrilhos = [];
  for (const y0 of posicoes(altura)) for (const x0 of posicoes(largura)) ladrilhos.push({ x0, y0 });
  const imagem = new Float32Array(3 * LADO * LADO), mascara = new Float32Array(LADO * LADO);
  const porCanal = LADO * LADO;
  let feitos = 0;
  for (;;) {
    // O próximo é o que tem mais arte conhecida; sem arte nenhuma, ainda não dá.
    let melhor = null, melhorArte = 0;
    for (const l of ladrilhos) {
      const c = contar(buraco, largura, altura, l.x0, l.y0);
      if (c.buraco > 0 && c.arte > melhorArte) { melhor = l; melhorArte = c.arte; }
    }
    if (!melhor) break;
    if (cancelado()) throw new Error("cancelado");
    // Fora da imagem (só quando ela é menor que o ladrilho), a borda é repetida e vale como arte.
    for (let y = 0; y < LADO; y++) {
      const sy = Math.min(altura - 1, melhor.y0 + y);
      for (let x = 0; x < LADO; x++) {
        const sx = Math.min(largura - 1, melhor.x0 + x);
        const de = sy * largura + sx, para = y * LADO + x;
        const furo = buraco[de];
        mascara[para] = furo;
        imagem[para] = furo ? 0 : rgb[de * 3] / 255;
        imagem[porCanal + para] = furo ? 0 : rgb[de * 3 + 1] / 255;
        imagem[2 * porCanal + para] = furo ? 0 : rgb[de * 3 + 2] / 255;
      }
    }
    const saida = await rodar(imagem, mascara);
    for (let y = melhor.y0; y < Math.min(altura, melhor.y0 + LADO); y++) {
      for (let x = melhor.x0; x < Math.min(largura, melhor.x0 + LADO); x++) {
        const i = y * largura + x;
        if (!buraco[i]) continue;
        const para = (y - melhor.y0) * LADO + (x - melhor.x0);
        for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.max(0, Math.min(255, Math.round(saida[k * porCanal + para])));
        buraco[i] = 0;
      }
    }
    // O ladrilho também preenche o buraco do vizinho que se sobrepõe a ele: o
    // total é recontado a cada passo, e o andamento termina em "n de n".
    feitos++;
    aoAndar(feitos, feitos + ladrilhosComBuraco(buraco, largura, altura));
  }
  return { feitos };
}

/**
 * Preenche a montagem (RGBA cru; alfa abaixo de 128 = inventar) e devolve
 * `{ rgb, largura, altura, inventado }` — RGB cheio, sem transparência.
 */
async function preencherComRede(rgba, largura, altura, rodar, opcoes = {}) {
  const total = largura * altura;
  const { buraco, n } = buracoDe(rgba, total);
  const rgb = Buffer.alloc(total * 3);
  for (let i = 0; i < total; i++) {
    rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }
  if (n === 0) return { rgb, largura, altura, inventado: 0 };
  if (n === total) throw Object.assign(new Error("A peça não tem arte nenhuma para continuar."), { codigo: "sem-arte" });

  const k = Math.min(1, LADO_DO_PREENCHIMENTO / Math.max(largura, altura));
  const L = Math.max(1, Math.round(largura * k)), A = Math.max(1, Math.round(altura * k));
  let pequeno = rgb, buracoPequeno = buraco;
  if (k < 1) {
    pequeno = await sharp(rgb, { raw: { width: largura, height: altura, channels: 3 } })
      .resize(L, A, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
    // O buraco reduzido em linear, e qualquer mistura com o buraco é buraco:
    // a cor do vazio vazou para esses pixels na redução.
    const m = Buffer.from(buraco.map((v) => v * 255));
    const mp = await sharp(m, { raw: { width: largura, height: altura, channels: 1 } })
      .resize(L, A, { fit: "fill", kernel: "linear" }).toColourspace("b-w").raw().toBuffer();
    buracoPequeno = new Uint8Array(L * A);
    for (let i = 0; i < L * A; i++) buracoPequeno[i] = mp[i] > 0 ? 1 : 0;
  } else {
    pequeno = Buffer.from(rgb);
    buracoPequeno = Uint8Array.from(buraco);
  }
  await preencherNaEscala(pequeno, buracoPequeno, L, A, rodar, opcoes);

  const grande = k < 1
    ? await sharp(pequeno, { raw: { width: L, height: A, channels: 3 } }).resize(largura, altura, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer()
    : pequeno;
  for (let i = 0; i < total; i++) {
    if (!buraco[i]) continue;
    rgb[i * 3] = grande[i * 3]; rgb[i * 3 + 1] = grande[i * 3 + 1]; rgb[i * 3 + 2] = grande[i * 3 + 2];
  }
  return { rgb, largura, altura, inventado: n / total };
}

/**
 * Quantos ladrilhos o preenchimento desta montagem roda, no máximo: o `total`
 * do andamento antes de começar (o de verdade pode ser menor, e é recontado).
 */
function ladrilhosDe(rgba, largura, altura) {
  const k = Math.min(1, LADO_DO_PREENCHIMENTO / Math.max(largura, altura));
  const L = Math.max(1, Math.round(largura * k)), A = Math.max(1, Math.round(altura * k));
  return posicoes(L).length * posicoes(A).length;
}

let sessao = null;

/** A rede aberta uma vez, tarde (no primeiro preenchimento), como `rodar(imagem, mascara) → saída`. */
async function abrirSessao(arquivo) {
  if (!sessao || sessao.arquivo !== arquivo) {
    const ort = require("onnxruntime-node");
    const s = await ort.InferenceSession.create(arquivo, { logSeverityLevel: 3, graphOptimizationLevel: "all" });
    sessao = {
      arquivo,
      rodar: async (imagem, mascara) => (await s.run({
        image: new ort.Tensor("float32", imagem, [1, 3, LADO, LADO]),
        mask: new ort.Tensor("float32", mascara, [1, 1, LADO, LADO]),
      })).output.data,
    };
  }
  return sessao.rodar;
}

async function preencher(rgba, largura, altura, { aoAndar = () => {}, cancelado = () => false, arquivo = ARQUIVO } = {}) {
  const motivo = porqueNaoPreenche(arquivo);
  if (motivo) throw Object.assign(new Error(motivo), { codigo: "sem-rede" });
  return preencherComRede(rgba, largura, altura, await abrirSessao(arquivo), { aoAndar, cancelado });
}

module.exports = {
  ARQUIVO, ORIGEM, LADO, SOBRA, LADO_DO_PREENCHIMENTO,
  porqueNaoPreenche, posicoes, ladrilhosDe, preencherComRede, preencher,
};
