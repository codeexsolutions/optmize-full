/**
 * ===========================================================================
 * A ARTE SEM FUNDO PARA O PDF — a conta que roda fora da tela
 * ===========================================================================
 *
 * É a parte do Exportar que precisa dos pixels: decodificar a arte original
 * sem gerenciar cor, apagar o fundo, suavizar a borda que encostava nele e
 * montar o PNG à mão com o perfil de cor do original (ver o cabeçalho de
 * `exportarEncaixe.js` para o porquê de cada passo).
 *
 * MORA AQUI, SEPARADA, para poder rodar num worker (`semFundoWorker.js`). Ela
 * rodava na linha principal, uma arte por vez, na hora de exportar — e numa
 * arte de 12 megapixels isso são segundos. Com 41 artes com fundo, o modal
 * ficava minutos em "Lendo a arte 7 de 41" (2026-10-27). Por isso este módulo
 * não importa nada que dependa da tela: só o `fflate` e as contas puras do
 * `encaixeMascara.js`, que o worker do preparo já usa.
 *
 * O resultado é o MESMO de antes, byte a byte: são as mesmas funções, na mesma
 * ordem; só o lugar onde rodam mudou.
 */
import { zlibSync, unzlibSync } from "fflate";
import { suavizarBordaDoFundo, tirarFundoDosPixels } from "./encaixeMascara";

export function ehPng(bytes) {
  return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
}

/*
 * Decodifica SEM gerenciar cor e sem multiplicar pelo alfa: os números que
 * saem são os do arquivo, e o perfil dele vai junto no PNG (ver
 * `perfilRgbDoArquivo`). A orientação do EXIF continua valendo, que é como a
 * prévia da tela mostra a arte.
 */
export async function decodificar(blob) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
      imageOrientation: "from-image",
    });
  }
  const endereco = URL.createObjectURL(blob);
  try {
    return await new Promise((pronto, falhou) => {
      const img = new Image();
      img.onload = () => pronto(img);
      img.onerror = () => falhou(new Error("Não consegui abrir a arte original para impressão."));
      img.src = endereco;
    });
  } finally { URL.revokeObjectURL(endereco); }
}

/**
 * Os pixels da arte, crus, a partir de uma imagem já decodificada. No worker
 * não há `document`: o canvas é o `OffscreenCanvas`, que desenha igual.
 */
export function pixelsDe(img) {
  const largura = img.naturalWidth || img.width;
  const altura = img.naturalHeight || img.height;
  if (!(largura > 0 && altura > 0)) throw new Error("A arte original está vazia.");
  const canvas = typeof document !== "undefined"
    ? Object.assign(document.createElement("canvas"), { width: largura, height: altura })
    : new OffscreenCanvas(largura, altura);
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Não há memória para preparar a arte original.");
    ctx.drawImage(img, 0, 0);
    return { dados: ctx.getImageData(0, 0, largura, altura).data, largura, altura };
  } finally { canvas.width = 0; canvas.height = 0; }
}

// ==================== O PERFIL DE COR DO ARQUIVO ====================

/** O perfil é de RGB? Só esse pode acompanhar pixels que saem RGB. */
function perfilEhRgb(perfil) {
  return perfil && perfil.length > 20
    && String.fromCharCode(perfil[16], perfil[17], perfil[18], perfil[19]) === "RGB ";
}

/**
 * O perfil ICC embutido no PNG (bloco iCCP) ou no JPEG (segmentos APP2), ou
 * `null`. Perfil de CMYK não serve: o navegador entrega esses pixels já em RGB.
 */
