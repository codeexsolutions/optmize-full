/**
 * ===========================================================================
 * PrintExp ao vivo — o que está saindo da máquina agora
 * ===========================================================================
 *
 * O `PrintData.xml` só ganha uma linha quando o trabalho acaba, então sozinho
 * ele nunca mostraria uma impressão em andamento. Quem sabe do presente são
 * dois arquivos pequenos, e cada um sabe metade:
 *
 *   Data\PrintInfo.ini      TASK_GUID + PRINT_PROGRESS (0 a 100)
 *   Log\main\Log[data].txt  o nome da tarefa e o tamanho da arte
 *
 * O .ini tem 89 bytes e é o número de progresso do próprio programa — é ele
 * que manda na porcentagem. Mas ele não diz o NOME do que está imprimindo,
 * só um GUID que não aparece em mais lugar nenhum (procurei no
 * HistoryTask.tf, nas três formas possíveis de gravar um GUID: não está lá).
 * O nome vem do log, na linha `启动任务：<nome>`.
 *
 * Por que não usar o `liveLog.js`, que já segue log de impressora: aquele fala
 * o dialeto da 04 — "Printing"/"Ready" em inglês e UTF-8. Este log é chinês em
 * GBK e marca progresso por passada. São dois idiomas, não duas configurações;
 * misturá-los deixaria os dois frágeis. Mesma razão de o `printer2Live.js`
 * existir à parte para as CSV.
 */

const fs = require("fs/promises");
const path = require("path");
const iconv = require("iconv-lite");

const POLL_MS = Number(process.env.PRINTEXP_LIVE_POLL_MS || 1500);
const WARN_THROTTLE_MS = 60000;

// O log cresce alguns MB por dia. A cauda é lida por offset, como no
// liveLog.js, mas com um teto por leitura: numa retomada depois de horas
// fora do ar, um único `read` de 4 MB pela rede travaria o tick.
const MAX_CHUNK = 512 * 1024;

const RE_TAREFA = /启动任务：(.+)/g;              // "iniciar tarefa: <nome>"
const RE_TAMANHO = /图像大小:([\d.]+)mm X ([\d.]+)mm/g;  // "tamanho da imagem"
const RE_TOTAL_PASS = /nTotalPrintPass=(\d+)/g;
const RE_PASS_ATUAL = /nCurPass=(\d+)/g;
const RE_CANCELA = /Cancel\(\)开始/g;             // "Cancel() início"

function ultimo(re, texto) {
  re.lastIndex = 0;
  let achado = null, m;
  while ((m = re.exec(texto)) !== null) achado = m;
  return achado;
}

// -------------------------------------------------------------- os arquivos

/** O log do dia: o mais recente da pasta, porque o nome muda à meia-noite. */
async function logMaisNovo(dir) {
  const nomes = await fs.readdir(dir);
  let melhor = null;
  for (const nome of nomes) {
    if (!/\.(txt|log)$/i.test(nome)) continue;
    const cheio = path.join(dir, nome);
    try {
      const stat = await fs.stat(cheio);
      if (stat.isFile() && (!melhor || stat.mtimeMs > melhor.mtimeMs)) {
        melhor = { file: cheio, mtimeMs: stat.mtimeMs, size: stat.size };
      }
    } catch {
      // sumiu entre o readdir e o stat
    }
  }
  return melhor;
}

/**
 * O `PrintInfo.ini` fica em `Data\`, ao lado da pasta `Usage` do histórico.
 * Guardado no cadastro como `liveLogFile` — é literalmente o arquivo do vivo.
 */
async function lerPrintInfo(file) {
  if (!file) return null;
  let texto;
  try {
    texto = await fs.readFile(file, "latin1");
  } catch {
    return null;
  }
  const guid = (/TASK_GUID=([0-9A-Fa-f-]+)/.exec(texto) || [])[1] || "";
  const bruto = Number.parseFloat((/PRINT_PROGRESS=([\d.]+)/.exec(texto) || [])[1]);
  return {
    guid,
    percent: Number.isFinite(bruto) ? Math.max(0, Math.min(100, bruto)) : null
  };
}

// ------------------------------------------------------------------ serviço

const state = new Map();

