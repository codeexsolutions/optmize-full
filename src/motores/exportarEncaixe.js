/**
 * Artes para impressão: o cálculo usa uma prévia leve, mas o PDF recebe a
 * arte ORIGINAL, do jeito que ela chegou — e quem gira é o servidor.
 *
 * ===========================================================================
 * POR QUE A ARTE NÃO PASSA MAIS PELO CANVAS (2026-10-19)
 * ===========================================================================
 *
 * Até aqui, toda peça girada, todo JPEG "fora do padrão" e todo PDF passavam
 * por um canvas antes de ir para o PDF. Em uso contínuo a produção mostrou o
 * preço disso, em fotos da mesa e do Corel:
 *
 *   - COR MUDANDO. O navegador converte a arte para sRGB ao decodificar, e o
 *     PNG que sai do canvas perde o perfil de cor. A mesma arte saía com uma
 *     cor quando ia direto e com outra quando ia girada — dois roxos no mesmo
 *     rolo.
 *   - BORDA SUJA E DEGRADÊ ESTRAGADO. O canvas guarda a cor multiplicada pelo
 *     alfa; sombra, brilho e borda suave de arte de DTF voltam com a cor
 *     arredondada.
 *   - VETOR VIRANDO PIXEL. O PDF de arte (Corel, Illustrator) era desenhado
 *     pelo pdf.js a 300 dpi, com a conversão de CMYK dele, e embutido como
 *     imagem: letra serrilhada e cor diferente da que o cliente aprovou.
 *
 * Agora:
 *
 *   - imagem sem remoção de fundo: vão os BYTES do arquivo, intocados, e o
 *     servidor gira sem perda e respeita o perfil de cor (encaixe-pdf.js);
 *   - PDF de arte: vai o PRÓPRIO PDF, e a página entra no rolo como vetor;
 *   - remoção de fundo: é a única conta que precisa dos pixels. Ela é feita
 *     aqui, sem girar, a borda é suavizada (`suavizarBordaDoFundo`) e o PNG é
 *     montado à mão, com o perfil de cor do original — sem `toBlob`.
 *
 * Quando o servidor não consegue ler o arquivo (formato que o leitor dele não
 * conhece, PDF quebrado), ele avisa na hora do envio e a tela manda a arte
 * desenhada, que é `arteDesenhadaDaPeca` — o caminho antigo, só como reserva.
 */
import { suavizarBordaDoFundo, tirarFundoDosPixels } from "./encaixeMascara";
import { decodificar, pixelsDe, perfilRgbDoArquivo, pngDosPixels, semFundoDoArquivo } from "./semFundo";
import { lerArteDoPDF } from "./pdfParaArte";
import { DPI_PDF } from "./resolucaoDaArte";

async function blobDaPeca(peca) {
  let blob = peca.arquivoOriginal;
  if (!blob) {
    const origem = peca.srcOriginal || peca.src;
    if (!origem) throw new Error(`A fonte de "${peca.nome || "peça"}" não está disponível.`);
    const resposta = await fetch(origem);
    if (!resposta.ok) throw new Error(`Não consegui ler a arte de "${peca.nome || "peça"}".`);
    blob = await resposta.blob();
  }
  return blob;
}

/*
 * ===========================================================================
 * A ARTE QUE MUDOU NO DISCO DEPOIS DE ENTRAR NA LISTA
 * ===========================================================================
 *
 * O programa guarda a REFERÊNCIA do arquivo, e não os bytes: é isso que
 * permite ao PDF levar os pixels do original sem o navegador segurar centenas
 * de MB durante o trabalho inteiro. O preço é que a leitura acontece lá na
 * frente, na hora de exportar — e até lá o arquivo pode ter mudado.
 *
 * Basta salvar a arte de novo por cima, no Photoshop ou no Corel, com a peça
 * já na lista: a referência morre e a leitura falha. É comum, porque ajustar a
 * arte e reexportar é exatamente o que se faz enquanto o encaixe está aberto.
 *
 * O navegador responde a isso com "The requested file could not be read,
 * typically due to permission problems that have occurred after a reference to
 * a file was acquired" — que subia inteiro para a tela, sem dizer QUAL arte
 * entre as vinte da lista nem o que fazer a respeito. Quem lê isso no meio do
 * expediente não tem por onde começar.
 */
