const assert = require('node:assert/strict');
const { carregarMotor } = require('./motor');

async function principal() {
  const { melhorQue } = await carregarMotor({ comWasm: false });
  const caixa = { consumo: 52.967819444444444, naoEncaixadas: [], posicoes: [{}, {}] };
  const contorno = { ...caixa, posicoes: [{ mascara: {} }, { mascara: {} }] };
  const worker = { ...caixa, posicoes: [{ comMascara: true }, { comMascara: true }] };
  assert.equal(melhorQue(contorno, caixa), true);
  assert.equal(melhorQue(caixa, contorno), false);
  assert.equal(melhorQue(worker, caixa), true);
  assert.equal(melhorQue(caixa, worker), false);
  assert.equal(melhorQue(contorno, worker), false);
  assert.equal(melhorQue(worker, contorno), false);
  assert.equal(melhorQue(contorno, contorno), false);
  assert.equal(melhorQue(caixa, caixa), false);
  assert.equal(melhorQue({ ...contorno, consumo: caixa.consumo + 0.000001 }, caixa), false);
  assert.equal(melhorQue({ ...caixa, consumo: contorno.consumo - 0.000001 }, contorno), true);
  assert.equal(melhorQue({ ...contorno, consumo: 1, naoEncaixadas: [{}] }, caixa), false);
  assert.equal(melhorQue(caixa, { ...contorno, consumo: 1, naoEncaixadas: [{}] }), true);
  assert.equal(melhorQue(caixa, null), true);
  console.log('OK — empate favorece o contorno local e dos workers, sem aumentar consumo nem deixar peças de fora.');
}

principal().catch(erro => { console.error(erro); process.exitCode = 1; });
