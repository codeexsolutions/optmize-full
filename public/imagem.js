/**
 * ===========================================================================
 * A TELA DE IMAGEM — resolução para o que vai ser impresso
 * ===========================================================================
 *
 * A pergunta que chega aqui costuma ser "dá para melhorar essa imagem?". A
 * resposta honesta tem três partes, e a tela dá as três nesta ordem:
 *
 *   1. ELA PRECISA MELHORAR? Uma imagem de 1000 px impressa a 10 cm sai a
 *      254 dpi e está ótima; a MESMA impressa a 1,20 m sai a 21 dpi e não há
 *      algoritmo que salve. Sem o tamanho de impressão na mão, "melhorar" não
 *      quer dizer nada — por isso o tamanho é a primeira coisa que se pergunta,
 *      e não uma opção escondida.
 *
 *   2. SE FOR LOGO, NÃO É AQUI. Arte chapada vetorizada dá resolução infinita
 *      e não inventa nada. A tela reconhece esse caso e aponta para o Vetor,
 *      em vez de fingir que ampliar é equivalente.
 *
 *   3. SE FOR FOTO, A REDE. Aí sim vale ampliar com o Real-ESRGAN, que
 *      reconstrói detalhe plausível.
 *
 * O QUE A REDE FAZ, DITO SEM ENFEITE
 * ----------------------------------
 * Ela INVENTA. O detalhe que aparece não estava no arquivo: é o que a rede
 * aprendeu que costuma existir ali. Em textura — pele, tecido, folhagem — isso
 * é exatamente o que se quer. Em rosto conhecido e em letra pequena, o que ela
 * inventa pode não ser o que estava escrito. A tela avisa isso onde importa, e
 * o antes/depois existe para a conferência ser possível, e não decorativa.
 *
 * TRÊS COISAS QUE ESTA TELA APRENDEU DEPOIS DE ALGUÉM USAR
 * --------------------------------------------------------
 * O primeiro uso de verdade devolveu "deu certo mas saiu meio estranho", e o
 * estranho tinha três nomes: a cor mudou, ficou plastificado, e apareceu halo
 * nas bordas. A cor era defeito, e está consertada no worker. Os outros dois
 * são a rede sendo a rede — e para eles a resposta não é um conserto, é dar
 * controle e dar como ver:
 *
 *   A PROVA. A rede roda primeiro num pedaço do meio da imagem, em segundos.
 *   Descobrir que ficou estranho tem que ser barato; antes disso custava dois
 *   minutos de espera para então se arrepender.
 *
 *   A LUPA. Miniatura lado a lado não serve para julgar nada — o defeito que
 *   incomoda na impressão tem o tamanho de um pixel. A comparação é 1:1, e é
 *   entre a AMPLIAÇÃO LIMPA e a rede, porque é essa a decisão de verdade: vale
 *   o que a rede inventou, ou era melhor sem ela?
 *
 *   A DOSE. Uma barra entre as duas. Plastificado e halo são o exagero da
 *   rede, e a dose é o remédio: em 70% costuma sobrar o ganho e sumir o ar de
 *   plástico. Ela mistura duas imagens já prontas, então mexer na barra é
 *   instantâneo — a rede não roda de novo.
 *
 * ONDE O TRABALHO ACONTECE
 * ------------------------
 * No navegador, em worker — ver imagem-worker.js. Nada sobe para servidor
 * nenhum: a arte do cliente não sai da máquina da gráfica.
 */

const imagemEntrada = document.getElementById("imagem-arquivo");
const imagemSolta = document.getElementById("imagem-solta");
const imagemLista = document.getElementById("imagem-lista");

/** Onde a conversa acontece. Uma imagem por vez: a rede come a GPU inteira. */
const imagemEstado = {
  itens: [],
  proximoId: 1,
  trabalhando: null,   // o id que está sendo ampliado agora
  worker: null,
};

/**
 * A partir de quantos dpi uma imagem impressa para de incomodar.
 *
 * Não é um número de fotografia, é de gráfica: 300 dpi é o padrão de revista,
 * lido de perto. Banner e faixa são vistos de longe e vivem bem com muito
 * menos — 100 dpi num banner de 2 m é normal, e exigir 300 ali seria pedir um
 * arquivo de 700 MB por nada.
 */
const DPI_OTIMO = 300;
const DPI_ACEITAVEL = 150;
const DPI_LONGE = 100;

/** O máximo que o modelo sabe fazer. Ele só multiplica por quatro. */
const ESCALA_DA_REDE = 4;

