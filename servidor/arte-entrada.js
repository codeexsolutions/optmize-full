/**
 * ===========================================================================
 * A ARTE QUE ENTRA NO ENCAIXE — o que o navegador não lê, quem lê é aqui
 * ===========================================================================
 *
 * O Encaixe carrega toda arte por `<img>` e canvas. Isso cobre quase tudo que
 * chega da produção, e deixa dois buracos — medidos num Chrome de verdade,
 * com as mesmas quatro cores em três formas:
 *
 *   JPEG CMYK COM perfil ICC    o Chrome acerta         verde 50,159,70
 *   JPEG CMYK SEM perfil        o Chrome erra à vista   verde 72,244,25
 *   TIFF                        o Chrome nem abre       a arte não entra
 *
 * (a cor certa daquele verde, atravessando o perfil, é 50,159,70)
 *
 * Esta rota tapa os dois últimos: recebe o arquivo cru e devolve uma arte que
 * o navegador lê — sRGB, com o dpi e a transparência de pé.
 *
 * ---------------------------------------------------------------------------
 * O PRIMEIRO CASO NÃO PASSA POR AQUI
 * ---------------------------------------------------------------------------
 *
 * CMYK com perfil embutido o navegador já resolve, e bem. Mandá-lo para cá
 * custaria uma ida e volta de dezenas de megabytes para chegar na mesma cor —
 * e, pior, recomprimiria uma arte que hoje vai INTEIRA para o PDF, pelo
 * passa-direto (ver `jpegParaPdf.js`). Quem decide o que mandar é a tela, pelo
 * diagnóstico que ela já faz (`motores/corDoArquivo.js`); a rota aceita
 * qualquer arquivo e devolve intacto o que não precisa de conversão.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O SHARP, E NÃO O `cor-icc.js` QUE JÁ EXISTE
 * ---------------------------------------------------------------------------
 *
 * Porque o `cor-icc.js` recusa exatamente estes dois arquivos: ele caminha a
 * LUT do perfil EMBUTIDO (e por isso é exato quando há um) e só lê JPEG. Sem
 * perfil embutido ele não tem por onde começar, e TIFF ele não abre.
 *
 * O sharp resolve os dois, com o libvips assumindo um perfil de impressão
 * quando o arquivo não traz o dele. Medido contra a travessia do perfil de
 * verdade: o palpite cai a menos de 10 por canal, onde o navegador erra 85.
 *
 * Ficam dois conversores no projeto, e isso é dívida conhecida: nada chama o
 * `/api/cor` desde que a tela Cor saiu do programa, em 2026-09-21.
 *
 * ---------------------------------------------------------------------------
 * O DPI NÃO É DETALHE
 * ---------------------------------------------------------------------------
 *
 * A medida em centímetros da peça sai do dpi gravado no arquivo (ver
 * `medidaDoArquivo.js`). Uma conversão que perde o dpi devolve a arte com a
 * cor certa e a peça com o tamanho errado no rolo — que é o erro caro, porque
 * ninguém o vê na tela.
 */

const fs = require("node:fs");
const express = require("express");
const sharp = require("sharp");

const router = express.Router();

/**
 * O PERFIL QUE SE ASSUME QUANDO O ARQUIVO NÃO TRAZ O DELE.
 *
 * Quatro canais sem perfil não querem dizer nada sozinhos: os mesmos números
 * dão cores diferentes em cada prensa. Alguém tem que dizer "isto aqui é
 * SWOP", e o Photoshop faz o mesmo — quando abre um CMYK sem perfil, ele
 * assume o espaço de trabalho e avisa.
 *
 * É o U.S. Web Coated (SWOP) que vem no Windows, e não um arquivo que este
 * projeto carregue: perfil ICC tem licença, e o da Adobe não se redistribui.
 * Ele está em toda instalação do Windows com gerenciamento de cor.
 *
 * SEM ELE, O PROGRAMA NÃO PARA. O libvips tem um CMYK genérico embutido, que
 * erra mais — medido contra a travessia do perfil de verdade, o genérico fica
 * a 45 de distância num canal e o SWOP a 5. Os dois são melhores que o palpite
 * do navegador, que erra 85 no mesmo lugar. Por isso a falta do arquivo é uma
 * nota na resposta (`perfilAssumido`), e não um erro na cara de quem trabalha.
 */
