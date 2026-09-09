/** Estrutura React; listas e canvas são controlados pelo módulo de produção. */
import { memo } from "react";
export const Moldes = memo(function Moldes() { return <><div className="page active" data-page="moldes">

<section className="card">

<div className="card-head">

<div className="card-head-copy">

<h2 >
{"Moldes guardados"}
</h2>

<p className="hint">
{"Cada molde guarda o contorno em centímetros, então volta sempre na medida certa."}
</p>

</div>

<button id="btn-molde-novo" className="btn primary">
<span aria-hidden="true">
{"+"}
</span>
{" Adicionar molde"}
</button>

</div>

<details className="ajuda">

<summary >
{"Que arquivo eu mando para cá?"}
</summary>

<div className="ajuda-corpo">

<p >
{"\n                  O desenho é feito no seu programa (CorelDRAW, Audaces, Illustrator...) e mandado para\n                  cá em "}
<strong >
{"DXF"}
</strong>
{", "}
<strong >
{"PLT"}
</strong>
{", "}
<strong >
{"SVG"}
</strong>
{" ou\n                  "}
<strong >
{"PDF"}
</strong>
{" vetorial — são os formatos que trazem o contorno de verdade.\n                "}
</p>

</div>

</details>

<div className="molde-lista" id="moldes-body">

</div>

</section>

</div>
<div className="modal-fundo hidden" id="molde-envio">

<div className="modal modal-largo">

<header className="modal-topo">

<h3 id="molde-envio-nome">
{"Arte e encaixe"}
</h3>

<button type="button" id="btn-molde-envio-fechar" className="btn-x" title="Fechar">
{"×"}
</button>

</header>

<div className="modal-corpo">

<p className="hint">
{"\n                Mande a arte de cada parte — o retângulo que saiu do seu programa de desenho. O sistema\n                coloca a arte dentro do contorno do molde, no tamanho escolhido, e recorta pela linha da\n                peça. A mesma arte serve para todos os tamanhos: trocando o tamanho aqui em cima, ela se\n                ajusta sozinha ao contorno novo. Parte sem arte vai para o encaixe só como contorno.\n              "}
</p>

<div className="row">

<label style={{"flexGrow":"0","flexShrink":"0","flexBasis":"130px","flex":"0 0 130px"}}>
{"Tamanho\n                  "}
<select id="molde-envio-tamanho" defaultValue="">

</select>

</label>

<label style={{"flexGrow":"0","flexShrink":"0","flexBasis":"170px","flex":"0 0 170px"}}>
{"Quantas peças prontas\n                  "}
<input type="number" id="molde-envio-unidades" min="1" step="1" defaultValue="20" />

</label>

<label style={{"flexGrow":"0","flexShrink":"0","flexBasis":"150px","flex":"0 0 150px"}}>
{"Qualidade da arte\n                  "}
<select id="molde-envio-dpi" defaultValue="150">

<option value="100">
{"100 dpi"}
</option>

<option value="150">
{"150 dpi"}
</option>

<option value="200">
{"200 dpi"}
</option>

<option value="300">
{"300 dpi"}
</option>

</select>

</label>

</div>

<section className="estampas-guardadas">

<div className="estampas-topo">

<strong >
{"Estampas guardadas neste molde"}
</strong>

<button type="button" id="btn-arte-nova" className="btn secondary btn-sm">
{"Começar outra estampa"}
</button>

</div>

<div id="molde-estampas">

</div>

<p className="hint">
{"\n                  Ponha quantas peças prontas quer de cada estampa guardada. As que ficarem em zero\n                  não vão para o encaixe. Dá para mandar várias estampas de uma vez no mesmo tecido.\n                "}
</p>

</section>

<div className="estampa-titulo">

<strong id="molde-arte-titulo">
{"Estampa nova"}
</strong>

<span className="estampa-salvar">

<input type="text" id="molde-arte-nome" placeholder="Nome da estampa (ex: caveira)" />

<button type="button" id="btn-arte-salvar" className="btn secondary btn-sm">
{"Salvar no molde"}
</button>

</span>

</div>

<div id="molde-envio-partes" className="partes-arte">

</div>

<p className="hint" id="molde-envio-resumo">

</p>

<p id="molde-envio-erro" className="hint error hidden">

</p>

</div>

<footer className="modal-rodape">

<span className="hint" id="molde-envio-qualidade">

</span>

<button type="button" id="btn-molde-enviar" className="btn primary">
{"Mandar para o encaixe"}
</button>

</footer>

</div>

</div>
<div className="modal-fundo hidden" id="molde-modal">

<div className="modal">

<header className="modal-topo">

<h3 id="molde-modal-titulo">
{"Novo molde"}
</h3>

<button type="button" id="btn-molde-modal-fechar" className="btn-x" title="Fechar">
{"×"}
</button>

</header>

<div className="modal-corpo">



<section className="modal-passo" data-passo="1">

<p className="passo-pergunta">
{"O que você vai criar?"}
</p>

<div className="escolhas" id="molde-tipos">

</div>

<label className="hidden" id="molde-tipo-outro-campo">
{"Então é o quê?\n                  "}
<input type="text" id="molde-tipo-outro" placeholder="Ex: avental, boné, almofada, toalha" />

</label>

</section>



<section className="modal-passo hidden" data-passo="2">

<p className="passo-pergunta" id="molde-passo2-pergunta">
{"Quantos pedaços tem?"}
</p>

<div className="row">

<label style={{"flexGrow":"0","flexShrink":"0","flexBasis":"130px","flex":"0 0 130px"}}>
{"Pedaços\n                    "}
<input type="number" id="molde-pedacos" min="1" max="60" step="1" defaultValue="5" />

</label>

<label style={{"flexGrow":"1","flexShrink":"1","flexBasis":"220px","flex":"1 1 220px"}}>
{"Nome do molde\n                    "}
<input type="text" id="molde-nome" placeholder="Ex: Camiseta básica gola careca" />

</label>

<label style={{"flexGrow":"1","flexShrink":"1","flexBasis":"200px","flex":"1 1 200px"}}>
{"Tamanhos\n                    "}
<input type="text" id="molde-tamanhos" defaultValue="único" placeholder="Ex: P M G GG" />

</label>

<label style={{"flexGrow":"0","flexShrink":"0","flexBasis":"210px","flex":"0 0 210px"}}>
{"Como ler o arquivo\n                    "}
<select id="molde-modo-vetor" defaultValue="marcador">

<option value="marcador">
{"Marcador: cada peça separada"}
</option>

<option value="inteiro">
{"Arte: o arquivo inteiro é uma peça"}
</option>

</select>

</label>

<label style={{"flexGrow":"0","flexShrink":"0","flexBasis":"180px","flex":"0 0 180px"}}>
{"Unidade do arquivo\n                    "}
<select id="molde-unidade" defaultValue="">

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

</select>

</label>

</div>

<label >
{"Observações (opcional)\n                  "}
<textarea id="molde-observacoes" rows={2} placeholder="Tecido indicado, detalhes de costura, o que for útil lembrar" defaultValue="">

</textarea>

</label>

<p className="hint">
{"\n                  Conte os pedaços diferentes. Manga direita e esquerda contam como dois; se a mesma\n                  peça é cortada duas vezes, conte uma só e escreva a quantidade lá na frente.\n                "}
</p>

<p className="hint">
{"\n                  Nos "}
<strong >
{"tamanhos"}
</strong>
{", escreva todos que este molde vai ter, separados por\n                  espaço ou vírgula (\"P M G GG\"). Cada um ganha a sua aba no passo seguinte, para você\n                  mandar o arquivo tamanho por tamanho — e dá para acrescentar mais tamanhos lá.\n                "}
</p>

</section>



<section className="modal-passo hidden" data-passo="3">

<p className="passo-pergunta" id="molde-passo3-pergunta">
{"Diga o que é cada parte e mande o arquivo"}
</p>

<div className="abas-tamanho">

<div id="molde-abas" className="abas">

</div>

<span className="aba-nova">

<input type="text" id="molde-aba-nova" placeholder="outro tamanho" size={10} />

<button type="button" id="btn-molde-aba-nova" className="btn secondary btn-sm">
{"+ tamanho"}
</button>

</span>

</div>

<p className="hint" id="molde-aba-recado">

</p>

<div id="molde-partes">

</div>

<button type="button" id="btn-molde-mais-parte" className="btn secondary btn-sm">
{"+ mais uma parte"}
</button>

</section>

<p id="molde-erro" className="hint error hidden">

</p>

</div>

<footer className="modal-rodape">

<button type="button" id="btn-molde-voltar" className="btn secondary hidden">
{"Voltar"}
</button>

<span className="passo-conta hint" id="molde-passo-conta">
{"Passo 1 de 3"}
</span>

<button type="button" id="btn-molde-avancar" className="btn primary">
{"Continuar"}
</button>

</footer>

</div>

</div></>; });