function startPrintExpLive(io, loadMachines) {
  const avisos = new Map();
  let running = false;

  function avisarUmaVez(machineId, motivo, mensagem) {
    const chave = `${machineId}:${motivo}`;
    const agora = Date.now();
    if (agora - (avisos.get(chave) || 0) < WARN_THROTTLE_MS) return;
    avisos.set(chave, agora);
    console.warn(`[printexp-live] ${machineId}: ${mensagem}`);
  }

  function emitirSeMudou(machine, antes, agora) {
    const mudou =
      !antes ||
      antes.task !== agora.task ||
      antes.progressState !== agora.progressState ||
      Math.round(Number(antes.progressPercent || 0)) !== Math.round(Number(agora.progressPercent || 0));

    if (!mudou) return;

    io.emit("print-progress", {
      id: `${machine.id}|live`,
      machineId: machine.id,
      machineName: machine.name,
      sourceType: "printexp-live",
      task: agora.task || "",
      status:
        agora.progressState === "printing" ? "Em impressão" :
        agora.cancelled ? "Cancelado" :
        agora.progressState === "completed" ? "Concluído" : "Em impressão",
      cancelled: Boolean(agora.cancelled),
      error: false,
      finish: null,
      total: null,
      printLength: Number(agora.printLength || 0),
      progressPercent: Number(agora.progressPercent || 0),
      progressState: agora.progressState,
      progressAt: Date.now()
    });

    console.log(`[printexp-live] ${machine.id}: ${agora.task || "(sem tarefa)"} -> ${agora.progressState} ${Number(agora.progressPercent || 0).toFixed(1)}%`);
  }

  async function tickMachine(machine) {
    const achado = await logMaisNovo(machine.liveLogDir).catch(error => {
      avisarUmaVez(machine.id, "dir", `não consegui ler a pasta de log "${machine.liveLogDir}": ${error.message}`);
      return null;
    });
    if (!achado) return;

    const anterior = state.get(machine.id);
    const info = await lerPrintInfo(machine.liveLogFile);

    // Primeira leitura, ou o log virou de dia: começa do fim do arquivo. Sem
    // isso, subir o servidor às 18h reanunciaria como "novo" cada trabalho do
    // dia inteiro — e o PRINT_PROGRESS fica em 100 depois que a máquina para,
    // o que faria o último trabalho de ontem aparecer concluído agora.
    if (!anterior || anterior.filePath !== achado.file) {
      state.set(machine.id, {
        filePath: achado.file,
        offset: achado.size,
        task: "",
        printLength: 0,
        progressPercent: info?.percent ?? 0,
        progressState: "unknown",
        cancelled: false,
        guid: info?.guid || "",
        machineName: machine.name
      });
      return;
    }

    let novoTexto = "";
    if (achado.size > anterior.offset) {
      const pedaco = Math.min(achado.size - anterior.offset, MAX_CHUNK);
      const inicio = achado.size - anterior.offset > MAX_CHUNK ? achado.size - MAX_CHUNK : anterior.offset;
      let handle;
      try {
        handle = await fs.open(achado.file, "r");
        const buf = Buffer.allocUnsafe(pedaco);
        const { bytesRead } = await handle.read(buf, 0, pedaco, inicio);
        novoTexto = iconv.decode(buf.subarray(0, bytesRead), "gbk");
        anterior.offset = achado.size;
      } catch (error) {
        avisarUmaVez(machine.id, "read", `falha ao ler "${achado.file}": ${error.message}`);
        return;
      } finally {
        if (handle) await handle.close();
      }
    } else if (achado.size < anterior.offset) {
      // Arquivo encolheu: o programa recriou o log. Recomeça do fim.
      anterior.offset = achado.size;
    }

    const antes = { ...anterior };
    const proximo = anterior;

    const tarefa = ultimo(RE_TAREFA, novoTexto);
    if (tarefa) {
      proximo.task = tarefa[1].trim();
      proximo.progressState = "printing";
      proximo.cancelled = false;
      proximo.printLength = 0;
    }

    const tamanho = ultimo(RE_TAMANHO, novoTexto);
    // A altura da arte em mm é o comprimento que vai sair do rolo. Confere com
    // o `PrintLength` que o XML grava no fim: 1403,10mm = 1,40 m.
    if (tamanho) proximo.printLength = Number.parseFloat(tamanho[2]) / 1000;

    if (ultimo(RE_CANCELA, novoTexto)) {
      proximo.cancelled = true;
      proximo.progressState = "completed";
    }

    // A porcentagem do próprio programa manda. Só quando ela não pode ser lida
    // é que a passada atual serve de régua — e ela é grossa: um trabalho de
    // 15 passadas anda de 6,7% em 6,7%.
    if (info?.percent != null) {
      proximo.progressPercent = info.percent;
      // GUID novo com o .ini abaixo de 100 é trabalho começando, mesmo que a
      // linha de início não tenha caído nesta leitura da cauda.
      if (info.guid && info.guid !== proximo.guid) {
        proximo.guid = info.guid;
        if (info.percent < 100) {
          proximo.progressState = "printing";
          proximo.cancelled = false;
        }
      }
      if (info.percent >= 100 && proximo.progressState === "printing") {
        proximo.progressState = "completed";
      }
    } else {
      const total = ultimo(RE_TOTAL_PASS, novoTexto);
      const atual = ultimo(RE_PASS_ATUAL, novoTexto);
      if (total) proximo.totalPasses = Number(total[1]) || 0;
      if (atual && proximo.totalPasses > 0) {
        proximo.progressPercent = Math.min(100, (Number(atual[1]) + 1) / proximo.totalPasses * 100);
      }
    }

    proximo.machineName = machine.name;
    state.set(machine.id, proximo);
    emitirSeMudou(machine, antes, proximo);
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      let machines = [];
      try {
        machines = await loadMachines();
      } catch (error) {
        console.warn(`[printexp-live] falha ao carregar máquinas: ${error.message}`);
        return;
      }
      for (const machine of machines.filter(m => m.type === "printexp" && m.liveLogDir && m.enabled !== false)) {
        try {
          await tickMachine(machine);
        } catch (error) {
          avisarUmaVez(machine.id, "tick", `erro inesperado: ${error.message}`);
        }
      }
    } finally {
      running = false;
    }
  }

  setInterval(tick, POLL_MS);
  tick();
}

/** O que está imprimindo agora, para o botão "Atualizar" do painel ao vivo. */
function getPrintExpLiveSnapshot() {
  const out = [];
  for (const [machineId, s] of state.entries()) {
    if (!s || s.progressState !== "printing") continue;
    out.push({
      id: `${machineId}|live`,
      machineId,
      machineName: s.machineName || machineId,
      sourceType: "printexp-live",
      task: s.task || "",
      status: "Em impressão",
      cancelled: false,
      error: false,
      finish: null,
      total: null,
      printLength: Number(s.printLength || 0),
      progressPercent: Number(s.progressPercent || 0),
      progressState: s.progressState,
      progressAt: Date.now()
    });
  }
  return out;
}

module.exports = { startPrintExpLive, getPrintExpLiveSnapshot, logMaisNovo, lerPrintInfo };
