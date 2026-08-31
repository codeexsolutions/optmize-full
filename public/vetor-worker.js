/**
 * A vetorização fora da thread da tela.
 *
 * A conta não é enorme, mas é longa o bastante para travar a página: uma arte
 * de 1260 × 1260 leva 0,8 s, e uma imagem no teto de 1800 pontos passa de 1,5 s.
 * Enquanto ela roda, nada na tela responde — nem o botão que o usuário acabou
 * de soltar, nem a rolagem, nem trocar de aba. Como cada mexida num controle
 * refaz o desenho, o travamento não acontece uma vez: acontece toda vez.
 *
 * O que atravessa são **os pixels já lidos**, e não a imagem: quem lê o arquivo
 * continua sendo o mesmo canvas da página, com o mesmo redimensionamento e a
 * mesma leitura de fundo de sempre, então o resultado é igual ao da versão sem
 * worker. O buffer vai transferido, sem cópia.
 *
 * Se o navegador não deixar criar o worker, a tela chama `vetorizarImagem`
 * direto — o arquivo já está carregado nela de qualquer jeito.
 */

importScripts("geometria.js", "vetor.js");

self.onmessage = (evento) => {
  const { id, pixels, largura, altura, opcoes } = evento.data;
  try {
    const dados = { data: new Uint8ClampedArray(pixels), width: largura, height: altura };
    self.postMessage({ id, resultado: vetorizarImagem(dados, opcoes) });
  } catch (erro) {
    self.postMessage({ id, erro: String((erro && erro.message) || erro) });
  }
};
