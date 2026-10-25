/**
 * ===========================================================================
 * MÁSCARA — a silhueta da arte na grade do encaixe
 * ===========================================================================
 *
 * Veio de `public/encaixe-mascara.js` por transformação mecânica: entraram o
 * `import` do que vinha do escopo global e o `export` do que é chamado de
 * fora. Nenhuma conta foi tocada — ver o cabeçalho de `vetor.js` para por que
 * o domínio grande atravessa como `.js` e não como `.ts`.
 *
 * Houve uma cópia deste arquivo em `public/encaixe-mascara.js`, que era a que
 * a tela antiga carregava. Ela morreu com o `public/`: hoje este é o único, e
 * quem o usa — a tela, o `preparaWorker` e a bancada — importa daqui.
 */

import { arredondar } from "../utils/geometria";

/**
 * A partir de quanto alfa o pixel é peça — na silhueta do encaixe E na
 * conferência pela arte (`ALFA_TINTA`, em conferenciaDaArte.js, é este mesmo
 * número). É o que a impressora imprime: no DTF, a sombra e a borda esfumada
 * da arte levam tinta e branco mesmo bem transparentes.
 *
 * Já foi 40 aqui e 8 lá. A faixa entre os dois — a sombra suave que quase todo
 * TIFF de DTF traz — ficava fora da silhueta, e a folga era medida a partir de
 * onde ela ACABAVA: a conferência via a sombra encostando na vizinha (3 mm
 * pedidos, 1 mm medidos), travava o Exportar e o encaixe era refeito com a
 * caixa inteira. As duas réguas têm de ser a mesma, senão o motor monta um
 * encaixe que a trava recusa.
 */
export const ALFA_PECA = 8;

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

/**
 * O fundo que se espalhou para dentro da peça.
 *
 * O espalhamento aceita tudo a menos de `FUNDO_TOLERANCIA` da cor do fundo, e
 * arte clara sem contorno fica dentro disso: uma camiseta branca (245) sobre
 * fundo branco (255) perdia o corpo inteiro e sobrava a estampa. A máscara, a
 * tela, o PDF e a conferência pela arte passavam a ver só a estampa — e o
 * encaixe punha peça DENTRO da camiseta sem trava nenhuma reclamar.
 *
 * O fundo de verdade tem quase exatamente a cor dele: medido em JPEG de
 * qualidade 50 a 95, o apagado a mais de `FUNDO_VAZAMENTO_DISTANCIA` da cor do
 * fundo fica abaixo de 0,7% da imagem (ruído na borda da arte). Quando a
 * remoção comeu uma camiseta branca ou creme, passa de 50%. Acima de
 * `FUNDO_VAZAMENTO_MAXIMO` a remoção automática recusa, e a peça vale a caixa
 * (ver "O FUNDO QUE A MÁSCARA IGNORA TEM DE SAIR NO PDF") — gasta um pouco de
 * tecido e não recebe peça nenhuma dentro. Papel com sombra também cai aqui, e
 * pelo mesmo lado seguro.
 */
const FUNDO_VAZAMENTO_DISTANCIA = 12;
const FUNDO_VAZAMENTO_MAXIMO = 0.03;

