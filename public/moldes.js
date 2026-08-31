/**
 * Leitura de molde vetorial para a tela de Encaixe: hoje DXF e PLT/HP-GL.
 *
 * Os dois formatos guardam a mesma coisa de jeitos diferentes — o DXF em pares
 * "código / valor", o PLT em comandos de caneta de plotter. Cada leitor cuida
 * do seu formato e entrega a mesma coisa: uma lista de traços soltos. Daí pra
 * frente o caminho é comum:
 *   1. costurar os traços soltos em contornos fechados;
 *   2. decidir quem é peça e quem é furo, por quem está dentro de quem;
 *   3. converter para centímetros e desenhar cada molde numa imagem.
 *
 * O passo 3 é o que faz o molde entrar no encaixe sem mudar mais nada: ele
 * vira uma imagem de fundo transparente, exatamente como um PNG recortado, e
 * daí pra frente é o mesmo caminho de sempre.
 */

// $INSUNITS do cabeçalho: quanto vale 1 unidade do arquivo em centímetros.
const DXF_UNIDADES = {
  1: { fator: 2.54, nome: "polegada" },
  2: { fator: 30.48, nome: "pé" },
  4: { fator: 0.1, nome: "mm" },
  5: { fator: 1, nome: "cm" },
  6: { fator: 100, nome: "m" },
};

const DXF_TOLERANCIA_MIN = 1e-6;

// ==================== LEITURA DOS PARES ====================

function paresDXF(texto) {
  const linhas = texto.split(/\r?\n/);
  const pares = [];
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const codigo = Number(linhas[i].trim());
    if (!Number.isInteger(codigo)) return null; // desalinhou: não é DXF ASCII
    pares.push([codigo, linhas[i + 1].trim()]);
  }
  return pares;
}

/**
 * Separa o arquivo em cabeçalho, entidades soltas e blocos. Bloco é um desenho
 * guardado com nome, que o INSERT depois posiciona — muito usado para repetir
 * o mesmo molde em tamanhos diferentes.
 */
function estruturaDXF(pares) {
  const cabecalho = {};
  const entidades = [];
  const blocos = {};

  let secao = null;
  let variavel = null;
  let blocoAtual = null;
  let entidadeAtual = null;

  const destino = () => (blocoAtual ? blocoAtual.entidades : entidades);

  pares.forEach(([codigo, valor], i) => {
    if (codigo === 0) {
      entidadeAtual = null;

      if (valor === "SECTION") {
        const proximo = pares[i + 1];
        secao = proximo && proximo[0] === 2 ? proximo[1] : null;
        return;
      }
      if (valor === "ENDSEC") { secao = null; blocoAtual = null; return; }
      if (valor === "EOF") return;

      if (secao === "BLOCKS" && valor === "BLOCK") {
        blocoAtual = { nome: null, base: { x: 0, y: 0 }, entidades: [] };
        entidadeAtual = { tipo: "BLOCK", dados: [] };
        blocoAtual.cabecalho = entidadeAtual;
        return;
      }
      if (valor === "ENDBLK") {
        if (blocoAtual) {
          blocoAtual.nome = valorDe(blocoAtual.cabecalho, 2);
          blocoAtual.base = {
            x: Number(valorDe(blocoAtual.cabecalho, 10)) || 0,
            y: Number(valorDe(blocoAtual.cabecalho, 20)) || 0,
          };
          if (blocoAtual.nome) blocos[blocoAtual.nome] = blocoAtual;
        }
        blocoAtual = null;
        return;
      }

      if (secao === "ENTITIES" || secao === "BLOCKS") {
        entidadeAtual = { tipo: valor, dados: [] };
        destino().push(entidadeAtual);
      }
      return;
    }

    if (secao === "HEADER") {
      if (codigo === 9) variavel = valor;
      else if (variavel) cabecalho[variavel] = valor;
      return;
    }

    if (entidadeAtual) entidadeAtual.dados.push([codigo, valor]);
  });

  return { cabecalho, entidades, blocos };
}

function valorDe(entidade, codigo, padrao) {
  const achado = entidade.dados.find(([c]) => c === codigo);
  return achado ? achado[1] : padrao;
}
function numeroDe(entidade, codigo, padrao = 0) {
  const v = Number(valorDe(entidade, codigo));
  return Number.isFinite(v) ? v : padrao;
}

// ==================== GEOMETRIA ====================

const grausParaRad = (g) => (g * Math.PI) / 180;

/** Quebra um arco em trechos retos: ~9° por trecho dá curva lisa o bastante. */
function pontosDeArco(cx, cy, raio, angIni, angFim, sentidoHorario = false) {
  let total = angFim - angIni;
  if (!sentidoHorario) { while (total < 0) total += Math.PI * 2; }
  else { while (total > 0) total -= Math.PI * 2; }

  const passos = Math.max(2, Math.min(360, Math.ceil(Math.abs(total) / 0.16)));
  const pontos = [];
  for (let i = 0; i <= passos; i++) {
    const a = angIni + (total * i) / passos;
    pontos.push({ x: cx + raio * Math.cos(a), y: cy + raio * Math.sin(a) });
  }
  return pontos;
}

/**
 * "Bulge" é como a polilinha do DXF guarda um arco entre dois vértices:
 * bulge = tan(ângulo/4), positivo no sentido anti-horário.
 */
function pontosDeBulge(p1, p2, bulge) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const corda = Math.hypot(dx, dy);
  if (!bulge || corda < DXF_TOLERANCIA_MIN) return [p2];

  const angulo = 4 * Math.atan(bulge);
  const raio = corda / (2 * Math.sin(angulo / 2));
  const altura = raio * Math.cos(angulo / 2);
  // perpendicular à esquerda de p1->p2: é desse lado que fica o centro
  const cx = (p1.x + p2.x) / 2 + (-dy / corda) * altura;
  const cy = (p1.y + p2.y) / 2 + (dx / corda) * altura;

  const ini = Math.atan2(p1.y - cy, p1.x - cx);
  const passos = Math.max(2, Math.min(360, Math.ceil(Math.abs(angulo) / 0.16)));
  const pontos = [];
  for (let i = 1; i <= passos; i++) {
    const a = ini + (angulo * i) / passos;
    pontos.push({ x: cx + Math.abs(raio) * Math.cos(a), y: cy + Math.abs(raio) * Math.sin(a) });
  }
  return pontos;
}

/**
 * Avalia uma B-spline pelo algoritmo de De Boor. É o que os CADs usam nas
 * curvas suaves do molde (cava, gola, decote), então ler só os pontos de
 * controle deixaria a peça com o formato errado.
 */
function pontoBSpline(u, grau, nos, controle) {
  let k = grau;
  while (k < controle.length - 1 && nos[k + 1] <= u) k++;

  const d = [];
  for (let j = 0; j <= grau; j++) {
    const idx = Math.min(controle.length - 1, Math.max(0, j + k - grau));
    d[j] = { x: controle[idx].x, y: controle[idx].y };
  }
  for (let r = 1; r <= grau; r++) {
    for (let j = grau; j >= r; j--) {
      const i = j + k - grau;
      const den = (nos[i + grau - r + 1] || 0) - (nos[i] || 0);
      const alfa = Math.abs(den) < DXF_TOLERANCIA_MIN ? 0 : (u - nos[i]) / den;
      d[j] = {
        x: (1 - alfa) * d[j - 1].x + alfa * d[j].x,
        y: (1 - alfa) * d[j - 1].y + alfa * d[j].y,
      };
    }
  }
  return d[grau];
}

function pontosDeSpline(entidade) {
  const grau = numeroDe(entidade, 71, 3);
  const nos = [];
  const controle = [];
  const ajuste = [];

  let x = null;
  entidade.dados.forEach(([codigo, valor]) => {
    const n = Number(valor);
    if (codigo === 40) nos.push(n);
    else if (codigo === 10) x = n;
    else if (codigo === 20 && x !== null) { controle.push({ x, y: n }); x = null; }
    else if (codigo === 11) x = n;
    else if (codigo === 21 && x !== null) { ajuste.push({ x, y: n }); x = null; }
  });

  // Os pontos de ajuste ficam em cima da curva: quando o arquivo traz uma
  // quantidade decente deles, usar direto é mais simples e igualmente fiel.
  if (ajuste.length >= 4) return ajuste;
  if (controle.length < 2) return ajuste.length ? ajuste : [];
  if (controle.length <= grau || nos.length < controle.length + grau + 1) return controle;

  const uIni = nos[grau];
  const uFim = nos[controle.length];
  if (!(uFim > uIni)) return controle;

  const passos = Math.max(16, Math.min(400, controle.length * 12));
  const pontos = [];
  for (let i = 0; i <= passos; i++) {
    const u = uIni + ((uFim - uIni) * i) / passos;
    pontos.push(pontoBSpline(Math.min(u, uFim - 1e-9), grau, nos, controle));
  }
  return pontos;
}

/** Lê os vértices de LWPOLYLINE / VERTEX na ordem, respeitando os bulges. */
function verticesSequenciais(dados) {
  const vertices = [];
  let atual = null;
  dados.forEach(([codigo, valor]) => {
    const n = Number(valor);
    if (codigo === 10) {
      if (atual) vertices.push(atual);
      atual = { x: n, y: 0, bulge: 0 };
    } else if (codigo === 20 && atual) atual.y = n;
    else if (codigo === 42 && atual) atual.bulge = n;
  });
  if (atual) vertices.push(atual);
  return vertices;
}

function polilinhaDeVertices(vertices, fechada) {
  const pontos = [];
  vertices.forEach((v, i) => {
    if (i === 0) pontos.push({ x: v.x, y: v.y });
    const proximo = vertices[i + 1] || (fechada ? vertices[0] : null);
    if (!proximo) return;
    if (v.bulge) pontosDeBulge(v, proximo, v.bulge).forEach((p) => pontos.push(p));
    else pontos.push({ x: proximo.x, y: proximo.y });
  });
  return pontos;
}

/**
 * Converte uma entidade em linhas de pontos. INSERT entra aqui de novo, para
 * o bloco ser desenhado já na posição, escala e rotação pedidas.
 */
