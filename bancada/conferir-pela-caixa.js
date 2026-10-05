/*
 * A metragem pela caixa (`metragemPelaCaixa`, em encaixeMotor.js): confere
 * que ela é a mesma régua do motor e que cabe no tempo da tela.
 *
 *   node bancada/conferir-pela-caixa.js
 */
const assert = require("node:assert/strict");
const { carregarMotor } = require("./motor");

const config = (itens, extra = {}) => ({
  larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
  alturaMax: itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + 1, 0), ...extra,
});

(async () => {
  const { metragemPelaCaixa } = await carregarMotor({ comWasm: false });

  // Quatro peças de 79,5 x 100 num rolo de 160 com 1 de folga: duas por fileira, 201 cm.
  const quatro = Array.from({ length: 4 }, () => ({ largura: 79.5, altura: 100, giro: "fixa" }));
  assert.equal(metragemPelaCaixa(quatro, config(quatro)), 201);

  // Peça mais larga que o rolo e sem giro: não há caixa com que comparar.
  const larga = [{ largura: 200, altura: 50, giro: "fixa" }];
  assert.equal(metragemPelaCaixa(larga, config(larga)), null);

  // Com bancada a régua é o comprimento do PDF.
  const muitas = Array.from({ length: 30 }, (_, i) => ({
    largura: 40 + (i % 5) * 7, altura: 55 + (i % 3) * 11, giro: "livre",
  }));
  assert.ok(metragemPelaCaixa(muitas, config(muitas)) > 0);
  assert.ok(metragemPelaCaixa(muitas, config(muitas, { comprimentoBancada: 150 })) > 0);

  // Lote grande (235 peças): a conta roda na tela, antes da busca.
  const grande = Array.from({ length: 235 }, (_, i) => ({
    largura: 20 + ((i * 37) % 50), altura: 30 + ((i * 53) % 60), giro: i % 2 ? "livre" : "fixa",
  }));
  const t0 = performance.now();
  const m = metragemPelaCaixa(grande, config(grande));
  const ms = performance.now() - t0;
  console.log(`235 peças: ${(m / 100).toFixed(2)} m pela caixa em ${ms.toFixed(0)} ms`);
  assert.ok(ms < 3000, `pela caixa levou ${ms} ms`);

  console.log("pela caixa: ok");
})().catch((erro) => { console.error(erro); process.exit(1); });
