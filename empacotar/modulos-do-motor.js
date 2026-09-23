/**
 * ===========================================================================
 * AS PORTAS DE ENTRADA DO MOTOR — uma lista só, para os dois empacotadores
 * ===========================================================================
 *
 * O motor de encaixe é empacotado duas vezes, pelo mesmo esbuild e a partir
 * dos mesmos arquivos: uma para o servidor (`empacotar/motor.js`, que gera
 * `servidor/motor-encaixe.js`) e outra para a bancada (`bancada/motor.js`, que
 * carrega o resultado na memória do Node e mede).
 *
 * Cada um mantinha a própria lista, e elas divergiram sem ninguém ver: a da
 * bancada ganhou `encaixeSobreposicao` e `encaixeEncolher` quando esses
 * módulos nasceram, a do servidor não. O comentário lá dizia que a lista era
 * "a da bancada mais o `encaixeMascara`", o que deixou de ser verdade no mesmo
 * dia. Duas listas do mesmo conjunto é uma que envelhece.
 *
 * Não é ordem de carregamento — é só o conjunto de portas de entrada; quem
 * descobre a ordem é o esbuild, pelos `import` de verdade.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A BANCADA LEVA DOIS MÓDULOS A MAIS
 * ---------------------------------------------------------------------------
 *
 * Porque o servidor não os chama. O que ele encaixa é o pedido que vem do
 * CorelDRAW (ver `servidor/encaixe-resolver.js`), e esse caminho faz a busca e
 * devolve o resultado: não passa pela guarda de sobreposição nem pela segunda
 * fase do encolhedor, que hoje são da TELA.
 *
 * Isso é uma diferença de verdade entre os dois caminhos, e não um descuido do
 * empacotamento — quem encaixa pelo Corel não recebe o aperto do sparrow nem a
 * recusa por sobreposição. Está escrito aqui para que a próxima pessoa decida
 * de propósito, em vez de descobrir pelo resultado: no dia em que o resolvedor
 * passar a usá-los, basta mover as duas linhas para a lista de cima.
 */

/** O que o servidor precisa para transformar polígono em encaixe. */
const PARA_O_SERVIDOR = [
  "motores/encaixeMotor.js",
  // De onde vêm `grade`, `gradeDaPeca` e `mascarasDeSilhueta`: sem eles o
  // servidor recebe polígono e não tem como transformar em máscara.
  "motores/encaixeMascara.js",
  "motores/encaixeGiro.js",
  "motores/encaixeRede.mjs",
  "motores/encaixeWasm.js",
  "utils/geometria.ts",
];

/** O do servidor mais o que só a tela usa — e que a bancada mede assim mesmo. */
const PARA_A_BANCADA = [
  ...PARA_O_SERVIDOR,
  // O guarda da sobreposição: a bancada mede a MESMA conta que a tela usa
  // para travar a produção, e não uma cópia dela.
  "motores/encaixeSobreposicao.js",
  // A ponte do encolhedor (o sparrow): a segunda fase da busca da produção.
  "motores/encaixeEncolher.js",
];

module.exports = { PARA_O_SERVIDOR, PARA_A_BANCADA };
