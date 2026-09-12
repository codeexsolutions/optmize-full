/**
 * ===========================================================================
 * PrintExp — o histórico que o próprio software já escreve em XML
 * ===========================================================================
 *
 * O PrintExp (Hosonsoft, usado nas T320UV e parentes) guarda cada trabalho em
 * `Usage\<serial da placa>\PrintData.xml`. É o histórico mais completo dos
 * quatro tipos que lemos: nome, material, início, fim, status, cópias,
 * largura, comprimento, área, tempo e tinta por canal vêm prontos do arquivo,
 * sem nada para deduzir.
 *
 * O `historyPath` aponta para a pasta `Usage`, não para o XML. O nome da
 * subpasta é o serial da placa de controle, e trocar a placa cria uma pasta
 * nova ao lado da antiga — apontar direto para o XML deixaria a impressora
 * "parada no tempo" depois de uma manutenção, calada. Quem manda é a pasta
 * escrita mais recentemente. (Um caminho terminado em `.xml` continua sendo
 * aceito, para quem tiver cadastrado assim à mão.)
 *
 * Uma coisa que este arquivo NÃO traz é o caminho do preview — ele mora no
 * `Data\HistoryTask.tf`, um binário à parte. Por isso o `previewRef` aqui sai
 * apenas com o nome do trabalho, que é o que o `services/preview.js` usa para
 * procurar a imagem.
 */

const fs = require("fs/promises");
const path = require("path");
const xml2js = require("xml2js");
const iconv = require("iconv-lite");

const parser = new xml2js.Parser();

/**
 * Estimativa de tinta por área, usada só quando a máquina não conta.
 *
 * O PrintExp só soma mililitros se `[INK_COST] INK_COST=1` estiver ligado no
 * `Data\Temp.ini`; desligado (o padrão de fábrica) ele grava 0,000000 em todos
 * os canais de todos os trabalhos. Sem esta estimativa a impressora apareceria
 * com tinta zerada ao lado de outras quatro que mostram consumo, o que se lê
 * como defeito nosso e não como um contador desligado lá.
 *
 * O número é o mesmo calibrado para as outras máquinas. `PRINTEXP_INK_ML_PER_M2=0`
 * desliga a estimativa e deixa o zero aparecer como zero.
 */
const INK_ML_PER_M2 = Number(process.env.PRINTEXP_INK_ML_PER_M2 ?? 3);

/** Os canais do PrintExp, na ordem em que ele os numera (`inkID`). */
const INK_COLORS = {
  K: "Preto",
  C: "Ciano",
  M: "Magenta",
  Y: "Amarelo",
  W: "Branco",
  LC: "Ciano claro",
  LM: "Magenta claro",
  LK: "Cinza"
};

/**
 * O que cada `PrintStatus` quer dizer.
 *
 * Conferido contra os dados de uma T320UV: o 2 aparece em trabalhos com
 * metragem parcial (parados no meio) e o 3 em trabalhos que rodaram horas e
 * gravaram 0,00 m — interrompido e falhou, nessa ordem.
 */
const STATUS = {
  1: { label: "Concluído", cancelled: false, error: false },
  2: { label: "Cancelado", cancelled: true, error: false },
  3: { label: "Erro", cancelled: false, error: true }
};

// ------------------------------------------------------------------ leitura

/**
 * Lê o XML respeitando a página de código do PrintExp.
 *
 * O arquivo não tem declaração de encoding e o programa é chinês: ele grava em
 * GBK. Ler como UTF-8 estraga tanto os nomes de trabalho acentuados quanto os
 * nomes que o próprio software cria (o trabalho de calibração chama-se 校准).
 * ASCII é subconjunto de GBK, então nome sem acento passa igual pelos dois.
 */
async function readXml(file) {
  const buffer = await fs.readFile(file);
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString("utf8");
  }
  return iconv.decode(buffer, "gbk");
}

/**
 * O `PrintData.xml` que vale: o da pasta de serial escrita mais recentemente.
 *
 * Uma instalação antiga acumula pastas de placas que já saíram da máquina
 * (`Usage\0000-00000000-00000000`, `Usage\Offline`), todas com um XML parado.
 */
async function resolveHistoryFile(historyPath) {
  const base = String(historyPath || "");
  if (/\.xml$/i.test(base)) return base;

  let entries;
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return null;
  }

  let best = null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(base, entry.name, "PrintData.xml");
    try {
      const stat = await fs.stat(candidate);
      if (!best || stat.mtimeMs > best.mtimeMs) best = { file: candidate, mtimeMs: stat.mtimeMs };
    } catch {
      // Pasta de serial sem XML: placa que nunca imprimiu. Segue.
    }
  }
  return best ? best.file : null;
}

// ------------------------------------------------------------------ campos

function text(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) return "";
  if (typeof raw === "object") return String(raw._ ?? "");
  return String(raw);
}

