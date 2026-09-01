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
    larguraTecido: 160, espaco: 1, margem: 2,
    pecas: [
      { nome: "camiseta", qtd: 8 },
      { nome: "manga", qtd: 16 },
      { nome: "gola", qtd: 8 },
    ],
  },
  "so-camiseta": {
    larguraTecido: 180, espaco: 1, margem: 2,
    pecas: [{ nome: "camiseta", qtd: 12 }],
  },
  "calca-bolso": {
    larguraTecido: 160, espaco: 1, margem: 2,
    pecas: [
      { nome: "calca", qtd: 8 },
      { nome: "bolso", qtd: 16 },
    ],
  },
  "misturado-pequeno": {
    larguraTecido: 150, espaco: 1, margem: 2,
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
    larguraTecido: 160, espaco: 1, margem: 2,
    pecas: [
      { nome: "camiseta", qtd: 24 },
      { nome: "manga", qtd: 48 },
      { nome: "gola", qtd: 24 },
      { nome: "regata", qtd: 12 },
      { nome: "punho", qtd: 22 },
    ],
  },
  "quase-retangulo": {
    larguraTecido: 160, espaco: 1, margem: 2,
    pecas: [
      { nome: "punho", qtd: 30 },
      { nome: "bolso", qtd: 20 },
    ],
  },
};

// O conjunto que a bancada roda quando ninguém pede um trabalho específico.
const PADRAO = ["camiseta+manga+gola", "so-camiseta", "calca-bolso", "misturado-pequeno"];

module.exports = { TRABALHOS, PADRAO };
