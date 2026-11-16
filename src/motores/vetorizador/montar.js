/**
 * ===========================================================================
 * A MONTAGEM DO VETOR — cada região fecha o contorno com as cadeias dela
 * ===========================================================================
 *
 * Cada cadeia já virou curva (`curvas.js`). A região da ESQUERDA da cadeia a
 * percorre no sentido em que ela foi traçada; a da DIREITA, ao contrário
 * (`inverterAjuste`) — as duas usam a MESMA curva, e é por isso que não sobra
 * fresta entre vizinhas. Ligando as cadeias de uma região ponta com ponta
 * (as pontas são vértices exatos da grade), saem os anéis dela: o de fora e
 * os furos. O caminho SVG usa `fill-rule="evenodd"`, e o furo fica furo seja
 * qual for o sentido do anel.
 *
 * O PONTO DE PINÇA. Uma região pode encostar nela mesma num vértice (duas
 * partes que só se tocam pela quina). Ali chegam duas cadeias dela e saem
 * duas; a escolhida é a que vira mais para a ESQUERDA (a região fica à
 * esquerda de quem anda), o que fecha cada parte num anel simples em vez de
 * um oito.
 *
 * O EMPILHAMENTO (ver `empilhar`) e A COSTURA (ver `caminhosDaCostura`)
 * cuidam do fio claro que quem desenha a tela deixa entre duas formas
 * vizinhas, mesmo quando a curva das duas é idêntica.
 */

import { inverterAjuste } from "./curvas";

const direcao = (dx, dy) => (dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3);

/** O número no SVG: até duas casas, sem zero sobrando. */
function numero(v) {
  const t = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
  return t === "-0" ? "0" : t;
}

function escreverSegmentos(aj, escala) {
  let d = "";
  for (const s of aj.segs) {
    if (s.t === "L") d += `L${numero(s.x * escala)} ${numero(s.y * escala)}`;
    else d += `C${numero(s.x1 * escala)} ${numero(s.y1 * escala)} ${numero(s.x2 * escala)} ${numero(s.y2 * escala)} ${numero(s.x * escala)} ${numero(s.y * escala)}`;
  }
  return d;
}

/**
 * Os anéis de cada região desenhada.
 *
 * `desenhada(id)`: se a região entra no desenho (o fundo transparente e a
 * moldura não). Devolve `Map(id → [{ usos, area, vizinhas, cadeias }])`:
 * `area` é a área com sinal do anel (negativa para o contorno de fora,
 * positiva para um furo — com o y para baixo e a região à esquerda),
 * `vizinhas` as regiões do outro lado dele, `cadeias` os índices das cadeias.
 */
export function aneisDasRegioes(cadeias, ajustes, desenhada) {
  const usos = new Map();
  const juntar = (r, uso) => { if (!usos.has(r)) usos.set(r, []); usos.get(r).push(uso); };
  cadeias.forEach((c, i) => {
    const aj = ajustes[i];
    if (!aj) return;
    const p = c.pontos;
    const L = p.length;
    const dIni = direcao(p[2] - p[0], p[3] - p[1]);
    const dFim = direcao(p[L - 2] - p[L - 4], p[L - 1] - p[L - 3]);
    // A área com sinal da cadeia (a fórmula do laço, passo a passo): somada
    // pelos usos de um anel, dá o dobro da área dele.
    let area = 0;
    for (let k = 0; k + 3 < L; k += 2) area += p[k] * p[k + 3] - p[k + 2] * p[k + 1];
    if (desenhada(c.esq)) juntar(c.esq, { i, inv: false, a: c.a, b: c.b, dIni, dFim, area, outra: c.dir });
    if (desenhada(c.dir)) juntar(c.dir, { i, inv: true, a: c.b, b: c.a, dIni: (dFim + 2) % 4, dFim: (dIni + 2) % 4, area: -area, outra: c.esq });
  });

  const aneis = new Map();
  for (const [r, lista] of usos) {
    const saindoDe = new Map();
    lista.forEach((u, k) => {
      if (!saindoDe.has(u.a)) saindoDe.set(u.a, []);
      saindoDe.get(u.a).push(k);
    });
    const usado = new Uint8Array(lista.length);
    const daRegiao = [];
    for (let k0 = 0; k0 < lista.length; k0++) {
      if (usado[k0]) continue;
      const anel = [k0];
      usado[k0] = 1;
      let atual = lista[k0];
      let voltas = 0;
      while (atual.b !== lista[k0].a && voltas++ < lista.length) {
        const opcoes = (saindoDe.get(atual.b) || []).filter((k) => !usado[k]);
        if (!opcoes.length) break;
        let escolhida = opcoes[0];
        if (opcoes.length > 1) {
          // Esquerda, reto, direita, volta — nessa ordem de preferência.
          const pref = [(atual.dFim + 3) % 4, atual.dFim, (atual.dFim + 1) % 4, (atual.dFim + 2) % 4];
          escolhida = opcoes.sort((x, y) => pref.indexOf(lista[x].dIni) - pref.indexOf(lista[y].dIni))[0];
        }
        usado[escolhida] = 1;
        anel.push(escolhida);
        atual = lista[escolhida];
      }
      const us = anel.map((k) => lista[k]);
      daRegiao.push({
        usos: us,
        area: us.reduce((t, u) => t + u.area, 0) / 2,
        vizinhas: new Set(us.map((u) => u.outra)),
        cadeias: us.map((u) => u.i),
      });
    }
    aneis.set(r, daRegiao);
  }
  return aneis;
}

