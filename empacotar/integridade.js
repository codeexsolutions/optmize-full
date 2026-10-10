/**
 * ===========================================================================
 * A IMPRESSÃO DIGITAL DO QUE VAI NO INSTALADOR
 * ===========================================================================
 *
 * Roda depois do `compilar.js`, quando `src-tauri/servidor/` já está como vai
 * para o cliente. Escreve `src-tauri/integridade.txt`: o SHA-256 de cada
 * arquivo que tem código — o servidor em bytecode, o Node, as dependências,
 * a interface.
 *
 * O `main.rs` embute esse arquivo no executável (`include_str!`) e, ao abrir,
 * confere a instalação contra ele. Um arquivo trocado — o `servidor.jsc`
 * remendado para pular a conta, uma dependência mexida, outro `node.exe` — e
 * o programa não sobe. Para burlar a conta, alguém teria de remendar o
 * próprio executável nativo, e não um arquivo de texto ao lado dele.
 *
 * Fica de fora o que não é código: modelos de IA, imagens, fontes. Mexer
 * neles não destrava nada, e conferir centenas de MB a cada abertura custaria
 * tempo de quem só quer trabalhar.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.join(__dirname, "..");
const PACOTE = path.join(RAIZ, "src-tauri", "servidor");
const SAIDA = path.join(RAIZ, "src-tauri", "integridade.txt");

/** As extensões que carregam código, em qualquer pasta do pacote. */
const CODIGO = new Set([
  ".js", ".cjs", ".mjs", ".jsc", ".json", ".node", ".exe", ".dll", ".wasm", ".html",
]);

function arquivos(pasta) {
  const lista = [];
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) lista.push(...arquivos(caminho));
    else if (CODIGO.has(path.extname(item.name).toLowerCase())) lista.push(caminho);
  }
  return lista;
}

function principal() {
  if (!fs.existsSync(path.join(PACOTE, "servidor", "servidor.jsc"))) {
    console.error("integridade: o servidor ainda não está em bytecode."
      + " Rode o preparar.js e o compilar.js antes.");
    process.exit(1);
  }

  const linhas = arquivos(PACOTE)
    .map((caminho) => {
      const soma = crypto.createHash("sha256").update(fs.readFileSync(caminho)).digest("hex");
      // Barra normal: é o que o Rust junta ao caminho, e funciona no Windows.
      const relativo = path.relative(PACOTE, caminho).split(path.sep).join("/");
      // Uma linha por arquivo: um nome com quebra de linha quebraria a leitura.
      if (relativo.includes("\n")) throw new Error(`nome de arquivo com quebra de linha: ${relativo}`);
      return `${soma} ${relativo}`;
    })
    .sort();

  fs.writeFileSync(SAIDA, linhas.join("\n") + "\n");
  console.log(`integridade: ${linhas.length} arquivos de código conferidos a cada abertura`);
}

principal();
