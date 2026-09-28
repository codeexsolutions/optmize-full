/*
 * BANCADA — a margem de costura
 *
 *     npm run bancada:margem
 *
 * A margem vira o CONTORNO que vai para o Encaixe: um erro aqui é tecido
 * cortado errado em todas as peças daquele molde. Os casos de baixo são os
 * que uma conta de offset ingênua erra: sentido da volta, quina aguda (a
 * ponta iria a metros de distância), fenda mais estreita que duas margens (as
 * paredes trocam de lado sem se cruzar) e vinco côncavo fundo.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const { margemDeCostura } = await carregarModulo("src/motores/margemDeCostura.js");
const caixa = (p) => {
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};
const perto = (a, b) => Math.abs(a - b) < 1e-6;

const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

// 1. Quadrado de 10 com margem 1 vira 12, nos dois sentidos da volta.
for (const volta of [quadrado, [...quadrado].reverse()]) {
  const c = caixa(margemDeCostura(volta, 1));
  assert.ok(perto(c.minX, -1) && perto(c.minY, -1) && perto(c.maxX, 11) && perto(c.maxY, 11), JSON.stringify(c));
}

// 2. Margem zero devolve o mesmo contorno.
assert.deepEqual(margemDeCostura(quadrado, 0), quadrado);

// 3. Quina aguda é aparada: a ponta não passa de 3 margens.
{
  const agudo = [{ x: 0, y: 0 }, { x: 1, y: 20 }, { x: 2, y: 0 }];
  const r = margemDeCostura(agudo, 1);
  assert.equal(r.length, 4, "a ponta vira dois pontos");
  assert.ok(caixa(r).maxY < 20 + 3);
}

// 4. Fenda mais estreita que duas margens: não há contorno certo — null.
{
  const u = [
    { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 3, y: 10 },
    { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 10 }, { x: 0, y: 10 },
  ];
  assert.equal(margemDeCostura(u, 1), null);
  assert.equal(margemDeCostura(u, 1.5), null);
  assert.equal(margemDeCostura(u, 0.3).length, 8, "com folga, a fenda continua");
}

// 5. Vinco côncavo largo: o fundo sobe pela bissetriz, e o contorno é válido.
{
  const v = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 7, y: 10 },
    { x: 5, y: 7 }, { x: 3, y: 10 }, { x: 0, y: 10 },
  ];
  const r = margemDeCostura(v, 1);
  assert.ok(r, "não pode dar null");
  const fundo = r.find((p) => perto(p.x, 5));
  assert.ok(fundo && fundo.y > 8.5 && fundo.y < 9, `fundo em ${JSON.stringify(fundo)}`);
}

// 6. Vinco côncavo estreito e fundo: null (o bevel alargaria o vinco).
{
  const v = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5.2, y: 10 },
    { x: 5, y: 3 }, { x: 4.8, y: 10 }, { x: 0, y: 10 },
  ];
  assert.equal(margemDeCostura(v, 1), null);
}

// 7. Círculo de raio 5 com margem 1 vira raio 6.
{
  const circ = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    circ.push({ x: 10 + 5 * Math.cos(a), y: 10 + 5 * Math.sin(a) });
  }
  const c = caixa(margemDeCostura(circ, 1));
  assert.ok(Math.abs(c.maxX - 16) < 0.01 && Math.abs(c.minX - 4) < 0.01, JSON.stringify(c));
}

// 8. Ponto repetido (acontece no achatar das curvas) não quebra a conta.
{
  const repetido = [quadrado[0], quadrado[1], quadrado[1], quadrado[2], quadrado[3], quadrado[0]];
  const c = caixa(margemDeCostura(repetido, 1));
  assert.ok(perto(c.maxX, 11));
}

console.log("OK — a margem de costura confere.");
