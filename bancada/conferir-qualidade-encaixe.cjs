/** Confere os bytes e pixels exportados usando canvas de um navegador real. */
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
    const resultado = await page.evaluate(async ({ png, jpg, fundo }) => {
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
      const direta = await arteQualidade.desenharPecaGirada(peca, 0);
      const jpegDireto = await arteQualidade.desenharPecaGirada({ ...peca, arquivoOriginal: blob(jpg, 'image/jpeg') }, 0);
      const giradas = [];
      for (const rot of [90, 180, 270]) {
        const girada = await arteQualidade.desenharPecaGirada(peca, rot);
        giradas.push({ rot, tipo: girada.type, bytes: await base64(girada) });
      }
      // A peça girada ANTES do encaixe (`rotacaoBase`) sai no PDF girada pela
      // soma dos dois giros, e a chave continua sendo a do giro do encaixe —
      // é por ela que o PDF procura a arte (ver `prepararArtes`).
      const comBase = [];
      const combinacoes = [[90, 0], [90, 90], [270, 180], [180, 180]];
      const artesComBase = await arteQualidade.prepararArtes(combinacoes.map(([base, rot], indice) => ({
        item: { ...peca, indice, rotacaoBase: base }, rot,
      })));
      for (let indice = 0; indice < combinacoes.length; indice++) {
        const [base, rot] = combinacoes[indice];
        const arte = artesComBase.get(`${indice}-${rot}`);
        comBase.push({ base, rot, bytes: arte ? await base64(arte) : null });
      }
      const recortada = await arteQualidade.desenharPecaGirada({ ...peca,
        arquivoOriginal: blob(fundo, 'image/png'), fundoNaExportacao: 'auto' }, 0);
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
      sumida.arrayBuffer = () => Promise.reject(
        new DOMException('The requested file could not be read, typically due to permission '
          + 'problems that have occurred after a reference to a file was acquired.', 'NotReadableError'));
      let recado = '';
      try {
        await arteQualidade.desenharPecaGirada({ ...peca, nome: 'capa frente.jpg', arquivoOriginal: sumida }, 0);
      } catch (erro) { recado = erro.message; }

      const previaValida = previa.width;
      previa.close();
      return { direta: await base64(direta), jpegDireto: await base64(jpegDireto), giradas, comBase,
        recortada: await base64(recortada), previaValida, recado };
    }, { png: png.toString('base64'), jpg: jpg.toString('base64'), fundo: fundo.toString('base64') });
    assert.deepEqual(Buffer.from(resultado.direta, 'base64'), png, 'PNG sem giro mantém todos os bytes');
    assert.deepEqual(Buffer.from(resultado.jpegDireto, 'base64'), jpg, 'JPEG seguro não é recomprimido');
    assert.equal(resultado.previaValida, 90, 'exportação não fecha a imagem usada pelo cálculo');
    assert.match(resultado.recado, /capa frente\.jpg/,
      `o recado tem que dizer QUAL arte não pôde ser lida (veio "${resultado.recado}")`);
    assert.match(resultado.recado, /arrast/i,
      `o recado tem que dizer o que fazer (veio "${resultado.recado}")`);
    for (const girada of resultado.giradas) {
      assert.equal(girada.tipo, 'image/png');
      const bytes = Buffer.from(girada.bytes, 'base64');
      const esperado = await sharp(png).rotate(girada.rot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const real = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(real.info.width, esperado.info.width);
      assert.equal(real.info.height, esperado.info.height);
      assert.deepEqual(real.data, esperado.data, `giro ${girada.rot} preserva cada pixel`);
    }
    for (const { base, rot, bytes } of resultado.comBase) {
      assert.ok(bytes, `a arte da peça girada ${base}° (encaixe ${rot}°) está na chave do giro do encaixe`);
      const total = (base + rot) % 360;
      const esperado = await sharp(png).rotate(total).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const real = await sharp(Buffer.from(bytes, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(real.info.width, esperado.info.width, `giro base ${base}° + encaixe ${rot}°: largura`);
      assert.equal(real.info.height, esperado.info.height, `giro base ${base}° + encaixe ${rot}°: altura`);
      assert.deepEqual(real.data, esperado.data, `giro base ${base}° + encaixe ${rot}° sai girado ${total}° sem perder pixel`);
    }
    const recorte = await sharp(Buffer.from(resultado.recortada, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(recorte.info.width, largura);
    assert.equal(recorte.info.height, altura);
    assert.equal(recorte.data[3], 0, 'fundo retirado na resolução original');
    const centro = (300 * largura + 450) * 4;
    assert.deepEqual([...recorte.data.subarray(centro, centro + 4)], [18, 52, 86, 255]);
    console.log('OK — PNG/JPEG originais intactos; giros 90/180/270 sem perda de pixels; peça girada antes do encaixe sai girada pela soma; fundo removido em resolução nativa.');
  } finally { await browser.close(); }
}
main().catch(erro => { console.error(erro); process.exitCode = 1; });
