/**
 * ===========================================================================
 * A PEÇA NA GRADE — o lado do canvas do preparo
 * ===========================================================================
 *
 * Ler os pixels da arte, tirar o fundo, reduzir a arte à grade do encaixe e
 * guardar as máscaras em cache. Tudo que precisa de `canvas` mora aqui; a
 * conta em cima dos pixels mora no `encaixeMascara`, que o worker também usa.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO VIROU UM ARQUIVO
 * ---------------------------------------------------------------------------
 *
 * Estas funções moravam no `public/encaixe.js`, que é TELA. E o
 * `encaixe-prepara.js`, que é domínio, chamava seis delas — mais o
 * `arte-molde.js`, que usa o `PPCM_PADRAO`. Em `<script>` global isso não
 * incomodava, porque tudo dividia o mesmo escopo e ninguém precisava dizer de
 * onde vinha o quê.
 *
 * Virando módulo, a mesma coisa seria o domínio importando da tela — e a tela
 * é justamente a parte que vai ser reescrita em React. Então o que o domínio
 * usa desceu para cá antes, e a tela passa a importar daqui também.
 *
 * Quem achou isso foi a peneira de identificadores soltos, não uma leitura: os
 * sete nomes apareceram como usados-e-não-declarados assim que os arquivos
 * viraram ESM. É o mesmo defeito do `rotacoesDe`, na etapa anterior.
 *
 * **Nenhuma conta mudou.** O texto veio recortado do `encaixe.js`, e a única
 * diferença é o `import` no lugar do escopo global.
 */

import {
  comGiroBase, gradeDaPeca, mascarasDeSilhueta, pecaSemGiro, rotacaoBaseDe, silhuetaDeDados,
  subamostrasDaArte,
  tirarFundoDosPixels,
} from "./encaixeMascara";

// Quando o arquivo não diz a resolução, 300 dpi é o padrão de arte para
// impressão — e a medida fica editável na tabela de qualquer jeito.
export const DPI_PADRAO = 300;
export const PPCM_PADRAO = DPI_PADRAO / 2.54;

/**
 * Os pixels de uma imagem, no tamanho original dela.
 *
 * É a **única** porta de entrada para os pixels da arte inteira, de propósito:
 * o preparo em worker (encaixe-prepara.js) manda os pixels lidos aqui, e não a
 * imagem, justamente para os dois caminhos verem exatamente os mesmos bytes.
 * Devolve `null` quando o canvas está bloqueado por imagem de outra origem.
 */
export function pixelsDaImagem(img) {
  // Aceita <img> e ImageBitmap. O bitmap é o caminho bom para arte grande: ele
  // é decodificado FORA da thread da tela, então o `drawImage` daqui só copia
  // pixels prontos em vez de decodificar 29 megapixels de uma vez.
  const largura = img.naturalWidth || img.width;
  const altura = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  try {
    return { canvas, ctx, dados: ctx.getImageData(0, 0, largura, altura), largura, altura };
  } catch (e) {
    return null;
  }
}

/**
 * Tira o fundo da arte deixando o miolo intacto.
 *
 * `forcar` manda tirar mesmo quando o fundo é escuro ou colorido — é a opção
 * "tirar o fundo" da tabela, para arte que vem sobre preto. No automático só
 * sai fundo claro, que é como a arte de sublimação costuma chegar; tirar um
 * fundo escuro por conta própria estragaria arte com fundo de propósito.
 */

export function removerFundoDaImagem(img, forcar = false) {
  const lido = pixelsDaImagem(img);
  if (!lido) return null;

  // A decisão e o apagamento são do encaixe-mascara.js, que o worker também
  // usa. Aqui fica só o que precisa de canvas: ler os pixels e refazer a
  // imagem depois.
  const mexeu = tirarFundoDosPixels(lido.dados.data, lido.largura, lido.altura, forcar);
  if (!mexeu) return null;

  lido.ctx.putImageData(lido.dados, 0, 0);
  return { src: lido.canvas.toDataURL("image/png"), apagados: mexeu.apagados, cor: mexeu.cor };
}

const canvasMascara = document.createElement("canvas");
const ctxMascara = canvasMascara.getContext("2d", { willReadFrequently: true });

/**
 * Os pixels da arte já reduzidos à grade do encaixe — com `sub` sub-amostras
 * de lado por célula (ver "A CÉLULA É PEÇA SE QUALQUER PEDAÇO DELA É PEÇA", em
 * `silhuetaDeDados`). Devolve `{ data, sub }`, e `data` tem `cols × sub` por
 * `rows × sub` pixels.
 *
 * Mesma história do `pixelsDaImagem`: porta única, para o worker receber
 * exatamente estes bytes. Vale reparar que a redução tem que sair daqui — o
 * Chrome reduz um ImageBitmap com uma conta diferente da que usa para reduzir
 * um <img>, e deixar o worker reduzir mudava a silhueta (está explicado em
 * prepara-worker.js).
 */
