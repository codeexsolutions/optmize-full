/**
 * ===========================================================================
 * A PASTA DE SAÍDA — onde os arquivos exportados ficam
 * ===========================================================================
 *
 * Exportar era `<a download>`: o navegador escolhia a pasta, o arquivo sumia
 * dentro de "Downloads" no meio de tudo, e — o que importa aqui — a tela não
 * tinha como dizer para ONDE ele foi. No aplicativo instalado (Tauri) isso
 * fica pior ainda: a janela não tem barra de downloads para mostrar o que
 * acabou de cair.
 *
 * Então a saída passa a ser um lugar conhecido, do programa, e o programa abre
 * esse lugar no Explorer com o arquivo já selecionado. Quem exporta VÊ o
 * arquivo, e sabe voltar nele amanhã sem perguntar para ninguém.
 *
 * O lugar é `exportado/`, dentro da pasta de dados (ver `caminhos.js`): pasta
 * do projeto quando roda pelo código, pasta do usuário no app instalado. É a
 * mesma que as planilhas das impressoras já usam.
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { pastaDeDados } = require("./caminhos");

/** A pasta de saída, criada na primeira vez que alguém pergunta por ela. */
function pastaDeSaida(...partes) {
  return pastaDeDados("exportado", ...partes);
}

/**
 * Um nome que ainda não existe na pasta.
 *
 * Dois encaixes com o mesmo consumo saem com o mesmo nome — acontece o tempo
 * todo quando se refaz um risco —, e sobrescrever em silêncio apagaria o que a
 * pessoa acabou de mandar para a impressão. Vira "encaixe-5,32m (2).pdf".
 */
function nomeLivre(pasta, nome) {
  const ext = path.extname(nome);
  const base = path.basename(nome, ext);
  let tentativa = path.join(pasta, nome);
  let n = 2;
  while (fs.existsSync(tentativa)) {
    tentativa = path.join(pasta, `${base} (${n}).${ext.replace(/^\./, "")}`);
    n++;
  }
  return tentativa;
}

/**
 * Tira do nome o que o Windows não aceita em arquivo.
 *
 * O nome vem da tela ("encaixe-5,32m"), e a vírgula é de propósito; o que não
 * pode passar são `\ / : * ? " < > |`.
 */
function nomeLimpo(nome, extensaoPadrao) {
  const limpo = String(nome || "").replace(/[\/:*?"<>|]/g, "-").trim();
  const seguro = limpo || "exportado";
  return path.extname(seguro) ? seguro : `${seguro}.${extensaoPadrao}`;
}

/**
 * Abre o Explorer na pasta, com o arquivo selecionado.
 *
 * É conveniência, não parte do trabalho: se não abrir, o arquivo já está no
 * lugar e o caminho vai na resposta — a tela mostra o caminho de qualquer
 * jeito. Por isso o erro é engolido, e por isso só o Windows tenta (é onde o
 * programa roda; noutro sistema a resposta com o caminho basta).
 */
function revelar(caminho) {
  if (process.platform !== "win32") return;
  // A bancada exporta de verdade, e sem isto cada conferência abriria uma
  // janela do Explorer na cara de quem está rodando os testes.
  if (process.env.OPTIMIZE_SEM_EXPLORER) return;
  try {
    execFile("explorer.exe", ["/select,", caminho], () => {});
  } catch { /* segue sem abrir */ }
}

/**
 * Guarda um arquivo pronto na saída e mostra onde ele caiu.
 * Devolve `{ caminho, pasta, nome }` para a tela repetir o endereço.
 */
function guardarNaSaida(nome, conteudo, extensaoPadrao) {
  const pasta = pastaDeSaida();
  const destino = nomeLivre(pasta, nomeLimpo(nome, extensaoPadrao));
  fs.writeFileSync(destino, conteudo);
  revelar(destino);
  return { caminho: destino, pasta, nome: path.basename(destino) };
}

/**
 * O pedido veio DESTA máquina?
 *
 * O servidor escuta em 0.0.0.0: o painel também abre do computador do lado.
 * E aí a pasta de saída deixa de fazer sentido — o arquivo cairia no disco de
 * quem serve, não no de quem exportou, e o Explorer abriria numa tela que a
 * pessoa não está olhando. Nesse caso a exportação volta a ser download, que é
 * a única entrega possível pela rede.
 *
 * No uso normal (o app do Tauri falando com o servidor que ele mesmo subiu, em
 * 127.0.0.1) isto é sempre verdadeiro.
 */
function pedidoDaMesmaMaquina(req) {
  const de = String(req.socket.remoteAddress || "");
  return de === "127.0.0.1" || de === "::1" || de === "::ffff:127.0.0.1";
}

module.exports = {
  pastaDeSaida, nomeLivre, nomeLimpo, revelar, guardarNaSaida, pedidoDaMesmaMaquina,
};
