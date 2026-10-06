/*
 * BANCADA — o Extrator sem rede neural (entra no Conferir)
 *
 *     npm run bancada:extrator
 *
 * Tudo o que não precisa dos modelos: a foto que chega ao servidor, o pedido
 * de máscara, a rede ausente, e (nas tasks seguintes) a ampliação com uma
 * rede de mentira, os motores da foto e o vetor. A rede de verdade é da
 * `bancada:extrator-rede`, que fica fora da CI.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const api = require("../servidor/extrator-api.js");
const rede = require("../servidor/extrator-rede.js");

// ---------- o servidor: a foto que chega ----------
{
  const png = await sharp({ create: { width: 30, height: 20, channels: 4, background: "#ff000080" } }).png().toBuffer();
  const f = await api.fotoDoCorpo(png);
  assert.deepEqual([f.largura, f.altura, f.rgb.length], [30, 20, 30 * 20 * 3], "a foto vira RGB, sem o alfa");

  // A foto de celular deitada (EXIF 6) chega em pé.
  const deitada = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#00ff00" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const emPe = await api.fotoDoCorpo(deitada);
  assert.deepEqual([emPe.largura, emPe.altura], [20, 40], "a orientação do EXIF vale");

  await assert.rejects(api.fotoDoCorpo(Buffer.from("isto não é foto")),
    (e) => e.status === 415 && e.codigo === "foto-ilegivel" && /JPG, PNG e WebP/.test(e.message));

  const enorme = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: "#ffffff" } })
    .jpeg({ quality: 30 }).toBuffer();
  await assert.rejects(api.fotoDoCorpo(enorme),
    (e) => e.status === 413 && /42 megapixels \(7000 × 6000\); o Extrator lê até 40/.test(e.message));
}

// ---------- o servidor: o pedido de máscara ----------
{
  const ok = api.lerPedidoDeMascara({ id: "x", pontos: [{ x: 10, y: 5, inclui: true }, { x: 3, y: 4, inclui: false }] });
  assert.deepEqual(ok, { id: "x", pontos: [{ x: 10, y: 5, inclui: true }, { x: 3, y: 4, inclui: false }], caixa: null });
  assert.match(api.lerPedidoDeMascara({ pontos: [] }).erro, /id da leitura/);
  assert.match(api.lerPedidoDeMascara({ id: "x", pontos: [{ x: 1, y: 1, inclui: false }] }).erro, /Clique em cima do elemento/);
  assert.match(api.lerPedidoDeMascara({ id: "x", pontos: [{ x: "a", y: 1 }] }).erro, /sem posição/);
  assert.match(api.lerPedidoDeMascara({ id: "x", pontos: Array.from({ length: 33 }, () => ({ x: 1, y: 1 })) }).erro, /no máximo 32/);
  const c = api.lerPedidoDeMascara({ id: "x", pontos: [], caixa: { x0: 50, y0: 40, x1: 10, y1: 5 } });
  assert.deepEqual(c.caixa, { x0: 10, y0: 5, x1: 50, y1: 40 }, "a caixa arrastada de baixo para cima é a mesma caixa");
}

// ---------- a rede ausente: diz o que falta e o comando ----------
{
  const vazia = fs.mkdtempSync(path.join(os.tmpdir(), "extrator-sem-rede-"));
  const motivo = rede.porqueNaoRoda(rede.REDE_DO_EXTRATOR, vazia);
  assert.match(motivo, /não está instalada/);
  assert.match(motivo, /npm run modelos/);
  await assert.rejects(rede.lerFoto(Buffer.alloc(3), 1, 1, { pasta: vazia }), (e) => e.codigo === "sem-rede");
  await assert.rejects(rede.mascaraDe("nao-existe", { pontos: [{ x: 0, y: 0, inclui: true }], caixa: null }),
    (e) => e.codigo === "leitura-vencida");
}

// ---------- a ampliação, com uma rede de mentira ----------
{
  const ampliar = require("../servidor/extrator-ampliar.js");
  const L = ampliar.LADO;
  // A rede de mentira: repete cada pixel 4 × 4 (o vizinho mais próximo).
  const deMentira = async (e) => {
    const S = L * 4, s = new Float32Array(3 * S * S);
    for (let k = 0; k < 3; k++) {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) s[k * S * S + y * S + x] = e[k * L * L + (y >> 2) * L + (x >> 2)];
    }
    return s;
  };
  // 300 × 200 em quatro quadrantes de cor; o quarto da esquerda, transparente.
  const w = 300, h = 200, rgba = Buffer.alloc(w * h * 4);
  const cores = [[200, 30, 40], [30, 160, 60], [20, 60, 200], [240, 200, 20]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, q = cores[(x < 150 ? 0 : 1) + (y < 100 ? 0 : 2)];
      rgba[i] = q[0]; rgba[i + 1] = q[1]; rgba[i + 2] = q[2]; rgba[i + 3] = x < 75 ? 0 : 255;
    }
  }
  assert.equal(ampliar.ladrilhosDe(w, h), 6);
  const andamentos = [];
  const r = await ampliar.ampliarComRede(rgba, w, h, 1200, 800, deMentira, { aoAndar: (f, t) => andamentos.push(`${f}/${t}`) });
  assert.deepEqual([r.largura, r.altura], [1200, 800]);
  assert.equal(andamentos.at(-1), "6/6");
  const px = (x, y) => Array.from(r.rgba.subarray((y * 1200 + x) * 4, (y * 1200 + x) * 4 + 4));
  assert.deepEqual(px(900, 200), [30, 160, 60, 255], "a cor volta exata, opaca");
  assert.equal(px(100, 200)[3], 0, "o quarto transparente continua transparente");
  assert.deepEqual(px(447, 600), px(448, 600), "sem emenda na divisa dos ladrilhos");

  // Pequeno demais para o pedido: 40 × 30 vira 400 × 300 (10x); a rede faz 4x e o resto é esticado.
  const r2 = await ampliar.ampliarComRede(Buffer.alloc(40 * 30 * 4, 255), 40, 30, 400, 300, deMentira);
  assert.deepEqual([r2.largura, r2.altura], [400, 300]);
  assert.deepEqual(Array.from(r2.rgba.subarray(0, 4)), [255, 255, 255, 255]);

  // Sem precisar ampliar (até 5% a mais), a rede nem é aberta.
  assert.equal(ampliar.precisaDaRede(w, h, w, h), false);
  assert.equal(ampliar.precisaDaRede(w, h, 2 * w, 2 * h), true);
  const igual = await ampliar.ampliar(rgba, w, h, w, h, { arquivo: "nao-existe.onnx" });
  assert.deepEqual([igual.largura, igual.altura], [w, h]);
  assert.match(ampliar.porqueNaoAmplia("nao-existe.onnx"), /npm run modelos/);

  // O pedido que chega à API.
  const p = (q, n) => api.lerPedidoDeAmpliar(q, Buffer.alloc(n));
  assert.match(p({ largura: "10", altura: "10", saidaLargura: "40", saidaAltura: "40" }, 399).erro, /não veio inteiro/);
  assert.match(p({ largura: "10" }, 400).erro, /Faltou a medida/);
  assert.match(p({ largura: "10", altura: "10", saidaLargura: "10000", saidaAltura: "9000" }, 400).erro, /80 megapixels/);
  assert.deepEqual(p({ largura: "10", altura: "10", saidaLargura: "40", saidaAltura: "40" }, 400),
    { largura: 10, altura: 10, saidaLargura: 40, saidaAltura: 40 });
}

console.log("OK — o Extrator sem rede: a foto, o pedido de máscara, a rede ausente e a ampliação.");