const PERFIL_DE_IMPRESSAO = [
  "C:/Windows/System32/spool/drivers/color/RSWOP.icm",
].find((caminho) => { try { return fs.existsSync(caminho); } catch { return false; } }) || null;

/**
 * O teto do arquivo que entra.
 *
 * O mesmo do `/arte` do PDF: arte de sublimação em TIFF sem compressão passa
 * de 200 MB com facilidade, e recusar um arquivo legítimo por causa do limite
 * daria um 413 sem explicação no meio da entrada de arquivos.
 */
const TETO = "400mb";

/** Qualidade do JPEG que sai. A mesma que o conversor de cor usa desde sempre. */
const QUALIDADE = 92;

/**
 * ===========================================================================
 * O DPI PRECISA IR NO CABEÇALHO JFIF, E NÃO SÓ NO EXIF
 * ===========================================================================
 *
 * O libvips grava a resolução no EXIF, e só. O Optmize lê o cabeçalho JFIF
 * (`motores/medidaDoArquivo.js`), que é onde a arte de produção guarda o dpi —
 * e é dele que sai a medida em centímetros da peça.
 *
 * O sintoma, quando isto faltava, não parecia um problema de metadado: o TIFF
 * entrava bonito, com a cor certa, e a peça de 5,1 × 6,8 cm virava 2,5 × 3,4.
 * Metade, porque sem dpi o programa assume 300 e o arquivo era de 150.
 *
 * Escrever o segmento à mão é pouco código e nenhuma dependência nova: o APP0
 * do JFIF são dezoito bytes de estrutura fixa, logo depois do SOI.
 */
function comDpiNoJfif(jpeg, dpi) {
  if (!dpi || jpeg.length < 4 || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) return jpeg;

  const app0 = Buffer.alloc(20);
  app0.writeUInt16BE(0xFFE0, 0);      // marcador APP0
  app0.writeUInt16BE(16, 2);          // tamanho do segmento, sem o marcador
  app0.write("JFIF\0", 4, "latin1");
  app0.writeUInt16BE(0x0102, 9);      // versão 1.2
  app0.writeUInt8(1, 11);             // unidade: pontos por polegada
  app0.writeUInt16BE(Math.round(dpi), 12);
  app0.writeUInt16BE(Math.round(dpi), 14);
  app0.writeUInt8(0, 16);             // sem miniatura embutida
  app0.writeUInt8(0, 17);

  // O JFIF tem que ser o PRIMEIRO segmento depois do SOI — é isso que o
  // torna JFIF. O que o libvips escreveu (EXIF, ICC) continua atrás dele.
  return Buffer.concat([jpeg.subarray(0, 2), app0.subarray(0, 18), jpeg.subarray(2)]);
}

/**
 * O que o navegador lê sem ajuda: PNG, JPEG, GIF, WEBP, BMP e o SVG (que nem
 * chega aqui — é vetor, e tem leitor próprio). O resto vem para a conversão.
 */
function ehFormatoDoNavegador(formato) {
  return formato === "png" || formato === "jpeg" || formato === "jpg"
    || formato === "gif" || formato === "webp" || formato === "bmp";
}

/*
 * ===========================================================================
 * A CONVERSÃO DIRETA — a que o CorelDRAW faz
 * ===========================================================================
 *
 * O caminho do perfil acerta a COR e erra o PRETO. Um `K` cheio volta como
 * `40,40,38`: colorimetricamente honesto (é a cor que aquela tinta tem no
 * papel) e, na prensa, um cinza sujo onde o cliente aprovou preto.
 *
 * Quem imprime pediu o contrário, e descreveu bem: "a mesma cor, só trocando
 * para RGB, igual o Corel faz". Isso é a conta aritmética, sem perfil nenhum —
 * cada canal multiplicado pelo que o preto deixa passar:
 *
 *   R = 255 × (1 − C) × (1 − K)
 *   G = 255 × (1 − M) × (1 − K)
 *   B = 255 × (1 − Y) × (1 − K)
 *
 * Com `K` cheio, o resultado é zero. Sempre. Medido num arquivo de teste,
 * contra a travessia do perfil:
 *
 *   preto       CMYK 38,0,133,246   direta 8,9,4      perfil 40,40,38
 *   vermelho    CMYK 0,236,239,17   direta 238,18,15  perfil lavado
 *   branco      CMYK 0,0,0,0        direta 255,255,255
 *
 * A CONTRAPARTIDA, e é ela que faz disto uma escolha por peça e não o padrão:
 * como o K multiplica tudo, tom escuro DESABA para perto do preto. No mesmo
 * teste, um azul-marinho (`104,120,89,231`) virou `14,13,16` — quase preto. Em
 * logotipo e texto isso é exatamente o que se quer; em foto com sombra, é
 * perder a sombra.
 */
