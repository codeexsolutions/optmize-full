#!/usr/bin/env node
/**
 * Quanto tecido fica preso em vão que o encaixe não consegue mais usar.
 *
 * A queixa que originou este arquivo veio da produção: *"ele encaixa todas as
 * peças do mesmo modelo e esquece que dá pra colocar outra no espaço que
 * sobrou"*. Isso tem uma causa estrutural, e ela dá para medir.
 *
 * O encaixe por contorno guarda o tecido como **uma altura por coluna**: o
 * `perfil[c]` diz até onde a coluna `c` já foi usada. Uma peça desce até
 * encostar nesse relevo. Isso deixa a peça se aninhar na curva da peça de cima,
 * e é o que faz o motor render — mas cobra um preço:
 *
 *   **buraco com tecido POR BAIXO some do mapa.** Assim que uma peça é
 *   assentada, a coluna inteira passa a valer pelo ponto mais baixo dela.
 *   O vão do decote de uma camiseta, com a camiseta já posta, deixa de existir
 *   para o motor — e a gola, que caberia exatamente ali, vai para o fim do rolo.
 *
 * A busca contorna isso pela ordem: se a gola entrar ANTES, a camiseta desce
 * por cima dela e o encaixe fecha. Só que achar essa ordem é sorte de
 * embaralhamento, e quanto mais peças, menos provável.
 *
 * O que este arquivo mede, para cada trabalho:
 *
 *   preso     área vazia que tem peça por baixo na mesma coluna. É o vão que o
 *             motor não alcança mais, por construção.
 *   aberto    área vazia sem nada por baixo. Essa o motor ainda usaria — é a
 *             frente de trabalho, não desperdício.
 *   caberia   quantas das peças do próprio trabalho caberiam, pela caixa, no
 *             maior vão preso. Zero quer dizer que o vão é pó; um número maior
 *             que zero quer dizer que tem peça inteira de tecido parada ali.
 *
 *   node bancada/vaos.js
 *   node bancada/vaos.js --trabalhos camiseta+manga+gola
 */

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS, PADRAO } = require("./trabalhos");

/** A grade do rolo com 1 onde há peça. */
function pintarRolo(posicoes, cols, rows) {
  const grade = new Uint8Array(cols * rows);
  posicoes.forEach((pos) => {
    const m = pos.mascara;
    if (!m) return;
    const col0 = Math.round((pos.x + m.offX) / pos.passo);
    const row0 = Math.round((pos.y + m.offY) / pos.passo);
    for (let r = 0; r < m.rows; r++) {
      const linha = row0 + r;
      if (linha < 0 || linha >= rows) continue;
      for (let c = 0; c < m.cols; c++) {
        const coluna = col0 + c;
        if (coluna < 0 || coluna >= cols) continue;
        if (m.desenho[r * m.cols + c]) grade[linha * cols + coluna] = 1;
      }
    }
  });
  return grade;
}

/**
 * Separa o vazio em PRESO e ABERTO.
 *
 * A conta é uma varredura de baixo para cima, coluna por coluna: assim que se
 * encontra a primeira célula com peça, tudo o que estiver acima dela naquela
 * coluna é vazio preso — o perfil daquela coluna já passou por ali.
 */
function medirVaos(grade, cols, rows) {
  let preso = 0;
  let aberto = 0;
  const presa = new Uint8Array(cols * rows);

  for (let c = 0; c < cols; c++) {
    let achouPeca = false;
    for (let r = rows - 1; r >= 0; r--) {
      const i = r * cols + c;
      if (grade[i]) { achouPeca = true; continue; }
      if (achouPeca) { preso++; presa[i] = 1; } else aberto++;
    }
  }
  return { preso, aberto, presa };
}

/**
 * O maior retângulo cheio de vazio preso — a medida honesta de "cabe peça
 * aqui?". Área solta não serve de nada se for uma tira de uma célula: peça
 * precisa de um retângulo.
 *
 * É o algoritmo clássico do maior retângulo no histograma, uma linha por vez.
 */
function maiorRetangulo(presa, cols, rows) {
  const altura = new Int32Array(cols);
  let melhor = { area: 0, largura: 0, altura: 0 };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) altura[c] = presa[r * cols + c] ? altura[c] + 1 : 0;

    const pilha = [];
    for (let c = 0; c <= cols; c++) {
      const h = c === cols ? 0 : altura[c];
      while (pilha.length > 0 && altura[pilha[pilha.length - 1]] >= h) {
        const topo = pilha.pop();
        const esquerda = pilha.length === 0 ? 0 : pilha[pilha.length - 1] + 1;
        const larg = c - esquerda;
        const area = altura[topo] * larg;
        if (area > melhor.area) melhor = { area, largura: larg, altura: altura[topo] };
      }
      pilha.push(c);
    }
  }
  return melhor;
}

async function principal() {
  const motor = await carregarMotor({ comWasm: true });
  let quais = PADRAO;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--trabalhos") { quais = process.argv[i + 1].split(","); i++; }
    else if (process.argv[i] === "--todos") quais = Object.keys(TRABALHOS);
  }

  console.log("trabalho              consumo   preso    aberto   maior vão preso   caberiam");
  console.log("-".repeat(82));

  for (const nome of quais) {
    const receita = TRABALHOS[nome];
    const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
    const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
      passo, raio, giro: p.giro || "180", qtd: p.qtd,
    }));
    const itens = expandir(pecas);
    const r = motor.encaixarContorno(motor.montarUnidades(itens, 1), {
      larguraTecido: receita.larguraTecido, espaco: receita.espaco,
      comprimentoBancada: receita.comprimentoBancada || 0, passo, heuristica: "fundo",
    });

    const cols = Math.ceil(receita.larguraTecido / passo);
    const rows = Math.ceil(r.consumo / passo);
    const grade = pintarRolo(r.posicoes, cols, rows);
    const { preso, aberto, presa } = medirVaos(grade, cols, rows);
    const maior = maiorRetangulo(presa, cols, rows);

    const cm2 = (celulas) => celulas * passo * passo;
    const areaRolo = receita.larguraTecido * r.consumo;
    // Quantos formatos do próprio trabalho caberiam, pela caixa, no maior vão.
    const caberiam = pecas.filter((p) =>
      (p.largura <= maior.largura * passo && p.altura <= maior.altura * passo)
      || (p.altura <= maior.largura * passo && p.largura <= maior.altura * passo)).map((p) => p.nome);

    console.log(`${nome.padEnd(21)} ${(r.consumo / 100).toFixed(2)} m`
      + ` ${(100 * cm2(preso) / areaRolo).toFixed(1).padStart(6)}%`
      + ` ${(100 * cm2(aberto) / areaRolo).toFixed(1).padStart(8)}%`
      + ` ${(maior.largura * passo).toFixed(0).padStart(8)}x${(maior.altura * passo).toFixed(0)} cm`
      + `   ${caberiam.length ? caberiam.join(", ") : "—"}`);
  }
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
