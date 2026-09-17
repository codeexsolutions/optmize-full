// Regressões da auditoria: banco e imagens descartáveis, sem rede de impressoras.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once, EventEmitter } = require("node:events");
const vm = require("node:vm");
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "optimize-revisao-impressoras-"));
process.env.OPTIMIZE_DADOS = pasta;

const express = require("express");
const sharp = require("sharp");
const db = require("../servidor/db");
const machines = require("../servidor/impressoras/db/machines");
const records = require("../servidor/impressoras/db/records");
const pedidos = require("../servidor/impressoras/db/pedidos");
const orders = require("../servidor/impressoras/db/serviceOrders");
const { selecionarInstalador } = require("../empacotar/publicar");
let servidor;

function carregarIsolado(arquivo, dependencias, relogio) {
  const contexto = {
    module: { exports: {} }, process: { env: {} },
    console: { log() {}, warn() {} },
    require(nome) {
      assert.ok(Object.hasOwn(dependencias, nome), `dependência não simulada: ${nome}`);
      return dependencias[nome];
    },
    ...relogio
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", arquivo), "utf8"), contexto,
    { filename: arquivo });
  return contexto.module.exports;
}

async function conferirTintaDistribuida() {
  let assinatura = 0, leituras = [], gravados = [], proximoTick;
  const maquina = { id: "csv", name: "CSV", type: "csv" };
  const realtime = carregarIsolado("servidor/impressoras/services/realtime.js", {
    "../sources": { machineSignature: async () => assinatura, readMachineRange: async () => leituras },
    "../utils/date": { localIsoDate: () => "2026-09-17" },
    "../db/records": { upsertMany: registros => { gravados = registros; } },
    "./machineStatus": { setStatus() {} },
    "./inkLevelState": { setInkLowColors() {} },
    "../sources/printer2InkStats": { readPrinter2InkSnapshot: async () => ({}),
      printer2InkDelta: () => ({ totalMl: 100, channels: [{ code: "C", ml: 100 }] }) }
  }, { setInterval(fn) { proximoTick = fn; } });
  realtime.startRealtime({ emit() {} }, async () => [maquina]);
  await new Promise(resolve => setImmediate(resolve));
  assinatura++;
  leituras = [{ id: "a", dateTime: "2026-09-17 10:00:00", printArea: 0, timeSeconds: 0 },
    { id: "b", dateTime: "2026-09-17 10:01:00", printArea: 1 }];
  await proximoTick();
  assert.equal(gravados.reduce((soma, registro) => soma + registro.inkMl, 0), 100);
  assert.ok(gravados.every(registro => registro.inkExperimental));
  assinatura++;
  leituras = [{ id: "c", dateTime: "2026-09-17 10:02:00" },
    { id: "d", dateTime: "2026-09-17 10:03:00" }];
  await proximoTick();
  assert.equal(gravados[0].inkMl, 50);
  assert.equal(gravados[1].inkMl, 50);
  console.log("ok: distribuir tinta entre trabalhos conserva o total medido");
}

async function conferirAvisoDeCancelamento() {
  const eventos = new EventEmitter(), temporizadores = [], mensagens = [];
  const configuracao = { enabled: true, groupId: "simulado", machines: [],
    notifyStart: false, notifyFinish: true, notifyError: true };
  const notifier = carregarIsolado("servidor/impressoras/whatsapp/notifier.js", {
    "../services/printEvents": { printEvents: eventos },
    "./settings": { getSettings: () => configuracao, isReady: () => true },
    "./client": { getStatus: () => ({ connected: true }),
      sendText: async (_grupo, texto) => { mensagens.push(texto); } }
  }, { setTimeout(fn) { temporizadores.push(fn); return { unref() {} }; } });
  notifier.startWhatsappNotifier();
  eventos.emit("print-progress", { machineId: "printexp", task: "Cancelado",
    sourceType: "printexp-live", progressState: "completed", cancelled: true });
  for (const timer of temporizadores.splice(0)) await timer();
  assert.equal(mensagens.length, 1);
  assert.match(mensagens[0], /Impressão interrompida/);
  assert.match(mensagens[0], /Cancelada/);
  console.log("ok: cancelar PrintExp gera aviso de interrupção, sem mensagem real");
}

