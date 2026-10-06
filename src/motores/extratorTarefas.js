/**
 * O trabalho pesado da tela do Extrator, num lugar só: quem chama é o worker
 * (`extratorWorker.js`) e, se o navegador não deixar criar worker, a própria
 * tela (`telas/extrator/trabalhador.ts`). As duas portas rodam a MESMA conta.
 */

import { desentortar } from "./perspectiva";
import { ampliarMascara, aplicarMascara, corDeFora, limparBorda, recorteInteiro } from "./recorte";
import { vetorizarImagem } from "./vetor";

export function executar(pedido) {
  if (pedido.tipo === "desentortar") return desentortar(pedido.pixels, pedido.largura, pedido.altura, pedido.cantos);
  if (pedido.tipo === "recortar") {
    // A máscara vem do tamanho da foto de trabalho; o elemento sai da foto inteira.
    const alfa = ampliarMascara(pedido.alfa, pedido.la, pedido.aa, pedido.largura, pedido.altura);
    const cor = corDeFora(pedido.pixels, pedido.largura, pedido.altura, alfa);
    const recorte = aplicarMascara(pedido.pixels, pedido.largura, pedido.altura, alfa);
    if (recorte && cor) limparBorda(recorte, cor);
    return recorte;
  }
  if (pedido.tipo === "inteira") return recorteInteiro(pedido.pixels, pedido.largura, pedido.altura);
  if (pedido.tipo === "vetorizar") {
    return vetorizarImagem({ data: pedido.pixels, width: pedido.largura, height: pedido.altura }, pedido.opcoes);
  }
  throw new Error(`tarefa desconhecida: ${pedido.tipo}`);
}
