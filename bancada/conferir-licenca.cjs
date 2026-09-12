/**
 * ===========================================================================
 * A LICENÇA, DE PONTA A PONTA
 * ===========================================================================
 *
 * Esta conferência existe porque um defeito aqui tem dois lados, e os dois são
 * ruins de um jeito que nenhum teste de tela pega:
 *
 *   solta demais  o programa roda sem token, e o trabalho de proteger foi
 *                 embora sem ninguém notar — não há tela que acuse isso;
 *   presa demais  um cliente em dia fica trancado fora do sistema no meio do
 *                 expediente, e a primeira notícia é o telefone tocando.
 *
 * Ela sobe o servidor de verdade, num banco descartável, e anda pelo caminho
 * inteiro: a API recusando sem token, o painel mostrando o código da máquina,
 * os quatro jeitos de um token ser inválido (outra máquina, assinatura mexida,
 * vencido, já usado), a ativação pela tela — com a animação — e o painel
 * liberado no fim.
 *
 * O token é assinado AQUI, com a chave privada que fica fora do projeto (ver
 * `bancada/licenca-de-teste.cjs`) — que é o que o painel faz do outro lado. O
 * programa que está sendo testado não sabe assinar nada: se soubesse, esta
 * conferência não provaria coisa alguma.
 *
 * Roda com `npm run bancada:licenca`.
 */

const fs = require('node:fs'), os = require('node:os'), net = require('node:net'), path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const licenca = require('./licenca-de-teste.cjs');

const RAIZ = path.join(__dirname, '..');
const SAIDA = process.argv[2] || null;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
function portaLivre() { return new Promise((ok, err) => { const s = net.createServer(); s.on('error', err); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); }); }
async function esperarServidor(porta, t = 60) { for (let i = 0; i < t; i++) { try { const r = await fetch(`http://127.0.0.1:${porta}/`); if (r.ok) return true; } catch {} await esperar(500); } return false; }

const postar = (base, corpo) => fetch(`${base}/api/licenca`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
});

