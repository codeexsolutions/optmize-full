/**
 * ===========================================================================
 * O MOLDE DA IMAGEM — a foto da mesa virando risco
 * ===========================================================================
 *
 * Recebe os pixels de uma foto de moldes e devolve o risco de CADA peça que
 * achar. Sem DOM: a regra da pasta dos motores é conta pura (ver o cabeçalho
 * de `utils/arquivoDeImagem.ts`), então quem desenha a foto na grade é a tela.
 *
 * ---------------------------------------------------------------------------
 * ESCRITO EM CIMA DAS FOTOS DE VERDADE
 * ---------------------------------------------------------------------------
 *
 * A primeira versão disto reaproveitava o `silhuetaDeDados` do Encaixe e não
 * leu uma única foto da fábrica. O motivo é curto: aquela conta foi feita para
 * ARTE — desenho escuro sobre folha branca — e desiste quando o fundo não é
 * claro (`if (!fundo || !fundo.claro) return cheio()`). Na mesa do laser é o
 * contrário: molde de papel kraft CLARO sobre a esteira ESCURA e perfurada. A
 * tela mostrava "não consegui separar o molde do fundo" em todas as fotos.
 *
 * O que está aqui foi afinado contra as 16 fotos de `D:\arte\photo da laser` —
 * moldes recortados sobre a esteira, de uma a nove peças por foto, e também um
 * caso diferente (molde desenhado a traço numa folha branca inteira).
 *
 * ---------------------------------------------------------------------------
 * QUEM MANDA NA BORDA É O FUNDO
 * ---------------------------------------------------------------------------
 *
 * O limiar entre peça e fundo sai do Otsu, que acha sozinho o vale do
 * histograma — e essas fotos são o caso perfeito dele, com a esteira num pico
 * escuro e o papel noutro claro, bem separados.
 *
 * Mas o Otsu só divide em dois; não diz QUAL dos dois é o molde. Quem diz é a
 * moldura da imagem: em foto de mesa, a borda é quase toda mesa. Então o lado
 * que domina a borda é o fundo, e o outro é peça.
 *
 * É por isso que esta conta não se importa se o molde é claro ou escuro. Papel
 * kraft sobre esteira preta e molde preto sobre mesa branca entram pela mesma
 * porta, e nenhum dos dois precisa de opção na tela.
 *
 * ---------------------------------------------------------------------------
 * O QUE É DESCARTADO, E POR QUÊ
 * ---------------------------------------------------------------------------
 *
 * Duas peneiras, as duas tiradas do que aparecia nas fotos:
 *
 *   - **Área**: mancha menor que meio por cento da imagem, ou menor que 8% da
 *     maior peça, é sujeira — marca na esteira, sombra, pedaço de fita.
 *   - **Espessura**: o filme de vácuo reflete a luz numa faixa comprida e fina
 *     na beirada do quadro, e ela passava pela peneira da área por ser longa.
 *     Nenhum molde tem dois centímetros no lado menor, então o lado MENOR da
 *     caixa precisa ter pelo menos 3% do maior lado da foto.
 *
 * A peneira de espessura substituiu uma tentativa de descartar tudo o que
 * encostasse na borda da imagem. Parecia razoável e estava errado: na foto de
 * molde desenhado, a folha branca chega ao topo do quadro, e aquela regra
 * apagava justamente o assunto da foto — as oito viravam zero peça.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA CONTA NÃO FAZ
 * ---------------------------------------------------------------------------
 *
 * **Peça encostada em peça vira uma só.** Duas manchas que se tocam são uma
 * mancha, e não há aqui nada que as separe. Na `brenda.bmp`, de nove peças
 * saem oito por causa disso. Quem digitaliza resolve afastando os moldes na
 * mesa; quem for consertar no código vai precisar de watershed, e aí que se
 * meça antes o risco de partir peça boa no meio.
 *
 * **Molde desenhado a traço não é lido como desenho.** Numa folha branca com o
 * molde desenhado, o que esta conta acha é a FOLHA, não o traço. Sai uma peça
 * retangular, e por isso existe o aviso do `pareceFolhaInteira`.
 *
 * **Não corrige perspectiva.** Foto tirada de lado entrega molde trapezoidal.
 */

import { achatarCurvas, curvasDoContorno } from "./ajusteDeCurvas";

