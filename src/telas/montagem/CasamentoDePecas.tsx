/**
 * Qual peça do outro molde é qual peça deste. O casamento vem sugerido pelo
 * nome (sem "2X", sem acento, tolerando erro de digitação) e pela caixa, mas
 * quem confirma é a pessoa: nos pijamas M e G da fábrica as peças vêm em outra
 * ordem e com nomes diferentes ("PALA SHORT"/"PALA").
 */
import type { PecaEmMontagem } from "./useMoldeEmMontagem";
import { useCliqueNoVeu } from "../../casca/cliqueNoVeu";

interface Props {
  tamanho: string;
  /** De qual tamanho do outro molde as peças vêm (o base de lá). */
  tamanhoDeLa: string;
  daqui: { grupo: number; peca: PecaEmMontagem }[];
  dela: PecaEmMontagem[];
  pares: { grupo: number; indiceDela: number | null }[];
  aoTrocar: (grupo: number, indiceDela: number | null) => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

const rotulo = (p: PecaEmMontagem) => p.nome || p.papel;

export function CasamentoDePecas({ tamanho, tamanhoDeLa, daqui, dela, pares, aoTrocar, aoConfirmar, aoCancelar }: Props) {
  const usados = new Set(pares.map((p) => p.indiceDela).filter((i): i is number => i !== null));
  const semPar = pares.filter((p) => p.indiceDela === null).length;
  const sobrando = dela.filter((_, i) => !usados.has(i));
  const veu = useCliqueNoVeu(aoCancelar);
  return (
    <div className="modal-fundo" {...veu}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Casar as peças">
        <header className="modal-topo">
          <h3>Qual peça é qual? — tamanho {tamanho}</h3>
          <button type="button" className="btn-x" title="Fechar" onClick={aoCancelar}>×</button>
        </header>
        <div className="modal-corpo">
          <p className="hint">
            Confira os pares que eu sugeri pelo nome. Troque o que estiver errado; peça sem par fica
            sem esse tamanho.
          </p>
          <table className="w-full text-[0.85rem]">
            <thead>
              <tr><th className="text-left">Neste molde</th><th className="text-left">No outro (tamanho {tamanhoDeLa}, entra como {tamanho})</th></tr>
            </thead>
            <tbody>
              {daqui.map(({ grupo, peca }) => {
                const par = pares.find((p) => p.grupo === grupo);
                return (
                  <tr key={grupo}>
                    <td className="py-1 pr-3">{rotulo(peca)}</td>
                    <td className="py-1">
                      <select
                        value={par?.indiceDela ?? ""}
                        onChange={(e) => aoTrocar(grupo, e.target.value === "" ? null : Number(e.target.value))}
                        aria-label={`Par de ${rotulo(peca)}`}
                      >
                        <option value="">— sem par (não entra) —</option>
                        {dela.map((p, i) => (
                          <option key={i} value={i} disabled={usados.has(i) && par?.indiceDela !== i}>{rotulo(p)}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {semPar > 0 && (
            <p className="text-[0.82rem] text-[#ff4d4d]">{semPar} peça(s) deste molde ficam sem o tamanho {tamanho}.</p>
          )}
          {sobrando.length > 0 && (
            <p className="text-[0.82rem] text-tinta-fraca">Do outro molde, não entram: {sobrando.map(rotulo).join(", ")}.</p>
          )}
        </div>
        <footer className="modal-rodape">
          <button type="button" className="btn secondary" onClick={aoCancelar}>Cancelar</button>
          <button type="button" className="btn primary" onClick={aoConfirmar}>Juntar como tamanho {tamanho}</button>
        </footer>
      </div>
    </div>
  );
}
