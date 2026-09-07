/**
 * ===========================================================================
 * A REDE QUE AMPLIA, FORA DA THREAD DA TELA
 * ===========================================================================
 *
 * Aqui roda o `realesr-general-x4v3`, a versão compact do Real-ESRGAN: 4,7 MB
 * de pesos que reconstroem detalhe plausível em vez de só esticar o pixel.
 *
 * POR QUE EM WORKER, E COM MÓDULO
 * -------------------------------
 * Uma imagem de 1500 × 1500 leva perto de um minuto nesta máquina. Na thread
 * da tela isso não seria lentidão, seria a página morta: nem barra de
 * progresso, nem botão de cancelar, nem rolagem. É `type: "module"` porque o
 * onnxruntime só publica ESM — daí `import` em vez do `importScripts` que os
 * outros workers da casa usam.
 *
 * O LADRILHO É OBRIGATÓRIO, NÃO É ESCOLHA
 * ---------------------------------------
 * Este modelo foi exportado com entrada FIXA de 128 × 128 (conferido no
 * arquivo: `image float32 [1, 3, 128, 128]`). Não dá para passar a imagem
 * inteira nem escolher o tamanho do pedaço: ou se manda 128 × 128, ou o
 * runtime recusa. Então a imagem é cortada em ladrilhos, cada um vira
 * 512 × 512, e os pedaços são remontados.
 *
 * E A EMENDA ENTRE ELES
 * ---------------------
 * Convolução não sabe o que existe fora do pedaço que recebeu, então a borda
 * de cada ladrilho sai diferente do miolo — e ladrilho colado em ladrilho
 * deixa uma grade visível na imagem final. A saída é dar a cada ladrilho uma
 * MARGEM que depois se joga fora: entram 128 px, aproveitam-se os 112 do meio,
 * e os 8 de cada lado servem só para a conta da borda ter contexto. Os
 * ladrilhos avançam de 112 em 112, então o que se descarta de um é justamente
 * o que o vizinho cobre com miolo.
 *
 * A REDE AMPLIA 4x, MAS QUASE NUNCA É 4x QUE SE QUER
 * --------------------------------------------------
 * O modelo só sabe multiplicar por quatro. O que a gráfica precisa, porém, sai
 * do tamanho de impressão: uma foto que vai para 30 cm precisa de 3543 px de
 * largura, e nem um a mais — pixel além disso não vira tinta, vira espera.
 *
 * Então a escala pedida chega por parâmetro, e cada ladrilho é DESENHADO já no
 * tamanho final, em vez de a imagem inteira ser montada em 4x e reduzida no
 * fim. Isso não é detalhe de implementação: montar 4x de uma foto de celular
 * de 12 MP daria 192 megapixels, 768 MB de memória — e era exatamente por isso
 * que a tela travava o botão em imagem grande, em vez de fazer o que dava.
 *
 * A REDE MEXE NA COR, E ISSO É CORRIGIDO AQUI
 * -------------------------------------------
 * Medido com manchas de cor conhecida, ampliadas 4x e conferidas no miolo:
 *
 *   quase branco  245 -> 254   (+9)
 *   cinza médio   128 -> 131   (+3)
 *   quase preto    12 ->   8   (-4)
 *
 * Ela estica o contraste — empurra o claro para o branco e o escuro para o
 * preto — e ainda clareia tudo um pouco. Não é canal trocado nem erro de
 * faixa: é a rede fazendo o que aprendeu, e some no meio do caminho o detalhe
 * de quem já estava perto do branco.
 *
 * A CORREÇÃO é separar o que a rede faz bem do que ela faz mal. O que ela faz
 * bem é detalhe fino; o que ela estraga é tom e cor, que são informação GROSSA
 * e já estavam certos no original. Então:
 *
 *   1. reduz o resultado da rede ao tamanho do original e amplia de volta —
 *      sobra só a parte grossa dele, sem detalhe nenhum;
 *   2. faz o mesmo caminho com o original, por amplia&ccedil;&atilde;o limpa;
 *   3. troca uma parte grossa pela outra, mantendo a fina.
 *
 * O resultado tem o detalhe que a rede inventou e o tom que o arquivo tinha.
 *
 * A AMPLIAÇÃO LIMPA VOLTA JUNTO, e não por economia: é ela que a tela usa como
 * o outro extremo da dose. Misturar as duas na tela é instantâneo; refazer a
 * rede a cada mexida na barra levaria minutos.
 *
 * O QUE ELE NÃO FAZ
 * -----------------
 * Não decide se vale a pena ampliar — quem decide é a tela, com o tamanho de
 * impressão na mão. Uma rede que inventa detalhe numa imagem que já estava boa
 * só troca pixel bom por pixel imaginado.
 */

