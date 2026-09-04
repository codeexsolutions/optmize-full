/**
 * A ponte entre o encaixe e o motor em WebAssembly (wasm/src/lib.rs).
 *
 * O que atravessa
 * ---------------
 * As formas das peças vão uma vez por busca: são elas que custam a montar e
 * não mudam entre uma tentativa e outra. A cada tentativa atravessa só a
 * **ordem** das peças — um número por peça — e volta onde cada uma parou.
 *
 * Foi essa divisão que decidiu portar a rodada inteira em vez do laço de
 * dentro: chamando por peça, o relevo do tecido (uma altura por coluna do
 * rolo) teria que ser copiado 21 mil vezes por busca, e a cópia comeria o
 * ganho. Assim o relevo nasce e morre do lado do WASM.
 *
 * O arranjo da memória é decidido aqui, no JavaScript; o Rust só recebe um
 * cabeçalho dizendo onde cada coisa está. A ordem dos campos do cabeçalho tem
 * que bater com as constantes CAB_* do lib.rs.
 *
 * Se o WASM não carregar, nada disso é usado e o encaixe segue pelo caminho de
 * sempre em JavaScript — que continua sendo a referência de correção.
 */

// Os campos do cabeçalho, na mesma ordem do lib.rs.
const WASM_CAB = {
  formaCols: 0, formaNCols: 1, formaSomaTopo: 2, formaMaxBase: 3, formaNSondas: 4,
  formaTopo: 5, formaBase: 6, formaSondas: 7,
  unidInicio: 8, unidQtd: 9,
  ordem: 10, nOrdem: 11,
  perfil: 12, colsTecido: 13, usaVazio: 14, pulo: 15,
  acumulado: 16, saida: 17, linhasBancada: 18,
};
const WASM_CAB_TAMANHO = 19;

let motorWasm = null;      // { instancia, i32, memoria }
let motorWasmFalhou = false;

/** O motor está pronto para uso? */
function temMotorWasm() {
  return motorWasm !== null;
}

/**
 * Carrega o módulo. Chamado uma vez, no começo do worker.
 *
 * Falhar aqui não é erro fatal: o encaixe continua pelo caminho em JavaScript.
 * É o que acontece num navegador sem WebAssembly, ou se o arquivo não estiver
 * onde deveria.
 */
async function carregarMotorWasm(deOndeVem = "/encaixe.wasm") {
  if (motorWasm || motorWasmFalhou) return temMotorWasm();
  try {
    // Aceita o endereço (é o que o worker usa) ou os bytes já lidos, que é
    // como os testes fora do navegador carregam o módulo.
    let bytes = deOndeVem;
    if (typeof deOndeVem === "string") {
      const resposta = await fetch(deOndeVem);
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      bytes = await resposta.arrayBuffer();
    }
    const { instance } = await WebAssembly.instantiate(bytes);
    motorWasm = {
      instancia: instance,
      memoria: instance.exports.memory,
      // Onde acaba a pilha do módulo e começa o que é nosso.
      base: instance.exports.__heap_base.valueOf(),
      // O primeiro índice de 32 bits ainda livre, e de que geração ele é.
      // Ver `prepararUnidadesNoWasm` para o porquê de existirem gerações.
      proximoLivre: 0,
      geracao: 1,
      i32: null,
      i64: null,
    };
    motorWasm.proximoLivre = Math.ceil(motorWasm.base / 4 / 2) * 2;
    revisarVistas();
    return true;
  } catch (erro) {
    console.warn("[encaixe] WebAssembly indisponível, seguindo em JavaScript:", erro && erro.message);
    motorWasmFalhou = true;
    return false;
  }
}

/**
 * As vistas sobre a memória do módulo.
 *
 * Precisam ser refeitas toda vez que a memória cresce: `memory.grow` troca o
 * ArrayBuffer, e as vistas antigas ficam apontando para o nada.
 */
