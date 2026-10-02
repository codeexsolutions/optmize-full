/**
 * Os tamanhos da grade, cada um na cor em que a Audaces o desenha. O marcado
 * é o que se edita; tracejado é tamanho que a peça ainda não tem (graduar ou
 * juntar). "Ver tamanhos" sobrepõe os outros na mesa; "Grade" abre a janela
 * dos tamanhos. A barra aparece sempre — é daqui que um molde de um tamanho
 * só (o "base" do Digitalizar) ganha P, M, G.
 */
import { Icone } from "../../casca/Icone";
import type { TamanhoDoMolde } from "../../api/moldes";

interface Props {
  tamanhos: TamanhoDoMolde[];
  ativo: string;
  /** Os tamanhos que a peça mostrada tem desenhados; os outros saem tracejados. */
  comDesenho: ReadonlySet<string>;
  aoEscolher: (nome: string) => void;
  verTamanhos: boolean;
  aoVerTamanhos: (ver: boolean) => void;
  aoAbrirGrade: () => void;
}

export function ChipsDeTamanho({ tamanhos, ativo, comDesenho, aoEscolher, verTamanhos, aoVerTamanhos, aoAbrirGrade }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-linha px-3 py-1.5 text-[0.82rem]">
      <span className="text-tinta-fraca">Tamanho</span>
      {tamanhos.map((t) => {
        const tem = comDesenho.has(t.nome);
        return (
          <button
            key={t.nome}
            type="button"
            onClick={() => aoEscolher(t.nome)}
            aria-pressed={t.nome === ativo}
            title={`${t.nome}${t.base ? " (base)" : ""}${tem ? "" : " — sem desenho nesta peça"}`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
              t.nome === ativo ? "border-ambar bg-[var(--accent-soft)] font-semibold" : "border-linha"
            } ${tem ? "" : "border-dashed text-tinta-fraca"}`}
          >
            <span className="size-2.5 rounded-full" style={{ background: t.cor }} />
            {t.nome}{t.base ? " ·" : ""}
          </button>
        );
      })}
      <button type="button" className="btn secondary btn-sm" onClick={aoAbrirGrade} title="Tamanhos, cores, ordem e base">
        <Icone referencia="icones.svg#layout-grid" className="size-4" />
        Grade
      </button>
      <label className="ml-auto flex items-center gap-1.5">
        <input type="checkbox" checked={verTamanhos} onChange={(e) => aoVerTamanhos(e.target.checked)} />
        Ver tamanhos
      </label>
    </div>
  );
}
