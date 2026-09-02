/**
 * ===========================================================================
 * A ROTA DA CONVERSÃO DE COR
 * ===========================================================================
 *
 * A tela manda o arquivo como veio; o servidor devolve o que achou nele e um
 * endereço para buscar o convertido. O arquivo não volta dentro do JSON porque
 * em base64 custaria um terço a mais.
 *
 * As duas miniaturas de comparação são desenhadas NA TELA, não aqui — ver o
 * cabeçalho de public/cor.js para o porquê.
 *
 * Por que no servidor, e não no navegador
 * ---------------------------------------
 * Ler o CMYK de dentro de um JPEG exige um decodificador próprio: o navegador
 * não entrega esses quatro canais para ninguém — ele já devolve a conversão
 * dele, que é justamente a que queremos substituir. E a travessia do perfil de
 * um arquivo de 50 megapixels leva segundos, que na aba travariam a tela.
 *
 * O que fica guardado é só o arquivo convertido, na memória, até a tela buscar
 * ou o espaço acabar. Nada vai para o disco e nada sobrevive a um restart: é
 * uma etapa de passagem, não um arquivo do cliente.
 */

const crypto = require("crypto");
const express = require("express");
const { converterParaSrgb } = require("./cor-icc");

const router = express.Router();

/*
 * O guarda-volumes dos convertidos.
 *
 * Um trabalho desta loja tem 25 artes, e uma arte convertida dá uns 4 MB — bem
 * dentro do teto. O teto existe para o caso de alguém deixar a tela aberta a
 * semana inteira: sem ele, cada conversão ficaria na memória do servidor para
 * sempre. Quando enche, o mais antigo sai primeiro, que é o que a tela já
 * mandou para o encaixe.
 */
const TETO_GUARDADO = 600 * 1024 * 1024;
const guardados = new Map();
let guardadoAgora = 0;

function guardar(bytes, nome) {
  const id = crypto.randomBytes(12).toString("hex");
  guardados.set(id, { bytes, nome, quando: Date.now() });
  guardadoAgora += bytes.length;
  for (const [velho, item] of guardados) {
    if (guardadoAgora <= TETO_GUARDADO) break;
    guardados.delete(velho);
    guardadoAgora -= item.bytes.length;
  }
  return id;
}

/**
 * Converte uma arte para sRGB.
 *
 * O corpo é o arquivo cru; o nome vem no cabeçalho, porque um nome com acento
 * ou barra não atravessa a URL inteiro. O limite é folgado de propósito: as
 * artes desta loja passam de 15 MB com frequência.
 */
router.post(
  "/converter",
  express.raw({ type: "*/*", limit: "300mb" }),
  (req, res) => {
    const nome = decodeURIComponent(req.get("X-Nome-Do-Arquivo") || "arte.jpg");
    if (!req.body || !req.body.length) {
      return res.status(400).json({ erro: "O arquivo veio vazio." });
    }

    let resultado;
    try {
      resultado = converterParaSrgb(req.body);
    } catch (erro) {
      console.error("[cor] falhou ao converter", nome, erro);
      return res.status(500).json({
        erro: `Não deu para ler "${nome}": ${erro.message}`,
      });
    }

    if (!resultado.convertido) {
      return res.json({ nome, convertido: false, motivo: resultado.motivo, perfil: resultado.perfil || null });
    }

    const nomeNovo = nome.replace(/\.(jpe?g|png|tiff?)$/i, "") + " (sRGB).jpg";
    res.json({
      nome,
      nomeNovo,
      convertido: true,
      perfil: resultado.perfil,
      espaco: resultado.espaco,
      largura: resultado.largura,
      altura: resultado.altura,
      cores: resultado.cores,
      tamanho: resultado.arquivo.length,
      id: guardar(resultado.arquivo, nomeNovo),
    });
  },
);

/** Entrega o arquivo já convertido, uma vez só — depois ele sai da memória. */
router.get("/arquivo/:id", (req, res) => {
  const item = guardados.get(req.params.id);
  if (!item) return res.status(404).json({ erro: "Esta conversão não está mais guardada." });
  guardados.delete(req.params.id);
  guardadoAgora -= item.bytes.length;
  res.type("image/jpeg");
  res.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(item.nome)}`);
  res.send(item.bytes);
});

module.exports = router;
