/**
 * De onde saem as impressoras.
 *
 * De lugar nenhum escrito à mão. Não existe lista de máquinas no código, nem
 * um `machines.json` para editar: a única forma de uma impressora entrar no
 * sistema é a varredura da rede achá-la (`services/discovery.js`) e alguém
 * dar um nome a ela (`POST /api/impressoras/machines/register`). Daí em
 * diante ela mora na tabela `imp_machines` do `dados.db`, e é de lá que todo
 * o resto lê.
 *
 * Isso é diferente do sistema de onde este módulo foi portado, que nascia com
 * as quatro máquinas da fábrica escritas num arquivo de configuração. O motivo
 * de não trazer aquilo junto é simples: caminho de rede escrito à mão só está
 * certo em uma instalação — a de quem escreveu. Noutra máquina, noutro
 * cliente, ou depois de renomearem um computador, o arquivo passa a apontar
 * para o vazio, e calado: a impressora só aparece offline. A varredura
 * descobre o caminho certo toda vez.
 *
 * As funções continuam `async` de propósito. Elas nasceram assíncronas porque
 * liam arquivo; hoje leem só o banco, mas quem chama já as espera assim e
 * mudar a assinatura seria mexer no resto de graça.
 */

const { listMachines, getMachineRow } = require("./db/machines");

/**
 * Extrai o host de um caminho UNC (`\\HOST\share\...`).
 *
 * Serve para agrupar as rotas de uma mesma máquina e para a varredura
 * reconhecer o que já existe no banco: é pelo nome do computador que uma
 * impressora redescoberta é a mesma de antes, e não uma nova.
 */
function hostFromUnc(value) {
  const match = /^\\\\([^\\]+)\\/.exec(String(value || ""));
  return match ? match[1] : null;
}

function machineHost(machine) {
  return machine.host
    || hostFromUnc(machine.historyPath)
    || hostFromUnc(machine.previewDir)
    || null;
}

/** As impressoras ativas, na ordem em que aparecem no painel. */
async function loadMachines() {
  return listMachines();
}

/** Todas, inclusive as desativadas — é a lista da tela de gestão. */
async function loadAllMachines() {
  return listMachines({ includeDisabled: true });
}

/**
 * Uma impressora pelo id, só se estiver ativa. Máquina desativada responde
 * como inexistente de propósito: ela some do painel inteiro sem cada rota
 * precisar lembrar de conferir o `enabled`.
 */
async function getMachine(id) {
  const machine = getMachineRow(id);
  return machine && machine.enabled !== false ? machine : null;
}

module.exports = { loadMachines, loadAllMachines, getMachine, hostFromUnc, machineHost };
