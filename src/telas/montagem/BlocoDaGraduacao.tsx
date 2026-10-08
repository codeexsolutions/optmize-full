/**
 * O BLOCO DA GRADUAÇÃO — no lugar do painel da peça, com a ferramenta Graduar.
 *
 * Trabalha no base da peça. Por pontos: clicar num nó abre a regra dele —
 * salto igual (um valor por salto) ou por tamanho (um valor para cada salto:
 * P→M, M→G…). Peça inteira: cresce X cm na largura e Y na altura por tamanho. Ver
 * `motores/graduacao.js`.
 *
 * Os campos são texto, e não `<input type=number>`: é preciso aceitar vírgula
 * e sinal de menos (andar para a esquerda ou para cima), e o campo numérico
 * do navegador em português engole os dois. Valem no blur ou no Enter.
 */
import { useState } from "react";
import { useDialogo } from "../../casca/Dialogo";
import type { Deslocamento, Graduacao, RegraDeGraduacao, TamanhoDoMolde } from "../../api/moldes";
import {
  avisosDaGraduacao, comRegra, graduacaoVazia, lerMedida, mudarPasso, passosDaRegra, trocarModo,
} from "../../motores/graduacao";
import type { PecaEmMontagem } from "./useMoldeEmMontagem";

interface Props {
  /** A peça no tamanho base (a linha que guarda a graduação); `null` quando ela não tem desenho no base. */
  base: PecaEmMontagem | null;
  baseDaGrade: string;
  grade: TamanhoDoMolde[];
  /** O nó clicado na mesa (a regra aberta). */
  noDaRegra: number | null;
  aoMudarGraduacao: (mudar: (g: Graduacao) => Graduacao, lembrarAntes: boolean) => void;
  /** Gerar os tamanhos desta peça, ou de todas as peças com graduação. */
  aoGerar: (todas: boolean) => void;
}

