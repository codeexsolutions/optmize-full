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
const START_TIMEOUT_MS = Number(process.env.WA_START_TIMEOUT_MS || 60000);
const RESTART_DELAY_MS = Number(process.env.WA_RESTART_DELAY_MS || 5000);

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

function hasSession() {
  try {
    return fs.existsSync(SESSION_DIR) && fs.readdirSync(SESSION_DIR).length > 0;
  } catch {
    return false;
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
  });

  c.on("authenticated", () => {
    console.log("[whatsapp] autenticado, carregando a sessão...");
    state.status = "starting";
    state.qrSvg = "";
  });

  c.on("ready", () => {
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
  });

  c.on("auth_failure", message => {
    state.status = "error";
    state.qrSvg = "";
    state.lastError = `Falha de autenticação: ${message}`;
    console.warn(`[whatsapp] ${state.lastError}`);
  });

  c.on("disconnected", reason => {
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
    await c.destroy();
  } catch (error) {
    console.warn(`[whatsapp] erro ao encerrar o cliente: ${error.message}`);
  }
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

  const c = buildClient(navegador);
  client = c;
  wire(c);

  c.initialize().catch(error => {
    state.status = "error";
    state.lastError = error.message;
    console.error(`[whatsapp] não consegui iniciar: ${error.message}`);
    if (client === c) client = null;
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
  const c = client;
  client = null;
  stopping = true;

  if (c) {
    try {
      await c.logout();
    } catch (error) {
      console.warn(`[whatsapp] logout: ${error.message}`);
    }
    await destroyQuietly(c);
  }

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

// Chamado na subida do servidor: se já existe sessão salva, reconecta
// sozinho pra que os avisos voltem sem ninguém precisar mexer no painel.
function autoStart() {
  if (!hasSession()) {
    console.log("[whatsapp] nenhuma sessão salva — leia o QR na aba WhatsApp do painel.");
    return;
  }
  console.log("[whatsapp] sessão salva encontrada, reconectando...");
  start();
}

module.exports = { start, stop, logout, getStatus, getGroups, sendText, autoStart, hasSession, SESSION_DIR };
