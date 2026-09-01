/**
 * Preparo da peça fora da thread da tela.
 *
 * São dois trabalhos, os dois pesados e os dois por peça — ou seja, os dois se
 * dividem bem entre núcleos:
 *
 *   "fundo"    tirar o fundo branco da arte, no tamanho original do arquivo
 *              (uma arte de 2000x2500 são cinco milhões de pixels);
 *   "mascaras" achar a silhueta na grade do encaixe, engordar pela folga e
 *              girar nas quatro posições.
 *
 * O que chega aqui são **os pixels já lidos**, não a imagem.
 *
 * A primeira versão mandava um ImageBitmap e deixava o worker desenhar num
 * OffscreenCanvas — mais bonito, e errado: o Chrome reduz um ImageBitmap com
 * uma conta diferente da que usa para reduzir um <img>. Medindo, 1.550 pixels
 * saíam com alfa diferente numa peça só, e a silhueta vinha 492 células menor.
 * As opções de `createImageBitmap` (premultiplyAlpha, colorSpaceConversion)
 * não consertam — testei as três combinações e a diferença só aumenta.
 *
 * Mandando os pixels, quem os lê continua sendo o mesmo canvas de sempre, na
 * página, e o resultado é idêntico ao da versão sem worker. Custa 13% a 18% do
 * trabalho, que é o preço de estar certo.
 */

// O geometria.js vai junto porque o encaixe-mascara.js usa o `arredondar` dele
// (em `grade`). Este worker não chama `grade`, mas carregar um arquivo com uma
// referência que não existe é uma armadilha esperando a próxima função ser
// usada aqui: quem carrega o encaixe-mascara.js carrega o geometria.js antes,
// e é assim nos três lugares (página, encaixe-worker e aqui).
importScripts("geometria.js", "encaixe-mascara.js");

/**
 * Os buffers que devem atravessar de volta sem cópia.
 *
 * Uma máscara tem quatro arrays e a peça tem quatro rotações, então são até
 * dezesseis blocos de memória por peça. Transferindo, o custo é zero; copiando
 * seria outra vez o mesmo trabalho, agora na thread da tela.
 */
function buffersDasMascaras(mascaras) {
  const lista = [];
  Object.values(mascaras.rotacoes).forEach((m) => {
    if (!m) return;
    [m.topo, m.base, m.desenho, m.cheio].forEach((a) => { if (a) lista.push(a.buffer); });
  });
  return lista;
}

self.onmessage = async (evento) => {
  const { tipo, id, pixels, forcar, cols, rows, passo, raio, contorno } = evento.data;
  let { largura, altura } = evento.data;

  try {
    if (tipo === "fundo") {
      // Dois jeitos de receber a arte:
      //
      //   `pixels`  os bytes já lidos pela página (caminho antigo);
      //   `bitmap`  o ImageBitmap transferido, e a leitura acontece AQUI.
      //
      // O segundo existe porque ler 29 megapixels na página custava 1,2 a 1,8 s
      // de thread travada por arte. O aviso do topo deste arquivo continua
      // valendo — o Chrome REDUZ um ImageBitmap com conta diferente de um
      // <img> —, mas aqui não há redução nenhuma: o desenho é 1:1, no tamanho
      // exato do bitmap, então os bytes saem idênticos aos que a página leria.
      let px, w = largura, h = altura;
      if (evento.data.bitmap) {
        const bmp = evento.data.bitmap;
        w = bmp.width; h = bmp.height;
        const lona = new OffscreenCanvas(w, h);
        const pincel = lona.getContext("2d", { willReadFrequently: true });
        pincel.drawImage(bmp, 0, 0);        // 1:1, sem redimensionar
        px = pincel.getImageData(0, 0, w, h).data;
        bmp.close();
      } else {
        px = new Uint8ClampedArray(pixels);
      }
      const mexeu = tirarFundoDosPixels(px, w, h, forcar);
      if (!mexeu) {
        // Nada a tirar: a página fica com a imagem original que já tem.
        self.postMessage({ tipo: "fundo", id, semMudanca: true });
        return;
      }
      largura = w; altura = h;
      // Só aqui entra canvas, e sem redimensionar nada: é putImageData e PNG,
      // que são exatos. O PNG volta como blob — sai menor e mais rápido que a
      // imagem em base64, e a página vira endereço com URL.createObjectURL.
      const canvas = new OffscreenCanvas(largura, altura);
      const ctx = canvas.getContext("2d");
      ctx.putImageData(new ImageData(px, largura, altura), 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      self.postMessage({ tipo: "fundo", id, blob, apagados: mexeu.apagados, cor: mexeu.cor });
      return;
    }

    if (tipo === "mascaras") {
      const silhueta = contorno === "caixa"
        // Peça marcada como retângulo: não há silhueta para ler.
        ? { bits: new Uint8Array(cols * rows).fill(1), modo: "caixa" }
        : silhuetaDeDados(new Uint8ClampedArray(pixels), cols, rows);
      const mascaras = mascarasDeSilhueta(silhueta, cols, rows, passo, raio);
      self.postMessage({ tipo: "mascaras", id, mascaras }, buffersDasMascaras(mascaras));
      return;
    }
  } catch (erro) {
    self.postMessage({ tipo: "falhou", id, erro: String((erro && erro.message) || erro) });
  }
};
