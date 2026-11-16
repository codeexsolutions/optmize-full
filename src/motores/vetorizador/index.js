/**
 * ===========================================================================
 * O VETORIZADOR DO OPTMIZE — imagem entra, vetor sai
 * ===========================================================================
 *
 * O motor próprio de vetorização (2026-11-12). Cinco passos, cada um no seu
 * arquivo:
 *
 *   paleta.js   as cores de verdade da arte (OKLab, só o miolo, quantidade
 *               automática)
 *   regioes.js  cada pixel na cor mais próxima; as manchas; o cisco e a
 *               franja do serrilhado absorvidos pela vizinha
 *   mapa.js     o mapa planar: cada divisa entre duas regiões, uma vez só
 *   curvas.js   a escada de cada divisa vira reta ou Bézier, com as quinas
 *               no lugar
 *   montar.js   cada região fecha o contorno com as divisas dela; o SVG
 *
 * A IA entra ANTES daqui, na tela: a imagem PEQUENA passa pela rede de
 * ampliação do programa (Real-ESRGAN, a mesma do Extrator), que recupera a
 * cor e a borda fina que o JPEG apagou — e o vetor sai no tamanho original
 * (`escala`). Na imagem BORRADA a rede não ajuda (inventa halo e faceta);
 * quem cuida dela é o próprio motor, que mede a largura da borda
 * (`larguraDaBorda`) e põe a franja, o ruído e as quinas nessa escala.
 *
 * As medições, caso a caso, saem de `npm run bancada:vetorizador`; o caminho
 * da tela inteira (com a IA e o PDF), de `npm run bancada:vetorizar-tela`.
 *
 * Nada aqui toca em `document` ou `window`: roda no Web Worker
 * (`vetorizadorWorker.js`) e na bancada (`bancada/conferir-vetorizador.mjs`).
 */

import { acharPaleta, medirMiolo } from "./paleta";
import { TRANSPARENTE, desmisturar, limparRegioes, rotularPixels, separarRegioes } from "./regioes";
import { FORA, cadeiasDoMapa } from "./mapa";
import { ajustarCadeia } from "./curvas";
import { aneisDasRegioes, caminhoDosAneis, caminhosDaCostura, empilhar, escreverSvg } from "./montar";

const entre = (a, b, t) => a + (b - a) * t;
const preso = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Os ajustes que a tela mostra, traduzidos para o motor.
 *
 *   detalhe    0–100: mais detalhe = mais cores no automático, ciscos menores
 *              ficam, a curva passa mais perto dos pontos
 *   suavidade  0–100: mais suave = alisamento maior e só canto bem vivo vira
 *              quina
 */
export function parametros(opcoes, largura, altura, borrao = 1) {
  const detalhe = preso(opcoes.detalhe == null ? 50 : opcoes.detalhe, 0, 100) / 100;
  const suavidade = preso(opcoes.suavidade == null ? 50 : opcoes.suavidade, 0, 100) / 100;
  const area = largura * altura;
  // A imagem ampliada (pela IA) tem `fator` pixels para cada pixel do
  // original: as tolerâncias são medidas no ORIGINAL, senão o ajuste copia
  // cada ondinha da ampliação (medido: 1.251 nós em vez de 83). A imagem
  // BORRADA é o mesmo caso sem ninguém avisar: a borda leva `borrao` pixels
  // para ir de uma cor à outra (ver `larguraDaBorda`), e a franja, o ruído
  // da posição da borda e a quina mais fina que dá para achar crescem junto.
  const daEscala = opcoes.escala > 0 && opcoes.escala < 1 ? 1 / opcoes.escala : 1;
  const fator = Math.max(daEscala, borrao);
  // O cisco da imagem borrada (o ruído do JPEG no degradê da borda) tem a
  // área da borda ao quadrado; a ampliação da IA já está na área da imagem.
  const doBorrao = fator / daEscala;
  return {
    fator,
    daEscala,
    tolerancia: entre(0.075, 0.022, detalhe),
    areaMinima: Math.max(2, Math.round(area * 10 ** (-3.4 - 1.6 * detalhe) * doBorrao * doBorrao)),
    // Com a borda no subpixel o ruído da escada some, e a curva pode passar
    // bem mais perto dos pontos sem copiar serrilhado.
    tolCurva: entre(0.9, 0.3, detalhe) * fator,
    tolReta: entre(0.5, 0.2, detalhe) * fator,
    sigma: entre(0.3, 1.6, suavidade) * fator,
    quina: entre(40, 78, suavidade),
    retaMinima: Math.max(6, Math.round(Math.min(largura, altura) * 0.02)),
  };
}

