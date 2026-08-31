/**
 * Tela de Encaixe: recebe as imagens das peças, a largura do rolo de tecido e
 * monta o encaixe automaticamente, calculando consumo em metros e
 * aproveitamento — a mesma ideia do Audaces Encaixe / eCut.
 *
 * Nesta primeira versão cada peça é tratada como um retângulo (largura x altura).
 * O encaixe pelo contorno real (peças irregulares, arquivos DXF/PLT/SVG) entra
 * depois: a função encaixar() é o único ponto que precisa trocar, porque o
 * resto da tela só consome a lista de posições que ela devolve.
 *
 * Tudo roda no navegador — as imagens não sobem para o servidor.
 */

// ==================== ELEMENTOS ====================

const encaixeLarguraInput = document.getElementById("encaixe-largura");
const encaixeEspacoInput = document.getElementById("encaixe-espaco");
const encaixeMargemInput = document.getElementById("encaixe-margem");
const encaixeTempoInput = document.getElementById("encaixe-tempo");
const encaixeGiroTodasSelect = document.getElementById("encaixe-giro-todas");
const encaixeModoSelect = document.getElementById("encaixe-modo");
const encaixeGuardadoAviso = document.getElementById("encaixe-guardado-aviso");
const encaixeFilesInput = document.getElementById("encaixe-files");
const encaixeUnidadeMoldeSelect = document.getElementById("encaixe-unidade-molde");
const encaixeModoVetorSelect = document.getElementById("encaixe-modo-vetor");
const btnLimparPecas = document.getElementById("btn-limpar-pecas");
const encaixePecasBody = document.getElementById("encaixe-pecas-body");
const encaixeContagem = document.getElementById("encaixe-contagem");
const encaixeNumeros = document.getElementById("encaixe-numeros");
const encaixeResumoLateral = document.getElementById("encaixe-resumo-lateral");
const encaixeError = document.getElementById("encaixe-error");
const btnEncaixar = document.getElementById("btn-encaixar");
const btnPararBusca = document.getElementById("btn-parar-busca");
const encaixeAndamento = document.getElementById("encaixe-andamento");
const encaixeCarregamento = document.getElementById("encaixe-carregamento");
const encaixeLoadingEtapa = document.getElementById("encaixe-loading-etapa");
const encaixeLoadingTitulo = document.getElementById("encaixe-loading-titulo");
const encaixeLoadingDetalhe = document.getElementById("encaixe-loading-detalhe");
const encaixeLoadingTempo = document.getElementById("encaixe-loading-tempo");
const encaixeLoadingPecas = document.getElementById("encaixe-loading-pecas");
const encaixeLoadingFill = document.getElementById("encaixe-loading-fill");
const encaixeLoadingBarra = encaixeCarregamento.querySelector(".encaixe-loading-barra");
const encaixeResultado = document.getElementById("encaixe-resultado");
const encaixeStats = document.getElementById("encaixe-stats");
const encaixeLarguraResumo = document.getElementById("encaixe-largura-resumo");
const encaixeResumo = document.getElementById("encaixe-resumo");
const encaixeSobras = document.getElementById("encaixe-sobras");
const encaixeCanvas = document.getElementById("encaixe-canvas");
const btnBaixarEncaixe = document.getElementById("btn-baixar-encaixe");
const btnEncaixePdf = document.getElementById("btn-encaixe-pdf");
const btnImprimirEncaixe = document.getElementById("btn-imprimir-encaixe");

// Cada peça: { id, nome, src, img, pxW, pxH, largura, altura, qtd, giro }
// largura/altura em centímetros; `giro` diz como ela pode virar (ver giroPadrao).
let pecasEncaixe = [];
let proximoIdPeca = 1;
let ultimoResultado = null;

// Uma vez que a pessoa mexe no campo "Procurar por" com a própria mão, ele é
// dela: parar de sugerir sozinho, senão trocar de tamanho de lote no meio do
// ajuste manual apagaria o que ela acabou de escrever.
let tempoAjustadoPeloUsuario = false;
encaixeTempoInput.addEventListener("input", () => { tempoAjustadoPeloUsuario = true; });

// Paleta usada para diferenciar as peças no desenho (uma cor por imagem).
const CORES_PECA = [
  "#2bd672", "#4aa8ff", "#f5a623", "#f0555b", "#b78bff",
  "#33d6c4", "#ff8fb1", "#c8d94a", "#7f9cff", "#ffb066",
];

// ==================== ERROS ====================

function mostrarErroEncaixe(msg) {
  encaixeError.textContent = msg;
  encaixeError.classList.remove("hidden");
}
function limparErroEncaixe() {
  encaixeError.classList.add("hidden");
}

// ==================== MEDIDA E FUNDO DA IMAGEM ====================

/**
 * Quantos pixels da imagem valem 1 cm, lido do próprio arquivo.
 *
 * PNG guarda isso no bloco `pHYs` e JPEG no cabeçalho JFIF. É a única fonte
 * confiável do tamanho real de uma arte: o número de pixels sozinho não diz
 * nada (a mesma imagem de 3000 px pode ser um bolso ou um banner).
 */
function pixelsPorCmDoArquivo(bytes) {
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (png) return pixelsPorCmDoPNG(bytes);
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (jpeg) return pixelsPorCmDoJPEG(bytes);
  return null;
}

function pixelsPorCmDoPNG(bytes) {
  const ler32 = (i) => (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
  let i = 8; // pula a assinatura
  while (i + 8 <= bytes.length) {
    const tamanho = ler32(i);
    const tipo = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    if (tipo === "pHYs" && tamanho >= 9) {
      const porMetroX = ler32(i + 8);
      const unidade = bytes[i + 16];
      // unidade 1 = metro; 0 quer dizer "só proporção", que não serve de medida
      if (unidade === 1 && porMetroX > 0) return porMetroX / 100;
      return null;
    }
    if (tipo === "IDAT" || tipo === "IEND") return null; // pHYs vem antes destes
    i += 12 + tamanho;
  }
  return null;
}

function pixelsPorCmDoJPEG(bytes) {
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marcador = bytes[i + 1];
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }
    if (marcador === 0xda) return null; // começou a imagem
    const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];

    if (marcador === 0xe0 && tamanho >= 14) { // APP0 / JFIF
      const assinatura = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (assinatura === "JFIF") {
        const unidade = bytes[i + 11];
        const densidade = (bytes[i + 12] << 8) | bytes[i + 13];
        if (densidade > 0) {
          if (unidade === 1) return densidade / 2.54; // pontos por polegada
          if (unidade === 2) return densidade;        // pontos por centímetro
        }
        return null;
      }
    }
    i += 2 + tamanho;
  }
  return null;
}

/**
 * As medidas em pixels, lidas do cabeçalho do arquivo.
 *
 * Serve para decidir o tamanho de decodificação ANTES de decodificar: saber que
 * a arte tem 7235x9254 permite pedir ao navegador uma versão já reduzida, em
 * vez de abrir 67 megapixels para depois jogar fora três quartos deles.
 */
function medidasDoArquivo(bytes) {
  // PNG: as medidas estão no IHDR, sempre o primeiro bloco.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const ler32 = (i) => (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    return { largura: ler32(16), altura: ler32(20) };
  }
  // JPEG: o tamanho está no marcador SOF (0xC0..0xCF, tirando os que não são).
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xda) break; // começou a imagem
      const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];
      const ehSOF = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
      if (ehSOF) return { altura: (bytes[i + 5] << 8) | bytes[i + 6], largura: (bytes[i + 7] << 8) | bytes[i + 8] };
      i += 2 + tamanho;
    }
  }
  return null;
}

/**
 * Até onde vale a pena carregar a arte.
 *
 * O PDF sai em `DPI_EXPORTACAO` e `desenharPecaGirada` **nunca amplia** — então
 * pixel acima disso não vira qualidade nenhuma, só memória e espera. Uma
 * camiseta de 49 cm precisa de 2.911 pixels para sair a 150 dpi; a arte que
 * chega costuma ter 5.824. A margem de 30% existe para o dia em que alguém
 * subir o dpi de exportação sem lembrar desta conta.
 */
const FOLGA_DE_RESOLUCAO = 1.3;

function ladoDeTrabalho(cm) {
  return Math.max(600, Math.round((cm / 2.54) * DPI_EXPORTACAO * FOLGA_DE_RESOLUCAO));
}

// Teto de arquivos abertos ao mesmo tempo. Ver `juntasNaLeitura`.
const LEITURA_MAX_JUNTAS = 3;

// Quando o arquivo não diz a resolução, 300 dpi é o padrão de arte para
// impressão — e a medida fica editável na tabela de qualquer jeito.
const DPI_PADRAO = 300;
const PPCM_PADRAO = DPI_PADRAO / 2.54;

/**
 * Decide se a imagem tem fundo para tirar, olhando a **borda inteira**.
 *
 * Antes essa decisão saía de quatro pixels, um em cada canto — e bastava um
 * respingo, uma marca de corte ou um cantinho da arte encostando para o
 * sistema achar que não havia fundo e mandar a peça como retângulo. Era isso
 * que fazia um JPG ler o contorno e o outro não.
 *
 * Agora vale a maioria: a cor mais repetida da borda é candidata a fundo, e só
 * é aceita se ela ocupa a maior parte da volta. Assim um pedaço estranho na
 * borda não derruba mais a leitura.
 */
/**
 * Tira o fundo da arte deixando o miolo intacto.
 *
 * `forcar` manda tirar mesmo quando o fundo é escuro ou colorido — é a opção
 * "tirar o fundo" da tabela, para arte que vem sobre preto. No automático só
 * sai fundo claro, que é como a arte de sublimação costuma chegar; tirar um
 * fundo escuro por conta própria estragaria arte com fundo de propósito.
 */
/**
 * Os pixels de uma imagem, no tamanho original dela.
 *
 * É a **única** porta de entrada para os pixels da arte inteira, de propósito:
 * o preparo em worker (encaixe-prepara.js) manda os pixels lidos aqui, e não a
 * imagem, justamente para os dois caminhos verem exatamente os mesmos bytes.
 * Devolve `null` quando o canvas está bloqueado por imagem de outra origem.
 */
function pixelsDaImagem(img) {
  // Aceita <img> e ImageBitmap. O bitmap é o caminho bom para arte grande: ele
  // é decodificado FORA da thread da tela, então o `drawImage` daqui só copia
  // pixels prontos em vez de decodificar 29 megapixels de uma vez.
  const largura = img.naturalWidth || img.width;
  const altura = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  try {
    return { canvas, ctx, dados: ctx.getImageData(0, 0, largura, altura), largura, altura };
  } catch (e) {
    return null;
  }
}

function removerFundoDaImagem(img, forcar = false) {
  const lido = pixelsDaImagem(img);
  if (!lido) return null;

  // A decisão e o apagamento são do encaixe-mascara.js, que o worker também
  // usa. Aqui fica só o que precisa de canvas: ler os pixels e refazer a
  // imagem depois.
  const mexeu = tirarFundoDosPixels(lido.dados.data, lido.largura, lido.altura, forcar);
  if (!mexeu) return null;

  lido.ctx.putImageData(lido.dados, 0, 0);
  return { src: lido.canvas.toDataURL("image/png"), apagados: mexeu.apagados, cor: mexeu.cor };
}

// ==================== ENTRADA DAS PEÇAS ====================

/**
 * Muita arte já chega com a quantidade no próprio nome do arquivo
 * ("frente 5x.png", "x3 manga.png", "costas-12x.png"). Aqui esse número é
 * lido e vira a quantidade da peça, para não ter que digitar peça por peça.
 *
 * O cuidado é não confundir quantidade com medida: "camisa 30x40.png" é
 * tamanho, não 30 peças. Por isso o "x" da quantidade não pode ter número
 * dos dois lados — é isso que separa "5x" de "30x40".
 */
const PADROES_QTD = [
  /(^|[^\d])(\d{1,4})\s*[xX](?=$|[\s._\-)\]])/,   // "5x", "12 x", "costas-8x", "manga4x"
  /(^|[^\d\0])[xX]\s*(\d{1,4})(?=$|[\s._\-)\]])/, // "x5", "x 12"
];

function lerQuantidadeDoNome(nomeArquivo) {
  // Primeiro mascara as medidas ("30x40", "30 x 40"): elas têm número dos dois
  // lados do x e não são quantidade. O \0 ocupa o mesmo tanto de caracteres,
  // então as posições continuam valendo no nome original.
  const semMedidas = nomeArquivo.replace(/\d+\s*[xX]\s*\d+/g, (medida) => "\0".repeat(medida.length));

  for (const padrao of PADROES_QTD) {
    const achado = semMedidas.match(padrao);
    if (!achado) continue;
    const qtd = Number(achado[2]);
    if (!qtd || qtd < 1) continue;

    const inicio = achado.index + achado[1].length; // achado[1] é a borda, fica no nome
    const nome = (nomeArquivo.slice(0, inicio) + nomeArquivo.slice(achado.index + achado[0].length))
      .replace(/\(\s*\)|\[\s*\]/g, "")   // sobrou "()" vazio depois de tirar o "4x"
      .replace(/[\s._\-]{2,}/g, " ")
      .replace(/^[\s._\-]+|[\s._\-]+$/g, "")
      .trim();
    // "5x (1).jpg" deixaria a peça chamada "(1)", que não diz nada. Quando o
    // que sobra é só pontuação e número de cópia, o nome do arquivo inteiro
    // informa mais.
    const temPalavra = /[a-zA-ZÀ-ÿ]/.test(nome);
    return { nome: temPalavra ? nome : nomeArquivo, qtd, veioDoArquivo: true };
  }
  return { nome: nomeArquivo, qtd: 1, veioDoArquivo: false };
}

/**
 * Carrega uma arte em PNG/JPG.
 *
 * A medida em centímetros vem da resolução gravada no arquivo (o dpi), e não
 * de um valor digitado: é a única informação do arquivo que diz o tamanho de
 * verdade. Quando o arquivo não traz essa informação, vale 300 dpi — o padrão
 * de arte para impressão — e a linha na tabela avisa que foi suposto.
 *
 * O fundo em volta da arte é apagado aqui, antes de tudo: assim a mesma
 * imagem serve para o encaixe, para o desenho e para o PDF sem a moldura
 * branca em volta.
 */
/**
 * A primeira metade: abre o arquivo e decodifica a imagem, sem tocar no fundo.
 *
 * A separação existe para o fundo poder ser tirado de todos os arquivos de uma
 * vez, nos workers, em vez de um por um aqui na tela.
 */
async function lerImagemCrua(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ppcmDoArquivo = pixelsPorCmDoArquivo(bytes);
  // Bitmap, e não <img> com data URL: a arte de impressão passa de 29
  // megapixels, e num <img> a decodificação cai na thread da tela no primeiro
  // `drawImage` — 1,2 a 1,8 s por arquivo, travando a página. O endereço vem
  // do próprio arquivo, para a miniatura da tabela ter o que mostrar.
  const endereco = URL.createObjectURL(file);
  const ppcm = ppcmDoArquivo || PPCM_PADRAO;
  // O teto sai da medida real da arte: os centímetros dela vezes o dpi que o
  // PDF consegue imprimir. Sem as medidas no cabeçalho não há teto, e o
  // arquivo entra inteiro como antes.
  const m = medidasDoArquivo(bytes);
  const teto = m ? ladoDeTrabalho(Math.max(m.largura, m.altura) / ppcm) : 0;
  const img = await criarBitmapOuImagem(file, endereco, teto)
    .catch(() => { throw new Error(`"${file.name}" não parece ser uma imagem válida.`); });
  return {
    file, img, endereco, ppcm, ppcmDoArquivo,
    pxOriginal: m || { largura: img.naturalWidth || img.width, altura: img.naturalHeight || img.height },
  };
}

/**
 * A segunda metade: com o fundo já resolvido, monta a peça.
 *
 * `semFundo` é o que o preparo devolveu — `null` quando não havia fundo para
 * tirar, e nesse caso a imagem original é que vale.
 */
async function montarPecaDaImagem(cru, semFundo, imagemPronta = null) {
  const { file, ppcm, ppcmDoArquivo } = cru;
  // `imagemPronta` é o bitmap que a leitura já decodificou, quando ele ainda
  // está vivo — é o caminho de quando a peça entra na tabela antes de o fundo
  // sair, e é o que evita decodificar 30 megapixels de novo só para a linha
  // aparecer.
  //
  // Sem ele: com recorte, vale o blob que o worker devolveu (é pequeno); sem
  // recorte, o bitmap original já foi transferido ao worker e fechado, então
  // refaz-se do próprio arquivo.
  const img = imagemPronta
    || (semFundo
      ? await criarBitmapOuImagem(semFundo.blob, semFundo.src)
      : await criarBitmapOuImagem(file, cru.endereco));
  // O desenho usa os pixels do bitmap; a miniatura da tabela é um <img> e
  // precisa de um endereço. Mesma arte, dois caminhos.
  const endereco = semFundo ? semFundo.src : cru.endereco;

  const doNome = lerQuantidadeDoNome(file.name.replace(/\.[^.]+$/, ""));
  const dpi = Math.round(ppcm * 2.54);
  return {
    id: proximoIdPeca++,
    nome: doNome.nome,
    src: endereco,
    miniatura: miniaturaDaArte(img),
    img,
    pxW: img.naturalWidth || img.width,
    pxH: img.naturalHeight || img.height,
    // A medida vem do ARQUIVO, não do bitmap: ele pode ter sido decodificado
    // reduzido (ver `ladoDeTrabalho`), e medir o reduzido daria uma peça menor
    // do que ela é. Foi exatamente esse erro, por outra causa, que fazia uma
    // camiseta de 49,3 cm entrar como 15,2 cm.
    largura: arredondar(cru.pxOriginal.largura / ppcm),
    altura: arredondar(cru.pxOriginal.altura / ppcm),
    qtd: doNome.qtd,
    qtdDoArquivo: doNome.veioDoArquivo,
    giro: giroPadrao(),
    contorno: "auto", // "auto" lê a silhueta da arte; "caixa" usa o retângulo
    origem: `${dpi} dpi${ppcmDoArquivo ? "" : " (suposto)"}${semFundo ? " · fundo removido" : ""}`,
  };
}

