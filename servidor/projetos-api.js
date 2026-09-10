/**
 * Projetos de cliente: a estante do trabalho que se repete.
 *
 * A organização é a de uma gaveta de verdade — cliente, pasta do projeto,
 * peças dentro dela:
 *
 *     Time Azul/
 *       Camisa 2026/         frente.png  costas.png  manga.png
 *       Bandeira grande/     bandeira.png
 *
 * É outra coisa que a biblioteca de moldes, e a diferença é de propósito. No
 * molde guarda-se a **geometria** da peça, porque a estampa vai ser aplicada
 * nela depois, em qualquer tamanho. Aqui a estampa **já está aplicada**: o que
 * entra é a arte final da camisa, da bandeira, do que for. Ela não precisa de
 * mais nenhum passo — vai direto para o encaixe.
 *
 * Por isso o projeto guarda também os ajustes do encaixe. Repetir um pedido não
 * é redescobrir a largura do tecido e a folga que deram certo: é abrir o
 * projeto, dizer quantas unidades e mandar calcular.
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

const PASTA_ARTES = pastaDeUploads("projetos");

const texto = (v, max = 120) => String(v == null ? "" : v).trim().slice(0, max);
const numero = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

// ==================== CLIENTES (as pastas de fora) ====================

/** A lista da estante: cada cliente com quantos projetos tem dentro. */
router.get("/clientes", (req, res) => {
  const linhas = db.prepare(`
    SELECT c.*, COUNT(p.id) AS projetos
    FROM projeto_clientes c
    LEFT JOIN projetos p ON p.cliente_id = c.id
    GROUP BY c.id
    ORDER BY c.nome COLLATE NOCASE
  `).all();
  res.json(linhas);
});

router.post("/clientes", (req, res) => {
  const nome = texto(req.body && req.body.nome);
  if (!nome) return res.status(400).json({ error: "Dê um nome ao cliente." });
  const id = db.prepare(
    "INSERT INTO projeto_clientes (nome, observacoes, criado_em) VALUES (?, ?, ?)"
  ).run(nome, texto(req.body.observacoes, 500) || null, agora()).lastInsertRowid;
  res.json({ id, nome });
});

router.put("/clientes/:id", (req, res) => {
  const cliente = db.prepare("SELECT id FROM projeto_clientes WHERE id = ?").get(req.params.id);
  if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });
  const nome = texto(req.body && req.body.nome);
  if (!nome) return res.status(400).json({ error: "Dê um nome ao cliente." });
  db.prepare("UPDATE projeto_clientes SET nome = ?, observacoes = ?, atualizado_em = ? WHERE id = ?")
    .run(nome, texto(req.body.observacoes, 500) || null, agora(), cliente.id);
  res.json({ ok: true });
});

/**
 * Apagar o cliente leva os projetos e as peças junto (ON DELETE CASCADE), e as
 * imagens saem do disco depois — o mesmo cuidado dos moldes.
 */
router.delete("/clientes/:id", (req, res) => {
  const cliente = db.prepare("SELECT id FROM projeto_clientes WHERE id = ?").get(req.params.id);
  if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });
  const arquivos = db.prepare(`
    SELECT pe.arquivo FROM projeto_pecas pe
    JOIN projetos p ON p.id = pe.projeto_id
    WHERE p.cliente_id = ?
  `).all(cliente.id).map((r) => r.arquivo);
  db.prepare("DELETE FROM projeto_clientes WHERE id = ?").run(cliente.id);
  limparArtesDeProjeto(arquivos);
  res.json({ ok: true });
});

// ==================== PROJETOS (as pastas de dentro) ====================

function pecasDoProjeto(projetoId) {
  return db.prepare("SELECT * FROM projeto_pecas WHERE projeto_id = ? ORDER BY ordem, id")
    .all(projetoId)
    .map((p) => ({ ...p, url: `/uploads/projetos/${p.arquivo}` }));
}

