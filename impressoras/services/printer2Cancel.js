// Cancelamentos da Impressora 02.
//
// O History.csv só ganha linha quando o trabalho TERMINA — cancelado não
// aparece lá. O log resumido da raiz (log.txt) também não diz nada sobre
// cancelamento.
//
// Mas a 02 mantém um SEGUNDO log, detalhado, em Log\[sessão]\log.txt — o
// mesmo formato que a Impressora 04 usa. Nele existe o sinal explícito:
//
//   2026-08-14 16:07:42 ... crystalLabel_Status.Text is Printing
//   2026-08-14 17:32:16 ... crystalLabel_Status.Text is Aborting   <- cancelou
//
// Esses logs guardam data completa e cobrem todo o histórico da máquina, o
// que permite tanto importar o passado quanto detectar ao vivo.
//
// Atenção a uma armadilha: "WorkingThreadProc job X" significa apenas que o
// arquivo foi CARREGADO, não que imprimiu — é comum o operador carregar e o
// status seguir em "Ready". Por isso um cancelamento só é contado quando o
// trabalho chegou a entrar em "Printing" antes do "Aborting".

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const iconv = require("iconv-lite");
const { upsertMany, queryAll } = require("../db/records");
const { pastaDeDados } = require("../../caminhos");

const JOB_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):\d+,\d+,WorkingThreadProc\s+job\s+(.+?)\s*$/;
const STATUS_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):\d+,\d+,crystalLabel_Status\.Text is (\w+)/;
const PCT_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):\d+,\d+,Percentage is ([\d.]+)%/;

const WATCH_MS = Number(process.env.PRINTER2_ABORT_POLL_MS || 5000);
const INK_ML_PER_M2 = Number(process.env.PRINTER2_INK_ML_PER_M2 || 3);

// O log é escrito pelo Windows em cp1252 — lido como utf8, "DEGRADÊ" vira
// "DEGRAD?".
const ENCODING = "win1252";

const STATE_FILE = path.join(pastaDeDados("."), "impressoras-cancelamento-csv.json");
const liveProgressState = new Map();

function basename(value) {
  return String(value || "").trim().split(/[\\/]/).pop() || "";
}

function makeScanner() {
  return { job: null, printing: false, printStart: null, percent: 0 };
}

// Percorre as linhas mantendo o estado entre chamadas (o tail ao vivo vai
// chamando isso com cada pedaço novo do arquivo) e devolve os cancelamentos.
function scanLines(scanner, text) {
  const found = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;

    let m = JOB_RE.exec(line);
    if (m) {
      scanner.job = basename(m[2]);
      scanner.printing = false;
      scanner.printStart = null;
      scanner.percent = 0;
      continue;
    }

    m = PCT_RE.exec(line);
    if (m) {
      scanner.percent = Number(m[2]) || 0;
      continue;
    }

    m = STATUS_RE.exec(line);
    if (!m) continue;

    const [, timestamp, status] = m;

    if (status === "Printing") {
      if (!scanner.printing) {
        scanner.printing = true;
        scanner.printStart = timestamp;
      }
    } else if (status === "Aborting") {
      if (scanner.printing && scanner.job) {
        found.push({
          task: scanner.job,
          startedAt: scanner.printStart || timestamp,
          abortedAt: timestamp,
          percent: scanner.percent
        });
      }
      scanner.printing = false;
    } else if (status === "Ready") {
      // Encerramento normal: evita considerar como ativo, numa futura
      // reinicialização da central, um trabalho que já terminou.
      scanner.printing = false;
    }
  }

  return found;
}

// Trabalho cancelado não tem metragem em lugar nenhum. Mas o mesmo arquivo
// quase sempre já rodou inteiro antes, e essa execução completa está no
// histórico — dela sai o tamanho total do trabalho, que multiplicado pelo
// percentual atingido dá quanto de material foi realmente gasto.
function estimateFromTwin(cache, machineId, task, percent) {
  if (!cache.records) {
    cache.records = queryAll().filter(r => r.machineId === machineId && !r.cancelled && Number(r.printLength) > 0);
  }

  const key = String(task || "").toLowerCase();
  const twin = cache.records.find(r => String(r.task || "").toLowerCase() === key);
  if (!twin) return { printLength: 0, printArea: 0, previewRef: task, estimated: false };

  const ratio = Math.max(0, Math.min(100, Number(percent || 0))) / 100;
  return {
    printLength: Number(twin.printLength) * ratio,
    printArea: Number(twin.printArea || 0) * ratio,
    previewRef: twin.previewRef || task,
    estimated: true
  };
}

