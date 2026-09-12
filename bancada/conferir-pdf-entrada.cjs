/**
 * ===========================================================================
 * O PDF QUE ENTRA — a arte chega inteira, e numa peça só
 * ===========================================================================
 *
 * Não confundir com `conferir-pdf.js`, que olha o PDF que SAI (o risco
 * exportado). Aqui é o contrário: o PDF que a fábrica larga no Encaixe.
 *
 * POR QUE ISTO EXISTE:
 *
 * O Encaixe aceitava PDF havia tempo, mas o lia pela porta do molde vetorial,
 * que é feita para MARCADOR — ela varre o desenho atrás de todo contorno
 * fechado, faz de cada um uma peça e repinta cada peça como silhueta de cor
 * chapada. Num PDF de arte isso dava os dois estragos que o chão de fábrica
 * relatou na mesma frase: o trabalho ia para a tabela em dezenas de pedaços, e
 * a arte sumia de todos eles.
 *
 * Nada disso aparecia em conferência nenhuma. O `tsc` passava (é tudo
 * JavaScript de motor), o build passava, e as bancadas de encaixe, PDF e React
 * passavam — porque nenhuma delas larga um PDF na entrada. A `conferir-tela`
 * larga PNG, que vai por outro caminho.
 *
 * Então esta bancada guarda as três coisas que o conserto prometeu, e que uma
 * mexida distraída no `pdfParaArte.js` ou no despacho do `controlador.js`
 * desfaria sem fazer barulho:
 *
 *   1. UMA peça, não uma por contorno do desenho.
 *   2. A medida em centímetros igual à da página — o PDF mede em pontos, então
 *      aqui não há chute de dpi para desculpar diferença.
 *   3. A ARTE, viva. É o ponto que mais interessa e o mais fácil de perder: um
 *      PDF lido como silhueta continua entrando como uma peça de medida certa,
 *      e a tabela fica com cara de quem acertou. Por isso a conferência não se
 *      contenta com "a peça entrou" — ela vai nos PIXELS da miniatura procurar
 *      as cores que o arquivo tinha. Silhueta chapada não tem duas cores.
 *
 * Roda com `npm run bancada:pdf-entrada`. Precisa do Chrome do Puppeteer, que
 * vem junto com o bot de WhatsApp; sem ele, avisa e sai sem reprovar.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const licencaDeTeste = require('./licenca-de-teste.cjs');

const RAIZ = path.join(__dirname, '..');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const PT_POR_CM = 72 / 2.54;
// A página do teste. Números redondos de propósito: se a medida sair errada,
// o valor que aparece no erro já diz sozinho o que aconteceu.
const LARGURA_CM = 30;
const ALTURA_CM = 40;

/** Uma porta que ninguém está usando. */
function portaLivre() {
  return new Promise((pronto, falhou) => {
    const servidor = net.createServer();
    servidor.on('error', falhou);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => pronto(port));
    });
  });
}

