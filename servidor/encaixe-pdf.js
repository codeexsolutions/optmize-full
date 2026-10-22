/**
 * Gera o PDF do encaixe em tamanho real, para mandar direto para a impressora
 * ou para a mesa de corte.
 *
 * É **um arquivo só**, com exatamente a largura do tecido e o comprimento do
 * encaixe, em centímetros de verdade — imprimindo em escala 1:1, o que sai no
 * papel mede o que a peça mede. E vai só o desenho: nada de régua, nome de peça
 * ou rodapé, porque isso seria impresso junto no tecido.
 *
 * A exceção é a SIGLA DO PEDIDO (2026-10-01): com dois pedidos ou mais no
 * mesmo rolo, cada peça leva `P2 COG3` impresso no canto de baixo, dentro da
 * silhueta, para a separação depois do corte. Quem decide o texto e o lugar
 * é a tela (src/producao/pedidos.js); aqui ele só é escrito (`escreverMarca`).
 *
 * Uma página por bancada
 * ----------------------
 * O rolo já saiu repartido em trechos de 10 m, e a repartição foi tirada
 * inteira em a1b7c6d. O defeito não era repartir: era **onde** o corte caía.
 * Ele procurava um vão entre as peças, e encaixe bom é exatamente o que não
 * deixa vão — num rolo denso as peças se encavalam de ponta a ponta, e o corte
 * acabava passando por cima de uma peça, metade num pedaço e metade no outro.
 * Peça partida é peça perdida.
 *
 * Agora o corte não procura nada. Quando o trabalho tem bancada, o próprio
 * encaixe é feito com a trava de que **nenhuma peça cruza a linha** (ver o
 * cabeçalho da BANCADA em public/encaixe-motor.js): a página nasce de um lugar
 * onde peça nenhuma pode estar. Sem bancada, continua tudo como antes — uma
 * página só, do começo ao fim do rolo.
 *
 * O arquivo continua único nos dois casos. Repartir em vários arquivos exigia
 * que eles entrassem na máquina colados, sem um milímetro de folga entre um e
 * outro, e na prática isso não acontece; páginas do mesmo arquivo não têm esse
 * problema, e ainda dão ao RIP o que ele queria — rasterizar um pedaço de cada
 * vez em vez de segurar 11 metros antes da primeira gota cair.
 *
 * O teto de página, e por que este arquivo o ignora
 * -------------------------------------------------
 * O formato convencionou 14400 pontos (508 cm) como o maior lado de uma
 * página, e um encaixe de 11 metros passa longe disso. A saída canônica é o
 * `/UserUnit`: um campo que diz quanto vale uma unidade da página. Com
 * `/UserUnit 2,36`, uma página de 5 m "de arquivo" é lida como 12 m de
 * verdade — os números ficam dentro do limite e o tamanho real se mantém.
 *
 * **O RIP DA PRODUÇÃO IGNORA ESSE CAMPO.** O SAi Flexi lê a página pelo número
 * cru, encontra 5 m onde havia 12, e o que sai é arte esticada e arte cortada.
 * O estrago é proporcional ao fator, e foi assim que se fechou o diagnóstico:
 *
 *   rolo de 7 m    fator 1,38    saía 38% errado ("deu problema, mas menos")
 *   rolo de 12 m   fator 2,36    saía 136% errado
 *   rolo de 5 m    sem fator     saía perfeito
 *
 * O arquivo abria certo no Acrobat, o que por um tempo apontou o dedo para o
 * lugar errado: o PDF estava conforme, e quem o desfigurava era o leitor do
 * outro lado.
 *
 * Então o `/UserUnit` saiu (2026-09-23) e **a página passa a sair no tamanho
 * real**, mesmo acima das 200 polegadas. É uma troca de risco consciente: o
 * teto é convenção de implementação, não regra do formato, e entre um arquivo
 * que o Acrobat talvez recorte na tela e um arquivo que a MÁQUINA imprime
 * torto, quem manda é a máquina. Um leitor que estranhe o tamanho mostra o
 * problema na cara; o `/UserUnit` ignorado saía impresso no tecido.
 *
 * A versão e o que o arquivo usa
 * ------------------------------
 * O documento declara **a menor versão que dá conta do que ele usa**. Hoje só
 * uma coisa obriga a subir, e ela mente em silêncio se ficar para trás:
 *
 *   `/SMask`   PDF 1.4   a máscara de uma arte transparente
 *
 * Ela chegou tarde a esta lista, e o preço foi um RIP recusando o arquivo:
 * toda peça girada vira PNG de canvas, canvas sempre tem canal alfa, e o PDF
 * saía 1.3 carregando máscara. Hoje são duas travas — a máscara só entra
 * quando esconde alguma coisa (ver `mascaraServe`) e, quando entra, o
 * documento nasce 1.4 (ver `pngComAlfa`).
 */

const express = require("express");
const { permitirExportacao } = require("./uso");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { finished } = require("stream/promises");

// A sigla do pedido sai com esta fonte EMBUTIDA no arquivo, e não com a
// Helvetica "padrão" do PDF: o RIP da produção já mostrou que não se pode
// contar com o que ele deveria ter (ver `/UserUnit`, acima). A conta da
// largura do texto, em src/motores/siglaDoPedido.js, usa as medidas desta
// mesma fonte — trocar uma sem a outra tira a sigla de dentro da peça.
//
// É a Liberation Sans Bold 1.x (a que vem no pdfjs-dist), sob a GPLv2 com a
// exceção de fonte, que permite embuti-la em documentos como este PDF; a
// licença acompanha o arquivo (LICENSE_LIBERATION).
//
// Mora em `estatico/fontes/`, e não ao lado do código: o instalado apaga tudo
// de `servidor/` menos o servidor compilado (ver empacotar/compilar.js), e
// `estatico/` segue irmã dele — o mesmo caminho vale no repositório e no app.
const { PASTA_DO_APP } = require("./caminhos");
const FONTE_DA_SIGLA = path.join(PASTA_DO_APP, "estatico", "fontes", "LiberationSans-Bold.ttf");
const ALTURA_DE_MAIUSCULA = 0.688; // a mesma de src/motores/siglaDoPedido.js
const CONTORNO_DA_LETRA_CM = 0.03;

const router = express.Router();

