/**
 * ===========================================================================
 * BUSCA EM PARALELO — uma fatia do portfólio por núcleo
 * ===========================================================================
 *
 * O ganho não vem de um encaixador mais esperto: vem de rodar mais variações ao
 * mesmo tempo. Cada worker recebe uma fatia das receitas e devolve o melhor que
 * conseguiu; aqui os resultados são comparados.
 */

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

import {
  buscarMelhorEncaixe, fatiaDoPortfolio, melhorQue, motoresDaFatia, papelDaFatia,
} from "./encaixeMotor";
import {
  ENCOLHER_MINIMO_MS, ENCOLHER_RESERVA_MS, motivoDoTrabalho, motivoParaNaoEncolher, tempoDaBusca,
} from "./encaixeEncolher";

// Um núcleo fica de fora para a tela continuar respondendo (é ela que desenha
// a barra de progresso e escuta o botão de parar). O teto de 8 é para não
// abrir worker demais numa máquina grande: o portfólio de receitas é finito, e
// fatia pequena demais só multiplica a passada base sem cobrir mais nada.
export const ENCAIXE_MAX_WORKERS = 8;

export function quantosWorkers() {
  const nucleos = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(ENCAIXE_MAX_WORKERS, nucleos - 1));
}

export function podeUsarWorkers() {
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
export const ENCAIXE_PULO_PADRAO = 3;
export const FATIAS_EXATAS = 2;
export const puloDaFatia = (k) => (k < FATIAS_EXATAS ? 1 : ENCAIXE_PULO_PADRAO);

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
export const SEMENTE_PADRAO = 20260824;
export const PASSO_DA_SEMENTE = 104729;
export const sementeDaFatia = (semente, k) => (semente || SEMENTE_PADRAO) + k * PASSO_DA_SEMENTE;

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
export let poolEncaixe = [];

export function pegarPool(quantidade) {
  if (poolEncaixe.length === quantidade) return poolEncaixe;
  derrubarPool();
  for (let k = 0; k < quantidade; k++) poolEncaixe.push(new Worker(new URL("./encaixeWorker.js", import.meta.url), { type: "module" }));
  return poolEncaixe;
}

/** Descarta o pool inteiro. Usado quando algum worker quebra. */
export function derrubarPool() {
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
export function pecaParaWorker(item) {
  return {
    indice: item.indice, copia: item.copia,
    nome: item.nome, qtd: item.qtd, giro: item.giro,
    largura: item.largura, altura: item.altura,
    // O grupo marcado na tabela. Sem ele do lado de lá, as peças do grupo não
    // entrariam grudadas na fila e o encaixe sairia como se não houvesse grupo
    // nenhum (ver "OS GRUPOS DA PESSOA", em encaixe-motor.js).
    grupo: item.grupo || null,
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
export const enxutas = new WeakMap();

export function mascarasParaBusca(mascaras) {
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
export function configParaWorker(config) {
  const copia = { ...config };
  delete copia.deveParar;
  delete copia.aoProgredir;
  // O desenho ao vivo: a função é da página, e quem a implementa do lado de lá
  // é o próprio worker (é ele que decide o que vira mensagem). Esquecer esta
  // linha faz o `postMessage` estourar com "could not be cloned".
  delete copia.aoDesenhar;
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
export function juntarResultados(resultados) {
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
export function devolverAsPecas(resultado, itens) {
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
 * ===========================================================================
 * AS DUAS FASES — a busca de sempre, e depois o sparrow encolhendo o rolo
 * ===========================================================================
 *
 * Mesma assinatura e mesmo resultado de `buscarMelhorEncaixe`, só que usando
 * todos os núcleos — e, quando o trabalho deixa, em duas fases dentro do
 * tempo pedido:
 *
 *   1. a busca por fatias de sempre (`buscarPorFatias`), com uma fatia pequena
 *      do tempo (`tempoDaBusca`): ela satura cedo;
 *   2. o sparrow (`encolherEmParalelo`), em todos os workers, cada um com uma
 *      semente, partindo do melhor encaixe da busca, pelo resto do tempo.
 *
 * Fica o melhor. Encaixe do sparrow só vale depois de passar pela trava da
 * produção (a conferência mora em encaixeEncolher.js), então o resultado
 * nunca é pior que o da busca. O que a segunda fase fez — ou por que ela não
 * rodou — vai em `resultado.encolhimento`.
 *
 * A receita do resultado continua sendo a da busca. A memória das receitas e
 * a rede leem esse texto como "encaixador/agrupamento/ordem/heurística", e o
 * sparrow não é receita de nada: ele parte do encaixe que a receita montou.
 */
export async function buscarMelhorEncaixeEmParalelo(itens, config) {
  const inicio = Date.now();
  const total = config.tempoMaximoMs || 20000;
  const antesDeBuscar = config.encolher === false ? "desligado" : motivoDoTrabalho(itens, config);
  const tempoBusca = antesDeBuscar ? total : tempoDaBusca(total);

  const base = await buscarPorFatias(itens, antesDeBuscar ? config : {
    ...config,
    tempoMaximoMs: tempoBusca,
    // O "desistir por empacar" acompanha o tempo desta fase, e não o total.
    msSemGanho: Math.max(800, tempoBusca * 0.25),
  });
  if (!base) return base;

  const resto = total - (Date.now() - inicio);
  const motivo = antesDeBuscar
    || (config.deveParar && config.deveParar() ? "parado" : null)
    || (base.alcancouMeta ? "meta alcançada" : null)
    || (resto < ENCOLHER_MINIMO_MS + ENCOLHER_RESERVA_MS ? "sem tempo" : null)
    || (!podeUsarWorkers() || quantosWorkers() < 1 ? "sem workers" : null)
    || motivoParaNaoEncolher(itens, base, config);
  if (motivo) {
    base.encolhimento = { motivo, antes: base.consumo, depois: base.consumo };
    return base;
  }
  return encolherEmParalelo(itens, base, config, resto, inicio);
}

/** O encaixe da busca, enxuto para atravessar o postMessage (como a volta dele). */
export function partidaParaWorker(resultado) {
  return {
    consumo: resultado.consumo,
    posicoes: resultado.posicoes.map((p) => ({
      item: { indice: p.item.indice, copia: p.item.copia },
      x: p.x, y: p.y, largura: p.largura, altura: p.altura,
      rot: p.rot || 0, girado: p.girado, passo: p.passo, bancada: p.bancada || 0,
    })),
  };
}

// Folga do prazo duro da segunda fase, além do tempo pedido. O sparrow para no
// relógio dele; o que passa disso é importar a instância e conferir a volta.
const MARGEM_DO_ENCOLHER_MS = 10000;

/**
 * A segunda fase: o sparrow em todos os workers.
 *
 * O WASM roda numa chamada síncrona, então o worker não lê o "parar". O que
 * chega daqui é cada encaixe válido e mais curto (`encolhido`), na hora — e é
 * por isso que parar funciona: o worker é ENCERRADO, e vale o último encaixe
 * que ele mandou. Worker encerrado não volta para a piscina (o estado dele
 * morreu junto); a próxima busca sobe workers novos, como no prazo duro.
 */
export async function encolherEmParalelo(itens, base, config, restoMs, inicioGeral) {
  const n = quantosWorkers();
  let workers;
  try {
    workers = pegarPool(n);
  } catch (erro) {
    console.warn("[encaixe] sem workers para encolher o rolo:", erro);
    base.encolhimento = { motivo: "sem workers", antes: base.consumo, depois: base.consumo };
    return base;
  }

  const tempoDoSparrow = Math.max(0, restoMs - ENCOLHER_RESERVA_MS);
  const ultimos = new Array(workers.length).fill(null);
  const estados = new Array(workers.length).fill(null);
  const encerrar = new Array(workers.length).fill(null);
  const respondeu = new Array(workers.length).fill(false);
  let parouNaMao = false;
  let matouAlguem = false;
  let falhaGeral = null;

  const melhorAgora = () => ultimos.reduce(
    (menor, r) => (r && r.consumo < menor ? r.consumo : menor), base.consumo);
  const relatar = () => {
    if (!config.aoProgredir) return;
    config.aoProgredir({
      fase: "encolhendo",
      tentativas: base.tentativas || 0,
      semGanho: 0,
      alvo: config.alvo || null,
      consumo: melhorAgora(),
      consumoDaBusca: base.consumo,
      receita: base.receita,
      paredes: base.paredes || 0,
      modo: null,
      decorridoMs: Date.now() - inicioGeral,
      workers: workers.length,
    });
  };

  const vigia = setInterval(() => {
    const parar = config.deveParar && config.deveParar();
    const passou = Date.now() - inicioGeral > (config.tempoMaximoMs || 20000) + MARGEM_DO_ENCOLHER_MS;
    if (!parar && !passou) return;
    if (parar) parouNaMao = true;
    workers.forEach((w, k) => {
      if (respondeu[k]) return;
      respondeu[k] = true;
      matouAlguem = true;
      if (!parar) {
        console.warn(`[encaixe] o encolhedor ${k} passou do prazo; encerrando e ficando com o que ele mandou.`);
      }
      try { w.terminate(); } catch { /* já estava morto */ }
      if (encerrar[k]) encerrar[k]();
    });
  }, 120);

  try {
    relatar();
    // 1) As peças outra vez: o pool pode ter sido refeito na primeira fase (um
    //    worker encerrado no prazo duro), e worker novo nasce sem elas.
    //
    //    A porta de saída (`encerrar[k]`) já vale aqui: se a pessoa parar
    //    enquanto os workers se preparam, o vigia encerra o worker, e sem a
    //    porta esta espera ficaria pendurada para sempre num "pronto" que um
    //    worker encerrado nunca manda.
    const leves = itens.map(pecaParaWorker);
    const prontos = new Array(workers.length).fill(false);
    await Promise.all(workers.map((w, k) => new Promise((pronto) => {
      encerrar[k] = pronto;
      const aoResponder = (evento) => {
        if (evento.data && evento.data.tipo === "pronto") {
          w.removeEventListener("message", aoResponder);
          w.__temWasm = evento.data.wasm === true;
          w.__temEncolher = evento.data.encolher === true;
          prontos[k] = true;
          pronto();
        }
      };
      w.addEventListener("message", aoResponder);
      w.addEventListener("error", (evento) => {
        console.warn(`[encaixe] o worker ${k} quebrou ao se preparar:`, evento.message);
        respondeu[k] = true;
        matouAlguem = true;
        pronto();
      }, { once: true });
      w.postMessage({ tipo: "preparar", itens: leves });
    })));

    // Só recebe tarefa quem se preparou, não foi encerrado e tem o sparrow.
    const aptos = workers.map((w, k) => prontos[k] && !respondeu[k] && w.__temEncolher);
    if (!parouNaMao && !aptos.some(Boolean)) {
      falhaGeral = "encolhedor indisponível";
    }

    // 2) Cada worker encolhe com a sua semente.
    const partida = partidaParaWorker(base);
    const configDoSparrow = {
      larguraTecido: config.larguraTecido,
      passo: config.passo,
      comprimentoBancada: config.comprimentoBancada || 0,
      tempoMs: tempoDoSparrow,
      trabalhadores: config.encolherTrabalhadores,
      partir: config.encolherPartir !== false,
    };
    const rodadas = workers.map((w, k) => new Promise((pronto) => {
      encerrar[k] = pronto;
      if (parouNaMao || falhaGeral || !aptos[k]) { respondeu[k] = true; pronto(); return; }
      const aoResponder = (evento) => {
        const msg = evento.data;
        if (!msg) return;
        if (msg.tipo === "encolhido") {
          ultimos[k] = msg.resultado;
          relatar();
          return;
        }
        if (msg.tipo === "encolheu" || msg.tipo === "falhou") {
          w.removeEventListener("message", aoResponder);
          respondeu[k] = true;
          estados[k] = msg.tipo === "falhou" ? { motivo: `sparrow falhou: ${msg.erro}` } : msg;
          pronto();
        }
      };
      w.addEventListener("message", aoResponder);
      w.addEventListener("error", (evento) => {
        console.warn(`[encaixe] o encolhedor ${k} quebrou:`, evento.message);
        respondeu[k] = true;
        matouAlguem = true;
        estados[k] = { motivo: `worker quebrou: ${evento.message}` };
        pronto();
      }, { once: true });
      w.postMessage({
        tipo: "encolher", k, partida, config: configDoSparrow,
        semente: sementeDaFatia(config.semente, k),
      });
    }));
    await Promise.all(rodadas);
  } catch (erro) {
    console.warn("[encaixe] a segunda fase falhou, ficando com o encaixe da busca:", erro);
    matouAlguem = true;
    falhaGeral = `a segunda fase falhou: ${(erro && erro.message) || erro}`;
  } finally {
    clearInterval(vigia);
  }
  if (matouAlguem) derrubarPool();

  const soma = (campo) => estados.reduce((s, e) => s + ((e && e[campo]) || 0), 0);
  const info = {
    antes: base.consumo,
    relatos: soma("relatos"),
    rejeitados: soma("rejeitados"),
    workers: workers.length,
    parou: parouNaMao,
  };

  let campeao = null;
  ultimos.forEach((r) => { if (r && (!campeao || r.consumo < campeao.consumo)) campeao = r; });
  if (!campeao || !(campeao.consumo < base.consumo - 1e-9)) {
    const motivoDeUm = estados.find((e) => e && e.motivo);
    base.encolhimento = {
      ...info,
      depois: base.consumo,
      motivo: parouNaMao ? "parado"
        : falhaGeral || (motivoDeUm ? motivoDeUm.motivo : "não encurtou"),
    };
    return base;
  }

  devolverAsPecas(campeao, itens);
  const final = {
    ...base,
    posicoes: campeao.posicoes,
    naoEncaixadas: campeao.naoEncaixadas,
    consumo: campeao.consumo,
    areaReal: campeao.areaReal != null ? campeao.areaReal : base.areaReal,
    // O sparrow encaixa pela silhueta (a máscara), como o contorno.
    venceuContorno: true,
    venceuFaixas: false,
    alcancouRecorde: base.alvo == null ? null : campeao.consumo <= base.alvo * 1.0001,
    decorridoMs: Date.now() - inicioGeral,
  };
  final.encolhimento = { ...info, depois: campeao.consumo, motivo: null };
  return final;
}

/**
 * A busca de sempre, repartida pelos núcleos: uma fatia do portfólio por
 * worker. Cai na versão de uma thread sozinha se algo der errado.
 */
export async function buscarPorFatias(itens, config) {
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
  /*
   * ===========================================================================
   * O PRAZO DURO
   * ===========================================================================
   *
   * O aviso de parar viaja por `postMessage`, e mensagem só é lida por quem
   * está de volta ao laço de eventos. Uma fatia presa em código SÍNCRONO —
   * uma tentativa patológica, um polimento que não acaba — nunca a lê. O
   * `Promise.all` abaixo então espera por ela, e a tela fica em "procurando"
   * para sempre: o contador para de subir, o tempo pedido passa, e nada
   * acontece. Foi assim que este defeito apareceu na produção.
   *
   * Pedir com jeito não basta. Depois de um prazo generoso — o tempo pedido
   * mais a margem abaixo — a fatia calada é ENCERRADA à força e a promessa
   * dela é fechada de fora. O que ela tinha se perde; o que as outras acharam
   * vale, e é isso que a tela recebe.
   *
   * A margem é larga de propósito: o polimento do fim roda DEPOIS do relógio
   * da busca (ver "O POLIMENTO", em encaixe-motor.js) e num lote grande ele
   * custa segundos honestos. Matar uma fatia que ia entregar é perder trabalho
   * bom; deixar a tela pendurada é perder o dia. A margem escolhe o primeiro
   * risco, e só depois de o segundo já ser certo.
   *
   * Worker morto à força não volta para a piscina: o estado dele (as máscaras
   * preparadas, o plano do WASM) morreu junto, e reaproveitá-lo daria um
   * defeito muito pior de achar do que este.
   */
  const MARGEM_DURA_MS = 15000;
  const encerrar = new Array(workers.length).fill(null);
  const respondeu = new Array(workers.length).fill(false);
  let matouAlguem = false;
  // Assim que UMA fatia bate a meta de aproveitamento (ver `config.metaAproveitamento`
  // em encaixe-motor.js), não vale a pena esperar as outras terminarem o tempo
  // pedido inteiro — elas também são mandadas parar e entregam o melhor que
  // tiverem. Sem isso a fatia mais lenta seguraria o Promise.all até o fim, e a
  // meta batida cedo por uma fatia não economizaria tempo nenhum.
  let pediuPararPorMeta = false;
  /**
   * O menor consumo já MANDADO PARA A TELA, que não é o mesmo que o melhor da
   * busca: serve só para o rolo desenhado nunca crescer. Ver o repasse do
   * quadro, no tratador de mensagens abaixo.
   */
  let melhorDesenhado = null;

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
    //
    // `encerrar[k]` é a porta de saída da fatia k, guardada para o prazo duro
    // lá embaixo poder fechá-la de fora. Sem ela, quem não responde não é
    // ninguém: a promessa fica pendurada e o `Promise.all` com ela.
    const buscas = workers.map((w, k) => new Promise((pronto) => {
      encerrar[k] = pronto;
      const aoResponder = (evento) => {
        const msg = evento.data;
        if (!msg) return;
        /*
          O QUADRO DO DESENHO AO VIVO.

          Cada fatia persegue o próprio recorde e não sabe das outras, então
          "recorde" aqui quer dizer "melhor DESTA fatia". Com oito núcleos, a
          fatia que está indo mal mandaria recordes piores que o já desenhado e
          a tela veria o rolo CRESCER — que é mentira sobre o que a busca está
          fazendo. Por isso o recorde é filtrado contra o melhor global.

          O fantasma não passa por esse filtro: ele é justamente o que está
          sendo tentado, quase sempre pior que o melhor, e é disso que vem a
          sensação de máquina procurando.
        */
        if (msg.tipo === "desenho") {
          if (!config.aoDesenhar) return;
          if (msg.especie === "recorde") {
            if (!msg.inteiro) return;
            if (melhorDesenhado != null && msg.consumo >= melhorDesenhado) return;
            melhorDesenhado = msg.consumo;
          }
          config.aoDesenhar(msg);
          return;
        }
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
          respondeu[k] = true;
          resultados.push(msg.resultado);
          pronto();
          return;
        }
        if (msg.tipo === "falhou") {
          w.removeEventListener("message", aoResponder);
          console.warn(`[encaixe] fatia ${k} falhou:`, msg.erro);
          respondeu[k] = true;
          pronto(); // as outras fatias continuam valendo
        }
      };
      w.addEventListener("message", aoResponder);
      w.addEventListener("error", (evento) => {
        console.warn(`[encaixe] worker ${k} quebrou:`, evento.message);
        quebrou = true;
        respondeu[k] = true;
        pronto();
      }, { once: true });
      // O papel desta fatia (ver `papelDaFatia`, em encaixe-motor.js). Ele entra
      // POR CIMA do config da tela: é ele que desliga a poda na fatia de
      // controle, e a tela não tem por que saber disso.
      const papel = papelDaFatia(k, n);
      // Os encaixadores desta fatia e o pedaço do portfólio que cabe a ela —
      // ver `motoresDaFatia` e `fatiaDoPortfolio`, em encaixe-motor.js. A fatia
      // dedicada a um encaixador próprio recebe o portfólio inteiro DELE; as
      // outras redividem o comum entre si, senão sobra receita órfã.
      const pedidos = configLimpo.motores || [];
      w.postMessage({ tipo: "buscar", config: { ...configLimpo, ...papel.config },
        fatia: fatiaDoPortfolio(k, n, pedidos),
        saltoX: puloDaFatia(k), semente: sementeDaFatia(configLimpo.semente, k),
        motores: motoresDaFatia(k, n, pedidos) });
    }));

    // 3) O botão de parar mora na tela; daqui ele vira um aviso para as fatias.
    // Também é a rede de segurança do tempo: se uma fatia passar do limite
    // combinado, ela é mandada encerrar e entrega o melhor que tiver.
    vigia = setInterval(() => {
      if ((config.deveParar && config.deveParar()) || Date.now() - inicio > tetoMs + 1500) {
        workers.forEach((w) => w.postMessage({ tipo: "parar" }));
      }
      // E, passado o prazo duro, para de pedir e encerra. Ver `MARGEM_DURA_MS`.
      if (Date.now() - inicio <= tetoMs + MARGEM_DURA_MS) return;
      workers.forEach((w, k) => {
        if (respondeu[k]) return;
        respondeu[k] = true;
        matouAlguem = true;
        console.warn(
          `[encaixe] a fatia ${k} não respondeu ${((Date.now() - inicio) / 1000).toFixed(0)}s `
          + `depois de começar (tempo pedido: ${(tetoMs / 1000).toFixed(0)}s). `
          + "Encerrando-a e ficando com o que as outras acharam.",
        );
        try { w.terminate(); } catch { /* já estava morto */ }
        if (encerrar[k]) encerrar[k]();
      });
    }, 120);

    await Promise.all(buscas);
  } catch (erro) {
    console.warn("[encaixe] paralelo falhou, indo de thread única:", erro);
    derrubarPool();
    return buscarMelhorEncaixe(itens, config);
  } finally {
    if (vigia) clearInterval(vigia);
  }

  // Worker encerrado à força levou o estado dele junto — a piscina inteira sai
  // de circulação, e a próxima busca sobe workers novos.
  if (quebrou || matouAlguem) derrubarPool();

  const juntado = juntarResultados(resultados);
  if (!juntado) {
    // Nenhuma fatia entregou. Em thread única não há worker para travar, então
    // este caminho sempre responde — mais devagar, e respondendo.
    console.warn("[encaixe] nenhuma fatia devolveu resultado, indo de thread única.");
    return buscarMelhorEncaixe(itens, config);
  }

  juntado.decorridoMs = Date.now() - inicio;
  return devolverAsPecas(juntado, itens);
}
