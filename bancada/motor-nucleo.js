/**
 * Sobe o motor de encaixe PORTADO — o de `src/nucleo/` — fora do navegador.
 *
 * O `motor.js` ao lado carrega os arquivos de `public/`, que são `<script>`
 * soltos, concatenando o texto deles dentro de uma função. Aqui não dá: os de
 * `src/nucleo/` são módulos ESM, e um deles (`geometria.ts`) é TypeScript, que
 * o Node não abre.
 *
 * Então o esbuild — que já está no projeto — junta a árvore inteira num
 * arquivo só, e o Node importa esse arquivo. É a MESMA ferramenta que o Vite
 * usa para empacotar a tela, então o que se mede aqui é o que o navegador
 * roda, e não uma aproximação dele.
 *
 * Este arquivo existe por um motivo só, e é temporário: enquanto o motor viver
 * em dois lugares, é preciso provar que os dois são o mesmo. Ele some junto
 * com `public/`.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

/**
 * Os módulos do motor portado, na ordem em que a bancada os alcança.
 *
 * O caminho vai ABSOLUTO no arquivo de entrada: ele é escrito na pasta
 * temporária do sistema, e um caminho relativo ali resolveria a partir de lá —
 * não a partir do projeto.
 */
const MODULOS = [
  "encaixeMotor.js",
  "encaixeMascara.js",
  "encaixeGiro.js",
  "encaixeRede.js",
  "encaixeWasm.js",
  "geometria.ts",
];

function montarEntrada() {
  return MODULOS
    .map((nome) => {
      const caminho = path.join(RAIZ, "src", "nucleo", nome).split(path.sep).join("/");
      return `export * from ${JSON.stringify(caminho)};`;
    })
    .join("\n");
}

/**
 * Junta a árvore do núcleo num arquivo só e devolve o caminho dele.
 *
 * Vai para a pasta temporária do sistema, e não para dentro do projeto: é
 * artefato de conferência, não código, e ninguém deve tropeçar nele num
 * `git status`.
 */
async function empacotarNucleo() {
  const esbuild = require("esbuild");
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "optimize-nucleo-"));
  const entrada = path.join(pasta, "entrada.js");
  const saida = path.join(pasta, "motor.mjs");

  fs.writeFileSync(entrada, montarEntrada(), "utf8");
  await esbuild.build({
    entryPoints: [entrada],
    outfile: saida,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "node24",
    // `import.meta.env.BASE_URL` só existe dentro do Vite. Aqui não há Vite, e
    // nenhum arquivo do motor o usa — mas o esbuild reclamaria se aparecesse.
    define: { "import.meta.env.BASE_URL": '"/"' },
    logLevel: "warning",
  });
  return { saida, pasta };
}

/**
 * Sobe uma instância do motor portado.
 *
 * Mesma assinatura de `carregarMotor` em `motor.js`, de propósito: quem
 * confere os dois troca um pelo outro sem mudar mais nada.
 */
async function carregarMotorDoNucleo({ comWasm = true } = {}) {
  const { saida, pasta } = await empacotarNucleo();
  try {
    const motor = await import("file:///" + saida.replace(/\\/g, "/"));
    const alcance = { ...motor };
    alcance.comWasm = false;
    if (comWasm) {
      const bytes = fs.readFileSync(path.join(RAIZ, "estatico/encaixe.wasm"));
      alcance.comWasm = await motor.carregarMotorWasm(bytes);
    }
    return alcance;
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

module.exports = { carregarMotorDoNucleo };
