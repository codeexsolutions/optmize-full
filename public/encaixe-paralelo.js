/**
 * Busca em paralelo: o mesmo encaixe, espalhado pelos núcleos da máquina.
 *
 * Por que isto existe
 * -------------------
 * A busca do encaixe é uma disputa entre receitas — combinações de motor,
 * ordem das peças e heurística. Cada tentativa é independente da outra: nada
 * do que a receita A descobre muda o que a receita B vai fazer. Isso é
 * exatamente o formato de trabalho que se divide bem entre núcleos.
 *
 * Rodando tudo numa thread só, um i5 de 6 núcleos usa **um**. Os outros cinco
 * ficam olhando. Aqui cada worker recebe uma fatia do portfólio (as receitas
 * de índice k, k+n, k+2n…), roda a busca inteira dela e devolve o melhor que
 * achou; esta função fica com o melhor de todos.
 *
 * É a mesma jogada do servidor de encaixe do Audaces: o que compra tecido não
 * é um encaixador mais esperto, é caber mais tentativas no mesmo tempo.
 *
 * Se não der para usar worker — navegador antigo, erro ao carregar, qualquer
 * coisa — cai na busca normal de sempre. A tela não fica sabendo: a assinatura
 * e o resultado são iguais aos de `buscarMelhorEncaixe`.
 */

// Um núcleo fica de fora para a tela continuar respondendo (é ela que desenha
// a barra de progresso e escuta o botão de parar). O teto de 8 é para não
// abrir worker demais numa máquina grande: o portfólio de receitas é finito, e
// fatia pequena demais só multiplica a passada base sem cobrir mais nada.
const ENCAIXE_MAX_WORKERS = 8;

function quantosWorkers() {
  const nucleos = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(ENCAIXE_MAX_WORKERS, nucleos - 1));
}

function podeUsarWorkers() {
  return typeof Worker !== "undefined";
}

/**
 * O quanto a varredura de posições pula, por fatia.
 *
 * A varredura pode testar toda posição do rolo (exata) ou andar de três em
 * três e depois refinar em volta da melhor região. Pulando, cada tentativa sai
 * ~2,5x mais barata e cabem muito mais tentativas no mesmo tempo; em troca,
 * de vez em quando a posição boa escapa.
 *
 * Medindo com todas as fatias pulando: média −1,08% de tecido, mas em 2 de 12
 * casos saiu **pior** que a varredura exata (até +0,69%).
 *
 * Deixando fatia com a varredura exata e as outras pulando, o melhor de todas
 * nunca fica atrás: média −1,16% de tecido, melhorou em 8 dos 12 casos,
 * empatou em 4 e **piorou em nenhum**. A fatia exata funciona como piso — o
 * que as outras acharem só entra se for melhor que ela.
 *
 * É a mesma ideia da disputa entre receitas, aplicada à varredura: em vez de
 * escolher a estratégia certa de antemão, roda as duas e fica com o resultado.
 *
 * **Quantas fatias varrem exato** foi remedido depois do WASM, porque ele
 * mudou o preço da varredura exata: com 3,9x mais tentativas, dá para gastar
 * mais em cada uma. Duas fatias exatas ganharam:
 *
 *   1 exata (como era)  51,438 m
 *   2 exatas            51,333 m   ← empatou ou ganhou nas 8 medições
 *   todas exatas        51,370 m   (cai para metade das tentativas)
 *   escada 1/2/3/3      51,370 m
 *
 * São 0,20% — pouco, mas sem contrapartida: a repartição nova não perdeu em
 * nenhum dos 8 casos. Varrer tudo exato já é demais, e aí a conta se inverte.
 */
const ENCAIXE_PULO_PADRAO = 3;
const FATIAS_EXATAS = 2;
const puloDaFatia = (k) => (k < FATIAS_EXATAS ? 1 : ENCAIXE_PULO_PADRAO);

