const { printEvents } = require("../services/printEvents");
const { getSettings, isReady } = require("./settings");
const { sendText, getStatus } = require("./client");

// As máquinas falam em ritmos diferentes: a 02 avisa o início pelo log ao
// vivo e o fim pelo CSV; a 04 manda percentual a cada segundo; a 06/07
// reescrevem o mesmo registro. O mesmo trabalho pode então gerar dois ou
// três eventos quase simultâneos dizendo a mesma coisa. Em vez de mandar
// duas mensagens no grupo, seguramos o aviso por alguns segundos, juntamos
// tudo que chegou nesse intervalo e mandamos UMA mensagem com os dados mais
// completos (o CSV, por exemplo, chega depois mas traz a metragem).
const START_DEBOUNCE_MS = Number(process.env.WA_START_DEBOUNCE_MS || 2500);
const FINISH_DEBOUNCE_MS = Number(process.env.WA_FINISH_DEBOUNCE_MS || 5000);

// Depois de mandado, o mesmo aviso fica bloqueado por esse tempo — cobre o
// evento atrasado que chega fora da janela de debounce.
const DEDUPE_TTL_MS = Number(process.env.WA_DEDUPE_TTL_MS || 180000);

const MAX_ATTEMPTS = 3;
const RETRY_MS = 20000;
const MAX_QUEUE = 200;

// Trabalho em andamento por máquina: usado pra saber quando o "imprimindo"
// é um trabalho novo (avisa) ou o mesmo de sempre (ignora), e pra calcular
// a duração quando a máquina não informa o tempo.
const current = new Map();

// Avisos represados esperando a janela de debounce fechar.
const pending = new Map();

// key -> timestamp do último envio, pro corte de duplicata.
const recent = new Map();

const outbox = [];
let working = false;

const stats = { sent: 0, failed: 0, lastSentAt: 0, lastError: null, lastMessage: "" };

function normalizeTask(task) {
  return String(task || "").trim().toLowerCase();
}

function machineAllowed(settings, machineId) {
  if (!settings.machines.length) return true;
  return settings.machines.includes(String(machineId || ""));
}

function fmt(n, digits = 2) {
  return Number(n || 0).toFixed(digits).replace(".", ",");
}

