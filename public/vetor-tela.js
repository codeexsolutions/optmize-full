/**
 * A tela do gerador de vetor.
 *
 * Aqui só tem tela: escolher o arquivo, mexer nos controles, mostrar as duas
 * imagens lado a lado e baixar. Quem faz a conta é o `vetor.js`, do mesmo jeito
 * que a tela de Encaixe não sabe encaixar e o `encaixe-motor.js` não sabe
 * desenhar — e a conta em si roda no `vetor-worker.js`, fora daqui, para a
 * página não travar enquanto ela acontece.
 */

const vetorEntrada = document.getElementById("vetor-arquivo");
const vetorSolta = document.getElementById("vetor-solta");
const vetorPainel = document.getElementById("vetor-painel");
const vetorOriginal = document.getElementById("vetor-original");
const vetorSaida = document.getElementById("vetor-saida");
const vetorResumo = document.getElementById("vetor-resumo");
const vetorErro = document.getElementById("vetor-erro");
const vetorCores = document.getElementById("vetor-cores");
const vetorCoresValor = document.getElementById("vetor-cores-valor");
const vetorDetalhe = document.getElementById("vetor-detalhe");
const vetorSuavidade = document.getElementById("vetor-suavidade");
const vetorQuina = document.getElementById("vetor-quina");
const vetorTirarFundo = document.getElementById("vetor-tirar-fundo");
const vetorSombras = document.getElementById("vetor-sombras");
const vetorSombrasValor = document.getElementById("vetor-sombras-valor");
const vetorRedondas = document.getElementById("vetor-redondas");
const vetorSubpixel = document.getElementById("vetor-subpixel");
const vetorTensao = document.getElementById("vetor-tensao");
const vetorTensaoValor = document.getElementById("vetor-tensao-valor");
const vetorCamadas = document.getElementById("vetor-camadas");
const vetorZoom = document.getElementById("vetor-zoom");
const vetorZoomValor = document.getElementById("vetor-zoom-valor");
const vetorCopiado = document.getElementById("vetor-copiado");
const btnVetorInteiro = document.getElementById("btn-vetor-inteiro");
const btnVetorBaixar = document.getElementById("btn-vetor-baixar");
const btnVetorCopiar = document.getElementById("btn-vetor-copiar");
const btnVetorGerar = document.getElementById("btn-vetor-gerar");

// A imagem carregada e o resultado da última geração.
let vetorImagem = null;   // { img, nome, ppcmArquivo }
let vetorResultado = null;

/**
 * Acima disto a imagem é reduzida antes de virar vetor.
 *
 * Não é economia de memória: é qualidade. Numa foto de 5000 pontos de largura,
 * cada fiapo de compressão do JPG vira um contorno, e o desenho sai com
 * milhares de caminhos que ninguém enxerga e que travam a faca de corte. Em
 * 1800 pontos o desenho ainda tem toda a forma e o traço sai limpo.
 */
const VETOR_LADO_MAXIMO = 1800;

function vetorMostrarErro(texto) {
  if (!vetorErro) return;
  vetorErro.textContent = texto || "";
  vetorErro.classList.toggle("hidden", !texto);
}

/**
 * Os pixels da imagem, já reduzidos ao tamanho de trabalho do Vetor.
 *
 * O nome é `pixelsDoVetor`, e não `pixelsDaImagem`, porque a tela de Encaixe
 * tem uma função com esse nome e as duas fazem coisas diferentes: esta REDUZ
 * para 1800 px (o vetorizador não precisa de mais que isso), a do Encaixe lê no
 * tamanho original. Como os dois arquivos são <script> comuns, os nomes moram
 * no mesmo lugar e este arquivo carrega depois — a versão do Vetor apagava a do
 * Encaixe e o encaixe passava a medir a arte reduzida. Uma camiseta de 5824 px
 * a 300 dpi virava 15,2 cm no lugar de 49,3 cm.
 */
