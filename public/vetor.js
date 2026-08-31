/**
 * Gerador de vetor: a imagem vira desenho.
 *
 * Uma foto ou um PNG é uma grade de pontos coloridos. Um vetor é uma lista de
 * contornos com preenchimento — e é isso que a plotter, a faca de corte e a
 * impressão grande precisam, porque contorno não perde qualidade quando cresce.
 * O caminho entre um e outro tem quatro passos, e cada um resolve um problema
 * diferente:
 *
 *   1. **juntar cores.** Uma arte "de três cores" costuma ter oito mil, por
 *      causa do anti-serrilhado e da compressão do JPG. Sem reduzir a paleta,
 *      cada tonzinho viraria uma camada e o arquivo ficaria impossível.
 *   2. **limpar o cisco.** Depois da redução sobram ilhas de dois ou três
 *      pontos, restos do serrilhado. Elas viram centenas de contorninhos que
 *      não se enxergam mas pesam no arquivo e travam a faca.
 *   3. **achar a borda.** De cada cor sai um mapa preto e branco, e dele saem
 *      todos os contornos fechados — o de fora e os buracos de dentro.
 *   4. **alisar.** O contorno sai da grade em degraus de um pixel. Ele é
 *      simplificado e depois vira curva de Bézier, com as quinas de verdade
 *      preservadas — é essa última parte que separa "traçado" de "vetorizado".
 *
 * Tudo roda no navegador, como o encaixe: a imagem não sobe para lugar nenhum.
 */

// ==================== 1. JUNTAR CORES ====================

/**
 * Reduz a imagem a `quantas` cores pelo corte da mediana (median cut).
 *
 * A ideia: põe todas as cores numa caixa, corta a caixa ao meio pelo lado em
 * que elas mais se espalham, e repete com as duas metades até ter caixas
 * suficientes. A cor de cada caixa é a média do que caiu nela. É o que separa
 * bem tom parecido de tom parecido — cortar sempre pelo mesmo eixo juntaria o
 * vermelho com o laranja e deixaria três azuis quase iguais.
 *
 * Os pixels transparentes ficam de fora da conta e da imagem: fundo apagado
 * não é cor, e se entrasse viraria uma camada preta atrás de tudo.
 */
/**
 * Marca os pontos que estão em cima de uma divisa de cor.
 *
 * A conta é simples de propósito: se o vizinho da direita ou o de baixo tem cor
 * bem diferente, os dois estão na divisa. Depois a marca é engordada em um
 * ponto para cada lado, porque a faixa do anti-serrilhado costuma ter dois
 * pontos de largura — o de fora já está marcado, o de dentro ainda não.
 */
function marcarBordas(px, largura, altura, limiar = 30) {
  const total = largura * altura;
  const cru = new Uint8Array(total);
  const diferente = (a, b) =>
    Math.abs(px[a * 4] - px[b * 4]) + Math.abs(px[a * 4 + 1] - px[b * 4 + 1]) +
    Math.abs(px[a * 4 + 2] - px[b * 4 + 2]) > limiar;

  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (x + 1 < largura && diferente(i, i + 1)) { cru[i] = 1; cru[i + 1] = 1; }
      if (y + 1 < altura && diferente(i, i + largura)) { cru[i] = 1; cru[i + largura] = 1; }
    }
  }

  const marcado = new Uint8Array(total);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (!cru[i]) continue;
      marcado[i] = 1;
      if (x > 0) marcado[i - 1] = 1;
      if (x + 1 < largura) marcado[i + 1] = 1;
      if (y > 0) marcado[i - largura] = 1;
      if (y + 1 < altura) marcado[i + largura] = 1;
    }
  }
  return marcado;
}

/**
 * Onde uma cor fica no espaço em que a paleta é escolhida.
 *
 * Com `juntarSombras` em 0, a posição é o próprio RGB e nada muda. Acima disso
 * a cor passa a ser comparada pela **proporção** entre os canais (a
 * cromaticidade) mais o brilho com peso reduzido:
 *
 *   - um laranja no claro e o mesmo laranja na sombra têm a mesma proporção,
 *     então encostam um no outro e viram uma cor só;
 *   - branco, cinza e preto têm todos a mesma proporção, e é justamente o
 *     brilho que os separa — por isso ele nunca vale zero. Sem essa sobra, o
 *     texto branco no fundo preto viraria uma mancha cinza só.
 */
function posicaoDaCor(r, g, b, juntarSombras) {
  if (!(juntarSombras > 0)) return [r, g, b];
  // Quanto o brilho ainda pesa: 1 quando o controle está no zero, 0,15 no
  // máximo. Nunca zero, pelo motivo do parágrafo acima.
  const pesoDoBrilho = 1 - 0.85 * Math.min(1, juntarSombras / 100);
  const soma = r + g + b + 1;
  // A escala põe a proporção na mesma régua do brilho (0 a 255), senão os dois
  // termos não seriam comparáveis e um deles mandaria sozinho.
  const ESCALA = 441;
  return [
    (r / soma) * ESCALA,
    (g / soma) * ESCALA,
    ((soma - 1) / 3) * pesoDoBrilho,
  ];
}

