/**
 * ===========================================================================
 * A ARTE SAINDO DAQUI — o que o PDF leva de cada peça
 * ===========================================================================
 *
 * O risco na tela é um desenho pequeno; o que vai para a máquina é a arte de
 * cada peça na resolução de impressão, desenhada uma vez por rotação usada.
 * Este arquivo é essa preparação, e nada mais: quem posiciona as artes na
 * página é o servidor (`servidor/encaixe-pdf.js`), e quem manda os bytes para
 * lá é `api/encaixe.ts`.
 *
 * As três decisões que moram aqui — a resolução fixa, a escolha do formato de
 * cada arte, e o passa-direto do JPEG — estão explicadas abaixo, cada uma no
 * seu lugar. Elas são o resultado de medição em trabalho de verdade, e o
 * comentário é mais longo que o código de propósito: o código se lê em um
 * minuto, e o POR QUÊ levou meses.
 *
 * Saiu do `producao/controlador.js` sem uma linha de conta mudada. O que ele
 * ganhou foi uma porta: `prepararArtes` recebe as posições e devolve as artes,
 * sem saber quem vai mandá-las nem quem está olhando a tela.
 */

import { desenharArte } from "./desenhoDoEncaixe";
import { jpegSeguroParaPdf } from "./jpegParaPdf";

/*
 * A RESOLUÇÃO DE IMPRESSÃO, E ELA NÃO NEGOCIA.
 *
 * 150 dpi, sempre. Já foi um teto móvel: havia um limite de quanto podia subir
 * para o servidor (`TETO_DE_ENVIO_MB`, 300 MB), e quando as artes passavam
 * disso a tela baixava o dpi até caber. Parecia prudente e era um mau negócio
 * — trocava QUALIDADE DE IMAGEM por MEMÓRIA DE SERVIDOR. No trabalho de 155
 * artes distintas, quem pedia 150 dpi recebia 50, e o arquivo ainda saía com
 * meio giga porque a redução era uma passada só e terminava acima do próprio
 * teto.
 *
 * O teto saiu porque a razão dele saiu: o servidor não segura mais as artes na
 * memória (elas vão para disco assim que chegam, e são lidas uma a uma na hora
 * de embutir — ver o cabeçalho de encaixe-pdf.js). O peso do arquivo agora é
 * resolvido onde tem que ser resolvido, que é na escolha do formato de cada
 * arte e no passa-direto, e nenhum dos dois mexe em resolução.
 *
 * `desenharPecaGirada` continua nunca AUMENTANDO a arte: 150 dpi é um teto,
 * não um piso. Arte que tem menos que isso entra com o que tem.
 */
export const DPI_EXPORTACAO = 150;

/*
 * ===========================================================================
 * O FORMATO DE CADA ARTE
 * ===========================================================================
 *
 * Toda arte saía em PNG. PNG é sem perda, o que parece a escolha óbvia para
 * quem vai imprimir 12 metros de tecido — e é a escolha certa para metade das
 * artes e a errada para a outra metade.
 *
 * Medido nas duas artes que existem de verdade nesta oficina, uma peça de
 * 50x70 cm a 150 dpi (2952 x 4132 px):
 *
 *                        PNG        JPEG q92
 *   arte fotográfica   28,5 MB       7,1 MB     PNG custa 4,0x
 *   arte chapada        0,1 MB       0,5 MB    JPEG custa 5,0x
 *
 * Os dois sentidos são grandes, e são opostos. O PNG guarda o ruído do
 * degradê pixel a pixel, que é justamente o que o JPEG joga fora sem ninguém
 * ver; e o JPEG põe chiado em volta de toda borda dura, que é justamente o que
 * o PNG guarda de graça — um logo de duas cores comprime quase a nada.
 *
 * Escolher no atacado erra metade das vezes, e erra feio. Então não se escolhe:
 * **os dois são gerados e fica o menor**. Custa uma codificação a mais por
 * arte (não por peça — a arte é desenhada uma vez por rotação usada), e a
 * decisão passa a ser medida em vez de adivinhada.
 *
 * DUAS TRAVAS, e as duas valem mais que os megabytes:
 *
 *   1. Arte com transparência nunca vai de JPEG. JPEG não tem canal alfa: o
 *      transparente viraria preto, e o preto sairia impresso. A varredura é
 *      exaustiva de propósito — um pixel translúcido perdido é uma mancha no
 *      tecido, e amostrar acharia 99,99% deles.
 *
 *   2. O JPEG só entra se for MENOR. Empate ou perda fica com o PNG, que é sem
 *      perda. Assim a arte chapada continua exatamente como sai hoje.
 *
 * O que isto custa em qualidade: na arte fotográfica, uma compressão q92 a 150
 * dpi, que é o padrão de prova de cor e não se distingue a olho no tecido. Na
 * arte chapada e na transparente, nada — elas continuam em PNG. Para voltar
 * tudo ao PNG de antes, é só pôr `QUALIDADE_JPEG` em 0.
 */
