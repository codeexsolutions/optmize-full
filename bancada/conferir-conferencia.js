#!/usr/bin/env node
/**
 * ===========================================================================
 * A conferência pela arte — a segunda trava, provada sem navegador
 * ===========================================================================
 *
 * A tela confere todo encaixe pela ARTE, e não pela máscara (ver
 * `src/motores/conferenciaDaArte.js`): pinta cada par de vizinhas como o PDF as
 * pinta e procura tinta em cima de tinta e folga curta. Aqui não há canvas,
 * então a arte é pintada pelo polígono de cada peça da bancada, com a mesma
 * rasterização que toca toda célula (`rasterizarPoligono`), numa grade de
 * 0,5 mm comum ao par. A conta que decide — `compararAlfas`, `folgaCurta`,
 * `paresVizinhos` — é a MESMA da tela.
 *
 *   por partes     casos montados à mão: encostar não é sobrepor, a folga
 *                  medida bate com a desenhada, os pares certos são olhados;
 *   o fundo        arte opaca de fundo claro só tem o fundo ignorado quando
 *                  ele sai no PDF — senão vale a caixa inteira;
 *   o encaixe      a busca de produção em vários trabalhos passa limpa;
 *   a sabotagem    a mesma busca, com uma peça empurrada para cima da vizinha,
 *                  é pega — e no par certo. (A folga curta é provada por
 *                  partes: pôr uma peça a 1 mm de outra sem sobrepor nenhuma
 *                  terceira não tem receita geral.)
 *
 *   node bancada/conferir-conferencia.js
 */

const { carregarMotor } = require("./motor");
const { CATALOGO } = require("./pecas");
const { prepararTrabalho } = require("./corrida");

const falhas = [];
const falhar = (texto) => { falhas.push(texto); };

// ---------- por partes ----------

function quadrados(W, H, a, b) {
  const alfaA = new Uint8Array(W * H);
  const alfaB = new Uint8Array(W * H);
  const pintar = (alfa, [x0, y0, x1, y1], valor = 255) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alfa[y * W + x] = valor;
  };
  pintar(alfaA, a);
  pintar(alfaB, b);
  return { alfaA, alfaB, pintar };
}

function conferirPorPartes(motor) {
  const passo = 0.05;
  const folga = 0.4; // 8 pixels
  // Separados por 10 pixels vazios: a distância de centro a centro é 11 px.
  {
    const { alfaA, alfaB } = quadrados(60, 20, [0, 0, 20, 20], [30, 0, 50, 20]);
    const r = motor.compararAlfas(alfaA, alfaB, 60, 20, passo, folga);
    if (r.sobreposto) falhar("por partes: acusou sobreposição com 10 px de vão");
    if (r.menor !== Infinity) falhar(`por partes: com 11 px entre centros (> folga) mediu ${r.menor}`);
  }
  // Separados por 4 pixels vazios: 5 px entre centros = 0,25 cm < 0,4.
  {
    const { alfaA, alfaB } = quadrados(60, 20, [0, 0, 20, 20], [24, 0, 44, 20]);
    const r = motor.compararAlfas(alfaA, alfaB, 60, 20, passo, folga);
    if (Math.abs(r.menor - 0.25) > 1e-9) falhar(`por partes: 5 px entre centros deviam dar 0,25 cm, deram ${r.menor}`);
    if (!motor.folgaCurta(r.menor, passo, folga)) falhar("por partes: 0,25 cm de 0,4 pedidos não foi dado como curto");
  }
  // Encostados, com a borda antisserrilhada dividindo um pixel (128 + 128):
  // encostar não é sobrepor.
  {
    const { alfaA, alfaB, pintar } = quadrados(60, 20, [0, 0, 20, 20], [21, 0, 41, 20]);
    pintar(alfaA, [20, 0, 21, 20], 128);
    pintar(alfaB, [20, 0, 21, 20], 128);
    const r = motor.compararAlfas(alfaA, alfaB, 60, 20, passo, 0);
    if (r.sobreposto) falhar("por partes: borda antisserrilhada encostando foi acusada de sobreposição");
  }
  // Um sobre o outro: sobreposição, no primeiro ponto em comum.
  {
    const { alfaA, alfaB } = quadrados(60, 20, [0, 0, 30, 20], [25, 5, 50, 20]);
    const r = motor.compararAlfas(alfaA, alfaB, 60, 20, passo, folga);
    if (!r.sobreposto || r.sobreposto.px !== 25 || r.sobreposto.py !== 5) {
      falhar(`por partes: a sobreposição em (25, 5) saiu ${JSON.stringify(r.sobreposto)}`);
    }
  }
  // A folga no limite: 8 px entre centros é exatamente a folga — não é curta.
  if (motor.folgaCurta(0.4, passo, folga)) falhar("por partes: a folga exata foi dada como curta");

  // Os pares: só quem está a menos da folga.
  const pos = (x, y, largura, altura) => ({ x, y, largura, altura });
  const pares = motor.paresVizinhos([pos(0, 0, 10, 10), pos(10.3, 0, 10, 10), pos(30, 0, 10, 10), pos(0, 10.5, 10, 10)], 0.4);
  const nomes = pares.map((p) => `${Math.min(p.a, p.b)}-${Math.max(p.a, p.b)}`).sort();
  if (nomes.join(",") !== "0-1") falhar(`por partes: os pares vizinhos deviam ser 0-1, foram ${nomes.join(",")}`);
}