export function pixelsDaArteNaGrade(peca, cols, rows, passo) {
  const img = peca.img;
  const larguraImg = img.naturalWidth || img.width;
  const alturaImg = img.naturalHeight || img.height;
  const sub = subamostrasDaArte(larguraImg, peca.largura, cols, rows, passo);
  const W = cols * sub;
  const H = rows * sub;
  canvasMascara.width = W;
  canvasMascara.height = H;
  ctxMascara.clearRect(0, 0, W, H);
  /*
   * A arte entra NO TAMANHO DELA, e não esticada até a grade. A grade
   * arredonda para cima (ver `gradeDaPeca`), então sobra menos de uma célula
   * à direita e embaixo. Essa sobra é preenchida repetindo a última coluna e a
   * última linha da arte: deixada transparente, ela faria uma arte opaca de
   * fundo branco parecer arte recortada, e a leitura do fundo erraria.
   */
  const w = passo > 0 ? Math.min(W, (peca.largura / passo) * sub) : W;
  const h = passo > 0 ? Math.min(H, (peca.altura / passo) * sub) : H;
  ctxMascara.drawImage(img, 0, 0, w, h);
  if (w < W) ctxMascara.drawImage(img, larguraImg - 1, 0, 1, alturaImg, w, 0, W - w, h);
  if (h < H) ctxMascara.drawImage(img, 0, alturaImg - 1, larguraImg, 1, 0, h, w, H - h);
  if (w < W && h < H) {
    ctxMascara.drawImage(img, larguraImg - 1, alturaImg - 1, 1, 1, w, h, W - w, H - h);
  }
  try {
    return { data: ctxMascara.getImageData(0, 0, W, H).data, sub };
  } catch (e) {
    return null; // canvas bloqueado por imagem de outra origem
  }
}

/**
 * Descobre quais células têm tecido. Tenta, nesta ordem:
 *  - fundo transparente (PNG recortado, ou JPG que já teve o fundo tirado na
 *    hora de carregar) — o caminho mais confiável;
 *  - fundo de cor lisa em volta, espalhando a partir da borda;
 *  - se nada disso servir, assume a caixa inteira (volta a ser retângulo).
 *
 * A decisão do que é fundo é a mesma de `removerFundoDaImagem`, de propósito:
 * quando as duas discordavam, o PDF saía com o fundo pintado e o encaixe
 * empilhava as peças como se ele não existisse.
 */

export function silhuetaDaImagem(peca, cols, rows, passo) {
  const total = cols * rows;
  const cheio = () => ({ bits: new Uint8Array(total).fill(1), modo: "caixa" });
  if (contornoDaPeca(peca) === "caixa") return cheio();

  const dados = pixelsDaArteNaGrade(peca, cols, rows, passo);
  if (!dados) return cheio();

  // Daqui para frente é só conta em cima dos pixels, e mora no
  // encaixe-mascara.js para o worker poder fazer a mesma coisa.
  return silhuetaDeDados(dados.data, cols, rows, dados.sub, { fundoSaiNoPdf: !!peca.fundoNaExportacao });
}

/**
 * Monta (e guarda em cache) as máscaras de uma peça nas quatro rotações. O
 * cache evita refazer tudo a cada clique em "Optmizar" quando nada mudou.
 */
/**
 * Como a silhueta da peça é lida: o `contorno` que a pessoa escolheu, ou a
 * caixa inteira quando a conferência pela arte pegou a peça num encaixe (o
 * `reforco`, ver `conferenciaDaArte.js`). A caixa é o que a arte imprime no
 * pior caso, então com ela não há leitura de silhueta que possa errar.
 */
export function contornoDaPeca(peca) {
  return peca.reforco === "caixa" ? "caixa" : peca.contorno;
}

/** A chave do cache de máscaras: muda quando qualquer entrada muda. */
export function chaveDasMascaras(peca, passo, raio) {
  // O fundo entra porque decide se a leitura pela cor vale (ver "O FUNDO QUE
  // A MÁSCARA IGNORA TEM DE SAIR NO PDF", em encaixeMascara.js).
  return `${passo}|${raio}|${peca.largura}|${peca.altura}|${contornoDaPeca(peca)}`
    + `|f${peca.fundoNaExportacao ? 1 : 0}|g${rotacaoBaseDe(peca)}`;
}

export function mascarasDaPeca(peca, passo, raio) {
  const chave = chaveDasMascaras(peca, passo, raio);
  if (peca._cacheMascaras && peca._cacheMascaras.chave === chave) return peca._cacheMascaras;

  // A silhueta sai da arte como ela chegou, e o giro base entra depois (ver
  // "O GIRO DA PEÇA ANTES DO ENCAIXE", em encaixeMascara.js).
  const crua = pecaSemGiro(peca);
  const { cols, rows } = gradeDaPeca(crua, passo);
  const silhueta = silhuetaDaImagem(crua, cols, rows, passo);
  peca._cacheMascaras = {
    chave, ...comGiroBase(mascarasDeSilhueta(silhueta, cols, rows, passo, raio,
      { largura: crua.largura, altura: crua.altura }), rotacaoBaseDe(peca)),
  };
  return peca._cacheMascaras;
}
