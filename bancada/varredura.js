#!/usr/bin/env node
/**
 * ===========================================================================
 * A VARREDURA DE AJUSTES — dezenas de configurações, uma tabela só
 * ===========================================================================
 *
 * A bancada (`medir.js`) compara DUAS configurações: a de agora e uma que se
 * quer provar. Isso serve para decidir uma mexida; não serve para perguntar
 * "de tudo que dá para ajustar neste motor, o que ainda tem tecido para dar?".
 * Essa pergunta pede muitas corridas, e responder a ela na mão é uma tarde
 * inteira lançando `--extra` um por um e anotando números em papel.
 *
 * Esta ferramenta faz isso sozinha, e com três cuidados que a resposta exige.
 *
 * O BASE RODA DUAS VEZES, E É ISSO QUE DÁ A RÉGUA
 * -----------------------------------------------
 * A primeira corrida e a última são a MESMA configuração — a de hoje, sem
 * ajuste nenhum. A diferença entre elas não é resultado: é o ruído do dia,
 * medido na mesma máquina, no mesmo estado, com as mesmas sementes. Qualquer
 * ajuste que renda menos que isso rendeu nada, e a tabela diz isso na cara em
 * vez de deixar a conta para quem lê.
 *
 * É a versão automática da regra que o cabeçalho do `medir.js` já ensinava
 * ("diferença de soma abaixo de ~0,25% é empate"), só que sem depender de um
 * número escrito no passado: o ruído é remedido toda vez.
 *
 * DOIS TIPOS DE AJUSTE, E ELES NÃO SE MISTURAM
 * --------------------------------------------
 *   busca      mexe no MOTOR e não muda o que sai da máquina: poda, reparo,
 *              sacudida, fatias, repescagem. Sai tecido de graça, ou não sai.
 *   trabalho   muda o PEDIDO: o giro que cada peça aceita, a folga entre
 *              peças, a largura do rolo. Aqui o tecido não é de graça — quem
 *              decide se a manga pode virar 90° é a produção, não o motor. A
 *              varredura mede o prêmio; a decisão continua sendo de quem corta.
 *
 * Misturar os dois numa tabela só faria um ajuste de trabalho parecer uma
 * vitória do motor. Por isso eles saem separados e rotulados.
 *
 * O GIRO É VARRIDO PEÇA POR PEÇA
 * ------------------------------
 * E não em bloco, porque medindo assim apareceu o contrário do esperado: no
 * pedido de produção, liberar o giro só da manga deu 30,216 m e liberar o de
 * TODAS as peças deu 31,086 m — mais liberdade, mais tecido gasto. O espaço de
 * busca cresce e o orçamento não, então a busca acha menos. Uma varredura que
 * só testasse "tudo livre" concluiria que o giro não rende.
 *
 *   node bancada/varredura.js
 *   node bancada/varredura.js --trabalhos producao-avulsa --tempo 5 --sementes 2
 *   node bancada/varredura.js --so busca
 *   node bancada/varredura.js --json varredura.json
 */

const fs = require("fs");
const { carregarMotor } = require("./motor");
const { TRABALHOS } = require("./trabalhos");
const { FATIAS, prepararTrabalho, buscarComoAProducao } = require("./corrida");

// Os lotes que representam a produção de verdade: um arquivo por peça, muitas
// peças (ver o cabeçalho de `producao-avulsa`, em trabalhos.js). Varrer os
// lotes pequenos daria empate em tudo — lá a busca tem orçamento de sobra.
const TRABALHOS_PADRAO = ["producao-avulsa", "lote-grande"];