function juntarCores(dados, quantas, juntarSombras) {
  const px = dados.data;
  const total = dados.width * dados.height;

  // Cada cor entra **uma vez**, com o número de pixels dela do lado.
  //
  // Esta é a parte que precisa ser assim, e custou uma versão errada: contando
  // pixel, o branco de fundo é metade da imagem e a mediana cai sempre dentro
  // dele — as divisões vão embora separando branco de branco, e num desenho de
  // três cores o vermelho e o azul terminam na mesma caixa, virando um roxo.
  // Contando cor, o branco é uma linha só e a divisão cai entre cores
  // diferentes.
  //
  // Os últimos três bits de cada canal são jogados fora antes de agrupar: eles
  // são justamente o ruído do JPG e do anti-serrilhado, e sem isso o histograma
  // de uma foto passa de um milhão de entradas.
  // Só o miolo entra na escolha (ver `marcarBordas`): ponto de divisa é
  // anti-serrilhado, uma mistura das duas cores vizinhas que não existe no
  // desenho, e deixá-lo votar rouba lugares da paleta para tons que ninguém vê.
  const naBorda = marcarBordas(px, dados.width, dados.height);

  const contagem = new Map();
  const contar = (aceitar) => {
    contagem.clear();
    for (let i = 0; i < total; i++) {
      if (px[i * 4 + 3] < 128) continue;
      if (!aceitar(i)) continue;
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const linha = contagem.get(k);
      if (linha) { linha.n++; linha.r += r; linha.g += g; linha.b += b; }
      else contagem.set(k, { n: 1, r, g, b });
    }
    return [...contagem.values()].reduce((s, c) => s + c.n, 0);
  };

  const doMiolo = contar((i) => naBorda[i] === 0);
  // Imagem que é toda degradê não tem miolo: ali cada ponto é divisa do
  // vizinho, e recusar as bordas deixaria a paleta sem nada para escolher.
  if (doMiolo < total * 0.05) contar(() => true);
  const cores = [...contagem.values()].map((c) => {
    const r = c.r / c.n, g = c.g / c.n, b = c.b / c.n;
    const [p0, p1, p2] = posicaoDaCor(r, g, b, juntarSombras);
    // `r/g/b` é a cor que vai sair no arquivo; `p0/p1/p2` é onde ela fica na
    // hora de decidir quem se parece com quem.
    return { n: c.n, r, g, b, p0, p1, p2 };
  });
  if (cores.length === 0) return { paleta: [], indices: new Int16Array(total).fill(-1) };

  let caixas = [cores];
  while (caixas.length < quantas) {
    // Sempre parte a caixa que mais se espalha: é ela que está misturando
    // cores diferentes no mesmo balde.
    let alvo = -1, maiorLado = -1, eixo = "p0";
    caixas.forEach((caixa, i) => {
      if (caixa.length < 2) return;
      ["p0", "p1", "p2"].forEach((c) => {
        let min = 255, max = 0;
        for (const cor of caixa) { if (cor[c] < min) min = cor[c]; if (cor[c] > max) max = cor[c]; }
        if (max - min > maiorLado) { maiorLado = max - min; alvo = i; eixo = c; }
      });
    });
    if (alvo < 0 || maiorLado <= 0) break;

    const caixa = caixas[alvo];
    caixa.sort((a, b) => a[eixo] - b[eixo]);
    // O corte fica onde a metade dos **pixels** já passou. Assim uma cor que
    // ocupa muita área não é partida ao meio à toa, e uma cor rara não some.
    const metade = caixa.reduce((s, c) => s + c.n, 0) / 2;
    let soma = 0, corte = 0;
    for (; corte < caixa.length - 1; corte++) {
      soma += caixa[corte].n;
      if (soma >= metade) break;
    }
    if (corte < 1) corte = 1;
    caixas.splice(alvo, 1, caixa.slice(0, corte), caixa.slice(corte));
  }

  const paleta = caixas.filter((c) => c.length > 0).map((caixa) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const cor of caixa) { r += cor.r * cor.n; g += cor.g * cor.n; b += cor.b * cor.n; n += cor.n; }
    return [r / n, g / n, b / n];
  });

  // A paleta se acomoda: cada cor vai para o meio de quem escolheu ela.
  //
  // O corte da mediana entrega caixas, e a cor de uma caixa é a média do que
  // caiu **nela**. Só que na hora de pintar ninguém pergunta de que caixa o
  // ponto veio: ele vai para a cor mais próxima, que muitas vezes é a da caixa
  // vizinha. As duas contas não fecham, e a diferença é cor errada no desenho.
  //
  // Aqui a paleta é reatribuída e recalculada algumas vezes, até parar de se
  // mexer. É barato porque a conta roda em cima do **histograma** (alguns
  // milhares de cores, cada uma com o peso dela), e não dos pixels — o laço
  // pesado, o de atribuir ponto a ponto, continua rodando uma vez só.
  //
  // Cor que ficou sem ninguém fica onde estava: some no arquivo (a camada não
  // tem ponto) e não vale a pena inventar lugar para ela.
  const PASSADAS = 8;
  for (let passada = 0; passada < PASSADAS; passada++) {
    const emPosicao = paleta.map((c) => posicaoDaCor(c[0], c[1], c[2], juntarSombras));
    const somaR = new Float64Array(paleta.length);
    const somaG = new Float64Array(paleta.length);
    const somaB = new Float64Array(paleta.length);
    const peso = new Float64Array(paleta.length);
    for (const cor of cores) {
      let melhor = 0, menorDist = Infinity;
      for (let k = 0; k < emPosicao.length; k++) {
        const d0 = cor.p0 - emPosicao[k][0];
        const d1 = cor.p1 - emPosicao[k][1];
        const d2 = cor.p2 - emPosicao[k][2];
        const d = d0 * d0 + d1 * d1 + d2 * d2;
        if (d < menorDist) { menorDist = d; melhor = k; }
      }
      somaR[melhor] += cor.r * cor.n; somaG[melhor] += cor.g * cor.n;
      somaB[melhor] += cor.b * cor.n; peso[melhor] += cor.n;
    }
    let mexeu = 0;
    for (let k = 0; k < paleta.length; k++) {
      if (peso[k] === 0) continue;
      const r = somaR[k] / peso[k], g = somaG[k] / peso[k], b = somaB[k] / peso[k];
      mexeu = Math.max(mexeu, Math.abs(r - paleta[k][0]),
        Math.abs(g - paleta[k][1]), Math.abs(b - paleta[k][2]));
      paleta[k] = [r, g, b];
    }
    // Menos de meio tom de mexida não muda pixel nenhum: pode parar.
    if (mexeu < 0.5) break;
  }
  for (let k = 0; k < paleta.length; k++) paleta[k] = paleta[k].map(Math.round);

  // Cada pixel vai para a cor mais próxima da paleta, medida no **mesmo**
  // espaço em que ela foi escolhida: comparar aqui em RGB desfaria o trabalho,
  // porque o ponto escuro da bola iria para a cor escura mais próxima em vez de
  // ir para o laranja dela.
  const paletaEmPosicao = paleta.map((c) => posicaoDaCor(c[0], c[1], c[2], juntarSombras));
  const indices = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    if (px[i * 4 + 3] < 128) { indices[i] = -1; continue; }
    const [q0, q1, q2] = posicaoDaCor(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], juntarSombras);
    let melhor = 0, menorDist = Infinity;
    for (let k = 0; k < paletaEmPosicao.length; k++) {
      const d0 = q0 - paletaEmPosicao[k][0];
      const d1 = q1 - paletaEmPosicao[k][1];
      const d2 = q2 - paletaEmPosicao[k][2];
      const d = d0 * d0 + d1 * d1 + d2 * d2;
      if (d < menorDist) { menorDist = d; melhor = k; }
    }
    indices[i] = melhor;
  }
  return { paleta, indices };
}

// ==================== 2. LIMPAR O CISCO ====================

/**
 * Apaga as manchas menores que `minimo` pontos, entregando cada uma à cor que
 * mais a cerca.
 *
 * Sem isto, a borda entre duas cores vem salpicada de ilhas de dois ou três
 * pontos — sobra do anti-serrilhado. Cada ilha viraria um contorno fechado no
 * SVG: invisível na tela, mas pesando no arquivo e fazendo a faca de corte
 * levantar e baixar à toa.
 */
function limparCisco(indices, cols, rows, minimo) {
  if (minimo <= 1) return indices;
  const visitado = new Uint8Array(indices.length);
  const fila = new Int32Array(indices.length);

  for (let inicio = 0; inicio < indices.length; inicio++) {
    if (visitado[inicio]) continue;
    const cor = indices[inicio];
    let fim = 0, lido = 0;
    fila[fim++] = inicio;
    visitado[inicio] = 1;
    const vizinhas = new Map(); // cor em volta -> quantos pontos de fronteira

    while (lido < fim) {
      const p = fila[lido++];
      const x = p % cols, y = (p / cols) | 0;
      const olhar = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
        const q = ny * cols + nx;
        if (indices[q] === cor) {
          if (!visitado[q]) { visitado[q] = 1; fila[fim++] = q; }
        } else {
          vizinhas.set(indices[q], (vizinhas.get(indices[q]) || 0) + 1);
        }
      };
      olhar(x - 1, y); olhar(x + 1, y); olhar(x, y - 1); olhar(x, y + 1);
    }

    if (fim >= minimo || vizinhas.size === 0) continue;
    // A mancha é cisco: entrega para quem mais encosta nela.
    let dona = null, maior = -1;
    vizinhas.forEach((quantos, qual) => { if (quantos > maior) { maior = quantos; dona = qual; } });
    if (dona === null) continue;
    for (let i = 0; i < fim; i++) indices[fila[i]] = dona;
  }
  return indices;
}

