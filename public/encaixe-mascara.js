/**
 * Preparo da peça: a parte que só mexe com pixels.
 *
 * Está separado do encaixe.js pelo mesmo motivo do encaixe-motor.js: este
 * arquivo roda **também dentro de um Web Worker** (ver prepara-worker.js).
 * Nada aqui pode usar `document`, `window` ou canvas da página.
 *
 * A divisão é essa: conseguir os pixels precisa de canvas e fica no encaixe.js
 * (ou, no worker, num OffscreenCanvas); o que fazer com eles depois — achar o
 * fundo, tirar a silhueta, engordar pela folga, girar — é tudo aqui.
 *
 * Carregado como <script> na página e por importScripts() no worker, então
 * tudo aqui é função de topo mesmo — sem módulo, sem export.
 */

// ==================== O FUNDO DA ARTE ====================

const FUNDO_TOLERANCIA = 48;   // distância de cor que ainda conta como fundo
const FUNDO_MAIORIA = 0.6;     // maioria que aceita fundo de qualquer cor
const FUNDO_PAPEL = 0.25;      // quanto de claro na borda já denuncia o papel
const FUNDO_CLARO = 200;       // acima disso é fundo de arte (branco, creme...)

function corDoFundoNaBorda(px, largura, altura, tolerancia = FUNDO_TOLERANCIA) {
  const naBorda = [];
  const passoX = Math.max(1, Math.floor(largura / 400));
  const passoY = Math.max(1, Math.floor(altura / 400));
  const pegar = (x, y) => {
    const p = (y * largura + x) * 4;
    naBorda.push([px[p], px[p + 1], px[p + 2]]);
  };
  for (let x = 0; x < largura; x += passoX) { pegar(x, 0); pegar(x, altura - 1); }
  for (let y = 0; y < altura; y += passoY) { pegar(0, y); pegar(largura - 1, y); }
  if (naBorda.length === 0) return null;

  const ehClara = (k) => (k[0] + k[1] + k[2]) / 3 >= FUNDO_CLARO;

  // A cor mais repetida, agrupando tons vizinhos na mesma gaveta.
  const maisRepetida = (lista) => {
    if (lista.length === 0) return null;
    const gavetas = new Map();
    lista.forEach((cor) => {
      const chave = (cor[0] >> 4) * 1024 + (cor[1] >> 4) * 32 + (cor[2] >> 4);
      const gaveta = gavetas.get(chave) || { soma: [0, 0, 0], quantos: 0 };
      gaveta.soma[0] += cor[0]; gaveta.soma[1] += cor[1]; gaveta.soma[2] += cor[2];
      gaveta.quantos++;
      gavetas.set(chave, gaveta);
    });
    let maior = null;
    gavetas.forEach((gaveta) => { if (!maior || gaveta.quantos > maior.quantos) maior = gaveta; });
    return maior.soma.map((s) => s / maior.quantos);
  };

  const quantoPerto = (cor) => naBorda.filter((k) =>
    Math.hypot(k[0] - cor[0], k[1] - cor[1], k[2] - cor[2]) <= tolerancia).length / naBorda.length;

  // 1) Uma cor que domina a volta inteira é fundo, seja ela qual for.
  const dominante = maisRepetida(naBorda);
  const maioria = quantoPerto(dominante);
  if (maioria >= FUNDO_MAIORIA) {
    return { cor: dominante, maioria, claro: ehClara(dominante) };
  }

  // 2) Senão, procura o papel: peça que sangra numa borda (ou em duas) derruba
  //    a maioria sem que o fundo tenha deixado de existir. Foi o que acontecia
  //    com frente e costas de camiseta, que encostam no rodapé da folha: a
  //    volta tinha 59% de branco e o sistema mandava a peça como retângulo.
  const claras = naBorda.filter(ehClara);
  if (claras.length / naBorda.length < FUNDO_PAPEL) return null;
  const papel = maisRepetida(claras);
  return { cor: papel, maioria: quantoPerto(papel), claro: true };
}

/**
 * Marca o que é fundo espalhando a partir da borda.
 *
 * Espalhar, em vez de apagar toda cor parecida, é o que salva o branco de
 * dentro do desenho: ele não encosta na borda, então não é alcançado.
 */
