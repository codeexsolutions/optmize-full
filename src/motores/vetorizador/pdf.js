/**
 * O PDF DO VETOR — o mesmo desenho do SVG, em pontos.
 *
 * Cada forma vira um caminho preenchido, na ordem do SVG (o empilhamento, ver
 * `empilhar` em montar.js), numa página do tamanho pedido em centímetros.
 *
 * O preenchimento é PAR-ÍMPAR (`f*`), a mesma regra do SVG
 * (`fill-rule="evenodd"`, ver o cabeçalho de montar.js): o furo fica furo
 * seja qual for o sentido do anel. O `drawSvgPath` do pdf-lib preenche pela
 * regra do não-zero (`f`), que pintaria o furo de um anel que por acaso
 * girasse no mesmo sentido do contorno de fora — então o operador é trocado.
 *
 * A costura (o traço fino por baixo das divisas, ver `caminhosDaCostura`)
 * não vai: ela esconde um defeito do desenho na TELA, o fio claro do
 * antisserrilhado entre duas formas vizinhas, que a impressão não tem.
 *
 * `vetor`: `{ formas: [{ cor: "#rrggbb", d }], largura, altura }` (as
 * `estatisticas` do vetorizador dão a largura e a altura). Devolve os bytes.
 */
import { PDFDocument, PDFOperator, PDFOperatorNames, drawSvgPath, rgb } from "pdf-lib";

export async function pdfDoVetor({ formas, largura, altura }, larguraCm) {
  const pdf = await PDFDocument.create();
  pdf.setProducer("Optmize — Vetorizar");
  const larguraPt = (larguraCm / 2.54) * 72;
  const alturaPt = larguraPt * (altura / largura);
  const pagina = pdf.addPage([larguraPt, alturaPt]);
  const escala = larguraPt / largura;
  for (const f of formas) {
    if (!f.d) continue;
    const n = Number.parseInt(f.cor.slice(1), 16);
    const cor = rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    // O SVG desce no y e o PDF sobe: o drawSvgPath vira o eixo (escala −y)
    // a partir do canto de cima da página.
    const operadores = drawSvgPath(f.d, { x: 0, y: alturaPt, scale: escala, color: cor });
    const k = operadores.findIndex((o) => o.name === PDFOperatorNames.FillNonZero);
    if (k >= 0) operadores[k] = PDFOperator.of(PDFOperatorNames.FillEvenOdd);
    pagina.pushOperators(...operadores);
  }
  return pdf.save();
}