// ==================== 3. ACHAR A BORDA ====================

/**
 * Todos os contornos fechados de um mapa preto e branco.
 *
 * O caminho anda pelas **quinas** das células, não pelo meio delas, então o
 * contorno cai exatamente na divisa entre cheio e vazio. Cada aresta da divisa
 * é orientada de um jeito só (com o cheio sempre do mesmo lado), e aí os
 * contornos se fecham sozinhos: é só ir seguindo a aresta que começa onde a
 * anterior terminou.
 *
 * O contorno de fora e o buraco de dentro saem com sentidos contrários, e é
 * disso que o SVG precisa para vazar o buraco em vez de pintá-lo por cima.
 */
function contornosDoMapa(cheio, cols, rows) {
  const dentro = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && cheio[y * cols + x] === 1;

  // As arestas da divisa, guardadas por ponto de partida. Um ponto pode ser a
  // partida de duas arestas (a "sela", onde duas manchas se tocam na quina);
  // por isso o valor é uma lista, e não uma aresta só.
  const saindoDe = new Map();
  const chave = (x, y) => y * (cols + 1) + x;
  const guardar = (x1, y1, x2, y2) => {
    const k = chave(x1, y1);
    if (!saindoDe.has(k)) saindoDe.set(k, []);
    saindoDe.get(k).push({ x: x2, y: y2, usada: false });
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!dentro(x, y)) continue;
      if (!dentro(x, y - 1)) guardar(x, y, x + 1, y);           // topo: para a direita
      if (!dentro(x + 1, y)) guardar(x + 1, y, x + 1, y + 1);   // direita: para baixo
      if (!dentro(x, y + 1)) guardar(x + 1, y + 1, x, y + 1);   // base: para a esquerda
      if (!dentro(x - 1, y)) guardar(x, y + 1, x, y);           // esquerda: para cima
    }
  }

  const contornos = [];
  for (const [k, lista] of saindoDe) {
    for (const primeira of lista) {
      if (primeira.usada) continue;
      primeira.usada = true;

      const x0 = k % (cols + 1), y0 = (k / (cols + 1)) | 0;
      const pontos = [{ x: x0, y: y0 }];
      let x = primeira.x, y = primeira.y;
      let deX = x0, deY = y0;

      // Segue de aresta em aresta até voltar ao começo. O limite existe só
      // para nunca girar para sempre num mapa estranho.
      for (let n = 0; n < cols * rows * 4 + 8; n++) {
        pontos.push({ x, y });
        if (x === x0 && y === y0) break;
        const saidas = saindoDe.get(chave(x, y));
        if (!saidas) break;
        // Na sela, seguir em frente cruzaria o desenho: a escolha é sempre a
        // curva mais fechada para o mesmo lado, e aí as duas manchas ficam
        // separadas em vez de viraram uma só.
        let escolhida = null;
        if (saidas.length === 1) {
          escolhida = saidas[0].usada ? null : saidas[0];
        } else {
          const dxEntrada = x - deX, dyEntrada = y - deY;
          let melhorGiro = Infinity;
          for (const s of saidas) {
            if (s.usada) continue;
            const dx = s.x - x, dy = s.y - y;
            // Ângulo de giro entre a entrada e a saída, medido no sentido
            // horário: 0 = seguir reto, 1 = virar para um lado, 3 = para o outro.
            const cruz = dxEntrada * dy - dyEntrada * dx;
            const escalar = dxEntrada * dx + dyEntrada * dy;
            const giro = escalar > 0 ? 0 : cruz > 0 ? 1 : cruz < 0 ? 3 : 2;
            if (giro < melhorGiro) { melhorGiro = giro; escolhida = s; }
          }
        }
        if (!escolhida) break;
        escolhida.usada = true;
        deX = x; deY = y;
        x = escolhida.x; y = escolhida.y;
      }

      if (pontos.length > 3) contornos.push(pontos);
    }
  }
  return contornos;
}

// ==================== 3a. SAIR DA GRADE ====================

/**
 * A cor da imagem numa posição qualquer, mesmo entre pixels.
 *
 * O contorno anda pelas **quinas** das células, e a quina (i, j) fica no canto
 * do pixel (i, j) — ou seja, meio pixel deslocada do centro dele. Por isso a
 * conversão tira 0,5 antes de interpolar entre os quatro pixels em volta.
 */
