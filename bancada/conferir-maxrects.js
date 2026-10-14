#!/usr/bin/env node
/**
 * Confere que o MaxRects acelerado encaixa EXATAMENTE como o de antes.
 *
 * O motor de caixa (`encaixar`, em encaixeMotor.js) passou a gastar um quinto
 * do tempo da busca no perfil — quase todo em lixo de memória (`concat` dentro
 * do laço, arrays para descrever as pegadas) e na limpeza que comparava todo
 * livre contra todo livre. A versão nova tira isso sem mudar a conta. "Sem
 * mudar a conta" aqui quer dizer IDÊNTICO: mesma posição, mesmo giro, mesma
 * bancada, mesmo consumo, mesmas peças de fora — peça por peça. A ordem da
 * lista de livres também tem que ser a mesma, porque é ela que desempata duas
 * posições iguais.
 *
 * A referência é a versão de antes, copiada aqui como estava (o laço com
 * `concat`, o `pontuar` devolvendo array, a limpeza todos-contra-todos). Ela
 * não é usada em lugar nenhum além desta conferência.
 *
 * O que varia: largura do rolo, folga, bancada, giro, tamanho e quantidade das
 * peças, a heurística e a ordem. Milhares de encaixes sorteados — o sorteio tem
 * semente fixa, então uma falha se repete.
 *
 *   node bancada/conferir-maxrects.js
 */

const { carregarMotor } = require("./motor");

// ==================== A REFERÊNCIA: O MAXRECTS DE ANTES ====================

function criarPackerAntigo(largura, alturaMax, bancada) {
  if (!bancada) {
    return { largura, alturaMax, livres: [{ x: 0, y: 0, w: largura, h: alturaMax, bancada: 0 }] };
  }
  const quantas = Math.max(1, Math.min(bancada.maximo, Math.ceil(alturaMax / bancada.periodo)));
  const livres = [];
  for (let k = 0; k < quantas; k++) {
    livres.push({ x: 0, y: k * bancada.periodo, w: largura, h: bancada.altura, bancada: k });
  }
  return { largura, alturaMax, livres };
}

function pontuarAntigo(livre, w, h, heuristica) {
  const sobraX = livre.w - w;
  const sobraY = livre.h - h;
  const menorSobra = Math.min(sobraX, sobraY);
  const maiorSobra = Math.max(sobraX, sobraY);
  switch (heuristica) {
    case "bl": return [livre.y + h, livre.x];
    case "bssf": return [menorSobra, maiorSobra];
    case "blsf": return [maiorSobra, menorSobra];
    default: return [livre.w * livre.h - w * h, menorSobra];
  }
}

function melhorPosicaoAntiga(packer, w, h, podeGirar, heuristica) {
  let melhor = null;
  packer.livres.forEach((livre) => {
    const tentativas = podeGirar
      ? [{ w, h, girado: false }, { w: h, h: w, girado: true }]
      : [{ w, h, girado: false }];
    tentativas.forEach((t) => {
      if (t.w > livre.w + 1e-9 || t.h > livre.h + 1e-9) return;
      const [p1, p2] = pontuarAntigo(livre, t.w, t.h, heuristica);
      if (melhor && !(p1 < melhor.p1 - 1e-9 || (Math.abs(p1 - melhor.p1) < 1e-9 && p2 < melhor.p2 - 1e-9))) return;
      melhor = { x: livre.x, y: livre.y, w: t.w, h: t.h, girado: t.girado, p1, p2, bancada: livre.bancada };
    });
  });
  return melhor;
}

function recortarAntigo(livre, usado) {
  const semSobreposicao =
    usado.x >= livre.x + livre.w || usado.x + usado.w <= livre.x ||
    usado.y >= livre.y + livre.h || usado.y + usado.h <= livre.y;
  if (semSobreposicao) return [livre];
  const sobras = [];
  const b = livre.bancada;
  if (usado.y > livre.y) sobras.push({ x: livre.x, y: livre.y, w: livre.w, h: usado.y - livre.y, bancada: b });
  if (usado.y + usado.h < livre.y + livre.h) {
    const y = usado.y + usado.h;
    sobras.push({ x: livre.x, y, w: livre.w, h: livre.y + livre.h - y, bancada: b });
  }
  if (usado.x > livre.x) sobras.push({ x: livre.x, y: livre.y, w: usado.x - livre.x, h: livre.h, bancada: b });
  if (usado.x + usado.w < livre.x + livre.w) {
    const x = usado.x + usado.w;
    sobras.push({ x, y: livre.y, w: livre.x + livre.w - x, h: livre.h, bancada: b });
  }
  return sobras.filter((r) => r.w > 1e-9 && r.h > 1e-9);
}

function contidoAntigo(a, b) {
  return a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 &&
    a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
}

function ocuparAntigo(packer, usado) {
  let livres = [];
  packer.livres.forEach((livre) => { livres = livres.concat(recortarAntigo(livre, usado)); });
  packer.livres = livres.filter((r, i) => !livres.some((outro, j) => j !== i && contidoAntigo(r, outro)));
}

