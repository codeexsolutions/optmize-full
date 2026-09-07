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

const ESCALA_DA_REDE = 4;

/** Quanto a rede aguenta antes de a espera virar castigo. */
const PIXELS_DEMAIS = 4_000_000;      // na entrada: ~2000x2000
const SAIDA_DEMAIS = 60_000_000;      // na saída: acima disso o canvas engasga

// ==================== O DIAGNÓSTICO ====================

/** Quantos dpi essa imagem dá, impressa nessa largura. */
function dpiNaLargura(pixels, centimetros) {
  if (!(centimetros > 0)) return null;
  return pixels / (centimetros / 2.54);
}

/** O recado sobre o dpi, e a cor dele. */
function vereditoDoDpi(dpi) {
  if (dpi === null) return { texto: "diga a largura de impressão", tom: "neutro" };
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
      depois: null,
      comoFoi: null,          // "rede" ou "limpo"
      ondeRodou: null,
      chapada: pareceArteChapada(dados),
      larguraCm: 30,          // um palpite para a conta já aparecer preenchida
      andamento: null,
      erro: null,
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

async function ampliarComRede(item) {
  const worker = pegarWorker();
  imagemEstado.trabalhando = item.id;
  item.erro = null;
  item.andamento = { etapa: "runtime" };
  renderImagem();

  const copia = new Uint8ClampedArray(item.antes.data);

  return new Promise((resolver) => {
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
      item.depois = new ImageData(r.pixels, r.largura, r.altura);
      item.comoFoi = "rede";
      item.ondeRodou = r.ondeRodou;
      renderImagem();
      resolver();
    };

    worker.postMessage(
      { id: item.id, pixels: copia.buffer, largura: item.antes.width, altura: item.antes.height },
      [copia.buffer],
    );
  });
}

function cancelarAmpliacao() {
  if (imagemEstado.worker) imagemEstado.worker.postMessage({ tipo: "cancelar" });
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
    const grande = item.antes.width * item.antes.height > PIXELS_DEMAIS;
    const saidaEnorme =
      item.antes.width * item.antes.height * ESCALA_DA_REDE * ESCALA_DA_REDE > SAIDA_DEMAIS;
    const rodando = imagemEstado.trabalhando === item.id;

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

      <div class="grid gap-1 px-3 py-2.5">
        ${linhaDoDpi(item, item.antes, "hoje")}
        ${item.depois ? linhaDoDpi(item, item.depois, "depois") : ""}
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

      ${item.depois ? `
        <div class="border-t border-linha px-3 py-3">
          <span class="mb-2 flex items-center gap-2 text-[11px] text-tinta-apagada">
            ${item.comoFoi === "rede"
              ? `Melhorada com a rede${item.ondeRodou === "cpu" ? " (no processador)" : ""}.
                 <strong class="text-tinta">Confira antes de imprimir</strong> — ela reconstrói
                 detalhe, e o que aparece é o provável, não o que estava no arquivo.`
              : "Ampliada sem inventar detalhe."}
          </span>
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
        <button type="button" class="btn primary btn-sm" data-rede="${item.id}"
                ${ocupado || saidaEnorme ? "disabled" : ""}>
          Melhorar com a rede (4×)
        </button>
        <button type="button" class="btn secondary btn-sm" data-limpo="${item.id}" ${ocupado ? "disabled" : ""}>
          Só ampliar, sem inventar
        </button>
        ${item.depois ? `<button type="button" class="btn secondary btn-sm" data-baixar="${item.id}">Baixar PNG</button>` : ""}
      </div>

      ${saidaEnorme ? `
        <p class="m-0 border-t border-linha px-3 py-2 text-[10px] text-tinta-apagada">
          Grande demais para a rede: ampliada 4×, esta imagem daria
          ${(item.antes.width * ESCALA_DA_REDE).toLocaleString("pt-BR")} ×
          ${(item.antes.height * ESCALA_DA_REDE).toLocaleString("pt-BR")} px, e o navegador não
          desenha isso. Ela já é grande — veja o dpi acima antes de concluir que precisa aumentar.
        </p>` : grande ? `
        <p class="m-0 border-t border-linha px-3 py-2 text-[10px] text-tinta-apagada">
          Imagem grande: a rede vai levar vários minutos. Confira o dpi acima — se já estiver bom
          no tamanho que você vai imprimir, não há o que melhorar.
        </p>` : ""}
    </article>`;
  }).join("");
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
      item.depois = ampliarLimpo(item.antes);
      item.comoFoi = "limpo";
      item.ondeRodou = null;
      renderImagem();
      return;
    }
    if (alvo.dataset.rede) {
      if (imagemEstado.trabalhando !== null) return;
      await ampliarComRede(achar(alvo.dataset.rede));
    }
  });

  imagemLista.addEventListener("input", (evento) => {
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
