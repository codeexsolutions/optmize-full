#!/usr/bin/env node
/**
 * ===========================================================================
 * P11 — O SPARROW POR REGIÕES CONTRA O SPARROW NO ROLO INTEIRO
 * ===========================================================================
 *
 * Hipótese (docs/optimize/research/PROPOSTAS.md, P11): em trabalho grande,
 * compactar o rolo por REGIÕES, uma por worker, rende mais tecido no mesmo
 * relógio do que todos os workers compactarem o rolo inteiro com sementes
 * diferentes (que é o que a produção faz).
 *
 * As duas fases saem do MESMO encaixe de partida (uma busca só, com o
 * portfólio da produção), e cada braço tem W workers × T segundos:
 *
 *   hoje      W sementes do sparrow no rolo inteiro; fica a melhor.
 *   regiões   o rolo partido em W regiões; cada uma compactada sozinha
 *             (uma semente cada) e as regiões emendadas.
 *
 * Aqui os workers rodam um depois do outro (como no medir.js); o tempo de
 * cada um é o tempo pedido. Todo resultado passa pela trava da produção e pela
 * contagem de peças antes de contar.
 *
 * REFUTA se o braço "regiões" não gastar menos tecido que "hoje" além do ruído
 * (~0,25%) nos trabalhos grandes, ou se a trava acusar qualquer coisa.
 *
 * Uso: node bancada/conferir-regioes.js --vezes 4,6 --workers 5 --tempo 90 [--sementes 2] [--json saida.json]
 */
const fs = require("fs");
const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

function lerArgumentos(argv) {
  const o = { vezes: [4, 6], workers: 5, tempo: 90, busca: 20, sementes: 1, primeira: 0, json: null };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i + 1];
    if (argv[i] === "--vezes") { o.vezes = v.split(",").map(Number); i++; }
    else if (argv[i] === "--workers") { o.workers = Number(v); i++; }
    else if (argv[i] === "--tempo") { o.tempo = Number(v); i++; }
    else if (argv[i] === "--busca") { o.busca = Number(v); i++; }
    else if (argv[i] === "--sementes") { o.sementes = Number(v); i++; }
    else if (argv[i] === "--primeira") { o.primeira = Number(v); i++; }
    else if (argv[i] === "--json") { o.json = v; i++; }
    else throw new Error(`argumento desconhecido: ${argv[i]}`);
  }
  return o;
}

function montar(motor, k) {
  const base = TRABALHOS["producao-avulsa"];
  const receita = { ...base, pecas: base.pecas.map((p) => ({ ...p, qtd: p.qtd * k })) };
  const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, { passo, raio, giro: p.giro || "180", qtd: p.qtd }));
  const itens = expandir(pecas);
  const alturaMax = itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + receita.espaco, 0);
  return { receita, itens, passo, raio, alturaMax };
}

/** O encaixe vale? Trava da produção + todas as peças, uma vez cada. */
function valido(motor, resultado, itens) {
  const guarda = motor.acharSobreposicao(resultado.posicoes);
  const vistas = new Set(resultado.posicoes.map((p) => p.item));
  return guarda.pares === 0 && guarda.conferidas === resultado.posicoes.length
    && resultado.posicoes.length === itens.length && vistas.size === itens.length;
}

const m = (cm) => `${(cm / 100).toFixed(3)} m`;

async function principal() {
  const o = lerArgumentos(process.argv);
  const motor = await carregarMotor({ comWasm: true });
  if (!motor.comEncolhedor) throw new Error("o WASM do sparrow não carregou");
  const saida = { quando: new Date().toISOString(), opcoes: o, corridas: [] };
  console.log(`P11 · ${o.workers} workers × ${o.tempo} s de sparrow · busca ${o.busca} s · portfólio da produção\n`);

  for (const k of o.vezes) {
    const t = montar(motor, k);
    const config = { larguraTecido: t.receita.larguraTecido, passo: t.passo, raio: t.raio, comprimentoBancada: 0 };
    for (let s = 0; s < o.sementes; s++) {
      const semente = 1 + (o.primeira + s) * 7919;
      // A partida comum: uma busca com o portfólio da produção.
      const base = await motor.buscarMelhorEncaixe(t.itens, {
        ...config, espaco: t.receita.espaco, alturaMax: t.alturaMax,
        motores: ["contorno", "vaos", "faixas"], memoria: null, alvo: null, rede: null, redeMadura: false,
        metaAproveitamento: 0, tempoMaximoMs: o.busca * 1000, msSemGanho: Math.max(800, o.busca * 250),
        tentativasPorLote: t.itens.length >= 120 ? 1 : 8, semente,
      });
      if (!valido(motor, base, t.itens)) throw new Error("a busca saiu inválida");

      // HOJE: W sementes no rolo inteiro.
      let hoje = base;
      for (let w = 0; w < o.workers; w++) {
        const r = motor.encolherEncaixe(t.itens, base, config, { tempoMs: o.tempo * 1000, semente: semente + w * 104729 });
        if (r.resultado && r.resultado.consumo < hoje.consumo) hoje = r.resultado;
      }

      // REGIÕES: uma por worker, emendadas.
      const regioes = motor.partirEmRegioes(base, o.workers);
      const compactadas = regioes.map((regiao, w) => {
        const partida = motor.encaixeDaRegiao(regiao, t.passo, config, motor.consumoDoFundo);
        const r = motor.encolherEncaixe(regiao.itens, partida, config, { tempoMs: o.tempo * 1000, semente: semente + w * 104729 });
        return { posicoes: (r.resultado && r.resultado.consumo < partida.consumo ? r.resultado : partida).posicoes, ganhou: Boolean(r.resultado) };
      });
      const porRegioes = motor.emendarRegioes(compactadas, t.passo, config, motor.consumoDoFundo);
      const regioesValido = valido(motor, porRegioes, t.itens);

      const linha = {
        vezes: k, pecas: t.itens.length, semente,
        busca: base.consumo, hoje: hoje.consumo, regioes: porRegioes.consumo, regioesValido,
        regioesQueEncurtaram: compactadas.filter((c) => c.ganhou).length, nRegioes: regioes.length,
      };
      saida.corridas.push(linha);
      const pct = (a) => `${((a / base.consumo - 1) * 100).toFixed(2)}%`;
      console.log(`×${k} (${t.itens.length} pç, semente ${semente}): busca ${m(base.consumo)} · hoje ${m(hoje.consumo)} (${pct(hoje.consumo)})`
        + ` · regiões ${m(porRegioes.consumo)} (${pct(porRegioes.consumo)}) ${regioesValido ? "válido" : "INVÁLIDO"}`
        + ` · ${linha.regioesQueEncurtaram}/${linha.nRegioes} regiões encurtaram`
        + ` · regiões vs hoje ${((porRegioes.consumo / hoje.consumo - 1) * 100).toFixed(2)}%`);
    }
  }
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(saida, null, 2));
}

principal().catch((e) => { console.error(e); process.exit(1); });
