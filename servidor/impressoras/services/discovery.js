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

// Desce um nível a partir de uma base. A barra do fim é aparada porque a raiz
// de um disco vem como "C:\" e "C:\" + "\Users" daria "C:\\Users".
const sub = (base, ...parts) => String(base).replace(/\\+$/, "") + "\\" + parts.join("\\");

async function statPath(target) {
  return withTimeout(fs.stat(target).then(s => ({ isFile: s.isFile(), isDir: s.isDirectory() })), FS_TIMEOUT_MS, null);
}

async function isFile(target) { const s = await statPath(target); return !!(s && s.isFile); }
async function isDir(target) { const s = await statPath(target); return !!(s && s.isDir); }

async function readDir(target) {
  return withTimeout(fs.readdir(target, { withFileTypes: true }), FS_TIMEOUT_MS, []);
}

// -------------------------------------------------------------- alvos da rede

// Quantos bits a máscara tem de 1 à esquerda: 255.255.255.0 -> 24.
function bitsDaMascara(netmask) {
  const bits = String(netmask || "").split(".").map(Number)
    .map(octeto => (Number.isFinite(octeto) ? octeto : 0).toString(2).padStart(8, "0"))
    .join("");
  const primeiroZero = bits.indexOf("0");
  return primeiroZero === -1 ? bits.length : primeiroZero;
}

// Subredes IPv4 locais, limitadas a /24 para a varredura não explodir em redes
// grandes (uma /16 daria 65 mil endereços).
//
// ---------------------------------------------------------------------------
// O QUE ESSE LIMITE DEIXA DE FORA, E POR QUE ELE PRECISA DIZER ISSO
// ---------------------------------------------------------------------------
//
// Em rede de cabo o limite não custa nada: a LAN da loja é /24, e os 254
// endereços varridos SÃO a rede inteira.
//
// Em VPN não. O Radmin VPN entrega máscara 255.0.0.0 — um /8, 16 milhões de
// endereços —, e cada par cai num terceiro octeto diferente. Esta máquina está
// em 26.220.102.241 e a impressora nova em 26.227.240.190: o mesmo /8, outro
// /24. Ou seja, **nenhum par de Radmin é alcançável pela varredura
// automática**, nunca, e não é uma máquina que é especial.
//
// Isso não tem conserto por varredura — 16 milhões de sondas de porta não é
// uma opção, e por isso o limite fica. O que não pode ficar é a varredura
// terminando com "nada encontrado" e a pessoa concluindo que a impressora não
// está na rede, quando a verdade é que ninguém olhou. Máquina de VPN entra pelo
// nome (`scanNetwork({ hosts: ["..."] })`, que é o campo "informar host" da
// tela), e é isso que o aviso manda fazer.
function faixasLocais() {
  const faixas = [];
  const seen = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      const base = iface.address.split(".").slice(0, 3).join(".");
      if (seen.has(base)) continue;
      seen.add(base);
      faixas.push({ base, endereco: iface.address, bits: bitsDaMascara(iface.netmask) });
    }
  }
  return faixas;
}

function localTargets() {
  const targets = [];
  for (const faixa of faixasLocais()) {
    for (let host = 1; host <= 254; host++) {
      const ip = `${faixa.base}.${host}`;
      if (ip !== faixa.endereco) targets.push(ip);
    }
  }
  return targets;
}

/**
 * As faixas em que a varredura vê só um pedaço — as mais largas que /24.
 *
 * Devolve o recado pronto para a tela, porque quem chama é o `scanNetwork` e
 * ele não tem por que saber fazer conta de máscara.
 */
