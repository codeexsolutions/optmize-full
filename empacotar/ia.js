/**
 * ===========================================================================
 * IA — põe o runtime do onnxruntime-web em `estatico/ia/`
 * ===========================================================================
 *
 * A tela de Imagem roda uma rede neural dentro do navegador. O runtime dela
 * vem do pacote `onnxruntime-web`, que tem 137 MB — quase tudo build para
 * plataforma que não usamos. Este script copia só o que a tela pede.
 *
 * POR QUE ISTO EXISTE, em vez de o arquivo ficar no git: são 25 MB de
 * WebAssembly que o npm já entrega. Versionar seria guardar uma segunda cópia
 * do mesmo byte, e ela envelheceria sozinha na primeira vez que alguém
 * atualizasse o pacote e esquecesse de recopiar.
 *
 * O MODELO é o contrário e fica versionado: ele não vem de pacote nenhum, e
 * sem ele a tela não existe. Ver `estatico/ia/realesr-general-x4v3.onnx`.
 *
 * QUAL BUILD, E POR QUÊ SÓ UM
 * ---------------------------
 * O `onnxruntime-web` publica quatro WebAssembly diferentes: o simples
 * (13,6 MB), o `jsep`, o `jspi` e o `asyncify` (25 MB). A partir da 1.29 é o
 * ASYNCIFY que o caminho de WebGPU carrega — medido aqui, não lido: pedir
 * WebGPU sem ele dá "Failed to fetch dynamically imported module".
 *
 * E ele sozinho serve os DOIS caminhos. Medido nesta máquina, com só o
 * asyncify presente: WebGPU 366 ms por ladrilho, CPU 2222 ms. Levar também o
 * build simples para o caso da CPU custaria 13,6 MB para não mudar nada.
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DE = path.join(RAIZ, "node_modules", "onnxruntime-web", "dist");
const PARA = path.join(RAIZ, "estatico", "ia");

/** O runtime, e nada além dele. */
const LEVAR = [
  "ort.webgpu.bundle.min.mjs",          // a biblioteca
  "ort-wasm-simd-threaded.asyncify.mjs", // o carregador que ela importa
  "ort-wasm-simd-threaded.asyncify.wasm", // o runtime em si
];

/** O que tem que estar lá e não vem daqui. */
const MODELO = "realesr-general-x4v3.onnx";

if (!fs.existsSync(DE)) {
  console.error(
    "ia: não achei o onnxruntime-web em node_modules.\n"
    + "Rode `npm install` antes — ele é devDependency, então vem com ele.",
  );
  process.exit(1);
}

fs.mkdirSync(PARA, { recursive: true });

let total = 0;
for (const nome of LEVAR) {
  const origem = path.join(DE, nome);
  if (!fs.existsSync(origem)) {
    console.error(
      `ia: o pacote onnxruntime-web não tem "${nome}".\n`
      + "Provavelmente a versão mudou os nomes dos builds. Confira em\n"
      + "node_modules/onnxruntime-web/dist e ajuste a lista em empacotar/ia.js.",
    );
    process.exit(1);
  }
  fs.copyFileSync(origem, path.join(PARA, nome));
  total += fs.statSync(origem).size;
}

// O modelo não é copiado — é conferido. Se ele sumiu do git, a tela abriria e
// só falharia na hora de melhorar a imagem, que é o pior momento para
// descobrir.
const modelo = path.join(PARA, MODELO);
if (!fs.existsSync(modelo)) {
  console.error(
    `ia: falta o modelo em estatico/ia/${MODELO}.\n`
    + "Ele é versionado no git; um `git checkout` do arquivo resolve.",
  );
  process.exit(1);
}
total += fs.statSync(modelo).size;

console.log(`ia: ${LEVAR.length} arquivos + o modelo em estatico/ia`
  + ` (${(total / 1048576).toFixed(1)} MB)`);
