const fs = require("fs/promises");
const path = require("path");

function safeName(value) {
  const s = String(value || "").trim();
  const base = path.basename(s);
  if (!base || base.includes("..")) throw new Error("Nome inválido");
  return base;
}

function imageType(buffer, file) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return "image/bmp";

  const ext = path.extname(file).toLowerCase();
  return ({
    ".jpg":"image/jpeg",
    ".jpeg":"image/jpeg",
    ".png":"image/png",
    ".bmp":"image/bmp",
    ".webp":"image/webp"
  })[ext] || "application/octet-stream";
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.(jpg|jpeg|png|bmp|webp)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactName(value) {
  return normalizeName(value)
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

async function entries(dir) {
  const names = await fs.readdir(dir);

  return names.map(name => ({
    name,
    lower: name.toLowerCase(),
    normalized: normalizeName(name),
    compact: compactName(name)
  }));
}

function findByCandidates(items, candidates) {
  const lows = candidates.map(x => x.toLowerCase());

  for (const candidate of lows) {
    const hit = items.find(item => item.lower === candidate);
    if (hit) return hit.name;
  }

  return null;
}

function atChannelCandidates(task, channel) {
  const clean = safeName(task);
  const noPrt = clean.replace(/\.prt$/i, "");

  return [
    `${clean}${channel}`,
    `${clean}${channel}.jpg`,
    `${clean}${channel}.jpeg`,
    `${clean}${channel}.png`,
    `${clean}${channel}.webp`,

    `${noPrt}.prt${channel}`,
    `${noPrt}.prt${channel}.jpg`,
    `${noPrt}.prt${channel}.jpeg`,
    `${noPrt}.prt${channel}.png`,
    `${noPrt}.prt${channel}.webp`,

    `${noPrt}${channel}`,
    `${noPrt}${channel}.jpg`,
    `${noPrt}${channel}.jpeg`,
    `${noPrt}${channel}.png`,
    `${noPrt}${channel}.webp`
  ];
}

function findAtPreview(items, task, channel) {
  // 1) correspondência exata
  const exact = findByCandidates(items, atChannelCandidates(task, channel));
  if (exact) return exact;

  const clean = safeName(task);
  const noPrt = clean.replace(/\.prt$/i, "");

  // 2) correspondência normalizada (acentos, espaços e pontuação)
  const wanted = [
    `${clean}${channel}`,
    `${noPrt}.prt${channel}`,
    `${noPrt}${channel}`
  ].map(normalizeName);

  for (const candidate of wanted) {
    const hit = items.find(item => item.normalized === candidate);
    if (hit) return hit.name;
  }

  // 3) correspondência compacta, útil quando o programa troca
  // hífen, underline, vários espaços ou acentos no nome do preview.
  const compactWanted = [
    `${clean}${channel}`,
    `${noPrt}.prt${channel}`,
    `${noPrt}${channel}`
  ].map(compactName);

  for (const candidate of compactWanted) {
    const hit = items.find(item => item.compact === candidate);
    if (hit) return hit.name;
  }

  // 4) fallback: procura um arquivo de canal cujo nome-base contenha
  // praticamente o mesmo nome do trabalho.
  const baseCompact = compactName(noPrt);

  const channelRegex = new RegExp(`(?:prt)?${channel}$`, "i");

  const possible = items.filter(item => {
    const noImgExt = item.name.replace(/\.(jpg|jpeg|png|bmp|webp)$/i, "");
    const compact = compactName(noImgExt);
    return (
      compact.includes(baseCompact) &&
      channelRegex.test(noImgExt.replace(/[^\w]+/g, ""))
    );
  });

  if (possible.length) {
    // Preferimos o nome mais próximo em tamanho ao nome procurado.
    possible.sort((a, b) =>
      Math.abs(a.compact.length - baseCompact.length) -
      Math.abs(b.compact.length - baseCompact.length)
    );
    return possible[0].name;
  }

  return null;
}

async function findPreview(machine, task, channel = 0, previewRef = "") {
  if (!machine.previewDir) return null;

  const items = await entries(machine.previewDir);
  const safeTask = safeName(task);
  const safeRef = previewRef ? safeName(previewRef) : "";

  if (machine.type === "at-binary") {
    return findAtPreview(items, safeTask, channel);
  }

  if (machine.type === "csv") {
    const noExt = safeTask.replace(/\.[^.]+$/, "");

    const exact = findByCandidates(items, [
      `${noExt}_000.bmp`,
      `${noExt}_000.jpg`,
      `${noExt}_000.png`,
      `${noExt}.bmp`,
      `${noExt}.jpg`,
      `${noExt}.png`
    ]);

    if (exact) return exact;

    const wanted = compactName(noExt);
    return items.find(item =>
      item.compact.includes(wanted) &&
      /\.(bmp|jpg|jpeg|png|webp)$/i.test(item.name)
    )?.name || null;
  }

  // XML: primeiro usa a referência que veio do próprio XML.
  if (safeRef) {
    const hit = findByCandidates(items, [safeRef]);
    if (hit) return hit;

    const normalizedRef = normalizeName(safeRef);
    const normalizedHit = items.find(item => item.normalized === normalizedRef);
    if (normalizedHit) return normalizedHit.name;

    const compactRef = compactName(safeRef);
    const compactHit = items.find(item => item.compact === compactRef);
    if (compactHit) return compactHit.name;
  }

  const noExt = safeTask.replace(/\.[^.]+$/, "");
  const wanted = compactName(noExt);

  return items.find(item =>
    item.compact.includes(wanted) &&
    /\.(bmp|jpg|jpeg|png|webp)$/i.test(item.name)
  )?.name || null;
}

async function previewInfo(machine, task, previewRef = "") {
  if (!machine.previewDir) {
    return {
      available:false,
      channels:[],
      reason:"previewDir não configurado"
    };
  }

  if (machine.type === "at-binary") {
    const channels = [];
    const files = {};

    for (let c = 0; c <= 8; c++) {
      const file = await findPreview(machine, task, c, previewRef);
      if (file) {
        channels.push(c);
        files[c] = file;
      }
    }

    return {
      available: channels.length > 0,
      channels,
      files,
      mainChannel: channels.includes(0) ? 0 : (channels[0] ?? null)
    };
  }

  const file = await findPreview(machine, task, 0, previewRef);

  return {
    available:Boolean(file),
    channels:file ? [0] : [],
    files:file ? {0:file} : {},
    mainChannel:file ? 0 : null
  };
}

async function atInkChannelFiles(machine, task) {
  if (!machine.previewDir || machine.type !== "at-binary") return null;
  const items = await entries(machine.previewDir);
  const files = {};
  for (let channel = 1; channel <= 4; channel++) {
    const file = findAtPreview(items, task, channel);
    if (!file) return null;
    files[channel] = path.join(machine.previewDir, file);
  }
  return files;
}

async function readPreview(machine, task, channel = 0, previewRef = "") {
  let file = await findPreview(machine, task, channel, previewRef);

  // Para os cards de produção: se o canal 0 não existir, tenta o primeiro
  // canal disponível em vez de mostrar "Sem preview".
  if (!file && machine.type === "at-binary" && Number(channel) === 0) {
    for (let c = 1; c <= 8; c++) {
      file = await findPreview(machine, task, c, previewRef);
      if (file) break;
    }
  }

  if (!file) return null;

  const data = await fs.readFile(path.join(machine.previewDir, file));

  return {
    data,
    contentType:imageType(data, file),
    file
  };
}

module.exports = { previewInfo, readPreview, atInkChannelFiles };
