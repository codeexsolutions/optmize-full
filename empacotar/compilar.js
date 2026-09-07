/**
 * ===========================================================================
 * COMPILAR — tira o código-fonte de dentro do instalável
 * ===========================================================================
 *
 * Roda DEPOIS do `preparar.js`, sobre a cópia já montada em
 * `src-tauri/servidor`. Mexe só na cópia; o projeto não é tocado.
 *
 * O QUE ISTO RESOLVE, E O QUE NÃO RESOLVE
 * ---------------------------------------
 * Antes, quem abrisse a pasta do programa instalado lia o sistema inteiro:
 * dois mil linhas de servidor e dezessete mil de tela, comentadas em
 * português como um manual. Copiar era abrir e ler.
 *
 * Depois deste passo:
 *
 *   O SERVIDOR vira bytecode do V8. Não é texto: é o que o motor do Node
 *   guarda depois de compilar. Não abre em editor nenhum, e não existe botão
 *   de desfazer. Isso é proteção de verdade — não absoluta, porque bytecode
 *   se desmonta com ferramenta e paciência, mas de outra ordem.
 *
 *   AS TELAS perdem os comentários e o espaço em branco. E é só. Não dá para
 *   fazer mais: o navegador precisa RECEBER o código para executá-lo, então
 *   qualquer coisa que ele leia, uma pessoa também lê. Quem abrir o F12 vai
 *   ver a lógica; o que não vai ver é a explicação dela, que é onde mora a
 *   maior parte do trabalho. O motor de encaixe está aí — não há como
 *   escondê-lo enquanto ele rodar no navegador.
 *
 * POR QUE OS COMENTÁRIOS SÃO O QUE MAIS IMPORTA AQUI: o `encaixe-motor.js`
 * tem quase três mil linhas, e boa parte delas explica POR QUE cada decisão
 * foi tomada e o que já foi medido e descartado. Isso é o resultado de meses
 * de medição. O código sem os comentários continua copiável; o caminho até
 * ele, não.
 *
 * O BYTECODE É CASADO COM O NODE QUE VAI JUNTO
 * --------------------------------------------
 * O `.jsc` só roda no V8 que o gerou. O instalador leva o `node.exe` DESTA
 * máquina (ver `copiarNode` no preparar.js), então os dois combinam por
 * construção — mas o script confere assim mesmo, porque um dia alguém vai
 * mudar isso e o erro apareceria só na máquina do cliente.
 */

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const bytenode = require("bytenode");

const RAIZ = path.join(__dirname, "..");
const DESTINO = path.join(RAIZ, "src-tauri", "servidor");

/** O ponto de entrada do servidor. Tudo que ele exige entra no pacote. */
const ENTRADA = "server.js";

/**
 * Os arquivos do servidor que somem depois de virar bytecode.
 *
 * A lista é explícita, e não "tudo que é .js na raiz": um dia alguém põe um
 * arquivo ali que precisa continuar legível, e uma varredura o apagaria sem
 * perguntar.
 */
const DO_SERVIDOR = [
  "server.js", "caminhos.js", "db.js", "moldes-api.js", "projetos-api.js",
  "uploads-arquivos.js", "encaixe-pdf.js", "encaixe-memoria.js",
  "cor-api.js", "cor-icc.js", "macros-api.js",
];

/**
 * O que fica de fora e continua texto, de propósito:
 *
 *   corel/*.cs   — o Corel compila o arquivo dentro dele; tem que ser fonte.
 *   corel/*.ps1  — o PowerShell lê como texto.
 *   package.json — o Node lê para achar a versão e o `main`.
 */

function tamanho(caminho) {
  try { return fs.statSync(caminho).size; } catch (erro) { return 0; }
}

function bytesEmMb(n) { return (n / 1048576).toFixed(2) + " MB"; }

// ==================== O SERVIDOR ====================

async function compilarServidor() {
  const entrada = path.join(DESTINO, ENTRADA);
  if (!fs.existsSync(entrada)) {
    console.error(`compilar: não achei ${ENTRADA} em ${DESTINO}.`
      + " Rode `node empacotar/preparar.js` antes.");
    process.exit(1);
  }

  const antes = DO_SERVIDOR.reduce((soma, n) => soma + tamanho(path.join(DESTINO, n)), 0);

  // 1. Um arquivo só, com os `require` locais resolvidos.
  //
  // `packages: "external"` deixa o node_modules de fora: o better-sqlite3 é
  // binário nativo e não entra em bundle nenhum, e empacotar o express junto
  // só engordaria o que já está na pasta ao lado.
  const juntos = path.join(DESTINO, ".servidor.js");
  await esbuild.build({
    entryPoints: [entrada],
    outfile: juntos,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    packages: "external",
    minify: true,
    legalComments: "none",
    logLevel: "warning",
  });

  // 2. Bytecode. O `.jsc` guarda o que o V8 produziu ao compilar.
  const jsc = path.join(DESTINO, "servidor.jsc");
  await bytenode.compileFile({ filename: juntos, output: jsc, electron: false });
  fs.rmSync(juntos, { force: true });

  // 3. O `server.js` vira só a chave que liga o bytecode.
  //
  // Ele continua existindo porque é o que o `node.exe` recebe na linha de
  // comando (ver src-tauri/src/main.rs). É a única parte legível, e não há o
  // que esconder nela.
  fs.writeFileSync(path.join(DESTINO, ENTRADA),
    "require(\"bytenode\");\nrequire(\"./servidor.jsc\");\n");

  // 4. Os originais saem.
  for (const nome of DO_SERVIDOR) {
    if (nome === ENTRADA) continue;
    fs.rmSync(path.join(DESTINO, nome), { force: true });
  }

  return { antes, depois: tamanho(jsc) };
}