function revisarVistas() {
  motorWasm.i32 = new Int32Array(motorWasm.memoria.buffer);
  motorWasm.i64 = new BigInt64Array(motorWasm.memoria.buffer);
}

/** Garante que a memória do módulo comporta `bytes` no total. */
function garantirMemoria(bytes) {
  const atual = motorWasm.memoria.buffer.byteLength;
  if (atual >= bytes) return;
  const paginas = Math.ceil((bytes - atual) / 65536);
  motorWasm.memoria.grow(paginas);
  revisarVistas();
}

/**
 * Escreve as formas de um conjunto de unidades na memória do módulo.
 *
 * O resultado fica guardado no próprio array de unidades. Uma busca chama
 * `encaixarContorno` centenas de vezes com as mesmas unidades em ordens
 * diferentes, e montar isto de novo a cada vez seria jogar fora justamente o
 * que o WASM veio economizar.
 *
 * A conferência é por identidade das unidades, não do array: a busca ordena e
 * embaralha cópias do array, mas os objetos das unidades são sempre os mesmos.
 */
function prepararUnidadesNoWasm(unidades) {
  const nUnidades = unidades.length;
  if (nUnidades === 0) return null;

  const jaMontado = unidades[0]._wasm;
  if (jaMontado && jaMontado.motor === motorWasm
      && jaMontado.geracao === motorWasm.geracao && jaMontado.total === nUnidades) {
    return jaMontado.plano;
  }

  let nFormas = 0;
  unidades.forEach((u) => { nFormas += u.formas.length; });

  // Primeira passada: quanto espaço cada coisa ocupa (em números de 32 bits).
  let colsDasFormas = 0, sondasDasFormas = 0;
  unidades.forEach((u) => u.formas.forEach((f) => {
    const sondas = f.sondas || (f.sondas = sondasDaForma(f));
    colsDasFormas += f.cols * 2; // topo e base
    sondasDasFormas += sondas.length;
  }));

  // O maior tecido que este plano pode atender. Sobra é barata; refazer não é.
  const COLS_TECIDO_MAX = 4096;

  // Cada plano é montado **depois** do anterior, e não por cima dele.
  //
  // Foi um erro que quase passou: uma busca trabalha com dois conjuntos de
  // unidades ao mesmo tempo — as peças soltas e as emparelhadas em dupla — e
  // alterna entre eles a cada tentativa. Montando os dois no mesmo endereço, o
  // segundo apagava o primeiro, que continuava achando que estava montado, e o
  // encaixe saía lendo forma errada.
  //
  // Quando o espaço acaba, tudo recomeça do começo e a geração avança; os
  // planos antigos ficam automaticamente inválidos, porque a conferência lá em
  // cima compara a geração.
  const LIMITE_BYTES = 64 * 1024 * 1024;
  const alinhar = (i, quantos) => Math.ceil(i / quantos) * quantos;
  if (motorWasm.proximoLivre * 4 > LIMITE_BYTES) {
    motorWasm.proximoLivre = alinhar(Math.ceil(motorWasm.base / 4), 2);
    motorWasm.geracao++;
  }
  let i = alinhar(motorWasm.proximoLivre, 2);

  const plano = { cabecalho: i };
  i += WASM_CAB_TAMANHO;

  const reservar = (quantos) => { const onde = i; i += quantos; return onde; };
  plano.formaCols = reservar(nFormas);
  plano.formaNCols = reservar(nFormas);
  plano.formaSomaTopo = reservar(nFormas);
  plano.formaMaxBase = reservar(nFormas);
  plano.formaNSondas = reservar(nFormas);
  plano.formaTopo = reservar(nFormas);
  plano.formaBase = reservar(nFormas);
  plano.formaSondas = reservar(nFormas);
  plano.unidInicio = reservar(nUnidades);
  plano.unidQtd = reservar(nUnidades);
  plano.ordem = reservar(nUnidades);
  plano.perfil = reservar(COLS_TECIDO_MAX);
  i = alinhar(i, 2); // o acumulado é de 64 bits e precisa de endereço par
  plano.acumulado = reservar((COLS_TECIDO_MAX + 1) * 2);
  plano.saida = reservar(nUnidades * 4);
  plano.dados = reservar(colsDasFormas + sondasDasFormas);
  plano.colsTecidoMax = COLS_TECIDO_MAX;
  plano.nUnidades = nUnidades;

  garantirMemoria(i * 4 + 64);
  motorWasm.proximoLivre = alinhar(i, 2);
  const i32 = motorWasm.i32;

  // Segunda passada: escreve.
  let d = plano.dados;
  let f = 0;
  unidades.forEach((u, indiceUnidade) => {
    i32[plano.unidInicio + indiceUnidade] = f;
    i32[plano.unidQtd + indiceUnidade] = u.formas.length;
    u.formas.forEach((forma) => {
      i32[plano.formaCols + f] = forma.cols;
      i32[plano.formaNCols + f] = forma.nCols;
      i32[plano.formaSomaTopo + f] = forma.somaTopo;
      i32[plano.formaMaxBase + f] = forma.maxBase;
      i32[plano.formaNSondas + f] = forma.sondas.length;

      i32[plano.formaTopo + f] = d;
      i32.set(forma.topo, d); d += forma.cols;
      i32[plano.formaBase + f] = d;
      i32.set(forma.base, d); d += forma.cols;
      i32[plano.formaSondas + f] = d;
      i32.set(forma.sondas, d); d += forma.sondas.length;
      f++;
    });
  });

  // Os campos fixos do cabeçalho.
  const cab = plano.cabecalho;
  i32[cab + WASM_CAB.formaCols] = plano.formaCols;
  i32[cab + WASM_CAB.formaNCols] = plano.formaNCols;
  i32[cab + WASM_CAB.formaSomaTopo] = plano.formaSomaTopo;
  i32[cab + WASM_CAB.formaMaxBase] = plano.formaMaxBase;
  i32[cab + WASM_CAB.formaNSondas] = plano.formaNSondas;
  i32[cab + WASM_CAB.formaTopo] = plano.formaTopo;
  i32[cab + WASM_CAB.formaBase] = plano.formaBase;
  i32[cab + WASM_CAB.formaSondas] = plano.formaSondas;
  i32[cab + WASM_CAB.unidInicio] = plano.unidInicio;
  i32[cab + WASM_CAB.unidQtd] = plano.unidQtd;
  i32[cab + WASM_CAB.ordem] = plano.ordem;
  i32[cab + WASM_CAB.perfil] = plano.perfil;
  i32[cab + WASM_CAB.acumulado] = plano.acumulado;
  i32[cab + WASM_CAB.saida] = plano.saida;

  // Cada unidade guarda o próprio número, para a ordem virar uma lista de
  // índices na hora da tentativa.
  unidades.forEach((u, indiceUnidade) => {
    u._wasm = { plano, total: nUnidades, motor: motorWasm, geracao: motorWasm.geracao, id: indiceUnidade };
  });
  return plano;
}

