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

/*
 * OS TRABALHOS DA VARREDURA, E POR QUE NÃO SÃO TODOS
 * ---------------------------------------------------
 * Esta conferência é cara: ela PINTA cada peça na grade do rolo, célula por
 * célula, uma vez por encaixe — e são cinco caminhos × duas bancadas × três
 * agrupamentos por trabalho. Num lote de 276 peças e 33 m de rolo isso é
 * dezenas de milhões de células, e a varredura passa de dezenas de minutos.
 *
 * Rodar todo trabalho do catálogo também não compra cobertura: o que esta
 * conferência mede é GEOMETRIA — silhueta, giro, folga, bancada —, e dois lotes
 * feitos das mesmas peças exercitam exatamente o mesmo código. Os lotes de
 * medição (`pedido-*`, `producao-misturada`, `so-camiseta-avulsa`) existem para
 * a metragem da bancada, e as peças deles já estão aqui dentro por outro lote.
 *
 * Então a lista é por caso geométrico, um lote de cada:
 *
 *   camiseta+manga+gola  concavidade de verdade, três famílias
 *   misturado-pequeno    muitos formatos no mesmo rolo
 *   arte-partida         silhueta em DOIS blocos soltos — o caso que derrubou
 *                        o NFP, e o motivo de este arquivo existir
 *   tamanhos-extremos    a peça pequena descendo no vão da grande
 *   tiras                6:1 e 3:1, onde a folga fica mais apertada
 *   quase-retangulo      sem concavidade nenhuma: a contraprova
 *   giro-livre/giro-fixo os dois ramos de rotação (com "livre" o motor testa
 *                        quatro rotações por peça; com "fixa", uma)
 *   producao-avulsa      um arquivo por peça: é o único lote em que o BLOCO
 *                        nasce de arquivos diferentes (ver `chaveDaSilhueta`,
 *                        em encaixeMotor.js), que é o que pode montar bloco
 *                        errado — e bloco errado é peça em cima de peça
 *   lote-grande          volume, para o caso em que a bancada reparte muito
 *
 * O resto entra com `--trabalhos nome` ou `--todos`, quando a mexida pedir.
 */
const TRABALHOS_PADRAO = [
  "camiseta+manga+gola", "misturado-pequeno", "arte-partida", "tamanhos-extremos",
  "tiras", "quase-retangulo", "giro-livre", "giro-fixo", "producao-avulsa", "lote-grande",
];

/*
 * OS AGRUPAMENTOS, E POR QUE ELES PRECISAVAM ENTRAR
 * -------------------------------------------------
 * A varredura encaixava só com a peça SOLTA (`montarUnidades(itens, 1)`), e
 * assim nenhum bloco passava por aqui — nem a dupla, nem o trio. É um buraco
 * antigo que ficou grave agora: o bloco mede as formas na PRIMEIRA cópia e
 * assenta as outras no mesmo desenho, então juntar no mesmo bloco duas peças
 * que não são idênticas põe, literalmente, peça em cima de peça.
 *
 * Enquanto "mesma peça" queria dizer "mesmo arquivo", isso não podia acontecer.
 * Desde que o motor passou a reconhecer peça igual pela SILHUETA, pode — e é
 * esta varredura que tem que provar que não acontece.
 */
