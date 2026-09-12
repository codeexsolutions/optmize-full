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
 * 8. NÃO EXISTE NÓ EMPILHADO EM NÓ
 * ---------------------------------------------------------------------------
 *
 * Dois nós a fração de célula um do outro não desenham nada — a mediana dos
 * trechos é 25 células — e atrapalham de verdade: a pessoa arrasta um, o de
 * baixo fica onde estava, e o traço abre um bico que ela não entende de onde
 * veio. Nas fotos da fábrica apareciam nós a 0,2 célula.
 *
 * Eles vinham de dois lugares: quebras quase coincidentes (um canto caindo ao
 * lado da ponta de uma reta) e a recursão do ajuste partindo colada na ponta de
 * um trecho. Os dois são tratados no `ajusteDeCurvas`, e é isto que confere.
 *
 * ---------------------------------------------------------------------------
 * 7. O TRAÇO FICA EM CIMA DA FORMA — medido, não olhado
 * ---------------------------------------------------------------------------
 *
 * A foto do teste é pintada a partir de um caminho conhecido, então a forma de
 * verdade é conhecida também: dá para percorrer o mesmo caminho e medir o
 * quanto o traço se afastou dele, nos dois sentidos.
 *
 * Isto existe por causa de um erro específico. O ajuste de curvas media o erro
 * de cada cúbica pela distância de cada ponto até o ponto da curva no seu `t`
 * — e aquele `t` é um palpite. Quando ele errava, a curva passava perto de cada
 * ponto MEDIDO e estufava ENTRE eles: a conta dizia 2 células, o traço se
 * afastava 8. Nas fotos da fábrica isso deu 18 mm numa manga.
 *
 * Nada disso aparecia na tela, e nenhuma conferência de então pegava — a de
 * nós contava quantos eram, a de côncavo olhava a área, e as duas passavam com
 * o traço abaulado. Só medir contra a forma pega.
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
const licencaDeTeste = require('./licenca-de-teste.cjs');

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
/**
 * O desenho da camisa do teste, numa constante.
 *
 * Fica separado porque serve a duas coisas: pintar a foto, e ser a VERDADE
 * contra a qual o traço é medido (ver o ponto 7). Se o desenho e a verdade
 * fossem duas cópias do mesmo caminho, um dia uma seria mexida sem a outra e a
 * conferência passaria a se comparar com a forma errada.
 */
const CAMISA = 'M 300 120 C 340 190, 560 190, 600 120'
  + ' L 760 190 C 800 210, 810 300, 780 330'
  + ' L 690 300 C 700 520, 700 820, 700 980'
  + ' L 200 980 C 200 820, 200 520, 210 300'
  + ' L 120 330 C 90 300, 100 210, 140 190 Z';

/** A camisa percorrida, em pontos — a forma de verdade, sem passar por imagem. */
function camisaEmPontos(passosPorCurva = 24) {
  const numeros = (t) => t.trim().split(/[\s,]+/).map(Number);
  const saida = [];
  let atual = null;
  for (const passo of CAMISA.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    const tipo = passo[1];
    const n = passo[2].trim() ? numeros(passo[2]) : [];
    if (tipo === 'M' || tipo === 'L') {
      atual = { x: n[0], y: n[1] };
      saida.push(atual);
    } else if (tipo === 'C' && atual) {
      const p1 = { x: n[0], y: n[1] };
      const p2 = { x: n[2], y: n[3] };
      const p3 = { x: n[4], y: n[5] };
      for (let k = 1; k <= passosPorCurva; k++) saida.push(naCurva(atual, p1, p2, p3, k / passosPorCurva));
      atual = p3;
    }
  }
  return saida;
}

function fotoDeTeste(pasta) {
  const sharp = require('sharp');
  const arquivo = path.join(pasta, 'mesa-de-teste.png');
  const camisa = (dx, dy, escala) => `
    <path transform='translate(${dx},${dy}) scale(${escala})' d='${CAMISA}' fill='#e8e2d4'/>`;
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
 * O risco sai com `C` onde é curva e `L` onde é reta, e os dois precisam ser
 * lidos na ORDEM em que aparecem: ler só as coordenadas soltas somaria as alças
 * das cúbicas, que ficam FORA do traço, e a área sairia errada — e é da área
 * que sai a conferência do côncavo.
 */
function pecasDoSvg(svg) {
  return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => {
    const d = m[1];
    const passos = [...d.matchAll(/([MLC])\s*([-\d.\s]+)/g)];
    let atual = null;
    const saida = [];
    for (const passo of passos) {
      const tipo = passo[1];
      const n = passo[2].trim().split(/\s+/).map(Number);
      if (tipo === 'M') {
        atual = { x: n[0], y: n[1] };
        saida.push(atual);
      } else if (tipo === 'L') {
        atual = { x: n[0], y: n[1] };
        saida.push(atual);
      } else if (atual) {
        const p1 = { x: n[0], y: n[1] };
        const p2 = { x: n[2], y: n[3] };
        const p3 = { x: n[4], y: n[5] };
        for (let k = 1; k <= 8; k++) saida.push(naCurva(atual, p1, p2, p3, k / 8));
        atual = p3;
      }
    }
    return saida;
  });
}

