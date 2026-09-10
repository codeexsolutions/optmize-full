/**
 * ===========================================================================
 * ENCAIXAR NO SERVIDOR — o motor atendendo quem não tem navegador
 * ===========================================================================
 *
 * `POST /api/encaixe/resolver`: recebe os contornos das peças e a largura do
 * tecido, devolve onde cada peça vai.
 *
 * PARA QUEM ISTO EXISTE
 * ---------------------
 * Para o CorelDRAW. A tela de Encaixe roda o motor no próprio navegador, em
 * workers e WebAssembly, e continua assim — não há nada a ganhar mandando um
 * trabalho para o servidor quando ele já está rodando na máquina de quem
 * pediu.
 *
 * O Corel é outra história. Foi medido: o docker dele carrega ou o Internet
 * Explorer 11 (que enxerga o desenho por `window.external.Application`, mas
 * não tem WebAssembly nem ES6) ou o WebView2 (que tem tudo, mas não alcança o
 * desenho — a Corel não registrou nada em `hostObjects`). Nenhum dos dois roda
 * o motor E mexe no desenho ao mesmo tempo.
 *
 * Com o encaixe aqui, isso deixa de importar: o lado do Corel só precisa saber
 * ler curvas, mandar e reposicionar — coisa que o IE faz sem esforço, e a
 * macro VSTA em C# também.
 *
 * O QUE ENTRA
 * -----------
 * Contorno em CENTÍMETROS, do jeito que sai do Corel. A conversão para a
 * grade de células que o motor usa é feita aqui, e não do lado de lá:
 *
 *   contorno em cm  ->  normalizado 0..1  ->  bits na grade  ->  máscaras
 *
 * O caminho não é invenção nova. É o mesmo que `bancada/pecas.js` percorre a
 * cada corrida de `npm run bancada`, com a mesma varredura por linha — o que
 * significa que ele é medido junto com o motor, e não só quando alguém abre o
 * Corel.
 *
 * O QUE ISTO NÃO FAZ
 * ------------------
 * Não guarda nada. Sem banco, sem memória de recordes, sem rede de receitas.
 * Entra trabalho, sai posição. Quem quiser guardar o resultado usa
 * `/api/encaixe/memoria`, que já existe e é de quem tem histórico.
 *
 * É deliberado: o Corel manda um desenho aberto, não um trabalho da loja com
 * nome e histórico. Misturar os dois sujaria o placar da memória com trabalho
 * que ninguém vai repetir.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const { PASTA_DO_APP } = require("./caminhos");

// ==================== O MOTOR, CARREGADO UMA VEZ ====================

/*
 * O motor vem de `servidor/motor-encaixe.js`, gerado por `empacotar/motor.js`
 * dentro do `npm run front`.
 *
 * O `require` é PREGUIÇOSO — dentro da função, não no topo do arquivo — por
 * dois motivos:
 *
 *   1. Sem o pacote gerado, o servidor ainda sobe. Só esta rota falha, e falha
 *      dizendo o que fazer. Um `require` no topo derrubaria o Optimize inteiro
 *      (impressoras, moldes, projetos) por causa de um artefato de build
 *      faltando.
 *   2. O WASM só é lido quando alguém encaixa de verdade. Quem nunca usar o
 *      Corel não paga nada por esta rota existir.
 *
 * O esbuild do `empacotar/compilar.js` resolve `require("./motor-encaixe")`
 * mesmo aqui dentro, porque o caminho é literal — então no programa instalado
 * o motor viaja DENTRO do bytecode, e não como arquivo ao lado.
 *
 * Guardamos A PROMESSA, e não o resultado: duas requisições ao mesmo tempo na
 * primeira subida esperam a mesma carga, em vez de lerem o WASM duas vezes.
 */
let motorPrometido = null;