/** Bate na porta até o servidor atender. */
async function esperarServidor(porta, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/`);
      if (r.ok) return true;
    } catch { /* ainda subindo */ }
    await esperar(500);
  }
  return false;
}

/**
 * O PDF do teste, feito com o `pdfkit` que o projeto já usa para exportar.
 *
 * Duas figuras de cores fortes e muito separadas no vermelho e no azul, com
 * folga em volta. As cores são o que a conferência procura depois na
 * miniatura; a folga é o que prova que o fundo saiu transparente, porque uma
 * página pintada de branco encheria a peça inteira.
 *
 * As figuras são desenhadas com `fill`, sem contorno: se o leitor voltar a
 * tratar o arquivo como marcador, cada uma delas vira uma peça — e a
 * conferência da contagem pega isso na hora.
 */
function pdfDeTeste(pasta) {
  const PDFDocument = require('pdfkit');
  const arquivo = path.join(pasta, 'arte-de-teste.pdf');
  const largura = LARGURA_CM * PT_POR_CM;
  const altura = ALTURA_CM * PT_POR_CM;

  return new Promise((pronto, falhou) => {
    const doc = new PDFDocument({ size: [largura, altura], margin: 0 });
    const saida = fs.createWriteStream(arquivo);
    saida.on('finish', () => pronto(arquivo));
    saida.on('error', falhou);
    doc.pipe(saida);
    doc.rect(largura * 0.2, altura * 0.15, largura * 0.6, altura * 0.3).fill('#e01b24');
    doc.circle(largura * 0.5, altura * 0.7, Math.min(largura, altura) * 0.2).fill('#1c71d8');
    doc.end();
  });
}

async function principal() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.log('conferir-pdf-entrada: sem Puppeteer nesta máquina — pulando (não é reprovação).');
    return;
  }

  if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
    console.error('conferir-pdf-entrada: falta o painel compilado. Rode `npm run front` antes.');
    process.exit(1);
  }

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-pdf-'));
  const porta = await portaLivre();
  // Pasta de dados descartável: esta bancada nunca encosta no `dados.db` de quem roda.
  const servidor = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'server.js')], {
    env: { ...process.env, PORT: String(porta), OPTIMIZE_DADOS: pasta },
    stdio: 'ignore',
  });

  let navegador = null;
  try {
    if (!await esperarServidor(porta)) throw new Error('o servidor não subiu.');

    /*
     * A instalação nasce sem licença e a API inteira responde 402 até alguém
     * ativar — inclusive aqui. Ver `bancada/licenca-de-teste.cjs`.
     */
    if (!licencaDeTeste.temChave()) {
      console.log(`${path.basename(__filename, '.cjs')}: ${licencaDeTeste.SEM_CHAVE}`);
      return;
    }
    await licencaDeTeste.ativar(`http://127.0.0.1:${porta}`);

    navegador = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const p = await navegador.newPage();
    await p.setViewport({ width: 1600, height: 950 });

    const problemas = [];
    p.on('pageerror', (e) => problemas.push('erro de página: ' + e.message));

    await p.goto(`http://127.0.0.1:${porta}/encaixe`, { waitUntil: 'networkidle2' });

    const arquivo = await pdfDeTeste(pasta);
    await (await p.$('#encaixe-files')).uploadFile(arquivo);

    // O pdf.js é carregado sob demanda e só então desenha a página, então a
    // espera aqui é bem mais longa que a de largar um PNG.
    await p.waitForFunction(
      () => document.querySelectorAll('#encaixe-pecas-body img').length > 0,
      { timeout: 90000 },
    ).catch(() => { throw new Error('a peça não apareceu na tabela em 90 s.'); });

    // ---- 1. UMA peça ----
    const contagem = await p.$eval('#encaixe-contagem', (e) => e.textContent.trim());
    assert.match(
      contagem, /^1 · 1 cóp/,
      `o PDF tinha que entrar como UMA peça; a tabela diz "${contagem}".`
      + ' Contagem alta é o sintoma de ele ter voltado a ser lido como marcador.',
    );

    // ---- 2. A medida da página ----
    const medida = (await p.$eval('#encaixe-pecas-body', (e) => e.textContent)).replace(/\s+/g, ' ');
    const esperada = new RegExp(`${LARGURA_CM},0 × ${ALTURA_CM},0 cm`);
    assert.match(
      medida, esperada,
      `a peça tinha que medir ${LARGURA_CM},0 × ${ALTURA_CM},0 cm (o tamanho da página).`
      + ` A tabela mostra: "${medida.trim()}"`,
    );

    // ---- 3. A arte, viva ----
    // Lê os pixels da miniatura e procura o vermelho e o azul do arquivo. Uma
    // peça repintada como silhueta chapada tem uma cor só, e reprova aqui.
    const cores = await p.evaluate(async () => {
      const img = document.querySelector('#encaixe-pecas-body img');
      if (!img) return null;
      if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      if (!canvas.width || !canvas.height) return null;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dados = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let vermelhos = 0;
      let azuis = 0;
      let transparentes = 0;
      for (let i = 0; i < dados.length; i += 4) {
        const r = dados[i];
        const g = dados[i + 1];
        const b = dados[i + 2];
        const a = dados[i + 3];
        if (a < 32) { transparentes++; continue; }
        if (r > 150 && g < 110 && b < 110) vermelhos++;
        else if (b > 150 && r < 110 && g < 140) azuis++;
      }
      return { vermelhos, azuis, transparentes, total: dados.length / 4 };
    });

    assert.ok(cores, 'não consegui ler os pixels da miniatura da peça.');
    assert.ok(
      cores.vermelhos > 0 && cores.azuis > 0,
      'a arte do PDF não chegou na peça: procurei o vermelho e o azul do arquivo na miniatura e achei'
      + ` ${cores.vermelhos} pixel(s) vermelho(s) e ${cores.azuis} azul(is).`
      + ' Duas cores sumirem juntas é o desenho ter virado silhueta de novo.',
    );
    assert.ok(
      cores.transparentes > 0,
      'a página veio com fundo opaco: não achei um pixel transparente sequer na miniatura.'
      + ' Sem transparência o contorno "auto" lê a folha inteira, e toda peça de PDF encaixa como retângulo.',
    );

    assert.equal(problemas.length, 0, 'a tela acusou:\n  ' + problemas.slice(0, 5).join('\n  '));

    console.log(`OK — o PDF entrou como UMA peça de ${LARGURA_CM},0 × ${ALTURA_CM},0 cm, com a arte viva`
      + ` (${cores.vermelhos} px vermelhos, ${cores.azuis} azuis) e o fundo transparente`
      + ` (${cores.transparentes} de ${cores.total} px).`);
  } finally {
    if (navegador) await navegador.close().catch(() => {});
    servidor.kill();
    // Ver a nota da `conferir-tela`: o Windows segura o SQLite por um instante
    // depois de o processo morrer, e apagar cedo demais derruba uma
    // conferência que PASSOU.
    await esperar(600);
    try { fs.rmSync(pasta, { recursive: true, force: true }); }
    catch { console.log(`conferir-pdf-entrada: sobrou a pasta ${pasta} (pode apagar).`); }
  }
}

principal().catch((erro) => {
  console.error('conferir-pdf-entrada: ' + (erro && erro.message ? erro.message : erro));
  process.exit(1);
});
