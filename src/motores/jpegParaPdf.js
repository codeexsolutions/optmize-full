/**
 * ===========================================================================
 * JPEG PARA O PDF — passar a arte adiante sem recomprimir
 * ===========================================================================
 *
 * O PDF do encaixe embute o JPEG do jeito que ele chegou, sem redesenhar: é o
 * "passa-direto". Recomprimir uma arte de sublimação custa qualidade e tempo,
 * e não melhora nada. Mas nem todo JPEG pode ir direto — os progressivos, os
 * de quatro componentes e os que vêm com orientação EXIF precisam de conversa.
 * É isso que estas duas funções decidem.
 *
 * Elas moravam no `encaixe.js`, no meio da tela, apesar de serem conta pura:
 * leem bytes e devolvem um veredito, sem tocar em canvas nem em DOM. Desceram
 * para cá quando o `public/` foi apagado, porque a bancada precisava delas e
 * estava as extraindo do arquivo da tela POR TEXTO — procurando
 * `function jpegSeguroParaPdf(` e contando chaves até fechar.
 *
 * Aquilo funcionava e era frágil de um jeito ruim: renomear a função, ou
 * transformá-la numa arrow, quebrava a conferência sem quebrar o programa —
 * e uma conferência quebrada é pior que nenhuma, porque some sem avisar.
 *
 * **Nenhuma conta mudou.** O texto veio recortado, e o que entrou foi o
 * `export`.
 */

/** Lê a orientação do EXIF. 1 = normal, 0 = não tem, -1 = não deu para ler. */
export function orientacaoExif(d, inicio, fim) {
  // "Exif\0\0" e, logo atrás, um TIFF inteirinho dentro do segmento.
  if (fim - inicio < 14) return -1;
  if (!(d[inicio] === 0x45 && d[inicio + 1] === 0x78 && d[inicio + 2] === 0x69
    && d[inicio + 3] === 0x66 && d[inicio + 4] === 0 && d[inicio + 5] === 0)) return 0;

  const tiff = inicio + 6;
  const ordem = (d[tiff] << 8) | d[tiff + 1];
  if (ordem !== 0x4949 && ordem !== 0x4d4d) return -1;
  const invertido = ordem === 0x4949; // "II": byte menos significativo primeiro
  const u16 = (i) => (i + 1 >= fim ? -1
    : (invertido ? d[i] | (d[i + 1] << 8) : (d[i] << 8) | d[i + 1]));
  const u32 = (i) => (i + 3 >= fim ? -1
    : (invertido ? (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0
      : ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0));

  if (u16(tiff + 2) !== 42) return -1;
  const ifd = tiff + u32(tiff + 4);
  if (ifd < tiff || ifd + 2 > fim) return -1;

  const quantas = u16(ifd);
  if (quantas < 0 || ifd + 2 + quantas * 12 > fim) return -1;
  for (let e = 0; e < quantas; e++) {
    const campo = ifd + 2 + e * 12;
    if (u16(campo) === 0x0112) {            // Orientation
      if (u16(campo + 2) !== 3) return -1;  // tem que ser SHORT
      return u16(campo + 8);
    }
  }
  return 1; // tem EXIF e não fala de orientação: o mesmo que normal
}

/** Este JPEG pode entrar no PDF do jeito que está? Ver o bloco acima. */
export function jpegSeguroParaPdf(d) {
  if (!d || d.length < 4 || d[0] !== 0xff || d[1] !== 0xd8) return false;

  let i = 2;
  let viuSof = false;
  while (i + 3 < d.length) {
    if (d[i] !== 0xff) return false;        // fora de sincronia: não arrisca
    let marcador = d[i + 1];
    while (marcador === 0xff) { i++; marcador = d[i + 1]; } // preenchimento
    if (marcador === 0xd9) break;           // EOI
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }

    const tamanho = (d[i + 2] << 8) | d[i + 3];
    if (tamanho < 2 || i + 2 + tamanho > d.length) return false; // truncado
    const carga = i + 4;
    const fimDaCarga = i + 2 + tamanho;

    if (marcador === 0xda) break;           // começo do dado: o cabeçalho acabou

    if (marcador === 0xe1) {                // APP1: onde mora o EXIF
      const orientacao = orientacaoExif(d, carga, fimDaCarga);
      if (orientacao !== 0 && orientacao !== 1) return false;
    }

    // SOF0 e SOF1 são os sequenciais de Huffman. Todo outro SOF reprova por não
    // estar nesta lista; DHT (C4), JPG (C8) e DAC (CC) não são SOF nenhum.
    if (marcador === 0xc0 || marcador === 0xc1) {
      if (fimDaCarga - carga < 6) return false;
      if (d[carga] !== 8) return false;                       // precisão
      const componentes = d[carga + 5];
      if (componentes !== 1 && componentes !== 3) return false;
      viuSof = true;
    } else if (marcador >= 0xc0 && marcador <= 0xcf
      && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      return false;
    }

    i = fimDaCarga;
  }
  return viuSof;
}
