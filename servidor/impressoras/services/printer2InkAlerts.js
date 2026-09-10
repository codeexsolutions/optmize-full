const fs = require("fs/promises");
const path = require("path");
const { setInkLowColors } = require("./inkLevelState");

const POLL_MS = Number(process.env.PRINTER2_INK_ALERT_POLL_MS || 1500);
const CLEAR_AFTER_ZERO_READS = Number(process.env.PRINTER2_INK_CLEAR_READS || 3);

const ALERTS = new Map([
  ["4020034", "Preto"],
  ["4020035", "Ciano"],
  ["4020036", "Magenta"],
  ["4020037", "Amarelo"],
  ["4020047", "Reservatório vazio"],
  ["402003a", "Descarte cheio"]
]);

const state = new Map();

function normalizeCode(value) {
  return String(value || "").toLowerCase().replace(/^0x/, "").replace(/^0+/, "") || "0";
}

async function newestLog(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let best = null;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await newestLog(full).catch(() => null);
      if (nested && (!best || nested.mtimeMs > best.mtimeMs)) best = nested;
      continue;
    }
    if (!entry.isFile() || entry.name.toLowerCase() !== "log.txt") continue;
    const stat = await fs.stat(full);
    const item = { file: full, size: stat.size, mtimeMs: stat.mtimeMs };
    if (!best || item.mtimeMs > best.mtimeMs) best = item;
  }
  return best;
}

async function readNew(file, offset) {
  const stat = await fs.stat(file);
  if (stat.size < offset) offset = 0;
  if (stat.size === offset) return { text: "", offset };
  const handle = await fs.open(file, "r");
  try {
    const length = stat.size - offset;
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return { text: buffer.subarray(0, bytesRead).toString("utf8"), offset: offset + bytesRead };
  } finally {
    await handle.close();
  }
}

function emitLevel(io, machine, colors) {
  const level = setInkLowColors(machine.id, colors);
  if (!level.changed) return;
  io.emit("ink-level-status", {
    machineId: machine.id,
    machineName: machine.name,
    colors: level.colors,
    replenished: level.replenished,
    at: Date.now()
  });
  if (level.newlyLow.length) {
    io.emit("ink-level-alert", {
      machineId: machine.id,
      machineName: machine.name,
      colors: level.colors,
      newlyLow: level.newlyLow,
      at: Date.now()
    });
  }
}

async function tickMachine(io, machine) {
  const latest = await newestLog(machine.statusLogDir);
  if (!latest) return;
  let current = state.get(machine.id);
  if (!current || current.file !== latest.file) {
    state.set(machine.id, { file: latest.file, offset: latest.size, colors: new Set(), zeroReads: 0 });
    console.log(`[printer2-ink-alert] acompanhando ${latest.file} a partir do byte ${latest.size}`);
    return;
  }

  const chunk = await readNew(current.file, current.offset);
  current.offset = chunk.offset;
  if (!chunk.text) return;

  const regex = /ErrorCode\s*=\s*0x([0-9a-f]+)/gi;
  let match;
  let sawZero = false;
  while ((match = regex.exec(chunk.text))) {
    const code = normalizeCode(match[1]);
    const color = ALERTS.get(code);
    if (color) {
      current.colors.add(color);
      current.zeroReads = 0;
      sawZero = false;
    } else if (code === "0") {
      sawZero = true;
    }
  }

  if (sawZero && current.colors.size) {
    current.zeroReads += 1;
    if (current.zeroReads >= CLEAR_AFTER_ZERO_READS) {
      current.colors.clear();
      current.zeroReads = 0;
    }
  }
  emitLevel(io, machine, [...current.colors]);
}

function startPrinter2InkAlerts(io, loadMachines) {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const machines = await loadMachines();
      for (const machine of machines.filter(item => item.type === "csv" && item.statusLogDir && item.enabled !== false)) {
        try { await tickMachine(io, machine); }
        catch (error) { console.warn(`[printer2-ink-alert] ${machine.id}: ${error.message}`); }
      }
    } finally {
      running = false;
    }
  }
  setInterval(tick, POLL_MS);
  tick();
}

module.exports = { startPrinter2InkAlerts };