function arredondar(valor) {
  return Math.round(valor * 10) / 10;
}

// Quem sabe abrir cada formato é o `moldes.js`; aqui só interessa saber se o
// arquivo é vetorial (a leitura em si passa por `lerMoldeVetorial`).
const ehMoldeVetorial = (file) => ehArquivoDeMolde(file);

/**
 * Carrega um molde vetorial (DXF ou PLT): cada peça fechada do arquivo vira
 * uma linha na tabela, já com a medida real em centímetros que veio do
 * desenho — não precisa digitar largura. O molde é desenhado numa imagem de
 * fundo transparente, então daqui pra frente ele segue o mesmo caminho de um
 * PNG recortado.
 */
async function lerMoldesDoArquivo(file) {
  const unidade = encaixeUnidadeMoldeSelect.value || null;
  const modo = encaixeModoVetorSelect.value || "marcador";
  const lido = await lerMoldeVetorial(file, unidade, modo);

  if (lido.erro) throw new Error(`"${file.name}": ${lido.erro}`);
  if (!lido.moldes.length) throw new Error(`"${file.name}": não achei nenhuma peça fechada no arquivo.`);

  const novas = [];
  for (const molde of lido.moldes) {
    const cor = CORES_PECA[(pecasEncaixe.length + novas.length) % CORES_PECA.length];
    const imagem = moldeParaImagem(molde, cor);
    const img = await carregarImagem(imagem.src);
    const doNome = lerQuantidadeDoNome(molde.nome);
    novas.push({
      id: proximoIdPeca++,
      nome: doNome.nome,
      src: imagem.src,
      miniatura: miniaturaDaArte(img),
      img,
      pxW: imagem.pxW,
      pxH: imagem.pxH,
      largura: arredondar(molde.largura),
      altura: arredondar(molde.altura),
      qtd: doNome.qtd,
      qtdDoArquivo: doNome.veioDoArquivo,
      giro: giroPadrao(),
      contorno: "auto",
      origem: `${lido.formato} · ${lido.unidade}`
        + (modo === "inteiro" ? " · arquivo inteiro" : ""),
    });
  }
  return { pecas: novas, avisos: lido.avisos };
}

function carregarImagem(src) {
  return new Promise((pronto, falhou) => {
    const img = new Image();
    img.onload = () => pronto(img);
    img.onerror = () => falhou(new Error("Não consegui desenhar o molde."));
    img.src = src;
  });
}

/**
 * O arquivo escolhido no disco, lido como endereço `data:`.
 *
 * `carregarImagem` precisa de um endereço, e um `File` não tem nenhum. É a
 * ponte entre os dois, e é o que a tela de Vetor e a de arte do molde usam
 * para abrir o que a pessoa escolheu.
 *
 * `URL.createObjectURL` também serviria e gastaria menos memória, mas devolve
 * um endereço que morre se ninguém revogar — e estas duas telas seguram a
 * imagem enquanto durar o ajuste. Um endereço que se sustenta sozinho evita a
 * imagem sumir no meio do caminho.
 */
function lerComoDataURL(file) {
  return new Promise((pronto, falhou) => {
    const leitor = new FileReader();
    leitor.onload = () => pronto(String(leitor.result));
    leitor.onerror = () => falhou(new Error("Não consegui ler o arquivo."));
    leitor.readAsDataURL(file);
  });
}

/**
 * Traz as peças de um molde guardado para a tela de Encaixe.
 *
 * O molde chega como contorno em centímetros; aqui ele vira desenho e entra
 * como peça, com a quantidade já multiplicada pelo tanto de peças prontas. As
 * peças são acrescentadas, não trocadas: dá para juntar dois moldes no mesmo
 * tecido, que é o que se faz quando sobra espaço no rolo.
 */
async function mandarMoldeParaOEncaixe(nomeDoMolde, tamanho, pecas, unidades) {
  if (carregamentoAtivo) throw new Error("Aguarde o trabalho atual terminar antes de enviar mais peças.");

  const totalAntes = pecasEncaixe.length;
  iniciarCarregamentoArquivos(pecas.length, "molde salvo");
  btnEncaixar.disabled = true;
  btnLimparPecas.disabled = true;

  try {
    for (let indice = 0; indice < pecas.length; indice++) {
      const p = pecas[indice];
      atualizarCarregamentoArquivo(indice, pecas.length, p.nome || p.papel || `peça ${indice + 1}`);
      await respirarNaTela();

      const cor = CORES_PECA[pecasEncaixe.length % CORES_PECA.length];
      // A peça pode chegar com a arte já colocada dentro do contorno; quando não
      // chega, vale o contorno pintado, que é o bastante para calcular o encaixe.
      const desenho = p.desenho || moldeParaImagem(
        { contorno: p.contorno, furos: p.furos || [], largura: p.largura, altura: p.altura }, cor);
      const img = await carregarImagem(desenho.src);

      pecasEncaixe.push({
        id: proximoIdPeca++,
        nome: `${p.nome || p.papel}${p.estampa ? ` · ${p.estampa}` : ""}`,
        src: desenho.src,
        img,
        pxW: desenho.pxW,
        pxH: desenho.pxH,
        largura: p.largura,
        altura: p.altura,
        qtd: Math.max(1, p.quantidade * unidades),
        qtdDoArquivo: false,
        giro: giroPadrao(),
        contorno: "auto",
        origem: `molde ${nomeDoMolde} · ${tamanho} · ${p.papel}`
          + (p.estampa ? ` · estampa ${p.estampa}` : "")
          + (p.arte ? ` · arte ${p.arte}` : ""),
      });
      concluirCarregamentoArquivo(indice, pecas.length);
    }
    renderPecasEncaixe();
    const adicionadas = pecasEncaixe.length - totalAntes;
    finalizarCarregamento("concluido", {
      etapa: "Arquivos prontos",
      titulo: "Peças enviadas para o Encaixe",
      detalhe: `${adicionadas} peça${adicionadas === 1 ? " foi preparada" : "s foram preparadas"} e já pode fazer o encaixe.`,
    });
  } catch (err) {
    finalizarCarregamento("com-erro", {
      etapa: "Falha no envio",
      titulo: "Não foi possível preparar as peças",
      detalhe: err.message || "Revise o molde e tente novamente.",
    });
    throw err;
  } finally {
    btnEncaixar.disabled = false;
    btnLimparPecas.disabled = false;
  }
}

/**
 * Decodifica uma arte fora da thread da tela.
 *
 * Volta um `ImageBitmap` quando o navegador tem `createImageBitmap` (todos os
 * atuais têm), e cai num `<img>` comum quando não tem — aí a decodificação
 * volta a pesar na tela, mas nada deixa de funcionar. O resto do código trata
 * os dois igual: `pixelsDaImagem` lê `width`/`height` de qualquer um dos dois,
 * e `drawImage` aceita os dois.
 */
async function criarBitmapOuImagem(blob, endereco, tetoDeLado = 0) {
  if (typeof createImageBitmap === "function" && blob) {
    try {
      // Com teto e medidas conhecidas, o navegador já **decodifica reduzido**:
      // a arte de 67 megapixels nunca chega inteira à memória. Reduzir só para
      // baixo — ampliar não inventa detalhe, só custa.
      let opcoes;
      if (tetoDeLado > 0) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const m = medidasDoArquivo(bytes);
        if (m && m.largura > 0 && m.altura > 0) {
          const maior = Math.max(m.largura, m.altura);
          if (maior > tetoDeLado) {
            const fator = tetoDeLado / maior;
            opcoes = {
              resizeWidth: Math.max(1, Math.round(m.largura * fator)),
              resizeHeight: Math.max(1, Math.round(m.altura * fator)),
              resizeQuality: "high",
            };
          }
        }
      }
      return await createImageBitmap(blob, opcoes);
    } catch (e) {
      // formato que o bitmap não abre: segue pelo caminho antigo
    }
  }
  return carregarImagem(endereco);
}

/**
 * Uma miniatura pequena da arte, para a tabela.
 *
 * A tabela mostra a peça num quadrado de 41 px. Apontar o <img> para a arte
 * inteira faz o navegador decodificar 29 megapixels para pintar esse quadrado —
 * medido em 324 ms de thread travada, e **a cada vez que a tabela é redesenhada**,
 * o que acontece a cada tecla digitada num campo de quantidade.
 *
 * Desenhar uma vez num canvas de 96 px resolve de vez: o custo é uma redução só,
 * e daí em diante a tabela é de graça.
 */
const LADO_DA_MINIATURA = 96;

function miniaturaDaArte(img) {
  const largura = img.naturalWidth || img.width;
  const altura = img.naturalHeight || img.height;
  if (!largura || !altura) return null;
  try {
    const fator = Math.min(1, LADO_DA_MINIATURA / Math.max(largura, altura));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(largura * fator));
    canvas.height = Math.max(1, Math.round(altura * fator));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch (e) {
    return null; // canvas bloqueado: a tabela cai na arte inteira, como antes
  }
}

/**
 * As peças de um projeto entram no Encaixe.
 *
 * Bem mais simples que o caminho do molde: no molde a peça é um contorno, e a
 * arte ainda precisa ser desenhada dentro dele. Aqui a arte **já é** a peça —
 * a estampa foi aplicada na camisa antes de entrar no projeto —, então basta
 * carregar a imagem e dizer a medida guardada.
 *
 * `pecas` vem da tela de Projetos: { nome, url, largura, altura, quantidade }.
 * `unidades` multiplica a quantidade de cada uma: é a repetição do pedido.
 */
async function mandarProjetoParaOEncaixe(nomeDoProjeto, pecas, unidades) {
  if (carregamentoAtivo) throw new Error("Aguarde o trabalho atual terminar antes de enviar mais peças.");

  const totalAntes = pecasEncaixe.length;
  iniciarCarregamentoArquivos(pecas.length, "projeto salvo");
  btnEncaixar.disabled = true;
  btnLimparPecas.disabled = true;

  try {
    // Primeiro as imagens, todas, e só depois o fundo — em lote, nos workers.
    // O projeto guarda a arte **original**, com o fundo que ela tinha: a
    // biblioteca não é lugar de guardar imagem recortada, porque um recorte
    // errado não teria volta. Quem recorta é esta passagem, do mesmo jeito e
    // com o mesmo código de quando o arquivo é arrastado direto para o Encaixe
    // — sem isso a peça entra como o retângulo inteiro, fundo e tudo, e o
    // encaixe reserva espaço para a moldura branca.
    // As artes de um projeto são grandes (uma camiseta em 300 dpi passa de 29
    // megapixels). Carregá-las num <img> e desenhar force a decodificação a
    // acontecer NA THREAD DA TELA, no primeiro `drawImage` — medido em 1,2 a
    // 1,8 s por arte, que é o que fazia o navegador acusar a página como
    // travada. `createImageBitmap` decodifica fora da thread: o mesmo trabalho
    // total, mas a página continua respondendo (o maior bloqueio caiu de
    // 1928 ms para 149 ms nas quatro artes de uma camiseta).
    //
    // `await img.decode()` foi testado e NÃO resolve: o `drawImage` seguinte
    // decodifica de novo.
    const imagens = [];
    const blobs = [];
    for (let indice = 0; indice < pecas.length; indice++) {
      atualizarCarregamentoArquivo(indice, pecas.length,
        pecas[indice].nome || `arte ${indice + 1}`);
      await respirarNaTela();
      const blob = await fetch(pecas[indice].url).then((r) => r.blob());
      blobs.push(blob);
      const teto = ladoDeTrabalho(Math.max(pecas[indice].largura, pecas[indice].altura));
      imagens.push(await criarBitmapOuImagem(blob, pecas[indice].url, teto));
      await respirarNaTela();
    }

    // Ler os pixels é o pedaço pesado e ele roda na thread da tela — só ela tem
    // canvas. `respirarNaTela` entre uma arte e outra é o que mantém a página
    // respondendo; sem isso, quatro artes grandes viravam um bloco só e o
    // navegador acusava a página como travada.
    atualizarCarregamento({
      etapa: "Preparando as artes",
      titulo: "Tirando o fundo",
      detalhe: `${pecas.length} arte${pecas.length === 1 ? "" : "s"} · deixando só a peça`,
    });
    const semFundos = await tirarFundoEmParalelo(imagens, false, async (i, total) => {
      atualizarCarregamento({
        etapa: "Preparando as artes",
        titulo: "Tirando o fundo",
        detalhe: `${pecas[i] ? pecas[i].nome : `arte ${i + 1}`} · ${i + 1} de ${total}`,
        progresso: 20 + Math.round((i / Math.max(1, total)) * 60),
      });
      await respirarNaTela();
    });
    await respirarNaTela();

    for (let indice = 0; indice < pecas.length; indice++) {
      const p = pecas[indice];
      const cortada = semFundos[indice];
      // `null` quer dizer que não havia fundo em volta para tirar (arte que já
      // vem transparente, ou que sangra até a borda). Aí vale a original.
      // Quando não houve fundo para tirar, o bitmap original NÃO serve mais:
      // ele foi transferido para o worker e fechado aqui. Refazer a partir do
      // blob custa uma decodificação, fora da thread da tela, e só acontece
      // nesse caso — arte que já chega transparente.
      const img = cortada
        ? await criarBitmapOuImagem(cortada.blob, cortada.src)
        : await criarBitmapOuImagem(blobs[indice], p.url,
            ladoDeTrabalho(Math.max(p.largura, p.altura)));
      // A miniatura da tabela é um <img>, então precisa de um endereço; o
      // desenho do encaixe usa o bitmap. São a mesma arte por caminhos
      // diferentes: endereço para a tela, pixels prontos para o cálculo.
      const endereco = cortada ? cortada.src : p.url;

      pecasEncaixe.push({
        id: proximoIdPeca++,
        nome: p.nome,
        src: endereco,
        miniatura: miniaturaDaArte(img),
        img,
        pxW: img.naturalWidth || img.width,
        pxH: img.naturalHeight || img.height,
        // A medida vem do projeto, não do arquivo: ela já foi conferida uma vez
        // e corrigida à mão se precisava. Reler o dpi aqui desfaria isso.
        largura: p.largura,
        altura: p.altura,
        qtd: Math.max(1, Math.round(p.quantidade * unidades)),
        qtdDoArquivo: false,
        giro: giroPadrao(),
        contorno: "auto",
        origem: `projeto ${nomeDoProjeto}${cortada ? " · fundo removido" : ""}`,
      });
      concluirCarregamentoArquivo(indice, pecas.length);
      await respirarNaTela();
    }
    renderPecasEncaixe();
    const adicionadas = pecasEncaixe.length - totalAntes;
    const total = pecasEncaixe.reduce((soma, p) => soma + p.qtd, 0);
    // O envio NÃO calcula nada: quem aperta "Fazer encaixe" é a pessoa, depois
    // de escolher por quantos segundos a busca vai rodar. A mensagem diz isso
    // com todas as letras, senão a tela parece estar calculando sozinha.
    finalizarCarregamento("concluido", {
      etapa: "Peças na mesa",
      titulo: "Projeto carregado no Encaixe",
      detalhe: `${adicionadas} arte${adicionadas === 1 ? "" : "s"} de "${nomeDoProjeto}" `
        + `× ${unidades} unidade${unidades === 1 ? "" : "s"} = ${total} peças. `
        + `Escolha o tempo de procura e aperte "Fazer encaixe".`,
    });
  } catch (err) {
    finalizarCarregamento("com-erro", {
      etapa: "Falha no envio",
      titulo: "Não foi possível preparar as peças",
      detalhe: err.message || "Revise o projeto e tente novamente.",
    });
    throw err;
  } finally {
    btnEncaixar.disabled = false;
    btnLimparPecas.disabled = false;
  }
}

/**
 * Quantos arquivos podem ser abertos ao mesmo tempo.
 *
 * Não é "todos": uma arte de 30 megapixels decodificada ocupa uns 120 MB, e
 * quatro juntas passariam de meio giga na máquina que faz o encaixe. O teto
 * segura a memória e quase não custa tempo — o gargalo é o disco e o decodificador
 * do navegador, que com três em andamento já estão ocupados.
 */
function juntasNaLeitura(quantidade) {
  const nucleos = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(LEITURA_MAX_JUNTAS, nucleos - 1, quantidade));
}

/**
 * Roda `tarefa(indice)` para todos os índices, com no máximo `teto` em
 * andamento ao mesmo tempo.
 *
 * São `teto` linhas de produção puxando da mesma fila: cada uma pega o próximo
 * índice quando termina o anterior. Assim o arquivo pequeno não fica esperando
 * o grande da vez, que é o que acontecia quando isto era um `for` com `await`.
 */
async function emParalelo(quantidade, teto, tarefa) {
  let proximo = 0;
  const linhas = [];
  for (let i = 0; i < Math.min(teto, quantidade); i++) {
    linhas.push((async () => {
      while (proximo < quantidade) await tarefa(proximo++);
    })());
  }
  await Promise.all(linhas);
}

