/**
 * ===========================================================================
 * COR — converter arte CMYK para sRGB aplicando o perfil ICC do arquivo
 * ===========================================================================
 *
 * Por que isto existe
 * -------------------
 * O programa carrega toda arte por canvas, e canvas só existe em RGB. Um JPEG
 * CMYK chega lá pela conversão do navegador: rápida, sem gerenciamento de cor,
 * e diferente da que o Photoshop faria com o perfil de impressão embutido. O
 * desenho sai certo; a cor não é a que o cliente aprovou. Metade das artes desta
 * loja está nesse caso ou sem perfil nenhum (ver public/cor-do-arquivo.js).
 *
 * Aqui a conversão é feita direito, e uma vez só: o arquivo entra CMYK, sai
 * sRGB, e o encaixe passa a receber uma arte que o canvas entende. É por isso
 * que isto roda numa tela separada — converter 15 MB de arte custa segundos, e
 * esse custo não pode cair em cima de quem só quer encaixar.
 *
 * O caminho da cor
 * ----------------
 *   CMYK do arquivo
 *     -> tabelas de entrada do perfil     (uma curva por tinta)
 *     -> CLUT de 4 dimensões               (a tabela que É o perfil)
 *     -> tabelas de saída                  (uma curva por eixo do Lab)
 *     -> Lab (D50)
 *     -> XYZ (D50) -> XYZ (D65)            (adaptação de Bradford)
 *     -> sRGB linear -> sRGB com gama
 *
 * Nada disso é invenção: é o que a especificação do ICC manda fazer com uma tag
 * `A2B`, e é o que qualquer motor de cor faz. O que existe aqui é a leitura da
 * tag e as contas — sem biblioteca, porque o perfil é um formato binário
 * simples e a matemática é fechada.
 *
 * O que NÃO está aqui
 * -------------------
 * Gamut mapping além do que a própria tabela do perfil já faz, perfis v4 com
 * `mAB` (os de impressão que esta loja usa são todos v2 com `mft2`), e
 * conversão de volta para CMYK. Se aparecer um perfil que este arquivo não sabe
 * ler, ele diz que não sabe — e aí a arte segue pelo caminho de sempre, com o
 * aviso que a tela já mostra.
 */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const jpeg = require("jpeg-js");

/**
 * O decodificador de JPEG, no estágio em que os pixels ainda são CMYK.
 *
 * O `jpeg-js` só exporta `decode()`, e `decode()` de um CMYK devolve RGB —
 * convertido com a fórmula ingênua `R = 255 - (C*(1-K) + K)`, que é exatamente
 * a conversão sem gerenciamento de cor que este arquivo existe para
 * substituir. O CMYK está um passo antes, no `getData()` da classe interna
 * `JpegImage`, que o módulo não exporta.
 *
 * Então o módulo é carregado com uma linha a mais no fim, expondo a classe.
 * É o código do próprio pacote instalado, compilado do jeito que o Node
 * compilaria — nada é reescrito nem remendado.
 *
 * Se uma versão futura do `jpeg-js` renomear a classe, `carregar` devolve
 * `null` e a conversão passa a dizer que não sabe converter. É a falha certa:
 * a arte segue pelo caminho de sempre, com o aviso de cor que a tela já
 * mostra, em vez de sair com uma cor inventada.
 */
const JpegCru = (function carregar() {
  try {
    const arquivo = require.resolve("jpeg-js/lib/decoder.js");
    const fonte = [
      fs.readFileSync(arquivo, "utf8"),
      'module.exports.JpegImage = typeof JpegImage !== "undefined" ? JpegImage : null;',
      "",
    ].join("\n");
    const mod = new Module(arquivo, null);
    mod.filename = arquivo;
    mod.paths = Module._nodeModulePaths(path.dirname(arquivo));
    mod._compile(fonte, arquivo);
    const classe = mod.exports.JpegImage;
    return typeof classe === "function" && typeof classe.resetMaxMemoryUsage === "function"
      ? classe : null;
  } catch (erro) {
    console.warn("[cor] não deu para abrir o decodificador de JPEG:", erro.message);
    return null;
  }
})();

