/**
 * ===========================================================================
 * O MOLDE DA IMAGEM — peças claras em mesa escura, várias por foto
 * ===========================================================================
 *
 * A tela Digitalizar recebe a foto dos moldes na mesa e devolve o risco de
 * cada peça. Esta bancada guarda as quatro coisas que essa promessa quer
 * dizer — e a primeira delas existe porque JÁ FALHOU em produção.
 *
 * ---------------------------------------------------------------------------
 * 1. FUNDO ESCURO — o erro que a primeira versão cometeu inteiro
 * ---------------------------------------------------------------------------
 *
 * A primeira versão reaproveitava o `silhuetaDeDados` do Encaixe, que foi
 * feito para ARTE: desenho escuro sobre folha branca. Ele desiste quando o
 * fundo não é claro. Na mesa do laser é o contrário — molde de papel kraft
 * CLARO sobre a esteira ESCURA — e a tela respondia "não consegui separar o
 * molde do fundo" em TODAS as fotos da fábrica.
 *
 * Nada apontou isso: o `tsc` passou, o build passou, e a bancada da época
 * passava porque o desenho de teste era escuro sobre claro, como a arte. Ou
 * seja: a conferência confirmava a suposição errada em vez de testá-la.
 *
 * Por isso a foto desta bancada é o caso da fábrica, e não o confortável:
 * peças CLARAS sobre fundo ESCURO. Se alguém voltar a supor que o fundo é
 * claro, aqui reprova na primeira linha.
 *
 * ---------------------------------------------------------------------------
 * 2. VÁRIAS PEÇAS — a segunda suposição errada
 * ---------------------------------------------------------------------------
 *
 * A primeira versão ficava só com a maior mancha e descartava o resto. Mas
 * quem digitaliza espalha o molde inteiro na mesa e fotografa uma vez: as
 * fotos de verdade têm de uma a nove peças. Duas peças na foto do teste, duas
 * peças na tabela.
 *
 * ---------------------------------------------------------------------------
 * 3. O RISCO É CÔNCAVO, E É CURVA COM POUCOS NÓS
 * ---------------------------------------------------------------------------
 *
 * Cava de manga, decote e entrepernas são côncavos, e é por eles que o encaixe
 * economiza tecido. O caminho mais natural para quem mexer no motor é fechar
 * um casco convexo (é o que o `moldeDoArquivoInteiro` faz, e lá está certo);
 * aqui isso tapa os três e devolve a peça como um retângulo arredondado.
 *
 * E é silencioso: a peça continua entrando, com a caixa do mesmo tamanho e a
 * medida que a pessoa digitou. O que muda é só o metro de tecido, meses
 * depois. Por isso a conferência compara a ÁREA do risco com a do casco
 * convexo dele, em vez de olhar a caixa.
 *
 * ---------------------------------------------------------------------------
 * 4. UMA MEDIDA CALIBRA TODAS, E AS DUAS SAÍDAS SAEM EM CENTÍMETRO
 * ---------------------------------------------------------------------------
 *
 * Mede-se uma peça e a outra sai junto, na proporção certa.
 *
 * No SVG, o `cm` no `width`/`height` é o que faz qualquer editor abrir o risco
 * na medida certa; sem ele, vira pixel a 96 dpi e o molde encolhe sem avisar.
 *
 * No PDF, a página tem que ter o TAMANHO DO DESENHO, porque ele existe para
 * ser impresso e servir de gabarito. Se um dia alguém trocar isso por um
 * formato de papel, o gabarito passa a sair reduzido e o erro só aparece com o
 * papel na mão — por isso a conferência lê o MediaBox e confere os centímetros.
 *
 * ---------------------------------------------------------------------------
 * 5. O DELETE APAGA NÓ, E O BACKSPACE NO CAMPO DA MEDIDA NÃO
 * ---------------------------------------------------------------------------
 *
 * Clicar num nó marca; Delete e Backspace apagam o marcado. A armadilha mora
 * no Backspace: é a tecla que a pessoa usa para corrigir a MEDIDA, e sem a
 * conferência do campo em foco, apagar um dígito errado apagaria também um nó
 * do molde. Seria um estrago silencioso — o traço muda longe de onde ela está
 * olhando, e ela só descobriria no papel cortado.
 *
 * Por isso a conferência faz as duas: apaga pela tecla, e depois digita no
 * campo da medida e confere que a contagem de nós NÃO mudou.
 *
 * Roda com `npm run bancada:molde-imagem`. Precisa do Chrome do Puppeteer;
 * sem ele, avisa e sai sem reprovar.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const ALTURA_CM = 68;

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
 * A foto do teste, imitando a mesa do laser.
 *
 * DUAS peças de papel CLARO sobre fundo ESCURO — ver os pontos 1 e 2 do
 * cabeçalho: as duas escolhas existem porque as duas já estiveram erradas.
 *
 * As formas têm côncavos de propósito (decote fundo entre os ombros, cavas
 * debaixo das mangas). Numa forma convexa — um retângulo, um círculo — a
 * conferência da área não provaria nada, porque a peça e o casco dela seriam
 * a mesma coisa.
 *
 * As duas ficam bem afastadas: peça encostada em peça vira uma mancha só, e
 * isso é limitação conhecida do motor, não o que esta bancada mede.
 */
