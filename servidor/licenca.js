/**
 * ===========================================================================
 * LICENÇA — o token que libera este computador
 * ===========================================================================
 *
 * O Optmize Full é instalado na gráfica e fica lá, sem ninguém olhando. O que
 * o libera é um token: um texto que você gera no painel, manda ao cliente, e
 * ele cola aqui uma vez.
 *
 * ESTE PROGRAMA NÃO FALA COM SERVIDOR NENHUM. Nem para ativar, nem depois. Ele
 * confere o token sozinho, na máquina, sem internet — e é assim de propósito:
 * gráfica sem link não pode ser gráfica parada, e instalar não pode depender
 * de o servidor estar no ar naquele minuto.
 *
 * ---------------------------------------------------------------------------
 * COMO ELE CONFERE SEM PERGUNTAR A NINGUÉM
 * ---------------------------------------------------------------------------
 *
 * O caminho óbvio — um segredo dentro do programa que valida o token — não
 * funciona, e vale entender por quê: o programa está NA MÃO do cliente.
 * Qualquer segredo que ele carregue para PODER CRIAR um token é um segredo que
 * quem abrir o programa pode usar para criar tokens também.
 *
 * Então o programa não sabe criar token nenhum. Ele só sabe conferir:
 *
 *   o painel      tem a chave PRIVADA e é a única coisa que assina um token;
 *   este programa  leva a chave PÚBLICA, que só confere a assinatura.
 *
 * A pública pode ser lida, copiada e publicada — com ela não se forja nada. É
 * matemática (Ed25519), não esconderijo: nem com o bytecode desmontado e o
 * código inteiro na frente dá para emitir um token que este arquivo aceite.
 *
 * ---------------------------------------------------------------------------
 * O QUE O TOKEN DIZ
 * ---------------------------------------------------------------------------
 *
 *     OPTMIZE1.<dados em base64>.<assinatura>
 *
 * Os dados são um JSON pequeno: cliente, as máquinas onde vale, quando foi
 * emitido e até quando. É texto, dá para ler — e é de propósito, não há nada
 * secreto ali. O que impede de MUDAR a data de validade é a assinatura, que
 * deixa de bater no instante em que um byte muda.
 *
 * As máquinas vêm escritas no token, no mesmo código que esta tela mostra
 * (`6B32-9431-5270`), então o token colado num computador que não está nele é
 * recusado. E cada token tem número de série: a instalação que o ativa guarda
 * esse número e recusa o mesmo token na segunda vez.
 *
 * ---------------------------------------------------------------------------
 * A TRANCA É AQUI, E ISSO IMPORTA
 * ---------------------------------------------------------------------------
 *
 * O bloqueio está no SERVIDOR local (o `porteiro`, no fim do arquivo), e não
 * na tela: a tela é JavaScript no navegador do cliente e se contorna com o F12
 * aberto; este arquivo sai em bytecode dentro do instalador (ver
 * `empacotar/compilar.js`). Quem apagar a tela de bloqueio chega a uma tela
 * bonita onde nenhuma rota responde.
 */

const crypto = require("crypto");
const os = require("os");
const { execFileSync } = require("child_process");
const express = require("express");
const db = require("./db");

/**
 * A CHAVE PÚBLICA DESTE PROGRAMA.
 *
 * A privada correspondente vive no painel de emissão (ver
 * `OPTMIZE_CHAVE_DE_LICENCA`, no `optmize-backend`). Trocar esta chave
 * invalida TODOS os tokens já emitidos — é o botão de recomeçar do zero, e não
 * uma coisa para mexer sem querer.
 */
