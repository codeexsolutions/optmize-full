/**
 * ===========================================================================
 * A BORDA EM VOLTA DA PEÇA — o "Contorno (mm)" do modal Optmizar
 * ===========================================================================
 *
 * Pedido do dono (2026-11-16): "quando eu clicar em Optmizar quero poder
 * colocar um contorno em volta das peças, onde eu ponho em MM, tipo 3 mm de
 * borda ou 4 mm".
 *
 * É uma faixa de cor lisa (preta, azul, vermelha, verde limão ou branca —
 * `CORES_DA_BORDA`), da grossura escolhida, colada POR FORA da silhueta da
 * peça (e por dentro dos furos dela). Ela sai impressa: na mesa, no PDF e no
 * espaço que o encaixe reserva.
 *
 * COMO ELA ENTRA SEM MEXER NO MOTOR
 *
 * O encaixe inteiro (grade, máscaras, conferência pela arte, desenho da mesa)
 * fala com `peca.img`, `peca.largura` e `peca.altura`. Então, com borda, ele
 * recebe uma PEÇA EMBRULHADA (`comBorda`): a mesma peça, com a caixa crescida
 * `2 × borda` em cada eixo e uma imagem nova — a faixa colorida mais a arte no
 * meio. Tudo que vem depois vê a peça maior e se comporta certo sozinho.
 *
 * A peça da lista (`pecasEncaixe`) NUNCA é trocada: a tabela continua
 * mostrando a medida da arte, e desligar a borda volta tudo como era. O
 * embrulho fica guardado na própria peça (`_borda`) só para não refazer a
 * imagem e as máscaras a cada clique.
 *
 * NO PDF a arte vai como sempre foi (o original, intocado). A faixa vai em
 * VETOR, só o anel, na cor escolhida (`contornoVetorialDaBorda`), e o
 * servidor a desenha na caixa inteira com a arte encolhida `borda` de cada
 * lado, por cima (ver "A BORDA DA PEÇA", em servidor/encaixe-pdf.js).
 */

/** O maior valor aceito no campo, em mm. */
export const BORDA_MAXIMA_MM = 20;

/**
 * As cores que a borda pode ter (pedido do dono, 2026-11-16): só estas, para
 * a produção não precisar acertar cor à mão. A primeira é a de sempre.
 */
export const CORES_DA_BORDA = [
  { nome: "Preto", cor: "#000000" },
  { nome: "Azul", cor: "#0047FF" },
  { nome: "Vermelho", cor: "#E00000" },
  { nome: "Verde limão", cor: "#32CD32" },
  { nome: "Branco", cor: "#FFFFFF" },
];

/** A cor pedida, se for uma das da lista; senão, preto. */
export function corDaBorda(cor) {
  const pedida = String(cor || "").toUpperCase();
  return CORES_DA_BORDA.some((c) => c.cor === pedida) ? pedida : CORES_DA_BORDA[0].cor;
}

/** O valor do campo, já limpo: mm entre 0 e o máximo; vazio ou inválido é 0. */
export function bordaDoCampo(valor) {
  const mm = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(mm) || mm <= 0) return 0;
  return Math.min(BORDA_MAXIMA_MM, Math.round(mm * 10) / 10);
}

const larguraDe = (img) => img.naturalWidth || img.width;
const alturaDe = (img) => img.naturalHeight || img.height;

/**
 * Desenha a borda de uma arte numa tela nova.
 *
 * `ladoMaximo` limita o maior lado da tela (em px), e `ppcmMaximo` a
 * resolução — a faixa é preta e lisa, não precisa da resolução da foto.
 * `soAnel` devolve só a faixa (o que vai para o PDF, com a arte original por
 * cima); sem ele, a faixa já sai com a arte no meio (o que o encaixe usa).
 *
 * A dilatação é a do jeito do canvas: a silhueta pintada de preto é carimbada
 * em volta de círculos de raio até a borda. Num passo de ~1,5 px pela volta
 * do círculo, mais dois círculos menores para as pontas finas, o resultado é
 * a soma de Minkowski com o disco, que é a faixa de grossura constante.
 */
