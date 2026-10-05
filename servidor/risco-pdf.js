/**
 * ===========================================================================
 * O PDF DO RISCO — o contorno em tamanho real, para imprimir e cortar
 * ===========================================================================
 *
 * Recebe os riscos que a tela Digitalizar achou, já em centímetros, e devolve
 * um PDF em TAMANHO REAL: uma página do tamanho exato do conjunto, com cada
 * peça desenhada como um contorno fechado.
 *
 * Não confundir com `encaixe-pdf.js`, que é o PDF do ENCAIXE — aquele leva as
 * artes rasterizadas, a largura do tecido e as posições que o encaixe achou.
 * Aqui não há arte nem tecido: é linha, e só linha.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O PDF SAI DO SERVIDOR, E NÃO DA TELA
 * ---------------------------------------------------------------------------
 *
 * O `pdfkit` já é dependência do projeto e já gera o PDF do encaixe, então o
 * risco não precisa de biblioteca nova nem de um escritor de PDF feito à mão
 * na tela. E o servidor está sempre ali: no navegador da fábrica e dentro do
 * app instalado, que é o mesmo servidor (ver `src-tauri/src/main.rs`).
 *
 * ---------------------------------------------------------------------------
 * TAMANHO REAL É O ÚNICO PONTO QUE IMPORTA AQUI
 * ---------------------------------------------------------------------------
 *
 * Este PDF existe para ser impresso e servir de gabarito — em plotter, ou em
 * folhas coladas. Se ele sair reduzido para "caber na folha", como um visual-
 * izador faria por conta, o gabarito não vale nada e o erro só aparece com o
 * papel na mão.
 *
 * Por isso a página tem o tamanho do desenho, e não um formato de papel: o
 * PDF mede em pontos, 72 por polegada, então centímetro vira ponto por
 * `PT_POR_CM` e mais nada. Sem margem, sem ajuste, sem escala.
 *
 * Quem for imprimir precisa mandar em 100% / "tamanho real" no diálogo de
 * impressão — é a única parte que este arquivo não consegue garantir.
 *
 * ---------------------------------------------------------------------------
 * AS MARCAÇÕES DA MONTAGEM
 * ---------------------------------------------------------------------------
 *
 * A tela de Montagem manda, por peça, o `corte` (nós), e opcionalmente a
 * `costura` (tracejada), os `piques` (traço), os `pontos` (cruz com círculo),
 * o `fio` (linha com setas) e o `texto` (papel, tamanho, quantidade). Quem
 * CALCULA tudo isso é `motores/montagem.js` (`desenhoDaPeca`); aqui só se
 * pinta. O corpo antigo, com `nos` no lugar de `corte`, continua valendo.
 */

const express = require("express");

const router = express.Router();

const PT_POR_CM = 72 / 2.54;

/** Teto de segurança: 20 metros de lado já é mais que qualquer mesa. */
const LADO_MAXIMO_CM = 2000;
/** Teto de nós, para um corpo malformado não virar um PDF de gigabytes. */
const NOS_MAXIMOS = 100000;

/** Um número finito e positivo, ou `null`. */
function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Lista de nós em cm, deslocada para a posição da peça. `null` se quebrada. */
function lerNos(nos, emX, emY) {
  if (!Array.isArray(nos) || nos.length < 2) return null;
  const limpos = [];
  for (const n of nos) {
    const x = numero(n && n.x);
    const y = numero(n && n.y);
    if (x === null || y === null) return null;
    // Alça que não veio cai em cima do próprio nó: a curva vira reta.
    const alca = (a) => {
      const ax = numero(a && a.x);
      const ay = numero(a && a.y);
      return { x: (ax === null ? x : ax) + emX, y: (ay === null ? y : ay) + emY };
    };
    limpos.push({ x: x + emX, y: y + emY, entrada: alca(n.entrada), saida: alca(n.saida), retaDepois: !!n.retaDepois });
  }
  return limpos;
}

function lerPontoEm(p, emX, emY) {
  // `numero(null)` vale 0 (é o comportamento certo para a alça que falta em
  // `lerNos`), mas aqui um ponto null/undefined — ou com x/y null/undefined —
  // é lixo, não a origem: tem que cair fora, não virar (emX, emY).
  if (p == null || typeof p !== "object" || p.x == null || p.y == null) return null;
  const x = numero(p.x);
  const y = numero(p.y);
  return x === null || y === null ? null : { x: x + emX, y: y + emY };
}

/**
 * Confere o corpo e devolve as peças prontas para desenhar, ou uma mensagem.
 *
 * A conferência é chata de propósito: este PDF vira gabarito de corte, e é
 * melhor recusar um pedido estranho do que gravar um arquivo torto.
 */
/** A linha em volta da peça, em cm (a Montagem manda o mm ÷ 10): de 0 a 1. Texto ou negativo: sem linha. */
function lerLinha(valor) {
  const n = numero(valor);
  if (!(n > 0)) return 0;
  return Math.min(1, n);
}

