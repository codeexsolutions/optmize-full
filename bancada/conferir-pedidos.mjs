/*
 * BANCADA — juntar pedidos
 *
 *     npm run bancada:pedidos
 *
 * Dois pedidos no mesmo rolo: o motor não pode enxergar o pedido (o encaixe
 * tem de sair igual), e a sigla impressa tem de cair inteira dentro da peça —
 * sigla cortada pela tesoura é peça que ninguém sabe de quem é.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import stream from "node:stream";
import sharp from "sharp";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const sigla = await carregarModulo("src/motores/siglaDoPedido.js");
const {
  normalizarSigla, siglaDaPeca, textoDaSigla, larguraDoTextoCm, lugarDaSigla,
  ALTURA_DA_LETRA_CM, RECUO_DA_SIGLA_CM,
} = sigla;

let casos = 0;
const caso = (nome, fn) => { fn(); casos++; console.log(`  ok  ${nome}`); };

// ---------- 1. A sigla da peça, nos nomes reais da produção ----------
caso("sigla da peça pelos nomes da produção", () => {
  const nomes = {
    "COSTAS_Camisa JOGO (Dry Tech) BRANCA Tam G =": "COG",
    "MANGA C1_Camisa Polo (Dry Tech) VINHO - Tam 3G =": "MA3G",
    "LATERAL 1_Short JOGO (Dry Tech) BRANCA Tam GG =": "LAGG",
    "FRETE 2_Short JOGO (Dry Tech) BRANCA Tam M =": "FRM",
    "FRENTE_Camisa Polo Tamanho P": "FRP",
    "Manga curta G": "MAG",
    "M1": "M1",
    "36   4x": "36",
    "windbanner auto escola": "WI",
    "ção_ÉPICA": "CA",
  };
  for (const [nome, esperado] of Object.entries(nomes)) {
    assert.equal(siglaDaPeca(nome), esperado, nome);
  }
});

caso("normalizar tira acento, espaço e o que não é letra ou número", () => {
  assert.equal(normalizarSigla("joão-2 ç"), "JOAO2C");
  assert.equal(normalizarSigla("abcdefghij"), "ABCDEF");
  assert.equal(normalizarSigla("  "), "");
});

caso("texto da sigla: pedido, peça e cópia só com mais de uma", () => {
  assert.equal(textoDaSigla({ pedido: "P2", nome: "COSTAS Tam G", qtd: 5, copia: 3 }), "P2 COG3");
  assert.equal(textoDaSigla({ pedido: "P2", nome: "COSTAS Tam G", qtd: 1, copia: 1 }), "P2 COG");
  assert.equal(textoDaSigla({ pedido: "joao", sigla: "xy", nome: "COSTAS", qtd: 2, copia: 2 }), "JOAO XY2");
  // Sem pedido gravado, a peça é do P1.
  assert.equal(textoDaSigla({ nome: "COSTAS", qtd: 1, copia: 1 }), "P1 CO");
});

caso("largura do texto pela fonte, sem NaN em caractere estranho", () => {
  // P667 2:556 espaço278 C722 O778 G778 3:556 = 4335 milésimos do corpo;
  // corpo = 0,4 / 0,688.
  const esperado = 4.335 * (0.4 / 0.688);
  assert.ok(Math.abs(larguraDoTextoCm("P2 COG3") - esperado) < 1e-9);
  const estranho = larguraDoTextoCm("Ç-a");
  assert.ok(Number.isFinite(estranho) && estranho > 0);
});

// ---------- 2. O lugar da sigla dentro da silhueta ----------
const PASSO = 0.2;
/** Uma posição de mentira com a máscara `desenho` dada por uma função (c, r) → 0/1. */
function posicao(cols, rows, cheio, extra = {}) {
  const desenho = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) desenho[r * cols + c] = cheio(c, r) ? 1 : 0;
  return {
    x: 10, y: 20, largura: cols * PASSO, altura: rows * PASSO, passo: PASSO,
    mascara: { cols, rows, desenho, offX: 0, offY: 0, recuo: 0 },
    ...extra,
  };
}
/** O retângulo do texto (com o recuo) cai inteiro em células cheias? */
function dentro(p, lugar) {
  const m = p.mascara;
  const x0 = lugar.x - RECUO_DA_SIGLA_CM - (p.x + m.offX - m.recuo);
  const y0 = lugar.y - RECUO_DA_SIGLA_CM - (p.y + m.offY - m.recuo);
  const x1 = x0 + lugar.largura + 2 * RECUO_DA_SIGLA_CM;
  const y1 = y0 + lugar.altura + 2 * RECUO_DA_SIGLA_CM;
  for (let r = Math.floor(y0 / p.passo + 1e-9); r < Math.ceil(y1 / p.passo - 1e-9); r++) {
    for (let c = Math.floor(x0 / p.passo + 1e-9); c < Math.ceil(x1 / p.passo - 1e-9); c++) {
      if (r < 0 || c < 0 || r >= m.rows || c >= m.cols || !m.desenho[r * m.cols + c]) return false;
    }
  }
  return true;
}