/** Quantos nós tem cada `<path>`: um por trecho, seja `L` ou `C`. */
function nosDoSvg(svg) {
  return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)]
    .map((m) => (m[1].match(/[LC]/g) || []).length);
}

/**
 * A posição de cada nó de cada `<path>`.
 *
 * O nó é o PONTO FINAL de cada trecho: num `L` são as duas coordenadas, num `C`
 * são as duas últimas das seis (as quatro primeiras são alças, que não estão
 * sobre o traço).
 */
function posicoesDosNos(svg) {
  return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => {
    const saida = [];
    for (const passo of m[1].matchAll(/([MLC])\s*([-\d.\s]+)/g)) {
      const n = passo[2].trim().split(/\s+/).map(Number);
      if (passo[1] === 'C') saida.push({ x: n[4], y: n[5] });
      else saida.push({ x: n[0], y: n[1] });
    }
    /*
     * O último trecho volta ao primeiro nó, então ele aparece duas vezes: uma
     * no `M` e outra no fim. Sem tirar a repetição, a conferência do
     * espaçamento acusa "dois nós a 0,00 cm" em todo risco que fecha a volta —
     * e foi o que ela acusou, com razão sintática e nenhuma serventia.
     */
    const primeiro = saida[0];
    const ultimo = saida[saida.length - 1];
    if (saida.length > 1 && primeiro && ultimo
        && Math.hypot(ultimo.x - primeiro.x, ultimo.y - primeiro.y) < 1e-6) {
      saida.pop();
    }
    return saida;
  });
}

/** Quantos trechos de cada `<path>` são RETA. */
function retasDoSvg(svg) {
  return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)]
    .map((m) => (m[1].match(/L/g) || []).length);
}

/** A área que um contorno fecha (fórmula do laço). */
function area(pontos) {
  let soma = 0;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    soma += (pontos[j].x + pontos[i].x) * (pontos[j].y - pontos[i].y);
  }
  return Math.abs(soma / 2);
}

/** Distância de um ponto ao segmento `u`-`v`. */
function aoSegmento(p, u, v) {
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const t2 = dx * dx + dy * dy;
  const t = t2 > 0 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / t2)) : 0;
  return Math.hypot(u.x + t * dx - p.x, u.y + t * dy - p.y);
}

/** Distância de um ponto à poligonal fechada. */
function aPoligonal(p, linha) {
  let menor = Infinity;
  for (let i = 0; i < linha.length; i++) {
    const d = aoSegmento(p, linha[i], linha[(i + 1) % linha.length]);
    if (d < menor) menor = d;
  }
  return menor;
}

/** Caixa de uma poligonal. */
function caixaDe(pts) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of pts) {
    if (p.x < a) a = p.x;
    if (p.y < b) b = p.y;
    if (p.x > c) c = p.x;
    if (p.y > d) d = p.y;
  }
  return { minX: a, minY: b, largura: c - a, altura: d - b };
}

/** Põe a forma numa caixa 0..1, para comparar desenho com desenho sem escala. */
function normalizar(pts) {
  const cx = caixaDe(pts);
  const lado = Math.max(cx.largura, cx.altura) || 1;
  return pts.map((p) => ({ x: (p.x - cx.minX) / lado, y: (p.y - cx.minY) / lado }));
}

/**
 * O quanto duas formas se afastam, nos DOIS sentidos (Hausdorff), em fração do
 * lado maior.
 *
 * Os dois sentidos importam, e medir só um já me enganou: um trecho RETO tem as
 * duas pontas em cima do contorno, então medindo só os pontos do traço contra a
 * verdade ele sai com erro zero — a barriga que a corda corta fica entre as
 * pontas, onde não há ponto do traço para medir.
 */