/*
 * ===========================================================================
 * AS ARTES FICAM EM DISCO, NÃO NA MEMÓRIA
 * ===========================================================================
 *
 * As artes chegam antes do PDF, uma a uma, em binário puro. Elas já moraram
 * dentro do JSON em base64 (engorda um terço e o servidor segura tudo como
 * texto) e depois num Map de Buffers — melhor, e ainda assim o servidor
 * segurava o trabalho INTEIRO na memória do primeiro envio até o PDF terminar.
 *
 * Era esse Map que cobrava o preço. Um trabalho de 155 artes distintas em
 * tamanho real são centenas de MB paradas na RAM, e a tela pagava por isso
 * derrubando a resolução da impressão para caber num teto de envio — quem
 * pedia 150 dpi recebia 50. Trocar qualidade de imagem por memória de servidor
 * é um mau negócio, e é um negócio que não precisava existir.
 *
 * Agora cada arte é escrita num arquivo temporário assim que chega, e o que
 * fica na memória é o caminho dela. Na hora de montar o PDF, a arte é lida do
 * disco, embutida e solta — o pdfkit zera o buffer dentro do `embed` (`this.data
 * = null` no JPEG, `this.imgData = null` no PNG), então o pico passa a ser UMA
 * arte, não a soma delas. Com isso o teto de envio saiu e o dpi ficou fixo em
 * 150.
 *
 * A pasta é apagada quando o PDF sai, e um relógio recolhe o que ficou para
 * trás quando alguém desiste no meio.
 */
const artesGuardadas = new Map();
const VALIDADE_MS = 10 * 60 * 1000;

function apagarSessao(sessao) {
  const guardadas = artesGuardadas.get(sessao);
  if (!guardadas) return;
  artesGuardadas.delete(sessao);
  try {
    fs.rmSync(guardadas.pasta, { recursive: true, force: true });
  } catch (erro) {
    // Arquivo temporário que não some não estraga nada: o sistema recolhe.
    console.warn(`[encaixe-pdf] não deu para limpar a sessão ${sessao}:`, erro.message);
  }
}

function limparAntigas() {
  const agora = Date.now();
  [...artesGuardadas.entries()].forEach(([sessao, dados]) => {
    if (!dados.emUso && agora - dados.criadaEm > VALIDADE_MS) apagarSessao(sessao);
  });
}

/** Recebe uma arte já pronta, em binário, e põe no disco. */
router.post("/arte", express.raw({ limit: "400mb", type: () => true }), async (req, res) => {
  limparAntigas();
  const sessao = String(req.query.sessao || "");
  const chave = String(req.query.chave || "");
  if (!sessao || !chave || !req.body || !req.body.length) {
    return res.status(400).json({ error: "Faltou identificar a arte." });
  }

  let guardadas = artesGuardadas.get(sessao);
  if (!guardadas) {
    try {
      // O identificador só indexa o Map. Retirar pontuação dele fazia sessões
      // diferentes usar a mesma pasta, e uma apagava as artes da outra.
      guardadas = {
        criadaEm: Date.now(),
        pasta: fs.mkdtempSync(path.join(os.tmpdir(), "optmize-encaixe-")),
        artes: new Map(),
        // Quais artes CARREGAM canal alfa. Anotado aqui, com os bytes em mão,
        // porque na hora do PDF elas já estão em disco e a pergunta custaria
        // abrir cada arquivo de novo. Ver `pngComAlfa`.
        comAlfa: new Set(),
        // O giro de cada arte (0, 90, 180, 270), que agora é feito aqui — ver
        // "A ARTE CHEGA COMO VEIO". E, das que são PDF, a versão: embutir um
        // desenho vetorial obriga o documento a ser pelo menos dessa versão.
        giros: new Map(),
        versoes: new Map(),
      };
    } catch (erro) {
      return res.status(500).json({ error: `Não deu para guardar a arte: ${erro.message}` });
    }
    artesGuardadas.set(sessao, guardadas);
  }

  // Chaves como "frente.1" e "frente1" são artes distintas. O nome no disco
  // é interno; reenviar a mesma chave substitui apenas aquela arte.
  // Arte que o servidor não abre não fica: a tela manda a desenhada no lugar.
  if (!(await arteLegivel(req.body))) return res.json({ ok: true, legivel: false });

  const arquivo = guardadas.artes.get(chave)
    || path.join(guardadas.pasta, `${guardadas.artes.size}.arte`);
  try {
    fs.writeFileSync(arquivo, req.body);
  } catch (erro) {
    return res.status(500).json({ error: `Não deu para guardar a arte: ${erro.message}` });
  }
  guardadas.artes.set(chave, arquivo);
  guardadas.criadaEm = Date.now();
  // Reenviar a mesma chave substitui a arte: o que valia da anterior não vale.
  if (pngComAlfa(req.body)) guardadas.comAlfa.add(chave);
  else guardadas.comAlfa.delete(chave);
  const giro = Number(req.query.giro) || 0;
  guardadas.giros.set(chave, [0, 90, 180, 270].includes(giro) ? giro : 0);
  if (ehPdf(req.body)) guardadas.versoes.set(chave, versaoDoPdf(req.body));
  else guardadas.versoes.delete(chave);
  res.json({ ok: true, legivel: true, bytes: req.body.length });
});

/*
 * ===========================================================================
 * O PNG NÃO PASSA PELO LEITOR DO PDFKIT, E NÃO LEVA PREDITOR
 * ===========================================================================
 *
 * Duas decisões moram aqui, e a segunda custou caro para ser aprendida.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO O PDFKIT
 * ---------------------------------------------------------------------------
 *
 * Ele abre PNG com o `png-js`, que é JavaScript puro: copia o arquivo byte a
 * byte para um Array e, quando a arte tem canal alfa — e toda arte que sai de
 * um canvas tem —, descomprime, separa cor e alfa num laço e comprime de novo,
 * tudo na linha principal. Medido: 3,9 s numa arte de 20 megapixels. Numa de
 * 70x100 cm a 300 dpi (100 megapixels) ele não chega ao fim: estoura com
 * "Invalid array length", a peça cai no `catch` de arte ilegível e o PDF sai
 * SEM ELA, calado. Aqui quem decodifica é o `sharp`, que é nativo e roda fora
 * da linha principal.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS PIXELS VÃO CRUS, E NÃO PELOS BLOCOS DO PNG
 * ---------------------------------------------------------------------------
 *
 * O PDF aceita que uma imagem venha com os filtros de linha do PNG e manda o
 * leitor desfazê-los: é o `/Predictor 15`. Isso permite embutir os blocos IDAT
 * sem descomprimir nada, e foi o que este arquivo fez por um tempo — rápido,
 * conforme o padrão, e **quebrado na prática**.
 *
 * O RIP da produção (o SAi Flexi) não aplica o preditor. As linhas escorregam
 * e a arte sai torta; os dados acabam antes do fim e a arte sai cortada. Em
 * qualquer tamanho de rolo, inclusive num de um metro — foi esse detalhe que
 * derrubou as explicações anteriores, todas ligadas ao tamanho da página.
 *
 * A pista veio da versão de 2026-09-05, que funcionava: lá o PDF era montado
 * pelo pdfkit puro, e o pdfkit, para arte com alfa, separava os canais e
 * recomprimia SEM preditor. O preditor entrou de carona com o caminho rápido.
 *
 * Agora o fluxo é o mais simples que o formato tem: pixels crus, comprimidos
 * com Flate, sem `/DecodeParms` nenhum. Medido numa arte fotográfica de
 * 9,4 MP, contra o que havia antes:
 *
 *   com /Predictor 15   28,2 MB   323 ms
 *   cru + Flate         25,1 MB   846 ms
 *
 * Menor E mais compatível, por meio segundo a mais por arte. O JPEG continua
 * com o pdfkit: ele passa direto, sem recomprimir, e nunca teve preditor.
 */
