/**
 * ===========================================================================
 * TELA DE COR — arrumar a cor das artes antes de encaixar
 * ===========================================================================
 *
 * O problema, em uma frase: o encaixe desenha tudo em canvas, canvas só existe
 * em RGB, e a conversão que o navegador faz de uma arte CMYK não é a que o
 * Photoshop faz. O desenho sai certo e a cor não — foi o que apareceu na
 * produção como "em alguns projetos ele muda a cor".
 *
 * Por que uma tela separada
 * -------------------------
 * A conversão certa custa segundos por arte, porque é preciso decodificar o
 * arquivo inteiro e atravessar o perfil de cor pixel a pixel. Pendurar isso na
 * hora de largar os arquivos no Encaixe faria todo mundo pagar o preço — até
 * quem mandou 30 artes que já estavam certas. Aqui o custo é escolhido: a
 * pessoa vem, converte o que precisa, confere, e leva tudo pronto.
 *
 * O caminho da tela
 * -----------------
 *   1. lê o cabeçalho de cada arquivo      (cor-do-arquivo.js, instantâneo)
 *   2. manda para o servidor só o que precisa  (cor-api.js -> cor-icc.js)
 *   3. mostra o antes e o depois lado a lado
 *   4. entrega tudo ao Encaixe — o convertido no lugar do original
 *
 * As duas miniaturas do passo 3 são desenhadas AQUI, pelo navegador, e não no
 * servidor. A razão é que o "antes" só vale alguma coisa se for de verdade o que
 * o Encaixe mostraria — e a única forma de garantir isso é deixar quem desenha o
 * Encaixe desenhá-lo: o mesmo `createImageBitmap`, o mesmo canvas.
 *
 * A primeira versão simulava o "antes" no servidor, com a fórmula ingênua de
 * CMYK para RGB, na suposição de que fosse ela que o navegador usava. Medido
 * contra o Chrome, não é: ele aplica o perfil embutido. O painel mostrava então
 * uma cor que ninguém veria em lugar nenhum — mais viva que a real, o que fazia
 * o "antes" parecer certo e a conversão, desnecessária.
 *
 * O que a conversão realmente acrescenta ao que o navegador já faz é a
 * COMPENSAÇÃO DE PONTO PRETO. Sem ela o preto de tinta não fecha: no Chrome, o
 * preto rico desta loja sai `rgb(0,35,34)` — escuro, esverdeado e lavado. Com
 * ela, sai preto. É a queixa do "fica mais cinza", e é ela que a comparação
 * precisa deixar ver.
 *
 * O passo 4 é o ponto da tela. Não adianta converter e deixar a pessoa
 * procurando onde o arquivo foi parar: a arte convertida entra no Encaixe no
 * lugar da original, e as que não precisavam de nada seguem junto, intactas.
 */

const corSolta = document.getElementById("cor-solta");
const corArquivosInput = document.getElementById("cor-arquivos");
const corPainel = document.getElementById("cor-painel");
const corLista = document.getElementById("cor-lista");
const corResumo = document.getElementById("cor-resumo");
const corErro = document.getElementById("cor-erro");
const btnCorEncaixe = document.getElementById("btn-cor-encaixe");
const btnCorLimpar = document.getElementById("btn-cor-limpar");

/**
 * Uma linha da tela.
 *
 * `arquivo` é sempre o que deve ir para o Encaixe: o original enquanto nada foi
 * convertido, e o convertido depois. É esse campo que o botão do rodapé lê, e
 * por isso ele nunca guarda um estado intermediário.
 */
let itens = [];

// ==================== A LISTA ====================

