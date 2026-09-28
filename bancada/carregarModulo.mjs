/*
 * ===========================================================================
 * CARREGAR UM MOTOR ESM NA BANCADA
 * ===========================================================================
 *
 * O `package.json` é CommonJS, e os motores de `src/motores` são ESM com
 * imports relativos sem extensão (`./ajusteDeCurvas`). O truque do `data:` de
 * `conferir-nome-de-arquivo.mjs` não serve aqui: um módulo carregado por URL
 * de dados não resolve import relativo. O esbuild (já instalado, é quem
 * empacota a tela) junta o motor e o que ele importa num texto só, e esse
 * texto entra por `data:`. O que se testa continua sendo o arquivo de verdade.
 */
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function carregarModulo(relativo) {
  const saida = buildSync({
    entryPoints: [path.join(RAIZ, relativo)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
  });
  const codigo = saida.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(codigo).toString("base64")}`);
}
