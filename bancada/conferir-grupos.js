#!/usr/bin/env node
/**
 * Confere os grupos: as peças que a pessoa marcou saem PERTO umas das outras.
 *
 * O grupo não existe para economizar tecido — ele CUSTA tecido. Existe para a
 * mesa de corte: achar as seis partes de uma camisa espalhadas em doze metros
 * gasta mais tempo de costureira do que os centímetros a mais que a vizinhança
 * cobra. Então o que se confere aqui não é metragem, é ESPALHAMENTO: quanto de
 * rolo a costureira percorre para juntar um conjunto.
 *
 * Duas coisas, uma exata e uma medida.
 *
 * A exata é o `juntarGrupos`: dada qualquer fila, as peças de cada grupo têm
 * que sair contíguas, cada grupo no lugar do seu primeiro membro e os membros
 * na ordem relativa em que estavam. Isso é determinístico e não depende de
 * encaixe nenhum.
 *
 * A medida é o efeito no rolo de verdade: o mesmo pedido, encaixado com e sem
 * grupo, e o espalhamento de cada conjunto comparado. Aqui não dá para exigir
 * um número exato — a busca é sorteada —, então a exigência é de direção e
 * tamanho: o espalhamento tem que cair bastante. O custo em tecido é impresso
 * junto, sem virar exigência, porque ele é a informação que decide se vale a
 * pena e não um defeito a corrigir.
 *
 *   node bancada/conferir-grupos.js
 */

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");

const LARGURA = 179;
const PASSO = 0.5;
const ESPACO = 0.4;
// Orçamento por NÚMERO DE TENTATIVAS, e não por tempo: duas rodadas medidas
// pelo relógio já variavam 2% entre si numa máquina ocupada — mais do que o
// efeito que se quer enxergar.
const TENTATIVAS = 4000;
// O espalhamento tem que cair pelo menos isto. Medido na versão em que os
// grupos entraram: caiu de 39% a 53% nos dois conjuntos, em quatro corridas.
// O piso é folgado de propósito — ele existe para pegar o grupo que PAROU de
// funcionar, não para cravar o número do dia.
const QUEDA_MINIMA = 0.15;

/**
 * Quanto de rolo um conjunto ocupa: do topo da peça mais alta ao pé da mais
 * baixa. É a distância que a costureira percorre para juntar o conjunto.
 */
function espalhamentoPorConjunto(resultado) {
  const faixas = new Map();
  resultado.posicoes.forEach((pos) => {
    const conjunto = pos.item.conjunto;
    if (!conjunto) return;
    let faixa = faixas.get(conjunto);
    if (!faixa) { faixa = { topo: Infinity, fundo: -Infinity, pecas: 0 }; faixas.set(conjunto, faixa); }
    faixa.topo = Math.min(faixa.topo, pos.y);
    faixa.fundo = Math.max(faixa.fundo, pos.y + pos.altura);
    faixa.pecas++;
  });
  const saida = new Map();
  faixas.forEach((f, nome) => saida.set(nome, { cm: f.fundo - f.topo, pecas: f.pecas }));
  return saida;
}

async function encaixar(motor, pecas) {
  const itens = expandir(pecas);
  const alturaMax = itens.reduce((s, i) => s + Math.max(i.largura, i.altura) + ESPACO, 0);
  let vistas = 0;
  const r = await motor.buscarMelhorEncaixe(itens, {
    larguraTecido: LARGURA, espaco: ESPACO, passo: PASSO, alturaMax,
    motores: ["contorno", "retangulo"],
    tempoMaximoMs: 600000, semente: 20260824,
    aoProgredir: (estado) => { vistas = estado.tentativas; },
    deveParar: () => vistas >= TENTATIVAS,
  });
  return r;
}

// ==================== A PARTE EXATA ====================