function carregarMotor() {
  if (motorPrometido) return motorPrometido;

  motorPrometido = (async () => {
    let motor;
    try {
      motor = require("./motor-encaixe");
    } catch (erro) {
      // "Cannot find module" apontando para um arquivo que ninguém escreveu à
      // mão é o tipo de pista que custa meia hora. Melhor dizer de onde ele sai.
      if (erro && erro.code === "MODULE_NOT_FOUND") {
        throw new Error(
          "servidor/motor-encaixe.js não existe. Ele é gerado por "
          + "`npm run motor`, que roda dentro de `npm run front`.");
      }
      throw erro;
    }

    /*
     * O WASM é o mesmo `estatico/encaixe.wasm` que o navegador baixa. Aqui os
     * bytes vêm do disco, porque fora do navegador não há `fetch` de caminho
     * relativo que resolva.
     *
     * Sem ele nada quebra: `encaixarContornoWasm` devolve null e a busca
     * segue em JavaScript, com o MESMO resultado — é isso que o
     * `npm run bancada:conferir` prova a cada corrida. O que muda é o tempo,
     * e o motor mede ~3x.
     */
    let comWasm = false;
    try {
      const bytes = fs.readFileSync(path.join(PASTA_DO_APP, "estatico", "encaixe.wasm"));
      comWasm = await motor.carregarMotorWasm(bytes);
    } catch (erro) {
      console.warn("encaixe/resolver: sem WASM, seguindo em JavaScript —", erro.message);
    }

    console.log(`encaixe/resolver: motor pronto (wasm: ${comWasm ? "sim" : "não"})`);
    return { motor, comWasm };
  })();

  // Falhou a carga? Não guarda a promessa quebrada, senão o servidor fica
  // repetindo o mesmo erro até reiniciar, mesmo depois de o arquivo aparecer.
  motorPrometido.catch(() => { motorPrometido = null; });

  return motorPrometido;
}

// ==================== O CONTORNO VIRA MÁSCARA ====================

/**
 * Rasteriza um polígono na grade, pelo centro de cada célula.
 *
 * Varredura por linha: onde a linha horizontal cruza cada aresta, com os
 * cruzamentos ordenados, dentro e fora se alternam — e a linha inteira sai
 * numa passada só.
 *
 * Os pontos chegam normalizados (0..1). É a mesma função de `bancada/pecas.js`;
 * o comentário de lá vale aqui, e as duas precisam continuar iguais — se um
 * dia divergirem, a bancada estará medindo um preparo que o Corel não usa.
 */
function rasterizar(poligono, cols, rows) {
  const bits = new Uint8Array(cols * rows);
  for (let linha = 0; linha < rows; linha++) {
    const y = (linha + 0.5) / rows;
    const cruzamentos = [];
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [xi, yi] = poligono[i];
      const [xj, yj] = poligono[j];
      if ((yi > y) === (yj > y)) continue;
      cruzamentos.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
    cruzamentos.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cruzamentos.length; k += 2) {
      const de = Math.max(0, Math.ceil(cruzamentos[k] * cols - 0.5));
      const ate = Math.min(cols - 1, Math.floor(cruzamentos[k + 1] * cols - 0.5));
      for (let c = de; c <= ate; c++) bits[linha * cols + c] = 1;
    }
  }
  return bits;
}

/**
 * Uma peça do pedido vira uma peça do motor.
 *
 * O contorno chega em centímetros, na medida real do desenho. Aqui ele é
 * medido, normalizado para 0..1 dentro da própria caixa e rasterizado.
 *
 * NORMALIZAR AQUI, E NÃO DO LADO DO COREL, é de propósito: quem escreve a
 * macro manda o que tem na mão (as coordenadas do desenho) e não precisa saber
 * de célula, de passo nem de como o motor representa peça. Todo o vocabulário
 * do motor fica deste lado.
 */
function prepararPeca(motor, peca, { passo, raio }) {
  const contornos = peca.contornos && peca.contornos.length
    ? peca.contornos
    : (peca.contorno ? [peca.contorno] : []);

  if (!contornos.length) {
    throw new Error(`peça "${peca.nome || "?"}" sem contorno`);
  }

  // A caixa da peça sai do próprio desenho, somando todos os pedaços: peça
  // com vazado ou com partes soltas é UMA peça, e a caixa é a de todos juntos.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  contornos.forEach((contorno) => {
    contorno.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  });

  const largura = maxX - minX;
  const altura = maxY - minY;
  if (!(largura > 0) || !(altura > 0)) {
    throw new Error(`peça "${peca.nome || "?"}" tem contorno degenerado (${largura} x ${altura} cm)`);
  }

  const { cols, rows } = motor.gradeDaPeca({ largura, altura }, passo);

  // Cada pedaço entra na mesma grade. Dois pedaços que se sobrepõem não
  // somam — a célula ou está ocupada ou não está.
  const bits = new Uint8Array(cols * rows);
  contornos.forEach((contorno) => {
    const normalizado = contorno.map(([x, y]) => [
      (x - minX) / largura,
      (y - minY) / altura,
    ]);
    const parte = rasterizar(normalizado, cols, rows);
    for (let i = 0; i < bits.length; i++) if (parte[i]) bits[i] = 1;
  });

  const mascaras = motor.mascarasDeSilhueta({ bits, modo: "alfa" }, cols, rows, passo, raio);

  return {
    nome: peca.nome || null,
    largura, altura,
    // De onde a peça veio no desenho. O motor ignora isto, e é justamente o
    // que o Corel precisa de volta para saber qual curva mover.
    origem: { minX, minY },
    giro: peca.giro || "180",
    qtd: Math.max(1, Math.round(peca.qtd || 1)),
    grupo: peca.grupo || null,
    mascaras,
    ocupacao: mascaras.ocupacao,
  };
}