function desenharBorda(img, larguraCm, alturaCm, bordaCm, { ladoMaximo, ppcmMaximo, soAnel, paraVetor, cor = "#000000" }) {
  const pxW = larguraDe(img);
  const pxH = alturaDe(img);
  const totalW = larguraCm + 2 * bordaCm;
  const totalH = alturaCm + 2 * bordaCm;
  let ppcm = Math.min(pxW / larguraCm, pxH / alturaCm, ppcmMaximo);
  ppcm = Math.min(ppcm, ladoMaximo / Math.max(totalW, totalH));
  ppcm = Math.max(ppcm, 1);

  const W = Math.max(1, Math.round(totalW * ppcm));
  const H = Math.max(1, Math.round(totalH * ppcm));
  const artW = Math.max(1, Math.round(larguraCm * ppcm));
  const artH = Math.max(1, Math.round(alturaCm * ppcm));
  const b = (W - artW) / 2;
  const bY = (H - artH) / 2;
  const raio = Math.max(0.5, bordaCm * ppcm);

  // A silhueta em preto, no tamanho em que a arte vai ficar.
  const silhueta = document.createElement("canvas");
  silhueta.width = artW;
  silhueta.height = artH;
  const cs = silhueta.getContext("2d");
  cs.drawImage(img, 0, 0, artW, artH);
  cs.globalCompositeOperation = "source-in";
  cs.fillStyle = cor;
  cs.fillRect(0, 0, artW, artH);

  const tela = document.createElement("canvas");
  tela.width = W;
  tela.height = H;
  const ctx = tela.getContext("2d");
  const carimbar = (r) => {
    const passos = Math.max(8, Math.ceil((2 * Math.PI * r) / 1.5));
    for (let i = 0; i < passos; i++) {
      const a = (i / passos) * 2 * Math.PI;
      ctx.drawImage(silhueta, b + Math.cos(a) * r, bY + Math.sin(a) * r);
    }
  };
  carimbar(raio);
  if (raio > 3) carimbar(raio * 0.66);
  if (raio > 6) carimbar(raio * 0.33);
  ctx.drawImage(silhueta, b, bY);
  // Para o vetor: a silhueta crescida e a da arte, separadas (ver `contornoVetorialDaBorda`).
  if (paraVetor) return { tela, silhueta, b, bY, W, H };

  // Só o anel: a silhueta da arte sai, e o que fica é a faixa (e a dos furos).
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(silhueta, b, bY);
  ctx.globalCompositeOperation = "source-over";
  if (!soAnel) ctx.drawImage(img, b, bY, artW, artH);
  return tela;
}

/**
 * A peça como o encaixe deve vê-la com `mm` de borda — ou a própria peça,
 * quando não há borda.
 *
 * Devolve sempre o MESMO objeto para a mesma peça (os campos são renovados a
 * cada chamada), para o cache das máscaras (`_cacheMascaras`) sobreviver de
 * um Optmizar para o outro. A chave das máscaras já inclui a medida, então
 * mudar a borda refaz a máscara sozinho; trocar a arte refaz a imagem e
 * esquece a máscara aqui.
 */