caso("retângulo cheio: canto de baixo à esquerda, com o recuo e uma célula", () => {
  const p = posicao(100, 50, () => true); // 20 x 10 cm
  const lugar = lugarDaSigla(p, "P2 COG3");
  assert.ok(lugar);
  // A célula da borda pode ser só um pouco peça: o recuo conta a partir da
  // célula seguinte.
  assert.ok(Math.abs(lugar.x - (10 + RECUO_DA_SIGLA_CM + PASSO)) < 1e-9, `x ${lugar.x}`);
  // Embaixo: a base da caixa fica a recuo + uma célula + o que sobra da célula do fundo.
  assert.ok(lugar.y + lugar.altura <= 30 - RECUO_DA_SIGLA_CM - PASSO + 1e-9);
  assert.ok(lugar.y + lugar.altura >= 30 - RECUO_DA_SIGLA_CM - 2 * PASSO - 1e-9);
  assert.equal(lugar.altura, ALTURA_DA_LETRA_CM);
  assert.ok(dentro(p, lugar));
});

caso("canto de baixo cortado: a sigla anda para a direita na mesma linha", () => {
  // Abaixo da linha 30 o canto esquerdo some em diagonal.
  const p = posicao(100, 50, (c, r) => r <= 30 || c >= (r - 30) * 2);
  const lugar = lugarDaSigla(p, "P2 COG3");
  assert.ok(lugar && dentro(p, lugar));
  assert.ok(lugar.x > 10 + RECUO_DA_SIGLA_CM, "saiu do canto cortado");
  assert.ok(lugar.y + lugar.altura >= 30 - RECUO_DA_SIGLA_CM - 2 * PASSO - 1e-9, "ficou embaixo");
});

caso("pé estreito: a sigla sobe até caber", () => {
  // As 10 linhas de baixo têm só 8 células (1,6 cm): o texto não cabe ali.
  const p = posicao(100, 50, (c, r) => r < 40 || c < 8);
  const lugar = lugarDaSigla(p, "P2 COG3");
  assert.ok(lugar && dentro(p, lugar));
  assert.ok(lugar.y + lugar.altura <= 20 + 40 * PASSO, "subiu acima do pé");
});

caso("tira estreita demais: sem sigla", () => {
  const p = posicao(10, 300, () => true); // 2 cm de largura
  assert.equal(lugarDaSigla(p, "P2 LAGG3"), null);
});

caso("sem máscara (encaixe por caixa): usa a caixa da peça", () => {
  const p = { x: 5, y: 7, largura: 30, altura: 40, passo: PASSO };
  const lugar = lugarDaSigla(p, "P1 CO");
  assert.ok(lugar);
  assert.ok(Math.abs(lugar.x - (5 + RECUO_DA_SIGLA_CM)) < 1e-9);
  assert.ok(Math.abs(lugar.y + lugar.altura - (47 - RECUO_DA_SIGLA_CM)) < 1e-9);
});

