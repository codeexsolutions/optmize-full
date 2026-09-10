const { normalizeText } = require("../utils/text");

// Convenção da fábrica: o .prt é nomeado "CLIENTE - TECIDO" (às vezes só
// "CLIENTE", sem tecido). Separadores aceitos: " - ", " – " (traço longo),
// ou "_" como fallback quando não tem espaço-traço-espaço.
function parseClientFabric(taskName) {
  const base = String(taskName || "")
    .replace(/\.[a-zA-Z0-9]{2,5}$/, "") // remove extensão (.prt, .cdr, etc)
    .trim();

  if (!base) return { client: "", fabric: "" };

  let parts = base.split(/\s+[-–]\s+/);
  if (parts.length < 2) parts = base.split(/_+/);

  if (parts.length >= 2) {
    return { client: parts[0].trim(), fabric: parts.slice(1).join(" - ").trim() };
  }
  return { client: base, fabric: "" };
}

function sameClientFabric(a, b) {
  const nClientA = normalizeText(a.client || "");
  const nClientB = normalizeText(b.client || "");
  if (!nClientA || nClientA !== nClientB) return false;

  const nFabricA = normalizeText(a.fabric || "");
  const nFabricB = normalizeText(b.fabric || "");
  // se algum dos dois não tem tecido identificado, compara só pelo cliente
  if (!nFabricA || !nFabricB) return true;
  return nFabricA === nFabricB;
}

// Procura, dentro de uma lista de registros do histórico (já carregada),
// outras impressões com o mesmo cliente+tecido — pra avisar "isso já foi
// rodado antes" na hora de lançar um pedido.
function findHistoryMatches(allRecords, client, fabric, excludeRecordId) {
  if (!client) return [];
  const target = { client, fabric };
  return allRecords
    .filter(r => r.id !== excludeRecordId)
    .filter(r => sameClientFabric(target, parseClientFabric(r.task)))
    .sort((a, b) => b.dateTime.localeCompare(a.dateTime));
}

// Procura, entre as Ordens de Serviço cadastradas, a que tem o mesmo
// cliente+tecido — usada só pra puxar a imagem de referência do pedido.
function findMatchingOrder(allOrders, client, fabric) {
  if (!client) return null;
  const target = { client, fabric };
  const matches = allOrders.filter(o =>
    sameClientFabric(target, { client: o.clientName, fabric: o.fabric })
  );
  return matches[0] || null; // listOrders já vem ordenado por data desc
}

module.exports = { parseClientFabric, sameClientFabric, findHistoryMatches, findMatchingOrder };
