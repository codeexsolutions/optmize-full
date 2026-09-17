#!/usr/bin/env node
/**
 * Confere que cortar a rotação repetida não muda o encaixe — nem um milímetro.
 *
 * Essa é a regra que segura o corte inteiro (ver "A ROTAÇÃO QUE O MOTOR NÃO TEM
 * COMO DISTINGUIR", em encaixeMotor.js). O argumento é que duas rotações com a
 * mesma pegada — mesmos `cols`, `rows`, `topo` e `base` — assentam no mesmo
 * lugar, então a segunda é varredura de rolo gasta pelo mesmo resultado. Se
 * isso for verdade, tirá-la tem que dar encaixe IDÊNTICO; se der diferente, o
 * argumento está errado e o corte é uma mexida no resultado disfarçada de
 * economia.
 *
 * É a mesma conferência que o `conferir.js` faz entre o WASM e o JavaScript, e
 * pelo mesmo motivo: sem ela, a diferença apareceria como "de vez em quando o
 * encaixe sai diferente", que é o pior jeito de descobrir.
 *
 * O que ela compara: posição, rotação, consumo, o que ficou de fora e o
 * `piorVazio`, peça por peça, com e sem o corte — nos mesmos trabalhos, nas
 * mesmas ordens, nas mesmas heurísticas.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A ROTAÇÃO TAMBÉM TEM QUE BATER
 * ---------------------------------------------------------------------------
 *
 * Seria defensável que só o consumo batesse: o corte tira a rotação de 180° do
 * punho, e se a busca a tivesse escolhido antes, agora escolheria 0° — mesma
 * pegada, mesmo tecido, giro diferente no papel.
 *
 * Só que ela não escolhia. Os encaixadores percorrem as formas na ordem e só
 * trocam de melhor por "estritamente melhor", então empate fica com a primeira
 * — e a primeira é sempre 0°, com corte ou sem. Exigir que a rotação bata
 * também é o que transforma "deu o mesmo tecido" em "é o mesmo encaixe".
 *
 *   node bancada/conferir-rotacoes.js
 */

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

// As mesmas combinações do `conferir.js`: é o conjunto que cobre o que o motor
// realmente usa, e repetir a escolha deixa as duas conferências comparáveis.
const HEURISTICAS = ["fundo", "vazio"];
const SALTOS = [1, 3];
const AGRUPAMENTOS = [1, 2, 3];
const BANCADAS = [0, 200];

function montar(motor, nome) {
  const receita = TRABALHOS[nome];
  const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
    passo, raio, giro: p.giro || "180", qtd: p.qtd,
  }));
  return { receita, passo, itens: expandir(pecas) };
}

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
  // Duas instâncias do motor, e o interruptor fixado em cada uma. Ele é global
  // ao módulo (ver `definirRotacoesDistintas`), então duas instâncias é o jeito
  // de ter os dois estados vivos ao mesmo tempo — o mesmo arranjo que o
  // `conferir.js` usa para o WASM.
  const comCorte = await carregarMotor();
  const semCorte = await carregarMotor();
  comCorte.definirRotacoesDistintas(true);
  semCorte.definirRotacoesDistintas(false);

  let casos = 0;
  let formasCortadas = 0;
  let formasTotais = 0;
  const falhas = [];

  for (const nome of Object.keys(TRABALHOS)) {
    const a = montar(comCorte, nome);
    const b = montar(semCorte, nome);

    for (const tamanho of AGRUPAMENTOS) {
      const unidadesA = comCorte.montarUnidades(a.itens, tamanho);
      const unidadesB = semCorte.montarUnidades(b.itens, tamanho);
      if (unidadesA.length !== unidadesB.length) {
        falhas.push(`${nome}/agrupamento ${tamanho}: ${unidadesA.length} unidades com corte`
          + ` e ${unidadesB.length} sem — o corte tirou UNIDADE, e não forma`);
        continue;
      }

      // Quanto o corte poupou, no proxy que importa: formas percorridas por
      // tentativa. Não é o que está sendo conferido, mas é o que dá sentido à
      // conferência — corte que não poupa nada não precisaria de prova.
      unidadesA.forEach((u, i) => {
        formasCortadas += u.formas.length;
        formasTotais += unidadesB[i].formas.length;
      });

      for (const semente of [1, 20260824]) {
        const indices = embaralharFixo(unidadesA.map((_, i) => i), semente);
        const listaA = indices.map((i) => unidadesA[i]);
        const listaB = indices.map((i) => unidadesB[i]);

        for (const heuristica of HEURISTICAS) {
          for (const saltoX of SALTOS) {
            for (const comprimentoBancada of BANCADAS) {
              const config = {
                larguraTecido: a.receita.larguraTecido,
                comprimentoBancada,
                passo: a.passo,
                heuristica, saltoX,
              };
              const rA = comCorte.encaixarContorno(listaA, config);
              const rB = semCorte.encaixarContorno(listaB, config);
              casos++;
              const assinaturaA = assinar(rA);
              const assinaturaB = assinar(rB);
              if (assinaturaA !== assinaturaB) {
                const linhasA = assinaturaA.split("\n");
                const linhasB = assinaturaB.split("\n");
                const primeira = linhasA.findIndex((l, i) => l !== linhasB[i]);
                falhas.push(`${nome} · grupo ${tamanho} · semente ${semente} · ${heuristica}`
                  + ` · salto ${saltoX} · bancada ${comprimentoBancada}`
                  + `\n    com corte: ${linhasA[primeira]}\n    sem corte: ${linhasB[primeira]}`);
              }
            }
          }
        }
      }
    }
    process.stdout.write(`  ${nome}: conferido\n`);
  }

  const economia = formasTotais > 0 ? (1 - formasCortadas / formasTotais) * 100 : 0;
  console.log("");
  console.log(`formas por tentativa: ${formasCortadas} com corte, ${formasTotais} sem`
    + ` — ${economia.toFixed(1)}% a menos de varredura de rolo.`);
  if (falhas.length === 0) {
    console.log(`OK — ${casos} rodadas, o encaixe saiu idêntico em todas.`);
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
