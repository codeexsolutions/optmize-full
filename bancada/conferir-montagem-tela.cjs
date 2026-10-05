/*
 * BANCADA — a Montagem no navegador: a peça inteira, a mão, o nó e o puxador com o mouse
 *
 *     npm run front && npm run bancada:montagem-tela
 *
 * Fora da CI, como a `bancada:tela` (precisa do Puppeteer e do painel
 * compilado DESTE fonte — ver o carimbo em `empacotar/carimbo.cjs`). O que as
 * contas e o jsdom não pegam: a escala da mesa, o ponteiro de verdade chegando
 * no nó e no puxador, a tecla da ferramenta, o Ctrl+Z/Ctrl+Y e a gravação. Ver
 * docs/superpowers/specs/2026-10-05-curvas-faceis-da-montagem-design.md.
 *
 * Os prints ficam numa pasta temporária, com o caminho no fim.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { semearSessao } = require('./sessao-de-teste.cjs');
const { carimboDoFonte } = require('../empacotar/carimbo.cjs');

const RAIZ = path.join(__dirname, '..');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Uma elipse de 30 × 50 cm em 8 nós suaves (como o Digitalizar entrega), com o centro em (15, 25). */
function elipse() {
  const N = 8;
  const k = (4 / 3) * Math.tan(Math.PI / (2 * N));
  return Array.from({ length: N }, (_, i) => {
    const a = (i / N) * 2 * Math.PI;
    const p = { x: 15 + 15 * Math.cos(a), y: 25 + 25 * Math.sin(a) };
    const tg = { x: -15 * Math.sin(a) * k, y: 25 * Math.cos(a) * k };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x, y: p.y - tg.y }, saida: { x: p.x + tg.x, y: p.y + tg.y }, canto: false, retaDepois: false };
  });
}
/** O ângulo entre a alça que entra e a que sai (0 = liso). */
function quebra(no) {
  const e = { x: no.x - no.entrada.x, y: no.y - no.entrada.y };
  const s = { x: no.saida.x - no.x, y: no.saida.y - no.y };
  if (Math.hypot(e.x, e.y) < 1e-6 || Math.hypot(s.x, s.y) < 1e-6) return 0;
  return Math.abs(Math.atan2(e.x * s.y - e.y * s.x, e.x * s.x + e.y * s.y));
}

