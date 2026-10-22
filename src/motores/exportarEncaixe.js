/**
 * Artes para impressão: o cálculo usa uma prévia leve, mas o PDF recebe a
 * arte ORIGINAL, do jeito que ela chegou — e quem gira é o servidor.
 *
 * ===========================================================================
 * POR QUE A ARTE NÃO PASSA MAIS PELO CANVAS (2026-10-19)
 * ===========================================================================
 *
 * Até aqui, toda peça girada, todo JPEG "fora do padrão" e todo PDF passavam
 * por um canvas antes de ir para o PDF. Em uso contínuo a produção mostrou o
 * preço disso, em fotos da mesa e do Corel:
 *
 *   - COR MUDANDO. O navegador converte a arte para sRGB ao decodificar, e o
 *     PNG que sai do canvas perde o perfil de cor. A mesma arte saía com uma
 *     cor quando ia direto e com outra quando ia girada — dois roxos no mesmo
 *     rolo.
 *   - BORDA SUJA E DEGRADÊ ESTRAGADO. O canvas guarda a cor multiplicada pelo
 *     alfa; sombra, brilho e borda suave de arte de DTF voltam com a cor
 *     arredondada.
 *   - VETOR VIRANDO PIXEL. O PDF de arte (Corel, Illustrator) era desenhado
 *     pelo pdf.js a 300 dpi, com a conversão de CMYK dele, e embutido como
 *     imagem: letra serrilhada e cor diferente da que o cliente aprovou.
 *
 * Agora:
 *
 *   - imagem sem remoção de fundo: vão os BYTES do arquivo, intocados, e o
 *     servidor gira sem perda e respeita o perfil de cor (encaixe-pdf.js);
 *   - PDF de arte: vai o PRÓPRIO PDF, e a página entra no rolo como vetor;
 *   - remoção de fundo: é a única conta que precisa dos pixels. Ela é feita
 *     aqui, sem girar, a borda é suavizada (`suavizarBordaDoFundo`) e o PNG é
 *     montado à mão, com o perfil de cor do original — sem `toBlob`.
 *
 * Quando o servidor não consegue ler o arquivo (formato que o leitor dele não
 * conhece, PDF quebrado), ele avisa na hora do envio e a tela manda a arte
 * desenhada, que é `arteDesenhadaDaPeca` — o caminho antigo, só como reserva.
 */
import { zlibSync, unzlibSync } from "fflate";
import { suavizarBordaDoFundo, tirarFundoDosPixels } from "./encaixeMascara";
import { lerArteDoPDF } from "./pdfParaArte";
import { DPI_PDF } from "./resolucaoDaArte";

async function blobDaPeca(peca) {
  let blob = peca.arquivoOriginal;
  if (!blob) {
    const origem = peca.srcOriginal || peca.src;
    if (!origem) throw new Error(`A fonte de "${peca.nome || "peça"}" não está disponível.`);
    const resposta = await fetch(origem);
    if (!resposta.ok) throw new Error(`Não consegui ler a arte de "${peca.nome || "peça"}".`);
    blob = await resposta.blob();
  }
  return blob;
}

function ehPng(bytes) {
  return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
}

/*
 * Decodifica SEM gerenciar cor e sem multiplicar pelo alfa: os números que
 * saem são os do arquivo, e o perfil dele vai junto no PNG (ver
 * `perfilRgbDoArquivo`). A orientação do EXIF continua valendo, que é como a
 * prévia da tela mostra a arte.
 */