const sharp = require("sharp");
const zlib = require("zlib");

const ASSINATURA_PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);


/**
 * O arquivo é um PNG que carrega canal alfa?
 *
 * Lê só o IHDR: tipo de cor 4 (cinza com alfa) ou 6 (RGBA). É a pergunta mais
 * barata que existe sobre transparência — 26 bytes —, e é o bastante para
 * decidir a VERSÃO do PDF, que precisa ser escolhida antes de o documento
 * abrir (o pdfkit escreve o `%PDF-x.y` no construtor).
 *
 * Note que isto é um "pode ter", não um "tem": arte girada vem sempre com
 * canal alfa, e quase sempre opaca. Quem decide se a máscara entra de verdade
 * é o `mascaraServe`, olhando os pixels. Declarar 1.4 e não usar máscara
 * nenhuma é honesto — o arquivo diz do que é capaz, não do que fez.
 */
function pngComAlfa(bytes) {
  if (!bytes || bytes.length < 26 || !bytes.subarray(0, 8).equals(ASSINATURA_PNG)) return false;
  const tipoDeCor = bytes[25];
  return tipoDeCor === 4 || tipoDeCor === 6;
}



/*
 * ===========================================================================
 * MÁSCARA QUE NÃO ESCONDE NADA NÃO ENTRA NO PDF
 * ===========================================================================
 *
 * Toda peça GIRADA vira um PNG de canvas, e canvas SEMPRE tem canal alfa —
 * mesmo quando a arte é opaca do primeiro ao último pixel. Levando esse alfa
 * adiante, o PDF ganhava uma `/SMask`: uma segunda imagem, do tamanho da arte,
 * dizendo "nada aqui é transparente".
 *
 * Duas coisas erradas de uma vez. A primeira é peso: uma máscara inútil por
 * peça girada, e num trabalho de 155 artes isso é a metade das imagens do
 * arquivo. A segunda é pior — `/SMask` é recurso do **PDF 1.4**, e este
 * documento se declara 1.3 quando não precisa de `/UserUnit`. Um arquivo que
 * usa o que diz não usar é um arquivo que o RIP tem o direito de recusar.
 *
 * Olhar os bytes é barato perto do que se economiza: o canal já vem decodificado
 * para montar a máscara, e a varredura é um laço sobre bytes que para no
 * primeiro pixel transparente. Quando não há nenhum, a máscara nem chega a ser
 * comprimida — que era o passo caro.
 */
function mascaraServe(alfa) {
  for (let i = 0; i < alfa.length; i++) {
    if (alfa[i] !== 255) return true;
  }
  return false;
}

/**
 * Um canal de imagem para o PDF: pixels crus, comprimidos com Flate.
 *
 * Sem `/DecodeParms`, e é esse o ponto — ver "POR QUE OS PIXELS VÃO CRUS", lá
 * em cima. Nível 1 na compressão porque este fluxo só vive até o PDF, e cada
 * nível acima custa tempo para ganhar pouco; não há perda em nível nenhum.
 */
function canalCru(pixels, largura, altura, cores) {
  return {
    largura,
    altura,
    dados: {
      Type: "XObject",
      Subtype: "Image",
      Width: largura,
      Height: altura,
      BitsPerComponent: 8,
      ColorSpace: cores === 3 ? "DeviceRGB" : "DeviceGray",
      Filter: "FlateDecode",
    },
    fluxo: zlib.deflateSync(pixels, { level: 1 }),
  };
}

/*
 * ===========================================================================
 * A ARTE CHEGA COMO VEIO, E É AQUI QUE ELA GIRA E VIRA sRGB (2026-10-19)
 * ===========================================================================
 *
 * A tela mandava a arte já girada, desenhada num canvas — e o canvas mudava a
 * cor (converte ao decodificar, guarda a cor multiplicada pelo alfa) e perdia
 * o perfil do arquivo. Agora ela manda o arquivo intocado e o giro (`giro`,
 * no envio), e o giro é feito aqui pelo `sharp`: de 90 em 90 graus, pixel por
 * pixel, sem reamostrar nada.
 *
 * A COR. O PDF declara as imagens como `DeviceRGB`, e o RIP lê `DeviceRGB`
 * como sRGB. Uma arte salva em Adobe RGB ou Display P3 embutia os números do
 * arquivo sem o perfil, e o RIP os lia como se fossem sRGB: o roxo vivo saía
 * apagado (medido: #8a2be2 em P3 chegava como #7f32da). Aqui os pixels são
 * convertidos para sRGB pelo perfil que o próprio arquivo traz (lcms, dentro
 * do `sharp`) — e arte sem perfil já é sRGB, então sai com os mesmos números
 * de sempre. Arte CMYK passa pela mesma conversão, com o perfil dela, em vez
 * da fórmula ingênua do navegador.
 *
 * O JPEG que pode ir direto continua indo direto, sem recompressão: sequencial,
 * de 8 bits, RGB ou cinza, sem giro de EXIF, e sem perfil que não seja sRGB.
 */
function perfilJaESrgb(icc) {
  if (!icc || icc.length < 132) return true; // sem perfil: o arquivo já fala sRGB
  if (icc.subarray(16, 20).toString("latin1") !== "RGB ") return false;
  // A descrição do perfil (tag `desc`) diz quem ele é; os sRGB se chamam assim.
  return /sRGB/i.test(icc.subarray(0, 4096).toString("latin1"));
}

/** JPEG sequencial de 8 bits (SOF0/SOF1), o único que o PDF embute sem conversa. */
function jpegSequencial(bytes) {
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marcador = bytes[i + 1];
    if (marcador === 0xff) { i++; continue; }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }
    if (marcador === 0xda || marcador === 0xd9) return false;
    if (marcador === 0xc0 || marcador === 0xc1) return bytes[i + 4] === 8;
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      return false;
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return false;
}

