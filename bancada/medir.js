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

// A repartição do portfólio e a corrida completa moram em `corrida.js`: a
// varredura de ajustes (`varredura.js`) mede a MESMA corrida, e duas cópias
// dela seriam duas chances de as duas ferramentas divergirem.
const {
  FATIAS, puloDaFatia, sementeDaFatia, prepararTrabalho, buscarComoAProducao,
} = require("./corrida");

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
 * eles não baterem, o recado vem antes da tabela — porque a essa altura a
 * tabela pode não estar medindo o que diz medir.
 *
 * "Pode", e não "não está": ritmo que CAI é máquina ocupada e invalida a
 * comparação; ritmo que SOBE é a própria mudança rendendo. Os dois casos saem
 * com palavras diferentes — ver `avisarSobreRitmo`.
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
  const mostrar = (x) => {
    const dif = ((x.agora - x.antes) / x.antes) * 100;
    console.log(`    ${x.nome.padEnd(24)} ${String(x.antes).padStart(7)} → `
      + `${String(x.agora).padStart(7)} tent./s   ${dif > 0 ? "+" : ""}${dif.toFixed(0)}%`);
  };

  /*
   * CAIR E SUBIR NÃO SÃO A MESMA COISA, e por muito tempo isto tratava os dois
   * com um `Math.abs`.
   *
   * Máquina ocupada só faz o ritmo CAIR — é o caso que este guarda nasceu para
   * pegar, e ali a corrida de agora está com menos poder de fogo do que a
   * guardada: qualquer consumo pior pode ser só isso, e a tabela não está
   * medindo o que diz medir.
   *
   * Ritmo que SOBE não tem essa leitura. Nenhuma máquina ociosa acelera o
   * motor; quem acelera é a mudança que se está medindo, quando ela corta
   * trabalho por tentativa em vez de trocar o que a busca faz. Foi o que o
   * corte de rotação repetida fez (+15% a +41% de tentativas por segundo, ver
   * "A ROTAÇÃO QUE O MOTOR NÃO TEM COMO DISTINGUIR" no motor), e o aviso antigo
   * declarava a comparação inválida justamente quando ela estava certa: a
   * aceleração ERA o resultado.
   *
   * Então subir vira nota, e não alarme. Com uma ressalva que a nota diz na
   * cara: se a mudança não tinha por que acelerar nada, então foi a corrida
   * GUARDADA que rodou com a máquina ocupada, e aí as duas se refazem.
   *
   * Cair junto com subir continua alarme. Ritmo para todo lado é máquina
   * instável, e nesse caso nem a aceleração se sustenta como resultado.
   */
  const caiu = pares.filter((x) => (x.antes - x.agora) / x.antes > RITMO_TOLERANCIA);
  const subiu = pares.filter((x) => (x.agora - x.antes) / x.antes > RITMO_TOLERANCIA);

  if (caiu.length > 0) {
    console.log(`  AVISO: o ritmo da máquina CAIU em ${caiu.length} de ${pares.length}`
      + " trabalho(s). A comparação abaixo NÃO é confiável — refaça as duas");
    console.log("  corridas seguidas, com a máquina livre.");
    caiu.forEach(mostrar);
    if (subiu.length > 0) {
      console.log(`  (e subiu em outros ${subiu.length} — ritmo para os dois lados é`
        + " máquina instável, não resultado.)");
      subiu.forEach(mostrar);
    }
    console.log("");
    return;
  }

  if (subiu.length === 0) return;
  console.log(`  NOTA: o ritmo SUBIU em ${subiu.length} de ${pares.length} trabalho(s) —`
    + " a corrida de agora fez mais");
  console.log("  tentativas no mesmo orçamento. Se a mudança que está sendo medida corta"
    + " trabalho por");
  console.log("  tentativa, essa aceleração É o resultado, e a diferença de consumo abaixo"
    + " já a inclui.");
  console.log("  Se ela não tinha por que acelerar nada, foi a corrida guardada que rodou"
    + " com a máquina");
  console.log("  ocupada — nesse caso, refaça as duas.");
  subiu.forEach(mostrar);
  console.log("");
}

/*
 * ===========================================================================
 * A COMPARAÇÃO PAREADA
 * ===========================================================================
 *
 * Duas corridas da bancada usam AS MESMAS SEMENTES — elas saem de
 * `20260824 + s * 7919`, que não depende de nada da corrida. Isso quer dizer
 * que a corrida A e a corrida B não são duas amostras independentes: elas são
 * o MESMO sorteio, com uma configuração diferente em cima.
 *
 * Comparar a média de uma com a média da outra joga isso fora. A semente que
 * calha de ser boa levanta as DUAS corridas juntas, e a diferença entre elas
 * não sabe disso — o ruído da semente entra inteiro na conta, mesmo sendo
 * comum aos dois lados.
 *
 * Pareando, ele cancela. Para cada semente, soma-se o consumo dos trabalhos nas
 * duas configurações e olha-se a DIFERENÇA. O que sobra é o efeito da mudança,
 * sem a sorte do sorteio.
 *
 * Foi isto que faltou hoje. Duas ideias (a segunda fatia do encaixe por vãos e
 * o agrupamento quarteto) deram resultados que apontavam para lados opostos
 * conforme a ordem de execução, e a conclusão só apareceu ao rodar o A/B duas
 * vezes — 40 minutos para responder o que o pareamento responde de graça.
 *
 * O VEREDITO compara a média das diferenças com o erro padrão delas
 * (desvio / raiz do número de sementes). Passando de duas vezes o erro padrão,
 * o zero fica fora do intervalo e a bancada chama de efeito; abaixo disso, ela
 * diz que não sabe.
 *
 * A primeira versão desta regra era "todos os sinais iguais", e ela reprovava
 * coisa boa: numa medição em que quatro sementes deram diferença negativa e a
 * quinta deu exatamente zero, ela dizia "ruído" — sendo que nenhuma semente
 * tinha ido para o outro lado. O erro padrão não se deixa enganar por um empate.
 */
