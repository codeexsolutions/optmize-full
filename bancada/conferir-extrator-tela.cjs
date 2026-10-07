/*
 * ===========================================================================
 * BANCADA — o Extrator no navegador
 * ===========================================================================
 *
 *     npm run modelos && npm run front && npm run bancada:extrator-tela
 *
 * Fora da CI, como a `bancada:tela`: precisa do Puppeteer, do painel
 * compilado DESTE fonte (o carimbo, ver `empacotar/carimbo.cjs`) e das redes
 * do Extrator em servidor/modelos.
 *
 * Duas voltas, cada uma com o seu servidor numa pasta de dados descartável:
 *
 *   1. SEM a rede (OPTIMIZE_EXTRATOR_MODELOS numa pasta vazia): a tela diz o
 *      que falta, e um PNG já recortado entra pelo "Guardar a imagem inteira";
 *   2. COM a rede, e a leitura vencendo em 4 s (OPTIMIZE_EXTRATOR_VALIDADE_MS):
 *      a foto de celular deitada (EXIF 6) chega em pé; o clique acha o disco;
 *      três cliques seguidos dão a máscara dos três; a leitura vencida é
 *      refeita sem erro na tela; o elemento guardado entra na lista; e o
 *      Endireitar com os cantos de começo corta 10% de cada lado.
 *
 * O 410 da leitura vencida é esperado (é ele que a tela refaz); qualquer
 * outra resposta >= 400 da API, ou erro no console, reprova.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sharp = require('sharp');
const { semearSessao } = require('./sessao-de-teste.cjs');
const { carimboDoFonte } = require('../empacotar/carimbo.cjs');
const rede = require('../servidor/extrator-rede.js');

const RAIZ = path.join(__dirname, '..');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ESPERADOS = [/^410 .*\/api\/extrator\/mascara/, /status of 410/];

function portaLivre() {
  return new Promise((pronto, falhou) => {
    const s = net.createServer();
    s.on('error', falhou);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => pronto(port)); });
  });
}

async function esperarServidor(porta) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${porta}/`)).ok) return; } catch { /* subindo */ }
    await esperar(500);
  }
  throw new Error('o servidor não subiu.');
}

/** Um servidor numa pasta de dados descartável, com o ambiente pedido. */
async function subir(env) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-extrator-'));
  semearSessao(pasta);
  const porta = await portaLivre();
  const processo = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'server.js')], {
    env: { ...process.env, PORT: String(porta), OPTIMIZE_DADOS: pasta, ...env }, stdio: 'ignore',
  });
  await esperarServidor(porta);
  return { porta, pasta, parar: () => processo.kill() };
}

/** A cena: disco vermelho e quadrado azul sobre bege, 1200 × 900. */
function cena() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">'
    + '<rect width="100%" height="100%" fill="#f4f1ea"/><circle cx="420" cy="450" r="170" fill="#c8102e"/>'
    + '<rect x="780" y="300" width="260" height="260" fill="#1f4fa3"/></svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function abrirPagina(navegador, porta, problemas) {
  const p = await navegador.newPage();
  await p.setViewport({ width: 1600, height: 1000 });
  p.on('pageerror', (e) => problemas.push(`erro de página: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const onde = (m.location() && m.location().url) || '';
    if (/favicon/.test(onde) || ESPERADOS.some((r) => r.test(m.text()))) return;
    problemas.push(`console: ${m.text()}${onde ? ` (${onde})` : ''}`);
  });
  p.on('response', (r) => {
    const linha = `${r.status()} ${r.url()}`;
    if (r.url().includes('/api/') && r.status() >= 400 && !ESPERADOS.some((re) => re.test(linha))) problemas.push(linha);
  });
  // O download: o clique no <a download> vira um registro em window.__baixados.
  await p.evaluateOnNewDocument(() => {
    window.__baixados = [];
    const clicar = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        const nome = this.download;
        fetch(this.href).then((r) => r.arrayBuffer()).then((b) => window.__baixados.push({ nome, bytes: Array.from(new Uint8Array(b)) }));
        return;
      }
      clicar.call(this);
    };
  });
  await p.goto(`http://127.0.0.1:${porta}/extrator`, { waitUntil: 'networkidle2' });
  // A tela é carregada sob demanda: o networkidle2 pode vir antes de ela montar.
  await p.waitForSelector('#extrator-foto', { timeout: 15000 });
  return p;
}

/** Clica num ponto da FOTO DE TRABALHO (os pixels do canvas), com o botão pedido. */
async function clicarNaFoto(p, x, y, botao = 'left') {
  await p.$eval('#extrator-mesa', (c) => c.scrollIntoView({ block: 'center' }));
  const m = await p.$eval('#extrator-mesa', (c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, L: c.width, A: c.height };
  });
  await p.mouse.click(m.x + (x / m.L) * m.w, m.y + (y / m.A) * m.h, { button: botao });
}

/** Espera a máscara de `n` cliques aparecer na mesa, e devolve a cobertura dela. */
async function esperarMascara(p, n, ms = 30000) {
  await p.waitForFunction((k) => document.querySelector('#extrator-mesa')?.dataset.pontosDaMascara === String(k), { timeout: ms }, n);
  return Number(await p.$eval('#extrator-mesa', (c) => c.dataset.cobertura));
}

const esperarElementos = (p, n) => p.waitForFunction((k) => document.querySelectorAll('#extrator-elementos li').length === k, { timeout: 20000 }, n);

