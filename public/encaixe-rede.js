/**
 * Rede neural das receitas: prevê, para um trabalho e uma receita (motor,
 * agrupamento, ordem e critério de posição), a chance dela ganhar a busca.
 *
 * É outra camada de memória além do placar simples que já existe em
 * `encaixe-memoria.js` (usos/vitórias por assinatura exata). O placar só
 * enxerga trabalhos que caem exatamente no mesmo balde de assinatura; a rede
 * generaliza — um trabalho novo, parecido mas não idêntico a nenhum já visto,
 * ainda ganha um palpite razoável, porque ela aprendeu do formato das peças
 * (ocupação, proporção, quantidade), não do balde exato.
 *
 * Sem biblioteca nenhuma: são pesos aprendidos por retropropagação simples,
 * ~200 linhas de JS puro. O motor roda dentro de Web Workers sem acesso a
 * nada de fora, e o instalador embute um Node standalone — trazer TensorFlow
 * ou parecido pesaria dezenas de MB contra os 4,8 KB do encaixe.wasm que já
 * existe, para um problema pequeno o bastante para não precisar disso.
 *
 * Duas pontas usam este arquivo:
 *   - o SERVIDOR treina a rede (retropropagação de verdade, várias épocas)
 *     a partir do histórico salvo em `encaixe_historico` — ver `talvezRetreinar`
 *     em encaixe-memoria.js;
 *   - o NAVEGADOR (e o worker do encaixe) só faz o passe para frente:
 *     recebe os pesos já prontos e pontua as receitas candidatas.
 *
 * Carregado como <script> na página, por importScripts() no worker, e também
 * por require() no servidor — por isso o guard de module.exports no fim.
 * Nada de document/window aqui, pelo mesmo motivo de sempre.
 */

// ==================== O TRABALHO, EM NÚMEROS ====================

/**
 * Resume uma lista de números em média, desvio, mínimo e máximo, PESANDO cada
 * valor pela quantidade de peças que ele representa.
 *
 * O peso é a razão de ser da função. Sem ele, uma linha de 200 camisetas e uma
 * linha de 1 gola contam igual na média — e o que o encaixador vê no rolo são
 * 201 peças, das quais 200 são camiseta. A estatística tem que descrever o
 * TECIDO, não a tabela.
 *
 * Mínimo e máximo não levam peso: o extremo é extremo com uma cópia ou com
 * mil.
 */
function estatisticasPesadas(valores, pesos) {
  if (valores.length === 0) return { media: 0, desvio: 0, min: 0, max: 0 };
  const total = pesos.reduce((s, q) => s + q, 0) || 1;
  const media = valores.reduce((s, v, i) => s + v * pesos[i], 0) / total;
  const variancia = valores.reduce((s, v, i) => s + ((v - media) ** 2) * pesos[i], 0) / total;
  return {
    media, desvio: Math.sqrt(variancia),
    min: Math.min(...valores), max: Math.max(...valores),
  };
}

// 12 números: quantidade, largura do rolo, 4 de ocupação, 4 de proporção, e a
// fração de peças que aceitam girar livre/fixa. A mesma matéria-prima da
// `assinaturaDoTrabalho` (encaixe-motor.js), só que sem arredondar para caber
// num texto de balde — é o que deixa a rede diferenciar trabalhos que a
// assinatura trataria como iguais.
const REDE_DIM_TRABALHO = 12;

/**
 * A VERSÃO DAS FEATURES.
 *
 * `REDE_DIM_ENTRADA` protege contra o vetor mudar de TAMANHO — é o que acontece
 * quando um encaixador ou uma ordem nova entra no vocabulário, e `redeServeAinda`
 * (encaixe-memoria.js) pega isso na hora. Só que ele não pega o caso pior: o
 * vetor continuar do mesmo tamanho e os campos passarem a QUERER DIZER OUTRA
 * COISA. Aí os pesos velhos casam com a entrada nova sem reclamar, e a rede
 * responde com convicção sobre um trabalho que ela nunca viu.
 *
 * Foi exatamente o que aconteceu da versão 1 para a 2: `pecas` sempre foram as
 * LINHAS da tabela, não as cópias. A rede lia "3 peças" num trabalho de 200, e
 * a média de ocupação de um lote de 200 camisetas mais 1 gola saía meio a meio.
 * Os doze números continuaram doze; só o significado de cinco deles mudou.
 *
 * Por isso a versão viaja com o dado: cada linha do histórico grava em qual
 * versão as features dela foram calculadas (`features_versao`, ver db.js), o
 * treino só junta linhas da versão de agora, e os pesos salvos carregam a versão
 * em que nasceram. Mudou o significado de qualquer campo do vetor do trabalho,
 * sobe o número aqui — e o histórico velho para de contaminar o treino sozinho,
 * sem migração e sem apagar nada.
 */
