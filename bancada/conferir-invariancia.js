#!/usr/bin/env node
/**
 * ===========================================================================
 * INVARIÂNCIA POR TRANSLAÇÃO — o mesmo encaixe começando longe no rolo
 * ===========================================================================
 *
 * Teste METAMÓRFICO da precisão numérica do motor em material longo. O
 * encaixe por contorno é sequencial sobre um relevo inteiro: se o rolo já
 * começa com todas as colunas em K linhas (`perfilInicial`), cada peça tem de
 * cair exatamente na mesma coluna, K linhas abaixo de onde cairia num rolo
 * novo. Nenhuma comparação do encaixador muda com um deslocamento uniforme.
 *
 * Se em algum K isso deixa de valer, o motor perdeu precisão (ou estourou
 * inteiro) naquela escala. O teste roda no caminho em JavaScript e no WASM,
 * com as duas heurísticas, e também confere a conversão para centímetros.
 *
 * Os K vão de zero até perto do teto do Int32 (2³¹ − 1 ≈ 2,1 bilhões de
 * linhas). Rolo de verdade fica abaixo de 10⁶ linhas (2 km com célula de
 * 2 mm), então o que interessa é onde a invariância quebra, e quanta folga
 * isso deixa.
 *
 * Uso: node bancada/conferir-invariancia.js
 */
const assert = require("assert");
const { carregarMotor } = require("./motor");
const { prepararTrabalho } = require("./corrida");

const DESLOCAMENTOS = [0, 1000, 100000, 1000000, 10000000, 100000000, 1000000000, 2000000000];

function rodar(motor, unidades, base, heuristica, K) {
  const cols = motor.colunasDoTecido(base);
  const config = { ...base, heuristica, repescar: false };
  if (K > 0) config.perfilInicial = new Int32Array(cols).fill(K);
  return motor.encaixarContorno(unidades, config);
}

async function principal() {
  const caminhos = {
    javascript: await carregarMotor({ comWasm: false }),
    wasm: await carregarMotor({ comWasm: true }),
  };
  assert.ok(!caminhos.javascript.temMotorWasm(), "o caminho em JavaScript não pode ter o WASM");
  assert.ok(caminhos.wasm.temMotorWasm(), "o WASM não carregou");

  let falhas = 0;
  for (const nome of ["camiseta+manga+gola", "producao-avulsa", "giro-livre"]) {
    for (const [rotulo, motor] of Object.entries(caminhos)) {
      const t = prepararTrabalho(motor, nome);
      const unidades = motor.montarUnidades(t.itens, 1, { procurarVaos: false, giroCheio: false })
        .slice().sort(motor.ORDENS_CONTORNO[0].comparar);
      const base = {
        larguraTecido: t.receita.larguraTecido, espaco: t.receita.espaco, comprimentoBancada: 0,
        passo: t.passo, raio: t.raio, alturaMax: t.alturaMax,
      };
      for (const heuristica of ["fundo", "vazio"]) {
        const ref = rodar(motor, unidades, base, heuristica, 0);
        const quebras = [];
        for (const K of DESLOCAMENTOS.slice(1)) {
          let r;
          try {
            r = rodar(motor, unidades, base, heuristica, K);
          } catch (erro) {
            quebras.push(`K=${K}: exceção ${erro.message}`);
            continue;
          }
          const motivo = (() => {
            if (r.posicoes.length !== ref.posicoes.length) return `${r.posicoes.length} posições contra ${ref.posicoes.length}`;
            const desloc = K * t.passo;
            for (let i = 0; i < ref.posicoes.length; i++) {
              const a = ref.posicoes[i];
              const b = r.posicoes[i];
              if (a.item !== b.item || a.rot !== b.rot) return `peça ${i}: outra peça ou outro giro`;
              if (Math.abs(a.x - b.x) > 1e-9) return `peça ${i}: x ${a.x} → ${b.x}`;
              // Em centímetros, o deslocamento é K × passo, com o erro do float64.
              const tolerancia = 1e-9 * Math.max(1, desloc);
              if (Math.abs((b.y - a.y) - desloc) > tolerancia) {
                return `peça ${i}: y deslocou ${(b.y - a.y).toFixed(6)} cm, esperado ${desloc.toFixed(6)}`;
              }
              if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return `peça ${i}: posição não finita`;
            }
            return null;
          })();
          if (motivo) quebras.push(`K=${K}: ${motivo}`);
        }
        const ok = quebras.length === 0;
        if (!ok) falhas++;
        console.log(`${ok ? "ok   " : "QUEBRA"} ${nome.padEnd(20)} ${rotulo.padEnd(10)} ${heuristica.padEnd(5)}`
          + ` ${ref.posicoes.length} peças, ${(ref.consumo / 100).toFixed(3)} m`
          + (ok ? ` · invariante até K=${DESLOCAMENTOS[DESLOCAMENTOS.length - 1].toLocaleString("pt-BR")} linhas`
            : `\n       primeira quebra: ${quebras[0]}${quebras.length > 1 ? ` (+${quebras.length - 1})` : ""}`));
      }
    }
  }
  console.log(falhas === 0
    ? "\nOK — o encaixe é o mesmo, só deslocado, em todo K testado."
    : `\n${falhas} combinação(ões) perderam a invariância em algum K (ver acima).`);
}

principal().catch((erro) => { console.error(erro); process.exit(1); });
