/**
 * A GRADE DE TAMANHOS — nome, cor, ordem e qual é o base.
 *
 * Renomear, tirar, acrescentar, a ordem e o base são um passo do desfazer
 * cada (peças e grade juntas: renomear e tirar mexem nas peças também). A cor
 * não entra no desfazer: arrastar o seletor de cor faria dezenas de passos.
 * Tirar um tamanho com desenho pergunta antes.
 */
import { useState } from "react";
import { useDialogo } from "../../casca/Dialogo";
import {
  acrescentarTamanho, marcarBase, moverTamanho, renomearTamanho, tirarTamanho, trocarCor,
} from "../../motores/tamanhos";
import type { TamanhoDoMolde } from "../../api/moldes";
import type { MoldeEmMontagem, PecaEmMontagem } from "./useMoldeEmMontagem";

interface Props { molde: MoldeEmMontagem; aoFechar: () => void }

type Mudanca = { grade: TamanhoDoMolde[]; pecas?: PecaEmMontagem[] } | { erro: string };

export function JanelaDaGrade({ molde, aoFechar }: Props) {
  const dialogo = useDialogo();
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState("");
  // O nome sendo digitado, por tamanho; vale no blur ou no Enter.
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const grade = [...molde.tamanhos].sort((a, b) => a.ordem - b.ordem);

  const aplicar = (r: Mudanca) => {
    if ("erro" in r) { setErro(r.erro); return; }
    setErro("");
    molde.lembrar();
    if (r.pecas) {
      const pecas = r.pecas;
      molde.mudarPecas(() => pecas, false);
    }
    molde.mudarTamanhos(() => r.grade);
  };

  const renomear = (velho: string) => {
    const digitado = (nomes[velho] ?? velho).trim();
    setNomes((n) => {
      const { [velho]: _fora, ...resto } = n;
      return resto;
    });
    if (digitado !== velho) aplicar(renomearTamanho(molde.pecas, molde.tamanhos, velho, digitado));
  };

  const acrescentar = () => {
    const r = acrescentarTamanho(molde.tamanhos, novo.trim().toUpperCase());
    if (!r.erro) setNovo("");
    aplicar(r);
  };

  const tirar = async (nome: string) => {
    const dele = molde.pecas.filter((p) => p.tamanho === nome);
    if (dele.length > 0) {
      const graduacoes = dele.filter((p) => p.graduacao).length;
      const seguir = await dialogo.confirmar(
        `As ${dele.length} peça(s) do tamanho ${nome} somem`
        + (graduacoes > 0 ? `, e com elas a graduação de ${graduacoes} peça(s) que partia desse tamanho` : "")
        + ". Tirar mesmo assim?",
      );
      if (!seguir) return;
    }
    aplicar(tirarTamanho(molde.pecas, molde.tamanhos, nome));
  };

  return (
    <div className="modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Grade de tamanhos">
        <header className="modal-topo">
          <h3>Grade de tamanhos</h3>
          <button type="button" className="btn-x" title="Fechar" onClick={aoFechar}>×</button>
        </header>
        <div className="modal-corpo">
          <p className="hint">
            O base é o tamanho desenhado na mesa; a graduação gera os outros a partir dele. A ordem é a
            dos saltos (P → M → G).
          </p>
          <table className="w-full text-[0.85rem]">
            <thead>
              <tr><th className="text-left">Tamanho</th><th>Cor</th><th>Base</th><th>Ordem</th><th /></tr>
            </thead>
            <tbody>
              {grade.map((t, i) => {
                const quantas = molde.pecas.filter((p) => p.tamanho === t.nome).length;
                return (
                  <tr key={t.nome}>
                    <td className="py-1 pr-2">
                      <input
                        type="text" value={nomes[t.nome] ?? t.nome} className="w-24!"
                        aria-label={`Nome do tamanho ${t.nome}`}
                        onChange={(e) => setNomes((n) => ({ ...n, [t.nome]: e.target.value }))}
                        onBlur={() => renomear(t.nome)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                      <span className="ml-2 text-tinta-fraca">{quantas > 0 ? `${quantas} peça(s)` : "sem desenho"}</span>
                    </td>
                    <td className="text-center">
                      <input
                        type="color" value={t.cor} className="h-7 w-9 p-0" aria-label={`Cor do tamanho ${t.nome}`}
                        onChange={(e) => molde.mudarTamanhos(() => trocarCor(molde.tamanhos, t.nome, e.target.value))}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="radio" name="base-da-grade" checked={t.base} aria-label={`${t.nome} é o base`}
                        onChange={() => aplicar({ grade: marcarBase(molde.tamanhos, t.nome) })}
                      />
                    </td>
                    <td className="whitespace-nowrap text-center">
                      <button type="button" className="btn secondary btn-sm" disabled={i === 0} title="Subir"
                        onClick={() => aplicar({ grade: moverTamanho(molde.tamanhos, t.nome, -1) })}>↑</button>
                      <button type="button" className="btn secondary btn-sm" disabled={i === grade.length - 1} title="Descer"
                        onClick={() => aplicar({ grade: moverTamanho(molde.tamanhos, t.nome, 1) })}>↓</button>
                    </td>
                    <td className="text-right">
                      <button
                        type="button" className="btn ghost-danger btn-sm" disabled={t.base}
                        title={t.base ? "O base não sai: marque outro tamanho como base antes" : "Tirar o tamanho"}
                        onClick={() => void tirar(t.nome)}
                      >
                        Tirar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text" value={novo} placeholder="GG" className="w-24!" aria-label="Nome do tamanho novo"
              onChange={(e) => { setNovo(e.target.value); setErro(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") acrescentar(); }}
            />
            <button type="button" className="btn secondary btn-sm" onClick={acrescentar}>+ tamanho</button>
          </div>
          {erro && <p className="text-[0.82rem] text-[#ff4d4d]">{erro}</p>}
        </div>
        <footer className="modal-rodape">
          <button type="button" className="btn primary" onClick={aoFechar}>Pronto</button>
        </footer>
      </div>
    </div>
  );
}