/*
 * OS ENCAIXADORES DA PRODUÇÃO, E POR QUE ELES ENTRAM AQUI
 *
 * O `corrida.js` roda `contorno+retangulo` quando ninguém pede outra coisa —
 * é o padrão ANTIGO da bancada, de quando o encaixe por vãos e o por faixas
 * ainda não existiam. A tela pede os quatro (ver `controlador.js`), e é com os
 * quatro que a metragem da loja sai.
 *
 * Isso não é detalhe de configuração: sem esta linha, a varredura mede tudo
 * contra uma base que não é a da produção, e qualquer ajuste que por acaso
 * acrescente um encaixador aparece como ganho enorme. Aconteceu na primeira
 * corrida desta ferramenta: "sem o encaixe por caixa" (contorno+vaos+faixas)
 * marcou -2,8%, e o que ela estava medindo era o VÃOS entrando, não a caixa
 * saindo. Com a base certa, tirar a caixa dá zero.
 */
const MOTORES_DA_PRODUCAO = ["contorno", "retangulo", "vaos", "faixas"];

/**
 * Os ajustes do MOTOR.
 *
 * Cada um é um `--extra` do `medir.js`, com o nome que aparece na tabela. A
 * lista não é um chute: são os números que estão escritos no motor como
 * decisão medida, postos de novo à prova contra o pedido grande — que é um
 * trabalho diferente daquele em que quase todos eles foram escolhidos.
 */
const AJUSTES_DE_BUSCA = [
  // A poda por motor e a de receita (ver `receitasNaRoda`, em encaixeMotor.js).
  { nome: "podaMotor 1.02 (mais apertada)", extra: { podaMotor: 1.02 } },
  { nome: "podaMotor 1.08 (mais frouxa)", extra: { podaMotor: 1.08 } },
  { nome: "sem poda nenhuma", extra: { podar: false } },
  // O reparo guiado e a reinserção (ver `repararPior` e `reinserir`).
  { nome: "sem reparo guiado", extra: { reparoChance: 0 } },
  { nome: "reparo guiado em dobro", extra: { reparoChance: 0.6 } },
  { nome: "reinsercao em metade", extra: { reinsercaoChance: 0.5 } },
  // O tamanho do lote entre respiros: mexe em quantas tentativas cabem.
  { nome: "lote de 4 tentativas", extra: { tentativasPorLote: 4 } },
  { nome: "lote de 16 tentativas", extra: { tentativasPorLote: 16 } },
  // O encaixe por vãos, que vence toda produção grande, com mais fatias.
  { nome: "2 fatias para o de vaos", extra: { fatiasVaos: 2 } },
  // A repescagem: voltas e alcance (ver `repescarNosVaos`).
  { nome: "repescagem de 1 volta", extra: { repescaVoltas: 1 } },
  { nome: "repescagem de 6 voltas", extra: { repescaVoltas: 6 } },
  { nome: "repescagem em 64 pecas", extra: { repescaMaxPecas: 64 } },
  { nome: "repescagem no rolo todo", extra: { repescaMaxPecas: 999, repescaFatiaDoRabo: 0.01 } },
  // O portfólio: quais blocos e quais ordens disputam.
  { nome: "com quarteto", extra: { agrupamentos: ["solta", "dupla", "trio", "cruzada", "quarteto"] } },
  { nome: "sem a ordem familia", extra: { ordens: ["area", "altura", "lado"] } },
  { nome: "so o encaixe por vaos", extra: { motores: ["vaos"] } },
  { nome: "so o contorno", extra: { motores: ["contorno"] } },
  { nome: "sem o encaixe por caixa", extra: { motores: ["contorno", "vaos", "faixas"] } },
  // O polimento do fim (ver "O POLIMENTO", em encaixeMotor.js).
  { nome: "polimento como era antes", extra: { polimentoAmplo: false } },
  { nome: "polimento de 8 finalistas", extra: { polimentoFinalistas: 8 } },
];

/** Os ajustes do TRABALHO que não dependem de quais peças o lote tem. */
const AJUSTES_DE_TRABALHO = [
  { nome: "folga 3 mm (hoje 4)", ajustes: { espaco: 0.3 } },
  { nome: "folga 5 mm (hoje 4)", ajustes: { espaco: 0.5 } },
];

