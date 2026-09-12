/**
 * ===========================================================================
 * O DESENHO DO RISCO — o rolo, as peças e as marcas de metro
 * ===========================================================================
 *
 * Um só desenho serve a três destinos: a tela, o PNG e o PDF. É de propósito —
 * o que a pessoa confere na tela tem que ser exatamente o que sai impresso, e
 * dois desenhadores dariam duas verdades sobre onde uma peça está.
 *
 * O QUE MUDA ENTRE OS TRÊS é só o enquadramento:
 *
 *   TELA   o rolo fica DEITADO (a largura do tecido na vertical, o
 *          comprimento correndo para a direita), porque é assim que o rolo sai
 *          da máquina e é onde a tela tem espaço — em pé, um rolo de 25 m
 *          desperdiça a largura toda e obriga a rolar.
 *   PNG e
 *   PDF    saem EM PÉ, com escala fixa: ali o rolo é físico, e quem imprime
 *          espera a largura na largura.
 *
 * O giro é feito no CANVAS, e não em CSS. Girar o elemento com `transform`
 * levaria o texto junto (sairia de lado) e desalinharia o clique da seleção.
 * Aqui a rotação vale só para o TECIDO: as peças, os contornos e a arte giram;
 * a régua e o nome de cada peça são desenhados depois, já no sentido da
 * leitura.
 *
 * ---------------------------------------------------------------------------
 * O QUE MUDOU AO SAIR DO CONTROLADOR
 * ---------------------------------------------------------------------------
 *
 * Nenhum traço. O que mudou foi de onde vêm as três coisas que este desenho
 * precisa saber e que eram variáveis de módulo lá: o zoom, a seleção e as
 * cores das peças agora CHEGAM COMO ARGUMENTO. E a "vista" — a escala com que
 * o risco foi desenhado na tela, que é o que traduz pixel do mouse em
 * centímetro de tecido — é DEVOLVIDA em vez de escrita numa variável de fora.
 *
 * Isso é o que permite a tela ser React: quem desenha não sabe mais quem está
 * olhando.
 */

import { corDaPeca } from "../utils/coresDePeca";

/** Nada marcado. Uma só, para não criar um Set a cada desenho. */
const SEM_SELECAO = new Set();

/**
 * Desenha o rolo em pé (largura na horizontal, comprimento descendo), com a
 * arte de cada peça dentro do seu lugar — igual à prévia dos encaixadores.
 * `escala` em pixels por centímetro; quando vem nula, ajusta à largura da tela.
 */
/**
 * Desenha a arte já girada dentro da caixa (x, y, w, h) que ela ocupa no rolo.
 * Cada rotação tem sua própria origem porque o canvas gira em torno do ponto
 * transladado — errar isso joga a arte para fora do lugar.
 */
export function desenharArte(ctx, p, x, y, w, h) {
  const img = p.item.img;
  const rot = p.rot || (p.girado ? 90 : 0);

  ctx.save();
  ctx.translate(x, y);
  if (rot === 90) {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0, h, w);
  } else if (rot === 180) {
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    ctx.drawImage(img, 0, 0, w, h);
  } else if (rot === 270) {
    ctx.translate(0, h);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0, h, w);
  } else {
    ctx.drawImage(img, 0, 0, w, h);
  }
  ctx.restore();
}

/**
 * O contorno de uma máscara, guardado como faixas horizontais.
 *
 * Antes, desenhar o contorno significava varrer a grade inteira da peça a cada
 * redesenho — e a grade de uma camiseta a 0,25 cm tem uns 60 mil quadradinhos,
 * cada um com cinco consultas aos vizinhos para saber se estava na borda.
 * Vezes o número de peças no rolo, vezes toda vez que a janela muda de
 * tamanho. O desenho era mais caro que muita conta do encaixe.
 *
 * Só que o contorno **não muda**: ele depende da máscara, não do tamanho da
 * tela nem da posição da peça no tecido. Então a varredura é feita uma vez e o
 * resultado fica guardado na própria máscara. E como todas as cópias de uma
 * peça compartilham a mesma máscara, um rolo com 40 camisetas varre a grade
 * uma vez, não quarenta.
 *
 * As células vizinhas na mesma linha viram uma faixa só, guardada como três
 * números (coluna inicial, linha, quantas células) numa lista plana. Isso troca
 * um `fillRect` por célula por um `fillRect` por faixa.
 *
 * O desenho sai igual: as células de uma faixa são todas da mesma altura e
 * ficam encostadas (ou sobrepostas, quando a célula é menor que um pixel e o
 * traço é forçado a 1 px), então a união delas é exatamente o retângulo da
 * faixa — a mesma área pintada.
 *
 * Quando a célula cai num número inteiro de pixels (é o caso da exportação, em
 * que ela vale 1 px) o resultado é idêntico pixel a pixel, conferido. Em
 * escala quebrada, meio por cento dos pixels muda no fio da borda: é o
 * antialiasing, que num retângulo comprido não cai igual ao de vários
 * quadradinhos emendados. Ampliado quatro vezes os dois traços são
 * indistinguíveis.
 */