function arteIlegivel(erro, peca) {
  const nome = (peca && peca.nome) || "a arte";
  const sumiu = erro && (erro.name === "NotFoundError" || /not be found/i.test(erro.message || ""));
  return new Error(`a arte "${nome}" não pôde ser lida do disco — `
    + (sumiu
      ? "o arquivo foi movido ou apagado depois de a peça entrar na lista."
      : "o arquivo mudou depois de a peça entrar na lista (foi salvo de novo por cima?).")
    + " Arraste a arte para a tela outra vez e exporte de novo.");
}

/** O erro é de leitura do arquivo, e não de conta nossa? */
function ehFalhaDeLeitura(erro) {
  if (!erro) return false;
  return erro.name === "NotReadableError" || erro.name === "NotFoundError"
    || /could not be read|could not be found/i.test(erro.message || "");
}

async function lerBytes(blob, peca) {
  return new Uint8Array(await blob.arrayBuffer().catch((erro) => { throw arteIlegivel(erro, peca); }));
}

// ==================== OS CAMINHOS DA ARTE ====================

// Moraram aqui até 2026-10-27; foram para `semFundo.js` para rodar no worker.
export { perfilRgbDoArquivo, pngDosPixels };


const tetoDoPdf = (cm) => Math.ceil(cm / 2.54 * DPI_PDF);

/** A página do PDF desenhada, para quando o vetor não pode ir (remoção de fundo, reserva). */
async function pdfDesenhado(peca) {
  const arte = await lerArteDoPDF(peca.pdfOriginal, { tetoDeLado: tetoDoPdf });
  URL.revokeObjectURL(arte.endereco);
  return arte;
}

/**
 * A arte com o fundo tirado, SEM giro, num PNG com o perfil de cor do original.
 * A borda que encosta no fundo é suavizada em vez de cortada a seco: é ela que
 * deixava o contorno claro e serrilhado em volta da arte.
 */
async function arteSemFundo(peca) {
  let img;
  let perfil = null;
  try {
    if (peca.pdfOriginal) {
      img = (await pdfDesenhado(peca)).bitmap;
    } else {
      const blob = await blobDaPeca(peca);
      perfil = perfilRgbDoArquivo(await lerBytes(blob, peca));
      img = await decodificar(blob)
        .catch((erro) => { throw ehFalhaDeLeitura(erro) ? arteIlegivel(erro, peca) : erro; });
    }
    const { dados, largura, altura } = pixelsDe(img);
    const tirado = tirarFundoDosPixels(dados, largura, altura, peca.fundoNaExportacao === "forcar");
    if (tirado) suavizarBordaDoFundo(dados, largura, altura, tirado.cor);
    return pngDosPixels(dados, largura, altura, perfil);
  } finally {
    img?.close?.();
  }
}

/*
 * ===========================================================================
 * O FUNDO É TIRADO UMA VEZ SÓ — QUANDO A ARTE ENTRA (2026-10-27)
 * ===========================================================================
 *
 * Eram duas remoções da mesma arte. Na ENTRADA, a tela tirava o fundo de uma
 * cópia reduzida, para a mesa e a silhueta do encaixe; no EXPORTAR, tirava de
 * novo da arte inteira, com a conta fiel do PDF (sem mudar a cor, borda
 * suavizada, perfil de cor junto) — na linha principal, uma de cada vez.
 *
 * Agora é uma só, e é a do PDF: na entrada, em resolução cheia, nos workers
 * (`semFundoDoArquivo`). O resultado fica guardado aqui, por arquivo, e é o
 * MESMO que vai para o PDF; a tela o abre reduzido para desenhar e tirar a
 * silhueta. Exportar não tira fundo nenhum: só pega o que já está pronto.
 *
 * A arte de PDF com fundo tirado continua pelo caminho antigo: ela passa pelo
 * pdf.js, que não roda no worker deste arquivo.
 */