const REDE_VERSAO_FEATURES = 2;

/**
 * `pecas` são as LINHAS da tabela (uma por formato), cada uma com o `qtd` dela.
 * Tudo aqui dentro é contado por CÓPIA, que é o que vai para o rolo.
 */
function vetorDoTrabalho(pecas, larguraTecido) {
  const usadas = pecas.filter((p) => (p.qtd == null ? 1 : Number(p.qtd)) > 0);
  const pesos = usadas.map((p) => (p.qtd == null ? 1 : Number(p.qtd)));
  const total = pesos.reduce((s, q) => s + q, 0) || 1;
  const ocupacoes = usadas.map((p) => (p.ocupacao == null ? 1 : p.ocupacao));
  const proporcoes = usadas.map((p) => Math.log2(p.altura > 0 ? p.largura / p.altura : 1));
  const oc = estatisticasPesadas(ocupacoes, pesos);
  const pr = estatisticasPesadas(proporcoes, pesos);
  const somarSe = (modo) =>
    usadas.reduce((s, p, i) => s + (p.giro === modo ? pesos[i] : 0), 0);

  return [
    // Dividido por 8, e não mais por 6: o número passou a ser de cópias, e o
    // divisor é só a escala que põe o trabalho típico perto de 1 (2^8 = 256
    // peças). Com 6 e contando cópias, um lote grande saía em 1,3 e empurrava
    // a primeira camada para o canto plano da tanh.
    Math.log2(1 + total) / 8,
    Math.min(2, larguraTecido / 300),
    oc.media, oc.desvio, oc.min, oc.max,
    pr.media / 3, pr.desvio / 3,
    Math.max(-1, Math.min(1, pr.min / 3)),
    Math.max(-1, Math.min(1, pr.max / 3)),
    somarSe("livre") / total,
    somarSe("fixa") / total,
  ];
}

// ==================== A RECEITA, EM NÚMEROS ====================

// O vocabulário de cada campo da receita (ver `chaveDaReceita` em
// encaixe-motor.js). Cobre tudo que os quatro encaixadores usam; "corte" (só
// do encaixe por faixas) fica de fora do vocabulário — é um número contínuo
// por trabalho, não uma categoria, e o de faixas já perde na maioria dos
// trabalhos medidos, então não vale a complexidade de representar.
const REDE_MOTORES = ["contorno", "retangulo", "faixas", "vaos"];
const REDE_AGRUPAMENTOS = ["solta", "dupla", "trio", "quarteto", "cruzada", "deitada", "empe"];
// "familia" é a ordem que entra com um formato de peça de cada vez, em bloco
// (ver ORDENS_CONTORNO em encaixe-motor.js).
//
// ACRESCENTAR NOME A QUALQUER UM DESTES QUATRO VOCABULÁRIOS MUDA
// `REDE_DIM_ENTRADA`, e com isso os pesos já treinados que estão no banco
// deixam de servir. Quem cuida disso é o `serve` de `pontuarReceitas` (aqui
// embaixo) e o `redeServeAinda` do encaixe-memoria.js: rede de tamanho
// diferente é ignorada e treinada de novo, em vez de ser alimentada com um
// vetor maior do que ela conhece — o que sairia como palpite sem sentido, e
// não como erro.
const REDE_ORDENS = ["area", "altura", "lado", "largura", "familia"];
const REDE_HEURISTICAS = ["fundo", "vazio", "bl", "bssf", "blsf", "baf", "encosta"];

