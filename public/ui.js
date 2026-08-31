/**
 * ===========================================================================
 * UI — a caixa de diálogo do sistema
 * ===========================================================================
 *
 * Mais `escapeHtml`, no fim do arquivo: o que toda tela usa antes de jogar
 * texto de fora dentro de um `innerHTML`.
 *
 * Substitui `alert`, `confirm` e `prompt` do navegador por uma caixa que
 * combina com o resto da tela. Três portas:
 *
 *   `uiAlert(texto)`     avisa e espera o "Entendi";
 *   `uiConfirm(texto)`   pergunta sim/não e devolve `true`/`false`;
 *   `uiPergunta({...})`  pede um texto e devolve o que foi escrito, ou `null`.
 *
 * As três devolvem promessa, então quem chama escreve `await` e lê o resultado
 * na linha seguinte, sem callback.
 *
 * Existe um motivo além do visual: as caixas nativas **travam a página
 * inteira** enquanto estão abertas, o que atrapalha qualquer coisa rodando em
 * segundo plano — e o Encaixe passa minutos calculando.
 */

(() => {
  const backdrop = document.getElementById("ui-dialog");
  const dialog = backdrop.querySelector(".ui-dialog");
  const title = document.getElementById("ui-dialog-title");
  const message = document.getElementById("ui-dialog-message");
  const kicker = document.getElementById("ui-dialog-kicker");
  const icon = document.getElementById("ui-dialog-icon");
  const cancel = document.getElementById("ui-dialog-cancel");
  const confirm = document.getElementById("ui-dialog-confirm");
  const campo = document.getElementById("ui-dialog-input");
  let finish = null;

  function close(result) {
    backdrop.classList.add("closing");
    setTimeout(() => {
      backdrop.classList.add("hidden");
      backdrop.classList.remove("closing");
      document.body.classList.remove("dialog-open");
      if (finish) finish(result);
      finish = null;
    }, 140);
  }

  function open(options) {
    if (finish) finish(false);
    // O campo de texto só aparece quando a caixa está perguntando alguma coisa.
    campo.classList.toggle("hidden", !options.campo);
    campo.value = options.valor || "";
    campo.placeholder = options.exemplo || "";
    title.textContent = options.title;
    message.textContent = options.message;
    kicker.textContent = options.kicker;
    icon.textContent = options.danger ? "!" : "✓";
    dialog.classList.toggle("danger-dialog", !!options.danger);
    cancel.classList.toggle("hidden", !options.cancel);
    confirm.textContent = options.confirmText || "Entendi";
    confirm.className = `btn ${options.danger ? "danger" : "primary"}`;
    backdrop.classList.remove("hidden");
    document.body.classList.add("dialog-open");
    requestAnimationFrame(() => (options.campo ? campo.select() : confirm.focus()));
    return new Promise((resolve) => { finish = resolve; });
  }

  window.uiConfirm = (text, options = {}) => open({
    title: options.title || "Confirmar ação",
    message: text,
    kicker: options.kicker || "CONFIRMAÇÃO",
    confirmText: options.confirmText || "Confirmar",
    cancel: true,
    danger: options.danger !== false
  });
  window.uiAlert = (text, options = {}) => open({
    title: options.title || "Atenção",
    message: text,
    kicker: options.kicker || "AVISO DO SISTEMA",
    confirmText: "Entendi",
    cancel: false,
    danger: !!options.danger
  });

  /**
   * Pergunta que espera um texto de volta: devolve o que foi escrito, ou null
   * se a pessoa desistir.
   */
  window.uiPergunta = (options = {}) => open({
    title: options.titulo || "Digite",
    message: options.texto || "",
    kicker: options.kicker || "",
    confirmText: options.confirmar || "Confirmar",
    cancel: options.cancelavel !== false,
    danger: false,
    campo: true,
    valor: options.valor,
    exemplo: options.exemplo,
  }).then((ok) => (ok ? campo.value.trim() : null));

  cancel.addEventListener("click", () => close(false));
  confirm.addEventListener("click", () => close(true));
  // Enter no campo vale como clicar em confirmar.
  campo.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); close(true); }
  });
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop && !cancel.classList.contains("hidden")) close(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.classList.contains("hidden") && !cancel.classList.contains("hidden")) close(false);
  });
})();

/**
 * Nome de molde, de peça ou de estampa entra em `innerHTML` em várias telas.
 * O texto vem de fora (do arquivo que a pessoa mandou, do que ela digitou),
 * então passa por aqui antes: um `<` solto quebraria a lista inteira.
 */
window.escapeHtml = (texto) => String(texto ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");
