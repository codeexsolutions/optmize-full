const os = require("os");
const net = require("net");
const dnsPromises = require("dns").promises;
const fs = require("fs/promises");
const { execFile } = require("child_process");
const iconv = require("iconv-lite");

const SMB_PORT = 445;
const PORT_TIMEOUT_MS = Number(process.env.SCAN_PORT_TIMEOUT_MS || 600);
const PORT_CONCURRENCY = Number(process.env.SCAN_CONCURRENCY || 64);
const FS_TIMEOUT_MS = Number(process.env.SCAN_FS_TIMEOUT_MS || 4000);
const HOST_CONCURRENCY = 6;

// Compartilhamentos tentados quando o "net view" não responde (host bloqueia
// enumeração, mas continua servindo os caminhos conhecidos).
const FALLBACK_SHARES = ["PrinterManager", "temp", "Users", "AT.printer_1.3", "AT.printer", "printer"];

// ---------------------------------------------------------------- utilidades

function withTimeout(promise, ms, fallback) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
    promise.then(
      value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } },
      () => { if (!done) { done = true; clearTimeout(timer); resolve(fallback); } }
    );
  });
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return out;
}

function run(command, args, timeout = 6000) {
  return new Promise(resolve => {
    execFile(command, args, { timeout, windowsHide: true, encoding: "buffer", maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (!stdout || !stdout.length) return resolve("");
        // Console do Windows responde em OEM (cp850 no pt-BR), não em UTF-8.
        resolve(iconv.decode(stdout, "cp850"));
      });
  });
}

const unc = (...parts) => "\\\\" + parts.filter(Boolean).join("\\");

async function statPath(target) {
  return withTimeout(fs.stat(target).then(s => ({ isFile: s.isFile(), isDir: s.isDirectory() })), FS_TIMEOUT_MS, null);
}

async function isFile(target) { const s = await statPath(target); return !!(s && s.isFile); }
async function isDir(target) { const s = await statPath(target); return !!(s && s.isDir); }

async function readDir(target) {
  return withTimeout(fs.readdir(target, { withFileTypes: true }), FS_TIMEOUT_MS, []);
}

// -------------------------------------------------------------- alvos da rede

// Subredes IPv4 locais, limitadas a /24 para a varredura não explodir em redes
// grandes (uma /16 daria 65 mil endereços).
function localTargets() {
  const targets = [];
  const seen = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      const parts = iface.address.split(".");
      const base = parts.slice(0, 3).join(".");
      if (seen.has(base)) continue;
      seen.add(base);
      for (let host = 1; host <= 254; host++) {
        const ip = `${base}.${host}`;
        if (ip !== iface.address) targets.push(ip);
      }
    }
  }
  return targets;
}

function probePort(ip, port = SMB_PORT, timeout = PORT_TIMEOUT_MS) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, ip);
  });
}

// Nome NetBIOS é o que aparece nos caminhos UNC atuais e sobrevive a troca de
// IP pelo DHCP, então ele tem prioridade sobre o IP e sobre o DNS reverso.
async function resolveHostName(ip) {
  // O nbtstat lista o nome com o sufixo <20> (serviço de arquivos) ou <00>.
  // A coluna de status muda de idioma ("UNIQUE" / "EXCLUSIVO"), então só o
  // sufixo é testado — o que descarta grupos é o texto GROUP/GRUPO.
  const nbt = await run("nbtstat", ["-A", ip], 5000);
  let unique = null;
  for (const line of nbt.split(/\r?\n/)) {
    const match = /^\s*(\S+)\s*<(00|20)>\s+(\S+)/.exec(line);
    if (!match || /^(GROUP|GRUPO)/i.test(match[3])) continue;
    if (match[2] === "20") return match[1].trim();
    if (!unique) unique = match[1].trim();
  }
  if (unique) return unique;

  // Fallback: o ping -a resolve pelo cache NetBIOS/DNS e imprime "nome [ip]".
  const pinged = await run("ping", ["-a", "-n", "1", "-w", "800", ip], 4000);
  const named = new RegExp(`(\\S+)\\s*\\[${ip.replace(/\./g, "\\.")}\\]`).exec(pinged);
  if (named && !net.isIP(named[1])) return named[1].split(".")[0];

  const reverse = await withTimeout(dnsPromises.reverse(ip), 2000, []);
  if (reverse && reverse.length) return reverse[0].split(".")[0];
  return null;
}

