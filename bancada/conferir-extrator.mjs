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

console.log("OK — o Extrator sem rede: a foto, o pedido de máscara e a rede ausente.");
