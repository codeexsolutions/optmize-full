#!/usr/bin/env node
/**
 * ===========================================================================
 * A ARTE QUE O NAVEGADOR NÃO LÊ — CMYK sem perfil, e o TIFF
 * ===========================================================================
 *
 * O Encaixe carrega toda arte por `<img>` e canvas, e isso deixa dois buracos
 * que esta conferência guarda. Os dois foram MEDIDOS num Chrome de verdade
 * antes de a rota existir, com as mesmas quatro cores em três formas:
 *
 *   JPEG CMYK COM perfil ICC    o Chrome acerta       verde 50,159,70
 *   JPEG CMYK SEM perfil        o Chrome erra à vista verde 72,244,25
 *   TIFF                        o Chrome nem abre     —
 *
 * (a cor certa daquele verde, pela travessia do perfil, é 50,159,70)
 *
 * O primeiro caso não passa por aqui: já funciona, e mandá-lo ao servidor
 * custaria uma ida e volta para chegar no mesmo lugar. Os outros dois são a
 * razão de `servidor/arte-entrada.js` existir.
 *
 * ---------------------------------------------------------------------------
 * COMO A COR É CONFERIDA, SEM INVENTAR GABARITO
 * ---------------------------------------------------------------------------
 *
 * A referência não é um número escrito à mão: é a MESMA arte convertida pelo
 * caminho que ninguém discute — o arquivo com o perfil embutido, atravessado
 * pelo perfil. O arquivo sem perfil tem que cair perto dela.
 *
 * Isso é o que importa de verdade: sem perfil, o programa ASSUME um perfil de
 * impressão, e a pergunta é se esse palpite chega perto da cor que o perfil de
 * verdade daria. A tolerância é por canal e vale para os dois sentidos — não é
 * "parecido", é "a menos de 25 de distância em cada canal", quando o erro do
 * navegador no mesmo verde é de 85.
 *
 * O DPI TEM QUE SOBREVIVER, e não é detalhe: a medida em centímetros da peça
 * sai do dpi gravado no arquivo (ver `medidaDoArquivo.js`). Uma conversão que
 * perde o dpi entrega a peça com o tamanho errado no rolo — o desenho certo,
 * a arte com a cor certa, e 5 metros de tecido a mais.
 */

const assert = require("node:assert/strict");
const express = require("express");
const sharp = require("sharp");

const { carregarDosMotores } = require("./motores");

const PERFIL_DE_IMPRESSAO = "C:/Windows/System32/spool/drivers/color/RSWOP.icm";

/** Preenchidos em `principal`, a partir dos motores de `src/`. */
let pixelsPorCmDoArquivo;
let jpegSeguroParaPdf;

/** As quatro faixas de cor da arte de teste, em sRGB. */
const CORES = [[230, 30, 40], [20, 160, 70], [30, 60, 200], [245, 150, 20]];
const LARGURA = 400;
const ALTURA = 100;
const DPI = 150;

/** A arte de teste em sRGB: quatro faixas verticais de cor conhecida. */
async function arteSrgb() {
  const cru = Buffer.alloc(LARGURA * ALTURA * 3);
  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      const cor = CORES[Math.floor(x / (LARGURA / CORES.length))];
      const i = (y * LARGURA + x) * 3;
      cru[i] = cor[0]; cru[i + 1] = cor[1]; cru[i + 2] = cor[2];
    }
  }
  return sharp(cru, { raw: { width: LARGURA, height: ALTURA, channels: 3 } })
    .withMetadata({ density: DPI }).jpeg({ quality: 95 }).toBuffer();
}

