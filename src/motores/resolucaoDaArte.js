// A prévia economiza memória durante o cálculo; não limita imagens exportadas.
export const DPI_PREVIA = 150;
// PDFs de entrada são rasterizados novamente a 300 dpi para impressão.
export const DPI_PDF = 300;

export const LADO_MAX_PREVIA = 3072;

export function ladoDaPrevia(cm) {
  return Math.min(LADO_MAX_PREVIA, Math.max(600, Math.round(cm / 2.54 * DPI_PREVIA * 1.3)));
}
