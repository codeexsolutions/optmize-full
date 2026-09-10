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