/** `valor` null: o ponto ainda não tem regra — o campo fica vazio, e qualquer número digitado, 0 inclusive, põe a regra. */
function CampoDeMedida({ valor, rotulo, aoMudar }: { valor: number | null; rotulo: string; aoMudar: (v: number) => void }) {
  // `null` = mostrando o valor guardado; texto = a pessoa está digitando.
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? (valor === null ? "" : String(Number(valor.toFixed(3))).replace(".", ","));
  const confirmar = () => {
    if (texto === null) return;
    const v = lerMedida(texto);
    if (v !== null && v !== valor) aoMudar(v);
    setTexto(null);
  };
  return (
    <input
      type="text" inputMode="decimal" value={mostrado} placeholder="0" aria-label={rotulo} aria-invalid={lerMedida(mostrado) === null}
      className="w-20!" onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function BlocoDaGraduacao({ base, baseDaGrade, grade, noDaRegra, aoMudarGraduacao, aoGerar }: Props) {
  const dialogo = useDialogo();
  const [todas, setTodas] = useState(false);

  if (!base) {
    return (
      <aside className="flex h-full w-[260px] shrink-0 flex-col gap-2 overflow-auto border-l border-linha p-3 text-[0.85rem]">
        <p className="m-0 font-semibold">Graduação</p>
        <p className="m-0 text-tinta-fraca">
          Esta peça não tem desenho no {baseDaGrade}. Escolha outro base na Grade ou junte o {baseDaGrade}.
        </p>
      </aside>
    );
  }

  const g: Graduacao = base.graduacao ?? (graduacaoVazia() as Graduacao);
  const noBase = base.tamanho;
  const regra: RegraDeGraduacao | null = noDaRegra === null ? null : g.regras.find((r) => r.no === noDaRegra) ?? null;
  const avisos: string[] = avisosDaGraduacao({ ...base, graduacao: g }, grade);

  const porRegra = (nova: RegraDeGraduacao | null) => {
    if (noDaRegra === null) return;
    aoMudarGraduacao((gg) => comRegra(gg, noDaRegra, nova), true);
  };

  const trocarModoDaRegra = async (modo: "igual" | "porTamanho") => {
    if (noDaRegra === null) return;
    if (!regra) {
      porRegra(modo === "igual"
        ? { no: noDaRegra, modo, passo: { dx: 0, dy: 0 } }
        : { no: noDaRegra, modo, deslocamentos: {} });
      return;
    }
    const r = trocarModo(regra, grade, noBase, modo);
    if (r.perdeu && !(await dialogo.confirmar(
      `Os saltos deste ponto são diferentes. No salto igual fica um só: o do ${noBase} para o tamanho seguinte. Trocar?`,
    ))) return;
    porRegra(r.regra);
  };

  const passoIgual: Deslocamento = regra?.modo === "igual" ? regra.passo : { dx: 0, dy: 0 };
  const regraPorTamanho: RegraDeGraduacao = regra?.modo === "porTamanho"
    ? regra
    : { no: noDaRegra ?? 0, modo: "porTamanho", deslocamentos: {} };
  const modoAberto = regra?.modo ?? "igual";

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col gap-3 overflow-auto border-l border-linha p-3 text-[0.85rem]">
      <div>
        <p className="m-0 font-semibold">Graduação</p>
        <p className="m-0 text-tinta-fraca">Trabalha no {noBase} (o base); os outros tamanhos aparecem tracejados.</p>
      </div>

      <fieldset className="flex flex-wrap gap-x-3 gap-y-1 border-0 p-0">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="jeito" checked={g.jeito === "pontos"}
            onChange={() => aoMudarGraduacao((gg) => ({ ...gg, jeito: "pontos" }), true)} />
          Por pontos
        </label>
        <label className="flex items-center gap-1.5" title="A peça inteira cresce centímetros fixos por tamanho, em largura e altura — como a Audaces gradua">
          <input type="radio" name="jeito" checked={g.jeito === "medida"}
            onChange={() => aoMudarGraduacao((gg) => ({ ...gg, jeito: "medida", medida: gg.medida ?? { largura: 0, altura: 0 } }), true)} />
          Peça inteira
        </label>
        {/* A porcentagem de antes só aparece no molde que já foi graduado com ela. */}
        {g.jeito === "porcentagem" && (
          <label className="flex items-center gap-1.5">
            <input type="radio" name="jeito" checked readOnly />
            Porcentagem (antiga)
          </label>
        )}
      </fieldset>

      {g.jeito === "medida" ? (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-tinta-fraca">Quanto a peça cresce a cada tamanho, do centro (negativo encolhe):</p>
          <label className="flex items-center gap-2">
            <CampoDeMedida valor={g.medida?.largura ?? 0} rotulo="Largura por tamanho"
              aoMudar={(v) => aoMudarGraduacao((gg) => ({ ...gg, medida: { largura: Math.max(-50, Math.min(50, v)), altura: gg.medida?.altura ?? 0 } }), true)} />
            cm na largura
          </label>
          <label className="flex items-center gap-2">
            <CampoDeMedida valor={g.medida?.altura ?? 0} rotulo="Altura por tamanho"
              aoMudar={(v) => aoMudarGraduacao((gg) => ({ ...gg, medida: { largura: gg.medida?.largura ?? 0, altura: Math.max(-50, Math.min(50, v)) } }), true)} />
            cm na altura
          </label>
        </div>
      ) : g.jeito === "porcentagem" ? (
        <label className="flex items-center gap-2">
          <CampoDeMedida valor={g.porcentagem} rotulo="Porcentagem por tamanho"
            aoMudar={(v) => aoMudarGraduacao((gg) => ({ ...gg, porcentagem: Math.max(-50, Math.min(50, v)) }), true)} />
          % por tamanho (a peça inteira, igual nos dois sentidos)
        </label>
      ) : noDaRegra === null ? (
        <p className="m-0 text-tinta-fraca">
          Clique num nó da peça para ver ou pôr a regra dele. {g.regras.length} ponto(s) com regra.
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-[8px] border border-linha p-2">
          <p className="m-0 font-semibold">Ponto {noDaRegra + 1}{regra ? "" : " (sem regra)"}</p>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="modo" checked={modoAberto === "igual"} onChange={() => void trocarModoDaRegra("igual")} />
              Salto igual
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="modo" checked={modoAberto === "porTamanho"} onChange={() => void trocarModoDaRegra("porTamanho")} />
              Por tamanho
            </label>
          </div>
          {modoAberto === "igual" ? (
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
              <span>→ horizontal</span>
              <CampoDeMedida valor={regra ? passoIgual.dx : null} rotulo="Anda na horizontal, em cm"
                aoMudar={(v) => porRegra({ no: noDaRegra, modo: "igual", passo: { ...passoIgual, dx: v } })} />
              <span>↓ vertical</span>
              <CampoDeMedida valor={regra ? passoIgual.dy : null} rotulo="Anda na vertical, em cm"
                aoMudar={(v) => porRegra({ no: noDaRegra, modo: "igual", passo: { ...passoIgual, dy: v } })} />
            </div>
          ) : (
            <table className="w-full">
              <thead><tr><th className="text-left">Salto</th><th>→ cm</th><th>↓ cm</th></tr></thead>
              <tbody>
                {passosDaRegra(regraPorTamanho, grade, noBase).map((p: Deslocamento & { de: string; para: string }, i: number) => (
                  <tr key={`${p.de}-${p.para}`}>
                    <td className="whitespace-nowrap pr-1">{p.de} → {p.para}</td>
                    <td><CampoDeMedida valor={p.dx} rotulo={`${p.de} para ${p.para}, horizontal`}
                      aoMudar={(v) => porRegra(mudarPasso(regraPorTamanho, grade, noBase, i, { dx: v, dy: p.dy }) as RegraDeGraduacao)} /></td>
                    <td><CampoDeMedida valor={p.dy} rotulo={`${p.de} para ${p.para}, vertical`}
                      aoMudar={(v) => porRegra(mudarPasso(regraPorTamanho, grade, noBase, i, { dx: p.dx, dy: v }) as RegraDeGraduacao)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {regra && <button type="button" className="btn ghost-danger btn-sm" onClick={() => porRegra(null)}>Tirar regra</button>}
          <p className="m-0 text-[0.78rem] text-tinta-fraca">
            Ponto que não pode sair do lugar (o meio da frente, a dobra): marque 0 e 0 — ponto sem regra acompanha os vizinhos.
          </p>
        </div>
      )}

      {avisos.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.8rem] text-ambar">
          {avisos.map((a) => <li key={a}>{a}</li>)}
          {(g.perdidos ?? 0) > 0 && (
            <li><button type="button" className="btn secondary btn-sm"
              onClick={() => aoMudarGraduacao((gg) => ({ ...gg, perdidos: 0 }), false)}>Entendi</button></li>
          )}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-1.5 border-t border-linha pt-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
          todas as peças com graduação
        </label>
        <button type="button" className="btn primary btn-sm" onClick={() => aoGerar(todas)}>Gerar tamanhos</button>
      </div>
    </aside>
  );
}