function fotoDeTeste(pasta) {
  const sharp = require('sharp');
  const arquivo = path.join(pasta, 'mesa-de-teste.png');
  const camisa = (dx, dy, escala) => `
    <path transform='translate(${dx},${dy}) scale(${escala})'
          d='M 300 120 C 340 190, 560 190, 600 120
             L 760 190 C 800 210, 810 300, 780 330
             L 690 300 C 700 520, 700 820, 700 980
             L 200 980 C 200 820, 200 520, 210 300
             L 120 330 C 90 300, 100 210, 140 190 Z'
          fill='#e8e2d4'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1100'>
    <rect width='1600' height='1100' fill='#232a30'/>
    ${camisa(40, 60, 0.95)}
    ${camisa(820, 60, 0.95)}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toFile(arquivo).then(() => arquivo);
}

/** Um ponto da cúbica em `t`. */
function naCurva(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Cada `<path>` do SVG achatado numa poligonal.
 *
 * O risco sai em CURVAS (`M` seguido de vários `C`), então não dá para ler as
 * coordenadas soltas: metade delas são alças, que ficam FORA do traço. Somar
 * alça com nó daria uma área errada, e é da área que sai a conferência do
 * côncavo — então cada cúbica é percorrida de verdade.
 */
function pecasDoSvg(svg) {
  return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => {
    const d = m[1];
    const inicio = /M\s*(-?[\d.]+)\s+(-?[\d.]+)/.exec(d);
    if (!inicio) return [];
    let atual = { x: Number(inicio[1]), y: Number(inicio[2]) };
    const saida = [atual];
    const curvas = [...d.matchAll(
      /C\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/g,
    )];
    for (const c of curvas) {
      const p1 = { x: Number(c[1]), y: Number(c[2]) };
      const p2 = { x: Number(c[3]), y: Number(c[4]) };
      const p3 = { x: Number(c[5]), y: Number(c[6]) };
      for (let k = 1; k <= 8; k++) saida.push(naCurva(atual, p1, p2, p3, k / 8));
      atual = p3;
    }
    return saida;
  });
}

/** Quantos nós tem cada `<path>` (um `M` mais um `C` por trecho). */
function nosDoSvg(svg) {
  return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)]
    .map((m) => (m[1].match(/C/g) || []).length);
}

/** A área que um contorno fecha (fórmula do laço). */
function area(pontos) {
  let soma = 0;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    soma += (pontos[j].x + pontos[i].x) * (pontos[j].y - pontos[i].y);
  }
  return Math.abs(soma / 2);
}

/** Casco convexo (monotone chain) — a volta mais apertada em torno de tudo. */
function casco(pontos) {
  if (pontos.length < 3) return pontos;
  const ordem = [...pontos].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cruz = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const meio = [];
  for (const p of ordem) {
    while (meio.length >= 2 && cruz(meio[meio.length - 2], meio[meio.length - 1], p) <= 0) meio.pop();
    meio.push(p);
  }
  const volta = [];
  for (let i = ordem.length - 1; i >= 0; i--) {
    const p = ordem[i];
    while (volta.length >= 2 && cruz(volta[volta.length - 2], volta[volta.length - 1], p) <= 0) volta.pop();
    volta.push(p);
  }
  meio.pop();
  volta.pop();
  return meio.concat(volta);
}

async function principal() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.log('conferir-molde-da-imagem: sem Puppeteer nesta máquina — pulando (não é reprovação).');
    return;
  }

  if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
    console.error('conferir-molde-da-imagem: falta o painel compilado. Rode `npm run front` antes.');
    process.exit(1);
  }

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-molde-'));
  const porta = await portaLivre();
  const servidor = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'server.js')], {
    env: { ...process.env, PORT: String(porta), OPTIMIZE_DADOS: pasta },
    stdio: 'ignore',
  });

  let navegador = null;
  try {
    if (!await esperarServidor(porta)) throw new Error('o servidor não subiu.');

    navegador = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const p = await navegador.newPage();
    await p.setViewport({ width: 1400, height: 950 });

    const problemas = [];
    p.on('pageerror', (e) => problemas.push('erro de página: ' + e.message));

    await p.goto(`http://127.0.0.1:${porta}/digitalizar`, { waitUntil: 'networkidle2' });

    const arquivo = await fotoDeTeste(pasta);
    const entrada = await p.$('#digitalizar-imagem');
    assert.ok(
      entrada,
      'não achei o campo de arquivo da tela Digitalizar (#digitalizar-imagem).'
      + ' O id importa: a tela de Encaixe fica montada o tempo todo (ver rotas.ts), então um'
      + ' `input[type=file]` solto pega o campo DELA e o arquivo some sem erro nenhum.',
    );
    await entrada.uploadFile(arquivo);

    await p.waitForFunction(
      () => /Achei \d+ peça|Não consegui|Não achei|O que achei/.test(document.body.innerText || ''),
      { timeout: 60000 },
    ).catch(() => { throw new Error('a tela não respondeu nada em 60 s.'); });

    const texto = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

    // ---- 1 e 2. Peças claras em fundo escuro, e as DUAS ----
    const t = await texto();
    const achei = /Achei (\d+) peça/.exec(t);
    assert.ok(
      achei,
      'a tela não achou peça nenhuma numa foto de moldes CLAROS sobre fundo ESCURO.'
      + ' É exatamente o caso da mesa do laser, e foi assim que a primeira versão falhou em'
      + ` produção — ver o cabeçalho desta bancada. A tela diz: "${t.slice(0, 240)}"`,
    );
    assert.equal(
      achei[1], '2',
      `a foto tem DUAS peças bem separadas e a tela achou ${achei[1]}.`
      + ' Duas causas dão este mesmo número, e vale olhar as duas:'
      + ' (a) o motor voltou a ficar só com a maior mancha e descartou o resto; ou'
      + ' (b) a polaridade inverteu — o fundo escuro foi tomado por peça, e aí a mesa inteira'
      + ' vira uma mancha só. Quem decide a polaridade é a borda da imagem, em `mascaraDasPecas`.',
    );

    // ---- 4. Uma medida calibra todas ----
    // A medida entra pelo TECLADO, e não por `value` na mão: é assim que a
    // fábrica digita, e é o que deixa o teste do Backspace (ponto 5) valer.

    // ---- 5. O teclado do editor ----
    const quantosNos = () => p.evaluate(() => {
      const m = /tem (\d+) nós/.exec(document.body.innerText || '');
      return m ? Number(m[1]) : -1;
    });

    /** Clica no primeiro nó que achar na prévia (as alças brancas). */
    const clicarNumNo = async () => {
      const onde = await p.evaluate(() => {
        const c = document.getElementById('digitalizar-tela');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let y = Math.floor(c.height * 0.2); y < c.height * 0.8; y++) {
          for (let x = Math.floor(c.width * 0.1); x < c.width * 0.9; x++) {
            const i = (y * c.width + x) * 4;
            if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) {
              return {
                x: r.x + (x / c.width) * r.width,
                y: r.y + (y / c.height) * r.height,
              };
            }
          }
        }
        return null;
      });
      if (!onde) return false;
      await p.mouse.click(onde.x, onde.y);
      await esperar(250);
      return true;
    };

    const nosAntes = await quantosNos();
    assert.ok(nosAntes > 3, `não consegui ler a contagem de nós na tela (veio ${nosAntes}).`);

    assert.ok(await clicarNumNo(), 'não achei um nó desenhado na prévia para clicar.');
    await p.keyboard.press('Delete');
    await esperar(250);
    const nosDepoisDoDelete = await quantosNos();
    assert.equal(
      nosDepoisDoDelete, nosAntes - 1,
      `o Delete tinha que apagar o nó marcado: eram ${nosAntes} nós e ficaram ${nosDepoisDoDelete}.`,
    );

    assert.ok(await clicarNumNo(), 'não achei um nó para o teste do Backspace.');
    await p.keyboard.press('Backspace');
    await esperar(250);
    const nosDepoisDoBackspace = await quantosNos();
    assert.equal(
      nosDepoisDoBackspace, nosDepoisDoDelete - 1,
      `o Backspace tinha que apagar o nó marcado: eram ${nosDepoisDoDelete} e ficaram ${nosDepoisDoBackspace}.`,
    );

    /*
     * A armadilha: Backspace DENTRO do campo da medida só corrige o texto.
     *
     * O clique num nó ANTES de ir ao campo não é enfeite, e o teste já nasceu
     * errado sem ele: apagar um nó também o desmarca, então sem marcar outro
     * não haveria nada para o Backspace apagar, e a conferência passaria com a
     * guarda removida — passou, e foi assim que este comentário nasceu.
     */
    assert.ok(await clicarNumNo(), 'não achei um nó para marcar antes do teste do campo.');
    const nosComUmMarcado = await quantosNos();
    await p.click('input[aria-label="Medida em centímetros"]');
    await p.keyboard.type(String(ALTURA_CM) + '9');
    await p.keyboard.press('Backspace');
    await esperar(300);
    const nosDepoisDoCampo = await quantosNos();
    assert.equal(
      nosDepoisDoCampo, nosComUmMarcado,
      `apagar um dígito da MEDIDA apagou um nó do molde (eram ${nosComUmMarcado}, ficaram`
      + ` ${nosDepoisDoCampo}). Havia um nó marcado, e o atalho tem que ficar quieto quando o foco`
      + ' está num campo — ver o ponto 5 do cabeçalho.',
    );

    const valorDoCampo = await p.$eval('input[aria-label="Medida em centímetros"]', (el) => el.value);
    assert.equal(
      valorDoCampo, String(ALTURA_CM),
      `o campo da medida ficou com "${valorDoCampo}" em vez de "${ALTURA_CM}".`
      + ' O atalho comeu a tecla antes do campo: ele não pode chamar `preventDefault` quando o'
      + ' foco está num campo de texto.',
    );

    await p.waitForFunction(
      () => /Peça 2: .* × .*cm/.test(document.body.innerText || ''),
      { timeout: 10000 },
    ).catch(() => { throw new Error('a medida de uma peça não chegou na outra.'); });


    // ---- O SVG ----
    await p.evaluate(() => {
      window.__href = null;
      HTMLAnchorElement.prototype.click = function () { window.__href = this.href; };
    });
    let clicou = false;
    for (const b of await p.$$('button')) {
      if (/Baixar em SVG/.test(await p.evaluate((e) => e.textContent || '', b))) {
        await b.click();
        clicou = true;
        break;
      }
    }
    assert.ok(clicou, 'não achei o botão de baixar em SVG.');

    const svg = await p.evaluate(async () => (window.__href ? (await fetch(window.__href)).text() : null));
    assert.ok(svg, 'o botão não produziu arquivo nenhum.');

    const medida = /width="([\d.]+)cm"\s+height="([\d.]+)cm"/.exec(svg);
    assert.ok(
      medida,
      'o SVG saiu sem medida em centímetro no width/height.'
      + ' Sem o "cm", Moldes e Encaixe leem o risco como pixel a 96 dpi e o molde encolhe sem avisar.'
      + ` Veio: ${svg.slice(0, 200)}`,
    );

    const pecas = pecasDoSvg(svg);
    assert.equal(pecas.length, 2, `o SVG saiu com ${pecas.length} contorno(s); as duas peças têm que estar lá.`);

    // A peça medida tem que sair com a altura digitada.
    const alturaDe = (pts) => Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
    const alturas = pecas.map(alturaDe);
    assert.ok(
      alturas.some((a) => Math.abs(a - ALTURA_CM) < 0.6),
      `digitei ${ALTURA_CM} cm de altura e nenhuma peça do SVG saiu com essa altura (vieram ${alturas.map((a) => a.toFixed(1)).join(', ')}).`,
    );

    // ---- 3. Côncavo ----
    for (let i = 0; i < pecas.length; i++) {
      const pts = pecas[i];
      assert.ok(pts.length >= 8, `a peça ${i + 1} saiu com ${pts.length} pontos; é pouco para uma frente de camisa.`);
      const nos = nosDoSvg(svg)[i];
      // Poucos nós é o ponto do ajuste de curvas: a poligonal dava centenas, e
      // ajustar meia dúzia à mão é o que torna a tela usável. Muitos nós aqui
      // querem dizer que o ajuste parou de rodar e voltou a poligonal.
      assert.ok(
        nos >= 4 && nos <= 80,
        `a peça ${i + 1} saiu com ${nos} nós. Fora da faixa esperada: menos de 4 não desenha a`
        + ' camisa, e mais de 80 é sinal de o `ajusteDeCurvas` ter deixado de agrupar — era assim'
        + ' quando o risco ainda era poligonal, com centenas de pontos para arrastar um a um.',
      );
      const razao = area(pts) / area(casco(pts));
      assert.ok(
        razao < 0.92,
        `a peça ${i + 1} ocupa ${(razao * 100).toFixed(1)}% do próprio casco convexo — virou quase convexa.`
        + ' Decote e cavas sumiram. Quem procura: o `moldeDaImagem.js` contorna cada mancha,'
        + ' nunca fecha casco convexo — ver o cabeçalho desta bancada.',
      );
    }

    // ---- O PDF, em tamanho real ----
    await p.evaluate(() => { window.__href = null; });
    let clicouPdf = false;
    for (const b of await p.$$('button')) {
      if (/Baixar em PDF/.test(await p.evaluate((e) => e.textContent || '', b))) {
        await b.click();
        clicouPdf = true;
        break;
      }
    }
    assert.ok(clicouPdf, 'não achei o botão de baixar em PDF.');
    await p.waitForFunction(() => !!window.__href, { timeout: 30000 })
      .catch(() => { throw new Error('o servidor não devolveu o PDF em 30 s.'); });

    const pdf = await p.evaluate(async () => {
      const r = await fetch(window.__href);
      const bytes = new Uint8Array(await r.arrayBuffer());
      let txt = '';
      for (let i = 0; i < bytes.length; i++) txt += String.fromCharCode(bytes[i]);
      return txt;
    });
    assert.ok(pdf.startsWith('%PDF'), 'o que voltou do servidor não é um PDF.');

    const caixa = /\/MediaBox \[([\d.\- ]+)\]/.exec(pdf);
    assert.ok(caixa, 'o PDF saiu sem MediaBox; não dá para saber o tamanho da página.');
    const cantos = caixa[1].trim().split(/\s+/).map(Number);
    const PT_POR_CM = 72 / 2.54;
    const alturaPdf = (cantos[3] - cantos[1]) / PT_POR_CM;
    // As duas camisas do teste estão lado a lado e na mesma altura, então a
    // página tem a altura de uma peça — a que foi medida.
    assert.ok(
      Math.abs(alturaPdf - ALTURA_CM) < 1,
      `a página do PDF saiu com ${alturaPdf.toFixed(1)} cm de altura, e o risco mede ${ALTURA_CM} cm.`
      + ' O PDF do risco tem que ter o TAMANHO DO DESENHO, e não um formato de papel — ver o ponto 4'
      + ' do cabeçalho: página de papel faz o gabarito sair reduzido.',
    );

    assert.equal(problemas.length, 0, 'a tela acusou:\n  ' + problemas.slice(0, 5).join('\n  '));

    const razoes = pecas.map((pts) => (area(pts) / area(casco(pts)) * 100).toFixed(1) + '%');
    const contagem = nosDoSvg(svg).join(' e ');
    console.log(`OK — duas peças claras achadas em fundo escuro, com ${contagem} nós de curva,`
      + ` côncavas de verdade (${razoes.join(' e ')}`
      + ` do casco), a medida de uma calibrou a outra, o SVG declara centímetro e o PDF saiu`
      + ` com ${alturaPdf.toFixed(1)} cm de página (tamanho real).`);
  } finally {
    if (navegador) await navegador.close().catch(() => {});
    servidor.kill();
    // Ver a nota da `conferir-tela`: o Windows segura o SQLite por um instante
    // depois de o processo morrer.
    await esperar(600);
    try { fs.rmSync(pasta, { recursive: true, force: true }); }
    catch { console.log(`conferir-molde-da-imagem: sobrou a pasta ${pasta} (pode apagar).`); }
  }
}

principal().catch((erro) => {
  console.error('conferir-molde-da-imagem: ' + (erro && erro.message ? erro.message : erro));
  process.exit(1);
});