/** Uma cópia por unidade pedida — a mesma expansão que a tela faz. */
function expandir(pecas) {
  const itens = [];
  pecas.forEach((peca, indice) => {
    for (let copia = 1; copia <= peca.qtd; copia++) {
      itens.push({
        indice, copia,
        nome: peca.nome, qtd: peca.qtd, giro: peca.giro,
        largura: peca.largura, altura: peca.altura,
        mascaras: peca.mascaras,
        grupo: peca.grupo,
      });
    }
  });
  return itens;
}

// ==================== A BUSCA ====================

/*
 * Quantas fatias do portfólio de receitas correm.
 *
 * Na tela é uma por núcleo, cada uma no seu worker. Aqui elas correm UMA
 * DEPOIS DA OUTRA, na mesma thread — exatamente como a bancada faz, e pelo
 * mesmo motivo: as fatias são independentes por construção (nenhuma vê o que a
 * outra achou), então o resultado é o mesmo e só o relógio muda.
 *
 * O preço é real: o tempo de parede vira `fatias × tempo`. Por isso o padrão
 * aqui é menor que o da tela — quem está esperando é uma macro, com o Corel
 * parado na frente da pessoa.
 *
 * Paralelizar isto de verdade é trabalho para `worker_threads`, e vale quando
 * houver uma medição dizendo que o tempo incomoda. Antes disso seria complicar
 * às cegas.
 */
const FATIAS_PADRAO = 4;
const TEMPO_PADRAO_MS = 2500;

/** As fatias uma a uma, ficando com a melhor. O `buscarMelhorEncaixeEmParalelo` desenrolado. */
async function buscar(motor, itens, pecas, config) {
  const { larguraTecido, espaco, comprimentoBancada, passo, fatias, tempoMs, meta, motores } = config;

  const alturaMax = itens.reduce(
    (soma, it) => soma + Math.max(it.largura, it.altura) + espaco, 0);
  const vetorTrabalho = motor.vetorDoTrabalho(pecas, larguraTecido);

  let campeao = null;
  let tentativas = 0;

  for (let k = 0; k < fatias; k++) {
    const resultado = await motor.buscarMelhorEncaixe(itens, {
      larguraTecido, espaco, comprimentoBancada,
      passo, alturaMax,
      motores: motor.motoresDaFatia(k, fatias, motores),
      // Sem histórico: ver "O QUE ISTO NÃO FAZ", no topo.
      memoria: null, alvo: null, rede: null, redeMadura: false,
      vetorTrabalho,
      metaAproveitamento: meta,
      tempoMaximoMs: tempoMs,
      msSemGanho: Math.max(800, tempoMs * 0.25),
      tentativasPorLote: itens.length >= 120 ? 1 : 8,
      fatia: motor.fatiaDoPortfolio(k, fatias, motores),
      // A primeira fatia varre exato; as outras pulam, e cobrem mais receita
      // no mesmo tempo. Mesma repartição da tela.
      saltoX: k === 0 ? 1 : 3,
      semente: 1 + k * 7919,
      ...motor.papelDaFatia(k, fatias).config,
    });

    tentativas += resultado.tentativas || 0;

    // Quem cabe inteiro ganha de quem gastou menos tecido deixando peça de
    // fora. Só entre encaixes que couberam é que o consumo decide.
    const melhor = !campeao
      || resultado.naoEncaixadas.length < campeao.naoEncaixadas.length
      || (resultado.naoEncaixadas.length === campeao.naoEncaixadas.length
          && resultado.consumo < campeao.consumo);
    if (melhor) campeao = resultado;
  }

  return { campeao, tentativas };
}

