/**
 * ===========================================================================
 * A CONFERÊNCIA DA TELA — o sistema inteiro, num navegador de verdade
 * ===========================================================================
 *
 * Sobe o servidor numa pasta de dados descartável, abre o painel num Chrome
 * sem janela e faz o caminho que a fábrica faz: larga três artes no Encaixe,
 * manda otimizar e pede o PDF.
 *
 * POR QUE ISTO EXISTE, e por que não bastavam as outras bancadas:
 *
 * O `conferir-react.cjs` monta o painel num jsdom. Ele acha muita coisa — rota,
 * estado, modal que fica aberto — e é rápido. Mas jsdom não tem canvas, não
 * tem `createImageBitmap`, não tem worker e não tem `<input type=file>` de
 * verdade. Ou seja: **a entrada de arquivo do Encaixe, que é por onde todo
 * trabalho começa, era o único caminho do sistema sem conferência nenhuma.**
 *
 * E ele quebrou. Ao mover a leitura do "5x" do nome do arquivo para um motor
 * próprio, duas funções vizinhas (`lerImagemCrua` e `montarPecaDaImagem`)
 * foram junto por engano. O `tsc` passou, o build passou, as bancadas de
 * encaixe, PDF e React passaram — e largar um PNG na tela dava
 * "lerImagemCrua is not defined". Um navegador de verdade viu na primeira
 * tentativa.
 *
 * Foi ele também que achou a caixa de diálogo React sem estilo (ela caía no
 * fim da página, e o clique em "Excluir" ia parar noutro elemento) e o modal
 * por baixo do menu lateral. Nenhum dos dois aparece sem pintar a tela.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELE NÃO É
 * ---------------------------------------------------------------------------
 *
 * Não é uma conferência de QUALIDADE do encaixe — quem mede consumo é
 * `npm run bancada`, e quem prova que o WASM bate com o JavaScript é
 * `bancada:conferir`. Aqui o que se confere é que o CAMINHO existe inteiro: o
 * arquivo entra, a medida sai certa do dpi, a busca roda, o risco é desenhado
 * e o servidor devolve o PDF.
 *
 * Por isso os números conferidos são grosseiros de propósito (a peça tem a
 * medida que o dpi manda; a metragem é maior que zero). Apertar mais faria
 * esta bancada quebrar a cada mexida boa no motor, que é o contrário do que
 * ela serve para proteger.
 *
 * Roda com `npm run bancada:tela`. Precisa do Chrome do Puppeteer, que vem
 * junto com o bot de WhatsApp; sem ele, avisa e sai sem reprovar.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** As três artes do teste, com o dpi gravado — é dele que sai a medida. */
async function artesDeTeste(pasta) {
  const sharp = require('sharp');
  const alvos = [
    ['peca-a.png', 300, 400],
    ['peca-b.png', 250, 250],
    ['peca-c.png', 400, 200],
  ];
  const caminhos = [];
  for (const [nome, largura, altura] of alvos) {
    const arquivo = path.join(pasta, nome);
    await sharp({ create: { width: largura, height: altura, channels: 4, background: { r: 40, g: 120, b: 200, alpha: 1 } } })
      .png().withMetadata({ density: 150 }).toFile(arquivo);
    caminhos.push(arquivo);
  }
  return caminhos;
}