const SEM_FUNDO_WORKERS = 4;
/*
 * A arte sem fundo de cada ORIGEM (o arquivo da peça) e modo ("auto" ou
 * "forcar"). A chave é o próprio arquivo, e não a peça: as cópias de uma peça
 * no risco são objetos diferentes com o mesmo arquivo, e a peça nasce antes de
 * ter o índice que viraria chave no PDF.
 */
const semFundosDoArquivo = new WeakMap(); // Blob -> Map(modo -> promessa)
const semFundosDoEndereco = new Map(); // endereço -> Map(modo -> promessa)
let poolSemFundo = null;
let proximoPedido = 0;
const esperandoSemFundo = new Map(); // id -> { pronto, falhou }

function guardadasDe(origem) {
  const lugar = typeof origem === "string" ? semFundosDoEndereco : semFundosDoArquivo;
  let porModo = lugar.get(origem);
  if (!porModo) { porModo = new Map(); lugar.set(origem, porModo); }
  return porModo;
}

function workersDoSemFundo() {
  if (poolSemFundo) return poolSemFundo;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    const quantos = Math.max(1, Math.min(SEM_FUNDO_WORKERS, (navigator.hardwareConcurrency || 4) - 1));
    poolSemFundo = { livres: [], fila: [] };
    for (let k = 0; k < quantos; k++) {
      const w = new Worker(new URL("./semFundoWorker.js", import.meta.url), { type: "module" });
      w.onmessage = ({ data }) => {
        const pedido = esperandoSemFundo.get(data.id);
        // A prévia é a primeira de duas mensagens: o worker segue ocupado com o PNG.
        if (data.previa) {
          if (pedido && pedido.aoTerPrevia) pedido.aoTerPrevia(data.previa);
          else data.previa.close();
          return;
        }
        esperandoSemFundo.delete(data.id);
        if (pedido) {
          if (data.erro) pedido.falhou(Object.assign(new Error(data.erro.message), { name: data.erro.name }));
          else pedido.pronto(data.blob);
        }
        const seguinte = poolSemFundo.fila.shift();
        if (seguinte) seguinte(w);
        else poolSemFundo.livres.push(w);
      };
      poolSemFundo.livres.push(w);
    }
  } catch (erro) {
    console.warn("[exportar] sem workers para tirar o fundo, vai na tela:", erro);
    poolSemFundo = null;
  }
  return poolSemFundo;
}

/**
 * A conta de `semFundo.js` num worker, ou na tela se não houver worker.
 * Resolve com o PNG do PDF; `aoTerPrevia`, se vier, recebe antes a prévia da
 * tela (ver "A PRÉVIA ANTES DO PNG", em semFundo.js).
 */
function semFundoDoBlob(blob, forcar, teto = 0, aoTerPrevia = null) {
  const pool = workersDoSemFundo();
  if (!pool) return semFundoDoArquivo(blob, forcar, teto, aoTerPrevia);
  return new Promise((pronto, falhou) => {
    const id = ++proximoPedido;
    esperandoSemFundo.set(id, { pronto, falhou, aoTerPrevia });
    const mandar = (w) => w.postMessage({ id, blob, forcar, teto });
    const livre = pool.livres.pop();
    if (livre) mandar(livre);
    else pool.fila.push(mandar);
  });
}

/**
 * Tira o fundo dos arquivos, na entrada, e guarda o resultado para o PDF.
 *
 * Resolve quando as PRÉVIAS estão prontas — não o PNG do PDF, que segue sendo
 * montado no worker. Para cada arquivo devolve `{ img, png }`: `img` é a arte
 * sem fundo já reduzida a `tetos[i]` (o bitmap da tela e da silhueta), e `png`
 * a promessa do PNG do PDF, que fica guardada aqui para o Exportar. Ou `null`,
 * quando não havia fundo para tirar — ou quando a conta falhou, e aí a arte
 * entra como veio, como sempre entrou. `aoAndar(i, total)` conta as prontas.
 */