function pixelsDoVetor(img, tirarFundo) {
  const fator = Math.min(1, VETOR_LADO_MAXIMO / Math.max(img.width, img.height));
  const largura = Math.max(1, Math.round(img.width * fator));
  const altura = Math.max(1, Math.round(img.height * fator));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, largura, altura);
  const dados = ctx.getImageData(0, 0, largura, altura);

  // O fundo é tirado com a mesma conta da tela de Encaixe: quem decide se
  // existe fundo é a borda inteira, e não quatro pixels dos cantos.
  let fundo = null;
  if (tirarFundo && typeof tirarFundoDosPixels === "function") {
    fundo = tirarFundoDosPixels(dados.data, largura, altura, true);
  }
  return { dados, largura, altura, fator, fundo };
}

// ==================== A CONTA, FORA DA TELA ====================

// `null` = ainda não foi pedido; `false` = o navegador não deixou, e aí a
// conta é feita aqui mesmo.
let vetorWorker = null;
let vetorPedido = 0;

function trabalhadorDoVetor() {
  if (vetorWorker !== null) return vetorWorker;
  try {
    vetorWorker = new Worker("vetor-worker.js");
    // Falha depois de criado — o `importScripts` não achou um arquivo, por
    // exemplo — derruba o worker de vez: daí em diante a conta volta para cá.
    vetorWorker.addEventListener("error", () => { vetorWorker = false; });
  } catch (err) {
    vetorWorker = false;
  }
  return vetorWorker;
}

/**
 * A vetorização, no worker quando dá.
 *
 * Os pixels vão **transferidos**, sem cópia — são treze megabytes numa imagem
 * no teto de 1800 pontos, e copiar isso seria repetir na thread da tela
 * justamente o trabalho que se está tirando dela. O preço é que o buffer não
 * serve mais aqui depois de mandado: quem chama, se precisar dele de novo, lê
 * os pixels outra vez.
 */
function vetorizarNoWorker(dados, opcoes) {
  const w = trabalhadorDoVetor();
  if (!w) return Promise.resolve(vetorizarImagem(dados, opcoes));

  const id = ++vetorPedido;
  return new Promise((pronto, falhou) => {
    const ouvir = (e) => {
      // Resposta de um pedido que já foi trocado por outro: descarta.
      if (!e.data || e.data.id !== id) return;
      w.removeEventListener("message", ouvir);
      if (e.data.erro) falhou(new Error(e.data.erro));
      else pronto(e.data.resultado);
    };
    w.addEventListener("message", ouvir);
    w.addEventListener("error", () => falhou(new Error("o worker do vetor caiu")), { once: true });
    w.postMessage(
      { id, pixels: dados.data.buffer, largura: dados.width, altura: dados.height, opcoes },
      [dados.data.buffer]);
  });
}

