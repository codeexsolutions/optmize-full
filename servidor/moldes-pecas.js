/**
 * A peça de molde como o servidor aceita guardar — conferida e limpa.
 *
 * Saiu de `moldes-api.js` para poder ser testada sem abrir o banco
 * (`bancada/conferir-moldes-pecas.cjs`): lá, o `require("./db")` abre o
 * dados.db de verdade no primeiro `require`.
 *
 * `nos` e `marcacoes` são da tela de Montagem. A peça que chega sem eles (o
 * passo a passo antigo, um DXF) continua sem, e é só polígono como sempre foi.
 */

/** Papéis conhecidos. "outro" aceita qualquer nome escrito à mão. */
const PAPEIS = [
  "frente", "costas", "manga direita", "manga esquerda", "manga",
  "gola", "punho", "cós", "bolso", "vista", "forro", "outro",
];

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function lerPonto(p) {
  const x = numero(p && p.x);
  const y = numero(p && p.y);
  return x === null || y === null ? null : { x, y };
}

function lerNos(brutos) {
  if (!Array.isArray(brutos) || brutos.length < 3) return null;
  const nos = [];
  for (const n of brutos) {
    const centro = lerPonto(n);
    if (!centro) return null;
    nos.push({
      ...centro,
      entrada: lerPonto(n.entrada) || centro,
      saida: lerPonto(n.saida) || centro,
      canto: !!n.canto,
      retaDepois: !!n.retaDepois,
    });
  }
  return nos;
}

function lerMarcacoes(bruta, totalDeNos) {
  if (!bruta || typeof bruta !== "object") return null;
  const fio = bruta.fio || {};
  return {
    margem: Math.max(0, Math.min(10, numero(bruta.margem) || 0)),
    espelhar: !!bruta.espelhar,
    fio: {
      x: numero(fio.x) || 0,
      y: numero(fio.y) || 0,
      angulo: numero(fio.angulo) || 0,
      comprimento: Math.max(0, numero(fio.comprimento) || 0),
    },
    piques: (Array.isArray(bruta.piques) ? bruta.piques : [])
      .map((p) => ({ no: Math.floor(numero(p && p.no) ?? -1), t: numero(p && p.t), profundidade: numero(p && p.profundidade) }))
      .filter((p) => p.no >= 0 && p.no < totalDeNos && p.t !== null && p.t >= 0 && p.t <= 1
        && p.profundidade > 0 && p.profundidade <= 5),
    pontos: (Array.isArray(bruta.pontos) ? bruta.pontos : []).map(lerPonto).filter(Boolean),
  };
}

/** Confere e limpa uma peça que chegou da tela. `null` quando não tem contorno. */
function arrumarPeca(bruta, ordem) {
  const contorno = Array.isArray(bruta && bruta.contorno) ? bruta.contorno : null;
  if (!contorno || contorno.length < 3) return null;

  const pontos = contorno.map(lerPonto).filter(Boolean);
  if (pontos.length < 3) return null;

  const furos = (Array.isArray(bruta.furos) ? bruta.furos : [])
    .map((f) => (Array.isArray(f) ? f.map((p) => ({ x: Number(p.x), y: Number(p.y) })) : []))
    .filter((f) => f.length >= 3);

  const nos = lerNos(bruta.nos);
  const marcacoes = nos ? lerMarcacoes(bruta.marcacoes, nos.length) : null;

  const papel = String(bruta.papel || "outro").trim().toLowerCase();
  return {
    tamanho: String(bruta.tamanho || "único").trim() || "único",
    papel: papel || "outro",
    nome: String(bruta.nome || "").trim() || null,
    quantidade: Math.max(1, Math.floor(Number(bruta.quantidade) || 1)),
    largura: Number(bruta.largura) || 0,
    altura: Number(bruta.altura) || 0,
    contorno: JSON.stringify(pontos),
    furos: furos.length > 0 ? JSON.stringify(furos) : null,
    origem: String(bruta.origem || "").trim() || null,
    nos: nos ? JSON.stringify(nos) : null,
    marcacoes: marcacoes ? JSON.stringify(marcacoes) : null,
    ordem,
  };
}

function lerSituacao(valor) {
  return valor === "rascunho" || valor === "pronto" ? valor : null;
}

/** A linha de `molde_pecas` como a tela a recebe. */
function pecaDoBanco(linha) {
  return {
    ...linha,
    contorno: JSON.parse(linha.contorno),
    furos: linha.furos ? JSON.parse(linha.furos) : [],
    nos: linha.nos ? JSON.parse(linha.nos) : null,
    marcacoes: linha.marcacoes ? JSON.parse(linha.marcacoes) : null,
  };
}

module.exports = { PAPEIS, arrumarPeca, lerSituacao, pecaDoBanco };
