const { readPreview } = require("./preview");

const cache = new Map();

function bmp24Rgb(buffer) {
  if (buffer.length < 54 || buffer.toString("ascii", 0, 2) !== "BM") return null;
  const offset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const signedHeight = buffer.readInt32LE(22);
  const bits = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  if (!(width > 0) || !signedHeight || bits !== 24 || compression !== 0) return null;
  const height = Math.abs(signedHeight);
  const stride = Math.ceil((width * 3) / 4) * 4;
  if (offset + stride * height > buffer.length) return null;
  return { offset, width, height, stride };
}

async function colorRatios(machine, task, previewRef) {
  const key = `${machine.id}|${task}|${previewRef || ""}`;
  if (cache.has(key)) return cache.get(key);

  const preview = await readPreview(machine, task, 0, previewRef);
  if (!preview) {
    cache.set(key, null);
    return null;
  }

  const bmp = bmp24Rgb(preview.data);
  if (!bmp) {
    cache.set(key, null);
    return null;
  }

  let k = 0, c = 0, m = 0, y = 0;
  // Amostragem uniforme: suficiente para a proporcao e leve mesmo em BMPs grandes.
  const step = Math.max(1, Math.floor(Math.sqrt((bmp.width * bmp.height) / 400000)));
  for (let row = 0; row < bmp.height; row += step) {
    const rowStart = bmp.offset + row * bmp.stride;
    for (let col = 0; col < bmp.width; col += step) {
      const i = rowStart + col * 3;
      const b = preview.data[i] / 255;
      const g = preview.data[i + 1] / 255;
      const r = preview.data[i + 2] / 255;
      const black = 1 - Math.max(r, g, b);
      k += black;
      c += Math.max(0, 1 - r - black);
      m += Math.max(0, 1 - g - black);
      y += Math.max(0, 1 - b - black);
    }
  }

  const total = k + c + m + y;
  const result = total > 0 ? [
    { code: "K", color: "Preto", ratio: k / total },
    { code: "C", color: "Ciano", ratio: c / total },
    { code: "M", color: "Magenta", ratio: m / total },
    { code: "Y", color: "Amarelo", ratio: y / total }
  ] : null;
  cache.set(key, result);
  return result;
}

async function enrichXmlInkChannels(machine, records) {
  const ratiosByJob = new Map();
  for (const record of records) {
    if (!(Number(record.inkMl) > 0) || !record.task) continue;
    const key = `${record.task}|${record.previewRef || ""}`;
    if (ratiosByJob.has(key)) continue;
    try {
      ratiosByJob.set(key, await colorRatios(machine, record.task, record.previewRef));
    } catch {
      ratiosByJob.set(key, null);
    }
  }

  for (const record of records) {
    const split = ratiosByJob.get(`${record.task}|${record.previewRef || ""}`);
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

module.exports = { enrichXmlInkChannels };