/** Roda a vetorização com o que estiver nos controles. */
async function gerarVetor() {
  if (!vetorImagem) return;
  vetorMostrarErro("");
  btnVetorGerar.disabled = true;
  const dizia = btnVetorGerar.textContent;
  btnVetorGerar.textContent = "Gerando…";

  try {
    const preparar = () => pixelsDoVetor(vetorImagem.img, vetorTirarFundo.checked);
    const { dados, largura, fator, fundo } = preparar();

    // A medida real da arte, quando o arquivo traz o dpi: o SVG sai em
    // centímetros de verdade e a plotter imprime no tamanho certo.
    const larguraCm = vetorImagem.ppcmArquivo > 0
      ? vetorImagem.img.width / vetorImagem.ppcmArquivo : null;

    const opcoes = {
      cores: Number(vetorCores.value),
      detalhe: Number(vetorDetalhe.value),
      suavidade: Number(vetorSuavidade.value),
      quina: Number(vetorQuina.value),
      juntarSombras: Number(vetorSombras.value),
      redondas: vetorRedondas.checked,
      subpixel: vetorSubpixel.checked,
      tensao: Number(vetorTensao.value),
      larguraCm,
    };

    const t0 = Date.now();
    let r;
    try {
      r = await vetorizarNoWorker(dados, opcoes);
    } catch (falha) {
      // O worker caiu: refaz aqui mesmo, lendo os pixels de novo — os
      // primeiros foram embora na transferência.
      if (vetorWorker !== false) throw falha;
      r = vetorizarImagem(preparar().dados, opcoes);
    }
    const ms = Date.now() - t0;

    if (!r.svg) {
      vetorResultado = null;
      btnVetorBaixar.disabled = true;
      if (btnVetorCopiar) btnVetorCopiar.disabled = true;
      return vetorMostrarErro(r.erro || "Não consegui vetorizar essa imagem.");
    }

    vetorResultado = r;
    vetorSaida.innerHTML = "";
    const molde = document.createElement("div");
    molde.className = "vetor-svg";
    molde.innerHTML = r.svg.replace(/<\?xml[^>]*\?>/, "");
    // O SVG guardado sai no tamanho real; o da tela tem que caber na caixa.
    const dentro = molde.querySelector("svg");
    if (dentro) { dentro.removeAttribute("width"); dentro.removeAttribute("height"); }
    vetorSaida.appendChild(molde);

    const partes = [
      `${r.camadas.length} cor${r.camadas.length === 1 ? "" : "es"}`,
      `${r.totalCaminhos} contorno${r.totalCaminhos === 1 ? "" : "s"}`,
      `${formatarNumero(r.svg.length / 1024, 0)} KB`,
      formatarSegundos(ms),
    ];
    // Quantos trechos saíram como arco de verdade, e não como curva que passa
    // perto. Vale dizer: é a diferença entre um arquivo que o CorelDRAW abre
    // com circunferências e um que ele abre com quarenta nós soltos.
    //
    // Cada comando `A` é um arco. Um círculo inteiro são dois (as duas
    // metades), um canto arredondado é um só — por isso a conta não divide
    // nada, o que já rendeu um "8.5 formas redondas" no rodapé.
    const arcos = (r.svg.match(/A/g) || []).length;
    const retas = (r.svg.match(/L/g) || []).length;
    const curvas = (r.svg.match(/C/g) || []).length;
    const feito = [];
    if (retas > 0) feito.push(`${retas} reta${retas === 1 ? "" : "s"}`);
    if (arcos > 0) feito.push(`${arcos} arco${arcos === 1 ? "" : "s"}`);
    if (curvas > 0) feito.push(`${curvas} curva${curvas === 1 ? "" : "s"}`);
    if (feito.length) partes.push(feito.join(" + "));
    if (r.larguraCm) partes.push(`${formatarNumero(r.larguraCm, 1)} × ${formatarCm(r.alturaCm)}`);
    if (fator < 1) partes.push(`trabalhado em ${largura} px de largura`);
    if (fundo) partes.push("fundo removido");
    // Pedir para tirar o fundo e não sair nada precisa aparecer. Sem isso o
    // atalho da silhueta entrega o retângulo do arquivo — uma cor só, quatro
    // retas — e não há como adivinhar por quê: quem decide se existe fundo é a
    // mesma leitura do Encaixe, e arte que sangra até a borda não tem fundo
    // para reconhecer.
    else if (vetorTirarFundo.checked) partes.push("não achei fundo para tirar");
    vetorResumo.textContent = partes.join(" · ");

    vetorCamadas.innerHTML = r.camadas.map((c) => `
      <span class="vetor-camada" title="${c.caminhos} contorno(s)">
        <i style="background:${c.cor}"></i>${c.cor}
      </span>`).join("");

    btnVetorBaixar.disabled = false;
    if (btnVetorCopiar) btnVetorCopiar.disabled = false;
  } catch (err) {
    console.error(err);
    vetorMostrarErro("Deu erro ao vetorizar: " + (err && err.message ? err.message : "erro desconhecido"));
  } finally {
    btnVetorGerar.disabled = false;
    btnVetorGerar.textContent = dizia;
  }
}

// ==================== A LUPA ====================

