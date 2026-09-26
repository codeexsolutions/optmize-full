/**
 * ===========================================================================
 * OS ARQUIVOS DA GALERIA — o "drive" da fábrica
 * ===========================================================================
 *
 * A Galeria tem duas metades. Os PROJETOS (`projetos-api.js`) guardam arte
 * pronta para o encaixe, com medida e ajustes. Esta guarda o resto: pastas
 * dentro de pastas, e nelas IMAGENS e PDFs — o fardamento de uma empresa, a
 * foto da peça pronta, o PDF do pedido.
 *
 *     Arquivos/
 *       Padaria Sol/
 *         Fardamento 2026/    camisa.png  avental.pdf  gola.tif
 *       Modelos de gola/      polo.jpg
 *
 * SÓ IMAGEM E PDF, e quem decide é o conteúdo, não o nome: o tipo sai dos
 * primeiros bytes (`tipoPelosBytes`). Um `.cdr` renomeado para `.png` é
 * recusado do mesmo jeito que o `.cdr` com o nome certo.
 *
 * TODO arquivo vai para o disco com a extensão `.arq`, qualquer que seja o
 * tipo. É o que impede o `/uploads` (estático, sem trava de tipo) de servir um
 * `.html` ou `.svg` guardado aqui como página do próprio programa. Quem vê ou
 * baixa passa por `/arquivos/:id/ver` e `/arquivos/:id/baixar`, que decidem o
 * tipo com uma lista fechada.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const {
  extensaoDaImagem, nomeDeArquivo, nomeDeImagemValido, pastaDeUploads,
} = require("./uploads-arquivos");

const router = express.Router();
const agora = () => new Date().toISOString();
const PASTA = pastaDeUploads("galeria");

const texto = (v, max = 160) => String(v == null ? "" : v).trim().slice(0, max);

/**
 * O que pode ser MOSTRADO dentro da tela. O TIFF entra na Galeria mas só é
 * baixado: o navegador não sabe desenhá-lo.
 */
const VER_NA_TELA = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "application/pdf",
]);

const MIME_DA_IMAGEM = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/**
 * O tipo lido dos primeiros bytes — `null` para o que não é imagem nem PDF.
 *
 * O PDF é procurado no primeiro KB, e não só no começo: a especificação deixa
 * lixo antes do `%PDF-`, e há programa de impressão que grava assim.
 */
function tipoPelosBytes(b) {
  const imagem = extensaoDaImagem(b);
  if (imagem) return MIME_DA_IMAGEM[imagem];
  if (b.length > 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  if (b.length > 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00)
    || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a))) return "image/tiff";
  if (b.subarray(0, 1024).includes("%PDF-")) return "application/pdf";
  return null;
}