const mascaraMod = await carregarModulo("src/motores/encaixeMascara.js");
{
  // Uma camiseta (ombro cortado, decote): 56 x 70 cm, como em bancada/pecas.js.
  const { gradeDaPeca, rasterizarPoligono, mascarasDeSilhueta } = mascaraMod;
  const medida = { largura: 56, altura: 70 };
  const { cols, rows } = gradeDaPeca(medida, PASSO);
  const ex = medida.largura / (cols * PASSO);
  const ey = medida.altura / (rows * PASSO);
  const poligono = [[0.02, 0.06], [0.33, 0.02], [0.5, 0.2], [0.67, 0.02], [0.98, 0.06],
    [0.86, 0.34], [0.92, 1], [0.08, 1], [0.14, 0.34]];
  const bits = rasterizarPoligono(poligono.map(([x, y]) => [x * ex, y * ey]), cols, rows);
  const mascaras = mascarasDeSilhueta({ bits, modo: "alfa" }, cols, rows, PASSO, 1, medida);
  caso("as quatro rotações de uma camiseta: sempre dentro", () => {
    for (const rot of [0, 90, 180, 270]) {
      const m = mascaras.rotacoes[rot];
      const deitada = rot === 90 || rot === 270;
      const p = {
        x: 3, y: 11, passo: PASSO, mascara: m,
        largura: deitada ? 70 : 56, altura: deitada ? 56 : 70,
      };
      const lugar = lugarDaSigla(p, "P2 COG3");
      assert.ok(lugar, `rot ${rot}: achou lugar`);
      assert.ok(dentro(p, lugar), `rot ${rot}: dentro da silhueta`);
    }
  });
}

{
  // A grade arredonda para cima e a rasterização marca toda célula que o
  // contorno toca: a última célula pode ser quase toda vazia. A conferência
  // aqui é contra a ARTE de verdade, não contra as células.
  const { gradeDaPeca, rasterizarPoligono, mascarasDeSilhueta } = mascaraMod;
  /**
   * Uma peça de `grade` (cm) com a arte retangular `arte` = { x0, y0, x1, y1 }
   * (cm, a partir do canto da grade), posta em (3, 11) sem giro.
   */
  function pecaComArte(grade, arte, passo, raio) {
    const { cols, rows } = gradeDaPeca(grade, passo);
    const W = cols * passo, H = rows * passo;
    const poligono = [[arte.x0, arte.y0], [arte.x1, arte.y0], [arte.x1, arte.y1], [arte.x0, arte.y1]]
      .map(([x, y]) => [x / W, y / H]);
    const bits = rasterizarPoligono(poligono, cols, rows);
    const m = mascarasDeSilhueta({ bits, modo: "alfa" }, cols, rows, passo, raio, grade).rotacoes[0];
    return { x: 3, y: 11, passo, mascara: m, largura: grade.largura, altura: grade.altura };
  }
  const naArte = (p, arte, lugar) => {
    const folga = RECUO_DA_SIGLA_CM - 1e-9;
    return lugar.x - folga >= p.x + arte.x0 && lugar.x + lugar.largura + folga <= p.x + arte.x1
      && lugar.y - folga >= p.y + arte.y0 && lugar.y + lugar.altura + folga <= p.y + arte.y1;
  };
  caso("arte que não é múltiplo do passo: o recuo de 3 mm é dentro da arte", () => {
    const arte = { x0: 0, y0: 0, x1: 20.15, y1: 10.05 };
    for (const raio of [0, 2]) {
      const p = pecaComArte({ largura: 20.15, altura: 10.05 }, arte, PASSO, raio);
      const lugar = lugarDaSigla(p, "P2 COG3");
      assert.ok(lugar, `raio ${raio}: achou lugar`);
      assert.ok(naArte(p, arte, lugar), `raio ${raio}: ${JSON.stringify(lugar)}`);
    }
  });
  caso("passo maior que o recuo (0,59, folga 0): o texto e o recuo ficam na arte", () => {
    const casos = [
      // Arte de 20,15 x 30,15 cm: a grade vai até 20,65 x 30,68.
      { grade: { largura: 20.15, altura: 30.15 }, arte: { x0: 0, y0: 0, x1: 20.15, y1: 30.15 } },
      // A mesma arte solta no meio da grade: a borda cai no meio da célula dos quatro lados.
      { grade: { largura: 21, altura: 31 }, arte: { x0: 0.35, y0: 0.4, x1: 20.5, y1: 30.55 } },
    ];
    for (const { grade, arte } of casos) {
      for (const raio of [0, 2]) {
        const p = pecaComArte(grade, arte, 0.59, raio);
        const lugar = lugarDaSigla(p, "P2 COG3");
        assert.ok(lugar, `raio ${raio}: achou lugar`);
        assert.ok(naArte(p, arte, lugar), `grade ${grade.largura}, raio ${raio}: ${JSON.stringify(lugar)}`);
      }
    }
  });
}