function linhasDaEntidade(entidade, blocos, profundidade = 0) {
  const tipo = entidade.tipo;

  if (tipo === "LINE") {
    return [{
      pontos: [
        { x: numeroDe(entidade, 10), y: numeroDe(entidade, 20) },
        { x: numeroDe(entidade, 11), y: numeroDe(entidade, 21) },
      ],
      fechada: false,
    }];
  }

  if (tipo === "LWPOLYLINE") {
    const fechada = (numeroDe(entidade, 70) & 1) === 1;
    const vertices = verticesSequenciais(entidade.dados);
    if (vertices.length < 2) return [];
    return [{ pontos: polilinhaDeVertices(vertices, fechada), fechada }];
  }

  if (tipo === "POLYLINE") {
    const fechada = (numeroDe(entidade, 70) & 1) === 1;
    const vertices = (entidade.vertices || []).map((v) => ({
      x: numeroDe(v, 10), y: numeroDe(v, 20), bulge: numeroDe(v, 42),
    }));
    if (vertices.length < 2) return [];
    return [{ pontos: polilinhaDeVertices(vertices, fechada), fechada }];
  }

  if (tipo === "ARC") {
    const pontos = pontosDeArco(
      numeroDe(entidade, 10), numeroDe(entidade, 20), numeroDe(entidade, 40),
      grausParaRad(numeroDe(entidade, 50)), grausParaRad(numeroDe(entidade, 51))
    );
    return [{ pontos, fechada: false }];
  }

  if (tipo === "CIRCLE") {
    const pontos = pontosDeArco(
      numeroDe(entidade, 10), numeroDe(entidade, 20), numeroDe(entidade, 40), 0, Math.PI * 2
    );
    return [{ pontos, fechada: true }];
  }

  if (tipo === "ELLIPSE") {
    const cx = numeroDe(entidade, 10), cy = numeroDe(entidade, 20);
    const ex = numeroDe(entidade, 11), ey = numeroDe(entidade, 21);
    const razao = numeroDe(entidade, 40, 1);
    const ini = numeroDe(entidade, 41, 0);
    const fim = numeroDe(entidade, 42, Math.PI * 2);
    const maior = Math.hypot(ex, ey);
    const giro = Math.atan2(ey, ex);
    const passos = Math.max(24, Math.ceil(Math.abs(fim - ini) / 0.16));
    const pontos = [];
    for (let i = 0; i <= passos; i++) {
      const t = ini + ((fim - ini) * i) / passos;
      const px = maior * Math.cos(t);
      const py = maior * razao * Math.sin(t);
      pontos.push({
        x: cx + px * Math.cos(giro) - py * Math.sin(giro),
        y: cy + px * Math.sin(giro) + py * Math.cos(giro),
      });
    }
    return [{ pontos, fechada: Math.abs(Math.abs(fim - ini) - Math.PI * 2) < 1e-6 }];
  }

  if (tipo === "SPLINE") {
    const pontos = pontosDeSpline(entidade);
    if (pontos.length < 2) return [];
    return [{ pontos, fechada: (numeroDe(entidade, 70) & 1) === 1 }];
  }

  if (tipo === "INSERT" && profundidade < 8) {
    const bloco = blocos[valorDe(entidade, 2)];
    if (!bloco) return [];
    const ox = numeroDe(entidade, 10), oy = numeroDe(entidade, 20);
    const ex = numeroDe(entidade, 41, 1) || 1;
    const ey = numeroDe(entidade, 42, 1) || 1;
    const giro = grausParaRad(numeroDe(entidade, 50));
    const cos = Math.cos(giro), sen = Math.sin(giro);

    const saida = [];
    bloco.entidades.forEach((filha) => {
      linhasDaEntidade(filha, blocos, profundidade + 1).forEach((linha) => {
        saida.push({
          fechada: linha.fechada,
          pontos: linha.pontos.map((p) => {
            const bx = (p.x - bloco.base.x) * ex;
            const by = (p.y - bloco.base.y) * ey;
            return { x: ox + bx * cos - by * sen, y: oy + bx * sen + by * cos };
          }),
        });
      });
    });
    return saida;
  }

  return [];
}

// ==================== CONTORNOS ====================

function areaDoLaco(pontos) {
  let soma = 0;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    soma += (pontos[j].x + pontos[i].x) * (pontos[j].y - pontos[i].y);
  }
  return soma / 2;
}


function pontoDentro(p, pontos) {
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const cruza = pontos[i].y > p.y !== pontos[j].y > p.y;
    if (!cruza) continue;
    const x = ((pontos[j].x - pontos[i].x) * (p.y - pontos[i].y)) / (pontos[j].y - pontos[i].y) + pontos[i].x;
    if (p.x < x) dentro = !dentro;
  }
  return dentro;
}

/**
 * Costura os traços soltos em contornos fechados. O molde costuma vir
 * quebrado em vários pedaços (reta, curva, reta...), então a gente segue
 * emendando pela ponta mais próxima até fechar a volta.
 */
function montarLacos(linhas, tolerancia) {
  const lacos = [];
  const soltas = [];

  linhas.forEach((linha) => {
    const pontos = limparRepetidos(linha.pontos, tolerancia);
    if (pontos.length < 2) return;
    const fechaSozinha = linha.fechada || distancia(pontos[0], pontos[pontos.length - 1]) <= tolerancia;
    if (fechaSozinha && pontos.length >= 3) lacos.push(pontos);
    else soltas.push(pontos);
  });

  const usada = new Array(soltas.length).fill(false);
  for (let i = 0; i < soltas.length; i++) {
    if (usada[i]) continue;
    usada[i] = true;
    let corrente = soltas[i].slice();

    let emendou = true;
    while (emendou) {
      emendou = false;
      const fim = corrente[corrente.length - 1];
      for (let j = 0; j < soltas.length; j++) {
        if (usada[j]) continue;
        const outra = soltas[j];
        const noInicio = distancia(fim, outra[0]) <= tolerancia;
        const noFim = distancia(fim, outra[outra.length - 1]) <= tolerancia;
        if (!noInicio && !noFim) continue;
        const trecho = noInicio ? outra.slice(1) : outra.slice(0, -1).reverse();
        trecho.forEach((p) => corrente.push(p));
        usada[j] = true;
        emendou = true;
        break;
      }
      if (distancia(corrente[0], corrente[corrente.length - 1]) <= tolerancia) break;
    }

    // Fecha uma folga pequena que sobrou: molde de CAD costuma ter uns
    // centésimos de diferença entre a ponta de um traço e o começo do outro.
    const folga = distancia(corrente[0], corrente[corrente.length - 1]);
    if (corrente.length >= 3 && folga <= tolerancia * 40) lacos.push(corrente);
  }

  return lacos;
}

const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function limparRepetidos(pontos, tolerancia) {
  const saida = [];
  pontos.forEach((p) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const ultimo = saida[saida.length - 1];
    if (ultimo && distancia(ultimo, p) <= tolerancia * 0.5) return;
    saida.push(p);
  });
  return saida;
}

/**
 * Quem está dentro de quem: laço solto vira peça, laço interno vira furo.
 *
 * Antes disso, dois tipos de traço são jogados fora, porque não são peça:
 *
 *  - **a folha**: quase todo export traz um retângulo do tamanho da página —
 *    o fundo branco, a moldura, a área de corte. Ele é o maior laço de todos e
 *    engolia o desenho inteiro: o molde saía como uma peça do tamanho da folha
 *    e as peças de verdade viravam furos dentro dela;
 *  - **o traço repetido**: peça desenhada duas vezes (uma para preencher,
 *    outra para contornar) chegava como duas peças iguais, uma em cima da
 *    outra.
 */
function ehQuaseAMesmaCaixa(a, b, folga) {
  return Math.abs(a.minX - b.minX) <= folga && Math.abs(a.minY - b.minY) <= folga
    && Math.abs(a.maxX - b.maxX) <= folga && Math.abs(a.maxY - b.maxY) <= folga;
}

function tirarRepetidos(info, folga) {
  const ficam = [];
  info.forEach((laco) => {
    const igual = ficam.find((f) => ehQuaseAMesmaCaixa(f.caixa, laco.caixa, folga)
      && Math.abs(f.area - laco.area) <= Math.max(f.area, laco.area) * 0.02);
    if (!igual) ficam.push(laco);
  });
  return ficam;
}

/**
 * A folha é o laço que cobre quase todo o desenho e tem **peça** dentro.
 *
 * As duas condições importam. Sem a primeira, qualquer peça com furo viraria
 * folha. Sem a segunda, um molde de peça única — que também ocupa o desenho
 * inteiro — seria jogado fora e não sobraria nada. O que separa "peça dentro"
 * de "furo dentro" é o tamanho: um piquete é um confete perto da peça; uma
 * peça dentro da folha ocupa um pedaço de verdade dela.
 */
const FOLHA_COBERTURA = 0.9;   // quanto do desenho o laço precisa cobrir
const FOLHA_CONTEUDO = 0.15;   // quanto da folha o que está dentro precisa ocupar

function ehAFolha(laco, caixaGeral, info) {
  const areaGeral = Math.max(1e-9, caixaGeral.largura * caixaGeral.altura);
  const cobertura = (laco.caixa.largura * laco.caixa.altura) / areaGeral;
  if (cobertura < FOLHA_COBERTURA) return false;

  const dentro = info.filter((outro) => outro !== laco && outro.area < laco.area * 0.9
    && pontoDentro(outro.pontos[0], laco.pontos));
  if (dentro.length === 0) return false;
  const maiorDentro = Math.max(...dentro.map((d) => d.area));
  return maiorDentro >= laco.area * FOLHA_CONTEUDO;
}

function separarPecasEFuros(lacos, areaMinimaPeca, caixaGeral) {
  let info = lacos.map((pontos) => ({
    pontos,
    area: Math.abs(areaDoLaco(pontos)),
    caixa: caixaDeContorno(pontos),
  }));
  info.sort((a, b) => b.area - a.area);

  const folga = Math.max(caixaGeral.largura, caixaGeral.altura) * 0.005;
  info = tirarRepetidos(info, folga);

  const semFolha = info.filter((laco) => !ehAFolha(laco, caixaGeral, info));
  const descartouFolha = semFolha.length < info.length;
  info = semFolha.length > 0 ? semFolha : info;

  const pecas = [];
  info.forEach((laco) => {
    const referencia = laco.pontos[0];
    const pai = pecas.find((p) =>
      p.area > laco.area &&
      referencia.x >= p.caixa.minX && referencia.x <= p.caixa.maxX &&
      referencia.y >= p.caixa.minY && referencia.y <= p.caixa.maxY &&
      pontoDentro(referencia, p.pontos));

    if (pai) pai.furos.push(laco.pontos);
    else if (laco.area >= areaMinimaPeca) pecas.push({ ...laco, furos: [] });
  });

  return { pecas, descartouFolha };
}

