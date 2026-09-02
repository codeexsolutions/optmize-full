/**
 * Tela de Moldes: a estante de moldes da produção.
 *
 * Criar um molde é um passo a passo, para não pedir tudo de uma vez:
 *   1. o que é (camisa, regata, short, banner, ou outra coisa);
 *   2. quantos pedaços tem, o nome e o tamanho;
 *   3. um espaço por pedaço, para dizer o que é aquela parte e mandar o arquivo.
 *
 * O desenho vem pronto de fora, em DXF, PLT, SVG ou PDF. O que fica guardado é
 * o contorno em centímetros, não uma figura — é isso que faz o molde continuar
 * exato: ele volta na tela, vai para o encaixe e sai em PDF sempre na medida.
 */

// ==================== ELEMENTOS ====================

const moldeModal = document.getElementById("molde-modal");
const moldeModalTitulo = document.getElementById("molde-modal-titulo");
const btnMoldeNovo = document.getElementById("btn-molde-novo");
const btnMoldeModalFechar = document.getElementById("btn-molde-modal-fechar");
const btnMoldeAvancar = document.getElementById("btn-molde-avancar");
const btnMoldeVoltar = document.getElementById("btn-molde-voltar");
const moldePassoConta = document.getElementById("molde-passo-conta");

const moldeTipos = document.getElementById("molde-tipos");
const moldeTipoOutroCampo = document.getElementById("molde-tipo-outro-campo");
const moldeTipoOutro = document.getElementById("molde-tipo-outro");

const moldePedacos = document.getElementById("molde-pedacos");
const moldeNomeInput = document.getElementById("molde-nome");
const moldeTamanhosEntrada = document.getElementById("molde-tamanhos");
const moldeAbas = document.getElementById("molde-abas");
const moldeAbaNova = document.getElementById("molde-aba-nova");
const btnMoldeAbaNova = document.getElementById("btn-molde-aba-nova");
const moldeAbaRecado = document.getElementById("molde-aba-recado");
const moldeUnidadeSelect = document.getElementById("molde-unidade");
const moldeModoVetorSelect = document.getElementById("molde-modo-vetor");
const moldeObservacoesInput = document.getElementById("molde-observacoes");
const moldePasso2Pergunta = document.getElementById("molde-passo2-pergunta");

const moldePartes = document.getElementById("molde-partes");
const moldePasso3Pergunta = document.getElementById("molde-passo3-pergunta");
const btnMoldeMaisParte = document.getElementById("btn-molde-mais-parte");

const moldeErro = document.getElementById("molde-erro");
const moldesBody = document.getElementById("moldes-body");

const moldeEnvio = document.getElementById("molde-envio");
const moldeEnvioNome = document.getElementById("molde-envio-nome");
const moldeEnvioTamanho = document.getElementById("molde-envio-tamanho");
const moldeEnvioUnidades = document.getElementById("molde-envio-unidades");
const moldeEnvioResumo = document.getElementById("molde-envio-resumo");
const moldeEnvioPartes = document.getElementById("molde-envio-partes");
const moldeEnvioDpi = document.getElementById("molde-envio-dpi");
const moldeEnvioQualidade = document.getElementById("molde-envio-qualidade");
const moldeEnvioErro = document.getElementById("molde-envio-erro");
const moldeEstampas = document.getElementById("molde-estampas");
const moldeArteNome = document.getElementById("molde-arte-nome");
const moldeArteTitulo = document.getElementById("molde-arte-titulo");
const btnArteNova = document.getElementById("btn-arte-nova");
const btnArteSalvar = document.getElementById("btn-arte-salvar");
const btnMoldeEnviar = document.getElementById("btn-molde-enviar");
const btnMoldeEnvioFechar = document.getElementById("btn-molde-envio-fechar");

// ==================== O QUE DÁ PARA CRIAR ====================

/**
 * Cada tipo já vem com os pedaços que costuma ter. É só um chute bom: a pessoa
 * muda o número e troca o nome de qualquer parte na hora.
 */
const TIPOS_DE_MOLDE = [
  { id: "camisa", nome: "Camisa", risco: "👕",
    partes: ["frente", "costas", "manga direita", "manga esquerda", "gola"] },
  { id: "regata", nome: "Regata", risco: "🎽",
    partes: ["frente", "costas", "vista"] },
  { id: "short", nome: "Short", risco: "🩳",
    partes: ["frente", "costas", "cós"] },
  { id: "banner", nome: "Banner", risco: "🖼️", partes: ["outro"] },
  { id: "outro", nome: "Outra coisa", risco: "✏️", partes: ["outro", "outro"] },
];

const PAPEIS_DE_PECA = [
  "frente", "costas", "manga direita", "manga esquerda", "manga",
  "gola", "punho", "cós", "bolso", "vista", "forro", "outro",
];

let tipoEscolhido = null;   // um item de TIPOS_DE_MOLDE
let nomeDoTipoOutro = "";   // o que a pessoa escreveu quando é "outra coisa"
let passoAtual = 1;

let partesDoMolde = [];     // as partes do tamanho que está aberto na aba
let partesPorTamanho = {};  // tamanho -> partes; cada tamanho tem os arquivos dele
let tamanhoAberto = "único";
let proximaParteId = 1;
let moldeEmEdicao = null;   // id, quando está reeditando um molde salvo
let moldesGuardados = [];
let moldeParaEnviar = null;

// ==================== AVISOS ====================

function mostrarErroMolde(msg) {
  moldeErro.textContent = msg;
  moldeErro.classList.remove("hidden");
}
function limparErroMolde() {
  moldeErro.textContent = "";
  moldeErro.classList.add("hidden");
}

// ==================== O PASSO A PASSO ====================

function parteVazia(papel) {
  return {
    id: proximaParteId++,
    papel: papel || "outro",
    papelEscrito: "",
    quantidade: 1,
    tamanho: null,     // preenchido na hora de salvar, com o tamanho do passo 2
    nome: null, largura: 0, altura: 0, contorno: null, furos: [], origem: null,
  };
}

/** Como a parte se chama de verdade: o papel da lista, ou o que foi escrito. */
function nomeDaParte(parte) {
  if (parte.papel !== "outro") return parte.papel;
  return String(parte.papelEscrito || "").trim() || "outro";
}

function abrirModalDeMolde() {
  moldeModal.classList.remove("hidden");
  document.body.classList.add("modal-aberto");
}

function fecharModalDeMolde() {
  moldeModal.classList.add("hidden");
  document.body.classList.remove("modal-aberto");
}

/** "a camisa" / "o short": só para a pergunta não sair torta. */
function ehFeminina(palavra) {
  return /a$/i.test(String(palavra || "peça").trim().split(" ")[0]);
}
function umArtigo(palavra) {
  const p = String(palavra || "").trim() || "peça";
  return `${ehFeminina(p) ? "a" : "o"} ${p}`;
}
function deArtigo(palavra) {
  const p = String(palavra || "").trim() || "peça";
  return `${ehFeminina(p) ? "da" : "do"} ${p}`;
}

/** No meio da frase, "Almofada" vira "almofada" — mas "PVC" continua "PVC". */
function comoNaFrase(palavra) {
  const p = String(palavra || "").trim();
  if (!p || p === p.toUpperCase()) return p;
  return p[0].toLowerCase() + p.slice(1);
}

function tituloDoTipo() {
  if (!tipoEscolhido) return "peça";
  if (tipoEscolhido.id === "outro") return comoNaFrase(nomeDoTipoOutro) || "peça";
  return tipoEscolhido.nome.toLowerCase();
}

