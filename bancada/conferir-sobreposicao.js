#!/usr/bin/env node
/**
 * Nenhuma peça pode pisar em cima de outra. Este arquivo prova, ou acusa.
 *
 * Por que ele existe
 * ------------------
 * A produção relatou peça saindo sobreposta, e o encaixe por NFP foi desligado
 * por isso sem que a causa fosse encontrada. Este arquivo nasceu para achar a
 * causa, e achou: o traçador de contorno do NFP seguia UMA borda e parava, então
 * peça com a silhueta em dois blocos separados tinha o segundo bloco invisível
 * para o motor. O NFP acabou saindo do projeto por outros motivos (ver o
 * histórico), mas a conferência ficou — e ficou valendo para os dois
 * encaixadores que sobraram.
 *
 * O encaixe por perfil e o por caixa não sobrepõem **por construção** — o perfil
 * só desce até onde o relevo deixa, e a caixa recorta a área livre a cada peça.
 * Só que "por construção" é um argumento, não uma medida, e argumento não pega
 * erro de arredondamento: a posição que a tela recebe passa por `offX` e pelo
 * passo da grade, e é ela que está sendo conferida aqui.
 *
 * Como a conferência é feita
 * --------------------------
 * Cada peça posicionada volta com a máscara que o encaixe usou e com o canto da
 * arte em centímetros. Daí dá para pintar a peça de volta na grade do rolo,
 * célula por célula, e ver se alguma célula recebeu duas peças.
 *
 * São duas conferências, e as duas importam por motivos diferentes:
 *
 *   silhueta  o `desenho` da máscara, que é a peça de verdade. Duas peças na
 *             mesma célula aqui é **defeito grave**: o tecido não dá para as
 *             duas e uma sai cortada errada.
 *   folga     o intervalo `topo`..`base` de cada coluna, que é a peça já
 *             engordada pela metade da folga. Sobreposição aqui não corta peça
 *             nenhuma, mas come a folga que a produção pediu — o corte encosta.
 *
 *   node bancada/conferir-sobreposicao.js
 *   node bancada/conferir-sobreposicao.js --motor contorno
 */

const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

/**
 * Pinta uma peça na grade do rolo e devolve as células que ela ocupa.
 *
 * O canto da arte é `x - offX` em centímetros (é assim que o motor escreve a
 * posição), então a célula (0,0) da máscara cai em `x + offX`. A conversão para
 * índice de célula é por arredondamento: as posições nascem de múltiplos do
 * passo, e arredondar é o que desfaz o erro de ponto flutuante acumulado nas
 * multiplicações — truncar deslocaria meia peça por causa de um 0,4999999.
 */
function celulasDaPeca(pos, qual) {
  const m = pos.mascara;
  const passo = pos.passo;
  const col0 = Math.round((pos.x + m.offX) / passo);
  const row0 = Math.round((pos.y + m.offY) / passo);
  const celulas = [];

  if (qual === "folga") {
    // A peça já com a folga: em cada coluna ela vai de `topo` a `base`. É a
    // mesma leitura que o encaixe faz para descer a peça, mas aqui aplicada à
    // posição FINAL que a tela recebeu — que passou por offX e pelo passo no
    // caminho, e é justamente esse caminho que se quer conferir.
    for (let c = 0; c < m.cols; c++) {
      if (m.topo[c] < 0) continue;
      for (let r = m.topo[c]; r <= m.base[c]; r++) celulas.push([col0 + c, row0 + r]);
    }
    return celulas;
  }

  const bits = m[qual];
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (bits[r * m.cols + c]) celulas.push([col0 + c, row0 + r]);
    }
  }
  return celulas;
}

/**
 * Procura célula ocupada por duas peças.
 *
 * Devolve o total de células repetidas e um exemplo, que é o que faz o
 * diagnóstico andar: saber que houve sobreposição não diz nada, saber que foi a
 * manga #3 em cima da camiseta #1 em tal centímetro diz tudo.
 */
function acharSobreposicao(posicoes, qual) {
  const ocupadas = new Map();
  let repetidas = 0;
  let exemplo = null;

  posicoes.forEach((pos, indice) => {
    if (!pos.mascara || (qual !== "folga" && !pos.mascara[qual])) return;
    celulasDaPeca(pos, qual).forEach(([c, r]) => {
      const chave = c * 100000 + r;
      const antes = ocupadas.get(chave);
      if (antes === undefined) { ocupadas.set(chave, indice); return; }
      repetidas++;
      if (!exemplo) {
        exemplo = {
          a: descrever(posicoes[antes]), b: descrever(pos),
          cm: [(c * pos.passo).toFixed(1), (r * pos.passo).toFixed(1)],
        };
      }
    });
  });

  return { repetidas, exemplo, celulas: ocupadas.size };
}