function fundoVazouNaPeca(px, ehFundo, cor, total) {
  const teto = total * FUNDO_VAZAMENTO_MAXIMO;
  const limite2 = FUNDO_VAZAMENTO_DISTANCIA * FUNDO_VAZAMENTO_DISTANCIA;
  let diferentes = 0;
  for (let p = 0; p < total; p++) {
    if (!ehFundo[p]) continue;
    const dr = px[p * 4] - cor[0];
    const dg = px[p * 4 + 1] - cor[1];
    const db = px[p * 4 + 2] - cor[2];
    if (dr * dr + dg * dg + db * db > limite2 && ++diferentes > teto) return true;
  }
  return false;
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
export function grade(larguraTecido, espaco) {
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

/*
 * ===========================================================================
 * O GIRO DA PEÇA ANTES DO ENCAIXE
 * ===========================================================================
 *
 * Arte que chega deitada (ou de cabeça para baixo) tem o "lado certo" errado:
 * "Fixa" a encaixaria deitada, e "Vira 180°" só a viraria de ponta-cabeça. O
 * `rotacaoBase` da peça (0, 90, 180 ou 270, no mesmo sentido do desenho) diz
 * quanto girar a arte ANTES de tudo, e a partir daí ela é a peça.
 *
 * A imagem não é girada de verdade: `img`, `src` e o arquivo original ficam
 * como chegaram, porque é deles que a remoção de fundo e o PDF partem, e girar
 * a imagem guardada faria cada um desses caminhos precisar saber disso. O giro
 * é aplicado onde a arte é usada, somado ao giro que o encaixe escolhe:
 *
 *   contorno   `comGiroBase` reindexa as quatro máscaras, que já existem
 *   desenho    `desenharArte` soma o giro base (desenhoDoEncaixe.js)
 *   PDF        `giroDaPosicao` manda o giro total em cada posição, e o
 *              servidor o aplica na matriz da página, com a arte original
 *              de pé (exportarEncaixe.js, servidor/encaixe-pdf.js)
 *
 * A largura e a altura da peça são as do lado certo, já trocadas quando o giro
 * é de 90 ou 270. A silhueta é lida da arte como ela chegou, então é lida com
 * a medida de antes do giro (`pecaSemGiro`).
 */
export function rotacaoBaseDe(peca) {
  const giro = Number(peca && peca.rotacaoBase) || 0;
  return ((giro % 360) + 360) % 360;
}

/** A peça como a arte chegou: largura e altura de antes do giro base. */
export function pecaSemGiro(peca) {
  return rotacaoBaseDe(peca) % 180 === 0 ? peca
    : { ...peca, largura: peca.altura, altura: peca.largura };
}

/**
 * As máscaras da peça já no lado certo. Girar a peça `base` e depois o encaixe
 * girar `rot` é o mesmo que girar a arte original `base + rot` — e essa
 * máscara já foi feita.
 */
export function comGiroBase(mascaras, base) {
  if (!base || !mascaras || !mascaras.rotacoes) return mascaras;
  const rotacoes = {};
  [0, 90, 180, 270].forEach((rot) => { rotacoes[rot] = mascaras.rotacoes[(rot + base) % 360]; });
  return { ...mascaras, rotacoes };
}

/**
 * A grade de uma peça: quantas células de lado ela tem.
 *
 * ARREDONDA PARA CIMA, e a arte entra na grade no tamanho de verdade (ver
 * `pixelsDaArteNaGrade`, em pecaNaGrade.js). Já foi `Math.round`, com a arte
 * esticada ou espremida para caber num número inteiro de células — e o encaixe
 * enxergava a peça com a medida da grade, não com a dela. Uma arte de 30,2 cm
 * na grade de 0,5 virava 30,0 cm: os 2 mm que faltavam saíam da folga, e pedir
 * 10 mm entregava 8. Arredondando para cima, a silhueta nunca fica menor que a
 * arte, e a folga nunca fica menor que a pedida.
 */
export function gradeDaPeca(peca, passo) {
  return {
    cols: Math.max(1, Math.ceil(peca.largura / passo - 1e-9)),
    rows: Math.max(1, Math.ceil(peca.altura / passo - 1e-9)),
  };
}

/**
 * Quanto de cada célula da grade é arte de verdade, coluna por coluna e linha
 * por linha: 1 nas cheias, a fração na última (a grade arredonda para cima, e
 * a última célula passa da arte). Sem a medida da peça, toda célula conta
 * inteira, que é como a área era medida antes.
 */
function pesosDaGrade(celulas, medida, passo) {
  const pesos = new Float64Array(celulas).fill(1);
  if (!(medida > 0)) return pesos;
  const util = medida / passo;
  for (let i = 0; i < celulas; i++) pesos[i] = Math.max(0, Math.min(1, util - i));
  return pesos;
}


/** Silhueta quase vazia é erro de leitura (arte escura em fundo escuro, etc). */
function validarSilhueta(bits, total, modo) {
  let cheias = 0;
  for (let i = 0; i < total; i++) cheias += bits[i];
  if (cheias < total * 0.02) return { bits: new Uint8Array(total).fill(1), modo: "caixa" };
  return { bits, modo };
}

/**
 * A largura de cada linha do disco de raio `raio`, em células.
 *
 * `disco[dy]` é até onde a borda vai na horizontal, `dy` linhas acima ou
 * abaixo do centro. Fica guardado por raio: o mesmo disco serve para todas as
 * peças do trabalho.
 *
 * ---------------------------------------------------------------------------
 * A FOLGA É ENTRE QUADRADOS, NÃO ENTRE CENTROS
 * ---------------------------------------------------------------------------
 *
 * Até 2026-09-25 o disco era o círculo de raio `raio` medido de CENTRO a
 * centro de célula. Só que a peça não mora no centro da célula: a célula
 * marcada é um quadrado inteiro de tecido (ver `silhuetaDeDados`). Duas peças
 * cujos discos não se tocam podiam ter as células a UMA célula de distância na
 * diagonal — e no raio 1, que é a folga de 4 mm no rolo de 179 cm, o círculo
 * vira uma cruz e isso acontece em todo degrau de borda inclinada. Medido pelo
 * contorno de verdade no `producao-avulsa`: pedia-se 4 mm e saíam 1,87 mm.
 *
 * A regra agora é a que o corte precisa. Duas peças encostam os discos quando
 * a diferença entre uma célula de uma e uma célula da outra cai em `D + D`;
 * então `D + D` tem de conter TODA diferença (dx, dy) cujos quadrados ficam a
 * menos de `2 × raio` células um do outro:
 *
 *   (|dx| − 1)₊² + (|dy| − 1)₊²  <  (2 × raio)²
 *
 * O disco é o menor da família "bola medida da borda do quadrado":
 *
 *   D(t) = { (dx, dy) : (|dx| − ½)₊² + (|dy| − ½)₊² ≤ t }
 *
 * com o menor `t` que cumpre a regra, achado por conferência direta. No raio 1
 * ele é o quadrado 3×3; a partir do 3 fica a menos de 10% de área do círculo
 * de antes. `bancada/conferir-folga-real.js` confere o resultado no contorno.
 */
const discosPorRaio = new Map();

export function discoDoRaio(raio) {
  let disco = discosPorRaio.get(raio);
  if (disco) return disco;
  disco = discoQueGaranteAFolga(raio);
  discosPorRaio.set(raio, disco);
  return disco;
}

/** O `D(t)` do comentário acima, com o menor `t` que garante a folga. */
function discoQueGaranteAFolga(raio) {
  const disco = new Int32Array(raio + 1);
  if (raio <= 0) return disco;
  const medida = (dx, dy) => Math.max(0, dx - 0.5) ** 2 + Math.max(0, dy - 0.5) ** 2;

  // As diferenças que precisam ficar cobertas (basta o quadrante positivo: o
  // disco é simétrico nos dois eixos).
  const lim = 2 * raio + 1;
  const precisa = [];
  for (let dx = 0; dx <= lim; dx++) {
    for (let dy = 0; dy <= lim; dy++) {
      if (Math.max(0, dx - 1) ** 2 + Math.max(0, dy - 1) ** 2 < 4 * raio * raio) precisa.push([dx, dy]);
    }
  }
  // (dx, dy) está em D + D se alguma linha `a` do disco, somada à linha
  // `dy − a`, alcança `dx` na horizontal.
  const cobre = (dx, dy) => {
    for (let a = -raio; a <= raio; a++) {
      const b = dy - a;
      if (b < -raio || b > raio) continue;
      if (dx <= disco[Math.abs(a)] + disco[Math.abs(b)]) return true;
    }
    return false;
  };

  const candidatos = [];
  for (let dx = 0; dx <= raio + 1; dx++) for (let dy = 0; dy <= raio + 1; dy++) candidatos.push(medida(dx, dy));
  candidatos.sort((p, q) => p - q);
  for (const t of candidatos) {
    let valido = true;
    for (let dy = 0; dy <= raio; dy++) {
      let dx = -1;
      while (medida(dx + 1, dy) <= t) dx++;
      if (dx < 0) { valido = false; break; }
      disco[dy] = dx;
    }
    if (valido && precisa.every(([dx, dy]) => cobre(dx, dy))) return disco;
  }
  // Não acontece (o maior candidato cobre tudo), mas se um dia acontecer, o
  // quadrado cheio garante a folga com sobra.
  disco.fill(raio);
  return disco;
}

/**
 * Engorda a silhueta pelo raio pedido, que é como o espaço entre peças entra
 * na conta: cada peça carrega metade da folga em volta dela, então duas peças
 * encostadas ficam com a folga inteira entre uma e outra.
 *
 * A borda é um DISCO, e isso importa mais do que parece.
 *
 * Isto já foi duas passadas separáveis, horizontal e vertical, cada uma de
 * `raio` células. É rápido e está errado: duas passadas assim desenham um
 * QUADRADO, não uma borda. O quadrado alcança `raio` de lado mas `raio × √2`
 * na diagonal — 41% a mais. Na prática, a folga pedida só saía exata onde duas
 * peças se tocavam por uma borda reta; em qualquer contato em curva ou
 * diagonal, que é quase toda a silhueta de um molde, ela saía até 41% maior.
 *
 * Era isso que fazia a folga se comportar como um MÍNIMO em vez de uma medida:
 * pedir 4 mm e receber de 4 a 5,7 mm, conforme o ângulo do encosto. Com o
 * disco, o excesso na diagonal cai — o que sobra é a grade, que só tem
 * células inteiras. (O disco já foi estreito demais para isso: ver "A FOLGA É
 * ENTRE QUADRADOS", em `discoDoRaio`.)
 *
 * O laço percorre só as células de borda da silhueta: o disco de uma célula do
 * meio já está inteiro dentro do disco das vizinhas dela, então carimbá-la de
 * novo é trabalho perdido.
 */
function engordar(bits, cols, rows, raio) {
  if (raio <= 0) return bits;

  const disco = discoDoRaio(raio);
  const saida = new Uint8Array(cols * rows);
  const cheia = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && bits[y * cols + x] === 1;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!bits[y * cols + x]) continue;
      saida[y * cols + x] = 1;
      // Célula cercada por todos os lados não acrescenta nada ao contorno.
      if (cheia(x - 1, y) && cheia(x + 1, y) && cheia(x, y - 1) && cheia(x, y + 1)
        && cheia(x - 1, y - 1) && cheia(x + 1, y - 1)
        && cheia(x - 1, y + 1) && cheia(x + 1, y + 1)) continue;

      for (let dy = -raio; dy <= raio; dy++) {
        const linha = y + dy;
        if (linha < 0 || linha >= rows) continue;
        const largura = disco[dy < 0 ? -dy : dy];
        const ini = Math.max(0, x - largura);
        const fim = Math.min(cols - 1, x + largura);
        const base = linha * cols;
        for (let k = ini; k <= fim; k++) saida[base + k] = 1;
      }
    }
  }
  return saida;
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