/**
 * Onde a lupa está: o quanto aproxima e o quanto o desenho foi arrastado, em
 * pontos da tela.
 *
 * É **um** estado para as duas prévias. Elas têm o mesmo tamanho e recebem a
 * mesma transformação, então o mesmo pedaço do desenho fica no mesmo lugar nas
 * duas — e é só assim que dá para comparar a borda de uma com a da outra sem
 * ficar procurando onde é onde. Sem aproximar, as prévias dizem se as cores
 * estão certas e mais nada; o que separa "traçado" de "vetorizado" mora na
 * borda, que naquele tamanho não se enxerga.
 */
const lupa = { escala: 1, x: 0, y: 0 };
const VETOR_ZOOM_MAXIMO = 20;

function limitarLupa() {
  const caixa = vetorSaida && vetorSaida.parentElement;
  if (!caixa) return;
  // A folga é o quanto o desenho ampliado sobra para fora da caixa: arrastar
  // além disso só traria borda vazia para dentro.
  const folgaX = Math.max(0, (caixa.clientWidth * lupa.escala - caixa.clientWidth) / 2);
  const folgaY = Math.max(0, (caixa.clientHeight * lupa.escala - caixa.clientHeight) / 2);
  lupa.x = Math.max(-folgaX, Math.min(folgaX, lupa.x));
  lupa.y = Math.max(-folgaY, Math.min(folgaY, lupa.y));
}

function aplicarLupa() {
  limitarLupa();
  const t = `translate(${lupa.x.toFixed(1)}px, ${lupa.y.toFixed(1)}px) scale(${lupa.escala})`;
  [vetorOriginal, vetorSaida].forEach((c) => {
    if (!c) return;
    c.style.transform = t;
    // De perto o pixel da imagem original tem que aparecer inteiro; de longe,
    // não — ver a regra `.vetor-caixa.perto img`.
    if (c.parentElement) c.parentElement.classList.toggle("perto", lupa.escala >= 3);
  });
  if (vetorZoomValor) {
    vetorZoomValor.textContent = formatarNumero(lupa.escala, 2).replace(/,?0+$/, "") + "×";
  }
  if (vetorZoom && Number(vetorZoom.value) !== lupa.escala) vetorZoom.value = String(lupa.escala);
}

/**
 * Aproxima para `nova`, deixando parado o ponto que está debaixo de (mx, my).
 *
 * `mx` e `my` são medidos a partir do centro da caixa, que é a origem da
 * transformação. Sem essa conta a roda do mouse aproximaria sempre o meio da
 * imagem, e quem quer olhar um canto teria que aproximar e depois procurar.
 */
function aproximarLupa(nova, mx, my) {
  nova = Math.max(1, Math.min(VETOR_ZOOM_MAXIMO, nova));
  const k = nova / lupa.escala;
  lupa.x = mx - (mx - lupa.x) * k;
  lupa.y = my - (my - lupa.y) * k;
  lupa.escala = nova;
  aplicarLupa();
}

function verInteiro() {
  lupa.escala = 1; lupa.x = 0; lupa.y = 0;
  aplicarLupa();
}

[vetorOriginal, vetorSaida].forEach((alvo) => {
  if (!alvo) return;
  const caixa = alvo.parentElement;

  caixa.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = caixa.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2;
    const my = e.clientY - r.top - r.height / 2;
    // Um passo por entalhe da roda, sempre proporcional: de 1× para 2× e de
    // 10× para 20× o gesto tem que ser o mesmo.
    aproximarLupa(lupa.escala * (e.deltaY < 0 ? 1.25 : 1 / 1.25), mx, my);
  }, { passive: false });

  let arrastando = null;
  caixa.addEventListener("pointerdown", (e) => {
    if (lupa.escala <= 1) return;
    arrastando = { x: e.clientX - lupa.x, y: e.clientY - lupa.y };
    alvo.classList.add("arrastando");
    caixa.setPointerCapture(e.pointerId);
  });
  caixa.addEventListener("pointermove", (e) => {
    if (!arrastando) return;
    lupa.x = e.clientX - arrastando.x;
    lupa.y = e.clientY - arrastando.y;
    aplicarLupa();
  });
  const soltar = (e) => {
    if (!arrastando) return;
    arrastando = null;
    alvo.classList.remove("arrastando");
    if (caixa.hasPointerCapture(e.pointerId)) caixa.releasePointerCapture(e.pointerId);
  };
  caixa.addEventListener("pointerup", soltar);
  caixa.addEventListener("pointercancel", soltar);
  caixa.addEventListener("dblclick", verInteiro);
});