/**
 * Resolução da grade no lado maior.
 *
 * Começou em 420, copiado do `INTEIRO_CELULAS` do `moldes.js`, e subiu para
 * 800 depois de medir contra as fotos da fábrica. Os dois ganhos apareceram
 * juntos:
 *
 *   - **A curva.** O contorno sai de uma grade, então cada curva é uma escada
 *     de degraus de uma célula. Dobrar a resolução corta o degrau pela metade,
 *     e é o que sobra para o Chaikin arredondar (ver `suavizarContorno`).
 *   - **As peças encostadas.** Duas peças separadas por um vão de meia célula
 *     eram uma mancha só; com a célula menor, o vão aparece. Na
 *     `vesttidinho.bmp` foi a diferença entre 7 peças e as 9 que existem.
 *
 * O medo era a esteira PERFURADA: com mais resolução os furos ficam maiores em
 * células e poderiam escapar do alisamento. Não escaparam — as 16 fotos
 * continuaram lendo, no mesmo tempo de antes (2,4 s no BMP de 51 MB), porque
 * quem os apaga é a maioria de 3x3, e furo continua sendo minoria.
 *
 * Subir mais não foi testado. Quem for tentar: meça de novo contra a pasta
 * inteira, e olhe as máscaras, não só a contagem.
 */
export const CELULAS_NO_LADO_MAIOR = 800;

/**
 * Quanto o contorno pode ser aliviado, em células.
 *
 * Baixo de propósito. Com a escada já arredondada pelo Chaikin, o alívio serve
 * só para tirar o excesso de pontos — apertar mais que isto começa a cortar a
 * curva que o Chaikin acabou de fazer.
 */
export const ALIVIO_PADRAO = 0.25;

/** Quantas passadas de Chaikin. Duas tiram a escada sem inchar a contagem. */
export const SUAVIZACAO_PADRAO = 2;

/**
 * Quanto a curva pode se afastar do contorno, em células.
 *
 * É a régua entre fidelidade e quantidade de nós. Em 1,2 células — uns 2 mm
 * numa foto de mesa inteira — uma calça sai com cerca de 30 nós em vez dos 377
 * pontos que a poligonal tinha, e o desenho continua em cima do papel.
 */
export const ERRO_DE_CURVA_PADRAO = 1.2;

/** Mancha menor que isto (fração da imagem) é sujeira. */
const AREA_MINIMA_DA_IMAGEM = 0.005;
/** Mancha menor que isto (fração da maior peça) é sujeira. */
const AREA_MINIMA_DA_MAIOR = 0.08;
/** O lado menor da peça, em fração do maior lado da foto. */
const ESPESSURA_MINIMA = 0.03;

export const ehImagemDeMolde = (file) => /\.(png|bmp|jpe?g|webp)$/i.test(file.name);
export const FORMATOS_DE_IMAGEM = "PNG, BMP, JPG e WEBP";

/** O limiar que melhor parte o histograma em dois (Otsu). */
function limiarDeOtsu(hist, total) {
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * hist[i];
  let somaAbaixo = 0;
  let pesoAbaixo = 0;
  let melhor = -1;
  let limiar = 127;
  for (let t = 0; t < 256; t++) {
    pesoAbaixo += hist[t];
    if (pesoAbaixo === 0) continue;
    const pesoAcima = total - pesoAbaixo;
    if (pesoAcima === 0) break;
    somaAbaixo += t * hist[t];
    const mediaAbaixo = somaAbaixo / pesoAbaixo;
    const mediaAcima = (soma - somaAbaixo) / pesoAcima;
    const entre = pesoAbaixo * pesoAcima * (mediaAbaixo - mediaAcima) ** 2;
    if (entre > melhor) { melhor = entre; limiar = t; }
  }
  return limiar;
}

/**
 * A máscara das peças: 1 é molde, 0 é mesa.
 *
 * Ver o cabeçalho: o limiar vem do Otsu e a POLARIDADE vem da borda.
 */
function mascaraDasPecas(dados, cols, rows) {
  const total = cols * rows;
  const luz = new Uint8Array(total);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    // Luminância padrão (Rec. 601). O papel kraft é mais amarelo que branco, e
    // é o verde que carrega o peso — por isso não serve a média simples.
    luz[i] = (dados[p] * 299 + dados[p + 1] * 587 + dados[p + 2] * 114) / 1000 | 0;
    hist[luz[i]]++;
  }
  const limiar = limiarDeOtsu(hist, total);

  let claroNaBorda = 0;
  let escuroNaBorda = 0;
  const olhar = (i) => { if (luz[i] > limiar) claroNaBorda++; else escuroNaBorda++; };
  for (let x = 0; x < cols; x++) { olhar(x); olhar((rows - 1) * cols + x); }
  for (let y = 0; y < rows; y++) { olhar(y * cols); olhar(y * cols + cols - 1); }
  const fundoEhClaro = claroNaBorda > escuroNaBorda;

  const bits = new Uint8Array(total);
  for (let i = 0; i < total; i++) bits[i] = ((luz[i] > limiar) === fundoEhClaro) ? 0 : 1;
  return { bits, limiar, fundoEhClaro };
}

