#!/usr/bin/env node
/**
 * A peça mais larga que a mídia fica no encaixe, sem pisar em ninguém.
 *
 * O caso (2026-10-27): mídia de 178 cm e arquivo de 178,2 cm. O motor punha a
 * peça de fora e ela sumia do risco. Agora `assentarAsLargas` a põe no fim do
 * rolo, centralizada, e a tela avisa. Aqui se confere, com o motor de verdade:
 *
 *   1. `cabeNaMidia` separa só o que não cabe nem deitado;
 *   2. as largas entram todas, centralizadas, presas à grade das outras;
 *   3. o guarda da sobreposição passa o encaixe inteiro — sem e com bancada;
 *   4. com bancada, nenhuma peça atravessa a linha entre duas mesas.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { carregarModulo } from "./carregarModulo.mjs";

const require = createRequire(import.meta.url);
const { carregarMotor } = require("./motor");
const { CATALOGO, prepararPeca, expandir } = require("./pecas");

const motor = await carregarMotor({ comWasm: false });
const { assentarAsLargas, cabeNaMidia } = await carregarModulo("src/motores/encaixeLargas.js");
const { recusarPorSobreposicao } = await carregarModulo("src/motores/encaixeSobreposicao.js");

const LARGURA = 160;
const ESPACO = 1;
const { passo, raio } = motor.grade(LARGURA, ESPACO);

// A frente da camiseta esticada até passar 2 mm da mídia.
CATALOGO["larga-bancada"] = { ...CATALOGO.camiseta, largura: LARGURA + 0.2, altura: 70 };

// 1. Quem cabe e quem não --------------------------------------------------------
const giroFixo = { largura: LARGURA + 0.2, altura: 70, giro: "180" };
assert.equal(cabeNaMidia(giroFixo, LARGURA), false, "mais larga e sem giro");
assert.equal(cabeNaMidia({ ...giroFixo, giro: "livre" }, LARGURA), true, "deitada ela cabe");
assert.equal(cabeNaMidia({ largura: LARGURA, altura: 70, giro: "180" }, LARGURA), true, "exata cabe");
console.log("  ok  só fica de fora da busca o que não cabe nem deitado");

function trabalho(comprimentoBancada) {
  const pecas = [
    prepararPeca(motor, "camiseta", { passo, raio, qtd: 4 }),
    prepararPeca(motor, "manga", { passo, raio, qtd: 4 }),
    prepararPeca(motor, "larga-bancada", { passo, raio, qtd: 2 }),
  ];
  const itens = expandir(pecas);
  const largas = itens.filter((it) => !cabeNaMidia(it, LARGURA));
  const comuns = itens.filter((it) => cabeNaMidia(it, LARGURA));
  assert.equal(largas.length, 2, "as duas cópias da larga, e só elas");

  const config = {
    larguraTecido: LARGURA, espaco: ESPACO, comprimentoBancada, raio, passo, heuristica: "fundo",
    alturaMax: itens.reduce((s, i) => s + Math.max(i.largura, i.altura) + ESPACO, 0),
  };
  const doMotor = motor.encaixarContorno(motor.montarUnidades(comuns, "solta"), config);
  assert.equal(doMotor.naoEncaixadas.length, 0, `o resto do trabalho cabe: ${doMotor.naoEncaixadas.map((i) => `${i.nome} ${i.giro}`)}`);
  const r = assentarAsLargas(doMotor, largas, { larguraTecido: LARGURA, espaco: ESPACO, comprimentoBancada, passo });

  assert.equal(r.posicoes.length, itens.length, "nenhuma peça sumiu");
  assert.equal(r.largas.length, 2, "o aviso conta as duas");
  const postas = r.posicoes.slice(doMotor.posicoes.length);
  postas.forEach((p) => {
    assert.ok(p.mascara, "a larga vai com a máscara do contorno");
    const sobra = (p.x + p.largura / 2) - LARGURA / 2;
    assert.ok(Math.abs(sobra) <= passo, `a larga sai centralizada (desvio ${sobra.toFixed(3)} cm)`);
    const x0 = p.x + (p.mascara.offX || 0);
    const y0 = p.y + (p.mascara.offY || 0);
    assert.ok(Math.abs(x0 / passo - Math.round(x0 / passo)) < 1e-6, "x da máscara na grade");
    assert.ok(Math.abs(y0 / passo - Math.round(y0 / passo)) < 1e-6, "y da máscara na grade");
  });
  assert.ok(r.consumo >= Math.max(...r.posicoes.map((p) => p.y + p.altura)) - 1e-9, "o consumo cobre as largas");

  const recusa = recusarPorSobreposicao(r);
  assert.equal(recusa, null, `o guarda recusou: ${recusa}`);

  if (comprimentoBancada > 0) {
    const periodo = comprimentoBancada + ESPACO;
    r.posicoes.forEach((p) => {
      const inicio = p.bancada * periodo;
      // A régua do próprio motor: a peça pode começar uma folga antes da mesa
      // (a borda engordada, ver "A BORDA DO TECIDO NÃO LEVA FOLGA").
      assert.ok(p.y >= inicio - ESPACO - 1e-6 && p.y + p.altura <= inicio + comprimentoBancada + 1e-6,
        `peça atravessa a bancada ${p.bancada}: ${p.y.toFixed(1)}..${(p.y + p.altura).toFixed(1)}`);
    });
  }
  return r;
}

const corrido = trabalho(0);
console.log(`  ok  rolo corrido: ${corrido.posicoes.length} peças, as 2 largas no fim (${(corrido.consumo / 100).toFixed(2)} m), guarda limpo`);
const comMesa = trabalho(150);
console.log(`  ok  bancada de 150 cm: ${comMesa.posicoes.length} peças, nenhuma atravessa a mesa, guarda limpo`);
