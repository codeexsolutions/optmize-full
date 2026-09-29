/**
 * Os tamanhos da grade, cada um na cor em que a Audaces o desenha. O marcado
 * é o que se edita; "Ver tamanhos" sobrepõe os outros na mesa, só para
 * conferir a graduação.
 */
import type { TamanhoDoMolde } from "../../api/moldes";

interface Props {
  tamanhos: TamanhoDoMolde[];
  ativo: string;
  aoEscolher: (nome: string) => void;
  verTamanhos: boolean;
  aoVerTamanhos: (ver: boolean) => void;
}

export function ChipsDeTamanho({ tamanhos, ativo, aoEscolher, verTamanhos, aoVerTamanhos }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-linha px-3 py-1.5 text-[0.82rem]">
      <span className="text-tinta-fraca">Tamanho</span>
      {tamanhos.map((t) => (
        <button
          key={t.nome}
          type="button"
          onClick={() => aoEscolher(t.nome)}
          aria-pressed={t.nome === ativo}
          title={t.base ? `${t.nome} (base)` : t.nome}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
            t.nome === ativo ? "border-ambar bg-[var(--accent-soft)] font-semibold" : "border-linha"
          }`}
        >
          <span className="size-2.5 rounded-full" style={{ background: t.cor }} />
          {t.nome}{t.base ? " ·" : ""}
        </button>
      ))}
      <label className="ml-auto flex items-center gap-1.5">
        <input type="checkbox" checked={verTamanhos} onChange={(e) => aoVerTamanhos(e.target.checked)} />
        Ver tamanhos
      </label>
    </div>
  );
}
