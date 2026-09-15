/**
 * ===========================================================================
 * A VOZ — a rota que o terminal chama para falar
 * ===========================================================================
 *
 * Uma rota só: manda texto, recebe amostras. Ver `voz.js` para o porquê de ser
 * PCM cru e de a voz ser a do Windows.
 */

const express = require("express");
const fs = require("fs");
const { sintetizar, metrosEmPalavras, TAXA, BITS, CANAIS } = require("./voz");

const router = express.Router();

/** Diz se este servidor sabe falar, e em que formato. */
router.get("/", (_req, res) => {
  res.json({ taxa: TAXA, bits: BITS, canais: CANAIS, formato: "pcm-cru" });
});

/**
 * O texto vira som.
 *
 * GET e não POST porque a resposta é uma FUNÇÃO DO TEXTO e de mais nada: a
 * mesma frase dá o mesmo som para sempre. Isso deixa o navegador, um proxy ou a
 * própria placa guardarem o resultado sem que ninguém precise combinar nada.
 */
router.get("/falar", async (req, res) => {
  const texto = String(req.query.texto || "");
  if (!texto.trim()) {
    return res.status(400).json({ error: "Nada para falar." });
  }

  try {
    const arquivo = await sintetizar(texto);
    const bytes = fs.statSync(arquivo).size;

    /*
     * `Content-Length` explícito porque a placa precisa dele: ela reserva o
     * buffer pelo tamanho anunciado em vez de crescer no meio do caminho.
     */
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", bytes);
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(arquivo).pipe(res);
  } catch (erro) {
    res.status(500).json({ error: erro.message });
  }
});

/**
 * A frase de um item de produção, montada aqui.
 *
 * MONTAR A FRASE É TRABALHO DO SERVIDOR, e não da placa. Mudar o que se fala --
 * incluir a máquina, tirar a metragem, dizer o cliente -- passa a ser uma linha
 * aqui em vez de uma regravação de cada terminal. É a mesma razão pela qual os
 * motivos de reprovação saíram do firmware.
 */
router.get("/producao", async (req, res) => {
  const { getPedidoItem } = require("./impressoras/db/pedidos");
  const item = getPedidoItem(String(req.query.item || ""));
  if (!item) {
    return res.status(404).json({ error: "Item não encontrado." });
  }

  /*
   * O NOME DO ARQUIVO SEM A EXTENSÃO e sem os hífens. "MORANGO DOCE - CROPPED
   * 03 - 90M 2X.prt" falado inteiro vira "ponto p r t" no fim e uma pausa em
   * cada traço -- som que não carrega informação nenhuma para quem está com o
   * tecido na mão.
   */
  const nome = String(item.task || "")
    .replace(/\.prt$/i, "")
    .replace(/\s*-\s*/g, ", ")
    .trim();

  const frase = `${nome}. ${metrosEmPalavras(item.printLength)}.`;

  try {
    const arquivo = await sintetizar(frase);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", fs.statSync(arquivo).size);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Frase", encodeURIComponent(frase));   // para depurar da serial
    fs.createReadStream(arquivo).pipe(res);
  } catch (erro) {
    res.status(500).json({ error: erro.message });
  }
});

module.exports = router;