// ---------- o fundo ----------

function conferirFundo(motor) {
  // Arte opaca: fundo branco em volta, miolo escuro.
  const cols = 12;
  const rows = 12;
  const dados = new Uint8ClampedArray(cols * rows * 4);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const miolo = x >= 3 && x < 9 && y >= 3 && y < 9;
      dados[i] = dados[i + 1] = dados[i + 2] = miolo ? 30 : 255;
      dados[i + 3] = 255;
    }
  }
  const sai = motor.silhuetaDeDados(dados, cols, rows, 1, { fundoSaiNoPdf: true });
  const fica = motor.silhuetaDeDados(dados, cols, rows, 1, { fundoSaiNoPdf: false });
  const cheias = (s) => s.bits.reduce((a, b) => a + b, 0);
  if (cheias(sai) !== 36) falhar(`fundo: com o fundo saindo no PDF, a silhueta devia ser o miolo (36), foi ${cheias(sai)}`);
  if (cheias(fica) !== cols * rows) {
    falhar(`fundo: com o fundo FICANDO no PDF, a peça devia valer a caixa (${cols * rows}), valeu ${cheias(fica)}`);
  }

  // A remoção automática não pode comer a peça: camiseta BRANCA (245) sobre
  // fundo branco (255), sem contorno. O espalhamento a partir da borda aceita
  // tudo a menos de 48 da cor do fundo e levava o corpo junto — sobrava a
  // faixa escura, e o encaixe punha peça dentro da camiseta.
  const W = 300;
  const H = 400;
  const camiseta = (contorno) => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - W / 2) / (W * 0.4), (y - H / 2) / (H * 0.45));
        let cor = [255, 255, 255];
        if (d < 1) cor = contorno && d > 0.97 ? [40, 40, 40] : Math.abs(y - H / 2) < 12 ? [20, 20, 20] : [245, 245, 240];
        const i = (y * W + x) * 4;
        px[i] = cor[0]; px[i + 1] = cor[1]; px[i + 2] = cor[2]; px[i + 3] = 255;
      }
    }
    return px;
  };
  if (motor.tirarFundoDosPixels(camiseta(false), W, H, false)) {
    falhar("fundo: a remoção automática comeu o corpo de uma camiseta branca sem contorno");
  }
  const comContorno = motor.tirarFundoDosPixels(camiseta(true), W, H, false);
  if (!comContorno || comContorno.apagados / (W * H) > 0.5) {
    falhar("fundo: a camiseta branca COM contorno devia perder só o fundo em volta");
  }
}

// ---------- o encaixe ----------

/** Os polígonos da peça em cm no rolo (o mesmo giro do desenho). */
function contornoNoRolo(nome, x, y, rot) {
  const m = CATALOGO[nome];
  const L = m.largura;
  const A = m.altura;
  const girar = ([u, v]) => {
    if (rot === 90) return [A - v, u];
    if (rot === 180) return [L - u, A - v];
    if (rot === 270) return [v, L - u];
    return [u, v];
  };
  return (m.blocos || [m.poligono]).map((pol) => pol.map(([nx, ny]) => {
    const [u, v] = girar([nx * L, ny * A]);
    return [x + u, y + v];
  }));
}

/** A "arte" de uma peça na grade da região: o polígono pintado em toda célula que toca. */
function alfaDoPoligono(motor, p, regiao, passo, W, H) {
  const alfa = new Uint8Array(W * H);
  const partes = contornoNoRolo(p.item.nome, p.x, p.y, p.rot || (p.girado ? 90 : 0));
  partes.forEach((pol) => {
    const normal = pol.map(([x, y]) => [(x - regiao.x0) / (W * passo), (y - regiao.y0) / (H * passo)]);
    // Fora da região o polígono é cortado pela grade; o que importa está dentro.
    const bits = motor.rasterizarPoligono(normal, W, H);
    for (let i = 0; i < bits.length; i++) if (bits[i]) alfa[i] = 255;
  });
  return alfa;
}

