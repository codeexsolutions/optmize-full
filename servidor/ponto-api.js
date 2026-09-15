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
const rostos = require("./rostos");

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

/**
 * Altera o que foi digitado errado, e liga ou desliga a pessoa.
 *
 * DESLIGAR NÃO APAGA. A chave do banco é em cascata: apagar um funcionário
 * levaria junto o histórico de ponto dele, que é justamente o que ninguém pode
 * perder. O que se quer ao desligar alguém é parar de reconhecê-lo -- e o
 * `/reconhecer` já só olha para quem está ativo.
 */
router.patch("/funcionarios/:id", express.json({ limit: "1mb" }), (req, res) => {
  const funcionario = db.prepare("SELECT * FROM funcionarios WHERE id = ?").get(req.params.id);
  if (!funcionario) {
    return res.status(404).json({ error: "Funcionário não encontrado." });
  }

  const campos = [];
  const valores = [];
  for (const campo of ["nome", "apelido", "matricula"]) {
    if (req.body?.[campo] !== undefined) {
      const valor = String(req.body[campo] || "").trim();
      if (campo === "nome" && !valor) {
        return res.status(400).json({ error: "O funcionário precisa de um nome." });
      }
      campos.push(`${campo} = ?`);
      valores.push(valor || null);
    }
  }
  if (req.body?.ativo !== undefined) {
    campos.push("ativo = ?");
    valores.push(req.body.ativo ? 1 : 0);
  }
  if (campos.length === 0) {
    return res.status(400).json({ error: "Nada para alterar." });
  }

  campos.push("atualizado_em = ?");
  valores.push(agora(), funcionario.id);
  db.prepare(`UPDATE funcionarios SET ${campos.join(", ")} WHERE id = ?`).run(...valores);

  res.json(comRostos(db.prepare("SELECT * FROM funcionarios WHERE id = ?").get(funcionario.id)));
});

/* ============================================================= rostos */

/*
 * Um rosto novo. A imagem chega em binário puro, e não em JSON com base64:
 * base64 engorda em um terço e obriga o servidor a decodificar de novo o que
 * já era bytes.
 */
router.post("/funcionarios/:id/rostos",
            express.raw({ type: ["image/*", "application/octet-stream"], limit: "8mb" }),
            async (req, res) => {
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

  /*
   * O ROSTO É CONFERIDO ANTES DE ENTRAR, e não depois.
   *
   * Uma foto sem rosto aceita no cadastro é uma linha morta que ninguém
   * descobre: ela nunca reconhece ninguém, e a pessoa que a enviou vai achar
   * que o sistema não funciona. Recusar na hora dá a única resposta útil --
   * "tire outra".
   *
   * Duas ou mais caras na foto também saem: no cadastro isso é o colega atrás,
   * e guardar o vetor errado no nome de alguém é o defeito mais caro daqui.
   */
  const lido = await rostos.vetorDaFoto(req.body);
  if (lido.erro) {
    return res.status(422).json({ error: lido.erro });
  }
  if (lido.quantosRostos > 1) {
    return res.status(422).json({
      error: `Achei ${lido.quantosRostos} rostos nesta foto. Mande uma com uma pessoa só.`,
    });
  }

  fs.mkdirSync(PASTA_DOS_ROSTOS, { recursive: true });
  const arquivo = nomeDeArquivo(`rosto-${funcionario.id}`, extensao);
  fs.writeFileSync(path.join(PASTA_DOS_ROSTOS, arquivo), req.body);

  /*
   * A FOTO FICA GUARDADA junto do vetor, e não só o vetor.
   *
   * Sem ela, trocar de modelo um dia viraria uma sessão de fotos com a gráfica
   * inteira de novo. Com ela, é um recálculo -- e é para isso que serve a
   * coluna `modelo`: ela diz quais linhas ficaram para trás.
   */
  const info = db
    .prepare(`INSERT INTO funcionario_rostos (funcionario_id, arquivo, vetor, modelo, criado_em)
              VALUES (?, ?, ?, ?, ?)`)
    .run(funcionario.id, arquivo, JSON.stringify(lido.vetor), rostos.MODELO, agora());

  res.status(201).json({
    id: info.lastInsertRowid,
    arquivo,
    modelo: rostos.MODELO,
    nota: lido.nota,
  });
});

