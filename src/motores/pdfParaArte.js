/**
 * ===========================================================================
 * O PDF VIRA ARTE — a página desenhada, e não o contorno dela
 * ===========================================================================
 *
 * POR QUE ISTO EXISTE:
 *
 * O Encaixe já aceitava PDF, mas pela porta errada. O arquivo caía em
 * `lerMoldeVetorial` (ver `moldes.js`), que existe para ler MARCADOR: ela
 * varre o desenho atrás de todo contorno fechado e transforma cada um numa
 * peça, e depois `moldeParaImagem` repinta cada peça como uma silhueta de cor
 * chapada.
 *
 * Para um DXF de molde isso é exatamente certo — lá cada contorno fechado É
 * uma peça. Para um PDF de arte é um desastre em dois tempos, e os dois
 * apareciam juntos na tela:
 *
 *   1. A arte ia em pedaços. Cada letra, cada forma, cada detalhe do desenho é
 *      um contorno fechado, então um trabalho virava dezenas de "peças".
 *   2. A arte sumia. Do PDF só se aproveitava a geometria dos traços; imagem,
 *      preenchimento e cor nunca chegavam a ser lidos. A peça saía como
 *      silhueta, porque era só isso que existia dela.
 *
 * Aqui o PDF é tratado pelo que ele é na fábrica: um trabalho para imprimir.
 * A página é DESENHADA, do jeito que uma impressora desenharia, e entra como
 * UMA peça pela mesma estrada que um PNG já percorre (ver `montarPecaDaImagem`
 * no `controlador.js`).
 *
 * ---------------------------------------------------------------------------
 * DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO
 * ---------------------------------------------------------------------------
 *
 * **O fundo sai transparente.** O pdf.js pinta a página de branco por padrão,
 * e branco aqui seria fatal: o `contorno: "auto"` da peça lê a SILHUETA da
 * arte para saber o que encostar em quê no encaixe. Com fundo branco toda peça
 * viraria o retângulo inteiro da página, e o aproveitamento do tecido cairia
 * para o de uma folha cheia de ar. Transparente, a silhueta segue o desenho.
 *
 * **A medida vem da página, não de um palpite.** Uma imagem obriga a supor o
 * dpi quando o arquivo não diz qual é (é o `(suposto)` que aparece na coluna
 * de origem). O PDF não precisa disso: ele mede em pontos, 72 por polegada,
 * por definição do formato. Então o tamanho em centímetros sai exato — este é
 * o único formato de arte que entra no Encaixe sem chute nenhum.
 */

import { PDF_PT_POR_CM } from "./moldes";
import { ladoDaPrevia } from "./resolucaoDaArte";
import { paraBlob } from "../utils/arquivoDeImagem";

/*
 * O pdf.js faz a leitura num worker. Ele é montado uma vez só, na primeira vez
 * que alguém abre um PDF — e não no carregamento da tela, porque a maioria das
 * sessões do Encaixe nunca vê um PDF, e subir um worker para nada é meio
 * megabyte de trabalho jogado fora em toda abertura do painel.
 *
 * O worker vem empacotado junto (o `?worker` do Vite), e não de um endereço na
 * internet como a receita mais comum do pdf.js manda: este app roda na fábrica,
 * instalado, e muitas vezes sem rede nenhuma.
 */
let pdfjsCarregando = null;
function carregarPdfjs() {
  if (!pdfjsCarregando) {
    pdfjsCarregando = (async () => {
      const [pdfjs, { default: TrabalhadorDoPdf }] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.mjs?worker"),
      ]);
      pdfjs.GlobalWorkerOptions.workerPort = new TrabalhadorDoPdf();
      return pdfjs;
    })();
  }
  return pdfjsCarregando;
}

/**
 * Até onde vale a pena desenhar a página.
 *
 * Mesma conta do `ladoDeTrabalho` do controlador: esta é a prévia usada pelo
 * cálculo. A exportação reabre o PDF original com sua resolução de impressão.
 *
 * Quem chama pode mandar a sua própria régua em `tetoDeLado`; o Encaixe manda,
 * para que PDF e imagem parem exatamente no mesmo teto.
 */