router.get("/clientes/:id/projetos", (req, res) => {
  const cliente = db.prepare("SELECT * FROM projeto_clientes WHERE id = ?").get(req.params.id);
  if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });
  const projetos = db.prepare("SELECT * FROM projetos WHERE cliente_id = ? ORDER BY nome COLLATE NOCASE")
    .all(cliente.id)
    .map((p) => {
      const pecas = pecasDoProjeto(p.id);
      return {
        ...p,
        pecas: pecas.length,
        // Quantas peças saem de UMA unidade do projeto: é a conta que a pessoa
        // faz de cabeça ("50 camisas × 4 peças") e que o encaixe vai receber.
        pecasPorUnidade: pecas.reduce((s, x) => s + x.quantidade, 0),
        // A capa é a miniatura, nunca o arquivo inteiro: a lista mostra um
        // quadrado de 57 px e não pode pagar a decodificação da arte de
        // impressão para isso.
        capa: pecas.length > 0 ? pecas[0].miniatura : null,
      };
    });
  res.json({ cliente, projetos });
});

router.get("/:id", (req, res) => {
  const projeto = db.prepare("SELECT * FROM projetos WHERE id = ?").get(req.params.id);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  const cliente = db.prepare("SELECT * FROM projeto_clientes WHERE id = ?").get(projeto.cliente_id);
  res.json({ ...projeto, cliente, pecas: pecasDoProjeto(projeto.id) });
});

router.post("/", (req, res) => {
  const clienteId = Number(req.body && req.body.clienteId);
  const cliente = db.prepare("SELECT id FROM projeto_clientes WHERE id = ?").get(clienteId);
  if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });
  const nome = texto(req.body.nome);
  if (!nome) return res.status(400).json({ error: "Dê um nome ao projeto." });
  const id = db.prepare(
    "INSERT INTO projetos (cliente_id, nome, criado_em) VALUES (?, ?, ?)"
  ).run(cliente.id, nome, agora()).lastInsertRowid;
  res.json({ id, nome });
});

/**
 * Regrava o projeto inteiro: nome, ajustes e a lista de peças.
 *
 * A lista chega completa, e não em pedaços — a tela edita tudo junto e salva
 * uma vez. As peças antigas são apagadas e regravadas dentro de uma transação:
 * ou o projeto inteiro muda, ou nada muda.
 */
router.put("/:id", (req, res) => {
  const projeto = db.prepare("SELECT * FROM projetos WHERE id = ?").get(req.params.id);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const nome = texto(req.body && req.body.nome);
  if (!nome) return res.status(400).json({ error: "Dê um nome ao projeto." });

  const pecas = (Array.isArray(req.body.pecas) ? req.body.pecas : [])
    .map((p, ordem) => {
      const arquivo = texto(p && p.arquivo, 200);
      const largura = numero(p && p.largura);
      const altura = numero(p && p.altura);
      if (!arquivo || !largura || !altura) return null;
      return {
        nome: texto(p.nome) || "peça",
        arquivo,
        largura,
        altura,
        quantidade: Math.max(1, Math.floor(Number(p.quantidade) || 1)),
        // A miniatura vem pronta da tela (só ela tem canvas). O teto de 200 KB
        // é folgado para uma imagem de 240 px e barra qualquer engano de mandar
        // a arte inteira em base64 para dentro do banco.
        miniatura: typeof p.miniatura === "string" && p.miniatura.startsWith("data:image/")
          && p.miniatura.length < 200000 ? p.miniatura : null,
        ordem,
      };
    })
    .filter(Boolean);

  const antigos = db.prepare("SELECT arquivo FROM projeto_pecas WHERE projeto_id = ?")
    .all(projeto.id).map((r) => r.arquivo);

  const gravar = db.transaction(() => {
    db.prepare(`
      UPDATE projetos SET nome = ?, observacoes = ?, largura_tecido = ?, espaco = ?,
        comprimento_bancada = ?, giro = ?, atualizado_em = ? WHERE id = ?
    `).run(
      nome,
      texto(req.body.observacoes, 500) || null,
      numero(req.body.larguraTecido),
      // A folga pode ser zero de propósito, então não passa pelo `numero`, que
      // recusa zero. O comprimento da bancada passa: zero ali é "rolo sem fim",
      // que é a mesma coisa que não ter comprimento nenhum guardado.
      Number.isFinite(Number(req.body.espaco)) ? Number(req.body.espaco) : null,
      numero(req.body.comprimentoBancada),
      ["180", "fixa", "livre"].includes(req.body.giro) ? req.body.giro : null,
      agora(),
      projeto.id
    );
    db.prepare("DELETE FROM projeto_pecas WHERE projeto_id = ?").run(projeto.id);
    const inserir = db.prepare(`
      INSERT INTO projeto_pecas
        (projeto_id, nome, arquivo, largura, altura, quantidade, ordem, miniatura)
      VALUES (@projeto_id, @nome, @arquivo, @largura, @altura, @quantidade, @ordem, @miniatura)
    `);
    pecas.forEach((p) => inserir.run({ ...p, projeto_id: projeto.id }));
  });

  gravar();
  limparArtesDeProjeto(antigos);
  res.json({ ok: true, pecas: pecas.length });
});