/**
 * Abre uma arte de pixels como imagem do pdfkit: o objeto que `doc.image`
 * aceita no lugar do que `doc.openImage` devolveria (largura, altura, `embed`).
 * `giro` é 0, 90, 180 ou 270, no sentido do relógio.
 */
async function abrirImagem(doc, bytes, giro = 0) {
  const meta = await sharp(bytes, { limitInputPixels: false }).metadata();

  if (!giro && meta.format === "jpeg" && !meta.isProgressive
    && (meta.channels === 3 || meta.channels === 1)
    && (!meta.orientation || meta.orientation === 1)
    && perfilJaESrgb(meta.icc) && jpegSequencial(bytes)) {
    return doc.openImage(bytes);
  }

  // O EXIF primeiro (é como a tela mostra a arte), depois o giro do encaixe.
  const abrir = () => {
    const s = sharp(bytes, { limitInputPixels: false }).autoOrient();
    return giro ? s.rotate(giro) : s;
  };
  const cinza = meta.space === "b-w" || meta.space === "grey16";
  const [corCrua, alfaCru] = await Promise.all([
    abrir().removeAlpha().toColourspace(cinza ? "b-w" : "srgb").raw({ depth: "uchar" })
      .toBuffer({ resolveWithObject: true }),
    // O alfa é o último canal da entrada; o `b-w` faz a /SMask sair com um
    // canal só, como ela tem de ser.
    meta.hasAlpha
      ? abrir().extractChannel(meta.channels - 1).toColourspace("b-w").raw({ depth: "uchar" })
        .toBuffer({ resolveWithObject: true })
      : null,
  ]);
  if (corCrua.info.channels !== 1 && corCrua.info.channels !== 3) {
    throw new Error(`a arte saiu com ${corCrua.info.channels} canais de cor`);
  }

  const cor = canalCru(corCrua.data, corCrua.info.width, corCrua.info.height, corCrua.info.channels);
  const alfa = alfaCru && alfaCru.info.channels === 1 && mascaraServe(alfaCru.data)
    ? canalCru(alfaCru.data, alfaCru.info.width, alfaCru.info.height, 1)
    : null;

  return {
    label: `I${++doc._imageCount}`,
    width: cor.largura,
    height: cor.altura,
    obj: null,
    embed(documento) {
      if (this.obj) return;
      this.obj = documento.ref(cor.dados);
      if (alfa) {
        const mascara = documento.ref(alfa.dados);
        mascara.end(alfa.fluxo);
        this.obj.data.SMask = mascara;
      }
      this.obj.end(cor.fluxo);
      // O buffer já foi para o documento: solta, para o pico ser UMA arte.
      cor.fluxo = null;
      if (alfa) alfa.fluxo = null;
    },
  };
}

/*
 * ===========================================================================
 * O PDF DE ARTE ENTRA COMO VETOR
 * ===========================================================================
 *
 * Arte de Corel e de Illustrator chega em PDF, e o programa a desenhava em
 * pixels (pdf.js, 300 dpi) antes de pôr no rolo: letra serrilhada no tecido,
 * e a cor convertida pelo pdf.js, sem perfil. "Sempre fica assim quando a
 * arte é vetor" — e ficava mesmo.
 *
 * Agora a primeira página do PDF entra no rolo como um Form XObject: o mesmo
 * desenho, os mesmos traços, as mesmas fontes, as mesmas cores (CMYK continua
 * CMYK, cor especial continua especial), em qualquer tamanho. Quem lê o PDF
 * de origem e monta o XObject é o `pdf-lib`; aqui ele é só copiado, objeto
 * por objeto, para dentro do documento do pdfkit.
 *
 * A caixa é a CropBox, que é o que o pdf.js mediu quando a peça entrou (a
 * medida da peça saiu dela), e o /Rotate da página é somado ao giro do
 * encaixe.
 */
const { PDFDocument: LeitorDePdf, PDFDict, PDFArray, PDFRef, PDFStream } = require("pdf-lib");

const ASSINATURA_PDF = Buffer.from("%PDF");
const ehPdf = (bytes) => !!bytes && bytes.length > 4 && bytes.subarray(0, 4).equals(ASSINATURA_PDF);

/** O "x" do "%PDF-1.x" que o arquivo declara. */
function versaoDoPdf(bytes) {
  const m = /^%PDF-1\.(\d)/.exec(bytes.subarray(0, 16).toString("latin1"));
  return m ? Number(m[1]) : 4;
}

/** A primeira página como Form XObject, num documento do pdf-lib. */
async function paginaComoForma(bytes) {
  const origem = await LeitorDePdf.load(bytes, { updateMetadata: false });
  if (origem.getPageCount() < 1) throw new Error("o PDF não tem página");
  const pagina = origem.getPage(0);
  const caixa = pagina.getCropBox();
  if (!(caixa.width > 0 && caixa.height > 0)) throw new Error("a página tem tamanho zero");
  const destino = await LeitorDePdf.create({ updateMetadata: false });
  const forma = await destino.embedPage(pagina, {
    left: caixa.x, bottom: caixa.y, right: caixa.x + caixa.width, top: caixa.y + caixa.height,
  });
  await forma.embed();
  const rotacao = ((pagina.getRotation().angle % 360) + 360) % 360;
  return { contexto: destino.context, ref: forma.ref, largura: caixa.width, altura: caixa.height, rotacao };
}

/**
 * Copia um objeto do pdf-lib, e tudo o que ele alcança, para o pdfkit.
 *
 * O pdfkit escreve texto JS como nome (`/X`), e por isso o que não é
 * dicionário, lista nem referência vai como o texto que o pdf-lib já
 * escreveria — numa subclasse da referência abstrata do próprio pdfkit, que
 * ele serializa pelo `toString`.
 */
