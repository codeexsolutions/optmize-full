// Gerador de QR Code puro em JS, sem dependências externas — assim não
// precisa rodar "npm install" de novo depois de atualizar o projeto.
// Implementa o suficiente do padrão ISO/IEC 18004 pra gerar códigos
// confiáveis em modo byte (UTF-8): tabelas GF(256), Reed-Solomon,
// posicionamento de padrões, máscara com pontuação de penalidade e
// info de formato/versão.
//
// Uso: const { encodeQr } = require("./qrcode");
//      const { size, modules } = encodeQr("REC:abc123");
//      // modules[row][col] === true  -> módulo escuro

"use strict";

const crypto = require("crypto");

// ---------- GF(256) ----------
const EXP_TABLE = new Array(256);
const LOG_TABLE = new Array(256);
(function buildTables() {
  for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 255; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  }
  for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
})();

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

function polyMultiply(a, b) {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] ^= gfMul(a[i], b[j]);
    }
  }
  return result;
}

function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = polyMultiply(poly, [1, EXP_TABLE[i]]);
  }
  return poly;
}

function rsEncode(dataCodewords, ecCount) {
  const generator = generatorPolynomial(ecCount);
  const result = dataCodewords.concat(new Array(ecCount).fill(0));
  for (let i = 0; i < dataCodewords.length; i++) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 0; j < generator.length; j++) {
        result[i + j] ^= gfMul(generator[j], coef);
      }
    }
  }
  return result.slice(dataCodewords.length);
}

// ---------- BCH (format info / version info) ----------
function bchDigitCount(data) {
  let digits = 0;
  while (data !== 0) { digits++; data >>>= 1; }
  return digits;
}

const G15 = 0b10100110111; // x^10+x^8+x^5+x^4+x^2+x+1
const G15_MASK = 0b101010000010010; // 0x5412
const G18 = 0b1111100100101; // x^12+x^11+x^10+x^9+x^8+x^5+x^2+1

function bchTypeInfo(data5bits) {
  let d = data5bits << 10;
  const g15Digits = bchDigitCount(G15);
  while (bchDigitCount(d) - g15Digits >= 0) {
    d ^= (G15 << (bchDigitCount(d) - g15Digits));
  }
  return ((data5bits << 10) | d) ^ G15_MASK;
}

function bchVersionInfo(version) {
  let d = version << 12;
  const g18Digits = bchDigitCount(G18);
  while (bchDigitCount(d) - g18Digits >= 0) {
    d ^= (G18 << (bchDigitCount(d) - g18Digits));
  }
  return (version << 12) | d;
}

// ---------- Tabelas de capacidade (modo byte) ----------
// EC level: 0=L 1=M 2=Q 3=H (índice usado internamente nas tabelas abaixo)
const EC_LEVEL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