/**
 * A semente do sorteio de cada fatia.
 *
 * Todas as fatias rodavam com a MESMA semente — a busca nunca recebia
 * `config.semente`, então todas caíam no mesmo valor padrão lá dentro. Elas
 * divergiam só porque cada uma recebe um pedaço diferente do portfólio de
 * receitas; dentro da fatia, a sequência de sorteios era idêntica em todas.
 *
 * Isso desperdiça exatamente o recurso que o paralelo existe para comprar. Duas
 * fatias que peguem receitas parecidas sacodem a fila do mesmo jeito, na mesma
 * ordem, e visitam as mesmas arrumações. O que compra tecido aqui é DIVERSIDADE
 * de tentativas, e sorteio repetido não é tentativa nova.
 *
 * O número somado é primo e grande só para as sequências não se alcançarem: o
 * gerador é linear congruente (ver `geradorDeSorteio`), e sementes vizinhas nele
 * produzem começos vizinhos.
 *
 * **Medido, e deu empate**: −0,05% na soma dos oito trabalhos da bancada (dois
 * melhoraram, dois pioraram, quatro empataram), bem dentro dos 0,23% que duas
 * corridas iguais já variam. O motivo é que as fatias já divergiam por outro
 * caminho — cada uma recebe um pedaço diferente do portfólio de receitas, e isso
 * sozinho já fazia o sorteio ser consumido em ordens diferentes.
 *
 * Fica assim mesmo, por dois motivos. Primeiro, não custa nada: nenhuma
 * tentativa, nenhuma receita, nenhum tempo. Segundo, e é o que decide, existe um
 * caso em que a semente repetida faz estrago de verdade — quando o portfólio é
 * MENOR que o número de fatias. Aí o corte por fatia sai vazio, cada worker cai
 * de volta no portfólio inteiro (ver `config.fatia`, em encaixe-motor.js), e com
 * a mesma semente os cinco passam a fazer exatamente o mesmo trabalho, cinco
 * vezes. Isso acontece com um encaixador de portfólio curto, ou com
 * `maxReceitasBase` apertado em lote grande.
 */
const SEMENTE_PADRAO = 20260824;
const PASSO_DA_SEMENTE = 104729;
const sementeDaFatia = (semente, k) => (semente || SEMENTE_PADRAO) + k * PASSO_DA_SEMENTE;

/*
 * Cada fatia usa os mesmos encaixadores: quem escolhe o encaixador é a tela, e
 * a fatia só reparte o portfólio de receitas dele.
 *
 * Já houve um `motoresDaFatia` aqui, para dar a última fatia ao encaixe por NFP
 * (nfp.js). Ele saiu do projeto, e a função saiu junto. O histórico, em uma
 * frase: o NFP pôs peça em cima de peça em produção — o traçador de contorno
 * dele seguia uma borda só, e peça com a silhueta em dois blocos tinha o
 * segundo invisível. O defeito foi achado e consertado pela bancada, e mesmo
 * consertado ele não pagava o próprio custo: numa fatia só para ele, a soma dos
 * sete trabalhos deu 26,458 m contra 26,437 m sem ele, e ele não venceu nenhum.
 * O que ele cobrava era caro — uma passada custa segundos, não milissegundos, e
 * as outras receitas perdiam o quinto de orçamento que ia para lá (105 mil
 * tentativas caíam para 62 mil no maior trabalho).
 *
 * Está tudo no histórico do repositório, inclusive já consertado, se um dia
 * valer a pena revisitar.
 */


// O pool sobrevive entre encaixes: abrir worker custa (cada um recarrega o
// motor inteiro), e a pessoa costuma apertar "Fazer encaixe"
// várias vezes seguidas mexendo na largura ou na folga.
let poolEncaixe = [];

function pegarPool(quantidade) {
  if (poolEncaixe.length === quantidade) return poolEncaixe;
  derrubarPool();
  for (let k = 0; k < quantidade; k++) poolEncaixe.push(new Worker("/encaixe-worker.js"));
  return poolEncaixe;
}

