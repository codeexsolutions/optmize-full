/**
 * ===========================================================================
 * WORKER DE ENCAIXE — a busca inteira fora da thread da tela
 * ===========================================================================
 *
 * O PORTE: o `importScripts` virou `import`. Era ele que trazia geometria,
 * giro, rede, wasm e motor para dentro do escopo do worker; agora quem resolve
 * a árvore é o empacotador, e só o que este arquivo CHAMA aparece na lista.
 * O resto vem junto porque o motor importa.
 */

/**
 * Um trabalhador de encaixe: roda a busca inteira fora da thread da tela.
 *
 * A ideia é a mesma do servidor de encaixe do Audaces (o "Supera"): o ganho
 * não vem de um encaixador mais esperto, vem de **rodar mais variações ao
 * mesmo tempo**. Cada worker recebe uma fatia do portfólio de receitas, faz a
 * busca dele do começo ao fim e devolve o melhor que conseguiu; quem compara
 * os resultados é o encaixe-paralelo.js, na página.
 *
 * Aqui dentro não existe tela. Nenhuma máscara é calculada: elas chegam
 * prontas da página, porque montar máscara precisa de canvas.
 */

import { buscarMelhorEncaixe } from "./encaixeMotor";
import { carregarMotorWasm, temMotorWasm } from "./encaixeWasm";
import { carregarEncolhedor, encolherEncaixe, temEncolhedor } from "./encaixeEncolher";

// Só o que a BUSCA precisa. O encaixe-mascara.js não está aqui de propósito:
// máscara é feita na página (e no prepara-worker.js), e aqui dentro ela chega
// pronta. Ele já esteve nesta lista por causa do nfp.js, que saiu.

// O motor em WebAssembly é carregado uma vez, quando o worker nasce. Se não
// der, `encaixarContornoWasm` devolve null e tudo segue em JavaScript.
const motorPronto = carregarMotorWasm();
// O encolhedor (o sparrow) também: é ele que roda a segunda fase. Se não
// subir, o worker diz isso no "pronto" e a segunda fase fica de fora — com o
// motivo no resultado, e não em silêncio (ver encaixeEncolher.js).
const encolhedorPronto = carregarEncolhedor();

let itens = null;      // as peças desta rodada, já com as máscaras
let pararAgora = false;
let fatia = null;

/**
 * A peça vai e volta pelo `postMessage`, então tudo que atravessa tem que ser
 * copiável — e leve. A imagem da peça (um elemento da página) nem copiável é,
 * e as máscaras já estão do lado de cá, então a posição volta com só o
 * endereço da peça: o índice na lista e qual cópia dela é. A página troca isso
 * pela peça de verdade quando recebe.
 */
const enderecoDaPeca = (item) => ({ indice: item.indice, copia: item.copia });

function resultadoParaEnviar(r) {
  return {
    consumo: r.consumo,
    areaReal: r.areaReal,
    receita: r.receita,
    alvo: r.alvo,
    alcancouRecorde: r.alcancouRecorde,
    metaAproveitamento: r.metaAproveitamento,
    alcancouMeta: r.alcancouMeta,
    usouRede: r.usouRede,
    tentativas: r.tentativas,
    paredes: r.paredes,
    decorridoMs: r.decorridoMs,
    venceuContorno: r.venceuContorno,
    venceuFaixas: r.venceuFaixas,
    melhorPorMotor: r.melhorPorMotor,
    ganhos: r.ganhos,
    placar: r.placar,
    naoEncaixadas: r.naoEncaixadas.map(enderecoDaPeca),
    // A máscara vai junto porque é ela que a tela usa para traçar a silhueta.
    // O mesmo objeto de máscara é compartilhado por todas as cópias da peça, e
    // o postMessage preserva isso — atravessa uma vez só, não uma por cópia.
    // A máscara NÃO volta: a página já tem a dela, e remonta a posição a partir
    // da rotação (ver `devolverAsPecas`, em encaixe-paralelo.js). Ela já
    // atravessou de volta aqui, e era o pedaço mais pesado do resultado — dado
    // que a página tinha na mão, clonado de novo por worker. `comMascara`
    // distingue quem encaixou por contorno (tem silhueta) de quem encaixou pela
    // caixa (não tem), que é o que a tela usa para escolher o traço.
    posicoes: r.posicoes.map((p) => ({
      item: enderecoDaPeca(p.item),
      x: p.x, y: p.y,
      largura: p.largura, altura: p.altura,
      rot: p.rot, girado: p.girado,
      comMascara: !!p.mascara, passo: p.passo,
      // A bancada em que a peça caiu. Sem ela de volta, a tela não desenha a
      // linha de corte e o PDF sai numa página só — o encaixe teria respeitado
      // a bancada e ninguém veria.
      bancada: p.bancada || 0,
    })),
  };
}

