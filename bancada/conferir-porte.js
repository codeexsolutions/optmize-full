#!/usr/bin/env node
/**
 * ===========================================================================
 * CONFERIR O PORTE — o motor de `src/nucleo/` é o mesmo de `public/`?
 * ===========================================================================
 *
 * O motor de encaixe está migrando de `<script>` solto para módulo ESM, e
 * durante essa travessia ele existe em DOIS lugares:
 *
 *   public/encaixe-motor.js   o que a tela antiga e os workers dela carregam
 *   src/nucleo/encaixeMotor.js   o que a tela nova carrega
 *
 * O porte foi mecânico — só `import` e `export` entraram, e dá para contar
 * quantas linhas diferem. Mas "só acrescentei export" é uma afirmação sobre o
 * texto, não sobre o comportamento: um ciclo de importação que se resolve
 * diferente, uma variável de módulo que deixa de ser compartilhada, uma função
 * que sai içada de outro jeito — nada disso aparece num diff de linhas.
 *
 * Este arquivo faz a afirmação virar prova. Sobe as duas instâncias, monta as
 * mesmas peças nas duas, roda a mesma ordem embaralhada com a mesma semente em
 * cada combinação de heurística, salto, agrupamento e bancada, e compara peça
 * por peça: posição, rotação, consumo, o que sobrou de fora e o `piorVazio`.
 *
 * Qualquer diferença é erro. É a mesma regra do `conferir.js`, que compara o
 * WASM com o JavaScript — e pelo mesmo motivo: sem conferência automática, a
 * diferença apareceria como "de vez em quando o encaixe sai diferente", que é
 * o pior jeito de descobrir.
 *
 *   npm run bancada:porte
 *
 * ESTE ARQUIVO É TEMPORÁRIO. Ele some junto com `public/`, quando o Encaixe
 * migrar e sobrar um motor só.
 */

const { carregarMotor } = require("./motor");
const { carregarMotorDoNucleo } = require("./motor-nucleo");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

const HEURISTICAS = ["fundo", "vazio"];
const SALTOS = [1, 3];
const AGRUPAMENTOS = [1, 2, 3];
// Com e sem bancada: a trava da bancada é a conta mais delicada do motor.
const BANCADAS = [0, 200];

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
  const antigo = await carregarMotor({ comWasm: true });
  const portado = await carregarMotorDoNucleo({ comWasm: true });

  /*
   * Os dois têm que estar com o WASM ligado. Comparar um com WASM e outro sem
   * seria comparar dois caminhos diferentes do mesmo motor — passaria a
   * conferência sem provar nada sobre o porte.
   */
  if (!antigo.comWasm || !portado.comWasm) {
    console.error("o módulo WebAssembly não carregou nos dois lados —"
      + ` antigo: ${antigo.comWasm}, portado: ${portado.comWasm}.`);
    process.exit(1);
  }

  let casos = 0;
  const falhas = [];

  for (const nome of Object.keys(TRABALHOS)) {
    const a = montar(antigo, nome);
    const b = montar(portado, nome);

    for (const tamanho of AGRUPAMENTOS) {
      const unidadesA = antigo.montarUnidades(a.itens, tamanho);
      const unidadesB = portado.montarUnidades(b.itens, tamanho);
      if (unidadesA.length !== unidadesB.length) {
        falhas.push(`${nome}/agrupamento ${tamanho}: os dois motores montaram`
          + ` ${unidadesA.length} e ${unidadesB.length} unidades`);
        continue;
      }

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
              const rA = antigo.encaixarContorno(listaA, config);
              const rB = portado.encaixarContorno(listaB, config);
              casos++;

              const assinaturaA = assinar(rA);
              const assinaturaB = assinar(rB);
              if (assinaturaA !== assinaturaB) {
                const linhasA = assinaturaA.split("\n");
                const linhasB = assinaturaB.split("\n");
                const primeira = linhasA.findIndex((l, i) => l !== linhasB[i]);
                falhas.push(`${nome} · grupo ${tamanho} · semente ${semente} · ${heuristica}`
                  + ` · salto ${saltoX} · bancada ${comprimentoBancada}`
                  + `\n    public: ${linhasA[primeira]}\n    nucleo: ${linhasB[primeira]}`);
              }
            }
          }
        }
      }
    }
    process.stdout.write(`  ${nome}: conferido\n`);
  }

  /*
   * A assinatura do trabalho e o vetor de features também precisam bater: são
   * eles que o servidor guarda e que treinam a rede das receitas. Um porte que
   * mudasse a assinatura faria o histórico inteiro deixar de casar com os
   * trabalhos novos — em silêncio, porque nada quebra: as receitas aprendidas
   * simplesmente parariam de ser encontradas.
   */
  for (const nome of Object.keys(TRABALHOS)) {
    const a = montar(antigo, nome);
    const b = montar(portado, nome);
    const assA = antigo.assinaturaDoTrabalho(a.itens, a.receita.larguraTecido);
    const assB = portado.assinaturaDoTrabalho(b.itens, b.receita.larguraTecido);
    casos++;
    if (assA !== assB) {
      falhas.push(`${nome}: assinatura diferente\n    public: ${assA}\n    nucleo: ${assB}`);
    }
  }

  console.log("");
  if (falhas.length) {
    console.error(`FALHOU — ${falhas.length} diferença(s) em ${casos} caso(s):\n`);
    falhas.slice(0, 10).forEach((f) => console.error("  " + f + "\n"));
    if (falhas.length > 10) console.error(`  ... e mais ${falhas.length - 10}.`);
    process.exit(1);
  }
  console.log(`OK — ${casos} caso(s), o motor de src/nucleo bateu com o de public em todos.`);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
