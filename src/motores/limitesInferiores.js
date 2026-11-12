/**
 * ===========================================================================
 * LIMITES INFERIORES DO CONSUMO — o quanto ainda PODE haver para ganhar
 * ===========================================================================
 *
 * Nenhum encaixe, de nenhum programa, gasta menos rolo do que estes números.
 * Eles não dizem quanto falta para o ótimo (o ótimo de um encaixe irregular
 * não se calcula em tempo de produção); dizem o TETO da melhoria possível:
 * um encaixe a 18% do limite pode ter até 18% para ganhar — ou o limite pode
 * ser frouxo. Distância pequena prova que o encaixe é bom; distância grande
 * não prova que ele é ruim.
 *
 * Com W a largura útil, A_i a área da silhueta da peça i (cópias contadas) e
 * s a folga entre peças (r = s/2):
 *
 *   LB_area   L ≥ Σ A_i / W
 *             As peças não se sobrepõem e cabem em W × L.
 *
 *   LB_BM     L ≥ Σ (√A_i + r√π)² / (W + 2r) − 2r
 *             As peças engordadas por r também não se sobrepõem e cabem em
 *             (W + 2r) × (L + 2r). Pela desigualdade de Brunn–Minkowski no
 *             plano, a área da engordada é pelo menos (√A + r√π)², para
 *             qualquer forma, convexa ou não. Mais forte que o LB_area
 *             quando há folga.
 *
 *   LB_peca   L ≥ a maior "altura mínima" de uma peça: o menor lado que ela
 *             pode deixar ao longo do rolo entre os giros permitidos em que
 *             cabe na largura.
 *
 * O limite usado é o maior dos três. A área vem da silhueta lida
 * (`mascaras.areaReal`); é a mesma que o aproveitamento usa. A fórmula do
 * Brunn–Minkowski está em docs/optimize (FORMALIZACAO.md, §5, na branch da
 * pesquisa) — aqui está a conta, sem depender de nada do motor.
 */

/** Os giros que a peça aceita (o mesmo que `rotacoesDe`, sem importar o motor). */
function girosDe(item) {
  if (item.giro === "livre") return [0, 90, 180, 270];
  if (item.giro === "fixa") return [0];
  return [0, 180];
}

/**
 * Os limites inferiores do consumo (em cm) de um trabalho.
 *
 * `itens`: uma entrada por cópia, com `largura`, `altura` (cm), `giro` e
 * `mascaras.areaReal` (cm²). Peça sem área lida entra pela área da caixa —
 * que é MAIOR que a da silhueta, então o limite fica de fora: o resultado é
 * `null` para não afirmar um piso que não está provado.
 */
export function limitesInferiores(itens, larguraTecido, espaco = 0) {
  const W = Number(larguraTecido);
  if (!(W > 0) || !Array.isArray(itens) || itens.length === 0) return null;
  const r = Math.max(0, Number(espaco) || 0) / 2;
  let somaArea = 0;
  let somaBM = 0;
  let maiorLado = 0;
  for (const item of itens) {
    const A = item && item.mascaras ? Number(item.mascaras.areaReal) : NaN;
    if (!(A > 0)) return null;
    somaArea += A;
    somaBM += (Math.sqrt(A) + r * Math.sqrt(Math.PI)) ** 2;
    // O menor comprimento de rolo que a peça ocupa, entre os giros que cabem.
    let menor = Infinity;
    for (const rot of girosDe(item)) {
      const deitada = rot === 90 || rot === 270;
      const larg = deitada ? item.altura : item.largura;
      const comp = deitada ? item.largura : item.altura;
      if (larg <= W + 1e-9) menor = Math.min(menor, comp);
    }
    if (Number.isFinite(menor)) maiorLado = Math.max(maiorLado, menor);
  }
  const area = somaArea / W;
  const bm = Math.max(0, somaBM / (W + 2 * r) - 2 * r);
  const peca = maiorLado;
  const limite = Math.max(area, bm, peca);
  return { area, bm, peca, limite, areaPecas: somaArea };
}

/**
 * A distância de um consumo até o limite, em fração (0,18 = 18% acima).
 * `null` sem limite.
 */
export function distanciaAoLimite(consumo, limites) {
  if (!limites || !(limites.limite > 0) || !Number.isFinite(consumo)) return null;
  return consumo / limites.limite - 1;
}