/** Descarta o pool inteiro. Usado quando algum worker quebra. */
function derrubarPool() {
  poolEncaixe.forEach((w) => { try { w.terminate(); } catch (erro) { /* já estava morto */ } });
  poolEncaixe = [];
}

/**
 * A peça, enxuta para atravessar o postMessage.
 *
 * Fica de fora o que não copia (`img` é um elemento da página) e o que é
 * grande à toa (`src` é a imagem inteira em base64 — o worker não desenha
 * nada, então não precisa dela).
 *
 * As máscaras são o objeto pesado, e todas as cópias de uma mesma peça
 * apontam para o mesmo. O postMessage preserva esse compartilhamento, então
 * uma peça com 40 cópias manda as máscaras **uma vez**, não quarenta.
 */
function pecaParaWorker(item) {
  return {
    indice: item.indice, copia: item.copia,
    nome: item.nome, qtd: item.qtd, giro: item.giro,
    largura: item.largura, altura: item.altura,
    mascaras: mascarasParaBusca(item.mascaras),
  };
}

// A máscara sem o `desenho`: só o que a BUSCA lê.
//
// O worker nunca toca no `desenho` — ele posiciona por topo/base, e desenhar é
// coisa da página. Mas o `desenho` é o vetor grande da máscara (uma célula por
// posição da caixa da peça, contra uma por coluna no topo/base), e ele estava
// atravessando inteiro: o postMessage NÃO transfere aqui, ele clona, e são
// oito workers. No lote grande da bancada eram 281 KB de máscara clonados oito
// vezes; sem o `desenho` (e sem o `cheio`, que saiu com o NFP) sobram 13 KB.
//
// O cache é por objeto de máscara, e não por peça: quarenta cópias da mesma
// peça apontam para a mesma máscara, então a versão enxuta é montada uma vez
// só — e é o MESMO objeto nas quarenta, que é o que faz o postMessage mandar
// os dados uma vez só em vez de quarenta.
const enxutas = new WeakMap();

function mascarasParaBusca(mascaras) {
  if (!mascaras) return mascaras;
  const pronta = enxutas.get(mascaras);
  if (pronta) return pronta;

  const rotacoes = {};
  Object.entries(mascaras.rotacoes).forEach(([rot, m]) => {
    rotacoes[rot] = m ? {
      cols: m.cols, rows: m.rows, topo: m.topo, base: m.base,
      alturaUtil: m.alturaUtil, offX: m.offX, offY: m.offY,
    } : m;
  });
  const enxuta = { ...mascaras, rotacoes };
  enxutas.set(mascaras, enxuta);
  return enxuta;
}

/** Tira do config o que não atravessa: as funções de retorno para a tela. */
function configParaWorker(config) {
  const copia = { ...config };
  delete copia.deveParar;
  delete copia.aoProgredir;
  delete copia.fatia;
  return copia;
}

/**
 * Junta o que os workers devolveram num resultado só, no mesmo formato que a
 * busca de uma thread devolvia.
 *
 * O vencedor é escolhido pelo mesmo critério de sempre (`melhorQue`: primeiro
 * quem deixou menos peça de fora, depois quem gastou menos tecido). O resto
 * dos números é somado ou reduzido para a tela contar a história certa:
 * "tentativas" é o total de todas as fatias, e o melhor de cada motor é o
 * melhor entre as fatias que rodaram aquele motor.
 */
function juntarResultados(resultados) {
  let campeao = null;
  for (const r of resultados) if (melhorQue(r, campeao)) campeao = r;
  if (!campeao) return null;

  const juntado = { ...campeao };
  juntado.tentativas = resultados.reduce((soma, r) => soma + (r.tentativas || 0), 0);
  // Cada fatia empaca e muda de caminho por conta própria; o total é a soma.
  juntado.paredes = resultados.reduce((soma, r) => soma + (r.paredes || 0), 0);
  juntado.placar = resultados.flatMap((r) => r.placar || []);

  const porMotor = {};
  resultados.forEach((r) => {
    Object.entries(r.melhorPorMotor || {}).forEach(([motor, consumo]) => {
      if (porMotor[motor] == null || consumo < porMotor[motor]) porMotor[motor] = consumo;
    });
  });
  juntado.melhorPorMotor = porMotor;
  juntado.workers = resultados.length;
  juntado.comWasm = poolEncaixe.filter((w) => w.__temWasm).length;
  return juntado;
}