function corNaPosicao(px, cols, rows, lx, ly, saida) {
  const x = Math.min(cols - 1.001, Math.max(0, lx - 0.5));
  const y = Math.min(rows - 1.001, Math.max(0, ly - 0.5));
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1);
  for (let c = 0; c < 3; c++) {
    const a = px[(y0 * cols + x0) * 4 + c], b = px[(y0 * cols + x1) * 4 + c];
    const d = px[(y1 * cols + x0) * 4 + c], e = px[(y1 * cols + x1) * 4 + c];
    saida[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  return saida;
}

/**
 * Empurra cada ponto do contorno para onde a borda está de verdade.
 *
 * O contorno chega aqui todo em cima de divisas inteiras de pixel. Para cada
 * ponto:
 *
 *   1. a direção da borda sai dos vizinhos (uma janela de dois para cada lado,
 *      senão a direção fica presa aos oito ângulos que a grade permite);
 *   2. andando na perpendicular, longe para cada lado, estão as duas cores
 *      puras — a da peça e a de quem está do outro lado;
 *   3. os dois pontos de perto dizem, pela mistura, onde fica a metade do
 *      caminho entre as duas. Aquilo é a borda.
 *
 * O ponto anda no máximo meio pixel: mais que isso não é anti-serrilhado, é
 * outra coisa (uma borda vizinha, um detalhe fino), e nesses casos ficar onde
 * estava é mais seguro do que chutar.
 *
 * Sem contraste entre os dois lados não há o que ler, e o ponto fica parado —
 * é o que acontece quando duas cores quase iguais se encostam.
 */
function afinarNoSubpixel(contorno, px, cols, rows, mapa, paleta, indices, cor, guardados) {
  const n = contorno.length;
  if (n < 8) return contorno;

  // A célula numa posição do contorno. As quinas ficam meio pixel deslocadas do
  // centro das células, daí o 0,5.
  const celula = (lx, ly) => {
    const x = Math.round(lx - 0.5), y = Math.round(ly - 0.5);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return -1;
    return y * cols + x;
  };
  const daCamada = (lx, ly) => {
    const c = celula(lx, ly);
    return c < 0 ? 0 : mapa[c];
  };

  const perto1 = [0, 0, 0], perto2 = [0, 0, 0];
  const afinado = new Array(n);
  const dentro = paleta[cor];

  for (let i = 0; i < n; i++) {
    const p = contorno[i];

    // Esta divisa já foi resolvida por outra camada? Então o destino é aquele.
    // É o que mantém a borda entre duas cores sendo **uma só**: sem isto, cada
    // uma calcula a direção pelos próprios degraus, as duas se afastam e abre
    // fresta entre elas.
    const chave = p.y * (cols + 1) + p.x;
    if (guardados) {
      const pronto = guardados.get(chave);
      if (pronto) { afinado[i] = pronto; continue; }
    }

    const a = contorno[(i - 2 + n) % n], b = contorno[(i + 2) % n];
    // A perpendicular à direção da borda.
    let nx = b.y - a.y, ny = -(b.x - a.x);
    // Registra o destino deste ponto, mexido ou não, para a próxima camada que
    // passar por aqui receber exatamente o mesmo.
    const decidir = (destino) => {
      afinado[i] = destino;
      if (guardados) guardados.set(chave, destino);
    };

    const tamanho = Math.hypot(nx, ny);
    if (tamanho < 1e-9) { decidir(p); continue; }
    nx /= tamanho; ny /= tamanho;

    // De que lado é o dentro? Quem responde é o mapa da camada, e não o
    // sentido em que o contorno está rodando — buraco roda ao contrário do
    // contorno de fora, e supor o sentido empurrava o ponto para o lado errado.
    const ladoMenos = daCamada(p.x - nx * 0.7, p.y - ny * 0.7);
    const ladoMais = daCamada(p.x + nx * 0.7, p.y + ny * 0.7);
    if (ladoMenos === ladoMais) { decidir(p); continue; }
    if (ladoMenos === 0) { nx = -nx; ny = -ny; }

    // A cor do outro lado sai do mapa de cores, e não de uma sonda na imagem.
    // Foi aqui que as duas versões anteriores erraram: sondando a 1,5 pixel, um
    // traço de letra com quatro pixels de largura era atravessado e a sonda
    // trazia a cor do outro lado — a conta invertia e a letra fechava.
    const celulaFora = celula(p.x + nx * 0.7, p.y + ny * 0.7);
    if (celulaFora < 0) { decidir(p); continue; }
    const corFora = indices[celulaFora];
    if (corFora < 0 || corFora === cor) { decidir(p); continue; }
    const fora = paleta[corFora];

    const dr = fora[0] - dentro[0], dg = fora[1] - dentro[1], db = fora[2] - dentro[2];
    const contraste = dr * dr + dg * dg + db * db;
    // Duas cores quase iguais não deixam ler nada na mistura.
    if (contraste < 900) { decidir(p); continue; }

    // O quanto cada amostra já andou de uma cor para a outra, de 0 a 1.
    const quanto = (c) =>
      ((c[0] - dentro[0]) * dr + (c[1] - dentro[1]) * dg + (c[2] - dentro[2]) * db) / contraste;

    corNaPosicao(px, cols, rows, p.x - nx * 0.5, p.y - ny * 0.5, perto1);
    corNaPosicao(px, cols, rows, p.x + nx * 0.5, p.y + ny * 0.5, perto2);
    const t1 = quanto(perto1), t2 = quanto(perto2);

    // Sem rampa entre uma amostra e a outra não há o que medir: é borda dura,
    // sem anti-serrilhado, e ela já está no lugar certo.
    if (t2 - t1 < 0.15) { decidir(p); continue; }
    let desvio = -0.5 + (0.5 - t1) / (t2 - t1);
    if (!(desvio > -0.5)) desvio = -0.5;
    if (!(desvio < 0.5)) desvio = 0.5;

    decidir({ x: p.x + nx * desvio, y: p.y + ny * desvio });
  }
  return afinado;
}

// ==================== 3b. É UM CÍRCULO? ====================

/**
 * O contorno é um círculo? E se não for, é uma elipse?
 *
 * Vale a pergunta porque desenho de verdade é cheio de círculo — botão, selo,
 * bolinha, o miolo de um logo — e um círculo aproximado por pedaços de curva
 * tem dois defeitos: ampliado, a barriga oscila; e aberto no CorelDRAW, ele é
 * um punhado de nós soltos em vez de uma circunferência que se pega pelo raio.
 *
 * A conta é um ajuste por mínimos quadrados (Kåsa para o círculo, o mesmo
 * sistema com dois raios para a elipse), seguido da pergunta que decide: qual
 * é o ponto que mais se afastou da forma ajustada? Se nem o pior ponto passa da
 * tolerância, é aquela forma mesmo.
 *
 * Duas peneiras evitam o falso positivo:
 *
 *   - **a área tem que bater.** Meia-lua se ajusta bem a um círculo (os pontos
 *     dela estão todos em cima dele), e sem esta conferência ela viraria um
 *     círculo inteiro.
 *   - **a forma tem que ter tamanho.** Num contorno de 4 pontos qualquer coisa
 *     se ajusta a qualquer coisa.
 */
function acharFormaRedonda(pontos, tolerancia) {
  const n = pontos.length;
  if (n < 12) return null;

  let somaX = 0, somaY = 0;
  for (const p of pontos) { somaX += p.x; somaY += p.y; }
  const mx = somaX / n, my = somaY / n;

  // ---- círculo (Kåsa): resolve o sistema 2x2 em volta do centro de massa ----
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of pontos) {
    const u = p.x - mx, v = p.y - my, z = u * u + v * v;
    sxx += u * u; sxy += u * v; syy += v * v; sxz += u * z; syz += v * z;
  }
  const det = sxx * syy - sxy * sxy;
  const area = Math.abs(areaComSinal(pontos));

  if (Math.abs(det) > 1e-9) {
    const cx = mx + (sxz * syy - syz * sxy) / (2 * det);
    const cy = my + (syz * sxx - sxz * sxy) / (2 * det);
    let somaR = 0;
    for (const p of pontos) somaR += Math.hypot(p.x - cx, p.y - cy);
    const r = somaR / n;
    if (r > 2) {
      let pior = 0;
      for (const p of pontos) {
        const d = Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
        if (d > pior) pior = d;
      }
      // A área fecha com a de um círculo de verdade? É o que separa a bolinha
      // da meia-lua.
      const areaDoCirculo = Math.PI * r * r;
      const bateAArea = Math.abs(area - areaDoCirculo) < areaDoCirculo * 0.06;
      if (pior <= tolerancia && bateAArea) return { tipo: "circulo", cx, cy, rx: r, ry: r };
    }
  }

  // ---- elipse deitada ou em pé, sem inclinação ----
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pontos) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
  if (rx > 2 && ry > 2) {
    // O raio local da elipse na direção de cada ponto, para a distância sair
    // em pontos de tela e a tolerância continuar querendo dizer a mesma coisa.
    let pior = 0;
    for (const p of pontos) {
      const dx = (p.x - cx) / rx, dy = (p.y - cy) / ry;
      const t = Math.hypot(dx, dy);
      if (t < 1e-9) { pior = Infinity; break; }
      const distancia = Math.hypot(p.x - cx, p.y - cy) * (1 - 1 / t);
      if (Math.abs(distancia) > pior) pior = Math.abs(distancia);
    }
    const areaDaElipse = Math.PI * rx * ry;
    const bateAArea = Math.abs(area - areaDaElipse) < areaDaElipse * 0.06;
    if (pior <= tolerancia && bateAArea) return { tipo: "elipse", cx, cy, rx, ry };
  }

  return null;
}