export function comBorda(peca, mm, corPedida) {
  if (!(mm > 0) || !peca || !peca.img || !(peca.largura > 0) || !(peca.altura > 0)) return peca;
  const bordaCm = mm / 10;
  let guardado = peca._borda;
  const cor = corDaBorda(corPedida);
  const chaveImg = `${mm}|${cor}|${peca.largura}|${peca.altura}`;
  if (!guardado || guardado.img !== peca.img || guardado.chave !== chaveImg) {
    const imagem = desenharBorda(peca.img, peca.largura, peca.altura, bordaCm,
      { ladoMaximo: 3000, ppcmMaximo: 60, soAnel: false, cor });
    guardado = { img: peca.img, chave: chaveImg, imagem, embrulho: guardado ? guardado.embrulho : {} };
    delete guardado.embrulho._cacheMascaras;
    Object.defineProperty(peca, "_borda", { value: guardado, writable: true, configurable: true, enumerable: false });
  }
  const embrulho = guardado.embrulho;
  // eslint-disable-next-line no-unused-vars
  const { _cacheMascaras, _borda, ...campos } = peca;
  Object.keys(embrulho).forEach((k) => { if (k !== "_cacheMascaras" && !(k in campos)) delete embrulho[k]; });
  Object.assign(embrulho, campos, {
    img: guardado.imagem,
    largura: peca.largura + 2 * bordaCm,
    altura: peca.altura + 2 * bordaCm,
    bordaMm: mm,
    bordaCm,
    bordaCor: cor,
    // A arte e a medida SEM a borda: é delas que sai a faixa do PDF.
    imgSemBorda: peca.img,
    larguraSemBorda: peca.largura,
    alturaSemBorda: peca.altura,
  });
  return embrulho;
}

/*
 * ===========================================================================
 * A FAIXA EM VETOR, PARA O PDF
 * ===========================================================================
 *
 * No PDF a faixa vai como CAMINHO (path), e não como imagem: linha lisa em
 * qualquer zoom e em qualquer tamanho de impressão, e o arquivo quase não
 * cresce. O caminho é a borda da silhueta CRESCIDA mais a borda da silhueta
 * da ARTE, preenchidas em par-ímpar: o que sobra pintado é só o anel.
 *
 * O traçado é o das arestas entre pixel dentro e pixel fora, ligadas em
 * voltas fechadas; cada vértice é o MEIO de uma aresta (o que troca a escada
 * por diagonais) e o Douglas-Peucker tira os pontos alinhados. A silhueta da
 * arte é lida com o alfa alto (quase opaca), para o anel entrar um pouco
 * por baixo da borda suave da arte e não sobrar fresta branca entre os dois.
 */

/** Os pixels de uma tela viram dentro/fora pelo alfa. */
function binaria(ctx, W, H, limiar) {
  const dados = ctx.getImageData(0, 0, W, H).data;
  const bits = new Uint8Array(W * H);
  for (let i = 0; i < bits.length; i++) bits[i] = dados[i * 4 + 3] >= limiar ? 1 : 0;
  return bits;
}

/** As voltas fechadas da borda de uma grade binária, em coordenadas de pixel. */
function voltasDaGrade(bits, W, H) {
  const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H && bits[y * W + x] === 1;
  const C = W + 1;
  // Arestas orientadas (dentro à direita, com y para baixo), pelo canto de saída.
  const saidas = new Map();
  const arestas = [];
  const juntar = (x0, y0, x1, y1) => {
    const id = arestas.length;
    arestas.push([x0, y0, x1, y1]);
    const k = y0 * C + x0;
    const lista = saidas.get(k);
    if (lista) lista.push(id); else saidas.set(k, [id]);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (bits[y * W + x] !== 1) continue;
      if (!dentro(x, y - 1)) juntar(x, y, x + 1, y);
      if (!dentro(x + 1, y)) juntar(x + 1, y, x + 1, y + 1);
      if (!dentro(x, y + 1)) juntar(x + 1, y + 1, x, y + 1);
      if (!dentro(x - 1, y)) juntar(x, y + 1, x, y);
    }
  }
  const usada = new Uint8Array(arestas.length);
  const voltas = [];
  for (let inicio = 0; inicio < arestas.length; inicio++) {
    if (usada[inicio]) continue;
    const pontos = [];
    let id = inicio;
    while (id !== undefined && !usada[id]) {
      usada[id] = 1;
      const [x0, y0, x1, y1] = arestas[id];
      pontos.push((x0 + x1) / 2, (y0 + y1) / 2);
      const lista = saidas.get(y1 * C + x1);
      id = lista ? lista.find((j) => !usada[j]) : undefined;
    }
    if (pontos.length >= 6) voltas.push(pontos);
  }
  return voltas;
}

