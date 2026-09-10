/**
 * ===========================================================================
 * ARQUIVOS ENVIADOS — o que é comum a moldes e a projetos
 * ===========================================================================
 *
 * As duas áreas guardam imagem em disco e o nome dela numa tabela. As duas
 * precisam das mesmas três coisas, e as duas tinham escrito as três à mão:
 *
 *   1. saber o tipo do arquivo pelos primeiros bytes, e não pela extensão que
 *      o navegador disse (a extensão mente, o cabeçalho não);
 *   2. inventar um nome que não colida com o de mais ninguém;
 *   3. apagar do disco o que saiu do banco — sem apagar o que outro registro
 *      ainda está usando.
 *
 * O item 3 é o delicado, e é por ele que este arquivo existe: a conferência
 * tem de ser contra a tabela INTEIRA, e não contra a lista que acabou de sair.
 * A mesma imagem pode ter sido reaproveitada em outro registro, e apagá-la
 * pelo nome antigo deixaria o outro sem arte. As duas cópias acertavam isso,
 * mas duas cópias querem dizer dois lugares para errar da próxima vez.
 */

const fs = require("fs");
const path = require("path");
const { pastaDeUploads } = require("./caminhos");

/** O tipo lido dos primeiros bytes do arquivo. `null` = não reconhecido. */
function extensaoDaImagem(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return "jpg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF"
    && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (b.length > 6 && b.toString("ascii", 0, 3) === "GIF") return "gif";
  return null;
}

/**
 * Um nome de arquivo que não colide.
 *
 * Leva o id do dono e o instante, mais um sufixo sorteado: duas artes enviadas
 * no mesmo milissegundo pelo mesmo molde disputariam o mesmo nome sem ele.
 */
function nomeDeArquivo(prefixo, extensao) {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
}

/**
 * Apaga do disco o que não está mais em nenhuma linha da tabela.
 *
 * `consultaEmUso` é uma consulta já preparada que devolve `{ arquivo }` de
 * TODAS as linhas vivas — não só das que acabaram de mudar. Ver o comentário
 * do topo: é essa diferença que impede apagar a arte de outro registro.
 */
function limparImagensSoltas(pasta, consultaEmUso, arquivos) {
  if (!arquivos || arquivos.length === 0) return;
  const emUso = new Set(consultaEmUso.all().map((r) => r.arquivo));
  [...new Set(arquivos)].forEach((arquivo) => {
    if (!arquivo || emUso.has(arquivo)) return;
    try {
      fs.unlinkSync(path.join(pasta, arquivo));
    } catch (e) {
      // já não estava lá: o fim que se queria, por outro caminho
    }
  });
}

module.exports = { extensaoDaImagem, nomeDeArquivo, limparImagensSoltas, pastaDeUploads };
