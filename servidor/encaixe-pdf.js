/**
 * Gera o PDF do encaixe em tamanho real, para mandar direto para a impressora
 * ou para a mesa de corte.
 *
 * É **um arquivo só**, com exatamente a largura do tecido e o comprimento do
 * encaixe, em centímetros de verdade — imprimindo em escala 1:1, o que sai no
 * papel mede o que a peça mede. E vai só o desenho: nada de régua, nome de peça
 * ou rodapé, porque isso seria impresso junto no tecido.
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
    if (agora - dados.criadaEm > VALIDADE_MS) apagarSessao(sessao);
  });
}

/** Recebe uma arte já pronta, em binário, e põe no disco. */
router.post("/arte", express.raw({ limit: "400mb", type: () => true }), (req, res) => {
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
      };
    } catch (erro) {
      return res.status(500).json({ error: `Não deu para guardar a arte: ${erro.message}` });
    }
    artesGuardadas.set(sessao, guardadas);
  }

  // Chaves como "frente.1" e "frente1" são artes distintas. O nome no disco
  // é interno; reenviar a mesma chave substitui apenas aquela arte.
  const arquivo = guardadas.artes.get(chave)
    || path.join(guardadas.pasta, `${guardadas.artes.size}.arte`);
  try {
    fs.writeFileSync(arquivo, req.body);
  } catch (erro) {
    return res.status(500).json({ error: `Não deu para guardar a arte: ${erro.message}` });
  }
  guardadas.artes.set(chave, arquivo);
  // Reenviar a mesma chave substitui a arte: o que valia da anterior não vale.
  if (pngComAlfa(req.body)) guardadas.comAlfa.add(chave);
  else guardadas.comAlfa.delete(chave);
  res.json({ ok: true, bytes: req.body.length });
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

/**
 * Abre uma arte PNG como imagem do pdfkit: o objeto que `doc.image` aceita no
 * lugar do que `doc.openImage` devolveria (largura, altura, `embed`).
 */