// Para cada versão (1-24): [totalCodewords, ecCodewordsPerBlock,
// blocksGroup1, dataCwGroup1, blocksGroup2, dataCwGroup2] por nível EC.
// (dados do padrão ISO/IEC 18004, Annex D — "Error correction characteristics")
const RS_BLOCKS = {
  1: { L:[[1,7,19]], M:[[1,10,16]], Q:[[1,13,13]], H:[[1,17,9]] },
  2: { L:[[1,10,34]], M:[[1,16,28]], Q:[[1,22,22]], H:[[1,28,16]] },
  3: { L:[[1,15,55]], M:[[1,26,44]], Q:[[2,18,17]], H:[[2,22,13]] },
  4: { L:[[1,20,80]], M:[[2,18,32]], Q:[[2,26,24]], H:[[4,16,9]] },
  5: { L:[[1,26,108]], M:[[2,24,43]], Q:[[2,18,15],[2,18,16]], H:[[2,22,11],[2,22,12]] },
  6: { L:[[2,18,68]], M:[[4,16,27]], Q:[[4,24,19]], H:[[4,28,15]] },
  7: { L:[[2,20,78]], M:[[4,18,31]], Q:[[2,18,14],[4,18,15]], H:[[4,26,13],[1,26,14]] },
  8: { L:[[2,24,97]], M:[[2,22,38],[2,22,39]], Q:[[4,22,18],[2,22,19]], H:[[4,26,14],[2,26,15]] },
  9: { L:[[2,30,116]], M:[[3,22,36],[2,22,37]], Q:[[4,20,16],[4,20,17]], H:[[4,24,12],[4,24,13]] },
  10:{ L:[[2,18,68],[2,18,69]], M:[[4,26,43],[1,26,44]], Q:[[6,24,19],[2,24,20]], H:[[6,28,15],[2,28,16]] },
  11:{ L:[[4,20,81]], M:[[1,30,50],[4,30,51]], Q:[[4,28,22],[4,28,23]], H:[[3,24,12],[8,24,13]] },
  12:{ L:[[2,24,92],[2,24,93]], M:[[6,22,36],[2,22,37]], Q:[[4,26,20],[6,26,21]], H:[[7,28,14],[4,28,15]] },
  13:{ L:[[4,26,107]], M:[[8,22,37],[1,22,38]], Q:[[8,24,20],[4,24,21]], H:[[12,22,11],[4,22,12]] },
  14:{ L:[[3,30,115],[1,30,116]], M:[[4,24,40],[5,24,41]], Q:[[11,20,16],[5,20,17]], H:[[11,24,12],[5,24,13]] },
  15:{ L:[[5,22,87],[1,22,88]], M:[[5,24,41],[5,24,42]], Q:[[5,30,24],[7,30,25]], H:[[11,24,12],[7,24,13]] },
  16:{ L:[[5,24,98],[1,24,99]], M:[[7,28,45],[3,28,46]], Q:[[15,24,19],[2,24,20]], H:[[3,30,15],[13,30,16]] },
  17:{ L:[[1,28,107],[5,28,108]], M:[[10,28,46],[1,28,47]], Q:[[1,28,22],[15,28,23]], H:[[2,28,14],[17,28,15]] },
  18:{ L:[[5,30,120],[1,30,121]], M:[[9,26,43],[4,26,44]], Q:[[17,28,22],[1,28,23]], H:[[2,28,14],[19,28,15]] },
  19:{ L:[[3,28,113],[4,28,114]], M:[[3,26,44],[11,26,45]], Q:[[17,26,21],[4,26,22]], H:[[9,26,13],[16,26,14]] },
  20:{ L:[[3,28,107],[5,28,108]], M:[[3,26,41],[13,26,42]], Q:[[15,30,24],[5,30,25]], H:[[15,28,15],[10,28,16]] },
  21:{ L:[[4,28,116],[4,28,117]], M:[[17,26,42]], Q:[[17,28,22],[6,28,23]], H:[[19,30,16],[6,30,17]] },
  22:{ L:[[2,28,111],[7,28,112]], M:[[17,28,46]], Q:[[7,30,24],[16,30,25]], H:[[34,24,13]] },
  23:{ L:[[4,30,121],[5,30,122]], M:[[4,28,47],[14,28,48]], Q:[[11,30,24],[14,30,25]], H:[[16,30,15],[14,30,16]] },
  24:{ L:[[6,30,117],[4,30,118]], M:[[6,28,45],[14,28,46]], Q:[[11,30,24],[16,30,25]], H:[[30,30,16],[2,30,17]] }
};

// Tamanho, em módulos, do lado do QR pra cada versão.
function moduleCount(version) { return version * 4 + 17; }

// Posições (centro) dos padrões de alinhamento por versão.
const ALIGNMENT_POSITIONS = {
  1: [], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30], 6:[6,34],
  7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50],
  11:[6,30,54], 12:[6,32,58], 13:[6,34,62], 14:[6,26,46,66],
  15:[6,26,48,70], 16:[6,26,50,74], 17:[6,30,54,78], 18:[6,30,56,82],
  19:[6,30,58,86], 20:[6,34,62,90], 21:[6,28,50,72,94], 22:[6,26,50,74,98],
  23:[6,30,54,78,102], 24:[6,28,54,80,106]
};

function charCountBits(version) {
  // Modo byte: 8 bits até v9, 16 bits de v10 em diante.
  return version <= 9 ? 8 : 16;
}

class BitBuffer {
  constructor() { this.bytes = []; this.length = 0; }
  put(num, len) {
    for (let i = len - 1; i >= 0; i--) this.putBit(((num >>> i) & 1) === 1);
  }
  putBit(bit) {
    const idx = this.length >>> 3;
    if (this.bytes.length <= idx) this.bytes.push(0);
    if (bit) this.bytes[idx] |= (0x80 >>> (this.length & 7));
    this.length++;
  }
}

function utf8Bytes(str) {
  return Array.from(Buffer.from(String(str), "utf8"));
}