// ==================== O CONTORNO VETORIAL ====================

/**
 * Rasteriza um polígono na grade: TODA célula que ele toca fica marcada.
 *
 * Os pontos chegam normalizados (0..1 da grade). Quem usa é o contorno que vem
 * do CorelDRAW (`servidor/encaixe-resolver.js`) e as peças da bancada
 * (`bancada/pecas.js`) — as duas moravam cada uma com a sua cópia, "que
 * precisavam continuar iguais"; agora é uma só.
 *
 * A cópia de antes marcava a célula pelo CENTRO. A peça passava da célula
 * marcada em até meia célula de cada lado, e esse pedaço saía da folga (ver
 * "A FOLGA É ENTRE QUADRADOS", em `discoDoRaio`). Aqui são duas passadas:
 *
 *   miolo   a varredura por linha de sempre, pelo centro: pega as células de
 *           dentro, que nenhuma aresta atravessa;
 *   borda   cada aresta marca toda célula por onde passa, coluna por coluna
 *           — inclusive a que ela só encosta.
 *
 * Toda célula que tem um pedaço da peça ou está inteira dentro (miolo) ou é
 * cortada pelo contorno (borda). Mais de um polígono na mesma grade é só
 * chamar de novo e juntar.
 */
export function rasterizarPoligono(poligono, cols, rows) {
  const bits = new Uint8Array(cols * rows);
  const n = poligono.length;
  if (n === 0) return bits;

  for (let linha = 0; linha < rows; linha++) {
    const y = (linha + 0.5) / rows;
    const cruzamentos = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = poligono[i];
      const [xj, yj] = poligono[j];
      if ((yi > y) === (yj > y)) continue;
      cruzamentos.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
    cruzamentos.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cruzamentos.length; k += 2) {
      const de = Math.max(0, Math.ceil(cruzamentos[k] * cols - 0.5));
      const ate = Math.min(cols - 1, Math.floor(cruzamentos[k + 1] * cols - 0.5));
      for (let c = de; c <= ate; c++) bits[linha * cols + c] = 1;
    }
  }

  const dentro = (v, max) => Math.max(0, Math.min(max - 1, Math.floor(v)));
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xa = poligono[j][0] * cols, ya = poligono[j][1] * rows;
    const xb = poligono[i][0] * cols, yb = poligono[i][1] * rows;
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    for (let c = dentro(x0, cols); c <= dentro(x1, cols); c++) {
      // O pedaço da aresta dentro da faixa da coluna `c`.
      let y0, y1;
      if (xa === xb) { y0 = ya; y1 = yb; }
      else {
        const na = (Math.max(x0, c) - xa) / (xb - xa);
        const nb = (Math.min(x1, c + 1) - xa) / (xb - xa);
        y0 = ya + na * (yb - ya);
        y1 = ya + nb * (yb - ya);
      }
      const de = dentro(Math.min(y0, y1), rows);
      const ate = dentro(Math.max(y0, y1), rows);
      for (let l = de; l <= ate; l++) bits[l * cols + c] = 1;
    }
  }
  return bits;
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
export function tirarFundoDosPixels(px, largura, altura, forcar) {
  const fundo = corDoFundoNaBorda(px, largura, altura);
  if (!fundo) return null;                     // a arte sangra até a borda
  if (!fundo.claro && !forcar) return null;    // fundo escuro só quando mandarem

  const { ehFundo, quantos } = marcarFundoDaBorda(px, largura, altura, fundo.cor);
  const total = largura * altura;
  if (quantos < total * 0.01) return null;   // não tinha fundo mesmo
  // Comeu quase tudo: o que parecia fundo era a arte. Melhor não recortar nada
  // do que devolver uma peça esfarelada.
  if (total - quantos < total * 0.015) return null;
  if (!forcar && fundoVazouNaPeca(px, ehFundo, fundo.cor, total)) return null;

  for (let p = 0; p < ehFundo.length; p++) if (ehFundo[p]) px[p * 4 + 3] = 0;
  return { apagados: quantos, cor: fundo.cor };
}

