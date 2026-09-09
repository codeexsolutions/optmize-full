/**
 * ===========================================================================
 * CAMINHOS — onde ficam o banco e as imagens
 * ===========================================================================
 *
 * Rodando por `npm start`, tudo mora na própria pasta do projeto: o
 * `dados.db` e a pasta `uploads/` ficam ao lado do código, que é o mais
 * prático para desenvolver.
 *
 * Instalado (o app do Tauri), isso não serve: o programa fica em
 * `C:\Program Files\...`, que é somente-leitura para quem usa. Gravar o
 * banco ali falha — ou, pior, o Windows redireciona a escrita para uma
 * pasta virtual e os dados somem quando o app é atualizado.
 *
 * Por isso o app instalado passa `OPTIMIZE_DADOS` apontando para a pasta de
 * dados do usuário. Sem a variável, nada muda: continua tudo na pasta do
 * projeto, do jeito que sempre foi.
 */

const fs = require("fs");
const path = require("path");

const RAIZ = process.env.OPTIMIZE_DADOS
  ? path.resolve(process.env.OPTIMIZE_DADOS)
  : __dirname;

fs.mkdirSync(RAIZ, { recursive: true });

/** O arquivo SQLite. */
const ARQUIVO_DO_BANCO = path.join(RAIZ, "dados.db");

/** A raiz das imagens enviadas — a que o Express publica em /uploads. */
const RAIZ_DE_UPLOADS = path.join(RAIZ, "uploads");

/** Garante que a pasta existe e devolve o caminho dela. */
function pastaDeUploads(...partes) {
  const caminho = path.join(RAIZ_DE_UPLOADS, ...partes);
  fs.mkdirSync(caminho, { recursive: true });
  return caminho;
}

/**
 * Uma pasta de dados que não é upload de imagem: a sessão do WhatsApp, as
 * planilhas exportadas antes de desativar uma impressora, o estado da
 * varredura de cancelamento da 02. Mesma regra do resto — pasta do projeto
 * rodando pelo código, pasta do usuário no app instalado.
 */
function pastaDeDados(...partes) {
  const caminho = path.join(RAIZ, ...partes);
  fs.mkdirSync(caminho, { recursive: true });
  return caminho;
}

/**
 * Um arquivo de configuração que o programa reescreve em execução (hoje só o
 * `config/whatsapp.json`). Não vem semente nenhuma no pacote: quem não achar
 * o arquivo usa os próprios padrões e grava na primeira alteração. É de
 * propósito — a lista de impressoras nasce da varredura da rede, nunca de um
 * arquivo escrito à mão.
 */
function arquivoDeConfig(nome) {
  return path.join(pastaDeDados("config"), nome);
}

module.exports = {
  RAIZ,
  ARQUIVO_DO_BANCO,
  RAIZ_DE_UPLOADS,
  pastaDeUploads,
  pastaDeDados,
  arquivoDeConfig
};
