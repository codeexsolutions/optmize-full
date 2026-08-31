/**
 * Arte dentro do molde.
 *
 * A arte é desenhada fora daqui, num retângulo — é assim que ela sai do
 * CorelDRAW ou do Photoshop. Aqui ela é encaixada dentro do contorno da peça:
 * o sistema mede a peça em centímetros, ajusta a arte a essa medida e recorta
 * pelo contorno, deixando transparente o que fica de fora.
 *
 * Como a conta é feita em centímetros, e não em pixels, a mesma arte serve
 * para todos os tamanhos do molde: ao trocar de P para G, o contorno muda e a
 * arte se ajusta sozinha ao novo contorno.
 *
 * ## Arte e rapport são duas coisas
 *
 * **Arte** é um desenho que entra **uma vez** na peça: um escudo no peito, uma
 * foto, um letreiro. Ele se ajusta ao tamanho da peça — cobrindo, cabendo ou
 * esticando —, e é por isso que a mesma arte serve para o P e para o G.
 *
 * **Rapport** é um azulejo. Ele não se ajusta a nada: sai no tamanho de
 * verdade dele e se **repete**, encostado nas quatro direções, até tapar a
 * peça inteira. Esticar um rapport para caber na peça estragaria a estampa,
 * porque o desenho sairia de escala e a emenda não fecharia com a próxima
 * peça na hora de costurar.
 *
 * A diferença aparece no ajuste como o campo `tipo`. Nele:
 *
 *   arte     — `modo` decide como o desenho se ajusta à peça
 *   rapport  — `modo` não vale; o que manda é o tamanho real do azulejo, que
 *              sai do dpi gravado no arquivo (`ppcmArquivo`)
 */

/** Como a arte entra na peça, antes de a pessoa mexer em alguma coisa. */
const AJUSTE_PADRAO = {
  tipo: "arte", modo: "cobrir", escala: 100, x: 0, y: 0, giro: 0,
  // Pixels por centímetro do arquivo, lidos do dpi gravado nele. Fica salvo no
  // ajuste porque o rapport depende do tamanho real do azulejo, e ao reabrir
  // uma estampa guardada a imagem volta do servidor sem essa informação.
  ppcmArquivo: null,
};

const MODOS_DE_ARTE = [
  { id: "cobrir", nome: "Cobrir a peça inteira" },
  { id: "caber", nome: "Caber por dentro" },
  { id: "esticar", nome: "Esticar até as bordas" },
];

const TIPOS_DE_ARTE = [
  { id: "arte", nome: "Só a arte", dica: "Um desenho que entra uma vez e se ajusta à peça" },
  { id: "rapport", nome: "Rapport", dica: "Um azulejo que se repete no tamanho real, sem emenda" },
];

const ajusteNovo = () => ({ ...AJUSTE_PADRAO });

/** Quantos pixels da imagem valem 1 cm, com o padrão de quando o arquivo não diz. */
const ppcmDoAjuste = (ajuste) =>
  (ajuste && ajuste.ppcmArquivo > 0) ? ajuste.ppcmArquivo : (typeof PPCM_PADRAO === "number" ? PPCM_PADRAO : 300 / 2.54);

/** O tamanho de verdade do azulejo, em centímetros, já com o giro e a escala. */
function tamanhoDoRapport(arte, ajuste) {
  const a = { ...AJUSTE_PADRAO, ...(ajuste || {}) };
  const ppcmArquivo = ppcmDoAjuste(a);
  const escala = Math.max(1, Number(a.escala) || 100) / 100;
  const w = (arte.width / ppcmArquivo) * escala;
  const h = (arte.height / ppcmArquivo) * escala;
  const giro = ((Math.round(a.giro / 90) * 90) % 360 + 360) % 360;
  const deitada = giro === 90 || giro === 270;
  return { largura: deitada ? h : w, altura: deitada ? w : h, giro, deitada, escala, ppcmArquivo };
}

