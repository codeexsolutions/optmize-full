/**
 * ===========================================================================
 * A FILA DO EXTRATOR — um trabalho pesado de cada vez
 * ===========================================================================
 *
 * A ampliação (Real-ESRGAN) e o preenchimento (LaMa) usam os mesmos seis
 * núcleos: dois ao mesmo tempo só dividiriam a máquina. Os dois entram nesta
 * fila, que roda um de cada vez, guarda o andamento para a tela perguntar, e
 * entrega o PNG quando fica pronto.
 *
 * As travas (da revisão final do Extrator):
 *
 *   - no máximo `MAXIMO_ESPERANDO` (4) trabalhos na fila, contando todos os
 *     que ainda não foram entregues: esperando a vez, rodando, ou prontos
 *     esperando ser buscados (o PNG pronto fica na memória). O quinto recebe
 *     `fila-cheia` (429): a API escuta a rede da gráfica inteira, e uma fila
 *     sem fim (ou PNGs que ninguém busca) deixaria qualquer um encher a memória
 *     do servidor;
 *   - o trabalho que ninguém buscar em 30 minutos é cancelado e some, esteja
 *     ele esperando, rodando ou pronto.
 */

const crypto = require("crypto");

const MAXIMO_ESPERANDO = 4;
const VALIDADE_MS = 30 * 60 * 1000;

function criarFila({ maximoEsperando = MAXIMO_ESPERANDO, validadeMs = VALIDADE_MS, agora = Date.now } = {}) {
  /** id → { estado: "esperando"|"rodando"|"pronto"|"falhou", feitos, total, png, erro, cancelado, criado } */
  const trabalhos = new Map();
  let fila = Promise.resolve();

  function varrer() {
    const t = agora();
    for (const [id, w] of trabalhos) {
      if (t - w.criado > validadeMs) {
        w.cancelado = true;
        trabalhos.delete(id);
      }
    }
  }

  /**
   * Põe um trabalho na fila. `rodar(w)` recebe o registro (para `w.feitos`,
   * `w.total` e `w.cancelado`) e devolve o PNG. Estoura com `codigo:
   * "fila-cheia"` quando já há trabalhos demais na fila: todo trabalho ainda
   * não entregue conta (esperando a vez ou esperando ser buscado).
   */
  function colocar(total, rodar) {
    varrer();
    if (trabalhos.size >= maximoEsperando) {
      throw Object.assign(new Error("Já há trabalhos demais na fila; espere um terminar."), { codigo: "fila-cheia", status: 429 });
    }
    const id = crypto.randomUUID();
    const w = { estado: "esperando", feitos: 0, total, png: null, erro: null, cancelado: false, criado: agora() };
    trabalhos.set(id, w);
    fila = fila
      .then(async () => {
        if (w.cancelado) return;
        w.estado = "rodando";
        const png = await rodar(w);
        if (!w.cancelado) {
          w.png = png;
          w.estado = "pronto";
        }
      })
      .catch((erro) => {
        w.erro = erro.message;
        w.estado = "falhou";
      });
    return { id, total };
  }

  /** O trabalho, ou `null` se ele não existe mais (venceu, foi cancelado ou já foi entregue). */
  function ver(id) {
    varrer();
    return trabalhos.get(id) || null;
  }

  /** Tira da fila depois de entregar o PNG ou o erro. */
  function entregue(id) {
    trabalhos.delete(id);
  }

  function cancelar(id) {
    const w = trabalhos.get(id);
    if (w) {
      w.cancelado = true;
      trabalhos.delete(id);
    }
  }

  /** Para a bancada: espera a fila esvaziar. */
  const vazia = () => fila;

  return { colocar, ver, entregue, cancelar, varrer, vazia, tamanho: () => trabalhos.size };
}

/**
 * As rotas de acompanhar um trabalho, iguais para a ampliação e o
 * preenchimento: GET devolve o andamento ou o PNG; DELETE cancela. `textos`
 * leva as duas frases de falha, que mudam de gênero ("Essa ampliação",
 * "Esse preenchimento").
 */
function rotasDeAcompanhar(router, caminho, fila, textos) {
  router.get(`${caminho}/:id`, (req, res) => {
    const w = fila.ver(req.params.id);
    if (!w) return res.status(404).json({ error: textos.sumiu, codigo: null });
    if (w.estado === "falhou") {
      fila.entregue(req.params.id);
      return res.status(500).json({ error: `${textos.falhou}: ${w.erro}`, codigo: null });
    }
    if (w.estado !== "pronto") return res.json({ feitos: w.feitos, total: w.total });
    fila.entregue(req.params.id);
    res.setHeader("Content-Type", "image/png");
    res.send(w.png);
  });
  router.delete(`${caminho}/:id`, (req, res) => {
    fila.cancelar(req.params.id);
    res.json({ ok: true });
  });
}

module.exports = { MAXIMO_ESPERANDO, VALIDADE_MS, criarFila, rotasDeAcompanhar };
