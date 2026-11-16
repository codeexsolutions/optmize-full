#!/usr/bin/env node
/**
 * ===========================================================================
 * O MOTOR NOS MATERIAIS GRANDES — três hipóteses, cada uma com o teste que
 * pode derrubá-la (docs/optimize/research/GEOMETRY_AUDIT-CLAUDE.md)
 * ===========================================================================
 *
 *   rolo     H-ESC-1: o sparrow perde efeito quando o rolo fica longo. Ele
 *            trabalha em f32 e em células, e a separação de 0,01 célula que a
 *            volta para a grade exige deixa de caber no f32 a partir de
 *            ~0,01 × 2²³ ≈ 83.900 células (≈168 m com célula de 2 mm). Se a
 *            hipótese vale, a razão rejeitados/relatos sobe e o ganho do
 *            sparrow por metro cai nos rolos acima disso.
 *            REFUTA: rejeitados ≈ 0 e ganho estável em todo tamanho.
 *
 *   bancada  H-ESC-2: com a bancada ligada o sparrow não roda (ver
 *            `motivoDoTrabalho`, em encaixeEncolher.js), e o trabalho longo
 *            cortado em mesa fica só com a busca, que satura cedo.
 *            REFUTA: a mídia com bancada fica a menos do ruído (~0,25%) da
 *            sem bancada.
 *
 *   largo    H-ESC-3: no rolo largo a grade engrossa (o piso é largura/1000,
 *            ver `grade`, em encaixeMascara.js) e a folga sai maior que a
 *            pedida (320 cm e 4 mm dão 6,4 mm). Uma grade que dá a folga
 *            pedida gasta menos tecido, mesmo com o encaixe mais lento.
 *            REFUTA: a grade fina não gasta menos (ou gasta mais) com o mesmo
 *            relógio.
 *
 * A corrida é a do `corrida.js` (a mesma do `medir.js`), com o portfólio da
 * PRODUÇÃO: contorno + vaos + faixas (ver "A CAIXA NÃO DISPUTA", no
 * controlador). Cada trabalho é montado aqui a partir das peças da bancada.
 *
 * Uso:
 *   node bancada/conferir-escala.js --teste rolo --tempo 120 --fatias 1
 *   node bancada/conferir-escala.js --teste bancada --tempo 60 --fatias 3
 *   node bancada/conferir-escala.js --teste largo --tempo 60 --fatias 3
 *   (--json saida.json guarda tudo)
 */
const fs = require("fs");
const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");
const { buscarComoAProducao } = require("./corrida");

const MOTORES_DA_PRODUCAO = "contorno+vaos+faixas";

function lerArgumentos(argv) {
  const o = { teste: "rolo", tempo: 120, fatias: 1, sementes: 1, json: null, vezes: [1, 2, 4, 6, 8] };
  for (let i = 2; i < argv.length; i++) {
    const chave = argv[i];
    const valor = argv[i + 1];
    if (chave === "--teste") { o.teste = valor; i++; }
    else if (chave === "--tempo") { o.tempo = Number(valor); i++; }
    else if (chave === "--fatias") { o.fatias = Number(valor); i++; }
    else if (chave === "--sementes") { o.sementes = Number(valor); i++; }
    else if (chave === "--vezes") { o.vezes = valor.split(",").map(Number); i++; }
    else if (chave === "--json") { o.json = valor; i++; }
    else throw new Error(`argumento desconhecido: ${chave}`);
  }
  return o;
}

/**
 * O trabalho pronto, como o `prepararTrabalho` do corrida.js — com a grade
 * podendo vir de fora (o teste do rolo largo compara duas grades no MESMO
 * trabalho).
 */
function montar(motor, nome, receita, gradeDeFora = null) {
  const { passo, raio, folgaReal } = gradeDeFora || motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
    passo, raio, giro: p.giro || "180", qtd: p.qtd,
  }));
  const itens = expandir(pecas);
  const alturaMax = itens.reduce((soma, it) => soma + Math.max(it.largura, it.altura) + receita.espaco, 0);
  return { nome, receita, pecas, itens, passo, raio, folgaReal, alturaMax };
}

const vezes = (base, k) => ({ ...base, pecas: base.pecas.map((p) => ({ ...p, qtd: p.qtd * k })) });

