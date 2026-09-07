/**
 * A tela de Macros.
 *
 * Ela instala a macro do CorelDRAW num clique — o servidor mexe no projeto VSTA
 * pela pessoa (ver macros-api.js).
 *
 * O caminho manual continua escrito na tela, e não escondido atrás de um "ver
 * detalhes": a instalação automática depende de achar o Corel e de ele estar
 * fechado, e quando qualquer uma das duas falha a pessoa precisa da saída à
 * mão ali mesmo, e não numa página de ajuda.
 */

const macrosLista = document.getElementById("macros-lista");
const macrosCorel = document.getElementById("macros-corel");

const macrosEstado = { macros: [], corel: null };

function formatarKb(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatarQuando(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(d);
}

/** A faixa de cima: o que o sistema sabe do Corel desta máquina. */
function renderCorel() {
  const c = macrosEstado.corel;
  if (!c) { macrosCorel.classList.add("hidden"); return; }
  macrosCorel.classList.remove("hidden");

  if (c.encontrado) {
    macrosCorel.className = "mb-3 rounded-lg border border-linha bg-painel-suave px-3 py-2";
    macrosCorel.innerHTML =
      `<span class="flex items-center gap-2 text-[11px] text-tinta">
         <svg class="size-3.5 shrink-0 text-[var(--ok,#3b8)]" viewBox="0 0 24 24" aria-hidden="true"><use href="icones.svg#circle-check" /></svg>
         <strong>${escapeHtml(c.versao)}</strong> encontrado nesta máquina.
       </span>
       <span class="mt-1 block break-all font-mono text-[9px] text-tinta-apagada">${escapeHtml(c.pasta)}</span>`;
  } else {
    macrosCorel.className = "mb-3 rounded-lg border border-linha px-3 py-2";
    macrosCorel.innerHTML =
      `<span class="flex items-center gap-2 text-[11px] text-tinta-apagada">
         <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true"><use href="icones.svg#plug" /></svg>
         Não achei o CorelDRAW nesta máquina — dá para baixar o arquivo e guardar onde preferir.
       </span>`;
  }
}

function renderMacros() {
  if (macrosEstado.macros.length === 0) {
    macrosLista.innerHTML =
      `<p class="px-3 py-6 text-center text-[11px] text-tinta-apagada">Nenhuma macro disponível.</p>`;
    return;
  }

  const temCorel = macrosEstado.corel && macrosEstado.corel.encontrado;

  macrosLista.innerHTML = macrosEstado.macros.map((m) => `
    <article class="rounded-lg border border-linha">
      <div class="flex items-start gap-3 px-3 py-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg border border-linha text-ambar">
          <svg class="size-4" viewBox="0 0 24 24" aria-hidden="true"><use href="icones.svg#puzzle" /></svg>
        </span>
        <span class="min-w-0 flex-1">
          <strong class="block text-[12px] text-tinta">
            ${escapeHtml(m.nome)}
            ${m.instalada
              ? `<span class="ml-1 rounded border border-linha px-1 py-px align-middle text-[9px] font-normal text-[var(--ok,#3b8)]">instalada</span>`
              : ""}
          </strong>
          <span class="mt-0.5 block text-[11px] leading-snug text-tinta-apagada">${escapeHtml(m.resumo)}</span>
          <span class="mt-1 block font-mono text-[9px] text-tinta-apagada">
            ${escapeHtml(m.arquivo)} · ${formatarKb(m.bytes)} · ${formatarQuando(m.atualizado)}
          </span>
        </span>
      </div>

      <div class="flex flex-wrap gap-1.5 border-t border-linha px-3 py-2">
        ${(m.arquivos || [m.arquivo]).map((nome) => `
          <a class="btn secondary btn-sm" href="/api/macros/${m.id}/arquivo/${encodeURIComponent(nome)}" download>${escapeHtml(nome)}</a>
        `).join("")}
        ${temCorel && !m.instalada
          ? `<button type="button" class="btn primary btn-sm" data-instalar="${m.id}">Instalar no Corel</button>`
          : ""}
        ${temCorel && m.instalada
          ? `<button type="button" class="btn secondary btn-sm" data-remover="${m.id}">Remover do Corel</button>`
          : ""}
        ${temCorel
          ? `<button type="button" class="btn secondary btn-sm" data-salvar="${m.id}">Só salvar o arquivo</button>`
          : ""}
      </div>

      ${m.instalada ? `
        <p class="m-0 border-t border-linha px-3 py-2.5 text-[11px] leading-relaxed text-tinta-apagada">
          Já está no Corel. Para usar: <strong class="text-tinta">Ferramentas &gt; Macros &gt;
          Executar macro</strong> e rode <code>${escapeHtml(m.macro)}</code>.
        </p>
      ` : `
        <!--
          Os passos manuais ficam à vista mesmo com o botão de instalar logo
          acima: o botão recusa quando o Corel está aberto, e nessa hora a
          pessoa precisa da alternativa na mesma tela.
        -->
        <ol class="m-0 list-none border-t border-linha px-3 py-2.5 text-[11px] leading-relaxed text-tinta-apagada">
          <li class="mb-1 text-tinta">Se preferir fazer à mão:</li>
          <li><strong class="text-tinta">1.</strong> No Corel: <strong class="text-tinta">Ferramentas &gt; Macros &gt; Editor de macros</strong> (Alt+F11).</li>
          <li><strong class="text-tinta">2.</strong> No Solution Explorer, botão direito no projeto &gt;
              <strong class="text-tinta">Add &gt; Existing Item</strong> e escolha o <code>${escapeHtml(m.arquivo)}</code>.</li>
          <li><strong class="text-tinta">3.</strong> Salve e feche o editor.</li>
          <li><strong class="text-tinta">4.</strong> <strong class="text-tinta">Ferramentas &gt; Macros &gt; Executar macro</strong> e rode <code>${escapeHtml(m.macro)}</code>.</li>
        </ol>
      `}

      <p class="m-0 border-t border-linha px-3 py-2 text-[10px] leading-relaxed text-tinta-apagada">
        Para virar botão ou atalho: <strong class="text-tinta">Ferramentas &gt; Opções &gt; Personalização &gt;
        Comandos</strong>, escolha <strong class="text-tinta">Macros</strong> na lista e arraste
        <code>${escapeHtml(m.macro)}</code> para uma barra — ou dê a ela uma tecla de atalho.
      </p>

      <p class="m-0 border-t border-linha px-3 py-2 text-[10px] leading-relaxed text-tinta-apagada">
        A macro só roda com o Optimize aberto: ela pergunta ao sistema se ele está de pé antes de começar.
        Para instalar ou remover, o CorelDRAW precisa estar <strong class="text-tinta">fechado</strong> —
        ao fechar, ele reescreve o projeto de macros e desfaria o que foi feito.
      </p>
    </article>
  `).join("");
}

async function carregarMacros() {
  try {
    const resposta = await fetch("/api/macros");
    if (!resposta.ok) throw new Error("o servidor não respondeu");
    const dados = await resposta.json();
    macrosEstado.macros = dados.macros || [];
    macrosEstado.corel = dados.corel || null;
  } catch (err) {
    macrosEstado.macros = [];
    macrosEstado.corel = null;
    macrosLista.innerHTML =
      `<p class="px-3 py-6 text-center text-[11px] text-tinta-apagada">
         Não deu para carregar a lista de macros: ${escapeHtml(err.message)}
       </p>`;
    return;
  }
  renderCorel();
  renderMacros();
}

if (macrosLista) {
  macrosLista.addEventListener("click", async (e) => {
    const instalar = e.target.closest("[data-instalar], [data-remover]");
    if (instalar) {
      await instalarNoCorel(instalar);
      return;
    }

    const botao = e.target.closest("[data-salvar]");
    if (!botao) return;

    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Salvando…";
    try {
      const resposta = await fetch(`/api/macros/${botao.dataset.salvar}/salvar-no-corel`,
        { method: "POST" });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "não deu");
      botao.textContent = "Salvo — a pasta abriu";
      // O caminho fica escrito na tela: se o Explorer não abrir (acontece em
      // sessão remota), a pessoa ainda sabe para onde ir.
      const onde = document.createElement("p");
      onde.className = "m-0 break-all px-3 pb-2 font-mono text-[9px] text-tinta-apagada";
      onde.textContent = dados.caminho;
      botao.closest("article").appendChild(onde);
    } catch (err) {
      botao.disabled = false;
      botao.textContent = rotulo;
      mostrarErroMacros(err.message);
    }
  });
}

