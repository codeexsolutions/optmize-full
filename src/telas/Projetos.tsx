/** Estrutura React; listas e canvas são controlados pelo módulo de produção. */
import { memo } from "react";
export const Projetos = memo(function Projetos() { return <><div className="page" data-page="projetos">

<section className="card">

<div className="card-head">

<div className="card-head-copy">

<h2 id="projetos-titulo">
{"Clientes"}
</h2>

<p className="hint" id="projetos-subtitulo">
{"Cada cliente tem a sua pasta; dentro dela, uma pasta por projeto."}
</p>

</div>

<span className="card-head-acoes">

<button id="btn-projeto-voltar" className="btn secondary hidden" type="button">
{"← Todos os clientes"}
</button>

<button id="btn-cliente-novo" className="btn primary" type="button">
<span aria-hidden="true">
{"+"}
</span>
{" Novo cliente"}
</button>

<button id="btn-projeto-novo" className="btn primary hidden" type="button">
<span aria-hidden="true">
{"+"}
</span>
{" Novo projeto"}
</button>

</span>

</div>

<details className="ajuda">

<summary >
{"Para que serve esta tela"}
</summary>

<div className="ajuda-corpo">

<p >
{"\n                  Aqui fica o trabalho que "}
<strong >
{"se repete"}
</strong>
{". A arte entra já pronta — a\n                  estampa aplicada na camisa, na bandeira, no que for — junto com a medida real e\n                  quantas vão em cada unidade.\n                "}
</p>

<p >
{"\n                  É diferente de "}
<strong >
{"Moldes"}
</strong>
{", e de propósito. No molde guarda-se o\n                  contorno da peça, para a estampa ser aplicada nele depois, em qualquer tamanho.\n                  Aqui a estampa já está aplicada: a peça vai direto para o encaixe.\n                "}
</p>

<p >
{"\n                  O projeto guarda também a largura do tecido, a folga, o comprimento da bancada e\n                  o giro que deram certo. Repetir o pedido é abrir, dizer quantas unidades e mandar\n                  calcular.\n                "}
</p>

</div>

</details>

<div className="projeto-lista" id="projetos-lista">

</div>

</section>

</div>
<div className="modal-fundo hidden" id="projeto-editor">

<section className="modal modal-projeto" role="dialog" aria-modal="true" aria-labelledby="projeto-editor-titulo">

<header className="modal-topo">

<div >

<span className="eyebrow" id="projeto-editor-cliente">
{"CLIENTE"}
</span>

<h3 id="projeto-editor-titulo">
{"Projeto"}
</h3>

</div>

<button type="button" className="btn-x" id="btn-projeto-fechar" aria-label="Fechar projeto">
{"×"}
</button>

</header>

<div className="modal-corpo">

<div className="row">

<label style={{"flexGrow":"2","flexShrink":"1","flexBasis":"260px","flex":"2 1 260px"}}>
{"Nome do projeto\n                  "}
<input type="text" id="projeto-nome" maxLength={120} placeholder="Camisa Time Azul 2026" />

</label>

<label style={{"flexGrow":"3","flexShrink":"1","flexBasis":"300px","flex":"3 1 300px"}}>
{"Observações\n                  "}
<input type="text" id="projeto-observacoes" maxLength={500} placeholder="opcional" />

</label>

</div>

<h4 className="projeto-secao">
{"Peças da produção"}
</h4>

<p className="hint">
{"\n                A arte já finalizada. A medida vem do dpi gravado no arquivo; quando ele não traz,\n                digite os centímetros — fica guardado para a próxima vez.\n              "}
</p>

<div className="row">

<label className="btn secondary file-label">
{"\n                  Adicionar arte\n                  "}
<input type="file" id="projeto-arquivos" accept="image/png,image/jpeg,image/webp" multiple={true} className="hidden" />

</label>

<span className="hint" id="projeto-envio-status">

</span>

</div>

<div className="projeto-pecas" id="projeto-pecas">

</div>

<h4 className="projeto-secao">
{"Ajustes do encaixe"}
</h4>

<p className="hint">
{"Guardados com o projeto, para a repetição já sair calculada do mesmo jeito."}
</p>

<div className="row">

<label >
{"Largura do tecido (cm)\n                  "}
<input type="number" id="projeto-largura-tecido" min="10" step="1" placeholder="160" />

</label>

<label >
{"Folga entre peças (mm)\n                  "}
<input type="number" id="projeto-espaco" min="0" max="100" step="1" placeholder="5" />

</label>

<label >
{"Comprimento da bancada (cm)\n                  "}
<input type="number" id="projeto-comprimento" min="0" step="1" placeholder="sem limite" />

</label>

<label >
{"Giro das peças\n                  "}
<select id="projeto-giro" defaultValue="180">

<option value="180">
{"180° — vira de cabeça para baixo"}
</option>

<option value="livre">
{"90° — a volta inteira"}
</option>

<option value="fixa">
{"Fixa — não gira"}
</option>

</select>

</label>

</div>

<p id="projeto-erro" className="hint error hidden">

</p>

</div>

<footer className="modal-rodape projeto-rodape">

<div className="projeto-repetir">

<label >
{"Unidades\n                  "}
<input type="number" id="projeto-unidades" min="1" step="1" defaultValue="1" />

</label>

<span className="hint" id="projeto-conta">

</span>

<span className="hint projeto-aviso">
{"O cálculo não começa sozinho: no Encaixe você escolhe o tempo de procura e aperta "}
<strong >
{"Optmizar"}
</strong>
{"."}
</span>

</div>

<span className="card-head-acoes">

<button id="btn-projeto-excluir" className="btn ghost-danger" type="button">
{"Excluir projeto"}
</button>

<button id="btn-projeto-salvar" className="btn secondary" type="button">
{"Salvar"}
</button>

<button id="btn-projeto-encaixar" className="btn primary" type="button">
{"Salvar e levar pro Encaixe"}
</button>

</span>

</footer>

</section>

</div></>; });