function durationLabel(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m) return `${m}min ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function nowLabel() {
  return new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function line(label, value) {
  return `*${label}:* ${value}`;
}

function buildMessage(kind, p) {
  const machine = p.machineName || p.machineId || "Máquina";
  const task = p.task || "(sem nome)";
  const lines = [];

  if (kind === "start") {
    lines.push("🖨️ *Impressão iniciada*", "");
    lines.push(line("Máquina", machine));
    lines.push(line("Trabalho", task));
    if (Number(p.printLength) > 0) lines.push(line("Metragem prevista", `${fmt(p.printLength)} m`));
    lines.push(line("Início", nowLabel()));
    return lines.join("\n");
  }

  if (kind === "error") {
    lines.push("⚠️ *Impressão interrompida*", "");
    lines.push(line("Máquina", machine));
    lines.push(line("Trabalho", task));
    lines.push(line("Situação", p.cancelled ? "Cancelada" : p.status || "Erro"));
    lines.push(line("Quando", nowLabel()));
    return lines.join("\n");
  }

  // finish
  const seconds = Number(p.timeSeconds || 0) > 0
    ? Number(p.timeSeconds)
    : (p.startedAt ? (Date.now() - Number(p.startedAt)) / 1000 : 0);

  lines.push("✅ *Impressão finalizada*", "");
  lines.push(line("Máquina", machine));
  lines.push(line("Trabalho", task));
  if (Number(p.printLength) > 0) lines.push(line("Metros", `${fmt(p.printLength)} m`));
  if (Number(p.printArea) > 0) lines.push(line("Área", `${fmt(p.printArea)} m²`));
  if (seconds > 0) lines.push(line("Duração", durationLabel(seconds)));
  if (Number(p.inkMl) > 0) lines.push(line("Tinta", `${fmt(p.inkMl)} mL`));
  if (Array.isArray(p.inkChannels) && p.inkChannels.some(channel => Number(channel?.ml) > 0)) {
    const colors = p.inkChannels
      .filter(channel => channel && typeof channel === "object")
      .map(channel => `${channel.code || channel.color}: ${fmt(channel.ml)} mL`)
      .join(" | ");
    if (colors) lines.push(line("CMYK", colors));
  }
  lines.push(line("Fim", nowLabel()));
  return lines.join("\n");
}

// Junta o que chegou depois em cima do que já estava represado, sem deixar
// um evento pobre (metragem 0, tempo nulo) apagar um dado que já tínhamos.
function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "number" && value === 0 && Number(out[key] || 0) > 0) continue;
    out[key] = value;
  }
  return out;
}

function pruneRecent() {
  const limit = Date.now() - DEDUPE_TTL_MS;
  for (const [key, at] of recent.entries()) {
    if (at < limit) recent.delete(key);
  }
}

function enabledFor(settings, kind) {
  if (kind === "start") return settings.notifyStart;
  if (kind === "finish") return settings.notifyFinish;
  return settings.notifyError;
}

function schedule(kind, payload) {
  const settings = getSettings();
  if (!isReady(settings)) return;
  if (!enabledFor(settings, kind)) return;
  if (!machineAllowed(settings, payload.machineId)) return;

  const task = String(payload.task || "").trim();
  if (!task) return;

  const key = `${payload.machineId}|${kind}|${normalizeTask(task)}`;

  pruneRecent();
  if (recent.has(key)) return;

  const held = pending.get(key);
  if (held) {
    held.payload = merge(held.payload, payload);
    return;
  }

  const entry = { payload, timer: null };
  entry.timer = setTimeout(() => {
    pending.delete(key);
    recent.set(key, Date.now());
    enqueue(buildMessage(kind, entry.payload));
  }, kind === "start" ? START_DEBOUNCE_MS : FINISH_DEBOUNCE_MS);

  if (entry.timer.unref) entry.timer.unref();
  pending.set(key, entry);
}

function enqueue(text) {
  if (outbox.length >= MAX_QUEUE) {
    console.warn("[whatsapp] fila cheia — descartando o aviso mais antigo");
    outbox.shift();
  }
  outbox.push({ text, attempts: 0 });
  drain();
}

async function drain() {
  if (working) return;
  working = true;

  try {
    while (outbox.length) {
      const settings = getSettings();
      if (!isReady(settings)) {
        // Desligaram o bot no meio do caminho: joga fora o que sobrou em vez
        // de segurar mensagem velha pra mandar quando religar.
        outbox.length = 0;
        return;
      }

      // Conexão ainda subindo (reinício do PC, por exemplo) é situação
      // passageira: segura a fila e tenta de novo em vez de perder o aviso.
      if (!getStatus().connected) {
        stats.lastError = "WhatsApp ainda não conectado — avisos aguardando na fila";
        const wait = setTimeout(drain, RETRY_MS);
        if (wait.unref) wait.unref();
        return;
      }

      const item = outbox[0];
      try {
        await sendText(settings.groupId, item.text);
        outbox.shift();
        stats.sent += 1;
        stats.lastSentAt = Date.now();
        stats.lastError = null;
        stats.lastMessage = item.text;
        console.log(`[whatsapp] enviado para ${settings.groupName || settings.groupId}`);
      } catch (error) {
        item.attempts += 1;
        stats.lastError = error.message;
        console.warn(`[whatsapp] falha ao enviar (tentativa ${item.attempts}/${MAX_ATTEMPTS}): ${error.message}`);

        if (item.attempts >= MAX_ATTEMPTS) {
          outbox.shift();
          stats.failed += 1;
          continue;
        }

        const retry = setTimeout(drain, RETRY_MS);
        if (retry.unref) retry.unref();
        return;
      }
    }
  } finally {
    working = false;
  }
}

function handleProgress(payload) {
  if (!payload || !payload.machineId) return;

  const state = String(payload.progressState || "");
  const task = String(payload.task || "").trim();

  if (state === "printing") {
    if (!task) return;
    const active = current.get(payload.machineId);
    // Enquanto for o mesmo trabalho, os eventos são só atualização de
    // percentual — nada a avisar.
    if (active && active.task === task) return;
    current.set(payload.machineId, { task, startedAt: Date.now() });
    if (payload.suppressStartNotification) {
      console.log(`[whatsapp] ${payload.machineId}: "${task}" já estava em andamento ao iniciar a central — aviso de início suprimido`);
      return;
    }
    schedule("start", payload);
    return;
  }

  // "cancelled" só aparece nas máquinas AT (06/07); as outras fontes usam
  // "error". Os três são fim de linha: fecham o trabalho corrente.
  if (state === "completed" || state === "error" || state === "cancelled") {
    const active = current.get(payload.machineId);
    const finalTask = task || (active && active.task) || "";
    // Na Impressora 04, "Ready" também ocorre ao adicionar/remover arquivos
    // da fila. Uma conclusão do log ao vivo só é válida se o mesmo trabalho
    // tiver sido visto antes em Printing.
    if (state === "completed" && payload.sourceType === "live-log" && (!active || active.task !== finalTask)) {
      console.log(`[whatsapp] ${payload.machineId}: conclusão ignorada para "${finalTask}" — arquivo não chegou a imprimir`);
      return;
    }
    const startedAt = active && active.task === finalTask ? active.startedAt : null;
    current.delete(payload.machineId);
    if (!finalTask) return;
    schedule(state === "completed" ? "finish" : "error", {
      ...payload,
      task: finalTask,
      startedAt,
      cancelled: payload.cancelled || state === "cancelled"
    });
  }
}

function handleNewPrint(record) {
  if (!record || !record.machineId) return;

  const active = current.get(record.machineId);
  const task = String(record.task || "").trim();
  const startedAt = active && active.task === task ? active.startedAt : null;
  if (active && active.task === task) current.delete(record.machineId);

  if (record.cancelled || record.error) {
    schedule("error", { ...record, startedAt });
    return;
  }

  schedule("finish", { ...record, startedAt });
}

function startWhatsappNotifier() {
  printEvents.on("ink-level-alert", payload => {
    try {
      const settings = getSettings();
      if (!isReady(settings) || !machineAllowed(settings, payload.machineId)) return;
      const names = (payload.newlyLow || payload.colors || []).join(", ");
      if (!names) return;
      enqueue([
        "⚠️ *Tinta próxima de acabar*",
        "",
        line("Máquina", payload.machineName || payload.machineId),
        line("Cor", names),
        line("Ação", "Verificar e abastecer o reservatório"),
        line("Quando", nowLabel())
      ].join("\n"));
    } catch (error) {
      console.warn(`[whatsapp] erro ao tratar nível de tinta: ${error.message}`);
    }
  });

  printEvents.on("print-progress", payload => {
    try { handleProgress(payload); }
    catch (error) { console.warn(`[whatsapp] erro ao tratar progresso: ${error.message}`); }
  });

  printEvents.on("new-print", record => {
    try { handleNewPrint(record); }
    catch (error) { console.warn(`[whatsapp] erro ao tratar novo registro: ${error.message}`); }
  });

  const settings = getSettings();
  if (isReady(settings)) {
    console.log(`[whatsapp] bot ativo — avisos vão para "${settings.groupName || settings.groupId}"`);
  } else if (settings.enabled) {
    console.log("[whatsapp] bot ligado mas sem grupo escolhido — escolha na aba WhatsApp do painel.");
  } else {
    console.log("[whatsapp] bot desligado — ative na aba WhatsApp do painel.");
  }
}

async function sendCustom(text) {
  const settings = getSettings();
  if (!settings.groupId) throw new Error("Nenhum grupo escolhido");
  return sendText(settings.groupId, text);
}

function notifierStatus() {
  return {
    queued: outbox.length,
    pending: pending.size,
    active: [...current.entries()].map(([machineId, v]) => ({ machineId, task: v.task, startedAt: v.startedAt })),
    ...stats
  };
}

module.exports = { startWhatsappNotifier, sendCustom, notifierStatus };
