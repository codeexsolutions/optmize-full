/**
 * Uma miniatura da arte, desenhada pelo navegador.
 *
 * É o mesmo `createImageBitmap` que o Encaixe usa, e usar o mesmo caminho é o
 * ponto: o que aparece na comparação da tela de Cor é o que apareceria lá.
 *
 * O `resizeWidth` NÃO evita a decodificação da imagem cheia — medido, uma arte
 * de 65 megapixels leva os mesmos 3,8 s com e sem ele. Ele serve para o
 * resultado já sair no tamanho certo, sem um segundo canvas gigante no meio.
 */

/** Quanto a miniatura da comparação tem de largura. */
export const MINIATURA_LARGURA = 420;

export async function miniaturaDaArte(blob, larguraReal, alturaReal) {
  const largura = Math.min(MINIATURA_LARGURA, larguraReal);
  const altura = Math.max(1, Math.round(alturaReal * largura / larguraReal));
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: largura, resizeHeight: altura, resizeQuality: "high",
  });
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
