/**
 * Confere, num navegador real, o que a tela manda ao servidor para o PDF.
 *
 * Desde 2026-10-19 a tela não gira nem redesenha a arte (ver o cabeçalho de
 * src/motores/exportarEncaixe.js): manda os bytes do original, uma arte por
 * peça, e o giro em cada posição; o PDF gira na página (conferido em
 * bancada/conferir-cor-e-vetor.mjs). O que sobra
 * de pixel aqui é a remoção de fundo, e ela tem de manter a cor do arquivo,
 * o perfil dele e a borda suave.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const sharp = require('sharp');
const { buildSync } = require('esbuild');
const puppeteer = require('puppeteer');

async function main() {
  const largura = 900, altura = 600;
  const pixels = Buffer.alloc(largura * altura * 3);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) {
    const i = (y * largura + x) * 3;
    pixels[i] = x % 2 ? 240 : 10;
    pixels[i + 1] = y % 2 ? 200 : 20;
    pixels[i + 2] = (x + y) % 251;
  }
  const png = await sharp(pixels, { raw: { width: largura, height: altura, channels: 3 } })
    .png().withMetadata({ density: 600 }).toBuffer();
  const jpg = await sharp(pixels, { raw: { width: largura, height: altura, channels: 3 } })
    .jpeg({ quality: 98, progressive: false }).toBuffer();
  const fundo = await sharp({ create: { width: 900, height: 600, channels: 4, background: 'white' } })
    .composite([{ input: Buffer.from('<svg width="400" height="200"><rect width="400" height="200" fill="#123456"/></svg>'), left: 250, top: 200 }])
    .png().toBuffer();
  // Um círculo azul com borda suavizada sobre branco, em Display P3: a borda
  // tem de sair semitransparente e azul, e o perfil tem de ir junto.
  const circulo = await sharp({ create: { width: 300, height: 300, channels: 3, background: 'white' } })
    .composite([{ input: Buffer.from('<svg width="300" height="300"><circle cx="150" cy="150" r="101.5" fill="#0000ff"/></svg>') }])
    .withIccProfile('p3').png().toBuffer();
  const pdf = Buffer.from('%PDF-1.4\n%fake\n');

  const bundle = buildSync({
    entryPoints: [path.join(__dirname, '../src/motores/exportarEncaixe.js')],
    bundle: true, write: false, format: 'iife', globalName: 'arteQualidade',
    platform: 'browser', define: { 'import.meta.env.BASE_URL': '"/"' },
    resolveExtensions: ['.mjs', '.js', '.ts', '.tsx', '.json'], logLevel: 'silent',
  }).outputFiles[0].text;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle });
    const resultado = await page.evaluate(async ({ png, jpg, fundo, circulo, pdf }) => {
      const blob = (base64, tipo) => new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: tipo });
      const base64 = async b => {
        const bytes = new Uint8Array(await b.arrayBuffer());
        let s = ''; for (const byte of bytes) s += String.fromCharCode(byte);
        return btoa(s);
      };
      const original = blob(png, 'image/png');
      // O cálculo só tem uma prévia de 90 x 60 pixels, dez vezes menor.
      const previa = await createImageBitmap(original, { resizeWidth: 90, resizeHeight: 60 });
      const peca = { nome: 'Linhas finas', arquivoOriginal: original, img: previa, pxW: 90, pxH: 60 };

      const direta = await arteQualidade.arteDaPeca(peca);
      const jpegDireto = await arteQualidade.arteDaPeca({ ...peca, arquivoOriginal: blob(jpg, 'image/jpeg') });
      const vetor = await arteQualidade.arteDaPeca({ ...peca, pdfOriginal: blob(pdf, 'application/pdf') });
      const desenhada = await arteQualidade.arteDesenhadaDaPeca(peca);

      // A peça girada ANTES do encaixe (`rotacaoBase`) vai com o giro total NA
      // POSIÇÃO, e a arte é uma por peça — é pela chave da peça que o PDF a
      // procura. A arte em si vai sem giro nenhum.
      const comBase = [];
      const combinacoes = [[90, 0], [90, 90], [270, 180], [180, 180], [0, 270]];
      const posicoesComBase = combinacoes.map(([base, rot], indice) => ({
        item: { ...peca, indice, rotacaoBase: base }, rot,
      }));
      const artesComBase = await arteQualidade.prepararArtes(posicoesComBase);
      for (let indice = 0; indice < combinacoes.length; indice++) {
        const [base, rot] = combinacoes[indice];
        const posicao = posicoesComBase[indice];
        const arte = artesComBase.get(arteQualidade.chaveDaArte(posicao.item));
        comBase.push({ base, rot, giro: arteQualidade.giroDaPosicao(posicao), bytes: arte ? await base64(arte.arte) : null });
      }
      // A mesma peça em giros diferentes, em cópias diferentes: UMA arte.
      const umaPorPeca = (await arteQualidade.prepararArtes([0, 90, 180, 270].map((rot, k) => ({
        item: { ...peca, indice: 9, copia: k + 1 }, rot,
      })))).size;

      const recortada = await arteQualidade.arteDaPeca({ ...peca,
        arquivoOriginal: blob(fundo, 'image/png'), fundoNaExportacao: 'auto' });
      const redonda = await arteQualidade.arteDaPeca({ ...peca,
        arquivoOriginal: blob(circulo, 'image/png'), fundoNaExportacao: 'auto' });
      /*
       * O ARQUIVO QUE MUDOU NO DISCO DEPOIS DE ENTRAR NA LISTA.
       *
       * O programa guarda a REFERÊNCIA da arte, não os bytes, e só lê o
       * original na hora de montar o PDF. Se alguém salvou a arte de novo por
       * cima nesse meio-tempo, essa leitura falha — e o navegador responde com
       * "The requested file could not be read, typically due to permission
       * problems...", que não diz qual arte nem o que fazer.
       *
       * Aqui a leitura é sabotada do mesmo jeito, para conferir que o recado
       * que chega à pessoa diz as duas coisas.
       */
      const sumida = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
      const falhar = () => Promise.reject(
        new DOMException('The requested file could not be read, typically due to permission '
          + 'problems that have occurred after a reference to a file was acquired.', 'NotReadableError'));
      sumida.arrayBuffer = falhar;
      sumida.slice = () => ({ arrayBuffer: falhar });
      let recado = '';
      try {
        await arteQualidade.arteDaPeca({ ...peca, nome: 'capa frente.jpg', arquivoOriginal: sumida });
      } catch (erro) { recado = erro.message; }

      const previaValida = previa.width;
      previa.close();
      return {
        direta: await base64(direta.arte), diretaVetor: direta.vetor,
        jpegDireto: await base64(jpegDireto.arte),
        vetor: { vetor: vetor.vetor, bytes: await base64(vetor.arte) },
        desenhada: await base64(desenhada), comBase, umaPorPeca,
        recortada: await base64(recortada.arte), redonda: await base64(redonda.arte),
        previaValida, recado,
      };
    }, {
      png: png.toString('base64'), jpg: jpg.toString('base64'), fundo: fundo.toString('base64'),
      circulo: circulo.toString('base64'), pdf: pdf.toString('base64'),
    });

    assert.deepEqual(Buffer.from(resultado.direta, 'base64'), png, 'PNG vai com todos os bytes');
    assert.equal(resultado.diretaVetor, false);
    assert.deepEqual(Buffer.from(resultado.jpegDireto, 'base64'), jpg, 'JPEG vai sem recompressão');
    assert.equal(resultado.vetor.vetor, true, 'PDF de arte vai como vetor');
    assert.deepEqual(Buffer.from(resultado.vetor.bytes, 'base64'), pdf, 'o PDF vai como chegou');
    assert.equal(resultado.previaValida, 90, 'exportação não fecha a imagem usada pelo cálculo');
    assert.match(resultado.recado, /capa frente\.jpg/,
      `o recado tem que dizer QUAL arte não pôde ser lida (veio "${resultado.recado}")`);
    assert.match(resultado.recado, /arrast/i,
      `o recado tem que dizer o que fazer (veio "${resultado.recado}")`);

    const desenhada = await sharp(Buffer.from(resultado.desenhada, 'base64')).removeAlpha().raw().toBuffer();
    assert.deepEqual(desenhada, pixels, 'a arte desenhada (reserva) não perde pixel nenhum');

    for (const { base, rot, giro, bytes } of resultado.comBase) {
      assert.ok(bytes, `a arte da peça girada ${base}° (encaixe ${rot}°) está na chave da peça`);
      assert.equal(giro, (base + rot) % 360, `giro base ${base}° + encaixe ${rot}° vai como o total`);
      assert.deepEqual(Buffer.from(bytes, 'base64'), png, 'a arte vai sem giro: quem gira é a página do PDF');
    }
    assert.equal(resultado.umaPorPeca, 1, 'a mesma peça em quatro giros sobe UMA arte');

    const recorte = await sharp(Buffer.from(resultado.recortada, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(recorte.info.width, largura);
    assert.equal(recorte.info.height, altura);
    assert.equal(recorte.data[3], 0, 'fundo retirado na resolução original');
    const centro = (300 * largura + 450) * 4;
    assert.deepEqual([...recorte.data.subarray(centro, centro + 4)], [18, 52, 86, 255]);
    const quina = (200 * largura + 250) * 4;
    assert.deepEqual([...recorte.data.subarray(quina, quina + 4)], [18, 52, 86, 255],
      'borda reta e nítida continua opaca e com a mesma cor');

    // O círculo: o perfil foi junto, os números são os do arquivo, e a borda
    // virou alfa em vez de um anel claro opaco.
    const redondaPng = Buffer.from(resultado.redonda, 'base64');
    const meta = await sharp(redondaPng).metadata();
    assert.ok(meta.icc && meta.icc.subarray(16, 20).toString() === 'RGB ', 'o perfil de cor do arquivo vai junto');
    const r = await sharp(redondaPng).keepIccProfile().raw().toBuffer({ resolveWithObject: true });
    const doArquivo = await sharp(circulo).keepIccProfile().raw().toBuffer({ resolveWithObject: true });
    const canais = doArquivo.info.channels;
    const meio = (150 * 300 + 150);
    assert.deepEqual([...r.data.subarray(meio * 4, meio * 4 + 3)], [...doArquivo.data.subarray(meio * canais, meio * canais + 3)],
      'os números de cor são os do arquivo, sem conversão do navegador');
    let semiTransparentes = 0;
    let aneisClaros = 0;
    for (let x = 150; x < 300; x++) {
      const i = (150 * 300 + x) * 4;
      const a = r.data[i + 3];
      if (a > 0 && a < 255) semiTransparentes++;
      // Opaco e claro na borda: o anel que sujava o contorno.
      if (a === 255 && r.data[i] > 60) aneisClaros++;
    }
    assert.ok(semiTransparentes >= 1, 'a borda suavizada tem de virar alfa');
    assert.equal(aneisClaros, 0, 'nenhum pixel opaco com o branco do fundo misturado na borda');
    console.log('OK — originais vão intactos (PNG, JPEG, PDF como vetor) e sem giro; giro total segue junto; '
      + 'fundo removido em resolução nativa, com perfil de cor e borda suave.');
  } finally { await browser.close(); }
}
main().catch(erro => { console.error(erro); process.exitCode = 1; });
