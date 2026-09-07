/**
 * Memória da tela de Encaixe: o que o sistema aprendeu com os encaixes que já
 * fez.
 *
 * O que fica guardado é qual "receita" (encaixador, agrupamento, ordem e
 * critério de posição) costuma ganhar em cada tipo de trabalho. Na próxima vez,
 * a busca sorteia mais essas receitas e menos as que nunca deram certo — o
 * mesmo tempo de procura rende mais.
 *
 * Não guarda peça, arte nem nome de cliente: só o placar das receitas e um
 * histórico de metragem, para dar para conferir se está melhorando de verdade.
 */

const express = require("express");
const db = require("./db");
const rede = require("./public/encaixe-rede.js");

const router = express.Router();

const agora = () => new Date().toISOString();

// ==================== A REDE DAS RECEITAS ====================
//
// Além do placar por assinatura exata (acima), o servidor treina uma rede
// pequena (ver public/encaixe-rede.js) que generaliza para trabalho parecido,
// não só idêntico. Ver o cabeçalho daquele arquivo para o porquê de ser uma
// rede escrita à mão em vez de uma biblioteca.

// Não vale treinar de novo a cada encaixe salvo — o ganho de um exemplo a
// mais é pequeno e o treino, mesmo rápido, é desperdício. Só retreina quando
// pelo menos essa quantidade de exemplos novos se acumulou desde o último
// treino.
const REDE_RETREINO_A_CADA = 20;
// Abaixo disso nem vale treinar: poucas dezenas de exemplos não bastam pra a
// rede aprender nada melhor que chute.
const REDE_MINIMO_PARA_TREINAR = 30;
// Só a partir daqui a busca confia na rede a ponto de CORTAR receita (ver
// `config.redeMadura` em encaixe-motor.js). Antes disso ela só empurra a
// ordem da primeira passada, do mesmo jeito que o placar por assinatura já
// fazia — nunca tira ninguém da disputa.
const REDE_LIMIAR_MADUREZA = 200;
// Volume sozinho engana: uma loja que repete os mesmos 6 formatos de peça
// pode acumular milhares de exemplos sem a rede nunca ter visto um formato
// diferente. Testado contra o histórico real: com 6 formatos distintos, a
// rede acertou só 4 de 6 ao apontar a receita certa num formato que nunca
// tinha visto — e nos dois erros, pontuou a receita VENCEDORA de verdade
// perto de 0%. Por isso a maturidade também exige um mínimo de formatos
// (assinaturas) diferentes vistos, não só de exemplos. Este número ainda não
// foi calibrado com histórico grande de verdade — é um piso conservador,
// para remedir quando houver dado suficiente para isso valer a pena.
const REDE_LIMIAR_DIVERSIDADE = 20;

/**
 * Reconstrói os exemplos de treino a partir do histórico: um exemplo por
 * (trabalho, receita tentada) — não só a vencedora. Uma receita que foi
 * tentada e perdeu é tão exemplo quanto a que ganhou; sem as perdedoras a
 * rede nunca aprenderia a diferença.
 */
function montarExemplosDeTreino() {
  // Só a versão de features de agora. O filtro é o que faz a virada de versão
  // acontecer sozinha: as linhas velhas continuam no banco, contando a história
  // da metragem, mas param de treinar uma rede que não fala a língua delas.
  const linhas = db.prepare(
    `SELECT features, placar, receita, consumo FROM encaixe_historico
     WHERE features IS NOT NULL AND placar IS NOT NULL AND features_versao = ?`
  ).all(rede.REDE_VERSAO_FEATURES);

  const exemplos = [];
  linhas.forEach((linha) => {
    let features, placar;
    try {
      features = JSON.parse(linha.features);
      placar = JSON.parse(linha.placar);
    } catch (erro) {
      return; // linha antiga ou corrompida: não entra no treino
    }
    if (!Array.isArray(features) || !Array.isArray(placar)) return;

    placar.forEach((p) => {
      if (!p || !p.receita || !(p.tentativas > 0)) return;
      exemplos.push({
        entrada: [...features, ...rede.vetorDaReceita(p.receita)],
        alvo: alvoDaReceita(p, linha.receita, linha.consumo),
      });
    });
  });
  return exemplos;
}

