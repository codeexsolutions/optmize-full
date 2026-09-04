/**
 * ===========================================================================
 * PREPARAR — junta numa pasta só tudo que o app instalado precisa levar
 * ===========================================================================
 *
 * O Tauri embute o que estiver listado em `resources`. Em vez de listar
 * arquivo por arquivo (e esquecer um na próxima vez que o projeto crescer),
 * este script copia o servidor inteiro para `src-tauri/servidor/`, e o
 * `tauri.conf.json` leva essa pasta e mais nada.
 *
 * Vai junto o `node.exe` da máquina que está compilando: o app instalado não
 * pode depender de o cliente ter Node instalado. São ~80 MB, e é o preço de
 * manter o servidor Express e o better-sqlite3 como estão — reescrever o
 * backend em Rust custaria muito mais.
 *
 * O que NÃO vai: `dados.db`, `uploads/` e as pastas de backup. Esses são dados
 * de quem usa, e no app instalado moram na pasta de dados do usuário (ver
 * `caminhos.js`) — copiá-los para dentro do instalador entregaria os moldes de
 * uma máquina para outra.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const DESTINO = path.join(RAIZ, "src-tauri", "servidor");

/** Os arquivos e pastas do servidor, na raiz do projeto. */
const LEVAR = [
  "server.js",
  "caminhos.js",
  "db.js",
  "moldes-api.js",
  "projetos-api.js",
  "uploads-arquivos.js",
  "encaixe-pdf.js",
  "encaixe-memoria.js",
  "cor-api.js",
  "cor-icc.js",
  "package.json",
  "public",     // a tela antiga
  "dist",       // a tela nova, compilada pelo Vite
  "estatico",   // o sprite de ícones e o wasm, servidos como estão
  "node_modules",
];

/**
 * O node_modules do better-sqlite3 traz o que sobrou de compilar o módulo
 * nativo: o `.obj` de cada arquivo do SQLite, mais o projeto do Visual Studio.
 * São ~250 MB que não servem para nada em execução — só o `.node` importa.
 */
const PODAR = [
  path.join("better-sqlite3", "build", "Release", "obj"),
  path.join("better-sqlite3", "build", "Release", "obj.target"),
  path.join("better-sqlite3", "build", "deps"),
  path.join("better-sqlite3", "deps"),
  path.join("better-sqlite3", "src"),
];

/**
 * O better-sqlite3 traz o binário pronto de todas as plataformas que ele
 * publica (`prebuilds/win32-x64.node`, `linux-x64.node`, `darwin-arm64`…).
 * O instalador é de uma plataforma só, então as outras são ~15 MB de peso
 * morto. Fica o desta máquina, que é a que o `lib/binding.js` vai procurar.
 */
function podarPrebuilds(pasta) {
  const prebuilds = path.join(pasta, "better-sqlite3", "prebuilds");
  if (!fs.existsSync(prebuilds)) return;
  const daqui = `${process.platform}-${process.arch}.node`;
  for (const arquivo of fs.readdirSync(prebuilds)) {
    if (arquivo !== daqui) fs.rmSync(path.join(prebuilds, arquivo), { force: true });
  }
}

/**
 * O que só serve para desenvolver não entra no instalador.
 *
 * Quem decide o que é "só de desenvolver" é o package-lock.json: cada pacote
 * lá tem a marca `dev`, e ela vale para a árvore inteira. Isso importa mais
 * do que parece — olhar só os nomes do `devDependencies` deixa passar tudo
 * que vem pendurado neles: o Tailwind sozinho arrasta lightningcss, oxide e
 * jiti, 17 MB de ferramenta de compilar dentro do programa de quem usa.
 *
 * O que sobra depois da poda é uma pasta de escopo vazia (`@jridgewell/` sem
 * nada dentro); ela vai junto.
 */
function podarDesenvolvimento(pasta) {
  const lock = JSON.parse(fs.readFileSync(path.join(RAIZ, "package-lock.json"), "utf-8"));
  const prefixo = "node_modules/";

  for (const [caminho, info] of Object.entries(lock.packages || {})) {
    if (!info.dev || !caminho.startsWith(prefixo)) continue;
    fs.rmSync(path.join(pasta, caminho.slice(prefixo.length)), { recursive: true, force: true });
  }

  for (const item of fs.readdirSync(pasta)) {
    const dentro = path.join(pasta, item);
    if (item.startsWith("@") && fs.statSync(dentro).isDirectory() && fs.readdirSync(dentro).length === 0) {
      fs.rmSync(dentro, { recursive: true, force: true });
    }
  }
}

function copiar(de, para) {
  fs.cpSync(de, para, { recursive: true, dereference: true });
}

