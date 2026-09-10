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
