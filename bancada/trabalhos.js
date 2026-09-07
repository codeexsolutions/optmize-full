/**
 * Os trabalhos da bancada: os lotes que servem de referência para medir
 * qualquer mexida no motor.
 *
 * A escolha não é aleatória. Cada um existe para cobrir um comportamento
 * diferente do encaixe, e mexida que melhora um e piora outro tem que aparecer
 * aqui em vez de passar batido numa média:
 *
 *   camiseta+manga+gola  o trabalho de todo dia: peça grande, peça média e
 *                        tirinha, todas com concavidade, no rolo estreito.
 *   so-camiseta          um formato só, muitas cópias. É onde o agrupamento
 *                        (dupla, trio) manda no resultado.
 *   calca-bolso          a peça mais comprida do catálogo com uma miudeza
 *                        junto — o caso em que a peça pequena tem que achar o
 *                        vão da grande.
 *   misturado-pequeno    seis formatos, poucas cópias de cada. Aqui não há
 *                        bloco que salve: quem decide é a ordem de entrada.
 *   lote-grande          130 peças. O regime em que cada tentativa custa caro
 *                        e o orçamento de tempo é o recurso escasso.
 *   quase-retangulo      punho e bolso: peça sem concavidade nenhuma. É a
 *                        contraprova — aqui o contorno não pode perder feio do
 *                        encaixe por caixa.
 *
 * `giro` segue o que a produção pede: malha lisa aceita 180°, e é o padrão.
 */