async function listShares(host) {
  const output = await run("net", ["view", `\\\\${host}`, "/all"], 8000);
  const shares = [];
  let started = false;
  for (const line of output.split(/\r?\n/)) {
    if (/^-{5,}/.test(line)) { started = true; continue; }
    if (!started) continue;
    if (!line.trim()) break;
    // A coluna de tipo é obrigatória: sem ela a linha é rodapé ("Comando
    // concluído com êxito.") ou impressora compartilhada, não pasta.
    const [name, kind = ""] = line.split(/\s{2,}/).map(part => part.trim());
    if (!name || name.endsWith("$")) continue;
    if (!/^(Disk|Disco)/i.test(kind)) continue;
    shares.push(name);
  }
  if (shares.length) return shares;

  // Sem enumeração: testa a lista conhecida direto.
  const probed = await mapLimit(FALLBACK_SHARES, 6, async share =>
    (await isDir(unc(host, share))) ? share : null);
  return probed.filter(Boolean);
}

// --------------------------------------------------------------- impressões digitais

// Impressora 02: PrinterManager com History.csv na raiz do compartilhamento.
async function detectCsv(host, share, root) {
  if (!(await isFile(`${root}\\History.csv`))) return null;
  const entries = await readDir(root);
  const names = entries.map(entry => entry.name);
  const inkDll = names.find(name => /^ink.*\.dll$/i.test(name));
  const pick = async (candidate, checker) => (await checker(`${root}\\${candidate}`)) ? `${root}\\${candidate}` : undefined;

  return {
    type: "csv",
    historyPath: `${root}\\History.csv`,
    previewDir: await pick("Preview", isDir),
    jobListPath: await pick("Joblist.xml", isFile),
    inkStatsPath: inkDll ? `${root}\\${inkDll}` : undefined,
    liveLogFile: await pick("log.txt", isFile),
    statusLogDir: await pick("Log", isDir),
    share
  };
}

// Impressora 04: PrinterManager com a pasta de histórico em XML por dia.
// "PrintHistroy" (com o erro de digitação do software) só existe nessa versão.
// "PrintHistory" também é o nome da pasta do histórico binário AT, então esse
// só vale como XML se tiver as subpastas por ano (2025\202508\20250831).
async function xmlHistoryFolder(root) {
  if (await isDir(`${root}\\PrintHistroy`)) return `${root}\\PrintHistroy`;
  const alt = `${root}\\PrintHistory`;
  if (!(await isDir(alt))) return null;
  const entries = await readDir(alt);
  return entries.some(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name)) ? alt : null;
}

async function detectXml(host, share, root) {
  const historyPath = await xmlHistoryFolder(root);
  if (!historyPath) return null;
  const pick = async (candidate) => (await isDir(`${root}\\${candidate}`)) ? `${root}\\${candidate}` : undefined;

  return {
    type: "xml",
    historyPath,
    previewDir: await pick("Preview"),
    liveLogDir: await pick("Log"),
    share
  };
}

// Impressoras 06/07: histórico binário AT em temp\PrintHistory\PrintHistory.
async function detectAtBinary(host, share, root, shares) {
  const historyPath = `${root}\\PrintHistory\\PrintHistory`;
  if (!(await isFile(historyPath))) return null;

  let previewDir;
  const atShare = shares.find(name => /^at[._ ]?printer/i.test(name));
  for (const candidate of [atShare && unc(host, atShare, "preview"), `${root}\\preview`]) {
    if (candidate && await isDir(candidate)) { previewDir = candidate; break; }
  }
  return { type: "at-binary", historyPath, previewDir, share };
}

// Raízes onde o PrinterManager costuma ficar: na raiz do compartilhamento,
// uma pasta abaixo, ou no Desktop de um usuário (caso do compartilhamento Users).
async function candidateRoots(host, share) {
  const shareRoot = unc(host, share);
  const roots = [shareRoot];
  if (await isDir(`${shareRoot}\\PrinterManager`)) roots.push(`${shareRoot}\\PrinterManager`);

  const entries = await readDir(shareRoot);
  const userDirs = entries.filter(entry => entry.isDirectory()).slice(0, 40);
  for (const dir of userDirs) {
    const desktop = `${shareRoot}\\${dir.name}\\Desktop\\PrinterManager`;
    if (await isDir(desktop)) roots.push(desktop);
  }
  return roots;
}

// Compartilhamentos com nome conhecido primeiro: evita varrer "Users" inteiro
// (e o Desktop de cada conta) quando o PrinterManager está logo na raiz.
const SHARE_PRIORITY = [/^printermanager/i, /^temp$/i, /^at[._ ]?printer/i, /^users$/i];

