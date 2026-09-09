/**
 * ===========================================================================
 * DIAGNÓSTICO DA IMAGEM — ela precisa melhorar? e quanto dá para melhorar?
 * ===========================================================================
 *
 * A pergunta que chega na tela de Imagem é "dá para melhorar essa imagem?", e
 * a resposta honesta depende de uma coisa que a imagem sozinha não diz: **o
 * tamanho em que ela vai ser impressa**. Uma imagem de 1000 px impressa a
 * 10 cm sai a 254 dpi e está ótima; a MESMA impressa a 1,20 m sai a 21 dpi e
 * não há algoritmo que salve.
 *
 * Tudo aqui é conta pura sobre números e pixels — nada de canvas, nada de
 * página. Veio de `public/imagem.js`, onde morava no meio da tela, e nenhuma
 * linha mudou: entraram os `export` e mais nada.
 */

/**
 * A partir de quantos dpi uma imagem impressa para de incomodar.
 *
 * Não é um número de fotografia, é de gráfica: 300 dpi é o padrão de revista,
 * lido de perto. Banner e faixa são vistos de longe e vivem bem com muito
 * menos — 100 dpi num banner de 2 m é normal, e exigir 300 ali seria pedir um
 * arquivo de 700 MB por nada.
 */
export const DPI_OTIMO = 300;
export const DPI_ACEITAVEL = 150;
export const DPI_LONGE = 100;

/** O máximo que os modelos sabem fazer. Os dois só multiplicam por quatro. */
export const ESCALA_DA_REDE = 4;

/**
 * As duas redes, e o que cada uma custa — tudo medido, nada estimado no olho.
 *
 * A régua é `bancada-imagem.html`: encolhe-se uma imagem detalhada, pede-se à
 * rede que desfaça o estrago, e compara-se com o original que ainda existe.
 *
 *   rápido    PSNR 23,68 na dose 70%    363 ms por ladrilho de 112 px úteis
 *   capricho  PSNR 24,51 na dose 100%  12244 ms por ladrilho de 224 px úteis
 *
 * O capricho ganha 0,83 dB e custa 8,7x mais por pixel. E a DOSE ÓTIMA de cada
 * um é diferente, o que não é detalhe: o rápido piora depois de 70% porque
 * inventa demais, e o capricho não — ele acerta mais, então não precisa ser
 * segurado.
 *
 * O tempo por ladrilho é desta máquina, com WebGPU, e serve para o palpite que
 * a tela dá ANTES de começar. Enquanto roda, o que vale é o ritmo medido de
 * verdade — ver a barra de andamento.
 */
export const REDES = {
  rapido: {
    nome: "rápida",
    uteis: 112,
    msPorLadrilho: 363,
    dose: 70,
    resumo: "boa para quase tudo",
  },
  capricho: {
    nome: "capricho",
    uteis: 224,
    msPorLadrilho: 12244,
    dose: 100,
    resumo: "mais detalhe, bem mais devagar",
  },
};

/** Acima disto a espera deixa de ser "vou tomar um café". */
export const ESPERA_CONFORTAVEL_MS = 120_000;

/**
 * O teto do que faz sentido produzir.
 *
 * Não é um limite de memória escolhido no susto — é o que sobra depois de a
 * escala já ter sido cortada pelo tamanho de impressão. Alguém que digita
 * "500 cm de largura" pede 59 mil pixels; isso não é um trabalho, é um engano
 * de digitação, e a tela avisa em vez de tentar.
 */
export const SAIDA_DEMAIS = 80_000_000;

/** A partir daqui a espera passa de alguns minutos, e vale dizer isso antes. */
export const LADRILHOS_MUITOS = 400;

// ==================== O DIAGNÓSTICO ====================

/** Quantos dpi essa imagem dá, impressa nessa largura. */
export function dpiNaLargura(pixels, centimetros) {
  if (!(centimetros > 0)) return null;
  return pixels / (centimetros / 2.54);
}

/**
 * O recado sobre o dpi, e a cor dele.
 *
 * Compara o valor ARREDONDADO, que é o que a pessoa lê. Sem isso, a imagem que
 * a própria tela ampliou para bater 300 dpi mostrava "300 dpi" e o recado de
 * quem não chegou lá — por 3 centésimos.
 */
export function vereditoDoDpi(dpi) {
  if (dpi === null) return { texto: "diga a largura de impressão", tom: "neutro" };
  dpi = Math.round(dpi);
  if (dpi >= DPI_OTIMO) return { texto: "ótimo, imprime de perto", tom: "bom" };
  if (dpi >= DPI_ACEITAVEL) return { texto: "bom para a maioria dos trabalhos", tom: "bom" };
  if (dpi >= DPI_LONGE) return { texto: "serve para banner, visto de longe", tom: "meio" };
  return { texto: "vai borrar", tom: "ruim" };
}

