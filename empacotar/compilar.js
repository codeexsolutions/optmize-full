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
const PACOTE = path.join(RAIZ, "src-tauri", "servidor");

/**
 * A pasta do backend dentro da cópia. O `preparar.js` guarda a mesma forma do
 * repositório, então o servidor mora em `servidor/` lá também.
 */
const DESTINO = path.join(PACOTE, "servidor");

/** O ponto de entrada do servidor. Tudo que ele exige entra no pacote. */
const ENTRADA = "server.js";

/**
 * O que some depois de virar bytecode: TUDO que está na pasta do servidor,
 * menos o carregador.
 *
 * Aqui a lista era escrita à mão, arquivo por arquivo, para que uma varredura
 * não apagasse por engano algo que precisasse continuar legível. Com o backend
 * numa pasta só isso deixou de ser um risco e virou o contrário: um arquivo
 * novo de servidor que ninguém lembrasse de acrescentar aqui sairia no
 * instalador em texto, comentado, que é justamente o que este script existe
 * para evitar. Nada dentro de `servidor/` é lido do disco em execução — o que
 * a central das impressoras lê são os arquivos DAS MÁQUINAS, pela rede, e a
 * configuração do WhatsApp, que mora na pasta de dados.
 */
/*
 * Uma nota sobre o `motor-encaixe.js`, que é gerado e não escrito à mão.
 *
 * Ele é o motor de encaixe de `src/motores/` empacotado para o servidor (ver
 * `empacotar/motor.js`), e chega aqui como qualquer outro arquivo do backend:
 * o `encaixe-resolver.js` o carrega com `require("./motor-encaixe")`, o
 * caminho é literal, e por isso o esbuild logo abaixo o embute no bundle. Vai
 * para dentro do `.jsc` junto com o resto, e a fonte é apagada no passo 4.
 *
 * Isto foi de propósito e custou uma medição. A primeira versão gerava ESM e
 * o servidor a carregava com `import()` dinâmico — que funciona em
 * desenvolvimento e morre aqui, porque código vindo de bytecode não tem
 * callback de import ("A dynamic import callback was not specified"). Além de
 * quebrar, aquilo obrigaria a poupar o arquivo desta limpeza, e o motor
 * ficaria em texto ao lado do bytecode: justamente o que este script evita.
 */
function fontesDoServidor() {
  return fs.readdirSync(DESTINO, { withFileTypes: true })
    .filter((item) => item.name !== ENTRADA && item.name !== "servidor.jsc")
    .map((item) => item.name);
}

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

function tamanhoDaPasta(alvo) {
  let total = 0;
  let itens;
  try { itens = fs.readdirSync(alvo, { withFileTypes: true }); } catch { return 0; }
  for (const item of itens) {
    const caminho = path.join(alvo, item.name);
    total += item.isDirectory() ? tamanhoDaPasta(caminho) : tamanho(caminho);
  }
  return total;
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

  const fontes = fontesDoServidor();
  const antes = fontes.reduce((soma, nome) => {
    const caminho = path.join(DESTINO, nome);
    return soma + (fs.statSync(caminho).isDirectory() ? tamanhoDaPasta(caminho) : tamanho(caminho));
  }, 0);

  // O bytecode anterior sai primeiro, e não é arrumação.
  //
  // O `preparar.js` apaga e recopia tudo que é leve, mas o `.jsc` não é dele
  // e sobrevive entre builds. Se este script escrevesse o carregador e falhasse
  // antes de gerar o bytecode novo, o programa subiria rodando o código do
  // build ANTERIOR — sem erro nenhum, que é o pior jeito de estar errado.
  const jsc = path.join(DESTINO, "servidor.jsc");
  fs.rmSync(jsc, { force: true });

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
  for (const nome of fontes) {
    fs.rmSync(path.join(DESTINO, nome), { recursive: true, force: true });
  }

  /*
   * E com eles os motores do front que o servidor exige (ver `LEVAR`, no
   * preparar.js). Eles vieram para cá só para o esbuild poder segui-los; agora
   * estão dentro do bytecode, e o que ficasse na pasta seria o motor de
   * encaixe em texto, comentado — exatamente o que este script evita.
   */
  fs.rmSync(path.join(PACOTE, "src"), { recursive: true, force: true });

  return { antes, depois: tamanho(jsc) };
}

/*
 * Aqui morava o `compilarTelas()`, que tirava comentário e espaço dos arquivos
 * de `public/`. Ele saiu junto com a pasta: o painel de hoje é o pacote do
 * Vite, que já vem minificado do `npm run front`.
 */


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
  const embutido = path.join(PACOTE, "node.exe");
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
  const sobrou = fontesDoServidor();
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

  // O carregador aponta para um bytecode que existe?
  if (!fs.existsSync(path.join(DESTINO, "servidor.jsc"))) {
    console.error("compilar: o server.js virou carregador e o servidor.jsc não existe.");
    process.exit(1);
  }
}

async function principal() {
  const v8 = conferirNode();
  const servidor = await compilarServidor();
  conferirLimpeza();

  console.log(`compilar: servidor em bytecode (V8 ${v8}) —`
    + ` ${bytesEmMb(servidor.antes)} de fonte viraram ${bytesEmMb(servidor.depois)} de .jsc`);
}

principal().catch((erro) => {
  console.error("compilar: " + (erro && erro.message ? erro.message : erro));
  process.exit(1);
});
