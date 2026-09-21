/**
 * A corrida "como a produção": uma busca completa, com as fatias do portfólio
 * uma depois da outra, exatamente como `encaixe-paralelo.js` reparte entre os
 * núcleos.
 *
 * Mora aqui, e não dentro do `medir.js`, porque quem mede o motor deixou de ser
 * um só: a bancada compara UMA configuração com outra, e a varredura
 * (`varredura.js`) mede dezenas delas de uma vez. Duas cópias desta função
 * seriam duas chances de as duas ferramentas medirem coisas diferentes achando
 * que medem a mesma — o mesmo motivo pelo qual `motoresDaFatia` e
 * `fatiaDoPortfolio` vêm do motor, e não são recopiados aqui.
 */

const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

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

// ==================== UMA CORRIDA ====================

/**
 * Prepara as peças de um trabalho uma vez: as máscaras servem para todas as
 * sementes.
 *
 * `ajustes` muda o TRABALHO, e não o motor — é a outra metade do que dá para
 * medir, e a que rendeu mais até agora. Hoje são três:
 *
 *   giros            { "uni-manga": "livre" }, por nome de peça. Medido no
 *                    pedido de produção: liberar o giro da manga vale 6,5% de
 *                    tecido, e liberar o de TODAS vale menos que só o dela.
 *   espaco           a folga entre peças, em cm
 *   larguraTecido    a largura do rolo, em cm
 *
 * Quem varre isso é o `varredura.js`. O `medir.js` chama sem ajuste nenhum, e
 * mede o trabalho como ele está escrito.
 */
function prepararTrabalho(motor, nome, ajustes = {}) {
  const base = TRABALHOS[nome];
  const receita = {
    ...base,
    espaco: ajustes.espaco != null ? ajustes.espaco : base.espaco,
    larguraTecido: ajustes.larguraTecido != null ? ajustes.larguraTecido : base.larguraTecido,
  };
  const giros = ajustes.giros || {};
  const { passo, raio, folgaReal } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
    passo, raio, giro: giros[p.nome] || p.giro || "180", qtd: p.qtd,
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

  /*
   * AS DUAS FASES (`--extra encolher=true`), como a produção roda: a busca de
   * sempre fica com `tempoDaBusca(tempo)` e o sparrow com o resto (ver
   * src/motores/encaixeEncolher.js). O tempo total por fatia é o MESMO da
   * corrida sem a segunda fase — é isso que deixa as duas comparáveis.
   *
   * `encolherBuscaMs` fixa o tempo da busca à mão, para medir a divisão.
   */
  const encolher = extra.encolher === true;
  if (encolher && !motor.comEncolhedor) {
    throw new Error("--extra encolher=true pedido, mas o WASM do encolhedor não carregou"
      + " (rode `npm run build:encolher`). Medir só a busca achando que mediu as duas"
      + " fases é o engano que esta mensagem existe para impedir.");
  }
  const tempoBusca = encolher
    ? Math.min(tempoMs, Number(extra.encolherBuscaMs) || motor.tempoDaBusca(tempoMs))
    : tempoMs;
  const relogioDaBusca = Date.now();

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
    const motoresDaK = motor.motoresDaFatia(k, fatias, motoresPedidos, extra.fatiasVaos);
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
      tempoMaximoMs: tempoBusca,
      msSemGanho: Math.max(800, tempoBusca * 0.25),
      tentativasPorLote: itens.length >= 120 ? 1 : 8,
      /*
       * O corte do portfólio por fatia serve para N fatias dividirem A MESMA
       * lista de receitas. Uma fatia que roda um encaixador só já tem portfólio
       * próprio, disjunto do das outras — cortá-lo de novo deixaria ela com um
       * quinto das receitas dela e quatro quintos de nada.
       */
      fatia: motor.fatiaDoPortfolio(k, fatias, motoresPedidos, extra.fatiasVaos),
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
  const msDaBusca = Date.now() - relogioDaBusca;

  /*
   * A SEGUNDA FASE. Na produção os workers rodam o sparrow ao mesmo tempo, um
   * por semente, cada um com o resto do tempo; aqui as sementes vão uma depois
   * da outra, pelo mesmo motivo que as fatias vão (ver o cabeçalho do
   * medir.js): o tempo de cada uma é o tempo pedido de verdade.
   */
  let encolhimento = null;
  if (encolher) {
    const antes = campeao.consumo;
    const config = {
      larguraTecido: receita.larguraTecido, passo,
      comprimentoBancada: receita.comprimentoBancada || 0,
    };
    let melhorEncolhido = null;
    let relatos = 0;
    let rejeitados = 0;
    let partiu = false;
    const motivos = new Set();
    for (let k = 0; k < fatias; k++) {
      const r = motor.encolherEncaixe(itens, campeao, config, {
        tempoMs: Math.max(0, tempoMs - tempoBusca),
        semente: sementeDaFatia(semente, k, true),
        trabalhadores: extra.encolherTrabalhadores,
        partir: extra.encolherPartir !== false,
      });
      relatos += r.relatos;
      rejeitados += r.rejeitados;
      partiu = partiu || r.partiu;
      if (r.motivo) motivos.add(r.motivo);
      if (r.resultado && (!melhorEncolhido || r.resultado.consumo < melhorEncolhido.consumo)) {
        melhorEncolhido = r.resultado;
      }
    }
    if (melhorEncolhido && melhorEncolhido.consumo < campeao.consumo) {
      campeao = { ...campeao, ...melhorEncolhido, receita: `encolher/${campeao.receita}` };
    }
    encolhimento = { antes, depois: campeao.consumo, relatos, rejeitados, partiu, motivos: [...motivos] };
  }

  // A mídia que o trabalho consome, que com bancada são mesas inteiras e não a
  // tira contínua do `consumo` — ver "A MÍDIA QUE O TRABALHO CONSOME", em
  // src/motores/encaixeMotor.js. Os trabalhos deste catálogo rodam sem bancada,
  // então hoje isto dá exatamente o `consumo`; vem daqui para que o dia em que
  // um trabalho com mesa entrar no catálogo a bancada não meça outra conta que
  // não a da tela.
  const midia = motor.midiaConsumida(campeao.consumo, receita.comprimentoBancada || 0,
    campeao.posicoes);
  const areaTecido = receita.larguraTecido * midia;
  // O encaixe por caixa não devolve `areaReal` — ele nem olha a silhueta. A
  // área real das peças é a mesma seja qual for o encaixador, então ela sai
  // daqui, das próprias peças, e o aproveitamento dos dois vira comparável.
  const areaReal = campeao.posicoes.reduce(
    (soma, p) => soma + (p.item.mascaras ? p.item.mascaras.areaReal : 0), 0);
  return {
    consumo: campeao.consumo,
    midia,
    aproveitamento: areaTecido > 0 ? areaReal / areaTecido : 0,
    sobraram: campeao.naoEncaixadas.length,
    receita: campeao.receita,
    tentativas,
    // O relógio da BUSCA, sem o sparrow: é sobre ele que o ritmo da máquina
    // (tentativas por segundo) é contado — o sparrow não faz tentativas.
    msDaBusca,
    encolhimento,
  };
}

module.exports = {
  FATIAS, FATIAS_EXATAS, PULO_PADRAO, puloDaFatia, PASSO_DA_SEMENTE, sementeDaFatia,
  prepararTrabalho, buscarComoAProducao,
};
