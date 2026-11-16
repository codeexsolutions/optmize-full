/**
 * O VETORIZADOR NUM WORKER — a conta pesada fora da tela.
 *
 * Dois pedidos:
 *
 *   analisar   as características da imagem e os três modelos de vetor que
 *              a rede da Vetora escolhe para ela (`vetorizador/rede/`)
 *   vetorizar  (o padrão) um vetor, com o andamento de cada fase e, no fim,
 *              o SVG com a paleta, as formas, a costura e as estatísticas
 *
 * A tela manda os pixels (o buffer vai TRANSFERIDO, sem cópia). Cada pedido
 * leva um `id`: a tela descarta a resposta de um pedido velho.
 */
import { vetorizar } from "./vetorizador";
import { caracteristicas, VERSAO_DAS_CARACTERISTICAS } from "./vetorizador/rede/caracteristicas";
import { criarRede } from "./vetorizador/rede/rede";
import { escolherModelos } from "./vetorizador/rede/escolher";
import PESOS from "./vetorizador/rede/pesos.json";

let rede;
const aRede = () => (rede === undefined ? (rede = criarRede(PESOS, VERSAO_DAS_CARACTERISTICAS)) : rede);

self.onmessage = (evento) => {
  const { id, tipo, px, largura, altura, opcoes } = evento.data || {};
  try {
    if (tipo === "analisar") {
      const c = caracteristicas(new Uint8ClampedArray(px), largura, altura);
      const r = aRede();
      const modelos = escolherModelos(r, c.valores, opcoes || {});
      self.postMessage({ id, tipo: "analise", analise: { modelos, comRede: !!r, versaoDaRede: r ? r.criadaEm : null, lambda: r ? r.lambda : null, carac: Array.from(c.valores) } });
      return;
    }
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
      resultado: { svg: r.svg, formas: r.formas, costura: r.costura, larguraTraco: r.larguraTraco, paleta: r.paleta, estatisticas: r.estatisticas },
    });
  } catch (erro) {
    self.postMessage({ id, tipo: "falhou", erro: String((erro && erro.message) || erro) });
  }
};
