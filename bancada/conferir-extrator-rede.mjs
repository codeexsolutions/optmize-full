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
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { avaliarMascara, fotoDeTrabalho, fotoSintetica, lerGabaritos, PASTA_DAS_FOTOS } from "./extrator-comum.mjs";

const require = createRequire(import.meta.url);
const express = require("express");
const sharp = require("sharp");
const rede = require("../servidor/extrator-rede.js");

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
  const falhas = [];
  for (const f of fotos) {
    const foto = await fotoDeTrabalho(f.foto);
    const l = await ler(foto);
    if (l.msTotal > 6000) falhas.push(`${f.nome}: o /ler levou ${l.msTotal} ms (teto 6000)`);
    for (const e of f.elementos) {
      const r = await mascara(l.id, [{ x: e.clique[0], y: e.clique[1], inclui: true }]);
      const a = avaliarMascara(r.alfa, r.largura, r.altura, e.caixa);
      if (a.iou < 0.7 || a.dentro < 0.85) falhas.push(`${f.nome} / ${e.nome}: IoU ${a.iou.toFixed(2)}, dentro ${a.dentro.toFixed(2)}`);
    }
    console.log(`  ${f.nome}: ${f.elementos.length} elemento(s), /ler ${l.msTotal} ms`);
  }
  assert.deepEqual(falhas, [], falhas.join("\n"));
  console.log(`OK — a rede de recorte (${rede.REDE_DO_EXTRATOR}) acha os elementos.`);
} finally {
  servidor.close();
}
