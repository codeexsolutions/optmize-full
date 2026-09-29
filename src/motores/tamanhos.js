/**
 * ===========================================================================
 * TAMANHOS DO MOLDE — a grade, as cores, e a mesma peça em vários tamanhos
 * ===========================================================================
 *
 * Uma linha de peça continua sendo UMA peça num tamanho (é o que o Encaixe e
 * as estampas usam). O `grupo` diz quais linhas são a mesma peça: a FRENTE do
 * P, do M e do G. Nome, papel, quantidade, espelhar e margem são do GRUPO — a
 * frente não vira "costas" só no G —, e o desenho (nós, piques, pontos, fio)
 * é de cada tamanho, porque é assim que vem graduado da Audaces.
 */

/** Cores para tamanho sem cor guardada — as da Audaces primeiro. */
export const PALETA = ["#00ff00", "#ff0000", "#00ffff", "#ff8000", "#ff00ff", "#0080ff", "#ffff00", "#8000ff", "#808080"];

export function tamanhosDoMolde(pecas, guardados = []) {
  const saida = [];
  const vistos = new Set();
  // Só os tamanhos que alguma peça tem: um tamanho guardado sem peça (desfazer
  // uma junção, tirar um tamanho pelo passo a passo antigo) seria chip fantasma.
  const nasPecas = new Set(pecas.map((p) => p.tamanho));
  for (const g of [...guardados].sort((a, b) => a.ordem - b.ordem)) {
    if (vistos.has(g.nome) || !nasPecas.has(g.nome)) continue;
    vistos.add(g.nome);
    saida.push({ nome: g.nome, cor: g.cor || null, base: !!g.base });
  }
  for (const p of pecas) {
    if (vistos.has(p.tamanho)) continue;
    vistos.add(p.tamanho);
    saida.push({ nome: p.tamanho, cor: null, base: false });
  }
  const usadas = new Set(saida.map((t) => t.cor).filter(Boolean));
  const livres = PALETA.filter((c) => !usadas.has(c));
  let k = 0;
  const baseAchado = saida.findIndex((t) => t.base);
  return saida.map((t, ordem) => ({
    nome: t.nome,
    cor: t.cor || livres[k++ % Math.max(1, livres.length)] || PALETA[ordem % PALETA.length],
    ordem,
    base: baseAchado === -1 ? ordem === 0 : ordem === baseAchado,
  }));
}

/**
 * Dá grupo a quem não tem, sem nunca repetir um (grupo, tamanho).
 *
 * O molde misto é o caso que importa: agrupado pela Montagem, e o passo a
 * passo antigo trocou o arquivo de uma parte, acrescentou uma parte ou um
 * tamanho — essas linhas voltam sem grupo. A peça sem grupo pega, na ordem,
 * os grupos que FALTAM no tamanho dela; acabando, números novos a partir do
 * maior + 1, na mesma posição em todos os tamanhos. Assim o molde antigo
 * (ninguém com grupo) sai como sempre: a n-ésima peça de cada tamanho no
 * grupo n.
 */
export function completarGrupos(pecas) {
  const ordenadas = pecas.map((p, i) => ({ p, i })).sort((a, b) => ((a.p.ordem ?? a.i) - (b.p.ordem ?? b.i)) || a.i - b.i);
  const temGrupo = (p) => Number.isInteger(p.grupo);
  const existentes = [...new Set(pecas.filter(temGrupo).map((p) => p.grupo))].sort((a, b) => a - b);
  const novoApartirDe = existentes.length > 0 ? existentes[existentes.length - 1] + 1 : 0;
  const grupoDe = new Map();
  const porTamanho = new Map();
  for (const { p, i } of ordenadas) {
    if (!porTamanho.has(p.tamanho)) porTamanho.set(p.tamanho, []);
    porTamanho.get(p.tamanho).push({ p, i });
  }
  for (const lista of porTamanho.values()) {
    const usados = new Set();
    for (const { p, i } of lista) {
      // Um (grupo, tamanho) já ocupado não vale de novo: a segunda peça vira "sem grupo".
      if (temGrupo(p) && !usados.has(p.grupo)) { usados.add(p.grupo); grupoDe.set(i, p.grupo); }
    }
    const faltando = existentes.filter((g) => !usados.has(g));
    let novos = 0;
    for (const { i } of lista) {
      if (grupoDe.has(i)) continue;
      grupoDe.set(i, faltando.length > 0 ? faltando.shift() : novoApartirDe + novos++);
    }
  }
  return pecas.map((p, i) => (p.grupo === grupoDe.get(i) ? p : { ...p, grupo: grupoDe.get(i) }));
}