async function adicionarArquivos(files) {
  if (!files || files.length === 0) return; // nada a fazer, e o painel nem abre
  if (carregamentoAtivo) {
    mostrarErroEncaixe("Aguarde o trabalho atual terminar antes de adicionar outros arquivos.");
    return;
  }

  limparErroEncaixe();
  const recados = [];
  const totalAntes = pecasEncaixe.length;
  const labelArquivos = encaixeFilesInput.closest(".file-label");
  iniciarCarregamentoArquivos(files.length, "arquivo");
  encaixeFilesInput.disabled = true;
  btnEncaixar.disabled = true;
  btnLimparPecas.disabled = true;
  if (labelArquivos) labelArquivos.classList.add("carregando-arquivos");

  try {
    // Passada 1: abre cada arquivo e já monta a peça dele.
    //
    // Ler e montar ficam no mesmo laço de propósito. Eram duas passadas, e a
    // segunda só começava quando a primeira tinha terminado todos os arquivos
    // — a miniatura do primeiro esperava a leitura do último sem precisar.
    // Juntas, a miniatura de um arquivo é feita enquanto o seguinte ainda está
    // sendo lido.
    //
    // A peça é montada com a arte do jeito que ela veio, com fundo e tudo: o
    // nome, a medida em centímetros e a miniatura não dependem de o fundo ter
    // saído, e é isso que faz a linha aparecer sem esperar por ele.
    const crus = new Array(files.length).fill(null);
    const prontas = new Array(files.length).fill(null);
    const pecasComFundo = new Map(); // índice do arquivo -> a peça que entrou na tabela

    let lidos = 0;
    atualizarCarregamentoArquivo(0, files.length, files[0].name);
    await emParalelo(files.length, juntasNaLeitura(files.length), async (indice) => {
      const file = files[indice];
      try {
        if (ehMoldeVetorial(file)) {
          const lido = await lerMoldesDoArquivo(file);
          prontas[indice] = lido.pecas;
          lido.avisos.forEach((a) => recados.push(`"${file.name}": ${a}`));
        } else {
          const cru = await lerImagemCrua(file);
          crus[indice] = cru;
          // `cru.img` é o bitmap que a leitura acabou de decodificar e ainda
          // está vivo: a miniatura sai dele, sem decodificar nada de novo.
          const peca = await montarPecaDaImagem(cru, null, cru.img);
          prontas[indice] = [peca];
          pecasComFundo.set(indice, peca);
        }
      } catch (err) {
        recados.push(err.message);
      }
      lidos++;
      atualizarCarregamentoArquivo(lidos, files.length, file.name);
      await respirarNaTela();
    });

    // Passada 2: entram na tabela na ordem em que os arquivos vieram.
    prontas.forEach((lista, indice) => {
      if (lista) lista.forEach((p) => pecasEncaixe.push(p));
      else concluirCarregamentoArquivo(indice, files.length);
    });

    // Passada 3: o fundo sai DEPOIS, com as peças já na tela. Não se espera por
    // ela aqui — é justamente esse `await` que fazia a tabela demorar.
    if (pecasComFundo.size > 0) {
      const lote = pecasComFundo;
      const desteLote = crus;
      preparoDeFundo = preparoDeFundo.then(() => tirarFundoDepois(lote, desteLote));
    }
  } finally {
    if (recados.length > 0) mostrarErroEncaixe(recados.join(" "));
    renderPecasEncaixe();

    const adicionadas = pecasEncaixe.length - totalAntes;
    const nenhumArquivoValido = adicionadas === 0;
    const terminouComAvisos = recados.length > 0 && !nenhumArquivoValido;
    finalizarCarregamento(nenhumArquivoValido ? "com-erro" : terminouComAvisos ? "interrompido" : "concluido", {
      etapa: nenhumArquivoValido ? "Arquivos recusados" : terminouComAvisos ? "Pronto com avisos" : "Arquivos prontos",
      titulo: nenhumArquivoValido ? "Nenhuma peça foi adicionada" : "Peças preparadas para o encaixe",
      detalhe: nenhumArquivoValido
        ? "Não foi possível ler os arquivos. Veja o aviso da tela e tente novamente."
        : `${adicionadas} peça${adicionadas === 1 ? " foi adicionada" : "s foram adicionadas"}`
          + (terminouComAvisos ? ". Alguns arquivos precisam de atenção." : ". Agora você já pode fazer o encaixe."),
    });

    encaixeFilesInput.disabled = false;
    btnEncaixar.disabled = false;
    btnLimparPecas.disabled = false;
    if (labelArquivos) labelArquivos.classList.remove("carregando-arquivos");
  }
}

encaixeFilesInput.addEventListener("change", async () => {
  const files = Array.from(encaixeFilesInput.files || []);
  if (files.length > 0) await adicionarArquivos(files);
  encaixeFilesInput.value = ""; // permite reenviar o mesmo arquivo depois
});

btnLimparPecas.addEventListener("click", () => {
  pecasEncaixe = [];
  ultimoResultado = null;
  encaixeResultado.classList.add("hidden");
  limparErroEncaixe();
  renderPecasEncaixe();
});

// Arrastar as imagens direto para a tabela também adiciona as peças.
const encaixePage = document.querySelector('.page[data-page="encaixe"]');
["dragenter", "dragover"].forEach((evt) => {
  encaixePage.addEventListener(evt, (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    encaixePage.classList.add("arrastando");
  });
});
["dragleave", "drop"].forEach((evt) => {
  encaixePage.addEventListener(evt, (e) => {
    if (evt === "dragleave" && e.relatedTarget && encaixePage.contains(e.relatedTarget)) return;
    encaixePage.classList.remove("arrastando");
  });
});
encaixePage.addEventListener("drop", async (e) => {
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
    .filter((f) => f.type.startsWith("image/") || ehMoldeVetorial(f));
  if (files.length === 0) return;
  e.preventDefault();
  await adicionarArquivos(files);
});

/**
 * Modos de giro de uma peça:
 *   "180"   vira de cabeça para baixo — o giro que o tecido permite, porque
 *           mantém o sentido do fio (e do desenho) na mesma direção;
 *   "fixa"  não vira de jeito nenhum;
 *   "livre" também aceita deitar 90°, para arte que não tem sentido. São as
 *           quatro posições da volta inteira: 0°, 90°, 180° e 270°.
 *
 * O seletor "Giro de todas as peças" manda no lote todo e é o padrão de quem
 * chegar depois. Acertar uma peça sozinha continua sendo na coluna Girar da
 * tabela — o caso de uma ou duas exceções, que era o único jeito antes.
 */
const giroPadrao = () => encaixeGiroTodasSelect.value;

// ==================== LISTA DE PEÇAS ====================

/**
 * A linha de cada arquivo, e o que se abre embaixo dela.
 *
 * A linha é a do Optmize Lite: miniatura, nome, medida, quantidade e o X de
 * tirar — uma linha por arquivo, para caber lote grande na coluna sem rolar
 * até o fim do mundo.
 *
 * O que o full tem a mais mora no gaveta que abre ao clicar no nome: medida
 * exata, giro e CONTORNO. O contorno é a diferença do full para o lite — lá a
 * peça é sempre a caixa em volta da arte; aqui ela pode ser recortada pela
 * silhueta, e "Tirar o fundo" é o motor que descobre essa silhueta na imagem.
 * É um controle por peça porque a decisão é por peça: a arte com fundo branco
 * quer o motor, o molde vetorial já vem com contorno, e a estampa que sangra
 * até a borda quer a caixa mesmo.
 */
const CAMPO_MINI =
  "mt-0! text-[0.62rem] uppercase tracking-wide text-tinta-apagada " +
  "[&>input]:mt-1 [&>input]:px-2 [&>input]:py-1 [&>input]:text-[0.8rem] " +
  "[&>select]:mt-1 [&>select]:px-2 [&>select]:py-1 [&>select]:text-[0.8rem]";

function renderPecasEncaixe() {
  encaixePecasBody.innerHTML = "";

  if (pecasEncaixe.length === 0) {
    encaixePecasBody.innerHTML =
      `<div class="flex h-full flex-col items-center justify-center gap-3 px-4 py-8">
         <span class="grid size-11 place-items-center rounded-xl border border-linha text-tinta-apagada">
           <svg class="size-5" viewBox="0 0 24 24" aria-hidden="true"><use href="icones.svg#file-text" /></svg>
         </span>
         <p class="m-0 text-center text-[11px] text-tinta-apagada">Arraste os moldes ou as artes para cá.</p>
       </div>`;
    atualizarPainelDoTrabalho();
    return;
  }

  pecasEncaixe.forEach((peca, i) => {
    const cor = CORES_PECA[i % CORES_PECA.length];
    const linha = document.createElement("div");
    linha.className = "group border-b border-linha";
    linha.innerHTML = `
      <div class="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-painel-suave">
        <span class="peca-thumb size-8! shrink-0" style="border-color: ${cor};"><img src="${peca.miniatura || peca.src}" alt="" /></span>

        <span class="min-w-0 flex-1">
          <button type="button" data-abrir-peca="${peca.id}" class="flex w-full items-center gap-1 text-left" title="Medida, giro e contorno desta peça">
            <span class="truncate text-[11px] font-medium text-tinta">${escapeHtml(peca.nome)}</span>
            <svg class="size-3 shrink-0 text-tinta-apagada transition-colors group-hover:text-ambar" viewBox="0 0 24 24" aria-hidden="true"><use href="icones.svg#chevron-down" /></svg>
          </button>
          <span class="block truncate font-mono text-[9px] text-tinta-apagada">${peca.largura.toFixed(1).replace(".", ",")} × ${peca.altura.toFixed(1).replace(".", ",")} cm${peca.qtdDoArquivo ? " · qtd do nome" : ""}</span>
        </span>

        <input type="number" min="1" step="1" value="${peca.qtd}" data-campo="qtd" data-id="${peca.id}"
               aria-label="Cópias de ${escapeHtml(peca.nome)}"
               class="w-12! shrink-0 px-1.5! py-1! text-center! text-[0.8rem]!" />

        <button type="button" data-del-peca="${peca.id}" aria-label="Tirar ${escapeHtml(peca.nome)}"
                class="grid size-6 shrink-0 place-items-center rounded text-tinta-apagada transition-colors hover:text-[var(--danger)]">×</button>
      </div>

      <div data-detalhes="${peca.id}" class="hidden border-t border-linha bg-painel-suave px-3 py-2.5">
        <div class="grid grid-cols-2 gap-1.5">
          <label class="${CAMPO_MINI}">Largura (cm)
            <input type="number" min="0.1" step="0.1" value="${peca.largura}" data-campo="largura" data-id="${peca.id}" />
          </label>
          <label class="${CAMPO_MINI}">Altura (cm)
            <input type="number" min="0.1" step="0.1" value="${peca.altura}" data-campo="altura" data-id="${peca.id}" />
          </label>
        </div>
        <div class="mt-1.5 grid grid-cols-2 gap-1.5">
          <label class="${CAMPO_MINI}">Girar
            <select data-campo="girar" data-id="${peca.id}">
              <option value="180"${peca.giro === "180" ? " selected" : ""}>Vira 180°</option>
              <option value="fixa"${peca.giro === "fixa" ? " selected" : ""}>Fixa</option>
              <option value="livre"${peca.giro === "livre" ? " selected" : ""}>Livre (90°)</option>
            </select>
          </label>
          <label class="${CAMPO_MINI}">Contorno
            <select data-campo="contorno" data-id="${peca.id}">
              <option value="auto"${peca.contorno === "auto" ? " selected" : ""}>Automático</option>
              <option value="caixa"${peca.contorno === "caixa" ? " selected" : ""}>Retângulo</option>
              <option value="tirar-fundo"${peca.contorno === "tirar-fundo" ? " selected" : ""}>Tirar o fundo</option>
            </select>
          </label>
        </div>
        <span class="mt-1.5 block font-mono text-[9px] text-tinta-apagada">${peca.origem || `${peca.pxW} × ${peca.pxH} px`}${peca.ocupacao != null ? ` · ${Math.round(peca.ocupacao * 100)}% da caixa` : ""}</span>
      </div>
    `;
    encaixePecasBody.appendChild(linha);
  });

  atualizarPainelDoTrabalho();
}

/**
 * Quanto tempo de busca sugerir para um lote deste tamanho.
 *
 * Medido nos arquivos de um teste real desta tela: um lote de 23 peças já
 * não melhorava mais depois de uns 20s (rodou até 60s sem ganho); um de 57
 * ainda estava melhorando aos 40s. A conta abaixo é a reta que passa perto
 * dos dois pontos — não é ciência exata, é uma sugestão que erra para mais
 * tempo, nunca para menos, porque sobrar segundo custa paciência e faltar
 * custa tecido. O teto de 60s evita que um lote enorme sugira um número que
 * ninguém pediu; quem quiser mais digita à mão.
 */
function tempoSugerido(copias) {
  return Math.max(10, Math.min(60, Math.round(copias * 0.9)));
}

/**
 * O que a coluna e a faixa de status mostram ANTES de existir encaixe.
 *
 * Contagem de arquivos, de cópias e a largura do tecido não dependem de
 * cálculo nenhum — e são justamente o que o operador confere antes de apertar.
 * Deixá-las em branco até o primeiro encaixe fazia a faixa parecer quebrada.
 */
function atualizarPainelDoTrabalho() {
  const arquivos = pecasEncaixe.length;
  const copias = pecasEncaixe.reduce((soma, p) => soma + (Number(p.qtd) || 0), 0);

  if (encaixeContagem) encaixeContagem.textContent = `${arquivos} · ${copias} cóp.`;
  if (btnLimparPecas) btnLimparPecas.classList.toggle("hidden", arquivos === 0);

  if (!tempoAjustadoPeloUsuario && copias > 0) {
    encaixeTempoInput.value = tempoSugerido(copias);
  }

  // Com resultado na tela, quem manda na faixa é o resultado.
  if (ultimoResultado) return;

  const largura = Number(encaixeLarguraInput.value) || 0;
  encaixeStats.innerHTML = `
    <div class="stat"><span class="stat-valor">${arquivos}</span><span class="stat-label">Arquivos</span></div>
    <div class="stat"><span class="stat-valor">${copias}</span><span class="stat-label">Peças</span></div>
    <div class="stat"><span class="stat-valor">${largura} cm</span><span class="stat-label">Mídia</span></div>
    <div class="stat"><span class="stat-valor">—</span><span class="stat-label">Metragem</span></div>
    <div class="stat"><span class="stat-valor">—</span><span class="stat-label">Aproveitamento</span></div>
  `;
}

/**
 * Mexer na largura ajusta a altura (e vice-versa) mantendo a proporção da
 * imagem: distorcer a arte para forçar o encaixe estragaria a estampa.
 */
encaixePecasBody.addEventListener("input", (e) => {
  const campo = e.target.dataset.campo;
  if (!campo) return;
  const peca = pecasEncaixe.find((p) => p.id === Number(e.target.dataset.id));
  if (!peca) return;

  const valor = Number(e.target.value);
  const proporcao = peca.pxH / peca.pxW;

  if (campo === "largura" && valor > 0) {
    peca.largura = valor;
    peca.altura = arredondar(valor * proporcao);
    const inputAltura = encaixePecasBody.querySelector(`input[data-campo="altura"][data-id="${peca.id}"]`);
    if (inputAltura) inputAltura.value = peca.altura;
  } else if (campo === "altura" && valor > 0) {
    peca.altura = valor;
    peca.largura = arredondar(valor / proporcao);
    const inputLargura = encaixePecasBody.querySelector(`input[data-campo="largura"][data-id="${peca.id}"]`);
    if (inputLargura) inputLargura.value = peca.largura;
  } else if (campo === "qtd") {
    peca.qtd = Math.max(1, Math.floor(valor) || 1);
    atualizarPainelDoTrabalho();
  }
});

encaixePecasBody.addEventListener("change", (e) => {
  const campo = e.target.dataset.campo;
  if (campo !== "girar" && campo !== "contorno") return;
  const peca = pecasEncaixe.find((p) => p.id === Number(e.target.dataset.id));
  if (!peca) return;
  if (campo === "girar") peca.giro = e.target.value;
  if (campo === "contorno") {
    peca.contorno = e.target.value;
    peca.ocupacao = null; // a silhueta muda: o percentual só volta no próximo encaixe
    peca.mascaras = null;
    // "Tirar o fundo" é para arte sobre preto ou sobre cor: o automático não
    // mexe nesses de propósito, então aqui a remoção é refeita à força.
    if (peca.contorno === "tirar-fundo") tirarFundoAForca(peca);
  }
});

/**
 * O preparo que ainda está correndo em segundo plano.
 *
 * Os lotes são encadeados: mandar mais arquivos enquanto o fundo do lote
 * anterior ainda sai não atropela nada, e quem for encaixar espera esta
 * promessa — uma só, valendo por todos os lotes.
 */
let preparoDeFundo = Promise.resolve();

/**
 * Tira o fundo das artes DEPOIS que elas já estão na tabela.
 *
 * A remoção é metade da espera do preparo, e a linha da tabela não precisa
 * dela: nome, medida e miniatura saem da arte crua. Tirando-a do caminho, as
 * peças aparecem em torno da metade do tempo, e a pessoa já pode conferir
 * medida e quantidade enquanto o resto termina.
 *
 * Quem precisa do fundo removido é a silhueta do encaixe — e o encaixe espera
 * por esta promessa antes de começar (ver o botão "Fazer encaixe"). Sem essa
 * espera, um clique apressado encaixaria a peça pelo retângulo do fundo, e o
 * erro seria silencioso: sairia um encaixe pior, sem nenhum aviso.
 */
