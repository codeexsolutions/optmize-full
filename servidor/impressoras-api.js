/**
 * ===========================================================================
 * IMPRESSORAS — o histórico da produção que sai das máquinas
 * ===========================================================================
 *
 * Monta tudo que o módulo `impressoras/` oferece debaixo de
 * `/api/impressoras`. É o mesmo papel que `moldes-api.js` e `projetos-api.js`
 * fazem para as telas deles.
 *
 * O que este módulo faz, em uma frase: acha as impressoras da rede sozinho,
 * lê o histórico do compartilhamento de cada uma e guarda tudo no `dados.db`,
 * para a tela nunca mais ir à rede a cada acesso.
 *
 * ---------------------------------------------------------------------------
 * NÃO EXISTE MÁQUINA ESCRITA NO CÓDIGO
 * ---------------------------------------------------------------------------
 *
 * Nem no código, nem em arquivo de configuração. Uma impressora só existe
 * depois que a varredura da rede a encontrou e alguém deu um nome a ela; daí
 * em diante ela mora na tabela `imp_machines`. Ver `impressoras/config.js`
 * para o porquê, e `impressoras/services/discovery.js` para como a varredura
 * reconhece cada tipo de máquina pelo que ela deixa no compartilhamento.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O BANCO NO MEIO
 * ---------------------------------------------------------------------------
 *
 * A tela não lê a máquina em tempo real a cada acesso. Era isso que travava o
 * painel quando várias pessoas olhavam ao mesmo tempo: cada requisição ia
 * bater no compartilhamento SMB de cada impressora. Hoje quem conversa com as
 * máquinas são só os leitores ao vivo (`realtime`, `liveLog`, `printer2Live`)
 * e o `sync` da subida; as rotas daqui consultam apenas o SQLite. O efeito
 * colateral bom: dia antigo continua consultável com a máquina desligada.
 *
 * ---------------------------------------------------------------------------
 * O QUE RODA SOZINHO
 * ---------------------------------------------------------------------------
 *
 * `iniciarImpressoras` é o que põe os leitores de pé. Eles recebem um "tap"
 * no lugar do `io` do socket.io: tudo que vai para o navegador passa também
 * por um barramento interno, que é o que o bot do WhatsApp escuta. Assim o
 * bot vê exatamente os mesmos eventos que a tela mostra, sem reler arquivo
 * nenhum e sem poder divergir do painel (ver `services/printEvents.js`).
 *
 * ---------------------------------------------------------------------------
 * SOBRE OS NOMES EM INGLÊS
 * ---------------------------------------------------------------------------
 *
 * Este módulo inteiro foi PORTADO de um sistema que já rodava na produção, e
 * portar é acrescentar o que falta, não reescrever o que funciona. Traduzir
 * `machineId`, `printLength` e as colunas do banco em quarenta arquivos seria
 * arriscar um domínio testado para agradar a vista. Os nomes acompanham o
 * código que os usa.
 */

const express = require("express");

const { loadMachines, getMachine } = require("./impressoras/config");
const { summarize, mergeSummaries } = require("./impressoras/utils/summary");
const { normalizeRange, localIsoDate, addDays, enumerateDays, weekBounds } = require("./impressoras/utils/date");
const { normalizeText } = require("./impressoras/utils/text");
const { previewInfo, readPreview } = require("./impressoras/services/preview");
const { startRealtime, getActiveAtProgress } = require("./impressoras/services/realtime");
const { startLiveLog, getLiveLogSnapshot } = require("./impressoras/services/liveLog");
const { startPrinter2Live, getPrinter2LiveSnapshot } = require("./impressoras/services/printer2Live");
const { startPrintExpLive, getPrintExpLiveSnapshot } = require("./impressoras/services/printExpLive");
const { getPrinter2DetailedSnapshot } = require("./impressoras/services/printer2Cancel");
const { tapIo } = require("./impressoras/services/printEvents");
const { getStatus } = require("./impressoras/services/machineStatus");
const { getInkLowColors } = require("./impressoras/services/inkLevelState");
const { backfillHistory } = require("./impressoras/services/sync");
const { qrToSvg, qrShortCode } = require("./impressoras/services/qrcode");
const { buildProductionReportPdf } = require("./impressoras/services/productionReportPdf");
const { queryRange, queryAll } = require("./impressoras/db/records");
const { listOrders, getOrder } = require("./impressoras/db/serviceOrders");
const { findItemByRecordId, getPedido, listPedidos } = require("./impressoras/db/pedidos");
const serviceOrdersRouter = require("./impressoras/routes/serviceOrders");
const pedidosRouter = require("./impressoras/routes/pedidos");
const whatsappRouter = require("./impressoras/routes/whatsapp");
const { createMachinesRouter } = require("./impressoras/routes/machines");
const { startWhatsappNotifier } = require("./impressoras/whatsapp/notifier");
const { autoStart: autoStartWhatsapp } = require("./impressoras/whatsapp/client");