function buildRecord(machine, event, cache) {
  const [date, time] = event.startedAt.split(" ");
  const started = new Date(event.startedAt.replace(" ", "T"));
  const aborted = new Date(event.abortedAt.replace(" ", "T"));
  const seconds = Math.max(0, Math.round((aborted - started) / 1000));

  const size = estimateFromTwin(cache, machine.id, event.task, event.percent);

  return {
    id: `${machine.id}|cancel|${event.startedAt}|${event.task}`,
    machineId: machine.id,
    machineName: machine.name,
    sourceType: machine.type,
    dateTime: `${date} ${time}`,
    date,
    time,
    endDateTime: event.abortedAt,
    task: event.task,
    pass: null,
    status: "Cancelado",
    cancelled: true,
    error: false,
    // Metragem estimada pelo percentual atingido — é o material realmente
    // gasto. Registros cancelados ficam fora dos totais do resumo, então
    // isso não contamina nenhuma soma.
    printArea: size.printArea,
    printLength: size.printLength,
    metricEstimated: size.estimated,
    finish: null,
    total: null,
    timeSeconds: seconds,
    inkMl: size.printArea > 0 ? size.printArea * INK_ML_PER_M2 : 0,
    inkExperimental: size.printArea > 0,
    previewRef: size.previewRef,
    progressPercent: Number(event.percent || 0),
    progressState: "cancelled",
    isClipOrTile: false,
    metricSource: size.estimated ? "estimado-percentual" : "desconhecido",
    metricUnknown: !(size.printLength > 0)
  };
}

function buildLiveProgress(machine, scanner, cache) {
  const pct = Math.max(0, Math.min(100, Number(scanner.percent || 0)));
  const size = estimateFromTwin(cache, machine.id, scanner.job, pct);
  return {
    id: `${machine.id}|live-detail`,
    machineId: machine.id,
    machineName: machine.name,
    sourceType: "printer2-detail",
    task: scanner.job || "",
    status: "Em impressão",
    cancelled: false,
    error: false,
    finish: pct,
    total: 100,
    printLength: size.printLength,
    printArea: size.printArea,
    progressPercent: pct,
    progressState: "printing",
    progressAt: Date.now(),
    dateTime: scanner.printStart || ""
  };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.warn(`[printer2-cancel] não consegui salvar o controle da varredura: ${error.message}`);
  }
}

function sessionLogs(machine) {
  const dir = path.join(path.dirname(machine.historyPath), "Log");
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, "log.txt");
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size > 0) out.push({ name: entry.name, file, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // sessão sem log legível: ignora
    }
  }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

async function scanFile(file, from = 0) {
  const scanner = makeScanner();
  const events = [];

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file, from ? { start: from } : {}).pipe(iconv.decodeStream(ENCODING));
    let rest = "";
    stream.on("data", chunk => {
      const text = rest + chunk;
      const cut = text.lastIndexOf("\n");
      if (cut === -1) { rest = text; return; }
      events.push(...scanLines(scanner, text.slice(0, cut)));
      rest = text.slice(cut + 1);
    });
    stream.on("end", () => {
      if (rest) events.push(...scanLines(scanner, rest));
      resolve();
    });
    stream.on("error", reject);
  });

  return events;
}

// Reconstrói somente o estado atual da sessão mais recente. Usado na
// inicialização para reconhecer uma impressão que já estava rodando sem
// anunciar falsamente que ela começou depois que a central abriu.
async function currentSessionState(machine) {
  const logs = sessionLogs(machine);
  const current = logs[logs.length - 1];
  if (!current) return null;

  const scanner = makeScanner();
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(current.file).pipe(iconv.decodeStream(ENCODING));
    let rest = "";
    stream.on("data", chunk => {
      const text = rest + chunk;
      const cut = text.lastIndexOf("\n");
      if (cut === -1) { rest = text; return; }
      scanLines(scanner, text.slice(0, cut));
      rest = text.slice(cut + 1);
    });
    stream.on("end", () => {
      if (rest) scanLines(scanner, rest);
      resolve();
    });
    stream.on("error", reject);
  });

  return scanner;
}