function orderShares(shares) {
  const rank = share => {
    const index = SHARE_PRIORITY.findIndex(pattern => pattern.test(share));
    return index === -1 ? SHARE_PRIORITY.length : index;
  };
  return [...shares].sort((a, b) => rank(a) - rank(b));
}

async function fingerprintHost(host, shares) {
  for (const share of orderShares(shares)) {
    const roots = await candidateRoots(host, share);
    for (const root of roots) {
      // Ordem importa: o AT usa a pasta "PrintHistory", que o detector XML
      // também aceita. O binário é o teste mais específico, então vem antes.
      const found = await detectCsv(host, share, root)
        || await detectAtBinary(host, share, root, shares)
        || await detectXml(host, share, root);
      if (found) return { ...found, root };
    }
  }
  return null;
}

// ------------------------------------------------------------------ identidade

const TYPE_LABEL = { csv: "PrinterManager (CSV)", xml: "PrinterManager (XML)", "at-binary": "AT Printer (binário)" };

function suggestIdentity(host, takenIds) {
  const numbered = /impressora[^0-9]*(\d{1,2})/i.exec(host);
  let id, name;
  if (numbered) {
    const digits = String(numbered[1]).padStart(2, "0");
    id = `imp${digits}`;
    name = `Impressora ${digits}`;
  } else {
    id = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "maquina";
    name = host;
  }
  let unique = id, suffix = 2;
  while (takenIds.has(unique)) unique = `${id}-${suffix++}`;
  return { id: unique, name };
}

// ---------------------------------------------------------------- varredura

async function scanNetwork({ hosts = [], onProgress = () => {}, signal } = {}) {
  const aborted = () => signal && signal.aborted;
  let reachable;

  if (hosts.length) {
    onProgress({ phase: "hosts", message: `Testando ${hosts.length} host(s) informado(s)...`, scanned: 0, total: hosts.length });
    const checked = await mapLimit(hosts, PORT_CONCURRENCY, async target => {
      if (!(await probePort(target))) return null;
      // IP digitado vira apenas o IP: o nome do computador é resolvido depois,
      // porque é ele que entra nas rotas UNC e sobrevive a troca de IP.
      if (net.isIP(target)) return { ip: target };
      const lookup = await withTimeout(dnsPromises.lookup(target, { family: 4 }), 2000, null);
      return { host: target, ip: lookup ? lookup.address : null };
    });
    reachable = checked.filter(Boolean);
  } else {
    const targets = localTargets();
    onProgress({ phase: "sweep", message: `Varrendo ${targets.length} endereços na rede local...`, scanned: 0, total: targets.length });
    let scanned = 0;
    const checked = await mapLimit(targets, PORT_CONCURRENCY, async ip => {
      if (aborted()) return null;
      const ok = await probePort(ip);
      scanned++;
      if (scanned % 25 === 0) onProgress({ phase: "sweep", scanned, total: targets.length });
      return ok ? { ip } : null;
    });
    onProgress({ phase: "sweep", scanned: targets.length, total: targets.length });
    reachable = checked.filter(Boolean);
  }

  onProgress({
    phase: "identify",
    message: `${reachable.length} computador(es) com compartilhamento respondendo. Identificando...`,
    scanned: 0,
    total: reachable.length
  });

  let identified = 0;
  const results = await mapLimit(reachable, HOST_CONCURRENCY, async entry => {
    if (aborted()) return null;
    const host = entry.host || (await resolveHostName(entry.ip)) || entry.ip;
    const ip = entry.ip || null;
    let candidate = null;
    try {
      const shares = await listShares(host);
      if (shares.length) {
        const print = await fingerprintHost(host, shares);
        if (print) {
          candidate = {
            host,
            ip,
            shares,
            typeLabel: TYPE_LABEL[print.type] || print.type,
            ...print
          };
        }
      }
    } catch (error) {
      candidate = null;
      onProgress({ phase: "identify", message: `Falha ao ler ${host}: ${error.message}` });
    }
    identified++;
    onProgress({
      phase: "identify",
      scanned: identified,
      total: reachable.length,
      message: candidate ? `${host}: ${candidate.typeLabel}` : undefined
    });
    return candidate;
  });

  return { reachable: reachable.length, found: results.filter(Boolean) };
}

module.exports = { scanNetwork, suggestIdentity, resolveHostName, listShares, fingerprintHost, TYPE_LABEL };
