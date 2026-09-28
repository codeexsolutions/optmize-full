/*
 * BANCADA — as contas de mexer num risco de nós com alça
 *
 *     npm run bancada:nos
 *
 * Saíram do Digitalizar quando a Montagem passou a editar o mesmo risco. O que
 * mais importa aqui é o "pôr nó no traço não muda o desenho": se mudasse, cada
 * nó novo entortaria a peça um pouco, e a pessoa só veria no tecido.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const m = await carregarModulo("src/motores/edicaoDeNos.js");
const perto = (a, b, tol = 1e-9) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
const reto = (x, y) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });

// Um quadrado de retas.
const quadrado = [reto(0, 0), reto(10, 0), reto(10, 10), reto(0, 10)];

// 1. Pôr nó numa reta: cai em cima dela, e as duas metades continuam retas.
{
  const r = m.inserirNoNoTraco(quadrado, 0, 0.5);
  assert.equal(r.length, 5);
  assert.ok(perto(r[1], { x: 5, y: 0 }));
  assert.ok(r.every((n) => n.retaDepois), "partir reta não inventa curva");
  assert.equal(quadrado.length, 4, "não mexe na lista recebida");
}

// 2. Pôr nó numa curva não muda o desenho.
{
  const a = { x: 0, y: 0, entrada: { x: 0, y: 0 }, saida: { x: 3, y: 8 }, retaDepois: false };
  const b = { x: 10, y: 0, entrada: { x: 7, y: 8 }, saida: { x: 10, y: 0 }, retaDepois: true };
  const c = reto(5, -5);
  const nos = [a, b, c];
  const antes15 = m.pontoNoTrecho(nos, 0, 0.15);
  const antes65 = m.pontoNoTrecho(nos, 0, 0.65);
  const r = m.inserirNoNoTraco(nos, 0, 0.3);
  assert.ok(perto(m.pontoNoTrecho(r, 0, 0.5), antes15, 1e-9), "primeira metade igual");
  assert.ok(perto(m.pontoNoTrecho(r, 1, 0.5), antes65, 1e-9), "segunda metade igual");
}

// 3. Pôr nó no ÚLTIMO trecho (o que fecha a volta).
{
  const r = m.inserirNoNoTraco(quadrado, 3, 0.5);
  assert.equal(r.length, 5);
  assert.ok(perto(r[4], { x: 0, y: 5 }));
}

// 4. Apagar: piso de três nós.
assert.equal(m.apagarNo([reto(0, 0), reto(1, 0), reto(0, 1)], 0), null);
assert.equal(m.apagarNo(quadrado, 1).length, 3);

// 5. Mover o nó leva as alças junto.
{
  const curvo = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  const r = m.moverPega(curvo, { no: 0, parte: "no" }, { x: 2, y: 3 });
  assert.ok(perto(r[0].entrada, { x: 1, y: 3 }));
  assert.ok(perto(r[0].saida, { x: 3, y: 3 }));
}

// 6. Alça de nó de curva espelha a outra; de canto, não.
{
  const liso = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  const r = m.moverPega(liso, { no: 0, parte: "entrada" }, { x: -2, y: 1 });
  assert.ok(perto(r[0].saida, { x: 2, y: -1 }));
  const canto = [{ ...liso[0], canto: true }, liso[1], liso[2]];
  const r2 = m.moverPega(canto, { no: 0, parte: "entrada" }, { x: -2, y: 1 });
  assert.ok(perto(r2[0].saida, { x: 1, y: 0 }));
}

// 7. Reta vira curva com alças a um terço, e volta.
{
  const r = m.alternarLado(quadrado, 0, "depois");
  assert.equal(r[0].retaDepois, false);
  assert.ok(perto(r[0].saida, { x: 10 / 3, y: 0 }));
  assert.ok(perto(r[1].entrada, { x: 20 / 3, y: 0 }));
  const volta = m.alternarLado(r, 1, "antes");
  assert.equal(volta[0].retaDepois, true);
}

// 8. O que está sob o ponteiro: alça do nó ativo antes do nó.
{
  const nos = [{ x: 0, y: 0, entrada: { x: -1, y: 0 }, saida: { x: 1, y: 0 } }, reto(10, 0), reto(5, 5)];
  assert.equal(m.pegaSob(nos, { x: 1, y: 0.1 }, 0.5, 0).parte, "saida");
  assert.equal(m.pegaSob(nos, { x: 1, y: 0.1 }, 0.5, null), null, "sem nó ativo, alça não pega");
  assert.equal(m.pegaSob(nos, { x: 10.2, y: 0 }, 0.5, null).no, 1);
  const t = m.tracoSob(quadrado, { x: 4, y: 0.2 }, 0.5);
  assert.equal(t.no, 0);
  assert.ok(Math.abs(t.t - 0.4) < 0.07);
}

console.log("OK — as contas de edição de nós conferem.");