function compararEmPares(linhas, antes) {
  if (!antes) return;
  const pares = linhas.filter((l) => antes.trabalhos[l.nome]
    && Array.isArray(l.corridas) && Array.isArray(antes.trabalhos[l.nome].corridas)
    && l.corridas.length === antes.trabalhos[l.nome].corridas.length);
  if (pares.length === 0 || pares[0].corridas.length < 2) {
    console.log("  (sem comparação pareada: a corrida guardada não tem as sementes uma a uma)\n");
    return;
  }

  const quantas = pares[0].corridas.length;
  const somaAgora = new Array(quantas).fill(0);
  const somaAntes = new Array(quantas).fill(0);
  pares.forEach((l) => {
    const anterior = antes.trabalhos[l.nome];
    for (let s = 0; s < quantas; s++) {
      somaAgora[s] += l.corridas[s].consumo;
      somaAntes[s] += anterior.corridas[s].consumo;
    }
  });

  const difs = somaAgora.map((v, s) => v - somaAntes[s]);
  const media = difs.reduce((a, b) => a + b, 0) / quantas;
  const desvio = Math.sqrt(difs.reduce((a, d) => a + (d - media) ** 2, 0) / quantas);
  const base = somaAntes.reduce((a, b) => a + b, 0) / quantas;
  const emPorcento = (base > 0 ? (media / base) * 100 : 0);

  const erroPadrao = desvio / Math.sqrt(quantas);
  const forca = erroPadrao > 0 ? Math.abs(media) / erroPadrao : (media === 0 ? 0 : Infinity);

  console.log(`  pareado por semente (${quantas} sementes, ${pares.length} trabalho(s)):`);
  console.log(`    diferença por semente  ${difs.map((d) => (d >= 0 ? "+" : "") + (d / 100).toFixed(3)).join("  ")}  m`);
  console.log(`    média ${media >= 0 ? "+" : ""}${(media / 100).toFixed(3)} m`
    + ` (${emPorcento >= 0 ? "+" : ""}${emPorcento.toFixed(2)}%)`
    + ` · erro padrão ${(erroPadrao / 100).toFixed(3)} m`);
  console.log(forca >= 2
    ? `    VEREDITO: efeito real — a média é ${forca.toFixed(1)}x o erro padrão.`
    : `    VEREDITO: dentro do ruído — a média é só ${forca.toFixed(1)}x o erro padrão`
      + ` (precisa de 2). Com mais sementes talvez apareça.`);
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
        // Com a segunda fase (`--extra encolher=true`), o relógio que vale é o
        // da busca: o sparrow não faz tentativas, e contá-lo derrubaria o ritmo
        // e dispararia o alarme de máquina ocupada à toa.
        msDeBusca += desta.msDaBusca != null ? desta.msDaBusca : Date.now() - relogio;
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
      corridas: corridas.map((c) => ({ consumo: c.consumo, receita: c.receita, encolhimento: c.encolhimento })),
    };
    linhas.push(linha);
    saida.trabalhos[nome] = linha;
    process.stdout.write(`  ${nome}: ${metros(linha.consumo)}`
      + (corridas.length > 1
        ? `   mediana ${metros(linha.mediana)} · melhor ${metros(linha.melhor)}`
          + ` · pior ${metros(linha.pior)} · desvio ${(linha.desvio * 10).toFixed(1)} mm`
        : "") + "\n");
    // A segunda fase conta o que fez: de quanto a quanto, e se partiu da busca.
    corridas.forEach((c) => {
      const e = c.encolhimento;
      if (!e) return;
      const dif = e.antes > 0 ? ((e.depois - e.antes) / e.antes) * 100 : 0;
      process.stdout.write(`    encolher: busca ${metros(e.antes)} -> ${metros(e.depois)}`
        + ` (${dif.toFixed(2)}%) · ${e.relatos} relatos, ${e.rejeitados} recusados`
        + `${e.partiu ? "" : " · sem partida"}${e.motivos.length ? ` · ${e.motivos.join(", ")}` : ""}\n`);
    });
  }

  console.log("");
  avisarSobreRitmo(linhas, antes);
  compararEmPares(linhas, antes);
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
