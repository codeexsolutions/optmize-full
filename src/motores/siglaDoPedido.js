/**
 * ===========================================================================
 * A SIGLA DO PEDIDO — o que sai impresso no tecido para separar os pedidos
 * ===========================================================================
 *
 * Dois pedidos no mesmo rolo economizam tecido (medido em 2026-10-01: camisas
 * + tiras juntas gastaram 5,3% menos que separadas), mas depois do corte
 * alguém precisa saber de quem é cada peça. A resposta vai impressa NA peça:
 * `P2 COG3` — pedido, sigla da peça e a cópia —, no canto de baixo à
 * esquerda, dentro da silhueta, com 4 mm de letra.
 *
 * Tudo aqui é conta, sem tela: a tela, o PNG e o PDF pedem o lugar daqui, e
 * por isso a sigla sai no mesmo lugar nos três.
 *
 * A LARGURA DO TEXTO É A DA FONTE DO PDF
 * --------------------------------------
 * O servidor escreve com Liberation Sans Bold (servidor/fontes). Medir com a
 * fonte da tela daria outra largura, e o lugar achado aqui deixaria de caber
 * no que o PDF imprime. A tabela abaixo é a largura de avanço de cada
 * caractere dessa fonte, em milésimos do corpo (lida com o fontkit, que vem
 * com o pdfkit). A sigla só tem A-Z, 0-9 e espaço — `normalizarSigla` garante.
 */

/** Altura da maiúscula, em cm. É o "4 mm" combinado. */
export const ALTURA_DA_LETRA_CM = 0.4;
/** Distância mínima da caixa do texto à borda da peça, em cm. */
export const RECUO_DA_SIGLA_CM = 0.3;
/** Grossura do contorno branco em volta da letra, em cm. */
export const CONTORNO_DA_LETRA_CM = 0.03;
/** Altura da maiúscula da Liberation Sans Bold, em fração do corpo. */
export const ALTURA_DE_MAIUSCULA = 0.688;

const LARGURAS = {
  " ": 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};
const LARGURA_DESCONHECIDA = 778;

const PEDIDO_PADRAO = "P1";

/** Só A-Z e 0-9, sem acento, maiúsculo, até `max` caracteres. */
export function normalizarSigla(texto, max = 6) {
  return String(texto == null ? "" : texto)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, max);
}

// "Tam G", "TAM 3G", "Tamanho GG", "tam: 10".
const TAMANHO = /(?:^|[^A-Z0-9])(?:TAMANHO|TAM)[\s_.:-]*([0-9]?G{1,2}|XG|P{1,2}|M|[0-9]{1,2})(?![A-Z0-9])/;
// O tamanho solto no fim de uma palavra: "Manga curta G", "COSTAS_GG".
const TAMANHO_SOLTO = /(?:^|[\s_-])(PP|P|M|GG|G|XG|[2-5]G)(?=$|[\s_.=-])/;

/**
 * A sigla da peça a partir do nome do arquivo: as duas primeiras letras da
 * primeira palavra, mais o tamanho quando o nome traz um.
 * `COSTAS_Camisa JOGO (Dry Tech) BRANCA Tam G =` → `COG`.
 */
export function siglaDaPeca(nome) {
  const limpo = String(nome == null ? "" : nome)
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const palavra = (limpo.match(/[A-Z0-9]+/) || [""])[0];
  const resto = limpo.slice(limpo.indexOf(palavra) + palavra.length);
  const tamanho = limpo.match(TAMANHO) || resto.match(TAMANHO_SOLTO);
  return normalizarSigla(palavra.slice(0, 2) + (tamanho ? tamanho[1] : ""));
}

/** `P2 COG3`: pedido, sigla da peça e a cópia (só quando há mais de uma). */
export function textoDaSigla({ pedido, sigla, nome, qtd, copia }) {
  const doPedido = normalizarSigla(pedido) || PEDIDO_PADRAO;
  const daPeca = normalizarSigla(sigla) || siglaDaPeca(nome);
  const daCopia = Number(qtd) > 1 && Number(copia) > 0 ? String(copia) : "";
  return [doPedido, `${daPeca}${daCopia}`].filter(Boolean).join(" ");
}

