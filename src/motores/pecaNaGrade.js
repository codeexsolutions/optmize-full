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
  gradeDaPeca, mascarasDeSilhueta, silhuetaDeDados, tirarFundoDosPixels,
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
 * Os pixels da arte já reduzidos à grade do encaixe.
 *
 * Mesma história do `pixelsDaImagem`: porta única, para o worker receber
 * exatamente estes bytes. Vale reparar que a redução tem que sair daqui — o
 * Chrome reduz um ImageBitmap com uma conta diferente da que usa para reduzir
 * um <img>, e deixar o worker reduzir mudava a silhueta (está explicado em
 * prepara-worker.js).
 */
export function pixelsDaArteNaGrade(peca, cols, rows) {
  canvasMascara.width = cols;
  canvasMascara.height = rows;
  ctxMascara.clearRect(0, 0, cols, rows);
  ctxMascara.drawImage(peca.img, 0, 0, cols, rows);
  try {
    return ctxMascara.getImageData(0, 0, cols, rows);
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

export function silhuetaDaImagem(peca, cols, rows) {
  const total = cols * rows;
  const cheio = () => ({ bits: new Uint8Array(total).fill(1), modo: "caixa" });
  if (peca.contorno === "caixa") return cheio();

  const dados = pixelsDaArteNaGrade(peca, cols, rows);
  if (!dados) return cheio();

  // Daqui para frente é só conta em cima dos pixels, e mora no
  // encaixe-mascara.js para o worker poder fazer a mesma coisa.
  return silhuetaDeDados(dados.data, cols, rows);
}

/**
 * Monta (e guarda em cache) as máscaras de uma peça nas quatro rotações. O
 * cache evita refazer tudo a cada clique em "Optmizar" quando nada mudou.
 */
/** A chave do cache de máscaras: muda quando qualquer entrada muda. */
export function chaveDasMascaras(peca, passo, raio) {
  return `${passo}|${raio}|${peca.largura}|${peca.altura}|${peca.contorno}`;
}

export function mascarasDaPeca(peca, passo, raio) {
  const chave = chaveDasMascaras(peca, passo, raio);
  if (peca._cacheMascaras && peca._cacheMascaras.chave === chave) return peca._cacheMascaras;

  const { cols, rows } = gradeDaPeca(peca, passo);
  const silhueta = silhuetaDaImagem(peca, cols, rows);
  peca._cacheMascaras = {
    chave, ...mascarasDeSilhueta(silhueta, cols, rows, passo, raio),
  };
  return peca._cacheMascaras;
}