function cmykDireto(cmyk, largura, altura) {
  const rgb = Buffer.alloc(largura * altura * 3);
  for (let i = 0, j = 0; i < cmyk.length; i += 4, j += 3) {
    const semPreto = 255 - cmyk[i + 3];
    rgb[j] = ((255 - cmyk[i]) * semPreto) / 255;
    rgb[j + 1] = ((255 - cmyk[i + 1]) * semPreto) / 255;
    rgb[j + 2] = ((255 - cmyk[i + 2]) * semPreto) / 255;
  }
  return rgb;
}

/**
 * Converte, se precisar.
 *
 * Devolve `{ bytes, tipo, convertida, direta, espaco, perfil, perfilAssumido,
 * dpi }`. `convertida: false` devolve os MESMOS bytes que chegaram — quem já
 * está bom não é recomprimido, porque recomprimir arte de produção custa
 * qualidade e não melhora nada.
 *
 * `direta` liga a conversão do Corel, explicada logo acima. Ela é pedida pela
 * tela, peça por peça, e nunca é o padrão.
 */
async function prepararArte(entrada, { direta = false } = {}) {
  const meta = await sharp(entrada).metadata();
  const espaco = meta.space || "";
  const precisa = !ehFormatoDoNavegador(meta.format) || espaco === "cmyk";

  /*
   * A conversão direta acontece ANTES de tudo, e só faz sentido em CMYK: é o
   * `K` que ela usa. Arte que já está em RGB não tem o que converter, e volta
   * intacta — quem pediu a direta numa arte dessas não recebe estrago nenhum.
   */
  if (direta && espaco === "cmyk") {
    const { data, info } = await sharp(entrada, { limitInputPixels: false })
      .toColourspace("cmyk").raw().toBuffer({ resolveWithObject: true });
    const rgb = cmykDireto(data, info.width, info.height);
    const bytes = comDpiNoJfif(await sharp(rgb, {
      raw: { width: info.width, height: info.height, channels: 3 },
    }).withMetadata(meta.density ? { density: meta.density } : {})
      .jpeg({ quality: QUALIDADE }).toBuffer(), meta.density);
    return {
      bytes,
      tipo: "image/jpeg",
      convertida: true,
      direta: true,
      espaco,
      perfil: null,
      perfilAssumido: false,
      dpi: meta.density || null,
    };
  }

  if (!precisa) {
    return {
      bytes: entrada,
      tipo: `image/${meta.format === "jpg" ? "jpeg" : meta.format}`,
      convertida: false,
      espaco,
      perfil: null,
      perfilAssumido: false,
      dpi: meta.density || null,
    };
  }

  /*
   * O ALFA MANDA NO FORMATO DA SAÍDA.
   *
   * JPEG não guarda transparência, e o alfa é justamente o que o Encaixe usa
   * para recortar a peça do fundo (a silhueta, em `pecaNaGrade.js`). Uma arte
   * transparente que voltasse em JPEG entraria com fundo branco e a peça
   * inteira viraria um retângulo no rolo.
   *
   * Quem tem alfa volta em PNG, que é maior e exato; o resto volta em JPEG,
   * que é o que a produção manda e o que o PDF embute direto.
   */
  const comAlfa = meta.hasAlpha;

  /*
   * ===========================================================================
   * O PERFIL ASSUMIDO PRECISA DO PNG NO MEIO
   * ===========================================================================
   *
   * `withIccProfile` faz duas coisas diferentes conforme o formato da saída, e
   * isso está MEDIDO, não suposto (`bancada/conferir-arte-cmyk.cjs` guarda o
   * resultado). Com as mesmas quatro cores, contra a travessia do perfil de
   * verdade:
   *
   *   saída PNG    o perfil é tomado como o de ENTRADA   erro de 5 por canal
   *   saída JPEG   o perfil é tomado como o de SAÍDA     erro de 45 — grava
   *   saída TIFF   idem                                  CMYK de novo
   *
   * Por isso a conversão com perfil assumido passa por um PNG em memória, e o
   * JPEG sai numa segunda passada — que é sRGB para sRGB, sem cor nenhuma no
   * meio, e serve para carimbar o dpi. Custa 1,9 s numa arte de 49 MP contra
   * 0,9 s da passada única, e só acontece com arquivo sem perfil.
   *
   * `attach: false` no perfil assumido: ele diz de ONDE a cor vem, e o que sai
   * já é sRGB. Deixá-lo grudado faria o navegador atravessar a arte de novo,
   * pelo perfil errado, e desfazer a conversão na tela — o defeito exato que
   * esta rota existe para tapar.
   */
  const assumindo = espaco === "cmyk" && !meta.icc && PERFIL_DE_IMPRESSAO;
  const emSrgb = assumindo
    ? await sharp(entrada).withIccProfile(PERFIL_DE_IMPRESSAO, { attach: false })
      .toColourspace("srgb").png().toBuffer()
    : entrada;

  const cano = sharp(emSrgb).toColourspace("srgb")
    .withMetadata(meta.density ? { density: meta.density } : {});

  // O PNG guarda a resolução no `pHYs`, que o libvips escreve e o programa lê;
  // só o JPEG precisa do carimbo à mão.
  const bytes = comAlfa
    ? await cano.png().toBuffer()
    : comDpiNoJfif(await cano.jpeg({ quality: QUALIDADE }).toBuffer(), meta.density);

  return {
    bytes,
    tipo: comAlfa ? "image/png" : "image/jpeg",
    convertida: true,
    espaco,
    // O nome do perfil embutido, quando há um. Sem ele, o libvips assume um
    // perfil de impressão — e a tela precisa saber que foi palpite, porque é
    // isso que o aviso de cor diz a quem vai imprimir.
    perfil: meta.icc ? "embutido" : null,
    perfilAssumido: !meta.icc,
    dpi: meta.density || null,
  };
}