// ---------- 3. Os pedidos da lista ----------
const pedidos = await carregarModulo("src/producao/pedidos.js");
const {
  pedidoDe, pedidosDaLista, temVariosPedidos, ultimoPedido, proximoPedido,
  marcarLote, renomearPedido, corDoPedido, marcasDoRisco, marcaParaOPdf, pedidosDaReposicao,
} = pedidos;

caso("pedidos da lista: P1 por padrão, próximo livre, último lote", () => {
  const lista = [{ nome: "a" }, { nome: "b", pedido: "P1" }];
  assert.equal(pedidoDe(lista[0]), "P1");
  assert.deepEqual(pedidosDaLista(lista), ["P1"]);
  assert.equal(temVariosPedidos(lista), false);
  assert.equal(proximoPedido(lista), "P2");
  lista.push({ nome: "c", pedido: "P3" });
  assert.equal(proximoPedido(lista), "P2");
  assert.equal(ultimoPedido(lista), "P3");
  assert.equal(ultimoPedido([]), "P1");
  assert.equal(temVariosPedidos(lista), true);
});

caso("marcar lote só preenche quem não tem pedido", () => {
  const lista = [{ pedido: "P1" }, {}, { pedido: "JOAO" }, {}];
  marcarLote(lista, 1, "P2");
  assert.deepEqual(lista.map(pedidoDe), ["P1", "P2", "JOAO", "P2"]);
});

caso("reposição na lista vazia: o pedido guardado vale, e quem não tem é P1", () => {
  const entrando = [{ pedido: "p3" }, {}, { pedido: "JOAO" }, { pedido: " - " }];
  assert.deepEqual(pedidosDaReposicao([], entrando, "P1"), ["P3", "P1", "JOAO", "P1"]);
});

caso("reposição, mesmo pedido: todas ficam no escolhido, por cima do guardado", () => {
  const lista = [{ pedido: "P1" }, { pedido: "P2" }];
  const entrando = [{ pedido: "P1" }, { pedido: "P7" }, {}];
  assert.deepEqual(pedidosDaReposicao(lista, entrando, "P2"), ["P2", "P2", "P2"]);
});

caso("reposição, novo pedido: cada guardado diferente vira um Pn que a lista não usa", () => {
  const lista = [{ pedido: "P1" }, { pedido: "P3" }];
  // pedidoDoLote devolveu P2 (o primeiro livre).
  const entrando = [{ pedido: "P1" }, { pedido: "JOAO" }, { pedido: "p1" }, {}, { pedido: "P2" }];
  const r = pedidosDaReposicao(lista, entrando, "P2");
  assert.deepEqual(r, ["P2", "P4", "P2", "P2", "P5"]);
  // Nenhum deles junta com um pedido que já está na lista.
  for (const p of r) assert.ok(!pedidosDaLista(lista).includes(p), p);
});

