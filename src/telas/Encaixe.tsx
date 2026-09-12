/** Estrutura React; listas e canvas são controlados pelo módulo de produção. */
import { memo } from "react";
export const Encaixe = memo(function Encaixe() { return <><div className="page h-full" data-page="encaixe">



<div className="bancada-encaixe flex flex-col gap-3 tela:min-h-0 tela:flex-1 tela:flex-row">



<aside className="bancada-coluna flex max-h-[60vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-linha bg-painel tela:max-h-none tela:w-80">



<div className="barra-bancada flex shrink-0 items-center justify-between gap-2 border-b border-linha bg-painel-suave">

<span className="flex min-w-0 items-baseline gap-2">

<span className="eyebrow shrink-0">
{"ARQUIVOS"}
</span>

<span id="encaixe-contagem" className="truncate font-mono text-[10px] text-tinta-apagada">
{"0 · 0 cóp."}
</span>

</span>

<span className="flex shrink-0 items-center gap-1">

<label className="btn secondary btn-sm file-label mt-0!">
{"\n                    Adicionar\n                    "}
<input type="file" id="encaixe-files" accept="image/*,.dxf,.plt,.hpgl,.svg,.pdf" multiple={true} className="hidden" />

</label>



<button id="btn-limpar-pecas" className="hidden grid size-7 shrink-0 place-items-center rounded-md text-tinta-apagada transition-colors hover:text-[var(--danger)]" type="button" title="Limpar a lista">

<svg className="size-[15px]" viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#trash-2">

</use>
</svg>

</button>

</span>

</div>



<div id="encaixe-aviso-cor" className="hidden">

</div>



<div id="encaixe-barra-grupo" className="hidden shrink-0 items-center gap-1.5 border-b border-linha bg-painel-suave px-3 py-1.5">

<span id="encaixe-grupo-conta" className="min-w-0 flex-1 truncate text-[10px] text-tinta-apagada">

</span>

<button type="button" id="btn-encaixe-criar-grupo" className="btn secondary btn-sm">
{"Criar grupo"}
</button>

<button type="button" id="btn-encaixe-tirar-grupo" className="btn secondary btn-sm hidden">
{"Desagrupar"}
</button>

<button type="button" id="btn-encaixe-limpar-selecao" className="btn-x" title="Limpar a seleção">
{"×"}
</button>

</div>

<div id="encaixe-pecas-body" className="min-h-0 flex-1 overflow-y-auto">

</div>



<div className="shrink-0 space-y-2.5 border-t border-linha p-3">

<p id="encaixe-error" className="hint error hidden m-0!">

</p>

<div id="encaixe-resumo-lateral" className="hidden rounded-xl border border-linha bg-painel-suave p-3">

</div>

<button id="btn-encaixar" className="btn primary w-full justify-center">
{"Optmizar"}
</button>

</div>

</aside>



<section className="bancada-mesa flex min-h-[60vh] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-linha bg-painel tela:min-h-[380px]">



<div className="barra-bancada flex shrink-0 items-center gap-3 border-b border-linha bg-painel-suave">

<span className="eyebrow shrink-0">
{"ÁREA DE TRABALHO"}
</span>

<p id="encaixe-andamento" className="hint hidden m-0! min-w-0 truncate">

</p>



<span id="encaixe-selecao" className="hidden flex shrink-0 items-center gap-2 rounded-[9px] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1">

<span id="encaixe-selecao-contagem" className="text-[0.76rem] font-semibold text-ambar">
{"0 peças"}
</span>

<select id="encaixe-selecao-giro" className="w-auto! px-2! py-1! text-[0.78rem]!" aria-label="Giro das peças selecionadas" defaultValue="180">

<option value="180">
{"Vira 180°"}
</option>

<option value="livre">
{"Livre (90°)"}
</option>

<option value="fixa">
{"Fixa"}
</option>

</select>

<button id="btn-selecao-aplicar" className="btn primary btn-sm" type="button">
{"Aplicar e encaixar"}
</button>

<button id="btn-selecao-limpar" className="btn secondary btn-sm" type="button">
{"Limpar"}
</button>

</span>



<span className="ml-auto flex shrink-0 items-center gap-0.5">

<button id="btn-zoom-menos" className="grid size-7 place-items-center rounded-md text-tinta-fraca transition-colors hover:bg-painel hover:text-tinta" type="button" title="Diminuir zoom">

<svg className="size-[14px]" viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#zoom-out">

</use>
</svg>

</button>

<button id="btn-zoom-ajustar" className="w-12 rounded-md py-1 text-center font-mono text-[11px] text-tinta-fraca transition-colors hover:bg-painel hover:text-tinta" type="button" title="Voltar ao tamanho que cabe na tela">
{"100%"}
</button>

<button id="btn-zoom-mais" className="grid size-7 place-items-center rounded-md text-tinta-fraca transition-colors hover:bg-painel hover:text-tinta" type="button" title="Aumentar zoom">

<svg className="size-[14px]" viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#zoom-in">

</use>
</svg>

</button>

</span>

</div>



<div className="relative min-h-0 flex-1">

<div id="encaixe-resultado" className="peer absolute inset-0 hidden flex flex-col overflow-hidden p-3">

<div className="encaixe-canvas-wrap relative">

<canvas id="encaixe-canvas" className="cursor-crosshair">

</canvas>

</div>

</div>



<div className="mesa-dica pointer-events-none absolute inset-0 hidden place-items-center p-6">

<div className="max-w-sm rounded-2xl border border-linha bg-painel-suave/90 p-6 text-center backdrop-blur-sm">

<span className="mesa-vazia-selo mx-auto grid size-12 place-items-center rounded-xl border border-linha text-tinta-apagada">

<svg className="size-[22px]" viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#blocks">

</use>
</svg>

</span>

<p className="mt-3 mb-0 font-titulo text-base font-semibold text-tinta">
{"Arraste seus arquivos aqui"}
</p>

<p className="mt-1 mb-0 text-[0.8rem] leading-relaxed text-tinta-fraca">
{"\n                      Moldes em DXF, PLT, SVG ou PDF, ou artes em PNG e JPG. A medida vem do próprio\n                      arquivo e a quantidade sai do nome — "}
<span className="font-mono">
{"frente 5x.png"}
</span>
{".\n                    "}
</p>

</div>

</div>



<section id="encaixe-carregamento" className="encaixe-carregamento hidden" aria-live="polite" aria-busy="false">

<div className="encaixe-loading-caixa">

{/* O poço: as peças caem e vão fechando o risco. É decoração, e por isso
    `aria-hidden` — quem não vê a tela recebe o andamento pelo texto e pela
    barra, que ficam logo abaixo. */}
<div className="encaixe-tetris" aria-hidden="true">
<span >
</span>
<span >
</span>
<span >
</span>
<span >
</span>
<span >
</span>
<span >
</span>
<span >
</span>
</div>

<div className="encaixe-loading-topo">

<div className="encaixe-loading-copy">

<span className="eyebrow" id="encaixe-loading-etapa">
{"CALCULANDO ENCAIXE"}
</span>

<strong id="encaixe-loading-titulo">
{"Preparando as peças"}
</strong>

<p id="encaixe-loading-detalhe">
{"Aguarde enquanto o sistema organiza o trabalho."}
</p>

</div>

<div className="encaixe-loading-tempo">

<span >
{"Tempo"}
</span>

<strong id="encaixe-loading-tempo">
{"0,0 s"}
</strong>

</div>

</div>

<div className="encaixe-loading-barra" role="progressbar" aria-label="Andamento do encaixe" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>

<span id="encaixe-loading-fill">

</span>

</div>

<div className="encaixe-loading-rodape">

<div className="encaixe-loading-infos">

<span id="encaixe-loading-pecas">
{"0 peças no trabalho"}
</span>

<span className="encaixe-prioridade-badge">
{"Outras telas pausadas"}
</span>

</div>

<button id="btn-parar-busca" className="btn secondary btn-sm" type="button">
{"Parar e usar este"}
</button>

</div>

</div>

</section>

</div>



<div className="flex shrink-0 items-center gap-4 border-t border-linha bg-painel-suave px-3 py-1.5">

<div className="encaixe-stats" id="encaixe-stats">

</div>

<span className="menu-suspenso ml-auto" id="menu-exportar">

<button id="btn-exportar" className="btn primary btn-sm inline-flex items-center gap-1.5" type="button" aria-haspopup="menu" aria-expanded="false" disabled>

<svg className="size-3.5" viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#share-2">

</use>
</svg>

<span id="btn-exportar-rotulo">
{"Exportar"}
</span>

<svg className="menu-chevron size-3.5" viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#chevron-down">

</use>
</svg>

</button>

<div id="menu-exportar-painel" className="menu-painel direita para-cima hidden" role="menu" aria-label="Exportar">

<button id="btn-encaixe-pdf" className="menu-item" type="button" role="menuitem">

<svg viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#file-down">

</use>
</svg>

<span >

<b >
{"PDF em tamanho real"}
</b>

<small >
{"Para imprimir e cortar na medida certa"}
</small>

</span>

</button>

<button id="btn-baixar-encaixe" className="menu-item" type="button" role="menuitem">

<svg viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#download">

</use>
</svg>

<span >

<b >
{"PNG"}
</b>

<small >
{"O risco como imagem, para conferir ou mandar"}
</small>

</span>

</button>

<button id="btn-imprimir-encaixe" className="menu-item" type="button" role="menuitem">

<svg viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#printer">

</use>
</svg>

<span >

<b >
{"Imprimir"}
</b>

<small >
{"Manda o risco direto para a impressora"}
</small>

</span>

</button>

</div>

</span>

</div>



<div className="mesa-rodape shrink-0 border-t border-linha px-3 py-1.5">

<p id="encaixe-sobras" className="hint error hidden m-0! mb-1.5">

</p>

<p id="encaixe-guardado-aviso" className="aviso-guardado hidden">

</p>

</div>

</section>

</div>



<div id="modal-ajustes" className="modal-fundo modal-animado hidden" role="dialog" aria-modal="true" aria-labelledby="modal-ajustes-titulo">

<div className="modal modal-ajustes">

<div className="ajustes-topo">

<span className="ajustes-selo" aria-hidden="true">

<svg viewBox="0 0 24 24">
<use href="icones.svg#zap">

</use>
</svg>

</span>

<span className="ajustes-topo-texto">

<h3 id="modal-ajustes-titulo">
{"Optmizar"}
</h3>

<p id="ajustes-contagem">
{"0 arquivos · 0 peças no encaixe"}
</p>

</span>

<button type="button" id="btn-fechar-ajustes" className="ajustes-x" title="Fechar" aria-label="Fechar">

<svg viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#x">

</use>
</svg>

</button>

</div>

<div className="ajustes-corpo">

<label className="campo-medida">

<span className="campo-rotulo">
{"Largura de mídia"}
</span>

<span className="campo-caixa">

<input type="number" id="encaixe-largura" min="10" step="1" defaultValue="160" />

<span className="campo-unidade">
{"cm"}
</span>

</span>

</label>



<div className="campo-par">

<label className="campo-medida">

<span className="campo-rotulo">
{"Espaçamento X"}
</span>

<span className="campo-caixa">

<input type="number" id="encaixe-espaco" min="0" max="10" step="0.1" defaultValue="0.5" />

<span className="campo-unidade">
{"cm"}
</span>

</span>

</label>

<label className="campo-medida">

<span className="campo-rotulo">
{"Espaçamento Y"}
</span>

<span className="campo-caixa">

<input type="number" id="encaixe-espaco-y" min="0" max="10" step="0.1" defaultValue="0.5" />

<span className="campo-unidade">
{"cm"}
</span>

</span>

</label>

</div>



<p id="ajustes-aviso-eixo" className="ajustes-nota hidden">

</p>



<div className="campo-bloco">

<span className="campo-rotulo">
{"Economia de tecido"}
</span>

<div className="giro-escolha" role="group" aria-label="Economia de tecido">

<button type="button" className="giro-op" data-giro="livre" aria-pressed="false">

<svg viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#rotate-cw">

</use>
</svg>

<b >
{"Máxima"}
</b>

<small >
{"gira 90°"}
</small>

</button>

<button type="button" className="giro-op" data-giro="180" aria-pressed="true">

<svg viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#flip-vertical">

</use>
</svg>

<b >
{"Equilibrada"}
</b>

<small >
{"vira 180°"}
</small>

</button>

<button type="button" className="giro-op" data-giro="fixa" aria-pressed="false">

<svg viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#lock">

</use>
</svg>

<b >
{"Nenhuma"}
</b>

<small >
{"não gira"}
</small>

</button>

</div>

<select id="encaixe-giro-todas" className="campo-oculto" tabIndex={-1} aria-hidden="true" defaultValue="180">

<option value="livre">
{"Máxima"}
</option>

<option value="180">
{"Equilibrada"}
</option>

<option value="fixa">
{"Nenhuma"}
</option>

</select>

</div>

<div className="campo-par">

<label className="campo-medida">

<span className="campo-rotulo">
{"Bancada"}
</span>

<span className="campo-caixa">

<input type="number" id="encaixe-comprimento" min="0" step="1" placeholder="sem limite" />

<span className="campo-unidade">
{"cm"}
</span>

</span>

</label>

<label className="campo-medida">

<span className="campo-rotulo">
{"Tempo de procura"}
</span>

<span className="campo-caixa">

<input type="number" id="encaixe-tempo" min="1" max="300" step="1" defaultValue="10" />

<span className="campo-unidade">
{"s"}
</span>

</span>

</label>

</div>

<label className="campo-medida">

<span className="campo-rotulo">
{"Jeito de encaixar"}
</span>

<select id="encaixe-modo" defaultValue="auto">

<option value="auto">
{"Automático: rápido e econômico"}
</option>

<option value="contorno">
{"Sempre pelo contorno"}
</option>

<option value="retangulo">
{"Sempre pela caixa em volta"}
</option>

</select>

</label>

<label className="campo-medida">

<span className="campo-rotulo">
{"Unidade do molde"}
</span>

<select id="encaixe-unidade-molde" defaultValue="">

<option value="">
{"Automático"}
</option>

<option value="mm">
{"Milímetro"}
</option>

<option value="cm">
{"Centímetro"}
</option>

<option value="polegada">
{"Polegada"}
</option>

<option value="m">
{"Metro"}
</option>

<option value="unidade de plotter">
{"Unidade de plotter (PLT)"}
</option>

<option value="1000 por polegada">
{"1000 por polegada (PLT)"}
</option>

</select>

</label>

</div>



<div className="ajustes-rodape">

<button type="button" id="btn-ajustes-cancelar" className="btn secondary">
{"Cancelar"}
</button>

<button type="button" id="btn-ajustes-optmizar" className="btn primary">

<svg viewBox="0 0 24 24" aria-hidden="true">
<use href="icones.svg#zap">

</use>
</svg>
{"\n                  Optmizar\n                "}
</button>

</div>

</div>

</div>

</div></>; });