const REDE_DIM_RECEITA =
  REDE_MOTORES.length + REDE_AGRUPAMENTOS.length + REDE_ORDENS.length + REDE_HEURISTICAS.length;
const REDE_DIM_ENTRADA = REDE_DIM_TRABALHO + REDE_DIM_RECEITA;

function umQuente(valor, vocabulario) {
  return vocabulario.map((v) => (v === valor ? 1 : 0));
}

/** Aceita a chave inteira ("contorno/dupla/area/fundo/") ou já os quatro campos soltos. */
function vetorDaReceita(chaveOuMotor, agrupamento, ordem, heuristica) {
  let motor = chaveOuMotor;
  if (agrupamento === undefined) {
    [motor, agrupamento, ordem, heuristica] = String(chaveOuMotor).split("/");
  }
  return [
    ...umQuente(motor, REDE_MOTORES),
    ...umQuente(agrupamento, REDE_AGRUPAMENTOS),
    ...umQuente(ordem, REDE_ORDENS),
    ...umQuente(heuristica, REDE_HEURISTICAS),
  ];
}

// ==================== A REDE: CAMADAS DENSAS, DE VERDADE ====================

/**
 * Cria uma rede com os tamanhos pedidos, ex.: `[34, 16, 8, 1]` — entrada de
 * 34 números, duas camadas escondidas, uma saída. Pesos pequenos e
 * aleatórios (a escala de Xavier: menos chance de saturar tanh/sigmoide logo
 * de cara), viés começando em zero.
 */
function criarRede(tamanhos) {
  const camadas = [];
  for (let i = 0; i < tamanhos.length - 1; i++) {
    const entrada = tamanhos[i], saida = tamanhos[i + 1];
    const escala = Math.sqrt(2 / (entrada + saida));
    const pesos = Array.from({ length: saida }, () =>
      Array.from({ length: entrada }, () => (Math.random() * 2 - 1) * escala));
    camadas.push({ pesos, vies: new Array(saida).fill(0) });
  }
  return { tamanhos, camadas };
}

const sigmoide = (x) => 1 / (1 + Math.exp(-x));

/**
 * O passe para frente, guardando a ativação de cada camada — é o que o
 * treino precisa para a retropropagação; a previsão pura usa só a última.
 * Todas as camadas escondidas usam tanh; a última usa sigmoide, porque a
 * saída é uma chance (0 a 1).
 */
function passeParaFrente(rede, entrada) {
  const ativacoes = [entrada];
  rede.camadas.forEach((camada, i) => {
    const ehUltima = i === rede.camadas.length - 1;
    const anterior = ativacoes[ativacoes.length - 1];
    const saida = camada.pesos.map((linha, j) => {
      let soma = camada.vies[j];
      for (let k = 0; k < linha.length; k++) soma += linha[k] * anterior[k];
      return ehUltima ? sigmoide(soma) : Math.tanh(soma);
    });
    ativacoes.push(saida);
  });
  return ativacoes;
}

/** A previsão: a chance (0 a 1) desta receita ganhar este trabalho, segundo a rede. */
function prever(rede, entrada) {
  const ativacoes = passeParaFrente(rede, entrada);
  return ativacoes[ativacoes.length - 1][0];
}

/**
 * Um passo de treino sobre UM exemplo: retropropagação com gradiente
 * descendente simples, sem otimizador nenhum por cima — o problema é pequeno
 * o bastante para não precisar.
 *
 * `alvo` é 0 ou 1 (a receita ganhou este trabalho ou não). Como a última
 * camada é sigmoide e o erro é entropia cruzada, o gradiente na pré-ativação
 * da saída simplifica para `saída - alvo` — é a conta clássica, não um atalho
 * arriscado.
 */
