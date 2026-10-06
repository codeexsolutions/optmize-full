/**
 * ===========================================================================
 * A API DO EXTRATOR — a foto, os cliques e os arquivos do elemento
 * ===========================================================================
 *
 * Tudo o que é pesado no Extrator mora aqui, pelo mesmo motivo do
 * reconhecimento facial: o `onnxruntime-node` usa os seis núcleos em código
 * nativo, e a tela não trava esperando.
 *
 *   GET    /estado        a rede está instalada? (e a de ampliar)
 *   POST   /ler           a foto de trabalho, crua → { id, largura, altura, ms, aceitaCaixa }
 *   POST   /mascara       { id, pontos, caixa } → PNG cinza (a máscara), X-Mascara-Nota
 *   POST   /ampliar       o RGBA cru do elemento → { id, total }
 *   GET    /ampliar/:id   o andamento, ou o PNG pronto
 *   DELETE /ampliar/:id   cancela
 *   POST   /png           { svg, largura, altura } → PNG transparente
 *
 * A foto sobe CRUA (`express.raw`), e não em base64 num JSON: é um arquivo de
 * megabytes, e o JSON custaria um terço a mais — a regra do `arte-entrada.js`.
 * Por isso o router é montado antes do `express.json` geral, no `server.js`.
 *
 * Toda falha volta como `{ error, codigo }` com a mensagem em português: é o
 * texto que a tela mostra, sem tradução no meio.
 */

const express = require("express");
const sharp = require("sharp");
const crypto = require("crypto");
const rede = require("./extrator-rede");
const ampliar = require("./extrator-ampliar");

const router = express.Router();

/** O teto da foto que chega. A tela já manda a de trabalho (lado maior em 2048); isto é a guarda. */
const TETO_DE_PIXELS = 40e6;

const falha = (mensagem, status, codigo = null) => Object.assign(new Error(mensagem), { status, codigo });
const ILEGIVEL = "Não consegui abrir a foto: o Extrator lê JPG, PNG e WebP.";

/** A foto do corpo cru, em RGB, virada pelo EXIF. */
async function fotoDoCorpo(bytes) {
  let meta;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    throw falha(ILEGIVEL, 415, "foto-ilegivel");
  }
  const pixels = (meta.width || 0) * (meta.height || 0);
  if (!pixels) throw falha(ILEGIVEL, 415, "foto-ilegivel");
  if (pixels > TETO_DE_PIXELS) {
    throw falha(`A foto tem ${Math.round(pixels / 1e6)} megapixels (${meta.width} × ${meta.height}); `
      + `o Extrator lê até ${TETO_DE_PIXELS / 1e6}.`, 413, "foto-grande");
  }
  const { data, info } = await sharp(bytes, { limitInputPixels: TETO_DE_PIXELS })
    .rotate().removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, largura: info.width, altura: info.height };
}

/** O pedido de máscara, conferido. Os pontos são levados para dentro da foto em `mascaraDe`. */
function lerPedidoDeMascara(corpo) {
  if (!corpo || typeof corpo.id !== "string" || !corpo.id) return { erro: "Faltou o id da leitura da foto." };
  const pontos = Array.isArray(corpo.pontos) ? corpo.pontos : [];
  if (pontos.length > 32) return { erro: "Pontos demais: no máximo 32 por elemento." };
  const lidos = [];
  for (const p of pontos) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { erro: "Veio um ponto sem posição." };
    lidos.push({ x: p.x, y: p.y, inclui: p.inclui !== false });
  }
  let caixa = null;
  if (corpo.caixa != null) {
    const c = corpo.caixa;
    if (![c.x0, c.y0, c.x1, c.y1].every(Number.isFinite)) return { erro: "Veio uma caixa sem posição." };
    caixa = { x0: Math.min(c.x0, c.x1), y0: Math.min(c.y0, c.y1), x1: Math.max(c.x0, c.x1), y1: Math.max(c.y0, c.y1) };
  }
  if (!caixa && !lidos.some((p) => p.inclui)) {
    return { erro: "Clique em cima do elemento (o clique que inclui) ou passe uma caixa em volta dele." };
  }
  return { id: corpo.id, pontos: lidos, caixa };
}

function responder(res, erro) {
  const status = erro.status || (erro.codigo === "sem-rede" ? 503 : erro.codigo === "leitura-vencida" ? 410 : 500);
  res.status(status).json({ error: erro.message || "O Extrator não conseguiu terminar.", codigo: erro.codigo || null });
}

router.get("/estado", (req, res) => res.json({ ...rede.estadoDaRede(), ampliar: ampliar.porqueNaoAmplia() }));

router.post("/ler", express.raw({ limit: "80mb", type: () => true }), async (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: "Não veio foto nenhuma.", codigo: null });
  try {
    const foto = await fotoDoCorpo(req.body);
    res.json(await rede.lerFoto(foto.rgb, foto.largura, foto.altura));
  } catch (erro) {
    responder(res, erro);
  }
});

