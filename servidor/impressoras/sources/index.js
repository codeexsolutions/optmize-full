const xml = require("./xmlHistory");
const csv = require("./csvHistory");
const at = require("./atBinary");
const { enrichAtInkChannels } = require("../services/atInkChannels");
const { enrichXmlInkChannels } = require("../services/xmlInkChannels");

function driver(machine) {
  if (machine.type === "xml") return xml;
  if (machine.type === "csv") return csv;
  if (machine.type === "at-binary") return at;
  throw new Error(`Tipo de máquina não suportado: ${machine.type}`);
}

// ink:false pula a divisão CMYK. Ela abre 4 imagens de preview por trabalho
// pela rede — barato para o dia de hoje (o monitor ao vivo), caro demais para
// meses de histórico: são milhares de tarefas e a importação nunca terminava.
async function readMachineRange(machine, start, end, { ink = true } = {}) {
  const records = await driver(machine).readRange(machine, start, end);
  if (!ink) return records;
  if (machine.type === "at-binary") {
    return enrichAtInkChannels(machine, records);
  }
  if (machine.type === "xml") {
    return enrichXmlInkChannels(machine, records);
  }
  return records;
}

async function machineSignature(machine) {
  return driver(machine).signature(machine);
}

module.exports = { readMachineRange, machineSignature };
