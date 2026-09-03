/**
 * Gera o PDF do encaixe em tamanho real, para mandar direto para a impressora
 * ou para a mesa de corte.
 *
 * É **um arquivo só**, com exatamente a largura do tecido e o comprimento do
 * encaixe, em centímetros de verdade — imprimindo em escala 1:1, o que sai no
 * papel mede o que a peça mede. E vai só o desenho: nada de régua, nome de peça
 * ou rodapé, porque isso seria impresso junto no tecido.
 *
 * Uma página por bancada
 * ----------------------
 * O rolo já saiu repartido em trechos de 10 m, e a repartição foi tirada
 * inteira em a1b7c6d. O defeito não era repartir: era **onde** o corte caía.
 * Ele procurava um vão entre as peças, e encaixe bom é exatamente o que não
 * deixa vão — num rolo denso as peças se encavalam de ponta a ponta, e o corte
 * acabava passando por cima de uma peça, metade num pedaço e metade no outro.
 * Peça partida é peça perdida.
 *
 * Agora o corte não procura nada. Quando o trabalho tem bancada, o próprio
 * encaixe é feito com a trava de que **nenhuma peça cruza a linha** (ver o
 * cabeçalho da BANCADA em public/encaixe-motor.js): a página nasce de um lugar
 * onde peça nenhuma pode estar. Sem bancada, continua tudo como antes — uma
 * página só, do começo ao fim do rolo.
 *
 * O arquivo continua único nos dois casos. Repartir em vários arquivos exigia
 * que eles entrassem na máquina colados, sem um milímetro de folga entre um e
 * outro, e na prática isso não acontece; páginas do mesmo arquivo não têm esse
 * problema, e ainda dão ao RIP o que ele queria — rasterizar um pedaço de cada
 * vez em vez de segurar 11 metros antes da primeira gota cair.
 *
 * O teto de página
 * ----------------
 * O PDF não aceita página com mais de 14400 pontos de lado (508 cm), e um
 * encaixe de 11 metros passa longe disso. A saída é o `/UserUnit`: ele diz
 * quanto vale uma unidade da página. Com `/UserUnit 2,58`, uma página de 5 m
 * "de arquivo" é lida como 12,9 m de verdade. Os números dentro do PDF ficam
 * dentro do limite, o tamanho real continua o mesmo, e o arquivo segue conforme
 * o formato — que é o que faz o RIP aceitar sem reclamar.
 *
 * **`/UserUnit` é recurso do PDF 1.6**, e o pdfkit escreve `%PDF-1.3` por
 * padrão. Um leitor que respeite a versão declarada tem todo o direito de
 * ignorar o `/UserUnit` — e aí o rolo sai impresso na escala errada, sem erro
 * nenhum, que é o pior jeito de descobrir. Por isso o documento nasce 1.6
 * quando o `/UserUnit` entra em ação, e continua 1.3 (o de maior
 * compatibilidade) quando não precisa dele.
 */

const express = require("express");
const PDFDocument = require("pdfkit");

const router = express.Router();

/**
 * As artes chegam antes, uma a uma, em binário puro, e ficam guardadas aqui até
 * o PDF ser montado.
 *
 * Antes elas vinham dentro do JSON, em base64. Não dá: base64 engorda o dado em
 * um terço, e o servidor ainda precisa segurar tudo como texto na memória — um
 * encaixe com arte de verdade estourava o limite e derrubava o download. Em
 * binário o dado vai do tamanho que tem.
 */
const artesGuardadas = new Map();
const VALIDADE_MS = 10 * 60 * 1000;

function limparAntigas() {
  const agora = Date.now();
  artesGuardadas.forEach((sessao, chave) => {
    if (agora - sessao.criadaEm > VALIDADE_MS) artesGuardadas.delete(chave);
  });
}

/** Recebe uma arte já pronta, em binário. */
router.post("/arte", express.raw({ limit: "400mb", type: () => true }), (req, res) => {
  limparAntigas();
  const sessao = String(req.query.sessao || "");
  const chave = String(req.query.chave || "");
  if (!sessao || !chave || !req.body || !req.body.length) {
    return res.status(400).json({ error: "Faltou identificar a arte." });
  }

  let guardadas = artesGuardadas.get(sessao);
  if (!guardadas) {
    guardadas = { criadaEm: Date.now(), artes: new Map() };
    artesGuardadas.set(sessao, guardadas);
  }
  guardadas.artes.set(chave, Buffer.from(req.body));
  res.json({ ok: true, bytes: req.body.length });
});

