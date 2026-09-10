/**
 * ===========================================================================
 * O NOME DO ARQUIVO — quantas peças ele está pedindo
 * ===========================================================================
 *
 * "costas 5x.png" quer dizer cinco costas. É o jeito como esta loja nomeia
 * arquivo desde antes do programa existir, e reconhecê-lo poupa digitar a
 * quantidade peça por peça num marcador de trinta arquivos.
 *
 * O cuidado que o código tem, e que parece detalhe até o dia em que morde: uma
 * MEDIDA no nome ("bandeira 30x40") tem número dos dois lados do "x" e não é
 * quantidade nenhuma. Ela é mascarada antes da procura.
 *
 * Estava dentro do `producao/controlador.js`. Desceu para os motores quando a
 * tela de Moldes saiu de lá: é conta pura sobre um texto, e as duas telas
 * (Moldes e Encaixe) precisam da mesma leitura — duas cópias dela dariam
 * quantidades diferentes para o mesmo arquivo conforme a porta de entrada.
 */

const PADROES_QTD = [
  /(^|[^\d])(\d{1,4})\s*[xX](?=$|[\s._\-)\]])/,   // "5x", "12 x", "costas-8x", "manga4x"
  /(^|[^\d\0])[xX]\s*(\d{1,4})(?=$|[\s._\-)\]])/, // "x5", "x 12"
];

export function lerQuantidadeDoNome(nomeArquivo) {
  // Primeiro mascara as medidas ("30x40", "30 x 40"): elas têm número dos dois
  // lados do x e não são quantidade. O \0 ocupa o mesmo tanto de caracteres,
  // então as posições continuam valendo no nome original.
  const semMedidas = nomeArquivo.replace(/\d+\s*[xX]\s*\d+/g, (medida) => "\0".repeat(medida.length));

  for (const padrao of PADROES_QTD) {
    const achado = semMedidas.match(padrao);
    if (!achado) continue;
    const qtd = Number(achado[2]);
    if (!qtd || qtd < 1) continue;

    const inicio = achado.index + achado[1].length; // achado[1] é a borda, fica no nome
    const nome = (nomeArquivo.slice(0, inicio) + nomeArquivo.slice(achado.index + achado[0].length))
      .replace(/\(\s*\)|\[\s*\]/g, "")   // sobrou "()" vazio depois de tirar o "4x"
      .replace(/[\s._\-]{2,}/g, " ")
      .replace(/^[\s._\-]+|[\s._\-]+$/g, "")
      .trim();
    // "5x (1).jpg" deixaria a peça chamada "(1)", que não diz nada. Quando o
    // que sobra é só pontuação e número de cópia, o nome do arquivo inteiro
    // informa mais.
    const temPalavra = /[a-zA-ZÀ-ÿ]/.test(nome);
    return { nome: temPalavra ? nome : nomeArquivo, qtd, veioDoArquivo: true };
  }
  return { nome: nomeArquivo, qtd: 1, veioDoArquivo: false };
}

/**
 * Carrega uma arte em PNG/JPG.
 *
 * A medida em centímetros vem da resolução gravada no arquivo (o dpi), e não
 * de um valor digitado: é a única informação do arquivo que diz o tamanho de
 * verdade. Quando o arquivo não traz essa informação, vale 300 dpi — o padrão
 * de arte para impressão — e a linha na tabela avisa que foi suposto.
 *
 * O fundo em volta da arte é apagado aqui, antes de tudo: assim a mesma
 * imagem serve para o encaixe, para o desenho e para o PDF sem a moldura
 * branca em volta.
 */
/**
 * A primeira metade: abre o arquivo e decodifica a imagem, sem tocar no fundo.
 *
 * A separação existe para o fundo poder ser tirado de todos os arquivos de uma
 * vez, nos workers, em vez de um por um aqui na tela.
 */