/**
 * Uma imagem é arte chapada (logo, escudo) ou é foto?
 *
 * A conta é a quantidade de cores distintas numa amostra. Logo vive de poucas
 * cores grandes e chapadas; foto tem ruído em tudo e não repete cor. O corte é
 * grosseiro de propósito: ele não decide nada sozinho, só resolve se a tela
 * SUGERE o Vetor. Errar para menos é o barato — a sugestão não aparece e a
 * pessoa segue pela rede, que também funciona.
 */
export function pareceArteChapada(dados) {
  const cores = new Set();
  const passo = Math.max(1, Math.floor(dados.data.length / 4 / 20000)) * 4;
  let opacos = 0;
  for (let i = 0; i < dados.data.length; i += passo) {
    if (dados.data[i + 3] < 128) continue;
    opacos++;
    // Agrupa em degraus de 16: duas fotos nunca repetem o valor exato, e sem
    // agrupar toda foto teria "todas as cores".
    cores.add(((dados.data[i] >> 4) << 8) | ((dados.data[i + 1] >> 4) << 4) | (dados.data[i + 2] >> 4));
  }
  if (opacos < 100) return false;
  return cores.size <= 24;
}

/**
 * A escala que ESTA imagem precisa para ESTE tamanho de impressão.
 *
 * Aqui mora a correção do erro que travava o botão. Antes a tela oferecia 4x e
 * nada mais, e então precisava recusar imagem grande, porque 4x de uma foto de
 * celular é memória demais. Só que 4x quase nunca era o que se queria: uma foto
 * de 12 MP impressa a 30 cm já passa de 300 dpi, e ampliar aquilo seria gastar
 * minutos para produzir pixel que não vira tinta.
 *
 * Então a conta é a de verdade: quantos pixels faltam para chegar aos 300 dpi
 * na largura pedida. O resto — quanto a rede consegue, quanta memória cabe —
 * são tetos aplicados em cima disso, e não o ponto de partida.
 */
export function escalaQuePrecisa(item) {
  const alvo = (item.larguraCm / 2.54) * DPI_OTIMO;
  const bruta = alvo / item.antes.width;
  if (!(bruta > 1)) return 1;                       // já tem tamanho de sobra
  return Math.min(ESCALA_DA_REDE, bruta);
}

/** O que a tela precisa saber para decidir o que oferecer. */
export function planoDaImagem(item) {
  const w = item.antes.width;
  const h = item.antes.height;

  let escala = escalaQuePrecisa(item);

  // Estourou o teto? Reduz até caber, em vez de recusar.
  //
  // Isto é deliberado, e é a lição do botão travado: pedir 1 m a 300 dpi
  // é pedir 104 megapixels, e a resposta certa não é "não dá", é entregar o
  // maior que cabe e dizer com quantos dpi ficou. Quem imprime a 1 m olha de
  // longe e nem queria 300.
  let cortadaPeloTeto = false;
  if (Math.round(w * escala) * Math.round(h * escala) > SAIDA_DEMAIS) {
    escala = Math.sqrt(SAIDA_DEMAIS / (w * h));
    cortadaPeloTeto = true;
  }

  const largura = Math.round(w * escala);
  const altura = Math.round(h * escala);
  const ladrilhos = Math.ceil(w / 112) * Math.ceil(h / 112);

  // Quanto cada rede levaria NESTA imagem. É o número que decide a escolha, e
  // é o que a tela mostra ao lado de cada opção — escolher às cegas entre
  // "rápida" e "capricho" não é escolher.
  const tempos = {};
  for (const [chave, r] of Object.entries(REDES)) {
    const n = Math.ceil(w / r.uteis) * Math.ceil(h / r.uteis);
    tempos[chave] = { ladrilhos: n, ms: n * r.msPorLadrilho };
  }

  return {
    escala,
    largura,
    altura,
    ladrilhos,
    tempos,
    cortadaPeloTeto,
    dpiQueDa: dpiNaLargura(largura, item.larguraCm),
    jaBasta: escala <= 1.02 && !cortadaPeloTeto,
    // Só sobra "grande demais" quando nem a imagem como está cabe: aí não
    // existe ampliação nenhuma a oferecer.
    grandeDemais: escala < 1,
    demorado: ladrilhos > LADRILHOS_MUITOS,
  };
}