function irParaPasso(n) {
  passoAtual = n;
  moldeModal.querySelectorAll(".modal-passo").forEach((s) => {
    s.classList.toggle("hidden", Number(s.dataset.passo) !== n);
  });
  moldePassoConta.textContent = `Passo ${n} de 3`;
  btnMoldeVoltar.classList.toggle("hidden", n === 1);
  btnMoldeAvancar.textContent = n === 3 ? "Salvar molde" : "Continuar";
  limparErroMolde();

  if (n === 2) {
    moldePasso2Pergunta.textContent = `Quantos pedaços tem ${umArtigo(tituloDoTipo())}?`;
  }
  if (n === 3) {
    moldePasso3Pergunta.textContent =
      `Diga o que é cada parte ${deArtigo(tituloDoTipo())} e mande o arquivo, tamanho por tamanho.`;
    renderAbas();
    renderPartes();
  }
}

// ---- passo 1 ----

function renderTipos() {
  moldeTipos.innerHTML = "";
  TIPOS_DE_MOLDE.forEach((tipo) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = `escolha${tipoEscolhido && tipoEscolhido.id === tipo.id ? " escolhida" : ""}`;
    botao.dataset.tipo = tipo.id;
    botao.innerHTML = `<span class="escolha-risco">${tipo.risco}</span>
      <span class="escolha-nome">${tipo.nome}</span>`;
    moldeTipos.appendChild(botao);
  });
}

moldeTipos.addEventListener("click", (e) => {
  const botao = e.target.closest("[data-tipo]");
  if (!botao) return;
  tipoEscolhido = TIPOS_DE_MOLDE.find((t) => t.id === botao.dataset.tipo);
  renderTipos();
  moldeTipoOutroCampo.classList.toggle("hidden", tipoEscolhido.id !== "outro");
  if (tipoEscolhido.id === "outro") moldeTipoOutro.focus();
  // O número de pedaços acompanha o tipo escolhido.
  moldePedacos.value = String(tipoEscolhido.partes.length);
  limparErroMolde();
});

// ==================== AS ABAS DE TAMANHO ====================

/**
 * Cada tamanho tem o seu arquivo: o molde do P não é o do G. Por isso o passo
 * 3 é dividido em abas — uma por tamanho — e o que está na tela é sempre o
 * tamanho aberto. Guardar por tamanho, e não tudo numa lista só, é o que deixa
 * mandar a grade inteira sem misturar peça de um tamanho com a do outro.
 */

/** Lê "P, M, G GG" e devolve ["P","M","G","GG"], sem repetir. */
function lerTamanhos(texto) {
  const lista = String(texto || "").split(/[,;/]+|\s+/)
    .map((t) => t.trim()).filter(Boolean);
  const vistos = new Set();
  const limpos = [];
  lista.forEach((t) => {
    const chave = t.toLowerCase();
    if (vistos.has(chave)) return;
    vistos.add(chave);
    limpos.push(t);
  });
  return limpos.length > 0 ? limpos : ["único"];
}

const tamanhosDoMolde = () => Object.keys(partesPorTamanho);

/** Guarda na mão o que está na tela, antes de trocar de aba. */
function guardarTamanhoAberto() {
  if (tamanhoAberto) partesPorTamanho[tamanhoAberto] = partesDoMolde;
}

/**
 * As partes de um tamanho novo nascem iguais às do primeiro tamanho — mesmos
 * papéis e mesmas quantidades, só sem arquivo. É quase sempre o que se quer:
 * a camiseta G tem as mesmas cinco peças da M.
 */
function partesNovasDoModelo(quantos) {
  const primeiro = partesPorTamanho[tamanhosDoMolde()[0]];
  if (primeiro && primeiro.length > 0) {
    return primeiro.map((p) => ({
      ...parteVazia(p.papel), papelEscrito: p.papelEscrito, quantidade: p.quantidade,
    }));
  }
  const sugeridas = (tipoEscolhido && tipoEscolhido.partes) || [];
  return Array.from({ length: Math.max(1, quantos) },
    (_, i) => parteVazia(sugeridas[i] || "outro"));
}

function abrirTamanho(tamanho) {
  if (!partesPorTamanho[tamanho]) return;
  guardarTamanhoAberto();
  tamanhoAberto = tamanho;
  partesDoMolde = partesPorTamanho[tamanho];
  moldePedacos.value = String(partesDoMolde.length);
  renderAbas();
  renderPartes();
}

/** Monta as abas a partir dos tamanhos escritos no passo 2. */
function prepararTamanhos(lista, quantos) {
  const antigo = partesPorTamanho;
  partesPorTamanho = {};
  lista.forEach((t) => {
    partesPorTamanho[t] = antigo[t] || null;
  });
  // primeiro os que já existiam, para o modelo sair do que já foi preenchido
  lista.forEach((t) => {
    if (!partesPorTamanho[t]) partesPorTamanho[t] = partesNovasDoModelo(quantos);
  });
  tamanhoAberto = lista.includes(tamanhoAberto) ? tamanhoAberto : lista[0];
  partesDoMolde = partesPorTamanho[tamanhoAberto];
  ajustarQuantidadeDePartes(quantos);
  partesPorTamanho[tamanhoAberto] = partesDoMolde;
}

function renderAbas() {
  moldeAbas.innerHTML = "";
  tamanhosDoMolde().forEach((tamanho) => {
    const partes = partesPorTamanho[tamanho] || [];
    const prontas = partes.filter((p) => p.contorno).length;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = `aba${tamanho === tamanhoAberto ? " aberta" : ""}`
      + `${prontas === partes.length && partes.length > 0 ? " completa" : ""}`;
    botao.dataset.aba = tamanho;
    botao.innerHTML = `<span class="aba-nome">${escapeHtml(tamanho)}</span>
      <span class="aba-conta">${prontas}/${partes.length}</span>
      ${tamanhosDoMolde().length > 1
        ? `<span class="aba-x" data-aba-tirar="${escapeHtml(tamanho)}" title="Tirar este tamanho">&times;</span>`
        : ""}`;
    moldeAbas.appendChild(botao);
  });

  const faltando = tamanhosDoMolde()
    .filter((t) => (partesPorTamanho[t] || []).some((p) => !p.contorno));
  moldeAbaRecado.textContent = faltando.length === 0
    ? "Todos os tamanhos estão com os arquivos completos."
    : `Ainda falta arquivo em: ${faltando.join(", ")}.`;
}

moldeAbas.addEventListener("click", async (e) => {
  const tirar = e.target.dataset.abaTirar;
  if (tirar) {
    const partes = partesPorTamanho[tirar] || [];
    const comArquivo = partes.filter((p) => p.contorno).length;
    if (comArquivo > 0 &&
        !await uiConfirm(`O tamanho "${tirar}" será removido junto com ${comArquivo} peça(s) já enviada(s).`, { title: "Remover tamanho", confirmText: "Remover" })) return;
    delete partesPorTamanho[tirar];
    const sobraram = tamanhosDoMolde();
    if (tamanhoAberto === tirar) {
      tamanhoAberto = sobraram[0];
      partesDoMolde = partesPorTamanho[tamanhoAberto];
    }
    moldeTamanhosEntrada.value = sobraram.join(" ");
    renderAbas();
    renderPartes();
    return;
  }

  const aba = e.target.closest("[data-aba]");
  if (aba) abrirTamanho(aba.dataset.aba);
});

function acrescentarTamanho() {
  const nome = String(moldeAbaNova.value || "").trim();
  if (!nome) return mostrarErroMolde("Escreva o nome do tamanho para acrescentar.");
  if (tamanhosDoMolde().some((t) => t.toLowerCase() === nome.toLowerCase())) {
    return mostrarErroMolde(`O tamanho "${nome}" já está aí.`);
  }
  limparErroMolde();
  guardarTamanhoAberto();
  partesPorTamanho[nome] = partesNovasDoModelo(Number(moldePedacos.value) || 1);
  moldeAbaNova.value = "";
  moldeTamanhosEntrada.value = tamanhosDoMolde().join(" ");
  abrirTamanho(nome);
}