/*
 * ===========================================================================
 * O QUE CONTA COMO "ESTA RECEITA FOI BOA NESTE TRABALHO"
 * ===========================================================================
 *
 * Isto já foi `vitorias > 0`, e estava errado de um jeito que não aparecia: o
 * `vitorias` do placar conta quantas vezes a receita melhorou o melhor da
 * FATIA dela durante a busca — não quantas vezes ela venceu o trabalho. Uma
 * receita que melhorou uma vez logo no começo e foi batida por todas as outras
 * em seguida saía rotulada como vencedora.
 *
 * Medido no histórico de produção: 440 linhas de receita, **141 rotuladas como
 * vencedoras (32%)** — quando só uma por trabalho venceu de verdade, ou seja,
 * 11. A rede estava aprendendo a separar "participou de alguma melhora" de
 * "não participou", que é quase ruído.
 *
 * Agora o rótulo é o que a pergunta pede: a campeã vale 1, e as outras valem o
 * quanto chegaram perto dela. Alvo contínuo, e não sim/não, porque a segunda
 * colocada por 0,3% é informação muito diferente da que ficou 8% atrás — e a
 * saída da rede é uma sigmoide, que aceita alvo fracionário sem mudar nada no
 * treino.
 *
 * Vale para trás: o rótulo é calculado na hora de treinar, a partir do que já
 * está gravado (`receita` é a campeã, `consumo` é o dela). O histórico que já
 * existe passa a treinar certo no próximo retreino, sem migração nenhuma.
 */

// A partir de quanto atrás da campeã a receita vale zero. 5% é bem mais que a
// diferença entre as boas receitas de um mesmo trabalho, então quem passa disso
// realmente não serve para ele.
const ALVO_TOLERANCIA = 0.05;

function alvoDaReceita(linhaDoPlacar, receitaCampea, consumoCampeao) {
  if (linhaDoPlacar.receita === receitaCampea) return 1;
  const meu = Number(linhaDoPlacar.melhorConsumo);
  // Linha gravada antes desta versão não tem `melhorConsumo`. Aí sobra o que dá
  // para saber com certeza: não foi a campeã.
  if (!(meu > 0) || !(Number(consumoCampeao) > 0)) return 0;
  const atras = (meu - consumoCampeao) / consumoCampeao;
  if (atras <= 0) return 1; // empatou com a campeã
  return Math.max(0, 1 - atras / ALVO_TOLERANCIA);
}

/**
 * Treina de novo quando exemplo suficiente se acumulou. Roda dentro do
 * pedido de salvar (POST /memoria) — a rede é pequena e o treino é rápido
 * o bastante para não atrasar a resposta de forma perceptível — mas nunca
 * derruba o salvamento: um erro aqui fica só no console, do mesmo jeito que
 * o resto da memória trata falha (ver a nota no topo do arquivo).
 */
/**
 * Os pesos guardados ainda servem para a rede de hoje?
 *
 * A entrada da rede é o formato do trabalho mais a receita em "um quente" (ver
 * encaixe-rede.js). Acrescentar um nome a qualquer um dos vocabulários —
 * um encaixador novo, um agrupamento novo, uma ordem nova como a "familia" —
 * alarga essa entrada, e os pesos treinados antes passam a esperar um vetor
 * mais curto do que o que chega.
 *
 * Alimentar a rede antiga com o vetor novo não dá erro: dá **palpite sem
 * sentido**, que é bem pior. Então rede de tamanho diferente é tratada como
 * rede que não existe — sai do ar até o próximo treino, que já nasce no
 * tamanho certo.
 */