router.post("/mascara", express.json({ limit: "1mb" }), async (req, res) => {
  const pedido = lerPedidoDeMascara(req.body);
  if (pedido.erro) return res.status(400).json({ error: pedido.erro, codigo: null });
  try {
    const m = await rede.mascaraDe(pedido.id, pedido);
    const png = await sharp(Buffer.from(m.alfa.buffer, m.alfa.byteOffset, m.alfa.length),
      { raw: { width: m.largura, height: m.altura, channels: 1 } }).png().toBuffer();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Mascara-Nota", String(m.nota));
    res.setHeader("Access-Control-Expose-Headers", "X-Mascara-Nota");
    res.send(png);
  } catch (erro) {
    responder(res, erro);
  }
});

/** O pedido de ampliação: a medida do elemento, a da saída, e os bytes batendo com a medida. */
function lerPedidoDeAmpliar(query, bytes) {
  const largura = Number(query.largura), altura = Number(query.altura);
  const saidaLargura = Number(query.saidaLargura), saidaAltura = Number(query.saidaAltura);
  if (![largura, altura, saidaLargura, saidaAltura].every((v) => Number.isInteger(v) && v > 0)) {
    return { erro: "Faltou a medida do elemento ou da saída." };
  }
  if (!bytes || bytes.length !== largura * altura * 4) return { erro: "O elemento não veio inteiro: o tamanho não bate com a medida." };
  if (saidaLargura * saidaAltura > ampliar.TETO_DA_SAIDA) {
    return { erro: `A saída pedida passa de ${ampliar.TETO_DA_SAIDA / 1e6} megapixels.` };
  }
  return { largura, altura, saidaLargura, saidaAltura };
}

/**
 * As ampliações em andamento: id → { feitos, total, png, erro, cancelado, criado }.
 * Uma de cada vez, na fila: duas ao mesmo tempo dividiriam os mesmos núcleos.
 * A tela pergunta o andamento a cada 400 ms; a que ninguém buscar some em 30 min.
 */
const ampliacoes = new Map();
const VALIDADE_DA_AMPLIACAO_MS = 30 * 60 * 1000;
let fila = Promise.resolve();

router.post("/ampliar", express.raw({ limit: "400mb", type: () => true }), (req, res) => {
  const pedido = lerPedidoDeAmpliar(req.query, req.body);
  if (pedido.erro) return res.status(400).json({ error: pedido.erro, codigo: null });
  const { largura, altura, saidaLargura, saidaAltura } = pedido;
  const comRede = ampliar.precisaDaRede(largura, altura, saidaLargura, saidaAltura);
  const motivo = comRede ? ampliar.porqueNaoAmplia() : null;
  if (motivo) return res.status(503).json({ error: motivo, codigo: "sem-rede" });

  const agora = Date.now();
  for (const [id, a] of ampliacoes) if (agora - a.criado > VALIDADE_DA_AMPLIACAO_MS) ampliacoes.delete(id);
  const id = crypto.randomUUID();
  const a = { feitos: 0, total: comRede ? ampliar.ladrilhosDe(largura, altura) : 1, png: null, erro: null, cancelado: false, criado: agora };
  ampliacoes.set(id, a);
  const rgba = req.body;
  fila = fila
    .then(() => (a.cancelado ? null : ampliar.ampliar(rgba, largura, altura, saidaLargura, saidaAltura, {
      aoAndar: (feitos, total) => { a.feitos = feitos; a.total = total; },
      cancelado: () => a.cancelado,
    })))
    .then(async (r) => {
      if (r && !a.cancelado) a.png = await sharp(r.rgba, { raw: { width: r.largura, height: r.altura, channels: 4 } }).png().toBuffer();
    })
    .catch((erro) => { a.erro = erro.message; });
  res.json({ id, total: a.total });
});

router.get("/ampliar/:id", (req, res) => {
  const a = ampliacoes.get(req.params.id);
  if (!a) return res.status(404).json({ error: "Essa ampliação não existe mais: venceu ou foi cancelada.", codigo: null });
  if (a.erro) {
    ampliacoes.delete(req.params.id);
    return res.status(500).json({ error: `A ampliação falhou: ${a.erro}`, codigo: null });
  }
  if (!a.png) return res.json({ feitos: a.feitos, total: a.total });
  ampliacoes.delete(req.params.id);
  res.setHeader("Content-Type", "image/png");
  res.send(a.png);
});

router.delete("/ampliar/:id", (req, res) => {
  const a = ampliacoes.get(req.params.id);
  if (a) {
    a.cancelado = true;
    ampliacoes.delete(req.params.id);
  }
  res.json({ ok: true });
});

module.exports = router;
module.exports.fotoDoCorpo = fotoDoCorpo;
module.exports.lerPedidoDeMascara = lerPedidoDeMascara;
module.exports.lerPedidoDeAmpliar = lerPedidoDeAmpliar;
