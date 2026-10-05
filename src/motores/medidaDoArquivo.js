/**
 * ===========================================================================
 * MEDIDA DO ARQUIVO — quantos centímetros a arte tem de verdade
 * ===========================================================================
 *
 * O número de pixels sozinho não diz nada: a mesma imagem de 3000 px pode ser
 * um bolso ou um banner. Quem sabe o tamanho real é o próprio arquivo, e é
 * daqui que sai — PNG guarda no bloco `pHYs`, JPEG no cabeçalho JFIF ou no
 * EXIF.
 *
 * É a regra 6 do MAPA.md em código: **a medida em centímetros vem do arquivo,
 * não do bitmap**. Medir o bitmap decodificado dá uma peça menor do que ela é,
 * e foi esse erro que fez uma camiseta de 49,3 cm entrar no encaixe como
 * 15,2 cm.
 *
 * Veio de `public/encaixe.js`, onde morava no meio da tela apesar de ser conta
 * pura — só lê bytes. Nenhuma linha mudou; entrou o `export`. Enquanto o
 * Encaixe não migrar, a cópia de lá continua sendo a que a tela antiga usa.
 */

/**
 * Quantos pixels da imagem valem 1 cm, lido do próprio arquivo.
 *
 * PNG guarda isso no bloco `pHYs` e JPEG no JFIF ou no EXIF. É a única fonte
 * confiável do tamanho real de uma arte: o número de pixels sozinho não diz
 * nada (a mesma imagem de 3000 px pode ser um bolso ou um banner).
 */
export function pixelsPorCmDoArquivo(bytes) {
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (png) return pixelsPorCmDoPNG(bytes);
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (jpeg) return pixelsPorCmDoJPEG(bytes);
  return null;
}

function pixelsPorCmDoPNG(bytes) {
  const ler32 = (i) => (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
  let i = 8; // pula a assinatura
  while (i + 8 <= bytes.length) {
    const tamanho = ler32(i);
    const tipo = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    if (tipo === "pHYs" && tamanho >= 9) {
      const porMetroX = ler32(i + 8);
      const unidade = bytes[i + 16];
      // unidade 1 = metro; 0 quer dizer "só proporção", que não serve de medida
      if (unidade === 1 && porMetroX > 0) return porMetroX / 100;
      return null;
    }
    if (tipo === "IDAT" || tipo === "IEND") return null; // pHYs vem antes destes
    i += 12 + tamanho;
  }
  return null;
}

/*
 * O JPEG TEM DOIS LUGARES PARA O DPI: o JFIF (APP0) e o EXIF (APP1).
 *
 * Só o JFIF era lido. Mas há programas que gravam o dpi SÓ no EXIF — o sharp
 * e a libvips, câmeras, vários exportadores — e deixam o JFIF de fora ou em
 * "só proporção". A arte entrava com os 300 dpi supostos: uma de 150 dpi saía
 * com metade do tamanho (medido em 2026-10-05, ver
 * `bancada/conferir-medida-do-arquivo.mjs`).
 *
 * Os dois são lidos; com os dois presentes vale o JFIF, que era o que valia.
 */
function pixelsPorCmDoJPEG(bytes) {
  let doExif = null;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marcador = bytes[i + 1];
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }
    if (marcador === 0xda) break; // começou a imagem
    const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];

    if (marcador === 0xe0 && tamanho >= 14) { // APP0 / JFIF
      const assinatura = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (assinatura === "JFIF") {
        const unidade = bytes[i + 11];
        const densidade = (bytes[i + 12] << 8) | bytes[i + 13];
        if (densidade > 0) {
          if (unidade === 1) return densidade / 2.54; // pontos por polegada
          if (unidade === 2) return densidade;        // pontos por centímetro
        }
        // "Só proporção": não é medida, mas também não encerra a procura — o
        // EXIF pode vir depois com o dpi de verdade.
      }
    }
    if (marcador === 0xe1 && doExif === null) doExif = pixelsPorCmDoExif(bytes, i + 4, i + 2 + tamanho);
    i += 2 + tamanho;
  }
  return doExif;
}

