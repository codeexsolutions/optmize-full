/**
 * ===========================================================================
 * O RELATÓRIO DO ENCAIXE — contorno contra quadrado, num período
 * ===========================================================================
 *
 * Cada encaixe feito já fica no `encaixe_historico` com a metragem PELO
 * CONTORNO (a que o Optmize entregou). O relatório põe ao lado quanto o mesmo
 * trabalho gastaria PELO QUADRADO — cada peça ocupando o retângulo inteiro dela,
 * como encaixa quem não lê o contorno — e a diferença é o tecido economizado.
 *
 * ---------------------------------------------------------------------------
 * COMO O QUADRADO É CONTADO — e por que ele erra sempre para MAIS
 * ---------------------------------------------------------------------------
 *
 * Pedido do dono (2026-11-10): o quadrado sempre para mais, o contorno sempre
 * o menor. Então a conta é a de quem arruma retângulos em FILEIRAS no rolo
 * (NFDH: as peças da mais alta para a mais baixa, lado a lado até a largura
 * acabar, e a fileira seguinte começa na altura da mais alta da anterior):
 *
 *   - cada peça vira largura × altura, mais a folga pedida em cada eixo;
 *   - a peça entra como veio (o mesmo lado certo do encaixe); só deita se
 *     em pé não couber na largura do rolo;
 *   - o total é arredondado PARA CIMA, de 10 em 10 cm;
 *   - e nunca sai menor que o contorno do mesmo trabalho.
 *
 * Fileira é o que um operador faz à mão no Corel, e não o melhor arranjo de
 * retângulos possível — é de propósito: o número é uma referência honesta do
 * "como seria", e não um concorrente otimizado.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VÊM AS MEDIDAS
 * ---------------------------------------------------------------------------
 *
 * Encaixe novo: a tela manda as medidas das peças junto com o resultado, e o
 * quadrado é gravado na hora (`consumo_quadrado`). Encaixe de antes desta
 * versão: o quadrado é refeito com as peças do `encaixe_guardados` do mesmo
 * trabalho (mesma assinatura e mesma metragem). Sem isso, a linha aparece sem
 * o quadrado — melhor um traço do que um número inventado.
 */

const express = require("express");
const db = require("./db");

const router = express.Router();

// A conta do quadrado mora num arquivo só, o mesmo que a tela usa.
const { consumoNoQuadrado, quadradoParaComparar } = require("../src/motores/consumoNoQuadrado.mjs");

/**
 * As medidas a partir das peças guardadas (`pecasParaGuardar`, na tela):
 * cada peça é um texto "id~largura~altura~quantidade~giro~...".
 */
function medidasDasPecasGuardadas(pecasEmTexto) {
  try {
    const lista = JSON.parse(pecasEmTexto);
    if (!Array.isArray(lista)) return null;
    const medidas = lista.map((texto) => {
      const partes = String(texto).split("~");
      return [Number(partes[1]), Number(partes[2]), Number(partes[3])];
    }).filter((m) => m[0] > 0 && m[1] > 0 && m[2] > 0);
    return medidas.length ? medidas : null;
  } catch {
    return null;
  }
}

/** "AAAA-MM-DD" no fuso desta máquina → o instante em ISO (UTC). */
function inicioDoDia(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString();
}

function proximoDia(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).toISOString();
}

/*
 * ---------------------------------------------------------------------------
 * O QUE ENTRA NA CONTA: o que foi EXPORTADO, uma vez por pedido
 * ---------------------------------------------------------------------------
 *
 * Pedido do dono (2026-11-11): o relatório contava cada BUSCA, e quem roda o
 * encaixe mais de uma vez — ou exporta o mesmo pedido duas vezes sem querer,
 * como aconteceu com um pedido de cliente — via o mesmo trabalho contado em
 * dobro. Agora cada exportação é anotada em `encaixe_exportacoes`, com o nome
 * do arquivo que a pessoa salvou, e o relatório conta:
 *
 *   - só o que saiu em arquivo (busca que ninguém exportou não é trabalho);
 *   - o mesmo encaixe exportado de novo (PNG e PDF, ou o PDF duas vezes) uma
 *     vez só;
 *   - o mesmo NOME de pedido uma vez só no período — fica a exportação mais
 *     recente, e a linha diz quantas vezes ele saiu.
 *
 * A ligação com a busca (`historico_id`) vem da tela; exportação de antes
 * desta versão, que só ficou na Reposição, é ligada à busca parecida (mesma
 * largura, mesmas peças, a metragem mais perto, até 12 h antes).
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS encaixe_exportacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabalho_id INTEGER UNIQUE,
    historico_id INTEGER,
    nome TEXT NOT NULL,
    largura_tecido REAL,
    consumo REAL,
    pecas INTEGER,
    criado_em TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_encaixe_exportacoes_criado ON encaixe_exportacoes (criado_em);
`);

const DOZE_HORAS = 12 * 60 * 60 * 1000;

function buscaParecida({ larguraTecido, consumoCm, pecas, quando }) {
  const ate = String(quando);
  const instante = new Date(ate).getTime();
  if (!Number.isFinite(instante)) return null;
  const desde = new Date(instante - DOZE_HORAS).toISOString();
  const largura = Number(larguraTecido) || null;
  const total = Number(pecas) || null;
  return db.prepare(`
    SELECT id FROM encaixe_historico
     WHERE consumo > 0 AND criado_em <= ? AND criado_em >= ?
       AND (? IS NULL OR largura_tecido IS NULL OR ABS(largura_tecido - ?) < 0.5)
       AND (? IS NULL OR pecas IS NULL OR pecas = ?)
     ORDER BY ABS(consumo - ?) ASC, criado_em DESC
     LIMIT 1
  `).get(ate, desde, largura, largura, total, total, Number(consumoCm) || 0) || null;
}

/**
 * Anota uma exportação (chamada pela Reposição, que recebe todo encaixe
 * exportado). Nunca derruba quem chamou: falhou, fica no console.
 */
