/*
 * ===========================================================================
 * A TELA DE ATUALIZAÇÃO — injetada pelo `main.rs`, em qualquer página
 * ===========================================================================
 *
 * Quem baixa e instala é o Rust; esta é só a parte que se vê. Ela entra por
 * `eval` na página que estiver aberta, seja a tela que for, e por isso:
 *
 *   - se DEFINE uma vez só (`window.__optmizeAtualizacao`), e o Rust manda o
 *     script inteiro em toda chamada: se a página recarregou no meio do
 *     download, a próxima chamada a reconstrói sem ninguém perceber;
 *   - mora num SHADOW DOM: o Tailwind do sistema não pinta o cartão, e o CSS
 *     do cartão não pinta o sistema;
 *   - traz as cores escritas à mão, as mesmas de `empacotar/janela/index.html`,
 *     porque no fim da instalação o servidor que serve o CSS já morreu.
 *
 * Duas formas:
 *
 *   "baixando"     um cartão no canto de baixo, à direita. A pessoa continua
 *                  trabalhando; o cartão não pega clique de nada fora dele.
 *   "reiniciando"  a tela inteira, com a marca e o anel da abertura, contando
 *   "instalando"   os segundos e depois avisando que o programa reabre sozinho.
 *
 * O valor de `LOGO` é trocado pelo `main.rs` pela marca em data URI: ela precisa
 * aparecer mesmo com o servidor já desligado.
 */