/*
 * ===========================================================================
 * A BORDA DO FUNDO TIRADO NÃO É CORTADA A SECO (só na impressão)
 * ===========================================================================
 *
 * `tirarFundoDosPixels` apaga o fundo inteiro ou deixa o pixel inteiro: é o
 * certo para a silhueta do encaixe, que só quer saber onde há tinta. Para a
 * IMPRESSÃO é o que sujava a arte. O pixel da borda suavizada é meio arte,
 * meio fundo; com o fundo longe demais da cor dele para ser apagado, ele
 * ficava opaco — e o rolo saía com um contorno da cor do fundo em volta de
 * cada letra, serrilhado.
 *
 * Aqui cada pixel que encosta no fundo apagado é desmisturado: com C a cor
 * dele, B a do fundo e F a da arte logo ao lado (o vizinho mais longe do
 * fundo), C ≈ a·F + (1−a)·B. O `a` vira o alfa do pixel, e a cor volta a ser
 * a da arte, sem o fundo misturado.
 *
 * Só mexe quando a conta faz sentido — C está mesmo no caminho entre B e F,
 * e F é diferente de B. Arte de cor parecida com o fundo, ou textura na
 * borda, fica como estava: opaca, como sempre foi. E o alfa só desce, nunca
 * sobe, então a peça impressa nunca passa da silhueta que o encaixe usou.
 */
const BORDA_F_MINIMO = 24;    // F tão perto de B não dá para desmisturar
const BORDA_FORA_DA_RETA = 28; // C longe da reta B–F: é desenho, não mistura

