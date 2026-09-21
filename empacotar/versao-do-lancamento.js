#!/usr/bin/env node
/**
 * ===========================================================================
 * O NÚMERO DA VERSÃO DE UM LANÇAMENTO AUTOMÁTICO
 * ===========================================================================
 *
 * Roda no lançamento automático (`.github/workflows/lancar.yml`), antes do
 * `build:app`. Escreve a versão em `tauri.conf.json`, `package.json` e
 * `src-tauri/Cargo.toml` — só na cópia do GitHub; nada volta para o
 * repositório.
 *
 *     versão = <maior>.<menor>.<quantos commits a main tem>
 *
 * POR QUE A CONTAGEM DE COMMITS
 * -----------------------------
 * O atualizador instala o que tiver número MAIOR que o instalado. Então cada
 * lançamento precisa de um número novo, e ninguém vai lembrar de aumentar à mão
 * a cada merge — foi para não depender disso que o lançamento ficou automático.
 * A contagem de commits da main só cresce, é a mesma para o mesmo commit (rodar
 * de novo dá o mesmo número) e não exige commit de volta, que brigaria com quem
 * estivesse puxando a main na hora.
 *
 * O `<maior>.<menor>` continua vindo do `tauri.conf.json`: mudar para 1.1 é
 * decisão de gente, e a partir dali a contagem segue como 1.1.<commits>.
 *
 * A TRAVA: se a conta der um número MENOR que o do arquivo, para. Aconteceria
 * se alguém subisse a versão à mão para além da contagem — e aí todo lançamento
 * automático sairia com número menor que o já instalado, e nenhuma máquina
 * aceitaria atualizar, sem erro nenhum aparecer.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CONF = path.join(RAIZ, "src-tauri", "tauri.conf.json");
const PACOTE = path.join(RAIZ, "package.json");
const CARGO = path.join(RAIZ, "src-tauri", "Cargo.toml");

/** Troca o PRIMEIRO campo de versão do arquivo, sem mexer no resto do texto. */
function trocar(arquivo, padrao, versao) {
  const texto = fs.readFileSync(arquivo, "utf8");
  if (!padrao.test(texto)) throw new Error(`não achei a versão em ${path.relative(RAIZ, arquivo)}`);
  fs.writeFileSync(arquivo, texto.replace(padrao, `$1${versao}$2`), "utf8");
}

function main() {
  const atual = String(JSON.parse(fs.readFileSync(CONF, "utf8")).version);
  const [maior, menor, remendo] = atual.split(".").map(Number);

  const commits = Number(execFileSync("git", ["rev-list", "--count", "HEAD"], {
    cwd: RAIZ, encoding: "utf8",
  }).trim());
  // Clone raso conta 1 commit e daria a versão X.Y.1 para sempre. O workflow
  // pede o histórico inteiro (`fetch-depth: 0`); isto pega o dia em que alguém
  // tirar isso de lá.
  if (!Number.isInteger(commits) || commits < 2) {
    throw new Error(`contagem de commits inválida (${commits}) — o clone é raso?`);
  }
  if (commits < remendo) {
    throw new Error(`a versão do arquivo (${atual}) está à frente da contagem de commits (${commits});`
      + " o lançamento automático sairia com número menor que o instalado.");
  }

  const versao = `${maior}.${menor}.${commits}`;
  trocar(CONF, /("version"\s*:\s*")[^"]+(")/, versao);
  trocar(PACOTE, /("version"\s*:\s*")[^"]+(")/, versao);
  trocar(CARGO, /(^version\s*=\s*")[^"]+(")/m, versao);

  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `versao=${versao}\n`);
  console.log(`versão do lançamento: ${versao} (o arquivo dizia ${atual})`);
}

main();
