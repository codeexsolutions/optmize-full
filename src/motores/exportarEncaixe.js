/**
 * Artes para impressão: o cálculo usa uma prévia leve, mas o PDF recebe os
 * pixels da fonte original. Girar ou remover fundo gera PNG sem recompressão
 * JPEG; a medida física continua sendo a da peça, definida pelo encaixe.
 */
import { desenharArte } from "./desenhoDoEncaixe";
import { jpegSeguroParaPdf } from "./jpegParaPdf";
import { tirarFundoDosPixels } from "./encaixeMascara";
import { lerArteDoPDF } from "./pdfParaArte";
import { DPI_PDF } from "./resolucaoDaArte";

export const paraBlob = (canvas, tipo = "image/png") =>
  new Promise((pronto, falhou) => canvas.toBlob(
    blob => blob ? pronto(blob) : falhou(new Error("A arte excedeu a capacidade de imagem do navegador.")), tipo));

async function fonteDaPeca(peca) {
  if (peca.pdfOriginal) {
    const arte = await lerArteDoPDF(peca.pdfOriginal, {
      tetoDeLado: cm => Math.ceil(cm / 2.54 * DPI_PDF),
    });
    URL.revokeObjectURL(arte.endereco);
    return { blob: arte.blob, img: arte.bitmap };
  }
  let blob = peca.arquivoOriginal;
  if (!blob) {
    const origem = peca.srcOriginal || peca.src;
    if (!origem) throw new Error(`A fonte de "${peca.nome || "peça"}" não está disponível.`);
    const resposta = await fetch(origem);
    if (!resposta.ok) throw new Error(`Não consegui ler a arte de "${peca.nome || "peça"}".`);
    blob = await resposta.blob();
  }
  return { blob, img: null };
}

function ehPng(bytes) {
  return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
}

async function decodificar(blob) {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
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

/** A rotação troca largura e altura em pixels, sem redimensionar a arte. */
export async function desenharPecaGirada(peca, rot) {
  const fonte = await fonteDaPeca(peca);
  let img = fonte.img;
  let canvasFonte;
  let canvas;
  try {
    const bytes = new Uint8Array(await fonte.blob.arrayBuffer());
    if (rot === 0 && !peca.fundoNaExportacao && (ehPng(bytes) || jpegSeguroParaPdf(bytes))) {
      // Passa os bytes originais mesmo quando são maiores que uma prévia.
      return fonte.blob;
    }
    img ||= await decodificar(fonte.blob);
    const larguraOriginal = img.naturalWidth || img.width;
    const alturaOriginal = img.naturalHeight || img.height;
    if (!(larguraOriginal > 0 && alturaOriginal > 0)) throw new Error("A arte original está vazia.");

    let desenho = img;
    if (peca.fundoNaExportacao) {
      canvasFonte = document.createElement("canvas");
      canvasFonte.width = larguraOriginal;
      canvasFonte.height = alturaOriginal;
      const ctx = canvasFonte.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Não há memória para preparar a arte original.");
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, larguraOriginal, alturaOriginal);
      const mudou = tirarFundoDosPixels(pixels.data, larguraOriginal, alturaOriginal,
        peca.fundoNaExportacao === "forcar");
      if (mudou) ctx.putImageData(pixels, 0, 0);
      desenho = canvasFonte;
    }

    canvas = document.createElement("canvas");
    const deitada = rot === 90 || rot === 270;
    canvas.width = deitada ? alturaOriginal : larguraOriginal;
    canvas.height = deitada ? larguraOriginal : alturaOriginal;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não há memória para exportar a arte original.");
    ctx.imageSmoothingEnabled = false;
    desenharArte(ctx, { item: { img: desenho }, rot }, 0, 0, canvas.width, canvas.height);
    return await paraBlob(canvas);
  } finally {
    img?.close?.();
    if (canvasFonte) { canvasFonte.width = 0; canvasFonte.height = 0; }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** Prepara cada arte uma vez por rotação, preservando os pixels originais. */
export async function prepararArtes(posicoes) {
  const artes = new Map();
  for (const p of posicoes) {
    const rot = p.rot || (p.girado ? 90 : 0);
    const chave = `${p.item.indice}-${rot}`;
    if (!artes.has(chave)) artes.set(chave, await desenharPecaGirada(p.item, rot));
  }
  return artes;
}