/**
 * A folga DE VERDADE entre as peças de um encaixe: a menor distância, em linha
 * reta, entre a silhueta de uma peça e a de outra.
 *
 * A conferência por `topo`/`base` logo acima olha a peça já engordada, e a peça
 * engordada é o que o motor usa para decidir — então ela responde "o motor
 * seguiu a própria regra", que é quase uma tautologia. Esta aqui pergunta outra
 * coisa: **a distância que sobrou no tecido é a que a produção pediu?**
 *
 * Foi essa pergunta que pegou o defeito da borda quadrada. Engordar a silhueta
 * com uma passada horizontal e outra vertical desenha um quadrado, e quadrado
 * alcança 41% a mais na diagonal — então a folga saía certa onde duas peças se
 * tocavam por uma reta e até 41% maior em qualquer encosto em curva. Pedir
 * 4 mm e receber de 4 a 5,7 mm conforme o ângulo.
 *
 * Só as células de BORDA de cada peça entram na conta: a distância mínima entre
 * duas silhuetas é sempre entre bordas, e olhar o miolo multiplicaria o custo
 * por nada.
 */
function medirFolga(posicoes, larguraTecido, consumo, passo, folgaPedida) {
  const cols = Math.ceil(larguraTecido / passo) + 2;
  const rows = Math.ceil(consumo / passo) + 2;
  const dono = new Int32Array(cols * rows).fill(-1);

  posicoes.forEach((pos, i) => {
    const m = pos.mascara;
    if (!m) return;
    const c0 = Math.round((pos.x + m.offX) / passo);
    const r0 = Math.round((pos.y + m.offY) / passo);
    for (let y = 0; y < m.rows; y++) {
      const ly = r0 + y;
      if (ly < 0 || ly >= rows) continue;
      for (let x = 0; x < m.cols; x++) {
        const lx = c0 + x;
        if (lx < 0 || lx >= cols) continue;
        if (m.desenho[y * m.cols + x]) dono[ly * cols + lx] = i;
      }
    }
  });

  const alcance = Math.ceil(folgaPedida / passo) + 2;
  let menor = Infinity;
  let abaixoDoPedido = 0;
  let exemplo = null;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = dono[y * cols + x];
      if (a < 0) continue;
      // só borda
      if (dono[y * cols + x - 1] === a && dono[y * cols + x + 1] === a
        && y > 0 && dono[(y - 1) * cols + x] === a
        && y + 1 < rows && dono[(y + 1) * cols + x] === a) continue;

      for (let dy = -alcance; dy <= alcance; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -alcance; dx <= alcance; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= cols) continue;
          const b = dono[ny * cols + nx];
          if (b < 0 || b === a) continue;
          const d = Math.hypot(dx, dy) * passo;
          if (d < menor) { menor = d; exemplo = { a: posicoes[a], b: posicoes[b] }; }
          if (d < folgaPedida - 1e-9) abaixoDoPedido++;
        }
      }
    }
  }
  return { menor, abaixoDoPedido, exemplo };
}

const descrever = (pos) =>
  `${pos.item.nome}#${pos.item.copia} (${pos.rot}°, x=${pos.x.toFixed(2)} y=${pos.y.toFixed(2)})`;

/** Roda um encaixador só, sem busca: o que se confere é o posicionamento. */
function encaixarCom(motor, motorNome, itens, receita, passo) {
  const config = {
    larguraTecido: receita.larguraTecido, espaco: receita.espaco,
    comprimentoBancada: receita.comprimentoBancada || 0,
    passo, heuristica: "fundo",
    alturaMax: itens.reduce((s, i) => s + Math.max(i.largura, i.altura) + receita.espaco, 0),
  };
  if (motorNome === "retangulo") return motor.encaixar(itens, { ...config, heuristica: "bl" });
  // "contorno+repesca" é o caminho da repescagem nos vãos, e ele merece
  // conferência própria: é o ÚNICO que mexe numa peça depois de assentada.
  // Os outros só empilham; este tira do lugar e recoloca, e recolocar errado é
  // exatamente como nasce peça em cima de peça.
  // "vaos" é o encaixe híbrido: silhueta do contorno com a contabilidade de
  // espaço livre da caixa. Ele posiciona por lista de intervalos, um caminho
  // completamente diferente do relevo — e caminho novo de posicionamento é
  // exatamente onde sobreposição nasce.
  if (motorNome === "vaos") return motor.encaixarPorVaos(motor.montarUnidades(itens, 1), config);
  const comRepesca = motorNome === "contorno+repesca";
  return motor.encaixarContorno(motor.montarUnidades(itens, 1),
    comRepesca ? { ...config, repescar: true } : config);
}