function faixasIncompletas() {
  return faixasLocais()
    .filter(faixa => faixa.bits > 0 && faixa.bits < 24)
    .map(faixa => ({
      ...faixa,
      recado: `A rede ${faixa.endereco}/${faixa.bits} é maior que o que dá para varrer:`
        + ` só os 254 endereços de ${faixa.base}.* foram testados.`
        + " Máquina fora dessa faixa (o caso do Radmin VPN) precisa do nome informado.",
    }));
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

// PrintExp (Hosonsoft): o histórico fica em Usage\<serial da placa>\PrintData.xml
// e o binário com os previews em Data\HistoryTask.tf. O `historyPath` aponta
// para a pasta Usage inteira, porque o serial muda quando trocam a placa.
async function detectPrintExp(host, share, root) {
  if (!(await isFile(`${root}\\Data\\HistoryTask.tf`))) return null;

  const usage = `${root}\\Usage`;
  if (!(await isDir(usage))) return null;

  // Uma pasta de serial sem XML é placa que nunca imprimiu; sem nenhum XML,
  // isto é uma cópia parada do programa e não uma impressora.
  const seriais = await readDir(usage);
  let temHistorico = false;
  for (const entry of seriais) {
    if (!entry.isDirectory()) continue;
    if (await isFile(`${usage}\\${entry.name}\\PrintData.xml`)) { temHistorico = true; break; }
  }
  if (!temHistorico) return null;

  const pick = async (candidate, checker) => (await checker(`${root}\\${candidate}`)) ? `${root}\\${candidate}` : undefined;

  return {
    type: "printexp",
    historyPath: usage,
    // O preview do PrintExp não tem pasta própria: cada .bmp nasce ao lado do
    // .prt, na pasta do RIP do dia, e só o Data\HistoryTask.tf sabe onde.
    previewDir: undefined,
    liveLogDir: await pick("Log\\main", isDir),
    // O progresso do trabalho em andamento, em 89 bytes. É o "arquivo do vivo"
    // desta máquina, e o services/printExpLive.js o lê a cada tick.
    liveLogFile: await pick("Data\\PrintInfo.ini", isFile),
    statusLogDir: await pick("Log", isDir),
    inkStatsPath: await pick("Data\\HistoryTask.tf", isFile),
    share
  };
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

// O PrintExp não fica num lugar previsível: ele roda da pasta onde foi
// descompactado, em geral no Desktop ou no Downloads de alguém, e o zip traz a
// pasta repetida dentro dela mesma (PrintExp_X64_5.8...\PrintExp_X64_5.8...).
// Procurar por nome em poucos lugares certos sai mais barato que varrer.
const PRINTEXP_DIR = /printexp/i;

async function printExpRoots(baseRoot) {
  const parents = [baseRoot];
  const pastasDeUsuario = async base => {
    for (const entry of await readDir(base)) {
      if (entry.isDirectory()) parents.push(sub(base, entry.name, "Desktop"), sub(base, entry.name, "Downloads"));
    }
  };

  // Serve para o compartilhamento "Users", para um "C" que expõe o disco
  // inteiro e para a raiz de um disco local — nos três, as contas ficam uma
  // pasta mais fundo.
  await pastasDeUsuario(baseRoot);
  if (await isDir(sub(baseRoot, "Users"))) await pastasDeUsuario(sub(baseRoot, "Users"));

  const roots = [];
  for (const parent of parents.slice(0, 60)) {
    for (const entry of await readDir(parent)) {
      if (!entry.isDirectory() || !PRINTEXP_DIR.test(entry.name)) continue;
      const dir = sub(parent, entry.name);
      roots.push(dir);
      for (const inner of await readDir(dir)) {
        if (inner.isDirectory() && PRINTEXP_DIR.test(inner.name)) roots.push(sub(dir, inner.name));
      }
    }
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

// Ordem importa: o AT usa a pasta "PrintHistory", que o detector XML também
// aceita. O binário é o teste mais específico, então vem antes.
async function detectAtRoot(host, share, root, shares) {
  return await detectCsv(host, share, root)
    || await detectAtBinary(host, share, root, shares)
    || await detectXml(host, share, root);
}

async function fingerprintHost(host, shares) {
  for (const share of orderShares(shares)) {
    for (const root of await candidateRoots(host, share)) {
      const found = await detectAtRoot(host, share, root, shares);
      if (found) return { ...found, root };
    }
  }

  // Segunda passada, só se nada apareceu: o PrintExp mora fundo e achá-lo
  // custa vários readdir pela rede. Quem já é PrinterManager ou AT não paga.
  for (const share of orderShares(shares)) {
    for (const root of await printExpRoots(unc(host, share))) {
      const found = await detectPrintExp(host, share, root);
      if (found) return { ...found, root };
    }
  }
  return null;
}

// ------------------------------------------------------- a própria máquina

/**
 * O mesmo reconhecimento, mas no disco desta máquina.
 *
 * A varredura da rede pula o próprio endereço de propósito, e faz sentido: ela
 * fala SMB, e uma máquina não se enxerga pelos próprios compartilhamentos.
 * Só que o lugar mais provável para instalarem o Optmize é justamente o PC que
 * já roda o software da impressora — e ali a impressora ficaria invisível,
 * calada, como se não existisse na rede.
 *
 * Aqui não há compartilhamento nem UNC: os caminhos saem como "C:\...", que o
 * `fs` lê igual. Por isso o `share` vem nulo.
 */
async function localDrives() {
  const drives = [];
  // Letras prováveis de disco fixo. Testar de A a Z acordaria leitor de
  // disquete e unidade de rede desconectada, cada uma com sua espera.
  for (const letter of "CDEFGH") {
    const drive = `${letter}:\\`;
    if (await isDir(drive)) drives.push(drive);
  }
  return drives;
}

// Onde software de impressora aparece quando não está no Desktop de alguém.
// `Program Files` e `ProgramData` são o destino de instalador de verdade; a
// pasta de trabalho do PrintExp costuma ser Desktop ou Downloads porque ele não
// tem instalador, mas nada impede que alguém o mova para cá.
const PASTAS_DE_PROGRAMA = ["Program Files", "Program Files (x86)", "ProgramData"];
// Dentro da conta de cada pessoa. `Documents` entrou junto de Desktop e
// Downloads: é o terceiro lugar onde um zip acaba descompactado.
const PASTAS_DA_CONTA = [["Desktop", "PrinterManager"], ["Desktop"], ["Downloads"], ["Documents"]];

async function localCandidateRoots(drive) {
  const roots = [drive];
  for (const candidate of ["PrinterManager", "temp", ...PASTAS_DE_PROGRAMA]) {
    if (await isDir(sub(drive, candidate))) roots.push(sub(drive, candidate));
  }

  // Uma pasta abaixo das de programa: o instalador cria `<Program Files>\<nome
  // do fabricante>\...`, e o detector precisa da pasta do programa, não da do
  // fabricante.
  for (const programas of PASTAS_DE_PROGRAMA) {
    const base = sub(drive, programas);
    if (!(await isDir(base))) continue;
    for (const entry of (await readDir(base)).filter(item => item.isDirectory()).slice(0, 60)) {
      roots.push(sub(base, entry.name));
    }
  }

  const users = await readDir(sub(drive, "Users"));
  for (const entry of users.filter(item => item.isDirectory()).slice(0, 40)) {
    for (const candidate of PASTAS_DA_CONTA) {
      const dir = sub(drive, "Users", entry.name, ...candidate);
      if (await isDir(dir)) roots.push(dir);
    }
  }
  return roots;
}

/*
 * ===========================================================================
 * A BUSCA FUNDA — quando a lista de lugares prováveis não dá conta
 * ===========================================================================
 *
 * Tudo acima é lista: lugares onde software de impressora COSTUMA ficar. Ela
 * acha em milissegundos e é o que roda em toda varredura.
 *
 * Só que "costuma" não é "sempre". O PrintExp não tem instalador — ele roda da
 * pasta onde foi descompactado —, e a pasta onde alguém descompacta um zip não
 * tem regra: `D:\coisas\teste2\`, `C:\Users\PC\Downloads\novo\PrintExp...`. Com
 * o sistema rodando em outra loja, noutro computador, a chance de a lista errar
 * é maior ainda, porque a lista foi escrita olhando as máquinas de UMA
 * instalação — o mesmo defeito que o `config.js` descreve sobre caminho escrito
 * à mão.
 *
 * Então existe a busca funda: desce os discos de verdade. Ela NÃO roda no
 * automático, porque percorrer um disco custa segundos a minutos e a varredura
 * é uma ação que a pessoa espera olhando; ela é o "procurar fundo" de quando o
 * rápido não achou.
 *
 * O que a mantém honesta são três limites:
 *
 *   PROFUNDIDADE  software de impressora não mora a dez níveis do disco. Seis
 *                 cobre `C:\Users\PC\Downloads\zip\PrintExp\PrintExp` com
 *                 folga, e corta a árvore antes de ela explodir.
 *   TEMPO         um orçamento, conferido a cada pasta. Disco cheio ou de rede
 *                 lenta para no prazo em vez de pendurar a tela.
 *   PULAR         Windows, node_modules, lixeira e afins. São dezenas de
 *                 milhares de pastas onde nunca houve impressora, e pular isso
 *                 é o que faz a busca caber no orçamento.
 */
const FUNDA_PROFUNDIDADE = 6;
const FUNDA_TEMPO_MS = Number(process.env.SCAN_DEEP_TIMEOUT_MS || 45000);
const FUNDA_MAX_PASTAS = Number(process.env.SCAN_DEEP_MAX_DIRS || 20000);

// Pastas que nunca contêm software de impressora e custam caro para percorrer.
const FUNDA_PULAR = [
  /^windows$/i, /^\$recycle\.bin$/i, /^system volume information$/i,
  /^node_modules$/i, /^\.git$/i, /^appdata$/i, /^winsxs$/i,
  /^perflogs$/i, /^recovery$/i, /^msocache$/i, /^config\.msi$/i,
];

/**
 * Desce um disco procurando pasta de impressora, em largura.
 *
 * Largura e não profundidade de propósito: o que está perto da raiz aparece
 * primeiro, e é onde a chance é maior. Se o orçamento acabar no meio, o que
 * já saiu é o mais provável, em vez de um galho fundo qualquer.
 */
async function buscaFunda(raiz, { onProgress = () => {}, aborted = () => false } = {}) {
  const prazo = Date.now() + FUNDA_TEMPO_MS;
  const achados = [];
  let fila = [{ dir: raiz, nivel: 0 }];
  let visitadas = 0;

  while (fila.length > 0) {
    const proxima = [];
    for (const { dir, nivel } of fila) {
      if (aborted() || Date.now() > prazo || visitadas >= FUNDA_MAX_PASTAS) return achados;
      visitadas++;
      if (visitadas % 200 === 0) {
        onProgress({ visitadas, dir });
      }

      // Os dois detectores em cada pasta: a funda não sabe o que procura, e
      // rodar só um deixaria metade das impressoras invisível justamente na
      // busca que existe para achar o que a lista não achou.
      const found = await detectAtRoot(null, null, dir, [])
        || await detectPrintExp(null, null, dir);
      if (found) {
        achados.push({ ...found, root: dir });
        // Não desce mais nesta: o que está dentro de uma pasta de programa são
        // as pastas DELE (Data, Usage, Log), e nenhuma é outra impressora.
        continue;
      }

      if (nivel >= FUNDA_PROFUNDIDADE) continue;
      for (const entry of await readDir(dir)) {
        if (!entry.isDirectory()) continue;
        if (FUNDA_PULAR.some(padrao => padrao.test(entry.name))) continue;
        proxima.push({ dir: sub(dir, entry.name), nivel: nivel + 1 });
      }
    }
    fila = proxima;
  }
  return achados;
}

async function fingerprintLocal({ funda = false, onProgress = () => {}, aborted = () => false } = {}) {
  const drives = await localDrives();

  for (const drive of drives) {
    for (const root of await localCandidateRoots(drive)) {
      const found = await detectAtRoot(null, null, root, []);
      if (found) return { ...found, root };
    }
  }

  for (const drive of drives) {
    for (const root of await printExpRoots(drive)) {
      const found = await detectPrintExp(null, null, root);
      if (found) return { ...found, root };
    }
  }

  // Só agora, e só se pedirem: a lista acima não achou nada, então ou não há
  // impressora neste computador ou ela está num lugar que a lista não prevê.
  // Ver "A BUSCA FUNDA".
  if (funda) {
    for (const drive of drives) {
      onProgress({ message: `Procurando fundo em ${drive}...` });
      const achados = await buscaFunda(drive, {
        aborted,
        onProgress: ({ visitadas }) => onProgress({
          message: `Procurando fundo em ${drive} — ${visitadas} pasta(s) olhada(s)...`,
        }),
      });
      if (achados.length) return achados[0];
    }
  }
  return null;
}

/** O endereço IPv4 desta máquina, só para a linha da tela ficar completa. */
function localAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return null;
}

// ------------------------------------------------------------------ identidade

const TYPE_LABEL = { csv: "PrinterManager (CSV)", xml: "PrinterManager (XML)", "at-binary": "AT Printer (binário)", printexp: "PrintExp (XML)" };

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

async function scanNetwork({ hosts = [], funda = false, onProgress = () => {}, signal } = {}) {
  const aborted = () => signal && signal.aborted;
  let reachable;

  // Esta máquina primeiro, e sem falar rede: é leitura de disco, custa
  // milissegundos, e é o único jeito de achar a impressora quando o Optmize
  // foi instalado no mesmo PC que roda o software dela.
  let local = null;
  onProgress({ phase: "starting", message: "Procurando neste computador..." });
  try {
    const print = await fingerprintLocal({
      funda,
      aborted,
      onProgress: ({ message }) => onProgress({ phase: "starting", message }),
    });
    if (print) {
      local = {
        host: os.hostname(),
        ip: localAddress(),
        shares: [],
        typeLabel: TYPE_LABEL[print.type] || print.type,
        ...print
      };
      onProgress({ phase: "starting", message: `Neste computador: ${local.typeLabel}` });
    }
  } catch (error) {
    onProgress({ phase: "starting", message: `Falha ao ler este computador: ${error.message}` });
  }

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
    // Antes de varrer, dizer o que a varredura NÃO vai cobrir. Vem aqui e não
    // no fim porque no fim a pessoa já leu "nada encontrado" e foi embora; e
    // só no ramo da varredura, porque quem informou o host não está contando
    // com a cobertura da rede. Ver `faixasIncompletas`.
    // Num campo PRÓPRIO, e não no `message`: aquele guarda um recado só, o
    // último, e é reescrito a cada 25 endereços testados. O aviso de cobertura
    // apareceria por alguns milissegundos e sumiria — ou seja, não apareceria.
    for (const faixa of faixasIncompletas()) {
      onProgress({ phase: "sweep", aviso: faixa.recado, scanned: 0, total: targets.length });
    }
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

  const found = results.filter(Boolean);

  // A máquina local entra na frente, e só se a rede já não a tiver trazido:
  // um PC que compartilha a própria pasta responde às duas buscas, e a mesma
  // impressora apareceria duas vezes na tela, pedindo nome duas vezes.
  if (local && !found.some(item => String(item.host).toLowerCase() === local.host.toLowerCase())) {
    found.unshift(local);
  }

  return { reachable: reachable.length, found };
}

module.exports = {
  scanNetwork, suggestIdentity, resolveHostName, listShares,
  fingerprintHost, fingerprintLocal, TYPE_LABEL,
  // Expostos para conferir a varredura contra uma pasta montada à mão, sem
  // depender de haver uma impressora ligada na rede.
  detectPrintExp, printExpRoots, localDrives, localCandidateRoots,
  // A conta de cobertura da rede, para conferir o aviso sem varrer nada.
  faixasLocais, faixasIncompletas, bitsDaMascara,
  // A busca funda, para conferi-la contra uma pasta de teste sem varrer disco.
  buscaFunda, PASTAS_DE_PROGRAMA, PASTAS_DA_CONTA
};