const PT_POR_CM = 72 / 2.54; // 1 ponto = 1/72 de polegada
const LIMITE_PT = 14400; // 200 polegadas: o maior lado que o PDF aceita numa página

function bufferDaImagem(dataUrl) {
  const virgula = String(dataUrl || "").indexOf(",");
  if (virgula < 0) return null;
  return Buffer.from(dataUrl.slice(virgula + 1), "base64");
}

/**
 * Quanto vale uma unidade da página.
 *
 * 1 enquanto o rolo couber no teto do formato — é o caso de maior
 * compatibilidade, e a maioria dos encaixes cai nele. Passando do teto, o
 * `/UserUnit` cresce só o necessário, arredondado para cima em duas casas para
 * a página sobrar um tiquinho em vez de faltar.
 */
function unidadeDaPagina(larguraPt, alturaPt) {
  const maiorLado = Math.max(larguraPt, alturaPt);
  if (maiorLado <= LIMITE_PT) return 1;
  return Math.ceil((maiorLado / LIMITE_PT) * 100) / 100;
}

/**
 * Reparte as posições em páginas: uma por bancada.
 *
 * Quem diz a que bancada uma peça pertence é o motor, que carimba o número em
 * cada posição (ver o cabeçalho da BANCADA em public/encaixe-motor.js). Aqui
 * não se decide nada — só se agrupa. É essa divisão de responsabilidade que
 * torna impossível o defeito que tirou a repartição daqui em a1b7c6d: o corte
 * não procura mais um lugar bom entre as peças, ele já vem escolhido de onde as
 * peças foram postas, e peça nenhuma pode estar em cima dele.
 *
 * Cada página é cortada no que a bancada realmente ocupa, do topo da primeira
 * arte ao pé da última. Sem bancada nenhuma é o caso de sempre: uma página só,
 * com o consumo inteiro do rolo, inclusive o tecido que sobra depois da última
 * peça.
 */
function paginasDoEncaixe(posicoes, consumo) {
  const porBancada = new Map();
  posicoes.forEach((pos) => {
    const numero = Number(pos.bancada) || 0;
    let pagina = porBancada.get(numero);
    if (!pagina) {
      pagina = { numero, topo: Infinity, fundo: -Infinity, posicoes: [] };
      porBancada.set(numero, pagina);
    }
    pagina.topo = Math.min(pagina.topo, pos.y);
    pagina.fundo = Math.max(pagina.fundo, pos.y + pos.altura);
    pagina.posicoes.push(pos);
  });

  const paginas = [...porBancada.values()].sort((a, b) => a.numero - b.numero);
  if (paginas.length <= 1) return [{ numero: 0, topo: 0, fundo: consumo, posicoes }];
  return paginas;
}

/**
 * Monta o documento e devolve ele já escrevendo em `destino`.
 *
 * Está separado da rota para a bancada conseguir gerar um PDF sem subir o
 * Express (ver `bancada/conferir-pdf.js`): o que precisa ser conferido é o
 * documento — uma página por bancada, o tamanho real certo, a versão do
 * formato certa e toda peça desenhada —, e nada disso é assunto de HTTP.
 *
 * O `/UserUnit` é UM para o documento inteiro, calculado pela maior página.
 * Podia ser um por página (o campo é do dicionário da página), e não é de
 * propósito: uma escala por página é uma chance a mais de duas páginas do mesmo
 * rolo saírem em tamanhos diferentes por causa de um arredondamento, e esse
 * erro só aparece com o tecido já impresso.
 */
