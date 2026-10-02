// node bancada/audaces/sondar.mjs "<pasta com .ads>"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const pasta = process.argv[2] || process.env.OPTMIZE_ARQUIVOS_AUDACES || "D:\\uso de teste";
const saida = path.join(AQUI, "ver");
fs.mkdirSync(saida, { recursive: true });

const plausivel = (v) => Number.isFinite(v) && v > -50 && v < 600 && (v === 0 || Math.abs(v) > 1e-3);

for (const f of fs.readdirSync(pasta).filter((x) => /\.ads$/i.test(x))) {
  const b = fs.readFileSync(path.join(pasta, f));
  const jpg = b.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  const tam = b.readUInt32LE(jpg - 4);
  fs.writeFileSync(path.join(saida, `${f}.miniatura.jpg`), b.subarray(jpg, jpg + tam));

  const trechos = [];
  for (let o = jpg + tam; o + 4 < b.length; o++) {
    const tipo = b.readUInt16LE(o);
    const n = b.readUInt16LE(o + 2);
    if (tipo > 40 || n < 2 || n > 400 || o + 4 + n * 16 > b.length) continue;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const x = b.readDoubleLE(o + 4 + k * 16);
      const y = b.readDoubleLE(o + 12 + k * 16);
      if (!plausivel(x) || !plausivel(y)) break;
      pts.push([x, y]);
    }
    if (pts.length !== n) continue;
    trechos.push({ posicao: o, tipo, n, pts });
    o += 3 + n * 16;
  }

  const porTipo = {};
  for (const t of trechos) porTipo[t.tipo] = (porTipo[t.tipo] || 0) + 1;
  console.log(`${f}: ${trechos.length} trechos, por tipo ${JSON.stringify(porTipo)}`);
  for (const t of trechos) {
    const de = t.pts[0].map((v) => v.toFixed(2)).join(", ");
    const ate = t.pts[t.pts.length - 1].map((v) => v.toFixed(2)).join(", ");
    console.log(`  @${t.posicao} tipo ${t.tipo} n ${t.n} de (${de}) a (${ate})`);
  }

  let minX = 1e9; let minY = 1e9; let maxX = -1e9; let maxY = -1e9;
  for (const t of trechos) {
    for (const [x, y] of t.pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const k = 900 / Math.max(maxX - minX, maxY - minY, 1);
  const cores = ["#e33", "#23c", "#2a2", "#c80", "#a3c", "#0aa", "#888"];
  const ponto = ([x, y]) => `${((x - minX) * k + 20).toFixed(1)},${((maxY - y) * k + 20).toFixed(1)}`;
  const linhas = trechos
    .map((t) => `<polyline fill="none" stroke="${cores[t.tipo % cores.length]}" stroke-width="1.5" points="${t.pts.map(ponto).join(" ")}"/>`)
    .join("");
  const largura = Math.ceil((maxX - minX) * k + 40);
  const altura = Math.ceil((maxY - minY) * k + 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}"><rect width="100%" height="100%" fill="#fff"/>${linhas}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(saida, `${f}.sonda.png`));
}