caso("reposição desistida: nada entra", () => {
  assert.equal(pedidosDaReposicao([{ pedido: "P1" }], [{ pedido: "P1" }], null), null);
});

caso("mandarProjeto pergunta o pedido antes de mexer na largura, na folga e no giro", () => {
  const codigo = fs.readFileSync(path.join(RAIZ, "src", "producao", "controlador.js"), "utf8");
  const funcao = codigo.indexOf("async mandarProjeto(");
  const pergunta = codigo.indexOf("await pedidosDoProjeto(", funcao);
  const desistiu = codigo.indexOf("if (!pedidos) return;", funcao);
  const ajuste = codigo.indexOf("escrever(encaixeLarguraInput", funcao);
  assert.ok(funcao >= 0 && pergunta > funcao && desistiu > pergunta && ajuste > desistiu,
    "a pergunta e a desistência vêm antes do primeiro ajuste");
  assert.ok(codigo.indexOf("mandarProjetoParaOEncaixe(nome, pecas, unidades, pedidos)", funcao) > ajuste);
  // E a função que põe as peças na lista não pergunta de novo.
  const entrada = codigo.slice(codigo.indexOf("async function mandarProjetoParaOEncaixe("),
    codigo.indexOf("function juntasNaLeitura("));
  assert.ok(!entrada.includes("pedidoDoLote("), "mandarProjetoParaOEncaixe não pergunta");
});

caso("renomear: normaliza, junta com aviso, recusa vazio", () => {
  const lista = [{ pedido: "P1" }, { pedido: "P2" }, { pedido: "P2" }];
  assert.deepEqual(renomearPedido(lista, "P2", "joão silva"), { ok: true, pedido: "JOAOSI", juntou: false });
  assert.deepEqual(lista.map(pedidoDe), ["P1", "JOAOSI", "JOAOSI"]);
  assert.deepEqual(renomearPedido(lista, "JOAOSI", "p1"), { ok: true, pedido: "P1", juntou: true });
  assert.deepEqual(pedidosDaLista(lista), ["P1"]);
  assert.deepEqual(renomearPedido(lista, "P1", " - "), { ok: false });
});

