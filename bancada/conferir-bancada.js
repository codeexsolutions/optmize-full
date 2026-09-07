#!/usr/bin/env node
/**
 * Confere a trava da bancada: **nenhuma peça cruza a linha entre duas
 * bancadas**, e cada bancada cabe no comprimento pedido.
 *
 * Por que isto tem um arquivo só para ele
 * ---------------------------------------
 * É a regra em que a paginação do PDF se apoia. O rolo já saiu repartido uma
 * vez (a1b7c6d) e a repartição foi desfeita porque o corte procurava um vão
 * entre as peças — e encaixe bom é exatamente o que não deixa vão. O corte
 * passava por cima de uma peça, metade num pedaço e metade no outro. Peça
 * partida é peça perdida.
 *
 * Agora o corte não procura nada: ele é um lugar onde peça nenhuma PODE estar,
 * porque o encaixe foi feito assim. Só que "por construção" é um argumento, e
 * argumento não pega `<=` trocado por `<` nem erro de arredondamento entre a
 * célula da grade e o centímetro da tela. Por isso a regra é medida aqui, na
 * posição final — a mesma que a tela desenha e que o PDF reparte.
 *
 * O que é medido
 * --------------
 *   1. cada peça dentro de UMA bancada, sem encostar na linha
 *   2. bancadas em ordem e sem se sobrepor — existe corte possível entre elas
 *   3. cada bancada cabe no comprimento pedido (senão não cabe na mesa)
 *   4. a ARTE também cabe: a trava prende a silhueta, e o que a máquina imprime
 *      é o retângulo da arte, que é maior. Se ele estourar a bancada, a página
 *      do PDF sai maior que a mesa — e é aqui que isso aparece.
 *   5. quanto a trava custou de tecido, contra o mesmo trabalho sem bancada
 *
 *   node bancada/conferir-bancada.js
 *   node bancada/conferir-bancada.js --trabalhos so-camiseta --bancadas 200,300
 */

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

const MOTORES = ["contorno", "contorno+repesca", "vaos", "retangulo"];
const BANCADAS_PADRAO = [150, 200, 300];

/**
 * O que a peça ocupa no rolo, em centímetros: a silhueta (já com a folga, que é
 * o que o encaixe trava) e o retângulo da arte, que é o que sai impresso.
 *
 * Sem máscara — o motor de retângulo — os dois são a mesma coisa: ali a peça é
 * a caixa dela.
 */
function ocupacaoDaPeca(pos) {
  const arte = { topo: pos.y, fundo: pos.y + pos.altura };
  const m = pos.mascara;
  if (!m) return { silhueta: arte, arte };

  const passo = pos.passo;
  const row0 = Math.round((pos.y + m.offY) / passo);
  let primeira = Infinity;
  let ultima = -Infinity;
  for (let c = 0; c < m.cols; c++) {
    if (m.topo[c] < 0) continue;
    if (m.topo[c] < primeira) primeira = m.topo[c];
    if (m.base[c] > ultima) ultima = m.base[c];
  }
  return {
    silhueta: { topo: (row0 + primeira) * passo, fundo: (row0 + ultima + 1) * passo },
    arte,
  };
}

/** Agrupa as posições pelo número de bancada que o motor carimbou. */
function bancadasDe(posicoes) {
  const porNumero = new Map();
  posicoes.forEach((pos) => {
    const numero = pos.bancada || 0;
    const ocupa = ocupacaoDaPeca(pos);
    let b = porNumero.get(numero);
    if (!b) {
      b = { numero, silhuetaTopo: Infinity, silhuetaFundo: -Infinity,
        arteTopo: Infinity, arteFundo: -Infinity, pecas: 0 };
      porNumero.set(numero, b);
    }
    b.silhuetaTopo = Math.min(b.silhuetaTopo, ocupa.silhueta.topo);
    b.silhuetaFundo = Math.max(b.silhuetaFundo, ocupa.silhueta.fundo);
    b.arteTopo = Math.min(b.arteTopo, ocupa.arte.topo);
    b.arteFundo = Math.max(b.arteFundo, ocupa.arte.fundo);
    b.pecas++;
  });
  return [...porNumero.values()].sort((a, b) => a.numero - b.numero);
}

function encaixarCom(motor, motorNome, itens, config) {
  if (motorNome === "retangulo") return motor.encaixar(itens, { ...config, heuristica: "bl" });
  if (motorNome === "vaos") return motor.encaixarPorVaos(motor.montarUnidades(itens, 1), config);
  const comRepesca = motorNome === "contorno+repesca";
  return motor.encaixarContorno(motor.montarUnidades(itens, 1),
    comRepesca ? { ...config, repescar: true } : config);
}

