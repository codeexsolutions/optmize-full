/**
 * Biblioteca de moldes.
 *
 * O desenho é feito fora — CorelDRAW, Audaces, o que a pessoa usar — e mandado
 * para cá em DXF, PLT ou PDF. O que o sistema guarda é o **contorno em
 * centímetros** de cada peça, junto com o que ela é (frente, costas, manga
 * direita...), quantas vão em cada peça pronta e em que tamanho.
 *
 * Guardar geometria, e não uma imagem, é o que faz o molde continuar exato:
 * ele volta na tela, vai para o encaixe e sai em PDF sempre na medida certa,
 * sem depender de resolução.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const {
  extensaoDaImagem, nomeDeArquivo, limparImagensSoltas, pastaDeUploads,
} = require("./uploads-arquivos");

const router = express.Router();
const agora = () => new Date().toISOString();

/** Papéis conhecidos. "outro" aceita qualquer nome escrito à mão. */
const PAPEIS = [
  "frente", "costas", "manga direita", "manga esquerda", "manga",
  "gola", "punho", "cós", "bolso", "vista", "forro", "outro",
];

function pecasDoMolde(moldeId) {
  return db.prepare("SELECT * FROM molde_pecas WHERE molde_id = ? ORDER BY ordem, id").all(moldeId)
    .map((p) => ({
      ...p,
      contorno: JSON.parse(p.contorno),
      furos: p.furos ? JSON.parse(p.furos) : [],
    }));
}

/** Confere e limpa uma peça que chegou da tela. */
function arrumarPeca(bruta, ordem) {
  const contorno = Array.isArray(bruta && bruta.contorno) ? bruta.contorno : null;
  if (!contorno || contorno.length < 3) return null;

  const pontos = contorno
    .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pontos.length < 3) return null;

  const furos = (Array.isArray(bruta.furos) ? bruta.furos : [])
    .map((f) => (Array.isArray(f) ? f.map((p) => ({ x: Number(p.x), y: Number(p.y) })) : []))
    .filter((f) => f.length >= 3);

  const papel = String(bruta.papel || "outro").trim().toLowerCase();
  return {
    tamanho: String(bruta.tamanho || "único").trim() || "único",
    papel: papel || "outro",
    nome: String(bruta.nome || "").trim() || null,
    quantidade: Math.max(1, Math.floor(Number(bruta.quantidade) || 1)),
    largura: Number(bruta.largura) || 0,
    altura: Number(bruta.altura) || 0,
    contorno: JSON.stringify(pontos),
    furos: furos.length > 0 ? JSON.stringify(furos) : null,
    origem: String(bruta.origem || "").trim() || null,
    ordem,
  };
}

router.get("/papeis", (req, res) => res.json({ papeis: PAPEIS }));

/** Lista resumida, para a tela mostrar a estante de moldes. */
router.get("/", (req, res) => {
  const moldes = db.prepare("SELECT * FROM moldes ORDER BY nome").all();
  const resumo = moldes.map((m) => {
    const pecas = db.prepare(
      "SELECT tamanho, papel, quantidade FROM molde_pecas WHERE molde_id = ?").all(m.id);
    const tamanhos = [...new Set(pecas.map((p) => p.tamanho))];
    return {
      ...m,
      tamanhos,
      totalPecas: pecas.length,
      // Quantas peças de tecido saem de uma peça pronta, num tamanho só.
      pecasPorUnidade: pecas
        .filter((p) => p.tamanho === tamanhos[0])
        .reduce((soma, p) => soma + p.quantidade, 0),
    };
  });
  res.json(resumo);
});

router.get("/:id", (req, res) => {
  const molde = db.prepare("SELECT * FROM moldes WHERE id = ?").get(req.params.id);
  if (!molde) return res.status(404).json({ error: "Molde não encontrado." });
  res.json({ ...molde, pecas: pecasDoMolde(molde.id), artes: artesDoMolde(molde.id) });
});

router.post("/", (req, res) => {
  const { nome, observacoes, pecas } = req.body || {};
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ error: "O molde precisa de um nome." });
  }
  const arrumadas = (Array.isArray(pecas) ? pecas : []).map(arrumarPeca).filter(Boolean);
  if (arrumadas.length === 0) {
    return res.status(400).json({ error: "Nenhuma peça válida veio no molde." });
  }

  const salvar = db.transaction(() => {
    const info = db.prepare(
      "INSERT INTO moldes (nome, observacoes, criado_em) VALUES (?, ?, ?)")
      .run(String(nome).trim(), String(observacoes || "").trim() || null, agora());
    const inserir = db.prepare(`
      INSERT INTO molde_pecas
        (molde_id, tamanho, papel, nome, quantidade, largura, altura, contorno, furos, origem, ordem)
      VALUES (@molde_id, @tamanho, @papel, @nome, @quantidade, @largura, @altura, @contorno, @furos, @origem, @ordem)
    `);
    arrumadas.forEach((p) => inserir.run({ ...p, molde_id: info.lastInsertRowid }));
    return info.lastInsertRowid;
  });

  const id = salvar();
  res.json({ id, pecas: arrumadas.length });
});

