/** A lista dos elementos guardados desta foto: miniatura, nome (editável), jeito e tirar. */
import { Icone } from "../../casca/Icone";
import type { Elemento } from "./tipos";

interface Props {
  elementos: Elemento[];
  escolhido: number | null;
  aoEscolher: (id: number) => void;
  aoRenomear: (id: number, nome: string) => void;
  aoRemover: (id: number) => void;
}

export function ListaDeElementos({ elementos, escolhido, aoEscolher, aoRenomear, aoRemover }: Props) {
  if (elementos.length === 0) {
    return (
      <p className="m-0 text-[0.85rem] text-tinta-fraca">
        Nenhum elemento ainda. Clique no logo, no texto ou na estampa e aperte <strong>Guardar elemento</strong>.
      </p>
    );
  }
  return (
    <ul id="extrator-elementos" className="m-0 flex list-none flex-col gap-1.5 p-0">
      {elementos.map((e) => (
        <li key={e.id} data-elemento={e.id}>
          <div
            className={[
              "flex items-center gap-2 rounded-xl px-2 py-1.5",
              e.id === escolhido ? "bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent-line)]" : "hover:bg-[var(--surface-hover)]",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => aoEscolher(e.id)}
              aria-label={`Abrir ${e.nome}`}
              className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-linha bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:12px_12px]"
            >
              <img src={e.miniatura} alt="" className="max-h-full max-w-full object-contain" />
            </button>
            <input
              defaultValue={e.nome}
              aria-label="Nome do elemento"
              onFocus={() => aoEscolher(e.id)}
              onBlur={(ev) => aoRenomear(e.id, ev.target.value.trim() || e.nome)}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-tinta hover:border-linha focus:border-[var(--accent-line)] focus:outline-none"
            />
            <span className="shrink-0 font-mono text-[11px] text-tinta-apagada">{e.jeito}</span>
            <button
              type="button"
              onClick={() => aoRemover(e.id)}
              aria-label={`Tirar ${e.nome}`}
              className="grid size-7 shrink-0 place-items-center rounded-md text-tinta-apagada hover:bg-[var(--surface-hover)] hover:text-[var(--danger)]"
            >
              <Icone referencia="icones.svg#x" className="size-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
