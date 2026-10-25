const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');

async function principal() {
  const raiz = path.resolve(__dirname, '..');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-pdf-memoria-'));
  const arquivo = path.join(pasta, 'arte.pdf');
  const documento = new PDFDocument({ size: [144, 72], margin: 0 });
  documento.page.dictionary.data.Rotate = 90;
  const saida = fs.createWriteStream(arquivo);
  const gravado = new Promise((pronto, falhou) => {
    saida.on('finish', pronto);
    saida.on('error', falhou);
  });
  documento.pipe(saida);
  documento.rect(0, 0, 72, 36).fill('#ff0000');
  documento.rect(72, 36, 72, 36).fill('#0000ff');
  documento.end();
  await gravado;

  const { createServer } = await import(pathToFileURL(require.resolve('vite')));
  let servidor;
  let navegador;
  try {
    servidor = await createServer({
      root: raiz, configFile: false, publicDir: false,
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: ['pdfjs-dist'] },
      plugins: [{ name: 'bancada-pdf', enforce: 'pre', transform(codigo, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/motores/pdfParaArte.js')) return;
        const marcador = 'documento = await tarefa.promise;';
        if (!codigo.includes(marcador)) throw new Error('Não achei a abertura do PDF para testar o encerramento lento.');
        return codigo.replace(marcador, `${marcador}
          const encerrarTransporte = tarefa._transport.destroy.bind(tarefa._transport);
          tarefa._transport.destroy = async () => {
            await new Promise(pronto => setTimeout(pronto, 100));
            return encerrarTransporte();
          };
        `);
      }, configureServer(server) {
        server.middlewares.use('/bancada-pdf', (_, resposta) => {
          resposta.setHeader('Content-Type', 'text/html');
          resposta.end('<input type="file">');
        });
      } }],
    });
    await servidor.listen();
    navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const pagina = await navegador.newPage();
    await pagina.goto(`http://127.0.0.1:${servidor.httpServer.address().port}/bancada-pdf`);
    await (await pagina.$('input')).uploadFile(arquivo);
    const resultado = await pagina.evaluate(async () => {
      const { lerArteDoPDF } = await import('/src/motores/pdfParaArte.js');
      const { prepararArtes, arteDesenhadaDaPeca } = await import('/src/motores/exportarEncaixe.js');
      const { ladoDaPrevia } = await import('/src/motores/resolucaoDaArte.js');
      const file = document.querySelector('input').files[0];
      const criar = document.createElement.bind(document);
      const canvases = [];
      document.createElement = (tag, ...args) => {
        const elemento = criar(tag, ...args);
        if (tag === 'canvas') canvases.push(elemento);
        return elemento;
      };
      const falhas = await Promise.allSettled([
        lerArteDoPDF(new File(['%PDF quebrado'], 'invalido.pdf')),
        lerArteDoPDF(file),
        lerArteDoPDF(file),
      ]);
      for (const leitura of falhas.slice(1)) {
        if (leitura.status === 'rejected') throw leitura.reason;
      }
      const medidas = falhas.slice(1).map(({ value }) => {
        value.bitmap.close();
        URL.revokeObjectURL(value.endereco);
        return [value.larguraCm, value.alturaCm];
      });
      // A reserva sai DE PÉ: o giro de cada peça é do servidor, na matriz da
      // página (ver "O GIRO É DA PÁGINA, NÃO DOS PIXELS", em encaixe-pdf.js).
      const giros = [];
      {
        const blob = await arteDesenhadaDaPeca({ pdfOriginal: file });
        const bitmap = await createImageBitmap(blob);
        const canvas = criar('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const contexto = canvas.getContext('2d');
        contexto.drawImage(bitmap, 0, 0);
        const cores = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([horizontal, vertical]) =>
          Array.from(contexto.getImageData(Math.floor(bitmap.width * horizontal), Math.floor(bitmap.height * vertical), 1, 1).data));
        giros.push({ tamanho: [bitmap.width, bitmap.height], cores });
        bitmap.close();
        canvas.width = canvas.height = 0;
      }
      const item = { indice: 7, pdfOriginal: file, rotacaoBase: 90 };
      const artes = await prepararArtes([{ item, rot: 0 }, { item, rot: 0 }, { item, rot: 180 }]);
      const preparadas = [...artes].map(([chave, { arte, vetor }]) => [chave, arte === file, vetor]);
      return {
        estados: falhas.map(({ status }) => status), medidas, giros, preparadas,
        canvasesVivos: canvases.filter(canvas => canvas.width > 0 && canvas.height > 0).length,
        teto: ladoDaPrevia(500),
      };
    });
    assert.deepEqual(resultado.estados, ['rejected', 'fulfilled', 'fulfilled']);
    for (const medidas of resultado.medidas) {
      assert.ok(Math.abs(medidas[0] - 2.54) < 0.0001);
      assert.ok(Math.abs(medidas[1] - 5.08) < 0.0001);
    }
    assert.deepEqual(resultado.giros.map(giro => giro.tamanho), [[300, 600]]);
    const transparente = [0, 0, 0, 0];
    const vermelho = [255, 0, 0, 255];
    const azul = [0, 0, 255, 255];
    assert.deepEqual(resultado.giros.map(giro => giro.cores), [
      [transparente, vermelho, azul, transparente],
    ]);
    // O PDF vai como veio (vetor), UMA vez por peça, e o servidor gira cada
    // posição (ver `chaveDaArte`).
    assert.deepEqual(resultado.preparadas, [['7', true, true]]);
    assert.equal(resultado.canvasesVivos, 0);
    assert.equal(resultado.teto, 3072);
    console.log('OK — PDF: fila após erro, medidas, reserva de pé a 300 dpi, transparência e liberação de memória.');
  } finally {
    await navegador?.close();
    await servidor?.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

principal().catch(erro => { console.error(erro); process.exitCode = 1; });
