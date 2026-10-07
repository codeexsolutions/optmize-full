/*
 * BANCADA — as peças da camisa, sem rede neural e sem internet (entra no Conferir)
 *
 *     npm run bancada:pecas
 *
 * O preenchimento com uma LaMa de mentira, a fila dos trabalhos pesados, os
 * motores das peças (corpo sem manga, encaixe, manga juntada, sombra) e a
 * análise com IA com um cliente de mentira no lugar do SDK. A LaMa de verdade
 * é da `bancada:pecas-rede`; o Claude de verdade, da `analise:de-verdade`.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------- o preenchimento, com uma LaMa de mentira ----------
{
  const pre = require("../servidor/extrator-preencher.js");
  const L = pre.LADO;
  // A LaMa de mentira: o buraco vira a média da arte conhecida do ladrilho; a arte volta igual.
  let chamadas = 0;
  const deMentira = async (imagem, mascara) => {
    chamadas++;
    const N = L * L, soma = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (mascara[i]) continue;
      n++;
      for (let k = 0; k < 3; k++) soma[k] += imagem[k * N + i];
    }
    assert.ok(n > 0, "a LaMa nunca recebe ladrilho sem arte nenhuma");
    const saida = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) saida[k * N + i] = (mascara[i] ? soma[k] / n : imagem[k * N + i]) * 255;
    return saida;
  };

  // Sem buraco: volta igual, sem rodar a rede.
  {
    const rgba = Buffer.alloc(10 * 8 * 4, 255);
    const r = await pre.preencherComRede(rgba, 10, 8, deMentira);
    assert.equal(r.inventado, 0);
    assert.equal(r.rgb.length, 10 * 8 * 3);
  }

  // Tudo buraco: não há o que continuar.
  await assert.rejects(pre.preencherComRede(Buffer.alloc(10 * 8 * 4), 10, 8, deMentira), (e) => e.codigo === "sem-arte");

  // Uma peça de 1600 × 1200 cor de vinho, com uma faixa vazia de 300 px em cima e um furo no meio.
  {
    const w = 1600, h = 1200, rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = Math.floor(i / w);
      const vazio = y < 300 || (x >= 700 && x < 900 && y >= 600 && y < 800);
      rgba[i * 4] = 120; rgba[i * 4 + 1] = 20; rgba[i * 4 + 2] = 40; rgba[i * 4 + 3] = vazio ? 0 : 255;
    }
    // Um pixel marcado na arte, para provar que ela volta byte a byte.
    rgba[(1000 * w + 100) * 4] = 7;
    chamadas = 0;
    const andamentos = [];
    const r = await pre.preencherComRede(rgba, w, h, deMentira, { aoAndar: (f, t) => andamentos.push([f, t]) });
    assert.ok(Math.abs(r.inventado - (300 * 1600 + 200 * 200) / (w * h)) < 1e-9, `a parte inventada: ${r.inventado}`);
    assert.equal(r.rgb[(1000 * w + 100) * 3], 7, "a arte da foto volta byte a byte");
    for (const [x, y] of [[10, 10], [1590, 5], [800, 299], [800, 700]]) {
      const i = (y * w + x) * 3;
      const px = [r.rgb[i], r.rgb[i + 1], r.rgb[i + 2]];
      assert.ok(Math.abs(px[0] - 120) <= 3 && Math.abs(px[1] - 20) <= 3 && Math.abs(px[2] - 40) <= 3, `o buraco em ${x},${y} virou ${px}`);
    }
    // 1600 × 1200 vira 1024 × 768 na escala da LaMa: 3 × 2 ladrilhos, todos com buraco.
    assert.deepEqual(pre.posicoes(1024), [0, 448, 512]);
    assert.deepEqual(pre.posicoes(768), [0, 256]);
    // Um ladrilho de cima já preenche o furo do vizinho de baixo: menos de 6 chamadas.
    assert.ok(chamadas >= 3 && chamadas <= 6, `chamadas: ${chamadas}`);
    assert.deepEqual(andamentos.at(-1), [chamadas, chamadas], "o andamento termina em n de n");
    assert.equal(pre.ladrilhosDe(rgba, w, h), 6);
  }

  // Cancelar para no ladrilho seguinte.
  {
    const w = 1200, h = 1200, rgba = Buffer.alloc(w * h * 4, 255);
    for (let i = 0; i < w * 200; i++) rgba[i * 4 + 3] = 0;
    let feitos = 0;
    await assert.rejects(
      pre.preencherComRede(rgba, w, h, deMentira, { aoAndar: (f) => { feitos = f; }, cancelado: () => feitos >= 1 }),
      /cancelado/,
    );
    assert.equal(feitos, 1);
  }

  // A rede ausente diz o que falta.
  assert.match(pre.porqueNaoPreenche("C:/nao/existe/lama.onnx"), /npm run modelos/);
}
// ---------- a fila dos trabalhos pesados ----------
{
  const { criarFila } = require("../servidor/extrator-fila.js");
  let relogio = 0;
  // O teto conta todo trabalho ainda não entregue: esperando, rodando ou pronto sem ser buscado.
  const fila = criarFila({ maximoEsperando: 2, validadeMs: 1000, agora: () => relogio });
  let soltar;
  const trava = new Promise((pronto) => { soltar = pronto; });
  const rodou = [];
  const a = fila.colocar(3, async (w) => { rodou.push("a"); w.feitos = 1; await trava; return Buffer.from("png-a"); });
  assert.equal(fila.ver(a.id).estado, "esperando", "começa esperando; roda no tique seguinte");
  await new Promise((pronto) => setTimeout(pronto, 0));
  const b = fila.colocar(1, async () => { rodou.push("b"); return Buffer.from("png-b"); });
  assert.equal(fila.ver(a.id).estado, "rodando", "o primeiro roda");
  assert.equal(fila.ver(a.id).feitos, 1);
  // Um rodando e um esperando: o terceiro passa do máximo de 2.
  const cheia = (e) => e.codigo === "fila-cheia" && e.status === 429
    && e.message === "Já há trabalhos demais na fila; espere um terminar.";
  assert.throws(() => fila.colocar(1, async () => Buffer.alloc(0)), cheia);
  fila.cancelar(b.id);
  assert.equal(fila.ver(b.id), null, "o cancelado some");
  const c = fila.colocar(1, async () => { rodou.push("c"); return Buffer.from("png-c"); });
  assert.throws(() => fila.colocar(1, async () => Buffer.alloc(0)), cheia, "o cancelamento abriu uma vaga, e só uma");
  soltar();
  await fila.vazia();
  assert.deepEqual(rodou, ["a", "c"], "o cancelado não roda");
  assert.equal(fila.ver(a.id).estado, "pronto");
  assert.equal(fila.ver(a.id).png.toString(), "png-a");
  assert.equal(fila.ver(c.id).estado, "pronto");
  // O pronto que ninguém buscou ainda ocupa vaga: o teto vale para a memória, não só para a espera.
  assert.throws(() => fila.colocar(1, async () => Buffer.alloc(0)), cheia, "o pronto não buscado conta");
  fila.entregue(a.id);
  assert.equal(fila.ver(a.id), null);
  assert.equal(fila.tamanho(), 1);
  // A vaga que a entrega abriu serve; a varredura abaixo limpa o resto.
  fila.colocar(1, async () => Buffer.from("h"));

  // A varredura: o que ninguém buscou em 30 min (aqui, 1 s) é cancelado, até o pronto.
  relogio += 1500;
  assert.equal(fila.ver(c.id), null, "o pronto que ninguém buscou também vence");
  assert.equal(fila.tamanho(), 0);
  let soltar2;
  const trava2 = new Promise((pronto) => { soltar2 = pronto; });
  const rodou2 = [];
  const d = fila.colocar(1, async () => { await trava2; return Buffer.from("d"); });
  const e = fila.colocar(1, async () => { rodou2.push("e"); return Buffer.from("e"); });
  relogio += 1500;
  assert.equal(fila.ver(e.id), null, "venceu");
  assert.equal(fila.ver(d.id), null);
  soltar2();
  await fila.vazia();
  assert.deepEqual(rodou2, [], "o vencido não roda");
  assert.equal(fila.tamanho(), 0);

  // Uma falha vira o erro do trabalho, e a fila segue.
  const f = fila.colocar(1, async () => { throw new Error("pifou"); });
  const g = fila.colocar(1, async () => Buffer.from("g"));
  await fila.vazia();
  assert.equal(fila.ver(f.id).estado, "falhou");
  assert.equal(fila.ver(f.id).erro, "pifou");
  assert.equal(fila.ver(g.id).estado, "pronto");
}

// ---------- o pedido de preencher ----------
{
  const api = require("../servidor/extrator-api.js");
  assert.deepEqual(api.lerPedidoDePreencher({ largura: "4", altura: "3" }, Buffer.alloc(48)), { largura: 4, altura: 3 });
  assert.match(api.lerPedidoDePreencher({ largura: "4", altura: "3" }, Buffer.alloc(47)).erro, /não veio inteira/);
  assert.match(api.lerPedidoDePreencher({ largura: "5000", altura: "3" }, Buffer.alloc(60000)).erro, /4096/);
  assert.match(api.lerPedidoDePreencher({}, Buffer.alloc(4)).erro, /Faltou a medida/);
}

console.log("OK — as peças da camisa sem rede: o preenchimento, a fila e o pedido.");