/**
 * Instala ou remove a macro do projeto do Corel.
 *
 * Ao terminar, recarrega a lista em vez de mexer no botão: o que mudou não é só
 * o rótulo dele — mudam o selo, os passos e o outro botão. Um só lugar decide
 * como a tela fica, e é o `renderMacros`.
 */
async function instalarNoCorel(botao) {
  const remover = botao.hasAttribute("data-remover");
  const id = remover ? botao.dataset.remover : botao.dataset.instalar;

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = remover ? "Removendo…" : "Instalando…";
  try {
    const resposta = await fetch(
      `/api/macros/${id}/instalar-no-corel${remover ? "?remover=1" : ""}`,
      { method: "POST" });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error || "não deu");
    await carregarMacros();
  } catch (err) {
    botao.disabled = false;
    botao.textContent = rotulo;
    mostrarErroMacros(err.message);
  }
}

function mostrarErroMacros(mensagem) {
  const aviso = document.createElement("p");
  aviso.className = "m-0 px-3 py-2 text-[11px] text-[var(--danger)]";
  aviso.textContent = mensagem;
  macrosLista.prepend(aviso);
  setTimeout(() => aviso.remove(), 6000);
}

document.addEventListener("DOMContentLoaded", () => {
  if (macrosLista) carregarMacros();
});
