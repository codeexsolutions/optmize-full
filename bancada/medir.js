#!/usr/bin/env node
/**
 * A bancada do encaixe: mede quanto tecido o motor gasta, sem navegador.
 *
 * Por que ela existe
 * ------------------
 * Quase toda decisão do motor está escrita como "medido: X contra Y". Sem uma
 * bancada no repositório, essas medições não dão para repetir — e mexida no
 * encaixe sem medir é chute, porque o resultado depende de sorteio, de tempo e
 * do formato da peça ao mesmo tempo.
 *
 * O que ela roda é o motor de verdade: os mesmos sete arquivos que o
 * `encaixe-worker.js` carrega, com o mesmo `encaixe.wasm`. O que a bancada
 * substitui é só o que precisa de tela — a arte da peça, que aqui nasce de um
 * polígono (ver `pecas.js`).
 *
 * Como a busca em paralelo é reproduzida
 * --------------------------------------
 * Na produção, `encaixe-paralelo.js` abre um worker por núcleo e dá a cada um
 * uma fatia do portfólio de receitas; a página fica com o melhor de todas.
 * Aqui as fatias rodam **uma depois da outra**, na mesma thread. O resultado é
 * o mesmo (as fatias são independentes por construção — nenhuma vê o que a
 * outra achou), e a medição fica mais limpa: nenhuma fatia disputa núcleo com
 * as outras, então o tempo de cada uma é o tempo pedido de verdade. O preço é
 * o relógio de parede: a bancada demora `fatias × tempo` por trabalho.
 *
 * Uso
 * ---
 *   node bancada/medir.js                          o conjunto padrão
 *   node bancada/medir.js --tempo 3 --sementes 2   mais rápido, menos preciso
 *   node bancada/medir.js --trabalhos lote-grande  um trabalho só
 *   node bancada/medir.js --json saida.json        guarda para comparar depois
 *   node bancada/medir.js --contra antes.json      compara com uma corrida
 *
 * O `--contra` é o que interessa na prática: mede o motor de agora, compara
 * com o arquivo de uma corrida anterior e mostra a diferença trabalho por
 * trabalho. Mexida que ganha na soma mas perde em algum trabalho aparece.
 *
 * Quanto isto repete
 * ------------------
 * **A bancada não é determinística, e não tem como ser:** o que encerra a busca
 * é o relógio, então duas corridas da MESMA configuração fazem números de
 * tentativas diferentes e param em lugares diferentes. Medido rodando a mesma
 * configuração duas vezes (6 trabalhos, 5 fatias × 3 s × 3 sementes):
 *
 *   soma dos seis     0,23% de diferença
 *   um trabalho só    até 1,7% (nos pequenos, onde meio centímetro já é 0,6%)
 *
 * Daí a regra de leitura: **diferença de soma abaixo de ~0,25% é empate**, e
 * trabalho pequeno sozinho não decide nada. Para separar mais fino, o jeito é
 * dar mais orçamento (`--tempo 5 --sementes 5`) e olhar se o sinal se repete —
 * de preferência com a máquina sem mais nada rodando, porque a bancada mede
 * tentativas por segundo e qualquer outro processo come uma parte delas.
 */

const fs = require("fs");
const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS, PADRAO } = require("./trabalhos");

// ==================== A MESMA REPARTIÇÃO DA PRODUÇÃO ====================

// Espelham `encaixe-paralelo.js`. Se lá mudar, aqui muda junto — senão a
// bancada mede uma repartição que ninguém roda.
const FATIAS = 5;              // o que sobra num i5 de 6 núcleos
const FATIAS_EXATAS = 2;
const PULO_PADRAO = 3;
const puloDaFatia = (k) => (k < FATIAS_EXATAS ? 1 : PULO_PADRAO);

/**
 * Quais encaixadores cada fatia usa — espelha `motoresDaFatia` do
 * encaixe-paralelo.js.
 *
 * O encaixe por vãos custa ~100x mais por tentativa que o por relevo. Solto no
 * portfólio de todas as fatias, ele rouba orçamento do contorno justamente nos
 * trabalhos grandes, onde o contorno precisa de milhares de tentativas. Numa
 * fatia só dele, ele gasta o que é dele: onde ele ganha, ganha; onde perde, as
 * outras quatro fatias seguram o resultado.
 */
