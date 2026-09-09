const crypto = require("crypto");
const db = require("../../db");

const insertPedidoStmt = db.prepare(`
  INSERT INTO imp_pedidos (id, createdAt, status, note)
  VALUES (@id, @createdAt, @status, @note)
`);

const insertItemStmt = db.prepare(`
  INSERT INTO imp_pedido_items
    (id, pedidoId, position, recordId, clientName, fabric, task, machineId, machineName, printLength, date, osId, calandraStatus)
  VALUES
    (@id, @pedidoId, @position, @recordId, @clientName, @fabric, @task, @machineId, @machineName, @printLength, @date, @osId, 'pendente')
`);

// items: [{ recordId, clientName, fabric, task, machineId, machineName, printLength, date, osId }]
const createPedido = db.transaction((items, note) => {
  const id = crypto.randomUUID();
  insertPedidoStmt.run({ id, createdAt: Date.now(), status: "aberto", note: note || "" });

  items.forEach((item, index) => {
    insertItemStmt.run({
      id: crypto.randomUUID(),
      pedidoId: id,
      position: index,
      recordId: item.recordId,
      clientName: item.clientName || "",
      fabric: item.fabric || "",
      task: item.task || "",
      machineId: item.machineId || "",
      machineName: item.machineName || "",
      printLength: Number(item.printLength || 0),
      date: item.date || "",
      osId: item.osId || null
    });
  });

  return id;
});

function listPedidos() {
  return db.prepare(`
    SELECT
      p.*,
      (SELECT COUNT(*) FROM imp_pedido_items i WHERE i.pedidoId = p.id) AS itemCount,
      (SELECT COUNT(*) FROM imp_pedido_items i WHERE i.pedidoId = p.id AND i.calandraStatus = 'ok') AS okCount,
      (SELECT COUNT(*) FROM imp_pedido_items i WHERE i.pedidoId = p.id AND i.calandraStatus = 'erro') AS erroCount
    FROM imp_pedidos p
    ORDER BY p.createdAt DESC
  `).all();
}

function getPedido(id) {
  const pedido = db.prepare(`SELECT * FROM imp_pedidos WHERE id = ?`).get(id);
  if (!pedido) return null;
  const items = db.prepare(`SELECT * FROM imp_pedido_items WHERE pedidoId = ? ORDER BY position`).all(id);
  return { ...pedido, items };
}

function getPedidoItem(itemId) {
  return db.prepare(`SELECT * FROM imp_pedido_items WHERE id = ?`).get(itemId);
}

// Acha o item de pedido correspondente a um registro do histórico (via
// recordId) — usado pelo /api/scan pra saber se um QR lido pertence a
// algum pedido em aberto.
function findItemByRecordId(recordId) {
  return db.prepare(`
    SELECT i.*, p.status AS pedidoStatus
    FROM imp_pedido_items i
    JOIN imp_pedidos p ON p.id = i.pedidoId
    WHERE i.recordId = ?
    ORDER BY i.rowid DESC
    LIMIT 1
  `).get(recordId);
}

const updateItemResultStmt = db.prepare(`
  UPDATE imp_pedido_items
  SET calandraStatus = @status, calandraReason = @reason, calandraCustomReason = @customReason, calandraAt = @at
  WHERE id = @id
`);

function setItemResult(itemId, { status, reason, customReason }) {
  const existing = getPedidoItem(itemId);
  if (!existing) return null;
  updateItemResultStmt.run({
    id: itemId,
    status,
    reason: reason || null,
    customReason: customReason || null,
    at: Date.now()
  });
  return getPedidoItem(itemId);
}

const updateItemOsStmt = db.prepare(`UPDATE imp_pedido_items SET osId = @osId WHERE id = @id`);
function setItemOs(itemId, osId) {
  const existing = getPedidoItem(itemId);
  if (!existing) return null;
  updateItemOsStmt.run({ id: itemId, osId: osId || null });
  return getPedidoItem(itemId);
}

const updatePedidoStatusStmt = db.prepare(`UPDATE imp_pedidos SET status = @status WHERE id = @id`);
function setPedidoStatus(id, status) {
  const result = updatePedidoStatusStmt.run({ id, status });
  return result.changes > 0;
}

function deletePedido(id) {
  const result = db.prepare(`DELETE FROM imp_pedidos WHERE id = ?`).run(id);
  return result.changes > 0;
}

module.exports = {
  createPedido, listPedidos, getPedido, getPedidoItem, findItemByRecordId,
  setItemResult, setItemOs, setPedidoStatus, deletePedido
};