btnMoldeAbaNova.addEventListener("click", acrescentarTamanho);
moldeAbaNova.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); acrescentarTamanho(); }
});

// ---- passo 3: um espaço por pedaço ----

/** Miniatura do contorno, para dar para reconhecer a peça de relance. */
function miniaturaDaParte(parte, cor) {
  return moldeParaImagem(
    { contorno: parte.contorno, furos: parte.furos, largura: parte.largura, altura: parte.altura },
    cor).src;
}

function renderPartes() {
  moldePartes.innerHTML = "";
  const titulo = document.createElement("p");
  titulo.className = "hint partes-de-que-tamanho";
  titulo.innerHTML = `Peças do tamanho <strong>${escapeHtml(tamanhoAberto)}</strong>` +
    (tamanhosDoMolde().length > 1
      ? ` — os outros tamanhos ficam nas abas aí em cima, cada um com o arquivo dele.` : "");
  moldePartes.appendChild(titulo);

  partesDoMolde.forEach((parte, i) => {
    const cor = CORES_PECA[i % CORES_PECA.length];
    const div = document.createElement("div");
    div.className = `parte-molde${parte.contorno ? " parte-pronta" : ""}`;
    div.innerHTML = `
      <span class="peca-thumb" style="border-color: ${cor};">
        ${parte.contorno
          ? `<img src="${miniaturaDaParte(parte, cor)}" alt="" />`
          : `<span class="peca-vazia">${i + 1}</span>`}
      </span>
      <div class="parte-campos">
        <label>O que é esta parte
          <select data-parte-campo="papel" data-id="${parte.id}">
            ${PAPEIS_DE_PECA.map((p) =>
              `<option value="${p}"${p === parte.papel ? " selected" : ""}>${p}</option>`).join("")}
          </select>
        </label>
        <label class="${parte.papel === "outro" ? "" : "hidden"}" style="flex: 1 1 150px;">Escreva o que é
          <input type="text" value="${escapeHtml(parte.papelEscrito)}"
                 placeholder="Ex: bolso de trás" data-parte-campo="papelEscrito" data-id="${parte.id}" />
        </label>
        <label style="flex: 0 0 90px;">Quantas
          <input type="number" min="1" step="1" value="${parte.quantidade}"
                 data-parte-campo="quantidade" data-id="${parte.id}" />
        </label>
      </div>
      <div class="parte-arquivo">
        <label class="btn secondary btn-sm file-label">
          ${parte.contorno ? "Trocar arquivo" : "Enviar arquivo"}
          <input type="file" accept=".dxf,.plt,.hpgl,.svg,.pdf" class="hidden"
                 data-parte-arquivo="${parte.id}" />
        </label>
        <span class="hint">${parte.contorno
          ? `${parte.largura} × ${parte.altura} cm · ${escapeHtml(parte.origem)}`
          : `falta o arquivo (${FORMATOS_DE_MOLDE})`}</span>
      </div>
      <button type="button" class="btn danger btn-sm" data-parte-del="${parte.id}"
              title="Tirar esta parte">&times;</button>
    `;
    moldePartes.appendChild(div);
  });
}

moldePartes.addEventListener("input", (e) => {
  const campo = e.target.dataset.parteCampo;
  if (!campo) return;
  const parte = partesDoMolde.find((p) => p.id === Number(e.target.dataset.id));
  if (!parte) return;
  if (campo === "quantidade") parte.quantidade = Math.max(1, Math.floor(Number(e.target.value) || 1));
  else parte[campo] = e.target.value;
});

moldePartes.addEventListener("click", (e) => {
  const id = e.target.dataset.parteDel;
  if (!id) return;
  partesDoMolde = partesDoMolde.filter((p) => p.id !== Number(id));
  partesPorTamanho[tamanhoAberto] = partesDoMolde;
  moldePedacos.value = String(partesDoMolde.length || 1);
  renderAbas();
  renderPartes();
});

btnMoldeMaisParte.addEventListener("click", () => {
  partesDoMolde.push(parteVazia("outro"));
  moldePedacos.value = String(partesDoMolde.length);
  renderAbas();
  renderPartes();
});

// ==================== LER O ARQUIVO DE UMA PARTE ====================

/**
 * Adivinha o papel da peça pelo nome que veio no arquivo. Acerta a maioria e
 * poupa a pessoa de escolher peça por peça; o que errar, é um clique.
 */
function adivinharPapel(nome) {
  const limpo = String(nome || "").toLowerCase();
  if (/manga.*(dir|d\b)|(dir|d)\b.*manga/.test(limpo)) return "manga direita";
  if (/manga.*(esq|e\b)|(esq|e)\b.*manga/.test(limpo)) return "manga esquerda";
  if (/manga/.test(limpo)) return "manga";
  if (/frente|front/.test(limpo)) return "frente";
  if (/costa|back/.test(limpo)) return "costas";
  if (/gola|colar/.test(limpo)) return "gola";
  if (/punho/.test(limpo)) return "punho";
  if (/c[óo]s\b/.test(limpo)) return "cós";
  if (/bolso|pocket/.test(limpo)) return "bolso";
  if (/vista/.test(limpo)) return "vista";
  if (/forro/.test(limpo)) return "forro";
  return "outro";
}

/** Guarda o desenho lido dentro da parte, sem apagar o que a pessoa escreveu. */
function encaixarDesenhoNaParte(parte, molde, formato, unidade, jaEscolhido) {
  const doNome = lerQuantidadeDoNome(molde.nome);
  parte.nome = doNome.nome;
  parte.largura = Math.round(molde.largura * 10) / 10;
  parte.altura = Math.round(molde.altura * 10) / 10;
  parte.contorno = molde.contorno;
  parte.furos = molde.furos || [];
  parte.origem = `${formato} · ${unidade}`;
  if (doNome.qtd > 1) parte.quantidade = doNome.qtd;
  // Só palpita no papel se a pessoa ainda não tinha dito o que era.
  if (!jaEscolhido) {
    const palpite = adivinharPapel(molde.nome);
    if (palpite !== "outro") parte.papel = palpite;
  }
}

/**
 * Um arquivo pode trazer só aquela parte — o normal aqui — ou o marcador
 * inteiro. Se vier mais de uma peça fechada, as sobrantes caem nos espaços
 * seguintes que ainda estão vazios, e o que faltar de espaço é criado.
 */