function passoDeTreino(rede, entrada, alvo, taxa) {
  const ativacoes = passeParaFrente(rede, entrada);
  const nCamadas = rede.camadas.length;
  let delta = [ativacoes[nCamadas][0] - alvo];

  for (let i = nCamadas - 1; i >= 0; i--) {
    const camada = rede.camadas[i];
    const entradaDaCamada = ativacoes[i];
    const deltaAnterior = new Array(entradaDaCamada.length).fill(0);

    camada.pesos.forEach((linha, j) => {
      const d = delta[j];
      for (let k = 0; k < linha.length; k++) {
        // Acumula o delta da camada anterior com o peso de ANTES de mexer nele.
        deltaAnterior[k] += d * linha[k];
        linha[k] -= taxa * d * entradaDaCamada[k];
      }
      camada.vies[j] -= taxa * d;
    });

    if (i > 0) {
      // A camada anterior usa tanh: a derivada dela, em função da própria
      // ativação (já calculada no passe para frente), é 1 - ativação².
      delta = deltaAnterior.map((d, k) => d * (1 - ativacoes[i][k] ** 2));
    }
  }
}

/**
 * Treina a rede sobre uma lista de exemplos `{ entrada, alvo }`, embaralhando
 * a ordem a cada época — sem isso ela aprenderia um pouco a ordem dos dados,
 * não só o padrão deles.
 */
function treinarRede(rede, exemplos, opcoes = {}) {
  const epocas = opcoes.epocas || 150;
  const taxa = opcoes.taxa || 0.05;
  const sortear = opcoes.sortear || Math.random;

  for (let e = 0; e < epocas; e++) {
    const ordem = exemplos.map((_, i) => i);
    for (let i = ordem.length - 1; i > 0; i--) {
      const j = Math.floor(sortear() * (i + 1));
      const tmp = ordem[i]; ordem[i] = ordem[j]; ordem[j] = tmp;
    }
    ordem.forEach((idx) => passoDeTreino(rede, exemplos[idx].entrada, exemplos[idx].alvo, taxa));
  }
  return rede;
}

/** Pontua um lote de receitas (pelas chaves) de uma vez, para a busca usar. */
function pontuarReceitas(rede, vetorTrabalho, chaves) {
  // Rede treinada com um vocabulário de receita diferente do de agora. Ela não
  // é atualizável — os pesos da primeira camada esperam outra largura de
  // entrada —, então o certo é não ter opinião nenhuma até o servidor treinar
  // de novo. `null` é o mesmo que a busca já recebe quando não há rede.
  if (!rede || !Array.isArray(rede.tamanhos) || rede.tamanhos[0] !== REDE_DIM_ENTRADA) return null;
  // E rede treinada com features de outro significado, ainda que do mesmo
  // tamanho. O servidor já não manda uma dessas (ver `redeServeAinda`), mas a
  // checagem é barata e este é o lugar onde o palpite errado sairia — a busca
  // corta receita com base nele quando a rede está madura.
  if (rede.versaoFeatures !== REDE_VERSAO_FEATURES) return null;

  const pontos = new Map();
  chaves.forEach((chave) => {
    if (pontos.has(chave)) return;
    pontos.set(chave, prever(rede, [...vetorTrabalho, ...vetorDaReceita(chave)]));
  });
  return pontos;
}

// ==================== GUARDAR E CARREGAR OS PESOS ====================

// A versão das features vai junto com os pesos, e não ao lado deles: os pesos
// só querem dizer alguma coisa em cima do vetor que os treinou. Guardados
// juntos, não tem como um chegar sem o outro.
function pesosParaJSON(rede) {
  return JSON.stringify({
    tamanhos: rede.tamanhos, camadas: rede.camadas,
    versaoFeatures: REDE_VERSAO_FEATURES,
  });
}

function redeDoJSON(texto) {
  const dados = JSON.parse(texto);
  // Pesos gravados antes da versão existir são, por definição, da versão 1.
  return {
    tamanhos: dados.tamanhos, camadas: dados.camadas,
    versaoFeatures: dados.versaoFeatures == null ? 1 : dados.versaoFeatures,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    REDE_DIM_TRABALHO, REDE_DIM_RECEITA, REDE_DIM_ENTRADA, REDE_VERSAO_FEATURES,
    REDE_MOTORES, REDE_AGRUPAMENTOS, REDE_ORDENS, REDE_HEURISTICAS,
    vetorDoTrabalho, vetorDaReceita,
    criarRede, prever, treinarRede, pontuarReceitas,
    pesosParaJSON, redeDoJSON,
  };
}