/** O caminho SVG de uma lista de anéis. */
export function caminhoDosAneis(listaDeAneis, ajustes, escala = 1) {
  let d = "";
  for (const anel of listaDeAneis) {
    const primeiro = anel.usos[0];
    const aj0 = primeiro.inv ? inverterAjuste(ajustes[primeiro.i]) : ajustes[primeiro.i];
    d += `M${numero(aj0.x0 * escala)} ${numero(aj0.y0 * escala)}`;
    for (const u of anel.usos) d += escreverSegmentos(u.inv ? inverterAjuste(ajustes[u.i]) : ajustes[u.i], escala);
    d += "Z";
  }
  return d;
}

/**
 * O EMPILHAMENTO. As regiões são desenhadas de fora para dentro (a
 * profundidade de aninhamento: quem encosta na moldura é 0, quem está no furo
 * de uma região de profundidade d é d + 1; vizinhas lado a lado ficam na
 * mesma) e, na mesma profundidade, da maior para a menor. Um FURO de uma
 * região não precisa ser recortado quando tudo o que está dentro dele é
 * opaco e desenhado DEPOIS: a de cima cobre o furo inteiro. A divisa passa a
 * aparecer uma vez só (na forma de dentro), o arquivo encolhe, e ali não
 * aparece fio claro, porque a de baixo continua por baixo. Furo que mostra
 * transparência continua furo.
 *
 * Devolve `{ ordem, aneisDesenhados: Map(id → anéis), cobertas: Set(cadeia) }`
 * — `cobertas` são as cadeias em que uma região passa por baixo da outra (a
 * costura não precisa delas).
 */
