/**
 * ===========================================================================
 * PEÇA EM CIMA DE PEÇA — o guarda que roda antes de a produção sair
 * ===========================================================================
 *
 * O motor não sobrepõe por construção: o encaixe por contorno só desce a peça
 * até onde o relevo deixa, e o por caixa recorta a área livre a cada peça. A
 * bancada prova isso a cada mexida (`bancada/conferir-sobreposicao.js`).
 *
 * Só que o encaixe que chega à produção não vem sempre do motor. Ele pode vir
 * do BANCO — o "melhor encaixe já conseguido", retomado com um clique (ver
 * `usarEncaixeGuardado`) —, e ali as posições são remontadas a partir de
 * números guardados e da tabela de peças de AGORA. Nenhuma prova sobre o motor
 * alcança esse caminho, porque o motor não participou dele.
 *
 * Foi de lá que veio o defeito relatado: peça entrando dentro de outra ao puxar
 * do histórico. Este arquivo é o guarda que a produção pediu — confere o
 * encaixe pronto, qualquer que tenha sido a origem dele, e se houver peça em
 * cima de peça a produção NÃO sai.
 *
 * ---------------------------------------------------------------------------
 * A CONTA É EM CENTÍMETROS, E EM DUAS FASES
 * ---------------------------------------------------------------------------
 *
 * A bancada pinta cada peça célula por célula num vetor do tamanho do rolo — um
 * rolo de 40 m a 0,25 cm por célula são 11 milhões de células, 44 MB. Lá isso
 * custa e vale, porque roda fora da tela e mede também a folga real. Aqui não
 * serve: este guarda roda a CADA encaixe, na thread da tela.
 *
 * E ele não pode trabalhar em célula, por um motivo concreto: **o encaixe por
 * caixa não escreve passo nem máscara nas posições dele** (ver `encaixar`), só
 * `x`, `y`, `largura` e `altura` em centímetros. Um guarda que exigisse célula
 * recusaria todo encaixe por retângulo — travaria a produção inteira em vez de
 * proteger uma parte dela.
 *
 * Então: centímetro para todo mundo, e duas fases.
 *
 *   GROSSA   a caixa envolvente de cada peça contra a das outras. É um teste de
 *            quatro comparações, e num encaixe válido ele já descarta quase
 *            todos os pares: peça só pode cruzar com a vizinha.
 *   FINA     só para os pares que passaram da grossa, e aí de acordo com o que
 *            cada uma tem: coluna por coluna quando há máscara, a caixa quando
 *            não há.
 *
 * O par de fases é o que torna o O(n²) da grossa irrelevante — mil peças são um
 * milhão de comparações de número, alguns milissegundos — enquanto a fina, que
 * é a caríssima, roda só nas vizinhas de verdade.
 *
 * ---------------------------------------------------------------------------
 * O QUE É CONFERIDO: A PEÇA COM A FOLGA
 * ---------------------------------------------------------------------------
 *
 * A máscara do encaixe é a silhueta já ENGORDADA pela folga, e é ela que o
 * motor mantém sem cruzamento. Conferir a silhueta crua (`desenho`) responderia
 * outra pergunta, mais frouxa: duas peças podem estar com a folga violada — o
 * que é defeito de produção — e ainda assim não se tocarem no desenho. Como o
 * que se quer aqui é "este encaixe é válido?", a régua é a do motor.
 *
 * Na peça SEM máscara a régua é a caixa `largura x altura`, que é MENOR que o
 * retângulo que o encaixe por caixa reservou (ele reserva `largura + folga`, e
 * desenha a peça no canto). Menor de propósito: duas caixas que não se cruzam
 * com a folga incluída também não se cruzam sem ela, então este guarda nunca
 * acusa um encaixe por caixa que esteja certo. Ele é um guarda contra estrago
 * grosseiro — peça dentro de peça —, e não um medidor de folga; quem mede folga
 * é a bancada.
 */

/**
 * A peça reduzida ao que a conferência precisa: a caixa envolvente em cm e,
 * quando houver máscara, os intervalos ocupados coluna por coluna.
 *
 * O canto da arte é `x - offX` em centímetros (é assim que o motor escreve a
 * posição), então a coluna 0 da máscara começa em `x + offX`. Dentro da máscara
 * a conta segue em célula e só vira centímetro na borda, porque é em célula que
 * `topo` e `base` estão escritos — converter cada um deles para cm e comparar
 * com tolerância introduziria um erro que não existe no modelo.
 */