function montarPdf({ larguraTecido, consumo, posicoes, buffers }, destino) {
  const paginas = paginasDoEncaixe(posicoes, consumo);
  const larguraPt = larguraTecido * PT_POR_CM;
  const maiorAlturaPt = Math.max(...paginas.map((p) => (p.fundo - p.topo) * PT_POR_CM));
  const unidade = unidadeDaPagina(larguraPt, maiorAlturaPt);
  const tamanhoDa = (pagina) => [larguraPt / unidade, ((pagina.fundo - pagina.topo) * PT_POR_CM) / unidade];

  const doc = new PDFDocument({
    size: tamanhoDa(paginas[0]),
    margin: 0,
    // Ver o cabeçalho do arquivo: o `/UserUnit` é do PDF 1.6, e declarar 1.3
    // dá ao leitor o direito de ignorá-lo e imprimir fora de escala.
    pdfVersion: unidade === 1 ? "1.3" : "1.6",
  });
  doc.pipe(destino);

  // Cada arte entra no arquivo UMA vez e depois é só reaproveitada em cada
  // posição. Passando o buffer direto, o pdfkit embutiria a mesma imagem cem
  // vezes: o PDF fica enorme e leva quase dez segundos para montar.
  const desenhos = new Map();
  buffers.forEach((buffer, chave) => {
    try {
      desenhos.set(chave, doc.openImage(buffer));
    } catch (err) {
      // arte ilegível: as outras continuam
      console.warn(`[encaixe-pdf] arte ilegível (${chave}):`, err && err.message);
    }
  });

  let desenhadas = 0;
  paginas.forEach((pagina, i) => {
    if (i > 0) doc.addPage({ size: tamanhoDa(pagina), margin: 0 });
    if (unidade !== 1) doc.page.dictionary.data.UserUnit = unidade;

    pagina.posicoes.forEach((pos) => {
      const desenho = desenhos.get(pos.chave);
      if (!desenho) return;
      try {
        // O `y` da peça é medido no rolo inteiro; na página ele conta a partir
        // do começo da bancada.
        doc.image(desenho, (pos.x * PT_POR_CM) / unidade,
          ((pos.y - pagina.topo) * PT_POR_CM) / unidade, {
            width: (pos.largura * PT_POR_CM) / unidade,
            height: (pos.altura * PT_POR_CM) / unidade,
          });
        desenhadas++;
      } catch (err) {
        // uma imagem ruim não pode derrubar o PDF inteiro
        console.warn(`[encaixe-pdf] não deu para desenhar a peça ${pos.chave}:`, err && err.message);
      }
    });
  });

  doc.end();
  return {
    unidade,
    desenhadas,
    paginaPt: tamanhoDa(paginas[0]),
    paginas: paginas.map((p) => ({
      numero: p.numero,
      comprimento: p.fundo - p.topo,
      pecas: p.posicoes.length,
      paginaPt: tamanhoDa(p),
    })),
  };
}

router.post("/pdf", (req, res) => {
  const { larguraTecido, consumo, imagens, posicoes, nome } = req.body || {};

  if (!(larguraTecido > 0) || !(consumo > 0) || !Array.isArray(posicoes) || posicoes.length === 0) {
    return res.status(400).json({ error: "Encaixe inválido para gerar o PDF." });
  }

  const sessao = String(req.body.sessao || "");
  const guardadas = artesGuardadas.get(sessao);
  const buffers = new Map();
  (imagens || []).forEach((img) => {
    // A arte pode ter vindo antes em binário (o caminho normal) ou junto no
    // próprio pedido, que é o jeito curto usado pelos testes.
    const buffer = img.src ? bufferDaImagem(img.src) : (guardadas && guardadas.artes.get(img.chave));
    if (buffer) buffers.set(img.chave, buffer);
  });
  if (buffers.size === 0) {
    return res.status(400).json({ error: "Nenhuma imagem de peça chegou para o PDF." });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nome || "encaixe"}.pdf"`);

  montarPdf({ larguraTecido, consumo, posicoes, buffers }, res);

  // O rolo sai num arquivo só (com uma página por bancada), então este pedido é
  // o último: as artes desta sessão já cumpriram o que tinham para cumprir.
  artesGuardadas.delete(sessao);
});

module.exports = router;
// A montagem do documento sai junto com o roteador para a bancada conseguir
// conferir o PDF sem subir o Express (ver `bancada/conferir-pdf.js`).
module.exports.montarPdf = montarPdf;
module.exports.paginasDoEncaixe = paginasDoEncaixe;
module.exports.unidadeDaPagina = unidadeDaPagina;
module.exports.PT_POR_CM = PT_POR_CM;
module.exports.LIMITE_PT = LIMITE_PT;
