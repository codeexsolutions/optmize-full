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
 * quando esconde alguma coisa (ver `transparente`, em `pixelsDaArte`) e,
 * quando entra, o documento nasce 1.4 (ver `pngComAlfa`).
 */

const express = require("express");
const { permitirExportacao } = require("./uso");
const PDFDocument = require("pdfkit");
const crypto = require("crypto");
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
        // O giro da arte (0, 90, 180, 270), para quem ainda manda uma arte por
        // giro: a tela de hoje manda o giro em cada posição, e este vale só
        // para a posição que vier sem (ver "O GIRO É DA PÁGINA"). E, das que
        // são PDF, a versão: embutir um desenho vetorial obriga o documento a
        // ser pelo menos dessa versão.
        giros: new Map(),
        versoes: new Map(),
        // A arte já aberta para o PDF (cor convertida e comprimida), em disco,
        // para a próxima exportação não refazer. Ver `cacheDaArte`.
        preparadas: new Map(),
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
  // O nome fica reservado ANTES de gravar: a gravação é assíncrona, e outro
  // envio chegando no meio dela pegaria o mesmo `artes.size`.
  guardadas.artes.set(chave, arquivo);
  try {
    // Assíncrono: uma arte de 40 MB gravada de uma vez seguraria o servidor.
    await fs.promises.writeFile(arquivo, req.body);
  } catch (erro) {
    guardadas.artes.delete(chave);
    return res.status(500).json({ error: `Não deu para guardar a arte: ${erro.message}` });
  }
  guardadas.criadaEm = Date.now();
  // Reenviar a mesma chave substitui a arte: o que valia da anterior não vale.
  esquecerPreparada(guardadas, chave);
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
 * EXPORTAR DE NOVO NÃO REFAZ O QUE JÁ FOI FEITO (2026-10-27)
 * ===========================================================================
 *
 * A sessão das artes vivia só até o PDF sair: na exportação seguinte do mesmo
 * trabalho — o teste de impressão, o complemento, a bancada que mudou — todas
 * as artes subiam de novo, e o servidor as reabria do zero (ler o PNG,
 * converter a cor, comprimir). Agora a sessão fica enquanto for usada (ela some
 * `VALIDADE_MS` depois do último uso), a tela pergunta aqui o que já está
 * guardado e manda só o que mudou, e cada arte aberta para o PDF fica em disco,
 * pronta, até a arte daquela chave ser trocada.
 */
router.get("/artes-da-sessao", (req, res) => {
  limparAntigas();
  const guardadas = artesGuardadas.get(String(req.query.sessao || ""));
  if (!guardadas) return res.json({ chaves: [] });
  guardadas.criadaEm = Date.now();
  const chaves = [...guardadas.artes.entries()]
    .filter(([, arquivo]) => fs.existsSync(arquivo))
    .map(([chave]) => chave);
  res.json({ chaves });
});

function esquecerPreparada(guardadas, chave) {
  const antes = guardadas.preparadas && guardadas.preparadas.get(chave);
  if (!antes) return;
  guardadas.preparadas.delete(chave);
  for (const arquivo of antes.arquivos) fs.rm(arquivo, { force: true }, () => {});
}

/**
 * O lugar da arte já preparada de uma chave, para `abrirImagem`: `ler()`
 * devolve o que ficou da última vez (ou `null`), `gravar()` guarda o de agora.
 * Os fluxos comprimidos vão para arquivos na pasta da sessão — a memória
 * continua com uma arte por vez.
 */
function cacheDaArte(guardadas, chave) {
  return {
    ler() {
      const pronta = guardadas.preparadas.get(chave);
      if (!pronta) return null;
      try {
        return {
          ...pronta.forma,
          cor: { ...pronta.forma.cor, fluxo: fs.readFileSync(pronta.arquivos[0]) },
          alfa: pronta.forma.alfa ? { ...pronta.forma.alfa, fluxo: fs.readFileSync(pronta.arquivos[1]) } : null,
        };
      } catch {
        guardadas.preparadas.delete(chave);
        return null;
      }
    },
    gravar({ cor, alfa }) {
      const base = path.join(guardadas.pasta, `pronta-${crypto.randomBytes(6).toString("hex")}`);
      const arquivos = [`${base}.cor`];
      try {
        fs.writeFileSync(arquivos[0], cor.fluxo);
        if (alfa) {
          arquivos.push(`${base}.alfa`);
          fs.writeFileSync(arquivos[1], alfa.fluxo);
        }
      } catch {
        return; // sem cache, a próxima exportação só faz o trabalho de novo
      }
      esquecerPreparada(guardadas, chave);
      guardadas.preparadas.set(chave, {
        arquivos,
        forma: {
          cor: { largura: cor.largura, altura: cor.altura, dados: cor.dados },
          alfa: alfa ? { largura: alfa.largura, altura: alfa.altura, dados: alfa.dados } : null,
        },
      });
    },
  };
}

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
 * é `pixelsDaArte`, olhando os pixels. Declarar 1.4 e não usar máscara
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
 * Olhar os bytes sai de graça: a pergunta é respondida no mesmo laço que
 * separa a cor do alfa (`transparente`, em `pixelsDaArte`). Quando não há
 * pixel transparente nenhum, a máscara nem chega a ser comprimida — que era o
 * passo caro.
 */

