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

/*
 * ===========================================================================
 * O ARQUIVO MISTURA DUAS CODIFICAÇÕES, E NENHUMA ESTÁ DECLARADA
 * ===========================================================================
 *
 * O `PrintData.xml` não tem `<?xml ... encoding=?>`: começa direto em
 * `<PrintStatistic>`. E o que ele grava vem de duas mãos diferentes:
 *
 *   as strings DO SOFTWARE   em GBK, porque o programa é chinês. O trabalho de
 *                            calibração chama-se 校准 — bytes D0 A3 D7 BC.
 *   os nomes DO OPERADOR     na página ANSI do Windows da máquina, um byte por
 *                            caractere. Aqui é cp1252: `Ã` é o byte C3.
 *
 * Ler tudo como GBK acerta o primeiro caso e estraga o segundo, de DOIS jeitos
 * diferentes — e essa distinção é o que decide onde o conserto tem de morar.
 *
 * 1) ACENTO SEGUIDO DE CAUDA GBK VÁLIDA (0x40 a 0xFE): os dois bytes viram um
 *    ideograma só.
 *
 *      4e 49 43 4b 20 46 41 4c 43 c3 4f 2e 70 72 74
 *      N  I  C  K     F  A  L  C  Ã  O  .  p  r  t
 *      como cp1252   "NICK FALCÃO.prt"    certo
 *      como GBK      "NICK FALC肙.prt"    C3 4F virou um ideograma
 *
 * 2) ACENTO SEGUIDO DE QUALQUER OUTRA COISA — um espaço, por exemplo: o par não
 *    é GBK válido, o decodificador devolve U+FFFD e O BYTE DO ACENTO MORRE ALI.
 *
 *      41 c7 20 42  ->  "A� B"   o Ç não é recuperável depois disso
 *
 * O primeiro caso seria reversível em cima da string (`肙` re-codificado devolve
 * C3 4F). O segundo não é, de jeito nenhum — e é por isso que a decisão tem de
 * ser tomada NOS BYTES, antes de decodificar, e não consertando o texto depois.
 *
 * Achado nos 489 trabalhos da máquina de teste: `ANTÔNIO`, `LAÇO` e `LEUDA`
 * passavam e só `FALCÃO` quebrava. Não é aleatório, e nem é sorte que dure:
 * `Ô` seguido de `N` (4e) e `Ç` seguido de `O` (4f) caem os dois na faixa de
 * cauda e quebrariam igual. O que salvou os outros foi a letra que vinha depois.
 *
 * ---------------------------------------------------------------------------
 * COMO A DECISÃO É TOMADA
 * ---------------------------------------------------------------------------
 *
 * O arquivo é lido em LATIN-1, que é a única leitura garantidamente sem perda:
 * os 256 bytes mapeiam nos 256 primeiros code points, um para um, e nada vira
 * U+FFFD. O que sai daí não é texto certo — é os bytes preservados numa string.
 *
 * Depois, CAMPO POR CAMPO, `decodificarCampo` escolhe a codificação:
 *
 *   tem letra latina (A-Z, a-z)?  é nome de gente na página ANSI  -> cp1252
 *   só bytes altos, em pares GBK válidos?  é string do software   -> GBK
 *
 * Por campo, e não pelo documento, porque o teste é de CONTEXTO: `校准` é só
 * CJK e não tem letra latina nenhuma; `NICK FALCÃO.prt` é quase todo ASCII. O
 * documento inteiro sempre tem letras latinas (as etiquetas XML), então o mesmo
 * teste aplicado nele não distinguiria nada.
 *
 * O QUE ISTO PODE ERRAR, dito na cara: um nome de trabalho em chinês DE VERDADE
 * que misturasse ideograma com letra latina sairia como cp1252, ou seja,
 * ilegível. É uma gráfica no Brasil; os nomes são em português, e o único
 * chinês no arquivo são as strings que o próprio programa cria, que são CJK
 * puro. O risco é hipotético e o estrago que ele evita estava na tela.
 */