// ==================== LER O PERFIL DE DENTRO DO JPEG ====================

/**
 * O ICC no JPEG vem picado em vários APP2, porque cada marcador cabe em 64 KB.
 * Cada pedaço traz o número dele e o total, e é preciso juntá-los na ordem.
 */
function perfilDoJpeg(buffer) {
  const pedacos = [];
  let i = 2;
  while (i < buffer.length - 1) {
    if (buffer[i] !== 0xFF) { i++; continue; }
    const marca = buffer[i + 1];
    if (marca === 0xD8 || marca === 0x01 || (marca >= 0xD0 && marca <= 0xD7)) { i += 2; continue; }
    if (marca === 0xD9 || marca === 0xDA) break;
    const tamanho = buffer.readUInt16BE(i + 2);
    if (marca === 0xE2 && buffer.toString("latin1", i + 4, i + 15) === "ICC_PROFILE") {
      const numero = buffer[i + 16];
      pedacos.push({ numero, dados: buffer.slice(i + 18, i + 2 + tamanho) });
    }
    i += 2 + tamanho;
  }
  if (pedacos.length === 0) return null;
  pedacos.sort((a, b) => a.numero - b.numero);
  return Buffer.concat(pedacos.map((p) => p.dados));
}

/** A tabela de tags do perfil: nome -> onde está e quanto ocupa. */
function tagsDoPerfil(icc) {
  const tags = new Map();
  const quantas = icc.readUInt32BE(128);
  if (!(quantas > 0) || quantas > 500) return tags;
  for (let k = 0; k < quantas; k++) {
    const linha = 132 + k * 12;
    if (linha + 12 > icc.length) break;
    tags.set(icc.toString("latin1", linha, linha + 4), {
      onde: icc.readUInt32BE(linha + 4),
      tamanho: icc.readUInt32BE(linha + 8),
    });
  }
  return tags;
}

// ==================== A TAG A2B: CURVAS + CLUT + CURVAS ====================

/**
 * Lê uma tag `mft2` (lut16Type) ou `mft1` (lut8Type).
 *
 * O desenho é sempre o mesmo: uma curva por canal de entrada, uma tabela
 * multidimensional no meio, e uma curva por canal de saída. O `mft2` guarda
 * tudo em 16 bits e diz quantos pontos cada curva tem; o `mft1` usa 8 bits e
 * tem sempre 256 pontos.
 */
function lerA2B(icc, onde) {
  const tipo = icc.toString("latin1", onde, onde + 4);
  if (tipo !== "mft2" && tipo !== "mft1") return null;

  const entradas = icc[onde + 8];
  const saidas = icc[onde + 9];
  const grade = icc[onde + 10];
  if (!(entradas > 0) || !(saidas > 0) || !(grade > 1)) return null;

  const dezesseis = tipo === "mft2";
  const pontosEntrada = dezesseis ? icc.readUInt16BE(onde + 48) : 256;
  const pontosSaida = dezesseis ? icc.readUInt16BE(onde + 50) : 256;
  let i = onde + (dezesseis ? 52 : 48);

  const ler = () => {
    const v = dezesseis ? icc.readUInt16BE(i) : icc[i];
    i += dezesseis ? 2 : 1;
    return v / (dezesseis ? 65535 : 255);
  };

  const curvasEntrada = [];
  for (let c = 0; c < entradas; c++) {
    const curva = new Float32Array(pontosEntrada);
    for (let k = 0; k < pontosEntrada; k++) curva[k] = ler();
    curvasEntrada.push(curva);
  }

  const total = Math.pow(grade, entradas) * saidas;
  const clut = new Float32Array(total);
  for (let k = 0; k < total; k++) clut[k] = ler();

  const curvasSaida = [];
  for (let c = 0; c < saidas; c++) {
    const curva = new Float32Array(pontosSaida);
    for (let k = 0; k < pontosSaida; k++) curva[k] = ler();
    curvasSaida.push(curva);
  }

  return { entradas, saidas, grade, curvasEntrada, curvasSaida, clut };
}