/**
 * Prepara uma arte para o Encaixe.
 *
 * O corpo é o arquivo cru. A resposta é a arte em binário — e não um JSON com
 * base64, que custaria um terço a mais em cima de um arquivo que já é grande.
 * O que o programa fez com ela vai nos cabeçalhos `X-Arte-*`.
 */
router.post("/preparar", express.raw({ limit: TETO, type: () => true }), async (req, res) => {
  if (!req.body || !req.body.length) {
    return res.status(400).json({ error: "Não veio arquivo nenhum para preparar." });
  }

  let pronta;
  try {
    pronta = await prepararArte(req.body, { direta: req.query.direta === "1" });
  } catch (erro) {
    /*
     * Aqui caem PSD, EPS, AI e o que mais o libvips não abrir — e também o
     * arquivo corrompido. A mensagem diz o nome, porque quem larga vinte artes
     * de uma vez precisa saber QUAL não entrou.
     */
    const nome = String(req.query.nome || "").trim();
    return res.status(415).json({
      error: `Não consegui abrir ${nome ? `"${nome}"` : "este arquivo"} como imagem`
        + " — o Encaixe lê JPEG, PNG, TIFF, PDF e os moldes vetoriais.",
      detalhe: erro.message,
    });
  }

  res.setHeader("Content-Type", pronta.tipo);
  res.setHeader("X-Arte-Convertida", pronta.convertida ? "1" : "0");
  res.setHeader("X-Arte-Espaco", pronta.espaco || "");
  res.setHeader("X-Arte-Perfil-Assumido", pronta.perfilAssumido ? "1" : "0");
  res.setHeader("X-Arte-Direta", pronta.direta ? "1" : "0");
  if (pronta.dpi) res.setHeader("X-Arte-Dpi", String(pronta.dpi));
  // A tela lê estes cabeçalhos; sem isto o `fetch` não os enxerga quando a
  // resposta vem de outra origem.
  res.setHeader("Access-Control-Expose-Headers",
    "X-Arte-Convertida, X-Arte-Espaco, X-Arte-Perfil-Assumido, X-Arte-Direta, X-Arte-Dpi");
  res.send(pronta.bytes);
});

module.exports = router;
module.exports.prepararArte = prepararArte;
