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
// Espelha `sementeDaFatia` do encaixe-paralelo.js: cada fatia sorteia diferente.
const PASSO_DA_SEMENTE = 104729;
const sementeDaFatia = (semente, k, espalhar) => semente + (espalhar ? k * PASSO_DA_SEMENTE : 0);

// `motoresDaFatia` e `fatiaDoPortfolio` vêm do motor (ver "A FATIA DO ENCAIXE
// POR VÃOS", em encaixe-motor.js): a bancada tem que medir a MESMA repartição
// que a produção roda, e duas cópias da regra são duas chances de divergirem.


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
    espalharSemente: true,
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
    // Para medir a semente por fatia contra o que havia antes dela.
    else if (chave === "--mesma-semente") { opcoes.espalharSemente = false; }
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
    (soma, it) => soma + Math.max(it.largura, it.altura) + receita.espaco, 0);
  return { nome, receita, pecas, itens, passo, raio, folgaReal, alturaMax };
}

/**
 * Uma busca completa: as fatias uma a uma, ficando com a melhor.
 *
 * É o `buscarMelhorEncaixeEmParalelo` da produção, desenrolado.
 */
async function buscarComoAProducao(motor, trabalho,
  { tempoMs, semente, meta, fatias, extra, espalharSemente }) {
  const { receita, itens, passo, alturaMax } = trabalho;
  const vetorTrabalho = motor.vetorDoTrabalho(trabalho.pecas, receita.larguraTecido);

  let campeao = null;
  let tentativas = 0;
  const motoresPedidos = extra.motores
    ? String(extra.motores).split("+") : ["contorno", "retangulo"];
  /*
   * Quais fatias dividem o portfólio COMUM.
   *
   * O corte é `i % n === k`, e o `n` tem que ser o número de fatias que estão
   * dividindo — não o número total. Com 5 fatias, uma delas dedicada a um
   * encaixador próprio e o `n` continuando 5, um quinto das receitas comuns não
   * roda em fatia nenhuma: fica órfão.
   */
  for (let k = 0; k < fatias; k++) {
    const motoresDaK = motor.motoresDaFatia(k, fatias, motoresPedidos);
    const resultado = await motor.buscarMelhorEncaixe(itens, {
      larguraTecido: receita.larguraTecido,
      espaco: receita.espaco,
      comprimentoBancada: receita.comprimentoBancada || 0,
      passo, alturaMax,
      motores: motoresDaK,
      // Sem memória e sem rede: a bancada mede o motor, não o histórico da
      // loja. Com recorde antigo em jogo, duas corridas da mesma configuração
      // já dariam resultados diferentes.
      memoria: null, alvo: null, rede: null, redeMadura: false,
      vetorTrabalho,
      metaAproveitamento: meta,
      tempoMaximoMs: tempoMs,
      msSemGanho: Math.max(800, tempoMs * 0.25),
      tentativasPorLote: itens.length >= 120 ? 1 : 8,
      /*
       * O corte do portfólio por fatia serve para N fatias dividirem A MESMA
       * lista de receitas. Uma fatia que roda um encaixador só já tem portfólio
       * próprio, disjunto do das outras — cortá-lo de novo deixaria ela com um
       * quinto das receitas dela e quatro quintos de nada.
       */
      fatia: motor.fatiaDoPortfolio(k, fatias, motoresPedidos),
      saltoX: puloDaFatia(k),
      semente: sementeDaFatia(semente, k, espalharSemente),
      // O papel da fatia, do mesmo lugar que a produção usa
      // (`papelDaFatia`, em encaixe-motor.js) — senão a bancada mediria uma
      // repartição que não é a que roda na loja. O `--extra` da linha de
      // comando vem depois, para dar para medir o motor COM e SEM o papel
      // (`--extra podar=true`).
      ...motor.papelDaFatia(k, fatias).config,
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

/*
 * ===========================================================================
 * O RITMO DA MÁQUINA, E POR QUE ELE ENTRA NO RELATÓRIO
 * ===========================================================================
 *
 * A bancada compara duas corridas pelo consumo. Isso só vale se as duas
 * tiveram o MESMO poder de fogo — e não têm, quando a máquina está ocupada.
 * O orçamento aqui é de tempo, não de tentativas: uma corrida com o
 * computador carregado faz menos tentativas no mesmo segundo, acha um encaixe
 * pior, e a diferença aparece na tabela como se fosse efeito da mudança que
 * se estava medindo.
 *
 * Aconteceu, e passou despercebido até alguém somar as colunas. O mesmo
 * trabalho, mesmo orçamento, três corridas de uma tarde:
 *
 *   261.460  ->  246.501  ->  190.620 tentativas
 *
 * Uma queda de 27% que não tinha nada a ver com o motor. Duas conclusões
 * foram tiradas em cima disso antes de o padrão ser notado.
 *
 * Agora a corrida diz quantas tentativas por segundo ela conseguiu, e quando
 * há `--contra` o relatório compara esse ritmo com o da corrida guardada. Se
 * eles não baterem, o aviso vem antes da tabela — porque a essa altura a
 * tabela não está medindo o que diz medir.
 */

// Acima disto a diferença de ritmo já explica sozinha uma diferença de consumo
// da ordem que este projeto costuma perseguir (décimos de por cento).
const RITMO_TOLERANCIA = 0.10;

function avisarSobreRitmo(linhas, antes) {
  if (!antes) return;
  const pares = linhas
    .map((l) => ({ nome: l.nome, agora: l.tentPorSegundo,
      antes: antes.trabalhos[l.nome] ? antes.trabalhos[l.nome].tentPorSegundo : 0 }))
    .filter((x) => x.agora > 0 && x.antes > 0);
  if (pares.length === 0) {
    // Corrida guardada antes de o ritmo existir: dá para comparar o consumo,
    // mas não dá para saber se as duas tiveram o mesmo poder de fogo.
    console.log("  aviso: a corrida guardada não registrou o ritmo da máquina —"
      + " não dá para saber se as duas tiveram o mesmo poder de fogo.\n");
    return;
  }
  const fora = pares.filter((x) => Math.abs(x.agora - x.antes) / x.antes > RITMO_TOLERANCIA);
  if (fora.length === 0) return;
  console.log(`  AVISO: o ritmo da máquina mudou em ${fora.length} de ${pares.length}`
    + " trabalho(s). A comparação abaixo NÃO é confiável — refaça as duas");
  console.log("  corridas seguidas, com a máquina livre.");
  fora.forEach((x) => {
    const dif = ((x.agora - x.antes) / x.antes) * 100;
    console.log(`    ${x.nome.padEnd(24)} ${String(x.antes).padStart(7)} → `
      + `${String(x.agora).padStart(7)} tent./s   ${dif > 0 ? "+" : ""}${dif.toFixed(0)}%`);
  });
  console.log("");
}

function imprimirTabela(linhas, antes) {
  const col = (t, n) => String(t).padEnd(n);
  const dir = (t, n) => String(t).padStart(n);
  const cabecalho = [col("trabalho", 22), dir("consumo", 11)];
  if (antes) cabecalho.push(dir("antes", 11), dir("dif.", 9));
  cabecalho.push(dir("aprov.", 8), dir("tent.", 8), dir("tent./s", 9),
    col("  receita vencedora", 30));
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
      dir(l.tentPorSegundo, 9),
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
    + (opcoes.espalharSemente ? "" : " · mesma semente em todas as fatias")
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
    // Quanto trabalho a MÁQUINA entregou neste trabalho — ver `tentPorSegundo`
    // no relatório.
    let msDeBusca = 0;
    let tentativasFeitas = 0;
    for (let s = 0; s < opcoes.sementes; s++) {
      /*
       * Cada rodada é um clique em "Fazer encaixe": sorteio novo, busca nova.
       *
       * O que fica é o MELHOR das rodadas, não a última — é o que a produção vê,
       * porque a tela guarda o melhor encaixe do trabalho e volta para ele
       * quando a procura seguinte sai pior. Reportar a última rodada media a
       * sorte do último sorteio, e não o que a pessoa leva para o corte.
       */
      let corrida = null;
      let melhorDasRodadas = null;
      for (let rodada = 0; rodada < opcoes.rodadas; rodada++) {
        const relogio = Date.now();
        const desta = await buscarComoAProducao(motor, trabalho, {
          tempoMs: opcoes.tempo * 1000,
          // Semente diferente por rodada: dois cliques seguidos no mesmo
          // trabalho não repetem o mesmo sorteio na produção.
          semente: 20260824 + s * 7919 + rodada * 104729,
          meta: opcoes.meta,
          fatias: opcoes.fatias,
          extra: opcoes.extra,
          espalharSemente: opcoes.espalharSemente,
        });
        // O relógio de parede da rodada. Ele é somado SEMPRE, inclusive das
        // rodadas que perderam: o que se quer medir aqui é quanto trabalho a
        // máquina entregou, e não quanto o vencedor custou.
        msDeBusca += Date.now() - relogio;
        tentativasFeitas += desta.tentativas || 0;
        if (!melhorDasRodadas
          || desta.sobraram < melhorDasRodadas.sobraram
          || (desta.sobraram === melhorDasRodadas.sobraram
            && desta.consumo < melhorDasRodadas.consumo)) melhorDasRodadas = desta;
      }
      corrida = melhorDasRodadas;
      corridas.push(corrida);
    }
    const media = (pegar) => corridas.reduce((s, c) => s + pegar(c), 0) / corridas.length;

    /*
     * MÉDIA NÃO BASTA PARA DECIDIR.
     *
     * A busca é sorteada, e a média entre sementes esconde as duas coisas que
     * mais importam numa mexida no motor: se o ganho veio de UMA corrida de
     * sorte (a mediana denuncia) e se a mexida piorou o PIOR CASO (o máximo
     * denuncia). Uma ideia que melhora a média em 0,3% e piora o pior caso em
     * 2% não serve para uma loja que decide corte por essa metragem.
     *
     * A média continua sendo o número da tabela e o do `--contra`, para as
     * corridas guardadas antes disto continuarem comparáveis. Mediana, pior e
     * desvio entram ao lado dela, e no JSON.
     */
    const consumos = corridas.map((c) => c.consumo).sort((a, b) => a - b);
    const meio = Math.floor(consumos.length / 2);
    const mediana = consumos.length % 2
      ? consumos[meio] : (consumos[meio - 1] + consumos[meio]) / 2;
    const consumoMedio = media((c) => c.consumo);
    const desvio = Math.sqrt(
      consumos.reduce((soma, v) => soma + (v - consumoMedio) ** 2, 0) / consumos.length);

    const linha = {
      nome,
      consumo: consumoMedio,
      mediana,
      melhor: consumos[0],
      pior: consumos[consumos.length - 1],
      desvio,
      aproveitamento: media((c) => c.aproveitamento),
      tentativas: Math.round(media((c) => c.tentativas)),
      // Tentativas por segundo de relógio. Não é uma medida do motor: é uma
      // medida da MÁQUINA enquanto esta corrida rodou. Ver `avisarSobreRitmo`.
      tentPorSegundo: msDeBusca > 0 ? Math.round(tentativasFeitas / (msDeBusca / 1000)) : 0,
      sobraram: Math.max(...corridas.map((c) => c.sobraram)),
      // A receita que venceu mais vezes, para saber de onde veio o resultado.
      receita: corridas.map((c) => c.receita).sort()[Math.floor(corridas.length / 2)],
      pecas: trabalho.itens.length,
      corridas: corridas.map((c) => ({ consumo: c.consumo, receita: c.receita })),
    };
    linhas.push(linha);
    saida.trabalhos[nome] = linha;
    process.stdout.write(`  ${nome}: ${metros(linha.consumo)}`
      + (corridas.length > 1
        ? `   mediana ${metros(linha.mediana)} · melhor ${metros(linha.melhor)}`
          + ` · pior ${metros(linha.pior)} · desvio ${(linha.desvio * 10).toFixed(1)} mm`
        : "") + "\n");
  }

  console.log("");
  avisarSobreRitmo(linhas, antes);
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