function copiarParaOPdfkit(doc, contexto, raizDaOrigem) {
  const copias = new Map();
  const pendentes = [];
  let Literal = null;

  const refDe = (ref) => {
    const chave = ref.toString();
    if (copias.has(chave)) return copias.get(chave);
    const nova = doc.ref({});
    copias.set(chave, nova);
    pendentes.push([ref, nova]);
    return nova;
  };
  const converter = (obj) => {
    if (obj instanceof PDFRef) return refDe(obj);
    if (obj instanceof PDFDict) {
      const saida = {};
      for (const [nome, valor] of obj.entries()) saida[nome.asString().slice(1)] = converter(valor);
      return saida;
    }
    if (obj instanceof PDFArray) return obj.asArray().map(converter);
    return new Literal(obj.toString());
  };

  const raiz = refDe(raizDaOrigem);
  const Abstrata = Object.getPrototypeOf(raiz.constructor);
  Literal = class extends Abstrata {
    constructor(texto) { super(); this.texto = texto; }
    toString() { return this.texto; }
  };

  while (pendentes.length) {
    const [ref, nova] = pendentes.pop();
    const obj = contexto.lookup(ref);
    if (obj instanceof PDFStream) {
      const dados = converter(obj.dict);
      delete dados.Length; // o pdfkit conta de novo
      nova.data = dados;
      // Já comprimido na origem: vai como está, sem comprimir outra vez.
      nova.compress = doc.compress && !dados.Filter;
      nova.end(Buffer.from(obj.getContents()));
    } else {
      nova.data = obj === undefined ? null : converter(obj);
      nova.end();
    }
  }
  return raiz;
}

/** Abre a página do PDF como desenho vetorial, pronto para `desenharVetor`. */
async function abrirVetor(doc, bytes) {
  const forma = await paginaComoForma(bytes);
  doc._formasDeArte = (doc._formasDeArte || 0) + 1;
  return {
    vetor: true,
    label: `Fx${doc._formasDeArte}`,
    obj: null,
    largura: forma.largura,
    altura: forma.altura,
    rotacao: forma.rotacao,
    forma,
  };
}

/**
 * A matriz que leva a página (0..largura × 0..altura, y para cima) à caixa da
 * peça no rolo, girada no sentido do relógio. O pdfkit desenha com y para
 * baixo, a partir do canto de cima.
 */
function matrizDoVetor(vetor, giro, x, y, w, h) {
  const total = (vetor.rotacao + giro) % 360;
  const L = vetor.largura;
  const A = vetor.altura;
  const deitada = total === 90 || total === 270;
  const RL = deitada ? A : L; // a página já girada, antes de ir à medida da peça
  const RA = deitada ? L : A;
  const ponto = (u, v) => {
    let px = u;
    let py = A - v; // de y para cima a y para baixo
    if (total === 90) [px, py] = [RL - py, px];
    else if (total === 180) [px, py] = [L - px, A - py];
    else if (total === 270) [px, py] = [py, RA - px];
    return [x + px * (w / RL), y + py * (h / RA)];
  };
  const [e, f] = ponto(0, 0);
  const [ux, uy] = ponto(1, 0);
  const [vx, vy] = ponto(0, 1);
  return [ux - e, uy - f, vx - e, vy - f, e, f];
}

function desenharVetor(doc, vetor, giro, x, y, w, h) {
  if (!vetor.obj) {
    vetor.obj = copiarParaOPdfkit(doc, vetor.forma.contexto, vetor.forma.ref);
    vetor.forma = null; // copiado: o documento de origem pode ir embora
  }
  doc.page.xobjects[vetor.label] = vetor.obj;
  doc.save();
  doc.transform(...matrizDoVetor(vetor, giro, x, y, w, h));
  doc.addContent(`/${vetor.label} Do`);
  doc.restore();
}

/** Abre a arte do jeito que o formato dela pede. */
async function abrirArte(doc, bytes, giro = 0) {
  if (ehPdf(bytes)) return abrirVetor(doc, bytes);
  return abrirImagem(doc, bytes, giro);
}

/**
 * O servidor consegue abrir esta arte? Perguntado no envio, para a tela ter
 * tempo de mandar a arte desenhada no lugar (ver `arteDesenhadaDaPeca`).
 */
async function arteLegivel(bytes) {
  try {
    if (ehPdf(bytes)) {
      await paginaComoForma(bytes);
      return true;
    }
    const meta = await sharp(bytes, { limitInputPixels: false }).metadata();
    return meta.width > 0 && meta.height > 0;
  } catch {
    return false;
  }
}

const PT_POR_CM = 72 / 2.54; // 1 ponto = 1/72 de polegada
const LIMITE_PT = 14400; // 200 polegadas: o maior lado que o PDF aceita numa página

function bufferDaImagem(dataUrl) {
  const virgula = String(dataUrl || "").indexOf(",");
  if (virgula < 0) return null;
  return Buffer.from(dataUrl.slice(virgula + 1), "base64");
}

/**
 * Quanto vale uma unidade da página: UM, sempre.
 *
 * A função continua existindo — exportada, e conferida pela bancada — para o
 * dia em que alguém procurar o `/UserUnit` neste arquivo e precisar achar,
 * junto, o motivo de ele não estar mais aqui (ver "O TETO DE PÁGINA", no
 * cabeçalho).
 */
function unidadeDaPagina() {
  return 1;
}

/**
 * Reparte as posições em páginas: uma por bancada.
 *
 * Quem diz a que bancada uma peça pertence é o motor, que carimba o número em
 * cada posição (ver o cabeçalho da BANCADA em public/encaixe-motor.js). Aqui
 * não se decide nada — só se agrupa. É essa divisão de responsabilidade que
 * torna impossível o defeito que tirou a repartição daqui em a1b7c6d: o corte
 * não procura mais um lugar bom entre as peças, ele já vem escolhido de onde as
 * peças foram postas, e peça nenhuma pode estar em cima dele.
 *
 * Cada página é cortada no que a bancada realmente ocupa, do topo da primeira
 * arte ao pé da última. Sem bancada nenhuma é o caso de sempre: uma página só,
 * com o consumo inteiro do rolo, inclusive o tecido que sobra depois da última
 * peça.
 */
function paginasDoEncaixe(posicoes, consumo) {
  const porBancada = new Map();
  posicoes.forEach((pos) => {
    const numero = Number(pos.bancada) || 0;
    let pagina = porBancada.get(numero);
    if (!pagina) {
      pagina = { numero, topo: Infinity, fundo: -Infinity, posicoes: [] };
      porBancada.set(numero, pagina);
    }
    pagina.topo = Math.min(pagina.topo, pos.y);
    pagina.fundo = Math.max(pagina.fundo, pos.y + pos.altura);
    pagina.posicoes.push(pos);
  });

  const paginas = [...porBancada.values()].sort((a, b) => a.numero - b.numero);
  if (paginas.length <= 1) return [{ numero: 0, topo: 0, fundo: consumo, posicoes }];
  return paginas;
}

/**
 * Confere, ANTES de abrir qualquer resposta ou documento, que a fonte da sigla
 * existe e carrega. Sigla que some em silêncio é PDF errado indo para o RIP:
 * é melhor não sair PDF nenhum.
 */