/** O campo tem letra latina? Então é nome digitado, não texto chinês. */
function temLetraLatina(bytes) {
  for (const b of bytes) {
    if ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a)) return true;
  }
  return false;
}

/**
 * Os bytes altos formam, TODOS eles, pares GBK válidos?
 *
 * "Todos" é o que importa: um único byte alto solto (o acento do caso 2) já
 * reprova o campo, e é justamente ele que a leitura em GBK destruiria.
 */
function paresGbkFechados(bytes) {
  let pares = 0;
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { i++; continue; }
    if (b < 0x81 || b > 0xfe) return 0;
    const cauda = bytes[i + 1];
    if (cauda == null || cauda < 0x40 || cauda > 0xfe || cauda === 0x7f) return 0;
    pares++;
    i += 2;
  }
  return pares;
}

/** Algum caractere fora do ASCII? Se não, os dois caminhos dão o mesmo texto. */
function temByteAlto(texto) {
  for (let i = 0; i < texto.length; i++) {
    if (texto.charCodeAt(i) > 0x7f) return true;
  }
  return false;
}

/**
 * Decide a codificação de UM campo e o devolve legível.
 *
 * Recebe a string latin-1 que saiu do `readXml` — bytes preservados — e não
 * texto. Ver o cabeçalho acima.
 */
function decodificarCampo(bruto) {
  if (!bruto) return bruto;
  // Sem byte alto é ASCII puro, e aí as duas codificações dão o mesmo texto.
  // Sai aqui a esmagadora maioria dos campos, inclusive datas e números.
  if (!temByteAlto(bruto)) return bruto;

  const bytes = Buffer.from(bruto, "latin1");
  if (!temLetraLatina(bytes) && paresGbkFechados(bytes) > 0) {
    return iconv.decode(bytes, "gbk");
  }
  return iconv.decode(bytes, "win1252");
}

/**
 * Lê o XML preservando os bytes, e não adivinhando a codificação.
 *
 * Latin-1 é a leitura sem perda: 256 bytes, 256 code points, nada vira U+FFFD.
 * O texto que sai daqui ainda NÃO está certo — quem decide a codificação de
 * cada valor é o `text`, com o `decodificarCampo`. Ver o cabeçalho acima.
 *
 * BOM de UTF-8 é a exceção: aí o arquivo DECLARA o que é, e declaração vale
 * mais que heurística. A marca `_utf8` avisa o `text` para não mexer.
 */
async function readXml(file) {
  const buffer = await fs.readFile(file);
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { texto: buffer.slice(3).toString("utf8"), jaDecodificado: true };
  }
  return { texto: buffer.toString("latin1"), jaDecodificado: false };
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

  const { texto, jaDecodificado } = await readXml(file);
  const parsed = await parser.parseStringPromise(texto);
  /*
   * O leitor dos campos de TEXTO — os que podem ter acento ou ideograma.
   *
   * Vem de uma fábrica, e não de um global do módulo, porque duas máquinas
   * PrintExp podem estar sendo lidas ao mesmo tempo: um `let` no topo do
   * arquivo seria a codificação de uma vazando na leitura da outra.
   *
   * Data, número e status não passam por aqui: são ASCII, e as duas
   * codificações dão o mesmo resultado neles.
   */
  const campo = jaDecodificado ? text : (valor) => decodificarCampo(text(valor));
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

    const task = campo(item.TaskName) || "(sem nome)";
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
      material: campo(item.MaterialName),
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

// `desfazerIdeogramaDeAcento` sai exposto para a conferência poder medi-lo
// contra os bytes de verdade, sem depender de haver máquina na rede.
// `decodificarCampo` sai exposto para a conferência poder medi-lo contra os
// bytes de verdade, sem depender de haver máquina na rede.
module.exports = { readRange, signature, resolveHistoryFile, decodificarCampo };
