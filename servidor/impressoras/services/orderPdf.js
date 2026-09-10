const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const { getOrder, getImage } = require("../db/serviceOrders");
const { brDate } = require("../utils/date");
const { qrDrawOnPdf, qrShortCode } = require("./qrcode");

const STATIONS = [
  { key: "revisao", label: "REVISÃO", note: "Conferir medidas, cores e qualidade de impressão antes de liberar para o corte." },
  { key: "corte", label: "CORTE", note: "Cortar conforme as quantidades indicadas em cada peça." },
  { key: "calandra", label: "CALANDRA", note: "Fixação/calandra conforme o tecido informado." },
  { key: "producao", label: "PRODUÇÃO", note: "Via de controle e arquivo da produção." }
];

const MARGIN = 40;
const PAGE_WIDTH = 515;
const PAGE_BOTTOM = 760;
const ACCENT = "#146fe8";

async function imagesToPng(order) {
  return Promise.all(order.images.map(async img => {
    const stored = getImage(order.id, img.id);
    if (!stored) return null;
    try {
      return await sharp(stored.data)
        .rotate()
        .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }));
}

function drawHeader(doc, order, station) {
  doc.rect(MARGIN, 40, PAGE_WIDTH, 40).fill(ACCENT);
  doc.fillColor("#fff").fontSize(16).text(`OS  —  VIA ${station.label}`, MARGIN + 12, 52);

  // QR pra início de produção (leitura na calandra) — mesmo código em
  // todas as vias da OS, só o texto do cabeçalho muda por estação.
  const qrSize = 34;
  qrDrawOnPdf(doc, qrShortCode("O", order.id), MARGIN + PAGE_WIDTH - qrSize - 8, 43, qrSize, { quiet: 1 });

  doc.fillColor("#111").fontSize(13).text(order.clientName, MARGIN, 90);
  doc.fontSize(9).fillColor("#667085").text(`Ordem de serviço • ${brDate(order.date)}`, MARGIN, 106);

  const summary = [
    order.fabric && `Tecido: ${order.fabric}`,
    order.printSize && `Tamanho: ${order.printSize}`,
    order.meters != null ? `Metragem: ${order.meters} m` : null,
    order.printerOperator && `Impressor: ${order.printerOperator}`,
    order.machine && `Máquina: ${order.machine}`
  ].filter(Boolean).join("     ");
  doc.fontSize(9).fillColor("#344054").text(summary || "—", MARGIN, 124, { width: PAGE_WIDTH });

  let y = 124 + doc.heightOfString(summary || "—", { width: PAGE_WIDTH }) + 8;

  if (order.observation) {
    const obsText = `Observação: ${order.observation}`;
    doc.fontSize(8.5).fillColor("#98a2b3").text(obsText, MARGIN, y, { width: PAGE_WIDTH });
    y += doc.heightOfString(obsText, { width: PAGE_WIDTH }) + 8;
  }

  doc.fontSize(8.5).fillColor("#475467").text(station.note, MARGIN, y, { width: PAGE_WIDTH });
  y += doc.heightOfString(station.note, { width: PAGE_WIDTH }) + 12;

  doc.moveTo(MARGIN, y).lineTo(260, y).strokeColor("#d0d5dd").stroke();
  doc.fontSize(8).fillColor("#667085").text("Assinatura / conferido por", MARGIN, y + 4);
  doc.moveTo(330, y).lineTo(MARGIN + PAGE_WIDTH, y).strokeColor("#d0d5dd").stroke();
  doc.fontSize(8).fillColor("#667085").text("Data / hora", 330, y + 4);

  return y + 26;
}

function drawImagesGrid(doc, order, pngBuffers, startY, showCutInfo) {
  if (!order.images.length) {
    doc.fontSize(10).fillColor("#98a2b3").text("Nenhuma imagem anexada a esta OS.", MARGIN, startY);
    return;
  }

  const cols = 3;
  const gap = 10;
  const cellW = (PAGE_WIDTH - gap * (cols - 1)) / cols;
  const thumbH = cellW * 0.82;
  const labelH = 12;
  const cutInfoH = showCutInfo ? 26 : 0;
  const cellH = thumbH + labelH + cutInfoH + 14;

  let x = MARGIN, y = startY, col = 0;

  order.images.forEach((img, i) => {
    if (y + cellH > PAGE_BOTTOM) {
      doc.addPage();
      doc.fontSize(9).fillColor("#98a2b3").text("(continuação das imagens)", MARGIN, 40);
      y = 62; x = MARGIN; col = 0;
    }

    const png = pngBuffers[i];
    doc.rect(x, y, cellW, thumbH).fillAndStroke("#f4f6f8", "#e4e7ec");
    if (png) {
      try { doc.image(png, x + 3, y + 3, { fit: [cellW - 6, thumbH - 6], align: "center", valign: "center" }); }
      catch { doc.fontSize(8).fillColor("#98a2b3").text("Sem preview", x, y + thumbH / 2 - 4, { width: cellW, align: "center" }); }
    } else {
      doc.fontSize(8).fillColor("#98a2b3").text("Sem preview", x, y + thumbH / 2 - 4, { width: cellW, align: "center" });
    }

    doc.fontSize(7.5).fillColor("#475467")
      .text(img.fileName || "", x, y + thumbH + 3, { width: cellW, align: "center", ellipsis: true });

    if (showCutInfo) {
      const blouseText = img.isBlouse ? "Blusa: Sim" : "Blusa: Não";
      const qtyText = img.isBlouse && img.quantity != null ? `Qtd.: ${img.quantity}` : "";
      doc.fontSize(8).fillColor(ACCENT).text(blouseText, x, y + thumbH + labelH + 4, { width: cellW, align: "center" });
      if (qtyText) doc.fontSize(8).fillColor(ACCENT).text(qtyText, x, y + thumbH + labelH + 15, { width: cellW, align: "center" });
    }

    col++;
    if (col >= cols) { col = 0; x = MARGIN; y += cellH; }
    else { x += cellW + gap; }
  });
}

async function buildOrderPdf(orderId) {
  const order = getOrder(orderId);
  if (!order) return null;

  const pngBuffers = await imagesToPng(order);
  const doc = new PDFDocument({ size: "A4", margin: MARGIN });

  STATIONS.forEach((station, index) => {
    if (index > 0) doc.addPage();
    const bodyStartY = drawHeader(doc, order, station);
    drawImagesGrid(doc, order, pngBuffers, bodyStartY, station.key === "corte");
  });

  doc.end();
  return doc;
}

module.exports = { buildOrderPdf };