const QUALIDADE_JPEG = 0.92;

/**
 * A arte tem algum pixel que não seja opaco?
 *
 * Varre em faixas porque `getImageData` da arte inteira seria um vetor de
 * dezenas de MB de uma vez só — e no PDF de um lote grande isso acontece uma
 * vez por arte.
 */
export function totalmenteOpaca(ctx, largura, altura) {
  const FAIXA = 256;
  for (let y = 0; y < altura; y += FAIXA) {
    const h = Math.min(FAIXA, altura - y);
    const dados = ctx.getImageData(0, y, largura, h).data;
    for (let i = 3; i < dados.length; i += 4) if (dados[i] !== 255) return false;
  }
  return true;
}

export const paraBlob = (canvas, tipo, qualidade) =>
  new Promise((pronto) => canvas.toBlob(pronto, tipo, qualidade));

/*
 * ===========================================================================
 * O PASSA-DIRETO: a arte original, sem redesenhar
 * ===========================================================================
 *
 * O caminho normal decodifica a arte, redesenha num canvas na resolução de
 * impressão e codifica de novo. Quando a arte JÁ É um JPEG e a peça não está
 * girada, isso é trabalho puro: os bytes do arquivo entram no PDF do jeito que
 * estão (o pdfkit embute JPEG verbatim, como `/DCTDecode`, sem recodificar), o
 * arquivo sai menor e não há geração de perda nenhuma — é o único caminho aqui
 * que é sem perda de verdade.
 *
 * Só que "o pdfkit aceita" não é o mesmo que "a impressora aceita". O PDF
 * carrega o JPEG cru até a RIP, e é ela que vai decodificar. Por isso nada
 * passa sem ser lido marcador por marcador. Quatro coisas reprovam:
 *
 *   1. PROGRESSIVO (SOF2). O formato PDF permite, e RIP de verdade engasga — é
 *      o caso clássico do arquivo que abre no computador e não sai na máquina.
 *      Só o sequencial de Huffman (SOF0 e SOF1) passa, o que de quebra reprova
 *      o aritmético, o sem perda e o diferencial, que moram nos outros SOF.
 *
 *   2. QUATRO COMPONENTES (CMYK/YCCK). Pedem `/DeviceCMYK` e, no CMYK da Adobe,
 *      um `/Decode` invertido. Quem monta a página (encaixe-pdf.js) não faz nem
 *      um nem outro, e o erro sairia como a arte impressa em negativo.
 *
 *   3. PRECISÃO DE 12 BITS. É válida no JPEG e quase nada decodifica.
 *
 *   4. ORIENTAÇÃO EXIF DIFERENTE DE 1 — e este é o perigoso.
 *
 * O quarto merece o parágrafo dele, e merece ser contado direito. O navegador
 * APLICA a orientação do EXIF ao decodificar: uma foto marcada "gire 90°"
 * aparece em pé na tela, e é em pé que ela entra no encaixe, na silhueta e na
 * medida da peça. O pdfkit também lê o EXIF (`exif.fromBuffer`, no JPEG) e
 * também aplica — ou seja, o passa-direto de uma foto girada provavelmente
 * SAIRIA CERTO. "Provavelmente" é a palavra que reprova.
 *
 * São três leitores de EXIF em fila — o navegador, o pdfkit e a RIP — e o
 * resultado só sai certo se exatamente um deles aplicar. O pdfkit ainda troca
 * largura por altura quando a orientação passa de 4; aqui isso não muda a
 * medida (quem monta a página passa largura E altura explícitas, e o teste de
 * geometria cobre isso), mas é uma engrenagem a mais girando debaixo de um
 * arquivo que vai virar 12 metros de tecido. E a RIP decodifica o JPEG cru: se
 * ela também aplicar, a arte gira duas vezes.
 *
 * Reprovar custa uma recodificação e devolve o controle: a arte é redesenhada
 * já na posição certa, que é a mesma escolha que o resto deste arquivo faz ao
 * desenhar a peça girada em vez de girar dentro do PDF.
 *
 * Na dúvida, reprova: arquivo truncado, marcador que não fecha, EXIF que não se
 * deixa ler. Reprovar custa uma recodificação. Deixar passar custa o rolo.
 */



