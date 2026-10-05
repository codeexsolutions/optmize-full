/*
 * BANCADA LOCAL — o PLT graduado da Audaces, nos modelos de verdade
 *
 *     npm run bancada:plt-graduado
 *
 * Fora da CI, como a `bancada:curvas-reais`: lê os modelos de
 * `D:\arte\Moldes e modelagens\molde fitness` (cada pasta com o `.plt` e, quase
 * sempre, o `.adsx`). Sem a pasta, avisa e sai. Nenhum arquivo de cliente entra
 * no repositório.
 *
 * O `data.xml` do `.adsx` é o gabarito: a largura e a altura de cada peça em
 * cada tamanho. Conta-se, das peças que o PLT traz:
 *
 *   - com gabarito (`casarComOGabarito`): as que saem com todos os tamanhos;
 *   - sem gabarito (`agruparTamanhos`): as que o agrupamento acerta sozinho.
 *
 * Os pisos são os medidos em 2026-10-05; subir é melhora, cair é reprovação.
 * Ver docs/superpowers/specs/2026-10-05-importar-molde-graduado-design.md.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { carregarModulo } from "./carregarModulo.mjs";

const PASTA = "D:/arte/Moldes e modelagens/molde fitness";
if (!fs.existsSync(PASTA)) {
  console.log("bancada:plt-graduado — sem a pasta dos moldes da Audaces nesta máquina; pulando.");
  process.exit(0);
}
globalThis.document ??= { createElement: () => ({ getContext: () => ({}) }) };
const g = await carregarModulo("src/motores/pltGraduado.js");
const a = await carregarModulo("src/motores/audacesAdsx.js");

const PISO_COM_GABARITO = 55;
const PISO_SEM_GABARITO = 42;

const casa = (l, m) => (Math.abs(l.largura - m.largura) <= 0.1 && Math.abs(l.altura - m.altura) <= 0.1)
  || (Math.abs(l.largura - m.altura) <= 0.1 && Math.abs(l.altura - m.largura) <= 0.1);

let presentes = 0, completas = 0, acertosSem = 0;
for (const nome of fs.readdirSync(PASTA).sort()) {
  const dir = path.join(PASTA, nome);
  if (!fs.statSync(dir).isDirectory()) continue;
  const plt = fs.readdirSync(dir).find((f) => /\.plt$/i.test(f));
  const adsx = fs.readdirSync(dir).find((f) => /\.adsx$/i.test(f));
  if (!plt || !adsx) continue;
  const bytes = fs.readFileSync(path.join(dir, plt));
  let texto = "";
  for (let i = 0; i < bytes.length; i += 8192) texto += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  const r = g.lacosDoPLT(texto);
  assert.ok(!r.erro, `${nome}: ${r.erro}`);
  const gab = await a.lerAdsx(new Uint8Array(fs.readFileSync(path.join(dir, adsx))));
  assert.ok(!gab.erro, `${nome}: ${gab.erro}`);

  // As peças que o PLT traz: ao menos um tamanho com a medida de algum laço.
  const noPlt = gab.pecas.filter((p) => Object.values(p.porTamanho).some((m) => r.lacos.some((l) => casa(l, m))));
  presentes += noPlt.length;

  // Com gabarito: completas, e cada laço casado tem a medida do seu tamanho.
  const casado = g.casarComOGabarito(r.lacos, gab);
  const completasAqui = casado.pecas.filter((p) => p.faltam.length === 0).length;
  for (const p of casado.pecas) {
    const doGab = gab.pecas.find((x) => x.nome === p.nome);
    for (const [t, l] of Object.entries(p.porTamanho)) assert.ok(casa(l, doGab.porTamanho[t]), `${nome}: ${p.nome} ${t}`);
  }
  completas += completasAqui;

  // Sem gabarito: a peça do XML acertada quando um grupo tem exatamente os tamanhos dela.
  const agrupado = g.agruparTamanhos(r.lacos);
  let acertos = 0;
  for (const p of noPlt) {
    const medidas = gab.tamanhos.map((t) => p.porTamanho[t]).filter(Boolean)
      .filter((m, i, todas) => todas.findIndex((o) => Math.abs(o.largura - m.largura) <= 0.1 && Math.abs(o.altura - m.altura) <= 0.1) === i);
    if (agrupado.pecas.some((gr) => gr.lacos.length === medidas.length && gr.lacos.every((l, i) => casa(l, medidas[i])))) acertos++;
  }
  acertosSem += acertos;
  console.log(`${nome.padEnd(18)} ${String(r.lacos.length).padStart(3)} laços · peças no PLT ${String(noPlt.length).padStart(2)}`
    + ` · com gabarito ${String(completasAqui).padStart(2)} completas · sem gabarito ${String(acertos).padStart(2)}`);
}

console.log(`\nbancada:plt-graduado — ${presentes} peças nos PLT: com gabarito ${completas} completas, sem gabarito ${acertosSem}.`);
assert.ok(completas >= PISO_COM_GABARITO, `com gabarito caiu: ${completas} < ${PISO_COM_GABARITO}`);
assert.ok(acertosSem >= PISO_SEM_GABARITO, `sem gabarito caiu: ${acertosSem} < ${PISO_SEM_GABARITO}`);