/**
 * A BORDA NO SUBPIXEL (ver o passo 1 de `curvas.js`).
 *
 * Um passo da escada separa um pixel da região da esquerda de um da direita.
 * A fração de cada um coberta pela cor da ESQUERDA sai da cor dele: a
 * projeção do OKLab do pixel no segmento entre as duas cores da paleta (o
 * anti-serrilhado é uma mistura linear das duas) — ou do alfa, quando o
 * outro lado é o fundo transparente. Se a borda passa a `u` do centro do
 * pixel da esquerda (0 a 1, com a rachadura em 0,5), a cobertura dele é
 * mín(1, u + 0,5) e a do vizinho máx(0, u − 0,5); somadas, dão u + 0,5 nos
 * dois casos. O deslocamento da borda a partir da rachadura é
 * `cobertura da esquerda + cobertura da direita − 1`.
 */
function criarAfinador(px, lab, largura, altura, regiao, rotuloDa, cores, corDoFundo = null) {
  const pixel = (x, y) => (x < 0 || y < 0 || x >= largura || y >= altura ? -1 : y * largura + x);
  // O fundo que a pessoa mandou tirar continua com a cor dele nos pixels: a
  // borda contra ele se mede pela cor, como entre duas cores, e não pelo alfa.
  const corDe = (r) => (r >= 0 ? cores[r] : (r === TRANSPARENTE && corDoFundo ? corDoFundo : null));
  const cobertura = (i, re, rd) => {
    const opaco = px[i * 4 + 3] >= 250;
    if ((re >= 0 && rd >= 0) || (opaco && corDe(re) && corDe(rd))) {
      const A = corDe(re), B = corDe(rd);
      const vx = A.L - B.L, vy = A.a - B.a, vz = A.b - B.b;
      const len2 = vx * vx + vy * vy + vz * vz;
      // Cores parecidas demais não dizem onde a borda passa.
      if (len2 < 0.0036) return null;
      const t = ((lab[i * 3] - B.L) * vx + (lab[i * 3 + 1] - B.a) * vy + (lab[i * 3 + 2] - B.b) * vz) / len2;
      return preso(t, 0, 1);
    }
    if (re >= 0 && rd === TRANSPARENTE) return px[i * 4 + 3] / 255;
    if (re === TRANSPARENTE && rd >= 0) return 1 - px[i * 4 + 3] / 255;
    return null;
  };
  return (x0, y0, dx, dy) => {
    let pe, pd;
    if (dx === 1) { pe = pixel(x0, y0 - 1); pd = pixel(x0, y0); }
    else if (dy === 1) { pe = pixel(x0, y0); pd = pixel(x0 - 1, y0); }
    else if (dx === -1) { pe = pixel(x0 - 1, y0); pd = pixel(x0 - 1, y0 - 1); }
    else { pe = pixel(x0 - 1, y0 - 1); pd = pixel(x0, y0 - 1); }
    if (pe < 0 || pd < 0) return 0;
    const re = rotuloDa[regiao[pe]], rd = rotuloDa[regiao[pd]];
    const te = cobertura(pe, re, rd);
    const td = cobertura(pd, re, rd);
    if (te == null || td == null) return 0;
    return preso(te + td - 1, -0.5, 0.5);
  };
}

/**
 * O fundo liso que encosta na moldura vira transparente: o rótulo mais comum
 * na borda da imagem, e só as manchas dele que tocam a borda.
 */
function tirarFundo(rotulos, largura, altura) {
  const conta = new Map();
  const borda = [];
  for (let x = 0; x < largura; x++) borda.push(x, (altura - 1) * largura + x);
  for (let y = 1; y < altura - 1; y++) borda.push(y * largura, y * largura + largura - 1);
  for (const i of borda) if (rotulos[i] >= 0) conta.set(rotulos[i], (conta.get(rotulos[i]) || 0) + 1);
  let fundo = -1, max = 0;
  for (const [r, n] of conta) if (n > max) { max = n; fundo = r; }
  if (fundo < 0 || max < borda.length * 0.3) return -1;
  const pilha = borda.filter((i) => rotulos[i] === fundo);
  for (const i of pilha) rotulos[i] = TRANSPARENTE;
  while (pilha.length) {
    const i = pilha.pop();
    const x = i % largura;
    const viz = [x > 0 ? i - 1 : -1, x + 1 < largura ? i + 1 : -1, i - largura, i + largura];
    for (const j of viz) {
      if (j >= 0 && j < rotulos.length && rotulos[j] === fundo) { rotulos[j] = TRANSPARENTE; pilha.push(j); }
    }
  }
  return fundo;
}