/** O corpo da fonte, em cm, que dá `alturaLetraCm` de maiúscula. */
export function tamanhoDaFonteCm(alturaLetraCm = ALTURA_DA_LETRA_CM) {
  return alturaLetraCm / ALTURA_DE_MAIUSCULA;
}

/** A largura do texto escrito na fonte do PDF, em cm. */
export function larguraDoTextoCm(texto, alturaLetraCm = ALTURA_DA_LETRA_CM) {
  let milesimos = 0;
  for (const ch of String(texto)) milesimos += LARGURAS[ch] || LARGURA_DESCONHECIDA;
  return (milesimos / 1000) * tamanhoDaFonteCm(alturaLetraCm);
}

/**
 * Onde a sigla cabe dentro da peça, em cm no rolo — ou `null`.
 *
 * O retângulo procurado é o do texto mais o recuo dos quatro lados. A busca
 * vai da linha de baixo da máscara para cima, até a metade da peça, e em cada
 * linha da esquerda para a direita: o primeiro lugar em que TODAS as células
 * do retângulo são peça é o escolhido. "Embaixo" é embaixo NO ROLO: a máscara
 * já é a da rotação em que a peça foi posta, e o texto sai sempre de pé.
 *
 * A máscara usada é a `desenho` (a silhueta real, sem a folga). A célula
 * (c, r) dela começa em `p.x + offX − recuo + c·passo` — a mesma conta do
 * `contornar`, em desenhoDoEncaixe.js.
 *
 * Sem máscara (encaixe por caixa), a peça é a caixa inteira.
 */
export function lugarDaSigla(p, texto, {
  alturaLetraCm = ALTURA_DA_LETRA_CM, recuoCm = RECUO_DA_SIGLA_CM,
} = {}) {
  if (!p) return null;
  const largura = larguraDoTextoCm(texto, alturaLetraCm);
  const altura = alturaLetraCm;
  const m = p.mascara;

  if (!m || !m.desenho || !(p.passo > 0)) {
    if (largura + 2 * recuoCm > p.largura || altura + 2 * recuoCm > p.altura) return null;
    return { x: p.x + recuoCm, y: p.y + p.altura - recuoCm - altura, largura, altura };
  }

  const passo = p.passo;
  const wC = Math.ceil((largura + 2 * recuoCm) / passo - 1e-9);
  const hC = Math.ceil((altura + 2 * recuoCm) / passo - 1e-9);
  const { cols, rows, desenho } = m;
  if (wC > cols || hC > rows) return null;

  // Soma acumulada: "o retângulo é todo peça?" em tempo constante.
  const W = cols + 1;
  const soma = new Int32Array(W * (rows + 1));
  for (let r = 0; r < rows; r++) {
    let naLinha = 0;
    for (let c = 0; c < cols; c++) {
      naLinha += desenho[r * cols + c] ? 1 : 0;
      soma[(r + 1) * W + c + 1] = soma[r * W + c + 1] + naLinha;
    }
  }
  const cheio = (c0, r0) => soma[(r0 + hC) * W + c0 + wC] - soma[r0 * W + c0 + wC]
    - soma[(r0 + hC) * W + c0] + soma[r0 * W + c0] === wC * hC;

  const recuoDaMoldura = m.recuo || 0;
  const origemX = p.x + m.offX - recuoDaMoldura;
  const origemY = p.y + m.offY - recuoDaMoldura;
  const ate = Math.min(Math.floor(rows / 2), rows - hC);
  for (let r0 = rows - hC; r0 >= ate; r0--) {
    for (let c0 = 0; c0 + wC <= cols; c0++) {
      if (!cheio(c0, r0)) continue;
      return {
        x: origemX + c0 * passo + recuoCm,
        y: origemY + (r0 + hC) * passo - recuoCm - altura,
        largura, altura,
      };
    }
  }
  return null;
}
