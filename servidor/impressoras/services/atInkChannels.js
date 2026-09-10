const fs = require("fs/promises");
const sharp = require("sharp");
const { atInkChannelFiles } = require("./preview");

// O AT.printer gera: 1=Y, 2=M, 3=C e 4=K. Cada imagem e uma
// mascara visual do canal; usamos a intensidade media para ratear o total.
const CHANNELS = [
  { preview: 4, code: "K", color: "Preto", component: 3 },
  { preview: 3, code: "C", color: "Ciano", component: 0 },
  { preview: 2, code: "M", color: "Magenta", component: 1 },
  { preview: 1, code: "Y", color: "Amarelo", component: 2 }
];

const cache = new Map();

async function maskWeight(file, component) {
  const stat = await fs.stat(file);
  const key = `${file}|${stat.size}|${stat.mtimeMs}|${component}`;
  if (cache.has(key)) return cache.get(key);

  const { data, info } = await sharp(file)
    .removeAlpha()
    .resize({ width: 900, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  const pixels = Math.max(1, info.width * info.height);
  for (let i = 0; i < data.length; i += info.channels) {
    if (component === 3) {
      sum += 255 - ((data[i] + data[i + 1] + data[i + 2]) / 3);
    } else {
      sum += 255 - data[i + component];
    }
  }
  const value = Math.max(0, sum / pixels);
  cache.set(key, value);
  return value;
}

async function proportions(machine, task) {
  const files = await atInkChannelFiles(machine, task);
  if (!files) return null;
  const weighted = [];
  for (const channel of CHANNELS) {
    weighted.push({
      ...channel,
      weight: await maskWeight(files[channel.preview], channel.component)
    });
  }
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!(totalWeight > 0)) return null;
  return weighted.map(({ code, color, weight }) => ({ code, color, ratio: weight / totalWeight }));
}

async function enrichAtInkChannels(machine, records) {
  const byTask = new Map();
  for (const record of records) {
    if (Number(record.inkMl) > 0 && record.task && !byTask.has(record.task)) {
      byTask.set(record.task, null);
    }
  }

  for (const task of byTask.keys()) {
    try {
      byTask.set(task, await proportions(machine, task));
    } catch {
      byTask.set(task, null);
    }
  }

  for (const record of records) {
    const split = byTask.get(record.task);
    if (!split) continue;
    record.inkChannels = split.map(item => ({
      code: item.code,
      color: item.color,
      ml: Number((record.inkMl * item.ratio).toFixed(4)),
      estimated: true
    }));
    record.inkExperimental = true;
  }
  return records;
}

module.exports = { enrichAtInkChannels };