/**
 * O caminho de um círculo ou elipse: dois arcos de meia volta.
 *
 * Sai como comando `A` do SVG, que é a circunferência exata — não uma curva que
 * passa perto dela. Programa de vetor reconhece isso como forma redonda, e a
 * faca de corte percorre um arco em vez de quarenta segmentos.
 */
function caminhoRedondo(forma) {
  const nums = (v) => Math.round(v * 100) / 100;
  const { cx, cy, rx, ry } = forma;
  return `M${nums(cx - rx)} ${nums(cy)}` +
    `A${nums(rx)} ${nums(ry)} 0 1 0 ${nums(cx + rx)} ${nums(cy)}` +
    `A${nums(rx)} ${nums(ry)} 0 1 0 ${nums(cx - rx)} ${nums(cy)}Z`;
}

// ==================== 4. ALISAR ====================

/**
 * Onde estão as quinas de verdade.
 *
 * Um logo tem canto vivo (a ponta de uma estrela) e tem curva (a barriga de um
 * "S"). Alisar tudo arredonda a ponta da estrela; não alisar nada deixa a
 * curva em degraus. A conta olha o ângulo que o contorno faz em cada ponto:
 * virou mais que o limite, é quina e fica como está.
 */
function acharQuinas(pontos, anguloLimite, bruto, ondeNoBruto) {
  const n = pontos.length;
  const quina = new Uint8Array(n);
  if (n < 4) { quina.fill(1); return quina; }
  const cos = Math.cos((anguloLimite * Math.PI) / 180);

  // O quanto o contorno vira em cada ponto, de 0 (segue reto) a 2 (dobra de
  // volta). Medido no contorno bruto quando ele está à mão: dois vizinhos do
  // polígono simplificado podem estar a um pixel ou a cinquenta, e o ângulo
  // entre eles quer dizer coisas diferentes em cada caso.
  const janela = bruto ? Math.max(2, Math.round(Math.sqrt(bruto.length) / 2)) : 0;
  const fechamento = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    let a, p = pontos[i], b;
    const k = ondeNoBruto ? ondeNoBruto.get(pontos[i]) : undefined;
    if (bruto && k !== undefined) {
      a = bruto[(k - janela + bruto.length) % bruto.length];
      b = bruto[(k + janela) % bruto.length];
    } else {
      a = pontos[(i - 1 + n) % n];
      b = pontos[(i + 1) % n];
    }
    const ax = a.x - p.x, ay = a.y - p.y, bx = b.x - p.x, by = b.y - p.y;
    const na = Math.hypot(ax, ay), nb = Math.hypot(bx, by);
    if (na < 1e-9 || nb < 1e-9) { fechamento[i] = 2; continue; }
    // Produto escalar normalizado: -1 é seguir reto, +1 é dobrar de volta.
    fechamento[i] = (ax * bx + ay * by) / (na * nb);
  }

  for (let i = 0; i < n; i++) {
    if (fechamento[i] <= -cos) continue;
    // Só o mais fechado da vizinhança vira quina. Sem isto, um canto vivo
    // marcava três pontos seguidos, e cada um deles cortava a curva ao lado —
    // o canto saía chanfrado em vez de vivo.
    const antes = fechamento[(i - 1 + n) % n], depois = fechamento[(i + 1) % n];
    if (fechamento[i] >= antes && fechamento[i] >= depois) quina[i] = 1;
  }
  return quina;
}

/**
 * A direção do contorno em cada ponto.
 *
 * Não é a direção do vizinho: é a do **desenho**. Ela sai de uma janela do
 * contorno bruto em volta do ponto, o que faz a mesma curva dar a mesma
 * tangente venha o ponto de onde vier — e é isso que tira a ondulação que
 * sobrava mesmo depois de simplificar.
 *
 * Numa quina a tangente é cortada em duas, uma para cada lado, porque canto
 * vivo é justamente o lugar onde a direção muda de repente. A de entrada olha
 * para trás, a de saída olha para a frente.
 */
function tangentesDoContorno(pontos, quinas, bruto, ondeNoBruto) {
  const n = pontos.length;
  const janela = bruto ? Math.max(2, Math.round(Math.sqrt(bruto.length) / 2)) : 0;
  const saida = new Array(n);

  const normalizar = (x, y) => {
    const t = Math.hypot(x, y);
    return t < 1e-9 ? { x: 0, y: 0 } : { x: x / t, y: y / t };
  };

  for (let i = 0; i < n; i++) {
    const p = pontos[i];
    const anterior = pontos[(i - 1 + n) % n], proximo = pontos[(i + 1) % n];
    const paraTras = normalizar(p.x - anterior.x, p.y - anterior.y);
    const paraFrente = normalizar(proximo.x - p.x, proximo.y - p.y);

    if (quinas[i] || !bruto) {
      // Quina: cada lado com a sua direção, e o canto continua vivo.
      saida[i] = { entra: paraTras, sai: paraFrente };
      continue;
    }
    const k = ondeNoBruto ? ondeNoBruto.get(p) : undefined;
    if (k === undefined) { saida[i] = { entra: paraTras, sai: paraFrente }; continue; }

    const a = bruto[(k - janela + bruto.length) % bruto.length];
    const b = bruto[(k + janela) % bruto.length];
    const t = normalizar(b.x - a.x, b.y - a.y);
    saida[i] = { entra: t, sai: t };
  }
  return saida;
}

/**
 * Até onde, a partir de `i`, os pontos ainda cabem numa reta?
 *
 * Devolve o último índice que cabe. Andar ponto a ponto medindo a distância de
 * todos até a corda é conta quadrática, mas o contorno já chegou aqui
 * simplificado — são dezenas de pontos, não milhares.
 */
function ateOndeVaiAReta(pontos, i, tol, podeAtravessar, doBruto) {
  const n = pontos.length;
  let melhor = i;
  for (let j = i + 1; j < n; j++) {
    if (!podeAtravessar(j) && j > i + 1) break;
    const a = pontos[i], b = pontos[j];
    const dx = b.x - a.x, dy = b.y - a.y;
    const tamanho = Math.hypot(dx, dy);
    if (tamanho < 1e-9) break;
    let cabe = true;
    // Contra o contorno de verdade, não contra os vértices que sobraram dele.
    for (const p of doBruto(i, j)) {
      // Distância do ponto até a corda, pelo produto vetorial.
      const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / tamanho;
      if (d > tol) { cabe = false; break; }
    }
    if (!cabe) break;
    melhor = j;
    if (!podeAtravessar(j)) break;   // parou numa quina: a reta termina nela
  }
  return melhor;
}

/**
 * Até onde vai um arco de circunferência, e qual é ele.
 *
 * O ajuste é o mesmo de `acharFormaRedonda` (Kåsa), só que sobre um pedaço. A
 * exigência a mais: o pedaço tem que **virar** de verdade. Sem isso, uma reta
 * se ajusta a um círculo de raio gigante e sairia como arco — mais pesado e
 * menos exato que a reta que ela é.
 */