/** Uma curva de tabela, com interpolação linear entre os pontos. */
function naCurva(curva, valor) {
  const n = curva.length;
  if (n === 1) return curva[0];
  const x = Math.min(1, Math.max(0, valor)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const t = x - i;
  return curva[i] * (1 - t) + curva[i + 1] * t;
}

/**
 * A CLUT, com interpolação multilinear.
 *
 * Com quatro tintas são dezesseis cantos por consulta — cada canto é uma
 * combinação de "arredonda para baixo" e "para cima" em cada eixo, e o peso
 * dele é o produto das frações. É a mesma conta da interpolação bilinear de uma
 * imagem, uma dimensão a mais duas vezes.
 */
function naClut(a2b, entrada, saida) {
  const { grade, entradas, saidas, clut } = a2b;
  const base = new Int32Array(entradas);
  const fracao = new Float64Array(entradas);

  for (let c = 0; c < entradas; c++) {
    const x = Math.min(1, Math.max(0, entrada[c])) * (grade - 1);
    const i = Math.min(grade - 2, Math.floor(x));
    base[c] = i;
    fracao[c] = x - i;
  }

  for (let o = 0; o < saidas; o++) saida[o] = 0;

  const cantos = 1 << entradas;
  for (let canto = 0; canto < cantos; canto++) {
    let peso = 1;
    let indice = 0;
    for (let c = 0; c < entradas; c++) {
      const acima = (canto >> c) & 1;
      peso *= acima ? fracao[c] : 1 - fracao[c];
      indice = indice * grade + (base[c] + acima);
    }
    if (peso === 0) continue;
    const off = indice * saidas;
    for (let o = 0; o < saidas; o++) saida[o] += peso * clut[off + o];
  }
}

// ==================== DO PCS ATÉ O sRGB ====================

/**
 * O Lab de um perfil v2 com `mft`, que usa a codificação antiga: o 100 de
 * luminosidade cai em 0xFF00, e não em 0xFFFF. Ler como se fosse a codificação
 * nova deixa tudo 0,4% mais claro — pouco, e errado.
 */
const LEGADO = 65535 / 65280;

function paraLab(saida) {
  return {
    L: saida[0] * 100 * LEGADO,
    a: saida[1] * 255 * LEGADO - 128,
    b: saida[2] * 255 * LEGADO - 128,
  };
}

// Branco D50, que é o ponto de referência do PCS do ICC.
const BRANCO_D50 = [0.96422, 1.0, 0.82521];

function labParaXyz({ L, a, b }) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t) => (t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29));
  return [f(fx) * BRANCO_D50[0], f(fy) * BRANCO_D50[1], f(fz) * BRANCO_D50[2]];
}

/**
 * XYZ(D50) para sRGB. A matriz já traz a adaptação de Bradford de D50 para o
 * D65 do sRGB embutida — é a matriz que a própria especificação do sRGB
 * publica para perfis com PCS em D50, e usá-la evita fazer duas contas onde
 * uma basta.
 */
const XYZ_D50_PARA_SRGB = [
  [3.1338561, -1.6168667, -0.4906146],
  [-0.9787684, 1.9161415, 0.0334540],
  [0.0719453, -0.2289914, 1.4052427],
];

const comGama = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** Devolve a cor empacotada em 24 bits, para caber num numero so. */
function xyzParaSrgb(xyz) {
  let cor = 0;
  for (let i = 0; i < 3; i++) {
    const m = XYZ_D50_PARA_SRGB[i];
    const linear = m[0] * xyz[0] + m[1] * xyz[1] + m[2] * xyz[2];
    const v = comGama(Math.min(1, Math.max(0, linear)));
    cor = (cor << 8) | Math.round(Math.min(1, Math.max(0, v)) * 255);
  }
  return cor;
}

