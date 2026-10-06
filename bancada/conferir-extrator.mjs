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

// ---------- os motores da foto ----------
{
  const { carregarModulo } = await import("./carregarModulo.mjs");
  const pers = await carregarModulo("src/motores/perspectiva.js");
  const rec = await carregarModulo("src/motores/recorte.js");
  const ext = await carregarModulo("src/motores/extrator.js");

  // A homografia leva os quatro cantos exatamente.
  const de = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
  const para = [{ x: 60, y: 40 }, { x: 330, y: 70 }, { x: 350, y: 260 }, { x: 40, y: 230 }];
  const H = pers.homografia(de, para);
  for (let i = 0; i < 4; i++) {
    const p = pers.aplicarHomografia(H, de[i].x, de[i].y);
    assert.ok(Math.abs(p.x - para[i].x) < 1e-6 && Math.abs(p.y - para[i].y) < 1e-6, `o canto ${i} vai para o lugar`);
  }
  assert.equal(pers.cantosValidos(para), true);
  assert.equal(pers.cantosValidos([para[1], para[0], para[2], para[3]]), false, "cantos cruzados");

  // Os cantos da própria foto devolvem a foto, pixel a pixel.
  const W = 40, A = 30, foto = new Uint8ClampedArray(W * A * 4);
  for (let i = 0; i < foto.length; i++) foto[i] = (i * 37) % 256;
  const igual = pers.desentortar(foto, W, A, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: A }, { x: 0, y: A }]);
  assert.deepEqual([igual.largura, igual.altura], [W, A]);
  assert.deepEqual(Array.from(igual.rgba), Array.from(foto), "os cantos da foto devolvem a mesma foto");

  // Um tabuleiro fotografado de lado volta a ser tabuleiro.
  const casas = 8, lado = 20, papel = casas * lado;
  const corDaCasa = (i, j) => ((i + j) % 2 ? [200, 30, 40] : [30, 60, 200]);
  const LW = 400, LA = 300, torta = new Uint8ClampedArray(LW * LA * 4).fill(128);
  const volta = pers.homografia(para, [{ x: 0, y: 0 }, { x: papel, y: 0 }, { x: papel, y: papel }, { x: 0, y: papel }]);
  for (let y = 0; y < LA; y++) {
    for (let x = 0; x < LW; x++) {
      const q = pers.aplicarHomografia(volta, x + 0.5, y + 0.5);
      if (q.x < 0 || q.y < 0 || q.x >= papel || q.y >= papel) continue;
      const c = corDaCasa(Math.floor(q.x / lado), Math.floor(q.y / lado));
      torta.set([c[0], c[1], c[2], 255], (y * LW + x) * 4);
    }
  }
  const reta = pers.desentortar(torta, LW, LA, para);
  let certas = 0;
  for (let j = 0; j < casas; j++) {
    for (let i = 0; i < casas; i++) {
      const x = Math.floor(((i + 0.5) / casas) * reta.largura), y = Math.floor(((j + 0.5) / casas) * reta.altura);
      const k = (y * reta.largura + x) * 4, c = corDaCasa(i, j);
      if (Math.abs(reta.rgba[k] - c[0]) < 10 && Math.abs(reta.rgba[k + 2] - c[2]) < 10) certas++;
    }
  }
  assert.equal(certas, 64, `as 64 casas voltam no lugar (${certas})`);
  assert.equal(pers.desentortar(torta, LW, LA, [para[1], para[0], para[2], para[3]]), null);

  // A máscara esticada: do mesmo tamanho é cópia; uniforme continua uniforme.
  assert.deepEqual(Array.from(rec.ampliarMascara(Uint8Array.from([1, 2, 3, 4]), 2, 2, 2, 2)), [1, 2, 3, 4]);
  assert.ok(rec.ampliarMascara(new Uint8Array(16).fill(200), 4, 4, 13, 7).every((v) => v === 200));

  // A cena: disco vermelho (raio 15) sobre a camisa azul, 60 × 60; a máscara pega 3 px a mais (raio 18).
  const L = 60, cena = new Uint8ClampedArray(L * L * 4), mascara = new Uint8Array(L * L);
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const d = Math.hypot(x + 0.5 - 30, y + 0.5 - 30), i = y * L + x;
      cena.set(d <= 15 ? [200, 30, 40, 255] : [30, 60, 200, 255], i * 4);
      mascara[i] = d <= 18 ? 255 : 0;
    }
  }
  assert.deepEqual(rec.corDeFora(cena, L, L, mascara), [30, 60, 200], "a cor de baixo é o azul da camisa");
  const r = rec.aplicarMascara(cena, L, L, mascara);
  assert.deepEqual([r.x0, r.y0, r.largura, r.altura], [10, 10, 40, 40], "cortado na caixa da máscara, com 2 px de margem");
  assert.deepEqual(Array.from(r.rgba.subarray(0, 4)), [30, 60, 200, 0], "fora da máscara: transparente, com a cor embaixo");
  const apagados = rec.limparBorda(r, [30, 60, 200]);
  let opacos = 0, vermelhosApagados = 0;
  for (let i = 0; i < r.largura * r.altura; i++) {
    const a = r.rgba[i * 4 + 3];
    if (a > 0) opacos++;
    if (r.rgba[i * 4] === 200 && a === 0) vermelhosApagados++;
  }
  assert.ok(apagados > 0, "a borda de camisa foi apagada");
  assert.equal(vermelhosApagados, 0, "nenhum pixel do disco foi apagado");
  assert.ok(Math.abs(opacos - Math.PI * 225) < Math.PI * 225 * 0.1, `sobrou o disco (${opacos} pixels)`);

  // A imagem inteira: opaca fica inteira; com margem transparente, a margem sai; toda transparente, nada.
  const opaca = rec.recorteInteiro(new Uint8ClampedArray(20 * 10 * 4).fill(255), 20, 10);
  assert.deepEqual([opaca.largura, opaca.altura], [20, 10]);
  const comMargem = new Uint8ClampedArray(20 * 10 * 4);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 17; x++) comMargem.set([10, 20, 30, 255], (y * 20 + x) * 4);
  const ri = rec.recorteInteiro(comMargem, 20, 10);
  assert.deepEqual([ri.x0, ri.y0, ri.largura, ri.altura], [3, 3, 14, 4], "a margem transparente sai");
  assert.equal(rec.recorteInteiro(new Uint8ClampedArray(16), 2, 2), null);

  // As medidas.
  assert.deepEqual(ext.tamanhoDeTrabalho(4000, 3000), { largura: 2048, altura: 1536, escala: 0.512 });
  assert.deepEqual(ext.tamanhoDeTrabalho(800, 600), { largura: 800, altura: 600, escala: 1 });
  assert.match(ext.fotoGrandeDemais(7000, 6000), /42 megapixels \(7000 × 6000\)/);
  assert.equal(ext.fotoGrandeDemais(4000, 3000), null);
  assert.deepEqual(ext.tamanhoDaSaida(1000, 500, { tipo: "4k" }), { largura: 4096, altura: 2048, cortada: false });
  assert.deepEqual(ext.tamanhoDaSaida(600, 400, { tipo: "cm", larguraCm: 10 }), { largura: 1181, altura: 787, cortada: false });
  const absurda = ext.tamanhoDaSaida(600, 400, { tipo: "cm", larguraCm: 500 });
  assert.equal(absurda.cortada, true);
  assert.ok(absurda.largura * absurda.altura <= 80_000_000);

  // Chapado ou foto, e quantas cores: três cores chapadas com ruído de ±6, contra um degradê.
  const chapado = new Uint8ClampedArray(200 * 100 * 4);
  let semente = 7;
  const ruido = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return (semente % 13) - 6; };
  for (let i = 0; i < 200 * 100; i++) {
    const x = i % 200, base = x < 70 ? [200, 30, 40] : x < 140 ? [30, 60, 200] : [245, 245, 245];
    chapado.set([base[0] + ruido(), base[1] + ruido(), base[2] + ruido(), 255], i * 4);
  }
  assert.equal(ext.jeitoSugerido(chapado), "chapado");
  assert.equal(ext.coresSugeridas(chapado), 3);
  const degrade = new Uint8ClampedArray(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) degrade.set([x, y, (x + y) >> 1, 255], (y * 256 + x) * 4);
  assert.ok(ext.degrausPara90(degrade) > 40);
  assert.equal(ext.jeitoSugerido(degrade), "foto");

  // A máscara que não serve, e os nomes dos arquivos.
  assert.equal(ext.coberturaDaMascara(Uint8Array.from([0, 255, 128, 127])), 0.5);
  assert.match(ext.avisoDaMascara(0), /não achou nada/);
  assert.match(ext.avisoDaMascara(0.99), /foto inteira/);
  assert.equal(ext.avisoDaMascara(0.3), null);
  assert.deepEqual(ext.nomesUnicos(["Logo", "logo", "Logo (2)", "a/b:c", ""]),
    ["Logo", "logo (2)", "Logo (2) (2)", "a-b-c", "elemento"]);
}

console.log("OK — o Extrator sem rede: a foto, o pedido de máscara, a rede ausente, a ampliação e os motores da foto.");