async function tirarFundoDepois(pecasPorIndice, crus) {
  const indices = [...pecasPorIndice.keys()];
  try {
    const semFundos = await tirarFundoEmParalelo(indices.map((i) => crus[i].img));
    let trocadas = 0;
    for (let k = 0; k < indices.length; k++) {
      const semFundo = semFundos[k];
      const cru = crus[indices[k]];
      const peca = pecasPorIndice.get(indices[k]);
      if (!peca) continue;

      // O bitmap que a peça estava usando é o mesmo que acabou de ser
      // transferido para o worker — e transferir fecha. Ela precisa de um
      // novo de qualquer jeito: o recorte, quando houve; o arquivo de novo,
      // quando não havia fundo para tirar.
      if (semFundo) {
        peca.img = await criarBitmapOuImagem(semFundo.blob, semFundo.src);
        peca.src = semFundo.src;
        peca.miniatura = miniaturaDaArte(peca.img);
        peca.mascaras = null; // a silhueta muda: será refeita no encaixe
        trocadas++;
      } else {
        peca.img = await criarBitmapOuImagem(cru.file, cru.endereco);
      }
    }
    if (trocadas > 0) renderPecasEncaixe();
  } catch (err) {
    // A arte crua continua valendo, então o encaixe sai — só com a silhueta
    // menos justa. Um aviso na tela aqui atrapalharia mais do que ajuda.
    console.error("remoção de fundo adiada:", err);
  }
}

/**
 * Refaz a remoção de fundo mandando tirar mesmo que ele seja escuro. Troca a
 * imagem da peça pela recortada, então daí para frente tudo — silhueta,
 * desenho e PDF — enxerga a arte já sem o fundo.
 */
async function tirarFundoAForca(peca) {
  if (peca.imgOriginal === undefined) peca.imgOriginal = peca.img;
  // Vai pelo worker também: é a mesma leitura de milhões de pixels, e aqui a
  // pessoa está esperando com a tabela na frente.
  const [semFundo] = await tirarFundoEmParalelo([peca.imgOriginal], true);
  if (!semFundo) {
    mostrarErroEncaixe(`"${peca.nome}": não achei uma cor de fundo em volta para tirar. `
      + `A arte deve estar sangrando até a borda.`);
    return;
  }
  peca.img = await criarBitmapOuImagem(semFundo.blob, semFundo.src);
  peca.src = semFundo.src;
  peca.miniatura = miniaturaDaArte(peca.img);
  peca.mascaras = null;
  renderPecasEncaixe();
}

encaixePecasBody.addEventListener("click", (e) => {
  const abrir = e.target.closest("[data-abrir-peca]");
  if (abrir) {
    const gaveta = encaixePecasBody.querySelector(`[data-detalhes="${abrir.dataset.abrirPeca}"]`);
    if (gaveta) gaveta.classList.toggle("hidden");
    return;
  }

  const id = e.target.dataset.delPeca;
  if (!id) return;
  pecasEncaixe = pecasEncaixe.filter((p) => p.id !== Number(id));
  renderPecasEncaixe();
});

encaixeGiroTodasSelect.addEventListener("change", () => {
  // Aplica no lote inteiro, inclusive no que já estava em "livre": quem mexe
  // aqui está dizendo como a produção toda vai girar, e uma peça sobrando com
  // o valor antigo seria justamente a surpresa que este controle evita.
  const giro = giroPadrao();
  pecasEncaixe.forEach((p) => { p.giro = giro; });
  renderPecasEncaixe();
});

// ==================== ENCAIXE PELO CONTORNO ====================

/**
 * Aqui a peça deixa de ser um retângulo e passa a ser a silhueta real da arte.
 *
 * A silhueta vira uma grade de células (tipo um quadriculado por cima da peça);
 * de cada coluna dessa grade guardamos só onde o tecido começa e onde termina
 * — `topo` e `base`. Encaixar então é deslizar essa peça por cima do "relevo"
 * do que já foi posicionado e deixar ela descer até encostar. É assim que uma
 * manga entra na curva de outra, em vez de ficar presa na caixa em volta.
 *
 * Como só topo/base importam, um vazado no meio do desenho não atrapalha o
 * cálculo — e também não dá para enfiar peça pequena dentro desse vazado.
 */

const canvasMascara = document.createElement("canvas");
const ctxMascara = canvasMascara.getContext("2d", { willReadFrequently: true });

/**
 * Descobre quais células têm tecido. Tenta, nesta ordem:
 *  - fundo transparente (PNG recortado, ou JPG que já teve o fundo tirado na
 *    hora de carregar) — o caminho mais confiável;
 *  - fundo de cor lisa em volta, espalhando a partir da borda;
 *  - se nada disso servir, assume a caixa inteira (volta a ser retângulo).
 *
 * A decisão do que é fundo é a mesma de `removerFundoDaImagem`, de propósito:
 * quando as duas discordavam, o PDF saía com o fundo pintado e o encaixe
 * empilhava as peças como se ele não existisse.
 */
/**
 * Os pixels da arte já reduzidos à grade do encaixe.
 *
 * Mesma história do `pixelsDaImagem`: porta única, para o worker receber
 * exatamente estes bytes. Vale reparar que a redução tem que sair daqui — o
 * Chrome reduz um ImageBitmap com uma conta diferente da que usa para reduzir
 * um <img>, e deixar o worker reduzir mudava a silhueta (está explicado em
 * prepara-worker.js).
 */
function pixelsDaArteNaGrade(peca, cols, rows) {
  canvasMascara.width = cols;
  canvasMascara.height = rows;
  ctxMascara.clearRect(0, 0, cols, rows);
  ctxMascara.drawImage(peca.img, 0, 0, cols, rows);
  try {
    return ctxMascara.getImageData(0, 0, cols, rows);
  } catch (e) {
    return null; // canvas bloqueado por imagem de outra origem
  }
}

function silhuetaDaImagem(peca, cols, rows) {
  const total = cols * rows;
  const cheio = () => ({ bits: new Uint8Array(total).fill(1), modo: "caixa" });
  if (peca.contorno === "caixa") return cheio();

  const dados = pixelsDaArteNaGrade(peca, cols, rows);
  if (!dados) return cheio();

  // Daqui para frente é só conta em cima dos pixels, e mora no
  // encaixe-mascara.js para o worker poder fazer a mesma coisa.
  return silhuetaDeDados(dados.data, cols, rows);
}

/**
 * Monta (e guarda em cache) as máscaras de uma peça nas quatro rotações. O
 * cache evita refazer tudo a cada clique em "Fazer encaixe" quando nada mudou.
 */
/** A grade de uma peça: quantas células de lado ela tem. */
function gradeDaPeca(peca, passo) {
  return {
    cols: Math.max(1, Math.round(peca.largura / passo)),
    rows: Math.max(1, Math.round(peca.altura / passo)),
  };
}

/** A chave do cache de máscaras: muda quando qualquer entrada muda. */
function chaveDasMascaras(peca, passo, raio) {
  return `${passo}|${raio}|${peca.largura}|${peca.altura}|${peca.contorno}`;
}

function mascarasDaPeca(peca, passo, raio) {
  const chave = chaveDasMascaras(peca, passo, raio);
  if (peca._cacheMascaras && peca._cacheMascaras.chave === chave) return peca._cacheMascaras;

  const { cols, rows } = gradeDaPeca(peca, passo);
  const silhueta = silhuetaDaImagem(peca, cols, rows);
  peca._cacheMascaras = {
    chave, ...mascarasDeSilhueta(silhueta, cols, rows, passo, raio),
  };
  return peca._cacheMascaras;
}

// ==================== O MELHOR ENCAIXE JÁ CONSEGUIDO ====================

/**
 * A busca é sorteada: ela acha um encaixe muito bom numa rodada e pode não
 * chegar lá de novo na seguinte. Guardar só a metragem do recorde não bastava
 * — o encaixe bom era desenhado uma vez e sumia, porque a rodada pior tomava o
 * lugar dele na tela.
 *
 * Agora o encaixe inteiro fica guardado, peça por peça, e volta com um clique.
 * A chave é o **trabalho exato**: as mesmas peças, nas mesmas quantidades, na
 * mesma largura, com a mesma folga. Mudou qualquer coisa disso, o encaixe
 * guardado não serve mais e não é oferecido.
 */

/** Espalha os caracteres num número (FNV-1a), só para a chave ficar curta. */
function embaralharTexto(texto) {
  let n = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    n ^= texto.charCodeAt(i);
    n = Math.imul(n, 0x01000193) >>> 0;
  }
  return n.toString(36);
}

function chaveDoTrabalho(pecas, larguraTecido, espaco, margem) {
  const lista = pecas.map((p) =>
    [p.nome, p.largura, p.altura, p.qtd, p.giro, p.contorno, p.pxW, p.pxH].join("~")
  ).sort().join("|");
  return `${larguraTecido}/${espaco}/${margem}/${embaralharTexto(lista)}`;
}

/** O encaixe do jeito que ele vai para o banco: só o essencial de cada peça. */
function posicoesParaGuardar(resultado) {
  return resultado.posicoes.map((p) => ({
    indice: p.item.indice,
    copia: p.item.copia == null ? 1 : p.item.copia,
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
    rot: p.rot == null ? (p.girado ? 90 : 0) : p.rot,
    comMascara: !!p.mascara,
  }));
}

/**
 * A memória melhora o resultado, mas nunca pode impedir o encaixe de começar
 * se o servidor local estiver reiniciando ou ocupado. Depois do prazo, a tela
 * simplesmente continua sem memória e tenta salvá-la na próxima vez.
 */
