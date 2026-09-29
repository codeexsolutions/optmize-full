/**
 * ===========================================================================
 * A MEMÓRIA COLETIVA DO ENCAIXE — do lado do programa
 * ===========================================================================
 *
 * Cada Optmize aprende sozinho qual receita de encaixe ganha em cada tipo de
 * trabalho (ver `encaixe-memoria.js`). Sozinha, uma loja leva meses para a
 * rede ficar madura. Aqui ela passa a aprender com TODAS:
 *
 *   - MANDA os encaixes que fez para o backend, em lote, pela fila de
 *     `encaixe_historico.coletivo_enviado_em`. Sem internet, a fila espera;
 *   - BAIXA a rede global e o placar geral a cada sincronização, e o placar de
 *     cada tipo de trabalho quando a busca pede, com cache.
 *
 * O QUE SAI DAQUI SÃO SÓ NÚMEROS — os mesmos que o `encaixe_historico` já
 * guardava: a assinatura dos formatos (baldes arredondados), a largura do
 * tecido, quantas peças, o consumo, o aproveitamento, a receita vencedora, o
 * vetor do trabalho e o placar das receitas. Nenhuma arte, nenhum arquivo,
 * nenhum nome de peça ou de cliente. A instalação vai como um código sorteado
 * aqui (`instalacao`), que só serve para o backend não contar duas vezes o
 * mesmo encaixe.
 *
 * É O SEGREDO DO MOTOR, E FICA EM SILÊNCIO: nenhuma tela mostra, liga ou
 * desliga isto. Todo encaixe vai, e a rede global volta — o programa cuida
 * sozinho, e para quem usa o Encaixe só fica melhor.
 *
 * NADA AQUI É CAMINHO CRÍTICO: sem internet, sem login, ou com o backend fora,
 * a busca segue com a memória local, como sempre foi. A espera pela internet
 * tem teto curto (`ESPERA_MS`) — encaixe não pode ficar parado por isso.
 */

const crypto = require("crypto");
const db = require("./db");
const rede = require("../src/motores/encaixeRede.mjs");
const { pedirComToken } = require("./sessao");

/** Quanto a busca espera o placar coletivo antes de seguir sem ele. */
const ESPERA_MS = 1500;
/** O placar de um tipo de trabalho vale por isto antes de ser relido. */
const CACHE_PLACAR_MS = 12 * 60 * 60 * 1000;
/** De quanto em quanto sincroniza sozinho. */
const INTERVALO_MS = 3 * 60 * 60 * 1000;
const LOTE = 50;
const LOTES_POR_VEZ = 20;

const agora = () => new Date().toISOString();

// ==================== O ESTADO GUARDADO ====================

function lerEstado(chave) {
  const linha = db.prepare("SELECT valor FROM encaixe_coletivo_estado WHERE chave = ?").get(chave);
  if (!linha) return null;
  try { return JSON.parse(linha.valor); } catch { return null; }
}

function gravarEstado(chave, valor) {
  db.prepare(`
    INSERT INTO encaixe_coletivo_estado (chave, valor, atualizado_em) VALUES (?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em
  `).run(chave, JSON.stringify(valor), agora());
}

/** Um código sorteado uma vez por instalação. Não diz nada sobre ela. */
function instalacao() {
  let id = lerEstado("instalacao");
  if (!id) {
    id = crypto.randomUUID();
    gravarEstado("instalacao", id);
  }
  return id;
}

// ==================== A CONVERSA COM O BACKEND ====================