const AGRUPAMENTOS_PADRAO = [1, 2, 3];

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
  /*
   * O tecido inteiro num vetor tipado, e não num Map de células ocupadas.
   *
   * O Map era natural — só as células ocupadas entram — e estourava: ele tem
   * teto de umas 16,7 milhões de entradas, e um lote de 260 peças num rolo
   * comprido passa disso. A conferência morria com "Map maximum size exceeded"
   * justamente no trabalho maior, que é onde ela mais precisa rodar.
   *
   * O vetor gasta memória pelo rolo inteiro em vez de pelo que está ocupado, e
   * isso sai barato: um rolo de 40 m a 0,25 cm por célula são 11 milhões de
   * células, 44 MB de Int32Array. Em troca, o acesso é um índice direto e não
   * há teto nenhum.
   *
   * Guarda `indice + 1` para o zero poder significar "vazia".
   */
  let maxCol = 0;
  let maxLin = 0;
  const daPeca = [];
  posicoes.forEach((pos) => {
    if (!pos.mascara || (qual !== "folga" && !pos.mascara[qual])) { daPeca.push(null); return; }
    const celulas = celulasDaPeca(pos, qual);
    celulas.forEach(([c, r]) => {
      if (c > maxCol) maxCol = c;
      if (r > maxLin) maxLin = r;
    });
    daPeca.push(celulas);
  });

  const largura = maxCol + 1;
  const ocupadas = new Int32Array(largura * (maxLin + 1));
  let repetidas = 0;
  let exemplo = null;
  let celulas = 0;

  posicoes.forEach((pos, indice) => {
    const minhas = daPeca[indice];
    if (!minhas) return;
    minhas.forEach(([c, r]) => {
      const onde = r * largura + c;
      const antes = ocupadas[onde];
      if (antes === 0) { ocupadas[onde] = indice + 1; celulas++; return; }
      repetidas++;
      if (!exemplo) {
        exemplo = {
          a: descrever(posicoes[antes - 1]), b: descrever(pos),
          cm: [(c * pos.passo).toFixed(1), (r * pos.passo).toFixed(1)],
        };
      }
    });
  });

  return { repetidas, exemplo, celulas };
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
  // A grade do motor tem a borda do engorde dos dois lados (ver
  // `colunasDoTecido`, em encaixeMotor.js), e `x + offX` cai nela.
  const borda = Math.max(0, ...posicoes.map((p) => Math.round(((p.mascara && p.mascara.recuo) || 0) / passo)));
  const cols = Math.ceil(larguraTecido / passo) + 2 + 2 * borda;
  const rows = Math.ceil(consumo / passo) + 2 + 2 * borda;
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

/**
 * A peça de verdade não sai do tecido, e encosta na borda.
 *
 * O engorde da folga pode passar da beira do rolo — a folga é entre peças, e
 * na borda não há vizinha (ver "A BORDA DO TECIDO NÃO LEVA FOLGA", em
 * encaixeMotor.js). A SILHUETA, não: ela tem que caber entre 0 e a largura do
 * tecido. Devolve também o quanto a peça mais à esquerda e a mais de cima
 * ficaram da borda, que é o que mostra se a folga continuou indo para lá.
 */
function conferirBordas(posicoes, larguraTecido) {
  let fora = 0;
  let exemplo = null;
  let esquerda = Infinity;
  let topo = Infinity;
  posicoes.forEach((pos) => {
    const m = pos.mascara;
    if (!m) return;
    const x0 = pos.x + m.offX - (m.recuo || 0);
    const y0 = pos.y + m.offY - (m.recuo || 0);
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        if (!m.desenho[r * m.cols + c]) continue;
        const x = x0 + c * pos.passo;
        const y = y0 + r * pos.passo;
        if (x < esquerda) esquerda = x;
        if (y < topo) topo = y;
        if (x < -1e-6 || y < -1e-6 || x + pos.passo > larguraTecido + 1e-6) {
          fora++;
          if (!exemplo) exemplo = pos;
        }
      }
    }
  });
  return { fora, exemplo, esquerda, topo };
}

const descrever = (pos) =>
  `${pos.item.nome}#${pos.item.copia} (${pos.rot}°, x=${pos.x.toFixed(2)} y=${pos.y.toFixed(2)})`;

