#!/usr/bin/env node
/**
 * ===========================================================================
 * O guarda que trava a produção quando há peça em cima de peça
 * ===========================================================================
 *
 * A produção relatou peça entrando dentro de outra ao puxar do histórico de
 * encaixe. A causa está descrita em `usarEncaixeGuardado`: as posições são
 * guardadas por índice de linha da tabela, e a chave do trabalho ordena as
 * peças antes de embaralhar — então as mesmas peças em ordem diferente dão a
 * mesma chave, e cada índice passa a apontar para outra peça.
 *
 * Esta conferência prova as duas pontas do conserto:
 *
 *   1. o guarda ENXERGA o estrago. Monta um encaixe legítimo com o motor de
 *      verdade e depois embaralha a quem pertence cada posição — que é
 *      exatamente o que a retomada errada fazia — e confere que a sobreposição
 *      é encontrada.
 *   2. o guarda NÃO acusa encaixe bom. O mesmo encaixe, sem embaralhar, passa
 *      limpo em todos os trabalhos e agrupamentos.
 *
 * O item 2 é o que dá valor ao item 1: um guarda que acusa sempre travaria a
 * produção toda, e seria desligado na primeira semana.
 *
 *   node bancada/conferir-guarda-sobreposicao.js
 */

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

/* Trabalhos com formatos de tamanhos BEM diferentes: é onde trocar as posições
   entre peças produz cruzamento de verdade. Dois formatos iguais trocados de
   lugar dariam o mesmo encaixe, e o teste não provaria nada. */
const TRABALHOS_DO_TESTE = ["camiseta+manga+gola", "tamanhos-extremos", "calca-bolso"];
const AGRUPAMENTOS = [1, 2];

function montar(motor, nome) {
  const receita = TRABALHOS[nome];
  const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
    passo, raio, giro: p.giro || "180", qtd: p.qtd,
  }));
  return { receita, passo, itens: expandir(pecas) };
}

/**
 * Embaralha a QUEM cada posição pertence, mantendo as coordenadas.
 *
 * É a forma exata do defeito: as coordenadas continuam as do encaixe bom, e o
 * que muda é a máscara que vai em cada uma — como se o índice tivesse passado a
 * apontar para outra linha da tabela.
 *
 * Só vale trocar entre peças de FORMATO diferente; trocar duas cópias da mesma
 * silhueta devolve o mesmo encaixe, e aí não há estrago para o guarda achar.
 */
function trocarAsMascaras(posicoes) {
  const porFormato = new Map();
  posicoes.forEach((pos, i) => {
    const chave = `${pos.mascara.cols}x${pos.mascara.rows}`;
    if (!porFormato.has(chave)) porFormato.set(chave, []);
    porFormato.get(chave).push(i);
  });
  const formatos = [...porFormato.values()].filter((lista) => lista.length > 0);
  if (formatos.length < 2) return null;

  // A primeira posição do formato A recebe a máscara do formato B, e vice-versa.
  const a = formatos[0][0];
  const b = formatos[1][0];
  const copia = posicoes.map((p) => ({ ...p }));
  const mascaraDeA = copia[a].mascara;
  copia[a] = { ...copia[a], mascara: copia[b].mascara, item: copia[b].item };
  copia[b] = { ...copia[b], mascara: mascaraDeA, item: posicoes[a].item };
  return copia;
}