/*
 * ===========================================================================
 * O DESENHO AO VIVO — mostrar a procura sem atrapalhá-la
 * ===========================================================================
 *
 * A tela deixou de mostrar uma barra de carregamento durante a busca e passou
 * a mostrar o rolo encolhendo. Para isso este worker manda dois tipos de
 * quadro:
 *
 *   recorde    quando o melhor encaixe cai. Seis a vinte por corrida. Vai
 *              sempre, sem estrangulamento: é o quadro que a pessoa espera.
 *
 *   fantasma   uma AMOSTRA do que está sendo tentado agora. O motor chama
 *              isto em TODA tentativa — dezenas de milhares numa corrida —, e
 *              é aqui que a maioria é jogada fora.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O FILTRO MORA AQUI, E NÃO NA TELA
 * ---------------------------------------------------------------------------
 *
 * Porque o que custa não é desenhar: a busca roda neste worker e a thread da
 * tela está ociosa o tempo todo. O que custa é ATRAVESSAR — o `postMessage`
 * serializa o que vai. Filtrar do outro lado seria pagar a serialização
 * inteira e jogar o resultado fora, que é exatamente o custo que roubaria
 * tempo da procura.
 *
 * Duas escolhas fazem a travessia quase de graça:
 *
 *   1. O quadro é um `Float32Array` cru, seis números por peça, e não o
 *      resultado de verdade. Nada de máscara, endereço de peça ou bancada — o
 *      preview desenha silhueta, não o encaixe final. 175 peças dão 4,2 KB.
 *
 *   2. Ele é TRANSFERIDO, não clonado (`postMessage(msg, [buffer])`). O buffer
 *      muda de dono em vez de ser copiado, então o tamanho quase não importa.
 *      Depois da transferência o array fica vazio deste lado — e não há
 *      problema, porque ele nasceu para esta viagem e morre nela.
 */

/** De quanto em quanto tempo ESTE worker deixa passar um fantasma. */
const INTERVALO_DO_FANTASMA_MS = 500;

let ultimoFantasmaEm = 0;

/**
 * Empacota as posições no mínimo que o desenho precisa: x, y, largura, altura,
 * rotação e se a peça está girada. Seis números por peça, num array só.
 */
function quadroDoEncaixe(r) {
  const posicoes = r.posicoes || [];
  const dados = new Float32Array(posicoes.length * 6);
  for (let i = 0; i < posicoes.length; i++) {
    const p = posicoes[i];
    const b = i * 6;
    dados[b] = p.x;
    dados[b + 1] = p.y;
    dados[b + 2] = p.largura;
    dados[b + 3] = p.altura;
    dados[b + 4] = p.rot || 0;
    dados[b + 5] = p.girado ? 1 : 0;
  }
  return dados;
}

function desenhar(especie, r, larguraTecido) {
  if (especie === "fantasma") {
    const agora = Date.now();
    // A conta vem ANTES de tocar no resultado: é o caminho de dezenas de
    // milhares de tentativas por corrida, e a quase totalidade delas sai por
    // aqui sem custar mais que uma subtração.
    if (agora - ultimoFantasmaEm < INTERVALO_DO_FANTASMA_MS) return;
    ultimoFantasmaEm = agora;
  }
  const dados = quadroDoEncaixe(r);
  self.postMessage({
    tipo: "desenho",
    k: fatia ? fatia.k : -1,
    especie,
    consumo: r.consumo,
    larguraTecido,
    // Tentativa que deixou peça de fora gasta menos tecido por não ter
    // encaixado tudo. A tela precisa saber para não anunciar um recorde falso.
    inteiro: !r.naoEncaixadas || r.naoEncaixadas.length === 0,
    pecas: dados,
  }, [dados.buffer]);
}

