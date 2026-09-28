// src/telas/montagem/PainelDaPeca.tsx
/**
 * O PAINEL DA PEÇA — o que a peça é, e quanto corta.
 *
 * O PAPEL vem da mesma lista da estante (`PAPEIS_DE_PECA`), e não de texto
 * livre: é por ele que a estampa acha a peça (ver `telas/moldes/vocabulario.ts`).
 *
 * A MARGEM é texto, e não `<input type=number>`: quem digita "0,5" com
 * vírgula num campo numérico do navegador em português ora vê o valor sumir,
 * ora vira 5. `lerCm` aceita os dois e recusa o que não for número.
 */
import { useEffect, useState } from "react";
import { PAPEIS_DE_PECA } from "../moldes/vocabulario";
import { lerCm, pecaParaGravar } from "../../motores/montagem";
import { formatarCm } from "../../utils/numero";
import type { PecaEmMontagem } from "./useMoldeEmMontagem";

interface Props {
  peca: PecaEmMontagem;
  aoMudar: (mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes: boolean) => void;
}

export function PainelDaPeca({ peca, aoMudar }: Props) {
  const [margemEscrita, setMargemEscrita] = useState(String(peca.marcacoes.margem).replace(".", ","));
  useEffect(() => { setMargemEscrita(String(peca.marcacoes.margem).replace(".", ",")); }, [peca.marcacoes.margem]);
  const margemLida = lerCm(margemEscrita);
  const medida = pecaParaGravar(peca);

  const trocarMarcacao = (parte: Partial<PecaEmMontagem["marcacoes"]>) =>
    aoMudar((p) => ({ ...p, marcacoes: { ...p.marcacoes, ...parte } }), true);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col gap-3 overflow-auto border-l border-linha p-3 text-[0.85rem]">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">O que é</span>
        <select value={peca.papel} onChange={(e) => aoMudar((p) => ({ ...p, papel: e.target.value }), true)}>
          {PAPEIS_DE_PECA.map((papel) => <option key={papel} value={papel}>{papel}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Nome {peca.papel === "outro" ? "(é por ele que a peça é chamada)" : "(opcional)"}</span>
        {/* Sem lembrar a cada tecla: um nome de doze letras encheria doze passos do desfazer. */}
        {/* `nome` é `string` em `PecaDoMolde` (não aceita `null`); vazio já vale como "sem nome" em `nomeDaPeca`. */}
        <input type="text" value={peca.nome ?? ""} onChange={(e) => aoMudar((p) => ({ ...p, nome: e.target.value }), false)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Quantas cortam por peça pronta</span>
        <input
          type="number" min={1} step={1} value={peca.quantidade}
          onChange={(e) => aoMudar((p) => ({ ...p, quantidade: Math.max(1, Math.floor(Number(e.target.value) || 1)) }), true)}
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={peca.marcacoes.espelhar} onChange={(e) => trocarMarcacao({ espelhar: e.target.checked })} />
        <span>Cortar em par espelhado <span className="text-tinta-fraca">(metade vira do avesso)</span></span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Margem de costura (cm)</span>
        <input
          type="text" inputMode="decimal" value={margemEscrita}
          onChange={(e) => setMargemEscrita(e.target.value)}
          onBlur={() => { if (margemLida !== null && margemLida !== peca.marcacoes.margem) trocarMarcacao({ margem: margemLida }); }}
          aria-invalid={margemLida === null}
        />
        <span className="text-[0.78rem] text-tinta-fraca">
          {margemLida === null
            ? "Isso não é um número."
            : margemLida === 0
              ? "0 = o risco já é o corte (o normal em molde de papel fotografado)."
              : "O risco vira a costura; o corte é a linha tracejada em volta."}
        </span>
      </label>
      <div className="rounded-[8px] border border-linha p-2">
        <p className="m-0 font-semibold">Corte</p>
        <p className="m-0 text-tinta-fraca">
          {medida.peca ? `${formatarCm(medida.peca.largura)} × ${formatarCm(medida.peca.altura)}` : medida.erro}
        </p>
      </div>
      <div className="rounded-[8px] border border-linha p-2 text-tinta-fraca">
        <p className="m-0">{peca.marcacoes.piques.length} pique(s) · {peca.marcacoes.pontos.length} ponto(s)</p>
        <p className="m-0">Fio a {peca.marcacoes.fio.angulo}°</p>
        <div className="mt-1 flex gap-1">
          <button type="button" className="btn secondary btn-sm" onClick={() => trocarMarcacao({ fio: { ...peca.marcacoes.fio, angulo: 0 } })}>Fio vertical</button>
          <button type="button" className="btn secondary btn-sm" onClick={() => trocarMarcacao({ fio: { ...peca.marcacoes.fio, angulo: 90 } })}>Horizontal</button>
        </div>
      </div>
    </aside>
  );
}
