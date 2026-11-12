/*
 * ===========================================================================
 * OS LOGOS SINTÉTICOS — a matéria-prima do treino da rede da Vetora
 * ===========================================================================
 *
 * Cada semente vira um logo diferente, sempre o mesmo para a mesma semente:
 * emblema, ícone com nome, carimbo, estampa espalhada, só o nome, abstrato.
 * As peças vêm de uma biblioteca (círculo, elipse, retângulo arredondado,
 * polígono, estrela, anel, arco, gota de Bézier, onda, linhas, pontos e
 * texto em várias fontes) e as cores, de um esquema de marca (monocromático,
 * complementar, tríade ou sortido), com contraste contra o fundo.
 *
 * O logo é a VERDADE: um SVG. A imagem que o vetorizador recebe sai dele, e é
 * estragada como um cliente estragaria (`estragar`): tamanho de 64 a 900 px,
 * JPEG de 30 a 95, imagem borrada (pequena e esticada), PNG limpo com ou sem
 * transparência.
 */

export function gerador(semente) {
  let s = semente >>> 0 || 1;
  const r = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entre = (a, b) => a + (b - a) * r();
  const inteiro = (a, b) => Math.floor(entre(a, b + 1));
  const um = (lista) => lista[Math.floor(r() * lista.length)];
  const chance = (p) => r() < p;
  return { r, entre, inteiro, um, chance };
}

// ==================== AS CORES ====================

function hslParaHex(h, sat, luz) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * luz - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = luz - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r1)}${hex(g1)}${hex(b1)}`;
}

function luminancia(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function esquemaDeCores(g, quantas, fundo) {
  const base = g.entre(0, 360);
  const esquema = g.um(["mono", "complementar", "triade", "analogo", "sortido", "sortido"]);
  const cores = [];
  let tentativas = 0;
  while (cores.length < quantas && tentativas++ < 200) {
    let h = base, sat = g.entre(0.45, 0.95), luz = g.entre(0.25, 0.65);
    if (esquema === "mono") { sat = g.entre(0.3, 0.9); luz = g.entre(0.15, 0.8); }
    else if (esquema === "complementar") h = base + (g.chance(0.5) ? 0 : 180) + g.entre(-12, 12);
    else if (esquema === "triade") h = base + g.um([0, 120, 240]) + g.entre(-10, 10);
    else if (esquema === "analogo") h = base + g.entre(-45, 45);
    else h = g.entre(0, 360);
    if (g.chance(0.12)) { sat = g.entre(0, 0.12); luz = g.entre(0.05, 0.9); } // cinzas e preto
    const cor = hslParaHex(h, sat, luz);
    if (fundo && contraste(cor, fundo) < 1.6) continue;
    // Duas cores da marca não ficam quase iguais (a verdade tem de ter cores
    // que se distinguem; as quase iguais da vida real vêm do JPEG).
    if (cores.some((c) => contraste(c, cor) < 1.15 && Math.abs(Number.parseInt(c.slice(1), 16) - Number.parseInt(cor.slice(1), 16)) < 0x202020)) continue;
    cores.push(cor);
  }
  return cores;
}

// ==================== AS PEÇAS ====================

const f = (v) => Number(v.toFixed(2));

function poligono(cx, cy, raio, lados, giro) {
  const p = [];
  for (let i = 0; i < lados; i++) {
    const a = giro + (i * 2 * Math.PI) / lados;
    p.push(`${f(cx + raio * Math.cos(a))},${f(cy + raio * Math.sin(a))}`);
  }
  return p.join(" ");
}

function estrela(cx, cy, r1, r2, pontas, giro) {
  const p = [];
  for (let i = 0; i < pontas * 2; i++) {
    const raio = i % 2 ? r2 : r1;
    const a = giro + (Math.PI * i) / pontas;
    p.push(`${f(cx + raio * Math.cos(a))},${f(cy + raio * Math.sin(a))}`);
  }
  return p.join(" ");
}

/** Uma gota fechada de Bézier passando por `n` pontos em volta do centro. */
function gota(g, cx, cy, raio, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n + g.entre(-0.25, 0.25);
    const rr = raio * g.entre(0.6, 1.1);
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  // Catmull-Rom fechado → Bézier
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

const PALAVRAS = ["OPTMIZE", "VETORA", "CAMISA", "ESTAMPA", "MODA", "BRASIL", "LOGO", "STUDIO", "ARTE", "FC", "2026", "SPORT",
  "CLUB", "NOVA", "PRIME", "TEXTIL", "URBAN", "VIDA", "SOL", "MAR", "Café", "Açaí", "Pão", "Loja", "Atelier", "Grupo",
  "Tech", "Kids", "Fit", "Bar", "Run", "Max", "Flow", "Zé", "Ação", "ÚNICA", "Doce", "Rock", "Jazz", "Time"];
const FONTES = ["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New", "Impact", "Trebuchet MS", "Segoe UI", "Tahoma", "Comic Sans MS"];

function texto(g, x, y, tamanho, cor, ancora = "middle") {
  const palavra = g.um(PALAVRAS);
  const fonte = g.um(FONTES);
  const peso = g.chance(0.55) ? "bold" : "normal";
  const italico = g.chance(0.15) ? ' font-style="italic"' : "";
  const espaco = g.chance(0.3) ? ` letter-spacing="${f(tamanho * g.entre(0.02, 0.15))}"` : "";
  return `<text x="${f(x)}" y="${f(y)}" font-family="${fonte}" font-weight="${peso}"${italico}${espaco} font-size="${f(tamanho)}" text-anchor="${ancora}" fill="${cor}">${palavra}</text>`;
}

function peca(g, cx, cy, raio, cor, outra) {
  const tipo = g.um(["circulo", "circulo", "elipse", "retangulo", "poligono", "estrela", "anel", "gota", "gota", "arco", "losango", "cruz"]);
  const giro = g.entre(0, Math.PI * 2);
  switch (tipo) {
    case "circulo": return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(raio)}" fill="${cor}"/>`;
    case "elipse": return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(raio)}" ry="${f(raio * g.entre(0.4, 0.85))}" transform="rotate(${f(g.entre(0, 180))} ${f(cx)} ${f(cy)})" fill="${cor}"/>`;
    case "retangulo": {
      const w = raio * g.entre(1.2, 2), h = raio * g.entre(0.7, 1.6), rx = g.chance(0.5) ? f(Math.min(w, h) * g.entre(0.05, 0.35)) : 0;
      return `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${rx}" transform="rotate(${f(g.chance(0.6) ? 0 : g.entre(-30, 30))} ${f(cx)} ${f(cy)})" fill="${cor}"/>`;
    }
    case "poligono": return `<polygon points="${poligono(cx, cy, raio, g.inteiro(3, 8), giro)}" fill="${cor}"/>`;
    case "estrela": return `<polygon points="${estrela(cx, cy, raio, raio * g.entre(0.35, 0.6), g.inteiro(4, 8), giro)}" fill="${cor}"/>`;
    case "anel": return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(raio * 0.8)}" fill="none" stroke="${cor}" stroke-width="${f(raio * g.entre(0.06, 0.3))}"/>`;
    case "gota": return `<path d="${gota(g, cx, cy, raio, g.inteiro(4, 7))}" fill="${cor}"/>`;
    case "arco": {
      const a0 = giro, a1 = giro + g.entre(1.2, 4.5), rr = raio * 0.85;
      const grande = a1 - a0 > Math.PI ? 1 : 0;
      return `<path d="M${f(cx + rr * Math.cos(a0))} ${f(cy + rr * Math.sin(a0))}A${f(rr)} ${f(rr)} 0 ${grande} 1 ${f(cx + rr * Math.cos(a1))} ${f(cy + rr * Math.sin(a1))}" fill="none" stroke="${cor}" stroke-width="${f(raio * g.entre(0.08, 0.3))}" stroke-linecap="${g.um(["round", "butt"])}"/>`;
    }
    case "losango": return `<polygon points="${poligono(cx, cy, raio, 4, Math.PI / 4 * (g.chance(0.5) ? 1 : 0))}" fill="${cor}"/>`;
    case "cruz": {
      const e = raio * g.entre(0.25, 0.45);
      return `<path d="M${f(cx - e)} ${f(cy - raio)}h${f(2 * e)}v${f(raio - e)}h${f(raio - e)}v${f(2 * e)}h${f(-(raio - e))}v${f(raio - e)}h${f(-2 * e)}v${f(-(raio - e))}h${f(-(raio - e))}v${f(-2 * e)}h${f(raio - e)}Z" fill="${outra || cor}"/>`;
    }
    default: return "";
  }
}

