/**
 * Antes de refazer um tamanho que tem desenho próprio — veio da Audaces, de
 * um "juntar", ou foi ajustado à mão depois de gerado —, a pessoa marca quais
 * a graduação pode substituir. Os não marcados ficam como estão.
 */
import { useState } from "react";
import { useCliqueNoVeu } from "../../casca/cliqueNoVeu";

export interface AlvoParaPerguntar { chave: string; nome: string; tamanho: string; origem: string | null }

interface Props {
  alvos: AlvoParaPerguntar[];
  aoConfirmar: (escolhidos: Set<string>) => void;
  aoCancelar: () => void;
}

export function JanelaDeSubstituir({ alvos, aoConfirmar, aoCancelar }: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const alternar = (chave: string) => setMarcados((m) => {
    const n = new Set(m);
    if (n.has(chave)) n.delete(chave);
    else n.add(chave);
    return n;
  });
  const veu = useCliqueNoVeu(aoCancelar);
  return (
    <div className="modal-fundo" {...veu}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Substituir tamanhos">
        <header className="modal-topo">
          <h3>Estes tamanhos já têm desenho</h3>
          <button type="button" className="btn-x" title="Fechar" onClick={aoCancelar}>×</button>
        </header>
        <div className="modal-corpo">
          <p className="hint">Marque os que a graduação pode substituir. Os não marcados ficam como estão.</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {alvos.map((a) => (
              <li key={a.chave}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={marcados.has(a.chave)} onChange={() => alternar(a.chave)} />
                  {a.nome}, {a.tamanho} — {a.origem || "desenho próprio"}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <footer className="modal-rodape">
          <button type="button" className="btn secondary" onClick={aoCancelar}>Cancelar</button>
          <button type="button" className="btn primary" onClick={() => aoConfirmar(marcados)}>Gerar</button>
        </footer>
      </div>
    </div>
  );
}
