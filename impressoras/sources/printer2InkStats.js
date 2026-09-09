const fs = require("fs/promises");

const HEADER = "IVPM";
const MONTHS = 12;
const CHANNELS_PER_MONTH = 8;
const BYTES_PER_CHANNEL = 4;
const MONTH_SIZE = CHANNELS_PER_MONTH * BYTES_PER_CHANNEL;
const DATA_OFFSET = 4;

// A ordem foi confirmada no próprio JobPrint.dll da máquina:
// "m_nInkCounter :K:%d, C:%d, M:%d, Y:%d."
const COLORS = [
  { code: "K", color: "Black" },
  { code: "C", color: "Cyan" },
  { code: "M", color: "Magenta" },
  { code: "Y", color: "Yellow" }
];

async function readPrinter2InkSnapshot(machine, now = new Date()) {
  if (!machine.inkStatsPath) return null;

  const buffer = await fs.readFile(machine.inkStatsPath);
  const required = DATA_OFFSET + MONTHS * MONTH_SIZE;
  if (buffer.length < required || buffer.toString("ascii", 0, 4) !== HEADER) {
    throw new Error("arquivo de estatísticas CMYK da Impressora 02 inválido");
  }

  const month = now.getMonth();
  const offset = DATA_OFFSET + month * MONTH_SIZE;
  const channels = COLORS.map((item, index) => ({
    ...item,
    ml: buffer.readUInt32LE(offset + index * BYTES_PER_CHANNEL)
  }));

  return {
    year: now.getFullYear(),
    month: month + 1,
    channels,
    totalMl: channels.reduce((sum, item) => sum + item.ml, 0),
    capturedAt: Date.now()
  };
}

function printer2InkDelta(before, after) {
  if (!before || !after) return null;

  const sameMonth = before.year === after.year && before.month === after.month;
  const channels = after.channels.map((item, index) => {
    const previous = sameMonth ? Number(before.channels[index]?.ml || 0) : 0;
    return { ...item, ml: Number(item.ml || 0) - previous };
  });

  // Contador reiniciado/trocado no meio do mês: não inventa um consumo.
  if (channels.some(item => item.ml < 0)) return null;

  const totalMl = channels.reduce((sum, item) => sum + item.ml, 0);
  return { channels, totalMl, exact: true };
}

module.exports = { readPrinter2InkSnapshot, printer2InkDelta };
