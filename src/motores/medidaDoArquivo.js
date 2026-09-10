/**
 * ===========================================================================
 * MEDIDA DO ARQUIVO — quantos centímetros a arte tem de verdade
 * ===========================================================================
 *
 * O número de pixels sozinho não diz nada: a mesma imagem de 3000 px pode ser
 * um bolso ou um banner. Quem sabe o tamanho real é o próprio arquivo, e é
 * daqui que sai — PNG guarda no bloco `pHYs`, JPEG no cabeçalho JFIF.
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
 * PNG guarda isso no bloco `pHYs` e JPEG no cabeçalho JFIF. É a única fonte
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

function pixelsPorCmDoJPEG(bytes) {
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marcador = bytes[i + 1];
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }
    if (marcador === 0xda) return null; // começou a imagem
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
        return null;
      }
    }
    i += 2 + tamanho;
  }
  return null;
}
