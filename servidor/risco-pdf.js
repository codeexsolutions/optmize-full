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

/**
 * Confere o corpo e devolve as peças prontas para desenhar, ou uma mensagem.
 *
 * A conferência é chata de propósito: este PDF vira gabarito de corte, e é
 * melhor recusar um pedido estranho do que gravar um arquivo torto que só vai
 * ser descoberto depois de cortado.
 */
function lerPecas(corpo) {
  if (!corpo || typeof corpo !== "object") return { erro: "Não veio nada no pedido." };
  const cruas = Array.isArray(corpo.pecas) ? corpo.pecas : null;
  if (!cruas || cruas.length === 0) return { erro: "O pedido não trouxe peça nenhuma." };

  let totalDeNos = 0;
  const pecas = [];
  for (let i = 0; i < cruas.length; i++) {
    const crua = cruas[i];
    const nos = Array.isArray(crua && crua.nos) ? crua.nos : null;
    if (!nos || nos.length < 2) {
      return { erro: `A peça ${i + 1} não tem contorno (precisa de pelo menos 2 nós).` };
    }
    totalDeNos += nos.length;
    if (totalDeNos > NOS_MAXIMOS) {
      return { erro: `O pedido passou de ${NOS_MAXIMOS} nós no total; isso não é um risco de molde.` };
    }

    const emX = numero(crua.emX) || 0;
    const emY = numero(crua.emY) || 0;
    const limpos = [];
    for (const n of nos) {
      const x = numero(n && n.x);
      const y = numero(n && n.y);
      if (x === null || y === null) return { erro: `A peça ${i + 1} tem nó sem coordenada.` };
      // Alça que não veio cai em cima do próprio nó: a curva vira reta, que é
      // o comportamento certo para um nó sem curvatura.
      const alca = (a) => {
        const ax = numero(a && a.x);
        const ay = numero(a && a.y);
        return { x: (ax === null ? x : ax) + emX, y: (ay === null ? y : ay) + emY };
      };
      limpos.push({ x: x + emX, y: y + emY, entrada: alca(n.entrada), saida: alca(n.saida) });
    }
    pecas.push(limpos);
  }
  return { pecas };
}

/**
 * POST /api/risco/pdf
 *
 * Corpo: `{ nome?, pecas: [{ nos: [{x, y, entrada, saida}], emX?, emY? }] }`,
 * tudo em centímetros. `entrada` e `saida` são as alças da curva; sem elas o
 * trecho sai reto. `emX`/`emY` é onde a peça estava na foto — é o que faz o PDF
 * sair com as peças no mesmo arranjo da mesa em vez de empilhadas na origem.
 */
router.post("/pdf", express.json({ limit: "20mb" }), (req, res) => {
  const lido = lerPecas(req.body);
  if (lido.erro) {
    res.status(400).json({ error: lido.erro });
    return;
  }
  const { pecas } = lido;

  // A caixa leva as ALÇAS junto: uma curva pode sair além do nó que a ancora,
  // e cortar a página no nó deixaria a barriga da curva fora do papel.
  let largura = 0;
  let altura = 0;
  for (const nos of pecas) {
    for (const n of nos) {
      for (const q of [n, n.entrada, n.saida]) {
        if (q.x > largura) largura = q.x;
        if (q.y > altura) altura = q.y;
      }
    }
  }
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

  // A página é do tamanho do desenho. Ver o cabeçalho: é isso que faz o PDF
  // servir de gabarito.
  const doc = new PDFDocument({
    size: [largura * PT_POR_CM, altura * PT_POR_CM],
    margin: 0,
    info: {
      Title: `Risco de ${nome} — ${largura.toFixed(1)} x ${altura.toFixed(1)} cm`,
      Creator: "CodeEx Optmize",
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}-risco.pdf"`);
  doc.pipe(res);

  // Traço fino e constante: é linha de corte, não desenho. Meio milímetro
  // aparece na impressão e não engorda a medida da peça de forma perceptível.
  doc.lineWidth(0.05 * PT_POR_CM).strokeColor("#000000");
  const pt = (v) => v * PT_POR_CM;
  for (const nos of pecas) {
    doc.moveTo(pt(nos[0].x), pt(nos[0].y));
    for (let i = 0; i < nos.length; i++) {
      const a = nos[i];
      const b = nos[(i + 1) % nos.length];
      doc.bezierCurveTo(pt(a.saida.x), pt(a.saida.y), pt(b.entrada.x), pt(b.entrada.y), pt(b.x), pt(b.y));
    }
    doc.closePath().stroke();
  }

  doc.end();
});

module.exports = router;