async function mandarArquivoParaParte(parteId, file) {
  limparErroMolde();
  const parte = partesDoMolde.find((p) => p.id === parteId);
  if (!parte) return;

  if (!ehArquivoDeMolde(file)) {
    return mostrarErroMolde(`"${file.name}": só leio molde em ${FORMATOS_DE_MOLDE}.`);
  }

  let lido;
  try {
    lido = await lerMoldeVetorial(file, moldeUnidadeSelect.value || null,
      moldeModoVetorSelect.value || "marcador");
  } catch (err) {
    return mostrarErroMolde(`"${file.name}": ${err.message}`);
  }
  if (lido.erro) return mostrarErroMolde(`"${file.name}": ${lido.erro}`);
  if (!lido.moldes || lido.moldes.length === 0) {
    return mostrarErroMolde(`"${file.name}": não achei nenhuma peça fechada aí dentro.`);
  }

  // Um arquivo com várias peças é o marcador inteiro, não "o arquivo desta
  // parte": aí quem manda são os nomes que vieram no desenho, inclusive nesta
  // primeira vaga. Com uma peça só, o que a pessoa escolheu continua valendo.
  const jaEscolhido = lido.moldes.length === 1
    && (parte.papel !== "outro" || String(parte.papelEscrito || "").trim() !== "");
  encaixarDesenhoNaParte(parte, lido.moldes[0], lido.formato, lido.unidade, jaEscolhido);

  // as demais peças que vieram no mesmo arquivo
  const sobrando = lido.moldes.slice(1);
  if (sobrando.length > 0) {
    let daqui = partesDoMolde.indexOf(parte) + 1;
    sobrando.forEach((m) => {
      while (daqui < partesDoMolde.length && partesDoMolde[daqui].contorno) daqui++;
      if (daqui >= partesDoMolde.length) partesDoMolde.push(parteVazia("outro"));
      encaixarDesenhoNaParte(partesDoMolde[daqui], m, lido.formato, lido.unidade, false);
      daqui++;
    });
    moldePedacos.value = String(partesDoMolde.length);
    mostrarErroMolde(`"${file.name}" trouxe ${lido.moldes.length} peças; ` +
      `usei todas e completei os espaços. Confira o que é cada uma.`);
  }

  const avisos = lido.avisos || [];
  if (avisos.length > 0) mostrarErroMolde(`"${file.name}": ${avisos.join(" ")}`);
  partesPorTamanho[tamanhoAberto] = partesDoMolde;
  renderAbas();
  renderPartes();
}

moldePartes.addEventListener("change", async (e) => {
  const arquivo = e.target.dataset.parteArquivo;
  if (arquivo) {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (file) await mandarArquivoParaParte(Number(arquivo), file);
    return;
  }
  if (e.target.dataset.parteCampo === "papel") {
    const parte = partesDoMolde.find((p) => p.id === Number(e.target.dataset.id));
    if (!parte) return;
    parte.papel = e.target.value;
    renderPartes();
  }
});

// ==================== ANDAR E GRAVAR ====================

btnMoldeVoltar.addEventListener("click", () => irParaPasso(Math.max(1, passoAtual - 1)));

btnMoldeAvancar.addEventListener("click", async () => {
  if (passoAtual === 1) {
    if (!tipoEscolhido) return mostrarErroMolde("Escolha primeiro o que você vai criar.");
    if (tipoEscolhido.id === "outro") {
      nomeDoTipoOutro = String(moldeTipoOutro.value || "").trim();
      if (!nomeDoTipoOutro) return mostrarErroMolde("Escreva o que é, para eu saber como chamar.");
    }
    if (!moldeNomeInput.value.trim()) {
      moldeNomeInput.value = nomeDoTipoOutro || tipoEscolhido.nome;
    }
    return irParaPasso(2);
  }

  if (passoAtual === 2) {
    const quantos = Math.max(1, Math.min(60, Math.floor(Number(moldePedacos.value) || 0)));
    if (!moldeNomeInput.value.trim()) return mostrarErroMolde("Dê um nome ao molde.");
    moldePedacos.value = String(quantos);
    const tamanhos = lerTamanhos(moldeTamanhosEntrada.value);
    moldeTamanhosEntrada.value = tamanhos.join(" ");
    prepararTamanhos(tamanhos, quantos);
    return irParaPasso(3);
  }

  await salvarMolde();
});

/** Cresce ou encolhe a lista de partes, aproveitando o que já foi preenchido. */
function ajustarQuantidadeDePartes(quantos) {
  const sugeridas = (tipoEscolhido && tipoEscolhido.partes) || [];
  while (partesDoMolde.length < quantos) {
    partesDoMolde.push(parteVazia(sugeridas[partesDoMolde.length] || "outro"));
  }
  // Ao encolher, some primeiro com os espaços que ainda estão vazios.
  while (partesDoMolde.length > quantos) {
    const vazia = [...partesDoMolde].reverse().find((p) => !p.contorno);
    if (!vazia) { partesDoMolde = partesDoMolde.slice(0, quantos); break; }
    partesDoMolde = partesDoMolde.filter((p) => p !== vazia);
  }
}

async function salvarMolde() {
  limparErroMolde();
  const nome = String(moldeNomeInput.value || "").trim();
  if (!nome) { irParaPasso(2); return mostrarErroMolde("Dê um nome ao molde antes de salvar."); }

  // O molde é salvo com todos os tamanhos de uma vez: o que está aberto na aba
  // e os que ficaram nas outras.
  guardarTamanhoAberto();
  const todas = [];
  let faltando = 0;
  const semArquivo = [];
  tamanhosDoMolde().forEach((tamanho) => {
    const partes = partesPorTamanho[tamanho] || [];
    const prontasAqui = partes.filter((p) => p.contorno);
    if (prontasAqui.length < partes.length) {
      faltando += partes.length - prontasAqui.length;
      if (prontasAqui.length === 0) semArquivo.push(tamanho);
    }
    prontasAqui.forEach((p) => todas.push({ ...p, tamanho }));
  });

  if (todas.length === 0) {
    return mostrarErroMolde("Nenhuma parte tem arquivo ainda. Mande pelo menos um.");
  }

  const corpo = {
    nome,
    observacoes: moldeObservacoesInput.value,
    pecas: todas.map((p, ordem) => ({
      tamanho: p.tamanho,
      papel: nomeDaParte(p),
      nome: nomeDaParte(p) === "outro" ? (p.nome || "peça") : nomeDaParte(p),
      quantidade: p.quantidade,
      largura: p.largura, altura: p.altura,
      contorno: p.contorno, furos: p.furos,
      origem: p.origem, ordem,
    })),
  };

  btnMoldeAvancar.disabled = true;
  try {
    const endereco = moldeEmEdicao ? `/api/moldes/${moldeEmEdicao}` : "/api/moldes";
    const resposta = await fetch(endereco, {
      method: moldeEmEdicao ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      return mostrarErroMolde(erro.error || "Não deu para salvar o molde.");
    }
    const quantas = todas.length;
    const tamanhos = [...new Set(todas.map((p) => p.tamanho))];
    fecharModalDeMolde();
    limparFormularioDeMolde();
    await carregarMoldes();
    if (faltando > 0) {
      mostrarErroMolde(`Molde salvo com ${quantas} peça(s) em ${tamanhos.length} tamanho(s). `
        + `${faltando} espaço(s) ficaram sem arquivo e não entraram`
        + (semArquivo.length > 0 ? ` — ${semArquivo.join(", ")} ficou de fora inteiro.` : "."));
    }
  } catch (err) {
    mostrarErroMolde(`Não deu para salvar: ${err.message}`);
  } finally {
    btnMoldeAvancar.disabled = false;
  }
}

function limparFormularioDeMolde() {
  moldeEmEdicao = null;
  tipoEscolhido = null;
  nomeDoTipoOutro = "";
  partesDoMolde = [];
  partesPorTamanho = {};
  tamanhoAberto = "único";
  moldeNomeInput.value = "";
  moldeObservacoesInput.value = "";
  moldeTamanhosEntrada.value = "único";
  moldeAbaNova.value = "";
  moldeTipoOutro.value = "";
  moldeTipoOutroCampo.classList.add("hidden");
  moldePedacos.value = "5";
  moldeModalTitulo.textContent = "Novo molde";
  renderTipos();
  irParaPasso(1);
}

btnMoldeNovo.addEventListener("click", () => {
  limparFormularioDeMolde();
  abrirModalDeMolde();
});

btnMoldeModalFechar.addEventListener("click", fecharModalDeMolde);
moldeModal.addEventListener("click", (e) => {
  if (e.target === moldeModal) fecharModalDeMolde();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !moldeModal.classList.contains("hidden")) fecharModalDeMolde();
});

// ==================== A ESTANTE ====================

