/**
 * ===========================================================================
 * O PONTO — quem trabalha, os rostos e as batidas
 * ===========================================================================
 *
 * O terminal de chão de fábrica (ver `esp/`) tem tela, câmera e rede. Ele
 * fotografa quem chega e manda a foto para cá; quem decide de quem é o rosto e
 * que batida aquilo representa é este servidor.
 *
 * A DIVISÃO É DE PROPÓSITO. Reconhecer rosto na placa significaria regravar
 * todas as placas para melhorar o reconhecimento, e manter o cadastro
 * sincronizado entre elas. Aqui, o cadastro é um só e o terminal é burro — o
 * que também quer dizer que uma segunda tela na expedição não custa cadastro
 * novo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA LINHA POR BATIDA
 * ---------------------------------------------------------------------------
 *
 * A tentação é guardar o dia inteiro numa linha — entrada, saída do almoço,
 * volta, saída. Não funciona:
 *
 *   - quem esquece de bater a saída deixa uma linha pela metade, e meia linha
 *     é mais difícil de consertar do que uma linha faltando;
 *   - o dia com quatro batidas e o dia com seis (uma ida ao banco no meio)
 *     cabem igual, sem coluna extra nem remendo.
 *
 * ---------------------------------------------------------------------------
 * QUEM DECIDE QUE BATIDA É
 * ---------------------------------------------------------------------------
 *
 * O servidor, pelo que já foi batido no dia — não a pessoa. Ninguém deveria
 * ter de escolher "estou voltando do almoço" numa tela enquanto oito pessoas
 * esperam atrás. A primeira do dia é entrada, a segunda saída para o almoço, e
 * assim por diante; da quinta em diante vira `extra`, que é o que o dia com
 * uma saída no meio produz.
 *
 * Deduzir erra às vezes — e é por isso que existe a tela de conferência, onde
 * quem cuida do RH corrige o que ficou torto. Errar e deixar corrigir é melhor
 * que perguntar quatro vezes por dia a cada pessoa.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { extensaoDaImagem, nomeDeArquivo, pastaDeUploads } = require("./uploads-arquivos");

const router = express.Router();
const agora = () => new Date().toISOString();

/** Onde as fotos de rosto ficam. Separadas das artes, que são outro assunto. */
const PASTA_DOS_ROSTOS = path.join(pastaDeUploads(), "rostos");

/**
 * A ordem das batidas num dia comum.
 *
 * Não é uma regra rígida — é o que acontece na maioria dos dias. O que vier
 * depois da quarta é `extra`, e a tela de conferência é quem dá nome a ele.
 */
const SEQUENCIA = ["entrada", "almoco_saida", "almoco_volta", "saida"];

/**
 * O dia de uma batida, em AAAA-MM-DD e no fuso DESTE computador.
 *
 * Fatiar o ISO com `slice(0, 10)` daria o dia em UTC, e no Brasil isso joga
 * tudo que acontece depois das 21h para o dia seguinte — uma saída às 22h
 * apareceria como entrada do dia que vem.
 */