// ==================== O LOGO ====================

/**
 * O logo da semente: `{ svg, largura, altura, fundo, cores, tipo }`. O SVG
 * tem `width`/`height` próprios (a proporção varia) e viewBox no mesmo
 * tamanho.
 */
export function gerarLogo(semente) {
  const g = gerador(semente);
  const proporcao = g.um([1, 1, 1, 4 / 3, 3 / 2, 2, 3, 3 / 4, 2 / 3]);
  const W = 400, H = Math.round(400 / proporcao);
  const tipoDeFundo = g.um(["branco", "branco", "branco", "claro", "escuro", "colorido", "transparente", "transparente"]);
  const fundo = tipoDeFundo === "branco" ? "#ffffff"
    : tipoDeFundo === "claro" ? hslParaHex(g.entre(0, 360), g.entre(0.1, 0.5), g.entre(0.88, 0.96))
      : tipoDeFundo === "escuro" ? hslParaHex(g.entre(0, 360), g.entre(0.1, 0.5), g.entre(0.05, 0.16))
        : tipoDeFundo === "colorido" ? hslParaHex(g.entre(0, 360), g.entre(0.5, 0.9), g.entre(0.35, 0.6))
          : null;
  const cores = esquemaDeCores(g, g.inteiro(2, 7), fundo || "#ffffff");
  if (!cores.length) cores.push(fundo && luminancia(fundo) < 0.3 ? "#ffffff" : "#111111");
  const cor = () => g.um(cores);
  const tipo = g.um(["emblema", "icone-nome", "empilhado", "estampa", "nome", "abstrato", "carimbo"]);
  const corpo = [];
  const m = Math.min(W, H);
  if (tipo === "emblema" || tipo === "carimbo") {
    const cx = W / 2, cy = H / 2, R = m * g.entre(0.36, 0.46);
    corpo.push(`<circle cx="${cx}" cy="${cy}" r="${f(R)}" fill="${cores[0]}"/>`);
    if (tipo === "carimbo" || g.chance(0.6)) {
      corpo.push(`<circle cx="${cx}" cy="${cy}" r="${f(R * g.entre(0.75, 0.88))}" fill="none" stroke="${cores[1 % cores.length]}" stroke-width="${f(R * g.entre(0.03, 0.1))}"/>`);
    }
    corpo.push(peca(g, cx, cy, R * g.entre(0.35, 0.55), cores[(2 % cores.length)] || cor()));
    if (g.chance(0.5)) corpo.push(texto(g, cx, cy + R * 0.72, R * g.entre(0.14, 0.22), cores[1 % cores.length]));
  } else if (tipo === "icone-nome") {
    const R = H * g.entre(0.22, 0.32);
    corpo.push(peca(g, W * 0.2, H / 2, R, cor(), cor()));
    if (g.chance(0.4)) corpo.push(peca(g, W * 0.2 + R * 0.3, H / 2 - R * 0.3, R * 0.45, cor(), cor()));
    corpo.push(texto(g, W * 0.4, H / 2 + H * 0.08, H * g.entre(0.16, 0.26), cor(), "start"));
  } else if (tipo === "empilhado") {
    const R = m * g.entre(0.18, 0.26);
    corpo.push(peca(g, W / 2, H * 0.38, R, cor(), cor()));
    corpo.push(texto(g, W / 2, H * 0.8, m * g.entre(0.11, 0.17), cor()));
  } else if (tipo === "estampa") {
    const n = g.inteiro(4, 12);
    for (let i = 0; i < n; i++) corpo.push(peca(g, g.entre(0.12, 0.88) * W, g.entre(0.12, 0.88) * H, m * g.entre(0.05, 0.16), cor(), cor()));
  } else if (tipo === "nome") {
    corpo.push(texto(g, W / 2, H / 2 + m * 0.1, m * g.entre(0.2, 0.32), cor()));
    if (g.chance(0.5)) corpo.push(`<rect x="${f(W * 0.15)}" y="${f(H / 2 + m * 0.18)}" width="${f(W * 0.7)}" height="${f(m * g.entre(0.015, 0.05))}" fill="${cor()}"/>`);
  } else {
    const n = g.inteiro(2, 5);
    for (let i = 0; i < n; i++) corpo.push(peca(g, g.entre(0.25, 0.75) * W, g.entre(0.25, 0.75) * H, m * g.entre(0.12, 0.32), cor(), cor()));
  }
  // Detalhe fino de vez em quando: pontos, linha, onda.
  if (g.chance(0.3)) {
    const n = g.inteiro(3, 9), y = H * g.entre(0.1, 0.92), c = cor();
    for (let i = 0; i < n; i++) corpo.push(`<circle cx="${f(W * (0.15 + (0.7 * i) / Math.max(1, n - 1)))}" cy="${f(y)}" r="${f(m * g.entre(0.008, 0.025))}" fill="${c}"/>`);
  }
  if (g.chance(0.2)) {
    const y = H * g.entre(0.1, 0.9), a = m * g.entre(0.02, 0.08);
    corpo.push(`<path d="M${f(W * 0.08)} ${f(y)}Q${f(W * 0.27)} ${f(y - a)} ${f(W * 0.5)} ${f(y)}T${f(W * 0.92)} ${f(y)}" fill="none" stroke="${cor()}" stroke-width="${f(m * g.entre(0.008, 0.03))}"/>`);
  }
  const fundoSvg = fundo ? `<rect width="${W}" height="${H}" fill="${fundo}"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fundoSvg}${corpo.join("")}</svg>`;
  return { svg, largura: W, altura: H, fundo, cores: cores.length + (fundo ? 1 : 0), tipo };
}

/**
 * Como o cliente estraga: `{ lado, jeito, qualidade }` sorteados pela semente.
 * O lado (o maior) é log-uniforme de 64 a 900 px; o jeito é PNG limpo, JPEG
 * ou borrado (um quarto a metade do lado, esticado de volta, e JPEG).
 */
export function sortearEstrago(semente, temTransparencia) {
  const g = gerador(semente ^ 0x9e3779b9);
  const lado = Math.round(Math.exp(g.entre(Math.log(64), Math.log(900))));
  let jeito = g.um(["png", "jpeg", "jpeg", "jpeg", "borrado"]);
  if (temTransparencia && jeito !== "png" && g.chance(0.6)) jeito = "png";
  return {
    lado,
    jeito,
    qualidade: Math.round(g.entre(30, 95)),
    reducao: g.entre(2, 4),
  };
}
