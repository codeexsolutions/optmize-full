// Cliente do WhatsApp usando whatsapp-web.js.
//
// Não precisa de servidor externo nem de chave: a biblioteca abre um Chrome
// invisível com o WhatsApp Web dentro do próprio processo da central. A
// sessão fica salva em data/whatsapp-session, então depois do primeiro QR o
// bot volta sozinho a cada reinício do PC.

const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { qrToSvg } = require("../services/qrcode");
const { pastaDeDados } = require("../../caminhos");
const { acharNavegador, RECADO_SEM_NAVEGADOR } = require("./navegador");

const SESSION_ROOT = pastaDeDados("whatsapp-sessao");
// Nome antigo de propósito: este id aponta para a pasta da sessão já pareada
// (data/whatsapp-session/session-arteof). Renomear obrigaria a ler o QR de novo.
const CLIENT_ID = "arteof";
const SESSION_DIR = path.join(SESSION_ROOT, `session-${CLIENT_ID}`);

/*
 * A marca de que o pareamento realmente aconteceu.
 *
 * A pasta da sessão NÃO responde isso. Ela é um perfil de Chrome inteiro, e o
 * `LocalAuth` a cria no instante em que o navegador abre — antes de qualquer
 * QR ser lido. Uma tentativa de pareamento abandonada deixa 76 MB de perfil
 * para trás, e o `hasSession()` antigo, que só perguntava "tem alguma coisa
 * dentro?", passava a responder "sim" para sempre. Resultado: todo restart do
 * servidor abria um Chrome e ficava num QR que ninguém pediu.
 *
 * Nem o IndexedDB do WhatsApp serve de pista: ele nasce de só ABRIR o
 * web.whatsapp.com. Então em vez de adivinhar pelas entranhas do Chrome, o
 * programa anota o que ele mesmo viu acontecer — o evento `ready` — e apaga a
 * anotação no logout.
 */
const MARCA_DE_PAREAMENTO = path.join(SESSION_ROOT, "pareado.json");
const START_TIMEOUT_MS = Number(process.env.WA_START_TIMEOUT_MS || 60000);
const RESTART_DELAY_MS = Number(process.env.WA_RESTART_DELAY_MS || 5000);

/*
 * Quanto tempo o QR fica de pé esperando alguém ler.
 *
 * ISTO EXISTE POR CAUSA DE UM VAZAMENTO DE VERDADE. O watchdog do start() só
 * olha o estado "starting"; assim que o primeiro QR aparece o estado vira
 * "qr", ele desiste, e a partir daí NADA mais desligava o cliente. Quem abria
 * a aba do WhatsApp e não lia o código deixava um Chrome aberto para sempre —
 * medido num servidor real: 8,9 horas de pé, 906 QRs renovados, e o processo
 * morreu com falha de alocação de memória.
 *
 * Pareamento é coisa de um minuto: a pessoa está com o celular na mão quando
 * clica em "Conectar". Cinco minutos é folga generosa para quem foi atender o
 * telefone no meio, e curto o bastante para não atravessar a noite.
 *
 * O que NÃO é afetado: quem já tem sessão salva nunca passa por aqui, porque
 * reconecta direto para "ready" sem mostrar QR nenhum.
 */
const QR_TIMEOUT_MS = Number(process.env.WA_QR_TIMEOUT_MS || 5 * 60 * 1000);

/*
 * Teto para o `destroy()` do Puppeteer responder.
 *
 * Sem ele, um Chrome travado fazia `stopping` ficar true para sempre, e daí em
 * diante todo `start()` devolvia sem fazer nada — o bot ficava morto até
 * alguém reiniciar o servidor, sem nenhuma mensagem dizendo por quê. O
 * watchdog do start() já corria essa corrida; agora ela vale para todos.
 */
const DESTROY_TIMEOUT_MS = 10000;

/** O prazo do QR em português, sem virar "0 min" quando alguém o encurta. */
function prazoDoQrEmTexto() {
  if (QR_TIMEOUT_MS < 60000) return `${Math.max(1, Math.round(QR_TIMEOUT_MS / 1000))} s`;
  const minutos = Math.round(QR_TIMEOUT_MS / 60000);
  return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
}