function lerArgumentos(argv) {
  const opcoes = {
    motores: MOTORES,
    trabalhos: Object.keys(TRABALHOS),
    bancadas: BANCADAS_PADRAO,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--motor") { opcoes.motores = argv[i + 1].split(","); i++; }
    else if (argv[i] === "--trabalhos") { opcoes.trabalhos = argv[i + 1].split(","); i++; }
    else if (argv[i] === "--bancadas") { opcoes.bancadas = argv[i + 1].split(",").map(Number); i++; }
    else throw new Error(`argumento desconhecido: ${argv[i]}`);
  }
  return opcoes;
}

async function principal() {
  const opcoes = lerArgumentos(process.argv);
  const motor = await carregarMotor({ comWasm: true });
  const falhas = [];
  // Uma folga de arredondamento: a posição em centímetros nasce de células
  // multiplicadas pelo passo, e comparar ponto flutuante no olho do "igual"
  // acusaria falha onde não há nenhuma.
  const EPS = 1e-6;

  for (const nome of opcoes.trabalhos) {
    const receita = TRABALHOS[nome];
    const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
    const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
      passo, raio, giro: p.giro || "180", qtd: p.qtd,
    }));
    const itens = expandir(pecas);
    const alturaMax = itens.reduce((s, i) => s + Math.max(i.largura, i.altura) + receita.espaco, 0);
    const base = {
      larguraTecido: receita.larguraTecido, espaco: receita.espaco,
      passo, alturaMax, heuristica: "fundo",
    };

    for (const motorNome of opcoes.motores) {
      // A referência: o mesmo trabalho, no mesmo motor, com o rolo sem fim.
      const solto = encaixarCom(motor, motorNome, itens, { ...base, comprimentoBancada: 0 });

      for (const comprimento of opcoes.bancadas) {
        const r = encaixarCom(motor, motorNome, itens, { ...base, comprimentoBancada: comprimento });
        const erro = (queixa) => falhas.push(`${nome} · ${motorNome} · bancada ${comprimento}: ${queixa}`);
        const bancadas = bancadasDe(r.posicoes);

        // 1) Peça perdida. Com bancada, uma peça pode legitimamente não caber
        // (mais comprida que a mesa) — o que não pode é sumir peça que cabia.
        const maiorPeca = Math.max(...itens.map((i) => Math.min(i.largura, i.altura)));
        if (r.naoEncaixadas.length > solto.naoEncaixadas.length && maiorPeca <= comprimento) {
          erro(`${r.naoEncaixadas.length} peças ficaram de fora, contra`
            + ` ${solto.naoEncaixadas.length} sem bancada — e todas cabem no comprimento`);
        }

        // 2) e 3) Cada bancada em ordem, sem invadir a seguinte, e cabendo na mesa.
        let fimAnterior = -Infinity;
        let maiorEstouroDaArte = 0;
        bancadas.forEach((b) => {
          if (b.silhuetaTopo < fimAnterior - EPS) {
            erro(`a bancada ${b.numero} começa em ${b.silhuetaTopo.toFixed(2)} cm,`
              + ` antes de a anterior terminar (${fimAnterior.toFixed(2)} cm) — não há onde cortar`);
          }
          fimAnterior = b.silhuetaFundo;

          const usado = b.silhuetaFundo - b.silhuetaTopo;
          if (usado > comprimento + EPS) {
            erro(`a bancada ${b.numero} ocupa ${usado.toFixed(2)} cm, mais que os ${comprimento} cm da mesa`);
          }
          const usadoPelaArte = b.arteFundo - b.arteTopo;
          if (usadoPelaArte > comprimento + EPS) {
            maiorEstouroDaArte = Math.max(maiorEstouroDaArte, usadoPelaArte - comprimento);
          }
        });

        // 4) A arte estourando a bancada não derruba o teste: ela não parte
        // peça nenhuma (a silhueta continua inteira), só faz a página do PDF
        // sair mais comprida que a mesa. Mas precisa aparecer, porque quem vai
        // pôr o tecido na mesa é quem descobre.
        if (maiorEstouroDaArte > 0) {
          erro(`a arte estoura a bancada em ${maiorEstouroDaArte.toFixed(2)} cm —`
            + ` a página do PDF fica maior que a mesa`);
        }

        const custo = solto.consumo > 0 ? ((r.consumo / solto.consumo) - 1) * 100 : 0;
        process.stdout.write(`  ${nome.padEnd(20)} ${motorNome.padEnd(18)}`
          + ` bancada ${String(comprimento).padStart(3)} cm ·`
          + ` ${String(bancadas.length).padStart(2)} bancadas ·`
          + ` ${(r.consumo / 100).toFixed(2)} m`
          + ` (sem trava ${(solto.consumo / 100).toFixed(2)} m, ${custo >= 0 ? "+" : ""}${custo.toFixed(1)}%)\n`);
      }
    }
  }

  console.log("");
  if (falhas.length === 0) {
    console.log("OK — nenhuma peça cruza a linha, e toda bancada cabe na mesa.");
    return;
  }
  console.log(`FALHOU — ${falhas.length} problema(s):`);
  falhas.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