function diaLocal(data) {
  const d = new Date(data);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function qualBatida(funcionarioId, dia) {
  const { quantas } = db
    .prepare("SELECT COUNT(*) AS quantas FROM ponto_batidas WHERE funcionario_id = ? AND dia = ?")
    .get(funcionarioId, dia);
  return SEQUENCIA[quantas] || "extra";
}

function comRostos(funcionario) {
  const rostos = db
    .prepare("SELECT id, arquivo, modelo, criado_em FROM funcionario_rostos WHERE funcionario_id = ? ORDER BY id")
    .all(funcionario.id);
  return { ...funcionario, rostos };
}

/* ======================================================== funcionários */

router.get("/funcionarios", (req, res) => {
  const todos = req.query.todos === "1";
  const linhas = db
    .prepare(`SELECT * FROM funcionarios ${todos ? "" : "WHERE ativo = 1"} ORDER BY nome`)
    .all();
  res.json(linhas.map(comRostos));
});

router.post("/funcionarios", express.json({ limit: "1mb" }), (req, res) => {
  const nome = String(req.body?.nome || "").trim();
  if (!nome) {
    return res.status(400).json({ error: "O funcionário precisa de um nome." });
  }

  const info = db
    .prepare("INSERT INTO funcionarios (nome, apelido, matricula, criado_em) VALUES (?, ?, ?, ?)")
    .run(nome,
         String(req.body?.apelido || "").trim() || null,
         String(req.body?.matricula || "").trim() || null,
         agora());

  const criado = db.prepare("SELECT * FROM funcionarios WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(comRostos(criado));
});

router.put("/funcionarios/:id", express.json({ limit: "1mb" }), (req, res) => {
  const atual = db.prepare("SELECT * FROM funcionarios WHERE id = ?").get(req.params.id);
  if (!atual) {
    return res.status(404).json({ error: "Funcionário não encontrado." });
  }

  db.prepare(`UPDATE funcionarios
                 SET nome = ?, apelido = ?, matricula = ?, ativo = ?, atualizado_em = ?
               WHERE id = ?`)
    .run(String(req.body?.nome ?? atual.nome).trim() || atual.nome,
         String(req.body?.apelido ?? atual.apelido ?? "").trim() || null,
         String(req.body?.matricula ?? atual.matricula ?? "").trim() || null,
         req.body?.ativo === undefined ? atual.ativo : (req.body.ativo ? 1 : 0),
         agora(),
         atual.id);

  res.json(comRostos(db.prepare("SELECT * FROM funcionarios WHERE id = ?").get(atual.id)));
});

/*
 * Desligar alguém NÃO apaga: as batidas dele continuam valendo, e apagar o
 * funcionário levaria o histórico junto (a chave estrangeira é em cascata).
 * Quem sai fica inativo — some das listas do terminal, continua nos relatórios.
 */
router.delete("/funcionarios/:id", (req, res) => {
  const info = db.prepare("UPDATE funcionarios SET ativo = 0, atualizado_em = ? WHERE id = ?")
    .run(agora(), req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: "Funcionário não encontrado." });
  }
  res.json({ ok: true });
});

/* ============================================================= rostos */

/*
 * Um rosto novo. A imagem chega em binário puro, e não em JSON com base64:
 * base64 engorda em um terço e obriga o servidor a decodificar de novo o que
 * já era bytes.
 */
router.post("/funcionarios/:id/rostos",
            express.raw({ type: ["image/*", "application/octet-stream"], limit: "8mb" }),
            (req, res) => {
  const funcionario = db.prepare("SELECT * FROM funcionarios WHERE id = ?").get(req.params.id);
  if (!funcionario) {
    return res.status(404).json({ error: "Funcionário não encontrado." });
  }
  if (!req.body || !req.body.length) {
    return res.status(400).json({ error: "Nenhuma imagem chegou." });
  }

  const extensao = extensaoDaImagem(req.body);
  if (!extensao) {
    return res.status(400).json({ error: "Isto não é uma imagem que eu saiba ler." });
  }

  fs.mkdirSync(PASTA_DOS_ROSTOS, { recursive: true });
  const arquivo = nomeDeArquivo(`rosto-${funcionario.id}`, extensao);
  fs.writeFileSync(path.join(PASTA_DOS_ROSTOS, arquivo), req.body);

  /*
   * O `vetor` nasce vazio: é a rede que o preenche, e ela ainda não existe. A
   * FOTO é o que importa guardar — com ela, o dia em que o modelo mudar é um
   * recálculo, e não uma sessão de fotos com a gráfica inteira de novo.
   */
  const info = db
    .prepare("INSERT INTO funcionario_rostos (funcionario_id, arquivo, criado_em) VALUES (?, ?, ?)")
    .run(funcionario.id, arquivo, agora());

  res.status(201).json({ id: info.lastInsertRowid, arquivo });
});

router.delete("/rostos/:id", (req, res) => {
  const rosto = db.prepare("SELECT * FROM funcionario_rostos WHERE id = ?").get(req.params.id);
  if (!rosto) {
    return res.status(404).json({ error: "Rosto não encontrado." });
  }

  db.prepare("DELETE FROM funcionario_rostos WHERE id = ?").run(rosto.id);
  try {
    fs.unlinkSync(path.join(PASTA_DOS_ROSTOS, rosto.arquivo));
  } catch {
    /* o arquivo já não estava lá: o registro sair é o que importa */
  }
  res.json({ ok: true });
});

