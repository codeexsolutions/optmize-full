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

const router = express.Router();

const agora = () => new Date().toISOString();

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

  res.json({ memoria, encaixesDoTipo, encaixesNoTotal, melhorAntes });
});

/** Registra como foi um encaixe: quem ganhou, quem tentou e o resultado. */
router.post("/memoria", (req, res) => {
  const { assinatura, receita, placar, larguraTecido, pecas, consumo, aproveitamento, tentativas } = req.body || {};
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

    db.prepare(`
      INSERT INTO encaixe_historico
        (assinatura, largura_tecido, pecas, consumo, aproveitamento, receita, tentativas, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(assinatura, Number(larguraTecido) || null, Number(pecas) || null,
      Number(consumo) || null, Number(aproveitamento) || null, String(receita),
      Number(tentativas) || null, agora());
  });

  anotar();

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
  const { chave, assinatura, larguraTecido, espaco, margem, consumo,
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
      (chave, assinatura, largura_tecido, espaco, margem, consumo, aproveitamento,
       pecas, posicoes, receita, criado_em, atualizado_em)
    VALUES (@chave, @assinatura, @largura_tecido, @espaco, @margem, @consumo, @aproveitamento,
            @pecas, @posicoes, @receita, @agora, @agora)
    ON CONFLICT(chave) DO UPDATE SET
      consumo = excluded.consumo,
      aproveitamento = excluded.aproveitamento,
      pecas = excluded.pecas,
      posicoes = excluded.posicoes,
      receita = excluded.receita,
      largura_tecido = excluded.largura_tecido,
      espaco = excluded.espaco,
      margem = excluded.margem,
      atualizado_em = excluded.atualizado_em
  `).run({
    chave: String(chave),
    assinatura: String(assinatura || ""),
    largura_tecido: Number(larguraTecido) || null,
    espaco: Number(espaco) || 0,
    margem: Number(margem) || 0,
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
  res.json({ ok: true });
});

module.exports = router;
