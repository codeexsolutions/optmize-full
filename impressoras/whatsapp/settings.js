const fs = require("fs");
const path = require("path");
const { arquivoDeConfig } = require("../../caminhos");

const FILE = arquivoDeConfig("whatsapp.json");

// Não há URL nem chave de API: o WhatsApp roda dentro do próprio processo
// (ver client.js). O que sobra pra configurar é só o destino e as regras.
const DEFAULTS = {
  // Grupo escolhido no painel. O id é o JID (ex: 1203...@g.us).
  groupId: "",
  groupName: "",
  // Chave geral: com false o bot não manda nada, mesmo conectado.
  enabled: false,
  notifyStart: true,
  notifyFinish: true,
  notifyError: true,
  // Lista de machineId que devem notificar. Vazia = todas.
  machines: []
};

const BOOLEAN_KEYS = ["enabled", "notifyStart", "notifyFinish", "notifyError"];
const STRING_KEYS = ["groupId", "groupName"];

let cache = null;

function readFile() {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[whatsapp] config/whatsapp.json inválido, usando padrões: ${error.message}`);
    }
    return {};
  }
}

function normalize(data) {
  const out = { ...DEFAULTS };

  for (const key of STRING_KEYS) {
    if (typeof data[key] === "string") out[key] = data[key].trim();
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof data[key] === "boolean") out[key] = data[key];
  }
  if (Array.isArray(data.machines)) {
    out.machines = data.machines.map(id => String(id || "").trim()).filter(Boolean);
  }

  return out;
}

function getSettings() {
  if (!cache) cache = normalize(readFile());
  return cache;
}

function saveSettings(patch) {
  const next = normalize({ ...getSettings(), ...(patch || {}) });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
  cache = next;
  return next;
}

// Pronto pra realmente disparar mensagem de impressão (a conexão em si é
// checada à parte, no client).
function isReady(s = getSettings()) {
  return Boolean(s.enabled && s.groupId);
}

module.exports = { getSettings, saveSettings, isReady, DEFAULTS, FILE };