// ==================== O ARQUIVO INTEIRO COMO UMA PEÇA ====================

/**
 * Nem todo arquivo vetorial é um marcador.
 *
 * Um marcador traz as peças do molde, cada uma no seu lugar, e cada laço
 * fechado é uma peça. Uma **arte** traz um desenho: círculo, faixa, letra,
 * dezenas de formas soltas que juntas são uma coisa só. Lendo arte como
 * marcador, cada forma virava uma peça — que é o que a pessoa vê quando diz
 * que o sistema "leu cada camada em vez do arquivo inteiro".
 *
 * Aqui o arquivo é lido do outro jeito: tudo o que foi desenhado é pintado
 * numa grade e o que sai é **o contorno de fora da mancha toda**, uma peça só.
 */


const INTEIRO_CELULAS = 420;      // resolução da grade no lado maior
const INTEIRO_SIMPLIFICA = 0.6;   // em células: quanto o contorno pode ser aliviado

/** Pinta um laço na grade, linha por linha (regra do par-ímpar). */
function pintarLaco(mascara, cols, rows, pontos, paraCelula) {
  const celulas = pontos.map(paraCelula);
  let minY = Infinity, maxY = -Infinity;
  celulas.forEach((p) => { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; });

  const deLinha = Math.max(0, Math.floor(minY));
  const ateLinha = Math.min(rows - 1, Math.ceil(maxY));
  for (let y = deLinha; y <= ateLinha; y++) {
    const meio = y + 0.5;
    const cortes = [];
    for (let i = 0, j = celulas.length - 1; i < celulas.length; j = i++) {
      const a = celulas[j], b = celulas[i];
      if ((a.y > meio) === (b.y > meio)) continue;
      cortes.push(a.x + ((meio - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    cortes.sort((u, v) => u - v);
    for (let k = 0; k + 1 < cortes.length; k += 2) {
      const de = Math.max(0, Math.ceil(cortes[k] - 0.5));
      const ate = Math.min(cols - 1, Math.floor(cortes[k + 1] - 0.5));
      for (let x = de; x <= ate; x++) mascara[y * cols + x] = 1;
    }
  }
}

/**
 * Também pinta o traço, para que linha aberta não suma da mancha.
 *
 * O traço sai com duas células de grossura de propósito: com uma só, uma linha
 * inclinada anda na diagonal e a mancha fica cheia de furinhos — o contorno
 * então enxergava dezenas de pedaços soltos onde havia um risco só.
 */
function pintarTraco(mascara, cols, rows, pontos, paraCelula) {
  const celulas = pontos.map(paraCelula);
  const marcar = (x, y) => {
    if (x >= 0 && y >= 0 && x < cols && y < rows) mascara[y * cols + x] = 1;
  };
  for (let i = 1; i < celulas.length; i++) {
    const a = celulas[i - 1], b = celulas[i];
    const passos = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let k = 0; k <= passos; k++) {
      const x = Math.round(a.x + ((b.x - a.x) * k) / passos);
      const y = Math.round(a.y + ((b.y - a.y) * k) / passos);
      marcar(x, y); marcar(x + 1, y); marcar(x, y + 1); marcar(x + 1, y + 1);
    }
  }
}

/**
 * Anda pela borda da mancha e devolve o contorno de fora.
 *
 * O caminho passa pelos **cantos** das células, não pelo meio delas: passando
 * pelo meio, o contorno sai encolhido meia célula para dentro e a peça fica
 * menor do que é de verdade.
 */
function contornoDaMancha(mascara, cols, rows) {
  const cheia = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && mascara[y * cols + x] === 1;

  let inicio = null;
  for (let y = 0; y < rows && !inicio; y++) {
    for (let x = 0; x < cols; x++) if (cheia(x, y)) { inicio = { x, y }; break; }
  }
  if (!inicio) return [];

  const CIMA = 0, DIREITA = 1, BAIXO = 2, ESQUERDA = 3;
  const anda = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  // Em cada canto, as quatro células em volta dizem para onde a borda segue.
  // Os dois casos de "sela" (5 e 10) dependem de por onde se chegou: é o que
  // faz o caminho contornar a mancha por fora em vez de cortar pelo meio.
  const paraOnde = (estado, veio) => {
    switch (estado) {
      case 1: return CIMA;
      case 2: return DIREITA;
      case 3: return DIREITA;
      case 4: return ESQUERDA;
      case 5: return CIMA;
      case 6: return veio === CIMA ? ESQUERDA : DIREITA;
      case 7: return DIREITA;
      case 8: return BAIXO;
      case 9: return veio === DIREITA ? CIMA : BAIXO;
      case 10: return BAIXO;
      case 11: return BAIXO;
      case 12: return ESQUERDA;
      case 13: return CIMA;
      case 14: return ESQUERDA;
      default: return -1;
    }
  };

  let x = inicio.x, y = inicio.y;
  let direcao = BAIXO;
  const pontos = [];
  const teto = (cols + rows) * 4 + 16;

  for (let passo = 0; passo < teto; passo++) {
    pontos.push({ x, y });
    const estado = (cheia(x - 1, y - 1) ? 1 : 0) | (cheia(x, y - 1) ? 2 : 0)
      | (cheia(x - 1, y) ? 4 : 0) | (cheia(x, y) ? 8 : 0);
    const proxima = paraOnde(estado, direcao);
    if (proxima < 0) break;
    direcao = proxima;
    x += anda[direcao][0];
    y += anda[direcao][1];
    if (x === inicio.x && y === inicio.y) break;
  }

  return pontos;
}

/** Douglas–Peucker: tira ponto que quase não muda a linha. */
function aliviarContorno(pontos, tolerancia) {
  if (pontos.length < 3) return pontos;
  const distanciaDaReta = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const tamanho = Math.hypot(dx, dy);
    if (tamanho < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / tamanho;
  };
  const guardar = new Uint8Array(pontos.length);
  guardar[0] = 1;
  guardar[pontos.length - 1] = 1;
  const pilha = [[0, pontos.length - 1]];
  while (pilha.length > 0) {
    const [ini, fim] = pilha.pop();
    let pior = -1, distancia = tolerancia;
    for (let i = ini + 1; i < fim; i++) {
      const d = distanciaDaReta(pontos[i], pontos[ini], pontos[fim]);
      if (d > distancia) { distancia = d; pior = i; }
    }
    if (pior > 0) { guardar[pior] = 1; pilha.push([ini, pior], [pior, fim]); }
  }
  return pontos.filter((p, i) => guardar[i]);
}

/**
 * Contorna cada mancha separada da grade. Duas formas que se tocam são uma
 * mancha só; duas soltas, duas manchas.
 */
function contornosDasManchas(mascara, cols, rows) {
  const visto = new Uint8Array(cols * rows);
  const contornos = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const p = y * cols + x;
      if (!mascara[p] || visto[p]) continue;

      // pinta esta mancha numa grade só dela, e contorna
      const soEsta = new Uint8Array(cols * rows);
      const pilha = [p];
      visto[p] = 1;
      while (pilha.length > 0) {
        const q = pilha.pop();
        soEsta[q] = 1;
        const qx = q % cols;
        const qy = (q - qx) / cols;
        [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]].forEach(([vx, vy]) => {
          if (vx < 0 || vy < 0 || vx >= cols || vy >= rows) return;
          const v = vy * cols + vx;
          if (mascara[v] && !visto[v]) { visto[v] = 1; pilha.push(v); }
        });
      }

      const contorno = contornoDaMancha(soEsta, cols, rows);
      if (contorno.length >= 3) contornos.push(contorno);
    }
  }

  return contornos;
}