const motoresDaFatia = (k, n, motores) => {
  if (!motores.includes("vaos")) return motores;
  const outros = motores.filter((m) => m !== "vaos");
  if (n < 3 || outros.length === 0) return motores;
  return k === n - 1 ? ["vaos"] : outros;
};


// ==================== ARGUMENTOS ====================

function lerArgumentos(argv) {
  const opcoes = {
    tempo: 5, sementes: 3, fatias: FATIAS,
    trabalhos: PADRAO, json: null, contra: null,
    // A meta de aproveitamento faz a busca parar cedo quando alcança 95%. Na
    // produção é o que se quer; para MEDIR ela atrapalha, porque duas
    // configurações passariam a receber orçamentos de tempo diferentes e a
    // comparação deixaria de ser entre iguais. Fica desligada por padrão.
    meta: 0,
    wasm: true,
    /*
     * Quantas vezes seguidas o mesmo trabalho é encaixado, como quem aperta
     * "Fazer encaixe" mais de uma vez. O número relatado é o da ÚLTIMA rodada.
     * Serve para medir o que a produção realmente vê: cada clique é um sorteio
     * novo, e o sistema fica com o melhor de todos (ver `encaixe_guardados`).
     */
    rodadas: 1,
    // Qualquer ajuste do motor, passado direto para o `config` da busca:
    //   --extra reparoChance=0,podar=false
    // É o que permite medir uma mexida contra o motor de agora sem voltar o
    // repositório no tempo: a mexida entra atrás de um ajuste com padrão, e a
    // bancada roda os dois lados com o MESMO código.
    extra: {},
  };
  for (let i = 2; i < argv.length; i++) {
    const chave = argv[i];
    const valor = argv[i + 1];
    if (chave === "--tempo") { opcoes.tempo = Number(valor); i++; }
    else if (chave === "--sementes") { opcoes.sementes = Number(valor); i++; }
    else if (chave === "--fatias") { opcoes.fatias = Number(valor); i++; }
    else if (chave === "--meta") { opcoes.meta = Number(valor); i++; }
    else if (chave === "--json") { opcoes.json = valor; i++; }
    else if (chave === "--contra") { opcoes.contra = valor; i++; }
    else if (chave === "--sem-wasm") { opcoes.wasm = false; }
    else if (chave === "--rodadas") { opcoes.rodadas = Number(valor); i++; }
    else if (chave === "--trabalhos") { opcoes.trabalhos = valor.split(","); i++; }
    else if (chave === "--todos") { opcoes.trabalhos = Object.keys(TRABALHOS); }
    else if (chave === "--extra") {
      valor.split(",").forEach((par) => {
        const [nome, cru] = par.split("=");
        // Lista separada por "+": a vírgula já separa um ajuste do outro.
        //   --extra ordens=area+altura+lado,reparoChance=0
        opcoes.extra[nome] = String(cru).includes("+") ? String(cru).split("+")
          : cru === "true" ? true : cru === "false" ? false
            : Number.isNaN(Number(cru)) ? cru : Number(cru);
      });
      i++;
    }
    else throw new Error(`argumento desconhecido: ${chave}`);
  }
  opcoes.trabalhos.forEach((nome) => {
    if (!TRABALHOS[nome]) throw new Error(`trabalho desconhecido: ${nome}`);
  });
  return opcoes;
}

// ==================== UMA CORRIDA ====================

/** Prepara as peças de um trabalho uma vez: as máscaras servem para todas as sementes. */
function prepararTrabalho(motor, nome) {
  const receita = TRABALHOS[nome];
  const { passo, raio, folgaReal } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
    passo, raio, giro: p.giro || "180", qtd: p.qtd,
  }));
  const itens = expandir(pecas);
  const alturaMax = itens.reduce(
    (soma, it) => soma + Math.max(it.largura, it.altura) + receita.espaco, receita.margem * 2);
  return { nome, receita, pecas, itens, passo, raio, folgaReal, alturaMax };
}