// Escolhe a menor versão (1..24) que comporta os dados no nível de EC
// pedido; se não couber em nenhuma, tenta o próximo nível de EC mais
// fraco (H->Q->M->L) antes de desistir.
function pickVersion(byteLen, preferredLevel) {
  const order = ["H", "Q", "M", "L"];
  const startIdx = order.indexOf(preferredLevel);
  const levels = order.slice(startIdx).concat(order.slice(0, startIdx)).filter((v, i, a) => a.indexOf(v) === i);
  // tenta do nível pedido pra baixo em robustez, mas prioriza achar
  // ALGUMA versão que caiba antes de enfraquecer o nível de EC.
  for (const level of [preferredLevel, "L", "M", "Q", "H"]) {
    for (let v = 1; v <= 24; v++) {
      const total = totalDataCodewords(v, level);
      const overheadBits = 4 + charCountBits(v);
      const capacityBits = total * 8 - overheadBits;
      if (byteLen * 8 <= capacityBits) return { version: v, level };
    }
  }
  return null;
}

function totalDataCodewords(version, level) {
  const blocks = RS_BLOCKS[version][level];
  return blocks.reduce((sum, [count, , dataCw]) => sum + count * dataCw, 0);
}

function buildDataCodewords(byteData, version, level) {
  const total = totalDataCodewords(version, level);
  const buf = new BitBuffer();
  buf.put(0b0100, 4); // modo byte
  buf.put(byteData.length, charCountBits(version));
  for (const b of byteData) buf.put(b, 8);

  // terminador (até 4 bits de zero)
  const remaining = total * 8 - buf.length;
  buf.put(0, Math.min(4, Math.max(0, remaining)));

  // completa até múltiplo de 8
  while (buf.length % 8 !== 0) buf.putBit(false);

  // bytes de padding alternando 0xEC / 0x11
  const padBytes = [0xEC, 0x11];
  let pi = 0;
  while (buf.bytes.length < total) {
    buf.bytes.push(padBytes[pi % 2]);
    pi++;
  }
  return buf.bytes.slice(0, total);
}

function interleave(dataCodewords, version, level) {
  const blocks = RS_BLOCKS[version][level];
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  let ecCount = 0;
  for (const [count, ecPerBlock, dataCw] of blocks) {
    ecCount = ecPerBlock;
    for (let i = 0; i < count; i++) {
      const chunk = dataCodewords.slice(offset, offset + dataCw);
      offset += dataCw;
      dataBlocks.push(chunk);
      ecBlocks.push(rsEncode(chunk, ecPerBlock));
    }
  }

  const result = [];
  const maxDataLen = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < ecCount; i++) {
    for (const block of ecBlocks) if (i < block.length) result.push(block[i]);
  }
  return result;
}

// ---------- Construção da matriz ----------
// Usamos duas grades paralelas: `grid` guarda o valor (true=escuro) e
// `reserved` marca módulos "de função" (finder, timing, alinhamento,
// módulo escuro fixo, áreas de formato/versão) que NUNCA podem ser
// tocados pela máscara nem recever bits de dado.
function createEmptyGrid(size) {
  const grid = [];
  const reserved = [];
  for (let r = 0; r < size; r++) {
    grid.push(new Array(size).fill(false));
    reserved.push(new Array(size).fill(false));
  }
  return { grid, reserved };
}

function placeFinder(state, row, col) {
  const { grid, reserved } = state;
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || rr >= grid.length || cc < 0 || cc >= grid.length) continue;
      const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[rr][cc] = !isBorder && (inRing || inCore);
      reserved[rr][cc] = true;
    }
  }
}

function placeTiming(state) {
  const { grid, reserved } = state;
  const size = grid.length;
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) { grid[6][i] = i % 2 === 0; reserved[6][i] = true; }
    if (!reserved[i][6]) { grid[i][6] = i % 2 === 0; reserved[i][6] = true; }
  }
}

function placeAlignment(state, version) {
  const { grid, reserved } = state;
  const positions = ALIGNMENT_POSITIONS[version] || [];
  const size = grid.length;
  for (const row of positions) {
    for (const col of positions) {
      // pula onde colidiria com os padrões de localização (cantos)
      if ((row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8)) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const rr = row + r, cc = col + c;
          const ring = Math.max(Math.abs(r), Math.abs(c));
          grid[rr][cc] = ring !== 1;
          reserved[rr][cc] = true;
        }
      }
    }
  }
}

function placeDarkModule(state, version) {
  const row = 4 * version + 9;
  state.grid[row][8] = true;
  state.reserved[row][8] = true;
}