async function fetchEncaixeComPrazo(url, opcoes = {}, prazoMs = 2500) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), prazoMs);
  try {
    return await fetch(url, { ...opcoes, signal: controlador.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * As quatro conversas com a memória do encaixe passam por aqui.
 *
 * Eram quatro funções escritas à mão, duas delas idênticas letra por letra e
 * diferindo só no endereço. Quatro cópias do mesmo `try/catch` querem dizer
 * quatro lugares para lembrar quando a regra mudar — e a regra é uma só:
 * **falha de rede nunca derruba o encaixe**. Sem servidor a tela funciona
 * igual, só começa do zero.
 */
async function pedirAoServidorDoEncaixe(caminho, opcoes) {
  try {
    const resposta = await fetchEncaixeComPrazo(caminho, opcoes);
    return resposta.ok ? await resposta.json() : null;
  } catch (err) {
    return null;
  }
}

const enviarAoServidorDoEncaixe = (caminho, dados) =>
  pedirAoServidorDoEncaixe(caminho, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });

async function buscarEncaixeGuardado(chave) {
  const r = await pedirAoServidorDoEncaixe(
    `/api/encaixe/guardado?chave=${encodeURIComponent(chave)}`);
  return r ? r.guardado : null;
}

const guardarEncaixe = (dados) =>
  enviarAoServidorDoEncaixe("/api/encaixe/guardado", dados);

/**
 * Remonta na tela um encaixe que estava guardado.
 *
 * O que veio do banco é só posição; a peça, a máscara e o passo da grade são
 * refeitos aqui a partir do que está na tabela agora — por isso a chave exige
 * que as peças sejam as mesmas.
 */
async function usarEncaixeGuardado(guardado) {
  const larguraTecido = Number(encaixeLarguraInput.value);
  const espaco = Math.max(0, Number(encaixeEspacoInput.value) || 0) / 10;
  const margem = Math.max(0, Number(encaixeMargemInput.value) || 0);
  const { passo, folgaReal } = grade(larguraTecido, espaco);

  // O "índice" de uma posição é a linha da tabela de peças, não um campo da
  // peça: é assim que a busca numera os itens.
  for (const peca of pecasEncaixe) {
    if (!peca._cacheMascaras) await mascarasDaPeca(peca, passo, 0);
  }

  const posicoes = [];
  for (const p of guardado.posicoes) {
    const peca = pecasEncaixe[p.indice];
    if (!peca) return null; // a tabela mudou: o guardado não serve mais
    const deitada = p.rot === 90 || p.rot === 270;
    const mascaras = peca._cacheMascaras;
    posicoes.push({
      item: { ...peca, indice: p.indice, copia: p.copia, mascaras },
      x: p.x,
      y: p.y,
      largura: deitada ? peca.altura : peca.largura,
      altura: deitada ? peca.largura : peca.altura,
      rot: p.rot,
      girado: deitada,
      mascara: p.comMascara && mascaras ? mascaras.rotacoes[p.rot] : null,
      passo,
    });
  }

  const areaTecido = (larguraTecido * guardado.consumo) / 10000;
  ultimoResultado = {
    posicoes,
    naoEncaixadas: [],
    consumo: guardado.consumo,
    larguraTecido,
    totalItens: posicoes.length,
    folgaPedida: espaco,
    folgaReal,
    areaReal: posicoes.reduce((soma, pos) =>
      soma + (pecasEncaixe[pos.item.indice]._cacheMascaras.areaReal || 0), 0),
    areaCaixas: posicoes.reduce((soma, pos) => soma + pos.largura * pos.altura, 0),
    receita: guardado.receita,
    venceuContorno: posicoes.some((p) => p.mascara),
    modoDeEncaixe: encaixeModoSelect.value || "auto",
    doGuardado: true,
    tentativas: 0,
    decorridoMs: 0,
    ganhos: [],
    placar: [],
  };

  renderResultado();
  encaixeAndamento.textContent =
    `Este é o melhor encaixe já conseguido com estas peças: ${(guardado.consumo / 100).toFixed(2)} m, `
    + `de ${new Date(guardado.atualizado_em || guardado.criado_em).toLocaleDateString("pt-BR")}.`;
  encaixeAndamento.classList.remove("hidden");
  esconderOfertaDoGuardado();
  return ultimoResultado;
}

function mostrarOfertaDoGuardado(guardado, consumoAgora) {
  encaixeGuardadoAviso.innerHTML = "";
  const texto = document.createElement("span");
  texto.textContent =
    `O melhor encaixe já conseguido com estas mesmas peças gastou `
    + `${(guardado.consumo / 100).toFixed(2)} m — este saiu ${(consumoAgora / 100).toFixed(2)} m.`;
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "btn secondary btn-sm";
  botao.textContent = "Usar o melhor de antes";
  botao.addEventListener("click", async () => {
    botao.disabled = true;
    const deu = await usarEncaixeGuardado(guardado);
    if (!deu) {
      botao.disabled = false;
      mostrarErroEncaixe("As peças da tabela mudaram desde aquele encaixe; não dá para trazer de volta.");
    }
  });
  encaixeGuardadoAviso.append(texto, botao);
  encaixeGuardadoAviso.classList.remove("hidden");
}

function esconderOfertaDoGuardado() {
  encaixeGuardadoAviso.classList.add("hidden");
  encaixeGuardadoAviso.innerHTML = "";
}

// ==================== MEMÓRIA ====================

/** O que o sistema já aprendeu com encaixes parecidos. */
const buscarMemoria = (assinatura) => pedirAoServidorDoEncaixe(
  `/api/encaixe/memoria?assinatura=${encodeURIComponent(assinatura)}`);

/** Anota como foi este encaixe, para o próximo começar mais esperto. */
const guardarNaMemoria = (dados) =>
  enviarAoServidorDoEncaixe("/api/encaixe/memoria", dados);

// ==================== EXECUÇÃO ====================

let pararBusca = false;
// A partir daqui o trabalho é "lote grande". Isso já decidiu qual encaixador
// usar; hoje decide só o ritmo da busca — uma tentativa por rodada, para o
// botão de parar continuar respondendo, e menos receitas na passada base
// quando a pessoa pediu contorno na mão. Ver o comentário em `fazerEncaixe`.
const LIMITE_LOTE_GRANDE = 120;
let inicioDoCarregamento = 0;
let relogioDoCarregamento = null;
let esconderCarregamentoTimer = null;
let carregamentoAtivo = false;
let resultadoGeradoNesteCarregamento = false;
let tipoDoCarregamento = "encaixe";

function definirPrioridadeDoProcessamento(ativa, calculando = false) {
  window.encaixeEmProcessamento = ativa;
  window.encaixeEmCalculo = ativa && calculando;
  window.dispatchEvent(new CustomEvent("encaixe-prioridade-mudou", {
    detail: { ativa, fase: calculando ? "calculo" : "arquivos" },
  }));
}

function atualizarTempoDoCarregamento() {
  if (!inicioDoCarregamento) return;
  const segundos = (Date.now() - inicioDoCarregamento) / 1000;
  encaixeLoadingTempo.textContent = `${segundos.toLocaleString("pt-BR", {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  })} s`;
}

function atualizarCarregamento({ etapa, titulo, detalhe, progresso } = {}) {
  if (etapa) encaixeLoadingEtapa.textContent = String(etapa).toUpperCase();
  if (titulo) encaixeLoadingTitulo.textContent = titulo;
  if (detalhe !== undefined) encaixeLoadingDetalhe.textContent = detalhe || "";
  if (Number.isFinite(progresso)) {
    const valor = Math.min(100, Math.max(2, progresso));
    encaixeLoadingFill.style.width = `${valor}%`;
    encaixeLoadingBarra.setAttribute("aria-valuenow", String(Math.round(valor)));
  }
}

function iniciarCarregamento(totalPecas, modo) {
  if (esconderCarregamentoTimer) clearTimeout(esconderCarregamentoTimer);
  if (relogioDoCarregamento) clearInterval(relogioDoCarregamento);
  carregamentoAtivo = true;
  tipoDoCarregamento = "encaixe";
  definirPrioridadeDoProcessamento(true, true);
  resultadoGeradoNesteCarregamento = false;
  inicioDoCarregamento = Date.now();
  encaixeCarregamento.classList.remove("hidden", "concluido", "interrompido", "com-erro");
  encaixeCarregamento.setAttribute("aria-busy", "true");
  encaixeLoadingPecas.textContent = `${totalPecas} peça${totalPecas === 1 ? "" : "s"} no trabalho`;
  atualizarCarregamento({
    etapa: "Iniciando",
    titulo: "Preparando o encaixe",
    detalhe: modo === "auto" ? "O sistema vai escolher o método mais adequado." : "Carregando o método escolhido.",
    progresso: 3,
  });
  atualizarTempoDoCarregamento();
  relogioDoCarregamento = setInterval(atualizarTempoDoCarregamento, 100);
}

function iniciarCarregamentoArquivos(totalArquivos, origem = "arquivo") {
  if (esconderCarregamentoTimer) clearTimeout(esconderCarregamentoTimer);
  if (relogioDoCarregamento) clearInterval(relogioDoCarregamento);
  carregamentoAtivo = true;
  tipoDoCarregamento = "arquivos";
  resultadoGeradoNesteCarregamento = false;
  inicioDoCarregamento = Date.now();
  definirPrioridadeDoProcessamento(true, false);
  encaixeCarregamento.classList.remove("hidden", "concluido", "interrompido", "com-erro");
  encaixeCarregamento.setAttribute("aria-busy", "true");
  encaixeLoadingPecas.textContent = `0 de ${totalArquivos} ${origem}${totalArquivos === 1 ? "" : "s"}`;
  btnPararBusca.classList.add("hidden");
  atualizarCarregamento({
    etapa: "Recebendo arquivos",
    titulo: "Preparando as peças",
    detalhe: "Lendo medidas, contornos e imagens antes de liberar o encaixe.",
    progresso: 3,
  });
  atualizarTempoDoCarregamento();
  relogioDoCarregamento = setInterval(atualizarTempoDoCarregamento, 100);
}

/**
 * `prontos` é quantos arquivos já terminaram — não o índice de um deles.
 *
 * A diferença passou a importar quando a leitura virou paralela: com três
 * arquivos em andamento não existe "o arquivo da vez", e o que dá para dizer
 * com honestidade é quantos já ficaram prontos. O número do título é limitado
 * ao total, senão o último a terminar mostrava "Arquivo 5 de 4".
 */
function atualizarCarregamentoArquivo(prontos, total, nome) {
  atualizarCarregamento({
    etapa: "Preparando arquivos",
    titulo: `Lendo ${nome}`,
    detalhe: `Arquivo ${Math.min(prontos + 1, total)} de ${total} · identificando medidas e contornos`,
    progresso: 5 + (prontos / Math.max(1, total)) * 86,
  });
  encaixeLoadingPecas.textContent = `${prontos} de ${total} arquivo${total === 1 ? "" : "s"} pronto${prontos === 1 ? "" : "s"}`;
}

function concluirCarregamentoArquivo(indice, total) {
  const prontos = indice + 1;
  encaixeLoadingPecas.textContent = `${prontos} de ${total} arquivo${total === 1 ? "" : "s"} pronto${prontos === 1 ? "" : "s"}`;
  atualizarCarregamento({ progresso: 5 + (prontos / Math.max(1, total)) * 86 });
}

function finalizarCarregamento(tipo = "concluido", mensagem = {}) {
  if (!carregamentoAtivo) return;
  carregamentoAtivo = false;
  definirPrioridadeDoProcessamento(false, false);
  if (relogioDoCarregamento) clearInterval(relogioDoCarregamento);
  relogioDoCarregamento = null;
  atualizarTempoDoCarregamento();
  encaixeCarregamento.setAttribute("aria-busy", "false");
  encaixeCarregamento.classList.add(tipo);

  const padrao = tipo === "concluido"
    ? { etapa: "Pronto", titulo: "Encaixe concluído", detalhe: "O resultado já foi atualizado abaixo." }
    : tipo === "interrompido"
      ? { etapa: "Encerrado", titulo: "Cálculo interrompido", detalhe: resultadoGeradoNesteCarregamento ? "Foi usado o melhor resultado encontrado até agora." : "Nenhum resultado novo foi gerado." }
      : { etapa: "Atenção", titulo: "Não foi possível concluir", detalhe: "Veja o aviso abaixo e tente novamente." };
  atualizarCarregamento({ ...padrao, ...mensagem, progresso: 100 });

  esconderCarregamentoTimer = setTimeout(() => {
    if (!carregamentoAtivo) encaixeCarregamento.classList.add("hidden");
  }, tipoDoCarregamento === "arquivos" ? 2200 : tipo === "concluido" ? 1100 : 1800);
}

// A preparação das silhuetas também pode ser pesada. Ceder a vez entre uma
// peça e outra mantém o botão de parar, o andamento e o restante da tela vivos.
const canalDaTela = new MessageChannel();
const pausasDaTela = [];
canalDaTela.port1.onmessage = () => {
  const continuar = pausasDaTela.shift();
  if (continuar) continuar();
};
const respirarNaTela = () => new Promise((continuar) => {
  pausasDaTela.push(continuar);
  canalDaTela.port2.postMessage(0);
});

btnPararBusca.addEventListener("click", () => {
  pararBusca = true;
  btnPararBusca.disabled = true;
  btnPararBusca.textContent = "Encerrando…";
});

/**
 * Escolhe a grade do encaixe a partir da folga pedida.
 *
 * A folga entre peças é aplicada engordando cada peça pela metade dela, e esse
 * engorde só existe em células inteiras da grade — ou seja, **a grade é que
 * decide a precisão da folga**. Com uma grade fixa de meio centímetro, pedir
 * 3 mm dava zero (as peças encostavam!) e pedir 5 mm dava 10 mm.
 *
 * Por isso a grade passa a acompanhar a folga: uma célula vale metade do que
 * foi pedido, para o engorde de uma célula dar exatamente a folga. Grade mais
 * fina custa tempo (o encaixe olha mais células), então há um piso; abaixo
 * dele a folga sai um pouco maior que a pedida, nunca menor — errar para mais
 * gasta um tiquinho de tecido, errar para menos estraga o corte.
 */
function grade(larguraTecido, espaco) {
  const maisGrossa = Math.min(1, Math.max(0.2, arredondar(larguraTecido / 300)));
  const maisFina = larguraTecido / 1000;
  if (!(espaco > 0)) return { passo: maisGrossa, raio: 0, folgaReal: 0 };

  // Metade da folga tem que caber num número inteiro de células. Divide-se
  // essa metade em quantas partes forem necessárias para a célula não passar
  // do tamanho máximo — assim a folga sai exata em vez de arredondada para
  // cima (era o que fazia 15 mm virar 20 mm).
  const metade = espaco / 2;
  const partes = Math.max(1, Math.ceil(metade / maisGrossa - 1e-9));
  let passo = metade / partes;
  let raio = partes;

  // Célula fina demais deixa o encaixe lento sem retorno. Abaixo do piso a
  // folga sai um pouco maior que a pedida — nunca menor.
  if (passo < maisFina) {
    passo = maisFina;
    raio = Math.ceil(metade / passo - 1e-9);
  }
  return { passo, raio, folgaReal: raio * passo * 2 };
}

/** Quanto tempo a busca pode ficar tentando, do campo da tela. */
function tempoDeProcuraMs() {
  const segundos = Number(encaixeTempoInput.value);
  return Math.min(300, Math.max(1, segundos || 5)) * 1000;
}

function mostrarAndamento(estado, aprendido) {
  const metros = estado.consumo ? `${(estado.consumo / 100).toFixed(2)} m` : "—";
  const decorrido = (estado.decorridoMs / 1000).toFixed(1);
  const totalMs = tempoDeProcuraMs();
  const total = (totalMs / 1000).toFixed(0);
  const partes = [`tentativa ${estado.tentativas}`, `${decorrido}s de ${total}s`, `melhor: ${metros}`];
  // Com a busca espalhada pelos núcleos, "tentativa 652" sozinho parece erro de
  // conta para quem está acostumado com o número de antes. Dizer quantos estão
  // trabalhando explica o salto.
  if (estado.workers > 1) partes.push(`${estado.workers} núcleos`);
  // Quantas vezes a busca empacou e trocou de caminho em vez de desistir.
  if (estado.paredes > 0) partes.push(`${estado.paredes} recomeço(s)`);
  if (estado.fase === "perseguindo" && estado.alvo) {
    partes.push(`buscando alcançar o recorde de ${(estado.alvo / 100).toFixed(2)} m`);
  } else if (estado.fase === "melhorando") {
    partes.push(`${estado.semGanho} sem ganho`);
  }
  if (aprendido && aprendido.encaixesDoTipo > 0) {
    partes.push(`aprendeu com ${aprendido.encaixesDoTipo} encaixe(s) parecido(s)`);
  }
  encaixeAndamento.textContent = partes.join(" · ");
  const titulo = estado.fase === "perseguindo" ? "Buscando alcançar o melhor já conhecido"
    : estado.fase === "base" ? "Montando o primeiro encaixe"
      : estado.fase === "pronto" ? "Finalizando o resultado"
        : estado.modo === "explorar" ? "Tentando um caminho diferente"
          : "Lapidando o melhor encaixe";
  atualizarCarregamento({
    etapa: estado.fase === "base" ? "Primeiro encaixe" : "Otimizando",
    titulo,
    detalhe: partes.join(" · "),
    progresso: 34 + Math.min(1, estado.decorridoMs / totalMs) * 56,
  });
}

btnEncaixar.addEventListener("click", async () => {
  limparErroEncaixe();

  if (pecasEncaixe.length === 0) {
    mostrarErroEncaixe("Adicione pelo menos uma peça antes de encaixar.");
    return;
  }

  const larguraTecido = Number(encaixeLarguraInput.value);
  // O campo é em milímetro (é assim que se fala de folga de corte); daqui para
  // dentro tudo continua em centímetro, como o resto da tela.
  const espaco = Math.max(0, Number(encaixeEspacoInput.value) || 0) / 10;
  const margem = Math.max(0, Number(encaixeMargemInput.value) || 0);

  if (!larguraTecido || larguraTecido <= 0) {
    mostrarErroEncaixe("Informe a largura do tecido em centímetros.");
    return;
  }
  if (larguraTecido - margem * 2 <= 0) {
    mostrarErroEncaixe("As margens são maiores que a largura do tecido.");
    return;
  }

  const modoDeEncaixe = encaixeModoSelect.value || "auto";

  // O aviso de "procurando" aparece JÁ AQUI, antes da espera do fundo logo
  // abaixo — não depois dela. Quando alguma arte ainda estava com o fundo
  // saindo (comum logo depois de mandar um lote grande), a tela ficava
  // parada por alguns segundos sem nenhum sinal depois do clique: parecia
  // que ele não tinha feito nada. A contagem aqui é a de cópias já
  // conhecida (soma de qtd); o texto é atualizado com o número exato de
  // peças mais abaixo, depois que a lista se expande de verdade.
  pararBusca = false;
  iniciarCarregamento(pecasEncaixe.reduce((soma, p) => soma + (Number(p.qtd) || 0), 0), modoDeEncaixe);
  btnEncaixar.disabled = true;
  btnEncaixar.textContent = "Procurando…";
  btnPararBusca.disabled = false;
  btnPararBusca.textContent = "Cancelar preparação";
  btnPararBusca.classList.remove("hidden");
  encaixeAndamento.classList.add("hidden");
  encaixeAndamento.textContent = "";

  // Se o fundo de alguma arte ainda estiver saindo, espera aqui.
  //
  // Tem de ser ANTES da cópia logo abaixo, e não depois: `{ ...peca }` leva
  // junto a referência do bitmap. Esperando depois, as peças ganhavam a arte
  // recortada mas `itens` continuava com o bitmap velho — que a remoção de
  // fundo já tinha transferido para o worker, e transferir desanexa. O encaixe
  // morria em "The image source is detached", e só às vezes: quando o fundo
  // terminava antes do clique, passava.
  await preparoDeFundo;

  // Expande pela quantidade: cada cópia é uma peça independente no encaixe.
  const itens = [];
  pecasEncaixe.forEach((peca, indice) => {
    if (!(peca.largura > 0) || !(peca.altura > 0)) return;
    for (let i = 0; i < peca.qtd; i++) {
      itens.push({ ...peca, indice, copia: i + 1 });
    }
  });

  if (itens.length === 0) {
    mostrarErroEncaixe("As peças precisam ter largura e altura maiores que zero.");
    finalizarCarregamento("com-erro");
    btnEncaixar.disabled = false;
    btnEncaixar.textContent = "Fazer encaixe";
    btnPararBusca.classList.add("hidden");
    return;
  }

  encaixeLoadingPecas.textContent = `${itens.length} peça${itens.length === 1 ? "" : "s"} no trabalho`;
  // Devolve a vez ao navegador para o aviso aparecer antes do trabalho pesado.
  // O timer é de propósito: requestAnimationFrame não dispara com a aba em
  // segundo plano, e aí o encaixe nunca começaria.
  await new Promise((pronto) => setTimeout(pronto, 20));

  try {
    const { passo, raio, folgaReal } = grade(larguraTecido, espaco);

    // A silhueta é lida sempre, mesmo encaixando por retângulo: é dela que sai
    // a área real das peças, e é essa área que dá um aproveitamento honesto —
    // senão o modo retângulo contaria o vazio em volta da peça como
    // aproveitado e mostraria um número melhor do que a realidade.
    // As máscaras das peças saem nos workers, todas ao mesmo tempo (ver
    // encaixe-prepara.js). Antes era uma peça de cada vez aqui na tela, e em
    // seis arquivos de tamanho real isso custava 1,3 segundo de tela travada.
    // Peça cujo cache ainda serve nem entra na conta.
    atualizarCarregamento({
      etapa: "Preparando peças",
      titulo: "Lendo o contorno das peças",
      detalhe: `${pecasEncaixe.length} peça(s) · criando o contorno para o cálculo`,
      progresso: 5,
    });
    await prepararMascarasEmParalelo(pecasEncaixe, passo, raio, (prontas, total) => {
      atualizarCarregamento({
        detalhe: `${prontas} de ${total} · criando o contorno para o cálculo`,
        progresso: 5 + (prontas / Math.max(1, total)) * 20,
      });
    });
    await respirarNaTela();
    if (pararBusca) {
      encaixeAndamento.textContent = "Encaixe interrompido antes do cálculo.";
      encaixeAndamento.classList.remove("hidden");
      finalizarCarregamento("interrompido");
      return;
    }
    pecasEncaixe.forEach((peca) => { peca.ocupacao = peca._cacheMascaras.ocupacao; });
    itens.forEach((item) => { item.mascaras = pecasEncaixe[item.indice]._cacheMascaras; });

    const assinatura = assinaturaDoTrabalho(pecasEncaixe, larguraTecido);
    const chave = chaveDoTrabalho(pecasEncaixe, larguraTecido, espaco, margem);
    atualizarCarregamento({
      etapa: "Consultando histórico",
      titulo: "Procurando um encaixe anterior",
      detalhe: "Se este mesmo trabalho já foi feito, o melhor resultado será reaproveitado.",
      progresso: 27,
    });
    const guardadoAntes = await buscarEncaixeGuardado(chave);
    esconderOfertaDoGuardado();
    atualizarCarregamento({
      etapa: "Consultando histórico",
      titulo: "Carregando o que o sistema aprendeu",
      detalhe: "Usando os encaixes anteriores para começar por uma organização melhor.",
      progresso: 31,
    });
    const aprendido = await buscarMemoria(assinatura);

    const alturaMax = itens.reduce((soma, it) => soma + Math.max(it.largura, it.altura) + espaco, margem * 2);
    // Com o contorno ligado os dois encaixadores disputam: peça quase
    // retangular não ganha nada com o contorno, e aí o de retângulo gasta
    // menos. Ligar o contorno nunca piora o resultado.
    // O encaixe por NFP (public/nfp.js) existe e está correto, mas medindo ele
    // perde do encaixe por perfil em todo trabalho testado — uma passada
    // gulosa não alcança o perfil somado à dupla, aos reinícios e ao recorde.
    // Fica de fora do padrão para não cobrar tempo de todo encaixe à toa;
    // basta acrescentar "nfp" aqui para colocá-lo na disputa.
    // "auto" põe os dois para disputar e fica com o que gastar menos tecido.
    // As outras duas opções existem porque nem sempre o que gasta menos é o
    // que a produção quer: quem pediu contorno quer ver a peça entrando no vão
    // da outra, mesmo que o retângulo tenha saído alguns centímetros melhor.
    // O encaixe por faixas entra na disputa mesmo perdendo na maioria dos
    // trabalhos: quem decide é o resultado, não a nossa expectativa. O que
    // impede o tempo de se diluir é a poda — receita que fica muito atrás sai
    // da roda depois da primeira chance.
    const loteGrande = itens.length >= LIMITE_LOTE_GRANDE;
    // O encaixe por faixas foi medido em vários formatos e perdeu em todos,
    // além de quase dobrar a passada inicial. Fica disponível no motor para
    // estudos futuros, mas sai do caminho normal.
    //
    // Lote grande já teve um atalho aqui: com 120 peças ou mais, o automático
    // desligava o contorno e usava só a caixa. A razão era real — no histórico
    // de 222 peças o contorno conseguia **38 tentativas** contra 1496 da
    // caixa, e perdia por 5,4 pontos de aproveitamento. Cada tentativa pelo
    // contorno custava caro demais para o tamanho do trabalho.
    //
    // O WASM (wasm/src/lib.rs) desfez essa conta: o contorno passou a fazer
    // ~3,9x mais tentativas no mesmo tempo, e em lote grande ele agora faz
    // *mais* tentativas que a caixa. Medido na bancada, 5 fatias de 5 s:
    //
    //   130 peças, rolo 160 · caixa 13,51 m (60,8%) · auto 10,81 m (75,9%)
    //   222 peças, rolo 179 · caixa 18,84 m (66,1%) · auto 15,71 m (79,3%)
    //   235 peças, rolo 160 · caixa 20,39 m (62,0%) · auto 18,00 m (70,3%)
    //
    // De 10% a 20% menos tecido, com o mesmo tempo de tela (25,2 s contra
    // 25,0 s) — a busca roda nos workers, então a tela não sente. O atalho saiu.
    const motores = modoDeEncaixe === "auto" ? ["contorno", "retangulo"]
      : modoDeEncaixe === "contorno" ? ["contorno"] : ["retangulo"];

    btnPararBusca.textContent = "Parar e usar este";
    // A busca vai para os workers (encaixe-paralelo.js) e volta com o melhor
    // de todas as fatias. Sem worker disponível, ela mesma cai na busca de uma
    // thread só — daqui não muda nada: mesma chamada, mesmo resultado.
    ultimoResultado = await buscarMelhorEncaixeEmParalelo(itens, {
      larguraTecido, espaco, margem, passo, alturaMax, motores,
      memoria: aprendido ? aprendido.memoria : null,
      // Recorde de encaixes parecidos: a busca não entrega pior que isso sem
      // antes tentar de verdade alcançar.
      alvo: aprendido ? aprendido.melhorAntes : null,
      tempoMaximoMs: tempoDeProcuraMs(),
      // Desistir por empacar tem que acompanhar o tempo pedido: com um limite
      // fixo de 1 segundo, pedir 30 segundos de procura não mudaria nada,
      // porque a busca encerraria antes de chegar lá.
      msSemGanho: Math.max(800, tempoDeProcuraMs() * 0.25),
      // Contorno de lote grande custa muito por tentativa. Rodar poucas
      // receitas de cada vez faz o limite e o botão de parar voltarem a valer.
      maxReceitasBase: loteGrande && modoDeEncaixe === "contorno" ? 2 : null,
      tentativasPorLote: loteGrande ? 1 : 8,
      deveParar: () => pararBusca,
      aoProgredir: (estado) => mostrarAndamento(estado, aprendido),
    });
    resultadoGeradoNesteCarregamento = true;

    ultimoResultado.modoDeEncaixe = modoDeEncaixe;
    ultimoResultado.areaReal = ultimoResultado.posicoes.reduce(
      (soma, pos) => soma + pecasEncaixe[pos.item.indice]._cacheMascaras.areaReal, 0);
    ultimoResultado.areaCaixas = ultimoResultado.posicoes.reduce(
      (soma, pos) => soma + pos.largura * pos.altura, 0);
    ultimoResultado.larguraTecido = larguraTecido;
    ultimoResultado.totalItens = itens.length;
    ultimoResultado.folgaPedida = espaco;
    ultimoResultado.folgaReal = folgaReal;

    atualizarCarregamento({
      etapa: "Montando resultado",
      titulo: "Desenhando o encaixe",
      detalhe: `${ultimoResultado.posicoes.length} peças posicionadas · preparando as medidas finais`,
      progresso: 92,
    });
    await respirarNaTela();

    renderPecasEncaixe(); // mostra quanto da caixa cada silhueta ocupa
    renderResultado();

    const areaTecido = (larguraTecido * ultimoResultado.consumo) / 10000;
    const aproveitamento = areaTecido > 0
      ? (ultimoResultado.areaReal / 10000 / areaTecido) * 100 : 0;

    // O encaixe inteiro fica guardado quando é o melhor já conseguido com
    // estas peças. Quando não é, a tela oferece o de antes em vez de deixar o
    // bom desaparecer.
    atualizarCarregamento({
      etapa: "Salvando",
      titulo: "Guardando o melhor resultado",
      detalhe: "Na próxima vez este mesmo trabalho poderá abrir mais rápido.",
      progresso: 96,
    });
    await guardarEncaixe({
      chave, assinatura, larguraTecido, espaco, margem,
      consumo: ultimoResultado.consumo,
      aproveitamento,
      pecas: pecasEncaixe.map((p) => ({ nome: p.nome, qtd: p.qtd })),
      posicoes: posicoesParaGuardar(ultimoResultado),
      receita: ultimoResultado.receita,
    });
    if (guardadoAntes && guardadoAntes.consumo < ultimoResultado.consumo - 0.05) {
      mostrarOfertaDoGuardado(guardadoAntes, ultimoResultado.consumo);
    }

    const anotado = await guardarNaMemoria({
      assinatura,
      receita: ultimoResultado.receita,
      placar: ultimoResultado.placar,
      larguraTecido,
      pecas: itens.length,
      consumo: ultimoResultado.consumo,
      aproveitamento,
      tentativas: ultimoResultado.tentativas,
    });

    mostrarResumoDaBusca(ultimoResultado, aprendido, anotado);
    finalizarCarregamento(pararBusca ? "interrompido" : "concluido");
  } catch (err) {
    console.error("Falha ao fazer o encaixe:", err);
    mostrarErroEncaixe(err && err.message
      ? `Não foi possível concluir o encaixe: ${err.message}`
      : "Não foi possível concluir o encaixe. Tente de novo com \"Sempre pela caixa\" em Como encaixar.");
    encaixeAndamento.textContent = "O cálculo foi encerrado. Ajuste as peças e tente novamente.";
    encaixeAndamento.classList.remove("hidden");
    finalizarCarregamento("com-erro");
  } finally {
    if (carregamentoAtivo) finalizarCarregamento(pararBusca ? "interrompido" : "com-erro");
    btnEncaixar.disabled = false;
    btnEncaixar.textContent = "Fazer encaixe";
    btnPararBusca.classList.add("hidden");
  }
});

/** Conta o que a busca fez e o quanto a memória já pesa. */
function mostrarResumoDaBusca(resultado, aprendido, anotado) {
  const partes = [
    `${resultado.tentativas} tentativas em ${(resultado.decorridoMs / 1000).toFixed(1)}s`,
  ];
  if (resultado.ganhos && resultado.ganhos.length > 0) {
    partes.push(`melhorou ${resultado.ganhos.length}x durante a procura`);
  }
  if (resultado.receita) partes.push(`receita vencedora: ${resultado.receita}`);

  const total = anotado ? anotado.encaixesDoTipo : (aprendido ? aprendido.encaixesDoTipo : 0);
  if (total > 0) partes.push(`memória: ${total} encaixe(s) deste tipo`);

  if (aprendido && aprendido.melhorAntes > 0) {
    const diferenca = ((aprendido.melhorAntes - resultado.consumo) / aprendido.melhorAntes) * 100;
    if (diferenca > 0.05) partes.push(`${diferenca.toFixed(1)}% melhor que o recorde anterior`);
    else if (diferenca < -0.05) partes.push(`recorde do tipo segue em ${(aprendido.melhorAntes / 100).toFixed(2)} m`);
    else partes.push("empatou com o recorde deste tipo");
  }

  encaixeAndamento.textContent = partes.join(" · ");
  encaixeAndamento.classList.remove("hidden");
}

/**
 * Explica qual motor fez o encaixe e, quando os dois disputaram, quanto o
 * outro teria gasto. É o número que decide se vale trocar o modo na mão.
 */
function comoFoiEncaixado(r) {
  const metros = (cm) => `${(cm / 100).toFixed(2)} m`;
  const porMotor = r.melhorPorMotor || {};
  const modo = r.modoDeEncaixe || "auto";

  if (modo === "contorno") {
    return "Encaixe feito pelo contorno das peças, como pedido em \"Como encaixar\".";
  }
  if (modo === "retangulo") {
    return "Encaixe feito pela caixa em volta de cada peça — o vazio ao redor do desenho "
      + "não é reaproveitado.";
  }

  const NOMES = {
    contorno: "pelo contorno",
    retangulo: "pela caixa em volta",
    faixas: "dividindo o rolo em faixas",
    nfp: "por polígono de não-encaixe",
  };
  const disputaram = Object.entries(porMotor)
    .filter(([, consumo]) => consumo > 0)
    .sort((a, b) => a[1] - b[1]);

  // Tirado da receita vencedora ("contorno/dupla/...", "nfp/solta/...") em vez
  // de uma bandeira por motor: com "nfp" na disputa, uma bandeira a mais teria
  // que ser criada e mantida toda vez que um motor novo entrasse na roda.
  const motorVencedor = r.receita ? r.receita.split("/")[0] : (r.venceuContorno ? "contorno" : "retangulo");
  const oQueFoi = NOMES[motorVencedor] || NOMES.retangulo;
  if (disputaram.length < 2) return `Encaixe feito ${oQueFoi}.`;

  const conta = disputaram
    .map(([motor, consumo]) => `${NOMES[motor] || motor} ${metros(consumo)}`).join(", ");
  return `Cada jeito de encaixar deu um resultado — ${conta} — e ficou o melhor deles, ${oQueFoi}.`
    // Só faz sentido oferecer o contorno quando não foi ele que venceu.
    + (motorVencedor === "contorno" ? "" : ` Para ver as peças entrando uma no vão da outra mesmo `
      + `assim, troque "Como encaixar" para "sempre pelo contorno".`);
}

/**
 * Mede o espaço horizontal realmente tomado pelo conjunto de peças.
 *
 * `x` já é a posição da peça dentro da largura total do tecido. A diferença
 * entre a ponta da peça mais à direita e o começo da mais à esquerda é a
 * largura que o encaixe ocupou; o que fica antes e depois são as sobras reais
 * dos dois lados.
 */
function medidasLateraisDoEncaixe(r) {
  const larguraTecido = Math.max(0, Number(r.larguraTecido) || 0);
  if (!larguraTecido || !Array.isArray(r.posicoes) || r.posicoes.length === 0) {
    return {
      larguraTecido,
      inicio: 0,
      fim: 0,
      larguraOcupada: 0,
      sobraEsquerda: 0,
      sobraDireita: larguraTecido,
      sobraTotal: larguraTecido,
      sobraCentralizada: larguraTecido / 2,
    };
  }

  const inicio = Math.max(0, Math.min(...r.posicoes.map((p) => Number(p.x) || 0)));
  const fim = Math.min(larguraTecido, Math.max(...r.posicoes.map((p) =>
    (Number(p.x) || 0) + (Number(p.largura) || 0))));
  const larguraOcupada = Math.max(0, fim - inicio);
  const sobraEsquerda = Math.max(0, inicio);
  const sobraDireita = Math.max(0, larguraTecido - fim);
  const sobraTotal = Math.max(0, sobraEsquerda + sobraDireita);

  return {
    larguraTecido,
    inicio,
    fim,
    larguraOcupada,
    sobraEsquerda,
    sobraDireita,
    sobraTotal,
    sobraCentralizada: sobraTotal / 2,
  };
}

function formatarCm(valor) {
  return `${Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} cm`;
}

function renderLarguraDoEncaixe(medidas) {
  if (!encaixeLarguraResumo || !(medidas.larguraTecido > 0)) return;

  const percentual = (valor) => Math.max(0, Math.min(100,
    (valor / medidas.larguraTecido) * 100));
  const esquerdaPct = percentual(medidas.sobraEsquerda);
  const ocupadaPct = percentual(medidas.larguraOcupada);
  const direitaPct = Math.max(0, 100 - esquerdaPct - ocupadaPct);
  const descricao = `Tecido com ${formatarCm(medidas.larguraTecido)}: `
    + `${formatarCm(medidas.sobraEsquerda)} livres à esquerda, `
    + `${formatarCm(medidas.larguraOcupada)} ocupados e `
    + `${formatarCm(medidas.sobraDireita)} livres à direita.`;

  encaixeLarguraResumo.innerHTML = `
    <div class="encaixe-largura-topo">
      <div><span>Largura informada do tecido</span><strong>${formatarCm(medidas.larguraTecido)}</strong></div>
      <div><span>Largura ocupada pelo encaixe</span><strong>${formatarCm(medidas.larguraOcupada)}</strong></div>
      <div><span>Sobra lateral total</span><strong>${formatarCm(medidas.sobraTotal)}</strong></div>
    </div>
    <div class="encaixe-largura-barra" role="img" aria-label="${descricao}">
      <span class="encaixe-lateral-vazia" style="width:${esquerdaPct.toFixed(4)}%"></span>
      <span class="encaixe-largura-ocupada" style="width:${ocupadaPct.toFixed(4)}%"></span>
      <span class="encaixe-lateral-vazia" style="width:${direitaPct.toFixed(4)}%"></span>
    </div>
    <div class="encaixe-largura-lados">
      <span><i class="largura-legenda-vazia"></i>Esquerda: <strong>${formatarCm(medidas.sobraEsquerda)}</strong></span>
      <span><i class="largura-legenda-ocupada"></i>Peças: <strong>${formatarCm(medidas.larguraOcupada)}</strong></span>
      <span><i class="largura-legenda-vazia"></i>Direita: <strong>${formatarCm(medidas.sobraDireita)}</strong></span>
    </div>
    <p>Se centralizar o conjunto no tecido: <strong>${formatarCm(medidas.sobraCentralizada)} de cada lado</strong>.</p>
  `;
  encaixeLarguraResumo.classList.remove("hidden");
}

function renderResultado() {
  const r = ultimoResultado;
  const areaTecido = (r.larguraTecido * r.consumo) / 10000; // m²
  // A área das peças é sempre a da silhueta — o tecido que de fato vira peça.
  // Medir pela caixa em volta inflaria o número no modo retângulo, porque o
  // vazio ao redor da peça apareceria como aproveitado.
  const areaPecas = r.areaReal / 10000;
  const aproveitamento = areaTecido > 0 ? (areaPecas / areaTecido) * 100 : 0;
  const medidasLaterais = medidasLateraisDoEncaixe(r);

  /*
   * A faixa de status leva os cinco números que a produção olha de relance —
   * os mesmos do Lite, na mesma ordem. Os outros cinco não sumiram: foram para
   * "Como este encaixe foi feito", onde se lê quando há dúvida, e não a cada
   * encaixe.
   */
  encaixeStats.innerHTML = `
    <div class="stat"><span class="stat-valor">${pecasEncaixe.length}</span><span class="stat-label">Arquivos</span></div>
    <div class="stat"><span class="stat-valor">${r.posicoes.length}</span><span class="stat-label">Peças</span></div>
    <div class="stat"><span class="stat-valor">${r.larguraTecido} cm</span><span class="stat-label">Mídia</span></div>
    <div class="stat"><span class="stat-valor">${(r.consumo / 100).toFixed(2)} m</span><span class="stat-label">Metragem</span></div>
    <div class="stat"><span class="stat-valor">${aproveitamento.toFixed(1)}%</span><span class="stat-label">Aproveitamento</span></div>
  `;

  if (encaixeNumeros) {
    encaixeNumeros.innerHTML = `
      <div class="stat stat-largura"><span class="stat-valor">${formatarCm(medidasLaterais.larguraOcupada)}</span><span class="stat-label">Largura ocupada</span></div>
      <div class="stat stat-sobra-lateral"><span class="stat-valor">${formatarCm(medidasLaterais.sobraTotal)}</span><span class="stat-label">Sobra lateral</span></div>
      <div class="stat"><span class="stat-valor">${areaPecas.toFixed(2)} m²</span><span class="stat-label">Área das peças</span></div>
      <div class="stat"><span class="stat-valor">${(areaTecido - areaPecas).toFixed(2)} m²</span><span class="stat-label">Sobra de tecido</span></div>
      <div class="stat"><span class="stat-valor">${r.naoEncaixadas.length}</span><span class="stat-label">Fora do tecido</span></div>
    `;
  }

  /*
   * E o resultado repetido no pé da coluna, colado no botão que o produziu.
   * A metragem também está na faixa, mas lá é número no meio de outros; aqui
   * é a resposta ao clique, e é para cá que o olho volta depois de apertar.
   */
  if (encaixeResumoLateral) {
    encaixeResumoLateral.classList.remove("hidden");
    encaixeResumoLateral.innerHTML = `
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="font-mono text-2xl leading-none font-bold text-ambar">${(r.consumo / 100).toFixed(2)}</span>
        <span class="text-sm font-semibold text-ambar">m</span>
        <span class="text-[11px] text-tinta-apagada">em ${r.larguraTecido} cm</span>
      </div>
      <p class="mt-1.5 mb-0 text-[11px] text-tinta-fraca">
        ${aproveitamento.toFixed(1)}% de aproveitamento · ${r.posicoes.length} peça(s) encaixada(s)
      </p>
    `;
  }

  renderLarguraDoEncaixe(medidasLaterais);

  const folga = r.folgaReal > 0
    ? `Folga entre peças: ${(r.folgaReal * 10).toFixed(1).replace(/[.,]0$/, "")} mm` +
      (r.folgaReal > r.folgaPedida + 1e-6
        ? ` (pedi ${(r.folgaPedida * 10).toFixed(0)} mm, mas nessa medida a grade do encaixe arredonda para cima — nunca para menos). `
        : ". ")
    : "";

  encaixeResumo.textContent =
    `Na largura, as peças ocupam ${formatarCm(medidasLaterais.larguraOcupada)} ` +
    `dos ${formatarCm(medidasLaterais.larguraTecido)} do tecido; sobram ` +
    `${formatarCm(medidasLaterais.sobraEsquerda)} à esquerda e ` +
    `${formatarCm(medidasLaterais.sobraDireita)} à direita. ` + folga +
    `Aproveitamento = tecido que vira peça (${areaPecas.toFixed(2)} m²) dividido pelo tecido gasto ` +
    `(${r.larguraTecido} cm × ${(r.consumo / 100).toFixed(2)} m = ${areaTecido.toFixed(2)} m²). ` +
    comoFoiEncaixado(r);

  if (r.naoEncaixadas.length > 0) {
    const nomes = [...new Set(r.naoEncaixadas.map((i) => i.nome))].join(", ");
    encaixeSobras.textContent =
      `${r.naoEncaixadas.length} peça(s) não couberam na largura de ${r.larguraTecido} cm: ${nomes}. ` +
      `Reduza a medida dessas peças, libere o giro ou use um tecido mais largo.`;
    encaixeSobras.classList.remove("hidden");
  } else {
    encaixeSobras.classList.add("hidden");
  }

  encaixeResultado.classList.remove("hidden");
  desenharEncaixe(encaixeCanvas, r, { escala: null, comLegenda: true });

  // A barra de rolagem só aparece depois que o desenho entra na caixa, e ela
  // come alguns pixels da medida que decidiu a escala. Deitado quem manda é a
  // altura (a barra horizontal a diminui); em pé, a largura. Se sobrou rolagem
  // no sentido errado, redesenha com a medida já correta.
  const wrap = encaixeCanvas.parentElement;
  const sobrou = wrap && (wrap.scrollHeight > wrap.clientHeight + 1);
  if (sobrou) {
    desenharEncaixe(encaixeCanvas, r, { escala: null, comLegenda: true });
  }
}

// ==================== DESENHO ====================

/**
 * Desenha o rolo em pé (largura na horizontal, comprimento descendo), com a
 * arte de cada peça dentro do seu lugar — igual à prévia dos encaixadores.
 * `escala` em pixels por centímetro; quando vem nula, ajusta à largura da tela.
 */
/**
 * Desenha a arte já girada dentro da caixa (x, y, w, h) que ela ocupa no rolo.
 * Cada rotação tem sua própria origem porque o canvas gira em torno do ponto
 * transladado — errar isso joga a arte para fora do lugar.
 */
function desenharArte(ctx, p, x, y, w, h) {
  const img = p.item.img;
  const rot = p.rot || (p.girado ? 90 : 0);

  ctx.save();
  ctx.translate(x, y);
  if (rot === 90) {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0, h, w);
  } else if (rot === 180) {
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    ctx.drawImage(img, 0, 0, w, h);
  } else if (rot === 270) {
    ctx.translate(0, h);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0, h, w);
  } else {
    ctx.drawImage(img, 0, 0, w, h);
  }
  ctx.restore();
}