// status:
//   off        — cliente parado (nunca iniciado ou desconectado de propósito)
//   starting   — abrindo o Chrome / carregando o WhatsApp Web
//   qr         — esperando alguém escanear o QR
//   ready      — conectado e pronto pra mandar mensagem
//   error      — falhou; lastError explica
const state = {
  status: "off",
  qrSvg: "",
  qrAt: 0,
  lastError: null,
  me: null,
  readyAt: 0
};

let client = null;
let stopping = false;
// O relógio do QR. Um só, e sempre solto pelo `pararRelogioDoQr`.
let relogioDoQr = null;

/** Existe um perfil de navegador guardado? (Não quer dizer que pareou.) */
function temPerfilGuardado() {
  try {
    return fs.existsSync(SESSION_DIR) && fs.readdirSync(SESSION_DIR).length > 0;
  } catch {
    return false;
  }
}

/** Já houve um pareamento confirmado neste perfil? */
function hasSession() {
  return fs.existsSync(MARCA_DE_PAREAMENTO);
}

function marcarPareado(me) {
  try {
    fs.mkdirSync(SESSION_ROOT, { recursive: true });
    const anotacao = { em: new Date().toISOString(), numero: (me && me.number) || "" };
    fs.writeFileSync(MARCA_DE_PAREAMENTO, JSON.stringify(anotacao, null, 2) + "\n", "utf8");
  } catch (error) {
    // Não é motivo para derrubar a conexão que acabou de dar certo: o custo de
    // falhar aqui é o servidor não reconectar sozinho no próximo restart.
    console.warn(`[whatsapp] não consegui anotar o pareamento: ${error.message}`);
  }
}

function apagarMarcaDePareamento() {
  try {
    fs.rmSync(MARCA_DE_PAREAMENTO, { force: true });
  } catch (error) {
    console.warn(`[whatsapp] não consegui apagar a marca de pareamento: ${error.message}`);
  }
}

function buildClient(executablePath) {
  return new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID, dataPath: SESSION_ROOT }),
    puppeteer: {
      headless: true,
      // Qual Chrome usar é decidido em ./navegador.js, e não pelo Puppeteer:
      // no programa instalado o navegador dele não existe, e o que existe é o
      // Chrome ou o Edge da própria máquina.
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    }
  });
}

function wire(c) {
  c.on("qr", qr => {
    // O WhatsApp troca o QR a cada ~20s; a tela busca sempre o mais novo.
    state.status = "qr";
    state.qrAt = Date.now();
    state.lastError = null;
    try {
      state.qrSvg = qrToSvg(qr, { moduleSize: 4, quiet: 2, ec: "L" });
    } catch (error) {
      state.qrSvg = "";
      state.lastError = `Falha ao desenhar o QR: ${error.message}`;
    }
    console.log("[whatsapp] QR novo disponível — escaneie na aba WhatsApp do painel.");
    ligarRelogioDoQr(c);
  });

  c.on("authenticated", () => {
    // Alguém leu: o relógio do QR perdeu a razão de existir. Se ficasse de pé,
    // ele acharia daqui a pouco um cliente que já está conectando e — mesmo
    // com a guarda de estado — seria uma bomba armada à toa.
    pararRelogioDoQr();
    console.log("[whatsapp] autenticado, carregando a sessão...");
    state.status = "starting";
    state.qrSvg = "";
  });

  c.on("ready", () => {
    pararRelogioDoQr();
    state.status = "ready";
    state.qrSvg = "";
    state.lastError = null;
    state.readyAt = Date.now();
    const info = c.info || {};
    state.me = {
      number: (info.wid && info.wid.user) || "",
      name: info.pushname || ""
    };
    console.log(`[whatsapp] conectado como ${state.me.name || state.me.number || "(sem nome)"}`);
    // Só aqui se sabe que o pareamento existe de verdade.
    marcarPareado(state.me);
  });

  c.on("auth_failure", message => {
    pararRelogioDoQr();
    state.status = "error";
    state.qrSvg = "";
    state.lastError = `Falha de autenticação: ${message}`;
    console.warn(`[whatsapp] ${state.lastError}`);
  });

  c.on("disconnected", reason => {
    pararRelogioDoQr();
    state.status = "off";
    state.qrSvg = "";
    state.me = null;
    state.lastError = `Desconectado: ${reason}`;
    console.warn(`[whatsapp] desconectado (${reason})`);
    // O Chrome fica órfão depois desse evento; derruba pra poder reconectar.
    destroyQuietly(c);
    if (client === c) client = null;
  });
}