function medirPosicao(pos) {
  if (!pos) return null;
  const x = Number(pos.x);
  const y = Number(pos.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const m = pos.mascara;
  const passo = Number(pos.passo);
  if (m) {
    // Máscara presente mas corrompida não vira um retângulo "válido".
    if (!Number.isFinite(passo) || passo <= 0 || !Number.isSafeInteger(m.cols) || m.cols <= 0
        || !Number.isSafeInteger(m.rows) || m.rows <= 0
        || !m.topo || !m.base || m.topo.length !== m.cols || m.base.length !== m.cols
        || !Number.isFinite(m.offX ?? 0) || !Number.isFinite(m.offY ?? 0)) return null;
    for (let c = 0; c < m.cols; c++) {
      const t = m.topo[c], b = m.base[c];
      if (t === -1 && b === -1) continue;
      if (!Number.isSafeInteger(t) || !Number.isSafeInteger(b) || t < 0 || b < t || b >= m.rows) return null;
    }
    const x0 = x + (m.offX || 0);
    const y0 = y + (m.offY || 0);
    const caixa = caixaDaMascara(m, x0, y0, passo);
    if (![x0, y0, caixa.esq, caixa.dir, caixa.topo, caixa.base].every(Number.isFinite)) return null;
    return {
      tipo: "mascara",
      passo,
      x0,
      y0,
      // A caixa envolvente sai das colunas que têm material, e não de
      // `cols`/`rows`: máscara com coluna vazia na ponta daria uma caixa maior
      // que a peça, e a fase grossa perderia poder de descarte.
      ...caixa,
      m,
    };
  }

  const largura = Number(pos.largura);
  const altura = Number(pos.altura);
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || !(largura > 0) || !(altura > 0)
      || !Number.isFinite(x + largura) || !Number.isFinite(y + altura)
      || x + largura === x || y + altura === y) return null;
  return {
    tipo: "caixa",
    esq: x, dir: x + largura,
    topo: y, base: y + altura,
  };
}

function caixaDaMascara(m, x0, y0, passo) {
  let primeira = -1;
  let ultima = -1;
  let menorTopo = Infinity;
  let maiorBase = -Infinity;
  for (let c = 0; c < m.cols; c++) {
    if (m.topo[c] < 0) continue;
    if (primeira < 0) primeira = c;
    ultima = c;
    if (m.topo[c] < menorTopo) menorTopo = m.topo[c];
    if (m.base[c] > maiorBase) maiorBase = m.base[c];
  }
  if (primeira < 0) return { esq: x0, dir: x0, topo: y0, base: y0, vazia: true };
  return {
    esq: x0 + primeira * passo,
    dir: x0 + (ultima + 1) * passo,
    topo: y0 + menorTopo * passo,
    base: y0 + (maiorBase + 1) * passo,
  };
}

/** As caixas se cruzam? Encostar não é cruzar: borda comum é folga zero, não sobreposição. */
function caixasCruzam(a, b) {
  const epsX = 32 * Number.EPSILON * Math.max(1, Math.abs(a.esq), Math.abs(a.dir), Math.abs(b.esq), Math.abs(b.dir));
  const epsY = 32 * Number.EPSILON * Math.max(1, Math.abs(a.topo), Math.abs(a.base), Math.abs(b.topo), Math.abs(b.base));
  return Math.min(a.dir, b.dir) - Math.max(a.esq, b.esq) > epsX
    && Math.min(a.base, b.base) - Math.max(a.topo, b.topo) > epsY;
}

/**
 * A fase fina entre duas peças que passaram da grossa.
 *
 * Devolve o ponto do cruzamento em centímetros, ou `null`. O ponto é o que faz
 * o aviso servir para alguma coisa: "há sobreposição" manda refazer, "a gola #3
 * está em cima da camiseta #1 a 42 cm do começo" manda olhar ali.
 */
