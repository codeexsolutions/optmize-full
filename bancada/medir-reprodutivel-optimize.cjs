#!/usr/bin/env node
// Orçamento por avaliações: permite reproduzir a trajetória sem depender da
// quantidade de tentativas que couberam num segundo de uma máquina ocupada.
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { carregarMotor } = require('./motor');
const { prepararTrabalho } = require('./corrida');

async function main() {
  const motor = await carregarMotor();
  const execucoes = [];
  for (const nome of ['camiseta+manga+gola', 'misturado-pequeno', 'lote-grande']) {
    const t = prepararTrabalho(motor, nome);
    for (const semente of [11, 29, 71]) {
      const historico = [];
      const desde = performance.now();
      const r = await motor.buscarMelhorEncaixe(t.itens, { ...t.receita,
        passo: t.passo, raio: t.raio, alturaMax: t.alturaMax,
        motores: ['contorno', 'retangulo'], semente, maxTentativas: 256,
        tempoMaximoMs: 30000, msSemGanho: 1000000, polir: false,
        aoDesenhar: (tipo, candidato) => {
          if (tipo === 'recorde') historico.push({ ms: performance.now() - desde,
            consumoCm: candidato.consumo, faltantes: candidato.naoEncaixadas.length });
        },
      });
      const totalMs = performance.now() - desde;
      if (!r.validacao.completo || r.tentativas !== 256) throw new Error(`${nome}: orçamento ou viabilidade falhou`);
      execucoes.push({ nome, semente, avaliacoes: r.tentativas, consumoCm: r.consumo, totalMs,
        primeiraSolucaoMs: r.primeiraSolucaoMs, melhorSolucaoMs: r.melhorSolucaoMs,
        validacaoMs: r.validacaoMs, rejeitadas: r.rejeitadas, historico,
        sha256: crypto.createHash('sha256').update(JSON.stringify(r.posicoes.map(p =>
          [p.item.indice, p.item.copia, p.x, p.y, p.rot ?? (p.girado ? 90 : 0)]))).digest('hex'),
      });
    }
  }
  const relatorio = { versao: 1, criadoEm: new Date().toISOString(), node: process.version,
    plataforma: process.platform, cpu: os.cpus()[0]?.model, nucleosLogicos: os.cpus().length,
    memoriaPicoProcessoKiB: process.resourceUsage().maxRSS, wasm: motor.comWasm, execucoes };
  const arg = process.argv.indexOf('--json');
  if (arg >= 0) fs.writeFileSync(process.argv[arg + 1], JSON.stringify(relatorio, null, 2) + '\n');
  console.table(execucoes.map(({ nome, semente, consumoCm, totalMs, validacaoMs, rejeitadas }) =>
    ({ nome, semente, consumoCm, totalMs: +totalMs.toFixed(1), validacaoMs: +validacaoMs.toFixed(1), rejeitadas })));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