export async function tirarFundoDosArquivos(blobs, forcar = false, aoAndar = null, tetos = []) {
  const modo = forcar ? "forcar" : "auto";
  let feitas = 0;
  return Promise.all(blobs.map(async (blob, i) => {
    let semFundo = null;
    if (blob) {
      semFundo = await new Promise((entregar) => {
        const png = Promise.resolve(semFundoDoBlob(blob, forcar, tetos[i] || 0,
          (img) => entregar({ img, png })));
        guardadasDe(blob).set(modo, png);
        // Sem prévia: não havia fundo (o PNG vem `null`) ou a conta falhou.
        png.then((arte) => { if (!arte) entregar(null); }, (erro) => {
          guardadasDe(blob).delete(modo);
          console.warn("[encaixe] não deu para tirar o fundo:", erro);
          entregar(null);
        });
      });
    }
    if (aoAndar) await aoAndar(feitas++, blobs.length);
    return semFundo;
  }));
}

async function calcularSemFundo(peca) {
  // PDF de arte com fundo removido: rasterizado e COLORIDO aqui (caminho antigo,
  // pelo pdf.js). O recorte separado é só para imagem.
  if (peca.pdfOriginal) return arteSemFundo(peca);
  const blob = await blobDaPeca(peca);
  // Lido aqui para o recado de "arquivo mudou no disco" dizer qual peça era.
  await lerBytes(blob.slice(0, 16), peca);
  // Devolve o RECORTE (PNG cinza, só o alfa), ou `null` quando não há fundo a
  // tirar — e aí a arte vai inteira, sem recorte. A cor é do servidor.
  return Promise.resolve(semFundoDoBlob(blob, peca.fundoNaExportacao === "forcar"))
    .catch((erro) => { throw ehFalhaDeLeitura(erro) ? arteIlegivel(erro, peca) : erro; });
}

/**
 * A arte sem fundo da peça para o PDF: a que a entrada já deixou pronta, ou —
 * peça que chegou sem passar por lá, arte de PDF — uma feita agora.
 */
function semFundoGuardado(peca) {
  const origem = peca.pdfOriginal || peca.arquivoOriginal || peca.srcOriginal || peca.src;
  const modo = peca.fundoNaExportacao;
  const porModo = guardadasDe(origem);
  const guardada = porModo.get(modo);
  if (guardada) return guardada.then((arte) => arte || calcularSemFundo(peca));
  const promessa = calcularSemFundo(peca);
  porModo.set(modo, promessa);
  // Falhou: não fica guardada, para a próxima tentativa refazer.
  promessa.catch(() => { if (porModo.get(modo) === promessa) porModo.delete(modo); });
  return promessa;
}

/**
 * Garante que as artes sem fundo do risco estejam prontas ou a caminho, sem
 * esperar. Na maioria das peças já estão (a entrada fez); esta é a rede para
 * as que não passaram por lá. Erro aqui não aparece: ele volta, com o nome da
 * peça, quando o Exportar pedir a mesma arte.
 */
export function adiantarArtesSemFundo(posicoes) {
  const vistas = new Set();
  for (const p of posicoes) {
    const peca = p.item;
    if (!peca || !peca.fundoNaExportacao) continue;
    const chave = chaveDaArte(peca);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    semFundoGuardado(peca).catch(() => {});
  }
}

/**
 * O que vai para o servidor por uma peça, ainda sem giro nenhum.
 *
 * `{ arte, vetor }`: `vetor` diz que a arte é o próprio PDF da peça, que o
 * servidor embute como desenho e não como imagem.
 */
