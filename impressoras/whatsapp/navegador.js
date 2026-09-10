/**
 * ===========================================================================
 * NAVEGADOR — onde o bot acha um Chrome para abrir
 * ===========================================================================
 *
 * O `whatsapp-web.js` roda o WhatsApp Web dentro de um Chrome invisível. Esse
 * Chrome tem que vir de algum lugar, e a escolha do lugar é o que decide o
 * tamanho do instalador.
 *
 * O sistema de onde este módulo foi portado embutia o Chrome do Puppeteer no
 * pacote: 409 MB, mais do que o resto do programa inteiro junto. Aqui não. O
 * Puppeteer não guarda o navegador dentro do `node_modules`, e sim no perfil
 * de quem instalou (`%USERPROFILE%\\.cache\\puppeteer`) — então ele nunca
 * entraria no instalador sozinho, e fazê-lo entrar seria dobrar o download de
 * todo mundo para um recurso que muita gente não liga.
 *
 * A saída é que o Windows já tem um Chromium: o Edge vem com o sistema. Então
 * este arquivo procura, nesta ordem:
 *
 *   1. `OPTIMIZE_CHROME` — para quem quer mandar num executável específico;
 *   2. o Chrome baixado pelo Puppeteer, se existir (é o caso da máquina de
 *      quem desenvolve, e é o mais testado com a biblioteca);
 *   3. o Google Chrome instalado;
 *   4. o Microsoft Edge, que praticamente toda máquina Windows tem.
 *
 * Não achando nenhum, devolve `null` — e quem chama transforma isso numa
 * mensagem que diz o que fazer, em vez de um erro de dentro do Puppeteer que
 * não significa nada para quem está olhando a tela.
 */

const fs = require("fs");
const path = require("path");

/** Os lugares onde o Windows põe um Chromium instalado. */
function caminhosDoSistema() {
  const programas = [
    process.env["PROGRAMFILES"],
    process.env["PROGRAMFILES(X86)"],
    process.env["LOCALAPPDATA"],
  ].filter(Boolean);

  const relativos = [
    path.join("Google", "Chrome", "Application", "chrome.exe"),
    path.join("Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  const achados = [];
  for (const relativo of relativos) {
    for (const base of programas) achados.push(path.join(base, relativo));
  }
  return achados;
}

/** O Chrome que o Puppeteer baixou, quando ele existe. */
function caminhoDoPuppeteer() {
  try {
    // O `require` fica aqui dentro de propósito: sem o navegador baixado, o
    // `executablePath()` do Puppeteer lança, e isso não pode derrubar quem só
    // queria saber se existe um navegador.
    const puppeteer = require("puppeteer");
    return puppeteer.executablePath();
  } catch {
    return null;
  }
}

/**
 * O caminho do navegador, ou `null` se não houver nenhum.
 *
 * Não guarda o resultado em cache: alguém pode instalar o Edge com o servidor
 * de pé, e a resposta desta função é lida uma vez por tentativa de conexão —
 * não é caminho quente.
 */
function acharNavegador() {
  const escolhido = process.env.OPTIMIZE_CHROME;
  if (escolhido && fs.existsSync(escolhido)) return escolhido;

  const doPuppeteer = caminhoDoPuppeteer();
  if (doPuppeteer && fs.existsSync(doPuppeteer)) return doPuppeteer;

  for (const caminho of caminhosDoSistema()) {
    if (fs.existsSync(caminho)) return caminho;
  }
  return null;
}

/** O recado para a tela quando não há navegador nenhum. */
const RECADO_SEM_NAVEGADOR =
  "Não encontrei um navegador para o bot usar. Instale o Google Chrome " +
  "(ou o Microsoft Edge) nesta máquina, ou aponte a variável OPTIMIZE_CHROME " +
  "para o executável de um Chromium já instalado.";

module.exports = { acharNavegador, RECADO_SEM_NAVEGADOR };