/** Douglas-Peucker numa volta fechada (pontos em [x, y, x, y, ...]). */
function simplificar(pontos, tolerancia) {
  const n = pontos.length / 2;
  if (n <= 4) return pontos;
  const manter = new Uint8Array(n);
  manter[0] = 1;
  // A volta é partida no ponto mais longe do primeiro, para os dois lados.
  let longe = 0;
  let maior = -1;
  for (let i = 1; i < n; i++) {
    const d = (pontos[2 * i] - pontos[0]) ** 2 + (pontos[2 * i + 1] - pontos[1]) ** 2;
    if (d > maior) { maior = d; longe = i; }
  }
  manter[longe] = 1;
  const t2 = tolerancia * tolerancia;
  const pilha = [[0, longe], [longe, n]];
  while (pilha.length) {
    const [a, bFim] = pilha.pop();
    const b = bFim % n;
    const ax = pontos[2 * a]; const ay = pontos[2 * a + 1];
    const bx = pontos[2 * b]; const by = pontos[2 * b + 1];
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let pior = -1;
    let qual = -1;
    for (let i = a + 1; i < bFim; i++) {
      const px = pontos[2 * i] - ax; const py = pontos[2 * i + 1] - ay;
      const cruz = px * dy - py * dx;
      const d = (cruz * cruz) / len2;
      if (d > pior) { pior = d; qual = i; }
    }
    if (qual >= 0 && pior > t2) {
      manter[qual] = 1;
      pilha.push([a, qual], [qual, bFim]);
    }
  }
  const saida = [];
  for (let i = 0; i < n; i++) if (manter[i]) saida.push(pontos[2 * i], pontos[2 * i + 1]);
  return saida;
}

/**
 * A faixa da peça em vetor, para o PDF: uma lista de voltas fechadas
 * `[u, v, u, v, ...]`, com `u` e `v` de 0 a 1 na caixa da peça COM a borda
 * (y para baixo, a arte de pé), para preencher em par-ímpar. Recebe a peça
 * EMBRULHADA (a do encaixe, `comBorda`).
 *
 * O traçado é feito a até ~100 dpi (cada pixel ≤ 0,25 mm); com os vértices no
 * meio das arestas e a simplificação, a linha fica dentro de ~0,15 mm da
 * borda de verdade.
 */
export function contornoVetorialDaBorda(embrulho) {
  const { tela, silhueta, b, bY, W, H } = desenharBorda(embrulho.imgSemBorda, embrulho.larguraSemBorda,
    embrulho.alturaSemBorda, embrulho.bordaCm, { ladoMaximo: 4000, ppcmMaximo: 40, paraVetor: true });
  const ctx = tela.getContext("2d", { willReadFrequently: true });
  const crescida = binaria(ctx, W, H, 128);
  // A silhueta da arte no mesmo quadro da crescida.
  const quadro = document.createElement("canvas");
  quadro.width = W;
  quadro.height = H;
  const cq = quadro.getContext("2d", { willReadFrequently: true });
  cq.drawImage(silhueta, b, bY);
  const arte = binaria(cq, W, H, 230);

  const voltas = [...voltasDaGrade(crescida, W, H), ...voltasDaGrade(arte, W, H)];
  const arredondar = (n) => Math.round(n * 1e5) / 1e5;
  return voltas.map((volta) => simplificar(volta, 0.6))
    .filter((volta) => volta.length >= 6)
    .map((volta) => volta.map((n, i) => arredondar(i % 2 === 0 ? n / W : n / H)));
}