// ==================== A ROTA ====================

router.post("/resolver", async (req, res) => {
  const comecou = Date.now();
  const corpo = req.body || {};

  // ---- o pedido ----
  const larguraTecido = Number(corpo.larguraTecido);
  if (!(larguraTecido > 0)) {
    return res.status(400).json({ erro: "larguraTecido é obrigatória, em centímetros" });
  }

  const pecasPedidas = Array.isArray(corpo.pecas) ? corpo.pecas : [];
  if (!pecasPedidas.length) {
    return res.status(400).json({ erro: "nenhuma peça no pedido" });
  }

  const espaco = corpo.espaco != null ? Number(corpo.espaco) : 1;
  const comprimentoBancada = Number(corpo.comprimentoBancada) || 0;
  const fatias = Math.min(8, Math.max(1, Math.round(Number(corpo.fatias) || FATIAS_PADRAO)));
  const tempoMs = Math.min(60000, Math.max(200, Number(corpo.tempoMs) || TEMPO_PADRAO_MS));
  const meta = Number(corpo.metaAproveitamento) || 0;
  const motores = Array.isArray(corpo.motores) && corpo.motores.length
    ? corpo.motores : ["contorno", "retangulo"];

  try {
    const { motor, comWasm } = await carregarMotor();

    // O tamanho da célula e o engorde da folga saem da mesma conta que a tela
    // usa. Quem pede não escolhe passo: escolher errado degrada o encaixe sem
    // avisar, e a conta já existe.
    const { passo, raio, folgaReal } = motor.grade(larguraTecido, espaco);

    const pecas = pecasPedidas.map((p) => prepararPeca(motor, p, { passo, raio }));
    const itens = expandir(pecas);

    const { campeao, tentativas } = await buscar(motor, itens, pecas, {
      larguraTecido, espaco, comprimentoBancada, passo, fatias, tempoMs, meta, motores,
    });

    /*
     * A resposta fala em CENTÍMETROS, não em célula.
     *
     * `x` e `y` são o canto superior esquerdo da peça no tecido, e `rot` o
     * giro em graus. Para o Corel isso é direto: mover a curva de onde ela
     * está (`origem`) para onde ela vai.
     *
     * A máscara não volta. Ela é o pedaço mais pesado do resultado e não
     * serve para nada do lado de lá — quem desenha a peça é o Corel, com a
     * curva que ele já tem.
     */
    const posicoes = campeao.posicoes.map((p) => ({
      peca: p.item.indice,
      copia: p.item.copia,
      nome: p.item.nome,
      x: p.x, y: p.y,
      largura: p.largura, altura: p.altura,
      rot: p.rot, girado: !!p.girado,
      bancada: p.bancada || 0,
      origem: pecas[p.item.indice].origem,
    }));

    const areaReal = campeao.posicoes.reduce(
      (soma, p) => soma + (p.item.mascaras ? p.item.mascaras.areaReal : 0), 0);
    const areaTecido = larguraTecido * campeao.consumo;

    res.json({
      // O que interessa a quem pediu
      consumo: campeao.consumo,
      aproveitamento: areaTecido > 0 ? areaReal / areaTecido : 0,
      larguraTecido,
      posicoes,
      naoEncaixadas: campeao.naoEncaixadas.map((it) => ({
        peca: it.indice, copia: it.copia, nome: it.nome,
      })),
      // Como foi obtido — para conferir contra a bancada e para diagnosticar
      // "por que demorou" sem precisar instrumentar nada.
      comoFoi: {
        receita: campeao.receita,
        tentativas,
        fatias,
        tempoPedidoMs: tempoMs,
        decorridoMs: Date.now() - comecou,
        wasm: comWasm,
        passo, folgaReal,
        pecas: pecas.length,
        copias: itens.length,
      },
    });
  } catch (erro) {
    // Contorno degenerado e peça sem contorno são erro de quem pediu (400);
    // o resto é nosso (500). A mensagem vai inteira: quem chama isto é uma
    // macro sendo escrita, e mensagem vaga ali custa caro.
    const doPedido = /sem contorno|degenerado/.test(String(erro && erro.message));
    res.status(doPedido ? 400 : 500).json({ erro: String(erro && erro.message || erro) });
  }
});

module.exports = router;