caso("a cor do pedido sai do nome", () => {
  assert.equal(corDoPedido("P2"), corDoPedido("P2"));
  assert.match(corDoPedido("P2"), /^#[0-9a-f]{6}$/i);
  assert.notEqual(corDoPedido("P1"), corDoPedido("P2"));
});

caso("marcas do risco: nada com um pedido; pedido de AGORA, não o do item", () => {
  const pecas = [
    { nome: "COSTAS Tam G", qtd: 2, pedido: "P1" },
    { nome: "LATERAL Tam M", qtd: 1, pedido: "P1" },
  ];
  const pos = (indice, copia, x) => ({
    item: { ...pecas[indice], indice, copia }, x, y: 0, largura: 30, altura: 40, passo: 0.2,
  });
  const r = { posicoes: [pos(0, 1, 0), pos(0, 2, 40), pos(1, 1, 80)] };
  assert.equal(marcasDoRisco(r, pecas), null);

  // Renomeado depois do encaixe: o item ainda diz P1, a lista diz P2.
  pecas[1].pedido = "P2";
  const visao = marcasDoRisco(r, pecas);
  assert.deepEqual(visao.pedidos, ["P1", "P1", "P2"]);
  assert.deepEqual(visao.marcas.map((m) => m.texto), ["P1 COG1", "P1 COG2", "P2 LAM"]);
  assert.deepEqual(visao.legenda.map((l) => [l.pedido, l.quantas]), [["P1", 2], ["P2", 1]]);
  assert.deepEqual(visao.semSigla, []);

  // Peça estreita demais: entra em semSigla com nome e cópia.
  pecas.push({ nome: "VIVO", qtd: 3, pedido: "P2" });
  r.posicoes.push({ item: { ...pecas[2], indice: 2, copia: 2 }, x: 0, y: 50, largura: 1, altura: 60, passo: 0.2 });
  const outra = marcasDoRisco(r, pecas);
  assert.equal(outra.marcas[3], null);
  assert.deepEqual(outra.semSigla, ["VIVO 2"]);
});

caso("peça renomeada depois do encaixe: a sigla é a do nome novo, a mesma da gaveta", () => {
  const pecas = [
    { nome: "COSTAS Tam G", qtd: 2, pedido: "P1" },
    { nome: "LATERAL Tam M", qtd: 1, pedido: "P2" },
  ];
  const pos = (indice, copia, x) => ({
    item: { ...pecas[indice], indice, copia }, x, y: 0, largura: 30, altura: 40, passo: 0.2,
  });
  const r = { posicoes: [pos(0, 1, 0), pos(0, 2, 40), pos(1, 1, 80)] };
  // Renomeada na lista; os itens do risco ainda dizem "COSTAS Tam G".
  pecas[0].nome = "FRENTE Tam GG";
  const visao = marcasDoRisco(r, pecas);
  assert.equal(siglaDaPeca(pecas[0].nome), "FRGG");
  assert.deepEqual(visao.marcas.map((m) => m.texto), ["P1 FRGG1", "P1 FRGG2", "P2 LAM"]);
});

caso("a gaveta e o desenho guardam a visão pelo nome da peça também", () => {
  const codigo = fs.readFileSync(path.join(RAIZ, "src", "producao", "controlador.js"), "utf8");
  const funcao = codigo.indexOf("function visaoDosPedidos(");
  const linha = codigo.slice(codigo.indexOf("const chave = ", funcao)).split("\n")[0];
  assert.ok(funcao >= 0);
  assert.match(linha, /\bp\.nome\b/, "o nome da peça tem de estar na chave da visão");
});

caso("a marca desce com a bancada, e sem marca não vai nada", () => {
  const marca = { texto: "P2 COG3", x: 12.3, y: 1054.3, largura: 2.5, altura: 0.4 };
  assert.deepEqual(marcaParaOPdf(marca, 1000), { texto: "P2 COG3", x: 12.3, y: 54.3, alturaCm: 0.4 });
  assert.equal(marcaParaOPdf(null, 0), undefined);
});

caso("o PDF manda a marca de cada peça (a linha está no daPeca da exportação)", () => {
  const codigo = fs.readFileSync(path.join(RAIZ, "src", "producao", "controlador.js"), "utf8");
  const usos = [...codigo.matchAll(/marcaParaOPdf\(/g)].map((m) => m.index);
  assert.equal(usos.length, 1, "marcaParaOPdf( deve aparecer uma vez só");
  const funcao = codigo.indexOf("function baixarEncaixeEmPdf(");
  const daPeca = codigo.indexOf("const daPeca = ", funcao);
  const primeiroPdf = codigo.indexOf("encaixeApi.pdf(", funcao);
  assert.ok(funcao >= 0 && daPeca > funcao && primeiroPdf > daPeca);
  assert.ok(usos[0] > daPeca && usos[0] < primeiroPdf, "a marca tem de estar no daPeca da exportação");
});

// ---------- 4. O motor não enxerga o pedido ----------
const { PARA_A_BANCADA } = require("../empacotar/modulos-do-motor");
caso("nenhum módulo do motor lê o pedido ou a sigla da peça", () => {
  for (const modulo of PARA_A_BANCADA) {
    const codigo = fs.readFileSync(path.join(RAIZ, "src", modulo), "utf8");
    const achado = codigo.match(/\b\w+\.(?:pedido|sigla)\b/);
    assert.equal(achado, null, `${modulo} lê "${achado && achado[0]}"`);
  }
});

const { carregarMotor } = require("./motor");
const motor = await carregarMotor({ comWasm: false });
caso("pedido não desliga o sparrow (não é grupo)", () => {
  const itens = [{ pedido: "P1", mascaras: { rotacoes: { 0: {} } } }, { pedido: "P2", mascaras: { rotacoes: { 0: {} } } }];
  assert.equal(motor.motivoDoTrabalho(itens, { comprimentoBancada: 0 }), null);
  assert.equal(motor.motivoDoTrabalho([{ ...itens[0], grupo: "A" }], { comprimentoBancada: 0 }), "grupos marcados");
});

// ---------- 5. O PDF escreve a sigla, e só quando ela veio ----------
const { montarPdf } = require("../servidor/encaixe-pdf");
async function pdfDe(posicoes) {
  const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: "#3366cc" } }).png().toBuffer();
  const destino = new stream.PassThrough();
  const pedacos = [];
  destino.on("data", (b) => pedacos.push(b));
  const fim = new Promise((ok, erro) => { destino.on("end", ok); destino.on("error", erro); });
  const relatorio = await montarPdf({
    larguraTecido: 100, consumo: 60, posicoes, buffers: new Map([["0-0", png]]),
  }, destino);
  await fim;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(pedacos)) }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const conteudo = await (await doc.getPage(i)).getTextContent();
    texto += conteudo.items.map((it) => it.str).join(" ");
  }
  return { texto, relatorio };
}
const peca = (x, marca) => ({ chave: "0-0", x, y: 5, largura: 40, altura: 50, bancada: 0, marca });
{
  const com = await pdfDe([
    peca(2, { texto: "P1 CO1", x: 2.3, y: 54.3, alturaCm: 0.4 }),
    peca(50, { texto: "P2 LAM", x: 50.3, y: 54.3, alturaCm: 0.4 }),
  ]);
  const sem = await pdfDe([peca(2), peca(50)]);
  caso("o PDF com marcas traz o texto de cada uma", () => {
    assert.match(com.texto, /P1 CO1/);
    assert.match(com.texto, /P2 LAM/);
    assert.equal(com.relatorio.marcas, 2);
  });
  caso("o PDF sem marca não traz texto nenhum", () => {
    assert.equal(sem.texto.trim(), "");
    assert.equal(sem.relatorio.marcas, 0);
  });
}


