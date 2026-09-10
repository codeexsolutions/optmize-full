/**
 * A vetorização fora da thread da tela.
 *
 * A conta não é enorme, mas é longa o bastante para travar a página: uma arte
 * de 1260 × 1260 leva 0,8 s, e uma imagem no teto de 1800 pontos passa de
 * 1,5 s. Enquanto ela roda, nada na tela responde — nem o botão que a pessoa
 * acabou de soltar, nem a rolagem, nem trocar de aba. Como cada mexida num
 * controle refaz o desenho, o travamento não acontece uma vez: acontece toda
 * vez.
 *
 * O que atravessa são **os pixels já lidos**, e não a imagem: quem lê o
 * arquivo continua sendo o canvas da página, com o mesmo redimensionamento e a
 * mesma leitura de fundo de sempre, então o resultado é igual ao da versão sem
 * worker. O buffer vai transferido, sem cópia.
 *
 * ---------------------------------------------------------------------------
 * O QUE MUDOU NO PORTE
 * ---------------------------------------------------------------------------
 *
 * Só o carregamento. A versão da casca antiga fazia
 * `importScripts("geometria.js", "vetor.js")` e contava com o escopo global do
 * worker; aqui é `import`, e quem monta o worker é o Vite — ver como a tela o
 * cria, em `src/telas/Vetor.tsx`.
 *
 * A regra de sempre continua: se o navegador não deixar criar o worker, a tela
 * chama `vetorizarImagem` direto. O arquivo já está carregado nela de qualquer
 * jeito, e uma tela que trava é melhor do que uma tela que não funciona.
 */

import { vetorizarImagem } from "./vetor";

self.onmessage = (evento) => {
  const { id, pixels, largura, altura, opcoes } = evento.data;
  try {
    const dados = { data: new Uint8ClampedArray(pixels), width: largura, height: altura };
    self.postMessage({ id, resultado: vetorizarImagem(dados, opcoes) });
  } catch (erro) {
    self.postMessage({ id, erro: String((erro && erro.message) || erro) });
  }
};
