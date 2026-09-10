/**
 * O conjunto permanece montado para conservar os arquivos entre telas.
 *
 * É `memo` sem props de propósito: o controlador imperativo mexe nestes nós
 * (listas, formulários, canvas), e uma reconciliação do React em cima do que
 * ele escreveu desfaria o trabalho. Enquanto estas três telas forem dirigidas
 * por `getElementById`, NADA aqui pode depender de estado que muda.
 *
 * É por isso que a Cor saiu daqui quando virou React de verdade: ela precisa
 * redesenhar a cada arte convertida, e não caberia dentro de um componente que
 * existe justamente para nunca redesenhar. Ela é irmã deste, no `Producao`.
 *
 * A de Projetos saiu depois, e foi mais longe: virou uma tela de rota como as
 * outras, desenhada pelo `<Outlet/>` da casca. A de Moldes foi pelo mesmo
 * caminho. Sobrou o Encaixe — e quando ele sair, este arquivo some junto com o
 * controlador.
 */
import { memo } from "react";
import { Encaixe } from "../telas/Encaixe";
export const Estrutura = memo(function Estrutura() { return <><Encaixe /><div className="ui-dialog-backdrop hidden" id="ui-dialog" role="presentation">

<section className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title" aria-describedby="ui-dialog-message">

<div className="ui-dialog-icon" id="ui-dialog-icon">
{"!"}
</div>

<div className="ui-dialog-content">

<span className="eyebrow" id="ui-dialog-kicker">
{"CONFIRMAÇÃO"}
</span>

<h2 id="ui-dialog-title">
{"Confirmar ação"}
</h2>

<p id="ui-dialog-message">

</p>

<input type="text" id="ui-dialog-input" className="hidden" maxLength={120} />

</div>

<div className="ui-dialog-actions">

<button className="btn secondary" id="ui-dialog-cancel">
{"Cancelar"}
</button>

<button className="btn primary" id="ui-dialog-confirm">
{"Confirmar"}
</button>

</div>

</section>

</div></>; });
