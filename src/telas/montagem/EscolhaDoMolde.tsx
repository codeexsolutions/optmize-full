/**
 * A ESCOLHA DO MOLDE — o que a Montagem mostra quando é aberta pelo menu.
 *
 * Rascunhos primeiro: são o trabalho que ficou pela metade, e quem abre a
 * Montagem pelo menu quase sempre está voltando a um deles. Depois os
 * prontos, pelo nome.
 */
import { useEffect, useMemo, useState } from "react";
import { moldesApi, type MoldeNaEstante } from "../../api/moldes";
import { Icone } from "../../casca/Icone";

interface Props {
  aoEscolher: (id: number) => void;
  /** Aberta porque o molde do endereço não existe mais. */
  sumiu?: boolean;
}

export function EscolhaDoMolde({ aoEscolher, sumiu }: Props) {
  const [moldes, setMoldes] = useState<MoldeNaEstante[] | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    moldesApi.estante().then(setMoldes).catch(() => setMoldes([]));
  }, []);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (moldes ?? [])
      .filter((m) => !termo || m.nome.toLowerCase().includes(termo))
      .sort((a, b) => (a.situacao === b.situacao ? a.nome.localeCompare(b.nome) : a.situacao === "rascunho" ? -1 : 1));
  }, [moldes, busca]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[720px] flex-col gap-3 overflow-auto p-6">
      <h2 className="m-0 text-[1.1rem] font-semibold">Qual molde você vai montar?</h2>
      {sumiu && (
        <p className="m-0 flex items-center gap-2 text-[0.85rem] text-ambar">
          <Icone referencia="icones.svg#triangle-alert" className="size-4" />
          Esse molde não existe mais. Escolha outro.
        </p>
      )}
      <p className="m-0 text-[0.85rem] text-tinta-fraca">
        O molde chega aqui pelo <strong>Digitalizar</strong> ou pela estante de <strong>Moldes</strong>.
        Os rascunhos — digitalizados e ainda não concluídos — vêm primeiro.
      </p>
      <input
        type="search" value={busca} placeholder="Procurar pelo nome"
        onChange={(e) => setBusca(e.target.value)} aria-label="Procurar molde"
        className="w-full rounded-[9px] border border-linha bg-painel px-3 py-1.5 text-[0.82rem] text-tinta outline-none placeholder:text-tinta-apagada focus:border-[var(--accent-line)]"
      />
      {moldes === null && <p className="text-[0.85rem] text-tinta-apagada">Abrindo a estante…</p>}
      {moldes !== null && lista.length === 0 && (
        <p className="text-[0.85rem] text-tinta-apagada">Nenhum molde na estante ainda.</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lista.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-linha bg-painel-suave p-3 text-left hover:border-ambar"
              onClick={() => aoEscolher(m.id)}
            >
              <span className="flex flex-col">
                <strong>{m.nome}</strong>
                <span className="text-[0.8rem] text-tinta-fraca">
                  {m.totalPecas} peça(s) · {m.tamanhos.join(", ") || "sem tamanho"}
                </span>
              </span>
              {m.situacao === "rascunho" && <span className="etiqueta-tamanho">rascunho</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