/**
 * O contorno de uma máscara, guardado como faixas horizontais.
 *
 * Antes, desenhar o contorno significava varrer a grade inteira da peça a cada
 * redesenho — e a grade de uma camiseta a 0,25 cm tem uns 60 mil quadradinhos,
 * cada um com cinco consultas aos vizinhos para saber se estava na borda.
 * Vezes o número de peças no rolo, vezes toda vez que a janela muda de
 * tamanho. O desenho era mais caro que muita conta do encaixe.
 *
 * Só que o contorno **não muda**: ele depende da máscara, não do tamanho da
 * tela nem da posição da peça no tecido. Então a varredura é feita uma vez e o
 * resultado fica guardado na própria máscara. E como todas as cópias de uma
 * peça compartilham a mesma máscara, um rolo com 40 camisetas varre a grade
 * uma vez, não quarenta.
 *
 * As células vizinhas na mesma linha viram uma faixa só, guardada como três
 * números (coluna inicial, linha, quantas células) numa lista plana. Isso troca
 * um `fillRect` por célula por um `fillRect` por faixa.
 *
 * O desenho sai igual: as células de uma faixa são todas da mesma altura e
 * ficam encostadas (ou sobrepostas, quando a célula é menor que um pixel e o
 * traço é forçado a 1 px), então a união delas é exatamente o retângulo da
 * faixa — a mesma área pintada.
 *
 * Quando a célula cai num número inteiro de pixels (é o caso da exportação, em
 * que ela vale 1 px) o resultado é idêntico pixel a pixel, conferido. Em
 * escala quebrada, meio por cento dos pixels muda no fio da borda: é o
 * antialiasing, que num retângulo comprido não cai igual ao de vários
 * quadradinhos emendados. Ampliado quatro vezes os dois traços são
 * indistinguíveis.
 */