if (!window.__optmizeAtualizacao) {
  (function () {
    var LOGO = "__LOGO__";
    var host = null;
    var raiz = null;

    var CSS = [
      ":host { all: initial; }",
      "* { box-sizing: border-box; }",
      ".tudo { --bg:#0b0b0c; --painel:#141416; --text:#f4f2ef; --dim:#a09a93;",
      "  --accent:#ff531f; --linha:rgba(244,242,239,.08);",
      "  font-family:'Segoe UI',system-ui,sans-serif; color:var(--text); user-select:none; }",

      /* ---------------------------------------------------------- o cartão */
      ".cartao { position:fixed; right:22px; bottom:22px; width:320px; padding:16px 16px 15px;",
      "  border-radius:18px; background:rgba(20,20,22,.92); border:1px solid var(--linha);",
      "  box-shadow:0 24px 60px -20px rgba(0,0,0,.85), 0 0 0 1px rgba(255,83,31,.05);",
      "  backdrop-filter:blur(18px) saturate(1.3); -webkit-backdrop-filter:blur(18px) saturate(1.3);",
      "  pointer-events:auto; overflow:hidden;",
      "  opacity:0; transform:translateY(16px) scale(.97);",
      "  transition:opacity .45s cubic-bezier(.16,1,.3,1), transform .45s cubic-bezier(.16,1,.3,1); }",
      ".cartao.visivel { opacity:1; transform:none; }",
      /* o brilho laranja que respira atrás do cartão */
      ".cartao::before { content:''; position:absolute; right:-60px; top:-70px; width:180px; height:180px;",
      "  border-radius:50%; background:var(--accent); filter:blur(60px); opacity:.13;",
      "  animation:respirar 5s ease-in-out infinite; pointer-events:none; }",
      ".topo { position:relative; display:flex; align-items:center; gap:12px; }",
      ".mini { position:relative; width:42px; height:42px; flex:none; display:grid; place-items:center; }",
      ".mini img { width:22px; height:22px; display:block; }",
      ".mini svg, .grande svg { position:absolute; inset:0; }",
      ".titulo { margin:0; font-size:14px; font-weight:600; letter-spacing:.01em; }",
      ".sub { margin:2px 0 0; font-size:12px; color:var(--dim); }",
      ".barra { position:relative; margin-top:14px; height:6px; border-radius:99px;",
      "  background:rgba(244,242,239,.07); overflow:hidden; }",
      ".enchimento { position:absolute; inset:0 auto 0 0; width:0%; border-radius:inherit; overflow:hidden;",
      "  background:linear-gradient(90deg,#ff7a45,var(--accent));",
      "  box-shadow:0 0 14px rgba(255,83,31,.55); transition:width .5s cubic-bezier(.16,1,.3,1); }",
      /* o reflexo que corre por dentro da barra, para ela nunca parecer parada */
      ".enchimento::after { content:''; position:absolute; inset:0;",
      "  background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);",
      "  transform:translateX(-100%); animation:reflexo 1.6s ease-in-out infinite; }",
      ".barra.sem-total .enchimento { width:35% !important; animation:vaivem 1.4s ease-in-out infinite; }",
      ".rodape { position:relative; display:flex; justify-content:space-between; margin-top:9px;",
      "  font-size:11.5px; color:var(--dim); font-variant-numeric:tabular-nums; }",
      ".rodape b { color:var(--text); font-weight:600; }",

      /* ------------------------------------------------------ a tela cheia */
      ".cheia { position:fixed; inset:0; display:grid; place-items:center; background:var(--bg);",
      "  pointer-events:auto; opacity:0; transition:opacity .5s ease; }",
      ".cheia.visivel { opacity:1; }",
      ".cheia[hidden] { display:none; }",
      ".cheia::before { content:''; position:absolute; left:50%; top:50%; width:340px; height:340px;",
      "  transform:translate(-50%,-50%); border-radius:50%; background:var(--accent);",
      "  filter:blur(100px); opacity:.11; animation:respirar 5.5s ease-in-out infinite; }",
      ".bloco { position:relative; display:grid; justify-items:center; width:min(380px,86vw);",
      "  transform:translateY(10px) scale(.97); transition:transform .7s cubic-bezier(.16,1,.3,1); }",
      ".cheia.visivel .bloco { transform:none; }",
      ".grande { position:relative; width:132px; height:132px; display:grid; place-items:center; }",
      ".grande img { width:74px; height:74px; display:block; animation:pulsar 4.2s ease-in-out infinite; }",
      ".cheia .titulo { margin-top:26px; font-size:21px; }",
      ".cheia .sub { margin-top:8px; font-size:13.5px; text-align:center; min-height:1.4em; }",
      ".cheia .barra { width:100%; margin-top:26px; height:5px; }",
      ".cheia .rodape { width:100%; }",

      /* ----------------------------------------------------------- o anel */
      "circle { fill:none; transform-origin:50% 50%; }",
      ".trilho { stroke:rgba(244,242,239,.07); }",
      ".arco { stroke:var(--accent); stroke-linecap:round;",
      "  animation:girar 2.4s cubic-bezier(.62,.03,.38,.97) infinite; }",
      ".grande .arco { stroke-dasharray:78 352; animation:girar 2.4s cubic-bezier(.62,.03,.38,.97) infinite, esticar 2.4s ease-in-out infinite; }",
      ".mini .arco { stroke-dasharray:28 120; }",

      "@keyframes girar { to { transform:rotate(360deg); } }",
      "@keyframes esticar { 0%,100% { stroke-dasharray:40 352; } 50% { stroke-dasharray:132 352; } }",
      "@keyframes pulsar { 0%,100% { transform:scale(1); } 50% { transform:scale(1.035); } }",
      "@keyframes respirar { 0%,100% { opacity:.12; } 50% { opacity:.06; } }",
      "@keyframes reflexo { to { transform:translateX(100%); } }",
      "@keyframes vaivem { 0% { transform:translateX(-100%); } 100% { transform:translateX(290%); } }",

      "@media (prefers-reduced-motion: reduce) {",
      "  *, *::before, *::after { animation:none !important; transition:none !important; } }",
    ].join("\n");

    function anel(tamanho, raio, largura) {
      var c = tamanho / 2;
      return '<svg viewBox="0 0 ' + tamanho + " " + tamanho + '" aria-hidden="true">' +
        '<circle class="trilho" cx="' + c + '" cy="' + c + '" r="' + raio + '" stroke-width="' + largura + '"/>' +
        '<circle class="arco" cx="' + c + '" cy="' + c + '" r="' + raio + '" stroke-width="' + largura + '"/></svg>';
    }

    function montar() {
      // A página pode ter trocado o <body> inteiro (recarga, navegação): o
      // host antigo ficou para trás, e um novo é criado.
      if (host && host.isConnected) return;
      host = document.createElement("div");
      host.id = "optmize-atualizacao";
      host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
      raiz = host.attachShadow({ mode: "open" });
      raiz.innerHTML =
        "<style>" + CSS + "</style>" +
        '<div class="tudo">' +
        '  <div class="cartao" role="status" aria-live="polite">' +
        '    <div class="topo">' +
        '      <div class="mini">' + anel(42, 18, 1.6) + '<img alt="" src="' + LOGO + '"/></div>' +
        '      <div><p class="titulo">Atualizando o Optmize</p>' +
        '        <p class="sub">Pode continuar trabalhando</p></div>' +
        "    </div>" +
        '    <div class="barra"><div class="enchimento"></div></div>' +
        '    <div class="rodape"><span class="versao"></span><b class="porcento"></b></div>' +
        "  </div>" +
        '  <div class="cheia" role="alertdialog" aria-live="assertive" hidden>' +
        '    <div class="bloco">' +
        '      <div class="grande">' + anel(132, 56, 1.5) + '<img alt="" src="' + LOGO + '"/></div>' +
        '      <p class="titulo">Atualizando o Optmize</p>' +
        '      <p class="sub"></p>' +
        '      <div class="barra"><div class="enchimento"></div></div>' +
        '      <div class="rodape"><span class="versao"></span><b class="porcento"></b></div>' +
        "    </div>" +
        "  </div>" +
        "</div>";
      (document.body || document.documentElement).appendChild(host);
    }

    function preencher(caixa, estado) {
      var barra = caixa.querySelector(".barra");
      var temTotal = typeof estado.porcento === "number";
      barra.classList.toggle("sem-total", !temTotal);
      caixa.querySelector(".enchimento").style.width = (temTotal ? estado.porcento : 0) + "%";
      caixa.querySelector(".porcento").textContent = temTotal ? estado.porcento + "%" : "";
      caixa.querySelector(".versao").textContent = estado.versao ? "Versão " + estado.versao : "";
    }

    window.__optmizeAtualizacao = function (estado) {
      if (!estado || estado.fase === "oculto") {
        if (host) host.remove();
        host = null;
        return;
      }
      montar();
      var cartao = raiz.querySelector(".cartao");
      var cheia = raiz.querySelector(".cheia");

      if (estado.fase === "baixando") {
        preencher(cartao, estado);
        // Dois quadros: o primeiro põe o cartão na página, o segundo anima.
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { cartao.classList.add("visivel"); });
        });
        return;
      }

      // "reiniciando" / "instalando": a tela inteira, e agora ela pega o clique
      // — mexer no sistema com o servidor morrendo só geraria erro na tela.
      host.style.pointerEvents = "auto";
      cartao.classList.remove("visivel");
      cheia.hidden = false;
      preencher(cheia, estado);
      cheia.querySelector(".sub").textContent =
        estado.fase === "reiniciando"
          ? "Download concluído. Reiniciando em " + estado.segundos + "…"
          : "Instalando… o Optmize reabre sozinho em instantes.";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { cheia.classList.add("visivel"); });
      });
    };
  })();
}
