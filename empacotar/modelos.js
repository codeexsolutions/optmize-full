/**
 * ===========================================================================
 * OS MODELOS DO EXTRATOR — buscar, uma vez
 * ===========================================================================
 *
 * As redes ONNX do Extrator (o recorte, a ampliação e o preenchimento). São
 * grandes e iguais para todo mundo, então não moram no repositório: ficam
 * ignorados no git e são buscadas por este comando.
 *
 * Os dois modelos de rosto do OpenCV Zoo (yunet e sface, 39 MB) saíram junto
 * com o Ponto, em 2026-10-10.
 *
 *     npm run modelos
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const rede = require("../servidor/extrator-rede");
const ampliar = require("../servidor/extrator-ampliar");
const preencher = require("../servidor/extrator-preencher");

const DESTINO = path.join(__dirname, "..", "servidor", "modelos");

/**
 * A soma de verificação não é paranoia: um download que corta no meio dá um
 * arquivo ONNX que abre e dá números errados, e uma rede que erra por arquivo
 * truncado é indistinguível de uma que erra por foto ruim.
 */
const MODELOS = [];

/**
 * A rede de recorte do Extrator: os dois arquivos da escolhida (ver
 * `REDE_DO_EXTRATOR`, em servidor/extrator-rede.js). A lista de onde baixar
 * mora lá, num lugar só, junto da medição que escolheu.
 */
MODELOS.push(...modelosDoExtrator());

MODELOS.push({
  nome: path.basename(ampliar.ARQUIVO), ...ampliar.ORIGEM,
  faz: "amplia o jeito Foto do Extrator (Real-ESRGAN x4v3; BSD-3-Clause)",
});

MODELOS.push({
  nome: path.basename(preencher.ARQUIVO), ...preencher.ORIGEM,
  faz: "inventa o que falta nas peças da camisa (LaMa; Apache 2.0)",
});

function modelosDoExtrator() {
  const nome = rede.REDE_DO_EXTRATOR;
  const origens = rede.ORIGENS[nome];
  const { arquivos, licenca } = rede.ADAPTADORES[nome];
  return [
    { nome: arquivos.codificador, ...origens.codificador, faz: `lê a foto do Extrator (${nome}; ${licenca})` },
    { nome: arquivos.decodificador, ...origens.decodificador, faz: "transforma o clique do Extrator em máscara" },
  ];
}

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
      throw new Error(`${modelo.nome}: ${new URL(modelo.de).host} respondeu ${resposta.status}`);
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