function redeServeAinda(pesosEmTexto) {
  try {
    const guardada = JSON.parse(pesosEmTexto);
    if (!Array.isArray(guardada.tamanhos) || guardada.tamanhos[0] !== rede.REDE_DIM_ENTRADA) {
      return false;
    }
    // Mesmo tamanho e outro significado é o caso que o tamanho não pega — os
    // pesos casariam com a entrada nova sem reclamar. Pesos sem versão são da
    // 1, de antes de isto existir.
    const versao = guardada.versaoFeatures == null ? 1 : guardada.versaoFeatures;
    return versao === rede.REDE_VERSAO_FEATURES;
  } catch (erro) {
    console.warn("[encaixe] pesos da rede ilegíveis, vão ser treinados de novo:", erro && erro.message);
    return false;
  }
}

function talvezRetreinar() {
  const exemplos = montarExemplosDeTreino();
  if (exemplos.length < REDE_MINIMO_PARA_TREINAR) return;

  const linhaAtual = db.prepare("SELECT pesos, exemplos FROM encaixe_rede_pesos WHERE id = 1").get();
  // Rede do tamanho errado tem que ser refeita agora, sem esperar o próximo
  // lote de exemplos: enquanto ela não for, a busca fica sem palpite nenhum.
  const precisaRefazer = linhaAtual != null && !redeServeAinda(linhaAtual.pesos);
  const exemplosAntes = linhaAtual ? linhaAtual.exemplos : 0;
  if (!precisaRefazer && exemplos.length - exemplosAntes < REDE_RETREINO_A_CADA) return;

  const nova = rede.criarRede([rede.REDE_DIM_ENTRADA, 16, 8, 1]);
  rede.treinarRede(nova, exemplos, { epocas: 150, taxa: 0.05 });

  db.prepare(`
    INSERT INTO encaixe_rede_pesos (id, pesos, exemplos, atualizado_em)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pesos = excluded.pesos, exemplos = excluded.exemplos, atualizado_em = excluded.atualizado_em
  `).run(rede.pesosParaJSON(nova), exemplos.length, agora());
}

/**
 * O que já se sabe sobre um tipo de trabalho.
 *
 * Vem em duas camadas: o placar deste tipo específico e o placar geral de todos
 * os encaixes. A camada geral é o que evita começar no zero quando um formato
 * de peça aparece pela primeira vez.
 */
router.get("/memoria", (req, res) => {
  const assinatura = String(req.query.assinatura || "");

  const doTipo = db.prepare(
    "SELECT receita, usos, vitorias FROM encaixe_receitas WHERE assinatura = ?").all(assinatura);
  const geral = db.prepare(
    "SELECT receita, SUM(usos) AS usos, SUM(vitorias) AS vitorias FROM encaixe_receitas GROUP BY receita").all();

  // O tipo específico pesa mais que o geral, mas o geral não é ignorado: com
  // poucos encaixes daquele tipo, ele é quem sustenta o palpite.
  const memoria = {};
  geral.forEach((linha) => {
    memoria[linha.receita] = { usos: linha.usos, vitorias: linha.vitorias * 0.4 };
  });
  doTipo.forEach((linha) => {
    const antes = memoria[linha.receita] || { usos: 0, vitorias: 0 };
    memoria[linha.receita] = {
      usos: antes.usos + linha.usos * 2,
      vitorias: antes.vitorias + linha.vitorias * 2,
    };
  });

  const encaixesDoTipo = db.prepare(
    "SELECT COUNT(*) AS total FROM encaixe_historico WHERE assinatura = ?").get(assinatura).total;
  const encaixesNoTotal = db.prepare("SELECT COUNT(*) AS total FROM encaixe_historico").get().total;
  const melhorAntes = db.prepare(
    "SELECT MIN(consumo) AS melhor FROM encaixe_historico WHERE assinatura = ?").get(assinatura).melhor;

  const pesosDaRede = db.prepare("SELECT pesos, exemplos FROM encaixe_rede_pesos WHERE id = 1").get();
  // Pesos de um vocabulário antigo não vão para a tela: ver `redeServeAinda`.
  const redeUtil = pesosDaRede && redeServeAinda(pesosDaRede.pesos) ? pesosDaRede : null;
  // Diversidade, não só volume — ver a nota em REDE_LIMIAR_DIVERSIDADE.
  // Só conta o que a rede de hoje consegue aprender: linha de versão antiga não
  // treina nada, então ela também não pode contar como formato já visto.
  const diversidadeDeFormatos = db.prepare(
    `SELECT COUNT(DISTINCT assinatura) AS n FROM encaixe_historico
     WHERE features IS NOT NULL AND placar IS NOT NULL AND features_versao = ?`
  ).get(rede.REDE_VERSAO_FEATURES).n;

  res.json({
    memoria, encaixesDoTipo, encaixesNoTotal, melhorAntes,
    // `rede` já vem como o objeto pronto (não a string), para a tela só
    // repassar para o motor sem ter que saber o formato interno dela.
    rede: redeUtil ? JSON.parse(redeUtil.pesos) : null,
    redeExemplos: redeUtil ? redeUtil.exemplos : 0,
    redeFormatosDistintos: diversidadeDeFormatos,
    redeMadura: redeUtil
      ? (redeUtil.exemplos >= REDE_LIMIAR_MADUREZA && diversidadeDeFormatos >= REDE_LIMIAR_DIVERSIDADE)
      : false,
  });
});