function ateOndeVaiOArco(pontos, i, tol, podeAtravessar, doBruto) {
  const n = pontos.length;
  let achado = null;
  for (let j = i + 2; j < n; j++) {
    if (!podeAtravessar(j) && j > i + 1) break;
    const doTrecho = doBruto(i, j);
    if (doTrecho.length < 5) continue;
    const circulo = ajustarCirculo(doTrecho);
    if (!circulo) break;
    const { cx, cy, r } = circulo;
    // Raio absurdo comparado ao tamanho do trecho é reta disfarçada, e reta
    // sai melhor como reta.
    const corda = Math.hypot(pontos[j].x - pontos[i].x, pontos[j].y - pontos[i].y);
    if (r > corda * 8) { if (achado) break; else continue; }
    let pior = 0;
    for (const p of doTrecho) {
      const d = Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
      if (d > pior) { pior = d; if (pior > tol) break; }
    }
    if (pior > tol) break;
    achado = { ate: j, cx, cy, r };
    if (!podeAtravessar(j)) break;
  }
  return achado;
}

/** O círculo que melhor passa por estes pontos, ou null se eles forem retos. */
function ajustarCirculo(pontos) {
  const n = pontos.length;
  if (n < 3) return null;
  let somaX = 0, somaY = 0;
  for (const p of pontos) { somaX += p.x; somaY += p.y; }
  const mx = somaX / n, my = somaY / n;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of pontos) {
    const u = p.x - mx, v = p.y - my, z = u * u + v * v;
    sxx += u * u; sxy += u * v; syy += v * v; sxz += u * z; syz += v * z;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9) return null;
  const cx = mx + (sxz * syy - syz * sxy) / (2 * det);
  const cy = my + (syz * sxx - sxz * sxy) / (2 * det);
  let somaR = 0;
  for (const p of pontos) somaR += Math.hypot(p.x - cx, p.y - cy);
  return { cx, cy, r: somaR / n };
}

/**
 * O centro que o SVG vai usar para este arco.
 *
 * O `A` do SVG não diz onde fica o centro: ele diz o raio e duas bandeiras, e
 * o programa que desenha calcula o centro a partir das duas pontas. Refazer
 * essa conta aqui é o que deixa conferir o arco **que vai sair**, e não o
 * círculo que foi ajustado — os dois não são o mesmo, como se vê abaixo.
 */
function centroDoArco(a, b, r, grande, sentido) {
  const mx = (a.x - b.x) / 2, my = (a.y - b.y) / 2;
  const q = mx * mx + my * my;
  if (q < 1e-12) return null;
  const sobra = (r * r - q) / q;
  const k = Math.sqrt(Math.max(0, sobra)) * (grande === sentido ? -1 : 1);
  return {
    cx: k * my + (a.x + b.x) / 2,
    cy: -k * mx + (a.y + b.y) / 2,
  };
}

/**
 * O comando de arco do SVG para ir de `a` até `b` pela circunferência dada.
 *
 * As duas bandeiras do `A` são o que costuma sair errado: uma diz se o arco é
 * o caminho curto ou o longo, a outra diz para que lado ele vira. Aqui as
 * quatro combinações são desenhadas de mentira — com o centro que o SVG
 * calcularia para cada uma — e medidas contra os pontos por onde o contorno
 * **realmente** passou. Fica a que ninguém consegue reclamar, e se a melhor
 * delas ainda passa longe, o trecho não é arco.
 *
 * **Meia volta é o lugar perigoso, e custou um defeito.** Quando as duas
 * pontas ficam quase em lados opostos do círculo, meia corda encosta no raio —
 * e aí um centésimo a menos no raio ajustado faz o SVG esticá-lo para caber, o
 * que arrasta o centro para cima da corda. O arco sai deslocado uns quatro
 * pontos ao longo de toda a volta. No logo da casa isso engordava o anel
 * branco de fora e o erro pulava de 1,29 para 3,12 — aparecendo só com a
 * Suavidade **abaixo de 0,5**, ou seja, exatamente quando se pede mais
 * fidelidade. A conferência antiga não via nada porque media contra o círculo
 * ajustado, que continuava certinho; quem saía do lugar era o arco.
 *
 * Por isso o raio é esticado aqui, de propósito, até meia corda, e já sai
 * arredondado — o texto que vai para o arquivo é o mesmo que foi conferido.
 */
function comandoDeArco(a, b, circulo, amostra, tol, nums) {
  const corda = Math.hypot(b.x - a.x, b.y - a.y);
  if (corda < 1e-9) return null;
  // Arredondado antes de conferir, e nunca menor que meia corda: é este o raio
  // que vai para o arquivo, então é este que tem que ser medido.
  const r = Math.max(nums(circulo.r), Math.ceil(corda * 50) / 100);

  const volta = (x) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  /** O quanto o pior ponto da amostra se afasta do arco destas bandeiras. */
  const desvio = (grande, sentido) => {
    const centro = centroDoArco(a, b, r, grande, sentido);
    if (!centro) return null;
    const { cx, cy } = centro;
    const ang = (p) => Math.atan2(p.y - cy, p.x - cx);
    const aA = ang(a), aB = ang(b);
    const abre = sentido ? volta(aB - aA) : volta(aA - aB);
    let pior = 0;
    for (const p of amostra) {
      const t = sentido ? volta(ang(p) - aA) : volta(aA - ang(p));
      // Ponto dentro da varredura é medido pelo raio; ponto que caiu fora dela
      // é medido até a ponta mais próxima — e é isso que derruba o lado
      // errado, porque ali o desenho inteiro fica fora do arco.
      const d = t <= abre
        ? Math.abs(Math.hypot(p.x - cx, p.y - cy) - r)
        : Math.min(Math.hypot(p.x - a.x, p.y - a.y), Math.hypot(p.x - b.x, p.y - b.y));
      if (d > pior) { pior = d; if (pior > tol) return null; }
    }
    return { pior, grande, sentido };
  };

  let melhor = null;
  for (const grande of [0, 1]) {
    for (const sentido of [0, 1]) {
      const tentativa = desvio(grande, sentido);
      if (tentativa && (!melhor || tentativa.pior < melhor.pior)) melhor = tentativa;
    }
  }
  // Nenhuma passou: não é arco. Quem chamou desenha o trecho como curva.
  if (!melhor) return null;

  return `A${r} ${r} 0 ${melhor.grande} ${melhor.sentido} ${nums(b.x)} ${nums(b.y)}`;
}

/**
 * O contorno simplificado vira caminho: reta onde é reta, arco onde é arco,
 * curva no resto.
 *
 * Em cada ponto o desenho pergunta até onde vai uma reta e até onde vai um
 * arco, e fica com o que alcançar mais longe — empate é da reta, que é mais
 * simples e mais exata. O que não é nem um nem outro sai como Bézier passando
 * pelos pontos (Catmull-Rom), que é o comportamento antigo, agora restrito ao
 * pedaço que precisa dele.
 *
 * Nas quinas nada atravessa: reta, arco e curva param ali, e o canto continua
 * vivo.
 */