const tetoPadrao = ladoDaPrevia;
let filaDeLeitura = Promise.resolve();

/** O arquivo começa como PDF? Olha a assinatura, não o nome. */
async function pareceDePdf(file) {
  const inicio = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...inicio).startsWith("%PDF");
}

export const ehArquivoPDF = (file) => /\.pdf$/i.test(file.name);

/**
 * Desenha a primeira página do PDF e devolve a arte pronta para virar peça.
 *
 * Devolve `{ bitmap, blob, endereco, larguraCm, alturaCm, ppcm, paginas }`:
 * `bitmap` é o que o encaixe desenha, `endereco` é o que a miniatura da tabela
 * mostra, e `paginas` serve para avisar quando o arquivo trazia mais de uma —
 * só a primeira entra, porque uma peça é uma arte.
 */
export function lerArteDoPDF(file, opcoes = {}) {
  const leitura = filaDeLeitura.then(() => desenharPDF(file, opcoes));
  filaDeLeitura = leitura.then(() => {}, () => {});
  return leitura;
}

async function desenharPDF(file, { tetoDeLado = tetoPadrao, somenteBlob = false, rotacao = 0 } = {}) {
  if (!(await pareceDePdf(file))) {
    throw new Error(`"${file.name}" não parece ser um PDF de verdade (não começa com %PDF).`);
  }

  const pdfjs = await carregarPdfjs();

  let tarefa;
  let documento;
  let canvas;
  try {
    try {
      tarefa = pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        // Sem rede: fonte que falta é substituída pela padrão em vez de o
        // desenho parar esperando um download que nunca vem.
        disableFontFace: false,
        useSystemFonts: true,
      });
      documento = await tarefa.promise;
    } catch (err) {
      if (err && err.name === "PasswordException") {
        throw new Error(`"${file.name}" está protegido por senha; salve uma cópia sem proteção e mande de novo.`);
      }
      throw new Error(`Não consegui abrir "${file.name}": ${err && err.message ? err.message : "PDF ilegível"}.`);
    }

    const pagina = await documento.getPage(1);

    // Escala 1 dá a página em pontos, já com a rotação dela aplicada — é por
    // isso que a medida sai daqui e não do MediaBox cru, que ignora o /Rotate
    // e devolveria uma arte deitada como se estivesse em pé.
    const emPontos = pagina.getViewport({ scale: 1 });
    const larguraCm = emPontos.width / PDF_PT_POR_CM;
    const alturaCm = emPontos.height / PDF_PT_POR_CM;
    if (!(larguraCm > 0) || !(alturaCm > 0)) {
      throw new Error(`"${file.name}" tem página de tamanho zero; não dá para medir a arte.`);
    }

    const teto = tetoDeLado(Math.max(larguraCm, alturaCm));
    const escala = teto / Math.max(emPontos.width, emPontos.height);
    const vista = pagina.getViewport({ scale: escala, rotation: pagina.rotate + rotacao });

    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(vista.width));
    canvas.height = Math.max(1, Math.round(vista.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`Não há memória para desenhar "${file.name}".`);

    await pagina.render({
      canvas,
      canvasContext: ctx,
      viewport: vista,
      // O fundo transparente do comentário lá de cima. Sem isto, toda peça
      // vinda de PDF encaixaria como um retângulo cheio.
      background: "rgba(0, 0, 0, 0)",
    }).promise;

    // PNG e não JPEG: o JPEG não guarda transparência, e a transparência é
    // justamente o que faz a silhueta da peça existir.
    const blob = await paraBlob(canvas, "image/png");
    if (somenteBlob) return { blob };
    const bitmap = await createImageBitmap(canvas);

    return {
      bitmap,
      blob,
      endereco: URL.createObjectURL(blob),
      larguraCm,
      alturaCm,
      // Quantos pixels desenhados por centímetro de arte — a peça usa isto
      // para saber a resolução real que tem em mãos.
      ppcm: canvas.width / larguraCm,
      paginas: documento.numPages,
    };
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    await tarefa?.destroy();
  }
}