export function suavizarBordaDoFundo(px, largura, altura, cor) {
  if (!cor) return 0;
  const [br, bg, bb] = cor;
  const naBorda = [];
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      if (px[p * 4 + 3] === 0) continue;
      let encosta = false;
      for (let dy = -1; dy <= 1 && !encosta; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= altura) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= largura) continue;
          if (px[(yy * largura + xx) * 4 + 3] === 0) { encosta = true; break; }
        }
      }
      if (encosta) naBorda.push(p);
    }
  }

  // As contas leem os vizinhos ORIGINAIS: guarda tudo antes de mudar algum.
  const novos = [];
  for (const p of naBorda) {
    const x = p % largura;
    const y = (p - x) / largura;
    const cr = px[p * 4] - br, cg = px[p * 4 + 1] - bg, cb = px[p * 4 + 2] - bb;
    let fr = 0, fg = 0, fb = 0, maior = -1;
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= altura) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= largura) continue;
        const q = (yy * largura + xx) * 4;
        if (px[q + 3] === 0) continue;
        const qr = px[q] - br, qg = px[q + 1] - bg, qb = px[q + 2] - bb;
        const d = qr * qr + qg * qg + qb * qb;
        if (d > maior) { maior = d; fr = qr; fg = qg; fb = qb; }
      }
    }
    if (maior < BORDA_F_MINIMO * BORDA_F_MINIMO) continue;
    const a = Math.min(1, Math.max(0, (cr * fr + cg * fg + cb * fb) / maior));
    if (a >= 0.98) continue;
    const rr = cr - a * fr, rg = cg - a * fg, rb = cb - a * fb;
    if (rr * rr + rg * rg + rb * rb > BORDA_FORA_DA_RETA * BORDA_FORA_DA_RETA) continue;
    novos.push(p, a);
  }

  for (let i = 0; i < novos.length; i += 2) {
    const p = novos[i] * 4;
    const a = novos[i + 1];
    if (a < 1 / 255) { px[p + 3] = 0; continue; }
    px[p] = Math.max(0, Math.min(255, Math.round(br + (px[p] - br) / a)));
    px[p + 1] = Math.max(0, Math.min(255, Math.round(bg + (px[p + 1] - bg) / a)));
    px[p + 2] = Math.max(0, Math.min(255, Math.round(bb + (px[p + 2] - bb) / a)));
    px[p + 3] = Math.round(px[p + 3] * a);
  }
  return novos.length / 2;
}

/**
 * Descobre quais células têm tecido, a partir dos pixels da arte já reduzida
 * à grade. É o miolo do `silhuetaDaImagem`.
 *
 * ---------------------------------------------------------------------------
 * A CÉLULA É PEÇA SE QUALQUER PEDAÇO DELA É PEÇA
 * ---------------------------------------------------------------------------
 *
 * `sub` é quantas sub-amostras de lado cada célula tem nos `dados`: eles vêm
 * com `cols × sub` por `rows × sub` pixels (ver `pixelsDaArteNaGrade`). A
 * silhueta é lida nessa resolução fina, com as regras de sempre, e a célula
 * fica marcada se QUALQUER sub-amostra dela for peça.
 *
 * Com uma amostra por célula (o jeito de antes), a arte que ocupava menos de
 * um sexto da célula da borda sumia na média, e a célula ficava vazia com
 * tecido dentro. A folga é contada a partir das células (ver `discoDoRaio`),
 * então esse tecido invisível saía da folga: somado ao disco estreito, pedir
 * 4 mm dava 1,87 mm. Com quatro sub-amostras, o que pode escapar é menos de um
 * sexto de um quarto de célula.
 *
 * A área (`cobertura`) é a média das sub-amostras de cada célula — o quanto
 * dela fica dentro do contorno da arte (ver "A ÁREA DA PEÇA É O QUE FICA
 * DENTRO DO CONTORNO"): ela mede quanto de tecido a peça tem, e não por onde a
 * folga passa.
 *
 * ---------------------------------------------------------------------------
 * O FUNDO QUE A MÁSCARA IGNORA TEM DE SAIR NO PDF
 * ---------------------------------------------------------------------------
 *
 * Arte opaca de fundo claro é lida pela cor: o fundo que encosta na borda não
 * é peça. Só que quem tira esse fundo da IMPRESSÃO é a carga da arte
 * (`fundoNaExportacao`), com outras regras e na resolução do arquivo — e ela
 * pode recusar (fundo de menos de 1%, fundo que "come" a arte) ou ainda não ter
 * terminado. Aí a máscara deixava a vizinha entrar no fundo, e a tela e o PDF
 * imprimiam o fundo branco, opaco, POR CIMA dela: peça dentro de peça, com a
 * trava apagada (2026-09-25).
 *
 * `fundoSaiNoPdf` diz se o fundo vai mesmo sair. Sem ele, a arte opaca vale a
 * caixa inteira — que é exatamente o que vai ser impresso.
 */