/** Casco convexo (monotone chain): a volta mais apertada em torno de tudo. */
function cascoDeTodos(pontos) {
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

/**
 * Lê o arquivo inteiro como uma peça só: pinta tudo numa grade e devolve o
 * contorno de fora da mancha, já em centímetros.
 */
function moldeDoArquivoInteiro(linhas, textos, unidade, avisos, formato, inverterY) {
  const caixa = caixaDeContorno(linhas.flatMap((l) => l.pontos));
  const maiorLado = Math.max(caixa.largura, caixa.altura);
  if (!(maiorLado > 0)) {
    return { erro: `Não achei desenho nenhum nesse ${formato}.` };
  }

  const porCelula = maiorLado / INTEIRO_CELULAS;
  const cols = Math.max(2, Math.ceil(caixa.largura / porCelula) + 2);
  const rows = Math.max(2, Math.ceil(caixa.altura / porCelula) + 2);
  const mascara = new Uint8Array(cols * rows);
  const paraCelula = (p) => ({
    x: (p.x - caixa.minX) / porCelula + 1,
    y: (p.y - caixa.minY) / porCelula + 1,
  });

  const tolerancia = Math.max(maiorLado * 5e-4, DXF_TOLERANCIA_MIN);
  montarLacos(linhas, tolerancia).forEach((laco) => pintarLaco(mascara, cols, rows, laco, paraCelula));
  linhas.forEach((linha) => pintarTraco(mascara, cols, rows, linha.pontos, paraCelula));

  // O desenho pode estar em pedaços soltos (um logo aqui, um texto ali). Cada
  // mancha é contornada por si, e no fim vira uma peça só: entre os pedaços
  // também tem tecido, então o que vale é a volta por fora de tudo.
  const manchas = contornosDasManchas(mascara, cols, rows);
  if (manchas.length === 0) {
    return { erro: `Não consegui achar o contorno de fora desse ${formato}.` };
  }
  const bruto = manchas.length === 1
    ? manchas[0]
    : cascoDeTodos(manchas.flat());
  if (manchas.length > 1) {
    avisos.push(`O desenho está em ${manchas.length} pedaços soltos; fechei a volta por fora de todos.`);
  }
  if (bruto.length < 3) {
    return { erro: `Não consegui achar o contorno de fora desse ${formato}.` };
  }
  const contorno = aliviarContorno(bruto, INTEIRO_SIMPLIFICA)
    .map((p) => ({
      x: (p.x - 1) * porCelula * unidade.fator,
      y: (inverterY ? (rows - 2) - (p.y - 1) : p.y - 1) * porCelula * unidade.fator,
    }));

  const nome = (textos[0] || {}).texto || `${formato} inteiro`;
  return {
    moldes: [{
      nome,
      contorno,
      furos: [],
      largura: caixa.largura * unidade.fator,
      altura: caixa.altura * unidade.fator,
    }],
    unidade: unidade.nome,
    avisos,
  };
}

// ==================== MOLDES (comum aos formatos) ====================

/**
 * Recebe os traços soltos que o leitor do formato produziu e devolve os moldes
 * já em centímetros. É aqui que DXF e PLT se encontram: os dois entregam
 * `linhas` (listas de pontos) e `textos` (para nomear as peças), e daqui pra
 * frente o tratamento é idêntico.
 */
function montarMoldes(linhas, textos, unidade, avisos, formato, inverterY = true, modo = "marcador") {
  if (modo === "inteiro") {
    return moldeDoArquivoInteiro(linhas, textos, unidade, avisos, formato, inverterY);
  }

  const caixaGeral = caixaDeContorno(linhas.flatMap((l) => l.pontos));
  const tolerancia = Math.max(Math.max(caixaGeral.largura, caixaGeral.altura) * 5e-4, DXF_TOLERANCIA_MIN);
  const areaMinima = Math.pow(1 / unidade.fator, 2); // menos de 1 cm² é marca, não peça

  const lacos = montarLacos(linhas, tolerancia);
  if (lacos.length === 0) {
    return { erro: `Não achei nenhum contorno fechado nesse ${formato} — os traços do molde não fecham a volta.` };
  }

  const { pecas: brutos, descartouFolha } = separarPecasEFuros(lacos, areaMinima, caixaGeral);
  if (descartouFolha) {
    avisos.push("Havia um retângulo do tamanho da folha (fundo ou moldura); deixei ele de fora.");
  }

  const moldes = brutos.map((peca, i) => {
    const nome = (textos.find((t) => pontoDentro(t, peca.pontos)) || {}).texto || `Peça ${i + 1}`;
    // DXF e PLT crescem para cima e a tela cresce para baixo, então o Y é
    // invertido; o SVG já cresce para baixo e passa direto.
    const emCm = (pontos) => pontos.map((p) => ({
      x: (p.x - peca.caixa.minX) * unidade.fator,
      y: (inverterY ? peca.caixa.maxY - p.y : p.y - peca.caixa.minY) * unidade.fator,
    }));
    return {
      nome,
      contorno: emCm(peca.pontos),
      furos: peca.furos.map(emCm),
      largura: peca.caixa.largura * unidade.fator,
      altura: peca.caixa.altura * unidade.fator,
    };
  }).filter((m) => m.largura > 0.2 && m.altura > 0.2);

  const descartados = brutos.length - moldes.length;
  if (descartados > 0) avisos.push(`${descartados} contorno(s) muito pequeno(s) foram ignorados.`);

  return { moldes, unidade: unidade.nome, avisos };
}

// ==================== DXF ====================

/**
 * Lê o DXF e devolve os moldes já em centímetros.
 * `unidadeForcada` ("mm", "cm", "polegada", "m") manda no arquivo quando o
 * cabeçalho não diz a unidade ou diz errado.
 */
function lerMoldesDXF(texto, unidadeForcada, modo) {
  const pares = paresDXF(texto);
  if (!pares || pares.length === 0) {
    return { erro: "Não consegui ler esse DXF. Ele precisa estar em formato ASCII (DXF binário não serve)." };
  }

  const { cabecalho, entidades, blocos } = estruturaDXF(pares);
  amarrarVertices(entidades);
  Object.values(blocos).forEach((b) => amarrarVertices(b.entidades));

  // Junta tudo em traços soltos, guardando os textos para nomear as peças.
  const linhas = [];
  const textos = [];
  const coletar = (lista) => lista.forEach((ent) => {
    if (ent.tipo === "TEXT" || ent.tipo === "MTEXT" || ent.tipo === "ATTRIB") {
      const conteudo = valorDe(ent, 1, "").replace(/\\[A-Za-z][^;]*;/g, "").trim();
      if (conteudo) textos.push({ texto: conteudo, x: numeroDe(ent, 10), y: numeroDe(ent, 20) });
      return;
    }
    linhasDaEntidade(ent, blocos).forEach((l) => linhas.push(l));
  });
  coletar(entidades);

  if (linhas.length === 0) {
    return { erro: "Esse DXF não tem desenho que eu consiga ler (nenhuma linha, polilinha, arco ou spline)." };
  }

  const caixaGeral = caixaDeContorno(linhas.flatMap((l) => l.pontos));
  const forcada = Object.values(DXF_UNIDADES).find((u) => u.nome === unidadeForcada);
  const doCabecalho = DXF_UNIDADES[Number(cabecalho.$INSUNITS)];
  const unidade = forcada || doCabecalho || chutarUnidadeDXF(caixaGeral);

  const avisos = [];
  if (!forcada && !doCabecalho) {
    avisos.push(`O arquivo não diz a unidade; usei ${unidade.nome} pelo tamanho do desenho. Confira as medidas.`);
  }

  return montarMoldes(linhas, textos, unidade, avisos, "DXF", true, modo);
}

/** POLYLINE guarda os vértices em entidades VERTEX separadas, até o SEQEND. */
function amarrarVertices(entidades) {
  let atual = null;
  entidades.forEach((ent) => {
    if (ent.tipo === "POLYLINE") { atual = ent; atual.vertices = []; }
    else if (ent.tipo === "VERTEX" && atual) atual.vertices.push(ent);
    else if (ent.tipo === "SEQEND") atual = null;
    else if (ent.tipo !== "VERTEX") atual = null;
  });
}

/**
 * Sem $INSUNITS, o tamanho denuncia a unidade: molde de roupa tem dezenas de
 * centímetros, então um desenho com centenas de unidades quase certamente
 * está em milímetro.
 */
function chutarUnidadeDXF(caixa) {
  const maior = Math.max(caixa.largura, caixa.altura);
  if (maior > 300) return DXF_UNIDADES[4];   // mm
  if (maior > 12) return DXF_UNIDADES[5];    // cm
  return DXF_UNIDADES[1];                    // polegada
}

// ==================== PLT / HP-GL ====================

/**
 * PLT é a linguagem da mesa de corte: uma fila de comandos de caneta.
 * `PU` levanta a caneta (anda sem riscar), `PD` abaixa (risca), e cada troca
 * de PU para PD começa um traço novo. É o que a gente aproveita para separar
 * os pedaços do molde.
 *
 * Os comandos que interessam aqui:
 *   PU/PD  caneta acima/abaixo, com ou sem coordenadas
 *   PA/PR  passa a contar por coordenada absoluta ou relativa
 *   AA/AR  arco com centro absoluto/relativo e ângulo de varredura
 *   CI     círculo
 *   PE     polilinha codificada (o HP-GL/2 comprime os pontos em texto)
 *   LB     texto, usado para nomear a peça
 *   SC/IP  escala própria do arquivo — se aparecer, a medida pode sair errada
 *          e o aviso vai para a tela
 *
 * O resto (seleção de caneta, velocidade, tipo de linha) é ignorado de
 * propósito: não muda a geometria.
 */

// 1 unidade de plotter = 1/1016 de polegada. É o padrão do HP-GL e o que quase
// todo PLT usa, já que o formato não tem cabeçalho dizendo a unidade.
const PLT_UNIDADES = {
  plu: { fator: 2.54 / 1016, nome: "unidade de plotter" },
  mil: { fator: 2.54 / 1000, nome: "1000 por polegada" },
  mm: { fator: 0.1, nome: "mm" },
  cm: { fator: 1, nome: "cm" },
};

/** Quebra o arquivo em comandos de duas letras com seus parâmetros. */
function comandosPLT(texto) {
  const comandos = [];
  let i = 0;
  let terminadorLabel = String.fromCharCode(3); // ETX, o padrão do HP-GL

  const ehLetra = (c) => (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");

  while (i < texto.length) {
    const c = texto[i];
    if (!ehLetra(c)) { i++; continue; }
    if (i + 1 >= texto.length || !ehLetra(texto[i + 1])) { i++; continue; }

    const nome = (c + texto[i + 1]).toUpperCase();
    i += 2;

    // LB e PE carregam conteúdo que pode ter letras dentro, então cada um tem
    // sua própria regra de onde termina.
    if (nome === "LB") {
      let fim = texto.indexOf(terminadorLabel, i);
      if (fim < 0) fim = texto.length;
      comandos.push({ nome, bruto: texto.slice(i, fim) });
      i = fim + 1;
      continue;
    }
    if (nome === "PE") {
      let fim = texto.indexOf(";", i);
      if (fim < 0) fim = texto.length;
      comandos.push({ nome, bruto: texto.slice(i, fim) });
      i = fim + 1;
      continue;
    }

    let fim = i;
    while (fim < texto.length && texto[fim] !== ";" && !ehLetra(texto[fim])) fim++;
    const bruto = texto.slice(i, fim);
    i = texto[fim] === ";" ? fim + 1 : fim;

    if (nome === "DT" && bruto.length > 0) terminadorLabel = bruto[0];

    comandos.push({
      nome,
      bruto,
      numeros: bruto.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n)),
    });
  }
  return comandos;
}

/**
 * Lê um número do PE. Os pontos vêm empacotados em pedaços de 5 ou 6 bits por
 * caractere; o último caractere do número vem de uma faixa diferente, e é
 * assim que se sabe onde ele acaba.
 */
function numeroPE(texto, i, base32) {
  let valor = 0;
  let deslocamento = 0;

  while (i < texto.length) {
    const c = texto.charCodeAt(i++);
    if (base32) {
      if (c >= 63 && c <= 94) { valor += (c - 63) * Math.pow(2, deslocamento); deslocamento += 5; continue; }
      if (c >= 95 && c <= 126) { valor += (c - 95) * Math.pow(2, deslocamento); return { valor, i, ok: true }; }
    } else {
      if (c >= 63 && c <= 126) { valor += (c - 63) * Math.pow(2, deslocamento); deslocamento += 6; continue; }
      if (c >= 191 && c <= 254) { valor += (c - 191) * Math.pow(2, deslocamento); return { valor, i, ok: true }; }
    }
    if (c === 10 || c === 13 || c === 32 || c === 9) continue; // quebra de linha no meio do dado
    return { ok: false, i };
  }
  return { ok: false, i };
}

/** O bit mais baixo guarda o sinal; o resto é o número, dividido pela fração. */
function valorPEParaNumero(valor, fracao) {
  const inteiro = valor % 2 === 1 ? -(valor - 1) / 2 : valor / 2;
  return fracao > 0 ? inteiro / Math.pow(2, fracao) : inteiro;
}