async function carregarMoldes() {
  try {
    const resposta = await fetch("/api/moldes");
    moldesGuardados = resposta.ok ? await resposta.json() : [];
  } catch (err) {
    moldesGuardados = [];
  }
  renderMoldes();
}

/**
 * Cada molde é um cartão, não uma linha de tabela.
 *
 * Numa tabela o nome do molde disputava peso com o resto da linha; aqui ele
 * manda no cartão e o resto vira apoio embaixo. "Encaixar" é o que se faz
 * quase sempre, então é o único botão cheio — os outros dois ficam discretos.
 */
function renderMoldes() {
  moldesBody.innerHTML = "";
  if (moldesGuardados.length === 0) {
    moldesBody.innerHTML = `
      <div class="lista-vazia">
        <strong>Nenhum molde guardado ainda</strong>
        <p>Mande o desenho em DXF, PLT, SVG ou PDF e o molde fica pronto para encaixar.</p>
      </div>`;
    return;
  }

  moldesGuardados.forEach((m) => {
    const cartao = document.createElement("article");
    cartao.className = "molde-linha";
    cartao.innerHTML = `
      <div class="molde-identidade">
        <h3 class="molde-nome">${escapeHtml(m.nome)}</h3>
        ${m.observacoes ? `<p class="molde-obs">${escapeHtml(m.observacoes)}</p>` : ""}
        <div class="molde-tamanhos">
          ${m.tamanhos.map((t) => `<span class="etiqueta-tamanho">${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>
      <dl class="molde-numeros">
        <div><dt>Peças no molde</dt><dd>${m.totalPecas}</dd></div>
        <div><dt>Por peça pronta</dt><dd>${m.pecasPorUnidade}</dd></div>
      </dl>
      <div class="molde-acoes">
        <button type="button" class="btn primary btn-sm" data-molde-enviar="${m.id}">Encaixar</button>
        <button type="button" class="btn secondary btn-sm" data-molde-abrir="${m.id}">Editar</button>
        <button type="button" class="btn ghost-danger btn-sm" data-molde-excluir="${m.id}">Excluir</button>
      </div>
    `;
    moldesBody.appendChild(cartao);
  });
}

/** Reeditar pula direto para o passo 3: o molde já sabe o que é e quantos são. */
function abrirMoldeParaEditar(molde) {
  limparFormularioDeMolde();
  moldeEmEdicao = molde.id;
  moldeNomeInput.value = molde.nome;
  moldeObservacoesInput.value = molde.observacoes || "";
  // As peças voltam separadas por tamanho, cada tamanho na sua aba — do mesmo
  // jeito que foram mandadas.
  partesPorTamanho = {};
  molde.pecas.forEach((p) => {
    const tamanho = p.tamanho || "único";
    if (!partesPorTamanho[tamanho]) partesPorTamanho[tamanho] = [];
    partesPorTamanho[tamanho].push({
      id: proximaParteId++,
      papel: PAPEIS_DE_PECA.includes(p.papel) ? p.papel : "outro",
      papelEscrito: PAPEIS_DE_PECA.includes(p.papel) ? "" : p.papel,
      quantidade: p.quantidade,
      tamanho,
      nome: p.nome, largura: p.largura, altura: p.altura,
      contorno: p.contorno, furos: p.furos || [], origem: p.origem || "guardado",
    });
  });
  if (Object.keys(partesPorTamanho).length === 0) partesPorTamanho = { "único": [] };

  tamanhoAberto = Object.keys(partesPorTamanho)[0];
  partesDoMolde = partesPorTamanho[tamanhoAberto];
  moldePedacos.value = String(partesDoMolde.length);
  moldeTamanhosEntrada.value = Object.keys(partesPorTamanho).join(" ");
  moldeModalTitulo.textContent = `Editando: ${molde.nome}`;
  abrirModalDeMolde();
  irParaPasso(3);
}

moldesBody.addEventListener("click", async (e) => {
  const abrir = e.target.dataset.moldeAbrir;
  const excluir = e.target.dataset.moldeExcluir;
  const enviar = e.target.dataset.moldeEnviar;

  if (abrir) {
    const resposta = await fetch(`/api/moldes/${abrir}`);
    if (!resposta.ok) return mostrarErroMolde("Não achei esse molde.");
    abrirMoldeParaEditar(await resposta.json());
    return;
  }

  if (excluir) {
    const molde = moldesGuardados.find((m) => m.id === Number(excluir));
    if (!await uiConfirm(`O molde "${molde ? molde.nome : ""}" e suas peças serão excluídos.`, { title: "Excluir molde", confirmText: "Excluir molde" })) return;
    await fetch(`/api/moldes/${excluir}`, { method: "DELETE" });
    if (moldeEmEdicao === Number(excluir)) { fecharModalDeMolde(); limparFormularioDeMolde(); }
    await carregarMoldes();
    return;
  }

  if (enviar) {
    const resposta = await fetch(`/api/moldes/${enviar}`);
    if (!resposta.ok) return mostrarErroMolde("Não achei esse molde.");
    moldeParaEnviar = await resposta.json();
    abrirEnvioParaEncaixe();
  }
});

// ==================== ARTE, PRÉVIA E ENCAIXE ====================

/**
 * A arte fica guardada pelo papel da peça — frente, costas, manga direita... —
 * e não pela peça de um tamanho. É isso que faz a mesma arte servir para P, M
 * e G: ao trocar o tamanho, o contorno muda e a arte se ajusta ao contorno novo
 * sem ninguém precisar mandar tudo de novo.
 *
 * Um jogo dessas artes é uma **estampa**, e ela é guardada junto com o molde.
 * Assim a mesma camiseta tem a estampa da caveira, a da flor e a lisa, e dá
 * para mandar mais de uma no mesmo encaixe, cada uma com a sua quantidade.
 */
let artesPorPapel = {};     // papel -> { nome, img, ajuste, file?, arquivo? }
let moldeDaArte = null;     // de qual molde são as artes que estão na mão
let estampasDoMolde = [];   // as estampas guardadas, com a quantidade pedida
let estampaEmEdicao = null; // id da estampa que está aberta no painel de baixo

const ehArquivoDeArte = (file) =>
  /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);

/** O tamanho de verdade do azulejo, para a tela mostrar em centímetros. */
function medidaDoRapport(arte, ajuste) {
  const t = tamanhoDoRapport(arte.img, ajuste);
  return `${emCm(t.largura)} × ${emCm(t.altura)} cm`;
}

function pecasDoTamanho() {
  if (!moldeParaEnviar) return [];
  return moldeParaEnviar.pecas.filter((p) => p.tamanho === moldeEnvioTamanho.value);
}

function abrirEnvioParaEncaixe() {
  const tamanhos = [...new Set(moldeParaEnviar.pecas.map((p) => p.tamanho))];
  moldeEnvioNome.textContent = `Arte e encaixe — ${moldeParaEnviar.nome}`;
  moldeEnvioTamanho.innerHTML = tamanhos
    .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");

  // Reabrindo o mesmo molde, a arte continua onde estava: é comum mandar o M
  // para o encaixe e voltar para mandar o G com a mesma estampa.
  if (moldeDaArte !== moldeParaEnviar.id) {
    artesPorPapel = {};
    estampaEmEdicao = null;
    moldeDaArte = moldeParaEnviar.id;
  }
  estampasDoMolde = (moldeParaEnviar.artes || []).map((a) => ({ ...a, unidades: 0 }));

  limparErroEnvio();
  moldeEnvio.classList.remove("hidden");
  document.body.classList.add("modal-aberto");
  renderEstampas();
  renderPartesDoEnvio();
}

function fecharEnvio() {
  moldeEnvio.classList.add("hidden");
  document.body.classList.remove("modal-aberto");
}

// Sair da tela fecha os modais dela. Sem isto, o `overflow: hidden` que o modal
// põe no body continuava valendo na tela seguinte — e a de Encaixe, que é uma
// página longa, simplesmente não rolava. O modal também reaparecia por cima ao
// voltar para Moldes, como se nunca tivesse sido deixado para trás.
document.addEventListener("optimize:trocou-de-tela", () => {
  fecharEnvio();
  fecharModalDeMolde();
});

function mostrarErroEnvio(msg) {
  moldeEnvioErro.textContent = msg;
  moldeEnvioErro.classList.remove("hidden");
}
function limparErroEnvio() {
  moldeEnvioErro.textContent = "";
  moldeEnvioErro.classList.add("hidden");
}

/** Medida para ler na tela: milímetro basta, e sem casa decimal sobrando. */
const emCm = (v) => String(Math.round(Number(v) * 10) / 10);

// ==================== AS ESTAMPAS GUARDADAS ====================

function renderEstampas() {
  moldeEstampas.innerHTML = "";
  if (estampasDoMolde.length === 0) {
    moldeEstampas.innerHTML =
      `<p class="hint">Nenhuma estampa guardada ainda. Monte a arte aqui embaixo e clique em "Salvar no molde".</p>`;
    return;
  }

  estampasDoMolde.forEach((estampa) => {
    const emEdicao = estampaEmEdicao === estampa.id;
    const div = document.createElement("div");
    div.className = `estampa${emEdicao ? " em-edicao" : ""}`;
    div.innerHTML = `
      <span class="estampa-nome">${escapeHtml(estampa.nome)}</span>
      <span class="hint">${estampa.pecas.map((p) => escapeHtml(p.papel)).join(", ")}</span>
      ${emEdicao
        ? `<span class="etiqueta-tamanho">em edição — usa a quantidade lá de cima</span>`
        : `<label class="estampa-qtd">Peças prontas
             <input type="number" min="0" step="1" value="${estampa.unidades}"
                    data-estampa-unidades="${estampa.id}" />
           </label>`}
      <span class="estampa-botoes">
        <button type="button" class="btn secondary btn-sm" data-estampa-abrir="${estampa.id}">Abrir</button>
        <button type="button" class="btn danger btn-sm" data-estampa-excluir="${estampa.id}">Excluir</button>
      </span>
    `;
    moldeEstampas.appendChild(div);
  });
}

moldeEstampas.addEventListener("input", (e) => {
  const id = e.target.dataset.estampaUnidades;
  if (!id) return;
  const estampa = estampasDoMolde.find((x) => x.id === Number(id));
  if (estampa) estampa.unidades = Math.max(0, Math.floor(Number(e.target.value) || 0));
  atualizarResumoDoEnvio();
});

moldeEstampas.addEventListener("click", async (e) => {
  const abrir = e.target.dataset.estampaAbrir;
  const excluir = e.target.dataset.estampaExcluir;

  if (abrir) {
    const estampa = estampasDoMolde.find((x) => x.id === Number(abrir));
    if (!estampa) return;
    e.target.disabled = true;
    try {
      await carregarEstampa(estampa);
    } catch (err) {
      mostrarErroEnvio(`Não consegui abrir a estampa: ${err.message}`);
    } finally {
      e.target.disabled = false;
    }
    return;
  }

  if (excluir) {
    const estampa = estampasDoMolde.find((x) => x.id === Number(excluir));
    if (!estampa) return;
    if (!await uiConfirm(`A estampa "${estampa.nome}" será excluída deste molde.`, { title: "Excluir estampa", confirmText: "Excluir estampa" })) return;
    const resposta = await fetch(`/api/moldes/${moldeParaEnviar.id}/artes/${estampa.id}`, { method: "DELETE" });
    if (!resposta.ok) return mostrarErroEnvio("Não deu para excluir essa estampa.");
    estampasDoMolde = estampasDoMolde.filter((x) => x.id !== estampa.id);
    if (estampaEmEdicao === estampa.id) estampaEmEdicao = null;
    renderEstampas();
    atualizarResumoDoEnvio();
  }
});

/** Traz a estampa guardada para o painel de baixo, imagem e ajuste. */
async function carregarEstampa(estampa) {
  const artes = {};
  for (const peca of estampa.pecas) {
    artes[peca.papel] = {
      nome: peca.nomeOriginal || peca.arquivo,
      img: await carregarImagem(peca.url),
      ajuste: { ...AJUSTE_PADRAO, ...peca.ajuste },
      arquivo: peca.arquivo,
    };
  }
  artesPorPapel = artes;
  estampaEmEdicao = estampa.id;
  moldeArteNome.value = estampa.nome;
  moldeArteTitulo.textContent = `Editando a estampa: ${estampa.nome}`;
  renderEstampas();
  renderPartesDoEnvio();
}

btnArteNova.addEventListener("click", () => {
  artesPorPapel = {};
  estampaEmEdicao = null;
  moldeArteNome.value = "";
  moldeArteTitulo.textContent = "Estampa nova";
  renderEstampas();
  renderPartesDoEnvio();
});

btnArteSalvar.addEventListener("click", async () => {
  limparErroEnvio();
  const nome = String(moldeArteNome.value || "").trim();
  if (!nome) return mostrarErroEnvio("Dê um nome à estampa antes de salvar.");
  const papeis = Object.keys(artesPorPapel);
  if (papeis.length === 0) return mostrarErroEnvio("Mande a arte de pelo menos uma parte.");

  btnArteSalvar.disabled = true;
  const dizia = btnArteSalvar.textContent;
  try {
    // Cada arte nova sobe uma vez; a que veio de uma estampa guardada já tem
    // arquivo no servidor e é só reaproveitada.
    let subiu = 0;
    for (const papel of papeis) {
      const arte = artesPorPapel[papel];
      if (arte.arquivo || !arte.file) continue;
      subiu++;
      btnArteSalvar.textContent = `Subindo arte (${subiu})…`;
      const endereco = `/api/moldes/${moldeParaEnviar.id}/artes/imagem`
        + `?papel=${encodeURIComponent(papel)}`;
      const resposta = await fetch(endereco, {
        method: "POST",
        headers: { "Content-Type": arte.file.type || "application/octet-stream" },
        body: arte.file,
      });
      if (!resposta.ok) {
        const erro = await resposta.json().catch(() => ({}));
        throw new Error(erro.error || "o servidor não aceitou a imagem");
      }
      arte.arquivo = (await resposta.json()).arquivo;
    }

    btnArteSalvar.textContent = "Salvando…";
    const resposta = await fetch(`/api/moldes/${moldeParaEnviar.id}/artes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: estampaEmEdicao,
        nome,
        pecas: papeis.map((papel) => ({
          papel,
          arquivo: artesPorPapel[papel].arquivo,
          nomeOriginal: artesPorPapel[papel].nome,
          ajuste: artesPorPapel[papel].ajuste,
        })),
      }),
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error(erro.error || "não deu para salvar");
    }

    // recarrega o molde para a lista vir do servidor, já com a estampa nova
    const idSalva = (await resposta.json()).id;
    const quantidades = Object.fromEntries(estampasDoMolde.map((x) => [x.id, x.unidades]));
    moldeParaEnviar = await (await fetch(`/api/moldes/${moldeParaEnviar.id}`)).json();
    estampasDoMolde = (moldeParaEnviar.artes || [])
      .map((a) => ({ ...a, unidades: quantidades[a.id] || 0 }));
    estampaEmEdicao = idSalva;
    moldeArteTitulo.textContent = `Editando a estampa: ${nome}`;
    renderEstampas();
    atualizarResumoDoEnvio();
  } catch (err) {
    mostrarErroEnvio(`Não deu para salvar a estampa: ${err.message}`);
  } finally {
    btnArteSalvar.disabled = false;
    btnArteSalvar.textContent = dizia;
  }
});