export function silhuetaDeDados(dados, cols, rows, sub = 1, { fundoSaiNoPdf = false } = {}) {
  const total = cols * rows;
  const semFundo = (s) => (s.modo === "fundo" && !fundoSaiNoPdf
    ? { bits: new Uint8Array(total).fill(1), modo: "caixa" } : s);
  if (!(sub > 1)) return semFundo(silhuetaNaGrade(dados, cols, rows));
  const fina = silhuetaNaGrade(dados, cols * sub, rows * sub);
  if (fina.modo === "caixa" || (fina.modo === "fundo" && !fundoSaiNoPdf)) {
    return { bits: new Uint8Array(total).fill(1), modo: "caixa" };
  }

  // Sem alfa (fundo lido pela cor), a área de cada célula é a fração das
  // sub-amostras que são peça — mais perto da verdade que a célula inteira.
  const valor = fina.cobertura || fina.bits;
  const bits = new Uint8Array(total);
  const cobertura = new Float32Array(total);
  const larguraFina = cols * sub;
  for (let y = 0; y < rows * sub; y++) {
    const linha = ((y / sub) | 0) * cols;
    for (let x = 0; x < larguraFina; x++) {
      const i = y * larguraFina + x;
      const c = linha + ((x / sub) | 0);
      if (fina.bits[i]) bits[c] = 1;
      cobertura[c] += valor[i];
    }
  }
  const n = sub * sub;
  for (let c = 0; c < total; c++) cobertura[c] /= n;
  return { bits, modo: fina.modo, cobertura };
}

/** Até quantas sub-amostras de lado por célula a arte é lida. */
export const SUBAMOSTRAS_MAX = 4;
/**
 * O teto de pixels da leitura fina. Uma peça de 60 x 80 cm na grade de 0,2 cm
 * são 120 mil células; com 4 x 4 sub-amostras, 1,9 milhão de pixels (7,7 MB,
 * que vão ao worker por transferência, sem cópia). A peça gigante lê com menos
 * sub-amostras em vez de estourar a memória.
 */
export const SUBAMOSTRAS_TETO_PIXELS = 4000000;

/**
 * Quantas sub-amostras de lado a arte ganha por célula: até
 * `SUBAMOSTRAS_MAX`, sem passar do teto de pixels e sem passar da resolução do
 * próprio arquivo (esticar a arte não mostra nada que ela não tenha).
 */
export function subamostrasDaArte(larguraImg, largura, cols, rows, passo) {
  const celulasNaArte = passo > 0 && largura > 0 ? largura / passo : cols;
  const pelaArte = Math.floor((Number(larguraImg) || 0) / celulasNaArte);
  const peloTeto = Math.floor(Math.sqrt(SUBAMOSTRAS_TETO_PIXELS / Math.max(1, cols * rows)));
  return Math.max(1, Math.min(SUBAMOSTRAS_MAX, pelaArte, peloTeto));
}

/*
 * ===========================================================================
 * A ÁREA DA PEÇA É O QUE FICA DENTRO DO CONTORNO
 * ===========================================================================
 *
 * É dela que sai o aproveitamento (área das peças ÷ mídia gasta), e ela já foi
 * a MÉDIA DO ALFA de cada pixel. Para arte opaca isso é exato: o pixel da borda
 * meio transparente é meia peça, e a média conta meia. O defeito é que a média
 * não distingue borda suavizada de TINTA semitransparente — e arte de DTF é
 * cheia de tinta assim: a sombra, o degradê, o brilho, a textura gasta. Tudo
 * isso é impresso (é o que diz `ALFA_PECA`) e ocupa o filme inteiro, mas
 * contava pela opacidade: a sombra de 20% valia 20% da área.
 *
 * E havia um segundo buraco: o vão FECHADO dentro da arte (o miolo de uma
 * letra, o meio de um anel) contava como desperdício. Ele sai junto com a peça
 * no corte, e nenhum motor deste programa consegue pôr outra peça ali — todos
 * enxergam a peça como ocupada do topo à base de cada coluna. Não é tecido que
 * o encaixe deixou de aproveitar; é tecido da peça. (A arte opaca lida pela cor
 * do fundo — o modo "fundo" — já era medida assim: o branco de dentro do
 * desenho nunca foi fundo, porque o fundo só se espalha a partir da borda.)
 *
 * Medido num trabalho de DTF de verdade (35 artes, mídia de 160 cm, folga de
 * 0,5 cm), que a tela mostrava com 52,5%:
 *
 *   média do alfa (antes)                   52,5%
 *   todo pixel com tinta, sem os vãos        57,8%
 *   dentro do contorno (agora)               59,4%
 *   caixa da arte                            94,1%
 *
 * A regra agora: tudo o que está DENTRO do contorno externo da arte conta
 * inteiro — a tinta semitransparente e os vãos fechados também. Só a faixa da
 * borda externa (`FAIXA_DA_BORDA` pixels) é medida pelo alfa, e pelo alfa
 * RELATIVO à opacidade ao redor: na borda suavizada de uma arte opaca isso é a
 * média de sempre, e na borda de uma tinta de 30% o pixel de 15% vale meio.
 * Conferido em círculo, estrela e anel com borda suavizada, de 8 a 40 cm: a
 * área sai a menos de 0,05% da conta exata (o anel, com o miolo dentro).
 *
 * A folga entre as peças continua FORA da área, e deve: é mídia gasta, mas
 * gasta pela distância de corte que foi pedida, não pelo desenho.
 */
const FAIXA_DA_BORDA = 2;