function faixasDoContorno(m) {
  const { cols, rows, desenho } = m;
  const cheia = (cx, cy) =>
    cx >= 0 && cy >= 0 && cx < cols && cy < rows && desenho[cy * cols + cx];

  const faixas = [];
  for (let cy = 0; cy < rows; cy++) {
    let inicio = -1;
    for (let cx = 0; cx < cols; cx++) {
      // Na borda = célula cheia que faz divisa com célula vazia.
      const naBorda = cheia(cx, cy)
        && !(cheia(cx - 1, cy) && cheia(cx + 1, cy) && cheia(cx, cy - 1) && cheia(cx, cy + 1));
      if (naBorda) {
        if (inicio < 0) inicio = cx;
      } else if (inicio >= 0) {
        faixas.push(inicio, cy, cx - inicio);
        inicio = -1;
      }
    }
    if (inicio >= 0) faixas.push(inicio, cy, cols - inicio);
  }
  return Int32Array.from(faixas);
}

/**
 * Traça a silhueta usando a própria grade da máscara: marca as células cheias
 * que fazem divisa com célula vazia. Não é um contorno vetorial bonito, mas é
 * exatamente o contorno que o encaixe enxergou — que é o que interessa
 * conferir no desenho.
 */
function contornar(ctx, p, REGUA, px, cor) {
  const m = p.mascara;
  const lado = p.passo * px;
  if (lado < 0.4) return; // no zoom de tela viraria borrão

  const faixas = m.faixas || (m.faixas = faixasDoContorno(m));
  const x0 = REGUA + (p.x + m.offX) * px;
  const y0 = (p.y + m.offY) * px;
  // Célula menor que um pixel ainda precisa deixar traço: o mínimo é 1 px.
  const grossura = Math.max(1, lado);

  ctx.fillStyle = cor;
  for (let i = 0; i < faixas.length; i += 3) {
    const cx = faixas[i], cy = faixas[i + 1], quantas = faixas[i + 2];
    ctx.fillRect(x0 + cx * lado, y0 + cy * lado, (quantas - 1) * lado + grossura, grossura);
  }
}

/**
 * Desenha o risco.
 *
 * NA TELA o rolo fica DEITADO: a largura do tecido ocupa a altura da bancada e
 * o comprimento corre para a direita, que é como o rolo sai da máquina e como
 * a bancada tem espaço — um rolo em pé numa área larga e baixa desperdiça a
 * tela inteira e obriga a rolar para baixo por 25 metros.
 *
 * O giro é feito no CANVAS, não em CSS. Girar o elemento com `transform`
 * levaria junto o texto (que sairia de lado) e desalinharia o clique da
 * seleção. Aqui a rotação vale só para o TECIDO: as peças, os contornos e a
 * arte giram; a régua e o nome de cada peça são desenhados depois, já no
 * sentido da leitura.
 *
 * O que SAI do programa — PNG e PDF — continua em pé: lá o rolo é físico, e
 * quem imprime espera a largura na largura.
 */