// ==================== O PAINEL DE AJUSTE ====================

/** A prévia é pequena de propósito: serve para conferir, não para imprimir. */
const LADO_DA_PREVIA = 260; // pixels

function desenharPrevia(peca) {
  const arte = artesPorPapel[peca.papel];
  const molde = {
    contorno: peca.contorno, furos: peca.furos || [],
    largura: peca.largura, altura: peca.altura,
  };
  const ppcm = LADO_DA_PREVIA / Math.max(peca.largura, peca.altura, 1);
  return desenharArteNoMolde(molde, arte ? arte.img : null, arte ? arte.ajuste : null, ppcm, {
    fundo: arte ? null : "rgba(140, 152, 158, 0.22)",
    linha: "rgba(226, 236, 240, 0.9)",
    linhaGrossura: 1,
  }).src;
}

function renderPartesDoEnvio() {
  const pecas = pecasDoTamanho();
  moldeEnvioPartes.innerHTML = "";

  if (pecas.length === 0) {
    moldeEnvioPartes.innerHTML = `<p class="hint">Esse tamanho não tem peça nenhuma.</p>`;
    atualizarResumoDoEnvio();
    return;
  }

  pecas.forEach((peca) => {
    const arte = artesPorPapel[peca.papel];
    const ajuste = arte ? arte.ajuste : AJUSTE_PADRAO;
    const papel = escapeHtml(peca.papel);
    const div = document.createElement("div");
    div.className = `parte-arte${arte ? " com-arte" : ""}`;
    div.innerHTML = `
      <div class="parte-arte-previa">
        <img src="${desenharPrevia(peca)}" alt="${papel}" />
      </div>
      <div class="parte-arte-lado">
        <span class="peca-nome">${papel}</span>
        <span class="hint">${emCm(peca.largura)} × ${emCm(peca.altura)} cm · ${peca.quantidade} por peça pronta</span>
        <label class="btn secondary btn-sm file-label">
          ${arte ? "Trocar arte" : "Enviar arte"}
          <input type="file" accept="image/*" class="hidden" data-arte-papel="${papel}" />
        </label>
        ${arte ? `
          <span class="hint">${escapeHtml(arte.nome)} · ${arte.img.width} × ${arte.img.height} px${
            ajuste.tipo === "rapport" ? ` · azulejo de ${medidaDoRapport(arte, ajuste)}` : ""}</span>
          <div class="tipo-de-arte">
            ${TIPOS_DE_ARTE.map((t) => `
              <button type="button"
                      class="btn btn-sm ${t.id === ajuste.tipo ? "" : "secondary"}"
                      data-arte-tipo="${t.id}" data-papel="${papel}"
                      title="${escapeHtml(t.dica)}">${t.nome}</button>`).join("")}
          </div>
          ${ajuste.tipo === "rapport" && !(ajuste.ppcmArquivo > 0) ? `
            <span class="hint aviso">Esse arquivo não traz a resolução gravada. Estou usando
            300 dpi, o que dá o azulejo acima — se a medida não bater com a estampa de verdade,
            corrija no "Tamanho %" ou salve o arquivo com o dpi certo.</span>` : ""}
          <div class="ajustes-arte">
            ${ajuste.tipo === "rapport" ? "" : `
            <label>Como entra
              <select data-ajuste="modo" data-papel="${papel}">
                ${MODOS_DE_ARTE.map((m) =>
                  `<option value="${m.id}"${m.id === ajuste.modo ? " selected" : ""}>${m.nome}</option>`).join("")}
              </select>
            </label>`}
            <label>Tamanho %
              <input type="number" min="10" max="400" step="5" value="${ajuste.escala}"
                     data-ajuste="escala" data-papel="${papel}" />
            </label>
            <label>Girar
              <select data-ajuste="giro" data-papel="${papel}">
                ${[0, 90, 180, 270].map((g) =>
                  `<option value="${g}"${g === ajuste.giro ? " selected" : ""}>${g}°</option>`).join("")}
              </select>
            </label>
            <label>${ajuste.tipo === "rapport" ? "Onde começa (esq./dir.)" : "Esquerda / direita"}
              <input type="number" step="0.5" value="${ajuste.x}" data-ajuste="x" data-papel="${papel}" />
            </label>
            <label>${ajuste.tipo === "rapport" ? "Onde começa (cima/baixo)" : "Cima / baixo"}
              <input type="number" step="0.5" value="${ajuste.y}" data-ajuste="y" data-papel="${papel}" />
            </label>
            <span class="ajustes-botoes">
              <button type="button" class="btn secondary btn-sm" data-arte-centralizar="${papel}">${
                ajuste.tipo === "rapport" ? "Voltar ao começo" : "Centralizar"}</button>
              <button type="button" class="btn danger btn-sm" data-arte-tirar="${papel}">Tirar arte</button>
            </span>
          </div>` : `<span class="hint">Sem arte, vai só o contorno da peça.</span>`}
      </div>
    `;
    moldeEnvioPartes.appendChild(div);
  });

  atualizarResumoDoEnvio();
}