/** Registra como foi um encaixe: quem ganhou, quem tentou e o resultado. */
router.post("/memoria", (req, res) => {
  const { assinatura, receita, placar, larguraTecido, pecas, consumo, aproveitamento, tentativas,
    features, featuresVersao } = req.body || {};
  if (!assinatura || !receita) {
    return res.status(400).json({ error: "Faltou a assinatura ou a receita vencedora." });
  }

  const anotar = db.transaction(() => {
    const guardar = db.prepare(`
      INSERT INTO encaixe_receitas (assinatura, receita, usos, vitorias, atualizado_em)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(assinatura, receita) DO UPDATE SET
        usos = usos + excluded.usos,
        vitorias = vitorias + excluded.vitorias,
        atualizado_em = excluded.atualizado_em
    `);

    // "Vitória" é ter sido a receita que entregou o melhor encaixe da vez.
    // Uma receita que só tentou muito não sobe no placar por isso.
    (Array.isArray(placar) ? placar : []).forEach((linha) => {
      if (!linha || !linha.receita) return;
      guardar.run(assinatura, String(linha.receita), 1, linha.receita === receita ? 1 : 0, agora());
    });
    if (!Array.isArray(placar) || placar.length === 0) {
      guardar.run(assinatura, String(receita), 1, 1, agora());
    }

    // A versão vem de quem CALCULOU o vetor (a tela), e não do que o servidor
    // acha que é a versão de agora: os dois sobem juntos, mas a página fica em
    // cache no navegador, e uma aba aberta desde antes da atualização mandaria
    // vetor velho com carimbo novo. Sem o campo, é a 1.
    const versao = Number(featuresVersao) > 0 ? Number(featuresVersao) : 1;
    db.prepare(`
      INSERT INTO encaixe_historico
        (assinatura, largura_tecido, pecas, consumo, aproveitamento, receita, tentativas, criado_em,
         features, placar, features_versao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(assinatura, Number(larguraTecido) || null, Number(pecas) || null,
      Number(consumo) || null, Number(aproveitamento) || null, String(receita),
      Number(tentativas) || null, agora(),
      Array.isArray(features) ? JSON.stringify(features) : null,
      Array.isArray(placar) && placar.length > 0 ? JSON.stringify(placar) : null,
      Array.isArray(features) ? versao : null);
  });

  anotar();

  // A rede é um acelerador, não um requisito — a mesma regra do resto da
  // memória (ver a nota no topo do arquivo): um treino que falhasse não pode
  // derrubar o registro do encaixe que já foi salvo.
  try { talvezRetreinar(); } catch (erro) { console.warn("[encaixe] retreino da rede falhou:", erro); }

  const encaixesDoTipo = db.prepare(
    "SELECT COUNT(*) AS total FROM encaixe_historico WHERE assinatura = ?").get(assinatura).total;
  res.json({ ok: true, encaixesDoTipo });
});

// ==================== O MELHOR ENCAIXE JÁ CONSEGUIDO ====================

/**
 * Guardar o número do recorde não bastava.
 *
 * A busca é sorteada: ela acha um encaixe muito bom numa rodada e, na
 * seguinte, pode não chegar lá de novo. Como só a metragem ficava anotada, o
 * encaixe bom era desenhado uma vez e sumia — a rodada pior tomava o lugar
 * dele na tela e não havia como voltar. Aqui fica o encaixe inteiro, peça por
 * peça, para poder ser trazido de volta com um clique.
 */

router.get("/guardado", (req, res) => {
  const chave = String(req.query.chave || "");
  if (!chave) return res.status(400).json({ error: "Faltou a chave do trabalho." });

  const linha = db.prepare("SELECT * FROM encaixe_guardados WHERE chave = ?").get(chave);
  if (!linha) return res.json({ guardado: null });

  res.json({
    guardado: {
      ...linha,
      pecas: linha.pecas ? JSON.parse(linha.pecas) : null,
      posicoes: JSON.parse(linha.posicoes),
    },
  });
});

/** Guarda o encaixe — mas só se ele for melhor que o que já estava lá. */
router.post("/guardado", (req, res) => {
  const { chave, assinatura, larguraTecido, espaco, comprimentoBancada, consumo,
    aproveitamento, pecas, posicoes, receita } = req.body || {};

  if (!chave || !Array.isArray(posicoes) || posicoes.length === 0 || !(Number(consumo) > 0)) {
    return res.status(400).json({ error: "Faltou a chave, o consumo ou as posições." });
  }

  const antes = db.prepare("SELECT consumo FROM encaixe_guardados WHERE chave = ?").get(chave);
  // Empate não troca: o encaixe que já estava guardado é o que a produção já
  // pode ter olhado, e trocar por outro igual só confunde.
  if (antes && antes.consumo <= Number(consumo)) {
    return res.json({ guardado: false, melhorGuardado: antes.consumo });
  }

  db.prepare(`
    INSERT INTO encaixe_guardados
      (chave, assinatura, largura_tecido, espaco, comprimento_bancada, consumo, aproveitamento,
       pecas, posicoes, receita, criado_em, atualizado_em)
    VALUES (@chave, @assinatura, @largura_tecido, @espaco, @comprimento_bancada, @consumo, @aproveitamento,
            @pecas, @posicoes, @receita, @agora, @agora)
    ON CONFLICT(chave) DO UPDATE SET
      consumo = excluded.consumo,
      aproveitamento = excluded.aproveitamento,
      pecas = excluded.pecas,
      posicoes = excluded.posicoes,
      receita = excluded.receita,
      largura_tecido = excluded.largura_tecido,
      espaco = excluded.espaco,
      comprimento_bancada = excluded.comprimento_bancada,
      atualizado_em = excluded.atualizado_em
  `).run({
    chave: String(chave),
    assinatura: String(assinatura || ""),
    largura_tecido: Number(larguraTecido) || null,
    espaco: Number(espaco) || 0,
    comprimento_bancada: Number(comprimentoBancada) || 0,
    consumo: Number(consumo),
    aproveitamento: Number(aproveitamento) || null,
    pecas: pecas ? JSON.stringify(pecas) : null,
    posicoes: JSON.stringify(posicoes),
    receita: String(receita || ""),
    agora: agora(),
  });

  res.json({ guardado: true, melhorGuardado: Number(consumo) });
});

/** Apaga o que foi aprendido, para começar do zero. */
router.delete("/memoria", (req, res) => {
  db.prepare("DELETE FROM encaixe_receitas").run();
  db.prepare("DELETE FROM encaixe_historico").run();
  db.prepare("DELETE FROM encaixe_guardados").run();
  db.prepare("DELETE FROM encaixe_rede_pesos").run();
  res.json({ ok: true });
});

module.exports = router;