async function principal() {
  const motor = await carregarMotor();
  const { acharSobreposicao } = motor;
  if (typeof acharSobreposicao !== "function") {
    console.error("o motor não exporta acharSobreposicao — a bancada mediria outra coisa.");
    process.exit(1);
  }

  const falhas = [];
  let limpos = 0;
  let pegos = 0;

  for (const nome of TRABALHOS_DO_TESTE) {
    const t = montar(motor, nome);
    for (const tamanho of AGRUPAMENTOS) {
      const unidades = motor.montarUnidades(t.itens, tamanho);
      const r = motor.encaixarContorno(unidades, {
        larguraTecido: t.receita.larguraTecido,
        comprimentoBancada: 0,
        passo: t.passo,
        heuristica: "fundo",
        saltoX: 1,
      });
      const posicoes = r.posicoes;

      // 1) O encaixe bom tem de passar limpo.
      const bom = acharSobreposicao(posicoes);
      if (bom.pares > 0) {
        falhas.push(`${nome} · grupo ${tamanho}: o guarda ACUSOU um encaixe do motor`
          + ` — ${bom.pares} par(es). Exemplo: ${JSON.stringify(bom.exemplo)}`);
      } else if (bom.conferidas !== posicoes.length) {
        falhas.push(`${nome} · grupo ${tamanho}: o guarda conferiu ${bom.conferidas}`
          + ` de ${posicoes.length} posições — encaixe não conferível passaria batido`);
      } else {
        limpos++;
      }

      // 2) O encaixe estragado tem de ser pego.
      const estragado = trocarAsMascaras(posicoes);
      if (!estragado) {
        falhas.push(`${nome} · grupo ${tamanho}: não há dois formatos para trocar`);
        continue;
      }
      const ruim = acharSobreposicao(estragado);
      if (ruim.pares === 0) {
        falhas.push(`${nome} · grupo ${tamanho}: o guarda NÃO viu a troca de máscaras`
          + " — é exatamente o defeito que ele existe para pegar");
      } else {
        pegos++;
      }
    }
    /*
     * O ENCAIXE POR CAIXA, que é o caso capaz de virar desastre.
     *
     * As posições dele NÃO trazem máscara nem passo (ver `encaixar`), só x, y,
     * largura e altura em centímetros. Um guarda que exigisse célula recusaria
     * todos eles — e recusar todo encaixe por retângulo é travar a produção em
     * vez de proteger. Então aqui se prova o contrário: ele passa limpo, e as
     * posições são de fato conferidas, não puladas em silêncio.
     */
    const porCaixa = motor.encaixar(t.itens, {
      larguraTecido: t.receita.larguraTecido,
      espaco: t.receita.espaco,
      comprimentoBancada: 0,
      heuristica: "fundo",
      // Rolo com folga para TODAS as peças. Sem isto o packer nasce sem altura
      // e recusa 31 das 32 — e um teste que confere uma peça só não confere
      // sobreposição nenhuma, porque sobreposição precisa de duas.
      alturaMax: t.itens.reduce(
        (soma, i) => soma + Math.max(i.largura, i.altura) + t.receita.espaco, 0),
    });
    if (porCaixa.naoEncaixadas.length > 0) {
      falhas.push(`${nome} · por caixa: ${porCaixa.naoEncaixadas.length} peça(s) ficaram`
        + " de fora — o teste não exercita o que deveria");
    }
    const semMascara = porCaixa.posicoes.filter((p) => !p.mascara).length;
    const caixa = acharSobreposicao(porCaixa.posicoes);
    if (caixa.conferidas !== porCaixa.posicoes.length) {
      falhas.push(`${nome} · por caixa: o guarda conferiu ${caixa.conferidas} de`
        + ` ${porCaixa.posicoes.length} — encaixe por retângulo passaria sem conferência`);
    } else if (caixa.pares > 0) {
      falhas.push(`${nome} · por caixa: o guarda ACUSOU um encaixe por retângulo`
        + ` — ${caixa.pares} par(es). Exemplo: ${JSON.stringify(caixa.exemplo)}`);
    } else {
      limpos++;
    }

    process.stdout.write(`  ${nome}: conferido`
      + ` (${semMascara} posição(ões) por caixa, sem máscara)\n`);
  }

  console.log("");
  console.log(`encaixes do motor que passaram limpos: ${limpos}`);
  console.log(`encaixes estragados que o guarda pegou: ${pegos}`);
  if (falhas.length === 0) {
    console.log("\nOK — o guarda pega a sobreposição e não acusa encaixe bom.");
    return;
  }
  console.log(`\nFALHOU — ${falhas.length}:`);
  falhas.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

principal().catch((erro) => { console.error(erro); process.exit(1); });
