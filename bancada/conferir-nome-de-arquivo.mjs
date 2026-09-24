/*
 * ===========================================================================
 * BANCADA — a quantidade que vem no nome do arquivo
 * ===========================================================================
 *
 *     npm run bancada:nomes
 *
 * "costas 5x.png" são cinco costas. É como as gráficas nomeiam arquivo, e o
 * programa lê isso para não obrigar ninguém a digitar a quantidade peça por
 * peça num pedido de trinta arquivos.
 *
 * ESTE ENSAIO EXISTE POR CAUSA DE UM ERRO QUE CHEGOU À PRODUÇÃO: "frente
 * 2XX.png" entrava no encaixe como UMA peça. O leitor aceitava um X só, e
 * quem escreve "2XX" ou "10XXXX" perdia a quantidade sem aviso nenhum — o
 * operador só descobria depois de a impressora cuspir menos peça do que o
 * pedido.
 *
 * O QUE ESTE ARQUIVO PROTEGE não é o caso que já quebrou: é o LADO DE LÁ. A
 * tentação, ao consertar, é alargar a regra até "qualquer número perto de um
 * x" — e aí "camisa 2XG" (um tamanho) vira duas camisas, e "bandeira 30x40"
 * (uma medida) vira trinta bandeiras. Os casos marcados `1` aqui embaixo são
 * tão importantes quanto os outros.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O MÓDULO É CARREGADO POR `data:`
 * ---------------------------------------------------------------------------
 *
 * `motores/nomeDeArquivo.js` é ESM, e o `package.json` não tem
 * `"type": "module"` — então o Node lê aquele `.js` como CommonJS e engasga
 * no `export`. Renomear para `.mjs` resolveria no Node e quebraria no
 * TypeScript, que não resolve `.mjs` a partir de um import sem extensão
 * (provado: `EditorDeMolde.tsx` deixa de achar o módulo).
 *
 * Então o ensaio lê o arquivo e o importa como módulo por URL de dados. É
 * feio, e é a única coisa feia daqui: o que se testa é o arquivo de verdade,
 * sem cópia que possa envelhecer.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const FONTE = readFileSync(join(AQUI, "..", "src", "motores", "nomeDeArquivo.js"), "utf8");

const { lerQuantidadeDoNome } = await import(
  "data:text/javascript;charset=utf-8," + encodeURIComponent(FONTE)
);

/** [nome do arquivo, quantidade esperada, nome da peça esperado] */
const CASOS = [
  // ── como a loja escreve, com o X depois do número ──────────────────────
  ["costas 5x", 5, "costas"],
  ["manga4x", 4, "manga"],
  ["costas-8x", 8, "costas"],
  ["frente 12X", 12, "frente"],
  ["frente(2x)", 2, "frente"],

  // ── com o X na frente ───────────────────────────────────────────────────
  ["frente X3", 3, "frente"],
  ["frente x4", 4, "frente"],
  ["X3 frente", 3, "frente"],
  ["frente_X3", 3, "frente"],
  ["frente X 3", 3, "frente"],
  ["frente X03", 3, "frente"],

  // ── O X REPETIDO: o erro que trouxe este arquivo ────────────────────────
  ["frente 2XX", 2, "frente"],
  ["camisa 3XX", 3, "camisa"],
  ["arte 10XXXX", 10, "arte"],
  ["frente 2xx", 2, "frente"],
  ["frente XX3", 3, "frente"],

  // ── O QUE NÃO É QUANTIDADE, e não pode virar uma ────────────────────────
  // Medida: número dos dois lados do x.
  ["bandeira 30x40", 1, "bandeira 30x40"],
  // Tamanho: o que vem depois do X não é fim nem separador.
  ["camisa 2XG", 1, "camisa 2XG"],
  ["camisa 3XL", 1, "camisa 3XL"],
  // X sem número nenhum.
  ["frente xxx", 1, "frente xxx"],
  // A palavra que termina em x, e o número que é outra coisa.
  ["max 3", 1, "max 3"],
  // A medida fica no nome, e a quantidade é a do fim.
  ["frente 30x40 5x", 5, "frente 30x40"],
];

let falhas = 0;

for (const [arquivo, qtdEsperada, nomeEsperado] of CASOS) {
  const r = lerQuantidadeDoNome(arquivo);
  const certo = r.qtd === qtdEsperada && r.nome === nomeEsperado;
  if (!certo) falhas++;
  console.log(
    `${certo ? "  ok " : "FALHA"} ${arquivo.padEnd(18)} → ${String(r.qtd).padEnd(3)} ${r.nome}` +
      (certo ? "" : `   (esperado: ${qtdEsperada} ${nomeEsperado})`),
  );
}

console.log(`\n${CASOS.length - falhas}/${CASOS.length} casos certos`);
if (falhas) process.exit(1);