/**
 * Passa a maioria de 3x3 na máscara.
 *
 * A esteira do laser é PERFURADA, e cada furo é um ponto claro dentro do
 * escuro; sem esta passada cada furo vira uma manchinha, e a contagem de peças
 * sobe para as dezenas. Ela também come o serrilhado da borda do papel, que é
 * de onde vinham os degraus no risco.
 */
function alisar(bits, cols, rows) {
  const saida = new Uint8Array(bits.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let vivos = 0;
      let vistos = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= cols) continue;
          vistos++;
          vivos += bits[yy * cols + xx];
        }
      }
      saida[y * cols + x] = vivos * 2 > vistos ? 1 : 0;
    }
  }
  return saida;
}

/**
 * Chaikin: corta os cantos do contorno, duas vezes por passada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O CONTORNO PRECISA DISTO
 * ---------------------------------------------------------------------------
 *
 * O contorno sai de uma GRADE, e grade só anda em cima e para o lado. Então
 * toda curva do molde — gancho, cava, decote — chega aqui como uma escada de
 * degraus de uma célula. Não é ruído de foto e não adianta apertar a foto: é a
 * forma como um contorno de grade é, e foi o que a fábrica relatou como
 * "os lugares redondos indo para lugares retos".
 *
 * O Douglas-Peucker sozinho não resolve, e piora quando se tenta: com
 * tolerância pequena ele GUARDA os degraus, e com tolerância grande ele troca o
 * arco inteiro por uma corda reta. Escada ou corda — em nenhuma das duas sai
 * curva.
 *
 * O Chaikin resolve porque ataca o problema certo: em vez de escolher quais
 * pontos ficam, ele troca cada canto por dois pontos a um quarto e a três
 * quartos do caminho. Duas passadas e a escada vira uma curva de verdade; só
 * então o Douglas-Peucker entra, para tirar o excesso de pontos sem desmanchar
 * o que foi arredondado.
 *
 * O contorno é fechado, então o último ponto puxa o primeiro: sem isso, a volta
 * abriria um bico no ponto onde a varredura começou.
 */
export function suavizarContorno(pontos, passadas = 2) {
  let atual = pontos;
  for (let volta = 0; volta < passadas; volta++) {
    if (atual.length < 3) return atual;
    const saida = [];
    for (let i = 0; i < atual.length; i++) {
      const a = atual[i];
      const b = atual[(i + 1) % atual.length];
      saida.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      );
    }
    atual = saida;
  }
  return atual;
}

/** A caixa que encosta no contorno por todos os lados. */
export function caixaDo(pontos) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pontos) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, largura: maxX - minX, altura: maxY - minY };
}

/** A área que um contorno fecha (fórmula do laço). */
export function areaDo(pontos) {
  let soma = 0;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    soma += (pontos[j].x + pontos[i].x) * (pontos[j].y - pontos[i].y);
  }
  return Math.abs(soma / 2);
}

/** Quase retangular e grande: cara de folha, não de molde recortado. */
function pareceFolhaInteira(risco, total) {
  const daCaixa = risco.caixa.largura * risco.caixa.altura;
  return daCaixa > 0 && risco.area / daCaixa > 0.93 && risco.area > total * 0.25;
}

/**
 * Acha o risco de cada peça na foto.
 *
 * `dados` são os pixels RGBA da foto JÁ REDUZIDA à grade `cols`×`rows` (é a
 * tela que reduz, com canvas). `contornar` e `aliviar` vêm de fora — são o
 * `contornosDasManchas` e o `aliviarContorno` do `moldes.js`, passados como
 * argumento para este motor não arrastar aquele módulo inteiro atrás de si.
 *
 * Devolve `{ riscos, fundoEhClaro, limiar, descartadas, avisos }`. Cada risco é
 * `{ contorno, caixa, area }` em unidades da GRADE, SEM medida: a imagem não
 * carrega centímetro, e chutar um seria pior do que não ter — um risco com a
 * forma certa e o tamanho errado atravessa a conferência inteira e só aparece
 * com o tecido cortado. Quem dá a medida é `riscosEmCm`.
 *
 * @param {Uint8ClampedArray} dados
 * @param {number} cols
 * @param {number} rows
 * @param {{ alivio?: number, suavizacao?: number, erroDeCurva?: number, contornar: Function, aliviar: Function }} opcoes
 */
