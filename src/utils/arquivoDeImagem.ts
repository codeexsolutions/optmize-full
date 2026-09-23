/**
 * Abrir a imagem que a pessoa escolheu no disco — e devolvê-la em arquivo.
 *
 * São pontes curtas entre o `<input type="file">`, o `<img>` e o `<canvas>`,
 * e vivem aqui porque mais de um caminho precisa das mesmas. Vieram de
 * `public/encaixe.js`, sem mudança. (Nasceram para as telas de Vetor e Imagem,
 * que saíram do programa em 2026-09-21; quem as usa hoje é a arte do molde, o
 * Encaixe e a leitura de PDF.)
 *
 * Não entram em `motores/`: mexem com `Image`, `FileReader` e `canvas`, que só
 * existem na página. A regra da pasta dos motores é conta pura, sem DOM.
 */

/**
 * Canvas para blob, que é `toBlob` com cara de promessa.
 *
 * Moravam duas cópias desta função no projeto, uma em `exportarEncaixe.js` e
 * outra em `pdfParaArte.js`. Ela não pode morar em nenhuma das duas: a
 * primeira já importa a segunda, e devolver a importação fecharia um ciclo
 * entre os dois módulos para pegar cinco linhas emprestadas.
 *
 * A MENSAGEM É A DO EXPORTAR, das duas que existiam, porque é a que diz a
 * causa: `toBlob` devolve `null` quando o canvas passa do que o navegador
 * guarda como imagem, e é isso que acontece com um risco de muitos metros.
 * "Não consegui gravar a arte desenhada" mandaria procurar no disco.
 */
export function paraBlob(canvas: HTMLCanvasElement, tipo = "image/png"): Promise<Blob> {
  return new Promise((pronto, falhou) => {
    canvas.toBlob(
      (blob) => (blob
        ? pronto(blob)
        : falhou(new Error("A arte excedeu a capacidade de imagem do navegador."))),
      tipo,
    );
  });
}

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
