#!/usr/bin/env node
/**
 * ===========================================================================
 * A CURVA NO TEMPO — quando sai o primeiro encaixe, quando sai o melhor, e
 * quanto cada segundo a mais compra de tecido
 * ===========================================================================
 *
 * O `medir.js` responde "quanto tecido no fim". Esta responde a pergunta que
 * vem antes de mexer no orçamento de tempo: "um encaixe de 3,90 m em 60 s e
 * outro de 3,86 m em 500 s" — o ganho existe, mas vale o tempo? Para isso é
 * preciso a CURVA: o consumo do melhor encaixe válido em cada instante.
 *
 * NÃO HÁ CÓPIA DA CORRIDA AQUI. A corrida é a do `corrida.js`, a mesma do
 * `medir.js`, chamada sem mudança. O que muda é que `buscarMelhorEncaixe` e
 * `encolherEncaixe` são embrulhados no objeto do motor para anotar a hora de
 * cada recorde (o `aoDesenhar("recorde")` da busca e o `aoMelhorar` do
 * sparrow). O `aoDesenhar` custa uma chamada de função por tentativa, e a
 * produção também o liga (ver "O DESENHO AO VIVO", em encaixeMotor.js).
 *
 * COMO A PRODUÇÃO É REPRODUZIDA NO RELÓGIO. Na loja as fatias rodam AO MESMO
 * TEMPO, uma por worker, cada uma com o tempo inteiro; aqui elas rodam uma
 * depois da outra (ver o cabeçalho do `medir.js`). Cada fatia tem o relógio
 * dela, começando em zero, e a curva da produção é o melhor de todas em cada
 * instante: `melhor(t) = min_k melhor_k(t)`. A segunda fase (o sparrow) começa
 * no fim da busca, em `tempoDaBusca(T)`, a partir do campeão das fatias, e
 * cada semente dele também tem o relógio dela.
 *
 * O que isto NÃO mede: a disputa por núcleo das fatias rodando juntas na loja
 * (aqui cada uma tem um núcleo só para ela) e o custo do `postMessage`.
 *
 * Uso
 * ---
 *   node bancada/curva-no-tempo.js --trabalhos producao-avulsa --tempo 120
 *   node bancada/curva-no-tempo.js --tempo 60 --sementes 2 --json curva.json
 *   node bancada/curva-no-tempo.js --tempo 30 --sem-encolher   (só a busca)
 *
 * `--tempo` é o tempo POR WORKER, como o campo da tela: a busca fica com
 * `tempoDaBusca(T)` e o sparrow com o resto.
 */
const fs = require("fs");
const os = require("os");
const { carregarMotor } = require("./motor");
const { TRABALHOS } = require("./trabalhos");
const { FATIAS, prepararTrabalho, buscarComoAProducao } = require("./corrida");

function lerArgumentos(argv) {
  const o = {
    tempo: 60, sementes: 1, fatias: FATIAS, trabalhos: ["producao-avulsa"],
    encolher: true, json: null, marcos: [1, 3, 5, 10, 20, 30, 60, 120, 300, 600],
    extra: {},
  };
  for (let i = 2; i < argv.length; i++) {
    const chave = argv[i];
    const valor = argv[i + 1];
    if (chave === "--tempo") { o.tempo = Number(valor); i++; }
    else if (chave === "--sementes") { o.sementes = Number(valor); i++; }
    else if (chave === "--fatias") { o.fatias = Number(valor); i++; }
    else if (chave === "--trabalhos") { o.trabalhos = valor.split(","); i++; }
    else if (chave === "--json") { o.json = valor; i++; }
    else if (chave === "--marcos") { o.marcos = valor.split(",").map(Number); i++; }
    else if (chave === "--sem-encolher") { o.encolher = false; }
    else if (chave === "--extra") {
      valor.split(",").forEach((par) => {
        const [nome, cru] = par.split("=");
        o.extra[nome] = cru === "true" ? true : cru === "false" ? false
          : Number.isNaN(Number(cru)) ? cru : Number(cru);
      });
      i++;
    }
    else throw new Error(`argumento desconhecido: ${chave}`);
  }
  o.trabalhos.forEach((nome) => { if (!TRABALHOS[nome]) throw new Error(`trabalho desconhecido: ${nome}`); });
  return o;
}

/** O melhor de várias curvas em degrau, cada uma `[{ t, consumo }]` em ordem. */
function melhorDeTodas(curvas) {
  const eventos = curvas.flat().sort((a, b) => a.t - b.t);
  const saida = [];
  let melhor = Infinity;
  for (const e of eventos) {
    if (e.consumo < melhor - 1e-9) {
      melhor = e.consumo;
      saida.push({ t: e.t, consumo: e.consumo, fase: e.fase });
    }
  }
  return saida;
}

/** O consumo da curva no instante `t` (a curva é em degrau), ou null antes do primeiro. */
function noInstante(curva, t) {
  let valor = null;
  for (const e of curva) { if (e.t <= t) valor = e.consumo; else break; }
  return valor;
}

