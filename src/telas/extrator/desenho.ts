/**
 * O canvas do Extrator: a foto que entra, a foto de trabalho e as imagens dos
 * elementos. A conta mora nos motores; aqui é só o que precisa do navegador.
 */
import { fotoGrandeDemais, tamanhoDeTrabalho } from "../../motores/extrator";
import type { Imagem, Pixels, Recorte, Trabalho } from "./tipos";

function contexto(c: HTMLCanvasElement, lendo = false): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", lendo ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error("O navegador não deu um canvas para desenhar.");
  return ctx;
}

export function canvasCom(pixels: Pixels, largura: number, altura: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  contexto(c).putImageData(new ImageData(pixels, largura, altura), 0, 0);
  return c;
}

/** A foto inteira, em pixels, já em pé pelo EXIF. */
export async function lerFoto(file: File): Promise<Imagem> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Não consegui abrir "${file.name}": o Extrator lê JPG, PNG e WebP.`);
  }
  try {
    const grande = fotoGrandeDemais(bitmap.width, bitmap.height);
    if (grande) throw new Error(grande);
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = contexto(c, true);
    ctx.drawImage(bitmap, 0, 0);
    return { pixels: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, largura: bitmap.width, altura: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/**
 * A foto de trabalho: reduzida a 2048 de lado, em JPEG para o servidor e em
 * bitmap para a mesa. O transparente vira branco (no JPEG ele viraria preto,
 * e a rede leria um contorno escuro que a arte não tem).
 */
export async function trabalhoDe(foto: Imagem): Promise<Trabalho> {
  const t = tamanhoDeTrabalho(foto.largura, foto.altura);
  const c = document.createElement("canvas");
  c.width = t.largura;
  c.height = t.altura;
  const ctx = contexto(c);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, t.largura, t.altura);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvasCom(foto.pixels, foto.largura, foto.altura), 0, 0, t.largura, t.altura);
  const jpeg = await new Promise<Blob>((pronto, falhou) => c.toBlob(
    (b) => (b ? pronto(b) : falhou(new Error("A foto passou do que o navegador guarda como imagem."))),
    "image/jpeg", 0.92,
  ));
  return { bitmap: await createImageBitmap(c), jpeg, largura: t.largura, altura: t.altura, escala: t.escala };
}

/** O elemento em PNG (data URL), com o lado maior em até `lado` px: a miniatura da lista e a prévia. */
export function dataUrlDoRecorte(r: Recorte, lado: number): string {
  const k = Math.min(1, lado / Math.max(r.largura, r.altura));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(r.largura * k));
  c.height = Math.max(1, Math.round(r.altura * k));
  const ctx = contexto(c);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvasCom(r.rgba, r.largura, r.altura), 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}