export function perfilRgbDoArquivo(bytes) {
  try {
    if (ehPng(bytes)) {
      let i = 8;
      while (i + 12 <= bytes.length) {
        const tamanho = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
        const tipo = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
        if (tipo === "iCCP") {
          const dados = bytes.subarray(i + 8, i + 8 + tamanho);
          const fimDoNome = dados.indexOf(0);
          if (fimDoNome < 0) return null;
          const perfil = unzlibSync(dados.subarray(fimDoNome + 2));
          return perfilEhRgb(perfil) ? perfil : null;
        }
        if (tipo === "IDAT" || tipo === "IEND") return null;
        i += 12 + tamanho;
      }
      return null;
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      const pedacos = [];
      let i = 2;
      while (i + 4 <= bytes.length && bytes[i] === 0xff) {
        const marcador = bytes[i + 1];
        if (marcador === 0xda || marcador === 0xd9) break;
        const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];
        const carga = bytes.subarray(i + 4, i + 2 + tamanho);
        // "ICC_PROFILE\0", número do pedaço, total de pedaços, e o perfil.
        if (marcador === 0xe2 && carga.length > 14
          && String.fromCharCode(...carga.subarray(0, 11)) === "ICC_PROFILE") {
          pedacos.push({ ordem: carga[12], dados: carga.subarray(14) });
        }
        i += 2 + tamanho;
      }
      if (pedacos.length === 0) return null;
      pedacos.sort((a, b) => a.ordem - b.ordem);
      const perfil = new Uint8Array(pedacos.reduce((n, p) => n + p.dados.length, 0));
      let onde = 0;
      for (const p of pedacos) { perfil.set(p.dados, onde); onde += p.dados.length; }
      return perfilEhRgb(perfil) ? perfil : null;
    }
  } catch {
    // Perfil ilegível: a arte segue sem ele, como sempre seguiu.
  }
  return null;
}

// ==================== O PNG MONTADO À MÃO ====================

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(partes) {
  let c = 0xffffffff;
  for (const p of partes) for (let i = 0; i < p.length; i++) c = TABELA_CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const cabeca = new Uint8Array(8);
  const vista = new DataView(cabeca.buffer);
  vista.setUint32(0, dados.length);
  for (let i = 0; i < 4; i++) cabeca[4 + i] = tipo.charCodeAt(i);
  const rabo = new Uint8Array(4);
  new DataView(rabo.buffer).setUint32(0, crc32([cabeca.subarray(4), dados]));
  return [cabeca, dados, rabo];
}

/**
 * RGBA sem multiplicar para PNG, sem passar pelo `toBlob` do canvas — que é
 * onde a cor da borda semitransparente se perdia. Filtro "nenhum": quem
 * comprime é o Flate, e o PNG só vive até o servidor.
 */
export function pngDosPixels(rgba, largura, altura, perfil = null) {
  const linha = largura * 4 + 1;
  const cru = new Uint8Array(linha * altura);
  for (let y = 0; y < altura; y++) {
    cru.set(rgba.subarray(y * largura * 4, (y + 1) * largura * 4), y * linha + 1);
  }
  const ihdr = new Uint8Array(13);
  const vista = new DataView(ihdr.buffer);
  vista.setUint32(0, largura);
  vista.setUint32(4, altura);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const partes = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), ...bloco("IHDR", ihdr)];
  if (perfil) {
    const nome = Uint8Array.from([105, 99, 99, 0, 0]); // "icc", fim do nome, Flate
    const comprimido = zlibSync(perfil);
    const dados = new Uint8Array(nome.length + comprimido.length);
    dados.set(nome);
    dados.set(comprimido, nome.length);
    partes.push(...bloco("iCCP", dados));
  }
  partes.push(...bloco("IDAT", zlibSync(cru, { level: 1 })), ...bloco("IEND", new Uint8Array(0)));
  return new Blob(partes, { type: "image/png" });
}

/**
 * O mesmo PNG de `pngDosPixels`, com o IDAT comprimido pelo compressor NATIVO
 * do navegador (`CompressionStream("deflate")`, que é o formato zlib que o PNG
 * pede). Medido numa arte de 3278×4371: o `zlibSync` em JavaScript levava
 * 856 ms, mais da metade da remoção inteira. Os bytes comprimidos saem
 * diferentes (é outro compressor), os PIXELS são os mesmos — compressão sem
 * perda é sem perda dos dois jeitos. Sem o compressor nativo, vai o de antes.
 */
