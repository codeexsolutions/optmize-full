// Normaliza texto pra comparação: sem acento e minúsculo. Assim
// "REPOSIÇÃO", "Reposição", "reposicao" e "reposiçao" (escrito errado)
// todos viram "reposicao" e batem na mesma busca.
function normalizeText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

module.exports = { normalizeText };
