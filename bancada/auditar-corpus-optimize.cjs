#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { carregarMotor } = require('./motor');
const { prepararTrabalho } = require('./corrida');
const { TRABALHOS } = require('./trabalhos');

async function main() {
  const motor = await carregarMotor();
  const casos = [];
  for (const nome of Object.keys(TRABALHOS)) {
    const t = prepararTrabalho(motor, nome);
    const config = { ...t.receita, passo: t.passo, raio: t.raio, alturaMax: t.alturaMax, heuristica: 'fundo' };
    const unidades = motor.montarUnidades(t.itens, 1);
    for (const estrategia of ['retangulo', 'contorno', 'vaos']) {
      const inicio = performance.now();
      const r = estrategia === 'retangulo' ? motor.encaixar(t.itens, { ...config, heuristica: 'bl' })
        : estrategia === 'contorno' ? motor.encaixarContorno(unidades, config) : motor.encaixarPorVaos(unidades, config);
      const ms = performance.now() - inicio;
      const validarDesde = performance.now();
      const validacao = motor.validarEncaixe(r, t.itens, config);
      casos.push({ nome, estrategia, pecas: t.itens.length, consumoCm: r.consumo, ms,
        validacaoMs: performance.now() - validarDesde, naoEncaixadas: r.naoEncaixadas.length,
        posicoesSha256: crypto.createHash('sha256').update(JSON.stringify(r.posicoes.map(p =>
          [p.item.indice, p.item.copia, p.x, p.y, p.largura, p.altura, p.rot ?? (p.girado ? 90 : 0)]))).digest('hex'),
        ...validacao });
    }
  }
  const relatorio = { data: new Date().toISOString(), node: process.version, cpu: os.cpus()[0]?.model,
    wasm: motor.comWasm, maxRssKiB: process.resourceUsage().maxRSS, casos };
  const arg = process.argv.indexOf('--json');
  if (arg >= 0) fs.writeFileSync(process.argv[arg + 1], JSON.stringify(relatorio, null, 2) + '\n');
  const falhas = casos.filter(c => !c.valido);
  console.log(`${casos.length} casos; ${falhas.length} inválidos; WASM=${motor.comWasm}`);
  for (const f of falhas) console.log(f.nome, f.estrategia, JSON.stringify(f.erros));
  process.exitCode = falhas.length ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