function lerArgumentos(argv) {
  const opcoes = { motores: ["contorno", "contorno+repesca", "vaos"], trabalhos: Object.keys(TRABALHOS) };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--motor") { opcoes.motores = argv[i + 1].split(","); i++; }
    else if (argv[i] === "--trabalhos") { opcoes.trabalhos = argv[i + 1].split(","); i++; }
    else throw new Error(`argumento desconhecido: ${argv[i]}`);
  }
  return opcoes;
}

async function principal() {
  const opcoes = lerArgumentos(process.argv);
  const motor = await carregarMotor({ comWasm: true });
  const falhas = [];

  for (const nome of opcoes.trabalhos) {
    const receita = TRABALHOS[nome];
    const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
    const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
      passo, raio, giro: p.giro || "180", qtd: p.qtd,
    }));
    const itens = expandir(pecas);

    // Com e sem bancada. A trava empurra a peça para BAIXO do ponto em que a
    // gravidade a deixou, e empurrar para baixo é justamente o movimento que
    // enfiaria uma peça dentro de outra se em algum motor "abaixo" não quisesse
    // dizer "livre".
    for (const bancada of [0, 200]) {
    for (const motorNome of opcoes.motores) {
      const r = encaixarCom(motor, motorNome, itens,
        { ...receita, comprimentoBancada: bancada }, passo);
      // O encaixe por caixa não devolve máscara (ele trabalha só com o
      // retângulo), então não há silhueta para conferir.
      if (!r.posicoes.some((p) => p.mascara)) {
        process.stdout.write(`  ${nome.padEnd(20)} ${motorNome.padEnd(18)}`
          + ` bancada ${bancada ? `${bancada} cm` : "sem   "} · sem máscara, nada a conferir\n`);
        continue;
      }

      const real = acharSobreposicao(r.posicoes, "desenho");
      const comFolga = acharSobreposicao(r.posicoes, "folga");
      const distancia = medirFolga(r.posicoes, receita.larguraTecido, r.consumo, passo, receita.espaco);
      const situacao = real.repetidas > 0
        ? `SOBREPÕE ${real.repetidas} células`
        : comFolga.repetidas > 0
          ? `folga comida em ${comFolga.repetidas} células`
          : distancia.abaixoDoPedido > 0
            ? `FOLGA CURTA: ${(distancia.menor * 10).toFixed(1)} mm`
            : "limpo";

      process.stdout.write(`  ${nome.padEnd(20)} ${motorNome.padEnd(18)}`
        + ` bancada ${bancada ? `${bancada} cm` : "sem   "} ·`
        + ` ${r.posicoes.length} peças · ${(r.consumo / 100).toFixed(2)} m`
        + ` · folga ${(distancia.menor * 10).toFixed(1)}/${(receita.espaco * 10).toFixed(0)} mm`
        + ` · ${situacao}\n`);

      if (distancia.abaixoDoPedido > 0) {
        falhas.push(`${nome} · ${motorNome}: a folga entre peças ficou em`
          + ` ${(distancia.menor * 10).toFixed(1)} mm, abaixo dos`
          + ` ${(receita.espaco * 10).toFixed(0)} mm pedidos`
          + `\n      ${descrever(distancia.exemplo.a)}\n      ${descrever(distancia.exemplo.b)}`);
      }

      if (real.repetidas > 0) {
        falhas.push(`${nome} · ${motorNome}: ${real.repetidas} células com duas peças`
          + `\n      ${real.exemplo.a}\n      ${real.exemplo.b}`
          + `\n      primeiro choque em x=${real.exemplo.cm[0]} y=${real.exemplo.cm[1]} cm`);
      } else if (comFolga.repetidas > 0) {
        falhas.push(`${nome} · ${motorNome}: a folga entre peças foi comida em`
          + ` ${comFolga.repetidas} células (as peças não se sobrepõem, mas encostam)`
          + `\n      ${comFolga.exemplo.a}\n      ${comFolga.exemplo.b}`);
      }
    }
    }
  }

  console.log("");
  if (falhas.length === 0) {
    console.log("OK — nenhuma peça em cima de outra, e a folga foi respeitada.");
    return;
  }
  console.log(`FALHOU — ${falhas.length} caso(s):`);
  falhas.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