/** Roda um encaixador só, sem busca: o que se confere é o posicionamento. */
function encaixarCom(motor, motorNome, itens, receita, passo, agrupamento) {
  const config = {
    larguraTecido: receita.larguraTecido, espaco: receita.espaco,
    comprimentoBancada: receita.comprimentoBancada || 0,
    // O raio do engorde, como a tela manda: é ele que tira a folga da borda.
    raio: receita.raio,
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
  if (motorNome === "vaos" || motorNome === "vaos+repesca") {
    return motor.encaixarPorVaos(motor.montarUnidades(itens, agrupamento),
      motorNome === "vaos+repesca" ? { ...config, repescar: true, repescaVoltas: 3 } : config);
  }
  // Várias voltas de repescagem ("contorno+repesca3") mexem na MESMA peça mais
  // de uma vez, cada volta com os intervalos que a anterior deixou. Se a conta
  // dos intervalos errasse ao devolver uma peça ao mapa, é aqui que apareceria.
  const voltas = motorNome === "contorno+repesca3" ? 3
    : motorNome === "contorno+repesca" ? 1 : 0;
  return motor.encaixarContorno(motor.montarUnidades(itens, agrupamento),
    voltas > 0 ? { ...config, repescar: true, repescaVoltas: voltas } : config);
}

function lerArgumentos(argv) {
  const opcoes = {
    motores: ["contorno", "contorno+repesca", "contorno+repesca3", "vaos", "vaos+repesca"],
    trabalhos: TRABALHOS_PADRAO,
    agrupamentos: AGRUPAMENTOS_PADRAO,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--motor") { opcoes.motores = argv[i + 1].split(","); i++; }
    else if (argv[i] === "--trabalhos") { opcoes.trabalhos = argv[i + 1].split(","); i++; }
    else if (argv[i] === "--todos") { opcoes.trabalhos = Object.keys(TRABALHOS); }
    else if (argv[i] === "--agrupamento") {
      opcoes.agrupamentos = argv[i + 1].split(",").map(Number); i++;
    }
    else throw new Error(`argumento desconhecido: ${argv[i]}`);
  }
  opcoes.trabalhos.forEach((nome) => {
    if (!TRABALHOS[nome]) throw new Error(`trabalho desconhecido: ${nome}`);
  });
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
    for (const agrupamento of opcoes.agrupamentos) {
    for (const motorNome of opcoes.motores) {
      const bloco = agrupamento > 1 ? `bloco ${agrupamento}` : "solta  ";
      const r = encaixarCom(motor, motorNome, itens,
        { ...receita, comprimentoBancada: bancada, raio }, passo, agrupamento);
      // O encaixe por caixa não devolve máscara (ele trabalha só com o
      // retângulo), então não há silhueta para conferir.
      if (!r.posicoes.some((p) => p.mascara)) {
        process.stdout.write(`  ${nome.padEnd(20)} ${motorNome.padEnd(18)} ${bloco}`
          + ` bancada ${bancada ? `${bancada} cm` : "sem   "} · sem máscara, nada a conferir\n`);
        continue;
      }

      const real = acharSobreposicao(r.posicoes, "desenho");
      const comFolga = acharSobreposicao(r.posicoes, "folga");
      const distancia = medirFolga(r.posicoes, receita.larguraTecido, r.consumo, passo, receita.espaco);
      const bordas = conferirBordas(r.posicoes, receita.larguraTecido);
      const situacao = bordas.fora > 0
        ? `FORA DO TECIDO em ${bordas.fora} células`
        : real.repetidas > 0
        ? `SOBREPÕE ${real.repetidas} células`
        : comFolga.repetidas > 0
          ? `folga comida em ${comFolga.repetidas} células`
          : distancia.abaixoDoPedido > 0
            ? `FOLGA CURTA: ${(distancia.menor * 10).toFixed(1)} mm`
            : "limpo";

      process.stdout.write(`  ${nome.padEnd(20)} ${motorNome.padEnd(18)} ${bloco} `
        + ` bancada ${bancada ? `${bancada} cm` : "sem   "} ·`
        + ` ${r.posicoes.length} peças · ${(r.consumo / 100).toFixed(2)} m`
        + ` · folga ${(distancia.menor * 10).toFixed(1)}/${(receita.espaco * 10).toFixed(0)} mm`
        + ` · borda ${(bordas.esquerda * 10).toFixed(1)}/${(bordas.topo * 10).toFixed(1)} mm`
        + ` · ${situacao}\n`);

      if (bordas.fora > 0) {
        falhas.push(`${nome} · ${motorNome} · ${bloco.trim()}: ${bordas.fora} células de peça fora do tecido`
          + `\n      ${descrever(bordas.exemplo)}`);
      }

      if (distancia.abaixoDoPedido > 0) {
        falhas.push(`${nome} · ${motorNome} · ${bloco.trim()}: a folga entre peças ficou em`
          + ` ${(distancia.menor * 10).toFixed(1)} mm, abaixo dos`
          + ` ${(receita.espaco * 10).toFixed(0)} mm pedidos`
          + `\n      ${descrever(distancia.exemplo.a)}\n      ${descrever(distancia.exemplo.b)}`);
      }

      if (real.repetidas > 0) {
        falhas.push(`${nome} · ${motorNome} · ${bloco.trim()}: ${real.repetidas} células com duas peças`
          + `\n      ${real.exemplo.a}\n      ${real.exemplo.b}`
          + `\n      primeiro choque em x=${real.exemplo.cm[0]} y=${real.exemplo.cm[1]} cm`);
      } else if (comFolga.repetidas > 0) {
        falhas.push(`${nome} · ${motorNome} · ${bloco.trim()}: a folga entre peças foi comida em`
          + ` ${comFolga.repetidas} células (as peças não se sobrepõem, mas encostam)`
          + `\n      ${comFolga.exemplo.a}\n      ${comFolga.exemplo.b}`);
      }
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