/** A mesma conta da tela (`conferirEncaixePelaArte`), com a arte vinda do polígono. */
function conferirPeloPoligono(motor, posicoes, folga) {
  const sobrepostos = [];
  const curtos = [];
  for (const par of motor.paresVizinhos(posicoes, folga)) {
    const passo = motor.passoDaRegiao(par.regiao);
    const W = Math.max(1, Math.ceil((par.regiao.x1 - par.regiao.x0) / passo));
    const H = Math.max(1, Math.ceil((par.regiao.y1 - par.regiao.y0) / passo));
    const a = alfaDoPoligono(motor, posicoes[par.a], par.regiao, passo, W, H);
    const b = alfaDoPoligono(motor, posicoes[par.b], par.regiao, passo, W, H);
    const r = motor.compararAlfas(a, b, W, H, passo, folga);
    if (r.sobreposto) sobrepostos.push({ ...par, r });
    else if (r.onde && motor.folgaCurta(r.menor, passo, folga)) curtos.push({ ...par, r });
  }
  return { sobrepostos, curtos };
}

async function buscar(motor, trabalho) {
  const { receita, itens, passo, raio, alturaMax } = trabalho;
  return motor.buscarMelhorEncaixe(itens, {
    larguraTecido: receita.larguraTecido, espaco: receita.espaco, comprimentoBancada: 0,
    passo, raio, alturaMax, motores: ["contorno", "retangulo", "vaos", "faixas"],
    memoria: null, alvo: null, rede: null, redeMadura: false,
    vetorTrabalho: motor.vetorDoTrabalho(trabalho.pecas, receita.larguraTecido),
    metaAproveitamento: 0, tempoMaximoMs: 1500, msSemGanho: 500,
    tentativasPorLote: itens.length >= 120 ? 1 : 8, semente: 1,
  });
}

async function conferirEncaixes(motor) {
  for (const nome of ["producao-avulsa", "calca-bolso", "giro-livre", "arte-partida"]) {
    const trabalho = prepararTrabalho(motor, nome);
    const folga = trabalho.receita.espaco;
    const busca = await buscar(motor, trabalho);
    const limpo = conferirPeloPoligono(motor, busca.posicoes, folga);
    const texto = `${limpo.sobrepostos.length} sobreposto(s), ${limpo.curtos.length} curto(s)`;
    console.log(`  ${nome.padEnd(18)} busca: ${texto}`);
    if (limpo.sobrepostos.length || limpo.curtos.length) falhar(`${nome}: o encaixe da busca não passou (${texto})`);

    // A sabotagem: a peça 0 vai para cima de uma vizinha, e o par tem de ser pego.
    const sabotado = busca.posicoes.map((p) => ({ ...p }));
    const vizinha = motor.paresVizinhos(sabotado, folga).find((par) => par.a === 0 || par.b === 0);
    if (!vizinha) continue;
    const outra = vizinha.a === 0 ? vizinha.b : vizinha.a;
    sabotado[0].x = sabotado[outra].x + 0.5;
    sabotado[0].y = sabotado[outra].y + 0.5;
    const pego = conferirPeloPoligono(motor, sabotado, folga);
    const acertou = pego.sobrepostos.some((s) => (s.a === 0 && s.b === outra) || (s.b === 0 && s.a === outra));
    console.log(`  ${nome.padEnd(18)} sabotado: ${pego.sobrepostos.length} sobreposto(s)`);
    if (!acertou) falhar(`${nome}: a peça posta em cima da vizinha não foi pega`);
  }
}

async function main() {
  const motor = await carregarMotor();
  conferirPorPartes(motor);
  console.log("por partes: encostar, folga, sobreposição e pares");
  conferirFundo(motor);
  console.log("fundo: o que a máscara ignora tem de sair no PDF");
  console.log("encaixe (busca de 1,5 s):");
  await conferirEncaixes(motor);

  if (falhas.length === 0) {
    console.log("OK — a conferência pela arte passa o encaixe bom e pega o estragado.");
    return;
  }
  console.log(`FALHOU — ${falhas.length} problema(s):`);
  falhas.slice(0, 20).forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

main().catch((erro) => { console.error(erro); process.exit(1); });
