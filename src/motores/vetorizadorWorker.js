/**
 * O VETORIZADOR NUM WORKER — a conta pesada fora da tela.
 *
 * A tela manda os pixels (o buffer vai TRANSFERIDO, sem cópia) e os ajustes;
 * daqui volta o andamento de cada fase e, no fim, o SVG com a paleta, as
 * formas (para o PDF) e as estatísticas. Cada pedido leva um `id`: a tela
 * descarta a resposta de um pedido velho quando a pessoa mexeu num ajuste
 * no meio do caminho.
 */
import { vetorizar } from "./vetorizador";

self.onmessage = (evento) => {
  const { id, px, largura, altura, opcoes } = evento.data || {};
  try {
    const r = vetorizar(new Uint8ClampedArray(px), largura, altura, opcoes || {}, (fase, fracao) => {
      self.postMessage({ id, tipo: "andamento", fase, fracao });
    });
    if (r.erro) {
      self.postMessage({ id, tipo: "falhou", erro: r.erro });
      return;
    }
    self.postMessage({
      id,
      tipo: "pronto",
      resultado: { svg: r.svg, formas: r.formas, paleta: r.paleta, estatisticas: r.estatisticas },
    });
  } catch (erro) {
    self.postMessage({ id, tipo: "falhou", erro: String((erro && erro.message) || erro) });
  }
};