/**
 * Onde a arte fica dentro da peça, em centímetros.
 *
 *   cobrir  — cresce até tapar a peça toda; o que passar do contorno é cortado
 *             (é o que se quer numa estampa corrida)
 *   caber   — encolhe até a arte inteira aparecer dentro da peça
 *   esticar — força a arte na medida exata da peça, deformando o desenho
 *
 * A escala e o deslocamento entram depois, para a pessoa ajustar olhando a
 * prévia. O deslocamento é em centímetros, medido do centro da peça.
 */
function encaixeDaArte(arteW, arteH, alvoW, alvoH, ajuste) {
  const a = { ...AJUSTE_PADRAO, ...(ajuste || {}) };
  const giro = ((Math.round(a.giro / 90) * 90) % 360 + 360) % 360;
  const deitada = giro === 90 || giro === 270;

  // medida da arte já girada
  const aW = deitada ? arteH : arteW;
  const aH = deitada ? arteW : arteH;
  if (!(aW > 0) || !(aH > 0) || !(alvoW > 0) || !(alvoH > 0)) {
    return { x: 0, y: 0, w: 0, h: 0, giro, deitada };
  }

  let w, h;
  if (a.modo === "esticar") {
    w = alvoW;
    h = alvoH;
  } else {
    const fator = a.modo === "caber"
      ? Math.min(alvoW / aW, alvoH / aH)
      : Math.max(alvoW / aW, alvoH / aH);
    w = aW * fator;
    h = aH * fator;
  }

  const escala = Math.max(1, Number(a.escala) || 100) / 100;
  w *= escala;
  h *= escala;

  return {
    x: (alvoW - w) / 2 + (Number(a.x) || 0),
    y: (alvoH - h) / 2 + (Number(a.y) || 0),
    w, h, giro, deitada,
  };
}

/**
 * Quantos pixels por centímetro usar, sem estourar a memória do navegador.
 *
 * O dpi pedido manda, mas uma peça de 52 × 70 cm a 300 dpi já são 50 milhões
 * de pontos — e são várias peças numa tela só. Quando passa do teto, o dpi cai
 * junto para todas, e a tela avisa qual foi o dpi usado de verdade.
 */
const MPX_MAXIMO_POR_PECA = 26;

function ppcmDaArte(larguraCm, alturaCm, dpi) {
  const ppcmPedido = Math.max(4, (Number(dpi) || 150) / 2.54);
  const area = Math.max(1, larguraCm * alturaCm);
  const ppcmTeto = Math.sqrt((MPX_MAXIMO_POR_PECA * 1e6) / area);
  return Math.min(ppcmPedido, ppcmTeto);
}

/**
 * Ladrilha o rapport por cima da peça inteira.
 *
 * Quem repete é o próprio canvas, pelo `createPattern` com `"repeat"`: ele
 * encosta uma cópia na outra sem deixar vão nem sobrepor, que é exatamente o
 * que um rapport precisa. Não existe laço desenhando cópia por cópia aqui — e
 * é bom que não exista, porque numa peça de 70 cm com azulejo de 25 cm o laço
 * teria que acertar a última fileira na mão, e é justo ali que nasce a emenda.
 *
 * O tamanho do azulejo **não** se ajusta à peça: ele vem do dpi do arquivo. A
 * escala existe para quem quer a estampa maior ou menor de propósito, e 100%
 * é o tamanho de verdade.
 *
 * O recorte pelo contorno já foi feito por quem chama (`ctx.clip`), então o
 * ladrilho é simplesmente pintado por cima de tudo: o que passar da peça é
 * descartado pelo recorte, e a peça sai estampada de ponta a ponta.
 */