/**
 * A COMPENSACAO DE PONTO PRETO.
 *
 * O preto de tinta em papel nao e preto: o mais escuro que este perfil alcanca
 * fica em L*22, que na tela e um cinza rgb(56,51,50). Convertido ao pe da letra,
 * o trabalho inteiro chega na tela lavado — e quem abriu o mesmo arquivo no
 * Photoshop viu preto, porque o Photoshop faz esta compensacao por padrao.
 *
 * A conta e uma reta em XYZ: o mais escuro do papel vira o zero da tela, o
 * branco continua branco, e tudo entre os dois anda junto. Assim o contraste da
 * arte volta a ser o que o cliente aprovou, sem torcer matiz nenhuma — cada eixo
 * e esticado pelo mesmo criterio.
 *
 * O ponto preto sai do proprio perfil, perguntando a ele que cor da o preto mais
 * carregado que ele sabe imprimir: as quatro tintas cheias, ou so o preto.
 */
function compensarPreto(pretoXyz) {
  const escala = BRANCO_D50.map((w, i) => {
    const bp = Math.min(pretoXyz[i], w * 0.9);
    return { w, bp, div: w - bp };
  });
  return (xyz) => {
    for (let i = 0; i < 3; i++) {
      const e = escala[i];
      xyz[i] = e.div > 1e-6 ? Math.max(0, e.w * (xyz[i] - e.bp) / e.div) : xyz[i];
    }
    return xyz;
  };
}

// ============ PERFIS DE MATRIZ: Adobe RGB e a família dele ============

/*
 * Um perfil de RGB não precisa de tabela: três primárias e três curvas de gama
 * descrevem o espaço inteiro. É o caso do Adobe RGB, do ProPhoto e do próprio
 * sRGB, e é um caminho bem mais curto que o do CMYK — sem CLUT, sem PCS em Lab.
 *
 * Estes são os arquivos que a tela marca como "perfil diferente de sRGB": o
 * desenho abre, mas o navegador lê os números como se fossem sRGB, e uma arte
 * feita em Adobe RGB chega lavada porque as primárias dele são mais abertas.
 */

/** Uma tag de curva: `curv` (tabela, ou um gama só) ou `para` (fórmula). */
function lerCurva(icc, onde) {
  const tipo = icc.toString("latin1", onde, onde + 4);
  if (tipo === "curv") {
    const quantos = icc.readUInt32BE(onde + 8);
    if (quantos === 0) return (v) => v;                       // identidade
    if (quantos === 1) {                                      // gama em u8Fixed8
      const gama = icc.readUInt16BE(onde + 12) / 256;
      return (v) => Math.pow(v, gama);
    }
    const tabela = new Float32Array(quantos);
    for (let k = 0; k < quantos; k++) tabela[k] = icc.readUInt16BE(onde + 12 + k * 2) / 65535;
    return (v) => naCurva(tabela, v);
  }
  if (tipo === "para") {
    const f = (k) => icc.readInt32BE(onde + 12 + k * 4) / 65536;
    const forma = icc.readUInt16BE(onde + 8);
    const g = f(0), a = f(1), b = f(2), c = f(3), d = f(4), e = f(5), ff = f(6);
    if (forma === 0) return (v) => Math.pow(v, g);
    if (forma === 1) return (v) => (v >= -b / a ? Math.pow(a * v + b, g) : 0);
    if (forma === 2) return (v) => (v >= -b / a ? Math.pow(a * v + b, g) + c : c);
    if (forma === 3) return (v) => (v >= d ? Math.pow(a * v + b, g) : c * v);
    if (forma === 4) return (v) => (v >= d ? Math.pow(a * v + b, g) + e : c * v + ff);
  }
  return null;
}

/** Uma tag `XYZ `: uma coluna da matriz do perfil. */
function lerXyz(icc, onde) {
  if (icc.toString("latin1", onde, onde + 4) !== "XYZ ") return null;
  return [0, 1, 2].map((k) => icc.readInt32BE(onde + 8 + k * 4) / 65536);
}