function marcarFundoDaBorda(px, largura, altura, cor, tolerancia = FUNDO_TOLERANCIA) {
  const total = largura * altura;
  const visitado = new Uint8Array(total);
  const ehFundo = new Uint8Array(total);
  const pilha = [];
  const perto = (p) => Math.hypot(
    px[p * 4] - cor[0], px[p * 4 + 1] - cor[1], px[p * 4 + 2] - cor[2]) <= tolerancia;

  const empilhar = (x, y) => {
    const p = y * largura + x;
    if (visitado[p]) return;
    visitado[p] = 1;
    if (perto(p)) { ehFundo[p] = 1; pilha.push(p); }
  };

  for (let x = 0; x < largura; x++) { empilhar(x, 0); empilhar(x, altura - 1); }
  for (let y = 0; y < altura; y++) { empilhar(0, y); empilhar(largura - 1, y); }

  let quantos = 0;
  while (pilha.length > 0) {
    const p = pilha.pop();
    quantos++;
    const x = p % largura;
    const y = (p - x) / largura;
    if (x > 0) empilhar(x - 1, y);
    if (x < largura - 1) empilhar(x + 1, y);
    if (y > 0) empilhar(x, y - 1);
    if (y < altura - 1) empilhar(x, y + 1);
  }

  return { ehFundo, quantos };
}

// ==================== A GRADE DA PEÇA ====================

/**
 * Escolhe a grade do encaixe a partir da folga pedida.
 *
 * A folga entre peças é aplicada engordando cada peça pela metade dela, e esse
 * engorde só existe em células inteiras da grade — ou seja, **a grade é que
 * decide a precisão da folga**. Com uma grade fixa de meio centímetro, pedir
 * 3 mm dava zero (as peças encostavam!) e pedir 5 mm dava 10 mm.
 *
 * Por isso a grade passa a acompanhar a folga: uma célula vale metade do que
 * foi pedido, para o engorde de uma célula dar exatamente a folga. Grade mais
 * fina custa tempo (o encaixe olha mais células), então há um piso; abaixo
 * dele a folga sai um pouco maior que a pedida, nunca menor — errar para mais
 * gasta um tiquinho de tecido, errar para menos estraga o corte.
 *
 * Morava no encaixe.js, junto da tela. Veio para cá quando a bancada
 * (`bancada/`) passou a medir o motor fora do navegador: sem isto aqui, ela
 * teria que repetir a conta, e a grade da medição podia deixar de ser a mesma
 * grade da produção sem ninguém notar.
 */
function grade(larguraTecido, espaco) {
  const maisGrossa = Math.min(1, Math.max(0.2, arredondar(larguraTecido / 300)));
  const maisFina = larguraTecido / 1000;
  if (!(espaco > 0)) return { passo: maisGrossa, raio: 0, folgaReal: 0 };

  // Metade da folga tem que caber num número inteiro de células. Divide-se
  // essa metade em quantas partes forem necessárias para a célula não passar
  // do tamanho máximo — assim a folga sai exata em vez de arredondada para
  // cima (era o que fazia 15 mm virar 20 mm).
  const metade = espaco / 2;
  const partes = Math.max(1, Math.ceil(metade / maisGrossa - 1e-9));
  let passo = metade / partes;
  let raio = partes;

  // Célula fina demais deixa o encaixe lento sem retorno. Abaixo do piso a
  // folga sai um pouco maior que a pedida — nunca menor.
  if (passo < maisFina) {
    passo = maisFina;
    raio = Math.ceil(metade / passo - 1e-9);
  }
  return { passo, raio, folgaReal: raio * passo * 2 };
}

/** A grade de uma peça: quantas células de lado ela tem. */
function gradeDaPeca(peca, passo) {
  return {
    cols: Math.max(1, Math.round(peca.largura / passo)),
    rows: Math.max(1, Math.round(peca.altura / passo)),
  };
}


/** Silhueta quase vazia é erro de leitura (arte escura em fundo escuro, etc). */
function validarSilhueta(bits, total, modo) {
  let cheias = 0;
  for (let i = 0; i < total; i++) cheias += bits[i];
  if (cheias < total * 0.02) return { bits: new Uint8Array(total).fill(1), modo: "caixa" };
  return { bits, modo };
}

/**
 * Engorda a silhueta pelo raio pedido, que é como o espaço entre peças entra
 * na conta: cada peça carrega metade da folga em volta dela, então duas peças
 * encostadas ficam com a folga inteira entre uma e outra. Separável em duas
 * passadas (horizontal e vertical) para não ficar caro.
 */
