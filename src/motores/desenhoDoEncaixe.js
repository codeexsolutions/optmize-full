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
  // O giro do encaixe mais o giro que a peça recebeu antes dele (ver "O GIRO
  // DA PEÇA ANTES DO ENCAIXE", em encaixeMascara.js). `w` e `h` já são a caixa
  // da peça no rolo, então só o giro da arte dentro dela muda.
  const rot = ((p.rot || (p.girado ? 90 : 0)) + (Number(p.item.rotacaoBase) || 0)) % 360;

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
  // `offX`/`offY` já trazem o recuo da borda (ver `mascarasDeSilhueta`); o
  // desenho da máscara é na moldura dela, então o recuo sai de volta.
  const recuo = m.recuo || 0;
  const x0 = REGUA + (p.x + m.offX - recuo) * px;
  const y0 = (p.y + m.offY - recuo) * px;
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


/*
 * ===========================================================================
 * A MÍDIA VAZIA — o rolo antes de existir trabalho
 * ===========================================================================
 *
 * A mesa vazia era um retângulo preto com um cartão no meio, e só. Quem abria
 * o Encaixe não via NADA do tecido que estava prestes a usar: nem a largura,
 * nem a escala, nem que aquilo é um rolo que corre para a direita. O primeiro
 * arquivo solto fazia tudo isso aparecer de uma vez, e até lá a tela não
 * ensinava nada.
 *
 * ---------------------------------------------------------------------------
 * O DESENHO VEM DO OPTMIZE LITE
 * ---------------------------------------------------------------------------
 *
 * O rolo do Lite (`components/NestingCanvas.tsx`, lá no outro projeto) resolve
 * isto há tempos, e resolve bem: superfície própria, grade dupla nos dois
 * eixos, régua de traços laranja e a borda da mídia em três lados. Não há
 * motivo para inventar outro — e há um bom motivo para não inventar: são dois
 * programas da mesma casa que encaixam a mesma coisa, e quem usa os dois não
 * deveria ter de reaprender a olhar.
 *
 * Do Lite vem a ESTRUTURA. As cores exatas, não:
 *
 *   - o laranja do Lite é `#f97316`, e o desta casa é `#ff531f` — o da MARCA,
 *     lido do arquivo do logo (ver `estilo/tokens.css`). O acento daqui era
 *     justamente `#f97316` e foi trocado de propósito, porque lado a lado com
 *     a marca eram duas laranjas diferentes na mesma tela. Copiar o hex do
 *     Lite desfaria aquilo;
 *
 *   - os cinzas do Lite são quentes (`#1a1817`, um marrom escuro) e os desta
 *     folha são frios (`#171d21`, um azul escuro). Aqui ficam os frios, pelo
 *     mesmo motivo: é a paleta em que o resto do programa está pintado, e é a
 *     do risco de verdade, que vai substituir este desenho no lugar exato em
 *     que ele está.
 *
 * ---------------------------------------------------------------------------
 * A BORDA ABERTA E O DEGRADÊ DIZEM A MESMA COISA
 * ---------------------------------------------------------------------------
 *
 * O Lite desenha a borda da mídia em TRÊS lados — começo, cima e baixo — e
 * deixa a direita aberta. O comentário de lá explica: "o comprimento não tem
 * fim; fechar o retângulo à direita desenhava uma parede onde a mídia
 * continua, e o operador lia aquilo como acabou o material".
 *
 * Um risco PRONTO tem comprimento, e ali o corte reto na ponta é a informação.
 * Um rolo vazio não tem: quanto dele vai ser gasto é justamente o que ninguém
 * sabe ainda. Por isso aqui vão as duas coisas — a borda aberta do Lite E o
 * degradê, que faz o desenho inteiro (grade, borda, régua) rarear até sumir em
 * vez de ser cortado pela beirada do canvas.
 *
 * O fundo do canvas fica TRANSPARENTE (o `desenharEncaixe` pinta o seu de
 * `#0d1113`): é o degradê que tem de revelar a mesa por baixo, e um fundo
 * opaco sob ele daria um retângulo acabando no nada — o corte reto que se quer
 * evitar.
 */