function lerPecas(corpo) {
  if (!corpo || typeof corpo !== "object") return { erro: "Não veio nada no pedido." };
  const cruas = Array.isArray(corpo.pecas) ? corpo.pecas : null;
  if (!cruas || cruas.length === 0) return { erro: "O pedido não trouxe peça nenhuma." };

  let totalDeNos = 0;
  const pecas = [];
  // Meia linha fica FORA da peça: todas se deslocam isso para dentro da página (ver `medir`).
  const borda = Math.max(0, ...cruas.map((c) => lerLinha(c && c.linha) / 2));
  for (let i = 0; i < cruas.length; i++) {
    const crua = cruas[i] || {};
    const emX = (numero(crua.emX) || 0) + borda;
    const emY = (numero(crua.emY) || 0) + borda;
    const corte = lerNos(crua.corte || crua.nos, emX, emY);
    if (!corte) return { erro: `A peça ${i + 1} não tem contorno (precisa de pelo menos 2 nós).` };
    const costura = crua.costura ? lerNos(crua.costura, emX, emY) : null;
    totalDeNos += corte.length + (costura ? costura.length : 0);
    if (totalDeNos > NOS_MAXIMOS) {
      return { erro: `O pedido passou de ${NOS_MAXIMOS} nós no total; isso não é um risco de molde.` };
    }
    const piques = (Array.isArray(crua.piques) ? crua.piques : [])
      .map((p) => ({ de: lerPontoEm(p && p.de, emX, emY), ate: lerPontoEm(p && p.ate, emX, emY) }))
      .filter((p) => p.de && p.ate);
    const pontos = (Array.isArray(crua.pontos) ? crua.pontos : []).map((p) => lerPontoEm(p, emX, emY)).filter(Boolean);
    let fio = null;
    if (crua.fio && Array.isArray(crua.fio.linha)) {
      const linha = crua.fio.linha.map((p) => lerPontoEm(p, emX, emY));
      const setas = (Array.isArray(crua.fio.setas) ? crua.fio.setas : [])
        .map((s) => (Array.isArray(s) ? s.map((p) => lerPontoEm(p, emX, emY)) : []))
        .filter((s) => s.length >= 2 && s.every(Boolean));
      if (linha.length === 2 && linha.every(Boolean)) fio = { linha, setas };
    }
    let texto = null;
    if (crua.texto && Array.isArray(crua.texto.linhas)) {
      const onde = lerPontoEm(crua.texto, emX, emY);
      const tamanho = numero(crua.texto.tamanho);
      if (onde && tamanho > 0) {
        texto = { ...onde, tamanho: Math.min(tamanho, 5), linhas: crua.texto.linhas.slice(0, 4).map((l) => String(l).slice(0, 80)) };
      }
    }
    pecas.push({ corte, costura, piques, pontos, fio, texto, linha: lerLinha(crua.linha) });
  }
  return { pecas };
}

function naCurva(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/**
 * O tamanho da página: a caixa do CORTE, percorrendo as curvas.
 *
 * Pelos nós, a barriga da curva ficaria fora do papel. Pelas alças, o
 * contrário: alça é ponto de CONTROLE, não fica sobre a curva — com alças
 * compridas a página chegou a sair 10 cm maior que o desenho, e a bancada
 * pegou (78,8 cm num risco de 68). Os piques entram também: com margem, o
 * pique começa na linha de corte e não pode sair do papel.
 */
function medir(pecas) {
  let largura = 0;
  let altura = 0;
  const olhar = (q) => {
    if (q.x > largura) largura = q.x;
    if (q.y > altura) altura = q.y;
  };
  for (const { corte, piques } of pecas) {
    for (let i = 0; i < corte.length; i++) {
      const a = corte[i];
      const b = corte[(i + 1) % corte.length];
      olhar(a);
      if (a.retaDepois) continue;
      for (let k = 1; k < 16; k++) olhar(naCurva(a, a.saida, b.entrada, b, k / 16));
    }
    for (const p of piques) { olhar(p.de); olhar(p.ate); }
  }
  // A página cresce a meia linha da borda de baixo e da direita (a de cima e a da esquerda já
  // entraram no deslocamento de `lerPecas`).
  const borda = Math.max(0, ...pecas.map((p) => (p.linha > 0 ? p.linha / 2 : 0)));
  return { largura: largura + borda, altura: altura + borda };
}

const pt = (v) => v * PT_POR_CM;

function caminho(doc, nos) {
  doc.moveTo(pt(nos[0].x), pt(nos[0].y));
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i];
    const b = nos[(i + 1) % nos.length];
    // Reta é reta também no PDF: uma cúbica com as alças em cima dos nós
    // desenha igual, mas engorda o arquivo e mente sobre o que o trecho é.
    if (a.retaDepois) doc.lineTo(pt(b.x), pt(b.y));
    else doc.bezierCurveTo(pt(a.saida.x), pt(a.saida.y), pt(b.entrada.x), pt(b.entrada.y), pt(b.x), pt(b.y));
  }
  doc.closePath();
}

