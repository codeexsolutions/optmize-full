const { readMachineRange } = require("../sources");
const { upsertMany } = require("../db/records");
const { setStatus } = require("./machineStatus");
const { localIsoDate, addDays } = require("../utils/date");

const BACKFILL_DAYS = Number(process.env.HISTORY_BACKFILL_DAYS || 400);

// Quanto histórico dá pra puxar depende do custo da fonte:
// - at-binary e csv são um arquivo só, lido de uma vez — puxa tudo que existe.
// - xml é uma pasta por dia: cada dia a mais é uma leitura de rede (~0,1s),
//   então a janela fica no padrão.
const DAYS_BY_TYPE = { "at-binary": 3650, csv: 3650 };

function backfillWindow(days) {
  const end = localIsoDate();
  return { start: addDays(end, -days), end };
}

// Importa a janela de histórico de UMA máquina. Usado tanto na subida do
// servidor quanto logo depois da varredura da rede: sem isso, uma máquina
// recém-descoberta só mostraria os trabalhos do dia, porque o tempo real
// (realtime.js) lê apenas a data de hoje.
async function backfillMachine(machine, { days } = {}) {
  const janela = days || DAYS_BY_TYPE[machine.type] || BACKFILL_DAYS;
  const { start, end } = backfillWindow(janela);
  try {
    // Sem a divisão CMYK: ela sozinha fazia a importação do histórico levar
    // dezenas de minutos numa máquina AT e, na prática, nunca terminar. Os
    // canais de tinta dos trabalhos do dia continuam vindo pelo monitor ao vivo.
    const records = await readMachineRange(machine, start, end, { ink: false });
    upsertMany(records);
    setStatus(machine.id, true);
    console.log(`[sync] ${machine.name}: ${records.length} registro(s) carregado(s) (${start} a ${end})`);
    return { ok: true, imported: records.length, start, end };
  } catch (error) {
    setStatus(machine.id, false, error.message);
    console.error(`[sync] ${machine.name}: falha no backfill — ${error.message}`);
    return { ok: false, imported: 0, start, end, error: error.message };
  }
}

// Roda uma vez na subida do servidor: joga o histórico existente de cada
// máquina para o SQLite, pra a tela já responder rápido desde o primeiro acesso.
async function backfillHistory(loadMachines) {
  const machines = await loadMachines();
  for (const machine of machines) await backfillMachine(machine);
}

module.exports = { backfillHistory, backfillMachine, BACKFILL_DAYS };
