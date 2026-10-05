/**
 * ===========================================================================
 * O CARIMBO DO FONTE — de qual `src/` saiu o `dist/`
 * ===========================================================================
 *
 * O servidor serve o `dist/` compilado, e a `bancada:tela` confere a tela por
 * ele — não pelo `src/`. Um `dist/` velho passa na bancada testando código que
 * não é mais o de hoje (aconteceu: dias de mudanças "conferidas" contra um
 * build de antes delas).
 *
 * Data de arquivo não resolve: `git checkout` dá data de agora a um `dist/`
 * antigo. Então o build grava aqui o hash do CONTEÚDO do fonte
 * (`dist/carimbo.json`, ver `vite.config.mts`), e a bancada refaz a conta e
 * compara.
 *
 * O fim de linha é normalizado antes do hash: com `core.autocrlf` o mesmo
 * commit tem CRLF numa máquina e LF na outra, e o carimbo não pode depender
 * disso.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/** O que entra no build da tela e muda o que ela faz. */
const FONTES = ["src", "index.html"];

function arquivosDe(raiz, relativo, saida) {
  const absoluto = path.join(raiz, relativo);
  if (!fs.existsSync(absoluto)) return saida;
  if (fs.statSync(absoluto).isDirectory()) {
    for (const nome of fs.readdirSync(absoluto)) arquivosDe(raiz, `${relativo}/${nome}`, saida);
  } else {
    saida.push(relativo);
  }
  return saida;
}

function carimboDoFonte(raiz) {
  const hash = crypto.createHash("sha256");
  const arquivos = FONTES.flatMap((f) => arquivosDe(raiz, f, [])).sort();
  for (const relativo of arquivos) {
    const conteudo = fs.readFileSync(path.join(raiz, relativo)).toString("latin1").replace(/\r\n/g, "\n");
    hash.update(`${relativo}\0${conteudo.length}\0`);
    hash.update(conteudo, "latin1");
  }
  return hash.digest("hex");
}

module.exports = { carimboDoFonte, FONTES };