export function riscosDosPixels(dados, cols, rows, { alivio = ALIVIO_PADRAO, suavizacao = SUAVIZACAO_PADRAO, erroDeCurva = ERRO_DE_CURVA_PADRAO, contornar, aliviar } = {}) {
  const passadasDeSuavizacao = Math.max(0, Math.min(4, Math.round(suavizacao)));
  if (typeof contornar !== "function" || typeof aliviar !== "function") {
    throw new Error("riscosDosPixels precisa de `contornar` e `aliviar`.");
  }

  const { bits, limiar, fundoEhClaro } = mascaraDasPecas(dados, cols, rows);
  const total = cols * rows;

  let pintadas = 0;
  for (let i = 0; i < total; i++) pintadas += bits[i];
  if (pintadas < total * 0.002) {
    return { erro: "Não achei nada que se destacasse do fundo nessa foto." };
  }
  if (pintadas > total * 0.97) {
    return {
      erro: "Não consegui separar os moldes do fundo: quase a imagem inteira virou peça."
        + " Os moldes precisam contrastar com a mesa — claros sobre mesa escura, ou o contrário.",
    };
  }

  const contornos = contornar(alisar(bits, cols, rows), cols, rows);
  if (contornos.length === 0) {
    return { erro: "Separei os moldes do fundo, mas não consegui contornar nenhum." };
  }

  const medidos = contornos
    .map((contorno) => ({ contorno, caixa: caixaDo(contorno), area: areaDo(contorno) }))
    .sort((a, b) => b.area - a.area);

  const maior = medidos[0].area;
  const espessuraMinima = Math.max(4, Math.round(Math.max(cols, rows) * ESPESSURA_MINIMA));
  const valem = medidos.filter((m) => (
    m.area > total * AREA_MINIMA_DA_IMAGEM
    && m.area > maior * AREA_MINIMA_DA_MAIOR
    && Math.min(m.caixa.largura, m.caixa.altura) >= espessuraMinima
  ));

  if (valem.length === 0) {
    return { erro: "O que achei na foto é pequeno ou fino demais para ser molde." };
  }

  const avisos = [];
  const descartadas = medidos.length - valem.length;
  if (descartadas > 0) {
    avisos.push(`Deixei de fora ${descartadas} mancha(s) pequena(s) ou fina(s) — marca na mesa,`
      + " sombra, ou o brilho do filme na beirada.");
  }

  const riscos = valem
    .map((m) => {
      // Suavizar ANTES de aliviar, e nunca ao contrário: o Douglas-Peucker
      // joga pontos fora, e o Chaikin precisa dos cantos da escada para saber
      // onde arredondar. Invertida, a ordem devolve a escada de volta.
      const contorno = aliviar(suavizarContorno(m.contorno, passadasDeSuavizacao), alivio);
      if (contorno.length < 3) return null;
      // E só então as curvas. O ajuste precisa de um contorno JÁ alisado: em
      // cima da escada crua, cada degrau viraria um canto e não sobraria curva
      // nenhuma para ajustar (ver `cantosDo`, no ajusteDeCurvas).
      const nos = curvasDoContorno(contorno, { erroMaximo: erroDeCurva });
      const achatado = achatarCurvas(nos);
      return { nos, caixa: caixaDo(achatado), area: areaDo(achatado) };
    })
    .filter(Boolean);

  if (riscos.length === 0) {
    return { erro: "Os contornos que achei são pequenos demais para virar molde." };
  }

  if (riscos.length === 1 && pareceFolhaInteira(riscos[0], total)) {
    avisos.push("Isto parece uma FOLHA inteira, e não um molde recortado."
      + " Se o molde está desenhado a traço na folha, o risco saiu da folha, não do desenho.");
  }

  // Da esquerda para a direita, de cima para baixo — a ordem em que a pessoa
  // lê a mesa, para a peça 3 da tela ser a terceira que ela vê na foto.
  riscos.sort((a, b) => (a.caixa.minY - b.caixa.minY) || (a.caixa.minX - b.caixa.minX));

  return { riscos, fundoEhClaro, limiar, descartadas, avisos };
}

/**
 * Os riscos em centímetros, a partir da medida de UMA peça.
 *
 * A foto inteira tem uma escala só — é a mesma câmera, na mesma altura, no
 * mesmo instante. Então basta medir uma peça com a fita para todas as outras
 * ganharem tamanho junto, e é isso que `indice` e `lado` dizem: qual peça foi
 * medida, e por qual lado.
 */
