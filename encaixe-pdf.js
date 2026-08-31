/**
 * Gera o PDF do encaixe em tamanho real, para mandar direto para a impressora
 * ou para a mesa de corte.
 *
 * É uma página só, com exatamente a largura do tecido e o comprimento do
 * encaixe, em centímetros de verdade — imprimindo em escala 1:1, o que sai no
 * papel mede o que a peça mede. E vai só o desenho: nada de régua, nome de
 * peça ou rodapé, porque isso seria impresso junto no tecido.
 *
 * O rolo sai repartido em arquivos de alguns metros cada, e não num arquivo
 * único de onze metros. A razão é o RIP: rasterizar uma página de 11 m em
 * tamanho real ocupa memória proporcional ao tamanho da página, e um arquivo
 * só obriga a máquina a segurar tudo de uma vez antes de a primeira gota
 * cair. Repartido, o RIP processa um trecho enquanto imprime o anterior, e a
 * fila anda.
 *
 * Quem decide onde cortar é o `recorte` que chega do pedido. O cliente tenta
 * sempre cair num vão entre peças; quando o encaixe é denso e não há vão, o
 * corte passa na peça e ela sai recortada aqui — fim de um arquivo, começo do
 * seguinte —, para se reencontrar no rolo na hora de imprimir.
 *
 * Somando os trechos, o rolo é exatamente o mesmo: mesma metragem, mesmas
 * posições, nenhuma peça perdida nem repetida.
 *
 * Só que o PDF não aceita página com mais de 14400 pontos de lado (508 cm), e
 * um encaixe de 11 metros passa longe disso. A saída é o `/UserUnit`: ele diz
 * quanto vale uma unidade da página. Com `/UserUnit 2,58`, uma página de 5 m
 * "de arquivo" é lida como 12,9 m de verdade. Os números dentro do PDF ficam
 * dentro do limite, o tamanho real continua o mesmo, e o arquivo segue
 * conforme o formato — que é o que faz o RIP aceitar sem reclamar.
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

router.post("/pdf", (req, res) => {
  const { larguraTecido, consumo, imagens, posicoes, nome, recorte } = req.body || {};

  if (!(larguraTecido > 0) || !(consumo > 0) || !Array.isArray(posicoes) || posicoes.length === 0) {
    return res.status(400).json({ error: "Encaixe inválido para gerar o PDF." });
  }

  const guardadas = artesGuardadas.get(String(req.body.sessao || ""));
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

  /*
   * O trecho do rolo que este arquivo cobre, em cm. Sem `recorte`, é o rolo
   * inteiro — que é como os testes e qualquer chamada antiga continuam
   * funcionando.
   *
   * O corte cai sempre num vão entre peças (quem escolhe é o cliente, que tem
   * o encaixe na mão), então aqui basta pegar as peças que começam e terminam
   * dentro do trecho e descontar o `inicio` do Y de cada uma: a peça que no
   * rolo está a 12,40 m sai a 2,40 m no arquivo que começa em 10 m.
   */
  const inicio = Number(recorte && recorte.inicio) > 0 ? Number(recorte.inicio) : 0;
  const fim = Number(recorte && recorte.fim) > 0 ? Math.min(Number(recorte.fim), consumo) : consumo;
  const alturaCm = fim - inicio;

  if (!(alturaCm > 0)) {
    return res.status(400).json({ error: "Trecho de rolo inválido para gerar o PDF." });
  }

  const larguraPt = larguraTecido * PT_POR_CM;
  const alturaPt = alturaCm * PT_POR_CM;

  // Só entra em ação quando precisa: encaixe que já cabe no limite sai com
  // UserUnit 1, que é o caso de maior compatibilidade.
  const maiorLado = Math.max(larguraPt, alturaPt);
  const unidade = maiorLado <= LIMITE_PT
    ? 1
    : Math.ceil((maiorLado / LIMITE_PT) * 100) / 100;

  const tamanho = [larguraPt / unidade, alturaPt / unidade];

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nome || "encaixe"}.pdf"`);

  const doc = new PDFDocument({ size: tamanho, margin: 0 });
  doc.pipe(res);

  if (unidade !== 1) doc.page.dictionary.data.UserUnit = unidade;

  // Cada arte entra no arquivo UMA vez e depois é só reaproveitada em cada
  // posição. Passando o buffer direto, o pdfkit embutiria a mesma imagem cem
  // vezes: o PDF fica enorme e leva quase dez segundos para montar.
  const desenhos = new Map();
  buffers.forEach((buffer, chave) => {
    try {
      desenhos.set(chave, doc.openImage(buffer));
    } catch (err) {
      // arte ilegível: as outras continuam
    }
  });

  const FOLGA = 1e-6;
  posicoes.forEach((pos) => {
    const desenho = desenhos.get(pos.chave);
    if (!desenho) return;

    // Fora do trecho: nem encosta.
    if (pos.y + pos.altura <= inicio + FOLGA || pos.y >= fim - FOLGA) return;

    // Em cima da linha do corte: entra recortada. O desenho continua na
    // posição real (Y negativo, ou passando do fim da página) e o recorte no
    // tamanho da página é que decide o que aparece — assim o pedaço daqui e o
    // pedaço do arquivo seguinte se completam no rolo, sem sobra nem falta.
    const atravessa = pos.y < inicio - FOLGA || pos.y + pos.altura > fim + FOLGA;
    if (atravessa) {
      doc.save();
      doc.rect(0, 0, larguraPt / unidade, alturaPt / unidade).clip();
    }

    try {
      doc.image(desenho, (pos.x * PT_POR_CM) / unidade, ((pos.y - inicio) * PT_POR_CM) / unidade, {
        width: (pos.largura * PT_POR_CM) / unidade,
        height: (pos.altura * PT_POR_CM) / unidade,
      });
    } catch (err) {
      // uma imagem ruim não pode derrubar o PDF inteiro
    }

    if (atravessa) doc.restore();
  });

  doc.end();

  // As artes ficam guardadas enquanto vierem mais partes do mesmo rolo —
  // apagá-las na primeira obrigaria o navegador a subir tudo de novo a cada
  // trecho. Quem avisa que acabou é o cliente, na última parte.
  if (!req.body.manterSessao) {
    artesGuardadas.delete(String(req.body.sessao || ""));
  }
});

module.exports = router;
