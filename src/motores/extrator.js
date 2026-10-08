/**
 * ===========================================================================
 * O EXTRATOR — as medidas e as sugestões, em conta pura
 * ===========================================================================
 *
 * O que a tela do Extrator decide sem servidor: o tamanho da foto de
 * trabalho, o do PNG pedido, se o elemento parece chapado ou foto, quantas
 * cores ele tem, se a máscara serve, e os nomes dos arquivos.
 *
 * O chapado é reconhecido pelo jeito como a tinta se espalha: em degraus de
 * 16 por canal, logo e texto de cor chapada cabem em poucos degraus — mesmo
 * fotografados, a sombra da dobra só espalha cada cor pelos degraus vizinhos
 * —, e foto ou degradê precisam de centenas. O `pareceArteChapada` da antiga
 * tela Imagem contava TODOS os degraus, e a sombra de tecido o fazia chamar
 * de foto o escudo fotografado; aqui conta quantos cobrem 90% da tinta.
 */

export const LADO_DE_TRABALHO = 2048;
export const TETO_DE_MEGAPIXELS = 40;
export const LADO_DO_4K = 4096;
export const DPI_DA_SAIDA = 300;
/** O maior PNG: o mesmo `TETO_DA_SAIDA` do servidor (servidor/extrator-ampliar.js). */
export const TETO_DA_SAIDA = 80_000_000;
/** Acima disto o chapado parece foto, e a tela sugere a troca. */
export const CORES_DEMAIS = 12;
/** Até quantos degraus cobrindo 90% da tinta o elemento é chapado. */
export const DEGRAUS_DO_CHAPADO = 40;

export function tamanhoDeTrabalho(largura, altura) {
  const escala = Math.min(1, LADO_DE_TRABALHO / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)), escala };
}

export function fotoGrandeDemais(largura, altura) {
  const mp = (largura * altura) / 1e6;
  return mp > TETO_DE_MEGAPIXELS
    ? `A foto tem ${Math.round(mp)} megapixels (${largura} × ${altura}); o Extrator lê até ${TETO_DE_MEGAPIXELS}.`
    : null;
}

/** O tamanho do PNG: 4K (lado maior em 4096) ou a largura em cm a 300 dpi; cortado no teto, avisando. */
export function tamanhoDaSaida(largura, altura, pedido) {
  let L, A;
  if (pedido.tipo === "cm") {
    L = Math.round((pedido.larguraCm / 2.54) * DPI_DA_SAIDA);
    A = Math.round((L * altura) / largura);
  } else {
    const e = LADO_DO_4K / Math.max(largura, altura);
    L = Math.round(largura * e);
    A = Math.round(altura * e);
  }
  let cortada = false;
  if (L * A > TETO_DA_SAIDA) {
    const k = Math.sqrt(TETO_DA_SAIDA / (L * A));
    L = Math.floor(L * k);
    A = Math.floor(A * k);
    cortada = true;
  }
  return { largura: Math.max(1, L), altura: Math.max(1, A), cortada };
}

/** A tinta (pixels opacos), contada em degraus de 16 por canal, numa amostra de até 200 mil pixels. */
function degrausDaTinta(rgba) {
  const contagem = new Map();
  let opacos = 0;
  const passo = Math.max(1, Math.floor(rgba.length / 4 / 200000)) * 4;
  for (let i = 0; i < rgba.length; i += passo) {
    if (rgba[i + 3] < 128) continue;
    opacos++;
    const k = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    contagem.set(k, (contagem.get(k) || 0) + 1);
  }
  return { contagem, opacos };
}

/** Quantos degraus, dos mais cheios para os mais vazios, cobrem 90% da tinta. */
export function degrausPara90(rgba) {
  const { contagem, opacos } = degrausDaTinta(rgba);
  if (opacos === 0) return 0;
  let soma = 0, n = 0;
  for (const c of [...contagem.values()].sort((a, b) => b - a)) {
    soma += c;
    n++;
    if (soma >= opacos * 0.9) break;
  }
  return n;
}

export function jeitoSugerido(rgba) {
  const n = degrausPara90(rgba);
  return n > 0 && n <= DEGRAUS_DO_CHAPADO ? "chapado" : "foto";
}

/**
 * Quantas cores o elemento tem: os degraus com pelo menos 1% da tinta,
 * juntados quando são vizinhos (até um degrau em cada canal — a mesma cor com
 * sombra), contando os grupos com pelo menos 3%. De 2 a CORES_DEMAIS.
 */
export function coresSugeridas(rgba) {
  const { contagem, opacos } = degrausDaTinta(rgba);
  if (opacos === 0) return 2;
  const fortes = [...contagem.entries()].filter(([, n]) => n >= opacos * 0.01).map(([k]) => k);
  const pai = new Map(fortes.map((k) => [k, k]));
  const raiz = (k) => { while (pai.get(k) !== k) k = pai.get(k); return k; };
  const canais = (k) => [k >> 8, (k >> 4) & 15, k & 15];
  for (let i = 0; i < fortes.length; i++) {
    for (let j = i + 1; j < fortes.length; j++) {
      const a = canais(fortes[i]), b = canais(fortes[j]);
      if (Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1 && Math.abs(a[2] - b[2]) <= 1) pai.set(raiz(fortes[i]), raiz(fortes[j]));
    }
  }
  const grupos = new Map();
  for (const k of fortes) grupos.set(raiz(k), (grupos.get(raiz(k)) || 0) + contagem.get(k));
  const cores = [...grupos.values()].filter((n) => n >= opacos * 0.03).length;
  return Math.max(2, Math.min(CORES_DEMAIS, cores));
}

export function coberturaDaMascara(alfa) {
  let n = 0;
  for (let i = 0; i < alfa.length; i++) if (alfa[i] >= 128) n++;
  return alfa.length ? n / alfa.length : 0;
}

/** Por que a máscara não serve para guardar, ou `null`. */
export function avisoDaMascara(cobertura) {
  if (cobertura < 0.0005) return "A rede não achou nada aqui; clique mais perto do elemento.";
  if (cobertura > 0.98) return "A máscara pegou a foto inteira; clique mais perto do elemento, ou marque o fundo com o clique direito.";
  return null;
}

/** Os nomes dos arquivos: sem caractere que o Windows recusa, e sem repetir (o segundo "Logo" vira "Logo (2)"). */
export function nomesUnicos(nomes) {
  const usados = new Set();
  return nomes.map((n) => {
    const base = String(n || "").replace(/[\\/:*?"<>|]/g, "-").trim() || "elemento";
    let nome = base;
    for (let k = 2; usados.has(nome.toLowerCase()); k++) nome = `${base} (${k})`;
    usados.add(nome.toLowerCase());
    return nome;
  });
}