/* ============================================================ batidas */

/*
 * Registra uma batida. `origem` diz de onde veio -- o terminal, ou a mão de
 * quem cuida do RH corrigindo um esquecimento.
 */
router.post("/batidas", express.json({ limit: "256kb" }), (req, res) => {
  const funcionario = db.prepare("SELECT * FROM funcionarios WHERE id = ?")
    .get(req.body?.funcionario_id);
  if (!funcionario) {
    return res.status(404).json({ error: "Funcionário não encontrado." });
  }

  const momento = req.body?.momento ? new Date(req.body.momento) : new Date();
  if (Number.isNaN(momento.getTime())) {
    return res.status(400).json({ error: "Momento inválido." });
  }

  const dia = diaLocal(momento);
  const tipo = req.body?.tipo || qualBatida(funcionario.id, dia);
  const origem = req.body?.origem === "manual" ? "manual" : "terminal";

  const info = db.prepare(`INSERT INTO ponto_batidas
      (funcionario_id, momento, dia, tipo, origem, confianca, observacao, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(funcionario.id, momento.toISOString(), dia, tipo, origem,
         Number.isFinite(Number(req.body?.confianca)) ? Number(req.body.confianca) : null,
         String(req.body?.observacao || "").trim() || null,
         agora());

  res.status(201).json({
    id: info.lastInsertRowid,
    funcionario: { id: funcionario.id, nome: funcionario.nome, apelido: funcionario.apelido },
    momento: momento.toISOString(),
    dia,
    tipo,
  });
});

/*
 * As batidas de um período, agrupadas por pessoa e por dia -- que é como quem
 * confere o ponto olha, e não como o banco as guarda.
 */
router.get("/batidas", (req, res) => {
  const hoje = diaLocal(new Date());
  const de = String(req.query.de || hoje);
  const ate = String(req.query.ate || de);

  const linhas = db.prepare(`
    SELECT b.*, f.nome, f.apelido, f.matricula
      FROM ponto_batidas b
      JOIN funcionarios f ON f.id = b.funcionario_id
     WHERE b.dia BETWEEN ? AND ?
     ORDER BY b.dia, f.nome, b.momento`).all(de, ate);

  const porDia = new Map();
  for (const l of linhas) {
    const chave = `${l.dia}|${l.funcionario_id}`;
    if (!porDia.has(chave)) {
      porDia.set(chave, {
        dia: l.dia,
        funcionario: {
          id: l.funcionario_id, nome: l.nome, apelido: l.apelido, matricula: l.matricula,
        },
        batidas: [],
      });
    }
    porDia.get(chave).batidas.push({
      id: l.id, momento: l.momento, tipo: l.tipo, origem: l.origem,
      confianca: l.confianca, observacao: l.observacao,
    });
  }

  res.json({ de, ate, dias: [...porDia.values()] });
});

router.delete("/batidas/:id", (req, res) => {
  const info = db.prepare("DELETE FROM ponto_batidas WHERE id = ?").run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: "Batida não encontrada." });
  }
  res.json({ ok: true });
});

/* =========================================================== o terminal */

/*
 * O que o terminal chama ao fotografar alguém.
 *
 * Hoje ele ainda não reconhece: responde 501 dizendo isso, e o terminal cai
 * para o caminho de escolher o nome na tela. Preferir isso a devolver um
 * "não reconheci" genérico -- a diferença entre "ainda não sei fazer" e "olhei
 * e não era ninguém" importa para quem está do outro lado.
 */
router.post("/reconhecer",
            express.raw({ type: ["image/*", "application/octet-stream"], limit: "8mb" }),
            (req, res) => {
  res.status(501).json({
    error: "O reconhecimento facial ainda não está ligado.",
    alternativa: "Escolha o nome na tela do terminal.",
  });
});

module.exports = router;
