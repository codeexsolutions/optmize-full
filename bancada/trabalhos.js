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

/**
 * A mesma peça, repetida como ARQUIVOS SOLTOS — uma entrada por cópia.
 *
 * É a diferença entre `{ nome: "uni-costa", qtd: 25 }` e vinte e cinco
 * entradas de `qtd: 1`: no primeiro caso o motor vê uma peça com 25 cópias, no
 * segundo vê 25 peças diferentes que por acaso têm a mesma silhueta. Para o
 * tecido dá no mesmo; para o motor, não (ver `producao-avulsa`).
 */
const avulsas = (nome, quantas, extra) => Array.from({ length: quantas },
  () => ({ nome, qtd: 1, ...extra }));

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
  /*
   * `so-camiseta`, peça por peça: doze arquivos de uma cópia em vez de um
   * arquivo de doze. Mesma geometria, mesmo tecido.
   *
   * É o par mais limpo para ver o que o motor perde quando não reconhece que
   * duas peças são a mesma coisa: aqui é o agrupamento em dupla e em trio que
   * decide o resultado (ver o cabeçalho de `so-camiseta`), e ele nasce de
   * cópias do mesmo índice.
   */
  "so-camiseta-avulsa": {
    larguraTecido: 180, espaco: 1, comprimentoBancada: 0,
    pecas: avulsas("camiseta", 12),
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
  /*
   * ===========================================================================
   * O PEDIDO GRANDE E MISTURADO — o caso que a bancada não tinha
   * ===========================================================================
   *
   * Todos os lotes grandes daqui são de UM produto só: `producao-uniforme` e
   * `lote-enorme` são 25 e 40 uniformes iguais. Neles o motor vai bem — 79% e
   * 81% de aproveitamento, mais do que em qualquer lote pequeno — e por isso
   * eles não sabem responder à queixa que veio da produção:
   *
   *   "em grandes produções o motor perde desempenho em coisas que ele
   *    conseguia encaixar bem melhor se fossem tratadas separadamente"
   *
   * O que se junta num dia de trabalho não são 40 uniformes iguais: são o
   * pedido do uniforme, o da camiseta e o de miudeza, com formatos e tamanhos
   * que não têm nada a ver um com o outro, tudo num rolo só. A nota da ordem
   * "familia" (em encaixeMotor.js) já dizia isto com todas as letras — "a
   * bancada não reproduz o caso em que a observação de produção nasceu" — e
   * media-se contra o alvo errado desde então.
   *
   * Os três pedidos existem separados E juntos de propósito, porque a pergunta
   * da queixa é uma comparação:
   *
   *   node bancada/medir.js --tempo 3 --trabalhos pedido-uniforme,pedido-confeccao,pedido-miudeza
   *   node bancada/medir.js --tempo 9 --trabalhos producao-misturada
   *
   * O tempo triplica no junto porque ele faz o trabalho dos três — do
   * contrário a comparação seria entre orçamentos diferentes, e não entre
   * encaixar junto e encaixar separado.
   *
   * **Encaixar junto TEM que ganhar.** Cada pedido separado paga um rabo de
   * rolo mal aproveitado; juntos, a peça pequena de um tem o vão do outro para
   * cair dentro. Quando a soma dos separados empata com o junto, ou ganha
   * dele, o que está sendo medido é exatamente a queixa: o motor não está
   * achando o que a mistura oferece.
   *
   * Todos no mesmo tecido e na mesma folga da produção (179 cm, 4 mm), senão
   * não daria para somar um com o outro.
   */
  /*
   * ===========================================================================
   * O MESMO TRABALHO, COMO A PRODUÇÃO MANDA: UM ARQUIVO POR PEÇA
   * ===========================================================================
   *
   * `producao-uniforme` são as mesmas 175 peças com a mesma geometria, mas
   * declaradas como 5 peças de 25/50 cópias. O trabalho REAL de onde ela saiu
   * está guardado no banco da loja e tem **155 formatos** para 175 peças: cada
   * uniforme é personalizado, então cada um é um arquivo seu. A assinatura
   * daquele trabalho mostra que, de silhueta, são só quatro peças diferentes.
   *
   * A diferença não é de arquivo, é de motor. Identificando a peça pelo índice
   * do arquivo (e é o que `montarUnidades`, `familiaDaUnidade` e
   * `montarUnidadesCruzadas` fazem), 155 arquivos de uma cópia cada desligam
   * sozinhos toda a maquinaria de agrupar:
   *
   *   dupla e trio   nascem de cópias do MESMO índice — aqui não há nenhuma
   *   familia        vira uma família por peça, ou seja, ordem por área
   *   cruzada        desiste acima de CRUZADA_MAX_FORMATOS formatos
   *
   * Este trabalho existe para medir esse buraco, e a medida é a comparação
   * entre os dois — mesma geometria, mesmo tecido, mesma folga:
   *
   *   node bancada/medir.js --trabalhos producao-uniforme,producao-avulsa
   *
   * O que os separar é só o que o motor deixa de enxergar.
   */
  "producao-avulsa": {
    larguraTecido: 179, espaco: 0.4, comprimentoBancada: 0,
    pecas: [
      ...avulsas("uni-costa", 25),
      ...avulsas("uni-frente", 25),
      ...avulsas("uni-manga", 50),
      ...avulsas("uni-short", 50),
      ...avulsas("uni-gola", 25),
    ],
  },

  "pedido-uniforme": {
    larguraTecido: 179, espaco: 0.4, comprimentoBancada: 0,
    pecas: [
      { nome: "uni-costa", qtd: 20 },
      { nome: "uni-frente", qtd: 20 },
      { nome: "uni-manga", qtd: 40 },
      { nome: "uni-short", qtd: 30 },
      { nome: "uni-gola", qtd: 20 },
    ],
  },
  "pedido-confeccao": {
    larguraTecido: 179, espaco: 0.4, comprimentoBancada: 0,
    pecas: [
      { nome: "camiseta", qtd: 16 },
      { nome: "manga", qtd: 32 },
      { nome: "gola", qtd: 16 },
    ],
  },
  "pedido-miudeza": {
    larguraTecido: 179, espaco: 0.4, comprimentoBancada: 0,
    pecas: [
      { nome: "calca", qtd: 8 },
      { nome: "regata", qtd: 10 },
      { nome: "bolso", qtd: 24 },
      { nome: "punho", qtd: 40 },
    ],
  },
  /* Os três acima no mesmo rolo: 276 peças, cinco famílias de tamanho e
   * formato bem diferentes. */
  "producao-misturada": {
    larguraTecido: 179, espaco: 0.4, comprimentoBancada: 0,
    pecas: [
      { nome: "uni-costa", qtd: 20 },
      { nome: "uni-frente", qtd: 20 },
      { nome: "uni-manga", qtd: 40 },
      { nome: "uni-short", qtd: 30 },
      { nome: "uni-gola", qtd: 20 },
      { nome: "camiseta", qtd: 16 },
      { nome: "manga", qtd: 32 },
      { nome: "gola", qtd: 16 },
      { nome: "calca", qtd: 8 },
      { nome: "regata", qtd: 10 },
      { nome: "bolso", qtd: 24 },
      { nome: "punho", qtd: 40 },
    ],
  },

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