/**
 * Quanto de cada pixel é peça, pela regra acima: 1 dentro do contorno, a
 * fração do alfa na faixa da borda externa, 0 fora.
 *
 * "Fora" é o que se alcança a partir da borda da imagem andando só por pixel
 * sem tinta (alfa abaixo de `ALFA_PECA`); o vão fechado não é alcançado, e por
 * isso fica dentro.
 *
 * ESTA CONTA RODA NO PREPARO DE TODA PEÇA, e a primeira versão dela custava de
 * 3,6x a 4,6x o preparo de antes: ela passava uma janela de 5x5 em todo pixel,
 * duas vezes, e alocava cinco vetores do tamanho da imagem. Esta dá o mesmo
 * número fazendo só o necessário:
 *
 *   - pixel OPACO vale 1 sem olhar em volta (na faixa a conta daria 255/255);
 *   - a faixa da borda sai por contagem deslizante — duas passadas de poucas
 *     operações por pixel, em vez de 25 leituras;
 *   - a opacidade em volta só é medida para o pixel semitransparente da faixa,
 *     que é uma tira fina em volta da peça;
 *   - a pilha do preenchimento usa a memória do resultado, que ainda está
 *     vazio quando ela é usada.
 */
function areaDentroDoContorno(dados, largura, altura) {
  const total = largura * altura;
  const r = FAIXA_DA_BORDA;
  const cobertura = new Float32Array(total);
  const fora = new Uint8Array(total);

  // 1) O fora: preenchimento a partir da borda, por pixel sem tinta. Por
  //    SEGMENTOS de linha: marca o trecho inteiro de uma vez e só empilha o
  //    começo de cada trecho livre nas linhas de cima e de baixo — pixel a
  //    pixel, cada um entrava e saía da pilha, e era o grosso desta conta.
  const pilha = new Int32Array(cobertura.buffer);
  let topo = 0;
  const livre = (p) => fora[p] === 0 && dados[p * 4 + 3] < ALFA_PECA;
  const semear = (p) => { if (livre(p)) pilha[topo++] = p; };
  for (let x = 0; x < largura; x++) { semear(x); semear((altura - 1) * largura + x); }
  for (let y = 0; y < altura; y++) { semear(y * largura); semear(y * largura + largura - 1); }
  // Empilha o começo de cada trecho livre de `de` a `ate` na linha `y`.
  const semearTrechos = (y, de, ate) => {
    const base = y * largura;
    let dentro = false;
    for (let x = de; x <= ate; x++) {
      if (livre(base + x)) {
        if (!dentro) { pilha[topo++] = base + x; dentro = true; }
      } else dentro = false;
    }
  };
  while (topo > 0) {
    const p = pilha[--topo];
    if (!livre(p)) continue;
    const y = (p / largura) | 0;
    const base = y * largura;
    let esq = p - base;
    let dir = esq;
    while (esq > 0 && livre(base + esq - 1)) esq--;
    while (dir < largura - 1 && livre(base + dir + 1)) dir++;
    fora.fill(1, base + esq, base + dir + 1);
    if (y > 0) semearTrechos(y - 1, esq, dir);
    if (y < altura - 1) semearTrechos(y + 1, esq, dir);
  }

  // 2) A faixa: o pixel com algum "fora" a até `r` pixels (num quadrado), por
  //    contagem deslizante — primeiro na linha, depois na coluna.
  const naLinha = new Uint8Array(total);
  for (let y = 0; y < altura; y++) {
    const base = y * largura;
    let conta = 0;
    for (let k = 0; k <= r && k < largura; k++) conta += fora[base + k];
    for (let x = 0; x < largura; x++) {
      naLinha[base + x] = conta > 0 ? 1 : 0;
      const sai = x - r;
      const entra = x + r + 1;
      if (sai >= 0) conta -= fora[base + sai];
      if (entra < largura) conta += fora[base + entra];
    }
  }
  // Na coluna, a mesma contagem — mas andando LINHA a linha, com um contador
  // por coluna: andar coluna por coluna salta `largura` bytes a cada pixel, e
  // isso custava mais que a conta.
  const naFaixa = new Uint8Array(total);
  const contaDaColuna = new Int32Array(largura);
  for (let k = 0; k <= r && k < altura; k++) {
    const base = k * largura;
    for (let x = 0; x < largura; x++) contaDaColuna[x] += naLinha[base + x];
  }
  for (let y = 0; y < altura; y++) {
    const base = y * largura;
    for (let x = 0; x < largura; x++) naFaixa[base + x] = contaDaColuna[x] > 0 ? 1 : 0;
    const sai = y - r;
    const entra = y + r + 1;
    if (sai >= 0) {
      const b = sai * largura;
      for (let x = 0; x < largura; x++) contaDaColuna[x] -= naLinha[b + x];
    }
    if (entra < altura) {
      const b = entra * largura;
      for (let x = 0; x < largura; x++) contaDaColuna[x] += naLinha[b + x];
    }
  }

  // 3) A cobertura. A pilha usou esta memória; tudo é escrito de novo aqui.
  for (let p = 0; p < total; p++) {
    if (fora[p]) { cobertura[p] = 0; continue; }
    const a = dados[p * 4 + 3];
    if (a === 255 || !naFaixa[p]) { cobertura[p] = 1; continue; }
    // Borda suavizada: o alfa contra a opacidade mais alta em volta.
    const x = p % largura;
    const y = (p - x) / largura;
    let maior = 0;
    for (let yy = (y - r < 0 ? 0 : y - r); yy <= (y + r >= altura ? altura - 1 : y + r); yy++) {
      const base = yy * largura;
      for (let xx = (x - r < 0 ? 0 : x - r); xx <= (x + r >= largura ? largura - 1 : x + r); xx++) {
        const v = dados[(base + xx) * 4 + 3];
        if (v > maior) maior = v;
      }
    }
    const fracao = a / (maior > 1 ? maior : 1);
    cobertura[p] = fracao < 1 ? fracao : 1;
  }
  return cobertura;
}