/**
 * Monta o conversor de um perfil de matriz para sRGB.
 *
 * O caminho é: número do arquivo -> curva de gama -> luz linear -> XYZ pelas
 * três primárias -> matriz do sRGB -> gama do sRGB. Perfis de matriz já vêm
 * adaptados a D50, então a mesma matriz do caminho do CMYK serve aqui.
 */
function conversorDeMatriz(icc) {
  const tags = tagsDoPerfil(icc);
  const cols = ["rXYZ", "gXYZ", "bXYZ"].map((n) => tags.has(n) && lerXyz(icc, tags.get(n).onde));
  const curvas = ["rTRC", "gTRC", "bTRC"].map((n) => tags.has(n) && lerCurva(icc, tags.get(n).onde));
  if (cols.some((c) => !c) || curvas.some((c) => !c)) return null;

  const xyz = new Float64Array(3);
  return (r, g, b) => {
    const lin = [curvas[0](r / 255), curvas[1](g / 255), curvas[2](b / 255)];
    for (let i = 0; i < 3; i++) xyz[i] = cols[0][i] * lin[0] + cols[1][i] * lin[1] + cols[2][i] * lin[2];
    return xyzParaSrgb(xyz);
  };
}

// ==================== A CONVERSÃO ====================

/**
 * Monta o conversor CMYK -> sRGB a partir do perfil embutido no JPEG.
 *
 * Devolve `null` quando não dá para converter direito — sem perfil, perfil sem
 * A2B, tag de tipo desconhecido. Nesses casos é melhor dizer que não sabe do
 * que entregar uma cor inventada com cara de certa.
 */
function conversorDoPerfil(icc, opcoes = {}) {
  if (!icc || icc.length < 132) return null;
  if (icc.toString("latin1", 16, 20) !== "CMYK") return null;
  const pcs = icc.toString("latin1", 20, 24).trim();
  if (pcs !== "Lab") return null;

  const tags = tagsDoPerfil(icc);
  // A1 é o colorimétrico relativo: a cor como ela é, sem o ajuste perceptual
  // que o A0 faz para caber no gamute do papel. É o que se quer para MOSTRAR a
  // arte, que é o uso aqui.
  const tag = tags.get("A2B1") || tags.get("A2B0");
  if (!tag) return null;

  const a2b = lerA2B(icc, tag.onde);
  if (!a2b || a2b.entradas !== 4 || a2b.saidas !== 3) return null;

  const dentro = new Float64Array(4);
  const meio = new Float64Array(3);
  const depois = new Float64Array(3);

  const ateOXyz = (c, m, y, k) => {
    dentro[0] = naCurva(a2b.curvasEntrada[0], c / 255);
    dentro[1] = naCurva(a2b.curvasEntrada[1], m / 255);
    dentro[2] = naCurva(a2b.curvasEntrada[2], y / 255);
    dentro[3] = naCurva(a2b.curvasEntrada[3], k / 255);
    naClut(a2b, dentro, meio);
    for (let o = 0; o < 3; o++) depois[o] = naCurva(a2b.curvasSaida[o], meio[o]);
    return labParaXyz(paraLab(depois));
  };

  if (opcoes.compensarPreto === false) return (c, m, y, k) => xyzParaSrgb(ateOXyz(c, m, y, k));

  // O mais escuro que este perfil alcanca: as quatro tintas cheias, ou so o
  // preto. Perfis com muito limite de tinta as vezes ficam mais escuros no
  // preto sozinho do que na soma das quatro, entao vale perguntar os dois.
  const quatro = ateOXyz(255, 255, 255, 255);
  const soPreto = ateOXyz(0, 0, 0, 255);
  const preto = quatro[1] <= soPreto[1] ? quatro.slice() : soPreto.slice();
  const esticar = compensarPreto(preto);
  return (c, m, y, k) => xyzParaSrgb(esticar(ateOXyz(c, m, y, k)));
}