/** Um ajuste por peça do lote: só ela com o giro livre. E um com todas. */
function ajustesDeGiro(nomesDosTrabalhos) {
  const nomes = new Set();
  nomesDosTrabalhos.forEach((nome) => {
    TRABALHOS[nome].pecas.forEach((p) => nomes.add(p.nome));
  });
  const lista = [...nomes].sort().map((peca) => ({
    nome: `giro livre so em ${peca}`,
    ajustes: { giros: { [peca]: "livre" } },
  }));
  const todas = {};
  nomes.forEach((peca) => { todas[peca] = "livre"; });
  lista.push({ nome: "giro livre em todas", ajustes: { giros: todas } });
  return lista;
}

function lerArgumentos(argv) {
  const opcoes = {
    tempo: 3, sementes: 1, fatias: FATIAS, trabalhos: TRABALHOS_PADRAO,
    so: null, json: null, wasm: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const chave = argv[i];
    const valor = argv[i + 1];
    if (chave === "--tempo") { opcoes.tempo = Number(valor); i++; }
    else if (chave === "--sementes") { opcoes.sementes = Number(valor); i++; }
    else if (chave === "--fatias") { opcoes.fatias = Number(valor); i++; }
    else if (chave === "--trabalhos") { opcoes.trabalhos = valor.split(","); i++; }
    else if (chave === "--so") { opcoes.so = valor; i++; }
    else if (chave === "--json") { opcoes.json = valor; i++; }
    else if (chave === "--sem-wasm") { opcoes.wasm = false; }
    else throw new Error(`argumento desconhecido: ${chave}`);
  }
  opcoes.trabalhos.forEach((nome) => {
    if (!TRABALHOS[nome]) throw new Error(`trabalho desconhecido: ${nome}`);
  });
  if (opcoes.so && !["busca", "trabalho"].includes(opcoes.so)) {
    throw new Error('--so aceita "busca" ou "trabalho"');
  }
  return opcoes;
}

/*
 * As peças preparadas, guardadas por trabalho E por ajuste.
 *
 * Preparar é rasterizar a silhueta de cada peça, e num lote com um arquivo por
 * peça são 175 rasterizações. Os dezenove ajustes de BUSCA usam todos as mesmas
 * peças — só os de trabalho (giro, folga, largura) mudam a máscara —, então sem
 * este cache a varredura passaria mais tempo preparando do que encaixando.
 */
const preparados = new Map();
function trabalhoPreparado(motor, nome, ajustes) {
  const chave = `${nome}|${JSON.stringify(ajustes || {})}`;
  let pronto = preparados.get(chave);
  if (!pronto) {
    pronto = prepararTrabalho(motor, nome, ajustes || {});
    preparados.set(chave, pronto);
  }
  return pronto;
}

/** Uma configuração medida em todos os trabalhos, com todas as sementes. */
async function medirConfiguracao(motor, opcoes, config) {
  const porTrabalho = {};
  let soma = 0;
  for (const nome of opcoes.trabalhos) {
    const trabalho = trabalhoPreparado(motor, nome, config.ajustes);
    let melhor = Infinity;
    for (let s = 0; s < opcoes.sementes; s++) {
      const r = await buscarComoAProducao(motor, trabalho, {
        tempoMs: opcoes.tempo * 1000,
        // A MESMA semente para toda configuração: o que se compara é o ajuste,
        // não a sorte do sorteio.
        semente: 20260824 + s * 7919,
        meta: 0,
        fatias: opcoes.fatias,
        // Os encaixadores da produção por baixo, e o ajuste por cima: assim um
        // ajuste que mexe no portfólio continua mandando, e todo o resto é
        // medido contra o que a loja roda.
        extra: { motores: MOTORES_DA_PRODUCAO, ...(config.extra || {}) },
        espalharSemente: true,
      });
      // O melhor das sementes, que é o que a produção leva para o corte.
      if (r.consumo < melhor) melhor = r.consumo;
    }
    porTrabalho[nome] = melhor;
    soma += melhor;
  }
  return { soma, porTrabalho };
}

