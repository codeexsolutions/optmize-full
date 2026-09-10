/**
 * Carrega módulos de `src/` fora do navegador — os motores e os utilitários
 * que eles usam.
 *
 * Eles são ESM, e um deles (`utils/geometria.ts`) é TypeScript, que o Node
 * nem abre. Então o esbuild — o MESMO que o Vite usa para empacotar a tela —
 * junta a árvore num arquivo só, e o Node importa esse arquivo.
 *
 * Isso é o que faz a bancada medir **o que o navegador roda**, e não uma
 * aproximação: se o empacotador resolvesse um ciclo de importação de outro
 * jeito, ou içasse uma função diferente, a bancada veria.
 *
 * Mora aqui, e não dentro do `motor.js`, porque passou a ter dois clientes: o
 * motor de encaixe e o `conferir-arte.js`, que antes recortava as funções de
 * JPEG do texto do `public/encaixe.js` contando chaves.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

/*
 * De onde vêm os motores.
 *
 * Normalmente é o projeto. `OPTIMIZE_MOTOR_RAIZ` aponta para outra pasta —
 * outro checkout, ou uma cópia, para comparar duas versões lado a lado.
 */
const RAIZ = process.env.OPTIMIZE_MOTOR_RAIZ
  ? path.resolve(process.env.OPTIMIZE_MOTOR_RAIZ)
  : path.join(__dirname, "..");

/**
 * Empacota os módulos pedidos e devolve o que eles exportam, tudo num objeto
 * só. Os nomes vão COM extensão e relativos a `src/` (`motores/vetor.js`,
 * `utils/geometria.ts`), e são só as portas de entrada: quem descobre o resto
 * da árvore, e a ordem, é o esbuild, pelos `import` de verdade.
 */
async function carregarDosMotores(modulos) {
  const esbuild = require("esbuild");
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "optimize-motores-"));
  const entrada = path.join(pasta, "entrada.js");
  const saida = path.join(pasta, "motores.mjs");

  // O arquivo de entrada é escrito na pasta temporária do sistema, então os
  // caminhos têm que ser ABSOLUTOS: um caminho relativo ali resolveria a
  // partir de lá, e não a partir do projeto.
  fs.writeFileSync(entrada, modulos
    .map((nome) => {
      const caminho = path.join(RAIZ, "src", nome).split(path.sep).join("/");
      return `export * from ${JSON.stringify(caminho)};`;
    })
    .join("\n"), "utf8");

  try {
    await esbuild.build({
      entryPoints: [entrada],
      outfile: saida,
      bundle: true,
      format: "esm",
      platform: "neutral",
      target: "node24",
      // O esbuild cru NÃO procura `.mjs` sozinho (a lista padrão dele é
      // .tsx/.ts/.jsx/.js/.css/.json); o Vite procura, e é por isso que a tela
      // acha `./encaixeRede` sem extensão e aqui não achava. O `encaixeRede`
      // precisa ser `.mjs` para o servidor conseguir `require()` nele, então a
      // extensão entra na lista à mão.
      resolveExtensions: [".mjs", ".js", ".ts", ".tsx", ".jsx", ".json"],
      // `import.meta.env.BASE_URL` só existe dentro do Vite. Aqui não há Vite,
      // e os motores só o usam no endereço padrão do .wasm — que a bancada não
      // usa, porque ela passa os bytes lidos do disco.
      define: { "import.meta.env.BASE_URL": '"/"' },
      logLevel: "warning",
    });
    const modulo = await import("file:///" + saida.split(path.sep).join("/"));
    return { ...modulo };
  } finally {
    // Artefato de conferência, não código: sai da pasta temporária e não passa
    // perto de um `git status`.
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

module.exports = { carregarDosMotores, RAIZ };