/**
 * Converte um JPEG CMYK para pixels sRGB.
 *
 * Devolve `{ largura, altura, dados }` com `dados` em RGBA, ou `null` quando o
 * arquivo não é CMYK ou o perfil não dá para aplicar.
 *
 * O `getData` entrega os quatro canais já em TINTA — 0 é papel limpo, 255 é
 * tinta cheia — em qualquer das duas formas que um JPEG de quatro canais pode
 * ter (CMYK invertido do Adobe, ou YCCK). Ele resolve as duas ali dentro, o que
 * poupa este arquivo de adivinhar pelo marcador APP14.
 */
function converterJpegCmyk(buffer, opcoes = {}) {
  const icc = perfilDoJpeg(buffer);
  const converter = conversorDoPerfil(icc, opcoes);
  if (!converter || !JpegCru) return null;

  JpegCru.resetMaxMemoryUsage((opcoes.memoriaMb || 2048) * 1024 * 1024);
  const cru = new JpegCru();
  cru.opts = { colorTransform: undefined };
  cru.parse(new Uint8Array(buffer));
  if (cru.components.length !== 4) return null;

  /*
   * DE QUE LADO ESTÃO AS TINTAS.
   *
   * Num JPEG CMYK o número guardado pode significar as duas coisas opostas:
   *
   *   com o marcador Adobe (APP14)   255 é papel limpo — a tinta vem invertida
   *   sem o marcador                 255 é tinta cheia — a tinta vem direta
   *
   * Errar esse lado não desbota a cor: troca cada tinta pela oposta. Um verde,
   * que é ciano com amarelo, vira magenta com preto — ou seja, rosa escuro. Foi
   * exatamente o que apareceu na produção, e é o que o navegador faz até hoje
   * com esses arquivos, porque ele assume o lado do Adobe para todo mundo.
   *
   * O `jpeg-js` faz a mesma suposição — a ponto de recusar o arquivo quando o
   * marcador não está lá. Então aqui ele é convencido a entregar os números, e a
   * volta é desfeita depois, uma vez só, quando o marcador não existe.
   */
  const comMarcadorAdobe = !!cru.adobe;
  if (!comMarcadorAdobe) cru.adobe = { transformCode: 0 };

  const largura = cru.width;
  const altura = cru.height;
  const tintas = cru.getData(largura, altura);
  if (!comMarcadorAdobe) {
    for (let i = 0; i < tintas.length; i++) tintas[i] = 255 - tintas[i];
  }
  const dados = new Uint8Array(largura * altura * 4);

  /*
   * As artes têm milhões de pixels e poucas cores distintas: fundo chapado,
   * áreas sólidas, degradês curtos. Guardar o resultado de cada CMYK já visto
   * troca "uma travessia da tabela por pixel" por "uma por cor", e a travessia
   * é a parte cara — sedes curvas de entrada, dezesseis cantos da CLUT, três
   * curvas de saída e a matriz.
   */
  const lembradas = new Map();
  for (let p = 0, q = 0; q < dados.length; p += 4, q += 4) {
    const c = tintas[p], m = tintas[p + 1], y = tintas[p + 2], k = tintas[p + 3];
    const chave = (((c << 24) | (m << 16) | (y << 8) | k) >>> 0);
    let cor = lembradas.get(chave);
    if (cor === undefined) {
      cor = converter(c, m, y, k);
      lembradas.set(chave, cor);
    }
    dados[q] = (cor >> 16) & 255;
    dados[q + 1] = (cor >> 8) & 255;
    dados[q + 2] = cor & 255;
    dados[q + 3] = 255;
  }

  return { largura, altura, dados, perfil: nomeDoPerfil(icc), cores: lembradas.size };
}


/** O nome legível do perfil, da tag `desc`. */
function nomeDoPerfil(icc) {
  try {
    const tag = tagsDoPerfil(icc).get("desc");
    if (!tag) return null;
    const tipo = icc.toString("latin1", tag.onde, tag.onde + 4);
    if (tipo !== "desc") return null;
    const quantos = icc.readUInt32BE(tag.onde + 8);
    return icc.toString("latin1", tag.onde + 12, tag.onde + 12 + Math.min(quantos, 64))
      .replace(/\0.*$/, "").trim() || null;
  } catch (erro) {
    return null;
  }
}