/** Redesenha só as prévias, sem refazer os campos — assim não perde o foco. */
function atualizarPrevias(papel) {
  pecasDoTamanho().forEach((peca, i) => {
    if (papel && peca.papel !== papel) return;
    const alvo = moldeEnvioPartes.children[i];
    const img = alvo && alvo.querySelector(".parte-arte-previa img");
    if (img) img.src = desenharPrevia(peca);
  });
}

function mexerNoAjuste(campo, refazerCampos) {
  const arte = artesPorPapel[campo.dataset.papel];
  if (!arte) return;
  const qual = campo.dataset.ajuste;
  arte.ajuste[qual] = qual === "modo" ? campo.value : Number(campo.value) || 0;
  if (refazerCampos) renderPartesDoEnvio(); else atualizarPrevias(campo.dataset.papel);
}

async function mandarArteParaPapel(papel, file) {
  limparErroEnvio();
  if (!ehArquivoDeArte(file)) {
    return mostrarErroEnvio(`"${file.name}": a arte precisa ser uma imagem (PNG, JPG ou WEBP).`);
  }
  try {
    // O dpi gravado no arquivo é o que diz o tamanho de verdade da imagem, e
    // sem ele não existe rapport: um azulejo de 3000 px pode ser 25 cm ou 1 m.
    // É o mesmo leitor que a tela de Encaixe usa (`pixelsPorCmDoArquivo`).
    const ppcmArquivo = pixelsPorCmDoArquivo(new Uint8Array(await file.arrayBuffer()));
    const img = await carregarImagem(await lerComoDataURL(file));
    // Guarda o arquivo original: é ele que sobe para o servidor quando a
    // estampa for salva, sem passar por conversão nenhuma no meio.
    artesPorPapel[papel] = {
      nome: file.name, img, file,
      ajuste: { ...ajusteNovo(), ppcmArquivo: ppcmArquivo || null },
    };
    renderPartesDoEnvio();
  } catch (err) {
    // Ver o comentário igual em vetor-tela.js: a mensagem amigável não pode ser
    // o único destino do erro, senão bug de código vira "imagem ruim".
    console.error("mandarArteParaPapel:", err);
    mostrarErroEnvio(`"${file.name}": não consegui abrir essa imagem.`);
  }
}

moldeEnvioPartes.addEventListener("change", async (e) => {
  const papelDoArquivo = e.target.dataset.artePapel;
  if (papelDoArquivo) {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (file) await mandarArteParaPapel(papelDoArquivo, file);
    return;
  }
  if (e.target.dataset.ajuste) mexerNoAjuste(e.target, true);
});