/** Regravar um molde troca as peças inteiras: é mais simples e não deixa sobra. */
router.put("/:id", (req, res) => {
  const molde = db.prepare("SELECT * FROM moldes WHERE id = ?").get(req.params.id);
  if (!molde) return res.status(404).json({ error: "Molde não encontrado." });

  const { nome, observacoes, pecas } = req.body || {};
  const arrumadas = (Array.isArray(pecas) ? pecas : []).map(arrumarPeca).filter(Boolean);
  if (arrumadas.length === 0) {
    return res.status(400).json({ error: "Nenhuma peça válida veio no molde." });
  }

  const salvar = db.transaction(() => {
    db.prepare("UPDATE moldes SET nome = ?, observacoes = ?, atualizado_em = ? WHERE id = ?")
      .run(String(nome || molde.nome).trim(), String(observacoes || "").trim() || null, agora(), molde.id);
    db.prepare("DELETE FROM molde_pecas WHERE molde_id = ?").run(molde.id);
    const inserir = db.prepare(`
      INSERT INTO molde_pecas
        (molde_id, tamanho, papel, nome, quantidade, largura, altura, contorno, furos, origem, ordem)
      VALUES (@molde_id, @tamanho, @papel, @nome, @quantidade, @largura, @altura, @contorno, @furos, @origem, @ordem)
    `);
    arrumadas.forEach((p) => inserir.run({ ...p, molde_id: molde.id }));
  });

  salvar();
  res.json({ ok: true, pecas: arrumadas.length });
});

router.delete("/:id", (req, res) => {
  // Guarda os nomes antes: depois do DELETE as linhas já não existem para
  // consultar, e as imagens ficariam ocupando disco à toa.
  const arquivos = db.prepare(`
    SELECT p.arquivo FROM molde_arte_pecas p
    JOIN molde_artes a ON a.id = p.arte_id
    WHERE a.molde_id = ?
  `).all(req.params.id).map((r) => r.arquivo);

  const info = db.prepare("DELETE FROM moldes WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Molde não encontrado." });
  limparArtesDeMolde(arquivos);
  res.json({ ok: true });
});

// ==================== ESTAMPAS DO MOLDE ====================

/**
 * A estampa é um jogo de artes de um molde: a arte da frente, a das costas, a
 * da manga, cada uma com o ajuste que a pessoa deu (como entra, tamanho, giro
 * e deslocamento). Ela é guardada por papel da peça, e não por tamanho — é
 * assim que a mesma estampa serve para P, M e G.
 *
 * A imagem vai para uploads/artes-molde e no banco fica só o nome do arquivo.
 * Arte de sublimação é grande demais para caber no banco, e como arquivo ela
 * já é servida direto pelo /uploads, sem passar por conversão nenhuma.
 */

const PASTA_ARTES = pastaDeUploads("artes-molde");

const TIPO_POR_EXTENSAO = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
  "image/webp": "webp", "image/gif": "gif",
};

const ajustePadrao = () => ({ modo: "cobrir", escala: 100, x: 0, y: 0, giro: 0 });

function arrumarAjuste(bruto) {
  const a = { ...ajustePadrao(), ...(bruto && typeof bruto === "object" ? bruto : {}) };
  const modos = ["cobrir", "caber", "esticar"];
  return {
    modo: modos.includes(a.modo) ? a.modo : "cobrir",
    escala: Math.min(400, Math.max(10, Number(a.escala) || 100)),
    x: Number(a.x) || 0,
    y: Number(a.y) || 0,
    giro: ((Math.round((Number(a.giro) || 0) / 90) * 90) % 360 + 360) % 360,
  };
}

function artesDoMolde(moldeId) {
  const artes = db.prepare("SELECT * FROM molde_artes WHERE molde_id = ? ORDER BY nome").all(moldeId);
  const pecas = db.prepare(`
    SELECT p.* FROM molde_arte_pecas p
    JOIN molde_artes a ON a.id = p.arte_id
    WHERE a.molde_id = ?
  `).all(moldeId);
  return artes.map((arte) => ({
    ...arte,
    pecas: pecas.filter((p) => p.arte_id === arte.id).map((p) => ({
      papel: p.papel,
      arquivo: p.arquivo,
      url: `/uploads/artes-molde/${p.arquivo}`,
      nomeOriginal: p.nome_original,
      ajuste: arrumarAjuste(p.ajuste ? JSON.parse(p.ajuste) : null),
    })),
  }));
}

/** Apaga do disco as imagens que não estão mais em uso por estampa nenhuma. */
const EM_USO_MOLDES = db.prepare("SELECT arquivo FROM molde_arte_pecas");
const limparArtesDeMolde = (arquivos) =>
  limparImagensSoltas(PASTA_ARTES, EM_USO_MOLDES, arquivos);