(async () => {
  const puppeteer = require('puppeteer');
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-lic-'));
  const porta = await portaLivre();
  const servidor = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'server.js')],
    { env: { ...process.env, PORT: String(porta), OPTIMIZE_DADOS: dados }, stdio: 'ignore' });

  let nav = null;
  try {
    assert.ok(await esperarServidor(porta), 'o servidor subiu');
    const base = `http://127.0.0.1:${porta}`;

    if (!licenca.temChave()) {
      console.log(`conferir-licenca: ${licenca.SEM_CHAVE}`);
      return;
    }

    // 1. Sem token: a API inteira responde 402, menos a licença.
    const moldes = await fetch(`${base}/api/moldes`);
    const estado = await fetch(`${base}/api/licenca`).then((r) => r.json());
    console.log('1. sem token   -> /api/moldes:', moldes.status, '| motivo:', estado.motivo,
      '| máquina:', estado.maquina);
    assert.equal(moldes.status, 402, 'a API tem que recusar sem licença');
    assert.equal(estado.liberado, false);
    assert.match(estado.maquina, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/, 'código da máquina');

    // 2. O painel mostra o bloqueio, com o código e o campo do token.
    nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const p = await nav.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.setViewport({ width: 1200, height: 900 });
    await p.goto(`${base}/moldes`, { waitUntil: 'networkidle2' });
    await esperar(1500);
    const naTela = await p.evaluate(() => ({
      temMenu: !!document.querySelector('aside'),
      texto: document.body.innerText.replace(/\s+/g, ' '),
      campo: !!document.querySelector('textarea[placeholder^="OPTMIZE1"]'),
    }));
    console.log('2. painel      -> menu:', naTela.temMenu, '| campo do token:', naTela.campo);
    assert.equal(naTela.temMenu, false, 'o menu não aparece bloqueado');
    assert.ok(naTela.campo, 'o campo do token está na tela');
    assert.ok(naTela.texto.includes(estado.maquina), 'o código da máquina está na tela');
    if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'L-bloqueado.png') });

    // 3. Token emitido para OUTRA máquina.
    const doVizinho = licenca.emitirToken({ maquinas: ['AAAA-BBBB-CCCC'] });
    const r3 = await postar(base, { token: doVizinho.token });
    console.log('3. outra máquina ->', r3.status, '—', (await r3.json()).error);
    assert.equal(r3.status, 400);

    // 4. Assinatura adulterada.
    const bom = licenca.emitirToken({ maquinas: [estado.maquina], cliente: 'Gráfica São Jorge' });
    const r4 = await postar(base, { token: bom.token.slice(0, -6) + 'AAAAAA' });
    console.log('4. assinatura mexida ->', r4.status, '—', (await r4.json()).error);
    assert.equal(r4.status, 400);

    // 5. Vencido: entra, mas não libera.
    const velho = licenca.emitirToken({ maquinas: [estado.maquina], expira: '2020-01-01' });
    const r5 = await postar(base, { token: velho.token });
    const estado5 = await r5.json();
    console.log('5. vencido     -> guardar:', r5.status, '| liberado:', estado5.liberado,
      '| motivo:', estado5.motivo);
    assert.equal(estado5.liberado, false, 'token vencido não libera');
    assert.equal((await fetch(`${base}/api/moldes`)).status, 402);

    // 6. Ativação de verdade, pela tela — com a animação.
    await p.evaluate((token) => {
      const campo = document.querySelector('textarea[placeholder^="OPTMIZE1"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(campo, token);
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('button')].find((b) => /Ativar/.test(b.textContent)).click();
    }, bom.token);
    await esperar(900);
    const naFesta = await p.evaluate(() => !!document.querySelector('[role=status] .licenca-selo'));
    if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'M-ativando.png') });
    await esperar(3200);
    const depois = await p.evaluate(() => !!document.querySelector('aside'));
    const moldes2 = await fetch(`${base}/api/moldes`);
    console.log('6. ativado     -> animação:', naFesta, '| menu:', depois, '| /api/moldes:', moldes2.status);
    assert.ok(naFesta, 'a animação de ativação apareceu');
    assert.equal(moldes2.status, 200, 'a API libera depois do token');
    assert.equal(depois, true, 'o painel volta inteiro');

    // 7. Uso único: o mesmo token não ativa duas vezes.
    const outro = licenca.emitirToken({ maquinas: [estado.maquina], cliente: 'Gráfica São Jorge' });
    const trocou = await postar(base, { token: outro.token });
    const devolta = await postar(base, { token: bom.token });
    const recado = (await devolta.json()).error;
    console.log('7. uso único   -> token novo:', trocou.status, '| voltar ao usado:',
      devolta.status, '—', recado);
    assert.equal(trocou.status, 200, 'um token novo substitui o anterior');
    assert.equal(devolta.status, 400, 'o token já usado não ativa de novo');
    assert.match(recado, /uma ativação/i);

    // 8. E a tela, já liberada, mostra de quem é e até quando.
    await p.goto(`${base}/licenca`, { waitUntil: 'networkidle2' });
    await esperar(1200);
    const tela = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    console.log('8. tela        ->',
      tela.slice(tela.indexOf('Licença deste'), tela.indexOf('Licença deste') + 190), '…');
    assert.ok(tela.includes('Gráfica São Jorge'), 'o nome do cliente aparece');
    assert.ok(!tela.includes('Gerar token'), 'não existe gerador dentro do programa');
    if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'N-licenca.png') });

    console.log('erros de página:', erros.length ? erros : 'nenhum');
    console.log('\nOK — tranca sem token, libera com o token, e recusa token de fora, mexido, vencido ou repetido.');
  } finally {
    if (nav) await nav.close();
    servidor.kill();
  }
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