// ==================== ENTRADA PRINCIPAL (PLT) ====================

/**
 * Lê o PLT e devolve os moldes já em centímetros.
 * `unidadeForcada` ("unidade de plotter", "1000 por polegada", "mm", "cm")
 * manda no arquivo quando o chute automático sair errado.
 */
function lerMoldesPLT(texto, unidadeForcada, modo) {
  const comandos = comandosPLT(texto);
  if (comandos.length === 0) {
    return { erro: "Não consegui ler esse PLT: não achei nenhum comando de plotter no arquivo." };
  }

  const linhas = [];
  const textos = [];
  const avisos = [];

  let x = 0, y = 0;
  let canetaAbaixada = false;
  let absoluto = true;
  let atual = null; // traço em construção

  const fecharTraco = () => {
    if (atual && atual.pontos.length >= 2) linhas.push(atual);
    atual = null;
  };
  const irPara = (nx, ny) => {
    if (canetaAbaixada) {
      if (!atual) atual = { pontos: [{ x, y }], fechada: false };
      atual.pontos.push({ x: nx, y: ny });
    } else {
      fecharTraco();
    }
    x = nx; y = ny;
  };
  const mover = (dx, dy) => irPara(absoluto ? dx : x + dx, absoluto ? dy : y + dy);

  let usouEscalaPropria = false;

  comandos.forEach((cmd) => {
    const n = cmd.numeros || [];

    switch (cmd.nome) {
      case "PU":
        fecharTraco();
        canetaAbaixada = false;
        for (let i = 0; i + 1 < n.length; i += 2) mover(n[i], n[i + 1]);
        break;

      case "PD":
        canetaAbaixada = true;
        for (let i = 0; i + 1 < n.length; i += 2) mover(n[i], n[i + 1]);
        break;

      case "PA":
        absoluto = true;
        for (let i = 0; i + 1 < n.length; i += 2) mover(n[i], n[i + 1]);
        break;

      case "PR":
        absoluto = false;
        for (let i = 0; i + 1 < n.length; i += 2) mover(n[i], n[i + 1]);
        break;

      case "AA":
      case "AR": {
        if (n.length < 3) break;
        const cx = cmd.nome === "AA" ? n[0] : x + n[0];
        const cy = cmd.nome === "AA" ? n[1] : y + n[1];
        const varredura = grausParaRad(n[2]);
        const raio = Math.hypot(x - cx, y - cy);
        const inicio = Math.atan2(y - cy, x - cx);
        const pontos = pontosDeArco(cx, cy, raio, inicio, inicio + varredura, varredura < 0);
        pontos.slice(1).forEach((p) => irPara(p.x, p.y));
        break;
      }

      case "CI": {
        if (n.length < 1) break;
        const pontos = pontosDeArco(x, y, n[0], 0, Math.PI * 2);
        // O círculo não move a caneta: desenha e volta para onde estava.
        linhas.push({ pontos, fechada: true });
        break;
      }

      case "PE": {
        fecharTraco();
        const lido = lerPE(cmd.bruto, { x, y, canetaAbaixada });
        lido.linhas.forEach((l) => linhas.push(l));
        x = lido.x; y = lido.y;
        canetaAbaixada = lido.canetaAbaixada;
        break;
      }

      case "LB":
        if (cmd.bruto && cmd.bruto.trim()) {
          textos.push({ texto: cmd.bruto.replace(/[\r\n\x03]/g, "").trim(), x, y });
        }
        break;

      case "SC":
      case "IP":
        if (n.length > 0) usouEscalaPropria = true;
        break;

      default:
        break;
    }
  });
  fecharTraco();

  if (linhas.length === 0) {
    return { erro: "Esse PLT não tem nenhum traço desenhado (nenhum PD, arco ou polilinha)." };
  }

  const caixaGeral = caixaDeContorno(linhas.flatMap((l) => l.pontos));
  const forcada = Object.values(PLT_UNIDADES).find((u) => u.nome === unidadeForcada);
  const unidade = forcada || chutarUnidadePLT(caixaGeral);

  if (!forcada && unidade !== PLT_UNIDADES.plu) {
    avisos.push(
      `O PLT não diz a unidade e, em unidade de plotter, o molde sairia com um tamanho ` +
      `improvável; usei ${unidade.nome}. Confira as medidas.`);
  }
  if (usouEscalaPropria) {
    avisos.push("O arquivo define escala própria (SC/IP), que eu não aplico — confira as medidas.");
  }

  return montarMoldes(linhas, textos, unidade, avisos, "PLT", true, modo);
}

/** Percorre o conteúdo de um PE montando os traços. */
function lerPE(bruto, estado) {
  let x = estado.x, y = estado.y;
  let canetaAbaixada = estado.canetaAbaixada;
  let base32 = false;
  let fracao = 0;

  const linhas = [];
  let atual = null;
  const fechar = () => {
    if (atual && atual.pontos.length >= 2) linhas.push(atual);
    atual = null;
  };

  let i = 0;
  while (i < bruto.length) {
    const c = bruto[i];

    if (c === "7") { base32 = true; i++; continue; }
    if (c === ":") { // troca de caneta: pula o número que vem junto
      const p = numeroPE(bruto, i + 1, base32);
      i = p.ok ? p.i : i + 1;
      continue;
    }
    if (c === ">") { // quantidade de bits de fração dos próximos números
      const p = numeroPE(bruto, i + 1, base32);
      if (p.ok) { fracao = valorPEParaNumero(p.valor, 0); i = p.i; } else i++;
      continue;
    }

    // As marcas se acumulam antes do par de coordenadas: "PE<=x,y" quer dizer
    // "pula sem riscar até esta posição absoluta", que é como quase todo
    // arquivo começa um contorno.
    let absolutoAqui = false;
    let levantar = false;
    while (i < bruto.length && (bruto[i] === "=" || bruto[i] === "<")) {
      if (bruto[i] === "=") absolutoAqui = true;
      else levantar = true;
      i++;
    }

    const px = numeroPE(bruto, i, base32);
    if (!px.ok) break;
    const py = numeroPE(bruto, px.i, base32);
    if (!py.ok) break;
    i = py.i;

    const dx = valorPEParaNumero(px.valor, fracao);
    const dy = valorPEParaNumero(py.valor, fracao);
    const nx = absolutoAqui ? dx : x + dx;
    const ny = absolutoAqui ? dy : y + dy;

    if (levantar) {
      // "<" é um deslocamento sem riscar: fecha o traço e recomeça adiante.
      fechar();
      canetaAbaixada = true; // no PE a caneta volta a riscar depois do pulo
    } else if (canetaAbaixada) {
      if (!atual) atual = { pontos: [{ x, y }], fechada: false };
      atual.pontos.push({ x: nx, y: ny });
    }
    x = nx; y = ny;
  }

  fechar();
  return { linhas, x, y, canetaAbaixada };
}

/**
 * PLT não tem cabeçalho de unidade. O padrão é unidade de plotter, então é ela
 * que vale — a não ser que o molde saia com um tamanho impossível, e aí o
 * tamanho do desenho denuncia qual era a unidade de verdade.
 */
function chutarUnidadePLT(caixa) {
  const bruto = Math.max(caixa.largura, caixa.altura);
  const plausivel = (fator) => {
    const cm = bruto * fator;
    return cm >= 5 && cm <= 800; // de uma gola pequena a um marcador comprido
  };
  const ordem = [PLT_UNIDADES.plu, PLT_UNIDADES.mil, PLT_UNIDADES.mm, PLT_UNIDADES.cm];
  return ordem.find((u) => plausivel(u.fator)) || PLT_UNIDADES.plu;
}

// ==================== SVG ====================

/**
 * O SVG é lido pelo próprio navegador, e não por um parser escrito à mão.
 *
 * Todo desenho de SVG (`path`, `rect`, `circle`, `polygon`...) responde a
 * `getPointAtLength`, que anda por cima do traço e devolve o ponto exato
 * naquela distância. Isso resolve de graça curva de Bézier, arco elíptico e
 * toda a cadeia de `transform` dos grupos — coisas em que um parser próprio
 * erraria por anos.
 *
 * Para isso o desenho precisa estar dentro da página, então ele é colocado num
 * canto fora da tela enquanto é medido, e tirado logo depois.
 */

const SVG_PASSO_CM = 0.05; // de quanto em quanto o traço é amostrado
const SVG_MAX_AMOSTRAS = 40000; // teto por desenho, para arquivo doido não travar a tela
const PX_POR_POLEGADA_CSS = 96; // o que o SVG usa quando a medida vem sem unidade

const SVG_FORMAS = "path, rect, circle, ellipse, line, polyline, polygon";

/**
 * Lê o SVG e devolve os moldes já em centímetros.
 * `unidadeForcada` ("mm", "cm", "polegada", "m") diz o que vale uma unidade do
 * desenho, para quando o arquivo não trouxer medida de verdade.
 */
function lerMoldesSVG(texto, unidadeForcada, modo) {
  const documento = new DOMParser().parseFromString(texto, "image/svg+xml");
  if (documento.querySelector("parsererror") || !documento.documentElement ||
      documento.documentElement.nodeName.toLowerCase() !== "svg") {
    return { erro: "Não consegui ler esse SVG: o arquivo não é um SVG válido." };
  }

  const palco = document.createElement("div");
  // Fora da tela, mas ainda desenhado: com display:none o navegador não calcula
  // geometria nenhuma e todas as medidas voltariam zeradas.
  palco.setAttribute("style", "position:absolute; left:-99999px; top:0; opacity:0; pointer-events:none;");
  const raiz = document.importNode(documento.documentElement, true);
  palco.appendChild(raiz);
  document.body.appendChild(palco);

  try {
    return moldesDoSvgNoPalco(raiz, unidadeForcada, modo);
  } finally {
    palco.remove();
  }
}