function caminhoDoContorno(pontos, quinas, tensao, tol, bruto, tangentes) {
  const n = pontos.length;
  if (n < 3) return "";
  const nums = (v) => (Math.round(v * 100) / 100);
  const ehQuina = (i) => quinas[((i % n) + n) % n] === 1;
  const podeAtravessar = (j) => !ehQuina(j % n);

  // O laço trabalha numa lista aberta que dá a volta e fecha no primeiro ponto,
  // para o último trecho poder ser reta ou arco como qualquer outro.
  const volta = pontos.slice();
  volta.push(pontos[0]);

  // Onde cada ponto que sobrou da simplificação estava no contorno bruto.
  // `simplificar` devolve os mesmos objetos, filtrados, então dá para achá-los
  // por identidade em vez de comparar coordenada.
  const ondeNoBruto = new Map();
  if (bruto) bruto.forEach((p, k) => { if (!ondeNoBruto.has(p)) ondeNoBruto.set(p, k); });
  const indice = volta.map((p, k) => {
    // O último ponto da volta é o primeiro de novo, fechando o caminho. Ele
    // aponta para o **fim** do contorno bruto — e para o último ponto que
    // existe, não para um depois dele: `contornosDoMapa` já devolve a volta
    // fechada, com o ponto de partida repetido no fim.
    if (k === volta.length - 1) return bruto ? bruto.length - 1 : 0;
    const achado = ondeNoBruto.get(p);
    return achado === undefined ? -1 : achado;
  });

  /**
   * Os pontos do contorno bruto entre dois pontos simplificados.
   *
   * Trecho comprido é amostrado: conferir os mil pontos de uma volta inteira em
   * cada tentativa seria conta quadrática, e quarenta pontos bem espalhados já
   * mostram qualquer barriga que passe da tolerância.
   */
  const doBruto = (i, j) => {
    if (!bruto || indice[i] < 0 || indice[j] < 0) return volta.slice(i, j + 1);
    const de = indice[i], ate = indice[j];
    if (ate <= de) return volta.slice(i, j + 1);
    const quantos = ate - de + 1;
    const salto = Math.max(1, Math.floor(quantos / 40));
    const fatia = [];
    for (let k = de; k <= ate; k += salto) if (bruto[k]) fatia.push(bruto[k]);
    if (bruto[ate] && fatia[fatia.length - 1] !== bruto[ate]) fatia.push(bruto[ate]);
    return fatia.length >= 2 ? fatia : volta.slice(i, j + 1);
  };

  let d = `M${nums(volta[0].x)} ${nums(volta[0].y)}`;
  let i = 0;
  let girando = 0;
  while (i < volta.length - 1 && girando++ < n * 4) {
    const ateReta = ateOndeVaiAReta(volta, i, tol, podeAtravessar, doBruto);
    const arco = ateOndeVaiOArco(volta, i, tol, podeAtravessar, doBruto);

    // A reta tem preferência no empate, e mais que isso: o arco só ganha se
    // alcançar bem mais longe. Sem essa margem, um arco de raio grande cabe
    // numa lateral quase reta e a engole junto com o canto seguinte — o
    // retângulo arredondado saía com uma reta só, em vez de quatro.
    const bemMaisLonge = ateReta + Math.max(2, Math.ceil((ateReta - i) * 0.25));
    if (arco && arco.ate >= bemMaisLonge) {
      const comando = comandoDeArco(
        volta[i], volta[arco.ate], arco, doBruto(i, arco.ate), tol, nums);
      if (comando) {
        d += comando;
        i = arco.ate;
        continue;
      }
      // Recusado na conferência: segue para a reta ou para a curva, abaixo.
    }
    if (ateReta > i) {
      d += `L${nums(volta[ateReta].x)} ${nums(volta[ateReta].y)}`;
      i = ateReta;
      continue;
    }

    // Nem reta nem arco: um pedaço de curva até o próximo ponto.
    //
    // As alças saem **na direção da tangente** de cada ponta, e não apontando
    // para o vizinho seguinte. A diferença aparece ampliando: com a tangente, a
    // curva entra e sai de cada ponto na mesma direção dos dois lados, e a
    // emenda entre um pedaço e outro some. Apontando para o vizinho, a direção
    // vinha do acaso de onde o vizinho caiu, e o traço ondulava de leve.
    const a = volta[i], b = volta[i + 1];
    const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
    if (comprimento > 1e-6) {
      const tA = tangentes ? tangentes[i % n].sai : null;
      const tB = tangentes ? tangentes[(i + 1) % n].entra : null;
      // Um terço do segmento é o comprimento que faz uma Bézier cúbica seguir
      // a tangente sem estufar; `tensao` deixa arredondar mais ou menos.
      const alca = (comprimento / 3) * tensao;
      const c1x = tA && tA.x + tA.y !== 0 ? a.x + tA.x * alca : a.x + (b.x - a.x) / 3;
      const c1y = tA && tA.x + tA.y !== 0 ? a.y + tA.y * alca : a.y + (b.y - a.y) / 3;
      const c2x = tB && tB.x + tB.y !== 0 ? b.x - tB.x * alca : b.x - (b.x - a.x) / 3;
      const c2y = tB && tB.x + tB.y !== 0 ? b.y - tB.y * alca : b.y - (b.y - a.y) / 3;
      d += `C${nums(c1x)} ${nums(c1y)} ${nums(c2x)} ${nums(c2y)} ${nums(b.x)} ${nums(b.y)}`;
    }
    i++;
  }
  return d + "Z";
}

/** A versão antiga: curva em tudo. Fica para comparação na bancada. */
function curvaDoContorno(pontos, quinas, tensao) {
  const n = pontos.length;
  if (n < 3) return "";
  const p = (i) => pontos[((i % n) + n) % n];
  const ehQuina = (i) => quinas[((i % n) + n) % n] === 1;

  const nums = (v) => (Math.round(v * 100) / 100);
  let d = `M${nums(p(0).x)} ${nums(p(0).y)}`;

  for (let i = 0; i < n; i++) {
    const a = p(i), b = p(i + 1);
    if (ehQuina(i) && ehQuina(i + 1)) {
      d += `L${nums(b.x)} ${nums(b.y)}`;
      continue;
    }
    // A ponta de cada lado aponta para a direção de quem vem antes e depois;
    // numa quina ela aponta para o próprio segmento, e o trecho sai reto dali.
    const antes = ehQuina(i) ? a : p(i - 1);
    const depois = ehQuina(i + 1) ? b : p(i + 2);

    // A alça nunca passa de um terço do segmento. Sem esse limite, num contorno
    // pequeno com virada fechada ela ficava mais longa que o próprio segmento e
    // a curva saía **para fora** do desenho — o que aparecia como fiapo de cor
    // onde não havia nada. Um terço é o quanto uma Bézier cúbica estica sem
    // escapar da casca do polígono.
    const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
    const teto = comprimento / 3;
    const encurtar = (dx, dy) => {
      const t = Math.hypot(dx, dy) * tensao / 6;
      if (t <= teto || t < 1e-9) return [dx * tensao / 6, dy * tensao / 6];
      const k = teto / t * tensao / 6;
      return [dx * k, dy * k];
    };
    const [e1x, e1y] = encurtar(b.x - antes.x, b.y - antes.y);
    const [e2x, e2y] = encurtar(depois.x - a.x, depois.y - a.y);
    d += `C${nums(a.x + e1x)} ${nums(a.y + e1y)} ${nums(b.x - e2x)} ${nums(b.y - e2y)} ${nums(b.x)} ${nums(b.y)}`;
  }
  return d + "Z";
}

