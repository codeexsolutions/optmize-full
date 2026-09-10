/**
 * Abrir a imagem que a pessoa escolheu no disco.
 *
 * São duas pontes curtas entre o `<input type="file">` e o `<img>`, e elas
 * vivem aqui porque as telas de Vetor, Imagem e arte do molde precisam das
 * mesmas duas. Vieram de `public/encaixe.js`, sem mudança.
 *
 * Não entram em `motores/`: mexem com `Image` e `FileReader`, que só existem na
 * página. A regra da pasta dos motores é conta pura, sem DOM.
 */

/** Uma `<img>` já carregada, a partir de um endereço. */
export function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((pronto, falhou) => {
    const img = new Image();
    img.onload = () => pronto(img);
    img.onerror = () => falhou(new Error("Não consegui desenhar a imagem."));
    img.src = src;
  });
}

/**
 * O arquivo escolhido no disco, lido como endereço `data:`.
 *
 * `carregarImagem` precisa de um endereço, e um `File` não tem nenhum. É a
 * ponte entre os dois.
 *
 * `URL.createObjectURL` também serviria e gastaria menos memória, mas devolve
 * um endereço que morre se ninguém revogar — e estas telas seguram a imagem
 * enquanto durar o ajuste. Um endereço que se sustenta sozinho evita a imagem
 * sumir no meio do caminho.
 */
export function lerComoDataURL(file: File): Promise<string> {
  return new Promise((pronto, falhou) => {
    const leitor = new FileReader();
    leitor.onload = () => pronto(String(leitor.result));
    leitor.onerror = () => falhou(new Error("Não consegui ler o arquivo."));
    leitor.readAsDataURL(file);
  });
}