/** As quatro cores lidas do meio de cada faixa. */
async function coresDe(bytes) {
  const { data, info } = await sharp(bytes).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const faixa = info.width / CORES.length;
  return CORES.map((_, k) => {
    const x = Math.floor(faixa * k + faixa / 2);
    const i = ((Math.floor(info.height / 2) * info.width) + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  });
}

/** Cada canal de cada cor a menos de `tolerancia` do esperado. */
function pertoDe(reais, esperadas, tolerancia, oque) {
  reais.forEach((cor, k) => {
    cor.forEach((canal, c) => {
      const longe = Math.abs(canal - esperadas[k][c]);
      assert.ok(longe <= tolerancia,
        `${oque}: faixa ${k + 1}, canal ${c} — ${canal} contra ${esperadas[k][c]} `
        + `(${longe} de distância, o teto é ${tolerancia})`);
    });
  });
}

/**
 * Tira o perfil ICC de um JPEG SEM TOCAR NOS PIXELS.
 *
 * É assim que o arquivo do problema nasce, e tinha que ser: regravar pelo
 * sharp para "tirar o perfil" não serve de teste — ele converte os pixels de
 * volta pelo perfil padrão no caminho, e a rota acertaria a cor por
 * construção, medindo a si mesma.
 *
 * O que a produção manda é isto aqui: os MESMOS quatro canais que o SWOP
 * gerou, num arquivo que não diz que são do SWOP. É o Photoshop salvando sem
 * "incorporar perfil de cor".
 */
function semOPerfil(jpeg) {
  const pedacos = [jpeg.subarray(0, 2)];
  let i = 2;
  while (i < jpeg.length - 1) {
    if (jpeg[i] !== 0xFF) break;
    const marca = jpeg[i + 1];
    if (marca === 0xD8 || marca === 0x01 || (marca >= 0xD0 && marca <= 0xD7)) {
      pedacos.push(jpeg.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marca === 0xD9 || marca === 0xDA) break; // começo dos dados: o resto vai inteiro
    const tamanho = (jpeg[i + 2] << 8) | jpeg[i + 3];
    const ehIcc = marca === 0xE2 && jpeg.subarray(i + 4, i + 15).toString("latin1") === "ICC_PROFILE";
    if (!ehIcc) pedacos.push(jpeg.subarray(i, i + 2 + tamanho));
    i += 2 + tamanho;
  }
  pedacos.push(jpeg.subarray(i));
  return Buffer.concat(pedacos);
}

function subir() {
  const app = express();
  app.use("/api/arte", require("../servidor/arte-entrada"));
  return new Promise((pronto) => {
    const servidor = app.listen(0, "127.0.0.1", () =>
      pronto({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
  });
}

async function principal() {
  /*
   * O leitor de dpi do PROGRAMA, empacotado a partir de `src/` — o mesmo que a
   * tela usa para descobrir o tamanho da peça.
   *
   * O `document` de mentira é o pedágio: `medidaDoArquivo.js` reexporta o
   * `PPCM_PADRAO` do `pecaNaGrade.js`, que prepara um canvas ao ser carregado.
   * Nada disso é usado aqui — o que se chama é conta pura sobre bytes —, mas o
   * módulo precisa terminar de carregar.
   */
  globalThis.document = globalThis.document
    || { createElement: () => ({ getContext: () => null }) };
  ({ pixelsPorCmDoArquivo, jpegSeguroParaPdf } = await carregarDosMotores(
    ["motores/medidaDoArquivo.js", "motores/jpegParaPdf.js"]));

  const { servidor, base } = await subir();
  try {
    await conferirTudo(base);
  } finally {
    // Sem isto, uma asserção que estoura deixa o servidor de pé e o processo
    // nunca termina — a bancada "trava" em vez de reprovar.
    servidor.close();
  }
}

async function conferirTudo(base) {
  const falhas = [];
  const conferir = async (oque, corpo) => {
    try {
      await corpo();
      console.log(`  ok   ${oque}`);
    } catch (erro) {
      falhas.push(`${oque}: ${erro.message}`);
      console.log(`  FALHOU  ${oque}`);
    }
  };

  const preparar = (bytes, nome) => fetch(`${base}/api/arte/preparar?nome=${encodeURIComponent(nome)}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: bytes,
  });

  const srgb = await arteSrgb();

  // A REFERÊNCIA: a mesma arte em CMYK, com o perfil embutido, atravessada
  // pelo perfil. É a cor certa, e não um número escolhido a dedo.
  const cmykComPerfil = await sharp(srgb).withMetadata({ icc: PERFIL_DE_IMPRESSAO, density: DPI })
    .toColourspace("cmyk").jpeg({ quality: 95 }).toBuffer();
  const referencia = await coresDe(await sharp(cmykComPerfil).toColourspace("srgb").png().toBuffer());

  // O arquivo do problema: os mesmos quatro canais, sem dizer de onde vieram.
  const cmykSemPerfil = semOPerfil(cmykComPerfil);
  const metaDoProblema = await sharp(cmykSemPerfil).metadata();
  assert.equal(metaDoProblema.icc, undefined, "o arquivo de teste tinha que estar SEM perfil");
  assert.equal(metaDoProblema.space, "cmyk", "e continuar em CMYK");

  await conferir("JPEG CMYK sem perfil volta na cor que o perfil daria", async () => {
    const resposta = await preparar(cmykSemPerfil, "arte.jpg");
    assert.equal(resposta.status, 200);
    const cores = await coresDe(Buffer.from(await resposta.arrayBuffer()));

    /*
     * DUAS MEDIDAS, e a segunda é a que tem significado.
     *
     * A primeira é um teto por canal: 30 é folgado o bastante para não
     * reprovar por causa da intenção de renderização (o perfil embutido e o
     * assumido escolhem caminhos ligeiramente diferentes no laranja saturado,
     * e a diferença medida ali é de 25), e apertado o bastante para reprovar o
     * palpite do navegador, que erra 85.
     *
     * A segunda compara com o que sai SEM assumir perfil nenhum — o CMYK
     * genérico do libvips, calculado aqui na hora. Ela é a que prova que
     * assumir o perfil de impressão vale a pena: se alguém tirar essa linha do
     * `arte-entrada.js`, o erro sobe para 100% do genérico e esta conta
     * reprova. Um teto absoluto sozinho não pegaria isso.
     */
    pertoDe(cores, referencia, 30, "CMYK sem perfil");

    const generico = await coresDe(await sharp(cmykSemPerfil).toColourspace("srgb").png().toBuffer());
    const distancia = (lista) => lista.reduce((soma, cor, k) =>
      soma + cor.reduce((s, canal, c) => s + Math.abs(canal - referencia[k][c]), 0), 0);
    const comPerfil = distancia(cores);
    const semPerfil = distancia(generico);
    assert.ok(comPerfil < semPerfil * 0.4,
      `assumir o perfil de impressão tinha que cortar o erro: ${comPerfil} contra `
      + `${semPerfil} do CMYK genérico (o teto é 40% dele)`);
  });

  await conferir("a resposta diz que converteu, de que espaço e com que perfil", async () => {
    const resposta = await preparar(cmykSemPerfil, "arte.jpg");
    assert.equal(resposta.headers.get("x-arte-convertida"), "1");
    assert.equal(resposta.headers.get("x-arte-espaco"), "cmyk");
    // Sem perfil embutido, o programa ASSUMIU um — e tem que dizer isso, porque
    // é o que o aviso da tela mostra para quem vai imprimir.
    assert.equal(resposta.headers.get("x-arte-perfil-assumido"), "1");
  });

  await conferir("TIFF em CMYK entra, e vira arte que o navegador lê", async () => {
    const tiff = await sharp(srgb).withMetadata({ icc: PERFIL_DE_IMPRESSAO, density: DPI })
      .toColourspace("cmyk").tiff().toBuffer();
    const resposta = await preparar(tiff, "arte.tif");
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get("content-type"), "image/jpeg");
    const bytes = Buffer.from(await resposta.arrayBuffer());
    pertoDe(await coresDe(bytes), referencia, 25, "TIFF CMYK");
  });

  await conferir("o dpi sobrevive, e no lugar em que o programa o lê", async () => {
    const tiff = await sharp(srgb).withMetadata({ density: DPI })
      .toColourspace("cmyk").tiff().toBuffer();
    const resposta = await preparar(tiff, "arte.tif");
    const bytes = Buffer.from(await resposta.arrayBuffer());
    assert.equal(resposta.headers.get("x-arte-dpi"), String(DPI));

    /*
     * QUEM PERGUNTA AQUI É O PROGRAMA, e não o sharp — e a diferença já custou
     * uma volta. O sharp lia 150 na arte convertida e dava tudo por certo; a
     * tela continuava entrando com a peça pela METADE do tamanho, porque o
     * libvips grava o dpi no EXIF e `medidaDoArquivo.js` lê o cabeçalho JFIF,
     * que é onde a arte de produção o guarda.
     *
     * Perguntar ao leitor de verdade é o que torna esta linha um teste.
     */
    const ppcm = pixelsPorCmDoArquivo(new Uint8Array(bytes));
    assert.ok(ppcm, "a arte convertida voltou sem dpi nenhum que o programa leia");
    assert.ok(Math.abs(ppcm - DPI / 2.54) < 0.01,
      `sem o dpi certo a peça entra com o tamanho errado no rolo: ${ppcm} px/cm `
      + `contra ${DPI / 2.54}`);
  });

  await conferir("TIFF com transparência volta em PNG, com o alfa vivo", async () => {
    // `tiff()` sem opções grava SEM alfa nesta versão do libvips — o fixture
    // precisa do LZW para o arquivo de teste ter mesmo transparência.
    const cru = Buffer.alloc(40 * 40 * 4);
    for (let i = 0; i < 40 * 40; i++) {
      cru[i * 4] = 200; cru[i * 4 + 1] = 40; cru[i * 4 + 2] = 30; cru[i * 4 + 3] = 0;
    }
    const comAlfa = await sharp(cru, { raw: { width: 40, height: 40, channels: 4 } })
      .tiff({ compression: "lzw" }).toBuffer();
    assert.equal((await sharp(comAlfa).metadata()).hasAlpha, true,
      "o arquivo de teste tinha que ter transparência");
    const resposta = await preparar(comAlfa, "arte.tif");
    assert.equal(resposta.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await resposta.arrayBuffer());
    const { data, info } = await sharp(bytes).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    assert.equal(data[3], 0, "o alfa é o que o Encaixe usa para recortar a peça do fundo");
  });

  /*
   * O PONTO CEGO DESTA CONFERÊNCIA, FECHADO.
   *
   * As cores acima são lidas com `raw`, que IGNORA o perfil do arquivo. Se a
   * rota devolvesse pixels em sRGB com o perfil CMYK de entrada grudado, tudo
   * ali passaria — e o navegador, que não ignora, atravessaria a arte pelo
   * perfil errado e desfaria a conversão inteira na tela.
   */
  await conferir("a arte que volta não leva um perfil CMYK grudado", async () => {
    const tiff = await sharp(srgb).withMetadata({ icc: PERFIL_DE_IMPRESSAO, density: DPI })
      .toColourspace("cmyk").tiff().toBuffer();
    for (const [oque, arquivo] of [["TIFF CMYK", tiff], ["JPEG sem perfil", cmykSemPerfil]]) {
      const bytes = Buffer.from(await (await preparar(arquivo, "arte")).arrayBuffer());
      const meta = await sharp(bytes).metadata();
      assert.notEqual(meta.space, "cmyk", `${oque}: voltou em CMYK`);
      if (meta.icc) {
        const espacoDoPerfil = meta.icc.toString("latin1", 16, 20).trim();
        assert.notEqual(espacoDoPerfil, "CMYK", `${oque}: veio com perfil CMYK grudado`);
      }
    }
  });

  await conferir("a arte convertida passa direto para o PDF, sem redesenho", async () => {
    /*
     * O QUE ESTA LINHA GANHA, além da cor.
     *
     * `jpegSeguroParaPdf` reprova JPEG de quatro componentes — então, antes
     * desta rota, uma arte CMYK ia para o PDF REDESENHADA a partir do canvas,
     * com a cor errada do navegador assada no arquivo de impressão. Convertida,
     * ela volta a ser um JPEG de três componentes e vai inteira, como chegou.
     *
     * Vale guardar porque é frágil de um jeito silencioso: bastaria a conversão
     * deixar uma orientação EXIF diferente de 1 para o passa-direto cair de
     * novo, sem erro nenhum na tela — só um PDF maior e uma volta pelo canvas.
     */
    const bytes = Buffer.from(await (await preparar(cmykSemPerfil, "arte.jpg")).arrayBuffer());
    assert.ok(jpegSeguroParaPdf(new Uint8Array(bytes)),
      "a arte convertida tinha que poder ir inteira para o PDF");
  });

  await conferir("arte que já está boa volta byte por byte, sem recomprimir", async () => {
    const resposta = await preparar(srgb, "arte.jpg");
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get("x-arte-convertida"), "0");
    assert.deepEqual(Buffer.from(await resposta.arrayBuffer()), srgb);
  });

  /*
   * ===========================================================================
   * A CONVERSÃO DIRETA — a que o CorelDRAW faz
   * ===========================================================================
   *
   * O caminho do perfil acerta a COR, e erra o PRETO: `K` cheio volta como
   * `40,40,38`, um cinza sujo que a prensa imprime sujo. Quem imprime pediu o
   * contrário — "a mesma cor, só trocando para RGB", que é a conta aritmética
   * do Corel: cada canal multiplicado pelo que o preto deixa passar.
   *
   *   R = 255 × (1 − C) × (1 − K)
   *
   * Com `K` cheio o resultado é zero, sempre. É isso que se confere aqui: o
   * preto sai PRETO, o branco não se mexe e uma cor saturada continua a mesma
   * cor. A contrapartida está medida no cabeçalho de `servidor/arte-entrada.js`
   * — tom escuro desaba para perto do preto, e é por isso que a conversão
   * direta é escolha por peça, e não o padrão.
   */
  await conferir("a conversão direta tira o preto preto, como o Corel", async () => {
    const faixas = [[0, 0, 0], [230, 30, 40], [255, 255, 255]];
    const largura = 90;
    const altura = 40;
    const cru = Buffer.alloc(largura * altura * 3);
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const cor = faixas[Math.floor(x / 30)];
        const i = (y * largura + x) * 3;
        cru[i] = cor[0]; cru[i + 1] = cor[1]; cru[i + 2] = cor[2];
      }
    }
    const emCmyk = await sharp(cru, { raw: { width: largura, height: altura, channels: 3 } })
      .withMetadata({ icc: PERFIL_DE_IMPRESSAO }).toColourspace("cmyk").jpeg({ quality: 100 }).toBuffer();

    const resposta = await fetch(`${base}/api/arte/preparar?direta=1&nome=arte.jpg`, {
      method: "POST", headers: { "content-type": "application/octet-stream" }, body: emCmyk,
    });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get("x-arte-direta"), "1");

    const bytes = Buffer.from(await resposta.arrayBuffer());
    const px = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const em = (x) => {
      const i = ((Math.floor(px.info.height / 2) * px.info.width) + x) * px.info.channels;
      return [px.data[i], px.data[i + 1], px.data[i + 2]];
    };
    const preto = em(15);
    const vermelho = em(45);
    const branco = em(75);

    assert.ok(preto.every((c) => c <= 12),
      `o preto tinha que sair preto e veio ${JSON.stringify(preto)}`);
    assert.ok(branco.every((c) => c >= 250),
      `o branco não pode se mexer, e veio ${JSON.stringify(branco)}`);
    // A cor saturada continua a mesma cor: vermelho forte, verde e azul baixos.
    assert.ok(vermelho[0] > 200 && vermelho[1] < 70 && vermelho[2] < 70,
      `o vermelho tinha que continuar vermelho e veio ${JSON.stringify(vermelho)}`);
  });

  await conferir("sem a conversão direta, o preto continua vindo do perfil", async () => {
    const preta = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .withMetadata({ icc: PERFIL_DE_IMPRESSAO }).toColourspace("cmyk").jpeg({ quality: 100 }).toBuffer();
    const resposta = await preparar(preta, "arte.jpg");
    assert.equal(resposta.headers.get("x-arte-direta"), "0");
    const px = await sharp(Buffer.from(await resposta.arrayBuffer())).removeAlpha().raw().toBuffer();
    assert.ok(px[0] > 20,
      `este caminho é o do perfil: o preto vem lavado (veio ${px[0]}), e é a conversão direta que o conserta`);
  });

  await conferir("a conversão direta não mexe em arte que não é CMYK", async () => {
    const resposta = await fetch(`${base}/api/arte/preparar?direta=1&nome=arte.jpg`, {
      method: "POST", headers: { "content-type": "application/octet-stream" }, body: srgb,
    });
    assert.equal(resposta.status, 200);
    assert.deepEqual(Buffer.from(await resposta.arrayBuffer()), srgb,
      "arte que já está em RGB não tem conversão nenhuma a fazer");
  });

  await conferir("arquivo que não é imagem é recusado com motivo", async () => {
    const resposta = await preparar(Buffer.from("isto aqui é um texto, não uma arte"), "nota.txt");
    assert.equal(resposta.status, 415);
    const erro = await resposta.json();
    assert.match(erro.error, /\S/);
  });

  await conferir("corpo vazio não derruba a rota", async () => {
    const resposta = await fetch(`${base}/api/arte/preparar`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
    });
    assert.equal(resposta.status, 400);
  });

  console.log("");
  if (falhas.length) {
    console.error(`FALHOU — ${falhas.length}:`);
    falhas.forEach((f) => console.error(`  ${f}`));
    process.exitCode = 1;
    return;
  }
  console.log("OK — CMYK sem perfil e TIFF entram na cor certa, com o dpi e o alfa de pé.");
}

principal().catch((erro) => { console.error(erro); process.exitCode = 1; });