// ==================== O CAMINHO INTEIRO ====================

/**
 * A imagem vira SVG.
 *
 * As camadas saem da maior para a menor. Isso importa: as cores se encostam
 * pela borda, e um fio de fundo entre duas delas apareceria como risco branco.
 * Desenhando a maior primeiro e as outras por cima, qualquer folga de meio
 * ponto fica escondida embaixo da camada seguinte, em vez de virar falha.
 *
 * `opcoes`:
 *   cores      quantas cores a paleta terá (1 vira silhueta, boa para corte)
 *   detalhe    a mancha menor que isso, em pontos, é cisco e some
 *   suavidade  o quanto o contorno pode se afastar da grade ao ser simplificado
 *   quina      a partir de quantos graus um ponto é canto vivo e não é alisado
 *   larguraCm  a medida real, quando conhecida, para o SVG sair no tamanho certo
 */
function vetorizarImagem(dados, opcoes = {}) {
  const cols = dados.width, rows = dados.height;
  const px = dados.data;
  const cores = Math.max(1, Math.min(32, Math.round(opcoes.cores || 6)));
  const detalhe = Math.max(0, Math.round(opcoes.detalhe == null ? 8 : opcoes.detalhe));
  const suavidade = opcoes.suavidade == null ? 1 : Math.max(0, opcoes.suavidade);
  const anguloQuina = opcoes.quina == null ? 55 : opcoes.quina;
  // O quanto a curva arredonda entre um ponto e outro. 1 é o padrão (a alça
  // vale um terço do segmento, que é o que segue a tangente sem estufar).
  const tensao = opcoes.tensao == null ? 1 : Math.max(0, Math.min(2, opcoes.tensao));
  // Reconhecer círculo e elipse. Ligado por padrão: quando a forma é redonda de
  // verdade, sair como arco é melhor em tudo — mais fiel, menor e editável.
  const redondas = opcoes.redondas !== false;
  // Remontar o contorno em reta, arco e curva. Fica ligado; a chave existe para
  // a bancada poder comparar com o jeito antigo.
  const porTrechos = opcoes.porTrechos !== false;
  // Ler a borda no anti-serrilhado em vez de deixá-la na divisa do pixel.
  const subpixel = opcoes.subpixel !== false;
  // De 0 a 100. Em 0 a paleta é escolhida em RGB, como antes; subindo, o brilho
  // pesa menos e as sombras de uma mesma cor deixam de virar peças separadas.
  const juntarSombras = Math.max(0, Math.min(100, Number(opcoes.juntarSombras) || 0));

  const { paleta, indices } = juntarCores(dados, cores, juntarSombras);
  if (paleta.length === 0) return { svg: null, camadas: [], erro: "A imagem está vazia ou toda transparente." };
  limparCisco(indices, cols, rows, detalhe);

  // Onde cada ponto de divisa foi parar depois do ajuste de subpixel. É
  // compartilhado por todas as camadas de propósito: divisa entre duas cores é
  // uma só, e as duas têm que concordar sobre onde ela está.
  const pontosAfinados = subpixel ? new Map() : null;

  const camadas = [];
  for (let k = 0; k < paleta.length; k++) {
    const mapa = new Uint8Array(cols * rows);
    let quantos = 0;
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === k) { mapa[i] = 1; quantos++; }
    }
    if (quantos === 0) continue;

    const contornos = contornosDoMapa(mapa, cols, rows);
    const partes = [];
    contornos.forEach((naGrade) => {
      // O contorno sai da grade e vai para onde o anti-serrilhado diz que a
      // borda está. Feito antes de tudo: simplificação, reconhecimento de
      // círculo e ajuste de reta e arco passam a trabalhar em cima da posição
      // de verdade, e não de uma arredondada para o pixel mais próximo.
      const bruto = subpixel
        ? afinarNoSubpixel(naGrade, px, cols, rows, mapa, paleta, indices, k, pontosAfinados)
        : naGrade;
      const area = Math.abs(areaComSinal(bruto));
      // Contorno que fecha menos que o cisco não vale um caminho no arquivo.
      if (area < Math.max(1, detalhe)) return;

      // A tolerância acompanha o tamanho do contorno, e isso é o que salva a
      // letra: 1,2 ponto some num círculo de 300 pontos, mas numa perna de "R"
      // de 6 pontos de largura é 20% da espessura — a perna sai redonda e o
      // texto vira mancha. O lado menor da caixa do contorno é a medida certa
      // porque é justamente a espessura que se quer preservar.
      const tolerancia = suavidade > 0
        ? Math.min(suavidade, ladoMenorDoContorno(bruto) * 0.16)
        : 0;

      // Antes de virar curva: isso aqui é um círculo? A tolerância é a mesma da
      // simplificação, com um piso — o contorno vem de uma grade de pontos, e
      // um círculo desenhado em pixels nunca fica a menos de meio ponto do
      // círculo perfeito.
      if (redondas) {
        const redonda = acharFormaRedonda(bruto, Math.max(0.8, tolerancia * 1.5));
        if (redonda) { partes.push(caminhoRedondo(redonda)); return; }
      }

      const simples = tolerancia > 0 ? simplificar(bruto, tolerancia) : bruto;
      if (simples.length < 3) return;
      // Onde cada ponto simplificado estava no contorno bruto: é isso que deixa
      // medir canto e tangente no desenho de verdade, e não no polígono.
      const ondeNoBruto = new Map();
      bruto.forEach((q, k) => { if (!ondeNoBruto.has(q)) ondeNoBruto.set(q, k); });

      const quinas = acharQuinas(simples, anguloQuina, bruto, ondeNoBruto);
      const tangentes = tangentesDoContorno(simples, quinas, bruto, ondeNoBruto);
      const d = porTrechos
        ? caminhoDoContorno(simples, quinas, tensao, Math.max(0.7, tolerancia), bruto, tangentes)
        : curvaDoContorno(simples, quinas, tensao);
      if (d) partes.push(d);
    });
    if (partes.length === 0) continue;

    const [r, g, b] = paleta[k];
    camadas.push({
      cor: `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
      pontos: quantos,
      caminhos: partes.length,
      d: partes.join(" "),
    });
  }

  camadas.sort((a, b) => b.pontos - a.pontos);

  // O tamanho real: quando a imagem traz o dpi, o SVG sai em centímetros de
  // verdade e a plotter imprime no tamanho certo sem ninguém digitar nada.
  const larguraCm = opcoes.larguraCm > 0 ? opcoes.larguraCm : null;
  const alturaCm = larguraCm ? (larguraCm * rows) / cols : null;
  const medida = larguraCm
    ? ` width="${larguraCm.toFixed(3)}cm" height="${alturaCm.toFixed(3)}cm"`
    : ` width="${cols}" height="${rows}"`;

  const corpo = camadas
    .map((c) => `  <path fill="${c.cor}" fill-rule="evenodd" d="${c.d}"/>`)
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"${medida} viewBox="0 0 ${cols} ${rows}" shape-rendering="geometricPrecision">
${corpo}
</svg>
`;

  return {
    svg,
    camadas,
    largura: cols,
    altura: rows,
    larguraCm,
    alturaCm,
    totalCaminhos: camadas.reduce((s, c) => s + c.caminhos, 0),
  };
}
