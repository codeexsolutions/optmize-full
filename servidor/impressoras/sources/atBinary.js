const fs = require("fs/promises");
const iconv = require("iconv-lite");
const { addDays, enumerateDays } = require("../utils/date");

const RECORD_SIZE = 392;
// Campo de tinta ainda experimental/calibrado com a tela do AT.
const INK_RAW_PER_ML = Number(process.env.INK_RAW_PER_ML || "192622951.14307776");

const FINISH_TOLERANCE = Number(process.env.AT_FINISH_TOLERANCE || "0.001");

function calcProgress(finish, total, cancelled) {
  const f = Number(finish || 0);
  const t = Number(total || 0);

  if (cancelled) {
    return { progressPercent: t > 0 ? Math.max(0, Math.min(100, (f / t) * 100)) : 0, progressState: "cancelled" };
  }

  if (!(t > 0)) {
    return { progressPercent: 0, progressState: "unknown" };
  }

  const pct = Math.max(0, Math.min(100, (f / t) * 100));
  const completed = Math.abs(f - t) <= FINISH_TOLERANCE || f >= t;

  return {
    progressPercent: completed ? 100 : pct,
    progressState: completed ? "completed" : "printing"
  };
}

function zeroTerminated(buffer, start, end) {
  const slice = buffer.subarray(start, end);
  const i = slice.indexOf(0);
  return i >= 0 ? slice.subarray(0, i) : slice;
}

function text(buffer, start, end) {
  return iconv.decode(zeroTerminated(buffer, start, end), "win1252").trim();
}

function parseRecord(buffer, machine, recordIndex) {
  const dateTime = text(buffer, 0, 20);
  const task = text(buffer, 20, 275);
  const cancel = String.fromCharCode(buffer[275] || 0);
  const pass = buffer.readUInt32LE(276);
  const printArea = buffer.readDoubleLE(280);
  const finish = buffer.readDoubleLE(288);
  const printLength = buffer.readDoubleLE(296);
  const inkRaw = buffer.readDoubleLE(312);
  const total = buffer.readDoubleLE(328);
  const timeHours = buffer.readDoubleLE(336);
  const inkMl = Number.isFinite(inkRaw) && inkRaw >= 0 ? inkRaw / INK_RAW_PER_ML : 0;
  const cancelled = cancel === "Y";
  const progress = calcProgress(finish, total, cancelled);

  return {
    id: `${machine.id}|record|${recordIndex}`,
    machineId: machine.id,
    machineName: machine.name,
    sourceType: machine.type,
    dateTime,
    date: dateTime.slice(0, 10),
    time: dateTime.slice(11, 19),
    task,
    pass,
    status: cancelled
      ? "Cancelado"
      : progress.progressState === "completed"
        ? "Concluído"
        : "Em impressão",
    cancelled,
    error: false,
    printArea,
    printLength,
    finish,
    total,
    progressPercent: progress.progressPercent,
    progressState: progress.progressState,
    timeHours,
    timeSeconds: Math.max(0, Math.round(timeHours * 3600)),
    inkMl,
    inkExperimental: true,
    previewRef: task
  };
}

async function readRecordAt(handle, index) {
  const b = Buffer.allocUnsafe(RECORD_SIZE);
  const { bytesRead } = await handle.read(b, 0, RECORD_SIZE, index * RECORD_SIZE);
  return bytesRead === RECORD_SIZE ? b : null;
}

async function dateAt(handle, index) {
  const b = await readRecordAt(handle, index);
  return b ? text(b, 0, 20).slice(0, 10) : "";
}

async function lowerBound(handle, count, target) {
  let lo = 0, hi = count;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const d = await dateAt(handle, mid);
    if (d < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

async function readRange(machine, start, end) {
  const handle = await fs.open(machine.historyPath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size % RECORD_SIZE !== 0) {
      throw new Error(`PrintHistory inválido: ${stat.size} bytes`);
    }
    const count = stat.size / RECORD_SIZE;
    const startIndex = await lowerBound(handle, count, start);
    const endIndex = await lowerBound(handle, count, addDays(end, 1));
    const qty = Math.max(0, endIndex - startIndex);
    if (!qty) return [];

    const dayBlock = Buffer.allocUnsafe(qty * RECORD_SIZE);
    const { bytesRead } = await handle.read(dayBlock, 0, dayBlock.length, startIndex * RECORD_SIZE);
    if (bytesRead !== dayBlock.length) throw new Error("Leitura incompleta do PrintHistory");

    const records = [];
    for (let i = 0; i < qty; i++) {
      const rec = parseRecord(dayBlock.subarray(i * RECORD_SIZE, (i + 1) * RECORD_SIZE), machine, startIndex + i);
      if (rec.date >= start && rec.date <= end) records.push(rec);
    }
    return records;
  } finally {
    await handle.close();
  }
}

async function signature(machine) {
  const stat = await fs.stat(machine.historyPath);
  return `${stat.size}:${stat.mtimeMs}`;
}

module.exports = { readRange, signature };