/**
 * XResolution e ResolutionUnit do IFD0 de um bloco EXIF, que vai de `inicio`
 * (logo depois do tamanho do APP1) até `fim`. `null` quando não há, quando a
 * unidade é "nenhuma" ou quando o bloco está cortado.
 */
function pixelsPorCmDoExif(bytes, inicio, fim) {
  fim = Math.min(fim, bytes.length);
  // "Exif" e dois zeros, e depois um cabeçalho TIFF.
  if (fim - inicio < 14 || String.fromCharCode(bytes[inicio], bytes[inicio + 1], bytes[inicio + 2], bytes[inicio + 3]) !== "Exif") {
    return null;
  }
  const base = inicio + 6;
  const ordem = String.fromCharCode(bytes[base], bytes[base + 1]);
  if (ordem !== "II" && ordem !== "MM") return null;
  const le = ordem === "II";
  const dentro = (pos, n) => pos >= base && pos + n <= fim;
  const ler16 = (pos) => (le ? bytes[pos] | (bytes[pos + 1] << 8) : (bytes[pos] << 8) | bytes[pos + 1]);
  const ler32 = (pos) => (le
    ? (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0
    : ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0);

  if (!dentro(base, 8)) return null;
  const ifd = base + ler32(base + 4);
  if (!dentro(ifd, 2)) return null;
  const entradas = ler16(ifd);
  let resolucao = null;
  let unidade = 2; // o EXIF diz: sem a etiqueta, é polegada
  for (let k = 0; k < entradas; k++) {
    const e = ifd + 2 + k * 12;
    if (!dentro(e, 12)) return null;
    const etiqueta = ler16(e);
    if (etiqueta === 0x011a) { // XResolution: RATIONAL, sempre fora da entrada
      const valor = base + ler32(e + 8);
      if (!dentro(valor, 8)) return null;
      const denominador = ler32(valor + 4);
      if (denominador > 0) resolucao = ler32(valor) / denominador;
    } else if (etiqueta === 0x0128) { // ResolutionUnit: SHORT, dentro da entrada
      unidade = ler16(e + 8);
    }
  }
  if (!(resolucao > 0)) return null;
  if (unidade === 2) return resolucao / 2.54; // por polegada
  if (unidade === 3) return resolucao;        // por centímetro
  return null;                                // 1 = sem unidade: só proporção
}

/**
 * As medidas em pixels, lidas do cabeçalho do arquivo.
 *
 * Serve para decidir o tamanho de decodificação ANTES de decodificar: saber que
 * a arte tem 7235x9254 permite pedir ao navegador uma versão já reduzida, em
 * vez de abrir 67 megapixels para depois jogar fora três quartos deles.
 *
 * Estava dentro do `producao/controlador.js`, em cópia idêntica à do
 * `encaixe.js` antigo. Desceu para cá quando a tela de Projetos saiu do
 * controlador e passou a precisar dela — que é o critério de sempre: conta
 * pura que duas telas usam não mora dentro de uma delas.
 */
export function medidasDoArquivo(bytes) {
  // PNG: as medidas estão no IHDR, sempre o primeiro bloco.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const ler32 = (i) => (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    return { largura: ler32(16), altura: ler32(20) };
  }
  // JPEG: o tamanho está no marcador SOF (0xC0..0xCF, tirando os que não são).
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xda) break; // começou a imagem
      const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];
      const ehSOF = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
      if (ehSOF) return { altura: (bytes[i + 5] << 8) | bytes[i + 6], largura: (bytes[i + 7] << 8) | bytes[i + 8] };
      i += 2 + tamanho;
    }
  }
  return null;
}

/*
 * O padrão de quando o arquivo não diz nada: 300 dpi, que é o de arte para
 * impressão. Ele nasce no `pecaNaGrade` (é lá que o preparo da peça o usa) e
 * sai por aqui também, porque quem pergunta "quantos pixels por centímetro?"
 * quer o padrão no mesmo lugar da resposta, e não numa terceira porta.
 */
export { DPI_PADRAO, PPCM_PADRAO } from "./pecaNaGrade";