/**
 * O teto do que faz sentido produzir.
 *
 * Não é um limite de memória escolhido no susto — é o que sobra depois de a
 * escala já ter sido cortada pelo tamanho de impressão. Alguém que digita
 * "500 cm de largura" pede 59 mil pixels; isso não é um trabalho, é um engano
 * de digitação, e a tela avisa em vez de tentar.
 */
const SAIDA_DEMAIS = 80_000_000;

/** A partir daqui a espera passa de alguns minutos, e vale dizer isso antes. */
const LADRILHOS_MUITOS = 400;

// ==================== O DIAGNÓSTICO ====================

/** Quantos dpi essa imagem dá, impressa nessa largura. */
function dpiNaLargura(pixels, centimetros) {
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
function vereditoDoDpi(dpi) {
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
function pareceArteChapada(dados) {
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
function escalaQuePrecisa(item) {
  const alvo = (item.larguraCm / 2.54) * DPI_OTIMO;
  const bruta = alvo / item.antes.width;
  if (!(bruta > 1)) return 1;                       // já tem tamanho de sobra
  return Math.min(ESCALA_DA_REDE, bruta);
}

/** O que a tela precisa saber para decidir o que oferecer. */
function planoDaImagem(item) {
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

  return {
    escala,
    largura,
    altura,
    ladrilhos,
    cortadaPeloTeto,
    dpiQueDa: dpiNaLargura(largura, item.larguraCm),
    jaBasta: escala <= 1.02 && !cortadaPeloTeto,
    // Só sobra "grande demais" quando nem a imagem como está cabe: aí não
    // existe ampliação nenhuma a oferecer.
    grandeDemais: escala < 1,
    demorado: ladrilhos > LADRILHOS_MUITOS,
  };
}

// ==================== LER O ARQUIVO ====================

async function lerImagem(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const bitmap = await createImageBitmap(await fetch(url).then((r) => r.blob()));
    const tela = document.createElement("canvas");
    tela.width = bitmap.width;
    tela.height = bitmap.height;
    const pincel = tela.getContext("2d", { willReadFrequently: true });
    pincel.drawImage(bitmap, 0, 0);
    bitmap.close();
    return pincel.getImageData(0, 0, tela.width, tela.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function receberArquivos(arquivos) {
  for (const arquivo of arquivos) {
    if (!/^image\//.test(arquivo.type)) continue;
    let dados;
    try {
      dados = await lerImagem(arquivo);
    } catch (erro) {
      continue;
    }
    imagemEstado.itens.push({
      id: imagemEstado.proximoId++,
      nome: arquivo.name,
      bytes: arquivo.size,
      antes: dados,
      depois: null,           // o que a lupa e o download usam, já com a dose
      rede: null,             // o resultado puro da rede
      limpo: null,            // a ampliação sem rede, o outro extremo da dose
      ehProva: false,         // veio de um pedaço só?
      comoFoi: null,          // "rede" ou "limpo"
      ondeRodou: null,
      chapada: pareceArteChapada(dados),
      larguraCm: 30,          // um palpite para a conta já aparecer preenchida
      andamento: null,
      erro: null,
      // 70 e não 100 de propósito: o primeiro uso reclamou de plastificado, e
      // a rede inteira é justamente o que dá esse ar. Quem quiser tudo puxa a
      // barra para 100 e vê na hora.
      dose: 70,
      telas: null,            // os canvas de trabalho da lupa
      vista: { x: 0, y: 0 },  // que canto da imagem a lupa mostra
    });
  }
  renderImagem();
}

// ==================== AMPLIAR ====================

function pegarWorker() {
  if (!imagemEstado.worker) {
    imagemEstado.worker = new Worker("/imagem-worker.js", { type: "module" });
  }
  return imagemEstado.worker;
}

/**
 * A ampliação limpa, sem rede: só a conta do navegador, em dois passos.
 *
 * Dobrar de uma vez para 4x borra; dobrar duas vezes com a suavização ligada
 * dá um resultado bem mais firme, e é instantâneo. Isto é a saída para quem
 * não quer esperar, e o pé no chão do resto da tela: é ATÉ AQUI que dá para
 * chegar sem inventar pixel.
 */
function ampliarLimpo(dados) {
  let atual = dados;
  for (let vez = 0; vez < 2; vez++) {
    const tela = document.createElement("canvas");
    tela.width = atual.width * 2;
    tela.height = atual.height * 2;
    const pincel = tela.getContext("2d", { willReadFrequently: true });
    pincel.imageSmoothingEnabled = true;
    pincel.imageSmoothingQuality = "high";

    const fonte = document.createElement("canvas");
    fonte.width = atual.width;
    fonte.height = atual.height;
    fonte.getContext("2d").putImageData(atual, 0, 0);

    pincel.drawImage(fonte, 0, 0, tela.width, tela.height);
    atual = pincel.getImageData(0, 0, tela.width, tela.height);
  }
  return atual;
}

/**
 * Roda a rede. Com `ehProva`, só num recorte do meio — segundos em vez de
 * minutos, e o suficiente para ver se o resultado agrada.
 */
async function ampliarComRede(item, ehProva) {
  const worker = pegarWorker();
  imagemEstado.trabalhando = item.id;
  item.erro = null;
  item.andamento = { etapa: "runtime" };
  renderImagem();

  const fonte = ehProva ? recorteDaProva(item.antes) : item.antes;
  const copia = new Uint8ClampedArray(fonte.data);
  const plano = planoDaImagem(item);

  return new Promise((resolver) => {
    // Sem isto, um worker que morre (modelo que não carrega, memória que
    // acaba) deixa `trabalhando` preso para sempre e TODOS os botões da tela
    // apagados, sem dizer por quê. Foi assim que a primeira versão travou.
    worker.onerror = (evento) => {
      imagemEstado.trabalhando = null;
      item.andamento = null;
      item.erro = "A rede parou: " + (evento.message || "erro dentro do worker")
        + ". Tente de novo, ou use \"Só ampliar\".";
      imagemEstado.worker = null;   // o próximo clique cria um worker novo
      renderImagem();
      resolver();
    };

    worker.onmessage = (evento) => {
      const dados = evento.data;

      if (dados.andamento) {
        item.andamento = dados.andamento;
        renderImagem();
        return;
      }

      imagemEstado.trabalhando = null;
      item.andamento = null;

      if (dados.erro) {
        item.erro = dados.cancelado ? null : dados.erro;
        renderImagem();
        resolver();
        return;
      }

      const r = dados.resultado;
      item.rede = new ImageData(r.pixels, r.largura, r.altura);
      item.limpo = new ImageData(r.limpo, r.largura, r.altura);
      item.ehProva = !!ehProva;
      item.comoFoi = "rede";
      item.ondeRodou = r.ondeRodou;
      item.telas = null;
      aplicarDose(item);
      centrarLupa(item);
      renderImagem();
      desenharLupa(item);
      resolver();
    };

    worker.postMessage(
      {
        id: item.id,
        pixels: copia.buffer,
        largura: fonte.width,
        altura: fonte.height,
        escala: plano.escala,
      },
      [copia.buffer],
    );
  });
}

function cancelarAmpliacao() {
  if (imagemEstado.worker) imagemEstado.worker.postMessage({ tipo: "cancelar" });
}


// ==================== A PROVA: UM PEDAÇO, EM SEGUNDOS ====================

/** O lado do quadrado que a prova recorta. Dois ladrilhos da rede. */
const LADO_DA_PROVA = 224;

/**
 * Um recorte do meio da imagem, para a rede rodar em segundos.
 *
 * Do MEIO porque é onde costuma estar o assunto — rosto, escudo, o que
 * importa. Canto de foto é céu ou parede, e julgar a rede por um pedaço de
 * parede lisa não diz nada.
 */
function recorteDaProva(dados) {
  const lado = Math.min(LADO_DA_PROVA, dados.width, dados.height);
  const x0 = Math.floor((dados.width - lado) / 2);
  const y0 = Math.floor((dados.height - lado) / 2);

  const tela = document.createElement("canvas");
  tela.width = dados.width;
  tela.height = dados.height;
  tela.getContext("2d").putImageData(dados, 0, 0);

  const corte = document.createElement("canvas");
  corte.width = lado;
  corte.height = lado;
  const pincel = corte.getContext("2d", { willReadFrequently: true });
  pincel.drawImage(tela, x0, y0, lado, lado, 0, 0, lado, lado);
  return pincel.getImageData(0, 0, lado, lado);
}

// ==================== A DOSE ====================

/**
 * Mistura a ampliação limpa com o resultado da rede.
 *
 * As duas já estão prontas e do mesmo tamanho, então isto é uma passada por
 * pixel — rápido o bastante para a barra responder enquanto se arrasta. Se a
 * rede rodasse de novo a cada mexida, a barra seria inútil.
 */
function misturarDose(item) {
  if (!item.rede || !item.limpo) return null;
  const dose = Math.max(0, Math.min(100, item.dose)) / 100;

  if (dose >= 1) return item.rede;
  if (dose <= 0) return item.limpo;

  const r = item.rede.data;
  const l = item.limpo.data;
  const saida = new ImageData(item.rede.width, item.rede.height);
  const d = saida.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = l[i] + (r[i] - l[i]) * dose;
    d[i + 1] = l[i + 1] + (r[i + 1] - l[i + 1]) * dose;
    d[i + 2] = l[i + 2] + (r[i + 2] - l[i + 2]) * dose;
    d[i + 3] = r[i + 3];
  }
  return saida;
}

function aplicarDose(item) {
  item.depois = misturarDose(item);
  if (item.telas) item.telas.depois = null;   // a lupa refaz o canvas dela
}

// ==================== A LUPA ====================

/** O tamanho da janela da lupa, em pixels de tela. */
const LUPA_LARGURA = 300;
const LUPA_ALTURA = 220;

/** Canvas com um ImageData dentro, guardado para a lupa não refazer a cada quadro. */
function telaDe(dados) {
  const tela = document.createElement("canvas");
  tela.width = dados.width;
  tela.height = dados.height;
  tela.getContext("2d").putImageData(dados, 0, 0);
  return tela;
}

/**
 * Desenha as duas janelas da lupa: a ampliação limpa e o resultado com a dose.
 *
 * 1:1, sem suavizar. Ampliar a comparação seria inventar um defeito que a
 * impressão não tem; encolher esconderia o que ela tem. O que se procura aqui
 * — halo, textura de plástico, detalhe inventado — vive no tamanho de um pixel.
 */
function desenharLupa(item) {
  const artigo = document.querySelector(`[data-item="${item.id}"]`);
  if (!artigo || !item.depois || !item.limpo) return;

  const antes = artigo.querySelector("[data-lupa-antes]");
  const depois = artigo.querySelector("[data-lupa-depois]");
  if (!antes || !depois) return;

  if (!item.telas) item.telas = { limpo: telaDe(item.limpo), depois: null };
  if (!item.telas.depois) item.telas.depois = telaDe(item.depois);

  const maxX = Math.max(0, item.depois.width - LUPA_LARGURA);
  const maxY = Math.max(0, item.depois.height - LUPA_ALTURA);
  item.vista.x = Math.max(0, Math.min(maxX, item.vista.x));
  item.vista.y = Math.max(0, Math.min(maxY, item.vista.y));

  for (const [tela, fonte] of [[antes, item.telas.limpo], [depois, item.telas.depois]]) {
    const pincel = tela.getContext("2d");
    pincel.imageSmoothingEnabled = false;
    pincel.clearRect(0, 0, tela.width, tela.height);
    pincel.drawImage(fonte, item.vista.x, item.vista.y, tela.width, tela.height,
                     0, 0, tela.width, tela.height);
  }
}

/** A lupa começa no meio: é onde a prova recortou, e onde o assunto costuma estar. */
function centrarLupa(item) {
  item.vista = {
    x: Math.max(0, Math.round((item.depois.width - LUPA_LARGURA) / 2)),
    y: Math.max(0, Math.round((item.depois.height - LUPA_ALTURA) / 2)),
  };
}

// ==================== SALVAR ====================

function baixar(item) {
  const dados = item.depois || item.antes;
  const tela = document.createElement("canvas");
  tela.width = dados.width;
  tela.height = dados.height;
  tela.getContext("2d").putImageData(dados, 0, 0);

  // PNG, e não JPEG: a imagem acabou de ser reconstruída, e comprimir com
  // perda logo depois jogaria fora parte do que se esperou para ganhar.
  tela.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.nome.replace(/\.[^.]+$/, "") + "-melhorada.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, "image/png");
}

// ==================== A TELA ====================

function comoTempo(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + " s";
  return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s";
}

function comoTamanho(bytes) {
  if (bytes < 1048576) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/** A miniatura de um ImageData, para caber na tela sem carregar tudo. */
function miniatura(dados, ladoMaximo) {
  const escala = Math.min(1, ladoMaximo / Math.max(dados.width, dados.height));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(dados.width * escala));
  tela.height = Math.max(1, Math.round(dados.height * escala));

  const fonte = document.createElement("canvas");
  fonte.width = dados.width;
  fonte.height = dados.height;
  fonte.getContext("2d").putImageData(dados, 0, 0);

  const pincel = tela.getContext("2d");
  pincel.imageSmoothingEnabled = true;
  pincel.imageSmoothingQuality = "high";
  pincel.drawImage(fonte, 0, 0, tela.width, tela.height);
  return tela.toDataURL("image/png");
}

function linhaDoDpi(item, dados, rotulo) {
  const dpi = dpiNaLargura(dados.width, item.larguraCm);
  const v = vereditoDoDpi(dpi);
  const cor = { bom: "text-[var(--success,#4ed18a)]", meio: "text-[var(--warn,#f5b740)]",
                ruim: "text-[var(--danger)]", neutro: "text-tinta-apagada" }[v.tom];
  return `<span class="flex items-baseline gap-1.5 text-[11px]">
    <span class="w-14 shrink-0 text-tinta-apagada">${rotulo}</span>
    <strong class="text-tinta">${dados.width} × ${dados.height} px</strong>
    ${dpi !== null ? `<span class="${cor}">· ${Math.round(dpi)} dpi — ${escapeHtml(v.texto)}</span>` : ""}
  </span>`;
}

function renderImagem() {
  if (!imagemLista) return;

  if (imagemEstado.itens.length === 0) {
    imagemLista.innerHTML =
      `<p class="px-3 py-8 text-center text-[11px] text-tinta-apagada">
         Solte uma imagem aqui, ou escolha o arquivo acima.
       </p>`;
    return;
  }

  const ocupado = imagemEstado.trabalhando !== null;

  imagemLista.innerHTML = imagemEstado.itens.map((item) => {
    const plano = planoDaImagem(item);

    return `
    <article class="rounded-lg border border-linha" data-item="${item.id}">
      <div class="flex items-start gap-3 border-b border-linha px-3 py-2.5">
        <img class="size-14 shrink-0 rounded border border-linha object-contain"
             src="${miniatura(item.antes, 120)}" alt="">
        <span class="min-w-0 flex-1">
          <strong class="block truncate text-[12px] text-tinta">${escapeHtml(item.nome)}</strong>
          <span class="mt-0.5 block text-[10px] text-tinta-apagada">${comoTamanho(item.bytes)}</span>
        </span>
        <button type="button" class="btn secondary btn-sm" data-tirar="${item.id}">Tirar</button>
      </div>

      <!--
        A largura de impressão vem ANTES dos botões porque é ela que diz se
        algum deles é necessário. Perguntar depois seria pedir para a pessoa
        esperar um minuto para então descobrir que não precisava.
      -->
      <div class="flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2">
        <!--
          O "!" nas medidas do campo não é capricho: a folha da casa dá
          largura de 100% a todo input dentro de label, porque as outras telas
          empilham rótulo e campo. Aqui ele fica NA LINHA da frase, e sem
          vencer aquela regra o campo empurra "cm de largura" para baixo.
        -->
        <label class="mt-0! flex flex-wrap items-center gap-1.5 text-[11px] text-tinta-apagada">
          Vai imprimir com
          <input class="mt-0! w-20! px-2! py-1! text-[0.8rem]!" type="number" min="1" step="1"
                 value="${item.larguraCm}" data-cm="${item.id}">
          cm de largura
        </label>
      </div>

      <!--
        A linha "depois" mostra o que a IMAGEM INTEIRA vai dar, e nunca o
        tamanho da prova: a prova é um recorte, e anunciar os 331 px dela como
        resultado seria dizer que a foto encolheu.
      -->
      <div class="grid gap-1 px-3 py-2.5">
        ${linhaDoDpi(item, item.antes, "hoje")}
        ${item.depois && !item.ehProva
          ? linhaDoDpi(item, item.depois, "depois")
          : (!plano.jaBasta && !plano.grandeDemais
              ? linhaDoDpi(item, { width: plano.largura, height: plano.altura }, "vai dar")
              : "")}
      </div>

      ${item.chapada && !item.depois ? `
        <p class="m-0 border-t border-linha px-3 py-2 text-[10px] leading-relaxed text-tinta-apagada">
          Isto parece <strong class="text-tinta">arte chapada</strong> — logo, escudo, poucas cores.
          Para esse tipo, a tela de <strong class="text-tinta">Vetor</strong> dá resolução infinita e
          não inventa nada. Ampliar aqui funciona, mas é o segundo melhor caminho.
        </p>` : ""}

      ${item.andamento ? `
        <div class="border-t border-linha px-3 py-2.5">
          ${item.andamento.etapa === "ampliando" ? `
            <span class="flex items-baseline justify-between text-[11px] text-tinta">
              <span>Melhorando… ${item.andamento.feitos} de ${item.andamento.total} pedaços</span>
              <span class="text-tinta-apagada">faltam ${comoTempo(item.andamento.restaMs)}</span>
            </span>
            <span class="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-painel-suave">
              <span class="block h-full rounded-full bg-ambar transition-[width]"
                    style="width:${Math.round((item.andamento.feitos / item.andamento.total) * 100)}%"></span>
            </span>` : `
            <span class="text-[11px] text-tinta-apagada">
              ${item.andamento.etapa === "runtime" ? "Ligando a rede neural…" : "Carregando o modelo…"}
            </span>`}
          <button type="button" class="btn secondary btn-sm mt-2" data-cancelar="1">Cancelar</button>
        </div>` : ""}

      ${item.erro ? `
        <p class="m-0 border-t border-linha px-3 py-2 text-[11px] text-[var(--danger)]">
          ${escapeHtml(item.erro)}
        </p>` : ""}

      ${item.depois && item.rede ? `
        <div class="border-t border-linha px-3 py-3">
          ${item.ehProva ? `
            <p class="m-0 mb-2 rounded border border-linha bg-painel-suave px-2 py-1.5 text-[10px] leading-relaxed text-tinta">
              Isto é uma <strong>prova</strong>: a rede rodou só num pedaço do meio da imagem.
              Se agradar, mande fazer a imagem inteira.
            </p>` : ""}

          <!--
            A comparação é entre a AMPLIAÇÃO LIMPA e a rede, e não contra o
            original pequeno: as duas no mesmo tamanho, 1:1, é a única forma de
            responder a pergunta que interessa — vale o que a rede inventou?
          -->
          <span class="mb-1.5 flex items-baseline justify-between text-[10px] text-tinta-apagada">
            <span>Comparação 1:1 &mdash; arraste para andar pela imagem</span>
            ${item.ondeRodou === "cpu" ? `<span>rodou no processador</span>` : ""}
          </span>
          <span class="grid grid-cols-2 gap-2" data-lupa="${item.id}">
            <figure class="m-0">
              <canvas class="w-full cursor-move rounded border border-linha"
                      width="${LUPA_LARGURA}" height="${LUPA_ALTURA}" data-lupa-antes></canvas>
              <figcaption class="mt-1 text-[10px] text-tinta-apagada">só ampliada</figcaption>
            </figure>
            <figure class="m-0">
              <canvas class="w-full cursor-move rounded border border-linha"
                      width="${LUPA_LARGURA}" height="${LUPA_ALTURA}" data-lupa-depois></canvas>
              <figcaption class="mt-1 text-[10px] text-tinta-apagada">com a rede, ${item.dose}%</figcaption>
            </figure>
          </span>

          <label class="mt-2.5! flex items-center gap-2 text-[11px] text-tinta-apagada">
            <span class="shrink-0">Dose da rede</span>
            <input class="mt-0! w-full" type="range" min="0" max="100" step="5"
                   value="${item.dose}" data-dose="${item.id}">
            <strong class="w-9 shrink-0 text-right text-tinta">${item.dose}%</strong>
          </label>
          <p class="m-0 mt-1 text-[10px] leading-relaxed text-tinta-apagada">
            Em 0% é só ampliação, sem inventar nada. Em 100% é a rede inteira &mdash; que é
            também onde aparecem o ar de plástico e o contorno duro. Mexa e olhe a janela da
            direita: ela muda na hora.
          </p>
        </div>` : item.depois ? `
        <div class="border-t border-linha px-3 py-3">
          <span class="mb-2 block text-[11px] text-tinta-apagada">Ampliada sem inventar detalhe.</span>
          <span class="grid grid-cols-2 gap-2">
            <figure class="m-0">
              <img class="w-full rounded border border-linha" src="${miniatura(item.antes, 420)}" alt="">
              <figcaption class="mt-1 text-[10px] text-tinta-apagada">antes</figcaption>
            </figure>
            <figure class="m-0">
              <img class="w-full rounded border border-linha" src="${miniatura(item.depois, 420)}" alt="">
              <figcaption class="mt-1 text-[10px] text-tinta-apagada">depois</figcaption>
            </figure>
          </span>
        </div>` : ""}

      <div class="flex flex-wrap gap-1.5 border-t border-linha px-3 py-2">
        <!--
          O rótulo diz a escala REAL, e não "4x": é o número que a impressão
          pediu. Botão que promete quatro e entrega dois mente; botão que diz
          "1,8x" explica sozinho por que a espera é curta.
        -->
        <button type="button" class="btn primary btn-sm" data-rede="${item.id}"
                ${ocupado || plano.grandeDemais ? "disabled" : ""}>
          ${plano.jaBasta
            ? "Passar a rede (limpar)"
            : `Melhorar para ${plano.escala.toFixed(1).replace(".", ",")}×`}
        </button>
        <!--
          A prova vem ANTES da imagem inteira porque descobrir que ficou
          estranho tem que ser barato. São segundos contra minutos.
        -->
        <button type="button" class="btn secondary btn-sm" data-prova="${item.id}"
                ${ocupado || plano.grandeDemais ? "disabled" : ""}>
          Ver uma prova
        </button>
        <button type="button" class="btn secondary btn-sm" data-limpo="${item.id}" ${ocupado ? "disabled" : ""}>
          Só ampliar, sem inventar
        </button>
        ${item.depois && !item.ehProva
          ? `<button type="button" class="btn secondary btn-sm" data-baixar="${item.id}">Baixar PNG</button>`
          : ""}
      </div>

      ${plano.grandeDemais ? `
        <p class="m-0 border-t border-linha px-3 py-2 text-[10px] leading-relaxed text-[var(--warn,#f5b740)]">
          Esta imagem sozinha já passa do que o navegador desenha
          (${(item.antes.width * item.antes.height / 1e6).toFixed(0)} megapixels). Não há ampliação a
          oferecer — e uma imagem desse tamanho dificilmente precisa de uma.
        </p>` : plano.cortadaPeloTeto ? `
        <p class="m-0 border-t border-linha px-3 py-2 text-[10px] leading-relaxed text-tinta-apagada">
          A ${item.larguraCm.toLocaleString("pt-BR")} cm, 300 dpi pediria mais pixels do que o
          navegador desenha. Vai até onde cabe: ${plano.largura.toLocaleString("pt-BR")} ×
          ${plano.altura.toLocaleString("pt-BR")} px, que dão
          <strong class="text-tinta">${Math.round(plano.dpiQueDa)} dpi</strong> nessa largura —
          e trabalho desse tamanho é visto de longe.
        </p>` : plano.jaBasta ? `
        <p class="m-0 border-t border-linha px-3 py-2 text-[10px] leading-relaxed text-tinta-apagada">
          Esta imagem <strong class="text-tinta">já tem tamanho de sobra</strong> para imprimir a
          ${item.larguraCm.toLocaleString("pt-BR")} cm. Passar a rede aqui não vai aumentar nada —
          serve só para limpar ruído e marca de JPEG, e leva o mesmo tempo de uma amplia&ccedil;&atilde;o.
        </p>` : plano.demorado ? `
        <p class="m-0 border-t border-linha px-3 py-2 text-[10px] text-tinta-apagada">
          São ${plano.ladrilhos.toLocaleString("pt-BR")} pedaços para a rede processar: pode levar
          vários minutos. Dá para cancelar no meio.
        </p>` : ""}
    </article>`;
  }).join("");

  // O `innerHTML` acima jogou fora os canvas antigos junto com o que estava
  // desenhado neles. Repor tem que ser aqui, e não em cada lugar que chama o
  // render, senão um dia alguém acrescenta uma chamada e a lupa fica preta.
  redesenharLupas();
}

/** Depois de refazer o HTML, as janelas da lupa voltam vazias: redesenha. */
function redesenharLupas() {
  imagemEstado.itens.forEach((item) => {
    if (item.depois && item.rede) desenharLupa(item);
  });
}

// ==================== OS CLIQUES ====================

if (imagemLista) {
  imagemLista.addEventListener("click", async (evento) => {
    const alvo = evento.target.closest("button");
    if (!alvo) return;

    if (alvo.dataset.cancelar) { cancelarAmpliacao(); return; }

    const achar = (id) => imagemEstado.itens.find((i) => i.id === Number(id));

    if (alvo.dataset.tirar) {
      imagemEstado.itens = imagemEstado.itens.filter((i) => i.id !== Number(alvo.dataset.tirar));
      renderImagem();
      return;
    }
    if (alvo.dataset.baixar) { baixar(achar(alvo.dataset.baixar)); return; }
    if (alvo.dataset.limpo) {
      const item = achar(alvo.dataset.limpo);
      // Sem rede não há dose nem comparação: os dois lados seriam iguais.
      item.limpo = ampliarLimpo(item.antes);
      item.rede = null;
      item.depois = item.limpo;
      item.ehProva = false;
      item.comoFoi = "limpo";
      item.ondeRodou = null;
      item.telas = null;
      renderImagem();
      return;
    }
    if (alvo.dataset.prova) {
      if (imagemEstado.trabalhando !== null) return;
      await ampliarComRede(achar(alvo.dataset.prova), true);
      return;
    }
    if (alvo.dataset.rede) {
      if (imagemEstado.trabalhando !== null) return;
      await ampliarComRede(achar(alvo.dataset.rede), false);
    }
  });

  imagemLista.addEventListener("input", (evento) => {
    const barra = evento.target.closest("[data-dose]");
    if (barra) {
      const item = imagemEstado.itens.find((i) => i.id === Number(barra.dataset.dose));
      if (!item) return;
      item.dose = Number(barra.value);
      aplicarDose(item);
      desenharLupa(item);
      // Só o rótulo muda; refazer a tela inteira aqui perderia o arrasto da
      // barra no meio do movimento.
      const artigo = barra.closest("article");
      const numero = barra.parentElement.querySelector("strong");
      if (numero) numero.textContent = item.dose + "%";
      const legenda = artigo.querySelector("[data-lupa-depois]")
        ?.closest("figure")?.querySelector("figcaption");
      if (legenda) legenda.textContent = `com a rede, ${item.dose}%`;
      return;
    }

    const campo = evento.target.closest("[data-cm]");
    if (!campo) return;
    const item = imagemEstado.itens.find((i) => i.id === Number(campo.dataset.cm));
    if (!item) return;
    item.larguraCm = Math.max(0, Number(campo.value) || 0);
    // Só as linhas de dpi mudam, e refazer a tela inteira aqui tiraria o foco
    // do campo a cada tecla digitada.
    const artigo = campo.closest("article");
    const caixa = artigo.querySelector(".grid.gap-1");
    if (caixa) {
      caixa.innerHTML = linhaDoDpi(item, item.antes, "hoje")
        + (item.depois ? linhaDoDpi(item, item.depois, "depois") : "");
    }
  });
}

/**
 * Arrastar qualquer uma das duas janelas anda com as DUAS.
 *
 * Comparar exige que os dois lados mostrem o mesmo ponto; janelas que andam
 * separadas transformariam a comparação num quebra-cabeça.
 */
if (imagemLista) {
  let arrastando = null;

  imagemLista.addEventListener("pointerdown", (evento) => {
    const tela = evento.target.closest("[data-lupa-antes], [data-lupa-depois]");
    if (!tela) return;
    const caixa = tela.closest("[data-lupa]");
    const item = imagemEstado.itens.find((i) => i.id === Number(caixa.dataset.lupa));
    if (!item || !item.depois) return;

    // O canvas é desenhado em LUPA_LARGURA mas exibido esticado pelo CSS: sem
    // esta razão, arrastar um centímetro andaria menos do que um centímetro.
    const razao = tela.width / tela.getBoundingClientRect().width;
    arrastando = { item, x: evento.clientX, y: evento.clientY, razao };
    tela.setPointerCapture(evento.pointerId);
    evento.preventDefault();
  });

  imagemLista.addEventListener("pointermove", (evento) => {
    if (!arrastando) return;
    const { item, razao } = arrastando;
    item.vista.x -= (evento.clientX - arrastando.x) * razao;
    item.vista.y -= (evento.clientY - arrastando.y) * razao;
    arrastando.x = evento.clientX;
    arrastando.y = evento.clientY;
    desenharLupa(item);
  });

  // No WINDOW, e não na lista: se o dedo levanta fora dela — e levanta, porque
  // arrastar leva o ponteiro para longe — o "soltou" nunca chegaria, e o
  // arrasto ficaria grudado. Depois disso, mexer em qualquer outra coisa da
  // tela arrastaria a imagem junto. Foi assim que a barra de dose parou de
  // responder no primeiro teste.
  const soltar = () => { arrastando = null; };
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
}

if (imagemEntrada) {
  imagemEntrada.addEventListener("change", () => {
    receberArquivos([...imagemEntrada.files]);
    imagemEntrada.value = "";
  });
}

if (imagemSolta) {
  ["dragenter", "dragover"].forEach((nome) => {
    imagemSolta.addEventListener(nome, (e) => {
      e.preventDefault();
      imagemSolta.classList.add("arrastando");
    });
  });
  ["dragleave", "drop"].forEach((nome) => {
    imagemSolta.addEventListener(nome, (e) => {
      e.preventDefault();
      imagemSolta.classList.remove("arrastando");
    });
  });
  imagemSolta.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files) receberArquivos([...e.dataTransfer.files]);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (imagemLista) renderImagem();
});
