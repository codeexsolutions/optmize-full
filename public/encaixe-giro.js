/**
 * ===========================================================================
 * GIRO — como uma peça pode virar no tecido
 * ===========================================================================
 *
 * Três modos, e a diferença entre eles é o sentido do fio do tecido:
 *
 *   "fixa"   não vira. Listrado, xadrez, estampa com direção.
 *   "180"    entra de cabeça para baixo quando ajudar. Mantém o sentido do fio
 *            e do desenho, que é o que quase todo tecido aceita.
 *   "livre"  também deita. São as quatro posições da volta inteira. Serve para
 *            malha lisa e arte sem sentido, e costuma render mais tecido.
 *
 * Isto morava dentro do `encaixe-motor.js`, e o encaixe por NFP precisava dele
 * — só que o motor também precisava do NFP. Os dois se importavam em círculo, o
 * que funciona por acidente em <script> e vira armadilha em módulo. O NFP saiu
 * do projeto depois, mas o arquivo ficou: "de que jeito a peça pode virar" não
 * é assunto de encaixador nenhum em particular, e aqui embaixo todos alcançam.
 */

const ROTACOES_POR_GIRO = { "180": [0, 180], fixa: [0], livre: [0, 90, 180, 270] };

/** As posições que vale a pena tentar para esta peça. */
const rotacoesDe = (item) => ROTACOES_POR_GIRO[item.giro] || [0];

/** Só o modo "livre" pode trocar largura por altura no encaixe por retângulo. */
const podeDeitar = (item) => item.giro === "livre";