function moldesDoSvgNoPalco(raiz, unidadeForcada, modo) {
  const caixaDeVisao = raiz.viewBox && raiz.viewBox.baseVal;
  const temCaixaDeVisao = !!(caixaDeVisao && caixaDeVisao.width > 0 && caixaDeVisao.height > 0);

  // Sem width/height o SVG não tem tamanho de tela; nesse caso a viewBox vira
  // a medida, em pixels.
  if (!raiz.getAttribute("width") && temCaixaDeVisao) raiz.setAttribute("width", caixaDeVisao.width);
  if (!raiz.getAttribute("height") && temCaixaDeVisao) raiz.setAttribute("height", caixaDeVisao.height);

  const larguraPx = raiz.width && raiz.width.baseVal ? raiz.width.baseVal.value : 0;
  if (!(larguraPx > 0)) {
    return { erro: "Esse SVG não diz o tamanho do desenho (sem width/height nem viewBox)." };
  }

  const avisos = [];
  const forcada = Object.values(DXF_UNIDADES).find((u) => u.nome === unidadeForcada);
  const declarada = medidaDeclaradaEmCm(raiz);

  let larguraCm;
  let nomeDaUnidade;
  if (forcada) {
    // Unidade forçada vale para a unidade do desenho (a viewBox), que é como a
    // pessoa enxerga as coordenadas no editor.
    const unidadesDoDesenho = temCaixaDeVisao ? caixaDeVisao.width : larguraPx;
    larguraCm = unidadesDoDesenho * forcada.fator;
    nomeDaUnidade = forcada.nome;
  } else if (declarada) {
    larguraCm = declarada.cm;
    nomeDaUnidade = declarada.unidade;
  } else {
    larguraCm = (larguraPx / PX_POR_POLEGADA_CSS) * 2.54;
    nomeDaUnidade = "px a 96 dpi";
    avisos.push("O SVG não traz medida em centímetro nem milímetro; li como pixel a 96 dpi. Confira as medidas.");
  }

  const cmPorPx = larguraCm / larguraPx;

  abrirOsUse(raiz);

  const linhas = [];
  raiz.querySelectorAll(SVG_FORMAS).forEach((forma) => {
    // Desenho dentro de <defs>, <clipPath>, <mask> ou <symbol> é molde de
    // repetição, não desenho na folha: quem aparece é a cópia feita pelo <use>.
    if (forma.closest("defs, clipPath, mask, symbol")) return;
    trechosDaForma(forma, cmPorPx, SVG_PASSO_CM).forEach((t) => linhas.push(t));
  });

  if (linhas.length === 0) {
    return { erro: "Esse SVG não tem desenho que eu consiga ler (nenhum caminho, retângulo, círculo ou polígono)." };
  }

  const textos = [];
  raiz.querySelectorAll("text").forEach((elemento) => {
    const conteudo = (elemento.textContent || "").trim();
    if (!conteudo) return;
    const caixa = elemento.getBBox();
    const meio = pontoNoDesenho(elemento, caixa.x + caixa.width / 2, caixa.y + caixa.height / 2, cmPorPx);
    if (meio) textos.push({ texto: conteudo, x: meio.x, y: meio.y });
  });

  // Diferente do DXF e do PLT, o SVG já cresce para baixo, igual à tela: aqui
  // inverter o Y deixaria toda peça de cabeça para baixo.
  return montarMoldes(linhas, textos, { fator: 1, nome: nomeDaUnidade }, avisos, "SVG", false, modo);
}

/**
 * Troca cada `<use>` por uma cópia de verdade do que ele aponta.
 *
 * `<use>` é como o Illustrator e o Inkscape repetem a mesma forma várias vezes.
 * Ele não responde a `getPointAtLength`, então antes essas cópias sumiam do
 * molde — e o que era lido era o original escondido no `<defs>`, no lugar
 * errado. Aqui cada `<use>` vira o desenho que ele repete, no lugar dele.
 */
function abrirOsUse(raiz, profundidade = 0) {
  if (profundidade > 4) return; // <use> apontando para <use>: não entra em laço
  const copias = [...raiz.querySelectorAll("use")];
  if (copias.length === 0) return;

  copias.forEach((copia) => {
    const alvo = copia.getAttribute("href") || copia.getAttribute("xlink:href") || "";
    const original = alvo.startsWith("#") ? raiz.querySelector(`[id="${alvo.slice(1)}"]`) : null;
    if (!original) { copia.remove(); return; }

    const grupo = raiz.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
    const x = Number(copia.getAttribute("x") || 0);
    const y = Number(copia.getAttribute("y") || 0);
    const transformar = copia.getAttribute("transform") || "";
    grupo.setAttribute("transform", `${transformar} translate(${x}, ${y})`.trim());
    grupo.appendChild(original.cloneNode(true));
    copia.replaceWith(grupo);
  });

  abrirOsUse(raiz, profundidade + 1);
}

/** Converte um ponto do espaço da forma para centímetros no desenho todo. */
function pontoNoDesenho(forma, x, y, cmPorPx) {
  const matriz = forma.getCTM();
  if (!matriz) return null;
  return {
    x: (matriz.a * x + matriz.c * y + matriz.e) * cmPorPx,
    y: (matriz.b * x + matriz.d * y + matriz.f) * cmPorPx,
  };
}

/**
 * Anda por cima do traço de uma forma e devolve os pontos em centímetros.
 *
 * Um `path` pode ter vários pedaços soltos (o contorno da peça e o furo do
 * meio, por exemplo). O salto entre um pedaço e outro não tem comprimento
 * nenhum, então aparece como um pulo grande entre duas amostras seguidas — é
 * assim que os pedaços são separados, sem precisar interpretar o atributo `d`.
 */
function trechosDaForma(forma, cmPorPx, passoCm) {
  const matriz = forma.getCTM();
  if (!matriz) return [];

  let comprimento;
  try {
    comprimento = forma.getTotalLength();
  } catch (e) {
    return [];
  }
  if (!(comprimento > 0)) return [];

  // getTotalLength mede na régua da própria forma, que pode estar esticada por
  // um transform. Sem trazer essa escala para a conta, o passo de amostragem
  // sairia errado justamente nos desenhos com grupo transformado.
  const escala = Math.sqrt(Math.abs(matriz.a * matriz.d - matriz.b * matriz.c)) || 1;
  const cmPorUnidade = escala * cmPorPx;
  const passoNaForma = Math.max(passoCm / cmPorUnidade, comprimento / SVG_MAX_AMOSTRAS);

  const amostras = Math.max(2, Math.ceil(comprimento / passoNaForma));
  const passo = comprimento / amostras;
  // Salto entre dois pedaços do mesmo caminho: não tem comprimento, então
  // aparece como um pulo bem maior que o passo entre duas amostras seguidas.
  const limiteDoPulo = passo * cmPorUnidade * 4;

  const trechos = [];
  let atual = [];
  let anterior = null;

  for (let i = 0; i <= amostras; i++) {
    let bruto;
    try {
      bruto = forma.getPointAtLength(Math.min(i * passo, comprimento));
    } catch (e) {
      break;
    }
    const ponto = pontoNoDesenho(forma, bruto.x, bruto.y, cmPorPx);
    if (!ponto) break;

    if (anterior && Math.hypot(ponto.x - anterior.x, ponto.y - anterior.y) > limiteDoPulo) {
      if (atual.length >= 2) trechos.push({ pontos: atual, fechada: false });
      atual = [];
    }
    atual.push(ponto);
    anterior = ponto;
  }
  if (atual.length >= 2) trechos.push({ pontos: atual, fechada: false });

  return trechos;
}

/**
 * Tamanho real declarado no `width` do SVG. Só vale quando vem com unidade de
 * verdade (mm, cm, polegada...): "800" sozinho é pixel e não diz tamanho
 * nenhum de peça.
 */
function medidaDeclaradaEmCm(raiz) {
  const escrito = (raiz.getAttribute("width") || "").trim();
  const unidade = /[a-z%]+$/i.exec(escrito);
  if (!unidade || unidade[0].toLowerCase() === "px" || unidade[0] === "%") return null;

  try {
    const medida = raiz.width.baseVal;
    medida.convertToSpecifiedUnits(SVGLength.SVG_LENGTHTYPE_CM);
    const cm = medida.valueInSpecifiedUnits;
    return cm > 0 ? { cm, unidade: unidade[0].toLowerCase() } : null;
  } catch (e) {
    return null;
  }
}

// ==================== PDF ====================

/**
 * Leitor de PDF vetorial.
 *
 * Um PDF guarda o desenho como uma sequência de comandos de caneta parecida
 * com a do PLT (`m` anda, `l` risca, `c` faz curva), só que dentro de fluxos
 * comprimidos e espalhados por objetos numerados. O caminho aqui é:
 *   1. varrer o arquivo atrás de todos os objetos "N G obj ... endobj";
 *   2. abrir os fluxos comprimidos (Flate), inclusive os que guardam outros
 *      objetos dentro (ObjStm, do PDF moderno);
 *   3. achar a primeira página, o tamanho dela e o fluxo de conteúdo;
 *   4. executar os comandos de desenho, acompanhando a matriz de transformação
 *      e entrando nos XObjects de formulário.
 *
 * A varredura é feita direto no arquivo, sem usar a tabela xref. É de
 * propósito: xref quebrado é comum em arquivo que passou por vários programas,
 * e assim o leitor funciona do mesmo jeito.
 *
 * PDF protegido por senha é recusado com aviso — sem a senha não há o que ler.
 */

const PDF_PT_POR_CM = 72 / 2.54; // o PDF mede em pontos: 1 ponto = 1/72 de polegada
const PDF_PASSO_CM = 0.05; // de quanto em quanto uma curva é quebrada em retas

/** Só os pedaços de dicionário que interessam; nada de parser completo. */
function valorNoDicionario(dicionario, chave) {
  const achado = new RegExp(`/${chave}\\s*(<<|\\[|/[^\\s/<>\\[\\]()]+|\\d+\\s+\\d+\\s+R|[-+.\\d]+|\\([^)]*\\))`)
    .exec(dicionario);
  if (!achado) return null;
  const inicio = achado.index + achado[0].length - achado[1].length;
  if (achado[1] === "<<") return trechoBalanceado(dicionario, inicio, "<<", ">>");
  if (achado[1] === "[") return trechoBalanceado(dicionario, inicio, "[", "]");
  return achado[1];
}

function trechoBalanceado(texto, inicio, abre, fecha) {
  let profundidade = 0;
  let i = inicio;
  while (i < texto.length) {
    if (texto.startsWith(abre, i)) { profundidade++; i += abre.length; continue; }
    if (texto.startsWith(fecha, i)) {
      profundidade--;
      i += fecha.length;
      if (profundidade === 0) return texto.slice(inicio, i);
      continue;
    }
    i++;
  }
  return texto.slice(inicio);
}

