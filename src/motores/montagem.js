/**
 * ===========================================================================
 * MONTAGEM — as contas do molde montado
 * ===========================================================================
 *
 * A tela de Montagem (`telas/Montagem.tsx`) edita um molde da estante: o risco
 * em nós com alça, e as marcações — piques, pontos, fio, margem, espelhar. Aqui
 * mora tudo o que é conta, para a tela só desenhar e para a bancada conferir.
 * Ver docs/superpowers/specs/2026-09-26-montagem-de-moldes-design.md.
 *
 * ---------------------------------------------------------------------------
 * O PIQUE MORA NO TRAÇO, NÃO NO PAPEL
 * ---------------------------------------------------------------------------
 *
 * Um pique não é um (x, y): é "no trecho que começa no nó tal, na posição t".
 * Assim, quando a pessoa arrasta um nó, o pique vai junto com o traço em vez
 * de ficar flutuando onde a curva estava — e, na graduação (parte 2), cada
 * tamanho leva o pique no lugar certo sem ninguém remarcar.
 *
 * O preço é remapear quando a lista de nós muda: pôr nó no meio de um trecho
 * parte o trecho em dois (e o `t` do pique precisa saber em qual metade caiu),
 * e apagar um nó junta dois trechos.
 *
 * ---------------------------------------------------------------------------
 * O QUE VAI PARA O BANCO É O CORTE
 * ---------------------------------------------------------------------------
 *
 * `pecaParaGravar` calcula o `contorno` — risco achatado + margem — e encosta
 * TUDO no canto do corte, porque é assim que o resto do programa lê um molde:
 * contorno relativo ao canto da peça, de 0 até a largura. O Encaixe e a
 * estampa não sabem que existe risco, margem ou pique, e não precisam saber.
 */

import { achatarCurvas } from "./ajusteDeCurvas";
import { areaComSinalDe, margemDeCostura } from "./margemDeCostura";
import { apagarNo, inserirNoNoTraco, pontoNoTrecho } from "./edicaoDeNos";

/** Meio centímetro: o pique que a tesoura faz sem pensar. */
export const PROFUNDIDADE_DO_PIQUE = 0.5;

const arredondar = (v, casas = 4) => Number(v.toFixed(casas));

/** O que a pessoa digitou num campo de cm. Vírgula vale ponto; vazio é zero. */
export function lerCm(texto) {
  const limpo = String(texto ?? "").trim().replace(",", ".");
  if (limpo === "") return 0;
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

export function caixaDe(pontos) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of pontos) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, largura: maxX - minX, altura: maxY - minY };
}

/** Um polígono (molde de DXF, contorno de corte) como nós de canto e reta. */
export function nosDoPoligono(pontos) {
  return pontos.map((p) => ({
    x: p.x, y: p.y, entrada: { x: p.x, y: p.y }, saida: { x: p.x, y: p.y }, canto: true, retaDepois: true,
  }));
}

export function marcacoesPadrao(nos) {
  const c = caixaDe(achatarCurvas(nos));
  return {
    margem: 0,
    espelhar: false,
    fio: {
      x: arredondar(c.minX + c.largura / 2),
      y: arredondar(c.minY + c.altura / 2),
      angulo: 0,
      comprimento: arredondar(c.altura * 0.6, 2),
    },
    piques: [],
    pontos: [],
  };
}

/** Uma peça do banco pronta para a mesa: sempre com nós e marcações. */
export function pecaParaMontar(peca) {
  const nos = Array.isArray(peca.nos) && peca.nos.length >= 3 ? peca.nos : nosDoPoligono(peca.contorno);
  const marcacoes = peca.marcacoes ?? marcacoesPadrao(nos);
  return { ...peca, nos, marcacoes };
}