self.onmessage = async (evento) => {
  const msg = evento.data;

  if (msg.tipo === "preparar") {
    // Espera o WASM antes de dizer que está pronto: assim a primeira busca já
    // pega o motor rápido, em vez de fazer a primeira tentativa em JavaScript.
    await Promise.all([motorPronto, encolhedorPronto]);
    itens = msg.itens;
    // As cópias da mesma peça compartilham o objeto de máscaras do outro lado,
    // e o postMessage manteve esse compartilhamento — nada a refazer aqui.
    //
    // `wasm` diz se o motor rápido subiu. Serve para a tela poder mostrar, e
    // para o teste conseguir provar que o encaixe não caiu no caminho lento
    // sem ninguém perceber. `encolher`, o mesmo para o sparrow.
    self.postMessage({ tipo: "pronto", wasm: temMotorWasm(), encolher: temEncolhedor() });
    return;
  }

  /*
   * A SEGUNDA FASE: encolher o rolo do melhor encaixe da busca.
   *
   * O sparrow roda numa chamada SÍNCRONA que dura o tempo inteiro, então este
   * worker não lê mensagem nenhuma enquanto ela roda — nem o "parar". Por isso
   * cada encaixe válido e mais curto sai daqui na hora (`encolhido`): se a
   * pessoa parar, quem está na página encerra o worker e fica com o último que
   * chegou. A partida vem com o endereço das peças, e a máscara é remontada do
   * lado de cá, como na volta da busca.
   */
  if (msg.tipo === "encolher") {
    const k = msg.k;
    try {
      const porEndereco = new Map(itens.map((item) => [`${item.indice}#${item.copia}`, item]));
      const posicoes = msg.partida.posicoes.map((p) => {
        const item = porEndereco.get(`${p.item.indice}#${p.item.copia}`);
        return { ...p, item, mascara: item && item.mascaras ? item.mascaras.rotacoes[p.rot] : null };
      });
      const partida = { posicoes, naoEncaixadas: [], consumo: msg.partida.consumo };
      const saida = encolherEncaixe(itens, partida, msg.config, {
        tempoMs: msg.config.tempoMs,
        semente: msg.semente,
        trabalhadores: msg.config.trabalhadores,
        partir: msg.config.partir,
        aoMelhorar: (novo) => self.postMessage({ tipo: "encolhido", k, resultado: resultadoParaEnviar(novo) }),
      });
      self.postMessage({
        tipo: "encolheu", k, motivo: saida.motivo,
        relatos: saida.relatos, rejeitados: saida.rejeitados, partiu: saida.partiu,
      });
    } catch (erro) {
      self.postMessage({ tipo: "falhou", k, erro: String((erro && erro.message) || erro) });
    }
    return;
  }

  if (msg.tipo === "parar") {
    pararAgora = true;
    return;
  }

  if (msg.tipo !== "buscar") return;

  pararAgora = false;
  fatia = msg.fatia;

  try {
    const resultado = await buscarMelhorEncaixe(itens, {
      ...msg.config,
      fatia,
      // Quanto esta fatia pula na varredura de posições. Quem decide é o
      // orquestrador: uma fatia varre exato, as outras pulam. Um `saltoX`
      // pedido explicitamente no config vence — é o que deixa medir uma
      // configuração inteira de fora.
      saltoX: msg.config.saltoX != null ? msg.config.saltoX : msg.saltoX,
      // A semente do sorteio desta fatia. Uma semente pedida explicitamente no
      // config vence — é o que deixa medir uma configuração inteira de fora.
      semente: msg.config.semente != null ? msg.config.semente : msg.semente,
      motores: msg.motores || msg.config.motores,
      deveParar: () => pararAgora,
      aoProgredir: (estado) => self.postMessage({ tipo: "andamento", k: fatia.k, estado }),
      aoDesenhar: (especie, r) => desenhar(especie, r, msg.config.larguraTecido),
    });
    self.postMessage({ tipo: "resultado", k: fatia.k, resultado: resultadoParaEnviar(resultado) });
  } catch (erro) {
    self.postMessage({ tipo: "falhou", k: fatia ? fatia.k : -1, erro: String(erro && erro.message || erro) });
  }
};