export function riscosEmCm(riscos, indice, lado, cm) {
  const base = riscos[indice];
  if (!base || !(cm > 0)) return null;
  const porCelula = lado === "largura" ? cm / base.caixa.largura : cm / base.caixa.altura;

  /*
   * O arranjo encosta na origem.
   *
   * As peças guardam onde estavam na FOTO, e a foto tem mesa sobrando em volta
   * — na `blusa.bmp` são uns 15 cm acima da primeira peça. Sem descontar isso,
   * a folga da foto entra na página do PDF: ela sai mais alta que o desenho, e
   * quem imprime paga em papel por uma faixa vazia que não é gabarito de nada.
   *
   * O que se desconta é o canto do CONJUNTO, não o de cada peça, e a diferença
   * é o ponto todo: assim as peças continuam na mesma posição relativa em que
   * estavam na mesa — dá para cortar no lugar — e é só a moldura de sobra que
   * sai fora.
   */
  let cantoX = Infinity;
  let cantoY = Infinity;
  for (const r of riscos) {
    if (r.caixa.minX < cantoX) cantoX = r.caixa.minX;
    if (r.caixa.minY < cantoY) cantoY = r.caixa.minY;
  }

  // Alça é ponto como outro qualquer: se ela não for escalada junto, a curva
  // se desmancha quando a peça muda de tamanho.
  const paraCm = (r) => (p) => ({
    x: (p.x - r.caixa.minX) * porCelula,
    y: (p.y - r.caixa.minY) * porCelula,
  });

  return {
    porCelula,
    pecas: riscos.map((r) => ({
      largura: r.caixa.largura * porCelula,
      altura: r.caixa.altura * porCelula,
      nos: r.nos.map((n) => ({
        ...paraCm(r)(n),
        entrada: paraCm(r)(n.entrada),
        saida: paraCm(r)(n.saida),
        canto: !!n.canto,
      })),
      // Onde a peça está no conjunto, já em centímetros — a posição dela na
      // mesa, com a moldura de sobra da foto descontada (ver acima). É o que
      // faz a saída manter o arranjo em vez de empilhar tudo na origem.
      emX: (r.caixa.minX - cantoX) * porCelula,
      emY: (r.caixa.minY - cantoY) * porCelula,
    })),
  };
}

/**
 * Os riscos embrulhados num SVG só, medido em centímetros.
 *
 * O `cm` no `width`/`height` não é enfeite: é por ele que o `lerMoldesSVG`
 * descobre o tamanho real (ver `medidaDeclaradaEmCm`). Cada peça é um `<path>`
 * fechado, e o leitor de SVG do `moldes.js` já trata cada contorno fechado como
 * uma peça — então uma foto com nove moldes entra nas telas de Moldes e de
 * Encaixe como nove peças, na medida certa, sem uma linha de código novo lá.
 */
export function svgDosRiscos(emCm, nome = "molde") {
  const casas = (n) => Number(n.toFixed(3));
  let largura = 0;
  let altura = 0;
  for (const p of emCm.pecas) {
    largura = Math.max(largura, p.emX + p.largura);
    altura = Math.max(altura, p.emY + p.altura);
  }
  const traco = casas(Math.max(largura, altura) / 500);
  const caminhos = emCm.pecas.map((p) => {
    // `C` e não `L`: o risco sai como curva de verdade, então quem abrir no
    // CorelDRAW recebe os mesmos poucos nós que a tela mostrou, e não uma
    // poligonal de trezentos pontos para mexer um a um.
    const em = (q) => `${casas(q.x + p.emX)} ${casas(q.y + p.emY)}`;
    const partes = [`M${em(p.nos[0])}`];
    for (let i = 0; i < p.nos.length; i++) {
      const a = p.nos[i];
      const b = p.nos[(i + 1) % p.nos.length];
      partes.push(`C${em(a.saida)} ${em(b.entrada)} ${em(b)}`);
    }
    const d = partes.join(" ") + " Z";
    return `  <path d="${d}" fill="none" stroke="#000" stroke-width="${traco}"/>`;
  }).join("\n");

  const titulo = String(nome).replace(/[<&>]/g, " ").trim() || "molde";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${casas(largura)}cm" height="${casas(altura)}cm"
     viewBox="0 0 ${casas(largura)} ${casas(altura)}">
  <title>${titulo}</title>
${caminhos}
</svg>
`;
}
