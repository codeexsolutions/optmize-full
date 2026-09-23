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
import { paraBlob } from "../utils/arquivoDeImagem";

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

/** A rotação troca largura e altura em pixels, sem redimensionar a arte. */
export async function desenharPecaGirada(peca, rot) {
  const fonte = await fonteDaPeca(peca);
  let img = fonte.img;
  let canvasFonte;
  let canvas;
  try {
    const bytes = new Uint8Array(await fonte.blob.arrayBuffer()
      .catch((erro) => { throw arteIlegivel(erro, peca); }));
    if (rot === 0 && !peca.fundoNaExportacao && (ehPng(bytes) || jpegSeguroParaPdf(bytes))) {
      // Passa os bytes originais mesmo quando são maiores que uma prévia.
      return fonte.blob;
    }
    // A decodificação lê o arquivo de novo, e falha pelo mesmo motivo quando
    // ele mudou: o recado tem de ser o mesmo dos bytes, acima.
    img ||= await decodificar(fonte.blob)
      .catch((erro) => { throw ehFalhaDeLeitura(erro) ? arteIlegivel(erro, peca) : erro; });
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
    // A chave é a do giro do ENCAIXE, que é como o PDF procura a arte; a arte
    // sai girada pelo total, contando o giro que a peça recebeu antes (ver "O
    // GIRO DA PEÇA ANTES DO ENCAIXE", em encaixeMascara.js).
    const chave = `${p.item.indice}-${rot}`;
    const total = (rot + (Number(p.item.rotacaoBase) || 0)) % 360;
    if (!artes.has(chave)) artes.set(chave, await desenharPecaGirada(p.item, total));
  }
  return artes;
}