export async function arteDaPeca(peca) {
  if (peca.fundoNaExportacao) {
    const pronto = await semFundoGuardado(peca);
    // PDF de arte: `pronto` é a página rasterizada e colorida (caminho antigo).
    if (peca.pdfOriginal) return { arte: pronto, vetor: false };
    // Imagem: `pronto` é o RECORTE (alfa) ou `null`. A arte vai INTEIRA, e a cor
    // é do servidor; o recorte vira /SMask lá (ver "O RECORTE VEM DE FORA").
    const blob = await blobDaPeca(peca);
    await lerBytes(blob.slice(0, 16), peca);
    return { arte: blob, vetor: false, recorte: pronto || null };
  }
  if (peca.pdfOriginal) {
    // Lido agora para o recado de arquivo mudado ser o mesmo das imagens.
    await lerBytes(peca.pdfOriginal.slice(0, 5), peca);
    return { arte: peca.pdfOriginal, vetor: true };
  }
  const blob = await blobDaPeca(peca);
  await lerBytes(blob.slice(0, 16), peca);
  return { arte: blob, vetor: false };
}

/**
 * A reserva: a arte desenhada num PNG, para quando o servidor não consegue
 * ler o arquivo original. Continua sem giro e com o perfil de cor do original.
 */
export async function arteDesenhadaDaPeca(peca) {
  if (peca.fundoNaExportacao) return arteSemFundo(peca);
  let img;
  let perfil = null;
  try {
    if (peca.pdfOriginal) {
      img = (await pdfDesenhado(peca)).bitmap;
    } else {
      const blob = await blobDaPeca(peca);
      perfil = perfilRgbDoArquivo(await lerBytes(blob, peca));
      img = await decodificar(blob)
        .catch((erro) => { throw ehFalhaDeLeitura(erro) ? arteIlegivel(erro, peca) : erro; });
    }
    const { dados, largura, altura } = pixelsDe(img);
    return pngDosPixels(dados, largura, altura, perfil);
  } finally {
    img?.close?.();
  }
}

/**
 * A chave da arte no PDF: UMA POR PEÇA, seja qual for o giro.
 *
 * Era uma por peça e giro (`3-0`, `3-90`), porque o servidor girava os
 * pixels: a mesma arte subia duas vezes, entrava duas vezes no PDF e, com
 * remoção de fundo, tinha o fundo tirado duas vezes. Agora o giro vai em cada
 * posição (`giroDaPosicao`) e o servidor o aplica na matriz da página (ver "O
 * GIRO É DA PÁGINA, NÃO DOS PIXELS", em servidor/encaixe-pdf.js).
 */
export const chaveDaArte = (item) => String(item.indice);

/**
 * O giro total de uma posição: o do encaixe mais o que a peça recebeu antes
 * dele (ver "O GIRO DA PEÇA ANTES DO ENCAIXE", em encaixeMascara.js).
 */
export function giroDaPosicao(p) {
  const rot = p.rot || (p.girado ? 90 : 0);
  return (rot + (Number(p.item.rotacaoBase) || 0)) % 360;
}

/**
 * Uma arte por peça, do jeito que ela vai para o servidor: sem giro. As cópias
 * da peça (`p.item` é a cópia, e não a peça) leem o arquivo uma vez só.
 */
export async function prepararArtes(posicoes, aoLer) {
  const artes = new Map();
  // Quantas artes diferentes existem, para `aoLer` dizer "3 de 17".
  const total = new Set(posicoes.map((p) => chaveDaArte(p.item))).size;
  // As sem fundo começam TODAS agora, nos workers, e não uma depois da outra
  // no laço abaixo — que só espera cada uma na sua vez.
  adiantarArtesSemFundo(posicoes);
  for (const p of posicoes) {
    const chave = chaveDaArte(p.item);
    if (artes.has(chave)) continue;
    artes.set(chave, { ...(await arteDaPeca(p.item)), peca: p.item });
    if (aoLer) aoLer(artes.size, total);
  }
  return artes;
}
