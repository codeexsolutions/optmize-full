/*
 * BANCADA — a rede de recorte do Extrator, de verdade (fora da CI: precisa dos modelos)
 *
 *     npm run modelos && npm run bancada:extrator-rede
 *
 *   1. a API num servidor de verdade (o router num express na memória):
 *      /estado, /ler, /mascara e a leitura vencida;
 *   2. a foto de mentira: o clique no disco dá a máscara do disco;
 *   3. as fotos reais com gabarito (D:/arte/extrator, ou EXTRATOR_FOTOS): cada
 *      elemento com IoU >= 0,7 e dentro >= 0,85, e o /ler em até 6 s por foto.
 *      Sem a pasta, só a foto de mentira.
 *   4. a ampliação de verdade, pela API: 300 × 200 → 1200 × 800 com as cores
 *      no lugar, e o cancelamento.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { avaliarMascara, fotoDeTrabalho, fotoSintetica, lerGabaritos, PASTA_DAS_FOTOS } from "./extrator-comum.mjs";

const require = createRequire(import.meta.url);
const express = require("express");
const sharp = require("sharp");
const rede = require("../servidor/extrator-rede.js");

const { carregarModulo } = await import("./carregarModulo.mjs");
const rec = await carregarModulo("src/motores/recorte.js");
const ext = await carregarModulo("src/motores/extrator.js");

const motivo = rede.porqueNaoRoda();
if (motivo) {
  console.error(`conferir-extrator-rede: ${motivo}`);
  process.exit(1);
}

const app = express();
app.use("/api/extrator", require("../servidor/extrator-api.js"));
const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}/api/extrator`;

const pngDe = (f) => sharp(f.rgb, { raw: { width: f.largura, height: f.altura, channels: 3 } }).png().toBuffer();

async function ler(foto) {
  const t0 = Date.now();
  const r = await fetch(`${base}/ler`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: await pngDe(foto) });
  assert.equal(r.status, 200, `o /ler respondeu ${r.status}`);
  return { ...(await r.json()), msTotal: Date.now() - t0 };
}

async function mascara(id, pontos, caixa = null) {
  const r = await fetch(`${base}/mascara`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, pontos, caixa }),
  });
  if (!r.ok) return { status: r.status, ...(await r.json()) };
  const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  return { status: 200, alfa: data, largura: info.width, altura: info.height, nota: Number(r.headers.get("X-Mascara-Nota")) };
}

try {
  // 1. o estado
  const estado = await (await fetch(`${base}/estado`)).json();
  assert.equal(estado.pronta, true);
  assert.equal(estado.rede, rede.REDE_DO_EXTRATOR);

  // 2. a foto de mentira, pela API
  const s = await fotoSintetica();
  const lida = await ler(s);
  assert.deepEqual([lida.largura, lida.altura], [s.largura, s.altura]);
  const m = await mascara(lida.id, [{ x: s.disco.clique[0], y: s.disco.clique[1], inclui: true }]);
  assert.equal(m.status, 200);
  const n = avaliarMascara(m.alfa, m.largura, m.altura, s.disco.caixa);
  assert.ok(n.iou >= 0.9 && n.dentro >= 0.95, `o disco: IoU ${n.iou.toFixed(3)}, dentro ${n.dentro.toFixed(3)}`);
  const vencida = await mascara("nao-existe", [{ x: 1, y: 1, inclui: true }]);
  assert.equal(vencida.status, 410);
  assert.equal(vencida.codigo, "leitura-vencida");
  console.log(`  foto de mentira: IoU ${n.iou.toFixed(3)} · /ler ${lida.msTotal} ms`);

  // 3. as fotos reais
  const fotos = lerGabaritos(PASTA_DAS_FOTOS);
  if (fotos.length === 0) console.log(`  (sem fotos com gabarito em ${PASTA_DAS_FOTOS}: só a foto de mentira)`);
  const jeitos = { certos: 0, total: 0, errados: [] };
  const falhas = [];
  for (const f of fotos) {
    const foto = await fotoDeTrabalho(f.foto);
    const l = await ler(foto);
    if (l.msTotal > 6000) falhas.push(`${f.nome}: o /ler levou ${l.msTotal} ms (teto 6000)`);
    const rgba = new Uint8ClampedArray(foto.largura * foto.altura * 4);
    for (let i = 0; i < foto.largura * foto.altura; i++) rgba.set([foto.rgb[i * 3], foto.rgb[i * 3 + 1], foto.rgb[i * 3 + 2], 255], i * 4);
    for (const e of f.elementos) {
      const r = await mascara(l.id, [{ x: e.clique[0], y: e.clique[1], inclui: true }]);
      const a = avaliarMascara(r.alfa, r.largura, r.altura, e.caixa);
      if (a.iou < 0.7 || a.dentro < 0.85) falhas.push(`${f.nome} / ${e.nome}: IoU ${a.iou.toFixed(2)}, dentro ${a.dentro.toFixed(2)}`);
      if (e.jeito) {
        const recorte = rec.aplicarMascara(rgba, foto.largura, foto.altura, r.alfa);
        const sugerido = recorte ? ext.jeitoSugerido(recorte.rgba) : "nada";
        jeitos.total++;
        if (sugerido === e.jeito) jeitos.certos++;
        else jeitos.errados.push(`${f.nome} / ${e.nome}: sugeriu ${sugerido}, era ${e.jeito}`);
      }
    }
    console.log(`  ${f.nome}: ${f.elementos.length} elemento(s), /ler ${l.msTotal} ms`);
  }
  assert.deepEqual(falhas, [], falhas.join("\n"));

  if (jeitos.total) {
    console.log(`  jeito sugerido: ${jeitos.certos} de ${jeitos.total}`);
    assert.ok(jeitos.certos / jeitos.total >= 0.8, `o jeito sugerido errou demais:\n${jeitos.errados.join("\n")}`);
  }

  // 4. a ampliação de verdade
  const ampliar = require("../servidor/extrator-ampliar.js");
  assert.equal(ampliar.porqueNaoAmplia(), null, ampliar.porqueNaoAmplia() || "");
  const w = 300, h = 200, rgba = Buffer.alloc(w * h * 4);
  const cores = [[200, 30, 40], [30, 160, 60], [20, 60, 200], [240, 200, 20]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, q = cores[(x < 150 ? 0 : 1) + (y < 100 ? 0 : 2)];
      rgba[i] = q[0]; rgba[i + 1] = q[1]; rgba[i + 2] = q[2]; rgba[i + 3] = 255;
    }
  }
  const t0 = Date.now();
  const pedir = (saidaLargura, saidaAltura) => fetch(`${base}/ampliar?${new URLSearchParams({ largura: w, altura: h, saidaLargura, saidaAltura })}`,
    { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: rgba }).then((r) => r.json());
  const { id, total } = await pedir(1200, 800);
  assert.equal(total, 6);
  let png = null;
  while (!png) {
    await new Promise((pronto) => setTimeout(pronto, 200));
    const g = await fetch(`${base}/ampliar/${id}`);
    assert.equal(g.status, 200, `o andamento respondeu ${g.status}`);
    if ((g.headers.get("content-type") || "").startsWith("image/png")) png = Buffer.from(await g.arrayBuffer());
  }
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [1200, 800, 4]);
  const cor = (x, y) => Array.from(data.subarray((y * 1200 + x) * 4, (y * 1200 + x) * 4 + 3));
  for (const [x, y, esperada] of [[300, 200, cores[0]], [900, 200, cores[1]], [300, 600, cores[2]], [900, 600, cores[3]]]) {
    assert.ok(cor(x, y).every((v, k) => Math.abs(v - esperada[k]) <= 6), `a cor em ${x},${y}: ${cor(x, y)} (esperava ${esperada})`);
  }
  // Cancelar: a ampliação some.
  const grande = await pedir(4096, 2731);
  await fetch(`${base}/ampliar/${grande.id}`, { method: "DELETE" });
  assert.equal((await fetch(`${base}/ampliar/${grande.id}`)).status, 404);
  console.log(`  ampliação: 6 ladrilhos, 1200 × 800, ${Date.now() - t0} ms`);

  console.log(`OK — a rede de recorte (${rede.REDE_DO_EXTRATOR}) acha os elementos.`);
} finally {
  servidor.close();
}
