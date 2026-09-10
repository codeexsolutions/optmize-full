const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");
const xml2js = require("xml2js");
const { enumerateDays } = require("../utils/date");

const parser = new xml2js.Parser();
// Calibrado comparando o mesmo trabalho nas máquinas 02, 04, 06 e 07.
const INK_ML_PER_M2 = Number(process.env.PRINTER4_INK_ML_PER_M2 || 3);

function dayFolder(base, iso) {
  const [y,m,d] = iso.split("-");
  return path.join(base, y, `${y}${m}`, `${y}${m}${d}`);
}

async function xmlFiles(folder) {
  try {
    const names = await fs.readdir(folder);
    const items = [];
    for (const name of names) {
      if (!name.toLowerCase().endsWith(".xml")) continue;
      const full = path.join(folder, name);
      const stat = await fs.stat(full);
      items.push({ full, mtime: stat.mtimeMs });
    }
    return items.sort((a,b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

function normalizeDateTime(raw) {
  if (!raw) return { dateTime: "", date: "", time: "" };
  const s = String(raw);
  const [d, hRaw=""] = s.split("T");
  const h = hRaw.slice(0,8);
  return { dateTime: `${d} ${h}`.trim(), date: d, time: h };
}

async function readRange(machine, start, end) {
  const out = [];

  for (const day of enumerateDays(start, end)) {
    const folder = dayFolder(machine.historyPath, day);
    const files = await xmlFiles(folder);

    for (const item of files) {
      try {
        const raw = await fs.readFile(item.full, "utf8");
        const parsed = await parser.parseStringPromise(raw);
        const records = parsed?.PrintRecordList?.PrintRecord || [];

        records.forEach((record, idx) => {
          const job = record.UIJob?.[0] || {};
          const task = job.string?.[0] || path.basename(item.full);
          const dateRaw = job.dateTime?.[0] || "";
          const dt = normalizeDateTime(dateRaw);
          const statusRaw = job.JobStatus?.[0] || "Concluído";
          const floats = record.float || [];
          const printLength = parseFloat(floats[0] || 0);
          const printArea = parseFloat(floats[1] || 0);
          const ticks = Number(record.long?.[0] || 0);
          const timeSeconds = Number.isFinite(ticks) && ticks > 0 ? Math.round(ticks / 10000000) : 0;
          const inkColorNames = { Yellow: "Amarelo", Magenta: "Magenta", Cyan: "Ciano", Black: "Preto" };
          const inkLowColors = (record.ArrayOfInnerInkCount?.[0]?.InnerInkCount || [])
            .filter(entry => Number(entry.Value?.[0]) === 1)
            .map(entry => inkColorNames[String(entry.Color?.[0] || "")] || String(entry.Color?.[0] || ""))
            .filter(Boolean);
          // ArrayOfInnerInkCount não é consumo: 0/1 indica se o reservatório
          // daquela cor está pedindo reposição. A 04 não grava mL por trabalho
          // neste XML; por isso usamos somente uma estimativa pela área.
          const inkMl = printArea > 0 ? printArea * INK_ML_PER_M2 : 0;
          const error = /error|fail/i.test(statusRaw) || printLength === 0;

          let previewRef = task;
          if (Array.isArray(job.string)) {
            const img = job.string.find(v => typeof v === "string" && /\.(bmp|jpg|jpeg|png)$/i.test(v));
            if (img) previewRef = img;
          }

          out.push({
            id: `${machine.id}|${dt.dateTime}|${task}|${idx}`,
            machineId: machine.id,
            machineName: machine.name,
            sourceType: machine.type,
            dateTime: dt.dateTime,
            date: dt.date || day,
            time: dt.time,
            task,
            pass: null,
            status: error ? "Erro" : statusRaw,
            cancelled: false,
            error,
            printArea,
            printLength,
            finish: null,
            total: null,
            timeSeconds,
            inkMl,
            inkExperimental: inkMl > 0,
            inkChannels: [],
            inkLowColors,
            previewRef
          });
        });
      } catch (error) {
        console.error("XML:", item.full, error.message);
      }
    }
  }

  return out;
}

async function signature(machine) {
  // Assinatura do dia atual: quantidade + mtime mais recente.
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth()+1).padStart(2,"0");
  const d = String(now.getDate()).padStart(2,"0");
  const folder = path.join(machine.historyPath, y, `${y}${m}`, `${y}${m}${d}`);
  const files = await xmlFiles(folder);
  const latest = files[0]?.mtime || 0;
  return `${files.length}:${latest}`;
}

module.exports = { readRange, signature };
