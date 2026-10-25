const assert = require('node:assert/strict');
const { carregarMotor } = require('./motor');
async function principal() {
  const { mascarasDeSilhueta } = await carregarMotor({ comWasm: false });
  const cols = 8, rows = 6, passo = 0.16;
  const bits = new Uint8Array(cols * rows);
  for (let linha = 1; linha < 5; linha++) {
    for (let coluna = 2; coluna < 6; coluna++) bits[linha * cols + coluna] = 1;
  }
  for (const raio of [0, 1, 3]) {
    const silhueta = { bits, modo: 'alfa' };
    const medida = { largura: 1.13, altura: 0.83 };
    const cheia = mascarasDeSilhueta(silhueta, cols, rows, passo, raio);
    const real = mascarasDeSilhueta(silhueta, cols, rows, passo, raio, medida);
    const sobraX = cols * passo - medida.largura;
    const sobraY = rows * passo - medida.altura;
    for (const [rotacao, deslocamentoX, deslocamentoY] of [[0,0,0],[90,sobraY,0],[180,sobraX,sobraY],[270,0,sobraX]]) {
      const antes = cheia.rotacoes[rotacao], depois = real.rotacoes[rotacao];
      assert.ok(Math.abs(depois.offX - (antes.offX - deslocamentoX)) < 1e-10, `X giro ${rotacao}`);
      assert.ok(Math.abs(depois.offY - (antes.offY - deslocamentoY)) < 1e-10, `Y giro ${rotacao}`);
      assert.deepEqual(depois.desenho, antes.desenho);
      assert.deepEqual(depois.topo, antes.topo);
      assert.deepEqual(depois.base, antes.base);
    }
  }
  console.log('OK — contorno acompanha a dimensão real nos quatro giros.');
}
principal().catch(erro => { console.error(erro); process.exitCode = 1; });
