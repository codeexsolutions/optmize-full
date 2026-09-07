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

// Só o que a BUSCA precisa. O encaixe-mascara.js não está aqui de propósito:
// máscara é feita na página (e no prepara-worker.js), e aqui dentro ela chega
// pronta. Ele já esteve nesta lista por causa do nfp.js, que saiu.
importScripts("geometria.js", "encaixe-giro.js", "encaixe-rede.js",
  "encaixe-wasm.js", "encaixe-motor.js");

// O motor em WebAssembly é carregado uma vez, quando o worker nasce. Se não
// der, `encaixarContornoWasm` devolve null e tudo segue em JavaScript.
const motorPronto = carregarMotorWasm();

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

self.onmessage = async (evento) => {
  const msg = evento.data;

  if (msg.tipo === "preparar") {
    // Espera o WASM antes de dizer que está pronto: assim a primeira busca já
    // pega o motor rápido, em vez de fazer a primeira tentativa em JavaScript.
    await motorPronto;
    itens = msg.itens;
    // As cópias da mesma peça compartilham o objeto de máscaras do outro lado,
    // e o postMessage manteve esse compartilhamento — nada a refazer aqui.
    //
    // `wasm` diz se o motor rápido subiu. Serve para a tela poder mostrar, e
    // para o teste conseguir provar que o encaixe não caiu no caminho lento
    // sem ninguém perceber.
    self.postMessage({ tipo: "pronto", wasm: temMotorWasm() });
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
    });
    self.postMessage({ tipo: "resultado", k: fatia.k, resultado: resultadoParaEnviar(resultado) });
  } catch (erro) {
    self.postMessage({ tipo: "falhou", k: fatia ? fatia.k : -1, erro: String(erro && erro.message || erro) });
  }
};