/**
 * Um canal de imagem para o PDF: pixels crus, comprimidos com Flate.
 *
 * Sem `/DecodeParms`, e é esse o ponto — ver "POR QUE OS PIXELS VÃO CRUS", lá
 * em cima. Nível 1 na compressão porque este fluxo só vive até o PDF, e cada
 * nível acima custa tempo para ganhar pouco; não há perda em nível nenhum.
 *
 * A compressão é ASSÍNCRONA: roda nas threads do libuv, e não na linha
 * principal. Síncrona, ela segurava o servidor inteiro por mais de um segundo
 * a cada arte grande (medido: 1,4 s) — nem a barra de andamento respondia — e
 * a cor e o alfa de uma arte não podiam ser comprimidos ao mesmo tempo.
 */
const { promisify } = require("util");
const comprimirInteiro = promisify(zlib.deflate);
const comprimirTrecho = promisify(zlib.deflateRaw);

/*
 * ---------------------------------------------------------------------------
 * ARTE GRANDE É COMPRIMIDA EM PEDAÇOS, EM PARALELO — NUM FLUXO SÓ
 * ---------------------------------------------------------------------------
 *
 * O Flate de uma imagem é UM fluxo, e o zlib o comprime numa thread só. Em
 * arte de cores chapadas isso é rápido (medido: 71 MB em 133 ms); em arte
 * fotográfica, que comprime pouco, a mesma conta anda a uns 50 MB/s — meio
 * segundo por peça de sublimação total, com os outros núcleos parados.
 *
 * O formato permite repartir sem mudar nada do que o leitor vê: cada pedaço é
 * comprimido sozinho e termina num ponto de sincronia (`Z_SYNC_FLUSH`, um
 * bloco vazio que alinha o byte), só o último fecha o fluxo, e o conjunto
 * leva o cabeçalho do zlib na frente e a soma de conferência (adler32) dos
 * pixels inteiros no fim. É um fluxo zlib comum, como o de qualquer outro
 * PDF — a mesma técnica do `pigz` —, e quem descomprime recebe exatamente os
 * mesmos bytes (conferido em `bancada/conferir-cor-e-vetor.mjs`). Nada de
 * preditor (ver "POR QUE OS PIXELS VÃO CRUS").
 *
 * Quantos pedaços ao mesmo tempo: os núcleos da máquina menos um, até quatro
 * (o que o libuv atende de uma vez). O núcleo que sobra é da tela — num PC
 * fraco, ela continua respondendo enquanto o PDF sai.
 */
const PEDACO_DO_FLATE = 4 * 1024 * 1024;
const NUCLEOS = (typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length) || 2;
const AO_MESMO_TEMPO = Math.max(1, Math.min(4, NUCLEOS - 1));

// Uma fila só para o servidor inteiro: a cor, o alfa e a arte seguinte (ver
// `montarPdf`) disputam os mesmos núcleos.
let comprimindo = 0;
const esperando = [];
function naVez(tarefa) {
  return new Promise((pronto, falhou) => {
    const rodar = () => {
      comprimindo++;
      tarefa().then(pronto, falhou).finally(() => {
        comprimindo--;
        const proxima = esperando.shift();
        if (proxima) proxima();
      });
    };
    if (comprimindo < AO_MESMO_TEMPO) rodar();
    else esperando.push(rodar);
  });
}

/**
 * A adler32 dos pixels, em trechos, devolvendo a vez entre eles: numa arte de
 * 70 MB a conta inteira de uma vez seguraria a linha principal.
 */
