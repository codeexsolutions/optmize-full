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

const { semearSessao } = require('./sessao-de-teste.cjs');

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

/**
 * Uma arte em TIFF CMYK — o arquivo que o navegador recusa.
 *
 * Mesmo tamanho e mesmo dpi da `peca-a`, para a medida esperada ser a mesma e
 * a conferência não depender de outra conta.
 */
async function arteTiff(pasta) {
  const sharp = require('sharp');
  const arquivo = path.join(pasta, 'peca-d.tif');
  /*
   * O PERFIL É O QUE FAZ O ARQUIVO SER CMYK DE VERDADE.
   *
   * Sem ele o sharp grava o TIFF em RGB, por mais que se peça `cmyk` — e aí a
   * arte serve para provar que o navegador não abre TIFF, mas não para provar
   * nada sobre cor. Com ele, o arquivo tem os quatro canais, e a peça ganha o
   * botão da cor direta.
   *
   * A máquina que não tiver o perfil ainda roda a conferência: o TIFF entra
   * igual, e a parte da cor é pulada em vez de reprovar por um arquivo que
   * falta no Windows.
   */
  const perfil = 'C:/Windows/System32/spool/drivers/color/RSWOP.icm';
  const temPerfil = fs.existsSync(perfil);
  const base = sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 200, g: 60, b: 40 } } });
  await (temPerfil
    ? base.withMetadata({ icc: perfil, density: 150 })
    : base.withMetadata({ density: 150 })
  ).toColourspace('cmyk').tiff().toFile(arquivo);
  return { arquivo, ehCmyk: temPerfil };
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
  /*
   * O painel compilado tem que ser DESTE fonte. O servidor serve o `dist/`, e
   * um `dist/` velho faz esta bancada passar conferindo código que não é mais
   * o de hoje. O build carimba o hash do fonte (ver `empacotar/carimbo.cjs`).
   */
  const { carimboDoFonte } = require('../empacotar/carimbo.cjs');
  let carimbado = null;
  try {
    carimbado = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dist', 'carimbo.json'), 'utf8')).fonte;
  } catch { /* dist de antes do carimbo: tão velho quanto um que não bate */ }
  if (carimbado !== carimboDoFonte(RAIZ)) {
    console.error('conferir-tela: o painel compilado (dist/) não é deste src/ — '
      + 'a tela conferida seria a de outro código. Rode `npm run front` antes.');
    process.exit(1);
  }

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-tela-'));
  // O painel pede conta para abrir: esta bancada entra pelo arquivo de
  // sessão, sem rede. Ver `sessao-de-teste.cjs`.
  semearSessao(pasta);
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

    /*
     * A CAIXA DE "SALVAR COMO", AQUI, É DE MENTIRA.
     *
     * Exportar pergunta onde salvar antes de gerar o arquivo
     * (`escolherOndeSalvar`, no controlador), e `showSaveFilePicker` existe no
     * navegador sem cabeça mas nunca responde — não há tela para a caixa
     * aparecer. Sem isto a conferência ficava esperando para sempre.
     *
     * O destino falso não é um atalho: ele recolhe o que a tela GRAVOU, e é
     * isso que prova a exportação de ponta a ponta. O 200 do servidor, sozinho,
     * não diz se sobrou um PDF de zero byte.
     */
    await p.evaluateOnNewDocument(() => {
      window.__salvo = null;
      window.showSaveFilePicker = async ({ suggestedName }) => ({
        name: suggestedName,
        /*
         * Tem que ser um `WritableStream` de verdade: o PDF vai para o arquivo
         * por `pipeTo`, que não aceita um objeto qualquer com `write`. O
         * `write`/`close` avulsos são os da API real (o
         * `FileSystemWritableFileStream` tem os dois), e é por eles que o PNG,
         * que sai pronto do canvas, é gravado.
         */
        createWritable: async () => {
          const pedacos = [];
          const fluxo = new WritableStream({
            write(d) { pedacos.push(d); },
            async close() {
              const blob = new Blob(pedacos);
              window.__salvo = { nome: suggestedName, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
            },
          });
          let escritor = null;
          fluxo.write = async (d) => {
            escritor = escritor || fluxo.getWriter();
            await escritor.write(d);
          };
          fluxo.close = async () => { if (escritor) await escritor.close(); };
          return fluxo;
        },
      });
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

    // Exportar não é para funcionar antes de existir encaixe: o menu dele só
    // tem saídas para um risco, e não há risco nenhum ainda.
    assert.equal(await p.$eval('#btn-exportar', (n) => n.disabled), true,
      'o Exportar tinha que estar apagado antes do encaixe');

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

    // A segunda trava rodou e passou: a conferência pela arte, que pinta cada
    // par de vizinhas como o PDF as pinta (ver `conferenciaDaArte.js`). Sem
    // ela o Exportar não acende — o PDF logo abaixo depende disto.
    const resumo = await p.$eval('#encaixe-andamento', (n) => n.textContent);
    assert.match(resumo, /conferido pela arte/, `a conferência pela arte não apareceu no resumo (veio "${resumo}")`);

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

    assert.equal(await p.$eval('#btn-exportar', (n) => n.disabled), false,
      'com o risco na tela, o Exportar tinha que estar aceso');

    // O que a tela escreveu no arquivo que a pessoa escolheu.
    const salvo = await p.evaluate(() => window.__salvo);
    assert.ok(salvo, 'a tela não gravou o PDF no destino escolhido');
    assert.match(salvo.nome, /^encaixe-\d+,\d+m\.pdf$/, `nome sugerido estranho: ${salvo.nome}`);
    // Cor chapada comprime muito bem: tamanho em bytes não prova que há arte.
    // O leitor precisa encontrar os três desenhos, com seus pixels originais.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const leituraPdf = pdfjs.getDocument({ data: Uint8Array.from(salvo.bytes) });
    const pdf = await leituraPdf.promise;
    try {
      assert.equal(pdf.numPages, 1);
      const pagina = await pdf.getPage(1);
      const operadores = await pagina.getOperatorList();
      const imagens = operadores.fnArray.flatMap((op, i) => op === pdfjs.OPS.paintImageXObject
        ? [operadores.argsArray[i].slice(1, 3).sort((a, b) => a - b).join('x')] : []);
      assert.deepEqual(imagens.sort(), ['200x400', '250x250', '300x400'],
        'o PDF deve desenhar as três artes na resolução original, mesmo quando giradas');

      /*
       * A ARTE SAI NO TAMANHO DO ARQUIVO, E NÃO NO ARREDONDADO.
       *
       * A medida da peça era arredondada para 0,1 cm na entrada, e o PDF
       * imprimia a arte nela: a de 300 px a 150 dpi (5,080 cm) saía com 5,1, a
       * de 400 px (6,773 cm) com 6,8 — cada lado errando para um lado. A
       * medida no PDF é a da matriz que desenha a imagem.
       */
      let matriz = null;
      const desenhadas = [];
      operadores.fnArray.forEach((op, i) => {
        if (op === pdfjs.OPS.transform) matriz = operadores.argsArray[i];
        if (op !== pdfjs.OPS.paintImageXObject || !matriz) return;
        const [a, b, c, d] = matriz;
        const [px1, px2] = operadores.argsArray[i].slice(1, 3);
        desenhadas.push({ px: [px1, px2], cm: [Math.hypot(a, b), Math.hypot(c, d)].map((pt) => pt * 2.54 / 72) });
      });
      for (const { px, cm } of desenhadas) {
        const esperado = px.map((n) => (n / 150) * 2.54);
        for (let k = 0; k < 2; k++) {
          assert.ok(Math.abs(cm[k] - esperado[k]) < 0.001,
            `a arte de ${px.join('x')} px saiu com ${cm.map((v) => v.toFixed(4)).join(' × ')} cm no PDF; `
            + `o arquivo tem ${esperado.map((v) => v.toFixed(4)).join(' × ')} cm`);
        }
      }
    } finally { await leituraPdf.destroy(); }

    const recado = await p.$eval('#encaixe-andamento', (n) => n.textContent);
    assert.match(recado, /^Salvo: encaixe-/, `a tela tinha que confirmar o arquivo (veio "${recado}")`);

    /*
     * ---- 4. o Complementar ----
     *
     * Com o encaixe na tela, o Optmizar vira Complementar. O caminho inteiro:
     * uma arte miúda guardada na Galeria (pela API, como a tela de Projetos
     * guarda), a procura acha que ela cabe nos vãos, o complemento a põe na
     * lista e no risco sem sobrepor nada, e o Desfazer devolve tudo como era —
     * que é o que deixa os passos seguintes conferirem a lista de três artes.
     */
    assert.equal(await p.$eval('#btn-encaixar', (n) => n.textContent.trim()), 'Complementar',
      'com o encaixe na tela, o Optmizar tinha que virar Complementar');

    const pngDaGaleria = Array.from(await require('sharp')({
      create: { width: 60, height: 60, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } },
    }).png().toBuffer());
    const guardou = await p.evaluate(async (bytes) => {
      const json = { 'content-type': 'application/json' };
      const cliente = await (await fetch('/api/projetos/clientes', {
        method: 'POST', headers: json, body: JSON.stringify({ nome: 'Cliente de teste' }),
      })).json();
      const projeto = await (await fetch('/api/projetos', {
        method: 'POST', headers: json, body: JSON.stringify({ clienteId: cliente.id, nome: 'Sobras' }),
      })).json();
      const subida = await (await fetch(`/api/projetos/${projeto.id}/imagem`, {
        method: 'POST', body: new Uint8Array(bytes),
      })).json();
      await fetch(`/api/projetos/${projeto.id}`, {
        method: 'PUT', headers: json,
        body: JSON.stringify({ nome: 'Sobras', pecas: [{ nome: 'manguito', arquivo: subida.arquivo, largura: 1, altura: 1 }] }),
      });
      return (await (await fetch('/api/projetos/galeria/artes')).json()).artes.length;
    }, pngDaGaleria);
    assert.equal(guardou, 1, 'a Galeria tinha que listar a arte guardada');

    await p.evaluate(() => document.getElementById('btn-encaixar').click());
    await esperar(500);
    assert.equal(await p.$eval('#modal-complemento', (n) => n.classList.contains('hidden')), false,
      'o Complementar tinha que abrir a caixa do complemento');

    await p.evaluate(() => document.getElementById('btn-complemento-procurar').click());
    await esperar(10000);
    // A linha não diz mais "cabem N" (ver `mostrarCandidatos`): só entra na
    // lista o que cabe, e a conta vira a quantidade que o campo já traz.
    const achados = await p.$$eval('#complemento-lista .complemento-item', (ns) => ns.map((n) => {
      const campo = n.querySelector('input[type="number"]');
      return `${n.innerText.replace(/\s+/g, ' ')} [${campo ? campo.value : '-'}]`;
    }));
    const estadoDaProcura = await p.$eval('#complemento-estado', (n) => n.textContent);
    assert.ok(achados.some((l) => /manguito/.test(l) && /\[[1-9]\d*\]$/.test(l)),
      `a arte da Galeria tinha que caber nos vãos (lista: ${achados.join(' / ')} · ${estadoDaProcura})`);

    // O Complementar põe a arte na lista e refaz o encaixe inteiro (ver
    // `complementarOtimizando`): a caixa fecha e o Optmizar roda de novo, com
    // os mesmos 3 s do primeiro.
    await p.evaluate(() => document.getElementById('btn-complemento-aplicar').click());
    await esperar(18000);
    assert.match(await p.$eval('#encaixe-contagem', (n) => n.textContent), /^4 · /,
      'a arte da Galeria tinha que entrar na lista como a quarta peça');
    // O guarda da sobreposição roda em todo risco novo: aceso é sem peça em cima de peça.
    assert.equal(await p.$eval('#btn-exportar', (n) => n.disabled), false,
      'o risco complementado não pode ter peça sobreposta');

    await p.evaluate(() => document.getElementById('btn-complemento-desfazer').click());
    await esperar(800);
    assert.match(await p.$eval('#encaixe-contagem', (n) => n.textContent), /^3 · 3 cóp/,
      'o Desfazer tinha que devolver a lista de antes');
    await p.evaluate(() => document.getElementById('btn-fechar-complemento').click());
    await esperar(400);

    /*
     * ---- 5. o TIFF, que o navegador não abre ----
     *
     * Fica por ÚLTIMO de propósito: uma quarta peça mexeria na metragem e no
     * aproveitamento conferidos acima. O que se prova aqui é o caminho — um
     * arquivo que o `<img>` recusa entra assim mesmo, com a medida que o dpi
     * dele manda, porque o servidor o converte antes (ver `arte-entrada.js`).
     */
    const tiff = await arteTiff(pasta);
    await (await p.$('#encaixe-files')).uploadFile(tiff.arquivo);
    // A lista já tem peças, e o Encaixe NÃO pergunta de qual pedido é o
    // arquivo: ele entra no pedido do último lote. Nenhuma caixa do `Alerta`
    // (src/casca/Alerta.tsx) pode aparecer no caminho.
    await esperar(8000);
    assert.equal(await p.$('.alerta-caixa[role="alertdialog"]'), null,
      'o arquivo tinha que entrar sem a pergunta do pedido');

    const comTiff = await p.$eval('#encaixe-contagem', (n) => n.textContent);
    assert.match(comTiff, /^4 · 4 cóp/, `o TIFF tinha que entrar como a quarta arte (veio "${comTiff}")`);

    // 300 px a 150 dpi = 5,1 cm; 400 px = 6,8 cm. A medida sai do dpi do TIFF,
    // que tem que sobreviver à conversão no servidor.
    const linhaDoTiff = (await p.$eval('#encaixe-pecas-body', (n) => n.innerText))
      .split('\n').map((l) => l.trim()).join(' | ');
    assert.match(linhaDoTiff, /peca-d[^|]*\|[^|]*5,1 × 6,8 cm/,
      `o TIFF tinha que entrar com a medida que o dpi dele manda (veio "${linhaDoTiff}")`);

    /*
     * ---- 6. a cor direta, do jeito do Corel ----
     *
     * O TIFF que acabou de entrar veio de CMYK, então ele é a peça que ganha o
     * botão. O que se confere aqui é o CAMINHO inteiro: o clique manda a arte
     * de volta ao servidor, ela volta convertida pela conta do Corel, e a peça
     * troca de arte sem perder o que é dela.
     *
     * O preto é conferido nos PIXELS, e não no rótulo do botão: a arte de
     * teste é escura, e pela travessia do perfil ela volta lavada. Se o clique
     * não tivesse efeito nenhum, o rótulo mudaria do mesmo jeito.
     */
    if (!tiff.ehCmyk) {
      console.log('  (sem o perfil de impressão nesta máquina: a cor direta foi pulada)');
    } else {
      // A gaveta da peça abre primeiro: o botão mora dentro dela, e texto
      // escondido não aparece no `innerText`.
      await p.evaluate(() => {
        const setas = [...document.querySelectorAll('[data-abrir-peca]')];
        setas[setas.length - 1].click();
      });
      await esperar(400);
      assert.match(await p.$eval('#encaixe-pecas-body', (n) => n.innerText), /Cor direta/,
        'a peça que veio de CMYK tinha que oferecer a cor direta');

      await p.evaluate(() => {
        const botoes = [...document.querySelectorAll('[data-cor-direta]')];
        botoes[botoes.length - 1].click();
      });
      await esperar(8000);

      const ligada = await p.evaluate(() => {
        const botoes = [...document.querySelectorAll('[data-cor-direta]')];
        const ultimo = botoes[botoes.length - 1];
        return ultimo ? ultimo.getAttribute('aria-pressed') : null;
      });
      assert.equal(ligada, 'true', 'o botão da cor direta tinha que ficar ligado');

      // E a peça continua sendo a mesma peça: a medida não se mexe quando o
      // que muda é a cor.
      const listaDepois = (await p.$eval('#encaixe-pecas-body', (n) => n.innerText))
        .split(/\r?\n/).map((l) => l.trim()).join(' | ');
      assert.match(listaDepois, /peca-d[^|]*\|[^|]*5,1 × 6,8 cm/,
        `a medida da peça não podia mudar com a cor (veio "${listaDepois}")`);
    }

    /*
     * ---- 7. o × tira a peça da lista ----
     *
     * O botão mora DENTRO da linha que marca a peça, e a linha tem ouvinte
     * próprio. Isso já deixou o × sem efeito nenhum: o clique era engolido pelo
     * guarda da linha e o código que tira a peça ficava inalcançável. Um clique
     * de verdade é a única coisa que pega isso — o `tsc` passa, o build passa,
     * e a peça continua na tela.
     */
    const antesDoX = Number((await p.$eval('#encaixe-contagem', (n) => n.textContent)).match(/^\d+/)[0]);
    await p.evaluate(() => document.querySelector('[data-del-peca]').click());
    await esperar(600);
    const depoisDoX = Number((await p.$eval('#encaixe-contagem', (n) => n.textContent)).match(/^\d+/)[0]);
    assert.equal(depoisDoX, antesDoX - 1,
      `o × tinha que tirar a peça da lista (eram ${antesDoX}, ficaram ${depoisDoX})`);

    /*
     * ---- 8. arquivo que chega com o Optmizar rodando vai para a fila ----
     *
     * Antes era a janela "Aguarde o trabalho atual terminar" e o arquivo se
     * perdia. Agora ele espera na fila, um toast no canto conta, e ele entra
     * sozinho quando a busca acaba — sem janela nenhuma no caminho.
     */
    // Com três peças pequenas a busca de 3 s desiste em pouco mais de um
    // segundo (ela para depois de um quarto do tempo sem ganho). Com 10 s ela
    // roda pelo menos 2,5 s — folga de sobra para o arquivo chegar no meio.
    await p.evaluate(() => {
      const tempo = document.getElementById('encaixe-tempo');
      tempo.value = '10';
      tempo.dispatchEvent(new Event('input', { bubbles: true }));
      tempo.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('btn-ajustes-optmizar').click();
    });
    await esperar(300);
    await (await p.$('#encaixe-files')).uploadFile(artes[1]);
    await esperar(300);
    const janela = () => p.$eval('.alerta-caixa[role="alertdialog"]', (n) => n.innerText.replace(/\s+/g, ' '))
      .catch(() => null);
    assert.equal(await janela(), null, 'o arquivo durante o Optmizar não pode abrir janela');
    const toastDaFila = await p.$eval('.alerta-toast', (n) => n.innerText).catch(() => '');
    // O toast é a prova de que o arquivo foi para a fila, e não direto para a lista.
    assert.match(toastDaFila, /na fila/, `o toast da fila não apareceu (veio "${toastDaFila}")`);
    await esperar(25000);
    const depoisDaFila = Number((await p.$eval('#encaixe-contagem', (n) => n.textContent)).match(/^\d+/)[0]);
    assert.equal(depoisDaFila, depoisDoX + 1,
      `o arquivo da fila tinha que entrar quando a busca acabou (eram ${depoisDoX}, ficaram ${depoisDaFila})`);
    assert.equal(await janela(), null, 'a fila não pode terminar em janela');

    /*
     * ---- 9. TIFF arrastado SEM tipo também entra ----
     *
     * O arrastar filtrava pelo tipo que o sistema dá ao arquivo (`image/...`),
     * e numa máquina em que o Windows não conhece o .tif o tipo vem vazio: o
     * arquivo sumia em silêncio, sem janela e sem linha. O seletor de arquivos
     * aceitava o mesmo TIFF, porque ele olha a extensão.
     */
    const bytesDoTiff = Array.from(fs.readFileSync(tiff.arquivo));
    await p.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], 'peca-sem-tipo.tif', { type: '' }));
      document.querySelector('.page[data-page="encaixe"]').dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, bytesDoTiff);
    await esperar(8000);
    const depoisDoArraste = Number((await p.$eval('#encaixe-contagem', (n) => n.textContent)).match(/^\d+/)[0]);
    assert.equal(depoisDoArraste, depoisDaFila + 1,
      `o TIFF arrastado sem tipo tinha que entrar (eram ${depoisDaFila}, ficaram ${depoisDoArraste})`);

    /*
     * ---- 10. a mesma quantidade em várias peças de uma vez ----
     *
     * Cliente manda 50 artes, 40 de cada: digitar 40 em cinquenta linhas era o
     * jeito. Sem nada marcado, "Qtd de cada" vale para a lista inteira; com
     * linhas marcadas, só para elas. "Marcar todas" fica na barra da seleção.
     */
    const contar = () => p.$eval('#encaixe-contagem', (n) => n.textContent.trim());
    const botaoQtd = () => p.$eval('#btn-encaixe-qtd-todas', (n) => n.textContent.trim());
    const aplicarQtd = (n) => p.evaluate((valor) => {
      const campo = document.getElementById('encaixe-qtd-todas');
      campo.value = String(valor);
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btn-encaixe-qtd-todas').click();
    }, n);
    const linhasNaLista = depoisDoArraste;

    assert.equal(await botaoQtd(), `Aplicar em todas (${linhasNaLista})`);
    await aplicarQtd(4);
    await esperar(300);
    assert.match(await contar(), new RegExp(`^${linhasNaLista} · ${linhasNaLista * 4} cóp`),
      `sem nada marcado, a quantidade tinha que ir para todas (veio "${await contar()}")`);

    await p.evaluate(() => document.querySelector('[data-sel-peca]').click());
    await esperar(300);
    assert.equal(await botaoQtd(), 'Aplicar na marcada');
    await aplicarQtd(2);
    await esperar(300);
    assert.match(await contar(), new RegExp(`^${linhasNaLista} · ${(linhasNaLista - 1) * 4 + 2} cóp`),
      `com uma marcada, só ela tinha que mudar (veio "${await contar()}")`);

    await p.evaluate(() => document.getElementById('btn-encaixe-marcar-todas').click());
    await esperar(300);
    assert.equal(await botaoQtd(), `Aplicar nas ${linhasNaLista} marcadas`);
    assert.match(await p.$eval('#encaixe-grupo-conta', (n) => n.textContent), new RegExp(`^${linhasNaLista} peças marcadas`));

    /*
     * ---- 11. o Digitalizar abre TIFF ----
     *
     * Ele lia a imagem direto no navegador, que não abre TIFF: a foto do molde
     * em .tif era recusada pelo nome. Agora passa pela mesma conversão do
     * Encaixe (`prepararArteParaONavegador`).
     */
    // Uma peça escura na mesa branca: o Digitalizar procura o contorno logo
    // que abre, e a arte chapada do Encaixe não tem contorno nenhum para achar.
    const fotoDoMolde = path.join(pasta, 'molde-na-mesa.tif');
    await require('sharp')({ create: { width: 600, height: 400, channels: 3, background: { r: 245, g: 245, b: 240 } } })
      .composite([{
        input: await require('sharp')({ create: { width: 300, height: 200, channels: 3, background: { r: 30, g: 30, b: 40 } } }).png().toBuffer(),
        left: 150, top: 100,
      }])
      .withMetadata({ density: 150 }).tiff().toFile(fotoDoMolde);
    await p.goto(`http://127.0.0.1:${porta}/digitalizar`, { waitUntil: 'networkidle2' });
    await esperar(800);
    await (await p.$('#digitalizar-imagem')).uploadFile(fotoDoMolde);
    await esperar(5000);
    assert.equal(await janela(), null, 'o TIFF no Digitalizar não pode abrir janela de erro');
    assert.ok(await p.$('#digitalizar-tela'), 'o Digitalizar tinha que abrir o TIFF');

    /*
     * ---- 12. o projeto da Galeria aceita TIFF ----
     *
     * A arte da peça só entrava em PNG, JPG ou WEBP. O TIFF é convertido antes
     * de subir — o servidor guarda o convertido, que depois entra no Encaixe
     * sem conversão — e a medida sai do dpi dele: 300 × 400 px a 150 dpi.
     */
    await p.goto(`http://127.0.0.1:${porta}/projetos`, { waitUntil: 'networkidle2' });
    await esperar(900);
    const clicarNoTexto = (texto) => p.evaluate((t) => {
      const alvo = [...document.querySelectorAll('button, [role="button"], a')]
        .find((n) => n.textContent.trim().startsWith(t));
      if (alvo) alvo.click();
      return !!alvo;
    }, texto);
    assert.ok(await clicarNoTexto('Cliente de teste'), 'a Galeria tinha que listar o cliente do teste');
    await esperar(600);
    assert.ok(await clicarNoTexto('Sobras'), 'a Galeria tinha que listar o projeto do teste');
    await esperar(1200);
    await p.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], 'peca-d.tif', { type: 'image/tiff' }));
      const miniatura = document.querySelector('button[title^="Trocar a arte de"], button[title^="Anexar a arte de"]');
      miniatura.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, bytesDoTiff);
    await esperar(5000);
    assert.equal(await janela(), null, 'o TIFF no projeto não pode abrir janela de erro');
    const medidaNoProjeto = await p.evaluate(() => [
      document.querySelector('input[aria-label="Largura em cm"]'),
      document.querySelector('input[aria-label="Altura em cm"]'),
    ].map((n) => (n ? n.value : null)));
    assert.deepEqual(medidaNoProjeto, ['5.08', '6.77'],
      `a arte TIFF tinha que entrar no projeto com 5,08 × 6,77 cm (veio ${medidaNoProjeto.join(' × ')})`);

    /*
     * ---- 13. o molde graduado: o PLT com o .adsx do mesmo modelo ----
     *
     * O PLT da Audaces traz o contorno de cada tamanho; o .adsx (um ZIP com o
     * data.xml) diz a medida de cada peça em cada tamanho, e é por ela que os
     * contornos são casados. Aqui: frente e costas sobrepostas em 4 tamanhos e
     * um bolso que não muda. A conferência tem de mostrar as 3 peças, e criar
     * tem de abrir a Montagem com a grade P/M/G/GG.
     */
    const PLU = 400;
    const grade = ['P', 'M', 'G', 'GG'];
    const contornos = [];
    for (let k = 0; k < 4; k++) {
      const W = 20 + k;
      const Hf = 30 + k;
      const Hc = 32 + k;
      contornos.push([[0, 0], [W, 0], [W, Hf], [0, Hf], [0, Hf * 0.6], [3, Hf * 0.5], [0, Hf * 0.4]]);
      contornos.push([[0, 0], [W, 0], [W, Hc * 0.4], [W - 3, Hc * 0.5], [W, Hc * 0.6], [W, Hc], [0, Hc]]);
    }
    contornos.push([[50, 0], [60, 0], [60, 10], [50, 10]]);
    let plt = 'IN;SP1;';
    for (const c of contornos) {
      const pts = [...c, c[0]].map(([x, y]) => `${Math.round(x * PLU)},${Math.round(y * PLU)}`);
      plt += `PU${pts[0]};PD ${pts.slice(1).join(' ')};`;
    }
    const arquivoPlt = path.join(pasta, 'ARD.TESTE.plt');
    fs.writeFileSync(arquivoPlt, plt, 'latin1');

    const medida = (nome, w, h) => `<SIZE_P NAME_SP="${nome}"><WIDTH_SP>${w}</WIDTH_SP><HEIGHT_SP>${h}</HEIGHT_SP></SIZE_P>`;
    const peca = (nome, f) => `<PATTERN NAME_P="${nome}"><DESC_P> </DESC_P><QT_MOD>1</QT_MOD><SIZES_P><BASE_NAME>"M"</BASE_NAME>${grade.map((t, k) => medida(t, ...f(k))).join('')}</SIZES_P></PATTERN>`;
    const dataXml = `<?xml version="1.0" encoding="iso-8859-1"?><DATA_FILE_AUDACES><MODEL NAME_M="ARD.TESTE"><SIZES_M>${grade.map((t) => `<SIZE_M NAME_SP="${t}"></SIZE_M>`).join('')}</SIZES_M><PATTERNS>`
      + peca('FRENTE', (k) => [20 + k, 30 + k]) + peca('COSTAS', (k) => [20 + k, 32 + k]) + peca('BOLSO2X', () => [10, 10])
      + '</PATTERNS></MODEL></DATA_FILE_AUDACES>';
    const zlib = require('node:zlib');
    const dados = Buffer.from(dataXml, 'latin1');
    const comprimido = zlib.deflateRawSync(dados);
    const nomeZip = Buffer.from('data.xml');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(nomeZip.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(dados.length, 24); central.writeUInt16LE(nomeZip.length, 28); central.writeUInt32LE(0, 42);
    const fimZip = Buffer.alloc(22);
    fimZip.writeUInt32LE(0x06054b50, 0); fimZip.writeUInt16LE(1, 8); fimZip.writeUInt16LE(1, 10);
    fimZip.writeUInt32LE(46 + nomeZip.length, 12); fimZip.writeUInt32LE(30 + nomeZip.length + comprimido.length, 16);
    const arquivoAdsx = path.join(pasta, 'ARD.TESTE.adsx');
    fs.writeFileSync(arquivoAdsx, Buffer.concat([local, nomeZip, comprimido, central, nomeZip, fimZip]));

    await p.goto(`http://127.0.0.1:${porta}/moldes`, { waitUntil: 'networkidle2' });
    await esperar(900);
    await (await p.$('input[aria-label="Arquivos do molde graduado"]')).uploadFile(arquivoPlt, arquivoAdsx);
    await esperar(2500);
    const naConferencia = await p.$$eval('ul[aria-label="As peças"] li', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ')));
    assert.equal(naConferencia.length, 3, `a conferência tinha que mostrar 3 peças (veio: ${naConferencia.join(' / ')})`);
    assert.ok(naConferencia.some((l) => /BOLSO ×2/.test(l)), `o bolso com a quantidade do nome (veio: ${naConferencia.join(' / ')})`);
    assert.ok(naConferencia.every((l) => /4 tamanhos/.test(l)), `toda peça com os 4 tamanhos (veio: ${naConferencia.join(' / ')})`);
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar molde').click());
    await esperar(3000);
    assert.match(p.url(), /\/montagem\?molde=\d+/, `criar tinha que abrir a Montagem (está em ${p.url()})`);
    const chips = await p.evaluate(() => document.body.innerText);
    for (const t of grade) assert.ok(new RegExp(`\\b${t}\\b`).test(chips), `a Montagem tinha que mostrar o tamanho ${t}`);
    assert.equal(await janela(), null, 'importar o graduado não pode abrir janela de erro');

    assert.equal(problemas.length, 0, 'a tela acusou:\n  ' + problemas.slice(0, 5).join('\n  '));

    console.log(`OK — três artes entraram, o encaixe saiu (${stats.trim()}), o risco foi desenhado`
      + ` (${risco}), o PDF foi gravado onde a tela mandou, o complemento pôs a arte da Galeria`
      + ` nos vãos e desfez, o TIFF entrou pela conversão`
      + `, o × tirou a peça (${antesDoX} → ${depoisDoX})`
      + `, o arquivo da fila entrou depois da busca (${depoisDoX} → ${depoisDaFila})`
      + `, o TIFF arrastado sem tipo entrou (${depoisDaFila} → ${depoisDoArraste})`
      + ', a quantidade foi para todas, para a marcada e o "Marcar todas" marcou,'
      + ', o TIFF abriu no Digitalizar e entrou no projeto da Galeria,'
      + ' e o PLT graduado com o .adsx virou um molde de 3 peças em P/M/G/GG.');
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
