#!/usr/bin/env node
/**
 * ===========================================================================
 * O INSTALADOR — acha a chave de assinatura sozinho, ou compila sem ela
 * ===========================================================================
 *
 * Isto existe por um erro que aparecia no FIM de um build de três minutos:
 *
 *     A public key has been found, but no private key.
 *     Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable.
 *
 * O `tauri.conf.json` pede artefato de atualização (`createUpdaterArtifacts`),
 * e para isso o build tem de ASSINAR o instalador. A chave privada não mora no
 * repositório — ele está dentro do OneDrive, e chave de assinatura não sobe para
 * nuvem nenhuma —, então ela tinha de entrar por variável de ambiente, digitada
 * à mão antes de cada build. Esquecer é o caso comum, não o raro: a variável só
 * vale para a janela de terminal aberta, some ao fechar, e o erro só aparece
 * depois de o Rust inteiro já ter compilado.
 *
 * Agora quem procura a chave é este script, e ele resolve os dois casos:
 *
 *   ACHOU A CHAVE     assina, e o instalador sai com o `.sig` do lado — que é
 *                     o que o `publicar.js` exige e o que faz quem já tem o
 *                     programa aceitar esta versão como atualização.
 *
 *   NÃO ACHOU         compila MESMO ASSIM, desligando o artefato de atualização
 *                     nesta corrida só. Sai um instalador que instala; o que
 *                     ele não faz é servir de atualização para quem já tem o
 *                     programa. O aviso é impresso no começo, e não no fim.
 *
 * O SEGUNDO CASO NÃO É UM MODO DE TRABALHO, É UMA SAÍDA. Build sem assinatura
 * serve para testar na sua máquina. Para publicar, a chave tem de estar lá — o
 * `publicar.js` recusa um instalador sem `.sig`, e recusa de propósito.
 *
 * ---------------------------------------------------------------------------
 * A SENHA
 * ---------------------------------------------------------------------------
 * A chave do minisign é sempre gravada como "encrypted secret key", mesmo
 * quando a senha é vazia — e a nossa é. Por isso a variável da senha é
 * declarada como texto vazio em vez de ficar de fora: sem ela declarada, o
 * Tauri PARA esperando alguém digitar, e num build em segundo plano isso é um
 * travamento sem mensagem. `OPTMIZE_SENHA_DA_CHAVE` troca isso quando a chave
 * passar a ter senha.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RAIZ = path.resolve(__dirname, "..");

/**
 * Onde a chave mora. A variável de ambiente ganha da pasta padrão: quem já
 * tinha o costume de exportá-la continua mandando, e uma máquina de compilação
 * pode apontar para outro lugar sem mexer aqui.
 */
const CHAVE =
  process.env.TAURI_SIGNING_PRIVATE_KEY ||
  path.join(os.homedir(), ".optmize", "optmize-updater.key");

/** A chave pode vir como caminho de arquivo OU como o conteúdo dela. */
const ehCaminho = !CHAVE.includes("\n") && CHAVE.length < 4096;
const temChave = ehCaminho ? fs.existsSync(CHAVE) : CHAVE.length > 0;

const argumentos = ["tauri", "build", ...process.argv.slice(2)];
const ambiente = { ...process.env };

if (temChave) {
  ambiente.TAURI_SIGNING_PRIVATE_KEY = CHAVE;
  ambiente.TAURI_SIGNING_PRIVATE_KEY_PASSWORD =
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??
    process.env.OPTMIZE_SENHA_DA_CHAVE ??
    "";
  console.log(`\n  Assinando com a chave de ${ehCaminho ? CHAVE : "(conteúdo no ambiente)"}\n`);
} else {
  /*
   * Desliga o artefato de atualização NESTA CORRIDA, por `--config`, e não
   * mexendo no `tauri.conf.json`. A diferença importa: editar o arquivo
   * deixaria o repositório num estado em que o build assinado é o excepcional,
   * e o próximo build de publicação sairia sem `.sig` sem ninguém notar.
   */
  argumentos.push("--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
  console.log(
    `\n  AVISO: não há chave de assinatura em\n    ${CHAVE}\n\n` +
      "  O instalador vai sair SEM assinatura. Ele instala normalmente, mas não\n" +
      "  serve como atualização para quem já tem o programa, e o `npm run publicar`\n" +
      "  vai recusá-lo.\n\n" +
      "  Para assinar, ponha a chave naquele caminho ou exporte\n" +
      "  TAURI_SIGNING_PRIVATE_KEY apontando para ela.\n",
  );
}

// `shell: true` porque no Windows o `tauri` é um .cmd, e sem shell o spawn não
// o encontra. Os argumentos são nossos, não de quem chama, então não há aqui o
// risco que o shell costuma trazer.
const r = spawnSync("npx", argumentos, {
  cwd: RAIZ,
  stdio: "inherit",
  env: ambiente,
  shell: true,
});

process.exit(r.status ?? 1);