function conferirFonteDaSigla(fonte = FONTE_DA_SIGLA) {
  try {
    fs.accessSync(fonte, fs.constants.R_OK);
    const teste = new PDFDocument({ margin: 0 });
    teste.registerFont("sigla", fonte);
    teste.font("sigla");
  } catch (err) {
    throw new Error(`A fonte da sigla do pedido não foi encontrada (${fonte}): o PDF não sai sem as siglas.`);
  }
}

/**
 * Limpa a marca que chegou pela rede. Devolve a marca boa, ou `undefined` se
 * ela não presta (texto vazio, número que não é número, fora do tecido, letra
 * grande demais) — a peça então sai sem sigla.
 *
 * O texto vai até 20 caracteres: pedido de 6, espaço, sigla de 6 e a cópia
 * (até 4 algarismos, rolo de 9999 cópias) dão 17 — com folga, e sem cortar o
 * número da cópia.
 */
function marcaLimpa(m, larguraTecido, consumo) {
  if (!m || typeof m !== "object") return undefined;
  const numero = (n) => {
    if (typeof n === "number") return n;
    if (typeof n === "string" && n.trim() !== "") return Number(n);
    return NaN;
  };
  const texto = String(m.texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 20);
  const x = numero(m.x);
  const y = numero(m.y);
  const alturaCm = numero(m.alturaCm);
  const ok = texto && [x, y, alturaCm].every(Number.isFinite)
    && x >= 0 && x <= larguraTecido && y >= 0 && y <= consumo
    && alturaCm > 0 && alturaCm <= 2;
  return ok ? { texto, x, y, alturaCm } : undefined;
}

/**
 * A sigla do pedido, impressa: texto vetorial preto com contorno branco, de
 * pé. Primeiro o contorno (o dobro da grossura, porque metade dele cai para
 * dentro da letra), depois o preenchimento por cima — assim o contorno não
 * come a letra.
 */
function escreverMarca(doc, marca, topoDaPagina) {
  const corpo = (marca.alturaCm / ALTURA_DE_MAIUSCULA) * PT_POR_CM;
  const x = marca.x * PT_POR_CM;
  const base = (marca.y + marca.alturaCm - topoDaPagina) * PT_POR_CM;
  doc.save();
  try {
    doc.font("sigla").fontSize(corpo);
    doc.lineJoin("round").lineWidth(2 * CONTORNO_DA_LETRA_CM * PT_POR_CM).strokeColor("#ffffff");
    doc.text(marca.texto, x, base, { lineBreak: false, baseline: "alphabetic", stroke: true, fill: false });
    doc.fillColor("#000000");
    doc.text(marca.texto, x, base, { lineBreak: false, baseline: "alphabetic", stroke: false, fill: true });
  } finally {
    doc.restore();
  }
}

/**
 * Monta o documento e devolve ele já escrevendo em `destino`.
 *
 * Está separado da rota para a bancada conseguir gerar um PDF sem subir o
 * Express (ver `bancada/conferir-pdf.js`): o que precisa ser conferido é o
 * documento — uma página por bancada, o tamanho real certo, a versão do
 * formato certa e toda peça desenhada —, e nada disso é assunto de HTTP.
 *
 * O `/UserUnit` é UM para o documento inteiro, calculado pela maior página.
 * Podia ser um por página (o campo é do dicionário da página), e não é de
 * propósito: uma escala por página é uma chance a mais de duas páginas do mesmo
 * rolo saírem em tamanhos diferentes por causa de um arredondamento, e esse
 * erro só aparece com o tecido já impresso.
 */
