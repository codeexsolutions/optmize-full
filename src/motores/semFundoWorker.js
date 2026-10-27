/**
 * O worker do Exportar e da entrada: tira o fundo da arte original (ver o
 * cabeçalho de `semFundo.js`). Recebe `{ id, blob, forcar, teto }` e responde
 * em até duas mensagens:
 *
 *   `{ id, previa }`   a arte sem fundo, reduzida ao `teto`, para a tela e a
 *                      silhueta do encaixe — chega ANTES do PNG;
 *   `{ id, blob }`     o PNG do PDF (`null` quando não havia fundo para tirar);
 *   `{ id, erro }`     no lugar do `blob`, com o nome do erro, para a tela
 *                      continuar sabendo dizer que o arquivo mudou no disco.
 */
import { semFundoDoArquivo } from "./semFundo";

self.onmessage = async ({ data: { id, blob, forcar, teto } }) => {
  try {
    const png = await semFundoDoArquivo(blob, forcar, teto || 0,
      (previa) => self.postMessage({ id, previa }, [previa]));
    self.postMessage({ id, blob: png });
  } catch (erro) {
    self.postMessage({ id, erro: { name: erro && erro.name, message: (erro && erro.message) || String(erro) } });
  }
};
