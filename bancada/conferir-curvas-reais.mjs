/*
 * BANCADA LOCAL — os moldes reais viram automáticos sem mudar o desenho
 *
 *     npm run bancada:curvas-reais
 *
 * Fora da CI, como a `bancada:guardados`: lê o `dados.db` DESTA máquina, só
 * para leitura. Sem o banco, avisa e sai. Nenhum molde de cliente entra no
 * repositório.
 *
 * O nó liso automático (spec de 2026-10-05) promete que um molde que já existe
 * não muda de forma: o nó liso de hoje vira automático com os números das
 * alças que ele tem, e as alças refeitas ficam a até 0,002 mm (o banco guarda 4 casas). A junção
 * reta/curva é a exceção combinada (a curva gira até 2° para sair da reta) e é
 * contada à parte.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { carregarModulo } from "./carregarModulo.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANCO = path.join(RAIZ, "dados.db");
if (!fs.existsSync(BANCO)) {
  console.log("bancada:curvas-reais — sem dados.db nesta máquina; pulando.");
  process.exit(0);
}
const Database = createRequire(import.meta.url)("better-sqlite3");
const m = await carregarModulo("src/motores/edicaoDeNos.js");

const db = new Database(BANCO, { readonly: true });
const linhas = db.prepare(`SELECT p.id, p.nos, p.tamanho, p.papel, m.nome AS molde
  FROM molde_pecas p JOIN moldes m ON m.id = p.molde_id WHERE p.nos IS NOT NULL`).all();
db.close();

const DOIS_MICRONS = 2e-4; // cm: 0,002 mm — o arredondamento de 4 casas do banco já dá 0,001
let pecas = 0;
let total = 0;
let viraram = 0;
let juncoes = 0;
let maior = 0;
const porMolde = new Map();
for (const linha of linhas) {
  let nos;
  try { nos = JSON.parse(linha.nos); } catch { continue; }
  if (!Array.isArray(nos) || nos.length < 3) continue;
  pecas++;
  const n = nos.length;
  const r = m.refazerAlcas(m.derivarAuto(nos));
  const conta = porMolde.get(linha.molde) ?? { nos: 0, viraram: 0, juncoes: 0, ficaram: 0 };
  for (let i = 0; i < n; i++) {
    total++;
    conta.nos++;
    if (!r[i].auto) { conta.ficaram++; continue; }
    const juncao = !!nos[(i - 1 + n) % n].retaDepois !== !!nos[i].retaDepois;
    if (juncao) { juncoes++; conta.juncoes++; continue; }
    viraram++;
    conta.viraram++;
    const d = Math.max(
      Math.hypot(r[i].entrada.x - nos[i].entrada.x, r[i].entrada.y - nos[i].entrada.y),
      Math.hypot(r[i].saida.x - nos[i].saida.x, r[i].saida.y - nos[i].saida.y),
    );
    maior = Math.max(maior, d);
    assert.ok(d <= DOIS_MICRONS + 1e-12, `${linha.molde} ${linha.tamanho} ${linha.papel}, nó ${i}: a alça andou ${(d * 10).toFixed(4)} mm`);
  }
  porMolde.set(linha.molde, conta);
}

console.log("molde                 nós   lisos→auto   junções   ficaram");
for (const [nome, c] of porMolde) {
  console.log(`${String(nome).padEnd(20)} ${String(c.nos).padStart(4)} ${String(c.viraram).padStart(12)} ${String(c.juncoes).padStart(9)} ${String(c.ficaram).padStart(9)}`);
}
console.log(`\nbancada:curvas-reais — ${pecas} peças, ${total} nós: ${viraram} lisos viraram automáticos `
  + `(a maior alça andou ${(maior * 10).toFixed(5)} mm), ${juncoes} junções reta/curva, ${total - viraram - juncoes} ficaram como estavam.`);