const numerosDe = (texto) => (String(texto || "").match(/-?\d+(\.\d+)?/g) || []).map(Number);

/** "12 0 R" -> "12 0"; qualquer outra coisa -> null */
function referenciaDe(valor) {
  const achado = /^(\d+)\s+(\d+)\s+R$/.exec(String(valor || "").trim());
  return achado ? `${achado[1]} ${achado[2]}` : null;
}

async function inflar(bytes) {
  const tentar = async (formato) => {
    const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(formato));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  };
  try {
    return await tentar("deflate");
  } catch (e) {
    try {
      // Alguns geradores gravam o Flate sem o cabeçalho de zlib.
      return await tentar("deflate-raw");
    } catch (e2) {
      return null;
    }
  }
}

/**
 * Desfaz o "predictor" PNG, que alguns PDFs usam para comprimir melhor: cada
 * linha vem como a diferença para a linha de cima, e sem desfazer isso os
 * números saem todos errados.
 */
function desfazerPreditorPNG(dados, colunas, cores) {
  const largura = colunas * cores;
  const linhas = Math.floor(dados.length / (largura + 1));
  const saida = new Uint8Array(linhas * largura);
  let anterior = new Uint8Array(largura);

  for (let l = 0; l < linhas; l++) {
    const tipo = dados[l * (largura + 1)];
    const linha = dados.subarray(l * (largura + 1) + 1, (l + 1) * (largura + 1));
    const atual = new Uint8Array(largura);
    for (let i = 0; i < largura; i++) {
      const esquerda = i >= cores ? atual[i - cores] : 0;
      const cima = anterior[i];
      const diagonal = i >= cores ? anterior[i - cores] : 0;
      let base = 0;
      if (tipo === 1) base = esquerda;
      else if (tipo === 2) base = cima;
      else if (tipo === 3) base = (esquerda + cima) >> 1;
      else if (tipo === 4) {
        const p = esquerda + cima - diagonal;
        const de = Math.abs(p - esquerda), dc = Math.abs(p - cima), dd = Math.abs(p - diagonal);
        base = de <= dc && de <= dd ? esquerda : dc <= dd ? cima : diagonal;
      }
      atual[i] = (linha[i] + base) & 0xff;
    }
    saida.set(atual, l * largura);
    anterior = atual;
  }
  return saida;
}

async function abrirFluxo(objeto) {
  if (!objeto || !objeto.bruto) return null;
  const filtro = valorNoDicionario(objeto.dicionario, "Filter") || "";
  if (!/Fl(ate)?Decode/.test(filtro)) {
    // Sem filtro nenhum o fluxo já está legível; outros filtros ficam de fora.
    return /^\s*$/.test(filtro) || !filtro ? objeto.bruto : null;
  }

  let dados = await inflar(objeto.bruto);
  if (!dados) return null;

  const parametros = valorNoDicionario(objeto.dicionario, "DecodeParms");
  if (parametros && /\/Predictor\s*(\d+)/.test(parametros)) {
    const preditor = Number(/\/Predictor\s*(\d+)/.exec(parametros)[1]);
    if (preditor >= 10) {
      const colunas = Number((/\/Columns\s*(\d+)/.exec(parametros) || [, 1])[1]);
      const cores = Number((/\/Colors\s*(\d+)/.exec(parametros) || [, 1])[1]);
      dados = desfazerPreditorPNG(dados, colunas, cores);
    }
  }
  return dados;
}

/** Varre o arquivo inteiro montando o mapa de objetos. */
function varrerObjetos(texto, bytes) {
  const objetos = new Map();
  const marca = /(\d+)\s+(\d+)\s+obj\b/g;
  let achado;

  while ((achado = marca.exec(texto)) !== null) {
    const inicioCorpo = achado.index + achado[0].length;
    const fim = texto.indexOf("endobj", inicioCorpo);
    const corpo = texto.slice(inicioCorpo, fim < 0 ? texto.length : fim);

    const marcaFluxo = /stream\r?\n/.exec(corpo);
    let dicionario = corpo;
    let bruto = null;

    if (marcaFluxo) {
      dicionario = corpo.slice(0, marcaFluxo.index);
      const inicioDados = inicioCorpo + marcaFluxo.index + marcaFluxo[0].length;
      const declarado = Number((/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dicionario) || [])[1]);
      let fimDados = declarado > 0 ? inicioDados + declarado : -1;
      // Length às vezes está errado ou é referência: nesse caso vale o que o
      // arquivo diz de verdade, que é onde aparece o "endstream".
      if (!(fimDados > inicioDados) || !/^\s*endstream/.test(texto.slice(fimDados, fimDados + 20))) {
        const marcaFim = texto.indexOf("endstream", inicioDados);
        fimDados = marcaFim < 0 ? bytes.length : marcaFim;
      }
      bruto = bytes.subarray(inicioDados, fimDados);
    }

    objetos.set(`${achado[1]} ${achado[2]}`, { dicionario, bruto });
  }
  return objetos;
}

/** Abre os ObjStm, que guardam vários objetos pequenos dentro de um fluxo. */
async function expandirObjetosEmFluxo(objetos) {
  for (const objeto of [...objetos.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(objeto.dicionario)) continue;
    const dados = await abrirFluxo(objeto);
    if (!dados) continue;

    const texto = new TextDecoder("latin1").decode(dados);
    const quantidade = Number((/\/N\s+(\d+)/.exec(objeto.dicionario) || [])[1]) || 0;
    const inicio = Number((/\/First\s+(\d+)/.exec(objeto.dicionario) || [])[1]) || 0;
    const cabecalho = numerosDe(texto.slice(0, inicio));

    for (let i = 0; i < quantidade; i++) {
      const numero = cabecalho[i * 2];
      const deslocamento = cabecalho[i * 2 + 1];
      if (numero == null || deslocamento == null) break;
      const proximo = cabecalho[i * 2 + 3];
      const fim = proximo == null ? texto.length : inicio + proximo;
      const chave = `${numero} 0`;
      if (!objetos.has(chave)) {
        objetos.set(chave, { dicionario: texto.slice(inicio + deslocamento, fim), bruto: null });
      }
    }
  }
}

// ==================== COMANDOS DE DESENHO ====================

const multiplicarMatriz = (m, base) => [
  m[0] * base[0] + m[1] * base[2],
  m[0] * base[1] + m[1] * base[3],
  m[2] * base[0] + m[3] * base[2],
  m[2] * base[1] + m[3] * base[3],
  m[4] * base[0] + m[5] * base[2] + base[4],
  m[4] * base[1] + m[5] * base[3] + base[5],
];

const aplicarMatriz = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/**
 * Executa o fluxo de comandos de uma página (ou de um formulário) e junta os
 * traços. `linhas` e `textos` são preenchidos no caminho.
 */
