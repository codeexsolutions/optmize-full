/*
 * BANCADA — a janela de erro do Encaixe só abre quando a pessoa precisa agir
 *
 *     npm run bancada:janelas
 *
 * "Não deu certo no encaixe" no meio da tela, para algo que o sistema já está
 * consertando sozinho ou que o resultado já conta embaixo, ensina a pessoa a
 * fechar a janela sem ler. Cada caso aqui é um lugar que abria a janela e não
 * abre mais — conferido no código, porque provocar cada falha no navegador
 * (uma busca que quebra, uma conferência que recusa) é caro e frágil. O que dá
 * para ver no navegador (o arquivo na fila) está na `bancada:tela`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const codigo = fs.readFileSync(path.join(RAIZ, "src", "producao", "controlador.js"), "utf8");

/** O corpo de uma função do controlador, da assinatura até a próxima função de topo. */
function corpo(assinatura) {
  const inicio = codigo.indexOf(assinatura);
  assert.ok(inicio >= 0, `não achei "${assinatura}" no controlador`);
  const fim = codigo.slice(inicio + assinatura.length).search(/\n(async )?function |\nescopo\.ouvir\(/);
  return fim < 0 ? codigo.slice(inicio) : codigo.slice(inicio, inicio + assinatura.length + fim);
}

let casos = 0;
const caso = (nome, fn) => { fn(); casos++; console.log(`  ok  ${nome}`); };

caso("peça fora do tecido não abre janela: o resultado já conta embaixo", () => {
  assert.ok(!codigo.includes("Há peças fora do tecido"), "a janela das peças fora do tecido voltou");
  // E o texto embaixo do resultado continua dizendo quais e o que fazer.
  assert.match(corpo("function renderResultado("), /encaixeSobras\.textContent =/);
});

console.log(`\nbancada:janelas — ${casos} casos ok`);