async function adler32(dados) {
  const BASE = 65521;
  let a = 1;
  let b = 0;
  for (let inicio = 0; inicio < dados.length; inicio += PEDACO_DO_FLATE) {
    const fim = Math.min(inicio + PEDACO_DO_FLATE, dados.length);
    // 5552 é o maior trecho em que `b` não estoura antes do módulo (zlib).
    for (let i = inicio; i < fim;) {
      const ate = Math.min(i + 5552, fim);
      for (; i < ate; i++) { a += dados[i]; b += a; }
      a %= BASE;
      b %= BASE;
    }
    if (fim < dados.length) await new Promise(setImmediate);
  }
  return ((b << 16) | a) >>> 0;
}

async function comprimir(pixels) {
  if (pixels.length <= PEDACO_DO_FLATE || AO_MESMO_TEMPO === 1) {
    return naVez(() => comprimirInteiro(pixels, { level: 1 }));
  }
  const trechos = [];
  for (let i = 0; i < pixels.length; i += PEDACO_DO_FLATE) {
    trechos.push(pixels.subarray(i, Math.min(i + PEDACO_DO_FLATE, pixels.length)));
  }
  const [comprimidos, soma] = await Promise.all([
    Promise.all(trechos.map((trecho, k) => naVez(() => comprimirTrecho(trecho, {
      level: 1,
      finishFlush: k < trechos.length - 1 ? zlib.constants.Z_SYNC_FLUSH : zlib.constants.Z_FINISH,
    })))),
    adler32(pixels),
  ]);
  const rabo = Buffer.alloc(4);
  rabo.writeUInt32BE(soma);
  // 78 01: o cabeçalho que o zlib escreve no nível 1 (sem dicionário).
  return Buffer.concat([Buffer.from([0x78, 0x01]), ...comprimidos, rabo]);
}

async function canalCru(pixels, largura, altura, cores) {
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
    fluxo: await comprimir(pixels),
  };
}

/**
 * Os pixels da arte em sRGB (ou em cinza), com a cor e o alfa saindo da MESMA
 * leitura do arquivo.
 *
 * Eram duas: uma para a cor (sem o alfa) e outra só para o alfa — e ler um PNG
 * grande, desfazer a compressão e os filtros dele, é a parte cara de abrir a
 * arte. Agora o arquivo é lido uma vez, já convertido pelo perfil dele, e os
 * canais são separados aqui.
 *
 * SÓ ONDE OS NÚMEROS SAEM OS MESMOS, byte a byte, que a leitura dupla dava —
 * conferido contra ela em `bancada/conferir-cor-e-vetor.mjs`:
 *
 *   sem alfa              é a mesma conta de sempre (tirar o alfa não fazia
 *                         nada), numa leitura só
 *   RGB de 8 bits + alfa  leitura única: igual em PNG com e sem perfil (P3),
 *                         paleta, WebP e com giro de EXIF
 *   cinza + alfa          LEITURA DUPLA, como antes: convertido para cinza
 *                         numa leitura só, o alfa some (a peça perderia a
 *                         transparência)
 *   16 bits + alfa        LEITURA DUPLA, como antes: o alfa sairia com 1 de
 *                         diferença em parte dos pixels, de arredondamento
 *
 * `transparente` diz se algum pixel tem alfa abaixo de 255 — se a máscara
 * esconde alguma coisa.
 */