/**
 * Uma busca completa: as fatias uma a uma, ficando com a melhor.
 *
 * É o `buscarMelhorEncaixeEmParalelo` da produção, desenrolado.
 */
async function buscarComoAProducao(motor, trabalho,
  { tempoMs, semente, meta, fatias, extra }) {
  const { receita, itens, passo, alturaMax } = trabalho;
  const vetorTrabalho = motor.vetorDoTrabalho(trabalho.pecas, receita.larguraTecido);

  let campeao = null;
  let tentativas = 0;
  for (let k = 0; k < fatias; k++) {
    const resultado = await motor.buscarMelhorEncaixe(itens, {
      larguraTecido: receita.larguraTecido,
      espaco: receita.espaco,
      margem: receita.margem,
      passo, alturaMax,
      motores: motoresDaFatia(k, fatias, extra.motores
        ? String(extra.motores).split("+") : ["contorno", "retangulo"]),
      // Sem memória e sem rede: a bancada mede o motor, não o histórico da
      // loja. Com recorde antigo em jogo, duas corridas da mesma configuração
      // já dariam resultados diferentes.
      memoria: null, alvo: null, rede: null, redeMadura: false,
      vetorTrabalho,
      metaAproveitamento: meta,
      tempoMaximoMs: tempoMs,
      msSemGanho: Math.max(800, tempoMs * 0.25),
      tentativasPorLote: itens.length >= 120 ? 1 : 8,
      fatia: { k, n: fatias },
      saltoX: puloDaFatia(k),
      semente,
      ...extra,
    });
    tentativas += resultado.tentativas || 0;
    const melhor = !campeao
      || resultado.naoEncaixadas.length < campeao.naoEncaixadas.length
      || (resultado.naoEncaixadas.length === campeao.naoEncaixadas.length
          && resultado.consumo < campeao.consumo);
    if (melhor) campeao = resultado;
  }

  const areaTecido = receita.larguraTecido * campeao.consumo;
  // O encaixe por caixa não devolve `areaReal` — ele nem olha a silhueta. A
  // área real das peças é a mesma seja qual for o encaixador, então ela sai
  // daqui, das próprias peças, e o aproveitamento dos dois vira comparável.
  const areaReal = campeao.posicoes.reduce(
    (soma, p) => soma + (p.item.mascaras ? p.item.mascaras.areaReal : 0), 0);
  return {
    consumo: campeao.consumo,
    aproveitamento: areaTecido > 0 ? areaReal / areaTecido : 0,
    sobraram: campeao.naoEncaixadas.length,
    receita: campeao.receita,
    tentativas,
  };
}

// ==================== A TABELA ====================

const metros = (cm) => `${(cm / 100).toFixed(3)} m`;
const porcento = (f) => `${(f * 100).toFixed(1)}%`;

function imprimirTabela(linhas, antes) {
  const col = (t, n) => String(t).padEnd(n);
  const dir = (t, n) => String(t).padStart(n);
  const cabecalho = [col("trabalho", 22), dir("consumo", 11)];
  if (antes) cabecalho.push(dir("antes", 11), dir("dif.", 9));
  cabecalho.push(dir("aprov.", 8), dir("tent.", 8), col("  receita vencedora", 30));
  console.log(cabecalho.join(""));
  console.log("-".repeat(cabecalho.join("").length));

  linhas.forEach((l) => {
    const partes = [col(l.nome, 22), dir(metros(l.consumo), 11)];
    if (antes) {
      const anterior = antes.trabalhos[l.nome];
      if (anterior) {
        const dif = (l.consumo - anterior.consumo) / anterior.consumo;
        partes.push(dir(metros(anterior.consumo), 11),
          dir(`${dif > 0 ? "+" : ""}${(dif * 100).toFixed(2)}%`, 9));
      } else {
        partes.push(dir("—", 11), dir("—", 9));
      }
    }
    partes.push(dir(porcento(l.aproveitamento), 8), dir(l.tentativas, 8),
      col(`  ${l.receita}${l.sobraram ? ` (${l.sobraram} de fora!)` : ""}`, 30));
    console.log(partes.join(""));
  });

  const soma = linhas.reduce((s, l) => s + l.consumo, 0);
  console.log("-".repeat(cabecalho.join("").length));
  const rodape = [col("SOMA", 22), dir(metros(soma), 11)];
  if (antes) {
    const somaAntes = linhas.reduce(
      (s, l) => s + (antes.trabalhos[l.nome] ? antes.trabalhos[l.nome].consumo : l.consumo), 0);
    const dif = (soma - somaAntes) / somaAntes;
    rodape.push(dir(metros(somaAntes), 11),
      dir(`${dif > 0 ? "+" : ""}${(dif * 100).toFixed(2)}%`, 9));
  }
  console.log(rodape.join(""));
}

