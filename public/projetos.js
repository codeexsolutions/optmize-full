/**
 * Tela de Projetos: a estante do trabalho que se repete.
 *
 * A navegação é a de uma gaveta: a lista começa nos clientes e entra num deles
 * para ver as pastas de projeto. Abrir um projeto abre o editor, onde ficam as
 * peças (a arte já finalizada, com a medida real) e os ajustes do encaixe.
 *
 * O que esta tela NÃO faz, de propósito: aplicar estampa em molde. Isso é a
 * tela de Moldes, e o fluxo é outro — lá a arte é colocada dentro de um
 * contorno; aqui ela já chega colocada.
 */

(() => {
  const lista = document.getElementById("projetos-lista");
  const titulo = document.getElementById("projetos-titulo");
  const subtitulo = document.getElementById("projetos-subtitulo");
  const btnVoltar = document.getElementById("btn-projeto-voltar");
  const btnClienteNovo = document.getElementById("btn-cliente-novo");
  const btnProjetoNovo = document.getElementById("btn-projeto-novo");

  const editor = document.getElementById("projeto-editor");
  const editorTitulo = document.getElementById("projeto-editor-titulo");
  const editorCliente = document.getElementById("projeto-editor-cliente");
  const campoNome = document.getElementById("projeto-nome");
  const campoObs = document.getElementById("projeto-observacoes");
  const campoLargura = document.getElementById("projeto-largura-tecido");
  const campoEspaco = document.getElementById("projeto-espaco");
  const campoComprimento = document.getElementById("projeto-comprimento");
  const campoGiro = document.getElementById("projeto-giro");
  const campoUnidades = document.getElementById("projeto-unidades");
  const conta = document.getElementById("projeto-conta");
  const caixaPecas = document.getElementById("projeto-pecas");
  const entradaArquivos = document.getElementById("projeto-arquivos");
  const envioStatus = document.getElementById("projeto-envio-status");
  const erro = document.getElementById("projeto-erro");

  // Só existe se a página tiver a tela (o arquivo carrega sempre).
  if (!lista) return;

  /** null = estamos na lista de clientes; um id = dentro da pasta dele. */
  let clienteAberto = null;
  let projetoAberto = null;
  let pecas = [];

  const escapar = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  async function pedir(caminho, opcoes) {
    const resposta = await fetch(`/api/projetos${caminho}`, opcoes);
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.error || "Não deu certo.");
    return corpo;
  }

  // ==================== A ESTANTE ====================

  async function mostrarClientes() {
    clienteAberto = null;
    titulo.textContent = "Clientes";
    subtitulo.textContent = "Cada cliente tem a sua pasta; dentro dela, uma pasta por projeto.";
    btnVoltar.classList.add("hidden");
    btnClienteNovo.classList.remove("hidden");
    btnProjetoNovo.classList.add("hidden");

    const clientes = await pedir("/clientes");
    if (clientes.length === 0) {
      lista.innerHTML = `
        <div class="lista-vazia">
          <strong>Nenhum cliente ainda</strong>
          <p>Crie a pasta de um cliente para começar a guardar os projetos dele.</p>
        </div>`;
      return;
    }
    lista.innerHTML = clientes.map((c) => `
      <article class="projeto-pasta" data-cliente="${c.id}" tabindex="0" role="button">
        <span class="pasta-icone" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5a2 2 0 012-2h4l1.8 2H19a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
        </span>
        <div class="pasta-copy">
          <h3 class="pasta-nome">${escapar(c.nome)}</h3>
          ${c.observacoes ? `<p class="pasta-obs">${escapar(c.observacoes)}</p>` : ""}
          <p class="pasta-conta">${c.projetos} projeto${c.projetos === 1 ? "" : "s"}</p>
        </div>
        <div class="pasta-acoes">
          <button type="button" class="btn secondary btn-sm" data-cliente-editar="${c.id}">Renomear</button>
          <button type="button" class="btn ghost-danger btn-sm" data-cliente-excluir="${c.id}">Excluir</button>
        </div>
      </article>
    `).join("");
  }

  async function abrirCliente(id) {
    const { cliente, projetos } = await pedir(`/clientes/${id}/projetos`);
    clienteAberto = cliente;
    titulo.textContent = cliente.nome;
    subtitulo.textContent = "Os projetos deste cliente. Abrir um deles leva às peças e aos ajustes.";
    btnVoltar.classList.remove("hidden");
    btnClienteNovo.classList.add("hidden");
    btnProjetoNovo.classList.remove("hidden");

    if (projetos.length === 0) {
      lista.innerHTML = `
        <div class="lista-vazia">
          <strong>Nenhum projeto nesta pasta</strong>
          <p>Crie um projeto e mande para dentro dele a arte já finalizada.</p>
        </div>`;
      return;
    }
    lista.innerHTML = projetos.map((p) => `
      <article class="projeto-pasta" data-projeto="${p.id}" tabindex="0" role="button">
        <span class="pasta-capa" aria-hidden="true">
${p.capa ? `<img src="${p.capa}" alt="" />` : `<span class="pasta-sem-capa">sem prévia</span>`}
        </span>
        <div class="pasta-copy">
          <h3 class="pasta-nome">${escapar(p.nome)}</h3>
          ${p.observacoes ? `<p class="pasta-obs">${escapar(p.observacoes)}</p>` : ""}
          <p class="pasta-conta">
            ${p.pecas} arte${p.pecas === 1 ? "" : "s"}
            · ${p.pecasPorUnidade} peça${p.pecasPorUnidade === 1 ? "" : "s"} por unidade
            ${p.largura_tecido ? ` · tecido ${p.largura_tecido} cm` : ""}
          </p>
        </div>
        <div class="pasta-acoes">
          <button type="button" class="btn primary btn-sm" data-projeto-abrir="${p.id}">Abrir</button>
        </div>
      </article>
    `).join("");
  }

  // ==================== O EDITOR DO PROJETO ====================

  async function abrirProjeto(id) {
    const p = await pedir(`/${id}`);
    projetoAberto = p;
    pecas = p.pecas.map((x) => ({
      id: x.id,
      nome: x.nome, arquivo: x.arquivo, url: x.url, miniatura: x.miniatura,
      largura: x.largura, altura: x.altura, quantidade: x.quantidade,
    }));

    editorCliente.textContent = (p.cliente ? p.cliente.nome : "CLIENTE").toUpperCase();
    editorTitulo.textContent = p.nome;
    campoNome.value = p.nome;
    campoObs.value = p.observacoes || "";
    campoLargura.value = p.largura_tecido == null ? "" : p.largura_tecido;
    campoEspaco.value = p.espaco == null ? "" : p.espaco;
    campoComprimento.value = p.comprimento_bancada == null ? "" : p.comprimento_bancada;
    campoGiro.value = p.giro || "180";
    campoUnidades.value = 1;
    esconderErro();
    envioStatus.textContent = "";
    renderPecas();
    editor.classList.remove("hidden");
    document.body.classList.add("dialog-open");
    campoNome.focus();
    completarMiniaturas();
  }

  /**
   * Peça guardada antes da miniatura existir mostra o arquivo inteiro no
   * quadradinho — o que trava a página. Aqui ela ganha a sua, sem bloquear:
   * `createImageBitmap` decodifica fora da thread da tela. Fica só na memória
   * até a pessoa salvar, porque salvar sozinho seria mexer no projeto dela sem
   * ela pedir.
   */
  async function completarMiniaturas() {
    const faltando = pecas.filter((p) => !p.miniatura && p.url);
    if (faltando.length === 0) return;
    for (const peca of faltando) {
      try {
        const blob = await fetch(peca.url).then((r) => r.blob());
        // Decodifica JÁ no tamanho da miniatura: o navegador faz a redução
        // fora da thread da tela, e o canvas só copia 240 px. Abrir e desenhar
        // a arte inteira para depois encolher custava quase 1 s de página
        // parada, mesmo com o resultado sendo o mesmo quadradinho.
        // As medidas saem do cabeçalho do arquivo (`medidasDoArquivo`, do
        // encaixe.js) para a redução manter a proporção — passar 240x240 fixo
        // esticaria a arte.
        const medidas = typeof medidasDoArquivo === "function"
          ? medidasDoArquivo(new Uint8Array(await blob.arrayBuffer()))
          : null;
        let opcoes;
        if (medidas && medidas.largura > 0 && medidas.altura > 0) {
          const fator = Math.min(1, LADO_DA_MINIATURA / Math.max(medidas.largura, medidas.altura));
          opcoes = {
            resizeWidth: Math.max(1, Math.round(medidas.largura * fator)),
            resizeHeight: Math.max(1, Math.round(medidas.altura * fator)),
            resizeQuality: "medium",
          };
        }
        const bmp = await createImageBitmap(blob, opcoes);
        const canvas = document.createElement("canvas");
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        canvas.getContext("2d").drawImage(bmp, 0, 0);
        peca.miniatura = canvas.toDataURL("image/png");
        bmp.close();
      } catch (e) {
        // sem miniatura: a linha continua mostrando o arquivo, como antes
      }
    }
    if (!editor.classList.contains("hidden")) renderPecas();

    // Guarda as prévias recém-feitas, para a próxima abertura ser instantânea.
    // Falhar aqui não é problema: a tela continua funcionando e tenta de novo
    // na próxima vez.
    const paraGuardar = faltando
      .filter((x) => x.miniatura && x.id)
      .map((x) => ({ id: x.id, miniatura: x.miniatura }));
    if (paraGuardar.length > 0 && projetoAberto) {
      pedir(`/${projetoAberto.id}/miniaturas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ miniaturas: paraGuardar }),
      }).catch(() => {});
    }
  }

  function fecharProjeto() {
    editor.classList.add("hidden");
    document.body.classList.remove("dialog-open");
    projetoAberto = null;
    pecas = [];
  }

  // Mesmo motivo do moldes-tela.js: sair da tela tem de fechar o editor. Aqui
  // importa ainda mais que seja esta função, e não um "esconde tudo" genérico
  // lá na casca — `fecharProjeto` também zera o projeto aberto e a lista de
  // peças, e deixar esse estado para trás faria o editor reabrir sujo.
  document.addEventListener("optimize:trocou-de-tela", fecharProjeto);

  function renderPecas() {
    if (pecas.length === 0) {
      caixaPecas.innerHTML = `
        <div class="lista-vazia">
          <strong>Nenhuma arte no projeto</strong>
          <p>Clique em "Adicionar arte" e mande a estampa já aplicada na peça.</p>
        </div>`;
    } else {
      caixaPecas.innerHTML = pecas.map((p, i) => `
        <article class="projeto-peca">
          <span class="peca-capa">${p.miniatura
            ? `<img src="${p.miniatura}" alt="" />`
            : `<span class="peca-capa-vazia" aria-label="preparando a prévia">…</span>`}</span>
          <label class="peca-campo peca-campo-nome">Nome
            <input type="text" value="${escapar(p.nome)}" data-campo="nome" data-i="${i}" maxlength="120" />
          </label>
          <label class="peca-campo">Largura (cm)
            <input type="number" min="0.1" step="0.1" value="${p.largura}" data-campo="largura" data-i="${i}" />
          </label>
          <label class="peca-campo">Altura (cm)
            <input type="number" min="0.1" step="0.1" value="${p.altura}" data-campo="altura" data-i="${i}" />
          </label>
          <label class="peca-campo">Qtd por unidade
            <input type="number" min="1" step="1" value="${p.quantidade}" data-campo="quantidade" data-i="${i}" />
          </label>
          <button type="button" class="btn ghost-danger btn-sm" data-peca-remover="${i}" aria-label="Tirar esta arte">&times;</button>
        </article>
      `).join("");
    }
    atualizarConta();
  }

  /** A conta que a pessoa faria de cabeça: quantas peças vão para o encaixe. */
  function atualizarConta() {
    const porUnidade = pecas.reduce((s, p) => s + (Number(p.quantidade) || 0), 0);
    const unidades = Math.max(1, Math.floor(Number(campoUnidades.value) || 1));
    conta.textContent = pecas.length === 0
      ? ""
      : `${porUnidade} peça${porUnidade === 1 ? "" : "s"} por unidade × ${unidades} = `
        + `${porUnidade * unidades} peça${porUnidade * unidades === 1 ? "" : "s"} no encaixe`;
  }

  const mostrarErro = (t) => { erro.textContent = t; erro.classList.remove("hidden"); };
  const esconderErro = () => erro.classList.add("hidden");

  // ==================== MANDAR A ARTE ====================

  /**
   * A medida sai do dpi gravado no arquivo, exatamente como no Encaixe — é a
   * única fonte confiável do tamanho real. Sem dpi, vale 300 (o padrão de arte
   * para impressão) e o número fica editável na linha.
   */
  async function mandarArquivos(arquivos) {
    if (!projetoAberto) return;
    esconderErro();
    let enviados = 0;
    for (const file of arquivos) {
      envioStatus.textContent = `Enviando ${file.name}…`;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ppcm = (typeof pixelsPorCmDoArquivo === "function" && pixelsPorCmDoArquivo(bytes))
          || (typeof PPCM_PADRAO === "number" ? PPCM_PADRAO : 300 / 2.54);

        const resposta = await fetch(`/api/projetos/${projetoAberto.id}/imagem`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes,
        });
        const corpo = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(corpo.error || "falhou o envio");

        const img = await carregarImagemLocal(corpo.url);
        pecas.push({
          nome: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "peça",
          arquivo: corpo.arquivo,
          url: corpo.url,
          miniatura: miniaturaDe(img),
          largura: Math.round((img.naturalWidth / ppcm) * 10) / 10,
          altura: Math.round((img.naturalHeight / ppcm) * 10) / 10,
          quantidade: 1,
        });
        enviados++;
      } catch (e) {
        mostrarErro(`"${file.name}": ${e.message}`);
      }
    }
    envioStatus.textContent = enviados > 0 ? `${enviados} arte(s) adicionada(s).` : "";
    renderPecas();
  }

  /**
   * A arte reduzida para caber na tela, em data URL.
   *
   * A lista e o editor mostram a peça num quadrado de ~57 px. Apontar o <img>
   * para o arquivo de impressão faz o navegador decodificar dezenas de
   * megapixels para pintar isso — medido em 526 ms ao abrir o editor e 1,8 s ao
   * trocar de aba. A miniatura é gerada uma vez, no envio, e fica guardada.
   */
  const LADO_DA_MINIATURA = 240;

  function miniaturaDe(img) {
    try {
      const fator = Math.min(1, LADO_DA_MINIATURA
        / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * fator));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * fator));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } catch (e) {
      return null;
    }
  }

  const carregarImagemLocal = (src) => new Promise((ok, falhou) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falhou(new Error("não deu para abrir a imagem"));
    img.src = src;
  });

  // ==================== SALVAR E REPETIR ====================

  function corpoDoProjeto() {
    return {
      nome: campoNome.value.trim(),
      observacoes: campoObs.value.trim(),
      larguraTecido: campoLargura.value === "" ? null : Number(campoLargura.value),
      espaco: campoEspaco.value === "" ? null : Number(campoEspaco.value),
      comprimentoBancada: campoComprimento.value === "" ? null : Number(campoComprimento.value),
      giro: campoGiro.value,
      pecas: pecas.map((p) => ({
        nome: p.nome, arquivo: p.arquivo, miniatura: p.miniatura,
        largura: Number(p.largura), altura: Number(p.altura),
        quantidade: Math.max(1, Math.floor(Number(p.quantidade) || 1)),
      })),
    };
  }

  async function salvar() {
    if (!campoNome.value.trim()) { mostrarErro("Dê um nome ao projeto."); return false; }
    const ruim = pecas.find((p) => !(Number(p.largura) > 0) || !(Number(p.altura) > 0));
    if (ruim) { mostrarErro(`"${ruim.nome}" está sem medida. Preencha largura e altura em centímetros.`); return false; }
    try {
      await pedir(`/${projetoAberto.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDoProjeto()),
      });
      esconderErro();
      return true;
    } catch (e) {
      mostrarErro(e.message);
      return false;
    }
  }

  /**
   * A repetição: salva, aplica os ajustes guardados nos campos do Encaixe e
   * manda as peças. Os ajustes vão antes das peças de propósito — o giro de
   * cada peça é lido do seletor geral na hora em que ela entra.
   */
  async function mandarParaOEncaixe() {
    if (pecas.length === 0) { mostrarErro("O projeto não tem nenhuma arte para encaixar."); return; }
    if (!await salvar()) return;
    const unidades = Math.max(1, Math.floor(Number(campoUnidades.value) || 1));
    // Lidos agora: `fecharProjeto` limpa o estado antes do envio começar.
    const nome = campoNome.value.trim();
    const pecasParaEnviar = pecas.slice();

    const ajuste = (id, valor) => {
      if (valor === null || valor === "" || !Number.isFinite(Number(valor))) return;
      const campo = document.getElementById(id);
      if (campo) campo.value = valor;
    };
    ajuste("encaixe-largura", campoLargura.value);
    // O projeto guarda a folga em MILÍMETRO (é o que o campo desta tela
    // pergunta) e o Encaixe passou a perguntar em CENTÍMETRO. A conversão é
    // aqui, na passagem, e não no que está gravado: mexer na unidade do banco
    // reinterpretaria todo projeto já salvo — 5 viraria 5 cm, dez vezes a
    // folga, e o tecido a mais só apareceria depois de imprimir.
    const espacoCm = campoEspaco.value === "" ? "" : Number(campoEspaco.value) / 10;
    ajuste("encaixe-espaco", espacoCm);
    ajuste("encaixe-espaco-y", espacoCm);
    ajuste("encaixe-comprimento", campoComprimento.value);
    const seletorGiro = document.getElementById("encaixe-giro-todas");
    if (seletorGiro) seletorGiro.value = campoGiro.value;

    // A troca de aba vem ANTES do trabalho, e não depois. O painel de
    // andamento do Encaixe mora dentro daquela página; com a aba de Projetos
    // ainda na frente ele ficava escondido, e a pessoa via só a tela parada.
    fecharProjeto();
    document.querySelector('.nav-btn[data-page="encaixe"]').click();
    // Uma pausa curta para a aba nova aparecer antes do trabalho pesado
    // começar. É `setTimeout`, e NÃO `requestAnimationFrame`: rAF só dispara
    // quando a página está sendo pintada, então numa aba em segundo plano (ou
    // com a janela minimizada) a espera nunca terminava e o envio ficava
    // pendurado para sempre, sem erro nenhum na tela.
    await new Promise((r) => setTimeout(r, 60));

    try {
      await mandarProjetoParaOEncaixe(nome, pecasParaEnviar, unidades);
    } catch (e) {
      mostrarErroEncaixe(`Não deu para mandar o projeto ao encaixe: ${e.message}`);
    }
  }

  // ==================== LIGAÇÕES ====================

  lista.addEventListener("click", async (e) => {
    const alvo = (attr) => e.target.closest(`[${attr}]`)?.getAttribute(attr);

    const excluirCliente = alvo("data-cliente-excluir");
    if (excluirCliente) {
      e.stopPropagation();
      if (!await uiConfirm("Apagar este cliente apaga todos os projetos e as artes dentro dele. Não tem volta.",
        { title: "Excluir cliente", confirmText: "Excluir" })) return;
      await pedir(`/clientes/${excluirCliente}`, { method: "DELETE" });
      await mostrarClientes();
      return;
    }

    const editarCliente = alvo("data-cliente-editar");
    if (editarCliente) {
      e.stopPropagation();
      const atual = e.target.closest("[data-cliente]").querySelector(".pasta-nome").textContent;
      const nome = await uiPergunta({
        titulo: "Renomear cliente", kicker: "PASTA DO CLIENTE", valor: atual, confirmar: "Salvar",
      });
      if (!nome) return;
      await pedir(`/clientes/${editarCliente}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      await mostrarClientes();
      return;
    }

    const projeto = alvo("data-projeto-abrir") || alvo("data-projeto");
    if (projeto) { await abrirProjeto(projeto); return; }

    const cliente = alvo("data-cliente");
    if (cliente) await abrirCliente(cliente);
  });

  // Teclado: a pasta é clicável, então tem que abrir no Enter também.
  lista.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const pasta = e.target.closest(".projeto-pasta");
    if (!pasta) return;
    e.preventDefault();
    pasta.click();
  });

  btnVoltar.addEventListener("click", mostrarClientes);

  btnClienteNovo.addEventListener("click", async () => {
    const nome = await uiPergunta({
      titulo: "Novo cliente", kicker: "PASTA DO CLIENTE",
      texto: "O nome da pasta onde os projetos dele vão ficar.",
      exemplo: "Time Azul", confirmar: "Criar",
    });
    if (!nome) return;
    await pedir("/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    await mostrarClientes();
  });

  btnProjetoNovo.addEventListener("click", async () => {
    if (!clienteAberto) return;
    const nome = await uiPergunta({
      titulo: "Novo projeto", kicker: `PASTA DE ${clienteAberto.nome.toUpperCase()}`,
      texto: "O nome deste trabalho, do jeito que você o chama.",
      exemplo: "Camisa Time Azul 2026", confirmar: "Criar",
    });
    if (!nome) return;
    const novo = await pedir("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId: clienteAberto.id, nome }),
    });
    await abrirCliente(clienteAberto.id);
    await abrirProjeto(novo.id);
  });

  document.getElementById("btn-projeto-fechar").addEventListener("click", fecharProjeto);
  document.getElementById("btn-projeto-salvar").addEventListener("click", async () => {
    if (await salvar()) {
      envioStatus.textContent = "Projeto salvo.";
      if (clienteAberto) await abrirCliente(clienteAberto.id);
    }
  });
  document.getElementById("btn-projeto-encaixar").addEventListener("click", mandarParaOEncaixe);
  document.getElementById("btn-projeto-excluir").addEventListener("click", async () => {
    if (!projetoAberto) return;
    if (!await uiConfirm("Apagar este projeto apaga as artes dentro dele. Não tem volta.",
      { title: "Excluir projeto", confirmText: "Excluir" })) return;
    const cliente = clienteAberto;
    await pedir(`/${projetoAberto.id}`, { method: "DELETE" });
    fecharProjeto();
    if (cliente) await abrirCliente(cliente.id);
  });

  entradaArquivos.addEventListener("change", async () => {
    const arquivos = [...entradaArquivos.files];
    entradaArquivos.value = "";
    if (arquivos.length > 0) await mandarArquivos(arquivos);
  });

  caixaPecas.addEventListener("input", (e) => {
    const campo = e.target.dataset.campo;
    if (!campo) return;
    const peca = pecas[Number(e.target.dataset.i)];
    if (!peca) return;
    peca[campo] = campo === "nome" ? e.target.value : Number(e.target.value);
    if (campo === "quantidade") atualizarConta();
  });

  caixaPecas.addEventListener("click", (e) => {
    const i = e.target.closest("[data-peca-remover]")?.getAttribute("data-peca-remover");
    if (i === null || i === undefined) return;
    pecas.splice(Number(i), 1);
    renderPecas();
  });

  campoUnidades.addEventListener("input", atualizarConta);

  editor.addEventListener("click", (e) => { if (e.target === editor) fecharProjeto(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !editor.classList.contains("hidden")) fecharProjeto();
  });

  // A estante é montada quando a tela é aberta pela primeira vez: carregar na
  // partida gastaria requisição em quem nunca entra aqui.
  //
  // Escuta a TROCA DE TELA, e não o clique no menu. Desde que as telas
  // ganharam endereço (`#/projetos`), há três jeitos de chegar aqui sem
  // clicar em nada: recarregar já nesta tela, voltar no navegador e abrir um
  // link direto. No clique, esses três abriam a estante vazia.
  let jaMontou = false;
  document.addEventListener("optimize:trocou-de-tela", (e) => {
    if (e.detail.pagina !== "projetos" || jaMontou) return;
    jaMontou = true;
    mostrarClientes().catch((erro) => {
      lista.innerHTML = `<p class="hint error">Não deu para carregar: ${escapar(erro.message)}</p>`;
    });
  });

  // Outras telas precisam recarregar a estante depois de mexer no banco.
  window.carregarProjetos = () => (clienteAberto ? abrirCliente(clienteAberto.id) : mostrarClientes());
})();