// Varre os logs de sessão que ainda não foram lidos (ou que cresceram) e
// importa os cancelamentos. Idempotente: o id do registro vem do horário de
// início, então reimportar só sobrescreve o mesmo registro.
async function backfillAborts(io, machine) {
  const logs = sessionLogs(machine);
  if (!logs.length) return 0;

  const state = readState();
  const cache = {};
  let novos = 0;
  let lidos = 0;

  for (const log of logs) {
    const chave = `${machine.id}|${log.name}`;
    const previous = state[chave];
    if (previous && previous.size === log.size) continue;

    lidos++;
    let events = [];
    try {
      events = await scanFile(log.file);
    } catch (error) {
      console.warn(`[printer2-cancel] falha lendo ${log.name}: ${error.message}`);
      continue;
    }

    if (events.length) {
      const records = events.map(e => buildRecord(machine, e, cache));
      upsertMany(records);
      novos += records.length;
    }

    state[chave] = { size: log.size, scannedAt: Date.now(), aborts: events.length };
  }

  writeState(state);

  if (lidos) {
    console.log(`[printer2-cancel] ${machine.id}: ${lidos} log(s) de sessão varrido(s), ${novos} cancelamento(s) no histórico.`);
    if (novos) {
      io.emit("history-updated", { machineId: machine.id, machineName: machine.name, count: novos, at: Date.now() });
    }
  }

  return novos;
}

// Acompanha ao vivo o log da sessão corrente e avisa assim que um
// cancelamento acontece.
function startAbortWatcher(io, loadMachines) {
  const tails = new Map();
  let running = false;

  async function tick() {
    if (running) return;
    running = true;

    try {
      let machines = [];
      try {
        machines = await loadMachines();
      } catch {
        return;
      }

      for (const machine of machines.filter(m => m.type === "csv" && m.historyPath)) {
        try {
          const logs = sessionLogs(machine);
          const current = logs[logs.length - 1];
          if (!current) continue;

          let tail = tails.get(machine.id);

          // Sessão nova (o PrinterManager foi reaberto): começa do zero, que
          // é o começo do arquivo novo.
          if (!tail || tail.name !== current.name) {
            const initialScanner = await currentSessionState(machine) || makeScanner();
            tail = { name: current.name, offset: current.size, scanner: initialScanner, cache: {} };
            tails.set(machine.id, tail);
            console.log(`[printer2-cancel] ${machine.id}: acompanhando sessão ${current.name}`);
            if (initialScanner.printing && initialScanner.job) {
              const progress = buildLiveProgress(machine, initialScanner, tail.cache);
              liveProgressState.set(machine.id, progress);
              io.emit("print-progress", { ...progress, suppressStartNotification: true });
            }
            continue;
          }

          if (current.size <= tail.offset) {
            if (current.size < tail.offset) tail.offset = 0;
            continue;
          }

          const handle = await fsp.open(current.file, "r");
          let text = "";
          try {
            const length = current.size - tail.offset;
            const buffer = Buffer.allocUnsafe(length);
            const { bytesRead } = await handle.read(buffer, 0, length, tail.offset);
            text = iconv.decode(buffer.subarray(0, bytesRead), ENCODING);
            tail.offset += bytesRead;
          } finally {
            await handle.close();
          }

          const events = scanLines(tail.scanner, text);

          if (tail.scanner.printing && tail.scanner.job) {
            const progress = buildLiveProgress(machine, tail.scanner, tail.cache || (tail.cache = {}));
            liveProgressState.set(machine.id, progress);
            io.emit("print-progress", progress);
          } else {
            liveProgressState.delete(machine.id);
          }

          if (!events.length) continue;

          const cache = {};
          for (const event of events) {
            const record = buildRecord(machine, event, cache);
            upsertMany([record]);
            console.log(`[printer2-cancel] ${machine.id}: "${record.task}" cancelado em ${record.progressPercent}% após ${record.timeSeconds}s.`);
            io.emit("history-updated", { machineId: machine.id, machineName: machine.name, count: 1, at: Date.now() });
            io.emit("new-print", { ...record, notificationMode: "immediate" });
          }
        } catch (error) {
          console.warn(`[printer2-cancel] ${machine.id}: ${error.message}`);
        }
      }
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, WATCH_MS);
  if (timer.unref) timer.unref();
  tick();
}

function getPrinter2DetailedSnapshot() {
  return [...liveProgressState.values()].map(item => ({ ...item, progressAt: Date.now() }));
}

module.exports = { backfillAborts, startAbortWatcher, scanLines, makeScanner, sessionLogs, currentSessionState, getPrinter2DetailedSnapshot };
