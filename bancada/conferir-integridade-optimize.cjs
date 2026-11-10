#!/usr/bin/env node
// Regressões numéricas e oráculo independente de colisão: não usa o posicionador.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { carregarMotor } = require('./motor');

async function main() {
  const motor = await carregarMotor({ comWasm: false });
  const resultados = [];
  const caso = (nome, conferir) => {
    try { conferir(); resultados.push({ nome, ok: true }); }
    catch (erro) { resultados.push({ nome, ok: false, erro: erro.message }); }
  };
  const caixa = (x = 0, y = 0) => ({ x, y, largura: 2, altura: 2 });
  const mascara = (x, y, passo = 1, topo = [0], base = [0]) => ({
    x, y, passo, largura: topo.length * passo, altura: (Math.max(...base) + 1) * passo,
    mascara: { cols: topo.length, rows: Math.max(...base) + 1,
      topo: Int32Array.from(topo), base: Int32Array.from(base), offX: 0, offY: 0 },
  });

  caso('área preservada por translação, escala e inversão', () => {
    const original = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }];
    for (const deslocamento of [0, 1e6, 1e8, 1e10, 1e12]) {
      for (const escala of [0.125, 1, 8]) {
        const pontos = original.map(p => ({ x: p.x * escala + deslocamento, y: p.y * escala + deslocamento }));
        assert.equal(motor.areaComSinal(pontos), 6 * escala * escala, `translação ${deslocamento}, escala ${escala}`);
        assert.equal(motor.areaComSinal(pontos.reverse()), -6 * escala * escala);
      }
    }
    assert.equal(motor.areaComSinal([]), 0);
  });
  caso('uma peça não conferível bloqueia o resultado inteiro', () => {
    assert.ok(motor.recusarPorSobreposicao({ posicoes: [caixa(), { ...caixa(5), x: NaN }] }));
  });
  caso('dimensão infinita não é conferível', () => {
    assert.equal(motor.acharSobreposicao([{ ...caixa(), largura: Infinity }]).conferidas, 0);
  });
  caso('máscara corrompida não cai silenciosamente na caixa', () => {
    const p = mascara(0, 0);
    p.mascara.base = Int32Array.from([-1]);
    assert.equal(motor.acharSobreposicao([p]).conferidas, 0);
    assert.ok(motor.recusarPorSobreposicao({ posicoes: [caixa(8), p] }));
  });
  caso('sobreposição menor que meia célula não some por arredondamento', () => {
    for (const eixo of ['x', 'y']) {
      const p = mascara(0, 0); p[eixo] = 0.75;
      assert.equal(motor.acharSobreposicao([mascara(0, 0), p]).pares, 1, eixo);
    }
  });
  caso('grades diferentes com caixas cruzadas mas silhuetas separadas', () => {
    const a = mascara(0, 0, 1, [0, 2], [0, 2]);
    const b = mascara(0, 1.25, 0.5);
    assert.equal(motor.acharSobreposicao([a, b]).pares, 0);
  });
  caso('encostar na borda continua permitido em rolos longos', () => {
    for (const deslocamento of [0, 10000, 1e8]) {
      assert.equal(motor.acharSobreposicao([mascara(0, deslocamento), mascara(0, deslocamento + 1)]).pares, 0);
    }
  });
  caso('500 pares contra oráculo de retângulos de células', () => {
    let estado = 927;
    const sorteio = () => { estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0; return estado / 2 ** 32; };
    // Representação independente: a união de caixas das colunas ocupadas.
    const caixas = p => Array.from(p.mascara.topo, (t, c) => ({
      x: p.x + c * p.passo, y: p.y + t * p.passo,
      w: p.passo, h: (p.mascara.base[c] + 1 - t) * p.passo,
    })).filter((_, c) => p.mascara.topo[c] >= 0);
    for (let n = 0; n < 500; n++) {
      const gerar = () => {
        const t = Array.from({ length: 3 }, () => Math.floor(sorteio() * 4));
        return mascara(Math.floor(sorteio() * 12) / 4, Math.floor(sorteio() * 12) / 4,
          [0.5, 1, 2][Math.floor(sorteio() * 3)], t, t.map(v => v + Math.floor(sorteio() * 2)));
      };
      const a = gerar(), b = gerar();
      const bate = caixas(a).some(c => caixas(b).some(d => c.x < d.x + d.w && d.x < c.x + c.w
        && c.y < d.y + d.h && d.y < c.y + c.h));
      for (const deslocamento of [0, 1e8]) {
        assert.equal(motor.acharSobreposicao([{ ...a, y: a.y + deslocamento }, { ...b, y: b.y + deslocamento }]).pares,
          Number(bate), `par ${n}, translação ${deslocamento}`);
      }
    }
  });
  caso('candidato não finito nunca substitui o melhor', () => {
    const ruim = { posicoes: [caixa()], naoEncaixadas: [], consumo: NaN };
    assert.equal(motor.melhorQue(ruim, null), false);
  });
  const relatorio = { data: new Date().toISOString(), node: process.version, resultados,
    aprovados: resultados.filter(r => r.ok).length, total: resultados.length };
  const destino = process.argv.indexOf('--json');
  if (destino >= 0) fs.writeFileSync(process.argv[destino + 1], JSON.stringify(relatorio, null, 2) + '\n');
  for (const r of resultados) console.log(`${r.ok ? 'OK' : 'FALHOU'} ${r.nome}${r.ok ? '' : ': ' + r.erro}`);
  if (relatorio.aprovados !== relatorio.total) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