export function faixasDoContorno(m) {
  const { cols, rows, desenho } = m;
  const cheia = (cx, cy) =>
    cx >= 0 && cy >= 0 && cx < cols && cy < rows && desenho[cy * cols + cx];

  const faixas = [];
  for (let cy = 0; cy < rows; cy++) {
    let inicio = -1;
    for (let cx = 0; cx < cols; cx++) {
      // Na borda = célula cheia que faz divisa com célula vazia.
      const naBorda = cheia(cx, cy)
        && !(cheia(cx - 1, cy) && cheia(cx + 1, cy) && cheia(cx, cy - 1) && cheia(cx, cy + 1));
      if (naBorda) {
        if (inicio < 0) inicio = cx;
      } else if (inicio >= 0) {
        faixas.push(inicio, cy, cx - inicio);
        inicio = -1;
      }
    }
    if (inicio >= 0) faixas.push(inicio, cy, cols - inicio);
  }
  return Int32Array.from(faixas);
}

/**
 * Traça a silhueta usando a própria grade da máscara: marca as células cheias
 * que fazem divisa com célula vazia. Não é um contorno vetorial bonito, mas é
 * exatamente o contorno que o encaixe enxergou — que é o que interessa
 * conferir no desenho.
 */
export function contornar(ctx, p, REGUA, px, cor) {
  const m = p.mascara;
  const lado = p.passo * px;
  if (lado < 0.4) return; // no zoom de tela viraria borrão

  const faixas = m.faixas || (m.faixas = faixasDoContorno(m));
  const x0 = REGUA + (p.x + m.offX) * px;
  const y0 = (p.y + m.offY) * px;
  // Célula menor que um pixel ainda precisa deixar traço: o mínimo é 1 px.
  const grossura = Math.max(1, lado);

  ctx.fillStyle = cor;
  for (let i = 0; i < faixas.length; i += 3) {
    const cx = faixas[i], cy = faixas[i + 1], quantas = faixas[i + 2];
    ctx.fillRect(x0 + cx * lado, y0 + cy * lado, (quantas - 1) * lado + grossura, grossura);
  }
}

/**
 * As bancadas do resultado, na ordem, com o que cada uma ocupa no rolo.
 *
 * Quem decide a que bancada uma peça pertence é o MOTOR, que carimba o número
 * em cada posição (ver `posicoesDasColocacoes` em encaixe-motor.js). Aqui só se
 * mede o que cada grupo ocupa. Refazer a conta da geometria seria pedir para a
 * tela e o PDF discordarem do motor sobre onde uma bancada termina — e é
 * exatamente sobre esse ponto que o corte do tecido acontece.
 *
 * Os limites saem da caixa da ARTE, e não da silhueta: é a arte que vai
 * impressa, e é ela que a página do PDF precisa conter inteira.
 */
export function bancadasDoResultado(r) {
  const porNumero = new Map();
  (r.posicoes || []).forEach((p) => {
    const n = p.bancada || 0;
    const faixa = porNumero.get(n) || { numero: n, topo: Infinity, fundo: -Infinity, pecas: 0 };
    faixa.topo = Math.min(faixa.topo, p.y);
    faixa.fundo = Math.max(faixa.fundo, p.y + p.altura);
    faixa.pecas++;
    porNumero.set(n, faixa);
  });
  return [...porNumero.values()].sort((a, b) => a.numero - b.numero);
}

/**
 * Onde o tecido é cortado entre uma bancada e a seguinte.
 *
 * No meio do vão entre a última peça de uma e a primeira da outra: peça
 * nenhuma pode estar ali, então qualquer ponto do vão serve, e o meio é o que
 * dá a mesma folga para os dois lados na hora de cortar com a tesoura.
 */
export function cortesEntreBancadas(faixas) {
  const cortes = [];
  for (let i = 1; i < faixas.length; i++) {
    cortes.push((faixas[i - 1].fundo + faixas[i].topo) / 2);
  }
  return cortes;
}

