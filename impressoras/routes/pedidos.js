const express = require("express");
const { queryAll } = require("../db/records");
const { listOrders, getOrder } = require("../db/serviceOrders");
const {
  createPedido, listPedidos, getPedido, getPedidoItem,
  setItemResult, setItemOs, setPedidoStatus, deletePedido
} = require("../db/pedidos");
const { parseClientFabric, findHistoryMatches, findMatchingOrder } = require("../services/matching");
const { normalizeText } = require("../utils/text");

const router = express.Router();

function summarizeOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    clientName: order.clientName,
    fabric: order.fabric,
    date: order.date,
    imageCount: order.images.length,
    coverImageId: order.images[0] ? order.images[0].id : null
  };
}

// Dado um conjunto de itens (do histórico) que a pessoa está pensando em
// colocar num pedido, devolve pra cada um: se já foi rodado antes (mesmo
// cliente+tecido), qual OS bate certinho pra puxar a imagem, e uma lista
// de outras OS do mesmo cliente caso a sugestão não seja a certa. Usado na
// tela de "Lançar pedido" pra mostrar os avisos ANTES de confirmar.
router.post("/preview", (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "Nenhum item enviado" });

  try {
    const allRecords = queryAll();
    const allOrders = listOrders();

    const result = items.map(item => {
      const { client, fabric } = parseClientFabric(item.task);
      const historyMatches = findHistoryMatches(allRecords, client, fabric, item.id)
        .slice(0, 5)
        .map(r => ({ id: r.id, date: r.date, time: r.time, machineName: r.machineName, printLength: r.printLength }));
      const suggestedOrder = findMatchingOrder(allOrders, client, fabric);

      const nClient = normalizeText(client);
      const candidateOrders = allOrders
        .filter(o => normalizeText(o.clientName || "") === nClient)
        .slice(0, 8)
        .map(o => summarizeOrder(getOrder(o.id)));

      return {
        recordId: item.id,
        client,
        fabric,
        alreadyRan: historyMatches.length > 0,
        historyMatches,
        suggestedOs: suggestedOrder ? summarizeOrder(getOrder(suggestedOrder.id)) : null,
        candidateOrders
      };
    });

    res.json({ items: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  const note = req.body && req.body.note ? String(req.body.note) : "";
  if (!items.length) return res.status(400).json({ error: "Nenhum item enviado" });

  try {
    const prepared = items.map(item => {
      const { client, fabric } = parseClientFabric(item.task);
      return {
        recordId: item.id,
        clientName: client,
        fabric,
        task: item.task || "",
        machineId: item.machineId || "",
        machineName: item.machineName || "",
        printLength: item.printLength,
        date: item.date || "",
        osId: item.osId || null
      };
    });

    const id = createPedido(prepared, note);
    res.status(201).json(getPedido(id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", (_req, res) => {
  try {
    res.json(listPedidos());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", (req, res) => {
  try {
    const pedido = getPedido(req.params.id);
    if (!pedido) return res.status(404).json({ error: "Pedido não encontrado" });
    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const removed = deletePedido(req.params.id);
    if (!removed) return res.status(404).json({ error: "Pedido não encontrado" });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/status", (req, res) => {
  const status = String((req.body && req.body.status) || "");
  if (!["aberto", "pausado", "concluido"].includes(status)) {
    return res.status(400).json({ error: "Status inválido" });
  }
  try {
    const updated = setPedidoStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ error: "Pedido não encontrado" });
    res.json(getPedido(req.params.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/items/:itemId/os", (req, res) => {
  try {
    const item = setItemOs(req.params.itemId, req.body && req.body.osId);
    if (!item || item.pedidoId !== req.params.id) return res.status(404).json({ error: "Item não encontrado" });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chamado pelo app do Raspberry Pi na calandra depois que o operador marca
// certo (status "ok") ou errado (status "erro" + motivo).
router.post("/:id/items/:itemId/result", (req, res) => {
  const status = String((req.body && req.body.status) || "");
  if (!["ok", "erro"].includes(status)) {
    return res.status(400).json({ error: "status deve ser 'ok' ou 'erro'" });
  }
  const reason = req.body && req.body.reason ? String(req.body.reason) : null;
  const customReason = req.body && req.body.customReason ? String(req.body.customReason) : null;

  try {
    const before = getPedidoItem(req.params.itemId);
    if (!before || before.pedidoId !== req.params.id) return res.status(404).json({ error: "Item não encontrado" });

    const item = setItemResult(req.params.itemId, { status, reason, customReason });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
