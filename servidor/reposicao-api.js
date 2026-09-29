/**
 * ===========================================================================
 * REPOSIÇÃO — cada trabalho exportado, guardado para refazer peças
 * ===========================================================================
 *
 * Toda vez que um encaixe é EXPORTADO, o trabalho inteiro fica guardado aqui:
 * o nome do arquivo que saiu, a largura do tecido, a metragem, o
 * aproveitamento, uma miniatura do risco e cada peça — com a arte, a medida, a
 * quantidade e o giro. Quem faz isso é o Encaixe, sozinho, logo depois de a
 * exportação dar certo (ver `guardarParaReposicao`, em producao/controlador.js).
 *
 * Para quê: peça que saiu errada, rasgou ou desbotou precisa ser impressa de
 * novo, e montar aquele trabalho do zero para tirar duas peças é o que faz
 * reposição custar caro. Aqui se abre o trabalho, marcam-se as peças que
 * faltam, e elas vão para o Encaixe com a medida certa.
 *
 * As artes ficam em disco (`uploads/reposicao/`), uma por peça, e o banco
 * guarda o resto. Apagar o trabalho apaga as artes junto.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { nomeDeArquivo, pastaDeUploads } = require("./uploads-arquivos");

const router = express.Router();
const agora = () => new Date().toISOString();
const PASTA = pastaDeUploads("reposicao");
const texto = (v, max = 160) => String(v == null ? "" : v).trim().slice(0, max);
const numero = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS reposicao_trabalhos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    largura_tecido REAL,
    consumo_cm REAL,
    aproveitamento REAL,
    folga REAL,
    total_pecas INTEGER NOT NULL DEFAULT 0,
    miniatura TEXT,
    criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reposicao_pecas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabalho_id INTEGER NOT NULL REFERENCES reposicao_trabalhos(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL DEFAULT 0,
    nome TEXT NOT NULL,
    largura REAL NOT NULL,
    altura REAL NOT NULL,
    qtd INTEGER NOT NULL DEFAULT 1,
    giro TEXT,
    arquivo TEXT,
    tipo TEXT,
    miniatura TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_reposicao_pecas_trabalho ON reposicao_pecas(trabalho_id);
`);

const PEGAR_TRABALHO = db.prepare("SELECT * FROM reposicao_trabalhos WHERE id = ?");
const PEGAR_PECA = db.prepare("SELECT * FROM reposicao_pecas WHERE id = ?");

const miniaturaValida = (v) =>
  typeof v === "string" && v.startsWith("data:image/") && v.length < 2_000_000 ? v : null;

function trabalhoParaTela(t) {
  return {
    id: t.id,
    nome: t.nome,
    larguraTecido: t.largura_tecido,
    consumoCm: t.consumo_cm,
    aproveitamento: t.aproveitamento,
    folga: t.folga,
    totalPecas: t.total_pecas,
    miniatura: t.miniatura,
    criadoEm: t.criado_em,
  };
}

function pecaParaTela(p) {
  return {
    id: p.id,
    nome: p.nome,
    largura: p.largura,
    altura: p.altura,
    qtd: p.qtd,
    giro: p.giro,
    miniatura: p.miniatura,
    // Sem arte (o envio dela falhou), a peça aparece mas não vai ao Encaixe.
    url: p.arquivo ? `/api/reposicao/pecas/${p.id}/arte` : null,
  };
}

/** Os trabalhos, do mais novo para o mais antigo, com busca pelo nome. */
router.get("/trabalhos", (req, res) => {
  const termo = texto(req.query.q, 80);
  const linhas = termo
    ? db.prepare(
      `SELECT * FROM reposicao_trabalhos WHERE nome LIKE ? ESCAPE '\\'
        ORDER BY criado_em DESC, id DESC LIMIT 500`,
    ).all(`%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    : db.prepare("SELECT * FROM reposicao_trabalhos ORDER BY criado_em DESC, id DESC LIMIT 500").all();
  res.json({ trabalhos: linhas.map(trabalhoParaTela) });
});

/** Um trabalho, com as peças. */
router.get("/trabalhos/:id", (req, res) => {
  const t = PEGAR_TRABALHO.get(req.params.id);
  if (!t) return res.status(404).json({ error: "Trabalho não encontrado." });
  const pecas = db.prepare("SELECT * FROM reposicao_pecas WHERE trabalho_id = ? ORDER BY ordem, id").all(t.id);
  res.json({ ...trabalhoParaTela(t), pecas: pecas.map(pecaParaTela) });
});

/**
 * Guarda um trabalho exportado: os dados e as peças, sem as artes — elas
 * chegam uma a uma depois (`PUT /pecas/:id/arte`), porque juntas passariam
 * de centenas de MB num pedido só.
 */
router.post("/trabalhos", (req, res) => {
  const corpo = req.body || {};
  const pecas = Array.isArray(corpo.pecas) ? corpo.pecas.slice(0, 500) : [];
  if (pecas.length === 0) return res.status(400).json({ error: "O trabalho veio sem peças." });

  const criar = db.transaction(() => {
    const id = db.prepare(`
      INSERT INTO reposicao_trabalhos
        (nome, largura_tecido, consumo_cm, aproveitamento, folga, total_pecas, miniatura, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      texto(corpo.nome, 200) || `Encaixe de ${new Date().toLocaleDateString("pt-BR")}`,
      numero(corpo.larguraTecido, 1, 10000),
      numero(corpo.consumoCm, 0, 10_000_000),
      numero(corpo.aproveitamento, 0, 100),
      numero(corpo.folga, 0, 1000),
      pecas.reduce((s, p) => s + (Math.round(numero(p.qtd, 0, 100000) || 0)), 0),
      miniaturaValida(corpo.miniatura),
      agora(),
    ).lastInsertRowid;

    const inserir = db.prepare(`
      INSERT INTO reposicao_pecas (trabalho_id, ordem, nome, largura, altura, qtd, giro, miniatura)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const idsDasPecas = pecas.map((p, i) => inserir.run(
      id, i,
      texto(p.nome, 200) || `peça ${i + 1}`,
      numero(p.largura, 0.01, 100000) || 1,
      numero(p.altura, 0.01, 100000) || 1,
      Math.max(1, Math.round(numero(p.qtd, 1, 100000) || 1)),
      ["180", "fixa", "livre"].includes(p.giro) ? p.giro : null,
      miniaturaValida(p.miniatura),
    ).lastInsertRowid);
    return { id, pecas: idsDasPecas };
  });

  res.json(criar());
});

/** A arte de uma peça, em bytes crus. */
router.put("/pecas/:id/arte", express.raw({ limit: "500mb", type: () => true }), (req, res) => {
  const peca = PEGAR_PECA.get(req.params.id);
  if (!peca) return res.status(404).json({ error: "Peça não encontrada." });
  if (!req.body || !req.body.length) return res.status(400).json({ error: "Chegou arte vazia." });

  const tipo = texto(req.get("Content-Type"), 80) || "application/octet-stream";
  const arquivo = nomeDeArquivo("r", "arte");
  fs.writeFileSync(path.join(PASTA, arquivo), req.body);
  if (peca.arquivo) fs.rmSync(path.join(PASTA, peca.arquivo), { force: true });
  db.prepare("UPDATE reposicao_pecas SET arquivo = ?, tipo = ? WHERE id = ?").run(arquivo, tipo, peca.id);
  res.json({ ok: true });
});

router.get("/pecas/:id/arte", (req, res) => {
  const peca = PEGAR_PECA.get(req.params.id);
  if (!peca || !peca.arquivo) return res.status(404).json({ error: "Arte não encontrada." });
  const caminho = path.join(PASTA, peca.arquivo);
  if (!fs.existsSync(caminho)) return res.status(404).json({ error: "O arquivo da arte sumiu do disco." });
  res.type(peca.tipo || "application/octet-stream");
  res.sendFile(caminho);
});

router.patch("/trabalhos/:id", (req, res) => {
  const t = PEGAR_TRABALHO.get(req.params.id);
  if (!t) return res.status(404).json({ error: "Trabalho não encontrado." });
  const nome = texto(req.body && req.body.nome, 200);
  if (!nome) return res.status(400).json({ error: "Dê um nome ao trabalho." });
  db.prepare("UPDATE reposicao_trabalhos SET nome = ? WHERE id = ?").run(nome, t.id);
  res.json(trabalhoParaTela(PEGAR_TRABALHO.get(t.id)));
});

/** Apaga o trabalho e as artes dele. */
router.delete("/trabalhos/:id", (req, res) => {
  const t = PEGAR_TRABALHO.get(req.params.id);
  if (!t) return res.status(404).json({ error: "Trabalho não encontrado." });
  const arquivos = db.prepare("SELECT arquivo FROM reposicao_pecas WHERE trabalho_id = ? AND arquivo IS NOT NULL").all(t.id);
  db.transaction(() => {
    db.prepare("DELETE FROM reposicao_pecas WHERE trabalho_id = ?").run(t.id);
    db.prepare("DELETE FROM reposicao_trabalhos WHERE id = ?").run(t.id);
  })();
  for (const { arquivo } of arquivos) fs.rmSync(path.join(PASTA, arquivo), { force: true });
  res.json({ apagado: t.id });
});

module.exports = router;
