#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { carregarMotor } = require('./motor');
const { prepararTrabalho } = require('./corrida');

async function main() {
  const js = await carregarMotor({ comWasm: false });
  const wasm = await carregarMotor();
  assert.equal(wasm.comWasm, true, 'este teste exige o WASM de produção');
  const resultados = [];
  async function caso(nome, fn) {
    try { await fn(); resultados.push({ nome, ok: true }); }
    catch (e) { resultados.push({ nome, ok: false, erro: e.message }); }
  }
  const itens = [0, 1].map(indice => ({ indice, copia: 1, largura: 10, altura: 10, giro: 'fixa' }));
  const config = { larguraTecido: 25, espaco: 1, alturaMax: 100, heuristica: 'bl' };
  const original = js.encaixar(itens, config);
  const clone = () => ({ ...original, posicoes: original.posicoes.map(p => ({ ...p })), naoEncaixadas: [] });
  const recusa = (r, codigo) => {
    const v = js.validarEncaixe(r, itens, config);
    assert.equal(v.valido, false);
    assert.ok(v.erros.some(e => e.codigo === codigo), JSON.stringify(v));
  };
  await caso('retângulo válido e persistência JSON sem deriva', () => {
    assert.equal(js.validarEncaixe(original, itens, config).completo, true);
    assert.equal(js.validarEncaixe(JSON.parse(JSON.stringify(original)), itens, config).completo, true);
  });
  await caso('peça perdida', () => { const r = clone(); r.posicoes.pop(); recusa(r, 'peca-ausente'); });
  await caso('cópia duplicada', () => { const r = clone(); r.posicoes[1].item = r.posicoes[0].item; recusa(r, 'copia-repetida'); });
  await caso('rotação proibida', () => { const r = clone(); r.posicoes[0].rot = 90; recusa(r, 'rotacao-proibida'); });
  await caso('peça deformada', () => { const r = clone(); r.posicoes[0].largura -= 1; recusa(r, 'medida-alterada'); });
  await caso('limite do material', () => { const r = clone(); r.posicoes[0].y = 200; recusa(r, 'fora-do-material'); });
  await caso('folga física violada sem sobreposição da arte', () => {
    const r = clone(); r.posicoes[1].x = 10.5; r.posicoes[1].y = 0; recusa(r, 'folga-insuficiente');
  });
  await caso('métrica de área falsificada', () => { const r = clone(); r.areaReal = 9999; recusa(r, 'area-inconsistente'); });
  await caso('pedido impossível permanece parcial e explícito', async () => {
    const grandes = [{ indice: 0, copia: 1, largura: 100, altura: 100, giro: 'fixa' }];
    const r = await js.buscarMelhorEncaixe(grandes, { ...config, motores: ['retangulo'], maxTentativas: 1 });
    assert.equal(r.validacao.valido, true); assert.equal(r.validacao.completo, false);
    assert.equal(r.naoEncaixadas.length, 1);
  });
  await caso('rolo de 20 km com 2000 peças, ótimo por limite de área', () => {
    const longas = Array.from({ length: 2000 }, (_, i) => ({ indice: 0, copia: i + 1, largura: 10, altura: 1000, giro: 'fixa' }));
    const c = { larguraTecido: 10, espaco: 0, alturaMax: 2000000, heuristica: 'bl' };
    const r = js.encaixar(longas, c), v = js.validarEncaixe(r, longas, c);
    assert.equal(v.completo, true, JSON.stringify(v.erros));
    assert.equal(r.consumo, 2000000); assert.equal(r.consumo, v.limiteAreaCm);
  });
  await caso('overflow i32 bloqueado antes de JS e WASM', () => {
    for (const m of [js, wasm]) {
      const mascaras = m.mascarasDeSilhueta({ bits: new Uint8Array(20).fill(1), modo: 'caixa' }, 1, 20, 1, 0,
        { largura: 1, altura: 20 });
      const lista = [1, 2].map(copia => ({ indice: 0, copia, largura: 1, altura: 20, giro: 'fixa', mascaras }));
      const unidades = m.montarUnidades(lista, 1);
      assert.throws(() => m.encaixarContorno(unidades, { larguraTecido: 1, passo: 1, raio: 0, heuristica: 'fundo',
        perfilInicial: Float64Array.from([2147483640]) }), RangeError);
    }
  });
  await caso('bancada forçada igual no JS e WASM', () => {
    const rodar = m => {
      const t = prepararTrabalho(m, 'camiseta+manga+gola');
      return m.encaixarContorno(m.montarUnidades(t.itens, 1), {
        ...t.receita, passo: t.passo, raio: t.raio, linhasBancadaForcado: 420, heuristica: 'fundo',
      }).posicoes.map(p => [p.x, p.y, p.rot, p.bancada]);
    };
    assert.deepEqual(rodar(wasm), rodar(js));
  });
  const t = prepararTrabalho(wasm, 'misturado-pequeno');
  const busca = { ...t.receita, passo: t.passo, raio: t.raio, alturaMax: t.alturaMax,
    motores: ['contorno', 'retangulo'], maxTentativas: 120, tempoMaximoMs: 30000,
    msSemGanho: 100000, semente: 12345, polir: false };
  await caso('escala, halo e origem da máscara não podem ser trocados', () => {
    const r = wasm.encaixarContorno(wasm.montarUnidades(t.itens, 1), { ...busca, heuristica: 'fundo' });
    assert.equal(wasm.validarEncaixe(r, t.itens, busca).completo, true);
    const alterado = { ...r, posicoes: r.posicoes.map(p => ({ ...p })) };
    alterado.posicoes[0].passo *= 0.5;
    assert.equal(wasm.validarEncaixe(alterado, t.itens, busca).valido, false, 'passo adulterado');
    assert.equal(wasm.validarEncaixe(r, t.itens, { ...busca, raio: t.raio + 1 }).valido, false, 'halo incompatível');
    const semOrigem = t.itens.map(item => ({ ...item, mascaras: undefined }));
    assert.equal(wasm.validarEncaixe({ ...r, areaReal: undefined }, semOrigem, busca).valido, false, 'máscara sem origem');
  });
  await caso('mesma seed e mesmo número de avaliações dão a mesma solução', async () => {
    const a = await wasm.buscarMelhorEncaixe(t.itens, busca);
    const b = await wasm.buscarMelhorEncaixe(t.itens, busca);
    assert.equal(a.tentativas, 120); assert.equal(b.tentativas, 120);
    const assinatura = r => r.posicoes.map(p => [p.item.indice, p.item.copia, p.x, p.y, p.rot]);
    assert.deepEqual(assinatura(a), assinatura(b));
    assert.equal(a.validacao.completo, true); assert.equal(a.rejeitadas, 0);
  });
  await caso('cancelamento observado dentro do lote', async () => {
    let contadas = 0;
    const r = await wasm.buscarMelhorEncaixe(t.itens, { ...busca, maxReceitasBase: 1, tentativasPorLote: 8,
      deveParar: () => contadas >= 3, aoDesenhar: tipo => { if (tipo === 'fantasma') contadas++; } });
    assert.equal(r.tentativas, 3); assert.equal(r.validacao.completo, true);
  });
  await caso('recordes publicados são viáveis e não aumentam consumo', async () => {
    let antes = Infinity, avisos = 0;
    await wasm.buscarMelhorEncaixe(t.itens, { ...busca, aoDesenhar: (tipo, r) => {
      if (tipo !== 'recorde') return;
      assert.equal(wasm.validarEncaixe(r, t.itens, busca).completo, true);
      assert.ok(r.consumo <= antes); antes = r.consumo; avisos++;
    } });
    assert.ok(avisos > 0);
  });
  const arg = process.argv.indexOf('--json');
  if (arg >= 0) fs.writeFileSync(process.argv[arg + 1], JSON.stringify({ data: new Date().toISOString(), resultados }, null, 2) + '\n');
  for (const r of resultados) console.log(`${r.ok ? 'OK' : 'FALHOU'} ${r.nome}${r.ok ? '' : ': ' + r.erro}`);
  process.exitCode = resultados.some(r => !r.ok) ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