function conferirJuntarGrupos(motor, erro) {
  const u = (indice, grupo) => ({ itens: [{ indice, grupo }] });
  const nomes = (lista) => lista.map((x) => `${x.itens[0].indice}${x.itens[0].grupo || ""}`).join(" ");

  // Espalhados: A, b, A, c, B, A, B  ->  os A juntos no lugar do primeiro A,
  // os B juntos no lugar do primeiro B, e as soltas onde estavam.
  const fila = [u(1, "A"), u(2, null), u(3, "A"), u(4, null), u(5, "B"), u(6, "A"), u(7, "B")];
  const junta = motor.juntarGrupos(fila);
  const esperado = "1A 3A 6A 2 4 5B 7B";
  if (nomes(junta) !== esperado) {
    erro(`juntarGrupos: saiu "${nomes(junta)}", esperava "${esperado}"`);
  }
  if (junta.length !== fila.length) {
    erro(`juntarGrupos: entrou com ${fila.length} e saiu com ${junta.length}`);
  }

  // Sem grupo nenhum, tem que devolver a MESMA lista — nada de trabalho nem de
  // mudança para quem não usa a função.
  const semGrupo = [u(1, null), u(2, null), u(3, null)];
  if (motor.juntarGrupos(semGrupo) !== semGrupo) {
    erro("juntarGrupos: mexeu numa fila sem grupo nenhum");
  }

  // Com grupo, o grupo É a família: é assim que o `baguncarFamilias` sacode o
  // bloco inteiro em vez de picá-lo.
  if (motor.familiaDaUnidade(u(9, "A")) !== "A") {
    erro("familiaDaUnidade: peça agrupada não respondeu o grupo");
  }
  if (motor.familiaDaUnidade(u(9, null)) !== "9") {
    erro("familiaDaUnidade: peça sem grupo deixou de responder o formato");
  }
}

// ==================== A PARTE MEDIDA ====================

// Um pedido de camisa em dois tamanhos, mais peças soltas que não são de
// conjunto nenhum: é elas que o motor usa para preencher os vãos do grupo, e é
// por isso que a vizinhança custa pouco.
const PEDIDO = [
  ["camiseta", "G"], ["camiseta", "G"], ["manga", "G"], ["manga", "G"], ["gola", "G"],
  ["camiseta", "P"], ["camiseta", "P"], ["manga", "P"], ["manga", "P"], ["gola", "P"],
  ["camiseta", null], ["manga", null], ["gola", null], ["regata", null],
];

async function conferirNoRolo(motor, erro) {
  // `conjunto` é o rótulo de medição e existe nas duas rodadas; `grupo` é o que
  // o motor lê, e só a segunda tem. Sem essa separação a rodada sem grupo não
  // teria como ser medida, e a comparação seria contra o vazio.
  const montar = (comGrupo) => PEDIDO.map(([nome, conjunto]) => ({
    ...prepararPeca(motor, nome, { passo: PASSO, raio: 0, qtd: 3, giro: "180" }),
    conjunto,
    grupo: comGrupo ? conjunto : null,
  }));

  const solto = await encaixar(motor, montar(false));
  const agrupado = await encaixar(motor, montar(true));

  const antes = espalhamentoPorConjunto(solto);
  const depois = espalhamentoPorConjunto(agrupado);

  const m = (cm) => `${(cm / 100).toFixed(2).replace(".", ",")} m`;
  const custo = ((agrupado.consumo - solto.consumo) / solto.consumo) * 100;
  console.log(`  rolo ${LARGURA} cm · ${expandir(montar(false)).length} peças · ${TENTATIVAS} tentativas`);
  console.log(`    sem grupo   ${m(solto.consumo).padStart(8)}`);
  console.log(`    com grupo   ${m(agrupado.consumo).padStart(8)}`
    + `   ${custo >= 0 ? "+" : ""}${custo.toFixed(1)}% de tecido — é o preço da vizinhança`);

  ["G", "P"].forEach((conjunto) => {
    const a = antes.get(conjunto);
    const d = depois.get(conjunto);
    if (!a || !d) { erro(`conjunto ${conjunto} não apareceu no encaixe`); return; }
    if (a.pecas !== d.pecas) {
      erro(`conjunto ${conjunto}: ${a.pecas} peças sem grupo e ${d.pecas} com grupo`);
    }
    const queda = (a.cm - d.cm) / a.cm;
    console.log(`    conjunto ${conjunto} (${d.pecas} peças)   espalhado em ${m(a.cm)}`
      + ` → ${m(d.cm)}   ${queda >= 0 ? "−" : "+"}${Math.abs(queda * 100).toFixed(0)}%`);
    if (queda < QUEDA_MINIMA) {
      erro(`conjunto ${conjunto}: o espalhamento caiu só ${(queda * 100).toFixed(0)}%`
        + ` (mínimo ${(QUEDA_MINIMA * 100).toFixed(0)}%) — o agrupamento parou de agrupar`);
    }
  });
}

async function principal() {
  const falhas = [];
  const erro = (queixa) => falhas.push(queixa);
  const motor = await carregarMotor({ comWasm: true });

  conferirJuntarGrupos(motor, erro);
  await conferirNoRolo(motor, erro);

  console.log("");
  if (falhas.length === 0) {
    console.log("OK — a fila junta os grupos, e no rolo o conjunto sai bem menos espalhado.");
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