/**
 * Desenha o risco.
 *
 * NA TELA o rolo fica DEITADO: a largura do tecido ocupa a altura da bancada e
 * o comprimento corre para a direita, que é como o rolo sai da máquina e como
 * a bancada tem espaço — um rolo em pé numa área larga e baixa desperdiça a
 * tela inteira e obriga a rolar para baixo por 25 metros.
 *
 * O giro é feito no CANVAS, não em CSS. Girar o elemento com `transform`
 * levaria junto o texto (que sairia de lado) e desalinharia o clique da
 * seleção. Aqui a rotação vale só para o TECIDO: as peças, os contornos e a
 * arte giram; a régua e o nome de cada peça são desenhados depois, já no
 * sentido da leitura.
 *
 * O que SAI do programa — PNG e PDF — continua em pé: lá o rolo é físico, e
 * quem imprime espera a largura na largura.
 */
export function desenharEncaixe(canvas, r, {
  escala, comLegenda, deitado,
  /** O quanto o risco está ampliado na tela. 1 = o que cabe na caixa. */
  zoom = 1,
  /** Os índices das peças marcadas — só a tela pinta seleção. */
  selecao = SEM_SELECAO,
} = {}) {
  const REGUA = 34; // faixa com as marcas de metro
  const pai = canvas.parentElement;

  // Deitado é o padrão da tela; o que tem escala fixa (PNG, PDF) sai em pé.
  const deitar = deitado === undefined ? !escala : deitado;

  // clientWidth/Height já descontam a barra de rolagem, mas incluem o padding
  // do contêiner (10px de cada lado) — sem descontar sobraria rolagem à toa.
  // Em pé, quem limita é a largura da caixa; deitado, é a altura dela.
  const disponivel = deitar
    ? (pai ? pai.clientHeight - 22 : 500)
    : (pai ? pai.clientWidth - 22 : 900);
  // O zoom multiplica a escala que caberia na tela: 100% é exatamente o que
  // cabe, e daí para cima o rolo cresce e a caixa rola.
  const cabendo = (disponivel - REGUA) / r.larguraTecido;
  const px = escala || Math.max(0.6, cabendo * zoom);

  const larguraCanvas = deitar
    ? Math.round(r.consumo * px)
    : Math.round(r.larguraTecido * px) + REGUA;
  const alturaCanvas = deitar
    ? Math.round(r.larguraTecido * px) + REGUA
    : Math.round(r.consumo * px);
  const dpr = escala ? 1 : (window.devicePixelRatio || 1);

  // A escala do desenho NA TELA é o que traduz pixel do mouse em centímetro de
  // tecido. Só vale para o desenho da tela: o PNG e o PDF vêm com `escala`
  // própria, e guardar a deles faria a seleção mirar no lugar errado.
  const vista = escala ? null : { px, regua: REGUA, deitado: deitar, larguraTecido: r.larguraTecido };

  canvas.width = larguraCanvas * dpr;
  canvas.height = alturaCanvas * dpr;
  canvas.style.width = `${larguraCanvas}px`;
  canvas.style.height = `${alturaCanvas}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#0d1113";
  ctx.fillRect(0, 0, larguraCanvas, alturaCanvas);

  /*
   * Daqui até o `restore` o desenho acontece no sentido DE PÉ — largura do
   * tecido no eixo X, comprimento descendo —, exatamente como sempre foi. O
   * que muda é a moldura: deitado, o desenho inteiro é girado um quarto de
   * volta no sentido anti-horário e encostado no canto.
   *
   * É por isso que nada no código das peças precisou mudar de eixo: quem gira
   * é a folha, não o que está escrito nela.
   */
  ctx.save();
  if (deitar) {
    ctx.translate(0, REGUA + r.larguraTecido * px);
    ctx.rotate(-Math.PI / 2);
  }

  // Fundo do tecido
  ctx.fillStyle = "#171d21";
  ctx.fillRect(REGUA, 0, r.larguraTecido * px, r.consumo * px);

  // Régua do rolo em pé. Deitado, ela é desenhada depois, fora do giro, para o
  // número não sair de lado.
  if (!deitar) {
    ctx.strokeStyle = "#2b3438";
    ctx.fillStyle = "#5e696d";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;
    for (let cm = 0; cm <= r.consumo; cm += 10) {
      const y = Math.round(cm * px) + 0.5;
      const metro = cm % 100 === 0;
      ctx.beginPath();
      ctx.moveTo(metro ? REGUA - 10 : REGUA - 5, y);
      ctx.lineTo(REGUA, y);
      ctx.stroke();
      if (metro && cm > 0) ctx.fillText(`${cm / 100}m`, 2, y + 6);
    }
  }

  // Peças
  r.posicoes.forEach((p) => {
    const x = REGUA + p.x * px;
    const y = p.y * px;
    const w = p.largura * px;
    const h = p.altura * px;
    const cor = corDaPeca(p.item.indice);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    desenharArte(ctx, p, x, y, w, h);
    ctx.restore();

    // No contorno, o traço segue a silhueta; no retângulo, a caixa mesmo.
    if (p.mascara) {
      contornar(ctx, p, REGUA, px, cor);
    } else {
      ctx.strokeStyle = cor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
    }

    // Seleção: o laranja da marca por cima da peça, só na tela. O hex vem
    // escrito porque canvas não lê variável de CSS; o valor é o do
    // `--accent` (ver `estilo/tokens.css`) e precisa acompanhá-lo.
    if (!escala && selecao.has(p.item.indice)) {
      ctx.fillStyle = "rgba(255, 83, 31, 0.22)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#ff8556";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    // Deitado, o nome é escrito depois — dentro do giro ele sairia de lado.
    if (comLegenda && !deitar && w > 46 && h > 18) {
      escreverNome(ctx, p, x, y, w, h);
    }
  });

  // A linha de corte entre bancadas. Vai por cima das peças de propósito: ela
  // não cruza nenhuma, e é ela que a pessoa procura no desenho para saber onde
  // o rolo se separa.
  const faixasDeBancada = bancadasDoResultado(r);
  if (faixasDeBancada.length > 1) {
    ctx.save();
    ctx.strokeStyle = "#ff531f";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    cortesEntreBancadas(faixasDeBancada).forEach((cm) => {
      const y = Math.round(cm * px) + 0.5;
      ctx.beginPath();
      ctx.moveTo(REGUA, y);
      ctx.lineTo(REGUA + r.larguraTecido * px, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Contorno do tecido
  ctx.strokeStyle = "#3a4448";
  ctx.lineWidth = 1;
  ctx.strokeRect(REGUA + 0.5, 0.5, r.larguraTecido * px - 1, r.consumo * px - 1);

  ctx.restore(); // fim do giro: daqui para baixo é o sentido da leitura

  if (deitar) {
    /*
     * A régua deitada, na faixa de baixo. O comprimento agora corre para a
     * direita, então a marca de metro é vertical e o número fica embaixo dela.
     */
    const baseDaRegua = alturaCanvas - REGUA;
    ctx.strokeStyle = "#2b3438";
    ctx.fillStyle = "#5e696d";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;
    for (let cm = 0; cm <= r.consumo; cm += 10) {
      const x = Math.round(cm * px) + 0.5;
      const metro = cm % 100 === 0;
      ctx.beginPath();
      ctx.moveTo(x, baseDaRegua);
      ctx.lineTo(x, baseDaRegua + (metro ? 10 : 5));
      ctx.stroke();
      if (metro && cm > 0) ctx.fillText(`${cm / 100}m`, x + 3, baseDaRegua + 20);
    }

    /*
     * E os nomes das peças, cada um no lugar que a peça ocupa depois do giro:
     * o comprimento vira X, e a largura do tecido vira Y de baixo para cima.
     */
    if (comLegenda) {
      r.posicoes.forEach((p) => {
        const x = p.y * px;
        const y = (r.larguraTecido - p.x - p.largura) * px;
        const w = p.altura * px;
        const h = p.largura * px;
        if (w > 46 && h > 18) escreverNome(ctx, p, x, y, w, h);
      });
    }
  }

  /*
   * A vista é o contrato com a seleção por área: com ela, um clique em pixel
   * vira centímetro de tecido. Vale só para o desenho DA TELA — o PNG e o PDF
   * têm escala própria, e guardar a deles faria a seleção mirar no lugar
   * errado (por isso ela é `null` quando veio `escala`).
   */
  return vista;
}

/** O nome da peça, numa tarja escura para não sumir dentro da arte. */
export function escreverNome(ctx, p, x, y, w, h) {
  const texto = `${p.item.nome}${p.item.qtd > 1 ? ` ${p.item.copia}` : ""}`;
  ctx.font = "11px system-ui, sans-serif";
  const largTexto = ctx.measureText(texto).width + 8;
  ctx.fillStyle = "rgba(8, 12, 14, 0.78)";
  ctx.fillRect(x + 3, y + 3, Math.min(largTexto, w - 6), 16);
  ctx.fillStyle = "#edf2f3";
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, Math.min(largTexto, w - 6), 16);
  ctx.clip();
  ctx.fillText(texto, x + 7, y + 12);
  ctx.restore();
}