router.delete("/:id", (req, res) => {
  const projeto = db.prepare("SELECT id FROM projetos WHERE id = ?").get(req.params.id);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  const arquivos = db.prepare("SELECT arquivo FROM projeto_pecas WHERE projeto_id = ?")
    .all(projeto.id).map((r) => r.arquivo);
  db.prepare("DELETE FROM projetos WHERE id = ?").run(projeto.id);
  limparArtesDeProjeto(arquivos);
  res.json({ ok: true });
});

/**
 * Guarda só as prévias de um projeto.
 *
 * Peça enviada antes desta coluna existir não tem prévia, e sem prévia a tela
 * teria de abrir a arte de impressão inteira para pintar um quadrado de 57 px —
 * quase um segundo de página parada por abertura. A tela gera a prévia na
 * primeira vez que abre o projeto e manda para cá, para não gerar de novo
 * nunca mais.
 *
 * É uma rota à parte, e não o PUT do projeto, de propósito: isto é cache de
 * imagem, não uma edição. Não mexe em nome, medida, quantidade nem ajuste.
 */
router.patch("/:id/miniaturas", (req, res) => {
  const projeto = db.prepare("SELECT id FROM projetos WHERE id = ?").get(req.params.id);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const entradas = (Array.isArray(req.body && req.body.miniaturas) ? req.body.miniaturas : [])
    .filter((m) => m && Number.isFinite(Number(m.id))
      && typeof m.miniatura === "string"
      && m.miniatura.startsWith("data:image/")
      && m.miniatura.length < 200000);

  const gravar = db.transaction(() => {
    const atualizar = db.prepare(
      "UPDATE projeto_pecas SET miniatura = ? WHERE id = ? AND projeto_id = ?");
    entradas.forEach((m) => atualizar.run(m.miniatura, Number(m.id), projeto.id));
  });
  gravar();
  res.json({ ok: true, guardadas: entradas.length });
});

// ==================== A IMAGEM DA PEÇA ====================

/**
 * Recebe a arte final em binário.
 *
 * Binário, e não base64 dentro de JSON: a mesma arte em base64 cresce um terço
 * e ainda passa pelo montador de texto do servidor. É a mesma escolha da
 * biblioteca de moldes, pelo mesmo motivo.
 */
router.post("/:id/imagem", express.raw({ limit: "300mb", type: () => true }), (req, res) => {
  const projeto = db.prepare("SELECT id FROM projetos WHERE id = ?").get(req.params.id);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!req.body || !req.body.length) return res.status(400).json({ error: "Chegou imagem vazia." });

  const buffer = Buffer.from(req.body);
  const ext = extensaoDaImagem(buffer);
  if (!ext) return res.status(400).json({ error: "Formato não reconhecido. Use PNG, JPG ou WEBP." });

  const arquivo = nomeDeArquivo(String(projeto.id), ext);
  fs.writeFileSync(path.join(PASTA_ARTES, arquivo), buffer);
  res.json({ ok: true, arquivo, url: `/uploads/projetos/${arquivo}`, bytes: buffer.length });
});

/**
 * Apaga do disco o que não está mais em nenhuma peça.
 *
 * A conferência é contra o banco inteiro, e não contra a lista que acabou de
 * sair: a mesma imagem pode ter sido reaproveitada em outro projeto, e apagar
 * pelo nome antigo deixaria o outro sem arte.
 */
const EM_USO_PROJETOS = db.prepare("SELECT arquivo FROM projeto_pecas");
const limparArtesDeProjeto = (arquivos) =>
  limparImagensSoltas(PASTA_ARTES, EM_USO_PROJETOS, arquivos);

module.exports = router;