// ==================== PRINCIPAL ====================

async function principal() {
  const opcoes = lerArgumentos(process.argv);
  const motor = await carregarMotor({ comWasm: opcoes.wasm });
  const antes = opcoes.contra ? JSON.parse(fs.readFileSync(opcoes.contra, "utf8")) : null;

  console.log(`bancada do encaixe · ${opcoes.trabalhos.length} trabalho(s)`
    + ` · ${opcoes.fatias} fatias × ${opcoes.tempo}s × ${opcoes.sementes} semente(s)`
    + ` · wasm ${motor.comWasm ? "ligado" : "DESLIGADO"}`
    + (opcoes.rodadas > 1 ? ` · ${opcoes.rodadas} rodadas` : "")
    + (opcoes.meta ? ` · meta ${porcento(opcoes.meta)}` : "")
    + (Object.keys(opcoes.extra).length
      ? ` · ${Object.entries(opcoes.extra).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""));
  console.log("");

  const comeco = Date.now();
  const linhas = [];
  const saida = { quando: new Date().toISOString(), opcoes, trabalhos: {} };

  for (const nome of opcoes.trabalhos) {
    const trabalho = prepararTrabalho(motor, nome);
    // A média entre sementes é o que dá para comparar: uma semente sozinha
    // mede tanto a mexida quanto a sorte do sorteio daquela vez.
    const corridas = [];
    for (let s = 0; s < opcoes.sementes; s++) {
      // Cada rodada é um clique em "Fazer encaixe": sorteio novo, busca nova.
      let corrida = null;
      for (let rodada = 0; rodada < opcoes.rodadas; rodada++) {
        corrida = await buscarComoAProducao(motor, trabalho, {
          tempoMs: opcoes.tempo * 1000,
          // Semente diferente por rodada: dois cliques seguidos no mesmo
          // trabalho não repetem o mesmo sorteio na produção.
          semente: 20260824 + s * 7919 + rodada * 104729,
          meta: opcoes.meta,
          fatias: opcoes.fatias,
          extra: opcoes.extra,
        });
      }
      corridas.push(corrida);
    }
    const media = (pegar) => corridas.reduce((s, c) => s + pegar(c), 0) / corridas.length;
    const linha = {
      nome,
      consumo: media((c) => c.consumo),
      aproveitamento: media((c) => c.aproveitamento),
      tentativas: Math.round(media((c) => c.tentativas)),
      sobraram: Math.max(...corridas.map((c) => c.sobraram)),
      // A receita que venceu mais vezes, para saber de onde veio o resultado.
      receita: corridas.map((c) => c.receita).sort()[Math.floor(corridas.length / 2)],
      pecas: trabalho.itens.length,
      corridas: corridas.map((c) => ({ consumo: c.consumo, receita: c.receita })),
    };
    linhas.push(linha);
    saida.trabalhos[nome] = linha;
    process.stdout.write(`  ${nome}: ${metros(linha.consumo)}\n`);
  }

  console.log("");
  imprimirTabela(linhas, antes);
  console.log(`\n${((Date.now() - comeco) / 1000).toFixed(0)}s de bancada.`);

  if (opcoes.json) {
    fs.writeFileSync(opcoes.json, JSON.stringify(saida, null, 2));
    console.log(`guardado em ${opcoes.json}`);
  }
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
