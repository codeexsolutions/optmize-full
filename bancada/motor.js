/**
 * A bancada carrega o motor de encaixe fora do navegador.
 *
 * Quem faz o trabalho é o `motores.js` ao lado: ele empacota `src/motores/` com
 * o esbuild — o MESMO que o Vite usa — e o Node importa o resultado. Aqui só
 * ficam a lista de módulos do motor e o WASM.
 *
 * ---------------------------------------------------------------------------
 * COMO ERA ANTES, E POR QUE MUDOU
 * ---------------------------------------------------------------------------
 *
 * Enquanto a casca antiga existiu, este arquivo lia os `<script>` soltos de
 * `public/` e concatenava o TEXTO deles dentro de uma função só, porque
 * naquele formato não havia `export` nem `require` — eles dividiam o escopo da
 * página. A ordem tinha que ser copiada à mão do `importScripts` do worker, e
 * um arquivo que entrasse lá e não entrasse aqui fazia a bancada medir um
 * motor que não era o que rodava.
 *
 * Com módulos isso acabou: quem resolve a ordem é o empacotador, a partir dos
 * `import` de verdade. Não há mais lista para manter em dois lugares.
 *
 * (Por que não `vm.createContext`, que seria o caminho óbvio: as tipadas
 * `Int32Array` de um contexto do `vm` são de outro realm, e o WebAssembly
 * reclama ao receber a memória.)
 */

const fs = require("fs");
const path = require("path");
const { carregarDosMotores, RAIZ } = require("./motores");

/*
 * Os módulos do motor. Não é uma ordem de carregamento — é só o conjunto de
 * portas de entrada; quem descobre a ordem é o esbuild, pelos `import`.
 */
const MODULOS = [
  "motores/encaixeMotor.js",
  "motores/encaixeMascara.js",
  "motores/encaixeGiro.js",
  "motores/encaixeRede.mjs",
  "motores/encaixeWasm.js",
  "utils/geometria.ts",
];

/**
 * Sobe uma instância do motor.
 *
 * `comWasm` liga o motor rápido (o mesmo `estatico/encaixe.wasm` que o
 * navegador carrega). Vale medir dos dois jeitos: sem ele o JavaScript é a
 * referência de correção, com ele é o que a produção roda de verdade.
 */
async function carregarMotor({ comWasm = true } = {}) {
  const motor = await carregarDosMotores(MODULOS);
  motor.comWasm = false;
  if (comWasm) {
    const bytes = fs.readFileSync(path.join(RAIZ, "estatico/encaixe.wasm"));
    motor.comWasm = await motor.carregarMotorWasm(bytes);
  }
  return motor;
}

module.exports = { carregarMotor, MODULOS };