async function medirUmaVez(motor, trabalho, semente, o) {
  const original = { busca: motor.buscarMelhorEncaixe, encolher: motor.encolherEncaixe };
  const curvasDaBusca = [];
  const curvasDoSparrow = [];
  const tempoMs = o.tempo * 1000;
  const tempoBusca = o.encolher ? Math.min(tempoMs, motor.tempoDaBusca(tempoMs)) : tempoMs;

  // Onde a busca acabou de fato: a fatia mais lenta (na produção elas rodam
  // juntas, e o sparrow começa quando a última termina).
  let fimDaBusca = 0;
  motor.buscarMelhorEncaixe = async (itens, config) => {
    const t0 = Date.now();
    const curva = [];
    curvasDaBusca.push(curva);
    const fim = () => { fimDaBusca = Math.max(fimDaBusca, Date.now() - t0); };
    return original.busca(itens, {
      ...config,
      aoDesenhar: (tipo, r) => {
        // Só encaixe que coube inteiro conta: o motor também não aceita outro
        // como melhor (ver `melhorQue`).
        if (tipo === "recorde" && r.naoEncaixadas.length === 0) {
          curva.push({ t: Date.now() - t0, consumo: r.consumo, fase: "busca" });
        }
      },
    }).then((r) => { fim(); return r; });
  };
  motor.encolherEncaixe = (itens, base, config, opcoes = {}) => {
    const t0 = Date.now();
    const curva = [];
    curvasDoSparrow.push(curva);
    return original.encolher(itens, base, config, {
      ...opcoes,
      aoMelhorar: (novo) => {
        // O sparrow começa quando a busca acabou de fato (ver `fimDaBusca`).
        curva.push({ t: Math.min(tempoBusca, fimDaBusca) + (Date.now() - t0), consumo: novo.consumo, fase: "sparrow" });
        if (opcoes.aoMelhorar) opcoes.aoMelhorar(novo);
      },
    });
  };

  const relogio = Date.now();
  let r;
  try {
    r = await buscarComoAProducao(motor, trabalho, {
      tempoMs, semente, meta: 0, fatias: o.fatias, espalharSemente: true,
      extra: { ...o.extra, ...(o.encolher ? { encolher: true } : {}) },
    });
  } finally {
    motor.buscarMelhorEncaixe = original.busca;
    motor.encolherEncaixe = original.encolher;
  }
  const paredeMs = Date.now() - relogio;

  // A busca de cada fatia acaba em `tempoBusca` na produção (elas rodam
  // juntas); o sparrow só melhora o que a busca já tinha.
  const curvaBusca = melhorDeTodas(curvasDaBusca.map((c) => c.filter((e) => e.t <= tempoBusca)));
  const curva = melhorDeTodas([curvaBusca, ...curvasDoSparrow]);
  const primeira = curva[0] || null;
  const ultima = curva[curva.length - 1] || null;
  const marcos = {};
  for (const s of o.marcos) {
    if (s * 1000 <= tempoMs) marcos[s] = noInstante(curva, s * 1000);
  }
  return {
    semente,
    consumoFinal: r.consumo,
    consumoDaCurva: ultima ? ultima.consumo : null,
    sobraram: r.sobraram,
    receita: r.receita,
    tentativas: r.tentativas,
    tempoBuscaMs: Math.min(tempoBusca, fimDaBusca),
    primeira: primeira && { t: primeira.t, consumo: primeira.consumo },
    melhor: ultima && { t: ultima.t, consumo: ultima.consumo, fase: ultima.fase },
    fimDaBusca: noInstante(curva, tempoBusca),
    encolhimento: r.encolhimento,
    marcos,
    melhorias: curva.length,
    curva,
    paredeMs,
  };
}

const cm = (v) => (v == null ? "—" : `${(v / 100).toFixed(3)} m`);
const seg = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(2)} s`);

async function principal() {
  const o = lerArgumentos(process.argv);
  const motor = await carregarMotor({ comWasm: true });
  if (o.encolher && !motor.comEncolhedor) throw new Error("o WASM do sparrow não carregou");
  const saida = {
    quando: new Date().toISOString(),
    maquina: { cpu: os.cpus()[0].model.trim(), nucleos: os.cpus().length, node: process.version },
    opcoes: { ...o, extra: o.extra },
    trabalhos: {},
  };
  console.log(`curva no tempo · ${o.trabalhos.length} trabalho(s) · ${o.fatias} fatias × ${o.tempo}s`
    + ` · ${o.sementes} semente(s) · sparrow ${o.encolher ? "ligado" : "desligado"}\n`);
  for (const nome of o.trabalhos) {
    const trabalho = prepararTrabalho(motor, nome);
    const corridas = [];
    for (let s = 0; s < o.sementes; s++) {
      const semente = 1 + s * 7919;
      const m = await medirUmaVez(motor, trabalho, semente, o);
      corridas.push(m);
      console.log(`  ${nome} · semente ${semente}: primeira ${cm(m.primeira && m.primeira.consumo)} em ${seg(m.primeira && m.primeira.t)}`
        + ` · fim da busca ${cm(m.fimDaBusca)} em ${seg(m.tempoBuscaMs)}`
        + ` · melhor ${cm(m.melhor && m.melhor.consumo)} em ${seg(m.melhor && m.melhor.t)} (${m.melhor && m.melhor.fase})`
        + ` · ${m.melhorias} melhoria(s)`);
      const linha = Object.entries(m.marcos).map(([s2, v]) => `${s2}s ${cm(v)}`).join(" · ");
      console.log(`      ${linha}`);
    }
    saida.trabalhos[nome] = {
      itens: trabalho.itens.length, larguraTecido: trabalho.receita.larguraTecido,
      espaco: trabalho.receita.espaco, passo: trabalho.passo, folgaReal: trabalho.folgaReal,
      corridas,
    };
  }
  if (o.json) {
    fs.writeFileSync(o.json, JSON.stringify(saida, null, 2));
    console.log(`\nguardado em ${o.json}`);
  }
}

principal().catch((erro) => { console.error(erro); process.exit(1); });
