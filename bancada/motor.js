/**
 * A bancada carrega o motor de encaixe fora do navegador.
 *
 * Os arquivos do motor (`public/geometria.js` e companhia) são <script> soltos:
 * nada de `export`, nada de `require`. No navegador eles dividem o escopo da
 * página; no worker, o do `importScripts`. Aqui a mesma coisa é feita à mão —
 * o conteúdo dos sete arquivos é concatenado dentro de uma função só, e o que
 * a bancada precisa sai pelo `return`.
 *
 * Por que não `vm.createContext`: as tipadas (`Int32Array`) de um contexto do
 * `vm` são de outro realm, e o WebAssembly reclama ao receber a memória. Uma
 * função basta, e sai mais barato.
 *
 * A ORDEM É A MESMA DO `public/encaixe-worker.js`. Se um arquivo entrar lá,
 * entra aqui — senão a bancada mede um motor que não é o que roda.
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

// A mesma lista, na mesma ordem, do importScripts do encaixe-worker.js.
const ARQUIVOS = [
  "public/geometria.js",
  "public/encaixe-giro.js",
  "public/encaixe-mascara.js",
  "public/encaixe-rede.js",
  "public/encaixe-wasm.js",
  "public/encaixe-motor.js",
];

// O que a bancada alcança de dentro do motor.
const EXPOSTOS = [
  "buscarMelhorEncaixe", "encaixarContorno", "encaixarPorVaos", "encaixar",
  "montarUnidades", "montarUnidadesCruzadas", "formasDaPeca", "formaDePartes",
  "mascarasDeSilhueta", "silhuetaDeDados", "grade", "gradeDaPeca",
  "assinaturaDoTrabalho", "vetorDoTrabalho", "juntarGrupos", "familiaDaUnidade",
  "carregarMotorWasm", "temMotorWasm",
];

function montarFonte() {
  const partes = ARQUIVOS.map((rel) => {
    const texto = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    return `// ===== ${rel} =====\n${texto}`;
  });
  return `${partes.join("\n;\n")}\n;return { ${EXPOSTOS.join(", ")} };`;
}

/**
 * Sobe uma instância do motor.
 *
 * `comWasm` liga o motor rápido (o mesmo `estatico/encaixe.wasm` que o
 * navegador carrega). Vale medir dos dois jeitos: sem ele o JavaScript é a
 * referência de correção, com ele é o que a produção roda de verdade.
 */
async function carregarMotor({ comWasm = true } = {}) {
  // eslint-disable-next-line no-new-func
  const motor = new Function(montarFonte())();
  motor.comWasm = false;
  if (comWasm) {
    const bytes = fs.readFileSync(path.join(RAIZ, "estatico/encaixe.wasm"));
    motor.comWasm = await motor.carregarMotorWasm(bytes);
  }
  return motor;
}

module.exports = { carregarMotor, ARQUIVOS };