async function principal() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.log('conferir-tela: sem Puppeteer nesta máquina — pulando (não é reprovação).');
    return;
  }

  if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
    console.error('conferir-tela: falta o painel compilado. Rode `npm run front` antes.');
    process.exit(1);
  }

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-tela-'));
  const porta = await portaLivre();
  // Pasta de dados descartável: esta bancada nunca encosta no `dados.db` de quem roda.
  const servidor = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'server.js')], {
    env: { ...process.env, PORT: String(porta), OPTIMIZE_DADOS: pasta },
    stdio: 'ignore',
  });

  let navegador = null;
  try {
    if (!await esperarServidor(porta)) throw new Error('o servidor não subiu.');

    navegador = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const p = await navegador.newPage();
    await p.setViewport({ width: 1600, height: 950 });

    const problemas = [];
    p.on('pageerror', (e) => problemas.push('erro de página: ' + e.message));
    p.on('console', (m) => {
      if (m.type() !== 'error') return;
      /*
       * O texto de um erro de rede não diz QUAL endereço falhou — o endereço
       * está na `location`. Sem olhar lá, o 404 do `favicon.ico` (que o
       * projeto não tem, e que nenhuma tela pede) reprovaria a conferência
       * inteira. As falhas que importam, as de `/api/`, são pegas pela
       * resposta HTTP logo abaixo.
       */
      const onde = m.location() && m.location().url ? m.location().url : '';
      if (/favicon/.test(onde)) return;
      problemas.push('console: ' + m.text() + (onde ? ` (${onde})` : ''));
    });
    const respostasDoPdf = [];
    p.on('response', (r) => {
      if (r.url().includes('/api/encaixe/pdf')) respostasDoPdf.push(r.status());
      if (r.url().includes('/api/') && r.status() >= 400) problemas.push(`${r.status()} ${r.url()}`);
    });

    await p.goto(`http://127.0.0.1:${porta}/encaixe`, { waitUntil: 'networkidle2' });
    await esperar(900);

    // ---- 1. os arquivos entram ----
    const artes = await artesDeTeste(pasta);
    await (await p.$('#encaixe-files')).uploadFile(...artes);
    await esperar(8000);

    const contagem = await p.$eval('#encaixe-contagem', (n) => n.textContent);
    assert.match(contagem, /^3 · 3 cóp/, `as três artes tinham que estar na lista (veio "${contagem}")`);

    // A medida sai do dpi gravado (150), não do bitmap: 300 px / (150/2,54) = 5,1 cm.
    const lista = (await p.$eval('#encaixe-pecas-body', (n) => n.innerText)).replace(/\s+/g, ' ');
    assert.match(lista, /5,1 × 6,8 cm/, 'a medida da peça tem que vir do dpi do arquivo');
    assert.match(lista, /4,2 × 4,2 cm/);
    assert.match(lista, /6,8 × 3,4 cm/);

    // ---- 2. a busca roda ----
    await p.evaluate(() => {
      const escrever = (id, valor) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = valor;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      escrever('encaixe-largura', '160');
      escrever('encaixe-espaco', '0.5');
      escrever('encaixe-tempo', '3');
    });
    await esperar(300);

    // "Optmizar" abre o confere; quem manda calcular é o botão de dentro dele.
    await p.evaluate(() => document.getElementById('btn-encaixar').click());
    await esperar(800);
    assert.equal(await p.$eval('#modal-ajustes', (n) => n.classList.contains('hidden')), false,
      'o confere tinha que abrir antes do cálculo');
    await p.evaluate(() => document.getElementById('btn-ajustes-optmizar').click());
    await esperar(18000);

    const stats = (await p.$eval('#encaixe-stats', (n) => n.innerText)).replace(/\s+/g, ' ');
    assert.doesNotMatch(stats, /—\s*Metragem/, `a busca não produziu metragem (veio "${stats}")`);
    assert.match(stats, /\d+,\d+ m/, 'a metragem tinha que aparecer em metros');
    assert.match(stats, /\d+,\d+%/, 'o aproveitamento tinha que aparecer');

    // O risco é desenhado: um canvas do tamanho do rolo, e não o padrão de 300x150.
    const risco = await p.$eval('#encaixe-canvas', (c) => `${c.width}x${c.height}`);
    assert.notEqual(risco, '300x150', 'o risco não foi desenhado');

    // ---- 3. o PDF ----
    await p.evaluate(() => document.getElementById('btn-exportar').click());
    await esperar(600);
    await p.evaluate(() => {
      const item = [...document.querySelectorAll('#menu-exportar-painel .menu-item')]
        .find((b) => /PDF/i.test(b.textContent));
      item.click();
    });
    await esperar(20000);

    const aviso = await p.$eval('#encaixe-error', (n) => (n.classList.contains('hidden') ? '' : n.textContent));
    assert.equal(aviso, '', `a exportação reclamou: ${aviso}`);
    assert.deepEqual(respostasDoPdf, [200], 'o servidor tinha que devolver o PDF');

    assert.equal(problemas.length, 0, 'a tela acusou:\n  ' + problemas.slice(0, 5).join('\n  '));

    console.log(`OK — três artes entraram, o encaixe saiu (${stats.trim()}), o risco foi desenhado`
      + ` (${risco}) e o PDF veio do servidor.`);
  } finally {
    if (navegador) await navegador.close().catch(() => {});
    servidor.kill();
    /*
     * A pasta de dados vai junto: ela é do teste, e o banco dela não interessa
     * a ninguém. A espera antes de apagar não é frescura — o Windows segura o
     * arquivo do SQLite por um instante depois de o processo morrer, e sem ela
     * a faxina estoura com EPERM e derruba uma conferência que PASSOU.
     */
    await esperar(600);
    try { fs.rmSync(pasta, { recursive: true, force: true }); }
    catch { console.log(`conferir-tela: sobrou a pasta ${pasta} (pode apagar).`); }
  }
}

principal().catch((erro) => {
  console.error('conferir-tela: ' + (erro && erro.message ? erro.message : erro));
  process.exit(1);
});