function tamanho(alvo) {
  let total = 0;
  for (const item of fs.readdirSync(alvo, { withFileTypes: true })) {
    const caminho = path.join(alvo, item.name);
    total += item.isDirectory() ? tamanho(caminho) : fs.statSync(caminho).size;
  }
  return total;
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/**
 * O `node_modules` e o `node.exe` são 100 MB que quase nunca mudam, e este
 * script roda a cada `tauri build` e a cada `tauri dev`. Copiar tudo de novo
 * toda vez custava meio minuto por build, sempre para chegar ao mesmo
 * resultado — então os dois só são refeitos quando o que os define muda.
 */
function copiarSeMudou(de, para, referencia, forcar = false) {
  if (!forcar && fs.existsSync(para) && fs.statSync(para).mtimeMs >= fs.statSync(referencia).mtimeMs) {
    return false;
  }
  fs.rmSync(para, { recursive: true, force: true });
  copiar(de, para);
  return true;
}

/**
 * O `node.exe` do instalador tem que ser sempre o Node atual desta máquina:
 * quem atualiza o Node espera que o instalador saia com o Node novo.
 *
 * Data de arquivo não serve para decidir isso. A cópia nasce mais nova que o
 * original, então a comparação de `copiarSeMudou` dava sempre "já está em
 * dia" e o `node.exe` ficava congelado no Node de quando a pasta nasceu —
 * era assim que o instalador continuava saindo com Node 22 numa máquina que já
 * compilava com Node 24. Pior: o `node_modules` é reinstalado pelo Node novo,
 * e o binário nativo do better-sqlite3 é compilado contra a ABI dele; um
 * `node.exe` de outra versão ao lado é um "compiled against a different
 * Node.js version" esperando o cliente instalar.
 *
 * Quem responde agora é o próprio executável copiado: se a versão dele não é a
 * que está rodando este script, ele é refeito.
 */
function copiarNode(destino) {
  if (fs.existsSync(destino)) {
    let dentro = null;
    try {
      dentro = execFileSync(destino, ["-v"], { encoding: "utf-8" }).trim();
    } catch {
      dentro = null; // não abre ou não responde: vale como desatualizado.
    }
    if (dentro === process.version) return { versao: dentro, trocou: false };
    fs.rmSync(destino, { force: true });
  }
  fs.copyFileSync(process.execPath, destino);
  return { versao: process.version, trocou: true };
}

/**
 * A LISTA ACIMA É ESCRITA À MÃO, E POR ISSO ELA FICA PARA TRÁS.
 *
 * Aconteceu: a tela de Cor entrou no projeto, o `server.js` passou a exigir
 * `cor-api` (que exige `cor-icc`), e nenhum dos dois estava no `LEVAR`. O
 * programa rodava perfeitamente aqui, compilava sem uma queixa, gerava o
 * instalador — e quebrava no primeiro `require` da máquina do cliente, com um
 * "Cannot find module" numa janela que nem console tem. É o pior formato de
 * defeito que este projeto pode produzir: invisível para quem compila, fatal
 * para quem instala.
 *
 * Então a lista deixou de ser só uma lista. Depois de copiar, cada `require`
 * relativo dos arquivos do servidor é resolvido DENTRO da pasta que vai para o
 * instalador. Se algum não resolve, o empacotamento para aqui, com o nome do
 * arquivo que falta — e não lá na frente, no computador de quem comprou.
 *
 * Só a raiz é varrida, que é onde mora o servidor. `public/` é código de
 * navegador (entra por `<script>` e `importScripts`, não por `require`) e
 * `node_modules` resolve sozinho.
 */
function conferirRequires(pasta) {
  const faltando = [];
  const resolve = (alvo) =>
    fs.existsSync(alvo) || fs.existsSync(`${alvo}.js`)
      || fs.existsSync(path.join(alvo, "index.js"));

  for (const arquivo of fs.readdirSync(pasta)) {
    if (!arquivo.endsWith(".js")) continue;
    const texto = fs.readFileSync(path.join(pasta, arquivo), "utf-8");
    for (const achado of texto.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const pedido = achado[1];
      if (!resolve(path.resolve(pasta, pedido))) {
        faltando.push(`  ${arquivo} pede "${pedido}", que não foi para o instalador`);
      }
    }
  }
  return faltando;
}

const PESADOS = new Set(["node_modules"]);

for (const item of LEVAR) {
  if (!fs.existsSync(path.join(RAIZ, item))) {
    console.error(
      `preparar: falta "${item}" na raiz do projeto.` +
        (item === "dist" || item === "estatico" ? " Rode `npm run front` antes de empacotar." : ""),
    );
    process.exit(1);
  }
}

fs.mkdirSync(DESTINO, { recursive: true });

// O que é leve vai inteiro, sempre: é o código que muda a cada build.
for (const item of LEVAR) {
  if (PESADOS.has(item)) continue;
  const para = path.join(DESTINO, item);
  fs.rmSync(para, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(para), { recursive: true });
  copiar(path.join(RAIZ, item), para);
}

// Antes de seguir: o que foi copiado se sustenta sozinho? Ver `conferirRequires`.
const faltando = conferirRequires(DESTINO);
if (faltando.length > 0) {
  console.error("preparar: o servidor copiado não fecha as próprias dependências.");
  faltando.forEach((linha) => console.error(linha));
  console.error("Acrescente o(s) arquivo(s) à lista LEVAR, em empacotar/preparar.js.");
  process.exit(1);
}

// O Node da máquina que compila. `process.execPath` é o caminho do node.exe
// que está rodando este script — é ele que vai dentro do instalador.
const node = copiarNode(path.join(DESTINO, "node.exe"));
console.log(`node embutido: ${node.versao}`);

// O node_modules segue o package-lock.json: lock mais novo que a cópia quer
// dizer que as dependências mudaram. Trocar o Node embutido também obriga a
// recopiar: o binário nativo do better-sqlite3 é compilado contra a versão que
// rodou o `npm install`, e ele e o `node.exe` têm que sair casados.
const refeito = copiarSeMudou(
  path.join(RAIZ, "node_modules"),
  path.join(DESTINO, "node_modules"),
  path.join(RAIZ, "package-lock.json"),
  node.trocou,
);
if (refeito) {
  for (const sobra of PODAR) {
    fs.rmSync(path.join(DESTINO, "node_modules", sobra), { recursive: true, force: true });
  }
  podarPrebuilds(path.join(DESTINO, "node_modules"));
  podarDesenvolvimento(path.join(DESTINO, "node_modules"));
}

console.log(`servidor preparado em src-tauri/servidor (${mb(tamanho(DESTINO))})`);
