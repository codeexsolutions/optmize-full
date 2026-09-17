#!/usr/bin/env node
/**
 * ===========================================================================
 * PUBLICAR — manda o instalador recém-compilado para o servidor
 * ===========================================================================
 *
 * É o último passo de um lançamento, e o único que precisa acontecer para a
 * versão nova existir para o mundo:
 *
 *     npm run build:app     (compila e ASSINA — ver a nota sobre a chave)
 *     npm run publicar
 *
 * O que ele faz: acha o `.exe` e o `.sig` que o Tauri acabou de gerar, confere
 * que a assinatura está lá e os envia para `POST /admin/app/releases`. A partir
 * do "ok" do servidor, `GET /download` já entrega esta versão e todo Optimize
 * aberto no país recebe o aviso pelo canal `/ws/app-update`.
 *
 * ---------------------------------------------------------------------------
 * A CHAVE DE ASSINATURA
 * ---------------------------------------------------------------------------
 * O `.sig` só nasce se o build enxergar a chave privada. Ela NÃO mora no
 * repositório — o repositório está dentro do OneDrive, e chave privada de
 * assinatura não sobe para nuvem nenhuma. Ela fica em:
 *
 *     C:\Users\<voce>\.optmize\optmize-updater.key
 *
 * e o build a recebe assim (PowerShell), antes do `npm run build:app`:
 *
 *     $env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.optmize\optmize-updater.key"
 *
 * Perder esse arquivo é perder a capacidade de atualizar quem já instalou: a
 * chave pública correspondente está compilada dentro de cada cópia que saiu
 * daqui, e um instalador assinado com outra chave é recusado pelo app. Faça
 * cópia dela num lugar que não seja este computador.
 *
 * ---------------------------------------------------------------------------
 * A CHAVE DE ADMINISTRAÇÃO
 * ---------------------------------------------------------------------------
 * A mesma `ADMIN_KEY` do backend, que autoriza a publicação:
 *
 *     $env:OPTMIZE_ADMIN_KEY = "..."
 */

const { readFile, readdir } = require("node:fs/promises");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const BUNDLE = path.join(RAIZ, "src-tauri", "target", "release", "bundle", "nsis");

/** Onde o servidor vive. Trocável para apontar um backend local em teste. */
const API =
  process.env.OPTMIZE_API?.replace(/\/+$/, "") ??
  "https://optmize-backend-production.up.railway.app";

/** Hoje só se empacota para Windows 64 bits — é o alvo que o app pergunta. */
const ALVO = "windows-x86_64";

function morrer(mensagem) {
  console.error(`\n  ${mensagem}\n`);
  process.exit(1);
}

async function versaoDoProjeto() {
  const conf = JSON.parse(
    await readFile(path.join(RAIZ, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  return conf.version;
}

/**
 * Acha o instalador da versão pedida dentro da pasta de bundle.
 *
 * Procurar pelo NOME e não pegar "o único arquivo que está lá" é de propósito:
 * a pasta guarda os builds anteriores, e o modo mais fácil de estragar um
 * lançamento é publicar o `.exe` da versão passada com o número da nova no
 * índice — o app baixaria, instalaria, reabriria na mesma versão de antes e
 * pediria para atualizar outra vez, em laço.
 */
async function acharInstalador(versao) {
  let arquivos;
  try {
    arquivos = await readdir(BUNDLE);
  } catch {
    morrer(
      `Não encontrei a pasta do instalador:\n  ${BUNDLE}\n\n` +
        "  Rode `npm run build:app` antes de publicar.",
    );
  }

  const exe = arquivos.find(
    (nome) => nome.endsWith(".exe") && nome.includes(versao),
  );
  if (!exe) {
    morrer(
      `Não há instalador da versão ${versao} em:\n  ${BUNDLE}\n\n` +
        `  O que está lá: ${arquivos.join(", ") || "(nada)"}\n` +
        "  Se a versão mudou no tauri.conf.json, compile de novo.",
    );
  }
  return exe;
}

async function main() {
  const adminKey = process.env.OPTMIZE_ADMIN_KEY?.trim();
  if (!adminKey) {
    morrer(
      "Falta a chave de administração.\n" +
        '  PowerShell:  $env:OPTMIZE_ADMIN_KEY = "..."',
    );
  }

  const versao = await versaoDoProjeto();
  const exe = await acharInstalador(versao);
  const caminhoExe = path.join(BUNDLE, exe);

  /*
    A assinatura.

    Sem `.sig` ao lado do `.exe`, o build rodou sem a chave privada. Parar aqui
    é o ponto inteiro desta conferência: o servidor também recusaria, mas só
    depois de subir dezenas de megabytes — e, pior, alguém poderia contornar o
    aviso do servidor mandando um texto qualquer no lugar da assinatura e
    lançando uma versão que nenhuma máquina consegue instalar.
  */
  let assinatura;
  try {
    assinatura = (await readFile(`${caminhoExe}.sig`, "utf8")).trim();
  } catch {
    morrer(
      `O build não assinou o instalador — não existe:\n  ${exe}.sig\n\n` +
        "  A chave privada não estava no ambiente. Antes do build:\n" +
        '  $env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\\.optmize\\optmize-updater.key"\n' +
        "  e compile de novo com `npm run build:app`.",
    );
  }

  const bytes = await readFile(caminhoExe);
  const notas = process.argv.slice(2).join(" ").trim();

  const url = new URL(`${API}/admin/app/releases`);
  url.searchParams.set("version", versao);
  url.searchParams.set("target", ALVO);
  url.searchParams.set("fileName", exe);
  url.searchParams.set("signature", assinatura);
  if (notas) url.searchParams.set("notes", notas);

  const mb = (bytes.length / 1024 / 1024).toFixed(1);
  console.log(`\n  Optimize ${versao} — ${exe} (${mb} MB)`);
  console.log(`  enviando para ${API} ...`);

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "x-admin-key": adminKey,
      "content-type": "application/octet-stream",
    },
    body: bytes,
  });

  const corpo = await resposta.text();
  if (!resposta.ok) {
    morrer(`O servidor recusou (${resposta.status}):\n  ${corpo}`);
  }

  console.log(`\n  Publicado. ${API}/download já entrega a ${versao}.`);
  console.log("  Quem está com o programa aberto foi avisado agora.\n");
}

main().catch((erro) => morrer(erro?.message ?? String(erro)));