/** A silhueta com uma amostra por célula: o `silhuetaDeDados` de antes. */
function silhuetaNaGrade(dados, cols, rows) {
  const total = cols * rows;
  const cheio = () => ({ bits: new Uint8Array(total).fill(1), modo: "caixa" });
  const bits = new Uint8Array(total);

  let transparentes = 0;
  for (let i = 3; i < dados.length; i += 4) if (dados[i] < 200) transparentes++;

  if (transparentes > total * 0.02) {
    // Fundo transparente. O limite é baixo de propósito: ao reduzir a imagem
    // para a grade, a borda vira meio-transparente e não pode ser comida — e a
    // sombra suave também é tinta (ver `ALFA_PECA`).
    for (let i = 0, a = 3; i < total; i++, a += 4) bits[i] = dados[a] >= ALFA_PECA ? 1 : 0;
    const validada = validarSilhueta(bits, total, "alfa");
    // A área sai de `areaDentroDoContorno`, e não do bit: ver "A ÁREA DA PEÇA
    // É O QUE FICA DENTRO DO CONTORNO", logo abaixo.
    if (validada.modo === "alfa") validada.cobertura = areaDentroDoContorno(dados, cols, rows);
    return validada;
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
 *
 * `medida` é a peça em centímetros ({ largura, altura }). É com ela que a área
 * sai na medida real, e não na da grade — ver `pesosDaGrade`.
 *
 * A FOLGA NÃO VAI PARA A BORDA DO TECIDO
 * --------------------------------------
 * Cada peça carrega meia folga em volta (o engorde), e é isso que deixa a folga
 * inteira entre duas peças vizinhas. Só que a meia folga também ia para a
 * beira do rolo: a peça ficava a meia folga da borda esquerda e do começo, e a
 * da direita perdia o mesmo tanto. Na borda não há vizinho, e não há por que
 * afastar.
 *
 * A saída é deixar o engorde passar da beira. Os motores de grade enxergam o
 * rolo com `raio` células a mais de cada lado (ver `colunasDoTecido`, em
 * encaixeMotor.js), e toda posição volta para o tecido de verdade descontando
 * `recuo` — que entra aqui, no `offX`/`offY`. É por eles que TODA conversão de
 * célula para centímetro passa (o motor, o sparrow, a volta do WASM), então
 * nenhuma delas precisa saber que o recuo existe. Quem mede dentro da grade e
 * precisa do lugar antigo desconta `recuo` de volta.
 */
export function mascarasDeSilhueta(silhueta, cols, rows, passo, raio, medida = null) {
  const gordo = engordarComBorda(silhueta.bits, cols, rows, raio);
  const real = comMesmaBorda(silhueta.bits, cols, rows, gordo.borda);
  const recuo = gordo.borda * passo;

  const rotacoes = {};
  [0, 90, 180, 270].forEach((rot) => {
    const cheia = girarBits(gordo.bits, gordo.cols, gordo.rows, rot);
    const original = girarBits(real.bits, real.cols, real.rows, rot);
    const m = prepararMascara(cheia.bits, original.bits, cheia.cols, cheia.rows, passo);
    if (m && medida) {
      const sobraX = Math.max(0, cols * passo - medida.largura);
      const sobraY = Math.max(0, rows * passo - medida.altura);
      if (rot === 90) m.offX -= sobraY;
      if (rot === 180) { m.offX -= sobraX; m.offY -= sobraY; }
      if (rot === 270) m.offY -= sobraX;
    }
    // A moldura cresceu `borda` células para o engorde caber, e o rolo da
    // grade cresceu o mesmo tanto de cada lado: as duas coisas se anulam, e o
    // deslocamento fica o do recorte. Ver o cabeçalho desta função.
    if (m) m.recuo = recuo;
    rotacoes[rot] = m;
  });

  let cheias = 0;
  for (let i = 0; i < silhueta.bits.length; i++) cheias += silhueta.bits[i];

  // A área de cada célula é a fração dela que é peça: o alfa na silhueta
  // transparente, o bit nas outras, e na última coluna e linha só o pedaço que
  // a arte ocupa. Na peça-retângulo isso dá exatamente largura x altura.
  const pesoX = pesosDaGrade(cols, medida && medida.largura, passo);
  const pesoY = pesosDaGrade(rows, medida && medida.altura, passo);
  const valor = silhueta.cobertura || silhueta.bits;
  let area = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) area += valor[y * cols + x] * pesoX[x] * pesoY[y];
  }

  return {
    rotacoes,
    modo: silhueta.modo,
    raio,
    areaReal: area * passo * passo,
    ocupacao: cheias / (cols * rows), // quanto da caixa a peça realmente usa
  };
}