// ---------- 6. A sigla não sai pela metade: fonte, balanço do PDF e limpeza ----------
{
  const { marcaLimpa } = require("../servidor/encaixe-pdf");
  const zlib = require("node:zlib");
  await assert.rejects(
    () => montarPdf({
      larguraTecido: 100, consumo: 60, buffers: new Map(),
      posicoes: [peca(2, { texto: "P1", x: 2, y: 54, alturaCm: 0.4 })],
      fonteDaSigla: path.join(RAIZ, "estatico", "fontes", "nao-existe.ttf"),
    }, new stream.PassThrough()),
    /fonte da sigla/,
  );
  {
    const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: "#3366cc" } }).png().toBuffer();
    const destino = new stream.PassThrough();
    const pedacos = [];
    destino.on("data", (b) => pedacos.push(b));
    const fim = new Promise((ok) => destino.on("end", ok));
    await montarPdf({
      larguraTecido: 100, consumo: 60, buffers: new Map([["0-0", png]]),
      posicoes: [peca(2, { texto: "P1 CO1", x: 2.3, y: 54.3, alturaCm: 0.4 }), peca(50, { texto: "P2 LAM", x: 50.3, y: 54.3, alturaCm: 0.4 })],
    }, destino);
    await fim;
    const bruto = Buffer.concat(pedacos);
    let conteudo = "";
    let i = 0;
    while ((i = bruto.indexOf("stream\n", i)) >= 0) {
      const ini = i + 7;
      const f = bruto.indexOf("endstream", ini);
      try { conteudo += zlib.inflateSync(bruto.subarray(ini, f)).toString("latin1") + "\n"; } catch { /* imagem ou fonte */ }
      i = f + 9;
    }
    const q = (conteudo.match(/^q$/gm) || []).length;
    const Q = (conteudo.match(/^Q$/gm) || []).length;
    caso("q e Q em equilíbrio, e nenhum BT aberto", () => {
      assert.ok(q > 0, "achou o conteúdo da página");
      assert.equal(q, Q);
      assert.equal((conteudo.match(/^BT$/gm) || []).length, (conteudo.match(/^ET$/gm) || []).length);
    });
  }
  caso("marcaLimpa: o que presta passa, o que não presta cai", () => {
    const ok = { texto: "p2 cog3", x: 3, y: 10, alturaCm: 0.5 };
    assert.deepEqual(marcaLimpa(ok, 100, 60), { texto: "P2 COG3", x: 3, y: 10, alturaCm: 0.5 });
    assert.equal(marcaLimpa({ ...ok, texto: "joão" }, 100, 60).texto, "JOAO");
    assert.equal(marcaLimpa({ ...ok, x: NaN }, 100, 60), undefined);
    assert.equal(marcaLimpa({ ...ok, x: null }, 100, 60), undefined);
    assert.equal(marcaLimpa({ ...ok, y: "" }, 100, 60), undefined);
    assert.equal(marcaLimpa({ ...ok, x: 1e300 }, 100, 60), undefined);
    assert.equal(marcaLimpa({ ...ok, y: 61 }, 100, 60), undefined);
    assert.equal(marcaLimpa({ ...ok, alturaCm: 5 }, 100, 60), undefined);
    assert.equal(marcaLimpa({ ...ok, texto: "!!!" }, 100, 60), undefined);
    assert.deepEqual(marcaLimpa({ ...ok, x: "3" }, 100, 60).x, 3);
    // Pedido de 6, sigla de 6 e a cópia 1000: o número da cópia não pode ser cortado.
    assert.equal(marcaLimpa({ ...ok, texto: "JOAOSI COSTAS1000" }, 100, 60).texto, "JOAOSI COSTAS1000");
    assert.equal(marcaLimpa({ ...ok, texto: "A".repeat(30) }, 100, 60).texto.length, 20);
  });
}

