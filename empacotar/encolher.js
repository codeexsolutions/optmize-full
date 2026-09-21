#!/usr/bin/env node
/**
 * ===========================================================================
 * O ENCOLHEDOR EM WEBASSEMBLY — compila `wasm-encolher/` e gera a cola
 * ===========================================================================
 *
 *   npm run build:encolher
 *
 * Sai em `src/motores/encolher/`: o `encolher_bg.wasm` e o `encolher.js` que o
 * wasm-bindgen escreve para carregá-lo. Os dois são VERSIONADOS, como o
 * `estatico/encaixe.wasm`: o build do programa não precisa de Rust, e só quem
 * mexer na crate roda isto.
 *
 * Por que eles moram em `src/` e não em `estatico/`, como o `encaixe.wasm`: a
 * cola do wasm-bindgen acha o `.wasm` por `new URL("encolher_bg.wasm",
 * import.meta.url)`, e o Vite reconhece esse padrão — empacota o arquivo com
 * um hash no nome. O nome muda quando o conteúdo muda, e o navegador não fica
 * preso num `.wasm` velho do cache (foi o defeito do cache do WASM, achado na
 * migração: ver docs/ARQUITETURA.md).
 *
 * POR QUE O wasm-bindgen, e não o cabeçalho de memória do `encaixe.wasm`
 * ---------------------------------------------------------------------------
 * O `encaixe.wasm` é nosso, escrito para não importar nada. O sparrow não: o
 * relógio dele (`web_time`) e o sorteio (`getrandom`) conversam com o
 * JavaScript pela ponte do wasm-bindgen. Sem a cola, o `.wasm` pede funções
 * que ninguém fornece.
 *
 * A VERSÃO TEM QUE BATER
 * ----------------------
 * A ferramenta `wasm-bindgen` precisa ser exatamente a versão da crate
 * `wasm-bindgen` que o `Cargo.lock` resolveu — senão ela recusa o arquivo, ou,
 * pior, gera uma cola que não casa com ele. A versão é lida do próprio
 * `Cargo.lock`, e o erro diz o comando que instala a certa.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CRATE = path.join(RAIZ, "wasm-encolher");
const SAIDA = path.join(RAIZ, "src", "motores", "encolher");
const WASM_CRU = path.join(CRATE, "target", "wasm32-unknown-unknown", "release", "encolher.wasm");

function rodar(programa, argumentos, onde) {
  execFileSync(programa, argumentos, { cwd: onde || RAIZ, stdio: "inherit" });
}

function versaoDoLock() {
  const lock = fs.readFileSync(path.join(CRATE, "Cargo.lock"), "utf8");
  const achado = lock.match(/name = "wasm-bindgen"\r?\nversion = "([^"]+)"/);
  if (!achado) throw new Error("o Cargo.lock não tem a crate wasm-bindgen — a crate compilou?");
  return achado[1];
}

function versaoDaFerramenta() {
  try {
    return execFileSync("wasm-bindgen", ["--version"], { encoding: "utf8" })
      .trim().split(/\s+/).pop();
  } catch {
    return null;
  }
}

function main() {
  console.log("compilando wasm-encolher (wasm32-unknown-unknown, release)...");
  rodar("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown"], CRATE);

  const precisa = versaoDoLock();
  const tem = versaoDaFerramenta();
  if (tem !== precisa) {
    console.error(`\nA ferramenta wasm-bindgen ${tem ? `é a ${tem}` : "não está instalada"};`
      + ` o Cargo.lock pede a ${precisa}. Instale a certa e rode de novo:\n`
      + `\n  cargo install wasm-bindgen-cli --version ${precisa} --locked\n`);
    process.exit(1);
  }

  fs.mkdirSync(SAIDA, { recursive: true });
  rodar("wasm-bindgen", ["--target", "web", "--no-typescript",
    "--out-dir", SAIDA, "--out-name", "encolher", WASM_CRU]);

  // Carimbo no topo da cola: quem abrir o arquivo tem de saber que ele é gerado.
  const cola = path.join(SAIDA, "encolher.js");
  const carimbo = "/* GERADO por `npm run build:encolher` (wasm-bindgen "
    + `${precisa}) a partir de wasm-encolher/. Não editar à mão. */\n`;
  const texto = fs.readFileSync(cola, "utf8");
  if (!texto.startsWith("/* GERADO")) fs.writeFileSync(cola, carimbo + texto, "utf8");

  const kb = (fs.statSync(path.join(SAIDA, "encolher_bg.wasm")).size / 1024).toFixed(0);
  console.log(`pronto: src/motores/encolher/encolher.js + encolher_bg.wasm (${kb} KB)`);
}

main();
