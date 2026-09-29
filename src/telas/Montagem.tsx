/**
 * ===========================================================================
 * MONTAGEM — o risco vira molde
 * ===========================================================================
 *
 * O Digitalizar entrega um molde-RASCUNHO na estante e abre esta tela em cima
 * dele (`/montagem?molde=ID`). Aqui cada peça ganha papel, nome, quantidade,
 * pique, ponto, fio e margem de costura; o molde grava sozinho e, concluído,
 * vai ao Encaixe. Qualquer molde da estante abre aqui, inclusive os de DXF.
 * Ver docs/superpowers/specs/2026-09-26-montagem-de-moldes-design.md.
 *
 * Esta casca só decide entre a ESCOLHA do molde (sem `?molde`, ou molde que
 * sumiu) e a MESA. O `key` na mesa faz trocar de molde montar tudo do zero,
 * sem desfazer, zoom ou nó marcado herdados do molde anterior.
 */
import { useSearchParams } from "react-router-dom";
import { EscolhaDoMolde } from "./montagem/EscolhaDoMolde";
import { MesaDeMontagem } from "./montagem/MesaDeMontagem";

export function Montagem() {
  const [parametros, setParametros] = useSearchParams();
  const id = Number(parametros.get("molde"));
  const escolher = (novo: number) => setParametros({ molde: String(novo) });

  // `.btn`, `.etiqueta-tamanho` etc. só existem dentro de `:where(.producao)`
  // (`producao/producao.css`): sem este `div`, os botões da bancada e a
  // etiqueta de rascunho da escolha ficariam sem estilo nenhum.
  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="producao h-full">
        <EscolhaDoMolde aoEscolher={escolher} />
      </div>
    );
  }
  return (
    <div className="producao h-full">
      <MesaDeMontagem key={id} id={id} aoEscolherOutro={escolher} aoTrocar={() => setParametros({})} />
    </div>
  );
}