async function executarConteudoPDF(conteudo, ctmInicial, recursos, objetos, saida, profundidade = 0) {
  const fichas = conteudo.match(/<[0-9A-Fa-f\s]*>|\([^)]*\)|\/[^\s/<>\[\]()]+|[-+.\d]+|[A-Za-z'"*]+|\[|\]/g);
  if (!fichas) return;

  let ctm = ctmInicial;
  const pilha = [];
  const operandos = [];

  let caminho = [];   // trechos já fechados dentro deste caminho
  let atual = [];     // trecho em construção
  let ponto = null;   // ponto corrente, já transformado
  let inicioDoTrecho = null;

  let matrizTexto = [1, 0, 0, 1, 0, 0];
  let linhaDeTexto = [1, 0, 0, 1, 0, 0];

  const fecharTrecho = (fechado) => {
    if (atual.length >= 2) caminho.push({ pontos: atual, fechada: fechado });
    atual = [];
  };
  const irPara = (x, y) => {
    ponto = aplicarMatriz(ctm, x, y);
    atual.push(ponto);
  };

  for (let i = 0; i < fichas.length; i++) {
    const ficha = fichas[i];

    if (/^[-+.\d]/.test(ficha)) { operandos.push(Number(ficha)); continue; }
    if (ficha.startsWith("/") || ficha === "[" || ficha === "]" ||
        ficha.startsWith("(") || ficha.startsWith("<")) { operandos.push(ficha); continue; }

    const n = operandos.filter((o) => typeof o === "number");
    switch (ficha) {
      case "q": pilha.push(ctm.slice()); break;
      case "Q": if (pilha.length) ctm = pilha.pop(); break;
      case "cm": if (n.length >= 6) ctm = multiplicarMatriz(n.slice(-6), ctm); break;

      case "m":
        if (n.length >= 2) {
          fecharTrecho(false);
          irPara(n[n.length - 2], n[n.length - 1]);
          inicioDoTrecho = { x: n[n.length - 2], y: n[n.length - 1] };
        }
        break;

      case "l": if (n.length >= 2) irPara(n[n.length - 2], n[n.length - 1]); break;

      case "c":
      case "v":
      case "y": {
        if (!ponto) break;
        const p0 = ponto;
        let c1, c2, p3;
        if (ficha === "c" && n.length >= 6) {
          const [x1, y1, x2, y2, x3, y3] = n.slice(-6);
          c1 = aplicarMatriz(ctm, x1, y1); c2 = aplicarMatriz(ctm, x2, y2); p3 = aplicarMatriz(ctm, x3, y3);
        } else if (ficha === "v" && n.length >= 4) {
          const [x2, y2, x3, y3] = n.slice(-4);
          c1 = p0; c2 = aplicarMatriz(ctm, x2, y2); p3 = aplicarMatriz(ctm, x3, y3);
        } else if (ficha === "y" && n.length >= 4) {
          const [x1, y1, x3, y3] = n.slice(-4);
          c1 = aplicarMatriz(ctm, x1, y1); p3 = aplicarMatriz(ctm, x3, y3); c2 = p3;
        } else break;

        const grosso = Math.hypot(c1.x - p0.x, c1.y - p0.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) +
                       Math.hypot(p3.x - c2.x, p3.y - c2.y);
        const passos = Math.max(4, Math.min(80, Math.ceil(grosso / (PDF_PASSO_CM * PDF_PT_POR_CM))));
        for (let k = 1; k <= passos; k++) {
          const t = k / passos, u = 1 - t;
          atual.push({
            x: u*u*u*p0.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*p3.x,
            y: u*u*u*p0.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*p3.y,
          });
        }
        ponto = p3;
        break;
      }

      case "h":
        if (inicioDoTrecho && atual.length >= 2) {
          irPara(inicioDoTrecho.x, inicioDoTrecho.y);
          fecharTrecho(true);
        }
        break;

      case "re":
        if (n.length >= 4) {
          const [x, y, largura, altura] = n.slice(-4);
          fecharTrecho(false);
          irPara(x, y); irPara(x + largura, y); irPara(x + largura, y + altura);
          irPara(x, y + altura); irPara(x, y);
          fecharTrecho(true);
          ponto = null;
        }
        break;

      // Fim do caminho: pintando ou não, os traços já valem como contorno.
      case "n": case "f": case "F": case "f*": case "S": case "s":
      case "B": case "B*": case "b": case "b*": {
        const fecha = ficha === "s" || ficha === "b" || ficha === "b*" ||
                      ficha[0] === "f" || ficha[0] === "F" || ficha[0] === "B";
        if (fecha && inicioDoTrecho && atual.length >= 2) irPara(inicioDoTrecho.x, inicioDoTrecho.y);
        fecharTrecho(fecha);
        caminho.forEach((t) => saida.linhas.push(t));
        caminho = [];
        ponto = null;
        inicioDoTrecho = null;
        break;
      }

      case "BT": matrizTexto = [1, 0, 0, 1, 0, 0]; linhaDeTexto = matrizTexto.slice(); break;
      case "Tm":
        if (n.length >= 6) { matrizTexto = n.slice(-6); linhaDeTexto = matrizTexto.slice(); }
        break;
      case "Td": case "TD":
        if (n.length >= 2) {
          linhaDeTexto = multiplicarMatriz([1, 0, 0, 1, n[n.length - 2], n[n.length - 1]], linhaDeTexto);
          matrizTexto = linhaDeTexto.slice();
        }
        break;
      case "T*": matrizTexto = linhaDeTexto.slice(); break;
      case "Tj": case "TJ": case "'": case '"': {
        const escrito = operandos.filter((o) => typeof o === "string" && (o.startsWith("(") || o.startsWith("<")))
          .map(textoDeFicha).join("").trim();
        if (escrito) {
          const posicao = aplicarMatriz(multiplicarMatriz(matrizTexto, ctm), 0, 0);
          saida.textos.push({ texto: escrito, x: posicao.x, y: posicao.y });
        }
        break;
      }

      case "Do": {
        if (profundidade >= 6) break;
        const nome = operandos.filter((o) => typeof o === "string" && o.startsWith("/")).pop();
        const formulario = await acharXObject(nome, recursos, objetos);
        if (formulario) {
          const matriz = numerosDe(valorNoDicionario(formulario.objeto.dicionario, "Matrix"));
          const ctmForm = matriz.length >= 6 ? multiplicarMatriz(matriz.slice(0, 6), ctm) : ctm;
          await executarConteudoPDF(formulario.conteudo, ctmForm,
            valorNoDicionario(formulario.objeto.dicionario, "Resources") || recursos,
            objetos, saida, profundidade + 1);
        }
        break;
      }

      default: break;
    }

    if (!/^[-+.\d]/.test(ficha) && !ficha.startsWith("/") && ficha !== "[" && ficha !== "]" &&
        !ficha.startsWith("(") && !ficha.startsWith("<")) {
      operandos.length = 0;
    }
  }

  fecharTrecho(false);
  caminho.forEach((t) => saida.linhas.push(t));
}

/** Texto de um literal "(...)" ou de um hexadecimal "<...>". */
function textoDeFicha(ficha) {
  if (ficha.startsWith("<")) {
    const hex = ficha.slice(1, -1).replace(/\s+/g, "");
    let saida = "";
    for (let i = 0; i + 1 < hex.length; i += 2) saida += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return saida;
  }
  return ficha.slice(1, -1)
    .replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (todo, escape) => {
      const simples = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      if (simples[escape] !== undefined) return simples[escape];
      return String.fromCharCode(parseInt(escape, 8));
    });
}

async function acharXObject(nome, recursos, objetos) {
  if (!nome || !recursos) return null;
  const mapa = valorNoDicionario(recursos, "XObject");
  if (!mapa) return null;
  const alvo = new RegExp(`\\${nome}\\s+(\\d+\\s+\\d+)\\s+R`).exec(mapa);
  if (!alvo) return null;

  const objeto = objetos.get(alvo[1]);
  if (!objeto || /\/Subtype\s*\/Image/.test(objeto.dicionario)) return null;
  const dados = await abrirFluxo(objeto);
  if (!dados) return null;
  return { objeto, conteudo: new TextDecoder("latin1").decode(dados) };
}

// ==================== ENTRADA PRINCIPAL (PDF) ====================

/**
 * Lê o PDF e devolve os moldes já em centímetros.
 * `unidadeForcada` diz o que vale uma unidade do arquivo, para quando o
 * desenho tiver sido salvo numa escala diferente da real.
 */
async function lerMoldesPDF(bytes, unidadeForcada, modo) {
  const texto = new TextDecoder("latin1").decode(bytes);
  if (!texto.startsWith("%PDF")) {
    return { erro: "Não consegui ler esse PDF: o arquivo não começa como um PDF." };
  }
  if (/\/Encrypt\b/.test(texto)) {
    return { erro: "Esse PDF está protegido por senha; salve uma cópia sem proteção e mande de novo." };
  }

  const objetos = varrerObjetos(texto, bytes);
  if (objetos.size === 0) {
    return { erro: "Esse PDF não tem nenhum objeto que eu consiga abrir." };
  }
  await expandirObjetosEmFluxo(objetos);

  const pagina = [...objetos.values()].find((o) => /\/Type\s*\/Page[^s]/.test(o.dicionario + " "));
  if (!pagina) {
    return { erro: "Não achei nenhuma página dentro desse PDF." };
  }

  const conteudos = [];
  const referencia = valorNoDicionario(pagina.dicionario, "Contents");
  const chaves = referenciaDe(referencia)
    ? [referenciaDe(referencia)]
    : (String(referencia || "").match(/\d+\s+\d+\s+R/g) || []).map((r) => referenciaDe(r));

  for (const chave of chaves) {
    const dados = await abrirFluxo(objetos.get(chave));
    if (dados) conteudos.push(new TextDecoder("latin1").decode(dados));
  }
  if (conteudos.length === 0) {
    return { erro: "Não consegui abrir o conteúdo dessa página (o PDF pode usar uma compressão que não leio)." };
  }

  const saida = { linhas: [], textos: [] };
  const caixaDaPagina = numerosDe(valorNoDicionario(pagina.dicionario, "MediaBox"));
  // A origem do PDF pode não ser o canto: descontar o MediaBox põe o desenho
  // no lugar certo.
  const origem = caixaDaPagina.length >= 4 ? [-caixaDaPagina[0], -caixaDaPagina[1]] : [0, 0];
  const inicial = [1, 0, 0, 1, origem[0], origem[1]];
  const recursos = valorNoDicionario(pagina.dicionario, "Resources");

  for (const conteudo of conteudos) {
    await executarConteudoPDF(conteudo, inicial, recursos, objetos, saida);
  }

  if (saida.linhas.length === 0) {
    return { erro: "Esse PDF não tem desenho vetorial que eu consiga ler (talvez seja só uma imagem escaneada)." };
  }

  const avisos = [];
  const forcada = Object.values(DXF_UNIDADES).find((u) => u.nome === unidadeForcada);
  const unidade = forcada
    ? { fator: forcada.fator, nome: forcada.nome }
    : { fator: 1 / PDF_PT_POR_CM, nome: "tamanho da página" };

  return montarMoldes(saida.linhas, saida.textos, unidade, avisos, "PDF", true, modo);
}

// ==================== MOLDE VIRA IMAGEM ====================

/**
 * Desenha o molde numa imagem de fundo transparente. É isso que deixa o DXF
 * usar o mesmo caminho do PNG: daí em diante o encaixe não sabe (nem precisa
 * saber) se a peça veio de arquivo de CAD ou de uma arte.
 */
function moldeParaImagem(molde, cor) {
  const maiorLado = Math.max(molde.largura, molde.altura);
  const escala = Math.max(3, Math.min(14, 900 / maiorLado)); // pixels por cm
  const margem = 2;
  const largura = Math.max(4, Math.ceil(molde.largura * escala) + margem * 2);
  const altura = Math.max(4, Math.ceil(molde.altura * escala) + margem * 2);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");

  const traçar = (pontos) => {
    pontos.forEach((p, i) => {
      const x = margem + p.x * escala;
      const y = margem + p.y * escala;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  ctx.beginPath();
  traçar(molde.contorno);
  molde.furos.forEach(traçar);
  ctx.fillStyle = cor;
  ctx.fill("evenodd"); // com evenodd os furos ficam vazados de verdade

  ctx.beginPath();
  traçar(molde.contorno);
  molde.furos.forEach(traçar);
  ctx.strokeStyle = "rgba(10, 14, 16, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return { src: canvas.toDataURL("image/png"), pxW: largura, pxH: altura };
}

// ==================== PORTA DE ENTRADA ====================

const ehArquivoDeMolde = (file) => /\.(dxf|plt|hpgl|svg|pdf)$/i.test(file.name);
const FORMATOS_DE_MOLDE = "DXF, PLT, SVG e PDF";

/**
 * Lê um arquivo de molde, seja qual for o formato, e devolve as peças em
 * centímetros. É a porta única por onde as telas de Encaixe e de Moldes leem
 * arquivo — assim as duas enxergam exatamente a mesma coisa.
 */
async function lerMoldeVetorial(file, unidadeForcada, modo = "marcador") {
  const nome = file.name.toLowerCase();

  if (nome.endsWith(".pdf")) {
    return { formato: "PDF",
      ...await lerMoldesPDF(new Uint8Array(await file.arrayBuffer()), unidadeForcada, modo) };
  }
  if (nome.endsWith(".svg")) {
    return { formato: "SVG", ...lerMoldesSVG(await file.text(), unidadeForcada, modo) };
  }
  if (nome.endsWith(".plt") || nome.endsWith(".hpgl")) {
    // PLT pode trazer os pontos comprimidos no comando PE, que usa bytes acima
    // de 127. Ler como texto normal embaralharia esses bytes.
    const bytes = new Uint8Array(await file.arrayBuffer());
    let texto = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      texto += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return { formato: "PLT", ...lerMoldesPLT(texto, unidadeForcada, modo) };
  }
  return { formato: "DXF", ...lerMoldesDXF(await file.text(), unidadeForcada, modo) };
}
