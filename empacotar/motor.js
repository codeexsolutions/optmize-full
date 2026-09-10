#!/usr/bin/env node
/**
 * ===========================================================================
 * O MOTOR DE ENCAIXE, EMPACOTADO PARA O SERVIDOR
 * ===========================================================================
 *
 * Junta `src/motores/` num arquivo só, `servidor/motor-encaixe.js`, que o
 * servidor carrega com um `require` comum.
 *
 * POR QUE ISTO PRECISA EXISTIR
 * ---------------------------
 * O servidor já carrega um motor sem ajuda nenhuma — o `encaixeRede.mjs`, por
 * `require()`, lá no `encaixe-memoria.js`. Aquilo funciona porque a rede é um
 * arquivo solto: não importa ninguém.
 *
 * O motor de encaixe não é assim. Ele importa `encaixeGiro`, `encaixeRede` e
 * `encaixeWasm`, e a árvore desemboca em `utils/geometria.ts` — TypeScript,
 * que o Node não abre. E os `.js` de `src/` são ESM num projeto declarado
 * CommonJS, então o Node os leria como CJS e quebraria no primeiro `export`.
 *
 * Por isso o empacotador. É o MESMO esbuild que a bancada usa há tempos (ver
 * `bancada/motores.js`) e o mesmo que o Vite roda por baixo — então o que o
 * servidor encaixa é o que a tela encaixa, resolvido pelo mesmo resolvedor.
 *
 * POR QUE A SAÍDA É CommonJS, E NÃO ESM
 * -------------------------------------
 * Esta é a parte que custou uma medição para descobrir, e é a razão de o
 * arquivo ser `.js` e não `.mjs`.
 *
 * A primeira versão emitia ESM, e o servidor o carregava com `import()`
 * dinâmico — o caminho óbvio, já que o projeto é CommonJS e não dá para
 * `require` um `.mjs`... exceto que dá, em Node 24. E, mais importante: no
 * programa INSTALADO o servidor não roda como JavaScript, roda como bytecode
 * (ver `empacotar/compilar.js`). Código carregado de um `.jsc` não tem
 * callback de import registrado, e o `import()` morre com:
 *
 *     A dynamic import callback was not specified.
 *
 * Um erro que **só aparece no programa instalado** — em desenvolvimento o
 * `import()` funciona perfeitamente. Foi pego rodando o servidor compilado de
 * verdade antes de acreditar que estava pronto.
 *
 * Em CommonJS o problema desaparece, e some junto com ele um segundo: como o
 * `require("./motor-encaixe")` é estático, o esbuild do `compilar.js` embute
 * este arquivo DENTRO do bytecode, como faz com o resto do servidor. Ou seja:
 *
 *   - não sobra arquivo nenhum a preservar na pasta do instalador;
 *   - o motor fica dentro do `.jsc`, e não em texto ao lado dele — que é
 *     exatamente o que o `compilar.js` existe para garantir.
 *
 * POR QUE EM TEMPO DE BUILD, E NÃO NA HORA
 * ----------------------------------------
 * A bancada empacota quando roda, e para ela isso é perfeito: é ferramenta de
 * desenvolvimento, o esbuild está sempre por perto.
 *
 * O servidor não pode. O esbuild é `devDependency` e o instalador não o leva.
 * Empacotar na primeira requisição seria "Cannot find module: esbuild" na
 * máquina de quem instalou — e só ali, nunca na de quem desenvolve.
 *
 * ONDE ELE ENTRA
 * --------------
 * No `npm run front`, ao lado de `icones` e `ia`, que já preparam artefato do
 * mesmo jeito. Quem roda `npm start` ou `npm run build:app` pega os três sem
 * saber que existem.
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SAIDA = path.join(RAIZ, "servidor", "motor-encaixe.js");

/*
 * As portas de entrada. Não é ordem de carregamento — quem descobre a ordem é
 * o esbuild, pelos `import` de verdade.
 *
 * A lista é a da bancada mais o `encaixeMascara`, que ela também carrega: é de
 * lá que vêm `grade`, `gradeDaPeca` e `mascarasDeSilhueta`, e sem eles o
 * servidor recebe polígono e não tem como transformar em máscara.
 */
const MODULOS = [
  "motores/encaixeMotor.js",
  "motores/encaixeMascara.js",
  "motores/encaixeGiro.js",
  "motores/encaixeRede.mjs",
  "motores/encaixeWasm.js",
  "utils/geometria.ts",
];

async function empacotar() {
  const esbuild = require("esbuild");

  const entrada = MODULOS
    .map((nome) => {
      const caminho = path.join(RAIZ, "src", nome).split(path.sep).join("/");
      return `export * from ${JSON.stringify(caminho)};`;
    })
    .join("\n");

  const temporario = path.join(RAIZ, "servidor", ".motor-entrada.js");
  fs.writeFileSync(temporario, entrada, "utf8");

  try {
    await esbuild.build({
      entryPoints: [temporario],
      outfile: SAIDA,
      bundle: true,
      // Ver "POR QUE A SAÍDA É CommonJS" no cabeçalho. Não troque isto por
      // "esm" sem rodar o servidor COMPILADO depois.
      format: "cjs",
      platform: "node",
      target: "node24",
      // O esbuild cru não procura `.mjs` sozinho, e o `encaixeRede` é `.mjs`
      // (para o servidor conseguir `require()` nele). Mesmo ajuste da bancada.
      resolveExtensions: [".mjs", ".js", ".ts", ".tsx", ".jsx", ".json"],
      // `import.meta.env.BASE_URL` só existe dentro do Vite. Fora dele os
      // motores só o usam no endereço padrão do `.wasm`, e aqui quem passa os
      // bytes do WASM é o servidor, lendo do disco.
      define: { "import.meta.env.BASE_URL": '"/"' },
      logLevel: "warning",
    });
  } finally {
    fs.rmSync(temporario, { force: true });
  }

  const tamanho = fs.statSync(SAIDA).size;
  console.log(`motor de encaixe: ${(tamanho / 1024).toFixed(0)} KB em servidor/motor-encaixe.js`);
}

empacotar().catch((erro) => {
  console.error("falhou ao empacotar o motor:", erro && erro.message || erro);
  process.exit(1);
});
