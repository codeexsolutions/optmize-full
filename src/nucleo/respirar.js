/**
 * ===========================================================================
 * RESPIRAR — ceder a vez para a tela no meio de um trabalho longo
 * ===========================================================================
 *
 * Um `await` numa Promise resolvida não devolve o controle ao navegador: a
 * microtarefa roda antes de a tela ter chance de pintar. Um `MessageChannel`
 * devolve, porque a mensagem é uma tarefa de verdade.
 *
 * Veio do `public/encaixe.js`, onde era tela, porque quem chama é o
 * `encaixePrepara`, que é domínio — e domínio não importa da tela.
 */

// A preparação das silhuetas também pode ser pesada. Ceder a vez entre uma
// peça e outra mantém o botão de parar, o andamento e o restante da tela vivos.
const canalDaTela = new MessageChannel();
const pausasDaTela = [];
canalDaTela.port1.onmessage = () => {
  const continuar = pausasDaTela.shift();
  if (continuar) continuar();
};
export const respirarNaTela = () => new Promise((continuar) => {
  pausasDaTela.push(continuar);
  canalDaTela.port2.postMessage(0);
});