async function semRede(navegador, pasta) {
  const vazia = fs.mkdtempSync(path.join(os.tmpdir(), 'extrator-sem-rede-'));
  const s = await subir({ OPTIMIZE_EXTRATOR_MODELOS: vazia });
  const problemas = [];
  try {
    const p = await abrirPagina(navegador, s.porta, problemas);
    assert.ok(await p.$('a[href="/extrator"]'), 'o Extrator está no menu');
    await p.waitForSelector('#extrator-sem-rede', { timeout: 10000 });
    assert.match(await p.$eval('#extrator-sem-rede', (n) => n.textContent), /não está instalada/);
    // Um PNG já recortado: o disco vermelho sobre transparente.
    const png = path.join(pasta, 'recortado.png');
    await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><circle cx="200" cy="150" r="90" fill="#c8102e"/></svg>'))
      .png().toFile(png);
    await (await p.$('#extrator-foto')).uploadFile(png);
    await p.waitForSelector('#extrator-inteira:not([disabled])', { timeout: 15000 });
    await p.click('#extrator-inteira');
    await esperarElementos(p, 1);
    assert.match(await p.$eval('#extrator-elementos li', (n) => n.textContent), /chapado/, 'o disco chapado é sugerido como chapado');
    assert.deepEqual(problemas, [], problemas.join('\n'));
    console.log('  sem a rede: o aviso, e o PNG recortado entra inteiro');
    await p.close();
  } finally {
    s.parar();
  }
}

async function comRede(navegador, pasta) {
  const s = await subir({ OPTIMIZE_EXTRATOR_VALIDADE_MS: '4000' });
  const problemas = [];
  try {
    const p = await abrirPagina(navegador, s.porta, problemas);

    // A foto de celular deitada: guardada girada, com o EXIF mandando endireitar.
    const deitada = path.join(pasta, 'deitada.jpg');
    await sharp(await cena()).rotate(-90).jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toFile(deitada);
    await (await p.$('#extrator-foto')).uploadFile(deitada);
    await p.waitForSelector('#extrator-mesa', { timeout: 15000 });
    assert.deepEqual(await p.$eval('#extrator-mesa', (c) => [c.width, c.height]), [1200, 900], 'a foto deitada chega em pé');

    // Um clique no disco.
    await clicarNaFoto(p, 420, 450);
    const umClique = await esperarMascara(p, 1);
    assert.ok(umClique > 0.07 && umClique < 0.1, `o disco é uns 8% da foto (deu ${umClique})`);

    // Três cliques seguidos: dois no disco e um "não" no quadrado. A máscara mostrada é a dos três.
    await p.click('#extrator-limpar');
    await clicarNaFoto(p, 420, 450);
    await clicarNaFoto(p, 380, 420);
    await clicarNaFoto(p, 910, 430, 'right');
    const tresCliques = await esperarMascara(p, 3);
    assert.ok(tresCliques > 0.07 && tresCliques < 0.1, `com o quadrado excluído, continua o disco (deu ${tresCliques})`);

    // A leitura vence (4 s): o próximo clique relê a foto sozinho, sem erro na tela.
    await esperar(5000);
    await clicarNaFoto(p, 450, 480);
    await esperarMascara(p, 4);
    assert.equal(await p.$('#extrator-erro'), null, 'a leitura vencida não aparece como erro');

    // Guardar.
    await p.click('#extrator-guardar');
    await esperarElementos(p, 1);
    assert.match(await p.$eval('#extrator-elementos li img', (i) => i.src), /^data:image\/png/);

    // Endireitar com os cantos de começo (10% de cada lado): a foto fica com 80% de cada medida.
    await p.click('#extrator-endireitar');
    await p.click('#extrator-aplicar-cantos');
    await p.waitForFunction(() => {
      const c = document.querySelector('#extrator-mesa');
      return c && c.width === 960 && c.height === 720;
    }, { timeout: 20000 });

    assert.deepEqual(problemas, [], problemas.join('\n'));
    // O servidor some no meio do clique: o erro na tela é em português, não o "Failed to fetch" do navegador.
    await p.setRequestInterception(true);
    p.on('request', (rq) => (rq.url().includes('/api/extrator/') ? rq.abort('connectionrefused') : rq.continue()));
    await clicarNaFoto(p, 300, 300);
    await p.waitForSelector('#extrator-erro', { timeout: 15000 });
    const textoDoErro = await p.$eval('#extrator-erro', (e) => e.textContent || '');
    assert.match(textoDoErro, /servidor do Extrator/, 'o servidor fora do ar vira mensagem em português');
    assert.doesNotMatch(textoDoErro, /Failed to fetch/i, 'o erro do navegador não vaza para a tela');

    console.log('  com a rede: EXIF, clique, cliques seguidos, leitura vencida, guardar, endireitar e servidor fora do ar');
    await p.close();
  } finally {
    s.parar();
  }
}

async function principal() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.log('conferir-extrator-tela: sem Puppeteer nesta máquina — pulando (não é reprovação).');
    return;
  }
  let carimbado = null;
  try { carimbado = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dist', 'carimbo.json'), 'utf8')).fonte; } catch { /* sem carimbo */ }
  if (carimbado !== carimboDoFonte(RAIZ)) {
    console.error('conferir-extrator-tela: o painel compilado (dist/) não é deste src/. Rode `npm run front` antes.');
    process.exit(1);
  }
  const motivo = rede.porqueNaoRoda();
  if (motivo) {
    console.error(`conferir-extrator-tela: ${motivo}`);
    process.exit(1);
  }
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-extrator-arquivos-'));
  const navegador = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    await semRede(navegador, pasta);
    await comRede(navegador, pasta);
  } finally {
    await navegador.close();
  }
  console.log('OK — o Extrator no navegador.');
}

principal().catch((e) => { console.error(e); process.exit(1); });