export async function pngDosPixelsRapido(rgba, largura, altura, perfil = null) {
  if (typeof CompressionStream === "undefined") return pngDosPixels(rgba, largura, altura, perfil);
  const linha = largura * 4 + 1;
  const cru = new Uint8Array(linha * altura);
  for (let y = 0; y < altura; y++) {
    cru.set(rgba.subarray(y * largura * 4, (y + 1) * largura * 4), y * linha + 1);
  }
  const comprimido = new Uint8Array(await new Response(
    new Blob([cru]).stream().pipeThrough(new CompressionStream("deflate")),
  ).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const vista = new DataView(ihdr.buffer);
  vista.setUint32(0, largura);
  vista.setUint32(4, altura);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const partes = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), ...bloco("IHDR", ihdr)];
  if (perfil) {
    const nome = Uint8Array.from([105, 99, 99, 0, 0]); // "icc", fim do nome, Flate
    const dadosDoPerfil = zlibSync(perfil);
    const dados = new Uint8Array(nome.length + dadosDoPerfil.length);
    dados.set(nome);
    dados.set(dadosDoPerfil, nome.length);
    partes.push(...bloco("iCCP", dados));
  }
  partes.push(...bloco("IDAT", comprimido), ...bloco("IEND", new Uint8Array(0)));
  return new Blob(partes, { type: "image/png" });
}

/**
 * A arte de IMAGEM com o fundo tirado, sem giro, num PNG com o perfil de cor
 * do original — ou `null`, quando não há fundo em volta para tirar (a arte já
 * vem transparente, ou sangra até a borda). `forcar` é o "Tirar o fundo"
 * pedido à mão, que tira mesmo fundo escuro. Erro de leitura do arquivo sobe
 * como veio: quem chama sabe dizer qual peça era.
 */
export async function semFundoDoArquivo(blob, forcar, tetoDeLado = 0, aoTerPrevia = null) {
  const perfil = perfilRgbDoArquivo(new Uint8Array(await blob.arrayBuffer()));
  const img = await decodificar(blob);
  let dados, largura, altura;
  try {
    ({ dados, largura, altura } = pixelsDe(img));
  } finally {
    img?.close?.();
  }
  const tirado = tirarFundoDosPixels(dados, largura, altura, forcar);
  if (!tirado) return null;
  suavizarBordaDoFundo(dados, largura, altura, tirado.cor);
  /*
   * A PRÉVIA ANTES DO PNG. A tela e a silhueta do encaixe precisam só da arte
   * sem fundo, reduzida ao `tetoDeLado` — e não do PNG do PDF, que é a parte
   * mais cara da conta. Quem pede a prévia a recebe aqui, e o PNG continua
   * sendo montado depois, sem ninguém esperando por ele.
   */
  if (aoTerPrevia) await aoTerPrevia(await previaDosPixels(dados, largura, altura, tetoDeLado));
  return pngDosPixelsRapido(dados, largura, altura, perfil);
}

/**
 * A arte sem fundo como bitmap para a tela, reduzida ao maior lado
 * `tetoDeLado` com a mesma regra de qualidade da leitura dos arquivos (ver
 * `opcoesDaReducao`, em producao/controlador.js).
 */
export async function previaDosPixels(dados, largura, altura, tetoDeLado = 0) {
  const quadro = new ImageData(dados, largura, altura);
  const maior = Math.max(largura, altura);
  if (!(tetoDeLado > 0) || maior <= tetoDeLado) return createImageBitmap(quadro);
  const fator = tetoDeLado / maior;
  return createImageBitmap(quadro, {
    resizeWidth: Math.max(1, Math.round(largura * fator)),
    resizeHeight: Math.max(1, Math.round(altura * fator)),
    resizeQuality: fator >= 0.5 ? "low" : "high",
  });
}
