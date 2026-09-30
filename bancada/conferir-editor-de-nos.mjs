/*
 * BANCADA — o editor de nós estilo Corel: o gancho da interação
 *
 *     npm run bancada:editor
 *
 * Roda no CI. O `useEditorDeNos` roda de verdade, com React e jsdom, nas telas
 * de mentira de `cenarios-do-editor.tsx`. O que mais importa: uma mudança nos
 * nós que vem DE FORA do editor — o Ctrl+Z, o refazer do traço — encerra o que
 * estava em andamento (a sessão do Reduzir, a sequência de setas, o arrasto, a
 * seleção); senão o passo seguinte reaplica um desenho velho, sem desfazer.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");
const require = createRequire(path.join(raiz, "package.json"));
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window", "document", "navigator", "HTMLElement", "Node", "Element", "KeyboardEvent", "MutationObserver"]) {
  if (!(k in globalThis) || k === "window" || k === "document") globalThis[k] = k === "window" ? dom.window : dom.window[k];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const saida = path.join(os.tmpdir(), `optimize-cenarios-do-editor-${process.pid}.mjs`);
esbuild.buildSync({
  entryPoints: [path.join(aqui, "cenarios-do-editor.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: saida,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "error",
});
try {
  const { rodar } = await import(pathToFileURL(saida).href);
  await rodar();
} finally {
  dom.window.close();
  fs.rmSync(saida, { force: true });
}
console.log("OK — o editor de nós encerra o que está em andamento quando os nós mudam de fora.");
// O agendador do React deixa portas de mensagem abertas no jsdom: sem sair à força, o processo não acaba
// (como em `conferir-react.cjs`). Uma falha acima já saiu com erro antes daqui.
process.exit(0);
