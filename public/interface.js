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

  function abrirPagina(button) {
    const page = button.dataset.page;
    // Trocar de tela fecha o que estiver por cima. Quem fecha é cada tela, na
    // função de fechar dela — esta casca não sabe, e não deve saber, o que um
    // modal guarda por dentro nem que estado precisa ser zerado junto.
    document.dispatchEvent(new CustomEvent("optimize:trocou-de-tela", { detail: { pagina: page } }));
    navButtons.forEach(b => b.classList.remove("active"));
    pages.forEach(p => p.classList.remove("active"));
    button.classList.add("active");
    const alvo = document.querySelector(`.page[data-page="${page}"]`);
    if (alvo) alvo.classList.add("active");
    const meta = navMeta[page];
    const titulo = button.dataset.title || (meta && meta[0]) || "";
    if (pageTitle) pageTitle.textContent = titulo;
    if (pageSubtitle) pageSubtitle.textContent = (meta && meta[2]) || "";
    if (pageEyebrow) pageEyebrow.textContent = titulo.toUpperCase();
    if (pageIcone && meta && meta[3]) pageIcone.setAttribute("href", meta[3]);
  }

  updateClock();
  window.setInterval(updateClock, 30000);

  menuButton?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", String(open));
  });

  navButtons.forEach(button => {
    button.addEventListener("click", () => {
      abrirPagina(button);
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