function encaixarAntigo(motor, itens, config) {
  const { larguraTecido, espaco, alturaMax } = config;
  const packer = criarPackerAntigo(larguraTecido + espaco, alturaMax,
    motor.bancadaEmCentimetros(config, itens.length));
  const posicoes = [];
  const naoEncaixadas = [];
  let consumo = 0;
  itens.forEach((item) => {
    const w = item.largura + espaco;
    const h = item.altura + espaco;
    const cabeDeitada = motor.podeDeitar(item) && item.altura <= larguraTecido;
    if (item.largura > larguraTecido && !cabeDeitada) { naoEncaixadas.push(item); return; }
    const pos = melhorPosicaoAntiga(packer, w, h, motor.podeDeitar(item), config.heuristica);
    if (!pos) { naoEncaixadas.push(item); return; }
    ocuparAntigo(packer, { x: pos.x, y: pos.y, w: pos.w, h: pos.h });
    posicoes.push({
      item, x: pos.x, y: pos.y,
      largura: pos.girado ? item.altura : item.largura,
      altura: pos.girado ? item.largura : item.altura,
      girado: pos.girado, bancada: pos.bancada || 0,
    });
    consumo = Math.max(consumo, pos.y + pos.h);
  });
  return { posicoes, naoEncaixadas, consumo: consumo > 0 ? consumo - espaco : 0 };
}

// ==================== O SORTEIO DOS TRABALHOS ====================

function sorteio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Medidas "redondas" (meio centímetro) e quebradas, porque são as quebradas
// que exercitam a folga de 1e-9 nas comparações.
function medida(rnd) {
  return rnd() < 0.5 ? Math.round((2 + rnd() * 70) * 2) / 2 : 1 + rnd() * 75;
}

function trabalhoSorteado(rnd) {
  const larguraTecido = [60, 100, 150, 160, 178.5][Math.floor(rnd() * 5)];
  const espaco = [0, 0.3, 0.5, 1, 1.5][Math.floor(rnd() * 5)];
  const comprimentoBancada = rnd() < 0.3 ? [80, 150, 200][Math.floor(rnd() * 3)] : 0;
  // Um em cada cinco é lote grande: é com muita peça que a lista de livres
  // cresce e a limpeza mais trabalha.
  const grande = rnd() < 0.2;
  const formatos = 1 + Math.floor(rnd() * (grande ? 10 : 6));
  const itens = [];
  for (let f = 0; f < formatos; f++) {
    const largura = medida(rnd);
    const altura = medida(rnd);
    const giro = ["fixa", "180", "livre"][Math.floor(rnd() * 3)];
    const qtd = 1 + Math.floor(rnd() * (grande ? 30 : 12));
    for (let q = 0; q < qtd; q++) itens.push({ indice: f, copia: q, largura, altura, giro });
  }
  for (let i = itens.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [itens[i], itens[j]] = [itens[j], itens[i]];
  }
  const alturaMax = itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + espaco, 0);
  return { larguraTecido, espaco, comprimentoBancada, alturaMax, itens };
}

const resumo = (r) => JSON.stringify({
  consumo: r.consumo,
  fora: r.naoEncaixadas.map((i) => `${i.indice}.${i.copia}`),
  pos: r.posicoes.map((p) => [`${p.item.indice}.${p.item.copia}`, p.x, p.y, p.girado, p.bancada, p.largura, p.altura]),
});

// ==================== A CONFERÊNCIA ====================

(async () => {
  const motor = await carregarMotor({ comWasm: false });
  const rnd = sorteio(20261014);
  const TRABALHOS = 600;
  let encaixes = 0;
  let pecas = 0;
  let msAntes = 0;
  let msAgora = 0;

  for (let t = 0; t < TRABALHOS; t++) {
    const trabalho = trabalhoSorteado(rnd);
    for (const heuristica of motor.HEURISTICAS_RETANGULO) {
      const config = { ...trabalho, heuristica };
      let ini = performance.now();
      const antes = encaixarAntigo(motor, trabalho.itens, config);
      msAntes += performance.now() - ini;
      ini = performance.now();
      const agora = motor.encaixar(trabalho.itens, config);
      msAgora += performance.now() - ini;
      if (resumo(antes) !== resumo(agora)) {
        console.error(`DIFERENTE no trabalho ${t}, heurística ${heuristica}:`);
        console.error("  largura", trabalho.larguraTecido, "folga", trabalho.espaco,
          "bancada", trabalho.comprimentoBancada, "peças", trabalho.itens.length);
        console.error("  antes ", resumo(antes).slice(0, 400));
        console.error("  agora ", resumo(agora).slice(0, 400));
        process.exit(1);
      }
      encaixes++;
      pecas += trabalho.itens.length;
    }
  }

  console.log(`ok · ${encaixes} encaixes, ${pecas} peças: idênticos peça por peça`);
  console.log(`tempo: antes ${msAntes.toFixed(0)} ms · agora ${msAgora.toFixed(0)} ms · `
    + `${(msAntes / msAgora).toFixed(1)}x mais rápido`);
  process.exit(0);
})();