/** Pinta as peças lidas no documento. Traço fino e constante: é linha de corte, não desenho. */
function desenharPdf(doc, pecas) {
  doc.strokeColor("#000000").fillColor("#000000");
  // O `doc.text` do pdfkit decide sozinho, pela altura restante da página,
  // que "não cabe" e chama `addPage()` — mesmo com `lineBreak: false` — e um
  // texto perto do fim (peça com etiqueta rente à borda) já bastou para
  // disparar isso. Este PDF é gabarito: só pode ter UMA página, do tamanho do
  // corte, nunca duas. Neutralizar `addPage` enquanto desenha é mais robusto
  // que tentar acertar as opções de `text` para todo caso de borda.
  const addPageOriginal = doc.addPage.bind(doc);
  doc.addPage = () => doc;
  try {
    for (const p of pecas) {
      // Com a linha em volta, o corte sai na grossura dela, quinas vivas; sem, o traço fino de gabarito.
      if (p.linha > 0) doc.lineWidth(p.linha * PT_POR_CM).lineJoin("miter").miterLimit(2).undash();
      else doc.lineWidth(0.05 * PT_POR_CM).undash();
      caminho(doc, p.corte);
      doc.stroke();
      if (p.costura) {
        doc.lineWidth(0.03 * PT_POR_CM).dash(0.4 * PT_POR_CM, { space: 0.25 * PT_POR_CM });
        caminho(doc, p.costura);
        doc.stroke();
        doc.undash();
      }
      doc.lineWidth(0.05 * PT_POR_CM);
      for (const q of p.piques) doc.moveTo(pt(q.de.x), pt(q.de.y)).lineTo(pt(q.ate.x), pt(q.ate.y)).stroke();
      doc.lineWidth(0.03 * PT_POR_CM);
      for (const q of p.pontos) {
        doc.circle(pt(q.x), pt(q.y), pt(0.3)).stroke();
        doc.moveTo(pt(q.x - 0.4), pt(q.y)).lineTo(pt(q.x + 0.4), pt(q.y)).stroke();
        doc.moveTo(pt(q.x), pt(q.y - 0.4)).lineTo(pt(q.x), pt(q.y + 0.4)).stroke();
      }
      if (p.fio) {
        doc.lineWidth(0.04 * PT_POR_CM);
        doc.moveTo(pt(p.fio.linha[0].x), pt(p.fio.linha[0].y)).lineTo(pt(p.fio.linha[1].x), pt(p.fio.linha[1].y)).stroke();
        for (const s of p.fio.setas) {
          doc.moveTo(pt(s[0].x), pt(s[0].y));
          for (const q of s.slice(1)) doc.lineTo(pt(q.x), pt(q.y));
          doc.stroke();
        }
      }
      if (p.texto) {
        const largura = pt(30);
        doc.fontSize(pt(p.texto.tamanho));
        p.texto.linhas.forEach((linha, i) => {
          doc.text(linha, pt(p.texto.x) - largura / 2, pt(p.texto.y + i * p.texto.tamanho * 1.3) - pt(p.texto.tamanho),
            { width: largura, align: "center", lineBreak: false });
        });
      }
    }
  } finally {
    doc.addPage = addPageOriginal;
  }
}

/**
 * POST /api/risco/pdf
 *
 * Corpo: `{ nome?, pecas: [{ corte | nos, emX?, emY?, costura?, piques?,
 * pontos?, fio?, texto? }] }`, tudo em centímetros. Ver `lerPecas`.
 */
router.post("/pdf", express.json({ limit: "20mb" }), (req, res) => {
  const lido = lerPecas(req.body);
  if (lido.erro) {
    res.status(400).json({ error: lido.erro });
    return;
  }
  const { pecas } = lido;
  const { largura, altura } = medir(pecas);
  if (!(largura > 0) || !(altura > 0)) {
    res.status(400).json({ error: "O risco tem largura ou altura zero." });
    return;
  }
  if (largura > LADO_MAXIMO_CM || altura > LADO_MAXIMO_CM) {
    res.status(400).json({
      error: `O risco mediu ${largura.toFixed(0)} × ${altura.toFixed(0)} cm, acima do limite de`
        + ` ${LADO_MAXIMO_CM} cm. Confira a medida que foi informada.`,
    });
    return;
  }

  const PDFDocument = require("pdfkit");
  const nome = String((req.body && req.body.nome) || "molde").replace(/[^\w\-. ]+/g, "_").slice(0, 60) || "molde";
  const doc = new PDFDocument({
    size: [largura * PT_POR_CM, altura * PT_POR_CM],
    margin: 0,
    info: { Title: `Risco de ${nome} — ${largura.toFixed(1)} x ${altura.toFixed(1)} cm`, Creator: "CodeEx Optmize" },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}-risco.pdf"`);
  doc.pipe(res);
  desenharPdf(doc, pecas);
  doc.end();
});

module.exports = router;
module.exports.lerPecas = lerPecas;
module.exports.medir = medir;
module.exports.desenharPdf = desenharPdf;