function afastamento(a, b) {
  let maior = 0;
  for (const p of a) {
    const d = aPoligonal(p, b);
    if (d > maior) maior = d;
  }
  for (const p of b) {
    const d = aPoligonal(p, a);
    if (d > maior) maior = d;
  }
  return maior;
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
        nos >= 4 && nos <= 60,
        `a peça ${i + 1} saiu com ${nos} nós. Fora da faixa esperada: menos de 4 não desenha a`
        + ' camisa, e mais de 60 é sinal de o `ajusteDeCurvas` ter deixado de agrupar — era assim'
        + ' quando o risco ainda era poligonal, com centenas de pontos para arrastar um a um.'
        + ' A média medida contra as fotos da fábrica é 21 nós por peça.',
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

    /*
     * ---- 6. Reta sai como reta ----
     *
     * A camisa do teste tem lados retos de verdade — as duas laterais e a
     * barra. Eles têm que sair como `L` no caminho, e não como `C` com as alças
     * deitadas em cima dos nós.
     *
     * A diferença não aparece na tela: as duas desenham a mesma linha. Aparece
     * em quem abre o arquivo, que num `C` ganha duas alças que não deviam
     * existir num lado reto — e qualquer esbarrão nelas entorta a lateral do
     * molde. É também de onde vem metade da economia de nós: sem detectar
     * reta, o ajuste ia partindo a lateral até caber no erro.
     */
    const retas = retasDoSvg(svg);
    assert.ok(
      retas.every((q) => q >= 2),
      `os lados retos da camisa não saíram como reta: trechos \`L\` por peça = ${retas.join(', ')}.`
      + ' Cada camisa do teste tem duas laterais e a barra — se vier zero ou um, a varredura de'
      + ' trechos retos parou de achá-los (ver `trechosRetos`, no ajusteDeCurvas).',
    );

    /*
     * ---- 7. O traço em cima da forma ----
     *
     * Compara normalizado (as duas formas encaixadas numa caixa 0..1), porque o
     * que se está conferindo é o DESENHO, não a escala nem a posição: a escala
     * já é conferida pela medida, e a posição pelo arranjo.
     *
     * O limite de 2% do lado maior não é chute: com o ajuste bom, as peças do
     * teste ficam em torno de 1%, e o defeito que motivou esta conferência
     * passava de 4%.
     */
    const verdade = normalizar(camisaEmPontos(24));
    const afastamentos = pecas.map((pts) => afastamento(normalizar(pts), verdade));
    afastamentos.forEach((d, i) => {
      assert.ok(
        d < 0.02,
        `a peça ${i + 1} se afasta ${(d * 100).toFixed(1)}% do lado maior da forma que pintou a foto.`
        + ' Acima de 2% o traço deixou de acompanhar o papel — e o jeito de isso acontecer sem'
        + ' aparecer é a curva passar pelos pontos medidos e estufar entre eles (ver o ponto 7 do'
        + ' cabeçalho, e `maiorErro` no ajusteDeCurvas).',
      );
    });

    // ---- 8. Nó empilhado em nó ----
    const MINIMO_ENTRE_NOS_CM = 0.3;
    posicoesDosNos(svg).forEach((nos, i) => {
      let menor = Infinity;
      let onde = -1;
      for (let k = 0; k < nos.length; k++) {
        const a = nos[k];
        const b = nos[(k + 1) % nos.length];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < menor) { menor = d; onde = k; }
      }
      assert.ok(
        menor >= MINIMO_ENTRE_NOS_CM,
        `a peça ${i + 1} tem dois nós a ${menor.toFixed(2)} cm um do outro (no ${onde}).`
        + ` Abaixo de ${MINIMO_ENTRE_NOS_CM} cm eles ficam empilhados: um esconde o outro, e quem`
        + ' arrasta o de cima abre um bico sem entender por quê. Ver o ponto 8 do cabeçalho.',
      );
    });

    assert.equal(problemas.length, 0, 'a tela acusou:\n  ' + problemas.slice(0, 5).join('\n  '));

    const razoes = pecas.map((pts) => (area(pts) / area(casco(pts)) * 100).toFixed(1) + '%');
    const contagem = nosDoSvg(svg).map((q, i) => `${q} nós (${retas[i]} retos)`).join(' e ');
    const fidelidade = afastamentos.map((d) => (d * 100).toFixed(1) + '%').join(' e ');
    console.log(`OK — duas peças claras achadas em fundo escuro, com ${contagem},`
      + ` a ${fidelidade} da forma de verdade,`
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