async function destroyQuietly(c) {
  try {
    /*
     * O `destroy()` do Puppeteer pode não voltar nunca quando o Chrome já está
     * travado — e é justamente aí que ele mais precisa ser chamado. A corrida
     * com o relógio garante que quem chamou siga em frente: o pior caso é um
     * processo de Chrome órfão, que o sistema recolhe, e não o módulo inteiro
     * preso esperando.
     */
    await Promise.race([
      c.destroy(),
      new Promise(resolve => setTimeout(resolve, DESTROY_TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.warn(`[whatsapp] erro ao encerrar o cliente: ${error.message}`);
  }
}

/** Solta o relógio do QR. Seguro chamar sem relógio nenhum de pé. */
function pararRelogioDoQr() {
  if (relogioDoQr) clearTimeout(relogioDoQr);
  relogioDoQr = null;
}

/**
 * Liga o relógio do QR — uma vez por sessão de pareamento, e não a cada código.
 *
 * O WhatsApp renova o QR a cada ~20 s, então religar o relógio a cada evento
 * `qr` seria o mesmo que não ter relógio: ele nunca chegaria ao fim. O que se
 * mede aqui é há quanto tempo a tela está PEDINDO para alguém ler, não a idade
 * do código atual.
 */
function ligarRelogioDoQr(c) {
  if (relogioDoQr) return;
  relogioDoQr = setTimeout(async () => {
    relogioDoQr = null;
    if (client !== c || state.status !== "qr") return;

    state.lastError = `Ninguém leu o QR em ${prazoDoQrEmTexto()}, então o WhatsApp Web foi`
      + " fechado para não ficar ocupando memória. Clique em Conectar para tentar de novo.";
    console.warn(`[whatsapp] QR expirou sem leitura — fechando o navegador.`);

    client = null;
    await destroyQuietly(c);
    state.status = "off";
    state.qrSvg = "";
    state.me = null;
  }, QR_TIMEOUT_MS);
  // Não é motivo para segurar o processo de pé.
  if (relogioDoQr.unref) relogioDoQr.unref();
}

// Sobe o cliente. É seguro chamar várias vezes: se já existe um rodando,
// não faz nada. Não espera ficar pronto — quem chama acompanha por
// getStatus() (a tela fica consultando).
function start() {
  if (client || stopping) return getStatus();

  // Sem navegador não adianta nem tentar: o Puppeteer falharia lá dentro, com
  // uma mensagem sobre caminho de executável que não diz nada para quem está
  // olhando a tela do painel.
  const navegador = acharNavegador();
  if (!navegador) {
    state.status = "error";
    state.lastError = RECADO_SEM_NAVEGADOR;
    console.error(`[whatsapp] ${RECADO_SEM_NAVEGADOR}`);
    return getStatus();
  }

  state.status = "starting";
  state.lastError = null;
  state.qrSvg = "";
  // Um começo novo não herda o relógio de um pareamento que não deu certo.
  pararRelogioDoQr();

  const c = buildClient(navegador);
  client = c;
  wire(c);

  c.initialize().catch(async error => {
    state.status = "error";
    state.lastError = error.message;
    console.error(`[whatsapp] não consegui iniciar: ${error.message}`);
    if (client === c) client = null;
    /*
     * O Chrome JÁ SUBIU quando o `initialize()` falha — a falha típica
     * ("Execution context was destroyed") acontece depois de o Puppeteer ter
     * aberto o navegador, no meio do carregamento do WhatsApp Web. Sem este
     * `destroy`, soltar a referência só fazia o processo virar órfão: ninguém
     * mais tinha como fechá-lo, e ele ficava até o servidor inteiro morrer.
     *
     * Solta o relógio junto, porque um QR pode ter aparecido antes da falha.
     */
    pararRelogioDoQr();
    await destroyQuietly(c);
  });

  // Chromium/WhatsApp Web pode ficar preso indefinidamente em "starting"
  // depois de um reinício forçado do servidor. Solta a referência e tenta
  // novamente sem apagar a sessão nem perder a fila do notificador.
  const watchdog = setTimeout(async () => {
    if (client !== c || state.status !== "starting") return;
    state.lastError = "Tempo excedido ao reconectar; tentando novamente";
    console.warn(`[whatsapp] ${state.lastError}`);
    client = null;
    await Promise.race([
      destroyQuietly(c),
      new Promise(resolve => setTimeout(resolve, 10000))
    ]);
    const retry = setTimeout(start, RESTART_DELAY_MS);
    if (retry.unref) retry.unref();
  }, START_TIMEOUT_MS);
  if (watchdog.unref) watchdog.unref();

  return getStatus();
}

async function stop() {
  if (!client) return;
  pararRelogioDoQr();
  stopping = true;
  const c = client;
  client = null;
  await destroyQuietly(c);
  state.status = "off";
  state.qrSvg = "";
  state.me = null;
  stopping = false;
}

// Desconecta o número e apaga a sessão salva: o próximo start() vai pedir
// QR de novo.
async function logout() {
  pararRelogioDoQr();
  const c = client;
  client = null;
  stopping = true;

  if (c) {
    try {
      // Com teto, pelo mesmo motivo do `destroyQuietly`: um Chrome travado não
      // pode deixar `stopping` em true para sempre. A sessão em disco é apagada
      // logo abaixo de qualquer jeito, que é o que "sair" precisa garantir.
      await Promise.race([
        c.logout(),
        new Promise(resolve => setTimeout(resolve, DESTROY_TIMEOUT_MS)),
      ]);
    } catch (error) {
      console.warn(`[whatsapp] logout: ${error.message}`);
    }
    await destroyQuietly(c);
  }

  apagarMarcaDePareamento();
  try {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[whatsapp] não consegui apagar a sessão salva: ${error.message}`);
  }

  state.status = "off";
  state.qrSvg = "";
  state.me = null;
  state.lastError = null;
  stopping = false;
}

function getStatus() {
  return {
    status: state.status,
    connected: state.status === "ready",
    qrSvg: state.status === "qr" ? state.qrSvg : "",
    qrAt: state.qrAt,
    lastError: state.lastError,
    me: state.me,
    hasSession: hasSession(),
    running: Boolean(client)
  };
}

function requireReady() {
  if (state.status !== "ready" || !client) {
    throw new Error("WhatsApp não está conectado. Leia o QR na aba WhatsApp do painel.");
  }
  return client;
}

function sortGroups(list) {
  const seen = new Set();
  return list
    .filter(g => g.id && g.id.endsWith("@g.us") && !seen.has(g.id) && seen.add(g.id))
    .map(g => ({ id: g.id, name: g.name || g.id, participants: g.participants || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// Lê os grupos direto da coleção de conversas do WhatsApp Web.
//
// É o caminho preferido porque o getChats() da biblioteca monta o modelo
// completo de TODAS as conversas, e pra cada grupo ele dá um
// `groupMetadata.update()` — uma ida à rede. Tudo isso dentro de um
// Promise.all: basta UM grupo falhar (saiu do grupo, metadado indisponível)
// pra lista inteira estourar. Era esse o erro "r", minificado, que vinha do
// código do próprio WhatsApp.
//
// Aqui só lemos id e nome do que já está carregado em memória, sem tocar na
// rede, e uma conversa problemática é pulada sem derrubar o resto.
async function groupsFromStore(c) {
  if (!c.pupPage) return null;

  return c.pupPage.evaluate(() => {
    // WAWebCollections é o módulo interno atual; window.Store é o nome
    // antigo, mantido pra não quebrar em versões mais velhas.
    let collection = null;
    try {
      collection = window.require("WAWebCollections").Chat;
    } catch {
      collection = window.Store && window.Store.Chat;
    }
    if (!collection) return null;

    const models = typeof collection.getModelsArray === "function"
      ? collection.getModelsArray()
      : (collection.models || []);

    const out = [];
    for (const chat of models) {
      try {
        const id = chat && chat.id && (chat.id._serialized || String(chat.id));
        if (!id || !String(id).endsWith("@g.us")) continue;
        const meta = chat.groupMetadata;
        out.push({
          id: String(id),
          name: String(chat.formattedTitle || chat.name || "").trim(),
          participants: (meta && meta.participants && meta.participants.length) || 0
        });
      } catch {
        // conversa isolada com formato estranho: ignora e segue
      }
    }
    return out;
  });
}

async function groupsFromChats(c) {
  const chats = await c.getChats();
  return chats.filter(chat => chat.isGroup).map(chat => ({
    id: chat.id._serialized,
    name: String(chat.name || "").trim(),
    participants: Array.isArray(chat.participants) ? chat.participants.length : 0
  }));
}

async function groupsFromContacts(c) {
  const contacts = await c.getContacts();
  return contacts
    .filter(x => x.isGroup || (x.id && x.id.server === "g.us"))
    .map(x => ({
      id: x.id._serialized,
      name: String(x.name || x.pushname || "").trim(),
      participants: 0
    }));
}

async function getGroups() {
  const c = requireReady();
  const strategies = [
    ["store", groupsFromStore],
    ["getChats", groupsFromChats],
    ["contacts", groupsFromContacts]
  ];

  const problems = [];
  let anySucceeded = false;

  for (const [name, run] of strategies) {
    try {
      const found = await run(c);
      if (!Array.isArray(found)) {
        problems.push(`${name}: indisponível`);
        continue;
      }
      anySucceeded = true;
      if (found.length) {
        console.log(`[whatsapp] ${found.length} grupo(s) lidos via ${name}`);
        return sortGroups(found);
      }
      problems.push(`${name}: nenhum grupo`);
    } catch (error) {
      problems.push(`${name}: ${error.message || error}`);
    }
  }

  // Achar zero grupos é resposta legítima (conta sem grupo, ou lista ainda
  // sincronizando) — só é erro quando nenhuma estratégia conseguiu ler.
  if (anySucceeded) {
    console.log(`[whatsapp] nenhum grupo encontrado (${problems.join(" | ")})`);
    return [];
  }

  throw new Error(`Não consegui ler a lista de grupos. Tentativas: ${problems.join(" | ")}`);
}

async function sendText(to, text) {
  const c = requireReady();
  if (!to) throw new Error("Nenhum grupo/destino escolhido");
  return c.sendMessage(to, text);
}

/*
 * Chamado na subida do servidor: se já houve pareamento, reconecta sozinho pra
 * que os avisos voltem sem ninguém precisar mexer no painel.
 *
 * TRÊS CASOS, E O DO MEIO É O QUE CUSTAVA CARO:
 *
 *   marca de pareamento          reconecta, e vai direto para "ready"
 *   perfil sem marca             tenta uma vez, com prazo
 *   nada                         não abre navegador nenhum
 *
 * O caso do meio existe por duas razões diferentes, e não dá para distingui-las
 * daqui: pode ser um pareamento abandonado no meio (o perfil fica, e não há o
 * que reconectar), ou pode ser alguém que já usava o bot ANTES desta marca
 * existir — e recusar aí desligaria os avisos de quem estava com tudo
 * funcionando, sem avisar.
 *
 * Então tenta. Se estava pareado, sobe direto para "ready" e a marca passa a
 * existir; da próxima vez cai no primeiro caso. Se não estava, aparece um QR —
 * e agora o relógio o fecha em poucos minutos, em vez de segurar um Chrome a
 * noite inteira. O pior caso deixou de ser caro.
 */
function autoStart() {
  if (hasSession()) {
    console.log("[whatsapp] pareamento anotado, reconectando...");
    start();
    return;
  }

  if (temPerfilGuardado()) {
    console.log("[whatsapp] há um perfil guardado, mas sem pareamento anotado —"
      + ` tentando reconectar. Se aparecer QR, ele se fecha em ${prazoDoQrEmTexto()}.`);
    start();
    return;
  }

  console.log("[whatsapp] nenhuma sessão salva — leia o QR na aba WhatsApp do painel.");
}

module.exports = { start, stop, logout, getStatus, getGroups, sendText, autoStart, hasSession, SESSION_DIR };