// ==================== AS TELAS ====================

/**
 * Tira comentário e espaço das telas, e SÓ isso.
 *
 * `minifyIdentifiers` fica desligado de propósito. Os arquivos de `public`
 * são scripts clássicos, carregados um atrás do outro por `<script src>`, e
 * conversam entre si por variáveis no escopo global: o `encaixe.js` chama
 * função que o `encaixe-motor.js` declarou. Renomear essas variáveis quebraria
 * cada uma dessas pontes, porque cada arquivo é minificado sozinho e não sabe
 * dos outros.
 *
 * O que se ganha mesmo assim é o que mais importa: os comentários vão embora.
 */
async function compilarTelas() {
  const pasta = path.join(DESTINO, "public");
  if (!fs.existsSync(pasta)) return { antes: 0, depois: 0, arquivos: 0 };

  let antes = 0;
  let depois = 0;
  let arquivos = 0;

  for (const nome of fs.readdirSync(pasta)) {
    const caminho = path.join(pasta, nome);
    if (!fs.statSync(caminho).isFile()) continue;

    if (nome.endsWith(".js")) {
      const fonte = fs.readFileSync(caminho, "utf-8");
      antes += Buffer.byteLength(fonte);
      const r = await esbuild.transform(fonte, {
        minifyWhitespace: true,
        minifySyntax: true,
        minifyIdentifiers: false,
        legalComments: "none",
        target: "es2022",
      });
      fs.writeFileSync(caminho, r.code);
      depois += Buffer.byteLength(r.code);
      arquivos++;
    } else if (nome.endsWith(".html")) {
      // O HTML também é comentado, e os comentários dele explicam a tela
      // inteira. A marcação em si tem que continuar de pé, então só os
      // comentários saem.
      const fonte = fs.readFileSync(caminho, "utf-8");
      antes += Buffer.byteLength(fonte);
      const limpo = fonte.replace(/<!--[\s\S]*?-->/g, "");
      fs.writeFileSync(caminho, limpo);
      depois += Buffer.byteLength(limpo);
      arquivos++;
    }
  }

  return { antes, depois, arquivos };
}

// ==================== A CONFERÊNCIA ====================

/**
 * O bytecode roda no Node que vai junto?
 *
 * O `.jsc` é casado com a versão do V8 que o gerou. Hoje isso é verdade por
 * construção — o instalador leva o `node.exe` desta máquina —, mas basta
 * alguém trocar o `copiarNode` por um download para o erro aparecer só na
 * máquina do cliente, e do jeito mais silencioso: o servidor não sobe.
 */
function conferirNode() {
  const embutido = path.join(DESTINO, "node.exe");
  if (!fs.existsSync(embutido)) {
    console.error("compilar: o node.exe ainda não está em src-tauri/servidor.");
    console.error("O bytecode precisa casar com ELE. Rode o preparar.js antes.");
    process.exit(1);
  }
  const { execFileSync } = require("child_process");
  const versao = execFileSync(embutido, ["-p", "process.versions.v8"],
    { encoding: "utf-8" }).trim();
  if (versao !== process.versions.v8) {
    console.error("compilar: o node.exe que vai no instalador tem outro V8.");
    console.error(`  este script: ${process.versions.v8}`);
    console.error(`  o embutido:  ${versao}`);
    console.error("O bytecode gerado aqui não rodaria lá. Gere o .jsc com aquele Node.");
    process.exit(1);
  }
  return versao;
}

/** Sobrou algum fonte do servidor na pasta? */
function conferirLimpeza() {
  const sobrou = DO_SERVIDOR
    .filter((n) => n !== ENTRADA)
    .filter((n) => fs.existsSync(path.join(DESTINO, n)));
  if (sobrou.length > 0) {
    console.error("compilar: estes fontes do servidor continuam na pasta:");
    sobrou.forEach((n) => console.error("  " + n));
    process.exit(1);
  }

  const entrada = fs.readFileSync(path.join(DESTINO, ENTRADA), "utf-8");
  if (entrada.length > 200) {
    console.error("compilar: o server.js devia ser só o carregador, e está grande.");
    process.exit(1);
  }
}

async function principal() {
  const v8 = conferirNode();
  const servidor = await compilarServidor();
  const telas = await compilarTelas();
  conferirLimpeza();

  console.log(`compilar: servidor em bytecode (V8 ${v8}) —`
    + ` ${bytesEmMb(servidor.antes)} de fonte viraram ${bytesEmMb(servidor.depois)} de .jsc`);
  console.log(`compilar: ${telas.arquivos} arquivos de tela sem comentário —`
    + ` ${bytesEmMb(telas.antes)} viraram ${bytesEmMb(telas.depois)}`);
}

principal().catch((erro) => {
  console.error("compilar: " + (erro && erro.message ? erro.message : erro));
  process.exit(1);
});
