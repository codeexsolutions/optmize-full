/**
 * ===========================================================================
 * OS PEDIDOS DO ROLO — de quem é cada peça quando dois pedidos saem juntos
 * ===========================================================================
 *
 * Juntar pedidos no mesmo rolo economiza tecido (spec de 2026-10-01), e o
 * operador decide quando pode. O pedido é um RÓTULO da peça (`peca.pedido`):
 * o motor não lê, o encaixe sai o mesmo com ou sem ele. Não é o grupo — grupo
 * prende peças numa região e desliga o sparrow, que é o contrário do que se
 * quer aqui.
 *
 * Com um pedido só nada aparece: nem chip, nem contorno, nem sigla.
 */
import { lugarDaSigla, normalizarSigla, textoDaSigla } from "../motores/siglaDoPedido";

export const PEDIDO_PADRAO = "P1";

export const normalizarPedido = (texto) => normalizarSigla(texto, 6);

/** O pedido da peça; a que veio de antes desta mudança é do P1. */
export const pedidoDe = (peca) => normalizarPedido(peca && peca.pedido) || PEDIDO_PADRAO;

/** Os pedidos da lista, na ordem em que aparecem. */
export function pedidosDaLista(pecas) {
  const vistos = [];
  (pecas || []).forEach((p) => {
    const pedido = pedidoDe(p);
    if (!vistos.includes(pedido)) vistos.push(pedido);
  });
  return vistos;
}

export const temVariosPedidos = (pecas) => pedidosDaLista(pecas).length > 1;

/** O pedido do último lote que entrou — o "Mesmo pedido" da escolha. */
export function ultimoPedido(pecas) {
  return pecas && pecas.length ? pedidoDe(pecas[pecas.length - 1]) : PEDIDO_PADRAO;
}

/** O primeiro `Pn` que ninguém usa — o "Novo pedido" da escolha. */
export function proximoPedido(pecas) {
  const usados = new Set(pedidosDaLista(pecas));
  for (let n = 1; ; n++) if (!usados.has(`P${n}`)) return `P${n}`;
}

/**
 * As peças que entraram a partir de `desde` ficam no `pedido`. Peça que já
 * chegou com pedido (a Reposição devolve o de antes) fica com o dela.
 */
export function marcarLote(pecas, desde, pedido) {
  for (let i = desde; i < pecas.length; i++) if (!pecas[i].pedido) pecas[i].pedido = pedido;
}

/**
 * Troca o nome de um pedido em todas as peças dele. Nome já usado por outro
 * pedido junta os dois (`juntou`), e quem chamou avisa.
 */
export function renomearPedido(pecas, de, para) {
  const novo = normalizarPedido(para);
  if (!novo) return { ok: false };
  const antigo = normalizarPedido(de) || PEDIDO_PADRAO;
  const juntou = novo !== antigo && pedidosDaLista(pecas).includes(novo);
  pecas.forEach((p) => { if (pedidoDe(p) === antigo) p.pedido = novo; });
  return { ok: true, pedido: novo, juntou };
}

/*
 * Paleta própria, e não a das peças: o contorno do pedido aparece POR CIMA da
 * cor de cada peça, e o chip do pedido mora ao lado do chip do grupo — com a
 * mesma paleta, os dois se confundiriam.
 */
export const PALETA_DE_PEDIDOS = [
  "#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#65a30d",
];

/** A cor sai do nome: o mesmo pedido tem sempre a mesma cor (como `corDoGrupo`). */
export function corDoPedido(pedido) {
  const nome = String(pedido || PEDIDO_PADRAO);
  let n = 0;
  for (let i = 0; i < nome.length; i++) n = (n * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA_DE_PEDIDOS[n % PALETA_DE_PEDIDOS.length];
}

/**
 * O que a tela, o PNG e o PDF precisam saber dos pedidos de um risco — ou
 * `null` com menos de dois pedidos (aí tudo sai como sempre saiu).
 *
 * O pedido, a sigla, o nome e a quantidade vêm de `pecas[indice]`, a lista
 * DE AGORA: os itens do risco são cópias feitas na hora do encaixe, e
 * renomear um pedido ou uma peça não refaz o encaixe (o motor não lê nada
 * disso) — o nome novo tem de sair assim mesmo, e igual ao que a gaveta
 * mostra. Só a cópia é do item: ela é a posição no risco.
 */
export function marcasDoRisco(r, pecas) {
  if (!r || !Array.isArray(r.posicoes) || r.posicoes.length === 0) return null;
  const daLista = (p) => (pecas && pecas[p.item.indice]) || p.item;
  const doRisco = r.posicoes.map((p) => pedidoDe(daLista(p)));
  if (new Set(doRisco).size < 2) return null;

  const marcas = [];
  const semSigla = [];
  const contagem = new Map();
  r.posicoes.forEach((p, i) => {
    const fonte = daLista(p);
    const texto = textoDaSigla({
      pedido: doRisco[i], sigla: fonte.sigla, nome: fonte.nome, qtd: fonte.qtd, copia: p.item.copia,
    });
    const lugar = lugarDaSigla(p, texto);
    marcas.push(lugar ? { texto, ...lugar } : null);
    if (!lugar) semSigla.push(`${fonte.nome}${fonte.qtd > 1 ? ` ${p.item.copia}` : ""}`);
    contagem.set(doRisco[i], (contagem.get(doRisco[i]) || 0) + 1);
  });
  const legenda = [...contagem].map(([pedido, quantas]) => ({ pedido, cor: corDoPedido(pedido), quantas }));
  return { pedidos: doRisco, marcas, semSigla, legenda };
}

/** A marca no formato do corpo do PDF, com o `y` contado do começo da página. */
export function marcaParaOPdf(marca, deslocamento) {
  if (!marca) return undefined;
  // Arredonda a diferença: 1054.3 - 1000 dá 54.29999…, e o PDF não precisa dessa sobra.
  const y = Math.round((marca.y - deslocamento) * 1e4) / 1e4;
  return { texto: marca.texto, x: marca.x, y, alturaCm: marca.altura };
}
