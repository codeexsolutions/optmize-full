#!/usr/bin/env node
/**
 * Confere o COMPLEMENTO: peças novas postas nos vãos de um encaixe pronto.
 *
 * O que é medido, em cada trabalho, com e sem bancada:
 *
 *   1. nada do encaixe pronto sai do lugar — o complemento só acrescenta;
 *   2. nenhuma peça nova cai em cima de outra (o mesmo guarda da tela);
 *   3. "só os vãos" não aumenta a metragem: nenhuma página do PDF cresce;
 *   4. "até a metragem": o comprimento do PDF não passa da metragem pedida;
 *   5. com bancada, nenhuma página do PDF passa do comprimento da mesa;
 *   6. a análise ("quanto cabe de cada") não promete menos do que o complemento
 *      entrega com aquele candidato sozinho.
 *
 *   node bancada/conferir-complemento.js
 */

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

const TRABALHOS_CONFERIDOS = ["so-camiseta", "calca-bolso", "misturado-pequeno"];
const BANCADAS = [0, 200];
// Os candidatos que a Galeria teria: uma peça miúda e uma média.
const CANDIDATOS = ["gola", "punho", "manga"];
const EPS = 1e-6;
const peDaArte = (posicoes) => posicoes.reduce((m, p) => Math.max(m, p.y + p.altura), 0);
const somaDasPaginas = (mapa) => [...mapa.values()].reduce((s, pg) => s + pg.fundo - pg.topo, 0);

function paginas(posicoes, comBancada) {
  const mapa = new Map();
  if (!comBancada) {
    mapa.set(0, { topo: 0, fundo: peDaArte(posicoes) });
    return mapa;
  }
  posicoes.forEach((p) => {
    const n = Number(p.bancada) || 0;
    const pg = mapa.get(n) || { topo: Infinity, fundo: -Infinity };
    pg.topo = Math.min(pg.topo, p.y);
    pg.fundo = Math.max(pg.fundo, p.y + p.altura);
    mapa.set(n, pg);
  });
  return mapa;
}


async function principal() {
  const motor = await carregarMotor({ comWasm: true });
  const falhas = [];
  const linhas = [];

  for (const nome of TRABALHOS_CONFERIDOS) {
    const receita = TRABALHOS[nome];
    const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
    const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
      passo, raio, giro: p.giro || "180", qtd: p.qtd,
    }));
    const itens = expandir(pecas);
    const alturaMax = itens.reduce((s, i) => s + Math.max(i.largura, i.altura) + receita.espaco, 0);

    // Os candidatos entram com índices depois das peças do trabalho, como a
    // tela faz quando põe uma arte da Galeria na lista.
    const candidatos = CANDIDATOS.map((c, i) => ({
      ...expandir([prepararPeca(motor, c, { passo, raio, giro: "180", qtd: 1 })])[0],
      indice: pecas.length + i,
    }));

    for (const comprimento of BANCADAS) {
      const config = {
        larguraTecido: receita.larguraTecido, espaco: receita.espaco,
        passo, raio, alturaMax, heuristica: "fundo", comprimentoBancada: comprimento,
      };
      const erro = (queixa) => falhas.push(`${nome} · bancada ${comprimento || "—"}: ${queixa}`);
      const r = motor.encaixarContorno(motor.montarUnidades(itens, 1),
        { ...config, repescar: true, repescaVoltas: 3 });
      const antes = JSON.stringify(r.posicoes.map((p) => [p.x, p.y, p.rot, p.bancada]));

      const mapa = motor.prepararComplemento(r.posicoes, config);
      if (!mapa) { erro("o encaixe pronto não foi remontado"); continue; }

      const cabe = motor.analisarComplemento(mapa, candidatos);
      const pedidos = candidatos.map((item) => ({ item, quantidade: Infinity }));
      const { novas, colocadas } = motor.complementarNosVaos(
        { ...mapa, colunas: mapa.colunas.map((l) => l.slice()) }, pedidos);

      // 1) o encaixe pronto continua igual
      if (JSON.stringify(r.posicoes.map((p) => [p.x, p.y, p.rot, p.bancada])) !== antes) {
        erro("o complemento mexeu numa peça que já estava assentada");
      }
      // 2) nada em cima de nada
      const tudo = [...r.posicoes, ...novas];
      const sobre = motor.acharSobreposicao(tudo);
      if (sobre.pares > 0) erro(`${sobre.pares} par(es) de peças sobrepostas — ${sobre.exemplo}`);
      if (sobre.conferidas < tudo.length) erro("posições que o guarda não conseguiu conferir");
      // 3) só os vãos: nenhuma página cresce
      const comBancada = comprimento > 0;
      const antesPg = paginas(r.posicoes, comBancada);
      paginas(tudo, comBancada).forEach((pg, n) => {
        const a = antesPg.get(n);
        if (!a || pg.topo < a.topo - EPS || pg.fundo > a.fundo + EPS) {
          erro(`"só os vãos" aumentou a página ${n + 1}`);
        }
      });
      // 5) a mesa
      if (comprimento > 0) {
        paginas(tudo, true).forEach((pg, n) => {
          if (pg.fundo - pg.topo > comprimento + EPS) {
            erro(`a página da bancada ${n + 1} ficou com ${(pg.fundo - pg.topo).toFixed(1)} cm`);
          }
        });
      }
      // 6) a análise, candidato por candidato, contra o complemento dele sozinho
      candidatos.forEach((item, i) => {
        const so = motor.complementarNosVaos(
          { ...mapa, colunas: mapa.colunas.map((l) => l.slice()) }, [{ item, quantidade: Infinity }]);
        if (so.colocadas[0] !== cabe[i]) {
          erro(`${CANDIDATOS[i]}: a análise disse ${cabe[i]} e entraram ${so.colocadas[0]}`);
        }
      });

      // 4) até a metragem: um metro a mais que o encaixe
      const meta = somaDasPaginas(antesPg) + 100;
      const ate = motor.complementarNosVaos(
        { ...mapa, colunas: mapa.colunas.map((l) => l.slice()) }, pedidos, { metaCm: meta });
      const tudoAte = [...r.posicoes, ...ate.novas];
      const pdfAte = somaDasPaginas(paginas(tudoAte, comBancada));
      if (pdfAte > meta + EPS) {
        erro(`"até ${(meta / 100).toFixed(2)} m" passou para ${(pdfAte / 100).toFixed(2)} m`);
      }
      if (motor.acharSobreposicao(tudoAte).pares > 0) erro("\"até a metragem\" sobrepôs peças");
      if (comprimento > 0) {
        paginas(tudoAte, true).forEach((pg, n) => {
          if (pg.fundo - pg.topo > comprimento + EPS) {
            erro(`"até a metragem": a página ${n + 1} ficou com ${(pg.fundo - pg.topo).toFixed(1)} cm`);
          }
        });
      }

      linhas.push(`  ${nome.padEnd(20)} bancada ${String(comprimento || "—").padEnd(4)}`
        + ` vãos: ${CANDIDATOS.map((c, i) => `${c} ${cabe[i]}`).join(", ")}`
        + ` · juntos ${colocadas.reduce((a, b) => a + b, 0)}`
        + ` · até +1 m: ${ate.colocadas.reduce((a, b) => a + b, 0)}`);
    }
  }

  linhas.forEach((l) => console.log(l));
  if (falhas.length) {
    console.error(`\nFALHOU — ${falhas.length} problema(s):`);
    falhas.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log("\nOK — o complemento só acrescenta, não sobrepõe, respeita a metragem e a mesa.");
}

principal().catch((e) => { console.error(e); process.exit(1); });
