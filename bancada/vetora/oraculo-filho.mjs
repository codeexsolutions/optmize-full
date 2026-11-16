/*
 * Um trabalhador do oráculo (ver `oraculo.mjs`): recebe sementes, devolve uma
 * linha por semente — as características da imagem e a nota de cada ajuste.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { gerarLogo, sortearEstrago } from "./logos.mjs";
import { imagemDoCliente, nota, rasterizarSvg, tamanhoDaNota } from "./imagem.mjs";

sharp.concurrency(1);
const require = createRequire(import.meta.url);
const motor = await import(pathToFileURL(process.env.VETORA_MOTOR).href);
const { AJUSTES, AJUSTES_COM_IA, LADO_COM_IA } = JSON.parse(process.env.VETORA_AJUSTES);

// A rede de ampliar, com um fio só (os trabalhadores já ocupam os núcleos).
let rodarRede = null;
async function rede() {
  if (rodarRede !== null) return rodarRede;
  const ampliar = require("../../servidor/extrator-ampliar.js");
  if (ampliar.porqueNaoAmplia()) { rodarRede = false; return false; }
  const ort = require("onnxruntime-node");
  const s = await ort.InferenceSession.create(ampliar.ARQUIVO, { logSeverityLevel: 3, graphOptimizationLevel: "all", intraOpNumThreads: 1, interOpNumThreads: 1 });
  const entrada = s.inputNames[0], saida = s.outputNames[0];
  const run = async (dados) => (await s.run({ [entrada]: new ort.Tensor("float32", dados, [1, 3, ampliar.LADO, ampliar.LADO]) }))[saida].data;
  rodarRede = { ampliar, run };
  return rodarRede;
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;

async function medir(semente) {
  const logo = gerarLogo(semente);
  const estrago = sortearEstrago(semente, !logo.fundo);
  const img = await imagemDoCliente(logo, estrago);
  const [nw, nh] = tamanhoDaNota(img.width, img.height);
  const verdade = await rasterizarSvg(logo.svg, nw, nh, true);
  const t0 = Date.now();
  const c = motor.caracteristicas(img.data, img.width, img.height);
  const msCarac = Date.now() - t0;
  const resultados = [];
  const avaliar = async (px, w, h, ajuste, ia, escala) => {
    const t = Date.now();
    const r = motor.vetorizar(px, w, h, { detalhe: ajuste.d, suavidade: ajuste.s, escala });
    const ms = Date.now() - t;
    if (r.erro) { resultados.push({ d: ajuste.d, s: ajuste.s, ia, falhou: 1 }); return; }
    const n = await nota(r.svg, verdade);
    resultados.push({ d: ajuste.d, s: ajuste.s, ia, certos: r4(n.certos), erro: r4(n.erro), nos: r.estatisticas.nos, cores: r.estatisticas.cores, kb: Math.round(r.svg.length / 102.4) / 10, ms });
  };
  for (const a of AJUSTES) await avaliar(img.data, img.width, img.height, a, 0, 1);
  const lado = Math.max(img.width, img.height);
  let msIa = 0;
  // A IA em metade das imagens pequenas (as de semente par): ela custa uns
  // 6 s por imagem, e metade basta para a rede aprender quando ela ajuda.
  if (lado <= LADO_COM_IA && semente % 2 === 0) {
    const rr = await rede();
    if (rr) {
      const fator = Math.max(2, Math.min(4, Math.floor(2048 / lado)));
      const t = Date.now();
      const amp = await rr.ampliar.ampliarComRede(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), img.width, img.height, img.width * fator, img.height * fator, rr.run);
      msIa = Date.now() - t;
      const px = new Uint8ClampedArray(amp.rgba.buffer, amp.rgba.byteOffset, amp.rgba.length);
      for (const a of AJUSTES_COM_IA) await avaliar(px, amp.largura, amp.altura, a, 1, 1 / fator);
    }
  }
  return {
    semente, tipo: logo.tipo, jeito: estrago.jeito, qualidade: estrago.qualidade, largura: img.width, altura: img.height,
    coresDaVerdade: logo.cores, transparente: !logo.fundo,
    carac: Array.from(c.valores, r4), versaoCarac: motor.VERSAO_DAS_CARACTERISTICAS, msCarac, msIa,
    resultados,
  };
}

process.on("message", async (msg) => {
  if (msg && msg.fim) process.exit(0);
  try {
    const linha = await medir(msg.semente);
    process.send({ semente: msg.semente, linha });
  } catch (erro) {
    process.send({ semente: msg.semente, erro: String((erro && erro.stack) || erro) });
  }
});
process.send({ pronto: true });