export function empilhar(aneis, cadeias, desenhada, areaDa, FORA) {
  const ids = [...aneis.keys()];
  // A vizinhança entre regiões (pelas cadeias), para achar o que há num furo.
  const vizinhas = new Map();
  const ligar = (a, b) => { if (!vizinhas.has(a)) vizinhas.set(a, new Set()); vizinhas.get(a).add(b); };
  for (const c of cadeias) { ligar(c.esq, c.dir); ligar(c.dir, c.esq); }

  // A profundidade, por uma busca 0-1: atravessar um furo soma 1.
  const prof = new Map();
  const fila = [];
  for (const c of cadeias) {
    for (const [r, outra] of [[c.esq, c.dir], [c.dir, c.esq]]) {
      if (outra === FORA && r !== FORA && !prof.has(r)) { prof.set(r, 0); fila.push(r); }
    }
  }
  while (fila.length) {
    fila.sort((a, b) => prof.get(a) - prof.get(b));
    const r = fila.shift();
    const d = prof.get(r);
    if (aneis.has(r)) {
      for (const anel of aneis.get(r)) {
        const peso = anel.area > 0 ? 1 : 0;
        for (const s of anel.vizinhas) {
          if (s === FORA || prof.has(s)) continue;
          prof.set(s, d + peso);
          fila.push(s);
        }
      }
    } else {
      // O fundo transparente não é desenhado, mas propaga a profundidade
      // para o que está do outro lado dele.
      for (const s of vizinhas.get(r) || []) {
        if (s === FORA || prof.has(s)) continue;
        prof.set(s, d);
        fila.push(s);
      }
    }
  }
  const p = (r) => (prof.has(r) ? prof.get(r) : 0);
  const ordem = ids.sort((a, b) => p(a) - p(b) || areaDa[b] - areaDa[a]);
  const posicao = new Map(ordem.map((r, k) => [r, k]));

  const aneisDesenhados = new Map();
  const cobertas = new Set();
  for (const r of ordem) {
    const lista = [];
    for (const anel of aneis.get(r)) {
      if (anel.area > 0) {
        // Um furo: o que há dentro dele (busca a partir do outro lado, sem
        // atravessar a própria região).
        const dentro = new Set();
        const pilha = [...anel.vizinhas].filter((s) => s !== r);
        let cobre = true;
        while (pilha.length && cobre) {
          const s = pilha.pop();
          if (dentro.has(s)) continue;
          dentro.add(s);
          if (s === FORA || !desenhada(s) || !(posicao.get(s) > posicao.get(r))) { cobre = false; break; }
          for (const t of vizinhas.get(s) || []) if (t !== r && !dentro.has(t)) pilha.push(t);
        }
        if (cobre) {
          anel.cadeias.forEach((i) => cobertas.add(i));
          continue;
        }
      }
      lista.push(anel);
    }
    aneisDesenhados.set(r, lista);
  }
  return { ordem, aneisDesenhados, cobertas };
}

/**
 * A COSTURA. Mesmo com a curva idêntica dos dois lados, quem desenha a tela
 * suaviza a borda de cada forma sozinha, e um fio claro aparece entre duas
 * vizinhas lado a lado (o "artefato de conflação"). A costura é um traço
 * fino, POR BAIXO de todas as formas, ao longo de cada divisa entre duas
 * regiões desenhadas que o empilhamento não resolveu: as formas por cima
 * cobrem o traço inteiro, menos o fio — que passa a mostrar a cor certa em
 * vez do fundo. Nada da forma visível muda. Para corte em plotter, desliga
 * (`costura: false`). Um caminho por cor.
 */
export function caminhosDaCostura(cadeias, ajustes, desenhada, corDa, escala = 1, cobertas = null) {
  const porCor = new Map();
  cadeias.forEach((c, i) => {
    const aj = ajustes[i];
    if (!aj || !desenhada(c.esq) || !desenhada(c.dir)) return;
    if (cobertas && cobertas.has(i)) return;
    const cor = corDa(c.esq);
    const d = `M${numero(aj.x0 * escala)} ${numero(aj.y0 * escala)}${escreverSegmentos(aj, escala)}`;
    porCor.set(cor, (porCor.get(cor) || "") + d);
  });
  return porCor;
}

/** O SVG inteiro. `formas`: `[{ cor, d }]` na ordem de desenho. */
export function escreverSvg({ largura, altura, formas, costura, larguraTraco = 1 }) {
  const partes = [];
  partes.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  partes.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${numero(largura)}" height="${numero(altura)}" viewBox="0 0 ${numero(largura)} ${numero(altura)}">`);
  if (costura && costura.size) {
    partes.push(`<g fill="none" stroke-width="${numero(larguraTraco)}" stroke-linejoin="round" stroke-linecap="round">`);
    for (const [cor, d] of costura) partes.push(`<path stroke="${cor}" d="${d}"/>`);
    partes.push(`</g>`);
  }
  for (const f of formas) if (f.d) partes.push(`<path fill="${f.cor}" fill-rule="evenodd" d="${f.d}"/>`);
  partes.push(`</svg>`);
  return partes.join("\n");
}