/**
 * A LARGURA DA BORDA — quantos pixels a imagem leva para ir de uma cor à
 * outra; 1 numa arte nítida, 4 num logo pequeno esticado 4× (o "logo borrado
 * da internet").
 *
 * Em cada divisa entre dois rótulos de luminância bem diferente (|ΔL| > 0,15),
 * os dois pixels vizinhos são postos na escala de A até B pela LUMINÂNCIA
 * (t = 0 em A, 1 em B). Na borda nítida o salto de t entre eles é grande —
 * no máximo um pixel de antisserrilhado no meio, salto de 0,5 a 1; na borda
 * esticada em w pixels o salto é uns 1/w. A largura é 1 ÷ a mediana dos
 * saltos, normalizada pela da borda nítida (0,75).
 *
 * Só a luminância, de propósito: o JPEG guarda a cor na METADE da resolução
 * (4:2:0), e toda borda de cor sairia "borrada" sem a imagem ser.
 */
export function larguraDaBorda(lab, rotulos, largura, altura, cores) {
  const BALDES = 200;
  const hist = new Uint32Array(BALDES + 1);
  let quantos = 0;
  const salto = (i, j) => {
    const a = rotulos[i], b = rotulos[j];
    if (a < 0 || b < 0 || a === b) return;
    const La = cores[a].L, dL = cores[b].L - La;
    if (Math.abs(dL) < 0.15) return;
    const s = ((lab[j * 3] - La) - (lab[i * 3] - La)) / dL;
    hist[Math.round(preso(s, 0, 1) * BALDES)]++;
    quantos++;
  };
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (x + 1 < largura) salto(i, i + 1);
      if (y + 1 < altura) salto(i, i + largura);
    }
  }
  if (quantos < 50) return 1;
  let acumulado = 0, k = 0;
  while (k < BALDES && acumulado + hist[k] < quantos / 2) acumulado += hist[k++];
  // Piso de 0,05: a borda mais larga que se mede é de 15 pixels (o logo
  // borrado que ainda passou pela ampliação 4×).
  const mediana = Math.max(0.05, k / BALDES);
  return 0.75 / mediana;
}

/**
 * Vetoriza.
 *
 * `px`: RGBA (Uint8ClampedArray ou Uint8Array), `largura` × `altura`.
 * `opcoes`: `cores` (número fixo, ou nada para automático), `detalhe`,
 * `suavidade`, `semFundo`, `costura` (padrão true), `escala` (o vetor sai
 * multiplicado por ela — 0,25 quando a imagem foi ampliada 4×).
 * `aoAndar(fase, fracao)`: o andamento, para a tela.
 *
 * Devolve `{ svg, formas, paleta, estatisticas }`, ou `{ erro }`.
 */