const ESTADOS = {
  esperando: { rotulo: "na fila", classe: "cor-estado-espera" },
  convertendo: { rotulo: "convertendo…", classe: "cor-estado-espera" },
  pronto: { rotulo: "cor corrigida", classe: "cor-estado-pronto" },
  intacto: { rotulo: "já estava certa", classe: "cor-estado-intacto" },
  parado: { rotulo: "nada a converter", classe: "cor-estado-intacto" },
  // Separado do "parado" de propósito: "nada a converter" é uma resposta sobre
  // a ARTE, e "deu erro" é uma resposta sobre o PROGRAMA. Confundir os dois faz
  // a pessoa ir mexer num arquivo que está bom.
  erro: { rotulo: "deu erro", classe: "cor-estado-parado" },
};

function renderCor() {
  if (itens.length === 0) {
    corPainel.classList.add("hidden");
    corLista.innerHTML = "";
    return;
  }
  corPainel.classList.remove("hidden");

  corLista.innerHTML = itens.map((item, i) => {
    const estado = ESTADOS[item.estado] || ESTADOS.esperando;
    const comparacao = item.antes && item.depois ? `
      <div class="cor-par">
        <figure><img src="${item.antes}" alt="" /><figcaption>como estava indo</figcaption></figure>
        <figure><img src="${item.depois}" alt="" /><figcaption>com o perfil aplicado</figcaption></figure>
      </div>` : "";

    return `
      <article class="cor-item" data-i="${i}">
        <header>
          <strong>${escapeHtml(item.arquivo.name)}</strong>
          <span class="cor-estado ${estado.classe}">${estado.rotulo}</span>
        </header>
        <p class="hint">${escapeHtml(item.detalhe || "")}</p>
        ${comparacao}
      </article>`;
  }).join("");

  const corrigidas = itens.filter((i) => i.estado === "pronto").length;
  const faltando = itens.filter((i) => i.estado === "esperando" || i.estado === "convertendo").length;
  const paradas = itens.filter((i) => i.estado === "parado").length;
  const comErro = itens.filter((i) => i.estado === "erro").length;

  const partes = [`${itens.length} ${itens.length === 1 ? "arte" : "artes"}`];
  if (faltando) partes.push(`${faltando} na fila`);
  if (corrigidas) partes.push(`${corrigidas} com a cor corrigida`);
  if (paradas) partes.push(`${paradas} sem perfil para aplicar`);
  if (comErro) partes.push(`${comErro} que deram erro`);
  corResumo.textContent = partes.join(" · ");

  btnCorEncaixe.disabled = faltando > 0;
  btnCorEncaixe.textContent = faltando > 0
    ? "Convertendo…"
    : `Mandar ${itens.length === 1 ? "a arte" : `as ${itens.length} artes`} para o Encaixe`;
}

// ==================== A CONVERSÃO ====================

/**
 * Converte uma arte no servidor.
 *
 * O arquivo convertido é buscado na hora e fica aqui, no navegador, como um
 * Blob. Assim o servidor não precisa segurar 25 artes de 4 MB esperando alguém
 * clicar num botão, e o "Mandar para o Encaixe" não espera rede nenhuma.
 */