/**
 * As rotas. Recebe o `io` porque a varredura da rede publica o progresso dela
 * pelo socket — é uma operação de meio minuto, e sem isso a tela ficaria
 * olhando para um botão parado.
 */
function criarRotasDeImpressoras(io) {
  const router = express.Router();

  // Resposta de impressora nunca é cacheada: a lista tem que refletir o que a
  // máquina acabou de escrever, e um cache de proxy aqui mostraria trabalho
  // velho como se fosse o de agora.
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  router.use("/service-orders", serviceOrdersRouter);
  router.use("/pedidos", pedidosRouter);
  router.use("/whatsapp", whatsappRouter);
  // Vem ANTES do GET /machines logo abaixo. Este router trata /scan, /manage,
  // /register e a edição das rotas; a listagem enriquecida do painel (com
  // status e resumo do dia) não está nele, então cai no GET adiante.
  router.use("/machines", createMachinesRouter(io));

  router.get("/live-progress", (_req, res) => {
    try {
      const items = [...getActiveAtProgress(), ...getLiveLogSnapshot(), ...getPrintExpLiveSnapshot(), ...getPrinter2LiveSnapshot(), ...getPrinter2DetailedSnapshot()];
      // Cada impressora só executa um trabalho por vez. Algumas fontes AT
      // mantêm registros antigos com estado "printing"; escolhemos somente o
      // registro cronologicamente mais recente de cada máquina.
      const byMachine = new Map();
      for (const item of items) {
        const previous = byMachine.get(item.machineId);
        const itemDate = String(item.dateTime || "");
        const previousDate = String(previous?.dateTime || "");
        if (!previous || itemDate > previousDate || (!itemDate && Number(item.progressAt || 0) >= Number(previous.progressAt || 0))) {
          byMachine.set(item.machineId, item);
        }
      }
      res.json([...byMachine.values()]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Resolve o código curto lido do QR (impresso na lista de produção e na OS)
  // de volta pro trabalho/OS correspondente. Pensado pro app do Raspberry Pi
  // da calandra chamar depois de ler a câmera: GET /api/scan/R1a0cb1bc58
  router.get("/scan/:code", (req, res) => {
    const code = String(req.params.code || "");
    const prefix = code[0];

    try {
      if (prefix === "R") {
        const match = queryAll().find(r => qrShortCode("R", r.id) === code);
        if (!match) return res.status(404).json({ error: "Código não encontrado" });

        const response = {
          type: "record",
          id: match.id,
          task: match.task,
          machineId: match.machineId,
          machineName: match.machineName,
          date: match.date,
          time: match.time,
          printLength: match.printLength,
          status: match.status,
          pedido: null
        };

        // Se esse trabalho está num pedido em aberto, manda o contexto pro
        // app do Raspberry: posição na lista, status já registrado (se já
        // leu antes) e a imagem da OS vinculada, quando tiver.
        const item = findItemByRecordId(match.id);
        if (item) {
          const pedido = getPedido(item.pedidoId);
          const position = pedido.items.findIndex(i => i.id === item.id);
          const order = item.osId ? getOrder(item.osId) : null;

          response.pedido = {
            pedidoId: item.pedidoId,
            pedidoStatus: pedido.status,
            itemId: item.id,
            position,
            totalItems: pedido.items.length,
            calandraStatus: item.calandraStatus,
            calandraReason: item.calandraReason,
            calandraCustomReason: item.calandraCustomReason,
            image: order && order.images[0]
              ? { osId: order.id, imageId: order.images[0].id, clientName: order.clientName, fabric: order.fabric }
              : null
          };
        }

        return res.json(response);
      }

      // "P" = pedido inteiro — um único QR pra lista toda. O app da
      // calandra lê esse código UMA vez e recebe todos os itens já na
      // ordem certa, com a imagem de cada um (quando tiver OS vinculada).
      if (prefix === "P") {
        const match = listPedidos().find(p => qrShortCode("P", p.id) === code);
        if (!match) return res.status(404).json({ error: "Código não encontrado" });

        const pedido = getPedido(match.id);
        const items = pedido.items.map((item, position) => {
          const order = item.osId ? getOrder(item.osId) : null;
          return {
            itemId: item.id,
            position,
            recordId: item.recordId,
            task: item.task,
            machineName: item.machineName,
            printLength: item.printLength,
            date: item.date,
            calandraStatus: item.calandraStatus,
            calandraReason: item.calandraReason,
            calandraCustomReason: item.calandraCustomReason,
            image: order && order.images[0]
              ? { osId: order.id, imageId: order.images[0].id, clientName: order.clientName, fabric: order.fabric }
              : null
          };
        });

        return res.json({
          type: "pedido",
          id: pedido.id,
          status: pedido.status,
          totalItems: items.length,
          items
        });
      }

      if (prefix === "O") {
        const match = listOrders().find(o => qrShortCode("O", o.id) === code);
        if (!match) return res.status(404).json({ error: "Código não encontrado" });
        return res.json({
          type: "service_order",
          id: match.id,
          clientName: match.clientName,
          fabric: match.fabric,
          printSize: match.printSize,
          meters: match.meters,
          machine: match.machine,
          date: match.date
        });
      }

      return res.status(400).json({ error: "Código inválido" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/reposicao", (_req, res) => {
    try {
      const matches = queryAll().filter(r => normalizeText(r.task).includes("reposic"));

      const weeksMap = new Map();
      for (const r of matches) {
        const { start, end } = weekBounds(r.date);
        if (!weeksMap.has(start)) {
          weeksMap.set(start, { weekStart: start, weekEnd: end, totalMeters: 0, count: 0, items: [] });
        }
        const w = weeksMap.get(start);
        w.totalMeters += Number(r.printLength || 0);
        w.count += 1;
        w.items.push({
          id: r.id,
          date: r.date,
          time: r.time || "",
          machineName: r.machineName || "",
          task: r.task || "",
          printLength: Number(r.printLength || 0)
        });
      }

      const weeks = [...weeksMap.values()]
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
        .map(w => ({
          ...w,
          totalMeters: Number(w.totalMeters.toFixed(2)),
          items: w.items.sort((a, b) =>
            a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)
          )
        }));

      const totalMeters = Number(matches.reduce((a, r) => a + Number(r.printLength || 0), 0).toFixed(2));

      res.json({ weeks, totalMeters, totalCount: matches.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/machines", async (_req, res) => {
    try {
      const machines = await loadMachines();
      const today = localIsoDate();
      const result = machines.map(m => {
        const st = getStatus(m.id);
        const records = queryRange(m.id, today, today);
        return { ...m, online:st.online, error:st.online ? null : st.error, inkLowColors:getInkLowColors(m.id), todaySummary:summarize(records) };
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error:error.message });
    }
  });

  router.get("/history", async (req, res) => {
    const { start, end } = normalizeRange(req.query.start, req.query.end);
    const machineId = String(req.query.machine || "all");

    try {
      const machines = await loadMachines();
      const selected = machineId === "all" ? machines : machines.filter(m => m.id === machineId);
      // Instalação nova não tem máquina nenhuma: elas só entram depois que a
      // varredura da rede as acha. "Todas" de um conjunto vazio é um histórico
      // vazio, não um erro — o 404 aqui fazia a tela abrir dizendo "máquina
      // não encontrada" para quem ainda nem tinha procurado.
      if (!selected.length && machineId !== "all") {
        return res.status(404).json({ error:"Máquina não encontrada" });
      }

      const chunks = selected.map(machine => {
        const st = getStatus(machine.id);
        const records = queryRange(machine.id, start, end);
        return { machine, online:st.online, error:st.online ? null : st.error, records, summary:summarize(records) };
      });

      const records = chunks.flatMap(c => c.records).sort((a,b) => b.dateTime.localeCompare(a.dateTime));
      res.json({
        start, end,
        records,
        summary: mergeSummaries(chunks.map(c => c.summary)),
        machines: chunks.map(c => ({
          id:c.machine.id, name:c.machine.name, type:c.machine.type,
          online:c.online, error:c.error || null, inkLowColors:getInkLowColors(c.machine.id), summary:c.summary
        }))
      });
    } catch (error) {
      res.status(500).json({ error:error.message });
    }
  });

  // Soma os canais CMYK de uma lista de registros. Cada registro guarda a
  // divisão como [{code,color,ml}]; aqui vira o total do período por cor, que
  // alimenta a rosca de composição de tinta do painel.
  function sumInkChannels(records) {
    const totals = new Map();
    for (const record of records) {
      for (const channel of record.inkChannels || []) {
        const code = String(channel.code || channel.color || "?");
        const current = totals.get(code) || { code, color: channel.color || code, ml: 0 };
        current.ml += Number(channel.ml || 0);
        totals.set(code, current);
      }
    }
    const ordem = { C: 0, M: 1, Y: 2, K: 3 };
    return [...totals.values()]
      .filter(item => item.ml > 0)
      .sort((a, b) => (ordem[a.code] ?? 9) - (ordem[b.code] ?? 9));
  }

  // Produção dia a dia no intervalo, com os dias sem trabalho zerados — o
  // gráfico de área precisa da linha contínua, senão um domingo parado vira
  // um buraco no meio da curva.
  function dailySeries(records, start, end) {
    const porDia = new Map(enumerateDays(start, end).map(day => [day, { date: day, meters: 0, jobs: 0, inkMl: 0 }]));
    for (const record of records) {
      const dia = porDia.get(record.date);
      if (!dia || record.cancelled || record.error) continue;
      dia.meters += Number(record.printLength || 0);
      dia.inkMl += Number(record.inkMl || 0);
      dia.jobs++;
    }
    return [...porDia.values()];
  }

  router.get("/dashboard", async (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : localIsoDate();
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 7));
    const start = addDays(date, -(days - 1));
    // Janela anterior do mesmo tamanho, só para a variação percentual.
    const anteriorEnd = addDays(start, -1);
    const anteriorStart = addDays(anteriorEnd, -(days - 1));

    try {
      const machines = await loadMachines();
      const data = machines.map(machine => {
        const st = getStatus(machine.id);
        const hoje = queryRange(machine.id, date, date);
        const periodo = queryRange(machine.id, start, date);
        return {
          machine: { id: machine.id, name: machine.name, type: machine.type },
          online: st.online,
          error: st.online ? null : st.error,
          inkLowColors: getInkLowColors(machine.id),
          today: summarize(hoje),
          period: summarize(periodo),
          series: dailySeries(periodo, start, date)
        };
      });

      const todosPeriodo = queryRange("all", start, date);
      const anterior = queryRange("all", anteriorStart, anteriorEnd);

      res.json({
        date, start, end: date, days,
        today: mergeSummaries(data.map(x => x.today)),
        period: mergeSummaries(data.map(x => x.period)),
        previous: summarize(anterior),
        series: dailySeries(todosPeriodo, start, date),
        inkChannels: sumInkChannels(todosPeriodo),
        machines: data
      });
    } catch (error) {
      res.status(500).json({ error:error.message });
    }
  });

  router.get("/report-production.pdf", async (req,res)=>{
    const end=/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.end||""))?String(req.query.end):localIsoDate();
    const start=addDays(end,-29),machineId=String(req.query.machine||"all");
    try{
      const allMachines=await loadMachines();
      const machines=machineId==="all"?allMachines:allMachines.filter(machine=>machine.id===machineId);
      // Idem /history: sem máquina cadastrada o relatório sai vazio, não em erro.
      if(!machines.length&&machineId!=="all")return res.status(404).send("Máquina não encontrada");
      const ids=new Set(machines.map(machine=>machine.id));
      const records=queryRange("all",start,end).filter(record=>ids.has(record.machineId));
      const pdf=buildProductionReportPdf({records,machines,end,today:localIsoDate()});
      res.setHeader("Content-Type","application/pdf");
      res.setHeader("Content-Disposition",`inline; filename="relatorio-producao-${end}.pdf"`);
      pdf.pipe(res);pdf.end();
    }catch(error){res.status(500).send(error.message);}
  });

  router.get("/preview-info", async (req, res) => {
    try {
      const machine = await getMachine(String(req.query.machine || ""));
      if (!machine) return res.status(404).json({ error:"Máquina não encontrada" });
      const info = await previewInfo(machine, String(req.query.task || ""), String(req.query.ref || ""));
      res.json(info);
    } catch (error) {
      res.status(500).json({ error:error.message });
    }
  });


  router.get("/preview-debug", async (req, res) => {
    try {
      const machine = await getMachine(String(req.query.machine || ""));
      if (!machine) return res.status(404).json({ error:"Máquina não encontrada" });

      const task = String(req.query.task || "");
      const info = await previewInfo(machine, task, String(req.query.ref || ""));

      res.json({
        machine: {
          id: machine.id,
          name: machine.name,
          type: machine.type,
          previewDir: machine.previewDir
        },
        task,
        ...info
      });
    } catch (error) {
      res.status(500).json({ error:error.message });
    }
  });

  router.get("/preview-image", async (req, res) => {
    try {
      const machine = await getMachine(String(req.query.machine || ""));
      if (!machine) return res.status(404).send("Máquina não encontrada");
      const result = await readPreview(
        machine,
        String(req.query.task || ""),
        Number(req.query.channel || 0),
        String(req.query.ref || "")
      );
      if (!result) return res.status(404).send("Preview não encontrado");
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "private, max-age=60");
      res.send(result.data);
    } catch (error) {
      res.status(404).send(error.message);
    }
  });


  router.post("/print-list", (req, res) => {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    const mode = String((req.body && req.body.mode) || "production");
    const pedidoId = req.body && req.body.pedidoId ? String(req.body.pedidoId) : null;
    const total = items.reduce((a, r) => a + Number(r.printLength || 0), 0);
    const today = new Date().toLocaleDateString("pt-BR");

    // Um único QR representando a lista inteira (o pedido) — não mais um por
    // item. Fica grande e embaixo da folha, de propósito: fica mais fácil
    // pra câmera da calandra ler do que vários QRs pequenos espalhados.
    const listQrSvg = pedidoId ? qrToSvg(qrShortCode("P", pedidoId), { moduleSize: 12, quiet: 2 }) : "";
    const listQrBlock = pedidoId
      ? `<div class="list-qr"><div class="list-qr-box">${listQrSvg}</div><span>Escaneie na calandra pra iniciar esse pedido</span></div>`
      : "";

    if (mode === "list") {
      const rows = items.map((r, i) => `
        <tr>
          <td class="idx">${i + 1}</td>
          <td class="name">${escapeHtml(r.task)}</td>
          <td>${escapeHtml(r.machineName)}</td>
          <td class="meters">${Number(r.printLength || 0).toFixed(2)} m</td>
          <td class="obs"><input class="obs-input" type="text" placeholder="Digite uma observação..." aria-label="Observação do item ${i + 1}"></td>
        </tr>
      `).join("");

      return res.send(`<!doctype html>
  <html lang="pt-BR">
  <head>
  <meta charset="utf-8">
  <title>Lista de Produção</title>
  <style>
    *{box-sizing:border-box}
    @page{size:A4 portrait;margin:12mm}
    body{
      font-family:Arial,sans-serif;
      margin:0;
      background:#f4f6f8;
      color:#17202a
    }
    .page{
      width:min(100%,1100px);
      margin:0 auto;
      padding:26px
    }
    .sheet{
      background:#fff;
      border:1px solid #dfe3e8;
      border-radius:14px;
      padding:22px
    }
    .head{
      display:flex;
      justify-content:space-between;
      align-items:flex-end;
      gap:20px;
      padding-bottom:15px;
      border-bottom:2px solid #146fe8
    }
    h1{margin:0;font-size:24px}
    .date{color:#667085;font-size:12px}
    .summary{
      display:flex;
      gap:26px;
      padding:14px 0;
      color:#475467;
      font-size:13px
    }
    .summary strong{color:#146fe8;font-size:18px}
    table{
      width:100%;
      border-collapse:collapse;
      table-layout:fixed;
      font-size:12px
    }
    thead th{
      text-align:left;
      background:#f8fafc;
      color:#475467;
      padding:9px 8px;
      border:1px solid #dfe3e8
    }
    td{
      padding:9px 8px;
      border:1px solid #dfe3e8;
      vertical-align:middle
    }
    .idx{width:42px;text-align:center;font-weight:bold}
    .name{width:42%;font-weight:700}
    .meters{width:110px;font-weight:800;color:#146fe8}
    .obs{height:38px;padding:4px}
    .obs-input{
      width:100%;
      min-height:30px;
      border:0;
      outline:none;
      background:transparent;
      font:inherit;
      color:inherit;
      padding:5px 6px
    }
    .obs-input:focus{
      box-shadow:inset 0 0 0 2px #146fe8;
      border-radius:4px
    }
    .footer{
      display:flex;
      justify-content:flex-end;
      margin-top:14px;
      font-size:18px;
      font-weight:800;
      color:#146fe8
    }
    .bottom-qr{display:flex;justify-content:center;margin-top:22px;padding-top:18px;border-top:1px dashed #dfe3e8}
    .list-qr{display:flex;flex-direction:column;align-items:center;gap:8px}
    .list-qr-box{background:#fff;border:3px solid #146fe8;border-radius:10px;padding:10px;line-height:0}
    .list-qr-box svg{width:180px;height:180px;display:block}
    .list-qr span{font-size:12px;color:#146fe8;font-weight:800;text-transform:uppercase;letter-spacing:.05em;text-align:center}
    .actions{text-align:center;margin:18px 0}
    button{
      padding:11px 24px;
      border:0;
      border-radius:9px;
      background:#146fe8;
      color:white;
      font-weight:bold;
      cursor:pointer
    }
    @media print{
      body{background:#fff}
      .page{padding:0;width:auto}
      .sheet{border:0;border-radius:0;padding:0}
      .actions{display:none}
      tr{break-inside:avoid}
      .bottom-qr{break-inside:avoid}
      .obs-input{
        box-shadow:none!important;
        padding:0;
        min-height:0
      }
      .obs-input::placeholder{color:transparent}
    }
  </style>
  </head>
  <body>
  <div class="page">
    <section class="sheet">
      <div class="head">
        <div>
          <h1>Lista de Produção</h1>
          <div class="date">${today}</div>
        </div>
        <div class="date">${items.length} item(ns)</div>
      </div>

      <div class="summary">
        <span>Total selecionado: <strong>${total.toFixed(2)} m</strong></span>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Nome do trabalho</th>
            <th>Máquina</th>
            <th>Metragem</th>
            <th>Observação</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="footer">Total: ${total.toFixed(2)} metros</div>
      ${pedidoId ? `<div class="bottom-qr">${listQrBlock}</div>` : ""}
    </section>

    <div class="actions">
      <button onclick="window.print()">Imprimir lista</button>
    </div>
  </div>
  </body>
  </html>`);
    }

    // Modo produção com imagem
    const cards = items.map((r, i) => {
      const img =
        `/api/impressoras/preview-image?machine=${encodeURIComponent(r.machineId)}` +
        `&task=${encodeURIComponent(r.task)}` +
        `&ref=${encodeURIComponent(r.previewRef || "")}` +
        `&channel=0`;

      return `
        <article class="card">
          <div class="num">${i + 1}</div>
          <img src="${img}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="noimg">Sem imagem</div>
          <div class="info">
            <strong>${escapeHtml(r.task)}</strong>
            <span>${escapeHtml(r.machineName)} • ${Number(r.printLength || 0).toFixed(2)} m</span>
          </div>
          <textarea placeholder="Observação..."></textarea>
        </article>`;
    }).join("");

    res.send(`<!doctype html>
  <html lang="pt-BR">
  <head>
  <meta charset="utf-8">
  <title>Lista de Produção</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:0;padding:28px;background:#f5f7fa;color:#17202a}
    h1{text-align:center;margin:0 0 6px}
    .sub{text-align:center;color:#667085;margin-bottom:24px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
    .card{background:white;border:1px solid #dfe3e8;border-radius:14px;overflow:hidden;break-inside:avoid;position:relative}
    .num{background:#146fe8;color:white;font-weight:bold;padding:6px 12px}
    img,.noimg{width:100%;height:180px;object-fit:contain;background:#f8fafc}
    .noimg{display:none;align-items:center;justify-content:center;color:#98a2b3}
    .info{display:grid;gap:5px;padding:12px}
    .info span{color:#667085;font-size:13px}
    textarea{width:calc(100% - 24px);margin:0 12px 12px;min-height:55px;border:1px solid #dfe3e8;border-radius:8px;padding:8px}
    .total{text-align:right;font-size:20px;font-weight:bold;margin:24px 0;color:#146fe8}
    button{display:block;margin:auto;padding:11px 24px;border:0;border-radius:9px;background:#146fe8;color:#fff;font-weight:bold}
    .bottom-qr{display:flex;justify-content:center;margin:26px 0;padding-top:18px;border-top:1px dashed #dfe3e8}
    .list-qr{display:flex;flex-direction:column;align-items:center;gap:8px}
    .list-qr-box{background:#fff;border:3px solid #146fe8;border-radius:10px;padding:10px;line-height:0}
    .list-qr-box svg{width:180px;height:180px;display:block}
    .list-qr span{font-size:12px;color:#146fe8;font-weight:800;text-transform:uppercase;letter-spacing:.05em;text-align:center}
    @media print{
      body{padding:10px;background:#fff}
      button{display:none}
      .card{box-shadow:none}
      textarea{border:1px dashed #bbb}
      .bottom-qr{break-inside:avoid}
    }
  </style>
  </head>
  <body>
    <h1>Lista de Produção</h1>
    <div class="sub">${today}</div>
    <div class="grid">${cards}</div>
    <div class="total">Total: ${total.toFixed(2)} metros</div>
    ${pedidoId ? `<div class="bottom-qr">${listQrBlock}</div>` : ""}
    <button onclick="window.print()">Imprimir produção</button>
  </body>
  </html>`);
  });

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  return router;
}

/**
 * Põe os leitores das máquinas de pé e importa o histórico que já existe.
 *
 * O `backfill` roda solto de propósito: numa máquina XML ele leva perto de um
 * minuto (é uma pasta por dia lida pela rede), e segurar a subida do servidor
 * por causa dele deixaria o Optimize inteiro esperando impressora — sendo que
 * moldes, encaixe e vetor não têm nada a ver com isso.
 */
function iniciarImpressoras(io) {
  const ioTap = tapIo(io);

  startWhatsappNotifier();
  // Havendo sessão salva, reconecta sozinho: depois do primeiro QR ninguém
  // precisa abrir o painel quando o PC reiniciar.
  autoStartWhatsapp();

  startRealtime(ioTap, loadMachines);
  startLiveLog(ioTap, loadMachines);
  // Este também levanta a detecção de cancelamento e o aviso de tinta baixa
  // das máquinas CSV (ver o fim de services/printer2Live.js).
  startPrinter2Live(ioTap, loadMachines);
  // O PrintExp tem log próprio (chinês, em GBK) e o progresso num .ini de 89
  // bytes; o liveLog.js não fala esse dialeto.
  startPrintExpLive(ioTap, loadMachines);

  backfillHistory(loadMachines).catch(error =>
    console.error("[impressoras] backfill falhou:", error.message));
}

module.exports = { criarRotasDeImpressoras, iniciarImpressoras };