/** A derivada da cúbica em `t` — a direção do traço naquele ponto. */
function derivada(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/** Onde o pique está, e para que lado é "fora" da peça ali. */
export function posicaoDoPique(nos, pique) {
  const a = nos[pique.no];
  const b = nos[(pique.no + 1) % nos.length];
  const ponto = pontoNoTrecho(nos, pique.no, pique.t);
  let d = a.retaDepois ? { x: b.x - a.x, y: b.y - a.y } : derivada(a, a.saida, b.entrada, b, pique.t);
  // Alça em cima do nó zera a derivada na ponta; a corda dá a direção certa.
  if (Math.hypot(d.x, d.y) < 1e-9) d = { x: b.x - a.x, y: b.y - a.y };
  const comprimento = Math.hypot(d.x, d.y) || 1;
  const sinal = areaComSinalDe(achatarCurvas(nos)) >= 0 ? 1 : -1;
  return { ponto, fora: { x: (sinal * d.y) / comprimento, y: (-sinal * d.x) / comprimento } };
}

/**
 * Põe um nó no trecho `i`, em `t`, e leva os piques junto.
 *
 * A divisão de Casteljau preserva o parâmetro: o ponto em `tp` da curva
 * original é o ponto em `tp / t` da primeira metade, e em `(tp − t) / (1 − t)`
 * da segunda. Por isso aqui o remapeamento é EXATO, e a bancada confere.
 */
export function inserirNoNaPeca(peca, i, t) {
  const nos = inserirNoNoTraco(peca.nos, i, t);
  const piques = peca.marcacoes.piques.map((p) => {
    if (p.no < i) return p;
    if (p.no > i) return { ...p, no: p.no + 1 };
    return p.t < t ? { ...p, t: p.t / t } : { ...p, no: i + 1, t: (p.t - t) / (1 - t) };
  });
  return { ...peca, nos, marcacoes: { ...peca.marcacoes, piques } };
}

/**
 * Apaga o nó `i` e leva os piques para o trecho que sobra.
 *
 * Os dois trechos que encostavam no nó viram um só. O pique do primeiro fica
 * na primeira metade do trecho novo, o do segundo na segunda. Aqui é
 * aproximado — o trecho novo tem outra forma —, mas o pique continua no
 * traço e na mesma ordem, que é o que importa para costurar.
 */
export function apagarNoDaPeca(peca, i) {
  const nos = apagarNo(peca.nos, i);
  if (!nos) return null;
  const n = peca.nos.length;
  const anterior = (i - 1 + n) % n;
  const piques = peca.marcacoes.piques.map((p) => {
    let no = p.no;
    let t = p.t;
    if (no === anterior) t = t / 2;
    else if (no === i) { no = anterior; t = 0.5 + t / 2; }
    if (no > i) no -= 1;
    return { ...p, no, t };
  });
  return { ...peca, nos, marcacoes: { ...peca.marcacoes, piques } };
}

/**
 * A peça como vai para o banco: `contorno` = corte, tudo encostado no canto.
 * `{ erro }` quando a margem não tem resposta (ver `margemDeCostura`).
 */
export function pecaParaGravar(peca) {
  const margem = peca.marcacoes.margem;
  const corte = margemDeCostura(achatarCurvas(peca.nos), margem);
  if (!corte) {
    return {
      erro: margem > 0
        ? `a margem de ${String(margem).replace(".", ",")} cm fecha a peça sobre ela mesma — diminua a margem`
        : "o risco da peça tem menos de três pontos",
    };
  }
  const c = caixaDe(corte);
  const mover = (p) => ({ x: arredondar(p.x - c.minX), y: arredondar(p.y - c.minY) });
  const nos = peca.nos.map((n) => ({ ...n, ...mover(n), entrada: mover(n.entrada), saida: mover(n.saida) }));
  return {
    peca: {
      ...peca,
      nos,
      marcacoes: {
        ...peca.marcacoes,
        fio: { ...peca.marcacoes.fio, ...mover(peca.marcacoes.fio) },
        pontos: peca.marcacoes.pontos.map(mover),
      },
      contorno: corte.map(mover),
      largura: arredondar(c.largura, 2),
      altura: arredondar(c.altura, 2),
    },
  };
}

/**
 * As peças como o Encaixe as recebe: a espelhada vira uma peça a mais.
 *
 * O espelho é no CONTORNO (x → largura − x), e a ordem é invertida para a
 * volta continuar no mesmo sentido. A arte entra no contorno espelhado como
 * entra em qualquer outro. Com quantidade ímpar, a espelhada é a de baixo.
 */
export function pecasParaOEncaixe(pecas) {
  return pecas.flatMap((p) => {
    const q = p.quantidade;
    if (!p.marcacoes?.espelhar || q < 2) return [p];
    const espelhar = (pt) => ({ x: p.largura - pt.x, y: pt.y });
    return [
      { ...p, quantidade: Math.ceil(q / 2) },
      {
        ...p,
        nome: `${p.nome || p.papel} (espelhada)`,
        quantidade: Math.floor(q / 2),
        contorno: p.contorno.map(espelhar).reverse(),
        furos: (p.furos || []).map((f) => f.map(espelhar).reverse()),
      },
    ];
  });
}

/**
 * O que se desenha de uma peça no PDF, no SVG e na mesa.
 *
 * Tudo sai daqui, e os três só pintam: se o PDF e o SVG calculassem cada um o
 * seu pique, um dia um deles o poria do lado de dentro.
 *
 * Aceita peça gravada (encostada no canto) ou peça em edição — é por isso que
 * o texto se centra pela caixa do contorno, e não por `largura / 2`.
 */
export function desenhoDaPeca(peca) {
  const margem = peca.marcacoes.margem;
  const corte = margem > 0 ? nosDoPoligono(peca.contorno) : peca.nos;
  const piques = peca.marcacoes.piques
    .filter((p) => p.no < peca.nos.length)
    .map((p) => {
      const { ponto, fora } = posicaoDoPique(peca.nos, p);
      return {
        de: { x: ponto.x + fora.x * margem, y: ponto.y + fora.y * margem },
        ate: { x: ponto.x - fora.x * p.profundidade, y: ponto.y - fora.y * p.profundidade },
      };
    });

  const f = peca.marcacoes.fio;
  let fio = null;
  if (f.comprimento > 0) {
    const rad = (f.angulo * Math.PI) / 180;
    const dir = { x: Math.sin(rad), y: Math.cos(rad) };
    const lado = { x: -dir.y, y: dir.x };
    const meio = f.comprimento / 2;
    const de = { x: f.x - dir.x * meio, y: f.y - dir.y * meio };
    const ate = { x: f.x + dir.x * meio, y: f.y + dir.y * meio };
    const s = Math.min(1, f.comprimento / 6);
    const ponta = (p, sentido) => [
      { x: p.x - sentido * dir.x * s + lado.x * s * 0.5, y: p.y - sentido * dir.y * s + lado.y * s * 0.5 },
      p,
      { x: p.x - sentido * dir.x * s - lado.x * s * 0.5, y: p.y - sentido * dir.y * s - lado.y * s * 0.5 },
    ];
    fio = { linha: [de, ate], setas: [ponta(ate, 1), ponta(de, -1)] };
  }

  const c = caixaDe(peca.contorno);
  const tamanho = Math.max(0.4, Math.min(1.5, Math.min(c.largura, c.altura) / 12));
  const nome = peca.papel === "outro" || !peca.papel ? (peca.nome || "outro") : peca.papel;
  return {
    largura: peca.largura,
    altura: peca.altura,
    corte,
    costura: margem > 0 ? peca.nos : null,
    piques,
    pontos: peca.marcacoes.pontos,
    fio,
    texto: {
      x: c.minX + c.largura / 2,
      y: c.minY + c.altura * 0.35,
      tamanho,
      linhas: [nome, `${peca.tamanho} · ×${peca.quantidade}${peca.marcacoes.espelhar ? " espelhar" : ""}`],
    },
  };
}

/** Lado a lado, quebrando a linha em `larguraMaxima` cm. Para o PDF, o SVG e o "ver todas". */
export function arranjar(desenhos, larguraMaxima = 150, folga = 2) {
  let x = 0;
  let y = 0;
  let alturaDaLinha = 0;
  return desenhos.map((d) => {
    if (x > 0 && x + d.largura > larguraMaxima) {
      x = 0;
      y += alturaDaLinha + folga;
      alturaDaLinha = 0;
    }
    const posto = { ...d, emX: x, emY: y };
    x += d.largura + folga;
    alturaDaLinha = Math.max(alturaDaLinha, d.altura);
    return posto;
  });
}

const casas = (n) => Number(n.toFixed(3));
const escapar = (t) => String(t).replace(/[<&>"]/g, " ").trim();

/** `C` onde é curva e `L` onde é reta — ver o mesmo cuidado em `svgDosRiscos`. */
function caminhoDosNos(nos, dx, dy) {
  const em = (q) => `${casas(q.x + dx)} ${casas(q.y + dy)}`;
  const partes = [`M${em(nos[0])}`];
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i];
    const b = nos[(i + 1) % nos.length];
    partes.push(a.retaDepois ? `L${em(b)}` : `C${em(a.saida)} ${em(b.entrada)} ${em(b)}`);
  }
  return `${partes.join(" ")} Z`;
}

/**
 * O molde montado em SVG, medido em cm, uma camada (`<g id>`) por tipo de
 * traço: no Corel, esconder os textos ou os piques é um clique na camada.
 */
export function svgDaMontagem(arranjados, nome = "molde") {
  let largura = 0;
  let altura = 0;
  for (const d of arranjados) {
    largura = Math.max(largura, d.emX + d.largura);
    altura = Math.max(altura, d.emY + d.altura);
  }
  const linha = (a, b, dx, dy) => `<line x1="${casas(a.x + dx)}" y1="${casas(a.y + dy)}" x2="${casas(b.x + dx)}" y2="${casas(b.y + dy)}"/>`;
  const corte = []; const costura = []; const piques = []; const pontos = []; const fio = []; const textos = [];
  for (const d of arranjados) {
    const { emX: dx, emY: dy } = d;
    corte.push(`<path d="${caminhoDosNos(d.corte, dx, dy)}"/>`);
    if (d.costura) costura.push(`<path d="${caminhoDosNos(d.costura, dx, dy)}"/>`);
    for (const p of d.piques) piques.push(linha(p.de, p.ate, dx, dy));
    for (const p of d.pontos) {
      pontos.push(`<circle cx="${casas(p.x + dx)}" cy="${casas(p.y + dy)}" r="0.3"/>`);
      pontos.push(linha({ x: p.x - 0.4, y: p.y }, { x: p.x + 0.4, y: p.y }, dx, dy));
      pontos.push(linha({ x: p.x, y: p.y - 0.4 }, { x: p.x, y: p.y + 0.4 }, dx, dy));
    }
    if (d.fio) {
      fio.push(linha(d.fio.linha[0], d.fio.linha[1], dx, dy));
      for (const s of d.fio.setas) fio.push(`<polyline points="${s.map((q) => `${casas(q.x + dx)},${casas(q.y + dy)}`).join(" ")}"/>`);
    }
    d.texto.linhas.forEach((l, i) => {
      textos.push(`<text x="${casas(d.texto.x + dx)}" y="${casas(d.texto.y + dy + i * d.texto.tamanho * 1.3)}" font-size="${casas(d.texto.tamanho)}">${escapar(l)}</text>`);
    });
  }
  const grupo = (id, estilo, itens) => `  <g id="${id}" ${estilo}>\n    ${itens.join("\n    ")}\n  </g>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${casas(largura)}cm" height="${casas(altura)}cm"
     viewBox="0 0 ${casas(largura)} ${casas(altura)}">
  <title>${escapar(nome) || "molde"}</title>
${grupo("corte", 'fill="none" stroke="#000" stroke-width="0.05"', corte)}
${grupo("costura", 'fill="none" stroke="#000" stroke-width="0.03" stroke-dasharray="0.4 0.25"', costura)}
${grupo("piques", 'stroke="#000" stroke-width="0.05"', piques)}
${grupo("pontos", 'fill="none" stroke="#000" stroke-width="0.03"', pontos)}
${grupo("fio", 'fill="none" stroke="#000" stroke-width="0.04"', fio)}
${grupo("textos", 'fill="#000" font-family="Arial, sans-serif" text-anchor="middle"', textos)}
</svg>
`;
}