function num(value, fallback = 0) {
  const parsed = Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** "2026-09-12 13:55:01" — o formato que o PrintExp grava, já quase o nosso. */
function parseDateTime(raw) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(raw || "").trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return {
    date: `${y}-${mo}-${d}`,
    time: `${h}:${mi}:${s}`,
    dateTime: `${y}-${mo}-${d} ${h}:${mi}:${s}`,
    ms: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime()
  };
}

/**
 * Os mililitros por canal.
 *
 * Cada `<InkCost>` traz dois números separados por espaço; o primeiro é o
 * consumo do trabalho. Canal zerado não entra na lista — mostrar "Branco 0 mL"
 * num trabalho CMYK só suja a tela.
 */
function readInkChannels(usage) {
  const items = usage?.[0]?.InkCost || [];
  const channels = [];

  for (const item of items) {
    const code = String(item?.$?.inkName || "").trim().toUpperCase();
    if (!code) continue;
    const ml = Number.parseFloat(String(item?._ ?? "").trim().split(/\s+/)[0]);
    if (!Number.isFinite(ml) || ml <= 0) continue;
    channels.push({ code, color: INK_COLORS[code] || code, ml });
  }

  return channels;
}

// ------------------------------------------------------------------ driver

async function readRange(machine, start, end) {
  const file = await resolveHistoryFile(machine.historyPath);
  if (!file) return [];

  const parsed = await parser.parseStringPromise(await readXml(file));
  const items = parsed?.PrintStatistic?.StatisticData?.[0]?.DataItem || [];

  const out = [];
  // O id precisa sobreviver a uma releitura. O índice no arquivo não serve:
  // o PrintExp corta o começo do XML quando ele cresce demais, e todo registro
  // mudaria de id de uma vez, duplicando o histórico inteiro. Início + nome
  // identificam o trabalho; o contador só desempata tiragens que começaram no
  // mesmo segundo.
  const seen = new Map();

  for (const item of items) {
    const started = parseDateTime(text(item.StartPrintTime));
    if (!started) continue;
    if (started.date < start || started.date > end) continue;

    const task = text(item.TaskName) || "(sem nome)";
    const key = `${started.dateTime}|${task}`;
    const seq = seen.get(key) || 0;
    seen.set(key, seq + 1);

    const status = STATUS[Number(text(item.PrintStatus))] || { label: "Desconhecido", cancelled: false, error: false };
    const ended = parseDateTime(text(item.EndPrintTime));

    const printLength = num(item.PrintLength);
    const widthM = num(item.PrintWidth);
    // O PrintExp arredonda a área para 2 casas, o que zera qualquer trabalho
    // menor que 1 cm² — e ele grava 0,00 em tiragem curta. Largura × comprimento
    // vêm com a mesma precisão e não têm esse degrau.
    const printArea = num(item.PrintArea) || widthM * printLength;

    // `TimeCost` é o que a máquina cronometrou imprimindo. Ele vem 0 nos
    // trabalhos de calibração, e aí o relógio de parede é a única medida.
    const timeSeconds = Math.round(num(item.TimeCost))
      || (ended && ended.ms > started.ms ? Math.round((ended.ms - started.ms) / 1000) : 0);

    const inkChannels = readInkChannels(item.InkUsage);
    const measuredInk = inkChannels.reduce((total, channel) => total + channel.ml, 0);
    const estimatedInk = INK_ML_PER_M2 > 0 && printArea > 0 ? printArea * INK_ML_PER_M2 : 0;

    out.push({
      id: `${machine.id}|${started.dateTime}|${task}|${seq}`,
      machineId: machine.id,
      machineName: machine.name,
      sourceType: machine.type,
      dateTime: started.dateTime,
      date: started.date,
      time: started.time,
      endDateTime: ended?.dateTime || "",
      task,
      material: text(item.MaterialName),
      copies: Math.round(num(item.PrintDoneCopys, 1)) || 1,
      pass: null,
      status: status.label,
      cancelled: status.cancelled,
      error: status.error,
      printArea,
      printLength,
      widthM,
      metricEstimated: false,
      finish: null,
      total: null,
      timeSeconds,
      inkMl: measuredInk > 0 ? measuredInk : estimatedInk,
      inkExperimental: measuredInk <= 0 && estimatedInk > 0,
      // Nulo, e não lista vazia: o upsert entende nulo como "não tenho canais
      // para oferecer" e preserva os que já estiverem gravados.
      inkChannels: inkChannels.length ? inkChannels : null,
      previewRef: task,
      isClipOrTile: false
    });
  }

  return out;
}

/**
 * A assinatura diz se vale reimportar. Tamanho + mtime do XML bastam: o
 * PrintExp só acrescenta ao arquivo, sempre no fim de um trabalho.
 */
async function signature(machine) {
  const file = await resolveHistoryFile(machine.historyPath);
  if (!file) return "";
  const stat = await fs.stat(file);
  return `${stat.size}:${stat.mtimeMs}`;
}

module.exports = { readRange, signature, resolveHistoryFile };
