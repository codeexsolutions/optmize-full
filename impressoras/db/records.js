const db = require("../../db");

const COLUMNS = [
  "id", "machineId", "machineName", "sourceType", "dateTime", "date", "time",
  "task", "pass", "status", "cancelled", "error", "printArea", "printLength",
  "metricEstimated",
  "finish", "total", "timeSeconds", "inkMl", "inkExperimental", "inkChannels",
  "previewRef", "progressPercent", "progressState", "timeHours", "isClipOrTile",
  "updatedAt"
];

const upsertStmt = db.prepare(`
  INSERT INTO imp_records (${COLUMNS.join(",")})
  VALUES (${COLUMNS.map(c => `@${c}`).join(",")})
  ON CONFLICT(id) DO UPDATE SET
  ${COLUMNS.filter(c => c !== "id").map(c => {
    // Duas proteções para a tinta já gravada:
    // 1. Uma releitura do CSV calcula tinta por área. Depois que o contador
    //    CMYK real foi anexado ao registro, nunca deixa essa estimativa apagar
    //    o valor exato salvo. (Vale por tipo de fonte, não por id de máquina:
    //    a impressora pode ser recadastrada e ganhar outro id.)
    // 2. A importação do histórico vem sem a divisão CMYK (cara demais pela
    //    rede). Ela não pode zerar os canais que o monitor ao vivo já salvou.
    if (c === "inkMl" || c === "inkChannels" || c === "inkExperimental") {
      return `${c}=CASE
        WHEN imp_records.sourceType='csv' AND imp_records.inkExperimental=0 AND imp_records.inkChannels IS NOT NULL AND excluded.inkExperimental=1 THEN imp_records.${c}
        WHEN excluded.inkChannels IS NULL AND imp_records.inkChannels IS NOT NULL THEN imp_records.${c}
        ELSE excluded.${c} END`;
    }
    return `${c}=excluded.${c}`;
  }).join(",")}
`);

function toRow(r) {
  return {
    id: r.id,
    machineId: r.machineId,
    machineName: r.machineName || "",
    sourceType: r.sourceType || "",
    dateTime: r.dateTime,
    date: r.date,
    time: r.time || "",
    task: r.task || "",
    pass: r.pass ?? null,
    status: r.status || "",
    cancelled: r.cancelled ? 1 : 0,
    error: r.error ? 1 : 0,
    printArea: Number(r.printArea || 0),
    printLength: Number(r.printLength || 0),
    metricEstimated: r.metricEstimated ? 1 : 0,
    finish: r.finish ?? null,
    total: r.total ?? null,
    timeSeconds: Math.round(Number(r.timeSeconds || 0)),
    inkMl: Number(r.inkMl || 0),
    inkExperimental: r.inkExperimental ? 1 : 0,
    inkChannels: Array.isArray(r.inkChannels) ? JSON.stringify(r.inkChannels) : null,
    previewRef: r.previewRef || "",
    progressPercent: r.progressPercent ?? null,
    progressState: r.progressState || null,
    timeHours: r.timeHours ?? null,
    isClipOrTile: r.isClipOrTile ? 1 : 0,
    updatedAt: Date.now()
  };
}

function fromRow(row) {
  return {
    ...row,
    cancelled: !!row.cancelled,
    error: !!row.error,
    metricEstimated: !!row.metricEstimated,
    inkExperimental: !!row.inkExperimental,
    isClipOrTile: !!row.isClipOrTile,
    inkChannels: row.inkChannels ? JSON.parse(row.inkChannels) : []
  };
}

// Só grava registro de máquina que existe. Sem isso, uma leitura que já estava
// em andamento quando a máquina foi excluída ressuscitava o histórico dela em
// forma de registro órfão, que não aparece em lugar nenhum e nunca some.
const machineExists = db.prepare("SELECT 1 FROM imp_machines WHERE id = ?").pluck();

const upsertMany = db.transaction(records => {
  const known = new Map();
  for (const r of records) {
    if (!known.has(r.machineId)) known.set(r.machineId, !!machineExists.get(r.machineId));
    if (known.get(r.machineId)) upsertStmt.run(toRow(r));
  }
});

function queryRange(machineId, start, end) {
  const rows = machineId && machineId !== "all"
    ? db.prepare(`SELECT * FROM imp_records WHERE machineId = ? AND date BETWEEN ? AND ? ORDER BY dateTime DESC`)
        .all(machineId, start, end)
    : db.prepare(`SELECT * FROM imp_records WHERE date BETWEEN ? AND ? ORDER BY dateTime DESC`)
        .all(start, end);
  return rows.map(fromRow);
}

// Histórico inteiro de uma máquina, sem recorte de data. Usado pela exportação
// que roda antes de desativar.
function queryByMachine(machineId) {
  return db.prepare(`SELECT * FROM imp_records WHERE machineId = ? ORDER BY dateTime`).all(machineId).map(fromRow);
}

// Todos os registros do histórico, sem filtro de data. Usado por relatórios
// que precisam olhar pra tudo de uma vez (ex: reposição por semana).
function queryAll() {
  const rows = db.prepare(`SELECT * FROM imp_records ORDER BY dateTime DESC`).all();
  return rows.map(fromRow);
}

module.exports = { upsertMany, queryRange, queryByMachine, queryAll };
