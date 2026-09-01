#!/usr/bin/env node
/**
 * Confere que o motor em WebAssembly dá exatamente o mesmo resultado que o
 * motor em JavaScript.
 *
 * Essa é a regra que segura o `wasm/src/lib.rs` inteiro: o JavaScript
 * (`encaixarContorno`, em encaixe-motor.js) é a **referência de correção**, e o
 * WASM é só a mesma conta mais rápida. Qualquer diferença é erro — e sem uma
 * conferência automática ela apareceria como "de vez em quando o encaixe sai
 * diferente", que é o pior jeito de descobrir.
 *
 * Como funciona: sobe duas instâncias do motor, uma com o WASM ligado e outra
 * sem, monta as mesmas peças nas duas e roda a mesma ordem de unidades em cada
 * combinação de heurística, salto e agrupamento. Depois compara peça por peça:
 * posição, rotação, consumo, o que sobrou de fora e o `piorVazio` (a medida que
 * o reparo guiado da busca usa).
 *
 *   node bancada/conferir.js
 */

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

// Todos os trabalhos do catálogo, em todas as combinações que o motor usa.
const HEURISTICAS = ["fundo", "vazio"];
const SALTOS = [1, 3];
const AGRUPAMENTOS = [1, 2, 3];

/** Prepara o trabalho dentro de UMA instância do motor. */
function montar(motor, nome) {
  const receita = TRABALHOS[nome];
  const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
    passo, raio, giro: p.giro || "180", qtd: p.qtd,
  }));
  return { receita, passo, itens: expandir(pecas) };
}

/**
 * Uma ordem embaralhada, mas sempre a mesma: a conferência tem que ser
 * repetível, senão um erro que só aparece numa ordem específica some no dia
 * seguinte.
 */
function embaralharFixo(lista, semente) {
  const saida = lista.slice();
  let estado = semente >>> 0;
  for (let i = saida.length - 1; i > 0; i--) {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    const j = estado % (i + 1);
    const guarda = saida[i]; saida[i] = saida[j]; saida[j] = guarda;
  }
  return saida;
}

/** O resultado reduzido ao que precisa bater, em texto comparável. */
function assinar(resultado) {
  const posicoes = resultado.posicoes
    .map((p) => `${p.item.indice}#${p.item.copia}@${p.x.toFixed(4)},${p.y.toFixed(4)}r${p.rot}`)
    .sort();
  return [
    `consumo=${resultado.consumo.toFixed(6)}`,
    `fora=${resultado.naoEncaixadas.length}`,
    `piorVazio=${resultado.piorVazio}`,
    ...posicoes,
  ].join("\n");
}

async function principal() {
  const comWasm = await carregarMotor({ comWasm: true });
  const semWasm = await carregarMotor({ comWasm: false });
  if (!comWasm.comWasm) {
    console.error("o módulo WebAssembly não carregou — não há o que conferir.");
    process.exit(1);
  }

  let casos = 0;
  const falhas = [];

  for (const nome of Object.keys(TRABALHOS)) {
    const a = montar(comWasm, nome);
    const b = montar(semWasm, nome);

    for (const tamanho of AGRUPAMENTOS) {
      const unidadesA = comWasm.montarUnidades(a.itens, tamanho);
      const unidadesB = semWasm.montarUnidades(b.itens, tamanho);
      if (unidadesA.length !== unidadesB.length) {
        falhas.push(`${nome}/agrupamento ${tamanho}: as duas instâncias montaram`
          + ` ${unidadesA.length} e ${unidadesB.length} unidades`);
        continue;
      }

      // A mesma ordem dos dois lados: as unidades saem na mesma sequência das
      // duas instâncias, então basta embaralhar pelo índice.
      for (const semente of [1, 20260824]) {
        const indices = embaralharFixo(unidadesA.map((_, i) => i), semente);
        const listaA = indices.map((i) => unidadesA[i]);
        const listaB = indices.map((i) => unidadesB[i]);

        for (const heuristica of HEURISTICAS) {
          for (const saltoX of SALTOS) {
            const config = {
              larguraTecido: a.receita.larguraTecido,
              margem: a.receita.margem,
              passo: a.passo,
              heuristica, saltoX,
            };
            const rA = comWasm.encaixarContorno(listaA, config);
            const rB = semWasm.encaixarContorno(listaB, config);
            casos++;
            const assinaturaA = assinar(rA);
            const assinaturaB = assinar(rB);
            if (assinaturaA !== assinaturaB) {
              const linhasA = assinaturaA.split("\n");
              const linhasB = assinaturaB.split("\n");
              const primeira = linhasA.findIndex((l, i) => l !== linhasB[i]);
              falhas.push(`${nome} · grupo ${tamanho} · semente ${semente} · ${heuristica}`
                + ` · salto ${saltoX}\n    wasm: ${linhasA[primeira]}\n    js:   ${linhasB[primeira]}`);
            }
          }
        }
      }
    }
    process.stdout.write(`  ${nome}: conferido\n`);
  }

  console.log("");
  if (falhas.length === 0) {
    console.log(`OK — ${casos} rodadas, o WASM bateu com o JavaScript em todas.`);
    return;
  }
  console.log(`FALHOU — ${falhas.length} de ${casos} rodadas diferentes:`);
  falhas.slice(0, 10).forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