/**
 * Uma rodada de posicionamento pelo WASM, com a mesma assinatura e o mesmo
 * resultado de `encaixarContorno`.
 *
 * Devolve `null` quando não dá para usar o WASM neste caso — aí quem chamou
 * segue pelo caminho em JavaScript.
 */
function encaixarContornoWasm(unidades, config) {
  if (!temMotorWasm() || unidades.length === 0) return null;
  /*
   * O Rust conhece duas notas: "fundo" e "vazio" (o `usaVazio` do cabeçalho).
   * Heurística que ele não conhece — hoje a "contato", do top-K — tem que
   * cair no caminho em JavaScript, e não ser tratada como "fundo": tratada
   * assim, a receita nova rodaria disfarçada de uma que já existe, daria o
   * mesmo resultado, e a medição diria que ela não serve para nada sem que
   * ela jamais tivesse rodado.
   *
   * O preço é que ela roda ~3,9x mais devagar por tentativa enquanto não for
   * portada para o Rust. Isso pesa CONTRA ela na medição, então um ganho
   * medido assim é um ganho com desconto.
   */
  if (config.heuristica !== "fundo" && config.heuristica !== "vazio") return null;

  const { larguraTecido, passo, heuristica } = config;
  const colsTecido = config.colsForcado || Math.max(1, Math.floor(larguraTecido / passo));
  const linhasBancada = bancadaEmCelulas(config, reservaDaArte(unidades, passo));

  const plano = prepararUnidadesNoWasm(unidades);
  if (!plano || colsTecido > plano.colsTecidoMax) return null;

  const i32 = motorWasm.i32;
  const cab = plano.cabecalho;

  for (let k = 0; k < unidades.length; k++) i32[plano.ordem + k] = unidades[k]._wasm.id;
  i32[cab + WASM_CAB.nOrdem] = unidades.length;
  i32[cab + WASM_CAB.colsTecido] = colsTecido;
  i32[cab + WASM_CAB.usaVazio] = heuristica === "vazio" ? 1 : 0;
  i32[cab + WASM_CAB.pulo] = Math.max(1, Math.round(config.saltoX || 1));
  // 0 = rolo sem fim. A trava da bancada é a mesma dos dois lados, e é o
  // `empurrarParaBancada` de encaixe-motor.js que o Rust copia.
  i32[cab + WASM_CAB.linhasBancada] = linhasBancada || 0;

  const fundoMax = motorWasm.instancia.exports.encaixar(cab * 4);

  // A volta: o WASM diz qual forma venceu e onde; as peças de verdade e as
  // máscaras continuam aqui do lado do JavaScript.
  const colocacoes = [];
  const naoEncaixadas = [];
  // A unidade que deixou mais buraco morto acima dela. É o que o reparo
  // guiado da busca mira (`repararPior`, em encaixe-motor.js) — e o caminho em
  // JavaScript já devolvia isso. Enquanto aqui não devolvia, o reparo ficava
  // desligado justamente na configuração que roda em produção.
  let piorUnidade = null, piorVazio = -Infinity;
  for (let k = 0; k < unidades.length; k++) {
    const s = plano.saida + k * 4;
    const formaGlobal = i32[s];
    const unidade = unidades[k];
    if (formaGlobal < 0) {
      unidade.itens.forEach((item) => naoEncaixadas.push(item));
      continue;
    }
    const x = i32[s + 1];
    const y = i32[s + 2];
    const vazio = i32[s + 3];
    if (vazio > piorVazio) { piorVazio = vazio; piorUnidade = unidade; }
    // Qual forma da unidade venceu: o índice é global, e a primeira forma
    // desta unidade está anotada no plano.
    const forma = unidade.formas[formaGlobal - i32[plano.unidInicio + unidade._wasm.id]];
    // A colocação em células, do jeito que o encaixe decidiu. É dela que a
    // repescagem (`repescarNosVaos`, em encaixe-motor.js) precisa para mexer
    // numa peça já assentada.
    colocacoes.push({ unidade, forma, x, y });
  }

  // As posições saem do mesmo lugar que as do caminho em JavaScript. Já foram
  // montadas aqui, numa cópia da conta — e cópia de conta é onde os dois
  // caminhos se separam sem ninguém ver.
  const posicoes = posicoesDasColocacoes(colocacoes, passo, linhasBancada);

  return {
    posicoes, colocacoes, naoEncaixadas,
    consumo: fundoMax > 0 ? fundoMax * passo : 0,
    areaReal: posicoes.reduce((soma, p) => soma + p.item.mascaras.areaReal, 0),
    piorUnidade, piorVazio,
  };
}