async function decodificar(blob) {
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

/*
 * ===========================================================================
 * A ARTE QUE MUDOU NO DISCO DEPOIS DE ENTRAR NA LISTA
 * ===========================================================================
 *
 * O programa guarda a REFERÊNCIA do arquivo, e não os bytes: é isso que
 * permite ao PDF levar os pixels do original sem o navegador segurar centenas
 * de MB durante o trabalho inteiro. O preço é que a leitura acontece lá na
 * frente, na hora de exportar — e até lá o arquivo pode ter mudado.
 *
 * Basta salvar a arte de novo por cima, no Photoshop ou no Corel, com a peça
 * já na lista: a referência morre e a leitura falha. É comum, porque ajustar a
 * arte e reexportar é exatamente o que se faz enquanto o encaixe está aberto.
 *
 * O navegador responde a isso com "The requested file could not be read,
 * typically due to permission problems that have occurred after a reference to
 * a file was acquired" — que subia inteiro para a tela, sem dizer QUAL arte
 * entre as vinte da lista nem o que fazer a respeito. Quem lê isso no meio do
 * expediente não tem por onde começar.
 */
function arteIlegivel(erro, peca) {
  const nome = (peca && peca.nome) || "a arte";
  const sumiu = erro && (erro.name === "NotFoundError" || /not be found/i.test(erro.message || ""));
  return new Error(`a arte "${nome}" não pôde ser lida do disco — `
    + (sumiu
      ? "o arquivo foi movido ou apagado depois de a peça entrar na lista."
      : "o arquivo mudou depois de a peça entrar na lista (foi salvo de novo por cima?).")
    + " Arraste a arte para a tela outra vez e exporte de novo.");
}

/** O erro é de leitura do arquivo, e não de conta nossa? */
function ehFalhaDeLeitura(erro) {
  if (!erro) return false;
  return erro.name === "NotReadableError" || erro.name === "NotFoundError"
    || /could not be read|could not be found/i.test(erro.message || "");
}

async function lerBytes(blob, peca) {
  return new Uint8Array(await blob.arrayBuffer().catch((erro) => { throw arteIlegivel(erro, peca); }));
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

// ==================== OS CAMINHOS DA ARTE ====================

/** Os pixels da arte, crus, a partir de uma imagem já decodificada. */
function pixelsDe(img) {
  const largura = img.naturalWidth || img.width;
  const altura = img.naturalHeight || img.height;
  if (!(largura > 0 && altura > 0)) throw new Error("A arte original está vazia.");
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Não há memória para preparar a arte original.");
    ctx.drawImage(img, 0, 0);
    return { dados: ctx.getImageData(0, 0, largura, altura).data, largura, altura };
  } finally { canvas.width = 0; canvas.height = 0; }
}

const tetoDoPdf = (cm) => Math.ceil(cm / 2.54 * DPI_PDF);

/** A página do PDF desenhada, para quando o vetor não pode ir (remoção de fundo, reserva). */
async function pdfDesenhado(peca) {
  const arte = await lerArteDoPDF(peca.pdfOriginal, { tetoDeLado: tetoDoPdf });
  URL.revokeObjectURL(arte.endereco);
  return arte;
}

/**
 * A arte com o fundo tirado, SEM giro, num PNG com o perfil de cor do original.
 * A borda que encosta no fundo é suavizada em vez de cortada a seco: é ela que
 * deixava o contorno claro e serrilhado em volta da arte.
 */
async function arteSemFundo(peca) {
  let img;
  let perfil = null;
  try {
    if (peca.pdfOriginal) {
      img = (await pdfDesenhado(peca)).bitmap;
    } else {
      const blob = await blobDaPeca(peca);
      perfil = perfilRgbDoArquivo(await lerBytes(blob, peca));
      img = await decodificar(blob)
        .catch((erro) => { throw ehFalhaDeLeitura(erro) ? arteIlegivel(erro, peca) : erro; });
    }
    const { dados, largura, altura } = pixelsDe(img);
    const tirado = tirarFundoDosPixels(dados, largura, altura, peca.fundoNaExportacao === "forcar");
    if (tirado) suavizarBordaDoFundo(dados, largura, altura, tirado.cor);
    return pngDosPixels(dados, largura, altura, perfil);
  } finally {
    img?.close?.();
  }
}

/**
 * O que vai para o servidor por uma peça, ainda sem giro nenhum.
 *
 * `{ arte, vetor }`: `vetor` diz que a arte é o próprio PDF da peça, que o
 * servidor embute como desenho e não como imagem.
 */
export async function arteDaPeca(peca) {
  if (peca.fundoNaExportacao) return { arte: await arteSemFundo(peca), vetor: false };
  if (peca.pdfOriginal) {
    // Lido agora para o recado de arquivo mudado ser o mesmo das imagens.
    await lerBytes(peca.pdfOriginal.slice(0, 5), peca);
    return { arte: peca.pdfOriginal, vetor: true };
  }
  const blob = await blobDaPeca(peca);
  await lerBytes(blob.slice(0, 16), peca);
  return { arte: blob, vetor: false };
}

/**
 * A reserva: a arte desenhada num PNG, para quando o servidor não consegue
 * ler o arquivo original. Continua sem giro e com o perfil de cor do original.
 */
export async function arteDesenhadaDaPeca(peca) {
  if (peca.fundoNaExportacao) return arteSemFundo(peca);
  let img;
  let perfil = null;
  try {
    if (peca.pdfOriginal) {
      img = (await pdfDesenhado(peca)).bitmap;
    } else {
      const blob = await blobDaPeca(peca);
      perfil = perfilRgbDoArquivo(await lerBytes(blob, peca));
      img = await decodificar(blob)
        .catch((erro) => { throw ehFalhaDeLeitura(erro) ? arteIlegivel(erro, peca) : erro; });
    }
    const { dados, largura, altura } = pixelsDe(img);
    return pngDosPixels(dados, largura, altura, perfil);
  } finally {
    img?.close?.();
  }
}

/**
 * A reserva já no giro final, para o PDF que o servidor não abre.
 *
 * O PDF é desenhado direto na rotação pedida (`giro`, no sentido do relógio):
 * sai só o PNG, sem o bitmap e o segundo canvas que girar depois custaria, e
 * a rasterização é a de 300 dpi de sempre. Devolve `{ arte, giro }`, onde
 * `giro` é o que o servidor ainda precisa aplicar — 0 quando já foi feito aqui.
 * Imagem e arte sem fundo seguem como em `arteDesenhadaDaPeca`: sem giro, e
 * com o giro todo por conta do servidor.
 */
export async function desenharPecaGirada(peca, giro) {
  if (peca.pdfOriginal && !peca.fundoNaExportacao) {
    const { blob } = await lerArteDoPDF(peca.pdfOriginal, {
      tetoDeLado: tetoDoPdf,
      somenteBlob: true,
      rotacao: giro,
    });
    return { arte: blob, giro: 0 };
  }
  return { arte: await arteDesenhadaDaPeca(peca), giro };
}

/**
 * Uma arte por chave de giro do ENCAIXE, que é como o PDF procura a arte. O
 * `giro` que acompanha é o total, contando o giro que a peça recebeu antes
 * (ver "O GIRO DA PEÇA ANTES DO ENCAIXE", em encaixeMascara.js); quem o aplica
 * é o servidor. Peças iguais em giros diferentes leem o arquivo uma vez só.
 */
export async function prepararArtes(posicoes) {
  const artes = new Map();
  const porPeca = new Map();
  for (const p of posicoes) {
    const rot = p.rot || (p.girado ? 90 : 0);
    const chave = `${p.item.indice}-${rot}`;
    if (artes.has(chave)) continue;
    const giro = (rot + (Number(p.item.rotacaoBase) || 0)) % 360;
    if (!porPeca.has(p.item)) porPeca.set(p.item, await arteDaPeca(p.item));
    artes.set(chave, { ...porPeca.get(p.item), giro, peca: p.item });
  }
  return artes;
}