function desenharEncaixe(canvas, r, { escala, comLegenda, deitado }) {
  const REGUA = 34; // faixa com as marcas de metro
  const pai = canvas.parentElement;

  // Deitado é o padrão da tela; o que tem escala fixa (PNG, PDF) sai em pé.
  const deitar = deitado === undefined ? !escala : deitado;

  // clientWidth/Height já descontam a barra de rolagem, mas incluem o padding
  // do contêiner (10px de cada lado) — sem descontar sobraria rolagem à toa.
  // Em pé, quem limita é a largura da caixa; deitado, é a altura dela.
  const disponivel = deitar
    ? (pai ? pai.clientHeight - 22 : 500)
    : (pai ? pai.clientWidth - 22 : 900);
  // O zoom multiplica a escala que caberia na tela: 100% é exatamente o que
  // cabe, e daí para cima o rolo cresce e a caixa rola.
  const cabendo = (disponivel - REGUA) / r.larguraTecido;
  const px = escala || Math.max(0.6, cabendo * zoomDoRisco);

  const larguraCanvas = deitar
    ? Math.round(r.consumo * px)
    : Math.round(r.larguraTecido * px) + REGUA;
  const alturaCanvas = deitar
    ? Math.round(r.larguraTecido * px) + REGUA
    : Math.round(r.consumo * px);
  const dpr = escala ? 1 : (window.devicePixelRatio || 1);

  // A escala do desenho NA TELA é o que traduz pixel do mouse em centímetro de
  // tecido. Só vale para o desenho da tela: o PNG e o PDF vêm com `escala`
  // própria, e guardar a deles faria a seleção mirar no lugar errado.
  if (!escala) vistaDoRisco = { px, regua: REGUA, deitado: deitar, larguraTecido: r.larguraTecido };

  canvas.width = larguraCanvas * dpr;
  canvas.height = alturaCanvas * dpr;
  canvas.style.width = `${larguraCanvas}px`;
  canvas.style.height = `${alturaCanvas}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#0d1113";
  ctx.fillRect(0, 0, larguraCanvas, alturaCanvas);

  /*
   * Daqui até o `restore` o desenho acontece no sentido DE PÉ — largura do
   * tecido no eixo X, comprimento descendo —, exatamente como sempre foi. O
   * que muda é a moldura: deitado, o desenho inteiro é girado um quarto de
   * volta no sentido anti-horário e encostado no canto.
   *
   * É por isso que nada no código das peças precisou mudar de eixo: quem gira
   * é a folha, não o que está escrito nela.
   */
  ctx.save();
  if (deitar) {
    ctx.translate(0, REGUA + r.larguraTecido * px);
    ctx.rotate(-Math.PI / 2);
  }

  // Fundo do tecido
  ctx.fillStyle = "#171d21";
  ctx.fillRect(REGUA, 0, r.larguraTecido * px, r.consumo * px);

  // Régua do rolo em pé. Deitado, ela é desenhada depois, fora do giro, para o
  // número não sair de lado.
  if (!deitar) {
    ctx.strokeStyle = "#2b3438";
    ctx.fillStyle = "#5e696d";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;
    for (let cm = 0; cm <= r.consumo; cm += 10) {
      const y = Math.round(cm * px) + 0.5;
      const metro = cm % 100 === 0;
      ctx.beginPath();
      ctx.moveTo(metro ? REGUA - 10 : REGUA - 5, y);
      ctx.lineTo(REGUA, y);
      ctx.stroke();
      if (metro && cm > 0) ctx.fillText(`${cm / 100}m`, 2, y + 6);
    }
  }

  // Peças
  r.posicoes.forEach((p) => {
    const x = REGUA + p.x * px;
    const y = p.y * px;
    const w = p.largura * px;
    const h = p.altura * px;
    const cor = CORES_PECA[p.item.indice % CORES_PECA.length];

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    desenharArte(ctx, p, x, y, w, h);
    ctx.restore();

    // No contorno, o traço segue a silhueta; no retângulo, a caixa mesmo.
    if (p.mascara) {
      contornar(ctx, p, REGUA, px, cor);
    } else {
      ctx.strokeStyle = cor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
    }

    // Seleção: âmbar por cima da peça, só na tela.
    if (!escala && selecaoNoRisco.has(p.item.indice)) {
      ctx.fillStyle = "rgba(249, 115, 22, 0.22)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#ffa04d";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    // Deitado, o nome é escrito depois — dentro do giro ele sairia de lado.
    if (comLegenda && !deitar && w > 46 && h > 18) {
      escreverNome(ctx, p, x, y, w, h);
    }
  });

  // Contorno do tecido
  ctx.strokeStyle = "#3a4448";
  ctx.lineWidth = 1;
  ctx.strokeRect(REGUA + 0.5, 0.5, r.larguraTecido * px - 1, r.consumo * px - 1);

  ctx.restore(); // fim do giro: daqui para baixo é o sentido da leitura

  if (deitar) {
    /*
     * A régua deitada, na faixa de baixo. O comprimento agora corre para a
     * direita, então a marca de metro é vertical e o número fica embaixo dela.
     */
    const baseDaRegua = alturaCanvas - REGUA;
    ctx.strokeStyle = "#2b3438";
    ctx.fillStyle = "#5e696d";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;
    for (let cm = 0; cm <= r.consumo; cm += 10) {
      const x = Math.round(cm * px) + 0.5;
      const metro = cm % 100 === 0;
      ctx.beginPath();
      ctx.moveTo(x, baseDaRegua);
      ctx.lineTo(x, baseDaRegua + (metro ? 10 : 5));
      ctx.stroke();
      if (metro && cm > 0) ctx.fillText(`${cm / 100}m`, x + 3, baseDaRegua + 20);
    }

    /*
     * E os nomes das peças, cada um no lugar que a peça ocupa depois do giro:
     * o comprimento vira X, e a largura do tecido vira Y de baixo para cima.
     */
    if (comLegenda) {
      r.posicoes.forEach((p) => {
        const x = p.y * px;
        const y = (r.larguraTecido - p.x - p.largura) * px;
        const w = p.altura * px;
        const h = p.largura * px;
        if (w > 46 && h > 18) escreverNome(ctx, p, x, y, w, h);
      });
    }
  }
}

/** O nome da peça, numa tarja escura para não sumir dentro da arte. */
function escreverNome(ctx, p, x, y, w, h) {
  const texto = `${p.item.nome}${p.item.qtd > 1 ? ` ${p.item.copia}` : ""}`;
  ctx.font = "11px system-ui, sans-serif";
  const largTexto = ctx.measureText(texto).width + 8;
  ctx.fillStyle = "rgba(8, 12, 14, 0.78)";
  ctx.fillRect(x + 3, y + 3, Math.min(largTexto, w - 6), 16);
  ctx.fillStyle = "#edf2f3";
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, Math.min(largTexto, w - 6), 16);
  ctx.clip();
  ctx.fillText(texto, x + 7, y + 12);
  ctx.restore();
}

btnBaixarEncaixe.addEventListener("click", () => {
  if (!ultimoResultado) return;
  // 4 px por cm dá um PNG legível para levar para a mesa de corte.
  const temp = document.createElement("canvas");
  desenharEncaixe(temp, ultimoResultado, { escala: 4, comLegenda: true });

  const link = document.createElement("a");
  link.download = `encaixe-${(ultimoResultado.consumo / 100).toFixed(2)}m.png`;
  link.href = temp.toDataURL("image/png");
  link.click();
});

/**
 * Monta o PDF em tamanho real. O trabalho aqui é preparar as imagens: cada
 * peça é desenhada uma vez por rotação usada, na resolução de impressão, e o
 * servidor só posiciona esses desenhos na página (ver encaixe-pdf.js).
 *
 * Desenhar a peça já girada evita depender de rotação dentro do PDF, que é
 * onde um sinal trocado passa despercebido até alguém imprimir 12 metros de
 * tecido com as peças de cabeça para baixo.
 */
const DPI_EXPORTACAO = 150; // qualidade de impressão sem estourar o tamanho do arquivo
// Teto do que sobe para o servidor. Arte fotográfica de verdade passa fácil
// disso a 150 dpi; em vez de derrubar o download, o sistema baixa a resolução
// o suficiente para caber e avisa qual foi usada.
const TETO_DE_ENVIO_MB = 300;

function desenharPecaGirada(peca, rot, larguraCm, alturaCm, dpi) {
  // Nunca aumenta a imagem: se a arte tem menos resolução que isso, ampliar só
  // deixaria o arquivo maior sem ganhar qualidade nenhuma.
  const ppcmAlvo = dpi / 2.54;
  const ppcmNativo = Math.max(peca.pxW / (rot === 90 || rot === 270 ? alturaCm : larguraCm), 1);
  const ppcm = Math.min(ppcmAlvo, ppcmNativo);

  const largura = Math.max(1, Math.round(larguraCm * ppcm));
  const altura = Math.max(1, Math.round(alturaCm * ppcm));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  desenharArte(ctx, { item: peca, rot }, 0, 0, largura, altura);
  return new Promise((pronto) => canvas.toBlob(pronto, "image/png"));
}

/** Desenha uma arte por rotação usada, na resolução pedida. */
async function prepararArtes(posicoes, dpi) {
  const artes = new Map();
  for (const p of posicoes) {
    const rot = p.rot || (p.girado ? 90 : 0);
    const chave = `${p.item.indice}-${rot}`;
    if (!artes.has(chave)) {
      artes.set(chave, await desenharPecaGirada(p.item, rot, p.largura, p.altura, dpi));
    }
  }
  return artes;
}

const somaDeBytes = (artes) => [...artes.values()].reduce((soma, b) => soma + (b ? b.size : 0), 0);

/**
 * De quantos em quantos metros o rolo é repartido em arquivos.
 *
 * Não é limite do PDF — o formato aguenta o rolo inteiro numa página só, e o
 * `/UserUnit` resolve o teto de 508 cm. É limite do RIP: rasterizar em tamanho
 * real custa memória proporcional ao tamanho da página, e um arquivo de onze
 * metros obriga a máquina a segurar tudo antes de a primeira gota cair. Em
 * trechos, o RIP processa um enquanto imprime o anterior.
 */
const METROS_POR_ARQUIVO = 10;

/**
 * Onde o rolo pode ser cortado sem partir peça.
 *
 * A tesoura procura um VÃO: uma faixa de comprimento onde nenhuma peça
 * existe. Cortar ali é o caso bom — cada arquivo sai fechado em si, e a ordem
 * de impressão é a única coisa que importa.
 *
 * Só que vão nem sempre existe. Encaixe bom é exatamente o que não deixa
 * buraco: as peças se encavalam em Y de ponta a ponta, e num rolo denso a
 * corrida contínua pode ser o rolo inteiro. Insistir em vão ali devolveria um
 * arquivo único de 40 m — justo o que este recurso existe para evitar.
 *
 * Então, quando não há vão por perto, o corte passa na peça: ela sai recortada
 * no fim de um arquivo e continua no começo do seguinte. Impressos em
 * sequência no mesmo rolo, os dois pedaços se reencontram. É por isso que a
 * tela avisa quando isso acontece: aí os arquivos têm que ir para a máquina
 * colados, sem folga entre um trabalho e o outro.
 *
 * O passeio é o de sempre em encaixe: ordena por Y e guarda até onde a peça
 * mais longa já chegou. Quando a próxima peça começa depois disso, o que está
 * no meio é vão livre.
 *
 * Só vale o vão que cai na metade de cima do trecho — de 5 a 10 m, num alvo de
 * 10. Vão cedo demais faria arquivos curtos demais, e o ganho de memória do
 * RIP vira ida e volta de arquivo.
 *
 * Somando os trechos, o rolo é exatamente o mesmo: os cortes são uma partição
 * de [0, consumo], então nenhuma peça se perde nem se repete.
 */
function planoDeCorte(posicoes, consumo, alvoCm) {
  const FOLGA = 1e-6;
  const ordenadas = [...posicoes].filter((p) => p && p.altura > 0).sort((a, b) => a.y - b.y);

  const vaos = [];
  let ateOndeVai = 0;
  for (const p of ordenadas) {
    if (p.y > ateOndeVai + FOLGA) vaos.push([ateOndeVai, p.y]);
    ateOndeVai = Math.max(ateOndeVai, p.y + p.altura);
  }
  const rolo = Math.max(consumo, ateOndeVai);
  vaos.push([ateOndeVai, rolo]); // o fim do rolo também é lugar de corte

  const partes = [];
  let inicio = 0;
  while (rolo - inicio > alvoCm + FOLGA) {
    const limite = inicio + alvoCm;
    const cedoDemais = inicio + alvoCm / 2;

    // O vão mais tardio que ainda cabe no trecho, desde que não seja curto
    // demais.
    let vao = null;
    for (const candidato of vaos) {
      if (candidato[0] <= cedoDemais + FOLGA) continue;
      if (candidato[0] > limite) break;
      vao = candidato;
    }

    const corte = vao
      ? Math.min(Math.max(limite, vao[0]), vao[1])
      : limite; // sem vão por perto: a tesoura passa na peça

    if (corte <= inicio + FOLGA) break;
    partes.push({ inicio, fim: corte, limpo: Boolean(vao) });
    inicio = corte;
  }

  partes.push({ inicio, fim: rolo, limpo: true });
  return partes;
}

/** Manda o arquivo para o disco de quem está usando. */
function baixarArquivo(blob, nome) {
  const endereco = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = endereco;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(endereco);
}

async function baixarEncaixeEmPdf() {
  const r = ultimoResultado;
  if (!r || r.posicoes.length === 0) return;

  btnEncaixePdf.disabled = true;
  const rotuloAntigo = btnEncaixePdf.textContent;
  btnEncaixePdf.textContent = "Montando PDF…";
  await new Promise((pronto) => setTimeout(pronto, 20));

  try {
    let dpi = DPI_EXPORTACAO;
    let artes = await prepararArtes(r.posicoes, dpi);
    let total = somaDeBytes(artes);
    const teto = TETO_DE_ENVIO_MB * 1024 * 1024;

    // Arte grande demais: em vez de estourar no envio, reduz a resolução na
    // medida certa para caber. Melhor um PDF em 90 dpi do que erro nenhum PDF.
    if (total > teto) {
      dpi = Math.max(50, Math.floor(dpi * Math.sqrt(teto / total)));
      btnEncaixePdf.textContent = `Montando PDF (${dpi} dpi)…`;
      await new Promise((pronto) => setTimeout(pronto, 20));
      artes = await prepararArtes(r.posicoes, dpi);
      total = somaDeBytes(artes);
    }

    // Cada arte sobe sozinha, em binário. Mandá-las dentro do JSON em base64
    // engordava tudo em um terço e derrubava o servidor com arte de verdade.
    const sessao = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    let enviados = 0;
    for (const [chave, arte] of artes) {
      if (!arte) continue;
      const endereco = `/api/encaixe/arte?sessao=${encodeURIComponent(sessao)}&chave=${encodeURIComponent(chave)}`;
      const envio = await fetch(endereco, { method: "POST", body: arte });
      if (!envio.ok) throw new Error("o servidor não aceitou uma das artes.");
      enviados++;
      btnEncaixePdf.textContent = `Enviando artes (${enviados}/${artes.size})…`;
    }

    btnEncaixePdf.textContent = "Montando PDF…";
    const posicoes = r.posicoes.map((p) => ({
      chave: `${p.item.indice}-${p.rot || (p.girado ? 90 : 0)}`,
      x: p.x, y: p.y, largura: p.largura, altura: p.altura,
    }));

    const partes = planoDeCorte(posicoes, r.consumo, METROS_POR_ARQUIVO * 100);
    const metros = (cm) => (cm / 100).toFixed(2).replace(".", ",");

    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      const ultima = i === partes.length - 1;

      const nome = partes.length === 1
        ? `encaixe-${metros(r.consumo)}m`
        : `encaixe-${i + 1}de${partes.length}-${metros(parte.inicio)}a${metros(parte.fim)}m`;

      btnEncaixePdf.textContent = partes.length === 1
        ? "Montando PDF…"
        : `Montando PDF (${i + 1}/${partes.length})…`;

      const resposta = await fetch("/api/encaixe/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessao,
          larguraTecido: r.larguraTecido,
          consumo: r.consumo,
          nome,
          imagens: [...artes.keys()].map((chave) => ({ chave })),
          posicoes,
          // Rolo curto sai inteiro, como sempre saiu.
          recorte: partes.length === 1 ? null : parte,
          // As artes só são jogadas fora depois da última parte; senão cada
          // trecho obrigaria a subir tudo de novo.
          manterSessao: !ultima,
        }),
      });

      if (!resposta.ok) {
        const erro = await resposta.json().catch(() => ({}));
        throw new Error(erro.error || "O servidor não conseguiu gerar o PDF.");
      }

      baixarArquivo(await resposta.blob(), `${nome}.pdf`);

      // Um respiro entre downloads: navegador que recebe vários seguidos do
      // mesmo clique costuma engolir os últimos sem avisar.
      if (!ultima) await new Promise((pronto) => setTimeout(pronto, 350));
    }

    if (partes.length > 1) {
      // Um corte que passou na peça muda o que a produção precisa saber: os
      // arquivos deixam de ser independentes e têm que ir colados na máquina.
      const naPeca = partes.filter((p) => !p.limpo).length;
      mostrarErroEncaixe(
        `O rolo saiu em ${partes.length} arquivos de até ${METROS_POR_ARQUIVO} m, ` +
        `para o RIP processar um trecho enquanto imprime o anterior. ` +
        `Imprima na ordem dos nomes. ` +
        (naPeca === 0
          ? `Todos os cortes caíram em vão: nenhuma peça foi partida.`
          : `${naPeca} corte(s) passaram por cima de peça — o encaixe é denso e não havia vão. ` +
            `Esses arquivos precisam entrar na máquina colados, sem folga entre um trabalho e o outro, ` +
            `senão a peça partida não fecha.`),
      );
    }

    if (dpi < DPI_EXPORTACAO) {
      mostrarErroEncaixe(`As artes são grandes: o PDF saiu em ${dpi} dpi (em vez de ${DPI_EXPORTACAO}) `
        + `para não estourar o envio. O tamanho em centímetros continua exato.`);
    }
  } catch (err) {
    mostrarErroEncaixe(`Não consegui gerar o PDF: ${err.message}`);
  } finally {
    btnEncaixePdf.disabled = false;
    btnEncaixePdf.textContent = rotuloAntigo;
  }
}

btnEncaixePdf.addEventListener("click", baixarEncaixeEmPdf);

btnImprimirEncaixe.addEventListener("click", () => {
  if (!ultimoResultado) return;
  window.print();
});

// Redesenha ao mudar o tamanho da janela para o encaixe continuar cabendo.
let redimensionarTimer = null;
window.addEventListener("resize", () => {
  if (!ultimoResultado || encaixeResultado.classList.contains("hidden")) return;
  clearTimeout(redimensionarTimer);
  redimensionarTimer = setTimeout(() => {
    desenharEncaixe(encaixeCanvas, ultimoResultado, { escala: null, comLegenda: true });
  }, 150);
});

renderPecasEncaixe();
// ==================== SELEÇÃO POR ÁREA NO RISCO ====================

/**
 * Arrastar uma caixa sobre o risco pega as peças daquela área.
 *
 * O giro é do arquivo, não da cópia: virar uma peça vira todas as cópias dela,
 * e é assim que a produção pensa — "essa manga pode deitar". Só que achar a
 * peça certa na lista da esquerda, num trabalho com dezenas de arquivos, é o
 * caminho longo. Olhando o risco dá para VER quais estão atravessadas; a
 * seleção por área é o atalho de lá para cá.
 *
 * O que a caixa seleciona são cópias posicionadas; o que ela marca são os
 * ARQUIVOS dessas cópias, porque é neles que o giro mora. Selecionar uma cópia
 * de "manga x8" marca a manga inteira.
 *
 * Mudar o giro obriga a encaixar de novo — o encaixe é consequência do giro, e
 * não dá para girar uma peça já assentada sem refazer a conta. Por isso o
 * botão diz "Aplicar e encaixar".
 */

const selecaoNoRisco = new Set();
let vistaDoRisco = null; // { px, regua, deitado, larguraTecido } do desenho na tela

/*
 * O zoom do risco. 1 é "o que cabe na altura da bancada" — o mesmo ponto de
 * partida do Lite, onde 100% é a vista inteira e não uma escala absoluta.
 *
 * Num rolo de 25 m a vista inteira deixa cada peça com poucos milímetros na
 * tela; é onde se confere o desenho como um todo. Aproximar é o que permite
 * ver se a folga entre duas peças ficou como pedido.
 */
let zoomDoRisco = 1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const ZOOM_PASSO = 1.3;

const btnZoomMenos = document.getElementById("btn-zoom-menos");
const btnZoomMais = document.getElementById("btn-zoom-mais");
const btnZoomAjustar = document.getElementById("btn-zoom-ajustar");

function mostrarZoom() {
  if (btnZoomAjustar) btnZoomAjustar.textContent = `${Math.round(zoomDoRisco * 100)}%`;
}

function mexerNoZoom(fator) {
  const antes = zoomDoRisco;
  zoomDoRisco = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomDoRisco * fator));
  if (zoomDoRisco === antes) return;
  mostrarZoom();
  redesenharRisco();
}

const selecaoBarra = document.getElementById("encaixe-selecao");
const selecaoContagem = document.getElementById("encaixe-selecao-contagem");
const selecaoGiro = document.getElementById("encaixe-selecao-giro");
const btnSelecaoAplicar = document.getElementById("btn-selecao-aplicar");
const btnSelecaoLimpar = document.getElementById("btn-selecao-limpar");

function redesenharRisco() {
  if (ultimoResultado) {
    desenharEncaixe(encaixeCanvas, ultimoResultado, { escala: null, comLegenda: true });
  }
}

function atualizarBarraDaSelecao() {
  if (!selecaoBarra) return;
  const quantas = selecaoNoRisco.size;
  selecaoBarra.classList.toggle("hidden", quantas === 0);
  if (selecaoContagem) {
    selecaoContagem.textContent = quantas === 1 ? "1 peça" : `${quantas} peças`;
  }
}

function limparSelecaoDoRisco({ redesenhar = true } = {}) {
  if (selecaoNoRisco.size === 0) return;
  selecaoNoRisco.clear();
  atualizarBarraDaSelecao();
  if (redesenhar) redesenharRisco();
}

/** As peças que a caixa (em centímetros de tecido) encosta. */
function pecasNaArea(area) {
  const escolhidas = new Set();
  for (const p of ultimoResultado.posicoes) {
    const cruza = p.x < area.x2 && p.x + p.largura > area.x1 &&
                  p.y < area.y2 && p.y + p.altura > area.y1;
    if (cruza) escolhidas.add(p.item.indice);
  }
  return escolhidas;
}

encaixeCanvas.addEventListener("pointerdown", (evento) => {
  if (evento.button !== 0 || !ultimoResultado || !vistaDoRisco) return;

  const caixaDoRisco = encaixeCanvas.getBoundingClientRect();
  const wrap = encaixeCanvas.parentElement;
  const caixaDoWrap = wrap.getBoundingClientRect();

  const partida = { x: evento.clientX, y: evento.clientY };
  let chegada = partida;

  // A marcação é um retângulo por cima, e não um redesenho do canvas: o risco
  // de um rolo grande custa caro demais para refazer a cada movimento do mouse.
  const marca = document.createElement("div");
  marca.className = "pointer-events-none absolute z-20 rounded-[3px] border-2 border-ambar bg-[var(--accent-soft)]";
  wrap.appendChild(marca);

  const desenharMarca = () => {
    marca.style.left = `${Math.min(partida.x, chegada.x) - caixaDoWrap.left + wrap.scrollLeft}px`;
    marca.style.top = `${Math.min(partida.y, chegada.y) - caixaDoWrap.top + wrap.scrollTop}px`;
    marca.style.width = `${Math.abs(chegada.x - partida.x)}px`;
    marca.style.height = `${Math.abs(chegada.y - partida.y)}px`;
  };
  desenharMarca();

  const aoMover = (e) => { chegada = { x: e.clientX, y: e.clientY }; desenharMarca(); };

  const aoSoltar = (e) => {
    window.removeEventListener("pointermove", aoMover);
    window.removeEventListener("pointerup", aoSoltar);
    marca.remove();

    /*
     * De pixel na tela para centímetro de tecido.
     *
     * Em pé: X é a largura (descontada a régua da esquerda) e Y o comprimento.
     * Deitado, os eixos trocam e a largura ainda vira ao contrário — o giro é
     * anti-horário, então o começo da largura fica embaixo.
     */
    const { px, regua, deitado, larguraTecido } = vistaDoRisco;
    const emCm = (clientX, clientY) => {
      const cx = clientX - caixaDoRisco.left;
      const cy = clientY - caixaDoRisco.top;
      return deitado
        ? { x: larguraTecido - cy / px, y: cx / px }
        : { x: (cx - regua) / px, y: cy / px };
    };

    const a = emCm(partida.x, partida.y);
    const b = emCm(e.clientX, e.clientY);
    const arrastou = Math.abs(e.clientX - partida.x) > 4 || Math.abs(e.clientY - partida.y) > 4;

    // Clique seco vira uma caixinha de meio centímetro: pega a peça debaixo do
    // cursor sem obrigar a arrastar por cima dela.
    const area = arrastou
      ? { x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x), y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y) }
      : { x1: a.x - 0.25, x2: a.x + 0.25, y1: a.y - 0.25, y2: a.y + 0.25 };

    const achadas = pecasNaArea(area);

    // Segurando Shift a seleção soma, como em qualquer editor; no clique seco,
    // Shift alterna a peça.
    if (!e.shiftKey) selecaoNoRisco.clear();

    if (!arrastou && e.shiftKey) {
      for (const indice of achadas) {
        if (selecaoNoRisco.has(indice)) selecaoNoRisco.delete(indice);
        else selecaoNoRisco.add(indice);
      }
    } else {
      for (const indice of achadas) selecaoNoRisco.add(indice);
    }

    atualizarBarraDaSelecao();
    redesenharRisco();
  };

  window.addEventListener("pointermove", aoMover);
  window.addEventListener("pointerup", aoSoltar);
  evento.preventDefault();
});

/*
 * Com o rolo deitado, o que se quer da roda do mouse é ANDAR NO ROLO, e o rolo
 * corre para o lado. Sem isto a roda só balança os poucos pixels de sobra na
 * vertical e a impressão é de que a tela travou.
 *
 * Shift continua fazendo o que o navegador faz por padrão, e o gesto de duas
 * dedos do trackpad (que já manda deltaX) passa direto.
 */
encaixeCanvas.parentElement.addEventListener("wheel", (evento) => {
  // Ctrl + roda é zoom em todo editor de desenho; aqui também.
  if (evento.ctrlKey) {
    mexerNoZoom(evento.deltaY < 0 ? ZOOM_PASSO : 1 / ZOOM_PASSO);
    evento.preventDefault();
    return;
  }

  if (!vistaDoRisco || !vistaDoRisco.deitado) return;
  if (evento.shiftKey || Math.abs(evento.deltaX) > Math.abs(evento.deltaY)) return;

  const wrap = encaixeCanvas.parentElement;
  if (wrap.scrollWidth <= wrap.clientWidth) return;

  wrap.scrollLeft += evento.deltaY;
  evento.preventDefault();
}, { passive: false });

if (btnZoomMenos) btnZoomMenos.addEventListener("click", () => mexerNoZoom(1 / ZOOM_PASSO));
if (btnZoomMais) btnZoomMais.addEventListener("click", () => mexerNoZoom(ZOOM_PASSO));
if (btnZoomAjustar) {
  btnZoomAjustar.addEventListener("click", () => {
    if (zoomDoRisco === 1) return;
    zoomDoRisco = 1;
    mostrarZoom();
    redesenharRisco();
  });
}

if (btnSelecaoLimpar) btnSelecaoLimpar.addEventListener("click", () => limparSelecaoDoRisco());

if (btnSelecaoAplicar) {
  btnSelecaoAplicar.addEventListener("click", () => {
    if (selecaoNoRisco.size === 0) return;
    const giro = selecaoGiro ? selecaoGiro.value : "180";

    for (const indice of selecaoNoRisco) {
      const peca = pecasEncaixe[indice];
      if (peca) peca.giro = giro;
    }

    limparSelecaoDoRisco({ redesenhar: false });
    renderPecasEncaixe(); // a lista da esquerda mostra o giro novo
    btnEncaixar.click();  // e o encaixe é refeito com ele
  });
}

// Trocar de tela larga a seleção junto: voltar depois com peças marcadas de um
// trabalho que já mudou seria marcação fantasma.
document.addEventListener("optimize:trocou-de-tela", () => limparSelecaoDoRisco({ redesenhar: false }));