function anotarExportacao({ trabalhoId, historicoId, nome, larguraTecido, consumoCm, pecas, quando }) {
  try {
    let historico = null;
    if (Number(historicoId) > 0) {
      historico = db.prepare("SELECT id FROM encaixe_historico WHERE id = ?").get(Number(historicoId)) || null;
    }
    if (!historico) historico = buscaParecida({ larguraTecido, consumoCm, pecas, quando });
    db.prepare(`
      INSERT OR IGNORE INTO encaixe_exportacoes
        (trabalho_id, historico_id, nome, largura_tecido, consumo, pecas, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(trabalhoId ?? null, historico ? historico.id : null, String(nome || "Sem nome"),
      Number(larguraTecido) || null, Number(consumoCm) || null, Number(pecas) || null, String(quando));
  } catch (erro) {
    console.warn("[relatório] a exportação não foi anotada:", erro);
  }
}

/** As exportações de antes desta versão: estão na Reposição, sem a anotação. */
function anotarExportacoesAntigas() {
  let faltam = [];
  try {
    faltam = db.prepare(`
      SELECT t.id, t.nome, t.largura_tecido, t.consumo_cm, t.total_pecas, t.criado_em
        FROM reposicao_trabalhos t
       WHERE NOT EXISTS (SELECT 1 FROM encaixe_exportacoes e WHERE e.trabalho_id = t.id)
    `).all();
  } catch {
    return; // a Reposição ainda não criou a tabela dela
  }
  for (const t of faltam) {
    anotarExportacao({
      trabalhoId: t.id, nome: t.nome, larguraTecido: t.largura_tecido,
      consumoCm: t.consumo_cm, pecas: t.total_pecas, quando: t.criado_em,
    });
  }
}

/**
 * A chave do pedido: o nome sem a extensão, sem o "(1)" que a caixa de salvar
 * põe na segunda cópia, sem "- Cópia", sem acento, caixa ou espaço sobrando.
 */
function chaveDoNome(nome) {
  return String(nome || "")
    .replace(/\.(pdf|png)$/i, "")
    .replace(/\s*-\s*c[oó]pia(\s*\(\d+\))?\s*$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A impressão digital de uma exportação: largura do rolo, metragem ao
 * milímetro e peças. `null` quando falta qualquer um dos três — sem os três,
 * dois pedidos diferentes poderiam colidir.
 */
function impressaoDigital(e) {
  const ligada = e.historico_id != null && e.consumo > 0;
  const largura = Number((ligada && e.largura_tecido) || e.e_largura);
  const consumo = Number(ligada ? e.consumo : e.e_consumo);
  const pecas = Number((ligada && e.pecas) || e.e_pecas);
  if (!(largura > 0) || !(consumo > 0) || !(pecas > 0)) return null;
  return `${Math.round(largura * 10)}|${Math.round(consumo * 10)}|${pecas}`;
}

/**
 * GET /api/encaixe/relatorio?de=AAAA-MM-DD&ate=AAAA-MM-DD
 *
 * Os dois dias entram inteiros, no fuso da máquina, pela hora da exportação.
 * Sem datas: do dia 1 do mês até hoje.
 */
router.get("/relatorio", (req, res) => {
  const hoje = new Date();
  const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const de = String(req.query.de || dia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const ate = String(req.query.ate || dia(hoje));
  const desde = inicioDoDia(de);
  const antesDe = proximoDia(ate);
  if (!desde || !antesDe || desde >= antesDe) {
    return res.status(400).json({ error: "Período inválido." });
  }

  anotarExportacoesAntigas();

  const exportacoes = db.prepare(`
    SELECT e.id, e.nome, e.criado_em, e.historico_id,
           e.largura_tecido AS e_largura, e.consumo AS e_consumo, e.pecas AS e_pecas,
           h.assinatura, h.largura_tecido, h.pecas, h.consumo, h.aproveitamento,
           h.consumo_quadrado
      FROM encaixe_exportacoes e
      LEFT JOIN encaixe_historico h ON h.id = e.historico_id
     WHERE e.criado_em >= ? AND e.criado_em < ?
     ORDER BY e.criado_em DESC, e.id DESC
  `).all(desde, antesDe);

  // Uma linha por pedido: a exportação mais recente fica, as outras só somam
  // no "saiu N vezes". O mesmo encaixe exportado de novo cai na mesma linha
  // mesmo com outro nome.
  //
  // A IMPRESSÃO DIGITAL (2026-11-12): quem roda o encaixe de novo gera OUTRA
  // busca (outro `historico_id`) e pode salvar com OUTRO nome — e o mesmo
  // trabalho passava duas vezes. Mesma largura de rolo, mesma metragem (ao
  // milímetro) e mesmo número de peças é o mesmo trabalho.
  const porChave = new Map();
  const unicas = [];
  for (const e of exportacoes) {
    const chaves = [`n:${chaveDoNome(e.nome)}`];
    if (e.historico_id) chaves.push(`h:${e.historico_id}`);
    const digital = impressaoDigital(e);
    if (digital) chaves.push(`f:${digital}`);
    const ja = chaves.map((c) => porChave.get(c)).find(Boolean);
    if (ja) {
      ja.vezes += 1;
      chaves.forEach((c) => porChave.set(c, ja));
      continue;
    }
    const linha = { e, vezes: 1 };
    chaves.forEach((c) => porChave.set(c, linha));
    unicas.push(linha);
  }

  // Para as buscas de antes da versão do quadrado: as peças do trabalho
  // guardado com a mesma assinatura e a mesma metragem.
  const guardado = db.prepare(`
    SELECT pecas, espaco, largura_tecido FROM encaixe_guardados
     WHERE assinatura = ? AND ABS(consumo - ?) < 0.01
     LIMIT 1
  `);

  const saida = unicas.map(({ e, vezes }) => {
    const ligada = e.historico_id != null && e.consumo > 0;
    const contorno = ligada ? e.consumo : e.e_consumo;
    const largura = (ligada && e.largura_tecido) || e.e_largura;
    let quadrado = ligada && e.consumo_quadrado > 0 ? e.consumo_quadrado : null;
    if (quadrado === null && ligada) {
      const g = guardado.get(e.assinatura, e.consumo);
      const medidas = g && medidasDasPecasGuardadas(g.pecas);
      if (medidas) quadrado = consumoNoQuadrado(medidas, largura || g.largura_tecido, g.espaco);
    }
    // O contorno nunca perde para o quadrado: se a conta das fileiras sair
    // menor (peça muito comprida, por exemplo), o quadrado fica no contorno.
    quadrado = contorno > 0 ? quadradoParaComparar(quadrado, contorno) : null;
    return {
      id: e.id,
      nome: String(e.nome || "").replace(/\.(pdf|png)$/i, ""),
      vezes,
      quando: e.criado_em,
      pecas: (ligada && e.pecas) || e.e_pecas,
      larguraTecido: largura || null,
      contornoCm: contorno || 0,
      quadradoCm: quadrado,
      economiaCm: quadrado === null ? null : quadrado - contorno,
      aproveitamento: ligada ? e.aproveitamento : null,
    };
  });

  const comQuadrado = saida.filter((l) => l.quadradoCm !== null);
  const soma = (lista, campo) => lista.reduce((t, l) => t + (l[campo] || 0), 0);
  const contornoComparavel = soma(comQuadrado, "contornoCm");
  const quadrado = soma(comQuadrado, "quadradoCm");
  res.json({
    de,
    ate,
    encaixes: saida.length,
    repetidos: exportacoes.length - saida.length,
    totais: {
      contornoCm: soma(saida, "contornoCm"),
      pecas: soma(saida, "pecas"),
      // A economia só soma as linhas que têm os dois números: comparar o
      // contorno de vinte encaixes com o quadrado de quinze inflaria a conta.
      comparaveis: comQuadrado.length,
      contornoComparavelCm: contornoComparavel,
      quadradoCm: quadrado,
      economiaCm: quadrado - contornoComparavel,
      economiaPercentual: quadrado > 0 ? ((quadrado - contornoComparavel) / quadrado) * 100 : null,
    },
    linhas: saida,
  });
});

module.exports = router;
module.exports.consumoNoQuadrado = consumoNoQuadrado;
module.exports.medidasDasPecasGuardadas = medidasDasPecasGuardadas;
module.exports.anotarExportacao = anotarExportacao;
module.exports.chaveDoNome = chaveDoNome;
module.exports.impressaoDigital = impressaoDigital;
