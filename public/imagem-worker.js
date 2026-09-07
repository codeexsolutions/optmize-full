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
 * O QUE ELE NÃO FAZ
 * -----------------
 * Não decide se vale a pena ampliar — quem decide é a tela, com o tamanho de
 * impressão na mão. Uma rede que inventa detalhe numa imagem que já estava boa
 * só troca pixel bom por pixel imaginado.
 */

const CAMINHO_ORT = "/ia/ort.webgpu.bundle.min.mjs";
const CAMINHO_MODELO = "/ia/realesr-general-x4v3.onnx";

/** Quanto o modelo amplia. Sai do próprio arquivo; a constante é só o nome. */
const ESCALA = 4;

/** Entrada exigida pelo modelo, e a margem que se descarta de cada lado. */
const LADO = 128;
const MARGEM = 8;
const PASSO = LADO - MARGEM * 2;   // 112: o que cada ladrilho realmente entrega

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
async function ligar(avisar) {
  if (sessao) return;

  avisar({ etapa: "runtime" });
  ort = await import(CAMINHO_ORT);
  ort.env.wasm.wasmPaths = "/ia/";
  ort.env.logLevel = "error";

  const tentativas = [];
  if (typeof navigator !== "undefined" && navigator.gpu) tentativas.push("webgpu");
  tentativas.push("wasm");

  let ultimoErro = null;
  for (const provedor of tentativas) {
    try {
      avisar({ etapa: "modelo", provedor });
      sessao = await ort.InferenceSession.create(CAMINHO_MODELO, {
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
 * Escreve o miolo de um ladrilho ampliado na imagem final.
 *
 * `saida` vem em 0..1 e escapa um pouco dos dois lados (medido: -0,07 a 1,13),
 * porque a última camada não tem nada que a prenda na faixa. Cortar é o certo:
 * o que passou de 1 é branco, o que ficou abaixo de 0 é preto.
 *
 * A opacidade vem da origem sem passar pela rede. O modelo tem três canais e
 * não sabe da transparência; esticá-la junto seria inventar borda onde havia
 * recorte limpo, então ela é ampliada pelo vizinho mais próximo — que num
 * canal binário é exatamente o que se quer.
 */
function colar(saida, destino, largura, altura, origem, larguraOrigem, alturaOrigem, x0, y0) {
  const L = LADO * ESCALA;
  const porCanal = L * L;
  const recorte = MARGEM * ESCALA;
  const util = PASSO * ESCALA;

  const dx = (x0 + MARGEM) * ESCALA;
  const dy = (y0 + MARGEM) * ESCALA;

  for (let y = 0; y < util; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= altura) continue;
    const sy = recorte + y;
    for (let x = 0; x < util; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= largura) continue;
      const de = sy * L + recorte + x;
      const para = (ty * largura + tx) * 4;

      destino[para] = Math.max(0, Math.min(255, Math.round(saida[de] * 255)));
      destino[para + 1] = Math.max(0, Math.min(255, Math.round(saida[porCanal + de] * 255)));
      destino[para + 2] = Math.max(0, Math.min(255, Math.round(saida[porCanal * 2 + de] * 255)));

      const ox = Math.min(larguraOrigem - 1, Math.floor(tx / ESCALA));
      const oy = Math.min(alturaOrigem - 1, Math.floor(ty / ESCALA));
      destino[para + 3] = origem[(oy * larguraOrigem + ox) * 4 + 3];
    }
  }
}

/** Amplia a imagem inteira, ladrilho por ladrilho, avisando o andamento. */
async function ampliar(pixels, largura, altura, avisar) {
  await ligar(avisar);

  const saidaLargura = largura * ESCALA;
  const saidaAltura = altura * ESCALA;
  const destino = new Uint8ClampedArray(saidaLargura * saidaAltura * 4);

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

      colar(r[nomeSaida].data, destino, saidaLargura, saidaAltura,
            pixels, largura, altura, x0, y0);

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

  return { pixels: destino, largura: saidaLargura, altura: saidaAltura, ondeRodou };
}

self.onmessage = async (evento) => {
  const { id, tipo, pixels, largura, altura } = evento.data;

  if (tipo === "cancelar") { cancelado = true; return; }

  cancelado = false;
  const avisar = (dados) => self.postMessage({ id, andamento: dados });

  try {
    const r = await ampliar(new Uint8ClampedArray(pixels), largura, altura, avisar);
    self.postMessage({ id, resultado: r }, [r.pixels.buffer]);
  } catch (erro) {
    const mensagem = String((erro && erro.message) || erro);
    self.postMessage({ id, erro: mensagem, cancelado: mensagem === "cancelado" });
  }
};