async function main() {
  machines.upsertMachine({ id: "primeira", type: "xml", name: "Primeira", position: 0,
    previewDir: path.join(pasta, "compartilhamento-indisponivel") });
  machines.upsertMachine({ id: "segunda", type: "csv", name: "Segunda", position: 1 });
  machines.patchMachine("primeira", { name: "Renomeada" });
  assert.deepEqual(machines.listMachines().map(m => m.id), ["primeira", "segunda"]);
  assert.equal(machines.getMachineRow("primeira").position, 0);
  console.log("ok: editar máquina preserva posição");

  const original = { id: "impressao", machineId: "primeira", sourceType: "xml",
    date: "2026-09-17", dateTime: "2026-09-17 10:00:00", task: "trabalho.prt",
    inkMl: 8, inkExperimental: true, inkChannels: [{ code: "C", color: "Ciano", ml: 8 }] };
  records.upsertMany([original]);
  records.upsertMany([{ ...original, inkMl: 4, inkChannels: [] }]);
  assert.deepEqual(records.queryAll()[0].inkChannels, original.inkChannels);
  assert.equal(records.queryAll()[0].inkMl, 8);
  records.upsertMany([{ ...original, inkMl: 10,
    inkChannels: [{ code: "C", color: "Ciano", ml: 10 }] }]);
  assert.equal(records.queryAll()[0].inkMl, 10);
  // Bancos anteriores gravavam ausência de canais como "[]", não como NULL.
  db.prepare("UPDATE imp_records SET inkChannels = '[]', inkMl = 0 WHERE id = ?").run(original.id);
  records.upsertMany([{ ...original, inkMl: 4, inkChannels: [] }]);
  assert.equal(records.queryAll()[0].inkMl, 4);
  console.log("ok: reimportar sem canais preserva tinta; nova medição atualiza");

  const imagem = await sharp({ create: { width: 96, height: 64, channels: 3,
    background: { r: 20, g: 60, b: 140 } } }).png().toBuffer();
  const osId = orders.createOrder({ clientName: "Teste", date: "2026-09-17" },
    [{ originalname: "referencia.png", mimetype: "image/png", buffer: imagem }]);
  const pedidoId = pedidos.createPedido([{ recordId: "impressao", machineId: "primeira",
    task: "trabalho.prt", osId }], "");
  const outroId = pedidos.createPedido([{ recordId: "outra-impressao", task: "outra.prt" }], "");
  const item = pedidos.getPedido(pedidoId).items[0];
  const app = express();
  app.use(express.json());
  app.use("/pedidos", require("../servidor/impressoras/routes/pedidos"));
  servidor = app.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const errado = await fetch(`${base}/pedidos/${outroId}/items/${item.id}/os`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ osId: null }) });
  assert.equal(errado.status, 404);
  assert.equal(pedidos.getPedidoItem(item.id).osId, osId);
  const certa = await fetch(`${base}/pedidos/${pedidoId}/items/${item.id}/os`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ osId }) });
  assert.equal(certa.status, 200);
  console.log("ok: item de outro pedido retorna 404 sem alterar a OS");

  const foto = await fetch(`${base}/pedidos/${pedidoId}/items/${item.id}/imagem`);
  assert.equal(foto.status, 200);
  assert.equal(foto.headers.get("content-type"), "image/jpeg");
  const meta = await sharp(Buffer.from(await foto.arrayBuffer())).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width % 16, 0);
  assert.equal(meta.isProgressive, false);
  console.log("ok: imagem da OS funciona com compartilhamento indisponível");

  const arquivos = ["Optimize_1.0.260_x64-setup.exe", "Optimize_1.0.26-beta_x64-setup.exe",
    "Optimize_1.0.26_arm64-setup.exe", "Optimize_1.0.26_x64-setup.exe"];
  assert.equal(selecionarInstalador(arquivos, "1.0.26"), "Optimize_1.0.26_x64-setup.exe");
  assert.equal(selecionarInstalador(arquivos.slice(0, 3), "1.0.26"), undefined);
  assert.equal(selecionarInstalador(arquivos, "1.0.26-beta"), "Optimize_1.0.26-beta_x64-setup.exe");
  console.log("ok: publicar exige a versão e arquitetura exatas do instalador");
  await conferirTintaDistribuida();
  await conferirAvisoDeCancelamento();
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (servidor) await new Promise(resolve => servidor.close(resolve));
  db.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});