async function montarPdf({
  larguraTecido, consumo, posicoes, buffers, lerArte, podeTerTransparencia, fonteDaSigla = FONTE_DA_SIGLA,
  giros, giroDe, versaoMinima,
}, destino) {
  const paginas = paginasDoEncaixe(posicoes, consumo);
  const larguraPt = larguraTecido * PT_POR_CM;
  const maiorAlturaPt = Math.max(...paginas.map((p) => (p.fundo - p.topo) * PT_POR_CM));
  const unidade = unidadeDaPagina();
  const tamanhoDa = (pagina) => [larguraPt, (pagina.fundo - pagina.topo) * PT_POR_CM];

  /*
   * A VERSÃO DO FORMATO É A MENOR QUE DÁ CONTA DO QUE O ARQUIVO USA.
   *
   * 1.3 é a de maior compatibilidade e é onde a maioria dos encaixes cai. Duas
   * coisas obrigam a subir, e as duas mentem em silêncio se não subirem:
   *
   *   /UserUnit   1.6   sem ela, o leitor pode ignorar a escala e imprimir o
   *                     rolo no tamanho errado (ver o cabeçalho do arquivo)
   *   /SMask      1.4   a máscara suave de uma arte transparente; sem ela, o
   *                     RIP ignora a máscara ou recusa o arquivo
   *
   * Quem chama pela bancada passa `buffers`, e daí dá para olhar as artes
   * direto; a rota passa o aviso pronto, porque lá as artes estão em disco.
   */
  const comAlfa = podeTerTransparencia !== undefined
    ? podeTerTransparencia
    : !!(buffers && [...buffers.values()].some(pngComAlfa));
  /*
   * E o PDF de arte embutido como vetor (ver "O PDF DE ARTE ENTRA COMO
   * VETOR") leva junto o que a página dele usa — transparência, no mínimo —,
   * então o documento é pelo menos 1.4, ou a versão da origem, até 1.7.
   */
  const daOrigem = versaoMinima !== undefined
    ? versaoMinima
    : Math.max(0, ...(buffers ? [...buffers.values()].filter(ehPdf).map(versaoDoPdf) : []));
  const menor = Math.min(7, Math.max(comAlfa ? 4 : 3, daOrigem ? Math.max(4, daOrigem) : 0));

  // Antes de abrir o documento: sem a fonte, nenhum byte sai.
  const comMarca = posicoes.some((pos) => pos.marca);
  if (comMarca) conferirFonteDaSigla(fonteDaSigla);

  const doc = new PDFDocument({
    size: tamanhoDa(paginas[0]),
    margin: 0,
    pdfVersion: `1.${menor}`,
  });
  doc.pipe(destino);

  if (comMarca) doc.registerFont("sigla", fonteDaSigla);
  let marcas = 0;

  /*
   * DEIXAR O CANO ESCOAR ENTRE UMA PEÇA E OUTRA.
   *
   * Isto já foi um laço síncrono do começo ao fim, e o efeito era invisível até
   * alguém medir: quando `montarPdf` retornava, ZERO byte tinha chegado ao
   * destino e o PDF INTEIRO estava parado na fila do `doc`. Medido com 30 artes
   * de 6,2 MB — 185,2 MB escoados, 185,2 MB vivos na fila, 0 no destino.
   *
   * Enquanto existia um teto de envio isso passava despercebido, porque o teto
   * segurava o tamanho. Tirado o teto (a arte agora vem do disco, e a tela
   * preserva a resolução original das imagens), a fila passaria a ser ela o limite — e o estouro
   * teria só mudado de lugar, do envio para a montagem.
   *
   * Um `setImmediate` entre as peças basta: ele devolve a vez ao laço de
   * eventos, o `pipe` move o que está na fila para o destino, e a montagem
   * continua de onde parou. O pico deixa de ser o PDF inteiro e passa a ser o
   * pedaço que ainda não escoou.
   *
   * Desiste de esperar se o destino morreu — quem baixava fechou a aba, e aí
   * não há mais para onde escoar nem por que continuar segurando.
   */
  const FILA_MAXIMA = 8 * 1024 * 1024;
  const escoar = () => new Promise((pronto) => {
    const tentar = () => {
      if (doc.readableLength <= FILA_MAXIMA || destino.destroyed || destino.writableEnded) {
        pronto();
        return;
      }
      setImmediate(tentar);
    };
    setImmediate(tentar);
  });

  /*
   * Cada arte entra no arquivo UMA vez e depois é só reaproveitada em cada
   * posição. Passando o buffer direto a cada peça, o pdfkit embutiria a mesma
   * imagem cem vezes: o PDF fica enorme e leva quase dez segundos para montar.
   *
   * E ela é aberta SÓ QUANDO A PRIMEIRA PEÇA DELA VAI SER DESENHADA. Antes
   * todas eram abertas de uma vez, aqui em cima, e o servidor segurava as 155
   * artes de um trabalho grande na memória ao mesmo tempo. O `doc.image`
   * embute no primeiro desenho e o pdfkit zera o buffer ali dentro (`this.data
   * = null` no JPEG, `this.imgData = null` no PNG), então abrindo sob demanda o
   * pico vira UMA arte. O que sobra no mapa é o objeto de imagem — referência,
   * largura e altura —, que é o que faz a segunda peça reaproveitar a primeira.
   *
   * `lerArte` é quem sabe de onde vem o byte: do disco, no caminho normal (ver
   * a rota do PDF), ou de um Map de buffers, que é como a bancada e os testes
   * chamam.
   */
  const buscar = lerArte || ((chave) => (buffers ? buffers.get(chave) : null));
  const giroDaArte = giroDe || ((chave) => (giros ? giros.get(chave) || 0 : 0));
  const desenhos = new Map();
  const desenhoDe = async (chave) => {
    if (desenhos.has(chave)) return desenhos.get(chave);
    let desenho = null;
    try {
      const bytes = buscar(chave);
      // Ver "O PNG NÃO PASSA PELO LEITOR DO PDFKIT", lá em cima.
      if (!bytes) throw new Error("Arte ausente. Envie as peças novamente.");
      desenho = await abrirArte(doc, bytes, giroDaArte(chave));
    } catch (err) {
      throw new Error(`Não consegui abrir a arte ${chave}: ${err.message}`);
    }
    desenhos.set(chave, desenho);
    return desenho;
  };

  let desenhadas = 0;
  try {
    for (let i = 0; i < paginas.length; i++) {
      const pagina = paginas[i];
      if (i > 0) doc.addPage({ size: tamanhoDa(pagina), margin: 0 });

      for (const pos of pagina.posicoes) {
        const desenho = await desenhoDe(pos.chave);
        try {
          // O `y` da peça é medido no rolo inteiro; na página ele conta a partir
          // do começo da bancada.
          const x = pos.x * PT_POR_CM;
          const y = (pos.y - pagina.topo) * PT_POR_CM;
          if (desenho.vetor) {
            desenharVetor(doc, desenho, giroDaArte(pos.chave), x, y, pos.largura * PT_POR_CM, pos.altura * PT_POR_CM);
          } else {
            doc.image(desenho, x, y, { width: pos.largura * PT_POR_CM, height: pos.altura * PT_POR_CM });
          }
          desenhadas++;
        } catch (err) {
          throw new Error(`Não consegui desenhar a peça ${pos.chave}: ${err.message}`);
        }
        if (pos.marca) {
          try {
            escreverMarca(doc, pos.marca, pagina.topo);
            marcas++;
          } catch (err) {
            throw new Error(`Não consegui escrever a sigla ${pos.marca.texto}: ${err.message}`);
          }
        }
        // Ver `escoar`: é aqui que a fila do cano deixa de crescer sem limite.
        await escoar();
        if (destino.destroyed) throw new Error("A gravação do PDF foi interrompida.");
      }
    }

    doc.end();
  } catch (erro) {
    doc.destroy();
    throw erro;
  }
  return {
    unidade,
    desenhadas,
    marcas,
    paginaPt: tamanhoDa(paginas[0]),
    paginas: paginas.map((p) => ({
      numero: p.numero,
      comprimento: p.fundo - p.topo,
      pecas: p.posicoes.length,
      paginaPt: tamanhoDa(p),
    })),
  };
}