if (vetorZoom) {
  vetorZoom.addEventListener("input", () => aproximarLupa(Number(vetorZoom.value), 0, 0));
}
if (btnVetorInteiro) btnVetorInteiro.addEventListener("click", verInteiro);

// ==================== OS ATALHOS ====================

/**
 * Ajustes prontos para os trabalhos que aparecem.
 *
 * Seis controles em fila são muitos para quem só quer o logo do cliente
 * vetorizado. Cada atalho é um ponto de partida tirado da bancada, não um
 * palpite — e continua sendo ponto de partida: depois de clicar, mexer em
 * qualquer controle refaz o desenho como sempre.
 */
const VETOR_JEITOS = {
  // Logo, escudo, letra, arte de cor chapada: é onde o vetor sai praticamente
  // igual ao original. Oito cores bastam, e passar disso não melhora — medido.
  chapada: { cores: 8, detalhe: 12, suavidade: 1.2, quina: 55, sombras: 0, tensao: 1, fundo: false },
  // Faca de corte: uma cor só, e a mancha pequena some. O que interessa é a
  // silhueta de fora, não o desenho de dentro.
  //
  // O fundo **tem** que sair junto, e isso custou uma volta: numa arte de fundo
  // branco, uma cor só é a imagem inteira — o desenho sai como o retângulo do
  // arquivo, quatro retas e nada dentro. Tirando o fundo, a única cor que sobra
  // é o desenho, e a silhueta é a dele.
  silhueta: { cores: 1, detalhe: 60, suavidade: 1.6, quina: 55, sombras: 0, tensao: 1, fundo: true },
  // Sombreado e degradê: junta o claro e o escuro da mesma cor, senão a paleta
  // gasta os lugares dela em faixas de sombra e a bola sai listrada.
  sombra: { cores: 16, detalhe: 12, suavidade: 1.2, quina: 55, sombras: 40, tensao: 1, fundo: false },
  // Quando a borda tem que ficar exata. Custa nós e arquivo, e desde que o
  // arco parou de escorregar perto de meia volta é aqui que o erro é o menor.
  fino: { cores: 12, detalhe: 4, suavidade: 0.4, quina: 45, sombras: 0, tensao: 1, fundo: false },
};

document.querySelectorAll("[data-vetor-jeito]").forEach((botao) => {
  botao.addEventListener("click", () => {
    const jeito = VETOR_JEITOS[botao.dataset.vetorJeito];
    if (!jeito) return;
    vetorCores.value = jeito.cores;
    vetorDetalhe.value = jeito.detalhe;
    vetorSuavidade.value = jeito.suavidade;
    vetorQuina.value = jeito.quina;
    vetorSombras.value = jeito.sombras;
    vetorTensao.value = jeito.tensao;
    // O atalho diz o ajuste inteiro, inclusive o fundo: é ponto de partida, e
    // ponto de partida que deixa metade das coisas como estavam não é ponto de
    // partida nenhum.
    vetorTirarFundo.checked = jeito.fundo;
    if (vetorCoresValor) vetorCoresValor.textContent = jeito.cores;
    if (vetorSombrasValor) vetorSombrasValor.textContent = jeito.sombras;
    if (vetorTensaoValor) vetorTensaoValor.textContent = jeito.tensao;
    gerarVetor();
  });
});

// ==================== ABRIR E ENTREGAR ====================