async function rodar(motor, trabalho, o, semente) {
  const t0 = Date.now();
  // A corrida devolve só os números. Para conferir o encaixe que saiu, os
  // resultados são pegos no caminho, e o campeão é escolhido com a mesma regra
  // dela: o que coube inteiro e gastou menos.
  const original = { busca: motor.buscarMelhorEncaixe, encolher: motor.encolherEncaixe };
  const vistos = [];
  motor.buscarMelhorEncaixe = async (...args) => {
    const r = await original.busca(...args);
    vistos.push(r);
    return r;
  };
  motor.encolherEncaixe = (...args) => {
    const r = original.encolher(...args);
    if (r && r.resultado) vistos.push(r.resultado);
    return r;
  };
  let r;
  try {
    r = await buscarComoAProducao(motor, trabalho, {
      tempoMs: o.tempo * 1000, semente, meta: 0, fatias: o.fatias, espalharSemente: true,
      extra: { motores: MOTORES_DA_PRODUCAO, encolher: true },
    });
  } finally {
    motor.buscarMelhorEncaixe = original.busca;
    motor.encolherEncaixe = original.encolher;
  }
  const campeao = vistos
    .filter((v) => v && v.naoEncaixadas && v.naoEncaixadas.length === 0)
    .sort((a, b) => a.consumo - b.consumo)[0];
  // A trava da produção, de novo, no que saiu: nenhuma medida conta sem ela.
  const guarda = campeao ? motor.acharSobreposicao(campeao.posicoes) : { pares: -1, conferidas: 0 };
  if (campeao && Math.abs(campeao.consumo - r.consumo) > 1e-6) {
    throw new Error(`o campeão pego no caminho (${campeao.consumo}) não é o da corrida (${r.consumo})`);
  }
  return {
    semente,
    pecas: trabalho.itens.length,
    larguraTecido: trabalho.receita.larguraTecido,
    espaco: trabalho.receita.espaco,
    comprimentoBancada: trabalho.receita.comprimentoBancada || 0,
    passo: trabalho.passo, raio: trabalho.raio, folgaReal: trabalho.folgaReal,
    consumo: r.consumo, midia: r.midia, aproveitamento: r.aproveitamento, sobraram: r.sobraram,
    linhasDoRolo: Math.round(r.consumo / trabalho.passo),
    encolhimento: r.encolhimento,
    paredeMs: Date.now() - t0,
    guarda: { pares: guarda.pares, conferidas: guarda.conferidas },
  };
}

const m = (cm) => `${(cm / 100).toFixed(3)} m`;

function linha(rotulo, x) {
  const e = x.encolhimento || {};
  const ganho = e.antes ? ((1 - e.depois / e.antes) * 100).toFixed(2) + "%" : "—";
  const rej = e.relatos != null ? `${e.rejeitados}/${e.relatos}` : "—";
  console.log(`${rotulo.padEnd(26)} ${String(x.pecas).padStart(5)} pç  linhas ${String(x.linhasDoRolo).padStart(7)}`
    + `  busca ${e.antes ? m(e.antes) : "—"}  final ${m(x.consumo)}  mídia ${m(x.midia)}`
    + `  sparrow ${ganho.padStart(6)}  rejeitados ${rej.padStart(9)}`
    + `  ${e.motivos && e.motivos.length ? "motivo: " + e.motivos.join(",") : ""}`
    + `  guarda ${x.guarda ? x.guarda.pares + " pares" : "—"}`);
}

async function principal() {
  const o = lerArgumentos(process.argv);
  const motor = await carregarMotor({ comWasm: true });
  if (!motor.comEncolhedor) throw new Error("o WASM do sparrow não carregou");
  const saida = { quando: new Date().toISOString(), opcoes: o, corridas: [] };
  const base = TRABALHOS["producao-avulsa"];
  console.log(`teste "${o.teste}" · ${o.fatias} fatia(s) × ${o.tempo}s · ${o.sementes} semente(s) · motores ${MOTORES_DA_PRODUCAO}\n`);

  for (let s = 0; s < o.sementes; s++) {
    const semente = 1 + s * 7919;
    if (o.teste === "rolo") {
      for (const k of o.vezes) {
        const t = montar(motor, `producao-avulsa×${k}`, vezes(base, k));
        const x = await rodar(motor, t, o, semente);
        saida.corridas.push({ teste: "rolo", vezes: k, ...x });
        linha(`producao-avulsa ×${k}`, x);
      }
    } else if (o.teste === "bancada") {
      for (const bancada of [0, 300]) {
        const t = montar(motor, `producao-avulsa bancada ${bancada}`, { ...base, comprimentoBancada: bancada });
        const x = await rodar(motor, t, o, semente);
        saida.corridas.push({ teste: "bancada", ...x });
        linha(`bancada ${bancada ? bancada + " cm" : "desligada"}`, x);
      }
    } else if (o.teste === "largo") {
      const receita = { ...vezes(base, 2), larguraTecido: 320 };
      const atual = motor.grade(320, receita.espaco);
      // A grade que dá a folga pedida: metade da folga numa célula inteira.
      const fina = { passo: receita.espaco / 2, raio: 1, folgaReal: receita.espaco };
      for (const [rotulo, g] of [["grade atual", atual], ["grade da folga pedida", fina]]) {
        const t = montar(motor, `largo-320 ${rotulo}`, receita, g);
        const x = await rodar(motor, t, o, semente);
        saida.corridas.push({ teste: "largo", grade: rotulo, ...x });
        linha(`${rotulo} (${g.passo.toFixed(2)} cm, folga ${g.folgaReal.toFixed(2)})`, x);
      }
    } else {
      throw new Error(`teste desconhecido: ${o.teste}`);
    }
  }
  if (o.json) {
    fs.writeFileSync(o.json, JSON.stringify(saida, null, 2));
    console.log(`\nguardado em ${o.json}`);
  }
}

principal().catch((erro) => { console.error(erro); process.exit(1); });