function engordar(bits, cols, rows, raio) {
  if (raio <= 0) return bits;

  const horizontal = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const linha = y * cols;
    for (let x = 0; x < cols; x++) {
      if (!bits[linha + x]) continue;
      const ini = Math.max(0, x - raio);
      const fim = Math.min(cols - 1, x + raio);
      for (let k = ini; k <= fim; k++) horizontal[linha + k] = 1;
    }
  }

  const vertical = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!horizontal[y * cols + x]) continue;
      const ini = Math.max(0, y - raio);
      const fim = Math.min(rows - 1, y + raio);
      for (let k = ini; k <= fim; k++) vertical[k * cols + x] = 1;
    }
  }
  return vertical;
}

/**
 * Engorda a silhueta abrindo antes uma borda em volta dela.
 *
 * Sem essa borda o engorde é cortado pela moldura da própria imagem: arte
 * exportada justa na peça — o caso normal — ficava sem folga nenhuma, e os
 * cantos eram os primeiros a sumir. O resultado vem junto com o quanto a
 * moldura cresceu, para o desenho continuar caindo no lugar certo.
 */
function engordarComBorda(bits, cols, rows, raio) {
  if (raio <= 0) return { bits, cols, rows, borda: 0 };

  const novoCols = cols + raio * 2;
  const novoRows = rows + raio * 2;
  const comBorda = new Uint8Array(novoCols * novoRows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (bits[y * cols + x]) comBorda[(y + raio) * novoCols + (x + raio)] = 1;
    }
  }
  return {
    bits: engordar(comBorda, novoCols, novoRows, raio),
    cols: novoCols, rows: novoRows, borda: raio,
  };
}

/** Põe a silhueta original na mesma moldura crescida, para as duas casarem. */
function comMesmaBorda(bits, cols, rows, borda) {
  if (borda <= 0) return { bits, cols, rows };
  const novoCols = cols + borda * 2;
  const novoRows = rows + borda * 2;
  const saida = new Uint8Array(novoCols * novoRows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (bits[y * cols + x]) saida[(y + borda) * novoCols + (x + borda)] = 1;
    }
  }
  return { bits: saida, cols: novoCols, rows: novoRows };
}

/** Gira a grade em 0/90/180/270, no mesmo sentido em que a arte é desenhada. */
function girarBits(bits, cols, rows, rot) {
  if (rot === 0) return { bits, cols, rows };
  const novoCols = rot === 180 ? cols : rows;
  const novoRows = rot === 180 ? rows : cols;
  const saida = new Uint8Array(novoCols * novoRows);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!bits[y * cols + x]) continue;
      let nx, ny;
      if (rot === 90) { nx = rows - 1 - y; ny = x; }
      else if (rot === 180) { nx = cols - 1 - x; ny = rows - 1 - y; }
      else { nx = y; ny = cols - 1 - x; }
      saida[ny * novoCols + nx] = 1;
    }
  }
  return { bits: saida, cols: novoCols, rows: novoRows };
}

/**
 * Recorta a grade no que realmente tem tecido (arte exportada costuma vir com
 * sobra transparente em volta) e guarda o topo e a base de cada coluna, que é
 * o que o encaixe usa. `offX`/`offY` dizem o quanto foi recortado, para a
 * imagem ser desenhada no lugar certo depois.
 */
function prepararMascara(engordados, reais, cols, rows, passo) {
  let minCol = cols, maxCol = -1, minRow = rows, maxRow = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!engordados[y * cols + x]) continue;
      if (x < minCol) minCol = x;
      if (x > maxCol) maxCol = x;
      if (y < minRow) minRow = y;
      if (y > maxRow) maxRow = y;
    }
  }
  if (maxCol < 0) return null;

  const largura = maxCol - minCol + 1;
  const altura = maxRow - minRow + 1;
  const topo = new Int32Array(largura).fill(-1);
  const base = new Int32Array(largura).fill(-1);
  // `desenho` é a silhueta real, sem a folga. Quem usa é a TELA, para traçar o
  // contorno da peça no resultado; o encaixe em si trabalha só com topo/base.
  //
  // Já existiu aqui um terceiro vetor, `cheio` — a silhueta engordada inteira,
  // célula por célula. Ele era do encaixe por NFP, que saiu, e sozinho pesava
  // metade de todas as máscaras (213 KB de 446 KB nas peças da bancada).
  const desenho = new Uint8Array(largura * altura);

  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (engordados[(y + minRow) * cols + (x + minCol)]) {
        if (topo[x] < 0) topo[x] = y;
        base[x] = y;
      }
      desenho[y * largura + x] = reais[(y + minRow) * cols + (x + minCol)];
    }
  }

  return {
    cols: largura, rows: altura, topo, base, desenho,
    alturaUtil: altura,
    offX: minCol * passo, offY: minRow * passo,
  };
}


