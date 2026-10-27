/**
 * ===========================================================================
 * AS PORTAS DE ENTRADA DO MOTOR NA BANCADA
 * ===========================================================================
 *
 * A lista dos módulos que a bancada empacota com o esbuild (`bancada/motor.js`)
 * e carrega na memória do Node para medir. Mora num arquivo só porque três
 * conferências a leem, e três cópias da mesma lista envelhecem em silêncio.
 *
 * Até 2026-10-27 havia uma segunda lista, a do servidor (`empacotar/motor.js`),
 * para o encaixe pedido pelo CorelDRAW. As macros do Corel saíram do programa
 * e ela foi junto.
 *
 * Não é ordem de carregamento — é só o conjunto de portas de entrada; quem
 * descobre a ordem é o esbuild, pelos `import` de verdade.
 */

const PARA_A_BANCADA = [
  "motores/encaixeMotor.js",
  "motores/encaixeMascara.js",
  "motores/encaixeGiro.js",
  "motores/encaixeRede.mjs",
  "motores/encaixeWasm.js",
  "utils/geometria.ts",
  "motores/encaixeSobreposicao.js",
  "motores/encaixeEncolher.js",
  "motores/conferenciaDaArte.js",
];

module.exports = { PARA_A_BANCADA };
