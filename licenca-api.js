/**
 * Rota de licença: a tela de ativação (`GET /licenca`, servida fora deste
 * router — ver server.js) e a API que ela chama. Fica de fora da trava de
 * acesso de propósito (senão ninguém conseguiria nunca ativar nada).
 */

const express = require("express");
const licenca = require("./licenca");

const router = express.Router();

router.get("/estado", (req, res) => {
  const estado = licenca.obterEstado();
  res.json(estado);
});

router.post("/ativar", (req, res) => {
  const { codigo } = req.body || {};
  const resultado = licenca.ativar(typeof codigo === "string" ? codigo.trim() : "");
  res.json(resultado);
});

module.exports = router;