async function abrirPng(doc, bytes) {
  // `keepIccProfile` deixa os valores de cor como estão no arquivo, que é o
  // que o pdfkit punha no PDF; sem ele o sharp converteria para sRGB — e o
  // `extractChannel` abaixo passaria a pegar o canal errado.
  const abrir = () => sharp(bytes, { limitInputPixels: false }).keepIccProfile();
  const { hasAlpha, channels, width, height } = await abrir().metadata();

  const [corCrua, alfaCru] = await Promise.all([
    abrir().removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    // O alfa é o último canal; "alpha" no sharp é sempre o 3, e cinza com
    // alfa só tem dois. O `b-w` é obrigatório: com o perfil de cor mantido,
    // o sharp devolveria o canal repetido em três, e a /SMask tem de ser cinza.
    hasAlpha ? abrir().extractChannel(channels - 1).toColourspace("b-w").raw().toBuffer() : null,
  ]);

  const cor = canalCru(corCrua.data, corCrua.info.width, corCrua.info.height, corCrua.info.channels);
  const alfa = alfaCru && mascaraServe(alfaCru)
    ? canalCru(alfaCru, width, height, 1)
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

/** Abre a arte do jeito mais rápido que o formato dela permite. */
async function abrirArte(doc, bytes) {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(ASSINATURA_PNG)) return abrirPng(doc, bytes);
  return doc.openImage(bytes);
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
  larguraTecido, consumo, posicoes, buffers, lerArte, podeTerTransparencia,
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

  const doc = new PDFDocument({
    size: tamanhoDa(paginas[0]),
    margin: 0,
    pdfVersion: comAlfa ? "1.4" : "1.3",
  });
  doc.pipe(destino);

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
  const desenhos = new Map();
  const desenhoDe = async (chave) => {
    if (desenhos.has(chave)) return desenhos.get(chave);
    let desenho = null;
    try {
      const bytes = buscar(chave);
      // Ver "O PNG NÃO PASSA PELO LEITOR DO PDFKIT", lá em cima.
      if (bytes) desenho = await abrirArte(doc, bytes);
    } catch (err) {
      // arte ilegível: as outras continuam
      console.warn(`[encaixe-pdf] arte ilegível (${chave}):`, err && err.message);
    }
    desenhos.set(chave, desenho);
    return desenho;
  };

  let desenhadas = 0;
  for (let i = 0; i < paginas.length; i++) {
    const pagina = paginas[i];
    if (i > 0) doc.addPage({ size: tamanhoDa(pagina), margin: 0 });

    for (const pos of pagina.posicoes) {
      const desenho = await desenhoDe(pos.chave);
      if (!desenho) continue;
      try {
        // O `y` da peça é medido no rolo inteiro; na página ele conta a partir
        // do começo da bancada.
        doc.image(desenho, pos.x * PT_POR_CM, (pos.y - pagina.topo) * PT_POR_CM, {
            width: pos.largura * PT_POR_CM,
            height: pos.altura * PT_POR_CM,
          });
        desenhadas++;
      } catch (err) {
        // uma imagem ruim não pode derrubar o PDF inteiro
        console.warn(`[encaixe-pdf] não deu para desenhar a peça ${pos.chave}:`, err && err.message);
      }
      // Ver `escoar`: é aqui que a fila do cano deixa de crescer sem limite.
      await escoar();
    }
  }

  doc.end();
  return {
    unidade,
    desenhadas,
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
    `consumo` VEM EM CENTÍMETROS — é o que o PDF multiplica por `PT_POR_CM`
    umas linhas abaixo. A metragem do plano fala em metros, então a conversão
    acontece aqui, uma vez, e não espalhada por quem lê o número.
  */
  const cota = await permitirExportacao(consumo / 100);
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

  // O nome da pasta escolhido na tela pode ter aspas ou caracteres Unicode.
  // O Express monta o cabeçalho com o escape e o filename* adequados.
  res.attachment(`${nome || "encaixe"}.pdf`);

  // `montarPdf` é assíncrona (ela cede a vez para o PDF escoar). O cabeçalho já
  // foi mandado a esta altura, então não dá para responder um JSON de erro: o
  // que resta é encerrar a resposta e deixar o registro.
  /*
   * A VERSÃO DO FORMATO PRECISA SER DECIDIDA ANTES DE O DOCUMENTO ABRIR, e
   * quem pode exigir 1.4 é a transparência. Aqui a pergunta é barata: as artes
   * de disco já vieram carimbadas na chegada, e as de memória estão na mão.
   */
  const podeTerTransparencia = [...daMemoria.values()].some(pngComAlfa)
    || (guardadas ? [...doDisco.keys()].some((chave) => guardadas.comAlfa.has(chave)) : false);

  montarPdf({ larguraTecido, consumo, posicoes, lerArte, podeTerTransparencia }, res).catch((erro) => {
    console.error("[encaixe-pdf] falhou ao montar o PDF:", erro);
    res.destroy(erro);
  });

  /*
   * QUANDO AS ARTES PODEM SER APAGADAS.
   *
   * Enquanto o rolo saía num arquivo só, este pedido era sempre o último: as
   * artes já tinham cumprido o que tinham para cumprir. Agora um encaixe com
   * bancada sai em UM PDF POR BANCADA (ver `baixarEncaixeEmPdf`, na tela), e
   * as mesmas artes servem todos eles — apagar no primeiro deixaria os outros
   * nove sem imagem nenhuma.
   *
   * Então quem manda é a tela: ela pede `manterSessao` em todos menos no
   * último. Se ela desistir no meio (fechou o programa, deu erro), o `
   * limparAntigas` recolhe a sessão dez minutos depois — ninguém fica com
   * pasta temporária presa para sempre.
   *
   * A limpeza espera o fim da resposta porque `montarPdf` ainda está lendo os
   * arquivos enquanto o PDF sai pelo cano.
   */
  if (sessao && !req.body.manterSessao) res.on("close", () => apagarSessao(sessao));
});

module.exports = router;
// A montagem do documento sai junto com o roteador para a bancada conseguir
// conferir o PDF sem subir o Express (ver `bancada/conferir-pdf.js`).
module.exports.montarPdf = montarPdf;
module.exports.paginasDoEncaixe = paginasDoEncaixe;
module.exports.unidadeDaPagina = unidadeDaPagina;
module.exports.PT_POR_CM = PT_POR_CM;
module.exports.LIMITE_PT = LIMITE_PT;