async function lerImagemCrua(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ppcmDoArquivo = pixelsPorCmDoArquivo(bytes);
  // Bitmap, e não <img> com data URL: a arte de impressão passa de 29
  // megapixels, e num <img> a decodificação cai na thread da tela no primeiro
  // `drawImage` — 1,2 a 1,8 s por arquivo, travando a página. O endereço vem
  // do próprio arquivo, para a miniatura da tabela ter o que mostrar.
  const endereco = URL.createObjectURL(file);
  const ppcm = ppcmDoArquivo || PPCM_PADRAO;
  // O teto sai da medida real da arte: os centímetros dela vezes o dpi que o
  // PDF consegue imprimir. Sem as medidas no cabeçalho não há teto, e o
  // arquivo entra inteiro como antes.
  const m = medidasDoArquivo(bytes);
  const teto = m ? ladoDeTrabalho(Math.max(m.largura, m.altura) / ppcm) : 0;
  const img = await criarBitmapOuImagem(file, endereco, teto)
    .catch(() => { throw new Error(`"${file.name}" não parece ser uma imagem válida.`); });
  return {
    file, img, endereco, ppcm, ppcmDoArquivo,
    pxOriginal: m || { largura: img.naturalWidth || img.width, altura: img.naturalHeight || img.height },
  };
}

/**
 * A segunda metade: com o fundo já resolvido, monta a peça.
 *
 * `semFundo` é o que o preparo devolveu — `null` quando não havia fundo para
 * tirar, e nesse caso a imagem original é que vale.
 */
async function montarPecaDaImagem(cru, semFundo, imagemPronta = null) {
  const { file, ppcm, ppcmDoArquivo } = cru;
  // `imagemPronta` é o bitmap que a leitura já decodificou, quando ele ainda
  // está vivo — é o caminho de quando a peça entra na tabela antes de o fundo
  // sair, e é o que evita decodificar 30 megapixels de novo só para a linha
  // aparecer.
  //
  // Sem ele: com recorte, vale o blob que o worker devolveu (é pequeno); sem
  // recorte, o bitmap original já foi transferido ao worker e fechado, então
  // refaz-se do próprio arquivo.
  const img = imagemPronta
    || (semFundo
      ? await criarBitmapOuImagem(semFundo.blob, semFundo.src)
      : await criarBitmapOuImagem(file, cru.endereco));
  // O desenho usa os pixels do bitmap; a miniatura da tabela é um <img> e
  // precisa de um endereço. Mesma arte, dois caminhos.
  const endereco = semFundo ? semFundo.src : cru.endereco;

  const doNome = lerQuantidadeDoNome(file.name.replace(/\.[^.]+$/, ""));
  const dpi = Math.round(ppcm * 2.54);
  return {
    id: proximoIdPeca++,
    nome: doNome.nome,
    src: endereco,
    miniatura: miniaturaDaArte(img),
    img,
    pxW: img.naturalWidth || img.width,
    pxH: img.naturalHeight || img.height,
    // A medida vem do ARQUIVO, não do bitmap: ele pode ter sido decodificado
    // reduzido (ver `ladoDeTrabalho`), e medir o reduzido daria uma peça menor
    // do que ela é. Foi exatamente esse erro, por outra causa, que fazia uma
    // camiseta de 49,3 cm entrar como 15,2 cm.
    largura: arredondar(cru.pxOriginal.largura / ppcm),
    altura: arredondar(cru.pxOriginal.altura / ppcm),
    qtd: doNome.qtd,
    qtdDoArquivo: doNome.veioDoArquivo,
    giro: giroPadrao(),
    contorno: "auto", // "auto" lê a silhueta da arte; "caixa" usa o retângulo
    origem: `${dpi} dpi${ppcmDoArquivo ? "" : " (suposto)"}${semFundo ? " · fundo removido" : ""}`,
  };
}

// Quem sabe abrir cada formato é o `moldes.js`; aqui só interessa saber se o
// arquivo é vetorial (a leitura em si passa por `lerMoldeVetorial`).