function reserveFormatAreas(state) {
  const { reserved } = state;
  const size = reserved.length;
  for (let i = 0; i <= 8; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
}

function reserveVersionAreas(state, version) {
  if (version < 7) return;
  const { reserved } = state;
  const size = reserved.length;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 3; c++) {
      reserved[r][size - 11 + c] = true;
      reserved[size - 11 + c][r] = true;
    }
  }
}

function applyMaskFn(pattern) {
  switch (pattern) {
    case 0: return (r, c) => (r + c) % 2 === 0;
    case 1: return (r) => r % 2 === 0;
    case 2: return (r, c) => c % 3 === 0;
    case 3: return (r, c) => (r + c) % 3 === 0;
    case 4: return (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return () => false;
  }
}

function placeData(state, dataBytes) {
  const { grid, reserved } = state;
  const size = grid.length;
  const bits = [];
  for (const byte of dataBytes) {
    for (let i = 7; i >= 0; i--) bits.push(((byte >>> i) & 1) === 1);
  }

  const positions = []; // ordem de preenchimento (row,col)
  let col = size - 1;
  let dir = -1; // -1 = subindo, 1 = descendo

  while (col > 0) {
    if (col === 6) col--; // pula coluna do timing pattern

    for (let i = 0; i < size; i++) {
      const row = dir === -1 ? size - 1 - i : i;
      for (const cc of [col, col - 1]) {
        if (!reserved[row][cc]) positions.push([row, cc]);
      }
    }
    col -= 2;
    dir = -dir;
  }

  let bitIndex = 0;
  for (const [row, cc] of positions) {
    grid[row][cc] = bitIndex < bits.length ? bits[bitIndex] : false;
    bitIndex++;
  }
}

function maskedGrid(state, maskFn) {
  const { grid, reserved } = state;
  const size = grid.length;
  const out = [];
  for (let r = 0; r < size; r++) {
    const row = new Array(size);
    for (let c = 0; c < size; c++) {
      row[c] = reserved[r][c] ? grid[r][c] : (maskFn(r, c) ? !grid[r][c] : grid[r][c]);
    }
    out.push(row);
  }
  return out;
}

// ---------- Pontuação de penalidade (escolha da máscara) ----------
function penaltyScore(grid) {
  const size = grid.length;
  const dark = (r, c) => grid[r][c] === true;
  let score = 0;

  // Regra 1: sequências de 5+ módulos iguais em linha/coluna
  for (let r = 0; r < size; r++) {
    let runColor = null, runLen = 0;
    for (let c = 0; c < size; c++) {
      const v = dark(r, c);
      if (v === runColor) { runLen++; }
      else { if (runLen >= 5) score += 3 + (runLen - 5); runColor = v; runLen = 1; }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c++) {
    let runColor = null, runLen = 0;
    for (let r = 0; r < size; r++) {
      const v = dark(r, c);
      if (v === runColor) { runLen++; }
      else { if (runLen >= 5) score += 3 + (runLen - 5); runColor = v; runLen = 1; }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }

  // Regra 2: blocos 2x2 da mesma cor
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = dark(r, c);
      if (v === dark(r, c + 1) && v === dark(r + 1, c) && v === dark(r + 1, c + 1)) score += 3;
    }
  }

  // Regra 3: padrão tipo "finder" (1:1:3:1:1) com 4 módulos claros de cada lado
  const patternA = [true, false, true, true, true, false, true, false, false, false, false];
  const patternB = [false, false, false, false, true, false, true, true, true, false, true];
  function matchesAt(getVal, start, len) {
    for (const pattern of [patternA, patternB]) {
      let ok = true;
      for (let i = 0; i < pattern.length; i++) {
        const idx = start + i;
        const val = idx >= 0 && idx < len ? getVal(idx) : false;
        if (val !== pattern[i]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      if (matchesAt(i => dark(r, i), c, size)) score += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 11; r++) {
      if (matchesAt(i => dark(i, c), r, size)) score += 40;
    }
  }

  // Regra 4: proporção clara/escura
  let darkCount = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (dark(r, c)) darkCount++;
  const percent = (darkCount * 100) / (size * size);
  const deviation = Math.floor(Math.abs(percent - 50) / 5);
  score += deviation * 10;

  return score;
}

function fillFormatInfo(grid, level, maskPattern) {
  const size = grid.length;
  const data = (EC_LEVEL_BITS[level] << 3) | maskPattern;
  const bits = bchTypeInfo(data);
  // Bit 14 (MSB) fica na posição espacial mais próxima do canto; por isso
  // invertemos o índice espacial i (0..14) pro bit (14-i).
  const bit = i => ((bits >>> (14 - i)) & 1) === 1;

  // Cópia 1: ao redor do finder pattern superior-esquerdo
  for (let i = 0; i <= 5; i++) grid[8][i] = bit(i);
  grid[8][7] = bit(6);
  grid[8][8] = bit(7);
  grid[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) grid[14 - i][8] = bit(i);

  // Cópia 2: esquerda-inferior (f0..f6) + canto superior-direito (f7..f14)
  for (let i = 0; i <= 6; i++) grid[size - 1 - i][8] = bit(i);
  for (let i = 7; i <= 14; i++) grid[8][size - 15 + i] = bit(i);
}

function fillVersionInfo(grid, version) {
  if (version < 7) return;
  const size = grid.length;
  const bits = bchVersionInfo(version);
  // Info de versão usa ordem linha-maior e SEM inverter os bits (convenção
  // diferente da info de formato — validado byte a byte contra referência).
  const bit = i => ((bits >>> i) & 1) === 1;
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    grid[row][size - 11 + col] = bit(i);
    grid[size - 11 + col][row] = bit(i);
  }
}

/**
 * Gera a matriz de módulos de um QR Code em modo byte (UTF-8).
 * @param {string} text texto a codificar
 * @param {{ec?: "L"|"M"|"Q"|"H"}} [options]
 * @returns {{version:number, level:string, size:number, modules:boolean[][]}}
 */
function encodeQr(text, options = {}) {
  const level = options.ec || "M";
  const byteData = utf8Bytes(text);

  const picked = pickVersion(byteData.length, level);
  if (!picked) throw new Error("Texto longo demais para gerar QR Code (máx. suportado excedido).");
  const { version, level: finalLevel } = picked;

  const dataCodewords = buildDataCodewords(byteData, version, finalLevel);
  const allCodewords = interleave(dataCodewords, version, finalLevel);

  const size = moduleCount(version);
  const state = createEmptyGrid(size);

  placeFinder(state, 0, 0);
  placeFinder(state, 0, size - 7);
  placeFinder(state, size - 7, 0);
  placeTiming(state);
  placeAlignment(state, version);
  placeDarkModule(state, version);
  reserveFormatAreas(state);
  reserveVersionAreas(state, version);
  placeData(state, allCodewords);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const maskFn = applyMaskFn(mask);
    const candidate = maskedGrid(state, maskFn);
    fillFormatInfo(candidate, finalLevel, mask);
    fillVersionInfo(candidate, version);
    const score = penaltyScore(candidate);
    if (!best || score < best.score) best = { score, mask, grid: candidate };
  }

  const modules = best.grid.map(row => row.map(v => v === true));
  return { version, level: finalLevel, size, modules };
}

/**
 * Gera o SVG (string) de um QR Code pronto pra embutir inline no HTML.
 * @param {string} text
 * @param {{ec?:string, moduleSize?:number, quiet?:number}} [options]
 */
function qrToSvg(text, options = {}) {
  const { modules, size } = encodeQr(text, { ec: options.ec || "M" });
  const quiet = options.quiet ?? 2;
  const px = options.moduleSize || 4;
  const total = size + quiet * 2;
  const dim = total * px;

  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        rects += `<rect x="${(c + quiet) * px}" y="${(r + quiet) * px}" width="${px}" height="${px}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

/**
 * Desenha um QR Code vetorial direto num documento PDFKit (sem precisar de
 * imagem raster). x/y/sizePt em pontos PDF.
 */
function qrDrawOnPdf(doc, text, x, y, sizePt, options = {}) {
  const { modules, size } = encodeQr(text, { ec: options.ec || "M" });
  const quiet = options.quiet ?? 2;
  const total = size + quiet * 2;
  const modulePt = sizePt / total;

  doc.save();
  doc.rect(x, y, sizePt, sizePt).fill("#fff");
  doc.fillColor("#000");
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        doc.rect(x + (c + quiet) * modulePt, y + (r + quiet) * modulePt, modulePt, modulePt).fill();
      }
    }
  }
  doc.restore();
}

// Código curto e opaco (prefixo + 10 hex do SHA-1) pra usar como conteúdo
// do QR, independente do tamanho do id/nome do trabalho original — mantém
// o QR sempre na versão 1 (o menor e mais fácil de ler por uma câmera).
function qrShortCode(prefix, id) {
  const hash = crypto.createHash("sha1").update(String(id)).digest("hex").slice(0, 10);
  return `${prefix}${hash}`;
}

module.exports = { encodeQr, qrToSvg, qrDrawOnPdf, qrShortCode };