function cruzamentoFino(a, b) {
  if (a.tipo === "caixa" && b.tipo === "caixa") {
    return [Math.max(a.esq, b.esq), Math.max(a.topo, b.topo)];
  }

  // Máscara contra caixa: a caixa vale como uma coluna só, de ponta a ponta.
  if (a.tipo === "mascara" && b.tipo === "caixa") return mascaraContraCaixa(a, b);
  if (a.tipo === "caixa" && b.tipo === "mascara") return mascaraContraCaixa(b, a);

  // Comparação contínua na origem local de A. Posições restauradas e o
  // compactador podem sair da grade; arredondar o deslocamento ocultava uma
  // sobreposição de até meia célula. Dois cursores também atendem passos
  // diferentes, em O(colsA + colsB), sem confundir caixa com silhueta.
  const dx = b.x0 - a.x0, dy = b.y0 - a.y0;
  // Só absorve erro de representação IEEE-754, nunca uma folga de fabricação.
  const epsX = 32 * Number.EPSILON * Math.max(1, Math.abs(a.x0), Math.abs(b.x0), a.m.cols * a.passo, b.m.cols * b.passo);
  const epsY = 32 * Number.EPSILON * Math.max(1, Math.abs(a.y0), Math.abs(b.y0), a.m.rows * a.passo, b.m.rows * b.passo);
  let ca = 0, cb = 0;
  while (ca < a.m.cols && cb < b.m.cols) {
    const aEsq = ca * a.passo, aDir = (ca + 1) * a.passo;
    const bEsq = dx + cb * b.passo, bDir = dx + (cb + 1) * b.passo;
    if (Math.min(aDir, bDir) - Math.max(aEsq, bEsq) > epsX
        && a.m.topo[ca] >= 0 && b.m.topo[cb] >= 0) {
      const topo = Math.max(a.m.topo[ca] * a.passo, dy + b.m.topo[cb] * b.passo);
      const base = Math.min((a.m.base[ca] + 1) * a.passo, dy + (b.m.base[cb] + 1) * b.passo);
      if (base - topo > epsY) {
        // Os cascos se cruzam. Sem trechos guardados o casco É a peça, e isto
        // é sobreposição. Com trechos (peça com cava — ver `faixasDaColuna`,
        // em encaixeMascara.js), confere trecho a trecho: uma peça pode morar
        // no vazio da coluna da outra (P7, 2026-11-10).
        if (!a.m.faixas && !b.m.faixas) return [a.x0 + Math.max(aEsq, bEsq), a.y0 + topo];
        for (const [aDe, aAte] of trechos(a.m, ca)) {
          for (const [bDe, bAte] of trechos(b.m, cb)) {
            const t = Math.max(aDe * a.passo, dy + bDe * b.passo);
            const f = Math.min((aAte + 1) * a.passo, dy + (bAte + 1) * b.passo);
            if (f - t > epsY) return [a.x0 + Math.max(aEsq, bEsq), a.y0 + t];
          }
        }
      }
    }
    if (aDir <= bDir) ca++;
    else cb++;
  }
  return null;
}

/**
 * Os trechos da coluna `c` de uma máscara: os de `faixas` quando há, ou o
 * único do topo/base. A mesma regra de `trechosDaColuna`, em encaixeMascara.js
 * — repetida aqui para a trava não depender do módulo da silhueta.
 */
function trechos(m, c) {
  if (!m.faixas) return m.topo[c] < 0 ? [] : [[m.topo[c], m.base[c]]];
  const lista = [];
  for (let k = m.faixas.ini[c]; k < m.faixas.ini[c + 1]; k++) lista.push([m.faixas.de[k], m.faixas.ate[k]]);
  return lista;
}

function mascaraContraCaixa(mask, caixa) {
  const passo = mask.passo;
  const deCol = Math.max(0, Math.floor((caixa.esq - mask.x0) / passo));
  const ateCol = Math.min(mask.m.cols - 1, Math.ceil((caixa.dir - mask.x0) / passo));
  for (let c = deCol; c <= ateCol; c++) {
    if (mask.m.topo[c] < 0) continue;
    const esq = mask.x0 + c * passo;
    const dir = esq + passo;
    if (dir <= caixa.esq || esq >= caixa.dir) continue;
    for (const [de, ate] of trechos(mask.m, c)) {
      const topo = mask.y0 + de * passo;
      const base = mask.y0 + (ate + 1) * passo;
      if (base <= caixa.topo || topo >= caixa.base) continue;
      return [Math.max(esq, caixa.esq), Math.max(topo, caixa.topo)];
    }
  }
  return null;
}