/** Converte um JPEG RGB que está num espaço diferente do sRGB. */
function converterJpegRgb(buffer) {
  const icc = perfilDoJpeg(buffer);
  if (!icc || icc.toString("latin1", 16, 20) !== "RGB ") return null;
  const converter = conversorDeMatriz(icc);
  if (!converter) return null;

  const img = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048 });
  const dados = img.data;
  const lembradas = new Map();
  for (let q = 0; q < dados.length; q += 4) {
    const chave = (dados[q] << 16) | (dados[q + 1] << 8) | dados[q + 2];
    let cor = lembradas.get(chave);
    if (cor === undefined) {
      cor = converter(dados[q], dados[q + 1], dados[q + 2]);
      lembradas.set(chave, cor);
    }
    dados[q] = (cor >> 16) & 255;
    dados[q + 1] = (cor >> 8) & 255;
    dados[q + 2] = cor & 255;
    dados[q + 3] = 255;
  }
  return {
    largura: img.width, altura: img.height, dados,
    perfil: nomeDoPerfil(icc), cores: lembradas.size,
  };
}

/**
 * ===========================================================================
 * O QUE A TELA CHAMA
 * ===========================================================================
 *
 * Recebe o arquivo como veio e devolve a arte já em sRGB, num JPEG novo.
 *
 * As miniaturas de comparação não saem daqui. Elas são desenhadas na tela, pelo
 * navegador — ver o cabeçalho de public/cor.js. A primeira versão simulava aqui
 * o "antes", com a fórmula ingênua `R = 255 - (C·(1-K) + K)`, supondo que fosse
 * ela que o navegador usava. Medido, não é: o Chrome aplica o perfil, e o
 * "antes" simulado mostrava uma cor que ninguém veria.
 *
 * Quando não há o que converter, diz isso e não inventa arquivo nenhum. Um
 * JPEG sem perfil é o caso mais comum dessa lista: não existe informação de
 * onde ele veio, e chutar um espaço de origem seria trocar uma cor incerta por
 * outra, com a diferença de que a segunda vem carimbada de certa.
 */
function converterParaSrgb(buffer, opcoes = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const ehJpeg = bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8;
  if (!ehJpeg) {
    return { convertido: false, motivo: "Só JPEG por enquanto — este arquivo é de outro tipo." };
  }

  const icc = perfilDoJpeg(bytes);
  if (!icc) {
    return {
      convertido: false,
      motivo: "Este arquivo não guardou o perfil de cor dele. Sem saber de onde a cor "
        + "veio, não há como convertê-la — o programa vai lê-la como sRGB, que é o "
        + "palpite mais provável.",
    };
  }

  const espaco = icc.toString("latin1", 16, 20);
  const perfil = nomeDoPerfil(icc);
  if (espaco === "RGB " && /srgb/i.test(perfil || "")) {
    return { convertido: false, motivo: "Já está em sRGB — nada a converter.", perfil };
  }

  const img = espaco === "CMYK" ? converterJpegCmyk(bytes, opcoes) : converterJpegRgb(bytes);
  if (!img) {
    return {
      convertido: false, perfil,
      motivo: `O perfil "${perfil || espaco}" está num formato que este programa ainda não lê.`,
    };
  }

  const qualidade = opcoes.qualidade || 92;
  const saida = jpeg.encode({ data: img.dados, width: img.largura, height: img.altura }, qualidade);

  return {
    convertido: true,
    perfil,
    espaco: espaco.trim(),
    largura: img.largura,
    altura: img.altura,
    cores: img.cores,
    arquivo: saida.data,
  };
}

module.exports = {
  perfilDoJpeg, tagsDoPerfil, lerA2B, conversorDoPerfil, conversorDeMatriz,
  converterJpegCmyk, converterJpegRgb, converterParaSrgb, nomeDoPerfil,
};
