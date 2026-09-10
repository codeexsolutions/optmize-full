const express = require("express");
const { scanNetwork, suggestIdentity, TYPE_LABEL } = require("../services/discovery");
const { PATH_FIELDS, listMachines, getMachineRow, findByHost, upsertMachine, patchMachine, machineDataStats, purgeMachine } = require("../db/machines");
const { backfillMachine } = require("../services/sync");
const { getStatus } = require("../services/machineStatus");
const { getSettings, saveSettings } = require("../whatsapp/settings");
const { buildMachineHistoryXlsx, saveMachineExport, fileNameFor } = require("../services/machineExport");

// Estado da varredura em andamento. Uma por vez: rodar duas ao mesmo tempo só
// disputaria a rede e produziria escritas conflitantes no banco.
const scan = {
  running: false,
  startedAt: null,
  finishedAt: null,
  phase: "idle",
  scanned: 0,
  total: 0,
  message: "Nenhuma varredura executada ainda",
  reachable: 0,
  results: [],
  error: null,
  controller: null,
  // Máquinas achadas na rede que ainda não existem no banco. Ficam aqui,
  // esperando alguém dar o nome — só então viram cadastro (POST /register).
  pending: new Map()
};

function snapshot() {
  const { controller, pending, ...rest } = scan;
  return rest;
}

const isIpLiteral = value => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || ""));

function samePaths(machine, found) {
  return PATH_FIELDS.every(field => (machine[field] || null) === (found[field] || null));
}

// Casa o que a rede devolveu com o que já existe no banco: primeiro pelo host
// (nome do computador), depois pelo IP. Achando, a máquina mantém id e nome —
// só as rotas são reescritas — para não quebrar o histórico já gravado.
function reconcile(found, machines) {
  const byHost = findByHost(found.host);
  if (byHost) return byHost;
  if (found.ip) {
    const byIp = machines.find(m => m.ip && m.ip === found.ip);
    if (byIp) return byIp;
  }
  return null;
}

function applyScanResult(found) {
  const machines = listMachines({ includeDisabled: true });
  const existing = reconcile(found, machines);

  const paths = {};
  for (const field of PATH_FIELDS) paths[field] = found[field] || null;

  if (existing) {
    // Nunca troca rotas por nome de computador por rotas por IP: o IP muda com
    // o DHCP e quebraria a máquina no próximo reinício do roteador. Se o nome
    // NetBIOS não resolveu nesta varredura, só o IP é anotado.
    if (isIpLiteral(found.host) && existing.host && !isIpLiteral(existing.host)) {
      const kept = upsertMachine({ ...existing, ip: found.ip || existing.ip || null });
      return { action: "unchanged", machine: kept };
    }
    const unchanged = existing.type === found.type && samePaths(existing, found) && existing.ip === (found.ip || null);
    const saved = upsertMachine({
      ...existing,
      ...paths,
      type: found.type,
      host: found.host,
      ip: found.ip || existing.ip || null,
      origin: existing.origin === "manual" ? "manual" : "scan"
    });
    return { action: unchanged ? "unchanged" : "updated", machine: saved };
  }

  // Máquina que a rede tem e o banco não: fica pendente. O nome é de quem
  // opera, não do nome do computador — cadastrar sozinho encheria a lista de
  // "DESKTOP-5KFPUBG" que ninguém reconhece na tela.
  return { action: "pending", machine: null, paths };
}

// O id continua saindo do nome do computador: é chave interna, some da tela e
// precisa ser estável. O que a pessoa escolhe é o nome exibido.
function registerPending(found, name) {
  const machines = listMachines({ includeDisabled: true });
  const takenIds = new Set(machines.map(m => m.id));
  const identity = suggestIdentity(found.host, takenIds);

  const paths = {};
  for (const field of PATH_FIELDS) paths[field] = found[field] || null;

  return upsertMachine({
    ...paths,
    id: identity.id,
    name,
    type: found.type,
    enabled: true,
    host: found.host,
    ip: found.ip || null,
    origin: "scan",
    position: machines.length
  });
}