// ---------- 6. O tempo sugerido ----------
const tempo = await carregarModulo("src/producao/tempoSugerido.js");
caso("tempo: peça pequena fica no teto de sempre; peça grande sobe", () => {
  const { tempoSugerido, TEMPO_MIN_S, TEMPO_MAX_S, TEMPO_MAX_PECA_GRANDE_S } = tempo;
  assert.equal(tempoSugerido([]), TEMPO_MIN_S);
  assert.equal(tempoSugerido([{ qtd: 5, largura: 12, altura: 20 }]), TEMPO_MIN_S);
  assert.equal(tempoSugerido([{ qtd: 300, largura: 12, altura: 60 }]), TEMPO_MAX_S);
  assert.equal(tempoSugerido([{ qtd: 300, largura: 60, altura: 90 }]), TEMPO_MAX_PECA_GRANDE_S);
  // A área real da silhueta vale mais que a caixa: arte em prancheta 100 x 100
  // com uma tira dentro é tira.
  assert.equal(tempoSugerido([{ qtd: 300, largura: 100, altura: 100, _cacheMascaras: { areaReal: 700 } }]), TEMPO_MAX_S);
  // Camisas misturadas com tiras ainda é rolo de peça grande (spec, seção 6):
  // média (195·5400 + 200·240) / 395 ≈ 2787 cm².
  assert.equal(tempoSugerido([
    { qtd: 195, largura: 60, altura: 90 }, { qtd: 200, largura: 12, altura: 20 },
  ]), TEMPO_MAX_PECA_GRANDE_S);
});

console.log(`\nbancada:pedidos — ${casos} casos ok`);