router.post("/pdf", async (req, res) => {
  limparAntigas();
  const { larguraTecido, consumo, imagens, posicoes, nome } = req.body || {};

  if (!(larguraTecido > 0) || !(consumo > 0) || !Array.isArray(posicoes) || posicoes.length === 0) {
    return res.status(400).json({ error: "Encaixe inválido para gerar o PDF." });
  }

  // A sigla do pedido só passa bem formada (ver `marcaLimpa`); a que não
  // presta vira peça sem marca.
  posicoes.forEach((pos) => {
    if (pos && pos.marca) pos.marca = marcaLimpa(pos.marca, larguraTecido, consumo);
  });
  if (posicoes.some((pos) => pos && pos.marca)) {
    try {
      conferirFonteDaSigla();
    } catch (err) {
      console.error("[encaixe-pdf]", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  /*
    A METRAGEM DO PLANO, ANTES DE MONTAR QUALQUER COISA.

    Aqui, e não no encaixe: encaixar é experimentar, e cota em cima de
    tentativa ensina a tentar menos. Este é o ponto em que o arquivo vai para
    a impressora, e é o tamanho DELE que desconta do saldo — ver
    `servidor/uso.js` e `domain/metragem.ts`.

    O `error` é o que a tela já mostra sozinha (`api/encaixe.ts` lê esse
    campo), então a recusa chega à pessoa escrita em português sem tela nova
    nenhuma. Os outros campos ficam para a tela de comprar avulso, quando ela
    existir.
  */
  /*
    O QUE DESCONTA É O COMPRIMENTO DO ARQUIVO: a soma das páginas, uma por
    bancada, cada uma cortada no que as peças ocupam. Descontar o `consumo`
    cobraria os vãos entre as mesas, que não vão para a impressora.

    As medidas vêm em CENTÍMETROS; a metragem do plano fala em metros, então a
    conversão acontece aqui, uma vez.
  */
  const comprimentoCm = paginasDoEncaixe(posicoes, consumo)
    .reduce((soma, pagina) => soma + (pagina.fundo - pagina.topo), 0);
  /*
    E A MESMA METRAGEM PELA CAIXA, para o relatório de economia da empresa. A
    tela manda a razão caixa/encaixe do trabalho inteiro (ver `razaoCaixa` em
    `baixarEncaixeEmPdf`); cada arquivo leva a sua parte. Razão que não for um
    número >= 1 é ignorada: economia inventada é pior que economia nenhuma.
  */
  const razaoCaixa = Number(req.body.razaoCaixa);
  const metrosCaixa = Number.isFinite(razaoCaixa) && razaoCaixa >= 1
    ? (comprimentoCm / 100) * razaoCaixa : null;
  const sessao = String(req.body.sessao || "");
  const guardadas = artesGuardadas.get(sessao);

  // Onde está cada arte. A que veio antes em binário (o caminho normal) está no
  // disco e só o caminho dela fica aqui; a que veio dentro do próprio pedido é
  // o jeito curto dos testes, e essa vem em memória mesmo — são poucas e
  // pequenas.
  const daMemoria = new Map();
  const doDisco = new Map();
  (imagens || []).forEach((img) => {
    if (img.src) {
      const buffer = bufferDaImagem(img.src);
      if (buffer) daMemoria.set(img.chave, buffer);
      return;
    }
    const arquivo = guardadas && guardadas.artes.get(img.chave);
    if (arquivo) doDisco.set(img.chave, arquivo);
  });
  if (daMemoria.size === 0 && doDisco.size === 0) {
    return res.status(400).json({ error: "Nenhuma imagem de peça chegou para o PDF." });
  }
  const ausentes = [...new Set(posicoes.map((pos) => pos.chave))]
    .filter((chave) => !daMemoria.has(chave)
      && (!doDisco.has(chave) || !fs.existsSync(doDisco.get(chave))));
  if (ausentes.length) {
    return res.status(400).json({ error: `Faltam artes para o PDF: ${ausentes.join(", ")}. Exporte novamente.` });
  }

  // Lê a arte no instante em que ela vai ser embutida, e não antes: é isto que
  // tira o trabalho inteiro da memória do servidor. Ver `montarPdf`.
  const lerArte = (chave) => {
    if (daMemoria.has(chave)) return daMemoria.get(chave);
    const arquivo = doDisco.get(chave);
    if (!arquivo) return null;
    try {
      return fs.readFileSync(arquivo);
    } catch (erro) {
      console.warn(`[encaixe-pdf] não deu para ler a arte ${chave}:`, erro.message);
      return null;
    }
  };

  /*
   * A VERSÃO DO FORMATO PRECISA SER DECIDIDA ANTES DE O DOCUMENTO ABRIR, e
   * quem pode exigir 1.4 é a transparência. Aqui a pergunta é barata: as artes
   * de disco já vieram carimbadas na chegada, e as de memória estão na mão.
   */
  const podeTerTransparencia = [...daMemoria.values()].some(pngComAlfa)
    || (guardadas ? [...doDisco.keys()].some((chave) => guardadas.comAlfa.has(chave)) : false);

  const giroDe = (chave) => (guardadas && guardadas.giros.get(chave)) || 0;
  const versaoMinima = guardadas
    ? Math.max(0, ...[...doDisco.keys()].map((chave) => guardadas.versoes.get(chave) || 0))
    : 0;

  let pastaPdf;
  let destino;
  let concluido;
  if (guardadas) {
    guardadas.emUso = (guardadas.emUso || 0) + 1;
    guardadas.criadaEm = Date.now();
  }
  try {
    pastaPdf = fs.mkdtempSync(path.join(os.tmpdir(), "optmize-pdf-pronto-"));
    const arquivoPdf = path.join(pastaPdf, "encaixe.pdf");
    destino = fs.createWriteStream(arquivoPdf);
    concluido = finished(destino);
    concluido.catch(() => {});
    await montarPdf({ larguraTecido, consumo, posicoes, lerArte, podeTerTransparencia, giroDe, versaoMinima }, destino);
    await concluido;
    const cota = await permitirExportacao(comprimentoCm / 100, metrosCaixa);
    if (!cota.permitido) {
      return res.status(402).json({
        error: cota.motivo,
        codigo: "metragem_do_plano",
        metros: cota.metros,
        metrosUsados: cota.metrosUsados,
        metrosRestantes: cota.metrosRestantes,
        plano: cota.plano,
        periodo: cota.periodo,
        podeComprarAvulso: cota.podeComprarAvulso,
      });
    }
    await new Promise((resolve, reject) => {
      res.download(arquivoPdf, `${nome || "encaixe"}.pdf`, (erro) => erro ? reject(erro) : resolve());
    });
    if (guardadas && !req.body.manterSessao && !(guardadas.emUso > 1)) apagarSessao(sessao);
  } catch (erro) {
    console.error("[encaixe-pdf] falhou ao montar o PDF:", erro);
    if (!res.headersSent) res.status(500).json({ error: `Não consegui gerar o PDF: ${erro.message}` });
    else res.destroy(erro);
  } finally {
    if (destino && !destino.closed) destino.destroy();
    if (concluido) await concluido.catch(() => {});
    if (guardadas) {
      guardadas.emUso--;
      guardadas.criadaEm = Date.now();
    }
    if (pastaPdf) fs.rmSync(pastaPdf, { recursive: true, force: true });
  }
});

module.exports = router;
// A montagem do documento sai junto com o roteador para a bancada conseguir
// conferir o PDF sem subir o Express (ver `bancada/conferir-pdf.js`).
module.exports.montarPdf = montarPdf;
module.exports.marcaLimpa = marcaLimpa;
module.exports.conferirFonteDaSigla = conferirFonteDaSigla;
module.exports.paginasDoEncaixe = paginasDoEncaixe;
module.exports.unidadeDaPagina = unidadeDaPagina;
module.exports.PT_POR_CM = PT_POR_CM;
module.exports.LIMITE_PT = LIMITE_PT;