async function converterUm(item) {
  item.estado = "convertendo";
  item.detalhe = "lendo o perfil e atravessando a tabela de cor…";
  renderCor();

  const resposta = await fetch("/api/cor/converter", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Nome-Do-Arquivo": encodeURIComponent(item.arquivo.name),
    },
    body: item.arquivo,
  });

  /*
   * Um 404 aqui não é uma arte difícil: é o servidor sem a rota.
   *
   * A tela e o motor viajam juntos, mas chegam por caminhos diferentes — o
   * HTML e o JS são estáticos, então recarregar a página já traz esta tela,
   * enquanto `/api/cor` só passa a existir quando o processo do Node reinicia.
   * Entre uma coisa e outra, a tela aparece e a rota não responde.
   *
   * A primeira versão fazia `.json()` antes de olhar o status, e a página de
   * erro em HTML estourava um "Unexpected token '<'" que virava, na lista, um
   * "não dá para converter" ao lado da arte — como se o problema fosse ela.
   * Diagnóstico errado no lugar mais caro: o que a pessoa faria em seguida é
   * mexer no arquivo, e o arquivo está bom.
   */
  if (resposta.status === 404) {
    throw new Error("o servidor deste programa ainda não tem a conversão de cor."
      + " Feche e abra o programa (ou reinicie o servidor) para ela entrar");
  }

  let dados;
  try {
    dados = await resposta.json();
  } catch (erro) {
    throw new Error(`o servidor respondeu ${resposta.status} sem explicar o motivo`);
  }
  if (!resposta.ok) throw new Error(dados.erro || "o servidor não conseguiu ler o arquivo");

  if (!dados.convertido) {
    item.estado = "parado";
    item.detalhe = dados.motivo;
    return;
  }

  const bytes = await fetch(`/api/cor/arquivo/${dados.id}`);
  if (!bytes.ok) throw new Error("a conversão terminou mas o arquivo não voltou");
  const blob = await bytes.blob();

  /*
   * SÓ O "ANTES" É DESENHADO AQUI.
   *
   * O "depois" vem pronto do servidor: são os pixels que ele acabou de
   * converter, subamostrados, e não custam decodificação nenhuma. O "antes" não
   * pode vir de lá, porque ele é uma afirmação sobre o que o NAVEGADOR faz com o
   * arquivo — e quem responde isso sem errar é o próprio navegador.
   *
   * Isso custa uma decodificação de imagem cheia. Medido no Chrome com uma arte
   * de 65 megapixels: 3,8 s, e `resizeWidth` não ajuda em nada — ele decodifica
   * tudo e só depois reduz. Desenhar os dois lados aqui custava o dobro disso, e
   * era o que fazia quatro artes levarem quase três minutos.
   *
   * É também o ponto mais frágil da tela, porque depende da memória que a aba
   * tem sobrando com as outras abas da pessoa disputando. Se falhar, o que se
   * perde é a conferência visual: a conversão já terminou e o arquivo já está
   * aqui. Derrubar o item por causa da miniatura seria jogar fora quinze
   * segundos de trabalho e mandar a pessoa investigar uma arte sem defeito.
   *
   * O "antes" sai do arquivo ORIGINAL, então é tirado antes de `item.arquivo`
   * ser trocado.
   */
  try {
    item.antes = await miniatura(item.arquivo, dados.largura, dados.altura);
  } catch (erro) {
    console.warn("[cor] não deu para desenhar o antes de", item.arquivo.name, erro);
    item.antes = null;
    item.semComparacao = "a arte é grande demais para o navegador montar a comparação aqui,"
      + " mas a conversão terminou e o arquivo já está pronto";
  }
  item.depois = dados.depois;

  item.arquivo = new File([blob], dados.nomeNovo, { type: "image/jpeg" });
  item.estado = "pronto";
  item.detalhe = `${dados.espaco} · perfil "${dados.perfil}" · `
    + `${dados.largura} × ${dados.altura} px · ${formatarNumero(dados.cores, 0)} cores`
    + (item.semComparacao ? ` — ${item.semComparacao}` : "");
}

/** Quanto a miniatura da comparação tem de largura. */
const MINIATURA_LARGURA = 420;

/**
 * Uma miniatura da arte, desenhada pelo navegador.
 *
 * É o mesmo `createImageBitmap` que o Encaixe usa, e usar o mesmo caminho é o
 * ponto: o que aparece aqui é o que apareceria lá.
 *
 * O `resizeWidth` NÃO evita a decodificação da imagem cheia — medido, uma arte
 * de 65 megapixels leva os mesmos 3,8 s com e sem ele. Ele serve para o
 * resultado já sair no tamanho certo, sem um segundo canvas gigante no meio.
 */