const CHAVE_PUBLICA = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAsZq7mJQhw/o2Y5MAkW5nYVUm+XCR5+AsrLm9Xw5i0vQ=
-----END PUBLIC KEY-----
`;

/** Nos últimos dias o programa avisa, em vez de simplesmente parar um dia. */
const DIAS_DE_AVISO = 10;

/** Quanto o relógio pode andar para trás sem levantar suspeita. */
const TOLERANCIA_DO_RELOGIO_MS = 36 * 60 * 60 * 1000;

db.exec(`
  CREATE TABLE IF NOT EXISTS licenca (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    token TEXT,
    guardado_em TEXT,
    ultimo_visto TEXT
  );
  INSERT OR IGNORE INTO licenca (id) VALUES (1);

  -- Os tokens que esta instalação já consumiu. Ver 'USO ÚNICO', em guardarToken.
  CREATE TABLE IF NOT EXISTS licenca_usados (
    id TEXT PRIMARY KEY,
    cliente TEXT,
    expira TEXT,
    usado_em TEXT NOT NULL
  );
`);

// ==================== O CÓDIGO DA MÁQUINA ====================

/**
 * O identificador desta instalação — `6B32-9431-5270`.
 *
 * A semente é o `MachineGuid` do Windows: um número que o sistema sorteia na
 * instalação dele e que não muda com atualização, troca de usuário nem
 * reinstalação do programa. Ele NÃO vai no código: o que sai daqui é um pedaço
 * do resumo (SHA-256) dele com o nome do computador, então o código identifica
 * a máquina sem contar nada sobre ela.
 *
 * Curto porque é DITADO: o cliente lê este código na tela e manda para você
 * emitir o token. Doze hexadecimais em três grupos se ditam ao telefone; um
 * resumo de 64 caracteres, não. São 48 bits — não é segredo, é nome, e o que
 * ele precisa é não repetir numa base de milhares.
 *
 * Sem registro (não é Windows, ou a chave sumiu), cai no endereço de rede da
 * primeira placa física. Pior — placa se troca —, mas é melhor que recusar a
 * instalação por não conseguir se identificar.
 */
let codigoLembrado = null;

function sementeDaMaquina() {
  try {
    const saida = execFileSync("reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { encoding: "utf8", windowsHide: true, timeout: 4000 });
    const achado = saida.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    if (achado) return `guid:${achado[1].toLowerCase()}`;
  } catch {
    /* não é Windows, ou o registro não respondeu: cai no endereço de rede */
  }

  const placas = Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && !n.internal && n.mac && n.mac !== "00:00:00:00:00:00")
    .map((n) => n.mac.toLowerCase())
    .sort();
  if (placas.length) return `mac:${placas[0]}`;

  return `nome:${os.hostname()}`;
}

function idDaMaquina() {
  if (!codigoLembrado) {
    const resumo = crypto.createHash("sha256")
      .update(`${sementeDaMaquina()}|${os.hostname().toLowerCase()}`)
      .digest("hex").toUpperCase();
    codigoLembrado = `${resumo.slice(0, 4)}-${resumo.slice(4, 8)}-${resumo.slice(8, 12)}`;
  }
  return codigoLembrado;
}

/** Aceita o código escrito de qualquer jeito: com traço, sem, em minúscula. */
function normalizarCodigo(texto) {
  return String(texto || "").toUpperCase().replace(/[^0-9A-F]/g, "");
}

// ==================== O TOKEN ====================

const PREFIXO = "OPTMIZE1";

function deBase64url(texto) {
  return Buffer.from(String(texto).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Confere um token: a assinatura primeiro, o conteúdo depois.
 *
 * A ordem importa. Enquanto a assinatura não bate, o conteúdo é texto que
 * qualquer um escreveu — ler a data de validade antes de saber se ela é sua
 * seria acreditar no papel que o próprio cliente preencheu.
 */
function conferirToken(token, codigoDaMaquina = idDaMaquina()) {
  const limpo = String(token || "").trim().replace(/\s+/g, "");
  if (!limpo) return { ok: false, motivo: "sem-token" };

  const partes = limpo.split(".");
  if (partes.length !== 3 || partes[0] !== PREFIXO) return { ok: false, motivo: "formato" };

  let assinaturaConfere = false;
  try {
    assinaturaConfere = crypto.verify(
      null,
      Buffer.from(partes[1], "utf8"),
      crypto.createPublicKey(CHAVE_PUBLICA),
      deBase64url(partes[2]),
    );
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (!assinaturaConfere) return { ok: false, motivo: "assinatura" };

  let dados;
  try {
    dados = JSON.parse(deBase64url(partes[1]).toString("utf8"));
  } catch {
    return { ok: false, motivo: "formato" };
  }

  const maquinas = (dados.maquinas || []).map(normalizarCodigo);
  if (maquinas.length && !maquinas.includes(normalizarCodigo(codigoDaMaquina))) {
    return { ok: false, motivo: "outra-maquina", dados };
  }

  return { ok: true, dados };
}

/**
 * Guarda o token, se ele nunca tiver sido usado aqui.
 *
 * ---------------------------------------------------------------------------
 * USO ÚNICO — o que garante, e o que não garante
 * ---------------------------------------------------------------------------
 *
 * Cada token emitido carrega um número de série (`id`), e a instalação que o
 * ativa guarda esse número para sempre. Ativar o MESMO token uma segunda vez é
 * recusado, mesmo dentro da validade. Somado à amarração de máquina, é isso
 * que impede o token de circular: não vale em computador que não esteja
 * escrito nele, e não vale duas vezes onde já foi usado.
 *
 * O que NÃO dá para garantir sem servidor: quem apagar a pasta de dados apaga
 * junto a lista de usados, e consegue ativar o mesmo token de novo — na mesma
 * máquina, dentro da mesma validade, que é exatamente o que já tinha. Não se
 * ganha nada com isso.
 *
 * Recolar o token que JÁ ESTÁ valendo não conta como segunda vez: é o mesmo
 * papel na mesma gaveta, e recusar ali só confundiria quem está conferindo se
 * ativou direito.
 */
function guardarToken(token) {
  const conferido = conferirToken(token);
  if (!conferido.ok) return conferido;

  const limpo = String(token).trim();
  const atual = db.prepare("SELECT token FROM licenca WHERE id = 1").get();
  const eOMesmoQueJaVale = atual && atual.token === limpo;

  const serie = conferido.dados.id;
  if (serie && !eOMesmoQueJaVale) {
    const usado = db.prepare("SELECT usado_em FROM licenca_usados WHERE id = ?").get(serie);
    if (usado) return { ok: false, motivo: "ja-usado", dados: conferido.dados };
  }

  db.prepare("UPDATE licenca SET token = ?, guardado_em = ? WHERE id = 1")
    .run(limpo, new Date().toISOString());
  if (serie) {
    db.prepare("INSERT OR IGNORE INTO licenca_usados (id, cliente, expira, usado_em)"
      + " VALUES (?, ?, ?, ?)")
      .run(serie, conferido.dados.cliente, conferido.dados.expira, new Date().toISOString());
  }

  lembrado = { em: 0, estado: null };
  return { ok: true, estado: estadoDaLicenca(true) };
}

// ==================== O RELÓGIO ====================

/**
 * A maior data que este programa já viu enquanto rodava.
 *
 * Validade por data tem um furo óbvio: atrasar o relógio do Windows. Guardando
 * a maior data já vista, atrasar deixa de esticar o prazo — o programa passa a
 * contar a partir dela, e diz que o relógio está errado. Não é inviolável
 * (nada do que roda na máquina do outro é), mas custa mais do que mudar a data
 * no canto da tela, que é o que esta trava precisa cobrir.
 */
function relogioConfiavel() {
  const agora = Date.now();
  const linha = db.prepare("SELECT ultimo_visto FROM licenca WHERE id = 1").get();
  const visto = linha && linha.ultimo_visto ? Date.parse(linha.ultimo_visto) : 0;

  if (visto && agora < visto - TOLERANCIA_DO_RELOGIO_MS) return { agora: visto, mexeram: true };
  if (agora > visto) {
    db.prepare("UPDATE licenca SET ultimo_visto = ? WHERE id = 1")
      .run(new Date(agora).toISOString());
  }
  return { agora, mexeram: false };
}

// ==================== O ESTADO ====================

/*
 * Calculado no máximo uma vez por minuto: ele é consultado a cada pedido da
 * API, e conferir uma assinatura Ed25519 em toda chamada seria trabalho
 * repetido para um valor que muda uma vez por ano.
 */
let lembrado = { em: 0, estado: null };

function estadoDaLicenca(forcar = false) {
  if (!forcar && lembrado.estado && Date.now() - lembrado.em < 60_000) return lembrado.estado;

  const linha = db.prepare("SELECT token FROM licenca WHERE id = 1").get();
  const { agora, mexeram } = relogioConfiavel();
  const base = {
    maquina: idDaMaquina(),
    nomeDaMaquina: os.hostname() || "sem nome",
    liberado: false,
    dias: null,
    cliente: null,
    expira: null,
    observacao: null,
  };

  const conferido = conferirToken(linha && linha.token);
  let estado;

  if (!conferido.ok) {
    estado = { ...base, motivo: conferido.motivo };
  } else if (mexeram) {
    estado = {
      ...base,
      motivo: "relogio",
      cliente: conferido.dados.cliente,
      expira: conferido.dados.expira,
    };
  } else {
    // O fim do dia da validade, e não o começo: um token que expira hoje vale
    // hoje inteiro — é o que qualquer pessoa entende por "vence dia 12".
    const fim = Date.parse(`${conferido.dados.expira}T23:59:59`);
    const dias = Math.ceil((fim - agora) / 86_400_000);
    estado = {
      ...base,
      liberado: agora <= fim,
      motivo: agora <= fim ? (dias <= DIAS_DE_AVISO ? "vencendo" : "ok") : "vencido",
      cliente: conferido.dados.cliente,
      expira: conferido.dados.expira,
      observacao: conferido.dados.observacao || null,
      dias: Math.max(0, dias),
    };
  }

  lembrado = { em: Date.now(), estado };
  return estado;
}

// ==================== A PORTA ====================

function porteiro(req, res, proximo) {
  if (req.path.startsWith("/api/licenca")) return proximo();
  if (!req.path.startsWith("/api/")) return proximo();

  const estado = estadoDaLicenca();
  if (estado.liberado) return proximo();

  return res.status(402).json({
    error: recadoDoMotivo(estado.motivo),
    licenca: { motivo: estado.motivo, maquina: estado.maquina },
  });
}

const router = express.Router();

router.get("/", (_req, res) => res.json(estadoDaLicenca()));

router.post("/", express.json({ limit: "64kb" }), (req, res) => {
  const corpo = req.body || {};
  const resultado = guardarToken(corpo.token || corpo.chave);
  if (!resultado.ok) {
    return res.status(400).json({ error: recadoDoMotivo(resultado.motivo), motivo: resultado.motivo });
  }
  res.json(resultado.estado);
});

function recadoDoMotivo(motivo) {
  switch (motivo) {
    case "sem-token": return "Cole o token que você recebeu.";
    case "formato": return "Este texto não é um token do Optmize.";
    case "assinatura": return "Token inválido: a assinatura não confere.";
    case "outra-maquina": return "Este token foi emitido para outro computador.";
    case "ja-usado": return "Este token já foi usado. Cada token vale uma ativação — peça um novo.";
    case "relogio": return "A data do computador está atrasada. Acerte o relógio do Windows e abra de novo.";
    case "vencido": return "O token venceu. Peça um novo ao fornecedor.";
    default: return "Licença inválida.";
  }
}

module.exports = {
  router,
  porteiro,
  estadoDaLicenca,
  conferirToken,
  guardarToken,
  idDaMaquina,
  normalizarCodigo,
  DIAS_DE_AVISO,
};