/** `null` na URL e no corpo quer dizer a raiz. */
function idDaPasta(valor) {
  if (valor == null || valor === "" || valor === "raiz" || valor === "null") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const PEGAR_PASTA = db.prepare("SELECT * FROM galeria_pastas WHERE id = ?");
const PEGAR_ARQUIVO = db.prepare("SELECT * FROM galeria_arquivos WHERE id = ?");

function paraTela(a) {
  return {
    id: a.id,
    pastaId: a.pasta_id,
    nome: a.nome,
    tipo: a.tipo,
    bytes: a.bytes,
    miniatura: a.miniatura,
    criadoEm: a.criado_em,
    url: `/api/galeria/arquivos/${a.id}/ver`,
  };
}

/** Do mais fundo até a raiz: o caminho de migalhas no topo da tela. */
function caminhoAte(pastaId) {
  const caminho = [];
  let atual = pastaId == null ? null : PEGAR_PASTA.get(pastaId);
  // O teto de 64 é a rede contra uma volta no banco (pasta dentro de si mesma),
  // que o PATCH impede, mas um banco mexido à mão não.
  while (atual && caminho.length < 64) {
    caminho.unshift({ id: atual.id, nome: atual.nome });
    atual = atual.pai_id == null ? null : PEGAR_PASTA.get(atual.pai_id);
  }
  return caminho;
}

/** Os ids da pasta e de todas as de dentro dela. */
const SUBARVORE = db.prepare(`
  WITH RECURSIVE arvore(id) AS (
    SELECT id FROM galeria_pastas WHERE id = ?
    UNION SELECT p.id FROM galeria_pastas p JOIN arvore a ON p.pai_id = a.id
  ) SELECT id FROM arvore
`);

function apagarDoDisco(arquivos) {
  arquivos.forEach((arquivo) => {
    if (!nomeDeImagemValido(arquivo)) return;
    try { fs.unlinkSync(path.join(PASTA, arquivo)); } catch { /* já não estava lá */ }
  });
}

// ==================== O RESUMO E A BUSCA ====================

/**
 * O que a lateral e a página inicial mostram: quanto está guardado, quanto o
 * disco ainda aguenta e os arquivos mexidos por último.
 */
router.get("/resumo", (req, res) => {
  const { arquivos, bytes } = db.prepare(
    "SELECT COUNT(*) AS arquivos, COALESCE(SUM(bytes), 0) AS bytes FROM galeria_arquivos"
  ).get();
  const pastas = db.prepare("SELECT COUNT(*) AS n FROM galeria_pastas").get().n;
  const clientes = db.prepare("SELECT COUNT(*) AS n FROM projeto_clientes").get().n;
  const projetos = db.prepare("SELECT COUNT(*) AS n FROM projetos").get().n;
  const recentes = db.prepare(
    "SELECT * FROM galeria_arquivos ORDER BY criado_em DESC, id DESC LIMIT 8"
  ).all().map(paraTela);

  // O disco onde a Galeria mora. `statfs` chegou no Node 18.15; sem ele, a
  // lateral só não mostra a barra.
  let disco = null;
  try {
    const s = fs.statfsSync(PASTA);
    disco = { total: s.blocks * s.bsize, livre: s.bavail * s.bsize };
  } catch { /* sem a barra do disco */ }

  res.json({ arquivos, bytes, pastas, clientes, projetos, recentes, disco });
});

/** Procura em TODAS as pastas pelo nome, e diz onde cada achado mora. */
router.get("/busca", (req, res) => {
  const termo = texto(req.query.q, 80);
  if (!termo) return res.json({ pastas: [], arquivos: [] });
  const padrao = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const onde = (pastaId) => caminhoAte(pastaId).map((c) => c.nome).join(" / ") || "Meus arquivos";

  const pastas = db.prepare(`
    SELECT p.id, p.pai_id AS paiId, p.nome,
      (SELECT COUNT(*) FROM galeria_arquivos a WHERE a.pasta_id = p.id) AS arquivos,
      (SELECT COUNT(*) FROM galeria_pastas f WHERE f.pai_id = p.id) AS pastas
    FROM galeria_pastas p WHERE p.nome LIKE ? ESCAPE '\\'
    ORDER BY p.nome COLLATE NOCASE LIMIT 60
  `).all(padrao).map((p) => ({ ...p, onde: onde(p.paiId) }));
  const arquivos = db.prepare(
    "SELECT * FROM galeria_arquivos WHERE nome LIKE ? ESCAPE '\\' ORDER BY nome COLLATE NOCASE LIMIT 200"
  ).all(padrao).map((a) => ({ ...paraTela(a), onde: onde(a.pasta_id) }));

  res.json({ pastas, arquivos });
});

// ==================== AS PASTAS ====================

/** Todas as pastas, soltas: a árvore da lateral é montada na tela. */
router.get("/pastas", (req, res) => {
  const pastas = db.prepare(`
    SELECT p.id, p.pai_id AS paiId, p.nome,
      (SELECT COUNT(*) FROM galeria_arquivos a WHERE a.pasta_id = p.id) AS arquivos
    FROM galeria_pastas p
    ORDER BY p.nome COLLATE NOCASE
  `).all();
  const naRaiz = db.prepare("SELECT COUNT(*) AS n FROM galeria_arquivos WHERE pasta_id IS NULL").get().n;
  res.json({ pastas, arquivosNaRaiz: naRaiz });
});

/** O que tem dentro de uma pasta (ou da raiz): as pastas e os arquivos. */
router.get("/pastas/:id/conteudo", (req, res) => {
  const id = idDaPasta(req.params.id);
  if (id === undefined) return res.status(400).json({ error: "Pasta inválida." });
  if (id !== null && !PEGAR_PASTA.get(id)) return res.status(404).json({ error: "Pasta não encontrada." });

  const pastas = db.prepare(`
    SELECT p.id, p.pai_id AS paiId, p.nome,
      (SELECT COUNT(*) FROM galeria_arquivos a WHERE a.pasta_id = p.id) AS arquivos,
      (SELECT COUNT(*) FROM galeria_pastas f WHERE f.pai_id = p.id) AS pastas
    FROM galeria_pastas p WHERE p.pai_id IS ?
    ORDER BY p.nome COLLATE NOCASE
  `).all(id);
  const arquivos = db.prepare(
    "SELECT * FROM galeria_arquivos WHERE pasta_id IS ? ORDER BY nome COLLATE NOCASE"
  ).all(id).map(paraTela);

  res.json({ id, caminho: caminhoAte(id), pastas, arquivos });
});

router.post("/pastas", (req, res) => {
  const nome = texto(req.body && req.body.nome, 120);
  if (!nome) return res.status(400).json({ error: "Dê um nome à pasta." });
  const paiId = idDaPasta(req.body.paiId);
  if (paiId === undefined || (paiId !== null && !PEGAR_PASTA.get(paiId))) {
    return res.status(404).json({ error: "A pasta de cima não existe mais." });
  }
  const id = db.prepare("INSERT INTO galeria_pastas (pai_id, nome, criado_em) VALUES (?, ?, ?)")
    .run(paiId, nome, agora()).lastInsertRowid;
  res.json({ id, nome, paiId });
});

/** Renomeia e/ou muda de lugar. Mover para dentro de si mesma é recusado. */
router.patch("/pastas/:id", (req, res) => {
  const pasta = PEGAR_PASTA.get(req.params.id);
  if (!pasta) return res.status(404).json({ error: "Pasta não encontrada." });
  const corpo = req.body || {};

  let nome = pasta.nome;
  if ("nome" in corpo) {
    nome = texto(corpo.nome, 120);
    if (!nome) return res.status(400).json({ error: "Dê um nome à pasta." });
  }

  let paiId = pasta.pai_id;
  if ("paiId" in corpo) {
    paiId = idDaPasta(corpo.paiId);
    if (paiId === undefined || (paiId !== null && !PEGAR_PASTA.get(paiId))) {
      return res.status(404).json({ error: "A pasta de destino não existe." });
    }
    if (paiId !== null && SUBARVORE.all(pasta.id).some((r) => r.id === paiId)) {
      return res.status(400).json({ error: "Uma pasta não pode ir para dentro dela mesma." });
    }
  }

  db.prepare("UPDATE galeria_pastas SET nome = ?, pai_id = ? WHERE id = ?").run(nome, paiId, pasta.id);
  res.json({ ok: true });
});

router.delete("/pastas/:id", (req, res) => {
  const pasta = PEGAR_PASTA.get(req.params.id);
  if (!pasta) return res.status(404).json({ error: "Pasta não encontrada." });
  const ids = SUBARVORE.all(pasta.id).map((r) => r.id);
  const arquivos = db.prepare(
    `SELECT arquivo FROM galeria_arquivos WHERE pasta_id IN (${ids.map(() => "?").join(",")})`
  ).all(...ids).map((r) => r.arquivo);
  db.prepare("DELETE FROM galeria_pastas WHERE id = ?").run(pasta.id);
  apagarDoDisco(arquivos);
  res.json({ ok: true, arquivos: arquivos.length });
});

// ==================== OS ARQUIVOS ====================

/**
 * Recebe uma imagem ou um PDF em binário.
 *
 * O nome original vem no cabeçalho `X-Nome-Do-Arquivo`, codificado com
 * `encodeURIComponent` (cabeçalho HTTP não carrega acento). A pasta vem na
 * consulta: `?pasta=12`, ou nada para a raiz.
 */
router.post("/arquivos", express.raw({ limit: "1gb", type: () => true }), (req, res) => {
  const pastaId = idDaPasta(req.query.pasta);
  if (pastaId === undefined || (pastaId !== null && !PEGAR_PASTA.get(pastaId))) {
    return res.status(404).json({ error: "A pasta não existe mais." });
  }
  if (!req.body || !req.body.length) return res.status(400).json({ error: "Chegou arquivo vazio." });

  // O tipo vem dos bytes, e não do que o navegador disse: é o que barra o
  // arquivo que não é imagem nem PDF, mesmo renomeado.
  const tipo = tipoPelosBytes(req.body);
  if (!tipo) {
    return res.status(415).json({
      error: "Só entram imagens (PNG, JPG, WEBP, GIF, BMP, TIFF) e PDF.",
    });
  }

  let nome;
  try { nome = decodeURIComponent(String(req.get("X-Nome-Do-Arquivo") || "")); } catch { nome = ""; }
  nome = texto(nome.replace(/[\\/\x00-\x1f]/g, "_"), 200) || "arquivo";

  const arquivo = nomeDeArquivo("g", "arq");
  fs.writeFileSync(path.join(PASTA, arquivo), req.body);
  const id = db.prepare(`
    INSERT INTO galeria_arquivos (pasta_id, nome, arquivo, tipo, bytes, criado_em)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(pastaId, nome, arquivo, tipo, req.body.length, agora()).lastInsertRowid;

  res.json(paraTela(PEGAR_ARQUIVO.get(id)));
});

/** Renomeia, muda de pasta ou guarda a miniatura — o que vier no corpo. */
router.patch("/arquivos/:id", (req, res) => {
  const atual = PEGAR_ARQUIVO.get(req.params.id);
  if (!atual) return res.status(404).json({ error: "Arquivo não encontrado." });
  const corpo = req.body || {};

  let nome = atual.nome;
  if ("nome" in corpo) {
    nome = texto(String(corpo.nome).replace(/[\\/\x00-\x1f]/g, "_"), 200);
    if (!nome) return res.status(400).json({ error: "Dê um nome ao arquivo." });
  }

  let pastaId = atual.pasta_id;
  if ("pastaId" in corpo) {
    pastaId = idDaPasta(corpo.pastaId);
    if (pastaId === undefined || (pastaId !== null && !PEGAR_PASTA.get(pastaId))) {
      return res.status(404).json({ error: "A pasta de destino não existe." });
    }
  }

  let miniatura = atual.miniatura;
  if (typeof corpo.miniatura === "string" && corpo.miniatura.startsWith("data:image/")
    && corpo.miniatura.length < 200000) {
    miniatura = corpo.miniatura;
  }

  db.prepare("UPDATE galeria_arquivos SET nome = ?, pasta_id = ?, miniatura = ? WHERE id = ?")
    .run(nome, pastaId, miniatura, atual.id);
  res.json(paraTela(PEGAR_ARQUIVO.get(atual.id)));
});

router.delete("/arquivos/:id", (req, res) => {
  const atual = PEGAR_ARQUIVO.get(req.params.id);
  if (!atual) return res.status(404).json({ error: "Arquivo não encontrado." });
  db.prepare("DELETE FROM galeria_arquivos WHERE id = ?").run(atual.id);
  apagarDoDisco([atual.arquivo]);
  res.json({ ok: true });
});

function mandar(req, res, paraBaixar) {
  const atual = PEGAR_ARQUIVO.get(req.params.id);
  if (!atual || !nomeDeImagemValido(atual.arquivo)) {
    return res.status(404).json({ error: "Arquivo não encontrado." });
  }
  const caminho = path.join(PASTA, atual.arquivo);
  if (!fs.existsSync(caminho)) return res.status(404).json({ error: "O arquivo sumiu do disco." });

  const naTela = !paraBaixar && VER_NA_TELA.has(atual.tipo);
  // `attachment` primeiro: ele também põe um tipo, tirado da extensão do nome
  // (um "pagina.html" viraria text/html). O `type` logo depois é quem vale.
  res.attachment(atual.nome);
  res.type(naTela ? atual.tipo : "application/octet-stream");
  res.set("X-Content-Type-Options", "nosniff");
  if (naTela) {
    // `attachment` já pôs o nome certo (com acento); aqui só troca o jeito.
    res.set("Content-Disposition", res.get("Content-Disposition").replace(/^attachment/, "inline"));
  }
  res.sendFile(caminho);
}

router.get("/arquivos/:id/ver", (req, res) => mandar(req, res, false));
router.get("/arquivos/:id/baixar", (req, res) => mandar(req, res, true));

module.exports = router;