function desenharRapport(ctx, arte, ajuste, ppcm, margem, largura, altura) {
  const padrao = ctx.createPattern(arte, "repeat");
  if (!padrao) return;

  const a = { ...AJUSTE_PADRAO, ...(ajuste || {}) };
  const { giro, escala, ppcmArquivo } = tamanhoDoRapport(arte, a);

  // Do pixel do arquivo para o pixel da tela: o azulejo tem `ppcmArquivo`
  // pixels por centímetro, e a tela tem `ppcm`.
  const fator = (ppcm / ppcmArquivo) * escala;

  // O deslocamento é em centímetros, como no resto da tela, e serve para
  // escolher onde a repetição começa — é o que resolve "a emenda caiu bem no
  // meio do peito".
  const desloqueX = margem + (Number(a.x) || 0) * ppcm;
  const desloqueY = margem + (Number(a.y) || 0) * ppcm;

  if (typeof DOMMatrix === "function") {
    padrao.setTransform(new DOMMatrix()
      .translate(desloqueX, desloqueY)
      .rotate(giro)
      .scale(fator));
    ctx.fillStyle = padrao;
    ctx.fillRect(0, 0, largura, altura);
    return;
  }

  // Navegador sem DOMMatrix: a mesma coisa mexendo na matriz do próprio
  // contexto. Fica dentro de save/restore para não vazar transformação.
  ctx.save();
  ctx.translate(desloqueX, desloqueY);
  ctx.rotate((giro * Math.PI) / 180);
  ctx.scale(fator, fator);
  ctx.fillStyle = padrao;
  // O retângulo tem que cobrir a peça inteira mesmo depois de girado e
  // escalado, então é pintado com folga em volta, no sistema já transformado.
  const alcance = (largura + altura) / fator;
  ctx.fillRect(-alcance, -alcance, alcance * 2, alcance * 2);
  ctx.restore();
}

/**
 * Desenha a peça com a arte dentro, recortada pelo contorno.
 *
 * Fora do contorno fica transparente: é assim que o encaixe reconhece a
 * silhueta de verdade e que o PDF sai sem moldura branca em volta.
 */
function desenharArteNoMolde(peca, arte, ajuste, ppcm, opcoes = {}) {
  const margem = opcoes.margem === undefined ? 1 : opcoes.margem; // em pixels
  const largura = Math.max(4, Math.ceil(peca.largura * ppcm) + margem * 2);
  const altura = Math.max(4, Math.ceil(peca.altura * ppcm) + margem * 2);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");

  const traçar = (pontos) => {
    pontos.forEach((p, i) => {
      const x = margem + p.x * ppcm;
      const y = margem + p.y * ppcm;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  const caminho = () => {
    ctx.beginPath();
    traçar(peca.contorno);
    (peca.furos || []).forEach(traçar);
  };

  ctx.save();
  caminho();
  ctx.clip("evenodd"); // com evenodd os furos ficam vazados de verdade

  if (opcoes.fundo) {
    ctx.fillStyle = opcoes.fundo;
    ctx.fillRect(0, 0, largura, altura);
  }

  if (arte && arte.width > 0 && ajuste && ajuste.tipo === "rapport") {
    desenharRapport(ctx, arte, ajuste, ppcm, margem, largura, altura);
  } else if (arte && arte.width > 0) {
    const cabe = encaixeDaArte(
      arte.width / ppcm, arte.height / ppcm, peca.largura, peca.altura, ajuste);
    // A arte é medida em pixels da própria imagem; o que vale é a proporção,
    // então dá na mesma dividir os dois lados pelo mesmo ppcm.
    const cx = margem + (cabe.x + cabe.w / 2) * ppcm;
    const cy = margem + (cabe.y + cabe.h / 2) * ppcm;
    const larguraPx = cabe.w * ppcm;
    const alturaPx = cabe.h * ppcm;

    ctx.translate(cx, cy);
    ctx.rotate((cabe.giro * Math.PI) / 180);
    // girada 90°, a largura do desenho vira a altura na tela
    const dw = cabe.deitada ? alturaPx : larguraPx;
    const dh = cabe.deitada ? larguraPx : alturaPx;
    ctx.drawImage(arte, -dw / 2, -dh / 2, dw, dh);
  }
  ctx.restore();

  if (opcoes.linha) {
    caminho();
    ctx.strokeStyle = opcoes.linha;
    ctx.lineWidth = opcoes.linhaGrossura || 1.5;
    ctx.stroke();
  }

  return { src: canvas.toDataURL("image/png"), pxW: largura, pxH: altura, ppcm };
}