/** Como a peça aparece no aviso: o nome que a pessoa reconhece, e a cópia. */
function descrever(pos) {
  const item = pos && pos.item ? pos.item : {};
  const nome = item.nome || item.arquivo || `peça ${(item.indice ?? 0) + 1}`;
  const copia = item.copia == null ? null : item.copia;
  return copia == null ? String(nome) : `${nome} #${copia}`;
}

/**
 * Procura peça em cima de peça num encaixe pronto.
 *
 * Devolve `{ pares, exemplo, conferidas }`. `pares` conta cruzamentos de peças,
 * e não células: a contagem de células não diz nada a quem vai consertar, e o
 * número de pares diz — um par é uma peça perdida, cem pares é o encaixe
 * inteiro deslocado.
 *
 * `conferidas` é quantas posições entraram na conta. Existe para o caso chato:
 * encaixe sem passo, sem máscara e sem caixa não dá para conferir, e um guarda
 * que responde "limpo" sem ter olhado nada é pior que guarda nenhum. Quem chama
 * compara com o total e decide.
 */
export function acharSobreposicao(posicoes) {
  const lista = Array.isArray(posicoes) ? posicoes : [];
  const medidas = [];
  const indices = [];
  for (let i = 0; i < lista.length; i++) {
    const medida = medirPosicao(lista[i]);
    if (!medida || medida.vazia) continue;
    medidas.push(medida);
    indices.push(i);
  }

  let pares = 0;
  let exemplo = null;

  /*
   * A fase grossa, com um corte que a torna barata de verdade: as peças entram
   * ordenadas pelo topo, então a partir do momento em que uma começa abaixo do
   * fim da outra, todas as seguintes também começam abaixo — e o laço para.
   * Num encaixe válido isso transforma o O(n²) numa varredura de vizinhança.
   */
  const ordem = medidas.map((_, k) => k).sort((p, q) => medidas[p].topo - medidas[q].topo);

  for (let a = 0; a < ordem.length; a++) {
    const ma = medidas[ordem[a]];
    for (let b = a + 1; b < ordem.length; b++) {
      const mb = medidas[ordem[b]];
      if (mb.topo >= ma.base) break;
      if (!caixasCruzam(ma, mb)) continue;
      const onde = cruzamentoFino(ma, mb);
      if (!onde) continue;
      pares++;
      if (!exemplo) {
        exemplo = {
          a: descrever(lista[indices[ordem[a]]]),
          b: descrever(lista[indices[ordem[b]]]),
          cm: [Number(onde[0].toFixed(1)), Number(onde[1].toFixed(1))],
        };
      }
    }
  }

  return { pares, exemplo, conferidas: medidas.length };
}

/**
 * O recado para a tela, ou `null` quando o encaixe está limpo.
 *
 * Fica aqui, e não na tela, porque a mesma frase serve a qualquer lugar que
 * recuse um encaixe — e porque a regra de QUANDO recusar não é assunto de
 * interface.
 */
export function recusarPorSobreposicao(resultado) {
  if (!resultado || !Array.isArray(resultado.posicoes) || resultado.posicoes.length === 0) {
    return null;
  }
  const { pares, exemplo, conferidas } = acharSobreposicao(resultado.posicoes);

  // Nada conferível não é "limpo": é um encaixe sobre o qual não se pode
  // afirmar nada, e afirmar "limpo" ali seria o guarda mentindo.
  if (conferidas !== resultado.posicoes.length) {
    return "Não deu para conferir todas as peças — este encaixe não"
      + " pode ir para a produção. Refaça a procura.";
  }
  if (pares === 0) return null;

  const onde = exemplo
    ? ` Uma delas: ${exemplo.a} em cima de ${exemplo.b}, a ${exemplo.cm[0]} cm da borda`
      + ` e ${exemplo.cm[1]} cm do começo do rolo.`
    : "";
  const quantas = pares === 1 ? "Duas peças estão" : `${pares} pares de peças estão`;
  return `${quantas} uma em cima da outra, então este encaixe está travado e não vai`
    + ` para a produção.${onde} Refaça a procura em vez de reaproveitar o encaixe guardado.`;
}
