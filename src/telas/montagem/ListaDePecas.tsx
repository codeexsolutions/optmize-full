// src/telas/montagem/ListaDePecas.tsx
/**
 * A COLUNA DAS PEÇAS — escolher, apagar e juntar.
 *
 * JUNTAR traz as peças de OUTRO molde da estante para este: é o caso da
 * camisa que não coube numa foto só e foi digitalizada em duas. Vêm as peças
 * do primeiro tamanho do outro molde, e entram no tamanho deste. O outro
 * molde fica como estava — apagar é decisão da estante.
 */
import { useEffect, useState } from "react";
import { moldesApi, type MoldeNaEstante } from "../../api/moldes";
import { achatarCurvas } from "../../motores/ajusteDeCurvas";
import { caixaDe, pecaParaMontar } from "../../motores/montagem";
import { corDaPeca } from "../../utils/coresDePeca";
import { gruposDasPecas } from "../../motores/tamanhos";
import type { GrupoDePecas } from "./useMoldeEmMontagem";
import { Icone } from "../../casca/Icone";
import type { MoldeEmMontagem, PecaEmMontagem } from "./useMoldeEmMontagem";

function Miniatura({ peca, cor }: { peca: PecaEmMontagem; cor: string }) {
  const pontos = achatarCurvas(peca.nos);
  const c = caixaDe(pontos);
  const lado = Math.max(c.largura, c.altura) || 1;
  return (
    <svg viewBox={`${c.minX} ${c.minY} ${lado} ${lado}`} className="size-12 shrink-0">
      <polygon points={pontos.map((p: { x: number; y: number }) => `${p.x},${p.y}`).join(" ")}
        fill="none" stroke={cor} strokeWidth={lado / 30} />
    </svg>
  );
}

export const nomeDaPeca = (p: PecaEmMontagem, i: number) =>
  p.papel && p.papel !== "outro" ? p.papel : p.nome || `peça ${i + 1}`;

interface Props {
  molde: MoldeEmMontagem;
  moldeId: number;
  /** O grupo marcado: a mesma peça em todos os tamanhos. */
  grupo: number;
  aoEscolherGrupo: (grupo: number) => void;
}

export function ListaDePecas({ molde, moldeId, grupo, aoEscolherGrupo }: Props) {
  const [outros, setOutros] = useState<MoldeNaEstante[]>([]);
  const [deQual, setDeQual] = useState("");
  const [juntando, setJuntando] = useState(false);
  // Erro do último "Juntar" (rede caiu, molde sumiu…). Sem isto, `void
  // juntar()` deixava a rejeição sem tratamento e a pessoa via o botão voltar
  // a "Juntar" sem explicação nenhuma do porquê não juntou nada.
  const [erroDeJuntar, setErroDeJuntar] = useState("");

  useEffect(() => {
    moldesApi.estante().then((l) => setOutros(l.filter((m) => m.id !== moldeId))).catch(() => setOutros([]));
  }, [moldeId]);

  const grupos = gruposDasPecas(molde.pecas) as GrupoDePecas[];
  const base = molde.tamanhos.find((t) => t.base)?.nome;

  /** Apaga a peça em TODOS os tamanhos: sobrar o P e o G de uma peça sem o M não é molde. */
  const apagar = (g: number) => {
    molde.mudarPecas((antes) => antes.filter((p) => p.grupo !== g));
    aoEscolherGrupo(grupos.find((x) => x.grupo !== g)?.grupo ?? 0);
  };

  const juntar = async () => {
    const id = Number(deQual);
    if (!id) return;
    setJuntando(true);
    setErroDeJuntar("");
    try {
      const outro = await moldesApi.abrir(id);
      const tamanhoDeLa = outro.pecas[0]?.tamanho;
      const tamanhoDaqui = molde.pecas[0]?.tamanho ?? "base";
      // Peças NOVAS: grupos novos, acima dos daqui (o grupo de lá colidiria).
      const proximo = molde.pecas.reduce((m, p) => Math.max(m, p.grupo ?? -1), -1) + 1;
      const vindas = outro.pecas
        .filter((p) => p.tamanho === tamanhoDeLa)
        .map((p, k) => ({ ...(pecaParaMontar(p) as PecaEmMontagem), id: undefined, tamanho: tamanhoDaqui, grupo: proximo + k }));
      molde.mudarPecas((antes) => [...antes, ...vindas]);
      setDeQual("");
    } catch (e) {
      // Molde apagado entre abrir a lista e clicar em "Juntar", rede caiu,
      // servidor fora: sem isto a pessoa só via o botão voltar ao normal,
      // sem saber que nada foi juntado.
      setErroDeJuntar(e instanceof Error ? e.message : "Não consegui juntar esse molde.");
    } finally {
      setJuntando(false);
    }
  };

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col gap-2 overflow-auto border-r border-linha p-3">
      <p className="m-0 text-[0.8rem] font-semibold text-tinta-fraca">Peças</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {grupos.map((g, i) => {
          // A peça que representa o grupo na lista: a do tamanho base, ou a primeira.
          const p = molde.pecas[g.porTamanho[base ?? ""] ?? Object.values(g.porTamanho)[0]!]!;
          const comErro = Object.values(g.porTamanho).includes(molde.problema?.peca ?? -1);
          return (
            <li key={g.grupo}>
              <button
                type="button"
                onClick={() => aoEscolherGrupo(g.grupo)}
                className={`flex w-full items-center gap-2 rounded-[8px] border p-1.5 text-left ${
                  g.grupo === grupo ? "border-ambar bg-[var(--accent-soft)]" : "border-linha"
                } ${comErro ? "outline outline-2 outline-[#ff4d4d]" : ""}`}
              >
                <Miniatura peca={p} cor={comErro ? "#ff4d4d" : corDaPeca(i)} />
                <span className="flex min-w-0 flex-col text-[0.8rem]">
                  <strong className="truncate">{nomeDaPeca(p, i)}</strong>
                  <span className="text-tinta-fraca">
                    ×{p.quantidade}{p.marcacoes.espelhar ? " · espelhar" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {grupos.length > 1 && (
        <button type="button" className="btn ghost-danger btn-sm" onClick={() => apagar(grupo)}>
          <Icone referencia="icones.svg#trash-2" className="size-4" />
          Apagar a peça marcada
        </button>
      )}
      <div className="mt-auto flex flex-col gap-1.5 border-t border-linha pt-2">
        <p className="m-0 text-[0.78rem] text-tinta-fraca">Juntar as peças de outro molde</p>
        <select
          value={deQual}
          onChange={(e) => { setDeQual(e.target.value); setErroDeJuntar(""); }}
          aria-label="Molde para juntar"
        >
          <option value="">Escolha um molde…</option>
          {outros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <button type="button" className="btn secondary btn-sm" disabled={!deQual || juntando} onClick={() => void juntar()}>
          {juntando ? "Juntando…" : "Juntar"}
        </button>
        {erroDeJuntar && <p className="m-0 text-[0.78rem] text-[#ff4d4d]">{erroDeJuntar}</p>}
      </div>
    </aside>
  );
}