/**
 * A foto de um rosto cadastrado.
 *
 * Existe para a tela de Funcionários mostrar o que está guardado. Ver a foto é
 * o que permite julgar um cadastro ruim -- de lado, escura, com o colega atrás
 * -- antes que ele vire uma pessoa que "o sistema nunca reconhece".
 */
router.get("/rostos/:id/imagem", (req, res) => {
  const rosto = db.prepare("SELECT arquivo FROM funcionario_rostos WHERE id = ?").get(req.params.id);
  if (!rosto) return res.status(404).send("Rosto não encontrado");

  const caminho = path.join(PASTA_DOS_ROSTOS, rosto.arquivo);
  if (!fs.existsSync(caminho)) return res.status(404).send("O arquivo sumiu do disco");

  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(caminho);
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
/**
 * Grava uma batida e devolve o que aconteceu.
 *
 * Fica separada da rota porque tem DOIS chamadores que não se parecem: a rota
 * `/batidas`, onde alguém escolheu o nome numa tela, e o `/reconhecer`, onde a
 * câmera decidiu. Os dois precisam da mesma regra de qual batida é esta --
 * duplicá-la seria garantir que uma das cópias envelhecesse.
 */
function registrarBatida(funcionarioId, extras = {}) {
  const funcionario = db.prepare("SELECT * FROM funcionarios WHERE id = ?").get(funcionarioId);
  if (!funcionario) return null;

  const momento = extras.momento ? new Date(extras.momento) : new Date();
  if (Number.isNaN(momento.getTime())) return null;

  const dia = diaLocal(momento);
  const tipo = extras.tipo || qualBatida(funcionario.id, dia);
  const origem = extras.origem === "manual" ? "manual" : "terminal";

  const info = db.prepare(`INSERT INTO ponto_batidas
      (funcionario_id, momento, dia, tipo, origem, confianca, observacao, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(funcionario.id, momento.toISOString(), dia, tipo, origem,
         Number.isFinite(Number(extras.confianca)) ? Number(extras.confianca) : null,
         String(extras.observacao || "").trim() || null,
         agora());

  return {
    id: info.lastInsertRowid,
    funcionario: { id: funcionario.id, nome: funcionario.nome, apelido: funcionario.apelido },
    momento: momento.toISOString(),
    dia,
    tipo,
  };
}

router.post("/batidas", express.json({ limit: "256kb" }), (req, res) => {
  const batida = registrarBatida(req.body?.funcionario_id, {
    momento: req.body?.momento,
    tipo: req.body?.tipo,
    origem: req.body?.origem,
    confianca: req.body?.confianca,
    observacao: req.body?.observacao,
  });
  if (!batida) {
    return res.status(404).json({ error: "Funcionário não encontrado, ou momento inválido." });
  }
  res.status(201).json(batida);
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

/**
 * Os motivos de uma produção não ter passado.
 *
 * MORAM AQUI, E NÃO NO FIRMWARE DA PLACA. Estavam compilados lá dentro, e
 * trocar "Mancha ou sujeira" por outra coisa exigia regravar cada terminal --
 * uma lista que precisa vir do chão de fábrica trancada atrás de um compilador.
 *
 * Fechada de propósito, e sem campo livre: quem está de luva, com pressa e com
 * a fila andando digita "erro" e segue, e "erro" não ajuda ninguém a entender o
 * que aconteceu semanas depois.
 */
const MOTIVOS = [
  "Mancha ou sujeira",
  "Cor fora do padrao",
  "Desalinhado",
  "Falha na impressao",
  "Tecido com defeito",
  "Outro",
];

router.get("/motivos", (_req, res) => res.json({ motivos: MOTIVOS }));

/* =========================================================== o terminal */

/** Diz se o reconhecimento está de pé, e por que não, quando não estiver. */
router.get("/reconhecimento", (_req, res) => {
  const estado = rostos.estadoDoReconhecimento();
  const quantos = db
    .prepare(`SELECT COUNT(*) AS n FROM funcionario_rostos WHERE vetor IS NOT NULL`)
    .get().n;
  res.json({ ...estado, rostosCadastrados: quantos });
});

/**
 * O QUE O TERMINAL CHAMA AO FOTOGRAFAR ALGUÉM.
 *
 * Responde de quem é o rosto e, se `bater=1`, já registra a batida. Os dois
 * numa chamada só porque são um gesto só: quem parou na frente da câmera não
 * quer confirmar duas vezes.
 *
 * QUANDO NÃO RECONHECE, NÃO INVENTA. Devolve 404 com o nome de quem chegou mais
 * perto e o quanto faltou -- é o que deixa a tela dizer "não te reconheci,
 * tente de novo" em vez de bater o ponto de outra pessoa. Errar para baixo faz
 * alguém repetir a foto; errar para cima põe o ponto de um no nome de outro, e
 * ninguém descobre até o fim do mês.
 */
router.post("/reconhecer",
            express.raw({ type: ["image/*", "application/octet-stream"], limit: "8mb" }),
            async (req, res) => {
  if (!req.body || !req.body.length) {
    return res.status(400).json({ error: "Nenhuma imagem chegou." });
  }

  const estado = rostos.estadoDoReconhecimento();
  if (!estado.modelosNoDisco) {
    return res.status(501).json({
      error: "O reconhecimento facial não está instalado neste servidor.",
      alternativa: "Escolha o nome na tela do terminal.",
    });
  }

  const lido = await rostos.vetorDaFoto(req.body);
  if (lido.erro) {
    return res.status(422).json({ error: lido.erro });
  }

  /*
   * O cadastro inteiro a cada chamada, e isso está certo: são dezenas de
   * pessoas com dois ou três rostos cada, alguns milhares de números no total.
   * Um índice aqui seria complexidade para economizar microssegundos.
   */
  const cadastro = db
    .prepare(`SELECT r.funcionario_id AS funcionarioId, f.nome, r.vetor
              FROM funcionario_rostos r
              JOIN funcionarios f ON f.id = r.funcionario_id
              WHERE r.vetor IS NOT NULL AND r.modelo = ? AND f.ativo = 1`)
    .all(rostos.MODELO)
    .map((l) => ({ ...l, vetor: JSON.parse(l.vetor) }));

  const quem = rostos.deQuemE(lido.vetor, cadastro);

  if (!quem.encontrado) {
    return res.status(404).json({
      error: "Não reconheci este rosto.",
      maisPerto: quem.nome || null,
      nota: quem.nota ?? null,
      corte: quem.corte ?? rostos.CORTE,
      alternativa: "Escolha o nome na tela do terminal.",
    });
  }

  const resposta = {
    funcionarioId: quem.funcionarioId,
    nome: quem.nome,
    nota: quem.nota,
    segundo: quem.segundo,
  };

  if (String(req.query.bater || "") === "1") {
    resposta.batida = registrarBatida(quem.funcionarioId, {
      origem: "terminal",
      confianca: quem.nota,
    });
  }

  res.json(resposta);
});

/**
 * Recalcula os vetores das fotos já guardadas.
 *
 * O dia da troca de modelo existe, e é este botão. Sem ele, trocar a rede
 * significaria pedir foto nova a todo mundo -- e é justamente por isso que a
 * foto fica guardada junto do vetor.
 */
router.post("/rostos/recalcular", async (_req, res) => {
  const pendentes = db
    .prepare(`SELECT id, arquivo FROM funcionario_rostos
              WHERE vetor IS NULL OR modelo IS NULL OR modelo <> ?`)
    .all(rostos.MODELO);

  let refeitos = 0;
  const falhas = [];

  for (const linha of pendentes) {
    try {
      const foto = fs.readFileSync(path.join(PASTA_DOS_ROSTOS, linha.arquivo));
      const lido = await rostos.vetorDaFoto(foto);
      if (lido.erro) {
        falhas.push({ id: linha.id, arquivo: linha.arquivo, motivo: lido.erro });
        continue;
      }
      db.prepare("UPDATE funcionario_rostos SET vetor = ?, modelo = ? WHERE id = ?")
        .run(JSON.stringify(lido.vetor), rostos.MODELO, linha.id);
      refeitos++;
    } catch (erro) {
      falhas.push({ id: linha.id, arquivo: linha.arquivo, motivo: erro.message });
    }
  }

  res.json({ modelo: rostos.MODELO, pendentes: pendentes.length, refeitos, falhas });
});

module.exports = router;
