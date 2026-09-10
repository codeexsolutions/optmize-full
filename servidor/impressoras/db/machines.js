const db = require("../../db");

// Campos de rota que cada driver consome. Guardados como colunas para o
// scanner conseguir atualizar caminho a caminho sem reescrever a máquina toda.
const PATH_FIELDS = [
  "historyPath", "previewDir", "liveLogDir",
  "liveLogFile", "statusLogDir", "jobListPath", "inkStatsPath"
];

function rowToMachine(row) {
  if (!row) return null;
  const machine = {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled !== 0,
    host: row.host || null,
    ip: row.ip || null,
    origin: row.origin || "manual",
    discoveredAt: row.discoveredAt || null,
    updatedAt: row.updatedAt || null
  };
  for (const field of PATH_FIELDS) {
    if (row[field]) machine[field] = row[field];
  }
  return machine;
}

function listMachines({ includeDisabled = false } = {}) {
  const rows = includeDisabled
    ? db.prepare("SELECT * FROM imp_machines ORDER BY position, id").all()
    : db.prepare("SELECT * FROM imp_machines WHERE enabled = 1 ORDER BY position, id").all();
  return rows.map(rowToMachine);
}

function getMachineRow(id) {
  return rowToMachine(db.prepare("SELECT * FROM imp_machines WHERE id = ?").get(id));
}

function findByHost(host) {
  if (!host) return null;
  const row = db.prepare("SELECT * FROM imp_machines WHERE lower(host) = lower(?)").get(String(host));
  return rowToMachine(row);
}

function countMachines() {
  return db.prepare("SELECT COUNT(*) AS n FROM imp_machines").get().n;
}

const upsertStmt = db.prepare(`
  INSERT INTO imp_machines (
    id, name, type, enabled, host, ip,
    historyPath, previewDir, liveLogDir, liveLogFile, statusLogDir, jobListPath, inkStatsPath,
    origin, position, discoveredAt, updatedAt
  ) VALUES (
    @id, @name, @type, @enabled, @host, @ip,
    @historyPath, @previewDir, @liveLogDir, @liveLogFile, @statusLogDir, @jobListPath, @inkStatsPath,
    @origin, @position, @discoveredAt, @updatedAt
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    type = excluded.type,
    enabled = excluded.enabled,
    host = excluded.host,
    ip = excluded.ip,
    historyPath = excluded.historyPath,
    previewDir = excluded.previewDir,
    liveLogDir = excluded.liveLogDir,
    liveLogFile = excluded.liveLogFile,
    statusLogDir = excluded.statusLogDir,
    jobListPath = excluded.jobListPath,
    inkStatsPath = excluded.inkStatsPath,
    origin = excluded.origin,
    position = excluded.position,
    discoveredAt = COALESCE(imp_machines.discoveredAt, excluded.discoveredAt),
    updatedAt = excluded.updatedAt
`);

function upsertMachine(machine) {
  const existing = getMachineRow(machine.id);
  const payload = {
    id: String(machine.id),
    name: machine.name || machine.id,
    type: machine.type,
    enabled: machine.enabled === false ? 0 : 1,
    host: machine.host || existing?.host || null,
    ip: machine.ip || existing?.ip || null,
    origin: machine.origin || existing?.origin || "manual",
    position: Number.isFinite(machine.position) ? machine.position : (existing?.position ?? countMachines()),
    discoveredAt: machine.discoveredAt || Date.now(),
    updatedAt: Date.now()
  };
  for (const field of PATH_FIELDS) {
    payload[field] = machine[field] ?? null;
  }
  upsertStmt.run(payload);
  return getMachineRow(payload.id);
}

// Atualização parcial: só sobrescreve os campos enviados, preservando o resto.
function patchMachine(id, patch) {
  const current = getMachineRow(id);
  if (!current) return null;
  const allowed = ["name", "type", "enabled", "host", "ip", "position", ...PATH_FIELDS];
  const merged = { ...current };
  for (const key of allowed) {
    if (key in patch) merged[key] = patch[key];
  }
  return upsertMachine(merged);
}

function deleteMachine(id) {
  return db.prepare("DELETE FROM imp_machines WHERE id = ?").run(id).changes > 0;
}

// Tudo que ficou gravado no banco em nome de uma máquina. Serve para a tela de
// gestão mostrar o tamanho do histórico e para a confirmação de exclusão dizer
// exatamente o que vai embora.
function machineDataStats(id) {
  const records = db.prepare(`
    SELECT COUNT(*) AS total, MIN(date) AS firstDate, MAX(date) AS lastDate,
           COALESCE(SUM(printLength), 0) AS meters
    FROM imp_records WHERE machineId = ?
  `).get(id);
  const pedidoItems = db.prepare("SELECT COUNT(*) AS n FROM imp_pedido_items WHERE machineId = ?").get(id).n;
  const pedidos = db.prepare(`
    SELECT COUNT(DISTINCT pedidoId) AS n FROM imp_pedido_items WHERE machineId = ?
  `).get(id).n;
  return {
    records: records.total,
    firstDate: records.firstDate || null,
    lastDate: records.lastDate || null,
    meters: Number(records.meters || 0),
    pedidoItems,
    pedidos
  };
}

// Exclusão definitiva: a máquina e tudo que veio dela. Os itens de pedido
// apontam para registros do histórico — deixá-los para trás criaria fila da
// calandra apontando para trabalho que não existe mais —, então saem junto, e
// o pedido que ficar vazio é removido também.
const purgeMachine = db.transaction(id => {
  const stats = machineDataStats(id);
  const affected = db.prepare("SELECT DISTINCT pedidoId FROM imp_pedido_items WHERE machineId = ?").all(id);

  db.prepare("DELETE FROM imp_pedido_items WHERE machineId = ?").run(id);

  let emptyPedidos = 0;
  for (const { pedidoId } of affected) {
    const left = db.prepare("SELECT COUNT(*) AS n FROM imp_pedido_items WHERE pedidoId = ?").get(pedidoId).n;
    if (!left) emptyPedidos += db.prepare("DELETE FROM imp_pedidos WHERE id = ?").run(pedidoId).changes;
  }

  const records = db.prepare("DELETE FROM imp_records WHERE machineId = ?").run(id).changes;
  const removed = db.prepare("DELETE FROM imp_machines WHERE id = ?").run(id).changes > 0;

  return { removed, records, pedidoItems: stats.pedidoItems, emptyPedidos };
});

module.exports = {
  PATH_FIELDS,
  listMachines,
  getMachineRow,
  findByHost,
  countMachines,
  upsertMachine,
  patchMachine,
  deleteMachine,
  machineDataStats,
  purgeMachine
};