/** Pedido com teto de tempo. `null` quando não há sessão, rede ou resposta boa. */
async function pedir(rota, opcoes = {}, teto = 15000) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), teto);
  try {
    const resposta = await pedirComToken(rota, { ...opcoes, signal: controle.signal });
    if (!resposta || !resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

/** Uma linha do histórico, como o backend a recebe (`domain/coletivo.ts` de lá). */
function comoContribuicao(linha, id) {
  let features, placar;
  try {
    features = JSON.parse(linha.features);
    placar = JSON.parse(linha.placar);
  } catch {
    return null;
  }
  return {
    id: `${id}:${linha.id}`,
    versaoFeatures: linha.features_versao,
    dimEntrada: rede.REDE_DIM_ENTRADA,
    assinatura: linha.assinatura,
    larguraTecido: linha.largura_tecido,
    pecas: linha.pecas,
    consumo: linha.consumo,
    aproveitamento: linha.aproveitamento,
    receita: linha.receita,
    tentativas: linha.tentativas,
    features,
    placar: (Array.isArray(placar) ? placar : []).map((p) => ({
      receita: p.receita,
      tentativas: p.tentativas,
      vitorias: p.vitorias,
      melhorConsumo: p.melhorConsumo,
    })),
  };
}

/** Manda a fila, em lotes. Para no primeiro lote que não passar. */
async function enviarFila() {
  const id = instalacao();
  const marcar = db.prepare("UPDATE encaixe_historico SET coletivo_enviado_em = ? WHERE id = ?");
  let enviados = 0;
  for (let lote = 0; lote < LOTES_POR_VEZ; lote++) {
    // Só a versão de agora: vetor de outro significado não ensina nada lá.
    const linhas = db.prepare(`
      SELECT * FROM encaixe_historico
       WHERE coletivo_enviado_em IS NULL AND features IS NOT NULL AND placar IS NOT NULL
         AND features_versao = ?
       ORDER BY id LIMIT ?
    `).all(rede.REDE_VERSAO_FEATURES, LOTE);
    if (linhas.length === 0) break;

    const contribuicoes = linhas.map((l) => comoContribuicao(l, id)).filter(Boolean);
    const resposta = contribuicoes.length > 0
      ? await pedir("/encaixe/coletivo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contribuicoes }),
        })
      : { entraram: 0 };
    if (!resposta) break; // sem rede ou sem login: a fila espera a próxima

    // Marcadas TODAS as do lote, inclusive as que o backend descartou na
    // conferência: mandar de novo daria o mesmo descarte, para sempre.
    const quando = agora();
    db.transaction(() => linhas.forEach((l) => marcar.run(quando, l.id)))();
    enviados += linhas.length;
  }
  return enviados;
}

/** Baixa a rede global e o placar geral. */
async function baixarOAprendido() {
  const [global, geral] = await Promise.all([
    pedir("/encaixe/coletivo/rede"),
    pedir("/encaixe/coletivo/geral"),
  ]);
  if (global) gravarEstado("rede", global);
  if (geral && Array.isArray(geral.receitas)) gravarEstado("geral", geral.receitas);
  return Boolean(global);
}

let sincronizando = null;

/** Uma rodada: manda o que falta e baixa o aprendido. */
function sincronizar() {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      const enviados = await enviarFila();
      const baixou = await baixarOAprendido();
      if (baixou || enviados > 0) gravarEstado("ultima", { quando: agora(), enviados });
      return { enviados, baixou };
    } catch (erro) {
      console.warn("[coletivo] a sincronização falhou:", erro && erro.message);
      return { enviados: 0, baixou: false };
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}

let agendada = null;
/** Sincroniza daqui a pouco, juntando pedidos seguidos num só. */
function agendar(ms = 15000) {
  if (agendada) return;
  agendada = setTimeout(() => { agendada = null; void sincronizar(); }, ms);
  agendada.unref?.();
}

let relogio = null;
/** Liga a sincronização sozinha: logo depois de subir, e depois de tempo em tempo. */
function iniciar() {
  if (relogio) return;
  agendar(20000);
  relogio = setInterval(() => void sincronizar(), INTERVALO_MS);
  relogio.unref?.();
}

// ==================== O QUE A BUSCA USA ====================

/**
 * O placar de todas as lojas para um tipo de trabalho.
 *
 * Do cache quando está fresco; senão pergunta ao backend com teto curto, e na
 * falta de resposta devolve o cache velho — velho é melhor que nada, e nada é
 * o que a busca tinha antes disto existir.
 */
async function placarDe(assinatura) {
  if (!assinatura) return null;
  const guardado = db.prepare("SELECT * FROM encaixe_coletivo_cache WHERE assinatura = ?").get(assinatura);
  const fresco = guardado && Date.now() - Date.parse(guardado.lido_em) < CACHE_PLACAR_MS;
  const doCache = () => {
    if (!guardado) return null;
    try { return { receitas: JSON.parse(guardado.receitas), encaixes: guardado.encaixes }; } catch { return null; }
  };
  if (fresco) return doCache();

  const resposta = await pedir(`/encaixe/coletivo/placar?assinatura=${encodeURIComponent(assinatura)}`, {}, ESPERA_MS);
  if (!resposta || !Array.isArray(resposta.receitas)) return doCache();
  db.prepare(`
    INSERT INTO encaixe_coletivo_cache (assinatura, receitas, encaixes, lido_em) VALUES (?, ?, ?, ?)
    ON CONFLICT(assinatura) DO UPDATE SET
      receitas = excluded.receitas, encaixes = excluded.encaixes, lido_em = excluded.lido_em
  `).run(assinatura, JSON.stringify(resposta.receitas), Number(resposta.encaixes) || 0, agora());
  return { receitas: resposta.receitas, encaixes: Number(resposta.encaixes) || 0 };
}

/** A rede global baixada, com o quanto ela já viu. `null` se não há. */
function redeGlobal() {
  const r = lerEstado("rede");
  return r && r.rede ? r : null;
}

function placarGeral() {
  const g = lerEstado("geral");
  return Array.isArray(g) ? g : [];
}

module.exports = { iniciar, sincronizar, agendar, placarDe, redeGlobal, placarGeral };