/** Carrega o arquivo escolhido e já gera uma primeira versão. */
async function abrirImagemParaVetor(file) {
  vetorMostrarErro("");
  if (!file || !/^image\//.test(file.type)) {
    return vetorMostrarErro("Mande uma imagem: PNG, JPG ou WEBP.");
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ppcmArquivo = typeof pixelsPorCmDoArquivo === "function"
      ? pixelsPorCmDoArquivo(bytes) : null;
    const img = await carregarImagem(await lerComoDataURL(file));
    vetorImagem = { img, nome: file.name, ppcmArquivo };

    vetorOriginal.innerHTML = "";
    const previa = document.createElement("img");
    previa.src = img.src;
    previa.alt = file.name;
    vetorOriginal.appendChild(previa);

    vetorPainel.classList.remove("hidden");
    // Imagem nova, lupa zerada: o pedaço que interessava na anterior não tem
    // nada a ver com esta.
    verInteiro();
    await gerarVetor();
  } catch (err) {
    // O aviso na tela é para quem usa; o erro de verdade vai para o console.
    // Sem esta linha, `lerComoDataURL` ficou um bom tempo sem existir e a tela
    // só dizia "não consegui abrir essa imagem" — o ReferenceError morria aqui.
    console.error("abrirImagemParaVetor:", err);
    vetorMostrarErro(`"${file.name}": não consegui abrir essa imagem.`);
  }
}

if (vetorEntrada) {
  vetorEntrada.addEventListener("change", (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (file) abrirImagemParaVetor(file);
  });
}

if (vetorSolta) {
  ["dragenter", "dragover"].forEach((evt) => vetorSolta.addEventListener(evt, (e) => {
    e.preventDefault();
    vetorSolta.classList.add("arrastando");
  }));
  ["dragleave", "drop"].forEach((evt) => vetorSolta.addEventListener(evt, (e) => {
    e.preventDefault();
    vetorSolta.classList.remove("arrastando");
  }));
  vetorSolta.addEventListener("drop", (e) => {
    const file = (e.dataTransfer && e.dataTransfer.files || [])[0];
    if (file) abrirImagemParaVetor(file);
  });
}

// Mexer num controle regera. O número de cores é o que mais muda o resultado,
// então ele mostra o valor do lado enquanto arrasta.
[vetorCores, vetorDetalhe, vetorSuavidade, vetorQuina, vetorSombras, vetorTensao].forEach((campo) => {
  if (!campo) return;
  campo.addEventListener("input", () => {
    if (campo === vetorCores && vetorCoresValor) vetorCoresValor.textContent = campo.value;
    if (campo === vetorSombras && vetorSombrasValor) vetorSombrasValor.textContent = campo.value;
    if (campo === vetorTensao && vetorTensaoValor) vetorTensaoValor.textContent = campo.value;
  });
  campo.addEventListener("change", gerarVetor);
});
[vetorTirarFundo, vetorRedondas, vetorSubpixel].forEach((campo) => {
  if (campo) campo.addEventListener("change", gerarVetor);
});
if (btnVetorGerar) btnVetorGerar.addEventListener("click", gerarVetor);

if (btnVetorBaixar) {
  btnVetorBaixar.addEventListener("click", () => {
    if (!vetorResultado || !vetorResultado.svg) return;
    const nome = (vetorImagem && vetorImagem.nome || "vetor").replace(/\.[^.]+$/, "");
    const blob = new Blob([vetorResultado.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}

// Copiar em vez de baixar: SVG é texto, e colar direto no CorelDRAW ou no
// Illustrator poupa a viagem pela pasta de downloads.
if (btnVetorCopiar) {
  btnVetorCopiar.addEventListener("click", async () => {
    if (!vetorResultado || !vetorResultado.svg) return;
    try {
      await navigator.clipboard.writeText(vetorResultado.svg);
      if (vetorCopiado) {
        vetorCopiado.classList.remove("hidden");
        setTimeout(() => vetorCopiado.classList.add("hidden"), 1800);
      }
    } catch (err) {
      vetorMostrarErro("O navegador não deixou copiar. Use o Baixar SVG.");
    }
  });
}