function createMachinesRouter(io) {
  const router = express.Router();

  const publish = () => { try { io.emit("machines:scan", snapshot()); } catch { /* socket opcional */ } };

  function onProgress(update) {
    if (update.phase) scan.phase = update.phase;
    if (typeof update.scanned === "number") scan.scanned = update.scanned;
    if (typeof update.total === "number") scan.total = update.total;
    if (update.message) scan.message = update.message;
    publish();
  }

  async function runScan(hosts) {
    scan.running = true;
    scan.startedAt = Date.now();
    scan.finishedAt = null;
    scan.phase = "starting";
    scan.scanned = 0;
    scan.total = 0;
    scan.reachable = 0;
    scan.results = [];
    scan.error = null;
    scan.message = "Iniciando varredura...";
    scan.controller = new AbortController();
    publish();

    try {
      const { reachable, found } = await scanNetwork({ hosts, onProgress, signal: scan.controller.signal });
      scan.reachable = reachable;

      // As pendentes NÃO são zeradas a cada varredura: se alguém rodar outra
      // busca antes de dar o nome, a máquina achada antes continuaria válida
      // para cadastrar. Só sai daqui quem foi cadastrado ou ignorado.
      scan.results = found.map(item => {
        const { action, machine, paths } = applyScanResult(item);
        const source = machine || paths;
        if (action === "pending") scan.pending.set(item.host, item);
        return {
          action,
          host: item.host,
          ip: item.ip,
          type: item.type,
          typeLabel: TYPE_LABEL[item.type] || item.type,
          share: item.share,
          root: item.root,
          machineId: machine ? machine.id : null,
          machineName: machine ? machine.name : null,
          paths: PATH_FIELDS.reduce((acc, field) => {
            if (source[field]) acc[field] = source[field];
            return acc;
          }, {})
        };
      });

      // Achar a máquina não basta: o tempo real só lê o dia de hoje, então sem
      // este passo uma impressora recém-descoberta ficaria sem histórico até o
      // próximo reinício do servidor. Importa a janela completa de cada uma.
      let importedTotal = 0;
      const known = scan.results.filter(result => result.machineId);
      if (known.length) {
        onProgress({ phase: "history", scanned: 0, total: known.length, message: "Puxando o histórico das máquinas já cadastradas..." });
        let done = 0;
        for (const result of known) {
          const machine = getMachineRow(result.machineId);
          if (machine) {
            const outcome = await backfillMachine(machine);
            result.imported = outcome.imported;
            result.importError = outcome.ok ? null : outcome.error;
            importedTotal += outcome.imported;
          }
          done++;
          onProgress({
            phase: "history",
            scanned: done,
            total: known.length,
            message: `${result.machineName}: ${result.importError ? `falha ao ler o histórico — ${result.importError}` : `${result.imported || 0} registro(s) importado(s)`}`
          });
        }
      }

      const novas = scan.results.filter(r => r.action === "pending").length;
      const updated = scan.results.filter(r => r.action === "updated").length;
      scan.phase = "done";
      scan.message = scan.results.length
        ? `${scan.results.length} máquina(s) identificada(s)` +
          (novas ? ` — ${novas} nova(s) esperando você dar o nome` : "") +
          ` — ${updated} atualizada(s), ${importedTotal} registro(s) de histórico importado(s).`
        : `Nenhuma impressora reconhecida entre os ${reachable} computador(es) que responderam.`;
    } catch (error) {
      scan.phase = "error";
      scan.error = error.message;
      scan.message = `Falha na varredura: ${error.message}`;
      console.error("[scan] falhou:", error);
    } finally {
      scan.running = false;
      scan.finishedAt = Date.now();
      scan.controller = null;
      publish();
    }
  }

  router.get("/scan", (_req, res) => res.json(snapshot()));

  router.post("/scan", (req, res) => {
    if (scan.running) return res.status(409).json({ error: "Já existe uma varredura em andamento", scan: snapshot() });
    const hosts = Array.isArray(req.body?.hosts)
      ? req.body.hosts.map(h => String(h).trim()).filter(Boolean)
      : [];
    runScan(hosts);
    res.status(202).json(snapshot());
  });

  router.post("/scan/stop", (_req, res) => {
    if (scan.controller) scan.controller.abort();
    res.json(snapshot());
  });

  // Cadastra uma máquina que a varredura encontrou, com o nome que a pessoa
  // escolheu. Só aqui ela entra no banco — e o histórico vem junto, senão a
  // recém-cadastrada ficaria só com os trabalhos de hoje.
  router.post("/register", async (req, res) => {
    const host = String(req.body?.host || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Dê um nome para a máquina antes de cadastrar" });

    const found = scan.pending.get(host);
    if (!found) {
      return res.status(404).json({ error: "Essa máquina não está na última varredura. Procure de novo." });
    }
    if (findByHost(host)) {
      scan.pending.delete(host);
      return res.status(409).json({ error: "Essa máquina já foi cadastrada" });
    }

    const machine = registerPending(found, name);
    scan.pending.delete(host);

    const entry = scan.results.find(result => result.host === host);
    if (entry) {
      entry.action = "created";
      entry.machineId = machine.id;
      entry.machineName = machine.name;
      entry.importing = true;
    }
    publish();

    // A resposta não espera o histórico: numa máquina XML a importação leva
    // quase um minuto (uma pasta por dia). A máquina já está cadastrada e
    // funcionando; a contagem chega pelo socket quando terminar.
    backfillMachine(machine).then(outcome => {
      if (entry) {
        entry.importing = false;
        entry.imported = outcome.imported;
        entry.importError = outcome.ok ? null : outcome.error;
      }
      publish();
    });

    res.status(201).json({ machine, importing: true });
  });

  // Descartar: tira da lista de pendentes sem cadastrar. Volta a aparecer na
  // próxima varredura, porque o computador continua na rede.
  router.post("/dismiss", (req, res) => {
    const host = String(req.body?.host || "").trim();
    if (!scan.pending.delete(host)) return res.status(404).json({ error: "Máquina não está pendente" });
    scan.results = scan.results.filter(result => result.host !== host);
    publish();
    res.json(snapshot());
  });

  // Lista de gestão: inclui as desativadas, as rotas cruas e o tamanho do que
  // cada uma gravou no banco, ao contrário do /api/machines do painel, que
  // devolve status e resumo do dia.
  router.get("/manage", (_req, res) => {
    const machines = listMachines({ includeDisabled: true }).map(machine => {
      const st = getStatus(machine.id);
      return {
        ...machine,
        typeLabel: TYPE_LABEL[machine.type] || machine.type,
        online: st.online,
        error: st.online ? null : st.error,
        paths: PATH_FIELDS.reduce((acc, field) => {
          if (machine[field]) acc[field] = machine[field];
          return acc;
        }, {}),
        stats: machineDataStats(machine.id)
      };
    });
    res.json(machines);
  });

  router.patch("/:id", (req, res) => {
    const patch = {};
    for (const field of ["name", "type", "enabled", "host", "ip", "position", ...PATH_FIELDS]) {
      if (field in (req.body || {})) patch[field] = req.body[field];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Nada para atualizar" });
    const updated = patchMachine(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: "Máquina não encontrada" });
    res.json(updated);
  });

  router.post("/", (req, res) => {
    const body = req.body || {};
    if (!body.id || !body.type) return res.status(400).json({ error: "Informe id e type" });
    if (getMachineRow(body.id)) return res.status(409).json({ error: "Já existe uma máquina com esse id" });
    res.status(201).json(upsertMachine({ ...body, origin: "manual" }));
  });

  // Baixar o histórico da máquina em planilha, a qualquer momento.
  router.get("/:id/export.xlsx", (req, res) => {
    const machine = getMachineRow(req.params.id);
    if (!machine) return res.status(404).json({ error: "Máquina não encontrada" });
    const { buffer } = buildMachineHistoryXlsx(machine);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileNameFor(machine)}"`);
    res.send(buffer);
  });

  // Desativar é o caminho normal para tirar uma máquina do painel: ela some das
  // telas, para de ser lida, mas o histórico continua inteiro no banco. A
  // planilha é gravada antes, em data/exports, para existir uma cópia fora do
  // banco mesmo que alguém apague tudo depois.
  router.post("/:id/deactivate", (req, res) => {
    const machine = getMachineRow(req.params.id);
    if (!machine) return res.status(404).json({ error: "Máquina não encontrada" });
    if (!machine.enabled) return res.status(409).json({ error: "Essa máquina já está desativada" });

    let exported = null;
    try {
      exported = saveMachineExport(machine);
      console.log(`[maquinas] ${machine.name}: ${exported.records} registro(s) exportados para ${exported.filePath}`);
    } catch (error) {
      // Sem cópia de segurança não desativa: é justamente ela que torna a
      // operação reversível sem depender do banco.
      return res.status(500).json({ error: `Falha ao exportar o histórico: ${error.message}` });
    }

    const updated = patchMachine(machine.id, { enabled: false });
    res.json({ machine: updated, export: { fileName: exported.fileName, records: exported.records } });
  });

  // Exclusão definitiva: apaga a máquina e tudo que ela gerou (histórico,
  // itens de pedido, pedido que ficou vazio) e ainda a tira da lista de avisos
  // do WhatsApp, senão o filtro continuaria citando um id que não existe mais.
  // Só aceita máquina já desativada — assim nada some com um clique só.
  router.delete("/:id", (req, res) => {
    const id = req.params.id;
    const machine = getMachineRow(id);
    if (!machine) return res.status(404).json({ error: "Máquina não encontrada" });
    if (machine.enabled) {
      return res.status(409).json({ error: "Desative a máquina antes de excluir — assim o histórico é exportado primeiro" });
    }

    const result = purgeMachine(id);

    const settings = getSettings();
    if (settings.machines.includes(id)) {
      saveSettings({ machines: settings.machines.filter(item => item !== id) });
    }

    scan.results = scan.results.filter(item => item.machineId !== id);
    publish();


    res.json({ ok: true, id, name: machine.name, ...result });
  });

  return router;
}

module.exports = { createMachinesRouter };