const CAMINHO_ORT = "/ia/ort.webgpu.bundle.min.mjs";

/**
 * Os dois modelos, e o que cada um exige.
 *
 * Os dois ampliam 4x e foram exportados com entrada FIXA — não dá para
 * escolher o tamanho do pedaço, cada um só aceita o dele. A margem é
 * proporcional: é a borda de cada ladrilho que se joga fora depois de servir
 * de contexto para a conta.
 */
const MODELOS = {
  rapido: { arquivo: "realesr-general-x4v3.onnx", lado: 128, margem: 8 },
  capricho: { arquivo: "realplksr-x4.onnx", lado: 256, margem: 16 },
};

/** Quanto os modelos ampliam. Sai dos próprios arquivos; a constante é o nome. */
const ESCALA = 4;

let modeloAtual = "rapido";
let LADO = MODELOS.rapido.lado;
let MARGEM = MODELOS.rapido.margem;
let PASSO = LADO - MARGEM * 2;

/** Um canvas com esses pixels dentro, para o `drawImage` poder redimensionar. */
function telaCom(pixels, largura, altura) {
  const tela = new OffscreenCanvas(largura, altura);
  tela.getContext("2d").putImageData(
    new ImageData(new Uint8ClampedArray(pixels), largura, altura), 0, 0);
  return tela;
}

/** Redesenha uma fonte qualquer noutro tamanho, com a melhor reamostragem. */
function redimensionar(fonte, largura, altura) {
  const tela = new OffscreenCanvas(largura, altura);
  const pincel = tela.getContext("2d", { willReadFrequently: true });
  pincel.imageSmoothingEnabled = true;
  pincel.imageSmoothingQuality = "high";
  pincel.drawImage(fonte, 0, 0, largura, altura);
  return tela;
}

let ort = null;
let sessao = null;
let ondeRodou = null;   // "webgpu" ou "cpu", para a tela poder avisar
let cancelado = false;

/**
 * Liga o runtime e carrega o modelo. Uma vez por worker.
 *
 * Tenta a GPU e cai para a CPU. A diferença não é de detalhe, é de paciência:
 * medido nesta máquina, 366 ms por ladrilho na GPU contra 2222 ms na CPU — a
 * mesma imagem em um minuto ou em seis.
 */