async function miniatura(blob, larguraReal, alturaReal) {
  const largura = Math.min(MINIATURA_LARGURA, larguraReal);
  const altura = Math.max(1, Math.round(alturaReal * largura / larguraReal));
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: largura, resizeHeight: altura, resizeQuality: "high",
  });
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Recebe os arquivos, separa quem precisa de conversão e converte um de cada
 * vez.
 *
 * Um de cada vez de propósito: uma arte de 50 megapixels ocupa mais de 1 GB no
 * servidor enquanto está sendo convertida, e três ao mesmo tempo derrubariam o
 * processo. Em fila, o pico é sempre o de uma arte só.
 */
async function receberArquivos(arquivos) {
  const imagens = arquivos.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png)$/i.test(f.name));
  if (imagens.length === 0) {
    corErro.textContent = "Esta tela trabalha com imagem (JPG ou PNG).";
    corErro.classList.remove("hidden");
    return;
  }
  corErro.classList.add("hidden");

  const novos = [];
  for (const arquivo of imagens) {
    const cor = await diagnosticoDeCorDoArquivo(arquivo);
    const precisa = cor.risco !== COR_SEGURA;
    const item = {
      arquivo,
      estado: precisa ? "esperando" : "intacto",
      detalhe: precisa ? cor.detalhe : `${cor.perfil || "sRGB"} — não precisa de conversão.`,
      antes: null,
      depois: null,
    };
    novos.push(item);
    itens.push(item);
  }
  renderCor();

  for (const item of novos) {
    if (item.estado !== "esperando") continue;
    try {
      await converterUm(item);
    } catch (erro) {
      console.error("[cor] falhou ao converter", item.arquivo.name, erro);
      // "Failed to fetch" é o que o navegador diz quando a conexão caiu no meio
      // — servidor reiniciado, ou a arte grande demais para o envio terminar.
      // Sozinho não diz nada a quem lê.
      if (/failed to fetch|networkerror|load failed/i.test(erro.message)) {
        erro.message = "a conexão com o servidor do programa caiu no meio do envio";
      }
      item.estado = "erro";
      item.detalhe = `A conversão não rodou: ${erro.message}. `
        + "A arte não foi mexida e segue para o encaixe como está.";
    }
    renderCor();
  }
}

// ==================== A ENTREGA AO ENCAIXE ====================

/**
 * Leva tudo para o Encaixe e troca de tela.
 *
 * Vai a lista inteira, não só o que foi convertido: quem chegou aqui trouxe o
 * trabalho todo, e obrigar a pessoa a arrastar de novo as artes que já estavam
 * certas seria devolver a ela o trabalho que esta tela existe para poupar.
 */
async function mandarParaOEncaixe() {
  const arquivos = itens.map((i) => i.arquivo);
  if (arquivos.length === 0) return;

  const botao = document.querySelector('.nav-btn[data-page="encaixe"]');
  if (botao) botao.click();

  if (typeof adicionarArquivos === "function") await adicionarArquivos(arquivos);
  itens = [];
  renderCor();
}

// ==================== LIGAÇÕES ====================

corArquivosInput?.addEventListener("change", async () => {
  const arquivos = Array.from(corArquivosInput.files || []);
  corArquivosInput.value = "";
  if (arquivos.length) await receberArquivos(arquivos);
});

["dragenter", "dragover"].forEach((evt) => {
  corSolta?.addEventListener(evt, (e) => {
    e.preventDefault();
    corSolta.classList.add("arrastando");
  });
});
["dragleave", "drop"].forEach((evt) => {
  corSolta?.addEventListener(evt, () => corSolta.classList.remove("arrastando"));
});
corSolta?.addEventListener("drop", async (e) => {
  e.preventDefault();
  const arquivos = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
  if (arquivos.length) await receberArquivos(arquivos);
});

btnCorEncaixe?.addEventListener("click", mandarParaOEncaixe);
btnCorLimpar?.addEventListener("click", () => {
  itens = [];
  corErro.classList.add("hidden");
  renderCor();
});
