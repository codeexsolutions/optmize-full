const fs = require("fs/promises");
const path = require("path");

// Intervalo de checagem do arquivo de log em tempo real.
const POLL_MS = Number(process.env.LIVE_LOG_POLL_MS || 1000);

// Intervalo mínimo entre avisos repetidos no console para o mesmo motivo,
// pra não inundar o terminal a cada tick (1x por segundo).
const WARN_THROTTLE_MS = 15000;

const JOB_RE = /WorkingThreadProc\s+job\s+(.+?)\r?\n/g;
const PERCENT_RE = /Percentage is ([\d.]+)/g;
const STATE_RE = /labelState\.Text is (\w+)/g;

function lastMatch(re, text) {
  re.lastIndex = 0;
  let m, last = null;
  while ((m = re.exec(text))) last = m;
  return last;
}

function baseName(jobPath) {
  const clean = String(jobPath || "").trim();
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : clean;
}

// Se o log ficar esse tempo sem nenhuma linha nova (job/percentual/estado)
// enquanto o card está "imprimindo" E já perto do fim (ver
// STALE_PRINTING_MIN_PERCENT), assumimos que o trabalho terminou — mesmo
// que o texto de estado usado pela impressora nesse momento não seja um
// dos que reconhecemos — e fechamos o card sozinhos, em vez de deixá-lo
// travado pra sempre em ex: "99,8%".
// Não aplicamos isso em qualquer percentual: parado em 30%, por exemplo,
// pode ser só uma pausa real (falta de tinta, mídia etc.), e nesse caso o
// card deve continuar mostrando "Sem avanço / possível pausa" em vez de
// ser fechado como concluído.
const STALE_PRINTING_MS = 25000;
const STALE_PRINTING_MIN_PERCENT = 99;

// A Impressora 04 pode registrar "Error" por menos de um segundo durante
// a preparação normal do trabalho e logo voltar para "Printing". Só trata
// como falha real quando o estado permanece por este intervalo.
const ERROR_CONFIRM_MS = Number(process.env.LIVE_LOG_ERROR_CONFIRM_MS || 3000);

function mapState(rawState, printingStarted) {
  const s = String(rawState || "").toLowerCase();
  if (s === "printing" || s === "cleaning") return "printing";
  if (s === "error") return "error";
  if (s === "ready") return printingStarted ? "completed" : "unknown";
  return null; // estado não reconhecido: mantém o anterior
}

// Extensões aceitas como arquivo de log. Ajuste aqui se o formato real
// usado pela impressora for diferente (ex: .log).
const LOG_EXTENSIONS = [".txt", ".log"];

async function newestLogFile(dir) {
  let names;
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    return { error };
  }

  let candidates = names.filter(n => LOG_EXTENSIONS.includes(path.extname(n).toLowerCase()));
  // Se não achar nada com as extensões esperadas, cai para qualquer arquivo
  // na pasta (evita ficar "cego" se o nome/extensão real for diferente).
  if (!candidates.length) candidates = names;

  if (!candidates.length) return { file: null, empty: true };

  let best = null;
  for (const name of candidates) {
    const full = path.join(dir, name);
    try {
      const stat = await fs.stat(full);
      if (stat.isFile() && (!best || stat.mtimeMs > best.mtimeMs)) {
        best = { full, mtimeMs: stat.mtimeMs };
      }
    } catch {
      // ignora arquivo que sumiu entre o readdir e o stat
    }
  }
  return { file: best ? best.full : null };
}

// Estado por máquina, fora da closure de startLiveLog para que
// getLiveLogSnapshot() (usado pelo botão "Atualizar" do painel ao vivo)
// consiga ler o estado atual sem esperar a próxima linha de log mudar.
const state = new Map();