/**
 * Recebe a imagem de uma parte, em binário.
 *
 * Binário, e não base64 dentro de JSON: a mesma arte em base64 cresce um terço
 * e ainda passa pelo montador de texto do servidor — foi o que já derrubou o
 * download do PDF quando a arte era grande.
 */
router.post("/:id/artes/imagem", express.raw({ limit: "300mb", type: () => true }), (req, res) => {
  const molde = db.prepare("SELECT id FROM moldes WHERE id = ?").get(req.params.id);
  if (!molde) return res.status(404).json({ error: "Molde não encontrado." });
  if (!req.body || !req.body.length) return res.status(400).json({ error: "Chegou imagem vazia." });

  const buffer = Buffer.from(req.body);
  const ext = extensaoDaImagem(buffer) || TIPO_POR_EXTENSAO[String(req.headers["content-type"] || "").toLowerCase()];
  if (!ext) {
    return res.status(400).json({ error: "Formato de imagem não reconhecido. Use PNG, JPG ou WEBP." });
  }

  const papel = String(req.query.papel || "peca").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const arquivo = nomeDeArquivo(`${molde.id}-${papel}`, ext);
  fs.writeFileSync(path.join(PASTA_ARTES, arquivo), buffer);
  res.json({ ok: true, arquivo, url: `/uploads/artes-molde/${arquivo}`, bytes: buffer.length });
});

router.get("/:id/artes", (req, res) => {
  const molde = db.prepare("SELECT id FROM moldes WHERE id = ?").get(req.params.id);
  if (!molde) return res.status(404).json({ error: "Molde não encontrado." });
  res.json(artesDoMolde(molde.id));
});

/** Guarda uma estampa nova, ou regrava uma que já existe (mandando o id). */
router.post("/:id/artes", (req, res) => {
  const molde = db.prepare("SELECT id FROM moldes WHERE id = ?").get(req.params.id);
  if (!molde) return res.status(404).json({ error: "Molde não encontrado." });

  const { id, nome, pecas } = req.body || {};
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ error: "Dê um nome à estampa." });
  }
  const arrumadas = (Array.isArray(pecas) ? pecas : [])
    .filter((p) => p && p.papel && p.arquivo)
    .map((p) => ({
      papel: String(p.papel).trim().toLowerCase(),
      arquivo: String(p.arquivo),
      nome_original: String(p.nomeOriginal || "").trim() || null,
      ajuste: JSON.stringify(arrumarAjuste(p.ajuste)),
    }));
  if (arrumadas.length === 0) {
    return res.status(400).json({ error: "A estampa precisa da arte de pelo menos uma parte." });
  }

  const antiga = id
    ? db.prepare("SELECT * FROM molde_artes WHERE id = ? AND molde_id = ?").get(id, molde.id)
    : null;
  if (id && !antiga) return res.status(404).json({ error: "Essa estampa não é deste molde." });

  const arquivosAntigos = antiga
    ? db.prepare("SELECT arquivo FROM molde_arte_pecas WHERE arte_id = ?").all(antiga.id).map((r) => r.arquivo)
    : [];

  const salvar = db.transaction(() => {
    let arteId;
    if (antiga) {
      db.prepare("UPDATE molde_artes SET nome = ?, atualizado_em = ? WHERE id = ?")
        .run(String(nome).trim(), agora(), antiga.id);
      db.prepare("DELETE FROM molde_arte_pecas WHERE arte_id = ?").run(antiga.id);
      arteId = antiga.id;
    } else {
      arteId = db.prepare("INSERT INTO molde_artes (molde_id, nome, criado_em) VALUES (?, ?, ?)")
        .run(molde.id, String(nome).trim(), agora()).lastInsertRowid;
    }
    const inserir = db.prepare(`
      INSERT INTO molde_arte_pecas (arte_id, papel, arquivo, nome_original, ajuste)
      VALUES (@arte_id, @papel, @arquivo, @nome_original, @ajuste)
    `);
    arrumadas.forEach((p) => inserir.run({ ...p, arte_id: arteId }));
    return arteId;
  });

  const arteId = salvar();
  limparArtesDeMolde(arquivosAntigos);
  res.json({ id: arteId, pecas: arrumadas.length });
});

router.delete("/:id/artes/:arteId", (req, res) => {
  const arte = db.prepare("SELECT * FROM molde_artes WHERE id = ? AND molde_id = ?")
    .get(req.params.arteId, req.params.id);
  if (!arte) return res.status(404).json({ error: "Estampa não encontrada." });

  const arquivos = db.prepare("SELECT arquivo FROM molde_arte_pecas WHERE arte_id = ?")
    .all(arte.id).map((r) => r.arquivo);
  db.prepare("DELETE FROM molde_artes WHERE id = ?").run(arte.id);
  limparArtesDeMolde(arquivos);
  res.json({ ok: true });
});

module.exports = router;