async function pixelsDaArte(bytes, meta) {
  const cinza = meta.space === "b-w" || meta.space === "grey16";
  const abrir = () => sharp(bytes, { limitInputPixels: false }).autoOrient();
  const cru = (s) => s.raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true });

  if (!meta.hasAlpha) {
    const { data, info } = await cru(abrir().toColourspace(cinza ? "b-w" : "srgb"));
    return { cor: data, alfa: null, width: info.width, height: info.height, cores: info.channels, transparente: false };
  }

  // A leitura dupla de antes, sem mudar nada: ver a tabela acima.
  const leituraDupla = async () => {
    const [cor, alfa] = await Promise.all([
      cru(abrir().removeAlpha().toColourspace(cinza ? "b-w" : "srgb")),
      // O alfa é o último canal da entrada; o `b-w` faz a /SMask sair com um
      // canal só, como ela tem de ser.
      cru(abrir().extractChannel(meta.channels - 1).toColourspace("b-w")),
    ]);
    return {
      cor: cor.data, alfa: alfa.info.channels === 1 ? alfa.data : null,
      width: cor.info.width, height: cor.info.height, cores: cor.info.channels,
      transparente: alfa.info.channels === 1 && alfa.data.some((a) => a !== 255),
    };
  };
  if (cinza || meta.depth !== "uchar") return leituraDupla();

  const { data, info } = await cru(abrir().toColourspace("srgb"));
  const { width, height, channels } = info;
  // Formato que não chegou como RGB + alfa: a leitura única não foi conferida
  // para ele, e o alfa não pode sumir calado.
  if (channels !== 4) return leituraDupla();
  const total = width * height;
  const cor = Buffer.allocUnsafe(total * 3);
  const alfa = Buffer.allocUnsafe(total);
  let opaco = 255;
  for (let p = 0, i = 0, j = 0; p < total; p++, i += 4, j += 3) {
    cor[j] = data[i];
    cor[j + 1] = data[i + 1];
    cor[j + 2] = data[i + 2];
    const a = data[i + 3];
    alfa[p] = a;
    opaco &= a; // o E bit a bit de todos os alfas só dá 255 se todos forem 255
  }
  return { cor, alfa, width, height, cores: 3, transparente: opaco !== 255 };
}

/*
 * ===========================================================================
 * A ARTE CHEGA COMO VEIO, E É AQUI QUE ELA VIRA sRGB (2026-10-19)
 * ===========================================================================
 *
 * A tela mandava a arte já girada, desenhada num canvas — e o canvas mudava a
 * cor (converte ao decodificar, guarda a cor multiplicada pelo alfa) e perdia
 * o perfil do arquivo. Agora ela manda o arquivo intocado, e o giro não toca
 * nos pixels em lugar nenhum: a imagem entra no PDF UMA vez, de pé, e cada
 * peça a desenha com o seu giro na matriz de posição — a mesma conta que a
 * arte vetorial já usa (ver `matrizDoVetor` e "O GIRO É DA PÁGINA, NÃO DOS
 * PIXELS", mais abaixo).
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
 * Girado pelo encaixe ou não — o giro agora é da página.
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
 * Sempre de pé, como o arquivo é visto (o EXIF vale); o giro do encaixe é de
 * quem desenha (`desenharImagem`).
 */
async function abrirImagem(doc, bytes, cache) {
  // Já preparada numa exportação anterior desta sessão: só ler do disco.
  const pronta = cache && cache.ler();
  if (pronta) return imagemDoPdf(doc, pronta.cor, pronta.alfa);

  const meta = await sharp(bytes, { limitInputPixels: false }).metadata();

  if (meta.format === "jpeg" && !meta.isProgressive
    && (meta.channels === 3 || meta.channels === 1)
    && (!meta.orientation || meta.orientation === 1)
    && perfilJaESrgb(meta.icc) && jpegSequencial(bytes)) {
    return doc.openImage(bytes);
  }

  const px = await pixelsDaArte(bytes, meta);
  if (px.cores !== 1 && px.cores !== 3) {
    throw new Error(`a arte saiu com ${px.cores} canais de cor`);
  }
  // Cor e alfa comprimidos ao mesmo tempo; a máscara só se esconder alguma
  // coisa (ver "MÁSCARA QUE NÃO ESCONDE NADA").
  const [cor, alfa] = await Promise.all([
    canalCru(px.cor, px.width, px.height, px.cores),
    px.transparente ? canalCru(px.alfa, px.width, px.height, 1) : null,
  ]);
  if (cache) cache.gravar({ cor, alfa });
  return imagemDoPdf(doc, cor, alfa);
}

