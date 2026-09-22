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
 * DESDE 2026-09-21 QUEM RODA ISTO É O GITHUB, a cada mudança na main — ver
 * `.github/workflows/lancar.yml` e docs/LANCAMENTO.md. Rodar à mão continua
 * funcionando e fica para emergência; o lançamento de todo dia não passa mais
 * pela pasta de ninguém.
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
 * repositório. Mora em dois lugares:
 *
 *   no GitHub, como o Secret `TAURI_SIGNING_PRIVATE_KEY` — é com ela que o
 *   lançamento automático assina. A regra antiga era "a chave não sobe para
 *   nuvem nenhuma"; ela mudou em 2026-09-21, de propósito, para nenhuma
 *   máquina precisar ficar ligada para lançar. No Secret ela fica cifrada, e
 *   depois de salva nem quem administra o repositório lê o conteúdo.
 *
 *   na máquina de quem lança à mão, em
 *
 *     C:\Users\<voce>\.optmize\optmize-updater.key
 *
 *   e o build a recebe assim (PowerShell), antes do `npm run build:app`:
 *
 *     $env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.optmize\optmize-updater.key"
 *
 * Perder a chave é perder a capacidade de atualizar quem já instalou: a
 * chave pública correspondente está compilada dentro de cada cópia que saiu
 * daqui, e um instalador assinado com outra chave é recusado pelo app. O
 * Secret não serve de cópia de segurança — ele não se lê de volta. Guarde uma
 * cópia do arquivo num lugar que não seja este computador.
 *
 * ---------------------------------------------------------------------------
 * A CHAVE DE ADMINISTRAÇÃO
 * ---------------------------------------------------------------------------
 * A mesma `ADMIN_KEY` do backend, que autoriza a publicação:
 *
 *     $env:OPTMIZE_ADMIN_KEY = "..."
 */

const { readFile, readdir, stat } = require("node:fs/promises");
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

  const exe = selecionarInstalador(arquivos, versao);
  if (!exe) {
    morrer(
      `Não há instalador da versão ${versao} em:\n  ${BUNDLE}\n\n` +
        `  O que está lá: ${arquivos.join(", ") || "(nada)"}\n` +
        "  Se a versão mudou no tauri.conf.json, compile de novo.",
    );
  }
  return exe;
}

function selecionarInstalador(arquivos, versao) {
  // O NSIS inclui versão e arquitetura entre separadores. Comparar somente
  // um trecho também aceitaria 1.0.260 ou uma prévia 1.0.26-beta para 1.0.26.
  const sufixo = `_${versao}_x64-setup.exe`;
  return arquivos.find(nome => nome.endsWith(sufixo));
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

  const notas = process.argv.slice(2).join(" ").trim();

  /*
    ONDE OS BYTES VÃO.

    `OPTMIZE_RELEASE_URL` é o endereço público do instalador quando ele JÁ está
    hospedado — hoje, na release do GitHub que o lançamento cria. Nesse caso o
    servidor recebe só a ficha: versão, notas, tamanho e a assinatura.

    NÃO É PREFERÊNCIA, É LIMITE: o Storage do Supabase deste projeto recusa
    arquivo acima de 50 MB, e o instalador tem 96. Enquanto o plano for esse,
    mandar os bytes por aqui devolve 500 depois de dez minutos de compilação.

    Sem a variável, o caminho antigo continua valendo inteiro — é o que roda na
    mão de quem publica da própria máquina, contra um servidor cujo Storage
    aceite o tamanho.
  */
  const hospedado = process.env.OPTMIZE_RELEASE_URL?.trim();
  const tamanho = (await stat(caminhoExe)).size;

  const url = new URL(`${API}/admin/app/releases`);
  url.searchParams.set("version", versao);
  url.searchParams.set("target", ALVO);
  url.searchParams.set("fileName", exe);
  url.searchParams.set("signature", assinatura);
  if (notas) url.searchParams.set("notes", notas);
  if (hospedado) {
    url.searchParams.set("url", hospedado);
    url.searchParams.set("sizeBytes", String(tamanho));
  }

  const mb = (tamanho / 1024 / 1024).toFixed(1);
  console.log(`\n  Optimize ${versao} — ${exe} (${mb} MB)`);
  console.log(
    hospedado
      ? `  hospedado em ${hospedado}\n  mandando a ficha para ${API} ...`
      : `  enviando para ${API} ...`,
  );

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "x-admin-key": adminKey,
      "content-type": "application/octet-stream",
    },
    body: hospedado ? "" : await readFile(caminhoExe),
  });

  const corpo = await resposta.text();
  if (!resposta.ok) {
    morrer(`O servidor recusou (${resposta.status}):\n  ${corpo}`);
  }

  console.log(`\n  Publicado. ${API}/download já entrega a ${versao}.`);
  console.log("  Quem está com o programa aberto foi avisado agora.\n");
}

if (require.main === module) {
  main().catch((erro) => morrer(erro?.message ?? String(erro)));
}

module.exports = { selecionarInstalador };