/**
 * Devolve a peça de verdade para cada posição.
 *
 * O worker só sabe o endereço da peça (índice e cópia) porque a peça inteira
 * não atravessa. A tela precisa do objeto original de volta: é dele que sai a
 * imagem para desenhar, o nome da etiqueta e a área real da silhueta.
 */
function devolverAsPecas(resultado, itens) {
  const porEndereco = new Map();
  itens.forEach((item) => porEndereco.set(`${item.indice}#${item.copia}`, item));
  const achar = (ref) => porEndereco.get(`${ref.indice}#${ref.copia}`) || ref;

  resultado.posicoes.forEach((p) => {
    p.item = achar(p.item);
    // A máscara não volta do worker: ela é remontada aqui, do cache da própria
    // página. Antes ela atravessava de volta em cada resultado — dado que a
    // página já tinha, clonado outra vez por worker.
    //
    // E remontar assim é melhor que receber: o `faixas` (o contorno pronto para
    // desenhar) fica guardado no objeto da máscara, e com a cópia do worker ele
    // nascia vazio a cada encaixe. Agora é o mesmo objeto de sempre, e o
    // contorno só é calculado na primeira vez que a peça é desenhada.
    if (p.comMascara && p.item.mascaras) p.mascara = p.item.mascaras.rotacoes[p.rot];
    delete p.comMascara;
  });
  resultado.naoEncaixadas = resultado.naoEncaixadas.map(achar);
  return resultado;
}

/**
 * Mesma assinatura e mesmo resultado de `buscarMelhorEncaixe`, só que usando
 * todos os núcleos. Cai na versão de uma thread sozinha se algo der errado.
 */