async function principal() {
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch {
    console.log('conferir-montagem-tela: sem Puppeteer nesta máquina — pulando (não é reprovação).');
    return;
  }
  let carimbado = null;
  try { carimbado = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dist', 'carimbo.json'), 'utf8')).fonte; } catch { /* sem carimbo */ }
  if (carimbado !== carimboDoFonte(RAIZ)) {
    console.error('conferir-montagem-tela: o painel compilado (dist/) não é deste src/. Rode `npm run front` antes.');
    process.exit(1);
  }

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-montagem-tela-'));
  const prints = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-montagem-prints-'));
  semearSessao(pasta);
  const porta = await portaLivre();
  const servidor = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'server.js')], {
    env: { ...process.env, PORT: String(porta), OPTIMIZE_DADOS: pasta }, stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${porta}`;
  let navegador = null;
  let pagina = null;
  try {
    await esperarServidor(porta);
    const nos = elipse();
    const criado = await (await fetch(`${base}/api/moldes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nome: 'elipse de teste', situacao: 'rascunho',
        pecas: [{ papel: 'frente', tamanho: 'M', largura: 30, altura: 50, contorno: nos.map((n) => ({ x: n.x, y: n.y })), nos }],
      }),
    })).json();
    assert.ok(criado.id, `o molde não foi criado: ${JSON.stringify(criado)}`);
    const nosGravados = async () => (await (await fetch(`${base}/api/moldes/${criado.id}`)).json()).pecas[0].nos;
    /** Espera a gravação sozinha da Montagem levar a mexida ao banco. */
    const esperarGravar = async (condicao, rotulo) => {
      for (let i = 0; i < 30; i++) {
        const n = await nosGravados();
        if (condicao(n)) return n;
        await esperar(300);
      }
      throw new Error(`a mexida não chegou ao banco: ${rotulo}`);
    };

    navegador = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const p = await navegador.newPage();
    pagina = p;
    await p.setViewport({ width: 1440, height: 860 });
    const problemas = [];
    p.on('pageerror', (e) => problemas.push(`erro de página: ${e.message}`));
    await p.goto(`${base}/montagem?molde=${criado.id}`, { waitUntil: 'networkidle2' });
    await esperar(1500);
    await p.screenshot({ path: path.join(prints, 'montagem-1-aberta.png') });

    // ---- 1. a peça inteira na mesa ----
    const caixas = async () => p.evaluate(() => {
      const c = document.querySelector('canvas[data-mesa]');
      const m = c.parentElement.parentElement;
      const rc = c.getBoundingClientRect();
      const rm = m.getBoundingClientRect();
      return { c: { x: rc.left, y: rc.top, w: rc.width, h: rc.height }, m: { x: rm.left, y: rm.top, w: m.clientWidth, h: m.clientHeight }, sl: m.scrollLeft, st: m.scrollTop };
    });
    let k = await caixas();
    assert.ok(k.c.w <= k.m.w + 1 && k.c.h <= k.m.h + 1, `a peça não coube na mesa (${JSON.stringify(k)})`);
    assert.ok(k.c.h > k.m.h * 0.9, 'a peça comprida tinha que ocupar a altura da mesa');

    // A vista: a caixa da elipse (0..30 × 0..50) com 3 cm de folga.
    const naTela = (q, kk = k) => ({ x: kk.c.x + ((q.x + 3) / 36) * kk.c.w, y: kk.c.y + ((q.y + 3) / 56) * kk.c.h });
    const porCm = k.c.w / 36;

    // ---- 2. arrastar o nó 0 com o mouse: a curva segue, sem bico ----
    const de = naTela(nos[0]);
    await p.mouse.move(de.x, de.y);
    await esperar(100);
    await p.mouse.down();
    await p.mouse.move(de.x + 30, de.y + 10, { steps: 6 });
    await p.mouse.up();
    let gravado = await esperarGravar((n) => Math.abs(n[0].x - nos[0].x) > 0.5, 'arrastar o nó 0');
    assert.ok(Math.abs(gravado[0].x - (nos[0].x + 30 / porCm)) < 0.2, `o nó andou ${gravado[0].x - nos[0].x} cm`);
    for (const i of [7, 0, 1]) {
      assert.ok(gravado[i].auto, `o nó ${i} virou automático`);
      assert.ok(quebra(gravado[i]) < 2e-3, `o nó ${i} ficou com bico (${quebra(gravado[i])})`);
    }

    // ---- 3. o puxador do nó 2 (já selecionado pelo clique), com o mouse ----
    const no2 = naTela(gravado[2]);
    await p.mouse.click(no2.x, no2.y);
    await esperar(300);
    const puxador = naTela(gravado[2].saida);
    const longe = { x: puxador.x + (puxador.x - no2.x), y: puxador.y + (puxador.y - no2.y) };
    await p.mouse.move(puxador.x, puxador.y);
    await esperar(100);
    await p.mouse.down();
    await p.mouse.move(longe.x, longe.y, { steps: 6 });
    await p.mouse.up();
    const antesDoPuxador = gravado;
    gravado = await esperarGravar((n) => n[2].auto && n[2].auto.depois > 1.5, 'o puxador do nó 2');
    assert.ok(Math.abs(gravado[2].auto.antes - (antesDoPuxador[2].auto ? antesDoPuxador[2].auto.antes : gravado[2].auto.antes)) < 0.05,
      'a entrada do nó 2 não podia mudar');
    assert.ok(quebra(gravado[2]) < 2e-3, 'o puxador não pode fazer bico');
    await p.screenshot({ path: path.join(prints, 'montagem-2-puxador.png') });

    // ---- 4. Ctrl+Z e Ctrl+Y ----
    await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control');
    await esperarGravar((n) => !n[2].auto || n[2].auto.depois < 1.5, 'Ctrl+Z');
    await p.keyboard.down('Control'); await p.keyboard.press('y'); await p.keyboard.up('Control');
    await esperarGravar((n) => n[2].auto && n[2].auto.depois > 1.5, 'Ctrl+Y');

    // ---- 5. a tecla da ferramenta ----
    const ferramenta = () => p.$$eval('[aria-label="Ferramentas"] button[aria-pressed="true"]', (b) => b.map((x) => x.textContent.trim()));
    await p.keyboard.press('p');
    await esperar(200);
    assert.deepEqual(await ferramenta(), ['Pique'], 'P troca para o Pique');
    await p.keyboard.press('n');
    await esperar(200);
    assert.deepEqual(await ferramenta(), ['Nós'], 'N volta para os Nós');

    // ---- 6. zoom, Espaço e o 0 ----
    await p.click('button[aria-label="Aproximar"]');
    await p.click('button[aria-label="Aproximar"]');
    await p.click('button[aria-label="Aproximar"]');
    await esperar(300);
    k = await caixas();
    assert.ok(k.c.w > k.m.w, 'três "+" deixam a peça maior que a mesa');
    const antesDaMao = { sl: k.sl, st: k.st };
    const meio = { x: k.m.x + k.m.w / 2, y: k.m.y + k.m.h / 2 };
    await p.mouse.move(meio.x, meio.y);
    await p.keyboard.down(' ');
    await p.mouse.down();
    await p.mouse.move(meio.x - 120, meio.y - 80, { steps: 5 });
    await p.mouse.up();
    await p.keyboard.up(' ');
    await esperar(200);
    k = await caixas();
    assert.ok(k.sl !== antesDaMao.sl || k.st !== antesDaMao.st, 'Espaço+arrastar tinha que andar pela peça');
    const naoMexeu = await nosGravados();
    assert.ok(Math.abs(naoMexeu[0].x - gravado[0].x) < 1e-9, 'a mão não pode mexer em nó');
    await p.keyboard.press('0');
    await esperar(300);
    k = await caixas();
    assert.ok(k.c.w <= k.m.w + 1 && k.c.h <= k.m.h + 1, 'o 0 devolve a peça inteira');
    await p.screenshot({ path: path.join(prints, 'montagem-3-final.png') });

    assert.deepEqual(problemas, [], problemas.join('\n'));
    console.log('OK — a Montagem abre a peça inteira, o nó e o puxador seguem o mouse sem bico, '
      + `P/N trocam a ferramenta, Ctrl+Z/Ctrl+Y, os botões de zoom, Espaço e o 0 funcionam. Prints em ${prints}`);
  } catch (e) {
    // O print da hora da falha diz mais que a mensagem.
    if (pagina) await pagina.screenshot({ path: path.join(prints, 'montagem-falhou.png') }).catch(() => {});
    e.message += ` (print em ${prints})`;
    throw e;
  } finally {
    if (navegador) await navegador.close().catch(() => {});
    servidor.kill();
    await esperar(800);
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

principal().catch((e) => { console.error('conferir-montagem-tela:', e.message); process.exit(1); });