const TRABALHOS = {
  "camiseta+manga+gola": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "camiseta", qtd: 8 },
      { nome: "manga", qtd: 16 },
      { nome: "gola", qtd: 8 },
    ],
  },
  "so-camiseta": {
    larguraTecido: 180, espaco: 1, comprimentoBancada: 0,
    pecas: [{ nome: "camiseta", qtd: 12 }],
  },
  "calca-bolso": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "calca", qtd: 8 },
      { nome: "bolso", qtd: 16 },
    ],
  },
  "misturado-pequeno": {
    larguraTecido: 150, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "camiseta", qtd: 3 },
      { nome: "manga", qtd: 6 },
      { nome: "gola", qtd: 3 },
      { nome: "regata", qtd: 3 },
      { nome: "bolso", qtd: 4 },
      { nome: "punho", qtd: 6 },
    ],
  },
  "lote-grande": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "camiseta", qtd: 24 },
      { nome: "manga", qtd: 48 },
      { nome: "gola", qtd: 24 },
      { nome: "regata", qtd: 12 },
      { nome: "punho", qtd: 22 },
    ],
  },
  /*
   * O TRABALHO DE PRODUÇÃO. 25 uniformes completos, do jeito que saiu da loja:
   * 179 cm de mídia, folga de 4 mm.
   *
   * É o trabalho mais importante do conjunto, e o único que tem um número de
   * fora para comparar: a produção fechou em **34,63 m**. Ele existe porque as
   * peças de confecção do resto do catálogo não representam o que esta loja
   * imprime, e mexida de motor medida só nelas estava respondendo à pergunta
   * errada (ver "AS PEÇAS DA PRODUÇÃO", em pecas.js).
   *
   * É também o mais caro de rodar — 175 peças, cada tentativa custa caro. Fica
   * fora do conjunto padrão de propósito; entra com `--todos` ou pelo nome.
   */
  "producao-uniforme": {
    larguraTecido: 179, espaco: 0.4, comprimentoBancada: 0,
    pecas: [
      { nome: "uni-costa", qtd: 25 },
      { nome: "uni-frente", qtd: 25 },
      { nome: "uni-manga", qtd: 50 },
      { nome: "uni-short", qtd: 50 },
      { nome: "uni-gola", qtd: 25 },
    ],
  },
  /*
   * A peça cuja silhueta são dois blocos separados, repetida. Foi este formato
   * que fez o encaixe por NFP pôr peça em cima de peça; o NFP saiu, o trabalho
   * ficou (ver "arte-partida" em pecas.js para o porquê).
   */
  "arte-partida": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "arte-partida", qtd: 10 },
      { nome: "gola", qtd: 4 },
    ],
  },
  "quase-retangulo": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "punho", qtd: 30 },
      { nome: "bolso", qtd: 20 },
    ],
  },

  /*
   * ===========================================================================
   * OS QUE FALTAVAM
   * ===========================================================================
   *
   * O catálogo cobria bem o meio da distribuição e deixava as pontas de fora.
   * Estes fecham os buracos do §14.1 do guia de melhorias, e o primeiro deles
   * fecha um buraco que não era de portfólio, era de COBERTURA DE CÓDIGO.
   */

  /*
   * O GIRO NUNCA ERA EXERCITADO.
   *
   * `medir.js` lê `p.giro`, e nenhum trabalho definia um — todos caíam no
   * "180". Só que o giro decide o que o motor pode fazer: com "livre" nascem as
   * receitas `retangulo/deitada`, a unidade "cruzada" passa a valer e o contorno
   * testa quatro rotações por peça em vez de duas; com "fixa" sobra uma só.
   *
   * Ou seja, um ramo inteiro do motor rodava em produção e nunca era medido. É a
   * mesma condição que produziu os dois defeitos achados nesta empreitada — o
   * `cor-api` fora do instalador e o cache do WASM: código pronto, testado por
   * outros meios, que o caminho de verdade nunca exercitava.
   */
  "giro-livre": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "camiseta", qtd: 8, giro: "livre" },
      { nome: "manga", qtd: 16, giro: "livre" },
      { nome: "gola", qtd: 8, giro: "livre" },
    ],
  },
  "giro-fixo": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "camiseta", qtd: 8, giro: "fixa" },
      { nome: "manga", qtd: 16, giro: "fixa" },
      { nome: "gola", qtd: 8, giro: "fixa" },
    ],
  },

  /*
   * Mistura extrema de tamanhos: a calça tem 5.408 cm² de caixa e o punho tem
   * 192 — vinte e oito vezes menos. É o caso em que a peça pequena precisa achar
   * o vão que a grande deixou, e onde o encaixe por vãos deveria brilhar.
   */
  "tamanhos-extremos": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "calca", qtd: 6 },
      { nome: "punho", qtd: 30 },
      { nome: "bolso", qtd: 12 },
    ],
  },

  /*
   * Estreitas e compridas: gola e punho são tiras (6:1 e 3:1). Elas empilham
   * bem entre si e desperdiçam muito quando tratadas como caixa, então separam
   * o encaixe por contorno do de retângulo com clareza.
   */
  "tiras": {
    larguraTecido: 160, espaco: 1, comprimentoBancada: 0,
    pecas: [
      { nome: "gola", qtd: 24 },
      { nome: "punho", qtd: 36 },
      { nome: "uni-gola", qtd: 12 },
    ],
  },

  /*
   * Acima de 200 peças, que é onde o orçamento por tentativa aperta e o custo
   * de cada encaixador passa a decidir mais que a esperteza dele. Fica fora do
   * conjunto padrão por causa do tempo: ele sozinho custa o que os outros seis
   * custam juntos.
   */
  "lote-enorme": {
    larguraTecido: 179, espaco: 0.4, comprimentoBancada: 0,
    pecas: [
      { nome: "uni-costa", qtd: 40 },
      { nome: "uni-frente", qtd: 40 },
      { nome: "uni-manga", qtd: 80 },
      { nome: "uni-short", qtd: 60 },
      { nome: "uni-gola", qtd: 40 },
    ],
  },
};

/*
 * O conjunto que a bancada roda quando ninguém pede um trabalho específico.
 *
 * Ele era de quatro trabalhos, todos pequenos (12 a 32 peças) e todos com o
 * mesmo giro. Seis cobrem bem mais sem dobrar o relógio:
 *
 *   camiseta+manga+gola   o caso comum, três famílias
 *   so-camiseta           uma família só, muitas cópias
 *   calca-bolso           duas famílias, tamanhos bem diferentes
 *   misturado-pequeno     muitas famílias, poucas cópias de cada
 *   giro-livre            o ramo do motor que ninguém media
 *   tamanhos-extremos     a peça pequena procurando o vão da grande
 *
 * Os outros ficam a um `--trabalhos` de distância, e a varredura completa cabe
 * num `--trabalhos <todos>` quando a mudança for grande o bastante para pedir.
 */
const PADRAO = [
  "camiseta+manga+gola", "so-camiseta", "calca-bolso", "misturado-pequeno",
  "giro-livre", "tamanhos-extremos",
];

module.exports = { TRABALHOS, PADRAO };