async function buscarMelhorEncaixeEmParalelo(itens, config) {
  const n = quantosWorkers();
  if (!podeUsarWorkers() || n < 2) return buscarMelhorEncaixe(itens, config);

  let workers;
  try {
    workers = pegarPool(n);
  } catch (erro) {
    console.warn("[encaixe] não deu para abrir os workers, indo de thread única:", erro);
    derrubarPool();
    return buscarMelhorEncaixe(itens, config);
  }

  const inicio = Date.now();
  const leves = itens.map(pecaParaWorker);
  const configLimpo = configParaWorker(config);
  const tetoMs = config.tempoMaximoMs || 20000;

  // O andamento que cada fatia relatou por último. A tela recebe a soma.
  const andamentos = new Array(n).fill(null);
  const relatar = () => {
    if (!config.aoProgredir) return;
    const vivos = andamentos.filter(Boolean);
    if (vivos.length === 0) return;
    const consumos = vivos.map((e) => e.consumo).filter((c) => c != null);
    const melhorAgora = consumos.length ? Math.min(...consumos) : null;
    const dono = vivos.find((e) => e.consumo === melhorAgora);
    config.aoProgredir({
      fase: vivos.some((e) => e.fase === "perseguindo") ? "perseguindo"
        : vivos.every((e) => e.fase === "pronto") ? "pronto"
          : vivos.some((e) => e.fase === "melhorando") ? "melhorando" : "base",
      tentativas: vivos.reduce((soma, e) => soma + (e.tentativas || 0), 0),
      // O menor entre as fatias: basta uma delas ainda estar rendendo para a
      // tela não anunciar que a busca empacou. Sem fatia nenhuma relatando,
      // vira 0 — "Infinity sem ganho" na tela não quer dizer nada.
      semGanho: Math.min(...vivos.map((e) => (e.semGanho == null ? Infinity : e.semGanho))) || 0,
      alvo: vivos[0].alvo,
      consumo: melhorAgora,
      receita: dono ? dono.receita : null,
      // Quantas vezes as fatias empacaram e trocaram de caminho, somadas, e em
      // que modo está a fatia que segura o melhor encaixe no momento.
      paredes: vivos.reduce((soma, e) => soma + (e.paredes || 0), 0),
      modo: dono ? dono.modo : null,
      decorridoMs: Date.now() - inicio,
      workers: n,
    });
  };

  const resultados = [];
  let quebrou = false;
  let vigia = null;
  // Assim que UMA fatia bate a meta de aproveitamento (ver `config.metaAproveitamento`
  // em encaixe-motor.js), não vale a pena esperar as outras terminarem o tempo
  // pedido inteiro — elas também são mandadas parar e entregam o melhor que
  // tiverem. Sem isso a fatia mais lenta seguraria o Promise.all até o fim, e a
  // meta batida cedo por uma fatia não economizaria tempo nenhum.
  let pediuPararPorMeta = false;

  try {
    // 1) Manda as peças. As máscaras atravessam uma vez por worker e ficam lá.
    await Promise.all(workers.map((w) => new Promise((pronto, falhou) => {
      const aoResponder = (evento) => {
        if (evento.data && evento.data.tipo === "pronto") {
          w.removeEventListener("message", aoResponder);
          w.__temWasm = evento.data.wasm === true;
          pronto();
        }
      };
      w.addEventListener("message", aoResponder);
      w.addEventListener("error", falhou, { once: true });
      w.postMessage({ tipo: "preparar", itens: leves });
    })));

    // 2) Cada um busca na sua fatia do portfólio.
    const buscas = workers.map((w, k) => new Promise((pronto) => {
      const aoResponder = (evento) => {
        const msg = evento.data;
        if (!msg) return;
        if (msg.tipo === "andamento") {
          andamentos[k] = msg.estado;
          relatar();
          if (!pediuPararPorMeta && msg.estado.alcancouMeta) {
            pediuPararPorMeta = true;
            workers.forEach((outro) => outro.postMessage({ tipo: "parar" }));
          }
          return;
        }
        if (msg.tipo === "resultado") {
          w.removeEventListener("message", aoResponder);
          resultados.push(msg.resultado);
          pronto();
          return;
        }
        if (msg.tipo === "falhou") {
          w.removeEventListener("message", aoResponder);
          console.warn(`[encaixe] fatia ${k} falhou:`, msg.erro);
          pronto(); // as outras fatias continuam valendo
        }
      };
      w.addEventListener("message", aoResponder);
      w.addEventListener("error", (evento) => {
        console.warn(`[encaixe] worker ${k} quebrou:`, evento.message);
        quebrou = true;
        pronto();
      }, { once: true });
      w.postMessage({ tipo: "buscar", config: configLimpo, fatia: { k, n },
        saltoX: puloDaFatia(k), semente: sementeDaFatia(configLimpo.semente, k),
        motores: configLimpo.motores || [] });
    }));

    // 3) O botão de parar mora na tela; daqui ele vira um aviso para as fatias.
    // Também é a rede de segurança do tempo: se uma fatia passar do limite
    // combinado, ela é mandada encerrar e entrega o melhor que tiver.
    vigia = setInterval(() => {
      if ((config.deveParar && config.deveParar()) || Date.now() - inicio > tetoMs + 1500) {
        workers.forEach((w) => w.postMessage({ tipo: "parar" }));
      }
    }, 120);

    await Promise.all(buscas);
  } catch (erro) {
    console.warn("[encaixe] paralelo falhou, indo de thread única:", erro);
    derrubarPool();
    return buscarMelhorEncaixe(itens, config);
  } finally {
    if (vigia) clearInterval(vigia);
  }

  if (quebrou) derrubarPool();

  const juntado = juntarResultados(resultados);
  if (!juntado) {
    console.warn("[encaixe] nenhuma fatia devolveu resultado, indo de thread única.");
    return buscarMelhorEncaixe(itens, config);
  }

  juntado.decorridoMs = Date.now() - inicio;
  return devolverAsPecas(juntado, itens);
}