export function desenharMidiaVazia(canvas, { larguraTecido } = {}) {
  const REGUA = 34;
  const pai = canvas.parentElement;

  // Os mesmos 22px de padding que o `desenharEncaixe` desconta — ver lá.
  const larguraDisponivel = pai ? pai.clientWidth - 22 : 900;
  const alturaDisponivel = pai ? pai.clientHeight - 22 : 500;

  const ctx = canvas.getContext("2d");

  // Sem largura de tecido não há rolo para desenhar: some, em vez de inventar
  // um. É o estado de quem apagou o campo da largura para digitar outro.
  if (!larguraTecido || larguraTecido <= 0 || larguraDisponivel < 40 || alturaDisponivel < 40) {
    canvas.width = 0;
    canvas.height = 0;
    return;
  }

  // Deitado, como a tela sempre mostra: a largura do tecido é a ALTURA na
  // tela, e o comprimento corre para a direita.
  const px = Math.max(0.6, (alturaDisponivel - REGUA) / larguraTecido);
  const alturaDoTecido = larguraTecido * px;
  const largura = larguraDisponivel;
  const altura = Math.round(alturaDoTecido) + REGUA;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(largura * dpr);
  canvas.height = Math.round(altura * dpr);
  canvas.style.width = `${largura}px`;
  canvas.style.height = `${altura}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, largura, altura);
  ctx.textBaseline = "middle";

  /*
   * Onde o sumiço começa. 30% deixa o começo do rolo em cor cheia — o
   * bastante para a superfície ser lida como tecido — e dá ao degradê os
   * outros 70% para morrer sem virar uma faixa dura.
   */
  const INICIO_DO_SUMICO = 0.3;

  /** O mesmo degradê, para qualquer cor que precise desaparecer junto. */
  const sumindo = (cor, corTransparente) => {
    const g = ctx.createLinearGradient(0, 0, largura, 0);
    g.addColorStop(0, cor);
    g.addColorStop(INICIO_DO_SUMICO, cor);
    g.addColorStop(1, corTransparente);
    return g;
  };

  // ── A superfície ─────────────────────────────────────────────────────────
  ctx.fillStyle = sumindo("#171d21", "rgba(23, 29, 33, 0)");
  ctx.fillRect(0, 0, largura, alturaDoTecido);

  /*
   * ── A GRADE, nos dois eixos ──────────────────────────────────────────────
   *
   * É a peça que o Lite tem e que faltava aqui. Duas espessuras de informação
   * na mesma malha: a linha fraca a cada 5 cm e a forte a cada 10. Uma grade
   * de um nível só vira papel quadriculado — com dois, o olho conta de dez em
   * dez sem parar para contar.
   *
   * Ela também é o que torna o degradê VISÍVEL. Na primeira versão disto o
   * rolo era liso, e o tecido (`#171d21`) e a mesa por baixo são cores
   * próximas demais para alguém enxergar uma virando a outra: o sumiço
   * simplesmente não aparecia. O que some agora não é cor quase igual a
   * outra — é um desenho que rareia até não haver mais nenhum.
   *
   * O `passo5 > 3` é o do Lite, e pela mesma razão: abaixo de uns três pixels
   * as linhas fracas encostam umas nas outras e a grade vira um chapado mais
   * claro. Some a malha fina e fica só a de 10 em 10.
   */
  const passo10 = 10 * px;
  const passo5 = 5 * px;

  const malha = (espacamento, comeco, cor, corTransparente) => {
    ctx.strokeStyle = sumindo(cor, corTransparente);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = comeco; x < largura; x += espacamento) {
      const ex = Math.round(x) + 0.5;
      ctx.moveTo(ex, 0);
      ctx.lineTo(ex, alturaDoTecido);
    }
    for (let y = comeco; y < alturaDoTecido; y += espacamento) {
      const ey = Math.round(y) + 0.5;
      ctx.moveTo(0, ey);
      ctx.lineTo(largura, ey);
    }
    ctx.stroke();
  };

  if (passo5 > 3) malha(passo10, passo5, "#1e262b", "rgba(30, 38, 43, 0)");
  malha(passo10, 0, "#2b3438", "rgba(43, 52, 56, 0)");

  /*
   * ── A BORDA DA MÍDIA, em três lados ──────────────────────────────────────
   *
   * Começo, cima e baixo, no laranja da marca. A direita fica aberta — ver o
   * cabeçalho. É o traço mais forte do desenho de propósito: é ele que diz
   * onde o tecido COMEÇA, e é contra ele que a primeira peça vai encostar.
   */
  ctx.strokeStyle = sumindo("#ff531f", "rgba(255, 83, 31, 0)");
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(largura, 0.75);
  ctx.lineTo(0.75, 0.75);
  ctx.lineTo(0.75, alturaDoTecido - 0.75);
  ctx.lineTo(largura, alturaDoTecido - 0.75);
  ctx.stroke();

  /*
   * ── A RÉGUA ──────────────────────────────────────────────────────────────
   *
   * Traço a cada 10 cm, mais alto e com o número a cada metro, em laranja
   * claro como a do Lite. Ela some marca a marca, e não por degradê: um traço
   * meio apagado ainda é um traço, e é o que mantém a régua legível até onde o
   * tecido já está quase transparente. Abaixo de 4% de opacidade não se
   * desenha — parar é mais barato que desenhar o que ninguém vê.
   */
  const baseDaRegua = altura - REGUA;
  const xDoSumico = largura * INICIO_DO_SUMICO;
  const opacidadeEm = (x) =>
    x <= xDoSumico ? 1 : Math.max(0, 1 - (x - xDoSumico) / (largura - xDoSumico));

  ctx.font = "bold 9px ui-monospace, monospace";
  ctx.lineWidth = 1;

  for (let cm = 0; cm * px < largura; cm += 10) {
    const x = Math.round(cm * px) + 0.5;
    const opacidade = opacidadeEm(x);
    if (opacidade < 0.04) break;

    const metro = cm % 100 === 0;
    ctx.globalAlpha = opacidade * (metro ? 1 : 0.55);
    ctx.strokeStyle = "#ff8556";
    ctx.beginPath();
    ctx.moveTo(x, baseDaRegua);
    ctx.lineTo(x, baseDaRegua + (metro ? 9 : 4));
    ctx.stroke();

    if (metro && cm > 0) {
      ctx.globalAlpha = opacidade;
      ctx.fillStyle = "#ff8556";
      ctx.fillText(`${cm / 100}m`, x + 4, baseDaRegua + 18);
    }
  }
  ctx.globalAlpha = 1;

  /*
   * A LARGURA ESCRITA, encostada na borda de cima.
   *
   * É a única coisa que a mesa vazia diz e o risco não: com peças em cima, a
   * largura está no rodapé e na própria proporção do desenho. Vazia, sem um
   * número, a faixa poderia ser 160 cm ou 320 — e é o número que a pessoa
   * precisa conferir ANTES de soltar arquivo, não depois de encaixar.
   */
  ctx.font = "bold 10px ui-monospace, monospace";
  ctx.fillStyle = "#ff8556";
  ctx.fillText(`${larguraTecido} cm`, 10, 14);
}

