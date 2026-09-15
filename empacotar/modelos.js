/**
 * ===========================================================================
 * OS MODELOS DE RECONHECIMENTO — buscar, uma vez
 * ===========================================================================
 *
 * Dois arquivos ONNX do OpenCV Zoo (Apache 2.0) que o reconhecimento facial
 * precisa. São 39 MB e iguais para todo mundo, então não moram no repositório:
 * ficam ignorados no git e são buscados por este comando.
 *
 * São servidos pelo endpoint de mídia do GitHub, e não pelo `raw`: o repositório
 * usa git-lfs, e o `raw` devolve um ponteiro de texto de 130 bytes que parece um
 * download bem-sucedido até a hora de abrir.
 *
 *     npm run modelos
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DESTINO = path.join(__dirname, "..", "servidor", "modelos");
const BASE = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models";

/**
 * A soma de verificação não é paranoia: um download que corta no meio dá um
 * arquivo ONNX que abre e dá números errados, e um reconhecimento que erra por
 * arquivo truncado é indistinguível de um que erra por câmera ruim.
 */
const MODELOS = [
  {
    nome: "yunet.onnx",
    de: `${BASE}/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
    tamanho: 232589,
    sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    faz: "acha o rosto e os cinco pontos (olhos, nariz, cantos da boca)",
  },
  {
    nome: "sface.onnx",
    de: `${BASE}/face_recognition_sface/face_recognition_sface_2021dec.onnx`,
    tamanho: 38696353,
    sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    faz: "transforma o rosto endireitado em 128 números",
  },
];

function soma(caminho) {
  return crypto.createHash("sha256").update(fs.readFileSync(caminho)).digest("hex");
}

(async () => {
  fs.mkdirSync(DESTINO, { recursive: true });

  for (const modelo of MODELOS) {
    const caminho = path.join(DESTINO, modelo.nome);

    if (fs.existsSync(caminho) && soma(caminho) === modelo.sha256) {
      console.log(`modelos: ${modelo.nome} já está aqui e confere`);
      continue;
    }

    process.stdout.write(`modelos: baixando ${modelo.nome} (${(modelo.tamanho / 1048576).toFixed(1)} MB)… `);
    const resposta = await fetch(modelo.de);
    if (!resposta.ok) {
      console.log("");
      throw new Error(`${modelo.nome}: o GitHub respondeu ${resposta.status}`);
    }
    const bytes = Buffer.from(await resposta.arrayBuffer());
    fs.writeFileSync(caminho, bytes);

    const conferida = soma(caminho);
    if (conferida !== modelo.sha256) {
      throw new Error(
        `${modelo.nome}: veio diferente do esperado.\n` +
        `  esperava ${modelo.sha256}\n  recebi   ${conferida}`
      );
    }
    console.log(`ok — ${modelo.faz}`);
  }

  console.log("modelos: prontos em servidor/modelos");
})().catch((erro) => {
  console.error("modelos:", erro.message);
  process.exit(1);
});