async function ligar(avisar, qual) {
  const escolhido = MODELOS[qual] ? qual : "rapido";
  if (sessao && escolhido === modeloAtual) return;

  if (sessao) {                     // trocou de modelo: a sessão antiga não serve
    try { await sessao.release(); } catch (erro) { /* já foi */ }
    sessao = null;
  }
  modeloAtual = escolhido;
  LADO = MODELOS[escolhido].lado;
  MARGEM = MODELOS[escolhido].margem;
  PASSO = LADO - MARGEM * 2;

  if (!ort) {
    avisar({ etapa: "runtime" });
    ort = await import(CAMINHO_ORT);
    ort.env.wasm.wasmPaths = "/ia/";
    ort.env.logLevel = "error";
  }

  const tentativas = [];
  if (typeof navigator !== "undefined" && navigator.gpu) tentativas.push("webgpu");
  tentativas.push("wasm");

  let ultimoErro = null;
  for (const provedor of tentativas) {
    try {
      avisar({ etapa: "modelo", provedor });
      sessao = await ort.InferenceSession.create("/ia/" + MODELOS[escolhido].arquivo, {
        executionProviders: [provedor],
        graphOptimizationLevel: "all",
      });
      ondeRodou = provedor === "webgpu" ? "webgpu" : "cpu";
      return;
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw new Error("Não consegui ligar a rede neural: "
    + String((ultimoErro && ultimoErro.message) || ultimoErro));
}

/**
 * Recorta um ladrilho da origem, já no formato que o modelo quer.
 *
 * O modelo lê os canais separados (todos os vermelhos, depois todos os verdes,
 * depois os azuis) e em 0..1, enquanto o canvas entrega os quatro canais
 * intercalados em 0..255. A conversão é aqui.
 *
 * Fora da imagem, REPETE a borda em vez de preencher com preto: preto inventa
 * um contraste que não existe, e a rede desenha um contorno escuro em volta da
 * imagem inteira por causa dele.
 */
function recortar(origem, largura, altura, x0, y0, destino) {
  const porCanal = LADO * LADO;
  for (let y = 0; y < LADO; y++) {
    const sy = Math.min(altura - 1, Math.max(0, y0 + y));
    for (let x = 0; x < LADO; x++) {
      const sx = Math.min(largura - 1, Math.max(0, x0 + x));
      const de = (sy * largura + sx) * 4;
      const para = y * LADO + x;
      destino[para] = origem[de] / 255;
      destino[porCanal + para] = origem[de + 1] / 255;
      destino[porCanal * 2 + para] = origem[de + 2] / 255;
    }
  }
}

/**
 * O miolo de um ladrilho ampliado, como ImageData pronto para desenhar.
 *
 * `saida` vem em 0..1 e escapa um pouco dos dois lados (medido: -0,07 a 1,13),
 * porque a última camada não tem nada que a prenda na faixa. Cortar é o certo:
 * o que passou de 1 é branco, o que ficou abaixo de 0 é preto.
 *
 * Sai opaco. A transparência é reposta no fim, de uma vez — ver `reporAlfa`.
 */
function miolo(saida) {
  const L = LADO * ESCALA;
  const porCanal = L * L;
  const recorte = MARGEM * ESCALA;
  const util = PASSO * ESCALA;

  const pedaco = new ImageData(util, util);
  const d = pedaco.data;
  for (let y = 0; y < util; y++) {
    const sy = recorte + y;
    for (let x = 0; x < util; x++) {
      const de = sy * L + recorte + x;
      const para = (y * util + x) * 4;
      d[para] = Math.max(0, Math.min(255, Math.round(saida[de] * 255)));
      d[para + 1] = Math.max(0, Math.min(255, Math.round(saida[porCanal + de] * 255)));
      d[para + 2] = Math.max(0, Math.min(255, Math.round(saida[porCanal * 2 + de] * 255)));
      d[para + 3] = 255;
    }
  }
  return pedaco;
}

/**
 * Devolve a transparência do original à imagem pronta.
 *
 * O modelo tem três canais e não sabe da transparência; passá-la por ele
 * inventaria borda onde havia recorte limpo. Ela volta pelo vizinho mais
 * próximo, que num canal quase sempre binário é o que se quer.
 *
 * Se a imagem era toda opaca, não há o que repor — e é o caso comum, então
 * vale conferir antes de varrer tudo.
 */
function reporAlfa(destino, largura, altura, origem, larguraOrigem, alturaOrigem) {
  let temFuro = false;
  for (let i = 3; i < origem.length; i += 4) {
    if (origem[i] !== 255) { temFuro = true; break; }
  }
  if (!temFuro) return;

  for (let y = 0; y < altura; y++) {
    const oy = Math.min(alturaOrigem - 1, Math.floor((y / altura) * alturaOrigem));
    for (let x = 0; x < largura; x++) {
      const ox = Math.min(larguraOrigem - 1, Math.floor((x / largura) * larguraOrigem));
      destino[(y * largura + x) * 4 + 3] = origem[(oy * larguraOrigem + ox) * 4 + 3];
    }
  }
}

/**
 * Amplia a imagem inteira, ladrilho por ladrilho, avisando o andamento.
 *
 * `escala` é o que se QUER, entre 1 e 4. A rede entrega sempre 4x; o ajuste
 * acontece no desenho de cada pedaço, e por isso a memória segue o tamanho
 * final e não o de 4x.
 */
async function ampliar(pixels, largura, altura, escala, avisar, modelo) {
  await ligar(avisar, modelo);

  const saidaLargura = Math.max(1, Math.round(largura * escala));
  const saidaAltura = Math.max(1, Math.round(altura * escala));

  const tela = new OffscreenCanvas(saidaLargura, saidaAltura);
  const pincel = tela.getContext("2d", { willReadFrequently: true });
  pincel.imageSmoothingEnabled = true;
  pincel.imageSmoothingQuality = "high";

  // Um canvas do tamanho de UM ladrilho, reaproveitado: `drawImage` sabe
  // reduzir, `putImageData` não — ele ignora escala e recorte.
  const util = PASSO * ESCALA;
  const telaDoPedaco = new OffscreenCanvas(util, util);
  const pincelDoPedaco = telaDoPedaco.getContext("2d");

  const colunas = Math.ceil(largura / PASSO);
  const linhas = Math.ceil(altura / PASSO);
  const total = colunas * linhas;

  const entrada = new Float32Array(3 * LADO * LADO);
  const nome = sessao.inputNames[0];
  const nomeSaida = sessao.outputNames[0];

  let feitos = 0;
  const comecou = performance.now();

  for (let ly = 0; ly < linhas; ly++) {
    for (let lx = 0; lx < colunas; lx++) {
      if (cancelado) throw new Error("cancelado");

      // O ladrilho começa uma margem ANTES do pedaço que ele entrega.
      const x0 = lx * PASSO - MARGEM;
      const y0 = ly * PASSO - MARGEM;

      recortar(pixels, largura, altura, x0, y0, entrada);

      const t = new ort.Tensor("float32", entrada, [1, 3, LADO, LADO]);
      const r = await sessao.run({ [nome]: t });

      pincelDoPedaco.putImageData(miolo(r[nomeSaida].data), 0, 0);

      // Quanto DESTE ladrilho é imagem de verdade: o último de cada fila
      // costuma sobrar para fora, e a sobra não pode ser desenhada.
      const usoX = Math.min(largura, (lx + 1) * PASSO) - lx * PASSO;
      const usoY = Math.min(altura, (ly + 1) * PASSO) - ly * PASSO;

      // O destino sai de coordenadas ABSOLUTAS arredondadas, e não de uma
      // largura por ladrilho: com escala quebrada, arredondar cada largura
      // sozinha deixaria fresta de um pixel entre um pedaço e o vizinho.
      // Assim o fim de um é exatamente o começo do outro.
      const ex = Math.round(lx * PASSO * escala);
      const ey = Math.round(ly * PASSO * escala);
      const larguraNoDestino = Math.round((lx * PASSO + usoX) * escala) - ex;
      const alturaNoDestino = Math.round((ly * PASSO + usoY) * escala) - ey;

      if (usoX > 0 && usoY > 0 && larguraNoDestino > 0 && alturaNoDestino > 0) {
        pincel.drawImage(telaDoPedaco,
          0, 0, usoX * ESCALA, usoY * ESCALA,
          ex, ey, larguraNoDestino, alturaNoDestino);
      }

      feitos++;
      // O tempo que falta sai do ritmo medido, e não de uma conta feita antes:
      // a primeira leva de ladrilhos paga a compilação dos shaders, e um
      // palpite dado no começo erraria justamente onde a pessoa está olhando.
      const decorrido = performance.now() - comecou;
      avisar({
        etapa: "ampliando",
        feitos,
        total,
        restaMs: Math.round((decorrido / feitos) * (total - feitos)),
      });
    }
  }

  avisar({ etapa: "acertando" });

  const pronto = pincel.getImageData(0, 0, saidaLargura, saidaAltura);

  // A ampliação limpa do original: referência de cor, e o outro extremo da dose.
  const telaDaFonte = telaCom(pixels, largura, altura);
  const limpo = redimensionar(telaDaFonte, saidaLargura, saidaAltura)
    .getContext("2d").getImageData(0, 0, saidaLargura, saidaAltura);

  // A parte GROSSA do que a rede fez: reduzida ao tamanho do original e
  // ampliada de volta, o detalhe fino se perde e sobra só o tom.
  const grossoDaRede = redimensionar(
    redimensionar(tela, largura, altura), saidaLargura, saidaAltura)
    .getContext("2d").getImageData(0, 0, saidaLargura, saidaAltura);

  // Troca o tom da rede pelo tom do arquivo, e o detalhe fica.
  const r = pronto.data;
  const l = limpo.data;
  const gr = grossoDaRede.data;
  for (let i = 0; i < r.length; i += 4) {
    r[i] = Math.max(0, Math.min(255, r[i] + l[i] - gr[i]));
    r[i + 1] = Math.max(0, Math.min(255, r[i + 1] + l[i + 1] - gr[i + 1]));
    r[i + 2] = Math.max(0, Math.min(255, r[i + 2] + l[i + 2] - gr[i + 2]));
  }

  reporAlfa(r, saidaLargura, saidaAltura, pixels, largura, altura);
  reporAlfa(l, saidaLargura, saidaAltura, pixels, largura, altura);

  return {
    pixels: r,
    limpo: l,
    largura: saidaLargura,
    altura: saidaAltura,
    ondeRodou,
    modelo: modeloAtual,
  };
}

self.onmessage = async (evento) => {
  const { id, tipo, pixels, largura, altura, escala, modelo } = evento.data;

  if (tipo === "cancelar") { cancelado = true; return; }

  cancelado = false;
  const avisar = (dados) => self.postMessage({ id, andamento: dados });

  try {
    const r = await ampliar(new Uint8ClampedArray(pixels), largura, altura,
                            Math.min(ESCALA, Math.max(1, escala || ESCALA)), avisar, modelo);
    self.postMessage({ id, resultado: r }, [r.pixels.buffer, r.limpo.buffer]);
  } catch (erro) {
    const mensagem = String((erro && erro.message) || erro);
    self.postMessage({ id, erro: mensagem, cancelado: mensagem === "cancelado" });
  }
};