function startLiveLog(io, loadMachines) {
  // Estado por máquina: arquivo atual, offset já lido, job/percent/estado correntes.
  const lastWarnAt = new Map(); // `${machineId}:${motivo}` -> timestamp
  let running = false;

  function warnOnce(machineId, reason, message) {
    const key = `${machineId}:${reason}`;
    const now = Date.now();
    if (now - (lastWarnAt.get(key) || 0) < WARN_THROTTLE_MS) return;
    lastWarnAt.set(key, now);
    console.warn(`[live-log] ${machineId}: ${message}`);
  }

  function emitIfChanged(machine, prev, next) {
    const changed =
      !prev ||
      prev.task !== next.task ||
      prev.progressPercent !== next.progressPercent ||
      prev.progressState !== next.progressState;

    if (!changed) return;

    io.emit("print-progress", {
      id: `${machine.id}|live`,
      machineId: machine.id,
      machineName: machine.name,
      sourceType: "live-log",
      task: next.task || "",
      status:
        next.progressState === "printing" ? "Em impressão" :
        next.progressState === "completed" ? "Concluído" :
        next.progressState === "error" ? "Erro" : "Em impressão",
      cancelled: false,
      error: next.progressState === "error",
      finish: null,
      total: null,
      printLength: 0,
      progressPercent: next.progressPercent,
      progressState: next.progressState,
      progressAt: Date.now()
    });

    console.log(`[live-log] ${machine.id}: ${next.task || "(sem job)"} -> ${next.progressState} ${next.progressPercent.toFixed(1)}%`);
  }

  function checkStale(machine, current) {
    if (current.progressState !== "printing") return;
    if (Number(current.progressPercent || 0) < STALE_PRINTING_MIN_PERCENT) return;
    const idleFor = Date.now() - Number(current.lastActivityAt || 0);
    if (idleFor < STALE_PRINTING_MS) return;

    const before = { task: current.task, progressPercent: current.progressPercent, progressState: current.progressState };
    current.progressState = "completed";
    current.progressPercent = 100;
    current.hadJob = false;
    current.printingStarted = false;
    current.lastActivityAt = Date.now();
    console.log(`[live-log] ${machine.id}: sem novas linhas de log há ${Math.round(idleFor / 1000)}s durante impressão — considerando "${current.task}" concluído.`);
    emitIfChanged(machine, before, current);
  }

  async function tickMachine(machine) {
    const found = await newestLogFile(machine.liveLogDir);

    if (found.error) {
      warnOnce(machine.id, "dir", `não consegui abrir a pasta de log "${machine.liveLogDir}": ${found.error.message}`);
      return;
    }
    if (found.empty) {
      warnOnce(machine.id, "empty", `pasta de log "${machine.liveLogDir}" está vazia`);
      return;
    }
    if (!found.file) {
      warnOnce(machine.id, "nofile", `nenhum arquivo de log válido encontrado em "${machine.liveLogDir}"`);
      return;
    }

    const filePath = found.file;
    let prevState = state.get(machine.id);

    // Novo arquivo (rotação diária) ou primeira leitura: começa do fim do
    // arquivo para não reprocessar eventos antigos. Antes disso, reconstrói
    // apenas o último estado: se a central abriu no meio de uma impressão,
    // o painel passa a acompanhá-la sem anunciar um falso início.
    if (!prevState || prevState.filePath !== filePath) {
      let size = 0;
      let initialTask = "";
      let initialPercent = 0;
      let initialProgressState = "unknown";
      let initialHadJob = false;
      try {
        size = (await fs.stat(filePath)).size;
        const raw = await fs.readFile(filePath, "utf8");
        const jobMatch = lastMatch(JOB_RE, raw);
        if (jobMatch) {
          const latestJobBlock = raw.slice(jobMatch.index);
          const percentMatch = lastMatch(PERCENT_RE, latestJobBlock);
          const stateMatch = lastMatch(STATE_RE, latestJobBlock);
          const rawState = String(stateMatch?.[1] || "").toLowerCase();
          const active = rawState === "printing" || rawState === "cleaning";

          if (active) {
            initialTask = baseName(jobMatch[1]);
            initialPercent = Math.max(0, Math.min(100, Number(percentMatch?.[1] || 0)));
            initialProgressState = "printing";
            initialHadJob = true;
          }
        }
      } catch (error) {
        warnOnce(machine.id, "stat", `falha ao checar tamanho de "${filePath}": ${error.message}`);
        return;
      }
      prevState = {
        filePath,
        offset: size,
        task: initialTask,
        progressPercent: initialPercent,
        progressState: initialProgressState,
        pendingTask: "",
        hadJob: initialHadJob,
        printingStarted: initialHadJob,
        errorSince: 0,
        machineName: machine.name,
        lastActivityAt: Date.now()
      };
      state.set(machine.id, prevState);
      console.log(`[live-log] ${machine.id}: acompanhando "${filePath}" a partir do byte ${size}`);
      if (initialHadJob) {
        io.emit("print-progress", {
          id: `${machine.id}|live`,
          machineId: machine.id,
          machineName: machine.name,
          sourceType: "live-log",
          task: initialTask,
          status: "Em impressão",
          cancelled: false,
          error: false,
          finish: null,
          total: null,
          printLength: 0,
          progressPercent: initialPercent,
          progressState: "printing",
          suppressStartNotification: true,
          progressAt: Date.now()
        });
        console.log(`[live-log] ${machine.id}: reconheceu "${initialTask}" já em andamento (sem aviso de início)`);
      }
      return;
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (error) {
      warnOnce(machine.id, "stat2", `falha ao checar tamanho de "${filePath}": ${error.message}`);
      return;
    }

    if (stat.size < prevState.offset) {
      // Arquivo foi truncado/recriado: relê do início.
      prevState.offset = 0;
    }

    if (stat.size === prevState.offset) {
      checkStale(machine, prevState);
      return;
    }

    let handle;
    try {
      handle = await fs.open(filePath, "r");
    } catch (error) {
      warnOnce(machine.id, "open", `falha ao abrir "${filePath}" para leitura (pode estar bloqueado pelo app da impressora): ${error.message}`);
      return;
    }

    let chunk;
    try {
      const len = stat.size - prevState.offset;
      const buf = Buffer.allocUnsafe(len);
      const { bytesRead } = await handle.read(buf, 0, len, prevState.offset);
      chunk = buf.subarray(0, bytesRead).toString("utf8");
      prevState.offset += bytesRead;
    } catch (error) {
      warnOnce(machine.id, "read", `falha ao ler novo conteúdo de "${filePath}": ${error.message}`);
      return;
    } finally {
      await handle.close();
    }

    const jobMatch = lastMatch(JOB_RE, chunk);
    const percentMatch = lastMatch(PERCENT_RE, chunk);
    const stateMatch = lastMatch(STATE_RE, chunk);

    const next = {
      filePath,
      offset: prevState.offset,
      task: prevState.task,
      progressPercent: prevState.progressPercent,
      progressState: prevState.progressState,
      pendingTask: prevState.pendingTask || "",
      hadJob: prevState.hadJob,
      printingStarted: prevState.printingStarted || false,
      errorSince: prevState.errorSince || 0,
      machineName: machine.name,
      lastActivityAt: prevState.lastActivityAt
    };

    if (jobMatch || percentMatch || stateMatch) {
      next.lastActivityAt = Date.now();
    }

    if (jobMatch) {
      // WorkingThreadProc job significa somente arquivo carregado/selecionado.
      // Não troca o trabalho ao vivo nem herda o estado "printing" anterior:
      // ele só vira ativo quando surgir a confirmação explícita Printing.
      next.pendingTask = baseName(jobMatch[1]);
    }

    if (percentMatch) {
      // O campo "Percentage is X" já vem numa escala 0-100 (não é fração
      // 0-1): valores como 0.15, 3.4, 56.5 significam 0,15% / 3,4% / 56,5%.
      const pct = Math.max(0, Math.min(100, Number(percentMatch[1])));
      next.progressPercent = pct;
    }

    if (stateMatch) {
      const rawState = String(stateMatch[1] || "").toLowerCase();
      let mapped = null;

      if (rawState === "error") {
        if (!next.errorSince) next.errorSince = Date.now();
        if (Date.now() - next.errorSince >= ERROR_CONFIRM_MS) mapped = "error";
      } else {
        next.errorSince = 0;
        mapped = mapState(rawState, next.printingStarted);
      }

      if (mapped) {
        const printingCameAfterJob = !jobMatch || Number(stateMatch.index) > Number(jobMatch.index);
        const previousJobWasNotPrinting = !prevState.printingStarted || prevState.progressState !== "printing";
        if (mapped === "printing" && next.pendingTask && printingCameAfterJob && previousJobWasNotPrinting) {
          next.task = next.pendingTask;
          next.pendingTask = "";
          next.hadJob = true;
          next.progressPercent = percentMatch
            ? Math.max(0, Math.min(100, Number(percentMatch[1])))
            : 0;
        }
        next.progressState = mapped;
        if (mapped === "printing") next.printingStarted = true;
        if (mapped === "completed") {
          next.progressPercent = 100;
          next.hadJob = false;
          next.printingStarted = false;
        }
      }
    }

    const before = { task: prevState.task, progressPercent: prevState.progressPercent, progressState: prevState.progressState };
    state.set(machine.id, next);
    emitIfChanged(machine, before, next);
    checkStale(machine, next);
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      let machines = [];
      try {
        machines = await loadMachines();
      } catch (error) {
        console.warn(`[live-log] falha ao carregar máquinas: ${error.message}`);
        return;
      }
      const withLiveLog = machines.filter(m => m.liveLogDir);
      for (const machine of withLiveLog) {
        try {
          await tickMachine(machine);
        } catch (error) {
          warnOnce(machine.id, "tick", `erro inesperado: ${error.message}`);
        }
      }
    } finally {
      running = false;
    }
  }

  loadMachines()
    .then(machines => {
      const withLiveLog = machines.filter(m => m.liveLogDir);
      if (!withLiveLog.length) {
        console.log("[live-log] nenhuma máquina com liveLogDir configurado — nada a observar.");
      } else {
        withLiveLog.forEach(m => console.log(`[live-log] observando ${m.id} (${m.name}) em "${m.liveLogDir}"`));
      }
    })
    .catch(() => {});

  setInterval(tick, POLL_MS);
  tick();
}

// Snapshot do que o log ao vivo considera "imprimindo" agora, direto do
// último estado lido — sem esperar a próxima linha nova no arquivo de log.
// Usado pelo botão "Atualizar" do painel Impressões ao vivo.
function getLiveLogSnapshot() {
  const out = [];
  for (const [machineId, s] of state.entries()) {
    if (!s || s.progressState !== "printing") continue;
    out.push({
      id: `${machineId}|live`,
      machineId,
      machineName: s.machineName || machineId,
      sourceType: "live-log",
      task: s.task || "",
      status: "Em impressão",
      cancelled: false,
      error: false,
      finish: null,
      total: null,
      printLength: 0,
      progressPercent: s.progressPercent,
      progressState: s.progressState,
      progressAt: Date.now()
    });
  }
  return out;
}

module.exports = { startLiveLog, getLiveLogSnapshot };