/**
 * A arte original, quando ela puder entrar no PDF sem ser tocada.
 *
 * `null` quer dizer "redesenha": peça girada, arte que não é JPEG, ou JPEG que
 * não passou no validador. Falha de leitura cai aqui também — `src` pode ser um
 * endereço de objeto que o navegador já recolheu.
 */
export async function arteCrua(peca, rot) {
  if (rot !== 0 || !peca.src) return null;   // girada, tem que ser redesenhada
  try {
    const blob = await (await fetch(peca.src)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return jpegSeguroParaPdf(bytes) ? blob : null;
  } catch (err) {
    return null;
  }
}

export async function desenharPecaGirada(peca, rot, larguraCm, alturaCm, dpi) {
  // Nunca aumenta a imagem: se a arte tem menos resolução que isso, ampliar só
  // deixaria o arquivo maior sem ganhar qualidade nenhuma.
  const ppcmAlvo = dpi / 2.54;
  const ppcmNativo = Math.max(peca.pxW / (rot === 90 || rot === 270 ? alturaCm : larguraCm), 1);
  const ppcm = Math.min(ppcmAlvo, ppcmNativo);

  const largura = Math.max(1, Math.round(larguraCm * ppcm));
  const altura = Math.max(1, Math.round(alturaCm * ppcm));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  desenharArte(ctx, { item: peca, rot }, 0, 0, largura, altura);

  const png = await paraBlob(canvas, "image/png");
  // Ver o bloco acima: o JPEG só disputa quando a arte é opaca, e só ganha
  // quando é menor de verdade.
  let refeita = png;
  if (png && QUALIDADE_JPEG > 0 && totalmenteOpaca(ctx, largura, altura)) {
    const jpg = await paraBlob(canvas, "image/jpeg", QUALIDADE_JPEG);
    if (jpg && jpg.size < png.size) refeita = jpg;
  }

  // E o passa-direto por último, porque ele precisa do tamanho da refeita para
  // poder se comparar. A original ganha quando NÃO É MAIOR: aí ela é melhor nos
  // dois eixos de uma vez — o mesmo byte de pixel que o arquivo trouxe, sem
  // recodificação nenhuma, e o arquivo não cresce. Sendo maior ela perde, e
  // perde certo: arte de resolução muito acima da exportação é justamente o que
  // o `DPI_EXPORTACAO` existe para não mandar para a máquina.
  const crua = await arteCrua(peca, rot);
  if (crua && refeita && crua.size <= refeita.size) return crua;
  return refeita || crua;
}

/** Desenha uma arte por rotação usada, na resolução pedida. */
export async function prepararArtes(posicoes, dpi) {
  const artes = new Map();
  for (const p of posicoes) {
    const rot = p.rot || (p.girado ? 90 : 0);
    const chave = `${p.item.indice}-${rot}`;
    if (!artes.has(chave)) {
      artes.set(chave, await desenharPecaGirada(p.item, rot, p.largura, p.altura, dpi));
    }
  }
  return artes;
}

/**
 * O PDF do encaixe é UM ARQUIVO SÓ, sempre — seja o rolo de 3 m ou de 40 m.
 *
 * Já foi repartido em trechos de 10 m, por causa do RIP: rasterizar uma página
 * em tamanho real custa memória proporcional ao tamanho da página, e um arquivo
 * de onze metros obriga a máquina a segurar tudo antes de a primeira gota cair.
 * Repartido, o RIP processa um trecho enquanto imprime o anterior.
 *
 * **Só que repartir não sai de graça, e o preço caiu na produção.** O corte
 * procurava um vão entre peças, mas encaixe bom é exatamente o que não deixa
 * vão: num rolo denso as peças se encavalam de ponta a ponta, e aí o corte
 * passava por cima de uma peça — metade num arquivo, metade no outro. Os dois
 * pedaços só se reencontram se os arquivos entrarem na máquina colados, sem um
 * milímetro de folga entre um trabalho e o outro, e na prática isso não
 * acontece. Peça partida é peça perdida.
 *
 * Então a decisão é essa: **arquivo único, sempre**. O formato aguenta — o
 * teto de 508 cm por página é contornado pelo `/UserUnit` (ver encaixe-pdf.js),
 * e é o mesmo `/UserUnit` que já valia para qualquer rolo acima de 5 m. Se um
 * dia um RIP engasgar com um rolo muito longo, o caminho não é voltar a partir
 * peça: é cortar o TRABALHO em dois encaixes menores, na tela, onde dá para
 * escolher onde separar.
 */