/*
 * ===========================================================================
 * O RASCUNHO — o encaixe enquanto ele ainda está sendo procurado
 * ===========================================================================
 *
 * A tela mostrava uma barra de carregamento durante a procura. Agora mostra o
 * rolo encolhendo: o melhor encaixe até agora, cheio, e por cima o fantasma do
 * que está sendo tentado neste instante.
 *
 * ISTO NÃO É O `desenharEncaixe`, e a diferença é o ponto:
 *
 *   `desenharEncaixe`   desenha o RESULTADO — arte de cada peça, nome, régua,
 *                       legenda, linha de corte entre bancadas, seleção. É
 *                       caro, e tem de ser: é o que a pessoa vai conferir
 *                       antes de mandar cortar tecido de verdade.
 *
 *   `desenharRascunho`  desenha a SILHUETA e nada mais. Chega dezesseis vezes
 *                       por segundo enquanto a busca corre, e carregar arte a
 *                       esse ritmo tiraria da tela a folga que ela tem para
 *                       animar.
 *
 * Por isso duas funções, e não uma com bandeira: as duas só coincidem no
 * retângulo do rolo, e tudo o que uma faz bem a outra não pode fazer.
 *
 * O QUE CHEGA AQUI é o quadro compacto que o worker transferiu — um
 * `Float32Array` de seis números por peça (x, y, largura, altura, rotação,
 * girado). Ele não tem máscara nem contorno, então a peça é um retângulo. Num
 * fantasma que dura 60 ms isso é fiel o bastante; no resultado, jamais.
 */

/** Seis números por peça, na ordem que `quadroDoEncaixe` empacota. */
const POR_PECA = 6;