export function vetorizar(px, largura, altura, opcoes = {}, aoAndar = () => {}) {
  const t0 = Date.now();
  const p0 = parametros(opcoes, largura, altura);
  const escala = opcoes.escala > 0 ? opcoes.escala : 1;

  aoAndar("cores", 0.05);
  const medida = medirMiolo(px, largura, altura, 0.035, Math.max(1, Math.round(p0.fator)));
  const { cores, doMiolo } = acharPaleta(px, largura, altura, medida, {
    cores: opcoes.cores, tolerancia: p0.tolerancia, maximo: opcoes.maximoDeCores || 24,
  });
  if (!cores.length) return { erro: "A imagem está vazia ou toda transparente." };

  aoAndar("regiões", 0.2);
  let rotulos = rotularPixels(px, medida.lab, largura, altura, cores);
  // A borda borrada pede franja, ruído e quina na escala dela (ver
  // `larguraDaBorda`); abaixo de 1,25 a borda é nítida e nada muda. O teto
  // de 4 pixels do original (16 na imagem ampliada 4×) segura a medida de
  // uma imagem que não é arte (foto, degradê) longe do absurdo.
  const medidaDaBorda = opcoes.borrao > 0 ? opcoes.borrao : larguraDaBorda(medida.lab, rotulos, largura, altura, cores);
  const borrao = medidaDaBorda < 1.25 ? 1 : Math.min(4 * p0.daEscala, medidaDaBorda);
  const p = parametros(opcoes, largura, altura, borrao);
  // A franja grudada numa região de verdade (ver `desmisturar`).
  if (opcoes.desmisturar !== false) rotulos = desmisturar(rotulos, medida.lab, largura, altura, cores, Math.max(1, Math.round(borrao)));
  const fundoTirado = opcoes.semFundo ? tirarFundo(rotulos, largura, altura) : -1;
  const tirouFundo = fundoTirado >= 0;
  // A franja de antisserrilhado tem a largura da BORDA desta imagem (medida:
  // `borrao`) — e não o fator da ampliação. A rede de ampliação entrega a
  // borda nítida (medida ~1,2 px na imagem ampliada); com a espessura mínima
  // multiplicada pelo fator (4), o traço fino de verdade — o acento do "ó",
  // o pingo do "i" — era tomado por franja e sumia do vetor da IA.
  rotulos = limparRegioes(rotulos, largura, altura, cores, { areaMinima: p.areaMinima, espessuraMinima: 1.2 * borrao });
  const { regiao, rotuloDa, areaDa, quantas } = separarRegioes(rotulos, largura, altura);

  aoAndar("divisas", 0.4);
  const cadeias = cadeiasDoMapa(regiao, largura, altura);
  const desenhada = (id) => id >= 0 && rotuloDa[id] >= 0;

  aoAndar("curvas", 0.55);
  const afinar = opcoes.subpixel === false ? null
    : criarAfinador(px, medida.lab, largura, altura, regiao, rotuloDa, cores, fundoTirado >= 0 ? cores[fundoTirado] : null);
  const ajustes = cadeias.map((c) => (desenhada(c.esq) || desenhada(c.dir)
    ? ajustarCadeia(c.pontos, c.fechada, p, afinar) : null));

  aoAndar("montagem", 0.85);
  const aneis = aneisDasRegioes(cadeias, ajustes, desenhada);
  // Empilhado (padrão): de fora para dentro, sem recortar o furo que a forma
  // de cima cobre. `empilhar: false` recorta tudo — cada forma exata e
  // sozinha, que é o que o corte em plotter quer.
  const empilhado = opcoes.empilhar === false ? null : empilhar(aneis, cadeias, desenhada, areaDa, FORA);
  const ordem = empilhado ? empilhado.ordem : [...aneis.keys()].sort((a, b) => areaDa[b] - areaDa[a]);
  const formas = ordem.map((id) => ({
    cor: cores[rotuloDa[id]].hex,
    d: caminhoDosAneis(empilhado ? empilhado.aneisDesenhados.get(id) : aneis.get(id), ajustes, escala),
    area: areaDa[id],
  }));
  const costura = opcoes.costura === false ? null
    : caminhosDaCostura(cadeias, ajustes, desenhada, (id) => cores[rotuloDa[id]].hex, escala,
      empilhado ? empilhado.cobertas : null);
  const svg = escreverSvg({ largura: largura * escala, altura: altura * escala, formas, costura, larguraTraco: escala });

  // A paleta que ficou no desenho, com a área de cada cor.
  const areaDaCor = new Float64Array(cores.length);
  for (let id = 0; id < quantas; id++) if (rotuloDa[id] >= 0) areaDaCor[rotuloDa[id]] += areaDa[id];
  const paleta = cores.map((c, k) => ({ hex: c.hex, rgb: c.rgb, area: areaDaCor[k] })).filter((c) => c.area > 0);
  const nos = ajustes.reduce((t, a) => t + (a ? a.segs.length : 0), 0);

  aoAndar("pronto", 1);
  return {
    svg,
    formas,
    // O traço da costura por cor, para quem desenha o vetor sem o SVG (o
    // visor da tela, em canvas): mesma largura (`larguraTraco`) e por baixo.
    costura: costura ? [...costura].map(([cor, d]) => ({ cor, d })) : [],
    larguraTraco: escala,
    paleta,
    estatisticas: {
      cores: paleta.length,
      formas: formas.length,
      divisas: ajustes.filter(Boolean).length,
      nos,
      bytes: svg.length,
      ms: Date.now() - t0,
      paletaDoMiolo: doMiolo,
      tirouFundo,
      borda: Math.round(medidaDaBorda * 100) / 100,
      largura: largura * escala,
      altura: altura * escala,
    },
  };
}
