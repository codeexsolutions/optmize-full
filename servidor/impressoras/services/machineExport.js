const fs = require("fs");
const path = require("path");
const { buildXlsx } = require("./xlsxExport");
const { queryByMachine } = require("../db/records");
const { brDate } = require("../utils/date");
const { pastaDeDados } = require("../../caminhos");

// Onde ficam as cópias de segurança geradas antes de desativar uma máquina.
// Fora do banco de propósito: se alguém apagar o banco, a planilha continua lá.
const EXPORT_DIR = pastaDeDados("exportado");

function durationLabel(sec) {
  sec = Math.max(0, Math.round(Number(sec || 0)));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m) return `${m}min ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

// Planilha com o histórico inteiro da máquina, sem recorte de data.
function buildMachineHistoryXlsx(machine) {
  const records = queryByMachine(machine.id);

  const headers = ["#", "Data", "Horário", "Trabalho", "Status", "Metros (m)", "Área (m²)", "Tempo", "Tinta (mL)"];
  const rows = records.map((r, i) => [
    i + 1,
    brDate(r.date),
    r.time || "",
    r.task || "",
    r.status || "",
    Number(Number(r.printLength || 0).toFixed(2)),
    Number(Number(r.printArea || 0).toFixed(2)),
    durationLabel(r.timeSeconds),
    Number(Number(r.inkMl || 0).toFixed(2))
  ]);

  const totalMeters = records.reduce((sum, r) => sum + Number(r.printLength || 0), 0);
  const totalInk = records.reduce((sum, r) => sum + Number(r.inkMl || 0), 0);
  rows.push(["", "", "", "TOTAL", `${records.length} registro(s)`,
    Number(totalMeters.toFixed(2)), "", "", Number(totalInk.toFixed(2))]);

  return { buffer: buildXlsx(headers, rows, machine.name.slice(0, 28) || "Histórico"), records: records.length };
}

function slug(value) {
  return String(value || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "maquina";
}

function fileNameFor(machine) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1-$2");
  return `historico-${slug(machine.name)}-${stamp}.xlsx`;
}

// Grava a planilha em disco antes de desativar. Devolve o caminho para o
// painel dizer onde a cópia ficou.
function saveMachineExport(machine) {
  const { buffer, records } = buildMachineHistoryXlsx(machine);
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const fileName = fileNameFor(machine);
  const filePath = path.join(EXPORT_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return { fileName, filePath, records };
}

module.exports = { buildMachineHistoryXlsx, saveMachineExport, fileNameFor, EXPORT_DIR };