/** A imagem no formato que `doc.image` aceita, a partir dos canais prontos. */
function imagemDoPdf(doc, cor, alfa) {
  let nome = null;
  return {
    /*
     * O NOME SAI NO PRIMEIRO DESENHO, e não na abertura. A abertura corre
     * adiantada (a arte seguinte abre enquanto a atual escoa), e com o cache da
     * sessão umas abrem na hora e outras não: dar o nome ali fazia o mesmo
     * trabalho exportado duas vezes sair com os nomes trocados. O desenho é
     * sempre na mesma ordem, peça por peça.
     */
    get label() {
      if (!nome) nome = `I${++doc._imageCount}`;
      return nome;
    },
    width: cor.largura,
    height: cor.altura,
    obj: null,
    embed(documento) {
      if (this.obj) return;
      // CÓPIAS dos dicionários: o pdfkit escreve neles (o /Length no `end`, a
      // /SMask logo abaixo), e o original é o que fica no cache da sessão para
      // a próxima exportação — ele não pode levar a máscara deste documento.
      this.obj = documento.ref({ ...cor.dados });
      if (alfa) {
        const mascara = documento.ref({ ...alfa.dados });
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

/*
 * ===========================================================================
 * O GIRO É DA PÁGINA, NÃO DOS PIXELS (2026-10-21)
 * ===========================================================================
 *
 * A imagem do PDF é desenhada num quadrado de 1 x 1, e a matriz de posição é
 * quem a estica até a caixa da peça. Girar é só outra matriz: a MESMA conta
 * que já põe a arte vetorial no lugar (`matrizDoVetor`, conferida desenhando o
 * PDF em `bancada/conferir-cor-e-vetor.mjs`), com uma "página" de 1 x 1.
 *
 * O giro saiu dos pixels porque ali ele custava caro e não comprava nada:
 *
 *   - cada giro de uma arte era uma imagem À PARTE no arquivo. Com giro livre,
 *     a mesma arte em 0° e 90° era lida, comprimida e embutida duas vezes —
 *     o dobro do tempo e do tamanho;
 *   - o JPEG girado perdia o caminho direto: era aberto e regravado em pixels
 *     crus, de 5 MB para uns 70 MB cada;
 *   - girar 90° em pixels não muda número nenhum, e girar na matriz também
 *     não: é a mesma imagem, posta de lado.
 *
 * Medido (2026-10-21), com a leitura única, o Flate em pedaços e a arte
 * seguinte preparada junto — tudo isto é deste dia —, presos a 2 núcleos
 * como num PC fraco:
 *
 *   12 artes de DTF, dois giros cada     16,6 s → 3,8 s    PDF 122 → 59 MB
 *   14 artes fotográficas, dois giros    38,4 s → 10,9 s   PDF 1010 → 383 MB
 *                                        (memória 1189 → 455 MB)
 *
 * E os pixels são os mesmos: a imagem embutida é byte a byte a do arquivo de
 * pé, e o PDF de antes e o de agora, desenhados no Ghostscript e no pdf.js,
 * põem cada peça no mesmo lugar, no mesmo giro.
 */
const QUADRADO_DA_IMAGEM = { rotacao: 0, largura: 1, altura: 1 };

function desenharImagem(doc, imagem, giro, x, y, w, h) {
  if (!imagem.obj) imagem.embed(doc);
  doc.page.xobjects[imagem.label] = imagem.obj;
  doc.save();
  doc.transform(...matrizDoVetor(QUADRADO_DA_IMAGEM, giro, x, y, w, h));
  doc.addContent(`/${imagem.label} Do`);
  doc.restore();
}

/** Abre a arte do jeito que o formato dela pede, sempre de pé. */
async function abrirArte(doc, bytes, cache) {
  if (ehPdf(bytes)) return abrirVetor(doc, bytes);
  return abrirImagem(doc, bytes, cache);
}

/** O giro de uma posição: 0, 90, 180 ou 270, ou `null` quando não veio. */
function giroDaPosicao(pos) {
  if (!pos || pos.giro === undefined || pos.giro === null) return null;
  const giro = Number(pos.giro);
  return [0, 90, 180, 270].includes(giro) ? giro : null;
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
  giros, giroDe, versaoMinima, aoAndar, cacheDe,
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
   *
   * O giro de cada peça vem na própria posição (`giro`), e a arte é uma por
   * peça. Quem chama do jeito antigo — uma chave por giro, com o giro no mapa
   * da arte — continua certo: a posição sem `giro` usa o da arte.
   */
  const buscar = lerArte || ((chave) => (buffers ? buffers.get(chave) : null));
  const giroDaArte = giroDe || ((chave) => (giros ? giros.get(chave) || 0 : 0));
  const giroDaPeca = (pos) => {
    const proprio = giroDaPosicao(pos);
    return proprio === null ? giroDaArte(pos.chave) : proprio;
  };

  /*
   * A PRÓXIMA ARTE É PREPARADA ENQUANTO A ATUAL ESCOA.
   *
   * Abrir uma arte (ler o arquivo, converter a cor, comprimir) é trabalho das
   * threads do sharp e do zlib; escoar é a linha principal esperando o disco.
   * Um depois do outro, as duas esperas se somavam. Agora, quando uma arte é
   * pedida, a seguinte da fila já começa a ser aberta — UMA só à frente, para
   * o pico de memória continuar sendo o de duas artes, e não o do trabalho.
   * O mapa guarda a PROMESSA, então quem chega depois espera a mesma abertura
   * em vez de começar outra.
   */
  const ordem = [];
  const naOrdem = new Map();
  paginas.forEach((pagina) => pagina.posicoes.forEach((pos) => {
    if (!naOrdem.has(pos.chave)) { naOrdem.set(pos.chave, ordem.length); ordem.push(pos.chave); }
  }));
  const desenhos = new Map();
  const abrir = (chave) => {
    if (!desenhos.has(chave)) {
      const abertura = (async () => {
        try {
          const bytes = buscar(chave);
          // Ver "O PNG NÃO PASSA PELO LEITOR DO PDFKIT", lá em cima.
          if (!bytes) throw new Error("Arte ausente. Envie as peças novamente.");
          return await abrirArte(doc, bytes, cacheDe ? cacheDe(chave) : null);
        } catch (err) {
          // Arte que não abre derruba o PDF: melhor nenhum arquivo que um rolo
          // impresso com peça faltando.
          throw new Error(`Não consegui abrir a arte ${chave}: ${err.message}`);
        }
      })();
      // A abertura adiantada (a da arte seguinte) pode falhar sem ninguém
      // esperando por ela ainda; sem isto a falha viraria rejeição não tratada
      // e derrubaria o servidor. Quem a esperar depois recebe o erro igual.
      abertura.catch(() => {});
      desenhos.set(chave, abertura);
    }
    return desenhos.get(chave);
  };
  const desenhoDe = (chave) => {
    const seguinte = ordem[naOrdem.get(chave) + 1];
    if (seguinte !== undefined) abrir(seguinte);
    return abrir(chave);
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
          const w = pos.largura * PT_POR_CM;
          const h = pos.altura * PT_POR_CM;
          if (desenho.vetor) desenharVetor(doc, desenho, giroDaPeca(pos), x, y, w, h);
          else desenharImagem(doc, desenho, giroDaPeca(pos), x, y, w, h);
          desenhadas++;
          if (aoAndar) aoAndar(desenhadas, posicoes.length);
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

/*
 * O ANDAMENTO DE CADA PDF, para a tela mostrar o número de verdade.
 *
 * A montagem é a espera mais longa do Exportar, e do lado da tela ela era um
 * `fetch` parado: nada chega até o arquivo inteiro estar pronto. Quem pede o
 * PDF manda um `pedido` (um id qualquer) e pergunta por ele em
 * `/pdf-andamento` enquanto espera — quantas peças já entraram no arquivo, de
 * quantas. Vive só enquanto o pedido está em curso.
 */
const andamentos = new Map();

router.get("/pdf-andamento", (req, res) => {
  res.json(andamentos.get(String(req.query.pedido || "")) || {});
});

router.post("/pdf", async (req, res) => {
  limparAntigas();
  const pedido = String(req.body && req.body.pedido || "");
  const andar = (estado) => { if (pedido) andamentos.set(pedido, estado); };
  const { larguraTecido, consumo, imagens, posicoes, nome } = req.body || {};

  if (!(larguraTecido > 0) || !(consumo > 0) || !Array.isArray(posicoes) || posicoes.length === 0) {
    return res.status(400).json({ error: "Encaixe inválido para gerar o PDF." });
  }

  // A sigla do pedido só passa bem formada (ver `marcaLimpa`); a que não
  // presta vira peça sem marca.
  posicoes.forEach((pos) => {
    if (pos && pos.marca) pos.marca = marcaLimpa(pos.marca, larguraTecido, consumo);
    // Giro fora de 0/90/180/270 não passa: a posição fica com o giro da arte.
    if (pos && pos.giro !== undefined && giroDaPosicao(pos) === null) delete pos.giro;
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
    andar({ fase: "montando", feitas: 0, total: posicoes.length });
    await montarPdf({
      larguraTecido, consumo, posicoes, lerArte, podeTerTransparencia, giroDe, versaoMinima,
      aoAndar: (feitas, total) => andar({ fase: "montando", feitas, total }),
      cacheDe: guardadas ? (chave) => cacheDaArte(guardadas, chave) : null,
    }, destino);
    await concluido;
    andar({ fase: "conferindo" });
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
    andamentos.delete(pedido);
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
module.exports.comprimir = comprimir;