export function desenharRascunho(canvas, {
  larguraTecido, consumo, pecas, fantasma, pulso = 0,
  /*
    O tamanho, quando quem chama já sabe qual é.

    A miniatura da faixa de tentativas tem medida própria e NÃO pode medir o
    pai: as miniaturas dividem o mesmo contêiner, então o pai delas é o mesmo
    para todas e mede a faixa inteira. Sem esta saída, as oito sairiam do
    tamanho da coluna, empilhadas por cima uma da outra.
  */
  caixa = null,
} = {}) {
  // A miniatura não tem régua: 34px de faixa numa caixa de 54 seria a régua
  // com um fiapo de encaixe embaixo.
  const REGUA = caixa ? 0 : 34;
  const pai = canvas.parentElement;
  const larguraDisponivel = caixa ? caixa.largura : (pai ? pai.clientWidth - 22 : 900);
  const alturaDisponivel = caixa ? caixa.altura : (pai ? pai.clientHeight - 22 : 500);

  if (!larguraTecido || larguraTecido <= 0 || !consumo || consumo <= 0) return;
  if (larguraDisponivel < 20 || alturaDisponivel < 20) return;

  const ctx = canvas.getContext("2d");

  /*
    A ESCALA É A DO ROLO INTEIRO NA CAIXA, e ela muda a cada quadro de
    propósito: o rolo encolhe conforme a busca melhora, e uma escala fixa faria
    o desenho ir minguando para um canto. Recalculada, o rolo ocupa sempre a
    caixa toda e o que a pessoa vê é a densidade das peças aumentando — que é
    exatamente o que "melhorou" quer dizer aqui.
  */
  const porAltura = (alturaDisponivel - REGUA) / larguraTecido;
  const porLargura = larguraDisponivel / consumo;
  const px = Math.max(0.2, Math.min(porAltura, porLargura));

  // Na miniatura a caixa manda: o rolo é desenhado centrado dentro dela, em vez
  // de o canvas crescer com o rolo. Oito canvas de tamanhos diferentes numa
  // coluna dariam uma escada, e o que se quer comparar de relance é a DENSIDADE
  // das peças, não o tamanho do quadrinho.
  const largura = caixa ? caixa.largura : Math.round(consumo * px);
  const altura = caixa ? caixa.altura : Math.round(larguraTecido * px) + REGUA;

  const dpr = window.devicePixelRatio || 1;
  // Só mexe no tamanho do canvas quando ele realmente mudou: atribuir
  // `canvas.width` LIMPA o bitmap e refaz o buffer, e fazer isso dezesseis
  // vezes por segundo à toa é o tipo de desperdício que este arquivo existe
  // para evitar.
  const larguraCrua = Math.round(largura * dpr);
  const alturaCrua = Math.round(altura * dpr);
  if (canvas.width !== larguraCrua || canvas.height !== alturaCrua) {
    canvas.width = larguraCrua;
    canvas.height = alturaCrua;
    canvas.style.width = `${largura}px`;
    canvas.style.height = `${altura}px`;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, largura, altura);

  // O rolo: o retângulo do tecido, abaixo da régua.
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, REGUA, largura, altura - REGUA);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, REGUA + 0.5, largura - 1, altura - REGUA - 1);

  /*
    O FANTASMA É TRAÇO; O RECORDE É CHEIO.

    A diferença tem de ser de ESPÉCIE, e não de tom, porque as duas camadas se
    sobrepõem o tempo todo. Dois preenchimentos em opacidades diferentes viram
    uma sopa em que não se distingue o que já foi conquistado do que está só
    sendo experimentado; contorno contra massa se lê de relance.
  */
  const n = pecas ? Math.floor(pecas.length / POR_PECA) : 0;
  if (fantasma) {
    ctx.strokeStyle = "rgba(255,133,86,0.28)";
    ctx.lineWidth = 1;
  } else {
    // O pulso é o clarão curto de quando um recorde acaba de cair: some em
    // poucos quadros e é o que faz a melhora ser PERCEBIDA, não só mostrada.
    ctx.fillStyle = `rgba(255,133,86,${0.22 + pulso * 0.45})`;
    ctx.strokeStyle = `rgba(255,133,86,${0.45 + pulso * 0.4})`;
    ctx.lineWidth = 1;
  }

  for (let i = 0; i < n; i++) {
    const b = i * POR_PECA;
    const x = pecas[b] * px;
    const y = REGUA + pecas[b + 1] * px;
    const w = pecas[b + 2] * px;
    const h = pecas[b + 3] * px;
    // Peça menor que um pixel não vira desenho, vira ruído cinza no canvas.
    if (w < 0.7 || h < 0.7) continue;
    if (fantasma) ctx.strokeRect(x, y, w, h);
    else {
      ctx.fillRect(x, y, w, h);
      if (w > 3 && h > 3) ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  // Os metros, no alto: é o número que a pessoa está esperando ver cair.
  if (!caixa) {
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillStyle = fantasma ? "rgba(255,133,86,0.45)" : "#ff8556";
    ctx.textBaseline = "middle";
    if (!fantasma) ctx.fillText(`${(consumo / 100).toFixed(2).replace(".", ",")} m`, 10, 15);
  }
}