moldeEnvioPartes.addEventListener("input", (e) => {
  if (e.target.dataset.ajuste) mexerNoAjuste(e.target, false);
});

moldeEnvioPartes.addEventListener("click", (e) => {
  const tipo = e.target.dataset.arteTipo;
  if (tipo) {
    const arte = artesPorPapel[e.target.dataset.papel];
    if (arte && arte.ajuste.tipo !== tipo) {
      arte.ajuste.tipo = tipo;
      // Trocar de jeito zera o deslocamento: em arte ele é a partir do centro
      // da peça, em rapport é onde a repetição começa. Manter o número velho
      // jogaria a estampa para um canto sem explicação nenhuma.
      arte.ajuste.x = 0;
      arte.ajuste.y = 0;
      renderPartesDoEnvio();
    }
    return;
  }
  const tirar = e.target.dataset.arteTirar;
  if (tirar) {
    delete artesPorPapel[tirar];
    renderPartesDoEnvio();
    return;
  }
  const centralizar = e.target.dataset.arteCentralizar;
  if (centralizar && artesPorPapel[centralizar]) {
    artesPorPapel[centralizar].ajuste.x = 0;
    artesPorPapel[centralizar].ajuste.y = 0;
    renderPartesDoEnvio();
  }
});

// ==================== O QUE VAI PARA O ENCAIXE ====================

/**
 * Cada "trabalho" é uma estampa com a quantidade dela: a que está aberta no
 * painel usa a quantidade de cima, e cada estampa guardada usa a sua. É o que
 * deixa mandar 20 camisetas da caveira e 12 da flor no mesmo tecido.
 */
function trabalhosDoEnvio() {
  const trabalhos = [];
  const unidades = Math.max(0, Math.floor(Number(moldeEnvioUnidades.value) || 0));
  if (unidades > 0) {
    trabalhos.push({
      nome: estampaEmEdicao
        ? (estampasDoMolde.find((x) => x.id === estampaEmEdicao) || {}).nome
        : (Object.keys(artesPorPapel).length > 0 ? String(moldeArteNome.value || "").trim() : ""),
      artes: artesPorPapel,
      unidades,
    });
  }
  estampasDoMolde.forEach((estampa) => {
    if (estampa.unidades > 0 && estampa.id !== estampaEmEdicao) {
      trabalhos.push({ nome: estampa.nome, estampa, unidades: estampa.unidades });
    }
  });
  return trabalhos;
}

function atualizarResumoDoEnvio() {
  if (!moldeParaEnviar) return;
  const pecas = pecasDoTamanho();
  const trabalhos = trabalhosDoEnvio();
  const porUnidade = pecas.reduce((soma, p) => soma + p.quantidade, 0);
  const total = trabalhos.reduce((soma, t) => soma + porUnidade * t.unidades, 0);

  if (pecas.length === 0) {
    moldeEnvioResumo.textContent = "Esse tamanho não tem peça nenhuma.";
  } else if (trabalhos.length === 0) {
    moldeEnvioResumo.textContent = "Nenhuma quantidade pedida ainda.";
  } else {
    const conta = trabalhos
      .map((t) => `${t.unidades} ${t.nome ? `de "${t.nome}"` : "sem estampa"}`).join(" + ");
    moldeEnvioResumo.textContent =
      `${conta} = ${trabalhos.reduce((s, t) => s + t.unidades, 0)} peça(s) pronta(s) × `
      + `${porUnidade} corte(s) cada = ${total} peça(s) para encaixar.`;
  }

  // quanto a arte vai pesar de verdade, no dpi escolhido
  const dpi = Number(moldeEnvioDpi.value) || 150;
  let pontos = 0, ppcmMenor = Infinity, comArte = 0;
  trabalhos.forEach((t) => {
    pecas.forEach((p) => {
      const temArte = t.artes
        ? !!t.artes[p.papel]
        : t.estampa.pecas.some((x) => x.papel === p.papel);
      if (!temArte) return;
      comArte++;
      const ppcm = ppcmDaArte(p.largura, p.altura, dpi);
      ppcmMenor = Math.min(ppcmMenor, ppcm);
      pontos += p.largura * ppcm * p.altura * ppcm;
    });
  });
  if (comArte === 0) {
    moldeEnvioQualidade.textContent = "";
    return;
  }
  const dpiReal = Math.round(ppcmMenor * 2.54);
  moldeEnvioQualidade.textContent =
    `${comArte} peça(s) com arte a ${dpiReal} dpi (${formatarNumero(pontos / 1e6, 0)} milhões de pontos)`
    + (dpiReal < dpi - 1 ? " — abaixei o dpi para caber na memória." : "");
}

moldeEnvioTamanho.addEventListener("change", renderPartesDoEnvio);
moldeEnvioUnidades.addEventListener("input", atualizarResumoDoEnvio);
moldeEnvioDpi.addEventListener("change", atualizarResumoDoEnvio);
btnMoldeEnvioFechar.addEventListener("click", fecharEnvio);
moldeEnvio.addEventListener("click", (e) => { if (e.target === moldeEnvio) fecharEnvio(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !moldeEnvio.classList.contains("hidden")) fecharEnvio();
});

btnMoldeEnviar.addEventListener("click", async () => {
  if (!moldeParaEnviar) return;
  limparErroEnvio();
  const tamanho = moldeEnvioTamanho.value;
  const dpi = Number(moldeEnvioDpi.value) || 150;
  const pecas = pecasDoTamanho();
  if (pecas.length === 0) return mostrarErroEnvio("Esse tamanho não tem peça nenhuma.");

  const trabalhos = trabalhosDoEnvio();
  if (trabalhos.length === 0) {
    return mostrarErroEnvio("Diga quantas peças prontas você quer, aqui em cima ou numa estampa guardada.");
  }

  btnMoldeEnviar.disabled = true;
  const dizia = btnMoldeEnviar.textContent;
  try {
    for (const trabalho of trabalhos) {
      btnMoldeEnviar.textContent = trabalho.nome
        ? `Montando "${trabalho.nome}"…` : "Montando a arte…";

      // Estampa guardada: as imagens só são carregadas aqui, na hora de usar.
      let artes = trabalho.artes;
      if (!artes) {
        artes = {};
        for (const peca of trabalho.estampa.pecas) {
          artes[peca.papel] = {
            nome: peca.nomeOriginal || peca.arquivo,
            img: await carregarImagem(peca.url),
            ajuste: { ...AJUSTE_PADRAO, ...peca.ajuste },
          };
        }
      }

      // A arte grande só é desenhada agora, na hora de mandar: durante o ajuste,
      // a prévia pequena já mostrava o resultado e custava quase nada.
      const comArte = pecas.map((peca) => {
        const arte = artes[peca.papel];
        if (!arte) return { ...peca, estampa: trabalho.nome };
        const ppcm = ppcmDaArte(peca.largura, peca.altura, dpi);
        const desenho = desenharArteNoMolde(
          { contorno: peca.contorno, furos: peca.furos || [], largura: peca.largura, altura: peca.altura },
          arte.img, arte.ajuste, ppcm, { margem: 0 });
        return { ...peca, desenho, arte: arte.nome, estampa: trabalho.nome };
      });

      await mandarMoldeParaOEncaixe(moldeParaEnviar.nome, tamanho, comArte, trabalho.unidades);
    }

    fecharEnvio();
    document.querySelector('.nav-btn[data-page="encaixe"]').click();
  } catch (err) {
    mostrarErroEnvio(`Não deu para mandar ao encaixe: ${err.message}`);
  } finally {
    btnMoldeEnviar.disabled = false;
    btnMoldeEnviar.textContent = dizia;
  }
});

renderTipos();
carregarMoldes();