const metros = (cm) => `${(cm / 100).toFixed(3)} m`;

async function principal() {
  const opcoes = lerArgumentos(process.argv);
  const motor = await carregarMotor({ comWasm: opcoes.wasm });

  const daBusca = opcoes.so === "trabalho" ? [] : AJUSTES_DE_BUSCA;
  const doTrabalho = opcoes.so === "busca" ? []
    : [...ajustesDeGiro(opcoes.trabalhos), ...AJUSTES_DE_TRABALHO];
  const fila = [
    { nome: "base (como esta hoje)", grupo: "base" },
    ...daBusca.map((a) => ({ ...a, grupo: "busca" })),
    ...doTrabalho.map((a) => ({ ...a, grupo: "trabalho" })),
    { nome: "base de novo (a regua do ruido)", grupo: "base" },
  ];

  console.log(`varredura de ajustes · ${opcoes.trabalhos.length} trabalho(s)`
    + ` · ${opcoes.fatias} fatias × ${opcoes.tempo}s × ${opcoes.sementes} semente(s)`
    + ` · wasm ${motor.comWasm ? "ligado" : "DESLIGADO"}`
    + ` · ${fila.length} corridas`);
  console.log(`trabalhos: ${opcoes.trabalhos.join(", ")}`);
  console.log("");

  const comeco = Date.now();
  const resultados = [];
  for (const config of fila) {
    const r = await medirConfiguracao(motor, opcoes, config);
    resultados.push({ ...config, ...r });
    process.stdout.write(`  ${config.nome.padEnd(34)} ${metros(r.soma).padStart(10)}\n`);
  }

  const base = resultados[0];
  const baseDeNovo = resultados[resultados.length - 1];
  const ruido = Math.abs(baseDeNovo.soma - base.soma) / base.soma;

  const linha = (r) => {
    const dif = (r.soma - base.soma) / base.soma;
    const porTrabalho = opcoes.trabalhos.map((nome) => {
      const d = (r.porTrabalho[nome] - base.porTrabalho[nome]) / base.porTrabalho[nome];
      return `${nome} ${d >= 0 ? "+" : ""}${(d * 100).toFixed(2)}%`;
    }).join(" · ");
    const marca = r.grupo === "base" ? "" : Math.abs(dif) <= ruido ? "  (empate)" : "";
    return `${r.nome.padEnd(34)} ${metros(r.soma).padStart(10)}`
      + `  ${(dif >= 0 ? "+" : "") + (dif * 100).toFixed(2)}%`.padStart(9)
      + `   ${porTrabalho}${marca}`;
  };

  const imprimirGrupo = (titulo, grupo) => {
    const meus = resultados.filter((r) => r.grupo === grupo);
    if (meus.length === 0) return;
    console.log("");
    console.log(titulo);
    console.log("-".repeat(110));
    meus.slice().sort((a, b) => a.soma - b.soma).forEach((r) => console.log(linha(r)));
  };

  console.log("");
  console.log("=".repeat(110));
  console.log(`A RÉGUA DO DIA: o base rodou duas vezes e deu ${metros(base.soma)}`
    + ` e ${metros(baseDeNovo.soma)} — ${(ruido * 100).toFixed(2)}% de diferença.`);
  console.log("Ajuste que rendeu menos que isso não rendeu nada; está marcado (empate).");

  imprimirGrupo("AJUSTES DA BUSCA — mexem no motor, e o tecido que sai deles é de graça", "busca");
  imprimirGrupo("AJUSTES DO TRABALHO — mudam o pedido; quem decide se pode é a produção", "trabalho");

  console.log("");
  console.log(`${Math.round((Date.now() - comeco) / 1000)}s de varredura.`);

  if (opcoes.json) {
    fs.writeFileSync(opcoes.json, JSON.stringify({
      quando: new Date().toISOString(), opcoes, ruido, resultados,
    }, null, 1));
    console.log(`guardado em ${opcoes.json}`);
  }
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
