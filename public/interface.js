/**
 * ===========================================================================
 * INTERFACE — o menu lateral, a troca de tela e o relógio
 * ===========================================================================
 *
 * A casca da tela, sem nenhuma regra de negócio: monta os rótulos do menu a
 * partir de uma tabela, troca qual página está visível, abre e fecha o menu no
 * celular e mantém a hora do topo andando.
 *
 * Todas as telas moram no mesmo index.html; o que muda ao clicar no menu é
 * qual `<div class="page">` está com a classe `active` — mais o título e a
 * linha de apoio do topo.
 *
 * Não sabe o que é molde, encaixe ou vetor — só quais botões existem. Tela
 * nova entra em `navMeta` e mais nada precisa mudar aqui.
 */

(() => {
  const sidebar = document.querySelector(".sidebar");
  const menuButton = document.getElementById("mobile-menu-btn");
  const dateElement = document.getElementById("current-date");
  const timeElement = document.getElementById("current-time");
  const pageTitle = document.getElementById("page-title");
  const pageSubtitle = document.getElementById("page-subtitle");
  const pageEyebrow = document.getElementById("page-eyebrow");
  const pageIcone = document.getElementById("page-icone");

  // Para cada tela: [rótulo do menu, linha de apoio do menu, linha de apoio do
  // topo, ícone]. O ícone vai escrito inteiro, com o caminho do sprite, porque
  // é assim que o empacotar/icones.js enxerga que ele é usado — montar a string
  // em pedaços aqui deixaria o desenho de fora do sprite gerado.
  const navMeta = {
    moldes: ["Moldes", "Modelagem da produção", "Centralize moldes, tamanhos e estampas da produção.", "icones.svg#shapes"],
    projetos: ["Projetos", "Trabalho que se repete", "Guarde por cliente o trabalho pronto para repetir e mandar ao encaixe.", "icones.svg#folder-open"],
    encaixe: ["Encaixe", "Aproveitamento do tecido", "Otimize o uso do tecido e prepare arquivos para impressão.", "icones.svg#blocks"],
    cor: ["Cor", "Arte na cor certa", "Converta arte em CMYK para a cor certa antes de mandar ao encaixe.", "icones.svg#palette"],
    vetor: ["Vetor", "Traço a partir da imagem", "Transforme uma imagem em desenho vetorial para corte e impressão.", "icones.svg#spline"]
  };

  const navButtons = document.querySelectorAll(".nav-btn");
  const pages = document.querySelectorAll(".page");

  navButtons.forEach(button => {
    const page = button.dataset.page;
    const label = button.querySelector(":scope > span:last-child");
    const meta = navMeta[page];
    if (label && meta) {
      label.className = "nav-copy";
      label.innerHTML = `<strong>${meta[0]}</strong><small>${meta[1]}</small>`;
      button.setAttribute("aria-label", meta[0]);
      button.title = meta[0];
    }
  });

  function updateClock() {
    const now = new Date();
    if (dateElement) {
      dateElement.textContent = new Intl.DateTimeFormat("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short"
      }).format(now).replace(".", "");
    }
    if (timeElement) {
      timeElement.textContent = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(now);
    }
  }

  function closeMenu() {
    document.body.classList.remove("menu-open");
    menuButton?.setAttribute("aria-expanded", "false");
  }

  // ==================== O ENDEREÇO ====================
  //
  // Cada tela tem um endereço: `#/encaixe`, `#/moldes`, e por aí. Sem isso,
  // recarregar a página devolvia a pessoa para Moldes no meio do trabalho, e
  // não havia como mandar um link de uma tela para alguém.
  //
  // É no `#` de propósito, e não em caminho de verdade (`/encaixe`). O que
  // vem depois do `#` NUNCA chega ao servidor: o `express.static` continua
  // servindo um index.html só, sem rota nenhuma para configurar e sem 404 em
  // recarga. Caminho de verdade exigiria uma rota-curinga no server.js, e o
  // ganho seria um endereço mais bonito.
  //
  // Como o `#` é história do navegador, voltar e avançar passaram a andar
  // pelas telas de graça.

  /** O nome da tela escrito no endereço, ou `null` se não houver um válido. */
  function paginaDoEndereco() {
    const nome = decodeURIComponent(location.hash.replace(/^#\/?/, "")).trim();
    return Object.prototype.hasOwnProperty.call(navMeta, nome) ? nome : null;
  }

  const botaoDaPagina = (page) => document.querySelector(`.nav-btn[data-page="${page}"]`);

  /**
   * Pinta a tela: quem fica visível, o que o topo diz, o que o <body> marca.
   * Não mexe no endereço nem avisa ninguém — é só o desenho.
   */
  function pintarPagina(page) {
    const button = botaoDaPagina(page);
    navButtons.forEach(b => b.classList.remove("active"));
    pages.forEach(p => p.classList.remove("active"));
    if (button) button.classList.add("active");
    const alvo = document.querySelector(`.page[data-page="${page}"]`);
    if (alvo) alvo.classList.add("active");
    // Qual tela está aberta, escrito no <body>. O cabeçalho e o outlet são
    // IRMÃOS das telas, não pais: sem esta marca lá em cima, uma tela não tem
    // como pedir a casca inteira para si. É o que deixa a bancada do encaixe
    // apagar o topo e ocupar os 100vh — a regra mora no interface.css.
    document.body.dataset.tela = page;
    const meta = navMeta[page];
    const titulo = (button && button.dataset.title) || (meta && meta[0]) || "";
    if (pageTitle) pageTitle.textContent = titulo;
    if (pageSubtitle) pageSubtitle.textContent = (meta && meta[2]) || "";
    if (pageEyebrow) pageEyebrow.textContent = titulo.toUpperCase();
    if (pageIcone && meta && meta[3]) pageIcone.setAttribute("href", meta[3]);
  }

  /**
   * Vai para uma tela: pinta, avisa quem precisa saber e grava o endereço.
   *
   * `gravarEndereco` é falso quando quem mandou abrir FOI o endereço (chegada
   * pela URL, ou o botão voltar): escrever o mesmo `#` de volta ali criaria
   * uma entrada de história a cada volta, e o botão voltar deixaria de sair
   * do lugar.
   */
  function abrirPagina(page, gravarEndereco = true) {
    // Trocar de tela fecha o que estiver por cima. Quem fecha é cada tela, na
    // função de fechar dela — esta casca não sabe, e não deve saber, o que um
    // modal guarda por dentro nem que estado precisa ser zerado junto.
    document.dispatchEvent(new CustomEvent("optimize:trocou-de-tela", { detail: { pagina: page } }));
    pintarPagina(page);
    if (gravarEndereco && location.hash !== `#/${page}`) location.hash = `#/${page}`;
  }

  // A TELA DA PARTIDA
  //
  // Pinta na hora, antes de qualquer outra coisa, para não haver o pisca de
  // Moldes aparecendo e sendo trocado por Encaixe.
  const telaDaPartida = paginaDoEndereco()
    || (document.querySelector(".page.active") || {}).dataset?.page
    || "moldes";
  pintarPagina(telaDaPartida);
  // `replaceState` e não `location.hash`: entrar sem endereço não deveria
  // gastar uma entrada de história, senão o primeiro "voltar" da visita não
  // sai da página.
  if (location.hash !== `#/${telaDaPartida}`) {
    history.replaceState(null, "", `#/${telaDaPartida}`);
  }

  // O aviso da partida fica para o DOMContentLoaded: este arquivo carrega
  // antes de todas as telas, e quem escuta "trocou-de-tela" só se registra nos
  // arquivos abaixo. Avisar agora seria falar numa sala vazia — e é disso que
  // depende, por exemplo, a estante de Projetos ser montada quando alguém
  // recarrega já em #/projetos.
  document.addEventListener("DOMContentLoaded", () => {
    document.dispatchEvent(new CustomEvent("optimize:trocou-de-tela", {
      detail: { pagina: telaDaPartida, partida: true },
    }));
  });

  // Voltar, avançar, ou um endereço digitado na barra.
  window.addEventListener("hashchange", () => {
    const nome = paginaDoEndereco();
    // Endereço que não é tela — o `#main-content` do link de pular o conteúdo,
    // ou um nome inventado na barra — devolve o endereço da tela aberta em vez
    // de trocar de página. `replaceState` não dispara `hashchange`, então isto
    // não vira laço.
    if (!nome) {
      history.replaceState(null, "", `#/${document.body.dataset.tela || "moldes"}`);
      return;
    }
    if (nome === document.body.dataset.tela) return;
    abrirPagina(nome, false);
    closeMenu();
  });

  updateClock();
  window.setInterval(updateClock, 30000);

  menuButton?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", String(open));
  });

  navButtons.forEach(button => {
    button.addEventListener("click", () => {
      abrirPagina(button.dataset.page);
      closeMenu();
    });
  });

  document.addEventListener("click", event => {
    if (!document.body.classList.contains("menu-open")) return;
    if (sidebar?.contains(event.target) || menuButton?.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });
})();
