/**
 * ===========================================================================
 * O .ADS DA AUDACES — o que já está decifrado
 * ===========================================================================
 *
 * Formato fechado, sem documentação pública. Cada campo lido aqui está em
 * `docs/formatos/audaces-ads.md`, com a posição, o tipo e em que arquivos foi
 * conferido; campo fora do documento não é lido. Versão diferente da
 * conferida é RECUSADA — adivinhar num formato que mudou é cortar tecido
 * errado.
 */

const VERSOES_CONHECIDAS = ["vs6.0"];
const win1252 = new TextDecoder("windows-1252");
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function lerCabecalhoAds(bytes) {
  if (bytes.length < 0x30 || win1252.decode(bytes.subarray(0, 5)) !== "CADZ ") {
    return { erro: "Esse arquivo não é um .ads da Audaces." };
  }
  const versao = win1252.decode(bytes.subarray(5, 10)).trim();
  if (!VERSOES_CONHECIDAS.includes(versao)) {
    return { erro: `Esta versão da Audaces (${versao}) ainda não é lida. Exporte o molde em DXF-AAMA.` };
  }
  const pecas = u32(bytes, 0x0c);
  const tamanhoDoNome = u16(bytes, 0x26);
  const nome = win1252.decode(bytes.subarray(0x28, 0x28 + tamanhoDoNome)).trim();
  const posicaoDoTamanho = 0x28 + tamanhoDoNome + 6;
  const tamanhoDaMiniatura = u32(bytes, posicaoDoTamanho);
  const inicio = posicaoDoTamanho + 4;
  if (bytes[inicio] !== 0xff || bytes[inicio + 1] !== 0xd8 || inicio + tamanhoDaMiniatura > bytes.length) {
    return { erro: "O .ads não tem a miniatura onde o formato diz; o arquivo pode estar corrompido." };
  }
  return { versao, pecas, nome, miniatura: bytes.subarray(inicio, inicio + tamanhoDaMiniatura), fimDaMiniatura: inicio + tamanhoDaMiniatura };
}

/** Todos os textos `u16 tamanho + Windows-1252` legíveis a partir de `inicio`. */
function textos(bytes, inicio) {
  const saida = [];
  for (let o = inicio; o + 2 < bytes.length; o++) {
    const n = u16(bytes, o);
    if (n < 1 || n > 60 || o + 2 + n > bytes.length) continue;
    const pedaco = bytes.subarray(o + 2, o + 2 + n);
    if (!pedaco.every((c) => c >= 0x20 && c !== 0x7f)) continue;
    const s = win1252.decode(pedaco);
    if (!/[A-Za-zÀ-ÿ]/.test(s)) continue;
    saida.push({ texto: s, posicao: o, fim: o + 2 + n });
    o += 1 + n;
  }
  return saida;
}

/** As fichas: o texto que termina com a quantidade ("COSTA 2X"), e o rótulo logo depois. */
export function fichasDasPecas(bytes, inicio) {
  const lista = textos(bytes, inicio);
  const fichas = [];
  lista.forEach((t, i) => {
    const m = /^(.*?)\s*(\d+)\s*X\s*$/i.exec(t.texto);
    if (!m || !m[1].trim()) return;
    const seguinte = lista[i + 1];
    const rotulo = seguinte && seguinte.posicao - t.fim < 80 && !/\d+\s*X\s*$/i.test(seguinte.texto) ? seguinte.texto.trim() : null;
    fichas.push({ nome: m[1].trim(), quantidade: Number(m[2]), rotulo, posicao: t.posicao });
  });
  return fichas;
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** Os 8 bytes do fim de todo registro de tamanho — iguais nos 4 arquivos conferidos. */
const ASSINATURA_DO_TAMANHO = [0xef, 0x1a, 0x77, 0x00, 0x0c, 0x3f, 0x7d, 0x00];

/**
 * Um registro de tamanho que começa em `o`, ou `null`:
 * cor R,G,B,0 · u32 ativo · u8 1 · nome em 3 bytes · a assinatura.
 */
function registroDeTamanho(bytes, o) {
  if (o + 20 > bytes.length || bytes[o + 3] !== 0 || bytes[o + 8] !== 1) return null;
  if (!ASSINATURA_DO_TAMANHO.every((v, k) => bytes[o + 12 + k] === v)) return null;
  const ativo = u32(bytes, o + 4);
  if (ativo > 1) return null;
  const nomeCru = bytes.subarray(o + 9, o + 12);
  const fim = nomeCru.indexOf(0);
  const nome = win1252.decode(nomeCru.subarray(0, fim === -1 ? 3 : fim));
  if (!/^[A-Z0-9]{1,3}$/.test(nome)) return null;
  if (fim !== -1 && nomeCru.subarray(fim).some((c) => c !== 0)) return null;
  return { nome, cor: hex(bytes[o], bytes[o + 1], bytes[o + 2]), ativo: ativo === 1 };
}

/** As tabelas: registros seguidos, de 20 em 20 bytes (um só também vale: os pijamas). */
export function tabelasDeTamanhos(bytes, inicio) {
  const tabelas = [];
  for (let o = inicio; o + 20 <= bytes.length; o++) {
    if (!registroDeTamanho(bytes, o)) continue;
    const tamanhos = [];
    let q = o;
    for (let r = registroDeTamanho(bytes, q); r; r = registroDeTamanho(bytes, q)) { tamanhos.push(r); q += 20; }
    tabelas.push({ posicao: o, tamanhos });
    o = q - 1;
  }
  return tabelas;
}

export function resumoDoAds(bytes) {
  const cab = lerCabecalhoAds(bytes);
  if (cab.erro) return cab;
  const avisos = [];
  const fichas = fichasDasPecas(bytes, cab.fimDaMiniatura);
  if (fichas.length !== cab.pecas) {
    avisos.push(`O cabeçalho diz ${cab.pecas} peças e achei ${fichas.length} fichas.`);
  }
  // A grade do molde: a da primeira tabela, só os tamanhos em uso.
  const tabelas = tabelasDeTamanhos(bytes, cab.fimDaMiniatura);
  const tamanhos = (tabelas[0]?.tamanhos ?? []).filter((t) => t.ativo).map(({ nome, cor }) => ({ nome, cor }));
  return { nome: cab.nome, pecas: fichas.map(({ nome, quantidade }) => ({ nome, quantidade })), tamanhos, miniatura: cab.miniatura, avisos };
}
