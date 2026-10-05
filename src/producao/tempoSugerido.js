/**
 * O tempo de procura que o Encaixe sugere.
 *
 * A busca própria do motor satura cedo (spec de 2026-09-21: 32,30 m com 3 s e
 * com 300 s); quem converte tempo em tecido é o sparrow, e só em PEÇA
 * GRANDE. Medido com as artes reais em 2026-10-01 (bancada:guardados, rolo de
 * 178 cm, folga 0,4, busca + sparrow, 5 fatias, metros de tecido):
 *
 *   trabalho  cópias  área média    60 s     120 s     180 s
 *   #6 camisa   195   4410 cm²    64,74     62,81     61,95
 *   #7 camisa   175   4080 cm²    55,51     54,03     53,67
 *   #3 camisa   240   1539 cm²    26,97     26,18     25,84
 *   #1 tira     200    391 cm²     5,07       -         5,04
 *
 * Ganho de 120 s para 180 s: #6 1,4%, #7 0,7%, #3 1,3%, média 1,1%. Passa de
 * 1%, então o teto da peça grande é 180 s (a regra era: 180 se passar de 1%,
 * senão 120). De 60 s para 180 s a camisa #6 ganha 4,3%; a tira #1, 0,5%.
 *
 * Área média por cópia dos sete trabalhos: tiras #1 391, #2 688, #4 344, #5 858
 * (maior: 858); camisas #3 1539, #6 4410, #7 4080 (menor: 1539). O limiar fica
 * entre 858 e 1539: 1200. O 2500 do primeiro rascunho deixava o #3 de fora.
 *
 * Então o teto sobe só quando a peça média é grande. A área é a da silhueta
 * (`_cacheMascaras.areaReal`) quando ela já foi lida — arte em prancheta de
 * 100 x 100 cm com uma tira dentro é tira, não prancheta —, e a da caixa antes
 * disso.
 */
export const TEMPO_MIN_S = 10;
export const TEMPO_MAX_S = 60;
export const AREA_DE_PECA_GRANDE_CM2 = 1200;
export const TEMPO_MAX_PECA_GRANDE_S = 180;
const SEGUNDOS_POR_COPIA = 0.9;

export function tempoSugerido(pecas) {
  let copias = 0;
  let area = 0;
  (pecas || []).forEach((p) => {
    const q = Math.max(0, Number(p.qtd) || 0);
    const daSilhueta = p._cacheMascaras && Number(p._cacheMascaras.areaReal);
    const daPeca = daSilhueta > 0 ? daSilhueta : (Number(p.largura) || 0) * (Number(p.altura) || 0);
    copias += q;
    area += q * daPeca;
  });
  const media = copias > 0 ? area / copias : 0;
  const teto = media >= AREA_DE_PECA_GRANDE_CM2 ? TEMPO_MAX_PECA_GRANDE_S : TEMPO_MAX_S;
  return Math.max(TEMPO_MIN_S, Math.min(teto, Math.round(copias * SEGUNDOS_POR_COPIA)));
}
