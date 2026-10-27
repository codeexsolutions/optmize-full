/**
 * ===========================================================================
 * OS AJUSTES DO ÚLTIMO OPTMIZAR — para o próximo sair igual (2026-10-25)
 * ===========================================================================
 *
 * Largura da mídia, espaços, giro, comprimento da bancada e tempo: o modal do
 * Optmizar abria sempre nos padrões da tela, e cada serviço era redigitado —
 * ou, pior, saía com um espaço diferente do de ontem sem ninguém notar. Agora
 * o que foi confirmado no último Optmizar volta no próximo, e a produção fica
 * padronizada.
 *
 * EM ARQUIVO, E NÃO NO `localStorage`: a janela do programa abre em
 * `127.0.0.1` numa porta livre qualquer, diferente a cada abertura (ver
 * `porta_livre`, em main.rs), e o `localStorage` é separado por porta. Lá, o
 * ajuste sumiria ao fechar o programa. O arquivo mora em `config/`, e
 * atravessa aberturas e atualizações.
 *
 * É da MÁQUINA, e não da conta: a largura é a da impressora que está ali.
 */

const fs = require("node:fs");
const express = require("express");
const { arquivoDeConfig } = require("./caminhos");

const ARQUIVO = arquivoDeConfig("ajustes-encaixe.json");

const GIROS = new Set(["livre", "180", "fixa"]);
/** O lado do sentido único: 0 cima, 90 direita, 180 baixo, 270 esquerda. */
const SENTIDOS = new Set([0, 90, 180, 270]);

/** Número dentro da faixa, ou `null` — nunca um valor que a tela recusaria. */
function numero(valor, min, max) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Só passa o que a tela aceitaria. Arquivo editado à mão ou corrompido não
 * pode abrir o modal com uma largura de -3 cm.
 */
function limpar(cru) {
  const a = cru && typeof cru === "object" ? cru : {};
  const ajustes = {
    largura: numero(a.largura, 10, 10_000),
    espaco: numero(a.espaco, 0, 10),
    espacoY: numero(a.espacoY, 0, 10),
    giro: GIROS.has(String(a.giro)) ? String(a.giro) : null,
    sentido: SENTIDOS.has(a.sentido) ? a.sentido : null,
    // 0 é "sem limite", que é o campo vazio na tela.
    comprimento: numero(a.comprimento, 0, 1_000_000),
    // `null` quando a pessoa não mexeu: aí vale a sugestão pelo trabalho.
    tempo: numero(a.tempo, 1, 300),
  };
  return Object.fromEntries(Object.entries(ajustes).filter(([, v]) => v !== null));
}

function ler() {
  try {
    return limpar(JSON.parse(fs.readFileSync(ARQUIVO, "utf8")));
  } catch {
    return {}; // primeira vez, ou arquivo ruim: os padrões da tela valem
  }
}

const router = express.Router();

router.get("/ajustes", (_req, res) => res.json(ler()));

router.put("/ajustes", express.json({ limit: "4kb" }), (req, res) => {
  const ajustes = limpar(req.body);
  try {
    fs.writeFileSync(ARQUIVO, JSON.stringify(ajustes, null, 2));
  } catch (erro) {
    return res.status(500).json({ error: `Não deu para guardar os ajustes: ${erro.message}` });
  }
  res.json(ajustes);
});

module.exports = router;
module.exports.limpar = limpar;