// ==================== AS DUAS PONTAS QUE O WORKER USA ====================

/**
 * Tira o fundo direto nos pixels, sem canvas nenhum.
 *
 * É o miolo do `removerFundoDaImagem`: recebe os pixels já lidos, apaga o
 * fundo neles mesmos e diz se mexeu em alguma coisa. Quem leu os pixels e quem
 * vai fazer a imagem de volta é o chamador — na página, um canvas; no worker,
 * um OffscreenCanvas.
 *
 * Devolve `null` quando não é para mexer: sem fundo reconhecível, fundo escuro
 * sem terem mandado tirar, quase nada de fundo, ou fundo que comeu a arte toda.
 */
function tirarFundoDosPixels(px, largura, altura, forcar) {
  const fundo = corDoFundoNaBorda(px, largura, altura);
  if (!fundo) return null;                     // a arte sangra até a borda
  if (!fundo.claro && !forcar) return null;    // fundo escuro só quando mandarem

  const { ehFundo, quantos } = marcarFundoDaBorda(px, largura, altura, fundo.cor);
  const total = largura * altura;
  if (quantos < total * 0.01) return null;   // não tinha fundo mesmo
  // Comeu quase tudo: o que parecia fundo era a arte. Melhor não recortar nada
  // do que devolver uma peça esfarelada.
  if (total - quantos < total * 0.015) return null;

  for (let p = 0; p < ehFundo.length; p++) if (ehFundo[p]) px[p * 4 + 3] = 0;
  return { apagados: quantos, cor: fundo.cor };
}

/**
 * Descobre quais células têm tecido, a partir dos pixels da arte já reduzida
 * ao tamanho da grade. É o miolo do `silhuetaDaImagem`.
 */
function silhuetaDeDados(dados, cols, rows) {
  const total = cols * rows;
  const cheio = () => ({ bits: new Uint8Array(total).fill(1), modo: "caixa" });
  const bits = new Uint8Array(total);

  let transparentes = 0;
  for (let i = 3; i < dados.length; i += 4) if (dados[i] < 200) transparentes++;

  if (transparentes > total * 0.02) {
    // Fundo transparente. O limite é baixo de propósito: ao reduzir a imagem
    // para a grade, a borda vira meio-transparente e não pode ser comida.
    for (let i = 0, a = 3; i < total; i++, a += 4) bits[i] = dados[a] >= 40 ? 1 : 0;
    return validarSilhueta(bits, total, "alfa");
  }

  const fundo = corDoFundoNaBorda(dados, cols, rows);
  // Sem fundo reconhecível a arte sangra até a borda: a peça é o retângulo
  // todo. Fundo escuro também fica: se fosse para tirar, teria sido tirado na
  // hora de carregar, e aí a imagem já viria transparente.
  if (!fundo || !fundo.claro) return cheio();

  const { ehFundo } = marcarFundoDaBorda(dados, cols, rows, fundo.cor);
  for (let i = 0; i < total; i++) bits[i] = ehFundo[i] ? 0 : 1;
  return validarSilhueta(bits, total, "fundo");
}

/**
 * Da silhueta às quatro máscaras giradas. É o miolo do `mascarasDaPeca`, sem
 * a parte do cache, que é da tela.
 */
function mascarasDeSilhueta(silhueta, cols, rows, passo, raio) {
  const gordo = engordarComBorda(silhueta.bits, cols, rows, raio);
  const real = comMesmaBorda(silhueta.bits, cols, rows, gordo.borda);

  const rotacoes = {};
  [0, 90, 180, 270].forEach((rot) => {
    const cheia = girarBits(gordo.bits, gordo.cols, gordo.rows, rot);
    const original = girarBits(real.bits, real.cols, real.rows, rot);
    const m = prepararMascara(cheia.bits, original.bits, cheia.cols, cheia.rows, passo);
    // A moldura cresceu para o engorde caber; o desenho da arte continua no
    // mesmo lugar de antes, então o deslocamento desconta essa borda.
    if (m && gordo.borda > 0) {
      m.offX -= gordo.borda * passo;
      m.offY -= gordo.borda * passo;
    }
    rotacoes[rot] = m;
  });

  let cheias = 0;
  for (let i = 0; i < silhueta.bits.length; i++) cheias += silhueta.bits[i];

  return {
    rotacoes,
    modo: silhueta.modo,
    areaReal: cheias * passo * passo,
    ocupacao: cheias / (cols * rows), // quanto da caixa a peça realmente usa
  };
}