export function gruposDasPecas(pecas) {
  const mapa = new Map();
  pecas.forEach((p, i) => {
    if (!mapa.has(p.grupo)) mapa.set(p.grupo, { grupo: p.grupo, porTamanho: {} });
    mapa.get(p.grupo).porTamanho[p.tamanho] = i;
  });
  return [...mapa.values()].sort((a, b) => a.grupo - b.grupo);
}

export const CAMPOS_COMUNS = ["papel", "nome", "quantidade"];

export function aplicarNoGrupo(pecas, grupo, mudar) {
  return pecas.map((p) => (p.grupo === grupo ? mudar(p) : p));
}

export function comunsDoGrupo(modelo) {
  return (outra) => ({
    ...outra,
    ...Object.fromEntries(CAMPOS_COMUNS.map((c) => [c, modelo[c]])),
    marcacoes: { ...outra.marcacoes, espelhar: modelo.marcacoes.espelhar, margem: modelo.marcacoes.margem },
  });
}

export function normalizarNomeDePeca(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s*\d+\s*X\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de edição (Levenshtein): quantas letras trocar para um virar o outro. */
function edicao(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * Quão parecidos dois nomes são, de 0 a 1. Um nome que COMEÇA com o outro
 * ("PALA" e "PALA SHORT") conta como parecido — é o jeito de nomear da
 * fábrica —, mas menos que o mesmo nome com uma letra trocada.
 */
function semelhanca(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const porLetra = 1 - edicao(a, b) / Math.max(a.length, b.length);
  const prefixo = a.startsWith(b) || b.startsWith(a) ? 0.75 : 0;
  return Math.max(porLetra, prefixo);
}

export function casarPecasParaJuntar(daqui, dela) {
  const nomesDela = dela.map((p) => normalizarNomeDePeca(p.nome));
  const candidatos = [];
  daqui.forEach((a) => {
    const na = normalizarNomeDePeca(a.nome);
    dela.forEach((b, j) => {
      const nome = semelhanca(na, nomesDela[j]);
      const caixa = 1 - Math.min(1, Math.abs((a.largura * a.altura) - (b.largura * b.altura)) / Math.max(1, a.largura * a.altura));
      candidatos.push({ grupo: a.grupo, indiceDela: j, certeza: nome * 0.85 + caixa * 0.15 });
    });
  });
  candidatos.sort((x, y) => y.certeza - x.certeza);
  const usadoDaqui = new Set();
  const usadoDela = new Set();
  const escolhido = new Map();
  for (const c of candidatos) {
    if (c.certeza < 0.45 || usadoDaqui.has(c.grupo) || usadoDela.has(c.indiceDela)) continue;
    usadoDaqui.add(c.grupo);
    usadoDela.add(c.indiceDela);
    escolhido.set(c.grupo, c);
  }
  return daqui.map((a) => escolhido.get(a.grupo) ?? { grupo: a.grupo, indiceDela: null, certeza: 0 });
}

export function juntarComoTamanho(pecas, dela, pares, tamanho) {
  const vindas = [];
  for (const { grupo, indiceDela } of pares) {
    if (indiceDela === null || indiceDela === undefined) continue;
    const modelo = pecas.find((p) => p.grupo === grupo);
    const deLa = dela[indiceDela];
    if (!modelo || !deLa) continue;
    const { id: _id, ...semId } = deLa;
    vindas.push(comunsDoGrupo(modelo)({ ...semId, tamanho, grupo }));
  }
  return [...pecas, ...vindas];
}
