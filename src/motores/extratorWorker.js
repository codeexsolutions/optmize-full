/**
 * O worker do Extrator: recebe `{ id, tipo, ... }`, roda `executar` e devolve
 * `{ id, resultado }` ou `{ id, erro }`. A conta é a de `extratorTarefas.js`.
 */

import { executar } from "./extratorTarefas";

self.onmessage = (evento) => {
  const { id, ...pedido } = evento.data;
  try {
    self.postMessage({ id, resultado: executar(pedido) });
  } catch (erro) {
    self.postMessage({ id, erro: String((erro && erro.message) || erro) });
  }
};
